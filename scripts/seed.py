#!/usr/bin/env python3
"""Создаёт роли и первого администратора, если их ещё нет."""
import asyncio
import os
import sys

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
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.modules.clients.models import Client  # noqa: F401 — до assets, нужен для Deal.client
from app.modules.assets.models import Asset, AssetCategory
from app.modules.users.models import User, Role


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Роли
        result = await session.execute(select(Role))
        roles = {r.name: r for r in result.scalars()}

        for name in ("admin", "director", "manager"):
            if name not in roles:
                role = Role(name=name)
                session.add(role)
                await session.flush()
                roles[name] = role
                print(f"  Создана роль: {name}")

        # Администратор (email из env или дефолт)
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
        admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")

        result = await session.execute(
            select(User).where(User.email == admin_email)
        )
        if result.scalar_one_or_none() is None:
            admin_role_id = roles["admin"].id
            admin = User(
                email=admin_email,
                full_name="Администратор",
                hashed_password=hash_password(admin_pass),
                role_id=admin_role_id,
            )
            session.add(admin)
            print(f"  Создан админ: {admin_email} / {admin_pass}")
        else:
            print(f"  Админ {admin_email} уже существует")

        # Категории активов (для календаря и бронирований)
        result = await session.execute(select(AssetCategory))
        categories = {c.name: c for c in result.scalars()}
        for name in ("kayak", "hostel_room", "transport", "gazebo", "equipment"):
            if name not in categories:
                cat = AssetCategory(name=name)
                session.add(cat)
                await session.flush()
                categories[name] = cat
                print(f"  Создана категория активов: {name}")

        # Пример актива (байдарка) для тестов
        result = await session.execute(select(Asset))
        if result.scalar_one_or_none() is None and "kayak" in categories:
            asset = Asset(
                category_id=categories["kayak"].id,
                name="Байдарка 1",
                code="K1",
                capacity=2,
                status="active",
            )
            session.add(asset)
            print("  Создан пример актива: Байдарка 1 (K1)")

        await session.commit()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
    print("Seed завершён.")
