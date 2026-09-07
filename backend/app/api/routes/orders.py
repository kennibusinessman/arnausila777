"""Заказы: /api/orders.

Права: orders.view / orders.create / orders.edit / orders.rebuild (состав) /
orders.set_prices / orders.delete; суммы в ответе прячутся без orders.view_money.
Менеджер по продажам при этом видит только свои заказы (scope в сервисе).
Без статусов: создание заказа сразу списывает остаток со склада (см. сервис),
суммы считает сервер. Удаление возвращает товар на склад.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.access import Permission
from app.core.permissions import require_permissions
from app.models import User
from app.schemas.common import Message, Page
from app.schemas.order import (
    OrderCreate,
    OrderListItem,
    OrderPricing,
    OrderRead,
    OrderSummary,
    OrderUpdate,
)
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])

# Зав. складом «забивает» заказ без цен (доценит менеджер) и денег не видит —
# см. _hide_money ниже и Permission.ORDERS_VIEW_MONEY.
Reader = Annotated[User, Depends(require_permissions(Permission.ORDERS_VIEW))]
Creator = Annotated[User, Depends(require_permissions(Permission.ORDERS_CREATE))]
Editor = Annotated[User, Depends(require_permissions(Permission.ORDERS_EDIT))]
Rebuilder = Annotated[User, Depends(require_permissions(Permission.ORDERS_REBUILD))]
Pricer = Annotated[User, Depends(require_permissions(Permission.ORDERS_SET_PRICES))]
Remover = Annotated[User, Depends(require_permissions(Permission.ORDERS_DELETE))]


def _hide_money(actor: User, *orders: OrderListItem | OrderRead) -> None:
    """Без права «видеть суммы» обнуляем суммы/цены в ответе (защита на уровне
    API, не только UI). Вес и количества остаются как есть."""
    if actor.has_permission(Permission.ORDERS_VIEW_MONEY):
        return
    for order in orders:
        order.total_amount = Decimal("0")
        for item in order.items:
            item.unit_price = Decimal("0")
            item.total_price = Decimal("0")


@router.get("", response_model=Page[OrderListItem])
async def list_orders(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    deadline_from: Annotated[date | None, Query()] = None,
    deadline_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    in_expenses: Annotated[bool | None, Query()] = None,
    priced: Annotated[bool | None, Query()] = None,
    sort: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Page[OrderListItem]:
    items, total = await order_service.list_orders(
        db,
        actor,
        params,
        client_id=client_id,
        manager_id=manager_id,
        date_from=date_from,
        date_to=date_to,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        search=search,
        in_expenses=in_expenses,
        priced=priced,
        sort=sort,
    )
    rows = [OrderListItem.model_validate(i) for i in items]
    _hide_money(actor, *rows)
    return Page[OrderListItem](
        items=rows,
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/summary", response_model=OrderSummary)
async def get_orders_summary(
    actor: Reader,
    db: DbSession,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    deadline_from: Annotated[date | None, Query()] = None,
    deadline_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    in_expenses: Annotated[bool | None, Query()] = None,
    priced: Annotated[bool | None, Query()] = None,
) -> OrderSummary:
    summary = await order_service.get_summary(
        db,
        actor,
        client_id=client_id,
        manager_id=manager_id,
        date_from=date_from,
        date_to=date_to,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        search=search,
        in_expenses=in_expenses,
        priced=priced,
    )
    if not actor.has_permission(Permission.ORDERS_VIEW_MONEY):
        summary.total_amount = Decimal("0")  # без права «видеть суммы» — прячем итог
    return summary


@router.post("", response_model=OrderRead, status_code=201)
async def create_order(data: OrderCreate, actor: Creator, db: DbSession) -> OrderRead:
    order = await order_service.create_order(db, actor, data)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, actor: Reader, db: DbSession) -> OrderRead:
    order = await order_service.get_full(db, actor, order_id)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.patch("/{order_id}", response_model=OrderRead)
async def update_order(
    order_id: uuid.UUID, data: OrderUpdate, actor: Editor, db: DbSession
) -> OrderRead:
    order = await order_service.update_order(db, actor, order_id, data)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.put("/{order_id}", response_model=OrderRead)
async def replace_order(
    order_id: uuid.UUID, data: OrderCreate, actor: Rebuilder, db: DbSession
) -> OrderRead:
    """Полная правка заказа (право orders.rebuild). Меняет состав, цены и шапку даже
    у давно подтверждённого заказа: склад и долг клиента пересчитываются (старая
    отгрузка отменяется, создаётся новая)."""
    order = await order_service.replace_order(db, actor, order_id, data)
    return OrderRead.model_validate(order)


@router.patch("/{order_id}/pricing", response_model=OrderRead)
async def set_order_pricing(
    order_id: uuid.UUID, data: OrderPricing, actor: Pricer, db: DbSession
) -> OrderRead:
    """Доценка заказа (право orders.set_prices): проставить цены позиций у заказа,
    заведённого «без цен» — так его создаёт тот, у кого этого права нет."""
    order = await order_service.price_order(db, actor, order_id, data)
    return OrderRead.model_validate(order)


@router.delete("/{order_id}", response_model=Message)
async def delete_order(order_id: uuid.UUID, actor: Remover, db: DbSession) -> Message:
    await order_service.delete_order(db, actor, order_id)
    return Message(detail="Заказ удалён")
