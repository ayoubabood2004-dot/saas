import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-soft hover:shadow-raised",
  secondary:
    "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-surface-2 dark:text-brand-300 dark:hover:bg-surface-3",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
  accent: "bg-accent-500 text-white hover:bg-accent-600 shadow-soft",
  danger: "bg-danger-600 text-white hover:bg-danger-700 shadow-soft",
  outline: "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-5 text-base gap-2",
  lg: "h-13 px-7 text-lg gap-2.5",
  icon: "h-11 w-11 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, leftIcon, rightIcon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-display font-semibold tracking-tightish",
        "transition-all duration-200 active:scale-[0.97] select-none",
        "disabled:opacity-50 disabled:pointer-events-none focus-visible:shadow-glow outline-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={size === "lg" ? 20 : 18} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
