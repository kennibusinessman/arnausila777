"""Склад: /api/stock — остатки, движения, ручные корректировки (SA, B, WM)."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import joinedload

from app.api.deps import DbSession, Pagination
from app.core.enums import ItemType, MovementType, SourceType, UserRole
from app.core.exceptions import BadRequestError
from app.core.permissions import require_roles
from app.models import Material, Product, StockBalance, StockMovement, User
from app.repositories.base import CRUDRepository
from app.schemas.common import Message, Page
from app.schemas.stock import (
    AdjustmentCreate,
    AdjustmentDirection,
    StockBalanceRead,
    StockMovementHistoryRead,
    StockMovementRead,
)
from app.services import audit_service, stock_service

router = APIRouter(prefix="/stock", tags=["stock"])
balances_repo = CRUDRepository(StockBalance)
movements_repo = CRUDRepository(StockMovement)

# Склад: SUPER_ADMIN, BOSS, WAREHOUSE_MANAGER.
StockUser = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]
# Удаление движения — расширенное право, только супер-админ.
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("/balances", response_model=Page[StockBalanceRead])
async def list_balances(
    actor: StockUser,
    db: DbSession,
    params: Pagination,
    warehouse_id: Annotated[uuid.UUID | None, Query()] = None,
    item_type: Annotated[ItemType | None, Query()] = None,
    product_id: Annotated[uuid.UUID | None, Query()] = None,
    material_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Page[StockBalanceRead]:
    # Не показываем остатки удалённых (soft-delete) товаров/материалов: строка в
    # stock_balances остаётся как кэш, но в списке остатков её быть не должно.
    alive_item = or_(
        StockBalance.product_id.in_(select(Product.id).where(Product.deleted_at.is_(None))),
        StockBalance.material_id.in_(select(Material.id).where(Material.deleted_at.is_(None))),
    )
    items, total = await balances_repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={
            "warehouse_id": warehouse_id,
            "item_type": item_type,
            "product_id": product_id,
            "material_id": material_id,
        },
        order_by=StockBalance.updated_at.desc(),
        extra=(alive_item,),
    )
    return Page[StockBalanceRead](
        items=[StockBalanceRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/movements", response_model=Page[StockMovementRead])
async def list_movements(
    actor: StockUser,
    db: DbSession,
    params: Pagination,
    warehouse_id: Annotated[uuid.UUID | None, Query()] = None,
    item_type: Annotated[ItemType | None, Query()] = None,
    movement_type: Annotated[MovementType | None, Query()] = None,
    product_id: Annotated[uuid.UUID | None, Query()] = None,
    material_id: Annotated[uuid.UUID | None, Query()] = None,
    source_type: Annotated[SourceType | None, Query()] = None,
) -> Page[StockMovementRead]:
    items, total = await movements_repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={
            "warehouse_id": warehouse_id,
            "item_type": item_type,
            "movement_type": movement_type,
            "product_id": product_id,
            "material_id": material_id,
            "source_type": source_type,
        },
        order_by=StockMovement.created_at.desc(),
    )
    return Page[StockMovementRead](
        items=[StockMovementRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/history", response_model=list[StockMovementHistoryRead])
async def item_history(
    actor: StockUser,
    db: DbSession,
    item_type: Annotated[ItemType, Query()],
    product_id: Annotated[uuid.UUID | None, Query()] = None,
    material_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[StockMovementHistoryRead]:
    """Полная история движений одной позиции (товара или материала): кто и когда
    провёл движение и какой остаток был на складе после него. Остаток считается
    нарастающим итогом по всем складам — так же, как позиция агрегируется в списке
    остатков (см. StockPage). Новые движения сверху."""
    if item_type is ItemType.PRODUCT and (product_id is None or material_id is not None):
        raise BadRequestError("Для item_type=PRODUCT укажите только product_id")
    if item_type is ItemType.MATERIAL and (material_id is None or product_id is not None):
        raise BadRequestError("Для item_type=MATERIAL укажите только material_id")

    id_filter = (
        StockMovement.product_id == product_id
        if item_type is ItemType.PRODUCT
        else StockMovement.material_id == material_id
    )
    # created_at одинаков у движений из одной транзакции (напр. утверждение смены) —
    # id вторичным ключом даёт детерминированный порядок для нарастающего итога.
    movements = (
        (
            await db.execute(
                select(StockMovement)
                .options(joinedload(StockMovement.creator))
                .where(StockMovement.item_type == item_type, id_filter)
                .order_by(StockMovement.created_at.asc(), StockMovement.id.asc())
            )
        )
        .scalars()
        .all()
    )

    running = Decimal("0")
    rows: list[StockMovementHistoryRead] = []
    for mv in movements:
        running += mv.quantity * stock_service.movement_sign(mv.movement_type)
        rows.append(
            StockMovementHistoryRead(
                **StockMovementRead.model_validate(mv).model_dump(),
                created_by_name=mv.creator.full_name if mv.creator else None,
                balance_after=running,
            )
        )
    rows.reverse()  # новые сверху — как в списке движений
    return rows


@router.post("/adjustments", response_model=StockMovementRead, status_code=201)
async def create_adjustment(
    data: AdjustmentCreate, actor: StockUser, db: DbSession
) -> StockMovementRead:
    movement_type = (
        MovementType.ADJUSTMENT_IN
        if data.direction is AdjustmentDirection.IN
        else MovementType.ADJUSTMENT_OUT
    )
    movement = await stock_service.apply_movement(
        db,
        warehouse_id=data.warehouse_id,
        item_type=data.item_type,
        movement_type=movement_type,
        quantity=data.quantity,
        unit=data.unit,
        source_type=SourceType.MANUAL_ADJUSTMENT,
        created_by=actor.id,
        product_id=data.product_id,
        material_id=data.material_id,
        unit_cost=data.unit_cost,
        comment=data.comment,
    )
    await audit_service.log(
        db,
        user_id=actor.id,
        action="MANUAL_STOCK_ADJUSTMENT",
        entity_type="StockMovement",
        entity_id=movement.id,
        new={
            "warehouse_id": str(data.warehouse_id),
            "movement_type": movement_type.value,
            "quantity": str(data.quantity),
        },
    )
    await db.commit()
    await db.refresh(movement)
    return StockMovementRead.model_validate(movement)


@router.delete("/movements/{movement_id}", response_model=Message)
async def delete_movement(movement_id: uuid.UUID, actor: SuperAdminUser, db: DbSession) -> Message:
    await stock_service.delete_movement(db, actor.id, movement_id)
    return Message(detail="Движение удалено, остаток скорректирован")
