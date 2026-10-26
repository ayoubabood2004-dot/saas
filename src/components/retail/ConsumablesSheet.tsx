import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, Package, RotateCcw, ScanLine, Search, Trash2, Undo2 } from "lucide-react";
import type { ConsumableEntry, Product } from "@/types";
import { Button, Dialog, Skeleton } from "@/components/ui";
import {
  consumptionApi,
  type ConsumptionMove, type ConsumptionSkip, type ConsumptionSpec, type InvoiceConsumption, type InvoiceConsumptionMap,
  type RecipeGet, type RecipeLine, type RecipeUnit,
} from "@/lib/consumptionApi";
import {
  MAX_RECIPE_LINES, fromScaled, overrideRefusal, parseRecipeLine, perDivMilli, perValueCents, roundDiv, roundScaled,
  sameConsumables, stockUnitCost, subUnitMilli, targetNano,
} from "@/lib/consumption";
import { codeMatcher, findByCode, matchTruncatedCode, rescueScan } from "@/lib/productCodes";
import { cn, formatQty, money, searchable } from "@/lib/utils";
import { normalizeDigits } from "@/lib/digits";
import { describeDbError, withTimeout } from "@/lib/errors";
import { holdUpdates } from "@/lib/inflight";
import { playTap, playWarning } from "@/lib/sounds";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { repo } from "@/lib/repo";

/* ============================================================================
 * مستهلكاتُ سطر الخدمة بالبيعة (0252) — الورقةُ وإشعارُ ما بعدها.
 *
 * الورقة: ما انصرف على **حالةٍ واحدة** من السطر، مملوءةً من تعديلٍ سابق إن كان وإلا من الوصفة.
 * الطبيبُ أو المديرُ يعدّلها لهالفاتورة وحدها («هالحالة بس» تفصل حالةً بسطرها، و«كل حالات
 * السطر» تطبّقها على السطر كلّه)، وغيرُهما يراها ولا يلمسها — والخادمُ يفرض الدورَ نفسَه
 * (consumables_case_role). وصفةٌ ما وصلت = ورقةٌ للقراءة: تعديلٌ يُبنى على وصفةٍ مجهولة قد يُسقط
 * موادَّ بصمت، والبيعةُ بلا تعديل تخصم الوصفةَ كما هي. وقائمةٌ تساوي الوصفة لا تُرسل تعديلاً.
 * والكمياتُ والكلفُ بالألف وبالفلس (consumption.ts) لا بالعائم، ومادّةٌ **عُرف** أن الخادمَ لا يجدها
 * بمخزن العيادة (الوصفةُ تقولها product_gone، أو لا بالقائمة ولا بوصفةٍ انقرأت) لا تُرسل — يرفض البيعةَ كلَّها
 * عليها (consumables_bad). أمّا والوصفةُ ما انقرأت فالغائبةُ عن القائمة مجهولة: تُرسل كما حُفظت وكلفتُها null —
 * قراءةٌ فشلت لا تُسقط سطراً حفظه الطبيب.
 *
 * والمسحُ بحقله هو: الماسحُ العامّ بالبيع مطفأٌ والورقةُ مفتوحة (شاشةُ البيع)، فالمسحةُ تقع هنا وحدها
 * ولا تهبط سطراً بالسلّة خلفها. ورمزٌ لا يُعرف يُقال كما وصل، بلا نافذة «اربطه بمنتج» (قرارُ المالك).
 * وورقةٌ تغيّرت عمّا فُتحت به لا تُرمى بلمسة: الستارةُ وEsc وX و«إغلاق» تسأل بنافذةٍ فوقها (مكدّسُ Dialog) ما يصير
 * لو طلع — الوصفةُ كما هي أو القائمةُ المحفوظة — والنسخةُ الجديدة لا تنزل تحتها (holdUpdates). كانت تُطوى بلا كلمة
 * فتبيع الوصفةَ عن حالةٍ زاد لها الطبيبُ زوجاً، ولا أثرَ إلا نقطةٌ غائبة (سابقةُ محرّر الوصفة والمشتريات).
 *
 * والإشعار (ConsumptionNotice): يقرأ دفترَ الفاتورة مرّةً ويقول ما قرأه وحده — عجزٌ صار سالباً،
 * مادّةٌ ما انخصمت، وما يرجع للمخزن قبل الترجيع وما رجع بعده — ما رجّعه ذلك الفعلُ بدفعته (لحظةُ طلبه من
 * الأمّ: sentAt) لا المتراكمُ منذ البيعة، فترجيعٌ ثانٍ لا يعيد الأوّل. والبيعةُ النظيفة صامتة، وفشلُ القراءة
 * يُقال فشلاً لا صمتاً («ما صار شي» عن شيءٍ لم يُقرأ كذبة). والكتمُ لكلّ مادّةٍ بهالجهاز، بزرٍّ بكلّ تحذيرٍ
 * عنها — عجزٌ، أو رصيدٌ صار سالباً (سطرُ مادّةٍ بيع من قائمةٍ قديمة) — وتراجعُه بمكانه («لا إنذارَ بلا كتم»):
 * يُخرجها من هذا الإشعار وحده، لا من الشارة ولا من التقرير. وكتمٌ ما انحفظ (المخزنُ ممتلئ أو مقفول) يُقال «هنا بس»
 * لا «على هالجهاز» — الإشعارُ الجاي يقولها. والإشعارُ يلفّ الكلمةَ الطويلة (break-words يُورَث): اسمُ المادّة بيانُ
 * مستخدمٍ بأيّ طول، واسمٌ بلا فاصلٍ أعرضُ من عموده كان يرسم فوق زرّه فتقع ضغطةُ آخره على «لا تذكّرني».
 *
 * والوحدةُ كسولةٌ بنطاقها المملوك rcp: لا يستوردها أحدٌ ثابتاً — page(…, ["rcp"]) من مستعملها.
 * وكلُّ ما تستورده بحزمة الإقلاع أو بقطعةٍ مشتركةٍ قائمة: وحدةٌ تعيش داخل قطعة صفحة (الماسح العامّ
 * بقطعة البيع) تُشقّ قطعةً جديدة يدفع اسمَها الإقلاع.
 * ==========================================================================*/

export interface ConsumablesSheetProps {
  open: boolean;
  onClose(): void;
  serviceId: string;
  serviceName: string;
  /** cases on this line (the line's qty) */
  lineQty: number;
  /** the line's current override; undefined/null = the recipe */
  value: ConsumableEntry[] | null | undefined;
  /** SaleBuilder's complete product list (all pages) — for «+ مادة», stock and units */
  products: Product[];
  /** vet or manager (PIN included). false → read-only with the rcp note */
  canEdit: boolean;
  /** can("viewProfits") && !restricted */
  showCost: boolean;
  /** next: null = back to the recipe; [] = nothing for this case; else the list (per ONE case).
   *  est: materials cost per case (a number of dinars, 2 dp, from the exact cents math) or null when unknown.
   *  scope: "line" = every case on the line; "one" = split one case off (only offered when lineQty > 1). */
  onSave(next: ConsumableEntry[] | null, est: number | null, scope: "line" | "one"): void;
}

export interface ConsumptionNoticeProps {
  mode: "sale" | "preview" | "returned";
  invoiceIds: string[];
  /** preview of a partial return / edit: each touched line → its qty after. Absent = the whole invoice to 0. */
  targets?: { item_id: string; qty: number }[];
  /** preview: the action being confirmed — "delete" says «الحذف» where the default says «الترجيع». */
  action?: "delete";
  /** returned: the parent's performance.now() taken immediately before it sent the reversal request.
   *  It picks THIS action's batches out of the invoice's ledger; absent = nothing is said. */
  sentAt?: number;
  /** returned: money actually paid back to the customer by this action (> 0.005). */
  cashBack?: boolean;
}

const NANO = 1_000_000_000n;
const MILLI_PER_NANO = 1_000_000n;
/** نتائجُ «+ مادة» المعروضة — والباقي يُعدّ ويُقال، لا يُخفى. */
const PICK_MAX = 30;

/* ── الورقة ──────────────────────────────────────────────────────────────── */

/** سطرُ الورقة كما يُكتب: الكميةُ نصٌّ حتى الحفظ (الحقلُ لا يقرّب ما يكتبه الطبيب). */
interface Row { id: string; qty: string; unit: RecipeUnit }

const keyOf = (id: string) => id.toLowerCase();
/** نصُّ الكمية كما يقرؤه numeric: الأرقامُ الشرقية وفاصلتُها لاتينية. */
const qtyText = (s: string) => normalizeDigits(s).trim();
const milliOf = (s: string): bigint | null => parseRecipeLine({ product_id: "x", qty: qtyText(s), unit: "stock" })?.qty_m ?? null;
/** بصمةُ السطور كما تُحفظ — المادّةُ ووحدتُها وكميتُها بالألف، بلا ترتيب: «2.0» = «2»، وطيُّ الدمج عند الفتح ليس تعديلاً
 *  (السطورُ تُقارَن بما فُتحت به مطويّاً). كميةٌ لا تُقرأ تبقى بنصّها: كتابتُها تعديل. */
