"""План производства спанбонда: очередь, полипропилен, сроки и общий план по цветам.

Задания — те же `ProductionTask`, только `kind = SPUNBOND`; позиции — товары
категории «Спанбонд» (рулоны, бабины). Создание, правка, «готово»/«отгружено» и
связь с заказами — общие, в production_plan_service.

Расчёт по активным заданиям сверху вниз по очереди:

- осталось сделать = заказано − готово (в единицах товара: кг или шт);
- сырья нужно = кг продукции (1 кг полипропилена = 1 кг продукции): товар в кг —
  как есть, в штуках — × вес единицы из карточки. Нет веса — позицию не посчитать;
- полипропилен на складе расходуется накопительно — позиция ниже получает остаток;
- дата готовности — накопительно по выработке линии (кг за смену × смен в сутки).

Общий план по цветам = позиции очереди + бабины, которых не хватает плану
простыней. Бабины, уже поставленные в очередь спанбонда, из второй части
вычитаются (сверху вниз по очереди простыней), чтобы не считать их дважды.
"""
from __future__ import annotations

import math
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import SPUNBOND_CATEGORY, guess_color, norm
from app.core.enums import ItemType, ProductionTaskKind
from app.models import Material, Product, StockBalance
from app.schemas.production_plan import (
    ColorEntry,
    ColorPlan,
    ItemRow,
    PlanOptions,
    PlanProductOption,
    RawStock,
    SpunbondPlanResponse,
    SpunbondSettings,
    TaskRow,
)
from app.services import settings_service
from app.services.production_plan_service import (
    _active_tasks,
    _closed_tasks,
    _free_and_offers,
    _free_stock,
    _item_row,
    _load_context,
    _q,
    _stock_by_product,
    _task_row,
    build_plan,
)

KIND = ProductionTaskKind.SPUNBOND
RAW_STEM = "полипроп"
_KG_UNITS = {"кг", "kg", "килограмм"}


def kg_per_unit(product: Product | None) -> Decimal | None:
    """Сколько кг сырья уходит на единицу товара; None — вес неизвестен."""
    if product is None:
        return None
    if norm(product.unit).rstrip(".") in _KG_UNITS:
        return Decimal(1)
    if product.base_weight:
        return Decimal(product.base_weight)
    return None


async def _raw_stock(db: AsyncSession) -> list[RawStock]:
    """Полипропилен на складе — материалы с «полипроп» в названии, по всем складам."""
    materials = (
        await db.execute(
            select(Material).where(
                Material.deleted_at.is_(None), func.lower(Material.name).contains(RAW_STEM)
            )
        )
    ).scalars().all()
    if not materials:
        return []
    rows = await db.execute(
        select(StockBalance.material_id, func.sum(StockBalance.quantity))
        .where(
            StockBalance.item_type == ItemType.MATERIAL,
            StockBalance.material_id.in_([m.id for m in materials]),
        )
        .group_by(StockBalance.material_id)
    )
    qty = {mid: Decimal(q or 0) for mid, q in rows.all()}
    return [
        RawStock(material_id=m.id, name=m.name, on_stock=qty.get(m.id, Decimal(0)))
        for m in sorted(materials, key=lambda m: m.name)
    ]


async def options(db: AsyncSession) -> PlanOptions:
    """Всё из категории «Спанбонд» — рулоны и бабины."""
    stock = await _stock_by_product(db)
    products = (
        await db.execute(
            select(Product).where(Product.deleted_at.is_(None), Product.is_active.is_(True))
        )
    ).scalars().all()
    own = [p for p in products if norm(p.category) == norm(SPUNBOND_CATEGORY)]
    return PlanOptions(
        products=[
            PlanProductOption(
                id=p.id,
                name=p.name,
                unit=p.unit,
                bobbins=[],
                subcategory=p.subcategory,
                color=guess_color(p.name),
                kg_per_unit=kg_per_unit(p),
                on_stock=stock.get(p.id, Decimal(0)),
            )
            for p in sorted(own, key=lambda p: (p.subcategory or "", p.name))
        ]
    )


