import { getActiveClinicId } from "./clinics";

/* ============================================================================
 * مَن يطلب بالتجريبيّ — مرآةُ auth_role_base() وauth_role() وauth.uid() بالخادم — ورفضُه
 * برمزه وتلميحه. مستوردوها كلُّهم مرايا كسولة (repoDemo وأخواتُها)، فتُحمَّل معها ولا
 * يستوردها شيءٌ بحزمة الإقلاع. وتسكن **داخل** قطعة repoDemo ما دام كلُّ طريقٍ إليها يمرّ منها:
 * وحدةٌ تُحمَّل بلا repoDemo (consumptionApi ⇢ demoConsumption مثلاً) وتستوردها تفصلها بقطعةٍ
 * مشتركة يدخل اسمُها سجلَّ تحميل lazyDemo داخل main — demo-role-test يتتبّع الطريق.
 *
 * كانت داخل repoDemo.ts، والمرآتان الكسولتان بجانبها (الجرد والدفعات) كتبتا قارئاً
 * بيدهما: `raw.role` — مفتاحٌ لا يكتبه AuthContext.persistRaw أبداً. فحارسا
 * `count_needs_manager` و`lot_forbidden` لم يرفضا أحداً بالتطبيق: الاستقبالُ يوافق على
 * الجرد ويضيف دفعات، والفحصُ يمرّ لأن قالبَه كتب المفتاحَ بيده. فالقارئُ صار واحداً هنا،
 * وكلُّ مرآةٍ تحرس دوراً تستورده — لا نسخةً منه.
 * ========================================================================= */

/** رفضٌ برمز الخادم (P0001) وتلميحِه حرفاً — `describeDbError` يعرض التلميحَ كما هو. */
export function demoHint(code: string, hint: string): Error {
  return Object.assign(new Error(code), { code: "P0001", hint });
}

/** الدورُ الأساس (auth_role_base) بالمفاتيح التي **يكتبها** AuthContext.persistRaw: `raw.staff.staffRole`، ثمّ
 *  `raw.staff.role ?? raw.rawRole` (owner/admin مدير، doctor طبيب، reception استقبال) — قراءةُ demoStaffRole
 *  نفسُها (demoStoreCats.ts كسولةٌ فلا تُستورد هنا). بلا جلسةٍ = صاحبُ العيادة كباقي التجريبيّ؛ أمّا جلسةٌ بدورٍ
 *  لا يُعرف فليست مديراً — مفتاحٌ يضيع أو يتهجّى غلطاً لا يرفع موظّفاً لمدير بصمت. */
export function demoBaseRole(): string {
  let s: { raw?: { rawRole?: string; staff?: { role?: string; staffRole?: string | null } | null } } | null = null;
  try { s = JSON.parse(localStorage.getItem("vp_session") || "null"); } catch { /* swallow-ok: جلسةٌ تالفة كغيابها */ }
  if (!s?.raw) return "manager";
  const staffRole = s.raw.staff?.staffRole;
  if (staffRole) return staffRole;
  const r = s.raw.staff?.role ?? s.raw.rawRole;
  return r === "owner" || r === "admin" ? "manager" : r === "doctor" ? "veterinarian" : r === "reception" ? "receptionist" : `unknown:${r ?? ""}`;
}
/** رفعُ مفتاح المدير (staff_elevations): وقتُ انتهائه بالجهاز لهذه العيادة كما يكتبه managerOverride.ts.
 *  ما دام حيّاً فـauth_role() «manager» أيّاً كان الأساس — فمرآةُ `auth_role() = 'manager'` هي
 *  `demoBaseRole() === "manager" || demoPinLive()`، ومرآةُ «مديرٌ أو طبيب» تضيف `"veterinarian"` للأساس. */
export function demoPinLive(): boolean {
  try { return Number(localStorage.getItem(`vp_override_until_${getActiveClinicId()}`) || 0) > Date.now(); } catch { return false; /* swallow-ok: بلا تخزين = بلا رفع */ }
}
/** مرآةُ api_gate (0222 ← 0233): المصوّرُ بالدور **الأساس** يُردّ قبل أيّ دالّةٍ خارج قائمة البوّابة — 42501 بتلميحها حرفاً
 *  (بياناتٌ بمهارب يونيكود لا نصُّ واجهة). ومفتاحُ المدير لا يفتحها: البوّابةُ تسأل is_photographer لا auth_role. */
export function demoApiGate(): void {
  if (demoBaseRole() === "photographer") {
    throw Object.assign(new Error("photographer_forbidden"), { code: "42501",
      hint: "\u0647\u0630\u064A \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u0648 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0648\u0638\u0641 \u0627\u0644\u062A\u0635\u0648\u064A\u0631." });
  }
}
/** `v_role is null or v_role not in ('manager','veterinarian')` ⇒ «forbidden: inventory role required» — حارسُ دوالّ المخزن
 *  (record_purchase وupdate_purchase 0255، inventory_tidy_uncat وrestore_product 0253، merge_products 0184، delete_product 0146)
 *  أوّلَ كلّ شيء، والبوّابةُ قبله. كان التجريبيُّ يشتري ويدمج ويحذف لأيّ دور (قيسَ بالمراجعة على الخادم: الاستقبالُ يُرفض). */
export function demoInventoryRole(): void {
  demoApiGate();
  const base = demoBaseRole();
  if (base !== "manager" && base !== "veterinarian" && !demoPinLive()) throw new Error("forbidden: inventory role required");
}
/** auth.uid() بالتجريبيّ: معرّفُ الجلسة (`raw.id`). */
export function demoUserId(): string | null {
  try { return (JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string } } | null)?.raw?.id ?? null; } catch { return null; }
}
/** auth_clinic() بالتجريبيّ — العيادةُ التي تعمل لها الجلسة، بقراءة AuthContext نفسِها للمساحة المشتركة: عيادةُ عضوية الكادر
 *  (`raw.staff.clinicId`)، وإلا عيادةُ الملفّ (`raw.clinic_id`)، وإلا الحسابُ نفسُه (`raw.id` — حسابُ العيادة معرّفُه معرّفُها، كالخادم
 *  حيث معرّفُ صاحب العيادة هو clinic_id). بلا جلسةٍ null: لا عيادةَ تُعرف فلا «صاحب العيادة» يُنسب لأحد (by_owner false). */
export function demoClinicId(): string | null {
  try {
    const raw = (JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string; clinic_id?: string | null; staff?: { clinicId?: string | null } | null } } | null)?.raw;
    return raw ? (raw.staff?.clinicId ?? raw.clinic_id ?? raw.id ?? null) : null;
  } catch { return null; }
}
