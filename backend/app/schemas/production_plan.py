"""Схемы плана производства простыней."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.enums import ProductionTaskStatus


class TaskItemIn(BaseModel):
    """Позиция задания. При правке: `id` — существующая позиция, без `id` — новая."""

    id: uuid.UUID | None = None
    product_id: uuid.UUID
    bobbin_id: uuid.UUID | None = None
    quantity: int = Field(gt=0)
    # Ручная правка (например, поправить ошибку). Обычно меняются кнопками
    # «Готово» и «Отгрузить».
    ready: int | None = Field(default=None, ge=0)
    shipped: int | None = Field(default=None, ge=0)


class TaskCreate(BaseModel):
    client_id: uuid.UUID | None = None
    deadline: date | None = None
    comment: str | None = None
    items: list[TaskItemIn] = Field(min_length=1)


class TaskUpdate(BaseModel):
    client_id: uuid.UUID | None = None
    deadline: date | None = None
    comment: str | None = None
    status: ProductionTaskStatus | None = None
    # Если передан — заменяет позиции целиком (позиции без id в списке удаляются).
    items: list[TaskItemIn] | None = Field(default=None, min_length=1)


class ReorderRequest(BaseModel):
    """Новый порядок активных заданий — id сверху вниз."""

    ids: list[uuid.UUID] = Field(min_length=1)


class QuantityRequest(BaseModel):
    quantity: int = Field(gt=0)


class PlanSettings(BaseModel):
    sheets_per_shift: int = Field(gt=0)
    shifts_per_day: int = Field(gt=0, le=3)


class ItemOrder(BaseModel):
    """Заказ, который засчитался в отгрузку позиции."""

    order_id: uuid.UUID
    order_number: str
    quantity: int


class ItemRow(BaseModel):
    id: uuid.UUID
    line_no: int
    product_id: uuid.UUID
    product_name: str
    unit: str
    bobbin_id: uuid.UUID | None
    # Бабина, по которой идёт расчёт: выбранная в позиции или подобранная.
    plan_bobbin_id: uuid.UUID | None
    plan_bobbin_name: str | None
    roll_norm: int | None
    quantity: int
    ready: int
    shipped: int
    # Осталось сделать = заказано − готово.
    remaining: int
    # Готово, но ещё не отгружено — лежит на складе для клиента.
    awaiting_shipment: int
    # Из отгруженного — по каким заказам (остальное — ручные отметки).
    orders: list[ItemOrder] = []
    # Расчёт — только у активных заданий.
    bobbins_needed: Decimal | None = None
    # ok — бабин на складе хватает с учётом позиций выше по очереди,
    # partial — частично, none — нет совсем, no_norm — у бабины нет нормы
    # или к наименованию не привязана ни одна бабина, done — делать нечего.
    bobbin_status: str | None = None
    bobbins_short: Decimal | None = None
    shifts_needed: Decimal | None = None
    eta: date | None = None


class TaskRow(BaseModel):
    id: uuid.UUID
    position: int
    status: ProductionTaskStatus
    client_id: uuid.UUID | None
    client_name: str | None
    deadline: date | None
    comment: str | None
    items: list[ItemRow]
    quantity: int
    ready: int
    shipped: int
    remaining: int
    # Когда будет сделана последняя позиция.
    eta: date | None = None
    late: bool = False


class BobbinNeed(BaseModel):
    bobbin_id: uuid.UUID
    name: str
    roll_norm: int
    on_stock: Decimal
    needed: Decimal
    # Сколько целых бабин докупить/сделать, чтобы закрыть всю очередь.
    shortage: int
    # С последней начатой бабины останется ≈ столько штук (если очередь закрыта).
    leftover_sheets: int


class Offer(BaseModel):
    """«Есть свободных N шт — передать клиенту?»"""

    task_id: uuid.UUID
    item_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    client_id: uuid.UUID | None
    client_name: str | None
    free: Decimal
    quantity: int


class FreeStock(BaseModel):
    product_id: uuid.UUID
    product_name: str
    on_stock: Decimal
    reserved: int
    free: Decimal


class PlanResponse(BaseModel):
    settings: PlanSettings
    tasks: list[TaskRow]
    bobbins: list[BobbinNeed]
    offers: list[Offer]
    free_stock: list[FreeStock]
    total_remaining: int
    total_shifts: Decimal
    finish_date: date | None


class PlanBobbinOption(BaseModel):
    id: uuid.UUID
    name: str
    roll_norm: int | None
    on_stock: Decimal


class PlanProductOption(BaseModel):
    id: uuid.UUID
    name: str
    unit: str
    bobbins: list[PlanBobbinOption]


class PlanOptions(BaseModel):
    """Справочник для формы: наименования и привязанные к ним бабины."""

    products: list[PlanProductOption]
