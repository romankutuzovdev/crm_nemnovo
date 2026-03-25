from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.assets.schemas import (
    AssetAvailabilityRequest,
    AssetCreate,
    AssetMaintenanceCreate,
    AssetResponse,
    AssetUpdate,
    ProductCreate,
    ProductResponse,
)
from app.modules.assets.service import AssetService
from app.modules.assets.repository import ProductRepository

router = APIRouter(prefix="/assets", tags=["assets"])


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
    return await service.update_asset(asset_id, data)


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
