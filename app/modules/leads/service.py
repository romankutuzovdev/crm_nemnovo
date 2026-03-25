from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ValidationError
from app.modules.clients.service import ClientService
from app.modules.leads.models import Lead
from app.modules.leads.repository import LeadRepository
from app.modules.leads.schemas import LeadFromSiteCreate, LeadUpdate
from app.shared.enums import AuditAction, LeadSource, LeadStatus

logger = structlog.get_logger()


class LeadService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = LeadRepository(session)
        self.client_service = ClientService(session)

    async def create_from_site(self, data: LeadFromSiteCreate) -> Lead:
        """Handle incoming lead from website form. Deduplicates client by phone."""
        client, was_created = await self.client_service.find_or_create_by_phone(
            phone=data.phone,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            source=LeadSource.SITE_FORM,
        )

        lead = await self.repo.create(
            client_id=client.id,
            source=LeadSource.SITE_FORM,
            source_ref=data.page_url,
            status=LeadStatus.NEW,
            service_type=data.service_type,
            preferred_date=data.preferred_date,
            guests_count=data.guests_count,
            comment=data.comment,
            raw_payload=data.model_dump(mode="json"),
        )

        logger.info(
            "lead.created_from_site",
            lead_id=str(lead.id),
            client_id=str(client.id),
            client_was_new=was_created,
        )

        # Notify managers async
        from app.workers.tasks.sms import notify_new_lead
        notify_new_lead.delay(str(lead.id))

        return lead

    async def attach_client(self, lead_id: UUID, client_id: UUID, updated_by: UUID) -> Lead:
        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")

        async with self.session.begin():
            lead = await self.repo.update(lead_id, client_id=client_id)
            await write_audit_log(
                self.session, updated_by, AuditAction.UPDATE, "leads", lead_id,
                after={"client_id": str(client_id)},
            )
        return lead

    async def update_lead(self, lead_id: UUID, data: LeadUpdate, updated_by: UUID) -> Lead:
        await self.repo.get_or_raise(lead_id)
        update_data = data.model_dump(exclude_none=True)

        async with self.session.begin():
            lead = await self.repo.update(lead_id, **update_data)
            await write_audit_log(
                self.session, updated_by, AuditAction.UPDATE, "leads", lead_id, after=update_data
            )
        return lead
