"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/lib/auth/store";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // AuthProvider уже показывает экран загрузки на время гидратации сессии.
  if (status !== "authenticated") return null;

  return <AppShell>{children}</AppShell>;
}
