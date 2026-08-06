import { useMemo } from "react";
import { Calculator, Syringe, ShieldAlert, AlertTriangle, Check, Info, BookOpen, Beaker } from "lucide-react";
import {
  matchMonograph, doseFor, calcDose, checkSafety, worstTone,
  APP_ROUTE, appFreqHours, freqIdFor, CLASS_LABEL, ROUTE_LABEL, FREQ_LABEL,
  type DoseAlert, type DoseTone,
} from "@/lib/vetFormulary";
import type { Species } from "@/types";
import type { ChartFlags } from "@/lib/problems";
import { formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/** The slice of a plan row this block reads and writes. */
export interface DosePatch {
  mgPerKg?: number;
  dose?: string;
  doseMode?: "weight" | "manual";
  route?: string;
  freq?: string;
  strength?: number;
  solid?: boolean;
}

const TONE_ROW: Record<DoseTone, string> = {
  critical: "border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300",
  warn: "border-warn-200 bg-warn-50 text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-300",
  good: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300",
  info: "border-line bg-surface-2 text-ink-muted",
};
const TONE_ICON: Record<DoseTone, typeof Info> = {
  critical: ShieldAlert, warn: AlertTriangle, good: Check, info: Info,
};

/** One safety finding, rendered so the reason is always visible — never just a color. */
export function DoseAlertRow({ alert }: { alert: DoseAlert }) {
  const Icon = TONE_ICON[alert.tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-2.5 py-2", TONE_ROW[alert.tone])}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-2xs leading-relaxed">
        <div className="font-extrabold">{alert.title}</div>
        {alert.detail && <div className="mt-0.5 opacity-90">{alert.detail}</div>}
      </div>
    </div>
  );
}

/**
 * DoseBlock — the scientific dose calculator + live drug-safety guard.
 *
 * Everything the vet needs before the needle goes in, in one card:
 *   • the drug's documented window FOR THIS SPECIES (from the local formulary),
 *   • mg/kg × weight → mg → **ml at the real vial concentration**, rounded to
 *     what a syringe can actually draw (or to ¼/½ tablets for solids),
 *   • and the alerts: species bans, over/under dose, daily ceiling, duplicate
 *     therapy and dangerous class combinations — computed on every keystroke.
 *
 * It never blocks the doctor. It shows the reason and lets them decide.
 */
export function DoseBlock({
  name, species, weightKg, mgPerKg, dose, doseMode, route, freq, strength, solid, concurrent, allergies, flags, onPatch,
}: {
  name: string;
  species?: Species;
  weightKg?: number;
  mgPerKg?: number;
  dose: string;
  doseMode?: "weight" | "manual";
  route?: string;
  freq: string;
  strength?: number;
  solid?: boolean;
  /** The other drug names already on this plan — drives duplicate/interaction checks. */
  concurrent: string[];
  /** Free-text allergies from the patient's chart. */
  allergies?: string[];
  /** Prescribing flags derived from the live problem list (renal/hepatic/pregnant). */
  flags?: ChartFlags;
  onPatch: (patch: DosePatch) => void;
}) {
  const drug = useMemo(() => matchMonograph(name), [name]);
  const win = drug && species ? doseFor(drug, species) : undefined;
  const isSolid = solid ?? drug?.solid ?? false;

  const mode: "weight" | "manual" = doseMode ?? (dose.trim() && mgPerKg === undefined ? "manual" : weightKg ? "weight" : "manual");

  const calc = useMemo(() => {
    if (!mgPerKg || !weightKg) return undefined;
    return calcDose({ mgPerKg, weightKg, strength, solid: isSolid, freq: appFreqHours(freq) });
  }, [mgPerKg, weightKg, strength, isSolid, freq]);

  const alerts = useMemo(() => {
    if (!drug || !species || !mgPerKg) {
      // A banned drug must warn even before a dose is typed.
      if (drug && species) return checkSafety({ drug, species, mgPerKg: 0, allergies, flags, concurrent: concurrent.map(matchId).filter(Boolean) as string[] });
      return [] as DoseAlert[];
    }
    return checkSafety({
      drug, species, weightKg, mgPerKg,
      route: route ? APP_ROUTE[route] : undefined,
      freq: appFreqHours(freq),
      allergies,
      flags,
      concurrent: concurrent.map(matchId).filter(Boolean) as string[],
    });
  }, [drug, species, weightKg, mgPerKg, route, freq, concurrent, allergies, flags]);

  const tone = worstTone(alerts);

  /** Fill the row with this drug's documented starting point for this species. */
  const useTypical = () => {
    if (!win) return;
    playTap();
    onPatch({
      doseMode: "weight",
      mgPerKg: win.typical,
      dose: "",
      freq: freqIdFor(win.freq),
      route: route ?? APP_ROUTE_BACK[win.routes[0]],
      strength: strength ?? drug?.strengths?.[0],
      solid: isSolid || undefined,
    });
  };

  return (
    <div className="space-y-2">
      {/* --- Formulary card: what the reference says for THIS species --- */}
      {drug && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-2.5 dark:border-brand-500/25 dark:bg-brand-500/10">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BookOpen size={13} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="text-2xs font-extrabold text-brand-700 dark:text-brand-200">{drug.ar}</span>
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{CLASS_LABEL[drug.klass]}</span>
            {win ? (
              <span className="text-2xs font-semibold text-ink-muted">
                {formatNum(win.min)}–{formatNum(win.max)} ملغ/كغ · {FREQ_LABEL[win.freq]} · {win.routes.map((r) => ROUTE_LABEL[r]).join("/")}
              </span>
            ) : (
              <span className="text-2xs font-semibold text-warn-600 dark:text-warn-300">ما في جرعة موثّقة لهذا النوع</span>
            )}
            {win && (
              <button type="button" onClick={useTypical}
                className="ms-auto rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-soft transition hover:bg-brand-700">
                استعمل الجرعة المعتادة
              </button>
            )}
          </div>
          {win?.note && <div className="mt-1 text-[10px] font-semibold text-ink-subtle">{win.note}</div>}
        </div>
      )}

      {/* --- The calculator itself --- */}
      <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 dark:border-violet-500/20 dark:bg-violet-500/5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-2xs font-extrabold text-violet-600 dark:text-violet-300"><Calculator size={13} /> الجرعة</span>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-surface-1 p-0.5 dark:border-violet-500/30">
            <button type="button" onClick={() => { playTap(); onPatch({ doseMode: "weight", dose: "" }); }}
              className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", mode === "weight" ? "bg-violet-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>حسب الوزن</button>
            <button type="button" onClick={() => { playTap(); onPatch({ doseMode: "manual", mgPerKg: undefined }); }}
              className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", mode === "manual" ? "bg-violet-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>يدوي</button>
          </div>
        </div>

        {mode === "weight" ? (
          <div className="space-y-2">
            {/* mg/kg × weight = mg */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <input type="number" min={0} step="0.01" inputMode="decimal" value={mgPerKg === undefined ? "" : String(mgPerKg)}
                onChange={(e) => { const v = Number(e.target.value); onPatch({ mgPerKg: e.target.value === "" || Number.isNaN(v) || v <= 0 ? undefined : v }); }}
                className="input h-9 w-20 px-1.5 py-0 text-center text-sm font-bold tabular-nums" placeholder="mg/kg" />
              <span className="text-2xs font-bold text-ink-subtle">mg/kg</span>
              {calc ? (
                <>
                  <span className="font-black text-violet-500">× {formatNum(weightKg!)} كغ =</span>
                  <span className="rounded-lg bg-violet-600 px-3 py-1.5 text-base font-extrabold text-white">{formatNum(round2(calc.mg))} mg</span>
                </>
              ) : !weightKg ? (
                <span className="text-2xs font-semibold text-warn-600 dark:text-warn-300">↑ أدخل وزن الحيوان بالأعلى ليُحسب تلقائياً</span>
              ) : (
                <span className="text-2xs font-semibold text-warn-600 dark:text-warn-300">اكتب mg/kg{win ? " — أو اضغط «استعمل الجرعة المعتادة»" : ""}</span>
              )}
            </div>

            {/* Concentration → the volume actually drawn. This is the step that was missing. */}
            <div className="rounded-lg border border-violet-100 bg-surface-1 p-2 dark:border-violet-500/20">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="inline-flex items-center gap-1 text-2xs font-extrabold text-ink-muted">
                  <Beaker size={12} /> {isSolid ? "قوة الحبة" : "تركيز الأمبولة"}
                </span>
                <input type="number" min={0} step="0.5" inputMode="decimal" value={strength === undefined ? "" : String(strength)}
                  onChange={(e) => { const v = Number(e.target.value); onPatch({ strength: e.target.value === "" || Number.isNaN(v) || v <= 0 ? undefined : v }); }}
                  className="input h-8 w-20 px-1.5 py-0 text-center text-sm font-bold tabular-nums" placeholder={isSolid ? "mg/حبة" : "mg/ml"} />
                <span className="text-2xs font-bold text-ink-subtle">{isSolid ? "ملغ/حبة" : "ملغ/مل"}</span>

                {/* Strengths that actually exist on the market for this drug */}
                {drug?.strengths?.map((s) => (
                  <button key={s} type="button" onClick={() => { playTap(); onPatch({ strength: s, solid: isSolid || undefined }); }}
                    className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold transition",
                      strength === s ? "border-violet-500 bg-violet-600 text-white" : "border-line bg-surface-2 text-ink-muted hover:border-violet-300")}>
                    {formatNum(s)}
                  </button>
                ))}

                {calc?.mlRounded !== undefined && (
                  <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-base font-extrabold text-white">
                    <Syringe size={15} /> {formatNum(calc.mlRounded)} مل
                  </span>
                )}
                {calc?.tabletsLabel && (
                  <span className="ms-auto rounded-lg bg-success-600 px-3 py-1.5 text-base font-extrabold text-white">{calc.tabletsLabel}</span>
                )}
              </div>
              {calc?.ml !== undefined && calc.mlRounded !== undefined && Math.abs(calc.ml - calc.mlRounded) > 0.0005 && (
                <div className="mt-1 text-[10px] font-semibold text-ink-subtle">
                  الحساب الدقيق {formatNum(round3(calc.ml))} مل — مقرّبة لأقرب تدريجة على السرنجة.
                </div>
              )}
              {calc && calc.perDay > 1 && (
                <div className="mt-1 text-[10px] font-semibold text-ink-subtle">
                  مجموع اليوم: {formatNum(round2(calc.mgPerDay))} ملغ ({formatNum(calc.perDay)} جرعات).
                </div>
              )}
            </div>
          </div>
        ) : (
          <input value={dose} onChange={(e) => onPatch({ dose: e.target.value })} placeholder="اكتب الجرعة (مثال: قرص واحد، ٥ قطرات، 1 مل)" className="input h-9 w-full px-2.5 py-0 text-sm" />
        )}
      </div>

      {/* --- Safety --- */}
      {alerts.length > 0 && (
        <div className={cn("space-y-1.5 rounded-xl border p-2", tone === "critical" ? "border-danger-200 bg-danger-50/40 dark:border-danger-500/25 dark:bg-danger-500/5" : "border-line bg-surface-2/50")}>
          <div className="flex items-center gap-1 text-2xs font-extrabold text-ink-muted">
            <ShieldAlert size={12} /> فحص الأمان الدوائي
          </div>
          {alerts.map((a) => <DoseAlertRow key={a.id} alert={a} />)}
        </div>
      )}
    </div>
  );
}

/* --- helpers --- */
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const matchId = (n: string) => matchMonograph(n)?.id;

/** Formulary route → the id the treatment plan's route chips use. */
export const APP_ROUTE_BACK: Record<string, string> = {
  PO: "oral", SC: "sc", IM: "im", IV: "iv", topical: "topical", otic: "eye_ear", ocular: "eye_ear", IP: "iv",
};
