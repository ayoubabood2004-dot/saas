import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { branchStore, useBranchState } from "@/lib/branchStore";
import { playTap } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/** Stable accent per branch so each location keeps a recognisable colour. */
const BRANCH_DOTS = ["bg-brand-500", "bg-success-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500", "bg-sky-500"];

/* ============================================================================
 * BranchSwitcher — pick which clinic location the whole app is looking at.
 *
 * Renders NOTHING until the clinic actually has 2+ branches, so single-branch
 * clinics (i.e. everyone, today) see zero change. Selecting a branch filters
 * the operational views and stamps new cases; "كل الفروع" shows everything
 * (the exact pre-branches behaviour). The choice is remembered per device.
 * ==========================================================================*/
export function BranchSwitcher({ className, inline = false }: { className?: string; inline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const { branches, active } = useBranchState(clinicId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Single-branch clinics never see the switcher — the app behaves exactly as before.
  if (branches.length < 2) return null;

  const current = active === "all" ? null : branches.find((b) => b.id === active) ?? null;
  const label = current ? current.name : t("branches.all", "كل الفروع");
  const pick = (id: "all" | string) => {
    playTap();
    branchStore.setActive(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { playTap(); setOpen((v) => !v); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-300 dark:hover:border-brand-500/50"
      >
        <Building2 size={17} className="shrink-0 text-brand-600 dark:text-brand-300" />
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        <ChevronDown size={15} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "rounded-2xl border border-line bg-surface-1 p-1.5",
            // Inline mode flows in the layout (safe inside overflow-hidden menus,
            // e.g. the mobile drawer); default mode floats over the content.
            inline ? "mt-2" : "absolute inset-x-0 top-full z-50 mt-2 overflow-hidden shadow-raised",
          )}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-2xs font-bold text-ink-subtle">{t("branches.switch", "التبديل بين الفروع")}</p>
          <button
            role="option"
            aria-selected={active === "all"}
            onClick={() => pick("all")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition",
              active === "all" ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink hover:bg-surface-2",
            )}
          >
            <span className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full bg-[conic-gradient(#3b82f6,#22c55e,#f59e0b,#3b82f6)]" />
            <span className="min-w-0 flex-1 truncate text-start">{t("branches.all", "كل الفروع")}</span>
            {active === "all" && <Check size={15} className="shrink-0" />}
          </button>
          {branches.map((b, i) => (
            <button
              key={b.id}
              role="option"
              aria-selected={active === b.id}
              onClick={() => pick(b.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition",
                active === b.id ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink hover:bg-surface-2",
              )}
            >
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", BRANCH_DOTS[i % BRANCH_DOTS.length])} />
              <span className="min-w-0 flex-1 truncate text-start">{b.name}</span>
              {active === b.id && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