async def build(db: AsyncSession, today: date | None = None) -> SpunbondPlanResponse:
    today = today or date.today()
    cfg = await settings_service.get_settings(db)
    per_shift = Decimal(cfg.spunbond_kg_per_shift)
    per_day = Decimal(cfg.spunbond_kg_per_shift * cfg.spunbond_shifts_per_day)

    active = await _active_tasks(db, KIND)
    closed = await _closed_tasks(db, KIND)
    all_active = await _active_tasks(db)
    names, clients, orders_by_item = await _load_context(db, active + closed)
    stock = await _stock_by_product(db)
    raw = await _raw_stock(db)
    raw_on_stock = sum((r.on_stock for r in raw), Decimal(0))

    def eta_for(cum_kg: Decimal) -> date:
        return today + timedelta(days=math.ceil(cum_kg / per_day) - 1)

    rows: list[TaskRow] = []
    entries: dict[str | None, list[ColorEntry]] = {}
    cum_kg = Decimal(0)
    raw_used = Decimal(0)
    no_weight = 0
    # Сколько бабин каждого наименования уже стоит в очереди спанбонда.
    planned_bobbins: dict[uuid.UUID, int] = {}

    for queue_no, t in enumerate(active, start=1):
        client_name = clients.get(t.client_id) if t.client_id else None
        items: list[ItemRow] = []
        for i in t.items:
            row = _item_row(i, names, orders_by_item)
            product = names.get(i.product_id)
            row.color = guess_color(row.product_name)
            items.append(row)
            if row.remaining == 0:
                row.raw_status = "done"
                continue
            planned_bobbins[i.product_id] = planned_bobbins.get(i.product_id, 0) + row.remaining
            per_unit = kg_per_unit(product)
            kg = _q(per_unit * row.remaining) if per_unit is not None else None
            if kg is None:
                no_weight += 1
                row.raw_status = "no_weight"
            else:
                row.kg_needed = kg
                cum_kg += kg
                row.shifts_needed = _q(kg / per_shift)
                row.eta = eta_for(cum_kg)
                left = max(raw_on_stock - raw_used, Decimal(0))
                raw_used += kg
                if left >= kg:
                    row.raw_status = "ok"
                else:
                    row.raw_short_kg = _q(kg - left)
                    row.raw_status = "partial" if left > 0 else "none"
            entries.setdefault(row.color, []).append(
                ColorEntry(
                    source="queue",
                    task_id=t.id,
                    item_id=i.id,
                    queue_no=queue_no,
                    client_name=client_name,
                    comment=t.comment,
                    product_name=row.product_name,
                    quantity=row.remaining,
                    unit=row.unit,
                    kg=kg,
                    eta=row.eta,
                    deadline=t.deadline,
                    late=t.deadline is not None and row.eta is not None and row.eta > t.deadline,
                )
            )
        rows.append(_task_row(t, items, clients))
    for t in closed:
        rows.append(_task_row(t, [_item_row(i, names, orders_by_item) for i in t.items], clients))

    # Бабины, которых не хватает плану простыней, — за вычетом поставленных в очередь.
    sheets = await build_plan(db, today)
    bobbin_ids = [b.bobbin_id for b in sheets.bobbins if b.shortage > 0]
    bobbin_cards: dict[uuid.UUID, Product] = {}
    if bobbin_ids:
        bobbin_cards = {
            p.id: p
            for p in (
                await db.execute(select(Product).where(Product.id.in_(bobbin_ids)))
            ).scalars().all()
        }
    sheets_kg = Decimal(0)
    for b in sheets.bobbins:
        if b.shortage <= 0:
            continue
        covered = planned_bobbins.get(b.bobbin_id, 0)
        card = bobbin_cards.get(b.bobbin_id)
        per_unit = kg_per_unit(card)
        for u in b.uses:
            if u.short <= 0:
                continue
            take = min(covered, u.short)
            covered -= take
            short = u.short - take
            if short <= 0:
                continue
            kg = _q(per_unit * short) if per_unit is not None else None
            if kg is None:
                no_weight += 1
            else:
                sheets_kg += kg
            entries.setdefault(b.color, []).append(
                ColorEntry(
                    source="sheets",
                    task_id=u.task_id,
                    item_id=u.item_id,
                    queue_no=u.queue_no,
                    client_name=u.client_name,
                    comment=u.comment,
                    product_name=b.name,
                    quantity=short,
                    unit=card.unit if card else "шт",
                    kg=kg,
                    for_product=u.product_name,
                )
            )

    colors: list[ColorPlan] = []
    for color, es in entries.items():
        queue_kg = sum((e.kg for e in es if e.kg is not None and e.source == "queue"), Decimal(0))
        s_kg = sum((e.kg for e in es if e.kg is not None and e.source == "sheets"), Decimal(0))
        colors.append(
            ColorPlan(
                color=color,
                kg=queue_kg + s_kg,
                queue_kg=queue_kg,
                sheets_kg=s_kg,
                no_weight=sum(1 for e in es if e.kg is None),
                entries=es,
            )
        )
    # Больше всего работы — сверху; «без цвета» — в конце.
    colors.sort(key=lambda c: (c.color is None, -c.kg, c.color or ""))

    _, offers = _free_and_offers(active, rows, _free_stock(all_active, stock), names)
    need = cum_kg + sheets_kg
    return SpunbondPlanResponse(
        settings=SpunbondSettings(
            kg_per_shift=cfg.spunbond_kg_per_shift, shifts_per_day=cfg.spunbond_shifts_per_day
        ),
        tasks=rows,
        colors=colors,
        offers=offers,
        raw=raw,
        raw_on_stock=raw_on_stock,
        queue_kg=_q(cum_kg),
        sheets_kg=_q(sheets_kg),
        raw_short=_q(max(need - raw_on_stock, Decimal(0))),
        no_weight=no_weight,
        total_shifts=_q(cum_kg / per_shift),
        finish_date=eta_for(cum_kg) if cum_kg > 0 else None,
    )


async def update_settings(db: AsyncSession, data: SpunbondSettings) -> SpunbondSettings:
    cfg = await settings_service.get_settings(db)
    cfg.spunbond_kg_per_shift = data.kg_per_shift
    cfg.spunbond_shifts_per_day = data.shifts_per_day
    await db.commit()
    return data
