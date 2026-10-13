import { getActiveClinicId } from "./clinics";
import { supabase } from "./supabase";

/* ============================================================================
 * «أيَّ عيادةٍ يقصد هذا المتصفّح؟» — مفتاحُ العيادة المحلّيّ وترجمتُه لمعرّف الخادم.
 *
 * ── الجذر (١٣/١٠) ─────────────────────────────────────────────────────────
 * المفتاحُ المحلّيّ (`getActiveClinicId`) يكتبه AuthContext للكادر (عيادةُ الدعوة) — ومنه
 * المشغّلُ داخلَ عيادةِ زبون (my_workspace يقول is_staff). وصاحبُ العيادة `profiles.clinic_id`
 * عنده فارغ (التسعةُ كلُّهم — مقيسٌ بالإنتاج) فلا يُكتب له شيء: مفتاحُه "default" ومعناه
 * «عيادتي أنا»… **إلا إن بقي مفتاحُ عيادةٍ زارها**: المشغّلُ يخرج من عيادة الزبون (أو كادرٌ
 * يترك عيادته) فلا يُمسح المفتاح، ويبقى باسم تلك العيادة وهو بعيادته.
 *
 * وشاشتا «أدويتي» وتصنيفات المتجر تقارنان ختمَ الخادم (auth_clinic) بالمفتاح: "default" أو
 * مفتاحٌ باقٍ ≠ معرّف العيادة ⇒ `switched` — «تبدّلت العيادة — حدّث الصفحة» على صاحب العيادة،
 * وصفرُ كتابةٍ بشريّةٍ بـ«أدويتي» منذ نشرها (سجلُّ التدقيق). والخبيئاتُ المحلّيّةُ مسمّاةٌ بالمفتاح،
 * فالمفتاحُ الباقي يرطّب إعداداتِ عيادته باسم عيادةٍ أخرى.
 *
 * فالإصلاحُ بموضعين:
 *  • `clinicKeyAction` — AuthContext يمسح المفتاحَ (يرجع "default") حين يؤكّد الخادمُ أن الحسابَ
 *    بعيادته (my_workspace: is_staff=false). بحثٌ فشل ليس تأكيداً: لا يُمسح مفتاحُ موظّفٍ
 *    بشبكةٍ متعثّرة (عملياتُه المختومةُ بعيادته كانت ستُحبس).
 *  • `expectedServerClinic` — عند المقارنة بالخادم أو الكتابة بمعرّفه: "default" = حسابُ الجلسة.
 *    المفتاحُ نفسُه يبقى "default" للمالك: الخبيئاتُ مسمّاةٌ به (ويقرؤه ختمُ الطابور `whoNow`).
 *
 * والحارسُ باقٍ لما وُضع له (0153): لحظةُ ما قبل استقرار المفتاح (المشغّلُ قبل إعادة التحميل
 * بعد دخوله، أو جلسةٌ لم تُستعد) تبقى `switched` — لا تُرسم عيادةٌ ولا يُكتب بها على ظنّ.
 * ==========================================================================*/

/** ماذا يفعل AuthContext بالمفتاح — خالصةٌ تُفحص (owner-key-test). */
export type ClinicKeyAction = "keep" | "clear" | { set: string };
export function clinicKeyAction(a: {
  active: "owner" | "clinic" | null;
  staffClinic: string | null;
  profileClinic: string | null;
  /** الخادمُ أكّد «عيادتي» (my_workspace) — لا بحثٌ فشل. */
  ownConfirmed: boolean;
}): ClinicKeyAction {
  if (a.active === "owner") return "clear";
  if (a.active !== "clinic") return "keep";
  const id = a.staffClinic ?? a.profileClinic;
  if (id) return { set: id };
  return a.ownConfirmed ? "clear" : "keep";
}

/** معرّفُ العيادة التي يقصدها المتصفّح، بلغة الخادم: المفتاح، و"default" = حسابُ الجلسة. */
export async function expectedServerClinic(): Promise<string> {
  const active = getActiveClinicId() || "default";
  if (active !== "default" || !supabase) return active;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? active;
  } catch {
    return active;
  }
}
