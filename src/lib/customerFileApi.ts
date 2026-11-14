/* ============================================================================
 * ملفُّ الزبون (0270) — بابٌ واحد للسحابة وللتجريبيّ. كسولٌ: صفحةُ الملفّ وحدها تستورده (repo.ts بحزمة الإقلاع).
 *
 * • الهويّةُ `cust_key` (0231): الخادمُ يحسبها من الرقم أو الاسم بدولة العيادة ويجمّدها؛ الجهازُ يحسبها بالدالّة نفسِها
 *   (`custKey`) ليفتح العنوان — والطرفان من مصدرٍ واحد يحرسه customer-key-parity.
 * • الملفّ: صفٌّ لمن له معلوماتٌ يدوية — غيابُه ليس خطأً (الزبونُ مشتقٌّ من فواتيره وحيواناته). والكتابةُ تُسمَع
 *   (CLAUDE.md: «الكتابةُ تُسمَع»): التعديلُ بشرط أنّه كما فُتح (`updated_at`)، وصفرُ صفوفٍ يُرمى؛ والإنشاءُ على مفتاحٍ
 *   قائم لا يدوس الموجود — يرجع «موجود» فتفتح الشاشةُ الملفَّ القائم.
 * • الفواتير: `customer_key_invoices` بالمفتاح (لا `customer_invoices` بأرقامٍ خامّة) — كلُّ الصفحات (allPages)، وفشلٌ يُرمى:
 *   قائمةٌ ناقصة أخطرُ من خطأ ظاهر.
 * • قاعدةٌ قبل 0270 (لا جدولٌ ولا دالّة) ⇒ `cfile_absent`: الشاشةُ تقول «يحتاج تحديث» لا خطأً خامّاً.
 * ========================================================================= */
import type { CustomerHit, CustomerProfile, Invoice } from "@/types";
import { supabase } from "./supabase";
import { repo } from "./repo";
import { custKey } from "./customerKey";
import { getDialCode } from "./settings";

const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const ABSENT = ["42P01", "PGRST205", "42883", "PGRST202"];
const absentErr = () => Object.assign(new Error("cfile_absent"), { code: "cfile_absent" });
const local = () => import("./demoCustomer");

export const isCfileAbsent = (e: unknown): boolean => code(e) === "cfile_absent";
export const errCode = code;

/** مفتاحُ الزبون من رقمه أو اسمه — نفسُ الدالّة التي يجمع بها الدليلُ والخادم. */
export const keyOf = (phone: string | null | undefined, name: string | null | undefined): string | null => custKey(phone, name, getDialCode());

/** نصُّ بحثٍ يلقى المفتاحَ بدليل الزبائن: الرقمُ الوطنيّ أو الاسمُ المطويّ نفسُه. */
export const queryOfKey = (key: string): string => key.slice(2);

/** الملفُّ اليدويّ للمفتاح، أو null (زبونٌ مشتقٌّ بلا ملفّ). */
export async function getProfile(key: string): Promise<CustomerProfile | null> {
  if (supabase) {
    const r = await supabase.from("customer_profiles").select("*").eq("cust_key", key).limit(1);
    if (r.error) { if (ABSENT.includes(code(r.error))) throw absentErr(); throw r.error; }
    return ((r.data ?? [])[0] as CustomerProfile | undefined) ?? null;
  }
  return (await local()).demoProfile(key);
}

export interface ProfileInput { name: string; phone: string; address: string; notes: string }
export type SaveResult = { kind: "saved"; profile: CustomerProfile } | { kind: "exists"; key: string };

/** إنشاءٌ (expect = null) أو تعديلٌ بشرط أنّ الملفَّ كما فُتح (expect = updated_at). */
export async function saveProfile(input: ProfileInput, expect: { id: string; updated_at: string } | null): Promise<SaveResult> {
  const row = {
    name: input.name.trim() || null, phone: input.phone.trim() || null,
    address: input.address.trim() || null, notes: input.notes.trim() || null,
  };
  if (supabase) {
    if (!expect) {
      // on conflict do nothing: مفتاحٌ قائم لا يُداس — يرجع صفراً فنقول «موجود» ونفتحه.
      const r = await supabase.from("customer_profiles").upsert(row, { onConflict: "clinic_id,cust_key", ignoreDuplicates: true }).select("*");
      if (r.error) { if (ABSENT.includes(code(r.error))) throw absentErr(); throw r.error; }
      const got = (r.data ?? [])[0] as CustomerProfile | undefined;
      if (got) return { kind: "saved", profile: got };
      const key = keyOf(row.phone, row.name);
      if (!key) throw Object.assign(new Error("customer_no_identity"), { code: "P0001" });
      return { kind: "exists", key };
    }
    const r = await supabase.from("customer_profiles").update(row).eq("id", expect.id).eq("updated_at", expect.updated_at).select("*");
    if (r.error) throw r.error;
    const got = (r.data ?? [])[0] as CustomerProfile | undefined;
    if (!got) throw Object.assign(new Error("stale"), { code: "stale" });
    return { kind: "saved", profile: got };
  }
  return (await local()).demoSaveProfile(row, expect);
}

/** فواتيرُ المفتاح كلُّها، الأحدثُ أوّلاً. */
export async function keyInvoices(key: string): Promise<Invoice[]> {
  if (supabase) {
    const sb = supabase;
    const out: Invoice[] = [];
    for (let from = 0; ; ) {
      const r = await sb.rpc("customer_key_invoices", { p_key: key }).range(from, from + 999);
      if (r.error) { if (ABSENT.includes(code(r.error))) throw absentErr(); throw r.error; }
      const page = (r.data ?? []) as Invoice[];
      if (page.length === 0) break;
      out.push(...page);
      from += page.length;   // يتقدّم بما وصل لا بما طُلب (CLAUDE.md: PostgREST)
    }
    return out;
  }
  return (await local()).demoKeyInvoices(key);
}

/** صفُّ الدليل للمفتاح (الاسم، الرقم، الحيوانات، الشراء) — بحثٌ بنصّ المفتاح ثمّ المجموعةُ التي مفتاحُها هو حرفاً
 *  (لا أوّلُ نتيجة: بحثُ الاسم يرجع أسماءً متشابهة). null = لا شيء بالدليل (ملفٌّ بلا فاتورةٍ ولا حيوانٍ يرجع من مصدره الثالث). */
export async function directoryHit(key: string): Promise<CustomerHit | null> {
  for (let offset = 0; offset < 400; offset += 100) {
    const page = await repo.findCustomers(queryOfKey(key), { limit: 100, offset });
    const hit = page.rows.find((r: CustomerHit) => r.key === key);
    if (hit) return hit;
    if (page.rows.length < 100) return null;
  }
  return null;
}
