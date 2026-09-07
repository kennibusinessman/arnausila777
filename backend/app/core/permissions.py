"""Контроль доступа: по ролям и по правам."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.api.deps import get_current_active_user
from app.core.access import Permission
from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError
from app.models import User


def require_roles(*allowed: UserRole):
    """Фабрика зависимости: пропускает только пользователей с разрешённой ролью.

    Остаётся для проверок, завязанных именно на роль («свои» отчёты мастера
    смены), — всё остальное закрывается правами, см. `require_permissions`.
    """

    async def checker(
        user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if user.role not in allowed:
            raise ForbiddenError("Недостаточно прав для этого действия")
        return user

    return checker


def require_permissions(*allowed: Permission):
    """Фабрика зависимости: достаточно любого из перечисленных прав.

    Право берётся из итогового набора пользователя: права роли плюс/минус
    индивидуальные настройки (см. `app.core.access`). Набор читается из БД на
    каждый запрос вместе с самим пользователем, поэтому снятое право действует
    сразу, без перевыпуска токена.
    """

    async def checker(
        user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if not user.effective_permissions & set(allowed):
            raise ForbiddenError("Недостаточно прав для этого действия")
        return user

    return checker
