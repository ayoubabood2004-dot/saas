// «خصم على الدين» (0241) — المكانُ الوحيد لحساب النافذة، مرآةُ forgive_invoice_debt حرفاً.
//
// كلُّ رقمٍ تعرضه النافذة (المتبقّي، ربحُ البيعة قبل أيّ خصم، المسموحُ داخل السقف، الخسارةُ)
// يُحسب هنا بنفس خطوات الدالّة وبنفس تقريبها (round(x, 2) بوستغريس: نصفٌ بعيداً عن الصفر)
// وبنفس التسامح (٠٫٠٠٥) — فما يقول «مسموح» هنا لا يرفضه الخادم، وما يقول «فوق السقف» هنا
// يقوله الخادمُ بالرمز نفسه. `validateForgive` ترجع **نفسَ رموز** الدالّة **بنفس ترتيبها**،
// والتجريبيُّ (repoDemo) يمرّ منها فيرفض بما يرفض به الخادم. والحالاتُ مفحوصةٌ بأرقام
// supabase/tests/run.sh نفسِها (scripts/debt-forgive-test.mjs).
//
// لا نصَّ عربياً هنا: الرموزُ ومفاتيحُ الترجمة وحدها — والنصُّ بالواجهة عبر t()، وتلميحاتُ
// التجريبيّ نسخةُ تلميحات الدالّة بـrepoDemo.
import type { DeliveryOrder, ForgiveReason, Invoice, InvoiceForgiveness, InvoiceItem, PaymentSplit } from "@/types";
import { dueOf, paidOf, grossOf } from "@/lib/debt";

/** تسامحُ الدالّة: فرقٌ دون فلسٍ ونصف ليس فرقاً. */
export const FORGIVE_TOL = 0.005;
/** `left(note, 500)` / `left(void_reason, 300)` بالدالّتين وقيدِ الجدول. */
export const FORGIVE_NOTE_MAX = 500;
export const VOID_REASON_MAX = 300;
/** ملاحظةُ ما فوق السقف: ٨ أحرف فأكثر؛ وسببُ الإلغاء: ٣ فأكثر. */
export const ABOVE_CAP_NOTE_MIN = 8;
export const VOID_REASON_MIN = 3;

/** `round(x, 2)` بوستغريس على numeric: النصفُ بعيداً عن الصفر (−٢٫٥٠٥ ⇒ −٢٫٥١)، وبلا انجرافِ
 *  العائم (١٫٠٠٥×١٠٠ = ١٠٠٫٤٩٩٩… ⇒ ١٠٠٫٥ قبل التقريب). `round2` بـdebt.ts يقرّب النصفَ السالب
 *  للأعلى — والسالبُ هنا وارد (ربحٌ بعد خسارة، سقفٌ من ربحٍ سالب)، فلا تُستبدل بها. */
export function pgRound2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const a = Math.round(Number((Math.abs(n) * 100).toPrecision(15))) / 100;
  return n < 0 ? (a === 0 ? 0 : -a) : a;
}

/** `btrim(s)` بلا وسيطٍ ثانٍ يقصّ **المسافةَ وحدها** — لا السطرَ ولا الجدولة. */
export const pgBtrim = (s: string): string => s.replace(/^ +| +$/g, "");
/** `char_length` و`left` بالمحارف (نقاطُ يونيكود) لا بوحدات UTF-16. */
const charLen = (s: string): number => Array.from(s).length;
const leftChars = (s: string, n: number): string => Array.from(s).slice(0, n).join("");
/** `left(nullif(btrim(coalesce(s, '')), ''), max)` */
export function pgCleanText(s: string | null | undefined, max: number): string | null {
  const t = pgBtrim(String(s ?? ""));
  return t === "" ? null : leftChars(t, max);
}

/** `rtrim(to_char(v, 'FM999,999,999,990.99'), '.')` — الرقمُ كما يكتبه تلميحُ الخادم (٢٥، ٣٧.٥، ١,٢٣٤.٥). */
export function pgMoneyText(n: number): string {
  const v = pgRound2(n);
  const [int, frac] = Math.abs(v).toFixed(2).split(".");
  const f = frac.replace(/0+$/, "");
  return `${v < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? `.${f}` : ""}`;
}

