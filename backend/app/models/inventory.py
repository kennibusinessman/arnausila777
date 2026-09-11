"""Инвентаризация: документ (одно нажатие «Провести») и его строки «было → стало»."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ItemType
from app.models.base import QUANTITY, Base, CreatedAtMixin, UUIDMixin, str_enum

if TYPE_CHECKING:
    from app.models.user import User

_ITEM_XOR = (
    "(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR "
    "(item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)"
)


class Inventory(UUIDMixin, CreatedAtMixin, Base):
    """Одна проведённая инвентаризация. Движения склада, которые она создала,
    ссылаются на неё: source_type=INVENTORY, source_id=id."""

    __tablename__ = "inventories"
    __table_args__ = (Index("ix_inventories_created_at", "created_at"),)

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    comment: Mapped[str | None] = mapped_column(Text)

    creator: Mapped[User] = relationship()
    lines: Mapped[list[InventoryLine]] = relationship(
        back_populates="inventory", cascade="all, delete-orphan"
    )


class InventoryLine(UUIDMixin, Base):
    """Изменённая позиция: остаток до и после. Название и единица — снимок на
    момент проведения, чтобы история не менялась, если товар потом переименуют
    или удалят."""

    __tablename__ = "inventory_lines"
    __table_args__ = (
        CheckConstraint(_ITEM_XOR, name="ck_inventory_lines_item_xor"),
        Index("ix_inventory_lines_inventory", "inventory_id"),
    )

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("inventories.id", ondelete="CASCADE")
    )
    item_type: Mapped[ItemType] = mapped_column(str_enum(ItemType))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    material_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("materials.id"))
    name: Mapped[str] = mapped_column(String(255))
    unit: Mapped[str] = mapped_column(String(50))
    quantity_before: Mapped[Decimal] = mapped_column(QUANTITY)
    quantity_after: Mapped[Decimal] = mapped_column(QUANTITY)

    inventory: Mapped[Inventory] = relationship(back_populates="lines")
