"""План производства простыней: /api/production-plan (только право production_plan.manage)."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession
from app.core.access import Permission
from app.core.permissions import require_permissions
from app.models import User
from app.schemas.common import Message
from app.schemas.production_plan import (
    PlanOptions,
    PlanResponse,
    PlanSettings,
    QuantityRequest,
    ReorderRequest,
    TaskCreate,
    TaskUpdate,
)
from app.services import production_plan_service as service

router = APIRouter(prefix="/production-plan", tags=["production-plan"])

# Внутренний инструмент: и смотреть, и править — одно право (по умолчанию только СА).
Manager = Annotated[User, Depends(require_permissions(Permission.PRODUCTION_PLAN_MANAGE))]


@router.get("", response_model=PlanResponse)
async def get_plan(actor: Manager, db: DbSession) -> PlanResponse:
    return await service.build_plan(db)


@router.get("/options", response_model=PlanOptions)
async def get_options(actor: Manager, db: DbSession) -> PlanOptions:
    return await service.options(db)


@router.post("/tasks", response_model=PlanResponse, status_code=201)
async def create_task(data: TaskCreate, actor: Manager, db: DbSession) -> PlanResponse:
    await service.create_task(db, data, actor)
    return await service.build_plan(db)


@router.patch("/tasks/{task_id}", response_model=PlanResponse)
async def update_task(
    task_id: uuid.UUID, data: TaskUpdate, actor: Manager, db: DbSession
) -> PlanResponse:
    await service.update_task(db, task_id, data, actor)
    return await service.build_plan(db)


@router.delete("/tasks/{task_id}", response_model=Message)
async def delete_task(task_id: uuid.UUID, actor: Manager, db: DbSession) -> Message:
    await service.delete_task(db, task_id, actor)
    return Message(detail="Задание удалено")


@router.post("/tasks/{task_id}/items/{item_id}/ready", response_model=PlanResponse)
async def mark_ready(
    task_id: uuid.UUID, item_id: uuid.UUID, data: QuantityRequest, actor: Manager, db: DbSession
) -> PlanResponse:
    """Отложить для клиента N готовых штук со склада."""
    await service.mark_ready(db, task_id, item_id, data.quantity, actor)
    return await service.build_plan(db)


@router.post("/tasks/{task_id}/items/{item_id}/ship", response_model=PlanResponse)
async def mark_shipped(
    task_id: uuid.UUID, item_id: uuid.UUID, data: QuantityRequest, actor: Manager, db: DbSession
) -> PlanResponse:
    """Отметить отгрузку N готовых штук клиенту (склад не меняется)."""
    await service.mark_shipped(db, task_id, item_id, data.quantity, actor)
    return await service.build_plan(db)


@router.post("/reorder", response_model=PlanResponse)
async def reorder(data: ReorderRequest, actor: Manager, db: DbSession) -> PlanResponse:
    await service.reorder(db, data.ids)
    return await service.build_plan(db)


@router.put("/settings", response_model=PlanResponse)
async def update_settings(data: PlanSettings, actor: Manager, db: DbSession) -> PlanResponse:
    await service.update_settings(db, data)
    return await service.build_plan(db)
