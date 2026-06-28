"use client";

import { Combobox } from "@/components/ui/Combobox";
import type { OrderItemCreate } from "@/lib/types/order";
import type { ProductRead } from "@/lib/types/product";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface OrderItemsEditorProps {
  items: OrderItemCreate[];
  onChange: (items: OrderItemCreate[]) => void;
  products: ProductRead[];
  disabled?: boolean;
}

function findProduct(products: ProductRead[], id: string) {
  return products.find((p) => p.id === id);
}

/**
 * 1С-стиль: одно поле поиска товара по названию добавляет новую позицию ниже
 * (а не редактирует существующую). Базовый/общий вес считаются от Product.base_weight.
 */
export function OrderItemsEditor({ items, onChange, products, disabled }: OrderItemsEditorProps) {
  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.sku ? `${p.sku} · ${p.unit}` : p.unit,
  }));

  function updateRow(index: number, patch: Partial<OrderItemCreate>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeRow(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addProduct(productId: string | null) {
    if (!productId) return;
    const product = findProduct(products, productId);
    onChange([
      ...items,
      { product_id: productId, quantity: "1", unit_price: product?.default_price ?? null },
    ]);
  }

  const total = items.reduce((sum, item) => {
    const product = findProduct(products, item.product_id);
    const price = item.unit_price ? Number(item.unit_price) : Number(product?.default_price ?? 0);
    return sum + price * (Number(item.quantity) || 0);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Combobox
          value={null}
          onChange={addProduct}
          options={productOptions}
          placeholder="Начните вводить название товара…"
          disabled={disabled}
          allowClear={false}
        />
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-[13px] text-muted">
          Пока нет позиций — найдите товар выше, он закрепится здесь.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, idx) => {
            const product = findProduct(products, item.product_id);
            const qty = Number(item.quantity) || 0;
            const totalWeight = product?.base_weight ? Number(product.base_weight) * qty : null;
            return (
              <div key={idx} className="rounded-xl border border-border/60 bg-white/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-text">
                    {product?.name ?? "Товар не найден"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={disabled}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                    aria-label="Удалить позицию"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-muted">
                      Количество{product ? `, ${product.unit}` : ""}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                      disabled={disabled}
                      className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-muted">
                      Цена, ₸ за {product?.unit ?? "ед."}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={product?.default_price ?? "0"}
                      value={item.unit_price ?? ""}
                      onChange={(e) => updateRow(idx, { unit_price: e.target.value || null })}
                      disabled={disabled}
                      className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-muted">
                      Базовый вес, кг
                    </label>
                    <div className="rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-sm text-muted">
                      {product?.base_weight ? formatNumber(product.base_weight, 3) : "—"}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-muted">
                      Общий вес, кг
                    </label>
                    <div className="rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-sm font-medium text-text">
                      {totalWeight !== null ? formatNumber(totalWeight, 3) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end text-[13.5px] font-semibold text-text">
        Итого: {formatCurrency(total)}
      </div>
    </div>
  );
}
