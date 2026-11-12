/* ============================================================================
 * البيعُ قبل الجرد (0266) — الأنواعُ والقواعدُ الصِّرفة، بلا استيراد: تستوردها الشاشاتُ الكسولة ولا تجرّ شيئاً، وتُفحص بسلوكها.
 *
 * الوضعُ مؤقّتٌ لعيادةٍ موادُّها انضافت ولم تُعدّ: الكاشيرُ يبيع المادّة ولو صار رصيدُها بالنظام تحت الصفر، حتى تُعدّ.
 * والخادمُ يبيع تحت الصفر لكلّ عيادةٍ أصلاً (0253) — «رصيده صفر» منعٌ بالواجهة وحدها، وهنا متى يُرفع:
 *  • الحالةُ من الخادم بساعته (neg_stock_state) وتعيش دقيقتين وحدها (`activeNow`): جوابٌ أقدم، أو سؤالٌ فشل، لا يرفع شيئاً —
 *    وساعةُ الجهاز لا تحكم (هاتفٌ متأخّرٌ يومين كان سيرفع بعد الانتهاء).
 *  • لا تُرفع المجمَّعةُ (رصيدُها بحوض قسمها وبلا سقفٍ أصلاً) ولا الحقلُ ولا الدولار (شاشتُه بلا سقف)، ولا **المعدودة**: عدٌّ
 *    مطابقٌ أو موافَقٌ عليه = رصيدٌ موثوق، فتُعامل كما بلا الوضع (سجّل شراءها). والكلفةُ يحكم بها المستدعي بمرآة الخادم لسطره
 *    (productLineCost بالشاشة) — سطرٌ كلفتُه صفر لا يُرفع: يُجمَّد بفاتورته ربحاً كاملاً.
 *  • ما رفعه الوضعُ فوق الرصيد **يُعلَّم بسطره** (`negLift`)، وقبل البيعة يُسأل الخادمُ عنه وحده (neg_stock_check): سطرٌ تجاوز
 *    رصيدَه بلا الوضع (قائمةٌ قديمة، مسودّةٌ رجعت) يمرّ كما كان — قرارُ المالك ب٢ (٣١/١٠) لكلّ عيادة.
 * ========================================================================= */

/** لماذا لا يُباع سطرٌ تحت الصفر الآن (رموزُ neg_stock_check). */
export type NegWhy = "off" | "gone" | "not_lifted" | "counted" | "zero_cost";

export interface NegState {
  /** العيادةُ التي أجاب عنها الخادم (auth_clinic) — يُمرَّر للكتابة والفحص فيُرفض إن تبدّلت. */
  clinic: string | null;
  /** مفعّلٌ بساعة الخادم لحظةَ الجواب. */
  active: boolean;
  /** للعيادة سطرٌ بالدفتر — استعملت الوضعَ يوماً (فرصيدُ موادّها المنقولة ما انعدّ بعد). */
  used: boolean;
  /** نهايةُ الفترة (ISO) — والمنتهي بالوقت يبقى بها. */
  until: string | null;
  /** بدايةُ الفترة الجارية. */
  since: string | null;
  /** متى انتهى آخرُ وضع (إطفاءٌ أو انتهاءٌ بالوقت) — «انتهى بـ…». */
  endedAt: string | null;
  /** ساعةُ الخادم لحظةَ الجواب. */
  serverNow: string | null;
  /** لحظةُ وصول الجواب بساعة الأداء (performance.now) — لعمره لا للحكم. */
  at: number;
  /** الدالّةُ غائبة (الواجهةُ سبقت الهجرة، أو تراجع) — الميزةُ مخفيّة، لا «تعذّر» دائم. */
  absent?: boolean;
}

export interface NegRefusal { productId: string; why: NegWhy; name: string | null; stock: number | null }
export interface NegCheck { clinic: string | null; active: boolean; until: string | null; refused: NegRefusal[] }

export type NegAction = "on" | "extend" | "off";
export interface NegLogRow {
  at: string; action: NegAction; since: string | null; until: string | null;
  byName: string | null; note: string | null; negatives: number | null; neverCounted: number | null; pending: number | null;
}
export interface NegReport extends NegState {
  /** بدايةُ الفترة التي سيقع فيها تشغيلٌ أو تمديدٌ الآن، وسقفُها (٦٠ يوماً) — المددُ فوقه تُعطَّل لغير المشغّل. */
  periodSince: string | null; capUntil: string | null;
  /** المستدعي مشغّلُ المنصّة: ما فوق السقف له، والملاحظةُ عليه. */
  operator: boolean;
  /** negatives: كلُّ ما تحت الصفر (المعدودةُ معها)؛ uncountedNonpos/uncountedNeg: غيرُ المعدودة بالصفر أو تحته / تحته. */
  negatives: number; neverCounted: number; uncountedNonpos: number; uncountedNeg: number; zeroCost: number; zeroCostNonpos: number; pending: number;
  log: NegLogRow[];
}

