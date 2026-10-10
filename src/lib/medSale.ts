import type { Product } from "@/types";
import type { MedicalDraft } from "@/components/MedicalEntry";
import { searchable } from "./utils";

/* ============================================================================
 * تبويبُ «الأدوية» بشاشة البيع — أيّ سطرٍ يصير الدواءُ المختار (جوابُ المالك ٢، ٩/١٠).
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * الدواءُ من تبويب «الأدوية» كان يُباع سطرَ «دواء» بلا منتجٍ ولا كلفة — حتى لو كان علبتُه
 * على الرفّ بمخزن العيادة. فيُباع ولا ينقص الرصيد، والربحُ يُحسب كلَّه ربحاً، والرفُّ يقول
 * «عندك ٢٠» وهي ١٨. والمالكُ قرّر: ما بالمخزن يُباع **منتجاً** (سطرُ المسح نفسُه: الرصيد
 * والكلفة والعلبة/المفرد وتأكيداتُ البيع كما هي)، والسجلُّ الطبيّ يُكتب كما اليوم.
 *
 *  • منتجٌ حمله الاختيار (productId) ⇒ هو.
 *  • وإلا: منتجٌ حيٌّ واحد بالاسم نفسه مطبَّعاً **بالطرفين** (searchable) ⇒ هو؛ وأكثرُ من
 *    واحد ⇒ الكاشيرُ يختار (لا اختيارَ صامت)؛ ولا شيء ⇒ سطرُ «دواء» القديم كما كان.
 *  • ومسودّةُ السجلّ واحدةٌ لكلّ سطر — لا قيدَ مزدوجاً بالسجلّ.
 * ==========================================================================*/

/** منتجاتُ المخزن الحيّة (لا مخزنَ الحقل) التي تطابق الدواءَ المختار. */
export function medProductMatches(products: readonly Product[], pick: { name: string; productId?: string | null }): Product[] {
  const live = products.filter((p) => !p.farm_id);
  if (pick.productId) {
    const hit = live.find((p) => p.id === pick.productId);
    if (hit) return [hit];
  }
  const key = searchable(pick.name);
  if (!key) return [];
  return live.filter((p) => searchable(p.name) === key);
}

export type MedLineDecision =
  | { kind: "product"; product: Product }
  | { kind: "choose"; products: Product[] }
  | { kind: "med" };

/** القرار: منتجٌ واحد ⇒ هو؛ عدّةٌ ⇒ ما اختاره الكاشير وإلا «اختر»؛ ولا شيء ⇒ سطرُ دواء. */
export function medLineDecision(matches: readonly Product[], chosenId?: string | null): MedLineDecision {
  if (matches.length === 1) return { kind: "product", product: matches[0] };
  if (matches.length > 1) {
    const c = chosenId ? matches.find((p) => p.id === chosenId) : undefined;
    return c ? { kind: "product", product: c } : { kind: "choose", products: [...matches] };
  }
  return { kind: "med" };
}

/** سطرُ «دواء» لما ليس بالمخزن — بلا منتجٍ ولا كلفةٍ ولا رصيد، كما كان حرفاً. */
export function medOnlyLine(draft: MedicalDraft, price: number, qty: number, pet: { id: string | null; name: string | null } | null) {
  return {
    id: `m:${draft.id}`, kind: "med" as const, name: draft.name, barcode: null,
    unit_price: Math.max(0, Math.round(price * 100) / 100), unit_cost: 0, qty: Math.max(1, qty),
    stock: null, product_id: null, subcategory: null, med: draft,
    petId: pet?.id ?? null, petName: pet?.name ?? null,
  };
}

/** مسودّاتُ السجلّ لكلّ حيوان: سطرٌ يحمل دواءً لحيوانٍ معروف ⇒ مسودّةٌ واحدة — منتجاً كان أو
 *  سطرَ دواء. والراجعُ لا يكتب علاجاً. */
export function medDraftsByPet(lines: readonly { med?: MedicalDraft | null; petId?: string | null; ret?: boolean }[]): Map<string, MedicalDraft[]> {
  const out = new Map<string, MedicalDraft[]>();
  for (const l of lines) {
    if (!l.med || !l.petId || l.ret) continue;
    const arr = out.get(l.petId) ?? [];
    arr.push(l.med);
    out.set(l.petId, arr);
  }
  return out;
}
