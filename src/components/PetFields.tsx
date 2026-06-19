import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import type { Species, Sex } from "@/types";
import { ageFromDOB, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { allBreeds, breedLabel } from "@/lib/breeds";

const SPECIES_EMOJI: Record<Species, string> = {
  dog: "🐶", cat: "🐱", horse: "🐴", cow: "🐄", bird: "🦜", rabbit: "🐰", other: "🐾",
};
const SPECIES_ORDER: Species[] = ["dog", "cat", "horse", "cow", "bird", "rabbit", "other"];

/** Friendly species selector — a grid of tappable emoji "logo" cards. */
export function SpeciesPicker({ value, onChange }: { value: Species; onChange: (s: Species) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {SPECIES_ORDER.map((s) => {
        const active = value === s;
        return (
          <button
            type="button"
            key={s}
            onClick={() => { onChange(s); playTap(); }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition active:scale-95",
              active
                ? "border-brand-400 bg-brand-50 shadow-soft dark:bg-brand-500/15"
                : "border-line bg-surface-1 hover:border-brand-200 hover:bg-surface-2",
            )}
          >
            <span className="text-2xl leading-none">{SPECIES_EMOJI[s]}</span>
            <span className={cn("text-[11px] font-semibold", active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted")}>
              {t(`pet.species.${s}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SEX_CFG: Record<Sex, { symbol: string; active: string; idle: string }> = {
  male: { symbol: "♂", active: "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", idle: "text-sky-500" },
  female: { symbol: "♀", active: "border-accent-400 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300", idle: "text-accent-500" },
  unknown: { symbol: "?", active: "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", idle: "text-ink-subtle" },
};
const SEX_ORDER: Sex[] = ["male", "female", "unknown"];

/** Color-coded sex toggle (♂ ♀ ?). */
export function SexPicker({ value, onChange }: { value: Sex; onChange: (s: Sex) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      {SEX_ORDER.map((s) => {
        const active = value === s;
        const cfg = SEX_CFG[s];
        return (
          <button
            type="button"
            key={s}
            onClick={() => { onChange(s); playTap(); }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-sm font-semibold transition active:scale-95",
              active ? cfg.active : "border-line bg-surface-1 text-ink-muted hover:border-brand-200 hover:bg-surface-2",
            )}
          >
            <span className={cn("text-lg leading-none", !active && cfg.idle)}>{cfg.symbol}</span>
            {t(`pet.sex.${s}`)}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ label, value, onSet, max = 40 }: { label: string; value: number; onSet: (n: number) => void; max?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-2.5">
      <p className="mb-1 text-center text-xs font-medium text-ink-muted">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label="decrease" onClick={() => onSet(value - 1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted transition hover:bg-surface-3 active:scale-90">
          <Minus size={16} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onSet(Number(e.target.value) || 0)}
          className="w-full min-w-0 bg-transparent text-center font-display text-2xl font-extrabold tracking-tighter2 text-ink outline-none"
        />
        <button type="button" aria-label="increase" onClick={() => onSet(value + 1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition hover:bg-brand-100 active:scale-90 dark:bg-brand-500/15 dark:text-brand-300">
          <Plus size={16} />
        </button>
        <span className="sr-only">{max}</span>
      </div>
    </div>
  );
}

/**
 * Age entered as plain numbers (years + months) instead of a date picker.
 * Stored under the hood as an approximate ISO DOB so the rest of the app is unchanged.
 */
export function AgeInput({ dob, onChange }: { dob: string; onChange: (dob: string) => void }) {
  const { t } = useTranslation();
  // The steppers are the source of truth in "age" mode; init once from any incoming dob.
  const initial = ageFromDOB(dob);
  const [mode, setMode] = useState<"age" | "date">("age");
  const [years, setYears] = useState(initial?.years ?? 0);
  const [months, setMonths] = useState(initial?.months ?? 0);
  const today = new Date().toISOString().slice(0, 10);

  // Only react to an EXTERNAL clear (e.g. form reset) — not to the dob we emit ourselves.
  useEffect(() => {
    if (!dob) { setYears(0); setMonths(0); }
  }, [dob]);

  // Quick age → approximate DOB (Current Date − the entered years/months).
  const emit = (y: number, m: number) => {
    const d = new Date();
    d.setDate(1); // day=1 so ageFromDOB never drops a partial month
    d.setMonth(d.getMonth() - (y * 12 + m));
    onChange(d.toISOString().slice(0, 10));
  };

  const setY = (n: number) => { const y = Math.max(0, Math.min(40, n)); setYears(y); emit(y, months); };
  const setM = (n: number) => { const m = Math.max(0, Math.min(11, n)); setMonths(m); emit(years, m); };

  // Switching back to age mode re-derives the steppers from whatever DOB is set.
  const toAge = () => { const a = ageFromDOB(dob); setYears(a?.years ?? 0); setMonths(a?.months ?? 0); setMode("age"); playTap(); };
  const toDate = () => { setMode("date"); playTap(); };

  return (
    <div className="space-y-2">
      <div className="inline-flex w-full rounded-xl border border-line bg-surface-2 p-1 text-xs font-semibold">
        <button type="button" onClick={toAge} className={cn("flex-1 rounded-lg py-1.5 transition", mode === "age" ? "bg-white text-brand-700 shadow-card dark:bg-surface-1 dark:text-brand-300" : "text-ink-muted")}>{t("pet.modeAge", "By age")}</button>
        <button type="button" onClick={toDate} className={cn("flex-1 rounded-lg py-1.5 transition", mode === "date" ? "bg-white text-brand-700 shadow-card dark:bg-surface-1 dark:text-brand-300" : "text-ink-muted")}>{t("pet.modeDate", "Exact date")}</button>
      </div>
      {mode === "age" ? (
        <div className="grid grid-cols-2 gap-3">
          <Stepper label={t("pet.years", "Years")} value={years} onSet={setY} max={40} />
          <Stepper label={t("pet.months", "Months")} value={months} onSet={setM} max={11} />
        </div>
      ) : (
        <input type="date" dir="ltr" max={today} className="input" value={dob || ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Weight entered with +/- steppers (step 0.5 kg) + direct typing — matching the age UX. */
export function WeightInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const num = parseFloat(value);
  const cur = Number.isNaN(num) ? 0 : num;
  const set = (n: number) => { const v = Math.max(0, Math.round(n * 10) / 10); onChange(v === 0 ? "" : String(v)); };
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-2.5">
      <p className="mb-1 text-center text-xs font-medium text-ink-muted">{t("pet.weight")} ({t("common.kg")})</p>
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label="decrease" onClick={() => set(cur - 0.5)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted transition hover:bg-surface-3 active:scale-90">
          <Minus size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-center font-display text-2xl font-extrabold tracking-tighter2 text-ink outline-none placeholder:text-ink-subtle/40"
          />
          <span className="shrink-0 text-[11px] text-ink-subtle">{t("common.kg")}</span>
        </div>
        <button type="button" aria-label="increase" onClick={() => set(cur + 0.5)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition hover:bg-brand-100 active:scale-90 dark:bg-brand-500/15 dark:text-brand-300">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

const COLORS: { name: string; key: string; style: React.CSSProperties }[] = [
  { name: "Black", key: "black", style: { background: "#1f2937" } },
  { name: "White", key: "white", style: { background: "#f8fafc", border: "1px solid #d8e1f0" } },
  { name: "Gray", key: "gray", style: { background: "#9ca3af" } },
  { name: "Brown", key: "brown", style: { background: "#92400e" } },
  { name: "Golden", key: "golden", style: { background: "#e0a82e" } },
  { name: "Cream", key: "cream", style: { background: "#f3e3c3", border: "1px solid #ecdcb8" } },
  { name: "Ginger", key: "ginger", style: { background: "#e8703a" } },
  { name: "Tan", key: "tan", style: { background: "#c9a36a" } },
  { name: "Brindle", key: "brindle", style: { background: "linear-gradient(135deg,#5b3a1a,#241712)" } },
  { name: "Spotted", key: "spotted", style: { background: "#f8fafc", backgroundImage: "radial-gradient(#1f2937 28%, transparent 30%)", backgroundSize: "8px 8px", border: "1px solid #d8e1f0" } },
  { name: "Tricolor", key: "tricolor", style: { background: "conic-gradient(#1f2937 0 33%, #f8fafc 0 66%, #92400e 0)" } },
];

/** Coat colour as tappable swatch cards (+ free text for anything else). */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const known = COLORS.some((c) => c.name.toLowerCase() === value.trim().toLowerCase());
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {COLORS.map((c) => {
          const active = value.trim().toLowerCase() === c.name.toLowerCase();
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => { onChange(c.name); playTap(); }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border px-1 py-2 transition active:scale-95",
                active ? "border-brand-400 bg-brand-50 shadow-soft dark:bg-brand-500/15" : "border-line bg-surface-1 hover:border-brand-200 hover:bg-surface-2",
              )}
            >
              <span className="h-7 w-7 rounded-full shadow-inner-line" style={c.style} />
              <span className={cn("text-[10px] font-semibold", active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted")}>{t(`color.${c.key}`, c.name)}</span>
            </button>
          );
        })}
      </div>
      <input className="input mt-2 py-2" placeholder={t("pet.colorOther", "Other colour…")} value={known ? "" : value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Breed as popular-breed cards for the species (built-in + clinic-custom) + free text. */
export function BreedPicker({ species, value, onChange }: { species: Species; value: string; onChange: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const breeds = allBreeds(species);
  const known = breeds.some((b) => b.toLowerCase() === value.trim().toLowerCase());
  return (
    <div>
      {breeds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {breeds.map((b) => {
            const active = value.trim().toLowerCase() === b.toLowerCase();
            return (
              <button
                type="button"
                key={b}
                onClick={() => { onChange(b); playTap(); }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-sm font-medium transition active:scale-95",
                  active ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:border-brand-200 hover:bg-surface-2",
                )}
              >
                <span className="text-base leading-none">{SPECIES_EMOJI[species]}</span> {breedLabel(b, i18n.language)}
              </button>
            );
          })}
        </div>
      )}
      <input className="input mt-2 py-2" placeholder={t("pet.breedOther", "Other breed…")} value={known ? "" : value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
