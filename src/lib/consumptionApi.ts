/* مستهلكاتُ الخدمات (0252–0255): بابٌ واحدٌ للسحابة وللنسخة التجريبية، يُحمَّل كسولاً.
 *
 * لماذا خارج repo: repo.ts بحزمة الإقلاع وفسحتُها بضعُ مئات بايت، وكلُّ دالّةٍ هنا لا تُقرأ إلا بشاشةٍ
 * كسولة (إعدادات الخدمات، ورقةُ مستهلكات السطر، تبويبُ التلف، إشعارُ ما بعد البيع). فلا يستوردها أحدٌ
 * استيراداً ثابتاً من حزمة الإقلاع — `import("@/lib/consumptionApi")` وحده.
 *
 * العقد: كلُّ قراءةٍ ترمي عند أيّ فشل ولا ترجع نصفَ قائمة (قائمةٌ ناقصة تُصدَّق)، وكلُّ كتابةٍ تمرّ أوّلاً
 * من حارس «القراءة فقط» كما تمرّ كتاباتُ الإعدادات (services.ts). والأخطاءُ تحمل رمزَ الخادم وتلميحَه
 * العربيّ (P0001 + hint) فيعرضها describeDbError كما هي. */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";

export type RecipeUnit = "stock" | "sub";
/** ما يمنع سطرَ الوصفة من أن يُخصم الآن (الخادمُ يحسبه لحظةَ القراءة). */
export type RecipeProblem = null | "in_trash" | "product_gone" | "pooled" | "farm_stock" | "no_sub_unit";

export interface RecipeLine {
  id: string;
  product_id: string;
  /** لقطةُ الاسم — تُعرض والمادةُ بالمحذوفات. */
  product_name: string;
  /** لكلّ مرّةٍ واحدةٍ من الخدمة، بوحدة `unit`. */
  qty: number;
  unit: RecipeUnit;
  position: number;
  problem: RecipeProblem;
  /** رصيدُ المادة الآن بوحدة المخزون (null والمادةُ غائبة). */
  stock: number | null;
  /** اسمُ الوحدة الصغيرة (مل، زوج…) إن كانت. */
  unit_label: string | null;
  units_per_box: number | null;
  /** كلفةُ وحدة المخزون الواحدة (المتوسط إن عُرف وإلا سعرُ الشراء). */
  unit_cost: number;
  /** كلفةُ هذا السطر لمرّةٍ واحدة من الخدمة، بالفلس الصحيح. */
  per_value: number;
}

export interface RecipeGet {
  /** بصمةُ الوصفة كما قُرئت — يُرسلها الحفظ فيرفض الخادمُ إن تغيّرت من جهازٍ آخر (recipe_moved). */
  fingerprint: string;
  /** الكلفةُ المكتوبة باليد على الخدمة (0120) — null إن لم تكن. */
  flat_cost: number | null;
  lines: RecipeLine[];
}

export interface RecipeSetInput { product_id: string; qty: number; unit: RecipeUnit }
export interface RecipeSetResult { lines: RecipeLine[]; fingerprint: string }

export interface RecipeSummaryEntry {
  /** عددُ سطور الوصفة. */
  lines: number;
  /** كلفةُ المواد لمرّةٍ واحدة بسعر اليوم. */
  cost: number;
  /** سطورٌ لا تُخصم الآن (مادةٌ محذوفة، بلا وحدةٍ صغيرة…). */
  broken: number;
}
/** لكلّ خدمةٍ لها وصفة: معرّفُ الخدمة ← ملخّصُها. */
export type RecipeSummary = Record<string, RecipeSummaryEntry>;

