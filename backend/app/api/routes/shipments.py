"""Отгрузки: /api/shipments (только чтение).

Отгрузка создаётся автоматически вместе с заказом и отменяется при его удалении
(см. order_service) — отдельного API для создания/подтверждения/отмены нет.
GET — SA, B, WM, SaM (SaM только свои заказы).
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.common import Page
from app.schemas.shipment import ShipmentListItem, ShipmentRead
from app.services import shipment_service

router = APIRouter(prefix="/shipments", tags=["shipments"])

Viewer = Annotated[
    User,
    Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.BOSS,
        UserRole.WAREHOUSE_MANAGER, UserRole.SALES_MANAGER,
    )),
]


@router.get("", response_model=Page[ShipmentListItem])
async def list_shipments(
    actor: Viewer,
    db: DbSession,
    params: Pagination,
    order_id: Annotated[uuid.UUID | None, Query()] = None,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> Page[ShipmentListItem]:
    items, total = await shipment_service.list_shipments(
        db, actor, params,
        order_id=order_id, client_id=client_id,
        date_from=date_from, date_to=date_to,
    )
    return Page[ShipmentListItem](
        items=[ShipmentListItem.model_validate(i) for i in items],
        total=total, page=params.page, size=params.size,
    )


@router.get("/{shipment_id}", response_model=ShipmentRead)
async def get_shipment(shipment_id: uuid.UUID, actor: Viewer, db: DbSession) -> ShipmentRead:
    shipment = await shipment_service.get_full(db, actor, shipment_id)
    return ShipmentRead.model_validate(shipment)
