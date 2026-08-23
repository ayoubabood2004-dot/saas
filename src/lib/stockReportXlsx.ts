import type { Product, Company, CompanySection } from "@/types";
import i18n from "@/i18n";
import { getClinicName } from "./settings";
import { currencyInfo, getActiveCurrency } from "./currency";
import { buildStocktake, flatLines, flagsText, type Stocktake, type StocktakeLine } from "./stocktake";
import { asciiFileName } from "./excelExport";

/* ============================================================================
 * stockReportXlsx — ملفّ جرد المخزون بصيغة إكسل.
 *
 * الورقة المطبوعة تُملأ بالقلم ثم يُجمع الفرق بالذهن — وهناك يقع الغلط. هذا
 * الملف ينقل الحساب لإكسل: يكتب العادّ **العدد الفعلي** وحده، فيحسب الملف
 * الفرق وقيمته بالدينار فوراً، ويجمعها كلها بورقة الملخّص.
 *
 * ── ثلاثة أخطاء قاتلة يمنعها هذا الملف بالبناء لا بالتنبيه ───────────────
 * ١) **الباركود رقماً**: باركودٌ من ثلاثة عشر رقماً يُكتب نصاً صريحاً بصيغة
 *    "@". لولا ذلك لحوّله إكسل إلى 6.22103E+12 وأكل أصفار البداية — فيصير
 *    الجرد مقارنةً بين باركوداتٍ محرَّفة. هذا أشهر غلطٍ بملفات المخزون كلها.
 * ٢) **السعر مقرَّباً**: `money()` يعرض ٦٫٥ «٧» لأنه للعرض. وهنا تُكتب القيم
 *    الخام: إكسل يستلم 6.5 ويضربها بالعدد، فلا فرق وهميّ من تقريبٍ عرضيّ.
 * ٣) **العدد نصاً**: كل عددٍ خليةٌ رقمية بصيغة عدد — تُجمع وتُفرز وتدخل
 *    المعادلات. الرقم المكتوب نصاً يجمعه إكسل صفراً بلا أن يشتكي.
 *
 * ── ولحظة اللقطة تُطبع بأعلى الورقة ──────────────────────────────────────
 * الجرد مقارنةٌ بلحظة. بيعةٌ تقع أثناء العدّ تُنقص الرفّ ولا تُنقص الورقة،
 * فيظهر فرقٌ سببه الوقت لا النقص. فالساعة مكتوبةٌ بأعلى الورقتين معاً.
 * ==========================================================================*/

/* أعمدة ورقة الجرد — الترتيب هنا هو ترتيب الحروف بإكسل (A أول عمود). */
const COL = {
  seq: "A", barcode: "B", name: "C", company: "D", section: "E", category: "F",
  buy: "G", sell: "H", systemQty: "I", costValue: "J", retailValue: "K",
  actualQty: "L", diff: "M", diffValue: "N",
  minStock: "O", expiry: "P", daysLeft: "Q", status: "R", subUnit: "S", id: "T",
} as const;
const LAST_COL = 19;            // T بالفهرسة الصفرية
const HEAD_ROW = 4;             // صفّ العناوين بترقيم إكسل (١-أساس)
const FIRST_DATA = HEAD_ROW + 1;

const headers = (): string[] => [
  "#",
  i18n.t("stock.hBarcode", "الباركود"),
  i18n.t("stock.hName", "المنتج"),
  i18n.t("stock.hCompany", "الشركة"),
  i18n.t("stock.hSection", "الصنف"),
  i18n.t("stock.hCategory", "الفئة"),
  i18n.t("stock.hBuy", "سعر الشراء"),
  i18n.t("stock.hSell", "سعر البيع"),
  i18n.t("stock.hSystemQty", "العدد بالنظام"),
  i18n.t("stock.hCostValue", "قيمة الشراء"),
  i18n.t("stock.hRetailValue", "قيمة البيع"),
  i18n.t("stock.hActualQty", "العدد الفعلي"),
  i18n.t("stock.hDiff", "الفرق"),
  i18n.t("stock.hDiffValue", "قيمة الفرق (شراء)"),
  i18n.t("stock.hMinStock", "الحد الأدنى"),
  i18n.t("stock.hExpiry", "تاريخ النفاذ"),
  i18n.t("stock.hDaysLeft", "أيام للنفاذ"),
  i18n.t("stock.hStatus", "الحالة"),
  i18n.t("stock.hSubUnit", "وحدة التجزئة"),
  i18n.t("stock.hId", "المعرّف"),
];

