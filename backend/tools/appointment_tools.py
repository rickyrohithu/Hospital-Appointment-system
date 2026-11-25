"""
Reliable, defensive tool definitions for the doctor appointment assistant.
Every tool validates/normalizes inputs and always returns {success: bool, message: str, ...}.
"""
import re
from datetime import datetime, timedelta
from loguru import logger

from backend.data.mock_data import (
    DOCTORS,
    get_slots_for_doctor,
    book_slot,
    cancel_appointment_by_phone,
)

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}

_WORD_DIGITS = {
    "zero": "0", "oh": "0", "o": "0",
    "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
}


def normalize_phone_number(raw: str) -> str | None:
    """
    Normalize spoken or formatted phone numbers (words, 'double nine', spaces, dashes)
    into a clean 7-15 digit string. Returns None if invalid.
    """
    if not raw or not isinstance(raw, str):
        return None

    tokens = re.split(r"[\s,\-]+", raw.strip().lower())
    out: list[str] = []
    multiplier = 1

    for tok in tokens:
        if not tok:
            continue
        if tok == "double":
            multiplier = 2
            continue
        if tok == "triple":
            multiplier = 3
            continue
        if tok in _WORD_DIGITS:
            out.append(_WORD_DIGITS[tok] * multiplier)
            multiplier = 1
        else:
            digits = re.sub(r"\D", "", tok)
            if digits:
                out.append(digits * multiplier if len(digits) == 1 else digits)
            multiplier = 1

    cleaned = "".join(out)
    # Strip leading country code 91 only if 12 digits starting with 91
    if len(cleaned) == 12 and cleaned.startswith("91"):
        cleaned = cleaned[2:]

    if 7 <= len(cleaned) <= 15:
        return cleaned
    return None


def _normalize_date(date_str: str) -> str | None:
    """Convert natural or formatted date strings into YYYY-MM-DD."""
    if not date_str or not isinstance(date_str, str):
        return None
    s = date_str.strip().lower()
    today = datetime.now().date()

    if s in ("today", "tonight", "now"):
        return str(today)
    if s == "tomorrow":
        return str(today + timedelta(days=1))
    if s == "day after tomorrow":
        return str(today + timedelta(days=2))

    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass

    for fmt in (
        "%d %B %Y", "%B %d %Y", "%B %d, %Y",
        "%d %b %Y", "%b %d %Y", "%b %d, %Y",
        "%d %B", "%B %d", "%d %b", "%b %d",
    ):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.year == 1900:
                dt = dt.replace(year=today.year)
                if dt.date() < today:
                    dt = dt.replace(year=today.year + 1)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)(?:\s+(\d{4}))?", date_str, re.IGNORECASE)
    if m:
        day, month_name, year = m.group(1), m.group(2).lower(), m.group(3)
        if month_name in _MONTH_MAP:
            yr = int(year) if year else today.year
            try:
                return datetime(yr, _MONTH_MAP[month_name], int(day)).strftime("%Y-%m-%d")
            except ValueError:
                pass
    return None


def check_doctor_availability(doctor_name: str = "", speciality: str = "", date: str = "") -> dict:
    try:
        normalized_date = _normalize_date(date) if date else None
        if date and not normalized_date:
            return {
                "success": False,
                "message": f"Could not understand the date '{date}'. Please ask the caller for a clear date like 'tomorrow' or 'November 26'.",
                "doctors": [],
            }

        results = []
        for doctor in DOCTORS:
            name_match = (not doctor_name) or (doctor_name.lower() in doctor["name"].lower())
            spec_match = (not speciality) or (speciality.lower() in doctor["speciality"].lower())
            if name_match and spec_match:
                slots = get_slots_for_doctor(doctor["id"], normalized_date)
                results.append({
                    "doctor_id": doctor["id"],
                    "doctor_name": doctor["name"],
                    "speciality": doctor["speciality"],
                    "queried_date": normalized_date or "upcoming",
                    "available_slots": slots[:8],
                    "total_available": len(slots),
                })

        if not results:
            return {
                "success": False,
                "message": "No doctors found matching that name or speciality.",
                "doctors": [],
            }
        if all(len(r["available_slots"]) == 0 for r in results):
            return {
                "success": False,
                "message": f"No available slots on {normalized_date or 'that period'}. Slots run Monday to Saturday, 9 AM to 5 PM.",
                "doctors": results,
            }
        return {
            "success": True,
            "message": "Available slots retrieved.",
            "doctors": results,
        }
    except Exception as exc:
        logger.exception(f"Tool error in check_doctor_availability: {exc}")
        return {
            "success": False,
            "message": "Unable to check availability right now. Please ask the caller to try again.",
            "doctors": [],
        }


def book_appointment(slot_id: str, phone_number: str, patient_name: str = "Caller") -> dict:
    try:
        if not slot_id or not isinstance(slot_id, str):
            return {"success": False, "message": "A valid slot_id is required to book."}

        normalized_phone = normalize_phone_number(phone_number)
        if not normalized_phone:
            return {
                "success": False,
                "message": "The phone number appears incomplete or unclear. Please ask the caller to repeat their full phone number.",
            }

        appointment = book_slot(slot_id.strip(), normalized_phone, patient_name or "Caller")
        if appointment:
            return {
                "success": True,
                "message": (
                    f"Appointment confirmed with {appointment['doctor_name']} "
                    f"on {appointment['datetime']} for phone {normalized_phone}."
                ),
                "appointment": appointment,
            }
        return {
            "success": False,
            "message": "That slot is no longer available or invalid. Please offer another open slot.",
        }
    except Exception as exc:
        logger.exception(f"Tool error in book_appointment: {exc}")
        return {
            "success": False,
            "message": "Booking failed due to an internal error. Please try another slot.",
        }


def cancel_appointment(phone_number: str) -> dict:
    try:
        normalized_phone = normalize_phone_number(phone_number)
        if not normalized_phone:
            return {
                "success": False,
                "message": "The phone number appears incomplete or unclear. Please ask the caller to repeat it.",
            }

        appt = cancel_appointment_by_phone(normalized_phone)
        if appt:
            return {
                "success": True,
                "message": (
                    f"Cancelled appointment with {appt['doctor_name']} "
                    f"on {appt['datetime']} for phone {normalized_phone}."
                ),
                "appointment": appt,
            }
        return {
            "success": False,
            "message": f"No active appointment found for phone number {normalized_phone}.",
        }
    except Exception as exc:
        logger.exception(f"Tool error in cancel_appointment: {exc}")
        return {
            "success": False,
            "message": "Cancellation failed due to an internal error. Please try again.",
        }


TOOL_REGISTRY = {
    "check_doctor_availability": check_doctor_availability,
    "book_appointment": book_appointment,
    "cancel_appointment": cancel_appointment,
}
