import type { Invoice, InvoiceItem } from "@/types";

export type PrintFormat = "a4" | "thermal";

export interface InvoicePrintOptions {
  clinicName: string;
  clinicPhone?: string | null;
  /** Platform brand shown as an eyebrow above the clinic name (default "doctorVet"). */
  brand?: string;
  format: PrintFormat;
  lang: string; // 'ar' | 'en' | ...
  currency?: string; // optional label, e.g. "IQD"
  /** Sequence number to show as "Print #N" (already incremented). */
  printNo?: number;
  /** Clinic logo (data-URL) — shown centered at the top + as a faint watermark. */
  logoUrl?: string | null;
  /** Social handles printed in the footer. */
  facebook?: string | null;
  instagram?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// IQD: whole numbers with thousands separators, always Western numerals.
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Short, human invoice number from the row id (last 6 chars, upper). */
export function invoiceNo(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `INV-${tail}`;
}

function strings(lang: string) {
  const ar = lang.startsWith("ar");
  return {
    dir: ar ? "rtl" : "ltr",
    invoice: ar ? "فاتورة" : "INVOICE",
    receipt: ar ? "إيصال بيع" : "Sales Receipt",
    date: ar ? "التاريخ" : "Date",
    billedTo: ar ? "العميل" : "Billed to",
    walkIn: ar ? "عميل نقدي" : "Walk-in customer",
    phone: ar ? "الهاتف" : "Phone",
    pet: ar ? "الحيوان" : "Patient",
    item: ar ? "الصنف" : "Item",
    qty: ar ? "الكمية" : "Qty",
    price: ar ? "السعر" : "Price",
    amount: ar ? "الإجمالي" : "Amount",
    subtotal: ar ? "المجموع الفرعي" : "Subtotal",
    discount: ar ? "الخصم" : "Discount",
    total: ar ? "الإجمالي" : "Total",
    payment: ar ? "طريقة الدفع" : "Payment",
    pay: { cash: ar ? "نقداً" : "Cash", card: ar ? "بطاقة" : "Card", transfer: ar ? "تحويل" : "Transfer" } as Record<string, string>,
    items: ar ? "الأصناف" : "Items",
    thanks: ar ? "شكراً لزيارتكم! 🐾" : "Thank you for your visit! 🐾",
    refunded: ar ? "مُرجعة" : "REFUNDED",
    printNo: ar ? "نسخة الطباعة رقم" : "Print",
  };
}

/** Build a fully self-contained printable HTML document for an invoice. */
export function buildInvoiceHTML(invoice: Invoice, items: InvoiceItem[], opts: InvoicePrintOptions): string {
  const s = strings(opts.lang);
  const brand = esc(opts.brand || "doctorVet");
  // Default to Iraqi Dinar; caller may override with another label.
  const cur = ` ${esc(opts.currency ?? "د.ع")}`;
  const money = (n: number) => `${fmt(n)}${cur}`;
  const created = new Date(invoice.created_at);
  // Always en-GB so the printed date uses Western numerals (per the strict rule).
  const dateStr = created.toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const subtotal = invoice.subtotal ?? invoice.total;
  const discount = invoice.discount ?? 0;
  const refunded = invoice.status === "refunded";
  const payLabel = invoice.payment_method ? s.pay[invoice.payment_method] ?? invoice.payment_method : "";
  // Phone numbers must read LTR (+964 …) even inside an RTL document.
  const phoneHTML = (p: string) => `<span dir="ltr" style="unicode-bidi:isolate; direction:ltr">${esc(p)}</span>`;
  const logo = opts.logoUrl ? String(opts.logoUrl) : "";
  const fb = (opts.facebook || "").trim();
  const ig = (opts.instagram || "").trim();
  const WEBSITE = "doctorvet.doctor";
  // Real, colored brand logos (inline SVG so they print without external assets).
  const FB_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
  const IG_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="vpig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><path fill="url(#vpig)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.12 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="url(#vpig)" d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle fill="url(#vpig)" cx="18.41" cy="5.59" r="1.44"/></svg>`;
  // A4: colored social logos shown UNDER the phone (in the clinic block).
  const socialIcons = (fb || ig)
    ? `<div class="socials">${fb ? `<span class="s">${FB_ICON}<span dir="ltr">${esc(fb)}</span></span>` : ""}${ig ? `<span class="s">${IG_ICON}<span dir="ltr">${esc(ig)}</span></span>` : ""}</div>`
    : "";
  // Thermal: plain text (icons too small to read on a 80mm receipt).
  const socialText = [fb ? `FB ${esc(fb)}` : "", ig ? `IG ${esc(ig)}` : ""].filter(Boolean).join("  ·  ");

  const rows = items
    .map(
      (it) => `<tr>
        <td class="i-name">${esc(it.name)}${it.barcode ? `<span class="i-bc">${esc(it.barcode)}</span>` : ""}</td>
        <td class="i-num">${it.qty}</td>
        <td class="i-num">${money(it.unit_price)}</td>
        <td class="i-num i-amt">${money(it.line_total)}</td>
      </tr>`,
    )
    .join("");

  const thermal = opts.format === "thermal";
  // margin:0 makes Chrome/Edge DROP the browser's own header/footer (date, the
  // "about:blank" URL, page numbers); the page padding is restored on .sheet/body.
  const page = thermal ? "@page { size: 80mm auto; margin: 0; }" : "@page { size: A4; margin: 0; }";

  // Two visual themes share the same markup; CSS differs by format.
  const css = thermal
    ? `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { width: 80mm; font-family: 'Menlo','Consolas',ui-monospace,monospace; font-size: 11px; color: #000; padding: 6px 7px 14px; }
    .head { text-align: center; }
    .brand { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
    .clinic { font-size: 14px; font-weight: 700; letter-spacing: .3px; }
    .muted { color: #333; font-size: 10px; }
    .doc { font-weight: 700; margin-top: 4px; font-size: 12px; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .meta { font-size: 10px; line-height: 1.5; }
    .meta b { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { text-align: start; font-size: 9px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 2px 0; }
    td { padding: 2px 0; vertical-align: top; font-size: 10px; }
    .i-num { text-align: end; white-space: nowrap; padding-inline-start: 4px; }
    .i-name { word-break: break-word; }
    .i-bc { display: block; font-size: 8px; color: #555; }
    .totals { margin-top: 2px; font-size: 11px; }
    .totals .row { display: flex; justify-content: space-between; padding: 1px 0; }
    .totals .grand { font-weight: 700; font-size: 13px; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; }
    .thanks { text-align: center; margin-top: 8px; font-size: 10px; }
    .social { text-align: center; font-size: 9px; color: #333; margin-top: 3px; display: flex; gap: 8px; justify-content: center; }
    .site { text-align: center; font-size: 8px; color: #555; margin-top: 3px; letter-spacing: .5px; }
    .badge { text-align: center; font-weight: 700; border: 1px solid #000; padding: 2px; margin: 4px 0; letter-spacing: 1px; }
    `
    : `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.5; padding: 16mm 14mm; position: relative; min-height: 255mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: 720px; margin: 0 auto; position: relative; z-index: 1; }
    /* Faint, decolorised logo watermark centered on the page. position:absolute
       (anchored to the page-filling body) prints reliably across browsers — unlike
       position:fixed, which Chrome/Firefox/Safari render inconsistently in print. */
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; }
    .watermark img { width: 92%; max-width: 660px; filter: grayscale(100%); opacity: 0.09; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .logo-top { text-align: center; margin: 6px 0 18px; }
    .logo-top img { max-height: 96px; max-width: 280px; object-fit: contain; }
    .socials { margin-top: 7px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #475569; }
    .socials .s { display: inline-flex; align-items: center; gap: 6px; }
    .socials svg { flex: 0 0 auto; }
    .site { margin-top: 8px; font-size: 10px; letter-spacing: .5px; color: #94a3b8; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1266d8; padding-bottom: 16px; }
    .brand { font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #1266d8; margin-bottom: 2px; }
    .clinic { font-size: 22px; font-weight: 800; color: #0b1220; letter-spacing: -.3px; }
    .muted { color: #64748b; font-size: 12px; }
    .doc-title { font-size: 26px; font-weight: 800; color: #1266d8; letter-spacing: 1px; }
    .doc-no { font-size: 12px; color: #475569; margin-top: 2px; }
    .grid { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0; }
    .grid h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; }
    .grid .v { font-weight: 600; }
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
    .disc { color: #16a34a; }
    .foot { margin-top: 28px; text-align: center; color: #64748b; border-top: 1px solid #e8edf3; padding-top: 14px; }
    .badge { display: inline-block; font-weight: 800; color: #dc2626; border: 2px solid #dc2626; border-radius: 8px; padding: 4px 12px; letter-spacing: 2px; transform: rotate(-3deg); }
    `;

  const body = thermal
    ? `
    <div class="head">
      ${logo ? `<img src="${logo}" alt="logo" style="max-height:48px;max-width:70%;object-fit:contain;filter:grayscale(100%);margin:0 auto 4px;display:block;"/>` : ""}
      <div class="brand">${brand}</div>
      <div class="clinic">${esc(opts.clinicName)}</div>
      ${opts.clinicPhone ? `<div class="muted">${phoneHTML(opts.clinicPhone)}</div>` : ""}
      <div class="doc">${s.receipt}</div>
    </div>
    <hr/>
    <div class="meta">
      <div><b>${esc(invoiceNo(invoice.id))}</b></div>
      <div>${s.date}: ${esc(dateStr)}</div>
      ${invoice.customer_name || invoice.customer_phone ? `<div>${s.billedTo}: ${esc(invoice.customer_name || s.walkIn)}</div>` : ""}
      ${invoice.pet_name ? `<div>${s.pet}: ${esc(invoice.pet_name)}</div>` : ""}
      ${invoice.customer_phone ? `<div>${s.phone}: ${phoneHTML(invoice.customer_phone)}</div>` : ""}
    </div>
    ${refunded ? `<div class="badge">${s.refunded}</div>` : ""}
    <table>
      <thead><tr><th>${s.item}</th><th class="i-num">${s.qty}</th><th class="i-num">${s.price}</th><th class="i-num">${s.amount}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      ${discount > 0 ? `<div class="row"><span>${s.subtotal}</span><span>${money(subtotal)}</span></div><div class="row"><span>${s.discount}</span><span>-${money(discount)}</span></div>` : ""}
      <div class="row grand"><span>${s.total}</span><span>${money(invoice.total)}</span></div>
      ${payLabel ? `<div class="row"><span>${s.payment}</span><span>${esc(payLabel)}</span></div>` : ""}
    </div>
    <div class="thanks">${s.thanks}</div>
    ${socialText ? `<div class="social">${socialText}</div>` : ""}
    <div class="site">${WEBSITE}</div>
    ${opts.printNo && opts.printNo > 1 ? `<div class="thanks">${s.printNo} #${opts.printNo}</div>` : ""}
    `
    : `
    ${logo ? `<div class="watermark"><img src="${logo}" alt=""/></div>` : ""}
    <div class="sheet">
      ${logo ? `<div class="logo-top"><img src="${logo}" alt="logo"/></div>` : ""}
      <div class="top">
        <div>
          <div class="brand">${brand}</div>
          <div class="clinic">${esc(opts.clinicName)}</div>
          ${opts.clinicPhone ? `<div class="muted">${s.phone}: ${phoneHTML(opts.clinicPhone)}</div>` : ""}
          ${socialIcons}
        </div>
        <div style="text-align:end">
          <div class="doc-title">${s.invoice}</div>
          <div class="doc-no">${esc(invoiceNo(invoice.id))}</div>
          ${opts.printNo && opts.printNo > 1 ? `<div class="doc-no">${s.printNo} #${opts.printNo}</div>` : ""}
        </div>
      </div>

      <div class="grid">
        <div>
          <h4>${s.billedTo}</h4>
          <div class="v">${esc(invoice.customer_name || s.walkIn)}</div>
          ${invoice.pet_name ? `<div class="muted">${s.pet}: ${esc(invoice.pet_name)}</div>` : ""}
          ${invoice.customer_phone ? `<div class="muted">${s.phone}: ${phoneHTML(invoice.customer_phone)}</div>` : ""}
        </div>
        <div style="text-align:end">
          <h4>${s.date}</h4>
          <div class="v">${esc(dateStr)}</div>
          ${payLabel ? `<div class="muted">${s.payment}: ${esc(payLabel)}</div>` : ""}
          ${refunded ? `<div style="margin-top:8px"><span class="badge">${s.refunded}</span></div>` : ""}
        </div>
      </div>

      <table>
        <thead><tr><th>${s.item}</th><th class="i-num">${s.qty}</th><th class="i-num">${s.price}</th><th class="i-num">${s.amount}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="totals">
        ${discount > 0 ? `<div class="row"><span>${s.subtotal}</span><span>${money(subtotal)}</span></div><div class="row disc"><span>${s.discount}${invoice.discount_type === "percent" ? "" : ""}</span><span>-${money(discount)}</span></div>` : ""}
        <div class="row grand"><span>${s.total}</span><span>${money(invoice.total)}</span></div>
      </div>

      <div class="foot">${s.thanks}<div class="site">${WEBSITE}</div></div>
    </div>
    `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/>
    <title>${esc(invoiceNo(invoice.id))}</title>
    <style>${page} ${css}</style></head>
    <body>${body}
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
    </body></html>`;
}

/** Open the invoice in a fresh window/tab and trigger the print dialog. */
export function openInvoicePrint(invoice: Invoice, items: InvoiceItem[], opts: InvoicePrintOptions): boolean {
  const html = buildInvoiceHTML(invoice, items, opts);
  const w = window.open("", "_blank", opts.format === "thermal" ? "width=380,height=640" : "width=820,height=920");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
