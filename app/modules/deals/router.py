from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.deals.schemas import DealCreate, DealResponse, DealUpdate
from app.modules.deals.service import DealService
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("/", response_model=PaginatedResponse[DealResponse])
async def list_deals(
    client_id: UUID | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("deals", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = DealService(db)
    if client_id:
        items = await service.repo.list_by_client(client_id, offset=offset, limit=limit)
    elif current_user.role.name == "manager":
        items = await service.repo.list_by_manager(current_user.id, offset=offset, limit=limit)
    else:
        items = await service.repo.list(offset=offset, limit=limit)
    total = await service.repo.count()
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(
    deal_id: UUID,
    current_user=require_permission("deals", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = DealService(db)
    return await service.get_deal(deal_id)


@router.post("/", response_model=DealResponse, status_code=201)
async def create_deal(
    data: DealCreate,
    current_user=require_permission("deals", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = DealService(db)
    return await service.create_deal(data, created_by=current_user.id)


@router.patch("/{deal_id}", response_model=DealResponse)
async def update_deal(
    deal_id: UUID,
    data: DealUpdate,
    current_user=require_permission("deals", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = DealService(db)
    return await service.update_deal(deal_id, data, updated_by=current_user.id)


@router.post("/{deal_id}/cancel", response_model=DealResponse)
async def cancel_deal(
    deal_id: UUID,
    current_user=require_permission("deals", "delete"),
    db: AsyncSession = Depends(get_db),
):
    service = DealService(db)
    return await service.cancel_deal(deal_id, cancelled_by=current_user.id)
