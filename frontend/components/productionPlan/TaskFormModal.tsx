"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api/http";
import { useClientOptions } from "@/lib/hooks/useClients";
import { useCreateTask, usePlanOptions, useUpdateTask } from "@/lib/hooks/useProductionPlan";
import { unitLabel } from "@/components/productionPlan/QuantityModal";
import type { PlanProductOption, ProductionTaskKind, TaskItemIn, TaskRow } from "@/lib/types/productionPlan";
import { formatNumber, formatQuantity } from "@/lib/utils/format";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Задание для правки; null — новое. */
  task: TaskRow | null;
  /** Линия: простыни (по умолчанию) или спанбонд. */
  kind?: ProductionTaskKind;
  /** Выработка линии за смену: штук простыней или кг спанбонда. */
  perShift: number;
}

/** Строка формы. Числа — строками, как в инпутах. */
interface Line {
  key: string;
  id?: string;
  productId: string | null;
  bobbinId: string | null;
  quantity: string;
  ready: string;
  shipped: string;
}

const INPUT =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-text";
const SMALL_LABEL = "mb-1 block text-[12px] font-semibold text-muted";

let keySeq = 0;
const newLine = (): Line => ({
  key: `new-${++keySeq}`,
  productId: null,
  bobbinId: null,
  quantity: "",
  ready: "0",
  shipped: "0",
});

const isWhole = (v: string, min: number) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isInteger(n) && n >= min;
};

const leftToMake = (l: Line) =>
  isWhole(l.quantity, 1) ? Math.max(Number(l.quantity) - (Number(l.ready) || 0), 0) : 0;

