import type { Purchase, PurchaseItem } from "@/types";
import { siteHost } from "@/lib/appUrl";

export interface PurchasePrintOptions {
  clinicName: string;
  clinicPhone?: string | null;
  brand?: string;
  lang: string;          // 'ar' | 'en' | ...
  currency?: string;     // e.g. "د.ع"
  logoUrl?: string | null;
  facebook?: string | null;
  instagram?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Short, human purchase number from the row id. */
export function purchaseNo(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `PUR-${tail}`;
}

function strings(lang: string) {
  const ar = lang.startsWith("ar");
  return {
    dir: ar ? "rtl" : "ltr",
    doc: ar ? "فاتورة شراء" : "PURCHASE",
    supplier: ar ? "المورّد" : "Supplier",
    noCompany: ar ? "بدون شركة" : "No company",
    ref: ar ? "رقم فاتورة المورّد" : "Supplier ref",
    date: ar ? "تاريخ الاستلام" : "Received",
    item: ar ? "الصنف" : "Item",
    qty: ar ? "الكمية" : "Qty",
    cost: ar ? "سعر الشراء" : "Unit cost",
    amount: ar ? "الإجمالي" : "Amount",
    total: ar ? "الإجمالي" : "Total",
    paid: ar ? "المدفوع" : "Paid",
    due: ar ? "المتبقّي (آجل)" : "Balance due",
    notes: ar ? "ملاحظات" : "Notes",
    status: ar ? "الحالة" : "Status",
    st: { paid: ar ? "مدفوعة" : "Paid", partial: ar ? "مدفوعة جزئياً" : "Partial", unpaid: ar ? "آجلة" : "On credit" } as Record<string, string>,
    receivedGoods: ar ? "سند استلام بضاعة" : "Goods received note",
  };
}

const FB_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
const IG_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="vpig2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><path fill="url(#vpig2)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.12 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="url(#vpig2)" d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle fill="url(#vpig2)" cx="18.41" cy="5.59" r="1.44"/></svg>`;

export function buildPurchaseHTML(purchase: Purchase, items: PurchaseItem[], opts: PurchasePrintOptions): string {
  const s = strings(opts.lang);
  const brand = esc(opts.brand || "doctorVet");
  const cur = ` ${esc(opts.currency ?? "د.ع")}`;
  const money = (n: number) => `${fmt(n)}${cur}`;
  const created = new Date(purchase.purchased_at || purchase.created_at);
  const dateStr = created.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const total = purchase.total ?? 0;
  const paid = purchase.amount_paid != null ? purchase.amount_paid : total;
  const due = Math.max(0, total - paid);
  const logo = opts.logoUrl ? esc(String(opts.logoUrl)) : "";
  const fb = (opts.facebook || "").trim();
  const ig = (opts.instagram || "").trim();
  const WEBSITE = siteHost();
  const socialIcons = (fb || ig)
    ? `<div class="socials">${fb ? `<span class="s">${FB_ICON}<span dir="ltr">${esc(fb)}</span></span>` : ""}${ig ? `<span class="s">${IG_ICON}<span dir="ltr">${esc(ig)}</span></span>` : ""}</div>`
    : "";

  const rows = items.map((it) => `<tr>
      <td class="i-name">${esc(it.name)}${it.barcode ? `<span class="i-bc">${esc(it.barcode)}</span>` : ""}</td>
      <td class="i-num">${it.qty}</td>
      <td class="i-num">${money(it.purchase_price)}</td>
      <td class="i-num i-amt">${money((it.qty || 0) * (it.purchase_price || 0))}</td>
    </tr>`).join("");

  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.5; padding: 16mm 14mm; position: relative; min-height: 255mm; }
    .sheet { max-width: 720px; margin: 0 auto; position: relative; z-index: 1; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; }
    .watermark img { width: 92%; max-width: 660px; filter: grayscale(100%); opacity: 0.12; transform: scale(1.85); }
    @media print { .watermark { display: flex !important; } .watermark img { opacity: 0.12 !important; } }
    .logo-mid { text-align: center; }
    .logo-mid img { max-height: 120px; max-width: 240px; object-fit: contain; }
    .socials { margin-top: 7px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #475569; }
    .socials .s { display: inline-flex; align-items: center; gap: 6px; }
    .page-footer { position: absolute; bottom: 8mm; left: 14mm; font-size: 11px; letter-spacing: .5px; color: #64748b; direction: ltr; z-index: 1; }
    .page-num { position: absolute; bottom: 8mm; right: 14mm; font-size: 11px; letter-spacing: .5px; color: #64748b; direction: ltr; z-index: 1; }
    .top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; border-bottom: 3px solid #1266d8; padding-bottom: 16px; }
    .party { min-width: 0; }
    .party.end { text-align: end; }
    .brand { font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #1266d8; margin-bottom: 2px; }
    .clinic { font-size: 22px; font-weight: 800; color: #0b1220; letter-spacing: -.3px; }
    .muted { color: #64748b; font-size: 12px; }
    .doc-title { font-size: 26px; font-weight: 800; color: #1266d8; letter-spacing: 1px; }
    .doc-no { font-size: 12px; color: #475569; margin-top: 2px; }
    .doc-sub { font-size: 11px; color: #94a3b8; margin-top: 1px; }
    .grid { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0; }
    .grid h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; }
    .grid .v { font-weight: 600; }
    .pill { display: inline-block; font-weight: 700; font-size: 11px; border-radius: 999px; padding: 2px 10px; }
    .pill.paid { background: #dcfce7; color: #15803d; }
    .pill.partial { background: #fef3c7; color: #b45309; }
    .pill.unpaid { background: #fee2e2; color: #b91c1c; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; text-align: start; padding: 9px 12px; }
    thead th.i-num { text-align: end; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #e8edf3; }
    .i-num { text-align: end; white-space: nowrap; }
    .i-amt { font-weight: 700; }
    .i-name { font-weight: 600; }
    .i-bc { display: block; font-size: 10px; color: #94a3b8; font-family: ui-monospace, monospace; font-weight: 400; }
    .totals { margin-top: 16px; margin-inline-start: auto; width: 280px; }
    .totals .row { display: flex; justify-content: space-between; padding: 5px 0; color: #475569; }
    .totals .grand { font-size: 18px; font-weight: 800; color: #0b1220; border-top: 2px solid #0b1220; margin-top: 6px; padding-top: 8px; }
    .totals .due { color: #b91c1c; font-weight: 700; }
    .foot { margin-top: 28px; text-align: center; color: #64748b; border-top: 1px solid #e8edf3; padding-top: 14px; }
  `;

  const st = purchase.status ?? (paid >= total ? "paid" : paid <= 0 ? "unpaid" : "partial");

  const body = `
    ${logo ? `<div class="watermark"><img src="${logo}" alt=""/></div>` : ""}
    <div class="page-footer">${WEBSITE}</div>
    <div class="page-num">1 / 1</div>
    <div class="sheet">
      <div class="top">
        <div class="party">
          <div class="brand">${brand}</div>
          <div class="clinic">${esc(opts.clinicName)}</div>
          ${opts.clinicPhone ? `<div class="muted" dir="ltr">${esc(opts.clinicPhone)}</div>` : ""}
          ${socialIcons}
        </div>
        ${logo ? `<div class="logo-mid"><img src="${logo}" alt="logo"/></div>` : `<div></div>`}
        <div class="party end">
          <div class="doc-title">${s.doc}</div>
          <div class="doc-no">${esc(purchaseNo(purchase.id))}</div>
          <div class="doc-sub">${s.receivedGoods}</div>
        </div>
      </div>

      <div class="grid">
        <div>
          <h4>${s.supplier}</h4>
          <div class="v">${esc(purchase.company_name || s.noCompany)}</div>
          ${purchase.reference ? `<div class="muted" dir="ltr">${s.ref}: ${esc(purchase.reference)}</div>` : ""}
        </div>
        <div style="text-align:end">
          <h4>${s.date}</h4>
          <div class="v">${esc(dateStr)}</div>
          <div style="margin-top:8px"><span class="pill ${st}">${s.st[st] ?? st}</span></div>
        </div>
      </div>

      <table>
        <thead><tr><th>${s.item}</th><th class="i-num">${s.qty}</th><th class="i-num">${s.cost}</th><th class="i-num">${s.amount}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="totals">
        <div class="row grand"><span>${s.total}</span><span>${money(total)}</span></div>
        <div class="row"><span>${s.paid}</span><span>${money(paid)}</span></div>
        ${due > 0 ? `<div class="row due"><span>${s.due}</span><span>${money(due)}</span></div>` : ""}
      </div>

      ${purchase.notes ? `<div style="margin-top:14px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;text-align:start"><strong>${s.notes}:</strong> ${esc(purchase.notes)}</div>` : ""}

      <div class="foot">${esc(opts.clinicName)} · ${WEBSITE}</div>
    </div>
  `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/>
    <title>${esc(purchaseNo(purchase.id))}</title>
    <style>@page { size: A4; margin: 0; } ${css}</style></head>
    <body>${body}
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
    </body></html>`;
}

export function openPurchasePrint(purchase: Purchase, items: PurchaseItem[], opts: PurchasePrintOptions): boolean {
  const html = buildPurchaseHTML(purchase, items, opts);
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
