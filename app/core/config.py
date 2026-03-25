from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    APP_ENV: str = "development"
    APP_DEBUG: bool = False
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALLOWED_HOSTS: list[str] = ["*"]
    API_V1_PREFIX: str = "/api/v1"

    # Database (SQLite по умолчанию для разработки)
    DATABASE_URL: str = "sqlite+aiosqlite:///./crm.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # SMS
    SMS_API_KEY: str = ""
    SMS_SENDER: str = "CRM"

    # Telephony
    TELEPHONY_API_KEY: str = ""
    TELEPHONY_API_SECRET: str = ""
    TELEPHONY_WEBHOOK_SECRET: str = ""

    # Payment (YooKassa)
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""
    YOOKASSA_WEBHOOK_SECRET: str = ""

    # Site integration
    SITE_WEBHOOK_SECRET: str = ""

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


settings = Settings()  # type: ignore[call-arg]
