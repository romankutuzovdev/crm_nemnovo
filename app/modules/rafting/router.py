from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.deals.repository import DealRepository
from app.modules.rafting.repository import (
    RaftingInstructorRepository,
    RaftingRouteRepository,
    RaftingTripRepository,
    TransportVehicleRepository,
)
from app.modules.rafting.schedule import ensure_rafting_schedule_free
from app.modules.rafting.schemas import (
    InstructorUsageGroup,
    RaftingInstructorCreate,
    RaftingInstructorResponse,
    RaftingInstructorUpdate,
    RaftingRouteCreate,
    RaftingRouteResponse,
    RaftingRouteUpdate,
    RaftingTripCreate,
    RaftingTripResponse,
    RaftingTripUpdate,
    TransportUsageGroup,
    TransportVehicleCreate,
    TransportVehicleResponse,
    TransportVehicleUpdate,
)
from app.modules.rafting.usage import build_instructor_usage, build_transport_usage, normalize_usage_range

router = APIRouter(prefix="/rafting", tags=["rafting"])


# Routes
@router.get("/routes", response_model=list[RaftingRouteResponse])
async def list_routes(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingRouteRepository(db)
    return await repo.list(offset=offset, limit=limit)


@router.post("/routes", response_model=RaftingRouteResponse, status_code=201)
async def create_route(
    data: RaftingRouteCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingRouteRepository(db)
    return await repo.create(**data.model_dump())


@router.patch("/routes/{route_id}", response_model=RaftingRouteResponse)
async def update_route(
    route_id: UUID,
    data: RaftingRouteUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingRouteRepository(db)
    await repo.get_or_raise(route_id)
    return await repo.update(route_id, **data.model_dump(exclude_none=True))


# Instructors
@router.get("/instructors", response_model=list[RaftingInstructorResponse])
async def list_instructors(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingInstructorRepository(db)
    return await repo.list(offset=offset, limit=limit)


@router.post("/instructors", response_model=RaftingInstructorResponse, status_code=201)
async def create_instructor(
    data: RaftingInstructorCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingInstructorRepository(db)
    return await repo.create(**data.model_dump())


@router.patch("/instructors/{instructor_id}", response_model=RaftingInstructorResponse)
async def update_instructor(
    instructor_id: UUID,
    data: RaftingInstructorUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingInstructorRepository(db)
    await repo.get_or_raise(instructor_id)
    return await repo.update(instructor_id, **data.model_dump(exclude_none=True))


@router.get("/instructors/usage", response_model=list[InstructorUsageGroup])
async def list_instructors_usage(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    df, dt = normalize_usage_range(date_from, date_to)
    trip_repo = RaftingTripRepository(db)
    instr_repo = RaftingInstructorRepository(db)
    rows = await trip_repo.list_with_route_and_vehicle_for_usage(date_from=df, date_to=dt)
    instructors = await instr_repo.list(offset=0, limit=200)
    return build_instructor_usage(instructors, rows)


# Transport
@router.get("/transport", response_model=list[TransportVehicleResponse])
async def list_transport(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = TransportVehicleRepository(db)
    return await repo.list(offset=offset, limit=limit)


@router.get("/transport/usage", response_model=list[TransportUsageGroup])
async def list_transport_usage(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    df, dt = normalize_usage_range(date_from, date_to)
    trip_repo = RaftingTripRepository(db)
    veh_repo = TransportVehicleRepository(db)
    rows = await trip_repo.list_with_route_and_vehicle_for_usage(date_from=df, date_to=dt)
    vehicles = await veh_repo.list(offset=0, limit=200)
    return build_transport_usage(vehicles, rows)


@router.post("/transport", response_model=TransportVehicleResponse, status_code=201)
async def create_transport(
    data: TransportVehicleCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = TransportVehicleRepository(db)
    body = data.model_dump()
    body["brand"] = (body.get("brand") or "").strip()
    return await repo.create(**body)


@router.patch("/transport/{vehicle_id}", response_model=TransportVehicleResponse)
async def update_transport(
    vehicle_id: UUID,
    data: TransportVehicleUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = TransportVehicleRepository(db)
    await repo.get_or_raise(vehicle_id)
    body = data.model_dump(exclude_none=True)
    if "brand" in body and body["brand"] is not None:
        body["brand"] = str(body["brand"]).strip()
    return await repo.update(vehicle_id, **body)


async def _validate_trip_refs(
    db: AsyncSession,
    *,
    route_id: UUID,
    instructor_id: UUID | None,
    vehicle_id: UUID | None,
    deal_id: UUID | None,
) -> None:
    await RaftingRouteRepository(db).get_or_raise(route_id)
    if instructor_id is not None:
        await RaftingInstructorRepository(db).get_or_raise(instructor_id)
    if vehicle_id is not None:
        await TransportVehicleRepository(db).get_or_raise(vehicle_id)
    if deal_id is not None:
        await DealRepository(db).get_or_raise(deal_id)


# Заказы сплава (связь с CRM и справочниками)
@router.get("/trips", response_model=list[RaftingTripResponse])
async def list_trips(
    deal_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingTripRepository(db)
    return await repo.list_filtered(
        deal_id=deal_id, date_from=date_from, date_to=date_to, offset=offset, limit=limit
    )


@router.post("/trips", response_model=RaftingTripResponse, status_code=201)
async def create_trip(
    data: RaftingTripCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    await _validate_trip_refs(
        db,
        route_id=data.route_id,
        instructor_id=data.instructor_id,
        vehicle_id=data.vehicle_id,
        deal_id=data.deal_id,
    )
    await ensure_rafting_schedule_free(
        db,
        trip_date=data.trip_date,
        trip_start_time=data.trip_start_time,
        route_id=data.route_id,
        instructor_id=data.instructor_id,
        vehicle_id=data.vehicle_id,
    )
    repo = RaftingTripRepository(db)
    payload = data.model_dump()
    if data.instructor_id is not None:
        instr = await RaftingInstructorRepository(db).get_or_raise(data.instructor_id)
        payload["instructor_fee"] = float(instr.payout_per_trip) + float(instr.payout_per_guest) * int(data.guests_count)
    return await repo.create(**payload)


@router.patch("/trips/{trip_id}", response_model=RaftingTripResponse)
async def update_trip(
    trip_id: UUID,
    data: RaftingTripUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RaftingTripRepository(db)
    existing = await repo.get_or_raise(trip_id)
    payload = data.model_dump(exclude_unset=True, mode="python")
    route_id = payload.get("route_id", existing.route_id)
    instructor_id = payload.get("instructor_id", existing.instructor_id)
    vehicle_id = payload.get("vehicle_id", existing.vehicle_id)
    deal_id = payload.get("deal_id", existing.deal_id)
    await _validate_trip_refs(
        db,
        route_id=route_id,
        instructor_id=instructor_id,
        vehicle_id=vehicle_id,
        deal_id=deal_id,
    )
    trip_date = payload.get("trip_date", existing.trip_date)
    trip_start_time = payload.get("trip_start_time", existing.trip_start_time)
    await ensure_rafting_schedule_free(
        db,
        trip_date=trip_date,
        trip_start_time=trip_start_time,
        route_id=route_id,
        instructor_id=instructor_id,
        vehicle_id=vehicle_id,
        exclude_trip_id=trip_id,
    )
    # Пересчёт выплаты инструктору, если изменились instructor_id/guests_count, и сплав ещё не помечен как оплаченный.
    if not existing.instructor_paid and ("instructor_id" in payload or "guests_count" in payload):
        instr_id = payload.get("instructor_id", existing.instructor_id)
        guests = payload.get("guests_count", existing.guests_count)
        if instr_id is None:
            payload["instructor_fee"] = None
        else:
            instr = await RaftingInstructorRepository(db).get_or_raise(instr_id)
            payload["instructor_fee"] = float(instr.payout_per_trip) + float(instr.payout_per_guest) * int(guests)
    return await repo.update(trip_id, **payload)


@router.post("/trips/{trip_id}/mark-paid", response_model=RaftingTripResponse)
async def mark_trip_paid(
    trip_id: UUID,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    """Пометить выплату инструктору по конкретному сплаву как произведённую."""
    repo = RaftingTripRepository(db)
    trip = await repo.get_or_raise(trip_id)
    if trip.instructor_id is None:
        from app.core.exceptions import ValidationError

        raise ValidationError("Trip has no instructor")
    if trip.instructor_paid:
        return trip
    return await repo.update(
        trip_id,
        instructor_paid=True,
        instructor_paid_at=datetime.now(timezone.utc),
        instructor_paid_by=current_user.id,
    )

