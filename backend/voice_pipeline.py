"""
Resilient Pipecat 1.17.0 voice pipeline for Meridian Health.

Audio flow:
  Browser Mic (16kHz PCM) -> FastAPIWebsocketInputTransport -> ElevenLabsSTTService
  -> Observability & Transcript Relay -> LLMContextAggregatorPair (Silero VAD)
  -> GoogleLLMService (with fallback + spoken error recovery)
  -> ElevenLabsTTSService -> FastAPIWebsocketOutputTransport -> Browser Speaker
"""
import asyncio
import json
import os
import time
import traceback

import aiohttp
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    EndFrame,
    ErrorFrame,
    Frame,
    InputAudioRawFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMRunFrame,
    LLMTextFrame,
    OutputAudioRawFrame,
    TTSSpeakFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TranscriptionFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

from backend.tools.appointment_tools import TOOL_REGISTRY

WATCHDOG_STALL_SECS = float(os.environ.get("WATCHDOG_STALL_SECS", "20"))
IDLE_TIMEOUT_SECS = float(os.environ.get("IDLE_TIMEOUT_SECS", "90"))


def _build_system_prompt() -> str:
    from datetime import datetime
    now = datetime.now()
    date_str = now.strftime("%A, %B %d, %Y")
    time_str = now.strftime("%I:%M %p IST")
    return f"""You are the Meridian Health Care Assistant, a calm, polite, and precise voice AI receptionist.
Your job is to help callers check doctor availability, book appointments, and cancel appointments.

Today is {date_str} and the current time is {time_str}.
Appointment slots are available Monday to Saturday, 9 AM to 5 PM (every 30 minutes).
Only future slots are available; past slots cannot be booked.

Strict rules:
- The caller is identified ONLY by the phone number they say out loud. Never ask for a login or OTP.
- Before calling book_appointment or cancel_appointment, ALWAYS read the phone number back digit by digit and ask the caller to confirm it.
- If any digit of the phone number is unclear or incomplete, ask the caller to repeat it clearly.
- Keep responses concise, natural, and warm—this is a live phone call.
- When listing slots, offer at most 3-4 options at a time and ask which they prefer.
- When calling check_doctor_availability, pass the date in YYYY-MM-DD format when known.
- After booking or cancelling, briefly confirm the doctor, date, and time.

Available specialists:
- Dr. Priya Sharma (General Physician)
- Dr. Rahul Mehta (Cardiologist)
- Dr. Anjali Rao (Dermatologist)
- Dr. Vikram Nair (Orthopedic)

Start by greeting the caller warmly on behalf of Meridian Health and asking how you can assist today."""


def classify_error(error_text: str) -> tuple[str, str]:
    """Classify an ErrorFrame message into (provider, error_type)."""
    low = error_text.lower()
    if "429" in low or "rate_limit" in low or "resource_exhausted" in low or "quota" in low:
        provider = "elevenlabs" if "elevenlabs" in low else "gemini"
        err_type = "quota_exceeded" if "quota" in low and "exceeded" in low else "429_rate_limit"
        return provider, err_type
    if "401" in low or "unauthorized" in low or "missing_permissions" in low:
        return "elevenlabs", "401_unauthorized"
    if "503" in low or "unavailable" in low:
        return "gemini", "503_unavailable"
    if "safety" in low or "blocked" in low:
        return "gemini", "safety_block"
    if "timeout" in low or "timed out" in low:
        provider = "elevenlabs" if "elevenlabs" in low else "gemini"
        return provider, "timeout"
    if "websocket" in low or "closed" in low:
        return "elevenlabs", "websocket_closed"
    if "empty" in low:
        return "gemini", "empty_response"
    return "pipeline", "unknown"


class RawPCMFrameSerializer(FrameSerializer):
    """Serializes/deserializes raw 16kHz mono Int16 PCM from the browser WebSocket."""

    def __init__(self, sample_rate: int = 16000):
        super().__init__()
        self._pcm_sample_rate = sample_rate

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes):
            return InputAudioRawFrame(
                audio=data,
                sample_rate=self._pcm_sample_rate,
                num_channels=1,
            )
        return None


