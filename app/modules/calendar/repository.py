from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSession
from app.modules.bookings.models import Booking
from app.modules.clients.models import Client
from app.modules.deals.models import Deal
from app.modules.hostel.models import HostelBooking, HostelRoom
from app.modules.leads.models import Lead
from app.modules.rafting.models import RaftingRoute, RaftingTrip
from app.modules.rent.models import RentOrder
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
        service_type: str | None = None,
    ) -> list[dict]:
        """Возвращает события для календаря: бронирования и заявки."""
        events: list[dict] = []
        # Keep boundaries timezone-naive to match datetimes loaded from DB (SQLite/Postgres setup).
        start_dt = datetime.combine(start, time.min)
        end_dt = datetime.combine(end, time.max)

        # События по сделкам: одна карточка на заказ (агрегация по deal_id)
        stmt = (
            select(Deal)
            .options(
                selectinload(Deal.client),
                selectinload(Deal.bookings).selectinload(Booking.asset),
                selectinload(Deal.items),
            )
            .where(
                Deal.bookings.any(
                    and_(
                        Booking.status != BookingStatus.CANCELLED,
                        Booking.start_datetime <= end_dt,
                        Booking.end_datetime >= start_dt,
                    )
                )
            )
            .order_by(Deal.created_at.desc())
        )
        if asset_id:
            stmt = stmt.where(Deal.bookings.any(Booking.asset_id == asset_id))
        if manager_id:
            stmt = stmt.where(Deal.assigned_to == manager_id)
        if service_type:
            stmt = stmt.where(Deal.service_type == service_type)

        result = await self.session.execute(stmt)
        for deal in result.scalars().unique().all():
            active_bookings = [
                b
                for b in deal.bookings
                if b.status != BookingStatus.CANCELLED
                and b.start_datetime <= end_dt
                and b.end_datetime >= start_dt
            ]
            if asset_id:
                active_bookings = [b for b in active_bookings if b.asset_id == asset_id]
            if not active_bookings:
                continue

            event_start = min(b.start_datetime for b in active_bookings)
            event_end = max(b.end_datetime for b in active_bookings)
            service_types = sorted(
                {
                    item.description[1:item.description.find("]")]
                    for item in deal.items
                    if item.description.startswith("[") and "]" in item.description
                }
            )
            if not service_types:
                service_types = [str(deal.service_type)]

            asset_names = sorted({b.asset.name for b in active_bookings if b.asset})
            client_name = ""
            if deal.client:
                client_name = f"{deal.client.first_name} {deal.client.last_name}"
            events.append({
                "id": f"deal:{deal.id}",
                "title": f"{deal.number} — {', '.join(asset_names)}",
                "start": event_start.isoformat(),
                "end": event_end.isoformat(),
                "all_day": False,
                "event_type": "deal",
                "booking_id": active_bookings[0].id,
                "deal_id": deal.id,
                "lead_id": None,
                "asset_id": active_bookings[0].asset_id,
                "asset_name": ", ".join(asset_names),
                "client_id": deal.client_id,
                "client_name": client_name,
                "service_type": str(deal.service_type),
                "service_types": service_types,
                "status": str(deal.status),
                "assigned_to": deal.assigned_to,
                "color": SERVICE_COLORS.get(deal.service_type, "#6b7280"),
            })

        # События подсистем без прямой привязки к assets
        if not asset_id:
            # Хостел-бронирования
            hostel_stmt = (
            select(HostelBooking, Deal, Client, HostelRoom)
            .outerjoin(Deal, Deal.id == HostelBooking.deal_id)
            .outerjoin(Client, Client.id == Deal.client_id)
            .join(HostelRoom, HostelRoom.id == HostelBooking.room_id)
            .where(
                and_(
                    HostelBooking.status != BookingStatus.CANCELLED,
                    HostelBooking.check_in <= end,
                    HostelBooking.check_out >= start,
                )
            )
            .order_by(HostelBooking.created_at.desc())
            )
            if manager_id:
                hostel_stmt = hostel_stmt.where(Deal.assigned_to == manager_id)
            if service_type and service_type != ServiceType.HOSTEL:
                hostel_stmt = hostel_stmt.where(False)

            hostel_result = await self.session.execute(hostel_stmt)
            for booking, deal, client, room in hostel_result.all():
                event_start = datetime.combine(booking.check_in, time(14, 0))
                event_end = datetime.combine(booking.check_out, time(12, 0))
                if event_start > end_dt or event_end < start_dt:
                    continue
                client_name = ""
                if client:
                    client_name = f"{client.first_name} {client.last_name}"
                events.append({
                    "id": f"hostel:{booking.id}",
                    "title": f"Хостел — {room.code}",
                    "start": event_start.isoformat(),
                    "end": event_end.isoformat(),
                    "all_day": False,
                    "event_type": "hostel",
                    "booking_id": None,
                    "deal_id": deal.id if deal else None,
                    "lead_id": None,
                    "asset_id": None,
                    "asset_name": room.title or room.code,
                    "client_id": client.id if client else None,
                    "client_name": client_name or None,
                    "service_type": ServiceType.HOSTEL.value,
                    "service_types": [ServiceType.HOSTEL.value],
                    "status": booking.status,
                    "assigned_to": deal.assigned_to if deal else None,
                    "color": SERVICE_COLORS.get(ServiceType.HOSTEL, "#6b7280"),
                })

            # Заказы аренды
            rent_stmt = (
            select(RentOrder, Deal, Client)
            .outerjoin(Deal, Deal.id == RentOrder.deal_id)
            .outerjoin(Client, Client.id == Deal.client_id)
            .where(
                and_(
                    RentOrder.status != BookingStatus.CANCELLED,
                    RentOrder.service_date >= start,
                    RentOrder.service_date <= end,
                )
            )
            .order_by(RentOrder.created_at.desc())
            )
            if manager_id:
                rent_stmt = rent_stmt.where(Deal.assigned_to == manager_id)
            if service_type and service_type != ServiceType.RENT:
                rent_stmt = rent_stmt.where(False)

            rent_result = await self.session.execute(rent_stmt)
            for order, deal, client in rent_result.all():
                event_start = datetime.combine(order.service_date, time(10, 0))
                event_end = datetime.combine(order.service_date, time(11, 0))
                client_name = ""
                if client:
                    client_name = f"{client.first_name} {client.last_name}"
                events.append({
                    "id": f"rent:{order.id}",
                    "title": "Аренда",
                    "start": event_start.isoformat(),
                    "end": event_end.isoformat(),
                    "all_day": False,
                    "event_type": "rent",
                    "booking_id": None,
                    "deal_id": deal.id if deal else None,
                    "lead_id": None,
                    "asset_id": None,
                    "asset_name": None,
                    "client_id": client.id if client else None,
                    "client_name": client_name or None,
                    "service_type": ServiceType.RENT.value,
                    "service_types": [ServiceType.RENT.value],
                    "status": order.status,
                    "assigned_to": deal.assigned_to if deal else None,
                    "color": SERVICE_COLORS.get(ServiceType.RENT, "#6b7280"),
                })

            # Сплавы
            rafting_stmt = (
            select(RaftingTrip, Deal, Client, RaftingRoute)
            .outerjoin(Deal, Deal.id == RaftingTrip.deal_id)
            .outerjoin(Client, Client.id == Deal.client_id)
            .join(RaftingRoute, RaftingRoute.id == RaftingTrip.route_id)
            .where(
                and_(
                    RaftingTrip.status != BookingStatus.CANCELLED,
                    RaftingTrip.trip_date >= start,
                    RaftingTrip.trip_date <= end,
                )
            )
            .order_by(RaftingTrip.created_at.desc())
            )
            if manager_id:
                rafting_stmt = rafting_stmt.where(Deal.assigned_to == manager_id)
            if service_type and service_type != ServiceType.RAFTING:
                rafting_stmt = rafting_stmt.where(False)

            rafting_result = await self.session.execute(rafting_stmt)
            for trip, deal, client, route in rafting_result.all():
                event_start = datetime.combine(trip.trip_date, time(9, 0))
                event_end = datetime.combine(trip.trip_date, time(12, 0))
                client_name = ""
                if client:
                    client_name = f"{client.first_name} {client.last_name}"
                events.append({
                    "id": f"rafting:{trip.id}",
                    "title": f"Сплав — {route.name}",
                    "start": event_start.isoformat(),
                    "end": event_end.isoformat(),
                    "all_day": False,
                    "event_type": "rafting",
                    "booking_id": None,
                    "deal_id": deal.id if deal else None,
                    "lead_id": None,
                    "asset_id": None,
                    "asset_name": route.name,
                    "client_id": client.id if client else None,
                    "client_name": client_name or None,
                    "service_type": ServiceType.RAFTING.value,
                    "service_types": [ServiceType.RAFTING.value],
                    "status": trip.status,
                    "assigned_to": deal.assigned_to if deal else None,
                    "color": SERVICE_COLORS.get(ServiceType.RAFTING, "#6b7280"),
                })

        # Заявки (leads) — активные, без конвертации (без привязки к активу)
        if asset_id:
            return events

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
        if service_type:
            lead_stmt = lead_stmt.where(Lead.service_type == service_type)

        lead_result = await self.session.execute(lead_stmt)
        for lead in lead_result.scalars().all():
            ev_date = lead.preferred_date or lead.created_at.date()
            ev_start = datetime.combine(ev_date, time(9, 0))
            ev_end = datetime.combine(ev_date, time(10, 0))
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
