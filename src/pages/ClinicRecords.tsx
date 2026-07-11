import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardList, Search, Phone, Stethoscope, BedDouble, Pill, CalendarDays,
  LogOut as DischargeIcon, Plus, Check, PawPrint, ArrowRightLeft, LogIn, LogOut, Users, X,
  Clock, ChevronDown, ChevronRight, ListChecks, ArrowDownAZ, Pencil, Trash2, AlertTriangle,
} from "lucide-react";
import type { Pet, Admission, TreatmentEntry, Species, Sex, MedicalVisit, PatientCondition } from "@/types";
import { repo } from "@/lib/repo";
import { breedLabel } from "@/lib/breeds";
import { PetAvatar } from "@/components/PetAvatar";
import { Modal } from "@/components/Modal";
import { PhoneInput } from "@/components/PhoneInput";
import { SpeciesPicker, SexPicker, AgeInput, WeightInput, ColorPicker, BreedPicker } from "@/components/PetFields";
import { Button, Badge, Dialog, useToast, Skeleton } from "@/components/ui";
import { formatDate, cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { playTap, playSuccess } from "@/lib/sounds";
import { phoneMatches, nationalNumber } from "@/lib/phone";
import { getDialCode } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import { withTimeout } from "@/lib/errors";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { loadRecordsSnap, recordsKey, type RecordsSnap } from "@/lib/prefetchData";

type Tab = "log" | "cases" | "boarding" | "movement";

function daysSince(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

const KPI_TONE: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
};

const SPECIES_EMOJI: Record<Species, string> = { dog: "🐶", cat: "🐱", horse: "🐴", cow: "🐄", bird: "🦜", rabbit: "🐰", other: "🐾" };

/** Patient health triage → Red / Green / Blue (from the per-visit condition). */
const HEALTH: Record<PatientCondition, { key: string; def: string; dot: string; cls: string }> = {
  excellent: { key: "medentry.excellent", def: "Excellent", dot: "bg-green-500", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  good: { key: "medentry.good", def: "Good", dot: "bg-blue-500", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  critical: { key: "medentry.critical", def: "Critical", dot: "bg-red-500", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

/** Counts up to a number on mount — a small dashboard delight. */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 650;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

type PetStatus = "treatment" | "boarding" | "recent" | null;
function petStatusOf(petId: string, admByPet: Map<string, Admission[]>): PetStatus {
  const adms = admByPet.get(petId) ?? [];
  if (adms.some((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active")) return "treatment";
  if (adms.some((a) => a.kind === "boarding" && a.status === "active")) return "boarding";
  const last = adms.reduce((m, a) => Math.max(m, new Date(a.admitted_on).getTime()), 0);
  if (last && Date.now() - last < 30 * 86400000) return "recent";
  return null;
}

export function ClinicRecords() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("log");

  // Stale-while-revalidate: paint the last snapshot instantly (seeded by the
  // page's own load() or the idle background-warmer — same key + shape).
  const cacheKey = recordsKey(user?.clinic_id ?? user?.id);
  const seed = getCached<RecordsSnap>(cacheKey);
  const [pets, setPets] = useState<Pet[]>(seed?.pets ?? []);
  const [admissions, setAdmissions] = useState<Admission[]>(seed?.admissions ?? []);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>(seed?.treatments ?? []);
  const [visits, setVisits] = useState<MedicalVisit[]>(seed?.visits ?? []);
  const [loading, setLoading] = useState(!seed);

  const mounted = useRef(true);
  const load = async () => {
    try {
      // Tenant isolation: only this clinic's own patients & records (RLS enforces
      // it server-side). Fetch composition lives in prefetchData so the page and
      // the idle warmer stay identical.
      const snap = await withTimeout(loadRecordsSnap(user?.clinic_id ?? user?.id), 15000);
      if (!mounted.current) return;
      setPets(snap.pets);
      setAdmissions(snap.admissions);
      setTreatments(snap.treatments);
      setVisits(snap.visits);
      setCached<RecordsSnap>(cacheKey, snap);
    } catch {
      /* hung/failed query — finally still clears the skeleton */
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    if (!isFresh(cacheKey, 20_000)) void load(); // skip refetch when fresh (< 20s)
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Therapeutic boarding counts toward both KPIs (it's treatment + boarding at once).
  const activeCases = admissions.filter((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active").length;
  const activeBoarding = admissions.filter((a) => (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status === "active").length;
  const movements = admissions.reduce((n, a) => n + 1 + (a.discharged_on ? 1 : 0), 0);

  const TABS: { id: Tab; icon: typeof ClipboardList; count: number }[] = [
    { id: "log", icon: ClipboardList, count: pets.length },
    { id: "cases", icon: Stethoscope, count: activeCases },
    { id: "boarding", icon: BedDouble, count: activeBoarding },
    { id: "movement", icon: ArrowRightLeft, count: movements },
  ];

  // Distinct registered clients = unique owners (keyed by phone, like the directory).
  const clientCount = useMemo(() => {
    const dialCode = getDialCode();
    const set = new Set<string>();
    for (const p of pets) {
      const nat = nationalNumber(p.owner_phone ?? "", dialCode);
      set.add(nat ? `ph:${nat}` : `solo:${p.id}`);
    }
    return set.size;
  }, [pets]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const newThisMonth = pets.filter((p) => (p.created_at ?? "").slice(0, 7) === thisMonth).length;

  const kpis = [
    { icon: Users, label: t("records.kpiClients", "Total clients"), value: clientCount, tone: "brand" },
    { icon: PawPrint, label: t("records.kpiPatients", "Patients"), value: pets.length, tone: "sky" },
    { icon: CalendarDays, label: t("records.kpiNewMonth", "New this month"), value: newThisMonth, tone: "success" },
    { icon: Stethoscope, label: t("records.kpiActive", "Active treatments"), value: activeCases, tone: "accent" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardList size={20} /></span>
        <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("records.title")}</h1>
        <Button className="ms-auto" size="sm" leftIcon={<Plus size={16} />} onClick={() => { playTap(); navigate("/new-case"); }}>
          {t("newCase.newCaseBtn")}
        </Button>
      </div>

      {/* Insight cards */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-2xl" />)
          : kpis.map((k) => {
              const Icon = k.icon;
              return (
                <motion.div key={k.label} variants={staggerItem} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-card">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", KPI_TONE[k.tone])}><Icon size={18} /></span>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-extrabold leading-none text-ink"><CountUp value={k.value} /></p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{k.label}</p>
                  </div>
                </motion.div>
              );
            })}
      </motion.div>

      {/* Tabs */}
      <div role="tablist" aria-label={t("records.title")} className="mb-5 flex max-w-2xl gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1">
        {TABS.map(({ id, icon: Icon, count }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => { playTap(); setTab(id); }}
              className={cn(
                "relative flex min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted hover:text-ink",
              )}
            >
              {active && <motion.span layoutId="records-tab" className="absolute inset-0 rounded-xl bg-surface-1 shadow-card" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={16} /> {t(`records.tabs.${id}`)}
                {count > 0 && <span className={cn("rounded-full px-1.5 text-2xs font-bold", active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200" : "bg-surface-3 text-ink-subtle")}>{count}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "log" && <PatientLog pets={pets} admissions={admissions} visits={visits} onChanged={load} loading={loading} />}
          {tab === "cases" && <CurrentCases pets={pets} admissions={admissions} treatments={treatments} onChanged={load} />}
          {tab === "boarding" && <Boarding pets={pets} admissions={admissions} onChanged={load} />}
          {tab === "movement" && <MovementLog pets={pets} admissions={admissions} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ============================================================================
 * Patient directory — a CRM: search + filter pills, a grouping toggle
 * (Alphabet / Species / Last visit) that drives collapsible accordions, and
 * rich rows (owner, pet + breed, last visit, health badge, View full record).
 * ==========================================================================*/
interface DirRow {
  pet: Pet;
  ownerName: string;
  ownerPhone: string;
  lastVisit: string | null; // ISO date of most recent consultation
  health: PatientCondition | null; // most recently recorded condition
  status: PetStatus;
  activityMs: number; // recency (visit | admission | registration)
}

type GroupBy = "recent" | "owner" | "alpha" | "species" | "date";
/** A collapsible accordion section. Owner sections carry header extras (phone + a named flag). */
interface DirGroup { key: string; title: string; rows: DirRow[]; subtitle?: string; ownerHeader?: boolean; ownerNamed?: boolean }

function PatientLog({ pets, admissions, visits, onChanged, loading }: { pets: Pet[]; admissions: Admission[]; visits: MedicalVisit[]; onChanged: () => void; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const dial = getDialCode();
  const lang = i18n.language;
  const searchRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [species, setSpecies] = useState<"all" | Species>("all");
  const [health, setHealth] = useState<"all" | PatientCondition>("all");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("owner");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reassign, setReassign] = useState<Pet | null>(null);
  const [rq, setRq] = useState("");
  const [rNew, setRNew] = useState({ name: "", phone: "", email: "" });
  const [editing, setEditing] = useState<Pet | null>(null);
  const [deleting, setDeleting] = useState<Pet | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  // Optimistically hidden pets (removed from the list before the server confirms).
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const confirmDelete = async () => {
    if (!deleting || delBusy) return;
    const pet = deleting;
    setDelBusy(true);
    setDeletedIds((s) => new Set(s).add(pet.id)); // optimistic removal
    try {
      await repo.deletePet(pet.id);
      playSuccess();
      toast.success(t("records.petDeleted", { name: pet.name, defaultValue: "{{name}} deleted" }));
      setDeleting(null);
      onChanged(); // re-sync from the source of truth
    } catch (e) {
      // Roll back the optimistic removal and surface the error.
      setDeletedIds((s) => { const n = new Set(s); n.delete(pet.id); return n; });
      toast.error(t("records.saveError", "Couldn't save. Please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      setDelBusy(false);
    }
  };

  // Press "/" anywhere to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const admByPet = useMemo(() => {
    const m = new Map<string, Admission[]>();
    for (const a of admissions) m.set(a.pet_id, [...(m.get(a.pet_id) ?? []), a]);
    return m;
  }, [admissions]);

  // Latest visit date + latest *recorded* condition per pet (visits come newest-first).
  const { lastVisitByPet, healthByPet } = useMemo(() => {
    const lv = new Map<string, string>();
    const hb = new Map<string, PatientCondition>();
    for (const v of [...visits].sort((a, b) => b.visit_date.localeCompare(a.visit_date))) {
      if (!lv.has(v.pet_id)) lv.set(v.pet_id, v.visit_date);
      if (v.condition && !hb.has(v.pet_id)) hb.set(v.pet_id, v.condition);
    }
    return { lastVisitByPet: lv, healthByPet: hb };
  }, [visits]);

  const activityMs = (p: Pet): number => {
    const adms = admByPet.get(p.id) ?? [];
    const admMs = adms.reduce((m, a) => Math.max(m, new Date(a.admitted_on).getTime()), 0);
    const visMs = lastVisitByPet.has(p.id) ? new Date(lastVisitByPet.get(p.id)!).getTime() : 0;
    return Math.max(admMs, visMs, new Date(p.created_at ?? 0).getTime());
  };

  const rows: DirRow[] = useMemo(() => pets.filter((p) => !deletedIds.has(p.id)).map((p) => ({
    pet: p,
    ownerName: p.owner_name?.trim() || "—",
    ownerPhone: p.owner_phone?.trim() || "",
    lastVisit: lastVisitByPet.get(p.id) ?? null,
    health: healthByPet.get(p.id) ?? null,
    status: petStatusOf(p.id, admByPet),
    activityMs: activityMs(p),
  })), [pets, deletedIds, lastVisitByPet, healthByPet, admByPet]); // eslint-disable-line react-hooks/exhaustive-deps

  const speciesPresent = useMemo(() => Array.from(new Set(pets.map((p) => p.species))), [pets]);
  const healthCounts = useMemo(() => {
    const c: Record<PatientCondition, number> = { excellent: 0, good: 0, critical: 0 };
    for (const r of rows) if (r.health) c[r.health]++;
    return c;
  }, [rows]);

  const ql = q.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((r) => {
    const matchesQ = !ql
      || r.pet.name.toLowerCase().includes(ql)
      || r.ownerName.toLowerCase().includes(ql)
      || phoneMatches(r.ownerPhone, ql, dial) // digits-only match — ql is fine
      || (r.pet.serial ?? "").toLowerCase().includes(ql);
    const matchesSpecies = species === "all" || r.pet.species === species;
    const matchesHealth = health === "all" || r.health === health;
    const days = (Date.now() - r.activityMs) / 86400000;
    const matchesDate = dateRange === "all" || (dateRange === "week" ? days <= 7 : days <= 30);
    return matchesQ && matchesSpecies && matchesHealth && matchesDate;
  }), [rows, ql, dial, species, health, dateRange]);

  // Build the accordion groups for the active grouping.
  const groups: DirGroup[] = useMemo(() => {
    const byName = (a: DirRow, b: DirRow) => a.ownerName.localeCompare(b.ownerName, lang) || a.pet.name.localeCompare(b.pet.name, lang);
    if (groupBy === "recent") {
      // One flat, newest-first list — a just-registered or just-seen patient
      // always sits at the very top. Rendered without accordion chrome below.
      return [{ key: "recent", title: "", rows: [...filtered].sort((a, b) => b.activityMs - a.activityMs) }];
    }
    if (groupBy === "owner") {
      // Owner-centric hierarchy: one accordion per unique client (keyed by phone,
      // falling back to a per-pet key for pets with no number). Each section's
      // pet rows nest inside; the header carries the owner's name + phone + count.
      const m = new Map<string, DirRow[]>();
      for (const r of filtered) {
        const nat = nationalNumber(r.ownerPhone, dial);
        const key = nat ? `ph:${nat}` : `solo:${r.pet.id}`;
        const a = m.get(key) ?? []; a.push(r); m.set(key, a);
      }
      return [...m.entries()]
        .map(([key, rs]): DirGroup & { recency: number } => {
          // Newest pet first inside each owner (freshest activity at the top).
          const sorted = rs.sort((a, b) => b.activityMs - a.activityMs);
          // Title = the most common owner name in the group, so one mistyped record
          // can't override the majority; falls back to the unassigned label.
          const nameCounts = new Map<string, number>();
          for (const r of sorted) if (r.ownerName !== "—") nameCounts.set(r.ownerName, (nameCounts.get(r.ownerName) ?? 0) + 1);
          const named = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          return {
            key,
            title: named ?? t("records.noOwnerYet", "No owner assigned yet"),
            subtitle: sorted.find((r) => r.ownerPhone)?.ownerPhone ?? "",
            ownerHeader: true,
            ownerNamed: Boolean(named),
            rows: sorted,
            recency: sorted.reduce((mx, r) => Math.max(mx, r.activityMs), 0), // group's freshest activity
          };
        })
        // Newest-active client first; ties fall back to name (the "no owner"
        // bucket only sinks when it isn't itself the most recent).
        .sort((a, b) => b.recency - a.recency || a.title.localeCompare(b.title, lang));
    }
    if (groupBy === "species") {
      const m = new Map<Species, DirRow[]>();
      for (const r of filtered) { const a = m.get(r.pet.species) ?? []; a.push(r); m.set(r.pet.species, a); }
      return [...m.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([sp, rs]) => ({ key: sp, title: `${SPECIES_EMOJI[sp]}  ${t(`pet.species.${sp}`)}`, rows: rs.sort(byName) }));
    }
    if (groupBy === "date") {
      const buckets: Record<string, DirRow[]> = { week: [], month: [], earlier: [] };
      for (const r of filtered) {
        const d = (Date.now() - r.activityMs) / 86400000;
        (d <= 7 ? buckets.week : d <= 30 ? buckets.month : buckets.earlier).push(r);
      }
      const order: { key: string; title: string }[] = [
        { key: "week", title: t("records.grpWeek", "This week") },
        { key: "month", title: t("records.grpMonth", "This month") },
        { key: "earlier", title: t("records.grpEarlier", "Earlier") },
      ];
      return order
        .map((o) => ({ key: o.key, title: o.title, rows: buckets[o.key].sort((a, b) => b.activityMs - a.activityMs) }))
        .filter((g) => g.rows.length > 0);
    }
    // Alphabet (by owner name) — buckets Latin AND Arabic names by their first letter.
    const m = new Map<string, DirRow[]>();
    for (const r of filtered) {
      const first = r.ownerName.trim()[0] ?? "";
      const key = /\p{L}/u.test(first) ? first.toUpperCase() : "#";
      const a = m.get(key) ?? []; a.push(r); m.set(key, a);
    }
    return [...m.keys()]
      .sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b, lang)))
      .map((k) => ({ key: k, title: k, rows: m.get(k)!.sort(byName) }));
  }, [filtered, groupBy, t, lang, dial]);

  // Reset collapse state on a grouping change (everything expanded by default).
  useEffect(() => { setCollapsed(new Set()); }, [groupBy, dial]);
  const isOpen = (key: string) => (ql ? true : !collapsed.has(key)); // search forces all open
  const toggle = (key: string) => setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); playTap(); return n; });
  const expandAll = () => { playTap(); setCollapsed(new Set()); };
  const collapseAll = () => { playTap(); setCollapsed(new Set(groups.map((g) => g.key))); };
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  // Phone-grouped owners — merge targets for "move to owner".
  const owners = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone: string; email: string; count: number }>();
    for (const p of pets) {
      const nat = nationalNumber(p.owner_phone ?? "", dial);
      if (!nat) continue;
      const key = `ph:${nat}`;
      const g = map.get(key) ?? { id: key, name: "—", phone: p.owner_phone?.trim() || "", email: "", count: 0 };
      if (p.owner_name?.trim() && g.name === "—") g.name = p.owner_name.trim();
      if (p.owner_email?.trim() && !g.email) g.email = p.owner_email.trim();
      g.count++;
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [pets, dial]);

  const moveToOwner = async (target: { name?: string; phone?: string; email?: string }) => {
    if (!reassign) return;
    const patch = {
      owner_name: (target.name ?? "").trim() || undefined,
      owner_phone: (target.phone ?? "").trim() || undefined,
      owner_email: (target.email ?? "").trim() || undefined,
    };
    try {
      await repo.updatePet(reassign.id, patch);
    } catch (e) {
      toast.error(t("records.moveError", "Couldn't move the animal. Please try again."), e instanceof Error ? e.message : undefined);
      return;
    }
    playSuccess();
    const movedName = reassign.name;
    setReassign(null); setRq(""); setRNew({ name: "", phone: "", email: "" });
    toast.success(t("records.moved", { pet: movedName, owner: patch.owner_name ?? t("records.thisOwner", "this owner"), defaultValue: "{{pet}} moved to {{owner}}" }));
    onChanged();
  };

  const total = filtered.length;
  const ownerInitials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const GROUPS: { id: GroupBy; label: string; icon: typeof ArrowDownAZ }[] = [
    { id: "recent", label: t("records.grpRecent", "الأحدث"), icon: Clock },
    { id: "owner", label: t("records.grpOwner", "By owner"), icon: Users },
    { id: "species", label: t("records.grpSpecies", "Species"), icon: PawPrint },
  ];

  return (
    <div>
      {/* Search + grouping toggle */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-subtle" />
          <input ref={searchRef} className="input ps-9 pe-16" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("records.searchCrm", "Search owner, pet, phone or file ID…")} />
          {q ? (
            <button onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label={t("common.clear", "Clear")} className="absolute end-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={14} /></button>
          ) : (
            <kbd className="absolute end-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-2 px-1.5 text-2xs font-semibold text-ink-subtle sm:block">/</kbd>
          )}
        </div>
        {/* Grouping segmented */}
        <div className="inline-flex items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const active = groupBy === g.id;
            return (
              <button key={g.id} onClick={() => { playTap(); setGroupBy(g.id); }} className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
                <Icon size={15} /> <span className="hidden sm:inline">{g.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick filters: species · health · date */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {speciesPresent.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={species === "all"} onClick={() => { playTap(); setSpecies("all"); }}>{t("media.all", "All")}</FilterPill>
            {speciesPresent.map((sp) => (
              <FilterPill key={sp} active={species === sp} onClick={() => { playTap(); setSpecies(sp); }}>
                <span>{SPECIES_EMOJI[sp]}</span> {t(`pet.species.${sp}`)}
              </FilterPill>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t("records.health", "Health")}</span>
          <FilterPill active={health === "all"} onClick={() => { playTap(); setHealth("all"); }}>{t("media.all", "All")}</FilterPill>
          {(["excellent", "good", "critical"] as PatientCondition[]).map((h) => (
            <FilterPill key={h} active={health === h} onClick={() => { playTap(); setHealth(health === h ? "all" : h); }}>
              <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[h].dot)} /> {t(HEALTH[h].key, HEALTH[h].def)}
              <span className="text-2xs opacity-70">{healthCounts[h]}</span>
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarDays size={13} className="text-ink-subtle" />
          {(["all", "week", "month"] as const).map((d) => (
            <FilterPill key={d} active={dateRange === d} onClick={() => { playTap(); setDateRange(d); }}>
              {d === "all" ? t("media.all", "All") : d === "week" ? t("records.grpWeek", "This week") : t("records.grpMonth", "This month")}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-subtle">{total} {t("records.patients")}</p>
        {groups.length > 1 && !ql && (
          <button onClick={allCollapsed ? expandAll : collapseAll} className="text-xs font-semibold text-brand-600 transition hover:underline dark:text-brand-300">
            {allCollapsed ? t("records.expandAll", "Expand all") : t("records.collapseAll", "Collapse all")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)}</div>
      ) : total === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-surface-2 text-ink-subtle"><Search size={26} /></span>
          <p className="font-semibold text-ink">{t("records.noResults")}</p>
        </div>
      ) : groupBy === "recent" ? (
        // Newest-first flat list — the freshest patient is always at the top.
        <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface-1 shadow-card">
          {(groups[0]?.rows ?? []).map((r) => (
            <DirectoryRow
              key={r.pet.id}
              row={r}
              lang={lang}
              hideOwner={false}
              onView={() => { playTap(); navigate(`/pet/${r.pet.id}?tab=history`); }}
              onTreatment={() => { playTap(); navigate(`/pet/${r.pet.id}?tab=treatment`); }}
              onMove={() => { playTap(); setReassign(r.pet); setRq(""); setRNew({ name: "", phone: "", email: "" }); }}
              onEdit={() => { playTap(); setEditing(r.pet); }}
              onDelete={() => { playTap(); setDeleting(r.pet); }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const open = isOpen(g.key);
            return (
              <div key={g.key} className="overflow-hidden rounded-3xl border border-line bg-surface-1 shadow-card">
                <button onClick={() => toggle(g.key)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-surface-2">
                  {g.ownerHeader ? (
                    <>
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-2xs font-bold", g.ownerNamed ? "bg-brand-grad text-white" : "bg-surface-2 text-ink-subtle")}>
                        {g.ownerNamed ? ownerInitials(g.title) : <Users size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-extrabold tracking-tighter2 text-ink">{g.title}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                          {g.subtitle ? <><Phone size={11} className="shrink-0" /> {g.subtitle}</> : t("records.noPhone", "no number")}
                        </span>
                      </span>
                      <span className="chip shrink-0 bg-brand-50 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{g.rows.length} {t("records.pets")}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-display text-base font-extrabold tracking-tighter2 text-ink">{g.title}</span>
                      <span className="chip bg-brand-50 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{g.rows.length}</span>
                    </>
                  )}
                  <ChevronDown size={18} className={cn("ms-auto shrink-0 text-ink-subtle transition-transform duration-200", open && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="overflow-hidden">
                      <div className={cn("divide-y divide-line border-t border-line", g.ownerHeader && "bg-surface-2/40")}>
                        {g.rows.map((r) => (
                          <DirectoryRow
                            key={r.pet.id}
                            row={r}
                            lang={lang}
                            hideOwner={g.ownerHeader}
                            onView={() => { playTap(); navigate(`/pet/${r.pet.id}?tab=history`); }}
                            onTreatment={() => { playTap(); navigate(`/pet/${r.pet.id}?tab=treatment`); }}
                            onMove={() => { playTap(); setReassign(r.pet); setRq(""); setRNew({ name: "", phone: "", email: "" }); }}
                            onEdit={() => { playTap(); setEditing(r.pet); }}
                            onDelete={() => { playTap(); setDeleting(r.pet); }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Move / reassign a single animal onto a specific owner. */}
      <Modal open={!!reassign} onClose={() => setReassign(null)} title={t("records.moveTitle", { pet: reassign?.name ?? "", defaultValue: "Move {{pet}} to an owner" })}>
        {reassign && (() => {
          const cur = reassign;
          const rql = rq.trim().toLowerCase();
          const curNat = nationalNumber(cur.owner_phone ?? "", dial);
          const matches = owners
            .filter((o) => {
              const oNat = nationalNumber(o.phone, dial);
              if (!oNat) return false;
              if (curNat && oNat === curNat) return false;
              if (!rql) return true;
              return o.name.toLowerCase().includes(rql) || phoneMatches(o.phone, rq, dial);
            })
            .slice(0, 8);
          const canCreate = Boolean(rNew.name.trim() || rNew.phone.trim());
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
                <PetAvatar pet={cur} size={38} photoFallback />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{cur.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {cur.owner_name ? t("records.currentlyWith", { owner: cur.owner_name, defaultValue: "Currently: {{owner}}" }) : t("records.noOwnerYet", "No owner assigned yet")}
                  </p>
                </div>
              </div>
              <div>
                <label className="label">{t("records.pickOwner", "Assign to an existing owner")}</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-subtle" />
                  <input className="input ps-9" value={rq} onChange={(e) => setRq(e.target.value)} placeholder={t("records.searchOwners", "Search by name or number")} autoFocus />
                </div>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-auto">
                  {matches.length === 0 ? (
                    <p className="px-1 py-3 text-center text-sm text-ink-subtle">{t("records.noOwnerMatch", "No matching owner — add a new one below.")}</p>
                  ) : matches.map((o) => (
                    <button key={o.id} onClick={() => moveToOwner({ name: o.name, phone: o.phone, email: o.email })} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-brand-300 hover:bg-brand-50 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-grad text-2xs font-bold text-white">{ownerInitials(o.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{o.name}</span>
                        <span className="block truncate text-xs text-ink-muted">{o.phone || t("records.noPhone", "no number")} · {o.count} {t("records.pets")}</span>
                      </span>
                      <ArrowRightLeft size={15} className="shrink-0 text-ink-subtle" />
                    </button>
                  ))}
                </div>
              </div>
              <details className="rounded-2xl border border-line bg-surface-1 p-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-ink">{t("records.newOwner", "Or enter a new owner")}</summary>
                <div className="mt-3 space-y-3">
                  <input className="input" value={rNew.name} onChange={(e) => setRNew((s) => ({ ...s, name: e.target.value }))} placeholder={t("records.ownerName", "Owner name")} />
                  <PhoneInput value={rNew.phone} onChange={(v) => setRNew((s) => ({ ...s, phone: v }))} />
                  <input type="email" className="input" value={rNew.email} onChange={(e) => setRNew((s) => ({ ...s, email: e.target.value }))} placeholder="owner@email.com" />
                  <Button className="w-full" disabled={!canCreate} onClick={() => moveToOwner(rNew)}>{t("records.createAssign", "Save & assign")}</Button>
                </div>
              </details>
            </div>
          );
        })()}
      </Modal>

      {/* Edit an existing pet's details. */}
      <EditPetModal pet={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />

      {/* Delete confirmation — destructive, irreversible. */}
      <Dialog
        open={!!deleting}
        onClose={() => { if (!delBusy) setDeleting(null); }}
        title={t("records.deletePet", "Delete pet")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={delBusy}>{t("common.cancel", "Cancel")}</Button>
            <Button variant="danger" onClick={confirmDelete} loading={delBusy} leftIcon={<Trash2 size={16} />}>{t("common.delete", "Delete")}</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300"><AlertTriangle size={20} /></span>
          <p className="text-sm leading-relaxed text-ink-muted">{t("records.deleteConfirm", "Are you sure you want to delete this pet? This action cannot be undone.")}</p>
        </div>
      </Dialog>
    </div>
  );
}

/** Edit an existing pet's core details (name, species, breed, age/DOB, sex, weight, colour). */
function EditPetModal({ pet, onClose, onSaved }: { pet: Pet | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<Sex>("unknown");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // Pre-fill from the pet whenever the modal opens on a new record.
  useEffect(() => {
    if (!pet) return;
    setName(pet.name);
    setSpecies(pet.species);
    setBreed(pet.breed ?? "");
    setSex(pet.sex);
    setDob(pet.dob ?? "");
    setWeight(pet.current_weight_kg != null ? String(pet.current_weight_kg) : "");
    setColor(pet.color ?? "");
  }, [pet]);

  const save = async () => {
    if (!pet || !name.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      await repo.updatePet(pet.id, {
        name: name.trim(),
        species,
        breed: breed.trim() || undefined,
        sex,
        dob: dob || null,
        current_weight_kg: weight ? Number(weight) : null,
        color: color.trim() || undefined,
      });
      playSuccess();
      toast.success(t("records.petUpdated", "Pet updated"));
      onSaved();
    } catch (e) {
      toast.error(t("records.saveError", "Couldn't save. Please try again."), e instanceof Error ? e.message : undefined);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal open={!!pet} onClose={onClose} title={t("records.editPetTitle", { name: pet?.name ?? "", defaultValue: "Edit {{name}}" })}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("pet.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">{t("pet.speciesLabel")}</label>
          <SpeciesPicker value={species} onChange={setSpecies} />
        </div>
        <div>
          <label className="label">{t("pet.breed")}</label>
          <BreedPicker species={species} value={breed} onChange={setBreed} />
        </div>
        <div>
          <label className="label">{t("pet.sexLabel")}</label>
          <SexPicker value={sex} onChange={setSex} />
        </div>
        <div>
          <label className="label">{t("pet.ageLabel", "Age")}</label>
          <AgeInput dob={dob} onChange={setDob} />
        </div>
        <div>
          <WeightInput value={weight} onChange={setWeight} />
        </div>
        <div>
          <label className="label">{t("pet.color")}</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t("common.cancel")}</button>
          <Button className="flex-1" onClick={save} loading={saving} disabled={!name.trim()}>{t("common.save")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function DirectoryRow({ row, lang, hideOwner, onView, onTreatment, onMove, onEdit, onDelete }: { row: DirRow; lang: string; hideOwner?: boolean; onView: () => void; onTreatment: () => void; onMove: () => void; onEdit: () => void; onDelete: () => void }) {
  const { t, i18n } = useTranslation();
  const { pet, ownerName, ownerPhone, lastVisit, health, status } = row;
  const hasAllergy = pet.allergies && pet.allergies.length > 0;
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-surface-2 sm:px-4">
      <button onClick={onView} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <PetAvatar pet={pet} size={42} photoFallback />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
            {pet.name}
            <span className="truncate font-normal text-ink-subtle">· {pet.breed ? breedLabel(pet.breed, i18n.language) : t(`pet.species.${pet.species}`)}</span>
            {hasAllergy && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger-500" title={pet.allergies?.join(", ")} />}
          </p>
          {hideOwner ? (
            // Owner is already on the section header — show the last visit instead.
            <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
              <Clock size={11} className="shrink-0" /> {lastVisit ? `${t("records.lastVisit", "Last visit")} · ${formatDate(lastVisit, lang)}` : t("records.noVisitYet", "No visit yet")}
            </p>
          ) : (
            <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
              <Users size={11} className="shrink-0" /> {ownerName}
              {ownerPhone && <span className="hidden items-center gap-1 sm:inline-flex">· <Phone size={10} /> {ownerPhone}</span>}
            </p>
          )}
        </div>
      </button>

      {/* Health status indicator (red / green / blue) */}
      {health ? (
        <span className={cn("hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold sm:inline-flex", HEALTH[health].cls)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[health].dot)} /> {t(HEALTH[health].key, HEALTH[health].def)}
        </span>
      ) : (
        <span className="hidden shrink-0 items-center gap-1.5 text-2xs text-ink-subtle md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle/40" /> {t("records.noAssessment", "Not assessed")}
        </span>
      )}
      {/* Mobile health dot only */}
      {health && <span className={cn("h-2 w-2 shrink-0 rounded-full sm:hidden", HEALTH[health].dot)} title={t(HEALTH[health].key, HEALTH[health].def)} />}

      {/* Last visit */}
      <span className="hidden shrink-0 items-center gap-1 text-2xs text-ink-subtle lg:inline-flex">
        <Clock size={11} /> {lastVisit ? formatDate(lastVisit, lang) : t("records.noVisitYet", "No visit yet")}
      </span>

      {status === "treatment" && <Badge tone="accent" dot className="hidden shrink-0 md:inline-flex">{t("records.stTreatment", "In treatment")}</Badge>}
      {status === "boarding" && <Badge tone="sky" icon={<BedDouble size={11} />} className="hidden shrink-0 md:inline-flex">{t("records.stBoarding", "Boarding")}</Badge>}

      <div className="flex shrink-0 items-center gap-0.5">
        <button title={t("records.editPet", "Edit pet")} onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15"><Pencil size={15} /></button>
        <button title={t("records.deletePet", "Delete pet")} onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15"><Trash2 size={15} /></button>
        <button title={t("records.moveOwner", "Move to owner")} onClick={onMove} className="hidden h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15 sm:grid"><ArrowRightLeft size={15} /></button>
        <button title={t("treatment.title")} onClick={onTreatment} className="hidden h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/15 sm:grid"><Pill size={15} /></button>
        <Button size="sm" variant="secondary" rightIcon={<ChevronRight size={15} />} onClick={onView}>
          <span className="hidden sm:inline">{t("records.viewRecord", "View record")}</span>
          <span className="sm:hidden">{t("records.view", "View")}</span>
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Current treatment cases ---------------- */
function CurrentCases({ pets, admissions, treatments, onChanged }: { pets: Pet[]; admissions: Admission[]; treatments: TreatmentEntry[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  // Newest admissions first, so a just-opened case leads the board.
  const active = admissions
    .filter((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active")
    .sort((a, b) => new Date(b.admitted_on).getTime() - new Date(a.admitted_on).getTime());

  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(id); }, []);

  const petOf = (id: string) => pets.find((p) => p.id === id);
  const medsToday = (petId: string) => treatments.filter((tx) => tx.pet_id === petId && tx.day === today).length;

  const completion = (a: Admission) => {
    const cycle = a.cycle_hours ?? 24;
    if (!a.last_completed_at) return { done: false, remainingH: 0 };
    const elapsed = Date.now() - new Date(a.last_completed_at).getTime();
    const windowMs = cycle * 3600 * 1000;
    if (elapsed >= windowMs) return { done: false, remainingH: 0 };
    return { done: true, remainingH: Math.max(1, Math.ceil((windowMs - elapsed) / 3600000)) };
  };

  const discharge = async (id: string) => { await repo.updateAdmission(id, { status: "discharged", discharged_on: today }); onChanged(); };
  const setCycle = async (id: string, cycle_hours: number) => { await repo.updateAdmission(id, { cycle_hours }); onChanged(); };
  const markDone = async (id: string) => { await repo.updateAdmission(id, { last_completed_at: new Date().toISOString() }); playSuccess(); onChanged(); };
  const undo = async (id: string) => { await repo.updateAdmission(id, { last_completed_at: null }); onChanged(); };

  const due = active.filter((a) => !completion(a).done);
  const completed = active.filter((a) => completion(a).done);

  const renderCard = (a: Admission) => {
    const p = petOf(a.pet_id);
    if (!p) return null;
    const { done, remainingH } = completion(a);
    const cycle = a.cycle_hours ?? 24;
    return (
      <div key={a.id} className={cn("card p-4", done && "ring-1 ring-success-200 dark:ring-success-500/30")}>
        <div className="flex items-center gap-3">
          <PetAvatar pet={p} size={48} photoFallback />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold text-ink">{p.name}</p>
            <p className="truncate text-xs text-ink-muted">{p.owner_name}</p>
          </div>
          <Badge tone="brand" icon={<Pill size={12} />}>{t("records.todayMeds", { n: medsToday(p.id) })}</Badge>
        </div>
        {a.reason && <p className="mt-2 text-sm text-ink-muted">{a.reason}</p>}
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle">
          <CalendarDays size={12} /> {t("records.admitted")} {formatDate(a.admitted_on, i18n.language)} · {t("snapshot.day", "Day")} {daysSince(a.admitted_on) + 1}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-subtle">{t("records.cycle")}</span>
            <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-[11px] font-medium">
              <button className={cn("rounded-full px-2.5 py-1 transition", cycle === 24 ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")} onClick={() => setCycle(a.id, 24)}>{t("records.daily")}</button>
              <button className={cn("rounded-full px-2.5 py-1 transition", cycle === 12 ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")} onClick={() => setCycle(a.id, 12)}>{t("records.every12")}</button>
            </div>
          </div>
          {done ? (
            <button className="chip bg-success-50 text-[11px] text-success-700 dark:bg-success-500/15 dark:text-success-200" onClick={() => undo(a.id)}>
              <Check size={12} /> {t("records.resetsIn", { h: remainingH })}
            </button>
          ) : (
            <span className="chip bg-warn-50 text-[11px] text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">{t("records.treatmentDue")}</span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {!done && <Button size="sm" leftIcon={<Check size={15} />} onClick={() => markDone(a.id)}>{t("records.markDone")}</Button>}
          <Button size="sm" variant="secondary" className="flex-1" leftIcon={<Pill size={15} />} onClick={() => { playTap(); navigate(`/pet/${p.id}?tab=treatment`); }}>{t("records.openSheet")}</Button>
          <Button size="sm" variant="ghost" onClick={() => discharge(a.id)} aria-label={t("records.discharge")}><DischargeIcon size={15} /></Button>
        </div>
      </div>
    );
  };

  const columns = [
    { id: "due", title: t("records.kanbanDue", "Due now"), icon: Clock, tone: "warn", items: due },
    { id: "done", title: t("records.kanbanDone", "Up to date"), icon: Check, tone: "success", items: completed },
  ] as const;
  const colTone: Record<string, string> = {
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-200",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
  };

  return (
    <div>
      <p className="mb-3 text-xs text-ink-subtle">{t("records.casesHint")}</p>
      {active.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.casesEmpty")}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {columns.map((col) => {
            const Icon = col.icon;
            return (
              <div key={col.id}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-lg", colTone[col.tone])}><Icon size={14} /></span>
                  <h3 className="font-display text-sm font-bold tracking-tighter2 text-ink">{col.title}</h3>
                  <span className="rounded-full bg-surface-2 px-2 text-2xs font-bold text-ink-subtle">{col.items.length}</span>
                </div>
                <div className="space-y-3">
                  {col.items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line p-6 text-center text-xs text-ink-subtle">{t("records.colEmpty", "Nothing here")}</div>
                  ) : col.items.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Boarding ---------------- */
function Boarding({ pets, admissions, onChanged }: { pets: Pet[]; admissions: Admission[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  // Newest admissions first, so the latest boarder leads the grid.
  const active = admissions
    .filter((a) => (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status === "active")
    .sort((a, b) => new Date(b.admitted_on).getTime() - new Date(a.admitted_on).getTime());
  const petOf = (id: string) => pets.find((p) => p.id === id);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const discharge = async (id: string) => { await repo.updateAdmission(id, { status: "discharged", discharged_on: today }); onChanged(); };
  const bulkDischarge = async () => {
    const ids = [...selected];
    await Promise.all(ids.map((id) => repo.updateAdmission(id, { status: "discharged", discharged_on: today })));
    toast.success(t("records.dischargedN", { n: ids.length, defaultValue: "{{n}} patients discharged" }));
    exitSelect();
    onChanged();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-subtle">{t("records.boardingHint")}</p>
        {active.length > 1 && (
          <button
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            aria-label={t("records.select")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selecting ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2"}`}
          >
            {selecting ? <X size={14} /> : <ListChecks size={14} />} {selecting ? t("common.cancel", "Cancel") : t("records.select")}
          </button>
        )}
      </div>
      {active.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.boardingEmpty")}</div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
          {active.map((a) => {
            const p = petOf(a.pet_id);
            if (!p) return null;
            const isSel = selected.has(a.id);
            return (
              <motion.div
                key={a.id}
                variants={staggerItem}
                onClick={selecting ? () => toggleSel(a.id) : undefined}
                className={`card p-4 transition ${selecting ? "cursor-pointer" : ""} ${isSel ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {selecting && (
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-md border-2 ${isSel ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                      {isSel && <Check size={13} />}
                    </span>
                  )}
                  <PetAvatar pet={p} size={48} photoFallback />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold text-ink">{p.name}</p>
                    <p className="truncate text-xs text-ink-muted">{p.owner_name}</p>
                  </div>
                  {a.cage && <Badge tone="sky" icon={<BedDouble size={12} />}>{t("records.cage")} {a.cage}</Badge>}
                </div>
                {a.reason && <p className="mt-2 text-sm text-ink-muted">{a.reason}</p>}
                <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle">
                  <CalendarDays size={12} /> {t("records.admitted")} {formatDate(a.admitted_on, i18n.language)} · {daysSince(a.admitted_on)} {t("records.days")}
                </p>
                {!selecting && (
                  <Button size="sm" variant="ghost" className="mt-3 w-full" leftIcon={<DischargeIcon size={15} />} onClick={() => discharge(a.id)}>{t("records.discharge")}</Button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
      <AnimatePresence>
        {selecting && selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-line bg-surface-1/95 px-3 py-2 shadow-raised backdrop-blur no-print"
          >
            <span className="ps-1 text-sm font-semibold text-ink">{selected.size} {t("records.selectedCount", "selected")}</span>
            <Button size="sm" leftIcon={<DischargeIcon size={15} />} onClick={bulkDischarge}>{t("records.discharge")}</Button>
            <Button size="sm" variant="ghost" onClick={exitSelect}>{t("common.cancel", "Cancel")}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Movement log (day-grouped entries / exits) ---------------- */
function MovementLog({ pets, admissions }: { pets: Pet[]; admissions: Admission[] }) {
  const { t, i18n } = useTranslation();
  const petOf = (id: string) => pets.find((p) => p.id === id);

  interface MoveEvent { key: string; date: string; dir: "in" | "out"; pet: Pet; kind: Admission["kind"]; }
  const events: MoveEvent[] = [];
  for (const a of admissions) {
    const pet = petOf(a.pet_id);
    if (!pet) continue;
    events.push({ key: `${a.id}:in`, date: a.admitted_on, dir: "in", pet, kind: a.kind });
    if (a.discharged_on) events.push({ key: `${a.id}:out`, date: a.discharged_on, dir: "out", pet, kind: a.kind });
  }
  events.sort((x, y) => y.date.localeCompare(x.date) || (x.dir === y.dir ? 0 : x.dir === "out" ? -1 : 1));

  // Group by day.
  const groups: { day: string; items: MoveEvent[] }[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.day === e.date) last.items.push(e);
    else groups.push({ day: e.date, items: [e] });
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-subtle">{t("records.movementHint")}</p>
      {events.length === 0 ? (
        <div className="card p-8 text-center text-ink-subtle">{t("records.movementEmpty")}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="mb-2 ps-1 text-xs font-bold uppercase tracking-wide text-ink-subtle">{formatDate(g.day, i18n.language)}</p>
              <div className="card divide-y divide-line">
                {g.items.map((e) => {
                  const isIn = e.dir === "in";
                  return (
                    <div key={e.key} className="flex items-center gap-3 p-3">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", isIn ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-muted")}>
                        {isIn ? <LogIn size={16} /> : <LogOut size={16} />}
                      </span>
                      <PetAvatar pet={e.pet} size={36} photoFallback />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.pet.name}</p>
                        <p className="truncate text-xs text-ink-muted">{e.pet.owner_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="chip bg-surface-2 text-[10px] text-ink-muted">{e.kind === "boarding" || e.kind === "treatment_boarding" ? <BedDouble size={10} /> : <Stethoscope size={10} />}</span>
                        <Badge tone={isIn ? "success" : "neutral"}>{isIn ? t("records.entered") : t("records.left")}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
