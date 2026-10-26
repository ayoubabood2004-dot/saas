import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ClipboardCheck, FileSearch, Hourglass, Lock, PackageSearch, RotateCw, Search, TrendingDown, X } from "lucide-react";
import { page } from "@/lib/lazyPage";
import { LoadBoundary } from "@/components/LoadBoundary";
import type { CountDecision, CountReason, Product, ProductLot, StockCount as CountRow, StockLossRow } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Dialog, Segmented, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum, formatQty, money, searchable } from "@/lib/utils";
import { codeMatcher } from "@/lib/productCodes";
import { describeDbError } from "@/lib/errors";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { getCountDailyN, setCountDailyN } from "@/lib/settings";
import { pickToday, reasonsFor, diffValue, deadStock, abcClasses, countable, WITHDRAWAL_REASONS, type CountPick, type CountState } from "@/lib/countPick";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { holdUpdates } from "@/lib/inflight";

/* ============================================================================
 * الجردُ الدوريّ — م٦ (docs/inventory-vnext-plan.md، هجرة 0216).
 *
 * ثلاثُ شاشاتٍ بصفحةٍ واحدة:
 *   • **عدّ اليوم**: N مادةً مختارةً بـ`countPick.ts` (الغالي المتحرّك، الأقدمُ عدّاً،
 *     المشكوك) مع بحثٍ لإضافة غيرها. رصيدُ النظام **لا يُعرض قبل العدّ** — العادُّ
 *     الذي يرى الرقمَ يميل له. بعد الكتابة يظهر الفرقُ ويُطلب سببُه.
 *   • **بانتظار الموافقة**: الفرقُ لا يمسّ الرصيد حتى يوافق المدير (قرارُ المالك).
 *     الموافقةُ تقول قبل التنفيذ كم يُسجَّل سحباً «من المخزن» وبأيّ سبب.
 *   • **وين راحت الفلوس**: الخسائرُ بأسبابها (من `report_stock_losses`)، والراكدُ
 *     ٩٠ يوماً، وABC — ومستهلكاتُ الخدمات (report_consumables، 0252): كلفةُ خدمةٍ لا خسارة.
 *   • **تالف/هدر** (سندُ التلف، 0254): فرقٌ يُكتب بلا عدّ — ينتظر المديرَ كالفرق، أو يطبّقه المديرُ
 *     فوراً. شاشتُه وبطاقاتُ المستهلكات بـWasteTab.tsx (رفيقُ النطاق، كسولاً).
 * ========================================================================= */

type Tab = "today" | "waste" | "pending" | "report" | "audit";
type Range = "month" | "last" | "d90";
const TABS: readonly Tab[] = ["today", "waste", "pending", "report", "audit"];
/** ما يرجعه stock_count_decide بعد الموافقة (0254): موادُّ بقيت تحت الصفر. */
type CountNegative = { product_id: string; name: string; stock: number };

/* فحصُ المخزن (0245) **مثبَّتٌ داخل الجرد** (طلبُ المالك): تبويبٌ هنا، وأزرارُ التقرير بعلاماته.
 * مالكُ نصوصه InventoryAudit.tsx (نطاق `audit`) — يُحمَّل كسولاً بنطاقه فلا يقرأ هذا الملفُّ مفاتيحَه. */
/* وفشلُ تحميلها يبقى بمكانه (LoadBoundary، نمطُ 0241): `lazy()` يخبّئ الوعدَ المرفوض للأبد، فـ«أعد
 * المحاولة» تصنع قطعةً جديدة — وإلا أسقط زرٌّ لم يصل شاشةَ الجرد كلَّها وما كُتب فيها. */
const loadAuditView = () => page(() => import("@/pages/InventoryAudit").then((m) => ({ default: m.InventoryAuditView })), ["audit"]);
const loadReportButtons = () => page(() => import("@/pages/InventoryAudit").then((m) => ({ default: m.StockReportButtons })), ["audit"]);
let AuditView = loadAuditView();
let ReportButtons = loadReportButtons();
/* سندُ التلف وبطاقاتُ مستهلكات الخدمات بقطعةٍ كسولةٍ واحدة (رفيقُ نطاق cnt): الحسابُ الدقيق وبابُ الخادم
 * (consumption، consumptionApi) لا يدخلان قطعةَ هذه الصفحة — ولا يُستوردان منها ثابتاً. */
const loadWasteView = () => page(() => import("@/components/stock/WasteTab"));
const loadConsCards = () => page(() => import("@/components/stock/WasteTab").then((m) => ({ default: m.ConsumablesCards })));
let WasteView = loadWasteView();
let ConsCards = loadConsCards();
/** `lots`: عدُّ كلّ دفعة (0217) لمادةٍ فيها أكثرُ من دفعة — والمادةُ = مجموعُها. */
interface Line { counted: string; reason: CountReason | null; note: string; lots: Record<string, string> }

const DAYS = 90;

/** رفضُ الجرد برمزه (`count_reason`…) وتلميحِه: الخادمُ — والمرآةُ التجريبيةُ مثلَه، بتلميحه حرفاً (refuse بـdemoCounts) — يسمّي
 *  المادةَ بـhint عربيّ فيُعرض كما هو بالعربية؛ وبغير العربية يُترجم الرمزُ هنا من نطاق الصفحة. ورفضٌ بلا تلميح يُترجم كذلك —
 *  احتياطٌ لا مصدرَ له اليوم: كلُّ رفضٍ count_* بالهجرات (0216، 0217، 0254، 0255) وكلُّ refuse بالمرآة يحمل تلميحَه. */
function countError(e: unknown, t: TFunction, lang: string): string {
  const code = /^count_(\w+)$/.exec(e instanceof Error ? e.message : "")?.[1];
  const hint = (e as { hint?: string } | null)?.hint;
  if (code && (!hint || !lang.startsWith("ar")) && i18next.exists(`cnt.err.${code}`)) return t(`cnt.err.${code}`);
  return describeDbError(e, t);
}

/* العدُّ بالضبط كما يجمعه الخادمُ ويقارنه (stock_count_submit): كلُّ رقمٍ numeric من نصّ JSON المرسَل — `String(n)`، ومنه الأُسّيّ
 * «1e-7» — بلا تقريب، والرصيدُ بمنازل عموده الثلاث (numeric(14,3)؛ والمرآةُ milliOf). بالعائم ٠٫٠٥ + ٠٫٠٧ = ٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١
 * فيُقال «زايدة» عن رصيدٍ ٠٫١٢ ويُطلب سببُ فرقٍ لا يراه الخادم (ولا يُرسل العدُّ بلاه). والعددُ نفسُه بثلاث منازل أقصى (tooFine):
 * أدقُّ منها لا يحمله الرصيد — ٠٫٠٥٠٤ + ٠٫٠٧ على ٠٫١٢ فرقٌ عند الخادم يُسأل سببُه ثم تُرجعه الموافقةُ (round(stock + d, 3)) إلى الرصيد
 * نفسِه، والسطرُ يقول «الفرق +0» — فيُقال بالسطر ويُرفض إرسالُه كسند التلف والوصفة («بثلاث مراتب عشرية أقصى»)، ولا يُقرَّب صامتاً.
 * فالجمعُ والمقارنةُ بأعدادٍ صحيحة — هنا لا من consumption.ts: الحسابُ الدقيق لا يدخل قطعةَ الصفحة (loadWasteView أعلاه). */
