/** Зеркало backend/app/schemas/user.py */
import type { UserRole } from "./enums";

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
}