class ObservabilityProcessor(FrameProcessor):
    """
    Logs STT, LLM latency, TTS lifecycle, and classifies ErrorFrames.
    Tracks activity timestamps for the pipeline watchdog and idle timeout,
    and speaks a graceful recovery line if an LLM/TTS error would leave the caller in silence.
    """

    def __init__(self, session_id: str, broadcast_fn=None, on_fatal_llm_error=None):
        super().__init__()
        self._session_id = session_id
        self._broadcast_fn = broadcast_fn
        self._on_fatal_llm_error = on_fatal_llm_error
        self._bot_buffer: list[str] = []
        self._llm_start_ts: float | None = None
        self.last_frame_at: float = time.monotonic()
        self.last_speech_at: float = time.monotonic()
        self.awaiting_llm: bool = False
        self._has_user_spoken: bool = False
        self._last_recovery_ts: float = 0.0

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        self.last_frame_at = time.monotonic()

        if isinstance(frame, UserStartedSpeakingFrame):
            self.last_speech_at = time.monotonic()
            logger.debug(f"[{self._session_id}] VAD: user started speaking")

        elif isinstance(frame, UserStoppedSpeakingFrame):
            self.last_speech_at = time.monotonic()
            logger.debug(f"[{self._session_id}] VAD: user stopped speaking")

        elif isinstance(frame, TranscriptionFrame) and frame.text.strip():
            text = frame.text.strip()
            self._has_user_spoken = True
            self.last_speech_at = time.monotonic()
            self._llm_start_ts = time.monotonic()
            self.awaiting_llm = True
            logger.info(f"[{self._session_id}] STT transcript: {text!r}")
            if self._broadcast_fn:
                await self._broadcast_fn({
                    "type": "transcript",
                    "speaker": "user",
                    "text": text,
                    "session_id": self._session_id,
                })

        elif isinstance(frame, LLMFullResponseStartFrame):
            self._bot_buffer = []
            if self._llm_start_ts is not None:
                ttft_ms = (time.monotonic() - self._llm_start_ts) * 1000
                logger.info(f"[{self._session_id}] LLM first token latency={ttft_ms:.0f}ms")

        elif isinstance(frame, LLMTextFrame):
            self._bot_buffer.append(frame.text)

        elif isinstance(frame, LLMFullResponseEndFrame):
            self.awaiting_llm = False
            full_text = "".join(self._bot_buffer).strip()
            self._bot_buffer = []
            total_ms = (time.monotonic() - self._llm_start_ts) * 1000 if self._llm_start_ts else 0
            self._llm_start_ts = None

            if not full_text:
                logger.warning(f"[{self._session_id}] LLM response empty after {total_ms:.0f}ms")
            else:
                logger.info(f"[{self._session_id}] LLM response ({total_ms:.0f}ms): {full_text!r}")
                if self._broadcast_fn:
                    await self._broadcast_fn({
                        "type": "transcript",
                        "speaker": "bot",
                        "text": full_text,
                        "session_id": self._session_id,
                    })

        elif isinstance(frame, TTSStartedFrame):
            self.last_speech_at = time.monotonic()
            logger.debug(f"[{self._session_id}] TTS started")

        elif isinstance(frame, TTSStoppedFrame):
            self.last_speech_at = time.monotonic()
            logger.debug(f"[{self._session_id}] TTS stopped")

        elif isinstance(frame, ErrorFrame):
            self.awaiting_llm = False
            provider, err_type = classify_error(str(frame.error))
            logger.error(
                f"[{self._session_id}] Pipeline ErrorFrame provider={provider} type={err_type} fatal={frame.fatal}: {frame.error}"
            )
            now = time.monotonic()
            if provider == "gemini" and (now - self._last_recovery_ts) > 5.0:
                self._last_recovery_ts = now
                if self._on_fatal_llm_error:
                    asyncio.create_task(self._on_fatal_llm_error(self._has_user_spoken))

        await self.push_frame(frame, direction)


