import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Appointment } from '../types'

interface AppointmentsTableProps {
  appointments: Appointment[]
  loading: boolean
  highlightedId: string | null
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return 'Just now'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function AppointmentsTable({
  appointments,
  loading,
  highlightedId,
}: AppointmentsTableProps) {
  const sorted = useMemo(
    () => [...appointments].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [appointments]
  )

  return (
    <section className="bg-paper-card dark:bg-obsidian-card border border-paper-border dark:border-obsidian-border rounded-[14px] overflow-hidden">
      <div className="px-5 py-4 border-b border-paper-border dark:border-obsidian-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-[19px] font-medium tracking-[-0.02em] text-ink dark:text-[#F2EFE9]">
            Appointments
          </h2>
          <p className="text-[12px] text-ink-muted dark:text-[#9CA8A1]">
            Updates automatically after every booking or cancellation
          </p>
        </div>
        <span className="font-mono text-[11px] px-2.5 py-1 rounded-full border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated text-ink-muted dark:text-[#9CA8A1] tabular-nums">
          {appointments.length} total
        </span>
      </div>

      {loading ? (
        <div className="p-5 space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-[10px] bg-paper dark:bg-obsidian-elevated animate-pulse"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-12 px-6 flex flex-col items-center text-center">
          {/* Calm minimal line art */}
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            className="text-ink-subtle mb-3"
            aria-hidden="true"
          >
            <rect x="7" y="10" width="30" height="27" rx="5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M7 18H37" stroke="currentColor" strokeWidth="1.25" />
            <path d="M15 6V12M29 6V12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            <path d="M16 26H28" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <div className="text-[13px] font-medium text-ink dark:text-[#F2EFE9]">
            No appointments yet
          </div>
          <p className="mt-1 text-[12px] text-ink-muted dark:text-[#9CA8A1] max-w-[260px]">
            Start a voice call to check availability and confirm a booking.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop dense table */}
          <div className="hidden md:block max-h-[290px] overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-paper-elevated dark:bg-obsidian-elevated border-b border-paper-border dark:border-obsidian-border z-10">
                <tr className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-subtle">
                  <th className="py-2.5 px-5">Doctor</th>
                  <th className="py-2.5 px-3">Date &amp; time</th>
                  <th className="py-2.5 px-3">Caller phone</th>
                  <th className="py-2.5 px-3">Updated</th>
                  <th className="py-2.5 px-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border dark:divide-obsidian-border text-[13px]">
                {sorted.map(appt => {
                  const isBooked = appt.status === 'booked'
                  const isHighlighted = highlightedId === appt.id

                  return (
                    <motion.tr
                      key={appt.id}
                      initial={isHighlighted ? { backgroundColor: isBooked ? 'rgba(15, 92, 77, 0.14)' : 'rgba(181, 148, 91, 0.18)' } : false}
                      animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
                      transition={{ duration: 1.8, ease: 'easeOut' }}
                      className="hover:bg-paper-elevated/70 dark:hover:bg-obsidian-elevated/60 transition-colors"
                    >
                      <td className="py-3 px-5">
                        <div className="font-semibold text-ink dark:text-[#F2EFE9]">
                          {appt.doctorName}
                        </div>
                        <div className="text-[11px] text-ink-muted dark:text-[#9CA8A1]">
                          {appt.speciality}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[12px] text-ink dark:text-[#F2EFE9] tabular-nums whitespace-nowrap">
                        {appt.date} · {appt.time}
                      </td>
                      <td className="py-3 px-3 font-mono text-[12px] text-ink-muted dark:text-[#9CA8A1] tabular-nums whitespace-nowrap">
                        {appt.patientPhone}
                      </td>
                      <td className="py-3 px-3 text-[12px] text-ink-subtle whitespace-nowrap">
                        {formatRelativeTime(appt.updatedAt)}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            isBooked
                              ? 'bg-hospital-soft dark:bg-[#182B24] text-hospital dark:text-[#6EE7B7] border-[#C5DDD6] dark:border-[#244337]'
                              : 'bg-sand-soft dark:bg-[#262015] text-[#876B37] dark:text-[#D9BD82] border-[#E4D6B8] dark:border-[#3A301E]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isBooked ? 'bg-hospital dark:bg-[#2F9E84]' : 'bg-sand'
                            }`}
                          />
                          {isBooked ? 'Booked' : 'Cancelled'}
                        </span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden divide-y divide-paper-border dark:divide-obsidian-border">
            {sorted.map(appt => {
              const isBooked = appt.status === 'booked'
              return (
                <div key={appt.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[13px] text-ink dark:text-[#F2EFE9]">
                      {appt.doctorName}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        isBooked
                          ? 'bg-hospital-soft text-hospital dark:bg-[#182B24] dark:text-[#6EE7B7]'
                          : 'bg-sand-soft text-[#876B37] dark:bg-[#262015] dark:text-[#D9BD82]'
                      }`}
                    >
                      {isBooked ? 'Booked' : 'Cancelled'}
                    </span>
                  </div>
                  <div className="font-mono text-[12px] text-ink-muted dark:text-[#9CA8A1] tabular-nums">
                    {appt.date} · {appt.time} · {appt.patientPhone}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
