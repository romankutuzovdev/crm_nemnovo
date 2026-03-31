from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from app.core.exceptions import ValidationError
from app.modules.rafting.models import RaftingInstructor, RaftingRoute, RaftingTrip, TransportVehicle
from app.modules.rafting.schemas import (
    InstructorUsageGroup,
    RaftingInstructorResponse,
    RaftingTripUsageSlot,
    TransportUsageGroup,
    TransportVehicleResponse,
)


def normalize_usage_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    if date_from is None:
        date_from = date.today()
    if date_to is None:
        date_to = date_from + timedelta(days=62)
    if date_to < date_from:
        raise ValidationError("Конец периода не раньше начала")
    return date_from, date_to


def _vehicle_summary(veh: TransportVehicle | None) -> str | None:
    if veh is None:
        return None
    label = " ".join(p for p in (veh.brand, veh.model or "") if p).strip()
    if veh.plate_number:
        suffix = veh.plate_number
        return f"{label} · {suffix}" if label else suffix
    return label or None


def trip_to_usage_slot(
    trip: RaftingTrip,
    route: RaftingRoute,
    joined_vehicle: TransportVehicle | None,
) -> RaftingTripUsageSlot:
    return RaftingTripUsageSlot(
        trip_id=trip.id,
        trip_date=trip.trip_date,
        trip_start_time=trip.trip_start_time,
        duration_hours=route.duration_hours,
        route_id=route.id,
        route_name=route.name,
        guests_count=trip.guests_count,
        status=trip.status,
        deal_id=trip.deal_id,
        vehicle_summary=_vehicle_summary(joined_vehicle),
    )


def build_transport_usage(
    vehicles: list[TransportVehicle],
    rows: list[tuple[RaftingTrip, RaftingRoute, TransportVehicle | None]],
) -> list[TransportUsageGroup]:
    by_v: dict[UUID, list[RaftingTripUsageSlot]] = defaultdict(list)
    for trip, route, jveh in rows:
        if trip.vehicle_id is None:
            continue
        by_v[trip.vehicle_id].append(trip_to_usage_slot(trip, route, jveh))
    return [
        TransportUsageGroup(
            vehicle=TransportVehicleResponse.model_validate(v),
            events=by_v.get(v.id, []),
        )
        for v in sorted(vehicles, key=lambda x: (x.brand.lower(), (x.model or "").lower(), x.plate_number or ""))
    ]


def build_instructor_usage(
    instructors: list[RaftingInstructor],
    rows: list[tuple[RaftingTrip, RaftingRoute, TransportVehicle | None]],
) -> list[InstructorUsageGroup]:
    by_i: dict[UUID, list[RaftingTripUsageSlot]] = defaultdict(list)
    for trip, route, jveh in rows:
        if trip.instructor_id is None:
            continue
        by_i[trip.instructor_id].append(trip_to_usage_slot(trip, route, jveh))
    return [
        InstructorUsageGroup(
            instructor=RaftingInstructorResponse.model_validate(i),
            events=by_i.get(i.id, []),
        )
        for i in sorted(instructors, key=lambda x: x.full_name.lower())
    ]
