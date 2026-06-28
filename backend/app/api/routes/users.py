"""Маршруты управления пользователями: /api/users (SA, B)."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.common import Message, Page
from app.schemas.user import UserCreate, UserRead, UserRoleUpdate, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])

# Управление пользователями — только SUPER_ADMIN и BOSS.
AdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("", response_model=Page[UserRead])
async def list_users(
    actor: AdminUser,
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


@router.post("", response_model=UserRead, status_code=201)
async def create_user(data: UserCreate, actor: AdminUser, db: DbSession) -> UserRead:
    user = await user_service.create_user(db, actor, data)
    return UserRead.model_validate(user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: uuid.UUID, actor: AdminUser, db: DbSession) -> UserRead:
    user = await user_service.get_user(db, user_id)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID, data: UserUpdate, actor: AdminUser, db: DbSession
) -> UserRead:
    user = await user_service.update_user(db, actor, user_id, data)
    return UserRead.model_validate(user)


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_user_role(
    user_id: uuid.UUID, data: UserRoleUpdate, actor: AdminUser, db: DbSession
) -> UserRead:
    user = await user_service.update_role(db, actor, user_id, data)
    return UserRead.model_validate(user)


@router.delete("/{user_id}", response_model=Message)
async def delete_user(
    user_id: uuid.UUID, actor: SuperAdminUser, db: DbSession
) -> Message:
    await user_service.deactivate_user(db, actor, user_id)
    return Message(detail="Пользователь деактивирован")
