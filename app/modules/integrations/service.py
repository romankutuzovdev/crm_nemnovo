import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations.models import WebhookLog
from app.modules.leads.schemas import LeadFromSiteCreate
from app.modules.leads.service import LeadService

logger = structlog.get_logger()


class IntegrationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.lead_service = LeadService(session)

    async def handle_site_lead(self, payload: dict, ip_address: str = "") -> dict:
        """Process incoming lead from website. Creates/deduplicates client and lead."""
        log = WebhookLog(
            source="site",
            raw_payload=payload,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()

        try:
            data = LeadFromSiteCreate(**payload)
            lead = await self.lead_service.create_from_site(data)

            log.is_processed = True
            await self.session.flush()

            logger.info("integration.site_lead_processed", lead_id=str(lead.id))
            return {"status": "ok", "lead_id": str(lead.id)}

        except Exception as e:
            log.error = str(e)
            await self.session.flush()
            logger.error("integration.site_lead_failed", error=str(e))
            raise

    async def handle_telephony_event(self, payload: dict, ip_address: str = "") -> dict:
        """Handle incoming call from telephony provider."""
        log = WebhookLog(
            source="telephony",
            raw_payload=payload,
            ip_address=ip_address,
        )
        self.session.add(log)
        await self.session.flush()

        caller_phone = payload.get("caller_id", "")
        if not caller_phone:
            log.error = "No caller_id in payload"
            return {"status": "ignored"}

        # Find existing client by phone
        from app.modules.clients.repository import ClientRepository
        from app.shared.utils import normalize_phone
        from app.modules.leads.models import Lead
        from app.shared.enums import LeadSource, LeadStatus

        try:
            normalized_phone = normalize_phone(caller_phone)
            client_repo = ClientRepository(self.session)
            client = await client_repo.find_by_phone(normalized_phone)

            from app.modules.leads.repository import LeadRepository
            lead_repo = LeadRepository(self.session)
            assignee = await self.lead_service.pick_assignee_by_load()

            call_id = payload.get("call_id") or payload.get("callId") or payload.get("id")
            telephony_comment = (
                payload.get("comment")
                or payload.get("event")
                or payload.get("status")
                or payload.get("direction")
            )
            if call_id:
                existing = await lead_repo.find_by_source_ref(
                    LeadSource.TELEPHONY.value, call_id
                )
                if existing:
                    # Update existing lead (avoid duplicates for repeated telephony events)
                    existing.client_id = existing.client_id or (client.id if client else None)
                    if telephony_comment:
                        existing.comment = str(telephony_comment)
                    existing.raw_payload = payload
                    log.is_processed = True
                    await self.session.flush()
                    return {
                        "status": "ok",
                        "lead_id": str(existing.id),
                        "client_found": client is not None,
                    }

            lead = await lead_repo.create(
                client_id=client.id if client else None,
                source=LeadSource.TELEPHONY,
                source_ref=call_id,
                status=LeadStatus.NEW,
                comment=str(telephony_comment) if telephony_comment else None,
                raw_payload=payload,
                assigned_to=assignee,
            )

            log.is_processed = True
            return {"status": "ok", "lead_id": str(lead.id), "client_found": client is not None}

        except Exception as e:
            log.error = str(e)
            logger.error("integration.telephony_failed", error=str(e))
            raise
