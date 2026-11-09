"""Схемы плана производства: простыни и спанбонд."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.enums import ProductionTaskKind, ProductionTaskStatus


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
    # Линия: простыни (по умолчанию) или спанбонд. После создания не меняется.
    kind: ProductionTaskKind = ProductionTaskKind.SHEETS
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
    # Целых бабин на позицию (с округлением вверх).
    bobbins_needed: int | None = None
    # ok — бабин на складе хватает с учётом позиций выше по очереди,
    # partial — частично, none — нет совсем, no_norm — у бабины нет нормы
    # или к наименованию не привязана ни одна бабина, done — делать нечего.
    bobbin_status: str | None = None
    bobbins_short: int | None = None
    # Из-за округления до целой бабины выйдет на столько простыней больше —
    # они останутся на складе.
    leftover_sheets: int | None = None
    shifts_needed: Decimal | None = None
    eta: date | None = None
    # --- Только спанбонд ---
    # Цвет из названия; None — не распознан.
    color: str | None = None
    # Сколько кг полипропилена нужно на оставшееся (1 кг сырья = 1 кг продукции);
    # None — у товара в штуках не указан вес.
    kg_needed: Decimal | None = None
    # ok / partial / none — хватит ли полипропилена с учётом позиций выше; no_weight — нет веса.
    raw_status: str | None = None
    raw_short_kg: Decimal | None = None


class TaskRow(BaseModel):
    id: uuid.UUID
    kind: ProductionTaskKind = ProductionTaskKind.SHEETS
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


class BobbinUse(BaseModel):
    """Одна позиция очереди, которая берёт эту бабину.

    Бабины целые: на позицию нужно ⌈осталось сделать / норма⌉. Склад
    расходуется сверху вниз по очереди.
    """

    task_id: uuid.UUID
    item_id: uuid.UUID
    # Номер задания в очереди (1 — первое), как на странице.
    queue_no: int
    client_name: str | None
    # Комментарий задания — у одного клиента бывает несколько (склад, другое ТОО…).
    comment: str | None = None
    product_name: str
    # Сколько простыней осталось сделать по позиции.
    sheets: int
    needed: int
    from_stock: int
    short: int
    # Лишние простыни из-за округления до целой бабины — останутся на складе.
    leftover_sheets: int


class BobbinNeed(BaseModel):
    bobbin_id: uuid.UUID
    name: str
    # Цвет из названия бабины/простыни; None — не распознан.
    color: str | None
    roll_norm: int
    on_stock: Decimal
    needed: int
    # Сколько целых бабин докупить, чтобы закрыть всю очередь.
    shortage: int
    # Всего лишних простыней по всем позициям — останутся на складе.
    leftover_sheets: int
    # Раскладка по позициям очереди — кому сколько и кому не хватает.
    uses: list[BobbinUse] = []


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
    # Популярность: штук ушло по утверждённым сменным отчётам и сколько раз
    # выбирали вручную в заданиях. По ней подбирается бабина по умолчанию.
    used: Decimal = Decimal(0)
    chosen: int = 0


class PlanProductOption(BaseModel):
    id: uuid.UUID
    name: str
    unit: str
    bobbins: list[PlanBobbinOption]
    # Для спанбонда: подкатегория, цвет и кг сырья на единицу (None — нет веса).
    subcategory: str | None = None
    color: str | None = None
    kg_per_unit: Decimal | None = None
    on_stock: Decimal | None = None


class PlanOptions(BaseModel):
    """Справочник для формы: наименования и привязанные к ним бабины."""

    products: list[PlanProductOption]


# ---------------------------------------------------------------------------
# План спанбонда
# ---------------------------------------------------------------------------


class SpunbondSettings(BaseModel):
    kg_per_shift: int = Field(gt=0)
    shifts_per_day: int = Field(gt=0, le=3)


class ColorEntry(BaseModel):
    """Строка общего плана по цветам.

    source = "queue" — позиция очереди спанбонда; "sheets" — бабины, которых не
    хватает плану простыней и которые ещё не поставлены в очередь спанбонда.
    """

    source: str
    task_id: uuid.UUID
    item_id: uuid.UUID
    queue_no: int
    client_name: str | None
    comment: str | None = None
    product_name: str
    quantity: int
    unit: str
    kg: Decimal | None
    eta: date | None = None
    deadline: date | None = None
    late: bool = False
    # Для source="sheets": простыня, под которую нужны бабины.
    for_product: str | None = None


class ColorPlan(BaseModel):
    color: str | None
    # Всего кг по цвету (без строк, где вес неизвестен).
    kg: Decimal
    queue_kg: Decimal
    sheets_kg: Decimal
    no_weight: int
    entries: list[ColorEntry]


class RawStock(BaseModel):
    material_id: uuid.UUID
    name: str
    on_stock: Decimal


class SpunbondPlanResponse(BaseModel):
    settings: SpunbondSettings
    tasks: list[TaskRow]
    colors: list[ColorPlan]
    offers: list[Offer]
    # Полипропилен на складе (все материалы с «полипроп» в названии).
    raw: list[RawStock]
    raw_on_stock: Decimal
    # Нужно сырья: на очередь спанбонда и на бабины для простыней.
    queue_kg: Decimal
    sheets_kg: Decimal
    raw_short: Decimal
    no_weight: int
    total_shifts: Decimal
    finish_date: date | None


class DemandRow(BaseModel):
    """Кому нужно наименование: одна позиция активного задания.

    via=direct — наименование заказано в задании напрямую (нужно = заказано −
    отгружено, из них `ready` уже отложено на складе для клиента);
    via=bobbin — это бабина, которая уйдёт на простыню `for_product_name`.
    Склад расходуется сверху вниз по очереди: `from_stock` — сколько покрывает
    склад, `short` — сколько не хватает.
    """

    task_id: uuid.UUID
    kind: ProductionTaskKind
    queue_no: int
    client_name: str | None
    comment: str | None = None
    deadline: date | None = None
    via: str
    for_product_name: str | None = None
    sheets: int | None = None
    needed: Decimal
    ready: Decimal = Decimal(0)
    from_stock: Decimal
    short: Decimal


class SheetBobbin(BaseModel):
    """Бабина, привязанная к простыне: сколько на складе и на сколько простыней
    хватит по норме выхода (None — норма не указана)."""

    bobbin_id: uuid.UUID
    name: str
    on_stock: Decimal
    roll_norm: int | None
    sheets_possible: int | None


class ProductDemand(BaseModel):
    product_id: uuid.UUID
    name: str
    unit: str
    on_stock: Decimal
    needed: Decimal
    short: Decimal
    rows: list[DemandRow]
    # Для простыни — её бабины на складе; у остальных товаров пусто.
    bobbins: list[SheetBobbin] = []
