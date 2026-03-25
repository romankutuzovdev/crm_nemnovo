from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.calendar.repository import CalendarRepository
from pydantic import BaseModel

from app.modules.calendar.schemas import CalendarEventResponse, CalendarQuickCreate


class BookingMoveRequest(BaseModel):
    start: str
    end: str


from app.modules.deals.schemas import BookingInDealCreate, DealCreate, DealItemCreate

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events", response_model=list[CalendarEventResponse])
async def get_calendar_events(
    start: date = Query(...),
    end: date = Query(...),
    asset_id: UUID | None = Query(None),
    manager_id: UUID | None = Query(None, description="Фильтр по менеджеру"),
    current_user=require_permission("bookings", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Получить события календаря: бронирования и заявки. День/неделя/месяц — через start/end."""
    # Менеджер видит только свои события
    if current_user.role.name == "manager":
        manager_id = current_user.id
    repo = CalendarRepository(db)
    events = await repo.get_events(start, end, asset_id=asset_id, manager_id=manager_id)
    return events


@router.patch("/events/booking/{booking_id}")
async def move_booking(
    booking_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Перемещение бронирования (drag-drop)."""
    from datetime import datetime
    from sqlalchemy import select
    from app.modules.bookings.models import Booking
    from app.core.exceptions import NotFoundError, AssetConflictError
    from app.modules.assets.repository import AssetRepository

    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise NotFoundError("Бронирование не найдено")
    start_dt = datetime.fromisoformat(data.start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(data.end.replace("Z", "+00:00"))

    asset_repo = AssetRepository(db)
    has_conflict = await asset_repo.has_conflict(booking.asset_id, start_dt, end_dt, exclude_booking_id=booking_id)
    if has_conflict:
        raise AssetConflictError("Выбранное время занято")

    booking.start_datetime = start_dt
    booking.end_datetime = end_dt
    return {"ok": True}


@router.post("/events", status_code=201)
async def create_calendar_event(
    data: CalendarQuickCreate,
    current_user=require_permission("deals", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Быстрое создание бронирования из календаря (клик по дате)."""
    from app.modules.deals.service import DealService

    deal_data = DealCreate(
        client_id=data.client_id,
        lead_id=None,
        service_type=data.service_type,
        start_date=data.start_datetime.date(),
        end_date=data.end_datetime.date(),
        guests_count=data.guests_count,
        notes=data.notes,
        items=[DealItemCreate(description="Бронирование", quantity=1, unit_price=0)],
        bookings=[
            BookingInDealCreate(
                asset_id=data.asset_id,
                start_datetime=data.start_datetime,
                end_datetime=data.end_datetime,
            )
        ],
    )
    service = DealService(db)
    deal = await service.create_deal(deal_data, created_by=current_user.id)
    return {"id": str(deal.id), "message": "Сделка создана"}
