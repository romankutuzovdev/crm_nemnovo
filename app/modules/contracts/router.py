from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.clients.repository import CompanyRepository
from app.modules.contracts.models import Contract
from app.modules.contracts.repository import ContractRepository
from app.modules.contracts.schemas import ContractCreate, ContractResponse
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/contracts", tags=["contracts"])


def _to_response(c: Contract) -> ContractResponse:
    cn = c.company.name if c.company else "—"
    return ContractResponse(
        id=c.id,
        company_id=c.company_id,
        company_name=cn,
        number=c.number,
        title=c.title,
        notes=c.notes,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/", response_model=PaginatedResponse[ContractResponse])
async def list_contracts(
    search: str = Query("", description="Номер договора, название, компания"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    repo = ContractRepository(db)
    items, total = await repo.search(search, offset=offset, limit=limit)
    return PaginatedResponse(
        items=[_to_response(c) for c in items],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=ContractResponse, status_code=201)
async def create_contract(
    data: ContractCreate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    await CompanyRepository(db).get_or_raise(data.company_id)
    c = Contract(
        company_id=data.company_id,
        number=data.number.strip(),
        title=data.title.strip() if data.title else None,
        notes=data.notes,
    )
    db.add(c)
    await db.flush()
    result = await db.execute(
        select(Contract).where(Contract.id == c.id).options(selectinload(Contract.company))
    )
    c2 = result.scalar_one()
    return _to_response(c2)
