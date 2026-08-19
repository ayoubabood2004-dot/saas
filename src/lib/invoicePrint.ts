import type { Invoice, InvoiceItem } from "@/types";
import { siteHost } from "@/lib/appUrl";
import { getReceiptWidth } from "@/lib/printer";
import { currencySymbol } from "@/lib/utils";

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
  /** Pro-forma print BEFORE the sale is completed: shows a "قبل البيع" badge
   *  instead of an invoice number (the invoice doesn't exist yet). */
  preSale?: boolean;
  /** اسم موظف المبيعات (البائع) — يُطبع على الفاتورة حتى يُعرف منو باعها. */
  sellerName?: string | null;
  /** رمز QR جاهز (data-URL) — يُطبع بذيل إيصال ٨٠مم للتواصل مع العيادة. */
  qrDataUrl?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// IQD: whole numbers with thousands separators, always Western numerals.
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** مبلغ معزول اتجاهياً: بدونه تنقلب إشارة السالب لآخر الرقم داخل مستند RTL
 *  («2,000-» بدل «-2,000») — وهذا ظهر فعلياً على إيصالات مطبوعة. */
const ltr = (s: string) => `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr">${s}</span>`;

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
    seller: ar ? "البائع" : "Sold by",
    notes: ar ? "ملاحظات" : "Notes",
    item: ar ? "الصنف" : "Item",
    qty: ar ? "الكمية" : "Qty",
    price: ar ? "السعر" : "Price",
    amount: ar ? "الإجمالي" : "Amount",
    subtotal: ar ? "المجموع الفرعي" : "Subtotal",
    discount: ar ? "الخصم" : "Discount",
    total: ar ? "الإجمالي" : "Total",
    payment: ar ? "طريقة الدفع" : "Payment",
    paid: ar ? "المدفوع" : "Paid",
    due: ar ? "المتبقّي (آجل)" : "Balance due",
    pay: { cash: ar ? "نقداً" : "Cash", card: ar ? "بطاقة" : "Card", transfer: ar ? "تحويل" : "Transfer" } as Record<string, string>,
    items: ar ? "الأصناف" : "Items",
    thanks: ar ? "شكراً لزيارتكم! 🐾" : "Thank you for your visit! 🐾",
    scanUs: ar ? "امسح للتواصل معنا" : "Scan to reach us",
    refunded: ar ? "مُرجعة" : "REFUNDED",
    preSale: ar ? "فاتورة أولية — قبل إتمام البيع" : "PRO-FORMA — NOT A RECEIPT",
    printNo: ar ? "نسخة الطباعة رقم" : "Print",
  };
}

