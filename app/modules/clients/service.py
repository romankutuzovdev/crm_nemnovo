from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.clients.models import Client, ClientNote
from app.modules.clients.repository import ClientNoteRepository, ClientRepository, CompanyRepository
from app.modules.clients.schemas import ClientCreate, ClientNoteCreate, ClientUpdate
from app.shared.enums import AuditAction
from app.shared.utils import normalize_phone

logger = structlog.get_logger()


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
