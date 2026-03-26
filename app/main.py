from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.sessions import SessionMiddleware

from app.admin.setup import setup_admin
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.middleware import RequestLoggingMiddleware
from app.db.redis import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Warm up Redis connection
    await get_redis()
    yield
    await close_redis()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="CRM Nemnovo",
    description="CRM system for outdoor activities and hostel management",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    # Когда allow_origins="*" — allow_credentials=true нарушает спецификацию CORS и часто
    # приводит к блокировкам браузером.
    allow_credentials="*" not in settings.ALLOWED_HOSTS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging
app.add_middleware(RequestLoggingMiddleware)

# Сессии для админки (30 дней — не требовать повторного входа)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    max_age=30 * 24 * 60 * 60,  # 30 дней
)

# SQLAdmin
setup_admin(app)

# API routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