/* أسماء الفئات من مفاتيح الشاشة نفسها (`pos.cat.*`) لا من قائمةٍ ثانية:
 * قائمتان تفترقان يوم تُضاف فئة، فيظهر بالملف رمزٌ إنجليزي وسط عربية. */
const categoryLabel = (c: string): string => i18n.t(`pos.cat.${c}`, c);

const BORDER = { style: "thin", color: { rgb: "D8DEE7" } };
const HEAD_BORDER = { style: "thin", color: { rgb: "94A3B8" } };
const INK = "0F172A";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cell = Record<string, any>;

const stamp = (d: Date) =>
  d.toLocaleDateString("ar-IQ", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
  " · " + d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });

/** اسم ملفٍ لاتينيّ يفرز نفسه بالتاريخ — والعنوان العربي داخل الملف. */
function fileNameFor(clinic: string, d: Date): string {
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return asciiFileName(`${clinic} stocktake ${day} ${hm}`, `stocktake-${day}-${hm}`);
}

export async function exportStocktakeXlsx(
  products: Product[], companies: Company[], sections: CompanySection[],
): Promise<string> {
  const mod: any = await import("xlsx-js-style");
  const XLSX: any = mod.default ?? mod;

  const now = new Date();
  const clinic = getClinicName() || "doctorVet";
  const cur = currencyInfo(getActiveCurrency());
  /* صيغة العملة تتبع عملة العيادة: عمودٌ اسمه «قيمة الشراء» بلا وحدة يُقرأ
   * دولاراً بمكانٍ ودنانير بآخر. وعملةٌ بلا أجزاء تُعرض بلا كسورٍ **إلا حين
   * توجد فعلاً** (‎.###‎): فلا ضجيج «٢٢٫٠٠» ولا ابتلاع «٦٫٥». */
  const MONEY = `#,##0.${cur.frac ? "00" : "###"}" ${cur.code}"`;
  const QTY = "#,##0.###";

  const take = buildStocktake(products, companies, sections, now);
  const lines = flatLines(take);

  const wb: any = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };

  XLSX.utils.book_append_sheet(wb, countSheet(XLSX, take, lines, clinic, now, MONEY, QTY), i18n.t("stock.tabCount", "ورقة الجرد"));
  XLSX.utils.book_append_sheet(wb, summarySheet(XLSX, take, clinic, now, MONEY, QTY, lines.length), i18n.t("stock.tabSummary", "الملخّص"));
  XLSX.utils.book_append_sheet(wb, guideSheet(XLSX), i18n.t("stock.tabGuide", "التعليمات"));

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const name = fileNameFor(clinic, now);
  /* الرابط يُضاف للمستند قبل الضغط: المتصفّح يتجاهل خاصية `download` على
   * عنصرٍ خارج الصفحة، فينزل الملف باسم "download" بلا امتداد — ويفتح على
   * غير إكسل. */
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  return name;
}

