/* ============================================================================
 * مرآةُ مستهلكات الخدمات بالنسخة التجريبية (0252 + 0253) — جسمُ الخادم خطوةً خطوة، والحسابُ كلُّه من
 * consumption.ts (BigInt) لا نسخةٌ منه: لا تقريبَ هنا إلا roundDiv، ولا عائمَ لمقدارٍ يحسبه الخادم بالضبط.
 *
 * ── المخزن (DemoDB — يُنشأ عند أوّل كتابة، ويُحفظ مع الفاتورة بـsaveDB واحد) ─────────────────────
 *   serviceRecipes    ⇐ clinic_service_recipe_items   qty_m
 *   consumption       ⇐ invoice_consumption           per_qty_m per_div_m unit_cost_u per_value_c line_qty_m
 *                                                     qty_n posted_m value_c shortfall_m
 *   consumptionSkips  ⇐ invoice_consumption_skips     qty_m line_qty_m
 *   stockCarry        ⇐ product_stock_carry (بالمعرّف) carry_n ext_in_n ext_out_m
 *   كلُّ مقدارٍ دقيق عددٌ صحيحٌ مُقاس محفوظٌ **نصّاً عشرياً لـBigInt** (لا رقماً عائماً، ولا «عدداً آمناً»:
 *   T(Q) بالمليار يتجاوز 2⁵³ لكميةٍ كبيرة). اللاحقة تقول المقياس: _n ×10⁹، _m ×10³، _u ×10⁶، _c ×10².
 *   والرصيدُ products.stock يبقى رقماً بثلاث منازل يُكتب من الألف (fromScaled) — كعمود numeric(24,3).
 *
 * ── الترتيبُ ترتيبُ الخادم ───────────────────────────────────────────────────────────────
 *   البيعة (retail_checkout، والنداءُ من createInvoiceLocal): الإعادة ← التأريخ ← planLocal (كلُّ رفضٍ قبل
 *   أيّ كتابة) ← المالُ بالفلس الصحيح (addLineCents) ← السطور (المادّةُ تخصم أوّلاً، بلا حصر 0253) ←
 *   afterLinesLocal (الصرفُ ثمّ تخطّياتُ السطور). والعكسُ كلُّه إلى هدف (syncItemLocal) — نفسُ المحفّزات:
 *   حذفُ سطر، تغيّرُ كميته، دخولُ «مرجَّعة» أو خروجُها، والدمج (followMergeLocal). والتعديلُ يعيد السطورَ
 *   بمعرّفاتٍ جديدة ثمّ يربطها بسابقها (relinkLocal) بعد حلقة الإدراج كلِّها.
 *
 * ── ما يختلف عن الخادم عن قصد (التجريبيّ بلا قاعدة) ─────────────────────────────────────────
 *   • معرّفاتُ المواد ليست uuid: فحصُ شكل معرّف المادة بالتعديل يقع على مادّةٍ غير موجودة (consumables_bad)
 *     بعد فحص الدور لا قبله. ومعرّفُ الخدمة uuid (services.ts) فـservice_id_bad كالخادم.
 *   • البصمة نصُّ «المادة:الكمية:الوحدة:الموضع» بـ| بترتيب (position, id) نفسُه، بلا md5 — حتميّةٌ، والقراءةُ
 *     والحفظُ يحسبانها بدالّةٍ واحدة من المخزن ساعةَ النداء، فحفظٌ من تبويبٍ آخر يُرى (recipe_moved).
 *   • الوصفة بـDemoDB والكلفةُ الثابتة بكتالوج الخدمات (services.ts): تصفيرُها (p_clear_flat_cost) بعد حفظ
 *     الوصفة لا معه — saveDB يرمي أوّلاً فلا تُصفَّر كلفةٌ لوصفةٍ لم تُحفظ.
 *   • override_none: تعديلُ حالةٍ بـ[] على خدمةٍ لها وصفة يكتب تخطّياً على مستوى السطر (source 'override'،
 *     بلا مادّة) — قرارُ المالك ٣١/١٠، والخادمُ يلحقه بتعديلٍ لاحق.
 *   • الكلفةُ stock_unit_cost (0255) = greatest(coalesce(avg_cost, purchase_price, 0), 0)، بدالّةٍ واحدة (consView) — والمتوسّطُ
 *     يحرّكه الشراءُ وتعديلُه والدمجُ والتصحيح وحدهم (avgCost.ts حرفاً)، وسطرُ المادّة بالبيعة والتعديل بكلفة الخادم (V1b).
 *   • ساعةُ الدفعات: كلُّ أحداث الفعل الواحد بـat_us واحد فوق كلّ ما خُزّن (opStamp) — دفعتُه كـcreated_at = now() بالخادم.
 *   • سندُ التلف (0254) بمرآة الجرد (demoCounts.ts) — والمرحِّلُ من هنا يُمرَّر إليها، فلا دائرةَ بين القطعتين.
 *   • الترجيعُ: الخادمُ يقلب الحالةَ أوّلاً (محفّزُ الحالة يزامن كلَّ سطر) ثمّ يردّ سطورَ المواد؛ والتجريبيُّ يزامن كلَّ
 *     سطرٍ أوّلَ restockLocal ثمّ يردّه. المكتوبُ يتبع المجموعَ التراكميّ وحده فالرصيدُ والمرحَّلُ والدفترُ سواء
 *     (مقيسٌ على 0252/0253 الحقيقيّتين بـPGlite)، وقد يختلف أيُّ حدثٍ يحمل الملّيَّ المكتوب بين سطرين لمادّةٍ واحدة.
 *   • فكُّ الترجيع لا بابَ له بالتجريبيّ (بالخادم كتابةُ مديرٍ مباشرة): statusSyncLocal مرآةُ محفّز الحالة وحده.
 *   • البوّابة (api_gate): المصوّرُ بالدور الأساس يُردّ photographer_forbidden (42501) قبل أيّ دالّةٍ هنا.
 *
 * ── الجولة الثالثة (0252/0254/0255 كما استقرّت) ──────────────────────────────────────────────
 *   • service_id بثلاث حالات (planLocal): الاسمُ يُصنَّف «جهازاً قديماً» حين يغيب المفتاحُ وحده — null أو نصٌّ فارغ سطرٌ معروفٌ
 *     ليس خدمة (دواء، لقاح، أجرة توصيل): لا تخطّيَ ولا وصفة.
 *   • الربطُ نقلٌ لا بيعة (moveLocal بـmv من relinkLocal وحده): عجزُ نسخة الربط ما زاده التعديلُ نفسُه بدفعته لهذه الفاتورة والمادّة،
 *     والتقريرُ يمشي العجزَ مرّةً لكلّ (فاتورة، مادّة) بآخر حالها — كلُّ دفعةٍ صافيةً، والإرجاعُ يردّ آخرَ ما صُرف بلا رصيد.
 *   • by_weight لكلّ مواصفةٍ ولكلّ مادّةٍ سالبة بالقراءة، وby_owner بالتقرير (الكاتبُ = عيادةُ الجلسة: صاحبُ العيادة).
 *   • المجهولُ لا يُكتب فوق المتوسّط المخزَّن (الشراءُ وتعديلُه)، والتجميعُ بكتابةٍ مباشرة يُرفض pool_direct (repoDemo.updateProduct).
 * ========================================================================= */
import type { CheckoutItem, DeletedProduct, DemoConsumptionEvent, DemoConsumptionSkip, DemoDB, DemoRecipeRow, Product, Service } from "@/types";
import type {
  ConsumablesReport, ConsumptionSkip, ConsumptionSpec, CostResetResult, InvoiceConsumptionMap, InvoiceWasteRow, RecipeGet, RecipeLine,
  RecipeProblem, RecipeSetInput, RecipeSetResult, RecipeSummary, StockNegative, WasteLineInput, WasteSubmitResult,
} from "./consumptionApi";
import {
  addLineCents, consumptionMove, EMPTY_CARRY, entrySkip, fromScaled, overrideRefusal, parseRecipeLine, perDivMilli,
  perValueCents, productLineCostCents, roundDiv, roundScaled, sameConsumables, shortfallMilli, specValues, stockPost, stockUnitCost,
  subUnitMilli, targetNano, toCents, toMicro, validateRecipeLines,
  type CarryState, type ConsProduct, type PostMode, type RecipeUnit,
} from "./consumption";
// 0255: المتوسّطُ المتحرّك حرفاً من مرآة الخادم (avgCost.ts) — لا تقريبَ يُعاد هنا.
import { avgAdjust, avgBase, avgMerge, avgReceive, purchaseUnitCostU, receiveVarianceCents } from "./avgCost";
import { loadDB, saveDB } from "./demoStore";
import { demoBaseRole, demoClinicId, demoHint, demoPinLive, demoUserId } from "./demoRole";
// مفتاحُ العيادة الفعّال: كتالوجُ الخدمات لكلّ مفتاح (services.ts) والمخزنُ التجريبيّ واحد — clinics.ts بحزمة الإقلاع أصلاً.
import { getActiveClinicId } from "./clinics";
/* ثابتٌ لا import(): staff.ts بحزمة الإقلاع أصلاً، وimport() لوحدةٍ فيها يجبر Rollup أن يبني كائنَ أسمائها كلَّه
 * داخلها ويصدّره (مقيس: +٢٤٨ بايت مضغوطة). وeffectiveCan لا roleCan: هي مصدَّرةٌ للقطع الكسولة من قبل
 * (demoStoreCats)، وroleCan تصير تصديراً جديداً للإقلاع (+٥). وبلا تجاوزٍ هما واحد لكلّ دور. */
import { effectiveCan, listStaff, STAFF_ROLES } from "./staff";
import type { Capability } from "./staff";
import { uid } from "./utils";
import { demoAddExpense, demoAuditPush, demoServices } from "./repoDemo";

