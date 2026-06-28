"""Схемы готовой продукции."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)
    subcategory: str | None = Field(default=None, max_length=100)
    unit: str = Field(min_length=1, max_length=50)
    default_price: Decimal = Field(default=Decimal("0"), ge=0)
    base_weight: Decimal | None = Field(default=None, ge=0)
    min_stock: Decimal = Field(default=Decimal("0"), ge=0)
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)
    subcategory: str | None = Field(default=None, max_length=100)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    default_price: Decimal | None = Field(default=None, ge=0)
    base_weight: Decimal | None = Field(default=None, ge=0)
    min_stock: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None
    category: str | None
    subcategory: str | None
    unit: str
    default_price: Decimal
    base_weight: Decimal | None
    min_stock: Decimal
    is_active: bool
    created_at: datetime


class CatalogItem(BaseModel):
    """Единая позиция каталога «Товары»: готовая продукция и сырьё в одном списке.

    `kind` различает сущность (product/material); `quantity` — суммарный остаток по
    всем складам. У сырья нет цены/веса — поля приходят нулём/None.
    """

    id: uuid.UUID
    kind: str  # "product" | "material"
    name: str
    sku: str | None
    category: str | None
    subcategory: str | None
    unit: str
    price: Decimal
    base_weight: Decimal | None
    min_stock: Decimal
    quantity: Decimal
    is_active: bool


class CatalogResponse(BaseModel):
    items: list[CatalogItem]
