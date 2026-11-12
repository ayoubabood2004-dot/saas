/* ============================================================================
 * البيعُ قبل الجرد (0266) — بابٌ واحد للسحابة وللتجريبيّ، وحالةٌ مشتركة بين الشاشات. كسولٌ: لا تستورده إلا import()
 * من شاشةٍ كسولة — حزمةُ الإقلاع لا تحمله (وفسحتُها بضعةُ كيلوبايتات).
 *
 * العقد:
 *  • القراءةُ ترمي عند أيّ فشل — إلا **غيابَ الدالّة** (الواجهةُ سبقت الهجرة أو تراجعت: PGRST202/42883) فهو «الميزةُ غائبة»
 *    (absent) تُخفي البطاقةَ والشريط، لا «تعذّر» دائم (درسُ 0258).
 *  • الكتابةُ تُسمع: ترمي برمز الخادم (neg_stock_*) وتلميحه، و«القراءة فقط» يمنعها كباقي الكتابات.
 *  • الحالةُ مفتاحُها المستخدمُ والعيادة (`negKey`): جوابٌ يصل بعد تبديل العيادة يُرمى، وجوابٌ عن عيادةٍ غيرِ التي عرفها
 *    المفتاحُ يصفّر المعدودة — المشغّلُ يدخل عيادتين بتبويبٍ واحد (درسُ ١٣/١٠: نتيجةٌ من عيادةٍ تبدّلت ليست نتيجة).
 *  • تُسأل عند أوّل مشترك، وكلَّ دقيقةٍ والتابُ ظاهر **ما دامت مفعّلة** (أو فشل آخرُ سؤال)، وعند الرجوع للتاب أو للنتّ.
 *    المطفأةُ لا تُسأل كلَّ دقيقة: الكاشيرُ يسألها حين يرفض شيئاً (refreshNeg) فلا يقول «رصيده صفر» عن وضعٍ شُغّل للتو.
 *  • والجوابُ يعيش دقيقتين وحده (`activeNow`، negStock.ts) — سؤالٌ فشل لا يُبقي «مفعّل» قديماً.
 * ========================================================================= */
import { supabase } from "./supabase";
import { rpcJson } from "./rpcJson";
import { isConfigReadOnly } from "./clinicSync";
import { getActiveClinicId } from "./clinics";
import { readCounted, readNegCheck, readNegReport, readNegSet, readNegState, type NegCheck, type NegReport, type NegSetResult, type NegState } from "./negStock";
import type { CountLineInput, CountSubmitResult } from "@/types";
/* القواعدُ الصِّرفة لمن يصل إلى هنا بـimport() وحده (شاشةُ البيع لا تستورد negStock.ts ثابتاً — وحدةٌ مشتركةٌ ثابتة اسمٌ يدفعه الإقلاع). */
export { activeNow, bigLifted, daysLeft, lastDayOf, liftable } from "./negStock";

/** سطرُ فحص البيعة كما سترسله البيعة. */
export interface NegCheckLine { product_id: string; qty: number; stock_qty: number }
/** سطرُ جردٍ برصيده لحظةَ كتابة العدد (وحوضِ قسمه — لمادّةٍ رصيدُها ≤ ٠ بقسم: تُباع منه وصفُّها ثابت). */
export type CountLineSeen = CountLineInput & { seen?: number; seen_pool?: number };

export interface NegApi {
  state(): Promise<NegState>;
  report(): Promise<NegReport>;
  counted(): Promise<Set<string>>;
  check(clinic: string, lines: NegCheckLine[]): Promise<NegCheck>;
  set(clinic: string, on: boolean, days: number | null, ack: boolean, note: string | null): Promise<NegSetResult>;
  countSubmitSeen(lines: CountLineSeen[]): Promise<CountSubmitResult>;
}

type PgErr = { code?: string };
/** الدالّةُ غائبة بالقاعدة — لا خطأُ شبكةٍ ولا رفض. */
export function isAbsent(e: unknown): boolean {
  const c = (e as PgErr | null)?.code;
  return c === "PGRST202" || c === "42883";
}
function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}
const perf = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const tz = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad"; } catch { return "Asia/Baghdad"; }
};
const absentState = (): NegState => ({ clinic: null, active: false, used: false, until: null, since: null, endedAt: null, serverNow: null, at: perf(), absent: true });

