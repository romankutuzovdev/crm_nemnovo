from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings

# SQLite не использует пул соединений — для него StaticPool
connect_args = {}
engine_kw: dict = {"echo": settings.APP_DEBUG}
if "sqlite" in settings.DATABASE_URL:
    engine_kw["connect_args"] = {"check_same_thread": False}
    engine_kw["poolclass"] = StaticPool
else:
    engine_kw["pool_size"] = 20
    engine_kw["max_overflow"] = 10
    engine_kw["pool_pre_ping"] = True

engine = create_async_engine(settings.DATABASE_URL, **engine_kw)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
