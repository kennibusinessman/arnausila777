"""План производства простыней: очередь заданий, расход бабин, сроки, свободный остаток.

Общие операции с заданиями (создать, править, готово/отгружено, связь с заказами)
служат обеим линиям — простыням и спанбонду (`ProductionTask.kind`). Расчёт
плана спанбонда — в spunbond_plan_service.

Задание — для одного клиента, в нём несколько позиций (наименование + штуки).
У позиции три числа: заказано, готово (отложено для клиента со склада) и
отгружено. Отгружено складывается из заказов (заказ клиенту на странице
«Заказы» засчитывается сюда сам — см. link_order) и ручных отметок, которые
склад не меняют.

Расчёт идёт по активным заданиям сверху вниз по очереди, внутри задания — по
порядку позиций:

- осталось сделать = заказано − готово;
- бабин нужно = ⌈осталось / норма выхода бабины⌉ — целые бабины на каждую
  позицию; лишние простыни с последней бабины остаются на складе;
- бабины на складе расходуются накопительно — позиция ниже по очереди получает
  то, что осталось после позиций выше;
- дата готовности — накопительно по выработке линии (шт за смену × смен в сутки).

Свободный остаток наименования = остаток на всех складах − готовое, но ещё не
отгруженное по активным заданиям. Если он есть, первая по очереди позиция с
этим наименованием получает предложение «передать N шт клиенту».
"""
from __future__ import annotations

import math
import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import SPUNBOND_CATEGORY, guess_color, is_bobbin, norm
from app.core.enums import ItemType, ProductionTaskKind, ProductionTaskStatus, ShiftReportStatus
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models import (
    Client,
    Order,
    Product,
    ProductionTask,
    ProductionTaskItem,
    ProductionTaskShipment,
    ShiftReport,
    ShiftReportMaterial,
    StockBalance,
    User,
)
from app.schemas.production_plan import (
    BobbinNeed,
    BobbinUse,
    DemandRow,
    FreeStock,
    ItemOrder,
    ItemRow,
    Offer,
    PlanBobbinOption,
    PlanOptions,
    PlanProductOption,
    PlanResponse,
    PlanSettings,
    ProductDemand,
    TaskCreate,
    TaskItemIn,
    TaskRow,
    TaskUpdate,
)
from app.services import audit_service, settings_service
from app.services.report_service import _load_bobbins

ACTIVE = (ProductionTaskStatus.QUEUED, ProductionTaskStatus.IN_PROGRESS)
CLOSED_LIMIT = 100
_CENT = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


async def _stock_by_product(db: AsyncSession) -> dict[uuid.UUID, Decimal]:
    rows = await db.execute(
        select(StockBalance.product_id, func.sum(StockBalance.quantity))
        .where(StockBalance.item_type == ItemType.PRODUCT)
        .group_by(StockBalance.product_id)
    )
    return {pid: Decimal(qty or 0) for pid, qty in rows.all()}


# Популярность бабины: (сколько штук ушло в утверждённых сменных отчётах,
# сколько раз её выбирали вручную в заданиях).
Usage = dict[uuid.UUID, tuple[Decimal, int]]


async def _bobbin_usage(db: AsyncSession) -> Usage:
    used = await db.execute(
        select(ShiftReportMaterial.product_id, func.sum(ShiftReportMaterial.quantity_used))
        .join(ShiftReport, ShiftReport.id == ShiftReportMaterial.shift_report_id)
        .where(
            ShiftReport.status == ShiftReportStatus.APPROVED,
            ShiftReportMaterial.product_id.is_not(None),
        )
        .group_by(ShiftReportMaterial.product_id)
    )
    chosen = await db.execute(
        select(ProductionTaskItem.bobbin_id, func.count())
        .where(ProductionTaskItem.bobbin_id.is_not(None))
        .group_by(ProductionTaskItem.bobbin_id)
    )
    usage: Usage = {pid: (Decimal(q or 0), 0) for pid, q in used.all()}
    for bid, n in chosen.all():
        usage[bid] = (usage.get(bid, (Decimal(0), 0))[0], int(n))
    return usage


