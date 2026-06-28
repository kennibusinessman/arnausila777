import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { UserCreate, UserRead, UserRoleUpdate, UserUpdate } from "@/lib/types/user";

export interface ListUsersParams extends Partial<PageParams> {
  search?: string;
}

export const listUsers = (params: ListUsersParams = {}) =>
  http.get<Page<UserRead>>("/users", { params });

export const createUser = (data: UserCreate) => http.post<UserRead>("/users", data);

export const getUser = (userId: string) => http.get<UserRead>(`/users/${userId}`);

export const updateUser = (userId: string, data: UserUpdate) =>
  http.patch<UserRead>(`/users/${userId}`, data);

export const updateUserRole = (userId: string, data: UserRoleUpdate) =>
  http.patch<UserRead>(`/users/${userId}/role`, data);

export const deleteUser = (userId: string) => http.delete<Message>(`/users/${userId}`);
