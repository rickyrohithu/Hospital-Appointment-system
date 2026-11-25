import type { Appointment, Doctor } from '../types'

const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

export const FALLBACK_DOCTORS: Doctor[] = [
  {
    id: 'd1',
    name: 'Dr. Priya Sharma',
    speciality: 'General Physician',
    experience: 12,
    rating: 4.9,
    photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
    slots: [
      { id: 's1', date: today, time: '17:30', available: true },
      { id: 's2', date: today, time: '18:00', available: false },
      { id: 's3', date: tomorrow, time: '09:30', available: true },
      { id: 's4', date: tomorrow, time: '10:00', available: true },
      { id: 's5', date: tomorrow, time: '10:30', available: false },
      { id: 's6', date: tomorrow, time: '11:30', available: true },
    ],
  },
  {
    id: 'd2',
    name: 'Dr. Rahul Mehta',
    speciality: 'Cardiologist',
    experience: 16,
    rating: 4.9,
    photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    slots: [
      { id: 's7', date: tomorrow, time: '09:00', available: true },
      { id: 's8', date: tomorrow, time: '09:30', available: true },
      { id: 's9', date: tomorrow, time: '11:00', available: false },
      { id: 's10', date: tomorrow, time: '14:00', available: true },
    ],
  },
  {
    id: 'd3',
    name: 'Dr. Anjali Rao',
    speciality: 'Dermatologist',
    experience: 9,
    rating: 4.8,
    photoUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
    slots: [
      { id: 's11', date: tomorrow, time: '10:00', available: true },
      { id: 's12', date: tomorrow, time: '12:00', available: true },
      { id: 's13', date: tomorrow, time: '15:30', available: true },
    ],
  },
  {
    id: 'd4',
    name: 'Dr. Vikram Nair',
    speciality: 'Orthopedic',
    experience: 14,
    rating: 4.8,
    photoUrl: 'https://randomuser.me/api/portraits/men/55.jpg',
    slots: [
      { id: 's14', date: tomorrow, time: '09:30', available: false },
      { id: 's15', date: tomorrow, time: '11:00', available: true },
      { id: 's16', date: tomorrow, time: '16:00', available: true },
    ],
  },
]

export const FALLBACK_APPOINTMENTS: Appointment[] = [
  {
    id: 'a842c1d0',
    patientPhone: '+91 98765 43210',
    doctorId: 'd1',
    doctorName: 'Dr. Priya Sharma',
    speciality: 'General Physician',
    date: today,
    time: '18:00',
    status: 'booked',
    updatedAt: new Date(Date.now() - 120000).toISOString(),
  },
]
