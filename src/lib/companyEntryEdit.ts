/* ============================================================================
 * تعديلُ الرصيد السابق والتسوية بدفتر الشركة (0281) — الحسابُ النقيّ الذي تعرضه النافذةُ قبل الحفظ.
 *
 * الخادمُ يقرّر (company_entry_edit): المديرُ وحده، والسببُ إلزاميّ، وما رآه شرطُ الكتابة، والدائنُ لا ينزل تحت ما انسدّ منه.
 * هنا مرآتُها للعرض: ماذا سيتغيّر، وكم يصير الرصيد، ولماذا الزرُّ موقوف — **بجملة** (زرٌّ معطَّلٌ بلا كلمة كذبةٌ صامتة،
 * درسُ «14.169.000»). وما يرفضه الخادمُ رغم هذا يُقال بتلميحه.
 * ========================================================================= */
import type { CompanyEntry } from "@/types";

export interface EntrySnap { amount: number; date: string; note: string | null }
export interface CompanyEntryEdit { at: string; by: string | null; reason: string; before: EntrySnap; after: EntrySnap }

const r2 = (n: number) => Math.round(n * 100) / 100;
const noteOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function snapOf(v: unknown): EntrySnap | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const amount = Number(o.amount);
  const date = typeof o.date === "string" ? o.date.slice(0, 10) : "";
  if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { amount: r2(amount), date, note: noteOf(o.note) };
}

/** سجلُّ التعديلات كما خزّنه الخادم (jsonb) — ما لا يُقرأ يُترك (سطرٌ تالف لا يُسقط الدفتر)، والترتيبُ كما كُتب. */
export function readEdits(raw: unknown): CompanyEntryEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: CompanyEntryEdit[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const before = snapOf(o.before), after = snapOf(o.after);
    if (!before || !after) continue;
    out.push({ at: typeof o.at === "string" ? o.at : "", by: typeof o.by === "string" ? o.by : null,
      reason: typeof o.reason === "string" ? o.reason.trim() : "", before, after });
  }
  return out;
}

/** يتعدّل؟ الرصيدُ السابق والتسويةُ الحيّان وحدهما — التسديدُ موزَّعٌ على فواتير (يُلغى ويُعاد). */
export const editableEntry = (e: Pick<CompanyEntry, "kind" | "voided_at">): boolean =>
  !e.voided_at && (e.kind === "opening" || e.kind === "adjust");

/** ما رآه المدير لحظةَ الفتح — يُرسل مع الحفظ (`p_seen`). */
export const seenOf = (e: Pick<CompanyEntry, "amount" | "entry_date" | "note">): EntrySnap =>
  ({ amount: r2(e.amount), date: e.entry_date, note: noteOf(e.note) });

/** أقلُّ مبلغٍ يقبله الخادمُ لرصيدٍ دائن: ما انسدّ منه = المبلغ − الرصيد السابق القائم (الموجب). المدينُ بلا حدٍّ إلا الصفر.
 *  `poolDue` رصيدُ الشركة السابق بعملة الصفّ (company_pool_due[_usd] — `L.totals.poolDue`). */
export function editFloor(e: Pick<CompanyEntry, "amount" | "direction">, poolDue: number): number | null {
  if (e.direction !== "credit") return null;
  return r2(Math.max(0, e.amount - Math.max(0, poolDue)));
}

export type EditWhy = "amount" | "date" | "reason" | "reasonLong" | "noteRequired" | "noteLong" | "noChange" | "floor";
export interface EditDraft { amount: number | null; date: string; note: string; reason: string }
export interface EditPlan {
  ok: boolean;
  /** أوّلُ ما يمنع الحفظ — بترتيب رفض الخادم. */
  why: EditWhy | null;
  /** ما تقوله النافذةُ تحت الزرّ: المبلغُ والتاريخُ والحدُّ قبل «ما تغيّر شي»، والسببُ آخراً (يُكتب بعد أن يُعرف ما تغيّر). */
  show: EditWhy | null;
  after: EntrySnap;
  changed: { amount: boolean; date: boolean; note: boolean };
  /** فرقُ المبلغ (الجديد − القديم). */
  diff: number;
  /** أثرُه على رصيد الشركة (علينا): الدائنُ بفرقه، والمدينُ بعكسه. */
  balanceDelta: number;
  floor: number | null;
}

/** حكمُ النافذة — مرآةُ رفض company_entry_edit بترتيبه (والدورُ والتغيّرُ من جهازٍ آخر للخادم وحده). */
export function planEdit(e: Pick<CompanyEntry, "amount" | "entry_date" | "note" | "kind" | "direction">, d: EditDraft,
  poolDue: number, today: string): EditPlan {
  const was = seenOf(e);
  const amount = d.amount != null && Number.isFinite(d.amount) ? r2(d.amount) : NaN;
  const after: EntrySnap = { amount, date: d.date, note: noteOf(d.note) };
  const changed = { amount: Number.isFinite(amount) && amount !== was.amount, date: d.date !== was.date, note: after.note !== was.note };
  const diff = Number.isFinite(amount) ? r2(amount - was.amount) : 0;
  const balanceDelta = e.direction === "credit" ? diff : r2(-diff);
  const floor = editFloor(e, poolDue);
  const reason = d.reason.trim();
  const has = new Set<EditWhy>();
  if (!reason) has.add("reason");
  if (reason.length > 300) has.add("reasonLong");
  if (!(amount > 0)) has.add("amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date > today || d.date < "2000-01-01") has.add("date");
  if (after.note && after.note.length > 500) has.add("noteLong");
  if (e.kind === "adjust" && !after.note) has.add("noteRequired");
  if (!changed.amount && !changed.date && !changed.note) has.add("noChange");
  if (floor != null && amount > 0 && amount < was.amount && amount < floor - 0.005) has.add("floor");
  const first = (order: EditWhy[]) => order.find((w) => has.has(w)) ?? null;
  const why = first(["reason", "reasonLong", "amount", "date", "noteLong", "noteRequired", "noChange", "floor"]);
  const show = first(["amount", "date", "floor", "noteRequired", "noteLong", "noChange", "reasonLong", "reason"]);
  return { ok: why == null, why, show, after, changed, diff, balanceDelta, floor };
}
