import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type TFunction } from "i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Barcode, Building2, ClipboardCheck, Copy as CopyIcon, FileSpreadsheet, Hourglass, Lock,
  Pencil, Printer, RotateCw, ScanBarcode, Search, TrendingDown,
} from "lucide-react";
import type { AuditKind, BarcodeAilment, BarcodeHealthRow, Company, CompanySection, InventoryAuditRow, Product } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, dateLocale, formatNum, formatQty, matchCode, money, searchable } from "@/lib/utils";
import { describeDbError, withTimeout } from "@/lib/errors";
import { COVER_MAX } from "@/lib/inventoryAudit";
import { getClinicName } from "@/lib/settings";
import type { AuditMarks } from "@/lib/stocktake";
import { auditMarks, auditMarksFailed, MARKS_DAYS } from "@/lib/auditMarks";
import { buildStockReportHTML, openPrintWindow, writePrintWindow } from "@/lib/stockReportPrint";
import { exportStocktakeXlsx } from "@/lib/stockReportXlsx";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * فحصُ المخزن (0245) — ما وجده جردٌ يدويٌّ لعيادةٍ واحدة، تراه كلُّ عيادةٍ بنفسها.
 *
 * الحسابُ كلُّه بالقاعدة (`report_inventory_audit_json` و`verify_barcode_health` معاً —
 * هذه تُكمل تلك ولا تكرّرها)، وهذه الوحدةُ تعرض وتقول الطريق ولا تحسب. ولا زرَّ إصلاحٍ
 * جماعيّ ولا دمجٍ تلقائيّ (الخطّ الأحمر الأوّل): كلُّ ملاحظةٍ لها طريقُها الموجود بالتطبيق.
 *
 * **مثبَّتٌ داخل الجرد** (طلبُ المالك): `InventoryAuditView` تبويبٌ بـ«الجرد اليومي»، و
 * `StockReportButtons` أزرارُ «طباعة تقرير جرد» و«تصدير جرد إكسل» بعلامات الفحص على كلّ سطر.
 * وهذا الملفُّ مالكُ نطاق `audit` (hot-paths.json): الملفّان يحمّلانه بـpage(…, ["audit"])،
 * فالنصوصُ تُترجم هنا وتصل المخرجَين **بيانات** (`AuditMarks`) — لا عربيةَ صلبةً هناك.
 *
 * نموذجٌ واحد (`buildModel`) يرسم الشاشةَ ويطبع الورقة: نصٌّ يُكتب مرّتين يفترق يوماً.
 * والفشلُ يُقال ولا يُعرض نصفُ فحص: النداءان معاً أو لا شيء.
 * ========================================================================= */

const WINDOWS = [30, 90, 180] as const;
type Win = (typeof WINDOWS)[number];
const KEY = "vp_audit_days";
const PAGE = 25;
const DAY = 86400000;

function readWin(): Win {
  try {
    const v = Number(localStorage.getItem(KEY));
    if ((WINDOWS as readonly number[]).includes(v)) return v as Win;
  } catch { /* swallow-ok: تفضيلُ عرضٍ بالجهاز، وغيابُه = ٩٠ يوماً */ }
  return 90;
}

type Data = { audit: InventoryAuditRow[]; health: BarcodeHealthRow[] };
type Icon = typeof Barcode;

/** صفٌّ معروض — موحَّدٌ بين ملاحظات 0245 و0168، والملاحظةُ (chip/detail) محسوبةٌ سلفاً. */
interface VRow { id: string; name: string; code: string | null; stock: number | null; value: number; grp: string | null; chip: string | null; detail: string | null }
interface CheckM {
  key: string; title: string; why: string; fix: string; rows: VRow[];
  grouped: boolean; groupLabel?: (g: string) => string; showValue: boolean;
  action?: { to: string; label: string; icon: Icon; hideWhenLocked?: boolean };
}
interface SectionM { id: string; icon: Icon; title: string; checks: CheckM[]; money: boolean }

/** المجموعةُ عددٌ واحد (مكرّرٌ = زوجٌ لا صفّان). */
const countOf = (c: CheckM): number => (c.grouped ? groupsOf(c.rows).length : c.rows.length);
const valueOf = (rows: VRow[]): number => rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

/** مجموعاتٌ بمفتاحها (`grp`) بترتيب أوّل ظهور. */
function groupsOf(rows: VRow[]): [string, VRow[]][] {
  const m = new Map<string, VRow[]>();
  for (const r of rows) {
    const k = r.grp ?? r.id;
    const a = m.get(k);
    if (a) a.push(r); else m.set(k, [r]);
  }
  return [...m.entries()];
}

function handWhy(t: TFunction, why: string | null): string | null {
  const m: Record<string, string> = {
    short: t("audit.hShort", "قصير — رقم رف"),
    length: t("audit.hLength", "طوله مو طول باركود"),
    check: t("audit.hCheck", "رقم التحقق غلط"),
    pattern: t("audit.hPattern", "أرقام متسلسلة أو مكرّرة"),
    internal: t("audit.hInternal", "رمز داخلي مو من مولّدك"),
    ean8_prefix: t("audit.hEan8", "أول ٨ أرقام من باركود مادة ثانية"),
  };
  return why ? m[why] ?? null : null;
}

