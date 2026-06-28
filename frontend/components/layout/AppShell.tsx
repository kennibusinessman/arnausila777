"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { navItems } from "@/components/layout/navConfig";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    // Снизу резервируем место под фиксированный таб-бар (только до lg, где он скрыт).
    <div className="flex min-h-screen gap-4 px-2 pt-2 pb-[calc(72px+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 lg:pb-4">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
        <Topbar title={current?.label ?? "Spunbond CRM"} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