/* ── تلميحاتُ الخادم حرفاً (\u — بياناتٌ لا نصُّ واجهة) ─────────────────────────────────────── */
const H = {
  serviceIdBad: "\u0633\u0637\u0631 \u062E\u062F\u0645\u0629 \u0628\u0645\u0639\u0631\u0651\u0641 \u063A\u0644\u0637 \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0648\u0623\u0639\u062F \u0627\u0644\u0628\u064A\u0639\u0629",
  consumablesBad: (n: string) => `\u0645\u0633\u062A\u0647\u0644\u0643\u0627\u062A \u0633\u0637\u0631 \u00AB${n}\u00BB \u063A\u0644\u0637 \u2014 \u0627\u0641\u062A\u062D\u0647\u0627 \u0648\u0635\u062D\u0651\u062D\u0647\u0627`,
  consumablesForeign: (n: string) => `\u0645\u0633\u062A\u0647\u0644\u0643\u0627\u062A \u0633\u0637\u0631 \u00AB${n}\u00BB \u0628\u064A\u0647\u0627 \u0645\u0627\u062F\u0629 \u0645\u0648 \u0645\u0646 \u0645\u062E\u0632\u0646 \u0647\u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u2014 \u0627\u0641\u062A\u062D\u0647\u0627 \u0648\u0635\u062D\u0651\u062D\u0647\u0627`,
  caseRole: "\u062A\u0639\u062F\u064A\u0644 \u0645\u0633\u062A\u0647\u0644\u0643\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u0629 \u0644\u0644\u0637\u0628\u064A\u0628 \u0623\u0648 \u0627\u0644\u0645\u062F\u064A\u0631 \u2014 \u0634\u064A\u0644 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0623\u0648 \u062E\u0644\u0651\u064A \u0627\u0644\u0637\u0628\u064A\u0628 \u064A\u0643\u0645\u0651\u0644 \u0627\u0644\u0628\u064A\u0639\u0629",
  mergeLoop: "\u0633\u0644\u0633\u0644\u0629 \u062F\u0645\u062C \u0645\u0643\u0633\u0648\u0631\u0629 \u0628\u0647\u0627\u0644\u0645\u0627\u062F\u0629 \u2014 \u0628\u0644\u0651\u063A \u0627\u0644\u062F\u0639\u0645",
  postMode: "\u0637\u0631\u064A\u0642\u0629\u064F \u062A\u0631\u062D\u064A\u0644\u064D \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629 \u2014 \u0628\u0644\u0651\u063A \u0627\u0644\u062F\u0639\u0645",
  serviceMissing: "\u0627\u0644\u062E\u062F\u0645\u0629 \u0645\u0627 \u0648\u0635\u0644\u062A \u0644\u0644\u0633\u062D\u0627\u0628\u0629 \u0628\u0639\u062F \u2014 \u0627\u0646\u062A\u0638\u0631 \u0644\u062D\u0638\u0629 \u0648\u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629",
  forbidden: "\u0648\u0635\u0641\u0629 \u0627\u0644\u062E\u062F\u0645\u0629 \u064A\u0639\u062F\u0651\u0644\u0647\u0627 \u0627\u0644\u0645\u062F\u064A\u0631 \u2014 \u0627\u0641\u062A\u062D \u0648\u0636\u0639 \u0627\u0644\u0645\u062F\u064A\u0631",
  moved: "\u0627\u0644\u0648\u0635\u0641\u0629 \u062A\u063A\u064A\u0651\u0631\u062A \u0645\u0646 \u062C\u0647\u0627\u0632 \u062B\u0627\u0646\u064A \u2014 \u0633\u0643\u0651\u0631\u0647\u0627 \u0648\u0627\u0641\u062A\u062D\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F",
  badShape: "\u0627\u0644\u0648\u0635\u0641\u0629 \u0648\u0635\u0644\u062A \u0628\u0634\u0643\u0644\u064D \u063A\u0644\u0637 \u2014 \u0633\u0643\u0651\u0631\u0647\u0627 \u0648\u0627\u0641\u062A\u062D\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F",
  tooManyLines: "\u0627\u0644\u0648\u0635\u0641\u0629 \u0623\u0643\u062B\u0631 \u0645\u0646 \u0664\u0660 \u0645\u0627\u062F\u0629 \u2014 \u0634\u064A\u0644 \u0627\u0644\u0644\u064A \u0645\u0627 \u062A\u0646\u0635\u0631\u0641 \u0628\u0643\u0644 \u0645\u0631\u0651\u0629",
  badLine: (i: number) => `\u0627\u0644\u0633\u0637\u0631 ${i} \u0628\u0627\u0644\u0648\u0635\u0641\u0629 \u063A\u0644\u0637 \u2014 \u0627\u0644\u0643\u0645\u064A\u0629 \u0644\u0627\u0632\u0645 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631 \u0648\u0628\u062B\u0644\u0627\u062B \u0645\u0631\u0627\u062A\u0628 \u0639\u0634\u0631\u064A\u0629 \u0623\u0642\u0635\u0649`,
  duplicate: (i: number) => `\u0627\u0644\u0645\u0627\u062F\u0629 \u0628\u0627\u0644\u0633\u0637\u0631 ${i} \u0645\u0643\u0631\u0651\u0631\u0629 \u0628\u0627\u0644\u0648\u0635\u0641\u0629 \u2014 \u0627\u062C\u0645\u0639\u0647\u0627 \u0628\u0633\u0637\u0631 \u0648\u0627\u062D\u062F`,
  productMissing: (i: number) => `\u0627\u0644\u0645\u0627\u062F\u0629 \u0628\u0627\u0644\u0633\u0637\u0631 ${i} \u0645\u0648 \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0645\u062E\u0632\u0646 \u0627\u0644\u0639\u064A\u0627\u062F\u0629 (\u064A\u0645\u0643\u0646 \u0627\u0646\u062D\u0630\u0641\u062A) \u2014 \u0631\u062C\u0651\u0639\u0647\u0627 \u0645\u0646 \u0627\u0644\u0645\u062D\u0630\u0648\u0641\u0627\u062A \u0623\u0648 \u0634\u064A\u0644\u0647\u0627`,
  pooled: (n: string) => `\u00AB${n}\u00BB \u0631\u0635\u064A\u062F\u0647\u0627 \u0628\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0642\u0633\u0645 \u2014 \u0645\u0627 \u062A\u0646\u062E\u0635\u0645 \u0643\u0645\u0633\u062A\u0647\u0644\u0643`,
  farm: (n: string) => `\u00AB${n}\u00BB \u0645\u0646 \u0645\u062E\u0632\u0646 \u0627\u0644\u062D\u0642\u0644 \u2014 \u0645\u0627 \u062A\u0646\u062E\u0635\u0645 \u0643\u0645\u0633\u062A\u0647\u0644\u0643 \u0644\u0644\u0639\u064A\u0627\u062F\u0629`,
  noSubUnit: (n: string) => `\u00AB${n}\u00BB \u062A\u0646\u062D\u0633\u0628 \u0628\u0627\u0644\u0639\u0644\u0628\u0629 \u0628\u0633 \u2014 \u0627\u0641\u062A\u062D \u0627\u0644\u0645\u0627\u062F\u0629 \u0648\u0641\u0639\u0651\u0644 \u00AB\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0635\u063A\u064A\u0631\u0629\u00BB \u0648\u0627\u0643\u062A\u0628 \u0643\u0645 \u0628\u0627\u0644\u0639\u0628\u0648\u0629`,
  tooSmall: (n: string) => `\u0643\u0645\u064A\u0629 \u00AB${n}\u00BB \u0635\u063A\u064A\u0631\u0629 \u0644\u062F\u0631\u062C\u0629 \u0645\u0627 \u062A\u0646\u062E\u0635\u0645 \u0645\u0646 \u0627\u0644\u0631\u0635\u064A\u062F \u2014 \u0643\u0628\u0651\u0631\u0647\u0627 \u0623\u0648 \u063A\u064A\u0651\u0631 \u0627\u0644\u0648\u062D\u062F\u0629`,
  tooManyIds: "\u0623\u0643\u062B\u0631 \u0645\u0646 \u0665\u0660 \u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0637\u0644\u0628\u064D \u0648\u0627\u062D\u062F \u2014 \u0642\u0633\u0651\u0645 \u0627\u0644\u0637\u0644\u0628",
  rangeBad: "\u0627\u0644\u0645\u062F\u0651\u0629 \u0644\u0627\u0632\u0645 \u0628\u064A\u0646 \u064A\u0648\u0645 \u0648\u0664\u0660\u0660 \u064A\u0648\u0645 \u2014 \u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u062F\u0651\u0629 \u0645\u0646 \u062C\u062F\u064A\u062F",
  editTwice: "\u0633\u0637\u0631 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0643\u0631\u0651\u0631 \u0628\u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u2014 \u0633\u0643\u0651\u0631 \u0627\u0644\u0646\u0627\u0641\u0630\u0629 \u0648\u0627\u0641\u062A\u062D\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F",
  photographer: "\u0647\u0630\u064A \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u0648 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0648\u0638\u0641 \u0627\u0644\u062A\u0635\u0648\u064A\u0631.",
  box: "\u0639\u0644\u0628\u0629",
  kg: "\u0643\u063A\u0645",
  sep: "\u060C ",
  ellipsis: "\u2026",
  avgFrozen: '\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0643\u0644\u0641\u0629 \u064A\u062A\u062D\u062F\u0651\u062B \u0645\u0646 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 \u0628\u0633 \u2014 \u0644\u0644\u062A\u0635\u062D\u064A\u062D: "\u0635\u062D\u0651\u062D \u0627\u0644\u0645\u062A\u0648\u0633\u0637" \u0645\u0646 \u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u0627\u062F\u0629',
  costResetForbidden: "\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0645\u062A\u0648\u0633\u0637 \u0644\u0644\u0645\u062F\u064A\u0631 \u0648\u062D\u062F\u0647 \u2014 \u0627\u0641\u062A\u062D \u0648\u0636\u0639 \u0627\u0644\u0645\u062F\u064A\u0631",
  costResetBad: "\u0627\u0643\u062A\u0628 \u0631\u0642\u0645 \u0660 \u0623\u0648 \u0623\u0643\u062B\u0631\u060C \u0644\u062D\u062F \u0666 \u0645\u0631\u0627\u062A\u0628 \u0628\u0639\u062F \u0627\u0644\u0641\u0627\u0635\u0644\u0629",
  costResetMissing: "\u0627\u0644\u0645\u0627\u062F\u0629 \u0645\u0648 \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0645\u062E\u0632\u0646 \u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629",
  costResetFarm: "\u0645\u0627\u062F\u0629 \u0627\u0644\u062D\u0642\u0644 \u0643\u0644\u0641\u062A\u0647\u0627 \u0633\u0639\u0631 \u0634\u0631\u0627\u0626\u0647\u0627 \u2014 \u0645\u0627 \u0625\u0644\u0647\u0627 \u0645\u062A\u0648\u0633\u0637 \u064A\u0646\u0635\u062D\u0651\u062D",
  poolDirect: "\u0627\u0644\u0635\u0641\u062D\u0629 \u0639\u0646\u062F\u0643 \u0646\u0633\u062E\u0629 \u0642\u062F\u064A\u0645\u0629 \u2014 \u062D\u062F\u0651\u062B\u0647\u0627\u060C \u0648\u0628\u0639\u062F\u064A\u0646 \u0634\u063A\u0651\u0644 \u00AB\u0628\u062F\u0648\u0646 \u0643\u0645\u064A\u0629\u00BB \u0644\u0644\u0645\u0627\u062F\u0629 \u0645\u0646 \u062C\u062F\u064A\u062F",
};

/* ── أدوات ───────────────────────────────────────────────────────────────────────────── */
type Source = "recipe" | "override" | "relink";
type SkipNote = DemoConsumptionSkip["note"];
const MAX_IDS = 50;
const C_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bi = (s: string | null | undefined): bigint => (s == null || s === "" ? 0n : BigInt(s));
const txt = (v: bigint): string => v.toString();
const pos0 = (v: bigint): bigint => (v > 0n ? v : 0n);
/** قيمةُ عمودٍ numeric(·,3) بالألف (رصيد، كمية) — الرقمُ التجريبيّ يُقرَّب كما كان العمودُ سيقرّبه. */
const milliOf = (x: number | string | null | undefined): bigint => roundScaled(x ?? 0, 3);
/** btrim(text) بلا وسيط: المسافاتُ وحدها (لا الجدولة ولا السطر). */
const btrim = (s: string): string => s.replace(/^ +| +$/g, "");
/** ترتيبُ البايتات (collate "C") — الحتميّةُ هي المطلوب لا ترتيبُ لغة. */
const cmp = (a: string | null | undefined, b: string | null | undefined): number => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;   // NULLS LAST
  return a < b ? -1 : a > b ? 1 : 0;
};
/** نصُّ numeric(·,s) بمنازله كلّها («10.000») — للبصمة. */
function decText(v: bigint, s: number): string {
  const a = (v < 0n ? -v : v).toString().padStart(s + 1, "0");
  const t = s ? `${a.slice(0, a.length - s)}.${a.slice(a.length - s)}` : a;
  return v < 0n ? `-${t}` : t;
}
/** trim_scale(): بلا أصفارٍ زائدة («10»، «0.5») — نصُّ التدقيق. */
const trimScale = (v: bigint, s: number): string => {
  const t = decText(v, s);
  return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
};

/** **مصدرُ الكلفة الواحد**: كلُّ تقييمٍ هنا يمرّ من هذه الصورة — stock_unit_cost (0255:222–224) يقرأ المتوسّطَ وإلا سعرَ
 *  الشراء، فالوصفةُ ومعاينتُها وملخّصُها والبيعةُ والسندُ تتبع المتوسّط بلا سطرٍ آخر. */
function consView(p: Product): ConsProduct {
  return {
    purchase_price: p.purchase_price, avg_cost: p.avg_cost ?? null,
    has_sub_unit: p.has_sub_unit ?? null, units_per_box: p.units_per_box ?? null, pooled: p.pooled ?? null, farm_id: p.farm_id ?? null,
  };
}

/** المادّةُ حيّةً بمعرّفها (والمعرّفُ بحروفٍ صغيرة احتياطاً — uuid لا يفرّق الحالة). كلُّ صفوف products: حقلٌ وعيادة. */
function findLive(db: DemoDB, id: string): Product | undefined {
  const ps = db.products ?? [];
  return ps.find((p) => p.id === id) ?? ps.find((p) => p.id.toLowerCase() === id.toLowerCase());
}
function findTrash(db: DemoDB, id: string): DeletedProduct | undefined {
  const ts = db.productsTrash ?? [];
  return ts.find((t) => t.id === id) ?? ts.find((t) => t.id.toLowerCase() === id.toLowerCase());
}
const services = (): Service[] => demoServices.list();
const serviceById = (id: string): Service | undefined => {
  const k = String(id ?? "").toLowerCase();
  return services().find((s) => s.id.toLowerCase() === k);
};
/** مرآةُ auth_role() = 'manager': المديرُ بدوره أو بمفتاح وضع المدير الحيّ. */
const managerNow = (): boolean => demoBaseRole() === "manager" || demoPinLive();
/** مرآةُ auth_role() in ('manager','veterinarian'). */
const vetOrManagerNow = (): boolean => managerNow() || demoBaseRole() === "veterinarian";
/** مرآةُ api_gate (0222/0233): المصوّرُ (بالدور الأساس) يُردّ قبل أن تجري أيُّ دالّةٍ من دوالّ المستهلكات. */
function gate(): void {
  if (demoBaseRole() === "photographer") throw Object.assign(new Error("photographer_forbidden"), { code: "42501", hint: H.photographer });
}
/** مرآةُ staff_can(cap) (0222): المدير، وإلا إذنُ صفّ الموظّف الصريح، وإلا قالبُ دوره. مصدَّرةٌ لمرآة الأرباح والخسائر
 *  (demoPnl، 0256: viewProfits) — نسخةٌ ثانيةٌ منها تنحرف. */
export async function staffCan(cap: Capability): Promise<boolean> {
  if (managerNow()) return true;
  const me = demoUserId();
  if (!me) return false;
  const row = (await listStaff()).find((s) => s.userId === me);
  const v = row?.permissions?.[cap];
  if (typeof v === "boolean") return v;
  const base = demoBaseRole();
  return (STAFF_ROLES as string[]).includes(base) ? effectiveCan(base as (typeof STAFF_ROLES)[number], cap) : false;
}
/** خطأُ edit_line_twice بتلميحه — للتعديل بـrepoDemo (العربيةُ تبقى هنا). */
export function editLineTwiceError(): Error { return demoHint("edit_line_twice", H.editTwice); }

