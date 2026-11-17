/* ============================================================================
 * أجورٌ إضافية بفاتورة الشراء (0276) — حسابٌ صِرفٌ بلا نصوص: يستورده نموذجُ الشراء وتفاصيلُها وطباعتُها، والمرآةُ التجريبية.
 *
 * `normCharges` مرآةُ `_purchase_charges` بالقاعدة حرفاً: قائمةٌ لا تتعدّى عشرين، والاسمُ بلا فراغاتٍ زائدة (الستُّ اللاتينية) بستّين
 * حرفاً وإلزاميّ، ولمن: company (الغائب) أو other، والمبلغُ موجبٌ بالدينار بمنزلتين — أو دولارٌ (usd، وإلا amount) ودينارُه
 * round(usd × rate, 2) لفاتورة الدولار. ما على الشركة داخل total (دَينُها)، وما لغيرها خارجه.
 * والقارئاتُ (`chargesOf`، `purchaseGrossCur`) تقرأ فاتورةً محفوظة بعملتها: غائبٌ = بلا أجور (فاتورةٌ قبل 0276).
 * ========================================================================= */
import type { Purchase, PurchaseCharge, PurchaseChargesMode } from "@/types";
import { fromScaled, roundDiv, roundScaled } from "./consumption";

export type ChargePayee = PurchaseCharge["payee"];
export interface ChargesNorm { list: PurchaseCharge[]; company: number; other: number; companyUsd: number; otherUsd: number }
/** سطرُ أجرةٍ كما يُكتب بالنموذج: المبلغُ نصٌّ بعملة الفاتورة. */
export interface ChargeDraft { label: string; amount: string; payee: ChargePayee }

/** خطأُ المرآة بشكل الخادم: رمزُه ورقمُ السطر (التجريبيُّ يحوّله لجملة الخادم). */
export class ChargeFault extends Error {
  constructor(readonly code: "bad_charges" | "charge_label" | "charge_amount", readonly line: number, readonly why: "type" | "many" | "payee" | "" = "") {
    super(code);
  }
}

export const CHARGES_MAX = 20;
export const CHARGE_LABEL_MAX = 60;

/** `safe_num(t)` ثمّ `round(…, s)`: ما لا يُقرأ رقماً (أو فارغ) null. */
function scaled(x: unknown, scale: number): bigint | null {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x !== "number" && typeof x !== "string" && typeof x !== "boolean") return null;
  try { return roundScaled(typeof x === "boolean" ? String(x) : x, scale); } catch { return null; }
}
/** `x->>'k'` لقيمةٍ غيرِ نصّية: jsonb يرجع نصَّها (الرقمُ رقماً، والمنطقيُّ true/false). */
const textOf = (x: unknown): string | null => (x === null || x === undefined ? null : typeof x === "string" ? x : typeof x === "object" ? JSON.stringify(x) : String(x));

/** مرآةُ `_purchase_charges(p, p_rate)`. rate غائب ⇒ المبالغُ بالدينار و`usd` يُهمل. يرمي ChargeFault بترتيب الخادم. */
export function normCharges(p: unknown, rate: number | null): ChargesNorm {
  const out: PurchaseCharge[] = [];
  let c = 0n, o = 0n, cu = 0n, ou = 0n;
  if (p !== null && p !== undefined) {
    if (!Array.isArray(p)) throw new ChargeFault("bad_charges", 0, "type");
    if (p.length > CHARGES_MAX) throw new ChargeFault("bad_charges", 0, "many");
    const rateQ = rate === null ? null : roundScaled(rate, 4);
    p.forEach((x, k) => {
      const i = k + 1;
      if (x === null || typeof x !== "object" || Array.isArray(x)) throw new ChargeFault("bad_charges", i, "type");
      const r = x as Record<string, unknown>;
      const lab = [...(textOf(r.label) ?? "").replace(/[ \t\n\r\f\v]+/g, " ").replace(/^ +| +$/g, "")].slice(0, CHARGE_LABEL_MAX).join("");
      if (lab === "") throw new ChargeFault("charge_label", i);
      const payRaw = textOf(r.payee);
      const pay = payRaw === null || payRaw === "" ? "company" : payRaw;
      if (pay !== "company" && pay !== "other") throw new ChargeFault("bad_charges", i, "payee");
      let usd: bigint | null = null, amt: bigint | null;
      if (rateQ === null) {
        amt = scaled(r.amount, 2);
      } else {
        usd = scaled(r.usd, 2) ?? scaled(r.amount, 2);
        amt = usd === null ? null : roundDiv(usd * rateQ, 10_000n);
      }
      if (amt === null || amt <= 0n || amt >= 100_000_000_000_000n || (rateQ !== null && (usd ?? 0n) <= 0n)) throw new ChargeFault("charge_amount", i);
      const item: PurchaseCharge = { label: lab, amount: fromScaled(amt, 2), payee: pay };
      if (usd !== null) item.usd = fromScaled(usd, 2);
      out.push(item);
      if (pay === "company") { c += amt; cu += usd ?? 0n; } else { o += amt; ou += usd ?? 0n; }
    });
  }
  return { list: out, company: fromScaled(c, 2), other: fromScaled(o, 2), companyUsd: fromScaled(cu, 2), otherUsd: fromScaled(ou, 2) };
}

