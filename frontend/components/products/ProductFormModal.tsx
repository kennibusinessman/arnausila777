"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCreateProduct, useUpdateProduct } from "@/lib/hooks/useProducts";
import { apiErrorMessage } from "@/lib/api/http";
import type { ProductRead } from "@/lib/types/product";
import { PRODUCT_CATEGORIES, SPUNBOND_SUBCATEGORIES } from "@/lib/utils/productCategories";

const SPUNBOND = "Спанбонд";

interface FormState {
  name: string;
  sku: string;
  category: string;
  subcategory: string;
  unit: string;
  default_price: string;
  base_weight: string;
  min_stock: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  name: "",
  sku: "",
  category: "",
  subcategory: "",
  unit: "шт",
  default_price: "0",
  base_weight: "",
  min_stock: "0",
  is_active: true,
};

interface ProductFormModalProps {
  open: boolean;
  /** null — создание нового товара; иначе — карточка существующего (правка всех полей). */
  product: ProductRead | null;
  onClose: () => void;
  onSaved?: (product: ProductRead) => void;
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm";

/** Полная карточка товара в модалке: все поля редактируемы. Используется на страницах
 *  «Товары» и «Остатки» (клик по наименованию). */
export function ProductFormModal({ open, product, onClose, onSaved }: ProductFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const submitting = createProduct.isPending || updateProduct.isPending;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? "",
        category: product.category ?? "",
        subcategory: product.subcategory ?? "",
        unit: product.unit,
        default_price: product.default_price,
        base_weight: product.base_weight ?? "",
        min_stock: product.min_stock ?? "0",
        is_active: product.is_active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, product]);

  const requiresBaseWeight = form.category === "Спанбонд" || form.category === "Одноразовые простыни";
  const requiresSubcategory = form.category === SPUNBOND;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) {
      setError("Укажите название и единицу измерения");
      return;
    }
    if (requiresBaseWeight && (!form.base_weight || Number(form.base_weight) <= 0)) {
      setError(`Для категории «${form.category}» обязателен вес единицы, кг`);
      return;
    }
    if (requiresSubcategory && !form.subcategory) {
      setError("Для категории «Спанбонд» обязательна подкатегория");
      return;
    }
    const payload = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      subcategory: requiresSubcategory ? form.subcategory || null : null,
      unit: form.unit,
      default_price: form.default_price || "0",
      base_weight: form.base_weight || null,
      min_stock: form.min_stock || "0",
      is_active: form.is_active,
    };
    const mutation = product
      ? updateProduct.mutateAsync({ id: product.id, data: payload })
      : createProduct.mutateAsync(payload);
    mutation
      .then((saved) => {
        onSaved?.(saved);
        onClose();
      })
      .catch((err) => setError(apiErrorMessage(err, "Не удалось сохранить товар")));
  }

  return (
    <Modal open={open} title={product ? "Карточка товара" : "Новый товар"} onClose={handleClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">Название</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">SKU</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Категория</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}
              className={inputClass}
            >
              <option value="">Без категории</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {requiresSubcategory && (
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">
              Подкатегория<span className="text-danger"> *</span>
            </label>
            <select
              value={form.subcategory}
              onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
              className={inputClass}
            >
              <option value="">Выберите подкатегорию</option>
              {SPUNBOND_SUBCATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Единица</label>
            <input
              type="text"
              placeholder="шт, рул., кг"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Цена по умолчанию</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.default_price}
              onChange={(e) => setForm({ ...form, default_price: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">
              Вес ед., кг{requiresBaseWeight && <span className="text-danger"> *</span>}
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder={requiresBaseWeight ? "обязательно" : "необязательно"}
              value={form.base_weight}
              onChange={(e) => setForm({ ...form, base_weight: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">
            Мин. остаток (порог «Заканчивается»)
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="0 — без контроля остатка"
            value={form.min_stock}
            onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-text">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Активен
        </label>

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="mt-1 flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохранение…" : product ? "Сохранить" : "Создать"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
