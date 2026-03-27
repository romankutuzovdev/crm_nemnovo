#!/usr/bin/env python3
"""
Создаёт демо-данные для ручного тестирования UI:
- компании/клиенты
- заявки (leads)
- активы (assets) + товары (products)
- заказы (orders/deals) + бронирования (bookings)
- оплаты (payments) с частичной оплатой/переплатой/возвратом
- хостел: rooms/bookings/guests
- аренда: справочник + заказы с позициями
- сплавы: справочники + trips (заказы сплава)

Идемпотентность:
- скрипт можно запускать многократно: он создаёт то, чего ещё нет (или пропускает существующее).
"""

import asyncio
import os
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

# Добавляем корень проекта в path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import bcrypt  # noqa: F401
except ModuleNotFoundError:
    print(
        "Ошибка: нет модуля bcrypt — активируйте venv проекта "
        "(например, source .venv311/bin/activate) и выполните: pip install -e .",
        file=sys.stderr,
    )
    sys.exit(1)

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.modules.assets.models import Asset, AssetCategory, Product
from app.modules.bookings.models import Booking
from app.modules.deals.models import Deal, DealItem
from app.modules.clients.models import Client, Company
from app.modules.deals.schemas import BookingInDealCreate, DealItemCreate
from app.modules.leads.models import Lead
from app.modules.payments.models import Payment
from app.modules.rent.repository import RentCatalogRepository, RentOrderRepository
from app.modules.rent.schemas import RentCatalogItemCreate, RentOrderCreate, RentOrderLineInput
from app.modules.hostel.repository import HostelBookingRepository, HostelRoomRepository
from app.modules.hostel.schemas import HostelBookingCreate, HostelGuestInput, HostelRoomCreate
from app.modules.rafting.repository import (
    RaftingInstructorRepository,
    RaftingRouteRepository,
    RaftingTripRepository,
    TransportVehicleRepository,
)
from app.modules.rafting.schemas import (
    RaftingInstructorCreate,
    RaftingRouteCreate,
    RaftingTripCreate,
    TransportVehicleCreate,
)
from app.modules.users.models import Role, User
from app.shared.enums import (
    BookingStatus,
    DealStatus,
    LeadSource,
    LeadStatus,
    PaymentMethod,
    PaymentTxStatus,
    ServiceType,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dt(d: date, *, start_of_day: bool) -> datetime:
    return datetime.combine(d, time.min if start_of_day else time.max).replace(tzinfo=timezone.utc)

def _demo_number() -> str:
    # deals.number max length 30
    return f"DEMO-{date.today().strftime('%y%m%d')}-{uuid.uuid4().hex[:8]}"


def _sum_items(items: list["DealItemCreate"]) -> float:
    return float(sum(i.quantity * i.unit_price for i in items))


async def _ensure_manager(session: AsyncSession) -> User:
    result = await session.execute(select(Role).where(Role.name == "manager"))
    role = result.scalar_one_or_none()
    if role is None:
        role = Role(name="manager")
        session.add(role)
        await session.flush()

    email = "manager@example.com"
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        email=email,
        full_name="Менеджер (demo)",
        hashed_password=hash_password("manager123"),
        role_id=role.id,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


async def seed_demo() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Идемпотентность: создаём то, чего ещё нет (можно запускать многократно).
        # В старой БД мог остаться «частичный» seed, поэтому НЕ выходим по одному признаку.

        # Basic roles/users (admin expected from scripts/seed.py)
        result = await session.execute(select(User).order_by(User.created_at.asc()).limit(1))
        admin = result.scalar_one_or_none()
        if admin is None:
            raise RuntimeError("Нет пользователей в БД. Сначала запустите: python scripts/seed.py")

        manager = await _ensure_manager(session)

        # Companies
        companies: list[Company] = []
        for i in range(1, 4):
            inn = f"10020030{i}"
            existing = await session.execute(select(Company).where(Company.inn == inn))
            c = existing.scalar_one_or_none()
            if c is None:
                c = Company(
                    name=f"Demo Company {i}",
                    inn=inn,
                    address=f"Минск, ул. Демонстрационная, {i}",
                    phone=f"+3752900000{i}",
                    email=f"demo.company{i}@example.com",
                    segment="b2b",
                )
                session.add(c)
                await session.flush()
            companies.append(c)

        # Clients
        clients: list[Client] = []
        for i in range(1, 11):
            email = f"demo.client.{i}@example.com"
            existing = await session.execute(select(Client).where(Client.email == email))
            cl = existing.scalar_one_or_none()
            if cl is None:
                company_id = companies[i % len(companies)].id if i % 3 == 0 else None
                cl = Client(
                    first_name=f"Демо{i}",
                    last_name="Клиент",
                    email=email,
                    phone=f"+3752911100{i:02d}",
                    company_id=company_id,
                    source="manual",
                    tags=["demo", "seed"],
                    assigned_to=manager.id if i % 2 == 0 else None,
                )
                session.add(cl)
                await session.flush()
            clients.append(cl)

        # Leads
        today = date.today()
        leads: list[Lead] = []
        for i in range(1, 16):
            service = random.choice([ServiceType.RAFTING.value, ServiceType.HOSTEL.value, ServiceType.RENT.value])
            comment = f"Демо заявка #{i} ({service})"
            existing = await session.execute(select(Lead).where(Lead.comment == comment))
            lead = existing.scalar_one_or_none()
            if lead is None:
                lead = Lead(
                    client_id=clients[(i - 1) % len(clients)].id if i % 3 != 0 else None,
                    source=LeadSource.MANUAL.value,
                    status=LeadStatus.NEW.value if i % 5 != 0 else LeadStatus.IN_PROGRESS.value,
                    service_type=service,
                    preferred_date=today + timedelta(days=(i % 10)),
                    guests_count=2 + (i % 4),
                    comment=comment,
                    assigned_to=manager.id if i % 2 == 0 else None,
                    raw_payload={"demo": True, "idx": i},
                )
                session.add(lead)
                await session.flush()
            leads.append(lead)

        # Asset categories should exist from scripts/seed.py; create if missing
        result = await session.execute(select(AssetCategory))
        cat_by_name = {c.name: c for c in result.scalars().all()}
        for name in ("kayak", "hostel_room", "transport", "gazebo", "equipment"):
            if name not in cat_by_name:
                cat = AssetCategory(name=name, description="demo")
                session.add(cat)
                await session.flush()
                cat_by_name[name] = cat

        # Assets
        assets: list[Asset] = []
        result = await session.execute(select(Asset).where(Asset.code.like("DEMO-%")))
        assets.extend(list(result.scalars().all()))
        result = await session.execute(select(Asset.code))
        existing_asset_codes = {row[0] for row in result.all()}

        def unique_asset_code(base: str) -> str:
            code = base
            n = 1
            while code in existing_asset_codes:
                n += 1
                code = f"{base}-{n}"
            existing_asset_codes.add(code)
            return code

        def add_asset(cat: str, code: str, name: str, capacity: int) -> None:
            code = unique_asset_code(code)
            a = Asset(
                category_id=cat_by_name[cat].id,
                code=code,
                name=name,
                capacity=capacity,
                status="active",
                description="demo",
                meta={"demo": True},
            )
            session.add(a)
            assets.append(a)

        for i in range(1, 6):
            add_asset("kayak", f"DEMO-K{i}", f"Байдарка {i}", 2)
        for i in range(1, 6):
            add_asset("hostel_room", f"DEMO-R{i:03d}", f"Номер {i:03d}", 2 + (i % 2))
        for i in range(1, 4):
            add_asset("gazebo", f"DEMO-GZ{i}", f"Беседка {i}", 10 + i * 2)
        for i in range(1, 3):
            add_asset("transport", f"DEMO-BUS{i}", f"Микроавтобус {i}", 12)
        await session.flush()

        # Products for stock page
        products: list[Product] = []
        result = await session.execute(select(Product.sku))
        existing_skus = {row[0] for row in result.all()}
        for i in range(1, 6):
            sku = f"SKU-DEMO-{i}"
            if sku in existing_skus:
                sku = f"{sku}-{random.randint(100,999)}"
            existing_skus.add(sku)
            existing = await session.execute(select(Product).where(Product.sku == sku))
            p = existing.scalar_one_or_none()
            if p is None:
                p = Product(
                    name=f"Товар {i}",
                    sku=sku,
                    category="demo",
                    unit="pcs",
                    price=5.0 * i,
                    stock_quantity=20 * i,
                    is_rentable=False,
                )
                session.add(p)
                await session.flush()
            products.append(p)
        await session.flush()

        # Закрываем «ручные» вставки отдельным коммитом.
        # Дальше используем сервисы, которые сами открывают транзакции (session.begin()).
        admin_id = admin.id
        manager_id = manager.id
        client_ids = [c.id for c in clients]
        lead_ids = [l.id for l in leads]
        kayak_ids = [a.id for a in assets if a.code.startswith("DEMO-K")]
        room_asset_ids = [a.id for a in assets if a.code.startswith("DEMO-R")]
        gazebo_asset_ids = [a.id for a in assets if a.code.startswith("DEMO-GZ")]
        await session.commit()

    # Second session: create orders/payments + hostel/rent/rafting demo data (single transaction)
    async with async_session() as session:
        async with session.begin():
            # Avoid duplicating demo deals
            demo_deal_exists = await session.execute(
                select(Deal.id).where(Deal.notes.like("Demo order #%")).limit(1)
            )
            created_deal_ids: list[UUID] = []

            if demo_deal_exists.scalar_one_or_none() is None:
                for i in range(1, 7):
                    client_id = client_ids[(i - 1) % len(client_ids)]
                    service_type = random.choice([ServiceType.RAFTING, ServiceType.HOSTEL, ServiceType.RENT])
                    start = today + timedelta(days=i * 2)
                    end = start + timedelta(days=1 + (i % 2))

                    items = [
                        DealItemCreate(
                            description=f"{service_type.value} услуга (demo)",
                            quantity=1,
                            unit_price=200 + i * 25,
                        )
                    ]
                    deal = Deal(
                        number=_demo_number(),
                        client_id=client_id,
                        lead_id=lead_ids[i % len(lead_ids)],
                        assigned_to=manager_id if i % 2 == 0 else None,
                        service_type=service_type.value,
                        status=DealStatus.NEW.value,
                        start_date=start,
                        end_date=end,
                        guests_count=2 + (i % 5),
                        total_amount=_sum_items(items),
                        paid_amount=0.0,
                        notes=f"Demo order #{i}",
                        created_by=admin_id,
                    )
                    session.add(deal)
                    await session.flush()
                    created_deal_ids.append(deal.id)

                    for it in items:
                        session.add(
                            DealItem(
                                deal_id=deal.id,
                                asset_id=it.asset_id,
                                product_id=it.product_id,
                                description=it.description,
                                quantity=it.quantity,
                                unit_price=it.unit_price,
                                total_price=it.quantity * it.unit_price,
                            )
                        )

                    # booking for calendar
                    if service_type == ServiceType.RAFTING:
                        aid = kayak_ids[i % len(kayak_ids)]
                        session.add(
                            Booking(
                                deal_id=deal.id,
                                asset_id=aid,
                                start_datetime=_dt(start, start_of_day=True),
                                end_datetime=_dt(end, start_of_day=False),
                                quantity=1,
                                status=BookingStatus.CONFIRMED.value,
                            )
                        )
                    elif service_type == ServiceType.HOSTEL:
                        aid = room_asset_ids[i % len(room_asset_ids)]
                        session.add(
                            Booking(
                                deal_id=deal.id,
                                asset_id=aid,
                                start_datetime=_dt(start, start_of_day=True),
                                end_datetime=_dt(end, start_of_day=False),
                                quantity=1,
                                status=BookingStatus.CONFIRMED.value,
                            )
                        )
                    else:
                        aid = gazebo_asset_ids[i % len(gazebo_asset_ids)]
                        session.add(
                            Booking(
                                deal_id=deal.id,
                                asset_id=aid,
                                start_datetime=_dt(start, start_of_day=True),
                                end_datetime=_dt(start, start_of_day=False),
                                quantity=1,
                                status=BookingStatus.CONFIRMED.value,
                            )
                        )

                await session.flush()

                # Payments scenarios
                def add_payment(
                    deal_id: UUID,
                    amount: float,
                    method: PaymentMethod,
                    status: str,
                    notes: str,
                ) -> Payment:
                    p = Payment(
                        deal_id=deal_id,
                        amount=amount,
                        method=method.value,
                        status=status,
                        paid_at=_utcnow() if status == PaymentTxStatus.CONFIRMED.value else None,
                        confirmed_by=admin_id,
                        notes=notes,
                    )
                    session.add(p)
                    return p

                add_payment(created_deal_ids[0], 100.0, PaymentMethod.CASH, PaymentTxStatus.CONFIRMED.value, "demo partial")
                add_payment(created_deal_ids[1], 400.0, PaymentMethod.CARD, PaymentTxStatus.CONFIRMED.value, "demo full")
                p = add_payment(created_deal_ids[2], 600.0, PaymentMethod.TRANSFER, PaymentTxStatus.CONFIRMED.value, "demo over")
                await session.flush()
                p.status = PaymentTxStatus.REFUNDED.value

                # Recalc aggregates for first three deals
                for did in created_deal_ids[:3]:
                    d = await session.get(Deal, did)
                    if d is None:
                        continue
                    res = await session.execute(select(Payment.amount, Payment.status).where(Payment.deal_id == did))
                    paid = sum(float(a) for a, st in res.all() if st == PaymentTxStatus.CONFIRMED.value)
                    d.paid_amount = paid
                    d.recalculate_payment_status()

            # Related modules: hostel/rent/rafting
            from app.modules.hostel.models import HostelRoom
            from app.modules.rent.models import RentCatalogItem, RentOrder
            from app.modules.rafting.models import RaftingRoute, RaftingInstructor, TransportVehicle, RaftingTrip

            # Hostel
            hostel_room_repo = HostelRoomRepository(session)
            hostel_booking_repo = HostelBookingRepository(session)
            room_row = await session.execute(select(HostelRoom).where(HostelRoom.code == "DEMO-H-101").limit(1))
            room = room_row.scalar_one_or_none()
            if room is None:
                room = await hostel_room_repo.create(
                    **HostelRoomCreate(
                        code="DEMO-H-101",
                        title="Demo Hostel 101",
                        capacity=3,
                        floor=1,
                        base_price_per_night=50,
                    ).model_dump()
                )

            booking_exists = await session.execute(
                select(HostelBookingRepository.model.id)
                .where(HostelBookingRepository.model.notes == "demo hostel booking")
                .limit(1)
            )
            if booking_exists.scalar_one_or_none() is None:
                any_deal = await session.execute(select(Deal.id).order_by(Deal.created_at.desc()).limit(1))
                deal_id = any_deal.scalar_one_or_none()
                check_in = today + timedelta(days=3)
                check_out = today + timedelta(days=6)
                # Если номер уже занят (в БД могли остаться прошлые демо/ручные брони) — просто пропускаем.
                if not await hostel_booking_repo.has_overlap(room.id, check_in, check_out):
                    await hostel_booking_repo.create_with_guests(
                        room_id=room.id,
                        deal_id=deal_id,
                        check_in=check_in,
                        check_out=check_out,
                        total_amount=150.0,
                        status=BookingStatus.CONFIRMED.value,
                        notes="demo hostel booking",
                        guests=[
                            HostelGuestInput(full_name="Иван Гость", phone="+375299991111", id_document="AB1234567").model_dump(),
                            HostelGuestInput(full_name="Мария Гость", phone="+375299992222", id_document="AB7654321").model_dump(),
                        ],
                    )

            # Rent
            rent_catalog_repo = RentCatalogRepository(session)
            rent_order_repo = RentOrderRepository(session)
            gazebo_item_row = await session.execute(
                select(RentCatalogItem).where(RentCatalogItem.name == "Беседка (сутки)").limit(1)
            )
            gazebo_item = gazebo_item_row.scalar_one_or_none()
            if gazebo_item is None:
                gazebo_item = await rent_catalog_repo.create(
                    **RentCatalogItemCreate(name="Беседка (сутки)", unit_label="сутки", default_unit_price=120).model_dump()
                )
            grill_item_row = await session.execute(select(RentCatalogItem).where(RentCatalogItem.name == "Мангал").limit(1))
            grill_item = grill_item_row.scalar_one_or_none()
            if grill_item is None:
                grill_item = await rent_catalog_repo.create(
                    **RentCatalogItemCreate(name="Мангал", unit_label="шт", default_unit_price=15).model_dump()
                )
            rent_exists = await session.execute(select(RentOrder.id).where(RentOrder.notes == "demo rent order").limit(1))
            if rent_exists.scalar_one_or_none() is None:
                any_deal = await session.execute(select(Deal.id).order_by(Deal.created_at.desc()).limit(1))
                deal_id = any_deal.scalar_one_or_none()
                await rent_order_repo.create_with_lines(
                    service_date=today + timedelta(days=5),
                    deal_id=deal_id,
                    status=BookingStatus.PENDING.value,
                    notes="demo rent order",
                    lines=[
                        RentOrderLineInput(catalog_item_id=gazebo_item.id, title=gazebo_item.name, quantity=1, unit_price=120),
                        RentOrderLineInput(catalog_item_id=grill_item.id, title=grill_item.name, quantity=2, unit_price=15),
                    ],
                )

            # Rafting
            route_repo = RaftingRouteRepository(session)
            instr_repo = RaftingInstructorRepository(session)
            veh_repo = TransportVehicleRepository(session)
            trip_repo = RaftingTripRepository(session)

            route_row = await session.execute(select(RaftingRoute).where(RaftingRoute.name == "Река (демо)").limit(1))
            route = route_row.scalar_one_or_none()
            if route is None:
                route = await route_repo.create(**RaftingRouteCreate(name="Река (демо)", difficulty="I-II", duration_hours=4).model_dump())

            instr_row = await session.execute(
                select(RaftingInstructor).where(RaftingInstructor.full_name == "Инструктор Демо").limit(1)
            )
            instr = instr_row.scalar_one_or_none()
            if instr is None:
                instr = await instr_repo.create(**RaftingInstructorCreate(full_name="Инструктор Демо", phone="+375291234567").model_dump())

            veh_row = await session.execute(
                select(TransportVehicle).where(TransportVehicle.name == "Ford Transit (demo)").limit(1)
            )
            veh = veh_row.scalar_one_or_none()
            if veh is None:
                veh = await veh_repo.create(**TransportVehicleCreate(name="Ford Transit (demo)", plate_number="1234 AB-7", seats=12).model_dump())

            trip_exists = await session.execute(select(RaftingTrip.id).where(RaftingTrip.notes == "demo trip").limit(1))
            if trip_exists.scalar_one_or_none() is None:
                any_deal = await session.execute(select(Deal.id).order_by(Deal.created_at.desc()).limit(1))
                deal_id = any_deal.scalar_one_or_none()
                session.add(
                    RaftingTrip(
                        deal_id=deal_id,
                        route_id=route.id,
                        instructor_id=instr.id,
                        vehicle_id=veh.id,
                        trip_date=today + timedelta(days=4),
                        guests_count=8,
                        status=BookingStatus.CONFIRMED.value,
                        notes="demo trip",
                    )
                )

    await engine.dispose()
    print("Demo seed завершён.")


if __name__ == "__main__":
    try:
        asyncio.run(seed_demo())
    except OperationalError as e:
        print("Ошибка БД (похоже, не применены миграции Alembic).")
        print("Сначала выполните: alembic upgrade head")
        raise

