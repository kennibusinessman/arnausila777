"""Отгрузки клиентам и их позиции."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    MONEY,
    QUANTITY,
    Base,
    CreatedAtMixin,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDMixin,
)

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.order import Order
    from app.models.product import Product
    from app.models.user import User
    from app.models.warehouse import Warehouse


class Shipment(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "shipments"
    __table_args__ = (Index("ix_shipments_shipment_date", "shipment_date"),)

    shipment_number: Mapped[str] = mapped_column(String(100), unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"), index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"))
    shipment_date: Mapped[date] = mapped_column(Date)
    total_amount: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default=text("0"))
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

    order: Mapped[Order] = relationship(back_populates="shipments")
    client: Mapped[Client] = relationship(back_populates="shipments")
    warehouse: Mapped[Warehouse] = relationship()
    creator: Mapped[User] = relationship(foreign_keys=[created_by])
    items: Mapped[list[ShipmentItem]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan"
    )


class ShipmentItem(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "shipment_items"

    shipment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shipments.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[Decimal] = mapped_column(QUANTITY)
    unit_price: Mapped[Decimal] = mapped_column(MONEY)
    total_price: Mapped[Decimal] = mapped_column(MONEY)

    shipment: Mapped[Shipment] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()
