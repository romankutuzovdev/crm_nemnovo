from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.hostel.repository import HostelBookingRepository, HostelRoomRepository, compute_hostel_booking_total
from app.modules.hostel.schemas import (
    HostelBookingCreate,
    HostelBookingResponse,
    HostelBookingUpdate,
    HostelRoomCreate,
    HostelRoomResponse,
    HostelRoomUpdate,
)

router = APIRouter(prefix="/hostel", tags=["hostel"])


@router.get("/rooms", response_model=list[HostelRoomResponse])
async def list_rooms(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = HostelRoomRepository(db)
    return await repo.list(offset=offset, limit=limit)


@router.post("/rooms", response_model=HostelRoomResponse, status_code=201)
async def create_room(
    data: HostelRoomCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = HostelRoomRepository(db)
    code = data.code.strip()
    if await repo.get_by_code(code):
        raise ConflictError("Номер с таким кодом уже есть")
    payload = data.model_dump()
    payload["code"] = code
    try:
        return await repo.create(**payload)
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Номер с таким кодом уже есть") from None


@router.patch("/rooms/{room_id}", response_model=HostelRoomResponse)
async def update_room(
    room_id: UUID,
    data: HostelRoomUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = HostelRoomRepository(db)
    await repo.get_or_raise(room_id)
    payload = data.model_dump(exclude_none=True)
    if "code" in payload:
        other = await repo.get_by_code(payload["code"].strip())
        if other is not None and other.id != room_id:
            raise ConflictError("Номер с таким кодом уже есть")
        payload["code"] = payload["code"].strip()
    try:
        return await repo.update(room_id, **payload)
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Номер с таким кодом уже есть") from None


@router.get("/bookings", response_model=list[HostelBookingResponse])
async def list_bookings(
    room_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = HostelBookingRepository(db)
    return await repo.list_filtered(
        room_id=room_id, date_from=date_from, date_to=date_to, offset=offset, limit=limit
    )


@router.post("/bookings", response_model=HostelBookingResponse, status_code=201)
async def create_booking(
    data: HostelBookingCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    room_repo = HostelRoomRepository(db)
    await room_repo.get_or_raise(data.room_id)
    booking_repo = HostelBookingRepository(db)
    guests_payload = [g.model_dump() for g in data.guests]
    total_amount = compute_hostel_booking_total(
        data.check_in,
        data.check_out,
        data.guests_count,
        data.price_per_person_per_night,
    )
    return await booking_repo.create_with_guests(
        room_id=data.room_id,
        deal_id=data.deal_id,
        check_in=data.check_in,
        check_out=data.check_out,
        guests_count=data.guests_count,
        price_per_person_per_night=data.price_per_person_per_night,
        total_amount=total_amount,
        status=data.status,
        notes=data.notes,
        guests=guests_payload,
    )


@router.get("/bookings/{booking_id}", response_model=HostelBookingResponse)
async def get_booking(
    booking_id: UUID,
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = HostelBookingRepository(db)
    return await repo.get_with_guests_or_raise(booking_id)


@router.patch("/bookings/{booking_id}", response_model=HostelBookingResponse)
async def update_booking(
    booking_id: UUID,
    data: HostelBookingUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    booking_repo = HostelBookingRepository(db)
    raw = data.model_dump(exclude_unset=True, mode="python")
    if "guests" in raw and not raw["guests"]:
        raise ValidationError("Добавьте хотя бы одного гостя")
    if "room_id" in raw:
        room_repo = HostelRoomRepository(db)
        await room_repo.get_or_raise(raw["room_id"])
    return await booking_repo.apply_booking_patch(booking_id, raw)
