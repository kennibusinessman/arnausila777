import { clsx } from "clsx";
import type { StatusStyle } from "@/lib/utils/statusStyles";

export function Badge({ label, className }: StatusStyle) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
