"""Универсальный асинхронный CRUD-репозиторий.

Инкапсулирует типовые операции для справочников: list (с пагинацией, поиском и
простыми фильтрами), get, create, update, delete (hard или soft).
Коммит транзакции — на стороне вызывающего кода.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Generic, Sequence, TypeVar

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

M = TypeVar("M", bound=Base)


class CRUDRepository(Generic[M]):
    def __init__(self, model: type[M], *, soft_delete: bool = False) -> None:
        self.model = model
        self.soft_delete = soft_delete

    def _alive(self) -> list[ColumnElement[bool]]:
        if self.soft_delete:
            return [self.model.deleted_at.is_(None)]  # type: ignore[attr-defined]
        return []

    async def get(self, session: AsyncSession, obj_id: uuid.UUID) -> M | None:
        obj = await session.get(self.model, obj_id)
        if obj is None:
            return None
        if self.soft_delete and obj.deleted_at is not None:  # type: ignore[attr-defined]
            return None
        return obj

    async def list(
        self,
        session: AsyncSession,
        *,
        offset: int,
        limit: int,
        filters: dict[str, Any] | None = None,
        search: str | None = None,
        search_fields: Sequence[str] = (),
        order_by: ColumnElement[Any] | None = None,
        extra: Sequence[ColumnElement[bool]] = (),
    ) -> tuple[list[M], int]:
        conditions: list[ColumnElement[bool]] = [*self._alive(), *extra]

        if filters:
            for column, value in filters.items():
                if value is not None:
                    conditions.append(getattr(self.model, column) == value)

        if search and search_fields:
            pattern = f"%{search.strip()}%"
            conditions.append(
                or_(*[getattr(self.model, field).ilike(pattern) for field in search_fields])
            )

        total = (
            await session.execute(
                select(func.count()).select_from(self.model).where(*conditions)
            )
        ).scalar_one()

        order = order_by if order_by is not None else self.model.created_at.desc()  # type: ignore[attr-defined]
        items = (
            await session.execute(
                select(self.model).where(*conditions).order_by(order).offset(offset).limit(limit)
            )
        ).scalars().all()

        return list(items), total

    async def create(self, session: AsyncSession, data: dict[str, Any]) -> M:
        obj = self.model(**data)
        session.add(obj)
        await session.flush()
        return obj

    async def update(self, session: AsyncSession, obj: M, data: dict[str, Any]) -> M:
        for field, value in data.items():
            setattr(obj, field, value)
        await session.flush()
        return obj

    async def delete(self, session: AsyncSession, obj: M) -> None:
        if self.soft_delete:
            obj.deleted_at = datetime.now(timezone.utc)  # type: ignore[attr-defined]
            await session.flush()
        else:
            await session.delete(obj)
            await session.flush()
