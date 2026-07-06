"use client";

import { clsx } from "clsx";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CreateProductModal } from "@/components/shiftReports/CreateProductModal";
import { OutputsEditor, type OutputRow } from "@/components/shiftReports/OutputsEditor";
import { RawAutoEditor, type RawLineState } from "@/components/shiftReports/RawAutoEditor";
import { useAuthStore } from "@/lib/auth/store";
import { useMaterialOptions } from "@/lib/hooks/useMaterials";
import { useProductOptions } from "@/lib/hooks/useProducts";
import { ShiftType } from "@/lib/types/enums";
import type { ProductRead } from "@/lib/types/product";
import type { MaterialIn, OutputIn } from "@/lib/types/shiftReport";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { printShiftLabels } from "@/lib/utils/printLabels";
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

// Сколько этикеток печатать на позицию — по «Выпуску» (10 шт → 10 этикеток),
// минимум 1, с потолком 500, чтобы опечатка не отправила тысячи страниц на печать.
function labelsForOutput(quantity: string): number {
  const n = Math.round(Number(quantity) || 0);
  return Math.min(500, Math.max(1, n));
}

type CreateCtx =
  | { kind: "output"; index: number; label: string }
  | { kind: "raw"; slot: RawSlot; index: number; label: string };

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
  const [outputs, setOutputs] = useState<OutputRow[]>(initial.outputs);
  // Для каждого слота — список строк сырья. У обычных слотов одна строка, у слота
  // «простыни» (multi) их может быть несколько (кнопка «Добавить сырьё»).
  const [rawValues, setRawValues] = useState<Record<string, RawLineState[]>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [createCtx, setCreateCtx] = useState<CreateCtx | null>(null);

  // Ответственный на этикетке — текущий мастер смены (тот, кто заполняет отчёт).
  const responsibleName = useAuthStore((s) => s.user?.full_name) ?? "—";

  const productsQuery = useProductOptions();
  const materialsQuery = useMaterialOptions();
  const products = productsQuery.data ?? [];
  const materials = materialsQuery.data ?? [];

  // В выпуске показываем товары выбранной категории. В смене «Одноразовые простыни»
  // дополнительно разрешаем выпуск спанбонда — иногда его делают раскруткой в ту же смену.
  const categoryProducts = useMemo(() => {
    const allowed =
      norm(category) === norm(PRODUCT_CATEGORY.SHEETS)
        ? [norm(PRODUCT_CATEGORY.SHEETS), norm(PRODUCT_CATEGORY.SPUNBOND)]
        : [norm(category)];
    return products.filter((p) => allowed.includes(norm(p.category)));
  }, [products, category]);

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
  // определяется категорией выпуска отчёта — ключуем всё сырьё по ней. Слот может
  // содержать и материалы (Полипропилен, «Сырьё Дастархан»), и товары-полуфабрикаты
  // (спанбонд) — на save тип восстановит buildMaterials по options.
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
    if (!outputCat) {
      seededRef.current = true;
      return;
    }
    const next: Record<string, RawLineState[]> = {};
    for (const line of initial.materials) {
      (next[outputCat] ??= []).push({
        refId: line.material_id || line.product_id || "",
        quantity: line.quantity_used,
      });
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

  function updateRaw(category: string, index: number, patch: Partial<RawLineState>) {
    setRawValues((prev) => {
      const lines = prev[category] ? [...prev[category]] : [];
      while (lines.length <= index) lines.push({ refId: "", quantity: "" });
      const base = lines[index] ?? { refId: "", quantity: "" };
      lines[index] = {
        refId: patch.refId ?? base.refId,
        quantity: patch.quantity ?? base.quantity,
      };
      return { ...prev, [category]: lines };
    });
  }

  function addRaw(category: string) {
    setRawValues((prev) => {
      const lines = prev[category]?.length ? [...prev[category]] : [{ refId: "", quantity: "" }];
      return { ...prev, [category]: [...lines, { refId: "", quantity: "" }] };
    });
  }

  function removeRaw(category: string, index: number) {
    setRawValues((prev) => {
      const lines = prev[category] ? prev[category].filter((_, i) => i !== index) : [];
      return { ...prev, [category]: lines };
    });
  }

  function handleCreated(product: ProductRead) {
    if (!createCtx) return;
    if (createCtx.kind === "output") {
      const index = createCtx.index;
      setOutputs((prev) =>
        prev.map((o, i) => (i === index ? { ...o, product_id: product.id } : o))
      );
    } else {
      updateRaw(createCtx.slot.category, createCtx.index, { refId: product.id });
    }
    setCreateCtx(null);
  }

  function buildMaterials(): MaterialIn[] {
    const result: MaterialIn[] = [];
    for (const slot of slots) {
      const stored = rawValues[slot.category];
      const lines = stored && stored.length > 0 ? stored : [{ refId: "", quantity: "" }];
      lines.forEach((line, i) => {
        // Первая строка по умолчанию берёт первый вариант (как в RawAutoEditor).
        const refId = line.refId || (i === 0 ? slot.options[0]?.value : "") || "";
        const quantity = line.quantity ?? "";
        if (!refId || !(Number(quantity) > 0)) return;
        // В слоте могут быть и материалы (сырьё со склада), и товары-полуфабрикаты —
        // тип берём у конкретного выбранного варианта; для созданного «на ходу»
        // спанбонда (его ещё нет в options) fallback — slot.kind.
        const kind = slot.options.find((o) => o.value === refId)?.kind ?? slot.kind;
        result.push(
          kind === "material"
            ? { material_id: refId, quantity_used: quantity }
            : { product_id: refId, quantity_used: quantity }
        );
      });
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
      // Вес — только для этикеток, на backend не отправляем.
      outputs: validOutputs.map((o) => ({
        product_id: o.product_id,
        quantity: o.quantity,
        defect_quantity: o.defect_quantity,
        comment: o.comment,
      })),
      materials: buildMaterials(),
    });
  }

  function handlePrintLabels() {
    setLabelError(null);
    const labelable = outputs.filter((o) => o.product_id);
    if (labelable.length === 0) {
      setLabelError("Сначала добавьте продукцию — этикетка печатается на каждую позицию.");
      return;
    }
    const productionDate = formatDate(shiftDate);
    const printTime = formatDateTime(new Date().toISOString());
    // На каждую позицию — столько этикеток, сколько указано в «Выпуске».
    const labels = labelable.flatMap((o) => {
      const one = {
        name: products.find((p) => p.id === o.product_id)?.name ?? "—",
        weight: (o.weight ?? "").trim(),
        productionDate,
        responsible: responsibleName,
        printTime,
      };
      return Array.from({ length: labelsForOutput(o.quantity) }, () => one);
    });
    if (!printShiftLabels(labels)) {
      setLabelError("Браузер заблокировал окно печати — разрешите всплывающие окна для сайта.");
    }
  }

  const labelCount = outputs.reduce(
    (sum, o) => (o.product_id ? sum + labelsForOutput(o.quantity) : sum),
    0
  );

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
            // Для одноразовых простыней вес не нужен — поле скрываем.
            showWeight={norm(category) !== norm(PRODUCT_CATEGORY.SHEETS)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePrintLabels}
              disabled={labelCount === 0}
            >
              Печать этикеток{labelCount > 0 ? ` · ${labelCount}` : ""}
            </Button>
            <span className="text-[12px] text-muted">
              Этикетка 75×125 мм на каждую позицию (PDF/принтер). Заполните вес.
            </span>
          </div>
          {labelError && (
            <p className="mt-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{labelError}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">
            Расход сырья · автоматически
          </label>
          <RawAutoEditor
            slots={slots}
            values={rawValues}
            onChange={updateRaw}
            onAdd={addRaw}
            onRemove={removeRaw}
            onCreateRaw={(slot, index, label) => setCreateCtx({ kind: "raw", slot, index, label })}
            creating={
              createCtx?.kind === "raw"
                ? { category: createCtx.slot.category, index: createCtx.index }
                : null
            }
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
