from contextlib import asynccontextmanager
from datetime import date
from uuid import UUID

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import AssetConflictError, NotFoundError, ValidationError
from app.modules.assets.repository import AssetRepository
from app.modules.bookings.models import Booking
from app.modules.clients.repository import ClientRepository
from app.modules.clients.repository import CompanyRepository
from app.modules.contracts.repository import ContractRepository
from app.modules.deals.models import Deal, DealItem
from app.modules.deals.repository import DealItemRepository, DealRepository
from app.modules.deals.schemas import DealCreate, DealItemCreate, DealItemUpdate, DealUpdate
from app.shared.enums import AuditAction, BookingStatus, DealStatus

logger = structlog.get_logger()


class DealService:
    ALLOWED_STATUS_TRANSITIONS: dict[DealStatus, set[DealStatus]] = {
        DealStatus.NEW: {DealStatus.CONFIRMED, DealStatus.CANCELLED},
        DealStatus.CONFIRMED: {DealStatus.IN_PROGRESS, DealStatus.CANCELLED},
        DealStatus.IN_PROGRESS: {DealStatus.COMPLETED, DealStatus.CANCELLED},
        DealStatus.COMPLETED: set(),
        DealStatus.CANCELLED: set(),
    }

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = DealRepository(session)
        self.item_repo = DealItemRepository(session)
        self.asset_repo = AssetRepository(session)
        self.client_repo = ClientRepository(session)

    @asynccontextmanager
    async def _tx(self):
        """Open a transaction only when session is not already in one."""
        if self.session.in_transaction():
            yield
            return
        async with self.session.begin():
            yield

    def _validate_status_transition(self, current_status: str, next_status: str) -> None:
        current = DealStatus(current_status)
        target = DealStatus(next_status)
        if current == target:
            return
        if target not in self.ALLOWED_STATUS_TRANSITIONS[current]:
            raise ValidationError(
                f"Недопустимый переход статуса: {current.value} -> {target.value}"
            )

    async def _confirm_pending_bookings(self, deal_id: UUID) -> None:
        await self.session.execute(
            update(Booking)
            .where(
                Booking.deal_id == deal_id,
                Booking.status == BookingStatus.PENDING,
            )
            .values(status=BookingStatus.CONFIRMED)
        )

    async def transition_status(self, deal_id: UUID, status: DealStatus, updated_by: UUID) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        old_status = deal.status
        self._validate_status_transition(deal.status, status.value)
        update_kw: dict = {"status": status}
        if (
            status == DealStatus.CONFIRMED
            and old_status == DealStatus.NEW.value
            and deal.assigned_to is None
        ):
            update_kw["assigned_to"] = updated_by
        after_audit: dict = {"status": status.value}
        if update_kw.get("assigned_to") is not None:
            after_audit["assigned_to"] = str(update_kw["assigned_to"])
        async with self._tx():
            deal = await self.repo.update(deal_id, **update_kw)
            if status == DealStatus.CONFIRMED and old_status == DealStatus.NEW.value:
                await self._confirm_pending_bookings(deal_id)
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "deals",
                deal_id,
                after=after_audit,
            )
        # Return with relations to avoid lazy-load in response serialization (async context)
        return await self.get_deal(deal_id)

    async def create_deal(self, data: DealCreate, created_by: UUID) -> Deal:
        # Resolve client: explicit client_id or company representative.
        resolved_client_id = data.client_id
        if resolved_client_id is None and data.company_id is None:
            raise ValidationError("Укажите клиента или компанию для заказа")
        if data.company_id is not None:
            company = await CompanyRepository(self.session).get_or_raise(data.company_id)
            company_clients = await self.client_repo.list_by_company(company.id, limit=1)
            if company_clients:
                resolved_client_id = company_clients[0].id
            else:
                # Create technical contact for company so Deal keeps FK to clients.
                created_client = await self.client_repo.create(
                    first_name="Компания",
                    last_name=company.name,
                    phone=(company.phone or f"company-{str(company.id)[:8]}"),
                    email=None,
                    company_id=company.id,
                    source="manual",
                    comment="Автосоздано при оформлении заказа на компанию",
                    tags=[],
                    assigned_to=None,
                )
                resolved_client_id = created_client.id
        if resolved_client_id is None:
            raise ValidationError("Не удалось определить клиента для заказа")
        await self.client_repo.get_or_raise(resolved_client_id)

        if data.end_date < data.start_date:
            raise ValidationError("Дата окончания не может быть раньше даты начала")
        if data.guests_count < 1:
            raise ValidationError("Число гостей должно быть не меньше 1")

        # Validate asset availability for all bookings BEFORE creating anything
        for b in data.bookings:
            asset = await self.asset_repo.get_or_raise(b.asset_id)
            has_conflict = await self.asset_repo.has_conflict(b.asset_id, b.start_datetime, b.end_datetime)
            if has_conflict:
                raise AssetConflictError(asset.name)

        if data.contract_id is not None:
            await ContractRepository(self.session).get_or_raise(data.contract_id)

        # Calculate totals
        items_data = []
        for item in data.items:
            if item.client_id is not None:
                await self.client_repo.get_or_raise(item.client_id)
            items_data.append(
                {
                    "description": item.description,
                    "item_kind": item.item_kind,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_price": item.quantity * item.unit_price,
                    "asset_id": item.asset_id,
                    "product_id": item.product_id,
                    "client_id": item.client_id,
                }
            )
        total_amount = sum(i["total_price"] for i in items_data)

        async with self._tx():
            number = await self.repo.get_next_number()
            deal = Deal(
                number=number,
                client_id=resolved_client_id,
                lead_id=data.lead_id,
                service_type=data.service_type,
                tour_title=data.tour_title,
                tour_type=data.tour_type,
                tour_status=data.tour_status,
                status=DealStatus.NEW,
                start_date=data.start_date,
                end_date=data.end_date,
                guests_count=data.guests_count,
                total_amount=total_amount,
                paid_amount=0.0,
                notes=data.notes,
                contract_id=data.contract_id,
                contract_text=data.contract_text,
                created_by=created_by,
                assigned_to=None,
            )
            self.session.add(deal)
            await self.session.flush()  # Get deal.id

            # Create deal items
            for item_data in items_data:
                self.session.add(DealItem(deal_id=deal.id, **item_data))

            # Create bookings
            for b in data.bookings:
                self.session.add(Booking(
                    deal_id=deal.id,
                    asset_id=b.asset_id,
                    start_datetime=b.start_datetime,
                    end_datetime=b.end_datetime,
                    quantity=b.quantity,
                    status=BookingStatus.PENDING,
                ))

            # Mark lead as converted
            if data.lead_id:
                from app.modules.leads.models import Lead
                from app.shared.enums import LeadStatus
                await self.session.execute(
                    __import__("sqlalchemy", fromlist=["update"]).update(Lead)
                    .where(Lead.id == data.lead_id)
                    .values(status=LeadStatus.CONVERTED, converted_deal_id=deal.id)
                )

            await write_audit_log(
                self.session, created_by, AuditAction.CREATE, "deals", deal.id,
                after={"number": deal.number, "total_amount": float(deal.total_amount)},
            )

        logger.info("deal.created", deal_id=str(deal.id), number=deal.number, total=float(deal.total_amount))
        return deal

    async def update_deal(self, deal_id: UUID, data: DealUpdate, updated_by: UUID) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        update_data = data.model_dump(exclude_unset=True)
        old_status = deal.status

        start: date = update_data.get("start_date", deal.start_date)
        end: date = update_data.get("end_date", deal.end_date)
        if end < start:
            raise ValidationError("Дата окончания не может быть раньше даты начала")
        if "guests_count" in update_data and update_data["guests_count"] < 1:
            raise ValidationError("Число гостей должно быть не меньше 1")
        cid = update_data.get("contract_id")
        if cid is not None:
            await ContractRepository(self.session).get_or_raise(cid)
        if "status" in update_data:
            self._validate_status_transition(deal.status, str(update_data["status"]))

        new_st = update_data.get("status")
        new_status_val = getattr(new_st, "value", new_st) if new_st is not None else None
        becoming_confirmed = new_status_val == DealStatus.CONFIRMED.value
        if (
            becoming_confirmed
            and old_status == DealStatus.NEW.value
            and deal.assigned_to is None
            and "assigned_to" not in update_data
        ):
            update_data["assigned_to"] = updated_by

        async with self._tx():
            deal = await self.repo.update(deal_id, **update_data)
            if becoming_confirmed and old_status == DealStatus.NEW.value:
                await self._confirm_pending_bookings(deal_id)
            await write_audit_log(
                self.session, updated_by, AuditAction.UPDATE, "deals", deal_id, after=update_data
            )
        # Return with relations to avoid lazy-load in response serialization (async context)
        return await self.get_deal(deal_id)

    async def cancel_deal(self, deal_id: UUID, cancelled_by: UUID) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        if deal.status == DealStatus.COMPLETED:
            raise ValidationError("Cannot cancel a completed deal")

        async with self._tx():
            # Cancel all bookings
            from sqlalchemy import update
            from app.modules.bookings.models import Booking
            await self.session.execute(
                update(Booking)
                .where(Booking.deal_id == deal_id)
                .values(status=BookingStatus.CANCELLED)
            )
            deal = await self.repo.update(deal_id, status=DealStatus.CANCELLED)
            await write_audit_log(
                self.session, cancelled_by, AuditAction.UPDATE, "deals", deal_id,
                after={"status": DealStatus.CANCELLED},
            )
        # Return with relations to avoid lazy-load in response serialization (async context)
        return await self.get_deal(deal_id)

    async def get_deal(self, deal_id: UUID) -> Deal:
        deal = await self.repo.get_with_relations(deal_id)
        if not deal:
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal

    async def _recalculate_deal_total(self, deal_id: UUID) -> None:
        deal = await self.repo.get_or_raise(deal_id)
        res = await self.session.execute(
            select(func.coalesce(func.sum(DealItem.total_price), 0)).where(DealItem.deal_id == deal_id)
        )
        deal.total_amount = float(res.scalar_one() or 0)
        deal.recalculate_payment_status()

    async def add_deal_item(self, deal_id: UUID, data: DealItemCreate, updated_by: UUID) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        if deal.status == DealStatus.CANCELLED.value:
            raise ValidationError("Нельзя добавлять позиции в отменённый заказ")
        if data.client_id is not None:
            await self.client_repo.get_or_raise(data.client_id)
        async with self._tx():
            self.session.add(
                DealItem(
                    deal_id=deal_id,
                    client_id=data.client_id,
                    asset_id=data.asset_id,
                    product_id=data.product_id,
                    description=data.description,
                    item_kind=data.item_kind,
                    quantity=data.quantity,
                    unit_price=data.unit_price,
                    total_price=data.quantity * data.unit_price,
                )
            )
            await self.session.flush()
            await self._recalculate_deal_total(deal_id)
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "deals",
                deal_id,
                after={"add_item": data.description[:200]},
            )
        deal_out = await self.repo.get_with_relations(deal_id)
        if not deal_out:
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal_out

    async def update_deal_item(
        self, deal_id: UUID, item_id: UUID, data: DealItemUpdate, updated_by: UUID
    ) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        if deal.status == DealStatus.CANCELLED.value:
            raise ValidationError("Нельзя менять позиции в отменённом заказе")
        result = await self.session.execute(
            select(DealItem).where(DealItem.id == item_id, DealItem.deal_id == deal_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise NotFoundError("Позиция не найдена")
        payload = data.model_dump(exclude_unset=True)
        async with self._tx():
            if "description" in payload:
                item.description = str(payload["description"])
            if "item_kind" in payload:
                item.item_kind = str(payload["item_kind"])
            if "quantity" in payload:
                item.quantity = int(payload["quantity"])
            if "unit_price" in payload:
                item.unit_price = float(payload["unit_price"])
            if any(k in payload for k in ("quantity", "unit_price")):
                item.total_price = float(item.quantity) * float(item.unit_price)
            await self.session.flush()
            await self._recalculate_deal_total(deal_id)
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "deals",
                deal_id,
                after={"update_item": str(item_id)},
            )
        deal_out = await self.repo.get_with_relations(deal_id)
        if not deal_out:
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal_out

    async def delete_deal_item(self, deal_id: UUID, item_id: UUID, updated_by: UUID) -> Deal:
        await self.repo.get_or_raise(deal_id)
        result = await self.session.execute(
            select(DealItem).where(DealItem.id == item_id, DealItem.deal_id == deal_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise NotFoundError("Позиция не найдена")
        async with self._tx():
            self.session.delete(item)
            await self.session.flush()
            await self._recalculate_deal_total(deal_id)
            await write_audit_log(
                self.session,
                updated_by,
                AuditAction.UPDATE,
                "deals",
                deal_id,
                after={"delete_item": str(item_id)},
            )
        deal_out = await self.repo.get_with_relations(deal_id)
        if not deal_out:
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal_out
