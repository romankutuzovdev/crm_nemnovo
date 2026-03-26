from datetime import date, datetime
from uuid import UUID

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import AssetStatus


class AssetCategoryResponse(BaseSchema):
    id: int
    name: str


class AssetCreate(BaseSchema):
    category_id: int
    name: str
    code: str
    capacity: int = 1
    description: str | None = None
    meta: dict | None = None


class AssetUpdate(BaseSchema):
    name: str | None = None
    capacity: int | None = None
    status: AssetStatus | None = None
    description: str | None = None
    meta: dict | None = None


class AssetResponse(UUIDSchema):
    category: AssetCategoryResponse
    name: str
    code: str
    capacity: int
    status: str
    description: str | None
    meta: dict | None = None


class AssetAuditEntryResponse(UUIDSchema):
    action: str
    user_name: str
    created_at: datetime
    details: str


class AssetStatusPatch(BaseSchema):
    status: AssetStatus


class AssetMaintenanceResponse(UUIDSchema):
    asset_id: UUID
    start_date: date
    end_date: date
    reason: str | None
    created_by: UUID
    created_at: datetime


class AssetMaintenanceCreate(BaseSchema):
    asset_id: UUID
    start_date: date
    end_date: date
    reason: str | None = None


class AssetAvailabilityRequest(BaseSchema):
    start: datetime
    end: datetime
    category_id: int | None = None


class ProductCreate(BaseSchema):
    name: str
    sku: str
    category: str | None = None
    unit: str = "pcs"
    price: float
    stock_quantity: int = 0
    is_rentable: bool = False


class ProductResponse(UUIDSchema):
    name: str
    sku: str
    category: str | None
    unit: str
    price: float
    stock_quantity: int
    is_rentable: bool


class StockAdjustRequest(BaseSchema):
    delta_qty: int
    reason: str | None = None


class StockMovementResponse(UUIDSchema):
    product_id: UUID
    delta_qty: int
    new_quantity: int
    reason: str | None
    created_by: UUID
    created_at: datetime
