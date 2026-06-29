"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Если задано — при отсутствии точного совпадения показывается «+ Создать «…»». */
  onCreate?: (label: string) => void;
  creating?: boolean;
}

/** Простой клиентский searchable-select без серверного поиска — рассчитан на справочники в пределах сотни записей (клиенты/товары/менеджеры). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Выбрать…",
  disabled,
  allowClear = true,
  onCreate,
  creating,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasCreatingRef = useRef(false);

  const selected = options.find((o) => o.value === value) ?? null;

  // Выбор/очистка: закрываем список и СНИМАЕМ фокус с инпута. Иначе на мобильных
  // клавиатура остаётся открытой, а инпут «залипает» в фокусе — повторный тап не
  // открывает список (приходится тапнуть мимо и обратно).
  function commit(next: string | null) {
    onChange(next);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Закрываем дропдаун, когда родитель закончил создавать новый вариант (успех или ошибка).
  useEffect(() => {
    if (wasCreatingRef.current && !creating) {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
    wasCreatingRef.current = !!creating;
  }, [creating]);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.label.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const hasExactMatch = options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreate = !!onCreate && trimmedQuery.length > 0 && !hasExactMatch;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50 disabled:bg-black/[0.03]"
      />
      {open && (
        <div className="glass-strong absolute z-10 mt-1.5 max-h-56 w-full overflow-auto rounded-2xl">
          {allowClear && value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-black/[0.04]"
            >
              Очистить выбор
            </button>
          )}
          {filtered.length === 0 && !showCreate ? (
            <div className="px-3 py-2 text-sm text-muted">Ничего не найдено</div>
          ) : (
            filtered.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(opt.value);
                }}
                className={clsx(
                  "block w-full px-3 py-2 text-left text-sm hover:bg-black/[0.04]",
                  opt.value === value && "bg-primary-50"
                )}
              >
                {opt.label}
                {opt.sublabel && <span className="ml-1.5 text-xs text-muted">{opt.sublabel}</span>}
              </button>
            ))
          )}
          {showCreate && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (creating) return;
                onCreate!(trimmedQuery);
              }}
              disabled={creating}
              className={clsx(
                "block w-full border-t border-black/[0.06] px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary-50",
                creating && "opacity-50"
              )}
            >
              {creating ? "Создание…" : `+ Создать «${trimmedQuery}»`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
