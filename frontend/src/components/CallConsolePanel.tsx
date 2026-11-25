import { useEffect, useRef } from 'react'
import { PhoneCall } from 'lucide-react'
import type { AgentActivity, CallState, TranscriptEntry } from '../types'
import { Waveform } from './Waveform'
import { TranscriptText } from './TranscriptText'

interface CallConsolePanelProps {
  callState: CallState
  activity: AgentActivity
  localLevel: number
  remoteLevel: number
  transcript: TranscriptEntry[]
  onStartCall: () => void
}

export function CallConsolePanel({
  callState,
  activity,
  localLevel,
  remoteLevel,
  transcript,
  onStartCall,
}: CallConsolePanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  return (
    <section className="bg-paper-card dark:bg-obsidian-card border border-paper-border dark:border-obsidian-border rounded-[14px] overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-paper-border dark:border-obsidian-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-[19px] font-medium tracking-[-0.02em] text-ink dark:text-[#F2EFE9]">
            Live transcript
          </h2>
          <p className="text-[12px] text-ink-muted dark:text-[#9CA8A1]">
            Caller and agent conversation stream
          </p>
        </div>

        <div className="flex items-center gap-3">
          {callState === 'connected' && (
            <div className="hidden sm:block w-28">
              <Waveform
                callState={callState}
                activity={activity}
                localLevel={localLevel}
                remoteLevel={remoteLevel}
              />
            </div>
          )}
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated text-ink-muted dark:text-[#9CA8A1] tabular-nums">
            {callState === 'connected'
              ? activity === 'speaking'
                ? 'Speaking'
                : activity === 'muted'
                ? 'Muted'
                : 'Listening'
              : `${transcript.length} turns`}
          </span>
        </div>
      </div>

      <div className="p-5 h-[250px] overflow-y-auto space-y-4 bg-paper-elevated/60 dark:bg-obsidian-elevated/40">
        {transcript.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2.5">
            <p className="text-[13px] text-ink-muted dark:text-[#9CA8A1]">
              {callState === 'connected'
                ? 'Listening for caller speech…'
                : 'No active conversation. Start a call to inspect live turns.'}
            </p>
            {callState === 'idle' && (
              <button
                type="button"
                onClick={onStartCall}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-[12px] font-medium text-ink dark:text-[#F2EFE9] hover:border-hospital transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5 text-hospital dark:text-[#6EE7B7]" />
                Start call
              </button>
            )}
          </div>
        ) : (
          transcript.map(entry => (
            <div key={entry.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  {entry.speaker === 'agent' ? 'AGENT' : 'CALLER'}
                </span>
                <span className="font-mono text-[10px] text-ink-subtle tabular-nums">
                  {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>
              <p
                className={`text-[13px] leading-[1.6] ${
                  entry.speaker === 'agent'
                    ? 'text-ink dark:text-[#F2EFE9]'
                    : 'text-hospital dark:text-[#6EE7B7]'
                } ${entry.interim ? 'opacity-70' : ''}`}
              >
                <TranscriptText text={entry.text} />
              </p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
