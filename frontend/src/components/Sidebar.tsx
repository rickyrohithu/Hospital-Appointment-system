import {
  LayoutGrid,
  Stethoscope,
  CalendarCheck2,
  PhoneCall,
  Volume2,
  VolumeX,
  Moon,
  Sun,
} from 'lucide-react'
import type { NavSection } from '../types'

interface SidebarProps {
  active: NavSection
  onSelect: (section: NavSection) => void
  confirmedCount: number
  soundEnabled: boolean
  onToggleSound: () => void
  darkMode: boolean
  onToggleDark: () => void
  online: boolean
  demoMode: boolean
}

const ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
  { id: 'console', label: 'Call Console', icon: PhoneCall },
]

export function Sidebar({
  active,
  onSelect,
  confirmedCount,
  soundEnabled,
  onToggleSound,
  darkMode,
  onToggleDark,
  online,
  demoMode,
}: SidebarProps) {
  return (
    <aside className="hidden lg:flex w-[232px] shrink-0 flex-col justify-between border-r border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card px-4 py-6 sticky top-0 h-screen z-10">
      <div>
        {/* Meridian Health Logo Mark */}
        <div className="flex items-center gap-3 px-2 pb-6 border-b border-paper-border dark:border-obsidian-border">
          <div className="w-8 h-8 rounded-[10px] bg-hospital dark:bg-hospital-dark flex items-center justify-center text-white shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-serif text-[17px] font-semibold tracking-[-0.02em] text-ink dark:text-[#F2EFE9] leading-tight">
              Meridian Health
            </div>
            <div className="text-[11px] text-ink-subtle tracking-wide">
              Care Operations
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 space-y-1" aria-label="Main navigation">
          {ITEMS.map(item => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[12px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital ${
                  isActive
                    ? 'bg-hospital-soft dark:bg-[#192822] text-hospital dark:text-[#6EE7B7] font-semibold'
                    : 'text-ink-muted dark:text-[#9CA8A1] hover:bg-paper dark:hover:bg-obsidian-elevated hover:text-ink dark:hover:text-[#F2EFE9]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                  {item.label}
                </span>
                {item.id === 'appointments' && confirmedCount > 0 && (
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-paper dark:bg-obsidian border border-paper-border dark:border-obsidian-border text-ink dark:text-[#F2EFE9] tabular-nums">
                    {confirmedCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Controls */}
      <div className="space-y-3 pt-4 border-t border-paper-border dark:border-obsidian-border">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute call tones' : 'Enable call tones'}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-[10px] border border-paper-border dark:border-obsidian-border text-[12px] font-medium text-ink-muted dark:text-[#9CA8A1] hover:bg-paper dark:hover:bg-obsidian-elevated transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDark}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="px-2.5 py-2 rounded-[10px] border border-paper-border dark:border-obsidian-border text-ink-muted dark:text-[#9CA8A1] hover:bg-paper dark:hover:bg-obsidian-elevated transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="px-3 py-2.5 rounded-[12px] bg-paper-elevated dark:bg-obsidian-elevated border border-paper-border dark:border-obsidian-border">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink dark:text-[#F2EFE9]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                online ? 'bg-hospital dark:bg-[#2F9E84]' : 'bg-sand'
              }`}
            />
            <span>{demoMode ? 'Demo mode' : online ? 'Agent online' : 'Reconnecting'}</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-subtle leading-relaxed">
            Pipecat · ElevenLabs · Gemini
          </div>
        </div>
      </div>
    </aside>
  )
}
