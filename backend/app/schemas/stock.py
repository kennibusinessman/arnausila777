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


class MovementSourceRef(BaseModel):
    """Ссылка на документ-источник движения для перехода из истории склада.
    kind — какая это страница (order/shift_report/expense), id — её идентификатор.
    Для отгрузок (SHIPMENT) kind=order и id — заказ, к которому относится отгрузка."""

    kind: str
    id: uuid.UUID


class StockMovementHistoryRead(StockMovementRead):
    """Строка истории движений одной позиции: то же, что StockMovementRead, плюс имя
    автора движения, остаток после его проведения (нарастающим итогом по всем
    складам — так же, как позиция агрегируется в списке остатков) и ссылка на
    документ-источник (для перехода в заказ/смену/расход)."""

    created_by_name: str | None = None
    balance_after: Decimal
    source_ref: MovementSourceRef | None = None


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


class InventoryItemRead(BaseModel):
    """Позиция на странице «Инвентаризация»: товар или сырьё с остатком, суммарным
    по всем складам (так же, как позиция агрегируется в «Остатках»). Позиции без
    движений тоже есть — с нулём, чтобы им можно было задать начальный остаток."""

    item_type: ItemType
    item_id: uuid.UUID
    name: str
    category: str | None
    subcategory: str | None
    unit: str
    is_active: bool
    quantity: Decimal


class InventoryLine(BaseModel):
    item_type: ItemType
    item_id: uuid.UUID
    # Фактическое количество — каким остаток должен стать после проведения.
    quantity: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    # Остаток, который пользователь видел, когда вводил новое значение. Если он с тех
    # пор изменился (продажа, утверждённая смена), проводить вслепую нельзя — 409.
    expected_quantity: Decimal | None = None


class InventoryApply(BaseModel):
    items: list[InventoryLine] = Field(min_length=1, max_length=1000)
    comment: str | None = Field(default=None, max_length=500)


class InventoryChange(BaseModel):
    item_type: ItemType
    item_id: uuid.UUID
    name: str
    unit: str
    before: Decimal
    after: Decimal


class InventoryResult(BaseModel):
    """Итог инвентаризации: какие позиции изменились и сколько движений проведено
    (излишек — один приход, недостача — расход, иногда с нескольких складов)."""

    changes: list[InventoryChange]
    movements_created: int
