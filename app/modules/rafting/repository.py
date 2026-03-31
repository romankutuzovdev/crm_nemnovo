from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rafting.models import RaftingInstructor, RaftingRoute, RaftingTrip, TransportVehicle
from app.shared.base_repository import BaseRepository
from app.shared.enums import BookingStatus


class RaftingRouteRepository(BaseRepository[RaftingRoute]):
    model = RaftingRoute

    async def list(self, offset: int = 0, limit: int = 50) -> list[RaftingRoute]:
        result = await self.session.execute(
            select(RaftingRoute).order_by(RaftingRoute.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())


class RaftingInstructorRepository(BaseRepository[RaftingInstructor]):
    model = RaftingInstructor

    async def list(self, offset: int = 0, limit: int = 50) -> list[RaftingInstructor]:
        result = await self.session.execute(
            select(RaftingInstructor)
            .order_by(RaftingInstructor.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class TransportVehicleRepository(BaseRepository[TransportVehicle]):
    model = TransportVehicle

    async def list(self, offset: int = 0, limit: int = 50) -> list[TransportVehicle]:
        result = await self.session.execute(
            select(TransportVehicle)
            .order_by(TransportVehicle.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class RaftingTripRepository(BaseRepository[RaftingTrip]):
    model = RaftingTrip

    async def list_filtered(
        self,
        *,
        deal_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[RaftingTrip]:
        stmt = select(RaftingTrip)
        if deal_id is not None:
            stmt = stmt.where(RaftingTrip.deal_id == deal_id)
        if date_from is not None:
            stmt = stmt.where(RaftingTrip.trip_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(RaftingTrip.trip_date <= date_to)
        stmt = stmt.order_by(
            RaftingTrip.trip_date.desc(),
            RaftingTrip.trip_start_time.asc(),
            RaftingTrip.created_at.desc(),
        )
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_with_route_and_vehicle_for_usage(
        self,
        *,
        date_from: date,
        date_to: date,
    ) -> list[tuple[RaftingTrip, RaftingRoute, TransportVehicle | None]]:
        """Сплавы в интервале дат (по trip_date) с маршрутом и машиной; без отменённых."""
        stmt = (
            select(RaftingTrip, RaftingRoute, TransportVehicle)
            .join(RaftingRoute, RaftingTrip.route_id == RaftingRoute.id)
            .outerjoin(TransportVehicle, RaftingTrip.vehicle_id == TransportVehicle.id)
            .where(
                RaftingTrip.trip_date >= date_from,
                RaftingTrip.trip_date <= date_to,
                RaftingTrip.status != BookingStatus.CANCELLED,
            )
            .order_by(
                RaftingTrip.trip_date.asc(),
                RaftingTrip.trip_start_time.asc(),
                RaftingTrip.created_at.asc(),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.all())

