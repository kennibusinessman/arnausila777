"""Справочник категорий расходов: /api/expense-categories (права расходов)."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.access import Permission
from app.core.exceptions import NotFoundError
from app.core.permissions import require_permissions
from app.models import ExpenseCategory, User
from app.repositories.base import CRUDRepository
from app.schemas.common import Page
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryRead,
    ExpenseCategoryUpdate,
)

router = APIRouter(prefix="/expense-categories", tags=["expense-categories"])
repo = CRUDRepository(ExpenseCategory)

# Справочник категорий живёт вместе с расходами: кто видит расходы — видит
# категории, кто их заводит — заводит и категории «на ходу» из формы расхода.
Reader = Annotated[User, Depends(require_permissions(Permission.EXPENSES_VIEW))]
Writer = Annotated[User, Depends(require_permissions(Permission.EXPENSES_MANAGE))]


@router.get("", response_model=Page[ExpenseCategoryRead])
async def list_categories(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[ExpenseCategoryRead]:
    items, total = await repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={"is_active": is_active},
        order_by=ExpenseCategory.name.asc(),
    )
    return Page[ExpenseCategoryRead](
        items=[ExpenseCategoryRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.post("", response_model=ExpenseCategoryRead, status_code=201)
async def create_category(
    data: ExpenseCategoryCreate, actor: Writer, db: DbSession
) -> ExpenseCategoryRead:
    obj = await repo.create(db, data.model_dump())
    await db.commit()
    await db.refresh(obj)
    return ExpenseCategoryRead.model_validate(obj)


@router.get("/{category_id}", response_model=ExpenseCategoryRead)
async def get_category(
    category_id: uuid.UUID, actor: Reader, db: DbSession
) -> ExpenseCategoryRead:
    obj = await repo.get(db, category_id)
    if obj is None:
        raise NotFoundError("Категория не найдена")
    return ExpenseCategoryRead.model_validate(obj)


@router.patch("/{category_id}", response_model=ExpenseCategoryRead)
async def update_category(
    category_id: uuid.UUID, data: ExpenseCategoryUpdate, actor: Writer, db: DbSession
) -> ExpenseCategoryRead:
    obj = await repo.get(db, category_id)
    if obj is None:
        raise NotFoundError("Категория не найдена")
    await repo.update(db, obj, data.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(obj)
    return ExpenseCategoryRead.model_validate(obj)
