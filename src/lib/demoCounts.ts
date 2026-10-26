import type { CountDecision, CountLineInput, CountReason, CountSubmitResult, DemoDB, DemoStockCount, Expense, Product, StockLossRow } from "@/types";
import type { StockNegative, WasteSubmitResult } from "./consumptionApi";
import { loadDB, saveDB } from "./demoStore";
import { uid } from "./utils";
import { GAIN_REASONS, LOSS_REASONS, WITHDRAWAL_REASONS } from "./countPick";
import { applyLotCounts, reconcileAll } from "./demoLots";
import { demoBaseRole, demoHint, demoPinLive } from "./demoRole";
import { fromScaled, roundDiv, roundScaled, stockNano, stockUnitCost, subUnitMilli, toMilli } from "./consumption";

/* ============================================================================
 * مرآةُ الجرد الدوريّ (0216/0217) وسند التلف (0254) للوضع التجريبي — تُحمَّل عند النداء لا مع الإقلاع.
 * نفسُ الحرّاس: السببُ يطابق اتجاهَ الفرق، والمطابقُ بلا موافقة، والمعلَّقُ لا
 * يمسّ الرصيد ولا يُلغيه عدٌّ جديد، والموافقةُ للمدير وتطبّق **الفرقَ** لا الرقم، والسحبُ «من المخزن»
 * لأسباب الخسارة وحدها — وخطأُ الإدخال والزيادةُ بلا سحب.
 *
 * 0254: الموافقةُ بلا حصر (round(old + فرق, 3))، وسندُ التلف صفٌّ بـsource 'waste' مكتوبٌ فرقاً (system_qty = d
 * بالضبط بتسع منازل، counted_qty = 0) يُرحَّل −d عبر `_stock_post(…, 'external')` — والمرحِّلُ (stockPostLocal) بمرآة
 * المستهلكات (demoConsumption.ts) يُمرَّر من الطالب، فلا تستورد هذه الوحدةُ تلك (لا دائرةَ بين القطعتين).
 * 0255: كلفةُ اللقطة stock_unit_cost (المتوسّطُ وإلا سعرُ الشراء) — لا سعرُ الشراء وحده.
 * المقاديرُ تُقرأ من الأرقام المخزَّنة بمنازل عمودها بالضبط (roundScaled)، والمالُ بالفلس الصحيح لا بالعائم.
 * ========================================================================= */

const KEY = "vp_demo_counts";

export function loadCounts(): DemoStockCount[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as DemoStockCount[]; } catch { /* swallow-ok: جهازٌ بلا تخزين = لا جرد سابق */ }
  return [];
}
/** يرمي: عدٌّ لم يُحفظ ويُقال «انسجل» كذبٌ يُصدَّق. */
export function saveCounts(list: DemoStockCount[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 2000)));
}

/** مَن يعدّ أو يقرّر، للختم وحده. والدورُ ليس هنا بل من demoRole.ts: كان يُقرأ هنا `raw.role`،
 *  مفتاحٌ لا يكتبه AuthContext.persistRaw — فما رُفض أحدٌ قطّ. */
function session(): { id: string | null; name: string | null } {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { id?: string; full_name?: string } } | null;
    return { id: s?.raw?.id ?? null, name: s?.raw?.full_name ?? null };
  } catch { return { id: null, name: null }; }
}

/** رفضٌ برمز الخادم نفسه (`count_reason`…) وتلميحِه حرفاً (stock_count_submit بـ0255 وstock_count_decide بـ0254) — والشاشةُ
 *  تعرض التلميحَ بالعربية وتترجم الرمزَ بغيرها (StockCount.tsx countError)، كما تعرضهما من الخادم. كان الرمزُ وحده بلا تلميح
 *  (مقيسٌ بالفرق مع الخادم: count_already_pending | null والخادمُ يسمّي المادّة). والتلميحُ بياناتٌ بمهارب يونيكود لا نصُّ واجهة. */
function refuse(code: string, hint?: string): never {
  const e = new Error(`count_${code}`) as Error & { code: string; hint?: string };
  e.code = "P0001";
  if (hint) e.hint = hint;
  throw e;
}
/** تلميحاتُ الجرد حرفاً من نصّ الدالّتين (0255:847–928، 0254:166–171). */
const CH = {
  empty: "\u0645\u0627\u0643\u0648 \u0633\u0637\u0648\u0631 \u0628\u0627\u0644\u0639\u062F\u0651",
  tooMany: "\u0623\u0643\u062B\u0631 \u0645\u0646 \u0662\u0660\u0660 \u0645\u0627\u062F\u0629 \u0628\u0645\u0631\u0651\u0629 \u2014 \u0642\u0633\u0651\u0645 \u0627\u0644\u0639\u062F\u0651",
  badLine: "\u0633\u0637\u0631\u064C \u0628\u0627\u0644\u0639\u062F\u0651 \u0646\u0627\u0642\u0635 \u0623\u0648 \u0631\u0642\u0645\u0647 \u063A\u0644\u0637",
  lotTwice: "\u062F\u0641\u0639\u0629\u064C \u0645\u0643\u0631\u0651\u0631\u0629 \u0628\u0646\u0641\u0633 \u0627\u0644\u0639\u062F\u0651",
  badQty: "\u0627\u0644\u0639\u062F\u062F \u0644\u0627\u0632\u0645 \u064A\u0643\u0648\u0646 \u0635\u0641\u0631 \u0623\u0648 \u0623\u0643\u062B\u0631",
  productMissing: "\u0645\u0627\u062F\u0629\u064C \u0628\u0627\u0644\u0639\u062F\u0651 \u0645\u0627 \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0645\u062E\u0632\u0646 \u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629",
  pooled: (n: string) => `\u00AB${n}\u00BB \u0631\u0635\u064A\u062F\u0647\u0627 \u0628\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0642\u0633\u0645 \u2014 \u062A\u0646\u0639\u062F\u0651 \u0645\u0646 \u00AB\u062A\u0639\u062F\u064A\u0644 / \u062C\u0631\u062F\u00BB \u0627\u0644\u0642\u0633\u0645`,
  lotMissing: (n: string) => `\u00AB${n}\u00BB: \u062F\u0641\u0639\u0629\u064C \u0628\u0627\u0644\u0639\u062F\u0651 \u0645\u0627 \u0645\u0648\u062C\u0648\u062F\u0629 \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629`,
  reasonLoss: (n: string) => `\u00AB${n}\u00BB \u0646\u0627\u0642\u0635\u0629 \u2014 \u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0628\u0628: \u062A\u0627\u0644\u0641\u060C \u0645\u0646\u062A\u0647\u064A\u060C \u0639\u062C\u0632\u060C \u0623\u0648 \u062E\u0637\u0623 \u0625\u062F\u062E\u0627\u0644`,
  reasonGain: (n: string) => `\u00AB${n}\u00BB \u0632\u0627\u064A\u062F\u0629 \u2014 \u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0628\u0628: \u0644\u0642\u064A\u0646\u0627 \u0632\u064A\u0627\u062F\u0629\u060C \u0623\u0648 \u062E\u0637\u0623 \u0625\u062F\u062E\u0627\u0644`,
  pending: (n: string) => `\u00AB${n}\u00BB \u0639\u062F\u0651\u0647\u0627 \u0623\u062D\u062F \u0648\u062A\u0646\u062A\u0638\u0631 \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0645\u062F\u064A\u0631 \u2014 \u064A\u0648\u0627\u0641\u0642 \u0623\u0648 \u064A\u0631\u0641\u0636 \u0623\u0648\u0651\u0644\u0627\u064B`,
  needsManager: "\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0641\u0631\u0642 \u0627\u0644\u062C\u0631\u062F \u0644\u0644\u0645\u062F\u064A\u0631 \u0648\u062D\u062F\u0647 \u2014 \u0627\u0641\u062A\u062D \u0648\u0636\u0639 \u0627\u0644\u0645\u062F\u064A\u0631",
  nothing: "\u0645\u0627 \u0627\u062E\u062A\u0631\u062A \u0648\u0644\u0627 \u0633\u0637\u0631",
};

