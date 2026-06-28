"""Отчёты: /api/reports.

debts — SA,B,SaM (SaM только свои клиенты); dashboard/pnl/expenses-by-category/
revenue-expense-trend — SA,B; production — SA,B; stock — SA,B,WM.
Параметры периода: date_from, date_to; revenue_mode=shipments|payments.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession
from app.core.config import settings
from app.core.enums import ItemType, RevenueMode, UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.report import (
    DashboardResponse,
    DebtsResponse,
    ExpenseByCategoryRow,
    PnLResponse,
    ProductionRow,
    RevenueExpenseTrendPoint,
    SalesByProductRow,
    StockMovementRow,
    StockReportRow,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

_DEFAULT_REVENUE_MODE = RevenueMode(settings.REVENUE_MODE_DEFAULT)

Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
Manager = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.SALES_MANAGER)),
]
StockViewer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]

DateFrom = Annotated[date | None, Query()]
DateTo = Annotated[date | None, Query()]
Mode = Annotated[RevenueMode, Query(alias="revenue_mode")]


@router.get("/debts", response_model=DebtsResponse)
async def get_debts(
    actor: Manager,
    db: DbSession,
    only_debtors: Annotated[bool, Query()] = True,
) -> DebtsResponse:
    return await report_service.debts(db, actor, only_debtors=only_debtors)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    revenue_mode: Mode = _DEFAULT_REVENUE_MODE,
) -> DashboardResponse:
    return await report_service.dashboard(
        db, date_from=date_from, date_to=date_to, revenue_mode=revenue_mode
    )


@router.get("/pnl", response_model=PnLResponse)
async def get_pnl(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    revenue_mode: Mode = _DEFAULT_REVENUE_MODE,
) -> PnLResponse:
    return await report_service.pnl(
        db, date_from=date_from, date_to=date_to, revenue_mode=revenue_mode
    )


@router.get("/expenses-by-category", response_model=list[ExpenseByCategoryRow])
async def get_expenses_by_category(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[ExpenseByCategoryRow]:
    return await report_service.expenses_by_category(db, date_from=date_from, date_to=date_to)


@router.get("/revenue-expense-trend", response_model=list[RevenueExpenseTrendPoint])
async def get_revenue_expense_trend(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    revenue_mode: Mode = _DEFAULT_REVENUE_MODE,
) -> list[RevenueExpenseTrendPoint]:
    return await report_service.revenue_expense_trend(
        db, date_from=date_from, date_to=date_to, revenue_mode=revenue_mode
    )


@router.get("/production", response_model=list[ProductionRow])
async def get_production(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[ProductionRow]:
    return await report_service.production(db, date_from=date_from, date_to=date_to)


@router.get("/sales-by-product", response_model=list[SalesByProductRow])
async def get_sales_by_product(
    actor: Admin,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[SalesByProductRow]:
    return await report_service.sales_by_product(db, date_from=date_from, date_to=date_to)


@router.get("/stock-movement", response_model=list[StockMovementRow])
async def get_stock_movement(
    actor: StockViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    warehouse_id: Annotated[uuid.UUID | None, Query()] = None,
    item_type: Annotated[ItemType | None, Query()] = None,
) -> list[StockMovementRow]:
    return await report_service.stock_movement(
        db, date_from=date_from, date_to=date_to,
        warehouse_id=warehouse_id, item_type=item_type,
    )


@router.get("/stock", response_model=list[StockReportRow])
async def get_stock(
    actor: StockViewer,
    db: DbSession,
    warehouse_id: Annotated[uuid.UUID | None, Query()] = None,
    item_type: Annotated[ItemType | None, Query()] = None,
    include_zero: Annotated[bool, Query()] = False,
) -> list[StockReportRow]:
    return await report_service.stock(
        db, warehouse_id=warehouse_id, item_type=item_type, include_zero=include_zero
    )
