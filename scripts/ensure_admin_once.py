#!/usr/bin/env python3
"""Create one admin user once; skip if already exists."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.modules.users.models import Role, User


async def ensure_admin_once() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        role_res = await session.execute(select(Role).where(Role.name == "admin"))
        admin_role = role_res.scalar_one_or_none()
        if admin_role is None:
            admin_role = Role(name="admin", permissions={})
            session.add(admin_role)
            await session.flush()
            print("Created role: admin")

        user_res = await session.execute(select(User).where(User.email == admin_email))
        existing = user_res.scalar_one_or_none()
        if existing is not None:
            print(f"Admin already exists: {admin_email} (skip)")
            await session.commit()
            await engine.dispose()
            return

        session.add(
            User(
                email=admin_email,
                full_name="Администратор",
                hashed_password=hash_password(admin_password),
                role_id=admin_role.id,
                is_active=True,
            )
        )
        await session.commit()
        print(f"Created admin once: {admin_email}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(ensure_admin_once())
