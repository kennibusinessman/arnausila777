"""Аутентификация: вход, обновление токенов, смена пароля."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import (
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import TokenResponse


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    user = (
        await session.execute(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()

    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Неверный email или пароль")
    if not user.is_active:
        raise ForbiddenError("Учётная запись отключена")

    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    return user


async def issue_tokens(session: AsyncSession, user: User) -> TokenResponse:
    access = create_access_token(user.id, user.role.value)
    refresh = create_refresh_token(user.id)
    payload = decode_token(refresh)

    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        )
    )
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


async def _get_valid_refresh_row(
    session: AsyncSession, refresh_token: str
) -> RefreshToken:
    row = (
        await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
        )
    ).scalar_one_or_none()
    if (
        row is None
        or row.revoked_at is not None
        or row.expires_at < datetime.now(timezone.utc)
    ):
        raise UnauthorizedError("Refresh-токен недействителен или отозван")
    return row


async def refresh_tokens(session: AsyncSession, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise UnauthorizedError("Недействительный refresh-токен")

    if payload.get("type") != "refresh":
        raise UnauthorizedError("Ожидался refresh-токен")

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise UnauthorizedError("Недействительный refresh-токен")

    row = await _get_valid_refresh_row(session, refresh_token)

    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        raise UnauthorizedError("Пользователь недоступен")

    row.revoked_at = datetime.now(timezone.utc)  # ротация: старый refresh больше не годен
    return await issue_tokens(session, user)


async def revoke_refresh_token(session: AsyncSession, refresh_token: str) -> None:
    row = (
        await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
        )
    ).scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        await session.commit()


async def change_password(
    session: AsyncSession, user: User, old_password: str, new_password: str
) -> None:
    if not verify_password(old_password, user.password_hash):
        raise UnauthorizedError("Текущий пароль неверен")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    await session.commit()
