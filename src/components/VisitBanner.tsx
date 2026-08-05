import { useState } from "react";
import {
  ShieldAlert, ChevronDown, ChevronUp, Lock, Printer, Gauge, AlertTriangle,
  CalendarClock, Scale, FolderOpen,
} from "lucide-react";
import type { Pet, PetProblem } from "@/types";
import { PetAvatar } from "@/components/PetAvatar";
import { CATEGORY_TONE } from "@/lib/problems";
import { ageFromDOB, formatNum, formatDate, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/**
 * VisitBanner — the persistent patient banner, the way clinical EHRs do it.
 *
 * The rule this implements: a clinician gets roughly 90 seconds between
 * patients, so the things that change a decision — who this is, what it weighs,
 * what it's allergic to, what problems are open, how far behind the doses are —
 * must be on screen WITHOUT a scroll or a click. Everything else (owner phone,
 * file number, opened date) is reference material and hides behind «تفاصيل».
 *
 * It replaces two full-height cards (the hero + the paper-form summary) that
 * between them pushed the actual work below the fold.
 */
export function VisitBanner({
  pet, kindLabel, kindIcon, kindSolid, dxName, dxWarn, problems, weightKg,
  status, outcomeBadge, dayNumber, openedAt, lang, fileNo, ownerName, ownerPhone,
  done, total, remaining, adherence, daysLeft, overdue, dueNow,
  onPrint, printable, onOpenFile,
}: {
  pet: Pet;
  kindLabel: string;
  kindIcon: React.ReactNode;
  kindSolid: string;
  dxName?: string | null;
  dxWarn?: boolean;
  problems: PetProblem[];
  weightKg?: number | null;
  status: "open" | "ended";
  /** Rendered next to the «منتهية» pill — an ended visit's outcome is real information. */
  outcomeBadge?: React.ReactNode;
  dayNumber: number;
  openedAt: string;
  lang: string;
  fileNo?: string;
  ownerName?: string;
  ownerPhone?: string;
  /** Dose progress — omitted (total 0) when there's no plan yet. */
  done: number; total: number; remaining: number; adherence: number; daysLeft: number;
  overdue: number; dueNow: number;
  onPrint?: () => void;
  printable?: boolean;
  onOpenFile?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const allergies = (pet.allergies ?? []).filter((a) => a.trim());
  const active = problems.filter((p) => p.status === "active");
  const a = ageFromDOB(pet.dob);
  const age = a ? [a.years ? `${formatNum(a.years)} سنة` : null, a.months ? `${formatNum(a.months)} شهر` : null].filter(Boolean).join(" و") || "أقل من شهر" : null;

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-line bg-gradient-to-b from-brand-50/80 to-surface-1/95 px-4 pb-2 pt-3 backdrop-blur dark:from-brand-500/10 dark:to-surface-1/95 sm:-mx-6 sm:px-6">
      {/* Allergy rides above everything — it is the one line that must never be scrolled away */}
      {allergies.length > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-danger-600 px-3 py-1.5 text-white">
          <ShieldAlert size={15} className="shrink-0" />
          <span className="text-2xs font-black">حساسية</span>
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{allergies.join(" · ")}</span>
          <span className="hidden shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold sm:inline">الوصفة تنوقف تلقائياً</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PetAvatar pet={pet} size={44} className="shrink-0 rounded-xl" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-black leading-tight text-ink">{pet.name}</span>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white", kindSolid)}>{kindIcon}</span>
          </div>
          <div className="truncate text-2xs font-bold text-ink-subtle">
            {[kindLabel, pet.breed, age, pet.sex === "male" ? "ذكر" : pet.sex === "female" ? "أنثى" : null]
              .filter(Boolean).join(" · ")}
          </div>
        </div>

        {/* Weight — load-bearing for every dose on the sheet, so it sits in the banner */}
        {weightKg ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 dark:bg-violet-500/10">
            <Scale size={13} className="text-violet-600 dark:text-violet-300" />
            <span className="text-sm font-black tabular-nums text-ink">{formatNum(weightKg)}</span>
            <span className="text-2xs font-bold text-ink-subtle">كغ</span>
          </span>
        ) : null}

        {/* Active problems as chips — the chronic history, always in view */}
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {active.slice(0, 3).map((p) => (
              <span key={p.id} className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", CATEGORY_TONE[p.category])}>{p.title}</span>
            ))}
            {active.length > 3 && <span className="text-[10px] font-bold text-ink-subtle">+{formatNum(active.length - 3)}</span>}
          </div>
        )}

        {dxName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-bold text-ink-muted">
            {dxName}{dxWarn && <AlertTriangle size={11} className="text-danger-500" />}
          </span>
        )}

        <div className="ms-auto flex items-center gap-1.5">
          {outcomeBadge}
          {status === "ended" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-2.5 py-1.5 text-2xs font-extrabold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"><Lock size={12} /> منتهية</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-50 px-2.5 py-1.5 text-2xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" /> اليوم {formatNum(dayNumber)}
            </span>
          )}
          <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
            تفاصيل {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Dose progress — one compact strip, only when a plan exists */}
      {total > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="flex min-w-[140px] flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-brand-grad transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span className="shrink-0 text-2xs font-black tabular-nums text-ink">{formatNum(done)}/{formatNum(total)}</span>
          </div>
          {overdue > 0 && <Pill tone="danger" icon={<AlertTriangle size={12} />} label={`${formatNum(overdue)} متأخّرة`} />}
          {dueNow > 0 && <Pill tone="warn" icon={<CalendarClock size={12} />} label={`${formatNum(dueNow)} مستحقّة`} />}
          <Pill tone={adherence >= 80 ? "success" : adherence >= 50 ? "warn" : "danger"} icon={<Gauge size={12} />} label={`الالتزام ${formatNum(adherence)}%`} />
          {remaining > 0 && <Pill tone="muted" icon={<CalendarClock size={12} />} label={daysLeft > 0 ? `ينتهي بعد ${formatNum(daysLeft)} يوم` : "ينتهي اليوم"} />}
        </div>
      )}

      {/* Reference details — behind one tap, because they never change a decision mid-round */}
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl bg-surface-2/60 px-3 py-2 text-2xs">
          <Field label="المالك" value={ownerName || "—"} />
          <Field label="هاتف المالك" value={ownerPhone || "—"} />
          <Field label="رقم الملف" value={fileNo || "—"} />
          <Field label="فُتحت" value={formatDate(openedAt, lang)} />
          <div className="ms-auto flex items-center gap-1.5">
            {onOpenFile && (
              <button type="button" onClick={onOpenFile} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-2.5 py-1 font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                <FolderOpen size={12} /> الملف الكامل
              </button>
            )}
            {printable && onPrint && (
              <button type="button" onClick={onPrint} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-2.5 py-1 font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                <Printer size={12} /> طباعة الخطة
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ tone, icon, label }: { tone: "danger" | "warn" | "success" | "muted"; icon: React.ReactNode; label: string }) {
  const cls = tone === "danger" ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"
    : tone === "warn" ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
    : tone === "success" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
    : "bg-surface-2 text-ink-muted";
  return <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-extrabold", cls)}>{icon} {label}</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-bold text-ink-subtle">{label}</span>
      <span className="font-extrabold text-ink">{value}</span>
    </span>
  );
}