const cloud: NegApi = {
  async state() {
    try { return readNegState(await rpcJson<unknown>("neg_stock_state", {}), perf()); }
    catch (e) { if (isAbsent(e)) return absentState(); throw e; }
  },
  async report() {
    try { return readNegReport(await rpcJson<unknown>("neg_stock_report", {}), perf()); }
    catch (e) {
      if (isAbsent(e)) return { ...absentState(), periodSince: null, capUntil: null, operator: false, negatives: 0, neverCounted: 0, uncountedNonpos: 0, uncountedNeg: 0, zeroCost: 0, zeroCostNonpos: 0, pending: 0, log: [] };
      throw e;
    }
  },
  counted: async () => readCounted(await rpcJson<unknown>("neg_stock_counted", {})),
  check: async (clinic, lines) => readNegCheck(await rpcJson<unknown>("neg_stock_check", { p_clinic: clinic, p_lines: lines })),
  async set(clinic, on, days, ack, note) {
    writable();
    return readNegSet(await rpcJson<unknown>("neg_stock_set",
      { p_clinic: clinic, p_on: on, p_days: days, p_ack: ack, p_note: note, p_tz: tz() }), perf());
  },
  async countSubmitSeen(lines) {
    writable();
    try {
      return await rpcJson<CountSubmitResult>("stock_count_submit_seen", { p_lines: lines });
    } catch (e) {
      // قاعدةٌ قبل 0266: البابُ القديم كما كان (بلا seen) — لا جردَ موقوفٌ لأن الهجرةَ تأخّرت.
      if (!isAbsent(e)) throw e;
      return rpcJson<CountSubmitResult>("stock_count_submit", { p_lines: lines.map(({ seen: _s, seen_pool: _p, ...l }) => l) });
    }
  },
};

/* التجريبيّ: العقدُ والحرّاسُ نفسُها على localStorage، كسولٌ من باب repoDemo وحده (demoNegStock.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoNeg());
const demo: NegApi = {
  state: async () => (await local()).demoNegState(perf()),
  report: async () => (await local()).demoNegReport(perf()),
  counted: async () => (await local()).demoNegCounted(),
  check: async (c, l) => (await local()).demoNegCheck(c, l),
  set: async (c, on, d, a, n) => { writable(); return (await local()).demoNegSet(c, on, d, a, n, perf()); },
  countSubmitSeen: async (l) => { writable(); return (await local()).demoCountSubmitSeen(l); },
};

export const negApi: NegApi = supabase ? cloud : demo;

/* ── الحالةُ المشتركة ──────────────────────────────────────────────────────────────────────────────────── */
export interface NegSnap {
  state: NegState | null;
  /** المعدودة (لا تُرفع) — تُحمَّل ما دام الوضعُ مفعّلاً. */
  counted: ReadonlySet<string>;
  /** فشل آخرُ سؤال (الشبكة، رفض) — «ما وصلنا الخادم». */
  failed: boolean;
}
interface Entry {
  snap: NegSnap;
  subs: Set<() => void>;
  gen: number;
  /** متى حُمّلت المعدودة (ساعة الأداء) — null: ما حُمّلت بعد. صفرٌ كان يعني «قبل خمس دقائق من فتح الصفحة» فلا تُحمَّل
   *  إلا بعدها: كلُّ معدودةٍ تُرفع بالكاشير خمسَ دقائق بعد كلّ فتح، والخادمُ يردّها عند البيعة (أمسكه neg-stock-test). */
  countedAt: number | null;
  /** العيادةُ التي أجاب عنها الخادمُ أوّلاً لهذا المفتاح — جوابٌ عن غيرها لا يُتبنّى (المشغّلُ دخل عيادةً أخرى بتبويبٍ ثانٍ:
   *  الجلسةُ واحدة)، ففحصُ البيعة يرسلها فيردّ الخادمُ neg_stock_clinic_changed — «ما تأكّدنا» لا حكمٌ عن عيادةٍ غيرِ التي بالشاشة. */
  clinic: string | null;
  /** gen آخرِ جوابٍ نُشر: جوابٌ أقدمُ منه يُرمى (لا يدوس ما هو أحدث)، وما سواه يُنشر ولو بدأ بعده سؤالٌ أحدث. */
  pubGen: number;
  timer: ReturnType<typeof setInterval> | null;
  stop: (() => void) | null;
}
const entries = new Map<string, Entry>();
const EMPTY: NegSnap = { state: null, counted: new Set(), failed: false };
const COUNTED_MS = 5 * 60_000;

/** مفتاحُ الحالة: المستخدمُ والعيادةُ المحلّية — لكلّ عيادةٍ حالتُها، وتبديلُها يبدأ من «لا نعرف». */
export function negKey(userId: string | null | undefined): string {
  let clinic = "default";
  try { clinic = getActiveClinicId() || "default"; } catch { /* بيئةٌ بلا تخزين */ }
  return `${userId ?? "anon"}|${clinic}`;
}

