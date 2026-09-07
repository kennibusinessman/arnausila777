"""Схемы пользователей."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator

from app.core.access import (
    PERMISSION_GROUPS,
    PERMISSION_LABELS,
    Permission,
    ROLE_PERMISSIONS,
    normalize_overrides,
    resolve_permissions,
    sort_permissions,
)
from app.core.enums import UserRole


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr
    role: UserRole
    temp_password: str = Field(min_length=8, max_length=72)
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None


class UserRoleUpdate(BaseModel):
    role: UserRole


class UserPermissionsUpdate(BaseModel):
    """Полная замена индивидуальных прав.

    Ключ — право из каталога, значение — выдать (`true`) или отобрать (`false`)
    его относительно набора роли. Пустой словарь возвращает пользователя к
    «правам как у роли».
    """

    permissions: dict[Permission, bool]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str | None
    email: EmailStr
    role: UserRole
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    # Только отклонения от роли — их и правит супер-админ.
    permissions: dict[Permission, bool] = Field(default_factory=dict)

    @field_validator("permissions", mode="before")
    @classmethod
    def _drop_unknown(cls, value: object) -> dict[str, bool]:
        # Право могли убрать из каталога — запись в БД тогда молча игнорируется,
        # иначе выдача пользователя падала бы с ошибкой валидации.
        return normalize_overrides(value if isinstance(value, dict) else None)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def effective_permissions(self) -> list[Permission]:
        """Итоговый набор прав — на него опирается интерфейс."""
        return sort_permissions(resolve_permissions(self.role, self.permissions))


class PermissionItem(BaseModel):
    key: Permission
    label: str


class PermissionGroup(BaseModel):
    group: str
    items: list[PermissionItem]


class PermissionCatalog(BaseModel):
    """Каталог прав + права ролей по умолчанию (для подписи «как у роли»)."""

    groups: list[PermissionGroup]
    role_defaults: dict[UserRole, list[Permission]]

    @classmethod
    def build(cls) -> PermissionCatalog:
        return cls(
            groups=[
                PermissionGroup(
                    group=name,
                    items=[
                        PermissionItem(key=perm, label=PERMISSION_LABELS[perm])
                        for perm in perms
                    ],
                )
                for name, perms in PERMISSION_GROUPS
            ],
            role_defaults={
                role: sort_permissions(perms) for role, perms in ROLE_PERMISSIONS.items()
            },
        )