type Exact = { n: bigint; s: number };
/** رقمٌ منتهٍ ← أرقامُه ومنازلُه كما يقرؤها numeric من نصّه (كلُّ نداءٍ بعد Number.isFinite). */
function exact(x: number): Exact {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (!m) return { n: 0n, s: 0 };
  const f = m[3] ?? "", s = f.length - Number(m[4] ?? 0), n = BigInt(`${m[2]}${f}`) * 10n ** BigInt(Math.max(0, -s));
  return { n: m[1] ? -n : n, s: Math.max(0, s) };
}
const scaled = (a: Exact, s: number): bigint => a.n * 10n ** BigInt(s - a.s);
const plus = (a: Exact, b: Exact): Exact => { const s = Math.max(a.s, b.s); return { n: scaled(a, s) + scaled(b, s), s }; };
/** إلى ثلاث منازل (numeric(·,3))، النصفُ بعيداً عن الصفر. */
function at3(a: Exact): Exact {
  if (a.s <= 3) return a;
  const q = 10n ** BigInt(a.s - 3), v = a.n < 0n ? -a.n : a.n, r = (2n * v + q) / (2n * q);
  return { n: a.n < 0n ? -r : r, s: 3 };
}
/** للعرض والإرسال: أقربُ عائمٍ إلى القيمة، من نصّها العشريّ. */
const toNum = (a: Exact): number => Number(`${a.n}e-${a.s}`);
/** فرقُ المعدود عن كمية النظام بالضبط — رصيدِ المادة أو كميةِ دفعتها — والنظامُ بمنازل الرصيد الثلاث كما يحمله عمودُه (رصيدٌ عائمٌ
 *  بالتجريبيّ ٠٫١ + ٠٫٢ هو ٠٫٣ و٠٫٧ + ٠٫١ هو ٠٫٨، والنصفُ بعيداً عن الصفر كـmilliOf): إشارتُه تحكم (فرقٌ يُسأل سببُه أو «مطابق»)،
 *  وقيمتُه للعرض. يُنادى بعددٍ ليس tooFine وحده. */
function diffOf(got: Exact, system: number): { sign: number; v: number } {
  const sys = at3(exact(Number(system) || 0)), d = plus(got, { n: -sys.n, s: sys.s });
  return { sign: d.n > 0n ? 1 : d.n < 0n ? -1 : 0, v: toNum(d) };
}
/** عددٌ كُتب بأكثر من منازل الرصيد الثلاث (٠٫١٢٠٤) — يُقال بالسطر ويُرفض إرسالُه (انظر أعلاه)، و«٠٫١٢٥٠» ثلاثٌ لا أربع. */
const tooFine = (a: Exact): boolean => a.s > 3;

/** كلفةُ وحدة المخزون كما يلقطها الخادمُ بالعدّ والسند (stock_unit_cost، 0255): المتوسّطُ إن عُرف وإلا سعرُ
 *  الشراء — فمعاينةُ الفرق بقيمة ما سيُسجَّل لا بسعر الشراء وحده. للعرض (الحسابُ الدقيق لا يدخل هذه القطعة). */
const unitCostOf = (p: Product): number => Math.max(Number(p.avg_cost ?? p.purchase_price ?? 0) || 0, 0);

/** كلمةُ وحدة المخزون: العلبة، أو الكيلو للموزون. */
const stockWord = (t: TFunction, p: Product | undefined): string => (p?.sold_by_weight ? t("retail.unitKg", "كغ") : t("retail.unitBox", "علبة"));
/** كلمةُ وحدة العدّ حيث يلتبس العدد: الموزونُ بالكيلو، وما له وحدةٌ صغيرة بالعلبة (لا بالحبّات: ٢٫٥ لا ٢٥٠) — والمادةُ البسيطة
 *  عددُها بلا كلمة. بحقل العدّ وبالفرق. */
const countWord = (t: TFunction, p: Product | undefined): string | null =>
  (p?.sold_by_weight || (p?.has_sub_unit && Number(p.units_per_box) > 0) ? stockWord(t, p) : null);

/** كميةُ السند كما كُتبت بوحدتها («٢ مل»): الصغيرةُ بلقطة اسمها، والعلبةُ (أو الكيلو للموزون) بكلمتها — لا
 *  فرقُه بوحدة المخزون (١ مل من ٢٠٠٠٠ = −٠٫٠٠٠٠٥ يُعرض بثلاث منازل «−0»). */
function wasteQtyText(t: TFunction, r: CountRow, p: Product | undefined): string {
  const sub = r.entered_unit === "sub" && r.entered_qty != null;
  const word = sub ? (r.unit_label || p?.sub_unit_name || t("retail.unitSingle", "مفرد")) : stockWord(t, p);
  return `${formatQty(Number(r.entered_qty ?? r.system_qty) || 0)} ${word}`;
}

function rangeOf(r: Range, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth();
  if (r === "month") return { from: new Date(y, m, 1).toISOString(), to: new Date(y, m + 1, 1).toISOString() };
  if (r === "last") return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
  return { from: new Date(now.getTime() - 90 * 86_400_000).toISOString(), to: new Date(now.getTime() + 60_000).toISOString() };
}

