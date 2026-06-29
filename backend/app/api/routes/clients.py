"""Справочник клиентов: /api/clients.

SALES_MANAGER работает только со своими клиентами (manager_scope): видит, создаёт
(менеджером автоматически становится он сам), редактирует только их и не может
переназначать менеджера. SA/B имеют полный доступ.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.exceptions import NotFoundError
from app.core.permissions import require_roles
from app.models import Client, User
from app.repositories.base import CRUDRepository
from app.schemas.client import (
    ClientCreate,
    ClientOverviewResponse,
    ClientRead,
    ClientStats,
    ClientUpdate,
)
from app.schemas.common import Message, Page
from app.services import report_service

router = APIRouter(prefix="/clients", tags=["clients"])
repo = CRUDRepository(Client, soft_delete=True)

Manager = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.SALES_MANAGER)),
]
# Зав. складом тоже читает справочник клиентов — нужен для выбора клиента при
# «забивании» заказа. Создавать/править/смотреть статистику (там долги) — нельзя.
Reader = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.SALES_MANAGER,
            UserRole.WAREHOUSE_MANAGER,
        )
    ),
]
Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]


def _is_sales(actor: User) -> bool:
    return actor.role is UserRole.SALES_MANAGER


async def _get_in_scope(db: DbSession, actor: User, client_id: uuid.UUID) -> Client:
    obj = await repo.get(db, client_id)
    if obj is None or (_is_sales(actor) and obj.manager_id != actor.id):
        raise NotFoundError("Клиент не найден")
    return obj


@router.get("", response_model=Page[ClientRead])
async def list_clients(
    actor: Reader,
    db: DbSession,
    params: Pagination,
    search: Annotated[str | None, Query()] = None,
    manager_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Page[ClientRead]:
    extra = []
    if _is_sales(actor):
        extra.append(Client.manager_id == actor.id)
    elif manager_id is not None:
        extra.append(Client.manager_id == manager_id)

    items, total = await repo.list(
        db,
        offset=params.offset,
        limit=params.limit,
        search=search,
        search_fields=("name", "phone", "company_name"),
        order_by=Client.name.asc(),
        extra=extra,
    )
    return Page[ClientRead](
        items=[ClientRead.model_validate(i) for i in items],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/overview", response_model=ClientOverviewResponse)
async def clients_overview(
    actor: Manager,
    db: DbSession,
    search: Annotated[str | None, Query()] = None,
) -> ClientOverviewResponse:
    return await report_service.clients_overview(db, actor, search=search)


@router.post("", response_model=ClientRead, status_code=201)
async def create_client(data: ClientCreate, actor: Manager, db: DbSession) -> ClientRead:
    payload = data.model_dump()
    if _is_sales(actor):
        payload["manager_id"] = actor.id  # менеджер ведёт только своих
    obj = await repo.create(db, payload)
    await db.commit()
    await db.refresh(obj)
    return ClientRead.model_validate(obj)


@router.get("/{client_id}", response_model=ClientRead)
async def get_client(client_id: uuid.UUID, actor: Manager, db: DbSession) -> ClientRead:
    obj = await _get_in_scope(db, actor, client_id)
    return ClientRead.model_validate(obj)


@router.get("/{client_id}/stats", response_model=ClientStats)
async def get_client_stats(client_id: uuid.UUID, actor: Manager, db: DbSession) -> ClientStats:
    obj = await _get_in_scope(db, actor, client_id)
    return await report_service.client_stats(db, obj)


@router.patch("/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: uuid.UUID, data: ClientUpdate, actor: Manager, db: DbSession
) -> ClientRead:
    obj = await _get_in_scope(db, actor, client_id)
    payload = data.model_dump(exclude_unset=True)
    if _is_sales(actor):
        payload.pop("manager_id", None)  # менеджер не переназначает владельца
    await repo.update(db, obj, payload)
    await db.commit()
    await db.refresh(obj)
    return ClientRead.model_validate(obj)


@router.delete("/{client_id}", response_model=Message)
async def delete_client(client_id: uuid.UUID, actor: Admin, db: DbSession) -> Message:
    obj = await repo.get(db, client_id)
    if obj is None:
        raise NotFoundError("Клиент не найден")
    await repo.delete(db, obj)
    await db.commit()
    return Message(detail="Клиент удалён")
