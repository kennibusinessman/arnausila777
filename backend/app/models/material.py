"""Сырьё и расходники."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import QUANTITY, Base, SoftDeleteMixin, TimestampMixin, UUIDMixin


class Material(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "materials"

    name: Mapped[str] = mapped_column(String(255), index=True)
    sku: Mapped[str | None] = mapped_column(String(100), unique=True)
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    unit: Mapped[str] = mapped_column(String(50))
    # Порог низкого остатка: если остаток ≤ min_stock (и min_stock > 0) — статус «Заканчивается».
    min_stock: Mapped[Decimal] = mapped_column(QUANTITY, default=0, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
