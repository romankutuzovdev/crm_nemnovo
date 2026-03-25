from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSession
from app.modules.bookings.models import Booking
from app.modules.deals.models import Deal
from app.modules.leads.models import Lead
from app.shared.enums import BookingStatus, LeadStatus, ServiceType

# Цвета по типу услуги (по ТЗ — цветовое разделение)
SERVICE_COLORS = {
    ServiceType.RAFTING: "#22c55e",
    ServiceType.HOSTEL: "#3b82f6",
    ServiceType.RENT: "#f59e0b",
    ServiceType.COMBINED: "#8b5cf6",
}


class CalendarRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_events(
        self,
        start: date,
        end: date,
        asset_id: UUID | None = None,
        manager_id: UUID | None = None,
    ) -> list[dict]:
        """Возвращает события для календаря: бронирования и заявки."""
        events: list[dict] = []
        start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

        # Бронирования (bookings)
        stmt = (
            select(Booking)
            .options(
                selectinload(Booking.asset),
                selectinload(Booking.deal).selectinload(Deal.client),
            )
            .where(
                and_(
                    Booking.status != BookingStatus.CANCELLED,
                    Booking.start_datetime <= end_dt,
                    Booking.end_datetime >= start_dt,
                )
            )
            .order_by(Booking.start_datetime)
        )
        if asset_id:
            stmt = stmt.where(Booking.asset_id == asset_id)
        if manager_id:
            stmt = stmt.join(Deal).where(Deal.assigned_to == manager_id)

        result = await self.session.execute(stmt)
        for b in result.scalars().all():
            client_name = ""
            if b.deal and b.deal.client:
                client_name = f"{b.deal.client.first_name} {b.deal.client.last_name}"
            events.append({
                "id": f"booking:{b.id}",
                "title": f"{b.deal.number} — {b.asset.name}" if b.deal else b.asset.name,
                "start": b.start_datetime.isoformat(),
                "end": b.end_datetime.isoformat(),
                "all_day": False,
                "event_type": "booking",
                "booking_id": b.id,
                "deal_id": b.deal_id,
                "lead_id": None,
                "asset_id": b.asset_id,
                "asset_name": b.asset.name,
                "client_id": b.deal.client_id if b.deal else None,
                "client_name": client_name,
                "service_type": b.deal.service_type if b.deal else "",
                "status": b.status,
                "assigned_to": b.deal.assigned_to if b.deal else None,
                "color": SERVICE_COLORS.get(b.deal.service_type if b.deal else "", "#6b7280"),
            })

        # Заявки (leads) — активные, без конвертации
        lead_stmt = (
            select(Lead)
            .where(
                and_(
                    Lead.status.in_([LeadStatus.NEW, LeadStatus.IN_PROGRESS]),
                    or_(
                        and_(Lead.preferred_date.isnot(None), Lead.preferred_date >= start, Lead.preferred_date <= end),
                        and_(Lead.preferred_date.is_(None), func.date(Lead.created_at) >= start, func.date(Lead.created_at) <= end),
                    ),
                )
            )
        )
        if manager_id:
            lead_stmt = lead_stmt.where(Lead.assigned_to == manager_id)

        lead_result = await self.session.execute(lead_stmt)
        for lead in lead_result.scalars().all():
            ev_date = lead.preferred_date or lead.created_at.date()
            ev_start = datetime.combine(ev_date, time(9, 0), tzinfo=timezone.utc)
            ev_end = datetime.combine(ev_date, time(10, 0), tzinfo=timezone.utc)
            if ev_start < start_dt or ev_end > end_dt:
                continue
            st = lead.service_type or "заявка"
            events.append({
                "id": f"lead:{lead.id}",
                "title": f"Заявка: {st}",
                "start": ev_start.isoformat(),
                "end": ev_end.isoformat(),
                "all_day": False,
                "event_type": "lead",
                "booking_id": None,
                "deal_id": None,
                "lead_id": lead.id,
                "asset_id": None,
                "asset_name": None,
                "client_id": lead.client_id,
                "client_name": None,
                "service_type": st,
                "status": lead.status,
                "assigned_to": lead.assigned_to,
                "color": "#ef4444",  # красный для заявок
            })

        return events