/* ── الأسباب ────────────────────────────────────────────────────────────── */
/** القائمةُ الثابتة بقيد الجدول وفحص الدالّة، بترتيب عرضها. «غير ذلك» يحتاج ملاحظة. */
/*  الرموزُ وحدها هنا: هذه الوحدةُ تُحمَّل من الإقلاع (repoDemo) فلا تحمل مفاتيحَ ترجمةٍ باردة (i18n-hot-guard) —
 *  مفاتيحُ الأسباب والرفض بـforgiveText.ts، تستوردها الواجهةُ خلف page() وحدها. */
export const REASON_CODES: readonly ForgiveReason[] = ["negotiation", "loyal", "hardship", "dispute", "other"];
export const isForgiveReason = (x: unknown): x is ForgiveReason => REASON_CODES.some((c) => c === x);

/* ── رموزُ الرفض — نفسُ رموز الدالّتين ─────────────────────────────────────── */
export const FORGIVE_ERRORS = [
  "not_allowed", "operator_not_allowed", "invoice_not_found", "invoice_refunded", "customer_required",
  "invoice_has_open_delivery", "due_changed", "reason_required", "note_required", "amount_invalid",
  "above_due", "above_profit_needs_owner", "confirm_loss_required",
] as const;
export type ForgiveErrorCode = (typeof FORGIVE_ERRORS)[number];
export const VOID_ERRORS = [
  "not_allowed", "operator_not_allowed", "reason_required", "entry_not_found", "invoice_not_found",
  "entry_not_voidable", "already_voided", "invoice_refunded", "invoice_has_open_delivery", "forgiveness_consumed",
] as const;
export type VoidErrorCode = (typeof VOID_ERRORS)[number];

/* ── الحساب ─────────────────────────────────────────────────────────────── */
/** ما تحتاجه الحسبةُ من الفاتورة (صفُّ invoices أو جزؤه). */
export type ForgiveInvoiceLike = Pick<Invoice, "total"> &
  Partial<Pick<Invoice, "amount_paid" | "profit" | "forgiven" | "cost_total" | "status" | "customer_name" | "customer_phone">>;

const num = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

/** المتبقّي كما تحسبه الدالّة: `greatest(round(total − coalesce(amount_paid, total), 2), 0)`. */
export const forgiveDueOf = (inv: ForgiveInvoiceLike): number =>
  Math.max(pgRound2(num(inv.total) - (inv.amount_paid == null ? num(inv.total) : num(inv.amount_paid))), 0);

/** نسبةُ العيادة كما تقرؤها الدالّة: `coalesce(forgive_profit_pct, 100)`. */
export const forgivePctOf = (pct: number | null | undefined): number => (pct == null || !Number.isFinite(Number(pct)) ? 100 : Number(pct));

export interface ForgiveCaps {
  /** الإجماليُّ الآن (بعد خصوماتٍ سابقة إن وُجدت). */
  total: number;
  /** المتبقّي قبل دفعة «التسوية». */
  dueBefore: number;
  /** دفعةُ «التسوية» بعد قصّها على المتبقّي (صفرٌ بـ«خصم فقط»). */
  pay: number;
  /** المدفوعُ بعد الدفعة. */
  paid: number;
  /** المتبقّي بعد الدفعة — السقفُ المطلق للخصم. */
  due: number;
  /** الربحُ الآن (بعد خصوماتٍ سابقة). */
  profit: number;
  /** ما خُصم قبلُ على هذه الفاتورة (صافياً). */
  forgiven: number;
  /** ربحُ البيعة قبل أيّ خصمٍ على الدين: profit + forgiven. */
  profitBase: number;
  pct: number;
  /** سقفُ مجموع الخصومات: round(pct × profitBase / 100, 2). */
  capTotal: number;
  /** المسموحُ لهذا الخصم داخل السقف: max(0, min(due, capTotal − forgiven)). */
  allowedWithin: number;
  /** = due. */
  maxAbsolute: number;
  /** ما استُعمل من السقف قبل هذا الخصم (٠..١ وقد يتجاوز ١ بعد خسارةٍ معتمدة)، null بلا سقف. */
  usedOfCap: number | null;
}

