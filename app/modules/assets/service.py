from datetime import datetime
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import AssetConflictError, ConflictError, NotFoundError, ValidationError
from app.modules.assets.models import Asset, AssetMaintenance, AssetQuantityChange, Product, StockMovement
from app.modules.assets.repository import AssetRepository, AssetCategoryRepository, ProductRepository, StockMovementRepository
from app.modules.assets.schemas import (
    AssetAuditEntryResponse,
    AssetCreate,
    AssetMaintenanceCreate,
    AssetQuantityChangeResponse,
    AssetQuantitySetRequest,
    AssetUpdate,
    StockAdjustRequest,
)
from app.modules.users.models import AuditLog, User
from app.shared.enums import AssetStatus, AuditAction

logger = structlog.get_logger()


def _asset_audit_snapshot(asset: Asset) -> dict:
    return {
        "name": asset.name,
        "code": asset.code,
        "capacity": asset.capacity,
        "quantity": asset.quantity,
        "status": asset.status,
        "description": asset.description,
        "category_id": asset.category_id,
        "meta": asset.meta,
    }


class AssetService:
    ALLOWED_STATUS_TRANSITIONS: dict[AssetStatus, set[AssetStatus]] = {
        AssetStatus.ACTIVE: {AssetStatus.MAINTENANCE, AssetStatus.RETIRED},
        AssetStatus.MAINTENANCE: {AssetStatus.ACTIVE, AssetStatus.RETIRED},
        AssetStatus.RETIRED: {AssetStatus.ACTIVE},
    }

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AssetRepository(session)
        self.category_repo = AssetCategoryRepository(session)
        self.product_repo = ProductRepository(session)
        self.stock_movement_repo = StockMovementRepository(session)

    def _validate_status_transition(self, current_status: str, next_status: str) -> None:
        current = AssetStatus(current_status)
        target = AssetStatus(next_status)
        if current == target:
            return
        if target not in self.ALLOWED_STATUS_TRANSITIONS[current]:
            raise ValidationError(
                f"Недопустимый переход статуса актива: {current.value} -> {target.value}"
            )

    async def create_asset(self, data: AssetCreate, created_by: UUID) -> Asset:
        if await self.repo.get_by_code(data.code):
            raise ConflictError(f"Asset with code '{data.code}' already exists")
        category = await self.category_repo.get(data.category_id)
        if not category:
            raise NotFoundError(f"AssetCategory {data.category_id} not found")
        asset = await self.repo.create(**data.model_dump())
        logger.info("asset.created", asset_id=str(asset.id), code=asset.code)
        self.session.add(
            AssetQuantityChange(
                asset_id=asset.id,
                previous_quantity=0,
                new_quantity=int(asset.quantity),
                delta=int(asset.quantity),
                reason="Создание актива",
                created_by=created_by,
            )
        )
        await write_audit_log(
            self.session,
            created_by,
            AuditAction.CREATE,
            "assets",
            asset.id,
            after=_asset_audit_snapshot(asset),
        )
        await self.session.flush()
        return await self.repo.get_with_category_or_raise(asset.id)

    async def get_asset(self, asset_id: UUID) -> Asset:
        return await self.repo.get_with_category_or_raise(asset_id)

    async def _apply_quantity_change(
        self,
        asset_id: UUID,
        new_quantity: int,
        reason: str | None,
        user_id: UUID,
    ) -> None:
        asset = await self.repo.get_or_raise(asset_id)
        old = int(asset.quantity)
        if new_quantity < 0:
            raise ValidationError("Количество не может быть отрицательным")
        if old == new_quantity:
            return
        self.session.add(
            AssetQuantityChange(
                asset_id=asset_id,
                previous_quantity=old,
                new_quantity=new_quantity,
                delta=new_quantity - old,
                reason=reason,
                created_by=user_id,
            )
        )
        await self.repo.update(asset_id, quantity=new_quantity)

    async def update_asset(self, asset_id: UUID, data: AssetUpdate, updated_by: UUID) -> Asset:
        asset = await self.repo.get_with_category_or_raise(asset_id)
        before = _asset_audit_snapshot(asset)
        update_data = data.model_dump(exclude_none=True)
        q_raw = update_data.pop("quantity", None)
        if q_raw is not None:
            await self._apply_quantity_change(
                asset_id,
                int(q_raw),
                "Карточка актива",
                updated_by,
            )
        if "status" in update_data:
            self._validate_status_transition(asset.status, str(update_data["status"]))
        if update_data:
            asset = await self.repo.update(asset_id, **update_data)
        else:
            asset = await self.repo.get_with_category_or_raise(asset_id)
        after = _asset_audit_snapshot(asset)
        if before != after:
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "assets",
                asset_id,
                before=before,
                after=after,
            )
            await self.session.flush()
        return await self.repo.get_with_category_or_raise(asset_id)

    async def transition_asset_status(
        self, asset_id: UUID, status: AssetStatus, updated_by: UUID
    ) -> Asset:
        asset = await self.repo.get_with_category_or_raise(asset_id)
        self._validate_status_transition(asset.status, status.value)
        before = _asset_audit_snapshot(asset)
        asset = await self.repo.update(asset_id, status=status.value)
        await write_audit_log(
            self.session,
            updated_by,
            AuditAction.UPDATE,
            "assets",
            asset_id,
            before=before,
            after=_asset_audit_snapshot(asset),
        )
        await self.session.flush()
        return await self.repo.get_with_category_or_raise(asset_id)

    async def set_asset_quantity(
        self, asset_id: UUID, data: AssetQuantitySetRequest, updated_by: UUID
    ) -> Asset:
        await self.repo.get_or_raise(asset_id)
        await self._apply_quantity_change(asset_id, int(data.quantity), data.reason, updated_by)
        await self.session.flush()
        return await self.repo.get_with_category_or_raise(asset_id)

    async def list_asset_quantity_changes(
        self, asset_id: UUID, limit: int = 100
    ) -> list[AssetQuantityChangeResponse]:
        await self.repo.get_or_raise(asset_id)
        result = await self.session.execute(
            select(AssetQuantityChange, User.full_name)
            .outerjoin(User, AssetQuantityChange.created_by == User.id)
            .where(AssetQuantityChange.asset_id == asset_id)
            .order_by(AssetQuantityChange.created_at.desc())
            .limit(limit)
        )
        rows: list[AssetQuantityChangeResponse] = []
        for ch, full_name in result.all():
            rows.append(
                AssetQuantityChangeResponse(
                    id=ch.id,
                    asset_id=ch.asset_id,
                    previous_quantity=ch.previous_quantity,
                    new_quantity=ch.new_quantity,
                    delta=ch.delta,
                    reason=ch.reason,
                    created_by=ch.created_by,
                    user_name=full_name or "—",
                    created_at=ch.created_at,
                )
            )
        return rows

    async def list_asset_audit(self, asset_id: UUID, limit: int = 50) -> list[AssetAuditEntryResponse]:
        await self.repo.get_or_raise(asset_id)
        result = await self.session.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.resource == "assets", AuditLog.resource_id == asset_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        rows: list[AssetAuditEntryResponse] = []
        for log, full_name in result.all():
            payload = log.after if log.after is not None else log.before
            parts = [f"{k}: {v}" for k, v in (payload or {}).items()]
            rows.append(
                AssetAuditEntryResponse(
                    id=log.id,
                    action=log.action,
                    user_name=full_name or "—",
                    created_at=log.created_at,
                    details="; ".join(parts) if parts else "—",
                )
            )
        return rows

    async def list_asset_maintenances(
        self, asset_id: UUID, offset: int = 0, limit: int = 50
    ) -> list[AssetMaintenance]:
        await self.repo.get_or_raise(asset_id)
        return await self.repo.list_maintenances_for_asset(asset_id, offset=offset, limit=limit)

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
        maintenance = AssetMaintenance(
            asset_id=data.asset_id,
            start_date=data.start_date,
            end_date=data.end_date,
            reason=data.reason,
            created_by=created_by,
        )
        self.session.add(maintenance)
        await self.session.flush()
        await write_audit_log(
            self.session,
            created_by,
            AuditAction.UPDATE,
            "assets",
            data.asset_id,
            after={
                "maintenance_id": str(maintenance.id),
                "start_date": data.start_date.isoformat(),
                "end_date": data.end_date.isoformat(),
                "reason": data.reason,
            },
        )
        await self.session.flush()
        return maintenance

    async def adjust_product_stock(
        self,
        product_id: UUID,
        data: StockAdjustRequest,
        updated_by: UUID,
    ) -> StockMovement:
        if data.delta_qty == 0:
            raise ValidationError("Delta quantity must be non-zero")
        reason = (data.reason or "").strip() or "Продажа"

        product = await self.product_repo.get_or_raise(product_id)

        new_qty = int(product.stock_quantity) + int(data.delta_qty)
        if new_qty < 0:
            raise ValidationError(
                f"Insufficient stock for product {product.sku}: current={product.stock_quantity}, delta={data.delta_qty}"
            )

        movement = StockMovement(
            product_id=product_id,
            delta_qty=data.delta_qty,
            new_quantity=new_qty,
            reason=reason,
            created_by=updated_by,
        )
        self.session.add(movement)
        await self.session.flush()

        product.stock_quantity = new_qty

        await write_audit_log(
            self.session,
            updated_by,
            AuditAction.UPDATE,
            "products",
            product_id,
            after={"stock_quantity": new_qty, "delta_qty": data.delta_qty, "reason": reason},
        )
        await self.session.flush()

        return movement

    async def list_product_movements(
        self,
        product_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[StockMovement]:
        await self.product_repo.get_or_raise(product_id)
        return await self.stock_movement_repo.list_by_product(product_id, offset=offset, limit=limit)
