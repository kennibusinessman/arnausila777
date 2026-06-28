"""Схемы сменных отчётов (§4, §5.2).

Мастер смены указывает только количества — склад в отчёте не выбирается. При
утверждении сырьё списывается с склада типа RAW_MATERIALS/MIXED, продукция
приходуется на FINISHED_GOODS/MIXED; при неоднозначности склад можно указать
явно в запросе approve. Склад на остатки никогда не меняется до утверждения.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ShiftReportStatus, ShiftType


# --- Вложенные позиции на вход ---

class WorkerIn(BaseModel):
    worker_id: uuid.UUID
    hours_worked: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None


class OutputIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0)
    defect_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    comment: str | None = None


class MaterialIn(BaseModel):
    """Строка расхода сырья. Указывается ровно одно из material_id / product_id:
    material_id — обычное сырьё (Полипропилен); product_id — спанбонд-полуфабрикат
    (Бабины / Дастархан сырьё), списываемый со склада готовой продукции."""

    material_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    quantity_used: Decimal = Field(gt=0)
    comment: str | None = None

    @model_validator(mode="after")
    def _exactly_one_ref(self) -> "MaterialIn":
        if (self.material_id is None) == (self.product_id is None):
            raise ValueError("Укажите ровно одно: material_id или product_id")
        return self


class ShiftReportCreate(BaseModel):
    shift_date: date
    shift_type: ShiftType
    comment: str | None = None
    downtime_hours: Decimal = Field(default=Decimal("0"), ge=0)
    # Назначение мастера доступно SA/B; для SM выставляется автоматически.
    master_id: uuid.UUID | None = None
    workers: list[WorkerIn] = []
    outputs: list[OutputIn] = []
    materials: list[MaterialIn] = []


class ShiftReportUpdate(BaseModel):
    """Правка черновика; любой из списков, если передан, заменяет состав целиком."""

    shift_date: date | None = None
    shift_type: ShiftType | None = None
    comment: str | None = None
    downtime_hours: Decimal | None = Field(default=None, ge=0)
    workers: list[WorkerIn] | None = None
    outputs: list[OutputIn] | None = None
    materials: list[MaterialIn] | None = None


class RejectRequest(BaseModel):
    comment: str = Field(min_length=1)


class ApproveRequest(BaseModel):
    # Нужны только если автоопределение склада по типу неоднозначно.
    raw_warehouse_id: uuid.UUID | None = None
    finished_warehouse_id: uuid.UUID | None = None


# --- Краткие представления для ответа ---

class _UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


class _ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None
    unit: str
    category: str | None = None
    subcategory: str | None = None


class _MaterialBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None
    unit: str


class WorkerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    worker_id: uuid.UUID
    hours_worked: Decimal | None
    comment: str | None
    worker: _UserBrief | None = None


class OutputRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: Decimal
    defect_quantity: Decimal
    comment: str | None
    product: _ProductBrief | None = None


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID | None
    product_id: uuid.UUID | None
    quantity_used: Decimal
    comment: str | None
    material: _MaterialBrief | None = None
    product: _ProductBrief | None = None


class ShiftReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_date: date
    shift_type: ShiftType
    master_id: uuid.UUID
    status: ShiftReportStatus
    comment: str | None
    downtime_hours: Decimal
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    created_at: datetime
    master: _UserBrief | None = None
    approver: _UserBrief | None = None
    workers: list[WorkerRead] = []
    outputs: list[OutputRead] = []
    materials: list[MaterialRead] = []


class ShiftReportListItem(BaseModel):
    """Представление для списка: облегчённое, но с составом выпуска/сырья —
    дашборд показывает категорию, произведённый вес и расход сырья прямо в таблице."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_date: date
    shift_type: ShiftType
    master_id: uuid.UUID
    status: ShiftReportStatus
    downtime_hours: Decimal
    approved_at: datetime | None
    created_at: datetime
    master: _UserBrief | None = None
    outputs: list[OutputRead] = []
    materials: list[MaterialRead] = []
