import { clsx } from "clsx";

type StockStatus = "ok" | "low" | "no";

const borderClasses: Record<StockStatus, string> = {
  ok: "border-l-success",
  low: "border-l-warning",
  no: "border-l-danger",
};
const tagClasses: Record<StockStatus, string> = {
  ok: "bg-success-bg text-success",
  low: "bg-warning-bg text-warning",
  no: "bg-danger-bg text-danger",
};
const tagLabels: Record<StockStatus, string> = { ok: "Есть", low: "Мало", no: "Нет" };

interface StockIndicatorProps {
  name: string;
  quantity: string | number;
  unit: string;
  status: StockStatus;
}

export function StockIndicator({ name, quantity, unit, status }: StockIndicatorProps) {
  return (
    <div
      className={clsx(
        "rounded-[10px] border border-border border-l-4 bg-surface p-3.5",
        borderClasses[status]
      )}
    >
      <span
        className={clsx(
          "float-right rounded-full px-2 py-0.5 text-[11.5px] font-bold",
          tagClasses[status]
        )}
      >
        {tagLabels[status]}
      </span>
      <div className="mb-2 text-[13px] font-semibold text-text">{name}</div>
      <div className="text-[22px] font-bold tabular-nums text-text">
        {quantity}
        <span className="ml-1 text-[13px] font-medium text-muted">{unit}</span>
      </div>
    </div>
  );
}