/* ── ساعةُ الدفعات (at_us) ───────────────────────────────────────────────────────────── */
/** لحظةُ فعلٍ واحد (بيعة، مرتجع، ترجيع، حذف، تعديل…): كلُّ أحداثه تحمل `us` نفسَه — دفعتُه، كـ`created_at = now()`
 *  لمعاملته بالخادم (0252 at_us = extract(epoch from created_at) × 10⁶) — وفعلان لا يتشاركانه أبداً: الساعةُ تُعطي فوق
 *  كلّ ما خُزّن، فملّي ثانيةٍ تتكرّر بجهازٍ سريع لا تجعل بيعتين دفعةً واحدة. و`iso` = created_at بالملّي من `us` نفسِه. */
export interface OpStamp { iso: string; us: number }
/** at_us لحدثٍ مخزَّن — وما كُتب قبل الجولة الثانية بلا ختمٍ: created_at × 1000. */
const evUs = (e: { at_us?: number; created_at: string }): number => e.at_us ?? Date.parse(e.created_at) * 1000;
function lastUs(db: DemoDB): number {
  let m = db.clockUs ?? 0;
  for (const e of db.consumption ?? []) { const u = evUs(e); if (u > m) m = u; }
  return m;
}
/** دفعةٌ جديدة لفعلٍ واحد: max(الآن، آخرُ ما أُعطي + ١) بالميكروثانية — تُحفظ (clockUs) بـsaveDB الفعل نفسِه. */
export function opStamp(db: DemoDB, at?: string): OpStamp {
  const base = at != null && Number.isFinite(Date.parse(at)) ? Date.parse(at) * 1000 : Date.now() * 1000;
  const us = Math.max(base, lastUs(db) + 1);
  db.clockUs = us;
  return { iso: new Date(Math.floor(us / 1000)).toISOString(), us };
}
/** المُصدَّراتُ تقبل النصَّ (الفحوصُ والأدوات) أو الختم: النصُّ فعلٌ واحدٌ جديد بدفعته، والختمُ يُمرَّر لكلّ خطوات الفعل. */
const stampOf = (db: DemoDB, now: string | OpStamp): OpStamp => (typeof now === "string" ? opStamp(db, now) : now);
/** now() القراءة بالساعة نفسِها: لا دفعةَ مخزَّنة بعدها (now_us ≥ كلّ at_us). */
const readUs = (db: DemoDB): number => Math.max(Date.now() * 1000, lastUs(db));

/* ── الترحيل (_stock_post) ───────────────────────────────────────────────────────────── */
export interface PostResult { product: string; posted: bigint; place: "live" | "trash" | "gone"; before: bigint | null }
/** الكاتبُ الوحيد لرصيد الاستهلاك: الصفُّ الحيّ (أو صفُّه بالمحذوفات، ويتبع merged_into ≤ ٢٠ قفزة) ثمّ
 *  المرحَّل. ومادّةٌ غائبةٌ كلّياً ('gone') لا رصيدَ لها ولا مرحَّل. */
export function stockPostLocal(db: DemoDB, productId: string, xNano: bigint, mode: PostMode, now: string | OpStamp): PostResult {
  if (mode !== "ledger" && mode !== "external" && mode !== "fold") throw demoHint("stock_post_mode", H.postMode);
  let pid = productId;
  let hops = 0;
  let live: Product | undefined;
  let trash: DeletedProduct | undefined;
  let place: PostResult["place"];
  for (;;) {
    live = (db.products ?? []).find((p) => p.id === pid);
    if (live) { place = "live"; break; }
    trash = (db.productsTrash ?? []).find((t) => t.id === pid);
    if (!trash) { place = "gone"; break; }
    if (!trash.merged_into) { place = "trash"; break; }
    pid = trash.merged_into;                                  // دُمجت بعد قراءة المواصفة: إلى الأصل
    if (++hops > 20) throw demoHint("stock_merge_loop", H.mergeLoop);
  }
  if (place === "gone") return { product: pid, posted: 0n, place, before: null };
  const before = place === "live" ? milliOf(live!.stock) : milliOf(trash!.stock);
  const carries = db.stockCarry ?? (db.stockCarry = {});
  const cur = carries[pid];
  const state: CarryState = cur ? { carry_n: bi(cur.carry_n), ext_in_n: bi(cur.ext_in_n), ext_out_m: bi(cur.ext_out_m) } : { ...EMPTY_CARRY };
  const r = stockPost(state, xNano, mode);
  if (r.posted !== 0n) {
    if (place === "live") live!.stock = fromScaled(milliOf(live!.stock) - r.posted, 3);
    else {
      trash!.stock = fromScaled(milliOf(trash!.stock) - r.posted, 3);
      trash!.row = { ...trash!.row, stock: fromScaled(milliOf(trash!.row?.stock) - r.posted, 3) };
    }
  }
  carries[pid] = { carry_n: txt(r.state.carry_n), ext_in_n: txt(r.state.ext_in_n), ext_out_m: txt(r.state.ext_out_m),
    updated_at: typeof now === "string" ? now : now.iso };
  return { product: pid, posted: r.posted, place, before };
}

/* ── المواصفة وحركتُها (_consumption_move) ───────────────────────────────────────────── */
interface Spec { spec: string; p: string; n: string; u: RecipeUnit; l: string | null; q: bigint; d: bigint; k: bigint; w: bigint; svc: string | null }
const specOfEvent = (e: DemoConsumptionEvent): Spec => ({
  spec: e.spec_id, p: e.product_id, n: e.product_name, u: e.unit, l: e.unit_label,
  q: bi(e.per_qty_m), d: bi(e.per_div_m), k: bi(e.unit_cost_u), w: bi(e.per_value_c), svc: e.service_id,
});
const maxB = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const minB = (a: bigint, b: bigint): bigint => (a < b ? a : b);
/** مواصفةٌ واحدة إلى هدف (كمية السطر): الحيُّ = Σ أحداثها، والحركةُ الفرق — فالتكرارُ لا شيء. والعجزُ لصرفٍ حيٍّ وحده:
 *  max(0, المكتوب − max(الرصيد قبله، 0)). و`mv` (نسخةُ الربط، من relinkLocal وحده — المزامنةُ بعدها بالقاعدة العادية ولو كان
 *  مصدرُ المواصفة 'relink') نقلُ وحداتٍ لا بيعة: عجزُها ما زاده التعديلُ وحده بدفعته لهذه الفاتورة والمادّة (0252 _consumption_move):
 *  Bu/Bs ما صرفته الدفعةُ قبله وعجزُه، Br ما ردّته؛ الزيادةُ على المردود لا أكثر، ولا أكثرَ من عجز صرف الدفعة الجاري على رفّها،
 *  ناقصاً ما كتبه ربطٌ قبله بها. كانت «كأنها بيعٌ الآن» على رفٍّ تغيّر بعد البيعة: تعديلٌ بلا تغيير ورصيدٌ أنزلته فاتورةٌ أخرى
 *  ⇒ عجزٌ لم يقع. */
function moveLocal(db: DemoDB, invoiceId: string, itemId: string, s: Spec, targetM: bigint, source: Source, from: string | null, st: OpStamp, mv = false): void {
  const evs = db.consumption ?? (db.consumption = []);
  let lq = 0n, lv = 0n;
  for (const e of evs) if (e.item_id === itemId && e.spec_id === s.spec) { lq += bi(e.qty_n); lv += bi(e.value_c); }
  const tq = pos0(targetM);
  const d = consumptionMove({ per_qty_m: s.q, per_div_m: s.d, per_value_c: s.w }, { qty_n: lq, value_c: lv }, tq);
  if (!d) return;
  const r = stockPostLocal(db, s.p, d.qty_n, "ledger", st);
  let sf = 0n;
  if (r.place === "live" && d.qty_n > 0n) {
    const before = r.before ?? 0n;
    sf = shortfallMilli(r.posted, before);
    if (mv) {
      // الدفعةُ = أحداثُ هذا الفعل (at_us نفسُه) لهذه الفاتورة ولهذه المادّة قبل هذا الحدث — created_at = now() بالخادم
      let bu = 0n, bs = 0n, br = 0n;
      for (const e of evs) {
        if (e.at_us !== st.us || e.invoice_id !== invoiceId || e.product_id !== r.product) continue;
        if (e.kind === "use") { bu += bi(e.posted_m); bs += bi(e.shortfall_m); } else br -= bi(e.posted_m);
      }
      sf = maxB(minB(maxB(bu + r.posted - maxB(before + bu, 0n), 0n), maxB(bu + r.posted - br, 0n)) - bs, 0n);
    }
  }
  evs.push({
    id: uid("ic"), invoice_id: invoiceId, item_id: itemId, spec_id: s.spec, from_item: from, service_id: s.svc,
    product_id: r.product, product_name: s.n ?? "", unit: s.u, unit_label: s.l,
    per_qty_m: txt(s.q), per_div_m: txt(s.d), unit_cost_u: txt(s.k), per_value_c: txt(s.w),
    line_qty_m: txt(tq), qty_n: txt(d.qty_n), posted_m: txt(r.posted), value_c: txt(d.value_c),
    shortfall_m: txt(sf),
    kind: d.kind, note: r.place === "trash" ? "in_trash" : r.place === "gone" ? "product_gone" : null,
    source, created_at: st.iso, at_us: st.us, created_by: demoUserId(),
  });
}
/** أوّلُ حدثٍ لكلّ مواصفة (يحمل قيمَها المجمَّدة) بين ما يطابق، بترتيب (المادّة، المواصفة). */
function firstEvents(db: DemoDB, pred: (e: DemoConsumptionEvent) => boolean): DemoConsumptionEvent[] {
  const seen = new Map<string, DemoConsumptionEvent>();
  for (const e of db.consumption ?? []) if (pred(e) && !seen.has(e.spec_id)) seen.set(e.spec_id, e);
  return [...seen.values()].sort((a, b) => cmp(a.product_id, b.product_id) || cmp(a.spec_id, b.spec_id));
}
/** _consumption_sync_item — كلُّ محفّزٍ يلتقي هنا: سطرٌ إلى هدف بكلّ مواصفاته (المتخطّى بجدوله فلا يتحرّك). */
export function syncItemLocal(db: DemoDB, itemId: string, targetQty: number, now: string | OpStamp): void {
  const t = milliOf(targetQty);
  const st = stampOf(db, now);
  for (const e of firstEvents(db, (x) => x.item_id === itemId)) moveLocal(db, e.invoice_id, itemId, specOfEvent(e), t, e.source, e.from_item, st);
}
/** invoices_consumption_status: الفاتورةُ تدخل «مرجَّعة» أو تخرج منها — كلُّ سطرٍ بدفترٍ إلى صفر أو كميته، بالمعرّف. */
export function statusSyncLocal(db: DemoDB, invoiceId: string, refunded: boolean, now: string | OpStamp): void {
  const evs = db.consumption ?? [];
  if (!evs.some((e) => e.invoice_id === invoiceId)) return;
  const st = stampOf(db, now);
  const lines = (db.invoiceItems ?? []).filter((ii) => ii.invoice_id === invoiceId && evs.some((e) => e.item_id === ii.id)).sort((a, b) => cmp(a.id, b.id));
  for (const ii of lines) syncItemLocal(db, ii.id, refunded ? 0 : Math.max(Number(ii.qty) || 0, 0), st);
}
/** _consumption_relink: كلُّ مواصفةٍ للسطر القديم تُنسخ مواصفةً جديدة بقيمها المجمَّدة إلى الكمية الجديدة
 *  (source 'relink'، from_item = القديم)، وتخطّياتُه تُكتب على الجديد تاريخاً. القديمُ ردّه «الحذف» قبلها.
 *  والنسخةُ نقلٌ (mv): عجزُها ما زاده التعديلُ وحده بدفعته (moveLocal) — لا عجزُ بيعةٍ جديدة على رفٍّ تغيّر بعدها. */
export function relinkLocal(db: DemoDB, invoiceId: string, fromItem: string, toItem: string, qty: number, now: string | OpStamp): void {
  const q = milliOf(qty);
  const st = stampOf(db, now);
  for (const e of firstEvents(db, (x) => x.invoice_id === invoiceId && x.item_id === fromItem)) {
    moveLocal(db, invoiceId, toItem, { ...specOfEvent(e), spec: uid("sp") }, q, "relink", fromItem, st, true);
  }
  const skips = db.consumptionSkips ?? (db.consumptionSkips = []);
  // نسخةُ الربط تاريخٌ: تحمل كاتبَ أصلها (0252: k.created_by) لا مَن عدّل — «منو صفّر موادَّ الحالة؟» يبقى جوابُه.
  for (const k of skips.filter((x) => x.invoice_id === invoiceId && x.item_id === fromItem)) {
    skips.push({ ...k, id: uid("ik"), item_id: toItem, line_qty_m: txt(pos0(q)), source: "relink", created_at: st.iso, created_by: k.created_by ?? null });
  }
}
/** products_trash_consumption (0252 ← 0254 ← 0255): دمجُ التوأم بالأصل. أوّلاً (0255:967–980) متوسّطُ الأصل يزن كلفتَي المادّتين
 *  الحيّتين قبل أن يتحرّك رصيدُ الأصل — _avg_merge بأساسَيهما (_avg_base)، والحقلُ خارجه — ويُكتب حين يغيّر أساسَ كلفة الأصل
 *  وحده (أصلٌ يتبع سعرَ شرائه ولم يتغيّر يبقى يتبعه). ثمّ الوصفةُ (باسم الأصل) والدفترُ والمتخطّى تنتقل، ومرحَّلُ التوأم يُطوى
 *  بالأصل ('fold') وتُجمع ext_in/ext_out ثمّ يُحذف. (سنداتُ التلف بمرآة الجرد: wasteFollowMerge يناديها الطالب.) */