def _build_tools_schema() -> ToolsSchema:
    return ToolsSchema(
        standard_tools=[
            FunctionSchema(
                name="check_doctor_availability",
                description="Check available appointment slots for a doctor by name, speciality, and/or date.",
                properties={
                    "doctor_name": {"type": "string", "description": "Doctor name, e.g. 'Priya' or 'Dr. Mehta'."},
                    "speciality": {"type": "string", "description": "Speciality, e.g. 'Cardiologist'."},
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD format, e.g. '2026-11-26'."},
                },
                required=[],
            ),
            FunctionSchema(
                name="book_appointment",
                description="Book an appointment slot using the caller's spoken phone number after confirming it.",
                properties={
                    "slot_id": {"type": "string", "description": "Slot ID from check_doctor_availability."},
                    "phone_number": {"type": "string", "description": "Caller's confirmed phone number."},
                    "patient_name": {"type": "string", "description": "Optional caller name."},
                },
                required=["slot_id", "phone_number"],
            ),
            FunctionSchema(
                name="cancel_appointment",
                description="Cancel the caller's most recent active appointment by phone number after confirming it.",
                properties={
                    "phone_number": {"type": "string", "description": "Caller's confirmed phone number."},
                },
                required=["phone_number"],
            ),
        ]
    )


