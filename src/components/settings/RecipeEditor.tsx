/* ============================================================================
 * محرّرُ مستهلكات الخدمة (0252، التصميم §11.4 و§3.5): ما تخصمه كلُّ مرّةٍ واحدة تنباع فيها
 * الخدمة، وكلفتُه بسعر اليوم.
 *
 * قطعةٌ كسولة لا يحمّلها إلا Settings.tsx (رفيقُ نطاق services بـhot-paths.json)، فتستورد
 * consumptionApi وconsumption.ts ثابتاً ولا يكبر الإقلاع بسطر.
 *
 * ── ما يحرسه ──────────────────────────────────────────────────────────────
 * • قائمةٌ ناقصة تُصدَّق: المواد والوصفة تُجلبان معاً، وفشلُ أيٍّ منهما حالةُ قراءةٍ بلا سطور
 *   و«إعادة المحاولة» — لا نصفُ قائمةٍ يُحفظ فوقه.
 * • الحسابُ كلُّه من consumption.ts (أعدادٌ صحيحة، مرآةُ الخادم فلساً بفلس): «٢ مل = ٠٫٠٠٤ علبة».
 * • ما يرفضه service_recipe_set يُفحص هنا بنفس الدالّة وبنفس الترتيب (validateRecipeLines)،
 *   فأوّلُ مشكلةٍ تُقال على سطرها قبل النداء.
 * • البصمةُ من recipeGet دائماً، حتى لخدمةٍ بلا وصفة: الخادمُ يرفض الغائبةَ «تغيّرت من جهاز ثاني».
 * • سطرٌ لا يُخصم (محذوفة، بالحوض، من الحقل، بلا وحدةٍ صغيرة) يبقى سطراً باسم لقطته وسببه ويُشال
 *   بيد — الخادمُ يرفض حفظه، والإسقاطُ الصامت يمحو ما كتبه أحد.
 * • تكرارٌ تركه الدمج يُجمع عند الفتح: نفسُ الوحدة يُجمع، والعلبةُ تصير صغيرةً إن انقسمت بالضبط
 *   (٣ منازل)؛ وما لا ينجمع يبقى سطرين ويقفل الحفظ — لا تقريبَ يغيّر ما يُخصم.
 * • تعديلٌ لم يُحفظ لا يُمحى بلمسةٍ على الستارة أو Esc أو «افتح المادة»: يُسأل أوّلاً (سابقةُ المشتريات).
 * • المنتقي يبحث بالرمز من مصدره الواحد (codeMatcher: طيُّ الحالة وجزءُ الرمز)، والمادةُ التي بالوصفة
 *   تُعرض مقفولةً بسببها — «لا توجد نتائج» عن مادةٍ برفّها تُصدَّق فيُعاد إدخالُها. وسقفُه يقول إنه سقف
 *   («و٥ غيرها — اكتب أكثر»)، ورمزٌ كُتب كاملاً مطابقُه أوّلاً، وسببُ القفل تحت الاسم لا بجانبه.
 * • كلماتُ الوحدة كلماتُ الكاشير والمخزون (retail.unitBox / unitKg / unitSingle): «كغ» و«مفرد» — نفسُ المادة
 *   بكلمةٍ واحدة بين الإعدادات وورقة المستهلكات وتبويب التلف والجرد.
 * ==========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button, Dialog, Segmented, Skeleton, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { consumptionApi, type RecipeLine, type RecipeProblem, type RecipeSetInput } from "@/lib/consumptionApi";
import {
  MAX_LINE_QTY_M, MAX_RECIPE_LINES, fromScaled, perDivMilli, perValueCents, roundDiv, roundScaled, stockNano, stockUnitCost,
  subUnitMilli, toMilli, validateRecipeLines, type RecipeRefusal, type RecipeUnit,
} from "@/lib/consumption";
import { describeDbError } from "@/lib/errors";
import { normalizeDigits } from "@/lib/digits";
import { holdUpdates } from "@/lib/inflight";
import { codeMatcher } from "@/lib/productCodes";
import { cn, formatNum, formatQty, matchCode, money, searchable } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import type { Product, Service } from "@/types";

export interface RecipeEditorProps {
  open: boolean;
  onClose(): void;
  /** الخدمةُ كما بكتالوج الإعدادات: الاسمُ للعنوان، والسعرُ لحارس «المواد أغلى من الخدمة». */
  service: Pick<Service, "id" | "name" | "price">;
  /** can("manageSettings"): غيرُه يقرأ ولا يحفظ — والخادمُ يسأل الدورَ ثانيةً (recipe_forbidden). */
  canEdit: boolean;
  /** can("viewProfits") && !restricted: كلُّ كلفةٍ هنا خلفه. */
  showCost: boolean;
  /** بعد حفظٍ ناجح: كم سطراً صارت الوصفة، وهل صُفّرت الكلفةُ المكتوبة باليد (فيقرأ الأبُ الخدماتِ من جديد). */
  onSaved(r: { lines: number; clearedFlat: boolean }): void;
}

