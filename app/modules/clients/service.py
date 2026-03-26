from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.clients.models import Client, ClientNote
from app.modules.clients.repository import ClientNoteRepository, ClientRepository, CompanyRepository
from app.modules.clients.schemas import (
    ClientAuditEntryResponse,
    ClientCallEntryResponse,
    ClientCreate,
    ClientNoteCreate,
    ClientUpdate,
)
from app.shared.enums import AuditAction
from app.shared.utils import normalize_phone

logger = structlog.get_logger()


def _format_audit_details(payload: dict | None) -> str:
    if not payload:
        return "—"
    parts = [f"{k}: {v}" for k, v in payload.items()]
    return "; ".join(parts)[:800]


class ClientService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ClientRepository(session)
        self.company_repo = CompanyRepository(session)
        self.note_repo = ClientNoteRepository(session)

    async def find_or_create_by_phone(
        self,
        phone: str,
        first_name: str = "",
        last_name: str = "",
        email: str | None = None,
        source: str = "site_form",
        created_by: UUID | None = None,
    ) -> tuple[Client, bool]:
        """Returns (client, was_created). Used for deduplication on lead intake."""
        normalized = normalize_phone(phone)
        existing = await self.repo.find_by_phone(normalized)
        if existing:
            return existing, False

        client = await self.repo.create(
            first_name=first_name or "Неизвестно",
            last_name=last_name or "",
            phone=normalized,
            email=email,
            source=source,
        )
        logger.info("client.created", client_id=str(client.id), phone=phone, source=source)
        return client, True

    async def create_client(self, data: ClientCreate, created_by: UUID) -> Client:
        if await self.repo.find_by_phone(data.phone):
            raise ConflictError(f"Client with phone {data.phone} already exists")
        if data.email and await self.repo.find_by_email(data.email):
            raise ConflictError(f"Client with email {data.email} already exists")

        async with self.session.begin():
            client = await self.repo.create(**data.model_dump())
            await write_audit_log(
                self.session, created_by, AuditAction.CREATE, "clients", client.id,
                after={"phone": client.phone, "email": client.email},
            )
        return client

    async def update_client(self, client_id: UUID, data: ClientUpdate, updated_by: UUID) -> Client:
        client = await self.repo.get_or_raise(client_id)
        update_data = data.model_dump(exclude_none=True)

        async with self.session.begin():
            client = await self.repo.update(client_id, **update_data)
            await write_audit_log(
                self.session, updated_by, AuditAction.UPDATE, "clients", client_id,
                after=update_data,
            )
        return client

    async def add_note(self, client_id: UUID, data: ClientNoteCreate, author_id: UUID) -> ClientNote:
        await self.repo.get_or_raise(client_id)
        return await self.note_repo.create(
            client_id=client_id,
            author_id=author_id,
            text=data.text,
        )

    async def search(
        self,
        query: str,
        current_user,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Client]:
        # Managers see only their clients
        assigned_to = None
        if current_user.role.name == "manager":
            assigned_to = current_user.id
        return await self.repo.search(query, assigned_to=assigned_to, offset=offset, limit=limit)

    async def search_count(self, query: str, current_user) -> int:
        assigned_to = None
        if current_user.role.name == "manager":
            assigned_to = current_user.id
        return await self.repo.count_search(query, assigned_to=assigned_to)

    async def list_client_audit(self, client_id: UUID, limit: int = 50) -> list[ClientAuditEntryResponse]:
        await self.repo.get_or_raise(client_id)
        from app.modules.users.models import AuditLog, User

        result = await self.session.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.resource == "clients", AuditLog.resource_id == client_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        rows: list[ClientAuditEntryResponse] = []
        for log, full_name in result.all():
            payload = log.after if log.after is not None else log.before
            rows.append(
                ClientAuditEntryResponse(
                    id=log.id,
                    action=log.action,
                    user_name=full_name or "—",
                    created_at=log.created_at,
                    details=_format_audit_details(payload),
                )
            )
        return rows

    async def list_client_calls(self, client_id: UUID, limit: int = 50) -> list[ClientCallEntryResponse]:
        """Заявки, созданные телефонией по этому клиенту (источник telephony)."""
        await self.repo.get_or_raise(client_id)
        from app.modules.leads.repository import LeadRepository

        lead_repo = LeadRepository(self.session)
        leads = await lead_repo.list_by_client_and_source(
            client_id, LeadSource.TELEPHONY.value, limit=limit
        )
        return [
            ClientCallEntryResponse(
                id=l.id,
                created_at=l.created_at,
                status=l.status,
                source_ref=l.source_ref,
                comment=l.comment,
                recording_url=(
                    (l.raw_payload or {}).get("recording_url")
                    or (l.raw_payload or {}).get("recording")
                ),
                converted_deal_id=l.converted_deal_id,
            )
            for l in leads
        ]
