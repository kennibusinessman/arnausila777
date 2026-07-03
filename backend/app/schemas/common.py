"""Общие схемы: пагинация, обёртка страницы, простое сообщение."""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Message(BaseModel):
    detail: str


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    # Потолок 1000 (а не 100): страницы-справочники («Остатки», выпадающие списки
    # товаров/клиентов/складов) грузят весь набор одной страницей. При каталоге в
    # сотни позиций лимит 100 молча терял «хвост» — товар был в «Товарах», но
    # пропадал из «Остатков» и из поиска в заказе.
    size: int = Field(default=20, ge=1, le=1000)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        return self.size


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