export function followMergeLocal(db: DemoDB, twinId: string, keeperId: string, now: string | OpStamp): void {
  if (twinId === keeperId) return;
  const st = stampOf(db, now);
  const kp = (db.products ?? []).find((p) => p.id === keeperId);
  const tw = (db.products ?? []).find((p) => p.id === twinId);
  if (kp && tw && !kp.farm_id && !tw.farm_id) {
    const a1 = avgBase(kp);
    const v = avgMerge(milliOf(kp.stock), a1, milliOf(tw.stock), avgBase(tw));
    if (v !== a1) kp.avg_cost = v === null ? null : fromScaled(v, 6);
  }
  const keepName = kp?.name;
  for (const r of db.serviceRecipes ?? []) if (r.product_id === twinId) { r.product_id = keeperId; r.product_name = keepName ?? r.product_name; r.updated_at = st.iso; }
  for (const e of db.consumption ?? []) if (e.product_id === twinId) e.product_id = keeperId;
  for (const k of db.consumptionSkips ?? []) if (k.product_id === twinId) k.product_id = keeperId;
  const tc = db.stockCarry?.[twinId];
  if (!tc) return;
  stockPostLocal(db, keeperId, bi(tc.carry_n), "fold", st);
  const kc = db.stockCarry?.[keeperId];
  if (kc) {
    kc.ext_in_n = txt(bi(kc.ext_in_n) + bi(tc.ext_in_n));
    kc.ext_out_m = txt(bi(kc.ext_out_m) + bi(tc.ext_out_m));
    kc.updated_at = st.iso;
  }
  delete db.stockCarry![twinId];
}

/* ── الخطّة (_consumption_plan) ──────────────────────────────────────────────────────── */
interface PlanSkip { p: string; n: string; q: bigint; u: RecipeUnit; note: SkipNote }
export interface PlanLine {
  svc: string; planned: boolean; name: string;
  src?: "recipe" | "override"; flat?: bigint; c?: bigint; uc?: bigint; specs?: Spec[]; skips?: PlanSkip[];
  /** تعديلٌ بـ[] على خدمةٍ لها وصفة — override_none. */
  none?: boolean;
}
export interface Plan { lines: Map<number, PlanLine>; lineSkips: { n: number; note: "old_device" | "service_missing"; svc: string | null; name: string }[] }
const recipeRowsOf = (db: DemoDB, serviceId: string): DemoRecipeRow[] =>
  (db.serviceRecipes ?? []).filter((r) => r.service_id === serviceId).sort((a, b) => a.position - b.position || cmp(a.id, b.id));
/** clinic_service_recipe_items.service_id → clinic_services(id) on delete cascade (0252): خدمةٌ حُذفت تأخذ وصفتَها معها. حذفُ
 *  الخدمة بـservices.ts (removeService/removeServiceCategory) لا يعرف المخزنَ التجريبيّ، فيُكنس اليتيمُ حيث تُقرأ الوصفةُ أو
 *  تُكتب (القراءة، الحفظ، الملخّص، خطّةُ البيعة). وصفوفُ مفتاح العيادة الفعّال وحدها: الكتالوجُ لكلّ مفتاح والمخزنُ واحد، فصفٌّ
 *  حُفظ تحت مفتاحٍ آخر خدمتُه بكتالوجٍ آخر لا يُمسّ. يرجع: هل كُنس شيء. */
function pruneOrphanRecipes(db: DemoDB): boolean {
  const rows = db.serviceRecipes;
  if (!rows?.length) return false;
  const key = getActiveClinicId();
  const ids = new Set(services().map((s) => s.id));
  const keep = rows.filter((r) => (r.clinic ?? key) !== key || ids.has(r.service_id));
  if (keep.length === rows.length) return false;
  db.serviceRecipes = keep;
  return true;
}
/** الكنسُ بقراءة: الجوابُ لا يرى اليتيمَ أصلاً، فحفظُه تنظيفٌ لا قرار — مخزنٌ ممتلئٌ لا يُفشل القراءة. */
function pruneOnRead(db: DemoDB): void {
  if (!pruneOrphanRecipes(db)) return;
  try { saveDB(db); } catch { /* swallow-ok: الكنسُ يُعاد بأوّل حفظٍ تالٍ، والقراءةُ صحيحةٌ بدونه */ }
}

/** تُنادى مرّةً من البيعة بعد فحص الإعادة والتأريخ وقبل أيّ كتابة — فكلُّ رفضٍ هنا بلا أثر. واليتيمُ يُكنس بحفظ البيعة نفسِها. */
export function planLocal(db: DemoDB, items: readonly CheckoutItem[]): Plan {
  pruneOrphanRecipes(db);
  const svcs = services();
  const recipes = db.serviceRecipes ?? [];
  const lines = new Map<number, PlanLine>();
  const lineSkips: Plan["lineSkips"] = [];
  type Ent = { p: string; q: bigint; u: RecipeUnit; snap: string | null };
  const cands: { n: number; svc: string; name: string; src: "recipe" | "override"; flat: bigint; ent: Ent[] }[] = [];
  items.forEach((it, i) => {
    const n = i + 1;
    // ١) سطرُ مادّة (nullif(product_id, '')): يُقفل مع غيره ولا يُخطَّط
    if (it.product_id != null && String(it.product_id) !== "") return;
    const qtyM = roundScaled(it.qty, 3);                       // كما تحفظه البيعة
    if (qtyM <= 0n) return;                                    // السالبُ والصفرُ لا يستهلكان
    const name = it.name == null ? "Item" : String(it.name);
    const raw = it.service_id == null ? null : btrim(String(it.service_id));
    if (raw == null || raw === "") {
      /* جهازٌ قديم: المفتاحُ غائبٌ وحده (`not (it ? 'service_id')`) والاسمُ اسمُ خدمةٍ لها وصفة ⇒ تخطّي السطر (الخادمُ لا يخصم
       * بالاسم أبداً). أمّا null الصريح أو نصٌّ فارغ فسطرٌ معروفٌ ليس خدمة (دواء، لقاح، أجرة توصيل): لا تخطّيَ ولا وصفة. والغائبُ
       * هو ما لا يعبر JSON: مفتاحٌ مفقود أو undefined (JSON.stringify يُسقطه) — والسطرُ يصل الخادمَ نصَّ JSON. */
      if (it.service_id === undefined && svcs.some((s) => btrim(s.name) === btrim(name) && recipes.some((r) => r.service_id === s.id))) {
        lineSkips.push({ n, note: "old_device", svc: null, name });
      }
      return;
    }
    if (!C_UUID.test(raw)) throw demoHint("service_id_bad", H.serviceIdBad);
    const sid = raw.toLowerCase();
    const svc = svcs.find((s) => s.id.toLowerCase() === sid);
    if (!svc) { lineSkips.push({ n, note: "service_missing", svc: sid, name }); return; }
    // ٢) التعديل: غائبٌ أو null = الوصفة؛ [] = لا شيء — يُفحص، ويسقط إن ساوى الوصفة
    const ov = it.consumables as unknown;
    let override = false;
    let ent: Ent[] = [];
    if (ov != null) {
      if (!Array.isArray(ov) || ov.length > 40) throw demoHint("consumables_bad", H.consumablesBad(name));
      const norm = ov.map((e) => (e && typeof e === "object" && !Array.isArray(e) && typeof (e as { product_id?: unknown }).product_id === "string"
        ? { ...(e as object), product_id: btrim((e as { product_id: string }).product_id) } : e));
      if (overrideRefusal(norm)) throw demoHint("consumables_bad", H.consumablesBad(name));
      ent = norm.map((e) => { const l = parseRecipeLine(e)!; return { p: l.product_id, q: l.qty_m, u: l.unit, snap: null }; });
      const rec = recipeRowsOf(db, svc.id).map((r) => ({ product_id: r.product_id, qty: decText(bi(r.qty_m), 3), unit: r.unit }));
      override = !sameConsumables(norm, rec);
    }
    let src: "recipe" | "override";
    if (!override) {
      const rows = recipeRowsOf(db, svc.id);
      if (!rows.length) { lines.set(n, { svc: svc.id, planned: false, name }); return; }   // غيرُ مخطَّط (هوّة M12)
      ent = rows.map((r) => ({ p: r.product_id, q: bi(r.qty_m), u: r.unit, snap: r.product_name }));
      src = "recipe";
    } else {
      if (!vetOrManagerNow()) throw demoHint("consumables_case_role", H.caseRole);
      src = "override";
    }
    cands.push({ n, svc: svc.id, name, src, flat: roundScaled(svc.cost ?? 0, 2), ent });
  });
  // ٣) القفلُ مرّةً بالمعرّف — لا شيءَ يُقفل بالتجريبيّ. ٤) كلُّ مدخلٍ على صفّه
  for (const c of cands) {
    const specs: Spec[] = [], skips: PlanSkip[] = [];
    let sum = 0n;
    for (const e of c.ent) {
      // التخطّي يحمل معرّفَ الصفّ نفسِه — الخادمُ يكتب (v_e->>'product_id')::uuid، أي النصَّ القانونيّ بحروفٍ صغيرة؛
      // والتعديلُ قد يصل بحروفٍ كبيرة أو بمسافات (قيسَ بالفرق مع الخادم: «A252…» بالتجريبيّ و«a252…» بالخادم).
      const p = findLive(db, e.p);
      if (p) {
        const v = consView(p);
        const sk = entrySkip(v, e.u);                          // حقل ← حوض ← صغيرةٌ بلا وحدة
        if (sk) { skips.push({ p: p.id, n: p.name, q: e.q, u: e.u, note: sk }); continue; }
        const sv = specValues(v, e.q, e.u)!;
        specs.push({ spec: uid("sp"), p: p.id, n: p.name, u: e.u, l: e.u === "sub" ? (p.sub_unit_name ?? null) : null,
          q: sv.per_qty_m, d: sv.per_div_m, k: sv.unit_cost_u, w: sv.per_value_c, svc: c.svc });
        sum += sv.per_value_c;
        continue;
      }
      const t = findTrash(db, e.p);
      if (t) skips.push({ p: t.id, n: t.row?.name ?? e.snap ?? "", q: e.q, u: e.u, note: "in_trash" });
      else if (c.src === "recipe") skips.push({ p: e.p, n: e.snap ?? "", q: e.q, u: e.u, note: "product_gone" });
      else throw demoHint("consumables_bad", H.consumablesForeign(c.name));   // مسودّةٌ من عيادةٍ أخرى أو معرّفٌ مصنوع
    }
    lines.set(c.n, { svc: c.svc, planned: true, src: c.src, name: c.name, flat: c.flat, c: sum, uc: c.flat + sum, specs, skips,
      none: c.src === "override" && c.ent.length === 0 });
  }
  return { lines, lineSkips };
}

/* ── المال بمقياس الأعمدة (numeric(14,2) — النصفُ بعيداً عن الصفر عند كلّ إسناد) ────────────── */
/** `S := S + q × p` بالفلس: addLineCents لسعرٍ بمنزلتين؛ وسعرٌ بمنازلَ أكثر (يرسله جهازٌ كما هو) بالقسمة الواحدة
 *  نفسِها على مقياسٍ أدقّ — S·10¹³ + q_m·p₁₂ على 10¹³ — فيبقى بالضبط كما يجمعه الخادم. */
function addMoneyCents(sumC: bigint, qM: bigint, price: number | string | null | undefined): bigint {
  let pc: bigint | null;
  try { pc = toCents(price ?? 0); } catch { pc = null; }
  if (pc !== null) return addLineCents(sumC, qM, pc);
  const s = 10n ** 13n;
  return roundDiv(sumC * s + qM * roundScaled(price ?? 0, 12), s);
}
/** round(x, 3) بالضبط — كميةُ السطر كما يحفظها عمودُ numeric(14,3) (لا Math.round العائم). */
export const qty3 = (x: number): number => fromScaled(roundScaled(x, 3), 3);
/** القيمةُ كما يحفظها عمودُ numeric(14,2) (unit_price، unit_cost): النصفُ بعيداً عن الصفر بالضبط. الجهازُ يرسل الكلفةَ
 *  كما هي (كلفةُ خدمةٍ بثلاث منازل ١٢٫٣٤٥)، والعمودُ يحفظ ١٢٫٣٥ — والمرتجعُ والتعديلُ يعيدان الحسابَ من المحفوظ
 *  (قيسَ بالفرق مع الخادم: round(3 × ١٢٫٣٥) = ٣٧٫٠٥ لا ٣٧٫٠٤). غيرُ العدد يمرّ كما هو (يرفضه الخادمُ بقيده). */
