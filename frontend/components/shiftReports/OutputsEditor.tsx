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
      <div className="grid grid-cols-[1fr_100px_100px_28px] gap-2 px-1 text-xs font-semibold text-muted">
        <span>Наименование</span>
        <span>Выпуск</span>
        <span>Брак</span>
        <span />
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_100px_100px_28px] items-start gap-2">
          <Combobox
            value={item.product_id || null}
            onChange={(v) => update(idx, { product_id: v ?? "" })}
            options={options}
            placeholder="Товар"
            disabled={disabled}
            allowClear={false}
            onCreate={onCreateProduct ? (label) => onCreateProduct(label, idx) : undefined}
            creating={creatingIndex === idx}
          />
          <input
            type="number"
            min="0"
            step="0.001"
            value={item.quantity}
            onChange={(e) => update(idx, { quantity: e.target.value })}
            disabled={disabled}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.001"
            value={item.defect_quantity ?? "0"}
            onChange={(e) => update(idx, { defect_quantity: e.target.value })}
            disabled={disabled}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            disabled={disabled}
            className="flex h-9 w-7 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
          >
            ×
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={add} disabled={disabled} className="self-start">
        + Добавить продукцию
      </Button>
    </div>
  );
}
