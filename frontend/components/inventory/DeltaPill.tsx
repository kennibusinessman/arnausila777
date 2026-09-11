import { clsx } from "clsx";
import { formatQuantity } from "@/lib/utils/format";

/** Разница инвентаризации: «+20 шт» (приход) / «−5 шт» (расход); withKind — с подписью. */
export function DeltaPill({ delta, unit, withKind = false }: { delta: number; unit: string; withKind?: boolean }) {
  const isIn = delta > 0;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums",
        isIn ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
      )}
    >
      {isIn ? "+" : "−"}
      {formatQuantity(Math.abs(delta))} {unit}
      {withKind && <span className="ml-1 font-medium opacity-80">· {isIn ? "приход" : "расход"}</span>}
    </span>
  );
}
