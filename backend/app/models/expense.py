"""Расходы и категории расходов.

Расход — простая запись по факту (без согласования): один раз внесли —
значит он уже совершён. Дата фиксации/«ответственный» — справочные поля.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ExpenseCategoryType
from app.models.base import MONEY, Base, SoftDeleteMixin, TimestampMixin, UUIDMixin, str_enum

if TYPE_CHECKING:
    from app.models.user import User


class ExpenseCategory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[ExpenseCategoryType] = mapped_column(str_enum(ExpenseCategoryType))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))

    expenses: Mapped[list[Expense]] = relationship(back_populates="category")


class Expense(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_expense_date", "expense_date"),)

    name: Mapped[str] = mapped_column(String(255))
    expense_date: Mapped[date] = mapped_column(Date)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("expense_categories.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    # Заполнен → это авто-расход себестоимости сырья по заказу (создаётся/меняется/
    # удаляется вместе с заказом, см. order_service). Такой расход нельзя править
    # вручную, чтобы не разошёлся с заказом.
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"), index=True)

    category: Mapped[ExpenseCategory] = relationship(back_populates="expenses")
    creator: Mapped[User] = relationship(foreign_keys=[created_by])
    responsible: Mapped[User | None] = relationship(foreign_keys=[responsible_id])
