import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type IconTone = "primary" | "success" | "danger" | "warning" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  tone?: IconTone;
  icon?: LucideIcon;
  hint?: ReactNode;
}

const toneClasses: Record<IconTone, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-indigo/15 text-indigo",
};

export function KpiCard({ label, value, tone = "primary", icon: Icon, hint }: KpiCardProps) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-muted">{label}</span>
        <span className={clsx("flex h-9 w-9 items-center justify-center rounded-xl", toneClasses[tone])}>
          {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2} />}
        </span>
      </div>
      <div className="mt-2 text-[26px] font-bold tracking-tight tabular-nums text-text">{value}</div>
      {hint && <div className="mt-1.5 text-[12.5px] font-semibold">{hint}</div>}
    </div>
  );
}