/** Build a fully self-contained printable HTML document for an invoice. */
export function buildInvoiceHTML(invoice: Invoice, items: InvoiceItem[], opts: InvoicePrintOptions): string {
  const s = strings(opts.lang);
  const brand = esc(opts.brand || "doctorVet");
  // Default to Iraqi Dinar; caller may override with another label.
  const cur = ` ${esc(opts.currency ?? currencySymbol())}`;
  const money = (n: number) => ltr(`${fmt(n)}${cur}`);
  /** مبلغ سالب (خصم) — الإشارة تبقى يسار الرقم داخل المستند العربي. */
  const moneyNeg = (n: number) => ltr(`−${fmt(n)}${cur}`);
  const created = new Date(invoice.created_at);
  // Always en-GB so the printed date uses Western numerals (per the strict rule).
  const dateStr = created.toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const subtotal = invoice.subtotal ?? invoice.total;
  const discount = invoice.discount ?? 0;
  const refunded = invoice.status === "refunded";
  // Pro-forma: no real invoice row exists yet, so hide the invoice number and
  // stamp a badge instead — the customer must not mistake it for a receipt.
  const preSale = !!opts.preSale;
  const payLabel = invoice.payment_method ? s.pay[invoice.payment_method] ?? invoice.payment_method : "";
  // Split payment: each leg printed under a "دفع مجزأ" header. Single legs print as before.
  const payLegs = (invoice.payment_details ?? []).filter((p) => p && p.method && Number(p.amount) > 0);
  const isSplitPay = payLegs.length > 1;
  const splitLabel = opts.lang === "ar" ? "دفع مجزأ" : "Split payment";
  const legLabel = (m: string) => s.pay[m] ?? m;
  // ملاحظة: هذان السطران كانا مسمّيَين معكوسين (نسخة A4 تُحقن بقالب الحراري
  // والعكس) — الأسماء الآن تطابق القالب الذي تُستخدَم فيه فعلاً.
  const payLinesA4 = isSplitPay
    ? `<div class="muted">${s.payment}: ${esc(splitLabel)}</div>`
      + payLegs.map((p) => `<div class="muted">· ${esc(legLabel(p.method))}: ${money(p.amount)}</div>`).join("")
    : (payLabel ? `<div class="muted">${s.payment}: ${esc(payLabel)}</div>` : "");
  const payLinesThermal = isSplitPay
    ? `<div class="pay"><span>${s.payment}</span><span>${esc(splitLabel)}</span></div>`
      + payLegs.map((p) => `<div class="pay"><span>· ${esc(legLabel(p.method))}</span><span>${money(p.amount)}</span></div>`).join("")
    : (payLabel ? `<div class="pay"><span>${s.payment}</span><span>${esc(payLabel)}</span></div>` : "");
  // Credit / pay-later: show what was paid and the balance still owed.
  const amountPaid = invoice.amount_paid != null ? invoice.amount_paid : invoice.total;
  const dueAmt = Math.max(0, Math.round((invoice.total - amountPaid) * 100) / 100);
  const isCreditInv = dueAmt > 0.01 && !refunded;
  const dueLinesA4 = isCreditInv
    ? `<div class="muted">${s.paid}: ${money(amountPaid)}</div><div class="muted" style="font-weight:700">${s.due}: ${money(dueAmt)}</div>`
    : "";
  const dueLinesThermal = isCreditInv
    ? `<div class="pay"><span>${s.paid}</span><span>${money(amountPaid)}</span></div>`
      + `<div class="pay" style="font-weight:800"><span>${s.due}</span><span>${money(dueAmt)}</span></div>`
    : "";
  // Phone numbers must read LTR (+964 …) even inside an RTL document.
  const phoneHTML = (p: string) => `<span dir="ltr" style="unicode-bidi:isolate; direction:ltr">${esc(p)}</span>`;
  // Phones print with the green WhatsApp mark instead of a "Phone:" label —
  // it says "message us here" in any language.
  // الحراري ثنائي: الأخضر يطلع بقعة رمادية مبقّعة — فالعلامة تُطبع سوداء صافية.
  const WA_FILL = opts.format === "thermal" ? "#000" : "#25D366";
  const WA_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="${WA_FILL}" aria-hidden="true" style="flex:0 0 auto"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
  const waPhone = (p: string) => `<span style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle">${WA_ICON}${phoneHTML(p)}</span>`;
  // Escape the logo URL before it lands in a src="" attribute — an unescaped
  // value could break out of the attribute and inject markup into the printed
  // document (which is emitted via document.write and would execute it). The
  // Settings upload path always produces a clean data: URL, but a value written
  // straight to the DB must never be trusted. Mirrors consentForms.ts.
  const logo = opts.logoUrl ? esc(String(opts.logoUrl)) : "";
  const fb = (opts.facebook || "").trim();
  const ig = (opts.instagram || "").trim();
  const WEBSITE = siteHost(); // follows the live domain — a domain change needs no code edit
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
  // «٨٠مم» اسم الورق لا عرض الطباعة: رأس الطابعة يطبع نقاطاً محدودة والسائق
  // يضيف هامشاً، فأي زيادة بعرض المستند تنلف على الجهة الثانية («نصف الكلام
  // هنا والنصف هناك») أو تُقصّ. العرض صار قابلاً للضبط لكل جهاز بعد قياسه
  // بشريط القياس من الإعدادات — بدل رقم مخمَّن يصلح لطابعة ويكسر أخرى.
  const wmm = thermal ? getReceiptWidth() : 0;
  const page = thermal ? `@page { size: ${wmm}mm auto; margin: 0; }` : "@page { size: A4; margin: 0; }";

  /* الإيصال يُصمَّم على العرض المضبوط لا يُقصّ عليه: كل مقاس يُشتقّ من العرض
   * نفسه — الحواشي والخط والشعار والـQR — فورق ٥٨مم يطلع إيصالاً متناسقاً
   * مصمَّماً له، لا نسخة ٧٢مم مبتورة. النسبة مقيَّدة بحدّين حتى لا يصغر الخط
   * تحت حدّ القراءة على الحراري ولا يتضخم على الورق العريض. */
  const ratio = Math.min(1.08, Math.max(0.84, wmm / 72));
  const fs = (px: number) => `${Math.round(px * ratio * 10) / 10}px`;
  const padX = wmm <= 62 ? 2 : 3;            // مم — الورق الضيق يحتاج حاشية أنحف
  const logoMm = Math.min(24, Math.round(wmm * 0.34));
  const qrMm = Math.min(21, Math.round(wmm * 0.3));

  // Two visual themes share the same markup; CSS differs by format.
  const css = thermal
    ? `
    /* ====================================================================
     * إيصال ٨٠مم — مبني على قواعد الطباعة الحرارية لا على مظهر الشاشة:
     *  · لا رماديات إطلاقاً: الرأس الحراري ثنائي، والرمادي يطلع مبقّعاً أو
     *    يختفي. التدرّج كله بالحجم والوزن والمسافة — كل شيء أسود صافٍ.
     *  · لا خلفيات ملوّنة/معبّأة: المتصفح يسقطها إذا «رسومات الخلفية» مطفية،
     *    فشريط الإجمالي بحدود مزدوجة لا بتعبئة سوداء — يطبع دائماً.
     *  · البند بسطرين بدل أربعة أعمدة: على ٨٠مم الأعمدة الأربعة تتكسّر
     *    وتلتصق، والسطران يبقيان مقروءين مهما طال اسم الصنف.
     *  · مسافة تغذية بالذيل: شفرة القص تبعد ~٢سم عن رأس الطباعة، فبدونها
     *    آخر سطر يبقى داخل الطابعة ويتمزّق مع الورقة.
     * ==================================================================== */
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    body {
      width: ${wmm}mm; max-width: ${wmm}mm; overflow-x: hidden; padding: 4mm ${padX}mm 0; color: #000; background: #fff;
      font-family: "Segoe UI", "Noto Sans Arabic", "Tahoma", system-ui, sans-serif;
      font-size: ${fs(11.5)}; line-height: 1.5;
      font-variant-numeric: tabular-nums; -webkit-font-smoothing: none;
    }
    .head { text-align: center; }
    .head img.logo { display: block; margin: 0 auto 3px; width: ${logoMm}mm; max-height: ${logoMm}mm; object-fit: contain; }
    .brand { font-size: ${fs(8.5)}; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .clinic { font-size: ${fs(17)}; font-weight: 800; letter-spacing: -.2px; margin-top: 1px; }
    .contact { font-size: ${fs(10.5)}; margin-top: 2px; }
    .chip { display: inline-block; margin-top: 6px; border: 1.3px solid #000; border-radius: 999px;
            padding: 1.5px 12px; font-size: ${fs(10)}; font-weight: 800; letter-spacing: 2px; }
    .rule { border-top: 1px dashed #000; margin: 7px 0; }
    .rule.solid { border-top: 1.4px solid #000; }

    /* بيانات الإيصال — شبكة تسمية/قيمة مضغوطة تقرأ بلمحة */
    .meta { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; font-size: ${fs(10.5)}; }
    .meta .k { font-weight: 400; }
    .meta .v { font-weight: 700; text-align: end; }

    /* البنود */
    .item { padding: 5px 0; border-bottom: 1px dotted #000; }
    .item:last-child { border-bottom: 0; }
    .item .n { font-weight: 700; font-size: ${fs(11.5)}; word-break: break-word; }
    .item .bc { font-size: ${fs(8)}; letter-spacing: .6px; margin-top: 1px; }
    .item .l { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 2px; }
    .item .q { font-size: ${fs(10.5)}; }
    .item .a { font-size: ${fs(12)}; font-weight: 800; white-space: nowrap; }

    /* المجاميع + شريط الإجمالي (حدود مزدوجة — تطبع بلا رسومات خلفية) */
    .sum { margin-top: 6px; }
    .sum .r { display: flex; justify-content: space-between; padding: 1.5px 0; font-size: ${fs(11)}; }
    .grand { display: flex; justify-content: space-between; align-items: baseline;
             border-top: 2.2px solid #000; border-bottom: 2.2px solid #000;
             padding: 6px 0; margin-top: 6px; }
    .grand .lbl { font-size: ${fs(12.5)}; font-weight: 800; letter-spacing: .5px; }
    .grand .val { font-size: ${fs(18)}; font-weight: 800; }
    .pay { font-size: ${fs(10.5)}; margin-top: 4px; display: flex; justify-content: space-between; }

    .note { margin-top: 7px; border: 1px solid #000; padding: 5px 6px; font-size: ${fs(10)}; line-height: 1.5; white-space: pre-wrap; }
    .badge { text-align: center; font-weight: 800; border: 1.6px solid #000; padding: 3px; margin: 6px 0; letter-spacing: 2px; font-size: ${fs(11)}; }

    /* الذيل */
    .foot { text-align: center; margin-top: 9px; }
    .thanks { font-size: ${fs(11)}; font-weight: 700; }
    .qr { margin-top: 7px; }
    .qr img { width: ${qrMm}mm; height: ${qrMm}mm; display: block; margin: 0 auto; image-rendering: pixelated; }
    .qr .cap { font-size: ${fs(8.5)}; margin-top: 2px; letter-spacing: .3px; }
    .social { font-size: ${fs(9.5)}; margin-top: 5px; }
    .site { font-size: ${fs(9)}; margin-top: 2px; letter-spacing: 1px; }
    .prints { font-size: ${fs(8.5)}; margin-top: 4px; }

    /* مسافة التغذية — الفرق بين إيصال يُقص كاملاً وإيصال يتمزّق آخر سطر منه.
       ورقة فارغة تُدفع خارج الطابعة فتصل نهاية النص لما بعد شفرة القص. */
    /* خط القص + التغذية.
       الفراغ «الفارغ» (div بارتفاع فقط) كان يُقصّ من سائق الطابعة لأنه بلا
       محتوى — فبقي آخر سطر داخل الجهاز ويتمزّق. الآن التغذية أسطرٌ حقيقية
       (مسافة غير قابلة للكسر بكل سطر) لا يستطيع السائق حذفها، يسبقها خط
       منقّط يدلّ على موضع القص. */
    .cutline { text-align: center; font-size: ${fs(9)}; letter-spacing: 2px; margin-top: 8px; }
    .feed { font-size: 9px; line-height: 5.5mm; }
    `
    : `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.5; padding: 16mm 14mm; position: relative; min-height: 255mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: 720px; margin: 0 auto; position: relative; z-index: 1; }
    /* Faint, decolorised logo watermark centered on the page. position:absolute
       (anchored to the page-filling body) prints reliably across browsers — unlike
       position:fixed, which Chrome/Firefox/Safari render inconsistently in print.
       color-adjust:exact on every ancestor + the img is what forces it to survive
       printing with the browser's "Background graphics" option turned off. */
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .watermark img { width: 92%; max-width: 660px; filter: grayscale(100%); opacity: 0.14; transform: scale(1.85); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Reassert the watermark in the print path — some browsers drop low-opacity
       decorative images unless the print rules explicitly opt back in. */
    @media print {
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .watermark { display: flex !important; }
      .watermark img { opacity: 0.14 !important; filter: grayscale(100%) !important; }
    }
    /* Logo sits in the MIDDLE of the header row (clinic info → its right, invoice → its left). */
    .logo-mid { text-align: center; }
    .logo-mid img { max-height: 120px; max-width: 240px; object-fit: contain; }
    .socials { margin-top: 7px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #475569; }
    .socials .s { display: inline-flex; align-items: center; gap: 6px; }
    .socials svg { flex: 0 0 auto; }
    /* Page footers pinned to the very bottom: website (left) + page number (right). */
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

  /* بنود الإيصال الحراري: سطر للاسم وسطر «الكمية × السعر …… الإجمالي». */
  const thermalItems = items
    .map((it) => `<div class="item">
      <div class="n">${esc(it.name)}</div>
      ${it.barcode ? `<div class="bc">${ltr(esc(it.barcode))}</div>` : ""}
      <div class="l">
        <span class="q">${ltr(`${it.qty} × ${fmt(it.unit_price)}`)}${it.unit_label ? ` <span style="font-size:9.5px">(${esc(it.unit_label)})</span>` : ""}</span>
        <span class="a">${money(it.line_total)}</span>
      </div>
    </div>`)
    .join("");

  const metaRow = (k: string, v: string) => `<div class="k">${k}</div><div class="v">${v}</div>`;

  const body = thermal
    ? `
    <div class="head">
      ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ""}
      <div class="brand">${brand}</div>
      <div class="clinic">${esc(opts.clinicName)}</div>
      ${opts.clinicPhone ? `<div class="contact">${waPhone(opts.clinicPhone)}</div>` : ""}
      <div class="chip">${s.receipt}</div>
    </div>

    <div class="rule"></div>

    <div class="meta">
      ${preSale ? "" : metaRow(s.invoice, ltr(esc(invoiceNo(invoice.id))))}
      ${metaRow(s.date, ltr(esc(dateStr)))}
      ${invoice.customer_name || invoice.customer_phone ? metaRow(s.billedTo, esc(invoice.customer_name || s.walkIn)) : ""}
      ${invoice.customer_phone ? metaRow(s.phone, phoneHTML(invoice.customer_phone)) : ""}
      ${invoice.pet_name ? metaRow(s.pet, esc(invoice.pet_name)) : ""}
      ${opts.sellerName ? metaRow(s.seller, esc(opts.sellerName)) : ""}
    </div>

    ${preSale ? `<div class="badge">${s.preSale}</div>` : ""}
    ${refunded ? `<div class="badge">${s.refunded}</div>` : ""}

    <div class="rule solid"></div>
    ${thermalItems}
    <div class="rule solid"></div>

    <div class="sum">
      ${discount > 0 ? `<div class="r"><span>${s.subtotal}</span><span>${money(subtotal)}</span></div>
        <div class="r"><span>${s.discount}</span><span>${moneyNeg(discount)}</span></div>` : ""}
    </div>
    <div class="grand"><span class="lbl">${s.total}</span><span class="val">${money(invoice.total)}</span></div>
    ${payLinesThermal}
    ${dueLinesThermal}

    ${invoice.notes ? `<div class="note"><b>${s.notes}:</b> ${esc(invoice.notes)}</div>` : ""}

    <div class="foot">
      <div class="thanks">${s.thanks}</div>
      ${opts.qrDataUrl ? `<div class="qr"><img src="${esc(opts.qrDataUrl)}" alt=""/><div class="cap">${s.scanUs}</div></div>` : ""}
      ${socialText ? `<div class="social">${socialText}</div>` : ""}
      <div class="site">${WEBSITE}</div>
      ${opts.printNo && opts.printNo > 1 ? `<div class="prints">${s.printNo} #${ltr(String(opts.printNo))}</div>` : ""}
    </div>

    <div class="cutline">— — — — — — — — — —</div>
    <div class="feed">${"&nbsp;<br/>".repeat(5)}&nbsp;</div>
    `
    : `
    ${logo ? `<div class="watermark"><img src="${logo}" alt=""/></div>` : ""}
    <div class="page-footer">${WEBSITE}</div>
    <div class="page-num" data-page-num>1 / 1</div>
    <div class="sheet">
      <div class="top">
        <div class="party">
          <div class="brand">${brand}</div>
          <div class="clinic">${esc(opts.clinicName)}</div>
          ${opts.clinicPhone ? `<div class="muted">${waPhone(opts.clinicPhone)}</div>` : ""}
          ${socialIcons}
        </div>
        ${logo ? `<div class="logo-mid"><img src="${logo}" alt="logo"/></div>` : `<div></div>`}
        <div class="party end">
          <div class="doc-title">${s.invoice}</div>
          ${preSale ? `<div style="margin-top:6px"><span class="badge" style="transform:none;font-size:11px">${s.preSale}</span></div>` : `<div class="doc-no">${esc(invoiceNo(invoice.id))}</div>`}
          ${opts.printNo && opts.printNo > 1 ? `<div class="doc-no">${s.printNo} #${opts.printNo}</div>` : ""}
        </div>
      </div>

      <div class="grid">
        <div>
          <h4>${s.billedTo}</h4>
          <div class="v">${esc(invoice.customer_name || s.walkIn)}</div>
          ${invoice.pet_name ? `<div class="muted">${s.pet}: ${esc(invoice.pet_name)}</div>` : ""}
          ${invoice.customer_phone ? `<div class="muted">${waPhone(invoice.customer_phone)}</div>` : ""}
        </div>
        <div style="text-align:end">
          <h4>${s.date}</h4>
          <div class="v">${esc(dateStr)}</div>
          ${opts.sellerName ? `<div class="muted">${s.seller}: ${esc(opts.sellerName)}</div>` : ""}
          ${payLinesA4}
          ${dueLinesA4}
          ${refunded ? `<div style="margin-top:8px"><span class="badge">${s.refunded}</span></div>` : ""}
        </div>
      </div>

      <table>
        <thead><tr><th>${s.item}</th><th class="i-num">${s.qty}</th><th class="i-num">${s.price}</th><th class="i-num">${s.amount}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="totals">
        ${discount > 0 ? `<div class="row"><span>${s.subtotal}</span><span>${money(subtotal)}</span></div><div class="row disc"><span>${s.discount}</span><span>${moneyNeg(discount)}</span></div>` : ""}
        <div class="row grand"><span>${s.total}</span><span>${money(invoice.total)}</span></div>
      </div>

      ${invoice.notes ? `<div style="margin-top:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;text-align:start"><strong>${s.notes}:</strong> ${esc(invoice.notes)}</div>` : ""}

      <div class="foot">${s.thanks}</div>
    </div>
    `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/>
    <title>${preSale ? esc(s.preSale) : esc(invoiceNo(invoice.id))}</title>
    <style>${page} ${css}</style></head>
    <body>${body}
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
    </body></html>`;
}