/** خطواتُ الدالّة حتى السقف: المتبقّي ← دفعةُ التسوية مقصوصةً عليه ← المتبقّي بعدها ← السقف. */
export function forgiveCaps(inv: ForgiveInvoiceLike, pct?: number | null, pay?: number | null): ForgiveCaps {
  const total = num(inv.total);
  const dueBefore = forgiveDueOf(inv);
  const payR = Math.max(0, pgRound2(num(pay)));
  const payC = Math.min(payR, dueBefore);
  const paid = payC > 0 ? pgRound2(num(inv.amount_paid) + payC) : (inv.amount_paid == null ? total : num(inv.amount_paid));
  const due = payC > 0 ? Math.max(pgRound2(total - paid), 0) : dueBefore;
  const profit = num(inv.profit);
  const forgiven = num(inv.forgiven);
  const profitBase = pgRound2(profit + forgiven);
  const p = forgivePctOf(pct);
  const capTotal = pgRound2(p * profitBase / 100);
  const allowedWithin = Math.max(0, Math.min(due, pgRound2(capTotal - forgiven)));
  return {
    total, dueBefore, pay: payC, paid, due, profit, forgiven, profitBase, pct: p, capTotal, allowedWithin,
    maxAbsolute: due, usedOfCap: capTotal > 0 ? forgiven / capTotal : null,
  };
}

export interface ForgivePreview {
  /** الخصمُ مقرَّباً لمنزلتين ومقصوصاً على المتبقّي (كما يُكتب). */
  amount: number;
  /** المطلوبُ أكبر من المتبقّي بأكثر من التسامح ⇒ الخادمُ يرفض (above_due). */
  aboveDue: boolean;
  dueAfter: number;
  totalAfter: number;
  profitAfter: number;
  forgivenAfter: number;
  /** مجموعُ الخصومات (مع هذا) نسبةً من ربح البيعة قبل أيّ خصم — null إن لم يكن ربح. */
  pctOfProfit: number | null;
  /** الربحُ بعده نسبةً من الإجمالي بعده — null إن صار الإجماليُّ صفراً. */
  marginAfter: number | null;
  /** فوق المسموح من الربح ⇒ صاحبُ العيادة من حسابه + ملاحظة + إقرار. */
  aboveCap: boolean;
  /** «بيعٌ بخسارة X»: max(0, round(amount − profit, 2)) — نفسُ رقم تلميح الخادم. */
  loss: number;
  allowedWithin: number;
  /** ما يُستعمل من السقف مع هذا الخصم (٠..)، null بلا سقف. */
  usedOfCap: number | null;
}

/** ما بعد الخصم — كلُّ رقمٍ تعرضه النافذة سطراً حيّاً. */
export function forgivePreview(caps: ForgiveCaps, amount: number | null | undefined): ForgivePreview {
  const raw = pgRound2(num(amount));
  const aboveDue = raw > caps.due + FORGIVE_TOL;
  const amt = Math.max(0, Math.min(raw, caps.due));
  const totalAfter = pgRound2(caps.total - amt);
  const profitAfter = pgRound2(caps.profit - amt);
  const forgivenAfter = pgRound2(caps.forgiven + amt);
  return {
    amount: amt, aboveDue,
    dueAfter: Math.max(0, pgRound2(caps.due - amt)),
    totalAfter, profitAfter, forgivenAfter,
    pctOfProfit: caps.profitBase > 0 ? (forgivenAfter / caps.profitBase) * 100 : null,
    marginAfter: totalAfter > 0 ? (profitAfter / totalAfter) * 100 : null,
    aboveCap: amt > caps.allowedWithin + FORGIVE_TOL,
    loss: Math.max(0, pgRound2(amt - caps.profit)),
    allowedWithin: caps.allowedWithin,
    usedOfCap: caps.capTotal > 0 ? forgivenAfter / caps.capTotal : null,
  };
}

