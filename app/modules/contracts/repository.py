from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSession
from app.modules.clients.models import Company
from app.modules.contracts.models import Contract


class ContractRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_raise(self, contract_id: UUID) -> Contract:
        from app.core.exceptions import NotFoundError

        result = await self.session.execute(
            select(Contract)
            .options(selectinload(Contract.company))
            .where(Contract.id == contract_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise NotFoundError("Договор не найден")
        return c

    async def search(self, q: str, offset: int = 0, limit: int = 50) -> tuple[list[Contract], int]:
        base = (
            select(Contract)
            .join(Company, Contract.company_id == Company.id)
            .options(selectinload(Contract.company))
        )
        q = q.strip()
        if q:
            pat = f"%{q}%"
            filtered = base.where(
                or_(
                    Contract.number.ilike(pat),
                    Company.name.ilike(pat),
                    func.coalesce(Contract.title, "").ilike(pat),
                )
            )
        else:
            filtered = base

        count_stmt = select(func.count()).select_from(filtered.subquery())
        total = int((await self.session.execute(count_stmt)).scalar_one())

        stmt = filtered.order_by(Contract.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all()), total
