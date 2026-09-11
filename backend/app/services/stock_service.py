"""Ядро склада: журнал движений + кэш остатков.

Единственная точка изменения склада. Остаток (`StockBalance`) никогда не правится
напрямую — только через `apply_movement`, которое в одной транзакции создаёт запись
в `stock_movements` и обновляет кэш. Commit выполняет вызывающий код, поэтому функцию
можно встраивать в более крупные атомарные операции (утверждение смены, отгрузка,
закупка).
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ItemType, MovementType, SourceType, WarehouseType
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    InsufficientStockError,
    NotFoundError,
)
from app.models import Material, Product, StockBalance, StockMovement, Warehouse
from app.schemas.stock import (
    InventoryApply,
    InventoryChange,
    InventoryItemRead,
    InventoryResult,
)
from app.services import audit_service

# Знак движения: приход (+) или расход (−).
_IN_TYPES = frozenset(
    {
        MovementType.PURCHASE_IN,
        MovementType.PRODUCTION_IN,
        MovementType.ADJUSTMENT_IN,
        MovementType.RETURN_IN,
    }
)
_OUT_TYPES = frozenset(
    {
        MovementType.PRODUCTION_OUT,
        MovementType.SALE_OUT,
        MovementType.ADJUSTMENT_OUT,
        MovementType.DEFECT_OUT,
    }
)


def movement_sign(movement_type: MovementType) -> int:
    return 1 if movement_type in _IN_TYPES else -1


def _validate_item(item_type: ItemType, product_id: uuid.UUID | None, material_id: uuid.UUID | None) -> None:
    if item_type is ItemType.PRODUCT and not (product_id is not None and material_id is None):
        raise BadRequestError("Для item_type=PRODUCT нужен product_id (и пустой material_id)")
    if item_type is ItemType.MATERIAL and not (material_id is not None and product_id is None):
        raise BadRequestError("Для item_type=MATERIAL нужен material_id (и пустой product_id)")


def _item_match(
    item_type: ItemType, product_id: uuid.UUID | None, material_id: uuid.UUID | None
) -> list[ColumnElement[bool]]:
    cond: list[ColumnElement[bool]] = [StockBalance.item_type == item_type]
    cond.append(
        StockBalance.product_id == product_id
        if product_id is not None
        else StockBalance.product_id.is_(None)
    )
    cond.append(
        StockBalance.material_id == material_id
        if material_id is not None
        else StockBalance.material_id.is_(None)
    )
    return cond


async def _item_label(
    session: AsyncSession,
    item_type: ItemType,
    product_id: uuid.UUID | None,
    material_id: uuid.UUID | None,
) -> str:
    """Название позиции для сообщений об ошибках — без него «есть 0, требуется 2»
    не говорит, чего именно не хватает."""
    obj: Product | Material | None = None
    if item_type is ItemType.PRODUCT and product_id is not None:
        obj = await session.get(Product, product_id)
    elif item_type is ItemType.MATERIAL and material_id is not None:
        obj = await session.get(Material, material_id)
    if obj is not None:
        return f"«{obj.name}»"
    return str(product_id or material_id or "позиция")


async def _get_balance_row(
    session: AsyncSession,
    warehouse_id: uuid.UUID,
    item_type: ItemType,
    product_id: uuid.UUID | None,
    material_id: uuid.UUID | None,
) -> StockBalance | None:
    return (
        await session.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == warehouse_id,
                *_item_match(item_type, product_id, material_id),
            )
        )
    ).scalar_one_or_none()


async def get_balance(
    session: AsyncSession,
    warehouse_id: uuid.UUID,
    item_type: ItemType,
    product_id: uuid.UUID | None = None,
    material_id: uuid.UUID | None = None,
) -> Decimal:
    row = await _get_balance_row(session, warehouse_id, item_type, product_id, material_id)
    return row.quantity if row is not None else Decimal("0")


async def apply_movement(
    session: AsyncSession,
    *,
    warehouse_id: uuid.UUID,
    item_type: ItemType,
    movement_type: MovementType,
    quantity: Decimal,
    unit: str,
    source_type: SourceType,
    created_by: uuid.UUID,
    product_id: uuid.UUID | None = None,
    material_id: uuid.UUID | None = None,
    source_id: uuid.UUID | None = None,
    unit_cost: Decimal | None = None,
    comment: str | None = None,
) -> StockMovement:
    if quantity <= 0:
        raise BadRequestError("Количество должно быть положительным")
    _validate_item(item_type, product_id, material_id)

    sign = movement_sign(movement_type)
    row = await _get_balance_row(session, warehouse_id, item_type, product_id, material_id)
    current = row.quantity if row is not None else Decimal("0")
    new_quantity = current + quantity * sign

    if sign < 0 and not settings.ALLOW_NEGATIVE_STOCK and new_quantity < 0:
        label = await _item_label(session, item_type, product_id, material_id)
        suffix = f" {unit}" if unit else ""
        raise InsufficientStockError(
            f"Недостаточно остатка {label}: "
            f"есть {current}{suffix}, требуется {quantity}{suffix}"
        )

    total_cost = unit_cost * quantity if unit_cost is not None else None
    movement = StockMovement(
        warehouse_id=warehouse_id,
        item_type=item_type,
        product_id=product_id,
        material_id=material_id,
        movement_type=movement_type,
        quantity=quantity,
        unit=unit,
        unit_cost=unit_cost,
        total_cost=total_cost,
        source_type=source_type,
        source_id=source_id,
        comment=comment,
        created_by=created_by,
    )
    session.add(movement)

    if row is None:
        session.add(
            StockBalance(
                warehouse_id=warehouse_id,
                item_type=item_type,
                product_id=product_id,
                material_id=material_id,
                quantity=new_quantity,
            )
        )
    else:
        row.quantity = new_quantity

    await session.flush()
    return movement


async def delete_movement(
    session: AsyncSession, actor_id: uuid.UUID, movement_id: uuid.UUID
) -> None:
    """Удаляет запись движения и реверсирует её эффект на кэш остатка (расширенное
    право — только супер-админ). Запрещено, если реверс уведёт остаток в минус —
    то же правило, что и в apply_movement, просто в обратную сторону."""
    movement = await session.get(StockMovement, movement_id)
    if movement is None:
        raise NotFoundError("Движение не найдено")

    row = await _get_balance_row(
        session, movement.warehouse_id, movement.item_type, movement.product_id, movement.material_id
    )
    sign = movement_sign(movement.movement_type)
    current = row.quantity if row is not None else Decimal("0")
    reversed_quantity = current - movement.quantity * sign

    if reversed_quantity < 0 and not settings.ALLOW_NEGATIVE_STOCK:
        label = await _item_label(
            session, movement.item_type, movement.product_id, movement.material_id
        )
        raise InsufficientStockError(
            f"Удаление сделает остаток {label} отрицательным: "
            f"сейчас {current}, после удаления было бы {reversed_quantity}"
        )

    warehouse_id, movement_type, quantity = (
        movement.warehouse_id,
        movement.movement_type,
        movement.quantity,
    )

    if row is not None:
        row.quantity = reversed_quantity

    await session.delete(movement)
    await audit_service.log(
        session,
        user_id=actor_id,
        action="DELETE_STOCK_MOVEMENT",
        entity_type="StockMovement",
        entity_id=movement_id,
        old={
            "warehouse_id": str(warehouse_id),
            "movement_type": movement_type.value,
            "quantity": str(quantity),
        },
    )
    await session.commit()


async def reverse_source_movements(
    session: AsyncSession, *, source_type: SourceType, source_id: uuid.UUID
) -> None:
    """Отменяет эффект всех движений данного источника и удаляет их записи (без commit).

    Применяется при правке уже проведённого документа (утверждённый сменный отчёт,
    подтверждённый заказ): сначала откатываем старые движения к исходному остатку,
    затем вызывающий код применяет новые. Если откат увёл бы остаток в минус
    (приход уже израсходован дальше по цепочке) и ALLOW_NEGATIVE_STOCK выключен —
    бросаем InsufficientStockError, и вся транзакция правки откатывается."""
    movements = list(
        (
            await session.execute(
                select(StockMovement).where(
                    StockMovement.source_type == source_type,
                    StockMovement.source_id == source_id,
                )
            )
        ).scalars().all()
    )
    # Сначала откатываем расходные движения (их отмена возвращает остаток), затем
    # приходные (их отмена его уменьшает) — иначе для одной позиции с приходом и
    # расходом (напр. выпуск + брак в смене) промежуточный остаток ушёл бы в
    # ложный минус и мы бросили бы 409, хотя чистого дефицита нет.
    movements.sort(key=lambda mv: movement_sign(mv.movement_type))
    for mv in movements:
        row = await _get_balance_row(
            session, mv.warehouse_id, mv.item_type, mv.product_id, mv.material_id
        )
        current = row.quantity if row is not None else Decimal("0")
        reversed_quantity = current - mv.quantity * movement_sign(mv.movement_type)
        if reversed_quantity < 0 and not settings.ALLOW_NEGATIVE_STOCK:
            raise InsufficientStockError(
                "Нельзя изменить документ: связанный остаток уже израсходован "
                "(после отката он ушёл бы в минус)"
            )
        if row is not None:
            row.quantity = reversed_quantity
        await session.delete(mv)
    await session.flush()


# Склад, куда приходуется излишок при инвентаризации, — как и везде, подбирается
# автоматически по типу позиции (см. order_service._resolve_finished_warehouse).
_INVENTORY_WAREHOUSE_TYPES: dict[ItemType, tuple[WarehouseType, ...]] = {
    ItemType.PRODUCT: (WarehouseType.FINISHED_GOODS, WarehouseType.MIXED),
    ItemType.MATERIAL: (WarehouseType.RAW_MATERIALS, WarehouseType.MIXED),
}


async def _default_warehouse_id(session: AsyncSession, item_type: ItemType) -> uuid.UUID | None:
    """Самый старый активный склад подходящего типа (None — такого склада нет)."""
    return (
        await session.execute(
            select(Warehouse.id)
            .where(
                Warehouse.is_active.is_(True),
                Warehouse.type.in_(_INVENTORY_WAREHOUSE_TYPES[item_type]),
            )
            .order_by(Warehouse.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _fmt_qty(value: Decimal) -> str:
    """120.000 → «120», 12.500 → «12.5» — для комментария движения и журнала аудита."""
    return format(value.normalize(), "f")


async def inventory_items(session: AsyncSession) -> list[InventoryItemRead]:
    """Все живые товары и сырьё с остатком, суммарным по всем складам."""
    products = (
        await session.execute(select(Product).where(Product.deleted_at.is_(None)))
    ).scalars().all()
    materials = (
        await session.execute(select(Material).where(Material.deleted_at.is_(None)))
    ).scalars().all()
    totals: dict[tuple[ItemType, uuid.UUID], Decimal] = {}
    for item_type, product_id, material_id, quantity in (
        await session.execute(
            select(
                StockBalance.item_type,
                StockBalance.product_id,
                StockBalance.material_id,
                func.sum(StockBalance.quantity),
            ).group_by(StockBalance.item_type, StockBalance.product_id, StockBalance.material_id)
        )
    ).all():
        totals[(item_type, product_id or material_id)] = Decimal(quantity or 0)

    rows = [
        InventoryItemRead(
            item_type=ItemType.PRODUCT,
            item_id=p.id,
            name=p.name,
            category=p.category,
            subcategory=p.subcategory,
            unit=p.unit,
            is_active=p.is_active,
            quantity=totals.get((ItemType.PRODUCT, p.id), Decimal("0")),
        )
        for p in products
    ]
    rows += [
        InventoryItemRead(
            item_type=ItemType.MATERIAL,
            item_id=m.id,
            name=m.name,
            category=m.category,
            subcategory=None,
            unit=m.unit,
            is_active=m.is_active,
            quantity=totals.get((ItemType.MATERIAL, m.id), Decimal("0")),
        )
        for m in materials
    ]
    return rows


async def apply_inventory(
    session: AsyncSession, actor_id: uuid.UUID, data: InventoryApply
) -> InventoryResult:
    """Инвентаризация: для каждой позиции задан фактический остаток, а приход/расход
    на разницу проводится автоматически — одной транзакцией на весь запрос.

    Излишек приходуется (ADJUSTMENT_IN) на склад по умолчанию для типа позиции.
    Недостача списывается (ADJUSTMENT_OUT) сначала со склада по умолчанию, затем с
    остальных, где позиция есть, — поэтому в минус не уходит ни один склад, а
    итог по позиции становится ровно тем, что ввёл пользователь."""
    keys = [(line.item_type, line.item_id) for line in data.items]
    if len(set(keys)) != len(keys):
        raise BadRequestError("Одна и та же позиция указана в инвентаризации дважды")

    # Сначала всё проверяем и только потом двигаем склад: при расхождении с тем,
    # что видел пользователь, не должно проводиться ничего.
    plan: list[tuple[Product | Material, ItemType, list[StockBalance], Decimal, Decimal]] = []
    conflicts: list[str] = []
    for line in data.items:
        model = Product if line.item_type is ItemType.PRODUCT else Material
        item = await session.get(model, line.item_id)
        if item is None or item.deleted_at is not None:
            raise NotFoundError("Позиция не найдена — возможно, её удалили")
        id_column = (
            StockBalance.product_id if line.item_type is ItemType.PRODUCT else StockBalance.material_id
        )
        rows = list(
            (
                await session.execute(
                    select(StockBalance).where(
                        StockBalance.item_type == line.item_type, id_column == line.item_id
                    )
                )
            ).scalars().all()
        )
        current = sum((r.quantity for r in rows), Decimal("0"))
        if line.expected_quantity is not None and current != line.expected_quantity:
            conflicts.append(
                f"«{item.name}»: было {_fmt_qty(line.expected_quantity)}, сейчас {_fmt_qty(current)}"
            )
            continue
        if line.quantity != current:
            plan.append((item, line.item_type, rows, current, line.quantity))

    if conflicts:
        raise ConflictError(
            "Остаток изменился, пока вы редактировали: "
            + "; ".join(conflicts)
            + ". Проверьте значения и сохраните ещё раз."
        )

    note = (data.comment or "").strip()
    changes: list[InventoryChange] = []
    movements_created = 0
    default_whs = {t: await _default_warehouse_id(session, t) for t in {p[1] for p in plan}}
    for item, item_type, rows, before, after in plan:
        comment = f"Инвентаризация: было {_fmt_qty(before)}, стало {_fmt_qty(after)} {item.unit}"
        if note:
            comment = f"{comment}. {note}"
        ids = (
            {"product_id": item.id} if item_type is ItemType.PRODUCT else {"material_id": item.id}
        )
        default_wh = default_whs[item_type]
        delta = after - before

        if delta > 0:
            if default_wh is None:
                raise BadRequestError(
                    "Не найден активный склад "
                    + ("готовой продукции" if item_type is ItemType.PRODUCT else "сырья")
                )
            await apply_movement(
                session,
                warehouse_id=default_wh,
                item_type=item_type,
                movement_type=MovementType.ADJUSTMENT_IN,
                quantity=delta,
                unit=item.unit,
                source_type=SourceType.MANUAL_ADJUSTMENT,
                created_by=actor_id,
                comment=comment,
                **ids,
            )
            movements_created += 1
        else:
            need = -delta
            # Склад по умолчанию первым, затем остальные — где позиции больше.
            sources = sorted(
                (r for r in rows if r.quantity > 0),
                key=lambda r: (r.warehouse_id != default_wh, -r.quantity),
            )
            for row in sources:
                take = min(row.quantity, need)
                await apply_movement(
                    session,
                    warehouse_id=row.warehouse_id,
                    item_type=item_type,
                    movement_type=MovementType.ADJUSTMENT_OUT,
                    quantity=take,
                    unit=item.unit,
                    source_type=SourceType.MANUAL_ADJUSTMENT,
                    created_by=actor_id,
                    comment=comment,
                    **ids,
                )
                movements_created += 1
                need -= take
                if need <= 0:
                    break
            if need > 0:  # не бывает: сумма плюсовых остатков не меньше итога
                raise InsufficientStockError(f"Не удалось списать недостачу «{item.name}»")

        await audit_service.log(
            session,
            user_id=actor_id,
            action="STOCK_INVENTORY",
            entity_type="Product" if item_type is ItemType.PRODUCT else "Material",
            entity_id=item.id,
            old={"name": item.name, "quantity": _fmt_qty(before)},
            new={"quantity": _fmt_qty(after), **({"comment": note} if note else {})},
        )
        changes.append(
            InventoryChange(
                item_type=item_type,
                item_id=item.id,
                name=item.name,
                unit=item.unit,
                before=before,
                after=after,
            )
        )

    await session.commit()
    return InventoryResult(changes=changes, movements_created=movements_created)


async def recalc_balances(session: AsyncSession) -> int:
    """Пересчитывает кэш остатков из журнала движений. Возвращает число строк."""
    await session.execute(delete(StockBalance))
    movements = (await session.execute(select(StockMovement))).scalars().all()

    agg: dict[tuple, Decimal] = {}
    for mv in movements:
        key = (mv.warehouse_id, mv.item_type, mv.product_id, mv.material_id)
        agg[key] = agg.get(key, Decimal("0")) + mv.quantity * movement_sign(mv.movement_type)

    for (warehouse_id, item_type, product_id, material_id), quantity in agg.items():
        session.add(
            StockBalance(
                warehouse_id=warehouse_id,
                item_type=item_type,
                product_id=product_id,
                material_id=material_id,
                quantity=quantity,
            )
        )
    await session.commit()
    return len(agg)