export function StockCount() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { can, role } = usePermissions();
  const { restricted } = useOverride();
  const isManager = role === "manager";
  const allowed = can("manageInventory");
  /* الفحصُ للمدير والطبيب كدالّته؛ والجردُ نفسُه لكلّ من له manageInventory (الشرطُ أدناه). */
  const canAudit = role === "manager" || role === "veterinarian";
  /* التبويبُ بالعنوان (`?tab=`) لا بحالة الصفحة: «افتح المادة» من الفحص ثم الرجوع كان يُنزل على «عدّ
   * اليوم» فيُفتح الفحصُ ويُختار من جديد بعد كلّ تصليح. التبديلُ يستبدل العنوانَ (replace) فلا يملأ
   * التاريخ، و«عدّ اليوم» بلا معامل. ومن يصل: بطاقةُ الباركود والعنوانُ القديم /inventory/audit (`audit`)،
   * و«الجرد اليومي» من الفحص (`today` — دفعٌ للتاريخ فالرجوعُ يعيد الفحص). وقيمةٌ غريبة، أو `audit` لمن
   * لا يراه (انتهى رفعُ PIN المدير)، تُمسح من العنوان نفسِه — فرفعُ PIN لاحق لا يعيد تبويبَ الفحص فوق
   * قائمة عدٍّ يكتب فيها الموظف. */
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab = asked !== null && (TABS as readonly string[]).includes(asked) && (asked !== "audit" || canAudit) ? (asked as Tab) : "today";
  const setTab = useCallback((v: Tab) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (v === "today") next.delete("tab"); else next.set("tab", v);
    return next;
  }, { replace: true }), [setParams]);
  useEffect(() => { if (asked !== null && (asked === "today" || asked !== tab)) setTab(tab); }, [asked, tab, setTab]);
  const [, setLazyTick] = useState(0);
  /* سندُ التلف يبقى مركَّباً (مخفياً) بعد أوّل فتح: مسودّتُه بحالته — نظرةٌ على «تنتظر موافقة» أو
   * إعادةُ تحميل البيانات بعد الإرسال لا تمسحها، ونتيجةُ الإرسال تبقى مقروءة. ولا يُفتح إلا لمن له الصلاحية: من لا
   * صلاحيةَ له يصل ?tab=waste فلا يُركَّب له السندُ ولا يُقرأ له شيء. و`wasteDraft` عددُ سطوره (لـ«سندك محفوظ» أدناه). */
  const [wasteSeen, setWasteSeen] = useState(false);
  useEffect(() => { if (tab === "waste" && allowed) setWasteSeen(true); }, [tab, allowed]);
  const [wasteDraft, setWasteDraft] = useState(0);
  /* ما بقي تحت الصفر بعد موافقةٍ (0254) — بحالة الصفحة لا التبويب: الموافقةُ تعيد التحميل فيُعاد بناءُ التبويب. */
  const [negs, setNegs] = useState<CountNegative[]>([]);
  useEffect(() => { if (tab !== "pending") setNegs((cur) => (cur.length ? [] : cur)); }, [tab]);
  const [data, setData] = useState<{ products: Product[]; sold: Map<string, number>; state: Map<string, CountState>; pending: CountRow[]; lots: Map<string, ProductLot[]> } | "loading" | "error">("loading");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(getCountDailyN);
  /* عدٌّ لم يُرسل يعيش بحالة الصفحة وحدها — لا نسخةٌ جديدة تُحمَّل فوقه ولو خمل التبويب وذهب
   * صاحبُه للغداء (تدقيقٌ عدائيّ: ٤٠ سطراً تضيع). الإرسالُ أو مغادرةُ الصفحة يُفلتان. */
  // عدٌّ مكتوب لا وجودُ السطر: رقمٌ كُتب ثم مُسح، أو سببٌ وملاحظةٌ بقيا بعد مسح الرقم (لا يُرسلان بلاه
  // ولا يُريان) — كانا يُبقيان الإمساكَ بلا عملٍ يُرى (تدقيقٌ عدائيّ رابع).
  const dirty = Object.values(lines).some((l) => l.counted.trim() !== "" || Object.values(l.lots).some((v) => v.trim() !== ""));
  useEffect(() => (dirty ? holdUpdates(Infinity) : undefined), [dirty]);

  const load = useCallback(async () => {
    setData("loading");
    try {
      const [products, sold, state, pending, active] = await Promise.all([
        repo.listProducts(), repo.productSalesRate(DAYS), repo.stockCountState(), repo.listStockCounts({ pending: true }), repo.listActiveLots(),
      ]);
      const lots = new Map<string, ProductLot[]>();
      for (const l of active) { const a = lots.get(l.product_id); if (a) a.push(l); else lots.set(l.product_id, [l]); }
      for (const a of lots.values()) a.sort((x, y) => (x.expiry_date ?? "9999").localeCompare(y.expiry_date ?? "9999"));
      setData({ products, sold, state, pending, lots });
    } catch { setData("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ready = typeof data === "object" ? data : null;
  const pendingIds = useMemo(() => new Set((ready?.pending ?? []).map((c) => c.product_id ?? "")), [ready]);
  const picks = useMemo<CountPick[]>(() => (ready ? pickToday(ready.products, ready.sold, ready.state, n, new Date(), pendingIds) : []), [ready, n, pendingIds]);
  const byId = useMemo(() => new Map((ready?.products ?? []).map((p) => [p.id, p])), [ready]);
  const shown = useMemo(() => {
    const ids = new Set(picks.map((p) => p.product.id));
    return [...picks.map((p) => ({ product: p.product, pick: p as CountPick | null })),
      ...extra.filter((id) => !ids.has(id) && byId.has(id)).map((id) => ({ product: byId.get(id)!, pick: null }))];
  }, [picks, extra, byId]);

  const results = useMemo(() => {
    const s = searchable(q.trim());
    if (!ready || s.length < 2) return [];
    /* الطرفان من نفس الدالّة (CLAUDE.md §٣): الاسمُ بـsearchable، والرمزُ بمصدره الواحد codeMatcher — طيُّ الحالة
       («w90» = «W90») وجزءُ الرمز الأساسيّ أو الإضافيّ كالبيع والشراء؛ === كان لا يلقى رقمَ رفٍّ بحروفٍ صغيرة. */
    const byCode = codeMatcher(q);
    return ready.products.filter((p) => countable(p) && !pendingIds.has(p.id) && (searchable(p.name).includes(s) || byCode(p))).slice(0, 8);
  }, [q, ready, pendingIds]);

  /* سندُ التلف خارج سلسلة التحميل: يرسم انتظارَ البيانات وفشلَها بنفسه ويبقى مركَّباً (hidden) — فلا يُعاد بناؤه حين تُعاد
     البيانات بعد إرساله، ولا حين يُبدَّل التبويب ومسودّتُه مكتوبة، **ولا حين ينتهي رفعُ PIN المدير**: شاشةُ «الجرد لمن عنده
     صلاحية…» تحمله مخفياً بمفتاحه نفسِه تحت جذرٍ من نوعه نفسِه (div)، فيرجع برفعٍ لاحق كما كُتب — كعدّ اليوم الذي تحمله حالةُ
     الصفحة. كانت العودةُ المبكّرة شجرةً بلاه فتفكّه وتضيع المسودّة (ويُعاد تعبئةُ رابطٍ فوق ما عدّله المدير). */
  const wasteBox = (wasteSeen || (tab === "waste" && allowed)) && (
    <div key="waste" hidden={!allowed || tab !== "waste"} data-count-waste>
      <LoadBoundary scope="count-waste" onRetry={() => { WasteView = loadWasteView(); setLazyTick((n) => n + 1); }}>
        <Suspense fallback={<div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>}>
          <WasteView products={ready?.products ?? null} failed={data === "error"} pendingIds={pendingIds} isManager={isManager}
            showCost={can("viewProfits") && !restricted} onChanged={load} onDraft={setWasteDraft} />
        </Suspense>
      </LoadBoundary>
    </div>
  );

  if (!allowed) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock key="lock" size={32} className="mb-3 text-ink-subtle" />
        <p key="no" className="text-sm text-ink-muted">{t("cnt.noAccess", "الجرد لمن عنده صلاحية إدارة المخزن. راجع مدير العيادة.")}</p>
        {wasteSeen && wasteDraft > 0 && <p key="kept" className="mt-2 text-xs font-semibold text-warn-700 dark:text-warn-200" data-count-waste-kept>{t("cnt.waste.kept", "سند التلف اللي كتبته محفوظ — افتح وضع المدير وكمّله")}</p>}
        {wasteBox}
      </div>
    );
  }

  const lineOf = (id: string): Line => lines[id] ?? { counted: "", reason: null, note: "", lots: {} };
  const setLine = (id: string, patch: Partial<Line>) => setLines((m) => ({ ...m, [id]: { ...lineOf(id), ...patch } }));
  /** مادةٌ فيها دفعتان فأكثر تُعدّ دفعةً دفعة (0217) — الموظفُ يلقى العلبَ بتواريخها على الرف. */
  const lotsOf = (id: string): ProductLot[] => { const a = ready?.lots.get(id) ?? []; return a.length > 1 ? a : []; };
  /** المعدودُ بالضبط، أو null ما لم يكتمل: الواحدةُ بحقلها، والمتعدّدةُ حين تُعدّ دفعاتُها كلُّها — ومجموعُها كما يجمعه الخادم (exact). */
  const countedOf = (p: Product): Exact | null => {
    const l = lineOf(p.id), ls = lotsOf(p.id);
    if (ls.length) {
      if (!ls.every((x) => (l.lots[x.id] ?? "").trim() !== "" && Number.isFinite(Number(l.lots[x.id])))) return null;
      return ls.reduce((s, x) => plus(s, exact(Number(l.lots[x.id]))), exact(0));
    }
    return l.counted.trim() !== "" && Number.isFinite(Number(l.counted)) ? exact(Number(l.counted)) : null;
  };
  const entered = shown.filter(({ product }) => countedOf(product) !== null);

  const submit = async () => {
    const payload = [];
    for (const { product } of entered) {
      const l = lineOf(product.id);
      const got = countedOf(product);
      const ls = lotsOf(product.id);
      if (!got || got.n < 0n) { playWarning(); toast.error(t("cnt.badQty", { name: product.name, defaultValue: "«{{name}}»: العدد لازم يكون صفر أو أكثر" })); return; }
      if (tooFine(got)) { playWarning(); toast.error(t("cnt.badFine", { name: product.name, defaultValue: "«{{name}}»: اكتب العدد بثلاث مراتب عشرية أقصى" })); return; }
      // الإشارةُ بالضبط (diffOf) — بها يقرّر الخادمُ «مطابق» أو «اختر السبب»، فبها يُطلب السببُ ويُرسل.
      const diff = diffOf(got, product.stock).sign;
      if (diff !== 0 && (!l.reason || !reasonsFor(diff).includes(l.reason))) {
        playWarning(); toast.error(t("cnt.needReason", { name: product.name, defaultValue: "«{{name}}» بيها فرق — اختر السبب" })); return;
      }
      if (ls.some((x) => Number(l.lots[x.id]) < 0)) { playWarning(); toast.error(t("cnt.badQty", { name: product.name, defaultValue: "«{{name}}»: العدد لازم يكون صفر أو أكثر" })); return; }
      payload.push({ product_id: product.id, counted: toNum(got), reason: diff === 0 ? null : l.reason, note: l.note.trim() || null,
        lots: ls.length ? ls.map((x) => ({ lot_id: x.id, counted: Number(l.lots[x.id]) })) : undefined });
    }
    if (!payload.length) return;
    setBusy(true);
    try {
      const r = await repo.submitStockCount(payload);
      playSuccess();
      toast.success(t("cnt.saved", { m: formatNum(r.matched), p: formatNum(r.pending), defaultValue: "انسجل العدّ: {{m}} مطابقة، و{{p}} بيها فرق تنتظر موافقة المدير" }));
      setLines({}); setExtra([]); setQ("");
      await load();
    } catch (e) {
      playWarning(); toast.error(countError(e, t, i18n.language));
      // الرصيدُ تغيّر من تحت الصفحة (بيعٌ بعد فتحها) أو عدّها غيرُك: تُحدَّث القائمةُ ويبقى ما كتبتَه.
      if (/^count_(reason|already_pending|product_missing)$/.test(e instanceof Error ? e.message : "")) void load();
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/inventory" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("cnt.back", "رجوع للمخزون")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardCheck size={24} /></span>
        <div className="me-auto min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("cnt.title", "الجرد اليومي")}</h1>
          <p className="text-sm text-ink-subtle">{t("cnt.sub", "عدّ كم مادة كل يوم — والفرق ما يتغيّر بالرصيد إلا بموافقة المدير")}</p>
        </div>
        {/* تقريرُ الجرد الكامل بعلامات الفحص على كلّ سطر — من هنا كما من المخزن، وبشرطه هناك:
            مخزنٌ فيه موادّ (ورقةٌ فارغة تحسب معادلاتُ ملخّصها صفَّ العناوين «فرقاً»). */}
        {ready && ready.products.length > 0 && (
          <LoadBoundary scope="count-reports" onRetry={() => { ReportButtons = loadReportButtons(); setLazyTick((n) => n + 1); }}>
            <Suspense fallback={null}>
              <div className="flex flex-wrap gap-2" data-count-reports>
                <ReportButtons products={ready.products} />
              </div>
            </Suspense>
          </LoadBoundary>
        )}
      </div>

      {/* أربعةُ تبويباتٍ (مع الفحص) أعرضُ من شاشة الهاتف: تلتفّ لصفّين بدل أن تمدّ الصفحةَ أفقياً —
          والالتفافُ لا التمرير، كي لا يختبئ التبويبُ الرابع خارج الشاشة. */}
      <Segmented<Tab> layoutId="cnt-tab" value={tab} onChange={(v) => { playTap(); setTab(v); }} className="mb-4 max-w-full flex-wrap rounded-3xl"
        options={[
          { value: "today", label: t("cnt.tabToday", "عدّ اليوم"), icon: <ClipboardCheck size={14} /> },
          { value: "waste", label: t("cnt.waste.tab", "تالف/هدر"), icon: <X size={14} /> },
          { value: "pending", label: t("cnt.tabPending", { n: formatNum(ready?.pending.length ?? 0), defaultValue: "تنتظر موافقة ({{n}})" }), icon: <Hourglass size={14} /> },
          { value: "report", label: t("cnt.tabReport", "وين راحت الفلوس"), icon: <TrendingDown size={14} /> },
          ...(canAudit ? [{ value: "audit" as const, label: t("cnt.tabAudit", "فحص المخزن"), icon: <FileSearch size={14} /> }] : []),
        ]} />

      {/* سندُ التلف (مفتاحُه "waste" بالجذرين — انظر wasteBox أعلاه). */}
      {wasteBox}

      {/* الفحصُ يجلب بياناته بنفسه — لا ينتظر بياناتِ العدّ ولا يسقط بفشلها. */}
      {tab === "waste" ? null : tab === "audit" ? (
        <LoadBoundary scope="count-audit" onRetry={() => { AuditView = loadAuditView(); setLazyTick((n) => n + 1); }}>
          <Suspense fallback={<div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>}>
            {/* عدٌّ مكتوبٌ لم يُرسل: روابطُ الفحص الخارجة بتبويبٍ جديد فلا يضيع (حالةُ الصفحة وحدها تحمله). */}
            <AuditView embedded newTabLinks={dirty} />
          </Suspense>
        </LoadBoundary>
      ) : data === "loading" ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : data === "error" ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="text-sm text-ink-muted">{t("cnt.loadFailed", "ما كدرنا نجيب بيانات الجرد — المشكلة بالاتصال ولا شي ضاع.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : tab === "today" ? (
        <div className="space-y-3" data-count-today>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            <span>{t("cnt.todayHint", "هاي المواد مختارة لك اليوم: الغالية الي تنباع هواية، والي صارلها مدة ما انعدّت، والي طلع بيها فرق قبل. عدّها بالرف واكتب العدد.")}</span>
            {isManager && (
              <label className="ms-auto flex items-center gap-1 font-semibold">
                {t("cnt.perDay", "مواد باليوم")}
                <select className="input h-8 w-20 py-0 text-sm" value={n} data-count-n
                  onChange={(e) => { const v = Number(e.target.value); setN(v); setCountDailyN(v); }}>
                  {[3, 5, 10, 15, 20, 30].map((v) => <option key={v} value={v}>{formatNum(v)}</option>)}
                </select>
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="card p-6 text-center text-sm text-ink-subtle" data-count-empty>{t("cnt.nothingToday", "ماكو مواد مقترحة اليوم — كلها انعدّت بوقتها. تكدر تضيف مادة بالبحث.")}</p>
          ) : (
            <ul className="space-y-2">
              {shown.map(({ product: p, pick }) => {
                const l = lineOf(p.id);
                const ls = lotsOf(p.id);
                const got = countedOf(p);
                const has = got !== null;
                const sys = Number(p.stock) || 0;
                // عددٌ أدقّ من ثلاث منازل يُقال بالسطر (لا «الفرق +0» وسبب)؛ وغيرُه فرقُه بالضبط كما يراه الخادم: إشارتُه تحكم، وقيمتُه للعرض.
                const fine = got !== null && tooFine(got);
                const df = got && !fine ? diffOf(got, p.stock) : { sign: 0, v: 0 };
                const diff = df.sign;
                const opts = reasonsFor(diff);
                // وحدةُ العدّ حيث يلتبس (كغ، علبة) — بالحقل وبالفرق.
                const word = countWord(t, p), u = word ? ` ${word}` : "";
                return (
                  <li key={p.id} className={cn("card p-3", has && (fine || diff !== 0) && "border-warn-300 dark:border-warn-500/40")} data-count-line>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(pick?.why ?? []).map((w) => (
                            <span key={w} className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
                              {w === "stale" ? t("cnt.why.stale", { d: formatNum(pick?.daysSince ?? 0), defaultValue: "صارلها {{d}} يوم ما انعدّت" }) : t(`cnt.why.${w}`)}
                            </span>
                          ))}
                          {!pick && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">{t("cnt.why.added", "أضفتها بالبحث")}</span>}
                        </div>
                      </div>
                      {!ls.length && (
                        <label className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                          {t("cnt.counted", "لقيت")}
                          <input type="number" inputMode="decimal" min={0} step="any" className="input h-10 w-24 text-center tabular-nums" data-count-input
                            value={l.counted} onChange={(e) => setLine(p.id, { counted: e.target.value })} />
                          {word && <span data-count-unit>{word}</span>}
                        </label>
                      )}
                    </div>
                    {ls.length > 0 && (
                      <div className="mt-2 space-y-1.5 rounded-xl bg-surface-2 p-2.5" data-count-lots>
                        <p className="text-2xs font-semibold text-ink-muted">{t("cnt.byLot", "هاي المادة بيها أكثر من دفعة — عدّ كل تاريخ وحده:")}</p>
                        {ls.map((x) => {
                          const v = l.lots[x.id] ?? "";
                          // فرقُ الدفعة بالضبط كفرق المادة (diffOf)؛ وعددٌ أدقّ من ثلاث منازل لا فرقَ له هنا — السطرُ يقوله (لا «+0»).
                          const lv = v.trim() !== "" && Number.isFinite(Number(v)) ? exact(Number(v)) : null;
                          const ld = lv && !tooFine(lv) ? diffOf(lv, x.qty) : null;
                          return (
                            <label key={x.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="min-w-0 flex-1 font-bold text-ink">
                                {x.expiry_date ? t("cnt.lotExp", { d: x.expiry_date.slice(0, 10).replace(/-/g, "/"), defaultValue: "تنتهي {{d}}" }) : t("cnt.lotNoDate", "بلا تاريخ")}
                                {ld && ld.sign !== 0 && <span className="ms-2 text-warn-700 dark:text-warn-300" data-count-lot-diff>{t("cnt.lotDiff", { sys: `${formatQty(x.qty)}${u}`, diff: `${ld.sign > 0 ? "+" : "−"}${formatQty(Math.abs(ld.v))}${u}`, defaultValue: "(النظام {{sys}} — {{diff}})" })}</span>}
                              </span>
                              <span className="text-ink-muted">{t("cnt.counted", "لقيت")}</span>
                              <input type="number" inputMode="decimal" min={0} step="any" className="input h-9 w-20 text-center tabular-nums" data-count-lot-input
                                value={v} onChange={(e) => setLine(p.id, { lots: { ...l.lots, [x.id]: e.target.value } })} />
                              {word && <span className="text-ink-muted" data-count-unit>{word}</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {has && (
                      fine ? (
                        <p className="mt-2 text-xs font-bold text-warn-700 dark:text-warn-200" data-count-fine>{t("cnt.fine", "اكتب العدد بثلاث مراتب عشرية أقصى — النظام ما يحفظ أدق منها")}</p>
                      ) : diff === 0 ? (
                        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-success-700 dark:text-success-300"><Check size={14} /> {t("cnt.match", "مطابق للنظام")}</p>
                      ) : (
                        <div className="mt-2 space-y-2 rounded-xl bg-warn-50/70 p-2.5 dark:bg-warn-500/10" data-count-diff>
                          <p className="text-xs font-bold text-warn-800 dark:text-warn-200">
                            {t("cnt.diffLine", { sys: `${formatQty(sys)}${u}`, diff: `${diff > 0 ? "+" : "−"}${formatQty(Math.abs(df.v))}${u}`, defaultValue: "النظام يگول {{sys}} — الفرق {{diff}}" })}
                            {!restricted && unitCostOf(p) > 0 && <> · {money(Math.abs(df.v) * unitCostOf(p))}</>}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {opts.map((r) => (
                              <button key={r} type="button" aria-pressed={l.reason === r} data-count-reason={r}
                                onClick={() => { playTap(); setLine(p.id, { reason: r }); }}
                                className={cn("rounded-full px-3 py-1 text-xs font-bold transition",
                                  l.reason === r ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:text-ink")}>
                                {t(`cnt.reason.${r}`)}
                              </button>
                            ))}
                          </div>
                          <input className="input h-9 text-sm" maxLength={200} placeholder={t("cnt.notePh", "ملاحظة (اختياري): شنو صار؟")}
                            value={l.note} onChange={(e) => setLine(p.id, { note: e.target.value })} />
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="card p-3">
            <label className="flex items-center gap-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="input h-10 flex-1" value={q} onChange={(e) => setQ(e.target.value)} data-count-search
                placeholder={t("cnt.searchPh", "تريد تعدّ مادة ثانية؟ ابحث بالاسم أو امسح الباركود")} />
            </label>
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line/60">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-start text-sm hover:text-brand-700" data-count-add
                      onClick={() => { playTap(); setExtra((x) => (x.includes(p.id) ? x : [...x, p.id])); setQ(""); }}>
                      <PackageSearch size={14} className="text-ink-subtle" /> {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="lg" loading={busy} disabled={entered.length === 0} leftIcon={<Check size={18} />} onClick={() => void submit()} data-count-submit>
              {t("cnt.submit", { n: formatNum(entered.length), defaultValue: "سجّل العدّ ({{n}})" })}
            </Button>
          </div>
        </div>
      ) : tab === "pending" ? (
        <div className="space-y-3">
          {negs.length > 0 && (
            <div className="rounded-xl bg-warn-50/70 p-3 dark:bg-warn-500/10" data-pending-neg>
              <ul className="space-y-1 text-xs">
                {/* الرصيدُ بوحدة المخزون («−0.03 علبة») — السندُ فوقه بالصغيرة («تلف 2 مل»)، ورقمٌ عارٍ بجانبه يُقرأ ملاً. */}
                {negs.map((x) => (
                  <li key={x.product_id} className="font-bold text-warn-700 dark:text-warn-200">{t("cnt.neg.after", { name: x.name, stock: `${Number(x.stock) < 0 ? "−" : ""}${formatQty(Math.abs(Number(x.stock) || 0))} ${stockWord(t, byId.get(x.product_id))}`, defaultValue: '"{{name}}" رصيدها صار {{stock}} بعد الموافقة — سجّل فاتورة الشراء أو سوّ جرد' })}</li>
                ))}
              </ul>
            </div>
          )}
          <PendingTab rows={ready!.pending} productOf={(id) => byId.get(id ?? "")} isManager={isManager} restricted={restricted} onChanged={load} onNegatives={setNegs} />
        </div>
      ) : (
        <ReportTab products={ready!.products} sold={ready!.sold} restricted={restricted} canProfit={can("viewProfits")} />
      )}
    </div>
  );
}

function PendingTab({ rows, productOf, isManager, restricted, onChanged, onNegatives }: {
  rows: CountRow[]; productOf: (id: string | null) => Product | undefined; isManager: boolean; restricted: boolean;
  onChanged: () => Promise<void>; onNegatives: (list: CountNegative[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(new Set(rows.map((r) => r.id))); }, [rows]);

  const stockOf = (id: string | null) => productOf(id)?.stock;
  const chosen = rows.filter((r) => picked.has(r.id));
  /** ما سيطبّقه الخادمُ فعلاً (مرآةُ `stock_count_decide` بـ0254): الفرقُ كلُّه على الرصيد **الحاليّ** بلا حصر —
   *  ولو نزل تحت الصفر — والسندُ −d بالضبط. كان يُحصر بصفر فيرى المديرُ «ما راح ينسجل سحب» عن تلفٍ حقيقيّ
   *  بعد استهلاكٍ أنزل الرصيد؛ فلا يوافق على رقمٍ ويُسجَّل غيرُه. */
  const applied = (r: CountRow) => r.counted_qty - r.system_qty;
  // السندُ فرقٌ لا عدّ: لا «تغيّر الرصيد من وقت العدّ» له — فرقُه −d على أيّ رصيد.
  const changed = chosen.filter((r) => { const cur = stockOf(r.product_id); return r.source !== "waste" && cur !== undefined && Number(cur) !== r.system_qty; });
  /** كميةُ السند كما كُتبت بوحدتها («تلف ٢ مل»). */
  const wasteQty = (r: CountRow): string => wasteQtyText(t, r, productOf(r.product_id));
  const byReason = (() => {
    const m = new Map<CountReason, { value: number; items: string[] }>();
    for (const r of chosen) {
      const d = applied(r);
      if (!r.reason || !WITHDRAWAL_REASONS.includes(r.reason) || d >= 0 || r.unit_cost <= 0) continue;
      const g = m.get(r.reason) ?? { value: 0, items: [] };
      g.value += -d * r.unit_cost;
      // نصُّ السحب كما يكتبه الخادم: السندُ بما كُتب ووحدته الصغيرة («Lyse ×2 مل»)، والجردُ بفرقه.
      g.items.push(r.source === "waste" && r.entered_qty != null ? `${r.product_name} ×${formatQty(Number(r.entered_qty))}${r.unit_label ? ` ${r.unit_label}` : ""}` : `${r.product_name} ×${formatQty(-d)}`);
      m.set(r.reason, g);
    }
    return m;
  })();
  const withdrawTotal = [...byReason.values()].reduce((s, g) => s + g.value, 0);
  const corrections = chosen.filter((r) => r.reason === "entry_error" || r.reason === "found").length;
  // كلفتُها صفر: تنخصم بالموافقة والخادمُ لا يكتب لها سحباً — تُقال بالاسم لا تسقط من القائمة بصمت.
  const zeroCost = chosen.filter((r) => !!r.reason && WITHDRAWAL_REASONS.includes(r.reason) && applied(r) < 0 && r.unit_cost <= 0);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const r = await repo.decideStockCounts(chosen.map((c) => c.id), approve);
      playSuccess();
      toast.success(approve
        ? t("cnt.approved", { n: formatNum(r.approved), v: money(r.withdrawals.reduce((s, w) => s + w.amount, 0)), defaultValue: "انعتمد {{n}} — وانسجل سحب من المخزن بقيمة {{v}}" })
        : t("cnt.rejected", { n: formatNum(r.rejected), defaultValue: "انرفض {{n}} — الرصيد ما تغيّر" }));
      setConfirm(null);
      // ما بقي تحت الصفر يُقال ويبقى بعد إعادة التحميل (الصفحةُ تحمله): «سجّل فاتورة الشراء أو سوّ جرد».
      onNegatives(approve ? ((r as CountDecision & { negatives?: CountNegative[] }).negatives ?? []) : []);
      await onChanged();
    } catch (e) {
      playWarning(); toast.error(countError(e, t, i18n.language));
    } finally { setBusy(false); }
  };

  if (!rows.length) return <p className="card p-6 text-center text-sm text-ink-subtle" data-pending-empty>{t("cnt.noPending", "ماكو فروق تنتظر موافقة.")}</p>;

  return (
    <div className="space-y-3" data-pending>
      {!isManager && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs font-semibold text-ink-muted">{t("cnt.managerOnly", "الموافقة للمدير وحده — الرصيد ما يتغيّر لحد ما يوافق. (افتح وضع المدير إذا إنت المدير)")}</p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const diff = r.counted_qty - r.system_qty;
          // سندُ التلف (0254) فرقٌ لا عدّ: يُقال بما كُتب («تلف ٢ مل») لا «النظام ٠٫٠٠٤ ← لقينا ٠».
          const waste = r.source === "waste";
          // والجردُ بوحدته حيث تلتبس («(−0.01 كغ)») كعدّ اليوم.
          const pw = countWord(t, productOf(r.product_id));
          return (
            <li key={r.id} className="card flex items-start gap-3 p-3" data-pending-row>
              {isManager && (
                <input type="checkbox" className="mt-1 h-4 w-4" checked={picked.has(r.id)} aria-label={r.product_name}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  {r.product_name}
                  {waste && <span className="ms-2 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted" data-pending-waste>{t("cnt.waste.chip", "سند تلف")}</span>}
                </p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {waste ? t("cnt.waste.line", { q: wasteQty(r), defaultValue: "تلف {{q}}" })
                    : t("cnt.pendingLine", { sys: formatQty(r.system_qty), got: formatQty(r.counted_qty), diff: `${diff > 0 ? "+" : "−"}${formatQty(Math.abs(diff))}${pw ? ` ${pw}` : ""}`, defaultValue: "النظام {{sys}} ← لقينا {{got}} ({{diff}})" })}
                  {!restricted && r.unit_cost > 0 && <> · {money(Math.abs(diffValue(r.system_qty, r.counted_qty, r.unit_cost)))}</>}
                </p>
                {(r.lot_counts ?? []).filter((c) => c.counted !== c.system).map((c) => (
                  <p key={c.lot_id} className="text-2xs font-semibold text-warn-800 dark:text-warn-200 tabular-nums" data-pending-lot>
                    {t("cnt.pendingLot", { d: c.expiry_date ? c.expiry_date.slice(0, 10).replace(/-/g, "/") : "—", sys: formatQty(c.system), got: formatQty(c.counted), defaultValue: "دفعة {{d}}: النظام {{sys}} ← لقينا {{got}}" })}
                  </p>
                ))}
                <p className="text-2xs text-ink-subtle">
                  {r.reason ? t(`cnt.reason.${r.reason}`) : ""}
                  {r.note ? ` · ${r.note}` : ""}
                  {" · "}{waste ? t("cnt.waste.by", { who: r.counted_by_name || t("cnt.someone", "موظف"), defaultValue: "سجّلها {{who}}" }) : t("cnt.by", { who: r.counted_by_name || t("cnt.someone", "موظف"), defaultValue: "عدّها {{who}}" })}
                  {" · "}<span dir="ltr">{new Date(r.counted_at).toLocaleString()}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {isManager && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={!chosen.length} leftIcon={<X size={16} />} onClick={() => { playTap(); setConfirm("reject"); }} data-pending-reject>
            {t("cnt.reject", { n: formatNum(chosen.length), defaultValue: "ارفض المختار ({{n}})" })}
          </Button>
          <Button disabled={!chosen.length} leftIcon={<Check size={16} />} onClick={() => { playTap(); setConfirm("approve"); }} data-pending-approve>
            {t("cnt.approve", { n: formatNum(chosen.length), defaultValue: "وافق على المختار ({{n}})" })}
          </Button>
        </div>
      )}
      <Dialog open={confirm !== null} onClose={() => !busy && setConfirm(null)}
        title={confirm === "approve" ? t("cnt.confirmApproveTitle", "تأكيد الموافقة") : t("cnt.confirmRejectTitle", "تأكيد الرفض")}
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>{t("common.cancel", "إلغاء")}</Button>
          <Button loading={busy} variant={confirm === "reject" ? "danger" : "primary"} onClick={() => void decide(confirm === "approve")} data-pending-go>
            {confirm === "approve" ? t("cnt.approveGo", "وافق وسجّل") : t("cnt.rejectGo", "ارفض")}
          </Button>
        </div>}>
        {confirm === "approve" ? (
          <div className="space-y-3 text-sm" data-confirm-approve>
            <p>{t("cnt.confirmApprove", { n: formatNum(chosen.length), defaultValue: "راح يتصحّح رصيد {{n}} مادة بالفرق الي انعدّ (مو بالرقم — الي انباع بعد العدّ يبقى مبيوع)." })}</p>
            {withdrawTotal > 0 ? (
              <div className="rounded-xl bg-warn-50/70 p-3 dark:bg-warn-500/10">
                {/* القيمةُ بلقطة كلفة السطر (stock_unit_cost، 0255): المتوسّطُ إن عُرف وإلا سعرُ الشراء — ولا تعبئةَ لما قبل 0255، فأكثرُ
                    الرفّ يومَ النشر بسعر شرائه. «بالكلفة» صادقةٌ بالحالين؛ «بسعر الشراء» كذبت مع أوّل متوسّط و«بمتوسط الكلفة» قبله. */}
                <p className="font-bold text-warn-700 dark:text-warn-200">{t("cnt.neg.withdrawCost", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بالكلفة، ما يطلع من القاصة):" })}</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {[...byReason.entries()].map(([reason, g]) => (
                    <li key={reason}><b>{t(`cnt.reason.${reason}`)}</b> — {money(g.value)}: {g.items.join("، ")}</li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-xs text-ink-subtle">{t("cnt.noWithdraw", "ما راح ينسجل سحب — الفروق المختارة تصحيح رصيد بس.")}</p>}
            {zeroCost.length > 0 && (
              <ul className="space-y-0.5 text-xs text-ink-subtle" data-confirm-zero>
                {zeroCost.map((r) => <li key={r.id}>«{r.product_name}»: {t("cnt.waste.zeroCost", "كلفتها صفر — تنخصم من المخزون بس ما تنحسب خسارة")}</li>)}
              </ul>
            )}
            {changed.length > 0 && (
              <div className="rounded-xl border border-line p-3 text-xs" data-confirm-changed>
                {/* «ما ينزل تحت الصفر» صار كذباً بـ0254 (الفرقُ بلا حصر) — النصُّ الجديد يقولها كما هي. */}
                <p className="font-bold text-ink">{t("cnt.neg.changedSince", { n: formatNum(changed.length), defaultValue: "تغيّر رصيد {{n}} مادة من وقت العدّ (بيع أو تعديل) — الفرق ينطبق على الرصيد الحالي كله، ولو نزل تحت الصفر:" })}</p>
                <ul className="mt-1 space-y-0.5 text-ink-muted">
                  {changed.map((r) => (
                    <li key={r.id}>{t("cnt.changedLine", { name: r.product_name, then: formatQty(r.system_qty), now: formatQty(Number(stockOf(r.product_id)) || 0), defaultValue: "«{{name}}»: وقت العدّ {{then}} ← هسه {{now}}" })}</li>
                  ))}
                </ul>
              </div>
            )}
            {corrections > 0 && <p className="text-xs text-ink-subtle">{t("cnt.corrections", { n: formatNum(corrections), defaultValue: "و{{n}} تصحيح (خطأ إدخال / زيادة) بلا سحب." })}</p>}
          </div>
        ) : (
          <p className="text-sm">{t("cnt.confirmReject", { n: formatNum(chosen.length), defaultValue: "راح ينرفض {{n}} عدّ والرصيد يبقى مثل ما هو. العادّ يكدر يعدّها مرة ثانية." })}</p>
        )}
      </Dialog>
    </div>
  );
}

function ReportTab({ products, sold, restricted, canProfit }: { products: Product[]; sold: Map<string, number>; restricted: boolean; canProfit: boolean }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("month");
  /* مدّةُ بطاقات المستهلكات مثبّتةٌ بالمدّة المختارة: «آخر ٩٠ يوم» تُحسب من الآن، ورسمٌ يعيد حسابها كان
   * سيطلب التقريرَ بلا نهاية. */
  const period = useMemo(() => rangeOf(range), [range]);
  const [, setConsTick] = useState(0);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [res, setRes] = useState<{ losses: StockLossRow[]; lines: CountRow[] } | "loading" | "error">("loading");
  const load = useCallback(async () => {
    setRes("loading");
    try {
      const r = rangeOf(range);
      const [losses, lines] = await Promise.all([repo.reportStockLosses(r.from, r.to), repo.listStockCounts(r)]);
      setRes({ losses, lines });
    } catch { setRes("error"); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const dead = useMemo(() => deadStock(products, sold), [products, sold]);
  const deadValue = dead.reduce((s, d) => s + d.value, 0);
  const abc = useMemo(() => {
    const cls = abcClasses(products.filter(countable), sold);
    const out = { A: 0, B: 0, C: 0 };
    for (const c of cls.values()) out[c]++;
    return out;
  }, [products, sold]);

  if (restricted) return <p className="card p-6 text-center text-sm text-ink-subtle">{t("cnt.restricted", "المبالغ مقفولة على هذا الجهاز — افتح وضع المدير.")}</p>;

  const lossOf = (r: CountReason) => (typeof res === "object" ? res.losses.find((x) => x.reason === r) : undefined);
  const lossTotal = WITHDRAWAL_REASONS.reduce((s, r) => s + (lossOf(r)?.value ?? 0), 0);

  return (
    <div className="space-y-4" data-report>
      <Segmented<Range> layoutId="cnt-range" size="sm" value={range} onChange={(v) => { playTap(); setRange(v); }}
        options={[
          { value: "month", label: t("cnt.rangeMonth", "هذا الشهر") },
          { value: "last", label: t("cnt.rangeLast", "الشهر الماضي") },
          { value: "d90", label: t("cnt.range90", "آخر ٩٠ يوم") },
        ]} />
      {res === "loading" ? <Skeleton className="h-32 w-full rounded-2xl" />
        : res === "error" ? (
          <div className="card space-y-3 p-6 text-center">
            <p className="text-sm text-ink-muted">{t("cnt.reportFailed", "ما كدرنا نجيب الخسائر — ما نعرض رقم ناقص.")}</p>
            <Button size="sm" variant="secondary" leftIcon={<RotateCw size={14} />} onClick={() => void load()}>{t("common.retry", "أعد المحاولة")}</Button>
          </div>
        ) : (
          <>
            <section className="card p-4" data-report-losses>
              <p className="text-xs font-semibold text-ink-muted">{t("cnt.lossTotal", "خسائر المخزن (سحب من المخزن)")}</p>
              <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-warn-800 dark:text-warn-200">{money(lossTotal)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {WITHDRAWAL_REASONS.map((r) => (
                  <div key={r} className="rounded-xl bg-surface-2 p-3">
                    <p className="text-2xs font-semibold text-ink-muted">{t(`cnt.reason.${r}`)}</p>
                    <p className="font-display text-lg font-extrabold tabular-nums text-ink">{money(lossOf(r)?.value ?? 0)}</p>
                    <p className="text-2xs text-ink-subtle">{t("cnt.lines", { n: formatNum(lossOf(r)?.lines ?? 0), defaultValue: "{{n}} سطر" })}</p>
                  </div>
                ))}
              </div>
              {(lossOf("entry_error") || lossOf("found")) && (
                <p className="mt-3 text-xs text-ink-subtle">
                  {t("cnt.correctionsSum", { e: formatNum(lossOf("entry_error")?.lines ?? 0), f: formatNum(lossOf("found")?.lines ?? 0), defaultValue: "وتصحيحات بلا سحب: {{e}} خطأ إدخال، و{{f}} زيادة لقيناها." })}
                </p>
              )}
              {res.lines.length > 0 && (
                <ul className="mt-3 divide-y divide-line/60 text-xs">
                  {res.lines.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-2 py-1.5">
                      <span className="font-bold text-ink">{c.product_name}</span>
                      {/* السندُ بما كُتب ووحدته (−٢ مل) لا بفرقه بالعلبة: ما دون ٠٫٠٠٠٥ كان يُقال «−0». */}
                      <span className="text-ink-muted">{c.reason ? t(`cnt.reason.${c.reason}`) : ""} {c.source === "waste" && c.entered_qty != null ? `−${wasteQtyText(t, c, byId.get(c.product_id ?? ""))}` : `${(c.applied_delta ?? 0) > 0 ? "+" : "−"}${formatQty(Math.abs(c.applied_delta ?? 0))}`}</span>
                      {c.unit_cost > 0 && <span className="tabular-nums text-ink-muted">{money(Math.abs((c.applied_delta ?? 0) * c.unit_cost))}</span>}
                      <span className="ms-auto text-ink-subtle">{t("cnt.approvedBy", { who: c.decided_by_name || t("cnt.someone", "موظف"), defaultValue: "وافق {{who}}" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

      {/* مستهلكاتُ الخدمات (0252): كلفةُ خدمةٍ لا خسارة — بقراءتها وفشلها هي، لا تسقط بفشل الخسائر ولا تُسقطها. */}
      <LoadBoundary scope="count-cons" onRetry={() => { ConsCards = loadConsCards(); setConsTick((n) => n + 1); }}>
        <Suspense fallback={<Skeleton className="h-32 w-full rounded-2xl" />}>
          <ConsCards from={period.from} to={period.to} showCost={canProfit} products={products} />
        </Suspense>
      </LoadBoundary>

      <section className="card p-4" data-report-dead>
        <p className="text-xs font-semibold text-ink-muted">{t("cnt.deadTitle", "فلوس واگفة: مواد ما انباعت ٩٠ يوم")}</p>
        <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-ink">{money(deadValue)}</p>
        {/* deadStock يقيّم بالكلفة (countPick.ts: avg_cost ?? purchase_price، كـstock_unit_cost) — والعنوانُ يقول ما يُحسب بالحالين. */}
        <p className="text-2xs text-ink-subtle">{t("cnt.neg.deadCost", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بالكلفة" })}</p>
        {dead.length > 0 && (
          <ul className="mt-2 divide-y divide-line/60 text-xs">
            {dead.slice(0, 15).map((d) => (
              <li key={d.product.id} className="flex gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{d.product.name}</span>
                <span className="tabular-nums text-ink-muted">{formatQty(Number(d.product.stock) || 0)}</span>
                <span className="w-24 text-end tabular-nums text-ink">{money(d.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4" data-report-abc>
        <p className="text-xs font-semibold text-ink-muted">{t("cnt.abcTitle", "وين فلوسك بالمخزن (حسب مبيع ٩٠ يوم)")}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {(["A", "B", "C"] as const).map((c) => (
            <div key={c} className="rounded-xl bg-surface-2 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-ink">{formatNum(abc[c])}</p>
              <p className="text-2xs text-ink-subtle">{t(`cnt.abc.${c}`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
