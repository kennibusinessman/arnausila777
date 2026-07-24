"use client";

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCreateMaterial, useUpdateMaterial } from "@/lib/hooks/useMaterials";
import { apiErrorMessage } from "@/lib/api/http";
import { RAW_MATERIAL_SUBCATEGORIES } from "@/lib/utils/productCategories";
import type { MaterialRead } from "@/lib/types/material";

interface FormState {
  name: string;
  sku: string;
  category: string;
  unit: string;
  min_stock: string;
  is_active: boolean;
}

const emptyForm: FormState = { name: "", sku: "", category: "", unit: "кг", min_stock: "0", is_active: true };

interface MaterialFormModalProps {
  open: boolean;
  /** null — создание; иначе — карточка существующего материала (правка всех полей). */
  material: MaterialRead | null;
  onClose: () => void;
  onSaved?: (material: MaterialRead) => void;
  /** Если задан и материал существует — показываем кнопку «Движения» (история склада). */
  onShowHistory?: (material: MaterialRead) => void;
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm";

/** Полная карточка материала в модалке. Используется на страницах «Сырьё» и «Остатки». */
export function MaterialFormModal({ open, material, onClose, onSaved, onShowHistory }: MaterialFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const submitting = createMaterial.isPending || updateMaterial.isPending;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (material) {
      setForm({
        name: material.name,
        sku: material.sku ?? "",
        category: material.category ?? "",
        unit: material.unit,
        min_stock: material.min_stock ?? "0",
        is_active: material.is_active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, material]);

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
    const payload = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit,
      min_stock: form.min_stock || "0",
      is_active: form.is_active,
    };
    const mutation = material
      ? updateMaterial.mutateAsync({ id: material.id, data: payload })
      : createMaterial.mutateAsync(payload);
    mutation
      .then((saved) => {
        onSaved?.(saved);
        onClose();
      })
      .catch((err) => setError(apiErrorMessage(err, "Не удалось сохранить материал")));
  }

  return (
    <Modal open={open} title={material ? "Карточка материала" : "Новый материал"} onClose={handleClose}>
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
        <div className="grid grid-cols-2 items-start gap-3">
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
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputClass}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {RAW_MATERIAL_SUBCATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: form.category === c ? "" : c })}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                    form.category === c
                      ? "border-primary/40 bg-primary-50 text-primary"
                      : "border-border bg-white/60 text-muted hover:text-text"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Единица</label>
            <input
              type="text"
              placeholder="кг, рул., л."
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Мин. остаток</label>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="0 — без контроля"
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
              className={inputClass}
            />
          </div>
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
            {submitting ? "Сохранение…" : material ? "Сохранить" : "Создать"}
          </Button>
          {material && onShowHistory && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onShowHistory(material)}
              disabled={submitting}
            >
              Движения
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
