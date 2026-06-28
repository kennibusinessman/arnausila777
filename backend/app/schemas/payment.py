"""Схемы оплат от клиентов."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import PaymentMethod


class PaymentCreate(BaseModel):
    client_id: uuid.UUID
    order_id: uuid.UUID | None = None
    payment_date: date
    amount: Decimal = Field(gt=0)
    payment_method: PaymentMethod
    comment: str | None = None


class PaymentUpdate(BaseModel):
    order_id: uuid.UUID | None = None
    payment_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    payment_method: PaymentMethod | None = None
    comment: str | None = None


# --- Краткие представления для ответа ---

class _ClientBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    company_name: str | None


class _OrderBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_id: uuid.UUID
    order_id: uuid.UUID | None
    payment_date: date
    amount: Decimal
    payment_method: PaymentMethod
    comment: str | None
    created_by: uuid.UUID
    created_at: datetime
    client: _ClientBrief | None = None
    order: _OrderBrief | None = None


class PaymentSummary(BaseModel):
    """Агрегаты по тем же фильтрам, что и список — для KPI-карточек периода."""

    count: int
    total_amount: Decimal
    average: Decimal
    client_count: int
