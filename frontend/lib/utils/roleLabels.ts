import { UserRole } from "@/lib/types/enums";

export const roleLabels: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Супер-админ",
  [UserRole.BOSS]: "Руководитель",
  [UserRole.WAREHOUSE_MANAGER]: "Завскладом",
  [UserRole.SHIFT_MASTER]: "Мастер смены",
  [UserRole.SALES_MANAGER]: "Менеджер по продажам",
};
