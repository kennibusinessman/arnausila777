"""Бизнес-логика сменных отчётов (§5.2).

- create/update: только в DRAFT/REJECTED; SM работает лишь со своими отчётами.
- submit: DRAFT/REJECTED → SUBMITTED.
- approve (**атомарно**, одна транзакция): PRODUCTION_OUT по сырью →
  PRODUCTION_IN по продукции → DEFECT_OUT по браку → APPROVED. Если сырья мало,
  apply_movement бросает 409 и вся транзакция откатывается — склад не меняется.
- reject(comment): SUBMITTED → REJECTED (причина — в audit_log).
Склад не выбирается в отчёте: сырьё списывается со склада RAW_MATERIALS/MIXED,
продукция приходуется на FINISHED_GOODS/MIXED (или явный склад из approve).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    ItemType,
    MovementType,
    ShiftReportStatus,
    ShiftType,
    SourceType,
    UserRole,
    WarehouseType,
)
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.models import (
    Material,
    Product,
    ShiftReport,
    ShiftReportMaterial,
    ShiftReportOutput,
    ShiftReportWorker,
    User,
    Warehouse,
)
from app.schemas.common import PageParams
from app.schemas.shift_report import (
    ApproveRequest,
    MaterialIn,
    OutputIn,
    ShiftReportCreate,
    ShiftReportUpdate,
    WorkerIn,
)
from app.services import audit_service, stock_service

_RAW_TYPES = (WarehouseType.RAW_MATERIALS, WarehouseType.MIXED)
_FINISHED_TYPES = (WarehouseType.FINISHED_GOODS, WarehouseType.MIXED)
# Состав можно править только в этих статусах.
_EDITABLE = {ShiftReportStatus.DRAFT, ShiftReportStatus.REJECTED}
# Утверждённый отчёт «задним числом» правят только супер-админ и руководитель —
# с пересчётом склада (реверс прежних движений + повторное применение).
_CAN_EDIT_APPROVED = {UserRole.SUPER_ADMIN, UserRole.BOSS}


def _is_master(actor: User) -> bool:
    return actor.role is UserRole.SHIFT_MASTER


def _scope(actor: User) -> list[ColumnElement[bool]]:
    return [ShiftReport.master_id == actor.id] if _is_master(actor) else []


def _full_query():
    return select(ShiftReport).options(
        selectinload(ShiftReport.workers).selectinload(ShiftReportWorker.worker),
        selectinload(ShiftReport.outputs).selectinload(ShiftReportOutput.product),
        selectinload(ShiftReport.materials).selectinload(ShiftReportMaterial.material),
        selectinload(ShiftReport.materials).selectinload(ShiftReportMaterial.product),
        selectinload(ShiftReport.master),
        selectinload(ShiftReport.approver),
    )


async def get_full(session: AsyncSession, actor: User, report_id: uuid.UUID) -> ShiftReport:
    report = (
        await session.execute(_full_query().where(ShiftReport.id == report_id, *_scope(actor)))
    ).scalar_one_or_none()
    if report is None:
        raise NotFoundError("Сменный отчёт не найден")
    return report


# --- Сборка дочерних строк с валидацией справочников ---

async def _build_workers(
    session: AsyncSession, items_in: list[WorkerIn]
) -> list[ShiftReportWorker]:
    if not items_in:
        return []
    ids = {i.worker_id for i in items_in}
    found = set(
        (
            await session.execute(
                select(User.id).where(User.id.in_(ids), User.deleted_at.is_(None))
            )
        ).scalars()
    )
    for line in items_in:
        if line.worker_id not in found:
            raise BadRequestError(f"Работник {line.worker_id} не найден")
    return [
        ShiftReportWorker(
            worker_id=line.worker_id,
            hours_worked=line.hours_worked,
            comment=line.comment,
        )
        for line in items_in
    ]


async def _build_outputs(
    session: AsyncSession, items_in: list[OutputIn]
) -> list[ShiftReportOutput]:
    if not items_in:
        return []
    ids = {i.product_id for i in items_in}
    by_id = {
        p.id: p
        for p in (
            await session.execute(select(Product).where(Product.id.in_(ids)))
        ).scalars()
    }
    outputs: list[ShiftReportOutput] = []
    for line in items_in:
        product = by_id.get(line.product_id)
        if product is None:
            raise BadRequestError(f"Товар {line.product_id} не найден")
        if not product.is_active:
            raise BadRequestError(f"Товар «{product.name}» неактивен")
        if line.defect_quantity > line.quantity:
            raise BadRequestError(
                f"Брак ({line.defect_quantity}) больше выпуска ({line.quantity})"
            )
        outputs.append(
            ShiftReportOutput(
                product_id=product.id,
                quantity=line.quantity,
                defect_quantity=line.defect_quantity,
                comment=line.comment,
            )
        )
    return outputs


async def _build_materials(
    session: AsyncSession, items_in: list[MaterialIn]
) -> list[ShiftReportMaterial]:
    if not items_in:
        return []
    # Строка ссылается либо на материал (Полипропилен), либо на товар-полуфабрикат
    # (спанбонд: Бабины / Дастархан сырьё) — гарантировано валидатором MaterialIn.
    material_ids = {i.material_id for i in items_in if i.material_id is not None}
    product_ids = {i.product_id for i in items_in if i.product_id is not None}
    materials_by_id = {
        m.id: m
        for m in (
            await session.execute(select(Material).where(Material.id.in_(material_ids)))
        ).scalars()
    } if material_ids else {}
    products_by_id = {
        p.id: p
        for p in (
            await session.execute(select(Product).where(Product.id.in_(product_ids)))
        ).scalars()
    } if product_ids else {}

    materials: list[ShiftReportMaterial] = []
    for line in items_in:
        if line.material_id is not None:
            material = materials_by_id.get(line.material_id)
            if material is None:
                raise BadRequestError(f"Материал {line.material_id} не найден")
            if not material.is_active:
                raise BadRequestError(f"Материал «{material.name}» неактивен")
            materials.append(
                ShiftReportMaterial(
                    material_id=material.id,
                    quantity_used=line.quantity_used,
                    comment=line.comment,
                )
            )
        else:
            product = products_by_id.get(line.product_id)
            if product is None:
                raise BadRequestError(f"Товар {line.product_id} не найден")
            if not product.is_active:
                raise BadRequestError(f"Товар «{product.name}» неактивен")
            materials.append(
                ShiftReportMaterial(
                    product_id=product.id,
                    quantity_used=line.quantity_used,
                    comment=line.comment,
                )
            )
    return materials


# --- CRUD / workflow ---

async def list_reports(
    session: AsyncSession,
    actor: User,
    params: PageParams,
    *,
    status: ShiftReportStatus | None = None,
    shift_type: ShiftType | None = None,
    master_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[ShiftReport], int]:
    conditions: list[ColumnElement[bool]] = [*_scope(actor)]
    if status is not None:
        conditions.append(ShiftReport.status == status)
    if shift_type is not None:
        conditions.append(ShiftReport.shift_type == shift_type)
    if master_id is not None and not _is_master(actor):
        conditions.append(ShiftReport.master_id == master_id)
    if date_from is not None:
        conditions.append(ShiftReport.shift_date >= date_from)
    if date_to is not None:
        conditions.append(ShiftReport.shift_date <= date_to)

    total = (
        await session.execute(select(func.count()).select_from(ShiftReport).where(*conditions))
    ).scalar_one()
    items = (
        await session.execute(
            select(ShiftReport)
            .options(
                selectinload(ShiftReport.master),
                selectinload(ShiftReport.outputs).selectinload(ShiftReportOutput.product),
                selectinload(ShiftReport.materials).selectinload(ShiftReportMaterial.material),
                selectinload(ShiftReport.materials).selectinload(ShiftReportMaterial.product),
            )
            .where(*conditions)
            .order_by(ShiftReport.shift_date.desc(), ShiftReport.created_at.desc())
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars().all()
    return list(items), total


async def create_report(
    session: AsyncSession, actor: User, data: ShiftReportCreate
) -> ShiftReport:
    if _is_master(actor):
        master_id = actor.id
    else:
        master_id = data.master_id or actor.id
        if await session.get(User, master_id) is None:
            raise BadRequestError("Мастер не найден")

    report = ShiftReport(
        shift_date=data.shift_date,
        shift_type=data.shift_type,
        master_id=master_id,
        status=ShiftReportStatus.DRAFT,
        comment=data.comment,
        downtime_hours=data.downtime_hours,
        workers=await _build_workers(session, data.workers),
        outputs=await _build_outputs(session, data.outputs),
        materials=await _build_materials(session, data.materials),
    )
    session.add(report)
    await session.flush()
    await audit_service.log(
        session,
        user_id=actor.id,
        action="CREATE_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
        new={"shift_date": str(data.shift_date), "shift_type": data.shift_type.value},
    )
    await session.commit()
    return await get_full(session, actor, report.id)


async def update_report(
    session: AsyncSession, actor: User, report_id: uuid.UUID, data: ShiftReportUpdate
) -> ShiftReport:
    report = await get_full(session, actor, report_id)
    editing_approved = report.status is ShiftReportStatus.APPROVED
    if editing_approved:
        if actor.role not in _CAN_EDIT_APPROVED:
            raise ConflictError(
                "Утверждённый отчёт может править только супер-админ или руководитель"
            )
        # Откатываем склад прежнего утверждения — ниже применим заново по новым данным.
        await stock_service.reverse_source_movements(
            session, source_type=SourceType.SHIFT_REPORT, source_id=report.id
        )
    elif report.status not in _EDITABLE:
        raise ConflictError("Править можно только черновик или отклонённый отчёт")

    payload = data.model_dump(exclude_unset=True)
    for field in ("workers", "outputs", "materials"):
        payload.pop(field, None)
    for field, value in payload.items():
        setattr(report, field, value)

    if data.workers is not None:
        report.workers = await _build_workers(session, data.workers)
    if data.outputs is not None:
        report.outputs = await _build_outputs(session, data.outputs)
    if data.materials is not None:
        report.materials = await _build_materials(session, data.materials)

    if editing_approved:
        # Перечитываем состав со связями (unit товара/сырья) и проводим склад заново;
        # статус остаётся APPROVED. Не хватает остатка под новый состав — 409, откат.
        await session.flush()
        fresh = await get_full(session, actor, report.id)
        raw_wh, finished_wh = await _resolve_report_warehouses(session, fresh, None, None)
        await _apply_report_stock(session, actor, fresh, raw_wh, finished_wh)

    await audit_service.log(
        session,
        user_id=actor.id,
        action="UPDATE_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
        new=payload or None,
    )
    await session.commit()
    return await get_full(session, actor, report.id)


async def submit(session: AsyncSession, actor: User, report_id: uuid.UUID) -> ShiftReport:
    report = await get_full(session, actor, report_id)
    if report.status not in _EDITABLE:
        raise ConflictError("Отправить можно только черновик или отклонённый отчёт")
    report.status = ShiftReportStatus.SUBMITTED
    await audit_service.log(
        session,
        user_id=actor.id,
        action="SUBMIT_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
    )
    await session.commit()
    return await get_full(session, actor, report.id)


async def _resolve_warehouse(
    session: AsyncSession,
    types: tuple[WarehouseType, ...],
    override_id: uuid.UUID | None,
    label: str,
) -> uuid.UUID:
    if override_id is not None:
        wh = await session.get(Warehouse, override_id)
        if wh is None or not wh.is_active or wh.type not in types:
            raise BadRequestError(f"Указан неподходящий склад для {label}")
        return wh.id
    rows = (
        await session.execute(
            select(Warehouse.id).where(
                Warehouse.is_active.is_(True), Warehouse.type.in_(types)
            )
        )
    ).scalars().all()
    if len(rows) == 1:
        return rows[0]
    if not rows:
        raise ConflictError(f"Нет активного склада для {label}")
    raise ConflictError(
        f"Несколько складов подходят для {label} — укажите склад явно в запросе"
    )


async def _resolve_report_warehouses(
    session: AsyncSession,
    report: ShiftReport,
    raw_override: uuid.UUID | None,
    finished_override: uuid.UUID | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Подбирает склады: сырьё-материал (Полипропилен) — со склада сырья; продукция и
    сырьё-полуфабрикат (спанбонд) — со склада готовой продукции."""
    has_material_raw = any(m.material_id is not None for m in report.materials)
    has_product_raw = any(m.product_id is not None for m in report.materials)
    raw_wh = finished_wh = None
    if has_material_raw:
        raw_wh = await _resolve_warehouse(session, _RAW_TYPES, raw_override, "сырья")
    if report.outputs or has_product_raw:
        finished_wh = await _resolve_warehouse(
            session, _FINISHED_TYPES, finished_override, "продукции"
        )
    return raw_wh, finished_wh


