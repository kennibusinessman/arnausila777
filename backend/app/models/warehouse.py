"""Склады."""
from __future__ import annotations

from sqlalchemy import Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import WarehouseType
from app.models.base import Base, TimestampMixin, UUIDMixin, str_enum


class Warehouse(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "warehouses"

    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[WarehouseType] = mapped_column(str_enum(WarehouseType))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
