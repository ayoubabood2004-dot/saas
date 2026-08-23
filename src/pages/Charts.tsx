import { useCallback, useEffect, useMemo, useState } from "react";
import { sendWhatsApp, quotaMessage } from "@/lib/quotas";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Stethoscope, BedDouble, HeartPulse, ClipboardList, Pill, AlertTriangle,
  CheckCircle2, Clock, Loader2, Search, LayoutGrid, TableProperties, ChevronLeft, Slice, Plus,
  Archive, DoorOpen, BarChart3, RotateCcw, MessageCircle, FileText, HeartCrack, Pencil, Check, Boxes,
} from "lucide-react";
import type { Admission, ClinicVisit, MedicalVisit, Pet, PatientCondition, TreatmentEntry , Surgery } from "@/types";
import { repo } from "@/lib/repo";
import { getCached, setCached } from "@/lib/swrCache";
import { PetAvatar } from "@/components/PetAvatar";
import { Button, useToast } from "@/components/ui";
import { Flowsheet, AddTaskSheet, type FlowPatient } from "@/components/Flowsheet";
import { RoundMode } from "@/components/RoundMode";
import { buildRound } from "@/lib/round";
import type { GroupBy } from "@/lib/flowsheet";
import { cageRoomOf, cageSortKey } from "@/lib/cageOrder";
/* لافتة الرقم نفسها التي تحملها بطاقة القفص — مكوّنٌ واحد لا نسختان
 * متشابهتان: الشاشتان تتكلّمان لغةَ شكلٍ واحدة، وأيُّ تحسينٍ يصلهما معاً. */
