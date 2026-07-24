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

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ExpenseCategoryType, SourceType, UserRole, WarehouseType
from app.core.exceptions import BadRequestError, NotFoundError
from app.models import (
    Client,
    Expense,
    ExpenseCategory,
    Order,
    OrderItem,
    Product,
    Settings,
    Shipment,
    ShipmentItem,
    User,
    Warehouse,
)
from app.schemas.common import PageParams
from app.schemas.order import (
    OrderCreate,
    OrderItemCreate,
    OrderPricing,
    OrderSummary,
    OrderUpdate,
)
from app.services import audit_service, shipment_service, stock_service


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


def _is_warehouse(actor: User) -> bool:
    return actor.role is UserRole.WAREHOUSE_MANAGER


def _scope(actor: User) -> list[ColumnElement[bool]]:
    # Менеджер по продажам видит свои заказы + «пул без цен» (созданные зав. складом,
    # total_amount=0), чтобы их можно было доценить.
    if not _is_sales(actor):
        return []
    return [or_(Order.manager_id == actor.id, Order.total_amount == 0)]


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
    session: AsyncSession, items_in: list[OrderItemCreate], *, unpriced: bool = False
) -> tuple[list[OrderItem], Decimal, dict[uuid.UUID, Product]]:
    """Создаёт позиции с расчётом цен; цена берётся из товара, если не задана.
    `unpriced=True` (заказ зав. склада) — все цены 0, доценит менеджер позже."""
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
        if unpriced:
            unit_price = Decimal("0")
        else:
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


def _require_product_weights(products: list[Product]) -> None:
    """Заказ С ЦЕНАМИ требует, чтобы у каждого товара был указан вес единицы:
    вес идёт в расчёт себестоимости сырья/рентабельности и авто-расхода. Заказ
    без цен (зав. склад) эту проверку не проходит — вес доуточнят при доценке."""
    missing = sorted({p.name for p in products if p.base_weight is None or p.base_weight <= 0})
    if missing:
        raise BadRequestError(
            "Нельзя проставить цены: не указан вес у товаров — "
            + ", ".join(missing)
            + ". Заполните «Вес ед., кг» в карточке товара."
        )


# ── Авто-расход себестоимости сырья по заказу (схема «по продаже», COGS) ─────────
# Правило совпадает с экономикой заказа на фронте (orderEconomics.ts):
# себестоимость сырья = вес заказа (кг) × цена сырья за кг (Settings.raw_price_per_kg).
# Такой расход авто-создаётся/меняется/удаляется вместе с заказом и помечен order_id.
RAW_COGS_CATEGORY_NAME = "Сырьё (по заказам)"


def _order_weight_kg(items: list[OrderItem], products_by_id: dict[uuid.UUID, Product]) -> Decimal:
    """Вес заказа = Σ(кол-во × вес единицы товара). Товар без веса (напр. дастархан
    без base_weight) в вес не добавляет — как и в экономике заказа на фронте."""
    total = Decimal("0")
    for it in items:
        product = products_by_id.get(it.product_id)
        base_weight = product.base_weight if product and product.base_weight else Decimal("0")
        total += it.quantity * base_weight
    return total


