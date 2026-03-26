#!/usr/bin/env python3
"""
Набивает БД парами тестовых записей по основным сущностям.
Повторный запуск безопасен: объекты с теми же уникальными ключами не дублируются.

  .venv311/bin/python scripts/seed_demo_data.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import bcrypt  # noqa: F401
except ModuleNotFoundError:
    print("Активируйте venv проекта и выполните: pip install -e .", file=sys.stderr)
    sys.exit(1)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.modules.assets.models import Asset, AssetCategory, AssetMaintenance, Product, StockMovement
from app.modules.bookings.models import Booking
from app.modules.clients.models import Client, ClientNote, Company
from app.modules.deals.models import Deal, DealItem
from app.modules.hostel.models import HostelBooking, HostelGuest, HostelRoom
from app.modules.integrations.models import IntegrationConfig, WebhookLog
from app.modules.leads.models import Lead
from app.modules.notifications.models import NotificationLog, NotificationTemplate
from app.modules.payments.models import Invoice, Payment
from app.modules.rafting.models import RaftingInstructor, RaftingRoute, RaftingTrip, TransportVehicle
from app.modules.rent.models import RentCatalogItem, RentOrder, RentOrderLine
from app.modules.users.models import AuditLog, User
from app.shared.enums import (
    BookingStatus,
    DealStatus,
    InvoiceStatus,
    LeadSource,
    LeadStatus,
    NotificationChannel,
    NotificationStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentTxStatus,
    ServiceType,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def seed_demo(session: AsyncSession) -> None:
    r = await session.execute(select(User).order_by(User.created_at).limit(1))
    actor = r.scalar_one_or_none()
    if not actor:
        print("Нет пользователей. Сначала: python scripts/seed.py")
        return

    # --- Categories & assets (codes DEMO-*) ---
    r = await session.execute(select(AssetCategory))
    categories = {c.name: c for c in r.scalars().all()}
    if not categories:
        print("Нет категорий активов. Сначала: python scripts/seed.py")
        return

    async def ensure_asset(code: str, name: str, cat_name: str) -> Asset:
        q = await session.execute(select(Asset).where(Asset.code == code))
        a = q.scalar_one_or_none()
        if a:
            return a
        cat_id = categories.get(cat_name) or next(iter(categories.values()))
        a = Asset(
            category_id=cat_id.id,
            name=name,
            code=code,
            capacity=2,
            status="active",
        )
        session.add(a)
        await session.flush()
        print(f"  + актив {code}")
        return a

    asset_k1 = await ensure_asset("DEMO-K1", "Демо байдарка 1", "kayak")
    await ensure_asset("DEMO-R1", "Демо гостевая комната", "hostel_room")

    # --- Companies & clients ---
    async def ensure_company(inn: str, name: str, segment: str = "b2b") -> Company:
        q = await session.execute(select(Company).where(Company.inn == inn))
        c = q.scalar_one_or_none()
        if c:
            return c
        c = Company(name=name, inn=inn, phone="+74950001122", segment=segment)
        session.add(c)
        await session.flush()
        print(f"  + компания {name}")
        return c

    co1 = await ensure_company("9900000001", "Демо ООО «Речной тур»")
    co2 = await ensure_company("9900000002", "Демо ИП Иванов", segment="b2c")

    async def ensure_client(phone: str, first: str, last: str, company: Company | None) -> Client:
        q = await session.execute(select(Client).where(Client.phone == phone))
        cl = q.scalar_one_or_none()
        if cl:
            return cl
        cl = Client(
            first_name=first,
            last_name=last,
            email=f"{phone.replace('+', '')}@demo.local",
            phone=phone,
            company_id=company.id if company else None,
            source="manual",
            assigned_to=actor.id,
        )
        session.add(cl)
        await session.flush()
        print(f"  + клиент {first} {last}")
        return cl

    client_a = await ensure_client("+79990000001", "Алексей", "Демов", co1)
    client_b = await ensure_client("+79990000002", "Мария", "Тестова", co2)

    async def ensure_note(client: Client, text: str) -> None:
        q = await session.execute(
            select(ClientNote).where(ClientNote.client_id == client.id, ClientNote.text == text)
        )
        if q.scalar_one_or_none():
            return
        session.add(ClientNote(client_id=client.id, author_id=actor.id, text=text))
        print(f"  + заметка к клиенту {client.first_name}")

    await ensure_note(client_a, "Демо: интересуется сплавом на выходных.")
    await ensure_note(client_b, "Демо: бронь хостела на следующую неделю.")

    # --- Leads ---
    async def ensure_lead(phone_suffix: str, status: str) -> Lead:
        ref = f"demo-lead-{phone_suffix}"
        q = await session.execute(select(Lead).where(Lead.source_ref == ref))
        le = q.scalar_one_or_none()
        if le:
            return le
        le = Lead(
            client_id=client_a.id,
            source=LeadSource.SITE_FORM,
            source_ref=ref,
            status=status,
            service_type=ServiceType.RAFTING,
            guests_count=2,
            comment="Демо-лид",
            assigned_to=actor.id,
        )
        session.add(le)
        await session.flush()
        print(f"  + лид {ref}")
        return le

    lead1 = await ensure_lead("01", LeadStatus.NEW)
    await ensure_lead("02", LeadStatus.IN_PROGRESS)

    # --- Deals ---
    async def ensure_deal(number: str, client: Client, lead: Lead | None) -> Deal:
        q = await session.execute(select(Deal).where(Deal.number == number))
        d = q.scalar_one_or_none()
        if d:
            return d
        d0 = date.today()
        d = Deal(
            number=number,
            client_id=client.id,
            lead_id=lead.id if lead else None,
            assigned_to=actor.id,
            service_type=ServiceType.RAFTING,
            status=DealStatus.CONFIRMED,
            start_date=d0,
            end_date=d0 + timedelta(days=1),
            guests_count=2,
            total_amount=Decimal("15000.00"),
            paid_amount=Decimal("5000.00"),
            payment_status=PaymentStatus.PARTIAL,
            notes="Демо-сделка",
            created_by=actor.id,
        )
        session.add(d)
        await session.flush()
        print(f"  + сделка {number}")
        return d

    deal1 = await ensure_deal("DEMO-ORD-001", client_a, lead1)
    deal2 = await ensure_deal("DEMO-ORD-002", client_b, None)

    async def ensure_deal_item(
        deal: Deal,
        desc: str,
        price: Decimal,
        *,
        link_kayak: bool = False,
        product: Product | None = None,
    ) -> None:
        aid = asset_k1.id if link_kayak else None
        pid = product.id if product else None
        q = await session.execute(
            select(DealItem).where(DealItem.deal_id == deal.id, DealItem.description == desc)
        )
        if q.scalar_one_or_none():
            return
        session.add(
            DealItem(
                deal_id=deal.id,
                asset_id=aid,
                product_id=pid,
                description=desc,
                quantity=1,
                unit_price=price,
                total_price=price,
            )
        )
        print(f"  + позиция сделки: {desc}")

    await ensure_deal_item(deal1, "Демо: аренда байдарки", Decimal("8000.00"), link_kayak=True)
    await ensure_deal_item(
        deal1, "Демо: сопровождение инструктора", Decimal("7000.00"), link_kayak=False
    )

    # --- Bookings (asset booking slot) ---
    start_dt = utcnow() + timedelta(days=3)
    end_dt = start_dt + timedelta(hours=4)

    async def ensure_booking(deal: Deal, start: datetime, end: datetime) -> None:
        q = await session.execute(
            select(Booking).where(
                Booking.deal_id == deal.id,
                Booking.asset_id == asset_k1.id,
                Booking.start_datetime == start,
            )
        )
        if q.scalar_one_or_none():
            return
        session.add(
            Booking(
                deal_id=deal.id,
                asset_id=asset_k1.id,
                start_datetime=start,
                end_datetime=end,
                quantity=1,
                status=BookingStatus.CONFIRMED,
            )
        )
        print(f"  + бронирование актива для {deal.number}")

    await ensure_booking(deal1, start_dt, end_dt)
    await ensure_booking(deal2, start_dt + timedelta(days=1), end_dt + timedelta(days=1))

    # --- Payments ---
    async def ensure_payment(deal: Deal, ext: str, amount: Decimal) -> None:
        q = await session.execute(select(Payment).where(Payment.external_id == ext))
        if q.scalar_one_or_none():
            return
        session.add(
            Payment(
                deal_id=deal.id,
                amount=amount,
                method=PaymentMethod.CARD,
                status=PaymentTxStatus.CONFIRMED,
                external_id=ext,
                paid_at=utcnow(),
                confirmed_by=actor.id,
                notes="Демо-платёж",
            )
        )
        print(f"  + платёж {ext}")

    await ensure_payment(deal1, "demo-pay-001", Decimal("5000.00"))
    await ensure_payment(deal2, "demo-pay-002", Decimal("3000.00"))

    # --- Invoices ---
    async def ensure_invoice(deal: Deal, suffix: str) -> None:
        q = await session.execute(
            select(Invoice).where(Invoice.deal_id == deal.id, Invoice.pdf_url == f"demo://inv-{suffix}")
        )
        if q.scalar_one_or_none():
            return
        session.add(
            Invoice(
                deal_id=deal.id,
                issuer_company_id=co1.id,
                amount=Decimal("10000.00"),
                due_date=date.today() + timedelta(days=14),
                status=InvoiceStatus.SENT,
                pdf_url=f"demo://inv-{suffix}",
            )
        )
        print(f"  + счёт demo-{suffix}")

    await ensure_invoice(deal1, "001")
    await ensure_invoice(deal2, "002")

    # --- Products & stock ---
    async def ensure_product(sku: str, name: str) -> Product:
        q = await session.execute(select(Product).where(Product.sku == sku))
        p = q.scalar_one_or_none()
        if p:
            return p
        p = Product(
            name=name,
            sku=sku,
            category="equipment",
            unit="pcs",
            price=1200.0,
            stock_quantity=10,
            is_rentable=True,
        )
        session.add(p)
        await session.flush()
        print(f"  + товар {sku}")
        return p

    p1 = await ensure_product("DEMO-P-SPF", "Демо спасжилет")
    p2 = await ensure_product("DEMO-P-PAD", "Демо сидушка")

    await ensure_deal_item(deal2, "Демо товар: спасжилет", Decimal("1200.00"), product=p1)

    async def ensure_stock_mv(product: Product, delta: int, new_q: int) -> None:
        q = await session.execute(
            select(StockMovement).where(
                StockMovement.product_id == product.id,
                StockMovement.reason == "demo_seed",
                StockMovement.delta_qty == delta,
            )
        )
        if q.scalar_one_or_none():
            return
        session.add(
            StockMovement(
                product_id=product.id,
                delta_qty=delta,
                new_quantity=new_q,
                reason="demo_seed",
                created_by=actor.id,
            )
        )
        print(f"  + движение склада {product.sku} Δ{delta}")

    await ensure_stock_mv(p1, 5, 10)
    await ensure_stock_mv(p2, 3, 10)

    # --- Asset maintenance ---
    q = await session.execute(
        select(AssetMaintenance).where(
            AssetMaintenance.asset_id == asset_k1.id,
            AssetMaintenance.reason == "Демо: сезонный осмотр",
        )
    )
    if not q.scalar_one_or_none():
        d0 = date.today()
        session.add(
            AssetMaintenance(
                asset_id=asset_k1.id,
                start_date=d0,
                end_date=d0 + timedelta(days=2),
                reason="Демо: сезонный осмотр",
                created_by=actor.id,
            )
        )
        print("  + обслуживание актива")

    # --- Hostel ---
    async def ensure_room(code: str, title: str) -> HostelRoom:
        q = await session.execute(select(HostelRoom).where(HostelRoom.code == code))
        room = q.scalar_one_or_none()
        if room:
            return room
        room = HostelRoom(
            code=code,
            title=title,
            capacity=2,
            floor=2,
            base_price_per_night=Decimal("3500.00"),
            description="Демо-комната",
        )
        session.add(room)
        await session.flush()
        print(f"  + комната хостела {code}")
        return room

    hr1 = await ensure_room("DEMO-H-101", "Стандарт 101")
    hr2 = await ensure_room("DEMO-H-102", "Стандарт 102")

    async def ensure_hostel_booking(room: HostelRoom, deal: Deal | None, suf: str) -> HostelBooking:
        q = await session.execute(
            select(HostelBooking).where(HostelBooking.notes == f"demo-hostel-{suf}")
        )
        hb = q.scalar_one_or_none()
        if hb:
            return hb
        ci = date.today() + timedelta(days=5)
        co = ci + timedelta(days=2)
        hb = HostelBooking(
            room_id=room.id,
            deal_id=deal.id if deal else None,
            check_in=ci,
            check_out=co,
            total_amount=Decimal("7000.00"),
            status=BookingStatus.CONFIRMED,
            notes=f"demo-hostel-{suf}",
        )
        session.add(hb)
        await session.flush()
        print(f"  + бронь хостела {suf}")
        return hb

    hb1 = await ensure_hostel_booking(hr1, deal1, "a")
    hb2 = await ensure_hostel_booking(hr2, deal2, "b")

    async def ensure_guest(booking: HostelBooking, name: str) -> None:
        q = await session.execute(
            select(HostelGuest).where(HostelGuest.booking_id == booking.id, HostelGuest.full_name == name)
        )
        if q.scalar_one_or_none():
            return
        session.add(HostelGuest(booking_id=booking.id, full_name=name, phone="+79991112233"))
        print(f"  + гость хостела {name}")

    await ensure_guest(hb1, "Демо Гость Один")
    await ensure_guest(hb2, "Демо Гость Два")

    # --- Rafting routes / trips ---
    async def ensure_route(name: str) -> RaftingRoute:
        q = await session.execute(select(RaftingRoute).where(RaftingRoute.name == name))
        rt = q.scalar_one_or_none()
        if rt:
            return rt
        rt = RaftingRoute(
            name=name,
            difficulty="II",
            duration_hours=3,
            description="Демо-маршрут",
        )
        session.add(rt)
        await session.flush()
        print(f"  + маршрут {name}")
        return rt

    rt1 = await ensure_route("Демо: р. Тестовая (уч.)")
    rt2 = await ensure_route("Демо: спокойный участок")

    async def ensure_instructor(name: str) -> RaftingInstructor:
        q = await session.execute(select(RaftingInstructor).where(RaftingInstructor.full_name == name))
        ins = q.scalar_one_or_none()
        if ins:
            return ins
        ins = RaftingInstructor(full_name=name, phone="+79994445566")
        session.add(ins)
        await session.flush()
        print(f"  + инструктор {name}")
        return ins

    i1 = await ensure_instructor("Демо Инструктор Первый")
    i2 = await ensure_instructor("Демо Инструктор Второй")

    async def ensure_vehicle(name: str, plate: str) -> TransportVehicle:
        q = await session.execute(select(TransportVehicle).where(TransportVehicle.plate_number == plate))
        v = q.scalar_one_or_none()
        if v:
            return v
        v = TransportVehicle(name=name, plate_number=plate, seats=8)
        session.add(v)
        await session.flush()
        print(f"  + транспорт {plate}")
        return v

    v1 = await ensure_vehicle("Демо Ford Transit", "DEMO-01")
    v2 = await ensure_vehicle("Демо УАЗ", "DEMO-02")

    async def ensure_trip(route: RaftingRoute, deal: Deal | None, suf: str, d: date) -> None:
        q = await session.execute(
            select(RaftingTrip).where(RaftingTrip.notes == f"demo-trip-{suf}")
        )
        if q.scalar_one_or_none():
            return
        session.add(
            RaftingTrip(
                deal_id=deal.id if deal else None,
                route_id=route.id,
                instructor_id=i1.id,
                vehicle_id=v1.id,
                trip_date=d,
                guests_count=4,
                status=BookingStatus.CONFIRMED,
                notes=f"demo-trip-{suf}",
            )
        )
        print(f"  + сплав {suf}")

    await ensure_trip(rt1, deal1, "1", date.today() + timedelta(days=7))
    await ensure_trip(rt2, deal2, "2", date.today() + timedelta(days=8))

    # --- Rent ---
    async def ensure_rent_item(name: str) -> RentCatalogItem:
        q = await session.execute(select(RentCatalogItem).where(RentCatalogItem.name == name))
        it = q.scalar_one_or_none()
        if it:
            return it
        it = RentCatalogItem(
            name=name,
            unit_label="сутки",
            default_unit_price=Decimal("500.00"),
            description="Демо позиция проката",
        )
        session.add(it)
        await session.flush()
        print(f"  + каталог проката {name}")
        return it

    ri1 = await ensure_rent_item("Демо палатка 2-местная")
    ri2 = await ensure_rent_item("Демо котелок туристический")

    async def ensure_rent_order(deal: Deal | None, suf: str, d: date) -> RentOrder:
        q = await session.execute(select(RentOrder).where(RentOrder.notes == f"demo-rent-{suf}"))
        ro = q.scalar_one_or_none()
        if ro:
            return ro
        ro = RentOrder(
            service_date=d,
            deal_id=deal.id if deal else None,
            status=BookingStatus.CONFIRMED,
            total_amount=Decimal("1500.00"),
            notes=f"demo-rent-{suf}",
        )
        session.add(ro)
        await session.flush()
        session.add(
            RentOrderLine(
                order_id=ro.id,
                catalog_item_id=ri1.id,
                title="Палатка",
                quantity=1,
                unit_price=Decimal("500.00"),
                line_total=Decimal("500.00"),
            )
        )
        session.add(
            RentOrderLine(
                order_id=ro.id,
                catalog_item_id=ri2.id,
                title="Котелок",
                quantity=2,
                unit_price=Decimal("500.00"),
                line_total=Decimal("1000.00"),
            )
        )
        print(f"  + заказ проката {suf}")
        return ro

    await ensure_rent_order(deal1, "a", date.today() + timedelta(days=2))
    await ensure_rent_order(None, "b", date.today() + timedelta(days=3))

    # --- Integrations ---
    async def ensure_webhook(source: str, ip: str) -> None:
        q = await session.execute(
            select(WebhookLog).where(WebhookLog.source == source, WebhookLog.ip_address == ip)
        )
        if q.scalar_one_or_none():
            return
        session.add(
            WebhookLog(
                source=source,
                raw_payload={"demo": True, "event": source},
                is_processed=True,
                ip_address=ip,
            )
        )
        print(f"  + webhook_log {source}")

    await ensure_webhook("site", "127.0.0.10")
    await ensure_webhook("telephony", "127.0.0.11")

    async def ensure_integration(name: str) -> None:
        q = await session.execute(select(IntegrationConfig).where(IntegrationConfig.name == name))
        if q.scalar_one_or_none():
            return
        session.add(
            IntegrationConfig(
                name=name,
                is_enabled=True,
                config={"demo": True},
            )
        )
        print(f"  + integration {name}")

    await ensure_integration("demo_site")
    await ensure_integration("demo_calls")

    # --- Notifications ---
    async def ensure_tpl(code: str, body: str) -> None:
        q = await session.execute(select(NotificationTemplate).where(NotificationTemplate.code == code))
        if q.scalar_one_or_none():
            return
        session.add(
            NotificationTemplate(
                code=code,
                channel=NotificationChannel.SMS,
                subject=None,
                body_template=body,
            )
        )
        print(f"  + шаблон {code}")

    await ensure_tpl("demo_booking_confirm", "Здравствуйте, {{name}}! Бронь подтверждена.")
    await ensure_tpl("demo_payment_ok", "Оплата получена, спасибо.")

    async def ensure_notif_log(tpl: str, phone: str) -> None:
        q = await session.execute(
            select(NotificationLog).where(
                NotificationLog.template_code == tpl,
                NotificationLog.recipient_phone == phone,
            )
        )
        if q.scalar_one_or_none():
            return
        session.add(
            NotificationLog(
                recipient_phone=phone,
                channel=NotificationChannel.SMS,
                template_code=tpl,
                payload={"demo": True},
                status=NotificationStatus.SENT,
                sent_at=utcnow(),
            )
        )
        print(f"  + notification_log {tpl}")

    await ensure_notif_log("demo_booking_confirm", "+79990000003")
    await ensure_notif_log("demo_payment_ok", "+79990000004")

    # --- Audit ---
    async def ensure_audit(resource: str) -> None:
        q = await session.execute(
            select(AuditLog).where(
                AuditLog.user_id == actor.id,
                AuditLog.resource == resource,
                AuditLog.action == "CREATE",
                AuditLog.ip_address == "demo-seed",
            )
        )
        if q.scalar_one_or_none():
            return
        session.add(
            AuditLog(
                user_id=actor.id,
                action="CREATE",
                resource=resource,
                resource_id=deal1.id,
                after={"demo": True},
                ip_address="demo-seed",
            )
        )
        print(f"  + audit {resource}")

    await ensure_audit("deals")
    await ensure_audit("leads")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        await seed_demo(session)
        await session.commit()
    await engine.dispose()
    print("Демо-данные готовы.")


if __name__ == "__main__":
    asyncio.run(main())
