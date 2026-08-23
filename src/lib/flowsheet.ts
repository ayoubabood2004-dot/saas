import type { TaskType, DoseRoute, TreatmentEntry } from "@/types";
import i18n from "@/i18n";
import { taskStatus, type TaskStatus } from "./treatmentSchedule";

/* ============================================================================
 * flowsheet.ts — منطق «ورقة العلاج»: مرضى في صفوف، ساعات في أعمدة.
 *
 * ── لماذا وحدةٌ نقيّة مستقلة ──────────────────────────────────────────────
 * كل ما هنا حسابٌ خالص: لا React ولا شبكة ولا وقتٍ ضمني. الوقت يُمرَّر دائماً
 * وسيطاً (`nowMin`)، فالورقة تُختبر بالثواني عند أي لحظة من اليوم بدل انتظار
 * الساعة الحقيقية — وهذا وحده يجعل «متأخّرة ٤٥ دقيقة» قابلاً للإثبات لا
 * للتصديق.
 *
 * ── الفكرة المركزية: المهمة لا الجرعة ────────────────────────────────────
 * صفٌّ واحد لكل **أمر** (دواء، سوائل، علامات حيوية، تغذية، إخراج، تمريض)،
 * وخانةٌ لكل ساعةٍ يقع فيها تنفيذ. ولكل نوعٍ طريقة إنجاز مختلفة: الدواء
 * يُنجَز بعلامة، والحرارة والتغذية تُنجَزان **بقيمةٍ تُكتب** — ولهذا يميّز
 * `needsValue` بينهما، فتعرف الواجهة متى تفتح حقل إدخال بدل تسجيل صامت.
 *
 * ── لماذا النصوص دوالٌ لا سلاسل ──────────────────────────────────────────
 * كل اسمٍ معروضٍ هنا **دالة** تُستدعى عند الرسم لا سلسلةٌ تُجمَّد عند تحميل
 * الوحدة. الفرق يظهر لحظة تبديل اللغة: السلسلة المجمَّدة تبقى عربيةً بواجهةٍ
 * صارت إنجليزية، والدالة تُقرأ من جديد فتتبع اللغة الجارية. والافتراضي
 * العربي مكتوبٌ بجانب المفتاح ليبقى النص صحيحاً حتى لو سبق الكودُ الترجمة.
 * ==========================================================================*/

/** وصف نوع المهمة: كيف تُسمّى، وبأي رمز تُرى، وكيف تُنجَز. */
export interface TaskMeta {
  /** مفتاح i18n — يُستعمل للفرز والاختبار بلا اعتمادٍ على لغة العرض. */
  key: string;
  /** الاسم المعروض — يُقرأ عند الطلب فيتبع اللغة الجارية. */
  ar: () => string;
  /** رمز قصير يُرسم بصدر الصف — حرفٌ واحد يُقرأ بأي حجم. */
  glyph: string;
  /** هل الإنجاز يتطلّب **قيمة مكتوبة** (حرارة، نسبة أكل، حجم سوائل)؟ */
  needsValue: boolean;
  /** نصّ يوضّح ما يُكتب — يظهر داخل حقل الإدخال. */
  valueHint?: () => string;
  /** ترتيب الصفوف تحت المريض: الأهم سريرياً أولاً. */
  rank: number;
}

