"""Бизнес-логика отгрузок (§5.4, упрощено — без статусов).

Отгрузка больше не самостоятельная сущность с жизненным циклом DRAFT→CONFIRMED:
она создаётся атомарно вместе с заказом (см. order_service.create_order) и сразу
списывает остаток готовой продукции со склада (SALE_OUT). Отдельного API для
создания/подтверждения/отмены нет — отгрузка доступна только на чтение.

Перед списанием проверяется наличие на складе всего состава заказа; если чего-то
не хватает — InsufficientStockError (409) с перечнем, какого именно товара и
сколько недостаёт (транзакцию откатывает вызывающий код, заказ не сохраняется).
Возврат на склад происходит при удалении заказа (reverse_shipment_stock, RETURN_IN).
Номер: SHP-YYYYMMDD-NNNN.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import ItemType, MovementType, SourceType, UserRole
from app.core.exceptions import InsufficientStockError, NotFoundError
from app.models import Order, Product, Shipment, ShipmentItem, User
from app.schemas.common import PageParams
from app.services import audit_service, stock_service


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


def _scope(actor: User) -> list[ColumnElement[bool]]:
    """SaM видит только отгрузки своих заказов (по manager_id заказа)."""
    if not _is_sales(actor):
        return []
    return [
        Shipment.order_id.in_(
            select(Order.id).where(Order.manager_id == actor.id)
        )
    ]


def _full_query():
    return select(Shipment).options(
        selectinload(Shipment.items).selectinload(ShipmentItem.product),
        selectinload(Shipment.order),
        selectinload(Shipment.client),
        selectinload(Shipment.warehouse),
    )


async def get_full(session: AsyncSession, actor: User, shipment_id: uuid.UUID) -> Shipment:
    shipment = (
        await session.execute(
            _full_query().where(Shipment.id == shipment_id, *_scope(actor))
        )
    ).scalar_one_or_none()
    if shipment is None or shipment.deleted_at is not None:
        raise NotFoundError("Отгрузка не найдена")
    return shipment


async def _generate_number(session: AsyncSession) -> str:
    today: date = datetime.now(timezone.utc).date()
    prefix = f"SHP-{today:%Y%m%d}-"
    count = (
        await session.execute(
            select(func.count())
            .select_from(Shipment)
            .where(Shipment.shipment_number.like(f"{prefix}%"))
        )
    ).scalar_one()
    return f"{prefix}{count + 1:04d}"


async def list_shipments(
    session: AsyncSession,
    actor: User,
    params: PageParams,
    *,
    order_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[Shipment], int]:
    conditions: list[ColumnElement[bool]] = [Shipment.deleted_at.is_(None), *_scope(actor)]
    if order_id is not None:
        conditions.append(Shipment.order_id == order_id)
    if client_id is not None:
        conditions.append(Shipment.client_id == client_id)
    if date_from is not None:
        conditions.append(Shipment.shipment_date >= date_from)
    if date_to is not None:
        conditions.append(Shipment.shipment_date <= date_to)

    total = (
        await session.execute(select(func.count()).select_from(Shipment).where(*conditions))
    ).scalar_one()
    items = (
        await session.execute(
            select(Shipment)
            .options(selectinload(Shipment.order), selectinload(Shipment.client))
            .where(*conditions)
            .order_by(Shipment.shipment_date.desc(), Shipment.created_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()
    return list(items), total


async def _check_stock(
    session: AsyncSession,
    warehouse_id: uuid.UUID,
    order: Order,
    products_by_id: dict[uuid.UUID, Product],
) -> None:
    """Проверяет, хватает ли остатка готовой продукции под весь состав заказа.

    Не хватает хотя бы одного товара — InsufficientStockError с перечнем, чего
    именно не хватает (товар: есть / требуется). При ALLOW_NEGATIVE_STOCK проверка
    отключена (склад может уходить в минус — единое правило с stock_service)."""
    if settings.ALLOW_NEGATIVE_STOCK:
        return

    required: dict[uuid.UUID, Decimal] = {}
    for item in order.items:
        required[item.product_id] = required.get(item.product_id, Decimal("0")) + item.quantity

    shortages: list[str] = []
    for product_id, need in required.items():
        available = await stock_service.get_balance(
            session, warehouse_id, ItemType.PRODUCT, product_id=product_id
        )
        if available < need:
            product = products_by_id.get(product_id)
            name = product.name if product is not None else str(product_id)
            unit = product.unit if product is not None else ""
            shortages.append(f"«{name}»: есть {available} {unit}, требуется {need}")

    if shortages:
        raise InsufficientStockError(
            "Недостаточно остатка на складе: " + "; ".join(shortages)
        )


async def create_shipment_for_order(
    session: AsyncSession,
    actor: User,
    order: Order,
    warehouse_id: uuid.UUID,
    shipment_date: date,
    comment: str | None,
    products_by_id: dict[uuid.UUID, Product],
) -> Shipment:
    """Создаёт отгрузку по составу заказа и атомарно списывает остаток (SALE_OUT).

    Сначала проверяет наличие всего состава (иначе 409 с перечнем нехватки) — до
    каких-либо изменений склада. Commit выполняет вызывающий код (order_service),
    поэтому при ошибке откатывается вся транзакция заказа."""
    await _check_stock(session, warehouse_id, order, products_by_id)

    items = [
        ShipmentItem(
            product_id=oi.product_id,
            quantity=oi.quantity,
            unit_price=oi.unit_price,
            total_price=oi.total_price,
        )
        for oi in order.items
    ]
    shipment = Shipment(
        shipment_number=await _generate_number(session),
        order_id=order.id,
        client_id=order.client_id,
        warehouse_id=warehouse_id,
        shipment_date=shipment_date,
        total_amount=order.total_amount,
        comment=comment,
        created_by=actor.id,
        items=items,
    )
    session.add(shipment)
    await session.flush()

    for item in items:
        product = products_by_id.get(item.product_id)
        await stock_service.apply_movement(
            session,
            warehouse_id=warehouse_id,
            item_type=ItemType.PRODUCT,
            movement_type=MovementType.SALE_OUT,
            quantity=item.quantity,
            unit=product.unit if product is not None else "",
            source_type=SourceType.SHIPMENT,
            created_by=actor.id,
            product_id=item.product_id,
            source_id=shipment.id,
            unit_cost=item.unit_price,
        )

    await audit_service.log(
        session,
        user_id=actor.id,
        action="CREATE_SHIPMENT",
        entity_type="Shipment",
        entity_id=shipment.id,
        new={
            "shipment_number": shipment.shipment_number,
            "order_id": str(order.id),
            "total_amount": str(order.total_amount),
        },
    )
    return shipment


async def reverse_shipment_stock(
    session: AsyncSession, actor: User, shipment: Shipment
) -> None:
    """Возвращает на склад всё, что было списано отгрузкой (RETURN_IN).

    Используется при удалении заказа. Commit выполняет вызывающий код."""
    for item in shipment.items:
        await stock_service.apply_movement(
            session,
            warehouse_id=shipment.warehouse_id,
            item_type=ItemType.PRODUCT,
            movement_type=MovementType.RETURN_IN,
            quantity=item.quantity,
            unit=item.product.unit,
            source_type=SourceType.SHIPMENT,
            created_by=actor.id,
            product_id=item.product_id,
            source_id=shipment.id,
            unit_cost=item.unit_price,
        )
