"""Отчёты: /api/reports.

Права: reports.debts (дебиторка, менеджер видит только своих клиентов),
dashboard.view (дашборд), reports.finance (pnl, расходы по категориям, тренд,
продажи, «за период»), reports.production, reports.stock (остатки и движение).
Параметры периода: date_from, date_to; revenue_mode=shipments|payments.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession
from app.core.config import settings
from app.core.access import Permission
from app.core.enums import ItemType, RevenueMode
from app.core.permissions import require_permissions
from app.models import User
from app.schemas.report import (
    BobbinRow,
    BobbinShiftRow,
    DashboardResponse,
    DebtsResponse,
    ExpenseByCategoryRow,
    PeriodSummaryResponse,
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

DashboardViewer = Annotated[User, Depends(require_permissions(Permission.DASHBOARD_VIEW))]
FinanceViewer = Annotated[User, Depends(require_permissions(Permission.REPORTS_FINANCE))]
ProductionViewer = Annotated[User, Depends(require_permissions(Permission.REPORTS_PRODUCTION))]
StockViewer = Annotated[User, Depends(require_permissions(Permission.REPORTS_STOCK))]
DebtsViewer = Annotated[User, Depends(require_permissions(Permission.REPORTS_DEBTS))]

DateFrom = Annotated[date | None, Query()]
DateTo = Annotated[date | None, Query()]
Mode = Annotated[RevenueMode, Query(alias="revenue_mode")]


@router.get("/debts", response_model=DebtsResponse)
async def get_debts(
    actor: DebtsViewer,
    db: DbSession,
    only_debtors: Annotated[bool, Query()] = True,
) -> DebtsResponse:
    return await report_service.debts(db, actor, only_debtors=only_debtors)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    actor: DashboardViewer,
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
    actor: FinanceViewer,
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
    actor: FinanceViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[ExpenseByCategoryRow]:
    return await report_service.expenses_by_category(db, date_from=date_from, date_to=date_to)


@router.get("/revenue-expense-trend", response_model=list[RevenueExpenseTrendPoint])
async def get_revenue_expense_trend(
    actor: FinanceViewer,
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
    actor: ProductionViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[ProductionRow]:
    return await report_service.production(db, date_from=date_from, date_to=date_to)


@router.get("/bobbins", response_model=list[BobbinRow])
async def get_bobbins(
    actor: ProductionViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[BobbinRow]:
    """Бабины за период: взято, ожидалось по норме, выпущено рулонов."""
    return await report_service.bobbins(db, date_from=date_from, date_to=date_to)


@router.get("/bobbins/{bobbin_id}/shifts", response_model=list[BobbinShiftRow])
async def get_bobbin_shifts(
    bobbin_id: uuid.UUID,
    actor: ProductionViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[BobbinShiftRow]:
    """Движение одной бабины по сменам за тот же период (детализация строки)."""
    return await report_service.bobbin_shifts(
        db, bobbin_id, date_from=date_from, date_to=date_to
    )


@router.get("/sales-by-product", response_model=list[SalesByProductRow])
async def get_sales_by_product(
    actor: FinanceViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> list[SalesByProductRow]:
    return await report_service.sales_by_product(db, date_from=date_from, date_to=date_to)


@router.get("/period-summary", response_model=PeriodSummaryResponse)
async def get_period_summary(
    actor: FinanceViewer,
    db: DbSession,
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> PeriodSummaryResponse:
    """Сводка за период по категориям: остаток на начало → выпуск → продажи → остаток на конец."""
    return await report_service.period_summary(db, date_from=date_from, date_to=date_to)


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
