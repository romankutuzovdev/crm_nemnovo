from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.calendar.repository import CalendarRepository
from app.modules.ui_settings.repository import UiSettingsRepository
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
    ui_repo = UiSettingsRepository(db)
    color_map = await ui_repo.get_calendar_colors()
    repo = CalendarRepository(db)
    st = service_type.value if service_type else None
    events = await repo.get_events(
        start,
        end,
        asset_id=asset_id,
        manager_id=manager_id,
        service_type=st,
        color_map=color_map,
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


@router.patch("/events/deal/{deal_id}")
async def move_deal_bookings(
    deal_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Сдвиг всех бронирований сделки на одно и то же Δt (перетаскивание блока в календаре)."""
    from datetime import datetime

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.exceptions import AssetConflictError, NotFoundError
    from app.modules.assets.repository import AssetRepository
    from app.modules.deals.models import Deal
    from app.shared.enums import BookingStatus

    result = await db.execute(
        select(Deal)
        .options(selectinload(Deal.bookings))
        .where(Deal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise NotFoundError("Сделка не найдена")
    active = [b for b in deal.bookings if b.status != BookingStatus.CANCELLED.value]
    if not active:
        raise NotFoundError("Нет активных бронирований для переноса")
    old_start = min(b.start_datetime for b in active)
    new_start = datetime.fromisoformat(data.start.replace("Z", "+00:00")).replace(tzinfo=None)
    delta = new_start - old_start
    asset_repo = AssetRepository(db)
    for b in active:
        ns = b.start_datetime + delta
        ne = b.end_datetime + delta
        has_conflict = await asset_repo.has_conflict(b.asset_id, ns, ne, exclude_booking_id=b.id)
        if has_conflict:
            raise AssetConflictError()
    for b in active:
        b.start_datetime = b.start_datetime + delta
        b.end_datetime = b.end_datetime + delta
    return {"ok": True}


@router.patch("/events/lead/{lead_id}")
async def move_lead_event(
    lead_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("leads", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Перемещение заявки (lead) простым переносом даты в календаре."""
    from datetime import datetime

    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.modules.leads.models import Lead

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        # Если заявки нет (рассинхрон данных), просто тихо выходим без ошибки,
        # чтобы drag-and-drop не ломал UX.
        return {"ok": False}

    start_dt = datetime.fromisoformat(data.start.replace("Z", "+00:00"))
    # UI sends local naive ISO. Keep lead.preferred_datetime as naive for consistency.
    lead.preferred_datetime = start_dt.replace(tzinfo=None)
    lead.preferred_date = lead.preferred_datetime.date()
    return {"ok": True}


@router.patch("/events/hostel/{booking_id}")
async def move_hostel_booking(
    booking_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Перемещение хостел-бронирования (drag-drop) — сдвиг check_in/check_out по дням."""
    from datetime import datetime, timedelta

    from sqlalchemy import select

    from app.core.exceptions import ConflictError, NotFoundError, ValidationError
    from app.modules.hostel.models import HostelBooking
    from app.modules.hostel.repository import HostelBookingRepository

    row = await db.execute(select(HostelBooking).where(HostelBooking.id == booking_id))
    hb = row.scalar_one_or_none()
    if not hb:
        raise NotFoundError("Бронирование хостела не найдено")

    start_dt = datetime.fromisoformat(data.start.replace("Z", "+00:00"))
    new_check_in = start_dt.date()
    nights = (hb.check_out - hb.check_in).days
    if nights < 1:
        raise ValidationError("Некорректные даты бронирования")
    new_check_out = new_check_in + timedelta(days=nights)

    repo = HostelBookingRepository(db)
    if await repo.has_overlap(hb.room_id, new_check_in, new_check_out, exclude_booking_id=hb.id):
        raise ConflictError("Номер занят на выбранные даты")

    hb.check_in = new_check_in
    hb.check_out = new_check_out
    return {"ok": True}


@router.patch("/events/rent/{order_id}")
async def move_rent_order(
    order_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("bookings", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Перемещение аренды (drag-drop) — меняем service_date по дате start."""
    from datetime import datetime

    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.modules.rent.models import RentOrder

    row = await db.execute(select(RentOrder).where(RentOrder.id == order_id))
    ro = row.scalar_one_or_none()
    if not ro:
        raise NotFoundError("Аренда не найдена")

    start_dt = datetime.fromisoformat(data.start.replace("Z", "+00:00"))
    ro.service_date = start_dt.date()
    return {"ok": True}


@router.patch("/events/rafting/{trip_id}")
async def move_rafting_trip(
    trip_id: UUID,
    data: BookingMoveRequest,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Перемещение сплава (drag-drop) — меняем дату/время начала с проверкой занятости."""
    from datetime import datetime

    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.modules.rafting.models import RaftingTrip
    from app.modules.rafting.schedule import ensure_rafting_schedule_free

    row = await db.execute(select(RaftingTrip).where(RaftingTrip.id == trip_id))
    trip = row.scalar_one_or_none()
    if not trip:
        raise NotFoundError("Сплав не найден")

    start_dt = datetime.fromisoformat(data.start.replace("Z", "+00:00"))
    new_date = start_dt.date()
    # DB хранит naive time (без tzinfo), поэтому приводим к naive.
    new_time = start_dt.time().replace(microsecond=0, tzinfo=None)

    await ensure_rafting_schedule_free(
        db,
        trip_date=new_date,
        trip_start_time=new_time,
        route_id=trip.route_id,
        instructor_id=trip.instructor_id,
        vehicle_id=trip.vehicle_id,
        exclude_trip_id=trip.id,
    )

    trip.trip_date = new_date
    trip.trip_start_time = new_time
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
        contract_id=data.contract_id,
        contract_text=data.contract_text,
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
    current_user=require_permission("leads", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Создание заявки из формы мероприятия (участники, услуги, слоты — в заявке до конвертации в заказ)."""
    from app.core.exceptions import ValidationError
    from app.modules.assets.repository import AssetRepository
    from app.modules.clients.repository import ClientRepository
    from app.modules.clients.service import ClientService
    from app.modules.leads.service import LeadService
    from app.modules.users.assignment import pick_manager_by_load

    if not data.participants:
        raise ValidationError("Нужно добавить хотя бы одного участника с услугой")
    if not data.slots and data.preferred_datetime is None:
        raise ValidationError("Укажите время мероприятия или добавьте слот")

    min_start = min((slot.start_datetime for slot in data.slots), default=data.preferred_datetime)
    max_end = max((slot.end_datetime for slot in data.slots), default=data.preferred_datetime)
    if min_start is None or max_end is None:
        raise ValidationError("Не удалось определить время мероприятия")
    picked_manager_id = await pick_manager_by_load(db)
    assigned_to = picked_manager_id or current_user.id

    client_service = ClientService(db)
    client_repo = ClientRepository(db)
    asset_repo = AssetRepository(db)
    participant_client_ids: list[UUID] = []
    for p in data.participants:
        if p.new_client is not None:
            nc = p.new_client
            client, _ = await client_service.find_or_create_by_phone(
                phone=nc.phone,
                first_name=nc.first_name,
                last_name=nc.last_name,
                email=nc.email,
                source="calendar_event",
                created_by=current_user.id,
            )
            participant_client_ids.append(client.id)
        elif p.client_id is not None:
            await client_repo.get_or_raise(p.client_id)
            participant_client_ids.append(p.client_id)

    primary_client_id = participant_client_ids[0]
    guests = max(data.guests_count, len(data.participants))

    comment_lines: list[str] = []
    if data.notes and data.notes.strip():
        comment_lines.append(data.notes.strip())
    if data.contract_text and data.contract_text.strip():
        comment_lines.append(f"Договор (текст): {data.contract_text.strip()}")
    if data.contract_id:
        comment_lines.append(f"Договор (id в системе): {data.contract_id}")
    # Услуги храним структурно в lead_service_items (см. LeadService.create_from_calendar_multi),
    # чтобы их можно было редактировать и видеть в истории. В комментарий не дублируем.
    if data.slots:
        comment_lines.append("Планируемые слоты:")
        for slot in data.slots:
            a = await asset_repo.get_or_raise(slot.asset_id)
            comment_lines.append(
                f"  • {a.name}: {slot.start_datetime.isoformat()} — {slot.end_datetime.isoformat()}"
                f"{f' ×{slot.quantity}' if slot.quantity != 1 else ''}"
            )
    comment = "\n".join(comment_lines)

    raw_payload = data.model_dump(mode="json")
    raw_payload["calendar_slot_end_date"] = max_end.date().isoformat()

    lead_service = LeadService(db)
    lead = await lead_service.create_from_calendar_multi(
        primary_client_id=primary_client_id,
        guests_count=guests,
        preferred_date=min_start.date(),
        comment=comment,
        raw_payload=raw_payload,
        excursion_guide_id=data.excursion_guide_id,
        assigned_to=assigned_to,
        created_by=current_user.id,
    )
    return {
        "id": str(lead.id),
        "lead_id": str(lead.id),
        "assigned_to": str(assigned_to),
        "message": "Заявка создана",
    }