/* تلميحاتُ 0254 حرفاً (بياناتٌ لا نصُّ واجهة — تُحفظ بمهارب يونيكود). سندُ التلف يقول رفضَه بتلميح الخادم (P0001 + hint)،
 * والشاشةُ تعرضه كما هو. waste_source_bad بتلميحاته الثلاثة من جولة SQL الثانية (0254:566، :572، :580 — الشكل، فاتورةٌ لا تعرفها
 * العيادة، دفعةٌ بلا حدث) وwaste_source_taken (:597). */
const WH = {
  forbidden: "\u062D\u0633\u0627\u0628 \u0627\u0644\u062A\u0635\u0648\u064A\u0631 \u0645\u0627 \u064A\u0633\u062C\u0651\u0644 \u062A\u0644\u0641 \u2014 \u0633\u062C\u0651\u0644\u0647 \u0645\u0646 \u062D\u0633\u0627\u0628 \u0627\u0644\u0643\u0627\u062F\u0631",
  empty: "\u0645\u0627\u0643\u0648 \u0633\u0637\u0648\u0631 \u0628\u0633\u0646\u062F \u0627\u0644\u062A\u0644\u0641",
  tooMany: "\u0623\u0643\u062B\u0631 \u0645\u0646 \u0665\u0660 \u0645\u0627\u062F\u0629 \u0628\u0633\u0646\u062F\u064D \u0648\u0627\u062D\u062F \u2014 \u0642\u0633\u0651\u0645 \u0627\u0644\u0633\u0646\u062F",
  needsManager: "\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062A\u0644\u0641 \u0641\u0648\u0631\u0627\u064B \u0644\u0644\u0645\u062F\u064A\u0631 \u2014 \u0623\u0631\u0633\u0644\u0647 \u0644\u0644\u0645\u062F\u064A\u0631",
  productMissing: "\u0645\u0627\u062F\u0629\u064C \u0645\u0627 \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0645\u062E\u0632\u0646 \u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u2014 \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629",
  pooled: (n: string) => `\u00AB${n}\u00BB \u0631\u0635\u064A\u062F\u0647\u0627 \u0628\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0642\u0633\u0645 \u2014 \u0645\u0627 \u062A\u0646\u0633\u062C\u0644 \u0647\u0646\u0627`,
  farm: (n: string) => `\u00AB${n}\u00BB \u0631\u0635\u064A\u062F\u0647\u0627 \u0628\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u062D\u0642\u0644 \u2014 \u0645\u0627 \u062A\u0646\u0633\u062C\u0644 \u0647\u0646\u0627`,
  duplicate: (n: string) => `\u00AB${n}\u00BB \u0645\u0643\u0631\u0651\u0631\u0629 \u0628\u0627\u0644\u0633\u0646\u062F \u2014 \u0627\u062C\u0645\u0639\u0647\u0627 \u0628\u0633\u0637\u0631 \u0648\u0627\u062D\u062F`,
  reason: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0628\u0628: \u062A\u0627\u0644\u0641 \u0623\u0648 \u0645\u0646\u062A\u0647\u064A",
  note: "\u0627\u0643\u062A\u0628 \u0634\u0646\u0648 \u0635\u0627\u0631 (\u0645\u062B\u0644\u0627\u064B: \u0648\u06AF\u0639\u062A \u0648\u0627\u0646\u0643\u0633\u0631\u062A)",
  badQty: (n: string) => `\u00AB${n}\u00BB: \u0627\u0643\u062A\u0628 \u0627\u0644\u0643\u0645\u064A\u0629 \u0627\u0644\u062A\u0627\u0644\u0641\u0629 \u0635\u062D`,
  sourceShape: (n: string) => `\u00AB${n}\u00BB: \u0631\u0627\u0628\u0637 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0647\u0627\u0644\u0633\u0637\u0631 \u0645\u0648 \u0645\u0636\u0628\u0648\u0637 \u2014 \u0627\u0631\u062C\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0639\u0628\u0651\u064A \u0627\u0644\u0633\u0646\u062F \u0645\u0646\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F`,
  sourceUnknown: (n: string) => `\u00AB${n}\u00BB: \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0644\u064A \u0627\u0646\u0639\u0628\u0651\u0649 \u0645\u0646\u0647\u0627 \u0627\u0644\u0633\u0637\u0631 \u0645\u0648 \u0628\u0647\u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u2014 \u0627\u0631\u062C\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0639\u0628\u0651\u064A \u0627\u0644\u0633\u0646\u062F \u0645\u0646\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F`,
  sourceBatch: (n: string) => `\u00AB${n}\u00BB \u0645\u0627 \u0631\u062C\u0639\u062A \u0645\u0646 \u0647\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0627\u0644\u062A\u0631\u062C\u064A\u0639 \u0627\u0644\u0644\u064A \u0628\u0627\u0644\u0631\u0627\u0628\u0637 \u2014 \u0627\u0631\u062C\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0639\u0628\u0651\u064A \u0627\u0644\u0633\u0646\u062F \u0645\u0646\u0647\u0627 \u0645\u0646 \u062C\u062F\u064A\u062F`,
  sourceTaken: (n: string) => `\u00AB${n}\u00BB \u0627\u0646\u0633\u062C\u0644\u062A \u0647\u062F\u0631 \u0642\u0628\u0644 \u0645\u0646 \u0647\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u2014 \u0645\u0627 \u062A\u0646\u0633\u062C\u0644 \u0645\u0631\u0651\u0629 \u062B\u0627\u0646\u064A\u0629`,
  pending: (n: string) => `\u00AB${n}\u00BB \u0639\u0644\u064A\u0647\u0627 \u062C\u0631\u062F \u0623\u0648 \u0633\u0646\u062F \u062A\u0644\u0641 \u064A\u0646\u062A\u0638\u0631 \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0645\u062F\u064A\u0631 \u2014 \u064A\u0648\u0627\u0641\u0642 \u0623\u0648 \u064A\u0631\u0641\u0636 \u0623\u0648\u0651\u0644\u0627\u064B`,
  exceeds: (n: string, s: string, l: string, q: string) => `\u00AB${n}\u00BB \u0631\u0635\u064A\u062F\u0647\u0627 \u0628\u0627\u0644\u0646\u0638\u0627\u0645 ${s}${l} \u0648\u0627\u0646\u062A \u0643\u0627\u062A\u0628 \u062A\u0644\u0641 ${q}${l} \u2014 \u0625\u0630\u0627 \u0635\u062D\u064A\u062D \u0623\u0643\u0651\u062F \u0645\u0631\u0651\u0629 \u062B\u0627\u0646\u064A\u0629`,
  mergePending: (t: string, k: string) => `\u00AB${t}\u00BB \u0639\u0644\u064A\u0647\u0627 \u0633\u0646\u062F \u062A\u0644\u0641 \u064A\u0646\u062A\u0638\u0631\u060C \u0648\u00AB${k}\u00BB \u0639\u0644\u064A\u0647\u0627 \u062C\u0631\u062F \u0623\u0648 \u0633\u0646\u062F \u064A\u0646\u062A\u0638\u0631 \u2014 \u062E\u0644\u0651\u064A \u0627\u0644\u0645\u062F\u064A\u0631 \u064A\u0628\u062A\u0651 \u0628\u064A\u0647\u0645 \u0642\u0628\u0644 \u0627\u0644\u062F\u0645\u062C`,
  deletePending: (n: string) => `\u00AB${n}\u00BB \u0639\u0644\u064A\u0647\u0627 \u0633\u0646\u062F \u062A\u0644\u0641 \u064A\u0646\u062A\u0638\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u2014 \u064A\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647 \u0623\u0648 \u064A\u0631\u0641\u0636\u0647 \u0642\u0628\u0644 \u0627\u0644\u062D\u0630\u0641`,
  sep: "\u060C ",
};

