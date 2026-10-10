import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pill, Syringe, Droplet, Plus, Search, ChevronDown, Trash2, Check, X,
  ShieldCheck, Stethoscope, CalendarClock, ClipboardList,
  HeartPulse, Activity, AlertTriangle, NotebookPen, History,
} from "lucide-react";
import type { Species, PatientCondition, MedicalAssessment , Vaccination } from "@/types";
import { MedField } from "@/components/meds/MedPicker";
import type { PickedMed } from "@/lib/medIndex";
import { VACCINE_CATALOG, BUILTIN_VACCINES, getClinicVaccines, hydrateVaccines } from "@/lib/vaccines";
import { repo } from "@/lib/repo";
import { listStaff, ROLE_LABEL, type StaffMember } from "@/lib/staff";
import { Button, useToast } from "@/components/ui";
import { cn, uid, dateLocale } from "@/lib/utils";
import { addInterval, cleanHistory, historyProblem, EARLIEST_DAY } from "@/lib/backdate";
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

interface Booster { key: string; def: string; days?: number; months?: number; years?: number }
const BOOSTERS: Booster[] = [
  { key: "medentry.b2w", def: "أسبوعان", days: 14 },
  { key: "medentry.b3w", def: "3 أسابيع", days: 21 },
  { key: "medentry.b1m", def: "شهر", months: 1 },
  { key: "medentry.b2m", def: "شهران", months: 2 },
  { key: "medentry.b3m", def: "3 أشهر", months: 3 },
  { key: "medentry.b6m", def: "6 أشهر", months: 6 },
  { key: "medentry.b1y", def: "سنة", years: 1 },
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

/** Shared loader for the clinic's active team (real staff, not hardcoded names).
 *  Self-contained fetch per the project's no-TanStack-Query architecture. */
function useActiveStaff(roleFilter?: StaffMember["role"]): { staff: StaffMember[]; loading: boolean } {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listStaff()
      .then((list) => { if (alive) setStaff(list.filter((s) => s.status === "active" && (!roleFilter || s.role === roleFilter))); })
      .catch(() => { /* graceful: dropdown just shows the current value / empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [roleFilter]);
  return { staff, loading };
}

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
/** موعدٌ معزّز من يومٍ بعينه (آخرُ جرعةٍ سابقة) لا من اليوم. */
const addFrom = (base: string, b: Booster): string => addInterval(base, { days: b.days, months: b.months, years: b.years });
/** Format a YYYY-MM-DD safely — never throws / never renders "Invalid Date". */
const prettyDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" });
};

export interface MedicationDraft {
  id: string; kind: "medication";
  /** الصنفُ الإنكليزيّ القديم — «Injection · Antibiotics» بالملاحظات كما كانت حرفاً. */
  family: string;
  name: string; route: RouteId; dosage: string; note?: string; administered: boolean;
  /** منتجٌ واحدٌ بالمخزن بنفس الاسم (المنتقي) — البيعُ يصير سطرَ منتج (جوابُ المالك ٢). */
  productId?: string;
}
export interface VaccinationDraft {
  id: string; kind: "vaccination"; name: string; nextDue: string | null; lot?: string; administered: boolean;
  /** سجلٌّ سابق: تواريخُ جرعاتٍ انعطت قبل (نظيفةٌ تصاعدياً) — تُحفظ كلٌّ بيومها، و`nextDue`
   *  هو الموعدُ القادم بعد آخرها. غيابُه = لقاحُ اليوم أو المخطّط كما كان. */
  history?: string[];
}
export type MedicalDraft = MedicationDraft | VaccinationDraft;

/** Given-today vs planned/prescription toggle, shared by both entry forms. A planned
 *  item is saved un-administered (administered_at = null) so it shows in the record as
 *  "مُخطط / Planned" until the doctor marks it given. */
function GivenToggle({ given, onChange }: { given: boolean; onChange: (g: boolean) => void }) {
  const { t } = useTranslation();
  const opts = [
    { v: true, label: t("medentry.givenToday", "تم الإعطاء اليوم"), icon: <Check size={15} /> },
    { v: false, label: t("medentry.planned", "مُخطّط (وصفة)"), icon: <CalendarClock size={15} /> },
  ] as const;
  return (
    <div className="inline-flex w-full items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
      {opts.map((o) => (
        <button
          key={String(o.v)} type="button" onClick={() => { playTap(); onChange(o.v); }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
            given === o.v ? (o.v ? "bg-success-600 text-white shadow-soft" : "bg-ink-subtle text-white shadow-soft") : "text-ink-muted hover:text-ink",
          )}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function MedicalEntry({
  species,
  onCommit,
  committing,
  className,
  initialMode,
  lockMode,
  defaultDoctor,
  allowHistory,
}: {
  /** ملفُّ الحيوان: يسمح بتسجيل لقاحٍ سابق بتواريخه (VaccinationForm). */
  allowHistory?: boolean;
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
  // Bumped after the clinic catalog (meds + vaccines) is re-pulled on open, so the
  // dropdowns always reflect items just added in Settings — even from another device.
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([hydrateVaccines()]).then(() => { if (alive) setCatalogVersion((v) => v + 1); });
    return () => { alive = false; };
  }, []);
  const [draftSpecies, setDraftSpecies] = useState<Species>(species ?? "dog");
  const activeSpecies = species ?? draftSpecies;
  const [sheet, setSheet] = useState<MedicalDraft[]>([]);
  // Per-visit clinical assessment — attached to the patient's medical record on save.
  const [condition, setCondition] = useState<PatientCondition | null>(null);
  const [notes, setNotes] = useState("");
  // Who administered this entry. Defaults to the signed-in vet; DoctorSelect fills the
  // option list from the clinic's real staff and always keeps this value selectable.
  const [doctor, setDoctor] = useState<string>(defaultDoctor ?? "");
  // Keep in sync if the signed-in vet resolves after mount (async auth).
  useEffect(() => { if (defaultDoctor) setDoctor(defaultDoctor); }, [defaultDoctor]);

  const add = (entry: MedicalDraft) => { setSheet((s) => [entry, ...s]); playSuccess(); };
  const remove = (id: string) => setSheet((s) => s.filter((e) => e.id !== id));

  // A medication/vaccine that's fully configured in the form but hasn't been "Added"
  // to the sheet yet. Save flushes it too, so the doctor never loses an entry just by
  // skipping the "Add" button — one Save captures everything.
  const [hasPending, setHasPending] = useState(false);
  const pendingFlush = useRef<(() => MedicalDraft | null) | null>(null);
  const vaxBlock = useRef<string | null>(null);
  // Only one sub-form is mounted at a time; clear the pending state when the mode flips.
  useEffect(() => { setHasPending(false); pendingFlush.current = null; }, [mode]);

  const [busy, setBusy] = useState(false);
  // Saveable when there's an added entry, a configured-but-unadded one, OR an assessment.
  const pendingCount = sheet.length + (hasPending ? 1 : 0);
  const canSave = pendingCount > 0 || !!condition || notes.trim().length > 0;
  const commit = async () => {
    if (busy) return;
    // لقاحٌ سابقٌ مختارٌ وناقص: لا نحفظ الباقي ونُسقطه بصمت — نقول السببَ ونتوقّف.
    if (vaxBlock.current) { toast.error(vaxBlock.current); return; }
    // Flush the configured-but-unadded medication/vaccine so a single Save saves it too.
    const pending = pendingFlush.current?.() ?? null;
    const entries = pending ? [pending, ...sheet] : sheet; // pending = the most-recent add
    if (entries.length === 0 && !condition && notes.trim().length === 0) return;
    setBusy(true);
    try {
      await onCommit?.(entries.slice().reverse(), { condition, notes: notes.trim() }, doctor || undefined); // committed in add-order
      toast.success(t("medentry.savedToast", "Saved to the patient's record"));
      setSheet([]); setCondition(null); setNotes(""); setHasPending(false); pendingFlush.current = null;
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
          ? <MedicationForm onAdd={add} version={catalogVersion} onReadyChange={setHasPending} flushRef={pendingFlush} species={activeSpecies} />
          : <VaccinationForm species={activeSpecies} hasSpeciesProp={!!species} draftSpecies={draftSpecies} setDraftSpecies={setDraftSpecies} onAdd={add} version={catalogVersion} onReadyChange={setHasPending} flushRef={pendingFlush} allowHistory={allowHistory} blockRef={vaxBlock} />}
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
          {pendingCount
            ? t("medentry.saveN", { n: pendingCount, defaultValue: "Save {{n}} to record" })
            : t("medentry.saveAssessment", "Save assessment")}
        </Button>
      )}
    </div>
  );
}

/* ---------------- Medication ---------------- */
/* الدواءُ يُختار من المنتقي الموحَّد (زرٌّ كبير، «أدويتي» أوّلاً) بدل قائمتين: عائلةٌ إنكليزيةٌ ثم
 * دواءٌ يفتح الكيبورد بعد ٦٠ms. والنصُّ المكتوب اسمُ الكتالوج كما هو، والعائلةُ بالملاحظات
 * صنفُها الإنكليزيّ القديم — «Injection · Antibiotics» لا تتغيّر حرفاً. */
export function MedicationForm({ onAdd, version, addLabel, onReadyChange, flushRef, species, freeText = "offer", stock = "show", onPickMed }: {
  /** `false` = المضيفُ رفض (سعرٌ ناقص، منتجٌ لم يُختر) — النموذجُ يبقى كما هو ولا يُمسح اختيارُه. */
  onAdd: (e: MedicalDraft) => void | boolean; version: number; addLabel?: string; onReadyChange?: (ready: boolean) => void; flushRef?: { current: (() => MedicalDraft | null) | null };
  species?: Species | null;
  /** البيع: «هالمرة بس» وحده — والسجلُّ يعرض الحفظ بـ«أدويتي». */
  freeText?: "offer" | "oneOff" | "off";
  stock?: "show" | "hide";
  /** الدواءُ اختير (أو مُسح) — البيعُ يقرّر منه: منتجٌ بالمخزن أم سطرُ دواء. */
  onPickMed?: (m: PickedMed | null) => void;
}) {
  const { t } = useTranslation();
  void version;
  const [med, setMed] = useState<PickedMed | null>(null);
  const [route, setRoute] = useState<RouteId | null>(null);
  const [dosage, setDosage] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [given, setGiven] = useState(true);

  const drug = med?.name ?? "";
  const routeDef = ROUTES.find((r) => r.id === route);
  const ready = !!med && !!route && !!dosage.trim();

  const reset = () => { setMed(null); onPickMed?.(null); setRoute(null); setDosage(""); setNote(""); setGiven(true); };

  // Build the current selection as a draft (or null if incomplete). Shared by the "Add"
  // button and the parent's Save (which flushes this via flushRef so a configured-but-
  // unadded medication is never lost).
  const buildDraft = (): MedicalDraft | null =>
    ready && route && med ? { id: uid("med"), kind: "medication", family: med.familyType, name: med.name, route, dosage: dosage.trim(), note: note.trim() || undefined, administered: given, productId: med.productId } : null;
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  useEffect(() => {
    if (flushRef) flushRef.current = buildDraft;
    return () => { if (flushRef) flushRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushRef, ready, route, med, dosage, note, given]);

  return (
    <div className="space-y-5">
      {/* Tier 1 — the medicine (unified picker) */}
      <Tier n={1} label={t("medentry.tierDrug", "الدواء")} icon={<Stethoscope size={14} />}>
        <MedField value={med} species={species ?? null} freeText={freeText} stock={stock}
          onChange={(m) => { setMed(m); onPickMed?.(m); setRoute(null); setDosage(""); }} />
      </Tier>

      {/* Tier 3 — route (icon toggles) */}
      <AnimatePresence>
        {drug && (
          <Reveal key="t3">
            <Tier n={2} label={t("medentry.tierRoute", "طريقة الإعطاء")} icon={<Syringe size={14} />}>
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
                      <span className="relative text-xs font-bold">{t(`medentry.route.${r.id}`, r.label)}</span>
                      <span className="relative text-2xs text-ink-subtle">{t(`medentry.routeSub.${r.id}`, r.sub)}</span>
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
            <Tier n={3} label={t("medentry.tierDosage", "الجرعة")} icon={<ClipboardList size={14} />}>
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
                  placeholder={t("medentry.customDosePh", "أو اكتب جرعة مخصصة…")}
                  inputMode="decimal"
                />
                <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-2xs font-medium text-ink-subtle ltr:right-3 rtl:left-3">{t("medentry.customTag", "مخصص")}</span>
              </div>
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Tier 5 — clinical note for this medication (shows on the treatment card) */}
      <AnimatePresence>
        {route && (
          <Reveal key="t5">
            <Tier n={4} label={t("medentry.tierNote", "ملاحظة")} icon={<NotebookPen size={14} />} optional>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("medentry.notePh", "مثال: يُعطى مع الطعام، لوحظ تحسس خفيف…")}
              />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Tier 6 — given today vs planned/prescription */}
      <AnimatePresence>
        {route && (
          <Reveal key="t6">
            <Tier n={5} label={t("medentry.tierStatus", "الحالة")} icon={<Check size={14} />}>
              <GivenToggle given={given} onChange={setGiven} />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      <Button
        className="w-full"
        variant="secondary"
        disabled={!ready}
        leftIcon={<Plus size={16} />}
        onClick={() => { const d = buildDraft(); if (d && onAdd(d) !== false) reset(); }}
      >
        {addLabel ?? t("medentry.addMedication", "إضافة الدواء")}
      </Button>
    </div>
  );
}

/* ---------------- Vaccination (species-aware) ---------------- */
export function VaccinationForm({ species, hasSpeciesProp, draftSpecies, setDraftSpecies, onAdd, version, addLabel, onReadyChange, flushRef, petId, petName, allowHistory, blockRef }: {
  species: Species; hasSpeciesProp: boolean; draftSpecies: Species; setDraftSpecies: (s: Species) => void; onAdd: (e: MedicalDraft) => void; version: number; addLabel?: string; onReadyChange?: (ready: boolean) => void; flushRef?: { current: (() => MedicalDraft | null) | null };
  /** حيوان مربوط (بيع من ملفه): يُعرض سجل لقاحاته — السابق والمستحق — للاختيار بضغطة. */
  petId?: string | null; petName?: string | null;
  /** ملفُّ الحيوان وحده: «انلقح قبل؟» يسجّل تواريخَ سابقة. البيعُ لا — البيعُ يحصل اليوم. */
  allowHistory?: boolean;
  /** سببٌ يمنع «احفظ» (سجلٌّ سابق ناقص) — وإلا حفظ الأبُ الباقي وأسقط هذا بصمت. */
  blockRef?: { current: string | null };
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [vaccine, setVaccine] = useState("");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [lot, setLot] = useState("");
  const [given, setGiven] = useState(true);
  /** تواريخُ الجرعات السابقة (null = اللقاحُ ليس سجلاً سابقاً). سطرٌ فارغ = تاريخٌ لم يُكتب بعد. */
  const [pastDates, setPastDates] = useState<string[] | null>(null);
  const todayLocal = localISO(new Date());
  const pastClean = useMemo(() => (pastDates ? cleanHistory(pastDates, todayLocal) : []), [pastDates, todayLocal]);
  const pastLast = pastClean.length ? pastClean[pastClean.length - 1] : null;
  /** المواعيدُ المقترحة تنحسب من آخر جرعةٍ سابقة — لا من اليوم. */
  const boosterOf = (b: Booster) => (pastDates && pastLast ? addFrom(pastLast, b) : addToToday(b));
  const pastIssue = pastDates ? historyProblem(pastDates, nextDue, todayLocal) : null;

  // سجل لقاحات الحيوان المربوط — يجاوب "شنو انطى سابقاً وشنو المستحق هسة؟"
  const [history, setHistory] = useState<Vaccination[] | null>(null);
  useEffect(() => {
    if (!petId) { setHistory(null); return; }
    let alive = true;
    repo.listVaccinations(petId).then((r) => { if (alive) setHistory(r); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [petId]);
  const vaxSummary = useMemo(() => {
    if (!history || history.length === 0) return [];
    const todayISO = new Date().toISOString().slice(0, 10);
    const byName = new Map<string, { last?: Vaccination; next?: Vaccination }>();
    for (const v of history) {
      const e = byName.get(v.name) ?? {};
      if (v.administered_at) { if (!e.last || (v.administered_at > (e.last.administered_at ?? ""))) e.last = v; }
      else if (v.due_date) { if (!e.next || (v.due_date < (e.next.due_date ?? "9999"))) e.next = v; }
      byName.set(v.name, e);
    }
    return [...byName.entries()]
      .map(([name, e]) => {
        const due = e.next?.due_date ?? null;
        const status: "due" | "upcoming" | "done" = due ? (due.slice(0, 10) <= todayISO ? "due" : "upcoming") : "done";
        return { name, last: e.last, next: e.next, due, status };
      })
      .sort((a, b) => (a.status === "due" ? 0 : a.status === "upcoming" ? 1 : 2) - (b.status === "due" ? 0 : b.status === "upcoming" ? 1 : 2) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  }, [history]);


  // Current selection as a draft (or null). Shared by "Add" and the parent's Save flush,
  // so a chosen-but-unadded vaccine is saved by a single Save.
  const buildDraft = (): MedicalDraft | null => {
    if (!vaccine) return null;
    const due = nextDue && !Number.isNaN(new Date(nextDue + "T00:00:00").getTime()) ? nextDue : null;
    // سجلٌّ سابق ناقص لا يُبنى — والزرُّ مطفأٌ والسببُ مكتوبٌ تحت التواريخ، فلا «انحفظ» عن لا شيء.
    if (pastDates) return pastIssue ? null : { id: uid("vac"), kind: "vaccination", name: vaccine, nextDue: due, administered: true, history: pastClean };
    return { id: uid("vac"), kind: "vaccination", name: vaccine, nextDue: due, lot: lot.trim() || undefined, administered: given };
  };
  const ready = !!vaccine && !(pastDates && pastIssue);
  useEffect(() => {
    if (!blockRef) return;
    blockRef.current = vaccine && pastDates && pastIssue ? t(`medentry.pastErr.${pastIssue}`) : null;
    return () => { blockRef.current = null; };
  }, [blockRef, vaccine, pastDates, pastIssue, t]);
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  useEffect(() => {
    if (flushRef) flushRef.current = buildDraft;
    return () => { if (flushRef) flushRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushRef, vaccine, nextDue, lot, given, pastDates]);

  const group = SPECIES_GROUP[species];
  // Clinic-custom vaccines (added in Settings) aren't species-tagged → always offered.
  const customNames = useMemo(() => getClinicVaccines().map((v) => v.name), [version]);
  const customSet = useMemo(() => new Set(customNames.map((n) => n.toLowerCase())), [customNames]);
  const vaccines = useMemo(() => {
    const builtin = group ? VACCINE_CATALOG.find((g) => g.group === group)?.items ?? [] : BUILTIN_VACCINES;
    // Custom vaccines FIRST so a just-added one is immediately visible (no scrolling);
    // أسماء سجل الحيوان تُضاف أيضاً كي يبقى «تلقيحه الآن» قابلاً للاختيار دائماً.
    const historyNames = (history ?? []).map((v) => v.name);
    return Array.from(new Set([...customNames, ...builtin, ...historyNames]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, version, history]);

  // Reset the chosen vaccine when the species filter changes it out of the list.
  useEffect(() => { if (vaccine && !vaccines.includes(vaccine)) setVaccine(""); }, [vaccines, vaccine]);

  const SPECIES_OPTS: Species[] = ["dog", "cat", "horse", "cow", "rabbit", "bird", "other"];
  // A date that isn't one of the preset boosters → the custom field is the active choice.
  const isCustom = !!nextDue && !BOOSTERS.some((b) => boosterOf(b) === nextDue);

  return (
    <div className="space-y-5">
      {/* Species filter chip / picker */}
      <Tier n={1} label={t("medentry.tierSpecies", "نوع الحيوان")} icon={<ShieldCheck size={14} />}>
        {hasSpeciesProp ? (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white"><ShieldCheck size={15} /></span>
            <span className="text-sm font-semibold capitalize text-ink">{t(`pet.species.${species}`, species)}</span>
            <span className="ms-auto text-xs text-ink-subtle">{t("medentry.vaccinesAvailable", { n: vaccines.length, defaultValue: "{{n}} لقاح متاح" })}</span>
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
                {t(`pet.species.${s}`, s)}
              </button>
            ))}
          </div>
        )}
      </Tier>

      {/* سجل لقاحات الحيوان — السابق والمستحق، مع اختيار بضغطة */}
      {petId && vaxSummary.length > 0 && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-ink">
            <Syringe size={13} className="text-brand-600" /> سجل لقاحات {petName || "الحيوان"}
          </div>
          <div className="space-y-1.5">
            {vaxSummary.map((r) => (
              <div key={r.name} className={cn("flex flex-wrap items-center gap-2 rounded-xl border p-2.5",
                r.status === "due" ? "border-danger-300 bg-danger-50/60 dark:border-danger-500/30 dark:bg-danger-500/10" : "border-line bg-surface-1")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold text-ink">{r.name}</span>
                  <span className="block text-2xs font-bold text-ink-subtle">
                    {r.last?.administered_at
                      ? <>آخر جرعة: {new Date(r.last.administered_at).toLocaleDateString("ar-IQ")}{r.last.dose_number ? ` (${r.last.dose_number}/${r.last.doses_total ?? "؟"})` : ""}</>
                      : "لم يُعطَ سابقاً"}
                  </span>
                </span>
                {r.status === "due" && <span className="rounded-full bg-danger-100 px-2.5 py-1 text-2xs font-black text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">مستحق الآن</span>}
                {r.status === "upcoming" && r.due && <span className="rounded-full bg-warn-50 px-2.5 py-1 text-2xs font-black text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">موعده {new Date(r.due + "T00:00:00").toLocaleDateString("ar-IQ")}</span>}
                {r.status === "done" && <span className="rounded-full bg-success-50 px-2.5 py-1 text-2xs font-black text-success-700 dark:bg-success-500/15 dark:text-success-300">مكتمل ✓</span>}
                {/* المكتمل بلا زر سريع — إعادة تلقيحه قرار متعمد يمر عبر القائمة اليدوية فقط. */}
                {r.status !== "done" && (
                  <button
                    onClick={() => { playTap(); setVaccine(r.name); }}
                    className={cn("rounded-lg px-3 py-1.5 text-2xs font-black transition",
                      vaccine === r.name ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300")}
                  >
                    {vaccine === r.name ? "محدد ✓" : "تلقيحه الآن"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-ink-muted">اختر اللقاح، بيعه، وحدد موعد الجرعة القادمة تحت — الموعد الجديد ينحفظ بسجل الحيوان وتذكيراته تلقائياً. تكدر تضيف أكثر من لقاح، كل واحد بموعده. اللقاح المكتمل ✓ بلا زر سريع — إذا يحتاج جرعة معزّزة (سنوية مثلاً) اختره يدوياً من قائمة اللقاح تحت.</p>
        </div>
      )}

      {/* Vaccine select (filtered) */}
      <Tier n={2} label={t("medentry.tierVaccine", "اللقاح")} icon={<Syringe size={14} />}>
        <FancySelect
          value={vaccine}
          placeholder={t("medentry.vaccinePh", "اختر لقاحاً لهذا النوع…")}
          searchable
          options={vaccines.map((v) => ({ value: v, label: v, hint: customSet.has(v.toLowerCase()) ? t("medentry.clinicCustom") : undefined }))}
          onChange={setVaccine}
        />
      </Tier>

      {/* «انلقح قبل؟» — ملفُّ الحيوان وحده: تواريخُ الجرعات السابقة أوّلاً، ثم الموعدُ القادم منها. */}
      <AnimatePresence>
        {vaccine && allowHistory && (
          <Reveal key="past">
            <div className="space-y-2.5" data-vxpast>
              <button type="button" data-vxpast-toggle aria-pressed={!!pastDates}
                onClick={() => { playTap(); setPastDates((d) => (d ? null : [""])); setNextDue(null); }}
                className={cn("flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-start transition",
                  pastDates ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "border-line bg-surface-1 hover:border-brand-300")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", pastDates ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-subtle")}><History size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{t("medentry.pastToggle", "انلقح قبل؟ سجّل تواريخه السابقة")}</span>
                  <span className="block text-2xs text-ink-subtle">{t("medentry.pastToggleSub", "من ورق أو سستم سابق — بعدها تختار الموعد القادم")}</span>
                </span>
                <span className={cn("h-5 w-9 shrink-0 rounded-full p-0.5 transition", pastDates ? "bg-brand-600" : "bg-line-strong")}>
                  <span className={cn("block h-4 w-4 rounded-full bg-white shadow transition", pastDates ? "translate-x-4 rtl:-translate-x-4" : "")} />
                </span>
              </button>
              {pastDates && (
                <Tier n={3} label={t("medentry.tierPast", "تواريخ التلقيح السابقة")} icon={<History size={14} />}>
                  <div className="space-y-1.5">
                    {pastDates.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-2xs font-bold text-ink-subtle">{t("medentry.pastDoseN", { n: i + 1, defaultValue: "جرعة {{n}}" })}</span>
                        <input type="date" data-vxpast-date={i} value={d} min={EARLIEST_DAY} max={todayLocal}
                          aria-label={t("medentry.pastDoseN", { n: i + 1, defaultValue: "جرعة {{n}}" })}
                          onChange={(e) => { const v = e.target.value; setPastDates((arr) => (arr ? arr.map((x, j) => (j === i ? v : x)) : arr)); }}
                          className="input h-10 flex-1 tabular-nums [color-scheme:light] dark:[color-scheme:dark]" dir="ltr" />
                        {pastDates.length > 1 && (
                          <button type="button" onClick={() => { playTap(); setPastDates((arr) => (arr ? arr.filter((_, j) => j !== i) : arr)); }}
                            aria-label={t("medentry.pastRemove", "شيل هذا التاريخ")} title={t("medentry.pastRemove", "شيل هذا التاريخ")}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={15} /></button>
                        )}
                      </div>
                    ))}
                    <button type="button" data-vxpast-add onClick={() => { playTap(); setPastDates((arr) => [...(arr ?? []), ""]); }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-brand-300 px-3 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-300 dark:hover:bg-brand-500/10">
                      <Plus size={13} /> {t("medentry.pastAdd", "أضف تاريخ ثاني")}
                    </button>
                    {pastIssue && pastIssue !== "nextNotAfterLast" && pastDates.some((x) => x) && (
                      <p className="flex items-center gap-1.5 text-2xs font-bold text-danger-600 dark:text-danger-400" data-vxpast-issue={pastIssue}>
                        <AlertTriangle size={12} className="shrink-0" /> {t(`medentry.pastErr.${pastIssue}`)}
                      </p>
                    )}
                  </div>
                </Tier>
              )}
            </div>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Booster scheduler */}
      <AnimatePresence>
        {vaccine && (!pastDates || pastLast) && (
          <Reveal key="booster">
            <Tier n={pastDates ? 4 : 3} label={t("medentry.tierBooster", "موعد الجرعة القادمة")} icon={<CalendarClock size={14} />}>
              {pastDates && pastLast && (
                <p className="mb-2 text-2xs font-bold text-ink-subtle">{t("medentry.pastFromLast", { date: prettyDate(pastLast), defaultValue: "المواعيد تنحسب من آخر جرعة ({{date}})" })}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {BOOSTERS.map((b) => {
                  const iso = boosterOf(b);
                  const active = nextDue === iso;
                  return (
                    <button
                      key={b.key}
                      onClick={() => { playTap(); setNextDue(active ? null : iso); }}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                        active ? "border-brand-500 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      {t(b.key, b.def)}
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
                  <p className="text-sm font-bold text-ink">{t("medentry.customDate", "تاريخ مخصص")}</p>
                  <p className="text-2xs text-ink-subtle">{t("medentry.customDateSub", "اختر يوماً محدداً")}</p>
                </div>
                <input
                  type="date"
                  aria-label={t("medentry.customDate", "تاريخ مخصص")}
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
                    <span className="flex-1">{t("medentry.nextDoseScheduled", "موعد الجرعة القادمة:")} <span className="font-bold">{prettyDate(nextDue)}</span></span>
                    <button type="button" onClick={() => { playTap(); setNextDue(null); }} aria-label={t("common.clear", "مسح")} className="shrink-0 rounded-full p-1 transition hover:bg-success-100 dark:hover:bg-success-500/20">
                      <X size={13} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              {pastDates && nextDue && pastIssue === "nextNotAfterLast" && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs font-bold text-danger-600 dark:text-danger-400" data-vxpast-issue="nextNotAfterLast">
                  <AlertTriangle size={12} className="shrink-0" /> {t("medentry.pastErr.nextNotAfterLast", "الموعد القادم لازم يكون بعد آخر جرعة")}
                </p>
              )}
              {pastDates && nextDue && !pastIssue && nextDue < todayLocal && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs font-bold text-warn-700 dark:text-warn-300" data-vxpast-late>
                  <AlertTriangle size={12} className="shrink-0" /> {t("medentry.pastDueLate", "هذا الموعد فات — راح ينسجّل متأخر ويطلع بالأحمر")}
                </p>
              )}
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Lot number (optional) — السجلُّ السابق بلا تشغيلة: الورقُ نادراً يذكرها. */}
      <AnimatePresence>
        {vaccine && !pastDates && (
          <Reveal key="lot">
            <Tier n={4} label={t("medentry.tierLot", "رقم التشغيلة (Lot)")} icon={<ClipboardList size={14} />} optional>
              <input className="input font-mono" value={lot} onChange={(e) => setLot(e.target.value)} placeholder={t("medentry.lotPh", "مثال: RB-2291-A")} />
            </Tier>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Given today vs planned (only a scheduled dose is recorded when planned) */}
      <AnimatePresence>
        {vaccine && !pastDates && (
          <Reveal key="vstatus">
            <Tier n={5} label={t("medentry.tierStatus", "الحالة")} icon={<Check size={14} />}>
              <GivenToggle given={given} onChange={setGiven} />
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
          const d = buildDraft();
          if (!d) return;
          try {
            onAdd(d);
            setVaccine(""); setNextDue(null); setLot(""); setGiven(true); setPastDates(null);
          } catch (err) {
            console.error("Add vaccination failed:", err);
            toast.error(t("medentry.vaccineAddFail"), err instanceof Error ? err.message : t("medentry.checkDate"));
          }
        }}
      >
        {addLabel ?? t("medentry.addVaccination", "إضافة اللقاح")}
      </Button>
    </div>
  );
}

/* ---------------- Unified treatment record ---------------- */
function TreatmentSheet({ entries, onRemove }: { entries: MedicalDraft[]; onRemove: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-line bg-surface-1/60">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-ink"><ClipboardList size={16} className="text-brand-600" /> {t("medentry.sheetTitle", "سجل العلاج")}</span>
        {entries.length > 0 && <span className="chip bg-brand-50 text-2xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{entries.length}</span>}
      </div>

      {entries.length === 0 ? (
        <div className="grid place-items-center px-6 py-8 text-center">
          <ClipboardList size={26} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm text-ink-subtle">{t("medentry.sheetEmpty", "الأدوية واللقاحات المضافة تظهر هنا.")}</p>
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
                      {e.kind === "vaccination" ? t("medentry.vaccineTag", "لقاح") : e.family}
                    </span>
                    {e.kind === "vaccination" && e.history?.length
                      ? <span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"><History size={10} className="me-0.5 inline" />{t("medentry.pastTag", "سجل سابق")}</span>
                      : <StatusChip given={e.administered} />}
                  </p>
                  <p className="truncate text-xs text-ink-subtle">
                    {e.kind === "medication"
                      ? `${routeLabel(e.route)} · ${e.dosage}`
                      : e.history?.length
                        ? `${t("medentry.pastLine", { n: e.history.length, date: prettyDate(e.history[e.history.length - 1]), defaultValue: "{{n}} جرعة سابقة · آخرها {{date}}" })}${e.nextDue ? ` · ${t("medentry.pastLineNext", { date: prettyDate(e.nextDue), defaultValue: "القادمة {{date}}" })}` : ""}`
                      : e.nextDue ? `${e.administered ? t("medentry.givenNextDue", "أُعطي اليوم · القادمة") : t("medentry.plannedFor", "مُخطّط بتاريخ")} ${prettyDate(e.nextDue)}${e.lot ? ` · Lot ${e.lot}` : ""}` : `${e.administered ? t("medentry.givenTodayLine", "أُعطي اليوم") : t("medentry.plannedTag", "مُخطّط")}${e.lot ? ` · Lot ${e.lot}` : ""}`}
                  </p>
                  {e.kind === "medication" && e.note && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                      <NotebookPen size={11} className="shrink-0 text-brand-600" /> {e.note}
                    </p>
                  )}
                </div>
                <button onClick={() => onRemove(e.id)} aria-label={t("common.remove", "إزالة")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
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
const routeLabel = (id: RouteId) => i18next.t(`medentry.route.${id}`, ROUTES.find((r) => r.id === id)?.label ?? id);

/** Given (green) vs Planned/prescription (gray) status pill — mirrors the badge the
 *  flowsheet & vaccines record show, so the doctor sees the same distinction at add-time. */
function StatusChip({ given }: { given: boolean }) {
  const { t } = useTranslation();
  return given ? (
    <span className="chip shrink-0 bg-success-50 text-2xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-200">
      <Check size={10} className="me-0.5 inline" />{t("medentry.givenTag", "تم الإعطاء")}
    </span>
  ) : (
    <span className="chip shrink-0 bg-surface-2 text-2xs font-medium text-ink-muted">
      <CalendarClock size={10} className="me-0.5 inline" />{t("medentry.plannedTag", "مُخطّط")}
    </span>
  );
}

/** Sleek attending-staff picker bound to the clinic's REAL roster (إدارة الكادر) —
 *  the whole ACTIVE team, vets first, each labeled by role, so a manager can
 *  attribute a dose/procedure to ANY member. The current value (e.g. the signed-in
 *  doctor) always stays selectable. Reused by the entry form + booster modal. */
export function DoctorSelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  const { staff } = useActiveStaff();
  const options = useMemo(() => {
    const order: Record<string, number> = { veterinarian: 0, manager: 1, receptionist: 2, groomer: 3 };
    const opts = [...staff]
      .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name))
      .map((s) => ({
        value: s.name, label: s.name,
        hint: (s.role === "veterinarian" ? (s.specialty || ROLE_LABEL[s.role]) : ROLE_LABEL[s.role]) as string | undefined,
      }));
    if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, label: value, hint: undefined });
    return opts;
  }, [staff, value]);
  return (
    <FancySelect
      value={value} options={options} onChange={onChange} searchable
      placeholder={placeholder ?? t("medentry.selectDoctor", "اختر الطبيب المعالج…")}
      emptyText={t("medentry.noDoctors", "لا يوجد موظفون مضافون — أضفهم من إدارة الكادر")}
    />
  );
}

/** Optional cashier / sales-rep picker for the POS — lists all active clinic staff.
 *  Value is the staff member's ID (saved on the invoice for performance reports). */
export function CashierSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useTranslation();
  const { staff } = useActiveStaff();
  const options = useMemo(() => ([
    { value: "", label: t("retail.noCashier", "بدون تحديد"), hint: undefined as string | undefined },
    ...staff.map((s) => ({ value: s.id, label: s.name, hint: ROLE_LABEL[s.role] })),
  ]), [staff, t]);
  return (
    <FancySelect
      value={value ?? ""} options={options} onChange={(v) => onChange(v || null)} searchable
      placeholder={t("retail.selectCashier", "اختر الموظف…")}
      emptyText={t("retail.noStaff", "لا يوجد موظفون مضافون")}
    />
  );
}

/* ---------------- Primitives ---------------- */
function Tier({ n, label, icon, optional, children }: { n: number; label: string; icon?: React.ReactNode; optional?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-600 text-2xs font-bold text-white">{n}</span>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">{icon}{label}</span>
        {optional && <span className="text-2xs font-normal normal-case text-ink-subtle">· {t("medentry.optional", "اختياري")}</span>}
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
function FancySelect({ value, options, onChange, placeholder, searchable, emptyText }: {
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  emptyText?: string;
}) {
  const { t } = useTranslation();
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
                  placeholder={t("common.searchPh", "ابحث…")}
                  className="w-full rounded-xl bg-surface-2 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle ltr:pl-8 ltr:pr-3 rtl:pr-8 rtl:pl-3"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto p-1 [scrollbar-width:thin]">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-subtle">{emptyText ?? t("common.noMatches", "لا توجد نتائج مطابقة")}</p>
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
