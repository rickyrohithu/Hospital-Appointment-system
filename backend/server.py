"""
FastAPI server for Meridian Health Voice AI:
  - Validates required environment variables at startup
  - GET  /health                  -> cached (60s) health check for env, ElevenLabs, Gemini
  - GET  /api/doctors             -> specialists + slots across all 7 days
  - GET  /api/slots/{doctor_id}   -> available slots for a doctor
  - GET  /api/appointments        -> all appointments across all dates
  - GET  /api/events              -> Server-Sent Events stream
  - WS   /ws/events               -> WebSocket dashboard event stream
  - WS   /ws/voice/{session_id}   -> Isolated Pipecat voice pipeline per call
"""
import os
import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

import asyncio
import json
import sys
import time
from contextlib import asynccontextmanager
from typing import Set

import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from loguru import logger

load_dotenv()


def validate_required_env() -> None:
    """Fail loudly at startup if required API keys are missing or placeholders."""
    required = ["GOOGLE_API_KEY", "ELEVENLABS_API_KEY"]
    missing = []
    for key in required:
        val = os.environ.get(key, "").strip()
        if not val or val.startswith("your_"):
            missing.append(key)
    if missing:
        logger.critical(f"Missing or placeholder environment variables: {', '.join(missing)}. Set them in .env before starting.")
        sys.exit(1)


validate_required_env()

from backend.data.mock_data import get_all_doctors, get_slots_for_doctor, get_appointments, SLOTS
from backend.voice_pipeline import run_voice_pipeline

# ---------------------------------------------------------------------------
# Health Check Cache (60s TTL)
# ---------------------------------------------------------------------------

_HEALTH_CACHE: dict = {"ts": 0.0, "payload": None}


async def _check_elevenlabs() -> dict:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get("https://api.elevenlabs.io/v1/models", headers={"xi-api-key": key}) as resp:
                return {"reachable": resp.status in (200, 401, 403), "http_status": resp.status}
    except Exception as exc:
        return {"reachable": False, "error": str(exc)}


async def _check_gemini() -> dict:
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if groq_key:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {groq_key}"}) as resp:
                    return {"reachable": resp.status == 200, "provider": "groq", "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")}
        except Exception as exc:
            return {"reachable": False, "provider": "groq", "error": str(exc)[:180]}
    if openai_key:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {openai_key}"}) as resp:
                    return {"reachable": resp.status == 200, "provider": "openai", "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini")}
        except Exception as exc:
            return {"reachable": False, "provider": "openai", "error": str(exc)[:180]}

    from google import genai
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY", ""))
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents="ping",
        )
        return {"reachable": bool(resp.text), "provider": "gemini", "model": model_name}
    except Exception as exc:
        return {"reachable": False, "provider": "gemini", "model": model_name, "error": str(exc)[:180]}


# ---------------------------------------------------------------------------
# Event broadcast manager (WebSocket + SSE)
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_ws: Set[WebSocket] = set()
        self.active_sse: Set[asyncio.Queue] = set()

    async def connect_ws(self, ws: WebSocket):
        await ws.accept()
        self.active_ws.add(ws)
        logger.info(f"Dashboard WS connected. Total={len(self.active_ws)}")

    def disconnect_ws(self, ws: WebSocket):
        self.active_ws.discard(ws)
        logger.info(f"Dashboard WS disconnected. Total={len(self.active_ws)}")

    def register_sse(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.active_sse.add(q)
        return q

    def unregister_sse(self, q: asyncio.Queue):
        self.active_sse.discard(q)

    async def broadcast(self, data: dict):
        message = json.dumps(data)
        dead = set()
        for ws in list(self.active_ws):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.active_ws -= dead

        for q in list(self.active_sse):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                pass


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Meridian Health Voice API starting up")
    yield
    logger.info("Meridian Health Voice API shutting down cleanly")


app = FastAPI(title="Meridian Health Voice API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    now = time.monotonic()
    if _HEALTH_CACHE["payload"] and (now - _HEALTH_CACHE["ts"]) < 60.0:
        return {**_HEALTH_CACHE["payload"], "cached": True}

    el_status, gm_status = await asyncio.gather(_check_elevenlabs(), _check_gemini())
    env_ok = bool(os.environ.get("GOOGLE_API_KEY") and os.environ.get("ELEVENLABS_API_KEY"))
    overall = "ok" if (env_ok and el_status.get("reachable") and gm_status.get("reachable")) else "degraded"

    payload = {
        "status": overall,
        "env_keys_present": env_ok,
        "elevenlabs": el_status,
        "gemini": gm_status,
        "cached": False,
    }
    _HEALTH_CACHE["ts"] = now
    _HEALTH_CACHE["payload"] = payload
    return payload


@app.get("/api/doctors")
async def api_doctors():
    """Return all doctors with slots distributed across all available dates."""
    enriched = []
    for doc in get_all_doctors():
        raw_slots = SLOTS.get(doc["id"], [])
        # Group up to 4 slots per day across all 7 days so all dates show on the dashboard
        by_day: dict[str, list] = {}
        for s in raw_slots:
            day = s["datetime"].split(" ")[0]
            by_day.setdefault(day, [])
            if len(by_day[day]) < 4:
                by_day[day].append({
                    "id": s["slot_id"],
                    "date": day,
                    "time": s["datetime"].split(" ")[1],
                    "available": s["available"],
                })
        doc_slots = [slot for day_slots in by_day.values() for slot in day_slots]
        enriched.append({
            **doc,
            "photoUrl": doc.get("photo"),
            "slots": doc_slots,
        })
    return {"doctors": enriched}


@app.get("/api/slots/{doctor_id}")
async def api_slots(doctor_id: str, date: str = ""):
    slots = get_slots_for_doctor(doctor_id, date if date else None)
    return {"slots": slots}


@app.get("/api/appointments")
async def api_appointments():
    return {"appointments": get_appointments()}


@app.get("/api/events")
async def sse_events():
    q = manager.register_sse()

    async def stream():
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            manager.unregister_sse(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await manager.connect_ws(ws)
    try:
        while True:
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        manager.disconnect_ws(ws)
    except Exception as exc:
        logger.warning(f"Event WS error: {exc}")
        manager.disconnect_ws(ws)


@app.websocket("/ws/voice/{session_id}")
async def ws_voice(ws: WebSocket, session_id: str):
    await ws.accept()
    logger.info(f"[{session_id}] Voice WebSocket accepted")
    try:
        await run_voice_pipeline(
            websocket=ws,
            session_id=session_id,
            broadcast_fn=manager.broadcast,
        )
    except WebSocketDisconnect:
        logger.info(f"[{session_id}] Voice WebSocket disconnected")
    except Exception as exc:
        logger.exception(f"[{session_id}] Voice pipeline error: {exc}")
    finally:
        await manager.broadcast({"type": "call_ended", "session_id": session_id})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)
