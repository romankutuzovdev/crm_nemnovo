#!/usr/bin/env python3
"""
Создаёт пользователя в CRM.
Использование:
  python scripts/create_user.py
  python scripts/create_user.py --email user@mail.ru --password mypass123
  ADMIN_EMAIL=user@mail.ru ADMIN_PASSWORD=mypass123 python scripts/create_user.py
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import bcrypt  # noqa: F401 — нужен passlib[bcrypt]; проверка до импорта app
except ModuleNotFoundError:
    print(
        "Ошибка: нет модуля bcrypt — скорее всего запущен не тот Python/venv "
        "(например, каталог env/, а не .venv311/).\n"
        "Сделайте так:\n"
        "  source .venv311/bin/activate && pip install -e .\n"
        "  python scripts/create_user.py ...\n"
        "или одной командой:\n"
        "  .venv311/bin/python scripts/create_user.py ...",
        file=sys.stderr,
    )
    sys.exit(1)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.modules.users.models import User, Role


async def create_user(email: str, password: str, full_name: str = "Пользователь", role_name: str = "admin"):
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            print(f"Пользователь {email} уже существует")
            await engine.dispose()
            return

        result = await session.execute(select(Role).where(Role.name == role_name))
        role = result.scalar_one_or_none()
        if not role:
            result = await session.execute(select(Role).limit(1))
            role = result.scalar_one_or_none()
        if not role:
            print("Ошибка: нет ролей в БД. Сначала выполните: python scripts/seed.py")
            await engine.dispose()
            return

        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            role_id=role.id,
        )
        session.add(user)
        await session.commit()
        print(f"Создан пользователь: {email}")
        print(f"  Логин:  {email}")
        print(f"  Пароль: {password}")

    await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Создать пользователя CRM")
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@example.com"))
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", "admin123"))
    parser.add_argument("--name", default="Администратор", help="ФИО пользователя")
    parser.add_argument("--role", default="admin", choices=["admin", "director", "manager"])
    args = parser.parse_args()

    asyncio.run(create_user(args.email, args.password, args.name, args.role))


if __name__ == "__main__":
    main()