import { Nameplate } from "@/components/cages/CageCard";
import { opsStore } from "@/lib/opsStore";
import { TreatmentBoard } from "@/components/TreatmentBoard";
import { CageMap } from "@/components/CageMap";
import { taskStatus } from "@/lib/treatmentSchedule";
import { syncDoseCycleForPet } from "@/lib/doseCycle";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { waNumber } from "@/lib/phone";
import { getDialCode, getClinicName } from "@/lib/settings";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchState, matchesBranch } from "@/lib/branchStore";
import { localISO, formatDate, formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { describeDbError } from "@/lib/errors";
import { Modal } from "@/components/Modal";

/* ── Bucket configuration ─────────────────────────────────────────────────── */
type BucketKey = "daily" | "careBoarding" | "boarding" | "visit";
const BUCKETS: { key: BucketKey; icon: typeof Stethoscope; tint: string; ring: string; badge: string }[] = [
  { key: "daily", icon: Stethoscope, tint: "text-amber-600 dark:text-amber-300", ring: "bg-amber-100 dark:bg-amber-500/15", badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  { key: "careBoarding", icon: HeartPulse, tint: "text-rose-600 dark:text-rose-300", ring: "bg-rose-100 dark:bg-rose-500/15", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" },
  { key: "boarding", icon: BedDouble, tint: "text-sky-600 dark:text-sky-300", ring: "bg-sky-100 dark:bg-sky-500/15", badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200" },
  { key: "visit", icon: ClipboardList, tint: "text-brand-600 dark:text-brand-300", ring: "bg-brand-100 dark:bg-brand-500/15", badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" },
];
/** تسميات الدلاء — تُقرأ وقت الرسم حتى يتبدل النص مع تبديل اللغة. */
const bucketLabel = (t: TFunction, key: BucketKey): string => ({
  daily: t("charts.bucketDaily", "الطبلات اليومية"),
  careBoarding: t("charts.bucketCareBoarding", "طبلات الفندقة العلاجية"),
  boarding: t("charts.bucketBoarding", "طبلات الفندقة"),
  visit: t("charts.bucketVisit", "طبلات الزيارة"),
}[key]);

/* ── السجلات: هيكلة الصفحة العليا ──────────────────────────────────────────
 * سجلا العلاج (اليومية + الفندقة العلاجية) هما اللذان يحملان جرعات — فكل
 * واحد سجل مستقل بواجهته. الفندقة العادية والزيارات (بلا علاجات) بسجل جانبي.
 * وبعد ما يخلص العلاج، الطبلة تغادر السجلات النشطة: إما «سكشن الحالات»
 * (انتهت بنتيجة) أو «المنقطعون» (صاحبها ما رجع يكمل). و«التقارير» تحكي
 * وضع كل هذا بالأرقام وبالجُمل. */
type RegistryKey = "daily" | "careBoarding" | "other" | "cages" | "cases" | "deceased" | "lost" | "reports";
const REGISTRIES: { key: RegistryKey; icon: typeof Stethoscope }[] = [
  { key: "daily", icon: Stethoscope },
  { key: "careBoarding", icon: HeartPulse },
  { key: "other", icon: BedDouble },
  { key: "cages", icon: Boxes },
  { key: "cases", icon: Archive },
  { key: "deceased", icon: HeartCrack },
  { key: "lost", icon: DoorOpen },
  { key: "reports", icon: BarChart3 },
];
/** تسميات السجلات — وقت الرسم أيضاً. */
const registryLabel = (t: TFunction, key: RegistryKey): string => ({
  daily: t("charts.regDaily", "سجل الطبلات اليومية"),
  careBoarding: t("charts.regCareBoarding", "سجل الفندقة العلاجية"),
  other: t("charts.regOther", "الفندقة والزيارات"),
  cages: t("charts.regCages", "خريطة الأقفاص"),
  cases: t("charts.regCases", "سكشن الحالات"),
  deceased: t("charts.regDeceased", "سجل المتوفين"),
  lost: t("charts.regLost", "المنقطعون"),
  reports: t("charts.regReports", "التقارير"),
}[key]);
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
const ACUITY: Record<Acuity, { stripe: string; card: string; dot: string; ring: string; chip: string }> = {
  critical: { stripe: "bg-danger-500", card: "border-danger-300 dark:border-danger-500/40", dot: "bg-danger-500",
    ring: "ring-danger-300 dark:ring-danger-500/50", chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" },
  overdue:  { stripe: "bg-danger-500", card: "border-danger-300 dark:border-danger-500/40", dot: "bg-danger-500",
    ring: "ring-danger-300 dark:ring-danger-500/50", chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" },
  due:      { stripe: "bg-warn-500", card: "border-warn-300 dark:border-warn-500/40", dot: "bg-warn-500",
    ring: "ring-warn-300 dark:ring-warn-500/50", chip: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300" },
  stable:   { stripe: "bg-sky-400", card: "border-line-strong", dot: "bg-sky-400",
    ring: "ring-sky-300 dark:ring-sky-500/40", chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  settled:  { stripe: "bg-teal-400", card: "border-teal-300 dark:border-teal-500/40", dot: "bg-teal-400",
    ring: "ring-teal-300 dark:ring-teal-500/50", chip: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
};
const acuityLabel = (t: TFunction, k: Acuity): string => ({
  critical: t("charts.acuityCritical", "حرجة"),
  overdue: t("charts.acuityOverdue", "متأخّرة"),
  due: t("charts.acuityDue", "مستحقّة"),
  stable: t("charts.acuityStable", "مستقرّة"),
  settled: t("charts.acuitySettled", "اليوم مكتمل"),
}[k]);
const ACUITY_RANK: Record<Acuity, number> = { critical: 0, overdue: 1, due: 2, stable: 3, settled: 4 };

function acuityOf(c: Chart, txLoaded: boolean): Acuity {
  if (c.condition === "critical") return "critical";
  if (!txLoaded) return "stable";
  if (c.overdue > 0) return "overdue";
  if (c.dueToday > 0) return "due";
  if (c.todayTotal > 0) return "settled";
  return "stable";
}

const speciesLabel = (t: TFunction, species: string): string => (({
  dog: t("charts.speciesDog", "كلب"), cat: t("charts.speciesCat", "قطة"), horse: t("charts.speciesHorse", "حصان"), cow: t("charts.speciesCow", "بقرة"), bird: t("charts.speciesBird", "طائر"), rabbit: t("charts.speciesRabbit", "أرنب"), other: t("charts.speciesOther", "أخرى"),
} as Record<string, string>)[species] ?? species);
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

/** العروض الثلاثة ومفاتيح حفظها. */
type ChartView = "sheet" | "cards" | "board";
const VIEW_KEY = "vp_charts_view";
const GROUP_KEY = "vp_charts_group";
/** "HH:MM" من ساعة الجهاز — يُحسب مرة كل دقيقة لا كل رسم. */
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const dayNumber = (iso: string, todayISO: string) => {
  const start = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const now = new Date(`${todayISO}T00:00:00`).getTime();
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
};

export function Charts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id ?? undefined;
  const todayISO = localISO();

  const [ops, setOps] = useState(() => opsStore.get());
  /** "HH:MM" الحالية — تتبع نبضة الدقيقة أدناه، فخط «الآن» يزحف مع الساعة. */
  const [nowHHMM, setNowHHMM] = useState(hhmm);
  // Minute tick — re-renders so the "اليوم مكتمل" aqua tint clears by itself the
  // moment the next dose comes due (e.g. the day rolls over to tomorrow's doses).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { setTick((n) => n + 1); setNowHHMM(hhmm()); }, 60000);
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
  /* ثلاثة عروض لنفس البيانات، والاختيار يخصّ الطبيب لا التطبيق:
   *   sheet  = ورقة العلاج (مرضى × ساعات) — الأقرب لما يفعله بالجولة
   *   cards  = بطاقة لكل مريض — «من عندي اليوم؟»
   *   board  = مهمة لكل جرعة مرتّبةً بالتأخير — شاشة الجدار
   * ويُحفظ اختياره: طبيبٌ فضّل البطاقات مرة لا يُعاد ترشيده كل صباح. */
  const [view, setView] = useState<ChartView>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === "cards" || v === "board" || v === "sheet" ? v : "sheet";
    } catch { return "sheet"; }
  });
  const pickView = useCallback((v: ChartView) => {
    playTap();
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* خصوصية متشددة — الاختيار يبقى للجلسة */ }
  }, []);
  /** المجموعة التي تُقسَّم بها ورقة العلاج — بيد الطبيب لا بخوارزمية ثابتة. */
  const [grouping, setGrouping] = useState<GroupBy>(() => {
    try {
      const g = localStorage.getItem(GROUP_KEY);
      return g === "cage" || g === "acuity" || g === "doctor" || g === "none" ? g : "cage";
    } catch { return "cage"; }
  });
  const pickGroup = useCallback((g: GroupBy) => {
    playTap();
    setGrouping(g);
    try { localStorage.setItem(GROUP_KEY, g); } catch { /* ignore */ }
  }, []);
  /** المريض المفتوحة له لوحة «مهمة جديدة». */
  const [addFor, setAddFor] = useState<string | null>(null);
  /* المريض المعروض بورقة العلاج. `null` = الكل (السلوك القديم، بضغطةٍ واحدة).
   *
   * الشبكة محاورها المريض والساعة، فكلّما كثر المرضى ضاق كل شيء: عشرة صفوف
   * لأربعة مرضى تُخرج الورقة عن الشاشة عرضاً، وتُصغّر الخانة حتى لا تُصاب
   * بإصبع. ومريضٌ واحد يعكس ذلك كلّه — الأعمدة تُشتقّ من مهامه وحده فتقلّ،
   * والخانة تتنفّس. وهذا ما تفعله البرامج العالمية: لوحةٌ لكل المرضى تفتح
   * **ورقة مريضٍ واحد**. */
  const [focusPet, setFocusPet] = useState<string | null>(null);
  /** ساعةٌ مختارة من خانةٍ فارغة — تُملأ بلوحة الإضافة بدل أن يبحث عنها. */
  const [addHour, setAddHour] = useState<number | null>(null);
  /* وضع الجولة — شاشةٌ كاملة تُفتح وتُغلق. الورقة تبقى تحتها كما هي، وكل ما
   * سُجّل بالجولة يظهر عليها فور الخروج. */
  const [roundOpen, setRoundOpen] = useState(false);
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
      const title = v.reason?.trim() || t("charts.visitFallback", "زيارة");
      if (!matchQ(pet, title)) continue;
      out.push({ id: `vis_${v.id}`, bucket: "visit", petId: v.pet_id, visitId: v.id, pet, title, since: v.opened_at, condition: conditionByPet.get(v.pet_id) ?? null, ...statusFrom(treatments.filter((t) => t.visit_id === v.id)) });
    }
    // Acuity leads the sort: the critical patient is the first thing you see.
    return out.sort((a, b) =>
      (ACUITY_RANK[acuityOf(a, txLoaded)] - ACUITY_RANK[acuityOf(b, txLoaded)]) ||
      (b.overdue - a.overdue) || (b.dueToday - a.dueToday) || b.since.localeCompare(a.since));
    // `tick` is a dependency on purpose: overdue is now clock-based, so the counts
    // must be recomputed every minute, not only when the data changes.
  }, [ops.admissions, visits, treatments, pets, openVisitByPet, conditionByPet, activeBranch, branches, query, todayISO, tick, txLoaded, t]);

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
    if (!window.confirm(t("charts.confirmMarkLost", { name: c.pet?.name ?? t("charts.theAnimal", "الحيوان"), defaultValue: "تعلّم طبلة {{name}} «منقطعة عن المراجعة»؟\nتنتقل لسكشن المنقطعين وتگدر ترجّعها إذا رجع صاحبها." }))) return;
    playTap();
    setLostBusy(c.id);
    const now = new Date().toISOString();
    const summary = t("charts.lostSummary", { n: remaining, defaultValue: "عُلّمت منقطعة عن المراجعة من سجل الطبلات — بقيت {{n}} جرعة ما انعطت." });
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
    const remainingTxt = remaining > 0 ? t("charts.waRemainingDoses", { n: remaining, defaultValue: "{{n}} جرعة من خطة علاجه" }) : t("charts.waFollowUpTx", "متابعة علاجه");
    const msg = t("charts.waNudge", { owner: pet.owner_name ?? "", pet: pet.name, remaining: remainingTxt, clinic: getClinicName() || t("charts.theClinic", "العيادة"), defaultValue: "مرحباً {{owner}} 👋\nنحب نطمئن على {{pet}} — باقي {{remaining}} عند {{clinic}}. إكمال العلاج مهم لشفائه الكامل 🐾\nننتظركم، وإذا في أي ظرف خبرونا نرتبلكم موعد ثاني." });
    try {
      await sendWhatsApp({ phone: waNumber(pet.owner_phone, getDialCode()), text: msg, petId: pet.id, ownerName: pet.owner_name ?? null, ownerPhone: pet.owner_phone, kind: "followup" });
    } catch (e) { const m = quotaMessage(e); if (m) window.alert(m); }
  };

  /* ── أفعال ورقة العلاج ────────────────────────────────────────────────
   * كلها متفائلة: الجولة لا تنتظر الشبكة. الخانة تنقلب بمكانها فوراً
   * والكتابة تلحقها — وهذا هو الفرق بين ورقة تُستعمل وأخرى تُهجَر. */
  const patchTx = useCallback((id: string, patch: Partial<TreatmentEntry>) => {
    setTreatments((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /**
   * تفاؤلٌ **بشرط**: لو فشلت الكتابة تُرَدّ الخانة ويُصرَخ.
   *
   * كانت كل هذه الأفعال تكتب `.catch(() => {})` — أي أن فشل الحفظ يُبتلع
   * صامتاً بينما الشاشة تُظهر النجاح. وبنظامٍ طبيّ هذا أخطر من الفشل نفسه:
   * الطبيب يرى الجرعة خضراء فيصدّق أنها سُجّلت، والوردية التالية تقرأ سجلاً
   * لم يُكتب. وقد وقع هذا فعلاً — الهجرة ٠١١٥ كانت ناقصةً بقاعدة البيانات،
   * فكانت كل إضافة مهمّة وكل قياس وكل سبب فوات **تفشل بلا أن يعلم أحد**.
   *
   * فصار كل فعلٍ يحمل نقيضه: يُطبَّق فوراً، وإن رفض الخادم رُدَّ إلى ما كان
   * وظهرت رسالةٌ حمراء تقول **ما الذي لم يُحفظ**.
   *
   * والعنوان يقوله الفعلُ نفسه (`what`) لا مشغّلُ قاعدة البيانات: الطبيب
   * يحتاج أن يعرف أن **الإعطاء** لم يُسجَّل وأن الخانة رجعت، لا أن يقرأ
   * «duplicate key value violates…». والنص التقني يبقى بالسطر الثاني لمن
   * يشخّص العطل.
   */
  const persist = useCallback(
    (id: string, what: string, patch: Partial<TreatmentEntry>, before: Partial<TreatmentEntry>, write: () => Promise<unknown>) => {
      patchTx(id, patch);
      void write().catch((err) => {
        patchTx(id, before);
        playWarning();
        toast.error(what, describeDbError(err, t));
      });
    },
    [patchTx, toast, t],
  );

  const flowGive = useCallback((e: TreatmentEntry) => {
    const at = new Date().toISOString();
    const by = user?.full_name ?? undefined;
    persist(e.id, t("charts.saveFailGive", "ما انحفظ الإعطاء — رجّعنا الخانة مثل ما كانت. أعِد المحاولة."),
      { administered_at: at, administered_by: by, missed_reason: null },
      { administered_at: e.administered_at ?? null, administered_by: e.administered_by, missed_reason: e.missed_reason ?? null },
      () => repo.setTreatmentGiven(e.id, true, by, at));
  }, [persist, user?.full_name, t]);

  /** إلغاء تسجيلٍ تمّ: الجرعة ترجع معلّقةً، ويُمسح مَن أعطاها ومتى.
   *  ضغطةٌ بالغلط تُصلَّح بضغطة — والبديل أن تبقى جرعةٌ مسجَّلةً ولم تُعطَ. */
  const flowUndo = useCallback((e: TreatmentEntry) => {
    persist(e.id, t("charts.saveFailUndo", "ما انحفظ التراجع — الجرعة باقية مسجَّلة كما هي. أعِد المحاولة."),
      { administered_at: null, administered_by: undefined, result: null },
      { administered_at: e.administered_at ?? null, administered_by: e.administered_by, result: e.result ?? null },
      () => repo.setTreatmentGiven(e.id, false));
  }, [persist, t]);

  const flowValue = useCallback((e: TreatmentEntry, value: string) => {
    const at = new Date().toISOString();
    const by = user?.full_name ?? undefined;
    persist(e.id, t("charts.saveFailValue", "ما انحفظت القيمة — أعِد إدخالها."),
      { result: value, administered_at: at, administered_by: by, missed_reason: null },
      { result: e.result ?? null, administered_at: e.administered_at ?? null, administered_by: e.administered_by, missed_reason: e.missed_reason ?? null },
      () => repo.setTreatmentResult(e.id, value, by, at));
  }, [persist, user?.full_name, t]);

  const flowMissed = useCallback((e: TreatmentEntry, reason: string | null) => {
    persist(e.id, t("charts.saveFailMissed", "ما انحفظ سبب الفوات — أعِد المحاولة."),
      { missed_reason: reason }, { missed_reason: e.missed_reason ?? null },
      () => repo.setTreatmentMissed(e.id, reason));
  }, [persist, t]);

  /** إضافة أوامر: هنا لا يوجد «ردٌّ لما كان» — الصفوف لم تُنشأ بعد. فالفشل
   *  يُقال صراحةً بدل أن تظهر أوامرُ ليس لها وجودٌ بقاعدة البيانات. */
  const flowAdd = useCallback(async (petId: string, rows: Omit<TreatmentEntry, "id" | "created_at">[]) => {
    const visitId = openVisitByPet.get(petId)?.id ?? null;
    const full = rows.map((r) => ({ ...r, pet_id: petId, visit_id: visitId, doctor: user?.full_name ?? undefined }));
    try {
      await repo.addTreatments(full);
    } catch (err) {
      playWarning();
      toast.error(t("charts.saveFailAdd", "ما انضافت الأوامر — ما انحفظ ولا سطر. راجع الاتصال وأعِد المحاولة."), describeDbError(err, t));
      return;
    }
    const tx = await repo.listAllTreatments([petId]).catch(() => [] as TreatmentEntry[]);
    setTreatments((cur) => [...cur.filter((t2) => t2.pet_id !== petId), ...tx]);
    playSuccess();
  }, [openVisitByPet, user?.full_name, toast, t]);

  const regCounts: Record<RegistryKey, number> = useMemo(() => ({
    daily: charts.filter((c) => c.bucket === "daily").length,
    careBoarding: charts.filter((c) => c.bucket === "careBoarding").length,
    other: charts.filter((c) => c.bucket === "boarding" || c.bucket === "visit").length,
    // خريطة الأقفاص تَعُدّ الحيوانات الراقدة داخل أقفاص فعلاً (رقود نشط + رمز قفص).
    cages: ops.admissions.filter((a) => a.status !== "discharged" && (a.cage ?? "").trim() !== "").length,
    cases: casesList.length,
    deceased: deceasedList.length,
    lost: lostList.length + stalled.length,
    reports: 0,
  }), [charts, ops.admissions, casesList, deceasedList, lostList, stalled]);

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

  /* المرضى المعروضون بالورقة — مرتّبون حسب التجميع المختار. «حسب ترتيب
   * الأقفاص» يقرأ التخطيط الذي رسمه الطبيب بغرفة الأقفاص نفسها. */
  const flowPatients = useMemo<FlowPatient[]>(() => {
    const list: FlowPatient[] = activeCharts.map((c) => ({
      petId: c.petId,
      pet: c.pet,
      cage: c.cage ?? null,
      room: cageRoomOf(c.cage) ?? null,
      critical: acuityOf(c, txLoaded) === "critical" || acuityOf(c, txLoaded) === "overdue",
      doctor: c.pet ? null : null,
    }));
    const byName = (a: FlowPatient, b: FlowPatient) => (a.pet?.name ?? "").localeCompare(b.pet?.name ?? "", "ar");
    if (grouping === "cage") {
      return list.sort((a, b) => cageSortKey(a.cage).localeCompare(cageSortKey(b.cage)) || byName(a, b));
    }
    if (grouping === "acuity") {
      const rank = (p: FlowPatient) => {
        const c = activeCharts.find((x) => x.petId === p.petId);
        return c ? ACUITY_RANK[acuityOf(c, txLoaded)] : 9;
      };
      return list.sort((a, b) => rank(a) - rank(b) || byName(a, b));
    }
    return list.sort(byName);
  }, [activeCharts, grouping, txLoaded]);

  const flowGroupLabel = useMemo(() => {
    if (grouping === "cage") {
      return (p: FlowPatient) => p.room || t("flow.noRoom", "بلا قفص");
    }
    if (grouping === "acuity") {
      return (p: FlowPatient) => {
        const c = activeCharts.find((x) => x.petId === p.petId);
        return c ? acuityLabel(t, acuityOf(c, txLoaded)) : "";
      };
    }
    return undefined;
  }, [grouping, activeCharts, txLoaded, t]);

  /* عدّاد كل مريضٍ للشريط: كم فات وكم حان. هذا هو الرقم الذي يجعل التبديل
   * بلا تفكير — الطبيب يرى أين ينتظره العمل قبل أن يفتح ورقة أحد. */
  const petCounts = useMemo(() => {
    const m = new Map<string, { overdue: number; due: number; total: number; done: number }>();
    for (const p of flowPatients) m.set(p.petId, { overdue: 0, due: 0, total: 0, done: 0 });
    for (const t of boardTreatments) {
      if (t.day !== todayISO) continue;
      const c = m.get(t.pet_id);
      if (!c) continue;
      c.total++;
      if (t.administered_at) { c.done++; continue; }
      const st = taskStatus(t, todayISO, nowHHMM);
      if (st === "overdue") c.overdue++;
      else if (st === "due") c.due++;
    }
    return m;
  }, [flowPatients, boardTreatments, todayISO, nowHHMM]);

  /* الافتراضي: أثقل مريضٍ تأخيراً. الطبيب يفتح الشاشة فيجد نفسه عند من
   * ينتظره فعلاً، لا عند أول اسمٍ بالحروف. */
  useEffect(() => {
    if (focusPet && flowPatients.some((p) => p.petId === focusPet)) return;
    if (!flowPatients.length) { if (focusPet) setFocusPet(null); return; }
    const worst = [...flowPatients].sort((a, b) => {
      const ca = petCounts.get(a.petId), cb = petCounts.get(b.petId);
      return ((cb?.overdue ?? 0) - (ca?.overdue ?? 0)) || ((cb?.due ?? 0) - (ca?.due ?? 0));
    })[0];
    setFocusPet(worst.petId);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [flowPatients.map((p) => p.petId).join("|")]);

  /** كم مهمّةً تنتظر الجولة الآن — يقرّر ظهور الزرّ ونصّه. */
  const roundDue = useMemo(
    () => buildRound(boardTreatments, (id) => pets[id], (id) => flowPatients.find((p) => p.petId === id)?.cage ?? null,
      todayISO, nowHHMM).length,
    [boardTreatments, pets, flowPatients, todayISO, nowHHMM],
  );

  const sheetPatients = useMemo(
    () => (focusPet ? flowPatients.filter((p) => p.petId === focusPet) : flowPatients),
    [flowPatients, focusPet],
  );

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
          <h1 className="text-xl font-black text-ink">{t("charts.title", "الطبلات")}</h1>
          <p className="text-xs font-semibold text-ink-subtle">{t("charts.subtitle", "خطط العلاج للحيوانات الموجودة اليوم في العيادة — مرتّبة في مكان واحد.")}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-center">
            <span className="block text-lg font-black leading-none text-ink">{formatNum(charts.length)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">{t("charts.activeCharts", "طبلة نشطة")}</span>
          </span>
          <span className={cn("rounded-lg border px-3 py-2 text-center", dueNow > 0 ? "border-warn-300 bg-warn-50 dark:border-warn-500/30 dark:bg-warn-500/10" : "border-line bg-surface-1")}>
            <span className={cn("block text-lg font-black leading-none", dueNow > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink")}>{formatNum(dueNow)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">{t("charts.needFollowUp", "تحتاج متابعة")}</span>
          </span>
          <button onClick={() => { playTap(); setSurgOpen(true); }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10">
            <span className="block text-lg font-black leading-none text-rose-700 dark:text-rose-300">{formatNum(monthSurgeries.length)}</span>
            <span className="text-[10px] font-bold text-ink-subtle">{t("charts.surgThisMonth", "🔪 عمليات هذا الشهر")}</span>
          </button>
        </div>
      </div>

      {/* السجلات — دورة حياة الطبلة كاملة بستة أبواب */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {REGISTRIES.map((r) => (
          <FilterChip key={r.key} active={reg === r.key} label={registryLabel(t, r.key)}
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
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("charts.searchPh", "ابحث باسم الحيوان أو التشخيص…")} className="input h-10 w-full ps-9" />
          </div>
          <div className="ms-auto inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5">
            <button type="button" data-view="sheet" onClick={() => pickView("sheet")}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", view === "sheet" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <TableProperties size={13} /> {t("charts.viewSheet", "ورقة العلاج")}
            </button>
            <button type="button" data-view="cards" onClick={() => pickView("cards")}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", view === "cards" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <LayoutGrid size={13} /> {t("charts.viewCards", "بطاقات")}
            </button>
            <button type="button" data-view="board" onClick={() => pickView("board")}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-2xs font-bold transition", view === "board" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              <Clock size={13} /> {t("charts.viewBoard", "الجرعات بالساعة")}
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {reg === "cages" ? (
        <CageMap />
      ) : reg === "cases" ? (
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
        <div className="py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> {t("charts.loading", "جارٍ التحميل…")}</div>
      ) : activeCharts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <LayoutGrid size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">
            {reg === "daily" ? t("charts.emptyDaily", "ماكو طبلات يومية نشطة") : reg === "careBoarding" ? t("charts.emptyCareBoarding", "ماكو فندقة علاجية نشطة") : t("charts.emptyOther", "ماكو فندقة أو زيارات مفتوحة")}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">{t("charts.emptyHint", "الطبلة تنفتح تلقائياً لما تدخّل حالة علاج — والمنتهية تلگيها بـ«سكشن الحالات».")}</p>
        </div>
      ) : view === "sheet" ? (
        <>
          {/* شريط المرضى — لوحةُ الراقدين مصغَّرةً وفوق الورقة دائماً.
              عليه ما يُغني عن فتح ورقة أحد: كم فات وكم حان عند كلٍّ منهم،
              والتبديل ضغطةٌ واحدة بلا رجوعٍ لشاشةٍ أخرى. وهذا فرقُ عيادةٍ
              فيها ثلاثة راقدين عن مستشفًى فيه ستّون: هناك تلزم لوحةٌ قائمة
              بذاتها، وهنا يكفي شريط. */}
          {/* الجولة — الفعل الذي تُفتَح الشاشة من أجله.
              الشبكة خريطةٌ تُقرأ، والجولة طريقٌ يُمشى: مهمّةٌ واحدة بملء
              الشاشة بترتيب الأقفاص. وهي **فوق** الشريط لا داخله: أوّل ما
              يقع عليه النظر أوّل ما يُفعَل. */}
          {roundDue > 0 && (
            <button type="button" data-roundopen onClick={() => { playTap(); setRoundOpen(true); }}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-start text-white shadow-soft transition hover:bg-brand-700 active:scale-[.995]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20">
                <Stethoscope size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{t("charts.startRound", "ابدأ الجولة")}</span>
                <span className="block text-2xs text-white/80">
                  {t("charts.roundCount", { n: formatNum(roundDue), defaultValue: "{{n}} مهمة تنتظر — واحدة بالشاشة بترتيب الأقفاص" })}
                </span>
              </span>
              <ChevronLeft size={18} className="shrink-0 text-white/70 rtl:rotate-180" />
            </button>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-surface-1 p-1.5">
            <button type="button" data-focuspet="all" onClick={() => { playTap(); setFocusPet(null); }}
              className={cn("rounded-xl px-3.5 text-xs font-bold transition",
                focusPet === null ? "bg-ink text-surface-1" : "text-ink-muted hover:bg-surface-2")}
              style={{ minHeight: 44 }}>
              {t("charts.allPatients", "الكل")}
            </button>
            {flowPatients.map((p) => {
              const c = petCounts.get(p.petId);
              const on = focusPet === p.petId;
              return (
                <button key={p.petId} type="button" data-focuspet={p.petId}
                  onClick={() => { playTap(); setFocusPet(p.petId); }}
                  className={cn("flex items-center gap-2 rounded-xl px-2.5 transition",
                    on ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2")}
                  style={{ minHeight: 44 }}>
                  {p.pet && <PetAvatar pet={p.pet} size={26} className="shrink-0 rounded-lg" />}
                  <span className="max-w-[9rem] truncate text-xs font-extrabold" dir="auto">{p.pet?.name ?? "—"}</span>
                  {p.cage && (
                    <span className={cn("rounded px-1 font-mono text-[10px] font-bold",
                      on ? "bg-white/20" : "bg-surface-2 text-ink-subtle")}>{p.cage}</span>
                  )}
                  {c && c.overdue > 0 ? (
                    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-black tabular-nums",
                      on ? "bg-white text-danger-700" : "bg-danger-500 text-white")}>{formatNum(c.overdue)}</span>
                  ) : c && c.due > 0 ? (
                    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-black tabular-nums",
                      on ? "bg-white text-warn-700" : "bg-warn-500 text-white")}>{formatNum(c.due)}</span>
                  ) : c && c.total > 0 ? (
                    <CheckCircle2 size={15} className={on ? "text-white/90" : "text-success-600"} />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* عنوان المريض المركَّز وزرُّ إضافته — بديلُ شريطه داخل الورقة */}
          {focusPet && sheetPatients[0] && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-1 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-extrabold leading-tight text-ink" dir="auto">
                  {sheetPatients[0].pet?.name ?? "—"}
                </p>
                <p className="truncate text-2xs text-ink-subtle">
                  {[sheetPatients[0].cage, sheetPatients[0].room,
                    activeCharts.find((c) => c.petId === focusPet)?.title].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button size="sm" className="ms-auto" style={{ minHeight: 44 }}
                leftIcon={<Plus size={15} />} onClick={() => { playTap(); setAddHour(null); setAddFor(focusPet); }}>
                {t("charts.addOrder", "إضافة علاج")}
              </Button>
            </div>
          )}

          {/* شريط التجميع — يظهر مع «الكل» وحده: مريضٌ واحد لا يُجمَّع.
              و«حسب ترتيب الأقفاص» يقرأ التخطيط الذي رسمه بغرفة الأقفاص:
              يمشي بالممر فتتقدّم الورقة معه. */}
          {focusPet === null && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
            <span className="text-2xs font-extrabold text-ink-muted">{t("flow.groupBy", "الترتيب:")}</span>
            {([
              ["cage", t("flow.gCage", "حسب ترتيب الأقفاص")],
              ["acuity", t("flow.gAcuity", "حسب الحدّة")],
              ["none", t("flow.gNone", "بلا تجميع")],
            ] as [GroupBy, string][]).map(([g, label]) => (
              <button key={g} type="button" data-group={g} onClick={() => pickGroup(g)}
                className={cn("rounded-full px-3 py-1 text-2xs font-bold transition",
                  grouping === g ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
                {label}
              </button>
            ))}
            <span className="ms-auto text-2xs font-bold text-ink-subtle">
              {t("flow.rowsHint", "كل صفٍّ أمرٌ واحد — والخانة ساعة تنفيذه")}
            </span>
          </div>
          )}

          <Flowsheet
            patients={sheetPatients}
            entries={boardTreatments}
            todayISO={todayISO}
            nowHHMM={nowHHMM}
            groupLabel={focusPet === null ? flowGroupLabel : undefined}
            focused={focusPet !== null}
            onGive={flowGive}
            onUndo={flowUndo}
            onValue={flowValue}
            onMissed={flowMissed}
            onAddTask={(petId) => { setAddHour(null); setAddFor(petId); }}
            onAddAt={(petId, hour) => { setAddHour(hour); setAddFor(petId); }}
            onOpenPet={(petId) => {
              const c = activeCharts.find((x) => x.petId === petId);
              if (c) void openChart(c);
            }}
          />

          {addFor && (
            <AddTaskSheet
              petName={pets[addFor]?.name ?? t("charts.theAnimal", "الحيوان")}
              todayISO={todayISO}
              presetHour={addHour}
              weightKg={pets[addFor]?.current_weight_kg ?? null}
              species={pets[addFor]?.species}
              onClose={() => setAddFor(null)}
              onAdd={(rows) => { void flowAdd(addFor, rows); setAddFor(null); }}
            />
          )}
        </>
      ) : view === "cards" ? (
        <>
          {/* Colour key — a colour language nobody explained is just decoration */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2">
            <span className="text-2xs font-extrabold text-ink-muted">{t("charts.sortLegend", "الفرز:")}</span>
            {(Object.keys(ACUITY) as Acuity[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
                <span className={cn("h-2.5 w-2.5 rounded-full", ACUITY[k].dot)} aria-hidden />
                {acuityLabel(t, k)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-danger-600 dark:text-danger-300">
              <span className="h-2.5 w-2.5 animate-pulse-ring rounded-full bg-danger-500" aria-hidden />
              {t("charts.blinkLegend", "يومض = جرعة متأخّرة")}
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
                    <h2 className="text-sm font-extrabold text-ink">{bucketLabel(t, b.key)}</h2>
                    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-black", b.badge)}>{formatNum(items.length)}</span>
                  </div>
                  {/* نفس شبكة لوحة الأقفاص: عرضٌ طبيعي للبطاقة بدل تمطيطها على أعمدة
                      ثابتة، **وفرجةٌ رأسية واسعة** لأن لافتة الرقم تبرز فوق حافة
                      البطاقة — بفرجةٍ ضيقة تصطدم بالبطاقة التي فوقها. */}
                  <div className="grid gap-x-6 gap-y-9 pt-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
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

      {/* وضع الجولة — شاشةٌ كاملة فوق كل شيء، تُغلق فترجع الورقة كما هي */}
      {roundOpen && (
        <RoundMode
          entries={boardTreatments}
          petOf={(id) => pets[id]}
          cageOf={(id) => flowPatients.find((p) => p.petId === id)?.cage ?? null}
          todayISO={todayISO}
          nowHHMM={nowHHMM}
          onGive={flowGive}
          onValue={flowValue}
          onMissed={(e, reason) => flowMissed(e, reason)}
          onClose={() => { setRoundOpen(false); playTap(); }}
        />
      )}

      {/* سجل عمليات هذا الشهر */}
      <Modal open={surgOpen} onClose={() => setSurgOpen(false)} title={t("charts.surgModalTitle", { n: formatNum(monthSurgeries.length), defaultValue: "العمليات الجراحية — هذا الشهر ({{n}})" })}>
        {monthSurgeries.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-ink-muted">{t("charts.surgEmpty", "لا عمليات مسجلة هذا الشهر — تُسجل من داخل سجل الحالة بزر «تسجيل عملية».")}</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {monthSurgeries.map((x) => (
              <button key={x.id} onClick={() => { playTap(); navigate(`/pet/${x.pet_id}`); }} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-3 text-start transition hover:border-rose-300">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><Slice size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-ink">{x.name}</span>
                  <span className="block text-2xs font-bold text-ink-subtle">{pets[x.pet_id]?.name ?? "—"} · {formatDate(x.performed_at, lang)}{x.surgeon ? ` · ${x.surgeon}` : ""}</span>
                </span>
                {x.outcome === "success" && <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-black text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("charts.surgSuccess", "ناجحة")}</span>}
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
  const { t } = useTranslation();
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
    : c.overdue > 0 ? { cls: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300", icon: <AlertTriangle size={13} />, text: t("charts.nOverdue", { n: formatNum(c.overdue), defaultValue: "{{n}} متأخّرة" }) }
    : c.dueToday > 0 ? { cls: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300", icon: <Pill size={13} />, text: t("charts.nDueToday", { n: formatNum(c.dueToday), defaultValue: "{{n}} مستحقّة اليوم" }) }
    : doneToday ? { cls: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300", icon: <CheckCircle2 size={13} />, text: t("charts.doneToday", "تم علاج اليوم") }
    : c.total > 0 && c.doneTotal === c.total ? { cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", icon: <CheckCircle2 size={13} />, text: t("charts.planComplete", "مكتمل") }
    : c.total > 0 ? { cls: "bg-surface-2 text-ink-muted", icon: <CheckCircle2 size={13} />, text: t("charts.noDosesToday", "لا جرعات اليوم") }
    : { cls: "bg-surface-2 text-ink-subtle", icon: <ClipboardList size={13} />, text: t("charts.noPlanYet", "لا توجد خطة بعد") };

  /* اللافتة تحمل رقم القفص إن كان الحيوان راقداً، وإلا يومَ الخطة. الفكرة
   * واحدة بالحالتين: **هويةٌ قصيرة تُقرأ من بعيد** قبل أي تفصيل — تماماً
   * كما تفعل لافتة القفص. وتوحيدُ المكوّن نفسه (لا نسخةٌ شبيهة) يضمن أن
   * أيَّ تحسينٍ للافتة يصل الشاشتين معاً. */
  const plate = c.cage
    ? String(c.cage)
    : t("charts.dayN", { n: formatNum(day), defaultValue: "اليوم {{n}}" });

  return (
    <button type="button" onClick={onOpen} disabled={busy}
      className={cn(
        "group relative flex min-h-[248px] flex-col rounded-3xl border px-4 pb-4 pt-9 text-center shadow-soft transition hover:shadow-lg disabled:opacity-60",
        meta.card,
        doneToday
          ? "bg-teal-50/60 ring-1 ring-teal-300/60 hover:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-500/30"
          : "bg-surface-1 hover:border-brand-300",
        blink && "animate-pulse-ring",
      )}>
      {/* شريط القمة — حدّة الحالة تُلمح قبل أن تُقرأ */}
      <span className={cn("absolute inset-x-8 top-0 h-1 rounded-b-full", meta.stripe)} aria-hidden />
      <Nameplate code={plate} />

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <span className={cn("grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-surface-2 ring-4", meta.ring)}>
          {c.pet
            ? <PetAvatar pet={c.pet} size={80} className="h-full w-full rounded-full" />
            : <span className="text-4xl leading-none">{SPECIES_EMOJI.other}</span>}
        </span>
        <p className="max-w-full truncate font-display text-lg font-extrabold leading-tight text-ink">{c.pet?.name ?? "—"}</p>
        {/* اليوم يُذكر هنا **فقط** حين تحمل اللافتة رقم قفصٍ بدلاً منه — وإلا
            لتكرّر الرقم مرّتين على بطاقةٍ واحدة بلا فائدة. */}
        <p className="text-xs text-ink-subtle">
          {c.pet ? speciesLabel(t, c.pet.species) : ""}
          {c.cage ? ` · ${t("charts.dayN", { n: formatNum(day), defaultValue: "اليوم {{n}}" })}` : ""}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {c.condition === "critical" && (
            <span className={cn("chip text-2xs font-black", ACUITY.critical.chip)}>{t("charts.acuityCritical", "حرجة")}</span>
          )}
          {status
            ? <span className={cn("chip inline-flex items-center gap-1 text-2xs font-black", status.cls, blink && "animate-pulse")}>{status.icon} {status.text}</span>
            : <span className="h-[24px] w-24 animate-pulse rounded-full bg-surface-2" />}
        </div>

        {/* خطّة العلاج — سطرٌ خافت لا يزاحم الاسم، وهو ما يميّز طبلةً عن أخرى */}
        <p className="line-clamp-2 max-w-full px-1 text-2xs font-semibold leading-snug text-ink-muted">{c.title}</p>
      </div>

      {/* الفعل ظاهرٌ دائماً — الآيباد ما عنده تحويم. عنصرُ زينةٍ لا زر:
          البطاقة نفسها زرٌّ، وزرٌّ داخل زرٍّ تركيبٌ غير صالح. */}
      <span className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-xs font-bold text-ink-muted transition group-hover:bg-surface-3 group-hover:text-ink">
        {busy
          ? <Loader2 size={14} className="animate-spin text-brand-600" />
          : <><ClipboardList size={14} /> {t("charts.openPlan", "افتح الخطة")}
            <ChevronLeft size={13} className="text-ink-subtle rtl:rotate-180" /></>}
      </span>
      <span className="mt-1.5 inline-flex items-center justify-center gap-1 text-2xs font-bold text-ink-subtle">
        <Clock size={10} /> {formatDate(c.since, lang)}
      </span>
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
function doseSummary(t: TFunction, tx: TreatmentEntry[]): string | null {
  if (!tx.length) return null;
  const done = tx.filter((x) => x.administered_at).length;
  const pct = Math.round((done / tx.length) * 100);
  return t("charts.doseSummary", { done: formatNum(done), total: formatNum(tx.length), pct: formatNum(pct), defaultValue: "انعطت {{done}} من {{total}} جرعة ({{pct}}٪)" });
}

/* ── سكشن الحالات: الطبلات الي خلص علاجها وانسكّرت بنتيجة ────────────────── */
function CasesSection({ cases, pets, lang, txForVisit, onOpen }: {
  cases: ClinicVisit[];
  pets: Record<string, Pet>;
  lang: string;
  txForVisit: (visitId: string) => TreatmentEntry[];
  onOpen: (v: ClinicVisit) => void;
}) {
  const { t } = useTranslation();
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const shown = outcomeFilter === "all" ? cases : cases.filter((v) => v.outcome === outcomeFilter);
  const outcomesHere = OUTCOMES.filter((o) => o.id !== "under_treatment" && o.id !== "lost_followup" && cases.some((v) => v.outcome === o.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-extrabold text-ink-muted">{t("charts.outcomeFilter", "النتيجة:")}</span>
        <FilterChip active={outcomeFilter === "all"} label={t("charts.all", "الكل")} count={cases.length} onClick={() => { playTap(); setOutcomeFilter("all"); }} />
        {outcomesHere.map((o) => (
          <FilterChip key={o.id} active={outcomeFilter === o.id} label={`${o.emoji} ${o.label}`} count={cases.filter((v) => v.outcome === o.id).length}
            onClick={() => { playTap(); setOutcomeFilter(o.id); }} />
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <Archive size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">{t("charts.casesEmpty", "ماكو حالات منتهية بعد")}</p>
          <p className="mt-1 text-xs text-ink-subtle">{t("charts.casesEmptyHint", "لما تنهي زيارة وتسجل نتيجتها (شُفي، مزمنة…) تنتقل الطبلة إلى هنا تلقائياً.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((v) => {
            const pet = pets[v.pet_id];
            const o = outcomeMeta(v.outcome);
            const tx = txForVisit(v.id);
            const ds = doseSummary(t, tx);
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
                  <span className="block truncate text-2xs font-semibold text-ink-muted">{v.reason?.trim() || t("charts.noDiagnosis", "بلا تشخيص مسجّل")}</span>
                  <span className="block text-2xs text-ink-subtle">
                    {formatDate(v.opened_at, lang)} ← {v.ended_at ? formatDate(v.ended_at, lang) : "—"} · {t("charts.txDurationDays", { n: formatNum(days), defaultValue: "مدة العلاج {{n}} يوم" })}{ds ? ` · ${ds}` : ""}
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
  const { t } = useTranslation();
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
        {t("charts.deceasedIntro", "الحالات المنتهية بالوفاة 🕊️ — تنتقل هنا تلقائياً لما تُنهى الزيارة بنتيجة «متوفى». سبب الوفاة يُقرأ من ملاحظة الإغلاق، وتگدر تكتبه أو تعدّله من هنا مباشرة. الحيوان المتوفى تسكت عنه التهاني والتذكيرات تلقائياً بكل السستم.")}
      </p>
      {deceased.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-10 text-center">
          <HeartCrack size={40} className="mx-auto mb-3 text-ink-subtle" />
          <p className="text-sm font-bold text-ink">{t("charts.deceasedEmpty", "ماكو وفيات مسجّلة")}</p>
          <p className="mt-1 text-xs text-ink-subtle">{t("charts.deceasedEmptyHint", "نتمنى تضل هالصفحة فارغة دائماً 🤍")}</p>
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
                      <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-extrabold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("charts.deceasedTag", "🕊️ متوفى")}</span>
                      <span className="text-2xs text-ink-subtle">{pet ? speciesLabel(t, pet.species) : ""}</span>
                    </div>
                    <div className="text-2xs font-semibold text-ink-muted">{v.reason?.trim() ? t("charts.diagnosisIs", { dx: v.reason, defaultValue: "التشخيص: {{dx}}" }) : t("charts.noDiagnosis", "بلا تشخيص مسجّل")}</div>
                    <div className="text-2xs text-ink-subtle">
                      {t("charts.deceasedTimeline", { admitted: formatDate(v.opened_at, lang), died: v.ended_at ? formatDate(v.ended_at, lang) : "—", n: formatNum(days), defaultValue: "دخل {{admitted}} · توفّى {{died}} · بعد {{n}} يوم علاج" })}
                      {v.ended_by ? ` · ${t("charts.recordedBy", { name: v.ended_by, defaultValue: "سجّلها {{name}}" })}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpen(v)}
                    className="shrink-0 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">{t("charts.fullRecord", "السجل الكامل")}</button>
                </div>

                {/* سبب الوفاة — يُعرض دائماً، ويتحرر بضغطة */}
                <div className="mt-2 flex items-center gap-1.5">
                  {editing ? (
                    <>
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void save(v); if (e.key === "Escape") setEditId(null); }}
                        placeholder={t("charts.causePh", "سبب الوفاة… (مثال: فشل كلوي حاد رغم المحاليل)")}
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
                        {v.summary?.trim() ? t("charts.causeIs", { cause: v.summary, defaultValue: "سبب الوفاة: {{cause}}" }) : t("charts.causeMissing", "سبب الوفاة غير مسجّل — اضغط القلم لتوثيقه")}
                      </span>
                      <button type="button" onClick={() => { playTap(); setEditId(v.id); setDraft(v.summary ?? ""); }} title={t("charts.editCause", "تعديل سبب الوفاة")}
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
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      {/* المشتبه بانقطاعهم — بعدهم بالسجل النشط، والقرار للدكتور */}
      {stalled.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><AlertTriangle size={15} /></span>
            <h2 className="text-sm font-extrabold text-ink">{t("charts.stalledTitle", "يبينون منقطعين — قرّر بيهم")}</h2>
            <span className="rounded-full bg-warn-100 px-2 py-0.5 text-2xs font-black text-warn-700 dark:bg-warn-500/20 dark:text-warn-300">{formatNum(stalled.length)}</span>
          </div>
          <p className="mb-2 text-2xs text-ink-subtle">{t("charts.stalledHint", "طبلات نشطة ما انعطت منها ولا جرعة من ٤٨ ساعة وأكثر وعليها جرعات متأخرة. ذكّر صاحبها بالواتساب، أو علّمها منقطعة فتنتقل لهذا السكشن رسمياً.")}</p>
          <div className="space-y-2">
            {stalled.map(({ chart: c, lastGiven, remaining, sinceDays }) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-300 bg-warn-50/50 p-3 dark:border-warn-500/30 dark:bg-warn-500/5">
                <CardAvatar pet={c.pet} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-ink">{c.pet?.name ?? "—"}</div>
                  <div className="truncate text-2xs font-semibold text-ink-muted">{c.title}</div>
                  <div className="text-2xs font-bold text-warn-700 dark:text-warn-300">
                    {lastGiven ? t("charts.lastDoseNDays", { n: formatNum(sinceDays), defaultValue: "آخر جرعة قبل {{n}} يوم" }) : t("charts.noDoseSinceNDays", { n: formatNum(sinceDays), defaultValue: "ولا جرعة انعطت من {{n}} يوم" })} · {t("charts.remainingNDoses", { n: formatNum(remaining), defaultValue: "باقي {{n}} جرعة" })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.pet?.owner_phone && (
                    <button type="button" onClick={() => onNudge(c.pet, remaining)} title={t("charts.nudgeTitle", "ذكّر صاحبه بالواتساب")}
                      className="inline-flex items-center gap-1 rounded-full bg-success-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-success-700">
                      <MessageCircle size={12} /> {t("charts.nudge", "ذكّر")}
                    </button>
                  )}
                  <button type="button" onClick={() => onOpenChart(c)}
                    className="rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">{t("charts.openChart", "افتح الطبلة")}</button>
                  <button type="button" onClick={() => onMarkLost(c, remaining)} disabled={busyId === c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-warn-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-warn-700 disabled:opacity-50">
                    {busyId === c.id ? <Loader2 size={12} className="animate-spin" /> : <DoorOpen size={12} />} {t("charts.markLost", "علّمها منقطعة")}
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
          <h2 className="text-sm font-extrabold text-ink">{t("charts.lostTitle", "منقطعون عن المراجعة")}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-black text-ink-subtle">{formatNum(lost.length)}</span>
        </div>
        {lost.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface-1 p-6 text-center text-xs text-ink-subtle">
            {t("charts.lostEmpty", "ماكو حالات معلّمة منقطعة — وهذا خبر زين 🌟")}
          </div>
        ) : (
          <div className="space-y-2">
            {lost.map((v) => {
              const pet = pets[v.pet_id];
              const tx = txForVisit(v.id);
              const remaining = tx.filter((x) => !x.administered_at).length;
              const ds = doseSummary(t, tx);
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-1 p-3 shadow-card">
                  <CardAvatar pet={pet} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-ink">{pet?.name ?? "—"}</div>
                    <div className="truncate text-2xs font-semibold text-ink-muted">{v.reason?.trim() || t("charts.noDiagnosis", "بلا تشخيص مسجّل")}</div>
                    <div className="text-2xs text-ink-subtle">
                      {t("charts.lostOn", { d: v.ended_at ? formatDate(v.ended_at, lang) : "—", defaultValue: "انقطع بتاريخ {{d}}" })}{ds ? ` · ${ds}` : ""}{remaining > 0 ? ` · ${t("charts.dosesLeftN", { n: formatNum(remaining), defaultValue: "بقيت {{n}} جرعة" })}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {pet?.owner_phone && (
                      <button type="button" onClick={() => onNudge(pet, remaining)} title={t("charts.nudgeTitle", "ذكّر صاحبه بالواتساب")}
                        className="inline-flex items-center gap-1 rounded-full bg-success-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-success-700">
                        <MessageCircle size={12} /> {t("charts.nudge", "ذكّر")}
                      </button>
                    )}
                    <button type="button" onClick={() => onOpenVisit(v)}
                      className="rounded-full border border-line bg-surface-1 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">{t("charts.record", "السجل")}</button>
                    <button type="button" onClick={() => onRestore(v)} disabled={busyId === v.id}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-2xs font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-50">
                      {busyId === v.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} {t("charts.restore", "رجّعها نشطة")}
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
  const { t } = useTranslation();
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
    parts.push(`${t("charts.dayN", { n: formatNum(day), defaultValue: "اليوم {{n}}" })}${days > 0 ? ` ${t("charts.ofPlanDays", { n: formatNum(days), defaultValue: "من خطة {{n}} يوم" })}` : ""}`);
    if (tx.length) {
      const done = tx.filter((x) => x.administered_at).length;
      parts.push(t("charts.doseSummary", { done: formatNum(done), total: formatNum(tx.length), pct: formatNum(Math.round((done / tx.length) * 100)), defaultValue: "انعطت {{done}} من {{total}} جرعة ({{pct}}٪)" }));
      if (c.overdue > 0) parts.push(t("charts.rptOverdueNow", { n: formatNum(c.overdue), defaultValue: "{{n}} متأخرة هسة" }));
      else if (c.dueToday > 0) parts.push(t("charts.rptDueToday", { n: formatNum(c.dueToday), defaultValue: "{{n}} مستحقة اليوم" }));
      else if (c.todayTotal > 0) parts.push(t("charts.rptDayDone", "يومها مكتمل ✓"));
      const given = tx.filter((x) => x.administered_at).map((x) => x.administered_at!).sort();
      const lastAt = given[given.length - 1];
      if (lastAt) {
        const h = Math.round((Date.now() - new Date(lastAt).getTime()) / 3600000);
        parts.push(h < 1 ? t("charts.lastDoseJustNow", "آخر جرعة قبل شوية") : h < 24 ? t("charts.lastDoseNHours", { n: formatNum(h), defaultValue: "آخر جرعة قبل {{n}} ساعة" }) : t("charts.lastDoseNDays", { n: formatNum(Math.floor(h / 24)), defaultValue: "آخر جرعة قبل {{n}} يوم" }));
      } else parts.push(t("charts.noDoseYet", "بعد ما انعطت ولا جرعة"));
    } else parts.push(t("charts.noTxPlanYet", "بلا خطة علاج بعد"));
    if (c.condition === "critical") parts.push(t("charts.criticalFlag", "⚠️ حالتها حرجة"));
    return parts.join(t("charts.listSep", "، ")) + ".";
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
        <Kpi label={t("charts.kpiDaily", "طبلة يومية نشطة")} value={formatNum(charts.filter((c) => c.bucket === "daily").length)} />
        <Kpi label={t("charts.kpiCareBoarding", "فندقة علاجية نشطة")} value={formatNum(charts.filter((c) => c.bucket === "careBoarding").length)} />
        <Kpi label={t("charts.kpiTodayAdherence", "امتثال جرعات اليوم")} value={todayPct === null ? "—" : t("charts.pctValue", { n: formatNum(todayPct), defaultValue: "{{n}}٪" })} tone={todayPct !== null && todayPct < 60 ? "warn" : undefined} />
        <Kpi label={t("charts.kpiOverdueNow", "جرعة متأخرة الآن")} value={formatNum(overdueDoses)} tone={overdueDoses > 0 ? "danger" : "success"} />
        <Kpi label={t("charts.kpiClosedMonth", "حالة انتهت هذا الشهر")} value={formatNum(monthClosed.length)} />
        <Kpi label={t("charts.kpiRecoveryRate", "نسبة الشفاء (هذا الشهر)")} value={recoveredPct === null ? "—" : t("charts.pctValue", { n: formatNum(recoveredPct), defaultValue: "{{n}}٪" })} tone={recoveredPct !== null && recoveredPct >= 70 ? "success" : undefined} />
        <Kpi label={t("charts.kpiDeceasedMonth", "وفيات هذا الشهر 🕊️")} value={formatNum(monthDeceased.length)} tone={monthDeceased.length > 0 ? "danger" : "success"} />
        <Kpi label={t("charts.kpiAvgDuration", "متوسط مدة العلاج")} value={avgDays === null ? "—" : t("charts.nDays", { n: formatNum(avgDays), defaultValue: "{{n}} يوم" })} />
        <Kpi label={t("charts.kpiLostTotal", "منقطعون (كلي + مشتبه)")} value={formatNum(lost.length + stalled.length)} tone={lost.length + stalled.length > 0 ? "warn" : "success"} />
      </div>

      {/* وصف دقيق لكل طبلة نشطة — الأسوأ أولاً */}
      <section className="rounded-2xl border border-line bg-surface-1 p-4 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><FileText size={15} /></span>
          <h2 className="text-sm font-extrabold text-ink">{t("charts.rptActiveTitle", "وضع الطبلات النشطة — بالتفصيل")}</h2>
          {!txLoaded && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
        </div>
        {treatingCharts.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-subtle">{t("charts.rptActiveEmpty", "ماكو طبلات علاجية نشطة حالياً.")}</p>
        ) : (
          <div className="divide-y divide-line/60">
            {worstFirst.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 py-2.5">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", ACUITY[acuityOf(c, txLoaded)].dot)} aria-hidden />
                <div className="min-w-0 text-xs leading-relaxed">
                  <span className="font-black text-ink">{c.pet?.name ?? "—"}</span>
                  <span className="text-ink-subtle"> ({c.pet ? speciesLabel(t, c.pet.species) : "—"}{c.title !== "—" ? ` · ${c.title}` : ""})</span>
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
          <h2 className="text-sm font-extrabold text-ink">{t("charts.rptLostTitle", "المنقطعون والحالات المنتهية")}</h2>
        </div>
        <div className="space-y-1.5 text-xs leading-relaxed">
          {stalled.map(({ chart: c, remaining, sinceDays, lastGiven }) => (
            <p key={c.id} className="text-warn-700 dark:text-warn-300">
              <span className="font-black">{c.pet?.name ?? "—"}</span>
              <span className="font-semibold"> — {t("charts.rptStalled", { last: lastGiven ? t("charts.lastDoseNDays", { n: formatNum(sinceDays), defaultValue: "آخر جرعة قبل {{n}} يوم" }) : t("charts.noDoseNDays", { n: formatNum(sinceDays), defaultValue: "ولا جرعة من {{n}} يوم" }), n: formatNum(remaining), defaultValue: "يبين منقطع: {{last}}، باقي {{n}} جرعة ما انعطت." })}</span>
            </p>
          ))}
          {lost.map((v) => {
            const tx = txForVisit(v.id);
            const remaining = tx.filter((x) => !x.administered_at).length;
            return (
              <p key={v.id} className="text-ink-muted">
                <span className="font-black text-ink">{pets[v.pet_id]?.name ?? "—"}</span>
                <span className="font-semibold"> — {t("charts.rptLost", { d: v.ended_at ? formatDate(v.ended_at, lang) : "—", defaultValue: "منقطع رسمياً من {{d}}" })}{remaining > 0 ? t("charts.rptLostRemaining", { n: formatNum(remaining), defaultValue: "، وقف علاجه على {{n}} جرعة متبقية" }) : ""}.</span>
              </p>
            );
          })}
          {monthDeceased.map((v) => (
            <p key={v.id} className="text-danger-700 dark:text-danger-300">
              <span className="font-black">{pets[v.pet_id]?.name ?? "—"}</span>
              <span className="font-semibold"> — {t("charts.rptDeceased", { n: formatNum(durationDays(v.opened_at, v.ended_at)), defaultValue: "توفّى 🕊️ بعد {{n}} يوم علاج" })}{v.summary?.trim() ? t("charts.rptCause", { cause: v.summary, defaultValue: "، السبب: {{cause}}" }) : t("charts.rptCauseMissing", "، سبب الوفاة غير مسجّل")}.</span>
            </p>
          ))}
          {monthCases.map((v) => {
            const o = outcomeMeta(v.outcome);
            const ds = doseSummary(t, txForVisit(v.id));
            return (
              <p key={v.id} className="text-ink-muted">
                <span className="font-black text-ink">{pets[v.pet_id]?.name ?? "—"}</span>
                <span className="font-semibold"> — {t("charts.rptEnded", "انتهت")} {o ? t("charts.rptWithOutcome", { label: o.label, emoji: o.emoji, defaultValue: "بـ«{{label}}» {{emoji}}" }) : ""} {t("charts.rptAfterDays", { n: formatNum(durationDays(v.opened_at, v.ended_at)), defaultValue: "بعد {{n}} يوم علاج" })}{ds ? ` (${ds})` : ""}.</span>
              </p>
            );
          })}
          {stalled.length === 0 && lost.length === 0 && monthClosed.length === 0 && (
            <p className="py-2 text-center text-ink-subtle">{t("charts.rptEmpty", "ماكو حركة منتهية أو منقطعة هذا الشهر بعد.")}</p>
          )}
        </div>
        {monthAdherence !== null && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-2xs font-bold text-ink-muted">
            {t("charts.rptAdherence", { n: formatNum(monthAdherence), defaultValue: "معدل إنجاز جرعات الحالات المنتهية هذا الشهر: {{n}}٪." })}
          </p>
        )}
      </section>
    </div>
  );
}