/* ── التحقّق — نفسُ رموز الدالّة بنفس ترتيبها ─────────────────────────────── */
/** من يطلب: auth_clinic/auth.uid، والمشغّلُ داخل العيادة (0151)، وauth_role() (المفتاحُ يرفعه)،
 *  وauth_role_base() (الدورُ الأساس)، وهل رفعُ المفتاح حيّ (pin_elevation_live). */
export interface ForgiveActor {
  signedIn: boolean;
  operator: boolean;
  role: string | null;
  base: string | null;
  pin: boolean;
}

/** الطالبُ من دوره الأساس ورفعِ المفتاح — `auth_role()` = مدير إن كان الأساسُ مديراً أو المفتاحُ حيّاً.
 *  الواجهةُ تبنيه من دورها الأساس (usePermissions) و`overrideActive()`، والتجريبيُّ من جلسته؛ فحكمُ
 *  «فوق السقف يحتاج صاحبَ العيادة من حسابه» يُقال **قبل** أن تُطلب ملاحظةٌ وإقرار. */
export function forgiveActor(x: { base: string | null | undefined; pin: boolean; operator?: boolean; signedIn?: boolean }): ForgiveActor {
  const base = x.base ?? null;
  return { signedIn: x.signedIn ?? true, operator: !!x.operator, base, pin: !!x.pin, role: base === "manager" || x.pin ? "manager" : base };
}

export interface ForgiveCheckInput {
  /** **لازم**: فحصٌ بلا طالب كان يتخطّى فرعَ «المفتاحُ أو غيرُ المدير ⇒ صاحبُ العيادة» فيقول «مسموح» عمّا
   *  يرفضه الخادمُ دائماً (above_profit_needs_owner). */
  actor: ForgiveActor;
  inv: ForgiveInvoiceLike | null | undefined;
  openDelivery: boolean;
  pct?: number | null;
  amount: number | null | undefined;
  reason: string | null | undefined;
  note?: string | null;
  expectDue?: number | null;
  pay?: number | null;
  confirmLoss?: boolean | null;
}

export type ForgiveCheck =
  | { ok: true; amount: number; pay: number; reason: ForgiveReason; note: string | null; aboveCap: boolean; loss: number; caps: ForgiveCaps; preview: ForgivePreview }
  | { ok: false; code: ForgiveErrorCode; due?: number; allowed?: number; loss?: number; pin?: boolean; aboveCap?: boolean };

export function validateForgive(x: ForgiveCheckInput): ForgiveCheck {
  const a = x.actor;
  if (!a || !a.signedIn) return { ok: false, code: "not_allowed" };
  if (a.operator) return { ok: false, code: "operator_not_allowed" };
  if ((a.role ?? "") !== "manager") return { ok: false, code: "not_allowed" };
  const inv = x.inv;
  if (!inv) return { ok: false, code: "invoice_not_found" };
  if (inv.status === "refunded") return { ok: false, code: "invoice_refunded" };
  if (pgCleanText(inv.customer_name, Infinity) == null && pgCleanText(inv.customer_phone, Infinity) == null) {
    return { ok: false, code: "customer_required" };
  }
  if (x.openDelivery) return { ok: false, code: "invoice_has_open_delivery" };

  const due0 = forgiveDueOf(inv);
  if (x.expectDue != null && Number.isFinite(Number(x.expectDue)) && Math.abs(pgRound2(Number(x.expectDue)) - due0) > FORGIVE_TOL) {
    return { ok: false, code: "due_changed", due: due0 };
  }
  const reason = pgCleanText(x.reason, Infinity);
  if (reason == null || !isForgiveReason(reason)) return { ok: false, code: "reason_required" };
  const note = pgCleanText(x.note, FORGIVE_NOTE_MAX);
  if (reason === "other" && note == null) return { ok: false, code: "note_required", aboveCap: false };
  const amt0 = pgRound2(num(x.amount));
  const pay0 = pgRound2(num(x.pay));
  if (amt0 <= 0 || pay0 < 0) return { ok: false, code: "amount_invalid" };

  const caps = forgiveCaps(inv, x.pct, pay0);
  if (amt0 > caps.due + FORGIVE_TOL) return { ok: false, code: "above_due", due: caps.due };
  const preview = forgivePreview(caps, amt0);
  if (preview.aboveCap) {
    if (a.pin || (a.base ?? "") !== "manager") {
      return { ok: false, code: "above_profit_needs_owner", allowed: caps.allowedWithin, pin: a.pin };
    }
    if (note == null || charLen(note) < ABOVE_CAP_NOTE_MIN) return { ok: false, code: "note_required", aboveCap: true };
    if (!x.confirmLoss) return { ok: false, code: "confirm_loss_required", loss: preview.loss, allowed: caps.allowedWithin };
  }
  return { ok: true, amount: preview.amount, pay: caps.pay, reason, note, aboveCap: preview.aboveCap, loss: preview.loss, caps, preview };
}

