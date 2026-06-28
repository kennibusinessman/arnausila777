"use client";

import { Combobox } from "@/components/ui/Combobox";
import type { RawSlot } from "@/lib/utils/shiftRawRules";

export interface RawLineState {
  refId: string;
  quantity: string;
}

interface RawAutoEditorProps {
  slots: RawSlot[];
  values: Record<string, RawLineState>;
  onChange: (category: string, patch: Partial<RawLineState>) => void;
  /** Создать сырьё-товар (Бабины / Дастархан сырьё), которого ещё нет. */
  onCreateRaw: (slot: RawSlot, label: string) => void;
  creatingCategory?: string | null;
  disabled?: boolean;
}

const inputClass =
  "rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-2 text-sm";

/**
 * Расход сырья подставляется автоматически по категории выпускаемой продукции
 * (см. lib/utils/shiftRawRules.ts): спанбонд → Полипропилен, простыни → Спанбонд·Бабины,
 * дастархан → Спанбонд·Дастархан сырьё. Мастер указывает только расход — отхода у сырья нет.
 */
export function RawAutoEditor({
  slots,
  values,
  onChange,
  onCreateRaw,
  creatingCategory,
  disabled,
}: RawAutoEditorProps) {
  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[13px] text-muted">
        Добавьте продукцию выше — сырьё подставится автоматически.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_120px] gap-2 px-1 text-xs font-semibold text-muted">
        <span>Сырьё</span>
        <span>Расход</span>
      </div>
      {slots.map((slot) => {
        const state = values[slot.category];
        const refId = state?.refId || slot.options[0]?.value || "";
        const noOptions = slot.options.length === 0;
        return (
          <div key={slot.category} className="grid grid-cols-[1fr_120px] items-start gap-2">
            <div className="flex flex-col gap-1">
              <span className="px-1 text-[11px] font-semibold text-muted">{slot.title}</span>
              <Combobox
                value={refId || null}
                onChange={(v) => onChange(slot.category, { refId: v ?? "" })}
                options={slot.options}
                placeholder={noOptions ? "Нет подходящего сырья" : "Выбрать сырьё"}
                disabled={disabled}
                allowClear={false}
                onCreate={
                  slot.kind === "product"
                    ? (label) => onCreateRaw(slot, label)
                    : undefined
                }
                creating={creatingCategory === slot.category}
              />
            </div>
            <input
              type="number"
              min="0"
              step="0.001"
              value={state?.quantity ?? ""}
              onChange={(e) => onChange(slot.category, { quantity: e.target.value })}
              disabled={disabled}
              placeholder="0"
              className={`mt-[20px] ${inputClass}`}
            />
          </div>
        );
      })}
    </div>
  );
}
