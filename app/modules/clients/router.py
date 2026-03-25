from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.modules.clients.schemas import (
    ClientAuditEntryResponse,
    ClientCallEntryResponse,
    ClientCreate,
    ClientNoteCreate,
    ClientNoteResponse,
    ClientResponse,
    ClientUpdate,
    CompanyCreate,
    CompanyResponse,
)
from app.modules.clients.service import ClientService
from app.shared.base_schema import PaginatedResponse

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/", response_model=PaginatedResponse[ClientResponse])
async def list_clients(
    search: str = Query(""),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    q = search.strip()
    items = await service.search(q, current_user, offset=offset, limit=limit)
    total = await service.search_count(q, current_user)
    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{client_id}/audit", response_model=list[ClientAuditEntryResponse])
async def list_client_audit(
    client_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    """Журнал изменений карточки клиента (audit trail)."""
    service = ClientService(db)
    return await service.list_client_audit(client_id, limit=limit)


@router.get("/{client_id}/calls", response_model=list[ClientCallEntryResponse])
async def list_client_calls(
    client_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    """События звонков (заявки telephony), привязанные к клиенту."""
    service = ClientService(db)
    return await service.list_client_calls(client_id, limit=limit)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID,
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    return await service.repo.get_or_raise(client_id)


@router.post("/", response_model=ClientResponse, status_code=201)
async def create_client(
    data: ClientCreate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    return await service.create_client(data, created_by=current_user.id)


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: UUID,
    data: ClientUpdate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    return await service.update_client(client_id, data, updated_by=current_user.id)


@router.post("/{client_id}/notes", response_model=ClientNoteResponse, status_code=201)
async def add_note(
    client_id: UUID,
    data: ClientNoteCreate,
    current_user=require_permission("clients", "write"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    return await service.add_note(client_id, data, author_id=current_user.id)


@router.get("/{client_id}/notes", response_model=list[ClientNoteResponse])
async def list_notes(
    client_id: UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user=require_permission("clients", "read"),
    db: AsyncSession = Depends(get_db),
):
    service = ClientService(db)
    return await service.note_repo.list_by_client(client_id, offset=offset, limit=limit)