export interface VoidCheckInput {
  actor: ForgiveActor;
  reason: string | null | undefined;
  entry: Pick<InvoiceForgiveness, "kind" | "amount" | "voided_at"> | null | undefined;
  inv: Pick<Invoice, "status" | "forgiven"> | null | undefined;
  openDelivery: boolean;
}
export type VoidCheck = { ok: true; reason: string } | { ok: false; code: VoidErrorCode };

/** مرآةُ void_invoice_forgiveness بترتيبها: السببُ يُفحص قبل البحث عن السطر. */
export function validateVoid(x: VoidCheckInput): VoidCheck {
  const a = x.actor;
  if (!a || !a.signedIn) return { ok: false, code: "not_allowed" };
  if (a.operator) return { ok: false, code: "operator_not_allowed" };
  if ((a.role ?? "") !== "manager") return { ok: false, code: "not_allowed" };
  const reason = pgCleanText(x.reason, VOID_REASON_MAX);
  if (reason == null || charLen(reason) < VOID_REASON_MIN) return { ok: false, code: "reason_required" };
  if (!x.entry) return { ok: false, code: "entry_not_found" };
  if (!x.inv) return { ok: false, code: "invoice_not_found" };
  if (x.entry.kind !== "forgive") return { ok: false, code: "entry_not_voidable" };
  if (x.entry.voided_at) return { ok: false, code: "already_voided" };
  if (x.inv.status === "refunded") return { ok: false, code: "invoice_refunded" };
  if (x.openDelivery) return { ok: false, code: "invoice_has_open_delivery" };
  if (num(x.inv.forgiven) + FORGIVE_TOL < num(x.entry.amount)) return { ok: false, code: "forgiveness_consumed" };
  return { ok: true, reason };
}

/* ── قواعدُ مشتركة مع المرتجع والتعديل والتوصيل ───────────────────────────── */
/** المرتجعُ والتعديلُ يستهلكان الخصمَ قبل النقد (0241):
 *  forgiven_new = min(forgiven, max(0, raw − paid))؛ total = round(raw − forgiven_new, 2).
 *  `raw` = max(0, round(subtotal − discount, 2)). `consumed` > 0 ⇒ سطرُ consumed بالسالب. */
export function consumeForgiveness(raw: number, paid: number, forgiven: number | null | undefined): { forgiven: number; total: number; consumed: number } {
  const old = Math.max(0, num(forgiven));
  const next = Math.min(old, Math.max(0, pgRound2(num(raw) - num(paid))));
  return { forgiven: next, total: pgRound2(num(raw) - next), consumed: pgRound2(old - next) };
}

/** قاعدةُ دفتر الديون حرفاً (DebtsPanel، والدالّتان): يجهَّز/بالطريق، أو وصل ولم يُحصَّل —
 *  المَدينُ حينها السائقُ أو الشركة لا الزبون. */
export const isOpenDeliveryFor = (o: Pick<DeliveryOrder, "status" | "collected_at">): boolean =>
  o.status === "preparing" || o.status === "out" || (o.status === "delivered" && !o.collected_at);
