import re
from datetime import date
from uuid import UUID


def generate_deal_number(year: int, sequence: int) -> str:
    return f"CRM-{year}-{sequence:04d}"


def normalize_phone(phone: str) -> str:
    """Normalize phone to +7XXXXXXXXXX format."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] in ("7", "8"):
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    return f"+{digits}"


def date_range_overlap(
    start1: date, end1: date, start2: date, end2: date
) -> bool:
    """Check if two date ranges overlap."""
    return not (end1 <= start2 or end2 <= start1)


def mask_phone(phone: str) -> str:
    """Mask phone for logging: +7XXX***XXXX"""
    if len(phone) >= 11:
        return phone[:5] + "***" + phone[-4:]
    return "***"


def mask_email(email: str) -> str:
    """Mask email for logging."""
    parts = email.split("@")
    if len(parts) != 2:
        return "***"
    local = parts[0]
    masked = local[:2] + "***" if len(local) > 2 else "***"
    return f"{masked}@{parts[1]}"