/** أجورُ فاتورةٍ محفوظة بعملتها: كلُّ أجرةٍ بمبلغها (دولارُها لفاتورة الدولار)، ومجموعا ما على الشركة وما لغيرها، وكيف حُسبت. */
export function chargesOf(p: Pick<Purchase, "charges" | "charges_company" | "charges_other" | "charges_mode" | "currency">): {
  list: { label: string; amount: number; payee: ChargePayee }[]; company: number; other: number; mode: PurchaseChargesMode | null;
} {
  const usd = p.currency === "USD";
  const list = (Array.isArray(p.charges) ? p.charges : []).map((x) => ({
    label: String(x.label ?? ""), payee: x.payee === "other" ? "other" as const : "company" as const,
    amount: Number((usd ? x.usd : x.amount) ?? 0) || 0,
  }));
  const sum = (who: ChargePayee) => fromScaled(list.filter((x) => x.payee === who).reduce((s, x) => s + (scaled(x.amount, 2) ?? 0n), 0n), 2);
  return {
    list,
    company: usd ? sum("company") : Number(p.charges_company ?? 0) || 0,
    other: usd ? sum("other") : Number(p.charges_other ?? 0) || 0,
    mode: p.charges_mode === "cost" || p.charges_mode === "expense" ? p.charges_mode : null,
  };
}

/** مجموعُ البضاعة قبل الخصم والأجور بعملة الفاتورة: total + الخصم − ما على الشركة من أجور. */
export function purchaseGrossCur(p: Pick<Purchase, "total" | "discount" | "total_usd" | "discount_usd" | "currency" | "charges" | "charges_company" | "charges_other" | "charges_mode">): number {
  const usd = p.currency === "USD";
  const total = Number((usd ? p.total_usd : p.total) ?? 0) || 0;
  const disc = Number((usd ? p.discount_usd : p.discount) ?? 0) || 0;
  const cc = chargesOf(p).company;
  return fromScaled((scaled(total, 2) ?? 0n) + (scaled(disc, 2) ?? 0n) - (scaled(cc, 2) ?? 0n), 2);
}

/** سطورُ النموذج ← ما يُرسل (meta.charges): السطرُ الفارغ كلُّه (بلا اسمٍ ولا مبلغ) يُترك، وغيرُه يُرسل كما كُتب ليحكم الخادم. */
export function chargesToSend(rows: readonly ChargeDraft[]): { label: string; amount: number; payee: ChargePayee }[] {
  return rows
    .filter((r) => r.label.trim() !== "" || r.amount.trim() !== "")
    .map((r) => ({ label: r.label, amount: Number(r.amount.trim()), payee: r.payee }));
}

/** مجموعا سطور النموذج بعملة الفاتورة: ما على الشركة (يدخل الصافي) وما لغيرها — ما لا يُقرأ يُحسب صفراً هنا والحفظُ يقوله. */
export function draftSums(rows: readonly ChargeDraft[]): { company: number; other: number } {
  let c = 0n, o = 0n;
  for (const r of rows) {
    const v = scaled(r.amount.trim(), 2);
    if (v === null || v <= 0n) continue;
    if (r.payee === "other") o += v; else c += v;
  }
  return { company: fromScaled(c, 2), other: fromScaled(o, 2) };
}

/** أوّلُ سطرٍ ناقص بالنموذج (اسمٌ بلا مبلغٍ موجب، أو مبلغٌ بلا اسم) — رقمُه بالنموذج (1-based)، أو 0. الحفظُ يقف ويقوله بمكانه. */
export function draftProblem(rows: readonly ChargeDraft[]): number {
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    if (r.label.trim() === "" && r.amount.trim() === "") continue;
    const v = scaled(r.amount.trim(), 2);
    if (r.label.trim() === "" || v === null || v <= 0n) return k + 1;
  }
  return 0;
}
