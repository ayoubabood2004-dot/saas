import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pill, Syringe, Droplet, Plus, Search, ChevronDown, Trash2, Check,
  ShieldCheck, Stethoscope, CalendarClock, Layers, ClipboardList,
} from "lucide-react";
import type { Species } from "@/types";
import { MED_CATALOG } from "@/lib/meds";
import { VACCINE_CATALOG, BUILTIN_VACCINES } from "@/lib/vaccines";
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
  { label: "1 Month", months: 1 },
  { label: "3 Months", months: 3 },
  { label: "1 Year", years: 1 },
];

/** Map a patient species to its vaccine group in the catalogue. */
const SPECIES_GROUP: Record<Species, string | null> = {
  dog: "Dogs", cat: "Cats", horse: "Horses", cow: "Cattle", rabbit: "Rabbits & small mammals", bird: null, other: null,
};

function addToToday(b: Booster): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (b.days) d.setDate(d.getDate() + b.days);
  if (b.months) d.setMonth(d.getMonth() + b.months);
  if (b.years) d.setFullYear(d.getFullYear() + b.years);
  return d.toISOString().slice(0, 10);
}
const prettyDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export interface MedicationDraft { id: string; kind: "medication"; family: string; name: string; route: RouteId; dosage: string }
export interface VaccinationDraft { id: string; kind: "vaccination"; name: string; nextDue: string | null; lot?: string }
export type MedicalDraft = MedicationDraft | VaccinationDraft;

export function MedicalEntry({
  species,
  onCommit,
  committing,
  className,
}: {
  /** Patient species — filters the vaccine list. If omitted, a species picker is shown. */
  species?: Species;
  /** Persist the built record. If omitted, the sheet is local-only (preview). */
  onCommit?: (entries: MedicalDraft[]) => void | Promise<void>;
  committing?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"medication" | "vaccination">("medication");
  const [draftSpecies, setDraftSpecies] = useState<Species>(species ?? "dog");
  const activeSpecies = species ?? draftSpecies;
  const [sheet, setSheet] = useState<MedicalDraft[]>([]);

  const add = (entry: MedicalDraft) => { setSheet((s) => [entry, ...s]); playSuccess(); };
  const remove = (id: string) => setSheet((s) => s.filter((e) => e.id !== id));

  const [busy, setBusy] = useState(false);
  const commit = async () => {
    if (!sheet.length || busy) return;
    setBusy(true);
    try {
      await onCommit?.(sheet.slice().reverse()); // commit in the order they were added
      toast.success(`${sheet.length} ${sheet.length === 1 ? "entry" : "entries"} saved to the record`);
      setSheet([]);
    } catch {
      // Host signalled a failure — keep the draft so nothing is lost.
      toast.error("Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Mode toggle (plain — no layoutId, which would deadlock the host modal's exit) */}
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

      {onCommit && (
        <Button
          size="lg"
          className="w-full"
          disabled={sheet.length === 0}
          loading={busy || committing}
          leftIcon={<Check size={18} />}
          onClick={commit}
        >
          {sheet.length ? `Save ${sheet.length} to record` : "Add entries to save"}
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

  const drugs = useMemo(() => families.find((f) => f.type === family)?.items ?? [], [families, family]);
  const routeDef = ROUTES.find((r) => r.id === route);
  const ready = !!drug && !!route && !!dosage.trim();

  const reset = () => { setFamily(""); setDrug(""); setRoute(null); setDosage(""); };

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

      <Button
        className="w-full"
        variant="secondary"
        disabled={!ready}
        leftIcon={<Plus size={16} />}
        onClick={() => {
          if (!ready || !route) return;
          onAdd({ id: uid("med"), kind: "medication", family, name: drug, route, dosage: dosage.trim() });
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
                <label className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition cursor-pointer", nextDue && !BOOSTERS.some((b) => addToToday(b) === nextDue) ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
                  <CalendarClock size={14} />
                  <span>Custom</span>
                  <input type="date" className="sr-only" value={nextDue ?? ""} onChange={(e) => setNextDue(e.target.value || null)} />
                </label>
              </div>
              {nextDue && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                  <CalendarClock size={13} className="text-brand-600" /> Booster scheduled for <span className="font-semibold text-ink">{prettyDate(nextDue)}</span>
                </motion.p>
              )}
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
          onAdd({ id: uid("vac"), kind: "vaccination", name: vaccine, nextDue, lot: lot.trim() || undefined });
          setVaccine(""); setNextDue(null); setLot("");
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
