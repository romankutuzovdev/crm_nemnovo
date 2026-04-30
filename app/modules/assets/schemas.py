from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from app.shared.base_schema import BaseSchema, UUIDSchema
from app.shared.enums import AssetStatus


class AssetCategoryResponse(BaseSchema):
    id: int
    name: str


class AssetCreate(BaseSchema):
    category_id: int
    name: str
    code: str
    capacity: int = Field(default=1, ge=1)
    quantity: int = Field(default=1, ge=0)
    description: str | None = None
    meta: dict | None = None


class AssetUpdate(BaseSchema):
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    quantity: int | None = Field(default=None, ge=0)
    status: AssetStatus | None = None
    description: str | None = None
    meta: dict | None = None


class AssetResponse(UUIDSchema):
    category: AssetCategoryResponse
    name: str
    code: str
    capacity: int
    quantity: int
    status: str
    description: str | None
    meta: dict | None = None


class AssetQuantitySetRequest(BaseSchema):
    quantity: int = Field(..., ge=0)
    reason: str | None = None


class AssetQuantityChangeResponse(UUIDSchema):
    asset_id: UUID
    previous_quantity: int
    new_quantity: int
    delta: int
    reason: str | None
    created_by: UUID
    user_name: str
    created_at: datetime


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


class ProductDailySalesRow(BaseSchema):
    product_id: UUID
    name: str
    sku: str
    unit: str
    sold_qty: int
    movements_count: int
    estimated_amount: float
    reason: str
