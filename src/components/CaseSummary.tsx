import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert, ListChecks, Pill, Droplets, Scale, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Infinity as InfinityIcon,
} from "lucide-react";
import type { Pet, PetProblem, TreatmentEntry, LabResult, WeightLog } from "@/types";
import { repo } from "@/lib/repo";
import { CATEGORY_TONE, CATEGORY_LABEL } from "@/lib/problems";
import { formatDate, formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/** Distinct drugs the patient is actually on right now (a dose still pending). */
function currentMeds(treatments: TreatmentEntry[], todayISO: string): { name: string; pending: number }[] {
  const map = new Map<string, number>();
  for (const t of treatments) {
    if (t.administered_at) continue;
    if (t.day < todayISO) continue;          // a missed past dose isn't "current therapy"
    const key = t.medication.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, pending]) => ({ name, pending })).sort((a, b) => b.pending - a.pending);
}

/**
 * CaseSummary — the patient's story in one card, above the chart.
 *
 * Everything that changes a decision but lives on a different screen: what the
 * animal is allergic to, what chronic problems are open, what it is already on,
 * how the last lab read, and which way the weight is going. Without this the
 * doctor has to open four tabs to answer "who is this patient?".
 */
export function CaseSummary({ pet, problems, treatments, labs, todayISO, defaultOpen = true }: {
  pet: Pet;
  problems: PetProblem[];
  treatments: TreatmentEntry[];
  labs: LabResult[];
  todayISO: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [weights, setWeights] = useState<WeightLog[]>([]);

  useEffect(() => {
    let alive = true;
    repo.listWeights(pet.id).then((w) => { if (alive) setWeights(w); }).catch(() => {});
    return () => { alive = false; };
  }, [pet.id]);

  const allergies = (pet.allergies ?? []).filter((a) => a.trim());
  const activeProblems = useMemo(() => problems.filter((p) => p.status === "active"), [problems]);
  const meds = useMemo(() => currentMeds(treatments, todayISO), [treatments, todayISO]);

  const lastLab = useMemo(() => {
    const sorted = labs.slice().sort((a, b) => b.taken_at.localeCompare(a.taken_at));
    const r = sorted[0];
    if (!r) return undefined;
    const vals = r.values ?? [];
    const abnormal = vals.filter((v) => v.flag && v.flag !== "normal").length;
    return { r, abnormal, total: vals.length };
  }, [labs]);

  const weight = useMemo(() => {
    const sorted = weights.slice().sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const latest = sorted.at(-1)?.weight_kg ?? pet.current_weight_kg ?? null;
    const prev = sorted.length >= 2 ? sorted.at(-2)!.weight_kg : null;
    const delta = latest !== null && prev !== null ? latest - prev : null;
    return { latest, delta, at: sorted.at(-1)?.measured_at };
  }, [weights, pet.current_weight_kg]);

  const TrendIcon = weight.delta === null || Math.abs(weight.delta) < 0.05 ? Minus : weight.delta > 0 ? TrendingUp : TrendingDown;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-soft">
      {/* Allergies ride ABOVE the fold, always — never behind a collapse. */}
      {allergies.length > 0 && (
        <div className="flex items-center gap-2 border-b border-danger-200 bg-danger-50 px-3 py-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
          <ShieldAlert size={17} className="shrink-0 text-danger-600 dark:text-danger-300" />
          <span className="text-2xs font-black text-danger-700 dark:text-danger-300">حساسية:</span>
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-danger-700 dark:text-danger-200">{allergies.join(" · ")}</span>
          <span className="hidden shrink-0 rounded-full bg-danger-600 px-2 py-0.5 text-[10px] font-extrabold text-white sm:inline">الوصفة تنوقف تلقائياً</span>
        </div>
      )}

      <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start transition hover:bg-surface-2/60">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><ListChecks size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-ink">ملخّص الحالة</span>
          <span className="block truncate text-2xs text-ink-subtle">
            {[
              activeProblems.length ? `${formatNum(activeProblems.length)} مشكلة نشطة` : null,
              meds.length ? `${formatNum(meds.length)} دواء حالي` : null,
              lastLab ? `آخر تحليل ${formatDate(lastLab.r.taken_at, "ar")}` : null,
              weight.latest !== null ? `${formatNum(weight.latest)} كغ` : null,
            ].filter(Boolean).join(" · ") || "ما في تفاصيل مسجّلة بعد"}
          </span>
        </span>
        {open ? <ChevronUp size={16} className="shrink-0 text-ink-subtle" /> : <ChevronDown size={16} className="shrink-0 text-ink-subtle" />}
      </button>

      {open && (
        <div className="grid gap-2.5 border-t border-line p-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Active problems */}
          <Panel icon={ListChecks} title="المشاكل النشطة" empty={activeProblems.length === 0} emptyText="ما في مشاكل مفتوحة">
            <div className="flex flex-wrap gap-1">
              {activeProblems.map((p) => (
                <span key={p.id} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold", CATEGORY_TONE[p.category])}>
                  {p.chronic && <InfinityIcon size={10} />}
                  {p.title}
                  <span className="opacity-70">· {CATEGORY_LABEL[p.category]}</span>
                </span>
              ))}
            </div>
          </Panel>

          {/* Current therapy */}
          <Panel icon={Pill} title="العلاج الحالي" empty={meds.length === 0} emptyText="ما في أدوية مجدولة">
            <ul className="space-y-1">
              {meds.slice(0, 6).map((m) => (
                <li key={m.name} className="flex items-center gap-1.5 text-2xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{m.name}</span>
                  <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-ink-subtle">{formatNum(m.pending)} جرعة</span>
                </li>
              ))}
              {meds.length > 6 && <li className="text-[10px] text-ink-subtle">+{formatNum(meds.length - 6)} غيرها</li>}
            </ul>
          </Panel>

          {/* Last lab */}
          <Panel icon={Droplets} title="آخر تحليل" empty={!lastLab} emptyText="ما في تحاليل">
            {lastLab && (
              <div className="space-y-1">
                <div className="truncate text-sm font-extrabold text-ink">{lastLab.r.panel_label}</div>
                <div className="text-2xs text-ink-subtle">{formatDate(lastLab.r.taken_at, "ar")}</div>
                {lastLab.total > 0 ? (
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                    lastLab.abnormal > 0 ? "bg-warn-100 text-warn-800 dark:bg-warn-500/20 dark:text-warn-200" : "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300")}>
                    {lastLab.abnormal > 0 ? `${formatNum(lastLab.abnormal)} من ${formatNum(lastLab.total)} خارج النطاق` : "كلها ضمن النطاق"}
                  </span>
                ) : lastLab.r.snap_result ? (
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                    lastLab.r.snap_result === "positive" ? "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300" : "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300")}>
                    {lastLab.r.snap_result === "positive" ? "إيجابي" : "سلبي"}
                  </span>
                ) : null}
              </div>
            )}
          </Panel>

          {/* Weight */}
          <Panel icon={Scale} title="الوزن" empty={weight.latest === null} emptyText="ما في وزن مسجّل">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tabular-nums text-ink">{weight.latest !== null ? formatNum(weight.latest) : "—"}</span>
              <span className="text-2xs font-bold text-ink-subtle">كغ</span>
            </div>
            <div className={cn("mt-0.5 inline-flex items-center gap-1 text-2xs font-extrabold",
              weight.delta === null || Math.abs(weight.delta) < 0.05 ? "text-ink-subtle"
                : weight.delta > 0 ? "text-success-600 dark:text-success-400" : "text-warn-600 dark:text-warn-300")}>
              <TrendIcon size={12} />
              {weight.delta === null ? "ما في مقارنة" : Math.abs(weight.delta) < 0.05 ? "ثابت" : `${weight.delta > 0 ? "+" : "−"}${formatNum(Math.abs(Math.round(weight.delta * 10) / 10))} كغ`}
            </div>
            {weight.at && <div className="text-[10px] text-ink-subtle">{formatDate(weight.at, "ar")}</div>}
          </Panel>
        </div>
      )}
    </section>
  );
}

function Panel({ icon: Icon, title, empty, emptyText, children }: {
  icon: typeof ListChecks; title: string; empty: boolean; emptyText: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-2.5">
      <div className="mb-1.5 inline-flex items-center gap-1 text-2xs font-extrabold text-ink-muted"><Icon size={12} /> {title}</div>
      {empty ? <p className="text-2xs text-ink-subtle">{emptyText}</p> : children}
    </div>
  );
}
