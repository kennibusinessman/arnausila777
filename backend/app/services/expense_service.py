"""Бизнес-логика расходов.

Расход — запись по факту: один раз внесли — значит он уже совершён, согласования
нет. Создавать/править/удалять расходы могут только SA/B, поэтому manager-scope
не нужен.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BadRequestError, NotFoundError
from app.models import Expense, ExpenseCategory, User
from app.schemas.common import PageParams
from app.schemas.expense import ExpenseCreate, ExpenseSummary, ExpenseUpdate
from app.services import audit_service


def _full_query():
    return select(Expense).options(
        selectinload(Expense.category),
        selectinload(Expense.creator),
        selectinload(Expense.responsible),
    )


async def get_full(session: AsyncSession, expense_id: uuid.UUID) -> Expense:
    expense = (
        await session.execute(_full_query().where(Expense.id == expense_id))
    ).scalar_one_or_none()
    if expense is None or expense.deleted_at is not None:
        raise NotFoundError("Расход не найден")
    return expense


async def _get_category(session: AsyncSession, category_id: uuid.UUID) -> ExpenseCategory:
    category = await session.get(ExpenseCategory, category_id)
    if category is None:
        raise BadRequestError("Категория расхода не найдена")
    return category


def _list_conditions(
    *,
    category_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Expense.deleted_at.is_(None)]
    if category_id is not None:
        conditions.append(Expense.category_id == category_id)
    if date_from is not None:
        conditions.append(Expense.expense_date >= date_from)
    if date_to is not None:
        conditions.append(Expense.expense_date <= date_to)
    if search:
        term = f"%{search.strip()}%"
        conditions.append(
            or_(
                Expense.name.ilike(term),
                Expense.comment.ilike(term),
                Expense.responsible_id.in_(select(User.id).where(User.full_name.ilike(term))),
            )
        )
    return conditions


async def list_expenses(
    session: AsyncSession,
    params: PageParams,
    *,
    category_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    sort: str = "date",
) -> tuple[list[Expense], int]:
    conditions = _list_conditions(
        category_id=category_id, date_from=date_from, date_to=date_to, search=search
    )

    total = (
        await session.execute(select(func.count()).select_from(Expense).where(*conditions))
    ).scalar_one()

    order_by = (
        (Expense.amount.desc(),)
        if sort == "amount"
        else (Expense.expense_date.desc(), Expense.created_at.desc())
    )
    items = (
        await session.execute(
            select(Expense)
            .options(selectinload(Expense.category), selectinload(Expense.responsible))
            .where(*conditions)
            .order_by(*order_by)
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()
    return list(items), total


async def get_summary(
    session: AsyncSession,
    *,
    category_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> ExpenseSummary:
    conditions = _list_conditions(
        category_id=category_id, date_from=date_from, date_to=date_to, search=search
    )

    count, total_amount = (
        await session.execute(
            select(func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)).where(
                *conditions
            )
        )
    ).one()

    category_count = (
        await session.execute(
            select(func.count(func.distinct(Expense.category_id))).where(*conditions)
        )
    ).scalar_one()

    return ExpenseSummary(count=count, total_amount=total_amount, category_count=category_count)


async def create_expense(
    session: AsyncSession, actor_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    await _get_category(session, data.category_id)

    expense = Expense(
        name=data.name,
        expense_date=data.expense_date,
        category_id=data.category_id,
        amount=data.amount,
        comment=data.comment,
        created_by=actor_id,
        responsible_id=data.responsible_id or actor_id,
    )
    session.add(expense)
    await session.flush()
    await audit_service.log(
        session,
        user_id=actor_id,
        action="CREATE_EXPENSE",
        entity_type="Expense",
        entity_id=expense.id,
        new={"name": data.name, "amount": str(data.amount), "category_id": str(data.category_id)},
    )
    await session.commit()
    return await get_full(session, expense.id)


async def update_expense(
    session: AsyncSession, actor_id: uuid.UUID, expense_id: uuid.UUID, data: ExpenseUpdate
) -> Expense:
    expense = await get_full(session, expense_id)

    payload = data.model_dump(exclude_unset=True)
    if "category_id" in payload:
        await _get_category(session, payload["category_id"])
    for field, value in payload.items():
        setattr(expense, field, value)

    await audit_service.log(
        session,
        user_id=actor_id,
        action="UPDATE_EXPENSE",
        entity_type="Expense",
        entity_id=expense.id,
        new=payload or None,
    )
    await session.commit()
    return await get_full(session, expense.id)


async def delete_expense(session: AsyncSession, actor_id: uuid.UUID, expense_id: uuid.UUID) -> None:
    expense = await get_full(session, expense_id)
    expense.deleted_at = datetime.now(timezone.utc)
    await audit_service.log(
        session,
        user_id=actor_id,
        action="DELETE_EXPENSE",
        entity_type="Expense",
        entity_id=expense.id,
    )
    await session.commit()
