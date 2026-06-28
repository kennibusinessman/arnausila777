/** Зеркало backend/app/core/enums.py — значения хранятся как строки 1:1 с API. */

export const UserRole = {
  SUPER_ADMIN: "super_admin",
  BOSS: "boss",
  WAREHOUSE_MANAGER: "warehouse_manager",
  SHIFT_MASTER: "shift_master",
  SALES_MANAGER: "sales_manager",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ShiftType = {
  SHIFT_1: "SHIFT_1",
  SHIFT_2: "SHIFT_2",
} as const;
export type ShiftType = (typeof ShiftType)[keyof typeof ShiftType];

export const ShiftReportStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ShiftReportStatus = (typeof ShiftReportStatus)[keyof typeof ShiftReportStatus];

export const WarehouseType = {
  RAW_MATERIALS: "RAW_MATERIALS",
  FINISHED_GOODS: "FINISHED_GOODS",
  MIXED: "MIXED",
} as const;
export type WarehouseType = (typeof WarehouseType)[keyof typeof WarehouseType];

export const ItemType = {
  PRODUCT: "PRODUCT",
  MATERIAL: "MATERIAL",
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const MovementType = {
  PURCHASE_IN: "PURCHASE_IN",
  PRODUCTION_IN: "PRODUCTION_IN",
  PRODUCTION_OUT: "PRODUCTION_OUT",
  SALE_OUT: "SALE_OUT",
  ADJUSTMENT_IN: "ADJUSTMENT_IN",
  ADJUSTMENT_OUT: "ADJUSTMENT_OUT",
  DEFECT_OUT: "DEFECT_OUT",
  RETURN_IN: "RETURN_IN",
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const SourceType = {
  EXPENSE: "EXPENSE",
  SHIFT_REPORT: "SHIFT_REPORT",
  SHIPMENT: "SHIPMENT",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  RETURN: "RETURN",
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const PaymentMethod = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  CARD: "CARD",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const ExpenseCategoryType = {
  RAW_MATERIAL_PURCHASE: "RAW_MATERIAL_PURCHASE",
  OPERATING: "OPERATING",
  PAYROLL: "PAYROLL",
  EQUIPMENT: "EQUIPMENT",
  OTHER: "OTHER",
} as const;
export type ExpenseCategoryType = (typeof ExpenseCategoryType)[keyof typeof ExpenseCategoryType];

export const RevenueMode = {
  SHIPMENTS: "shipments",
  PAYMENTS: "payments",
} as const;
export type RevenueMode = (typeof RevenueMode)[keyof typeof RevenueMode];