/* تجهيز أصول الإيصال الحراري: شعار ثنائي اللون + رمز QR للتواصل.
 * الفشل هنا لا يمنع الطباعة أبداً — نطبع بلا الأصل الذي تعذّر. */
async function thermalAssets(opts: InvoicePrintOptions): Promise<Partial<InvoicePrintOptions>> {
  const out: Partial<InvoicePrintOptions> = {};
  if (opts.logoUrl) {
    try {
      const { toThermalMono } = await import("@/lib/image");
      out.logoUrl = await toThermalMono(opts.logoUrl);
    } catch { /* نطبع الشعار كما هو */ }
  }
  // QR: محادثة واتساب مع العيادة إن توفّر رقمها، وإلا موقع المنصة.
  const digits = (opts.clinicPhone ?? "").replace(/\D/g, "");
  const target = digits ? `https://wa.me/${digits}` : `https://${siteHost()}`;
  try {
    const QR = await import("qrcode");
    out.qrDataUrl = await QR.toDataURL(target, { margin: 0, width: 320, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } });
  } catch { /* بلا QR */ }
  return out;
}

/**
 * Open the invoice in a fresh window/tab and trigger the print dialog.
 *
 * النافذة تُفتح فوراً داخل ضغطة المستخدم ثم يُكتب المستند بعد تجهيز الأصول —
 * لو انتظرنا التجهيز أولاً لاعتبرها المتصفح نافذة منبثقة غير مطلوبة وحجبها.
 */
export async function openInvoicePrint(invoice: Invoice, items: InvoiceItem[], opts: InvoicePrintOptions): Promise<boolean> {
  const w = window.open("", "_blank", opts.format === "thermal" ? "width=380,height=640" : "width=820,height=920");
  if (!w) return false; // popup blocked
  try {
    w.document.write('<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem;text-align:center;color:#475569">…</body>');
  } catch { /* بعض المتصفحات تمنع الكتابة المبكرة — نكمل عادي */ }
  const extra = opts.format === "thermal" ? await thermalAssets(opts) : {};
  const html = buildInvoiceHTML(invoice, items, { ...opts, ...extra });
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
