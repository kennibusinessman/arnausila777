import { create } from "zustand";
import type { UserRead } from "@/lib/types/user";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: UserRead | null;
  accessToken: string | null;
  status: AuthStatus;
  setSession: (user: UserRead, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
}));
