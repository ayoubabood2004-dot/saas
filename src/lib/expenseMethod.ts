/* طريقةُ قبضٍ ⇒ طريقةُ سحب — جزءٌ من «الجيوب» (pockets.ts، ومنها يُعاد تصديرُه) بوحدةٍ وحدَه: repo وrepoDemo
 * يحتاجانه بالإقلاع (قيدُ المرتجع)، واستيرادُه من pockets.ts كان يُدخل حسابَ الجيوب كلَّه حزمةَ الإقلاع وهو لا
 * يُقرأ إلا بصفحة التقارير (0262: +٢٠٠ بايتٍ مضغوطة والسقفُ ضيّق). */
import type { ExpenseMethod } from "@/types";

/**
 * طريقةُ قبضٍ ⇒ طريقةُ سحب — حين يُقيَّد مالٌ خارجٌ بمفردات السحوبات
 * (المرتجعات مثلاً). كانت منسوخةً بأربعة مواضع؛ صارت هنا.
 * والمدخلُ نصٌّ حرٌّ عمداً: بعضُ المستدعين يمرّرون `bank` وبعضُهم `transfer`.
 */
export const expenseMethodOf = (m: string | null | undefined): ExpenseMethod => {
  const s = (m ?? "").toLowerCase();
  return s === "card" ? "card" : s === "transfer" || s === "bank" ? "bank" : "cash";
};
