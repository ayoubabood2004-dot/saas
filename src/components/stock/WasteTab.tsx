import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSearchParams } from "react-router-dom";
import { Check, Hourglass, PackageSearch, RotateCw, Search, X } from "lucide-react";
import type { Product } from "@/types";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, formatDate, formatNum, formatQty, formatTime, matchCode, money, searchable } from "@/lib/utils";
import { describeDbError, withTimeout } from "@/lib/errors";
import { countable } from "@/lib/countPick";
import { codeMatcher } from "@/lib/productCodes";
import { levelMatcher } from "@/lib/packs";
import { holdUpdates } from "@/lib/inflight";
import { invoiceNo } from "@/lib/invoiceNo";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { consumptionApi, type ConsumablesReport, type InvoiceConsumption, type InvoiceWasteRow, type StockNegative, type WasteLineInput, type WasteSubmitResult } from "@/lib/consumptionApi";
import { fromScaled, roundDiv, roundScaled, stockNano, stockUnitCost, subUnitMilli, toMilli } from "@/lib/consumption";

/* ============================================================================
 * سندُ التلف (0254) — تبويبُ «تالف/هدر» بصفحة الجرد، ومعه بطاقاتُ مستهلكات الخدمات (0252) بتبويب
 * «وين راحت الفلوس». رفيقُ نطاق `cnt` (مالكُه StockCount.tsx) ولا يحمّله غيرُه، وكسولاً: الحسابُ
 * الدقيق (consumption.ts) وبابُ الخادم (consumptionApi) لا يدخلان قطعةَ الصفحة ولا حزمةَ الإقلاع.
 *
 *   • **السندُ فرقٌ لا عدّ.** «انكسرت علبة» أو «٢ مل من قنينة ٥٠٠» — بوحدته (العلبة، أو الصغيرة وبها
 *     ما دون ٠٫٠٠١ علبة)، والسببُ تالف أو منتهي، والملاحظةُ لازمة (الاستعمالُ الداخليّ «تالف» بملاحظة —
 *     قرارُ المالك). المديرُ (ومفتاحُه) «سجّل وطبّق» بضغطة، وغيرُه «أرسل للمدير» والرصيدُ لا يتغيّر.
 *   • **فوق الرصيد سؤالٌ لا منع.** الخادمُ يرفض waste_exceeds_stock حين d > max(الرصيد، ٠) بلا
 *     ack_over — فالشاشةُ تسأل **قبل** الإرسال بنفس القاعدة ونفس الحساب (stockNano = _cons_round_div)،
 *     والضغطةُ الثانية («أي، سجّل») ترسل السطرَ بتأكيده. والسندُ يصحّ على رصيدٍ سالب (−٠٫٠٢ وتلفُ ٠٫٥).
 *   • **مرجعٌ واحدٌ للمسودّة.** يُولَّد بأوّل إرسال ويُعاد مع كلّ إعادة: جوابٌ ضاع بالطريق لا يسجّل
 *     السندَ مرّتين (rpc_refs). ويتجدّد بعد النجاح أو مسح المسودّة. والنتيجةُ تُقال من سطور الخادم:
 *     إعادةٌ رجعت بنتيجة إرسالٍ سابق تُقال بما سُجّل فعلاً، لا بما بالمسودّة الآن.
 *   • **`?inv=&at=` يعبّي ما رجّعه هذا الفعلُ وحده** (دفعاتُه: at_us لأحداث دفتر المواصفة) بوحدة المواصفة،
 *     ولا يعبّي ما سُجّل هدراً من الفاتورة (waste، معلَّقاً أو مطبَّقاً) — والسطرُ يحمل مرجعَه (src_invoice،
 *     src_batches: كلُّ دفعات الرابط التي رجعت فيها المادة، لا أحدثُها) فيرجع بـwaste بعده. وفشلُ القراءة أو شكلٌ ناقص «أعد المحاولة» لا نصفُ سند (قائمةٌ ناقصة
 *     تُصدَّق)، ودفعاتٌ ليست بدفتر الفاتورة «ما نعرف شنو رجع» لا «ماكو رجع». و`?p=` يختار مادةً، والبحثُ بالرمز
 *     من مصدره الواحد (codeMatcher) — وسقفُه يقول إنه سقف («و٤ غيرها — اكتب أكثر»)، ورمزٌ كُتب كاملاً مطابقُه أوّلاً.
 *   • **التعبئةُ لا تمسح ما كُتب**: مادةٌ بالسند قبل وصول القراءة (كُتبت والقراءةُ بالطريق، أو بعد فشلٍ فإعادة) يبقى سطرُها
 *     ويأخذ مرجعَ الترجيع — سقوطُ سطر التعبئة بصمت كان يُرسلها بلا مرجع فيعبّيها رابطٌ لاحق ثانيةً — وتُقال باسمها وبما
 *     رجع منها؛ و«عبّينا N» ما أُضيف فعلاً. والعنوانُ يتبع المعبّأَ والمتخطّى والمسجّلَ معاً: «ماكو رجع» عمّا لم يرجع وحده.
 *   • **ما سجّله غيرُنا يُشال ويُقال** (waste_source_taken: تبويبٌ أو جهازٌ ثانٍ سجّل ما عُبّي قبلنا، فرفض الخادمُ السندَ كلَّه): تُقرأ
 *     الفاتورةُ من جديد ويُحكم كلُّ سطرٍ بمرجعه بقاعدة الخادم نفسها (takenBy، لا بالتعبئة: تعديلٌ بعدها يُسقط المادّةَ منها والخادمُ
 *     يرفضها) — ما سُجّل يُشال ويُقال باسمه ووقته، و«الباقي ما انسجل بعد» عن سطور ذلك السند وحدها. كان يبقى بالسند يُرسَل ويُرفض للأبد؛
 *     والقراءةُ إن فشلت لا تشيل شيئاً. وسندٌ أفرغته يُشال رابطُه كأيّ سندٍ فرغ، والملاحظةُ تغيب إذا أفرغه صاحبُه أو بدأ رابطٌ آخر.
 *   • عملٌ لم يُرسل يمسك النسخةَ الجديدة (holdUpdates(Infinity)) كعدّ اليوم — **بما تضيّعه إعادةُ التحميل لا بوجود السطر**:
 *     كميةٌ أو ملاحظةٌ كُتبت، أو تعبئةُ رابطٍ تغيّرت أو شيل منها سطرٌ والرابطُ باقٍ (يرجع ممتلئاً فيُرسَل ما استُثني)، أو بقيت
 *     بعد أن شالته النتيجة. وتعبئةٌ كما هي والرابطُ بالعنوان، أو سطرٌ لم يُكتب فيه، تبنيه إعادةُ التحميل كما هو — فلا يمسك.
 *     والتبويبُ يبقى مركَّباً (مخفياً) حين يُبدَّل أو ينتهي رفعُ PIN المدير — المسودّةُ لا تضيع بنظرةٍ على «تنتظر موافقة»
 *     ولا بانتهاء الرفع (StockCount يُبقيه ويقول إنه محفوظ؛ `onDraft`).
 * ========================================================================= */

type Unit = "stock" | "sub";
type Reason = "damaged" | "expired";
const REASONS: readonly Reason[] = ["damaged", "expired"];
/** أقصى كميةٍ بالسطر (١٠⁶ بوحدته) بالألف — حدُّ الخادم (waste_bad_qty). */
const MAX_QTY_M = 1_000_000_000n;
const NANO = 1_000_000_000n;
/** نتائجُ البحث المرسومة — وما بعدها يُقال عددُه (CLAUDE.md: القائمةُ المقصوصة بصمت تُصدَّق «ماكو»). */
const PICK_MAX = 8;

/** سطرُ السند كما كُتب: الكميةُ نصُّ الحقل (لا تقريبَ صامت)، و`ack` مفتاحُ (الوحدة|الكمية) الذي أُكّد عليه
 *  «فوق الرصيد» — تغييرُ الرقم أو الوحدة يُسقطه. `name` لقطةٌ تُقال بها مادةٌ اختفت من القائمة بعد إعادة التحميل.
 *  `src`: سطرٌ عُبّي من فاتورة — مرجعُها ودفعاتُ الرابط التي رجعت فيها المادة تصاعدياً (null لرابطٍ بلا دفعات)؛
 *  والمكتوبُ باليد null. كلُّها لا أحدثُها: سطرٌ من دفعتين حُفظت أحدثُهما وحدها كان رابطٌ لاحق بالأقدم يعبّيه ثانيةً.
 *  `seed`: ما عبّاه الرابطُ (مفتاحُه وقيمُه) — سطرٌ يطابقه والرابطُ بالعنوان تبنيه إعادةُ التحميل كما هو فلا يمسك. */
interface Draft { id: string; name: string; unit: Unit; qty: string; reason: Reason; note: string; ack: string | null; src: { inv: string; batches: number[] | null } | null; seed?: Seed }
interface Seed { key: string; unit: Unit; qty: string; reason: Reason; note: string }
/** مادةٌ رجعت وسطرُها بالسند قبل التعبئة: بقيت كميتُها هي — ويُقال ما رجع منها (`qty` بوحدة `unit`). */
interface Kept { id: string; name: string; unit: Unit; qty: string }
/** سطرٌ مقروء: الكميةُ بالألف، وقاسمُ وحدتها بالألف (١ للعلبة، units_per_box للصغيرة)، والمقدارُ d بوحدة المخزون بالمليار. */
interface Read { qm: bigint; dm: bigint; dN: bigint; key: string }
type SkipWhy = "gone" | "pooled" | "farm" | "tiny";
interface Skip { name: string; why: SkipWhy }
/** مادةٌ سُجّلت هدراً من هذه الفاتورة فلا تُعبّأ: باسمها ووقتِ أحدث سطرٍ لها؛ `inv` = رابطٌ بلا دفعات (أيُّ دفعةٍ تكفي).
 *  و`id` مفتاحُ المادة بالدفتر — به يُطابَق سطرُ السند حين يرفضه الخادمُ لأنه سُجّل (waste_source_taken). */
interface Already { id: string; name: string; at: string; inv: boolean }
/** ما أُرسل (لقطةٌ لكلّ سطر) — تُطابَق بسطور الخادم بالمادة والمقدار. */
interface Sent { id: string; dN: bigint; text: string; reason: Reason; zero: boolean }
interface Done { r: WasteSubmitResult; sent: Sent[] }
/** نتيجةُ الموافقة كما يرجعها stock_count_decide (0254). */
type Decided = { withdrawals?: { reason?: string; amount?: number }[]; negatives?: StockNegative[] };

