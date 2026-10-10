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

/** مسودّةُ سجلٍّ بحيوانها — ما تُلصقه إضافةٌ واحدةٌ من التبويب بسطر منتج. */
export interface MedRef { med: MedicalDraft; petId: string | null; petName: string | null }
type MedLine = { id?: string; med?: MedicalDraft | null; petId?: string | null; petName?: string | null; medMore?: MedRef[]; ret?: boolean };

/**
 * يُلصق مسودّةَ إضافةٍ من التبويب بسطر المنتج الذي بيعت فيه: أوّلُها بالسطر نفسه (`med` و`petId`)،
 * وكلُّ إضافةٍ بعدها — حيوانٌ ثانٍ بنفس الفاتورة، أو جرعةٌ ثانية لنفسه — بقائمته (`medMore`).
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * سطرُ المنتج واحدٌ للرصيد (`p:<id>`: السقفُ والكلفةُ والعلبة)، والمسودّةُ كانت واحدةً له:
 * الإضافةُ الثانية تزيد الكميةَ وتُسقط مسودّتَها بـ«بالسلّة أصلاً». فمالكٌ بحيوانين يأخذان
 * نفسَ الدواء: يُباع الاثنان ويُخصمان، ويُكتب علاجُ الأوّل وحده. قبل البيع منتجاً كان لكلّ
 * إضافةٍ سطرُها وقيدُها — «قيدٌ لكلّ دواءٍ مباع» يعني لكلّ إضافة، لا لكلّ رصيد.
 */
export function attachMedDraft<L extends MedLine>(lines: readonly L[], lineId: string, ref: MedRef): L[] {
  return lines.map((l) => {
    if (l.id !== lineId) return l;
    if (!l.med) return { ...l, med: ref.med, petId: ref.petId, petName: ref.petName } as L;
    return { ...l, medMore: [...(l.medMore ?? []), ref] } as L;
  });
}

/** كلُّ مسودّات السطر بحيواناتها — الأولى ثم ما لُصق بعدها. */
export function lineMedRefs(l: MedLine): MedRef[] {
  const first: MedRef[] = l.med ? [{ med: l.med, petId: l.petId ?? null, petName: l.petName ?? null }] : [];
  return [...first, ...(l.medMore ?? [])];
}

/** أسماءُ حيوانات السطر بلا تكرار — للوصل والسلّة حين تكون الفاتورةُ لأكثر من حيوان. */
export function linePetNames(l: MedLine): string[] {
  const names = [l.petName, ...(l.medMore ?? []).map((m) => m.petName)].map((n) => (n ?? "").trim()).filter(Boolean);
  return [...new Set(names)];
}

/** مسودّاتُ السجلّ لكلّ حيوان: كلُّ مسودّةٍ لحيوانٍ معروف بسطرها — منتجاً كان أو سطرَ دواء،
 *  أولى أو ملصقةً بعدها. والراجعُ لا يكتب علاجاً. */
export function medDraftsByPet(lines: readonly MedLine[]): Map<string, MedicalDraft[]> {
  const out = new Map<string, MedicalDraft[]>();
  for (const l of lines) {
    if (l.ret) continue;
    for (const r of lineMedRefs(l)) {
      if (!r.petId) continue;
      const arr = out.get(r.petId) ?? [];
      arr.push(r.med);
      out.set(r.petId, arr);
    }
  }
  return out;
}