def _pick_bobbin(
    item: ProductionTaskItem,
    by_target: dict[uuid.UUID, list[Product]],
    stock: dict[uuid.UUID, Decimal],
    usage: Usage | None = None,
) -> Product | None:
    """Бабина позиции, а если не выбрана — привязанная к наименованию: сначала с
    нормой, из них самая популярная для этой простыни (больше всего ушло по
    сменным отчётам, потом чаще выбирали в заданиях), при равенстве — у которой
    больше на складе."""
    candidates = by_target.get(item.product_id, [])
    if item.bobbin_id is not None:
        for b in candidates:
            if b.id == item.bobbin_id:
                return b
    if not candidates:
        return None
    usage = usage or {}
    return max(
        candidates,
        key=lambda b: (
            b.roll_norm is not None,
            usage.get(b.id, (Decimal(0), 0)),
            stock.get(b.id, Decimal(0)),
            b.name,
        ),
    )


async def _bobbin_index(db: AsyncSession) -> dict[uuid.UUID, list[Product]]:
    """Наименование → привязанные к нему бабины."""
    by_target: dict[uuid.UUID, list[Product]] = {}
    for b in await _load_bobbins(db):
        if b.roll_product_id is not None and b.is_active:
            by_target.setdefault(b.roll_product_id, []).append(b)
    return by_target


async def options(db: AsyncSession) -> PlanOptions:
    by_target = await _bobbin_index(db)
    stock = await _stock_by_product(db)
    usage = await _bobbin_usage(db)
    products = (
        await db.execute(
            select(Product).where(Product.id.in_(by_target), Product.deleted_at.is_(None))
        )
    ).scalars().all()
    return PlanOptions(
        products=[
            PlanProductOption(
                id=p.id,
                name=p.name,
                unit=p.unit,
                bobbins=[
                    PlanBobbinOption(
                        id=b.id,
                        name=b.name,
                        roll_norm=b.roll_norm,
                        on_stock=stock.get(b.id, Decimal(0)),
                        used=usage.get(b.id, (Decimal(0), 0))[0],
                        chosen=usage.get(b.id, (Decimal(0), 0))[1],
                    )
                    for b in by_target[p.id]
                ],
            )
            for p in sorted(products, key=lambda p: p.name)
        ]
    )


async def _active_tasks(
    db: AsyncSession, kind: ProductionTaskKind | None = None
) -> list[ProductionTask]:
    """Активные задания по очереди; kind=None — обе линии (для склада и заказов)."""
    query = select(ProductionTask).where(ProductionTask.status.in_(ACTIVE))
    if kind is not None:
        query = query.where(ProductionTask.kind == kind)
    return list(
        (
            await db.execute(
                query.order_by(ProductionTask.position.asc(), ProductionTask.created_at.asc())
            )
        ).scalars().all()
    )


async def _closed_tasks(db: AsyncSession, kind: ProductionTaskKind) -> list[ProductionTask]:
    return list(
        (
            await db.execute(
                select(ProductionTask)
                .where(ProductionTask.status.not_in(ACTIVE), ProductionTask.kind == kind)
                .order_by(ProductionTask.updated_at.desc())
                .limit(CLOSED_LIMIT)
            )
        ).scalars().all()
    )


def _free_stock(
    active: list[ProductionTask], stock: dict[uuid.UUID, Decimal]
) -> dict[uuid.UUID, tuple[Decimal, int]]:
    """Наименование → (остаток, отложено) по наименованиям активных заданий.

    Отложено — готовое, но ещё не отгруженное: оно лежит на складе для клиента.
    """
    reserved: dict[uuid.UUID, int] = {}
    for t in active:
        for i in t.items:
            reserved[i.product_id] = reserved.get(i.product_id, 0) + i.ready - i.shipped
    return {pid: (stock.get(pid, Decimal(0)), r) for pid, r in reserved.items()}


