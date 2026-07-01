"""Доступ к системным настройкам (синглтон-строка id = 1)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import Settings

SETTINGS_ID = 1


async def get_settings(db: AsyncSession) -> Settings:
    """Строка настроек; создаётся со значениями по умолчанию при первом обращении."""
    obj = await db.get(Settings, SETTINGS_ID)
    if obj is None:
        obj = Settings(id=SETTINGS_ID)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
    return obj
