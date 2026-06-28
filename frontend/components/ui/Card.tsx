import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, action, children, className }: CardProps) {
  return (
    <div className={clsx("glass rounded-3xl p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-[15px] font-bold tracking-tight text-text">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