export const col2 = (x: number): number => (Number.isFinite(Number(x)) ? fromScaled(roundScaled(Number(x), 2), 2) : x);
/** numeric(·,3) ← عمودُ integer (item_count): النصفُ بعيداً عن الصفر بالضبط — ٢٫٥ ⇒ ٣ و−٢٫٥ ⇒ −٣ (لا Math.round). */
export const colInt = (x: number): number => (Number.isFinite(Number(x)) ? fromScaled(roundScaled(Number(x), 0), 0) : x);
/** round(q × p, 2) لسطرٍ واحد (line_total، والمجموعُ سطراً سطراً بالتعديل والمرتجع). */
export function lineMoney(qty: number, price: number | string | null | undefined): number {
  return fromScaled(addMoneyCents(0n, milliOf(qty), price), 2);
}
/** Σ قيمٍ بمنزلتين بالضبط (مجموعُ numeric لا مجموعُ عائم). */
export function sumMoney(values: readonly (number | null | undefined)[]): number {
  let s = 0n;
  for (const v of values) s += roundScaled(v ?? 0, 2);
  return fromScaled(s, 2);
}
/* ── المرتجعُ الجزئيّ (return_invoice_items، 0121 ← 0253): الحصّتان كما يحسبهما الخادم بالضبط ─────────────────── */
/** `coalesce((e->>'qty')::numeric, 0)` بعشرين منزلة: نصٌّ لا يُقرأ رقماً يرمي كالخادم (22P02) — لا «لا شيء» صامت. */
export function numericIn(x: unknown): bigint {
  try { return roundScaled((x ?? 0) as number | string, 20); }
  catch { throw Object.assign(new Error(`invalid input syntax for type numeric: "${String(x)}"`), { code: "22P02" }); }
}
/** `coalesce(v_ret, 0) + 0.0005 < it.qty` ⇒ ليس كاملاً: المرتجعُ كما أُرسل (بلا تقريب) يغطّي السطر — بالضبط لا بالعائم. */
export function returnCovers(ret: unknown, qty: number): boolean {
  return numericIn(ret) + 5n * 10n ** 16n >= milliOf(qty) * 10n ** 17n;
}
export interface ReturnShare { ret: number; stock: number; pool: number; deletes: boolean }
/** مدخلٌ واحد من المرتجع الجزئيّ: v_ret = least(round(ret, 3), it.qty)؛ ولسطر المادّة حصّةُ الرصيد round(v_ret × v_per, 3)
 *  بـ**v_per numeric(14,6)** = stock_qty / qty — لا القسمةُ الدقيقة ولا العائمة: ٦ حبّات من شريط ٧ (٠٫٨٥٧) ومرتجعُ ٣ =
 *  round(٣ × ٠٫١٤٢٨٣٣، ٣) = ٠٫٤٢٨ والعائمُ ٠٫٤٢٩ (قيسَ على الخادم) — وحصّةُ الحوض round(pooled_qty × v_ret / qty, 3) (١٫٠٠١ × ١ / ٢ =
 *  ٠٫٥٠١ والعائمُ ٠٫٥٠٠). وسطرُ الخدمة حصّتاه صفر (0253). `deletes` = v_ret + 0.0005 >= it.qty. وسطرُ مادّةٍ كميتُه صفر يرمي
 *  كالخادم (القسمةُ على it.qty). */
export function returnShareLocal(line: { qty: number; stock_qty?: number | null; pooled_qty?: number | null; product_id?: string | null }, ret: number | string): ReturnShare {
  const qM = milliOf(line.qty);
  const asked = roundScaled(ret, 3);
  const rM = asked < qM ? asked : qM;
  // 0253: `if v_ret = 0 then continue` قبل حصّتَي المادّة — ما رجّع صفراً لا يلمس سطرَه ولا مادّتَه ولا يُعدّ (الطالبُ يتخطّاه)،
  // ولا يصل القسمةَ على it.qty (سطرُ مادّةٍ كميتُه صفر لا يرمي هنا).
  if (rM === 0n) return { ret: 0, stock: 0, pool: 0, deletes: false };
  let sM = 0n, pM = 0n;
  if (line.product_id) {
    const perU = qM > 0n && line.stock_qty != null ? roundDiv(milliOf(line.stock_qty) * 1_000_000n, qM) : 1_000_000n;
    sM = roundDiv(rM * perU, 1_000_000n);
    if (qM === 0n) throw Object.assign(new Error("division by zero"), { code: "22012" });
    pM = roundDiv(milliOf(line.pooled_qty ?? 0) * rM, qM);
  }
  return { ret: fromScaled(rM, 3), stock: fromScaled(sM, 3), pool: fromScaled(pM, 3), deletes: rM >= qM };
}

/** حلقةُ البيعة الأولى: المجموع والكلفة بالفلس (الكلفةُ من الخطّة للسطر المخطَّط)، والعدد بالألف. */
export function cartMoneyLocal(items: readonly CheckoutItem[], plan: Plan | null, db?: DemoDB | null): { subtotal: number; cost: number; count: number; unitCost: (n: number) => number | null } {
  let subC = 0n, costC = 0n, countM = 0n;
  const v1b = new Map<number, bigint>();
  items.forEach((it, i) => {
    const qM = roundScaled(it.qty, 3);
    subC = addMoneyCents(subC, qM, it.unit_price);
    const pl = plan?.lines.get(i + 1);
    // 0255 (retail_checkout، الحلقتان 0255:1119–1125 و1166–1170): سطرُ المادّة بكلفة الخادم — وpos_checkout (بلا db) لا.
    const pc = pl?.planned || !db ? null : productLineCostC(db, it.product_id, qM, it.stock_qty);
    if (pc !== null) v1b.set(i + 1, pc);
    costC = pl?.planned ? addLineCents(costC, qM, pl.uc!) : pc !== null ? addLineCents(costC, qM, pc) : addMoneyCents(costC, qM, it.unit_cost);
    countM += qM;
  });
  return {
    subtotal: fromScaled(subC, 2), cost: fromScaled(costC, 2), count: fromScaled(countM, 3),
    unitCost: (n) => {
      const pl = plan?.lines.get(n);
      if (pl?.planned) return fromScaled(pl.uc!, 2);
      const c = v1b.get(n);
      return c !== undefined ? fromScaled(c, 2) : null;
    },
  };
}
/** `_product_line_cost` (0255:232–244) بالفلس: مادّةٌ حيّةٌ بالعيادة ليست من الحقل ⇒ كلفةُ الخادم (stock_unit_cost للعلبة أو
 *  الكيلو مقرَّبةً، أو _cons_round_div(…, units_per_box, 2) للوحدة الصغيرة حين stock_qty حاضرة و|stock_qty| ≠ |qty| بثلاث
 *  منازل — productLineCostCents حرفاً)؛ وإلا null = كلفةُ الجهاز كما أُرسلت. `nullif(stock_qty, '')`. */
function productLineCostC(db: DemoDB, productId: string | null | undefined, qty: number | string | bigint, stockQty: unknown): bigint | null {
  if (productId == null || String(productId) === "") return null;
  const p = (db.products ?? []).find((x) => x.id === productId);
  if (!p || p.farm_id) return null;
  const qM = typeof qty === "bigint" ? qty : roundScaled(qty, 3);
  const sq = stockQty == null || stockQty === "" ? null : roundScaled(stockQty as number | string, 3);
  return productLineCostCents(consView(p), qM, sq, 0n);
}
/** للتعديل بـrepoDemo: كلفةُ الخادم لسطر مادّةٍ جديد رقماً بمنزلتين، أو null لكلفة الجهاز (بلا مادّة، غائبة، حقل). */
export function productLineCost(db: DemoDB, productId: string | null | undefined, qty: number, stockQty: unknown): number | null {
  const c = productLineCostC(db, productId, qty, stockQty);
  return c === null ? null : fromScaled(c, 2);
}
/** service_id المخزَّن بالسطر: للمخطَّط وغيرِ المخطَّط من خدمات العيادة — لا لخدمةٍ مجهولة ولا لجهازٍ قديم. */
export const planServiceId = (plan: Plan | null, n: number): string | null => plan?.lines.get(n)?.svc ?? null;

/* ── بعد آخر سطر: الصرفُ ثمّ تخطّياتُ السطور ─────────────────────────────────────────────── */
/** والكاتبُ مع كلّ تخطٍّ (0252، invoice_consumption_skips.created_by): البائعُ أو المعدِّل — ولـoverride_none مَن صفّر موادَّ
 *  الحالة، فيسمّيه report_consumables. auth.uid() بالتجريبيّ (demoUserId)؛ ومشغّلُ المنصّة (null بالخادم) لا وجودَ له هنا. */
function pushSkip(db: DemoDB, k: Omit<DemoConsumptionSkip, "id" | "created_by">): void {
  (db.consumptionSkips ?? (db.consumptionSkips = [])).push({ id: uid("ik"), ...k, created_by: demoUserId() });
}
/** _consumption_apply: تخطّياتُ السطر كما أُدخلت (ومعها override_none)، ثمّ كلُّ مواصفةٍ إلى كمية السطر. */
function applyLocal(db: DemoDB, invoiceId: string, itemId: string, qtyM: bigint, l: PlanLine, st: OpStamp): void {
  const lq = txt(pos0(qtyM));
  if (l.none) {
    pushSkip(db, { invoice_id: invoiceId, item_id: itemId, service_id: l.svc, line_name: l.name, product_id: null, product_name: null,
      qty_m: null, unit: null, line_qty_m: lq, note: "override_none", source: "override", created_at: st.iso });
  }
  for (const k of l.skips ?? []) {
    pushSkip(db, { invoice_id: invoiceId, item_id: itemId, service_id: l.svc, line_name: l.name, product_id: k.p, product_name: k.n,
      qty_m: txt(k.q), unit: k.u, line_qty_m: lq, note: k.note, source: l.src!, created_at: st.iso });
  }
  for (const s of [...(l.specs ?? [])].sort((a, b) => cmp(a.p, b.p) || cmp(a.spec, b.spec))) moveLocal(db, invoiceId, itemId, s, qtyM, l.src!, null, st);
}
/** بعد حلقة الإدراج كلِّها (كلُّ سطور المواد خصمت قبله): المخطَّطُ بترتيبه، ثمّ تخطّياتُ السطور (source 'none'). */
export function afterLinesLocal(db: DemoDB, invoiceId: string, plan: Plan, ids: ReadonlyMap<number, { id: string; qty: number }>, now: string | OpStamp): void {
  const st = stampOf(db, now);
  for (const [n, l] of [...plan.lines.entries()].filter(([, x]) => x.planned).sort((a, b) => a[0] - b[0])) {
    const it = ids.get(n)!;
    applyLocal(db, invoiceId, it.id, milliOf(it.qty), l, st);
  }
  for (const s of plan.lineSkips) {
    const it = ids.get(s.n)!;
    pushSkip(db, { invoice_id: invoiceId, item_id: it.id, service_id: s.svc, line_name: s.name, product_id: null, product_name: null,
      qty_m: null, unit: null, line_qty_m: txt(milliOf(it.qty)), note: s.note, source: "none", created_at: st.iso });
  }
}

/* ── الوصفة: القراءة والحفظ والملخّص ─────────────────────────────────────────────────────── */
/** حالُ سطر وصفةٍ الآن: مشكلتُه، وكلفةُ وحدة المخزون، وكلفتُه لمرّةٍ واحدة (صفرٌ لسطرٍ بمشكلة). */
function rowState(db: DemoDB, r: DemoRecipeRow): { p?: Product; t?: DeletedProduct; problem: RecipeProblem; k: bigint; per: bigint } {
  const p = findLive(db, r.product_id);
  const t = p ? undefined : findTrash(db, r.product_id);
  const v = p ? consView(p) : null;
  const problem: RecipeProblem = !p ? (t ? "in_trash" : "product_gone")
    : v!.farm_id ? "farm_stock" : v!.pooled ? "pooled"
    : r.unit === "sub" && subUnitMilli(v!) === null ? "no_sub_unit" : null;
  const k = v ? stockUnitCost(v) : 0n;
  const d = v ? perDivMilli(r.unit, v) : null;
  return { p, t, problem, k, per: problem === null && d !== null ? perValueCents(bi(r.qty_m), k, d) : 0n };
}
function lineView(db: DemoDB, r: DemoRecipeRow): RecipeLine {
  const s = rowState(db, r);
  return {
    id: r.id, product_id: r.product_id, product_name: s.p?.name ?? s.t?.row?.name ?? r.product_name,
    qty: fromScaled(bi(r.qty_m), 3), unit: r.unit, position: r.position, problem: s.problem,
    stock: s.p ? fromScaled(milliOf(s.p.stock), 3) : null,
    unit_label: r.unit === "sub" && s.p ? (s.p.sub_unit_name ?? null) : null,
    units_per_box: s.p ? (s.p.units_per_box ?? null) : null,
    unit_cost: fromScaled(s.k, 6), per_value: fromScaled(s.per, 2),
  };
}
/** بصمةُ الوصفة: نصُّ ما يُدخله الخادمُ لـmd5 حرفاً («المادة:الكمية:الوحدة:الموضع» بـ| بترتيب (position, id)). */
const fingerprintOf = (rows: readonly DemoRecipeRow[]): string =>
  "fp:" + rows.map((r) => `${r.product_id}:${decText(bi(r.qty_m), 3)}:${r.unit}:${r.position}`).join("|");
