import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

/** Класс для «главной» кнопки/ссылки внизу поп-апа (напр. «Открыть полностью»). */
export const modalPrimaryBtn =
  "inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-indigo px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_8px_20px_rgba(110,110,240,0.34)] transition-opacity hover:opacity-95";

export interface DetailField {
  label: string;
  value: ReactNode;
  /** Растянуть на всю ширину (для длинных значений — комментарий, адрес). */
  full?: boolean;
}

interface DetailModalProps {
  open: boolean;
  title: string;
  /** Шапка под заголовком — например, аватар клиента или статус-чип. */
  subtitle?: ReactNode;
  fields: DetailField[];
  /** Доп. содержимое (список позиций, движения и т.п.). */
  children?: ReactNode;
  /** Кнопки внизу (Изменить / Удалить / Открыть полностью). */
  actions?: ReactNode;
  onClose: () => void;
}

/** Поп-ап с полной информацией по сущности: сетка «лейбл + значение» + опц. содержимое и кнопки. */
export function DetailModal({ open, title, subtitle, fields, children, actions, onClose }: DetailModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {subtitle}
        {fields.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {fields.map((f, i) => (
              <div
                key={i}
                className={`rounded-2xl border border-white/60 bg-white/40 px-3 py-2.5 ${f.full ? "col-span-2" : ""}`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{f.label}</div>
                <div className="mt-0.5 text-[13.5px] font-medium text-text">{f.value}</div>
              </div>
            ))}
          </div>
        )}
        {children}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Modal>
  );
}
