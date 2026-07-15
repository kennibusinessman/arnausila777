"""Активность пользователя в интерфейсе: /api/activity.

Любой авторизованный пользователь пишет СВОИ события (открытие раздела, нажатие
важной кнопки) в общий журнал аудита — «кто, когда и что открывал/нажимал».
Читают журнал по-прежнему только SA/B через /audit-logs.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, DbSession
from app.schemas.common import Message
from app.services import audit_service

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityRequest(BaseModel):
    kind: Literal["page", "button"]
    label: str = Field(min_length=1, max_length=120)


@router.post("", response_model=Message, status_code=201)
async def log_activity(data: ActivityRequest, user: CurrentUser, db: DbSession) -> Message:
    if data.kind == "page":
        action, entity_type, payload = "VIEW_PAGE", "Page", {"page": data.label}
    else:
        action, entity_type, payload = "CLICK_BUTTON", "Ui", {"button": data.label}
    await audit_service.log(
        db, user_id=user.id, action=action, entity_type=entity_type, new=payload
    )
    await db.commit()
    return Message(detail="ok")
