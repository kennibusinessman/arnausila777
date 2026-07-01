"""Сборка всех маршрутов под префиксом /api."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    audit_logs,
    auth,
    clients,
    expense_categories,
    expenses,
    materials,
    orders,
    payments,
    products,
    reports,
    settings,
    shift_reports,
    shipments,
    stock,
    users,
    warehouses,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(clients.router)
api_router.include_router(orders.router)
api_router.include_router(products.router)
api_router.include_router(materials.router)
api_router.include_router(warehouses.router)
api_router.include_router(expense_categories.router)
api_router.include_router(stock.router)
api_router.include_router(shift_reports.router)
api_router.include_router(expenses.router)
api_router.include_router(shipments.router)
api_router.include_router(payments.router)
api_router.include_router(reports.router)
api_router.include_router(settings.router)
api_router.include_router(audit_logs.router)
