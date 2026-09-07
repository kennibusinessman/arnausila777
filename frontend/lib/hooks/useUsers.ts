import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  deleteUser,
  getPermissionCatalog,
  listUsers,
  updateUser,
  updateUserPermissions,
  updateUserRole,
  type ListUsersParams,
} from "@/lib/api/users";
import { useAuthStore } from "@/lib/auth/store";
import { me as fetchMe } from "@/lib/api/auth";
import type {
  UserCreate,
  UserPermissionsUpdate,
  UserRoleUpdate,
  UserUpdate,
} from "@/lib/types/user";

export function useUsersList(params: ListUsersParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => listUsers(params).then((r) => r.data),
  });
}

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["manager-options"] });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (data: UserCreate) => createUser(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) =>
      updateUser(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateUserRole() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserRoleUpdate }) =>
      updateUserRole(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id).then((r) => r.data),
    onSuccess: invalidate,
  });
}

/** Справочник прав: статичен в пределах версии бэкенда — держим в кэше подольше. */
export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: ["permission-catalog"],
    queryFn: () => getPermissionCatalog().then((r) => r.data),
    staleTime: Infinity,
    enabled,
  });
}

export function useUpdateUserPermissions() {
  const invalidate = useInvalidateUsers();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserPermissionsUpdate }) =>
      updateUserPermissions(id, data).then((r) => r.data),
    onSuccess: async (user) => {
      invalidate();
      // Правим права самому себе — сразу обновляем свою сессию, иначе меню и
      // кнопки останутся по старому набору до перезахода.
      const { user: current, accessToken } = useAuthStore.getState();
      if (current && accessToken && current.id === user.id) {
        const { data: fresh } = await fetchMe();
        setSession(fresh, accessToken);
      }
    },
  });
}
