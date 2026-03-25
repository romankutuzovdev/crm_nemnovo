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

    async def count_search(self, query: str, assigned_to: UUID | None = None) -> int:
        from sqlalchemy import func

        stmt = select(func.count()).select_from(Client).where(
            or_(
                Client.first_name.ilike(f"%{query}%"),
                Client.last_name.ilike(f"%{query}%"),
                Client.phone.ilike(f"%{query}%"),
                Client.email.ilike(f"%{query}%"),
            )
        )
        if assigned_to:
            stmt = stmt.where(Client.assigned_to == assigned_to)
        result = await self.session.execute(stmt)
        return int(result.scalar_one())

    async def get_by_manager(self, manager_id: UUID, offset: int = 0, limit: int = 50) -> list[Client]:
        result = await self.session.execute(
            select(Client)
            .where(Client.assigned_to == manager_id)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_company(
        self, company_id: UUID, offset: int = 0, limit: int = 200
    ) -> list[Client]:
        result = await self.session.execute(
            select(Client)
            .where(Client.company_id == company_id)
            .order_by(Client.last_name, Client.first_name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class CompanyRepository(BaseRepository[Company]):
    model = Company

    async def search(
        self, query: str, offset: int = 0, limit: int = 50
    ) -> list[Company]:
        stmt = select(Company).order_by(Company.name)
        q = query.strip()
        if q:
            stmt = stmt.where(
                or_(
                    Company.name.ilike(f"%{q}%"),
                    Company.inn.ilike(f"%{q}%"),
                )
            )
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_search(self, query: str) -> int:
        from sqlalchemy import func

        q = query.strip()
        stmt = select(func.count()).select_from(Company)
        if q:
            stmt = stmt.where(
                or_(
                    Company.name.ilike(f"%{q}%"),
                    Company.inn.ilike(f"%{q}%"),
                )
            )
        result = await self.session.execute(stmt)
        return int(result.scalar_one())


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
