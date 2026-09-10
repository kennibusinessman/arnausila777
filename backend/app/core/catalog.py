"""Категории справочника, на которые завязана логика (не просто подписи в UI).

Категория и подкатегория товара — обычные строки в `Product.category` /
`Product.subcategory`, curated-список вариантов живёт во фронте
(`frontend/lib/utils/productCategories.ts`). Здесь только те значения, от
которых зависит поведение бэкенда, — сейчас это бабины: норма выхода рулонов
задаётся у позиций «Спанбонд» → «Бабины», и отчёт по бабинам ищет их же.

Сравнение регистронезависимое и без крайних пробелов: значения приходят из
формы и в базе могут отличаться регистром.
"""
from __future__ import annotations

SPUNBOND_CATEGORY = "Спанбонд"
BOBBIN_SUBCATEGORY = "Бабины"


def norm(value: str | None) -> str:
    return (value or "").strip().lower()


def is_bobbin(category: str | None, subcategory: str | None) -> bool:
    """Бабина = товар категории «Спанбонд» с подкатегорией «Бабины»."""
    return norm(category) == norm(SPUNBOND_CATEGORY) and norm(subcategory) == norm(
        BOBBIN_SUBCATEGORY
    )
