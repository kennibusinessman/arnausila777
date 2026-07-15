"""Бизнес-логика оплат (§5.6).

Фиксация платежа клиента; долг нигде не хранится — считается на лету в отчёте
дебиторки. SaM работает только с оплатами своих клиентов (по client.manager_id).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import PaymentMethod, UserRole
from app.core.exceptions import BadRequestError, NotFoundError
from app.models import Client, Order, Payment, User
from app.schemas.common import PageParams
from app.schemas.payment import PaymentCreate, PaymentSummary, PaymentUpdate
from app.services import audit_service


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


def _scope(actor: User) -> list[ColumnElement[bool]]:
    """SaM видит только оплаты своих клиентов."""
    if not _is_sales(actor):
        return []
    return [
        Payment.client_id.in_(
            select(Client.id).where(Client.manager_id == actor.id)
        )
    ]


def _full_query():
    return select(Payment).options(
        selectinload(Payment.client),
        selectinload(Payment.order),
    )


async def get_full(session: AsyncSession, actor: User, payment_id: uuid.UUID) -> Payment:
    payment = (
        await session.execute(
            _full_query().where(Payment.id == payment_id, *_scope(actor))
        )
    ).scalar_one_or_none()
    if payment is None or payment.deleted_at is not None:
        raise NotFoundError("Оплата не найдена")
    return payment


async def _resolve_client(session: AsyncSession, actor: User, client_id: uuid.UUID) -> Client:
    client = await session.get(Client, client_id)
    if client is None or client.deleted_at is not None:
        raise BadRequestError("Клиент не найден")
    if _is_sales(actor) and client.manager_id != actor.id:
        raise BadRequestError("Клиент не найден")
    return client


async def _validate_order(
    session: AsyncSession, actor: User, order_id: uuid.UUID, client_id: uuid.UUID
) -> None:
    order = await session.get(Order, order_id)
    if order is None or order.deleted_at is not None:
        raise BadRequestError("Заказ не найден")
    if order.client_id != client_id:
        raise BadRequestError("Заказ принадлежит другому клиенту")


def _list_conditions(
    actor: User,
    *,
    client_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    payment_method: PaymentMethod | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Payment.deleted_at.is_(None), *_scope(actor)]
    if client_id is not None:
        conditions.append(Payment.client_id == client_id)
    if order_id is not None:
        conditions.append(Payment.order_id == order_id)
    if payment_method is not None:
        conditions.append(Payment.payment_method == payment_method)
    if date_from is not None:
        conditions.append(Payment.payment_date >= date_from)
    if date_to is not None:
        conditions.append(Payment.payment_date <= date_to)
    # Поиск по тому, что видно в списке: клиент (имя/компания), номер заказа,
    # комментарий. Через подзапросы in_(), как в _scope, чтобы не дублировать строки.
    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(
            or_(
                Payment.comment.ilike(term),
                Payment.client_id.in_(
                    select(Client.id).where(
                        or_(Client.name.ilike(term), Client.company_name.ilike(term))
                    )
                ),
                Payment.order_id.in_(
                    select(Order.id).where(Order.order_number.ilike(term))
                ),
            )
        )
    return conditions


async def list_payments(
    session: AsyncSession,
    actor: User,
    params: PageParams,
    *,
    client_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    payment_method: PaymentMethod | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    sort: str = "desc",
) -> tuple[list[Payment], int]:
    conditions = _list_conditions(
        actor,
        client_id=client_id,
        order_id=order_id,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    date_order = Payment.payment_date.asc() if sort == "asc" else Payment.payment_date.desc()

    total = (
        await session.execute(select(func.count()).select_from(Payment).where(*conditions))
    ).scalar_one()
    items = (
        await session.execute(
            _full_query()
            .where(*conditions)
            .order_by(date_order, Payment.created_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()
    return list(items), total


async def get_summary(
    session: AsyncSession,
    actor: User,
    *,
    client_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    payment_method: PaymentMethod | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> PaymentSummary:
    """Сумма/количество/средний платёж/число клиентов по тем же фильтрам — без пагинации."""
    conditions = _list_conditions(
        actor,
        client_id=client_id,
        order_id=order_id,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    count, total_amount = (
        await session.execute(
            select(func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0)).where(
                *conditions
            )
        )
    ).one()
    client_count = (
        await session.execute(
            select(func.count(func.distinct(Payment.client_id))).where(*conditions)
        )
    ).scalar_one()

    average = (total_amount / count) if count else Decimal("0")
    return PaymentSummary(
        count=count,
        total_amount=total_amount,
        average=average,
        client_count=client_count,
    )


async def create_payment(
    session: AsyncSession, actor: User, data: PaymentCreate
) -> Payment:
    await _resolve_client(session, actor, data.client_id)
    if data.order_id is not None:
        await _validate_order(session, actor, data.order_id, data.client_id)

    payment = Payment(
        client_id=data.client_id,
        order_id=data.order_id,
        payment_date=data.payment_date,
        amount=data.amount,
        payment_method=data.payment_method,
        comment=data.comment,
        created_by=actor.id,
    )
    session.add(payment)
    await session.flush()
    await audit_service.log(
        session,
        user_id=actor.id,
        action="CREATE_PAYMENT",
        entity_type="Payment",
        entity_id=payment.id,
        new={"client_id": str(data.client_id), "amount": str(data.amount)},
    )
    await session.commit()
    return await get_full(session, actor, payment.id)


async def update_payment(
    session: AsyncSession, actor: User, payment_id: uuid.UUID, data: PaymentUpdate
) -> Payment:
    payment = await get_full(session, actor, payment_id)
    payload = data.model_dump(exclude_unset=True)
    if "order_id" in payload and payload["order_id"] is not None:
        await _validate_order(session, actor, payload["order_id"], payment.client_id)
    for field, value in payload.items():
        setattr(payment, field, value)
    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_PAYMENT",
        entity_type="Payment",
        entity_id=payment.id,
        new=payload or None,
    )
    await session.commit()
    return await get_full(session, actor, payment.id)


async def delete_payment(session: AsyncSession, actor: User, payment_id: uuid.UUID) -> None:
    payment = await get_full(session, actor, payment_id)
    payment.deleted_at = datetime.now(timezone.utc)
    await audit_service.log(
        session,
        user_id=actor.id,
        action="DELETE_PAYMENT",
        entity_type="Payment",
        entity_id=payment.id,
    )
    await session.commit()
