"""Строковые перечисления домена. Значения хранятся в БД как VARCHAR(50)."""
from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    BOSS = "boss"
    WAREHOUSE_MANAGER = "warehouse_manager"
    SHIFT_MASTER = "shift_master"
    SALES_MANAGER = "sales_manager"


class ShiftType(str, Enum):
    SHIFT_1 = "SHIFT_1"
    SHIFT_2 = "SHIFT_2"


class ShiftReportStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class WarehouseType(str, Enum):
    RAW_MATERIALS = "RAW_MATERIALS"
    FINISHED_GOODS = "FINISHED_GOODS"
    MIXED = "MIXED"


class ItemType(str, Enum):
    PRODUCT = "PRODUCT"
    MATERIAL = "MATERIAL"


class MovementType(str, Enum):
    PURCHASE_IN = "PURCHASE_IN"
    PRODUCTION_IN = "PRODUCTION_IN"
    PRODUCTION_OUT = "PRODUCTION_OUT"
    SALE_OUT = "SALE_OUT"
    ADJUSTMENT_IN = "ADJUSTMENT_IN"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT"
    DEFECT_OUT = "DEFECT_OUT"
    RETURN_IN = "RETURN_IN"


class SourceType(str, Enum):
    EXPENSE = "EXPENSE"
    SHIFT_REPORT = "SHIFT_REPORT"
    SHIPMENT = "SHIPMENT"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    RETURN = "RETURN"


class PaymentMethod(str, Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    CARD = "CARD"
    OTHER = "OTHER"


class ExpenseCategoryType(str, Enum):
    RAW_MATERIAL_PURCHASE = "RAW_MATERIAL_PURCHASE"
    OPERATING = "OPERATING"
    PAYROLL = "PAYROLL"
    EQUIPMENT = "EQUIPMENT"
    OTHER = "OTHER"


class RevenueMode(str, Enum):
    """Режим выручки в отчётах: по отгрузкам (начисление) или по оплатам (касса)."""

    SHIPMENTS = "shipments"
    PAYMENTS = "payments"
