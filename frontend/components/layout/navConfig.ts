import {
  BarChart3,
  Box,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "@/lib/types/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const { SUPER_ADMIN, BOSS, WAREHOUSE_MANAGER, SHIFT_MASTER, SALES_MANAGER } = UserRole;

/**
 * Один раздел на каждый роутер /api, кроме: /api/warehouses (склад скрыт из интерфейса,
 * подбирается автоматически — lib/utils/warehouseResolution.ts), /api/shipments (отгрузка
 * создаётся вместе с заказом — components/orders/CreateOrderModal.tsx) и /api/expense-categories
 * (своей страницы нет — категория создаётся «на ходу» прямо в форме расхода, см.
 * onCreate в components/expenses/ExpenseForm.tsx).
 */
export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard, roles: [SUPER_ADMIN, BOSS] },
  { href: "/orders", label: "Заказы", icon: ShoppingCart, roles: [SUPER_ADMIN, BOSS, SALES_MANAGER] },
  {
    href: "/shift-reports",
    label: "Сменные отчёты",
    icon: ClipboardList,
    roles: [SUPER_ADMIN, BOSS, SHIFT_MASTER],
  },
  { href: "/stock", label: "Остатки", icon: Package, roles: [SUPER_ADMIN, BOSS, WAREHOUSE_MANAGER] },
  { href: "/expenses", label: "Расходы", icon: Receipt, roles: [SUPER_ADMIN, BOSS] },
  { href: "/payments", label: "Оплаты", icon: Wallet, roles: [SUPER_ADMIN, BOSS, SALES_MANAGER] },
  { href: "/clients", label: "Клиенты", icon: Users, roles: [SUPER_ADMIN, BOSS, SALES_MANAGER] },
  {
    href: "/products",
    label: "Товары",
    icon: Box,
    roles: [SUPER_ADMIN, BOSS, WAREHOUSE_MANAGER, SALES_MANAGER],
  },
  {
    href: "/reports",
    label: "Отчёты",
    icon: BarChart3,
    roles: [SUPER_ADMIN, BOSS, WAREHOUSE_MANAGER, SALES_MANAGER],
  },
  { href: "/users", label: "Пользователи", icon: UserCog, roles: [SUPER_ADMIN, BOSS] },
  { href: "/audit-logs", label: "Журнал аудита", icon: History, roles: [SUPER_ADMIN, BOSS] },
];
