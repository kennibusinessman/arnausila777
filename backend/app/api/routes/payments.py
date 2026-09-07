"""Оплаты: /api/payments.

Права: payments.view, payments.create, payments.edit (правка и удаление).
Менеджер по продажам видит только своих клиентов (scope в сервисе).
Долг не хранится — см. /api/reports/debts.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.access import Permission
from app.core.enums import PaymentMethod
from app.core.permissions import require_permissions
from app.models import User
from app.schemas.common import Message, Page
from app.schemas.payment import PaymentCreate, PaymentRead, PaymentSummary, PaymentUpdate
from app.services import payment_service

router = APIRouter(prefix="/payments", tags=["payments"])

Reader = Annotated[User, Depends(require_permissions(Permission.PAYMENTS_VIEW))]
Creator = Annotated[User, Depends(require_permissions(Permission.PAYMENTS_CREATE))]
Editor = Annotated[User, Depends(require_permissions(Permission.PAYMENTS_EDIT))]


@router.get("", response_model=Page[PaymentRead])
async def list_payments(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    order_id: Annotated[uuid.UUID | None, Query()] = None,
    payment_method: Annotated[PaymentMethod | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    sort: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Page[PaymentRead]:
    items, total = await payment_service.list_payments(
        db, actor, params,
        client_id=client_id, order_id=order_id, payment_method=payment_method,
        date_from=date_from, date_to=date_to, search=search, sort=sort,
    )
    return Page[PaymentRead](
        items=[PaymentRead.model_validate(i) for i in items],
        total=total, page=params.page, size=params.size,
    )


@router.get("/summary", response_model=PaymentSummary)
async def get_payments_summary(
    actor: Reader,
    db: DbSession,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    order_id: Annotated[uuid.UUID | None, Query()] = None,
    payment_method: Annotated[PaymentMethod | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
) -> PaymentSummary:
    return await payment_service.get_summary(
        db, actor,
        client_id=client_id, order_id=order_id, payment_method=payment_method,
        date_from=date_from, date_to=date_to, search=search,
    )


@router.post("", response_model=PaymentRead, status_code=201)
async def create_payment(data: PaymentCreate, actor: Creator, db: DbSession) -> PaymentRead:
    payment = await payment_service.create_payment(db, actor, data)
    return PaymentRead.model_validate(payment)


@router.get("/{payment_id}", response_model=PaymentRead)
async def get_payment(payment_id: uuid.UUID, actor: Reader, db: DbSession) -> PaymentRead:
    payment = await payment_service.get_full(db, actor, payment_id)
    return PaymentRead.model_validate(payment)


@router.patch("/{payment_id}", response_model=PaymentRead)
async def update_payment(
    payment_id: uuid.UUID, data: PaymentUpdate, actor: Editor, db: DbSession
) -> PaymentRead:
    payment = await payment_service.update_payment(db, actor, payment_id, data)
    return PaymentRead.model_validate(payment)


@router.delete("/{payment_id}", response_model=Message)
async def delete_payment(payment_id: uuid.UUID, actor: Editor, db: DbSession) -> Message:
    await payment_service.delete_payment(db, actor, payment_id)
    return Message(detail="Оплата удалена")
