import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pill, Syringe, Droplet, Plus, Search, ChevronDown, Trash2, Check, X,
  ShieldCheck, Stethoscope, CalendarClock, Layers, ClipboardList,
  HeartPulse, Activity, AlertTriangle, NotebookPen,
} from "lucide-react";
import type { Species, PatientCondition, MedicalAssessment } from "@/types";
import { MED_CATALOG } from "@/lib/meds";
import { VACCINE_CATALOG, BUILTIN_VACCINES } from "@/lib/vaccines";
import { DOCTORS } from "@/lib/clinic";
import { Button, useToast } from "@/components/ui";
import { cn, uid } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

/* ============================================================================
 * Unified "Medical Entry" — one component for Medications + Vaccinations.
 *  • Medication: cascading family → drug → route (icons) → dosage (quick-chips).
 *  • Vaccination: species-filtered list + booster scheduler chips.
 *  • Both land in a single, elegant "Treatment Record" sheet.
 * Self-contained (its own animated Select — no Radix dependency); themed via the
 * app's design tokens so it's premium in dark mode out of the box.
 * ==========================================================================*/

export type RouteId = "injection" | "tablet" | "liquid";

interface RouteDef { id: RouteId; label: string; sub: string; icon: typeof Syringe; doses: string[] }
const ROUTES: RouteDef[] = [
  { id: "injection", label: "Injection", sub: "Syringe", icon: Syringe, doses: ["0.5 ml", "1 ml", "2 ml", "5 ml"] },
  { id: "tablet", label: "Tablet", sub: "Oral", icon: Pill, doses: ["¼ tab", "½ tab", "1 tab", "25 mg", "50 mg", "100 mg"] },
  { id: "liquid", label: "Syrup", sub: "Liquid", icon: Droplet, doses: ["1 ml", "2 ml", "5 ml", "10 ml"] },
];

interface Booster { label: string; days?: number; months?: number; years?: number }
const BOOSTERS: Booster[] = [
  { label: "2 Weeks", days: 14 },
  { label: "3 Weeks", days: 21 },
  { label: "1 Month", months: 1 },
  { label: "3 Months", months: 3 },
  { label: "1 Year", years: 1 },
];

/** Patient-condition triage chips — neutral by default, vibrant on hover/active.
 *  Green = Excellent, Blue = Good, Red = Critical (per the requested palette). */
const CONDITIONS: { id: PatientCondition; key: string; def: string; icon: typeof Syringe; idle: string; active: string }[] = [
  {
    id: "excellent", key: "medentry.excellent", def: "Excellent", icon: HeartPulse,
    idle: "border-line bg-surface-2 text-ink-muted hover:border-transparent hover:bg-green-500 hover:text-white",
    active: "border-transparent bg-green-500 text-white shadow-soft ring-2 ring-green-500 ring-offset-2 ring-offset-surface-1",
  },
  {
    id: "good", key: "medentry.good", def: "Good", icon: Activity,
    idle: "border-line bg-surface-2 text-ink-muted hover:border-transparent hover:bg-blue-500 hover:text-white",
    active: "border-transparent bg-blue-500 text-white shadow-soft ring-2 ring-blue-500 ring-offset-2 ring-offset-surface-1",
  },
  {
    id: "critical", key: "medentry.critical", def: "Critical", icon: AlertTriangle,
    idle: "border-line bg-surface-2 text-ink-muted hover:border-transparent hover:bg-red-500 hover:text-white",
    active: "border-transparent bg-red-500 text-white shadow-soft ring-2 ring-red-500 ring-offset-2 ring-offset-surface-1",
  },
];

/** Map a patient species to its vaccine group in the catalogue. */
const SPECIES_GROUP: Record<Species, string | null> = {
  dog: "Dogs", cat: "Cats", horse: "Horses", cow: "Cattle", rabbit: "Rabbits & small mammals", bird: null, other: null,
};

/** Attending-doctor roster (same source as the calendar / reception). */
export const DOCTOR_NAMES = DOCTORS.map((d) => d.name);