/** نصُّ القاعدة كما تكتبه `stock_count_decide` حرفاً — بياناتٌ تُخزَّن لا واجهة (السحبُ يُقرأ كما كُتب). */
const DB_TEXT: Record<string, string> = {
  damaged: "\u062A\u0627\u0644\u0641",
  expired: "\u0645\u0646\u062A\u0647\u064A",
  shortage: "\u0639\u062C\u0632",
  head: "\u0633\u062D\u0628 \u0645\u062E\u0632\u0646",
};

/* ── أدوات ───────────────────────────────────────────────────────────────────────────── */
/** القيمةُ المخزَّنة (رقمٌ تجريبيّ) بمنازل عمودها s بالضبط: numeric(·,3) للرصيد والكمية، و٩ لمقدار السند، و٦ للكلفة. */
const exact = (x: number | string | null | undefined, s: number): bigint => roundScaled(x ?? 0, s);
const milliOf = (x: number | string | null | undefined): bigint => exact(x, 3);
/** btrim(text) بلا وسيط: المسافاتُ وحدها. */
const btrim = (s: string): string => s.replace(/^ +| +$/g, "");
/** left(…, 200) بالمحارف لا بوحدات UTF-16. */
const left200 = (s: string): string => Array.from(s).slice(0, 200).join("");
/** ترتيبُ البايتات (collate "C") — للنتائج التي يرتّبها الخادمُ بالاسم (negatives، وموادُّ نصّ السحب). */
const cmp = (a: string | null | undefined, b: string | null | undefined): number => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a < b ? -1 : a > b ? 1 : 0;
};
/** trim_scale(): الرقمُ بلا أصفارٍ زائدة («5»، «0.04»، «-3»). */
function trimScale(v: bigint, s: number): string {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(s + 1, "0");
  let t = s ? `${a.slice(0, a.length - s)}.${a.slice(a.length - s)}` : a;
  if (t.includes(".")) t = t.replace(/0+$/, "").replace(/\.$/, "");
  return neg && t !== "0" ? `-${t}` : t;
}
/** المادّةُ حيّةً بمعرّفها (والمعرّفُ بحروفٍ صغيرة احتياطاً — uuid لا يفرّق الحالة). */
function findLive(db: DemoDB, id: string): Product | undefined {
  const ps = db.products ?? [];
  return ps.find((p) => p.id === id) ?? ps.find((p) => p.id.toLowerCase() === id.toLowerCase());
}
/** at_us لحدث دفتر: مختومٌ به منذ الجولة الثانية، وقبلها created_at × 1000. */
const evUs = (e: { at_us?: number; created_at: string }): number => e.at_us ?? Date.parse(e.created_at) * 1000;
/** نصٌّ يقرؤه numeric_in رقماً عشرياً (المسافاتُ الستّ على طرفيه) — `c_dec` بـstock_waste_submit (0254:316) حرفاً. */
const C_DEC = /^[ \t\n\v\f\r]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t\n\v\f\r]*$/;
/** `c_uuid` بـstock_waste_submit (0254:398) مع `~*`: شكلُ معرّف الفاتورة بالخادم. */
const C_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** أكبرُ bigint (9223372036854775807): دفعةٌ فوقه ليست دفعة. */
const BIGINT_MAX = 9223372036854775807n;

