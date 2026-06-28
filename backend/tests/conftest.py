"""Тестовая инфраструктура: отдельная БД crm_test в том же Postgres.

Движок приложения создаётся из DATABASE_URL на импорте, поэтому env подменяется
ДО импорта app. Создание БД и таблиц — синхронно через asyncio.run на импорте.
Каждый тест получает функционально-скоупный движок (на своём event loop) и чистую
БД с засеянным суперадмином; `get_db` переопределяется на тестовую сессию.
"""
from __future__ import annotations

import asyncio
import os

# --- Подмена БД до импорта приложения ---
_ORIG = os.environ.get("DATABASE_URL", "postgresql+asyncpg://crm:crm@db:5432/crm")
_BASE, _, _ = _ORIG.rpartition("/")
MAINT_URL = _ORIG
TEST_URL = f"{_BASE}/crm_test"
os.environ["DATABASE_URL"] = TEST_URL

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models  # noqa: E402,F401  регистрирует все модели
from app.api.deps import get_db  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.core.enums import UserRole  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "admin12345"


async def _bootstrap() -> None:
    """Пересоздаёт чистую БД crm_test и все таблицы (один раз на запуск pytest)."""
    maint = create_async_engine(MAINT_URL, isolation_level="AUTOCOMMIT")
    async with maint.connect() as conn:
        await conn.execute(text("DROP DATABASE IF EXISTS crm_test WITH (FORCE)"))
        await conn.execute(text("CREATE DATABASE crm_test"))
    await maint.dispose()

    eng = create_async_engine(TEST_URL)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await eng.dispose()


asyncio.run(_bootstrap())


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(TEST_URL)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def client(engine):
    session_maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    async with session_maker() as session:
        session.add(
            User(
                full_name="Test Admin",
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                must_change_password=False,
            )
        )
        await session.commit()

    async def _get_db():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as c:
        yield c
    app.dependency_overrides.clear()


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    r = await client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def admin_headers(client) -> dict[str, str]:
    token = await get_token(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    return auth(token)
