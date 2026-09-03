"""Схемы отчётов (§4, §5.7): дебиторка, dashboard, P&L, производство, склад, тренды."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.core.enums import ExpenseCategoryType, ItemType, RevenueMode


# --- Дебиторка ---

class DebtRow(BaseModel):
    client_id: uuid.UUID
    client_name: str
    company_name: str | None = None
    manager_id: uuid.UUID | None = None
    total_shipped: Decimal
    total_paid: Decimal
    debt: Decimal
    last_shipment_date: date | None = None
    last_payment_date: date | None = None


class DebtsResponse(BaseModel):
    rows: list[DebtRow]
    total_debt: Decimal


# --- Dashboard / P&L ---

class DashboardResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    revenue_mode: RevenueMode
    gross_revenue: Decimal      # Σ подтверждённых отгрузок за период
    cash_revenue: Decimal       # Σ оплат за период
    revenue: Decimal            # выручка по выбранному режиму
    total_expenses: Decimal     # Σ утверждённых расходов за период
    net_profit: Decimal         # revenue − total_expenses
    accounts_receivable: Decimal  # текущая дебиторка (всё время)
    orders_count: int           # заказов создано за период
    shipments_count: int        # подтверждённых отгрузок за период
    payments_count: int         # оплат за период


class ExpenseByCategoryRow(BaseModel):
    category_id: uuid.UUID
    category_name: str
    type: ExpenseCategoryType
    total_amount: Decimal
    count: int


class PnLResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    revenue_mode: RevenueMode
    gross_revenue: Decimal
    cash_revenue: Decimal
    revenue: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    expenses_by_category: list[ExpenseByCategoryRow]


# --- Производство / Склад / Тренды ---

class ProductionRow(BaseModel):
    product_id: uuid.UUID
    product_name: str
    sku: str | None = None
    unit: str
    total_quantity: Decimal
    total_defect: Decimal


class StockReportRow(BaseModel):
    warehouse_id: uuid.UUID
    warehouse_name: str
    item_type: ItemType
    item_id: uuid.UUID
    item_name: str
    sku: str | None = None
    unit: str
    quantity: Decimal


class RevenueExpenseTrendPoint(BaseModel):
    period: str          # 'YYYY-MM'
    revenue: Decimal
    expenses: Decimal


# --- Топ товаров / Движение склада ---

class SalesByProductRow(BaseModel):
    product_id: uuid.UUID
    product_name: str
    sku: str | None = None
    unit: str
    total_quantity: Decimal      # Σ отгруженного количества за период
    total_revenue: Decimal       # Σ суммы позиций (total_price)
    avg_price: Decimal           # total_revenue / total_quantity
    shipment_count: int          # в скольких отгрузках встречался товар


class StockMovementRow(BaseModel):
    item_type: ItemType
    item_id: uuid.UUID
    item_name: str
    sku: str | None = None
    unit: str
    total_in: Decimal            # Σ приходных движений за период
    total_out: Decimal           # Σ расходных движений за период
    balance: Decimal             # total_in − total_out (изменение за период)


# --- Сводка за период (остаток на начало → выпуск → продажи → остаток на конец) ---

class PeriodTotals(BaseModel):
    """Итоги по категории (или по всему отчёту). Количества суммируются «как есть»,
    поэтому в категории со смешанными единицами (Спанбонд: рулоны + кг) итог по
    количеству — справочный; итог по деньгам (`sold_amount`) корректен всегда."""

    opening_stock: Decimal
    produced: Decimal
    defect: Decimal
    sold_quantity: Decimal
    sold_amount: Decimal
    other_movement: Decimal
    closing_stock: Decimal


class PeriodItemRow(BaseModel):
    product_id: uuid.UUID
    product_name: str
    sku: str | None = None
    category: str | None = None
    subcategory: str | None = None
    unit: str
    # Вес единицы (кг за шт/рулон) — фронт считает по нему вес выпуска и продаж.
    # None у товаров, которые уже меряются в кг (там вес = само количество).
    base_weight: Decimal | None = None
    opening_stock: Decimal       # остаток на начало периода (по всем складам)
    produced: Decimal            # выпущено за период (утверждённые смены)
    defect: Decimal              # брак за период (утверждённые смены)
    sold_quantity: Decimal       # отгружено за период (позиции отгрузок)
    sold_amount: Decimal         # Σ суммы позиций отгрузок за период
    # Остальные движения (расход в производство, закупки, возвраты, корректировки).
    # Считается как остаток, невязка балансовой формулы, поэтому строка всегда сходится:
    #   opening + produced − defect − sold_quantity + other_movement = closing
    other_movement: Decimal
    closing_stock: Decimal       # остаток на конец периода


class PeriodCategoryBlock(BaseModel):
    category: str | None         # значение Product.category; None — без категории
    rows: list[PeriodItemRow]
    totals: PeriodTotals


class PeriodSummaryResponse(BaseModel):
    date_from: date | None
    date_to: date | None
    categories: list[PeriodCategoryBlock]
    totals: PeriodTotals
