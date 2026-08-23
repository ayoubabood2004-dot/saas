// ============================================================================
// Full stock-count report (تقرير جرد المخزون) — printable A4.
//
// Grouped the way the clinic organized its inventory: Company → Section →
// barcodes, then a "بدون شركة" group. Every line shows the SYSTEM count plus a
// BLANK "العدد الفعلي" column and a "الفرق" column — the sheet doubles as a real
// physical stock-take form the staff fills by pen, with signature boxes at the
// end. Pooled (legacy) section stock appears as its own highlighted row and is
// valued exactly like قيمة المخزون (average price of the section's barcodes),
// so the report's totals always match the on-screen card.
//
// الحساب نفسه ليس هنا: هو في `stocktake.ts` يتقاسمه هذا المخرج ومخرج الإكسل.
// وهذه الوحدة **تعرض** ما حُسب هناك ولا تحسب — فالورقتان لا تفترقان أبداً.
// ============================================================================
import type { Product, Company, CompanySection } from "@/types";
import { getClinicName, getClinicLogo } from "./settings";
import { money } from "./utils";
import { buildStocktake, flagsText, type StocktakeLine } from "./stocktake";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));

export function buildStockReportHTML(products: Product[], companies: Company[], sections: CompanySection[]): string {
  const clinic = getClinicName() || "doctorVet";
  const logo = getClinicLogo();
  const now = new Date();
  const stamp = now.toLocaleDateString("ar-IQ", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
    " · " + now.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });

  const take = buildStocktake(products, companies, sections, now);

  const rowFor = (l: StocktakeLine): string => {
    const isPool = l.kind === "pool";
    const approx = isPool ? "≈" : "";
    return `<tr${isPool ? ' class="pool"' : ""}>
      <td class="c">${isPool ? "—" : l.seq}</td>
      <td class="mono">${esc(l.barcode ?? "—")}</td>
      <td class="name">${esc(l.name)}</td>
      <td class="c">${approx}${money(l.buy)}</td>
      <td class="c">${approx}${money(l.sell)}</td>
      <td class="c qty">${!isPool && l.flags.includes("pooled") ? "مجمّع" : fmtQty(l.systemQty)}</td>
      <td class="c">${approx}${money(l.cost)}</td>
      <td class="blank"></td>
      <td class="blank"></td>
      <td class="note">${esc(isPool ? "تقديري بمتوسط أسعار الصنف" : flagsText(l.flags))}</td>
    </tr>`;
  };

  const tableHead = `<thead><tr>
    <th class="c">#</th><th>الباركود</th><th>المنتج</th><th class="c">شراء</th><th class="c">بيع</th>
    <th class="c">العدد بالنظام</th><th class="c">القيمة (شراء)</th>
    <th class="c wide">العدد الفعلي</th><th class="c wide">الفرق</th><th>ملاحظات</th>
  </tr></thead>`;

  const blocks = take.groups.map((g) => `
    <section class="grp">
      <div class="gh"><span class="gt">${esc(g.companyName)}</span>${g.sectionName ? `<span class="gs">${esc(g.sectionName)}</span>` : ""}
        <span class="gsum">${g.totals.products} منتج · ${fmtQty(g.totals.units)} قطعة · ${money(g.totals.cost)}</span></div>
      <table>${tableHead}<tbody>${g.lines.map(rowFor).join("")}</tbody></table>
    </section>`).join("");

  const { totals, pooled } = take;

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير جرد المخزون — ${esc(clinic)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #0f172a; font-size: 11px; }
  .head { display: flex; align-items: center; gap: 10px; border-bottom: 2.5px solid #0f172a; padding-bottom: 8px; }
  .head img { height: 44px; width: 44px; object-fit: contain; border-radius: 8px; }
  .head .c1 { font-size: 17px; font-weight: 800; }
  .head .c2 { font-size: 11px; color: #475569; }
  .head .when { margin-inline-start: auto; text-align: left; font-size: 10px; color: #475569; }
  .kpis { display: flex; gap: 8px; margin: 10px 0; }
  .kpi { flex: 1; border: 1px solid #cbd5e1; border-radius: 10px; padding: 7px 10px; }
  .kpi b { display: block; font-size: 14px; }
  .kpi span { font-size: 9.5px; color: #64748b; }
  .grp { margin-top: 12px; break-inside: avoid-page; }
  .gh { display: flex; align-items: baseline; gap: 8px; background: #0f172a; color: #fff; border-radius: 8px 8px 0 0; padding: 6px 10px; }
  .gt { font-weight: 800; font-size: 12.5px; }
  .gs { font-size: 11px; opacity: .85; }
  .gsum { margin-inline-start: auto; font-size: 10px; opacity: .9; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 6px; font-size: 10px; color: #334155; }
  td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: middle; }
  td.c, th.c { text-align: center; }
  td.mono { font-family: ui-monospace, Consolas, monospace; direction: ltr; text-align: center; font-size: 10px; }
  td.name { font-weight: 600; }
  td.qty { font-weight: 800; font-size: 12px; }
  td.blank { background: #fafafa; min-width: 52px; }
  th.wide { min-width: 56px; }
  td.note { color: #b45309; font-size: 9.5px; }
  tr.pool td { background: #eff6ff; color: #1e40af; }
  tr.pool td.name { font-weight: 700; }
  .totals { margin-top: 14px; border: 2px solid #0f172a; border-radius: 10px; overflow: hidden; break-inside: avoid; }
  .totals .line { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  .totals .big { background: #0f172a; color: #fff; font-weight: 800; font-size: 14px; padding: 9px 12px; display: flex; justify-content: space-between; }
  .sig { margin-top: 22px; display: flex; gap: 28px; break-inside: avoid; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 10.5px; color: #475569; }
  .foot { margin-top: 12px; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; }
</style></head><body onload="setTimeout(function(){window.print()},200)">
  <div class="head">
    ${logo ? `<img src="${logo}" alt="">` : ""}
    <div><div class="c1">${esc(clinic)}</div><div class="c2">تقرير جرد المخزون الكامل — يُستخدم للمطابقة الفعلية (عمود «العدد الفعلي» يُملأ يدوياً)</div></div>
    <div class="when">${esc(stamp)}</div>
  </div>

  <div class="kpis">
    <div class="kpi"><b>${totals.products}</b><span>عدد المنتجات</span></div>
    <div class="kpi"><b>${fmtQty(totals.units)}</b><span>إجمالي القطع (مع المجمّع)</span></div>
    <div class="kpi"><b>${money(Math.round(totals.cost))}</b><span>رأس المال (شراء)</span></div>
    <div class="kpi"><b>${money(Math.round(totals.retail))}</b><span>قيمة البيع</span></div>
    <div class="kpi"><b>${money(Math.round(totals.retail - totals.cost))}</b><span>الربح المتوقع</span></div>
  </div>

  ${blocks}

  <div class="totals">
    <div class="line"><span>عدد المنتجات</span><span>${totals.products}</span></div>
    <div class="line"><span>إجمالي القطع (مع المخزون المجمّع)</span><span>${fmtQty(totals.units)}</span></div>
    ${pooled.cost > 0 ? `<div class="line"><span>منها تقديري (مخزون مجمّع)</span><span>≈${money(Math.round(pooled.cost))} شراء · ≈${money(Math.round(pooled.retail))} بيع</span></div>` : ""}
    <div class="line"><span>قيمة البيع الكاملة</span><span>${money(Math.round(totals.retail))}</span></div>
    <div class="big"><span>رأس المال الكلي (شراء)</span><span>${money(Math.round(totals.cost))}</span></div>
  </div>

  <div class="sig"><div>أمين المخزن</div><div>من قام بالجرد</div><div>مدير العيادة</div></div>
  <div class="foot"><span>${esc(stamp)}</span><span>doctorVet</span></div>
</body></html>`;
}

export function openStockReport(products: Product[], companies: Company[], sections: CompanySection[]): boolean {
  const html = buildStockReportHTML(products, companies, sections);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