const shape = (): Error => Object.assign(new Error("neg_shape"), { code: "neg_shape" });
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < 0) throw shape();
  return n;
};
const intOrNull = (v: unknown): number | null => (v == null ? null : int(v));

/** جوابُ neg_stock_state كما يصل — يُقرأ بالضبط أو يرمي: حالةٌ مكسورةٌ لا تصير «مطفأ» ولا «مفعّل» بصمت. */
export function readNegState(x: unknown, at: number): NegState {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.active !== "boolean") throw shape();
  const until = str(r.until), serverNow = str(r.now);
  if (r.active && (!until || !serverNow)) throw shape();
  return { clinic: str(r.clinic_id), active: r.active, used: r.used === true, until, since: str(r.since), endedAt: str(r.ended_at), serverNow, at };
}

const WHYS: readonly NegWhy[] = ["off", "gone", "not_lifted", "counted", "zero_cost"];
/** جوابُ neg_stock_check: كلُّ مرفوضٍ بسببه — وسببٌ لا نعرفه رفضٌ لا قبول. */
export function readNegCheck(x: unknown): NegCheck {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.active !== "boolean" || !Array.isArray(r.refused)) throw shape();
  const refused = r.refused.map((e): NegRefusal => {
    const o = e as Record<string, unknown> | null;
    const id = str(o?.product_id);
    if (!o || !id) throw shape();
    const why = WHYS.includes(o.why as NegWhy) ? (o.why as NegWhy) : "off";
    const stock = o.stock == null ? null : Number(o.stock);
    return { productId: id, why, name: str(o.name), stock: Number.isFinite(stock) ? stock : null };
  });
  return { clinic: str(r.clinic_id), active: r.active, until: str(r.until), refused };
}

/** جوابُ neg_stock_set: الحالةُ بعد الضغطة، وهل كتبت سطراً. لا ⇒ «ما تغيّر شي» / «كان مطفّى» — بطاقةٌ فُتحت قبل ضغطة مديرٍ ثانٍ تقيس
 *  على تقريرها القديم فتقول «تمدّد» لما لم يُكتب. والغائبُ (قاعدةٌ أقدم) «كتبت» كما كانت الرسالة. */
export interface NegSetResult extends NegState { changed: boolean; action: NegAction | null }
export function readNegSet(x: unknown, at: number): NegSetResult {
  const s = readNegState(x, at);
  const r = x as Record<string, unknown>;
  const a = r.action;
  return { ...s, changed: r.changed !== false, action: a === "on" || a === "extend" || a === "off" ? a : null };
}

/** جوابُ neg_stock_report: الحالةُ + العدُّ + الدفتر. */
export function readNegReport(x: unknown, at: number): NegReport {
  const s = readNegState(x, at);
  const r = x as Record<string, unknown>;
  if (!Array.isArray(r.log)) throw shape();
  const log = r.log.map((e): NegLogRow => {
    const o = e as Record<string, unknown> | null;
    const action = o?.action;
    if (!o || (action !== "on" && action !== "extend" && action !== "off") || !str(o.at)) throw shape();
    return {
      at: o.at as string, action, since: str(o.since), until: str(o.until), byName: str(o.by_name), note: str(o.note),
      negatives: intOrNull(o.negatives), neverCounted: intOrNull(o.never_counted), pending: intOrNull(o.pending),
    };
  });
  return {
    ...s, periodSince: str(r.period_since), capUntil: str(r.cap_until), operator: r.operator === true, negatives: int(r.negatives), neverCounted: int(r.never_counted), uncountedNonpos: int(r.uncounted_nonpos),
    uncountedNeg: int(r.uncounted_neg), zeroCost: int(r.zero_cost), zeroCostNonpos: int(r.zero_cost_nonpos), pending: int(r.pending), log,
  };
}

/** neg_stock_counted: معرّفاتُ المعدودة (عدٌّ مطابقٌ أو موافَقٌ عليه). */
export function readCounted(x: unknown): Set<string> {
  if (!Array.isArray(x) || x.some((v) => typeof v !== "string")) throw shape();
  return new Set(x as string[]);
}

