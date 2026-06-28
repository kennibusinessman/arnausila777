"""Справочник сырья: /api/materials. Скрыт от SaM/SM."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.exceptions import ConflictError, NotFoundError
from app.core.permissions import require_roles
from app.models import Material, User
from app.repositories.base import CRUDRepository
from app.schemas.material import MaterialCreate, MaterialRead, MaterialUpdate
from app.schemas.common import Message, Page
from app.services import audit_service

router = APIRouter(prefix="/materials", tags=["materials"])
repo = CRUDRepository(Material, soft_delete=True)

# Сырьё доступно только SA/B/WM.
Reader = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]
Writer = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
# Удаление — расширенное право, только супер-админ.
SuperAdminUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.get("", response_model=Page[MaterialRead])
async def list_materials(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    search: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[MaterialRead]:
    items, total = await repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        filters={"category": category, "is_active": is_active},
        search=search,
        search_fields=("name", "sku"),
        order_by=Material.name.asc(),
    )
    return Page[MaterialRead](
        items=[MaterialRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.post("", response_model=MaterialRead, status_code=201)
async def create_material(data: MaterialCreate, actor: Writer, db: DbSession) -> MaterialRead:
    try:
        obj = await repo.create(db, data.model_dump())
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Материал с таким SKU уже существует")
    await db.refresh(obj)
    return MaterialRead.model_validate(obj)


@router.get("/{material_id}", response_model=MaterialRead)
async def get_material(material_id: uuid.UUID, actor: Reader, db: DbSession) -> MaterialRead:
    obj = await repo.get(db, material_id)
    if obj is None:
        raise NotFoundError("Материал не найден")
    return MaterialRead.model_validate(obj)


@router.patch("/{material_id}", response_model=MaterialRead)
async def update_material(
    material_id: uuid.UUID, data: MaterialUpdate, actor: Writer, db: DbSession
) -> MaterialRead:
    obj = await repo.get(db, material_id)
    if obj is None:
        raise NotFoundError("Материал не найден")
    try:
        await repo.update(db, obj, data.model_dump(exclude_unset=True))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Материал с таким SKU уже существует")
    await db.refresh(obj)
    return MaterialRead.model_validate(obj)


@router.delete("/{material_id}", response_model=Message)
async def delete_material(material_id: uuid.UUID, actor: SuperAdminUser, db: DbSession) -> Message:
    obj = await repo.get(db, material_id)
    if obj is None:
        raise NotFoundError("Материал не найден")
    await repo.delete(db, obj)
    await audit_service.log(
        db, user_id=actor.id, action="DELETE_MATERIAL", entity_type="Material", entity_id=obj.id
    )
    await db.commit()
    return Message(detail="Материал удалён")