export interface ConsumptionSpec {
  spec_id: string;
  product_id: string;
  product_name: string;
  unit: RecipeUnit;
  unit_label: string | null;
  /** لكلّ وحدةٍ من السطر، بوحدة `unit`. */
  per_qty: number;
  /** units_per_box للوحدة الصغيرة، و1 للعلبة. */
  per_div: number;
  /** ما بقي مخصوماً الآن بوحدة المخزون (٩ مراتب). */
  live_qty: number;
  live_value: number;
  /** ما رجع للمخزن بالإرجاع/الحذف/التعديل، بوحدة المخزون (≥ 0). */
  restored_qty: number;
  /** ما صُرف بلا رصيدٍ بالنظام. */
  shortfall: number;
  note: null | "in_trash" | "product_gone";
  source: "recipe" | "override" | "relink";
  /** أحداثُ المواصفة بترتيبها: صرفُ البيعة، وكلُّ إرجاعٍ أو ربطٍ بعدها. */
  moves: ConsumptionMove[];
  /** المادةُ تنباع بالوزن (products.sold_by_weight لحظةَ القراءة، يتبع الدمج كالاسم) — فوحدةُ المخزون «كغ» لا
   *  «علبة»؛ null لمادةٍ ذهبت. وغيابُه (خادمٌ أقدم) = «علبة» كما كان، بلا تخمين. */
  by_weight?: boolean | null;
}

/* moves وnow_us وwaste: يكتبها الخادمُ (0252، والهدرُ من 0254) والمرآةُ التجريبية بكلّ قراءة، فهي لازمةٌ بالنوع.
 * والشاشاتُ تفحص شكلَها مع ذلك: غيابُها حيث تُقرأ (إشعارُ «رجّعنا» وتعبئةُ سند الهدر) خطأُ شكلٍ يُقال «أعد
 * المحاولة»، لا صفرٌ يُصدَّق. */
/** حدثٌ واحد بدفتر المواصفة. `at_us` = created_at بالميكروثانية منذ ١٩٧٠، وهو now() لمعاملته: كلُّ أحداث
 *  الفعل الواحد (بيعة، مرتجع، ترجيع، حذف، تعديل) تحمل الرقمَ نفسه — فهو «دفعةُ» ذلك الفعل. */
export interface ConsumptionMove {
  at_us: number;
  /** بوحدة المخزون (٩ مراتب): موجبٌ صرف، سالبٌ إرجاع. */
  qty: number;
}

/** سطرُ سند هدرٍ سُجّل من هذه الفاتورة (0254) — معلَّقٌ أو مطبَّق؛ المرفوضُ والملغى لا يُعدّان. */
export interface InvoiceWasteRow {
  id: string;
  product_id: string | null;
  /** دفعاتُ الترجيع التي عُبّي منها السطر (at_us لأحداثها، تصاعدياً بلا تكرار) — null لسندٍ عُبّي من الفاتورة كلّها
   *  (رابطٌ قديم بلا at). كلُّها لا أحدثُها: سطرٌ عُبّي من دفعتين (فعلان بنافذة إشعارٍ واحدة) وحُفظت أحدثُهما وحدها
   *  كان رابطٌ لاحق بالأقدم يعبّيها ثانيةً — فتُشطب مرّتين بعد الموافقة. */
  batches: number[] | null;
  status: "pending" | "approved";
  /** الكميةُ كما كُتبت بوحدتها. */
  qty: number;
  unit: RecipeUnit;
  counted_at: string;
}

/** `override_none`: الطبيبُ صفّر مستهلكاتِ هالحالة ([]) والخدمةُ لها وصفة — سطرٌ بلا مادّة يُكتب حتى يُرى
 *  بالتقرير ولا يمرّ «ما انصرف شي» بصمت. */
export type ConsumptionSkipNote = "in_trash" | "product_gone" | "pooled" | "farm_stock" | "no_sub_unit" | "service_missing" | "old_device" | "override_none";
export interface ConsumptionSkip {
  item_id: string;
  note: ConsumptionSkipNote;
  product_id: string | null;
  product_name: string | null;
  qty: number | null;
  unit: RecipeUnit | null;
  line_name: string;
  source: "recipe" | "override" | "relink" | "none";
}

