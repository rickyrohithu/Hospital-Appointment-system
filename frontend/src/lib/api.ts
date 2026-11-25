import type { Appointment, BackendEvent, Doctor } from '../types'

// Default points to the local backend; Vite also proxies /api and /ws in dev
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || ''

export function getWsBaseUrl(): string {
  if (BACKEND_URL) {
    return BACKEND_URL.replace(/^http/, 'ws')
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.hostname}:8000`
}

interface RawBackendAppointment {
  appointment_id?: string
  id?: string
  phone_number?: string
  patientPhone?: string
  doctor_id?: string
  doctorId?: string
  doctor_name?: string
  doctorName?: string
  speciality?: string
  datetime?: string
  date?: string
  time?: string
  status?: string
  updatedAt?: string
}

export function normalizeAppointment(raw: RawBackendAppointment): Appointment {
  const [dtDate, dtTime] = (raw.datetime || '').split(' ')
  const status = raw.status === 'cancelled' ? 'cancelled' : 'booked'
  return {
    id: raw.id || raw.appointment_id || crypto.randomUUID().slice(0, 8),
    patientPhone: raw.patientPhone || raw.phone_number || '—',
    doctorId: raw.doctorId || raw.doctor_id || '',
    doctorName: raw.doctorName || raw.doctor_name || 'Specialist',
    speciality: raw.speciality || '',
    date: raw.date || dtDate || '',
    time: raw.time || dtTime || '',
    status,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

export async function fetchDoctors(): Promise<Doctor[]> {
  const res = await fetch(`${BACKEND_URL}/api/doctors`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { doctors?: Doctor[] } | Doctor[]
  return Array.isArray(data) ? data : data.doctors || []
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const res = await fetch(`${BACKEND_URL}/api/appointments`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { appointments?: RawBackendAppointment[] } | RawBackendAppointment[]
  const list = Array.isArray(data) ? data : data.appointments || []
  return list.map(normalizeAppointment)
}

export function subscribeEvents(
  onEvent: (event: BackendEvent) => void,
  onConnectionChange?: (online: boolean) => void
): () => void {
  let closed = false
  let ws: WebSocket | null = null
  let reconnectTimer: number | undefined

  const connect = () => {
    if (closed) return
    ws = new WebSocket(`${getWsBaseUrl()}/ws/events`)
    ws.onopen = () => onConnectionChange?.(true)
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as BackendEvent
        onEvent(parsed)
      } catch {
        // Ignore malformed non-JSON messages
      }
    }
    ws.onclose = () => {
      onConnectionChange?.(false)
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 2500)
      }
    }
    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    ws?.close()
  }
}