/* ── نصُّ jsonb (`l->>'k'` لغير النصّ) ─────────────────────────────────────────────────────── */
/** ترتيبُ مفاتيح jsonb كما يحفظها: الأقصرُ بالبايت أوّلاً ثمّ البايتات (مقيسٌ: ab، zz، é، ب). */
function jsonbKeyCmp(a: string, b: string): number {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return x.length - y.length;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
/** رقمُ JSON كما يطبعه numeric: بلا أُسّ — «1e+21» ⇒ «1000000000000000000000»، و«1e-7» ⇒ «0.0000001» (مقيسٌ على PGlite). */
function plainNumber(x: number): string {
  const s = String(x);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) return s;
  const frac = m[3] ?? "", digits = m[2] + frac, k = Number(m[4]) - frac.length;   // القيمة = digits × 10^k
  if (k >= 0) return `${m[1]}${digits}${"0".repeat(k)}`;
  const a = digits.padStart(1 - k, "0");
  return `${m[1]}${a.slice(0, a.length + k)}.${a.slice(a.length + k)}`;
}
/** نصُّ قيمةٍ كما يطبعه jsonb: «{"a": [1, 2.5], "b": "x"}» — مسافةٌ بعد «:» و«,»، والمفاتيحُ بترتيبه، والرقمُ بنصّ numeric.
 *  كان JSON.stringify («{"b":"x","a":[1,2.5]}») — نصٌّ آخر يُحفظ ملاحظةً. */
function jsonbText(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return Number.isFinite(v) ? plainNumber(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map((x) => jsonbText(x)).join(", ")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ks = Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== "function").sort(jsonbKeyCmp);
    return `{${ks.map((k) => `${JSON.stringify(k)}: ${jsonbText(o[k])}`).join(", ")}}`;
  }
  return "null";
}
/** `l->>'k'` كما يقرؤه الخادم: النصُّ نصّاً، والغائبُ والـnull لا شيء (`coalesce(…, '')`)، وغيرُهما نصُّه بـjsonb. */
const textOf = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : jsonbText(v));

const S20 = 10n ** 20n, E17 = 10n ** 17n;
/** `(…->>'counted')::numeric` ثمّ `between 0 and 1e9` (stock_count_submit 0255:858–867، وللدفعة 885–894) بعشرين منزلة بالضبط:
 *  الغائبُ والـnull — والرقمُ غيرُ المنتهي، يرسله JSON null — ⇒ count_bad_qty؛ ونصٌّ لا يقرؤه numeric، والمنطقيُّ والكائنُ (نصُّ JSON)
 *  ⇒ count_bad_line؛ وNaN وInfinity نصّاً، ورقمٌ يتجاوز المدى ⇒ count_bad_qty. كان Number(): null و«» صفراً، وtrue واحداً. */
function countedIn(x: unknown): bigint {
  let v: bigint | null = null;
  if (typeof x === "number") {
    if (Number.isFinite(x)) { try { v = roundScaled(x, 20); } catch { v = null; } }   // ١٠⁵⁰: خارج المدى لا رمياً خامّاً
  } else if (typeof x === "string") {
    if (!/^[ \t\n\v\f\r]*[+-]?(nan|inf|infinity)[ \t\n\v\f\r]*$/i.test(x)) {
      try { v = roundScaled(x, 20); } catch { if (!C_DEC.test(x)) refuse("bad_line", CH.badLine); }
    }
  } else if (x != null) refuse("bad_line", CH.badLine);
  if (v === null || v < 0n || v > 1_000_000_000n * S20) refuse("bad_qty", CH.badQty);
  return v;
}

/** stock_count_submit (0217 ← 0255:816–941) بترتيبه: الشكلُ ← لكلّ سطر: التحويلُ والمدى ← المادّةُ (ولا حقل) ← الحوض ← الدفعات
 *  (تحويلٌ ومدى، مكرّرة، غائبة) ← السببُ باتجاه الفرق ← معلَّقٌ قبله ← الإدراج. والحسابُ كلُّه بالضبط (BigInt بعشرين منزلة) كـnumeric. */
export function demoSubmitCount(lines: CountLineInput[]): CountSubmitResult {
  if (!Array.isArray(lines) || !lines.length) refuse("empty", CH.empty);
  if (lines.length > 200) refuse("too_many", CH.tooMany);
  const lots = reconcileAll();
  const db = loadDB();
  const me = session();
  const list = loadCounts();
  let matched = 0, pending = 0;
  const now = new Date().toISOString();
  const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});
  for (const raw of lines as unknown[]) {
    const l = obj(raw);
    let counted = countedIn(l.counted);
    const p = (db.products ?? []).find((x) => x.id === l.product_id && !x.farm_id);
    if (!p) refuse("product_missing", CH.productMissing);
    if (p.pooled) refuse("pooled", CH.pooled(p.name));
    const system = milliOf(p.stock) * E17;                         // coalesce(stock, 0) بمنازل عموده الثلاث
    // مرآةُ العدّ بالدفعة (0217): المادةُ = مجموعُ المعدود + ما لم يُعدّ من دفعاتها — بالضبط: ٠٫٠٥ + ٠٫٠٧ عائماً ٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١ «زايدة».
    let lotCounts: DemoStockCount["lot_counts"] = null;
    if (Array.isArray(l.lots) && l.lots.length) {
      lotCounts = [];
      let sum = 0n, sys = 0n;
      for (const lr of l.lots as unknown[]) {
        const lc = obj(lr);
        const c = countedIn(lc.counted);
        if (lotCounts.some((x) => x.lot_id === lc.lot_id)) refuse("bad_line", CH.lotTwice);
        const lot = lots.find((x) => x.id === lc.lot_id && x.product_id === p.id);
        if (!lot) refuse("lot_missing", CH.lotMissing(p.name));
        lotCounts.push({ lot_id: lot.id, expiry_date: lot.expiry_date, system: lot.qty, counted: fromScaled(c, 20) });
        sum += c; sys += exact(lot.qty, 20);
      }
      counted = sum + (system > sys ? system - sys : 0n);
    }
    const diff = counted - system;
    // nullif(btrim(coalesce(l->>'reason', '')), '') وleft(nullif(btrim(coalesce(l->>'note', '')), ''), 200): btrimُ المسافات وحدها
    // (trim() كان يشيل الجدولةَ والسطرَ الجديد، ولا يقبل « damaged »).
    let reason = btrim(textOf(l.reason)) || null;
    const note = left200(btrim(textOf(l.note))) || null;
    if (diff === 0n) reason = null;
    else if (!reason || !(diff < 0n ? LOSS_REASONS : GAIN_REASONS).includes(reason as CountReason)) refuse("reason", diff < 0n ? CH.reasonLoss(p.name) : CH.reasonGain(p.name));
    // معلَّقٌ ينتظر المدير لا يُلغيه عدٌّ جديد (مرآةُ count_already_pending) — جرداً كان أو سندَ تلف (0254).
    if (list.some((c) => c.product_id === p.id && c.status === "pending")) refuse("already_pending", CH.pending(p.name));
    list.unshift({
      id: uid("cnt"), product_id: p.id, product_name: p.name, system_qty: fromScaled(system, 20), counted_qty: fromScaled(counted, 20),
      // 0255 (stock_count_submit): لقطةُ الكلفة من مصدرها الواحد stock_unit_cost — المتوسّطُ، وإلا سعرُ الشراء.
      unit_cost: fromScaled(stockUnitCost(p), 6), reason: reason as CountReason | null, note,
      status: diff === 0n ? "matched" : "pending", counted_by: me.id, counted_by_name: me.name, counted_at: now,
      decided_by: null, decided_by_name: null, decided_at: null, applied_delta: null, expense_id: null, lot_counts: lotCounts,
      source: "count",
    });
    if (diff === 0n) matched++; else pending++;
  }
  saveCounts(list);
  return { matched, pending };
}