export interface StockNegative {
  product_id: string;
  name: string;
  stock: number;
  /** كـ`ConsumptionSpec.by_weight`: products.sold_by_weight لحظةَ القراءة. وغيابُه خادمٌ أقدم — الإشعارُ يقول
   *  الرقمَ بلا وحدة إن لم تعرفها مواصفةٌ للمادّة نفسها. */
  by_weight?: boolean | null;
}

export interface InvoiceConsumption {
  /** سطرُ الفاتورة ← مواصفاتُ ما خُصم له. */
  items: Record<string, ConsumptionSpec[]>;
  skips: ConsumptionSkip[];
  /** كلُّ مادةٍ مسّتها الفاتورة ورصيدُها الآن تحت الصفر. */
  negatives: StockNegative[];
  /** وقتُ الخادم لحظةَ هذه القراءة بالميكروثانية — به يُعرف أيُّ دفعةٍ جاءت بعد ضغطةٍ قيست بساعة الجهاز
   *  (performance.now)، بلا اعتمادٍ على ساعة الجهاز نفسها. */
  now_us: number;
  /** ما سُجّل هدراً من هذه الفاتورة — حتى لا يُعبّأ سندٌ ثانٍ لما سُجّل. */
  waste: InvoiceWasteRow[];
}
/** معرّفُ الفاتورة ← ما صرفته. */
export type InvoiceConsumptionMap = Record<string, InvoiceConsumption>;

export interface ConsumablesReport {
  products: { product_id: string; name: string; used: number; value: number; short: number; lines: number }[];
  short_products: number;
  /** `by_owner`: كتبه صاحبُ العيادة (لا صفَّ كادرٍ له) — البطاقةُ تقول «صاحب العيادة» لا «موظف». وغيابُه خادمٌ أقدم. */
  overrides: { count: number; recent: { invoice_id: string; created_at: string; service_name: string; products: unknown; by_name: string | null; by_owner?: boolean }[] };
  unconsumed: { old_device: number; service_missing: number; recent: { invoice_id: string; created_at: string; line_name: string; note: "old_device" | "service_missing" }[] };
}

export interface WasteLineInput {
  product_id: string;
  qty: number;
  unit: RecipeUnit;
  reason: "damaged" | "expired";
  note: string;
  /** التأكيدُ الثاني: الكميةُ أكبر من الرصيد بالنظام (waste_exceeds_stock). */
  ack_over?: boolean;
  /** السطرُ عُبّي من فاتورةٍ رجعت موادُّها: يُحفظ مرجعُها ودفعاتُها فلا يُعبّأ ما سُجّل مرّةً ثانية. */
  src_invoice?: string;
  /** دفعاتُ الرابط التي رجعت فيها هذه المادةُ شيئاً (at_us، تصاعدياً بلا تكرار، غيرُ فارغة) — يرفض الخادمُ ما ليس
   *  حدثاً لهذه المادة بهذه الفاتورة بنفس الميكروثانية (waste_source_bad). بلا at (رابطٌ قديم): يُحذف الحقل. */
  src_batches?: number[];
}
export interface WasteSubmitResult {
  pending: number;
  ids: string[];
  /** نتيجةُ الموافقة حين طُبّق فوراً (المدير) — بنفس شكل stock_count_decide، وفيها negatives. */
  decided: (Record<string, unknown> & { negatives?: StockNegative[] }) | null;
  lines: { product_id: string; name: string; stock_now: number; stock_after: number }[];
}

export interface CostResetResult { id: string; avg_cost: number | null; purchase_price: number }