function recipeView(db: DemoDB, svc: Service): RecipeGet {
  const rows = recipeRowsOf(db, svc.id);
  return { fingerprint: fingerprintOf(rows), flat_cost: svc.cost ?? null, lines: rows.map((r) => lineView(db, r)) };
}
/** نصُّ التدقيق: «الاسم ×الكمية الوحدة» بـ«، » بترتيبها — null لوصفةٍ فارغة (string_agg على لا شيء). */
function auditText(db: DemoDB, rows: readonly DemoRecipeRow[]): string | null {
  if (!rows.length) return null;
  return rows.map((r) => {
    const p = (db.products ?? []).find((x) => x.id === r.product_id);
    const unit = r.unit === "sub" ? (p?.sub_unit_name ?? "") : p?.sold_by_weight ? H.kg : H.box;
    return `${p?.name ?? r.product_name} \u00D7${trimScale(bi(r.qty_m), 3)} ${unit}`;
  }).join(H.sep);
}
const clip140 = (s: string | null): string | null => (s != null && s.length > 140 ? s.slice(0, 139) + H.ellipsis : s);

export async function demoRecipeGet(serviceId: string): Promise<RecipeGet> {
  gate();
  const svc = serviceById(serviceId);
  if (!svc) throw demoHint("recipe_service_missing", H.serviceMissing);
  const db = loadDB();
  pruneOnRead(db);
  return recipeView(db, svc);
}

/** service_recipe_set: المصوّر ← الدور (المدير أو مفتاحُه، أو manageSettings) ← الخدمة ← البصمة ← الشكل ← العدد ←
 *  كلُّ سطرٍ بترتيب validateRecipeLines ← الاستبدال ← تصفيرُ الكلفة الثابتة إن طُلب ← سطرُ تدقيقٍ واحد إن تغيّرت. */
export async function demoRecipeSet(serviceId: string, lines: RecipeSetInput[], expect: string, clearFlatCost: boolean): Promise<RecipeSetResult> {
  gate();
  if (demoBaseRole() === "photographer") throw demoHint("recipe_forbidden", H.forbidden);   // حارسُ الدالّة نفسِها (وراء البوّابة)
  if (!managerNow() && !(await staffCan("manageSettings"))) throw demoHint("recipe_forbidden", H.forbidden);
  const db = loadDB();
  const svc = serviceById(serviceId);
  if (!svc) throw demoHint("recipe_service_missing", H.serviceMissing);
  const before = recipeRowsOf(db, svc.id);
  const fp = fingerprintOf(before);
  if (expect !== fp) throw demoHint("recipe_moved", H.moved);
  if (!Array.isArray(lines)) throw demoHint("recipe_bad_line", H.badShape);
  if (lines.length > 40) throw demoHint("recipe_too_many", H.tooManyLines);
  // موادُّ العيادة كلُّها، الحقلُ معها (recipe_farm لا recipe_product_missing)، بالمعرّف وبحروفه الصغيرة
  const prods = new Map<string, Product>();
  for (const p of db.products ?? []) { prods.set(p.id, p); if (!prods.has(p.id.toLowerCase())) prods.set(p.id.toLowerCase(), p); }
  const views = new Map<string, ConsProduct>([...prods].map(([k, p]) => [k, consView(p)]));
  const chk = validateRecipeLines(lines, views);
  const parsed = lines.map((l) => parseRecipeLine(l));
  if (chk.first) {
    const i = chk.first.index ?? 0;
    const l = parsed[i];
    const nameOf = () => (l ? (prods.get(l.product_id) ?? prods.get(l.key))?.name ?? "" : "");
    switch (chk.first.code) {
      case "recipe_too_many": throw demoHint("recipe_too_many", H.tooManyLines);
      case "recipe_bad_line": throw demoHint("recipe_bad_line", H.badLine(i + 1));
      case "recipe_duplicate": throw demoHint("recipe_duplicate", H.duplicate(i + 1));
      case "recipe_product_missing": throw demoHint("recipe_product_missing", H.productMissing(i + 1));
      case "recipe_pooled": throw demoHint("recipe_pooled", H.pooled(nameOf()));
      case "recipe_farm": throw demoHint("recipe_farm", H.farm(nameOf()));
      case "recipe_no_sub_unit": throw demoHint("recipe_no_sub_unit", H.noSubUnit(nameOf()));
      case "recipe_too_small": throw demoHint("recipe_too_small", H.tooSmall(nameOf()));
    }
  }
  const now = new Date().toISOString();
  const oldText = auditText(db, before);
  const clinic = getActiveClinicId();
  const rows: DemoRecipeRow[] = parsed.map((l, i) => {
    const p = (prods.get(l!.product_id) ?? prods.get(l!.key))!;
    return { id: uid("rcp"), service_id: svc.id, product_id: p.id, product_name: p.name, qty_m: txt(l!.qty_m), unit: l!.unit,
      position: i, updated_at: now, updated_by: demoUserId(), clinic };
  });
  pruneOrphanRecipes(db);                                      // ويُكنس اليتيمُ بالحفظ نفسِه (on delete cascade)
  db.serviceRecipes = [...(db.serviceRecipes ?? []).filter((r) => r.service_id !== svc.id), ...rows];
  const after = recipeRowsOf(db, svc.id);
  const newFp = fingerprintOf(after);
  const newText = auditText(db, after);
  saveDB(db);                                                  // يرمي أوّلاً: لا كلفةَ تُصفَّر لوصفةٍ لم تُحفظ
  if (clearFlatCost && svc.cost != null) demoServices.clearCost(svc.id);
  if (newFp !== fp) {
    demoAuditPush({ action: "UPDATE", entity: "clinic_services", entity_id: svc.id,
      details: { name: svc.name, __changed: { recipe: [clip140(oldText), clip140(newText)] } } });
  }
  const view = recipeView(loadDB(), serviceById(svc.id) ?? svc);
  return { lines: view.lines, fingerprint: view.fingerprint };
}

export async function demoRecipeSummary(): Promise<RecipeSummary> {
  gate();
  const db = loadDB();
  pruneOnRead(db);
  const ids = new Set(services().map((s) => s.id));
  const groups = new Map<string, DemoRecipeRow[]>();
  for (const r of db.serviceRecipes ?? []) if (ids.has(r.service_id)) groups.set(r.service_id, [...(groups.get(r.service_id) ?? []), r]);
  const out: RecipeSummary = {};
  for (const [sid, rows] of groups) {
    let cost = 0n, broken = 0;
    for (const r of rows) { const s = rowState(db, r); if (s.problem) broken++; else cost += s.per; }
    out[sid] = { lines: rows.length, cost: fromScaled(cost, 2), broken };
  }
  return out;
}

/* ── القراءات ────────────────────────────────────────────────────────────────────────── */
/** invoice_consumption_get: لكلّ فاتورةٍ (≤ ٥٠) مواصفاتُ كلّ سطرٍ بحيّها وما رجع منها (T(أعلى كميةٍ وصلها السطر) −
 *  الحيّ)، وتخطّياتُها، وكلُّ مادّةٍ مسّتها ورصيدُها الآن تحت الصفر. فاتورةٌ حُذفت وبقي دفترُها تُقرأ كذلك.
 *  والجولةُ الثانية (العقد بـconsumptionApi): لكلّ مواصفةٍ `moves` — كلُّ أحداثها بترتيبها {at_us، qty} من **الأحداث نفسِها**
 *  التي يُجمع منها live_qty (Σ moves.qty = live_qty بتسع منازل حرفاً) — ولكلّ فاتورةٍ `now_us` (ساعةُ القراءة، ≥ كلّ at_us)
 *  و`waste`: سطورُ سند التلف المعبّأة منها، معلَّقةً أو معتمدة، بدفعاتها (أو null لما عُبّي من الفاتورة كلّها). */
export async function demoInvoiceConsumption(invoiceIds: string[]): Promise<InvoiceConsumptionMap> {
  gate();
  if ((invoiceIds?.length ?? 0) > MAX_IDS) throw demoHint("too_many", H.tooManyIds);
  const db = loadDB();
  const counts = (await import("./demoCounts")).loadCounts();
  const nowUs = readUs(db);
  const evs = db.consumption ?? [], sks = db.consumptionSkips ?? [];
  const ids = [...new Set((invoiceIds ?? []).filter((x): x is string => x != null))];
  const known = ids.filter((id) => (db.invoices ?? []).some((i) => i.id === id) || evs.some((e) => e.invoice_id === id) || sks.some((k) => k.invoice_id === id));
  const out: InvoiceConsumptionMap = {};
  /* by_weight (0252 الجولة الثالثة): products.sold_by_weight لحظةَ القراءة للمادّة التي تُقرأ بها المواصفة (product_id — الدمجُ نقل
   * مواصفاتِ التوأم لأصله): حيّةً، وإلا الأصلُ الحيّ إن كانت بالمحذوفات مدموجةً (merged_into، قفزةٌ واحدة كالانضمام)، وإلا صورتُها
   * بالمحذوفات (وصورةٌ بلا المفتاح false، افتراضُ العمود)، وnull لمادّةٍ ذهبت كلّياً — حاضرٌ دائماً لا يُحذف. والاسمُ لقطةُ يوم البيع
   * لا يتبع الدمج (الكميةُ المدموجة تُعدّ بوحدة الأصل). والعمودُ not null default false: الحقلُ الغائبُ بالتجريبيّ false. */
  const byWeight = (pid: string): boolean | null => {
    const p = (db.products ?? []).find((x) => x.id === pid);
    if (p) return !!p.sold_by_weight;
    const t = (db.productsTrash ?? []).find((x) => x.id === pid);
    if (!t) return null;
    const keeper = t.merged_into ? (db.products ?? []).find((x) => x.id === t.merged_into) : undefined;
    if (keeper) return !!keeper.sold_by_weight;
    const snap = (t.row as { sold_by_weight?: unknown } | undefined)?.sold_by_weight;
    return snap == null ? false : snap === true || snap === "true";
  };
  for (const id of known) {
    const groups = new Map<string, DemoConsumptionEvent[]>();
    for (const e of evs) if (e.invoice_id === id) { const g = `${e.item_id}\u0000${e.spec_id}`; groups.set(g, [...(groups.get(g) ?? []), e]); }
    const byItem = new Map<string, { first: string; spec: ConsumptionSpec }[]>();
    for (const g of groups.values()) {
      const first = g[0], last = g[g.length - 1];
      let lq = 0n, lv = 0n, sh = 0n, peak = 0n;
      for (const e of g) { lq += bi(e.qty_n); lv += bi(e.value_c); sh += bi(e.shortfall_m); if (bi(e.line_qty_m) > peak) peak = bi(e.line_qty_m); }
      const q = bi(first.per_qty_m), d = bi(first.per_div_m);
      const spec: ConsumptionSpec = {
        spec_id: first.spec_id, product_id: last.product_id, product_name: first.product_name, unit: first.unit, unit_label: first.unit_label,
        per_qty: fromScaled(q, 3), per_div: fromScaled(d, 3), live_qty: fromScaled(lq, 9), live_value: fromScaled(lv, 2),
        restored_qty: fromScaled(pos0(targetNano(peak, q, d) - lq), 9), shortfall: fromScaled(sh, 3), note: last.note, source: first.source,
        moves: g.map((e) => ({ at_us: evUs(e), qty: fromScaled(bi(e.qty_n), 9) })),
        by_weight: byWeight(last.product_id),
      };
      byItem.set(first.item_id, [...(byItem.get(first.item_id) ?? []), { first: first.created_at, spec }]);
    }
    const items: Record<string, ConsumptionSpec[]> = {};
    for (const [item, specs] of byItem) {
      items[item] = specs.sort((a, b) => cmp(a.first, b.first) || cmp(a.spec.product_name, b.spec.product_name) || cmp(a.spec.spec_id, b.spec.spec_id)).map((x) => x.spec);
    }
    const skips: ConsumptionSkip[] = sks.filter((k) => k.invoice_id === id)
      .map((k, i) => ({ k, i }))
      .sort((a, b) => cmp(a.k.created_at, b.k.created_at) || cmp(a.k.item_id, b.k.item_id) || cmp(a.k.product_name, b.k.product_name) || a.i - b.i)
      .map(({ k }) => ({ item_id: k.item_id, note: k.note, product_id: k.product_id, product_name: k.product_name,
        qty: k.qty_m == null ? null : fromScaled(bi(k.qty_m), 3), unit: k.unit, line_name: k.line_name, source: k.source }));
    const touched = new Set<string>();
    for (const ii of db.invoiceItems ?? []) if (ii.invoice_id === id && ii.product_id) touched.add(ii.product_id);
    for (const e of evs) if (e.invoice_id === id) touched.add(e.product_id);
    const negatives: StockNegative[] = (db.products ?? []).filter((p) => touched.has(p.id) && milliOf(p.stock) < 0n)
      .sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id))
      .map((p) => ({ product_id: p.id, name: p.name, stock: fromScaled(milliOf(p.stock), 3), by_weight: !!p.sold_by_weight }));
    // سطورُ السند من هذه الفاتورة بترتيب (counted_at, id): المعلَّقُ والمعتمد — المرفوضُ والملغى لا يُعدّان. ومعرّفُ المادّة
    // يتبع الدمجَ كالمواصفات (الطيُّ ينقل سنداتِ التوأم لأصله، 0254)، وإن أفرغه حذفٌ فمادّةُ السطر المحفوظة (0254 الجولة الثانية:
    // coalesce(product_id, source_product)) — فالحذفُ ثمّ الاسترجاعُ لا يجعل السطرَ بلا مادّة فتُعبّى الموادُّ نفسُها مرّةً ثانية.
    const waste: InvoiceWasteRow[] = counts
      .filter((c) => c.source === "waste" && c.source_invoice === id && (c.status === "pending" || c.status === "approved"))
      .sort((a, b) => cmp(a.counted_at, b.counted_at) || cmp(a.id, b.id))
      .map((c) => ({ id: c.id, product_id: c.product_id ?? c.source_product ?? null, batches: c.source_batches?.length ? [...c.source_batches] : null,
        status: c.status as InvoiceWasteRow["status"], qty: Number(c.entered_qty ?? 0), unit: c.entered_unit === "sub" ? "sub" : "stock", counted_at: c.counted_at }));
    out[id] = { items, skips, negatives, now_us: nowUs, waste };
  }
  return out;
}

