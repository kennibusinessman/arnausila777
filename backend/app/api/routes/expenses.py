"""Расходы: /api/expenses.

GET/POST/PATCH/{id} — SA,B; DELETE — только SA. Расход — запись по факту,
без согласования.
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
from app.schemas.expense import ExpenseCreate, ExpenseListItem, ExpenseRead, ExpenseSummary, ExpenseUpdate
from app.services import expense_service

router = APIRouter(prefix="/expenses", tags=["expenses"])

Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("", response_model=Page[ExpenseListItem])
async def list_expenses(
    actor: Admin,
    db: DbSession,
    params: Pagination,
    category_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    sort: Annotated[str, Query(pattern="^(date|amount)$")] = "date",
) -> Page[ExpenseListItem]:
    items, total = await expense_service.list_expenses(
        db, params,
        category_id=category_id, date_from=date_from, date_to=date_to,
        search=search, sort=sort,
    )
    return Page[ExpenseListItem](
        items=[ExpenseListItem.model_validate(i) for i in items],
        total=total, page=params.page, size=params.size,
    )


@router.get("/summary", response_model=ExpenseSummary)
async def get_expenses_summary(
    actor: Admin,
    db: DbSession,
    category_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
) -> ExpenseSummary:
    return await expense_service.get_summary(
        db, category_id=category_id, date_from=date_from, date_to=date_to, search=search
    )


@router.post("", response_model=ExpenseRead, status_code=201)
async def create_expense(data: ExpenseCreate, actor: Admin, db: DbSession) -> ExpenseRead:
    expense = await expense_service.create_expense(db, actor.id, data)
    return ExpenseRead.model_validate(expense)


@router.get("/{expense_id}", response_model=ExpenseRead)
async def get_expense(expense_id: uuid.UUID, actor: Admin, db: DbSession) -> ExpenseRead:
    expense = await expense_service.get_full(db, expense_id)
    return ExpenseRead.model_validate(expense)


@router.patch("/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: uuid.UUID, data: ExpenseUpdate, actor: Admin, db: DbSession
) -> ExpenseRead:
    expense = await expense_service.update_expense(db, actor.id, expense_id, data)
    return ExpenseRead.model_validate(expense)


@router.delete("/{expense_id}", response_model=Message)
async def delete_expense(expense_id: uuid.UUID, actor: SuperAdmin, db: DbSession) -> Message:
    await expense_service.delete_expense(db, actor.id, expense_id)
    return Message(detail="Расход удалён")
