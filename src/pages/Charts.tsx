import { useCallback, useEffect, useMemo, useState } from "react";
import { sendWhatsApp, quotaMessage } from "@/lib/quotas";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Stethoscope, BedDouble, HeartPulse, ClipboardList, Pill, AlertTriangle,
  CheckCircle2, Clock, Loader2, Search, LayoutGrid, ChevronLeft, Slice,
  Archive, DoorOpen, BarChart3, RotateCcw, MessageCircle, FileText, HeartCrack, Pencil, Check,
} from "lucide-react";
import type { Admission, ClinicVisit, MedicalVisit, Pet, PatientCondition, TreatmentEntry , Surgery } from "@/types";
import { repo } from "@/lib/repo";
import { getCached, setCached } from "@/lib/swrCache";
import { PetAvatar } from "@/components/PetAvatar";
import { opsStore } from "@/lib/opsStore";
import { TreatmentBoard } from "@/components/TreatmentBoard";
import { taskStatus } from "@/lib/treatmentSchedule";
import { syncDoseCycleForPet } from "@/lib/doseCycle";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { waNumber } from "@/lib/phone";
import { getDialCode, getClinicName } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchState, matchesBranch } from "@/lib/branchStore";
import { localISO, formatDate, formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";
import { Modal } from "@/components/Modal";

/* ── Bucket configuration ─────────────────────────────────────────────────── */
type BucketKey = "daily" | "careBoarding" | "boarding" | "visit";
const BUCKETS: { key: BucketKey; label: string; icon: typeof Stethoscope; tint: string; ring: string; badge: string }[] = [
  { key: "daily", label: "الطبلات اليومية", icon: Stethoscope, tint: "text-amber-600 dark:text-amber-300", ring: "bg-amber-100 dark:bg-amber-500/15", badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  { key: "careBoarding", label: "طبلات الفندقة العلاجية", icon: HeartPulse, tint: "text-rose-600 dark:text-rose-300", ring: "bg-rose-100 dark:bg-rose-500/15", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" },
  { key: "boarding", label: "طبلات الفندقة", icon: BedDouble, tint: "text-sky-600 dark:text-sky-300", ring: "bg-sky-100 dark:bg-sky-500/15", badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200" },
  { key: "visit", label: "طبلات الزيارة", icon: ClipboardList, tint: "text-brand-600 dark:text-brand-300", ring: "bg-brand-100 dark:bg-brand-500/15", badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" },
];

/* ── السجلات: هيكلة الصفحة العليا ──────────────────────────────────────────
 * سجلا العلاج (اليومية + الفندقة العلاجية) هما اللذان يحملان جرعات — فكل
 * واحد سجل مستقل بواجهته. الفندقة العادية والزيارات (بلا علاجات) بسجل جانبي.
 * وبعد ما يخلص العلاج، الطبلة تغادر السجلات النشطة: إما «سكشن الحالات»
 * (انتهت بنتيجة) أو «المنقطعون» (صاحبها ما رجع يكمل). و«التقارير» تحكي
 * وضع كل هذا بالأرقام وبالجُمل. */
type RegistryKey = "daily" | "careBoarding" | "other" | "cases" | "deceased" | "lost" | "reports";
const REGISTRIES: { key: RegistryKey; label: string; icon: typeof Stethoscope }[] = [
  { key: "daily", label: "سجل الطبلات اليومية", icon: Stethoscope },
  { key: "careBoarding", label: "سجل الفندقة العلاجية", icon: HeartPulse },
  { key: "other", label: "الفندقة والزيارات", icon: BedDouble },
  { key: "cases", label: "سكشن الحالات", icon: Archive },
  { key: "deceased", label: "سجل المتوفين", icon: HeartCrack },
  { key: "lost", label: "المنقطعون", icon: DoorOpen },
  { key: "reports", label: "التقارير", icon: BarChart3 },
];
/** أي دلاء تعرضها كل سجلة نشطة. */
const REG_BUCKETS: Record<"daily" | "careBoarding" | "other", BucketKey[]> = {
  daily: ["daily"],
  careBoarding: ["careBoarding"],
  other: ["boarding", "visit"],
};
/* ── Triage acuity ─────────────────────────────────────────────────────────
 * One colour language for "how urgent is this patient", so the board can be
 * read from the doorway. Clinical condition outranks schedule: a critical
 * patient stays red even when every dose is on time, because the doses being
 * on time is not the thing you need to know about it. */
type Acuity = "critical" | "overdue" | "due" | "stable" | "settled";
const ACUITY: Record<Acuity, { label: string; stripe: string; card: string; dot: string }> = {
  critical: { label: "حرجة", stripe: "bg-danger-500", card: "border-danger-300 dark:border-danger-500/40", dot: "bg-danger-500" },
  overdue:  { label: "متأخّرة", stripe: "bg-danger-500", card: "border-danger-300 dark:border-danger-500/40", dot: "bg-danger-500" },
  due:      { label: "مستحقّة", stripe: "bg-warn-500", card: "border-warn-300 dark:border-warn-500/40", dot: "bg-warn-500" },
  stable:   { label: "مستقرّة", stripe: "bg-sky-400", card: "border-line-strong", dot: "bg-sky-400" },
  settled:  { label: "اليوم مكتمل", stripe: "bg-teal-400", card: "border-teal-300 dark:border-teal-500/40", dot: "bg-teal-400" },
};
const ACUITY_RANK: Record<Acuity, number> = { critical: 0, overdue: 1, due: 2, stable: 3, settled: 4 };

function acuityOf(c: Chart, txLoaded: boolean): Acuity {
  if (c.condition === "critical") return "critical";
  if (!txLoaded) return "stable";
  if (c.overdue > 0) return "overdue";
  if (c.dueToday > 0) return "due";
  if (c.todayTotal > 0) return "settled";
  return "stable";
}

const SPECIES_AR: Record<string, string> = { dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى" };
// Default avatar: the species emoji (️ = VS16 forces a colour cat) on a soft tint —
// self-contained, so it paints instantly with zero network requests.
const SPECIES_EMOJI: Record<string, string> = { dog: "🐶", cat: "🐱️", horse: "🐴", cow: "🐄", bird: "🦜", rabbit: "🐰", other: "🐾" };
const SPECIES_GRAD: Record<string, string> = {
  dog: "from-amber-100 to-orange-100 dark:from-amber-500/15 dark:to-orange-500/10",
  cat: "from-violet-100 to-fuchsia-100 dark:from-violet-500/15 dark:to-fuchsia-500/10",
  horse: "from-emerald-100 to-teal-100 dark:from-emerald-500/15 dark:to-teal-500/10",
  cow: "from-sky-100 to-cyan-100 dark:from-sky-500/15 dark:to-cyan-500/10",
  bird: "from-lime-100 to-green-100 dark:from-lime-500/15 dark:to-green-500/10",
  rabbit: "from-pink-100 to-rose-100 dark:from-pink-500/15 dark:to-rose-500/10",
  other: "from-slate-100 to-brand-100 dark:from-slate-500/15 dark:to-brand-500/10",
};

/** صورة الحيوان — نفس مكوّن الصور الموحد بكل السستم (صورة مرفوعة ← صورة نوع حقيقية). */
function CardAvatar({ pet }: { pet: Pet | undefined }) {
  if (!pet) {
    return (
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-2xl leading-none", SPECIES_GRAD.other)}>
        {SPECIES_EMOJI.other}
      </span>
    );
  }
  return <PetAvatar pet={pet} size={44} className="shrink-0 rounded-xl" />;
}

/** A single treatment chart — a card the doctor taps to jump into the plan (visit). */
interface Chart {
  id: string;
  bucket: BucketKey;
  petId: string;
  visitId?: string;      // the open visit to jump into (undefined → create on click)
  /** الإدخال (admission) وراء هالطبلة — تعليم «منقطع» لازم يخرّجه هو أيضاً. */
  admissionId?: string;
  pet: Pet | undefined;
  title: string;
  cage?: string | null;
  since: string;
  /** Triage condition recorded on the open visit — drives the acuity colour. */
  condition?: PatientCondition | null;
  dueToday: number;
  /** Doses scheduled for today (given or not) — todayTotal>0 && dueToday===0 → اليوم مكتمل. */
  todayTotal: number;
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
  // Minute tick — re-renders so the "اليوم مكتمل" aqua tint clears by itself the
  // moment the next dose comes due (e.g. the day rolls over to tomorrow's doses).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  // Synchronous seed of the open visits — seeding only inside the effect paints
  // one empty frame first (effects run after paint), a visible flash on revisit.
  const [visits, setVisits] = useState<ClinicVisit[]>(() => getCached<ClinicVisit[]>(`openvisits_${clinicId ?? ""}`) ?? []);
  const [treatments, setTreatments] = useState<TreatmentEntry[]>([]);
  const [txLoaded, setTxLoaded] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  /** السجل المفتوح — اليومية هي الافتراضية لأنها شغل الصبح الأول. */
  const [reg, setReg] = useState<RegistryKey>("daily");
  const [query, setQuery] = useState("");
  /** "cards" = a card per patient · "board" = a task per dose, by the hour. */
  const [view, setView] = useState<"cards" | "board">("cards");
  const [wall, setWall] = useState(false);

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
    const c = getCached<ClinicVisit[]>(`openvisits_${clinicId ?? ""}`);
    if (c) setVisits(c); // فوري من الكاش — التحديث يلحقه بالخفاء
    repo.listOpenClinicVisits(clinicId).then((vs) => { setCached(`openvisits_${clinicId ?? ""}`, vs); if (!cancel) setVisits(vs); }).catch(() => {});
    return () => { cancel = true; };
  }, [clinicId]);

  // The triage condition (ممتازة/جيدة/حرجة) is recorded on the MEDICAL visit —
  // ClinicVisit.condition is the case OUTCOME (تحت العلاج/تعافى/مزمنة), a
  // different axis. One clinic-wide query gives us the latest per patient.
  const [medVisits, setMedVisits] = useState<MedicalVisit[]>([]);
  useEffect(() => {
    let cancel = false;
    repo.listClinicVisits(clinicId)
      .then((vs) => { if (!cancel) setMedVisits(vs); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [clinicId]);

  const conditionByPet = useMemo(() => {
    const m = new Map<string, PatientCondition>();
    // listClinicVisits returns newest-first, so the first hit per pet is the latest.
    for (const v of medVisits) {
      if (!v.condition || m.has(v.pet_id)) continue;
      m.set(v.pet_id, v.condition);
    }
    return m;
  }, [medVisits]);

  // Warm the visit-page code chunk up front so tapping a card never waits on JS.
  useEffect(() => { void import("@/pages/VisitPage"); }, []);

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
      todayTotal: todayTx.length,
      // Hour-aware: a dose scheduled for 08:00 and still not given at 11:00 counts
      // as overdue TODAY — it no longer has to wait for the date to roll over.
      overdue: list.filter((t) => taskStatus(t, todayISO) === "overdue").length,
      doneTotal: list.filter((t) => t.administered_at).length,
      total: list.length,
    };
  };

  /** One-tap give from the board — optimistic, so a busy round never waits on the network. */
  const giveDose = useCallback(async (t: TreatmentEntry) => {
    const at = new Date().toISOString();
    const by = user?.full_name ?? undefined;
    setTreatments((prev) => prev.map((x) => (x.id === t.id ? { ...x, administered_at: at, administered_by: by } : x)));
    try {
      await repo.setTreatmentGiven(t.id, true, by, at);
      await syncDoseCycleForPet(t.pet_id);
    } catch {
      // Put it back on the board — a dose that didn't save must not look given.
      setTreatments((prev) => prev.map((x) => (x.id === t.id ? { ...x, administered_at: null, administered_by: undefined } : x)));
    }
  }, [user]);

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
      out.push({ id: `adm_${a.id}`, bucket: kindBucket[a.kind], petId: a.pet_id, visitId: visit?.id, admissionId: a.id, pet, title, cage: a.cage, since: a.admitted_on, condition: conditionByPet.get(a.pet_id) ?? null, ...statusFrom(treatments.filter((t) => t.pet_id === a.pet_id)) });
    }
    // Standalone open visits — only for pets NOT already shown via an admission (no duplicates).
    for (const v of visits) {
      if (admPetIds.has(v.pet_id)) continue;
      const pet = pets[v.pet_id];
      const title = v.reason?.trim() || "زيارة";
      if (!matchQ(pet, title)) continue;
      out.push({ id: `vis_${v.id}`, bucket: "visit", petId: v.pet_id, visitId: v.id, pet, title, since: v.opened_at, condition: conditionByPet.get(v.pet_id) ?? null, ...statusFrom(treatments.filter((t) => t.visit_id === v.id)) });
    }
    // Acuity leads the sort: the critical patient is the first thing you see.
    return out.sort((a, b) =>
      (ACUITY_RANK[acuityOf(a, txLoaded)] - ACUITY_RANK[acuityOf(b, txLoaded)]) ||
      (b.overdue - a.overdue) || (b.dueToday - a.dueToday) || b.since.localeCompare(a.since));
    // `tick` is a dependency on purpose: overdue is now clock-based, so the counts
    // must be recomputed every minute, not only when the data changes.
  }, [ops.admissions, visits, treatments, pets, openVisitByPet, conditionByPet, activeBranch, branches, query, todayISO, tick, txLoaded]);

  const dueNow = charts.filter((c) => c.dueToday > 0 || c.overdue > 0).length;

  /* ── الحالات المنتهية: سكشن الحالات + المنقطعون + التقارير ─────────────── */
  const [ended, setEnded] = useState<ClinicVisit[]>([]);
  const loadEnded = useCallback(() => {
    repo.listEndedClinicVisits(clinicId).then(setEnded).catch(() => {});
  }, [clinicId]);
  useEffect(() => { loadEnded(); }, [loadEnded]);

  /** انتهت بنتيجة حقيقية (شُفي/مزمنة/مُحال) → سكشن الحالات. المتوفون إلهم سجلهم. */
  const casesList = useMemo(() => ended.filter((v) => v.outcome && v.outcome !== "lost_followup" && v.outcome !== "under_treatment" && v.outcome !== "deceased"), [ended]);
  /** توفّى — سجل مستقل بكرامته، مع سبب الوفاة. */
  const deceasedList = useMemo(() => ended.filter((v) => v.outcome === "deceased"), [ended]);
  /** عُلّمت «انقطع عن المراجعة» → سكشن المنقطعين. */
  const lostList = useMemo(() => ended.filter((v) => v.outcome === "lost_followup"), [ended]);

  // جرعات الحالات المنتهية — تنجلب عند فتح السكاشن حتى نوصف الالتزام بدقة.
  const [endedTx, setEndedTx] = useState<TreatmentEntry[]>([]);
  const endedPetKey = useMemo(() => [...new Set(ended.map((v) => v.pet_id))].sort().join(","), [ended]);
  useEffect(() => {
    if (!endedPetKey || (reg !== "cases" && reg !== "lost" && reg !== "reports" && reg !== "deceased")) return;
    let cancel = false;
    repo.listAllTreatments(endedPetKey.split(",")).then((tx) => { if (!cancel) setEndedTx(tx); }).catch(() => {});
    return () => { cancel = true; };
  }, [endedPetKey, reg]);
  const txForVisit = useCallback((visitId: string) => endedTx.filter((t) => t.visit_id === visitId), [endedTx]);

  /* ── كشف المنقطعين تلقائياً ─────────────────────────────────────────────
   * طبلة نشطة عليها جرعات باقية، وكلها صارت متأخرة، وما انعطت ولا جرعة من
   * ٤٨ ساعة (أو ما انعطت أصلاً وبدأت خطتها من يومين+) → «تبين منقطعة».
   * الكشف اقتراح — القرار النهائي ضغطة الدكتور، مو خوارزمية. */
  const stalled = useMemo(() => {
    if (!txLoaded) return [] as { chart: Chart; lastGiven: string | null; remaining: number; sinceDays: number }[];
    const out: { chart: Chart; lastGiven: string | null; remaining: number; sinceDays: number }[] = [];
    const cutoff = Date.now() - 48 * 3600 * 1000;
    for (const c of charts) {
      if (c.bucket === "boarding") continue; // فندقة بلا علاج — الانقطاع لا يعنيها
      const tx = treatments.filter((t) => t.pet_id === c.petId);
      if (!tx.length) continue;
      const remaining = tx.filter((t) => !t.administered_at);
      if (!remaining.length || !remaining.some((t) => taskStatus(t, todayISO) === "overdue")) continue;
      const given = tx.filter((t) => t.administered_at).map((t) => t.administered_at!).sort();
      const lastGiven = given[given.length - 1] ?? null;
      const firstDay = tx.map((t) => t.day).sort()[0];
      const anchor = lastGiven ? new Date(lastGiven).getTime() : new Date(`${firstDay}T12:00:00`).getTime();
      if (anchor >= cutoff) continue;
      out.push({ chart: c, lastGiven, remaining: remaining.length, sinceDays: Math.max(1, Math.floor((Date.now() - anchor) / 86400000)) });
    }
    return out.sort((a, b) => b.sinceDays - a.sinceDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts, treatments, txLoaded, todayISO, tick]);

  /** علّم الطبلة منقطعة: تسكّر الزيارة بنتيجة «انقطع عن المراجعة» وتخرّج الإدخال. */
  const [lostBusy, setLostBusy] = useState<string | null>(null);
  const markLost = async (c: Chart, remaining: number) => {
    if (!window.confirm(`تعلّم طبلة ${c.pet?.name ?? "الحيوان"} «منقطعة عن المراجعة»؟\nتنتقل لسكشن المنقطعين وتگدر ترجّعها إذا رجع صاحبها.`)) return;
    playTap();
    setLostBusy(c.id);
    const now = new Date().toISOString();
    const summary = `عُلّمت منقطعة عن المراجعة من سجل الطبلات — بقيت ${remaining} جرعة ما انعطت.`;
    try {
      if (c.visitId) {
        await repo.updateClinicVisit(c.visitId, { status: "ended", ended_at: now, ended_by: user?.full_name ?? null, outcome: "lost_followup", summary });
      } else {
        const v = await repo.addClinicVisit({ pet_id: c.petId, kind: "illness", status: "open", condition: "under_treatment", reason: c.title !== "—" ? c.title : null, opened_at: c.since, opened_by: user?.full_name ?? null });
        await repo.updateClinicVisit(v.id, { status: "ended", ended_at: now, ended_by: user?.full_name ?? null, outcome: "lost_followup", summary });
      }
      if (c.admissionId) await repo.updateAdmission(c.admissionId, { status: "discharged", discharged_on: todayISO });
      playSuccess();
      // حدّث المصادر الثلاثة حتى تختفي من النشطة وتظهر عند المنقطعين فوراً.
      loadEnded();
      repo.listOpenClinicVisits(clinicId).then((vs) => { setCached(`openvisits_${clinicId ?? ""}`, vs); setVisits(vs); }).catch(() => {});
      void opsStore.hydrate(clinicId).catch(() => {});
    } finally { setLostBusy(null); }
  };

  /** صاحبها رجع؟ رجّع الحالة نشطة بضغطة. */
  const restoreLost = async (v: ClinicVisit) => {
    playTap();
    setLostBusy(v.id);
    try {
      await repo.updateClinicVisit(v.id, { status: "open", ended_at: null, ended_by: null, outcome: null, summary: null });
      playSuccess();
      loadEnded();
      repo.listOpenClinicVisits(clinicId).then((vs) => { setCached(`openvisits_${clinicId ?? ""}`, vs); setVisits(vs); }).catch(() => {});
    } finally { setLostBusy(null); }
  };

  /** رسالة واتساب لصاحب حيوان منقطع — تذكير لطيف يرجّعه. */
  const nudgeOwner = async (pet: Pet | undefined, remaining: number) => {
    if (!pet?.owner_phone) return;
    playTap();
    const msg = `مرحباً ${pet.owner_name ?? ""} 👋\nنحب نطمئن على ${pet.name} — باقي ${remaining > 0 ? `${remaining} جرعة من خطة علاجه` : "متابعة علاجه"} عند ${getClinicName() || "العيادة"}. إكمال العلاج مهم لشفائه الكامل 🐾\nننتظركم، وإذا في أي ظرف خبرونا نرتبلكم موعد ثاني.`;
    try {
      await sendWhatsApp({ phone: waNumber(pet.owner_phone, getDialCode()), text: msg, petId: pet.id, ownerName: pet.owner_name ?? null, ownerPhone: pet.owner_phone, kind: "followup" });
    } catch (e) { const m = quotaMessage(e); if (m) window.alert(m); }
  };

  const regCounts: Record<RegistryKey, number> = useMemo(() => ({
    daily: charts.filter((c) => c.bucket === "daily").length,
    careBoarding: charts.filter((c) => c.bucket === "careBoarding").length,
    other: charts.filter((c) => c.bucket === "boarding" || c.bucket === "visit").length,
    cases: casesList.length,
    deceased: deceasedList.length,
    lost: lostList.length + stalled.length,
    reports: 0,
  }), [charts, casesList, deceasedList, lostList, stalled]);

  /** الدلاء المعروضة بالسجل النشط الحالي. */
  const activeBuckets = reg === "daily" || reg === "careBoarding" || reg === "other" ? REG_BUCKETS[reg] : [];
  const shownBuckets = BUCKETS.filter((b) => activeBuckets.includes(b.key));
  const activeCharts = useMemo(() => charts.filter((c) => activeBuckets.includes(c.bucket)), [charts, activeBuckets]);

  // The board shows doses for exactly the patients the current registry/search is
  // showing — so opening «سجل الفندقة العلاجية» narrows the dose list with it.
  const boardTreatments = useMemo(() => {
    const shown = new Set(activeCharts.map((c) => c.petId));
    return treatments.filter((t) => shown.has(t.pet_id));
  }, [activeCharts, treatments]);

  // Hand the visit page the data we already have so it paints instantly (no spinner).
  const go = (petId: string, visit: ClinicVisit) =>
    navigate(`/pet/${petId}/visit/${visit.id}`, { state: { pet: pets[petId], visit, treatments: treatments.filter((t) => t.visit_id === visit.id), from: "charts" } });

  /** Open the treatment plan (VISIT). Reuse the pet's open visit, or create one on the spot. */
  const openChart = async (c: Chart) => {
    playTap();
    const known = c.visitId ? visits.find((v) => v.id === c.visitId) : openVisitByPet.get(c.petId);
    if (known) { go(c.petId, known); return; }
    if (opening) return;
    setOpening(c.id);
    try {
      const v = await repo.addClinicVisit({
        pet_id: c.petId, kind: "illness", status: "open",
        condition: "under_treatment", reason: c.title !== "—" ? c.title : null,
        opened_at: new Date().toISOString(), opened_by: user?.full_name ?? null,
      });
      go(c.petId, v);
    } finally { setOpening(null); }
  };

  // عمليات هذا الشهر — الجرّاح يشوف مباشرة كم عملية أجرى (0073).
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [surgOpen, setSurgOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    repo.listAllSurgeries().then((r) => { if (alive) setSurgeries(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const monthKey = todayISO.slice(0, 7);
  const monthSurgeries = useMemo(() => surgeries.filter((x) => x.performed_at.slice(0, 7) === monthKey), [surgeries, monthKey]);

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
          <button onClick={() => { playTap(); setSurgOpen(true); }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10">
            <span className="block text-lg font-black leading-none text-rose-700 dark:text-rose-300">{formatNum(monthSurgeries.length)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">🔪 عمليات هذا الشهر</span>
          </button>
        </div>
      </div>

      {/* السجلات — دورة حياة الطبلة كاملة بستة أبواب */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {REGISTRIES.map((r) => (
          <FilterChip key={r.key} active={reg === r.key} label={r.label}
            count={r.key === "reports" ? undefined : regCounts[r.key]}
            alert={r.key === "lost" && regCounts.lost > 0}
            icon={<r.icon size={13} />} onClick={() => { playTap(); setReg(r.key); }} />
        ))}
      </div>

      {/* أدوات السجلات النشطة فقط: بحث + بطاقات/جرعات بالساعة */}
      {activeBuckets.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute inset-y-0 my-auto ms-3 text-ink-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الحيوان أو التشخيص…" className="input h-10 w-full ps-9" />
          </div>
          <div className="ms-auto inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5">
            <button type="button" onClick={() => { playTap(); setView("cards"); }}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", view === "cards" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <LayoutGrid size={13} /> بطاقات
            </button>
            <button type="button" onClick={() => { playTap(); setView("board"); }}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", view === "board" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <Clock size={13} /> الجرعات بالساعة
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {reg === "cases" ? (
        <CasesSection cases={casesList} pets={pets} lang={lang} txForVisit={txForVisit}
          onOpen={(v) => { playTap(); navigate(`/pet/${v.pet_id}/visit/${v.id}`); }} />
      ) : reg === "deceased" ? (
        <DeceasedSection deceased={deceasedList} pets={pets} lang={lang}
          onOpen={(v) => { playTap(); navigate(`/pet/${v.pet_id}/visit/${v.id}`); }}
          onSaveCause={async (v, cause) => {
            await repo.updateClinicVisit(v.id, { summary: cause.trim() || null });
            playSuccess();
            loadEnded();
          }} />
      ) : reg === "lost" ? (
        <LostSection stalled={stalled} lost={lostList} pets={pets} lang={lang} busyId={lostBusy}
          txForVisit={txForVisit}
          onMarkLost={(c, n) => void markLost(c, n)}
          onRestore={(v) => void restoreLost(v)}
          onNudge={nudgeOwner}
          onOpenChart={(c) => void openChart(c)}
          onOpenVisit={(v) => { playTap(); navigate(`/pet/${v.pet_id}/visit/${v.id}`); }} />
      ) : reg === "reports" ? (
        <ReportsSection charts={charts} treatments={treatments} txLoaded={txLoaded}
          cases={casesList} deceased={deceasedList} lost={lostList} stalled={stalled} pets={pets} todayISO={todayISO} lang={lang} txForVisit={txForVisit} />
      ) : booting ? (
        <div className="py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> جارٍ التحميل…</div>
      ) : activeCharts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <LayoutGrid size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">
            {reg === "daily" ? "ماكو طبلات يومية نشطة" : reg === "careBoarding" ? "ماكو فندقة علاجية نشطة" : "ماكو فندقة أو زيارات مفتوحة"}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">الطبلة تنفتح تلقائياً لما تدخّل حالة علاج — والمنتهية تلگيها بـ«سكشن الحالات».</p>
        </div>
      ) : view === "cards" ? (
        <>
          {/* Colour key — a colour language nobody explained is just decoration */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2">
            <span className="text-2xs font-extrabold text-ink-muted">الفرز:</span>
            {(Object.keys(ACUITY) as Acuity[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
                <span className={cn("h-2.5 w-2.5 rounded-full", ACUITY[k].dot)} aria-hidden />
                {ACUITY[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-danger-600 dark:text-danger-300">
              <span className="h-2.5 w-2.5 animate-pulse-ring rounded-full bg-danger-500" aria-hidden />
              يومض = جرعة متأخّرة
            </span>
          </div>

          <div className="space-y-6">
            {shownBuckets.map((b) => {
              const items = activeCharts.filter((c) => c.bucket === b.key);
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
        </>
      ) : (
        <TreatmentBoard
          treatments={boardTreatments}
          pets={pets}
          todayISO={todayISO}
          onGive={(t) => void giveDose(t)}
          wall={wall}
          onToggleWall={() => { playTap(); setWall((w) => !w); }}
        />
      )}

      {/* سجل عمليات هذا الشهر */}
      <Modal open={surgOpen} onClose={() => setSurgOpen(false)} title={`العمليات الجراحية — هذا الشهر (${formatNum(monthSurgeries.length)})`}>
        {monthSurgeries.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-ink-muted">لا عمليات مسجلة هذا الشهر — تُسجل من داخل سجل الحالة بزر «تسجيل عملية».</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {monthSurgeries.map((x) => (
              <button key={x.id} onClick={() => { playTap(); navigate(`/pet/${x.pet_id}`); }} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-3 text-start transition hover:border-rose-300">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><Slice size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-ink">{x.name}</span>
                  <span className="block text-2xs font-bold text-ink-subtle">{pets[x.pet_id]?.name ?? "—"} · {formatDate(x.performed_at, lang)}{x.surgeon ? ` · ${x.surgeon}` : ""}</span>
                </span>
                {x.outcome === "success" && <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-black text-success-700 dark:bg-success-500/15 dark:text-success-300">ناجحة</span>}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Filter chip ──────────────────────────────────────────────────────────── */
function FilterChip({ active, label, count, alert, icon, onClick }: { active: boolean; label: string; count?: number; alert?: boolean; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition",
        active ? "border-brand-500 bg-brand-600 text-white shadow-sm" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
      {icon} {label}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 text-[10px] font-black tabular-nums",
          active ? "bg-white/25" : alert ? "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-300" : "bg-surface-2 text-ink-subtle")}>{formatNum(count)}</span>
      )}
    </button>
  );
}

/* ── Chart card ───────────────────────────────────────────────────────────── */
function ChartCard({ chart: c, lang, todayISO, txLoaded, busy, onOpen }: { chart: Chart; lang: string; todayISO: string; txLoaded: boolean; busy: boolean; onOpen: () => void }) {
  const day = dayNumber(c.since, todayISO);
  const acuity = acuityOf(c, txLoaded);
  const meta = ACUITY[acuity];
  // Only a genuinely late dose pulses. If "critical" pulsed too, half the board
  // would move and the motion would stop meaning "act now".
  const blink = txLoaded && c.overdue > 0;
  // اليوم مكتمل: every dose scheduled for today was given (and nothing overdue).
  // The card takes a soft watery-green tint until the next dose comes due —
  // tomorrow's doses (or a new dose added today) clear it automatically.
  const doneToday = txLoaded && c.todayTotal > 0 && c.dueToday === 0 && c.overdue === 0;
  const status = !txLoaded
    ? null
    : c.overdue > 0 ? { cls: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300", icon: <AlertTriangle size={13} />, text: `${formatNum(c.overdue)} متأخّرة` }
    : c.dueToday > 0 ? { cls: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300", icon: <Pill size={13} />, text: `${formatNum(c.dueToday)} مستحقّة اليوم` }
    : doneToday ? { cls: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300", icon: <CheckCircle2 size={13} />, text: "تم علاج اليوم" }
    : c.total > 0 && c.doneTotal === c.total ? { cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", icon: <CheckCircle2 size={13} />, text: "مكتمل" }
    : c.total > 0 ? { cls: "bg-surface-2 text-ink-muted", icon: <CheckCircle2 size={13} />, text: "لا جرعات اليوم" }
    : { cls: "bg-surface-2 text-ink-subtle", icon: <ClipboardList size={13} />, text: "لا توجد خطة بعد" };

  return (
    <button type="button" onClick={onOpen} disabled={busy}
      className={cn(
        "group relative flex flex-col gap-2.5 overflow-hidden rounded-xl border p-3.5 ps-4 text-start shadow-card transition hover:shadow-lg disabled:opacity-60",
        meta.card,
        doneToday
          ? "bg-teal-50/60 ring-1 ring-teal-300/60 hover:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-500/30"
          : "bg-surface-1 hover:border-brand-300",
        blink && "animate-pulse-ring",
      )}>
      {/* Acuity stripe — the colour you read from across the room */}
      <span className={cn("absolute inset-y-0 start-0 w-1.5", meta.stripe)} aria-hidden />

      <div className="flex items-center gap-2.5">
        <CardAvatar pet={c.pet} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-ink">{c.pet?.name ?? "—"}</div>
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
            <span className="truncate text-2xs font-bold text-ink-subtle">
              {c.condition === "critical" ? "حرجة · " : ""}{c.pet ? (SPECIES_AR[c.pet.species] ?? c.pet.species) : ""}{c.cage ? ` · قفص ${c.cage}` : ""}
            </span>
          </div>
        </div>
        {doneToday && !busy && (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500 text-white"><CheckCircle2 size={13} /></span>
        )}
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

/* ── مساعدات مشتركة لسكاشن ما بعد العلاج ─────────────────────────────────── */
const outcomeMeta = (id?: string | null) => OUTCOMES.find((o) => o.id === id);
const OUTCOME_TONE_CLS: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};
const durationDays = (from: string, to?: string | null) =>
  Math.max(1, Math.round((new Date(to ?? new Date().toISOString()).getTime() - new Date(from).getTime()) / 86400000) + 0);

/** سطر جرعات الحالة: «انعطت ١٢ من ١٤ (٨٦٪)» — أو لا شيء إذا ما عندها خطة. */
function doseSummary(tx: TreatmentEntry[]): string | null {
  if (!tx.length) return null;
  const done = tx.filter((t) => t.administered_at).length;
  const pct = Math.round((done / tx.length) * 100);
  return `انعطت ${formatNum(done)} من ${formatNum(tx.length)} جرعة (${formatNum(pct)}٪)`;
}

/* ── سكشن الحالات: الطبلات الي خلص علاجها وانسكّرت بنتيجة ────────────────── */
function CasesSection({ cases, pets, lang, txForVisit, onOpen }: {
  cases: ClinicVisit[];
  pets: Record<string, Pet>;
  lang: string;
  txForVisit: (visitId: string) => TreatmentEntry[];
  onOpen: (v: ClinicVisit) => void;
}) {
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const shown = outcomeFilter === "all" ? cases : cases.filter((v) => v.outcome === outcomeFilter);
  const outcomesHere = OUTCOMES.filter((o) => o.id !== "under_treatment" && o.id !== "lost_followup" && cases.some((v) => v.outcome === o.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-extrabold text-ink-muted">النتيجة:</span>
        <FilterChip active={outcomeFilter === "all"} label="الكل" count={cases.length} onClick={() => { playTap(); setOutcomeFilter("all"); }} />
        {outcomesHere.map((o) => (
          <FilterChip key={o.id} active={outcomeFilter === o.id} label={`${o.emoji} ${o.label}`} count={cases.filter((v) => v.outcome === o.id).length}
            onClick={() => { playTap(); setOutcomeFilter(o.id); }} />
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <Archive size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">ماكو حالات منتهية بعد</p>
          <p className="mt-1 text-xs text-ink-subtle">لما تنهي زيارة وتسجل نتيجتها (شُفي، مزمنة…) تنتقل الطبلة إلى هنا تلقائياً.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((v) => {
            const pet = pets[v.pet_id];
            const o = outcomeMeta(v.outcome);
            const tx = txForVisit(v.id);
            const ds = doseSummary(tx);
            const days = durationDays(v.opened_at, v.ended_at);
            return (
              <button key={v.id} type="button" onClick={() => onOpen(v)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 text-start shadow-card transition hover:border-brand-300">
                <CardAvatar pet={pet} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-ink">{pet?.name ?? "—"}</span>
                    {o && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", OUTCOME_TONE_CLS[o.tone])}>{o.emoji} {o.label}</span>}
                  </span>
                  <span className="block truncate text-2xs font-semibold text-ink-muted">{v.reason?.trim() || "بلا تشخيص مسجّل"}</span>
                  <span className="block text-2xs text-ink-subtle">
                    {formatDate(v.opened_at, lang)} ← {v.ended_at ? formatDate(v.ended_at, lang) : "—"} · مدة العلاج {formatNum(days)} يوم{ds ? ` · ${ds}` : ""}
                  </span>
                  {v.summary?.trim() && <span className="mt-0.5 block truncate text-2xs text-ink-subtle">📝 {v.summary}</span>}
                </span>
                <ChevronLeft size={16} className="shrink-0 text-ink-subtle rtl:rotate-180" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── سجل المتوفين: توثيق محترم — التاريخ، التشخيص، وسبب الوفاة ────────────── */
function DeceasedSection({ deceased, pets, lang, onOpen, onSaveCause }: {
  deceased: ClinicVisit[];
  pets: Record<string, Pet>;
  lang: string;
  onOpen: (v: ClinicVisit) => void;
  onSaveCause: (v: ClinicVisit, cause: string) => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (v: ClinicVisit) => {
    if (busy) return;
    setBusy(true);
    try { await onSaveCause(v, draft); setEditId(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-line bg-surface-1 px-3 py-2 text-2xs font-semibold text-ink-subtle">
        الحالات المنتهية بالوفاة 🕊️ — تنتقل هنا تلقائياً لما تُنهى الزيارة بنتيجة «متوفى». سبب الوفاة يُقرأ من ملاحظة الإغلاق، وتگدر تكتبه أو تعدّله من هنا مباشرة. الحيوان المتوفى تسكت عنه التهاني والتذكيرات تلقائياً بكل السستم.
      </p>
      {deceased.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <HeartCrack size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">ماكو وفيات مسجّلة</p>
          <p className="mt-1 text-xs text-ink-subtle">نتمنى تضل هالصفحة فارغة دائماً 🤍</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deceased.map((v) => {
            const pet = pets[v.pet_id];
            const days = durationDays(v.opened_at, v.ended_at);
            const editing = editId === v.id;
            return (
              <div key={v.id} className="rounded-xl border border-line bg-surface-1 p-3 shadow-card">
                <div className="flex flex-wrap items-center gap-3">
                  <CardAvatar pet={pet} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-black text-ink">{pet?.name ?? "—"}</span>
                      <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-extrabold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">🕊️ متوفى</span>
                      <span className="text-2xs text-ink-subtle">{pet ? SPECIES_AR[pet.species] ?? pet.species : ""}</span>
                    </div>
                    <div className="text-2xs font-semibold text-ink-muted">{v.reason?.trim() ? `التشخيص: ${v.reason}` : "بلا تشخيص مسجّل"}</div>
                    <div className="text-2xs text-ink-subtle">
                      دخل {formatDate(v.opened_at, lang)} · توفّى {v.ended_at ? formatDate(v.ended_at, lang) : "—"} · بعد {formatNum(days)} يوم علاج
                      {v.ended_by ? ` · سجّلها ${v.ended_by}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpen(v)}
                    className="shrink-0 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">السجل الكامل</button>
                </div>

                {/* سبب الوفاة — يُعرض دائماً، ويتحرر بضغطة */}
                <div className="mt-2 flex items-center gap-1.5">
                  {editing ? (
                    <>
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void save(v); if (e.key === "Escape") setEditId(null); }}
                        placeholder="سبب الوفاة… (مثال: فشل كلوي حاد رغم المحاليل)"
                        className="input h-8 flex-1 text-2xs" />
                      <button type="button" onClick={() => void save(v)} disabled={busy}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50">
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={cn("min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-2xs font-semibold",
                        v.summary?.trim() ? "bg-surface-2 text-ink" : "border border-dashed border-line text-ink-subtle")}>
                        {v.summary?.trim() ? `سبب الوفاة: ${v.summary}` : "سبب الوفاة غير مسجّل — اضغط القلم لتوثيقه"}
                      </span>
                      <button type="button" onClick={() => { playTap(); setEditId(v.id); setDraft(v.summary ?? ""); }} title="تعديل سبب الوفاة"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition hover:border-brand-300 hover:text-ink">
                        <Pencil size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── سكشن المنقطعين: صاحبها ما رجع يكمل العلاج ───────────────────────────── */
function LostSection({ stalled, lost, pets, lang, busyId, txForVisit, onMarkLost, onRestore, onNudge, onOpenChart, onOpenVisit }: {
  stalled: { chart: Chart; lastGiven: string | null; remaining: number; sinceDays: number }[];
  lost: ClinicVisit[];
  pets: Record<string, Pet>;
  lang: string;
  busyId: string | null;
  txForVisit: (visitId: string) => TreatmentEntry[];
  onMarkLost: (c: Chart, remaining: number) => void;
  onRestore: (v: ClinicVisit) => void;
  onNudge: (pet: Pet | undefined, remaining: number) => void;
  onOpenChart: (c: Chart) => void;
  onOpenVisit: (v: ClinicVisit) => void;
}) {
  return (
    <div className="space-y-5">
      {/* المشتبه بانقطاعهم — بعدهم بالسجل النشط، والقرار للدكتور */}
      {stalled.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><AlertTriangle size={15} /></span>
            <h2 className="text-sm font-extrabold text-ink">يبينون منقطعين — قرّر بيهم</h2>
            <span className="rounded-full bg-warn-100 px-2 py-0.5 text-2xs font-black text-warn-700 dark:bg-warn-500/20 dark:text-warn-300">{formatNum(stalled.length)}</span>
          </div>
          <p className="mb-2 text-2xs text-ink-subtle">طبلات نشطة ما انعطت منها ولا جرعة من ٤٨ ساعة وأكثر وعليها جرعات متأخرة. ذكّر صاحبها بالواتساب، أو علّمها منقطعة فتنتقل لهذا السكشن رسمياً.</p>
          <div className="space-y-2">
            {stalled.map(({ chart: c, lastGiven, remaining, sinceDays }) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-300 bg-warn-50/50 p-3 dark:border-warn-500/30 dark:bg-warn-500/5">
                <CardAvatar pet={c.pet} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-ink">{c.pet?.name ?? "—"}</div>
                  <div className="truncate text-2xs font-semibold text-ink-muted">{c.title}</div>
                  <div className="text-2xs font-bold text-warn-700 dark:text-warn-300">
                    {lastGiven ? `آخر جرعة قبل ${formatNum(sinceDays)} يوم` : `ولا جرعة انعطت من ${formatNum(sinceDays)} يوم`} · باقي {formatNum(remaining)} جرعة
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.pet?.owner_phone && (
                    <button type="button" onClick={() => onNudge(c.pet, remaining)} title="ذكّر صاحبه بالواتساب"
                      className="inline-flex items-center gap-1 rounded-full bg-success-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-success-700">
                      <MessageCircle size={12} /> ذكّر
                    </button>
                  )}
                  <button type="button" onClick={() => onOpenChart(c)}
                    className="rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">افتح الطبلة</button>
                  <button type="button" onClick={() => onMarkLost(c, remaining)} disabled={busyId === c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-warn-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-warn-700 disabled:opacity-50">
                    {busyId === c.id ? <Loader2 size={12} className="animate-spin" /> : <DoorOpen size={12} />} علّمها منقطعة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* المعلَّمون منقطعين رسمياً */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted"><DoorOpen size={15} /></span>
          <h2 className="text-sm font-extrabold text-ink">منقطعون عن المراجعة</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-black text-ink-subtle">{formatNum(lost.length)}</span>
        </div>
        {lost.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface-1 p-6 text-center text-xs text-ink-subtle">
            ماكو حالات معلّمة منقطعة — وهذا خبر زين 🌟
          </div>
        ) : (
          <div className="space-y-2">
            {lost.map((v) => {
              const pet = pets[v.pet_id];
              const tx = txForVisit(v.id);
              const remaining = tx.filter((t) => !t.administered_at).length;
              const ds = doseSummary(tx);
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 shadow-card">
                  <CardAvatar pet={pet} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-ink">{pet?.name ?? "—"}</div>
                    <div className="truncate text-2xs font-semibold text-ink-muted">{v.reason?.trim() || "بلا تشخيص مسجّل"}</div>
                    <div className="text-2xs text-ink-subtle">
                      انقطع بتاريخ {v.ended_at ? formatDate(v.ended_at, lang) : "—"}{ds ? ` · ${ds}` : ""}{remaining > 0 ? ` · بقيت ${formatNum(remaining)} جرعة` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {pet?.owner_phone && (
                      <button type="button" onClick={() => onNudge(pet, remaining)} title="ذكّر صاحبه بالواتساب"
                        className="inline-flex items-center gap-1 rounded-full bg-success-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-success-700">
                        <MessageCircle size={12} /> ذكّر
                      </button>
                    )}
                    <button type="button" onClick={() => onOpenVisit(v)}
                      className="rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">السجل</button>
                    <button type="button" onClick={() => onRestore(v)} disabled={busyId === v.id}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-50">
                      {busyId === v.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} رجّعها نشطة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── التقارير: وصف دقيق لوضع كل طبلة وحالة ───────────────────────────────── */
function ReportsSection({ charts, treatments, txLoaded, cases, deceased, lost, stalled, pets, todayISO, lang, txForVisit }: {
  charts: Chart[];
  treatments: TreatmentEntry[];
  txLoaded: boolean;
  cases: ClinicVisit[];
  deceased: ClinicVisit[];
  lost: ClinicVisit[];
  stalled: { chart: Chart; lastGiven: string | null; remaining: number; sinceDays: number }[];
  pets: Record<string, Pet>;
  todayISO: string;
  lang: string;
  txForVisit: (visitId: string) => TreatmentEntry[];
}) {
  const monthKey = todayISO.slice(0, 7);
  const treatingCharts = charts.filter((c) => c.bucket === "daily" || c.bucket === "careBoarding");

  // امتثال اليوم: كل جرعات اليوم عبر السجلات النشطة.
  const todayTx = treatments.filter((t) => t.day === todayISO);
  const todayGiven = todayTx.filter((t) => t.administered_at).length;
  const todayPct = todayTx.length ? Math.round((todayGiven / todayTx.length) * 100) : null;
  const overdueDoses = treatments.filter((t) => taskStatus(t, todayISO) === "overdue").length;

  // المنتهية هذا الشهر (بنتيجة أو وفاة) + متوسط مدتها ومعدل إنجاز جرعاتها.
  const monthCases = cases.filter((v) => (v.ended_at ?? "").slice(0, 7) === monthKey);
  const monthDeceased = deceased.filter((v) => (v.ended_at ?? "").slice(0, 7) === monthKey);
  const monthClosed = [...monthCases, ...monthDeceased];
  const avgDays = monthClosed.length
    ? Math.round(monthClosed.reduce((s, v) => s + durationDays(v.opened_at, v.ended_at), 0) / monthClosed.length)
    : null;
  const monthAdherence = (() => {
    const all = monthClosed.flatMap((v) => txForVisit(v.id));
    if (!all.length) return null;
    return Math.round((all.filter((t) => t.administered_at).length / all.length) * 100);
  })();
  // نسبة الشفاء تُحسب على كل الإغلاقات — الوفيات جزء من المقام، هذا هو الصدق.
  const recoveredPct = monthClosed.length
    ? Math.round((monthClosed.filter((v) => v.outcome === "recovered").length / monthClosed.length) * 100)
    : null;

  /** الجملة الدقيقة لوصف طبلة نشطة — أرقامها كلها من جرعاتها الفعلية. */
  const describe = (c: Chart): string => {
    const tx = treatments.filter((t) => t.pet_id === c.petId);
    const day = dayNumber(c.since, todayISO);
    const days = new Set(tx.map((t) => t.day)).size;
    const parts: string[] = [];
    parts.push(`اليوم ${formatNum(day)}${days > 0 ? ` من خطة ${formatNum(days)} يوم` : ""}`);
    if (tx.length) {
      const done = tx.filter((t) => t.administered_at).length;
      parts.push(`انعطت ${formatNum(done)} من ${formatNum(tx.length)} جرعة (${formatNum(Math.round((done / tx.length) * 100))}٪)`);
      if (c.overdue > 0) parts.push(`${formatNum(c.overdue)} متأخرة هسة`);
      else if (c.dueToday > 0) parts.push(`${formatNum(c.dueToday)} مستحقة اليوم`);
      else if (c.todayTotal > 0) parts.push("يومها مكتمل ✓");
      const given = tx.filter((t) => t.administered_at).map((t) => t.administered_at!).sort();
      const lastAt = given[given.length - 1];
      if (lastAt) {
        const h = Math.round((Date.now() - new Date(lastAt).getTime()) / 3600000);
        parts.push(h < 1 ? "آخر جرعة قبل شوية" : h < 24 ? `آخر جرعة قبل ${formatNum(h)} ساعة` : `آخر جرعة قبل ${formatNum(Math.floor(h / 24))} يوم`);
      } else parts.push("بعد ما انعطت ولا جرعة");
    } else parts.push("بلا خطة علاج بعد");
    if (c.condition === "critical") parts.push("⚠️ حالتها حرجة");
    return parts.join("، ") + ".";
  };

  const worstFirst = [...treatingCharts].sort((a, b) => (b.overdue - a.overdue) || (b.dueToday - a.dueToday));

  const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" | "success" }) => (
    <div className={cn("rounded-xl border p-3 text-center",
      tone === "danger" ? "border-danger-300 bg-danger-50 dark:border-danger-500/30 dark:bg-danger-500/10"
      : tone === "warn" ? "border-warn-300 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/10"
      : tone === "success" ? "border-success-300 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
      : "border-line bg-surface-1")}>
      <div className="text-xl font-black tabular-nums text-ink">{value}</div>
      <div className="text-[10px] font-bold text-ink-subtle">{label}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* الأرقام الكبيرة */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="طبلة يومية نشطة" value={formatNum(charts.filter((c) => c.bucket === "daily").length)} />
        <Kpi label="فندقة علاجية نشطة" value={formatNum(charts.filter((c) => c.bucket === "careBoarding").length)} />
        <Kpi label="امتثال جرعات اليوم" value={todayPct === null ? "—" : `${formatNum(todayPct)}٪`} tone={todayPct !== null && todayPct < 60 ? "warn" : undefined} />
        <Kpi label="جرعة متأخرة الآن" value={formatNum(overdueDoses)} tone={overdueDoses > 0 ? "danger" : "success"} />
        <Kpi label="حالة انتهت هذا الشهر" value={formatNum(monthClosed.length)} />
        <Kpi label="نسبة الشفاء (هذا الشهر)" value={recoveredPct === null ? "—" : `${formatNum(recoveredPct)}٪`} tone={recoveredPct !== null && recoveredPct >= 70 ? "success" : undefined} />
        <Kpi label="وفيات هذا الشهر 🕊️" value={formatNum(monthDeceased.length)} tone={monthDeceased.length > 0 ? "danger" : "success"} />
        <Kpi label="متوسط مدة العلاج" value={avgDays === null ? "—" : `${formatNum(avgDays)} يوم`} />
        <Kpi label="منقطعون (كلي + مشتبه)" value={formatNum(lost.length + stalled.length)} tone={lost.length + stalled.length > 0 ? "warn" : "success"} />
      </div>

      {/* وصف دقيق لكل طبلة نشطة — الأسوأ أولاً */}
      <section className="rounded-2xl border border-line bg-surface-1 p-4 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><FileText size={15} /></span>
          <h2 className="text-sm font-extrabold text-ink">وضع الطبلات النشطة — بالتفصيل</h2>
          {!txLoaded && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
        </div>
        {treatingCharts.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-subtle">ماكو طبلات علاجية نشطة حالياً.</p>
        ) : (
          <div className="divide-y divide-line/60">
            {worstFirst.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 py-2.5">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", ACUITY[acuityOf(c, txLoaded)].dot)} aria-hidden />
                <div className="min-w-0 text-xs leading-relaxed">
                  <span className="font-black text-ink">{c.pet?.name ?? "—"}</span>
                  <span className="text-ink-subtle"> ({c.pet ? SPECIES_AR[c.pet.species] ?? c.pet.species : "—"}{c.title !== "—" ? ` · ${c.title}` : ""})</span>
                  <span className="font-semibold text-ink-muted"> — {describe(c)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* وصف المنقطعين والمنتهين */}
      <section className="rounded-2xl border border-line bg-surface-1 p-4 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><DoorOpen size={15} /></span>
          <h2 className="text-sm font-extrabold text-ink">المنقطعون والحالات المنتهية</h2>
        </div>
        <div className="space-y-1.5 text-xs leading-relaxed">
          {stalled.map(({ chart: c, remaining, sinceDays, lastGiven }) => (
            <p key={c.id} className="text-warn-700 dark:text-warn-300">
              <span className="font-black">{c.pet?.name ?? "—"}</span>
              <span className="font-semibold"> — يبين منقطع: {lastGiven ? `آخر جرعة قبل ${formatNum(sinceDays)} يوم` : `ولا جرعة من ${formatNum(sinceDays)} يوم`}، باقي {formatNum(remaining)} جرعة ما انعطت.</span>
            </p>
          ))}
          {lost.map((v) => {
            const tx = txForVisit(v.id);
            const remaining = tx.filter((t) => !t.administered_at).length;
            return (
              <p key={v.id} className="text-ink-muted">
                <span className="font-black text-ink">{pets[v.pet_id]?.name ?? "—"}</span>
                <span className="font-semibold"> — منقطع رسمياً من {v.ended_at ? formatDate(v.ended_at, lang) : "—"}{remaining > 0 ? `، وقف علاجه على ${formatNum(remaining)} جرعة متبقية` : ""}.</span>
              </p>
            );
          })}
          {monthDeceased.map((v) => (
            <p key={v.id} className="text-danger-700 dark:text-danger-300">
              <span className="font-black">{pets[v.pet_id]?.name ?? "—"}</span>
              <span className="font-semibold"> — توفّى 🕊️ بعد {formatNum(durationDays(v.opened_at, v.ended_at))} يوم علاج{v.summary?.trim() ? `، السبب: ${v.summary}` : "، سبب الوفاة غير مسجّل"}.</span>
            </p>
          ))}
          {monthCases.map((v) => {
            const o = outcomeMeta(v.outcome);
            const ds = doseSummary(txForVisit(v.id));
            return (
              <p key={v.id} className="text-ink-muted">
                <span className="font-black text-ink">{pets[v.pet_id]?.name ?? "—"}</span>
                <span className="font-semibold"> — انتهت {o ? `بـ«${o.label}» ${o.emoji}` : ""} بعد {formatNum(durationDays(v.opened_at, v.ended_at))} يوم علاج{ds ? ` (${ds})` : ""}.</span>
              </p>
            );
          })}
          {stalled.length === 0 && lost.length === 0 && monthClosed.length === 0 && (
            <p className="py-2 text-center text-ink-subtle">ماكو حركة منتهية أو منقطعة هذا الشهر بعد.</p>
          )}
        </div>
        {monthAdherence !== null && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-2xs font-bold text-ink-muted">
            معدل إنجاز جرعات الحالات المنتهية هذا الشهر: {formatNum(monthAdherence)}٪.
          </p>
        )}
      </section>
    </div>
  );
}