export interface ConsumptionApi {
  recipeGet(serviceId: string): Promise<RecipeGet>;
  recipeSet(serviceId: string, lines: RecipeSetInput[], expect: string, clearFlatCost?: boolean): Promise<RecipeSetResult>;
  recipeSummary(): Promise<RecipeSummary>;
  invoiceConsumption(invoiceIds: string[]): Promise<InvoiceConsumptionMap>;
  reportConsumables(from: string, to: string): Promise<ConsumablesReport>;
  /** `clientRef` يُولَّد قبل النداء ويُعاد مع إعادة المحاولة — الخادمُ يرجع نتيجةَ الأولى ولا يسجّل مرّتين. */
  submitWaste(lines: WasteLineInput[], apply: boolean, clientRef: string): Promise<WasteSubmitResult>;
  productCostReset(productId: string, cost: number | null): Promise<CostResetResult>;
}

type RpcError = { message: string; code?: string; details?: string; hint?: string } | null;

/** نداءٌ يرجع jsonb: خطأٌ أو «لا بيانات» يُرمى برمز الخادم وتلميحه (نظيرُ need في repo.ts). */
async function rpcJson<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("no_cloud");
  const res = (await supabase.rpc(fn, args)) as { data: unknown; error: RpcError };
  if (res.error || res.data == null) {
    const src = res.error;
    const err = new Error(src?.message ?? "No data returned") as Error & { code?: string; details?: string; hint?: string };
    if (src?.code) err.code = src.code;
    if (src?.details) err.details = src.details;
    if (src?.hint) err.hint = src.hint;
    throw err;
  }
  return res.data as T;
}

/** حارسُ «القراءة فقط» لكتابات هذا الباب — بنفس خطأ repo (ReadOnlyError) فتعرضه الشاشاتُ كما تعرضه. */
function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

const cloud: ConsumptionApi = {
  recipeGet: (serviceId) => rpcJson("service_recipe_get", { p_service: serviceId }),
  recipeSet: (serviceId, lines, expect, clearFlatCost = false) => {
    writable();
    return rpcJson("service_recipe_set", { p_service: serviceId, p_lines: lines, p_expect: expect, p_clear_flat_cost: clearFlatCost });
  },
  recipeSummary: () => rpcJson("service_recipe_summary", {}),
  invoiceConsumption: (invoiceIds) => rpcJson("invoice_consumption_get", { p_invoice_ids: invoiceIds }),
  reportConsumables: (from, to) => rpcJson("report_consumables", { p_from: from, p_to: to }),
  submitWaste: (lines, apply, clientRef) => {
    writable();
    return rpcJson("stock_waste_submit", { p_lines: lines, p_apply: apply, p_meta: { client_ref: clientRef } });
  },
  productCostReset: (productId, cost) => {
    writable();
    return rpcJson("product_cost_reset", { p_id: productId, p_cost: cost });
  },
};

/* النسخةُ التجريبية: نفسُ العقد على localStorage، كسولةٌ هي الأخرى (demoConsumption.ts) — وتُحمَّل من باب
 * repoDemo وحده، فتبقى demoRole وما تشترك به المرآتان داخل قطعة repoDemo ولا يكبر الإقلاع (demo-role-test). */
const local = () => import("./repoDemo").then((m) => m.loadDemoConsumption());
const demo: ConsumptionApi = {
  recipeGet: async (serviceId) => (await local()).demoRecipeGet(serviceId),
  recipeSet: async (serviceId, lines, expect, clearFlatCost = false) => {
    writable();
    return (await local()).demoRecipeSet(serviceId, lines, expect, clearFlatCost);
  },
  recipeSummary: async () => (await local()).demoRecipeSummary(),
  invoiceConsumption: async (invoiceIds) => (await local()).demoInvoiceConsumption(invoiceIds),
  reportConsumables: async (from, to) => (await local()).demoReportConsumables(from, to),
  submitWaste: async (lines, apply, clientRef) => {
    writable();
    return (await local()).demoSubmitWaste(lines, apply, clientRef);
  },
  productCostReset: async (productId, cost) => {
    writable();
    return (await local()).demoProductCostReset(productId, cost);
  },
};

export const consumptionApi: ConsumptionApi = supabase ? cloud : demo;