/** رصيدُ المادة بالمليار (numeric(24,3)) — وما لا يُقرأ صفر. */
function stockN(p: Product): bigint {
  const s = Number(p.stock);
  return Number.isFinite(s) ? roundScaled(s, 3) * 1_000_000n : 0n;
}
/** الكميةُ المكتوبة بقاعدة الخادم (waste_bad_qty): > ٠ و≤ ١٠⁶ بثلاث منازل أقصى، و'sub' لمادةٍ لها وحدةٌ صغيرة،
 *  و d > ٠ (ما يُكتب بالصغيرة ولا يبلغ جزءاً من مليار علبة يُرفض). */
function readQty(d: Draft, p: Product): Read | null {
  const dm = d.unit === "sub" ? subUnitMilli(p) : 1000n;
  if (dm === null) return null;
  let qm: bigint;
  try { qm = toMilli(d.qty); } catch { return null; }
  if (qm <= 0n || qm > MAX_QTY_M) return null;
  const dN = stockNano(qm, dm);
  return dN > 0n ? { qm, dm, dN, key: `${d.unit}|${qm}` } : null;
}
/** فوق الرصيد بالنظام — مرآةُ waste_exceeds_stock: d > greatest(stock, 0). */
function overStock(r: Read, p: Product): boolean {
  const s = stockN(p);
  return r.dN > (s > 0n ? s : 0n);
}
/** رصيدٌ بإشارته بمنازل الرصيد الثلاث: ما بعد سندٍ دون ٠٫٠٠٠٥ (٠ − ٠٫٠٠٠٤) صفرٌ لا «−0». */
const signed = (n: number): string => {
  const m = Number.isFinite(n) ? roundScaled(n, 3) : 0n;
  return `${m < 0n ? "−" : ""}${formatQty(fromScaled(m < 0n ? -m : m, 3))}`;
};
/** اسمُ الوحدة: الصغيرةُ باسمها (وإلا «مفرد» كالكاشير)، والعلبةُ، أو الكيلو للموزون. */
function unitWord(t: TFunction, p: Product | undefined, unit: Unit): string {
  if (unit === "sub") return p?.sub_unit_name?.trim() || t("retail.unitSingle", "مفرد");
  return p?.sold_by_weight ? t("retail.unitKg", "كغ") : t("retail.unitBox", "علبة");
}
/** رصيدٌ بإشارته **ووحدة المخزون** («−0.002 علبة»، «−0.3 كغ»): الخادمُ يرجع الرصيدَ بوحدة المخزون (negatives وstock_after)، وبعد
 *  «انخصم 2 مل» كان رقمٌ عارٍ يُقرأ ملاً — −0.002 علبة هي −1 مل — كما قالت الورقةُ «والرصيد صار -0.04 علبة» منذ الجولة الأولى. */
const stockSaid = (t: TFunction, n: number, p: Product | undefined): string => `${signed(n)} ${unitWord(t, p, "stock")}`;
const qtyText = (t: TFunction, qm: bigint, unit: Unit, p: Product | undefined): string => `${formatQty(fromScaled(qm, 3))} ${unitWord(t, p, unit)}`;
/** مقدارٌ بوحدة المخزون (بالمليار) يُقال بالصغيرة إن كانت (٠٫٠٠٤ علبة = ٢ مل) — وإلا بالعلبة. */
function nanoText(t: TFunction, dN: bigint, p: Product | undefined): string {
  const upb = p ? subUnitMilli(p) : null;
  return upb !== null ? qtyText(t, roundDiv(dN * upb, NANO), "sub", p) : qtyText(t, roundDiv(dN, 1_000_000n), "stock", p);
}
const newRef = (): string => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** دفعاتُ `?at=` (µs منذ ١٩٧٠، أعدادٌ صحيحة بفواصل — يكتبها إشعارُ «رجّعنا مستهلكات» لفعله): null لرابطٍ قديم بلاها
 *  (الفاتورةُ كلُّها). وقائمةٌ فيها ما ليس عدداً تُبطَل كلُّها: مجموعةٌ فارغة لا تطابق الدفتر («الرابط ما يطابق»، inLedger)
 *  ولا تعبّي شيئاً — لا رجوعَ للتراكميّ. */
function batchesOf(at: string | null): ReadonlySet<number> | null {
  if (at === null) return null;
  const xs = at.split(",");
  return new Set(xs.every((x) => /^\d{1,16}$/.test(x)) ? xs.map(Number) : []);
}
const num = (x: unknown): boolean => (typeof x === "number" || (typeof x === "string" && x.trim() !== "")) && Number.isFinite(Number(x));
/** العقدُ الجديد حاضرٌ بالجواب: now_us، وwaste، وmoves لكلّ مواصفة. غيابُه خادمٌ أقدم أو جوابٌ ناقص — فشلُ قراءةٍ
 *  يُقال «أعد المحاولة»، لا «ماكو مواد رجعت» يُصدَّق، ولا تعبئةٌ تتجاهل ما سُجّل هدراً. ومثلُه ما يُقرأ من القديم:
 *  items (الخادمُ يكتبها {} ولا يُسقطها) وlive_qty/restored_qty لكلّ مواصفة — كان `items ?? {}` يقول عن جوابٍ بلاها
 *  «ماكو مواد رجعت»، و`Number(…) || 0` يُسقط من الرابط القديم مادةً رجعت كأنها صفر بلا كلمة (قائمةٌ ناقصة تُصدَّق). */
function shaped(e: InvoiceConsumption): boolean {
  const items: unknown = e.items;
  return num(e.now_us) && Array.isArray(e.waste)
    && e.waste.every((w) => !!w && (w.product_id === null || typeof w.product_id === "string")
      && (w.batches === null || (Array.isArray(w.batches) && w.batches.length > 0 && w.batches.every(num))))
    && !!items && typeof items === "object" && !Array.isArray(items)
    && Object.values(e.items).every((specs) => Array.isArray(specs)
      && specs.every((s) => !!s && num(s.live_qty) && num(s.restored_qty) && Array.isArray(s.moves) && s.moves.every((m) => !!m && num(m.at_us) && num(m.qty))));
}
/** كلُّ دفعات الرابط بدفتر الفاتورة؟ إشعارُ «رجّعنا» يكتبها من أحداثها، والدفترُ لا يُمحى (invoice_consumption بمراجعَ
 *  ليّنة، 0252) — فدفعةٌ لا حدثَ لها رابطٌ تالف أو مقطوع (أو قائمةٌ بطلت، أو ذيلٌ قُصّ): ما نعرف شنو رجّع ذلك الفعل،
 *  و«ماكو مواد رجعت» عنه صفرٌ عن مجهول (كالفاتورة المجهولة)، وتعبئةُ ما طابق وحده تُسقط ما لم يطابق بصمت. */
function inLedger(e: InvoiceConsumption, b: ReadonlySet<number>): boolean {
  const seen = new Set<number>();
  for (const specs of Object.values(e.items)) for (const s of specs) for (const m of s.moves ?? []) seen.add(Number(m.at_us));
  return b.size > 0 && [...b].every((x) => seen.has(x));
}

/** فاتورةٌ رجعت موادُّ خدماتها ← سطورُ سند، لكلّ مادةٍ مقدارُها بالمليار:
 *  • **بدفعات الفعل (`at`)**: −Σ qty لأحداث مواصفاتها بتلك الدفعات. كلُّ أحداث الفعل الواحد تحمل at_us نفسه، فصرفُ
 *    relink بالدفعة نفسها (التعديلُ يردّ السطورَ كلَّها ثم يصرفها من جديد) يطرح نفسه — وتعديلٌ زاد سطراً لا يعبّي شيئاً.
 *    restored_qty تراكميٌّ منذ البيعة: ترجيعٌ ثانٍ على الفاتورة (مرتجعٌ جزئيّ ثم ترجيع، أو تعديلان) كان يعيد تعبئة ما
 *    رجّعه الأوّل — مقيس بالتجريبيّ: زوجان ثم أربعة — ولعلّه سُجّل هدراً فيُشطب مرّتين.
 *  • **بلا دفعات (رابطٌ قديم)**: كما كان — ما نزلت عنه مواصفاتُ البيعة (restored_qty) ناقصَ ما صرفه التعديلُ من جديد
 *    (live_qty لمواصفات relink، _consumption_relink 0252): جمعُ restored_qty وحده عبّى بعد تعديلٍ موادَّ كلِّ السطور.
 *  وما سُجّل هدراً من الفاتورة (waste، معلَّقاً أو مطبَّقاً) لا يُعبّأ ثانيةً: بالدفعات مادةٌ لها سطرٌ تتقاطع دفعاتُه مع
 *  الرابط (سطرٌ عُبّي من دفعتين يُرى من أيٍّ منهما) — أو سطرٌ عُبّي من الفاتورة كلِّها (batches null) سُجّل بعد أقدم دفعةٍ رجعت فيها: التراكميُّ شمل كلَّ ما رجع قبله، وتجاوزُه
 *  كان يعبّي ما شُطب مرّةً ثانية؛ ودفعةٌ بعده لم يشملها فتُعبّأ — وبلا دفعات مادةٌ لها سطرٌ من الفاتورة بأيّ دفعة؛
 *  تُقال باسمها. والمجموعُ لكلّ مادة (الخادمُ يرفض المادةَ مرّتين بسند)، بالصغيرة
 *  إن كتبتها مواصفةٌ رجعت بها أو لم يُكتب المقدارُ بثلاث منازل علبة، وإلا بالعلبة؛ والكميةُ بقاسم المادة **الآن**
 *  (units_per_box) — به يقسم الخادمُ فيرجع d = ما رجع بالضبط. والسطرُ يحمل مرجعَه: الفاتورة، وكلَّ دفعةٍ من الرابط
 *  رجعت فيها المادة. وما لا يُكتب يُقال باسمه وسببه (محذوفة، حوض، حقل، أصغر من منزلة) — لا يسقط بصمت. */
/** وقتُ تسجيل سطر الهدر بالمللي (counted_at = now() الخادم؛ Date.parse يقطع ما دون المللي كقسمة الخادم ÷ ١٠٠٠) — وما لا
 *  يُقرأ وقتُه يُعدّ بعد كلّ دفعة: شملها. */
