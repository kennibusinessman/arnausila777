"""Хэширование паролей и работа с JWT (access + refresh)."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "hash_token",
    "JWTError",
]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _create_token(
    subject: uuid.UUID | str,
    ttl: timedelta,
    token_type: str,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
        # jti гарантирует уникальность токена даже при выпуске в ту же секунду
        # (иначе refresh-токен с одинаковыми sub/iat/exp совпадает побайтово).
        "jti": str(uuid.uuid4()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID | str, role: str) -> str:
    return _create_token(
        user_id,
        timedelta(minutes=settings.ACCESS_TOKEN_TTL_MIN),
        "access",
        {"role": role},
    )


def create_refresh_token(user_id: uuid.UUID | str) -> str:
    return _create_token(
        user_id,
        timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        "refresh",
    )


def decode_token(token: str) -> dict[str, Any]:
    """Декодирует и проверяет подпись/срок токена. Бросает JWTError при ошибке."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def hash_token(token: str) -> str:
    """sha256-хэш токена для хранения в БД (сам JWT не хранится в открытом виде)."""
    return hashlib.sha256(token.encode()).hexdigest()
