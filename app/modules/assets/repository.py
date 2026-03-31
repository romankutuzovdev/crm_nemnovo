from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.modules.assets.models import Asset, AssetCategory, AssetMaintenance, Product, StockMovement
from app.modules.bookings.models import Booking
from app.shared.base_repository import BaseRepository
from app.shared.enums import AssetStatus, BookingStatus


class AssetRepository(BaseRepository[Asset]):
    model = Asset

    async def list(self, offset: int = 0, limit: int = 50) -> list[Asset]:
        result = await self.session.execute(
            select(Asset)
            .options(selectinload(Asset.category))
            .order_by(Asset.code.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_with_category(self, asset_id: UUID) -> Asset | None:
        result = await self.session.execute(
            select(Asset).options(selectinload(Asset.category)).where(Asset.id == asset_id)
        )
        return result.scalar_one_or_none()

    async def get_with_category_or_raise(self, asset_id: UUID) -> Asset:
        a = await self.get_with_category(asset_id)
        if a is None:
            raise NotFoundError(f"Asset {asset_id} not found")
        return a

    async def list_maintenances_for_asset(
        self, asset_id: UUID, offset: int = 0, limit: int = 50
    ) -> list[AssetMaintenance]:
        result = await self.session.execute(
            select(AssetMaintenance)
            .where(AssetMaintenance.asset_id == asset_id)
            .order_by(AssetMaintenance.start_date.desc(), AssetMaintenance.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

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
                    AssetMaintenance.start_date <= start.date(),
                    AssetMaintenance.end_date >= start.date(),
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

        stmt = stmt.options(selectinload(Asset.category))
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

    async def list(self, offset: int = 0, limit: int = 50) -> list[Product]:
        result = await self.session.execute(
            select(Product)
            .order_by(Product.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class StockMovementRepository(BaseRepository[StockMovement]):
    model = StockMovement

    async def list_by_product(self, product_id: UUID, offset: int = 0, limit: int = 50) -> list[StockMovement]:
        result = await self.session.execute(
            select(StockMovement)
            .where(StockMovement.product_id == product_id)
            .order_by(StockMovement.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())
