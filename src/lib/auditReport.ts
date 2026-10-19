/* ============================================================================
 * تقريرُ فحص المخزن — الملخّصُ (الشاشة والورقة) والورقةُ المطبوعة كاملةً.
 *
 * لماذا: جردُ «ابن الهيثم» اليدويّ (١٠/١٩) سُلّم تقريراً يُطبع: غلافٌ بأرقامٍ و«أهمّ ما لگيناه» بكلامٍ
 * عاديّ، و«ابدأ من هنا» بترتيب التصليح، وكلُّ قسمٍ بصفحته بسببه وطريقه، والمكرّرُ بطاقاتٍ متجاورة
 * بباركوداتها مرسومةً و«تبقى هذي»، وورقةُ فحصٍ بالرفّ بخاناتٍ تُملأ، واستبيانٌ للموظفين، واقتراحاتٌ
 * حتى ما يرجع الخلل. وورقةُ التطبيق كانت جدولاً واحداً — فقال المالك «ما طلع حلو مثل ذاك». فهذه
 * الوحدةُ تكتب ذاك التقريرَ من فحص القاعدة نفسِه (0245)، لكلّ عيادةٍ ساعةَ تطلبه.
 *
 * نموذجٌ واحد: الشاشةُ (InventoryAudit.tsx) تبني الأقسامَ وتمرّرها هنا — فالملخّصُ نفسُه يُرى ويُطبع.
 * ورفيقُ نطاق `audit` (hot-paths.json): يقرأ مفاتيحَه، ولا يستورده إلا مالكُه.
 * قراءةٌ فقط: لا يكتب شيئاً، ولا يقترح دمجاً تلقائياً — كلُّ ملاحظةٍ بطريقها بالتطبيق.
 * ==========================================================================*/
import type { TFunction } from "i18next";
import { dateLocale, formatNum, formatQty, money } from "./utils";
import { drawBarcode } from "./barcodeDraw";
import { COVER_MAX } from "./inventoryAudit";
import type { AuditKind, BarcodeAilment, BarcodeHealthRow, InventoryAuditRow } from "@/types";

export interface ReportRow { id: string; name: string; code: string | null; stock: number | null; value: number; grp: string | null; chip: string | null; detail: string | null }
export interface ReportCheck {
  key: string; title: string; why: string; fix: string; rows: ReportRow[];
  grouped: boolean; groupLabel?: (g: string) => string; showValue: boolean;
  /** زرُّ طريقٍ بالتطبيق؛ الأيقونةُ مفتاحٌ تحلّه الشاشة (الوحدةُ بلا مكوّنات). */
  action?: { to: string; label: string; icon: "scan" | "count"; hideWhenLocked?: boolean };
}
export interface ReportSection { id: string; title: string; checks: ReportCheck[]; money: boolean }
export type AuditData = { audit: InventoryAuditRow[]; health: BarcodeHealthRow[] };
/** إجماليّاتُ المخزن كلّه (لا ما فيه ملاحظة) — تُجلب عند الطباعة؛ وغيابُها يُسقط بطاقتيها لا الورقة. */
export interface AuditTotals { products: number; value: number }
export type Tone = "bad" | "warn" | "info" | "ok";
export interface AuditStep { key: string; tone: Tone; title: string; desc: string; anchor: string }
export interface AuditSummary { findings: string[]; steps: AuditStep[] }

/** مجموعاتٌ بمفتاحها (`grp`) بترتيب أوّل ظهور. */
export function groupsOf(rows: ReportRow[]): [string, ReportRow[]][] {
  const m = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = r.grp ?? r.id;
    const a = m.get(k);
    if (a) a.push(r); else m.set(k, [r]);
  }
  return [...m.entries()];
}
/** المجموعةُ عددٌ واحد (مكرّرٌ = زوجٌ لا صفّان). */
export const countOf = (c: ReportCheck): number => (c.grouped ? groupsOf(c.rows).length : c.rows.length);
export const valueOf = (rows: ReportRow[]): number => rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

const find = (sections: ReportSection[], key: string): ReportCheck | undefined => {
  for (const s of sections) for (const c of s.checks) if (c.key === key) return c;
  return undefined;
};

/** شدّةُ كلّ قسم: المستحيلُ والمكرّرُ خطأٌ يُصلَّح، والرمزُ خللٌ، والباقي يُفحص. */
export const SECTION_TONE: Record<string, Tone> = { impossible: "bad", dups: "bad", codes: "warn", idle: "warn", zero: "info", companies: "info" };

/* ── النموذج ─────────────────────────────────────────────────────────────── */

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

