import pytest
from app.shared.utils import normalize_phone, date_range_overlap
from datetime import date


@pytest.mark.parametrize("phone,expected", [
    ("+79001234567", "+79001234567"),
    ("79001234567", "+79001234567"),
    ("89001234567", "+79001234567"),
    ("9001234567", "+79001234567"),
])
def test_normalize_phone(phone, expected):
    assert normalize_phone(phone) == expected


@pytest.mark.parametrize("s1,e1,s2,e2,overlaps", [
    (date(2024, 1, 1), date(2024, 1, 5), date(2024, 1, 3), date(2024, 1, 7), True),
    (date(2024, 1, 1), date(2024, 1, 3), date(2024, 1, 3), date(2024, 1, 7), False),  # touching
    (date(2024, 1, 5), date(2024, 1, 10), date(2024, 1, 1), date(2024, 1, 3), False),
])
def test_date_range_overlap(s1, e1, s2, e2, overlaps):
    assert date_range_overlap(s1, e1, s2, e2) == overlaps
