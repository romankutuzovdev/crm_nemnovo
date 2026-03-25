from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.leads.schemas import LeadAttachClient, LeadCreate, LeadResponse, LeadUpdate
from app.modules.leads.service import LeadService
from app.shared.base_schema import PaginatedResponse
from app.shared.enums import LeadStatus

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("/", response_model=PaginatedResponse[LeadResponse])
async def list_leads(
    status: LeadStatus | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("leads", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    if current_user.role.name == "manager":
        items = await service.repo.list_by_manager(current_user.id, offset=offset, limit=limit)
    elif status:
        items = await service.repo.list_by_status(status, offset=offset, limit=limit)
    else:
        items = await service.repo.list(offset=offset, limit=limit)
    total = await service.repo.count()
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: UUID,
    current_user=require_permission("leads", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.repo.get_or_raise(lead_id)


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    data: LeadUpdate,
    current_user=require_permission("leads", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.update_lead(lead_id, data, updated_by=current_user.id)


@router.patch("/{lead_id}/attach-client", response_model=LeadResponse)
async def attach_client(
    lead_id: UUID,
    data: LeadAttachClient,
    current_user=require_permission("leads", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.attach_client(lead_id, data.client_id, updated_by=current_user.id)
