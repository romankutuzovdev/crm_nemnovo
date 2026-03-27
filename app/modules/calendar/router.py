from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.calendar.repository import CalendarRepository
from app.shared.enums import ServiceType
from pydantic import BaseModel

from app.modules.calendar.schemas import (
    CalendarEventMultiCreate,
    CalendarEventResponse,
    CalendarQuickCreate,
)


class BookingMoveRequest(BaseModel):
    start: str
    end: str


from app.modules.orders.schemas import BookingInOrderCreate, OrderCreate, OrderItemCreate

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events", response_model=list[CalendarEventResponse])
async def get_calendar_events(
    start: date = Query(...),
    end: date = Query(...),
    asset_id: UUID | None = Query(None),
    manager_id: UUID | None = Query(None, description="Фильтр по менеджеру"),
    service_type: ServiceType | None = Query(None, description="Тип услуги заказа / заявки"),
    current_user=require_permission("bookings", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Получить события календаря: бронирования и заявки. День/неделя/месяц — через start/end."""
    # Менеджер видит только свои события
    if current_user.role.name == "manager":
        manager_id = current_user.id
    repo = CalendarRepository(db)
    st = service_type.value if service_type else None
    events = await repo.get_events(
        start, end, asset_id=asset_id, manager_id=manager_id, service_type=st
    )
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
        raise AssetConflictError()

    booking.start_datetime = start_dt
    booking.end_datetime = end_dt
    return {"ok": True}


@router.post("/events", status_code=201)
async def create_calendar_event(
    data: CalendarQuickCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Быстрое создание бронирования из календаря (клик по дате)."""
    from app.modules.orders.service import OrderService

    order_data = OrderCreate(
        client_id=data.client_id,
        lead_id=None,
        service_type=data.service_type,
        start_date=data.start_datetime.date(),
        end_date=data.end_datetime.date(),
        guests_count=data.guests_count,
        notes=data.notes,
        items=[OrderItemCreate(description="Бронирование", quantity=1, unit_price=0)],
        bookings=[
            BookingInOrderCreate(
                asset_id=data.asset_id,
                start_datetime=data.start_datetime,
                end_datetime=data.end_datetime,
            )
        ],
    )
    service = OrderService(db)
    order = await service.create_order(order_data, created_by=current_user.id)
    return {"id": str(order.id), "message": "Заказ создан"}


@router.post("/events/multi", status_code=201)
async def create_calendar_multi_event(
    data: CalendarEventMultiCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Создание одной карточки мероприятия с набором услуг и слотов."""
    from app.core.exceptions import AssetConflictError, ValidationError
    from app.modules.assets.repository import AssetRepository
    from app.modules.deals.repository import DealRepository
    from app.modules.orders.service import OrderService
    from app.modules.users.assignment import pick_manager_by_load

    if not data.services:
        raise ValidationError("Нужно добавить хотя бы одну услугу")
    if not data.slots:
        raise ValidationError("Нужно добавить хотя бы один слот")

    # Проверяем конфликты по всем слотам заранее
    asset_repo = AssetRepository(db)
    for slot in data.slots:
        has_conflict = await asset_repo.has_conflict(
            slot.asset_id,
            slot.start_datetime,
            slot.end_datetime,
        )
        if has_conflict:
            raise AssetConflictError()

    min_start = min(slot.start_datetime for slot in data.slots)
    max_end = max(slot.end_datetime for slot in data.slots)
    picked_manager_id = await pick_manager_by_load(db)
    assigned_to = picked_manager_id or current_user.id

    order_data = OrderCreate(
        client_id=data.client_id,
        lead_id=None,
        service_type=ServiceType.COMBINED,
        start_date=min_start.date(),
        end_date=max_end.date(),
        guests_count=data.guests_count,
        notes=data.notes,
        items=[
            OrderItemCreate(
                description=f"[{line.service_type.value}] {line.description}",
                quantity=line.quantity,
                unit_price=line.unit_price,
            )
            for line in data.services
        ],
        bookings=[
            BookingInOrderCreate(
                asset_id=slot.asset_id,
                start_datetime=slot.start_datetime,
                end_datetime=slot.end_datetime,
                quantity=slot.quantity,
            )
            for slot in data.slots
        ],
    )
    service = OrderService(db)
    order = await service.create_order(order_data, created_by=current_user.id)
    if assigned_to != current_user.id:
        await DealRepository(db).update(order.id, assigned_to=assigned_to)
    return {"id": str(order.id), "assigned_to": str(assigned_to), "message": "Мероприятие создано"}
