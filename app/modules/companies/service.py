from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.modules.clients.models import Company
from app.modules.clients.repository import ClientRepository, CompanyRepository
from app.modules.clients.schemas import (
    CompanyClientBrief,
    CompanyCreate,
    CompanyDetailResponse,
    CompanyResponse,
    CompanyUpdate,
)


class CompanyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = CompanyRepository(session)
        self.client_repo = ClientRepository(session)

    async def _ensure_inn_unique(self, inn: str | None, exclude_id: UUID | None = None) -> None:
        if not inn:
            return
        stmt = select(Company).where(Company.inn == inn)
        if exclude_id:
            stmt = stmt.where(Company.id != exclude_id)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none() is not None:
            raise ConflictError(f"Компания с ИНН {inn} уже существует")

    async def search(
        self, query: str, offset: int = 0, limit: int = 50
    ) -> tuple[list[Company], int]:
        items = await self.repo.search(query, offset=offset, limit=limit)
        total = await self.repo.count_search(query)
        return items, total

    async def get_detail(self, company_id: UUID) -> CompanyDetailResponse:
        company = await self.repo.get_or_raise(company_id)
        clients = await self.client_repo.list_by_company(company_id, limit=500)
        return CompanyDetailResponse(
            id=company.id,
            name=company.name,
            inn=company.inn,
            address=company.address,
            phone=company.phone,
            email=company.email,
            segment=company.segment,
            created_at=company.created_at,
            updated_at=company.updated_at,
            clients=[
                CompanyClientBrief(
                    id=c.id,
                    first_name=c.first_name,
                    last_name=c.last_name,
                    phone=c.phone,
                    email=c.email,
                )
                for c in clients
            ],
        )

    async def create_company(self, data: CompanyCreate) -> CompanyResponse:
        await self._ensure_inn_unique(data.inn)
        payload = data.model_dump()
        payload["segment"] = data.segment.value
        company = await self.repo.create(**payload)
        return CompanyResponse.model_validate(company)

    async def update_company(self, company_id: UUID, data: CompanyUpdate) -> CompanyResponse:
        await self.repo.get_or_raise(company_id)
        update_data = data.model_dump(exclude_none=True)
        if "segment" in update_data and data.segment is not None:
            update_data["segment"] = data.segment.value
        if "inn" in update_data:
            await self._ensure_inn_unique(update_data.get("inn"), exclude_id=company_id)
        company = await self.repo.update(company_id, **update_data)
        return CompanyResponse.model_validate(company)
