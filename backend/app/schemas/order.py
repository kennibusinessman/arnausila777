"""Схемы заказов.

Сервер сам считает `total_price` каждой позиции и `total_amount` заказа — клиент
суммы не присылает. `unit_price` в позиции необязателен: если не указан, берётся
`default_price` товара.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None


class OrderCreate(BaseModel):
    client_id: uuid.UUID
    deadline: date | None = None
    comment: str | None = None
    # Назначение менеджера доступно SA/B; для SaM выставляется автоматически.
    manager_id: uuid.UUID | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderUpdate(BaseModel):
    """Правка шапки заказа. Позиции неизменны после создания — они уже списаны
    со склада; чтобы поправить состав, удалите заказ (товар вернётся на склад)
    и создайте новый."""

    client_id: uuid.UUID | None = None
    deadline: date | None = None
    comment: str | None = None
    manager_id: uuid.UUID | None = None


class OrderItemPrice(BaseModel):
    id: uuid.UUID
    unit_price: Decimal = Field(ge=0)


class OrderPricing(BaseModel):
    """Доценка заказа: зав. склад создаёт заказ без цен (всё по 0), а менеджер/
    руководитель потом проставляют цены позиций. Пересчитывает сумму заказа и
    связанной отгрузки (выручка считается по отгрузкам)."""

    items: list[OrderItemPrice] = Field(min_length=1)


# --- Вложенные краткие представления для ответа ---

class _ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None
    unit: str
    base_weight: Decimal | None


class _ClientBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    company_name: str | None


class _UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: Decimal
    unit_price: Decimal
    total_price: Decimal
    comment: str | None
    product: _ProductBrief | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    client_id: uuid.UUID
    manager_id: uuid.UUID | None
    deadline: date | None
    comment: str | None
    total_amount: Decimal
    created_at: datetime
    client: _ClientBrief | None = None
    manager: _UserBrief | None = None
    items: list[OrderItemRead] = []


class OrderListItem(BaseModel):
    """Представление для списка — включает позиции (для колонки «Наименования»)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    client_id: uuid.UUID
    manager_id: uuid.UUID | None
    deadline: date | None
    total_amount: Decimal
    created_at: datetime
    client: _ClientBrief | None = None
    manager: _UserBrief | None = None
    items: list[OrderItemRead] = []
    # True → по заказу есть авто-расход себестоимости сырья (см. order_service).
    has_expense: bool = False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_weight(self) -> Decimal:
        """Суммарный вес заказа: quantity × Product.base_weight по позициям (кг)."""
        return sum(
            (
                item.quantity * item.product.base_weight
                for item in self.items
                if item.product is not None and item.product.base_weight is not None
            ),
            Decimal("0"),
        )


class OrderSummary(BaseModel):
    """Агрегаты по тем же фильтрам, что и список — для KPI-карточек периода."""

    count: int
    total_amount: Decimal
    total_weight: Decimal
