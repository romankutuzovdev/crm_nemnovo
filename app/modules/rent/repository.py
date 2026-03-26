from datetime import date
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.rent.models import RentCatalogItem, RentOrder, RentOrderLine
from app.modules.rent.schemas import RentOrderLineInput, summarize_lines
from app.shared.base_repository import BaseRepository


class RentCatalogRepository(BaseRepository[RentCatalogItem]):
    model = RentCatalogItem

    async def list(self, offset: int = 0, limit: int = 100) -> list[RentCatalogItem]:
        result = await self.session.execute(
            select(RentCatalogItem)
            .order_by(RentCatalogItem.name.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())


class RentOrderRepository(BaseRepository[RentOrder]):
    model = RentOrder

    async def get_with_lines(self, order_id: UUID) -> RentOrder | None:
        result = await self.session.execute(
            select(RentOrder)
            .options(selectinload(RentOrder.lines))
            .where(RentOrder.id == order_id)
        )
        return result.scalar_one_or_none()

    async def get_with_lines_or_raise(self, order_id: UUID) -> RentOrder:
        o = await self.get_with_lines(order_id)
        if o is None:
            raise NotFoundError(f"RentOrder {order_id} not found")
        return o

    async def list_filtered(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        deal_id: UUID | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[RentOrder]:
        stmt = select(RentOrder).options(selectinload(RentOrder.lines))
        if date_from is not None:
            stmt = stmt.where(RentOrder.service_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(RentOrder.service_date <= date_to)
        if deal_id is not None:
            stmt = stmt.where(RentOrder.deal_id == deal_id)
        stmt = stmt.order_by(RentOrder.service_date.desc(), RentOrder.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().unique().all())

    async def create_with_lines(
        self,
        *,
        service_date: date,
        deal_id: UUID | None,
        status: str,
        notes: str | None,
        lines: list[RentOrderLineInput],
    ) -> RentOrder:
        if not lines:
            raise ValidationError("Добавьте хотя бы одну позицию")
        line_payloads, total = summarize_lines(lines)

        order = RentOrder(
            service_date=service_date,
            deal_id=deal_id,
            status=status,
            notes=notes,
            total_amount=total,
        )
        self.session.add(order)
        await self.session.flush()
        for lp in line_payloads:
            self.session.add(
                RentOrderLine(
                    order_id=order.id,
                    catalog_item_id=lp.get("catalog_item_id"),
                    title=lp["title"],
                    quantity=lp["quantity"],
                    unit_price=lp["unit_price"],
                    line_total=lp["line_total"],
                )
            )
        await self.session.flush()
        return await self.get_with_lines_or_raise(order.id)

    async def apply_patch(self, order_id: UUID, raw: dict) -> RentOrder:
        order = await self.get_with_lines_or_raise(order_id)

        if "lines" in raw:
            lines_in = raw["lines"]
            if not lines_in:
                raise ValidationError("Добавьте хотя бы одну позицию")
            parsed = [RentOrderLineInput.model_validate(x) for x in lines_in]
            line_payloads, total = summarize_lines(parsed)
            await self.session.execute(delete(RentOrderLine).where(RentOrderLine.order_id == order_id))
            for lp in line_payloads:
                self.session.add(
                    RentOrderLine(
                        order_id=order_id,
                        catalog_item_id=lp.get("catalog_item_id"),
                        title=lp["title"],
                        quantity=lp["quantity"],
                        unit_price=lp["unit_price"],
                        line_total=lp["line_total"],
                    )
                )
            order.total_amount = total

        if "service_date" in raw:
            order.service_date = raw["service_date"]
        if "deal_id" in raw:
            order.deal_id = raw["deal_id"]
        if "status" in raw:
            order.status = raw["status"]
        if "notes" in raw:
            order.notes = raw["notes"]

        await self.session.flush()
        return await self.get_with_lines_or_raise(order_id)