/** report_consumables: فواتيرُ غيرُ مرجَّعة بيومها (created_at) بمدّة يومٍ–٤٠٠ يوم. لكلّ مادّة ما انصرف صافياً
 *  وقيمتُه وعجزُه وبكم سطر؛ والتعديلاتُ (من الدفتر ومن التخطّي، ومنها override_none)؛ وما بيع بلا خصم. */
export async function demoReportConsumables(from: string, to: string): Promise<ConsumablesReport> {
  gate();
  const f = from ? Date.parse(from) : NaN, t = to ? Date.parse(to) : NaN;
  const DAY = 86_400_000;
  if (!Number.isFinite(f) || !Number.isFinite(t) || t - f < DAY || t - f > 400 * DAY) throw demoHint("range_bad", H.rangeBad);
  const db = loadDB();
  const inv = new Map((db.invoices ?? [])
    .filter((i) => { const at = Date.parse(i.created_at); return at >= f && at < t && i.status !== "refunded"; })
    .map((i) => [i.id, i.created_at] as const));
  const ev = (db.consumption ?? []).filter((e) => inv.has(e.invoice_id));
  // per_prod + per_line
  const prodAgg = new Map<string, { used: bigint; value: bigint; short: bigint; snap: string; lines: Map<string, bigint> }>();
  for (const e of ev) {
    const a = prodAgg.get(e.product_id) ?? { used: 0n, value: 0n, short: 0n, snap: e.product_name, lines: new Map<string, bigint>() };
    a.used += bi(e.qty_n); a.value += bi(e.value_c); a.snap = e.product_name;   // الأحدثُ آخرَ المصفوفة
    a.lines.set(e.item_id, (a.lines.get(e.item_id) ?? 0n) + bi(e.qty_n));
    prodAgg.set(e.product_id, a);
  }
  /* العجزُ مرّةً لكلّ (فاتورة، مادّة) بآخر حالها (0252 الجولة الثالثة sf_born/sf_step/sf_run/sf_prod)، لا مجموعُ أحداثها: مجموعٌ جارٍ
   * لا ينزل تحت الصفر — العجزُ = آخرُه ناقصَ أدنى ما بلغه (والصفرُ أوّلُه)، فكلُّ إرجاعٍ يردّ آخرَ ما صُرف بلا رصيد. والدفعةُ
   * (at_us) خطوتان بترتيبها: g=1 صرفُها كلُّه وإرجاعُ مواصفاتٍ وُلدت قبلها **صافياً** (u + r ≥ 0 ⇒ min(f, u + r)، وإلا u + r) —
   * فالتعديلُ يردّ السطرَ ويعيده بالربط نقلاً لا مرتجعاً ثمّ بيعة — وg=2 إرجاعُ مواصفاتٍ وُلدت فيها بعد صرفها. والميلادُ أوّلُ حدثٍ
   * للمواصفة. والخطوةُ صافيةٌ لكلّ (فاتورة، مادّة) لا لكلّ مواصفة: المعرّفاتُ العشوائية لا تقرّر العجز. */
  const born = new Map<string, number>();
  for (const e of ev) { const u = evUs(e), b = born.get(e.spec_id); if (b === undefined || u < b) born.set(e.spec_id, u); }
  const steps = new Map<string, Map<string, { at: number; g: number; u: bigint; f: bigint; r: bigint }>>();
  for (const e of ev) {
    const at = evUs(e), g = e.kind === "restore" && born.get(e.spec_id) === at ? 2 : 1;
    const k1 = `${e.invoice_id}\u0000${e.product_id}`, k2 = `${at}\u0000${g}`;
    const m = steps.get(k1) ?? new Map<string, { at: number; g: number; u: bigint; f: bigint; r: bigint }>();
    const s = m.get(k2) ?? { at, g, u: 0n, f: 0n, r: 0n };
    if (e.kind === "use") { s.u += bi(e.posted_m); s.f += bi(e.shortfall_m); } else s.r += bi(e.posted_m);
    m.set(k2, s); steps.set(k1, m);
  }
  for (const [k1, m] of steps) {
    let run = 0n, low = 0n;
    for (const s of [...m.values()].sort((a, b) => a.at - b.at || a.g - b.g)) {
      run += s.u + s.r >= 0n ? minB(s.f, s.u + s.r) : s.u + s.r;
      low = minB(low, run);
    }
    const a = prodAgg.get(k1.slice(k1.indexOf("\u0000") + 1));
    if (a) a.short += run - low;
  }
  const prods = [...prodAgg].filter(([, a]) => a.used !== 0n || a.value !== 0n || a.short !== 0n).map(([pid, a]) => ({
    product_id: pid, name: (db.products ?? []).find((p) => p.id === pid)?.name ?? a.snap,
    usedN: a.used, valueC: a.value, shortM: a.short, lines: [...a.lines.values()].filter((q) => q > 0n).length,
  })).sort((a, b) => (a.valueC === b.valueC ? 0 : a.valueC > b.valueC ? -1 : 1) || cmp(a.name, b.name) || cmp(a.product_id, b.product_id));
  // التعديلات: صفوفُ الدفتر بمصدر override، وتخطّياتٌ بمصدر override (منها override_none)
  type OvRow = { invoice_id: string; item_id: string; sold_at: string; service_id: string | null; product_name: string | null; created_by: string | null; created_at: string };
  const ovRows: OvRow[] = [
    ...ev.filter((e) => e.source === "override").map((e) => ({ invoice_id: e.invoice_id, item_id: e.item_id, sold_at: inv.get(e.invoice_id)!,
      service_id: e.service_id, product_name: e.product_name, created_by: e.created_by, created_at: e.created_at })),
    // والتخطّي بكاتبه (0252 الجولة الثانية، k.created_by): override_none وحده بلا صفّ دفتر — بلاه ما يُسمّى مَن صفّر الحالة
    ...(db.consumptionSkips ?? []).filter((k) => inv.has(k.invoice_id) && k.source === "override").map((k) => ({ invoice_id: k.invoice_id, item_id: k.item_id,
      sold_at: inv.get(k.invoice_id)!, service_id: k.service_id, product_name: k.product_name, created_by: k.created_by ?? null, created_at: k.created_at })),
  ];
  const ovGroups = new Map<string, OvRow[]>();
  for (const o of ovRows) { const g = `${o.invoice_id}\u0000${o.item_id}`; ovGroups.set(g, [...(ovGroups.get(g) ?? []), o]); }
  const staff = ovRows.some((o) => o.created_by) ? await listStaff() : [];
  /* by_owner: كتبه صاحبُ العيادة — معرّفُه معرّفُ العيادة (auth_clinic() يرجع auth.uid() لمن لا عضويةَ له، 0151)، فبطاقتُه تقول
   * «صاحب العيادة» لا «موظف». عيادةُ الجلسة (demoClinicId) لا مَن يقرأ: الطبيبُ والمديرُ يريان الجوابَ نفسَه. والكادرُ false، وبلا
   * كاتبٍ (أو بلا عيادةٍ تُعرف) false. */
  const clinicUid = demoClinicId();
  const ovr = [...ovGroups.values()].map((g) => {
    const svc = g.find((o) => o.service_id != null)?.service_id ?? null;
    const byUser = [...g].sort((a, b) => cmp(a.created_at, b.created_at)).find((o) => o.created_by != null)?.created_by ?? null;
    const names = [...new Set(g.map((o) => o.product_name).filter((x): x is string => x != null))].sort(cmp);
    const sold = g.map((o) => o.sold_at).sort(cmp)[0];
    const line = (db.invoiceItems ?? []).find((ii) => ii.id === g[0].item_id);
    return {
      invoice_id: g[0].invoice_id, created_at: sold,
      service_name: (svc ? serviceById(svc)?.name : undefined) ?? line?.name ?? "",
      products: names as unknown, by_name: byUser ? (staff.find((s) => s.userId === byUser)?.name ?? null) : null,
      by_owner: byUser != null && clinicUid != null && byUser === clinicUid,
    };
  });
  const newest = <T extends { created_at: string; invoice_id: string }>(xs: T[]): T[] =>
    [...xs].sort((a, b) => cmp(b.created_at, a.created_at) || cmp(a.invoice_id, b.invoice_id)).slice(0, 200);
  // ما بيع بلا خصم: جهازٌ قديم وخدمةٌ مجهولة — والربطُ يعيد كتابتَهما تاريخاً فيُعدّان مرّةً بأصلهما
  const lsk = (db.consumptionSkips ?? []).filter((k) => inv.has(k.invoice_id) && (k.note === "old_device" || k.note === "service_missing") && k.source !== "relink")
    .map((k) => ({ invoice_id: k.invoice_id, created_at: inv.get(k.invoice_id)!, line_name: k.line_name, note: k.note as "old_device" | "service_missing" }));
  return {
    products: prods.map((p) => ({ product_id: p.product_id, name: p.name, used: fromScaled(p.usedN, 9), value: fromScaled(p.valueC, 2),
      short: fromScaled(p.shortM, 3), lines: p.lines })),
    short_products: prods.filter((p) => p.shortM > 0n).length,
    overrides: { count: ovr.length, recent: newest(ovr) },
    unconsumed: {
      old_device: lsk.filter((k) => k.note === "old_device").length,
      service_missing: lsk.filter((k) => k.note === "service_missing").length,
      recent: newest(lsk),
    },
  };
}

/* ── سندُ التلف (0254) ───────────────────────────────────────────────────────────────── */
/** stock_waste_submit: البوّابةُ (المصوّر) هنا، والدالّةُ بمرآة الجرد (demoCounts.ts — مخزنُ stock_counts التجريبيّ) ومعها
 *  المرحِّلُ والسحب: الموافقةُ الفورية تُرحَّل −d بالضبط عبر stockPostLocal ('external') وتكتب «سحب مخزن». */
export async function demoSubmitWaste(lines: WasteLineInput[], apply: boolean, clientRef: string): Promise<WasteSubmitResult> {
  gate();
  const counts = await import("./demoCounts");
  return counts.demoSubmitWasteCore(lines, apply, clientRef, {
    post: (db, productId, xNano, mode, now) => stockPostLocal(db, productId, xNano, mode, now),
    addExpense: demoAddExpense,
  });
}

/* ── متوسّطُ الكلفة (0255) ─────────────────────────────────────────────────────────────── */
/** نسبةُ خصم الشركة لفاتورة شراء (0260): الصافي والمجموعُ قبله بالفلوس — null = بلا خصم (الكلفةُ كما كُتبت). */
export interface PurchaseShare { netC: bigint; grossC: bigint }
/** كلفةُ وحدة السطر للمتوسّط بالمليون: `v_cost numeric(12,2)` ثمّ نصيبُه من الخصم (`_purchase_unit_cost`، 0260). */
const unitMicro = (cost: number | string | null | undefined, share?: PurchaseShare | null): bigint => {
  const c = roundScaled(cost ?? 0, 2) * 10_000n;                   // purchase_price numeric(12,2) بالمليون
  return share ? (purchaseUnitCostU(c, share.netC, share.grossC) ?? c) : c;
};
/** `case when v_ucost > 0 then v_ucost end` بالمليون: كلفةُ سطرٍ بعد نصيبه من الخصم، والصفرُ والسالبُ null. */
const posMicro = (cost: number | string | null | undefined, share?: PurchaseShare | null): bigint | null => {
  const c = unitMicro(cost, share);
  return c > 0n ? c : null;
};
/** خصمُ رأس الفاتورة كما تكتبه record_purchase وupdate_purchase (0260): `case when v_gross > 0 then least(greatest(d, 0), v_gross)
 *  else 0 end` ثمّ عمودُه numeric(14,2) (التقريبُ بعد القصّ). ما لا يعبر JSON رقماً (NaN، اللانهاية) أو فارغٌ يصل null فيُحسب صفراً،
 *  ومجموعٌ ≤ صفر (سطرٌ بسعرٍ سالب) بلا خصم. يرجع الخصمَ والصافيَ رقمَين، والنسبةَ للسطور (null بلا خصم). */