function entryOf(key: string): Entry {
  let e = entries.get(key);
  if (!e) { e = { snap: EMPTY, subs: new Set(), gen: 0, countedAt: null, clinic: null, pubGen: 0, timer: null, stop: null }; entries.set(key, e); }
  return e;
}
function publish(e: Entry, snap: NegSnap): void {
  e.snap = snap;
  for (const f of [...e.subs]) { try { f(); } catch { /* مشتركٌ رمى — لا يوقف غيره */ } }
}

export function negSnap(key: string): NegSnap { return entries.get(key)?.snap ?? EMPTY; }

/** يسأل الخادمَ الآن (والمعدودةَ إن لزم). لا يرمي، ويرجع بعد نشر جوابه (أو بعد أن نُشر أحدثُ منه) — فمنتظرُه يقرأ negSnap بعده.
 *  الجوابُ يُنشر ما لم يُنشر جوابٌ أحدثُ منه (pubGen)، لا «ما لم يبدأ سؤالٌ أحدث»: ذاك كان يرمي جواباً تامّاً حين يبدأ بعده سؤالٌ
 *  ثانٍ (ضغطةٌ ثانية، أو عودةُ التاب)، فإن فشل الثاني أو أبطأ بقيت الشاشةُ على ما قبلهما — الضغطةُ الأولى بعد التشغيل «انتهى» أو
 *  «زيد رصيده» عمّا يُباع (مراجعتان عدائيّتان: الأولى رأت الانتظار، والثانية أثبتت أنه لا يكفي). وجوابٌ عن مفتاحٍ نُسي يُرمى. */
export async function refreshNeg(key: string, opts: { counted?: boolean } = {}): Promise<NegState | null> {
  const e = entryOf(key);
  const gen = ++e.gen;
  const stale = () => entries.get(key) !== e || gen < e.pubGen;
  try {
    const s = await negApi.state();
    if (stale()) return s;
    if (s.clinic && e.clinic && s.clinic !== e.clinic) {
      // جوابٌ عن عيادةٍ غيرِ عيادة هذا المفتاح: لا يُتبنّى — الحالةُ القديمةُ تشيخ وحدها (activeNow) والفحصُ يقول «تبدّلت».
      publish(e, { ...e.snap, failed: true });
      return null;
    }
    if (s.clinic && !e.clinic) e.clinic = s.clinic;
    let counted = e.snap.counted;
    let countedAt: number | null = null;
    if (s.active && (opts.counted || e.countedAt === null || perf() - e.countedAt > COUNTED_MS)) {
      try {
        counted = await negApi.counted();
        countedAt = perf();
      } catch { /* المعدودةُ القديمة تبقى — والبيعةُ يحكم بها الخادم (counted) */ }
      if (stale()) return s;
    }
    /* الختمُ مع النشر لا قبله: سؤالٌ رُمي جوابُه كان يختم «حُمّلت» ولا ينشر، فيتخطّاها الأحدثُ وتبقى فارغةً خمسَ دقائق. */
    if (countedAt !== null) e.countedAt = countedAt;
    e.pubGen = gen;
    publish(e, { state: s, counted, failed: false });
    return s;
  } catch {
    // «فشل» يقوله أحدثُ سؤال وحده، وما لم يُنشر بعده أحدث — سؤالٌ أحدثُ بالطريق يحكم.
    if (e.gen === gen && !stale()) publish(e, { ...e.snap, failed: true });
    return null;
  }
}

/** يشترك بحالة المفتاح ويبدأ مراقبتَه (أوّلُ مشترك)؛ يرجع دالّةَ الإلغاء. */
export function subscribeNeg(key: string, fn: () => void): () => void {
  const e = entryOf(key);
  e.subs.add(fn);
  if (e.subs.size === 1 && !e.stop) {
    void refreshNeg(key);
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (e.snap.state?.active || e.snap.failed) void refreshNeg(key);
    };
    const onVis = () => { if (typeof document !== "undefined" && document.visibilityState === "visible") void refreshNeg(key); };
    const onOnline = () => void refreshNeg(key);
    e.timer = setInterval(tick, 60_000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    if (typeof window !== "undefined") window.addEventListener("online", onOnline);
    e.stop = () => {
      if (e.timer) clearInterval(e.timer);
      e.timer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    };
  }
  return () => {
    e.subs.delete(fn);
    if (e.subs.size === 0) { e.stop?.(); e.stop = null; entries.delete(key); e.gen++; }
  };
}