async def _apply_report_stock(
    session: AsyncSession,
    actor: User,
    report: ShiftReport,
    raw_wh: uuid.UUID | None,
    finished_wh: uuid.UUID | None,
) -> None:
    """Проводит склад по отчёту. Порядок: списываем сырьё (проверка достаточности) →
    приходуем продукцию → брак."""
    for m in report.materials:
        if m.material_id is not None:
            await stock_service.apply_movement(
                session,
                warehouse_id=raw_wh,
                item_type=ItemType.MATERIAL,
                movement_type=MovementType.PRODUCTION_OUT,
                quantity=m.quantity_used,
                unit=m.material.unit,
                source_type=SourceType.SHIFT_REPORT,
                created_by=actor.id,
                material_id=m.material_id,
                source_id=report.id,
            )
        else:
            await stock_service.apply_movement(
                session,
                warehouse_id=finished_wh,
                item_type=ItemType.PRODUCT,
                movement_type=MovementType.PRODUCTION_OUT,
                quantity=m.quantity_used,
                unit=m.product.unit,
                source_type=SourceType.SHIFT_REPORT,
                created_by=actor.id,
                product_id=m.product_id,
                source_id=report.id,
            )
    for o in report.outputs:
        await stock_service.apply_movement(
            session,
            warehouse_id=finished_wh,
            item_type=ItemType.PRODUCT,
            movement_type=MovementType.PRODUCTION_IN,
            quantity=o.quantity,
            unit=o.product.unit,
            source_type=SourceType.SHIFT_REPORT,
            created_by=actor.id,
            product_id=o.product_id,
            source_id=report.id,
        )
        if o.defect_quantity > 0:
            await stock_service.apply_movement(
                session,
                warehouse_id=finished_wh,
                item_type=ItemType.PRODUCT,
                movement_type=MovementType.DEFECT_OUT,
                quantity=o.defect_quantity,
                unit=o.product.unit,
                source_type=SourceType.SHIFT_REPORT,
                created_by=actor.id,
                product_id=o.product_id,
                source_id=report.id,
            )



