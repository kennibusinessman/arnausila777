"""Аналитика и отчёты (§5.7).

Все суммы — за период [date_from, date_to] (включительно), кроме текущей
дебиторки (всё время). `revenue_mode` выбирает выручку: по отгрузкам (начисление)
или по оплатам (касса). Долг нигде не хранится — считается на лету: каждый заказ
создаёт отгрузку (накапливает долг клиента), каждая оплата его уменьшает.

    gross_revenue  = Σ shipments.total_amount
    cash_revenue   = Σ payments.amount
    total_expenses = Σ expenses.amount
    net_profit     = revenue(mode) − total_expenses
    accounts_receivable = Σ shipments − Σ payments
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ItemType,
    MovementType,
    RevenueMode,
    ShiftReportStatus,
    UserRole,
)
from app.models import (
    Client,
    Expense,
    ExpenseCategory,
    Material,
    Order,
    Payment,
    Product,
    ShiftReport,
    ShiftReportOutput,
    Shipment,
    ShipmentItem,
    StockBalance,
    StockMovement,
    User,
    Warehouse,
)
from app.schemas.client import (
    ClientOverviewResponse,
    ClientOverviewRow,
    ClientRead,
    ClientStats,
)
from app.schemas.product import CatalogItem, CatalogResponse
from app.schemas.report import (
    DashboardResponse,
    DebtRow,
    DebtsResponse,
    ExpenseByCategoryRow,
    PnLResponse,
    ProductionRow,
    RevenueExpenseTrendPoint,
    SalesByProductRow,
    StockMovementRow,
    StockReportRow,
)

# Классификация движений склада на приход/расход (см. MovementType).
_MOVEMENT_IN = (
    MovementType.PURCHASE_IN,
    MovementType.PRODUCTION_IN,
    MovementType.ADJUSTMENT_IN,
    MovementType.RETURN_IN,
)
_MOVEMENT_OUT = (
    MovementType.PRODUCTION_OUT,
    MovementType.SALE_OUT,
    MovementType.ADJUSTMENT_OUT,
    MovementType.DEFECT_OUT,
)


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


def _between(column, date_from: date | None, date_to: date | None) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    if date_from is not None:
        conds.append(column >= date_from)
    if date_to is not None:
        conds.append(column <= date_to)
    return conds


async def _scalar(session: AsyncSession, stmt) -> Decimal:
    return Decimal((await session.execute(stmt)).scalar_one())


async def _sum_shipments(session, date_from, date_to) -> Decimal:
    return await _scalar(
        session,
        select(func.coalesce(func.sum(Shipment.total_amount), 0)).where(
            Shipment.deleted_at.is_(None),
            *_between(Shipment.shipment_date, date_from, date_to),
        ),
    )


async def _sum_payments(session, date_from, date_to) -> Decimal:
    return await _scalar(
        session,
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.deleted_at.is_(None),
            *_between(Payment.payment_date, date_from, date_to),
        ),
    )


async def _sum_expenses(session, date_from, date_to) -> Decimal:
    return await _scalar(
        session,
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.deleted_at.is_(None),
            *_between(Expense.expense_date, date_from, date_to),
        ),
    )


async def _count(session: AsyncSession, model, *conditions) -> int:
    return (
        await session.execute(select(func.count()).select_from(model).where(*conditions))
    ).scalar_one()


# --- Дебиторка ---

async def debts(
    session: AsyncSession, actor: User, *, only_debtors: bool = True
) -> DebtsResponse:
    client_filter: list[ColumnElement[bool]] = [Client.deleted_at.is_(None)]
    if _is_sales(actor):
        client_filter.append(Client.manager_id == actor.id)

    ship_rows = (
        await session.execute(
            select(
                Shipment.client_id,
                func.coalesce(func.sum(Shipment.total_amount), 0),
                func.max(Shipment.shipment_date),
            )
            .where(Shipment.deleted_at.is_(None))
            .group_by(Shipment.client_id)
        )
    ).all()
    pay_rows = (
        await session.execute(
            select(
                Payment.client_id,
                func.coalesce(func.sum(Payment.amount), 0),
                func.max(Payment.payment_date),
            )
            .where(Payment.deleted_at.is_(None))
            .group_by(Payment.client_id)
        )
    ).all()

    shipped = {cid: (amt, last) for cid, amt, last in ship_rows}
    paid = {cid: (amt, last) for cid, amt, last in pay_rows}
    involved = set(shipped) | set(paid)
    if not involved:
        return DebtsResponse(rows=[], total_debt=Decimal("0"))

    clients = (
        await session.execute(select(Client).where(Client.id.in_(involved), *client_filter))
    ).scalars().all()

    rows: list[DebtRow] = []
    total_debt = Decimal("0")
    for client in clients:
        ship_amt, last_ship = shipped.get(client.id, (Decimal("0"), None))
        pay_amt, last_pay = paid.get(client.id, (Decimal("0"), None))
        debt = Decimal(ship_amt) - Decimal(pay_amt)
        if only_debtors and debt <= 0:
            continue
        rows.append(
            DebtRow(
                client_id=client.id,
                client_name=client.name,
                company_name=client.company_name,
                manager_id=client.manager_id,
                total_shipped=Decimal(ship_amt),
                total_paid=Decimal(pay_amt),
                debt=debt,
                last_shipment_date=last_ship,
                last_payment_date=last_pay,
            )
        )
        total_debt += debt

    rows.sort(key=lambda r: r.debt, reverse=True)
    return DebtsResponse(rows=rows, total_debt=total_debt)


async def client_stats(session: AsyncSession, client: Client) -> ClientStats:
    """Агрегаты по одному клиенту: суммы/количество/крайние даты отгрузок и оплат.

    Долг считается за всё время (Σ отгрузок − Σ оплат), как и в дебиторке.
    Доступ к клиенту проверяется в роутере (scope SaM) до вызова.
    """
    total_shipped, shipment_count, first_ship, last_ship = (
        await session.execute(
            select(
                func.coalesce(func.sum(Shipment.total_amount), 0),
                func.count(Shipment.id),
                func.min(Shipment.shipment_date),
                func.max(Shipment.shipment_date),
            ).where(Shipment.client_id == client.id, Shipment.deleted_at.is_(None))
        )
    ).one()
    total_paid, payment_count, first_pay, last_pay = (
        await session.execute(
            select(
                func.coalesce(func.sum(Payment.amount), 0),
                func.count(Payment.id),
                func.min(Payment.payment_date),
                func.max(Payment.payment_date),
            ).where(Payment.client_id == client.id, Payment.deleted_at.is_(None))
        )
    ).one()
    order_count = (
        await session.execute(
            select(func.count(Order.id)).where(
                Order.client_id == client.id, Order.deleted_at.is_(None)
            )
        )
    ).scalar_one()

    total_shipped = Decimal(total_shipped)
    total_paid = Decimal(total_paid)
    avg_payment = (total_paid / payment_count) if payment_count else Decimal("0")

    return ClientStats(
        client=ClientRead.model_validate(client),
        total_shipped=total_shipped,
        total_paid=total_paid,
        debt=total_shipped - total_paid,
        order_count=order_count,
        shipment_count=shipment_count,
        payment_count=payment_count,
        avg_payment=avg_payment,
        first_payment_date=first_pay,
        last_payment_date=last_pay,
        first_shipment_date=first_ship,
        last_shipment_date=last_ship,
    )


async def catalog(session: AsyncSession) -> CatalogResponse:
    """Единый каталог: готовая продукция + сырьё, с суммарным остатком по складам.

    Количество берётся из остатков (StockBalance) — оно не хранится в самой карточке
    товара/сырья, а складывается из движений склада.
    """
    products = (
        await session.execute(
            select(Product).where(Product.deleted_at.is_(None)).order_by(Product.name.asc())
        )
    ).scalars().all()
    materials = (
        await session.execute(
            select(Material).where(Material.deleted_at.is_(None)).order_by(Material.name.asc())
        )
    ).scalars().all()

    prod_qty = dict(
        (
            await session.execute(
                select(StockBalance.product_id, func.coalesce(func.sum(StockBalance.quantity), 0))
                .where(StockBalance.product_id.isnot(None))
                .group_by(StockBalance.product_id)
            )
        ).all()
    )
    mat_qty = dict(
        (
            await session.execute(
                select(StockBalance.material_id, func.coalesce(func.sum(StockBalance.quantity), 0))
                .where(StockBalance.material_id.isnot(None))
                .group_by(StockBalance.material_id)
            )
        ).all()
    )

    items: list[CatalogItem] = []
    for p in products:
        items.append(
            CatalogItem(
                id=p.id,
                kind="product",
                name=p.name,
                sku=p.sku,
                category=p.category,
                subcategory=p.subcategory,
                unit=p.unit,
                price=p.default_price,
                base_weight=p.base_weight,
                min_stock=p.min_stock,
                quantity=Decimal(prod_qty.get(p.id, 0)),
                is_active=p.is_active,
            )
        )
    for m in materials:
        items.append(
            CatalogItem(
                id=m.id,
                kind="material",
                name=m.name,
                sku=m.sku,
                category=m.category,
                subcategory=None,
                unit=m.unit,
                price=Decimal("0"),
                base_weight=None,
                min_stock=m.min_stock,
                quantity=Decimal(mat_qty.get(m.id, 0)),
                is_active=m.is_active,
            )
        )
    return CatalogResponse(items=items)


async def clients_overview(
    session: AsyncSession, actor: User, *, search: str | None = None
) -> ClientOverviewResponse:
    """Все клиенты в зоне видимости + агрегаты одним ответом (для таблицы и KPI /clients).

    Долг = Σ отгрузок − Σ оплат (как в дебиторке). Сортировка/фильтры — на клиенте.
    """
    client_filter: list[ColumnElement[bool]] = [Client.deleted_at.is_(None)]
    if _is_sales(actor):
        client_filter.append(Client.manager_id == actor.id)
    if search:
        like = f"%{search.strip().lower()}%"
        client_filter.append(
            or_(
                func.lower(Client.name).like(like),
                func.lower(func.coalesce(Client.company_name, "")).like(like),
            )
        )

    clients = (
        await session.execute(select(Client).where(*client_filter).order_by(Client.name.asc()))
    ).scalars().all()

    order_rows = (
        await session.execute(
            select(Order.client_id, func.count(Order.id))
            .where(Order.deleted_at.is_(None))
            .group_by(Order.client_id)
        )
    ).all()
    ship_rows = (
        await session.execute(
            select(
                Shipment.client_id,
                func.coalesce(func.sum(Shipment.total_amount), 0),
                func.max(Shipment.shipment_date),
            )
            .where(Shipment.deleted_at.is_(None))
            .group_by(Shipment.client_id)
        )
    ).all()
    pay_rows = (
        await session.execute(
            select(
                Payment.client_id,
                func.coalesce(func.sum(Payment.amount), 0),
                func.max(Payment.payment_date),
            )
            .where(Payment.deleted_at.is_(None))
            .group_by(Payment.client_id)
        )
    ).all()

    orders_by = {cid: cnt for cid, cnt in order_rows}
    ship_by = {cid: (amt, last) for cid, amt, last in ship_rows}
    pay_by = {cid: (amt, last) for cid, amt, last in pay_rows}

    today = date.today()
    rows: list[ClientOverviewRow] = []
    for c in clients:
        order_count = orders_by.get(c.id, 0)
        s_amt, s_last = ship_by.get(c.id, (Decimal("0"), None))
        p_amt, p_last = pay_by.get(c.id, (Decimal("0"), None))
        last_dates = [d for d in (s_last, p_last) if d is not None]
        last_activity = max(last_dates) if last_dates else None
        if order_count > 0:
            status = "active"
        elif (today - c.created_at.date()).days <= 90:
            status = "lead"
        else:
            status = "inactive"
        rows.append(
            ClientOverviewRow(
                client=ClientRead.model_validate(c),
                order_count=order_count,
                total_shipped=Decimal(s_amt),
                total_paid=Decimal(p_amt),
                debt=Decimal(s_amt) - Decimal(p_amt),
                last_activity=last_activity,
                status=status,
            )
        )
    return ClientOverviewResponse(rows=rows)


# --- Dashboard / P&L ---

async def dashboard(
    session: AsyncSession, *, date_from: date | None, date_to: date | None, revenue_mode: RevenueMode
) -> DashboardResponse:
    gross = await _sum_shipments(session, date_from, date_to)
    cash = await _sum_payments(session, date_from, date_to)
    expenses = await _sum_expenses(session, date_from, date_to)
    revenue = gross if revenue_mode is RevenueMode.SHIPMENTS else cash

    ar = (await _sum_shipments(session, None, None)) - (await _sum_payments(session, None, None))

    orders_count = await _count(
        session, Order,
        Order.deleted_at.is_(None),
        *_between(func.date(Order.created_at), date_from, date_to),
    )
    shipments_count = await _count(
        session, Shipment,
        Shipment.deleted_at.is_(None),
        *_between(Shipment.shipment_date, date_from, date_to),
    )
    payments_count = await _count(
        session, Payment,
        Payment.deleted_at.is_(None),
        *_between(Payment.payment_date, date_from, date_to),
    )

    return DashboardResponse(
        date_from=date_from, date_to=date_to, revenue_mode=revenue_mode,
        gross_revenue=gross, cash_revenue=cash, revenue=revenue,
        total_expenses=expenses, net_profit=revenue - expenses,
        accounts_receivable=ar,
        orders_count=orders_count, shipments_count=shipments_count,
        payments_count=payments_count,
    )


async def expenses_by_category(
    session: AsyncSession, *, date_from: date | None, date_to: date | None
) -> list[ExpenseByCategoryRow]:
    rows = (
        await session.execute(
            select(
                ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.type,
                func.coalesce(func.sum(Expense.amount), 0), func.count(Expense.id),
            )
            .join(Expense, Expense.category_id == ExpenseCategory.id)
            .where(
                Expense.deleted_at.is_(None),
                *_between(Expense.expense_date, date_from, date_to),
            )
            .group_by(ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.type)
            .order_by(func.coalesce(func.sum(Expense.amount), 0).desc())
        )
    ).all()
    return [
        ExpenseByCategoryRow(
            category_id=cid, category_name=name, type=ctype,
            total_amount=Decimal(amt), count=cnt,
        )
        for cid, name, ctype, amt, cnt in rows
    ]


async def pnl(
    session: AsyncSession, *, date_from: date | None, date_to: date | None, revenue_mode: RevenueMode
) -> PnLResponse:
    gross = await _sum_shipments(session, date_from, date_to)
    cash = await _sum_payments(session, date_from, date_to)
    expenses = await _sum_expenses(session, date_from, date_to)
    revenue = gross if revenue_mode is RevenueMode.SHIPMENTS else cash
    by_cat = await expenses_by_category(session, date_from=date_from, date_to=date_to)
    return PnLResponse(
        date_from=date_from, date_to=date_to, revenue_mode=revenue_mode,
        gross_revenue=gross, cash_revenue=cash, revenue=revenue,
        total_expenses=expenses, net_profit=revenue - expenses,
        expenses_by_category=by_cat,
    )


# --- Производство / Склад / Тренды ---

async def production(
    session: AsyncSession, *, date_from: date | None, date_to: date | None
) -> list[ProductionRow]:
    rows = (
        await session.execute(
            select(
                Product.id, Product.name, Product.sku, Product.unit,
                func.coalesce(func.sum(ShiftReportOutput.quantity), 0),
                func.coalesce(func.sum(ShiftReportOutput.defect_quantity), 0),
            )
            .join(ShiftReportOutput, ShiftReportOutput.product_id == Product.id)
            .join(ShiftReport, ShiftReport.id == ShiftReportOutput.shift_report_id)
            .where(
                ShiftReport.status == ShiftReportStatus.APPROVED,
                *_between(ShiftReport.shift_date, date_from, date_to),
            )
            .group_by(Product.id, Product.name, Product.sku, Product.unit)
            .order_by(func.coalesce(func.sum(ShiftReportOutput.quantity), 0).desc())
        )
    ).all()
    return [
        ProductionRow(
            product_id=pid, product_name=name, sku=sku, unit=unit,
            total_quantity=Decimal(qty), total_defect=Decimal(defect),
        )
        for pid, name, sku, unit, qty, defect in rows
    ]


async def sales_by_product(
    session: AsyncSession, *, date_from: date | None, date_to: date | None
) -> list[SalesByProductRow]:
    """Продажи в разрезе товаров за период (по позициям отгрузок).

    Выручка — Σ total_price позиций; количество — Σ quantity; средняя цена —
    выручка / количество. Отсортировано по выручке.
    """
    rows = (
        await session.execute(
            select(
                Product.id, Product.name, Product.sku, Product.unit,
                func.coalesce(func.sum(ShipmentItem.quantity), 0),
                func.coalesce(func.sum(ShipmentItem.total_price), 0),
                func.count(func.distinct(ShipmentItem.shipment_id)),
            )
            .join(ShipmentItem, ShipmentItem.product_id == Product.id)
            .join(Shipment, Shipment.id == ShipmentItem.shipment_id)
            .where(
                Shipment.deleted_at.is_(None),
                *_between(Shipment.shipment_date, date_from, date_to),
            )
            .group_by(Product.id, Product.name, Product.sku, Product.unit)
            .order_by(func.coalesce(func.sum(ShipmentItem.total_price), 0).desc())
        )
    ).all()

    result: list[SalesByProductRow] = []
    for pid, name, sku, unit, qty, revenue, cnt in rows:
        qty = Decimal(qty)
        revenue = Decimal(revenue)
        avg_price = (revenue / qty) if qty else Decimal("0")
        result.append(
            SalesByProductRow(
                product_id=pid, product_name=name, sku=sku, unit=unit,
                total_quantity=qty, total_revenue=revenue,
                avg_price=avg_price, shipment_count=cnt,
            )
        )
    return result


async def stock_movement(
    session: AsyncSession,
    *,
    date_from: date | None,
    date_to: date | None,
    warehouse_id: uuid.UUID | None = None,
    item_type: ItemType | None = None,
) -> list[StockMovementRow]:
    """Движение склада за период: приход/расход по каждой позиции (журнал движений).

    Приход и расход определяются типом движения (см. _MOVEMENT_IN/_MOVEMENT_OUT).
    balance = приход − расход — изменение остатка за период. Сортировка по обороту.
    """
    conditions: list[ColumnElement[bool]] = list(
        _between(func.date(StockMovement.created_at), date_from, date_to)
    )
    if warehouse_id is not None:
        conditions.append(StockMovement.warehouse_id == warehouse_id)
    if item_type is not None:
        conditions.append(StockMovement.item_type == item_type)

    in_sum = func.coalesce(
        func.sum(
            case((StockMovement.movement_type.in_(_MOVEMENT_IN), StockMovement.quantity), else_=0)
        ),
        0,
    )
    out_sum = func.coalesce(
        func.sum(
            case((StockMovement.movement_type.in_(_MOVEMENT_OUT), StockMovement.quantity), else_=0)
        ),
        0,
    )
    rows = (
        await session.execute(
            select(
                StockMovement.item_type,
                StockMovement.product_id,
                StockMovement.material_id,
                in_sum,
                out_sum,
            )
            .where(*conditions)
            .group_by(
                StockMovement.item_type, StockMovement.product_id, StockMovement.material_id
            )
        )
    ).all()
    if not rows:
        return []

    prod_ids = {pid for _it, pid, _mid, _i, _o in rows if pid is not None}
    mat_ids = {mid for _it, _pid, mid, _i, _o in rows if mid is not None}
    products = {
        p.id: p for p in (
            await session.execute(select(Product).where(Product.id.in_(prod_ids)))
        ).scalars()
    } if prod_ids else {}
    materials = {
        m.id: m for m in (
            await session.execute(select(Material).where(Material.id.in_(mat_ids)))
        ).scalars()
    } if mat_ids else {}

    result: list[StockMovementRow] = []
    for it, pid, mid, total_in, total_out in rows:
        if it == ItemType.PRODUCT and pid in products:
            item = products[pid]
        elif it == ItemType.MATERIAL and mid in materials:
            item = materials[mid]
        else:
            continue
        total_in = Decimal(total_in)
        total_out = Decimal(total_out)
        result.append(
            StockMovementRow(
                item_type=it,
                item_id=item.id,
                item_name=item.name,
                sku=item.sku,
                unit=item.unit,
                total_in=total_in,
                total_out=total_out,
                balance=total_in - total_out,
            )
        )
    result.sort(key=lambda r: r.total_in + r.total_out, reverse=True)
    return result


async def stock(
    session: AsyncSession,
    *,
    warehouse_id: uuid.UUID | None = None,
    item_type: ItemType | None = None,
    include_zero: bool = False,
) -> list[StockReportRow]:
    conditions: list[ColumnElement[bool]] = []
    if warehouse_id is not None:
        conditions.append(StockBalance.warehouse_id == warehouse_id)
    if item_type is not None:
        conditions.append(StockBalance.item_type == item_type)
    if not include_zero:
        conditions.append(StockBalance.quantity != 0)

    balances = (
        await session.execute(select(StockBalance).where(*conditions))
    ).scalars().all()
    if not balances:
        return []

    wh_ids = {b.warehouse_id for b in balances}
    prod_ids = {b.product_id for b in balances if b.product_id is not None}
    mat_ids = {b.material_id for b in balances if b.material_id is not None}
    warehouses = {
        w.id: w for w in (
            await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))
        ).scalars()
    }
    products = {
        p.id: p for p in (
            await session.execute(select(Product).where(Product.id.in_(prod_ids)))
        ).scalars()
    } if prod_ids else {}
    materials = {
        m.id: m for m in (
            await session.execute(select(Material).where(Material.id.in_(mat_ids)))
        ).scalars()
    } if mat_ids else {}

    rows: list[StockReportRow] = []
    for b in balances:
        wh = warehouses.get(b.warehouse_id)
        if b.item_type is ItemType.PRODUCT and b.product_id in products:
            item = products[b.product_id]
            item_id, name, sku, unit = item.id, item.name, item.sku, item.unit
        elif b.item_type is ItemType.MATERIAL and b.material_id in materials:
            item = materials[b.material_id]
            item_id, name, sku, unit = item.id, item.name, item.sku, item.unit
        else:
            continue
        rows.append(
            StockReportRow(
                warehouse_id=b.warehouse_id,
                warehouse_name=wh.name if wh else "",
                item_type=b.item_type,
                item_id=item_id, item_name=name, sku=sku, unit=unit,
                quantity=b.quantity,
            )
        )
    rows.sort(key=lambda r: (r.warehouse_name, r.item_name))
    return rows


async def revenue_expense_trend(
    session: AsyncSession,
    *,
    date_from: date | None,
    date_to: date | None,
    revenue_mode: RevenueMode,
) -> list[RevenueExpenseTrendPoint]:
    if revenue_mode is RevenueMode.SHIPMENTS:
        rev_month = func.to_char(Shipment.shipment_date, "YYYY-MM")
        rev_rows = (
            await session.execute(
                select(rev_month, func.coalesce(func.sum(Shipment.total_amount), 0))
                .where(
                    Shipment.deleted_at.is_(None),
                    *_between(Shipment.shipment_date, date_from, date_to),
                )
                .group_by(rev_month)
            )
        ).all()
    else:
        rev_month = func.to_char(Payment.payment_date, "YYYY-MM")
        rev_rows = (
            await session.execute(
                select(rev_month, func.coalesce(func.sum(Payment.amount), 0))
                .where(
                    Payment.deleted_at.is_(None),
                    *_between(Payment.payment_date, date_from, date_to),
                )
                .group_by(rev_month)
            )
        ).all()

    exp_month = func.to_char(Expense.expense_date, "YYYY-MM")
    exp_rows = (
        await session.execute(
            select(exp_month, func.coalesce(func.sum(Expense.amount), 0))
            .where(
                Expense.deleted_at.is_(None),
                *_between(Expense.expense_date, date_from, date_to),
            )
            .group_by(exp_month)
        )
    ).all()

    revenue = {m: Decimal(v) for m, v in rev_rows}
    expenses = {m: Decimal(v) for m, v in exp_rows}
    months = sorted(set(revenue) | set(expenses))
    return [
        RevenueExpenseTrendPoint(
            period=m,
            revenue=revenue.get(m, Decimal("0")),
            expenses=expenses.get(m, Decimal("0")),
        )
        for m in months
    ]
