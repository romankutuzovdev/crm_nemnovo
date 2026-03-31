"""Проверка занятости транспорта и инструктора по времени сплава."""

from datetime import date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AssetConflictError
from app.modules.rafting.models import RaftingRoute, RaftingTrip
from app.shared.enums import BookingStatus

_DEFAULT_DURATION_H = 4
_MAX_DURATION_H = 72


def _duration_hours_from_route(route: RaftingRoute | None) -> int:
    d = route.duration_hours if route is not None else None
    if d is None or d < 1:
        return _DEFAULT_DURATION_H
    return min(int(d), _MAX_DURATION_H)


def _trip_window(
    trip_date: date,
    trip_start_time: time | None,
    route: RaftingRoute | None,
) -> tuple[datetime, datetime]:
    """Полуинтервал [start, end) в наивном локальном времени для сравнений."""
    if trip_start_time is None:
        start = datetime.combine(trip_date, time.min)
        end = start + timedelta(days=1)
        return start, end
    dur = _duration_hours_from_route(route)
    start = datetime.combine(trip_date, trip_start_time)
    end = start + timedelta(hours=dur)
    return start, end


def trip_window(
    *,
    trip_date: date,
    trip_start_time: time | None,
    route: RaftingRoute | None,
) -> tuple[datetime, datetime]:
    """Окно сплава для календаря/проверок: полуинтервал [start, end) в наивном локальном времени."""
    return _trip_window(trip_date, trip_start_time, route)


def _windows_overlap(
    a: tuple[datetime, datetime],
    b: tuple[datetime, datetime],
) -> bool:
    a_start, a_end = a
    b_start, b_end = b
    return a_start < b_end and b_start < a_end


async def ensure_rafting_schedule_free(
    session: AsyncSession,
    *,
    trip_date: date,
    trip_start_time: time | None,
    route_id: UUID,
    instructor_id: UUID | None,
    vehicle_id: UUID | None,
    exclude_trip_id: UUID | None = None,
) -> None:
    """
    Бросает AssetConflictError, если инструктор или транспорт уже заняты
    пересекающимся по времени сплавом (pending / confirmed).
    """
    if instructor_id is None and vehicle_id is None:
        return

    route_row = await session.execute(select(RaftingRoute).where(RaftingRoute.id == route_id).limit(1))
    new_route = route_row.scalar_one_or_none()
    new_win = _trip_window(trip_date, trip_start_time, new_route)

    date_low = min(new_win[0].date(), new_win[1].date()) - timedelta(days=1)
    date_high = max(new_win[0].date(), new_win[1].date()) + timedelta(days=1)

    resource_conds = []
    if vehicle_id is not None:
        resource_conds.append(
            and_(RaftingTrip.vehicle_id == vehicle_id, RaftingTrip.vehicle_id.isnot(None))
        )
    if instructor_id is not None:
        resource_conds.append(
            and_(
                RaftingTrip.instructor_id == instructor_id,
                RaftingTrip.instructor_id.isnot(None),
            )
        )

    stmt = (
        select(RaftingTrip, RaftingRoute)
        .join(RaftingRoute, RaftingTrip.route_id == RaftingRoute.id)
        .where(
            RaftingTrip.trip_date >= date_low,
            RaftingTrip.trip_date <= date_high,
            RaftingTrip.status != BookingStatus.CANCELLED,
            or_(*resource_conds),
        )
    )
    if exclude_trip_id is not None:
        stmt = stmt.where(RaftingTrip.id != exclude_trip_id)

    result = await session.execute(stmt)
    for trip, r in result.all():
        other_win = _trip_window(trip.trip_date, trip.trip_start_time, r)
        if not _windows_overlap(new_win, other_win):
            continue
        if vehicle_id is not None and trip.vehicle_id == vehicle_id:
            raise AssetConflictError(
                detail="Транспорт уже назначен на пересекающееся время другого сплава",
            )
        if instructor_id is not None and trip.instructor_id == instructor_id:
            raise AssetConflictError(
                detail="Инструктор уже занят в это время другим сплавом",
            )
