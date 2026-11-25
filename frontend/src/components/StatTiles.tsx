interface StatTilesProps {
  doctorsOnDuty: number
  openSlotsToday: number
  bookedCount: number
  cancelledCount: number
  loading: boolean
}

export function StatTiles({
  doctorsOnDuty,
  openSlotsToday,
  bookedCount,
  cancelledCount,
  loading,
}: StatTilesProps) {
  const tiles = [
    { label: 'Doctors on duty', value: doctorsOnDuty, note: 'Multi-specialty' },
    { label: 'Open slots today', value: openSlotsToday, note: 'Available windows' },
    { label: 'Booked today', value: bookedCount, note: 'Confirmed' },
    { label: 'Cancelled today', value: cancelledCount, note: 'Released slots' },
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {tiles.map(tile => (
        <div
          key={tile.label}
          className="bg-paper-card dark:bg-obsidian-card border border-paper-border dark:border-obsidian-border rounded-[14px] px-5 py-4 transition-colors"
        >
          <div className="text-[12px] font-medium text-ink-muted dark:text-[#9CA8A1]">
            {tile.label}
          </div>
          {loading ? (
            <div className="mt-2.5 h-8 w-14 rounded-md bg-paper dark:bg-obsidian-elevated animate-pulse" />
          ) : (
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-serif text-[32px] font-medium tracking-[-0.03em] text-ink dark:text-[#F2EFE9] leading-none tabular-nums">
                {tile.value}
              </span>
              <span className="text-[11px] text-ink-subtle">{tile.note}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
