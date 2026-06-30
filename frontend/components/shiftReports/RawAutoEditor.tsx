"use client";

import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import type { RawSlot } from "@/lib/utils/shiftRawRules";

export interface RawLineState {
  refId: string;
  quantity: string;
}

interface RawAutoEditorProps {
  slots: RawSlot[];
  values: Record<string, RawLineState[]>;
  onChange: (category: string, index: number, patch: Partial<RawLineState>) => void;
  onAdd: (category: string) => void;
  onRemove: (category: string, index: number) => void;
  /** Создать сырьё-товар (спанбонд), которого ещё нет в справочнике. */
  onCreateRaw: (slot: RawSlot, index: number, label: string) => void;
  creating?: { category: string; index: number } | null;
  disabled?: boolean;
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-2 text-sm";

const EMPTY_LINE: RawLineState = { refId: "", quantity: "" };

/**
 * Расход сырья карточками (как и выпуск продукции — components/shiftReports/OutputsEditor.tsx),
 * чтобы было удобно на телефоне. Сырьё подставляется по категории выпуска (см.
 * lib/utils/shiftRawRules.ts): спанбонд → Полипропилен, простыни → спанбонд, дастархан →
 * спанбонд. Для простыней слот помечен `multi` — можно указать несколько видов спанбонда
 * кнопкой «Добавить сырьё». Мастер указывает только расход — отхода у сырья нет.
 */
export function RawAutoEditor({
  slots,
  values,
  onChange,
  onAdd,
  onRemove,
  onCreateRaw,
  creating,
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
    <div className="flex flex-col gap-3">
      {slots.map((slot) => {
        const stored = values[slot.category];
        const lines = stored && stored.length > 0 ? stored : [EMPTY_LINE];
        const noOptions = slot.options.length === 0;
        return (
          <div key={slot.category} className="flex flex-col gap-2">
            <span className="px-1 text-[11px] font-semibold text-muted">{slot.title}</span>
            {lines.map((line, i) => {
              // Первая строка по умолчанию подставляет первый вариант (как раньше);
              // добавленные строки начинаются пустыми и выбираются вручную.
              const refId = line.refId || (i === 0 ? slot.options[0]?.value : "") || "";
              const canRemove = !!slot.multi && lines.length > 1;
              return (
                <div key={i} className="rounded-xl border border-border/60 bg-white/50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Combobox
                        value={refId || null}
                        onChange={(v) => onChange(slot.category, i, { refId: v ?? "" })}
                        options={slot.options}
                        placeholder={noOptions ? "Нет подходящего сырья" : "Выбрать сырьё"}
                        disabled={disabled}
                        allowClear={false}
                        onCreate={
                          slot.kind === "product"
                            ? (label) => onCreateRaw(slot, i, label)
                            : undefined
                        }
                        creating={creating?.category === slot.category && creating?.index === i}
                      />
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(slot.category, i)}
                        disabled={disabled}
                        className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                        aria-label="Удалить сырьё"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <label className="mb-1 block text-[11px] font-semibold text-muted">Расход</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity ?? ""}
                      onChange={(e) => onChange(slot.category, i, { quantity: e.target.value })}
                      disabled={disabled}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}
            {slot.multi && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAdd(slot.category)}
                disabled={disabled}
                className="self-start"
              >
                + Добавить сырьё
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
