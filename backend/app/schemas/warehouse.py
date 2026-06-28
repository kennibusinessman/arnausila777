"""Схемы складов."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import WarehouseType


class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: WarehouseType
    is_active: bool = True


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: WarehouseType | None = None
    is_active: bool | None = None


class WarehouseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: WarehouseType
    is_active: bool
    created_at: datetime