const rowsKey = (rs: readonly Row[]): string =>
  rs.map((r) => `${keyOf(r.id)}|${r.unit}|${milliOf(r.qty) ?? `?${qtyText(r.qty)}`}`).sort().join("\n");

/** مادّةٌ تكرّرت بنفس الوحدة (دمجٌ ترك سطرين لمادّة) تُجمع بالألف؛ وبوحدتين تبقى سطرين يُقالان عند الحفظ. */
function foldEntries(list: readonly { product_id: string; qty: number | string; unit?: string | null }[]): Row[] {
  const out: { id: string; m: bigint | null; raw: string; unit: RecipeUnit }[] = [];
  for (const e of list) {
    const unit: RecipeUnit = e.unit === "sub" ? "sub" : "stock";
    const m = parseRecipeLine({ product_id: e.product_id, qty: e.qty, unit })?.qty_m ?? null;
    const at = out.findIndex((r) => keyOf(r.id) === keyOf(e.product_id) && r.unit === unit);
    if (at >= 0 && m !== null && out[at].m !== null) { out[at].m = (out[at].m as bigint) + m; continue; }
    out.push({ id: e.product_id, m, raw: String(e.qty), unit });
  }
  return out.map((r) => ({ id: r.id, qty: r.m !== null ? String(fromScaled(r.m, 3)) : r.raw, unit: r.unit }));
}

type RecipeState = { kind: "loading" } | { kind: "ok"; r: RecipeGet } | { kind: "failed"; e: unknown };

/** رصيدُ صفّ المادّة وحده — عليه يكتب الصرف (_stock_post)، لا على حوض القسم الذي تضمّه قائمةُ البيع (sellable.ts).
 *  سطرُ الوصفة برصيد الخادم (طازجٌ لحظةَ الفتح)، وغيرُه برصيد القائمة ما دامت المادّةُ بلا قسم — وإلا لا رقم:
 *  فراغٌ صادق خيرٌ من رقمٍ يضمّ حوضاً لا يُصرف منه. */
const rowStock = (p: Product | null, rl: RecipeLine | null): number | null =>
  rl ? rl.stock : p && !p.section_id ? Number(p.stock) : null;

export default function ConsumablesSheet(p: ConsumablesSheetProps): JSX.Element | null {
  // كلُّ فتحةٍ تبدأ من props: الإغلاقُ (بعد سؤاله إن تغيّر شي) يرمي التعديل، والورقةُ لا تكتب على ما وصلها.
  if (!p.open) return null;
  return <SheetBody {...p} />;
}

