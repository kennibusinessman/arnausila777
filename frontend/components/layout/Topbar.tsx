"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout as logoutRequest } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/auth/store";
import { clearStoredRefreshToken, getStoredRefreshToken } from "@/lib/auth/tokenStorage";
import { roleLabels } from "@/lib/utils/roleLabels";
import { Button } from "@/components/ui/Button";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const refreshToken = getStoredRefreshToken();
    try {
      if (refreshToken) await logoutRequest({ refresh_token: refreshToken });
    } catch {
      // даже если запрос не удался, разлогиниваем локально
    } finally {
      clearStoredRefreshToken();
      clear();
      router.replace("/login");
    }
  }

  const initials = user?.full_name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="glass flex h-16 shrink-0 items-center justify-between gap-3 rounded-3xl px-4 sm:px-6">
      <h2 className="truncate text-base font-bold tracking-tight text-text sm:text-lg">{title}</h2>
      <div className="flex items-center gap-2 sm:gap-4">
        {user && (
          <div className="flex items-center gap-2.5 text-[12.5px]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo text-sm font-semibold text-white shadow-sm shadow-primary/30">
              {initials}
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-semibold text-text">{user.full_name}</span>
              <span className="text-muted">{roleLabels[user.role]}</span>
            </span>
          </div>
        )}
        <Button variant="secondary" size="sm" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "Выходим…" : "Выйти"}
        </Button>
      </div>
    </header>
  );
}
