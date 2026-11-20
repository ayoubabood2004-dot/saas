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
/** created: انكتب ملفٌّ جديد؛ exists: ملفٌّ قائم بالمفتاح؛ known: زبونٌ له فواتيرُ أو حيوانٌ بلا ملفّ (لا كتابة — يُفتح ملفُّه). */
export type AddResult = { status: "created"; key: string; profile: CustomerProfile } | { status: "exists" | "known"; key: string };

const rowOf = (input: ProfileInput) => ({
  name: input.name.trim() || null, phone: input.phone.trim() || null,
  address: input.address.trim() || null, notes: input.notes.trim() || null,
});

/** تسجيلُ زبون: الخادمُ يحسب المفتاحَ ويقرّر «موجود/معروف» قبل أن يكتب (customer_profile_add). `forKey` من ملفّ زبونٍ
 *  معروف («أضف معلومات»): الإدراجُ مقصودٌ لمفتاحه، ومفتاحٌ محسوبٌ غيرُه يُرفض. والمفتاحُ الراجع مفتاحُ الخادم (دولةُ العيادة). */
export async function addProfile(input: ProfileInput, forKey: string | null): Promise<AddResult> {
  const row = rowOf(input);
  if (supabase) {
    const r = await supabase.rpc("customer_profile_add", { p_name: row.name, p_phone: row.phone, p_address: row.address, p_notes: row.notes, p_for_key: forKey });
    if (r.error) { if (ABSENT.includes(code(r.error))) throw absentErr(); throw r.error; }
    return r.data as AddResult;
  }
  return (await local()).demoAddProfile(row, forKey);
}

/** تعديلٌ بشرط أنّ الملفَّ كما فُتح (updated_at) — صفرُ صفوفٍ يُرمى «stale» (الكتابةُ تُسمَع). */
export async function updateProfile(input: ProfileInput, expect: { id: string; updated_at: string }): Promise<CustomerProfile> {
  const row = rowOf(input);
  if (supabase) {
    const r = await supabase.from("customer_profiles").update(row).eq("id", expect.id).eq("updated_at", expect.updated_at).select("*");
    if (r.error) throw r.error;
    const got = (r.data ?? [])[0] as CustomerProfile | undefined;
    if (!got) throw Object.assign(new Error("stale"), { code: "stale" });
    return got;
  }
  return (await local()).demoUpdateProfile(row, expect);
}

/** فواتيرُ المفتاح كلُّها، الأحدثُ أوّلاً — بمؤشّرٍ ثابت (created_at, id) حتى صفحةٍ فارغة: بيعةٌ أو حذفٌ بين صفحتين لا يكرّر
 *  فاتورةً ولا يُسقطها (الإزاحةُ كانت تعدّ دينَ فاتورةٍ مرّتين). */
export async function keyInvoices(key: string): Promise<Invoice[]> {
  if (supabase) {
    const sb = supabase;
    const out: Invoice[] = [];
    let before: Invoice | null = null;
    for (;;) {
      const r = await sb.rpc("customer_key_invoices", { p_key: key, p_before_at: before?.created_at ?? null, p_before_id: before?.id ?? null });
      if (r.error) { if (ABSENT.includes(code(r.error))) throw absentErr(); throw r.error; }
      const page = (r.data ?? []) as Invoice[];
      if (page.length === 0) break;
      out.push(...page);
      before = page[page.length - 1];
    }
    return out;
  }
  return (await local()).demoKeyInvoices(key);
}

/** صفُّ الدليل للمفتاح (الاسم، الرقم، الحيوانات، الشراء) — بنداءٍ واحد: الدليلُ يقدّم المفتاحَ المطابقَ حرفاً بين المتساويين
 *  رتبةً (0270)، فالمطابقُ أوّلُ صفّ إن وُجد. null = لا شيء بالدليل لهذا المفتاح (لا «ما لقيناه بعد ٤٠٠» — قائمةٌ ناقصة).
 *  ونصٌّ أقصرُ من أن يُبحث به (اسمٌ بحرفٍ واحد) يُرمى: «ماكو حيوان» عن بحثٍ لم يجرِ كذبٌ يُصدَّق. */
export async function directoryHit(key: string): Promise<CustomerHit | null> {
  const page = await repo.findCustomers(queryOfKey(key), { limit: 3 });
  if (page.total === null && page.rows.length === 0 && queryOfKey(key).length < 2) throw Object.assign(new Error("cfile_short"), { code: "cfile_short" });
  return page.rows.find((r: CustomerHit) => r.key === key) ?? null;
}
