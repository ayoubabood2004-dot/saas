import { useEffect, useMemo, useState } from "react";
import {
  Droplets, Thermometer, ArrowDownToLine, ArrowUpFromLine, Pill, Plus, X,
  Calculator, AlertTriangle, Loader2, Check,
} from "lucide-react";
import type { CareEntry, CareKind, Pet, TreatmentEntry } from "@/types";
import { repo } from "@/lib/repo";
import { fluidPlan, DEHYDRATION_BANDS, FLUID_TYPES, DROP_FACTORS, type DropFactor } from "@/lib/fluidTherapy";
import { taskStatus, HHMM } from "@/lib/treatmentSchedule";
import { formatNum, cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { playTap, playSuccess } from "@/lib/sounds";

const KIND_META: Record<CareKind, { label: string; icon: typeof Droplets; tone: string }> = {
  fluid:  { label: "سوائل", icon: Droplets, tone: "text-sky-600 dark:text-sky-300" },
  vital:  { label: "مراقبة", icon: Thermometer, tone: "text-violet-600 dark:text-violet-300" },
  intake: { label: "داخل", icon: ArrowDownToLine, tone: "text-emerald-600 dark:text-emerald-300" },
  output: { label: "خارج", icon: ArrowUpFromLine, tone: "text-amber-600 dark:text-amber-300" },
};

/** The things staff actually log, so recording is a tap plus a number. */
const QUICK: Record<CareKind, { label: string; unit: string }[]> = {
  fluid:  FLUID_TYPES.map((f) => ({ label: f.label, unit: "مل/ساعة" })),
  vital:  [
    { label: "الحرارة", unit: "°م" }, { label: "النبض", unit: "/د" }, { label: "التنفّس", unit: "/د" },
    { label: "الضغط الانقباضي", unit: "ملم زئبق" }, { label: "SpO₂", unit: "%" }, { label: "سكر الدم", unit: "ملغ/دل" },
  ],
  intake: [{ label: "ماء", unit: "مل" }, { label: "أكل", unit: "غم" }, { label: "سوائل وريدية", unit: "مل" }],
  output: [{ label: "بول", unit: "مل" }, { label: "براز", unit: "مرة" }, { label: "قيء", unit: "مرة" }, { label: "نزح", unit: "مل" }],
};

const hourOf = (t: string) => (/^\d{1,2}:\d{2}$/.test(t.trim()) ? `${t.trim().slice(0, 2).padStart(2, "0")}:00` : "");

/**
 * CareSheet — the hour-by-hour hospital treatment sheet.
 *
 * The doses already had times; everything else on a real inpatient sheet — the
 * fluid rate, the scheduled vitals, what went in and what came out — lived on
 * paper taped to the cage. This puts all four on one 24-hour grid, next to the
 * doses, and adds the fluid-rate arithmetic that was previously done in the
 * doctor's head.
 */
export function CareSheet({ pet, visitId, day, doctor, treatments }: {
  pet: Pet;
  visitId?: string | null;
  day: string;
  doctor?: string;
  /** Doses for this day — shown in the grid so the whole hour reads together. */
  treatments: TreatmentEntry[];
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<CareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<CareKind | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);

  const load = async () => {
    try { setEntries(await repo.listCareEntries(pet.id, day)); }
    catch { /* a pre-0091 database simply has no care sheet yet */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pet.id, day]);

  const byHour = useMemo(() => {
    const m = new Map<string, { care: CareEntry[]; doses: TreatmentEntry[] }>();
    const slot = (h: string) => {
      let v = m.get(h);
      if (!v) { v = { care: [], doses: [] }; m.set(h, v); }
      return v;
    };
    for (const e of entries) slot(hourOf(e.time)).care.push(e);
    for (const t of treatments) if (t.day === day) slot(hourOf(t.time)).doses.push(t);
    return m;
  }, [entries, treatments, day]);

  /** Only hours that carry something — a 24-row empty grid is noise. */
  const activeHours = useMemo(() => {
    const hs = [...byHour.keys()].filter((h) => {
      const v = byHour.get(h)!;
      return v.care.length > 0 || v.doses.length > 0;
    });
    return hs.sort((a, b) => (a || "99:99").localeCompare(b || "99:99"));
  }, [byHour]);

  /** Running intake/output balance — the number the sheet exists to produce. */
  const balance = useMemo(() => {
    let inMl = 0, outMl = 0;
    for (const e of entries) {
      if (e.value == null) continue;
      if (!e.unit.includes("مل")) continue;      // only volumes belong in a balance
      if (e.kind === "intake") inMl += e.value;
      if (e.kind === "output") outMl += e.value;
    }
    return { inMl, outMl, net: inMl - outMl };
  }, [entries]);

  const currentFluid = useMemo(() => {
    const fl = entries.filter((e) => e.kind === "fluid").sort((a, b) => (b.time || "").localeCompare(a.time || ""));
    return fl[0];
  }, [entries]);

  const remove = async (e: CareEntry) => {
    playTap();
    setEntries((prev) => prev.filter((x) => x.id !== e.id));
    try { await repo.deleteCareEntry(e.id); } catch { await load(); toast.error("تعذّر الحذف"); }
  };

  const add = async (kind: CareKind, label: string, unit: string, value: number | null, time: string, notes?: string) => {
    try {
      await repo.addCareEntry({
        pet_id: pet.id, visit_id: visitId ?? null, day, time, kind, label,
        value, unit, notes: notes ?? null, recorded_by: doctor ?? null,
      });
      playSuccess();
      setAdding(null);
      await load();
    } catch (err) {
      toast.error("تعذّر الحفظ", err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300"><Droplets size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-ink">جدول العلاج الزمني</h3>
          <p className="text-2xs text-ink-subtle">الجرعات والسوائل والمراقبة والداخل/الخارج — على نفس الساعة.</p>
        </div>
        <button type="button" onClick={() => { playTap(); setCalcOpen((o) => !o); }}
          className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-2xs font-extrabold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          <Calculator size={13} /> حاسبة السوائل
        </button>
      </div>

      {calcOpen && <FluidCalculator pet={pet} onUse={(rate, label) => { void add("fluid", label, "مل/ساعة", rate, HHMM()); setCalcOpen(false); }} />}

      {/* Running totals */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "داخل", n: balance.inMl, cls: "text-emerald-700 dark:text-emerald-300" },
          { label: "خارج", n: balance.outMl, cls: "text-amber-700 dark:text-amber-300" },
          { label: "الصافي", n: balance.net, cls: balance.net < 0 ? "text-danger-600 dark:text-danger-300" : "text-ink" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface-2/50 p-2 text-center">
            <div className={cn("text-lg font-black tabular-nums", c.cls)}>{c.n > 0 ? "+" : ""}{formatNum(Math.round(c.n))}</div>
            <div className="text-[10px] font-extrabold text-ink-subtle">{c.label} (مل)</div>
          </div>
        ))}
      </div>

      {currentFluid && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-500/30 dark:bg-sky-500/10">
          <Droplets size={14} className="shrink-0 text-sky-600 dark:text-sky-300" />
          <span className="text-2xs font-extrabold text-sky-700 dark:text-sky-200">المعدّل الحالي:</span>
          <span className="text-sm font-black text-ink">{currentFluid.label} — {formatNum(currentFluid.value ?? 0)} مل/ساعة</span>
          <span className="ms-auto text-2xs text-ink-subtle">منذ {currentFluid.time || "—"}</span>
        </div>
      )}

      {/* Quick add */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_META) as CareKind[]).map((k) => {
          const M = KIND_META[k];
          return (
            <button key={k} type="button" onClick={() => { playTap(); setAdding(adding === k ? null : k); }}
              className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-2xs font-bold transition",
                adding === k ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-2 text-ink-muted hover:border-brand-300")}>
              <M.icon size={13} className={adding === k ? "" : M.tone} /> <Plus size={11} /> {M.label}
            </button>
          );
        })}
      </div>

      {adding && <AddRow kind={adding} onCancel={() => setAdding(null)} onAdd={add} />}

      {/* The grid */}
      {loading ? (
        <div className="py-4 text-center"><Loader2 size={16} className="mx-auto animate-spin text-ink-subtle" /></div>
      ) : activeHours.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-2xs text-ink-muted">ما في شي مسجّل اليوم. سجّل معدّل السوائل أو قراءة مراقبة حتى تبدأ الورقة.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          {activeHours.map((h) => {
            const v = byHour.get(h)!;
            const isNow = h === hourOf(HHMM());
            return (
              <div key={h || "untimed"} className={cn("flex gap-2 border-b border-line/70 p-2 last:border-b-0", isNow && "bg-brand-50/60 dark:bg-brand-500/10")}>
                <div className={cn("w-14 shrink-0 pt-0.5 text-sm font-black tabular-nums", isNow ? "text-brand-700 dark:text-brand-300" : "text-ink-muted")}>
                  {h || "—"}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {v.doses.map((t) => {
                    const st = taskStatus(t, day);
                    return (
                      <span key={t.id} className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-bold",
                        st === "given" ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                        : st === "overdue" ? "border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
                        : "border-line bg-surface-2 text-ink-muted")}>
                        <Pill size={11} /> {t.medication}{t.amount ? ` · ${t.amount}` : ""}
                      </span>
                    );
                  })}
                  {v.care.map((e) => {
                    const M = KIND_META[e.kind];
                    return (
                      <span key={e.id} className="group inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-2xs font-bold text-ink">
                        <M.icon size={11} className={M.tone} />
                        {e.label}
                        {e.value != null && <span className="tabular-nums">{formatNum(e.value)} {e.unit}</span>}
                        <button type="button" onClick={() => void remove(e)} aria-label="حذف"
                          className="ms-0.5 text-ink-subtle opacity-0 transition group-hover:opacity-100 hover:text-danger-600"><X size={11} /></button>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* --------------------------- Add one entry --------------------------- */
function AddRow({ kind, onCancel, onAdd }: {
  kind: CareKind;
  onCancel: () => void;
  onAdd: (kind: CareKind, label: string, unit: string, value: number | null, time: string, notes?: string) => void | Promise<void>;
}) {
  const opts = QUICK[kind];
  const [label, setLabel] = useState(opts[0].label);
  const [unit, setUnit] = useState(opts[0].unit);
  const [value, setValue] = useState("");
  const [time, setTime] = useState(HHMM());

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-500/30 dark:bg-brand-500/5">
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button key={o.label} type="button" onClick={() => { playTap(); setLabel(o.label); setUnit(o.unit); }}
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold transition",
              label === o.label ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="input h-8 w-36 text-2xs" placeholder="البند" />
        <input type="number" step="0.1" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
          className="input h-8 w-20 text-center text-2xs font-bold tabular-nums" placeholder="القيمة" />
        <span className="text-2xs font-bold text-ink-subtle">{unit}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input h-8 w-28 text-2xs" />
        <div className="ms-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-2xs font-bold text-ink-muted hover:text-ink">إلغاء</button>
          <button type="button" onClick={() => void onAdd(kind, label.trim(), unit, value === "" ? null : Number(value), time)}
            disabled={!label.trim()}
            className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-4 py-1.5 text-2xs font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-50">
            <Check size={12} /> تسجيل
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Fluid rate calculator ------------------------- */
function FluidCalculator({ pet, onUse }: { pet: Pet; onUse: (rate: number, label: string) => void }) {
  const [weight, setWeight] = useState<number>(pet.current_weight_kg ?? 0);
  const [dehydration, setDehydration] = useState(0);
  const [hours, setHours] = useState(24);
  const [ongoing, setOngoing] = useState(0);
  const [drop, setDrop] = useState<DropFactor>(20);
  const [fluid, setFluid] = useState(FLUID_TYPES[0].label);

  const plan = useMemo(() => fluidPlan({
    weightKg: weight, species: pet.species, dehydrationPct: dehydration,
    replaceOverHours: hours, ongoingMlPerDay: ongoing, dropFactor: drop,
  }), [weight, pet.species, dehydration, hours, ongoing, drop]);

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return (
    <div className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-500/30 dark:bg-sky-500/5">
      <div className="flex flex-wrap items-center gap-2 text-2xs">
        <label className="inline-flex items-center gap-1 font-bold text-ink">
          الوزن
          <input type="number" step="0.1" min={0} value={weight || ""} onChange={(e) => setWeight(Number(e.target.value) || 0)}
            className="input h-8 w-20 text-center font-bold tabular-nums" /> كغ
        </label>
        <label className="inline-flex items-center gap-1 font-bold text-ink">
          خسائر مستمرة
          <input type="number" step="10" min={0} value={ongoing || ""} onChange={(e) => setOngoing(Number(e.target.value) || 0)}
            className="input h-8 w-20 text-center font-bold tabular-nums" placeholder="0" /> مل/يوم
        </label>
        <label className="inline-flex items-center gap-1 font-bold text-ink">
          تعويض خلال
          <input type="number" min={1} max={48} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(48, Number(e.target.value) || 24)))}
            className="input h-8 w-16 text-center font-bold tabular-nums" /> ساعة
        </label>
      </div>

      {/* Dehydration is estimated from signs, not typed as a number */}
      <div className="flex flex-wrap gap-1">
        {DEHYDRATION_BANDS.map((b) => (
          <button key={b.pct} type="button" onClick={() => { playTap(); setDehydration(b.pct); }} title={b.signs}
            className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold transition",
              dehydration === b.pct ? "bg-sky-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
            {b.label}
          </button>
        ))}
      </div>
      {dehydration > 0 && (
        <p className="text-[10px] text-ink-subtle">{DEHYDRATION_BANDS.find((b) => b.pct === dehydration)?.signs}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FLUID_TYPES.map((f) => (
          <button key={f.id} type="button" onClick={() => { playTap(); setFluid(f.label); }} title={f.note}
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold transition",
              fluid === f.label ? "bg-sky-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
            {f.label}
          </button>
        ))}
      </div>

      {/* The numbers */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="صيانة" value={`${formatNum(r1(plan.maintenanceMlDay))} مل/يوم`} />
        <Stat label="عجز الجفاف" value={`${formatNum(r1(plan.deficitMlTotal))} مل`} />
        <Stat label="إجمالي ٢٤ ساعة" value={`${formatNum(r1(plan.totalFirst24hMl))} مل`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-white">
        <span className="text-2xs font-bold opacity-90">المعدّل</span>
        <span className="text-2xl font-black tabular-nums">{formatNum(r1(plan.rateMlPerHour))}</span>
        <span className="text-2xs font-bold opacity-90">مل/ساعة</span>
        <span className="mx-1 opacity-40">|</span>
        <span className="text-lg font-black tabular-nums">{formatNum(r1(plan.dropsPerMinute))}</span>
        <span className="text-2xs font-bold opacity-90">نقطة/دقيقة</span>
        <span className="text-[10px] opacity-75">(نقطة كل {formatNum(r1(plan.secondsPerDrop))} ثانية)</span>
        <button type="button" onClick={() => onUse(r1(plan.rateMlPerHour), fluid)} disabled={!(plan.rateMlPerHour > 0)}
          className="ms-auto rounded-full bg-white px-3 py-1.5 text-2xs font-extrabold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50">
          سجّله بالجدول
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-ink-subtle">طقم التنقيط:</span>
        {DROP_FACTORS.map((d) => (
          <button key={d.value} type="button" onClick={() => { playTap(); setDrop(d.value); }}
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold transition",
              drop === d.value ? "bg-sky-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
            {d.label}
          </button>
        ))}
      </div>

      {plan.warnings.length > 0 && (
        <div className="space-y-1">
          {plan.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded-lg border border-warn-200 bg-warn-50 px-2 py-1.5 text-[10px] font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink-subtle">
        جرعة الصدمة مسار منفصل ما يُجمع مع هذا المعدّل — تُعطى على أرباع مع إعادة تقييم بين كل ربع.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-2 text-center">
      <div className="text-sm font-black tabular-nums text-ink">{value}</div>
      <div className="text-[10px] font-bold text-ink-subtle">{label}</div>
    </div>
  );
}