/** الكفاية: لا بيع بالمدّة، أو أيامٌ — وسقفُها (مئةُ سنة) يُقال كما هو لا رقماً يوهم بالدقّة. */
function coverText(t: TFunction, days: number | null): string {
  if (days == null) return t("audit.noSaleWindow", "صافي بيعها بالمدة صفر");
  if (days >= COVER_MAX) return t("audit.coverCentury", "تكفي أكثر من مئة سنة");
  return t("audit.coverDays", { n: formatNum(days), defaultValue: "تكفي {{n}} يوم" });
}

function impossibleDetail(t: TFunction, r: InventoryAuditRow): string {
  const cover = coverText(t, r.days);
  return r.why === "units"
    ? `${t("audit.unitsShape", { n: formatQty(r.qty ?? 0), defaultValue: "الرصيد + المبيع = {{n}} بالضبط مضاعف لعدد الوحدات بالعلبة — الأرجح عدد وحدات انكتب علب" })} · ${cover}`
    : cover;
}

/** النموذجُ الواحد: الأقسامُ وفحوصُها بنصوصها وصفوفها — للشاشة وللورقة معاً. */
function buildModel(t: TFunction, data: Data, keep: (name: string, code: string | null | undefined) => boolean): SectionM[] {
  const by = new Map<AuditKind, InventoryAuditRow[]>();
  for (const r of data.audit) {
    if (!keep(r.product_name, r.code)) continue;
    const a = by.get(r.kind);
    if (a) a.push(r); else by.set(r.kind, [r]);
  }
  const rowsOf = (k: AuditKind, chip?: (r: InventoryAuditRow) => string | null, detail?: (r: InventoryAuditRow) => string | null): VRow[] =>
    (by.get(k) ?? []).map((r) => ({
      id: r.product_id, name: r.product_name, code: r.code, stock: Number(r.stock), value: Number(r.value) || 0, grp: r.grp,
      chip: chip?.(r) ?? null, detail: detail?.(r) ?? null,
    }));
  const idleFix = t("audit.idleFix", "رجّعها للشركة، أو نزّل سعرها، أو اطلب أقل المرة الجاية. وإذا الرصيد نفسه غلط صحّحه من «الجرد اليومي».");
  const toCount = { to: "/inventory/count?tab=today", label: t("audit.toCount", "الجرد اليومي"), icon: ClipboardCheck };

  const healthTitle: Record<BarcodeAilment, string> = {
    twin: t("barcodeHealth.twin", "رمز واحد على أكثر من منتج"),
    alt_owned: t("barcodeHealth.altOwned", "رمز إضافي صاحبه منتج ثاني"),
    empty: t("barcodeHealth.empty", "رمز يبيّن موجود وهو فاضي"),
    arabic: t("barcodeHealth.arabic", "باركود بأحرف عربية"),
    excel: t("barcodeHealth.excel", "باركود شوّهه إكسل"),
  };
  const healthFix: Record<BarcodeAilment, string> = {
    twin: t("barcodeHealth.twinFix", "المسحة تبيع واحد منهم بلا قاعدة. ادمج المنتجين من المخزون، أو غيّر رمز واحد منهم."),
    alt_owned: t("barcodeHealth.altOwnedFix", "الرمز إضافي هنا وأساسي عند منتج ثاني — المسحة تروح لصاحبه الأصلي. شيله من الرموز الإضافية أو ادمج المنتجين."),
    empty: t("barcodeHealth.emptyFix", "كله مسافات أو محارف اتجاه خفية — ما يطابق ولا مسحة. افتح المنتج وامسح باركود العلبة من جديد."),
    arabic: t("barcodeHealth.arabicFix", "الكيبورد كان عربي وقت المسح. بدّل لغة الكيبورد إنكليزي وامسح العلبة من جديد."),
    excel: t("barcodeHealth.excelFix", "الرقم الأصلي ما ينسترجع من هذا الشكل. امسح العلبة من جديد — وبإكسل خلّي عمود الباركود «نص» قبل اللصق."),
  };
  const healthChecks: CheckM[] = (["twin", "alt_owned", "empty", "arabic", "excel"] as BarcodeAilment[]).map((k) => ({
    key: `bc_${k}`, title: healthTitle[k], fix: healthFix[k], why: t("audit.healthWhy", "من فحص صحة الباركودات بمولد الباركود."),
    grouped: false, showValue: false,
    rows: data.health.filter((r) => r.kind === k && keep(r.product_name, r.code))
      .map((r) => ({ id: r.product_id, name: r.product_name, code: r.code, stock: null, value: 0, grp: null, chip: null, detail: null })),
  }));

  const model: SectionM[] = [
    { id: "codes", icon: ScanBarcode, title: t("audit.sCodes", "الباركود"), money: false, checks: [
      { key: "no_code", title: t("audit.noCode", "بلا باركود"), grouped: false, showValue: false, rows: rowsOf("no_code"),
        why: t("audit.noCodeWhy", "ما تنمسح — تنباع بالبحث بالاسم بس، وأول ما تجي علبتها تنضاف مرة ثانية كمادة جديدة."),
        fix: t("audit.noCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود. وإذا العلبة ما عليها باركود (فرط، ألعاب) ولّد واحد من «مولد الباركود» واطبعه."),
        action: { to: "/inventory?view=barcodes", label: t("audit.toGenerator", "مولد الباركود"), icon: ScanBarcode, hideWhenLocked: true } },
      { key: "hand_code", title: t("audit.handCode", "رمز مكتوب باليد"), grouped: false, showValue: false,
        rows: rowsOf("hand_code", (r) => handWhy(t, r.why)),
        why: t("audit.handCodeWhy", "رقم رف أو رمز مكتوب بالإيد مو باركود المصنع — يوم تنمسح العلبة يگول «ما ينعرف» والمادة موجودة، وهذا أول مصدر للتوائم."),
        fix: t("audit.handCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود — الرمز القديم يبقى رمز إضافي فما يضيع رقم الرف.") },
      ...healthChecks,
    ] },
    { id: "dups", icon: CopyIcon, title: t("audit.sDups", "مكرّر محتمل"), money: false, checks: [
      { key: "dup_twin", title: t("audit.dupTwin", "رقم رف وباركود مصنع بنفس الاسم"), grouped: true, showValue: false,
        rows: rowsOf("dup_twin", (r) => (r.why === "shelf" ? t("audit.roleShelf", "رف") : r.why === "factory" ? t("audit.roleFactory", "مصنع") : null)),
        why: t("audit.dupTwinWhy", "نفس الاسم: وحدة بلا باركود أو برقم رف، ووحدة بباركود المصنع — الغالب نفس المادة دخلت مرتين، ورصيدها مقسوم على صفّين."),
        fix: t("audit.dupTwinFix", "افحص العلبة. إذا نفسها: افتح صف «الرف» ← «دمج بمنتج ثاني» ← اختر صف المصنع؛ الرصيد ينجمع ورقم الرف يصير رمز إضافي. وإذا مو نفسها: ميّز الاسم.") },
      { key: "dup_name", title: t("audit.dupName", "نفس الاسم برموز مختلفة"), grouped: true, showValue: false, rows: rowsOf("dup_name"),
        why: t("audit.dupNameWhy", "ممكن نكهات أو أحجام مختلفة بنفس الاسم — وممكن نفس المادة مرتين. بشاشة البيع يبينون نفس الشي."),
        fix: t("audit.dupNameFix", "افحص العلبة: إذا نفسها افتح وحدة منهم ← «دمج بمنتج ثاني». وإذا مختلفة، زيد بالاسم شنو يفرّقها (النكهة، الحجم).") },
    ] },
    { id: "impossible", icon: AlertTriangle, title: t("audit.sImpossible", "كميات مستحيلة"), money: true, checks: [
      { key: "impossible", title: t("audit.impossible", "رصيد ما ينباع بسنة"), grouped: false, showValue: true, action: toCount,
        rows: rowsOf("impossible", undefined, (r) => impossibleDetail(t, r)),
        why: t("audit.impossibleWhy", "رصيد يحتاج أكثر من سنة حتى ينباع بمعدّل بيعك، وقيمته كبيرة على مخزنك — أو عدد وحدات انكتب علب. هذا يضخّم قيمة المخزن كلها."),
        fix: t("audit.impossibleFix", "عدّ المادة بالرف من «الجرد اليومي» واكتب العدد الصحيح، وسبب الفرق «خطأ إدخال» — مو «عجز»، العجز يسجّل سحب فلوس.") },
    ] },
    { id: "idle", icon: Hourglass, title: t("audit.sIdle", "راكد"), money: true, checks: [
      { key: "never_sold", title: t("audit.neverSold", "ما انباعت أبداً"), grouped: false, showValue: true, fix: idleFix,
        rows: rowsOf("never_sold", undefined, (r) => t("audit.ageDays", { n: formatNum(r.days ?? 0), defaultValue: "دخلت قبل {{n}} يوم" })),
        why: t("audit.neverSoldWhy", "عليها رصيد وما انباعت ولا مرة من دخلت (أكثر من ٣٠ يوم).") },
      { key: "stopped", title: t("audit.stopped", "وقف بيعها"), grouped: false, showValue: true, fix: idleFix,
        rows: rowsOf("stopped", undefined, (r) => t("audit.sinceDays", { n: formatNum(r.days ?? 0), defaultValue: "آخر بيع قبل {{n}} يوم" })),
        why: t("audit.stoppedWhy", "انباعت قبل، بس آخر بيع صار قبل أكثر من ٣٠ يوم والرصيد باقي.") },
      { key: "slow", title: t("audit.slow", "بطيئة"), grouped: false, showValue: true, fix: idleFix,
        rows: rowsOf("slow", undefined, (r) => coverText(t, r.days)),
        why: t("audit.slowWhy", "تنباع، بس رصيدها يكفي أكثر من ١٨٠ يوم بمعدّل البيع الحالي.") },
    ] },
    { id: "zero", icon: TrendingDown, title: t("audit.sZero", "رصيده صفر وينباع"), money: false, checks: [
      { key: "zero_sold", title: t("audit.zeroSold", "رصيدها صفر وانباعت بآخر ٣٠ يوم"), grouped: false, showValue: false, action: toCount,
        rows: rowsOf("zero_sold", undefined, (r) => t("audit.soldRecent", { n: formatQty(r.qty ?? 0), d: formatNum(r.days ?? 0), defaultValue: "انباع {{n}} — آخر بيع قبل {{d}} يوم" })),
        why: t("audit.zeroSoldWhy", "خلصت وهي تنطلب — أو موجودة بالرف ورصيدها بالنظام غلط، فتبين «خالصة» بشاشة البيع."),
        fix: t("audit.zeroSoldFix", "إذا موجودة بالرف: عدّها بـ«الجرد اليومي». وإذا وصلت بضاعة: سجّل فاتورة الشراء حتى يصير رصيدها صح. وإذا خلصت فعلاً: اطلبها.") },
    ] },
    { id: "companies", icon: Building2, title: t("audit.sCompanies", "الشركات"), money: false, checks: [
      { key: "no_company", title: t("audit.noCompany", "بلا شركة"), grouped: false, showValue: false,
        rows: rowsOf("no_company", (r) => (r.why === "hint" && r.company_name ? t("audit.suggested", { c: r.company_name, defaultValue: "مقترحة: {{c}}" }) : null)),
        why: t("audit.noCompanyWhy", "تطلع تحت «بدون شركة» باقتراح الطلبية وبقائمة الإرجاع للمندوب — فما تنحسب على شركتها."),
        fix: t("audit.noCompanyFix", "افتح المادة واختر شركتها. «مقترحة» يعني مواد ثانية بنفس أول ٧ أرقام من باركود المصنع كلها بهالشركة — تأكد قبل لا تختار.") },
      { key: "prefix_split", title: t("audit.prefixSplit", "بادئة مصنع على أكثر من شركة"), grouped: true, showValue: false,
        groupLabel: (g) => t("audit.prefix", { p: g, defaultValue: "بادئة {{p}}" }),
        rows: rowsOf("prefix_split", (r) => r.company_name ?? null),
        why: t("audit.prefixSplitWhy", "أول ٧ أرقام من الباركود (رقم المصنع) نفسها، والمواد موزّعة على شركات مختلفة — الغالب وحدة منهم شركتها غلط."),
        fix: t("audit.prefixSplitFix", "افتح المادة اللي شركتها تختلف عن أخواتها وصحّحها. وإذا نفس المصنع يجيك فعلاً من موزّعين، خليها.") },
    ] },
  ];
  /* ترتيبٌ واحد للشاشة والورقة (كان بالشاشة وحدها، فطُبعت الصفوفُ بترتيب المعرّف): ما له قيمةٌ
   * الأثقلُ أوّلاً، وغيرُه بالاسم، والمجموعاتُ بمفتاحها ثم الاسم. */
  for (const s of model) for (const c of s.checks) {
    c.rows.sort((a, b) => (c.grouped ? cmp(a.grp ?? "", b.grp ?? "") : c.showValue ? b.value - a.value : 0) || a.name.localeCompare(b.name));
  }
  return model;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** الفحصُ للمدير والطبيب كالدالّة، وبإذن المخزن كالمخزن نفسِه. */
function useAuditAllowed(): boolean {
  const { role, can } = usePermissions();
  return (role === "manager" || role === "veterinarian") && can("manageInventory");
}

/* ── الشاشة ───────────────────────────────────────────────────────────────── */

/** `embedded`: داخل «الجرد اليومي» — بلا رأس صفحةٍ ولا رجوع، والباقي حرفاً كما هو. */
/** `newTabLinks`: بالجرد عدٌّ مكتوبٌ لم يُرسل — روابطُ الفحص الخارجة تنفتح بتبويبٍ جديد، فلا تُغلق
 *  صفحةُ الجرد ويضيع ما كُتب (حالةُ الصفحة وحدها تحمله). و«الجرد اليومي» من هنا يقلب التبويبَ نفسه. */
export function InventoryAuditView({ embedded = false, newTabLinks = false }: { embedded?: boolean; newTabLinks?: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { restricted, stockLocked } = useOverride();
  const allowed = useAuditAllowed();
  const [win, setWin] = useState<Win>(readWin);
  const [data, setData] = useState<Data | "loading" | { error: string }>("loading");
  const [q, setQ] = useState("");
  /* تطبيقُ الشاشة الرئيسية بآيفون يفتح التبويبَ الجديد بعرض سفاري **بلا جلسته** (تخزينٌ منفصل) — فالرابطُ
   * يصل شاشةَ الدخول. هناك تُطفأ روابطُ الفتح ما دام عدٌّ معلَّقاً، ويُقال «سجّله أول». */
  const iosApp = typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const links: "same" | "new" | "off" = !newTabLinks ? "same" : iosApp ? "off" : "new";

  /* آخرُ طلبٍ وحده يكتب: ٣٠ ثم ١٨٠ بسرعة، والأبطأُ الأقدمُ كان يكتب فوق الأحدث تحت زرّه. */
  const seq = useRef(0);
  useEffect(() => () => { seq.current++; }, []);
  const load = useCallback(async (days: Win) => {
    const my = ++seq.current;
    setData("loading");
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY);
    try {
      const [audit, health] = await Promise.all([repo.inventoryAudit(from.toISOString(), to.toISOString()), repo.barcodeHealth()]);
      if (my !== seq.current) return;
      setData({ audit, health });
    } catch (e) {
      if (my !== seq.current) return;
      playWarning();
      setData({ error: describeDbError(e, t) });
    }
  }, [t]);
  useEffect(() => { if (allowed) void load(win); }, [allowed, load, win]);

  const pickWin = (w: Win) => {
    playTap(); setWin(w);
    try { localStorage.setItem(KEY, String(w)); } catch { /* swallow-ok: تفضيلُ عرض */ }
  };

  const ready = typeof data === "object" && "audit" in data ? data : null;
  const match = useMemo(() => {
    const s = searchable(q.trim());
    const c = matchCode(q);
    if (!s && !c) return () => true;
    return (name: string, code: string | null | undefined) => (!!s && searchable(name).includes(s)) || (!!c && matchCode(code).includes(c));
  }, [q]);
  const model = useMemo(() => (ready ? buildModel(t, ready, match) : null), [t, ready, match]);

  if (!allowed) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("audit.noAccess", "فحص المخزن للمدير والطبيب. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  /* الورقةُ كاملةٌ لا ما يُرى بالبحث: «اطبع الفحص» يطبع الفحص. */
  const print = () => {
    if (!ready) return;
    playTap();
    const w = openPrintWindow();
    if (!w) { playWarning(); toast.error(t("audit.printBlocked", "المتصفّح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وأعد المحاولة.")); return; }
    writePrintWindow(w, auditPrintHTML(t, i18n.language, buildModel(t, ready, () => true), win, restricted));
  };

  const sections = model ?? [];
  const cards = sections.map((s) => ({
    id: s.id, icon: s.icon, label: s.title,
    n: s.checks.reduce((n, c) => n + countOf(c), 0),
    value: s.money ? valueOf(s.checks.flatMap((c) => c.rows)) : undefined,
  }));
  const open = (id: string) => { playTap(); document.getElementById(`audit-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const total = cards.reduce((s, x) => s + x.n, 0);

  return (
    <div className={embedded ? "" : "mx-auto max-w-5xl px-4 py-6"} data-audit-view={embedded ? "embedded" : "page"}>
      {!embedded && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ClipboardCheck size={24} /></span>
          <div className="me-auto min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-ink">{t("audit.title", "فحص المخزن")}</h1>
            <p className="text-sm text-ink-subtle">{t("audit.sub", "وين الخلل بمخزنك — قراءة فقط، ما نغيّر شي، والتصليح بيدك مادة مادة.")}</p>
          </div>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3" data-audit-window>
        <span className="text-xs font-bold text-ink-muted">{t("audit.windowLabel", "معدّل البيع من آخر:")}</span>
        {WINDOWS.map((w) => (
          <button key={w} type="button" aria-pressed={win === w} data-audit-days={w} onClick={() => pickWin(w)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              win === w ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {t("audit.days", { n: formatNum(w), defaultValue: "{{n}} يوم" })}
          </button>
        ))}
        <span className="text-2xs text-ink-subtle">{t("audit.windowHint", "الراكد والكميات المستحيلة تنحسب بهذا المعدّل.")}</span>
        <Button size="sm" variant="secondary" className="ms-auto" leftIcon={<Printer size={14} />} disabled={!ready} onClick={print} data-audit-print>
          {t("audit.print", "اطبع الفحص")}
        </Button>
      </div>

      {data === "loading" ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : "error" in data ? (
        <div className="card space-y-3 p-8 text-center" data-audit-failed>
          <p className="text-sm font-bold text-danger-700 dark:text-danger-300">{data.error}</p>
          <p className="text-xs text-ink-subtle">{t("audit.failed", "ما وصلت النتيجة — وما نعرض «سليم» عن فشل. الفحص قراءة فقط، فما تغيّر شي.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void load(win); }}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-audit-cards>
            {cards.map((s) => (
              <button key={s.id} type="button" data-audit-card={s.id} onClick={() => open(s.id)}
                className={cn("card flex flex-col items-start gap-1 p-3 text-start transition hover:border-line-strong", s.n === 0 && "opacity-70")}>
                <span className={cn("flex items-center gap-1.5 text-2xs font-bold", s.n ? "text-warn-700 dark:text-warn-300" : "text-success-700 dark:text-success-300")}>
                  <s.icon size={14} /> {s.label}
                </span>
                <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{formatNum(s.n)}</span>
                {s.value !== undefined && s.value > 0 && !restricted && <span className="text-2xs font-semibold tabular-nums text-ink-subtle">{money(s.value)}</span>}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="card flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} data-audit-search
                onChange={(e) => setQ(e.target.value)} placeholder={t("audit.searchPh", "ابحث بالاسم أو الباركود")} />
            </label>
          </div>
          <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-ink-muted" data-audit-nobulk>
            {t("audit.noBulk", "ما نصلّح بالجملة ولا ندمج وحدنا: بياناتك تبقى مثل ما دخّلتها. كل ملاحظة تحتها طريق تصليحها بالتطبيق — وأنت تقرر.")}
            {stockLocked && <span className="mt-1 block font-bold text-warn-700 dark:text-warn-300">{t("audit.locked", "الجهاز مقفول على وضع المدير — فتح المواد للتعديل يحتاج رمز المدير.")}</span>}
            {links === "new" && <span className="mt-1 block font-bold text-brand-700 dark:text-brand-300" data-audit-keepcounts>{t("audit.keepCounts", "عندك عدّ ما انسجل بعد — روابط الفحص تنفتح بتبويب جديد حتى ما يضيع.")}</span>}
            {links === "off" && <span className="mt-1 block font-bold text-warn-700 dark:text-warn-300" data-audit-savefirst>{t("audit.saveFirst", "عندك عدّ ما انسجل بعد — سجّله أول، وبعدين تفتح المواد من هنا.")}</span>}
          </p>

          {total === 0 && q.trim() === "" && (
            <p className="card mb-4 p-6 text-center text-sm font-bold text-success-700 dark:text-success-300" data-audit-clean>
              {t("audit.clean", "ماكو ملاحظات — مخزنك مرتّب بكل الفحوص ✓")}
            </p>
          )}

          {sections.map((s) => (
            <section key={s.id} id={`audit-${s.id}`} className="mb-5 scroll-mt-4" data-audit-section={s.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink"><s.icon size={16} className="text-brand-600" /> {s.title}</h2>
              <div className="space-y-2">
                {s.checks.map((c) => (
                  /* أنواعُ 0168 لا تُعرض فارغة (كبطاقتها)، وأنواعُ 0245 تقول «ماكو ✓». */
                  c.key.startsWith("bc_") && c.rows.length === 0 ? null
                    : <CheckBlock key={c.key} c={c} canOpen={!stockLocked && links !== "off"} restricted={restricted} newTab={links === "new"} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function OpenLink({ id, show, newTab }: { id: string; show: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Link to={`/inventory?edit=${encodeURIComponent(id)}`} onClick={() => playTap()} data-audit-open
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      aria-label={t("audit.open", "افتح المادة")} title={t("audit.open", "افتح المادة")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600">
      <Pencil size={14} />
    </Link>
  );
}

function Row({ r, canOpen, restricted, showValue, newTab }: { r: VRow; canOpen: boolean; restricted: boolean; showValue: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5" data-audit-row>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-xs font-bold text-ink">{r.name}</p>
        <p className="truncate text-2xs text-ink-subtle">
          {r.code ? <span className="font-mono" dir="ltr">{r.code}</span> : t("audit.noCodeShort", "بلا باركود")}
          {r.stock !== null && <>{" · "}{t("audit.stock", { n: formatQty(r.stock), defaultValue: "الرصيد {{n}}" })}</>}
          {showValue && !restricted && r.value > 0 && <> · {money(r.value)}</>}
          {r.detail && <> · {r.detail}</>}
        </p>
      </div>
      {r.chip && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-muted">{r.chip}</span>}
      <OpenLink id={r.id} show={canOpen} newTab={newTab} />
    </li>
  );
}

function CheckBlock({ c, canOpen, restricted, newTab }: { c: CheckM; canOpen: boolean; restricted: boolean; newTab: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const n = countOf(c);
  const sorted = c.rows;
  const groups = useMemo(() => (c.grouped ? groupsOf(sorted) : []), [c.grouped, sorted]);
  if (n === 0) {
    return (
      <div className="card flex items-center gap-2 px-3 py-2.5 text-xs" data-audit-check={c.key} data-audit-n="0">
        <span className="min-w-0 flex-1 font-bold text-ink-muted">{c.title}</span>
        <span className="font-bold text-success-700 dark:text-success-300">{t("audit.none", "ماكو ✓")}</span>
      </div>
    );
  }
  const total = c.grouped ? groups.length : sorted.length;
  return (
    <div className="card overflow-hidden" data-audit-check={c.key} data-audit-n={n}>
      <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start transition hover:bg-surface-2/60">
        <AlertTriangle size={15} className="shrink-0 text-warn-600 dark:text-warn-300" />
        <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">{c.title}</span>
        <span className="rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">{formatNum(n)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <p className="text-xs leading-relaxed text-ink-muted">{c.why}</p>
          <p className="rounded-lg bg-brand-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-brand-800 dark:bg-brand-500/10 dark:text-brand-200" data-audit-fix>
            <span className="font-extrabold">{t("audit.fixLabel", "التصليح:")}</span> {c.fix}
          </p>
          {c.action && !(c.action.hideWhenLocked && !canOpen) && (
            <div className="flex flex-wrap gap-2">
              {/* «الجرد اليومي» نفسُ الصفحة (يقلب التبويب) فلا تبويبَ جديد له. */}
              <Link to={c.action.to} onClick={() => playTap()} className="btn-secondary gap-1.5 px-3.5 py-1.5 text-xs"
                {...(newTab && !c.action.to.startsWith("/inventory/count") ? { target: "_blank", rel: "noopener" } : {})}>
                <c.action.icon size={14} /> {c.action.label}
              </Link>
            </div>
          )}
          {c.grouped ? (
            <div className="space-y-2">
              {groups.slice(0, limit).map(([g, list]) => (
                <div key={g} className="rounded-xl border border-line px-2.5 py-1" data-audit-group>
                  {c.groupLabel && <p className="pt-1 font-mono text-2xs font-bold text-ink-subtle" dir="ltr">{c.groupLabel(g)}</p>}
                  <ul className="divide-y divide-line/60">
                    {list.map((r) => <Row key={r.id} r={r} canOpen={canOpen} restricted={restricted} showValue={c.showValue} newTab={newTab} />)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line/60">
              {sorted.slice(0, limit).map((r, i) => <Row key={`${r.id}-${i}`} r={r} canOpen={canOpen} restricted={restricted} showValue={c.showValue} newTab={newTab} />)}
            </ul>
          )}
          {total > limit && (
            <Button size="sm" variant="ghost" onClick={() => { playTap(); setLimit((x) => x + PAGE * 4); }}>
              {t("audit.more", { n: formatNum(total - limit), defaultValue: "اعرض الباقي ({{n}})" })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── الورقة المطبوعة ─────────────────────────────────────────────────────── */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** فحصُ المخزن ورقةً بـA4: الملخّص ثم كلُّ فحصٍ بسببه وتصليحه وصفوفه **كلّها** — من النموذج نفسه. */
function auditPrintHTML(t: TFunction, lang: string, model: SectionM[], days: number, restricted: boolean): string {
  const rtl = lang.startsWith("ar");
  const clinic = getClinicName() || "doctorVet";
  const stamp = new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: "full", timeStyle: "short" }).format(new Date());
  const head = (showValue: boolean) => `<tr><th class="c">#</th><th>${esc(t("audit.colItem", "المادة"))}</th><th>${esc(t("audit.colCode", "الباركود"))}</th>`
    + `<th class="c">${esc(t("audit.colStock", "الرصيد"))}</th>${showValue && !restricted ? `<th class="c">${esc(t("audit.colValue", "القيمة"))}</th>` : ""}`
    + `<th>${esc(t("audit.colNote", "ملاحظة"))}</th></tr>`;
  const row = (r: VRow, i: number, showValue: boolean) => `<tr><td class="c">${i + 1}</td><td class="name">${esc(r.name)}</td>`
    + `<td class="mono">${esc(r.code ?? "—")}</td><td class="c">${r.stock === null ? "—" : esc(formatQty(r.stock))}</td>`
    + `${showValue && !restricted ? `<td class="c">${r.value > 0 ? esc(money(r.value)) : ""}</td>` : ""}`
    + `<td class="note">${esc([r.chip, r.detail].filter(Boolean).join(" · "))}</td></tr>`;
  const checkHTML = (c: CheckM): string => {
    const n = countOf(c);
    if (n === 0) {
      return c.key.startsWith("bc_") ? "" : `<div class="ok"><b>${esc(c.title)}</b><span>${esc(t("audit.none", "ماكو ✓"))}</span></div>`;
    }
    const body = c.grouped
      ? groupsOf(c.rows).map(([g, list]) => `<tr class="grp"><td colspan="6">${esc(c.groupLabel ? c.groupLabel(g) : "")}</td></tr>${list.map((r, i) => row(r, i, c.showValue)).join("")}`).join("")
      : c.rows.map((r, i) => row(r, i, c.showValue)).join("");
    return `<div class="check"><h3>${esc(c.title)} <span class="n">${esc(formatNum(n))}</span></h3>`
      + `<p class="why">${esc(c.why)}</p><p class="fix"><b>${esc(t("audit.fixLabel", "التصليح:"))}</b> ${esc(c.fix)}</p>`
      + `<table><thead>${head(c.showValue)}</thead><tbody>${body}</tbody></table></div>`;
  };
  const summary = model.map((s) => `<div class="kpi"><b>${esc(formatNum(s.checks.reduce((n, c) => n + countOf(c), 0)))}</b><span>${esc(s.title)}</span></div>`).join("");
  const sections = model.map((s) => `<section><h2>${esc(s.title)}</h2>${s.checks.map(checkHTML).join("")}</section>`).join("");
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(t("audit.title", "فحص المخزن"))} — ${esc(clinic)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #0f172a; background: #fff; font-size: 11px; padding: 8px; }
  @media print { body { padding: 0; } }
  .head { display: flex; align-items: flex-end; gap: 10px; border-bottom: 2.5px solid #0f172a; padding-bottom: 8px; }
  .head .c1 { font-size: 17px; font-weight: 800; }
  .head .c2 { font-size: 11px; color: #475569; }
  .head .when { margin-inline-start: auto; text-align: end; font-size: 10px; color: #475569; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 10px 0; }
  .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 8px; }
  .kpi b { display: block; font-size: 15px; }
  .kpi span { font-size: 9.5px; color: #64748b; }
  .nobulk { font-size: 10px; color: #475569; background: #f1f5f9; border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; }
  section { margin-top: 12px; }
  h2 { font-size: 13px; background: #0f172a; color: #fff; border-radius: 8px; padding: 5px 10px; margin-bottom: 6px; break-after: avoid; }
  .check { margin: 8px 0 12px; }
  h3 { font-size: 12px; margin-bottom: 3px; break-after: avoid; }
  h3 .n { display: inline-block; background: #fef3c7; color: #92400e; border-radius: 99px; padding: 0 8px; font-size: 11px; }
  .why { color: #334155; margin-bottom: 3px; }
  .fix { color: #1e3a8a; background: #eff6ff; border-radius: 6px; padding: 4px 8px; margin-bottom: 5px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 9.5px; color: #334155; text-align: start; }
  td { border: 1px solid #cbd5e1; padding: 3px 6px; vertical-align: middle; }
  th.c, td.c { text-align: center; }
  td.name { font-weight: 600; }
  td.mono { font-family: ui-monospace, Consolas, monospace; direction: ltr; text-align: center; font-size: 9.5px; }
  td.note { color: #b45309; font-size: 9.5px; }
  tr.grp td { background: #f8fafc; font-family: ui-monospace, Consolas, monospace; font-weight: 700; font-size: 9.5px; }
  .ok { display: flex; justify-content: space-between; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 4px 8px; margin: 4px 0; color: #475569; }
  .ok span { color: #15803d; font-weight: 700; }
  .foot { margin-top: 12px; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; }
</style></head><body onload="setTimeout(function(){window.print()},200)">
  <div class="head"><div><div class="c1">${esc(clinic)}</div><div class="c2">${esc(t("audit.title", "فحص المخزن"))} — ${esc(t("audit.printWindow", { n: formatNum(days), defaultValue: "معدّل البيع من آخر {{n}} يوم" }))}</div></div>
    <div class="when">${esc(stamp)}</div></div>
  <div class="kpis">${summary}</div>
  <p class="nobulk">${esc(t("audit.noBulk", "ما نصلّح بالجملة ولا ندمج وحدنا: بياناتك تبقى مثل ما دخّلتها. كل ملاحظة تحتها طريق تصليحها بالتطبيق — وأنت تقرر."))}</p>
  ${sections}
  <div class="foot"><span>${esc(stamp)}</span><span>doctorVet</span></div>
</body></html>`;
}

/* ── أزرارُ تقرير الجرد بعلامات الفحص ─────────────────────────────────────── */

/**
 * «طباعة تقرير جرد» و«تصدير جرد إكسل» — بعلامة فحصٍ لكلّ سطرٍ وسطرِ ملخّصٍ بالأعلى.
 * تُحمَّل بـpage(…, ["audit"]) من المخزن والجرد. والقوائمُ تُمرَّر إن كانت بيد الشاشة وإلا
 * تُجلب عند الضغط. ومن لا يرى الفحصَ (دورُه أو إذنُه) يأخذ الورقةَ كما كانت حرفاً — بلا
 * سطرٍ يقول «ما وصل» عن فحصٍ ليس له.
 */
export function StockReportButtons({ products, companies, sections }: {
  products?: Product[]; companies?: Company[]; sections?: CompanySection[];
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const allowed = useAuditAllowed();
  const [busy, setBusy] = useState<"print" | "xlsx" | null>(null);

  const lists = async () => {
    const [p, c, s] = await withTimeout(Promise.all([
      products ?? repo.listProducts(), companies ?? repo.listCompanies(), sections ?? repo.listCompanySections(),
    ]), 15000);
    return { p, c, s };
  };
  /* فشلُ الفحص لا يمنع الورقة (الجردُ لا ينتظر)، لكنه يُقال بسطرها الأعلى — ورقةٌ بلا علاماتٍ
   * تُقرأ «نظيفة». */
  const marks = async (): Promise<AuditMarks | undefined> => {
    if (!allowed) return undefined;
    try {
      const to = new Date();
      const from = new Date(to.getTime() - MARKS_DAYS * DAY);
      /* بمهلة: فحصٌ معلَّقٌ على نتٍّ متوقّف كان يحبس الورقةَ على «جارٍ التحميل» — والورقةُ لا تنتظره
       * (المهلةُ فشلٌ يُقال بسطرها كأيّ فشل). */
      const [audit, health] = await withTimeout(Promise.all([repo.inventoryAudit(from.toISOString(), to.toISOString()), repo.barcodeHealth()]), 15000);
      return auditMarks(t, audit, health);
    } catch {
      return auditMarksFailed(t);
    }
  };

  const print = async () => {
    if (busy) return;
    playTap();
    /* النافذةُ بلحظة الضغطة: بعد انتظار الشبكة يحجبها المتصفّح. */
    const w = openPrintWindow();
    if (!w) { playWarning(); toast.error(t("audit.printBlocked", "المتصفّح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وأعد المحاولة.")); return; }
    writePrintWindow(w, `<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">${esc(t("common.loading", "جارٍ التحميل…"))}</p>`);
    setBusy("print");
    try {
      const [{ p, c, s }, m] = await Promise.all([lists(), marks()]);
      writePrintWindow(w, buildStockReportHTML(p, c, s, m));
    } catch (e) {
      w.close();
      playWarning();
      toast.error(t("audit.reportFailed", "ما كدرنا نجيب المخزون للتقرير — أعد المحاولة."), describeDbError(e, t));
    } finally { setBusy(null); }
  };

  const xlsx = async () => {
    if (busy) return;
    playTap();
    setBusy("xlsx");
    try {
      const [{ p, c, s }, m] = await Promise.all([lists(), marks()]);
      const name = await exportStocktakeXlsx(p, c, s, m);
      playSuccess();
      toast.success(t("pos.stockXlsxDone", { name, defaultValue: "نُزّل {{name}}" }));
    } catch (e) {
      playWarning();
      toast.error(t("pos.stockXlsxFail", "تعذّر تصدير ملف الجرد"), describeDbError(e, t));
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button variant="secondary" loading={busy === "print"} leftIcon={<Printer size={16} />} onClick={() => void print()} data-stockprint>
        {t("pos.stockReport", "طباعة تقرير جرد")}
      </Button>
      <Button data-xlsxbtn variant="secondary" loading={busy === "xlsx"} leftIcon={<FileSpreadsheet size={16} />} onClick={() => void xlsx()}>
        {t("pos.stockXlsx", "تصدير جرد إكسل")}
      </Button>
    </>
  );
}
