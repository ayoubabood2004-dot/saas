// ============================================================================
// «ادخل حقلي» (0247) — مساحةُ دواجن للمشغّل بباقة «حقل» ثابتة، مفصولةٌ عن عيادته.
//
// الخادمُ يُنشئها أوّلَ مرّة ويثبّت باقتَها بكلّ دخول، ثم يدخلها بـplatform_enter
// نفسِه — فالشريطُ والخروجُ وأجلُ الجلسة كلُّها كما بعيادة زبون، وباقةُ عيادته
// لا تُمسّ. ومنفصلٌ عن platformAdmin.ts لأن ذاك بحزمة الإقلاع (الشريط والقائمة)
// وهذا لا تناديه إلا لوحةُ المنصّة الكسولة: سقفُ الإقلاع لا يدفع ثمنَه.
// ============================================================================
import { sb } from "./clinicSync";
import { forgetServerClinic } from "./serverClinic";

/** ادخل حقلي: يُنشأ أوّلَ مرّة، وتُثبَّت باقتُه «حقل» بكلّ دخول. */
export async function platformFarmEnter(): Promise<{ workspace: string; created: boolean }> {
  const client = sb();
  if (!client) throw new Error("no_backend");
  const { data, error } = await client.rpc("platform_farm_enter");
  if (error) throw new Error(error.message);
  forgetServerClinic(); // كدخول عيادة: لا يُختم شيءٌ بعيادتي حتى يؤكّدها my_workspace.
  const d = (data ?? {}) as Record<string, unknown>;
  return { workspace: String(d.workspace ?? ""), created: d.created === true };
}