export const TASK_META: Record<TaskType, TaskMeta> = {
  drug: {
    key: "flow.tDrug", glyph: "℞", needsValue: false, rank: 1,
    ar: () => i18n.t("flow.tDrug", "دواء"),
  },
  fluid: {
    key: "flow.tFluid", glyph: "◍", needsValue: true, rank: 2,
    ar: () => i18n.t("flow.tFluid", "سوائل"),
    valueHint: () => i18n.t("flow.hFluid", "الحجم المُعطى (مل)"),
  },
  vitals: {
    key: "flow.tVitals", glyph: "◉", needsValue: true, rank: 3,
    ar: () => i18n.t("flow.tVitals", "علامات حيوية"),
    valueHint: () => i18n.t("flow.hVitals", "الحرارة °م"),
  },
  feed: {
    key: "flow.tFeed", glyph: "◐", needsValue: true, rank: 4,
    ar: () => i18n.t("flow.tFeed", "تغذية"),
    valueHint: () => i18n.t("flow.hFeed", "كم أكل؟ ٪"),
  },
  elim: {
    key: "flow.tElim", glyph: "◇", needsValue: true, rank: 5,
    ar: () => i18n.t("flow.tElim", "إخراج"),
    valueHint: () => i18n.t("flow.hElim", "بال / تغوّط"),
  },
  nurse: {
    key: "flow.tNurse", glyph: "✚", needsValue: false, rank: 6,
    ar: () => i18n.t("flow.tNurse", "تمريض"),
  },
  lab: {
    key: "flow.tLab", glyph: "◈", needsValue: true, rank: 7,
    ar: () => i18n.t("flow.tLab", "فحص مختبري"),
    valueHint: () => i18n.t("flow.hLab", "النتيجة"),
  },
};

export const TASK_TYPES = Object.keys(TASK_META) as TaskType[];

/** نوع المهمة لصفٍّ قد يسبق الهجرة — الغياب يعني دواءً دائماً. */
export const typeOf = (t: TreatmentEntry): TaskType =>
  (t.task_type && TASK_META[t.task_type] ? t.task_type : "drug");

/* ── طريق الإعطاء ───────────────────────────────────────────────────────── */
/** الترتيب مقصود: الأشيع سريرياً أولاً، فأول خيارٍ بالقائمة هو المرجَّح. */
export const ROUTES: DoseRoute[] = ["iv", "im", "sc", "po", "topical", "inhaled"];

/** لكل طريقٍ اسمان: كاملٌ للقائمة المنسدلة، ومختصرٌ لصدر الصف حيث كل حرفٍ
 *  يزاحم اسم الدواء. وكلاهما دالة — تُقرأ عند الرسم فتتبع اللغة الجارية. */
const ROUTE_T: Record<DoseRoute, { full: () => string; short: () => string }> = {
  iv:      { full: () => i18n.t("flow.route.iv", "وريدي"),        short: () => i18n.t("flow.routeShort.iv", "و.ر") },
  im:      { full: () => i18n.t("flow.route.im", "عضلي"),         short: () => i18n.t("flow.routeShort.im", "ع.ض") },
  sc:      { full: () => i18n.t("flow.route.sc", "تحت الجلد"),    short: () => i18n.t("flow.routeShort.sc", "ت.ج") },
  po:      { full: () => i18n.t("flow.route.po", "فموي"),         short: () => i18n.t("flow.routeShort.po", "فم") },
  topical: { full: () => i18n.t("flow.route.topical", "موضعي"),   short: () => i18n.t("flow.routeShort.topical", "مو") },
  inhaled: { full: () => i18n.t("flow.route.inhaled", "استنشاق"), short: () => i18n.t("flow.routeShort.inhaled", "است") },
};

/** الاسم الكامل — للقائمة المنسدلة حيث المساحة تسمح. */
export const routeName = (r: DoseRoute): string => ROUTE_T[r].full();

/** مختصرٌ يُطبع بصدر الصف بلا أن يزاحم اسم الدواء. */
export const routeShort = (r: DoseRoute): string => ROUTE_T[r].short();

/* ── أسباب الفوات ───────────────────────────────────────────────────────── */
/** أسبابٌ جاهزة تُختار بضغطة. القائمة قصيرة عمداً: قائمةٌ طويلة تُتجاهَل،
 *  وسببٌ واحد شائع يُختار. والمعرّف `id` ثابتٌ عبر اللغات — فالمُخزَّن
 *  بقاعدة البيانات نصٌّ يقرأه الإنسان، لكن الاختبار والإحصاء يمسكان المعرّف. */
