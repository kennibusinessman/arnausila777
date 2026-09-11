/** Зеркало backend/app/core/enums.py — значения хранятся как строки 1:1 с API. */

export const UserRole = {
  SUPER_ADMIN: "super_admin",
  BOSS: "boss",
  WAREHOUSE_MANAGER: "warehouse_manager",
  SHIFT_MASTER: "shift_master",
  SALES_MANAGER: "sales_manager",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Права доступа — зеркало Permission из backend/app/core/access.py.
 * Роль задаёт набор по умолчанию, индивидуальные права его корректируют;
 * итоговый набор приходит в UserRead.effective_permissions.
 */
export const Permission = {
  DASHBOARD_VIEW: "dashboard.view",
  ORDERS_VIEW: "orders.view",
  ORDERS_VIEW_MONEY: "orders.view_money",
  ORDERS_CREATE: "orders.create",
  ORDERS_EDIT: "orders.edit",
  ORDERS_REBUILD: "orders.rebuild",
  ORDERS_SET_PRICES: "orders.set_prices",
  ORDERS_DELETE: "orders.delete",
  SHIPMENTS_VIEW: "shipments.view",
  SHIFT_REPORTS_VIEW: "shift_reports.view",
  SHIFT_REPORTS_VIEW_ALL: "shift_reports.view_all",
  SHIFT_REPORTS_CREATE: "shift_reports.create",
  SHIFT_REPORTS_APPROVE: "shift_reports.approve",
  SHIFT_REPORTS_DELETE: "shift_reports.delete",
  STOCK_VIEW: "stock.view",
  STOCK_ADJUST: "stock.adjust",
  STOCK_DELETE_MOVEMENT: "stock.delete_movement",
  STOCK_INVENTORY: "stock.inventory",
  EXPENSES_VIEW: "expenses.view",
  EXPENSES_MANAGE: "expenses.manage",
  EXPENSES_DELETE: "expenses.delete",
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_EDIT: "payments.edit",
  CLIENTS_VIEW: "clients.view",
  CLIENTS_CREATE: "clients.create",
  CLIENTS_VIEW_DETAILS: "clients.view_details",
  CLIENTS_EDIT: "clients.edit",
  CLIENTS_DELETE: "clients.delete",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_EDIT: "products.edit",
  PRODUCTS_DELETE: "products.delete",
  PRODUCTS_SET_NORM: "products.set_norm",
  MATERIALS_VIEW: "materials.view",
  MATERIALS_MANAGE: "materials.manage",
  MATERIALS_DELETE: "materials.delete",
  WAREHOUSES_VIEW: "warehouses.view",
  WAREHOUSES_MANAGE: "warehouses.manage",
  REPORTS_FINANCE: "reports.finance",
  REPORTS_PRODUCTION: "reports.production",
  REPORTS_STOCK: "reports.stock",
  REPORTS_DEBTS: "reports.debts",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  USERS_DELETE: "users.delete",
  USERS_PERMISSIONS: "users.permissions",
  AUDIT_VIEW: "audit.view",
  AUDIT_DELETE: "audit.delete",
  SETTINGS_EDIT: "settings.edit",
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

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
