/* ============================================================================
 * أجورٌ إضافية بفاتورة الشراء (0276) — بابٌ كسولٌ خارج repo.ts (حزمةُ الإقلاع وفسحتُها محدودة)، لا تستورده إلا شاشةٌ كسولة:
 * نموذجُ الشراء يسأل الحالَ، وبطاقةُ الإعدادات تغيّر الإعداد. والكتابةُ نفسُها (الأجورُ مع الفاتورة) تمرّ من record/update_purchase.
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { rpcJson } from "./rpcJson";
import type { PurchaseChargesMode } from "@/types";

export interface PurchaseChargesState {
  /** الأجسامُ الحيّة الخمسة تعرف الأجور (purchase_charges_ready) — وإلا تُخفى الخانةُ ولا يُرسل المفتاح. */
  ready: boolean;
  /** كيف تُحسب الأجورُ التي تُضاف اليوم بهذه العيادة (ما سُجّل قبلُ مختومٌ على فاتورته). */
  mode: PurchaseChargesMode;
}

/** فحصُ قدرةٍ لا قائمةُ قرار: قاعدةٌ قبل 0276 (لا دالّة) أو فشلٌ شبكيّ = «لا» — أجرةٌ تُكتب ولا تُحفظ أسوأُ من خانةٍ غائبة. */
export async function purchaseChargesState(): Promise<PurchaseChargesState> {
  if (!supabase) return (await import("./repoDemo")).demoPurchaseChargesState();
  try {
    const r = await supabase.rpc("purchase_charges_state");
    const d = r.data as { ready?: unknown; mode?: unknown } | null;
    if (r.error || !d) return { ready: false, mode: "cost" };
    return { ready: d.ready === true, mode: d.mode === "expense" ? "expense" : "cost" };
  } catch {
    return { ready: false, mode: "cost" };
  }
}

/** إعدادُ العيادة (للمدير). يرمي برمز الخادم وتلميحه (forbidden…)، والشاشةُ تقوله. */
export async function setPurchaseChargesMode(mode: PurchaseChargesMode): Promise<PurchaseChargesMode> {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
  if (!supabase) return (await import("./repoDemo")).demoPurchaseChargesModeSet(mode);
  return rpcJson<PurchaseChargesMode>("purchase_charges_mode_set", { p_mode: mode });
}
