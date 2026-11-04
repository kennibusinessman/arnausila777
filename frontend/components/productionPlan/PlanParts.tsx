"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Общие куски страницы плана (простыни и спанбонд), свёрстанные под телефон:
 * длинные названия переносятся, а не обрезаются, кнопки не разъезжаются.
 * На sm+ всё складывается обратно в компактную строку.
 */

interface TaskHeaderProps {
  index: number;
  client: string;
  comment: string | null;
  /** Наименования позиций через запятую. */
  names: string;
  /** Слева от названия, например кружки цветов. */
  lead?: ReactNode;
  /** Сколько осталось — справа от клиента. */
  amount: ReactNode;
  /** Плашки статуса и дата готовности. */
  meta: ReactNode;
  expanded: boolean;
  onToggle: () => void;
}

/** Свёрнутая строка задания: на телефоне — клиент, ниже наименования целиком, ниже количество и плашки. */
export function TaskHeader({ index, client, comment, names, lead, amount, meta, expanded, onToggle }: TaskHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-start gap-2 rounded-2xl px-3 py-2.5 text-left hover:bg-white/60 sm:items-center"
    >
      <span className="w-5 shrink-0 pt-0.5 text-[13px] font-bold tabular-nums text-muted sm:w-6 sm:pt-0">{index + 1}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center">
          {lead && <span className="flex shrink-0 -space-x-1 pt-0.5 sm:pt-0">{lead}</span>}
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[14px] font-bold leading-snug text-text sm:truncate" title={comment ?? undefined}>
              {client}
              {comment && <span className="font-semibold text-primary"> — {comment}</span>}
            </span>
            <span className="mt-0.5 block break-words text-[12px] leading-snug text-muted sm:line-clamp-1" title={names}>
              {names}
            </span>
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-[13px] tabular-nums sm:block">{amount}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0 sm:flex-nowrap">
          {/* На телефоне количество — первым в строке плашек, чтобы не сжимать имя клиента. */}
          <span className="text-[13px] tabular-nums sm:hidden">{amount}</span>
          {meta}
        </span>
      </span>
      <ChevronDown
        className={clsx("mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform sm:mt-0", expanded && "rotate-180")}
      />
    </button>
  );
}

interface TaskActionsProps {
  index: number;
  isLast: boolean;
  busy: boolean;
  onMove: (index: number, step: -1 | 1) => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** Действия раскрытого задания: на телефоне — ровная сетка 2×N, на sm+ — одна строка. */
export function TaskActions({ index, isLast, busy, onMove, onEdit, onCancel, onDelete }: TaskActionsProps) {
  const cell = "justify-center sm:justify-start";
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
      <Button variant="ghost" size="sm" className={cell} onClick={() => onMove(index, -1)} disabled={busy || index === 0}>
        <ArrowUp className="h-3.5 w-3.5" /> Выше
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={clsx(cell, "sm:mr-auto")}
        onClick={() => onMove(index, 1)}
        disabled={busy || isLast}
      >
        <ArrowDown className="h-3.5 w-3.5" /> Ниже
      </Button>
      <Button variant="ghost" size="sm" className={cell} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" /> Изменить
      </Button>
      <Button variant="ghost" size="sm" className={cell} onClick={onCancel} disabled={busy}>
        <X className="h-3.5 w-3.5" /> Отменить
      </Button>
      <button
        type="button"
        onClick={onDelete}
        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-danger-bg hover:text-danger sm:col-span-1 sm:p-1.5"
        aria-label="Удалить"
        title="Удалить задание"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sm:hidden">Удалить задание</span>
      </button>
    </div>
  );
}

/** Шапка позиции: название целиком (переносится), под ним остаток; кнопки — ниже на телефоне. */
export function ItemHead({ lead, name, sub, actions }: { lead?: ReactNode; name: string; sub: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        {lead && <span className="shrink-0 pt-0.5 sm:pt-0">{lead}</span>}
        <span className="min-w-0">
          <span className="block break-words text-[13.5px] font-semibold leading-snug text-text">{name}</span>
          <span className="block text-[12.5px] tabular-nums text-muted">{sub}</span>
        </span>
      </div>
      {actions && <div className="flex gap-1.5 [&>*]:flex-1 [&>*]:justify-center sm:shrink-0 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

interface SegmentedProps<K extends string> {
  options: readonly { key: K; label: string; short?: string }[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}

/** Переключатель вида: на телефоне — равные ячейки во всю ширину с короткими подписями. */
export function Segmented<K extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<K>) {
  return (
    <div
      className="mb-3 grid gap-1 rounded-xl bg-white/60 p-1 sm:inline-flex sm:flex-wrap"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={clsx(
            "rounded-lg px-2 py-1.5 text-[12.5px] font-medium leading-tight transition-colors sm:px-3 sm:text-[13px]",
            value === o.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-white hover:text-text"
          )}
        >
          {o.short ? (
            <>
              <span className="sm:hidden">{o.short}</span>
              <span className="hidden sm:inline">{o.label}</span>
            </>
          ) : (
            o.label
          )}
        </button>
      ))}
    </div>
  );
}

/** Шапка сворачиваемой группы (бабины, цвета): стрелка всегда справа сверху. */
export function GroupHeader({
  lead,
  title,
  subtitle,
  stats,
  open,
  onToggle,
}: {
  lead?: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  stats: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-[13px] sm:items-center"
    >
      {lead && <span className="shrink-0 pt-0.5 sm:pt-0">{lead}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <span className="min-w-0 sm:flex-1">
          <span className="block break-words font-semibold leading-snug text-text">{title}</span>
          <span className="block break-words text-[12px] leading-snug text-muted sm:truncate">{subtitle}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums sm:shrink-0">{stats}</span>
      </span>
      <ChevronDown className={clsx("mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform sm:mt-0", open && "rotate-180")} />
    </button>
  );
}

/** Плашка цвета рядом с названием. Неизвестный цвет — штриховка. */
const SWATCH: Record<string, string> = {
  Голубой: "#7cc4f0",
  Бирюзовый: "#2ec4b6",
  Синий: "#2f5fd0",
  Белый: "#ffffff",
  Зелёный: "#3aa15a",
  Салатовый: "#a6dc5a",
  Розовый: "#f39ac0",
  Красный: "#e03e3e",
  Бордовый: "#7d1f35",
  Жёлтый: "#f5d33f",
  Оранжевый: "#f39234",
  Фиолетовый: "#7d4bc7",
  Сиреневый: "#c3a2e6",
  Серый: "#9aa0a8",
  Чёрный: "#222222",
  Бежевый: "#e8d6b5",
  Коричневый: "#8a5a35",
};

export function Swatch({ color }: { color: string | null | undefined }) {
  const fill = color ? SWATCH[color] : undefined;
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/15"
      style={
        fill
          ? { background: fill }
          : { background: "repeating-linear-gradient(45deg,#d7dbe2 0 3px,#f4f5f7 3px 6px)" }
      }
    />
  );
}
