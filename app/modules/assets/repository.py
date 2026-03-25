from datetime import datetime

from sqlalchemy import and_, func, not_, or_, select

from app.modules.assets.models import Asset, AssetCategory, AssetMaintenance, Product
from app.modules.bookings.models import Booking
from app.shared.base_repository import BaseRepository
from app.shared.enums import AssetStatus, BookingStatus


class AssetRepository(BaseRepository[Asset]):
    model = Asset

    async def get_by_code(self, code: str) -> Asset | None:
        result = await self.session.execute(select(Asset).where(Asset.code == code))
        return result.scalar_one_or_none()

    async def list_available(
        self,
        start: datetime,
        end: datetime,
        category_id: int | None = None,
    ) -> list[Asset]:
        """Return assets that have NO confirmed bookings overlapping [start, end]."""
        conflicting_asset_ids = (
            select(Booking.asset_id)
            .where(
                and_(
                    Booking.status != BookingStatus.CANCELLED,
                    Booking.start_datetime < end,
                    Booking.end_datetime > start,
                )
            )
        )
        # Also exclude assets under maintenance
        maintenance_asset_ids = (
            select(AssetMaintenance.asset_id)
            .where(
                and_(
                    func.cast(AssetMaintenance.start_date, type_=None) <= start.date(),
                    func.cast(AssetMaintenance.end_date, type_=None) >= start.date(),
                )
            )
        )

        stmt = select(Asset).where(
            and_(
                Asset.status == AssetStatus.ACTIVE,
                Asset.id.not_in(conflicting_asset_ids),
                Asset.id.not_in(maintenance_asset_ids),
            )
        )
        if category_id:
            stmt = stmt.where(Asset.category_id == category_id)

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def has_conflict(
        self,
        asset_id,
        start: datetime,
        end: datetime,
        exclude_booking_id=None,
    ) -> bool:
        stmt = select(func.count()).select_from(Booking).where(
            and_(
                Booking.asset_id == asset_id,
                Booking.status != BookingStatus.CANCELLED,
                Booking.start_datetime < end,
                Booking.end_datetime > start,
            )
        )
        if exclude_booking_id:
            stmt = stmt.where(Booking.id != exclude_booking_id)
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0


class AssetCategoryRepository(BaseRepository[AssetCategory]):
    model = AssetCategory


class ProductRepository(BaseRepository[Product]):
    model = Product
