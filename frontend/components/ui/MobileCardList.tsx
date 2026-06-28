import type { ReactNode } from "react";

interface MobileCardListProps<T> {
  rows: T[];
  keyField: (row: T) => string;
  /** Карточка одной строки (обычно <button> с onClick, открывающим поп-ап). */
  renderCard: (row: T) => ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Пагинация/итоги — те же, что и под таблицей на десктопе. */
  footer?: ReactNode;
}

/**
 * Мобильная замена таблицы: на десктопе скрыта (lg+ показывает обычную таблицу),
 * на телефоне/планшете рендерит вертикальный список карточек. См. образец в
 * app/(app)/orders/page.tsx.
 */
export function MobileCardList<T>({
  rows,
  keyField,
  renderCard,
  isLoading,
  emptyMessage = "Нет данных",
  footer,
}: MobileCardListProps<T>) {
  return (
    <div className="lg:hidden">
      {isLoading ? null : rows.length === 0 ? (
        <p className="py-10 text-center text-[13.5px] text-muted">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={keyField(row)}>{renderCard(row)}</div>
          ))}
        </div>
      )}
      {footer && (
        <div className="mt-3 flex items-center justify-between gap-2 px-1 text-[12.5px] text-muted">
          {footer}
        </div>
      )}
    </div>
  );
}
