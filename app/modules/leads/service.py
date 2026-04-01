from datetime import date, datetime, time
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ValidationError
from app.modules.clients.service import ClientService
from app.modules.leads.models import Lead, LeadServiceItem
from app.modules.leads.repository import LeadRepository
from app.modules.users.repository import UserRepository
from app.modules.leads.schemas import (
    LeadAuditEntryResponse,
    LeadFromSiteCreate,
    LeadServiceItemsUpdate,
    LeadUpdate,
)
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
        excursion_guide_id: UUID | None,
        assigned_to: UUID | None,
        created_by: UUID,
    ) -> Lead:
        """Заявка из формы календаря «мероприятие» (без заказа и бронирований до конвертации)."""
        participants = (raw_payload or {}).get("participants") or []
        service_types: set[str] = set()
        for p in participants:
            svc = (p or {}).get("service") or {}
            st = svc.get("service_type")
            if st:
                service_types.add(str(st))
        lead_service_type: str = (
            next(iter(service_types)) if len(service_types) == 1 else ServiceType.COMBINED
        )
        lead = await self.repo.create(
            client_id=primary_client_id,
            source=LeadSource.CALENDAR,
            status=LeadStatus.NEW,
            service_type=lead_service_type,
            preferred_date=preferred_date,
            guests_count=guests_count,
            comment=comment,
            raw_payload=raw_payload,
            excursion_guide_id=excursion_guide_id,
            assigned_to=assigned_to,
        )

        # Store structured service items (so they are editable and auditable later).
        created_items = 0
        for p in participants:
            svc = (p or {}).get("service") or {}
            if not svc:
                continue
            st = svc.get("service_type")
            desc = svc.get("description")
            if not st or not desc:
                continue
            self.session.add(
                LeadServiceItem(
                    lead_id=lead.id,
                    client_id=p.get("client_id") or primary_client_id,
                    service_type=str(st),
                    description=str(desc),
                    quantity=int(svc.get("quantity") or 1),
                    unit_price=float(svc.get("unit_price") or 0),
                )
            )
            created_items += 1

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
                "services_count": created_items,
            },
        )
        logger.info("lead.created_from_calendar", lead_id=str(lead.id))
        return lead

    async def attach_client(self, lead_id: UUID, client_id: UUID, updated_by: UUID) -> Lead:
        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")
        await self.repo.update(lead_id, client_id=client_id)
        await write_audit_log(
            self.session, updated_by, AuditAction.UPDATE, "leads", lead_id,
            after={"client_id": str(client_id)},
        )
        return await self.repo.get_with_services_or_raise(lead_id)

    async def set_lead_services(self, lead_id: UUID, data: LeadServiceItemsUpdate, updated_by: UUID) -> Lead:
        from app.modules.leads.models import LeadServiceItem
        from sqlalchemy import delete

        lead = await self.repo.get_with_services_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")

        prev = [
            {
                "service_type": si.service_type,
                "description": si.description,
                "quantity": int(si.quantity),
                "unit_price": float(si.unit_price),
                "client_id": str(si.client_id) if si.client_id else None,
            }
            for si in (lead.service_items or [])
        ]

        await self.session.execute(delete(LeadServiceItem).where(LeadServiceItem.lead_id == lead_id))
        for it in data.items:
            self.session.add(
                LeadServiceItem(
                    lead_id=lead_id,
                    client_id=it.client_id,
                    service_type=str(it.service_type),
                    description=it.description,
                    quantity=int(it.quantity),
                    unit_price=float(it.unit_price),
                )
            )

        after_summary = {
            "services_count": len(data.items),
            "services": [
                f"{it.service_type}:{it.quantity}x{it.description[:30]}" for it in data.items[:6]
            ],
        }
        await write_audit_log(
            self.session,
            updated_by,
            AuditAction.UPDATE,
            "leads",
            lead_id,
            before={"services_count": len(prev)},
            after=after_summary,
        )
        await self.session.flush()
        return await self.repo.get_with_services_or_raise(lead_id)

    async def import_services_from_payload(self, lead_id: UUID, updated_by: UUID) -> Lead:
        """Backfill structured services for legacy leads from raw_payload (calendar multi)."""
        from sqlalchemy import delete

        lead = await self.repo.get_with_services_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")
        if lead.service_items and len(lead.service_items) > 0:
            return lead

        payload = lead.raw_payload or {}
        participants = payload.get("participants") or []
        if not participants:
            return lead

        await self.session.execute(delete(LeadServiceItem).where(LeadServiceItem.lead_id == lead_id))
        created = 0
        for p in participants:
            svc = (p or {}).get("service") or {}
            st = svc.get("service_type")
            desc = svc.get("description")
            if not st or not desc:
                continue
            self.session.add(
                LeadServiceItem(
                    lead_id=lead_id,
                    client_id=p.get("client_id") or lead.client_id,
                    service_type=str(st),
                    description=str(desc),
                    quantity=int(svc.get("quantity") or 1),
                    unit_price=float(svc.get("unit_price") or 0),
                )
            )
            created += 1

        if created:
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "leads",
                lead_id,
                after={"services_imported": created},
            )
        await self.session.flush()
        return await self.repo.get_with_services_or_raise(lead_id)

    async def update_lead(self, lead_id: UUID, data: LeadUpdate, updated_by: UUID) -> Lead:
        lead = await self.repo.get_or_raise(lead_id)
        if lead.status == LeadStatus.CONVERTED:
            raise ValidationError("Cannot modify a converted lead")

        update_data = data.model_dump(exclude_none=True)

        # Keep preferred_date and preferred_datetime in sync for calendar UX.
        # Calendar renders preferred_datetime with priority; if only preferred_date changes, the event must move too.
        if "preferred_datetime" in update_data and update_data.get("preferred_datetime") is not None:
            update_data["preferred_date"] = update_data["preferred_datetime"].date()
        elif "preferred_date" in update_data:
            pd = update_data.get("preferred_date")
            if pd is None:
                update_data["preferred_datetime"] = None
            else:
                prev_dt = getattr(lead, "preferred_datetime", None)
                prev_time = prev_dt.time() if isinstance(prev_dt, datetime) else time(9, 0)
                update_data["preferred_datetime"] = datetime.combine(pd, prev_time)

        await self.repo.update(lead_id, **update_data)
        await write_audit_log(
            self.session, updated_by, AuditAction.UPDATE, "leads", lead_id, after=update_data
        )
        return await self.repo.get_with_services_or_raise(lead_id)

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
