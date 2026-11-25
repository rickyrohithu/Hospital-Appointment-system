import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, RotateCcw, X, Check, Ban } from 'lucide-react'
import type { AgentActivity, CallActionBanner, CallState, TranscriptEntry } from '../types'
import { Waveform } from './Waveform'
import { TranscriptText } from './TranscriptText'

interface CallPhoneModalProps {
  open: boolean
  callState: CallState
  activity: AgentActivity
  muted: boolean
  elapsedSeconds: number
  lastDurationSeconds: number
  localLevel: number
  remoteLevel: number
  error: string | null
  transcript: TranscriptEntry[]
  actionBanner: CallActionBanner | null
  onEndCall: () => void
  onCallAgain: () => void
  onToggleMute: () => void
  onClose: () => void
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getActivityLabel(callState: CallState, activity: AgentActivity): string {
  if (callState === 'ringing') return 'Connecting'
  if (callState === 'ended') return 'Call ended'
  if (activity === 'muted') return 'Muted'
  if (activity === 'speaking') return 'Agent speaking'
  return 'Listening'
}

export function CallPhoneModal({
  open,
  callState,
  activity,
  muted,
  elapsedSeconds,
  lastDurationSeconds,
  localLevel,
  remoteLevel,
  error,
  transcript,
  actionBanner,
  onEndCall,
  onCallAgain,
  onToggleMute,
  onClose,
}: CallPhoneModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const glowClass =
    callState === 'ringing'
      ? 'shadow-[0_0_80px_-10px_rgba(181,148,91,0.38)]'
      : callState === 'connected'
      ? 'shadow-[0_0_80px_-10px_rgba(15,92,77,0.34)]'
      : 'shadow-[0_24px_60px_-15px_rgba(14,21,18,0.22)]'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 dark:bg-black/65 backdrop-blur-sm sm:p-4"
        >
          {/* Full-screen sheet on mobile, crisp device frame on desktop */}
          <motion.div
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className={`relative w-full h-full sm:h-[640px] sm:max-w-[376px] sm:rounded-[28px] bg-paper-card dark:bg-obsidian-card border border-paper-border dark:border-obsidian-border flex flex-col justify-between overflow-hidden transition-shadow duration-500 ${glowClass}`}
            role="dialog"
            aria-modal="true"
            aria-label="Meridian Care Assistant Voice Call"
          >
            {/* Top Speaker Bar & Close */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                Encrypted voice
              </span>
              <div className="hidden sm:block w-14 h-1 rounded-full bg-paper-border dark:bg-obsidian-border" />
              <button
                type="button"
                onClick={callState === 'connected' || callState === 'ringing' ? onEndCall : onClose}
                aria-label="Close call screen"
                className="p-1.5 rounded-full text-ink-muted hover:text-ink dark:text-[#9CA8A1] dark:hover:text-[#F2EFE9] hover:bg-paper dark:hover:bg-obsidian-elevated transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Caller Identity + State */}
            <div className="px-6 pt-2 pb-3 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-hospital-soft dark:bg-[#192822] border border-paper-border dark:border-obsidian-border flex items-center justify-center text-hospital dark:text-[#6EE7B7]">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>

              <h3 className="mt-3 font-serif text-[20px] font-medium tracking-[-0.02em] text-ink dark:text-[#F2EFE9]">
                Meridian Care Assistant
              </h3>

              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                    callState === 'ringing'
                      ? 'bg-sand-soft dark:bg-[#262015] text-[#876B37] dark:text-[#D9BD82] border-[#E4D6B8] dark:border-[#3A301E]'
                      : callState === 'connected'
                      ? 'bg-hospital-soft dark:bg-[#182B24] text-hospital dark:text-[#6EE7B7] border-[#C5DDD6] dark:border-[#244337]'
                      : 'bg-paper dark:bg-obsidian-elevated text-ink-muted dark:text-[#9CA8A1] border-paper-border dark:border-obsidian-border'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      callState === 'ringing'
                        ? 'bg-sand animate-pulse'
                        : callState === 'connected'
                        ? 'bg-hospital dark:bg-[#2F9E84]'
                        : 'bg-ink-subtle'
                    }`}
                  />
                  {getActivityLabel(callState, activity)}
                </span>

                {callState === 'connected' && (
                  <span className="font-mono text-[12px] text-ink-muted dark:text-[#9CA8A1] tabular-nums">
                    {formatDuration(elapsedSeconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Center Waveform */}
            <div className="py-1">
              <Waveform
                callState={callState}
                activity={activity}
                localLevel={localLevel}
                remoteLevel={remoteLevel}
              />
            </div>

            {/* Sliding Action Confirmation / Cancellation Card */}
            <AnimatePresence>
              {actionBanner && (
                <motion.div
                  key={actionBanner.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  className={`mx-5 mb-2 p-3 rounded-[12px] border flex items-start gap-2.5 ${
                    actionBanner.type === 'booked'
                      ? 'bg-hospital-soft dark:bg-[#182B24] border-[#C5DDD6] dark:border-[#244337]'
                      : 'bg-sand-soft dark:bg-[#262015] border-[#E4D6B8] dark:border-[#3A301E]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      actionBanner.type === 'booked'
                        ? 'bg-hospital text-white'
                        : 'bg-sand text-white'
                    }`}
                  >
                    {actionBanner.type === 'booked' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 text-[12px]">
                    <div className="font-semibold text-ink dark:text-[#F2EFE9]">
                      {actionBanner.type === 'booked'
                        ? 'Appointment confirmed'
                        : 'Appointment cancelled'}
                    </div>
                    <div className="text-ink-muted dark:text-[#9CA8A1] mt-0.5">
                      {actionBanner.appointment.doctorName} · {actionBanner.appointment.date} at{' '}
                      <span className="font-mono">{actionBanner.appointment.time}</span>
                    </div>
                    <div className="font-mono text-[11px] text-ink-subtle mt-0.5">
                      {actionBanner.appointment.patientPhone}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Banner */}
            {error && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-[10px] border border-[#E4C2C2] dark:border-[#4A2A2A] bg-[#FBF2F2] dark:bg-[#261616] text-[12px] text-[#8B2E2E] dark:text-[#F09A9A]">
                {error}
              </div>
            )}

            {/* In-Phone Transcript */}
            <div className="mx-5 flex-1 min-h-0 rounded-[14px] border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated p-3.5 overflow-y-auto space-y-3">
              {callState === 'ended' && (
                <div className="py-3 px-3 rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-center">
                  <div className="text-[12px] font-semibold text-ink dark:text-[#F2EFE9]">
                    Call ended, <span className="font-mono tabular-nums">{formatDuration(lastDurationSeconds)}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted dark:text-[#9CA8A1] mt-0.5">
                    Dashboard records have been updated.
                  </div>
                </div>
              )}

              {transcript.length === 0 && callState !== 'ended' && (
                <div className="h-full flex items-center justify-center text-[12px] text-ink-subtle text-center px-4">
                  {callState === 'ringing'
                    ? 'Establishing secure voice channel…'
                    : 'Speak naturally. State your phone number when booking.'}
                </div>
              )}

              {transcript.map(entry => (
                <div key={entry.id} className="space-y-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                    {entry.speaker === 'agent' ? 'AGENT' : 'CALLER'}
                  </div>
                  <div
                    className={`text-[13px] leading-[1.55] ${
                      entry.speaker === 'agent'
                        ? 'text-ink dark:text-[#F2EFE9]'
                        : 'text-hospital dark:text-[#6EE7B7]'
                    } ${entry.interim ? 'opacity-70' : ''}`}
                  >
                    <TranscriptText text={entry.text} />
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>

            {/* Bottom Controls */}
            <div className="px-6 py-5 flex items-center justify-center gap-5">
              {callState === 'ended' ? (
                <button
                  type="button"
                  onClick={onCallAgain}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-hospital hover:bg-hospital-hover text-white text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital"
                >
                  <RotateCcw className="w-4 h-4" />
                  Call again
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    disabled={callState !== 'connected'}
                    aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital disabled:opacity-40 ${
                      muted
                        ? 'bg-[#FBF2F2] dark:bg-[#2A1818] border-[#DFB5B5] dark:border-[#532B2B] text-[#9E3535] dark:text-[#F09A9A]'
                        : 'bg-paper-elevated dark:bg-obsidian-elevated border-paper-border dark:border-obsidian-border text-ink dark:text-[#F2EFE9] hover:bg-paper dark:hover:bg-obsidian'
                    }`}
                  >
                    {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={onEndCall}
                    aria-label="End call"
                    className="w-14 h-14 rounded-full bg-[#B43C3C] hover:bg-[#992F2F] text-white flex items-center justify-center transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C3C]"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
