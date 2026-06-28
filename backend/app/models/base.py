"""Общие миксины, типы и хелперы для ORM-моделей."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import TypeVar

from sqlalchemy import DateTime, Enum as SAEnum, Numeric, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "CreatedAtMixin",
    "SoftDeleteMixin",
    "str_enum",
    "MONEY",
    "QUANTITY",
]

_E = TypeVar("_E", bound=Enum)

# Денежный тип NUMERIC(14, 2) и количество NUMERIC(14, 3).
# Константы-типы безопасно переиспользуются между колонками и не затеняются
# одноимёнными атрибутами (например, колонкой `quantity`).
MONEY = Numeric(14, 2)
QUANTITY = Numeric(14, 3)


def str_enum(enum_cls: type[_E]) -> SAEnum:
    """VARCHAR(50)-колонка, хранящая `.value` перечисления (без native PG enum)."""
    return SAEnum(
        enum_cls,
        native_enum=False,
        length=50,
        validate_strings=True,
        values_callable=lambda e: [member.value for member in e],
    )


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedAtMixin:
    """Для журнальных/дочерних таблиц, у которых по ТЗ только created_at."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
