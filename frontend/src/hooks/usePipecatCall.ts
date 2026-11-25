import { useCallback, useEffect, useRef, useState } from 'react'
import { getWsBaseUrl } from '../lib/api'
import { playEndCallTone, playRingTone } from '../lib/sound'
import type { AgentActivity, CallState, TranscriptEntry } from '../types'

const SAMPLE_RATE = 16000

interface UsePipecatCallOptions {
  demoMode: boolean
  soundEnabled: boolean
  onTranscriptFromServer?: (entry: TranscriptEntry) => void
  onCallEnded?: () => void
  onDemoAction?: (type: 'booked' | 'cancelled') => void
}

export interface UsePipecatCallReturn {
  callState: CallState
  activity: AgentActivity
  muted: boolean
  elapsedSeconds: number
  lastDurationSeconds: number
  localLevel: number
  remoteLevel: number
  error: string | null
  transcript: TranscriptEntry[]
  pushTranscript: (speaker: 'caller' | 'agent', text: string, interim?: boolean) => void
  startCall: () => Promise<void>
  endCall: () => void
  toggleMute: () => void
  resetToIdle: () => void
}

export function usePipecatCall({
  demoMode,
  soundEnabled,
  onCallEnded,
  onDemoAction,
}: UsePipecatCallOptions): UsePipecatCallReturn {
  const [callState, setCallState] = useState<CallState>('idle')
  const [activity, setActivity] = useState<AgentActivity>('connecting')
  const [muted, setMuted] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastDurationSeconds, setLastDurationSeconds] = useState(0)
  const [localLevel, setLocalLevel] = useState(0)
  const [remoteLevel, setRemoteLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const stopRingRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const demoTimersRef = useRef<number[]>([])
  const elapsedRef = useRef(0)
  // Debounce timer for speaking→listening transition.
  // Prevents flicker when there are brief silent gaps between bot words/sentences.
  const speakingDebounceRef = useRef<number | null>(null)
  const SPEAKING_HOLD_MS = 800 // Stay in "speaking" state for 800ms after last audio

  const pushTranscript = useCallback((speaker: 'caller' | 'agent', text: string, interim = false) => {
    const clean = text.trim()
    if (!clean) return
    setTranscript(prev => {
      // Replace trailing interim message for the same speaker when streaming
      const last = prev[prev.length - 1]
      if (last && last.interim && last.speaker === speaker) {
        return [...prev.slice(0, -1), { ...last, text: clean, interim, timestamp: Date.now() }]
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean,
          interim,
          timestamp: Date.now(),
        },
      ]
    })
  }, [])

  const cleanupMediaAndTimers = useCallback(() => {
    stopRingRef.current?.()
    stopRingRef.current = null

    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    demoTimersRef.current.forEach(id => window.clearTimeout(id))
    demoTimersRef.current = []

    if (speakingDebounceRef.current) {
      window.clearTimeout(speakingDebounceRef.current)
      speakingDebounceRef.current = null
    }

    activeSourcesRef.current.forEach(s => {
      try { s.stop() } catch { /* noop */ }
    })
    activeSourcesRef.current = []
    nextPlayTimeRef.current = 0

    processorRef.current?.disconnect()
    processorRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    gainRef.current?.disconnect()
    gainRef.current = null
    localAnalyserRef.current = null
    remoteAnalyserRef.current = null

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close()
      }
    }
    wsRef.current = null

    setLocalLevel(0)
    setRemoteLevel(0)
  }, [])

  useEffect(() => {
    return () => cleanupMediaAndTimers()
  }, [cleanupMediaAndTimers])

  // Real-time audio level meter driven by AnalyserNodes (throttled to ~12Hz to avoid 60fps React re-renders)
  const startMeterLoop = useCallback(() => {
    const dataLocal = new Uint8Array(64)
    const dataRemote = new Uint8Array(64)
    let lastEmit = 0

    const tick = (ts: number) => {
      if (ts - lastEmit >= 85) {
        lastEmit = ts
        if (localAnalyserRef.current) {
          localAnalyserRef.current.getByteTimeDomainData(dataLocal)
          let sum = 0
          for (let i = 0; i < dataLocal.length; i++) {
            const v = (dataLocal[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / dataLocal.length)
          setLocalLevel(Math.min(1, rms * 4.5))
        }
        if (remoteAnalyserRef.current) {
          remoteAnalyserRef.current.getByteTimeDomainData(dataRemote)
          let sum = 0
          for (let i = 0; i < dataRemote.length; i++) {
            const v = (dataRemote[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / dataRemote.length)
          const level = Math.min(1, rms * 4.5)
          setRemoteLevel(level)
          if (level > 0.04) {
            // Bot is producing audio — immediately show "speaking"
            // and clear any pending debounce to "listening"
            if (speakingDebounceRef.current) {
              window.clearTimeout(speakingDebounceRef.current)
              speakingDebounceRef.current = null
            }
            setActivity('speaking')
          } else {
            // Audio dropped — but DON'T switch to "listening" immediately.
            // Wait SPEAKING_HOLD_MS to absorb gaps between words/sentences.
            setActivity(prev => {
              if (prev === 'muted') return 'muted'
              if (prev === 'speaking' && !speakingDebounceRef.current) {
                speakingDebounceRef.current = window.setTimeout(() => {
                  speakingDebounceRef.current = null
                  setActivity(cur => (cur === 'speaking' ? 'listening' : cur))
                }, SPEAKING_HOLD_MS)
              }
              return prev // keep current state until debounce fires
            })
          }
        }
      }
      rafRef.current = window.requestAnimationFrame(tick)
    }
    rafRef.current = window.requestAnimationFrame(tick)
  }, [])

  const startCallTimer = useCallback(() => {
    elapsedRef.current = 0
    setElapsedSeconds(0)
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsedSeconds(elapsedRef.current)
    }, 1000)
  }, [])

  const runSimulatedDemoCall = useCallback(() => {
    setCallState('ringing')
    setActivity('connecting')
    stopRingRef.current = playRingTone(soundEnabled)

    const tConnect = window.setTimeout(() => {
      stopRingRef.current?.()
      stopRingRef.current = null
      setCallState('connected')
      setActivity('speaking')
      startCallTimer()
      pushTranscript('agent', 'Good afternoon, Meridian Health Care Desk. How may I assist you today?')
    }, 1400)

    const t1 = window.setTimeout(() => {
      setActivity('listening')
      pushTranscript('caller', 'Hello, I would like to check Dr. Rahul Mehta availability for tomorrow.')
    }, 3800)

    const t2 = window.setTimeout(() => {
      setActivity('speaking')
      pushTranscript('agent', 'Dr. Rahul Mehta has slots tomorrow at 09:00, 09:30, and 14:00. May I have your phone number to confirm?')
    }, 6200)

    const t3 = window.setTimeout(() => {
      setActivity('listening')
      pushTranscript('caller', 'Yes, 9876543210, please book 09:30.')
    }, 9200)

    const t4 = window.setTimeout(() => {
      setActivity('speaking')
      pushTranscript('agent', 'Confirming your number 9876543210. Your appointment with Dr. Rahul Mehta at 09:30 is booked.')
      onDemoAction?.('booked')
    }, 11800)

    demoTimersRef.current = [tConnect, t1, t2, t3, t4]
  }, [onDemoAction, pushTranscript, soundEnabled, startCallTimer])

  const startCall = useCallback(async () => {
    if (callState === 'ringing' || callState === 'connected') return

    setError(null)
    setTranscript([])
    setMuted(false)

    if (demoMode) {
      runSimulatedDemoCall()
      return
    }

    setCallState('ringing')
    setActivity('connecting')
    stopRingRef.current = playRingTone(soundEnabled)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
    } catch {
      cleanupMediaAndTimers()
      setError('Microphone permission denied. Allow microphone access in browser settings to start a voice call.')
      setCallState('idle')
      return
    }

    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioCtx = new AudioCtor({ sampleRate: SAMPLE_RATE })
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }
      audioCtxRef.current = audioCtx
      nextPlayTimeRef.current = audioCtx.currentTime

      const remoteAnalyser = audioCtx.createAnalyser()
      remoteAnalyser.fftSize = 128
      remoteAnalyser.connect(audioCtx.destination)
      remoteAnalyserRef.current = remoteAnalyser

      const sessionId = crypto.randomUUID()
      const ws = new WebSocket(`${getWsBaseUrl()}/ws/voice/${sessionId}`)
      wsRef.current = ws
      ws.binaryType = 'arraybuffer'

      let botReady = false

      const markBotReady = () => {
        if (botReady) return
        botReady = true
        stopRingRef.current?.()
        stopRingRef.current = null
        setCallState('connected')
        setActivity('listening')
        startCallTimer()
      }

      ws.onopen = () => {
        const source = audioCtx.createMediaStreamSource(stream)
        sourceRef.current = source

        const localAnalyser = audioCtx.createAnalyser()
        localAnalyser.fftSize = 128
        localAnalyserRef.current = localAnalyser

        const processor = audioCtx.createScriptProcessor(1024, 1, 1)
        processorRef.current = processor

        // Silent GainNode keeps ScriptProcessor firing without routing mic audio to speakers
        const silentGain = audioCtx.createGain()
        silentGain.gain.value = 0
        gainRef.current = silentGain

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]))
            pcm[i] = s < 0 ? s * 32768 : s * 32767
          }
          ws.send(pcm.buffer)
        }

        source.connect(localAnalyser)
        localAnalyser.connect(processor)
        processor.connect(silentGain)
        silentGain.connect(audioCtx.destination)

        startMeterLoop()
      }

      // Handle bot_ready JSON control messages + raw 16kHz Int16 PCM audio
      ws.onmessage = async (e) => {
        if (typeof e.data === 'string') {
          try {
            const ctrl = JSON.parse(e.data) as { type?: string }
            if (ctrl.type === 'bot_ready') {
              markBotReady()
            }
          } catch {
            // Ignore non-JSON text frames
          }
          return
        }

        if (!(e.data instanceof ArrayBuffer)) return
        // If audio arrives before explicit bot_ready, promote immediately
        markBotReady()

        const ctx = audioCtxRef.current
        if (!ctx || ctx.state === 'closed') return
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }

        const byteLen = e.data.byteLength
        if (byteLen < 2) return

        const sampleCount = Math.floor(byteLen / 2)
        const int16 = new Int16Array(e.data, 0, sampleCount)
        const float32 = new Float32Array(sampleCount)
        for (let i = 0; i < sampleCount; i++) {
          float32[i] = int16[i] / 32768
        }

        const buffer = ctx.createBuffer(1, sampleCount, SAMPLE_RATE)
        buffer.getChannelData(0).set(float32)

        const src = ctx.createBufferSource()
        src.buffer = buffer
        if (remoteAnalyserRef.current) {
          src.connect(remoteAnalyserRef.current)
        } else {
          src.connect(ctx.destination)
        }

        const now = ctx.currentTime
        if (nextPlayTimeRef.current < now) {
          nextPlayTimeRef.current = now + 0.02
        }
        src.start(nextPlayTimeRef.current)
        nextPlayTimeRef.current += buffer.duration

        activeSourcesRef.current.push(src)
        src.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src)
        }
      }

      ws.onerror = () => {
        setError('Voice connection interrupted. Check that the backend server is running.')
      }

      ws.onclose = () => {
        setLastDurationSeconds(elapsedRef.current)
        cleanupMediaAndTimers()
        setCallState(prev => (prev === 'idle' ? 'idle' : 'ended'))
        onCallEnded?.()
      }
    } catch {
      cleanupMediaAndTimers()
      setError('Unable to reach the voice server.')
      setCallState('idle')
    }
  }, [callState, cleanupMediaAndTimers, demoMode, onCallEnded, runSimulatedDemoCall, soundEnabled, startCallTimer, startMeterLoop])

  const endCall = useCallback(() => {
    playEndCallTone(soundEnabled)
    setLastDurationSeconds(elapsedRef.current)
    cleanupMediaAndTimers()
    setCallState('ended')
    onCallEnded?.()
  }, [cleanupMediaAndTimers, onCallEnded, soundEnabled])

  const toggleMute = useCallback(() => {
    if (!streamRef.current && !demoMode) return
    const nextMuted = !muted
    streamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted
    })
    setMuted(nextMuted)
    setActivity(nextMuted ? 'muted' : 'listening')
  }, [demoMode, muted])

  const resetToIdle = useCallback(() => {
    cleanupMediaAndTimers()
    setError(null)
    setCallState('idle')
  }, [cleanupMediaAndTimers])

  return {
    callState,
    activity,
    muted,
    elapsedSeconds,
    lastDurationSeconds,
    localLevel,
    remoteLevel,
    error,
    transcript,
    pushTranscript,
    startCall,
    endCall,
    toggleMute,
    resetToIdle,
  }
}
