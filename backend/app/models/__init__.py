"""Регистрация всех ORM-моделей в Base.metadata.

Импорт этого пакета гарантирует, что Alembic autogenerate и create_all видят
полный набор таблиц.
"""
from __future__ import annotations

from app.models.base import Base
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.expense import Expense, ExpenseCategory
from app.models.material import Material
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.product import Product
from app.models.refresh_token import RefreshToken
from app.models.shift_report import (
    ShiftReport,
    ShiftReportMaterial,
    ShiftReportOutput,
    ShiftReportWorker,
)
from app.models.shipment import Shipment, ShipmentItem
from app.models.stock import StockBalance, StockMovement
from app.models.user import User
from app.models.warehouse import Warehouse

__all__ = [
    "Base",
    "AuditLog",
    "Client",
    "Expense",
    "ExpenseCategory",
    "Material",
    "Order",
    "OrderItem",
    "Payment",
    "Product",
    "RefreshToken",
    "ShiftReport",
    "ShiftReportMaterial",
    "ShiftReportOutput",
    "ShiftReportWorker",
    "Shipment",
    "ShipmentItem",
    "StockBalance",
    "StockMovement",
    "User",
    "Warehouse",
]
