"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/components/layout/navConfig";
import { useAuthStore } from "@/lib/auth/store";

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const items = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <aside className="glass sticky top-4 hidden h-[calc(100vh-2rem)] w-[230px] shrink-0 flex-col rounded-3xl px-3 py-4 lg:flex">
      <div className="mb-5 flex items-center gap-2.5 px-2 py-1.5 text-[15px] font-bold tracking-tight text-text">
        <span className="h-[28px] w-[28px] rounded-[9px] bg-gradient-to-br from-primary to-indigo shadow-sm shadow-primary/30" />
        Spunbond CRM
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-white/70 text-text shadow-sm shadow-black/5 backdrop-blur-xl"
                  : "text-muted hover:bg-white/30 hover:text-text"
              )}
            >
              <Icon className="h-[16px] w-[16px] shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
