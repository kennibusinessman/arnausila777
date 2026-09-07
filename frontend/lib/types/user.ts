/** Зеркало backend/app/schemas/user.py */
import type { Permission, UserRole } from "./enums";

export interface UserCreate {
  full_name: string;
  phone?: string | null;
  email: string;
  role: UserRole;
  temp_password: string;
  is_active?: boolean;
}

export interface UserUpdate {
  full_name?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
}

export interface UserRoleUpdate {
  role: UserRole;
}

/**
 * Полная замена индивидуальных прав: ключ — право, значение — выдать (true)
 * или отобрать (false) относительно набора роли. Пустой объект = «как у роли».
 */
export interface UserPermissionsUpdate {
  permissions: Partial<Record<Permission, boolean>>;
}

export interface UserRead {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  /** Только отклонения от прав роли. */
  permissions: Partial<Record<Permission, boolean>>;
  /** Итоговый набор прав — на него опирается интерфейс. */
  effective_permissions: Permission[];
}

export interface PermissionItem {
  key: Permission;
  label: string;
}

export interface PermissionGroup {
  group: string;
  items: PermissionItem[];
}

export interface PermissionCatalog {
  groups: PermissionGroup[];
  role_defaults: Record<UserRole, Permission[]>;
}
