"""Маршруты управления пользователями: /api/users."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession, Pagination
from app.core.access import Permission
from app.core.permissions import require_permissions
from app.models import User
from app.schemas.common import Message, Page
from app.schemas.user import (
    PermissionCatalog,
    UserCreate,
    UserPermissionsUpdate,
    UserRead,
    UserRoleUpdate,
    UserUpdate,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])

Viewer = Annotated[User, Depends(require_permissions(Permission.USERS_VIEW))]
Manager = Annotated[User, Depends(require_permissions(Permission.USERS_MANAGE))]
Remover = Annotated[User, Depends(require_permissions(Permission.USERS_DELETE))]
# Индивидуальные права раздаёт супер-админ (по умолчанию только у него это право).
AccessManager = Annotated[User, Depends(require_permissions(Permission.USERS_PERMISSIONS))]


@router.get("", response_model=Page[UserRead])
async def list_users(
    actor: Viewer,
    db: DbSession,
    params: Pagination,
    search: Annotated[str | None, Query()] = None,
) -> Page[UserRead]:
    items, total = await user_service.list_users(db, params, search)
    return Page[UserRead](
        items=[UserRead.model_validate(u) for u in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/permissions/catalog", response_model=PermissionCatalog)
async def permissions_catalog(actor: CurrentUser) -> PermissionCatalog:
    """Справочник прав с подписями и наборами ролей по умолчанию."""
    return PermissionCatalog.build()


@router.post("", response_model=UserRead, status_code=201)
async def create_user(data: UserCreate, actor: Manager, db: DbSession) -> UserRead:
    user = await user_service.create_user(db, actor, data)
    return UserRead.model_validate(user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: uuid.UUID, actor: Viewer, db: DbSession) -> UserRead:
    user = await user_service.get_user(db, user_id)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID, data: UserUpdate, actor: Manager, db: DbSession
) -> UserRead:
    user = await user_service.update_user(db, actor, user_id, data)
    return UserRead.model_validate(user)


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_user_role(
    user_id: uuid.UUID, data: UserRoleUpdate, actor: Manager, db: DbSession
) -> UserRead:
    user = await user_service.update_role(db, actor, user_id, data)
    return UserRead.model_validate(user)


@router.patch("/{user_id}/permissions", response_model=UserRead)
async def update_user_permissions(
    user_id: uuid.UUID, data: UserPermissionsUpdate, actor: AccessManager, db: DbSession
) -> UserRead:
    user = await user_service.update_permissions(db, actor, user_id, data)
    return UserRead.model_validate(user)


@router.delete("/{user_id}", response_model=Message)
async def delete_user(user_id: uuid.UUID, actor: Remover, db: DbSession) -> Message:
    await user_service.deactivate_user(db, actor, user_id)
    return Message(detail="Пользователь деактивирован")
