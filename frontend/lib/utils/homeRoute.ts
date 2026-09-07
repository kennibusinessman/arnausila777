import { visibleNavItems } from "@/components/layout/navConfig";
import { UserRole } from "@/lib/types/enums";
import type { UserRead } from "@/lib/types/user";

/** Привычный «свой» раздел роли — если он пользователю доступен. */
const ROLE_PREFERRED: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "/dashboard",
  [UserRole.BOSS]: "/dashboard",
  [UserRole.SALES_MANAGER]: "/orders",
  [UserRole.WAREHOUSE_MANAGER]: "/stock",
  [UserRole.SHIFT_MASTER]: "/shift-reports",
};

/**
 * Куда вести пользователя после логина / при заходе на "/".
 * Индивидуальные права могут закрыть «родной» раздел роли — тогда открываем
 * первый доступный раздел меню.
 */
export function homeRoute(user: UserRead | null | undefined): string {
  const items = visibleNavItems(user);
  const preferred = user ? ROLE_PREFERRED[user.role] : undefined;
  if (preferred && items.some((item) => item.href === preferred)) return preferred;
  return items[0]?.href ?? "/orders";
}
