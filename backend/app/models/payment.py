"""Оплаты от клиентов."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PaymentMethod
from app.models.base import (
    MONEY,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDMixin,
    str_enum,
)

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.order import Order
    from app.models.user import User


class Payment(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_payment_date", "payment_date"),)

    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"), index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"), index=True)
    payment_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    payment_method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod))
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

    client: Mapped[Client] = relationship(back_populates="payments")
    order: Mapped[Order | None] = relationship(back_populates="payments")
    creator: Mapped[User] = relationship(foreign_keys=[created_by])
