import { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
import type { Doctor } from '../types'

interface DoctorsPanelProps {
  doctors: Doctor[]
  loading: boolean
  highlightedDoctorId: string | null
}

function getInitials(name: string): string {
  return name
    .replace(/^Dr\.\s+/i, '')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatDateTag(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function DoctorsPanel({ doctors, loading, highlightedDoctorId }: DoctorsPanelProps) {
  const [speciality, setSpeciality] = useState<string>('All')
  const [search, setSearch] = useState('')

  const specialities = useMemo(
    () => ['All', ...Array.from(new Set(doctors.map(d => d.speciality)))],
    [doctors]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return doctors.filter(doc => {
      const matchSpec = speciality === 'All' || doc.speciality === speciality
      const matchQuery =
        !q || doc.name.toLowerCase().includes(q) || doc.speciality.toLowerCase().includes(q)
      return matchSpec && matchQuery
    })
  }, [doctors, search, speciality])

  return (
    <section className="bg-paper-card dark:bg-obsidian-card border border-paper-border dark:border-obsidian-border rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-paper-border dark:border-obsidian-border flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-[19px] font-medium tracking-[-0.02em] text-ink dark:text-[#F2EFE9]">
              Specialists &amp; schedule
            </h2>
            <p className="text-[12px] text-ink-muted dark:text-[#9CA8A1]">
              Live slot availability across departments
            </p>
          </div>
          <span className="font-mono text-[11px] text-ink-muted dark:text-[#9CA8A1] px-2.5 py-1 rounded-full border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated tabular-nums">
            {filtered.length} of {doctors.length}
          </span>
        </div>

        {/* Search + Segmented Filter */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search physician or department"
              aria-label="Search physician or department"
              className="w-full pl-8 pr-3 py-1.5 text-[13px] rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated text-ink dark:text-[#F2EFE9] placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-hospital/40"
            />
          </div>

          <div
            className="flex items-center gap-1 p-1 rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated overflow-x-auto"
            role="tablist"
            aria-label="Filter by speciality"
          >
            {specialities.map(spec => {
              const active = speciality === spec
              return (
                <button
                  key={spec}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSpeciality(spec)}
                  className={`px-2.5 py-1 rounded-[7px] text-[11px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital ${
                    active
                      ? 'bg-paper-card dark:bg-obsidian-card text-ink dark:text-[#F2EFE9] border border-paper-border dark:border-obsidian-border shadow-xs'
                      : 'text-ink-muted dark:text-[#9CA8A1] hover:text-ink dark:hover:text-[#F2EFE9]'
                  }`}
                >
                  {spec}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-[12px] border border-paper-border dark:border-obsidian-border bg-paper-elevated dark:bg-obsidian-elevated animate-pulse space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-paper-border dark:bg-obsidian-border" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-36 rounded bg-paper-border dark:bg-obsidian-border" />
                  <div className="h-3 w-24 rounded bg-paper-border dark:bg-obsidian-border" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="h-7 rounded-md bg-paper-border dark:bg-obsidian-border" />
                ))}
              </div>
            </div>
          ))}

        {!loading &&
          filtered.map(doc => {
            const isHighlighted = highlightedDoctorId === doc.id
            const openCount = doc.slots.filter(s => s.available).length

            return (
              <article
                key={doc.id}
                className={`p-4 rounded-[12px] border transition-all duration-300 ${
                  isHighlighted
                    ? 'border-hospital dark:border-hospital-dark bg-hospital-soft/50 dark:bg-[#162620]'
                    : 'border-paper-border dark:border-obsidian-border bg-paper-elevated/60 dark:bg-obsidian-elevated/50 hover:border-[#CFC8BA] dark:hover:border-[#314038]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {doc.photoUrl ? (
                      <img
                        src={doc.photoUrl}
                        alt={doc.name}
                        className="w-10 h-10 rounded-full object-cover border border-paper-border dark:border-obsidian-border shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-hospital-soft dark:bg-[#192822] text-hospital dark:text-[#6EE7B7] font-serif font-semibold text-[14px] flex items-center justify-center border border-paper-border dark:border-obsidian-border shrink-0">
                        {getInitials(doc.name)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-ink dark:text-[#F2EFE9] truncate">
                        {doc.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[12px] text-ink-muted dark:text-[#9CA8A1] mt-0.5 flex-wrap">
                        <span>{doc.speciality}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.experience} yrs exp</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Star className="w-3 h-3 fill-sand text-sand" />
                          {doc.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md border border-paper-border dark:border-obsidian-border text-hospital dark:text-[#6EE7B7] bg-paper-card dark:bg-obsidian-card shrink-0 tabular-nums">
                    {openCount} open
                  </span>
                </div>

                {/* Slot Grid: outlined for available, muted + struck through for taken across all dates */}
                <div className="mt-3.5 flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                  {doc.slots.map(slot => (
                    <span
                      key={slot.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] font-mono text-[11px] tabular-nums border transition-colors ${
                        slot.available
                          ? 'border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-ink dark:text-[#F2EFE9] hover:border-hospital dark:hover:border-hospital-dark'
                          : 'border-transparent bg-paper dark:bg-obsidian text-ink-subtle line-through opacity-60'
                      }`}
                    >
                      <span className="text-[10px] font-sans text-ink-subtle">
                        {formatDateTag(slot.date)}
                      </span>
                      <span>{slot.time}</span>
                    </span>
                  ))}
                  {doc.slots.length === 0 && (
                    <span className="text-[12px] text-ink-subtle">No slots listed</span>
                  )}
                </div>
              </article>
            )
          })}

        {!loading && filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-ink-muted dark:text-[#9CA8A1]">
            No specialists match your search.
          </div>
        )}
      </div>
    </section>
  )
}
