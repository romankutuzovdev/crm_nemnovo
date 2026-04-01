import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_calendar_multi_create_without_slots_ok(auth_client: AsyncClient):
    payload = {
        "guests_count": 1,
        "notes": "test",
        "contract_id": None,
        "contract_text": None,
        "excursion_guide_id": None,
        "preferred_datetime": "2026-04-01T10:00:00Z",
        "participants": [
            {
                "new_client": {
                    "first_name": "Иван",
                    "last_name": "Тестов",
                    "phone": "+79990000000",
                    "email": None,
                },
                "service": {
                    "service_type": "rent",
                    "description": "Аренда тест",
                    "quantity": 1,
                    "unit_price": 1000,
                },
            }
        ],
        "slots": [],
    }

    res = await auth_client.post("/api/v1/calendar/events/multi", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert "lead_id" in data


@pytest.mark.asyncio
async def test_calendar_multi_create_without_slots_and_without_datetime_422(auth_client: AsyncClient):
    payload = {
        "guests_count": 1,
        "notes": "test",
        "participants": [
            {
                "new_client": {
                    "first_name": "Иван",
                    "last_name": "Тестов",
                    "phone": "+79990000001",
                    "email": None,
                },
                "service": {
                    "service_type": "rent",
                    "description": "Аренда тест",
                    "quantity": 1,
                    "unit_price": 1000,
                },
            }
        ],
        "slots": [],
        "preferred_datetime": None,
    }

    res = await auth_client.post("/api/v1/calendar/events/multi", json=payload)
    assert res.status_code == 422, res.text