async def _raw_cogs_category(session: AsyncSession) -> ExpenseCategory:
    """Категория авто-расхода на сырьё — единая «Сырьё (по заказам)» (заводим при
    первом заказе). Отдельная от ручного «Закуп сырья», чтобы не смешивались."""
    category = (
        await session.execute(
            select(ExpenseCategory)
            .where(
                ExpenseCategory.name == RAW_COGS_CATEGORY_NAME,
                ExpenseCategory.type == ExpenseCategoryType.RAW_MATERIAL_PURCHASE,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if category is None:
        category = ExpenseCategory(
            name=RAW_COGS_CATEGORY_NAME,
            type=ExpenseCategoryType.RAW_MATERIAL_PURCHASE,
            is_active=True,
        )
        session.add(category)
        await session.flush()
    return category


async def _order_raw_expense(session: AsyncSession, order_id: uuid.UUID) -> Expense | None:
    return (
        await session.execute(
            select(Expense)
            .where(Expense.order_id == order_id, Expense.deleted_at.is_(None))
            .limit(1)
        )
    ).scalar_one_or_none()


async def _sync_order_raw_expense(
    session: AsyncSession, actor: User, order: Order, weight_kg: Decimal
) -> None:
    """Приводит авто-расход сырья заказа в соответствие текущему весу: создаёт,
    обновляет сумму или (если веса/суммы нет) убирает. Цена сырья — из Settings."""
    settings_row = await session.get(Settings, 1)
    raw_price = settings_row.raw_price_per_kg if settings_row else Decimal("750")
    amount = (weight_kg * raw_price).quantize(Decimal("0.01"))
    existing = await _order_raw_expense(session, order.id)

    if amount <= 0:
        if existing is not None:
            existing.deleted_at = datetime.now(timezone.utc)
        return

    expense_date = order.deadline or datetime.now(timezone.utc).date()
    name = f"Сырьё по заказу {order.order_number}"
    if existing is not None:
        existing.amount = amount
        existing.expense_date = expense_date
        existing.name = name
        return

    category = await _raw_cogs_category(session)
    session.add(
        Expense(
            name=name,
            expense_date=expense_date,
            category_id=category.id,
            amount=amount,
            comment="Автоматически: себестоимость сырья по заказу",
            created_by=actor.id,
            responsible_id=None,
            order_id=order.id,
        )
    )


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
    in_expenses: bool | None = None,
    priced: bool | None = None,
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
    if in_expenses is not None:
        # «Занесён в расходы» = есть неудалённый авто-расход сырья по этому заказу.
        has_expense = (
            select(Expense.id)
            .where(Expense.order_id == Order.id, Expense.deleted_at.is_(None))
            .exists()
        )
        conditions.append(has_expense if in_expenses else ~has_expense)
    if priced is not None:
        # «С ценами» = сумма заказа > 0; «без цен» = 0 (заказ зав. склада до доценки).
        conditions.append(Order.total_amount > 0 if priced else Order.total_amount == 0)
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
    in_expenses: bool | None = None,
    priced: bool | None = None,
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
        in_expenses=in_expenses,
        priced=priced,
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

    # Флаг «занесён в расходы» на каждую строку: есть ли неудалённый авто-расход сырья.
    if items:
        expensed = set(
            (
                await session.execute(
                    select(Expense.order_id).where(
                        Expense.order_id.in_([o.id for o in items]),
                        Expense.deleted_at.is_(None),
                    )
                )
            ).scalars()
        )
        for o in items:
            o.has_expense = o.id in expensed

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
    in_expenses: bool | None = None,
    priced: bool | None = None,
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
        in_expenses=in_expenses,
        priced=priced,
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
    elif _is_warehouse(actor):
        manager_id = None  # заказ без цен — менеджера назначит тот, кто доценит
    else:
        manager_id = data.manager_id or actor.id

    items, total, products_by_id = await _build_items(
        session, data.items, unpriced=_is_warehouse(actor)
    )
    # Заказ с ценами — у всех товаров должен быть вес. Заказ зав. склада без цен
    # эту проверку не проходит (вес доуточнят при доценке менеджером).
    if not _is_warehouse(actor):
        _require_product_weights(list(products_by_id.values()))
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

    # Авто-расход себестоимости сырья (схема «по продаже»).
    await _sync_order_raw_expense(session, actor, order, _order_weight_kg(items, products_by_id))

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

    # Состав (вес) при правке шапки не меняется, но если сдвинули дату заказа —
    # двигаем и дату авто-расхода сырья, чтобы он попал в тот же период в отчётах.
    if "deadline" in payload:
        raw_expense = await _order_raw_expense(session, order.id)
        if raw_expense is not None:
            raw_expense.expense_date = order.deadline or raw_expense.expense_date

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


async def replace_order(
    session: AsyncSession, actor: User, order_id: uuid.UUID, data: OrderCreate
) -> Order:
    """Полная правка заказа (только SA/руководитель): состав, цены и шапка — с
    пересчётом склада и долга. Прежняя отгрузка отменяется — её списания (SALE_OUT)
    удаляются, а остаток возвращается на склад; по новому составу создаётся новая
    отгрузка (SALE_OUT). Возврат отдельной записью в журнал НЕ пишем, чтобы история
    склада не засорялась парами «Продажа+Возврат» на каждой правке. Атомарно: если
    под новый состав не хватает остатка — InsufficientStockError (409), заказ не
    меняется. Долг клиента считается по отгрузкам и пересчитывается автоматически."""
    order = await get_full(session, actor, order_id)
    await _resolve_client(session, actor, data.client_id)

    now = datetime.now(timezone.utc)
    # 1) Откатываем склад прежней отгрузки (удаляем её движения) и помечаем удалённой.
    for shipment in order.shipments:
        if shipment.deleted_at is not None:
            continue
        await stock_service.reverse_source_movements(
            session, source_type=SourceType.SHIPMENT, source_id=shipment.id
        )
        shipment.deleted_at = now

    # 2) Новый состав/цены и шапка. Полная правка всегда с ценами → требуем вес.
    items, total, products_by_id = await _build_items(session, data.items)
    _require_product_weights(list(products_by_id.values()))
    order.client_id = data.client_id
    order.manager_id = data.manager_id
    order.deadline = data.deadline
    order.comment = data.comment
    order.items = items
    order.total_amount = total
    await session.flush()

    # 3) Новая отгрузка: проверка остатка под новый состав + списание (SALE_OUT).
    warehouse = await _resolve_finished_warehouse(session)
    shipment_date = data.deadline or now.date()
    shipment = await shipment_service.create_shipment_for_order(
        session, actor, order, warehouse.id, shipment_date, data.comment, products_by_id
    )

    # Пересчитываем авто-расход сырья под новый состав/вес.
    await _sync_order_raw_expense(session, actor, order, _order_weight_kg(items, products_by_id))

    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        new={"total_amount": str(total), "shipment_number": shipment.shipment_number},
    )
    await session.commit()
    return await get_full(session, actor, order.id)


async def price_order(
    session: AsyncSession, actor: User, order_id: uuid.UUID, data: OrderPricing
) -> Order:
    """Доценка заказа: проставляет цены позиций (зав. склад создаёт заказ без цен).

    Пересчитывает сумму заказа И связанной отгрузки — выручка считается по отгрузкам
    (Σ shipments.total_amount), поэтому без зеркалирования цен в отгрузку выручка не
    сойдётся. Остатки склада не трогаются — цена на количество не влияет."""
    order = await get_full(session, actor, order_id)
    # Доценка = проставление цен → требуем вес у всех товаров заказа.
    _require_product_weights([it.product for it in order.items])

    by_id = {it.id: it for it in order.items}
    price_by_product: dict[uuid.UUID, Decimal] = {}
    for line in data.items:
        item = by_id.get(line.id)
        if item is None:
            raise BadRequestError("Позиция не найдена в заказе")
        item.unit_price = line.unit_price
        item.total_price = (line.unit_price * item.quantity).quantize(Decimal("0.01"))
        price_by_product[item.product_id] = line.unit_price

    order.total_amount = sum((it.total_price for it in order.items), Decimal("0"))
    if order.manager_id is None:
        order.manager_id = actor.id  # заказ выходит из «пула без цен» к доценившему

    # Зеркалим цены в отгрузку (выручка = Σ shipments.total_amount / ShipmentItem.total_price).
    for shipment in order.shipments:
        if shipment.deleted_at is not None:
            continue
        for sit in shipment.items:
            new_price = price_by_product.get(sit.product_id)
            if new_price is not None:
                sit.unit_price = new_price
                sit.total_price = (new_price * sit.quantity).quantize(Decimal("0.01"))
        shipment.total_amount = order.total_amount

    await audit_service.log(
        session,
        user_id=actor.id,
        action="PRICE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        new={"total_amount": str(order.total_amount)},
    )
    await session.commit()
    return await get_full(session, actor, order.id)


async def delete_order(session: AsyncSession, actor: User, order_id: uuid.UUID) -> None:
    """Удаляет заказ и возвращает на склад всё, что было списано его отгрузкой:
    списания (SALE_OUT) удаляются, остаток восстанавливается. Отдельную запись
    «Возврат» в журнал не пишем — атомарно, одной транзакцией."""
    order = await get_full(session, actor, order_id)
    now = datetime.now(timezone.utc)

    for shipment in order.shipments:
        if shipment.deleted_at is not None:
            continue
        await stock_service.reverse_source_movements(
            session, source_type=SourceType.SHIPMENT, source_id=shipment.id
        )
        shipment.deleted_at = now

    order.deleted_at = now
    # Убираем авто-расход сырья вместе с заказом.
    raw_expense = await _order_raw_expense(session, order_id)
    if raw_expense is not None:
        raw_expense.deleted_at = now

    await audit_service.log(
        session,
        user_id=actor.id,
        action="DELETE_ORDER",
        entity_type="Order",
        entity_id=order.id,
    )
    await session.commit()
