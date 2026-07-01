"""Схемы системных настроек."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    raw_price_per_kg: Decimal


class SettingsUpdate(BaseModel):
    raw_price_per_kg: Decimal = Field(ge=0)
