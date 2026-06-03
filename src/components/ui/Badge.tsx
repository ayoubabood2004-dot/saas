import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "neutral" | "success" | "warn" | "danger" | "accent" | "sky";

const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  neutral: "bg-surface-2 text-ink-muted",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200",
  accent: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
};

export function Badge({
  tone = "neutral",
  dot,
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean; icon?: ReactNode }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", tones[tone], className)}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {icon}
      {children}
    </span>
  );
}
