/* ============================================================================
 * الزيارة — قلبُ حالة الحقل (docs/field-cases-plan.md §٧-د و§٩). مالكةُ نطاق flkv (المفردات: العلامات، البيئة،
 * الأعضاءُ وآفاتُها، الأمراض، التقرير)، ورفيقةُ flk (العامّ: الأنواع، الطرق، الأخطاء).
 *
 * سريعةٌ أو كاملة — الكاملةُ فوق السريعة لا شاشةٌ ثانية. والحفظُ ذرّيّ بنداءٍ واحد (الزيارةُ ونافقُها وتشريحُها
 * وتحصيناتُها، flock_visit_save) بمرجعٍ من الجهاز: انقطاعٌ ثمّ إعادةٌ ترجع ما انحفظ لا زيارةً ثانية. وما كُتب
 * مسودّةٌ على الجهاز من أوّل حرف (useFormDraft، لكلّ وجبةٍ نطاقُها) تُعرض «رجّعها/احذفها» ولا تُسترجع صامتة.
 *
 * والنافقُ «منذ آخر تسجيل» بالقاعة: يومُ الزيارة ورجوعاً حتى آخر يومٍ مسجّل — لا يتداخل مع «نافق اليوم» الذي
 * سجّله الاستقبال (الخادمُ يرفض التداخل)، والفراغُ «ما انسأل» لا صفر. والتشريحُ طيراً طيراً بشرائح وزرّ «طبيعي»
 * و«انسخ من السابق» وملخّصٍ يُحسب؛ واقتراحُ التشخيص منه **اقتراحٌ** يُنقر لا يُختم. ومرضٌ واجبُ التبليغ فرعٌ أحمر.
 * وتقريرُ المربي بعد الحفظ بضغطةٍ جديدة — sendWhatsApp أوّلُ ما يُنادى فيها (درسُ الآيفون ١٩/١٠).
 * ========================================================================= */
import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertTriangle, Camera, Copy, MessageCircle, Pencil, Plus, X } from "lucide-react";
import { Badge, Button, Dialog, useToast } from "@/components/ui";
import { LoadBoundary } from "@/components/LoadBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { useFormDraft } from "@/lib/useFormDraft";
import { page } from "@/lib/lazyPage";
import { cn, formatNum, localISO, searchable } from "@/lib/utils";
import { getClinicName, getDialCode } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { quotaMessage, sendWhatsApp, useWarmWaQuota } from "@/lib/quotas";
import { prepareUpload } from "@/lib/image";
import { describeUploadError, rejectedBeforeCommit } from "@/lib/errors";
import { flockApi, type FlockVisitInput } from "@/lib/flockApi";
import { addDays, ageOn, diffDays, dueOn, necropsySummary, withdrawalOf } from "@/lib/flockMath";
import type { FeedPhase, FlockBundle, FlockCompliance, FlockGrade, FlockSnapshot, FlockTrend, FlockVisit as Visit } from "@/lib/flockTypes";
import { ageLabel, dayLabel, flockError, localDay, newRef, num } from "./flockShared";
import { Choice } from "./FlockChoice";
import {
  NIL, findLesions, lesionText, lesionsOf, restNormal, splitTerm, systemState, systemsFor, toggleLesion, toggleNormal,
} from "./necropsy";

const loadPhotoSource = () => page(() => import("@/components/attach/Attach").then((m) => ({ default: m.PhotoSource })), ["att"]);
let PhotoSourceLazy = loadPhotoSource();

/* ── المفردات: رموزٌ ثابتة (تُخزَّن)، والأسماءُ بالقاموس (flkv) ───────────────────── */
const SIGNS: Record<string, string[]> = {
  resp: ["cough", "sneeze", "rales", "discharge", "face_swelling", "gasping"],
  neuro: ["tremor", "torticollis", "paralysis"],
  gi: ["diarrhea_white", "diarrhea_green", "diarrhea_watery", "diarrhea_bloody"],
  gen: ["depression", "huddling", "ruffled", "lameness", "low_feed", "low_water"],
  lay: ["drop", "misshapen", "thin_shell"],
};
const ENV = ["temp", "ventilation", "ammonia", "litter", "drinkers", "feeders", "density", "lighting", "biosecurity"];
// آفاتُ التشريح بأجهزة الجسم: necropsy.ts (قائمةُ المالك ٢٤/١١ فوق القديمة — الرمزُ القديم باقٍ برمزه).
const DX = ["crd", "colibacillosis", "nd", "nd_vel", "ai_h9", "hpai", "ib", "ibd", "coccidiosis", "ne", "hydropericardium", "ilt", "coryza", "pox", "salmonella", "aspergillosis", "ascites", "heat_stress", "mycotoxin", "nutritional"];
const NOTIFIABLE = new Set(["hpai", "nd_vel"]);
/** اقتراحٌ من التشريح (الملحق ب-٧): طيرٌ يطابق إن حمل كلَّ رموز إحدى المجموعات. اقتراحٌ يُنقر، لا تشخيص.
 *  وآفاتُ المالك الجديدة تقترح كما كانت القديمةُ تقترح (التهابُ الأكياس الهوائية كتعكّرها، الأمعاءُ النخرية، العقيداتُ الفطرية…). */
const RULES: { dx: string; any: string[][] }[] = [
  { dx: "colibacillosis", any: [["heart.pericarditis", "liver.perihepatitis"], ["heart.pericarditis", "lung.airsac_cloudy"], ["liver.perihepatitis", "lung.airsac_cloudy"],
    ["heart.pericarditis", "lung.airsacculitis"], ["liver.perihepatitis", "lung.airsacculitis"], ["heart.fibrin", "liver.perihepatitis"], ["gen.polyserositis"]] },
  { dx: "nd", any: [["prov.gland_hemorrhage"], ["gut.peyer_hemorrhage"]] },
  { dx: "ibd", any: [["bursa.edema"], ["bursa.yellow_exudate"], ["bursa.hemorrhage"]] },
  { dx: "coccidiosis", any: [["gut.orange_mucus"], ["gut.blood"], ["gut.white_spots"], ["gut.cecal_cores"], ["gut.coccidia"], ["gut.blood_casts"], ["ceca.hemorrhage"], ["ceca.petechiae"]] },
  { dx: "ne", any: [["gut.necrosis", "gut.distended"], ["gut.necrotic_enteritis"]] },
  { dx: "hydropericardium", any: [["heart.hydropericardium", "liver.enlarged"], ["heart.hydropericardium", "liver.friable"]] },
  { dx: "ib", any: [["lung.airsac_foamy", "kidney.urates"], ["kidney.swollen", "kidney.urates"], ["repro.cystic_oviduct"]] },
  { dx: "crd", any: [["lung.airsac_cloudy", "head.sinusitis"], ["lung.airsacculitis", "head.sinusitis"]] },
  { dx: "ilt", any: [["head.blood_casts"]] },
  { dx: "salmonella", any: [["gut.salmonella"]] },
  { dx: "aspergillosis", any: [["lung.fungal_nodules"]] },
  { dx: "ascites", any: [["heart.ascites"]] },
];
const PHASES: FeedPhase[] = ["prestarter", "starter", "grower", "finisher", "withdrawal", "layer", "other"];

