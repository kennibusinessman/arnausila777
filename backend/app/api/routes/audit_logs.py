"""Журнал аудита: /api/audit-logs (только чтение, SA, B)."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.audit import AuditLogRead
from app.schemas.common import Message, Page
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
# Удаление записи аудита — расширенное право, только супер-админ.
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("", response_model=Page[AuditLogRead])
async def list_audit_logs(
    actor: Admin,
    db: DbSession,
    params: Pagination,
    user_id: Annotated[uuid.UUID | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    entity_type: Annotated[str | None, Query()] = None,
    entity_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> Page[AuditLogRead]:
    logs, names, total = await audit_service.list_logs(
        db, params,
        user_id=user_id, action=action, entity_type=entity_type,
        entity_id=entity_id, date_from=date_from, date_to=date_to,
    )
    items = [
        AuditLogRead(
            id=log.id, user_id=log.user_id, user_name=names.get(log.user_id),
            action=log.action, entity_type=log.entity_type, entity_id=log.entity_id,
            old_value=log.old_value, new_value=log.new_value, created_at=log.created_at,
        )
        for log in logs
    ]
    return Page[AuditLogRead](items=items, total=total, page=params.page, size=params.size)


@router.delete("/{log_id}", response_model=Message)
async def delete_audit_log(log_id: uuid.UUID, actor: SuperAdminUser, db: DbSession) -> Message:
    await audit_service.delete_log(db, log_id)
    # Само удаление записи аудита тоже логируется — иначе теряется любой след действия.
    await audit_service.log(
        db, user_id=actor.id, action="DELETE_AUDIT_LOG", entity_type="AuditLog", entity_id=log_id
    )
    await db.commit()
    return Message(detail="Запись аудита удалена")
