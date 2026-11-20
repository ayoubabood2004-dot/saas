/* ============================================================================
 * الشراءُ بالعملتين ودفترُ الشركة بالعملتين (0274) — بابٌ كسولٌ للسحابة وللتجريبيّ، خارج repo.ts (حزمةُ الإقلاع وفسحتُها
 * محدودة)، لا تستورده إلا شاشةٌ كسولة. الخطّة: docs/usd-purchases-plan.md.
 *
 * العقد:
 *  • الخادمُ يحسب الدينار ويقرّر: فاتورةُ الدولار تُرسل كلفةَ كلّ سطرٍ بالدولار وسعرَ الفاتورة، ودينارُها يُكتب هناك.
 *  • الكتابةُ تُسمع: كلُّ نداءٍ يرمي برمز الخادم وتلميحه العربيّ (rpcJson)، والشاشةُ تعرضه بـdescribeDbError.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابة كما بـrepo (ReadOnlyError).
 *  • `ready()`: هل أجسامُ دفتر الشركة الحيّة تعرف العملتين؟ (purchase_usd_ready — الأعمدةُ وحدها لا تكفي، درسُ 0260.) فشلٌ
 *    أو قاعدةٌ قبل 0274 = لا: دولارٌ يُكتب ولا يُحفظ أسوأُ من خيارٍ غائب.
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { CompanyEntry, CompanyPayResult, PaymentMethod, Purchase, PurchaseDraftLine, PurchaseMeta } from "@/types";

export type Cur = "IQD" | "USD";

export interface PurchaseFxApi {
  ready(): Promise<boolean>;
  record(lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase>;
  update(purchaseId: string, lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase>;
  /** تسديدُ فاتورةٍ واحدة: `handed` ما سُلّم بعملة `payCur`، و`rate` سعرُه حين تختلف العملتان، و`expectDue` الباقي كما رآه
   *  المستخدم بعملة الدَّين (تغيّر ⇒ due_changed). */
  pay(purchaseId: string, handed: number, payCur: Cur, rate: number | null, method: PaymentMethod, note: string | null, expectDue: number | null): Promise<Purchase>;
  /** التسديدُ على الحساب بعملة الدَّين `cur`: السابقُ أوّلاً ثمّ الفواتيرُ من الأقدم. */
  companyPay(companyId: string, cur: Cur, handed: number, payCur: Cur, rate: number | null, method: PaymentMethod | null, date: string | null, note: string | null): Promise<CompanyPayResult>;
  opening(companyId: string, cur: Cur, amount: number, date: string | null, note: string | null): Promise<CompanyEntry>;
  adjust(companyId: string, cur: Cur, direction: "credit" | "debit", amount: number, date: string | null, note: string): Promise<CompanyEntry>;
}

function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

const cloud: PurchaseFxApi = {
  async ready() {
    if (!supabase) return false;
    try {
      const r = await supabase.rpc("purchase_usd_ready");
      return !r.error && r.data === true;
    } catch {
      return false;
    }
  },
  async record(lines, meta) { writable(); return rpcJson<Purchase>("record_purchase_fx", { p_lines: lines, p_meta: meta }); },
  async update(id, lines, meta) { writable(); return rpcJson<Purchase>("update_purchase_fx", { p_purchase: id, p_lines: lines, p_meta: meta }); },
  async pay(id, handed, payCur, rate, method, note, expectDue) {
    writable();
    return rpcJson<Purchase>("purchase_pay_fx", {
      p_purchase: id, p_handed: handed, p_pay_currency: payCur, p_rate: rate, p_method: method, p_note: note, p_expect_due: expectDue,
    });
  },
  async companyPay(companyId, cur, handed, payCur, rate, method, date, note) {
    writable();
    return rpcJson<CompanyPayResult>("company_pay_fx", {
      p_company: companyId, p_currency: cur, p_handed: handed, p_pay_currency: payCur, p_rate: rate, p_method: method, p_date: date, p_note: note,
    });
  },
  async opening(companyId, cur, amount, date, note) {
    writable();
    return rpcJson<CompanyEntry>("company_opening_add_fx", { p_company: companyId, p_currency: cur, p_amount: amount, p_date: date, p_note: note });
  },
  async adjust(companyId, cur, direction, amount, date, note) {
    writable();
    return rpcJson<CompanyEntry>("company_adjust_fx", {
      p_company: companyId, p_currency: cur, p_direction: direction, p_amount: amount, p_date: date, p_note: note,
    });
  },
};

/* التجريبيّ: نفسُ العقد والحرّاس على localStorage، كسولٌ من باب repoDemo وحده (demoPurchaseFx.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoPurchaseFx());
const demo: PurchaseFxApi = {
  ready: async () => true,
  record: async (l, m) => { writable(); return (await local()).demoRecordPurchaseFx(l, m); },
  update: async (id, l, m) => { writable(); return (await local()).demoUpdatePurchaseFx(id, l, m); },
  pay: async (id, h, pc, r, me, n, e) => { writable(); return (await local()).demoPurchasePayFx(id, h, pc, r, me, n, e); },
  companyPay: async (c, cur, h, pc, r, me, d, n) => { writable(); return (await local()).demoCompanyPayFx(c, cur, h, pc, r, me, d, n); },
  opening: async (c, cur, a, d, n) => { writable(); return (await local()).demoCompanyOpeningFx(c, cur, a, d, n); },
  adjust: async (c, cur, dir, a, d, n) => { writable(); return (await local()).demoCompanyAdjustFx(c, cur, dir, a, d, n); },
};

export const purchaseFx: PurchaseFxApi = supabase ? cloud : demo;

/** هل يُعرض الدولار بالشراء ودفتر الشركة: الأجسامُ تعرف العملتين **والعيادةُ مفعّلة** — وسعرُ العيادة (للدولار الواحد) اقتراحاً.
 *  فحصُ قدرةٍ لا قائمةُ قرار: الفشلُ «لا» والشراءُ بالدينار كما كان. سؤالٌ واحد للشاشات الثلاث. */
export async function purchaseFxState(): Promise<{ ok: boolean; clinicRate: number | null }> {
  try {
    const [ready, st] = await Promise.all([purchaseFx.ready(), import("./usdApi").then((m) => m.usdApi.state())]);
    return { ok: ready && st.enabled, clinicRate: st.rate ? Number(st.rate.rate) : null };
  } catch {
    return { ok: false, clinicRate: null };
  }
}
