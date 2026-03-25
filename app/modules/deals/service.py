from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import AssetConflictError, NotFoundError, ValidationError
from app.modules.assets.repository import AssetRepository
from app.modules.bookings.models import Booking
from app.modules.clients.repository import ClientRepository
from app.modules.deals.models import Deal, DealItem
from app.modules.deals.repository import DealItemRepository, DealRepository
from app.modules.deals.schemas import DealCreate, DealUpdate
from app.shared.enums import AuditAction, BookingStatus, DealStatus

logger = structlog.get_logger()


class DealService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = DealRepository(session)
        self.item_repo = DealItemRepository(session)
        self.asset_repo = AssetRepository(session)
        self.client_repo = ClientRepository(session)

    async def create_deal(self, data: DealCreate, created_by: UUID) -> Deal:
        # Validate client exists
        await self.client_repo.get_or_raise(data.client_id)

        # Validate asset availability for all bookings BEFORE creating anything
        for b in data.bookings:
            asset = await self.asset_repo.get_or_raise(b.asset_id)
            has_conflict = await self.asset_repo.has_conflict(b.asset_id, b.start_datetime, b.end_datetime)
            if has_conflict:
                raise AssetConflictError(asset.name)

        # Calculate totals
        items_data = [
            {
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_price": item.quantity * item.unit_price,
                "asset_id": item.asset_id,
                "product_id": item.product_id,
            }
            for item in data.items
        ]
        total_amount = sum(i["total_price"] for i in items_data)

        async with self.session.begin():
            number = await self.repo.get_next_number()
            deal = Deal(
                number=number,
                client_id=data.client_id,
                lead_id=data.lead_id,
                service_type=data.service_type,
                status=DealStatus.NEW,
                start_date=data.start_date,
                end_date=data.end_date,
                guests_count=data.guests_count,
                total_amount=total_amount,
                paid_amount=0.0,
                notes=data.notes,
                created_by=created_by,
                assigned_to=created_by,
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
                    status=BookingStatus.CONFIRMED,
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
        update_data = data.model_dump(exclude_none=True)

        async with self.session.begin():
            deal = await self.repo.update(deal_id, **update_data)
            await write_audit_log(
                self.session, updated_by, AuditAction.UPDATE, "deals", deal_id, after=update_data
            )
        return deal

    async def cancel_deal(self, deal_id: UUID, cancelled_by: UUID) -> Deal:
        deal = await self.repo.get_or_raise(deal_id)
        if deal.status == DealStatus.COMPLETED:
            raise ValidationError("Cannot cancel a completed deal")

        async with self.session.begin():
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
        return deal

    async def get_deal(self, deal_id: UUID) -> Deal:
        deal = await self.repo.get_with_relations(deal_id)
        if not deal:
            raise NotFoundError(f"Deal {deal_id} not found")
        return deal
