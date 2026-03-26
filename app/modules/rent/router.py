from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.rent.repository import RentCatalogRepository, RentOrderRepository
from app.modules.rent.schemas import (
    RentCatalogItemCreate,
    RentCatalogItemResponse,
    RentCatalogItemUpdate,
    RentOrderCreate,
    RentOrderResponse,
    RentOrderUpdate,
)

router = APIRouter(prefix="/rent", tags=["rent"])


@router.get("/catalog", response_model=list[RentCatalogItemResponse])
async def list_catalog(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await RentCatalogRepository(db).list(offset=offset, limit=limit)


@router.post("/catalog", response_model=RentCatalogItemResponse, status_code=201)
async def create_catalog_item(
    data: RentCatalogItemCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await RentCatalogRepository(db).create(**data.model_dump())


@router.patch("/catalog/{item_id}", response_model=RentCatalogItemResponse)
async def update_catalog_item(
    item_id: UUID,
    data: RentCatalogItemUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    repo = RentCatalogRepository(db)
    await repo.get_or_raise(item_id)
    return await repo.update(item_id, **data.model_dump(exclude_none=True))


@router.get("/orders", response_model=list[RentOrderResponse])
async def list_orders(
    date_from: date | None = None,
    date_to: date | None = None,
    deal_id: UUID | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await RentOrderRepository(db).list_filtered(
        date_from=date_from, date_to=date_to, deal_id=deal_id, offset=offset, limit=limit
    )


@router.post("/orders", response_model=RentOrderResponse, status_code=201)
async def create_order(
    data: RentOrderCreate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    if data.lines:
        for line in data.lines:
            if line.catalog_item_id is not None:
                await RentCatalogRepository(db).get_or_raise(line.catalog_item_id)
    return await RentOrderRepository(db).create_with_lines(
        service_date=data.service_date,
        deal_id=data.deal_id,
        status=data.status,
        notes=data.notes,
        lines=data.lines,
    )


@router.get("/orders/{order_id}", response_model=RentOrderResponse)
async def get_order(
    order_id: UUID,
    current_user=require_permission("orders", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await RentOrderRepository(db).get_with_lines_or_raise(order_id)


@router.patch("/orders/{order_id}", response_model=RentOrderResponse)
async def update_order(
    order_id: UUID,
    data: RentOrderUpdate,
    current_user=require_permission("orders", "write"),
    db: AsyncSession = Depends(get_db),
):
    raw = data.model_dump(exclude_unset=True, mode="python")
    if "lines" in raw:
        for line in data.lines or []:
            if line.catalog_item_id is not None:
                await RentCatalogRepository(db).get_or_raise(line.catalog_item_id)
    return await RentOrderRepository(db).apply_patch(order_id, raw)
