/* ============================================================================
 * الدولار (0264) — بابٌ واحد للسحابة وللتجريبيّ، كسولٌ خارج repo.ts (حزمةُ الإقلاع وفسحتُها بضعُ عشرات بايت):
 * لا تستورده إلا شاشةٌ كسولة (`import("@/lib/usdApi")`).
 *
 * العقد:
 *  • الخادمُ يحسب الدينار ويقرّر — الجهازُ يعاين بـusdMath.ts (مرآتُه المفحوصة بـusd-parity) ويرسل ما رآه: معرّفَ السعر
 *    (`fx_rate_id`) فيُرفض البيعُ بسعرٍ تغيّر، وباقيَ الدولار (`expect_due_usd`) فيُرفض تسديدٌ على باقٍ تغيّر.
 *  • القراءةُ ترمي عند أيّ فشل — لا «مطفأ» ولا «بلا سعر» عن خطأ: بيعٌ بالدينار عن مادّةٍ دولارية أسوأُ من «أعد المحاولة».
 *  • الكتابةُ تُسمع: كلُّ نداءٍ يرمي برمز الخادم (usd_*) وتلميحه، والشاشةُ تترجم الرمزَ (usdErrorText).
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError).
 *  • بلا نتّ لا طابور: السعرُ يُفحص بالخادم، فالبيعُ والتسديدُ بالدولار يقولان «يحتاج اتصال» (docs/usd-plan.md §٩).
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import { rate1e4Of } from "./usdMath";
import type { Invoice } from "@/types";

export type UsdMethod = "cash" | "card" | "transfer";
export interface UsdRate { id: string; rate: string; rate1e4: bigint; note: string | null; set_by: string | null; created_at: string }
export interface UsdState { enabled: boolean; step: number; rate: UsdRate | null }
export interface UsdSettlement {
  id: string; invoice_id: string; usd: number; rate: number; rate_note: string | null;
  received: number; share: number; fx: number; method: UsdMethod; at: string; by_user: string | null; client_ref: string | null;
  voided_at: string | null; voided_by: string | null; void_reason: string | null;
}
export interface UsdLineIn { product_id: string; qty: number; unit_price_usd?: string | null }
export interface UsdSaleMeta {
  fx_rate_id: string;
  /** «0» دَيناً، أو مجموعُ الدولار كما يعرفه الجهاز نقداً — والخادمُ يرفض غيرَ مجموعه (usd_partial_at_sale). */
  paid_usd: string;
  payment_method: UsdMethod;
  discount_usd?: string | null;
  customer_name?: string | null; customer_phone?: string | null; pet_name?: string | null;
  staff_id?: string | null; notes?: string | null; client_ref: string; sale_kind?: string | null;
}
export interface UsdSettleResult { invoice: Invoice; settlement: UsdSettlement }

export interface UsdApi {
  state(): Promise<UsdState>;
  setPrefs(enabled: boolean | null, step?: number | null): Promise<UsdState>;
  /** «سعر ١٠٠ دولار» كما يُكتب (نصّاً — لا عائم). */
  setRate(per100: string, note?: string | null): Promise<UsdRate>;
  rates(limit?: number): Promise<UsdRate[]>;
  checkout(items: UsdLineIn[], meta: UsdSaleMeta): Promise<Invoice>;
  settle(invoiceId: string, usd: string, per100: string, method: UsdMethod, expectDueUsd: string, note?: string | null, clientRef?: string | null): Promise<UsdSettleResult>;
  settlements(invoiceIds: string[]): Promise<UsdSettlement[]>;
  voidSettlement(settlementId: string, reason: string): Promise<UsdSettleResult>;
  deleteInvoice(invoiceId: string): Promise<void>;
}

type PgErr = { message: string; code?: string; details?: string; hint?: string };
const serverError = (e: PgErr) => Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}
const shapeError = () => Object.assign(new Error("usd_shape"), { code: "usd_shape" });