/** المرحِّلُ (`_stock_post` بمرآة المستهلكات) — يمرّره الطالب، فلا تستورد هذه الوحدةُ مرآةَ المستهلكات. */
export type WastePost = (db: DemoDB, productId: string, xNano: bigint, mode: "external", now: string) => { posted: bigint };
export type DemoDecision = CountDecision & { negatives: StockNegative[] };

/** stock_count_decide (0217 ← 0254): المديرُ وحده، ثمّ بترتيب (counted_at, id): الرفضُ يُختم، والمادّةُ الغائبةُ تُبطل
 *  (void)، والجردُ يطبّق فرقَه بلا حصر بثلاث منازل، والسندُ يُرحَّل −d بالضبط عبر المرحِّل ('external') — ثمّ سحبٌ لكلّ سببِ
 *  خسارة بالفلس الصحيح، وnegatives: كلُّ مادّةٍ وافقنا عليها وبقيت تحت الصفر. */
export function demoDecideCounts(
  ids: string[], approve: boolean, addExpense: (e: Omit<Expense, "id" | "created_at">) => Expense, post?: WastePost,
): DemoDecision {
  const me = session();
  // مرآةُ `auth_role() is distinct from 'manager'`: المديرُ بدوره أو بمفتاح وضع المدير الحيّ — والطبيبُ
  // والاستقبالُ ودورٌ لا يُعرف لا يوافقون.
  if (demoBaseRole() !== "manager" && !demoPinLive()) refuse("needs_manager", CH.needsManager);
  if (!ids.length) refuse("nothing", CH.nothing);
  let db = loadDB();
  const list = loadCounts();
  const now = new Date().toISOString();
  const want = new Set(ids);
  const out: DemoDecision = { approved: 0, rejected: 0, void: 0, withdrawals: [], negatives: [] };
  const done: DemoStockCount[] = [];
  for (const c of [...list].sort((a, b) => a.counted_at.localeCompare(b.counted_at) || a.id.localeCompare(b.id))) {
    if (!want.has(c.id) || c.status !== "pending") continue;
    const stamp = { decided_by: me.id, decided_by_name: me.name, decided_at: now };
    if (!approve) { Object.assign(c, { status: "rejected", ...stamp }); out.rejected++; continue; }
    const p = c.product_id ? (db.products ?? []).find((x) => x.id === c.product_id) : undefined;
    if (!p) { Object.assign(c, { status: "void", ...stamp }); out.void++; continue; }
    if (c.lot_counts?.length) applyLotCounts(p.id, c.lot_counts);
    let applied: number, posted: number | null = null;
    if (c.source === "waste") {
      // 0254: السندُ فرقٌ لا عدّ — d بالضبط عبر المرحِّل (ما دون ٠٫٠٠١ يحمله كالاستهلاك)، والفرقُ المسجَّل −d حرفاً.
      if (!post) throw new Error("waste_post_missing");
      const dN = exact(c.system_qty, 9) - exact(c.counted_qty, 9);
      posted = fromScaled(post(db, p.id, dN, "external", now).posted, 3);
      applied = fromScaled(-dN, 9);
    } else {
      // 0254: **ولا حصر** — round(coalesce(old, 0) + (counted − system), 3)؛ والفرقُ المسجَّل = ما تغيّر بالرصيد فعلاً.
      const oldM = milliOf(p.stock);
      const E17 = 10n ** 17n;
      const newM = roundDiv(oldM * E17 + exact(c.counted_qty, 20) - milliOf(c.system_qty) * E17, E17);
      p.stock = fromScaled(newM, 3);
      applied = fromScaled(newM - oldM, 3);
    }
    Object.assign(c, { status: "approved", applied_delta: applied, posted, ...stamp });
    done.push(c);
    out.approved++;
    saveDB(db);
    // مرآةُ lots_reconcile(product, reason = 'expired') فوراً بعد الرصيد — ثمّ نقرأ القاعدةَ من
    // جديد: الحارسُ كتب تواريخَ مشتقّة، وحفظُ نسختنا البائتة بعده كان يمحوها.
    reconcileAll({ productId: p.id, expiredFirst: c.reason === "expired" });
    db = loadDB();
  }
  // سحبٌ لكلّ سببِ خسارة (بترتيب نصّه)، بموادّه وكلفة لقطتها: round(Σ −applied_delta × unit_cost, 2) بالضبط.
  for (const reason of [...WITHDRAWAL_REASONS].sort()) {
    const rows = done.filter((c) => c.reason === reason && exact(c.applied_delta, 9) < 0n && exact(c.unit_cost, 6) > 0n);
    let sum = 0n;                                                    // ×10¹⁵ (مقدارٌ بتسع × كلفةٌ بستّ)
    for (const c of rows) sum += -exact(c.applied_delta, 9) * exact(c.unit_cost, 6);
    const amountC = rows.length ? roundDiv(sum, 10n ** 13n) : 0n;
    if (amountC <= 0n) continue;
    // السندُ بما كُتب ووحدته («Lyse ×2 مل»)، والجردُ بفرقه — بترتيب اسم المادّة كما يرتّبه الخادم (`order by c.product_name
    // collate "C", c.product_id`: البايتُ ثمّ المادّة، كـnegatives تحت) لا بترتيب اللغة: localeCompare كان يكتب «kit ×1، Lyse ×1»
    // والخادمُ «Lyse ×1، kit ×1» (قيسَ بالفرق مع الخادم). واسمان متساويان لمادّتين تفصلهما المادّة (0254 الجولة الثالثة) لا ترتيبُ الجرد.
    const items = [...rows].sort((a, b) => cmp(a.product_name, b.product_name) || cmp(a.product_id, b.product_id))
      .map((c) => (c.source === "waste"
        ? `${c.product_name} ×${trimScale(exact(c.entered_qty, 3), 3)}${c.unit_label != null ? ` ${c.unit_label}` : ""}`
        : `${c.product_name} ×${trimScale(-exact(c.applied_delta, 9), 9)}`))
      .join(WH.sep);
    const amount = fromScaled(amountC, 2);
    const e = addExpense({
      amount, description: `${DB_TEXT.head} — ${DB_TEXT[reason]}: ${items}`.slice(0, 1000), category: DB_TEXT.head,
      method: "stock", staff_id: me.id, spent_at: now,
    });
    for (const c of rows) c.expense_id = e.id;
    out.withdrawals.push({ reason, amount, expense_id: e.id });
  }
  const touched = new Set(done.map((c) => c.product_id));
  out.negatives = (db.products ?? []).filter((p) => touched.has(p.id) && milliOf(p.stock) < 0n)
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id))
    .map((p) => ({ product_id: p.id, name: p.name, stock: fromScaled(milliOf(p.stock), 3) }));
  saveCounts(list);
  return out;
}

