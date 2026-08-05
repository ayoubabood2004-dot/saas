import { type ReactNode } from "react";
import { Plus } from "lucide-react";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

export interface VisitTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** Badge count — a red dot when `urgent`, otherwise a quiet grey count. */
  count?: number;
  urgent?: boolean;
}

/**
 * VisitTabs — the case screen's spine.
 *
 * The old screen was one endless scroll of eight equally-weighted cards, so
 * finding anything meant scanning past everything. Tabs show one surface at a
 * time; the badge tells you what's waiting behind the ones you're not looking
 * at, which is the part a plain tab bar gets wrong.
 */
export function VisitTabs({ tabs, active, onChange }: {
  tabs: VisitTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-[var(--banner-h,0px)] z-20 -mx-4 mb-3 overflow-x-auto border-b border-line bg-surface/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex min-w-fit gap-1">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { playTap(); onChange(t.id); }}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-bold transition",
                on ? "text-brand-700 dark:text-brand-300" : "text-ink-muted hover:text-ink",
              )}
            >
              {t.icon}
              {t.label}
              {t.count ? (
                <span className={cn(
                  "rounded-full px-1.5 text-[10px] font-black tabular-nums",
                  t.urgent ? "bg-danger-600 text-white" : on ? "bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200" : "bg-surface-3 text-ink-subtle",
                )}>
                  {formatNum(t.count)}
                </span>
              ) : null}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A section that costs one line when it has nothing in it.
 *
 * The screen was mostly empty cards — «لا عمليات مسجلة», «ما في مشاكل», «ما في
 * شي مسجّل اليوم» — each taking a full bordered card with a header. Empty state
 * should be an invitation, not a wall: one row, one verb, and out of the way.
 */
export function Section({ title, icon, count, action, actionLabel, empty, emptyText, children }: {
  title: string;
  icon: ReactNode;
  count?: number;
  action?: () => void;
  actionLabel?: string;
  empty?: boolean;
  emptyText?: string;
  children?: ReactNode;
}) {
  if (empty) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5">
        <span className="shrink-0 text-ink-subtle">{icon}</span>
        <span className="text-2xs font-bold text-ink-muted">{title}</span>
        <span className="min-w-0 flex-1 truncate text-2xs text-ink-subtle">— {emptyText}</span>
        {action && actionLabel && (
          <button type="button" onClick={() => { playTap(); action(); }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-2xs font-extrabold text-brand-700 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Plus size={11} /> {actionLabel}
          </button>
        )}
      </div>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-brand-600 dark:text-brand-300">{icon}</span>
        <h2 className="text-sm font-extrabold text-ink">{title}</h2>
        {count ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-black text-ink-muted">{formatNum(count)}</span> : null}
        {action && actionLabel && (
          <button type="button" onClick={() => { playTap(); action(); }}
            className="ms-auto inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-2xs font-extrabold text-brand-700 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Plus size={11} /> {actionLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
