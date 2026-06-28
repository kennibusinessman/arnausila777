"""Маршруты аутентификации: /api/auth."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.common import Message
from app.schemas.user import UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DbSession) -> TokenResponse:
    user = await auth_service.authenticate(db, data.email, data.password)
    return await auth_service.issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: DbSession) -> TokenResponse:
    return await auth_service.refresh_tokens(db, data.refresh_token)


@router.post("/logout", response_model=Message)
async def logout(data: RefreshRequest, user: CurrentUser, db: DbSession) -> Message:
    await auth_service.revoke_refresh_token(db, data.refresh_token)
    return Message(detail="Выход выполнен")


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/change-password", response_model=Message)
async def change_password(
    data: ChangePasswordRequest, user: CurrentUser, db: DbSession
) -> Message:
    await auth_service.change_password(db, user, data.old_password, data.new_password)
    return Message(detail="Пароль изменён")