const msOf = (w: InvoiceWasteRow): number => { const x = Date.parse(w.counted_at); return Number.isFinite(x) ? x : Infinity; };
function planFromInvoice(entry: InvoiceConsumption, byId: ReadonlyMap<string, Product>, note: string, inv: string, batches: ReadonlySet<number> | null):
  { lines: Draft[]; skipped: Skip[]; already: Already[] } {
  const sum = new Map<string, { name: string; r: bigint; sub: boolean; per: Map<number, bigint> }>();
  for (const specs of Object.values(entry.items ?? {})) {
    for (const s of specs) {
      const key = s.product_id ?? `?${s.product_name}`;
      const g = sum.get(key) ?? { name: s.product_name, r: 0n, sub: false, per: new Map<number, bigint>() };
      sum.set(key, g);
      if (batches) {
        let net = 0n;
        for (const m of s.moves ?? []) {
          const at = Number(m.at_us);
          if (!batches.has(at)) continue;
          const back = -roundScaled(m.qty, 9);   // الدفترُ: صرفٌ موجب وإرجاعٌ سالب — فما رجع = −qty
          net += back;
          g.per.set(at, (g.per.get(at) ?? 0n) + back);
        }
        g.r += net;
        if (net > 0n) g.sub ||= s.unit === "sub";
        continue;
      }
      // relink: ما صرفه التعديلُ من جديد (حيُّه يُطرح)؛ وغيرُه: ما نزلت عنه مواصفةُ البيعة (يُجمع).
      const relink = s.source === "relink";
      const r = roundScaled(Number(relink ? s.live_qty : s.restored_qty) || 0, 9);
      if (r <= 0n) continue;
      if (relink) g.r -= r;
      else { g.r += r; g.sub ||= s.unit === "sub"; }
    }
  }
  // لكلّ مادةٍ أحدثُ سطرٍ سُجّل منها: بدفعات الرابط إن كانت، وإلا بأيّ دفعة (أو بلا دفعة: سندُ الفاتورة كلِّها).
  // وبالدفعات، أحدثُ سطرٍ عُبّي من الفاتورة كلِّها على حدة (`whole`) — يُقاس بوقته على دفعات المادة أدناه.
  const recorded = new Map<string, InvoiceWasteRow>(), whole = new Map<string, InvoiceWasteRow>();
  for (const w of entry.waste ?? []) {
    if (!w.product_id) continue;
    const k = w.product_id.toLowerCase();
    if (batches && !(w.batches !== null && w.batches.some((b) => batches.has(Number(b))))) {
      if (w.batches === null && msOf(w) >= msOf(whole.get(k) ?? w)) whole.set(k, w);
      continue;
    }
    const cur = recorded.get(k);
    if (!cur || (Date.parse(w.counted_at) || 0) > (Date.parse(cur.counted_at) || 0)) recorded.set(k, w);
  }
  const lines: Draft[] = [], skipped: Skip[] = [], already: Already[] = [];
  for (const [id, g] of sum) {
    if (g.r <= 0n) continue;   // رجع ثم انصرف من جديد بالتعديل: ما رجع شي
    const p = byId.get(id);
    const k = id.toLowerCase();
    let w = recorded.get(k), fromInv = !batches;
    const wh = whole.get(k);
    if (!w && wh) {
      // أقدمُ دفعةٍ من الرابط رجعت فيها المادة — بالعدد الصحيح (µs ÷ ١٠٠٠ بالمللي، بلا عائم): سندُ الفاتورة كلِّها سُجّل
      // بعدها أو بمللّيها شملها، فلا تُعبّأ (المادةُ كلُّها، أقلُّ لا أكثر — يُقال باسمه)؛ وسُجّل قبلها: ما شملها.
      let first: number | null = null;
      for (const [at, v] of g.per) if (v > 0n && (first === null || at < first)) first = at;
      if (first !== null && BigInt(first) / 1000n <= msOf(wh)) { w = wh; fromInv = true; }
    }
    if (w) { already.push({ id, name: p?.name ?? g.name, at: w.counted_at, inv: fromInv }); continue; }
    if (!p) { skipped.push({ name: g.name, why: "gone" }); continue; }
    if (p.pooled) { skipped.push({ name: p.name, why: "pooled" }); continue; }
    if (p.farm_id) { skipped.push({ name: p.name, why: "farm" }); continue; }
    const upb = subUnitMilli(p);
    const asSub = upb !== null && (g.sub || g.r % 1_000_000n !== 0n);
    const qm = asSub ? roundDiv(g.r * upb!, NANO) : roundDiv(g.r, 1_000_000n);
    if (qm <= 0n) { skipped.push({ name: p.name, why: "tiny" }); continue; }
    // كلُّ دفعةٍ من الرابط رجعت فيها هذه المادةُ شيئاً، تصاعدياً — بلا دفعات (رابطٌ قديم) لا شيء.
    const mine = [...g.per].filter(([, v]) => v > 0n).map(([at]) => at).sort((a, b) => a - b);
    lines.push({ id, name: p.name, unit: asSub ? "sub" : "stock", qty: String(fromScaled(qm, 3)), reason: "damaged", note, ack: null, src: { inv, batches: mine.length ? mine : null } });
  }
  return { lines, skipped, already };
}

/** مرآةُ waste_source_taken (0254 stock_waste_submit) لسطرٍ عُبّي من فاتورة: بها يرفض الخادمُ، فبها وحدها يُحكم بعد رفضه. سطرُ هدرٍ
 *  معلَّقٌ أو مطبَّق (waste لا يرجع غيرَهما) من هالفاتورة لهالمادّة — والسطرُ بلا دفعات (رابطٌ قديم) يكفيه أيُّ سطرٍ منها؛ وبدفعات: سطرٌ
 *  تتقاطع دفعاتُه معها، أو سطرُ الفاتورة كلِّها سُجّل بعد أقدمها أو بمللّيها (شملها). لا صافيَ رجوعٍ هنا ولا تعبئة: planFromInvoice
 *  تتخطّى مادّةً صافيها ≤ ٠ قبل أن تنظر بما سُجّل (ما لم يرجع لا يُعبّأ) — فتعديلٌ رفع سطرَ الخدمة بعد التعبئة (relink حيُّه أكبر)
 *  كان يُبقي المادّةَ بالسند والخادمُ يرفضها مع كلّ إرسال للأبد (مقيسٌ بالتجريبيّ). يرجع أحدثَ ما طابق (به يُقال وقتُه)، و`inv` لسطرٍ
 *  بلا دفعات أو حين طابقه سندُ الفاتورة كلِّها وحده — كقول التعبئة. */
function takenBy(entry: InvoiceConsumption, id: string, name: string, batches: ReadonlySet<number> | null): Already | null {
  const k = id.toLowerCase();
  let first: number | null = null;
  if (batches) for (const b of batches) if (first === null || b < first) first = b;
  let hit: InvoiceWasteRow | null = null, whole: InvoiceWasteRow | null = null;
  for (const w of entry.waste) {
    if (!w.product_id || w.product_id.toLowerCase() !== k) continue;
    if (!batches || (w.batches !== null && w.batches.some((x) => batches.has(Number(x))))) {
      if (!hit || msOf(w) > msOf(hit)) hit = w;
    } else if (w.batches === null && first !== null && BigInt(first) / 1000n <= msOf(w)) {
      // بالعدد الصحيح كالخادم: _cons_at_us(counted_at) / 1000 >= min(دفعات السطر) / 1000 — لا عائم.
      if (!whole || msOf(w) > msOf(whole)) whole = w;
    }
  }
  const w = hit ?? whole;
  return w ? { id, name, at: w.counted_at, inv: !batches || !hit } : null;
}

/** حالُ تعبئة الرابط: `n` ما أُضيف فعلاً، و`kept` موادُّ رجعت وسطورُها بالسند قبلها (بقيت كمياتُها). */
interface Fill { key: string; id: string; at: string | null; st: "loading" | "error" | "unknown" | "bad" | "done"; n: number; skipped: Skip[]; already: Already[]; kept: Kept[] }

/** يضمّ تعبئةَ الرابط إلى المسودّة **كما هي ساعةَ الضمّ** (لا كما كانت ساعةَ الطلب): مادةٌ ليست بالسند تُضاف بسطرها؛ ومادةٌ
 *  فيه (كُتبت والقراءةُ بالطريق، أو بعد فشلٍ فإعادة) يبقى سطرُها — ما كُتب لا يُمسح — ويأخذ مرجعَ الترجيع إن لم يحمل مرجعاً
 *  (فيرجع بـwaste، ولا يعبّيه رابطٌ لاحق ثانيةً: سقوطُ سطر التعبئة بصمت كان يُرسلها بلا مرجع)، وما لم يُكتب فيه يأخذ قيمةَ
 *  التعبئة: كميةٌ فارغة تأخذ كميتَها ووحدتها (فيُعدّ معبّأً)، وملاحظةٌ فارغة ملاحظتَها؛ وكميةٌ مكتوبة تبقى ويُقال ما رجع
 *  (`kept`). و`added` ما أُضيف أو عُبّي فعلاً — «عبّينا N» كان يعدّ ما سقط. والمرجعُ يصحّ للخادم: نفسُ المادة ونفسُ أحداثها. */
function mergePlan(cur: readonly Draft[], plan: readonly Draft[], key: string): { lines: Draft[]; added: number; kept: Kept[] } {
  const lines = [...cur], kept: Kept[] = [];
  let added = 0;
  for (const l of plan) {
    const seed: Seed = { key, unit: l.unit, qty: l.qty, reason: l.reason, note: l.note };
    const i = lines.findIndex((c) => c.id === l.id);
    if (i < 0) { lines.push({ ...l, seed }); added++; continue; }
    const c = lines[i];
    const typed = c.qty.trim() !== "";
    lines[i] = { ...c, unit: typed ? c.unit : l.unit, qty: typed ? c.qty : l.qty, ack: typed ? c.ack : null, note: c.note.trim() ? c.note : l.note, src: c.src ?? l.src, seed };
    if (typed) kept.push({ id: l.id, name: l.name, unit: l.unit, qty: l.qty }); else added++;
  }
  return { lines, added, kept };
}

