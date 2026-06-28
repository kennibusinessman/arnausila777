"""Управление пользователями (создание, роли, деактивация).

Правила §15: BOSS не может создавать/менять/удалять SUPER_ADMIN; супер-админа нельзя
удалить обычным способом; вместо удаления — soft delete + деактивация.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.models import User
from app.schemas.common import PageParams
from app.schemas.user import UserCreate, UserRoleUpdate, UserUpdate
from app.services import audit_service


async def _get_or_404(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("Пользователь не найден")
    return user


def _ensure_can_touch_role(actor: User, target_role: UserRole) -> None:
    """BOSS не имеет права работать с SUPER_ADMIN."""
    if actor.role is UserRole.BOSS and target_role is UserRole.SUPER_ADMIN:
        raise ForbiddenError("BOSS не может управлять учётной записью SUPER_ADMIN")


async def list_users(
    session: AsyncSession, params: PageParams, search: str | None = None
) -> tuple[list[User], int]:
    conditions = [User.deleted_at.is_(None)]
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                User.phone.ilike(pattern),
            )
        )

    total = (
        await session.execute(select(func.count()).select_from(User).where(*conditions))
    ).scalar_one()

    items = (
        await session.execute(
            select(User)
            .where(*conditions)
            .order_by(User.created_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()

    return list(items), total


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    return await _get_or_404(session, user_id)


async def create_user(session: AsyncSession, actor: User, data: UserCreate) -> User:
    _ensure_can_touch_role(actor, data.role)

    exists = (
        await session.execute(select(User.id).where(User.email == data.email))
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("Пользователь с таким email уже существует")

    user = User(
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        password_hash=hash_password(data.temp_password),
        role=data.role,
        is_active=data.is_active,
        must_change_password=True,
        created_by=actor.id,
    )
    session.add(user)
    await session.flush()
    await audit_service.log(
        session,
        user_id=actor.id,
        action="CREATE_USER",
        entity_type="User",
        entity_id=user.id,
        new={"email": data.email, "role": data.role.value},
    )
    await session.commit()
    await session.refresh(user)
    return user


async def update_user(
    session: AsyncSession, actor: User, user_id: uuid.UUID, data: UserUpdate
) -> User:
    user = await _get_or_404(session, user_id)
    _ensure_can_touch_role(actor, user.role)

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(user, field, value)

    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_USER",
        entity_type="User",
        entity_id=user.id,
        new=payload,
    )
    await session.commit()
    await session.refresh(user)
    return user


async def update_role(
    session: AsyncSession, actor: User, user_id: uuid.UUID, data: UserRoleUpdate
) -> User:
    user = await _get_or_404(session, user_id)
    # Нельзя трогать существующего SUPER_ADMIN и нельзя назначать роль SUPER_ADMIN
    # пользователем BOSS.
    _ensure_can_touch_role(actor, user.role)
    _ensure_can_touch_role(actor, data.role)

    old_role = user.role
    user.role = data.role
    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_USER_ROLE",
        entity_type="User",
        entity_id=user.id,
        old={"role": old_role.value},
        new={"role": data.role.value},
    )
    await session.commit()
    await session.refresh(user)
    return user


async def deactivate_user(session: AsyncSession, actor: User, user_id: uuid.UUID) -> None:
    user = await _get_or_404(session, user_id)
    if user.role is UserRole.SUPER_ADMIN:
        raise ForbiddenError("SUPER_ADMIN нельзя удалить")
    if user.id == actor.id:
        raise ForbiddenError("Нельзя удалить собственную учётную запись")

    user.is_active = False
    user.deleted_at = datetime.now(timezone.utc)
    await audit_service.log(
        session,
        user_id=actor.id,
        action="DELETE_USER",
        entity_type="User",
        entity_id=user.id,
    )
    await session.commit()