/** report_stock_losses (0216): المعتمدُ بفرقٍ غير صفر بمدّته، لكلّ سبب: عددُ السطور وΣ −applied_delta و
 *  round(Σ −applied_delta × unit_cost, 2) — بالضبط (السندُ بتسع منازل، والكلفةُ بستّ). */
export function demoStockLosses(from: string, to: string): StockLossRow[] {
  const lo = new Date(from).getTime(), hi = new Date(to).getTime();
  const m = new Map<CountReason, { reason: CountReason; lines: number; q: bigint; v: bigint }>();
  for (const c of loadCounts()) {
    if (c.status !== "approved" || c.applied_delta == null || !c.reason || !c.decided_at) continue;
    const ad = exact(c.applied_delta, 9);
    if (ad === 0n) continue;
    const t = new Date(c.decided_at).getTime();
    if (!(t >= lo && t < hi)) continue;
    const r = m.get(c.reason) ?? { reason: c.reason, lines: 0, q: 0n, v: 0n };
    r.lines++; r.q += -ad; r.v += -ad * exact(c.unit_cost, 6);
    m.set(c.reason, r);
  }
  return [...m.values()].map((r) => ({ reason: r.reason, lines: r.lines, qty: fromScaled(r.q, 9), value: fromScaled(roundDiv(r.v, 10n ** 13n), 2) }));
}

/** stock_count_state (0216 ← 0254): آخرُ عدٍّ وآخرُ فرقٍ لكلّ مادّة — والسندُ ليس عدّاً (`c.source = 'count'`). */
export function demoCountState(): Map<string, { lastCountedAt: string | null; lastDiffAt: string | null }> {
  const out = new Map<string, { lastCountedAt: string | null; lastDiffAt: string | null }>();
  for (const c of loadCounts()) {
    if (!c.product_id || c.status === "void" || (c.source ?? "count") !== "count") continue;
    const cur = out.get(c.product_id) ?? { lastCountedAt: null, lastDiffAt: null };
    if (!cur.lastCountedAt || c.counted_at > cur.lastCountedAt) cur.lastCountedAt = c.counted_at;
    if (exact(c.counted_qty, 20) !== exact(c.system_qty, 20) && (c.status === "pending" || c.status === "approved")
      && (!cur.lastDiffAt || c.counted_at > cur.lastDiffAt)) cur.lastDiffAt = c.counted_at;
    out.set(c.product_id, cur);
  }
  return out;
}

/* ── سندُ التلف (stock_waste_submit، 0254) ───────────────────────────────────────────────── */
export interface WasteDeps { post: WastePost; addExpense: (e: Omit<Expense, "id" | "created_at">) => Expense }
const WASTE_FN = "stock_waste_submit";
/** دفعةُ رابطٍ كما يقرؤها الخادم (0254:552–562): عددٌ (قيمتُه) أو نصٌّ من ١–١٩ رقماً، صحيحٌ موجبٌ لا يتجاوز bigint — وإلا null.
 *  بـBigInt لا بالعدد الآمن: نصُّ ١٧ رقماً فوق 2⁵³ دفعةٌ صحيحةُ الشكل عند الخادم يُسأل عنها الدفترُ (التلميحُ الثالث)، لا شكلٌ غلط. */
function batchOf(v: unknown): bigint | null {
  let b: bigint;
  if (typeof v === "number") { if (!Number.isInteger(v)) return null; b = BigInt(v); }
  else if (typeof v === "string" && /^[0-9]{1,19}$/.test(v)) b = BigInt(v);
  else return null;
  return b > 0n && b <= BIGINT_MAX ? b : null;
}
/** الفاتورةُ كما تعرفها العيادة (0254:569–571): صفُّ فاتورة، أو دفترُها (المحذوفةُ يبقى دفترُها) — بمعرّفها المخزَّن. */
function knownInvoice(db: DemoDB, key: string): string | undefined {
  return (db.invoices ?? []).find((i) => i.id.toLowerCase() === key)?.id
    ?? (db.consumption ?? []).find((e) => e.invoice_id.toLowerCase() === key)?.invoice_id;
}
/** waste_source_taken (0254:589–598): سطرٌ معلَّقٌ أو معتمد من هالفاتورة لهالمادّة (product_id، وإن أفرغه حذفٌ فـsource_product) يحمل
 *  دفعةً من دفعات السطر؛ أو عُبّي من الفاتورة كلّها وسُجّل بعد أقدم دفعةٍ أو بمللّيها (بالمللي: floor(µs / 1000) كالخادم)؛ أو أيُّ
 *  سطرٍ منها والسطرُ الجديد من الفاتورة كلّها. والمرفوضُ والملغى لا يُعدّان. */
function sourceTaken(list: readonly DemoStockCount[], inv: string, productId: string, batches: readonly number[] | null): boolean {
  const oldestMs = batches?.length ? Math.floor(Math.min(...batches) / 1000) : null;
  return list.some((w) => w.source === "waste" && (w.status === "pending" || w.status === "approved")
    && w.source_invoice === inv && (w.product_id ?? w.source_product ?? null) === productId
    && (batches === null
      || (w.source_batches != null ? w.source_batches.some((b) => batches.includes(b)) : Date.parse(w.counted_at) >= (oldestMs as number))));
}

