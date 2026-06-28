"""Контроль доступа по ролям."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.api.deps import get_current_active_user
from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError
from app.models import User


def require_roles(*allowed: UserRole):
    """Фабрика зависимости: пропускает только пользователей с разрешённой ролью."""

    async def checker(
        user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if user.role not in allowed:
            raise ForbiddenError("Недостаточно прав для этого действия")
        return user

    return checker
