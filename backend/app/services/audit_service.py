"""Запись действий пользователей в audit_logs.

Добавляет запись в текущую сессию (без commit) — фиксируется вместе с основной
транзакцией вызывающего сервиса.
"""
from __future__ import annotations

import json
import uuid
from datetime import date
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models import AuditLog, User
from app.schemas.common import PageParams


def _jsonify(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Приводит словарь к JSON-безопасному виду (Decimal/date/UUID/enum → str)."""
    if value is None:
        return None
    return json.loads(json.dumps(value, default=str))


async def log(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    old: dict[str, Any] | None = None,
    new: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=_jsonify(old),
            new_value=_jsonify(new),
        )
    )


async def list_logs(
    session: AsyncSession,
    params: PageParams,
    *,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[AuditLog], dict[uuid.UUID, str], int]:
    """Возвращает страницу логов, карту id→ФИО пользователей и общее число."""
    conditions: list[ColumnElement[bool]] = []
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if action is not None:
        conditions.append(AuditLog.action == action)
    if entity_type is not None:
        conditions.append(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        conditions.append(AuditLog.entity_id == entity_id)
    if date_from is not None:
        conditions.append(func.date(AuditLog.created_at) >= date_from)
    if date_to is not None:
        conditions.append(func.date(AuditLog.created_at) <= date_to)

    total = (
        await session.execute(select(func.count()).select_from(AuditLog).where(*conditions))
    ).scalar_one()
    logs = (
        await session.execute(
            select(AuditLog)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()

    user_ids = {log.user_id for log in logs}
    names: dict[uuid.UUID, str] = {}
    if user_ids:
        names = dict(
            (
                await session.execute(
                    select(User.id, User.full_name).where(User.id.in_(user_ids))
                )
            ).all()
        )
    return list(logs), names, total


async def delete_log(session: AsyncSession, log_id: uuid.UUID) -> None:
    """Жёсткое удаление записи аудита — только для супер-админа, само действие тоже логируется."""
    row = await session.get(AuditLog, log_id)
    if row is None:
        raise NotFoundError("Запись аудита не найдена")
    await session.delete(row)
