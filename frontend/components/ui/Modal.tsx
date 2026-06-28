"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useEffect } from "react";

type ModalSize = "md" | "lg" | "xl" | "2xl";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Ширина окна. По умолчанию «lg» — формам с табличной частью тесно в «md». */
  size?: ModalSize;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-5xl",
};

export function Modal({ open, title, onClose, children, size = "lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-sm">
      <div
        className={clsx(
          "glass-strong my-auto flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-[28px] animate-[modalIn_0.22s_ease]",
          SIZE_CLASS[size]
        )}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h3 className="text-[16px] font-bold tracking-tight text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        {/* Прокручиваемое тело: форма с длинным составом не выходит за экран, кнопки всегда доступны. */}
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
