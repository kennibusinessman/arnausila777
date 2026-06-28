"""Схемы клиентов."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    company_name: str | None = Field(default=None, max_length=255)
    address: str | None = None
    comment: str | None = None
    # Назначение менеджера доступно только SA/B; для SaM выставляется автоматически.
    manager_id: uuid.UUID | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    company_name: str | None = Field(default=None, max_length=255)
    address: str | None = None
    comment: str | None = None
    manager_id: uuid.UUID | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None
    email: EmailStr | None
    company_name: str | None
    address: str | None
    comment: str | None
    manager_id: uuid.UUID | None
    created_at: datetime


class ClientStats(BaseModel):
    """Сводная статистика по клиенту: отгрузки, оплаты, текущий долг (за всё время)."""

    client: ClientRead
    total_shipped: Decimal
    total_paid: Decimal
    debt: Decimal
    order_count: int
    shipment_count: int
    payment_count: int
    avg_payment: Decimal
    first_payment_date: date | None
    last_payment_date: date | None
    first_shipment_date: date | None
    last_shipment_date: date | None


class ClientOverviewRow(BaseModel):
    """Клиент + агрегаты для таблицы /clients (сделки, оборот, долг, активность).

    `status` выводится из реальных данных (поля в модели нет):
      active   — есть заказы;
      lead     — заказов нет, создан недавно (≤90 дней);
      inactive — заказов нет и создан давно (>90 дней).
    """

    client: ClientRead
    order_count: int
    total_shipped: Decimal
    total_paid: Decimal
    debt: Decimal
    last_activity: date | None
    status: str


class ClientOverviewResponse(BaseModel):
    rows: list[ClientOverviewRow]
