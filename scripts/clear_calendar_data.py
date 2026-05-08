#!/usr/bin/env python3
"""Hide all calendar events by moving records to archived statuses."""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.bookings.models import Booking
from app.modules.deals.models import Deal
from app.modules.hostel.models import HostelBooking
from app.modules.leads.models import Lead
from app.modules.rafting.models import RaftingTrip
from app.modules.rent.models import RentOrder
from app.shared.enums import BookingStatus, DealStatus, LeadStatus


async def _count_active(session: AsyncSession) -> dict[str, int]:
    return {
        "deals": int(
            await session.scalar(
                select(func.count()).select_from(Deal).where(Deal.status != DealStatus.CANCELLED)
            )
            or 0
        ),
        "bookings": int(
            await session.scalar(
                select(func.count()).select_from(Booking).where(Booking.status != BookingStatus.CANCELLED)
            )
            or 0
        ),
        "leads": int(
            await session.scalar(
                select(func.count())
                .select_from(Lead)
                .where(Lead.status.in_([LeadStatus.NEW, LeadStatus.IN_PROGRESS, LeadStatus.CONVERTED]))
            )
            or 0
        ),
        "hostel_bookings": int(
            await session.scalar(
                select(func.count())
                .select_from(HostelBooking)
                .where(HostelBooking.status != BookingStatus.CANCELLED)
            )
            or 0
        ),
        "rent_orders": int(
            await session.scalar(
                select(func.count()).select_from(RentOrder).where(RentOrder.status != BookingStatus.CANCELLED)
            )
            or 0
        ),
        "rafting_trips": int(
            await session.scalar(
                select(func.count())
                .select_from(RaftingTrip)
                .where(RaftingTrip.status != BookingStatus.CANCELLED)
            )
            or 0
        ),
    }


async def clear_calendar_data() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        before = await _count_active(session)
        print(f"[calendar-clear] before: {before}")

        await session.execute(
            update(Booking)
            .where(Booking.status != BookingStatus.CANCELLED)
            .values(status=BookingStatus.CANCELLED)
        )
        await session.execute(
            update(Deal).where(Deal.status != DealStatus.CANCELLED).values(status=DealStatus.CANCELLED)
        )
        await session.execute(
            update(Lead)
            .where(Lead.status.in_([LeadStatus.NEW, LeadStatus.IN_PROGRESS, LeadStatus.CONVERTED]))
            .values(status=LeadStatus.REJECTED)
        )
        await session.execute(
            update(HostelBooking)
            .where(HostelBooking.status != BookingStatus.CANCELLED)
            .values(status=BookingStatus.CANCELLED)
        )
        await session.execute(
            update(RentOrder)
            .where(RentOrder.status != BookingStatus.CANCELLED)
            .values(status=BookingStatus.CANCELLED)
        )
        await session.execute(
            update(RaftingTrip)
            .where(RaftingTrip.status != BookingStatus.CANCELLED)
            .values(status=BookingStatus.CANCELLED)
        )

        await session.commit()
        after = await _count_active(session)
        print(f"[calendar-clear] after: {after}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(clear_calendar_data())
