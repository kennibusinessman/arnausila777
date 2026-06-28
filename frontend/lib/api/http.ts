import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/lib/auth/store";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "@/lib/auth/tokenStorage";
import type { TokenResponse } from "@/lib/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const http = axios.create({
  baseURL: `${API_URL}/api`,
});

// Голый клиент — без интерсепторов, чтобы вызов /auth/refresh не зацикливался сам на себя.
const plainHttp = axios.create({ baseURL: `${API_URL}/api` });

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  const storedRefreshToken = getStoredRefreshToken();
  if (!storedRefreshToken) throw new Error("Нет refresh-токена");

  const { data } = await plainHttp.post<TokenResponse>("/auth/refresh", {
    refresh_token: storedRefreshToken,
  });
  setStoredRefreshToken(data.refresh_token);
  useAuthStore.getState().setAccessToken(data.access_token);
  return data.access_token;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;

    if (error.response?.status !== 401 || !config || config._retried) {
      throw error;
    }
    if (config.url?.includes("/auth/refresh") || config.url?.includes("/auth/login")) {
      throw error;
    }

    config._retried = true;
    try {
      refreshPromise ??= refreshAccessToken();
      const accessToken = await refreshPromise;
      config.headers.set("Authorization", `Bearer ${accessToken}`);
      return http(config);
    } catch (refreshError) {
      clearStoredRefreshToken();
      useAuthStore.getState().clear();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw refreshError;
    } finally {
      refreshPromise = null;
    }
  }
);

export function apiErrorMessage(error: unknown, fallback = "Произошла ошибка"): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }
  return fallback;
}
