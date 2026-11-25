"""
Thread-safe in-memory data store for doctors, specialities, slots, and appointments.
Uses an RLock so concurrent voice calls cannot double-book or corrupt slot state.
"""
import threading
import uuid
from datetime import datetime, timedelta

_STORE_LOCK = threading.RLock()

DOCTORS = [
    {"id": "d1", "name": "Dr. Priya Sharma", "speciality": "General Physician", "experience": 12, "rating": 4.9, "photo": "https://randomuser.me/api/portraits/women/44.jpg"},
    {"id": "d2", "name": "Dr. Rahul Mehta",  "speciality": "Cardiologist",      "experience": 16, "rating": 4.9, "photo": "https://randomuser.me/api/portraits/men/32.jpg"},
    {"id": "d3", "name": "Dr. Anjali Rao",   "speciality": "Dermatologist",     "experience": 9,  "rating": 4.8, "photo": "https://randomuser.me/api/portraits/women/68.jpg"},
    {"id": "d4", "name": "Dr. Vikram Nair",  "speciality": "Orthopedic",        "experience": 14, "rating": 4.8, "photo": "https://randomuser.me/api/portraits/men/55.jpg"},
]


def _generate_slots() -> dict:
    slots = {}
    now = datetime.now()
    base_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    for doctor in DOCTORS:
        doctor_slots = []
        for day_offset in range(8):
            day = base_day + timedelta(days=day_offset)
            if day.weekday() == 6:  # Skip Sundays
                continue
            t = day.replace(hour=9)
            while t.hour < 17:
                if t > now + timedelta(minutes=15):
                    doctor_slots.append({
                        "slot_id": str(uuid.uuid4()),
                        "doctor_id": doctor["id"],
                        "datetime": t.strftime("%Y-%m-%d %H:%M"),
                        "available": True,
                    })
                t += timedelta(minutes=30)
        slots[doctor["id"]] = doctor_slots
    return slots


SLOTS: dict = _generate_slots()
APPOINTMENTS: dict = {}


def get_all_doctors() -> list:
    with _STORE_LOCK:
        return list(DOCTORS)


def get_slots_for_doctor(doctor_id: str, date: str | None = None, include_taken: bool = False) -> list:
    """Return slots for a doctor, optionally filtered by date (YYYY-MM-DD)."""
    with _STORE_LOCK:
        all_slots = SLOTS.get(doctor_id, [])
        result = [dict(s) for s in all_slots if include_taken or s["available"]]
        if date:
            result = [s for s in result if s["datetime"].startswith(date)]
        return result


def book_slot(slot_id: str, phone_number: str, patient_name: str = "Caller") -> dict | None:
    """
    Atomically book a slot. Idempotent if the same phone_number already holds this slot.
    Returns appointment dict or None if slot is unavailable/invalid.
    """
    with _STORE_LOCK:
        # Idempotency check: same caller re-confirming the exact same slot
        for existing in APPOINTMENTS.values():
            if (
                existing["slot_id"] == slot_id
                and existing["phone_number"] == phone_number
                and existing["status"] == "confirmed"
            ):
                return dict(existing)

        for doctor_id, slots in SLOTS.items():
            for slot in slots:
                if slot["slot_id"] == slot_id and slot["available"]:
                    slot["available"] = False
                    doctor = next((d for d in DOCTORS if d["id"] == doctor_id), {})
                    appointment = {
                        "appointment_id": str(uuid.uuid4()),
                        "slot_id": slot_id,
                        "doctor_id": doctor_id,
                        "doctor_name": doctor.get("name", ""),
                        "speciality": doctor.get("speciality", ""),
                        "datetime": slot["datetime"],
                        "phone_number": phone_number,
                        "patient_name": patient_name,
                        "status": "confirmed",
                        "updated_at": datetime.now().isoformat(),
                    }
                    APPOINTMENTS[appointment["appointment_id"]] = appointment
                    return dict(appointment)
        return None


def cancel_appointment_by_phone(phone_number: str) -> dict | None:
    """
    Atomically cancel the most recent active appointment for a phone number.
    Idempotent: if no active appointment exists, returns None cleanly.
    """
    with _STORE_LOCK:
        matching = [
            a for a in APPOINTMENTS.values()
            if a["phone_number"] == phone_number and a["status"] == "confirmed"
        ]
        if not matching:
            return None
        matching.sort(key=lambda a: a["datetime"], reverse=True)
        appt = matching[0]
        appt["status"] = "cancelled"
        appt["updated_at"] = datetime.now().isoformat()
        for slots in SLOTS.values():
            for s in slots:
                if s["slot_id"] == appt["slot_id"]:
                    s["available"] = True
        return dict(appt)


def get_appointments() -> list:
    with _STORE_LOCK:
        return [dict(a) for a in APPOINTMENTS.values()]
