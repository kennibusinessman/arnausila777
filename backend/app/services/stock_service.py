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

from sqlalchemy import ColumnElement, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ItemType, MovementType, SourceType
from app.core.exceptions import BadRequestError, InsufficientStockError, NotFoundError
from app.models import StockBalance, StockMovement
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
        raise InsufficientStockError(
            f"Недостаточно остатка: есть {current}, требуется {quantity}"
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
        raise InsufficientStockError(
            f"Удаление сделает остаток отрицательным: сейчас {current}, "
            f"после удаления было бы {reversed_quantity}"
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