export function purchaseShareLocal(gross: number, discount: unknown): { discount: number; net: number; share: PurchaseShare | null } {
  const grossC = roundScaled(gross, 2);
  let d9 = 0n;
  if (discount != null && discount !== "" && Number.isFinite(Number(discount))) d9 = roundScaled(discount as number | string, 9);
  const g9 = grossC * 10_000_000n;
  const discC = grossC > 0n ? roundDiv(d9 < 0n ? 0n : d9 > g9 ? g9 : d9, 10_000_000n) : 0n;
  const netC = grossC - discC;
  return { discount: fromScaled(discC, 2), net: fromScaled(netC, 2), share: discC > 0n ? { netC, grossC } : null };
}
/** نسبةُ فاتورةٍ محفوظة لعكس سطورها القديمة (0260): `_purchase_unit_cost(c, total, total + discount)` — ما أدخله استلامُها بالضبط. */
export function purchaseStoredShare(p: { total?: number | null; discount?: number | null }): PurchaseShare | null {
  const netC = roundScaled(p.total ?? 0, 2), discC = roundScaled(p.discount ?? 0, 2);
  return discC > 0n ? { netC, grossC: netC + discC } : null;
}
/** record_purchase (0255:428–462) لسطرٍ لقي مادّةً قائمة — من صفّها **القديم** قبل الـSET: المتوسّطُ _avg_receive وفرقُه
 *  _avg_variance على رصيدها وأساس كلفتها _avg_base. ومخزنُ الحقل خارج المتوسّط: يبقى كما هو وبلا فرق. */
export function purchaseReceiveLocal(p: Product, qty: number, cost: number, share?: PurchaseShare | null): { avg: number | null; variance: number | null } {
  if (p.farm_id) return { avg: p.avg_cost ?? null, variance: null };
  // 0260: الاستلامُ والفرقُ بكلفة السطر بعد نصيبه من خصم الشركة (v_ucost) — والمكتوبُ بالسطر وسعرُ الشراء كما هما.
  const sM = milliOf(p.stock), aU = avgBase(p), qM = roundScaled(qty, 3), cU = unitMicro(cost, share);
  const a = avgReceive(sM, aU, qM, cU);
  // الفرقُ الذي يُقرَّب صفراً لم يقع: receiveVarianceCents يرجعه null (0255 _avg_variance بـnullif) — ويمرّ هنا كما هو.
  const v = receiveVarianceCents(sM, aU, qM, cU);
  /* 0255 الجولة الثالثة: `coalesce(_avg_receive(…), avg_cost)` — المجهولُ لا يُكتب فوق المخزَّن. سطرٌ مجّانيٌّ (أو بلا كمية)
   * يرجع الأساس، وأساسُ متوسّطٍ صفرٍ صريح (تصحيحُ المدير) مجهول: كان ٥ مجّاناً تمحو الصفرَ فتعود الكلفةُ لسعر الشراء. والمدفوعُ
   * كما هو (صفرٌ صريح ثمّ ٥ بـ٨٠٠ ⇒ ٨٠٠)، ومتوسّطٌ فارغ مع سطرٍ مجّانيّ يكتب الأساسَ (سعرَ الشراء) كما كان. */
  return { avg: a === null ? (p.avg_cost ?? null) : fromScaled(a, 6), variance: v === null ? null : fromScaled(v, 2) };
}
/** مادّةٌ يولدها record_purchase: تبدأ بكلفة سطرها بعد نصيبه من الخصم (`case when v_ucost > 0 then v_ucost end`)، وبلا كلفةٍ مجهولة. */
export function purchaseNewAvg(cost: number, share?: PurchaseShare | null): number | null {
  const c = posMicro(cost, share);
  return c === null ? null : fromScaled(c, 6);
}
/** رأسُ فاتورة الشراء كما تجمعه record_purchase وupdate_purchase: `v_total numeric(14,2) := v_total + v_qty × v_cost` **سطراً
 *  سطراً** — كلُّ إسنادٍ يقرّب (النصفُ بعيداً عن الصفر)، فنصفا علبةٍ بـ٧٧٧٫٧٧ = ٣٨٨٫٨٩ ثمّ ٧٧٧٫٧٨، لا مجموعُها الدقيق مقرَّباً مرّةً
 *  (٧٧٧٫٧٧، قيسَ بالفرق مع الخادم) — و`v_count numeric(14,3)`، و`round(v_count)::int` عدداً صحيحاً. الكميةُ والكلفةُ بمنزلتَي
 *  عمودَيهما قبل الضرب. */
export function purchaseTotalLocal(lines: readonly { qty: number; cost: number }[]): { total: number; itemCount: number } {
  let tC = 0n, cM = 0n;
  for (const l of lines) {
    const qM = roundScaled(l.qty, 3);
    tC = addLineCents(tC, qM, roundScaled(l.cost, 2));
    cM += qM;
  }
  return { total: fromScaled(tC, 2), itemCount: fromScaled(roundDiv(cM, 1000n), 0) };
}
interface AvgTouch { skip: boolean; s0: bigint; a0: bigint | null; vo: bigint; vn: bigint; cl: bigint | null }
/** update_purchase (0255:584–598، 655–664، 707–711، 730–753): إعادةُ التطبيق لا تمسّ المتوسّط؛ لكلّ مادّةٍ لقطتُها عند أوّل لمس
 *  (s0 الرصيد، a0 أساسُ الكلفة)، وقيمةُ سطورها القديمة (vo) والجديدة (vn) بكلفة كلٍّ منها والصفريُّ بـa0، وآخرُ كلفةٍ موجبة
 *  (cl) — ثمّ _avg_adjust مرّةً بالرصيد النهائيّ، ويُكتب ما تغيّر وحده. مادّةٌ وُلدت بالتعديل أساسُ نفسِها، والحقلُ يُتخطّى. */
export function purchaseAdjustLocal() {
  const m = new Map<string, AvgTouch>();
  const SKIP: AvgTouch = { skip: true, s0: 0n, a0: null, vo: 0n, vn: 0n, cl: null };
  return {
    /** أوّلُ لمسٍ بسطرٍ قديم — قبل عكسه: vo = Σ سطورِ المادّة القديمة **كلِّها** بالفاتورة. */
    touchOld(p: Product | undefined, productId: string, oldLines: readonly { qty?: number | null; purchase_price?: number | null }[], share?: PurchaseShare | null): void {
      if (m.has(productId)) return;
      if (!p || p.farm_id) { m.set(productId, SKIP); return; }
      const a0 = avgBase(p);
      let vo = 0n;
      for (const l of oldLines) {
        // 0260: السطرُ القديم بنسبة خصم فاتورته كما حُفظ، والصفرُ (مجّانيٌّ أو أكله الخصمُ كلَّه) بالأساس — كما استُلم.
        const c = posMicro(l.purchase_price, share) ?? a0;          // sum يتخطّى qty × null
        if (c !== null) vo += roundScaled(l.qty ?? 0, 3) * c;
      }
      m.set(productId, { skip: false, s0: milliOf(p.stock), a0, vo, vn: 0n, cl: null });
    },
    /** أوّلُ لمسٍ بسطرٍ جديد لمادّةٍ قائمة لم تلمسها السطورُ القديمة — قبل سطرها. */
    touchNew(p: Product): void {
      if (m.has(p.id)) return;
      m.set(p.id, p.farm_id ? SKIP : { skip: false, s0: milliOf(p.stock), a0: avgBase(p), vo: 0n, vn: 0n, cl: null });
    },
    /** مادّةٌ وُلدت بهذا التعديل: سطرُها أوّلُ لمسها — رصيدُها وكلفتُه أساسٌ لما بعده، وقيمتُه لا تُجمع. */
    born(p: Product, cost: number, share?: PurchaseShare | null): void {
      const c = posMicro(cost, share);
      m.set(p.id, { skip: false, s0: milliOf(p.stock), a0: c, vo: 0n, vn: 0n, cl: c });
    },
    /** قيمةُ سطرٍ جديد لمادّةٍ قائمة (والصفريُّ بـa0، ثمّ صفر) وآخرُ كلفةٍ موجبة. */
    line(productId: string, qty: number, cost: number, share?: PurchaseShare | null): void {
      const e = m.get(productId);
      if (!e || e.skip) return;
      const c = posMicro(cost, share);
      e.vn += roundScaled(qty, 3) * (c ?? e.a0 ?? 0n);
      if (c !== null) e.cl = c;
    },
    /** بعد الحلقة: المتوسّطُ بالرصيد النهائيّ لكلّ مادّةٍ لُمست، ويُكتب إن تغيّر (لا سطرَ تدقيقٍ فارغ). */
    finish(db: DemoDB): void {
      for (const [id, e] of m) {
        if (e.skip) continue;
        const p = (db.products ?? []).find((x) => x.id === id);
        if (!p) continue;
        const was = p.avg_cost == null ? null : roundScaled(p.avg_cost, 6);
        // 0255 الجولة الثالثة: `coalesce(_avg_adjust(…), p.avg_cost)` — المجهولُ لا يُكتب فوق المخزَّن (كالاستلام).
        const now = avgAdjust(e.s0, e.a0, e.vo, e.vn, milliOf(p.stock), e.cl) ?? was;
        if (now !== was) p.avg_cost = now === null ? null : fromScaled(now, 6);
      }
    },
  };
}
/** products_guard_avg (0255:251–266): كتابةٌ مباشرة من المتصفّح تغيّر avg_cost ⇒ avg_cost_frozen. القيمةُ كما يحفظها عمودُ
 *  numeric(24,6) (والعائمُ غيرُ المحدود null كما يرسله JSON)، و«ما تغيّر» = is distinct from. */
export function avgCostChanged(next: unknown, cur: unknown): boolean {
  const n = (x: unknown): bigint | null => (x == null || (typeof x === "number" && !Number.isFinite(x)) ? null : roundScaled(x as number | string, 6));
  return n(next) !== n(cur);
}
export function avgFrozenError(): Error { return demoHint("avg_cost_frozen", H.avgFrozen); }
/** products_guard_avg (0255 الجولة الثالثة)، بعد avg_cost_frozen: التجميعُ (pooled من غير true إلى true) بكتابةٍ مباشرة ⇒ pool_direct
 *  بتلميحه — نسخةٌ قديمة محفوظةٌ بالمتصفّح كانت تقلبه فيختفي رصيدُ الصفّ الموقَّع تحت «مجمّع» أو يُصفَّر. والتجميعُ بـpoolProduct وحدها. */
export function poolDirectError(): Error { return demoHint("pool_direct", H.poolDirect); }

/** product_cost_reset (0255:271–303): المصوّرُ تردّه البوّابة؛ ثمّ المديرُ وحده (ومفتاحُه الحيّ)، ثمّ رقمٌ ≥ ٠ أقلُّ من ١٠¹⁸ بستّ
 *  منازل أقصى أو فارغٌ («يتبع سعرَ الشراء» من جديد)، ثمّ المادّةُ بمخزن العيادة، ولا حقل. وما لم يتغيّر لا يُكتب (ولا سطرَ
 *  تدقيق). والرقمُ كما يصل الخادمَ عبر JSON: NaN واللانهاية null. */
export async function demoProductCostReset(productId: string, cost: number | null): Promise<CostResetResult> {
  gate();
  if (demoBaseRole() === "photographer" || !managerNow()) throw demoHint("cost_reset_forbidden", H.costResetForbidden);
  let c: bigint | null = null;
  if (cost != null && !(typeof cost === "number" && !Number.isFinite(cost))) {
    numericIn(cost);                                               // نصٌّ ليس رقماً ⇒ 22P02 كتحويل الخادم (p_cost numeric)
    /* `p_cost <> round(p_cost, 6)` على القيمة كما تصل numeric (نصُّها العشريّ) **بلا تقريب**: toMicro يرمي لمنزلةٍ سابعةٍ غير صفرية
     * أينما كانت. كان التقريبُ بثلاثين منزلة أوّلاً يجعل ١٠⁻³¹ صفراً فيكتبه، والخادمُ يرفضه (مقيسٌ على PGlite). */
    let v: bigint | null;
    try { v = toMicro(cost); } catch { v = null; }
    if (v === null || v < 0n || v >= 10n ** 24n) throw demoHint("cost_reset_bad", H.costResetBad);
    c = v;
  }
  const db = loadDB();
  const p = findLive(db, String(productId ?? ""));
  if (!p) throw demoHint("cost_reset_product_missing", H.costResetMissing);
  if (p.farm_id) throw demoHint("cost_reset_farm", H.costResetFarm);
  const cur = p.avg_cost == null ? null : roundScaled(p.avg_cost, 6);
  if (cur !== c) {
    const before = p.avg_cost ?? null;
    p.avg_cost = c === null ? null : fromScaled(c, 6);
    saveDB(db);
    // محفّزُ المنتجات يدقّق التغييرَ كأيّ تعديل (audit_all) — بشكل غلاف النشاط التجريبيّ: الصفُّ وما تغيّر.
    demoAuditPush({ action: "UPDATE", entity: "products", entity_id: p.id,
      details: { ...(p as unknown as Record<string, unknown>), __changed: { avg_cost: [before, p.avg_cost] } } });
  }
  return { id: p.id, avg_cost: p.avg_cost ?? null, purchase_price: p.purchase_price };
}
