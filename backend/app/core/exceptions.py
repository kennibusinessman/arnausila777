"""Доменные исключения приложения.

Каждое несёт HTTP-статус и сообщение; обработчик в app.main превращает их в JSON.
"""
from __future__ import annotations

__all__ = [
    "AppError",
    "BadRequestError",
    "UnauthorizedError",
    "ForbiddenError",
    "NotFoundError",
    "ConflictError",
    "InsufficientStockError",
]


class AppError(Exception):
    """Базовое доменное исключение."""

    status_code: int = 400
    detail: str = "Ошибка запроса"

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class BadRequestError(AppError):
    status_code = 400
    detail = "Некорректный запрос"


class UnauthorizedError(AppError):
    status_code = 401
    detail = "Требуется авторизация"


class ForbiddenError(AppError):
    status_code = 403
    detail = "Недостаточно прав"


class NotFoundError(AppError):
    status_code = 404
    detail = "Ресурс не найден"


class ConflictError(AppError):
    status_code = 409
    detail = "Конфликт данных"


class InsufficientStockError(ConflictError):
    detail = "Недостаточно остатка на складе"