/* ── المسودّة ─────────────────────────────────────────────────────────────── */
type Bird = { no: number; source: "dead" | "cull" | "sacrificed" | null; weight: string; findings: string[]; note: string };
type Draft = {
  v: 1; ref: string; at: string; kind: Visit["kind"]; quick: boolean;
  mort: Record<string, { dead: string; culled: string; days: string }>;
  feed: { phase: FeedPhase | ""; source: string; kg: string; water: string; weight: string; sample: string; temp: string; hum: string };
  signs: string[]; env: Record<string, FlockGrade>; birds: Bird[];
  dx: string; dxCodes: string[]; dxStatus: "suspected" | "confirmed" | ""; advice: string; notes: string;
  trend: FlockTrend | ""; next: string; comp: FlockCompliance; vaxGiven: Record<string, "vet" | "farmer" | "">;
};
const nowLocal = () => { const d = new Date(); return `${localISO(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const atLocal = (iso: string) => { const d = new Date(iso); return `${localISO(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const s = (n: number | undefined | null) => (n == null ? "" : String(n));
const optNum = (v: string): number | undefined => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const hk = (id: string | null) => id ?? "";

function emptyDraft(b: FlockBundle, quick: boolean): Draft {
  return {
    v: 1, ref: newRef(), at: nowLocal(), kind: "routine", quick,
    mort: Object.fromEntries((b.houses.length ? b.houses.map((h) => h.id) : [null]).map((id) => [hk(id), { dead: "", culled: "", days: "" }])),
    feed: { phase: "", source: "", kg: "", water: "", weight: "", sample: "", temp: "", hum: "" },
    signs: [], env: {}, birds: [], dx: "", dxCodes: [], dxStatus: "", advice: "", notes: "", trend: "", next: "", comp: {}, vaxGiven: {},
  };
}
function fromVisit(b: FlockBundle, v: Visit): Draft {
  const d = emptyDraft(b, v.quick);
  for (const m of b.mortality.filter((x) => x.visit_id === v.id)) d.mort[hk(m.house_id)] = { dead: String(m.dead), culled: String(m.culled), days: String(m.days) };
  const f = v.flock ?? {};
  return {
    ...d, ref: "", at: atLocal(v.at), kind: v.kind,
    feed: { phase: f.feed_phase ?? "", source: f.feed_source ?? "", kg: s(f.feed_kg_day), water: s(f.water_l_day), weight: s(f.avg_weight_g), sample: s(f.sample_n), temp: s(f.temp_c), hum: s(f.humidity_pct) },
    signs: v.signs, env: v.env, dx: v.dx ?? "", dxCodes: v.dx_codes, dxStatus: v.dx_status ?? "", advice: v.advice ?? "", notes: v.notes ?? "",
    trend: v.trend ?? "", next: v.next_visit_on ?? "", comp: v.compliance ?? {},
    birds: b.necropsy.filter((n) => n.visit_id === v.id).sort((x, y) => x.bird_no - y.bird_no)
      .map((n) => ({ no: n.bird_no, source: n.source, weight: s(n.weight_g), findings: n.findings, note: n.note ?? "" })),
  };
}
const draftEmpty = (d: Draft) => !d.signs.length && !d.birds.length && !d.dx.trim() && !d.dxCodes.length && !d.advice.trim() && !d.notes.trim()
  && !Object.values(d.mort).some((m) => m.dead.trim() || m.culled.trim()) && !Object.values(d.feed).some((x) => x.trim()) && !Object.keys(d.env).length;

/** الطبلاتُ التي يُسأل عن تطبيقها: بدأت قبل يوم الزيارة، وليست نسخةً قديمة. */
const askedTreatments = (b: FlockBundle, day: string) => b.treatments.filter((x) => x.status !== "replaced" && x.start_on < day);

export function FlockVisit({ b, visit, canEdit, canPhoto = false, onClose, onSaved, onChanged }: {
  b: FlockBundle; visit?: Visit; canEdit: boolean; canPhoto?: boolean; onClose: () => void; onSaved: (msg: string, saved?: Visit) => void; onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(!visit);
  if (visit && !editing) return <VisitView b={b} visit={visit} canEdit={canEdit} canPhoto={canPhoto} onEdit={() => setEditing(true)} onClose={onClose} onChanged={onChanged} />;
  return <VisitForm b={b} visit={visit} onClose={visit ? () => setEditing(false) : onClose} onSaved={onSaved} />;
}

/* ── النموذج ───────────────────────────────────────────────────────────────── */
function VisitForm({ b, visit, onClose, onSaved }: { b: FlockBundle; visit?: Visit; onClose: () => void; onSaved: (msg: string, saved?: Visit) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const c = b.case;
  const layer = c.kind === "layer" || c.kind === "breeder";
  const [d, setD] = useState<Draft>(() => (visit ? fromVisit(b, visit) : emptyDraft(b, true)));
  const [bird, setBird] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // فشلٌ مجهولُ المصير لزيارةٍ جديدة: ربما انحفظت بمرجعها — النموذجُ يُقفل على «أعد المحاولة» بما كُتب (درسُ 0264).
  const [locked, setLocked] = useState(false);
  // ما حمله النموذجُ عند فتحه: الحفظُ يستبدل نافقَ الزيارة وتشريحَها **كما رآهما** — لا ما وصل بحزمةٍ أُعيدت والنموذجُ
  // مفتوح (فتحٌ من حزمةٍ قبل الحفظ ثمّ «عدّل» كان يرسل [] فيمسحهما الخادم — مراجعةٌ عدائيّة).
  const loaded = useRef({
    mort: !!visit && b.mortality.some((m) => m.visit_id === visit.id),
    necro: !!visit && b.necropsy.some((n) => n.visit_id === visit.id),
  }).current;
  const draft = useFormDraft<Draft>({
    scope: user && !visit ? { form: `flockvisit-${c.id}`, clinic: user.clinic_id ?? user.id, user: user.id } : null,
    value: d, isEmpty: draftEmpty,
  });
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  /** كتابةٌ تُحسب من الحال الأحدث لا من المرسوم: نقرتان قبل أيّ رسمة (جذرُ createRoot يرسم بعد الحدث) كانت الثانيةُ منهما تحسب من
   *  القائمة المرسومة فتمسح الأولى — مقيسٌ بالمتصفّح (٢٥/١١): ثلاثُ علاماتٍ بلحظةٍ واحدة بقيت أخيرتُها. كلُّ قائمةٍ تُبدَّل بها (العلامات، الآفات،
   *  التشخيصات، البيئة، التطبيق، التحصين، الطيور) تمرّ من هنا. */
  const upd = (fn: (x: Draft) => Partial<Draft>) => setD((x) => ({ ...x, ...fn(x) }));
  const day = d.at.slice(0, 10);
  const today = localISO();
  const houses = b.houses.length ? [...b.houses].sort((x, y) => x.position - y.position) : [{ id: null as string | null, label: t("flk.wholeFlock"), placed_count: c.placed_count, position: 0 }];

  // النافقُ «منذ آخر تسجيل» بالقاعة: المدى غيرُ المسجَّل الذي ينتهي بيوم الزيارة (بلا صفوف هذه الزيارة إن كانت تعديلاً).
  // يومُ الزيارة نفسُه مسجَّلٌ بصفٍّ آخر ⇒ لا مدى؛ وصفٌّ **بعد** يوم الزيارة لا يقفلها — زيارةٌ بتاريخٍ سابق أُدخلت بعد أن
  // سجّل الاستقبالُ نافقَ اليوم كانت تُقفل وأيامُها قبلُ فارغة (مراجعةٌ عدائيّة).
  const gap = (houseId: string | null): { days: number; from: string } | null => {
    const rows = b.mortality.filter((m) => hk(m.house_id) === hk(houseId) && m.visit_id !== visit?.id);
    if (rows.some((m) => addDays(m.on_date, -(m.days - 1)) <= day && m.on_date >= day)) return null;
    const last = rows.filter((m) => m.on_date < day).reduce<string | null>((mx, m) => (!mx || m.on_date > mx ? m.on_date : mx), null);
    const n = last ? diffDays(last, day) : ageOn(c.placed_on, day);
    if (n < 1) return null;
    const days = Math.min(60, n);
    return { days, from: addDays(day, -(days - 1)) };
  };
  const suggestions = useMemo(() => RULES.map((r) => ({
    dx: r.dx, n: d.birds.filter((bd) => r.any.some((g) => g.every((code) => bd.findings.includes(code)))).length,
  })).filter((x) => x.n > 0 && !d.dxCodes.includes(x.dx)), [d.birds, d.dxCodes]);
  const summary = necropsySummary(d.birds);
  const notifiable = d.dxCodes.some((x) => NOTIFIABLE.has(x));
  const txs = askedTreatments(b, day);
  const dueVax = b.vax.filter((v) => v.status === "planned" && v.planned_age != null && dueOn(c.placed_on, v.planned_age) <= addDays(day, 3));

  const save = async () => {
    setErr(null);
    const at = new Date(d.at);
    if (!d.at || Number.isNaN(at.getTime())) { setErr(t("flk.err.flock_visit_date")); return; }
    const flock: FlockSnapshot = {};
    if (d.feed.phase) flock.feed_phase = d.feed.phase;
    if (d.feed.source.trim()) flock.feed_source = d.feed.source.trim();
    const nums: [keyof FlockSnapshot, string][] = [["feed_kg_day", d.feed.kg], ["water_l_day", d.feed.water], ["avg_weight_g", d.feed.weight], ["sample_n", d.feed.sample], ["temp_c", d.feed.temp], ["humidity_pct", d.feed.hum]];
    for (const [k, v] of nums) { const n = optNum(v); if (n != null) (flock as Record<string, unknown>)[k] = n; }
    const mortality: NonNullable<FlockVisitInput["mortality"]> = [];
    for (const h of houses) {
      const m = d.mort[hk(h.id)];
      if (!m || (!m.dead.trim() && !m.culled.trim())) continue;
      const g = gap(h.id);
      // رقمٌ بقاعةٍ يومُها مسجَّل: يُقال باسمها — لا يُرمى بصمت ولا يُرسل فيرفضه الخادمُ تداخلاً بكلّ حفظ.
      if (!g) { setErr(t("flkv.mortCovered", { house: h.label })); return; }
      const days = Math.trunc(Number(m.days.trim() || g.days));
      mortality.push({ house_id: h.id, on_date: day, days, dead: Math.trunc(Number(m.dead || 0)), culled: Math.trunc(Number(m.culled || 0)) });
    }
    const hadMort = loaded.mort, hadNecro = loaded.necro;
    const p: FlockVisitInput = {
      id: visit?.id, expect_updated_at: visit?.updated_at ?? null, client_ref: visit ? null : d.ref, case_id: c.id,
      at: at.toISOString(), kind: d.kind, quick: d.quick, flock, signs: d.signs, env: d.env,
      dx: d.dx.trim() || null, dx_codes: d.dxCodes, dx_status: d.dxStatus || null, notifiable,
      advice: d.advice.trim() || null, notes: d.notes.trim() || null, trend: d.trend || null, next_visit_on: d.next || null,
      compliance: d.comp,
      ...(mortality.length || hadMort ? { mortality } : {}),
      ...(d.birds.length || hadNecro ? { necropsy: d.birds.map((bd) => ({ bird_no: bd.no, source: bd.source, weight_g: optNum(bd.weight) ?? null, findings: bd.findings, note: bd.note.trim() || null })) } : {}),
      // المعروضُ وحده: تحصينٌ أُشّر ثمّ رُجع تاريخُ الزيارة فاختفى صفُّه لا يُختم منجَزاً بيومٍ قبل موعده.
      vax_given: Object.entries(d.vaxGiven).filter(([id, by]) => by && dueVax.some((v) => v.id === id)).map(([id, by]) => ({ id, given_on: day, given_by: by || "vet" })),
    };
    setBusy(true);
    try {
      const r = await flockApi.saveVisit(p);
      draft.clear();
      onSaved(r.replayed ? t("flkv.savedBefore") : t("flk.saved"), r.visit);
    } catch (e) {
      // ما انحفظ شيء (المعاملةُ كلُّها أو لا شيء) — أو مجهول: يُقفل على الإعادة. والمسودّةُ باقية بالجهاز.
      const unsure = !visit && !rejectedBeforeCommit(e);
      if (unsure) setLocked(true);
      setErr(`${flockError(e, t)}${unsure ? ` — ${t("flk.unknownFate")}` : visit ? "" : ` — ${t("flkv.draftKept")}`}`);
    } finally { setBusy(false); }
  };

  const toggle = (arr: string[], code: string) => (arr.includes(code) ? arr.filter((x) => x !== code) : [...arr, code]);
  const setBirdAt = (i: number, p: Partial<Bird> | ((b: Bird) => Partial<Bird>)) =>
    upd((x) => ({ birds: x.birds.map((b, j) => (j === i ? { ...b, ...(typeof p === "function" ? p(b) : p) } : b)) }));
  /** طيرٌ جديد بآخر القائمة — فارغ، أو «بنفس علامات» الطير `from` كما هي الآن (خمسةُ طيورٍ متشابهة لا تُعلَّم خمس مرّات). */
  const addBird = (from: number | null) => {
    upd((x) => {
      const src = from == null ? null : x.birds[from];
      const no = (x.birds[x.birds.length - 1]?.no ?? 0) + 1;
      return { birds: [...x.birds, { no, source: src ? src.source : "dead", weight: "", findings: src ? [...src.findings] : [], note: "" }] };
    });
    setBird(d.birds.length);
  };
  const cur = d.birds[bird];

  return (
    <Dialog open onClose={onClose} size="xl" title={visit ? t("flkv.editTitle") : t("flkv.newTitle")}
      description={<span>{ageLabel(t, c.placed_on, day)}{!visit && draft.saved !== "stopped" ? ` · ${t(draft.saved === "failed" ? "flkv.draftFailed" : "flkv.draftAuto")}` : ""}</span>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("flk.cancel")}</Button>
        <Button loading={busy} onClick={() => void save()} data-flock-save>{locked ? t("flk.retry") : t("flk.save")}</Button>
      </>}>
      <fieldset disabled={locked} className="min-w-0 space-y-5" data-flock-visit-form>
        {draft.offer && !visit && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10" data-flock-draft-offer>
            <span className="min-w-0 flex-1 font-bold text-ink">{t("flkv.draftOffer", { time: new Date(draft.offer.savedAt).toLocaleString() })}</span>
            <Button size="sm" onClick={() => { const r = draft.take(); if (r) setD(r.data); }}>{t("flkv.draftRestore")}</Button>
            <Button size="sm" variant="ghost" onClick={() => draft.dismiss()}>{t("flkv.draftDiscard")}</Button>
          </div>
        )}
        {err && <p className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm font-bold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200" data-flock-visit-error>{err}</p>}

        {/* الرأس: الوقت والنوع وسريعة/كاملة */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">{t("flkv.at")}</span>
            <input type="datetime-local" className="input" value={d.at} max={`${today}T23:59`} onChange={(e) => set({ at: e.target.value })} />
          </label>
          <div><span className="label">{t("flkv.kind")}</span>
            <Choice value={d.kind} options={["routine", "complaint", "followup"] as const} label={(k) => t(`flk.visitKind.${k}`)} onChange={(k) => set({ kind: k })} data="visit-kind" />
          </div>
          <div className="sm:col-span-2">
            <Choice value={d.quick ? "1" : "0"} options={["1", "0"] as const} label={(q) => (q === "1" ? t("flkv.quick") : t("flkv.full"))} onChange={(q) => set({ quick: q === "1" })} data="quick" />
          </div>
        </div>

        {/* ١ · القطيع اليوم */}
        <Section title={t("flkv.s1")}>
          <div className="space-y-2">
            {houses.map((h) => {
              const g = gap(h.id);
              const m = d.mort[hk(h.id)] ?? { dead: "", culled: "", days: "" };
              return (
                <div key={hk(h.id)} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-ink">
                    <span>{h.label}</span>
                    <span className="text-2xs font-normal text-ink-subtle">{g ? t("flkv.mortSince", { from: dayLabel(g.from, today), n: Number(m.days || g.days) }) : t("flkv.mortUpToDate")}</span>
                  </div>
                  {/* اسمُ الخانة فوقها لا بداخلها: «على كم يوم» كانت تُقصّ «على كم» بالهاتف، والاسمُ يختفي أوّلَ ما يُكتب رقم. */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block min-w-0"><span className="mb-1 block truncate text-xs font-bold text-ink-subtle">{t("flk.mort.dead")}</span>
                      <input type="number" inputMode="numeric" min={0} className="input" disabled={!g && !m.dead.trim() && !m.culled.trim()} value={m.dead} data-flock-v-dead
                        onChange={(e) => { const v = e.target.value, k = hk(h.id); upd((x) => ({ mort: { ...x.mort, [k]: { ...(x.mort[k] ?? { dead: "", culled: "", days: "" }), dead: v } } })); }} />
                    </label>
                    <label className="block min-w-0"><span className="mb-1 block truncate text-xs font-bold text-ink-subtle">{t("flk.mort.culled")}</span>
                      <input type="number" inputMode="numeric" min={0} className="input" disabled={!g && !m.dead.trim() && !m.culled.trim()} value={m.culled}
                        onChange={(e) => { const v = e.target.value, k = hk(h.id); upd((x) => ({ mort: { ...x.mort, [k]: { ...(x.mort[k] ?? { dead: "", culled: "", days: "" }), culled: v } } })); }} />
                    </label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs font-bold leading-tight text-ink-subtle">{t("flk.mort.days")}</span>
                      <input type="number" inputMode="numeric" min={1} max={60} className="input" placeholder={g ? String(g.days) : undefined} disabled={!g} value={m.days}
                        onChange={(e) => { const v = e.target.value, k = hk(h.id); upd((x) => ({ mort: { ...x.mort, [k]: { ...(x.mort[k] ?? { dead: "", culled: "", days: "" }), days: v } } })); }} />
                    </label>
                  </div>
                </div>
              );
            })}
            <p className="text-2xs text-ink-subtle">{t("flk.mort.blankHint")}</p>
          </div>
          <div className="mt-3"><span className="label">{t("flkv.feedPhase")}</span>
            <Chips value={d.feed.phase} options={PHASES} label={(p) => t(`flk.feedPhase.${p}`)} onChange={(p) => upd((x) => ({ feed: { ...x.feed, phase: x.feed.phase === p ? "" : p } }))} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label={t("flkv.feedSource")} value={d.feed.source} text onChange={(v) => upd((x) => ({ feed: { ...x.feed, source: v } }))} />
            <Num label={t("flk.feed.kg")} value={d.feed.kg} onChange={(v) => upd((x) => ({ feed: { ...x.feed, kg: v } }))} />
            <Num label={t("flk.feed.water")} value={d.feed.water} onChange={(v) => upd((x) => ({ feed: { ...x.feed, water: v } }))} />
            <Num label={t("flk.feed.weight")} value={d.feed.weight} onChange={(v) => upd((x) => ({ feed: { ...x.feed, weight: v } }))} />
            {!d.quick && <>
              <Num label={t("flkv.sample")} value={d.feed.sample} onChange={(v) => upd((x) => ({ feed: { ...x.feed, sample: v } }))} />
              <Num label={t("flkv.temp")} value={d.feed.temp} onChange={(v) => upd((x) => ({ feed: { ...x.feed, temp: v } }))} />
              <Num label={t("flkv.hum")} value={d.feed.hum} onChange={(v) => upd((x) => ({ feed: { ...x.feed, hum: v } }))} />
            </>}
          </div>
        </Section>

        {/* ٢ · الطيور الحيّة */}
        <Section title={t("flkv.s2")}>
          {Object.entries(SIGNS).filter(([g]) => g !== "lay" || layer).map(([g, codes]) => (
            <div key={g} className="mb-2">
              <div className="mb-1 text-2xs font-bold text-ink-subtle">{t(`flkv.signGroup.${g}`)}</div>
              <div className="flex flex-wrap gap-1.5">
                {codes.map((code) => {
                  const k = `${g}.${code}`;
                  return <ChipBtn key={k} on={d.signs.includes(k)} onClick={() => upd((x) => ({ signs: toggle(x.signs, k) }))} data={k}>{t(`flkv.sign.${g}.${code}`)}</ChipBtn>;
                })}
              </div>
            </div>
          ))}
        </Section>

        {/* ٣ · البيئة (كاملة) */}
        {!d.quick && (
          <Section title={t("flkv.s3")}>
            <div className="space-y-1.5">
              {ENV.map((k) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-ink">{t(`flkv.env.${k}`)}</span>
                  <div className="flex gap-1">
                    {(["good", "fair", "poor"] as const).map((g) => (
                      <button key={g} type="button" data-flock-env={`${k}.${g}`}
                        onClick={() => upd((x) => { const env = { ...x.env }; if (env[k] === g) delete env[k]; else env[k] = g; return { env }; })}
                        className={cn("chip text-2xs", d.env[k] === g ? (g === "poor" ? "bg-danger-600 text-white" : g === "fair" ? "bg-warn-500 text-white" : "bg-success-600 text-white") : "bg-surface-2 text-ink-muted")}>
                        {t(`flkv.grade.${g}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {ENV.some((k) => d.env[k] === "poor") && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                upd((x) => {
                  const add = ENV.filter((k) => x.env[k] === "poor").map((k) => `• ${t(`flkv.envAdvice.${k}`)}`).filter((l) => !x.advice.includes(l));
                  return { advice: [x.advice.trim(), ...add].filter(Boolean).join("\n") };
                });
              }} data-flock-env-advice>{t("flkv.envToAdvice")}</Button>
            )}
          </Section>
        )}

        {/* ٤ · التشريح — بالسريعة والكاملة (قائمةُ المالك ٢٤/١١): الطيورُ تبويبات، وأجهزةُ الجسم بطاقاتٌ بعرض النافذة */}
        <Section title={t("flkv.s4")}>
          {notifiable && d.birds.length > 0 && <NotifiableBanner t={t} />}
          <div className={cn("flex flex-wrap items-center gap-2", notifiable && d.birds.length > 0 && "mt-2")} data-flock-birds>
            {d.birds.map((bd, i) => (
              <button key={bd.no} type="button" onClick={() => setBird(i)} data-flock-bird={bd.no} aria-pressed={i === bird}
                className={cn("h-11 min-w-11 rounded-xl px-3 text-base font-extrabold tabular-nums transition", i === bird ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>{bd.no}</button>
            ))}
            {d.birds.length < 50 && (
              <Button variant={d.birds.length ? "outline" : "secondary"} leftIcon={<Plus size={16} />} onClick={() => addBird(null)} data-flock-add-bird>{t("flkv.addBird")}</Button>
            )}
          </div>
          {cur && (
            <div className="mt-3 space-y-3 rounded-2xl border border-line p-3" data-flock-bird-form={cur.no}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-extrabold text-ink">{t("flkv.birdN", { n: cur.no })}</span>
                <Chips value={cur.source ?? ""} options={["dead", "cull", "sacrificed"] as const} label={(k) => t(`flkv.birdSrc.${k}`)} onChange={(k) => setBirdAt(bird, { source: k })} />
                <input type="number" inputMode="numeric" min={1} className="input h-10 w-28" placeholder={t("flkv.weightG")} value={cur.weight} onChange={(e) => setBirdAt(bird, { weight: e.target.value })} />
                <button type="button" className="ms-auto grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-surface-2 hover:text-danger-600" aria-label={t("flk.delete")}
                  onClick={() => { upd((x) => ({ birds: x.birds.filter((_, j) => j !== bird) })); setBird(Math.max(0, bird - 1)); }}><X size={18} /></button>
              </div>
              <NecropsyPicker key={cur.no} findings={cur.findings} layer={layer} onChange={(fn) => setBirdAt(bird, (b) => ({ findings: fn(b.findings) }))} />
              {(bird > 0 || (d.birds.length < 50 && lesionsOf(cur.findings).length > 0)) && (
                <div className="flex flex-wrap gap-2">
                  {bird > 0 && <Button size="sm" variant="outline" leftIcon={<Copy size={14} />} onClick={() => upd((x) => ({ birds: x.birds.map((b, j) => (j === bird && x.birds[bird - 1] ? { ...b, findings: [...x.birds[bird - 1].findings] } : b)) }))} data-flock-copy-bird>{t("flkv.copyPrev")}</Button>}
                  {d.birds.length < 50 && lesionsOf(cur.findings).length > 0 && (
                    <Button size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={() => addBird(bird)} data-flock-dup-bird>{t("flkv.necro.dupBird")}</Button>
                  )}
                </div>
              )}
              <input className="input" maxLength={1000} placeholder={t("flkv.birdNote")} value={cur.note} onChange={(e) => setBirdAt(bird, { note: e.target.value })} />
            </div>
          )}
          {summary.length > 0 && (
            <p className="mt-2 text-sm text-ink" data-flock-necropsy-summary>
              <b>{t("flkv.summary", { n: d.birds.length })}</b> {summary.map((x) => `${lesionLabel(t, x.code)} ${x.n}/${x.of}`).join(" · ")}
            </p>
          )}
        </Section>

        {/* ٦ · التشخيص */}
        <Section title={t("flkv.s6")}>
          {suggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5" data-flock-dx-suggest>
              <span className="text-2xs font-bold text-ink-subtle">{t("flkv.suggest")}</span>
              {suggestions.map((x) => (
                <button key={x.dx} type="button" className="chip min-h-10 border border-dashed border-brand-500 bg-transparent text-sm font-bold text-brand-700 dark:text-brand-300" data-flock-suggest={x.dx}
                  onClick={() => upd((st) => ({ dxCodes: st.dxCodes.includes(x.dx) ? st.dxCodes : [...st.dxCodes, x.dx] }))}>+ {t(`flk.dx.${x.dx}`)} ({x.n}/{d.birds.length})</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {DX.map((x) => <ChipBtn key={x} on={d.dxCodes.includes(x)} danger={NOTIFIABLE.has(x)} onClick={() => upd((st) => ({ dxCodes: toggle(st.dxCodes, x) }))} data={x}>{t(`flk.dx.${x}`)}</ChipBtn>)}
          </div>
          {notifiable && <div className="mt-2"><NotifiableBanner t={t} /></div>}
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input className="input sm:col-span-2" maxLength={1000} placeholder={t("flkv.dxFree")} value={d.dx} onChange={(e) => set({ dx: e.target.value })} data-flock-dx />
            <Chips value={d.dxStatus} options={["suspected", "confirmed"] as const} label={(k) => t(`flkv.dxStatus.${k}`)} onChange={(k) => upd((x) => ({ dxStatus: x.dxStatus === k ? "" : k }))} />
          </div>
        </Section>

        {/* ٧ · القرار */}
        <Section title={t("flkv.s7")}>
          <div><span className="label">{t("flkv.trend")}</span>
            <Chips value={d.trend} options={["better", "same", "worse"] as const} label={(k) => t(`flk.trend.${k}`)} onChange={(k) => upd((x) => ({ trend: x.trend === k ? "" : k }))} />
          </div>
          {!d.quick && txs.length > 0 && (
            <div className="mt-3" data-flock-compliance>
              <span className="label">{t("flkv.compliance")}</span>
              {txs.map((x) => x.lines.map((l) => {
                const val = d.comp[x.id]?.[l.id];
                return (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{l.product_name}</span>
                    <div className="flex gap-1">
                      {(["yes", "partial", "no"] as const).map((v) => (
                        <button key={v} type="button" className={cn("chip text-2xs", val === v ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}
                          onClick={() => upd((st) => ({ comp: { ...st.comp, [x.id]: { ...(st.comp[x.id] ?? {}), [l.id]: v } } }))}>{t(`flkv.comp.${v}`)}</button>
                      ))}
                    </div>
                  </div>
                );
              }))}
            </div>
          )}
          {dueVax.length > 0 && (
            <div className="mt-3" data-flock-visit-vax>
              <span className="label">{t("flkv.vaxToday")}</span>
              {dueVax.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{v.vaccine} · {t(`flk.route.${v.route}`)} · {t("flk.ageShort", { age: v.planned_age })}</span>
                  <div className="flex gap-1">
                    {(["vet", "farmer"] as const).map((by) => (
                      <button key={by} type="button" className={cn("chip text-2xs", d.vaxGiven[v.id] === by ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")} data-flock-vgiven={`${v.id}:${by}`}
                        onClick={() => upd((x) => ({ vaxGiven: { ...x.vaxGiven, [v.id]: x.vaxGiven[v.id] === by ? "" : by } }))}>{t("flkv.givenBy", { by: t(`flk.givenBy.${by}`) })}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block"><span className="label">{t("flkv.next")}</span>
              <input type="date" className="input" value={d.next} min={day} onChange={(e) => set({ next: e.target.value })} data-flock-next />
            </label>
          </div>
          <label className="mt-3 block"><span className="label">{t("flkv.advice")}</span>
            <textarea className="input min-h-20" maxLength={4000} value={d.advice} onChange={(e) => set({ advice: e.target.value })} data-flock-advice />
          </label>
          {!d.quick && <label className="mt-3 block"><span className="label">{t("flkv.notes")}</span>
            <textarea className="input min-h-16" maxLength={4000} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>}
          <p className="mt-2 text-2xs text-ink-subtle">{t("flkv.photosAfter")}</p>
        </Section>
      </fieldset>
    </Dialog>
  );
}

/* ── العرض: ما انكتب بالزيارة، وصورُها، والتقريرُ للمربي ───────────────────────── */
function VisitView({ b, visit: v, canEdit, canPhoto, onEdit, onClose, onChanged }: {
  b: FlockBundle; visit: Visit; canEdit: boolean; canPhoto: boolean; onEdit: () => void; onClose: () => void; onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  useWarmWaQuota();
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const today = localISO();
  const c = b.case;
  const day = localDay(v.at);
  const birds = b.necropsy.filter((n) => n.visit_id === v.id).sort((x, y) => x.bird_no - y.bird_no);
  const morts = b.mortality.filter((m) => m.visit_id === v.id);
  const summary = necropsySummary(birds);
  const phone = b.farm.owner_phone;
  const send = () => {
    if (!phone) { toast.error(t("flk.noPhone")); return; }
    const sent = sendWhatsApp({ phone: waNumber(phone, getDialCode()), text: reportText(t, b, v), ownerName: b.farm.owner_name, ownerPhone: phone, kind: "flock_visit" });
    sent.then(() => toast.success(t("flkv.reportSent")), (e: unknown) => {
      const msg = quotaMessage(e) ?? flockError(e, t);
      if ((e as { name?: string } | null)?.name === "WaBlockedError") toast.toast({ tone: "warn", title: msg, action: { label: t("flk.retry"), onClick: send } });
      else toast.error(msg);
    });
  };
  const addPhoto = async (f: File) => {
    setBusy(true);
    try {
      const p = await prepareUpload(f, { maxDim: 1600 });
      await flockApi.uploadPhoto({ case_id: c.id, visit_id: v.id, blob: p.blob, dataUrl: p.dataUrl, ext: p.ext, contentType: p.contentType });
      toast.success(t("flk.saved"));
      onChanged?.();   // تبويبُ المرفقات يُقرأ من جديد — وإلا بدت الصورةُ «ما انضافت» فتُرفع ثانية
    } catch (e) { toast.error((e as { code?: string })?.code ? flockError(e, t) : describeUploadError(e, t)); }
    finally { setBusy(false); }
  };
  // عناوينُ الأقسام بالنموذج مرقّمة («٢ · الطيور الحيّة») — بالعرض بلا رقم.
  const row = (label: string, val: string | null | undefined) => (val ? <div className="text-sm"><span className="font-bold text-ink-muted">{label.replace(/^\S+\s·\s/, "")}: </span><span className="text-ink">{val}</span></div> : null);
  return (
    <Dialog open onClose={onClose} size="xl" title={t("flkv.viewTitle", { kind: t(`flk.visitKind.${v.kind}`), day: dayLabel(day, today) })}
      description={ageLabel(t, c.placed_on, day)}
      footer={<>
        {canEdit && <Button variant="ghost" leftIcon={<Pencil size={16} />} onClick={onEdit} data-flock-visit-edit>{t("flk.edit")}</Button>}
        <Button leftIcon={<MessageCircle size={16} />} onClick={send} disabled={!phone} data-flock-report>{t("flkv.sendReport")}</Button>
      </>}>
      <div className="space-y-3" data-flock-visit-view={v.id}>
        {v.notifiable && <NotifiableBanner t={t} />}
        <div className="flex flex-wrap gap-1.5">
          {v.quick && <Badge tone="neutral" className="text-xs">{t("flkv.quick")}</Badge>}
          {v.trend && <Badge tone={v.trend === "worse" ? "danger" : v.trend === "better" ? "success" : "neutral"} className="text-xs">{t(`flk.trend.${v.trend}`)}</Badge>}
          {v.next_visit_on && <Badge tone="brand" className="text-xs">{t("flkv.nextOn", { day: dayLabel(v.next_visit_on, today) })}</Badge>}
        </div>
        {morts.length > 0 && row(t("flk.tab.mortality"), morts.map((m) => `${b.houses.length > 1 ? `${b.houses.find((h) => h.id === m.house_id)?.label ?? ""}: ` : ""}${t("flk.tl.mortality", { dead: m.dead, culled: m.culled })}${m.days > 1 ? ` (${t("flk.mort.overDays", { n: m.days })})` : ""}`).join(" · "))}
        {row(t("flkv.s1"), snapshotText(t, v.flock))}
        {row(t("flkv.s2"), v.signs.map((x) => signLabel(t, x)).join(t("common.listSep")))}
        {Object.keys(v.env).length > 0 && row(t("flkv.s3"), ENV.filter((k) => v.env[k]).map((k) => `${t(`flkv.env.${k}`)}: ${t(`flkv.grade.${v.env[k]}`)}`).join(" · "))}
        {birds.length > 0 && (
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <div className="font-bold text-ink">{t("flkv.summary", { n: birds.length })} {summary.map((x) => `${lesionLabel(t, x.code)} ${x.n}/${x.of}`).join(" · ") || t("flkv.allNormal")}</div>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {birds.map((bd) => (
                <li key={bd.id}>{t("flkv.birdN", { n: bd.bird_no })}{bd.source ? ` (${t(`flkv.birdSrc.${bd.source}`)})` : ""}{bd.weight_g ? ` · ${formatNum(bd.weight_g)} ${t("flk.unit.g")}` : ""}: {bd.findings.filter((f) => !f.endsWith(".normal")).map((f) => lesionLabel(t, f)).join(t("common.listSep")) || t("flkv.allNormal")}{bd.note ? ` — ${bd.note}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
        {row(t("flkv.s6"), [v.dx_codes.map((x) => t(`flk.dx.${x}`)).join(t("common.listSep")), v.dx, v.dx_status ? `(${t(`flkv.dxStatus.${v.dx_status}`)})` : ""].filter(Boolean).join(" ") || null)}
        {row(t("flkv.advice"), v.advice)}
        {row(t("flkv.notes"), v.notes)}
        {canPhoto && <div className="pt-2">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Camera size={16} /> {t("flkv.photos")}</div>
          <LoadBoundary scope="flock-visit-photo" onRetry={() => { PhotoSourceLazy = loadPhotoSource(); setTick((n) => n + 1); }}>
            <Suspense fallback={null}>
              <PhotoSourceLazy key={tick} onFile={(f: File) => void addPhoto(f)} busy={busy} size="sm" />
            </Suspense>
          </LoadBoundary>
          <p className="mt-1 text-2xs text-ink-subtle">{t("flkv.photosWhere")}</p>
        </div>}
      </div>
    </Dialog>
  );
}

/* ── أجزاءٌ صغيرة ─────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-3">
      <h3 className="mb-2 text-sm font-extrabold text-ink">{title}</h3>
      {children}
    </section>
  );
}
function Chips<T extends string>({ value, options, label, onChange }: { value: T | ""; options: readonly T[]; label: (k: T) => string; onChange: (k: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((k) => <ChipBtn key={k} on={value === k} onClick={() => onChange(k)} data={k}>{label(k)}</ChipBtn>)}
    </div>
  );
}
function ChipBtn({ on, danger, onClick, data, children }: { on: boolean; danger?: boolean; onClick: () => void; data?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-chip={data} aria-pressed={on}
      className={cn("chip min-h-10 text-sm", on ? (danger ? "bg-danger-600 text-white" : "bg-brand-600 text-white") : danger ? "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-200" : "bg-surface-2 text-ink-muted")}>
      {children}
    </button>
  );
}
/* ── منتقي التشريح: بحثٌ بالقائمة كلّها، وأجهزةُ الجسم بطاقاتٌ بحالها، وآفاتُ الجهاز المختار تحتها ───────────── */
function NecropsyPicker({ findings, layer, onChange }: { findings: string[]; layer: boolean; onChange: (next: (prev: string[]) => string[]) => void }) {
  const { t } = useTranslation();
  const systems = systemsFor(layer);
  const [openK, setOpenK] = useState(systems[0].k);
  const [q, setQ] = useState("");
  const panel = useRef<HTMLDivElement | null>(null);
  const sys = systems.find((x) => x.k === openK) ?? systems[0];
  const picked = lesionsOf(findings);
  const nilBlocked = picked.some((c) => c !== NIL);
  const subName = (k: string) => (k === "gen" ? "" : t(`flkv.sub.${k}`));
  // البحثُ بكلّ الأجهزة المعروضة (necropsy.findLesions — الطرفان من searchable).
  const hits = q.trim() ? findLesions(q, systems, (code) => lesionName(t, code), (sk, bk) => `${t(`flkv.sys.${sk}`)} ${subName(bk)}`, searchable) : null;
  // البطاقةُ تفتح جهازها تحتها: إن كان رأسُه خارج النظر يُجلب إليه — لا تُترك النقرةُ بلا أثرٍ يُرى على الهاتف.
  const open = (k: string) => {
    setOpenK(k);
    const el = panel.current;
    if (el && typeof window !== "undefined") {
      const top = el.getBoundingClientRect?.().top;
      if (top != null && (top < 0 || top > window.innerHeight * 0.7)) el.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  };
  const lesion = (code: string) => (
    <LesionBtn key={code} code={code} on={findings.includes(code)} blocked={code === NIL && nilBlocked && !findings.includes(NIL)}
      onClick={() => onChange((f) => toggleLesion(f, code))} />
  );
  const idx = systems.indexOf(sys);
  const st = systemState(findings, sys);
  return (
    <div className="space-y-3" data-flock-necropsy>
      <div className="flex flex-wrap items-center gap-1.5" data-flock-picked-list>
        <span className="text-xs font-bold text-ink-subtle">{t("flkv.necro.picked")}:</span>
        {picked.length === 0 && <span className="text-xs text-ink-subtle">{t("flkv.necro.none")}</span>}
        {picked.map((code) => (
          <button key={code} type="button" data-flock-picked={code} onClick={() => onChange((f) => toggleLesion(f, code))} aria-label={`${t("flk.delete")}: ${lesionLabel(t, code)}`}
            className="chip min-h-9 bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            {lesionLabel(t, code)}<X size={14} className="shrink-0 opacity-70" />
          </button>
        ))}
      </div>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("flkv.necro.search")} data-flock-necro-search />
      {hits ? (
        hits.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-flock-necro-hits>{hits.map(lesion)}</div>
          : <p className="text-sm text-ink-subtle" data-flock-necro-nomatch>{t("flkv.necro.noMatch")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-flock-systems>
            {systems.map((x) => {
              const s2 = systemState(findings, x);
              const on = x.k === sys.k;
              return (
                <button key={x.k} type="button" onClick={() => open(x.k)} aria-pressed={on} data-flock-sys={x.k}
                  className={cn("flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-start transition",
                    on ? "border-brand-600 bg-brand-50 dark:bg-brand-500/15" : "border-line bg-surface-1 hover:border-brand-500")}>
                  <span className="text-sm font-extrabold leading-snug text-ink">{t(`flkv.sys.${x.k}`)}</span>
                  <span className={cn("text-xs font-bold", s2.n ? "text-brand-700 dark:text-brand-300" : s2.normal ? "text-success-700 dark:text-success-300" : "text-ink-subtle")}>
                    {s2.n ? t("flkv.necro.count", { n: s2.n }) : s2.normal ? t("flkv.normal") : "—"}
                  </span>
                </button>
              );
            })}
          </div>
          <div ref={panel} className="scroll-mt-4 space-y-3 rounded-2xl bg-surface-2 p-3" data-flock-sys-panel={sys.k}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-base font-extrabold text-ink">{t(`flkv.sys.${sys.k}`)}</span>
              <button type="button" data-flock-normal={sys.k} aria-pressed={st.normal} onClick={() => onChange((f) => toggleNormal(f, sys))}
                className={cn("chip min-h-10 text-sm font-bold", st.normal ? "bg-success-600 text-white" : "bg-surface-1 text-ink-muted")}>{t("flkv.normal")}</button>
            </div>
            {sys.subs.map((sub) => (
              <div key={sub.k} data-flock-sub={sub.k}>
                {sys.subs.length > 1 && <div className="mb-1.5 text-sm font-extrabold text-brand-700 dark:text-brand-300">{subName(sub.k)}</div>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{sub.codes.map(lesion)}</div>
              </div>
            ))}
            {sys.k === "gen" && nilBlocked && !findings.includes(NIL) && <p className="text-xs text-ink-subtle">{t("flkv.necro.nilBlocked")}</p>}
            <div className="flex flex-wrap gap-2">
              {idx < systems.length - 1 && (
                <Button size="sm" variant="secondary" onClick={() => open(systems[idx + 1].k)} data-flock-sys-next>{t("flkv.necro.next")}: {t(`flkv.sys.${systems[idx + 1].k}`)}</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onChange((f) => restNormal(f, systems))} data-flock-rest-normal>{t("flkv.necro.restNormal")}</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
/** آفةٌ بالمنتقي: الاسمُ العربيّ، ومصطلحُه اللاتينيّ (إن كتبه المالك بين قوسين) سطراً صغيراً تحته. */
function LesionBtn({ code, on, blocked, onClick }: { code: string; on: boolean; blocked?: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const { main, term } = splitTerm(lesionName(t, code));
  return (
    <button type="button" onClick={onClick} disabled={blocked} aria-pressed={on} data-chip={code} title={blocked ? t("flkv.necro.nilBlocked") : undefined}
      className={cn("flex min-h-11 flex-col justify-center rounded-xl border px-3 py-1.5 text-start text-sm font-bold leading-snug transition disabled:opacity-50",
        on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink hover:border-brand-500")}>
      <span>{main}</span>
      {term && <span className={cn("text-2xs font-semibold", on ? "text-white/80" : "text-ink-subtle")}>{term}</span>}
    </button>
  );
}
function Num({ label, value, onChange, text }: { label: string; value: string; onChange: (v: string) => void; text?: boolean }) {
  return (
    <label className="block"><span className="label">{label}</span>
      <input className="input" value={value} maxLength={120} type={text ? "text" : "number"} inputMode={text ? undefined : "decimal"} step="any" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function NotifiableBanner({ t }: { t: TFunction }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-danger-500 bg-danger-50 p-3 text-sm font-extrabold text-danger-700 dark:bg-danger-500/10 dark:text-danger-200" data-flock-notifiable>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{t("flkv.notifiable")}</span>
    </div>
  );
}

const signLabel = (t: TFunction, code: string) => { const [g, x] = code.split("."); return t(`flkv.sign.${g}.${x}`, { defaultValue: code }); };
const lesionName = (t: TFunction, code: string) => { const [o, x] = code.split("."); return t(`flkv.lesion.${o}.${x}`, { defaultValue: x ?? code }); };
/** اسمُ الآفة بنصّ الملخّص والتقرير (necropsy.lesionText): بلا المصطلح اللاتينيّ، ومسبوقٌ بمجموعته حين لا يسمّي عضوَه. */
const lesionLabel = (t: TFunction, code: string) =>
  lesionText(code, (c) => lesionName(t, c), (k) => t(`flkv.sub.${k}`), (o) => t(`flkv.organ.${o}`, { defaultValue: o }));
function snapshotText(t: TFunction, f: FlockSnapshot): string | null {
  const parts = [
    f.feed_phase ? t(`flk.feedPhase.${f.feed_phase}`) : "", f.feed_source ?? "",
    f.feed_kg_day != null ? `${t("flk.feed.kg")} ${num(f.feed_kg_day)}` : "", f.water_l_day != null ? `${t("flk.feed.water")} ${num(f.water_l_day)}` : "",
    f.avg_weight_g != null ? `${t("flk.feed.weight")} ${formatNum(f.avg_weight_g)}${f.sample_n ? ` (${f.sample_n})` : ""}` : "",
    f.temp_c != null ? `${num(f.temp_c)}°` : "", f.humidity_pct != null ? `${num(f.humidity_pct)}%` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** تقريرُ الزيارة للمربي (الخطّة §١٣) — نصٌّ مرتّب، كلُّ سطرٍ يُكتب إن كان له ما يقوله. */
function reportText(t: TFunction, b: FlockBundle, v: Visit): string {
  const today = localISO();
  const c = b.case;
  const day = localDay(v.at);
  // النافقُ منذ الزيارة السابقة (بيوم التسجيل) — من أيّ مصدر: «نافق اليوم» بالاستقبال يُحسب كما يُحسب ما سُجّل بالزيارة.
  const prev = b.visits.filter((x) => x.id !== v.id && x.at < v.at).reduce<string | null>((mx, x) => (!mx || x.at > mx ? x.at : mx), null);
  const from = prev ? localDay(prev) : null;
  const inRange = b.mortality.filter((m) => m.on_date <= day && (!from || m.on_date > from));
  const lost = inRange.reduce((n, m) => n + m.dead + m.culled, 0);
  const before = b.mortality.filter((m) => from && m.on_date <= from).reduce((n, m) => n + m.dead + m.culled, 0);
  const birds = b.necropsy.filter((n) => n.visit_id === v.id);
  const sum = necropsySummary(birds);
  // الطبلاتُ الجارية يومَ الزيارة وحدها (لا «فعّالةٌ» انتهت أيامُها قبل أسابيع)؛ و«لا تبيع قبل» للوجبة كلّها — المستبدَلةُ
  // بما انعطى منها حتى إيقافها، كما يحسبه الخادم (_flock_stats) ورأسُ الحالة؛ كانت تُسقطها فتقول تاريخاً أبكر (مراجعةٌ عدائيّة).
  const live = b.treatments.filter((x) => x.status === "active" && x.start_on <= day
    && addDays(x.start_on, x.lines.reduce((m, l) => Math.max(m, l.day_to), 1) - 1) >= day);
  const w = withdrawalOf(b.treatments);
  const layer = c.kind === "layer" || c.kind === "breeder";
  const nv = b.stats.next_vax;
  const sep = t("common.listSep");
  const lines = [
    t("flkv.r.head", { farm: b.farm.name, day: dayLabel(day, today), age: ageOn(c.placed_on, day) }),
    inRange.length ? t(from ? "flkv.r.mortality" : "flkv.r.mortalityAll", { n: formatNum(lost), pct: num((lost * 100) / Math.max(1, c.placed_count - before), 2) }) : "",
    v.signs.length ? t("flkv.r.signs", { list: v.signs.map((x) => signLabel(t, x)).join(sep) }) : "",
    // الآفةُ باسم عضوها: «احتقان» و«نزف» بعضوين — بلا العضو لا يُعرف أيُّهما.
    birds.length ? t("flkv.r.necropsy", { n: birds.length, list: sum.slice(0, 5).map((x) => `${lesionLabel(t, x.code)} ${x.n}/${x.of}`).join(sep) || t("flkv.allNormal") }) : "",
    v.dx_codes.length || v.dx ? t("flkv.r.dx", { dx: [v.dx_codes.map((x) => t(`flk.dx.${x}`)).join(" + "), v.dx].filter(Boolean).join(" — ") }) : "",
    live.length ? t("flkv.r.tx", { list: live.map((x) => x.title || t("flk.tx.untitled")).join(sep) }) : "",
    w.unknownMeat ? t("flkv.r.safeUnknown") : w.meat && w.meat > today ? t("flkv.r.safe", { day: dayLabel(w.meat, today) }) : "",
    layer ? (w.unknownEgg ? t("flkv.r.safeEggUnknown") : w.egg && w.egg > today ? t("flkv.r.safeEgg", { day: dayLabel(w.egg, today) }) : "") : "",
    nv ? t(nv.due_on < day ? "flkv.r.vaxLate" : "flkv.r.vax", { vaccine: nv.vaccine, route: t(`flk.route.${nv.route}`), age: nv.age, day: dayLabel(nv.due_on, today) }) : "",
    v.next_visit_on ? t("flkv.r.next", { day: dayLabel(v.next_visit_on, today) }) : "",
    v.advice ? `${t("flkv.r.advice")}\n${v.advice}` : "",
    v.notifiable ? t("flkv.r.notifiable") : "",
    t("flk.wa.sign", { clinic: getClinicName() || "doctorVet" }),
  ];
  return lines.filter(Boolean).join("\n");
}