/** النموذجُ الواحد: الأقسامُ وفحوصُها بنصوصها وصفوفها — للشاشة وللورقة وللفحص بالحزمة. بلا أيقونات (الشاشةُ تضيفها بالمعرّف). */
export function buildAuditModel(t: TFunction, data: AuditData, keep: (name: string, code: string | null | undefined) => boolean): ReportSection[] {
  const by = new Map<AuditKind, InventoryAuditRow[]>();
  for (const r of data.audit) {
    if (!keep(r.product_name, r.code)) continue;
    const a = by.get(r.kind);
    if (a) a.push(r); else by.set(r.kind, [r]);
  }
  const rowsOf = (k: AuditKind, chip?: (r: InventoryAuditRow) => string | null, detail?: (r: InventoryAuditRow) => string | null): ReportRow[] =>
    (by.get(k) ?? []).map((r) => ({
      id: r.product_id, name: r.product_name, code: r.code, stock: Number(r.stock), value: Number(r.value) || 0, grp: r.grp,
      chip: chip?.(r) ?? null, detail: detail?.(r) ?? null,
    }));
  const idleFix = t("audit.idleFix", "رجّعها للشركة، أو نزّل سعرها، أو اطلب أقل المرة الجاية. وإذا الرصيد نفسه غلط صحّحه من «الجرد اليومي».");
  const toCount = { to: "/inventory/count?tab=today", label: t("audit.toCount", "الجرد اليومي"), icon: "count" as const };

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
  const healthChecks: ReportCheck[] = (["twin", "alt_owned", "empty", "arabic", "excel"] as BarcodeAilment[]).map((k) => ({
    key: `bc_${k}`, title: healthTitle[k], fix: healthFix[k], why: t("audit.healthWhy", "من فحص صحة الباركودات بمولد الباركود."),
    grouped: false, showValue: false,
    rows: data.health.filter((r) => r.kind === k && keep(r.product_name, r.code))
      .map((r) => ({ id: r.product_id, name: r.product_name, code: r.code, stock: null, value: 0, grp: null, chip: null, detail: null })),
  }));

  const model: ReportSection[] = [
    { id: "codes", title: t("audit.sCodes", "الباركود"), money: false, checks: [
      { key: "no_code", title: t("audit.noCode", "بلا باركود"), grouped: false, showValue: false, rows: rowsOf("no_code"),
        why: t("audit.noCodeWhy", "ما تنمسح — تنباع بالبحث بالاسم بس، وأول ما تجي علبتها تنضاف مرة ثانية كمادة جديدة."),
        fix: t("audit.noCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود. وإذا العلبة ما عليها باركود (فرط، ألعاب) ولّد واحد من «مولد الباركود» واطبعه."),
        action: { to: "/inventory?view=barcodes", label: t("audit.toGenerator", "مولد الباركود"), icon: "scan" as const, hideWhenLocked: true } },
      { key: "hand_code", title: t("audit.handCode", "رمز مكتوب باليد"), grouped: false, showValue: false,
        rows: rowsOf("hand_code", (r) => handWhy(t, r.why)),
        why: t("audit.handCodeWhy", "رقم رف أو رمز مكتوب بالإيد مو باركود المصنع — يوم تنمسح العلبة يگول «ما ينعرف» والمادة موجودة، وهذا أول مصدر للتوائم."),
        fix: t("audit.handCodeFix", "افتح المادة وامسح باركود العلبة بخانة الباركود — الرمز القديم يبقى رمز إضافي فما يضيع رقم الرف.") },
      ...healthChecks,
    ] },
    { id: "dups", title: t("audit.sDups", "مكرّر محتمل"), money: false, checks: [
      { key: "dup_twin", title: t("audit.dupTwin", "رقم رف وباركود مصنع بنفس الاسم"), grouped: true, showValue: false,
        rows: rowsOf("dup_twin", (r) => (r.why === "shelf" ? t("audit.roleShelf", "رف") : r.why === "factory" ? t("audit.roleFactory", "مصنع") : null)),
        why: t("audit.dupTwinWhy", "نفس الاسم: وحدة بلا باركود أو برقم رف، ووحدة بباركود المصنع — الغالب نفس المادة دخلت مرتين، ورصيدها مقسوم على صفّين."),
        fix: t("audit.dupTwinFix", "افحص العلبة. إذا نفسها: افتح صف «الرف» ← «دمج بمنتج ثاني» ← اختر صف المصنع؛ الرصيد ينجمع ورقم الرف يصير رمز إضافي. وإذا مو نفسها: ميّز الاسم.") },
      { key: "dup_name", title: t("audit.dupName", "نفس الاسم برموز مختلفة"), grouped: true, showValue: false, rows: rowsOf("dup_name"),
        why: t("audit.dupNameWhy", "ممكن نكهات أو أحجام مختلفة بنفس الاسم — وممكن نفس المادة مرتين. بشاشة البيع يبينون نفس الشي."),
        fix: t("audit.dupNameFix", "افحص العلبة: إذا نفسها افتح وحدة منهم ← «دمج بمنتج ثاني». وإذا مختلفة، زيد بالاسم شنو يفرّقها (النكهة، الحجم).") },
    ] },
    { id: "impossible", title: t("audit.sImpossible", "كميات مستحيلة"), money: true, checks: [
      { key: "impossible", title: t("audit.impossible", "رصيد ما ينباع بسنة"), grouped: false, showValue: true, action: toCount,
        rows: rowsOf("impossible", undefined, (r) => impossibleDetail(t, r)),
        why: t("audit.impossibleWhy", "رصيد يحتاج أكثر من سنة حتى ينباع بمعدّل بيعك، وقيمته كبيرة على مخزنك — أو عدد وحدات انكتب علب. هذا يضخّم قيمة المخزن كلها."),
        fix: t("audit.impossibleFix", "عدّ المادة بالرف من «الجرد اليومي» واكتب العدد الصحيح، وسبب الفرق «خطأ إدخال» — مو «عجز»، العجز يسجّل سحب فلوس.") },
    ] },
    { id: "idle", title: t("audit.sIdle", "راكد"), money: true, checks: [
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
    { id: "zero", title: t("audit.sZero", "رصيده صفر وينباع"), money: false, checks: [
      { key: "zero_sold", title: t("audit.zeroSold", "رصيدها صفر وانباعت بآخر ٣٠ يوم"), grouped: false, showValue: false, action: toCount,
        rows: rowsOf("zero_sold", undefined, (r) => t("audit.soldRecent", { n: formatQty(r.qty ?? 0), d: formatNum(r.days ?? 0), defaultValue: "انباع {{n}} — آخر بيع قبل {{d}} يوم" })),
        why: t("audit.zeroSoldWhy", "خلصت وهي تنطلب — أو موجودة بالرف ورصيدها بالنظام غلط، فتبين «خالصة» بشاشة البيع."),
        fix: t("audit.zeroSoldFix", "إذا موجودة بالرف: عدّها بـ«الجرد اليومي». وإذا وصلت بضاعة: سجّل فاتورة الشراء حتى يصير رصيدها صح. وإذا خلصت فعلاً: اطلبها.") },
    ] },
    { id: "companies", title: t("audit.sCompanies", "الشركات"), money: false, checks: [
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

/* ── الملخّص ─────────────────────────────────────────────────────────────── */

/** «أهمّ ما لگيناه» و«ابدأ من هنا» — بالأرقام نفسِها التي تحتها، ولا شيءَ عن فحصٍ صفر. */
export function summarize(t: TFunction, sections: ReportSection[], totals: AuditTotals | null, restricted: boolean): AuditSummary {
  const n = (k: string): number => { const c = find(sections, k); return c ? countOf(c) : 0; };
  const v = (k: string): number => { const c = find(sections, k); return c ? valueOf(c.rows) : 0; };
  const m = (x: number): string => (restricted ? "" : t("audit.rp.valueParen", { v: money(x), defaultValue: " ({{v}})" }));
  const findings: string[] = [];

  const imp = find(sections, "impossible");
  if (imp && imp.rows.length) {
    const names = imp.rows.slice(0, 2).map((r) => t("audit.rp.nameStock", { name: r.name, n: formatQty(r.stock ?? 0), defaultValue: "«{{name}}» رصيده {{n}}" }))
      .join(t("audit.rp.and", " و"));
    const share = !restricted && totals && totals.value > 0
      ? t("audit.rp.fImpossibleShare", { p: formatNum(Math.round((v("impossible") / totals.value) * 100)), defaultValue: "، يعني {{p}}٪ من قيمة المخزن" }) : "";
    // جملةُ القيمة كلُّها متغيّر: بلا مال (restricted) تسقط هي، لا الرقمُ وحده فيبقى «قيمتها . ابدأوا»
    const val = restricted ? "" : t("audit.rp.fImpossibleVal", { v: money(v("impossible")), share, defaultValue: " قيمتها {{v}}{{share}}." });
    findings.push(t("audit.rp.fImpossible", { names, val, n: formatNum(imp.rows.length), defaultValue: "أرقام مخزون غلط تضخّم رأس المال ({{n}}): {{names}}.{{val}} ابدأوا بتصحيحها." }));
  }
  if (n("dup_twin")) findings.push(t("audit.rp.fTwin", { n: formatNum(n("dup_twin")), defaultValue: "{{n}} مادة الغالب مكرّرة: صف برقم رف أو بلا باركود، وأخوه بنفس الاسم بباركود المصنع. البيع يتوزّع على الصفّين، فواحد يبيّن ناقص والثاني «خامل» وهو ينباع." }));
  if (n("dup_name")) findings.push(t("audit.rp.fName", { n: formatNum(n("dup_name")), defaultValue: "{{n}} مجموعة بنفس الاسم برموز مختلفة: نكهات أو أحجام اسمها ما يوضّح الفرق، أو نفس المادة مرتين. الكاشير يختار الغلط." }));
  // القائمةُ من أجزائها غير الصفرية — «0 مادة بلا باركود و5…» تقرأ كأنها ملاحظة
  const list = (parts: (string | false)[], sep: string): string => parts.filter((p): p is string => !!p).join(sep);
  const codes = list([n("no_code") > 0 && t("audit.rp.fCodeNo", { n: formatNum(n("no_code")), defaultValue: "{{n}} مادة بلا باركود" }),
    n("hand_code") > 0 && t("audit.rp.fCodeHand", { n: formatNum(n("hand_code")), defaultValue: "{{n}} مادة برمز مكتوب باليد بدل باركود العلبة" })], t("audit.rp.and", " و"));
  if (codes) findings.push(t("audit.rp.fCodes", { list: codes, defaultValue: "{{list}}. مسح العلبة يگول «مو موجود بمخزنك» والمادة موجودة، فتنضاف مرة ثانية. هذا أصل أغلب التكرار." }));
  // كلُّ فحصٍ له جملة — فحصٌ بلا جملة كان يترك الغلافَ يقول «مرتّب» والصفحاتُ بعده تعدّ مشاكله
  const health = sections.flatMap((s) => s.checks).filter((c) => c.key.startsWith("bc_")).reduce((a, c) => a + countOf(c), 0);
  if (health) findings.push(t("audit.rp.fHealth", { n: formatNum(health), defaultValue: "{{n}} باركود فيه خلل (رمز على أكثر من منتج، رمز إضافي صاحبه غيره، أحرف عربية، أو شوّهه إكسل): المسحة تبيع مادة غلط أو ما تلگى شي." }));
  const idleN = n("never_sold") + n("stopped") + n("slow");
  const idle = list([n("never_sold") > 0 && t("audit.rp.fIdleNever", { n: formatNum(n("never_sold")), v: m(v("never_sold")), defaultValue: "{{n}} ما انباعت أبداً{{v}}" }),
    n("stopped") > 0 && t("audit.rp.fIdleStopped", { n: formatNum(n("stopped")), v: m(v("stopped")), defaultValue: "{{n}} وقف بيعها{{v}}" }),
    n("slow") > 0 && t("audit.rp.fIdleSlow", { n: formatNum(n("slow")), v: m(v("slow")), defaultValue: "{{n}} بطيئة{{v}}" })], t("audit.rp.commaAnd", "، و"));
  if (idleN) findings.push(t("audit.rp.fIdle", { list: idle, defaultValue: "بضاعة واقفة: {{list}}." }));
  if (n("zero_sold")) findings.push(t("audit.rp.fZero", { n: formatNum(n("zero_sold")), defaultValue: "{{n}} مادة رصيدها صفر وتنباع: موجودة بالرف ورصيدها غلط، أو تنباع باسم ثاني، أو تحتاج طلب." }));
  if (n("no_company")) {
    const p = totals && totals.products > 0 ? t("audit.rp.pctParen", { p: formatNum(Math.round((n("no_company") / totals.products) * 100)), defaultValue: " ({{p}}٪)" }) : "";
    findings.push(t("audit.rp.fCompany", { n: formatNum(n("no_company")), p, defaultValue: "{{n}} مادة بلا شركة{{p}}: ما يطلع كشف شركتها ولا طلبيتها صح." }));
  }
  if (n("prefix_split")) findings.push(t("audit.rp.fPrefix", { n: formatNum(n("prefix_split")), defaultValue: "{{n}} بادئة مصنع موزّعة على أكثر من شركة: الغالب مادة منهم شركتها غلط، فكشف الشركة وطلبيتها ناقصة." }));

  const steps: AuditStep[] = [];
  const add = (key: string, count: number, tone: Tone, anchor: string, title: string, desc: string) => { if (count > 0) steps.push({ key, tone, anchor, title, desc }); };
  add("impossible", n("impossible"), "bad", "impossible", t("audit.rp.s1", "صحّحوا الكميات المستحيلة"),
    t("audit.rp.s1d", { n: formatNum(n("impossible")), defaultValue: "{{n}} مادة: عدّوها وسجّلوا العدد بـ«الجرد اليومي» بسبب «خطأ إدخال» — مو «عجز»، العجز يسجّل سحب فلوس." }));
  add("dup_twin", n("dup_twin"), "bad", "dups", t("audit.rp.s2", "ادمجوا التوائم بعد نظرة بالرف"),
    t("audit.rp.s2d", { n: formatNum(n("dup_twin")), defaultValue: "{{n}}: قارنوا العلبة بالصفّين، وإذا نفسها «دمج بمنتج ثاني». الدمج للمدير أو الطبيب." }));
  add("health", health, "bad", "codes", t("audit.rp.sHealth", "صلّحوا الباركودات اللي فيها خلل"),
    t("audit.rp.sHealthd", { n: formatNum(health), defaultValue: "{{n}}: كل وحدة تحتها طريق تصليحها بقسم «الباركود» — رمز على منتجين يعني المسحة تبيع واحد منهم بلا قاعدة." }));
  add("hand_code", n("hand_code"), "warn", "codes", t("audit.rp.s3", "اربطوا باركود العلبة بالرموز اليدوية"),
    t("audit.rp.s3d", { n: formatNum(n("hand_code")), defaultValue: "{{n}} مادة: ✎ ← امسحوا الرقم القديم من حقل الباركود (Ctrl+A) ← امسحوا العلبة ← حفظ. القديم يبقى رمز إضافي." }));
  add("no_code", n("no_code"), "warn", "codes", t("audit.rp.s4", "باركود للمواد اللي بلاه"),
    t("audit.rp.s4d", { n: formatNum(n("no_code")), defaultValue: "{{n}} مادة: امسحوا العلبة إذا عليها باركود، وإلا «مولد الباركود» ← «منتجات بلا باركود» ← اضغطوا اسمها." }));
  add("dup_name", n("dup_name"), "info", "dups", t("audit.rp.s5", "افحصوا الأسماء المتطابقة"),
    t("audit.rp.s5d", { n: formatNum(n("dup_name")), defaultValue: "{{n}} مجموعة: إذا نفس المادة ادمجوها، وإذا مختلفة زيدوا بالاسم شنو يفرّقها." }));
  add("zero_sold", n("zero_sold"), "info", "zero", t("audit.rp.s6", "افحصوا الرصيد الصفر اللي ينباع"),
    t("audit.rp.s6d", { n: formatNum(n("zero_sold")), defaultValue: "{{n}} مادة: إذا موجودة بالرف سجّلوها بالجرد اليومي، وإذا خلصت اطلبوها." }));
  add("no_company", n("no_company"), "info", "companies", t("audit.rp.s7", "صنّفوا المواد على شركاتها"),
    t("audit.rp.s7d", { n: formatNum(n("no_company")), defaultValue: "{{n}} مادة بلا شركة. «مقترحة» يعني أخواتها بنفس باركود المصنع كلها بهالشركة." }));
  add("prefix_split", n("prefix_split"), "info", "companies", t("audit.rp.sPrefix", "صحّحوا شركة المواد اللي تختلف عن أخواتها"),
    t("audit.rp.sPrefixd", { n: formatNum(n("prefix_split")), defaultValue: "{{n}} بادئة: افتحوا المادة اللي شركتها تختلف وصحّحوها، وإذا المصنع يجيكم من موزّعين فعلاً خلّوها." }));
  add("idle", idleN, "info", "idle", t("audit.rp.s8", "قرّروا على البضاعة الواقفة"),
    t("audit.rp.s8d", { n: formatNum(idleN), defaultValue: "{{n}} مادة: تأكّدوا إنها بالرف، وبعدين خصم، أو إرجاع للشركة، أو وقف الطلب." }));
  steps.push({ key: "count", tone: "ok", anchor: "", title: t("audit.rp.s9", "جرد فعلي بالورقة"),
    desc: t("audit.rp.s9d", "اطبعوا «طباعة تقرير جرد» (الباركود مرسوم ينمسح) وامشوا على الرفوف، وسجّلوا الفرق بـ«الجرد اليومي» مو بتعديل الرقم.") });
  return { findings, steps };
}

/* ── الورقة المطبوعة ─────────────────────────────────────────────────────── */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function bc(t: TFunction, code: string | null): string {
  if (!code) return `<div class="bcbox none">${esc(t("audit.noCodeShort", "بلا باركود"))}</div>`;
  const b = drawBarcode(code);
  if (!b) return `<div class="bcbox bad" dir="ltr">${esc(code)}</div>`;
  return `<div class="bcbox">${b.svg}<div class="bctext" dir="ltr">${esc(b.text)}</div></div>`;
}

/** العمودُ الفارغ لكلّ فحص — ما يكتبه الموظف بالرفّ. */
function blankCol(t: TFunction, key: string): string | null {
  switch (key) {
    case "no_code": return t("audit.rp.colFound", "الباركود اللي لگيته");
    case "hand_code": return t("audit.rp.colBoxCode", "باركود العلبة");
    case "impossible": return t("audit.rp.colActual", "العدد الفعلي");
    case "zero_sold": return t("audit.rp.colOnShelf", "لگينا بالرف");
    case "never_sold": case "stopped": case "slow": return t("audit.rp.colDecision", "القرار");
    default: return null;
  }
}
/** الأقسامُ بالورقة بترتيب «ابدأ من هنا» (الكمياتُ ثم التكرار ثم الباركود…) — والشاشةُ على ترتيبها. */
const PRINT_ORDER = ["impossible", "dups", "codes", "zero", "companies", "idle"];
/** الرسمُ حيث يُمسح بالرفّ؛ والنصُّ حيث يكفي (الراكدُ طويلٌ والرمزُ فيه للقراءة). */
const DRAW = new Set(["hand_code", "impossible", "zero_sold", "bc_twin", "bc_alt_owned", "bc_empty"]);

function tableCheck(t: TFunction, c: ReportCheck, restricted: boolean): string {
  const blank = blankCol(t, c.key);
  const draw = DRAW.has(c.key);
  const val = c.showValue && !restricted;
  // عمودُ رمزٍ كلُّه «—» (بلا باركود) ورقٌ ضائع — والخانةُ الفارغة بعده تقوم مقامه
  const code = c.rows.some((r) => r.code);
  const head = `<tr><th class="c">#</th><th>${esc(t("audit.colItem", "المادة"))}</th>${code ? `<th>${esc(t("audit.colCode", "الباركود"))}</th>` : ""}`
    + `<th class="c">${esc(t("audit.colStock", "الرصيد"))}</th>${val ? `<th class="c">${esc(t("audit.colValue", "القيمة"))}</th>` : ""}`
    + `<th>${esc(t("audit.colNote", "ملاحظة"))}</th>${blank ? `<th class="c fill">${esc(blank)}</th>` : ""}</tr>`;
  const row = (r: ReportRow, i: number, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td class="c n">${i + 1}</td><td class="name">${esc(r.name)}</td>`
    + (code ? `<td class="${draw ? "bcc" : "mono"}">${draw ? bc(t, r.code) : esc(r.code ?? "—")}</td>` : "")
    + `<td class="c">${r.stock === null ? "—" : esc(formatQty(r.stock))}</td>${val ? `<td class="c">${r.value > 0 ? esc(money(r.value)) : ""}</td>` : ""}`
    + `<td class="note">${esc([r.chip, r.detail].filter(Boolean).join(" · "))}</td>${blank ? `<td class="fillcell"></td>` : ""}</tr>`;
  let body: string;
  if (c.grouped || c.key === "no_company") {
    const groups = c.key === "no_company"
      ? groupsOf(c.rows.map((r) => ({ ...r, grp: r.chip ?? "" }))).sort((a, b) => Number(a[0] === "") - Number(b[0] === "") || b[1].length - a[1].length)
      : groupsOf(c.rows);
    let k = 0;
    body = groups.map(([g, list], gi) => {
      const label = c.key === "no_company" ? (g || t("audit.rp.noHint", "بلا اقتراح — شركتها من فاتورتها")) : c.groupLabel ? c.groupLabel(g) : "";
      // مجموعةٌ بلا عنوان (نفس الاسم) تُرى بحدٍّ فوقها وتظليلٍ متناوب — وإلا صارت قائمةً واحدة
      const cls = (i: number) => [i === 0 && !label ? "gs" : "", !label && gi % 2 ? "alt" : ""].filter(Boolean).join(" ");
      return `${label ? `<tr class="grp"><td colspan="${4 + (code ? 1 : 0) + (val ? 1 : 0) + (blank ? 1 : 0)}">${esc(label)} <span class="muted">(${esc(formatNum(list.length))})</span></td></tr>` : ""}${list.map((r, i) => row(r, k++, cls(i))).join("")}`;
    }).join("");
  } else body = c.rows.map((r, i) => row(r, i)).join("");
  return `<table class="tbl${c.rows.length > 25 ? " dense" : ""}"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** التوأمُ بطاقاتٍ متجاورة: «تبقى هذي» على صفّ المصنع، وخطواتُ الدمج بأسماء الصفّين ورموزهما. */
function twinCards(t: TFunction, c: ReportCheck, restricted: boolean): string {
  return groupsOf(c.rows).map(([, list], gi) => {
    const factory = list.filter((r) => r.chip === t("audit.roleFactory", "مصنع"));
    const keep = factory.length === 1 ? factory[0] : null;
    const shelf = list.filter((r) => r !== keep);
    const card = (r: ReportRow) => `<div class="pcard${r === keep ? " keep" : ""}">${r === keep ? `<div class="keepmark">${esc(t("audit.rp.keep", "✔ تبقى هذي"))}</div>` : ""}
      <div class="pname">${esc(r.name)}</div>${bc(t, r.code)}
      <dl><dt>${esc(t("audit.rp.kind", "النوع"))}</dt><dd>${esc(r.chip ?? "—")}</dd>
      <dt>${esc(t("audit.colStock", "الرصيد"))}</dt><dd>${r.stock === null ? "—" : esc(formatQty(r.stock))}</dd>
      ${!restricted && r.value > 0 ? `<dt>${esc(t("audit.colValue", "القيمة"))}</dt><dd>${esc(money(r.value))}</dd>` : ""}</dl></div>`;
    /* لا «اعدّوا: المجموعُ = مادتان والواحدُ = تكرار» — صفٌّ رصيدُه صفر يجعل الحكمين رقماً واحداً (نصفُ
     * التوائم الحقيقية)، والتكرارُ رصيدُه مقسومٌ فيطابق العدُّ المجموعَ أصلاً. الحكمُ بالعلبة (m1)، والعدُّ بعد الدمج (m4). */
    const steps = [
      t("audit.rp.m1", "قبل الدمج: جيبوا علبة من الرف وقارنوها بالصفّين — نفس الحيوان والنكهة والوزن؟ إذا لا، لا تدمجوا وزيدوا بالاسم الفرق."),
      ...(keep ? shelf.map((s) => {
        const vals = { a: s.name, ac: s.code ?? t("audit.noCodeShort", "بلا باركود"), b: keep.name, bc: keep.code ?? "" };
        return t("audit.rp.m3", { ...vals, defaultValue: "بالمخزون افتحوا «{{a}}» ({{ac}}) ← القلم ✎ ← «دمج بمنتج ثاني» ← ابحثوا بالباركود {{bc}} واختاروا «{{b}}»." });
      }) : [t("audit.rp.m3b", "اختاروا الصف اللي عليه باركود العلبة، وادمجوا الباقي بيه من «دمج بمنتج ثاني».")]),
      t("audit.rp.m4", "الدمج ينقل الرصيد والتاريخ بنفسه والرمز القديم يبقى رمز إضافي. بعده اعدّوا وصحّحوا بالجرد اليومي بسبب «خطأ إدخال». وإذا اندمج الغلط: «المحذوفات» ← «استرجاع»."),
    ];
    return `<article class="group"><div class="gh"><span class="gnum">${gi + 1}</span><span class="badge bad">${esc(t("audit.rp.likelyTwin", "الغالب نفس المادة — افحصوا بالرف"))}</span></div>
      <div class="cards">${list.map(card).join("")}</div>
      <ol class="how">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="check">${esc(t("audit.rp.checkLine", "☐ تم الدمج    ☐ مو نفس المادة — الفرق: ____________    بواسطة: ________"))}</div></article>`;
  }).join("");
}

function checkHTML(t: TFunction, c: ReportCheck, restricted: boolean): string {
  const n = countOf(c);
  if (n === 0) return c.key.startsWith("bc_") ? "" : `<div class="okline"><b>${esc(c.title)}</b><span>${esc(t("audit.none", "ماكو ✓"))}</span></div>`;
  const body = c.key === "dup_twin" ? twinCards(t, c, restricted) : tableCheck(t, c, restricted);
  const val = c.showValue && !restricted ? valueOf(c.rows) : 0;
  return `<div class="chk"><h3>${esc(c.title)} <span class="cnt">${esc(formatNum(n))}</span>${val > 0 ? ` <span class="muted small">${esc(money(val))}</span>` : ""}</h3>`
    + `<p class="why">${esc(c.why)}</p><div class="callout fix"><b>${esc(t("audit.fixLabel", "التصليح:"))}</b> ${esc(c.fix)}</div>${body}</div>`;
}

/** ورقةُ الفحص بالرفّ: كلُّ مجموعةٍ سؤالٌ بباركوداتها ورصيدها وخاناتٍ تُملأ — والمادةُ تُعدّ مرّةً واحدة. */
function shelfSheet(t: TFunction, sections: ReportSection[]): string {
  const items: { q: string; list: ReportRow[] }[] = [];
  for (const k of ["dup_twin", "dup_name"]) {
    const c = find(sections, k);
    if (!c) continue;
    for (const [, list] of groupsOf(c.rows)) items.push({ q: k === "dup_twin" ? t("audit.rp.qSame", "هل هذني نفس المادة؟") : t("audit.rp.qDiff", "هذني مواد مختلفة لو نفس المادة؟"), list });
  }
  if (!items.length) return "";
  const seen = new Map<string, number>();
  return items.map((it, i) => {
    const rows = it.list.map((r) => {
      const prev = seen.get(r.id);
      if (!prev) seen.set(r.id, i + 1);
      const cnt = prev ? t("audit.rp.countedAt", { n: formatNum(prev), defaultValue: "انعدّت بالسؤال {{n}}" }) : t("audit.rp.actualBlank", "الفعلي: ______");
      return `<tr><td class="name">${esc(r.name)}</td><td class="bcc">${bc(t, r.code)}</td><td class="c">${esc(t("audit.rp.sysStock", { n: r.stock === null ? "—" : formatQty(r.stock), defaultValue: "رصيد النظام: {{n}}" }))}</td><td class="c">${esc(cnt)}</td></tr>`;
    }).join("");
    return `<div class="qitem"><div class="qh"><b>${i + 1}.</b> ${esc(it.q)}</div><table class="qt"><tbody>${rows}</tbody></table>
      <div class="qa">${esc(t("audit.rp.qAnswer", "☐ نفس المادة (ندمجها)    ☐ مختلفة، والفرق: ______________    ☐ وحدة منها ما موجودة بالرف"))}</div></div>`;
  }).join("");
}

function staffSurvey(t: TFunction): string {
  const qs: [string, string][] = [
    [t("audit.rp.sq1", "شلون تضيف مادة جديدة للنظام عادةً؟"), t("audit.rp.sq1o", "أمسح باركود العلبة|أكتب رقم من عندي|أضيفها بلا باركود|ما أضيف مواد")],
    [t("audit.rp.sq2", "قبل ما تضيف مادة، تدوّر عليها بالنظام؟"), t("audit.rp.sq2o", "دائماً، بالاسم وبالباركود|أحياناً|لا")],
    [t("audit.rp.sq3", "إذا مسحت باركود وطلعت «الباركود … مو موجود بمخزنك»، شتسوي؟"), t("audit.rp.sq3o", "أضيفها مادة جديدة|أدوّر عليها بالاسم|أسأل المدير|أبيعها بمادة قريبة")],
    [t("audit.rp.sq4", "إذا المادة ما عليها باركود، شتسوي؟"), t("audit.rp.sq4o", "أكتب رقم رف|أتركها بلا باركود|أولّد رمز من «مولد الباركود»|ما أعرف")],
    [t("audit.rp.sq5", "من توصل بضاعة جديدة، شلون تزيد رصيدها؟"), t("audit.rp.sq5o", "فاتورة شراء|أعدّل الرقم مباشرة|غيري يسويها|ما أعرف")],
    [t("audit.rp.sq6", "تعرف تستعمل «دمج بمنتج ثاني»؟"), t("audit.rp.sq6o", "نعم|سمعت بيه|لا")],
    [t("audit.rp.sq7", "صار وياك بعت مادة باسم مادة ثانية لأن الاسمين متشابهين؟"), t("audit.rp.sq7o", "كثير|مرات|أبداً")],
    [t("audit.rp.sq8", "تشتغل بحسابك الخاص لو بالحساب المشترك؟"), t("audit.rp.sq8o", "حسابي الخاص|المشترك|الاثنين")],
  ];
  return `<div class="survey"><div class="sline">${esc(t("audit.rp.sName", "الاسم: ____________________    الوظيفة: ______________    من متى تشتغل بالعيادة: __________"))}</div>`
    + qs.map(([q, o], i) => `<div class="sq"><b>${i + 1}. ${esc(q)}</b><div class="opts">${o.split("|").map((x) => `<span>☐ ${esc(x)}</span>`).join("")}</div></div>`).join("")
    + `<div class="sq"><b>${qs.length + 1}. ${esc(t("audit.rp.sqName", "اكتب اسم هالمادة مثل ما تكتبه بالنظام: «علبة مغلف ويسكاس للقطط البالغة بالسمك، وزن ٨٥ غرام»"))}</b><div class="line">______________________________________________</div></div>`
    + `<div class="sq"><b>${qs.length + 2}. ${esc(t("audit.rp.sqHard", "شنو أصعب شي بالمخزن بالنظام؟"))}</b><div class="line">______________________________________________</div><div class="line">______________________________________________</div></div>`
    + `<div class="sq"><b>${qs.length + 3}. ${esc(t("audit.rp.sqTrain", "تحتاج تدريب على:"))}</b><div class="opts">${t("audit.rp.sqTrainO", "إضافة مادة صح|ربط باركود|الدمج|فاتورة الشراء|الجرد اليومي|طباعة الباركود").split("|").map((x) => `<span>☐ ${esc(x)}</span>`).join("")}</div></div></div>`;
}

function ideas(t: TFunction): string {
  const list: [string, string][] = [
    [t("audit.rp.i1", "«امسح قبل ما تضيف»"), t("audit.rp.i1d", "قبل أي مادة جديدة: «إضافة منتج» وامسح العلبة بحقل الباركود أول شي. إذا طلعت «موجود عندك أصلاً» لا تضيف. وإذا لا، دوّر بالاسم بكلمتين منه.")],
    [t("audit.rp.i2", "شخص واحد يضيف المواد"), t("audit.rp.i2d", "أمين مخزن واحد (وبديل له) يضيف ويعدّل المواد، والباقين يبيعون بس. والدمج يحتاج حساب مدير أو طبيب.")],
    [t("audit.rp.i3", "لكل موظف حسابه"), t("audit.rp.i3d", "لما كل واحد يدخل بحسابه، سجل النظام يبيّن منو أضاف ومنو عدّل، فنعلّم اللي يحتاج بدل ما نلوم الكل.")],
    [t("audit.rp.i4", "البضاعة تدخل بفاتورة شراء"), t("audit.rp.i4d", "زيادة الرصيد بتعديل الرقم تضيّع سعر الشراء والشركة والتاريخ. فاتورة الشراء تسجّلها كلها وتحسب الربح صح.")],
    [t("audit.rp.i5", "الجرد بـ«الجرد اليومي»"), t("audit.rp.i5d", "كل أسبوع شركة أو قسمين بورقة الجرد، والفرق يتسجّل بالجرد اليومي (بسبب وموافقة) مو بتعديل الرقم.")],
    [t("audit.rp.i6", "باركود لكل مادة"), t("audit.rp.i6d", "المواد السائبة بلا باركود: «مولد الباركود» ← «منتجات بلا باركود» ← اضغط اسمها، واطبع الملصق. ورقم الرف اليدوي ما يُستعمل إذا العلبة عليها باركود.")],
    [t("audit.rp.i7", "الكيبورد إنكليزي وقت المسح"), t("audit.rp.i7d", "الماسح يكتب مثل الكيبورد: إذا اللغة عربية يطلع الرمز حروف. خلّوا جهاز الكاشير على الإنكليزي دائماً.")],
    [t("audit.rp.i8", "مراجعة أسبوعية قصيرة"), t("audit.rp.i8d", "كل أسبوع افتحوا «فحص المخزن» عشر دقايق: تصليح الخطأ بأسبوعه أسهل من بعد شهرين.")],
  ];
  return `<div class="ideas">${list.map(([h, d]) => `<div class="idea"><h4>${esc(h)}</h4><p>${esc(d)}</p></div>`).join("")}</div>`
    + `<div class="callout ok"><b>${esc(t("audit.rp.ruleTitle", "قاعدة كتابة الاسم:"))}</b> ${esc(t("audit.rp.rule", "[الشكل] [الماركة] [الحيوان] [العمر/الحالة] [النكهة] [الوزن] — بنفس الترتيب والإملاء دائماً، ولا سعر بالاسم أبداً لأن السعر يتغيّر. مثال: «مغلفات ويسكاس قطط ادلت سمك 85غ»."))}</div>`;
}

const STYLE = `
@page{size:A4;margin:11mm 10mm 12mm}
:root{color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;color:#111;background:#fff;font-size:11pt;line-height:1.6}
.sec{margin:0 0 6mm}.sec.pb{break-before:page}
.sh{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
.num{flex:none;width:30px;height:30px;border-radius:8px;background:#e6f1f0;color:#0f5f5c;display:grid;place-items:center;font-weight:700;font-size:15px}
h1{font-size:24pt;line-height:1.25;margin:4px 0 8px}h2{font-size:16pt}h3{font-size:12.5pt;margin:14px 0 4px;break-after:avoid}
.eyebrow{font-size:10pt;color:#0f5f5c;font-weight:700}.lead{color:#444;margin-top:3px}.muted{color:#555}.small{font-size:9pt}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0}
.kpi{border:1px solid #cfcfcf;border-radius:10px;padding:8px 10px;break-inside:avoid}
.kpi .kv{font-size:18pt;font-weight:700;line-height:1.2;white-space:nowrap}.kpi .kv.long{font-size:13.5pt;padding-top:4pt}.kpi .kl{font-size:9.5pt;color:#444}.kpi .ks{font-size:8.5pt;color:#555;margin-top:2px}
.kpi.bad .kv{color:#b42318}.kpi.warn .kv{color:#a15c00}.kpi.info .kv{color:#1d4f91}
ol.find{padding-inline-start:18px}ol.find li{margin:4px 0}
.callout{border:1px solid #cfcfcf;border-inline-start:4px solid #999;border-radius:8px;padding:8px 11px;margin:8px 0;break-inside:avoid}
.callout.info{border-inline-start-color:#1d4f91}.callout.ok{border-inline-start-color:#1e6b3a}.callout.fix{border-inline-start-color:#1d4f91;color:#173a6b}
.badge{display:inline-block;font-size:8.5pt;font-weight:700;padding:0 7px;border-radius:999px;border:1px solid currentColor}
.badge.bad{color:#b42318}.badge.warn{color:#a15c00}.badge.info{color:#1d4f91}.badge.ok{color:#1e6b3a}
.steps{list-style:none;display:grid;gap:6px;counter-reset:s}
.step{counter-increment:s;display:flex;gap:10px;align-items:flex-start;border:1px solid #cfcfcf;border-inline-start:4px solid #999;border-radius:9px;padding:7px 11px;break-inside:avoid}
.step::before{content:counter(s);font-weight:700;color:#555;width:16px}
.step.bad{border-inline-start-color:#b42318}.step.warn{border-inline-start-color:#a15c00}.step.info{border-inline-start-color:#1d4f91}.step.ok{border-inline-start-color:#1e6b3a}
.step div{flex:1}.step b{display:block}.step span{color:#444;font-size:10pt}.tick{font-size:13pt}
.chk{margin:4px 0 12px}.chk h3 .cnt{display:inline-block;border:1px solid #a15c00;color:#a15c00;border-radius:99px;padding:0 8px;font-size:10pt}
.why{color:#333;margin-bottom:3px}
.okline{display:flex;justify-content:space-between;border:1px dashed #cfcfcf;border-radius:7px;padding:5px 10px;margin:5px 0;color:#444}.okline span{color:#1e6b3a;font-weight:700}
table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}
th{text-align:start;font-weight:600;color:#333;font-size:9pt;border:1px solid #bbb;background:#f3f3f3;padding:4px 6px}
td{border:1px solid #cfcfcf;padding:4px 6px;vertical-align:middle;font-size:10pt}
td.c,th.c{text-align:center}td.n{color:#666;font-size:9pt;width:26px}td.name{font-weight:600}
td.mono{font-family:Consolas,monospace;direction:ltr;text-align:center;font-size:9pt}td.note{color:#7a4500;font-size:9pt}
td.fillcell{min-width:70px;background:#fafafa}th.fill{min-width:70px}
tr.grp td{background:#e6f1f0;color:#0f5f5c;font-weight:700}tr.gs td{border-top:2px solid #6b7b7a}tr.alt td{background:#f4f7f7}
table.dense td,table.dense th{padding:2px 5px;font-size:8.5pt;line-height:1.35}
.bcbox{display:inline-flex;flex-direction:column;align-items:center;background:#fff;padding:1mm}
.bcbox svg.bc{display:block;max-width:100%}.bctext{font-family:Consolas,monospace;font-size:8pt;letter-spacing:.04em}
.bcbox.none,.bcbox.bad{font-size:9pt;color:#b42318;border:1px dashed #b42318;border-radius:4px;padding:3px 6px}
td.bcc svg.bc{height:9mm!important}
.group{border:1px solid #cfcfcf;border-radius:10px;padding:9px 11px;margin:9px 0;break-inside:avoid}
.gh{display:flex;gap:8px;align-items:center;margin-bottom:7px}.gnum{font-weight:700;color:#555}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.pcard{border:1px solid #cfcfcf;border-radius:9px;padding:8px;position:relative}.pcard.keep{border:2px solid #1e6b3a}
.keepmark{position:absolute;top:-9px;inset-inline-start:9px;background:#1e6b3a;color:#fff;font-size:8pt;font-weight:700;padding:0 7px;border-radius:999px}
.pname{font-weight:700;margin-bottom:4px}.pcard dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin-top:5px;font-size:9.5pt}.pcard dt{color:#555}
ol.how{margin:7px 0 0;padding-inline-start:18px;font-size:9.5pt}ol.how li{margin:2px 0}
.check{margin-top:7px;border-top:1px dashed #bbb;padding-top:5px;font-size:9.5pt;white-space:pre}
.qitem{border:1px solid #cfcfcf;border-radius:9px;padding:7px 9px;margin:7px 0;break-inside:avoid}
table.qt td{border:none;border-bottom:1px dashed #ddd}.qa{margin-top:6px;font-size:10pt;white-space:pre}
.survey .sq{margin:12px 0;break-inside:avoid}.survey .opts{display:flex;flex-wrap:wrap;gap:4px 20px;margin-top:3px}.survey .line{margin-top:9px;color:#666}.sline{margin:4px 0 12px;white-space:pre}
.ideas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.idea{border:1px solid #cfcfcf;border-radius:10px;padding:9px 11px;break-inside:avoid}
.idea h4{font-size:11pt;margin-bottom:3px}.idea p{color:#444;font-size:9.5pt}
.pbh{break-before:page}
.foot{margin-top:10px;display:flex;justify-content:space-between;font-size:8.5pt;color:#888}
`;

/**
 * التقريرُ كاملاً ورقةً بـA4 — غلافٌ وترتيبُ تصليحٍ وكلُّ قسمٍ بصفحته، وورقةُ فحصٍ بالرفّ واستبيانٌ
 * واقتراحات. يُكتب بنافذة الطباعة (`writePrintWindow`) فيطبعها المتصفّح PDF أو ورقاً.
 */
export function buildAuditReportHTML(o: {
  t: TFunction; lang: string; clinic: string; days: number; restricted: boolean;
  sections: ReportSection[]; totals: AuditTotals | null;
}): string {
  const { t, lang, clinic, days, restricted, sections, totals } = o;
  const rtl = lang.startsWith("ar");
  const date = new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: "full" }).format(new Date());
  const sum = summarize(t, sections, totals, restricted);
  // «مرتّب» بعدِّ الشاشة نفسِه (كلُّ فحص) لا بعدد الجُمل — جملةٌ ناقصة كانت تقول «مرتّب» فوق صفحاتٍ من المشاكل
  const total = sections.reduce((a, s) => a + s.checks.reduce((b, c) => b + countOf(c), 0), 0);
  const n = (k: string) => { const c = find(sections, k); return c ? countOf(c) : 0; };
  const v = (k: string) => { const c = find(sections, k); return c ? valueOf(c.rows) : 0; };
  const kpi = (label: string, value: string, sub: string, tone: Tone | "") => `<div class="kpi ${tone}"><div class="kv${value.length > 9 ? " long" : ""}">${esc(value)}</div><div class="kl">${esc(label)}</div>${sub ? `<div class="ks">${esc(sub)}</div>` : ""}</div>`;
  const idleN = n("never_sold") + n("stopped") + n("slow");
  const kpis = [
    totals ? kpi(t("audit.rp.kProducts", "مادة بالنظام"), formatNum(totals.products), "", "") : "",
    totals && !restricted ? kpi(t("audit.rp.kValue", "قيمة المخزن (شراء)"), money(totals.value),
      v("impossible") > 0 ? t("audit.rp.kValueSub", { v: money(Math.max(0, totals.value - v("impossible"))), defaultValue: "بدون الكميات المستحيلة ≈ {{v}}" }) : "", v("impossible") > 0 ? "warn" : "") : "",
    kpi(t("audit.rp.kTwin", "مكرّرة محتملة"), formatNum(n("dup_twin")), t("audit.rp.kTwinSub", { n: formatNum(n("dup_name")), defaultValue: "+ {{n}} مجموعة بنفس الاسم" }), "bad"),
    kpi(t("audit.noCode", "بلا باركود"), formatNum(n("no_code")), "", "bad"),
    kpi(t("audit.handCode", "رمز مكتوب باليد"), formatNum(n("hand_code")), "", "warn"),
    kpi(t("audit.sImpossible", "كميات مستحيلة"), formatNum(n("impossible")), restricted ? "" : money(v("impossible")), "bad"),
    kpi(t("audit.rp.kIdle", "بضاعة واقفة"), formatNum(idleN), restricted ? "" : money(v("never_sold") + v("stopped") + v("slow")), "warn"),
    kpi(t("audit.noCompany", "بلا شركة"), formatNum(n("no_company")), "", "info"),
  ].join("");

  let num = 0;
  const head = (title: string, lead: string) => `<div class="sh"><span class="num">${++num}</span><div><h2>${esc(title)}</h2>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}</div></div>`;
  const cover = `<section class="sec">
    <div class="eyebrow">${esc(t("audit.rp.eyebrow", { date, n: formatNum(days), defaultValue: "فحص المخزن · {{date}} · معدّل البيع من آخر {{n}} يوم" }))}</div>
    <h1>${esc(t("audit.rp.coverTitle", { clinic, defaultValue: "مخزن {{clinic}}" }))}</h1>
    <p class="lead">${esc(t("audit.rp.coverLead", "كل ثغرة لگيناها بالمخزن: التكرار، المواد بلا باركود، الرموز اليدوية، الكميات المستحيلة، البضاعة الواقفة، والشركات. قراءة بس — ما تغيّر شي، والتصليح بيدكم مادة مادة."))}</p>
    <div class="kpis">${kpis}</div>
    ${sum.findings.length ? `<h3>${esc(t("audit.rp.findings", "أهم ما لگيناه"))}</h3><ol class="find">${sum.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>` : ""}
    ${total === 0 ? `<div class="callout ok">${esc(t("audit.clean", "ماكو ملاحظات — مخزنك مرتّب بكل الفحوص ✓"))}</div>` : ""}
    <div class="callout info">${esc(t("audit.rp.howRead", "شلون تقرأ: كل قسم يبدأ بصفحة جديدة، والباركود مرسوم ينمسح بالقارئ حتى تتأكدون إن العلبة نفس الصف. اطبعوا بحجم ١٠٠٪ (بدون «احتواء بالصفحة»). الأحمر خطأ يتصلّح، والأصفر خلل يحتاج متابعة، والأزرق يحتاج فحص بالرف."))}</div>
  </section>`;
  const start = `<section class="sec pb">${head(t("audit.rp.startTitle", "ابدأ من هنا: ترتيب التصليح"), t("audit.rp.startLead", "بهذا الترتيب، لأن كل خطوة تسهّل اللي بعدها: الكميات أول، وبعدها الدمج، وبعدها الباركود."))}
    <ol class="steps">${sum.steps.map((s) => `<li class="step ${s.tone}"><div><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></div><span class="tick">☐</span></li>`).join("")}</ol></section>`;
  const rank = (id: string) => { const i = PRINT_ORDER.indexOf(id); return i < 0 ? PRINT_ORDER.length : i; };
  const body = sections.filter((s) => s.checks.some((c) => countOf(c) > 0 || !c.key.startsWith("bc_"))).sort((a, b) => rank(a.id) - rank(b.id)).map((s) =>
    `<section class="sec pb">${head(s.title, "")}${s.checks.map((c) => checkHTML(t, c, restricted)).join("")}</section>`).join("");
  const sheet = shelfSheet(t, sections);
  const survey = `<section class="sec pb">${head(t("audit.rp.surveyTitle", "الاستبيان"), t("audit.rp.surveyLead", "جزئين: (أ) مواد ما تنحسم من البيانات، تحتاج عين بالرف. (ب) أسئلة للموظفين حتى نعرف منين يجي الخطأ ووين يحتاجون تدريب."))}
    ${sheet ? `<h3>${esc(t("audit.rp.shelfTitle", "أ) ورقة الفحص بالرف"))}</h3>${sheet}` : ""}
    <h3 class="${sheet ? "pbh" : ""}">${esc(t("audit.rp.staffTitle", "ب) استبيان الموظفين"))}</h3>${staffSurvey(t)}</section>`;
  const tips = `<section class="sec pb">${head(t("audit.rp.ideasTitle", "اقتراحات حتى ما يرجع الخلل"), t("audit.rp.ideasLead", "تصليح اليوم يرجع إذا ما تغيّرت طريقة الإدخال. قواعد بسيطة تمنع أغلب الخلل."))}${ideas(t)}</section>`;

  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(t("audit.title", "فحص المخزن"))} — ${esc(clinic)}</title>
<style>${STYLE}</style></head><body onload="setTimeout(function(){window.print()},300)">
${cover}${start}${body}${survey}${tips}
<div class="foot"><span>${esc(date)}</span><span>doctorVet</span></div>
</body></html>`;
}
