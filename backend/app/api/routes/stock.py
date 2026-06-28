"""Склад: /api/stock — остатки, движения, ручные корректировки (SA, B, WM)."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import ItemType, MovementType, SourceType, UserRole
from app.core.permissions import require_roles
from app.models import StockBalance, StockMovement, User
from app.repositories.base import CRUDRepository
from app.schemas.common import Message, Page
from app.schemas.stock import (
    AdjustmentCreate,
    AdjustmentDirection,
    StockBalanceRead,
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
