"use client";

import { clsx } from "clsx";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CreateProductModal } from "@/components/shiftReports/CreateProductModal";
import { OutputsEditor } from "@/components/shiftReports/OutputsEditor";
import { RawAutoEditor, type RawLineState } from "@/components/shiftReports/RawAutoEditor";
import { useMaterialOptions } from "@/lib/hooks/useMaterials";
import { useProductOptions } from "@/lib/hooks/useProducts";
import { ShiftType } from "@/lib/types/enums";
import type { ProductRead } from "@/lib/types/product";
import type { MaterialIn, OutputIn } from "@/lib/types/shiftReport";
import { SHIFT_TYPE_LABELS } from "@/lib/utils/shiftLabels";
import {
  CATEGORY_COLOR,
  CATEGORY_ORDER,
  PRODUCT_CATEGORY,
  categoryOfProduct,
  rawSlotsForCategories,
  type RawSlot,
} from "@/lib/utils/shiftRawRules";

export interface ShiftReportFormValues {
  shift_date: string;
  shift_type: ShiftType;
  comment: string;
  downtime_hours: string;
  outputs: OutputIn[];
  materials: MaterialIn[];
}

interface ShiftReportFormProps {
  initial: ShiftReportFormValues;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: ShiftReportFormValues) => void;
  onCancel?: () => void;
}

const SHIFT_META: Record<ShiftType, { label: string; icon: typeof Sun }> = {
  [ShiftType.SHIFT_1]: { label: SHIFT_TYPE_LABELS[ShiftType.SHIFT_1], icon: Sun },
  [ShiftType.SHIFT_2]: { label: SHIFT_TYPE_LABELS[ShiftType.SHIFT_2], icon: Moon },
};

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm";

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

type CreateCtx =
  | { kind: "output"; index: number; label: string }
  | { kind: "raw"; slot: RawSlot; label: string };

