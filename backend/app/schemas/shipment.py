"""Схемы отгрузок (только чтение — создаются и отменяются вместе с заказом).

Отгрузка — факт продажи: создаётся атомарно вместе с заказом (см.
order_service.create_order) и сразу списывает остаток. Отдельного API для
создания/подтверждения/отмены отгрузки нет — это часть заказа.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class _ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None
    unit: str


class _ClientBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    company_name: str | None


class _OrderBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str


class _WarehouseBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ShipmentItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: Decimal
    unit_price: Decimal
    total_price: Decimal
    product: _ProductBrief | None = None


class ShipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shipment_number: str
    order_id: uuid.UUID
    client_id: uuid.UUID
    warehouse_id: uuid.UUID
    shipment_date: date
    total_amount: Decimal
    comment: str | None
    created_at: datetime
    order: _OrderBrief | None = None
    client: _ClientBrief | None = None
    warehouse: _WarehouseBrief | None = None
    items: list[ShipmentItemRead] = []


class ShipmentListItem(BaseModel):
    """Облегчённое представление для списка (без позиций)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shipment_number: str
    order_id: uuid.UUID
    client_id: uuid.UUID
    shipment_date: date
    total_amount: Decimal
    created_at: datetime
    order: _OrderBrief | None = None
    client: _ClientBrief | None = None