/** عمرُ الجواب الذي يُرفع به: دقيقتان، وقبل النهاية بساعة الخادم (لا الجهاز). */
export const NEG_TTL_MS = 120_000;

/**
 * مفعّلٌ الآن؟ جوابٌ مفعّلٌ عمرُه أقلّ من `ttl` (بساعة الأداء) ولم تبلغ نهايتَه بساعة الخادم مضافاً إليها عمرُه.
 * غيرُ ذلك — بلا جواب، أو مطفأ، أو قديم — لا يرفع شيئاً.
 */
export function activeNow(s: NegState | null | undefined, nowPerf: number, ttl = NEG_TTL_MS): boolean {
  if (!s || !s.active || s.absent) return false;
  const age = nowPerf - s.at;
  if (!(age >= 0) || age > ttl) return false;
  if (!s.until || !s.serverNow) return false;
  const left = Date.parse(s.until) - Date.parse(s.serverNow) - age;
  return Number.isFinite(left) && left > 0;
}

/** ما يحتاجه حكمُ «يُرفع؟» من صفّ المادّة — والكلفةُ خارجه (بمرآة الخادم لسطره). */
export interface LiftRow { id: string; pooled?: boolean | null; farm_id?: string | null; price_currency?: string | null }

/** مادّةٌ يرفعها الوضعُ إن كان مفعّلاً وكلفةُ سطرها موجبة: حيّةٌ بالعيادة، لا مجمَّعة ولا حقل ولا دولار، وما انعدّت. */
export function liftable(p: LiftRow | null | undefined, counted: ReadonlySet<string>): boolean {
  return !!p && !p.pooled && !p.farm_id && p.price_currency !== "USD" && !counted.has(p.id);
}

/** آخرُ يومٍ كامل بالوضع (النهايةُ الثالثة فجراً بعده) — «لحد ليلة {{يوم}}». */
export function lastDayOf(until: string): Date {
  return new Date(Date.parse(until) - 27 * 3_600_000);
}

/** أيّامٌ متبقّية للعرض بساعة الخادم المصحَّحة بعمر الجواب — ٠ إن انتهت. */
export function daysLeft(s: NegState, nowPerf: number): number {
  if (!s.until || !s.serverNow) return 0;
  const left = Date.parse(s.until) - Date.parse(s.serverNow) - Math.max(0, nowPerf - s.at);
  return left > 0 ? Math.ceil(left / 86_400_000) : 0;
}

/** كميةٌ كبيرةٌ لسطرٍ رفعه الوضع: ما يعادل ١٠ علب، أو ٢٥ كيلو للموزون — لا ١٠ حبّات من علبة مئة. */
export function bigLifted(qty: number, u: { sub?: boolean; unitsPerBox?: number | null; byWeight?: boolean }): boolean {
  if (u.byWeight) return qty >= 25;
  const boxes = u.sub && u.unitsPerBox && u.unitsPerBox > 0 ? qty / u.unitsPerBox : qty;
  return boxes >= 10;
}

/** «سالبة» بتعريفٍ واحد للجرد والإعدادات (مرآةُ _neg_stock_counts): حيّةٌ بالعيادة رصيدُها تحت الصفر. */
export function isNegativeRow(p: LiftRow & { stock?: number | null }): boolean {
  return !p.pooled && !p.farm_id && p.price_currency !== "USD" && (Number(p.stock) || 0) < 0;
}

/* ── أنواعُ ما تتبادله شاشةُ البيع والمالكُ الكسول (NegStock.tsx) — هنا لا هناك: نوعٌ من المالك استيرادٌ ثابتٌ له ── */
/** رسالةٌ تطلبها شاشةُ البيع (n يتغيّر لكلّ طلب). */
export type NegSay =
  | { kind: "noCost"; name: string; productId?: string; canOpen?: boolean; n: number }
  | { kind: "counted"; name: string; stock: number; n: number }
  | { kind: "ended"; name: string; stock: number; n: number }
  /** جوابُ «مفعّل» تجاوز عمرَه وسؤالُه ما رجع: الوضعُ ربما شغّال — لا «انتهى» ولا «زيد رصيده». */
  | { kind: "unsure"; name: string; n: number };
export interface NegBarView { active: boolean; until: string | null; endedAt: string | null; lastNight: boolean }
/** سطرٌ مرفوضٌ بنافذة ما قبل البيعة: الكميةُ والرصيدُ بوحدة السطر، و`keep` ما يبقى منه إن شيل الزائد (صفرٌ يشيله). */
export interface NegRefusedLine { id: string; name: string; qty: number; stock: number | null; why: NegWhy | "unsure"; keep?: number }