/* ── ورقة الجرد ─────────────────────────────────────────────────────────── */
function countSheet(
  XLSX: any, take: Stocktake, lines: StocktakeLine[],
  clinic: string, now: Date, MONEY: string, QTY: string,
): any {
  const ws: any = {};
  const put = (addr: string, cell: Cell) => { ws[addr] = cell; };
  const txt = (v: string, s?: Cell) => ({ t: "s", v, ...(s ? { s } : {}) });
  const num = (v: number, z: string, s?: Cell) => ({ t: "n", v, z, ...(s ? { s } : {}) });

  const titleStyle = { font: { bold: true, sz: 16, color: { rgb: INK } }, alignment: { horizontal: "center", vertical: "center", readingOrder: 2 } };
  const stampStyle = { font: { sz: 11, bold: true, color: { rgb: "334155" } }, alignment: { horizontal: "center", readingOrder: 2 } };
  const warnStyle = {
    font: { sz: 10.5, bold: true, color: { rgb: "9A3412" } },
    fill: { patternType: "solid", fgColor: { rgb: "FFF7ED" } },
    alignment: { horizontal: "center", readingOrder: 2 },
  };

  put("A1", txt(`${clinic} — ${i18n.t("stock.fileName", "جرد المخزون")}`, titleStyle));
  put("A2", txt(i18n.t("stock.snapshotAt", { d: stamp(now), defaultValue: "لقطة المخزون: {{d}}" }), stampStyle));
  put("A3", txt(i18n.t("stock.fillHint", "املأ عمود «العدد الفعلي» فقط — الفرق وقيمته يُحسبان تلقائياً. أي بيعٍ يقع بعد ساعة اللقطة أعلاه لا يظهر بهذه الورقة."), warnStyle));

  const headStyle = {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: INK } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true, readingOrder: 2 },
    border: { top: HEAD_BORDER, bottom: HEAD_BORDER, left: HEAD_BORDER, right: HEAD_BORDER },
  };
  /* عمود العدد الفعلي بلونٍ صارخ: العادّ يجب أن يعرف أين يكتب من نظرةٍ واحدة. */
  const headFill = { ...headStyle, fill: { patternType: "solid", fgColor: { rgb: "B45309" } } };
  headers().forEach((h, c) => put(XLSX.utils.encode_cell({ r: HEAD_ROW - 1, c }), txt(h, c === 11 ? headFill : headStyle)));

  const cellBase = (extra?: Cell): Cell => ({
    alignment: { horizontal: "right", vertical: "center", readingOrder: 2 },
    border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...extra,
  });
  const centred = cellBase({ alignment: { horizontal: "center", vertical: "center", readingOrder: 2 } });
  const numeric = cellBase({ alignment: { horizontal: "center", vertical: "center" } });
  /* الباركود نصٌّ بمحاذاة يسار واتجاه لاتيني — رقمٌ لاتينيّ وسط عربيةٍ يُقلب بصرياً. */
  const barcodeStyle = cellBase({ alignment: { horizontal: "left", vertical: "center", readingOrder: 1 }, font: { name: "Consolas", sz: 11 } });
  const fillMe = cellBase({
    fill: { patternType: "solid", fgColor: { rgb: "FEF3C7" } },
    font: { bold: true, sz: 12, color: { rgb: "78350F" } },
    alignment: { horizontal: "center", vertical: "center" },
  });
  const derived = cellBase({ font: { bold: true, color: { rgb: "1E3A8A" } }, alignment: { horizontal: "center", vertical: "center" } });
  const poolTint = { patternType: "solid", fgColor: { rgb: "EFF6FF" } };
  const alertFont = { bold: true, color: { rgb: "B91C1C" } };

  lines.forEach((l, i) => {
    const r = FIRST_DATA + i;          // رقم الصف بإكسل
    const R = r - 1;                   // بالفهرسة الصفرية
    const at = (col: string) => `${col}${r}`;
    const pool = l.kind === "pool";
    const tint = (s: Cell): Cell => (pool ? { ...s, fill: poolTint } : s);

    put(at(COL.seq), l.seq == null ? txt("—", tint(centred)) : num(l.seq, "0", tint(centred)));
    /* z:"@" هو ما يمنع إكسل من ابتلاع الباركود رقماً — لا الاقتباس ولا الفراغ. */
    put(at(COL.barcode), { t: "s", v: l.barcode ?? "", z: "@", s: tint(barcodeStyle) });
    put(at(COL.name), txt(l.name, tint(cellBase(pool ? { font: { bold: true, color: { rgb: "1E40AF" } } } : undefined))));
    put(at(COL.company), txt(l.companyName, tint(cellBase())));
    put(at(COL.section), txt(l.sectionName, tint(cellBase())));
    put(at(COL.category), txt(l.category ? categoryLabel(l.category) : "", tint(centred)));
    put(at(COL.buy), num(round4(l.buy), MONEY, tint(numeric)));
    put(at(COL.sell), num(round4(l.sell), MONEY, tint(numeric)));
    put(at(COL.systemQty), num(l.systemQty, QTY, tint({ ...numeric, font: { bold: true, sz: 12 } })));
    /* القيم معادلاتٌ لا أرقاماً مطبوعة: من صحّح سعراً بالعمود G رأى قيمته
     * تتبعه فوراً، بدل ورقةٍ تناقض نفسها بصمت. */
    put(at(COL.costValue), { t: "n", f: `${at(COL.systemQty)}*${at(COL.buy)}`, v: round4(l.cost), z: MONEY, s: tint(numeric) });
    put(at(COL.retailValue), { t: "n", f: `${at(COL.systemQty)}*${at(COL.sell)}`, v: round4(l.retail), z: MONEY, s: tint(numeric) });

    /* خليةٌ نصّية فارغة لا خليةٌ من نوع «فراغ»: الفراغ يُكتب بلا تنسيق فيضيع
     * اللون الأصفر الذي يدلّ العادّ على مكان الكتابة. و`""` تُعامَل فارغةً
     * بكل الدوال — COUNT لا تعدّها، وIF تراها فارغة. */
    put(at(COL.actualQty), { t: "s", v: "", z: QTY, s: fillMe });
    put(at(COL.diff), { t: "s", f: `IF(${at(COL.actualQty)}="","",${at(COL.actualQty)}-${at(COL.systemQty)})`, v: "", z: QTY, s: tint(derived) });
    put(at(COL.diffValue), { t: "s", f: `IF(${at(COL.actualQty)}="","",(${at(COL.actualQty)}-${at(COL.systemQty)})*${at(COL.buy)})`, v: "", z: MONEY, s: tint(derived) });

    put(at(COL.minStock), l.minStock == null ? txt("", tint(centred)) : num(l.minStock, QTY, tint(centred)));
    /* التاريخ نصّاً بصيغة ISO: يفرز زمنياً كما يفرز نصّياً، ولا يزيحه فارق
     * التوقيت يوماً كما يفعل تحويل التاريخ الحقيقي عند الفتح ببلدٍ آخر. */
    put(at(COL.expiry), { t: "s", v: l.expiry ?? "", z: "@", s: tint({ ...centred, alignment: { horizontal: "center", vertical: "center", readingOrder: 1 } }) });
    put(at(COL.daysLeft), l.daysToExpiry == null ? txt("", tint(centred))
      : num(l.daysToExpiry, "0", tint(l.daysToExpiry <= 30 ? { ...centred, font: alertFont } : centred)));
    const status = pool ? i18n.t("stock.poolStatus", "مجمّع — قيمته تقديرية بمتوسط أسعار الصنف") : flagsText(l.flags);
    put(at(COL.status), txt(status, tint(cellBase(status ? { font: alertFont } : undefined))));
    put(at(COL.subUnit), txt(l.subUnit ? `${l.subUnit.name || i18n.t("stock.unit", "وحدة")} ×${l.subUnit.perBox}` : "", tint(centred)));
    put(at(COL.id), txt(l.productId ?? "", tint({ ...centred, font: { sz: 9, color: { rgb: "94A3B8" } } })));

    void R;
  });

  /* صفُّ المجاميع بأسفل الجدول — بمعادلات SUM لا بأرقامٍ مجمَّدة، فيتحرّك مع
   * أي تصحيحٍ يكتبه المدقّق بيده. */
  const totalRow = FIRST_DATA + lines.length + 1;
  const sumStyle = {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: INK } },
    alignment: { horizontal: "center", vertical: "center", readingOrder: 2 },
    border: { top: HEAD_BORDER, bottom: HEAD_BORDER, left: HEAD_BORDER, right: HEAD_BORDER },
  };
  const span = (col: string) => `${col}${FIRST_DATA}:${col}${FIRST_DATA + lines.length - 1}`;
  put(`A${totalRow}`, txt(i18n.t("stock.grandTotal", "المجموع"), { ...sumStyle, alignment: { horizontal: "right", vertical: "center", readingOrder: 2 } }));
  put(`${COL.systemQty}${totalRow}`, { t: "n", f: `SUM(${span(COL.systemQty)})`, v: round4(take.totals.units), z: QTY, s: sumStyle });
  put(`${COL.costValue}${totalRow}`, { t: "n", f: `SUM(${span(COL.costValue)})`, v: round4(take.totals.cost), z: MONEY, s: sumStyle });
  put(`${COL.retailValue}${totalRow}`, { t: "n", f: `SUM(${span(COL.retailValue)})`, v: round4(take.totals.retail), z: MONEY, s: sumStyle });
  put(`${COL.actualQty}${totalRow}`, { t: "n", f: `SUM(${span(COL.actualQty)})`, v: 0, z: QTY, s: sumStyle });
  put(`${COL.diff}${totalRow}`, { t: "n", f: `SUM(${span(COL.diff)})`, v: 0, z: QTY, s: sumStyle });
  put(`${COL.diffValue}${totalRow}`, { t: "n", f: `SUM(${span(COL.diffValue)})`, v: 0, z: MONEY, s: sumStyle });
  for (const c of [COL.barcode, COL.name, COL.company, COL.section, COL.category, COL.buy, COL.sell,
    COL.minStock, COL.expiry, COL.daysLeft, COL.status, COL.subUnit, COL.id]) {
    put(`${c}${totalRow}`, txt("", sumStyle));
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow - 1, c: LAST_COL } });
  ws["!views"] = [{ RTL: true }];
  ws["!merges"] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: LAST_COL } }));
  ws["!autofilter"] = { ref: `A${HEAD_ROW}:${COL.id}${FIRST_DATA + lines.length - 1}` };
  ws["!rows"] = [{ hpt: 26 }, { hpt: 17 }, { hpt: 17 }, { hpt: 34 }];
  ws["!cols"] = [
    { wch: 5 }, { wch: 17 }, { wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 11 }, { wch: 17 },
    { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 26 }, { wch: 14 }, { wch: 16 },
  ];
  return ws;
}

