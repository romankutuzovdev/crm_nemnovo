from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.modules.leads.models import Lead, LeadServiceItem
from app.shared.base_repository import BaseRepository
from app.shared.enums import LeadStatus


class LeadRepository(BaseRepository[Lead]):
    model = Lead

    async def get_with_services_or_raise(self, lead_id):
        result = await self.session.execute(
            select(Lead)
            .options(selectinload(Lead.service_items))
            .where(Lead.id == lead_id)
        )
        lead = result.scalar_one_or_none()
        if not lead:
            from app.core.exceptions import NotFoundError

            raise NotFoundError(f"Lead {lead_id} not found")
        return lead

    async def find_by_source_ref(self, source: str, source_ref: str) -> Lead | None:
        result = await self.session.execute(
            select(Lead).where(Lead.source == source, Lead.source_ref == source_ref)
        )
        return result.scalar_one_or_none()

    async def count_open_leads_for_manager(self, manager_id: UUID) -> int:
        """Заявки в работе у менеджера: new / in_progress."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Lead)
            .where(
                Lead.assigned_to == manager_id,
                Lead.status.in_([LeadStatus.NEW.value, LeadStatus.IN_PROGRESS.value]),
            )
        )
        return int(result.scalar_one())

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

    async def list_by_client_and_source(
        self, client_id: UUID, source: str, limit: int = 50
    ) -> list[Lead]:
        result = await self.session.execute(
            select(Lead)
            .where(Lead.client_id == client_id, Lead.source == source)
            .order_by(Lead.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
