"""Готовая продукция."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import MONEY, QUANTITY, Base, SoftDeleteMixin, TimestampMixin, UUIDMixin


class Product(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(255), index=True)
    sku: Mapped[str | None] = mapped_column(String(100), unique=True)
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    # Подкатегория внутри category — сейчас используется только для category="Спанбонд"
    # (Спанбонд/Бабины/Дастархан сырье — разные формы выпуска одной линии).
    subcategory: Mapped[str | None] = mapped_column(String(100), index=True)
    unit: Mapped[str] = mapped_column(String(50))
    default_price: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default=text("0"))
    # Вес одной единицы (кг за шт/рулон) — для автоматического расчёта общего веса в отгрузке.
    base_weight: Mapped[Decimal | None] = mapped_column(QUANTITY)
    # Порог низкого остатка: если остаток ≤ min_stock (и min_stock > 0) — статус «Заканчивается».
    min_stock: Mapped[Decimal] = mapped_column(QUANTITY, default=0, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