export const hasOpenDelivery = (orders: readonly Pick<DeliveryOrder, "invoice_id" | "status" | "collected_at">[] | null | undefined, invoiceId: string): boolean =>
  (orders ?? []).some((o) => o.invoice_id === invoiceId && isOpenDeliveryFor(o));

/* ── حسابُ الزبون بالنافذة ─────────────────────────────────────────────────── */
export interface ForgiveAccount {
  /** الفواتيرُ الحيّة (بلا المرجعة). */
  count: number;
  bought: number;
  paid: number;
  /** ما على الزبون نفسه — بلا ما بذمّة التوصيل (قاعدةُ DebtsPanel حرفاً). */
  due: number;
  /** ما بذمّة السائق أو الشركة على فواتيره (طلبٌ مفتوح) — ليس ديناً على الزبون. */
  courierDue: number;
  /** الخصوماتُ السابقة: عددُها ومجموعُها كما مُنحت (الحيّةُ، لا الملغاة)، وما رجع منها بمرتجعٍ أو تعديل.
   *  العددُ والمبلغُ من نفس السطور — «١ مرّة · ٠» عن خصمٍ استهلكه مرتجع كان يقول عددَ شيءٍ ومبلغَ آخر. */
  priorCount: number;
  priorGranted: number;
  priorBack: number;
}
export function forgiveAccount(
  invoices: readonly Invoice[],
  ledger: readonly Pick<InvoiceForgiveness, "invoice_id" | "kind" | "amount" | "voided_at">[],
  orders: readonly Pick<DeliveryOrder, "invoice_id" | "status" | "collected_at">[] | null | undefined,
): ForgiveAccount {
  const live = invoices.filter((i) => (i.status ?? "paid") !== "refunded");
  const ids = new Set(live.map((i) => i.id));
  let bought = 0, paid = 0, due = 0, courierDue = 0;
  for (const i of live) {
    bought += grossOf(i);
    paid += paidOf(i);
    if (hasOpenDelivery(orders, i.id)) courierDue += dueOf(i); else due += dueOf(i);
  }
  let priorCount = 0, priorGranted = 0, priorBack = 0;
  for (const r of ledger) {
    if (!ids.has(r.invoice_id)) continue;
    if (r.kind === "forgive" && !r.voided_at) { priorCount++; priorGranted += num(r.amount); }
    else if (r.kind === "consumed") priorBack += Math.abs(num(r.amount));
  }
  return {
    count: live.length, bought: pgRound2(bought), paid: pgRound2(paid), due: pgRound2(due), courierDue: pgRound2(courierDue),
    priorCount, priorGranted: pgRound2(priorGranted), priorBack: pgRound2(priorBack),
  };
}

/* ── «خصومات الديون» بالتقارير ─────────────────────────────────────────────── */
/** يُحسب بالمجموع؟ لا الملغى، ولا ما على فاتورةٍ مرجعة (الفاتورةُ كلُّها خرجت من المبيعات). */
export const forgiveRowCounts = (r: Pick<InvoiceForgiveness, "voided_at"> & { invoice_status?: string | null }): boolean =>
  !r.voided_at && (r.invoice_status ?? "paid") !== "refunded";
export interface ForgiveTotals {
  /** ما مُنح بالفترة (سطورُ forgive الحيّة) وعددُه — وهو ما تجمعه مجموعاتُ «من وافق» و«السبب». */
  granted: number;
  count: number;
  /** ما رجع بالفترة بمرتجعٍ أو تعديل (سطورُ consumed، موجباً). */
  back: number;
  /** granted − back: قد يكون سالباً بفترةٍ فيها مرتجعٌ وحده — فلا يُطبع «− -10» أبداً. */
  net: number;
}
export function forgiveTotals(rows: readonly (Pick<InvoiceForgiveness, "kind" | "amount" | "voided_at"> & { invoice_status?: string | null })[]): ForgiveTotals {
  let granted = 0, count = 0, back = 0;
  for (const r of rows) {
    if (!forgiveRowCounts(r)) continue;
    if (r.kind === "forgive") { granted += num(r.amount); count++; } else back += Math.abs(num(r.amount));
  }
  granted = pgRound2(granted); back = pgRound2(back);
  return { granted, count, back, net: pgRound2(granted - back) };
}

