"""Создаёт первого SUPER_ADMIN из настроек. Идемпотентно.

Запуск: python -m scripts.create_superadmin
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.enums import UserRole
from app.core.security import hash_password
from app.models import User


async def main() -> None:
    async with async_session_maker() as session:
        existing = (
            await session.execute(
                select(User).where(User.email == settings.SUPERADMIN_EMAIL)
            )
        ).scalar_one_or_none()

        if existing is not None:
            print(f"[create_superadmin] Уже существует: {settings.SUPERADMIN_EMAIL}")
            return

        session.add(
            User(
                full_name=settings.SUPERADMIN_NAME,
                email=settings.SUPERADMIN_EMAIL,
                password_hash=hash_password(settings.SUPERADMIN_PASSWORD),
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                must_change_password=False,
            )
        )
        await session.commit()
        print(f"[create_superadmin] Создан SUPER_ADMIN: {settings.SUPERADMIN_EMAIL}")


if __name__ == "__main__":
    asyncio.run(main())
