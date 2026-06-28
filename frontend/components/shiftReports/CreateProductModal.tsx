"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCreateProduct } from "@/lib/hooks/useProducts";
import { apiErrorMessage } from "@/lib/api/http";
import type { ProductRead } from "@/lib/types/product";
import { PRODUCT_CATEGORY, SPUNBOND_SUBCATEGORY } from "@/lib/utils/shiftRawRules";
import { defaultUnit } from "@/lib/utils/productCategories";

interface CreateProductModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (product: ProductRead) => void;
  /** Префилл из дропдауна (введённое наименование). */
  defaultName?: string;
  defaultCategory?: string;
  defaultSubcategory?: string;
}

const CATEGORY_OPTIONS = [
  PRODUCT_CATEGORY.SPUNBOND,
  PRODUCT_CATEGORY.SHEETS,
  PRODUCT_CATEGORY.DASTARKHAN,
];

const SPUNBOND_SUBCATEGORIES = [
  SPUNBOND_SUBCATEGORY.SPUNBOND,
  SPUNBOND_SUBCATEGORY.BOBBINS,
  SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW,
];

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm";

/**
 * Второе поп-ап окно: товара с таким наименованием в справочнике нет — заводим его
 * «на ходу» прямо из формы сменного отчёта. Доступно мастеру смены (см. Creator в
 * backend/app/api/routes/products.py).
 */
export function CreateProductModal({
  open,
  onClose,
  onCreated,
  defaultName = "",
  defaultCategory,
  defaultSubcategory,
}: CreateProductModalProps) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState(defaultCategory ?? PRODUCT_CATEGORY.SPUNBOND);
  const [subcategory, setSubcategory] = useState(defaultSubcategory ?? "");
  // Сырьё-полуфабрикат (Бабины/Дастархан сырьё) меряется в «кг», готовый выпуск — в «шт».
  const [unit, setUnit] = useState(() => defaultUnit({ subcategory: defaultSubcategory }));
  const [error, setError] = useState<string | null>(null);

  const createProduct = useCreateProduct();

  // Каждое открытие — со свежим префиллом из дропдаупа.
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCategory(defaultCategory ?? PRODUCT_CATEGORY.SPUNBOND);
    setSubcategory(defaultSubcategory ?? "");
    setUnit(defaultUnit({ subcategory: defaultSubcategory }));
    setError(null);
  }, [open, defaultName, defaultCategory, defaultSubcategory]);

  const isSpunbond = category === PRODUCT_CATEGORY.SPUNBOND;

  function handleClose() {
    if (createProduct.isPending) return;
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Укажите наименование");
      return;
    }
    if (!unit.trim()) {
      setError("Укажите единицу измерения");
      return;
    }
    setError(null);
    createProduct.mutate(
      {
        name: name.trim(),
        category,
        subcategory: isSpunbond && subcategory ? subcategory : null,
        unit: unit.trim(),
        default_price: "0",
      },
      {
        onSuccess: (product) => onCreated(product),
        onError: (err) => setError(apiErrorMessage(err, "Не удалось создать товар")),
      }
    );
  }

  return (
    <Modal open={open} title="Новый товар" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">Наименование</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createProduct.isPending}
            autoFocus
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Категория</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory("");
              }}
              disabled={createProduct.isPending}
              className={inputClass}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Ед. изм.</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={createProduct.isPending}
              className={inputClass}
            />
          </div>
        </div>

        {isSpunbond && (
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">
              Подкатегория спанбонда
            </label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={createProduct.isPending}
              className={inputClass}
            >
              <option value="">— не указана —</option>
              {SPUNBOND_SUBCATEGORIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              «Бабины» и «Дастархан сырьё» — это полуфабрикат-спанбонд, который идёт в
              простыни и дастархан.
            </p>
          </div>
        )}

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={createProduct.isPending}>
            {createProduct.isPending ? "Создание…" : "Создать товар"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={createProduct.isPending}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