export const MISS_REASONS: { id: string; label: () => string }[] = [
  { id: "away", label: () => i18n.t("flow.mAway", "الحيوان كان خارج القفص (فحص/تصوير)") },
  { id: "refused", label: () => i18n.t("flow.mRefused", "رفض الحيوان أو تقيّأ") },
  { id: "clinical", label: () => i18n.t("flow.mClinical", "قرار الطبيب — أُجّلت") },
  { id: "stock", label: () => i18n.t("flow.mStock", "الدواء غير متوفّر") },
  { id: "busy", label: () => i18n.t("flow.mBusy", "ضغط العمل") },
];

/* ── الوقت ──────────────────────────────────────────────────────────────── */
/** "HH:MM" → دقائق منذ منتصف الليل. الصيغة الفاسدة تُعاد 0 لا NaN. */
export function toMin(hhmm: string | undefined | null): number {
  if (!hhmm) return 0;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return 0;
  return Math.min(24 * 60, Math.max(0, +m[1] * 60 + +m[2]));
}
export const hourOf = (hhmm: string | undefined | null): number => Math.floor(toMin(hhmm) / 60);
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * أعمدة الساعات التي تعرضها الورقة — **الساعات التي فيها عمل فقط**.
 *
 * كانت تُملأ الفجوات: خطةٌ من ٠٨:٠٠ إلى ٢١:٠٠ تُرسَم أربعة عشر عموداً، ستةٌ
 * منها فيها جرعة وثمانيةٌ فراغ. وقِسنا ثمن ذلك: مئةٌ وخمسون بكسلاً خارج
 * الشاشة تحتاج سحباً أفقياً — يدفعها فراغٌ لا يحمل معلومة.
 *
 * فصارت متفرّقة: ساعةٌ فيها مهمة تظهر، وما بينها يُطوى. والوقت لا يضيع لأن
 * رأس كل عمود يحمل رقمه مكتوباً — والطبيب يقرأ الرقم لا يقيس المسافة.
 * والفجوة المطويّة تُعلَّم بحدٍّ أغمق حتى لا تُقرأ ساعتان متباعدتان متجاورتين.
 *
 * ويُضمَّن **عمود الساعة الحالية دائماً** حتى لو خلا من مهمة — وإلا اختفى خط
 * «الآن» من ورقةٍ هادئة، وهو آخر ما يصحّ أن يختفي.
 */
export function hourColumns(entries: TreatmentEntry[], nowMin: number): number[] {
  const hrs = new Set<number>();
  for (const t of entries) hrs.add(hourOf(t.time));
  hrs.add(Math.floor(nowMin / 60));
  if (!hrs.size) return [8, 10, 12, 14, 16];
  return [...hrs].sort((a, b) => a - b);
}

/** هل بين هذا العمود وسابقه ساعاتٌ مطويّة؟ — لرسم حدٍّ يفصل الزمن المطوي. */
export const isGapBefore = (cols: number[], i: number): boolean =>
  i > 0 && cols[i] - cols[i - 1] > 1;

/**
 * موضع خط «الآن» ككسرٍ من عرض الشبكة (0 = أول عمود، 1 = آخره).
 *
 * الأعمدة متفرّقة لا متّصلة، فالموضع يُحسب **بترتيب العمود** لا بالزمن: لو
 * حُسب بالزمن لوقع الخط بمنتصف فجوةٍ مطويّة، أي على عمودٍ ساعتُه غير ساعته.
 */
export function nowOffset(cols: number[], nowMin: number): number | null {
  if (!cols.length) return null;
  const h = Math.floor(nowMin / 60);
  const i = cols.indexOf(h);
  if (i >= 0) return (i + (nowMin % 60) / 60) / cols.length;
  const before = cols.filter((c) => c < h).length;
  if (before === 0 || before === cols.length) return null;   // الآن خارج نطاق الأعمدة
  return before / cols.length;
}

/* ── تجميع الصفوف ───────────────────────────────────────────────────────── */
export type GroupBy = "cage" | "acuity" | "doctor" | "none";

