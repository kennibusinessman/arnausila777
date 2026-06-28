"""Заказы: /api/orders.

GET/POST/GET{id}/PATCH{id} — SA, B, SaM (SaM только свои); DELETE — SA, B.
Без статусов: создание заказа сразу списывает остаток со склада (см. сервис),
суммы считает сервер. Удаление возвращает товар на склад.
"""
from __future__ import annotations

import uuid
from datetime import date
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
    OrderRead,
    OrderSummary,
    OrderUpdate,
)
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])

Manager = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.SALES_MANAGER)),
]
Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]


@router.get("", response_model=Page[OrderListItem])
async def list_orders(
    actor: Manager,
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
    return Page[OrderListItem](
        items=[OrderListItem.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/summary", response_model=OrderSummary)
async def get_orders_summary(
    actor: Manager,
    db: DbSession,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    deadline_from: Annotated[date | None, Query()] = None,
    deadline_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
) -> OrderSummary:
    return await order_service.get_summary(
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


@router.post("", response_model=OrderRead, status_code=201)
async def create_order(data: OrderCreate, actor: Manager, db: DbSession) -> OrderRead:
    order = await order_service.create_order(db, actor, data)
    return OrderRead.model_validate(order)


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, actor: Manager, db: DbSession) -> OrderRead:
    order = await order_service.get_full(db, actor, order_id)
    return OrderRead.model_validate(order)


@router.patch("/{order_id}", response_model=OrderRead)
async def update_order(
    order_id: uuid.UUID, data: OrderUpdate, actor: Manager, db: DbSession
) -> OrderRead:
    order = await order_service.update_order(db, actor, order_id, data)
    return OrderRead.model_validate(order)


@router.delete("/{order_id}", response_model=Message)
async def delete_order(order_id: uuid.UUID, actor: Admin, db: DbSession) -> Message:
    await order_service.delete_order(db, actor, order_id)
    return Message(detail="Заказ удалён")
