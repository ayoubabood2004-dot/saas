import type { PurchaseEffect, PurchaseEffectSnap } from "@/types";

/* ============================================================================
 * كشفُ الشراء — من صفوف `purchase_effects` (0211) إلى أقسامٍ يقرؤها إنسان.
 *
 * نقيّةٌ عمداً: لا JSX ولا i18n — المكوّنُ يرسم و`t` يقول، وهنا يُقرَّر **ما يُقال**.
 * والقاعدةُ التي تحكم التصنيف: الرصيدُ هو المطلوب («زادت»)، وكلُّ ما سواه
 * مفاجأةٌ تُرفع لقسم «تبدّلت — انتبه»: سعرٌ كُتب فوق سعر الرفّ، تاريخُ انتهاءٍ
 * يشمل كلَّ العلب، مادّةٌ صارت لشركة، باركودٌ تُعلِّم. والمطابقةُ بالاسم تُقال
 * لأنها الفرعُ الوحيد الذي يلصق بضاعةً بمادّةٍ قد لا تكون هي.
 *
 * والأرقامُ من صورتَي الخادم (قبل/بعد) لا من لقطة المتصفّح — «من ← إلى» الكاذب
 * كان يُحسب من قائمةٍ قد تكون قديمة.
 * ========================================================================= */

export type EffectField = "sell_price" | "purchase_price" | "expiry_date" | "company_id" | "barcode" | "category" | "min_stock";

export interface ReceiptStock { name: string; productId: string | null; qty: number; from: number; to: number }
export interface ReceiptChange { name: string; productId: string | null; field: EffectField; from: unknown; to: unknown }
export interface ReceiptNote { name: string; productId: string | null; kind: "by_name" | "other_company" }

export interface Receipt {
  /** آخرُ دفعةٍ كُتبت: تسجيلٌ أو تعديل. */
  op: "record" | "update" | null;
  /** كم مرّةً عُدّلت الفاتورة بعد تسجيلها. */
  edits: number;
  added: ReceiptStock[];
  changed: ReceiptChange[];
  created: ReceiptStock[];
  removed: ReceiptStock[];
  notes: ReceiptNote[];
  /** ماكو شي تبدّل عدا الرصيد، ولا ملاحظة ولا جديد ولا مشال ⇒ سطرٌ واحد وضغطتان. */
  clean: boolean;
  /** عددُ السطور — للسطر النظيف «نزّلنا N مواد». */
  lines: number;
}

/** ترتيبُ الخطورة داخل «تبدّلت»: ما يلمس الفلوس والصلاحية أوّلاً. */
const FIELD_ORDER: EffectField[] = ["sell_price", "expiry_date", "company_id", "purchase_price", "barcode", "category", "min_stock"];

const num = (v: unknown): number => Number(v) || 0;

/**
 * آخرُ دفعة: التسجيلُ ثمّ كلُّ تعديلٍ دفعةٌ بختمها (`created_at` واحدٌ لكلّ نداء —
 * `now()` ثابتٌ داخل المعاملة). الكشفُ بعد الحفظ يقول ما فعله **هذا** الحفظ.
 */
export function latestBatch(effects: readonly PurchaseEffect[]): PurchaseEffect[] {
  if (!effects.length) return [];
  let last = effects[0].created_at;
  for (const e of effects) if (e.created_at > last) last = e.created_at;
  return effects.filter((e) => e.created_at === last).sort((a, b) => a.line_no - b.line_no);
}

export function describeEffects(effects: readonly PurchaseEffect[], purchaseCompanyId?: string | null): Receipt {
  const batch = latestBatch(effects);
  const stamps = new Set(effects.filter((e) => e.op === "update").map((e) => e.created_at));
  const out: Receipt = {
    op: batch[0]?.op ?? null, edits: stamps.size,
    added: [], changed: [], created: [], removed: [], notes: [], clean: true, lines: 0,
  };
  for (const e of batch) {
    const name = e.after?.name || e.product_name;
    const pid = e.product_id;
    const b: PurchaseEffectSnap = e.before ?? {};
    const a: PurchaseEffectSnap = e.after ?? {};
    if (e.outcome === "removed") {
      out.removed.push({ name, productId: pid, qty: Math.abs(num(e.qty)), from: num(b.stock), to: num(a.stock) });
      continue;
    }
    out.lines++;
    if (e.outcome === "created") {
      out.created.push({ name, productId: pid, qty: num(e.qty), from: 0, to: num(a.stock) });
      continue;
    }
    out.added.push({ name, productId: pid, qty: num(e.qty), from: num(b.stock), to: num(a.stock) });
    const fields = (e.changed ?? []).filter((f): f is EffectField => (FIELD_ORDER as string[]).includes(f))
      .sort((x, y) => FIELD_ORDER.indexOf(x) - FIELD_ORDER.indexOf(y));
    for (const f of fields) out.changed.push({ name, productId: pid, field: f, from: b[f] ?? null, to: a[f] ?? null });
    if (e.matched_by === "name") out.notes.push({ name, productId: pid, kind: "by_name" });
    /* طابق مادّةَ شركةٍ ثانية: البضاعةُ من شركة الفاتورة، والرفُّ لغيرها. «بلا شركة»
     * ليست ثانية — الشراءُ يسندها (ويُقال تحت «تبدّلت»). */
    if (purchaseCompanyId && a.company_id && a.company_id !== purchaseCompanyId) {
      out.notes.push({ name, productId: pid, kind: "other_company" });
    }
  }
  /* «مادّةٌ انخلقت» ليست نظيفة: هي أوّلُ علامةِ توأمٍ أعمى — تُرى ولا تُطوى بسطر. */
  out.clean = out.changed.length === 0 && out.notes.length === 0 && out.removed.length === 0 && out.created.length === 0;
  return out;
}