/** المسودّةُ وحالُ التعبئة بحالةٍ واحدة: ضمُّ التعبئة يقرأ السطورَ كما هي **ساعةَ الضمّ** ويكتب «عبّينا N» من الضمّ نفسه — حالتان
 *  منفصلتان كانتا تحسبان العددَ من لقطةٍ قد تسبقها ضغطةٌ لم تُرسَم. ونتيجةُ قراءةٍ لا تُكتب إلا على رابطها وهو ينتظر:
 *  جوابُ رابطٍ سابق (العنوانُ تبدّل والقراءةُ بالطريق) لا يُضمّ إلى سند رابطٍ لاحق. */
type Act = { k: "lines"; f: Draft[] | ((cur: Draft[]) => Draft[]) } | { k: "fill"; v: Fill } | { k: "plan"; v: Fill; lines: Draft[] }
  | { k: "taken"; drop: ReadonlyMap<string, Already>; sent: readonly string[] } | { k: "untaken" };
/** والثالثُ `taken`: سطورٌ شالها رفضُ waste_source_taken (بعد إعادة القراءة) — تُقال باسمها حتى يُسجَّل السند، أو يُفرغه صاحبُه، أو
 *  يبدأ رابطٌ آخر. و`left` موادُّ ذلك السند المرفوض الباقيةُ فيه: بها وحدها يُقال «الباقي ما انسجل بعد، أرسله مرّة ثانية» — كانت
 *  الجملةُ تقف فوق سطرٍ أُضيف بعدها (بحثٌ، ?p=، رابطٌ آخر) ما أُرسل قطّ. و`emptied` عدّادُ مرّاتٍ أفرغت فيها إعادةُ القراءة السندَ كلَّه. */
interface Box { lines: Draft[]; fill: Fill | null; taken: Already[]; left: string[]; emptied: number }
/** مرجعُ سطرٍ عُبّي من فاتورة (المادةُ والفاتورةُ ودفعاتُه): به يُطابَق حكمُ إعادة القراءة بالسطر نفسِه ساعةَ الشيل. */
const srcKey = (id: string, src: NonNullable<Draft["src"]>): string => `${id.toLowerCase()}|${src.inv}|${src.batches?.join(",") ?? ""}`;
function draftBox(s: Box, a: Act): Box {
  if (a.k === "lines") {
    const lines = typeof a.f === "function" ? a.f(s.lines) : a.f;
    return lines === s.lines ? s : { ...s, lines };
  }
  // ما قالت إعادةُ القراءة إنه سُجّل يُشال من السند **كما هو ساعةَ الشيل** (سطرٌ أُضيف والقراءةُ بالطريق يبقى، وسطرٌ تبدّل مرجعُه
  // لا يُطابَق) — وكلُّ ما شيل يُقال باسمه (taken)؛ لا شيلَ بلا كلمة.
  if (a.k === "taken") {
    const gone: Already[] = [];
    const lines = s.lines.filter((d) => { const w = d.src ? a.drop.get(srcKey(d.id, d.src)) : undefined; if (w) gone.push(w); return !w; });
    if (!gone.length) return s;
    return { ...s, lines,
      taken: [...s.taken.filter((x) => !gone.some((g) => g.id === x.id)), ...gone],
      left: lines.filter((d) => a.sent.includes(d.id)).map((d) => d.id),
      emptied: lines.length ? s.emptied : s.emptied + 1 };
  }
  if (a.k === "untaken") return s.taken.length || s.left.length ? { ...s, taken: [], left: [] } : s;
  const mine = s.fill?.key === a.v.key && s.fill.st === "loading";
  // رابطٌ آخر يبدأ يعبّي: ملاحظةُ الشيل عن سندٍ سابق تغيب معه — كانت «"Lyse" سجّلتها هدر… والباقي ما انسجل بعد» تقف فوق تعبئةٍ جديدة.
  // وإعادةُ الرابط نفسه بعد فشل قراءته (المفتاحُ نفسُه) لا تمسّها.
  if (a.k === "fill") {
    if (!(a.v.st === "loading" || mine)) return s;
    return a.v.st === "loading" && s.fill?.key !== a.v.key ? { ...s, fill: a.v, taken: [], left: [] } : { ...s, fill: a.v };
  }
  if (!mine) return s;
  const m = mergePlan(s.lines, a.lines, a.v.key);
  return { ...s, lines: m.lines, fill: { ...a.v, n: m.added, kept: m.kept } };
}

export interface WasteTabProps {
  /** موادُّ العيادة كلُّها (repo.listProducts: كلُّ الصفحات، ترمي) — null والصفحةُ تُحمَّل أو فشلت. */
  products: Product[] | null;
  /** فشلَ تحميلُ الصفحة: «أعد المحاولة» لا مسودّةٌ على قائمةٍ مجهولة. */
  failed: boolean;
  /** موادُّ عليها جردٌ أو سندٌ ينتظر — معلَّقٌ واحدٌ لكلّ مادة، والخادمُ يرفض الثاني (waste_already_pending). */
  pendingIds: ReadonlySet<string>;
  /** المديرُ (ومفتاحُه): «سجّل وطبّق»؛ وغيرُه «أرسل للمدير». */
  isManager: boolean;
  /** can("viewProfits") && !restricted */
  showCost: boolean;
  /** تحميلُ الصفحة من جديد — بعد الإرسال، أو رفضٍ يقول إن البيانات تحرّكت. */
  onChanged: () => void | Promise<void>;
  /** عددُ سطور المسودّة كلّما تغيّر — لتقول الصفحةُ «سندك محفوظ» حين تنتهي صلاحيةُ الرفع والتبويبُ باقٍ مخفياً. */
  onDraft?: (n: number) => void;
}

