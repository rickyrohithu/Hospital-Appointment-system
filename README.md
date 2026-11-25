# Meridian Health — Voice AI Doctor Appointment Assistant

A real-time voice appointment booking system built with **Pipecat** (Python) and **React + TypeScript + Tailwind CSS**.

---

## Architecture

```
Browser (React / TypeScript)
  ├── WS  /ws/voice/{session_id}  ──► Pipecat Pipeline (16kHz PCM)
  │                                     Silero VAD
  │                                     → ElevenLabs STT (scribe_v1)
  │                                     → Gemini LLM (function calling)
  │                                     → ElevenLabs TTS (eleven_turbo_v2_5)
  ├── WS  /ws/events              ◄── Live transcript & booking/cancel events
  ├── GET /api/events             ◄── SSE fallback event stream
  └── GET /api/doctors, /appointments, /health
```

## Quick Start (Local)

```bash
cp .env.example .env
# Fill in GOOGLE_API_KEY and ELEVENLABS_API_KEY

./start.sh
```

- **Frontend**: `http://localhost:5173`
- **Backend**: `http://localhost:8000`
- **Health Check**: `http://localhost:8000/health`

---

## Free-Tier Limits & Switching Models

| Provider | Free Tier Notes | Env Var to Switch |
|----------|----------------|-------------------|
| **Google Gemini** | `gemini-2.5-flash` has a 20 req/day free limit on some keys; `gemini-3.5-flash` / `gemini-3.1-flash-lite` offer higher limits. | `GEMINI_MODEL=gemini-3.5-flash` |
| **ElevenLabs** | 10,000 characters/month on free tier; scoped keys must enable **Speech-to-Text** and **Text-to-Speech** permissions. | `ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL` |

---

## Running 24/7 (Docker & Cloud Hosting)

### Docker Compose
```bash
docker compose up -d --build
```
Includes `restart: unless-stopped`, graceful shutdown (`15s`), and a `/health` healthcheck.

### Deploying to Render / Railway / Fly.io
1. Push this repo to GitHub (never commit `.env`).
2. **Backend**: Deploy the root `Dockerfile` as a Web Service on Render/Railway/Fly.io. Set `GOOGLE_API_KEY`, `ELEVENLABS_API_KEY`, and `GEMINI_MODEL=gemini-3.5-flash` in the host's Environment Variables.
3. **Frontend**: Deploy `frontend/` as a Static Site (build command: `npm run build`, publish dir: `dist`) with `VITE_BACKEND_URL=https://your-backend-url`.
4. **Prevent Free-Tier Sleep**: Free instances on Render sleep after 15 minutes of inactivity. Configure an external uptime monitor (e.g., UptimeRobot or cron) to `GET https://your-backend-url/health` every 10 minutes (the `/health` response is cached for 60 seconds so it will not exhaust your Gemini quota).

---

## Troubleshooting

| Symptom | Where to Check | Root Cause & Fix |
|---------|---------------|-----------------|
| **Agent is silent on greeting** | `/health` → `gemini.reachable` or log line `Pipeline ErrorFrame provider=gemini type=429_rate_limit` | Gemini free-tier quota exceeded (429). Switch `GEMINI_MODEL` in `.env` (e.g. `gemini-3.5-flash`) and restart. |
| **Agent is silent after speaking** | Log line `provider=elevenlabs type=401_unauthorized` or `quota_exceeded` | ElevenLabs key missing TTS/STT permissions or out of characters. Create an unrestricted key in ElevenLabs. |
| **No caller transcript appears** | Log line `STT transcript:` missing while `VAD: user started speaking` fires | Microphone is muted, wrong input device selected, or `ELEVENLABS_API_KEY` lacks `speech_to_text` scope. |
| **Stuck on "Connecting"** | Browser console WebSocket error or log missing `Voice WebSocket accepted` | Backend not running on `:8000` or `uvicorn` hung on reload. Ensure `reload=False` and check `curl http://localhost:8000/health`. |
| **One-sided audio (mic echo or no TTS)** | Browser DevTools AudioContext state or `usePipecatCall.ts` | Browser suspended `AudioContext` (autoplay policy) or wrong sample rate. Click **Try Call** directly so user gesture unlocks audio. |
| **Watchdog recovery message plays** | Log line `Watchdog: pipeline stalled for >20s` | Upstream LLM stream stalled. Check network connectivity and `/health`. |
