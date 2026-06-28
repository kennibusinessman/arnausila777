"""Бизнес-логика заказов (§5.5, упрощено — без статусов).

Заказ — запись по факту продажи: создание сразу проверяет остаток готовой
продукции и атомарно списывает его (через отгрузку, см. shipment_service).
Не хватает остатка — заказ целиком не создаётся (откат, 409). Никаких
статусов/подтверждений: один раз создали — значит уже отгрузили.
Позиции после создания неизменны (уже списаны со склада); чтобы поправить
состав — удалить заказ (товар вернётся на склад, см. delete_order) и создать
новый. SALES_MANAGER работает только со своими заказами и клиентами.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import UserRole, WarehouseType
from app.core.exceptions import BadRequestError, NotFoundError
from app.models import Client, Order, OrderItem, Product, Shipment, ShipmentItem, User, Warehouse
from app.schemas.common import PageParams
from app.schemas.order import OrderCreate, OrderItemCreate, OrderSummary, OrderUpdate
from app.services import audit_service, shipment_service


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


def _scope(actor: User) -> list[ColumnElement[bool]]:
    return [Order.manager_id == actor.id] if _is_sales(actor) else []


async def _generate_order_number(session: AsyncSession) -> str:
    """Формат ORD-YYYYMMDD-NNNN, порядковый номер в пределах дня."""
    today: date = datetime.now(timezone.utc).date()
    prefix = f"ORD-{today:%Y%m%d}-"
    count = (
        await session.execute(
            select(func.count())
            .select_from(Order)
            .where(Order.order_number.like(f"{prefix}%"))
        )
    ).scalar_one()
    return f"{prefix}{count + 1:04d}"


async def _resolve_client(session: AsyncSession, actor: User, client_id: uuid.UUID) -> Client:
    client = await session.get(Client, client_id)
    if client is None or client.deleted_at is not None:
        raise NotFoundError("Клиент не найден")
    if _is_sales(actor) and client.manager_id != actor.id:
        raise NotFoundError("Клиент не найден")
    return client


async def _resolve_finished_warehouse(session: AsyncSession) -> Warehouse:
    """Склад готовой продукции подбирается автоматически — пользователь его не
    выбирает (тот же подход, что и в shift_report_service)."""
    warehouse = (
        await session.execute(
            select(Warehouse)
            .where(
                Warehouse.is_active.is_(True),
                Warehouse.type.in_([WarehouseType.FINISHED_GOODS, WarehouseType.MIXED]),
            )
            .order_by(Warehouse.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if warehouse is None:
        raise BadRequestError("Не найден активный склад готовой продукции")
    return warehouse


async def _build_items(
    session: AsyncSession, items_in: list[OrderItemCreate]
) -> tuple[list[OrderItem], Decimal, dict[uuid.UUID, Product]]:
    """Создаёт позиции с расчётом цен; цена берётся из товара, если не задана."""
    product_ids = {i.product_id for i in items_in}
    products = (
        await session.execute(select(Product).where(Product.id.in_(product_ids)))
    ).scalars().all()
    by_id = {p.id: p for p in products}

    order_items: list[OrderItem] = []
    total = Decimal("0")
    for line in items_in:
        product = by_id.get(line.product_id)
        if product is None:
            raise BadRequestError(f"Товар {line.product_id} не найден")
        if not product.is_active:
            raise BadRequestError(f"Товар «{product.name}» неактивен")
        unit_price = line.unit_price if line.unit_price is not None else product.default_price
        total_price = (unit_price * line.quantity).quantize(Decimal("0.01"))
        order_items.append(
            OrderItem(
                product_id=product.id,
                quantity=line.quantity,
                unit_price=unit_price,
                total_price=total_price,
                comment=line.comment,
            )
        )
        total += total_price
    return order_items, total, by_id


def _full_query():
    return select(Order).options(
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.client),
        selectinload(Order.manager),
        selectinload(Order.shipments).selectinload(Shipment.items).selectinload(ShipmentItem.product),
    )


async def get_full(session: AsyncSession, actor: User, order_id: uuid.UUID) -> Order:
    order = (
        await session.execute(_full_query().where(Order.id == order_id, *_scope(actor)))
    ).scalar_one_or_none()
    if order is None or order.deleted_at is not None:
        raise NotFoundError("Заказ не найден")
    return order


def _list_conditions(
    actor: User,
    *,
    client_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    deadline_from: date | None = None,
    deadline_to: date | None = None,
    search: str | None = None,
) -> list[ColumnElement[bool]]:
    """Общие условия фильтрации для списка и агрегатов периода (§OrderSummary)."""
    conditions: list[ColumnElement[bool]] = [Order.deleted_at.is_(None), *_scope(actor)]
    if client_id is not None:
        conditions.append(Order.client_id == client_id)
    if manager_id is not None and not _is_sales(actor):
        conditions.append(Order.manager_id == manager_id)
    if date_from is not None:
        conditions.append(func.date(Order.created_at) >= date_from)
    if date_to is not None:
        conditions.append(func.date(Order.created_at) <= date_to)
    if deadline_from is not None:
        conditions.append(Order.deadline >= deadline_from)
    if deadline_to is not None:
        conditions.append(Order.deadline <= deadline_to)
    if search:
        conditions.append(
            Order.client_id.in_(select(Client.id).where(Client.name.ilike(f"%{search.strip()}%")))
        )
    return conditions


async def list_orders(
    session: AsyncSession,
    actor: User,
    params: PageParams,
    *,
    client_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    deadline_from: date | None = None,
    deadline_to: date | None = None,
    search: str | None = None,
    sort: str = "desc",
) -> tuple[list[Order], int]:
    conditions = _list_conditions(
        actor,
        client_id=client_id,
        manager_id=manager_id,
        date_from=date_from,
        date_to=date_to,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        search=search,
    )

    total = (
        await session.execute(select(func.count()).select_from(Order).where(*conditions))
    ).scalar_one()

    order_by = Order.created_at.asc() if sort == "asc" else Order.created_at.desc()
    items = (
        await session.execute(
            select(Order)
            .options(
                selectinload(Order.client),
                selectinload(Order.manager),
                selectinload(Order.items).selectinload(OrderItem.product),
            )
            .where(*conditions)
            .order_by(order_by)
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()
    return list(items), total


async def get_summary(
    session: AsyncSession,
    actor: User,
    *,
    client_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    deadline_from: date | None = None,
    deadline_to: date | None = None,
    search: str | None = None,
) -> OrderSummary:
    """Агрегаты count/сумма/позиции по тем же фильтрам, что и список — без пагинации."""
    conditions = _list_conditions(
        actor,
        client_id=client_id,
        manager_id=manager_id,
        date_from=date_from,
        date_to=date_to,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        search=search,
    )

    count, total_amount = (
        await session.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0)).where(
                *conditions
            )
        )
    ).one()

    total_weight = (
        await session.execute(
            select(func.coalesce(func.sum(OrderItem.quantity * Product.base_weight), 0))
            .select_from(Order)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(*conditions)
        )
    ).scalar_one()

    return OrderSummary(count=count, total_amount=total_amount, total_weight=total_weight)


async def create_order(session: AsyncSession, actor: User, data: OrderCreate) -> Order:
    """Атомарно: заказ + отгрузка всего состава + списание остатка (SALE_OUT).
    Не хватает остатка хотя бы одной позиции — InsufficientStockError (409),
    транзакция целиком откатывается (ничего не сохраняется)."""
    await _resolve_client(session, actor, data.client_id)

    if _is_sales(actor):
        manager_id = actor.id
    else:
        manager_id = data.manager_id or actor.id

    items, total, products_by_id = await _build_items(session, data.items)
    order = Order(
        order_number=await _generate_order_number(session),
        client_id=data.client_id,
        manager_id=manager_id,
        deadline=data.deadline,
        comment=data.comment,
        total_amount=total,
        items=items,
    )
    session.add(order)
    await session.flush()

    warehouse = await _resolve_finished_warehouse(session)
    shipment_date = data.deadline or datetime.now(timezone.utc).date()
    shipment = await shipment_service.create_shipment_for_order(
        session, actor, order, warehouse.id, shipment_date, data.comment, products_by_id
    )

    await audit_service.log(
        session,
        user_id=actor.id,
        action="CREATE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        new={
            "order_number": order.order_number,
            "total_amount": str(total),
            "shipment_number": shipment.shipment_number,
        },
    )
    await session.commit()
    return await get_full(session, actor, order.id)


async def update_order(
    session: AsyncSession, actor: User, order_id: uuid.UUID, data: OrderUpdate
) -> Order:
    """Правка только шапки заказа — состав и склад уже не трогаем (см. модуль)."""
    order = await get_full(session, actor, order_id)

    payload = data.model_dump(exclude_unset=True)
    if _is_sales(actor):
        payload.pop("manager_id", None)  # менеджер не переназначает владельца

    if "client_id" in payload:
        await _resolve_client(session, actor, payload["client_id"])

    for field, value in payload.items():
        setattr(order, field, value)

    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        new=payload or None,
    )
    await session.commit()
    return await get_full(session, actor, order.id)


async def delete_order(session: AsyncSession, actor: User, order_id: uuid.UUID) -> None:
    """Удаляет заказ и возвращает на склад всё, что было списано его отгрузкой
    (RETURN_IN) — атомарно, одной транзакцией."""
    order = await get_full(session, actor, order_id)
    now = datetime.now(timezone.utc)

    for shipment in order.shipments:
        if shipment.deleted_at is not None:
            continue
        await shipment_service.reverse_shipment_stock(session, actor, shipment)
        shipment.deleted_at = now

    order.deleted_at = now
    await audit_service.log(
        session,
        user_id=actor.id,
        action="DELETE_ORDER",
        entity_type="Order",
        entity_id=order.id,
    )
    await session.commit()
