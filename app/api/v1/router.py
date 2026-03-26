from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.clients.router import router as clients_router
from app.modules.companies.router import router as companies_router
from app.modules.leads.router import router as leads_router
from app.modules.deals.router import router as deals_router
from app.modules.orders.router import router as orders_router
from app.modules.assets.router import router as assets_router
from app.modules.payments.router import router as payments_router
from app.modules.calendar.router import router as calendar_router
from app.modules.notifications.router import router as notifications_router
from app.modules.integrations.router import router as integrations_router
from app.modules.reports.router import router as reports_router
from app.modules.rafting.router import router as rafting_router
from app.modules.hostel.router import router as hostel_router
from app.modules.rent.router import router as rent_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(clients_router)
api_router.include_router(companies_router)
api_router.include_router(leads_router)
api_router.include_router(deals_router)
api_router.include_router(orders_router)
api_router.include_router(assets_router)
api_router.include_router(payments_router)
api_router.include_router(calendar_router)
api_router.include_router(notifications_router)
api_router.include_router(integrations_router)
api_router.include_router(reports_router)
api_router.include_router(rafting_router)
api_router.include_router(hostel_router)
api_router.include_router(rent_router)