function SheetBody({ onClose, serviceId, serviceName, lineQty, value, products, canEdit, showCost, onSave }: ConsumablesSheetProps) {
  const { t } = useTranslation();
  const uid = useId();
  const own = Array.isArray(value);
  const [rs, setRs] = useState<RecipeState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(() => (own ? foldEntries(value as ConsumableEntry[]) : null));
  /** السطورُ كما فُتحت (مطويّةً): التعديلُ القائم لحظةَ الفتح، أو الوصفةُ لحظةَ وصولها — بها يُعرف «تغيّر شي». */
  const [base, setBase] = useState<Row[] | null>(rows);
  /** خروجٌ طُلب وبالورقة ما لم يُحفظ: يُسأل بنافذةٍ فوقها قبل أن يضيع. */
  const [leave, setLeave] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [scan, setScan] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let alive = true;
    setRs({ kind: "loading" });
    consumptionApi.recipeGet(serviceId).then(
      (r) => {
        if (!alive) return;
        if (!r || !Array.isArray(r.lines)) { setRs({ kind: "failed", e: new Error("recipe_shape") }); return; }
        setRs({ kind: "ok", r });
        setRows((cur) => cur ?? foldEntries(r.lines));
        setBase((cur) => cur ?? foldEntries(r.lines));
      },
      (e) => { if (alive) setRs({ kind: "failed", e }); },
    );
    return () => { alive = false; };
  }, [serviceId, tick]);

  /* ما كتبه الطبيبُ لهالحالة ولم يُحفظ: الستارةُ وEsc وX و«إغلاق» كانت تطويه بلا كلمة — فتخصم البيعةُ الوصفةَ (أو
     القائمةَ القديمة) عن حالةٍ زاد لها زوجاً، ولا أثرَ إلا نقطةٌ غائبة. فالخروجُ يسأل، ولا تنزل نسخةٌ جديدة تحته. */
  const changed = rows !== null && base !== null && rowsKey(rows) !== rowsKey(base);
  useEffect(() => (changed ? holdUpdates(Infinity) : undefined), [changed]);
  const tryClose = () => {
    if (changed) { playWarning(); setLeave(true); } else onClose();
  };

  const pm = useMemo(() => new Map(products.map((x) => [keyOf(x.id), x])), [products]);
  const lines = useMemo<RecipeLine[]>(() => (rs.kind === "ok" ? rs.r.lines : []), [rs]);
  const rlm = useMemo(() => {
    const m = new Map<string, RecipeLine>();
    for (const l of lines) if (!m.has(keyOf(l.product_id))) m.set(keyOf(l.product_id), l);
    return m;
  }, [lines]);
  const recipeRows = useMemo(() => foldEntries(lines).map((r) => ({ product_id: r.id, qty: r.qty, unit: r.unit })), [lines]);

  const editable = canEdit && rows !== null && (own || rs.kind === "ok");
  const ready = editable && rs.kind !== "loading";
  // الخدمةُ ما وصلت السحابة: البيعةُ لا تخصم لها شيئاً (service_missing) — فلا يُقال «تخصم الوصفة كما هي»، والتلميحُ يقول السبب.
  const svcMissing = rs.kind === "failed" && (rs.e as { message?: unknown } | null)?.message === "recipe_service_missing";
  const lineM = Number.isFinite(lineQty) && lineQty > 0 ? roundScaled(lineQty, 3) : 1000n;
  const many = lineM > 1000n;
  const box = t("retail.unitBox", "علبة");

  /** كلُّ ما يُعرض ويُحسب عن سطر: المادّةُ من قائمة البيع أوّلاً، ثم من سطر الوصفة (لقطةُ اسمٍ ورصيد). */
  const viewOf = (row: Row) => {
    const p = pm.get(keyOf(row.id)) ?? null;
    const rl = rlm.get(keyOf(row.id)) ?? null;
    const name = p?.name ?? rl?.product_name ?? t("rcp.unknownName", "مادة مو موجودة بالقائمة");
    const qtyM = parseRecipeLine({ product_id: row.id, qty: qtyText(row.qty), unit: row.unit })?.qty_m ?? null;
    let reason: string | null = null;
    let sendable = true;     // الخادمُ يعرفها بمخزن العيادة (يخصمها أو يتخطّاها بملاحظة) — لا رفض
    let known = true;        // كلفتُها معروفة (أو صفرٌ مؤكَّد لمتخطّاة) — وإلا فكلفةُ الحالة مجهولة لا ناقصة
    let divM: bigint | null = null;
    let k = 0n;
    if (p) {
      if (p.farm_id) reason = t("rcp.farm", "من مخزون الحقل — ما تنخصم");
      else if (p.pooled) reason = t("rcp.pooled", "رصيدها بحوض القسم — ما تنخصم");
      else {
        divM = perDivMilli(row.unit, p);
        if (divM === null) reason = t("rcp.noSub", "ما إلها وحدة صغيرة — ما تنخصم");
        else k = stockUnitCost(p);
      }
    } else if (rl && rl.problem !== "product_gone") {
      if (rl.problem === "in_trash") reason = t("rcp.trash", "بالمحذوفات — ما تنخصم");
      else if (rl.problem === "pooled") reason = t("rcp.pooled", "رصيدها بحوض القسم — ما تنخصم");
      else if (rl.problem === "farm_stock") reason = t("rcp.farm", "من مخزون الحقل — ما تنخصم");
      else if (rl.problem === "no_sub_unit") reason = t("rcp.noSub", "ما إلها وحدة صغيرة — ما تنخصم");
      else {
        // حيّةٌ بالخادم وغائبةٌ عن قائمة هالشاشة (أُضيفت من جهازٍ آخر): بقيم سطر الوصفة.
        reason = t("rcp.stale", "مو بقائمة هالشاشة — حدّث الصفحة");
        divM = row.unit === "stock" ? 1000n : (rl.units_per_box != null && rl.units_per_box > 0 ? roundScaled(rl.units_per_box, 3) : null);
        k = roundScaled(rl.unit_cost ?? 0, 6);
      }
    } else if (!rl && rs.kind !== "ok") {
      // الوصفةُ ما انقرأت: مادّةٌ غائبةٌ عن قائمة هالشاشة **مجهولة** لا «محذوفة» (أُضيفت من جهازٍ آخر بعد تحميل
      // القائمة، أو بالمحذوفات) — فلا تُسقطها قراءةٌ فشلت من تعديلٍ حفظه الطبيب. تُرسل كما حُفظت والخادمُ يحكم،
      // وكلفتُها مجهولة فكلفةُ الحالة null («—» بمعاينة الربح) لا رقمٌ ينقصها.
      reason = t("rcp.stale", "مو بقائمة هالشاشة — حدّث الصفحة");
      known = false;
    } else {
      reason = t("rcp.gone", "مو موجودة بالمخزن — ما تنحسب");
      sendable = false;
    }
    const costC = divM !== null && qtyM !== null ? perValueCents(qtyM, k > 0n ? k : 0n, divM) : null;
    const sub = p ? subUnitMilli(p) !== null : row.unit === "sub";
    const subName = p?.sub_unit_name || rl?.unit_label || t("retail.unitSingle", "مفرد");
    const stockWord = p?.sold_by_weight ? t("retail.unitKg", "كغ") : box;
    const unitWord = row.unit === "sub" ? subName : stockWord;
    const stock = rowStock(p, rl);
    return { row, p, name, qtyM, reason, sendable, known, costC, sub, subName, unitWord, stockWord, stock };
  };
  const views = (rows ?? []).map(viewOf);
  const caseC = views.reduce((s, v) => (v.sendable && v.costC !== null ? s + v.costC : s), 0n);
  const caseKnown = views.every((v) => !v.sendable || v.known);

  const setRow = (i: number, patch: Partial<Row>) => setRows((cur) => (cur ? cur.map((r, j) => (j === i ? { ...r, ...patch } : r)) : cur));
  const removeRow = (i: number) => { setRows((cur) => (cur ? cur.filter((_, j) => j !== i) : cur)); setErr(null); };

  /** مادّةٌ من «+ مادة» أو من المسح: موجودةٌ ⇒ +١ بوحدة سطرها، وإلا سطرٌ جديد (بالوحدة الصغيرة إن كانت). */
  const addOrBump = (p: Product): string | null => {
    if (!rows) return null;
    if (p.farm_id) return t("rcp.farm", "من مخزون الحقل — ما تنخصم");
    if (p.pooled) return t("rcp.pooled", "رصيدها بحوض القسم — ما تنخصم");
    const i = rows.findIndex((r) => keyOf(r.id) === keyOf(p.id));
    if (i >= 0) {
      const m = milliOf(rows[i].qty);
      const next = String(fromScaled((m ?? 0n) + 1000n, 3));
      setRow(i, { qty: next });
      return t("rcp.scanBumped", { name: p.name, qty: formatQty(Number(next)), defaultValue: "\"{{name}}\" صارت {{qty}}" });
    }
    if (rows.length >= MAX_RECIPE_LINES) return null;
    setRows([...rows, { id: p.id, qty: "1", unit: subUnitMilli(p) !== null ? "sub" : "stock" }]);
    return t("rcp.scanAdded", { name: p.name, defaultValue: "انضافت \"{{name}}\"" });
  };

  const onScan = (code: string) => {
    if (!code.trim() || !editable) return;
    const p = findByCode(products, code) ?? rescueScan(products, code)?.product ?? matchTruncatedCode(products, code);
    if (!p) {
      playWarning();
      // كما وصل — لا تطبيعَ للعرض، ولا نافذةَ ربطٍ بمنتجٍ قائم (قرارُ المالك).
      setNote({ tone: "bad", text: t("retail.scanUnknown", "الباركود {{code}} مو موجود بمخزنك — إذا المادّة عندك أضفها من المخزون بهذا الباركود", { code }) });
      return;
    }
    if (rows && rows.length >= MAX_RECIPE_LINES && !rows.some((r) => keyOf(r.id) === keyOf(p.id))) {
      setNote({ tone: "bad", text: t("rcp.max", { n: formatQty(MAX_RECIPE_LINES), defaultValue: "{{n}} مادة بالأكثر" }) });
      return;
    }
    const said = addOrBump(p);
    const blocked = !!p.farm_id || !!p.pooled;
    if (blocked) playWarning(); else playTap();
    setNote(said ? { tone: blocked ? "bad" : "ok", text: blocked ? `${p.name}: ${said}` : said } : null);
    setErr(null);
  };

  const hits = useMemo(() => {
    if (q === null) return null;
    const s = searchable(q);
    if (!s) return { list: [] as Product[], more: 0 };
    const byCode = codeMatcher(q);
    const all = products.filter((x) => searchable(x.name).includes(s) || byCode(x));
    return { list: all.slice(0, PICK_MAX), more: Math.max(0, all.length - PICK_MAX) };
  }, [q, products]);

  const save = (scope: "line" | "one") => {
    if (!rows || !ready) return;
    setTried(true);
    if (views.some((v) => v.qtyM === null)) { setErr(t("rcp.fixRows", "صحّح الكميات المعلّمة بالأحمر")); return; }
    const seen = new Set<string>();
    for (const v of views) {
      if (seen.has(keyOf(v.row.id))) { setErr(t("rcp.dup", { name: v.name, defaultValue: "\"{{name}}\" مكرّرة — خلّيها بسطر واحد" })); return; }
      seen.add(keyOf(v.row.id));
    }
    const shown = rows.map((r) => ({ product_id: r.id, qty: qtyText(r.qty), unit: r.unit }));
    // قائمةٌ تساوي الوصفة = الوصفة: لا تعديلَ يُرسل (والخادمُ يُسقطه أصلاً).
    if (rs.kind === "ok" && sameConsumables(shown, recipeRows)) { onSave(null, null, scope); return; }
    const sent = views.filter((v) => v.sendable);
    const next: ConsumableEntry[] = sent.map((v) => ({ product_id: v.row.id, qty: fromScaled(v.qtyM as bigint, 3), unit: v.row.unit }));
    if (overrideRefusal(next)) { setErr(t("rcp.bad", "القائمة بيها غلط — صحّحها")); return; }
    const est = sent.reduce((s, v) => (v.costC !== null ? s + v.costC : s), 0n);
    onSave(next, sent.every((v) => v.known) ? fromScaled(est, 2) : null, scope);
  };

  const footer = (
    <>
      {/* الرجوعُ للوصفة لأيّ دور: لا يحتاج دوراً بالخادم، وتلميحُ consumables_case_role يقول للاستقبال «شيل التعديل». */}
      {own && (
        <Button variant="ghost" size="sm" data-cons-reset leftIcon={<RotateCcw size={14} />} onClick={() => onSave(null, null, "line")}>
          {t("rcp.reset", "رجّع للوصفة")}
        </Button>
      )}
      <Button variant="outline" size="sm" data-cons-close onClick={tryClose}>{t("common.close", "إغلاق")}</Button>
      {editable && (many ? (
        <>
          <Button variant="secondary" size="sm" data-cons-save="one" disabled={!ready} onClick={() => save("one")}>{t("rcp.one", "هالحالة بس")}</Button>
          <Button size="sm" data-cons-save="line" disabled={!ready} onClick={() => save("line")}>
            {t("rcp.all", { n: formatQty(lineQty), defaultValue: "كل حالات السطر (×{{n}})" })}
          </Button>
        </>
      ) : (
        <Button size="sm" data-cons-save="line" disabled={!ready} onClick={() => save("line")}>{t("common.save", "حفظ")}</Button>
      ))}
    </>
  );

  return (
    <Dialog open onClose={tryClose} size="lg" footer={footer}
      title={t("rcp.title", { name: serviceName, defaultValue: "مستهلكات هالحالة — {{name}}" })}>
      <div className="space-y-3" data-cons-sheet>
        {!canEdit && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted" data-cons-readonly>
            <Lock size={13} className="shrink-0" /> {t("rcp.readOnly", "تعديل المستهلكات للطبيب أو المدير")}
          </p>
        )}
        {rs.kind === "failed" && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 text-xs dark:border-danger-500/30 dark:bg-danger-500/10" data-cons-recipe-fail>
            <AlertTriangle size={14} className="shrink-0 text-danger-600" />
            <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">
              {own || svcMissing ? t("rcp.recipeFailShort", "ما گدرنا نجيب الوصفة") : t("rcp.recipeFail", "ما گدرنا نجيب الوصفة — البيعة تخصم الوصفة كما هي")}
              <span className="block font-medium opacity-60">{describeDbError(rs.e, t)}</span>
            </span>
            <Button size="sm" variant="secondary" data-cons-retry leftIcon={<RotateCcw size={13} />} onClick={() => setTick((n) => n + 1)}>
              {t("common.retry", "إعادة المحاولة")}
            </Button>
          </div>
        )}
        {rows === null ? (rs.kind === "loading" ? <Skeleton className="h-24 w-full rounded-2xl" /> : null) : (
          <>
            <p className="text-xs font-semibold text-ink-muted" data-cons-header>
              {t("rcp.perCase", "لكل حالة")}
              {many && <> · {t("rcp.lineTimes", { n: formatQty(lineQty), defaultValue: "السطر ×{{n}}" })}</>}
            </p>
            {rs.kind === "ok" && lines.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-2.5 text-xs text-ink-muted" data-cons-norecipe>
                {/* «ضيف اللي استعملته» لمن يقدر يضيف وحده — وللقراءة ما يصير فعلاً: لا شيء، أو القائمةُ المحفوظة. */}
                {editable
                  ? t("rcp.noRecipe", "هالخدمة ما إلها وصفة — ضيف اللي استعملته")
                  : own && rows.length > 0
                    ? t("rcp.noRecipeList", "هالخدمة ما إلها وصفة — ينخصم اللي بالقائمة")
                    : t("rcp.noRecipeNone", "هالخدمة ما إلها وصفة — ما ينخصم إلها شي")}
              </p>
            )}
            {views.length > 0 && (
              <ul className="space-y-2">
                {views.map((v, i) => {
                  const bad = v.qtyM === null && (tried || v.row.qty.trim() !== "");
                  const totalM = v.qtyM !== null ? roundDiv(v.qtyM * lineM, 1000n) : null;
                  const low = v.reason === null && v.stock !== null && v.stock <= 0;
                  // الرصيدُ بوحدة المخزون دائماً: بجانب «٢ زوج» يُقال «١ علبة» لا «١» — علبةٌ فيها خمسون زوجاً تُقرأ زوجاً واحداً.
                  const stockN = v.stock === null ? "" : v.row.unit === "sub" ? `${formatQty(v.stock)} ${v.stockWord}` : formatQty(v.stock);
                  return (
                    <li key={`${v.row.id}|${v.row.unit}|${i}`} className="rounded-2xl border border-line p-2.5" data-cons-row={v.row.id}>
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{v.name}</p>
                        {showCost && v.sendable && v.costC !== null && (
                          <span className="shrink-0 text-2xs tabular-nums text-ink-subtle" data-cons-cost>{money(fromScaled(v.costC, 2))}</span>
                        )}
                        <button type="button" aria-label={t("common.remove", "إزالة")} data-cons-remove={v.row.id} disabled={!editable}
                          onClick={() => removeRow(i)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-danger-600 disabled:opacity-60">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {/* الحقلُ باسم مادّته وحالتِه: «صحّح المعلّمة بالأحمر» لا يُرى بقارئ الشاشة بلونه. */}
                        <input value={v.row.qty} inputMode="decimal" dir="ltr" disabled={!editable} data-cons-qty={v.row.id}
                          aria-label={v.name} aria-invalid={bad} aria-describedby={bad ? `${uid}-bad-${i}` : undefined}
                          onChange={(e) => { setRow(i, { qty: e.target.value }); setErr(null); }}
                          className={cn("input h-9 w-24 px-2.5 py-1 text-sm tabular-nums", bad && "border-danger-400")} />
                        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5" role="group"
                          aria-label={t("rcp.unitOf", { name: v.name, defaultValue: "وحدة \"{{name}}\"" })}>
                          {(["stock", "sub"] as const).map((u) => (
                            <button key={u} type="button" data-cons-unit={u} aria-pressed={v.row.unit === u}
                              disabled={!editable || !v.p || (u === "sub" && !v.sub)}
                              onClick={() => setRow(i, { unit: u })}
                              className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold transition disabled:cursor-not-allowed",
                                v.row.unit === u ? "bg-brand-600 text-white" : "text-ink-muted hover:text-ink disabled:opacity-60")}>
                              {u === "sub" ? v.subName : (v.p?.sold_by_weight ? t("retail.unitKg", "كغ") : box)}
                            </button>
                          ))}
                        </div>
                        {many && totalM !== null && (
                          <span className="text-xs tabular-nums text-ink-muted" data-cons-total={v.row.id}>= {formatQty(fromScaled(totalM, 3))} {v.unitWord}</span>
                        )}
                      </div>
                      {bad && <p id={`${uid}-bad-${i}`} className="mt-1 text-2xs font-semibold text-danger-600" data-cons-badqty>{t("rcp.badQtyRule", "اكتب كمية أكبر من صفر — لحد مليون وبثلاث مراتب عشرية أقصى")}</p>}
                      {v.reason ? (
                        <p className="mt-1 text-2xs font-semibold text-warn-600" data-cons-reason>{v.reason}</p>
                      ) : v.stock !== null && (
                        <p className={cn("mt-1 text-2xs", low ? "font-semibold text-danger-600" : "text-ink-subtle")} data-cons-stock={low ? "low" : "ok"}>
                          {low
                            ? t("rcp.stockLow", { n: stockN, defaultValue: "الرصيد {{n}} — تنخصم وتصير بالسالب (البيعة ما تنمنع)" })
                            : t("rcp.stock", { n: stockN, defaultValue: "الرصيد: {{n}}" })}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {showCost && views.length > 0 && (
              <p className="text-xs font-semibold text-ink-muted" data-cons-case-cost>
                {t("rcp.caseCost", { v: caseKnown ? money(fromScaled(caseC, 2)) : "—", defaultValue: "كلفة المواد لكل حالة: {{v}}" })}
              </p>
            )}
            {editable && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* «+» بنصّ المفتاح نفسِه (كمحرّر الوصفة): أيقونةُ زائدٍ قبله كانت تُرسم «+ + مادة». */}
                  <Button variant="secondary" size="sm" data-cons-add
                    disabled={rows.length >= MAX_RECIPE_LINES} onClick={() => setQ((cur) => (cur === null ? "" : null))}>
                    {t("rcp.add", "+ مادة")}
                  </Button>
                  <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">
                    <ScanLine size={14} className="shrink-0" />
                    <input value={scan} autoFocus data-cons-scan placeholder={t("rcp.scanPh", "امسح العلبة اللي استعملتها")}
                      aria-label={t("rcp.scanPh", "امسح العلبة اللي استعملتها")}
                      onChange={(e) => setScan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        // Enter الماسح لا يحفظ النافذة ولا يصل مستمعاً خلفها.
                        e.preventDefault(); e.stopPropagation();
                        onScan(scan); setScan("");
                      }}
                      className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle" />
                  </label>
                </div>
                {rows.length >= MAX_RECIPE_LINES && <p className="text-2xs text-ink-subtle">{t("rcp.max", { n: formatQty(MAX_RECIPE_LINES), defaultValue: "{{n}} مادة بالأكثر" })}</p>}
                {note && (
                  <p className={cn("text-xs font-semibold", note.tone === "bad" ? "text-danger-600" : "text-success-700 dark:text-success-300")} data-cons-scan-note={note.tone}>
                    {note.text}
                  </p>
                )}
                {hits && (
                  <div className="rounded-2xl border border-line p-2" data-cons-picker>
                    <label className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm">
                      <Search size={14} className="shrink-0 text-ink-subtle" />
                      <input value={q ?? ""} autoFocus data-cons-search placeholder={t("rcp.searchPh", "ابحث عن مادة بالاسم أو الباركود…")}
                        aria-label={t("rcp.searchPh", "ابحث عن مادة بالاسم أو الباركود…")}
                        onChange={(e) => setQ(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle" />
                    </label>
                    {searchable(q).length > 0 && hits.list.length === 0 && (
                      <p className="p-2 text-xs text-ink-subtle" data-cons-nohit>{t("rcp.none", "ماكو مادة بهالاسم أو الرمز")}</p>
                    )}
                    {hits.list.length > 0 && (
                      <ul className="mt-1 max-h-56 divide-y divide-line overflow-y-auto">
                        {hits.list.map((x) => {
                          const why = x.farm_id ? t("rcp.farm", "من مخزون الحقل — ما تنخصم") : x.pooled ? t("rcp.pooled", "رصيدها بحوض القسم — ما تنخصم") : null;
                          const st = rowStock(x, rlm.get(keyOf(x.id)) ?? null);
                          const side = why ?? (st !== null ? t("rcp.stock", { n: formatQty(st), defaultValue: "الرصيد: {{n}}" }) : null);
                          return (
                            <li key={x.id}>
                              <button type="button" data-cons-pick={x.id} disabled={!!why}
                                onClick={() => { const said = addOrBump(x); if (said) setNote({ tone: "ok", text: said }); setQ(null); setErr(null); }}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-start text-sm transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60">
                                <span className="min-w-0 flex-1 truncate text-ink">{x.name}</span>
                                {side && <span className="shrink-0 text-2xs text-ink-subtle">{side}</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {hits.more > 0 && <p className="p-2 text-2xs text-ink-subtle">{t("rcp.more", { n: formatQty(hits.more), defaultValue: "و{{n}} غيرها — اكتب أكثر" })}</p>}
                  </div>
                )}
                <p className="text-2xs text-ink-subtle" data-cons-footnote>{t("rcp.footer", "التعديل لهالفاتورة بس — الوصفة ما تتغيّر")}</p>
              </div>
            )}
            {err && <p role="alert" className="text-xs font-semibold text-danger-600" data-cons-err>{err}</p>}
          </>
        )}
      </div>
      {/* الخروجُ يسأل — نافذةٌ فوق الورقة تبلع Esc وستارتَها وحدَها (مكدّسُ Dialog) = «لا، ارجع»؛ لا تأكيدُ متصفّح. */}
      <Dialog open={leave} onClose={() => setLeave(false)} size="sm" title={t("rcp.leaveTitle", "تطلع وتضيّع تعديل هالحالة؟")}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button data-cons-leave-no variant="secondary" onClick={() => setLeave(false)}>{t("rcp.leaveNo", "لا، ارجع")}</Button>
            <Button data-cons-leave-yes variant="danger" onClick={() => { setLeave(false); onClose(); }}>{t("rcp.leaveYes", "إي، طلّعني")}</Button>
          </div>
        }>
        <p data-cons-leave className="text-sm text-ink-muted">
          {own
            ? t("rcp.leaveAskOwn", { name: serviceName, defaultValue: "اللي غيّرته بمستهلكات \"{{name}}\" ما انحفظ — إذا طلعت، تبقى القائمة اللي حفظتها قبل." })
            : t("rcp.leaveAskRecipe", { name: serviceName, defaultValue: "اللي غيّرته بمستهلكات \"{{name}}\" ما انحفظ — إذا طلعت، البيعة تخصم الوصفة كما هي." })}
        </p>
      </Dialog>
    </Dialog>
  );
}

/* ── الإشعار ─────────────────────────────────────────────────────────────── */

/** مواصفةٌ كما وصلت، بأعدادٍ صحيحة: الكمياتُ بالمليار من وحدة المخزون، والمقاديرُ بالألف. */
interface SpecN {
  item: string; product_id: string; name: string; unit: RecipeUnit; label: string | null;
  /** وحدةُ المخزون كيلو: `by_weight` من العقد نفسِه (products.sold_by_weight لحظةَ القراءة، 0124) — «كغ» حيث تُقال «علبة».
   *  وغيابُه (خادمٌ أقدم) أو غيرُ true = «علبة» كما كان، بلا تخمين. يُقرأ من ConsumptionSpec مباشرةً: نوعٌ محلّيّ يوسّعه
   *  كان سيُبقي الشاشةَ تُبنى لو غاب الحقلُ من العقد أو تبدّل اسمُه، فتقول «علبة» عن الكيلو بصمت. */
  kg: boolean;
  /** by_weight كما قاله الخادم (true/false)، وnull إن غاب أو لم يكن منطقياً — به يقول سطرُ السالب وحدتَه إن لم يقلها السالبُ نفسُه
   *  (StockNegative.by_weight): ليس له «علبة كما كان» (كان رقماً بلا كلمة)، فغيابُ العلامتين رقمٌ وحده لا «علبة» بالتخمين. */
  bw: boolean | null;
  qM: bigint; dM: bigint; liveN: bigint; restN: bigint; shortM: bigint;
  note: ConsumptionSpec["note"]; relink: boolean;
  /** أحداثُها — يقرؤها «رجّعنا» وحده: الدفعةُ (at_us) بالميكروثانية، والكميةُ بالمليار (+ صرف، − إرجاع). */
  moves: { at: bigint; n: bigint }[];
}
interface InvN {
  id: string; specs: SpecN[]; skips: ConsumptionSkip[];
  /** موادُّ الفاتورة تحت الصفر — `bw` = StockNegative.by_weight كما قاله الخادم (true/false)، وnull إن غاب (خادمٌ أقدم)، كـSpecN.bw. */
  negatives: { product_id: string; name: string; stockM: bigint; bw: boolean | null }[];
  /** دفعاتُ «هذا الفعل» تصاعدياً (وضعُ «رجّعنا»؛ وإلا فارغة). */
  batches: bigint[];
}
type NoticeState = { kind: "loading" } | { kind: "failed"; e: unknown } | { kind: "ok"; invs: (InvN | null)[]; names: Map<string, string> | null };
/** نافذةُ «هذا الفعل» بمللي performance.now: قبل طلب الترجيع (sentAt)، وأوّلُ قراءةٍ لهذا الفعل (t0 — والفعلُ انتهى
 *  قبلها: الأمُّ ترسم الإشعارَ بعد جوابه)، وإرسالُ هذه القراءة (ts) ووصولُها (t1). */
interface Win { sentAt: number; t0: number; ts: number; t1: number }

/** رقمٌ من الخادم بمقياسه — رقمٌ لا يُقرأ يرمي فتصير القراءةُ كلُّها فشلاً يُقال، لا صفراً يُصدَّق. */
const scaled = (x: unknown, s: number): bigint => roundScaled(x as number, s);
/** ميكروثانيةٌ من الخادم (at_us، now_us): عددٌ صحيح بالضبط وإلا رمت — وقتٌ ناقص لا يختار دفعةً بالتخمين. */
function usOf(x: unknown): bigint {
  if (typeof x === "number" && Number.isSafeInteger(x) && x >= 0) return BigInt(x);
  if (typeof x === "string" && /^\d{1,18}$/.test(x)) return BigInt(x);
  throw new Error("invoice_consumption_shape");
}

function normalizeInv(id: string, raw: InvoiceConsumption, win: Win | null): InvN {
  if (!raw || typeof raw !== "object" || !raw.items || typeof raw.items !== "object") throw new Error("invoice_consumption_shape");
  const specs: SpecN[] = [];
  for (const [item, list] of Object.entries(raw.items)) {
    if (!Array.isArray(list)) throw new Error("invoice_consumption_shape");
    for (const s of list) {
      // الأحداثُ لا يقرؤها إلا «رجّعنا»، وغيابُها هناك خطأُ شكلٍ يُقال «أعد المحاولة» — لا «ما رجع شي».
      if (win && !Array.isArray(s.moves)) throw new Error("invoice_consumption_shape");
      specs.push({
        item, product_id: String(s.product_id), name: String(s.product_name ?? ""), unit: s.unit === "sub" ? "sub" : "stock",
        label: s.unit_label ?? null, kg: s.by_weight === true, bw: typeof s.by_weight === "boolean" ? s.by_weight : null,
        qM: scaled(s.per_qty, 3), dM: scaled(s.per_div, 3),
        liveN: scaled(s.live_qty, 9), restN: scaled(s.restored_qty, 9), shortM: scaled(s.shortfall, 3),
        note: s.note ?? null, relink: s.source === "relink",
        moves: win ? (s.moves as ConsumptionMove[]).map((m) => ({ at: usOf(m?.at_us), n: scaled(m?.qty, 9) })) : [],
      });
    }
  }
  // والقائمتان كذلك: قائمةٌ لا تُقرأ لا تصير «لا شيء» — بيعةٌ صامتة تقول «كلُّ شي تمام» عمّا لم يُقرأ.
  if (!Array.isArray(raw.skips) || !Array.isArray(raw.negatives)) throw new Error("invoice_consumption_shape");
  const skips = raw.skips;
  const negatives = raw.negatives
    .map((n) => ({ product_id: String(n.product_id), name: String(n.name ?? ""), stockM: scaled(n.stock, 3), bw: typeof n.by_weight === "boolean" ? n.by_weight : null }));
  // دفعاتُ هذا الفعل: كلُّ at_us بُعدُه عن now() القراءة ≤ (t1 − sentAt) + ٢٥٠ مللي. الفعلُ بدأ بعد sentAt وقراءةُ
  // الخادم قبل t1، فدفعتُه داخلها دائماً؛ وفعلٌ أقدم لا يدخل إلا إن سبق الضغطةَ بأقلّ من قراءةٍ ذهاباً وإياباً + ٢٥٠.
  // والطرفُ الأحدث: الفعلُ انتهى قبل t0 وهذه القراءةُ أُرسلت عند ts، فبُعدُ دفعته ≥ ts − t0؛ ودفعةٌ أقربُ من ذلك (بـ٢٥٠
  // مللي) فعلٌ جاء بعده — جهازٌ ثانٍ رجّع الباقي و«أعد المحاولة» قرأت بعد دقائق — لا يُقال عنه «رجّعه هذا الفعل».
  let batches: bigint[] = [];
  if (win) {
    // وأحداثٌ ناقصة كالغائبة: المواصفةُ وُلدت بحدثها وحيُّها مجموعُ أحداثها بالضبط — قائمةٌ فارغة أو ناقصة تقول
    // «ما رجع شي» (أو أقلَّ ممّا رجع) عمّا لم يُقرأ.
    for (const s of specs) if (!s.moves.length || s.moves.reduce((a, m) => a + m.n, 0n) !== s.liveN) throw new Error("invoice_consumption_shape");
    const now = usOf(raw.now_us);
    const w = BigInt(Math.floor((win.t1 - win.sentAt) * 1000)) + 250_000n;
    const after = BigInt(Math.floor((win.ts - win.t0) * 1000)) - 250_000n;
    const seen = new Set<bigint>();
    for (const s of specs) for (const m of s.moves) if (now - m.at <= w && now - m.at >= after) seen.add(m.at);
    batches = [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return { id, specs, skips, negatives, batches };
}

/** أسماءُ سطور الفاتورة الحيّة — تسمّي الجملةَ وحدها: فشلُها يُبقي «المستهلكات» بلا اسم، لا يُسقط ما قُرئ. */
async function lineNames(ids: string[]): Promise<Map<string, string> | null> {
  try {
    const items = await repo.listInvoiceItemsFor(ids);
    return new Map(items.map((it) => [it.id, it.name]));
  } catch {
    return null;
  }
}

/** مهلةُ قراءة الدفتر (كملخّص الوصفات بشاشة البيع): لا مهلةَ fetch عامّة (supabase.ts)، وقراءةٌ عالقة بلا مهلة ترسم ما
 *  ترسمه بيعةٌ نظيفة — لا شيء — فيمضي الكاشير على «كلُّ شي تمام» عن عجزٍ سجّله الخادم. بها تصير فشلاً يُقال بإعادته. */
const READ_MS = 10_000;
/** وأسماءُ السطور تسمّي الجملةَ وحدها: بعد وصول الدفتر تُنتظر هذه المهلة لا أكثر، ثم الجملةُ المحايدة — لا تحجب ما قُرئ. */
const NAMES_MS = 3_000;
/** وعدٌ يُنتظر حتى `ms` ثم null — والمهلةُ تبدأ من النداء لا من بدء الوعد. */
function settleWithin<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** `at` لوضع «رجّعنا» وحده (وإلا null): به تُقرأ الأسماءُ والأحداث، وكلُّ دفعة طلبٍ تُختم بلحظة إرسالها (ts) ووصولها (t1). */
async function loadNotice(ids: string[], at: { sentAt: number; t0: number } | null): Promise<{ invs: (InvN | null)[]; names: Map<string, string> | null }> {
  const names = at !== null ? lineNames(ids) : Promise.resolve(null);
  const map: InvoiceConsumptionMap = {};
  const tOf = new Map<string, { ts: number; t1: number }>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ts = performance.now();
    const part = await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);
    // الجوابُ وصل: now() الخادم لهذه القراءة قبل هذه اللحظة حتماً.
    const t1 = performance.now();
    if (!part || typeof part !== "object") throw new Error("invoice_consumption_shape");
    Object.assign(map, part);
    for (const id of chunk) tOf.set(id, { ts, t1 });
  }
  return {
    invs: ids.map((id) => (map[id] ? normalizeInv(id, map[id], at === null ? null : { ...at, ...(tOf.get(id) as { ts: number; t1: number }) }) : null)),
    names: await settleWithin(names, NAMES_MS),
  };
}

const muteKey = (clinic: string) => `vp_cons_mute_${clinic}`;
/** المكتومُ بهالجهاز: مصفوفةُ معرّفات — ومخزنٌ مكسور = لا شيء مكتوم. */
function readMuted(clinic: string): Set<string> {
  try {
    const raw = localStorage.getItem(muteKey(clinic));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
/** يرجع هل انحفظ: مخزنٌ ممتلئ أو مقفول (سفاري الخاصّ القديم، بياناتُ الموقع ممنوعة) يرمي — والكتمُ وقتها لهذا الإشعار
 *  وحده، فيُقال «هنا بس» لا «على هالجهاز» (الكتابةُ تُسمَع: كان يُقال «انكتم على هالجهاز» والإشعارُ الجاي يقولها). */
function writeMuted(clinic: string, ids: Set<string>): boolean {
  try { localStorage.setItem(muteKey(clinic), JSON.stringify([...ids].slice(-500))); return true; } catch { return false; }
}

/** مقدارٌ بالمليار من وحدة المخزون بوحدة المواصفة: الصغيرةُ × per_div (بالضبط)، والعلبةُ كما هي — ثلاثُ منازل. */
function inUnit(n: bigint, unit: RecipeUnit, dM: bigint): number {
  return fromScaled(unit === "sub" ? roundDiv(n * dM, NANO) : roundDiv(n, MILLI_PER_NANO), 3);
}

/** مجموعةُ مادّةٍ بوحدةٍ واحدة (المواصفاتُ تحمل قيمَها المجمَّدة؛ الربطُ ينسخها كما هي). */
interface Group { product_id: string; name: string; unit: RecipeUnit; label: string | null; kg: boolean; dM: bigint; n: bigint }
/** مفتاحُ مجموعة المواصفة: المادّة بوحدتها ومقدارها وتسميتها. */
const bucketOf = (s: SpecN) => `${s.product_id}|${s.unit}|${s.dM}|${s.label ?? ""}`;
function addTo(groups: Map<string, Group>, s: SpecN, n: bigint): void {
  const k = bucketOf(s);
  const g = groups.get(k);
  if (g) g.n += n;
  else groups.set(k, { product_id: s.product_id, name: s.name, unit: s.unit, label: s.label, kg: s.kg, dM: s.dM, n });
}
/** صافي الدفعة لكلّ مادّة: كلُّ مجموعاتها موجبة (رجعت) ⇒ تُقال بوحداتها كما هي؛ مجموعةٌ واحدة سالبة ⇒ صرفٌ بوحدتها؛
 *  وإلا (سطرٌ نقص وآخرُ زاد بوحدةٍ أخرى، أو صرفٌ بوحدتين) فبصافيها بوحدة المخزون — المادّةُ إمّا رجعت وإمّا انصرفت،
 *  لا «رجّعنا» وتحذيرٌ عنها معاً. `used` بموجبٍ هو ما صرفه الفعل. */
function netByProduct(groups: Iterable<Group>): { ret: Group[]; used: Group[] } {
  const byP = new Map<string, Group[]>();
  for (const g of groups) if (g.n !== 0n) byP.set(g.product_id, [...(byP.get(g.product_id) ?? []), g]);
  const ret: Group[] = [], used: Group[] = [];
  for (const gs of byP.values()) {
    if (gs.every((g) => g.n > 0n)) { ret.push(...gs); continue; }
    if (gs.length === 1) { used.push({ ...gs[0], n: -gs[0].n }); continue; }
    const net = gs.reduce((a, g) => a + g.n, 0n);
    const one: Group = { ...gs[0], unit: "stock", label: null, dM: 1000n, n: net < 0n ? -net : net };
    if (net > 0n) ret.push(one);
    else if (net < 0n) used.push(one);
  }
  return { ret, used };
}

export function ConsumptionNotice({ mode, invoiceIds, targets, action, sentAt, cashBack }: ConsumptionNoticeProps): JSX.Element | null {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  // نفسُ مفتاح عيادة مسوّدة البيع (saleDraftKey: clinicId ?? "default").
  const clinicKey = user?.clinic_id ?? user?.id ?? "default";
  const [st, setSt] = useState<NoticeState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [muted, setMuted] = useState<Set<string>>(() => readMuted(clinicKey));
  /** ما كُتم بهذا الإشعار نفسِه ← هل انحفظ بالجهاز: يُقال بمكانه ومعه التراجع — ضغطةٌ بالغلط (والزرُّ يقع بعد البيعة حيث
   *  كان «إيصال 80مم») لا تكتم مادّةً بهالجهاز للأبد بصمت، وكتمٌ ما انحفظ يُقال «هنا بس». ومكتومٌ من إشعارٍ سابق يغيب كما تقرّر. */
  const [fresh, setFresh] = useState<Map<string, boolean>>(() => new Map());
  const idsKey = invoiceIds.join("|");
  // «رجّعنا»: لحظةُ أوّل قراءةٍ لهذا الفعل (t0) — تبقى لـ«أعد المحاولة» ولا تُجدَّد بها، فقراءةٌ بعد دقائق لا تتبنّى فعلاً جاء بعده.
  const first = useRef<{ key: string; t0: number } | null>(null);

  useEffect(() => { setMuted(readMuted(clinicKey)); setFresh(new Map()); }, [clinicKey]);
  useEffect(() => {
    let alive = true;
    const ids = [...new Set(invoiceIds.filter((x) => typeof x === "string" && x))];
    // «رجّعنا» بلا لحظة الطلب لا يعرف أيَّ دفعةٍ دفعتُه: لا يقول شيئاً ولا يقرأ (كلُّ أمٍّ تمرّرها، وفحصٌ يشترطها).
    const at = mode === "returned" && typeof sentAt === "number" && Number.isFinite(sentAt) ? sentAt : null;
    if (!ids.length || (mode === "returned" && at === null)) { setSt({ kind: "ok", invs: [], names: null }); return; }
    const key = `${ids.join("|")}|${at}`;
    const t0 = first.current && first.current.key === key ? first.current.t0 : performance.now();
    if (at !== null) first.current = { key, t0 };
    setSt({ kind: "loading" });
    loadNotice(ids, at === null ? null : { sentAt: at, t0 }).then(
      (r) => { if (alive) setSt({ kind: "ok", ...r }); },
      (e) => { if (alive) setSt({ kind: "failed", e }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, mode, tick, sentAt]);

  if (st.kind === "loading") return null;
  const box = t("retail.unitBox", "علبة");
  const kgWord = t("retail.unitKg", "كغ");
  /** وحدةُ المخزون بكلمتها: كيلو لمادّةٍ تنباع بالوزن (كالورقة وسند الهدر)، وإلا علبة. */
  const stockWord = (kg: boolean) => (kg ? kgWord : box);
  const sep = t("rcp.sep", "، ");
  const unitOf = (unit: RecipeUnit, label: string | null, kg: boolean) => (unit === "sub" ? (label || t("retail.unitSingle", "مفرد")) : stockWord(kg));
  const mute = (pid: string) => {
    const next = readMuted(clinicKey);
    next.add(pid);
    const saved = writeMuted(clinicKey, next);
    setMuted((cur) => new Set([...cur, ...next]));
    setFresh((cur) => new Map([...cur, [pid, saved]]));
    playTap();
  };
  const unmute = (pid: string) => {
    const left = readMuted(clinicKey);
    left.delete(pid);
    writeMuted(clinicKey, left);
    setMuted((cur) => new Set([...cur].filter((x) => x !== pid)));
    setFresh((cur) => new Map([...cur].filter(([x]) => x !== pid)));
    playTap();
  };
  /** تحذيرٌ عن مادّة بزرّ كتمها — عجزٌ انصرف بلا رصيد (short) أو رصيدٌ صار تحت الصفر (neg): «لا إنذارَ بلا كتم» (قرارُ المالك
   *  ب٢)؛ أو — لمادّةٍ كُتمت بهذا الإشعار — «انكتم… على هالجهاز» (أو «هنا بس» إن ما انحفظ) وتراجعُها؛ ومكتومةٌ من قبل لا شيء. */
  const warnLine = (kind: "short" | "neg", key: string, pid: string, name: string, text: string): ReactNode => {
    if (fresh.has(pid)) {
      return (
        <li key={key} className="flex flex-wrap items-center gap-2" data-cons-muted={pid}>
          <span className="min-w-0 flex-1 font-semibold text-ink-muted">{fresh.get(pid)
            ? t("rcp.mutedNote", { name, defaultValue: "انكتم تذكير \"{{name}}\" على هالجهاز" })
            : t("rcp.mutedOnce", { name, defaultValue: "انكتم تذكير \"{{name}}\" هنا بس — ما گدرنا نحفظه على هالجهاز، فيرجع المرّة الجاية" })}</span>
          <Button size="sm" variant="ghost" data-cons-unmute={pid} onClick={() => unmute(pid)}>{t("rcp.unmute", "رجّع التذكير")}</Button>
        </li>
      );
    }
    if (muted.has(pid)) return null;
    const body = (
      <>
        <span className={kind === "short" ? "min-w-0 flex-1 font-semibold text-warn-700 dark:text-warn-300" : "min-w-0 flex-1 text-ink"}>{text}</span>
        <Button size="sm" variant="ghost" data-cons-mute={pid} onClick={() => mute(pid)}>{t("rcp.mute", "لا تذكّرني بهالمادة")}</Button>
      </>
    );
    return kind === "short"
      ? <li key={key} className="flex flex-wrap items-center gap-2" data-cons-short={pid}>{body}</li>
      : <li key={key} className="flex flex-wrap items-center gap-2" data-cons-neg={pid}>{body}</li>;
  };
  /** جملةُ «ما كفّى»: ما انخصم والرصيدُ بعده (أو بلاه إن لم يكن بسالب القراءة). */
  const shortLine = (key: string, pid: string, name: string, qty: string, stock: string | null): ReactNode =>
    warnLine("short", key, pid, name, stock !== null
      ? t("rcp.short", { name, qty, stock, defaultValue: "⚠️ {{name}} رصيدها بالنظام ما كفّى: انخصم {{qty}} والرصيد صار {{stock}}. سجّل فاتورة الشراء أو سوّ جرد." })
      : t("rcp.shortNoStock", { name, qty, defaultValue: "⚠️ {{name}} رصيدها بالنظام ما كفّى: انخصم {{qty}}. سجّل فاتورة الشراء أو سوّ جرد." }));
  const retry = (
    <Button size="sm" variant="secondary" data-cons-retry leftIcon={<RotateCcw size={13} />} onClick={() => setTick((n) => n + 1)}>
      {t("common.retry", "إعادة المحاولة")}
    </Button>
  );
  const failBox = (text: string) => (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 text-xs dark:border-danger-500/30 dark:bg-danger-500/10" data-cons-notice={mode} data-cons-fail>
      <AlertTriangle size={14} className="shrink-0 text-danger-600" />
      <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">{text}</span>
      {retry}
    </div>
  );
  // البيعةُ انحفظت ودفترُها ما انقرأ (أو فاتورتُها ما وصلت بالجواب): لا صمتَ يقول «كلُّ شي تمام». والجملةُ تقول الرصيدَ
  // والمستهلكاتِ معاً: الإشعارُ يُرسم بعد بيعةِ موادٍّ وحدها أيضاً (سالبُها من القراءة نفسِها)، و«المستهلكات» وحدها عن بيعةٍ
  // ما فيها خدمة تقول غيرَ ما فشل.
  if (mode === "sale" && (st.kind === "failed" || st.invs.some((x) => x === null))) {
    return failBox(t("rcp.saleFailStock", "انحفظت الفاتورة، بس ما گدرنا نتأكد من الرصيد والمستهلكات — شوف حركات المادة"));
  }
  if (st.kind === "failed") return failBox(t("rcp.readFail", "ما گدرنا نقرأ المستهلكات"));
  const invs = st.invs.filter((x): x is InvN => x !== null);

  if (mode === "sale") {
    const out: ReactNode[] = [];
    for (const inv of invs) {
      const byP = new Map<string, SpecN[]>();
      for (const s of inv.specs) byP.set(s.product_id, [...(byP.get(s.product_id) ?? []), s]);
      const short = new Set<string>();
      for (const [pid, specs] of byP) {
        if (!specs.some((s) => s.shortM > 0n)) continue;
        short.add(pid);
        const same = specs.every((s) => s.unit === specs[0].unit && s.dM === specs[0].dM && s.label === specs[0].label);
        const total = specs.reduce((a, s) => a + s.liveN, 0n);
        const unit: RecipeUnit = same ? specs[0].unit : "stock";
        const qty = `${formatQty(inUnit(total, unit, specs[0].dM))} ${unitOf(unit, specs[0].label, specs[0].kg)}`;
        const neg = inv.negatives.find((x) => x.product_id === pid);
        const stock = neg ? `${formatQty(fromScaled(neg.stockM, 3))}${unit === "sub" ? ` ${stockWord(specs[0].kg)}` : ""}` : null;
        const line = shortLine(`${inv.id}|short|${pid}`, pid, specs[0].name, qty, stock);
        if (line) out.push(line);
      }
      const seen = new Set<string>();
      const said = (key: string, text: string, pid: string | null) => {
        if (seen.has(key) || (pid && muted.has(pid))) return;
        seen.add(key);
        out.push(<li key={`${inv.id}|${key}`} className="text-ink" data-cons-skip={key.split("|")[0]}>{text}</li>);
      };
      for (const k of inv.skips) {
        const name = k.product_name || k.line_name;
        switch (k.note) {
          case "service_missing": said(`service_missing|${k.line_name}`, t("rcp.svcMissing", { name: k.line_name, defaultValue: "\"{{name}}\" ما انخصمت مستهلكاتها — الخدمة مو موجودة بالسحابة. حدّث الصفحة" }), null); break;
          case "old_device": said(`old_device|${k.line_name}`, t("rcp.oldDevice", { name: k.line_name, defaultValue: "\"{{name}}\" ما انخصمت مستهلكاتها — وصلت من جهاز ما تحدّث. حدّث الصفحة على كل جهاز" }), null); break;
          case "in_trash": said(`in_trash|${k.product_id}`, t("rcp.skipTrash", { name, defaultValue: "\"{{name}}\" ما انخصمت — المادة بالمحذوفات" }), k.product_id); break;
          case "product_gone": said(`product_gone|${k.product_id}`, t("rcp.skipGone", { name, defaultValue: "\"{{name}}\" ما انخصمت — المادة مو موجودة بالمخزن" }), k.product_id); break;
          case "pooled": said(`pooled|${k.product_id}`, t("rcp.skipPooled", { name, defaultValue: "\"{{name}}\" ما انخصمت — رصيدها بحوض القسم" }), k.product_id); break;
          case "farm_stock": said(`farm_stock|${k.product_id}`, t("rcp.skipFarm", { name, defaultValue: "\"{{name}}\" ما انخصمت — من مخزون الحقل" }), k.product_id); break;
          case "no_sub_unit": said(`no_sub_unit|${k.product_id}`, t("rcp.skipNoSub", { name, defaultValue: "\"{{name}}\" ما انخصمت — ما إلها وحدة صغيرة" }), k.product_id); break;
          default: break;   // override_none: الطبيبُ صفّرها بقصد — لا يُقال بالبيع (التقريرُ يعدّها)
        }
      }
      // مواصفةٌ ما لقت مادّتها لحظةَ الترحيل (لم يُكتب شيء) = ما انخصمت.
      for (const s of inv.specs) {
        if (s.note === "product_gone") said(`product_gone|${s.product_id}`, t("rcp.skipGone", { name: s.name, defaultValue: "\"{{name}}\" ما انخصمت — المادة مو موجودة بالمخزن" }), s.product_id);
      }
      // رصيدٌ صار تحت الصفر بلا عجزٍ قيل عنه — سطرُ مادّةٍ بيع من قائمةٍ قديمة (والإشعارُ يُرسم بعد كلّ بيعةٍ فيها سطرُ مادّة):
      // بزرّ كتمه وتراجعِه كالعجز، وبوحدته حين يقولها الخادمُ عن المادّة نفسِها: by_weight بالسالب نفسِه أوّلاً (StockNegative —
      // سطرُ مادّةٍ بلا مواصفة يعرف وحدتَه به وحده)، ثمّ بمواصفتها بالفاتورة؛ true ⇒ «كغ»، false ⇒ «علبة». وخادمٌ أقدم بلا العلامتين
      // ⇒ الرقمُ وحده كما كان: «-0.5 علبة» عن رمل قططٍ بالكيلو تخمينٌ يكذب، والرقمُ وحده لا يكذب.
      for (const n of inv.negatives) {
        if (short.has(n.product_id)) continue;
        const own = inv.specs.filter((s) => s.product_id === n.product_id);
        const kg = n.bw ?? (own.some((s) => s.bw === true) ? true : own.some((s) => s.bw === false) ? false : null);
        const num = formatQty(fromScaled(n.stockM, 3));
        const stock = kg === null ? num : `${num} ${stockWord(kg)}`;
        const row = warnLine("neg", `${inv.id}|neg|${n.product_id}`, n.product_id, n.name,
          t("rcp.neg", { name: n.name, stock, defaultValue: "\"{{name}}\" رصيدها صار {{stock}}" }));
        if (row) out.push(row);
      }
    }
    if (!out.length) return null;
    // break-words على الإشعار كلّه (overflow-wrap يُورَث لكلّ سطر): اسمٌ بلا فاصلٍ أعرضُ من عموده يلتفّ داخله — كان يطلع ٣٨
    // بكسلاً فوق «لا تذكّرني بهالمادة» على ٣٧٥ بكسل (مقيس)، فضغطةُ آخر الاسم تكتم المادّة.
    return (
      <ul className="space-y-1.5 break-words rounded-xl border border-warn-200 bg-warn-50 p-2.5 text-xs dark:border-warn-500/30 dark:bg-warn-500/10" data-cons-notice="sale">
        {out}
      </ul>
    );
  }

  if (mode === "preview") {
    const tmap = targets ? new Map(targets.map((x) => [x.item_id, x.qty])) : null;
    const groups = new Map<string, Group>();
    for (const inv of invs) {
      for (const s of inv.specs) {
        if (s.note === "product_gone") continue;
        // سطرٌ ما لمسه الترجيع يبقى كما هو؛ وبلا أهداف: الفاتورةُ كلُّها إلى صفر.
        const target = tmap ? tmap.get(s.item) : 0;
        if (target === undefined) continue;
        const tM = Number.isFinite(target) && target > 0 ? roundScaled(target, 3) : 0n;
        const back = s.liveN - targetNano(tM, s.qM, s.dM);
        if (back > 0n) addTo(groups, s, back);
      }
    }
    const list = [...groups.values()].filter((g) => g.n > 0n).map((g) =>
      t("rcp.item", { name: g.name, qty: formatQty(inUnit(g.n, g.unit, g.dM)), unit: unitOf(g.unit, g.label, g.kg), defaultValue: "{{name}} ×{{qty}} {{unit}}" }));
    if (!list.length) return null;
    return (
      <p className="flex items-start gap-1.5 break-words rounded-xl border border-line bg-surface-2 p-2.5 text-xs text-ink" data-cons-notice="preview">
        <Undo2 size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
        <span className="min-w-0 flex-1">{action === "delete"
          ? t("rcp.previewDelete", { list: list.join(sep), defaultValue: "الحذف يرجّع للمخزن: {{list}}" })
          : t("rcp.preview", { list: list.join(sep), defaultValue: "الترجيع يرجّع للمخزن: {{list}}" })}</span>
      </p>
    );
  }

  // returned: ما رجّعه **هذا الفعل** وحده — أحداثُ دفعاته (at_us) لا المتراكمُ منذ البيعة: ترجيعٌ ثانٍ على الفاتورة
  // نفسها (مرتجعٌ جزئيّ ثم ترجيع، أو تعديلان) كان يقول الأوّلَ معه، ويعبّي سندَ هدرٍ بما قد سُجّل. لكلّ مجموعةٍ
  // −Σ حركات الدفعة على مواصفاتها: صرفُ الربط بالدفعة نفسها يُطرح وحده.
  // وتعديلٌ رفع سطرَ خدمة صافيه صرف: الربطُ يأخذ حالةً أكثر بالقيم المجمَّدة بلا منع، وقد تنزل المادّةُ تحت الصفر — فيُقال
  // كما تقوله البيعة («لا منع، والسالبُ يُقال» بزرّ كتمه) بصافي الدفعة، لا بعجز مواصفة الربط: الربطُ يعيد كتابةَ العجز
  // على كامل كميته فتعديلٌ ما غيّر شيئاً على رصيدٍ سالب كان سيُقال عنه «ما كفّى». وصرفٌ والرصيدُ كفّى صامتٌ كبيعةٍ نظيفة.
  const blocks: ReactNode[] = [];
  for (const inv of invs) {
    const at = new Set(inv.batches);
    const groups = new Map<string, Group>();
    const back: [SpecN, bigint][] = [];
    let edit = false;
    for (const s of inv.specs) {
      // تعديلٌ بهالدفعة = مواصفةُ ربطٍ وُلدت فيها (أقدمُ أحداثها منها) — والتعديلُ لا يردّ مالاً.
      if (s.relink && s.moves.length > 0 && at.has(s.moves.reduce((a, m) => (m.at < a ? m.at : a), s.moves[0].at))) edit = true;
      if (s.note === "product_gone") continue;
      const n = s.moves.reduce((a, m) => (at.has(m.at) ? a - m.n : a), 0n);
      if (n !== 0n) { addTo(groups, s, n); back.push([s, n]); }
    }
    const { ret, used } = netByProduct(groups.values());
    const list = ret.map((g) =>
      t("rcp.retItem", { name: g.name, qty: formatQty(inUnit(g.n, g.unit, g.dM)), unit: unitOf(g.unit, g.label, g.kg), defaultValue: "{{qty}} {{unit}} {{name}}" }));
    const warn: ReactNode[] = [];
    for (const g of used) {
      const neg = inv.negatives.find((x) => x.product_id === g.product_id);
      if (!neg) continue;
      const qty = `${formatQty(inUnit(g.n, g.unit, g.dM))} ${unitOf(g.unit, g.label, g.kg)}`;
      const stock = `${formatQty(fromScaled(neg.stockM, 3))}${g.unit === "sub" ? ` ${stockWord(g.kg)}` : ""}`;
      const line = shortLine(`${inv.id}|use|${g.product_id}`, g.product_id, g.name, qty, stock);
      if (line) warn.push(line);
    }
    if (!list.length && !warn.length) continue;
    // السطورُ التي رجعت موادُّها بهالدفعة (وظهرت مجموعتُها) — بأسمائها الحيّة.
    const retP = new Set(ret.map((g) => g.product_id));
    const lineIds = [...new Set(back.filter(([s, n]) => n > 0n && retP.has(s.product_id) && (groups.get(bucketOf(s))?.n ?? 0n) > 0n).map(([s]) => s.item))];
    const named = st.names ? lineIds.map((id) => st.names?.get(id)) : [];
    // «رجعت الفلوس» بثلاث علاماتٍ معاً: الأمُّ ردّت مالاً بهذا الفعل (cashBack)، والدفعةُ ليست تعديلاً، وكلُّ سطرٍ رجعت
    // موادُّه باقٍ بالفاتورة (ترجيعٌ أو مرتجع — لا حذفٌ راحت به سطورُها). والجملةُ المحايدة لما سواه، ولأسماءٍ ما
    // انقرأت (لا تُثبت شيئاً): ادّعاءٌ عن المال لا يُقال بلا علامته.
    const refund = cashBack === true && !edit && named.length > 0 && named.every((x): x is string => !!x);
    const text = refund
      ? t("rcp.returned", { names: named.map((x) => `"${x}"`).join(sep), list: list.join(sep), defaultValue: "رجعت الفلوس، ورجّعنا مستهلكات {{names}} للمخزن ({{list}})." })
      : t("rcp.returnedPlain", { list: list.join(sep), defaultValue: "رجّعنا مستهلكات للمخزن ({{list}})." });
    blocks.push(
      <div key={inv.id} className="space-y-1.5">
        {list.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" data-cons-returned={inv.id}>
            <Package size={14} className="shrink-0 text-ink-subtle" />
            <span className="min-w-0 flex-1">{text}</span>
            {can("manageInventory") && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-ink-muted">{t("rcp.ifUsed", "إذا انصرفت فعلاً:")}</span>
                <Button size="sm" variant="secondary" data-cons-waste={inv.id}
                  onClick={() => navigate(`/inventory/count?tab=waste&inv=${encodeURIComponent(inv.id)}&at=${inv.batches.join(",")}`)}>
                  {t("rcp.waste", "سجّلها هدر")}
                </Button>
              </span>
            )}
          </div>
        )}
        {warn.length > 0 && <ul className="space-y-1.5" data-cons-used={inv.id}>{warn}</ul>}
      </div>,
    );
  }
  if (!blocks.length) return null;
  // والكلمةُ الطويلة تلتفّ كإشعار البيعة: عمودُ «رجّعنا» بجانب «إذا انصرفت فعلاً: سجّلها هدر» ١٠٣ بكسل (مقيس).
  return (
    <div className="space-y-1.5 break-words rounded-xl border border-line bg-surface-2 p-2.5 text-xs text-ink" data-cons-notice="returned">
      {blocks}
    </div>
  );
}