async def _load_context(
    db: AsyncSession, tasks: list[ProductionTask]
) -> tuple[dict[uuid.UUID, Product], dict[uuid.UUID, str], dict[uuid.UUID, list[ItemOrder]]]:
    """Товары, имена клиентов и засчитанные заказы для строк заданий."""
    ids = {i.product_id for t in tasks for i in t.items}
    names: dict[uuid.UUID, Product] = {}
    if ids:
        names = {
            p.id: p
            for p in (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars().all()
        }
    client_ids = {t.client_id for t in tasks if t.client_id is not None}
    clients: dict[uuid.UUID, str] = {}
    if client_ids:
        found = await db.execute(select(Client).where(Client.id.in_(client_ids)))
        clients = {c.id: c.name for c in found.scalars().all()}
    item_ids = [i.id for t in tasks for i in t.items]
    orders_by_item: dict[uuid.UUID, list[ItemOrder]] = {}
    if item_ids:
        linked = await db.execute(
            select(ProductionTaskShipment, Order.order_number)
            .join(Order, Order.id == ProductionTaskShipment.order_id)
            .where(ProductionTaskShipment.item_id.in_(item_ids))
            .order_by(ProductionTaskShipment.created_at)
        )
        for link, number in linked.all():
            orders_by_item.setdefault(link.item_id, []).append(
                ItemOrder(order_id=link.order_id, order_number=number, quantity=link.quantity)
            )
    return names, clients, orders_by_item


def _item_row(
    i: ProductionTaskItem,
    names: dict[uuid.UUID, Product],
    orders_by_item: dict[uuid.UUID, list[ItemOrder]],
    bobbin: Product | None = None,
) -> ItemRow:
    product = names.get(i.product_id)
    return ItemRow(
        id=i.id,
        line_no=i.line_no,
        product_id=i.product_id,
        product_name=product.name if product else "—",
        unit=product.unit if product else "шт",
        bobbin_id=i.bobbin_id,
        plan_bobbin_id=bobbin.id if bobbin else None,
        plan_bobbin_name=bobbin.name if bobbin else None,
        roll_norm=bobbin.roll_norm if bobbin else None,
        quantity=i.quantity,
        ready=i.ready,
        shipped=i.shipped,
        remaining=max(i.quantity - i.ready, 0),
        awaiting_shipment=max(i.ready - i.shipped, 0),
        orders=orders_by_item.get(i.id, []),
    )


def _task_row(t: ProductionTask, items: list[ItemRow], clients: dict[uuid.UUID, str]) -> TaskRow:
    etas = [r.eta for r in items if r.eta is not None]
    eta = max(etas) if etas else None
    return TaskRow(
        id=t.id,
        kind=t.kind,
        position=t.position,
        status=t.status,
        client_id=t.client_id,
        client_name=clients.get(t.client_id) if t.client_id else None,
        deadline=t.deadline,
        comment=t.comment,
        items=items,
        quantity=sum(r.quantity for r in items),
        ready=sum(r.ready for r in items),
        shipped=sum(r.shipped for r in items),
        remaining=sum(r.remaining for r in items),
        eta=eta,
        late=t.deadline is not None and eta is not None and eta > t.deadline,
    )


def _free_and_offers(
    active: list[ProductionTask],
    rows: list[TaskRow],
    free_all: dict[uuid.UUID, tuple[Decimal, int]],
    names: dict[uuid.UUID, Product],
) -> tuple[list[FreeStock], list[Offer]]:
    """Свободный остаток по наименованиям очереди и предложения «передать клиенту»:
    первая по очереди позиция с этим наименованием получает свободное."""
    free_rows: list[FreeStock] = []
    offers: list[Offer] = []
    active_rows = [r for r in rows if r.status in ACTIVE]
    for pid in {i.product_id for t in active for i in t.items}:
        on_stock, reserved = free_all[pid]
        free = on_stock - reserved
        product = names.get(pid)
        free_rows.append(
            FreeStock(
                product_id=pid,
                product_name=product.name if product else "—",
                on_stock=on_stock,
                reserved=reserved,
                free=free,
            )
        )
        whole = int(free) if free > 0 else 0
        if whole <= 0:
            continue
        target = next(
            (
                (task, item)
                for task in active_rows
                for item in task.items
                if item.product_id == pid and item.remaining > 0
            ),
            None,
        )
        if target is not None:
            task, item = target
            offers.append(
                Offer(
                    task_id=task.id,
                    item_id=item.id,
                    product_id=pid,
                    product_name=item.product_name,
                    client_id=task.client_id,
                    client_name=task.client_name,
                    free=free,
                    quantity=min(whole, item.remaining),
                )
            )
    free_rows.sort(key=lambda x: x.product_name)
    return free_rows, offers


async def build_plan(db: AsyncSession, today: date | None = None) -> PlanResponse:
    today = today or date.today()
    cfg = await settings_service.get_settings(db)
    per_shift = Decimal(cfg.sheets_per_shift)
    per_day = Decimal(cfg.sheets_per_shift * cfg.shifts_per_day)

    active = await _active_tasks(db, ProductionTaskKind.SHEETS)
    closed = await _closed_tasks(db, ProductionTaskKind.SHEETS)
    # Готовое по заданиям спанбонда тоже лежит на складе для клиентов — свободный
    # остаток считаем по всем активным заданиям.
    all_active = await _active_tasks(db)
    names, clients, orders_by_item = await _load_context(db, active + closed)
    by_target = await _bobbin_index(db)
    stock = await _stock_by_product(db)
    usage = await _bobbin_usage(db)

    bobbin_used: dict[uuid.UUID, int] = {}
    bobbin_cards: dict[uuid.UUID, Product] = {}
    bobbin_uses: dict[uuid.UUID, list[BobbinUse]] = {}
    cum_sheets = 0

    def item_row(i: ProductionTaskItem, bobbin: Product | None) -> ItemRow:
        return _item_row(i, names, orders_by_item, bobbin)

    def task_row(t: ProductionTask, items: list[ItemRow]) -> TaskRow:
        return _task_row(t, items, clients)

    rows: list[TaskRow] = []
    for queue_no, t in enumerate(active, start=1):
        client_name = clients.get(t.client_id) if t.client_id else None
        items: list[ItemRow] = []
        for i in t.items:
            bobbin = _pick_bobbin(i, by_target, stock, usage)
            row = item_row(i, bobbin)
            items.append(row)
            if row.remaining == 0:
                row.bobbin_status = "done"
                continue

            cum_sheets += row.remaining
            row.shifts_needed = _q(Decimal(row.remaining) / per_shift)
            row.eta = today + timedelta(days=math.ceil(Decimal(cum_sheets) / per_day) - 1)

            if bobbin is None or not bobbin.roll_norm:
                row.bobbin_status = "no_norm"
                continue
            # Бабины берутся целыми: последнюю докручивают до конца, лишние
            # простыни остаются на складе.
            need = math.ceil(row.remaining / bobbin.roll_norm)
            leftover = need * bobbin.roll_norm - row.remaining
            on_stock = int(stock.get(bobbin.id, Decimal(0)))
            before = bobbin_used.get(bobbin.id, 0)
            from_stock = min(need, max(on_stock - before, 0))
            short = need - from_stock
            bobbin_used[bobbin.id] = before + need
            bobbin_cards[bobbin.id] = bobbin
            row.bobbins_needed = need
            row.leftover_sheets = leftover
            bobbin_uses.setdefault(bobbin.id, []).append(
                BobbinUse(
                    task_id=t.id,
                    item_id=i.id,
                    queue_no=queue_no,
                    client_name=client_name,
                    comment=t.comment,
                    product_name=row.product_name,
                    sheets=row.remaining,
                    needed=need,
                    from_stock=from_stock,
                    short=short,
                    leftover_sheets=leftover,
                )
            )
            if short == 0:
                row.bobbin_status = "ok"
            elif from_stock > 0:
                row.bobbin_status = "partial"
                row.bobbins_short = short
            else:
                row.bobbin_status = "none"
                row.bobbins_short = short
        rows.append(task_row(t, items))

    for t in closed:
        rows.append(task_row(t, [item_row(i, None) for i in t.items]))

    bobbins = []
    for bid, needed in bobbin_used.items():
        b = bobbin_cards[bid]
        uses = bobbin_uses.get(bid, [])
        target = names.get(b.roll_product_id) if b.roll_product_id else None
        bobbins.append(
            BobbinNeed(
                bobbin_id=bid,
                name=b.name,
                color=guess_color(b.name, target.name if target else None),
                roll_norm=b.roll_norm,
                on_stock=stock.get(bid, Decimal(0)),
                needed=needed,
                shortage=sum(u.short for u in uses),
                leftover_sheets=sum(u.leftover_sheets for u in uses),
                uses=uses,
            )
        )
    bobbins.sort(key=lambda x: x.name)

    free_rows, offers = _free_and_offers(active, rows, _free_stock(all_active, stock), names)

    return PlanResponse(
        settings=PlanSettings(
            sheets_per_shift=cfg.sheets_per_shift, shifts_per_day=cfg.shifts_per_day
        ),
        tasks=rows,
        bobbins=bobbins,
        offers=offers,
        free_stock=free_rows,
        total_remaining=cum_sheets,
        total_shifts=_q(Decimal(cum_sheets) / per_shift),
        finish_date=(
            today + timedelta(days=math.ceil(Decimal(cum_sheets) / per_day) - 1)
            if cum_sheets
            else None
        ),
    )


async def product_demand(db: AsyncSession, product_id: uuid.UUID) -> ProductDemand:
    """Кому сколько нужно наименования по активным заданиям обеих линий.

    Показываем всех, даже если склада не хватает. Склад делится сверху вниз по
    очереди (сначала простыни, потом спанбонд): готовое, отложенное для
    клиента, — его; остальной склад достаётся первым по очереди.
    """
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Товар не найден")
    stock = await _stock_by_product(db)
    on_stock = stock.get(product_id, Decimal(0))
    by_target = await _bobbin_index(db)
    usage = await _bobbin_usage(db)

    active = await _active_tasks(db)
    sheets = [t for t in active if t.kind == ProductionTaskKind.SHEETS]
    spunbond = [t for t in active if t.kind == ProductionTaskKind.SPUNBOND]
    names, clients, _ = await _load_context(db, active)

    # Отложенное для клиентов лежит на складе, но уже не свободно.
    reserved = sum(
        (Decimal(i.ready - i.shipped) for t in active for i in t.items if i.product_id == product_id),
        Decimal(0),
    )
    free = max(on_stock - reserved, Decimal(0))

    rows: list[DemandRow] = []
    for queue in (sheets, spunbond):
        for queue_no, t in enumerate(queue, start=1):
            client_name = clients.get(t.client_id) if t.client_id else None
            base = dict(
                task_id=t.id,
                kind=t.kind,
                queue_no=queue_no,
                client_name=client_name,
                comment=t.comment,
                deadline=t.deadline,
            )
            for i in t.items:
                if i.product_id == product_id:
                    need = Decimal(i.quantity - i.shipped)
                    if need <= 0:
                        continue
                    held = Decimal(max(i.ready - i.shipped, 0))
                    take = min(need - held, free)
                    free -= take
                    rows.append(
                        DemandRow(
                            **base,
                            via="direct",
                            needed=need,
                            ready=held,
                            from_stock=held + take,
                            short=need - held - take,
                        )
                    )
                elif t.kind == ProductionTaskKind.SHEETS:
                    remaining = i.quantity - i.ready
                    if remaining <= 0:
                        continue
                    bobbin = _pick_bobbin(i, by_target, stock, usage)
                    if bobbin is None or bobbin.id != product_id or not bobbin.roll_norm:
                        continue
                    need = Decimal(math.ceil(remaining / bobbin.roll_norm))
                    take = min(need, free)
                    free -= take
                    sheet = names.get(i.product_id)
                    rows.append(
                        DemandRow(
                            **base,
                            via="bobbin",
                            for_product_name=sheet.name if sheet else "—",
                            sheets=remaining,
                            needed=need,
                            from_stock=take,
                            short=need - take,
                        )
                    )

    return ProductDemand(
        product_id=product.id,
        name=product.name,
        unit=product.unit,
        on_stock=on_stock,
        needed=sum((r.needed for r in rows), Decimal(0)),
        short=sum((r.short for r in rows), Decimal(0)),
        rows=rows,
    )


async def _get(db: AsyncSession, task_id: uuid.UUID) -> ProductionTask:
    task = await db.get(ProductionTask, task_id)
    if task is None:
        raise NotFoundError("Задание не найдено")
    return task


def _get_item(task: ProductionTask, item_id: uuid.UUID) -> ProductionTaskItem:
    for i in task.items:
        if i.id == item_id:
            return i
    raise NotFoundError("Позиция не найдена")


async def _check_refs(
    db: AsyncSession,
    product_id: uuid.UUID,
    bobbin_id: uuid.UUID | None,
    kind: ProductionTaskKind = ProductionTaskKind.SHEETS,
) -> None:
    product = await db.get(Product, product_id)
    if product is None or product.deleted_at is not None:
        raise BadRequestError("Наименование не найдено")
    if kind is ProductionTaskKind.SPUNBOND:
        # Линия спанбонда делает только свою категорию — рулоны и бабины.
        if norm(product.category) != norm(SPUNBOND_CATEGORY):
            raise BadRequestError(f"«{product.name}» — не спанбонд")
        if bobbin_id is not None:
            raise BadRequestError("У спанбонда бабина в позиции не указывается")
        return
    if is_bobbin(product.category, product.subcategory):
        raise BadRequestError("В задание ставится готовая продукция, а не бабина")
    if bobbin_id is None:
        return
    bobbin = await db.get(Product, bobbin_id)
    if bobbin is None or bobbin.deleted_at is not None or not is_bobbin(
        bobbin.category, bobbin.subcategory
    ):
        raise BadRequestError("Бабина не найдена")
    if bobbin.roll_product_id != product_id:
        raise BadRequestError(f"Бабина «{bobbin.name}» не привязана к «{product.name}»")


async def _check_client(db: AsyncSession, client_id: uuid.UUID | None) -> None:
    if client_id is None:
        return
    client = await db.get(Client, client_id)
    if client is None or client.deleted_at is not None:
        raise BadRequestError("Клиент не найден")


def _check_counts(quantity: int, ready: int, shipped: int) -> None:
    if ready > quantity:
        raise BadRequestError(f"Готово {ready} шт — это больше, чем заказано ({quantity})")
    if shipped > ready:
        raise BadRequestError(f"Отгружено {shipped} шт — это больше, чем готово ({ready})")


def _sync_status(task: ProductionTask) -> None:
    """Всё отгружено — задание закрыто; что-то готово — задание в работе."""
    if task.status not in ACTIVE:
        return
    if all(i.shipped >= i.quantity for i in task.items):
        task.status = ProductionTaskStatus.DONE
    elif task.status is ProductionTaskStatus.QUEUED and any(i.ready > 0 for i in task.items):
        task.status = ProductionTaskStatus.IN_PROGRESS


async def _next_position(db: AsyncSession, kind: ProductionTaskKind) -> int:
    current = await db.scalar(
        select(func.max(ProductionTask.position)).where(
            ProductionTask.status.in_(ACTIVE), ProductionTask.kind == kind
        )
    )
    return (current or 0) + 1


def _audit_items(task: ProductionTask) -> list[dict]:
    return [
        {"product_id": i.product_id, "quantity": i.quantity, "ready": i.ready, "shipped": i.shipped}
        for i in task.items
    ]


async def create_task(db: AsyncSession, data: TaskCreate, actor: User) -> ProductionTask:
    await _check_client(db, data.client_id)
    items: list[ProductionTaskItem] = []
    for line_no, it in enumerate(data.items, start=1):
        await _check_refs(db, it.product_id, it.bobbin_id, data.kind)
        ready, shipped = it.ready or 0, it.shipped or 0
        _check_counts(it.quantity, ready, shipped)
        items.append(
            ProductionTaskItem(
                line_no=line_no,
                product_id=it.product_id,
                bobbin_id=it.bobbin_id,
                quantity=it.quantity,
                ready=ready,
                shipped=shipped,
            )
        )
    task = ProductionTask(
        kind=data.kind,
        client_id=data.client_id,
        deadline=data.deadline,
        comment=data.comment,
        position=await _next_position(db, data.kind),
        created_by=actor.id,
        items=items,
    )
    _sync_status(task)
    db.add(task)
    await db.flush()
    await audit_service.log(
        db,
        user_id=actor.id,
        action="CREATE_PRODUCTION_TASK",
        entity_type="ProductionTask",
        entity_id=task.id,
        new={"kind": task.kind, "client_id": task.client_id, "items": _audit_items(task)},
    )
    await db.commit()
    return task


async def _replace_items(
    db: AsyncSession, task: ProductionTask, incoming: list[TaskItemIn]
) -> None:
    existing = {i.id: i for i in task.items}
    keep_ids = {it.id for it in incoming if it.id is not None}
    unknown = keep_ids - existing.keys()
    if unknown:
        raise BadRequestError("Позиция не из этого задания")
    for item in existing.values():
        if item.id not in keep_ids and item.ready > 0:
            raise ConflictError(
                f"За позицией уже {item.ready} шт готово — сначала обнулите «готово»"
            )

    result: list[ProductionTaskItem] = []
    for line_no, it in enumerate(incoming, start=1):
        item = existing.get(it.id) if it.id is not None else None
        if item is None:
            item = ProductionTaskItem(product_id=it.product_id, ready=0, shipped=0)
        elif it.product_id != item.product_id and item.ready > 0:
            raise ConflictError("За позицией уже есть готовые штуки — наименование не поменять")
        if item.id is None or it.product_id != item.product_id or it.bobbin_id != item.bobbin_id:
            await _check_refs(db, it.product_id, it.bobbin_id, task.kind)
        ready = it.ready if it.ready is not None else item.ready
        shipped = it.shipped if it.shipped is not None else item.shipped
        _check_counts(it.quantity, ready, shipped)
        item.line_no = line_no
        item.product_id = it.product_id
        item.bobbin_id = it.bobbin_id
        item.quantity = it.quantity
        item.ready = ready
        item.shipped = shipped
        result.append(item)
    task.items = result


async def update_task(
    db: AsyncSession, task_id: uuid.UUID, data: TaskUpdate, actor: User
) -> ProductionTask:
    task = await _get(db, task_id)
    payload = data.model_dump(exclude_unset=True, exclude={"items"})

    if payload.get("client_id") is not None and payload["client_id"] != task.client_id:
        await _check_client(db, payload["client_id"])
    if data.items is not None:
        await _replace_items(db, task, data.items)

    status = payload.get("status")
    if status is not None and status in ACTIVE and task.status not in ACTIVE:
        payload["position"] = await _next_position(db, task.kind)  # вернули в работу — в конец очереди
    for key, value in payload.items():
        setattr(task, key, value)
    if status is None:
        _sync_status(task)

    await audit_service.log(
        db,
        user_id=actor.id,
        action="UPDATE_PRODUCTION_TASK",
        entity_type="ProductionTask",
        entity_id=task.id,
        new={**payload, "items": _audit_items(task)} if data.items is not None else payload,
    )
    await db.commit()
    return task


async def delete_task(db: AsyncSession, task_id: uuid.UUID, actor: User) -> None:
    task = await _get(db, task_id)
    await db.delete(task)
    await audit_service.log(
        db,
        user_id=actor.id,
        action="DELETE_PRODUCTION_TASK",
        entity_type="ProductionTask",
        entity_id=task.id,
    )
    await db.commit()


async def reorder(
    db: AsyncSession,
    ids: list[uuid.UUID],
    kind: ProductionTaskKind = ProductionTaskKind.SHEETS,
) -> None:
    active = await _active_tasks(db, kind)
    if len(ids) != len(set(ids)) or set(ids) != {t.id for t in active}:
        raise ConflictError("Очередь изменилась — обновите страницу и повторите")
    by_id = {t.id: t for t in active}
    for index, task_id in enumerate(ids, start=1):
        by_id[task_id].position = index
    await db.commit()


async def mark_ready(
    db: AsyncSession, task_id: uuid.UUID, item_id: uuid.UUID, quantity: int, actor: User
) -> ProductionTask:
    """Отложить для клиента N готовых штук со склада («Готово» или «Да» на предложении)."""
    task = await _get(db, task_id)
    if task.status not in ACTIVE:
        raise ConflictError("Задание уже закрыто")
    item = _get_item(task, item_id)
    remaining = item.quantity - item.ready
    if quantity > remaining:
        raise BadRequestError(f"По позиции осталось сделать всего {remaining} шт")
    active = await _active_tasks(db)
    stock = await _stock_by_product(db)
    on_stock, reserved = _free_stock(active, stock)[item.product_id]
    free = int(on_stock - reserved) if on_stock > reserved else 0
    if quantity > free:
        raise ConflictError(
            f"На складе свободно только {free} шт — сначала оприходуйте простыни "
            "(сменный отчёт или корректировка остатков)"
        )

    item.ready += quantity
    _sync_status(task)
    await audit_service.log(
        db,
        user_id=actor.id,
        action="ALLOCATE_PRODUCTION_TASK",
        entity_type="ProductionTask",
        entity_id=task.id,
        new={"product_id": item.product_id, "quantity": quantity, "ready": item.ready},
    )
    await db.commit()
    return task


async def mark_shipped(
    db: AsyncSession, task_id: uuid.UUID, item_id: uuid.UUID, quantity: int, actor: User
) -> ProductionTask:
    """Отметить, что N готовых штук отгрузили клиенту. Склад не меняется."""
    task = await _get(db, task_id)
    if task.status not in ACTIVE:
        raise ConflictError("Задание уже закрыто")
    item = _get_item(task, item_id)
    waiting = item.ready - item.shipped
    if quantity > waiting:
        raise BadRequestError(
            f"Готово к отгрузке только {waiting} шт — сначала отметьте, что штуки готовы"
        )

    item.shipped += quantity
    _sync_status(task)
    await audit_service.log(
        db,
        user_id=actor.id,
        action="SHIP_PRODUCTION_TASK",
        entity_type="ProductionTask",
        entity_id=task.id,
        new={"product_id": item.product_id, "quantity": quantity, "shipped": item.shipped},
    )
    await db.commit()
    return task


async def update_settings(db: AsyncSession, data: PlanSettings) -> PlanSettings:
    cfg = await settings_service.get_settings(db)
    cfg.sheets_per_shift = data.sheets_per_shift
    cfg.shifts_per_day = data.shifts_per_day
    await db.commit()
    return data


# ---------------------------------------------------------------------------
# Связь с «Заказами»: заказ клиенту = отгрузка по его заданиям в плане.
# Вызывается из order_service внутри его транзакции (без commit).
# ---------------------------------------------------------------------------


async def link_order(db: AsyncSession, order: Order) -> None:
    """Засчитать заказ в открытые задания этого клиента.

    По каждой простыне заказа штуки раскладываются по позициям с тем же
    наименованием сверху вниз по очереди, пока не кончится заказ или
    неотгруженное в плане. Лишнее сверх плана просто не засчитывается.
    Заказ увозит товар со склада, поэтому если позиция не была отмечена
    готовой — «готово» поднимается до отгруженного.
    """
    wanted: dict[uuid.UUID, int] = {}
    for it in order.items:
        wanted[it.product_id] = wanted.get(it.product_id, 0) + int(it.quantity)
    if not wanted:
        return
    tasks = [t for t in await _active_tasks(db) if t.client_id == order.client_id]
    for task in tasks:
        for item in task.items:
            left = wanted.get(item.product_id, 0)
            open_qty = item.quantity - item.shipped
            if left <= 0 or open_qty <= 0:
                continue
            qty = min(left, open_qty)
            wanted[item.product_id] = left - qty
            item.shipped += qty
            ready_added = max(item.shipped - item.ready, 0)
            item.ready += ready_added
            db.add(
                ProductionTaskShipment(
                    item_id=item.id, order_id=order.id, quantity=qty, ready_added=ready_added
                )
            )
        _sync_status(task)
    await db.flush()


async def unlink_order(db: AsyncSession, order_id: uuid.UUID) -> None:
    """Откатить всё, что заказ засчитал в план (заказ удалили или поменяли)."""
    links = (
        await db.execute(
            select(ProductionTaskShipment).where(ProductionTaskShipment.order_id == order_id)
        )
    ).scalars().all()
    for link in links:
        item = await db.get(ProductionTaskItem, link.item_id)
        if item is None:
            continue
        item.shipped = max(item.shipped - link.quantity, 0)
        item.ready = max(item.ready - link.ready_added, item.shipped)
        task = await db.get(ProductionTask, item.task_id)
        # Задание закрылось или ушло «в работу» из-за этого заказа — пересчитываем:
        # что-то готово — в работе, ничего — снова в очереди.
        if task is not None and task.status is not ProductionTaskStatus.CANCELLED:
            task.status = (
                ProductionTaskStatus.IN_PROGRESS
                if any(i.ready > 0 for i in task.items)
                else ProductionTaskStatus.QUEUED
            )
        await db.delete(link)
    await db.flush()
