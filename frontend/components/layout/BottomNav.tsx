"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { navItems } from "@/components/layout/navConfig";
import { useAuthStore } from "@/lib/auth/store";

/** Нижний таб-бар для телефонов/планшетов (как в zakk/mobile.html). На десктопе (lg+) скрыт. */

const MAX_TABS = 4; // 4 вкладки + «Ещё», если разделов больше пяти

/** Короткие подписи для узких вкладок таб-бара (полные остаются в навигации/листе «Ещё»). */
const SHORT_LABEL: Record<string, string> = {
  "/shift-reports": "Смены",
  "/audit-logs": "Аудит",
  "/users": "Доступы",
};

export function BottomNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const items = navItems.filter((item) => role && item.roles.includes(role));
  const [sheetOpen, setSheetOpen] = useState(false);

  // Закрываем лист «Ещё» при переходе на другую страницу.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const useMore = items.length > 5;
  const tabs = useMore ? items.slice(0, MAX_TABS) : items.slice(0, 5);
  const overflow = useMore ? items.slice(MAX_TABS) : [];
  const overflowActive = overflow.some((i) => isActive(i.href));

  return (
    <>
      {/* Лист «Ещё» — выезжает снизу */}
      {useMore && (
        <div
          className={clsx("fixed inset-0 z-50 lg:hidden", sheetOpen ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!sheetOpen}
        >
          <div
            onClick={() => setSheetOpen(false)}
            className={clsx(
              "absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
              sheetOpen ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={clsx(
              "glass-strong absolute inset-x-0 bottom-0 rounded-t-[28px] px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] transition-transform duration-300 ease-out",
              sheetOpen ? "translate-y-0" : "translate-y-full"
            )}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15" />
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[15px] font-bold tracking-tight text-text">Ещё</span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Закрыть"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/60 hover:text-text"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {overflow.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={clsx(
                      "flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors",
                      active
                        ? "border-primary/30 bg-primary-50 text-primary"
                        : "border-white/70 bg-white/55 text-muted hover:text-text"
                    )}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
                    <span className="text-[12px] font-medium leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Таб-бар */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/60 bg-white/80 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(40,50,90,0.08)] backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
        {tabs.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5"
            >
              <Icon
                className={clsx("h-[22px] w-[22px] shrink-0", active ? "text-primary" : "text-muted")}
                strokeWidth={active ? 2.1 : 1.8}
              />
              <span
                className={clsx(
                  "max-w-full truncate text-[10px] leading-none",
                  active ? "font-semibold text-primary" : "font-medium text-muted"
                )}
              >
                {SHORT_LABEL[item.href] ?? item.label}
              </span>
            </Link>
          );
        })}
        {useMore && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5"
          >
            <MoreHorizontal
              className={clsx("h-[22px] w-[22px] shrink-0", overflowActive ? "text-primary" : "text-muted")}
              strokeWidth={overflowActive ? 2.1 : 1.8}
            />
            <span
              className={clsx(
                "text-[10px] leading-none",
                overflowActive ? "font-semibold text-primary" : "font-medium text-muted"
              )}
            >
              Ещё
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
