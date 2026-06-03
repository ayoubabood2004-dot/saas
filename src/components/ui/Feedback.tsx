import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUp, staggerItem } from "@/lib/motion";

/** Big friendly empty state with optional illustration slot + action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface-1/60 px-6 py-14 text-center", className)}
    >
      {icon && (
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-bold tracking-tighter2 text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/** Page header with title, subtitle, and an actions slot. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft">{icon}</div>
        )}
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted sm:text-base">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/** Small colourful donut ring with a % (or icon) centre — the "petshree" KPI accent. */
export function MiniRing({ percent, color, size = 56, stroke = 6, center }: { percent: number; color: string; size?: number; stroke?: number; center?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, percent));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {center ?? <span className="text-xs font-extrabold" style={{ color }}>{Math.round(pct * 100)}%</span>}
      </div>
    </div>
  );
}

/** KPI card with a colourful proportional ring (value + label + donut). */
export function RingStat({
  label,
  value,
  percent,
  color,
  hint,
  center,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  percent: number;
  color: string;
  hint?: ReactNode;
  center?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={cn("flex items-center justify-between gap-2 rounded-3xl border border-line bg-surface-1 p-4 shadow-card", className)}>
      <div className="min-w-0">
        <p className="font-display text-3xl font-extrabold tracking-tighter2 text-ink">{value}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-ink-muted">{label}</p>
        {hint && <p className="truncate text-xs text-ink-subtle">{hint}</p>}
      </div>
      <MiniRing percent={percent} color={color} center={center} />
    </motion.div>
  );
}

/** Animated KPI stat tile for dashboards. */
export function Stat({
  label,
  value,
  icon,
  tone = "brand",
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "success" | "warn" | "accent" | "sky";
  hint?: ReactNode;
  className?: string;
}) {
  const tones = {
    brand: "from-brand-500/12 to-brand-500/0 text-brand-600 dark:text-brand-300",
    success: "from-success-500/12 to-success-500/0 text-success-600",
    warn: "from-warn-500/12 to-warn-500/0 text-warn-600",
    accent: "from-accent-500/12 to-accent-500/0 text-accent-600",
    sky: "from-sky-500/12 to-sky-500/0 text-sky-600",
  };
  return (
    <motion.div
      variants={staggerItem}
      className={cn("relative overflow-hidden rounded-3xl border border-line bg-surface-1 p-5 shadow-card", className)}
    >
      <div className={cn("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-xl", tones[tone])} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon && <span className={cn("grid h-9 w-9 place-items-center rounded-xl bg-surface-2", tones[tone].split(" ").pop())}>{icon}</span>}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tighter2 text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </motion.div>
  );
}
