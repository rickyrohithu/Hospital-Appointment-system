export type NavSection = 'overview' | 'doctors' | 'appointments' | 'console'

export type CallState = 'idle' | 'ringing' | 'connected' | 'ended'

export type AgentActivity = 'connecting' | 'listening' | 'speaking' | 'muted'

export interface Slot {
  id: string
  date: string
  time: string
  available: boolean
}

export interface Doctor {
  id: string
  name: string
  speciality: string
  experience: number
  rating: number
  photoUrl?: string
  slots: Slot[]
}

export type AppointmentStatus = 'booked' | 'cancelled'

export interface Appointment {
  id: string
  patientPhone: string
  doctorId: string
  doctorName: string
  speciality: string
  date: string
  time: string
  status: AppointmentStatus
  updatedAt: string
}

export interface TranscriptEntry {
  id: string
  speaker: 'caller' | 'agent'
  text: string
  interim?: boolean
  timestamp: number
}

export interface CallActionBanner {
  id: string
  type: 'booked' | 'cancelled'
  appointment: Appointment
}

export interface BackendEvent {
  type: 'transcript' | 'tool_called' | 'call_started' | 'call_ended' | 'booked' | 'cancelled'
  speaker?: 'user' | 'bot'
  text?: string
  tool?: string
  result?: {
    success?: boolean
    doctors?: Array<{ doctor_id?: string }>
    appointment?: {
      appointment_id?: string
      id?: string
      doctor_id?: string
      doctor_name?: string
      speciality?: string
      datetime?: string
      phone_number?: string
      status?: string
    }
  }
  appointment?: Appointment
}
