"""Заказы клиентов и позиции заказов."""
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
    SoftDeleteMixin,
    TimestampMixin,
    UUIDMixin,
)

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.payment import Payment
    from app.models.product import Product
    from app.models.shipment import Shipment
    from app.models.user import User


class Order(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_deadline", "deadline"),)

    order_number: Mapped[str] = mapped_column(String(100), unique=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"), index=True)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    deadline: Mapped[date | None] = mapped_column(Date)
    comment: Mapped[str | None] = mapped_column(Text)
    total_amount: Mapped[Decimal] = mapped_column(MONEY, default=0, server_default=text("0"))

    client: Mapped[Client] = relationship(back_populates="orders", foreign_keys=[client_id])
    manager: Mapped[User | None] = relationship(foreign_keys=[manager_id])
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    shipments: Mapped[list[Shipment]] = relationship(back_populates="order")
    payments: Mapped[list[Payment]] = relationship(back_populates="order")


class OrderItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(QUANTITY)
    unit_price: Mapped[Decimal] = mapped_column(MONEY)
    total_price: Mapped[Decimal] = mapped_column(MONEY)
    comment: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()
