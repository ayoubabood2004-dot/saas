import { useState } from "react";
import { Plus, X, Pill, ClipboardList, CalendarClock, Check } from "lucide-react";
import { DiagnosisPicker } from "@/components/DiagnosisPicker";
import { summarizeDiagnoses, type Diagnosis } from "@/lib/diagnoses";
import { Button } from "@/components/ui";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/** How often a treatment is given — drives the dose-count math. */
const FREQS: { id: string; label: string; perDay: number }[] = [
  { id: "1", label: "مرة يومياً", perDay: 1 },
  { id: "2", label: "مرتين يومياً", perDay: 2 },
  { id: "3", label: "٣ مرات", perDay: 3 },
  { id: "4", label: "٤ مرات", perDay: 4 },
  { id: "prn", label: "عند اللزوم", perDay: 0 },
];

interface PlanRow { id: string; name: string; dose: string; freq: string; days: number }

const blankRow = (): PlanRow => ({ id: Math.random().toString(36).slice(2), name: "", dose: "", freq: "2", days: 7 });
const dosesOf = (r: PlanRow) => {
  const per = FREQS.find((f) => f.id === r.freq)?.perDay ?? 0;
  return per > 0 ? per * Math.max(0, r.days) : 0;
};

/**
 * Standalone "التشخيص وخطة العلاج": a structured diagnosis PLUS a scheduled
 * treatment plan (each medicine/method with its frequency and duration). The
 * whole thing is composed into one tidy, printable record entry on save.
 */
export function TreatmentPlan({ onSubmit, busy }: { onSubmit: (body: string) => void | Promise<void>; busy?: boolean }) {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([blankRow()]);

  const setRow = (id: string, patch: Partial<PlanRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => { playTap(); setRows((rs) => [...rs, blankRow()]); };
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const filledRows = rows.filter((r) => r.name.trim());
  const canSave = !busy && (diagnoses.length > 0 || filledRows.length > 0);

  const compose = () => {
    const lines: string[] = [];
    if (diagnoses.length) lines.push(`🩺 التشخيص: ${summarizeDiagnoses(diagnoses)}`);
    if (filledRows.length) {
      lines.push("💊 خطة العلاج:");
      for (const r of filledRows) {
        const freq = FREQS.find((f) => f.id === r.freq)?.label ?? "";
        const doses = dosesOf(r);
        const parts = [
          r.name.trim(),
          r.dose.trim() || null,
          freq,
          r.freq === "prn" ? null : `لمدة ${formatNum(r.days)} يوم`,
          doses ? `(${formatNum(doses)} جرعة)` : null,
        ].filter(Boolean);
        lines.push(`• ${parts.join(" — ")}`);
      }
    }
    return lines.join("\n");
  };

  return (
    <div className="space-y-5">
      {/* Diagnosis */}
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <ClipboardList size={14} className="text-brand-600" /> التشخيص
        </div>
        <DiagnosisPicker value={diagnoses} onChange={setDiagnoses} />
      </section>

      {/* Treatment plan + schedule */}
      <section className="border-t border-line pt-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <CalendarClock size={14} className="text-brand-600" /> خطة العلاج ومدتها
        </div>

        <div className="space-y-2.5">
          {rows.map((r, i) => {
            const doses = dosesOf(r);
            return (
              <div key={r.id} className="rounded-2xl border border-line bg-surface-1 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Pill size={15} /></span>
                  <input
                    value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })}
                    placeholder="اسم الدواء / العلاج"
                    className="input h-9 flex-1 py-0 text-sm font-semibold"
                  />
                  <input
                    value={r.dose} onChange={(e) => setRow(r.id, { dose: e.target.value })}
                    placeholder="الجرعة (مثلاً ٢ مل)"
                    className="input h-9 w-32 py-0 text-sm"
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(r.id)} aria-label="إزالة" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {/* Frequency */}
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5">
                    {FREQS.map((f) => (
                      <button
                        key={f.id} type="button"
                        onClick={() => { playTap(); setRow(r.id, { freq: f.id }); }}
                        className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", r.freq === f.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Duration */}
                  {r.freq !== "prn" && (
                    <label className="inline-flex items-center gap-1.5 text-2xs font-semibold text-ink-muted">
                      المدة
                      <input
                        type="number" min={1} max={365} inputMode="numeric"
                        value={r.days === 0 ? "" : String(r.days)}
                        onChange={(e) => setRow(r.id, { days: Math.max(0, Number(e.target.value) || 0) })}
                        className="input h-8 w-16 px-2 py-0 text-center text-sm font-bold tabular-nums"
                      />
                      يوم
                    </label>
                  )}

                  {/* Dose count */}
                  {doses > 0 && (
                    <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                      {formatNum(doses)} جرعة
                    </span>
                  )}
                </div>
                {i === rows.length - 1 && (
                  <span className="sr-only">آخر صف</span>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addRow} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
          <Plus size={14} /> إضافة دواء / علاج
        </button>
      </section>

      <Button size="lg" className="w-full" leftIcon={<Check size={18} />} disabled={!canSave} loading={busy} onClick={() => onSubmit(compose())}>
        حفظ التشخيص وخطة العلاج
      </Button>
    </div>
  );
}
