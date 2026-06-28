"""Справочник складов: /api/warehouses."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.exceptions import NotFoundError
from app.core.permissions import require_roles
from app.models import User, Warehouse
from app.repositories.base import CRUDRepository
from app.schemas.common import Page
from app.schemas.warehouse import WarehouseCreate, WarehouseRead, WarehouseUpdate

router = APIRouter(prefix="/warehouses", tags=["warehouses"])
repo = CRUDRepository(Warehouse)

Reader = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]
Writer = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]


@router.get("", response_model=Page[WarehouseRead])
async def list_warehouses(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[WarehouseRead]:
    items, total = await repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={"is_active": is_active},
        order_by=Warehouse.name.asc(),
    )
    return Page[WarehouseRead](
        items=[WarehouseRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.post("", response_model=WarehouseRead, status_code=201)
async def create_warehouse(data: WarehouseCreate, actor: Writer, db: DbSession) -> WarehouseRead:
    obj = await repo.create(db, data.model_dump())
    await db.commit()
    await db.refresh(obj)
    return WarehouseRead.model_validate(obj)


@router.get("/{warehouse_id}", response_model=WarehouseRead)
async def get_warehouse(warehouse_id: uuid.UUID, actor: Reader, db: DbSession) -> WarehouseRead:
    obj = await repo.get(db, warehouse_id)
    if obj is None:
        raise NotFoundError("Склад не найден")
    return WarehouseRead.model_validate(obj)


@router.patch("/{warehouse_id}", response_model=WarehouseRead)
async def update_warehouse(
    warehouse_id: uuid.UUID, data: WarehouseUpdate, actor: Writer, db: DbSession
) -> WarehouseRead:
    obj = await repo.get(db, warehouse_id)
    if obj is None:
        raise NotFoundError("Склад не найден")
    await repo.update(db, obj, data.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(obj)
    return WarehouseRead.model_validate(obj)
