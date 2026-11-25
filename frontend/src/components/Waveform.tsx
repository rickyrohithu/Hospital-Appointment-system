import type { AgentActivity, CallState } from '../types'

interface WaveformProps {
  callState: CallState
  activity: AgentActivity
  localLevel: number
  remoteLevel: number
}

const BARS = 25

export function Waveform({ callState, activity, localLevel, remoteLevel }: WaveformProps) {
  const activeLevel =
    callState !== 'connected'
      ? 0.08
      : activity === 'speaking'
      ? Math.max(0.24, remoteLevel)
      : activity === 'muted'
      ? 0.04
      : Math.max(0.14, localLevel)

  return (
    <div
      className="flex items-center justify-center gap-[3px] h-10 px-4"
      aria-label="Audio level waveform"
    >
      {Array.from({ length: BARS }).map((_, i) => {
        const centerDist = Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2)
        const envelope = 1 - centerDist * 0.65
        const harmonic = 0.65 + 0.35 * Math.sin(i * 0.9 + activeLevel * 10)
        const scale =
          callState === 'ringing'
            ? 0.25 + 0.14 * Math.sin(i * 0.7)
            : callState === 'ended'
            ? 0.12
            : Math.min(1, Math.max(0.14, activeLevel * envelope * harmonic))

        const isSpeaking = activity === 'speaking' && callState === 'connected'

        return (
          <span
            key={i}
            style={{
              transform: `scaleY(${scale.toFixed(3)})`,
            }}
            className={`w-[2.5px] h-9 rounded-full origin-center transition-transform duration-100 ease-out will-change-transform ${
              callState === 'ringing'
                ? 'bg-[#B5945B]'
                : activity === 'muted' || callState === 'ended'
                ? 'bg-[#C9C3B8] dark:bg-[#2F3B35]'
                : isSpeaking
                ? 'bg-[#0F5C4D] dark:bg-[#2F9E84]'
                : 'bg-[#3D7A6C] dark:bg-[#4FB099]'
            }`}
          />
        )
      })}
    </div>
  )
}
