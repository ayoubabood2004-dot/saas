/* نداءُ دالّةٍ ترجع jsonb بعميل Supabase مباشرةً — للأبواب الكسولة خارج repo.ts (حزمة الإقلاع وفسحتُها بضعُ مئات
 * بايت): مستهلكاتُ الخدمات (consumptionApi، 0252–0255) والأرباحُ والخسائر (pnlApi، 0256). كان بباب المستهلكات وحده،
 * والبابُ الثاني كان سيكتب نسختَه — ونسختان تنحرفان.
 *
 * العقد: خطأٌ **أو «لا بيانات»** يُرمى برمز الخادم وتفاصيله وتلميحه العربيّ (نظيرُ need في repo.ts) — فلا يصل فشلٌ
 * نجاحاً فارغاً يُصدَّق، والشاشةُ تعرضه بـdescribeDbError. وnull من دالّةٍ void يُحسب فشلاً: need-void-guard يمسكه
 * بكلّ بابٍ يناديه. */
import { supabase } from "./supabase";

type RpcError = { message: string; code?: string; details?: string; hint?: string } | null;

/** نداءٌ يرجع jsonb: خطأٌ أو «لا بيانات» يُرمى برمز الخادم وتلميحه (نظيرُ need في repo.ts). */
export async function rpcJson<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("no_cloud");
  const res = (await supabase.rpc(fn, args)) as { data: unknown; error: RpcError; status?: number };
  if (res.error || res.data == null) {
    const src = res.error;
    const err = new Error(src?.message ?? "No data returned") as Error & { code?: string; details?: string; hint?: string; status?: number };
    /* حالةُ HTTP تُحمل (0287): الرافعُ يفرّق العابرَ (401/429/5xx — يعود وحده) من الدائم بها لا بنصّ الرسالة. */
    if (typeof res.status === "number") err.status = res.status;
    if (src?.code) err.code = src.code;
    if (src?.details) err.details = src.details;
    if (src?.hint) err.hint = src.hint;
    throw err;
  }
  return res.data as T;
}
