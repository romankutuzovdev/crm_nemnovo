from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.clients.schemas import CompanyCreate, CompanyDetailResponse, CompanyResponse, CompanyUpdate
from app.modules.companies.service import CompanyService
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/", response_model=PaginatedResponse[CompanyResponse])
async def list_companies(
    search: str = Query(""),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = CompanyService(db)
    q = search.strip()
    items, total = await service.search(q, offset=offset, limit=limit)
    return PaginatedResponse(
        items=[CompanyResponse.model_validate(c) for c in items],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{company_id}", response_model=CompanyDetailResponse)
async def get_company(
    company_id: UUID,
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = CompanyService(db)
    return await service.get_detail(company_id)


@router.post("/", response_model=CompanyResponse, status_code=201)
async def create_company(
    data: CompanyCreate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = CompanyService(db)
    return await service.create_company(data)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: UUID,
    data: CompanyUpdate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = CompanyService(db)
    return await service.update_company(company_id, data)
