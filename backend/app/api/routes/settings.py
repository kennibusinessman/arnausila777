"""Системные настройки: /api/settings.

GET — любой авторизованный (фронту нужна цена сырья, чтобы считать прибыль по
заказам); изменение — только SA/руководитель.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.core.enums import UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]


@router.get("", response_model=SettingsRead)
async def read_settings(actor: CurrentUser, db: DbSession) -> SettingsRead:
    obj = await settings_service.get_settings(db)
    return SettingsRead.model_validate(obj)


@router.put("", response_model=SettingsRead)
async def update_settings(data: SettingsUpdate, actor: Admin, db: DbSession) -> SettingsRead:
    obj = await settings_service.get_settings(db)
    obj.raw_price_per_kg = data.raw_price_per_kg
    await db.commit()
    await db.refresh(obj)
    return SettingsRead.model_validate(obj)
