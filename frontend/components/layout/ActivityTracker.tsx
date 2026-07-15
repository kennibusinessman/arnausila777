"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { navItems } from "@/components/layout/navConfig";
import { logActivity } from "@/lib/api/activity";

/** Сопоставляет путь с разделом: «/orders/123» → «Заказы». */
function sectionLabel(pathname: string): string | null {
  const match = navItems.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return match?.label ?? null;
}

/** Пишет в журнал «открытие раздела» при переходах. Дедуп по разделу: переход
 *  внутри одного раздела (список → карточка) не плодит записи. Ничего не рисует. */
export function ActivityTracker() {
  const pathname = usePathname();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    const label = sectionLabel(pathname);
    if (!label || label === lastLogged.current) return;
    lastLogged.current = label;
    logActivity("page", label);
  }, [pathname]);

  return null;
}
