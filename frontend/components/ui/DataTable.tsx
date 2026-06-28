import { clsx } from "clsx";
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  header: string;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField: (row: T) => string;
  emptyMessage?: string;
  footer?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  emptyMessage = "Нет данных",
  footer,
}: DataTableProps<T>) {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
          <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                className={clsx(
                  "border-b border-black/[0.06] bg-white/30 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted",
                  col.align === "right" ? "text-right" : "text-left"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={keyField(row)} className="transition-colors hover:bg-white/40">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={clsx(
                      "border-b border-black/[0.04] px-4 py-2.5",
                      col.align === "right" ? "text-right tabular-nums" : "text-left"
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        </table>
      </div>
      {footer && (
        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5 text-[12.5px] text-muted">
          {footer}
        </div>
      )}
    </div>
  );
}
