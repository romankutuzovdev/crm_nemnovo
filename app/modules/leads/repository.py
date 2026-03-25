from uuid import UUID

from sqlalchemy import select

from app.modules.leads.models import Lead
from app.shared.base_repository import BaseRepository
from app.shared.enums import LeadStatus


class LeadRepository(BaseRepository[Lead]):
    model = Lead

    async def list_by_status(self, status: LeadStatus, offset: int = 0, limit: int = 50) -> list[Lead]:
        result = await self.session.execute(
            select(Lead)
            .where(Lead.status == status)
            .order_by(Lead.created_at.desc())
            .offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_manager(self, manager_id: UUID, offset: int = 0, limit: int = 50) -> list[Lead]:
        result = await self.session.execute(
            select(Lead)
            .where(Lead.assigned_to == manager_id)
            .order_by(Lead.created_at.desc())
            .offset(offset).limit(limit)
        )
        return list(result.scalars().all())
