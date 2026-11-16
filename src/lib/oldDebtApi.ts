/* ============================================================================
 * الديونُ القديمة (0271) — بابٌ واحد للسحابة وللتجريبيّ. كسولٌ: لا تستورده إلا قطعةُ «دين قديم» (OldDebt.tsx) —
 * repo.ts بحزمة الإقلاع وفسحتُها بضعُ مئات بايت.
 *
 * العقد:
 *  • الخادمُ يقرّر كلَّ شيء (old_debt_add): المديرُ وحده، والزبونُ والمبلغُ و«شنو» والتاريخُ والعملة، ودينارُ الدولار بسعر اليوم.
 *    والجهازُ يرسل ما كُتب كما هو (المبلغُ نصّاً مقروءاً — لا عائم)، ومرجعَ إعادةٍ (client_ref) يولّده مرّةً للنافذة.
 *  • الكتابةُ تُسمع: الخطأُ يُرمى برمز الخادم وتلميحه، والشاشةُ تترجمه. وفشلٌ غيرُ حاسم (الشبكة) يُبقي المرجعَ فالإعادةُ
 *    لا تكتب ديناً ثانياً (shouldReleaseRef).
 *  • قاعدةٌ قبل 0271 (لا دالّة) ⇒ `odebt_absent`: «يحتاج تحديث» لا خطأً خامّاً.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError).
 * ========================================================================= */
import type { Invoice, OldDebtItem } from "@/types";
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";

export type OldDebtCurrency = "IQD" | "USD";
export interface OldDebtInput {
  name: string | null;
  phone: string | null;
  /** «شنو» — المادّةُ أو الخدمةُ التي عليها الدين. */
  what: string;
  /** «ليش» — سببُه أو ملاحظتُه (اختياريّ). */
  why: string | null;
  /** «شكد» — نصٌّ عشريٌّ قانونيّ (canonDec) لا عائم. */
  amount: string;
  currency: OldDebtCurrency;
  /** «شوكت» — اليومُ المحلّيّ YYYY-MM-DD (غيابُه = اليوم). */
  date: string | null;
  clientRef: string;
  /** «شنو أخذ» سطراً سطراً (0273، اختياريّ): من المخزن أو بالاسم — لا يُنقص المخزن. السعرُ بعملة الدين، نصّاً عشرياً. */
  items?: OldDebtItemIn[];
}
export interface OldDebtItemIn { product_id: string | null; name: string; qty: string; price: string }

const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const ABSENT = ["42883", "PGRST202"];
export const isOldDebtAbsent = (e: unknown): boolean => code(e) === "odebt_absent";

/** قاعدةٌ قبل 0273 (لا دالّةَ أسطر ولا جدول): «موادُّ الدين تحتاج تحديث» — الدينُ بلا موادّ يُكتب كما كان. */
export const isOldDebtItemsAbsent = (e: unknown): boolean => code(e) === "odebt_items_absent";

export async function addOldDebt(x: OldDebtInput): Promise<Invoice> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  const items = x.items && x.items.length > 0 ? x.items : null;
  if (supabase) {
    const base = {
      p_name: x.name, p_phone: x.phone, p_what: x.what, p_why: x.why, p_amount: x.amount,
      p_currency: x.currency, p_date: x.date, p_client_ref: x.clientRef,
    };
    const r = items
      ? await supabase.rpc("old_debt_add_items", { ...base, p_items: items })
      : await supabase.rpc("old_debt_add", base);
    if (r.error) {
      if (ABSENT.includes(code(r.error))) {
        if (items) throw Object.assign(new Error("odebt_items_absent"), { code: "odebt_items_absent" });
        throw Object.assign(new Error("odebt_absent"), { code: "odebt_absent" });
      }
      throw Object.assign(new Error(r.error.message), { code: r.error.code, details: r.error.details, hint: r.error.hint });
    }
    const inv = r.data as Invoice | null;
    if (!inv || typeof inv !== "object" || !inv.id) throw Object.assign(new Error("odebt_shape"), { code: "odebt_shape" });
    return inv;
  }
  return (await import("./demoOldDebt")).demoOldDebtAdd(x);
}

/* ── موادُّ الدين القديم (0273) ─────────────────────────────────────────────────────────────────────────── */

/** أسطرُ دينٍ قديم بترتيب كتابتها. `null` = قاعدةٌ قبل 0273 (لا جدول) — الشاشةُ تُخفي القسمَ لا تقول «تعذّر» دائماً.
 *  والخطأُ يُرمى (قائمةٌ ناقصة تُصدَّق — CLAUDE.md). */
export async function listOldDebtItems(invoiceId: string): Promise<OldDebtItem[] | null> {
  if (supabase) {
    const r = await supabase.from("old_debt_items").select("*").eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true }).order("id", { ascending: true });
    if (r.error) {
      if (["42P01", "PGRST205"].includes(code(r.error))) return null;
      throw Object.assign(new Error(r.error.message), { code: r.error.code });
    }
    return ((r.data ?? []) as OldDebtItem[]).map((d) => ({
      ...d, qty: Number(d.qty), unit_price: Number(d.unit_price), returned_qty: Number(d.returned_qty),
      unit_price_usd: d.unit_price_usd == null ? null : Number(d.unit_price_usd),
    }));
  }
  return (await import("./demoOldDebt")).demoOldDebtItems(invoiceId);
}

export interface OldDebtReturnInput {
  invoiceId: string;
  /** الكميةُ نصٌّ عشريّ (canonDec) — لا عائم. */
  lines: { item_id: string; qty: string }[];
  /** طريقةُ النقد الخارج إن خرج (غيابُها = أكبرُ ساقٍ دُفعت بها، أو نقد). */
  method: string | null;
  note: string | null;
  clientRef: string;
}

/** مرتجعُ موادّ الدين القديم: المادّةُ للرفّ، والدينُ ينقص أوّلاً ثمّ الخصمُ ثمّ النقد — الخادمُ يقرّر كلَّه (old_debt_return). */
export async function returnOldDebt(x: OldDebtReturnInput): Promise<Invoice> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  if (supabase) {
    const r = await supabase.rpc("old_debt_return", {
      p_invoice: x.invoiceId, p_returns: x.lines, p_method: x.method, p_note: x.note, p_client_ref: x.clientRef,
    });
    if (r.error) {
      if (ABSENT.includes(code(r.error))) throw Object.assign(new Error("odebt_items_absent"), { code: "odebt_items_absent" });
      throw Object.assign(new Error(r.error.message), { code: r.error.code, details: r.error.details, hint: r.error.hint });
    }
    const inv = r.data as Invoice | null;
    if (!inv || typeof inv !== "object" || !inv.id) throw Object.assign(new Error("odebt_shape"), { code: "odebt_shape" });
    return inv;
  }
  return (await import("./demoOldDebt")).demoOldDebtReturn(x);
}