/** stock_waste_submit بترتيبه (0254:312–499): المصوّر ← الشكل (١–٥٠) ← الإعادةُ بمرجع الجهاز (قبل الدور: سندٌ طُبّق وضاع
 *  جوابُه لا يُرفض عند إعادته) ← «طبّق فوراً» للمدير ← كلُّ سطرٍ بترتيبه، والرفضُ القاطعُ لكلّ السطور قبل «أكّد مرّة ثانية»
 *  ← الإدراجُ معلَّقاً ← الموافقةُ بنفس الطلب إن طُلبت. والمقدارُ d بوحدة المخزون بالضبط: الكميةُ للعلبة، و
 *  _cons_round_div(qty, units_per_box, 9) للصغيرة. والمرفوضُ لا يكتب شيئاً — لا سطراً ولا مرجعاً. */
export function demoSubmitWasteCore(lines: unknown, apply: unknown, clientRef: unknown, deps: WasteDeps): WasteSubmitResult {
  if (demoBaseRole() === "photographer") throw demoHint("waste_forbidden", WH.forbidden);
  if (!Array.isArray(lines) || lines.length === 0) throw demoHint("waste_empty", WH.empty);
  if (lines.length > 50) throw demoHint("waste_too_many", WH.tooMany);
  const ref = clientRef == null ? null : btrim(String(clientRef)) || null;
  const refKey = `${WASTE_FN}\u0000${ref}`;
  const db = loadDB();
  if (ref) {
    const hit = db.rpcRefs?.[refKey];
    if (hit) return hit.result as WasteSubmitResult;
  }
  const doApply = apply === true;
  if (doApply && demoBaseRole() !== "manager" && !demoPinLive()) throw demoHint("waste_needs_manager", WH.needsManager);
  const list = loadCounts();
  const seen = new Set<string>();
  let over: string | null = null;
  type Ok = { p: Product; q: bigint; u: "stock" | "sub"; d: bigint; r: "damaged" | "expired"; note: string; l: string | null; k: bigint; s: bigint;
    inv: string | null; batches: number[] | null };
  const ok: Ok[] = [];
  for (const raw of lines) {
    const l = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const pid = l && typeof l.product_id === "string" ? btrim(l.product_id) : null;
    const p = pid ? findLive(db, pid) : undefined;
    if (!l || !p) throw demoHint("waste_product_missing", WH.productMissing);
    if (p.pooled) throw demoHint("waste_pooled", WH.pooled(p.name));
    if (p.farm_id) throw demoHint("waste_farm", WH.farm(p.name));
    if (seen.has(p.id)) throw demoHint("waste_duplicate", WH.duplicate(p.name));
    seen.add(p.id);
    const reason = typeof l.reason === "string" ? btrim(l.reason) : null;
    if (reason !== "damaged" && reason !== "expired") throw demoHint("waste_reason", WH.reason);
    const note = left200(btrim(textOf(l.note)));
    if (!note) throw demoHint("waste_note", WH.note);
    const unit = l.unit === undefined || l.unit === null || l.unit === "" ? "stock" : typeof l.unit === "string" ? l.unit : null;
    let qM: bigint | null = null;
    if ((typeof l.qty === "number" && Number.isFinite(l.qty)) || (typeof l.qty === "string" && C_DEC.test(l.qty))) {
      try { qM = toMilli(l.qty as number | string); } catch { qM = null; }            // أكثرُ من ٣ منازل ⇒ v_q <> round(v_q, 3)
    }
    const upbM = subUnitMilli(p);
    if ((unit !== "stock" && unit !== "sub") || qM === null || qM <= 0n || qM > 1_000_000_000n || (unit === "sub" && upbM === null)) {
      throw demoHint("waste_bad_qty", WH.badQty(p.name));
    }
    const dN = unit === "sub" ? stockNano(qM, upbM!) : qM * 1_000_000n;
    if (dN <= 0n) throw demoHint("waste_bad_qty", WH.badQty(p.name));
    /* مرجعُ السطر (0254 الجولة الثانية، :534–598) بترتيب الخادم: الشكلُ أوّلاً — دفعاتٌ بلا فاتورة، فاتورةٌ ليست معرّفاً، دفعاتٌ
     * ليست مصفوفةً غيرَ فارغةٍ (≤ ١٠٠) من أعدادٍ صحيحةٍ موجبة بلا تكرار — بتلميح الشكل؛ ثمّ فاتورةٌ لا تعرفها العيادة (لا صفَّ ولا
     * دفتر) بتلميحها؛ ثمّ دفعةٌ بلا حدثٍ لهذه الفاتورة **لهذه المادّة** بالميكروثانية نفسها بتلميحها؛ ثمّ الترتيب؛ ثمّ waste_source_taken
     * (ما سُجّل هدراً قبل من هالفاتورة لهالمادّة) — وكلُّه قبل «معلَّقٌ واحد». معرّفاتُ التجريبيّ ليست uuid: معرّفُ فاتورةٍ يعرفها
     * المخزنُ صحيحُ الشكل هنا كالـuuid هناك، وما سواهما شكلٌ غلط كالخادم (والـuuid المجهول «مو بهالعيادة»). */
    let inv: string | null = null, batches: number[] | null = null;
    const invRaw = l.src_invoice, bRaw = l.src_batches;
    const hasInv = invRaw !== undefined && invRaw !== null, hasB = bRaw !== undefined && bRaw !== null;
    let shapeBad = hasB && !hasInv;
    let invKey: string | null = null;
    if (!shapeBad && hasInv) {
      const key = typeof invRaw === "string" ? btrim(invRaw).toLowerCase() : "";
      if (key && (C_UUID.test(key) || knownInvoice(db, key) !== undefined)) invKey = key; else shapeBad = true;
    }
    let bs: bigint[] | null = null;
    if (!shapeBad && hasB) {
      // رابطُ الإشعار يحمل دفعاتٍ معدودة: الطويلةُ (> ١٠٠) تُرفض قبل حلقتها، بتلميح الشكل (0254 الجولة الثانية W3).
      if (!Array.isArray(bRaw) || bRaw.length === 0 || bRaw.length > 100) shapeBad = true;
      else {
        bs = [];
        for (const x of bRaw) { const b = batchOf(x); if (b === null || bs.includes(b)) { shapeBad = true; break; } bs.push(b); }
      }
    }
    if (shapeBad) throw demoHint("waste_source_bad", WH.sourceShape(p.name));
    if (invKey !== null) {
      inv = knownInvoice(db, invKey) ?? null;
      if (inv === null) throw demoHint("waste_source_bad", WH.sourceUnknown(p.name));
    }
    if (bs !== null) {
      const evs = (db.consumption ?? []).filter((e) => e.invoice_id === inv && e.product_id === p.id);
      if (!bs.every((b) => evs.some((e) => BigInt(evUs(e)) === b))) throw demoHint("waste_source_bad", WH.sourceBatch(p.name));
      batches = [...bs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(Number);
    }
    // مطالبةٌ ثانية بما سُجّل هدراً من هالفاتورة لهالمادّة (0254 الجولة الثانية W1): بعد الدفعات وقبل «معلَّقٌ واحد».
    if (inv !== null && sourceTaken(list, inv, p.id, batches)) throw demoHint("waste_source_taken", WH.sourceTaken(p.name));
    // معلَّقٌ واحدٌ لكلّ مادّة، جرداً كان أو سنداً — قبل «أكّد»: رفضٌ قاطعٌ لا يُسأل عنه مرّتين.
    if (list.some((c) => c.product_id === p.id && c.status === "pending")) throw demoHint("waste_already_pending", WH.pending(p.name));
    // فوق الرصيد بالنظام (max(stock, 0)): حارسُ خطأ الكتابة لا منع — أوّلُ سطرٍ بلا ack_over يُسأل عنه بعد السطور كلّها،
    // والرقمان بالوحدة التي كُتبت.
    const sM = milliOf(p.stock);
    const sub = unit === "sub";
    const label = sub ? btrim(p.sub_unit_name ?? "") : "";
    const lbl = sub && label ? ` ${label}` : "";
    if (over === null && dN > (sM > 0n ? sM : 0n) * 1_000_000n && l.ack_over !== true) {
      over = WH.exceeds(p.name, sub ? trimScale(roundDiv(sM * upbM!, 1000n), 3) : trimScale(sM, 3), lbl, trimScale(qM, 3));
    }
    ok.push({ p, q: qM, u: unit, d: dN, r: reason, note, l: sub && label ? label : null, k: stockUnitCost(p), s: sM, inv, batches });
  }
  if (over !== null) throw demoHint("waste_exceeds_stock", over);

  const now = new Date().toISOString();
  const me = session();
  const ids: string[] = [];
  const outLines: WasteSubmitResult["lines"] = [];
  for (const e of ok) {
    const id = uid("cnt");
    ids.push(id);
    list.unshift({
      id, product_id: e.p.id, product_name: e.p.name, system_qty: fromScaled(e.d, 9), counted_qty: 0, unit_cost: fromScaled(e.k, 6),
      reason: e.r, note: e.note, status: "pending", counted_by: me.id, counted_by_name: me.name, counted_at: now,
      decided_by: null, decided_by_name: null, decided_at: null, applied_delta: null, expense_id: null, lot_counts: null,
      source: "waste", entered_qty: fromScaled(e.q, 3), entered_unit: e.u, unit_label: e.l, posted: null,
      // ومادّةُ السطر المعبّأ من فاتورة (0254 الجولة الثانية W2: source_product حين يحضر source_invoice وحده) — الحذفُ يُفرغ
      // product_id والقارئُ يقولها منها.
      source_invoice: e.inv, source_batches: e.batches, source_product: e.inv !== null ? e.p.id : null,
    });
    outLines.push({ product_id: e.p.id, name: e.p.name, stock_now: fromScaled(e.s, 3), stock_after: fromScaled(e.s * 1_000_000n - e.d, 9) });
  }
  saveCounts(list);
  const decided = doApply ? demoDecideCounts(ids, true, deps.addExpense, deps.post) : null;
  const pending = loadCounts().filter((c) => ids.includes(c.id) && c.status === "pending").length;
  const out: WasteSubmitResult = { pending, ids, decided: decided as WasteSubmitResult["decided"], lines: outLines };
  if (ref) {
    const d2 = loadDB();
    (d2.rpcRefs ??= {})[refKey] = { fn: WASTE_FN, client_ref: ref, result: out, created_at: now };
    saveDB(d2);
  }
  return out;
}

/* ── الدمجُ والحذفُ لا يُضيّعان سنداً (0254:503–568) ─────────────────────────────────────── */
/** products_trash_consumption (0254): توأمٌ عليه سندٌ معلَّق وأصلُه عليه معلَّقٌ (جردٌ أو سند) ⇒ merge_waste_pending بالاسمين
 *  قبل أيّ نقل؛ وإلا تنتقل سنداتُ التوأم **كلُّها** (المعلَّقُ والمعتمد) لأصله الحيّ. يرجع: هل تغيّر شيء. */
export function wasteFollowMerge(list: DemoStockCount[], twin: { id: string; name: string }, keeper: { id: string; name: string | null; live: boolean }): boolean {
  if (list.some((c) => c.product_id === twin.id && c.source === "waste" && c.status === "pending")
    && list.some((c) => c.product_id === keeper.id && c.status === "pending")) {
    throw demoHint("merge_waste_pending", WH.mergePending(twin.name ?? "", keeper.name ?? ""));
  }
  let moved = false;
  if (keeper.live) for (const c of list) if (c.product_id === twin.id && c.source === "waste") { c.product_id = keeper.id; moved = true; }
  // ومادّةُ السطر المعبّأ من فاتورة تتبع التوأمَ كدفتر الفاتورة — بلا شرط (0254 الجولة الثانية W2)، ولو أفرغ حذفٌ سابقٌ product_id.
  for (const c of list) if (c.source_product != null && c.source_product === twin.id) { c.source_product = keeper.id; moved = true; }
  return moved;
}
/** stock_counts.product_id → products(id) on delete set null (0216:76): صفوفُ مادّةٍ خرجت تبقى باسمها بلا معرّف. */
export function countsProductGone(list: DemoStockCount[], productId: string): boolean {
  let n = false;
  for (const c of list) if (c.product_id === productId) { c.product_id = null; n = true; }
  return n;
}
/** products_waste_guard (0254، قبل الحذف): مادّةٌ عليها سندُ تلفٍ معلَّق لا تُحذف حتى يبتّ المدير. */
export function wasteDeleteGuard(list: DemoStockCount[], product: { id: string; name: string | null }): void {
  if (list.some((c) => c.product_id === product.id && c.source === "waste" && c.status === "pending")) {
    throw demoHint("product_waste_pending", WH.deletePending(product.name ?? ""));
  }
}
