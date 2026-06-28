"""Клиенты."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.payment import Payment
    from app.models.shipment import Shipment
    from app.models.user import User


class Client(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "clients"

    name: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)

    manager: Mapped[User | None] = relationship(
        back_populates="clients", foreign_keys=[manager_id]
    )
    orders: Mapped[list[Order]] = relationship(
        back_populates="client", foreign_keys="Order.client_id"
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="client")
    shipments: Mapped[list[Shipment]] = relationship(back_populates="client")
