"""Системные настройки приложения — единственная строка (синглтон, id = 1).

Пока хранит только экономику: цену сырья (полипропилен) за кг. Из неё считается
себестоимость и чистая прибыль заказа по правилу «1 кг сырья = 1 кг продукции»
(см. frontend/lib/utils/orderEconomics.ts).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Integer, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import MONEY, Base, TimestampMixin


class Settings(TimestampMixin, Base):
    __tablename__ = "settings"

    # Синглтон: всегда одна строка с id = 1 (см. services/settings_service.py).
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    raw_price_per_kg: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("750"), server_default=text("750")
    )
