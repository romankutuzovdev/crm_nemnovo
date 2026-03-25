from datetime import datetime
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AssetConflictError, ConflictError, NotFoundError
from app.modules.assets.models import Asset
from app.modules.assets.repository import AssetRepository, AssetCategoryRepository
from app.modules.assets.schemas import AssetCreate, AssetMaintenanceCreate, AssetUpdate

logger = structlog.get_logger()


class AssetService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AssetRepository(session)
        self.category_repo = AssetCategoryRepository(session)

    async def create_asset(self, data: AssetCreate, created_by: UUID) -> Asset:
        if await self.repo.get_by_code(data.code):
            raise ConflictError(f"Asset with code '{data.code}' already exists")
        category = await self.category_repo.get(data.category_id)
        if not category:
            raise NotFoundError(f"AssetCategory {data.category_id} not found")
        asset = await self.repo.create(**data.model_dump())
        logger.info("asset.created", asset_id=str(asset.id), code=asset.code)
        return asset

    async def update_asset(self, asset_id: UUID, data: AssetUpdate) -> Asset:
        await self.repo.get_or_raise(asset_id)
        return await self.repo.update(asset_id, **data.model_dump(exclude_none=True))

    async def check_availability(
        self,
        asset_id: UUID,
        start: datetime,
        end: datetime,
        exclude_booking_id: UUID | None = None,
    ) -> bool:
        has_conflict = await self.repo.has_conflict(asset_id, start, end, exclude_booking_id)
        return not has_conflict

    async def get_available_assets(
        self,
        start: datetime,
        end: datetime,
        category_id: int | None = None,
    ) -> list[Asset]:
        return await self.repo.list_available(start, end, category_id)

    async def add_maintenance(self, data: AssetMaintenanceCreate, created_by: UUID):
        asset = await self.repo.get_or_raise(data.asset_id)
        # Check for booking conflicts during maintenance period
        from datetime import time
        start_dt = datetime.combine(data.start_date, time.min)
        end_dt = datetime.combine(data.end_date, time.max)
        if await self.repo.has_conflict(data.asset_id, start_dt, end_dt):
            raise ConflictError(
                f"Asset '{asset.name}' has bookings during maintenance period"
            )
        from app.modules.assets.models import AssetMaintenance
        maintenance = AssetMaintenance(
            asset_id=data.asset_id,
            start_date=data.start_date,
            end_date=data.end_date,
            reason=data.reason,
            created_by=created_by,
        )
        self.session.add(maintenance)
        await self.session.flush()
        return maintenance