/** صفُّ سعرٍ كما يصل (عموداً أو من usd_state) — السعرُ يُقرأ بالضبط أو يرمي: سعرٌ مكسورٌ لا يصير صفراً بالشاشة. */
export function readRate(x: unknown): UsdRate {
  const r = x as Record<string, unknown> | null;
  const rate1e4 = r ? rate1e4Of(r.rate as string | number | null) : null;
  if (!r || typeof r.id !== "string" || rate1e4 == null || typeof r.created_at !== "string") throw shapeError();
  return {
    id: r.id, rate: String(r.rate), rate1e4, note: typeof r.note === "string" ? r.note : null,
    set_by: typeof r.set_by === "string" ? r.set_by : null, created_at: r.created_at,
  };
}
export function readState(x: unknown): UsdState {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r.enabled !== "boolean" || typeof r.step !== "number") throw shapeError();
  return { enabled: r.enabled, step: r.step, rate: r.rate == null ? null : readRate(r.rate) };
}

const RATE_COLS = "id,rate,note,set_by,created_at";
const cloud: UsdApi = {
  state: async () => readState(await rpcJson<unknown>("usd_state", {})),
  async setPrefs(enabled, step) {
    writable();
    return readState(await rpcJson<unknown>("usd_prefs_set", { p_enabled: enabled, p_step: step ?? null }));
  },
  async setRate(per100, note) {
    writable();
    return readRate(await rpcJson<unknown>("fx_rate_set", { p_per100: per100, p_note: note ?? null }));
  },
  async rates(limit = 20) {
    const { data, error } = await supabase!.from("clinic_fx_rates").select(RATE_COLS)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
    if (error) throw serverError(error);
    return (data ?? []).map(readRate);
  },
  async checkout(items, meta) {
    writable();
    return rpcJson<Invoice>("usd_checkout", { p_items: items, p_meta: meta });
  },
  async settle(invoiceId, usd, per100, method, expectDueUsd, note, clientRef) {
    writable();
    return rpcJson<UsdSettleResult>("settle_invoice_usd", {
      p_invoice: invoiceId, p_usd: usd, p_per100: per100, p_method: method, p_expect_due_usd: expectDueUsd,
      p_note: note ?? null, p_client_ref: clientRef ?? null,
    });
  },
  async settlements(invoiceIds) {
    const out: UsdSettlement[] = [];
    // دفعاتٌ بمئة معرّف: عنوانُ الطلب يطول بكلّ معرّف، وقائمةُ ديونٍ كبيرة كانت ستتجاوزه.
    for (let i = 0; i < invoiceIds.length; i += 100) {
      const { data, error } = await supabase!.from("usd_settlements").select("*").in("invoice_id", invoiceIds.slice(i, i + 100)).order("at");
      if (error) throw serverError(error);
      out.push(...((data ?? []) as UsdSettlement[]));
    }
    return out;
  },
  async voidSettlement(settlementId, reason) {
    writable();
    return rpcJson<UsdSettleResult>("void_usd_settlement", { p_settlement: settlementId, p_reason: reason });
  },
  async deleteInvoice(invoiceId) {
    writable();
    const { error } = await supabase!.rpc("delete_usd_invoice", { p_invoice: invoiceId });
    if (error) throw serverError(error);
  },
};

/* التجريبيّ: نفسُ العقد والحرّاس على localStorage، كسولٌ من باب repoDemo وحده (demoUsd.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoUsd());
const demo: UsdApi = {
  state: async () => (await local()).demoUsdState(),
  setPrefs: async (e, s) => { writable(); return (await local()).demoUsdPrefs(e, s ?? null); },
  setRate: async (p, n) => { writable(); return (await local()).demoUsdRateSet(p, n ?? null); },
  rates: async (l) => (await local()).demoUsdRates(l ?? 20),
  checkout: async (i, m) => { writable(); return (await local()).demoUsdCheckout(i, m); },
  settle: async (id, u, p, m, e, n, r) => { writable(); return (await local()).demoUsdSettle(id, u, p, m, e, n ?? null, r ?? null); },
  settlements: async (ids) => (await local()).demoUsdSettlements(ids),
  voidSettlement: async (id, r) => { writable(); return (await local()).demoUsdVoid(id, r); },
  deleteInvoice: async (id) => { writable(); return (await local()).demoUsdDelete(id); },
};

export const usdApi: UsdApi = supabase ? cloud : demo;