/** مَن وافق: اسمُ الكادر، وإلا صاحبُ العيادة — حسابُه معرّفُ العيادة ولا صفَّ كادرٍ له (0083 تستثنيه:
 *  `clinic_id <> user_id`)، وكلُّ خصمٍ فوق السقف بيده هو — وإلا مجهول. */
export type Approver = { kind: "name"; name: string } | { kind: "owner" } | { kind: "unknown" };
export function approverOf(id: string | null | undefined, name: string | null | undefined, clinicId: string | null | undefined): Approver {
  const n = (name ?? "").trim();
  if (n) return { kind: "name", name: n };
  if (id && clinicId && id === clinicId) return { kind: "owner" };
  return { kind: "unknown" };
}

/** سطورُ منتجٍ كلفتُها صفر: ربحُ الفاتورة المعروض أعلى من الحقيقيّ، فالنافذةُ تحذّر.
 *  (سطرٌ بلا منتج — خدمة، أجرةُ توصيل — كلفتُه صفرٌ بطبيعته ولا يُعدّ.) */
export const zeroCostProductLines = (items: readonly InvoiceItem[] | null | undefined): InvoiceItem[] =>
  (items ?? []).filter((it) => !!it.product_id && num(it.qty) > 0 && !(num(it.unit_cost) > 0));
export const profitOverstated = (items: readonly InvoiceItem[] | null | undefined): boolean => zeroCostProductLines(items).length > 0;

/* ── سِيَقُ الدفع لغير المدير: الطريقةُ وحدها (invoices_guard_legs) ─────────── */
/** مساواةُ jsonb: ترتيبُ المفاتيح لا يهمّ، والأرقامُ بقيمتها. */
function jsonbEq(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (typeof x === "number" || typeof y === "number") return typeof x === "number" && typeof y === "number" && x === y;
  if (x === null || y === null || typeof x !== "object" || typeof y !== "object") return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  if (Array.isArray(x)) {
    const ya = y as unknown[];
    return x.length === ya.length && x.every((v, i) => jsonbEq(v, ya[i]));
  }
  const xo = x as Record<string, unknown>, yo = y as Record<string, unknown>;
  const kx = Object.keys(xo), ky = Object.keys(yo);
  return kx.length === ky.length && kx.every((k) => k in yo && jsonbEq(xo[k], yo[k]));
}
const asJson = (v: unknown): unknown => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const withoutMethod = (v: unknown): unknown => {
  const rest = { ...(v as Record<string, unknown>) };
  delete rest.method;
  return rest;
};

/** هل يجوز لغير المدير هذا التغيير على السِّيَق؟ نعم إن لم يتغيّر شيء، أو تغيّرت **طريقةُ**
 *  ساقٍ قائمة وحدها بمكانها — لا مبلغٌ ولا وقتٌ ولا ملاحظةٌ ولا عددٌ ولا ترتيب. */
export function legsChangeAllowedForStaff(oldLegs: readonly PaymentSplit[] | null | undefined, newLegs: readonly PaymentSplit[] | null | undefined): boolean {
  const o = asJson(oldLegs ?? []), n = asJson(newLegs ?? []);
  if (jsonbEq(o, n)) return true;
  if (!Array.isArray(o) || !Array.isArray(n) || o.length !== n.length) return false;
  for (let i = 0; i < o.length; i++) {
    if (jsonbEq(o[i], n[i])) continue;
    const oi = o[i], ni = n[i];
    if (oi === null || ni === null || typeof oi !== "object" || typeof ni !== "object" || Array.isArray(oi) || Array.isArray(ni)) return false;
    if (!jsonbEq(withoutMethod(oi), withoutMethod(ni))) return false;
  }
  return true;
}