/* ── ورقة الملخّص ───────────────────────────────────────────────────────── */
function summarySheet(
  XLSX: any, take: Stocktake, clinic: string, now: Date, MONEY: string, QTY: string, rowCount: number,
): any {
  const S = `'${i18n.t("stock.tabCount", "ورقة الجرد")}'`;
  const lastData = FIRST_DATA + rowCount - 1;
  const rows: { label: string; value?: string | number; z?: string; f?: string; head?: boolean; hint?: string }[] = [];

  rows.push({ label: `${clinic} — ${i18n.t("stock.sumTitle", "ملخّص جرد المخزون")}`, head: true });
  rows.push({ label: i18n.t("stock.sumSnapshot", "لقطة المخزون"), value: stamp(now) });
  rows.push({ label: "" });

  rows.push({ label: i18n.t("stock.sumSystem", "الإجمالي بالنظام"), head: true });
  rows.push({ label: i18n.t("stock.sumProducts", "عدد المنتجات"), value: take.totals.products, z: "0" });
  rows.push({ label: i18n.t("stock.sumUnits", "إجمالي القطع (مع المخزون المجمّع)"), value: round4(take.totals.units), z: QTY });
  rows.push({ label: i18n.t("stock.sumCost", "رأس المال (سعر الشراء)"), value: round4(take.totals.cost), z: MONEY });
  rows.push({ label: i18n.t("stock.sumRetail", "قيمة البيع"), value: round4(take.totals.retail), z: MONEY });
  rows.push({ label: i18n.t("stock.sumProfit", "الربح المتوقّع"), value: round4(take.totals.retail - take.totals.cost), z: MONEY });
  if (take.pooled.cost > 0) {
    rows.push({ label: i18n.t("stock.sumPoolUnits", "منها مخزون مجمّع (قيمته تقديرية)"), value: round4(take.pooled.units), z: QTY });
    rows.push({ label: i18n.t("stock.sumPoolCost", "قيمة المجمّع التقديرية (شراء)"), value: round4(take.pooled.cost), z: MONEY });
  }
  rows.push({ label: "" });

  /* نتيجة الجرد معادلاتٌ حيّة: تتحرّك وأنت تكتب الأعداد الفعلية بالورقة
   * الأولى، فلا تحتاج تصديراً ثانياً بعد انتهاء العدّ. */
  rows.push({ label: i18n.t("stock.sumResult", "نتيجة الجرد (تتحدّث وأنت تملأ «العدد الفعلي»)"), head: true });
  rows.push({ label: i18n.t("stock.sumCounted", "أسطر عُدَّت فعلاً"), f: `COUNT(${S}!${COL.actualQty}${FIRST_DATA}:${COL.actualQty}${lastData})`, z: "0" });
  rows.push({ label: i18n.t("stock.sumUncounted", "أسطر لم تُعدّ بعد"), f: `${rowCount}-COUNT(${S}!${COL.actualQty}${FIRST_DATA}:${COL.actualQty}${lastData})`, z: "0" });
  rows.push({ label: i18n.t("stock.sumWithDiff", "أسطر فيها فرق"), f: `COUNTIF(${S}!${COL.diff}${FIRST_DATA}:${COL.diff}${lastData},"<>0")-COUNTBLANK(${S}!${COL.diff}${FIRST_DATA}:${COL.diff}${lastData})`, z: "0" });
  rows.push({ label: i18n.t("stock.sumActual", "مجموع القطع الفعلية"), f: `SUM(${S}!${COL.actualQty}${FIRST_DATA}:${COL.actualQty}${lastData})`, z: QTY });
  rows.push({ label: i18n.t("stock.sumNetDiff", "صافي فرق القطع (فعلي − نظام)"), f: `SUM(${S}!${COL.diff}${FIRST_DATA}:${COL.diff}${lastData})`, z: QTY });
  rows.push({ label: i18n.t("stock.sumShort", "قيمة النقص (شراء)"), f: `SUMIF(${S}!${COL.diffValue}${FIRST_DATA}:${COL.diffValue}${lastData},"<0")`, z: MONEY });
  rows.push({ label: i18n.t("stock.sumOver", "قيمة الزيادة (شراء)"), f: `SUMIF(${S}!${COL.diffValue}${FIRST_DATA}:${COL.diffValue}${lastData},">0")`, z: MONEY });
  rows.push({ label: i18n.t("stock.sumNetValue", "صافي أثر الجرد على رأس المال"), f: `SUM(${S}!${COL.diffValue}${FIRST_DATA}:${COL.diffValue}${lastData})`, z: MONEY });
  rows.push({ label: "" });

  rows.push({ label: i18n.t("stock.sumByGroup", "التفصيل حسب الشركة والصنف"), head: true });
  const ws: any = {};
  const txt = (v: string, s?: Cell) => ({ t: "s", v, ...(s ? { s } : {}) });

  const headStyle = { font: { bold: true, sz: 13, color: { rgb: INK } }, alignment: { horizontal: "right", readingOrder: 2 } };
  const labelStyle = { font: { bold: true, color: { rgb: "475569" } }, alignment: { horizontal: "right", readingOrder: 2 }, border: { bottom: BORDER } };
  const valueStyle = { font: { bold: true, sz: 12, color: { rgb: INK } }, alignment: { horizontal: "center", readingOrder: 2 }, border: { bottom: BORDER } };

  let r = 0;
  for (const row of rows) {
    if (row.head) ws[`A${r + 1}`] = txt(row.label, headStyle);
    else if (row.label) {
      ws[`A${r + 1}`] = txt(row.label, labelStyle);
      if (row.f) ws[`B${r + 1}`] = { t: "n", f: row.f, v: 0, z: row.z, s: valueStyle };
      else if (typeof row.value === "number") ws[`B${r + 1}`] = { t: "n", v: row.value, z: row.z, s: valueStyle };
      else if (row.value != null) ws[`B${r + 1}`] = txt(String(row.value), valueStyle);
    }
    r += 1;
  }

  // جدول المجموعات
  const gHead = [
    i18n.t("stock.hCompany", "الشركة"),
    i18n.t("stock.hSection", "الصنف"),
    i18n.t("stock.gProducts", "منتجات"),
    i18n.t("stock.gUnits", "قطع"),
    i18n.t("stock.hCostValue", "قيمة الشراء"),
    i18n.t("stock.hRetailValue", "قيمة البيع"),
  ];
  const gHeadStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: INK } },
    alignment: { horizontal: "center", vertical: "center", readingOrder: 2 },
    border: { top: HEAD_BORDER, bottom: HEAD_BORDER, left: HEAD_BORDER, right: HEAD_BORDER },
  };
  const gCell = { alignment: { horizontal: "right", vertical: "center", readingOrder: 2 }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } };
  const gNum = { ...gCell, alignment: { horizontal: "center", vertical: "center" } };
  gHead.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r, c })] = txt(h, gHeadStyle); });
  r += 1;
  for (const g of take.groups) {
    ws[`A${r + 1}`] = txt(g.companyName, gCell);
    ws[`B${r + 1}`] = txt(g.sectionName, gCell);
    ws[`C${r + 1}`] = { t: "n", v: g.totals.products, z: "0", s: gNum };
    ws[`D${r + 1}`] = { t: "n", v: round4(g.totals.units), z: QTY, s: gNum };
    ws[`E${r + 1}`] = { t: "n", v: round4(g.totals.cost), z: MONEY, s: gNum };
    ws[`F${r + 1}`] = { t: "n", v: round4(g.totals.retail), z: MONEY, s: gNum };
    r += 1;
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 1) - 1, c: 5 } });
  ws["!views"] = [{ RTL: true }];
  ws["!cols"] = [{ wch: 42 }, { wch: 26 }, { wch: 11 }, { wch: 13 }, { wch: 18 }, { wch: 18 }];
  return ws;
}

