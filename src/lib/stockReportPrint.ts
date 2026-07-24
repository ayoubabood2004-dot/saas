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
// ============================================================================
import type { Product, Company, CompanySection } from "@/types";
import { getClinicName, getClinicLogo } from "./settings";
import { money } from "./utils";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LOW_STOCK = 5;
const lowThreshold = (p: Product) => (p.min_stock && p.min_stock > 0 ? p.min_stock : LOW_STOCK);
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));

interface Totals { count: number; units: number; cost: number; retail: number }

export function buildStockReportHTML(products: Product[], companies: Company[], sections: CompanySection[]): string {
  const clinic = getClinicName() || "doctorVet";
  const logo = getClinicLogo();
  const now = new Date();
  const stamp = now.toLocaleDateString("ar-IQ", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
    " · " + now.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });

  const today = new Date().toISOString().slice(0, 10);
  const noteOf = (p: Product): string => {
    const notes: string[] = [];
    if (p.pooled) notes.push("مجمّع");
    else if ((p.stock || 0) <= 0) notes.push("نافد");
    else if ((p.stock || 0) <= lowThreshold(p)) notes.push("منخفض");
    if (p.expiry_date) {
      if (p.expiry_date.slice(0, 10) < today) notes.push("منتهي الصلاحية");
      else {
        const d = Math.floor((new Date(p.expiry_date).getTime() - now.getTime()) / 86400000);
        if (d <= 30) notes.push("قرب الانتهاء");
      }
    }
    return notes.join(" · ");
  };

  let seq = 0;
  const grand: Totals = { count: 0, units: 0, cost: 0, retail: 0 };
  let pooledCostAll = 0, pooledRetailAll = 0;

  const rowsFor = (list: Product[], sub: Totals): string =>
    list.map((p) => {
      seq += 1;
      const qty = p.pooled ? 0 : (p.stock || 0);
      const cost = qty * (p.purchase_price || 0);
      const retail = qty * (p.sell_price || 0);
      sub.count += 1; sub.units += qty; sub.cost += cost; sub.retail += retail;
      grand.count += 1; grand.units += qty; grand.cost += cost; grand.retail += retail;
      const note = noteOf(p);
      return `<tr>
        <td class="c">${seq}</td>
        <td class="mono">${esc(p.barcode ?? "—")}</td>
        <td class="name">${esc(p.name)}</td>
        <td class="c">${money(p.purchase_price || 0)}</td>
        <td class="c">${money(p.sell_price || 0)}</td>
        <td class="c qty">${p.pooled ? "مجمّع" : fmtQty(qty)}</td>
        <td class="c">${money(cost)}</td>
        <td class="blank"></td>
        <td class="blank"></td>
        <td class="note">${esc(note)}</td>
      </tr>`;
    }).join("");

  /** The pooled (undistributed) stock of a section as its own count line. */
  const poolRow = (sec: CompanySection, inSec: Product[], sub: Totals): string => {
    const pool = sec.pooled_stock || 0;
    if (pool <= 0 || inSec.length === 0) return "";
    const avgBuy = inSec.reduce((s, p) => s + (p.purchase_price || 0), 0) / inSec.length;
    const avgSell = inSec.reduce((s, p) => s + (p.sell_price || 0), 0) / inSec.length;
    const cost = pool * avgBuy;
    sub.units += pool; sub.cost += cost;
    grand.units += pool; grand.cost += cost; grand.retail += pool * avgSell;
    pooledCostAll += cost; pooledRetailAll += pool * avgSell;
    return `<tr class="pool">
      <td class="c">—</td>
      <td class="mono">—</td>
      <td class="name">مخزون مجمّع للصنف (غير موزّع على الباركودات)</td>
      <td class="c">≈${money(avgBuy)}</td>
      <td class="c">≈${money(avgSell)}</td>
      <td class="c qty">${fmtQty(pool)}</td>
      <td class="c">≈${money(cost)}</td>
      <td class="blank"></td>
      <td class="blank"></td>
      <td class="note">تقديري بمتوسط أسعار الصنف</td>
    </tr>`;
  };

  const tableHead = `<thead><tr>
    <th class="c">#</th><th>الباركود</th><th>المنتج</th><th class="c">شراء</th><th class="c">بيع</th>
    <th class="c">العدد بالنظام</th><th class="c">القيمة (شراء)</th>
    <th class="c wide">العدد الفعلي</th><th class="c wide">الفرق</th><th>ملاحظات</th>
  </tr></thead>`;

  const groupBlock = (title: string, subtitle: string, body: string, sub: Totals): string => `
    <section class="grp">
      <div class="gh"><span class="gt">${esc(title)}</span>${subtitle ? `<span class="gs">${esc(subtitle)}</span>` : ""}
        <span class="gsum">${sub.count} منتج · ${fmtQty(sub.units)} قطعة · ${money(sub.cost)}</span></div>
      <table>${tableHead}<tbody>${body}</tbody></table>
    </section>`;

  const blocks: string[] = [];
  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name));
  for (const co of sorted) {
    const mine = products.filter((p) => p.company_id === co.id);
    const coSections = sections.filter((s) => s.company_id === co.id).sort((a, b) => a.name.localeCompare(b.name));
    if (mine.length === 0 && !coSections.some((s) => (s.pooled_stock || 0) > 0)) continue;
    for (const sec of coSections) {
      const inSec = mine.filter((p) => p.section_id === sec.id).sort((a, b) => a.name.localeCompare(b.name));
      if (inSec.length === 0 && (sec.pooled_stock || 0) <= 0) continue;
      const sub: Totals = { count: 0, units: 0, cost: 0, retail: 0 };
      const body = rowsFor(inSec, sub) + poolRow(sec, inSec, sub);
      blocks.push(groupBlock(co.name, sec.name, body, sub));
    }
    const loose = mine.filter((p) => !p.section_id).sort((a, b) => a.name.localeCompare(b.name));
    if (loose.length) {
      const sub: Totals = { count: 0, units: 0, cost: 0, retail: 0 };
      blocks.push(groupBlock(co.name, "بدون صنف", rowsFor(loose, sub), sub));
    }
  }
  const unfiled = products.filter((p) => !p.company_id).sort((a, b) => a.name.localeCompare(b.name));
  if (unfiled.length) {
    const sub: Totals = { count: 0, units: 0, cost: 0, retail: 0 };
    blocks.push(groupBlock("بدون شركة", "", rowsFor(unfiled, sub), sub));
  }

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
    <div class="kpi"><b>${grand.count}</b><span>عدد المنتجات</span></div>
    <div class="kpi"><b>${fmtQty(grand.units)}</b><span>إجمالي القطع (مع المجمّع)</span></div>
    <div class="kpi"><b>${money(Math.round(grand.cost))}</b><span>رأس المال (شراء)</span></div>
    <div class="kpi"><b>${money(Math.round(grand.retail))}</b><span>قيمة البيع</span></div>
    <div class="kpi"><b>${money(Math.round(grand.retail - grand.cost))}</b><span>الربح المتوقع</span></div>
  </div>

  ${blocks.join("")}

  <div class="totals">
    <div class="line"><span>عدد المنتجات</span><span>${grand.count}</span></div>
    <div class="line"><span>إجمالي القطع (مع المخزون المجمّع)</span><span>${fmtQty(grand.units)}</span></div>
    ${pooledCostAll > 0 ? `<div class="line"><span>منها تقديري (مخزون مجمّع)</span><span>≈${money(Math.round(pooledCostAll))} شراء · ≈${money(Math.round(pooledRetailAll))} بيع</span></div>` : ""}
    <div class="line"><span>قيمة البيع الكاملة</span><span>${money(Math.round(grand.retail))}</span></div>
    <div class="big"><span>رأس المال الكلي (شراء)</span><span>${money(Math.round(grand.cost))}</span></div>
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
