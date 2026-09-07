import { useAuthStore } from "@/lib/auth/store";
import type { Permission } from "@/lib/types/enums";
import type { UserRead } from "@/lib/types/user";

/**
 * Права текущего пользователя. Итоговый набор считает бэкенд
 * (роль ± индивидуальные права) и отдаёт в UserRead.effective_permissions —
 * фронт только прячет недоступное, доступ всё равно проверяется на API.
 */
export function hasPermission(
  user: Pick<UserRead, "effective_permissions"> | null | undefined,
  ...anyOf: Permission[]
): boolean {
  if (!user) return false;
  return anyOf.some((p) => user.effective_permissions.includes(p));
}

/** `const can = usePermissions(); can(Permission.STOCK_VIEW)` */
export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  return (...anyOf: Permission[]) => hasPermission(user, ...anyOf);
}

/** Короткая проверка одного набора прав (достаточно любого из перечисленных). */
export function useCan(...anyOf: Permission[]): boolean {
  const user = useAuthStore((s) => s.user);
  return hasPermission(user, ...anyOf);
}
