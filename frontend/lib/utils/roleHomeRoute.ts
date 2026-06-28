import { UserRole } from "@/lib/types/enums";

/** Куда вести пользователя после логина / при заходе на "/", в зависимости от роли. */
export function roleHomeRoute(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.BOSS:
      return "/dashboard";
    case UserRole.SALES_MANAGER:
      return "/orders";
    case UserRole.WAREHOUSE_MANAGER:
      return "/stock";
    case UserRole.SHIFT_MASTER:
      return "/shift-reports";
    default:
      return "/orders";
  }
}
