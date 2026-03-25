from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.modules.clients.models import Client, ClientNote, Company
from app.shared.base_repository import BaseRepository


class ClientRepository(BaseRepository[Client]):
    model = Client

    async def find_by_phone(self, phone: str) -> Client | None:
        result = await self.session.execute(
            select(Client).where(Client.phone == phone)
        )
        return result.scalar_one_or_none()

    async def find_by_email(self, email: str) -> Client | None:
        result = await self.session.execute(
            select(Client).where(Client.email == email)
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        query: str,
        assigned_to: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Client]:
        stmt = select(Client).where(
            or_(
                Client.first_name.ilike(f"%{query}%"),
                Client.last_name.ilike(f"%{query}%"),
                Client.phone.ilike(f"%{query}%"),
                Client.email.ilike(f"%{query}%"),
            )
        )
        if assigned_to:
            stmt = stmt.where(Client.assigned_to == assigned_to)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_manager(self, manager_id: UUID, offset: int = 0, limit: int = 50) -> list[Client]:
        result = await self.session.execute(
            select(Client)
            .where(Client.assigned_to == manager_id)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class CompanyRepository(BaseRepository[Company]):
    model = Company


class ClientNoteRepository(BaseRepository[ClientNote]):
    model = ClientNote

    async def list_by_client(self, client_id: UUID, offset: int = 0, limit: int = 50) -> list[ClientNote]:
        result = await self.session.execute(
            select(ClientNote)
            .where(ClientNote.client_id == client_id)
            .order_by(ClientNote.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())
