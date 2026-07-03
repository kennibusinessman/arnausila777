"""Схемы расходов и категорий расходов.

Расход — запись по факту, без согласования: `name` — короткое описание
(«Аренда производственного цеха»), `responsible_id` — кто отвечает за статью
(необязательно, по умолчанию — автор записи).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ExpenseCategoryType


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ExpenseCategoryType
    is_active: bool = True


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ExpenseCategoryType | None = None
    is_active: bool | None = None


class ExpenseCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: ExpenseCategoryType
    is_active: bool
    created_at: datetime


# --- Расходы ---

class ExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    expense_date: date
    category_id: uuid.UUID
    amount: Decimal = Field(gt=0)
    responsible_id: uuid.UUID | None = None
    comment: str | None = None


class ExpenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    expense_date: date | None = None
    category_id: uuid.UUID | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    responsible_id: uuid.UUID | None = None
    comment: str | None = None


# --- Краткие представления для ответа ---

class _UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


class _CategoryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: ExpenseCategoryType


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    expense_date: date
    category_id: uuid.UUID
    amount: Decimal
    comment: str | None
    created_by: uuid.UUID
    responsible_id: uuid.UUID | None
    order_id: uuid.UUID | None = None
    created_at: datetime
    category: _CategoryBrief | None = None
    creator: _UserBrief | None = None
    responsible: _UserBrief | None = None


class ExpenseListItem(BaseModel):
    """Облегчённое представление для списка."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    expense_date: date
    category_id: uuid.UUID
    amount: Decimal
    comment: str | None
    order_id: uuid.UUID | None = None
    created_at: datetime
    category: _CategoryBrief | None = None
    responsible: _UserBrief | None = None


class ExpenseSummary(BaseModel):
    """Агрегаты по тем же фильтрам, что и список — для KPI-карточек периода."""

    count: int
    total_amount: Decimal
    category_count: int
