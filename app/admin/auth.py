"""Аутентификация админки через User/Role из БД."""
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.core.security import verify_password
from app.db.session import AsyncSessionLocal
from app.modules.users.models import Role, User


class AdminAuth(AuthenticationBackend):
    """Вход по email + пароль, только роли admin и director."""

    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = form.get("username") or ""
        password = form.get("password") or ""

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User, Role)
                .join(Role, User.role_id == Role.id)
                .where(User.email == email, User.is_active.is_(True))
            )
            row = result.one_or_none()
            if not row:
                return False
            user, role = row
            if role.name not in ("admin", "director"):
                return False
            if not verify_password(password, user.hashed_password):
                return False
            request.session.update({"user_id": str(user.id), "role": role.name})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return bool(request.session.get("user_id"))
