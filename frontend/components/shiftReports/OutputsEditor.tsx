"use client";

import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import type { OutputIn } from "@/lib/types/shiftReport";
import type { ProductRead } from "@/lib/types/product";

interface OutputsEditorProps {
  items: OutputIn[];
  onChange: (items: OutputIn[]) => void;
  products: ProductRead[];
  disabled?: boolean;
  /** Открывает второе поп-ап для создания товара, которого нет в справочнике. */
  onCreateProduct?: (label: string, rowIndex: number) => void;
  /** Индекс строки, для которой сейчас создаётся товар (показывает «Создание…»). */
  creatingIndex?: number | null;
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-2 text-sm";

/**
 * Выпуск продукции карточками: каждая позиция — отдельная карточка (товар + выпуск +
 * брак), чтобы было удобно на телефоне (тесная таблица «съезжала» на узком экране).
 * Тот же стиль, что и позиции заказа (см. components/orders/OrderItemsEditor.tsx).
 */
export function OutputsEditor({
  items,
  onChange,
  products,
  disabled,
  onCreateProduct,
  creatingIndex,
}: OutputsEditorProps) {
  const options = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.category ?? p.unit,
  }));

  function update(index: number, patch: Partial<OutputIn>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...items, { product_id: "", quantity: "1", defect_quantity: "0" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-[13px] text-muted">
          Пока нет позиций — добавьте продукцию кнопкой ниже.
        </p>
      ) : (
        items.map((item, idx) => {
          const product = products.find((p) => p.id === item.product_id);
          const unit = product?.unit ?? "";
          return (
            <div key={idx} className="rounded-xl border border-border/60 bg-white/50 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Combobox
                    value={item.product_id || null}
                    onChange={(v) => update(idx, { product_id: v ?? "" })}
                    options={options}
                    placeholder="Найдите товар по названию…"
                    disabled={disabled}
                    allowClear={false}
                    onCreate={onCreateProduct ? (label) => onCreateProduct(label, idx) : undefined}
                    creating={creatingIndex === idx}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={disabled}
                  className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                  aria-label="Удалить позицию"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-muted">
                    Выпуск{unit ? `, ${unit}` : ""}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => update(idx, { quantity: e.target.value })}
                    disabled={disabled}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-muted">
                    Брак{unit ? `, ${unit}` : ""}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.defect_quantity ?? "0"}
                    onChange={(e) => update(idx, { defect_quantity: e.target.value })}
                    disabled={disabled}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          );
        })
      )}
      <Button type="button" variant="ghost" size="sm" onClick={add} disabled={disabled} className="self-start">
        + Добавить продукцию
      </Button>
    </div>
  );
}
