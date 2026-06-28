import { http } from "@/lib/api/http";
import type {
  ChangePasswordRequest,
  LoginRequest,
  RefreshRequest,
  TokenResponse,
} from "@/lib/types/auth";
import type { Message } from "@/lib/types/common";
import type { UserRead } from "@/lib/types/user";

export const login = (data: LoginRequest) => http.post<TokenResponse>("/auth/login", data);

export const refresh = (data: RefreshRequest) => http.post<TokenResponse>("/auth/refresh", data);

export const logout = (data: RefreshRequest) => http.post<Message>("/auth/logout", data);

export const me = () => http.get<UserRead>("/auth/me");

export const changePassword = (data: ChangePasswordRequest) =>
  http.post<Message>("/auth/change-password", data);