/** سطرٌ بالمحرّر — الكميةُ نصُّ الحقل كما كُتب، وتُقرأ عند كلّ حساب. */
interface Row {
  key: string;
  product_id: string;
  /** الاسمُ الحيّ، أو لقطتُه والمادةُ بالمحذوفات. */
  name: string;
  qty: string;
  unit: RecipeUnit;
  /** مشكلةُ الخادم لحظةَ الفتح؛ سطرٌ أُضيف هنا null. */
  problem: RecipeProblem;
  /** جُمع من سطرين تركهما الدمج. */
  merged: boolean;
}

interface Loaded {
  products: ReadonlyMap<string, Product>;
  fingerprint: string;
  /** كلفةُ الخدمة المكتوبة باليد (0120) كما بالخادم. */
  flat: number | null;
  /** الوصفةُ فارغةٌ لحظةَ الفتح — شرطُ سؤال الكلفة اليدوية (§11.4). */
  startedEmpty: boolean;
  /** شكلُ ما بالخادم — الحفظُ يُفتح حين يختلف عنه ما بالشاشة. */
  shape: string;
}

/** مرّةً واحدة لكلّ جهاز: «الأجهزة اللي ما تحدّثت ما تخصم». */
const FIRST_SAVE_KEY = "vp_rcp_saved_once";
/** نتائجُ المنتقي المرسومة — وما بعدها يُقال عددُه (قائمةٌ قُصّت بصمت تُصدَّق «ماكو»). */
const PICK_MAX = 8;

/** كميةٌ كما يقرؤها الخادم (numeric بثلاث منازل) ← بالألف، أو null إن لم تُقرأ. */
function milliOf(x: number | string): bigint | null {
  try { return toMilli(typeof x === "string" ? normalizeDigits(x) : x); } catch { return null; }
}
const qtyText = (m: bigint): string => String(fromScaled(m, 3));
const shapeOf = (xs: readonly { product_id: string; qty: number | string; unit: RecipeUnit }[]): string =>
  xs.map((x) => `${x.product_id.toLowerCase()}|${milliOf(x.qty) ?? String(x.qty)}|${x.unit}`).join(",");
const lookup = (products: ReadonlyMap<string, Product> | undefined, id: string): Product | null =>
  products ? (products.get(id) ?? products.get(id.toLowerCase()) ?? null) : null;
/** units_per_box بالألف لمادّةٍ حيّةٍ تنقسم (لا حوضَ ولا حقلَ ولا كيلو)، وإلا null. */
function splitOf(p: Product | null): bigint | null {
  return p && !p.pooled && !p.farm_id && !p.sold_by_weight ? subUnitMilli(p) : null;
}

/** سطورُ الخادم ← سطورُ المحرّر، وتكرارُ مادّةٍ تركه الدمج يُجمع (§11.4). */
function foldLines(lines: readonly RecipeLine[], products: ReadonlyMap<string, Product>): Row[] {
  const out: { row: Row; m: bigint | null }[] = [];
  for (const l of lines) {
    const m = milliOf(l.qty);
    const mine = m === null ? [] : out.filter((a) => a.m !== null && a.row.product_id.toLowerCase() === l.product_id.toLowerCase());
    const same = mine.find((a) => a.row.unit === l.unit);
    if (same && m !== null) { same.m = (same.m ?? 0n) + m; same.row.merged = true; continue; }
    const other = mine.find((a) => a.row.unit !== l.unit);
    const upb = other ? splitOf(lookup(products, l.product_id)) : null;
    if (other && other.m !== null && m !== null && upb !== null) {
      const stockM = l.unit === "stock" ? m : other.m;
      const subM = l.unit === "sub" ? m : other.m;
      // العلبةُ إلى الصغيرة بلا تقريب: qty × units_per_box بثلاث منازل بالضبط، وإلا يبقيان سطرين.
      if ((stockM * upb) % 1000n === 0n) {
        other.m = subM + (stockM * upb) / 1000n;
        other.row.unit = "sub";
        other.row.problem = null;   // مادّةٌ حيّةٌ تنقسم: لا مشكلةَ وحدة
        other.row.merged = true;
        continue;
      }
    }
    out.push({ row: { key: l.id, product_id: l.product_id, name: l.product_name, qty: m === null ? String(l.qty) : qtyText(m), unit: l.unit, problem: l.problem, merged: false }, m });
  }
  return out.map((a) => (a.m === null ? a.row : { ...a.row, qty: qtyText(a.m) }));
}

/** ما يمنع السطرَ من الخصم الآن: من قائمة المواد الحيّة إن كانت المادةُ فيها، ومن الخادم إن غابت. */
function problemOf(r: Row, p: Product | null): RecipeProblem {
  if (!p) return r.problem && r.problem !== "no_sub_unit" ? r.problem : "product_gone";
  if (p.farm_id) return "farm_stock";
  if (p.pooled) return "pooled";
  return r.unit === "sub" && perDivMilli("sub", p) === null ? "no_sub_unit" : null;
}