/** الصف الواحد بالورقة: أمرٌ واحد لمريضٍ واحد، وخاناته موزّعة على الساعات. */
export interface OrderRow {
  /** مفتاح ثابت: نفس المريض + نفس النوع + نفس الاسم = صفٌّ واحد. */
  key: string;
  petId: string;
  type: TaskType;
  /** اسم الأمر — الدواء أو «حرارة» أو «تغذية». */
  label: string;
  /** الكمية/المعدّل كما كُتبت بالخطة. */
  amount: string;
  route?: DoseRoute | null;
  /** المهام بالساعة: مفتاحٌ = الساعة، والقيمة كل ما يقع فيها. */
  byHour: Map<number, TreatmentEntry[]>;
  /** كل مهام الصف مرتّبةً بالوقت — للعدّ والحالة الإجمالية. */
  all: TreatmentEntry[];
}

/**
 * يطوي مهام مريضٍ إلى صفوف أوامر.
 *
 * المفتاح `type|label|amount|route`: خطةٌ تكتب «سيفترياكسون ١ مل وريدي» أربع
 * مرات باليوم تصير **صفاً واحداً بأربع خانات** لا أربعة صفوف — وهذا هو الفرق
 * بين ورقةٍ تُقرأ وقائمةٍ تُتصفّح. واختلاف الجرعة يفصل الصف عمداً: «١ مل»
 * و«٠٫٥ مل» أمران مختلفان سريرياً ولو اتّحد اسم الدواء.
 */
export function buildRows(entries: TreatmentEntry[]): OrderRow[] {
  const rows = new Map<string, OrderRow>();
  for (const t of entries) {
    const type = typeOf(t);
    const label = (t.medication || "").trim() || TASK_META[type].ar();
    const amount = (t.amount || "").trim();
    const key = `${t.pet_id}|${type}|${label}|${amount}|${t.route ?? ""}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, petId: t.pet_id, type, label, amount, route: t.route ?? null, byHour: new Map(), all: [] };
      rows.set(key, row);
    }
    const h = hourOf(t.time);
    const bucket = row.byHour.get(h);
    if (bucket) bucket.push(t); else row.byHour.set(h, [t]);
    row.all.push(t);
  }
  for (const row of rows.values()) {
    row.all.sort((a, b) => toMin(a.time) - toMin(b.time));
    for (const list of row.byHour.values()) list.sort((a, b) => toMin(a.time) - toMin(b.time));
  }
  return [...rows.values()].sort(
    (a, b) => TASK_META[a.type].rank - TASK_META[b.type].rank || a.label.localeCompare(b.label, "ar"),
  );
}

/** حالة الخانة الواحدة: أسوأ حالةٍ بين مهامها.
 *  «أسوأ» لأن خانةً فيها جرعتان إحداهما متأخّرة يجب أن تُقرأ متأخّرة — لا
 *  مُنجَزة لأن الأخرى أُعطيت. */
export function cellState(list: TreatmentEntry[], todayISO: string, nowHHMM: string): TaskStatus {
  const rank: Record<TaskStatus, number> = { overdue: 0, due: 1, upcoming: 2, given: 3 };
  let worst: TaskStatus = "given";
  for (const t of list) {
    const s = taskStatus(t, todayISO, nowHHMM);
    if (rank[s] < rank[worst]) worst = s;
  }
  return worst;
}

/** كم أُنجز من صفٍّ واحد — للشريط الصغير بصدر الصف. */
export function rowProgress(row: OrderRow): { done: number; total: number } {
  const total = row.all.length;
  const done = row.all.filter((t) => !!t.administered_at).length;
  return { done, total };
}

/** ملخّص مريضٍ واحد لليوم — يُعرض على شريط اسمه. */
export function petSummary(rows: OrderRow[], todayISO: string, nowHHMM: string): {
  done: number; total: number; overdue: number; due: number;
} {
  let done = 0, total = 0, overdue = 0, due = 0;
  for (const r of rows) {
    for (const t of r.all) {
      total++;
      if (t.administered_at) { done++; continue; }
      const s = taskStatus(t, todayISO, nowHHMM);
      if (s === "overdue") overdue++;
      else if (s === "due") due++;
    }
  }
  return { done, total, overdue, due };
}
