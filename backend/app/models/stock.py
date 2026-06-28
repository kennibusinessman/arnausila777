"""Складские движения (журнал) и кэш остатков."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ItemType, MovementType, SourceType
from app.models.base import (
    MONEY,
    QUANTITY,
    Base,
    CreatedAtMixin,
    UUIDMixin,
    str_enum,
)

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.product import Product
    from app.models.user import User
    from app.models.warehouse import Warehouse

# XOR product/material в зависимости от item_type (главное правило склада из ТЗ).
_ITEM_XOR = (
    "(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR "
    "(item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)"
)


class StockMovement(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint(_ITEM_XOR, name="ck_stock_movements_item_xor"),
        Index("ix_stock_movements_wh_item", "warehouse_id", "item_type"),
        Index("ix_stock_movements_product", "product_id"),
        Index("ix_stock_movements_material", "material_id"),
        Index("ix_stock_movements_type", "movement_type"),
        Index("ix_stock_movements_source", "source_type", "source_id"),
        Index("ix_stock_movements_created_at", "created_at"),
    )

    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"))
    item_type: Mapped[ItemType] = mapped_column(str_enum(ItemType))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    material_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("materials.id"))
    movement_type: Mapped[MovementType] = mapped_column(str_enum(MovementType))
    quantity: Mapped[Decimal] = mapped_column(QUANTITY)
    unit: Mapped[str] = mapped_column(String(50))
    unit_cost: Mapped[Decimal | None] = mapped_column(MONEY)
    total_cost: Mapped[Decimal | None] = mapped_column(MONEY)
    source_type: Mapped[SourceType] = mapped_column(str_enum(SourceType))
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

    warehouse: Mapped[Warehouse] = relationship()
    product: Mapped[Product | None] = relationship()
    material: Mapped[Material | None] = relationship()
    creator: Mapped[User] = relationship()


class StockBalance(UUIDMixin, Base):
    __tablename__ = "stock_balances"
    __table_args__ = (
        CheckConstraint(_ITEM_XOR, name="ck_stock_balances_item_xor"),
        UniqueConstraint(
            "warehouse_id",
            "item_type",
            "product_id",
            "material_id",
            name="uq_stock_balances_item",
        ),
    )

    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"))
    item_type: Mapped[ItemType] = mapped_column(str_enum(ItemType))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"))
    material_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("materials.id"))
    quantity: Mapped[Decimal] = mapped_column(QUANTITY, default=0, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    warehouse: Mapped[Warehouse] = relationship()
    product: Mapped[Product | None] = relationship()
    material: Mapped[Material | None] = relationship()