/** Local YYYY-MM-DD (NOT toISOString, which shifts to UTC and is off-by-one in
 *  positive-offset zones like Iraq UTC+3 — that made presets never match the
 *  native date input's local value). */
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addToToday(b: Booster): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (b.days) d.setDate(d.getDate() + b.days);
  if (b.months) d.setMonth(d.getMonth() + b.months);
  if (b.years) d.setFullYear(d.getFullYear() + b.years);
  return localISO(d);
}
/** Format a YYYY-MM-DD safely — never throws / never renders "Invalid Date". */
const prettyDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export interface MedicationDraft { id: string; kind: "medication"; family: string; name: string; route: RouteId; dosage: string; note?: string }
export interface VaccinationDraft { id: string; kind: "vaccination"; name: string; nextDue: string | null; lot?: string }
export type MedicalDraft = MedicationDraft | VaccinationDraft;

export function MedicalEntry({
  species,
  onCommit,
  committing,
  className,
  initialMode,
  lockMode,
  defaultDoctor,
}: {
  /** Patient species — filters the vaccine list. If omitted, a species picker is shown. */
  species?: Species;
  /** Persist the built record + the per-visit assessment + the attending doctor. If omitted, local-only. */
  onCommit?: (entries: MedicalDraft[], assessment: MedicalAssessment, attendingDoctor?: string) => void | Promise<void>;
  committing?: boolean;
  className?: string;
  /** Which workflow to open on. Defaults to "medication". */
  initialMode?: "medication" | "vaccination";
  /** Hide the Medication/Vaccination toggle (when launched from a context-specific tab). */
  lockMode?: boolean;
  /** Pre-selects the attending doctor (e.g. the signed-in vet). */
  defaultDoctor?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState<"medication" | "vaccination">(initialMode ?? "medication");
  const [draftSpecies, setDraftSpecies] = useState<Species>(species ?? "dog");
  const activeSpecies = species ?? draftSpecies;
  const [sheet, setSheet] = useState<MedicalDraft[]>([]);
  // Per-visit clinical assessment — attached to the patient's medical record on save.
  const [condition, setCondition] = useState<PatientCondition | null>(null);
  const [notes, setNotes] = useState("");
  // Who administered this entry. Defaults to the signed-in vet when they're in the roster.
  const [doctor, setDoctor] = useState<string>(() => defaultDoctor && DOCTOR_NAMES.includes(defaultDoctor) ? defaultDoctor : DOCTOR_NAMES[0] ?? "");
  // Keep in sync if the signed-in vet resolves after mount (async auth).
  useEffect(() => { if (defaultDoctor && DOCTOR_NAMES.includes(defaultDoctor)) setDoctor(defaultDoctor); }, [defaultDoctor]);

  const add = (entry: MedicalDraft) => { setSheet((s) => [entry, ...s]); playSuccess(); };
  const remove = (id: string) => setSheet((s) => s.filter((e) => e.id !== id));

  const [busy, setBusy] = useState(false);
  // Saveable when there's at least one entry OR a clinical assessment to record.
  const canSave = sheet.length > 0 || !!condition || notes.trim().length > 0;
  const commit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      await onCommit?.(sheet.slice().reverse(), { condition, notes: notes.trim() }, doctor || undefined); // committed in add-order
      toast.success(t("medentry.savedToast", "Saved to the patient's record"));
      setSheet([]); setCondition(null); setNotes("");
    } catch (error) {
      // Surface the exact backend error to the console for diagnosis, then keep
      // the draft so nothing the doctor typed is lost.
      console.error("Supabase Insert Error: ", error);
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("medentry.saveError", "Couldn't save — please try again."), detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Mode toggle (plain — no layoutId, which would deadlock the host modal's exit).
          Hidden when launched from a context-specific tab (lockMode). */}
      {!lockMode && (
        <div className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {([
            { v: "medication", label: "Medication", icon: <Pill size={16} /> },
            { v: "vaccination", label: "Vaccination", icon: <Syringe size={16} /> },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => { playTap(); setMode(o.v); }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
                mode === o.v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink",
              )}
            >
              {o.icon}{o.label}
            </button>
          ))}
        </div>
      )}

      {/* Keyed swap (not AnimatePresence mode="wait" — the panels contain nested
          AnimatePresence reveals, which would deadlock the wait-for-exit). */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, x: mode === "medication" ? -10 : 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {mode === "medication"
          ? <MedicationForm onAdd={add} />
          : <VaccinationForm species={activeSpecies} hasSpeciesProp={!!species} draftSpecies={draftSpecies} setDraftSpecies={setDraftSpecies} onAdd={add} />}
      </motion.div>

      {/* Unified treatment record */}
      <TreatmentSheet entries={sheet} onRemove={remove} />

      {/* ── Patient assessment — saved to the animal's overarching medical record ── */}
      <div className="space-y-4 border-t border-line pt-4">
        {/* Attending doctor (الطبيب المعالج) — who administered this entry */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <Stethoscope size={14} className="text-brand-600" /> {t("medentry.attendingDoctor", "Attending doctor")}
          </div>
          <DoctorSelect value={doctor} onChange={setDoctor} />
        </div>

        {/* Patient Condition (حالة الحيوان) */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <HeartPulse size={14} className="text-brand-600" /> {t("medentry.condition", "Patient condition")}
            <span className="text-2xs font-normal normal-case text-ink-subtle">· {t("medentry.optional", "optional")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CONDITIONS.map((c) => {
              const active = condition === c.id;
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { playTap(); setCondition(active ? null : c.id); }}
                  className={cn("flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm font-bold transition-all", active ? c.active : c.idle)}
                >
                  <Icon size={18} /> {t(c.key, c.def)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clinical Notes (ملاحظات طبية) */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <NotebookPen size={14} className="text-brand-600" /> {t("medentry.clinicalNotes", "Clinical notes")}
            <span className="text-2xs font-normal normal-case text-ink-subtle">· {t("medentry.optional", "optional")}</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("medentry.notesPlaceholder", "Observations, findings, owner instructions… saved to the patient's file.")}
            className="input min-h-[88px] resize-y leading-relaxed"
          />
        </div>
      </div>

      {onCommit && (
        <Button
          size="lg"
          className="w-full"
          disabled={!canSave}
          loading={busy || committing}
          leftIcon={<Check size={18} />}
          onClick={commit}
        >
          {sheet.length
            ? t("medentry.saveN", { n: sheet.length, defaultValue: "Save {{n}} to record" })
            : t("medentry.saveAssessment", "Save assessment")}
        </Button>
      )}
    </div>
  );
}

/* ---------------- Medication (cascading) ---------------- */
function MedicationForm({ onAdd }: { onAdd: (e: MedicalDraft) => void }) {
  const families = useMemo(() => MED_CATALOG.filter((c) => c.type !== "Vaccines"), []);
  const [family, setFamily] = useState<string>("");
  const [drug, setDrug] = useState<string>("");
  const [route, setRoute] = useState<RouteId | null>(null);
  const [dosage, setDosage] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const drugs = useMemo(() => families.find((f) => f.type === family)?.items ?? [], [families, family]);
  const routeDef = ROUTES.find((r) => r.id === route);
  const ready = !!drug && !!route && !!dosage.trim();

  const reset = () => { setFamily(""); setDrug(""); setRoute(null); setDosage(""); setNote(""); };

  return (
    <div className="space-y-5">
      {/* Tier 1 — family */}
      <Tier n={1} label="Drug family" icon={<Layers size={14} />}>
        <FancySelect
          value={family}
          placeholder="Choose a pharmacological family…"
          options={families.map((f) => ({ value: f.type, label: f.type, hint: `${f.items.length}` }))}
          onChange={(v) => { setFamily(v); setDrug(""); setRoute(null); setDosage(""); }}
        />
      </Tier>

      {/* Tier 2 — drug */}
      <AnimatePresence>
        {family && (
          <Reveal key="t2">
            <Tier n={2} label="Specific drug" icon={<Stethoscope size={14} />}>
              <FancySelect
                value={drug}
                placeholder="Select a drug…"
                searchable
                options={drugs.map((d) => ({ value: d, label: d }))}
                onChange={(v) => { setDrug(v); setRoute(null); setDosage(""); }}
              />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Tier 3 — route (icon toggles) */}
      <AnimatePresence>
        {drug && (
          <Reveal key="t3">
            <Tier n={3} label="Route of administration" icon={<Syringe size={14} />}>
              <div className="grid grid-cols-3 gap-2">
                {ROUTES.map((r) => {
                  const Icon = r.icon;
                  const active = route === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => { playTap(); setRoute(r.id); setDosage(""); }}
                      className={cn(
                        "group relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all",
                        active
                          ? "border-brand-400 bg-brand-50 text-brand-700 shadow-soft dark:bg-brand-500/15 dark:text-brand-200"
                          : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:bg-surface-2",
                      )}
                    >
                      {active && <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-brand-400" />}
                      <span className={cn("relative grid h-10 w-10 place-items-center rounded-xl transition", active ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-subtle group-hover:text-brand-600")}>
                        <Icon size={20} />
                      </span>
                      <span className="relative text-xs font-bold">{r.label}</span>
                      <span className="relative text-2xs text-ink-subtle">{r.sub}</span>
                    </button>
                  );
                })}
              </div>
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Tier 4 — dosage chips + custom */}
      <AnimatePresence>
        {route && routeDef && (
          <Reveal key="t4">
            <Tier n={4} label="Dosage" icon={<ClipboardList size={14} />}>
              <div className="flex flex-wrap gap-1.5">
                {routeDef.doses.map((d) => {
                  const active = dosage === d;
                  return (
                    <button
                      key={d}
                      onClick={() => { playTap(); setDosage(d); }}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums transition",
                        active
                          ? "border-brand-500 bg-brand-600 text-white shadow-soft"
                          : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="relative mt-2">
                <input
                  className="input pe-16"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="Or type a custom dose…"
                  inputMode="decimal"
                />
                <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-2xs font-medium text-ink-subtle ltr:right-3 rtl:left-3">custom</span>
              </div>
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Tier 5 — clinical note for this medication (shows on the treatment card) */}
      <AnimatePresence>
        {route && (
          <Reveal key="t5">
            <Tier n={5} label="Note" icon={<NotebookPen size={14} />} optional>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. given with food, mild reaction observed…"
              />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      <Button
        className="w-full"
        variant="secondary"
        disabled={!ready}
        leftIcon={<Plus size={16} />}
        onClick={() => {
          if (!ready || !route) return;
          onAdd({ id: uid("med"), kind: "medication", family, name: drug, route, dosage: dosage.trim(), note: note.trim() || undefined });
          reset();
        }}
      >
        Add medication
      </Button>
    </div>
  );
}

/* ---------------- Vaccination (species-aware) ---------------- */
function VaccinationForm({ species, hasSpeciesProp, draftSpecies, setDraftSpecies, onAdd }: {
  species: Species; hasSpeciesProp: boolean; draftSpecies: Species; setDraftSpecies: (s: Species) => void; onAdd: (e: MedicalDraft) => void;
}) {
  const toast = useToast();
  const [vaccine, setVaccine] = useState("");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [lot, setLot] = useState("");

  const group = SPECIES_GROUP[species];
  const vaccines = useMemo(() => {
    const list = group ? VACCINE_CATALOG.find((g) => g.group === group)?.items ?? [] : BUILTIN_VACCINES;
    return Array.from(new Set(list));
  }, [group]);

  // Reset the chosen vaccine when the species filter changes it out of the list.
  useEffect(() => { if (vaccine && !vaccines.includes(vaccine)) setVaccine(""); }, [vaccines, vaccine]);

  const SPECIES_OPTS: Species[] = ["dog", "cat", "horse", "cow", "rabbit", "bird", "other"];
  // A date that isn't one of the preset boosters → the custom field is the active choice.
  const isCustom = !!nextDue && !BOOSTERS.some((b) => addToToday(b) === nextDue);

  return (
    <div className="space-y-5">
      {/* Species filter chip / picker */}
      <Tier n={1} label="Patient species" icon={<ShieldCheck size={14} />}>
        {hasSpeciesProp ? (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white"><ShieldCheck size={15} /></span>
            <span className="text-sm font-semibold capitalize text-ink">{species}</span>
            <span className="ms-auto text-xs text-ink-subtle">{vaccines.length} vaccines available</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {SPECIES_OPTS.map((s) => (
              <button
                key={s}
                onClick={() => { playTap(); setDraftSpecies(s); }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition",
                  draftSpecies === s ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Tier>

      {/* Vaccine select (filtered) */}
      <Tier n={2} label="Vaccine" icon={<Syringe size={14} />}>
        <FancySelect
          value={vaccine}
          placeholder="Select a vaccine for this species…"
          searchable
          options={vaccines.map((v) => ({ value: v, label: v }))}
          onChange={setVaccine}
        />
      </Tier>

      {/* Booster scheduler */}
      <AnimatePresence>
        {vaccine && (
          <Reveal key="booster">
            <Tier n={3} label="Next booster due" icon={<CalendarClock size={14} />}>
              <div className="flex flex-wrap items-center gap-1.5">
                {BOOSTERS.map((b) => {
                  const iso = addToToday(b);
                  const active = nextDue === iso;
                  return (
                    <button
                      key={b.label}
                      onClick={() => { playTap(); setNextDue(active ? null : iso); }}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                        active ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom date — a polished, reliable native date field. (A previous
                  sr-only input made the picker flaky, so "Add" appeared dead.) */}
              <label className={cn(
                "group mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-brand-400/40",
                isCustom ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300 hover:bg-surface-2",
              )}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl transition", isCustom ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-subtle group-hover:text-brand-600")}>
                  <CalendarClock size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">Custom date</p>
                  <p className="text-2xs text-ink-subtle">Pick a specific day</p>
                </div>
                <input
                  type="date"
                  aria-label="Custom next-dose date"
                  className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm font-bold text-ink outline-none ring-1 ring-line transition focus:ring-brand-400 [color-scheme:light] dark:[color-scheme:dark]"
                  value={nextDue ?? ""}
                  onChange={(e) => setNextDue(e.target.value || null)}
                />
              </label>

              <AnimatePresence>
                {nextDue && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    className="mt-2 flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-300"
                  >
                    <CalendarClock size={14} className="shrink-0" />
                    <span className="flex-1">Next dose scheduled for <span className="font-bold">{prettyDate(nextDue)}</span></span>
                    <button type="button" onClick={() => { playTap(); setNextDue(null); }} aria-label="Clear date" className="shrink-0 rounded-full p-1 transition hover:bg-success-100 dark:hover:bg-success-500/20">
                      <X size={13} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Lot number (optional) */}
      <AnimatePresence>
        {vaccine && (
          <Reveal key="lot">
            <Tier n={4} label="Lot number" icon={<ClipboardList size={14} />} optional>
              <input className="input font-mono" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. RB-2291-A" />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      <Button
        className="w-full"
        variant="secondary"
        disabled={!vaccine}
        leftIcon={<Plus size={16} />}
        onClick={() => {
          if (!vaccine) return;
          try {
            // A custom date arrives as YYYY-MM-DD; normalize & reject anything unparseable
            // so a bad value can never silently break the add.
            const due = nextDue && !Number.isNaN(new Date(nextDue + "T00:00:00").getTime()) ? nextDue : null;
            onAdd({ id: uid("vac"), kind: "vaccination", name: vaccine, nextDue: due, lot: lot.trim() || undefined });
            setVaccine(""); setNextDue(null); setLot("");
          } catch (err) {
            console.error("Add vaccination failed:", err);
            toast.error("تعذّرت إضافة اللقاح", err instanceof Error ? err.message : "تحقّق من التاريخ المُختار.");
          }
        }}
      >
        Add vaccination
      </Button>
    </div>
  );
}

/* ---------------- Unified treatment record ---------------- */
function TreatmentSheet({ entries, onRemove }: { entries: MedicalDraft[]; onRemove: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1/60">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-ink"><ClipboardList size={16} className="text-brand-600" /> Treatment record</span>
        {entries.length > 0 && <span className="chip bg-brand-50 text-2xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{entries.length}</span>}
      </div>

      {entries.length === 0 ? (
        <div className="grid place-items-center px-6 py-8 text-center">
          <ClipboardList size={26} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm text-ink-subtle">Added medications & vaccinations appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 px-4 py-3"
              >
                <RouteGlyph entry={e} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    {e.name}
                    <span className={cn("chip shrink-0 text-2xs font-medium", e.kind === "vaccination" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200" : "bg-surface-2 text-ink-muted")}>
                      {e.kind === "vaccination" ? "Vaccine" : e.family}
                    </span>
                  </p>
                  <p className="truncate text-xs text-ink-subtle">
                    {e.kind === "medication"
                      ? `${routeLabel(e.route)} · ${e.dosage}`
                      : e.nextDue ? `Next due ${prettyDate(e.nextDue)}${e.lot ? ` · Lot ${e.lot}` : ""}` : `Administered today${e.lot ? ` · Lot ${e.lot}` : ""}`}
                  </p>
                  {e.kind === "medication" && e.note && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                      <NotebookPen size={11} className="shrink-0 text-brand-600" /> {e.note}
                    </p>
                  )}
                </div>
                <button onClick={() => onRemove(e.id)} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                  <Trash2 size={15} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function RouteGlyph({ entry }: { entry: MedicalDraft }) {
  const Icon = entry.kind === "vaccination" ? Syringe : ROUTES.find((r) => r.id === entry.route)?.icon ?? Pill;
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", entry.kind === "vaccination" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300")}>
      <Icon size={19} />
    </span>
  );
}
const routeLabel = (id: RouteId) => ROUTES.find((r) => r.id === id)?.label ?? id;

/** Sleek attending-doctor picker — reused by the entry form and the booster modal. */
export function DoctorSelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  const options = DOCTOR_NAMES.map((n) => {
    const doc = DOCTORS.find((d) => d.name === n);
    return { value: n, label: n, hint: doc?.specialty };
  });
  return <FancySelect value={value} options={options} onChange={onChange} placeholder={placeholder ?? t("medentry.selectDoctor", "Select attending doctor…")} searchable />;
}

/* ---------------- Primitives ---------------- */
function Tier({ n, label, icon, optional, children }: { n: number; label: string; icon?: React.ReactNode; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-600 text-2xs font-bold text-white">{n}</span>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">{icon}{label}</span>
        {optional && <span className="text-2xs font-normal normal-case text-ink-subtle">· optional</span>}
      </div>
      {children}
    </div>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="overflow-visible"
    >
      {children}
    </motion.div>
  );
}

/** Smooth, searchable select with an animated popover — Radix/Shadcn feel, zero deps. */
function FancySelect({ value, options, onChange, placeholder, searchable }: {
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQ(""); return; }
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return ql ? options.filter((o) => o.label.toLowerCase().includes(ql)) : options;
  }, [q, options]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { playTap(); setOpen((o) => !o); }}
        className={cn(
          "input flex w-full items-center justify-between gap-2 text-start transition",
          open && "ring-2 ring-brand-400/60",
          !selected && "text-ink-subtle",
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-raised"
          >
            {searchable && (
              <div className="relative border-b border-line p-2">
                <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-4 rtl:right-4" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-xl bg-surface-2 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle ltr:pl-8 ltr:pr-3 rtl:pr-8 rtl:pl-3"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto p-1 [scrollbar-width:thin]">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-subtle">No matches</p>
              ) : (
                filtered.map((o) => {
                  const isSel = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { playTap(); onChange(o.value); setOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm transition",
                        isSel ? "bg-brand-600 text-white" : "text-ink hover:bg-surface-2",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className={cn("shrink-0 text-2xs", isSel ? "text-white/70" : "text-ink-subtle")}>{o.hint}</span>}
                      {isSel && <Check size={15} className="shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
