"""Зависимости FastAPI: текущий пользователь, пагинация."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import JWTError, decode_token
from app.models import User
from app.schemas.common import PageParams

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Требуется авторизация")

    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise UnauthorizedError("Недействительный токен")

    if payload.get("type") != "access":
        raise UnauthorizedError("Ожидался access-токен")

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise UnauthorizedError("Недействительный токен")

    # Роль/статус подтягиваются из БД на каждый запрос (правило безопасности §13).
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise UnauthorizedError("Пользователь недоступен")
    return user


async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_active:
        raise ForbiddenError("Учётная запись отключена")
    return user


def pagination(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PageParams:
    return PageParams(page=page, size=size)


CurrentUser = Annotated[User, Depends(get_current_active_user)]
Pagination = Annotated[PageParams, Depends(pagination)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
