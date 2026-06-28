"""Конфигурация приложения (pydantic-settings)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://crm:crm@localhost:5432/crm"
    SQL_ECHO: bool = False

    # Auth / JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_MIN: int = 30
    REFRESH_TOKEN_TTL_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Бизнес-настройки
    ALLOW_NEGATIVE_STOCK: bool = False
    REVENUE_MODE_DEFAULT: str = "shipments"  # shipments | payments

    # Первичный супер-админ (создаётся скриптом при старте контейнера)
    SUPERADMIN_EMAIL: str = "admin@example.com"
    SUPERADMIN_PASSWORD: str = "admin12345"
    SUPERADMIN_NAME: str = "Super Admin"


settings = Settings()