async def run_voice_pipeline(websocket, session_id: str, broadcast_fn=None):
    """Run an isolated Pipecat voice pipeline for one call session with full cleanup."""
    session_start = time.monotonic()
    logger.info(f"[{session_id}] Session starting")

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_enabled=True,
            audio_out_sample_rate=16000,
            add_wav_header=False,
            serializer=RawPCMFrameSerializer(sample_rate=16000),
            session_timeout=300,
        ),
    )

    primary_model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
    watchdog_task: asyncio.Task | None = None
    task: PipelineTask | None = None

    async with aiohttp.ClientSession() as aiohttp_session:
        stt = ElevenLabsSTTService(
            api_key=os.environ["ELEVENLABS_API_KEY"],
            aiohttp_session=aiohttp_session,
            model="scribe_v1",
            sample_rate=16000,
        )
        logger.info(f"[{session_id}] ElevenLabs STT initialized (model=scribe_v1, rate=16000)")

        tts = ElevenLabsTTSService(
            api_key=os.environ["ELEVENLABS_API_KEY"],
            voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
            model="eleven_turbo_v2_5",
            sample_rate=16000,
        )
        logger.info(f"[{session_id}] ElevenLabs TTS initialized (model=eleven_turbo_v2_5, rate=16000)")

        llm = GoogleLLMService(
            api_key=os.environ["GOOGLE_API_KEY"],
            model=primary_model,
            stream_idle_timeout_secs=25.0,
            retry_on_timeout=True,
        )
        logger.info(f"[{session_id}] Google LLM initialized (model={primary_model})")

        for tool_name in ("check_doctor_availability", "book_appointment", "cancel_appointment"):
            llm.register_function(tool_name, _make_tool_handler(tool_name, broadcast_fn, session_id))

        messages = [{"role": "system", "content": _build_system_prompt()}]
        context = LLMContext(messages, tools=_build_tools_schema())
        context_aggregator = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                vad_analyzer=SileroVADAnalyzer(
                    params=VADParams(
                        confidence=0.6,
                        start_secs=0.2,
                        stop_secs=0.4,
                        min_volume=0.45,
                    )
                ),
            ),
        )

        async def speak_llm_recovery(has_user_spoken: bool = True):
            if task:
                if not has_user_spoken:
                    logger.warning(f"[{session_id}] Initial LLM greeting failed; speaking static welcome greeting")
                    await task.queue_frames([
                        TTSSpeakFrame("Hello, thank you for calling Meridian Health Care Desk. How may I assist you today?")
                    ])
                else:
                    logger.warning(f"[{session_id}] Speaking graceful LLM recovery prompt")
                    await task.queue_frames([
                        TTSSpeakFrame("I'm having a brief connection delay. Could you please say that once more?")
                    ])

        observer = ObservabilityProcessor(
            session_id=session_id,
            broadcast_fn=broadcast_fn,
            on_fatal_llm_error=speak_llm_recovery,
        )

        pipeline = Pipeline(
            [
                transport.input(),
                stt,
                observer,
                context_aggregator.user(),
                llm,
                tts,
                transport.output(),
                context_aggregator.assistant(),
            ]
        )

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=True,
                audio_in_sample_rate=16000,
                audio_out_sample_rate=16000,
            ),
        )

        async def _watchdog_loop():
            try:
                while True:
                    await asyncio.sleep(3.0)
                    now = time.monotonic()
                    if observer.awaiting_llm and (now - observer.last_frame_at) > WATCHDOG_STALL_SECS:
                        logger.error(f"[{session_id}] Watchdog: pipeline stalled for >{WATCHDOG_STALL_SECS}s during LLM turn")
                        observer.awaiting_llm = False
                        await speak_llm_recovery()

                    if (now - observer.last_speech_at) > IDLE_TIMEOUT_SECS:
                        logger.info(f"[{session_id}] Idle timeout reached ({IDLE_TIMEOUT_SECS}s); ending call politely")
                        await task.queue_frames([
                            TTSSpeakFrame("I haven't heard from you for a moment. Thank you for calling Meridian Health. Goodbye."),
                            EndFrame(),
                        ])
                        break
            except asyncio.CancelledError:
                pass

        @transport.event_handler("on_client_connected")
        async def on_connected(transport_, client):
            logger.info(f"[{session_id}] Client connected; signaling bot_ready and starting greeting")
            try:
                await websocket.send_text(json.dumps({"type": "bot_ready", "session_id": session_id}))
            except Exception:
                pass
            if broadcast_fn:
                await broadcast_fn({"type": "call_started", "session_id": session_id})
            await task.queue_frames([LLMRunFrame()])

        @transport.event_handler("on_client_disconnected")
        async def on_disconnected(transport_, client):
            logger.info(f"[{session_id}] Client disconnected")
            if broadcast_fn:
                await broadcast_fn({"type": "call_ended", "session_id": session_id})
            await task.queue_frames([EndFrame()])

        watchdog_task = asyncio.create_task(_watchdog_loop())
        runner = PipelineRunner(handle_sigint=False)
        try:
            await runner.run(task)
        except Exception as exc:
            logger.error(f"[{session_id}] Pipeline exception: {exc}\n{traceback.format_exc()}")
        finally:
            if watchdog_task and not watchdog_task.done():
                watchdog_task.cancel()
            if task:
                try:
                    await task.cancel()
                except Exception:
                    pass
            duration = time.monotonic() - session_start
            logger.info(f"[{session_id}] Session cleaned up (duration={duration:.1f}s)")


def _make_tool_handler(tool_name: str, broadcast_fn, session_id: str):
    """Wrap tool execution with structured logging, exception safety, and dashboard events."""
    tool_fn = TOOL_REGISTRY[tool_name]

    async def handler(params: FunctionCallParams):
        arguments = dict(params.arguments)
        t0 = time.monotonic()
        logger.info(f"[{session_id}] Tool call -> {tool_name} args={arguments}")
        try:
            result = tool_fn(**arguments)
        except Exception as exc:
            logger.error(f"[{session_id}] Unhandled tool exception in {tool_name}: {exc}\n{traceback.format_exc()}")
            result = {"success": False, "message": "Internal error executing tool. Please try again."}

        elapsed_ms = (time.monotonic() - t0) * 1000
        logger.info(f"[{session_id}] Tool result <- {tool_name} ({elapsed_ms:.1f}ms) success={result.get('success')}")

        if broadcast_fn:
            await broadcast_fn({
                "type": "tool_called",
                "tool": tool_name,
                "result": result,
                "session_id": session_id,
            })
        await params.result_callback(result)

    return handler