export function TaskFormModal({ open, onClose, task, kind = "SHEETS", perShift }: Props) {
  const spunbond = kind === "SPUNBOND";
  const options = usePlanOptions(open, kind);
  const clientOptions = useClientOptions();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [clientId, setClientId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setClientId(task?.client_id ?? null);
    setDeadline(task?.deadline ?? "");
    setComment(task?.comment ?? "");
    setLines(
      task
        ? task.items.map((i) => ({
            key: i.id,
            id: i.id,
            productId: i.product_id,
            bobbinId: i.bobbin_id,
            quantity: String(i.quantity),
            ready: String(i.ready),
            shipped: String(i.shipped),
          }))
        : [newLine()]
    );
    setError(null);
  }, [open, task]);

  const products = useMemo(() => options.data ?? [], [options.data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: spunbond
          ? [p.subcategory, `на складе ${formatQuantity(p.on_stock ?? 0)} ${unitLabel(p.unit)}`]
              .filter(Boolean)
              .join(" · ")
          : p.bobbins.map((b) => b.name).join(", "),
      })),
    [products, spunbond]
  );
  const savedReady = useMemo(() => new Map(task?.items.map((i) => [i.id, i.ready]) ?? []), [task]);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Простыни — штуки; спанбонд — кг сырья (у товара в штуках — по весу из карточки).
  const total = lines.reduce((s, l) => {
    const left = leftToMake(l);
    if (!spunbond) return s + left;
    const perUnit = l.productId ? byId.get(l.productId)?.kg_per_unit : null;
    return s + (perUnit ? left * Number(perUnit) : 0);
  }, 0);

  function submit() {
    setError(null);
    if (lines.length === 0) return setError("Добавьте хотя бы одну позицию");
    const items: TaskItemIn[] = [];
    for (const [n, l] of lines.entries()) {
      const at = lines.length > 1 ? ` (позиция ${n + 1})` : "";
      if (!l.productId) return setError(`Выберите наименование${at}`);
      if (!isWhole(l.quantity, 1)) return setError(`Количество — целое число больше нуля${at}`);
      const item: TaskItemIn = {
        id: l.id,
        product_id: l.productId,
        bobbin_id: l.bobbinId,
        quantity: Number(l.quantity),
      };
      if (task && l.id) {
        if (!isWhole(l.ready, 0) || !isWhole(l.shipped, 0)) {
          return setError(`«Готово» и «Отгружено» — целые числа от нуля${at}`);
        }
        const [q, r, s] = [Number(l.quantity), Number(l.ready), Number(l.shipped)];
        if (r > q) return setError(`Готово больше, чем заказано${at}`);
        if (s > r) return setError(`Отгружено больше, чем готово${at}`);
        item.ready = r;
        item.shipped = s;
      }
      items.push(item);
    }
    const body = { ...(task ? {} : { kind }), client_id: clientId, deadline: deadline || null, comment: comment.trim() || null, items };
    const onError = (err: unknown) => setError(apiErrorMessage(err, "Не удалось сохранить задание"));
    if (task) updateTask.mutate({ id: task.id, data: body }, { onSuccess: onClose, onError });
    else createTask.mutate(body, { onSuccess: onClose, onError });
  }

  const pending = createTask.isPending || updateTask.isPending;

  return (
    <Modal open={open} onClose={onClose} title={task ? "Задание" : "Новое задание"} size="lg">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className={LABEL}>Клиент</label>
            <Combobox
              value={clientId}
              onChange={setClientId}
              options={(clientOptions.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              placeholder={clientOptions.isLoading ? "Загрузка…" : "Без клиента — на склад"}
            />
          </div>
          <div>
            <label className={LABEL}>Срок</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text">Позиции</span>
            <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus className="h-4 w-4" /> Позиция
            </Button>
          </div>
          {!options.isLoading && products.length === 0 && (
            <p className="mb-2 text-[12.5px] text-muted">
              {spunbond
                ? "Нет товаров категории «Спанбонд» — заведите их на странице «Товары»."
                : "Нет наименований с привязанной бабиной — привяжите бабину к простыне на странице «Товары»."}
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {lines.map((l, n) => (
              <LineEditor
                key={l.key}
                line={l}
                index={n}
                product={l.productId ? byId.get(l.productId) : undefined}
                productOptions={productOptions}
                loading={options.isLoading}
                spunbond={spunbond}
                // Позицию с готовыми штуками нельзя убрать или сменить ей наименование.
                locked={(l.id ? (savedReady.get(l.id) ?? 0) : 0) > 0}
                canRemove={lines.length > 1}
                onChange={(patch) => setLine(l.key, patch)}
                onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL}>Комментарий</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={INPUT} />
        </div>

        {total > 0 && (
          <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-text">
            {spunbond ? "Сырья на оставшееся" : "Осталось сделать"}{" "}
            <b>
              {formatNumber(total, spunbond ? 1 : 0)} {spunbond ? "кг" : "шт"}
            </b>{" "}
            · ≈ <b>{formatNumber(total / perShift, 1)}</b> смены
          </p>
        )}

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Сохранение…" : task ? "Сохранить" : "Добавить в очередь"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface LineEditorProps {
  line: Line;
  index: number;
  product: PlanProductOption | undefined;
  productOptions: { value: string; label: string; sublabel?: string }[];
  loading: boolean;
  spunbond: boolean;
  locked: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}

function LineEditor({
  line: l,
  index,
  product,
  productOptions,
  loading,
  spunbond,
  locked,
  canRemove,
  onChange,
  onRemove,
}: LineEditorProps) {
  const bobbins = product?.bobbins ?? [];
  // Предпросмотр: та же бабина, что выберет сервер, — указанная, а иначе с нормой,
  // самая ходовая для этой простыни (сменные отчёты, потом ручной выбор), потом по остатку.
  const popular = [...bobbins].sort(
    (a, b) =>
      Number(b.roll_norm !== null) - Number(a.roll_norm !== null) ||
      Number(b.used ?? 0) - Number(a.used ?? 0) ||
      (b.chosen ?? 0) - (a.chosen ?? 0) ||
      Number(b.on_stock) - Number(a.on_stock)
  )[0];
  const preview = bobbins.find((b) => b.id === l.bobbinId) ?? popular;
  const left = leftToMake(l);
  const u = unitLabel(product?.unit);

  return (
    <div className="rounded-xl border border-border bg-white/50 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 shrink-0 text-[13px] font-bold tabular-nums text-muted">{index + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_130px]">
            <Combobox
              value={l.productId}
              onChange={(v) => onChange({ productId: v, bobbinId: null })}
              options={productOptions}
              placeholder={loading ? "Загрузка…" : spunbond ? "Выбрать спанбонд…" : "Выбрать простыню…"}
              disabled={locked}
              allowClear={false}
            />
            {/* В поле длинное название обрезается — на телефоне показываем его целиком. */}
            {product && product.name.length > 24 && (
              <p className="-mt-1.5 break-words text-[12px] leading-snug text-muted sm:hidden">{product.name}</p>
            )}
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder={`Кол-во, ${u}`}
              aria-label={`Количество, ${u}`}
              value={l.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              className={INPUT}
            />
          </div>

          {bobbins.length > 1 && (
            <select
              value={l.bobbinId ?? ""}
              onChange={(e) => onChange({ bobbinId: e.target.value || null })}
              className={INPUT}
              aria-label="Бабина"
            >
              <option value="">
                Бабина: по умолчанию{popular ? ` — ${popular.name}` : ""}
                {Number(popular?.used ?? 0) > 0 ? " (чаще всего)" : " (подберётся по остатку)"}
              </option>
              {bobbins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — норма {b.roll_norm ?? "—"} шт, на складе {formatQuantity(b.on_stock)}
                  {Number(b.used ?? 0) > 0 ? `, ушло по сменам ${formatQuantity(b.used!)}` : ""}
                </option>
              ))}
            </select>
          )}

          {l.id && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={SMALL_LABEL}>Готово, {u}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={l.ready}
                  onChange={(e) => onChange({ ready: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={SMALL_LABEL}>Отгружено, {u}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={l.shipped}
                  onChange={(e) => onChange({ shipped: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>
          )}

          {left > 0 && product && spunbond && (
            <p className="text-[12.5px] text-muted">
              {product.kg_per_unit ? (
                <>
                  Полипропилена: <b className="text-text">{formatNumber(left * Number(product.kg_per_unit), 1)} кг</b>
                  {u !== "кг" && <> (по {formatQuantity(product.kg_per_unit)} кг за {u})</>}
                  {product.color && <> · цвет: {product.color}</>}
                </>
              ) : (
                <>У товара не указан вес — расход сырья не посчитать. Укажите вес на странице «Товары».</>
              )}
            </p>
          )}

          {left > 0 && product && !spunbond && (
            <p className="text-[12.5px] text-muted">
              {preview?.roll_norm ? (
                <>
                  Нужно: <b className="text-text">{formatNumber(Math.ceil(left / preview.roll_norm))} шт</b> бабины «{preview.name}»
                  (норма {formatNumber(preview.roll_norm)} шт)
                  {Math.ceil(left / preview.roll_norm) * preview.roll_norm - left > 0 && (
                    <> · лишнее ≈ {formatNumber(Math.ceil(left / preview.roll_norm) * preview.roll_norm - left)} шт останется на складе</>
                  )}
                </>
              ) : (
                <>У бабины нет нормы — расход бабин не посчитать</>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove || locked}
          title={locked ? "Есть готовые штуки — сначала обнулите «Готово»" : "Убрать позицию"}
          className="mt-1 rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30"
          aria-label="Убрать позицию"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
