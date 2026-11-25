import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Phone, PhoneOff, Sun, Volume2, VolumeX } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { StatTiles } from './components/StatTiles'
import { DoctorsPanel } from './components/DoctorsPanel'
import { AppointmentsTable } from './components/AppointmentsTable'
import { CallConsolePanel } from './components/CallConsolePanel'
import { CallPhoneModal } from './components/CallPhoneModal'
import { usePipecatCall } from './hooks/usePipecatCall'
import {
  fetchAppointments,
  fetchDoctors,
  normalizeAppointment,
  subscribeEvents,
} from './lib/api'
import { FALLBACK_APPOINTMENTS, FALLBACK_DOCTORS } from './lib/mockFallback'
import type {
  Appointment,
  BackendEvent,
  CallActionBanner,
  Doctor,
  NavSection,
} from './types'

export default function App() {
  const [section, setSection] = useState<NavSection>('overview')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoadDone = useRef(false)
  const [demoMode, setDemoMode] = useState(false)
  const [online, setOnline] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [highlightedDoctorId, setHighlightedDoctorId] = useState<string | null>(null)
  const [highlightedApptId, setHighlightedApptId] = useState<string | null>(null)
  const [actionBanner, setActionBanner] = useState<CallActionBanner | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const loadData = useCallback(async () => {
    // Only show loading skeleton on the very first fetch, not on refetches
    // This prevents the visual "flash" when data refreshes after events
    try {
      const [docs, appts] = await Promise.all([fetchDoctors(), fetchAppointments()])
      setDoctors(docs)
      setAppointments(appts)
      setDemoMode(false)
      setOnline(true)
    } catch {
      setDoctors(prev => (prev.length ? prev : FALLBACK_DOCTORS))
      setAppointments(prev => (prev.length ? prev : FALLBACK_APPOINTMENTS))
      setDemoMode(true)
      setOnline(false)
    } finally {
      if (!initialLoadDone.current) {
        // Small delay on initial load so skeleton doesn't flash for ultra-fast responses
        await new Promise(r => setTimeout(r, 350))
        initialLoadDone.current = true
      }
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDemoAction = useCallback((type: 'booked' | 'cancelled') => {
    if (type === 'booked') {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      const demoAppt: Appointment = {
        id: crypto.randomUUID().slice(0, 8),
        patientPhone: '9876543210',
        doctorId: 'd2',
        doctorName: 'Dr. Rahul Mehta',
        speciality: 'Cardiologist',
        date: tomorrow,
        time: '09:30',
        status: 'booked',
        updatedAt: new Date().toISOString(),
      }
      setAppointments(prev => [demoAppt, ...prev])
      setDoctors(prev =>
        prev.map(d =>
          d.id === 'd2'
            ? { ...d, slots: d.slots.map(s => (s.time === '09:30' ? { ...s, available: false } : s)) }
            : d
        )
      )
      setHighlightedApptId(demoAppt.id)
      setActionBanner({ id: demoAppt.id, type: 'booked', appointment: demoAppt })
      window.setTimeout(() => setHighlightedApptId(null), 3000)
    }
  }, [])

  const {
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
  } = usePipecatCall({
    demoMode,
    soundEnabled,
    onCallEnded: () => {
      if (!demoMode) loadData()
    },
    onDemoAction: handleDemoAction,
  })

  // Subscribe to backend events for live transcript + booking/cancellation updates
  useEffect(() => {
    if (demoMode) return
    const unsub = subscribeEvents(
      (ev: BackendEvent) => {
        if (ev.type === 'transcript' && ev.text) {
          pushTranscript(ev.speaker === 'bot' ? 'agent' : 'caller', ev.text)
        }
        if (ev.type === 'booked' || ev.type === 'cancelled') {
          loadData()
          if (ev.appointment) {
            setHighlightedApptId(ev.appointment.id)
            setActionBanner({ id: ev.appointment.id, type: ev.type, appointment: ev.appointment })
            window.setTimeout(() => setHighlightedApptId(null), 3200)
          }
        }
        if (ev.type === 'tool_called') {
          if (ev.tool === 'check_doctor_availability' && ev.result?.doctors?.length) {
            const docId = ev.result.doctors[0]?.doctor_id
            if (docId) {
              setHighlightedDoctorId(docId)
              window.setTimeout(() => setHighlightedDoctorId(null), 3200)
            }
          }
          if (
            (ev.tool === 'book_appointment' || ev.tool === 'cancel_appointment') &&
            ev.result?.success &&
            ev.result.appointment
          ) {
            loadData()
            const norm = normalizeAppointment(ev.result.appointment)
            const actionType = ev.tool === 'book_appointment' ? 'booked' : 'cancelled'
            setHighlightedApptId(norm.id)
            setActionBanner({ id: norm.id, type: actionType, appointment: norm })
            window.setTimeout(() => setHighlightedApptId(null), 3200)
          }
        }
        if (ev.type === 'call_ended') {
          loadData()
        }
      },
      (isConnected) => setOnline(isConnected)
    )
    return unsub
  }, [demoMode, loadData, pushTranscript])

  const handleOpenCall = () => {
    setActionBanner(null)
    setPhoneOpen(true)
    startCall()
  }

  const handleCallAgain = () => {
    setActionBanner(null)
    resetToIdle()
    window.setTimeout(() => startCall(), 40)
  }

  const handleClosePhone = () => {
    setPhoneOpen(false)
    if (callState === 'ended') {
      resetToIdle()
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const openSlotsToday = useMemo(
    () =>
      doctors.reduce(
        (sum, d) => sum + d.slots.filter(s => s.available && s.date === todayIso).length,
        0
      ),
    [doctors, todayIso]
  )
  const bookedCount = useMemo(
    () => appointments.filter(a => a.status === 'booked').length,
    [appointments]
  )
  const cancelledCount = useMemo(
    () => appointments.filter(a => a.status === 'cancelled').length,
    [appointments]
  )

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="paper-grain min-h-screen flex bg-paper dark:bg-obsidian text-ink dark:text-[#F2EFE9] transition-colors">
      <Sidebar
        active={section}
        onSelect={setSection}
        confirmedCount={bookedCount}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(s => !s)}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        online={online}
        demoMode={demoMode}
      />

      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 border-b border-paper-border dark:border-obsidian-border bg-paper/90 dark:bg-obsidian/90 backdrop-blur-md">
          <div className="max-w-[1320px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden w-7 h-7 rounded-[8px] bg-hospital text-white flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="font-serif text-[20px] font-medium tracking-[-0.02em] text-ink dark:text-[#F2EFE9] truncate">
                  {section === 'overview'
                    ? 'Clinical scheduling desk'
                    : section === 'doctors'
                    ? 'Specialists'
                    : section === 'appointments'
                    ? 'Appointments'
                    : 'Call console'}
                </h1>
              </div>
              <span className="hidden md:inline-block text-[12px] text-ink-subtle pl-2 border-l border-paper-border dark:border-obsidian-border">
                {todayFormatted}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* System status pill */}
              <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-[12px] font-medium text-ink-muted dark:text-[#9CA8A1]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    demoMode
                      ? 'bg-sand'
                      : online
                      ? 'bg-hospital dark:bg-[#2F9E84]'
                      : 'bg-ink-subtle'
                  }`}
                />
                <span>{demoMode ? 'Demo mode' : online ? 'Agent online' : 'Connecting'}</span>
              </div>

              {/* Mobile sound & theme toggles */}
              <button
                type="button"
                onClick={() => setSoundEnabled(s => !s)}
                aria-label={soundEnabled ? 'Mute call tones' : 'Enable call tones'}
                className="lg:hidden p-2 rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-ink-muted"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(d => !d)}
                aria-label="Toggle theme"
                className="lg:hidden p-2 rounded-[10px] border border-paper-border dark:border-obsidian-border bg-paper-card dark:bg-obsidian-card text-ink-muted"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {callState === 'connected' || callState === 'ringing' ? (
                <button
                  type="button"
                  onClick={() => setPhoneOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[12px] bg-[#B43C3C] hover:bg-[#992F2F] text-white text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B43C3C]"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>{callState === 'ringing' ? 'Connecting' : 'Active call'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenCall}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[12px] bg-hospital hover:bg-hospital-hover dark:bg-hospital-dark dark:hover:bg-[#25856F] text-white text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hospital"
                >
                  <Phone className="w-4 h-4" strokeWidth={2} />
                  <span>Try Call</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main 12-Column Workspace */}
        <main className="flex-1 max-w-[1320px] w-full mx-auto px-5 sm:px-8 py-6 space-y-6">
          <StatTiles
            doctorsOnDuty={doctors.length}
            openSlotsToday={openSlotsToday}
            bookedCount={bookedCount}
            cancelledCount={cancelledCount}
            loading={loading}
          />

          {section === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5">
                <DoctorsPanel
                  doctors={doctors}
                  loading={loading}
                  highlightedDoctorId={highlightedDoctorId}
                />
              </div>
              <div className="lg:col-span-7 space-y-6">
                <AppointmentsTable
                  appointments={appointments}
                  loading={loading}
                  highlightedId={highlightedApptId}
                />
                <CallConsolePanel
                  callState={callState}
                  activity={activity}
                  localLevel={localLevel}
                  remoteLevel={remoteLevel}
                  transcript={transcript}
                  onStartCall={handleOpenCall}
                />
              </div>
            </div>
          )}

          {section === 'doctors' && (
            <DoctorsPanel
              doctors={doctors}
              loading={loading}
              highlightedDoctorId={highlightedDoctorId}
            />
          )}

          {section === 'appointments' && (
            <AppointmentsTable
              appointments={appointments}
              loading={loading}
              highlightedId={highlightedApptId}
            />
          )}

          {section === 'console' && (
            <CallConsolePanel
              callState={callState}
              activity={activity}
              localLevel={localLevel}
              remoteLevel={remoteLevel}
              transcript={transcript}
              onStartCall={handleOpenCall}
            />
          )}
        </main>
      </div>

      <CallPhoneModal
        open={phoneOpen}
        callState={callState}
        activity={activity}
        muted={muted}
        elapsedSeconds={elapsedSeconds}
        lastDurationSeconds={lastDurationSeconds}
        localLevel={localLevel}
        remoteLevel={remoteLevel}
        error={error}
        transcript={transcript}
        actionBanner={actionBanner}
        onEndCall={endCall}
        onCallAgain={handleCallAgain}
        onToggleMute={toggleMute}
        onClose={handleClosePhone}
      />
    </div>
  )
}