async def approve(
    session: AsyncSession, actor: User, report_id: uuid.UUID, data: ApproveRequest
) -> ShiftReport:
    report = await get_full(session, actor, report_id)
    if report.status is not ShiftReportStatus.SUBMITTED:
        raise ConflictError("Утвердить можно только отправленный отчёт")
    raw_wh, finished_wh = await _resolve_report_warehouses(
        session, report, data.raw_warehouse_id, data.finished_warehouse_id
    )
    await _apply_report_stock(session, actor, report, raw_wh, finished_wh)

    report.status = ShiftReportStatus.APPROVED
    report.approved_by = actor.id
    report.approved_at = datetime.now(timezone.utc)
    await audit_service.log(
        session,
        user_id=actor.id,
        action="APPROVE_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
    )
    await session.commit()
    return await get_full(session, actor, report.id)


async def reject(
    session: AsyncSession, actor: User, report_id: uuid.UUID, comment: str
) -> ShiftReport:
    report = await get_full(session, actor, report_id)
    if report.status is not ShiftReportStatus.SUBMITTED:
        raise ConflictError("Отклонить можно только отправленный отчёт")
    report.status = ShiftReportStatus.REJECTED
    await audit_service.log(
        session,
        user_id=actor.id,
        action="REJECT_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
        new={"reason": comment},
    )
    await session.commit()
    return await get_full(session, actor, report.id)


async def delete_report(session: AsyncSession, actor: User, report_id: uuid.UUID) -> None:
    report = await get_full(session, actor, report_id)
    if report.status is ShiftReportStatus.APPROVED:
        # Утверждённая смена уже провела склад — удалить её может только супер-админ.
        # При удалении откатываем движения этого отчёта: выпуск и брак вычитаются со
        # склада продукции, израсходованное сырьё возвращается на склад сырья. Если
        # выпуск уже израсходован дальше по цепочке — reverse бросает 409, откат.
        if actor.role is not UserRole.SUPER_ADMIN:
            raise ForbiddenError("Утверждённую смену может удалить только супер-админ")
        await stock_service.reverse_source_movements(
            session, source_type=SourceType.SHIFT_REPORT, source_id=report.id
        )
    await audit_service.log(
        session,
        user_id=actor.id,
        action="DELETE_SHIFT_REPORT",
        entity_type="ShiftReport",
        entity_id=report.id,
        old={
            "shift_date": str(report.shift_date),
            "shift_type": report.shift_type.value,
            "status": report.status.value,
        },
    )
    await session.delete(report)
    await session.commit()