export function ShiftReportForm({
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ShiftReportFormProps) {
  const [shiftDate, setShiftDate] = useState(initial.shift_date);
  const [shiftType, setShiftType] = useState<ShiftType>(initial.shift_type);
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORY.SPUNBOND);
  const [comment, setComment] = useState(initial.comment);
  const [downtimeHours, setDowntimeHours] = useState(initial.downtime_hours);
  const [outputs, setOutputs] = useState<OutputIn[]>(initial.outputs);
  const [rawValues, setRawValues] = useState<Record<string, RawLineState>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [createCtx, setCreateCtx] = useState<CreateCtx | null>(null);

  const productsQuery = useProductOptions();
  const materialsQuery = useMaterialOptions();
  const products = productsQuery.data ?? [];
  const materials = materialsQuery.data ?? [];

  // В выпуске показываем только товары выбранной категории.
  const categoryProducts = useMemo(
    () => products.filter((p) => norm(p.category) === norm(category)),
    [products, category]
  );

  // Слот сырья определяется выбранной категорией:
  // Спанбонд → Полипропилен; Простыни → Спанбонд·Бабины; Дастархан → Спанбонд·Дастархан сырьё.
  const slots = useMemo(
    () => rawSlotsForCategories([category], products, materials),
    [category, products, materials]
  );

  // В режиме правки: разово выводим категорию из уже сохранённого выпуска,
  // когда справочник товаров загружен.
  const catSeededRef = useRef(false);
  useEffect(() => {
    if (catSeededRef.current) return;
    if (initial.outputs.length === 0) {
      catSeededRef.current = true;
      return;
    }
    if (products.length === 0) return;
    const firstId = initial.outputs[0]?.product_id;
    const c = firstId ? categoryOfProduct(firstId, products) : null;
    if (c) setCategory(c);
    catSeededRef.current = true;
  }, [initial.outputs, products]);

  // В режиме правки: разово раскладываем сохранённое сырьё по слотам. Слот один и
  // определяется категорией выпуска отчёта: сырьё-материал (Полипропилен) → слот
  // «Спанбонд», сырьё-полуфабрикат (любой спанбонд) → слот категории выпуска.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initial.materials.length === 0) {
      seededRef.current = true;
      return;
    }
    if (products.length === 0) return;
    const firstOutputId = initial.outputs[0]?.product_id;
    const outputCat = firstOutputId ? categoryOfProduct(firstOutputId, products) : null;
    const next: Record<string, RawLineState> = {};
    for (const line of initial.materials) {
      const key = line.material_id ? PRODUCT_CATEGORY.SPUNBOND : outputCat;
      if (!key) continue;
      next[key] = {
        refId: line.material_id || line.product_id || "",
        quantity: line.quantity_used,
      };
    }
    setRawValues(next);
    seededRef.current = true;
  }, [initial.materials, initial.outputs, products]);

  function changeCategory(next: string) {
    if (next === category) return;
    // Смена категории: товары и сырьё прежней категории больше не подходят.
    setCategory(next);
    setOutputs([]);
    setRawValues({});
  }

  function updateRaw(slotCategory: string, patch: Partial<RawLineState>) {
    setRawValues((prev) => ({
      ...prev,
      [slotCategory]: {
        refId: prev[slotCategory]?.refId ?? "",
        quantity: prev[slotCategory]?.quantity ?? "",
        ...patch,
      },
    }));
  }

  function handleCreated(product: ProductRead) {
    if (!createCtx) return;
    if (createCtx.kind === "output") {
      const index = createCtx.index;
      setOutputs((prev) =>
        prev.map((o, i) => (i === index ? { ...o, product_id: product.id } : o))
      );
    } else {
      updateRaw(createCtx.slot.category, { refId: product.id });
    }
    setCreateCtx(null);
  }

  function buildMaterials(): MaterialIn[] {
    const result: MaterialIn[] = [];
    for (const slot of slots) {
      const state = rawValues[slot.category];
      const refId = state?.refId || slot.options[0]?.value || "";
      const quantity = state?.quantity ?? "";
      if (!refId || !(Number(quantity) > 0)) continue;
      result.push(
        slot.kind === "material"
          ? { material_id: refId, quantity_used: quantity }
          : { product_id: refId, quantity_used: quantity }
      );
    }
    return result;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftDate) {
      setLocalError("Укажите дату смены");
      return;
    }
    const validOutputs = outputs.filter((o) => o.product_id && Number(o.quantity) > 0);
    if (validOutputs.length === 0) {
      setLocalError("Добавьте хотя бы одну позицию выпуска");
      return;
    }
    setLocalError(null);
    onSubmit({
      shift_date: shiftDate,
      shift_type: shiftType,
      comment,
      downtime_hours: downtimeHours === "" ? "0" : downtimeHours,
      outputs: validOutputs,
      materials: buildMaterials(),
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Дата смены</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Смена</label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border-[1.5px] border-border bg-white/60 p-1">
              {Object.values(ShiftType).map((t) => {
                const meta = SHIFT_META[t];
                const Icon = meta.icon;
                const active = shiftType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setShiftType(t)}
                    className={clsx(
                      "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                      active ? "bg-white text-text shadow-sm" : "text-muted hover:text-text"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Категория</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ORDER.map((c) => {
              const active = norm(category) === norm(c);
              const color = CATEGORY_COLOR[c] ?? "#5b8def";
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => changeCategory(c)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-xl border-[1.5px] px-3.5 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-white text-text shadow-sm"
                      : "border-border bg-white/50 text-muted hover:text-text"
                  )}
                  style={active ? { borderColor: color } : undefined}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">
              Простой за смену, ч
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={downtimeHours}
              onChange={(e) => setDowntimeHours(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">
              Комментарий (необязательно)
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Выпуск продукции</label>
          <OutputsEditor
            items={outputs}
            onChange={setOutputs}
            products={categoryProducts}
            onCreateProduct={(label, index) => setCreateCtx({ kind: "output", index, label })}
            creatingIndex={createCtx?.kind === "output" ? createCtx.index : null}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">
            Расход сырья · автоматически
          </label>
          <RawAutoEditor
            slots={slots}
            values={rawValues}
            onChange={updateRaw}
            onCreateRaw={(slot, label) => setCreateCtx({ kind: "raw", slot, label })}
            creatingCategory={createCtx?.kind === "raw" ? createCtx.slot.category : null}
          />
        </div>

        {(localError || error) && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{localError || error}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохранение…" : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
              Отмена
            </Button>
          )}
        </div>
      </form>

      <CreateProductModal
        open={createCtx !== null}
        onClose={() => setCreateCtx(null)}
        onCreated={handleCreated}
        defaultName={createCtx?.label ?? ""}
        defaultCategory={createCtx?.kind === "raw" ? createCtx.slot.defaultCategory : category}
        defaultSubcategory={createCtx?.kind === "raw" ? createCtx.slot.defaultSubcategory : undefined}
      />
    </>
  );
}
