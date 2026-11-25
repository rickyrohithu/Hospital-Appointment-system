// Web Audio API synthesis for subtle clinical ring and hang-up tones (no external assets)

let sharedAudioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return null
    sharedAudioCtx = new AudioCtor()
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {})
  }
  return sharedAudioCtx
}

export function playRingTone(enabled: boolean): () => void {
  if (!enabled) return () => {}
  const ctx = getCtx()
  if (!ctx) return () => {}

  let active = true
  const playBurst = () => {
    if (!active) return
    const now = ctx.currentTime
    // Dual-tone soft chime (440Hz + 480Hz) at very low gain
    ;[440, 480].forEach(freq => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.6)
    })
  }

  playBurst()
  const timer = window.setInterval(playBurst, 1500)

  return () => {
    active = false
    window.clearInterval(timer)
  }
}

export function playEndCallTone(enabled: boolean): void {
  if (!enabled) return
  const ctx = getCtx()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(380, now)
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.22)
  gain.gain.setValueAtTime(0.03, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.25)
}
