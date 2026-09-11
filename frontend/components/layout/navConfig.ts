import {
  BarChart3,
  Box,
  ClipboardList,
  ClipboardPen,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  SlidersHorizontal,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { Permission } from "@/lib/types/enums";
import type { UserRead } from "@/lib/types/user";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Раздел виден, если есть хотя бы одно из этих прав. */
  permissions: Permission[];
}

/**
 * Один раздел на каждый роутер /api, кроме: /api/warehouses (склад скрыт из интерфейса,
 * подбирается автоматически — lib/utils/warehouseResolution.ts), /api/shipments (отгрузка
 * создаётся вместе с заказом — components/orders/CreateOrderModal.tsx) и /api/expense-categories
 * (своей страницы нет — категория создаётся «на ходу» прямо в форме расхода, см.
 * onCreate в components/expenses/ExpenseForm.tsx).
 *
 * Видимость раздела задаётся правом, а не ролью: супер-админ может выдать или
 * отобрать конкретное право отдельному пользователю (страница «Пользователи»).
 */
export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Дашборд",
    icon: LayoutDashboard,
    permissions: [Permission.DASHBOARD_VIEW],
  },
  {
    href: "/orders",
    label: "Заказы",
    icon: ShoppingCart,
    permissions: [Permission.ORDERS_VIEW],
  },
  {
    href: "/shift-reports",
    label: "Сменные отчёты",
    icon: ClipboardList,
    permissions: [Permission.SHIFT_REPORTS_VIEW, Permission.SHIFT_REPORTS_VIEW_ALL],
  },
  { href: "/stock", label: "Остатки", icon: Package, permissions: [Permission.STOCK_VIEW] },
  // Правка остатков «как есть» — по умолчанию только у супер-админа (право stock.inventory).
  {
    href: "/inventory",
    label: "Инвентаризация",
    icon: ClipboardPen,
    permissions: [Permission.STOCK_INVENTORY],
  },
  { href: "/expenses", label: "Расходы", icon: Receipt, permissions: [Permission.EXPENSES_VIEW] },
  { href: "/payments", label: "Оплаты", icon: Wallet, permissions: [Permission.PAYMENTS_VIEW] },
  { href: "/clients", label: "Клиенты", icon: Users, permissions: [Permission.CLIENTS_VIEW] },
  { href: "/products", label: "Товары", icon: Box, permissions: [Permission.PRODUCTS_VIEW] },
  {
    href: "/reports",
    label: "Отчёты",
    icon: BarChart3,
    permissions: [
      Permission.REPORTS_FINANCE,
      Permission.REPORTS_PRODUCTION,
      Permission.REPORTS_STOCK,
      Permission.REPORTS_DEBTS,
      Permission.PAYMENTS_VIEW,
      Permission.CLIENTS_VIEW_DETAILS,
      Permission.SHIFT_REPORTS_VIEW_ALL,
    ],
  },
  { href: "/users", label: "Пользователи", icon: UserCog, permissions: [Permission.USERS_VIEW] },
  {
    href: "/audit-logs",
    label: "Журнал аудита",
    icon: History,
    permissions: [Permission.AUDIT_VIEW],
  },
  {
    href: "/settings",
    label: "Настройки",
    icon: SlidersHorizontal,
    permissions: [Permission.SETTINGS_EDIT],
  },
];

/** Разделы, доступные пользователю, в порядке навигации. */
export function visibleNavItems(user: UserRead | null | undefined): NavItem[] {
  if (!user) return [];
  return navItems.filter((item) => hasPermission(user, ...item.permissions));
}