export default function WasteTab({ products, failed, pendingIds, isManager, showCost, onChanged, onDraft }: WasteTabProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const inv = params.get("inv"), at = params.get("at"), pick = params.get("p");
  /** الرابطُ الذي يُعبّأ منه: الفاتورةُ ودفعاتُها — مرّةً لكلّ رابط. */
  const fillKey = inv ? `${inv}|${at ?? ""}` : null;
  const [box, dispatch] = useReducer(draftBox, { lines: [], fill: null, taken: [], left: [], emptied: 0 });
  const { lines, fill, taken, left, emptied } = box;
  const setLines = useCallback((f: Draft[] | ((cur: Draft[]) => Draft[])) => dispatch({ k: "lines", f }), []);
  const setFill = useCallback((v: Fill) => dispatch({ k: "fill", v }), []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  /** سطورٌ سُئل عنها «فوق الرصيد» بآخر ضغطة إرسال. */
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState<Done | null>(null);
  /** مفتاحُ الرابط الذي شيل منه سطرُ تعبئة — ما دام بالعنوان ترجعه إعادةُ التحميل ممتلئاً. */
  const [cut, setCut] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<Skip | null>(null);
  const pickedRef = useRef<string | null>(null);
  const refRef = useRef<string | null>(null);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  /* سندٌ لم يُرسل يمسك النسخةَ الجديدة **بما تضيّعه إعادةُ التحميل** (كعدّ اليوم: بمحتواه لا بوجود السطر). سطرٌ كُتبت فيه كميةٌ أو
     ملاحظة؛ أو سطرُ تعبئةٍ تغيّر عمّا عبّاه الرابط (وحدةً أو كميةً أو سبباً أو ملاحظة) أو لم يعد رابطُه بالعنوان؛ أو سطرُ تعبئةٍ شيل
     والرابطُ باقٍ — إعادةُ التحميل ترجعه ممتلئاً فيُرسَل ما استثناه المدير. وتعبئةٌ كما هي والرابطُ بالعنوان، أو سطرٌ لم يُكتب
     فيه (اختيارُ ?p=، أو مادةٌ من البحث)، تبنيه إعادةُ التحميل كما هو — كان وجودُه يمسك بلا سقفٍ ولا عملٍ يُرى. */
  const worked = (d: Draft): boolean => (d.seed
    ? !(d.seed.key === fillKey && d.unit === d.seed.unit && d.qty === d.seed.qty && d.reason === d.seed.reason && d.note === d.seed.note)
    : d.qty.trim() !== "" || d.note.trim() !== "");
  const dirty = lines.some(worked) || (cut !== null && cut === fillKey);
  useEffect(() => (dirty ? holdUpdates(Infinity) : undefined), [dirty]);
  useEffect(() => { onDraft?.(lines.length); }, [lines.length, onDraft]);
  // فُكّ التبويب (خطأُ رسمٍ أمسكه LoadBoundary): لا «سندك محفوظ» عن مسودّةٍ ضاعت معه.
  useEffect(() => () => onDraft?.(0), [onDraft]);

  const add = useCallback((p: Product) => {
    setLines((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, { id: p.id, name: p.name, unit: "stock", qty: "", reason: "damaged", note: "", ack: null, src: null }]));
    setDone(null);
  }, []);
  const dropParams = () => {
    if (!inv && !pick && at === null) return;
    setParams((cur) => { const n = new URLSearchParams(cur); n.delete("inv"); n.delete("at"); n.delete("p"); return n; }, { replace: true });
  };

  /* `?inv=` (و`&at=`): مرّةً لكلّ رابط، بعد وصول الموادّ — والفشلُ (أو شكلٌ ناقص) بطاقةُ إعادةٍ بلا سطرٍ واحد. */
  const prefill = useCallback(async (id: string, batchList: string | null, list: Product[]) => {
    const base = { key: `${id}|${batchList ?? ""}`, id, at: batchList, n: 0, skipped: [] as Skip[], already: [] as Already[], kept: [] as Kept[] };
    setFill({ ...base, st: "loading" });
    try {
      const map = await consumptionApi.invoiceConsumption([id]);
      // فاتورةٌ لا يعرفها الخادمُ بهذه العيادة (أو حُذفت بلا دفتر) لا ترجع بالجواب: «ما لكيناها» لا «ماكو مواد
      // رجعت» — المجهولُ ليس صفراً. والمفتاحُ نصُّ uuid بحروفٍ صغيرة كما يكتبه الخادم (وبه يُرسل مرجعُ السطر).
      const key = map[id] ? id : id.toLowerCase();
      const entry = map[key];
      if (!entry) { setFill({ ...base, st: "unknown" }); return; }
      if (!shaped(entry)) { setFill({ ...base, st: "error" }); return; }
      // دفعاتٌ لا حدثَ لها بالدفتر (تالفةٌ أو مقطوعة): «ما نعرف شنو رجع» — لا «ماكو مواد رجعت» ولا رجوعَ للتراكميّ.
      const batches = batchesOf(batchList);
      if (batches && !inLedger(entry, batches)) { setFill({ ...base, st: "bad" }); return; }
      const plan = planFromInvoice(entry, new Map(list.map((p) => [p.id, p])), t("cnt.waste.invNote", { no: invoiceNo(id), defaultValue: "مواد خدمة مرجّعة — فاتورة {{no}}" }), key, batches);
      // الضمُّ على المسودّة كما هي ساعتَه (draftBox/mergePlan): مادةٌ كُتبت والقراءةُ بالطريق تبقى بكميتها وتأخذ مرجعَ الترجيع،
      // و«عبّينا N» ما أُضيف فعلاً — كان سطرُ التعبئة يسقط بصمت فتُرسَل المادةُ بلا مرجع ويعبّيها رابطٌ لاحق مرّةً ثانية.
      dispatch({ k: "plan", v: { ...base, st: "done", skipped: plan.skipped, already: plan.already }, lines: plan.lines });
      setDone(null);
    } catch {
      setFill({ ...base, st: "error" });
    }
  }, [t, setFill]);
  useEffect(() => {
    if (!inv || !products || fill?.key === fillKey) return;
    void prefill(inv, at, products);
  }, [inv, at, fillKey, products, fill, prefill]);

  /* `?p=`: مادةٌ مختارة من المخزون — تُضاف، أو يُقال لماذا لا تُسجَّل هنا. */
  useEffect(() => {
    if (!pick || !products || pickedRef.current === pick) return;
    pickedRef.current = pick;
    const p = products.find((x) => x.id === pick);
    if (!p) setPickNote({ name: "", why: "gone" });
    else if (!countable(p)) setPickNote({ name: p.name, why: p.pooled ? "pooled" : "farm" });
    else { setPickNote(null); add(p); }
  }, [pick, products, add]);

  const results = useMemo(() => {
    const s = searchable(q.trim());
    if (!products || s.length < 2) return { list: [] as Product[], more: 0 };
    /* الطرفان من نفس الدالّة (CLAUDE.md §٣): الاسمُ بـsearchable، والرمزُ بمصدره الواحد codeMatcher (matchCode: طيُّ
       الحالة «w90» = «W90»، وجزءُ الرمز الأساسيّ أو الإضافيّ كالبيع والمحرّر) — كان === بلا طيّ ولا جزء، فرقمُ رفٍّ
       بحروفٍ صغيرة أو أربعُ خاناتٍ من باركود لا تلقى مادةً برفّها، و«ماكو» يُصدَّق. */
    // 0267: ورمزُ الكارتون أو المغلّف يلقى مادّتَه (كبحث المخزون) — مسحُ الكارتون بالرفّ كان «ماكو». العددُ بوحدة الرصيد كما هو.
    const byLevel = levelMatcher(q);
    const byCode = codeMatcher(q);
    const all = products.filter((p) => countable(p) && !lines.some((l) => l.id === p.id) && (searchable(p.name).includes(s) || byCode(p) || !!byLevel(p)));
    /* رمزٌ كُتب كاملاً («47» رقمُ رفّ) لا يضيّقه حرفٌ آخر: مطابقُه بالضبط (الأساسيُّ أو الإضافيّ، بالتطبيع نفسه) أوّلاً — الجزئيُّ
       كان يدفعه خلف باركوداتٍ تحويه فقط فيسقط خارج السقف. والسقفُ يقول إنه سقف: «و٤ غيرها — اكتب أكثر» (كالورقة والبيع)؛
       قائمةٌ قُصّت بصمت تُصدَّق «ماكو» فيُختار أقربُ اسم أو تُدخل المادةُ ثانيةً. */
    const c = matchCode(q);
    const exact = (p: Product) => !!c && (matchCode(p.barcode) === c || (p.alt_codes ?? []).some((a) => matchCode(a) === c));
    const ranked = [...all.filter(exact), ...all.filter((p) => !exact(p))];
    return { list: ranked.slice(0, PICK_MAX), more: Math.max(0, ranked.length - PICK_MAX) };
  }, [q, products, lines]);

  const setLine = (id: string, patch: Partial<Draft>) => setLines((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => {
    playTap();
    const gone = lines.find((x) => x.id === id);
    const next = lines.filter((x) => x.id !== id);
    // بالمسودّة كما هي ساعةَ الكتابة لا بلقطة الرسم: تعبئةٌ وصلت بنفس اللحظة لا تُمحى بشيل سطرٍ آخر.
    setLines((cur) => cur.filter((x) => x.id !== id));
    // سطرُ تعبئةٍ شيل والرابطُ باقٍ بالعنوان: إعادةُ التحميل ترجعه ممتلئاً — عملٌ يمسك (والسندُ كلُّه شيل: الرابطُ يُشال معه).
    if (gone?.seed && gone.seed.key === fillKey) setCut(fillKey);
    if (!next.length) { refRef.current = null; setAsked(new Set()); dropParams(); }
    // والسندُ فرغ بيد صاحبه: ملاحظةُ الشيل عن سندٍ لم يعد تغيب معه — كانت تبقى فوق سندٍ فارغ والعنوانُ بلا رابط.
    if (!next.length) dispatch({ k: "untaken" });
  };
  /* وإعادةُ القراءة أفرغت السندَ كلَّه (كلُّ ما فيه سجّله غيرُنا): يُشال الرابطُ ومرجعُ السند وأسئلتُه كما مع كلّ سندٍ فرغ (آخرُ سطرٍ شيل
     باليد، أو انسجل) — بطاقةُ «عبّينا N … راجع الكميات وسجّل» كانت تبقى فوق سندٍ فارغ وزرٍّ مقفول. وملاحظةُ الشيل تبقى: تقول ما شيل
     ولماذا (لا شيلَ بصمت). العنوانُ والرابطُ من رسمة الإفراغ نفسها. */
  useEffect(() => {
    if (!emptied) return;
    // ورابطٌ فُتح وتعبئتُه بالطريق لا يُشال: تصل ببطاقتها — شيلُه كان يضمّ سطورَها للسند بلا بطاقةٍ تقول من أين جاءت.
    if (fill?.st === "loading" && fill.key === fillKey) return;
    refRef.current = null; setAsked(new Set()); dropParams();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [emptied]);
  const skipText = (s: Skip) => s.why === "gone" ? t("cnt.waste.gone", { name: s.name, defaultValue: '"{{name}}" ما موجودة بالمخزن (انحذفت أو انطوت) — ما تنسجل' })
    : s.why === "pooled" ? t("cnt.waste.pooled", { name: s.name, defaultValue: '"{{name}}" رصيدها بمخزون القسم — ما تنسجل هنا' })
    : s.why === "farm" ? t("cnt.waste.farm", { name: s.name, defaultValue: '"{{name}}" رصيدها بمخزون الحقل — ما تنسجل هنا' })
    : t("cnt.waste.tiny", { name: s.name, defaultValue: '"{{name}}": اللي رجع أصغر من أصغر رقم ينكتب' });
  /** مادةٌ سُجّلت هدراً من هذا الترجيع (أو من الفاتورة، برابطٍ بلا دفعات) — بوقت أحدث سطرٍ لها. */
  const alreadyText = (a: Already): string => {
    const when = Number.isFinite(Date.parse(a.at)) ? `${formatDate(a.at, i18n.language)} ${formatTime(a.at, i18n.language)}` : "—";
    return a.inv ? t("cnt.waste.alreadyInv", { name: a.name, when, defaultValue: '"{{name}}" سجّلتها هدر قبل من هالفاتورة ({{when}}) — ما نعبّيها مرّة ثانية' })
      : t("cnt.waste.already", { name: a.name, when, defaultValue: '"{{name}}" سجّلتها هدر قبل لهالترجيع ({{when}}) — ما نعبّيها مرّة ثانية' });
  };
  /** مادةٌ رجعت وسطرُها بالسند قبل التعبئة: بقيت كميتُها هي (ومعها مرجعُ الترجيع) — ويُقال ما رجع منها بوحدة التعبئة. */
  const keptText = (k: Kept): string => {
    const p = byId.get(k.id);
    return t("cnt.waste.inDraft", { name: p?.name ?? k.name, qty: `${formatQty(Number(k.qty) || 0)} ${unitWord(t, p, k.unit)}`, defaultValue: '"{{name}}" موجودة بسندك — رجع منها {{qty}}، وخلّينا الكمية اللي كتبتها' });
  };
  /* عنوانُ التعبئة يتبع المعبّأَ والمتخطّى والمسجّلَ معاً: ما عُبّي ← «عبّينا N»؛ رجعت موادُّ ما عُبّي منها شي (حوض، محذوفة، أصغر
     من منزلة، أو سطرُها بالسند قبلها) ← «رجعت مواد … بس ما عبّينا منها شي — السبب تحت»؛ كلُّ ما رجع سُجّل قبل ولا غيره ← سطرٌ واحد؛
     ولا شيءَ رجع ← «ماكو». كان «ماكو مواد رجعت» فوق سطرٍ يسمّي مادةً رجعت، و«اللي رجعت سجّلتها هدر قبل» فوق مادةٍ ما سُجّلت —
     والمسجّلةُ لا تُقال باسمها إلا بجانب معبّأ. */
  const head: "filled" | "held" | "all" | "empty" = !fill ? "empty" : fill.n > 0 ? "filled"
    : fill.skipped.length + fill.kept.length > 0 ? "held" : fill.already.length > 0 ? "all" : "empty";
  /** الرصيدُ بوحدة السطر — بالصغيرة round(stock × units_per_box, 3) كتلميح الخادم. */
  const stockText = (p: Product, unit: Unit): string => {
    const upb = subUnitMilli(p);
    if (unit === "sub" && upb !== null) {
      const m = roundDiv((stockN(p) / 1_000_000n) * upb, 1000n);
      return `${signed(fromScaled(m, 3))} ${unitWord(t, p, "sub")}`;
    }
    return `${signed(Number(p.stock) || 0)} ${unitWord(t, p, "stock")}`;
  };

  /* رفضُ waste_source_taken: ما عُبّي من فاتورةٍ سجّله غيرُنا قبلنا — تبويبٌ أو جهازٌ ثانٍ، أو مسودّةٌ قديمة — والخادمُ يرفض السندَ كلَّه
     قبل أيّ كتابة. كان التلميحُ يُقال والسطرُ يبقى بالسند يُرسَل ويُرفض للأبد، والباقي معه. فتُقرأ الفاتورةُ من جديد (قراءةُ التعبئة
     نفسُها) ويُحكم كلُّ سطرٍ بمرجعه **بقاعدة الخادم** (takenBy) — لا بالتعبئة: تعديلٌ بعدها رفع سطرَ الخدمة فصار صافيها ≤ ٠ وتخطّتها
     التعبئةُ قبل أن تنظر بما سُجّل، والخادمُ يرفضها — فما سُجّل يُشال ويُقال باسمه ووقته بجملة التعبئة، والباقي يبقى ويُقال إنه ما انسجل.
     وكلُّ فاتورةٍ تحكم سطورَها وحدها (سطرٌ من فاتورةٍ ثانية لا يُحكم بسجلّ الأولى). وقراءةٌ فشلت أو شكلٌ ناقص أو فاتورةٌ غابت: لا شيءَ
     يُشال (المجهولُ لا يُحكم، والتلميحُ قيل)، وبمهلةٍ — الإرسالُ مقفولٌ حتى تصل. */
  const dropTaken = async (sent: readonly Draft[]) => {
    const mine = sent.flatMap((d) => (d.src ? [{ d, src: d.src }] : []));
    const drop = new Map<string, Already>();
    await Promise.all([...new Set(mine.map((x) => x.src.inv))].map(async (id) => {
      let entry: InvoiceConsumption | undefined;
      try {
        const map = await withTimeout(consumptionApi.invoiceConsumption([id]));
        entry = map[id] ?? map[id.toLowerCase()];
      } catch { return; }
      if (!entry || !shaped(entry)) return;
      for (const { d, src } of mine) {
        const b = src.batches ? new Set(src.batches) : null;
        if (src.inv !== id || (b && !inLedger(entry, b))) continue;
        const a = takenBy(entry, d.id, byId.get(d.id)?.name ?? d.name, b);
        if (a) drop.set(srcKey(d.id, src), a);
      }
    }));
    if (drop.size) dispatch({ k: "taken", drop, sent: sent.map((d) => d.id) });
  };

  /** الإرسال. `extra`: تأكيدُ «فوق الرصيد» بهذه الضغطة نفسها (الحالةُ لم تُكتب بعد). */
  const send = async (extra: Readonly<Record<string, string>> = {}) => {
    if (!products || busy || !lines.length) return;
    const plan: { d: Draft; p: Product; r: Read; ack: boolean }[] = [];
    for (const d of lines) {
      const p = byId.get(d.id);
      if (!p) { playWarning(); toast.error(t("cnt.waste.gone", { name: d.name, defaultValue: '"{{name}}" ما موجودة بالمخزن (انحذفت أو انطوت) — ما تنسجل' })); return; }
      const r = readQty(d, p);
      if (!r) { playWarning(); toast.error(t("cnt.waste.badQty", { name: p.name, defaultValue: '"{{name}}": اكتب الكمية التالفة صح' })); return; }
      if (!d.note.trim()) { playWarning(); toast.error(t("cnt.waste.needNote", { name: p.name, defaultValue: '"{{name}}": اكتب شنو صار (مثلاً: وگعت وانكسرت)' })); return; }
      plan.push({ d, p, r, ack: d.ack === r.key || extra[d.id] === r.key });
    }
    // الضغطةُ الأولى فوق الرصيد لا ترسل شيئاً: كلُّ سطرٍ فوقه يسأل بمكانه، و«أي، سجّل» ترسله بتأكيده.
    const over = plan.filter((x) => !x.ack && overStock(x.r, x.p));
    setAsked(new Set(over.map((x) => x.d.id)));
    if (over.length) { playWarning(); return; }
    const payload: WasteLineInput[] = plan.map(({ d, r, ack }) => ({
      product_id: d.id, qty: fromScaled(r.qm, 3), unit: d.unit, reason: d.reason, note: d.note.trim(), ...(ack ? { ack_over: true } : {}),
      // سطرٌ عُبّي من فاتورة يحمل مرجعَها ودفعتَه: يحفظهما الخادمُ فيرجعان بـwaste، فلا يُعبّأ ما سُجّل مرّةً ثانية.
      ...(d.src ? { src_invoice: d.src.inv, ...(d.src.batches ? { src_batches: d.src.batches } : {}) } : {}),
    }));
    const sent: Sent[] = plan.map(({ d, p, r }) => ({ id: d.id, dN: r.dN, text: qtyText(t, r.qm, d.unit, p), reason: d.reason, zero: stockUnitCost(p) === 0n }));
    const ref = (refRef.current ??= newRef());
    setBusy(true);
    try {
      const res = await consumptionApi.submitWaste(payload, isManager, ref);
      playSuccess();
      refRef.current = null;
      setDone({ r: res, sent });
      dispatch({ k: "untaken" });
      // يُشال من المسودّة ما سجّله الخادمُ وحده: سطرٌ أُضيف والطلبُ بالطريق، أو إعادةٌ رجعت بنتيجة إرسالٍ سابق
      // (rpc_refs) قبل أن يُضاف — كان مسحُ المسودّة كلِّها يُسقطه بصمتٍ كأنه سُجّل.
      const recorded = new Set(res.lines.map((l) => l.product_id));
      setLines((cur) => cur.filter((x) => !recorded.has(x.id))); setAsked(new Set()); setQ("");
      dropParams();
      void onChanged();
    } catch (e) {
      playWarning(); toast.error(describeDbError(e, t));
      // الرصيدُ أو المعلَّقُ تحرّك من تحت الصفحة: تُحدَّث القائمةُ ويبقى السند — وفوق الرصيد يُسأل بعدها بمكانه.
      const code = e instanceof Error ? e.message : "";
      if (code === "waste_exceeds_stock") setAsked(new Set(lines.map((x) => x.id)));
      if (/^waste_(exceeds_stock|already_pending|product_missing|source_taken)$/.test(code)) void onChanged();
      // سجّله غيرُنا قبلنا: يُشال بعد إعادة القراءة ويُقال باسمه (dropTaken) — لا يبقى يُرسَل ويُرفض.
      if (code === "waste_source_taken") await dropTaken(plan.map((x) => x.d));
    } finally { setBusy(false); }
  };
  const confirmOver = (id: string) => {
    const d = lines.find((x) => x.id === id), p = byId.get(id);
    const r = d && p ? readQty(d, p) : null;
    if (!r) return;
    playTap();
    setLine(id, { ack: r.key });
    void send({ [id]: r.key });
  };

  const chip = (on: boolean) => cn("rounded-full px-3 py-1 text-xs font-bold transition", on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink");

  return (
    <div className="space-y-3" data-waste>
      <p className="text-xs text-ink-subtle">{t("cnt.waste.hint", "اللي انكسر أو انتهى أو استعملتوه داخل العيادة (مثل كفوف التنظيف): اختر المادة واكتب الكمية وشنو صار. ينخصم من المخزون وينسجل «سحب مخزن» — مو من الدرج.")}</p>

      {done && <WasteDone done={done} byId={byId} showCost={showCost} />}

      {fill && fill.key === fillKey && (fill.st === "loading" ? <Skeleton className="h-16 w-full rounded-2xl" />
        : fill.st === "error" ? (
          <div className="card space-y-3 p-6 text-center" data-waste-inv-failed>
            <p className="text-sm text-ink-muted">{t("cnt.waste.invFailed", "ما گدرنا نجيب مواد الفاتورة — ما نعبّي نص سند. المشكلة بالاتصال ولا شي ضاع.")}</p>
            <Button size="sm" variant="secondary" leftIcon={<RotateCw size={14} />} disabled={!products} onClick={() => { playTap(); if (products) void prefill(fill.id, fill.at, products); }} data-waste-inv-retry>{t("common.retry", "أعد المحاولة")}</Button>
          </div>
        ) : fill.st === "unknown" ? (
          <p className="rounded-xl bg-surface-2 p-3 text-xs font-semibold text-warn-700 dark:text-warn-200" data-waste-inv-unknown>{t("cnt.waste.invUnknown", { no: invoiceNo(fill.id), defaultValue: "فاتورة {{no}} ما لكيناها بهالعيادة — ما نعبّي منها شي" })}</p>
        ) : fill.st === "bad" ? (
          <p className="rounded-xl bg-surface-2 p-3 text-xs font-semibold text-warn-700 dark:text-warn-200" data-waste-inv-badlink>{t("cnt.waste.invBadLink", { no: invoiceNo(fill.id), defaultValue: "الرابط ما يطابق أي ترجيع بفاتورة {{no}} — ما نعرف شنو رجع للمخزن، فما نعبّي منه شي" })}</p>
        ) : (
          // break-words (يُورَث لكلّ سطر): اسمُ المادّة بيانُ مستخدمٍ بأيّ طول — لاتينيٌّ بلا فاصل (٤٨ حرفاً) كان يطلع ٥٤ بكسلاً من البطاقة
          // ويمرّر الصفحةَ ٣٨ بكسلاً على ٣٧٥ (مقيسٌ بالمتصفّح، r3).
          <div className="space-y-1 break-words rounded-xl bg-surface-2 p-3 text-xs" data-waste-inv>
            {/* كلُّ ما رجع سُجّل هدراً قبل ولا غيره: سطرٌ واحد يقولها — لا «ماكو رجع» (رجع وانسجل) ولا سندٌ فارغ. */}
            {head === "all"
              ? <p className="font-bold text-ink" data-waste-all-recorded>{t("cnt.waste.allRecorded", { no: invoiceNo(fill.id), defaultValue: "مواد فاتورة {{no}} اللي رجعت للمخزن سجّلتها هدر قبل — ما نعبّيها مرّة ثانية" })}</p>
              : <p className="font-bold text-ink">{head === "filled" ? t("cnt.waste.invFilled", { n: formatNum(fill.n), no: invoiceNo(fill.id), defaultValue: "عبّينا {{n}} مادة رجعت للمخزن من فاتورة {{no}} — راجع الكميات وسجّل" })
                : head === "held" ? t("cnt.waste.invHeld", { no: invoiceNo(fill.id), defaultValue: "رجعت مواد للمخزن من فاتورة {{no}} بس ما عبّينا منها شي — السبب تحت" })
                : t("cnt.waste.invEmpty", { no: invoiceNo(fill.id), defaultValue: "ماكو مواد خدمة رجعت للمخزن من فاتورة {{no}} — ما في شي ينسجل" })}</p>}
            {fill.kept.map((k, i) => <p key={`k:${i}`} className="font-semibold text-warn-700 dark:text-warn-200" data-waste-kept>{keptText(k)}</p>)}
            {/* المفتاحُ بالترتيب لا بالاسم: توأمان بنفس الاسم (مقيسان بالمخازن) مفتاحٌ مكرّر — React يُسقط أحدَهما أو يكرّره. */}
            {fill.skipped.map((s, i) => <p key={`s:${i}`} className="font-semibold text-warn-700 dark:text-warn-200" data-waste-skip>{skipText(s)}</p>)}
            {head !== "all" && fill.already.map((a, i) => <p key={`r:${i}`} className="font-semibold text-warn-700 dark:text-warn-200" data-waste-already>{alreadyText(a)}</p>)}
          </div>
        ))}
      {pickNote && <p className="break-words rounded-xl bg-surface-2 p-3 text-xs font-semibold text-warn-700 dark:text-warn-200" data-waste-pick>{pickNote.name ? skipText(pickNote) : t("cnt.waste.pickGone", "المادة اللي اخترتها ما موجودة بالمخزن هسه — يمكن انحذفت أو انطوت")}</p>}
      {/* ما شاله رفضُ waste_source_taken: بجملة التعبئة نفسها (الاسمُ ووقتُ تسجيله)، ومعه أن الباقي ما انسجل — الخادمُ يرفض السندَ كلَّه،
          و«ما تنسجل مرّة ثانية» عن سطرٍ واحد تُقرأ «الباقي انسجل». و«الباقي» سطورُ ذلك السند الباقيةُ وحدها (left): سطرٌ أُضيف بعده
          ما أُرسل قطّ. والكلمةُ الطويلة تلتفّ (اسمُ المادّة بأيّ طول). */}
      {taken.length > 0 && (
        <div className="space-y-1 break-words rounded-xl bg-surface-2 p-3 text-xs" data-waste-taken>
          {taken.map((a, i) => <p key={`t:${i}`} className="font-semibold text-warn-700 dark:text-warn-200" data-waste-taken-line>{alreadyText(a)}</p>)}
          {lines.some((d) => left.includes(d.id)) && <p className="font-bold text-ink" data-waste-taken-left>{t("cnt.waste.takenLeft", "شلناها من السند — والباقي ما انسجل بعد، راجعه وأرسله مرّة ثانية")}</p>}
        </div>
      )}

      {products === null ? (failed ? (
        <div className="card space-y-3 p-8 text-center" data-waste-failed>
          <p className="text-sm text-ink-muted">{t("cnt.loadFailed", "ما كدرنا نجيب بيانات الجرد — المشكلة بالاتصال ولا شي ضاع.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void onChanged(); }} data-waste-reload>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>) : (
        <>
          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((d) => {
                const p = byId.get(d.id);
                const r = p ? readQty(d, p) : null;
                const sub = !!p && subUnitMilli(p) !== null;
                const over = !!p && !!r && asked.has(d.id) && d.ack !== r.key && overStock(r, p);
                return (
                  <li key={d.id} className={cn("card p-3", over && "border-warn-300 dark:border-warn-500/40")} data-waste-line={d.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{p?.name ?? d.name}</p>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("cnt.waste.remove", "شيلها من السند")} onClick={() => remove(d.id)} data-waste-remove>
                        <X size={16} />
                      </button>
                    </div>
                    {!p && <p className="mt-1 text-xs font-bold text-warn-700 dark:text-warn-200">{skipText({ name: d.name, why: "gone" })}</p>}
                    {p && pendingIds.has(d.id) && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-warn-700 dark:text-warn-200" data-waste-pending><Hourglass size={14} /> {t("cnt.waste.pendingHere", "عليها جرد أو سند ينتظر موافقة المدير — ما تنسجل لحد ما يوافق أو يرفض")}</p>}
                    {p && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {sub && (
                          <div className="flex gap-1.5">
                            {(["stock", "sub"] as const).map((u) => (
                              <button key={u} type="button" aria-pressed={d.unit === u} data-waste-unit={u} className={chip(d.unit === u)} onClick={() => { playTap(); setLine(d.id, { unit: u }); }}>
                                {unitWord(t, p, u)}
                              </button>
                            ))}
                          </div>
                        )}
                        <label className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                          {t("cnt.waste.qty", "الكمية")}
                          <input type="number" inputMode="decimal" min={0} step="any" className="input h-10 w-24 text-center tabular-nums" data-waste-qty
                            value={d.qty} onChange={(e) => setLine(d.id, { qty: e.target.value })} />
                          {!sub && <span>{unitWord(t, p, "stock")}</span>}
                        </label>
                        <div className="flex gap-1.5">
                          {REASONS.map((x) => (
                            <button key={x} type="button" aria-pressed={d.reason === x} data-waste-reason={x} className={chip(d.reason === x)} onClick={() => { playTap(); setLine(d.id, { reason: x }); }}>
                              {t(`cnt.reason.${x}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {p && (
                      <input className="input mt-2 h-9 w-full text-sm" maxLength={200} data-waste-note placeholder={t("cnt.waste.notePh", "شنو صار؟ (لازم) — مثلاً: وگعت وانكسرت، انتهت، استعملناها للتنظيف")}
                        value={d.note} onChange={(e) => setLine(d.id, { note: e.target.value })} />
                    )}
                    {p && showCost && stockUnitCost(p) === 0n && <p className="mt-1 text-2xs text-ink-subtle" data-waste-zero>{t("cnt.waste.zeroCost", "كلفتها صفر — تنخصم من المخزون بس ما تنحسب خسارة")}</p>}
                    {over && p && r && (
                      <div className="mt-2 space-y-2 rounded-xl bg-warn-50/70 p-2.5 dark:bg-warn-500/10" data-waste-over>
                        <p className="text-xs font-bold text-warn-700 dark:text-warn-200">{t("cnt.waste.over", { name: p.name, stock: stockText(p, d.unit), qty: qtyText(t, r.qm, d.unit, p), defaultValue: '"{{name}}" رصيدها بالنظام {{stock}} وانت كاتب تلف {{qty}} — متأكد؟' })}</p>
                        <Button size="sm" loading={busy} leftIcon={<Check size={14} />} onClick={() => confirmOver(d.id)} data-waste-over-yes>{t("cnt.waste.overYes", "أي، سجّل")}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="card p-3">
            <label className="flex items-center gap-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="input h-10 flex-1" value={q} onChange={(e) => setQ(e.target.value)} data-waste-search
                placeholder={t("cnt.waste.searchPh", "شنو اللي تلف؟ ابحث بالاسم أو امسح الباركود")} />
            </label>
            {results.list.length > 0 && (
              <ul className="mt-2 divide-y divide-line/60">
                {results.list.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-start text-sm hover:text-brand-700" data-waste-add={p.id}
                      onClick={() => { playTap(); add(p); setQ(""); }}>
                      <PackageSearch size={14} className="text-ink-subtle" /> {p.name}
                      {pendingIds.has(p.id) && <span className="ms-auto text-2xs font-semibold text-warn-700 dark:text-warn-300">{t("cnt.waste.pendingShort", "تنتظر موافقة")}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.more > 0 && <p className="mt-1 text-2xs text-ink-subtle" data-waste-more>{t("cnt.waste.more", { n: formatNum(results.more), defaultValue: "و{{n}} غيرها — اكتب أكثر" })}</p>}
          </div>

          <div className="flex justify-end">
            <Button size="lg" loading={busy} disabled={lines.length === 0} leftIcon={<Check size={18} />} onClick={() => void send()} data-waste-send>
              {isManager ? t("cnt.waste.apply", "سجّل وطبّق") : t("cnt.waste.send", "أرسل للمدير")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** ما سُجّل — من سطور الخادم (المادةُ ومقدارُها d = stock_now − stock_after)، وبالكمية كما كُتبت حين تطابق
 *  ما أُرسل. المديرُ: ما انخصم وخسارتُه لكلّ سبب (سحبٌ واحدٌ لكلّ سبب، كما يكتبه الخادم) وما بقي تحت الصفر؛
 *  وغيرُه: ينتظر المدير، وما سينزل تحت الصفر بعد الموافقة. */
function WasteDone({ done, byId, showCost }: { done: Done; byId: ReadonlyMap<string, Product>; showCost: boolean }) {
  const { t } = useTranslation();
  const rows = done.r.lines.map((l) => {
    const now = Number(l.stock_now), after = Number(l.stock_after);
    const dN = Number.isFinite(now) && Number.isFinite(after) ? roundScaled(now, 9) - roundScaled(after, 9) : null;
    const s = dN === null ? undefined : done.sent.find((x) => x.id === l.product_id && x.dN === dN);
    return { l, s, text: s?.text ?? (dN !== null ? nanoText(t, dN, byId.get(l.product_id)) : "") };
  });
  const dec = done.r.decided as Decided | null;
  if (!dec) {
    return (
      <div className="card space-y-2 p-4" data-waste-done="pending">
        <p className="flex items-center gap-1 text-sm font-bold text-ink"><Hourglass size={14} /> {t("cnt.waste.pending", "انسجل وينتظر موافقة المدير — الرصيد ما يتغيّر هسه")}</p>
        <ul className="space-y-1 text-xs text-ink-muted">
          {rows.map(({ l, text }) => <li key={l.product_id}><b className="text-ink">{l.name}</b> · {t("cnt.waste.line", { q: text, defaultValue: "تلف {{q}}" })}</li>)}
        </ul>
        {/* تحت الصفر بمنازل الرصيد الثلاث (ما دونها يحمله المرحَّل): ٠ − ٠٫٠٠٠٤ لا يُقال «راح يصير −0». */}
        {rows.filter(({ l }) => Number.isFinite(Number(l.stock_after)) && roundScaled(Number(l.stock_after), 3) < 0n).map(({ l }) => (
          <p key={l.product_id} className="text-xs font-bold text-warn-700 dark:text-warn-200" data-waste-will>{t("cnt.neg.willBe", { name: l.name, stock: stockSaid(t, Number(l.stock_after), byId.get(l.product_id)), defaultValue: '"{{name}}" رصيدها راح يصير {{stock}} بعد الموافقة — سجّل فاتورة الشراء أو سوّ جرد' })}</p>
        ))}
      </div>
    );
  }
  const losses = (dec.withdrawals ?? []).filter((w) => w && (w.reason === "damaged" || w.reason === "expired"));
  const out: JSX.Element[] = [];
  for (const reason of [...REASONS, null]) {
    const rs = rows.filter((x) => (x.s?.reason ?? null) === reason);
    const zero = rs.filter((x) => showCost && x.s?.zero);
    const paid = rs.filter((x) => !zero.includes(x));
    const loss = reason && showCost ? losses.find((w) => w.reason === reason) : undefined;
    const lossText = loss ? t("cnt.waste.loss", { v: money(Number(loss.amount) || 0), reason: t(`cnt.reason.${reason}`), defaultValue: 'وانسجّل خسارة {{v}} بـ"سحب مخزن — {{reason}}" (مو من الدرج)' }) : "";
    if (paid.length || lossText) {
      // الفاصلُ بلغة الواجهة (common.listSep: «، » أو ", ") — «،» عربيٌّ ثابت كان يفصل جملاً إنكليزية.
      out.push(<p key={`p:${reason}`} data-waste-done-line>{[...paid.map((x) => t("cnt.waste.done", { q: x.text, name: x.l.name, defaultValue: 'انخصم {{q}} من "{{name}}"' })), ...(lossText ? [lossText] : [])].join(paid.length > 1 ? t("common.listSep", "، ") : " ")}</p>);
    }
    for (const x of zero) out.push(<p key={`z:${x.l.product_id}`} data-waste-done-zero>{t("cnt.waste.done", { q: x.text, name: x.l.name, defaultValue: 'انخصم {{q}} من "{{name}}"' })} — {t("cnt.waste.zeroCost", "كلفتها صفر — تنخصم من المخزون بس ما تنحسب خسارة")}</p>);
  }
  return (
    <div className="card space-y-2 p-4 text-sm text-ink" data-waste-done="applied">
      <p className="flex items-center gap-1 font-bold text-success-700 dark:text-success-300"><Check size={14} /> {t("cnt.waste.applied", "انسجل وانطبق")}</p>
      {out}
      {(dec.negatives ?? []).map((n) => (
        <p key={n.product_id} className="text-xs font-bold text-warn-700 dark:text-warn-200" data-waste-neg>{t("cnt.neg.after", { name: n.name, stock: stockSaid(t, Number(n.stock), byId.get(n.product_id)), defaultValue: '"{{name}}" رصيدها صار {{stock}} بعد الموافقة — سجّل فاتورة الشراء أو سوّ جرد' })}</p>
      ))}
    </div>
  );
}

export interface ConsumablesCardsProps {
  /** مدّةُ تبويب التقرير نفسها (rangeOf بـStockCount) — ١–٤٠٠ يوم وإلا range_bad. */
  from: string;
  to: string;
  /** can("viewProfits") — والتبويبُ كلُّه مقفولٌ أصلاً على الجهاز المقيَّد. */
  showCost: boolean;
  /** موادُّ العيادة: ما انصرف يُقال بوحدته الصغيرة (مل لقنينة ٥٠٠ مل). */
  products: Product[];
}

/** بطاقاتُ report_consumables الأربع (§9): ما انصرف على الخدمات (كلفتُها لا خسارة)، وما صُرف بلا رصيد،
 *  وتعديلاتُ الوصفة (من ومتى وبأيّ مواد)، وما انباع بلا خصم. القراءةُ jsonb واحدة لا سقفَ لها؛ وفشلُها
 *  «أعد المحاولة» — لا صفرٌ عن مجهول. */
export function ConsumablesCards({ from, to, showCost, products }: ConsumablesCardsProps) {
  const { t, i18n } = useTranslation();
  const [res, setRes] = useState<ConsumablesReport | "loading" | "error">("loading");
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;   // جوابُ مدّةٍ سابقة لا يُرسم فوق اللاحقة
    setRes("loading");
    try {
      const r = await consumptionApi.reportConsumables(from, to);
      if (my === seq.current) setRes(r);
    } catch { if (my === seq.current) setRes("error"); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  if (res === "loading") return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (res === "error") {
    return (
      <div className="card space-y-3 p-6 text-center" data-cons-failed>
        <p className="text-sm text-ink-muted">{t("cnt.cons.failed", "ما گدرنا نجيب مستهلكات الخدمات — ما نعرض رقم ناقص.")}</p>
        <Button size="sm" variant="secondary" leftIcon={<RotateCw size={14} />} onClick={() => { playTap(); void load(); }} data-cons-retry>{t("common.retry", "أعد المحاولة")}</Button>
      </div>
    );
  }
  const amount = (v: unknown): bigint => { const n = Number(v); return Number.isFinite(n) ? roundScaled(n, 2) : 0n; };
  const qtyOf = (v: unknown, id: string): string => {
    const n = Number(v), p = byId.get(id);
    return Number.isFinite(n) ? nanoText(t, roundScaled(n, 9), p) : "";
  };
  /* بمساعدات التطبيق (formatDate + formatTime، بأرقامٍ غربية كباقي الشاشات) لا toLocaleString() بمحليّة المتصفّح: شهرٌ أوّلاً
     بـen-US (١١ تشرين الأول تُقرأ ١٠ تشرين الثاني)، أو أرقامٌ شرقية بـar-IQ، وثوانٍ — وdir=ltr كان يقلب ترتيبَ العربية. ووقتٌ لا
     يُقرأ «—» لا «Invalid Date». */
  const when = (iso: string): string => (Number.isFinite(Date.parse(iso)) ? `${formatDate(iso, i18n.language)} ${formatTime(iso, i18n.language)}` : "—");
  const total = res.products.reduce((s, p) => s + amount(p.value), 0n);
  const short = res.products.filter((p) => Number(p.short) > 0);
  const ov = res.overrides, un = res.unconsumed;
  const unN = (Number(un.old_device) || 0) + (Number(un.service_missing) || 0);
  const more = (shown: number, all: number) => (all > shown ? <p className="mt-1 text-2xs text-ink-subtle">{t("cnt.cons.latest", { n: formatNum(shown), defaultValue: "يعرض آخر {{n}} بس" })}</p> : null);
  const names = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

  return (
    <section className="space-y-2" data-cons>
      <p className="text-xs font-semibold text-ink-muted">{t("cnt.cons.title", "مستهلكات الخدمات")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <details className="card p-4" data-cons-used>
          <summary className="cursor-pointer text-sm font-bold text-ink">
            {showCost ? t("cnt.cons.used", { v: money(fromScaled(total, 2)), defaultValue: "انصرفت على الخدمات هالفترة: {{v}} (كلفة الخدمات، مو خسارة)" }) : t("cnt.cons.usedCount", { n: formatNum(res.products.length), defaultValue: "انصرفت على الخدمات هالفترة: {{n}} مادة" })}
          </summary>
          {res.products.length > 0 && (
            <ul className="mt-2 divide-y divide-line/60 text-xs">
              {res.products.map((p) => (
                <li key={p.product_id} className="flex gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}</span>
                  <span className="tabular-nums text-ink-muted">{qtyOf(p.used, p.product_id)}</span>
                  {showCost && <span className="w-24 text-end tabular-nums text-ink">{money(fromScaled(amount(p.value), 2))}</span>}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="card p-4" data-cons-short>
          <summary className="cursor-pointer text-sm font-bold text-ink">{t("cnt.cons.short", { n: formatNum(Number(res.short_products) || 0), defaultValue: "صُرفت بلا رصيد: {{n}} مادة" })}</summary>
          {short.length > 0 && (
            <ul className="mt-2 divide-y divide-line/60 text-xs">
              {short.map((p) => (
                <li key={p.product_id} className="flex gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}</span>
                  <span className="tabular-nums text-warn-700 dark:text-warn-300">{qtyOf(p.short, p.product_id)}</span>
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="card p-4" data-cons-overrides>
          <summary className="cursor-pointer text-sm font-bold text-ink">{t("cnt.cons.overrides", { n: formatNum(Number(ov.count) || 0), defaultValue: "تعديلات على الوصفة: {{n}} حالة" })}</summary>
          {ov.recent.length > 0 && (
            <ul className="mt-2 divide-y divide-line/60 text-xs">
              {ov.recent.map((o, i) => (
                <li key={`${o.invoice_id}:${i}`} className="space-y-0.5 py-1.5" data-cons-override>
                  <p className="font-semibold text-ink">{o.service_name} — {names(o.products).join(t("common.listSep", "، ")) || t("cnt.cons.none", "بلا مواد")}</p>
                  {/* مَن: الاسمُ أوّلاً (كـapproverOf)، وصاحبُ العيادة — حسابُه معرّفُ العيادة ولا صفَّ كادرٍ له (0083) — بدوره لا «موظف»؛ وما
                      عداهما «موظف» كما كان: المشغّلُ (by_owner false، لا أثرَ له عند العيادة) وخادمٌ أقدم بلا by_owner — الغائبُ لا يُخمَّن. */}
                  <p className="text-ink-subtle">{o.by_name || (o.by_owner === true ? t("cnt.cons.byOwner", "صاحب العيادة") : t("cnt.someone", "موظف"))} · {when(o.created_at)} · {invoiceNo(o.invoice_id)}</p>
                </li>
              ))}
            </ul>
          )}
          {more(ov.recent.length, Number(ov.count) || 0)}
        </details>

        <details className="card p-4" data-cons-unconsumed>
          <summary className="cursor-pointer text-sm font-bold text-ink">{t("cnt.cons.unconsumed", { n: formatNum(unN), defaultValue: "خدمات انباعت بلا خصم مستهلكات: {{n}} (أجهزة ما تحدّثت أو خدمة مو موجودة)" })}</summary>
          {un.recent.length > 0 && (
            <ul className="mt-2 divide-y divide-line/60 text-xs">
              {un.recent.map((u, i) => (
                <li key={`${u.invoice_id}:${i}`} className="flex flex-wrap gap-2 py-1.5" data-cons-skip={u.note}>
                  <span className="font-semibold text-ink">{u.line_name}</span>
                  <span className="text-ink-muted">{u.note === "old_device" ? t("cnt.cons.oldDevice", "جهاز ما تحدّث") : t("cnt.cons.serviceMissing", "الخدمة مو موجودة")}</span>
                  <span className="ms-auto text-ink-subtle">{invoiceNo(u.invoice_id)} · {when(u.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {more(un.recent.length, unN)}
        </details>
      </div>
    </section>
  );
}
