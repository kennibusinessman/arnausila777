"""Схемы склада: остатки, движения, ручная корректировка."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ItemType, MovementType, SourceType


class AdjustmentDirection(str, Enum):
    IN = "IN"
    OUT = "OUT"


class StockBalanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    item_type: ItemType
    product_id: uuid.UUID | None
    material_id: uuid.UUID | None
    quantity: Decimal
    updated_at: datetime


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    item_type: ItemType
    product_id: uuid.UUID | None
    material_id: uuid.UUID | None
    movement_type: MovementType
    quantity: Decimal
    unit: str
    unit_cost: Decimal | None
    total_cost: Decimal | None
    source_type: SourceType
    source_id: uuid.UUID | None
    comment: str | None
    created_by: uuid.UUID
    created_at: datetime


class AdjustmentCreate(BaseModel):
    warehouse_id: uuid.UUID
    item_type: ItemType
    product_id: uuid.UUID | None = None
    material_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0)
    direction: AdjustmentDirection
    unit: str = Field(min_length=1, max_length=50)
    unit_cost: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None

    @model_validator(mode="after")
    def _check_item(self) -> "AdjustmentCreate":
        if self.item_type is ItemType.PRODUCT and (self.product_id is None or self.material_id is not None):
            raise ValueError("Для item_type=PRODUCT укажите только product_id")
        if self.item_type is ItemType.MATERIAL and (self.material_id is None or self.product_id is not None):
            raise ValueError("Для item_type=MATERIAL укажите только material_id")
        return self
