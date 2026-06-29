"""Заказы: /api/orders.

GET/POST/GET{id}/PATCH{id} — SA, B, SaM (SaM только свои); DELETE — SA, B.
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
from app.core.enums import UserRole
from app.core.permissions import require_roles
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

# Заказы заводят SA, B, менеджер по продажам и зав. складом. Зав. складом «забивает»
# заказ без цен (доценит менеджер) и денег не видит — см. _hide_money ниже.
Creator = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.SALES_MANAGER,
            UserRole.WAREHOUSE_MANAGER,
        )
    ),
]
# Доценка (проставить цены) — только менеджер по продажам и руководство, не зав. склад.
Pricer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.SALES_MANAGER)),
]
Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]


def _hide_money(actor: User, *orders: OrderListItem | OrderRead) -> None:
    """Зав. складом денег не видит — обнуляем суммы/цены в ответе (защита на уровне
    API, не только UI). Вес и количества остаются как есть."""
    if actor.role is not UserRole.WAREHOUSE_MANAGER:
        return
    for order in orders:
        order.total_amount = Decimal("0")
        for item in order.items:
            item.unit_price = Decimal("0")
            item.total_price = Decimal("0")


@router.get("", response_model=Page[OrderListItem])
async def list_orders(
    actor: Creator,
    db: DbSession,
    params: Pagination,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    deadline_from: Annotated[date | None, Query()] = None,
    deadline_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
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
    actor: Creator,
    db: DbSession,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    deadline_from: Annotated[date | None, Query()] = None,
    deadline_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
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
    )
    if actor.role is UserRole.WAREHOUSE_MANAGER:
        summary.total_amount = Decimal("0")  # зав. складом денег не видит
    return summary


@router.post("", response_model=OrderRead, status_code=201)
async def create_order(data: OrderCreate, actor: Creator, db: DbSession) -> OrderRead:
    order = await order_service.create_order(db, actor, data)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, actor: Creator, db: DbSession) -> OrderRead:
    order = await order_service.get_full(db, actor, order_id)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.patch("/{order_id}", response_model=OrderRead)
async def update_order(
    order_id: uuid.UUID, data: OrderUpdate, actor: Creator, db: DbSession
) -> OrderRead:
    order = await order_service.update_order(db, actor, order_id, data)
    result = OrderRead.model_validate(order)
    _hide_money(actor, result)
    return result


@router.patch("/{order_id}/pricing", response_model=OrderRead)
async def set_order_pricing(
    order_id: uuid.UUID, data: OrderPricing, actor: Pricer, db: DbSession
) -> OrderRead:
    """Доценка заказа: менеджер/руководитель проставляют цены позиций (зав. склад
    создаёт заказ без цен). Зав. складом сюда не допускается."""
    order = await order_service.price_order(db, actor, order_id, data)
    return OrderRead.model_validate(order)


@router.delete("/{order_id}", response_model=Message)
async def delete_order(order_id: uuid.UUID, actor: Admin, db: DbSession) -> Message:
    await order_service.delete_order(db, actor, order_id)
    return Message(detail="Заказ удалён")