/* ── ورقة التعليمات ─────────────────────────────────────────────────────── */
function guideSheet(XLSX: any): any {
  const L: [string, string][] = [
    [i18n.t("stock.gTitle", "كيف تستعمل هذا الملف"), ""],
    ["١", i18n.t("stock.g1", "اطبع «ورقة الجرد» أو افتحها على جهازٍ لوحي، وامشِ على الرفوف بترتيب الشركة والصنف كما هي مرتّبة.")],
    ["٢", i18n.t("stock.g2", "اكتب ما عددته بيدك في عمود «العدد الفعلي» الأصفر — وهو العمود الوحيد الذي تكتب فيه.")],
    ["٣", i18n.t("stock.g3", "عمودا «الفرق» و«قيمة الفرق» يُحسبان تلقائياً. السالب نقص، والموجب زيادة.")],
    ["٤", i18n.t("stock.g4", "ورقة «الملخّص» تجمع النتيجة وأنت تكتب: كم سطراً عُدّ، وكم بقي، وقيمة النقص والزيادة.")],
    ["٥", i18n.t("stock.g5", "الأسطر الزرقاء مخزونٌ مجمّع لصنفٍ كامل غير موزّع على الباركودات — قيمته تقديرية بمتوسط أسعار الصنف.")],
    ["", ""],
    [i18n.t("stock.gGuard", "ملاحظات تمنع الغلط"), ""],
    [i18n.t("stock.gkSnap", "اللقطة"), i18n.t("stock.gvSnap", "الأرقام هنا صورةٌ للمخزون بالساعة المكتوبة بأعلى الورقة. أي بيعٍ بعدها يظهر فرقاً سببه الوقت لا النقص — أوقف البيع أثناء الجرد أو اطرح مبيعات الفترة.")],
    [i18n.t("stock.gkBarcode", "الباركود"), i18n.t("stock.gvBarcode", "مكتوبٌ نصاً عمداً حتى لا يحوّله إكسل إلى صيغةٍ علمية ويأكل أصفار البداية. لا تغيّر تنسيق العمود إلى «رقم».")],
    [i18n.t("stock.gkPrices", "الأسعار"), i18n.t("stock.gvPrices", "مكتوبةٌ بقيمها الكاملة بلا تقريب — فقيمة الفرق تطابق الواقع بالفلس.")],
    [i18n.t("stock.gkId", "المعرّف"), i18n.t("stock.gvId", "العمود الأخير هو معرّف المنتج بالنظام. لا تعدّله؛ هو ما يطابق السطر بالمنتج حين يتشابه اسمان.")],
    [i18n.t("stock.gkFreeze", "التثبيت"), i18n.t("stock.gvFreeze", "لتثبيت صفّ العناوين أثناء التمرير: تبويب «عرض» ← «تجميد الأجزاء» ← «تجميد الصفوف العلوية».")],
  ];
  const ws: any = {};
  const head = { font: { bold: true, sz: 13, color: { rgb: INK } }, alignment: { horizontal: "right", readingOrder: 2 } };
  const key = { font: { bold: true, color: { rgb: "B45309" } }, alignment: { horizontal: "center", vertical: "top", readingOrder: 2 } };
  const body = { alignment: { horizontal: "right", vertical: "top", wrapText: true, readingOrder: 2 } };
  L.forEach(([k, v], i) => {
    if (!v && k) { ws[`A${i + 1}`] = { t: "s", v: k, s: head }; return; }
    if (!k && !v) return;
    ws[`A${i + 1}`] = { t: "s", v: k, s: key };
    ws[`B${i + 1}`] = { t: "s", v, s: body };
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: L.length - 1, c: 1 } });
  ws["!views"] = [{ RTL: true }];
  ws["!cols"] = [{ wch: 12 }, { wch: 110 }];
  return ws;
}

/** كسورٌ محفوظة بلا ضجيج عائم: 0.1+0.2 لا تُكتب 0.30000000000000004. */
const round4 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;
