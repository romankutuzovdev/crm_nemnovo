from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.assets.schemas import (
    AssetCategoryResponse,
    AssetAuditEntryResponse,
    AssetAvailabilityRequest,
    AssetCreate,
    AssetMaintenanceCreate,
    AssetMaintenanceResponse,
    AssetQuantityChangeResponse,
    AssetQuantitySetRequest,
    AssetResponse,
    AssetStatusPatch,
    AssetUpdate,
    ProductCreate,
    ProductResponse,
    StockAdjustRequest,
    StockMovementResponse,
)
from app.modules.assets.service import AssetService
from app.modules.assets.repository import ProductRepository
from app.modules.assets.models import AssetCategory

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/categories", response_model=list[AssetCategoryResponse])
async def list_asset_categories(
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AssetCategory).order_by(AssetCategory.name.asc()))
    return list(result.scalars().all())


@router.get("/", response_model=list[AssetResponse])
async def list_assets(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.repo.list(offset=offset, limit=limit)


@router.post("/available", response_model=list[AssetResponse])
async def get_available_assets(
    data: AssetAvailabilityRequest,
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.get_available_assets(data.start, data.end, data.category_id)


@router.post("/", response_model=AssetResponse, status_code=201)
async def create_asset(
    data: AssetCreate,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.create_asset(data, created_by=current_user.id)


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: UUID,
    data: AssetUpdate,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.update_asset(asset_id, data, updated_by=current_user.id)


@router.post("/maintenance", status_code=201)
async def add_maintenance(
    data: AssetMaintenanceCreate,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.add_maintenance(data, created_by=current_user.id)


# Products
@router.get("/products", response_model=list[ProductResponse], tags=["products"])
async def list_products(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = ProductRepository(db)
    return await repo.list(offset=offset, limit=limit)


@router.post("/products", response_model=ProductResponse, status_code=201, tags=["products"])
async def create_product(
    data: ProductCreate,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = ProductRepository(db)
    return await repo.create(**data.model_dump())


@router.get("/products/{product_id}/movements", response_model=list[StockMovementResponse], tags=["products"])
async def list_product_movements(
    product_id: UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.list_product_movements(product_id, offset=offset, limit=limit)


@router.post(
    "/products/{product_id}/adjust",
    response_model=StockMovementResponse,
    status_code=201,
    tags=["products"],
)
async def adjust_product_stock(
    product_id: UUID,
    data: StockAdjustRequest,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.adjust_product_stock(product_id, data=data, updated_by=current_user.id)


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: UUID,
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.get_asset(asset_id)


@router.post("/{asset_id}/status", response_model=AssetResponse)
async def transition_asset_status(
    asset_id: UUID,
    data: AssetStatusPatch,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.transition_asset_status(asset_id, data.status, updated_by=current_user.id)


@router.get("/{asset_id}/quantity-changes", response_model=list[AssetQuantityChangeResponse])
async def list_asset_quantity_changes(
    asset_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.list_asset_quantity_changes(asset_id, limit=limit)


@router.post("/{asset_id}/quantity", response_model=AssetResponse)
async def set_asset_quantity(
    asset_id: UUID,
    data: AssetQuantitySetRequest,
    current_user=require_permission("assets", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.set_asset_quantity(asset_id, data, updated_by=current_user.id)


@router.get("/{asset_id}/audit", response_model=list[AssetAuditEntryResponse])
async def list_asset_audit(
    asset_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.list_asset_audit(asset_id, limit=limit)


@router.get("/{asset_id}/maintenances", response_model=list[AssetMaintenanceResponse])
async def list_asset_maintenances(
    asset_id: UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("assets", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = AssetService(db)
    return await service.list_asset_maintenances(asset_id, offset=offset, limit=limit)
