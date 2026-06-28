import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-primary to-indigo text-white shadow-[0_8px_20px_rgba(110,110,240,0.34)] hover:opacity-95",
  secondary: "bg-white/60 text-text border border-white/70 backdrop-blur-xl hover:bg-white/80",
  ghost: "bg-transparent text-primary hover:bg-primary-50",
  success: "bg-success text-white shadow-sm shadow-success/20 hover:opacity-90",
  danger: "bg-[rgba(220,60,60,0.07)] text-[#bd4836] hover:bg-[rgba(220,60,60,0.12)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-[13px]",
  md: "px-4 py-2 text-[14px]",
  lg: "px-5 py-2.5 text-[15px]",
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl font-medium leading-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
