"""Подключение SQLAdmin к FastAPI."""
from sqladmin import Admin
from sqlalchemy import create_engine

from app.admin.auth import AdminAuth
from app.admin.views import (
    AssetAdmin,
    AssetCategoryAdmin,
    AssetMaintenanceAdmin,
    AuditLogAdmin,
    BookingAdmin,
    ClientAdmin,
    ClientNoteAdmin,
    CompanyAdmin,
    DealAdmin,
    DealItemAdmin,
    InvoiceAdmin,
    LeadAdmin,
    PaymentAdmin,
    ProductAdmin,
    RoleAdmin,
    UserAdmin,
)
from app.core.config import settings


def get_sync_engine():
    """Синхронный engine для SQLAdmin (поддержка async в админке ограничена)."""
    url = settings.DATABASE_URL
    if "sqlite+aiosqlite" in url:
        url = url.replace("sqlite+aiosqlite", "sqlite")
    elif "+asyncpg" in url:
        url = url.replace("+asyncpg", "")
    return create_engine(url, connect_args={"check_same_thread": False} if "sqlite" in url else {})


def setup_admin(app):
    """Монтирует админку в приложение."""
    engine = get_sync_engine()
    auth = AdminAuth(secret_key=settings.SECRET_KEY)

    admin = Admin(
        app,
        engine,
        title="CRM Nemnovo — Админка",
        base_url="/admin",
        authentication_backend=auth,
    )

    admin.add_view(UserAdmin)
    admin.add_view(RoleAdmin)
    admin.add_view(CompanyAdmin)
    admin.add_view(ClientAdmin)
    admin.add_view(ClientNoteAdmin)
    admin.add_view(LeadAdmin)
    admin.add_view(DealAdmin)
    admin.add_view(DealItemAdmin)
    admin.add_view(AssetCategoryAdmin)
    admin.add_view(AssetAdmin)
    admin.add_view(AssetMaintenanceAdmin)
    admin.add_view(ProductAdmin)
    admin.add_view(BookingAdmin)
    admin.add_view(PaymentAdmin)
    admin.add_view(InvoiceAdmin)
    admin.add_view(AuditLogAdmin)
