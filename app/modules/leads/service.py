from datetime import date
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ValidationError
from app.modules.clients.service import ClientService
from app.modules.leads.models import Lead
from app.modules.leads.repository import LeadRepository
from app.modules.users.repository import UserRepository
from app.modules.leads.schemas import LeadAuditEntryResponse, LeadFromSiteCreate, LeadUpdate
from app.modules.leads.convert_schemas import LeadConvertToOrderRequest
from app.shared.enums import AuditAction, LeadSource, LeadStatus, ServiceType

logger = structlog.get_logger()


class LeadService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = LeadRepository(session)
        self.client_service = ClientService(session)
        self.user_repo = UserRepository(session)

    async def pick_assignee_by_load(self) -> UUID | None:
        """Назначить менеджера с минимальным числом активных заявок (new / in_progress)."""
        managers = await self.user_repo.list_active_by_role_name("manager")
        if not managers:
            return None
        scored: list[tuple[int, str, UUID]] = []
        for m in managers:
            n = await self.repo.count_open_leads_for_manager(m.id)
            scored.append((n, str(m.id), m.id))
        scored.sort(key=lambda x: (x[0], x[1]))
        return scored[0][2]

    async def create_from_site(self, data: LeadFromSiteCreate) -> Lead:
        """Handle incoming lead from website form. Deduplicates client by phone."""
        client, was_created = await self.client_service.find_or_create_by_phone(
            phone=data.phone,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            source=LeadSource.SITE_FORM,
        )

        assignee = await self.pick_assignee_by_load()
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
            assigned_to=assignee,
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

    async def create_from_calendar_multi(
        self,
        *,
        primary_client_id: UUID,
        guests_count: int,
        preferred_date: date,
        comment: str,
        raw_payload: dict,
        assigned_to: UUID | None,
        created_by: UUID,
    ) -> Lead:
        """Заявка из формы календаря «мероприятие» (без заказа и бронирований до конвертации)."""
        lead = await self.repo.create(
            client_id=primary_client_id,
            source=LeadSource.CALENDAR,
            status=LeadStatus.NEW,
            service_type=ServiceType.COMBINED,
            preferred_date=preferred_date,
            guests_count=guests_count,
            comment=comment,
            raw_payload=raw_payload,
            assigned_to=assigned_to,
        )
        await write_audit_log(
            self.session,
            created_by,
            AuditAction.CREATE,
            "leads",
            lead.id,
            after={
                "source": LeadSource.CALENDAR.value,
                "preferred_date": preferred_date.isoformat(),
                "client_id": str(primary_client_id),
            },
        )
        logger.info("lead.created_from_calendar", lead_id=str(lead.id))
        return lead

    async def attach_client(self, lead_id: UUID, client_id: UUID, updated_by: UUID) -> Lead:
        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")
        lead = await self.repo.update(lead_id, client_id=client_id)
        await write_audit_log(
            self.session, updated_by, AuditAction.UPDATE, "leads", lead_id,
            after={"client_id": str(client_id)},
        )
        return lead

    async def update_lead(self, lead_id: UUID, data: LeadUpdate, updated_by: UUID) -> Lead:
        update_data = data.model_dump(exclude_none=True)

        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")
        lead = await self.repo.update(lead_id, **update_data)
        await write_audit_log(
            self.session, updated_by, AuditAction.UPDATE, "leads", lead_id, after=update_data
        )
        return lead

    async def convert_to_order(self, lead_id: UUID, data: LeadConvertToOrderRequest, created_by: UUID):
        """Конвертирует заявку в заказ и помечает заявку как converted."""
        from datetime import date as dt_date
        from app.modules.orders.schemas import OrderCreate, OrderItemCreate
        from app.modules.orders.service import OrderService
        from app.shared.enums import ServiceType

        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Lead already converted")

        client_id = data.client_id or lead.client_id
        if not client_id:
            raise ValidationError("Lead has no client. Attach a client first.")

        # Даты: из payload, иначе preferred_date, иначе сегодня
        base_date = data.start_date or lead.preferred_date or dt_date.today()
        start_date = data.start_date or base_date
        end_date = data.end_date or base_date

        order_data = OrderCreate(
            client_id=client_id,
            lead_id=lead.id,
            service_type=data.service_type or lead.service_type or ServiceType.COMBINED,
            start_date=start_date,
            end_date=end_date,
            guests_count=data.guests_count or lead.guests_count or 1,
            notes=data.notes or lead.comment,
            items=[
                OrderItemCreate(
                    description="Заказ (из заявки)",
                    quantity=1,
                    unit_price=float(data.total_amount or 0.0),
                )
            ],
            bookings=[],
        )
        order_service = OrderService(self.session)
        order = await order_service.create_order(order_data, created_by=created_by)

        # приоритет: явный assigned_to из запроса (persist в БД)
        if data.assigned_to:
            from app.modules.deals.repository import DealRepository

            deal_repo = DealRepository(self.session)
            order = await deal_repo.update(order.id, assigned_to=data.assigned_to)

        # lead -> converted + связь
        lead.status = LeadStatus.CONVERTED
        lead.converted_deal_id = order.id

        await write_audit_log(
            self.session,
            created_by,
            AuditAction.UPDATE,
            "leads",
            lead_id,
            after={"status": LeadStatus.CONVERTED, "converted_order_id": str(order.id)},
        )

        return order

    async def list_lead_audit(self, lead_id: UUID, limit: int = 50) -> list[LeadAuditEntryResponse]:
        await self.repo.get_or_raise(lead_id)
        from sqlalchemy import select
        from app.modules.users.models import AuditLog, User

        result = await self.session.execute(
            select(AuditLog, User.full_name)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.resource == "leads", AuditLog.resource_id == lead_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        rows: list[LeadAuditEntryResponse] = []
        for log, full_name in result.all():
            payload = log.after if log.after is not None else log.before
            parts = [f"{k}: {v}" for k, v in (payload or {}).items()]
            rows.append(
                LeadAuditEntryResponse(
                    id=log.id,
                    action=log.action,
                    user_name=full_name or "—",
                    created_at=log.created_at,
                    details=("; ".join(parts) if parts else "—")[:800],
                )
            )
        return rows
