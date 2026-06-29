"""Сменные отчёты: /api/shift-reports.

GET (все) — SA,B; GET /my — SM; POST — SM,SA,B; GET/PATCH/submit — владелец SM
(SA,B тоже); approve/reject/DELETE — SA,B. Склад меняется только при approve.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, Pagination
from app.core.enums import ShiftReportStatus, ShiftType, UserRole
from app.core.permissions import require_roles
from app.models import User
from app.schemas.common import Message, Page
from app.schemas.shift_report import (
    ApproveRequest,
    RejectRequest,
    ShiftReportCreate,
    ShiftReportListItem,
    ShiftReportRead,
    ShiftReportUpdate,
)
from app.services import shift_report_service

router = APIRouter(prefix="/shift-reports", tags=["shift-reports"])

# Авторы отчётов: создают/правят/отправляют. Зав. складом тоже заводит сменные
# отчёты (создатель становится «старшим смены», как и SA/B при создании из формы).
Master = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.SHIFT_MASTER,
            UserRole.WAREHOUSE_MANAGER,
        )
    ),
]
Admin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS))]
ShiftMaster = Annotated[User, Depends(require_roles(UserRole.SHIFT_MASTER))]
# Контроль производства: видеть список и утверждать/отклонять отчёты может ещё и
# зав. складом — утверждение приходует продукцию на склад, это его зона.
# (Создавать/править/удалять отчёты он не может — это остаётся за мастером/SA/B.)
Overseer = Annotated[
    User,
    Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.BOSS, UserRole.WAREHOUSE_MANAGER)),
]
# Просмотр карточки отчёта: SA/B, мастер смены (свои) и зав. складом.
Viewer = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.BOSS,
            UserRole.SHIFT_MASTER,
            UserRole.WAREHOUSE_MANAGER,
        )
    ),
]


@router.get("", response_model=Page[ShiftReportListItem])
async def list_reports(
    actor: Overseer,
    db: DbSession,
    params: Pagination,
    status: Annotated[ShiftReportStatus | None, Query()] = None,
    shift_type: Annotated[ShiftType | None, Query()] = None,
    master_id: Annotated[uuid.UUID | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> Page[ShiftReportListItem]:
    items, total = await shift_report_service.list_reports(
        db, actor, params,
        status=status, shift_type=shift_type, master_id=master_id,
        date_from=date_from, date_to=date_to,
    )
    return Page[ShiftReportListItem](
        items=[ShiftReportListItem.model_validate(i) for i in items],
        total=total, page=params.page, size=params.size,
    )


@router.get("/my", response_model=Page[ShiftReportListItem])
async def list_my_reports(
    actor: ShiftMaster,
    db: DbSession,
    params: Pagination,
    status: Annotated[ShiftReportStatus | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> Page[ShiftReportListItem]:
    items, total = await shift_report_service.list_reports(
        db, actor, params, status=status, date_from=date_from, date_to=date_to,
    )
    return Page[ShiftReportListItem](
        items=[ShiftReportListItem.model_validate(i) for i in items],
        total=total, page=params.page, size=params.size,
    )


@router.post("", response_model=ShiftReportRead, status_code=201)
async def create_report(
    data: ShiftReportCreate, actor: Master, db: DbSession
) -> ShiftReportRead:
    report = await shift_report_service.create_report(db, actor, data)
    return ShiftReportRead.model_validate(report)


@router.get("/{report_id}", response_model=ShiftReportRead)
async def get_report(report_id: uuid.UUID, actor: Viewer, db: DbSession) -> ShiftReportRead:
    report = await shift_report_service.get_full(db, actor, report_id)
    return ShiftReportRead.model_validate(report)


@router.patch("/{report_id}", response_model=ShiftReportRead)
async def update_report(
    report_id: uuid.UUID, data: ShiftReportUpdate, actor: Master, db: DbSession
) -> ShiftReportRead:
    report = await shift_report_service.update_report(db, actor, report_id, data)
    return ShiftReportRead.model_validate(report)


@router.post("/{report_id}/submit", response_model=ShiftReportRead)
async def submit_report(
    report_id: uuid.UUID, actor: Master, db: DbSession
) -> ShiftReportRead:
    report = await shift_report_service.submit(db, actor, report_id)
    return ShiftReportRead.model_validate(report)


@router.post("/{report_id}/approve", response_model=ShiftReportRead)
async def approve_report(
    report_id: uuid.UUID, data: ApproveRequest, actor: Overseer, db: DbSession
) -> ShiftReportRead:
    report = await shift_report_service.approve(db, actor, report_id, data)
    return ShiftReportRead.model_validate(report)


@router.post("/{report_id}/reject", response_model=ShiftReportRead)
async def reject_report(
    report_id: uuid.UUID, data: RejectRequest, actor: Overseer, db: DbSession
) -> ShiftReportRead:
    report = await shift_report_service.reject(db, actor, report_id, data.comment)
    return ShiftReportRead.model_validate(report)


@router.delete("/{report_id}", response_model=Message)
async def delete_report(report_id: uuid.UUID, actor: Admin, db: DbSession) -> Message:
    await shift_report_service.delete_report(db, actor, report_id)
    return Message(detail="Сменный отчёт удалён")
