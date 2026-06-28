import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  updateUserRole,
  type ListUsersParams,
} from "@/lib/api/users";
import type { UserCreate, UserRoleUpdate, UserUpdate } from "@/lib/types/user";

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