/** المقدارُ بوحدة المخزون (٩ منازل) نصّاً: بالضبط إن وقع على ثلاث منازل، وإلا تقريبيّاً. */
function stockAmount(n: bigint, tiny: (n: string) => string): string {
  if (n % 1_000_000n === 0n) return formatQty(fromScaled(n, 9));
  const v = fromScaled(n, 9);
  return v >= 0.001 ? `≈${formatQty(v)}` : tiny(formatQty(0.001));
}

export default function RecipeEditor({ open, onClose, service, canEdit, showCost, onSaved }: RecipeEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** فشلُ الجلب كما رُمي — يُصاغ عند الرسم، فلا يتبع `load` دالّةَ الترجمة. */
  const [failed, setFailed] = useState<{ e: unknown } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  /** السطرُ الذي فُتح شرحُ «بالمل؟» تحته. */
  const [why, setWhy] = useState<string | null>(null);
  /** الضغطةُ الثانية المطلوبة قبل الحفظ: المواد أغلى من الخدمة، ثمّ سؤالُ الكلفة اليدوية. */
  const [ask, setAsk] = useState<null | "over" | "flat">(null);
  const [overOk, setOverOk] = useState(false);
  const [problem, setProblem] = useState<{ code: RecipeRefusal; index: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const [busy, setBusy] = useState(false);
  /** يدٌ غيّرت شيئاً منذ الفتح — طيُّ الدمج وحده لا يُسأل عنه عند الخروج (الخادمُ يخصم السطرين كما هما). */
  const [touched, setTouched] = useState(false);
  /** خروجٌ طُلب وتعديلٌ لم يُحفظ: إغلاقٌ (to = null) أو انتقالٌ لمادّة — يُسأل قبل أن يضيع. */
  const [leave, setLeave] = useState<{ to: string | null } | null>(null);
  const navigate = useNavigate();
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoaded(null); setFailed(null); setError(null); setMoved(false); setProblem(null); setAsk(null); setOverOk(false); setTouched(false); setLeave(null);
    try {
      const [list, got] = await Promise.all([repo.listProducts(), consumptionApi.recipeGet(service.id)]);
      if (my !== seq.current) return;
      const products = new Map(list.map((p) => [p.id, p]));
      setRows(foldLines(got.lines, products));
      setLoaded({ products, fingerprint: got.fingerprint, flat: got.flat_cost, startedEmpty: got.lines.length === 0, shape: shapeOf(got.lines) });
    } catch (e) {
      if (my === seq.current) setFailed({ e });
    }
  }, [service.id]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const dirty = !!loaded && shapeOf(rows) !== loaded.shape;
  // تعديلٌ لم يُحفظ لا ينزل تحته تحديثُ النسخة (درسُ ١٧/١٠) — كعدّ المخزن.
  useEffect(() => (open && dirty ? holdUpdates(Infinity) : undefined), [open, dirty]);

  /** كلُّ تعديلٍ يُسقط الضغطةَ الثانية والرسالةَ السابقة: السؤالُ عن هذه السطور لا عن التي قبلها.
   *  إلا «تغيّرت من جهاز ثاني» (moved): تبقى وزرُّها حتى يُعاد التحميل — وإلا بقي الحفظُ مقفولاً بلا كلمة ولا مخرج. */
  const edit = (f: (rs: Row[]) => Row[]) => { setRows(f); setTouched(true); setAsk(null); setOverOk(false); setProblem(null); setError(null); };

  /* الخروج: لمسةُ الستارة وEsc و«إلغاء» و«افتح المادة» كانت تمحو وصفةً كُتبت سطراً سطراً بلا كلمة —
     فتعديلٌ لم يُحفظ يُسأل عنه بنافذةٍ فوقها (سابقةُ «تطلع وتضيّع السطور؟» بالمشتريات)، وبلا تعديلٍ تُغلق كما كانت. */
  const leaveNeeded = canEdit && touched && dirty;
  const stay = () => setLeave(null);
  const tryClose = () => {
    if (busy) return;
    if (leaveNeeded) { playWarning(); setLeave({ to: null }); } else onClose();
  };
  const openProduct = (to: string) => (e: { preventDefault(): void }) => {
    if (!leaveNeeded) { onClose(); return; }
    e.preventDefault(); playWarning(); setLeave({ to });
  };
  const exit = (to: string | null) => { setLeave(null); if (to) navigate(to); onClose(); };

  const views = useMemo(() => rows.map((r) => {
    const p = lookup(loaded?.products, r.product_id);
    const prob = problemOf(r, p);
    const raw = milliOf(r.qty.trim());
    const m = raw !== null && raw > 0n && raw <= MAX_LINE_QTY_M ? raw : null;
    const d = p && !prob ? perDivMilli(r.unit, p) : null;
    const k = p ? stockUnitCost(p) : null;
    const n = m !== null && d !== null ? stockNano(m, d) : null;
    const w = n !== null && k !== null && d !== null && m !== null ? perValueCents(m, k, d) : null;
    return { p, prob, m, k, n, w, badQty: r.qty.trim() !== "" && m === null };
  }), [rows, loaded]);
  const twins = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.product_id.toLowerCase(), (seen.get(r.product_id.toLowerCase()) ?? 0) + 1);
    return seen;
  }, [rows]);

  const totalC = views.reduce((s, v) => (v.prob === null && v.w !== null ? s + v.w : s), 0n);
  const priceC = Number.isFinite(service.price) ? roundScaled(service.price, 2) : 0n;
  /* بلا سعر (٠: مكتبةُ العمليات تضيفها هكذا والسعرُ يُكتب بالكاشير) لا مقارنة — «أكثر من سعر الخدمة (٠)» كان
     يطلع لكلّ وصفةٍ بكلفة، وإنذارٌ يطلع دائماً يُضغط بلا قراءة. والمجموعُ يقولها «بلا سعر» (totalNoPrice). */
  const over = showCost && priceC > 0n && rows.length > 0 && totalC > priceC;
  const flatNeeded = !!loaded && loaded.startedEmpty && (loaded.flat ?? 0) > 0 && rows.length > 0;

  /* كلماتُ الكاشير والمخزون نفسُها (retail حارٌّ فيصل كلَّ شاشة): مادةٌ بالوزن «كغ» (retail.unitKg بالكاشير، pos.qtyStockKg
     بالمخزون)، ووحدةٌ صغيرةٌ بلا اسم «مفرد» (أزرارُ الوحدة وسطرُ السلّة، وورقةُ المستهلكات وإشعارُها والتلفُ والجرد).
     كانت هنا «كغم» و«وحدة»: «٢ وحدة = ٠٫٢ علبة» عن مادّةٍ تقول عنها الورقةُ بالكاشير «٢ مفرد». */
  const boxOf = (p: Product | null) => (p?.sold_by_weight ? t("retail.unitKg", "كغ") : t("retail.unitBox", "علبة"));
  const subOf = (p: Product | null) => p?.sub_unit_name?.trim() || t("retail.unitSingle", "مفرد");
  const probText = (prob: Exclude<RecipeProblem, null>, name: string): string => {
    switch (prob) {
      case "in_trash": return t("services.rcp.inTrash", { name, defaultValue: "\"{{name}}\" محذوفة — رجّعها من المحذوفات أو شيلها" });
      case "product_gone": return t("services.rcp.gone", { name, defaultValue: "\"{{name}}\" ما عادت موجودة بالمخزن — شيلها من الوصفة" });
      case "pooled": return t("services.rcp.pooled", { name, defaultValue: "\"{{name}}\" رصيدها بمخزون القسم — ما تنخصم كمستهلك، شيلها" });
      case "farm_stock": return t("services.rcp.farm", { name, defaultValue: "\"{{name}}\" من مخزن الحقل — ما تنخصم كمستهلك للعيادة، شيلها" });
      case "no_sub_unit": return t("services.rcp.noSubUnit", { name, defaultValue: "\"{{name}}\" ما بيها وحدة صغيرة هسّة — فعّلها من المادة أو شيلها" });
    }
  };
  const refusalText = (code: RecipeRefusal, i: number | null): string => {
    const r = i === null ? undefined : rows[i];
    const name = r?.name ?? "";
    switch (code) {
      case "recipe_too_many": return t("services.rcp.tooMany", "الوصفة أكثر من ٤٠ مادة — شيل اللي ما تنصرف بكل مرّة");
      case "recipe_bad_line": return t("services.rcp.fix", { name, why: t("services.rcp.badQty", "اكتب كمية أكبر من صفر — لحد مليون وبثلاث مراتب عشرية أقصى"), defaultValue: "\"{{name}}\": {{why}}" });
      case "recipe_too_small": return t("services.rcp.fix", { name, why: t("services.rcp.tooSmall", "الكمية صغيرة كلش — ما تبيّن بالمخزون"), defaultValue: "\"{{name}}\": {{why}}" });
      case "recipe_duplicate": return t("services.rcp.dup", { name, defaultValue: "\"{{name}}\" مكرّرة بوحدتين ما تنجمع بالضبط — شيل وحدة منهن" });
      // سببُ السطر نفسِه (محذوفة، من الحقل…) لا «ما عادت موجودة» عن كلّ غائبٍ عن قائمة العيادة.
      case "recipe_product_missing": return probText((i === null ? null : views[i]?.prob) ?? "product_gone", name);
      case "recipe_pooled": return probText("pooled", name);
      case "recipe_farm": return probText("farm_stock", name);
      case "recipe_no_sub_unit": return probText("no_sub_unit", name);
    }
  };

  const save = async (ack: { over?: boolean; flat?: boolean } = {}) => {
    if (!canEdit || busy || !loaded || moved) return;
    setError(null);
    const lines: RecipeSetInput[] = rows.map((r) => {
      const m = milliOf(r.qty.trim());
      return { product_id: r.product_id, qty: m === null ? Number.NaN : fromScaled(m, 3), unit: r.unit };
    });
    // الخادمُ يرفض بهذه الرموز وبهذا الترتيب — فالرفضُ يُقال على سطره قبل أن يُنادى.
    const check = validateRecipeLines(lines, loaded.products);
    if (check.first) { playWarning(); setAsk(null); setProblem(check.first); return; }
    setProblem(null);
    const overYes = ack.over ?? overOk;
    if (over && !overYes) { playWarning(); setAsk("over"); return; }
    if (flatNeeded && ack.flat === undefined) { playTap(); setOverOk(overYes); setAsk("flat"); return; }
    const clearFlat = flatNeeded && ack.flat === true;
    setAsk(null);
    setBusy(true);
    try {
      const r = await consumptionApi.recipeSet(service.id, lines, loaded.fingerprint, clearFlat);
      let first = true;
      try { first = !localStorage.getItem(FIRST_SAVE_KEY); localStorage.setItem(FIRST_SAVE_KEY, "1"); } catch { /* swallow-ok: بلا تخزين تُقال كلَّ مرّة — أحسنُ من ألّا تُقال */ }
      playSuccess();
      toast.success(t("services.rcp.saved", { name: service.name, defaultValue: "انحفظت. من هسّة كل \"{{name}}\" يخصم هالمواد ويحسب كلفتها" }),
        first ? t("services.rcp.firstSave", "الأجهزة اللي ما تحدّثت ما تخصم — سكّر doctorVet وافتحه على كل جهاز") : undefined);
      onSaved({ lines: r.lines.length, clearedFlat: clearFlat });
      onClose();
    } catch (e) {
      playWarning();
      const msg = (e as { message?: unknown } | null)?.message;
      if (msg === "recipe_moved") setMoved(true);   // رسالتُها وزرُّها يبقيان حتى التحميل (لا يمسحهما تعديل)
      else setError(describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const inRecipe = useMemo(() => new Set(rows.map((r) => r.product_id.toLowerCase())), [rows]);
  const results = useMemo(() => {
    const s = searchable(q.trim());
    if (!loaded || s.length < 2) return { list: [] as Product[], more: 0 };
    /* الطرفان من نفس الدالّة (CLAUDE.md §٣): الاسمُ بـsearchable، والرمزُ بمصدره الواحد codeMatcher (matchCode:
       طيُّ الحالة «w90» = «W90»، وجزءُ الرمز كما بالبيع والشراء). والتي بالوصفة تُعرض مقفولةً لا تُخفى. */
    const byCode = codeMatcher(q);
    const all = [...loaded.products.values()].filter((p) => searchable(p.name).includes(s) || byCode(p));
    /* رمزٌ كُتب كاملاً («47» رقمُ رفّ) مطابقُه بالضبط (الأساسيُّ أو الإضافيّ، بالتطبيع نفسه) أوّلاً — كتبويب التلف: الجزئيُّ
       كان يدفعه خلف رموزٍ تحويه فيسقط خارج السقف. والسقفُ يقول إنه سقف («و٥ غيرها — اكتب أكثر»)، والمقفولةُ تُعدّ معها:
       ثمانٍ بلا كلمة كانت تُصدَّق «ماكو» فيُختار أقربُ اسمٍ أو تُدخل المادةُ ثانيةً. */
    const c = matchCode(q);
    const exact = (p: Product) => !!c && (matchCode(p.barcode) === c || (p.alt_codes ?? []).some((a) => matchCode(a) === c));
    const ranked = [...all.filter(exact), ...all.filter((p) => !exact(p))];
    return { list: ranked.slice(0, PICK_MAX), more: Math.max(0, ranked.length - PICK_MAX) };
  }, [q, loaded]);
  const add = (p: Product) => {
    if (rows.length >= MAX_RECIPE_LINES || p.pooled || p.farm_id || inRecipe.has(p.id.toLowerCase())) return;
    playTap();
    // الوحدةُ الصغيرة أوّلاً حين تكون: المستهلكُ يُعدّ بالمل والزوج والسرنجة لا بالعلبة.
    edit((rs) => [...rs, { key: `new:${p.id}`, product_id: p.id, name: p.name, qty: "1", unit: splitOf(p) !== null ? "sub" : "stock", problem: null, merged: false }]);
    setQ("");
    setPicking(false);
  };

  const title = t("services.rcp.title", { name: service.name, defaultValue: "مستهلكات \"{{name}}\" — تنخصم كل مرّة تنباع" });
  const tiny = (n: string) => t("services.rcp.lessThan", { n, defaultValue: "أقل من {{n}}" });

  return (
    <Dialog open={open} onClose={tryClose} size="lg" title={title}
      footer={loaded && canEdit ? (
        <>
          <Button data-rcp-cancel variant="ghost" disabled={busy} onClick={tryClose}>{t("common.cancel", "إلغاء")}</Button>
          <Button data-rcp-save loading={busy} disabled={!dirty || moved} onClick={() => void save()}>{t("common.save", "حفظ")}</Button>
        </>
      ) : undefined}>
      {failed !== null ? (
        <div data-rcp-failed role="alert" className="rounded-2xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300">
          <p className="flex items-center gap-1.5 text-sm font-bold"><AlertTriangle size={15} className="shrink-0" /> {t("services.rcp.loadFailed", "ما گدرنا نجيب المواد")}</p>
          <p className="mt-1">{describeDbError(failed.e, t)}</p>
          <Button data-rcp-retry size="sm" variant="secondary" className="mt-2" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : !loaded ? (
        <div data-rcp-loading className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <div className="space-y-2">
          {!canEdit && <p data-rcp-readonly className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted">{t("services.rcp.readOnly", "وصفة الخدمة يعدّلها المدير — افتح وضع المدير")}</p>}
          {rows.length === 0 && <p data-rcp-empty className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-ink-subtle">{t("services.rcp.empty", "ما بيها مواد بعد — ضيف اللي تنصرف بكل مرّة")}</p>}
          {rows.map((r, i) => {
            const v = views[i];
            const flagged = problem?.index === i;
            const splits = splitOf(v.p) !== null;
            const qtyShown = v.m !== null ? formatQty(fromScaled(v.m, 3)) : r.qty;
            const unitName = r.unit === "sub" ? subOf(v.p) : boxOf(v.p);
            const live = v.prob === null;
            let effect: string | null = null;
            if (live && v.n !== null && v.n > 0n && v.m !== null) {
              const money_ = v.w !== null ? money(fromScaled(v.w, 2)) : "";
              if (r.unit === "sub") {
                const s = stockAmount(v.n, tiny);
                effect = showCost
                  ? t("services.rcp.effectCost", { q: qtyShown, u: unitName, s, box: boxOf(v.p), v: money_, defaultValue: "{{q}} {{u}} = {{s}} {{box}} · {{v}}" })
                  : t("services.rcp.effect", { q: qtyShown, u: unitName, s, box: boxOf(v.p), defaultValue: "{{q}} {{u}} = {{s}} {{box}}" });
              } else if (showCost) effect = t("services.rcp.effectStock", { v: money_, defaultValue: "{{v}} لكل مرّة" });
            }
            return (
              <div key={r.key} data-rcp-row={r.key} data-rcp-broken={v.prob ?? undefined}
                className={cn("rounded-xl border bg-surface-1 p-2.5", flagged ? "border-danger-400" : "border-line")}>
                {/* الاسمُ بسطره مع زرّ الشيل وحده، والكميةُ والوحدةُ تحته (كورقة المستهلكات). بسطرٍ واحد كان الاسمُ (min-w-0
                    flex-1، أساسُه صفر) يمتصّ ضغطَ الحقول الثابتة كلَّه فلا يلفّ السطر: ٤٥px بهاتفٍ عرضُه ٣٧٥، و«كفوف فحص لاتكس
                    وسط» و«…كبير» كلتاهما «كفو…» — تعديلٌ يقع على المقاس الغلط والخصمُ صامتٌ بكلّ بيعة. ويلفّ ولا يُقصّ: الفرقُ
                    بآخر الاسم (مقاس، حجم)، والهاتفُ لا يعرض title. */}
                <div className="flex items-center gap-2">
                  <span data-rcp-name className="min-w-0 flex-1 break-words text-sm font-bold text-ink">{r.name}</span>
                  {canEdit && (
                    <button type="button" data-rcp-remove={r.key} aria-label={t("common.remove", "إزالة")}
                      onClick={() => { playTap(); edit((rs) => rs.filter((x) => x.key !== r.key)); }}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!live || !canEdit ? (
                    <span data-rcp-qtytext className="text-xs font-semibold text-ink-muted tabular-nums">{qtyShown} {unitName}</span>
                  ) : (
                    <>
                      <input data-rcp-qty dir="ltr" inputMode="decimal" value={r.qty} aria-label={r.name}
                        onChange={(e) => { const val = e.target.value; edit((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: val } : x))); }}
                        className={cn("input h-9 w-24 px-2 py-0 text-end text-sm font-bold tabular-nums", v.badQty && "border-danger-400")} />
                      {splits ? (
                        <Segmented<RecipeUnit> size="sm" layoutId={`rcp-unit-${r.key}`} value={r.unit}
                          onChange={(u) => { playTap(); edit((rs) => rs.map((x) => (x.key === r.key ? { ...x, unit: u } : x))); }}
                          options={[{ value: "stock", label: boxOf(v.p) }, { value: "sub", label: subOf(v.p) }]} />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="chip bg-surface-2 text-xs text-ink-muted">{boxOf(v.p)}</span>
                          {!v.p?.sold_by_weight && (
                            <button type="button" data-rcp-subask onClick={() => setWhy((w) => (w === r.key ? null : r.key))}
                              className="text-2xs font-bold text-ink-subtle underline">{t("services.rcp.subAsk", "بالمل؟")}</button>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {effect && <p data-rcp-effect className="mt-1 text-2xs text-ink-subtle tabular-nums">{effect}</p>}
                {v.prob !== null && (
                  <p data-rcp-reason className="mt-1 text-2xs font-semibold text-danger-600">
                    {probText(v.prob, r.name)}
                    {v.prob === "no_sub_unit" && <> · <Link to={`/inventory?edit=${encodeURIComponent(r.product_id)}`} onClick={openProduct(`/inventory?edit=${encodeURIComponent(r.product_id)}`)} className="underline">{t("services.rcp.openProduct", "افتح المادة")}</Link></>}
                  </p>
                )}
                {(twins.get(r.product_id.toLowerCase()) ?? 0) > 1 && <p data-rcp-dup className="mt-1 text-2xs font-semibold text-danger-600">{t("services.rcp.dup", { name: r.name, defaultValue: "\"{{name}}\" مكرّرة بوحدتين ما تنجمع بالضبط — شيل وحدة منهن" })}</p>}
                {r.merged && <p data-rcp-merged className="mt-1 text-2xs text-ink-subtle">{t("services.rcp.merged", "انطوت مادتين بوحدة — جمعنا السطرين")}</p>}
                {live && v.badQty && <p data-rcp-badqty className="mt-1 text-2xs font-semibold text-danger-600">{t("services.rcp.badQty", "اكتب كمية أكبر من صفر — لحد مليون وبثلاث مراتب عشرية أقصى")}</p>}
                {live && v.n === 0n && <p data-rcp-small className="mt-1 text-2xs font-semibold text-danger-600">{t("services.rcp.tooSmall", "الكمية صغيرة كلش — ما تبيّن بالمخزون")}</p>}
                {live && showCost && v.k === 0n && <p data-rcp-zero className="mt-1 text-2xs text-warn-700 dark:text-warn-300">{t("services.rcp.zeroCost", { name: r.name, defaultValue: "\"{{name}}\" سعر شرائه صفر — كلفته ما راح تنحسب، حدّثه من المخزون" })}</p>}
                {why === r.key && (
                  <p data-rcp-nosub className="mt-1 text-2xs leading-relaxed text-ink-muted">
                    {t("services.rcp.noSub", "هالمادة تنحسب بالعلبة بس. تريد تخصم بالمل؟ افتح المادة وفعّل \"الوحدة الصغيرة\" واكتب كم مل بالعبوة")}
                    {" "}<Link to={`/inventory?edit=${encodeURIComponent(r.product_id)}`} onClick={openProduct(`/inventory?edit=${encodeURIComponent(r.product_id)}`)} className="font-bold underline">{t("services.rcp.openProduct", "افتح المادة")}</Link>
                  </p>
                )}
              </div>
            );
          })}

          {canEdit && (rows.length >= MAX_RECIPE_LINES ? (
            <p data-rcp-full className="text-xs text-ink-subtle">{t("services.rcp.full", "وصلت ٤٠ مادة — هذا أقصى الوصفة")}</p>
          ) : picking ? (
            <div data-rcp-picker className="rounded-xl border border-line bg-surface-1 p-2.5">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input data-rcp-search autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("services.rcp.searchPh", "اسم المادة أو الباركود")} className="input py-2 ps-9" />
              </div>
              {searchable(q.trim()).length >= 2 && results.list.length === 0 && <p className="mt-2 text-xs text-ink-subtle">{t("common.noMatches", "لا توجد نتائج مطابقة")}</p>}
              {results.list.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.list.map((p) => {
                    const off = inRecipe.has(p.id.toLowerCase()) ? t("services.rcp.pickIn", "موجودة بالوصفة")
                      : p.pooled ? t("services.rcp.pickPooled", "رصيدها بمخزون القسم — ما تنخصم كمستهلك") : p.farm_id ? t("services.rcp.pickFarm", "من مخزن الحقل — ما تنخصم كمستهلك للعيادة") : null;
                    return (
                      <button key={p.id} type="button" data-rcp-pick={p.id} disabled={!!off} onClick={() => add(p)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition hover:bg-surface-2 disabled:opacity-50">
                        {/* الاسمُ بسطره والسببُ تحته: بجانبه كان السببُ (١٩٨–٢٠٢px) يترك للاسم ٧٣–٧٧px بهاتفٍ عرضُه ٣٧٥ — «شاش معق…»
                            و«شاش مخز…» ولا يُعرف أيُّها قُفل. ويلفّ ولا يُقصّ (كسطور الوصفة): «…عبوة بلاستيك ٥٠٠ مل» و«…٢٥٠ مل» كانتا
                            تُقصّان حيث تفترقان، والهاتفُ لا يعرض title. */}
                        <span className="min-w-0 flex-1">
                          <span data-rcp-pickname className="block break-words font-semibold text-ink">{p.name}</span>
                          {off && <span data-rcp-pickoff className="mt-0.5 block text-2xs text-ink-subtle">{off}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {results.more > 0 && <p data-rcp-more className="mt-1 text-2xs text-ink-subtle">{t("services.rcp.more", { n: formatNum(results.more), defaultValue: "و{{n}} غيرها — اكتب أكثر" })}</p>}
            </div>
          ) : (
            <Button data-rcp-add size="sm" variant="secondary" onClick={() => { playTap(); setPicking(true); }}>{t("services.rcp.add", "+ مادة")}</Button>
          ))}

          {showCost && rows.length > 0 && (
            <p data-rcp-total className={cn("pt-1 text-sm font-bold tabular-nums", over ? "text-danger-600" : "text-ink-muted")}>
              {priceC > 0n
                ? t("services.rcp.total", { v: money(fromScaled(totalC, 2)), p: money(fromScaled(priceC, 2)), pct: formatNum(Number(roundDiv(totalC * 100n, priceC))), defaultValue: "كلفة المواد لكل مرّة: {{v}} من سعر {{p}} ({{pct}}٪)" })
                : t("services.rcp.totalNoPrice", { v: money(fromScaled(totalC, 2)), defaultValue: "كلفة المواد لكل مرّة: {{v}}" })}
            </p>
          )}

          {ask === "over" && (
            <div data-rcp-over className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs font-semibold text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300">
              <p>{t("services.rcp.overAsk", { v: money(fromScaled(totalC, 2)), p: money(fromScaled(priceC, 2)), defaultValue: "كلفة المواد ({{v}}) أكثر من سعر الخدمة ({{p}}) — يمكن كاتب ٢ عبوة وانت تقصد ٢ مل؟" })}</p>
              <Button data-rcp-over-yes size="sm" variant="danger" className="mt-2" disabled={busy} onClick={() => { setOverOk(true); void save({ over: true }); }}>{t("services.rcp.overYes", "أي صحيح، احفظ")}</Button>
            </div>
          )}
          {ask === "flat" && (
            <div data-rcp-flat className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-xs text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
              <p className="font-semibold">{showCost
                ? t("services.rcp.flatAsk", { v: money(loaded.flat ?? 0), defaultValue: "هذي الخدمة بيها كلفة {{v}} مكتوبة بيدك. هسّة المواد تنحسب من الوصفة. الـ{{v}} شنو؟" })
                : t("services.rcp.flatAskNoNum", "هذي الخدمة بيها كلفة مكتوبة بيدك. هسّة المواد تنحسب من الوصفة. هالكلفة شنو؟")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button data-rcp-flat-clear size="sm" variant="outline" disabled={busy} onClick={() => void save({ over: overOk, flat: true })}>{t("services.rcp.flatClear", "كانت تقدير للمواد — صفّرها")}</Button>
                <Button data-rcp-flat-keep size="sm" variant="outline" disabled={busy} onClick={() => void save({ over: overOk, flat: false })}>{t("services.rcp.flatKeep", "شي ثاني (مختبر برّا، أجور) — خلّيها")}</Button>
              </div>
            </div>
          )}
          {problem && <p data-rcp-problem role="alert" className="text-xs font-bold text-danger-600">{refusalText(problem.code, problem.index)}</p>}
          {(error || moved) && (
            <div data-rcp-error role="alert" className="rounded-xl bg-danger-50 p-2.5 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
              <p>{moved ? t("services.rcp.moved", "الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد") : error}</p>
              {moved && <Button data-rcp-reload size="sm" variant="secondary" className="mt-2" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); void load(); }}>{t("services.rcp.reload", "حمّلها من جديد")}</Button>}
            </div>
          )}
        </div>
      )}
      {/* الخروجُ يسأل — نافذةٌ فوق المحرّر تبلع Esc وحدَها (مكدّسُ Dialog)، لا تأكيدُ متصفّحٍ يُقبل بلا قراءة. */}
      <Dialog open={!!leave} onClose={stay} size="sm" title={t("services.rcp.leaveTitle", "تطلع وتضيّع تعديلك على الوصفة؟")}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button data-rcp-leave-no variant="secondary" onClick={stay}>{t("services.rcp.leaveNo", "لا، ارجع")}</Button>
            <Button data-rcp-leave-yes variant="danger" onClick={() => exit(leave?.to ?? null)}>{t("services.rcp.leaveYes", "إي، طلّعني")}</Button>
          </div>
        }>
        <p data-rcp-leave className="text-sm text-ink-muted">{t("services.rcp.leaveAsk", { name: service.name, defaultValue: "اللي غيّرته بمستهلكات \"{{name}}\" ما انحفظ بعد." })}</p>
      </Dialog>
    </Dialog>
  );
}
