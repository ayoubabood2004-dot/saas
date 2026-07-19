import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Stethoscope, BedDouble, HeartPulse, ClipboardList, Pill, AlertTriangle,
  CheckCircle2, Clock, Loader2, Search, LayoutGrid, ChevronLeft,
} from "lucide-react";
import type { Admission, ClinicVisit, Pet, TreatmentEntry } from "@/types";
import { repo } from "@/lib/repo";
import { opsStore } from "@/lib/opsStore";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchState, matchesBranch } from "@/lib/branchStore";
import { PetAvatar } from "@/components/PetAvatar";
import { localISO, formatDate, formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ── Bucket configuration ─────────────────────────────────────────────────── */
type BucketKey = "daily" | "careBoarding" | "boarding" | "visit";
const BUCKETS: { key: BucketKey; label: string; icon: typeof Stethoscope; tint: string; ring: string; badge: string }[] = [
  { key: "daily", label: "الطبلات اليومية", icon: Stethoscope, tint: "text-amber-600 dark:text-amber-300", ring: "bg-amber-100 dark:bg-amber-500/15", badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  { key: "careBoarding", label: "طبلات الفندقة العلاجية", icon: HeartPulse, tint: "text-rose-600 dark:text-rose-300", ring: "bg-rose-100 dark:bg-rose-500/15", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" },
  { key: "boarding", label: "طبلات الفندقة", icon: BedDouble, tint: "text-sky-600 dark:text-sky-300", ring: "bg-sky-100 dark:bg-sky-500/15", badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200" },
  { key: "visit", label: "طبلات الزيارة", icon: ClipboardList, tint: "text-brand-600 dark:text-brand-300", ring: "bg-brand-100 dark:bg-brand-500/15", badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" },
];
const SPECIES_AR: Record<string, string> = { dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى" };

/** A single treatment chart — a card the doctor taps to jump into the plan (visit). */
interface Chart {
  id: string;
  bucket: BucketKey;
  petId: string;
  visitId?: string;      // the open visit to jump into (undefined → create on click)
  pet: Pet | undefined;
  title: string;
  cage?: string | null;
  since: string;
  dueToday: number;
  overdue: number;
  doneTotal: number;
  total: number;
}

const dayNumber = (iso: string, todayISO: string) => {
  const start = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const now = new Date(`${todayISO}T00:00:00`).getTime();
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
};

export function Charts() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id ?? undefined;
  const todayISO = localISO();

  const [ops, setOps] = useState(() => opsStore.get());
  const [visits, setVisits] = useState<ClinicVisit[]>([]);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [txLoaded, setTxLoaded] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [filter, setFilter] = useState<BucketKey | "all">("all");
  const [query, setQuery] = useState("");

  const { branches, active: activeBranch } = useBranchState(clinicId);

  // Admissions come from the shared ops cache (clinic-wide, live, usually already warm
  // from Reception). Only pay the full re-hydrate when the cache is cold — otherwise
  // render instantly from cache; local mutations keep it fresh.
  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    if (!opsStore.get().hydrated) void opsStore.hydrate(clinicId).catch(() => {});
    return unsub;
  }, [clinicId]);

  // Open visits (one lightweight query).
  useEffect(() => {
    let cancel = false;
    repo.listOpenClinicVisits(clinicId).then((vs) => { if (!cancel) setVisits(vs); }).catch(() => {});
    return () => { cancel = true; };
  }, [clinicId]);

  // The set of charted pets — stable key so treatments refetch only when it truly changes.
  const petIdKey = useMemo(() => {
    const ids = new Set<string>();
    for (const a of ops.admissions) if (a.status === "active") ids.add(a.pet_id);
    for (const v of visits) ids.add(v.pet_id);
    return [...ids].sort().join(",");
  }, [ops.admissions, visits]);

  // Dose status loads in the BACKGROUND — the cards render instantly without it.
  useEffect(() => {
    if (!petIdKey) { setTreatments([]); setTxLoaded(true); return; }
    let cancel = false;
    repo.listAllTreatments(petIdKey.split(","))
      .then((tx) => { if (!cancel) { setTreatments(tx); setTxLoaded(true); } })
      .catch(() => { if (!cancel) setTxLoaded(true); });
    return () => { cancel = true; };
  }, [petIdKey]);

  const pets = ops.pets;
  const openVisitByPet = useMemo(() => {
    const m = new Map<string, ClinicVisit>();
    for (const v of visits) if (!m.has(v.pet_id)) m.set(v.pet_id, v); // visits are sorted newest-first
    return m;
  }, [visits]);

  const statusFrom = (list: TreatmentEntry[]) => {
    const todayTx = list.filter((t) => t.day === todayISO);
    return {
      dueToday: todayTx.filter((t) => !t.administered_at).length,
      overdue: list.filter((t) => !t.administered_at && t.day < todayISO).length,
      doneTotal: list.filter((t) => t.administered_at).length,
      total: list.length,
    };
  };

  const charts = useMemo<Chart[]>(() => {
    const q = query.trim().toLowerCase();
    const matchQ = (pet: Pet | undefined, title: string) =>
      !q || (pet?.name ?? "").toLowerCase().includes(q) || title.toLowerCase().includes(q);

    const adm = ops.admissions.filter(
      (a) => a.status === "active" && (activeBranch === "all" || branches.length < 2 || matchesBranch(a.branch_id, activeBranch, branches)),
    );
    const admPetIds = new Set(adm.map((a) => a.pet_id));
    const kindBucket: Record<Admission["kind"], BucketKey> = { treatment: "daily", treatment_boarding: "careBoarding", boarding: "boarding" };

    const out: Chart[] = [];
    for (const a of adm) {
      const pet = pets[a.pet_id];
      const title = a.reason?.trim() || "—";
      if (!matchQ(pet, title)) continue;
      const visit = openVisitByPet.get(a.pet_id);
      out.push({ id: `adm_${a.id}`, bucket: kindBucket[a.kind], petId: a.pet_id, visitId: visit?.id, pet, title, cage: a.cage, since: a.admitted_on, ...statusFrom(treatments.filter((t) => t.pet_id === a.pet_id)) });
    }
    // Standalone open visits — only for pets NOT already shown via an admission (no duplicates).
    for (const v of visits) {
      if (admPetIds.has(v.pet_id)) continue;
      const pet = pets[v.pet_id];
      const title = v.reason?.trim() || "زيارة";
      if (!matchQ(pet, title)) continue;
      out.push({ id: `vis_${v.id}`, bucket: "visit", petId: v.pet_id, visitId: v.id, pet, title, since: v.opened_at, ...statusFrom(treatments.filter((t) => t.visit_id === v.id)) });
    }
    return out.sort((a, b) => (b.overdue - a.overdue) || (b.dueToday - a.dueToday) || b.since.localeCompare(a.since));
  }, [ops.admissions, visits, treatments, pets, openVisitByPet, activeBranch, branches, query, todayISO]);

  const counts = useMemo(() => {
    const c: Record<BucketKey, number> = { daily: 0, careBoarding: 0, boarding: 0, visit: 0 };
    for (const ch of charts) c[ch.bucket]++;
    return c;
  }, [charts]);
  const dueNow = charts.filter((c) => c.dueToday > 0 || c.overdue > 0).length;
  const shownBuckets = BUCKETS.filter((b) => filter === "all" || filter === b.key);

  /** Open the treatment plan (VISIT). Reuse the pet's open visit, or create one on the spot. */
  const openChart = async (c: Chart) => {
    playTap();
    if (c.visitId) { navigate(`/pet/${c.petId}/visit/${c.visitId}`); return; }
    if (opening) return;
    setOpening(c.id);
    try {
      const existing = openVisitByPet.get(c.petId);
      if (existing) { navigate(`/pet/${c.petId}/visit/${existing.id}`); return; }
      const v = await repo.addClinicVisit({
        pet_id: c.petId, kind: "illness", status: "open",
        condition: "under_treatment", reason: c.title !== "—" ? c.title : null,
        opened_at: new Date().toISOString(), opened_by: user?.full_name ?? null,
      });
      navigate(`/pet/${c.petId}/visit/${v.id}`);
    } finally { setOpening(null); }
  };

  const booting = !ops.hydrated && charts.length === 0 && visits.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:max-w-6xl xl:max-w-7xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-card"><LayoutGrid size={22} /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-ink">الطبلات</h1>
          <p className="text-xs font-semibold text-ink-subtle">خطط العلاج للحيوانات الموجودة اليوم في العيادة — مرتّبة في مكان واحد.</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-center">
            <span className="block text-lg font-black leading-none text-ink">{formatNum(charts.length)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">طبلة نشطة</span>
          </span>
          <span className={cn("rounded-lg border px-3 py-2 text-center", dueNow > 0 ? "border-warn-300 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/10" : "border-line bg-surface-1")}>
            <span className={cn("block text-lg font-black leading-none", dueNow > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink")}>{formatNum(dueNow)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">تحتاج متابعة</span>
          </span>
        </div>
      </div>

      {/* Filter + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} label="الكل" count={charts.length} onClick={() => { playTap(); setFilter("all"); }} />
          {BUCKETS.map((b) => (
            <FilterChip key={b.key} active={filter === b.key} label={b.label} count={counts[b.key]} icon={<b.icon size={13} />} onClick={() => { playTap(); setFilter(b.key); }} />
          ))}
        </div>
        <div className="relative ms-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute inset-y-0 my-auto ms-3 text-ink-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الحيوان أو التشخيص…" className="input h-10 w-full ps-9" />
        </div>
      </div>

      {/* Body */}
      {booting ? (
        <div className="py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> جارٍ التحميل…</div>
      ) : charts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <LayoutGrid size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">لا توجد طبلات نشطة حالياً</p>
          <p className="mt-1 text-xs text-ink-subtle">تظهر هنا خطط علاج الحيوانات الموجودة في العيادة والزيارات المفتوحة.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {shownBuckets.map((b) => {
            const items = charts.filter((c) => c.bucket === b.key);
            if (items.length === 0) return null;
            return (
              <section key={b.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn("grid h-7 w-7 place-items-center rounded-lg", b.ring, b.tint)}><b.icon size={16} /></span>
                  <h2 className="text-sm font-extrabold text-ink">{b.label}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-2xs font-black", b.badge)}>{formatNum(items.length)}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {items.map((c) => <ChartCard key={c.id} chart={c} lang={lang} todayISO={todayISO} txLoaded={txLoaded} busy={opening === c.id} onOpen={() => void openChart(c)} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Filter chip ──────────────────────────────────────────────────────────── */
function FilterChip({ active, label, count, icon, onClick }: { active: boolean; label: string; count: number; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition",
        active ? "border-brand-500 bg-brand-600 text-white shadow-sm" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
      {icon} {label}
      <span className={cn("rounded-full px-1.5 text-[10px] font-black tabular-nums", active ? "bg-white/25" : "bg-surface-2 text-ink-subtle")}>{formatNum(count)}</span>
    </button>
  );
}

/* ── Chart card ───────────────────────────────────────────────────────────── */
function ChartCard({ chart: c, lang, todayISO, txLoaded, busy, onOpen }: { chart: Chart; lang: string; todayISO: string; txLoaded: boolean; busy: boolean; onOpen: () => void }) {
  const day = dayNumber(c.since, todayISO);
  const status = !txLoaded
    ? null
    : c.overdue > 0 ? { cls: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300", icon: <AlertTriangle size={13} />, text: `${formatNum(c.overdue)} متأخّرة` }
    : c.dueToday > 0 ? { cls: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300", icon: <Pill size={13} />, text: `${formatNum(c.dueToday)} مستحقّة اليوم` }
    : c.total > 0 && c.doneTotal === c.total ? { cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", icon: <CheckCircle2 size={13} />, text: "مكتمل" }
    : c.total > 0 ? { cls: "bg-surface-2 text-ink-muted", icon: <CheckCircle2 size={13} />, text: "لا جرعات اليوم" }
    : { cls: "bg-surface-2 text-ink-subtle", icon: <ClipboardList size={13} />, text: "لا توجد خطة بعد" };

  return (
    <button type="button" onClick={onOpen} disabled={busy}
      className="group flex flex-col gap-2.5 rounded-xl border border-line-strong bg-surface-1 p-3.5 text-start shadow-card transition hover:border-brand-300 hover:shadow-lg disabled:opacity-60">
      <div className="flex items-center gap-2.5">
        <PetAvatar pet={c.pet ?? { species: "other", photo_url: null, name: "?" }} size={44} className="!rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-ink">{c.pet?.name ?? "—"}</div>
          <div className="truncate text-2xs font-bold text-ink-subtle">
            {c.pet ? (SPECIES_AR[c.pet.species] ?? c.pet.species) : ""}{c.cage ? ` · قفص ${c.cage}` : ""}
          </div>
        </div>
        {busy ? <Loader2 size={16} className="shrink-0 animate-spin text-brand-600" /> : <ChevronLeft size={16} className="shrink-0 text-ink-subtle transition group-hover:text-brand-600 rtl:rotate-180" />}
      </div>

      <div className="line-clamp-2 min-h-[2.4em] rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-semibold leading-snug text-ink-muted">
        {c.title}
      </div>

      <div className="flex items-center justify-between gap-2">
        {status
          ? <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-black", status.cls)}>{status.icon} {status.text}</span>
          : <span className="h-[26px] w-24 animate-pulse rounded-md bg-surface-2" />}
        <span className="inline-flex items-center gap-1 text-2xs font-bold text-ink-subtle"><Clock size={11} /> اليوم {formatNum(day)} · {formatDate(c.since, lang)}</span>
      </div>
    </button>
  );
}
