"use client";

import { useEffect } from "react";
import { refreshAccessToken } from "@/lib/api/http";
import { me as fetchMe } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/auth/store";
import { getStoredRefreshToken } from "@/lib/auth/tokenStorage";

/**
 * При загрузке приложения восстанавливает сессию из refresh-токена в localStorage:
 * получает свежий access-токен и текущего пользователя, не дожидаясь 401 от первого запроса.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!getStoredRefreshToken()) {
        if (!cancelled) clear();
        return;
      }
      try {
        await refreshAccessToken();
        const { data: user } = await fetchMe();
        if (!cancelled) setSession(user, useAuthStore.getState().accessToken!);
      } catch {
        if (!cancelled) clear();
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-muted text-sm">
        Загрузка...
      </div>
    );
  }

  return <>{children}</>;
}
