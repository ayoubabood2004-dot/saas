import type { Invoice, InvoiceItem } from "@/types";
import { siteHost } from "@/lib/appUrl";
import { getReceiptWidth } from "@/lib/printer";
import { currencySymbol } from "@/lib/utils";
import i18next from "i18next";
import { invoiceNo } from "./invoiceNo";

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
  /** رابطُ متجر العيادة حين يكون مفعَّلاً — يصير هدفَ الـQR بدل الواتساب.
   *
   *  **أوسعُ سطحِ انتشارٍ للمتجر بفارقٍ مقيس**: ١١٩٧ فاتورةً بآخر سبعةِ أيام،
   *  أي ~١١٩٧ قسيمةً بيدِ زبونٍ اشترى **للتوّ**. وقوائمُ الهواتف المميّزة
   *  للمقارنة: ٥٨ و٣٠٣ و٣٣٩. القسيمةُ تصل بالأسبوع أكثرَ ممّا تصله القائمةُ
   *  كلُّها — ولا تكلّف رسالةً ولا إعلاناً. */
  storeUrl?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// IQD: whole numbers with thousands separators, always Western numerals.
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** مبلغ معزول اتجاهياً: بدونه تنقلب إشارة السالب لآخر الرقم داخل مستند RTL
 *  («2,000-» بدل «-2,000») — وهذا ظهر فعلياً على إيصالات مطبوعة. */
const ltr = (s: string) => `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr">${s}</span>`;

/* الرقمُ القصير انتقل إلى `invoiceNo.ts` — يُعاد تصديرُه هنا للنداءات القائمة،
 * لكنّ من لا يطبع يستورده من هناك: انظر رأسَ ذلك الملفّ. */
export { invoiceNo } from "./invoiceNo";

/** مفتاحُ ترجمةٍ بلغةِ الوصل — لا بلغةِ الشاشة التي ضغطت «اطبع». */
const tp = (key: string, lng: string, defaultValue: string) =>
  i18next.t(`retail.${key}`, { lng, defaultValue }) as string;

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
    /* السطرُ يقول **ما يحصل عند المسح** لا «امسحنا»: الزبونُ يمسح لأنه يعرف ماذا
     * سيجد، و«تواصل معنا» و«اطلب توصيلاً» وعدان مختلفان. ومن الترجمة لا من
     * هذا الجدول: سقفُ النصّ الصلب بالملفّ ممتلئ، والقاعدةُ أنه ينزل ولا يصعد.
     * و`lng` صريحةٌ لأن القسيمةَ تُطبع بلغة الإيصال لا بلغة الشاشة. */
    scanStore: i18next.t("retail.scanStore", { lng: lang, defaultValue: "Scan to order delivery" }) as string,
    refunded: ar ? "مُرجعة" : "REFUNDED",
    /* هذه الخمسة من الترجمة لا من الجدول — نفسُ سبب `scanStore` أعلاه:
     * سقفُ النصّ الصلب بالملفّ ممتلئ، والقاعدةُ أنه ينزل ولا يصعد. و`lng`
     * صريحةٌ لأن الوصلَ يُطبع بلغةِ الإيصال لا بلغةِ الشاشة. */
    settled: tp("rcSettled", lang, "Paid in full"),
    partly: tp("rcPartly", lang, "Balance due"),
    preSaleShort: tp("rcProforma", lang, "PRO-FORMA"),
    sigCustomer: tp("rcSigCustomer", lang, "Received by"),
    sigClinic: tp("rcSigClinic", lang, "Clinic stamp & signature"),
    preSale: ar ? "فاتورة أولية — قبل إتمام البيع" : "PRO-FORMA — NOT A RECEIPT",
    printNo: ar ? "نسخة الطباعة رقم" : "Print",
    pkg: tp("rcPackage", lang, "Package / Offer"),
    credit: tp("rcCredit", lang, "Credit"),
    handFill: tp("rcHandFill", lang, "To be filled by hand"),
    no: tp("rcNo", lang, "No."),
  };
}

// Phone numbers must read LTR (+964 …) even inside an RTL document.
const phoneHTML = (p: string) => `<span dir="ltr" style="unicode-bidi:isolate; direction:ltr">${esc(p)}</span>`;

/* Real, colored brand logos (inline SVG so they print without external assets).
 * الحراري ثنائي: الأخضر يطلع بقعة رمادية مبقّعة — فعلامةُ واتساب تُطبع سوداء
 * صافية هناك. */
const waIcon = (thermal: boolean) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="${thermal ? "#000" : "#25D366"}" aria-hidden="true" style="flex:0 0 auto"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const FB_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
const IG_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="vpig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/></linearGradient></defs><path fill="url(#vpig)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.12 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="url(#vpig)" d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84M12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle fill="url(#vpig)" cx="18.41" cy="5.59" r="1.44"/></svg>`;

/* الهاتفُ والحساباتُ بسطرٍ واحدٍ يتدفّق — كانت ثلاثةَ أسطرٍ مكدّسة تدفع اسمَ
 * العيادة لأعلى الصفحة وتترك فراغاً تحته. ومرفوعةٌ خارج الدالّة لأنّ الوصلَ
 * الفارغ يطبع **نفسَ الترويسة**: ترويسةٌ منسوخةٌ تنحرف، وواحدةٌ لا تنحرف. */
function contactLineHTML(phone: string | null | undefined, fb: string, ig: string, thermal: boolean): string {
  if (!phone && !fb && !ig) return "";
  return `<div class="contact">`
    + (phone ? `<span class="c">${waIcon(thermal)}${phoneHTML(phone)}</span>` : "")
    + (fb ? `<span class="c">${FB_ICON}<span dir="ltr">${esc(fb)}</span></span>` : "")
    + (ig ? `<span class="c">${IG_ICON}<span dir="ltr">${esc(ig)}</span></span>` : "")
    + `</div>`;
}

/* ============================================================================
 * أنماطُ ورقة A4 — ثابتةٌ بلا متغيّرٍ واحد، فهي مرفوعةٌ خارج الدالّة.
 *
 * ورفعُها ليس ترتيباً: **الوصلُ الفارغ يطبعها نفسَها**. ورقةٌ تُملأ بالقلم
 * تُطبع بقالبٍ ثانٍ تنحرف عنه بشهر — الترويسةُ تكبر هنا ولا تكبر هناك،
 * والزبونُ يستلم ورقتين من عيادةٍ واحدةٍ لا تشبهان بعضَهما. فالمصدرُ واحد.
 * ==========================================================================*/
const A4_CSS = `
    /* ====================================================================
     * وصلُ A4 — وثيقةٌ تُسلَّم بيدِ زبونٍ وتُحفظ بملفّ العيادة.
     *
     * ── ما يحكم التصميم ────────────────────────────────────────────────
     *  · **الحبرُ يُنفَق حيث يُقرأ**: لا ألواحَ ملوّنةٌ عريضة. لونٌ واحدٌ
     *    يظهر بشريطٍ رفيعٍ وبكتلة الإجمالي وحدَها — مئةُ وصلٍ باليوم على
     *    طابعةِ عيادة، والتصميمُ الذي يستنزف الحبر يُستبدَل بعد أسبوع.
     *  · **الهرمُ بالحجم والفراغ لا بالخطوط**: خطوطٌ شعريّة (١px) وفواصلُ
     *    بيضاء — الجداولُ المحاطة بالصناديق تبدو كشيتِ إكسل مطبوع.
     *  · **الأرقامُ تصطفّ**: \`tabular-nums\` بكلّ عمودٍ رقميّ، وإلا تراقصت
     *    خانةُ الآلاف بين السطور ولم يُمكن جمعُها بالعين.
     *  · **وما لا يُعرف لا يُطبع**: كلُّ كتلةٍ مشروطةٌ بوجود بياناتها، فلا
     *    عناوينُ فارغةٌ ولا «—» بوثيقةٍ رسمية.
     *
     * ── وقاعدةُ الاتجاه ────────────────────────────────────────────────
     * المستندُ عربيٌّ (rtl) وكلُّ رقمٍ وتاريخٍ وهاتفٍ مقطعٌ لاتينيّ معزول.
     * بلا العزل ينقلب «20 Sept 2026» إلى «Sept 2026, 11:24 20» — وهذا كان
     * يُطبع فعلاً على كلّ وصلٍ من هذا القالب.
     * ==================================================================== */
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    :root {
      --ink: #0B1220; --ink2: #47546A; --ink3: #93A0B4;
      --line: #E4E9F0; --line2: #CFD8E4;
      --acc: #0E5FD8; --acc-soft: #EFF5FF;
      --due: #B45309; --due-soft: #FFF7EC;
      --bad: #B91C1C;
    }
    body {
      font-family: "Segoe UI", "Noto Sans Arabic", "Dubai", Tahoma, system-ui, -apple-system, sans-serif;
      color: var(--ink); font-size: 12.5px; line-height: 1.55;
      padding: 13mm 13mm 16mm; position: relative; min-height: 268mm;
      font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "lnum" 1;
      display: flex; flex-direction: column;
    }
    /* التوقيعُ والذيلُ يهبطان لقاع **الورقة** لا لقاع النصّ.
       فاتورةٌ بثلاثة بنودٍ كانت تترك نصفَ الصفحة بياضاً ثم تضع خطَّ التوقيع
       بوسطها — وهذا ما يجعل مستنداً يبدو صفحةَ وِبٍ مطبوعة لا وثيقة. */
    .sheet { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1 1 auto; }
    .grow { flex: 1 1 auto; min-height: 10mm; }
    .num { direction: ltr; unicode-bidi: isolate; white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* علامةٌ مائيّة باهتة — تبقى تحت كلّ شيء ولا تزاحم النصّ. */
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* ختمٌ باهتٌ لا لوحةٌ خلفية: بعرضٍ كبيرٍ وشكلٍ مصمت كان يمرّ **خلف جدول
       البنود** فيُقرأ الرقمُ على رماديّ. صار صغيراً وأسفلَ الصفحة حيث الفراغ. */
    .watermark { align-items: flex-end; padding-bottom: 34mm; }
    .watermark img { width: 34%; max-width: 230px; filter: grayscale(100%); opacity: .045; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .watermark { display: flex !important; }
      .watermark img { opacity: .045 !important; filter: grayscale(100%) !important; }
    }

    /* ── الترويسة ─────────────────────────────────────────────────────── */
    .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .who { display: flex; align-items: center; gap: 13px; min-width: 0; }
    .who img { height: 58px; width: 58px; object-fit: contain; flex: 0 0 auto; }
    .brand { font-size: 8.5px; font-weight: 800; letter-spacing: 2.6px; text-transform: uppercase; color: var(--acc); }
    .clinic { margin: 1px 0 0; font-size: 21px; font-weight: 800; letter-spacing: -.35px; line-height: 1.2; }
    .contact { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--ink2); }
    .contact .c { display: inline-flex; align-items: center; gap: 5px; }
    .contact svg { flex: 0 0 auto; }

    /* بطاقةُ المستند: النوعُ والرقمُ والوقت — تُقرأ قبل أيّ شيءٍ آخر. */
    .doc { flex: 0 0 auto; text-align: end; }
    .doc-kind { font-size: 25px; font-weight: 800; letter-spacing: .5px; color: var(--acc); line-height: 1.1; }
    .doc-no { margin-top: 3px; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
              font-size: 12px; font-weight: 700; color: var(--ink); letter-spacing: .6px; }
    .doc-when { margin-top: 5px; font-size: 11px; color: var(--ink2); }

    /* الشريطُ الملوّن: كلُّ الهويّة البصريّة بأربعة ملّيمترات من الحبر. */
    .spine { margin-top: 11px; height: 3px; background: var(--acc); border-radius: 2px; }
    .spine-sub { height: 1px; background: var(--line); margin-top: 2px; }

    /* ── شارات الحالة ─────────────────────────────────────────────────── */
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line2);
            border-radius: 999px; padding: 2.5px 11px; font-size: 10.5px; font-weight: 700; color: var(--ink2); }
    .chip.acc { border-color: #BBD3F7; background: var(--acc-soft); color: #0B47A6; }
    .chip.ok  { border-color: #A7D9CF; background: #EFFAF7; color: #0F766E; }
    .chip.due { border-color: #F0D5A8; background: var(--due-soft); color: var(--due); }
    .chip.bad { border-color: #F3C4C4; background: #FEF2F2; color: var(--bad); }

    /* ── شريطُ المعلومات: خلايا مفصولةٌ بخطٍّ شعريّ ────────────────────── */
    .meta { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0;
            margin-top: 13px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
    .meta .cell { padding: 8px 12px; border-inline-start: 1px solid var(--line); min-width: 0; }
    .meta .cell:first-child { border-inline-start: 0; }
    .meta .k { font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ink3); }
    .meta .v { margin-top: 2px; font-size: 12.5px; font-weight: 700; overflow-wrap: anywhere; }
    .meta .v2 { font-size: 11px; font-weight: 400; color: var(--ink2); }

    /* ── جدولُ البنود ─────────────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    /* تكرارُ الرأس بالصفحة الثانية: فاتورةٌ بعشرين بنداً تُقلب فيضيع معنى الأعمدة. */
    thead { display: table-header-group; }
    thead th { background: #F7F9FC; color: var(--ink2); font-size: 9.5px; font-weight: 800;
               letter-spacing: .8px; text-transform: uppercase; text-align: start;
               padding: 8px 11px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line2); }
    thead th.i-num { text-align: end; }
    thead th.i-idx { width: 30px; text-align: center; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }
    tbody td { padding: 9px 11px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .i-idx { text-align: center; color: var(--ink3); font-size: 11px; }
    .i-num { text-align: end; white-space: nowrap; }
    .i-name { font-weight: 600; overflow-wrap: anywhere; }
    .i-bc { display: block; margin-top: 1px; font-size: 9.5px; color: var(--ink3);
            font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 400; letter-spacing: .4px; }
    .i-amt { font-weight: 800; }

    /* ── الخاتمة: يسارٌ يشرح ويمينٌ يحسب ──────────────────────────────── */
    .close { display: flex; gap: 20px; margin-top: 16px; align-items: flex-start; break-inside: avoid; page-break-inside: avoid; }
    .close-a { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
    .close-b { flex: 0 0 272px; }

    .paybox { border: 1px solid var(--line); border-radius: 9px; padding: 9px 12px; }
    .paybox .k { font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ink3); }
    .paylegs { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 5px 7px; }
    .leg { display: inline-flex; align-items: baseline; gap: 6px; border: 1px solid var(--line);
           border-radius: 7px; padding: 3px 9px; font-size: 11px; }
    .leg b { font-weight: 800; }

    .note { border: 1px solid var(--line); border-inline-start: 3px solid var(--acc);
            border-radius: 8px; padding: 8px 11px; font-size: 11.5px; line-height: 1.55; white-space: pre-wrap; }
    .note b { display: block; font-size: 9px; letter-spacing: .8px; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin-bottom: 2px; }

    .qrbox { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 9px; padding: 9px 12px; }
    .qrbox img { width: 62px; height: 62px; flex: 0 0 auto; image-rendering: pixelated; }
    .qrbox .t { font-size: 11.5px; font-weight: 700; line-height: 1.4; }
    .qrbox .u { font-size: 10px; color: var(--ink3); margin-top: 2px; }

    /* لوحُ المجاميع */
    .tot { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .tot .r { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
              padding: 6px 13px; font-size: 12px; color: var(--ink2); }
    .tot .r + .r { border-top: 1px solid #F0F3F8; }
    .tot .r.disc { color: #0F766E; }
    .tot .grand { background: var(--acc); color: #fff; padding: 11px 13px; display: flex;
                  justify-content: space-between; align-items: baseline; gap: 12px; }
    .tot .grand .l { font-size: 12.5px; font-weight: 700; letter-spacing: .4px; opacity: .92; }
    .tot .grand .v { font-size: 20px; font-weight: 800; letter-spacing: -.3px; }
    .tot .after { border-top: 1px solid var(--line); }
    /* المتبقّي — الرقمُ الذي يعود الزبونُ لأجله. لا يُدفن برماديٍّ صغير. */
    .tot .due { background: var(--due-soft); color: var(--due); padding: 9px 13px; display: flex;
                justify-content: space-between; align-items: baseline; gap: 12px; border-top: 1px solid #F0D5A8; }
    .tot .due .l { font-size: 12px; font-weight: 800; }
    .tot .due .v { font-size: 16px; font-weight: 800; }

    /* ── التوقيع والختم ───────────────────────────────────────────────── */
    .sign { display: flex; gap: 34px; margin-top: 20px; break-inside: avoid; }
    .sign .s { flex: 1 1 0; }
    .sign .line { border-bottom: 1px dashed var(--line2); height: 26px; }
    .sign .cap { margin-top: 4px; font-size: 10px; color: var(--ink3); letter-spacing: .3px; }

    /* ── الذيل ────────────────────────────────────────────────────────── */
    .foot { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--line);
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            font-size: 10.5px; color: var(--ink3); }
    .foot .thanks { font-size: 11.5px; font-weight: 700; color: var(--ink2); }
    .stamp { display: inline-block; font-weight: 800; color: var(--bad); border: 2px solid var(--bad);
             border-radius: 8px; padding: 3px 12px; letter-spacing: 2px; font-size: 12px; }

    /* ── الوصلُ الفارغ: كلُّ قيمةٍ تصير سطراً يُكتب عليه ────────────────
     * ارتفاعُ السطر ٨مم لا ٤: قياسُ خطِّ يدٍ عربيّةٍ بقلم جافّ. سطرٌ لا يسع
     * ما يُكتب فيه ورقةٌ تُطبع مرّةً ولا تُستعمل ثانية. */
    .wl { border-bottom: 1px solid var(--line2); height: 15px; margin-top: 5px; }
    .docf { margin-top: 7px; display: flex; align-items: flex-end; justify-content: flex-end; gap: 8px;
            font-size: 11px; color: var(--ink2); }
    .docf .k { font-weight: 700; white-space: nowrap; }
    .docf .wl { flex: 0 0 96px; margin-top: 0; }
    /* فواصلُ أعمدةٍ رفيعةٌ بالفارغ وحدَه: بالمملوء يفصل النصُّ نفسُه، وبالفارغ
       ما يدلّ اليدَ على مكان الكمّية من مكان السعر إلا الخطّ. */
    table.blank tbody td { height: 28px; border-inline-end: 1px solid #F1F4F9; }
    table.blank tbody td:last-child, table.blank thead th:last-child { border-inline-end: 0; }
    table.blank thead th { border-inline-end: 1px solid #E8EDF4; }
    .blankpage .grow { min-height: 4mm; }
    /* بالورقة الفارغة الختمُ أظهرُ لأنّ ما حولَه أبيضُ كلُّه — وهو يقع تحت
       خانة الملاحظات حيث يُكتب فعلاً. فأخفتُ وأصغر، ويبقى: ترويسةٌ فارغةٌ
       بلا ختمٍ تُنسخ على أيّ طابعة. */
    .watermark.faint img { width: 26%; max-width: 180px; opacity: .03; }
    @media print { .watermark.faint img { opacity: .03 !important; } }
    /* خانةُ اختيارٍ تُعلَّم بالقلم — لا نصَّ «نقداً/بطاقة» يُشطب عليه. */
    .boxes { display: flex; flex-wrap: wrap; gap: 7px 18px; margin-top: 7px; }
    .boxes .b { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--ink2); }
    .boxes .b i { display: inline-block; width: 12px; height: 12px; border: 1.4px solid var(--line2); border-radius: 3px; flex: 0 0 auto; }
    .tot .wv { flex: 0 0 106px; border-bottom: 1px solid var(--line2); height: 15px; }
    .tot .grand .wv { flex: 0 0 122px; border-bottom: 1.6px solid rgba(255,255,255,.62); height: 19px; }
    .tot .due .wv { flex: 0 0 122px; border-bottom: 1.6px solid #E2B562; height: 18px; }
`;

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
  /* **يومٌ ووقتٌ مقطعَين لا نصّاً واحداً.** الوصلُ عربيٌّ (rtl)، وسلسلةٌ
   * لاتينيّةٌ فيها فاصلةٌ ونقطتان تُعاد ترتيبُ مقاطعها بصرياً: «20 Sept 2026,
   * 11:24» كانت تُطبع «Sept 2026, 11:24 20» — اليومُ يقفز لآخر السطر. وهذا
   * كان يخرج على **كلّ** وصلِ A4 من هذا القالب. فكلُّ مقطعٍ يُعزل وحدَه. */
  const dayStr = created.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  const timeStr = created.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
  const payLinesThermal = isSplitPay
    ? `<div class="pay"><span>${s.payment}</span><span>${esc(splitLabel)}</span></div>`
      + payLegs.map((p) => `<div class="pay"><span>· ${esc(legLabel(p.method))}</span><span>${money(p.amount)}</span></div>`).join("")
    : (payLabel ? `<div class="pay"><span>${s.payment}</span><span>${esc(payLabel)}</span></div>` : "");
  // Credit / pay-later: show what was paid and the balance still owed.
  const amountPaid = invoice.amount_paid != null ? invoice.amount_paid : invoice.total;
  const dueAmt = Math.max(0, Math.round((invoice.total - amountPaid) * 100) / 100);
  const isCreditInv = dueAmt > 0.01 && !refunded;
  const dueLinesThermal = isCreditInv
    ? `<div class="pay"><span>${s.paid}</span><span>${money(amountPaid)}</span></div>`
      + `<div class="pay" style="font-weight:800"><span>${s.due}</span><span>${money(dueAmt)}</span></div>`
    : "";
  // Phones print with the green WhatsApp mark instead of a "Phone:" label —
  // it says "message us here" in any language.
  // الحراري ثنائي: الأخضر يطلع بقعة رمادية مبقّعة — فالعلامة تُطبع سوداء صافية.
  const WA_ICON = waIcon(opts.format === "thermal");
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
  const contactLine = contactLineHTML(opts.clinicPhone, fb, ig, opts.format === "thermal");
  // Thermal: plain text (icons too small to read on a 80mm receipt).
  const socialText = [fb ? `FB ${esc(fb)}` : "", ig ? `IG ${esc(ig)}` : ""].filter(Boolean).join("  ·  ");

  /* عمودُ ترقيمٍ بالوصل: «البند الرابع» جملةٌ تُقال بالهاتف، ومراجعةُ فاتورةٍ
     بعشرين بنداً بلا أرقامٍ تصير عدّاً بالإصبع على الورق. */
  const rowsA4 = items
    .map(
      (it, i) => `<tr>
        <td class="i-idx">${ltr(String(i + 1))}</td>
        <td class="i-name">${esc(it.name)}${it.unit_label ? ` <span style="font-weight:400;color:#93A0B4;font-size:10.5px">(${esc(it.unit_label)})</span>` : ""}${it.barcode ? `<span class="i-bc">${ltr(esc(it.barcode))}</span>` : ""}</td>
        <td class="i-num">${ltr(String(it.qty))}</td>
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
    : A4_CSS;

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
      ${opts.qrDataUrl ? `<div class="qr"><img src="${esc(opts.qrDataUrl)}" alt=""/><div class="cap">${opts.storeUrl ? s.scanStore : s.scanUs}</div></div>` : ""}
      ${socialText ? `<div class="social">${socialText}</div>` : ""}
      <div class="site">${WEBSITE}</div>
      ${opts.printNo && opts.printNo > 1 ? `<div class="prints">${s.printNo} #${ltr(String(opts.printNo))}</div>` : ""}
    </div>

    <div class="cutline">— — — — — — — — — —</div>
    <div class="feed">${"&nbsp;<br/>".repeat(5)}&nbsp;</div>
    `
    : `
    ${logo ? `<div class="watermark"><img src="${logo}" alt=""/></div>` : ""}
    <div class="sheet">

      <header class="masthead">
        <div class="who">
          ${logo ? `<img src="${logo}" alt=""/>` : ""}
          <div style="min-width:0">
            <div class="brand">${brand}</div>
            <h1 class="clinic">${esc(opts.clinicName)}</h1>
            ${contactLine}
          </div>
        </div>
        <div class="doc">
          <div class="doc-kind">${preSale ? s.preSaleShort : s.receipt}</div>
          ${preSale ? "" : `<div class="doc-no">${ltr(esc(invoiceNo(invoice.id)))}</div>`}
          <div class="doc-when">${ltr(esc(`${dayStr} \u00b7 ${timeStr}`))}</div>
        </div>
      </header>
      <div class="spine"></div><div class="spine-sub"></div>

      <div class="chips">
        ${preSale ? `<span class="chip bad">${s.preSale}</span>` : ""}
        ${refunded ? `<span class="chip bad">${s.refunded}</span>` : ""}
        ${!preSale && !refunded ? `<span class="chip ${isCreditInv ? "due" : "ok"}">${isCreditInv ? s.partly : s.settled}</span>` : ""}
        ${payLabel && !isSplitPay ? `<span class="chip">${esc(payLabel)}</span>` : ""}
        ${isSplitPay ? `<span class="chip">${esc(splitLabel)}</span>` : ""}
        ${opts.printNo && opts.printNo > 1 ? `<span class="chip">${s.printNo} ${ltr(`#${opts.printNo}`)}</span>` : ""}
      </div>

      <section class="meta">
        <div class="cell">
          <div class="k">${s.billedTo}</div>
          <div class="v">${esc(invoice.customer_name || s.walkIn)}</div>
          ${invoice.customer_phone ? `<div class="v2">${phoneHTML(invoice.customer_phone)}</div>` : ""}
        </div>
        ${invoice.pet_name ? `<div class="cell"><div class="k">${s.pet}</div><div class="v">${esc(invoice.pet_name)}</div></div>` : ""}
        <div class="cell">
          <div class="k">${s.date}</div>
          <div class="v">${ltr(esc(dayStr))}</div>
          <div class="v2">${ltr(esc(timeStr))}</div>
        </div>
        ${opts.sellerName ? `<div class="cell"><div class="k">${s.seller}</div><div class="v">${esc(opts.sellerName)}</div></div>` : ""}
      </section>

      <table>
        <thead><tr>
          <th class="i-idx">#</th><th>${s.item}</th>
          <th class="i-num">${s.qty}</th><th class="i-num">${s.price}</th><th class="i-num">${s.amount}</th>
        </tr></thead>
        <tbody>${rowsA4}</tbody>
      </table>

      <section class="close">
        <div class="close-a">
          ${isSplitPay || payLabel ? `<div class="paybox">
            <div class="k">${s.payment}</div>
            <div class="paylegs">${
              isSplitPay
                ? payLegs.map((pl) => `<span class="leg">${esc(legLabel(pl.method))} <b>${money(pl.amount)}</b></span>`).join("")
                : `<span class="leg">${esc(payLabel)} <b>${money(amountPaid)}</b></span>`
            }</div>
          </div>` : ""}
          ${invoice.notes ? `<div class="note"><b>${s.notes}</b>${esc(invoice.notes)}</div>` : ""}
          ${opts.qrDataUrl ? `<div class="qrbox">
            <img src="${esc(opts.qrDataUrl)}" alt=""/>
            <div><div class="t">${opts.storeUrl ? s.scanStore : s.scanUs}</div><div class="u">${WEBSITE}</div></div>
          </div>` : ""}
        </div>

        <div class="close-b">
          <div class="tot">
            ${discount > 0 ? `<div class="r"><span>${s.subtotal}</span><span>${money(subtotal)}</span></div>
              <div class="r disc"><span>${s.discount}</span><span>${moneyNeg(discount)}</span></div>` : ""}
            <div class="grand"><span class="l">${s.total}</span><span class="v">${money(invoice.total)}</span></div>
            ${isCreditInv ? `<div class="r after"><span>${s.paid}</span><span>${money(amountPaid)}</span></div>
              <div class="due"><span class="l">${s.due}</span><span class="v">${money(dueAmt)}</span></div>` : ""}
          </div>
        </div>
      </section>

      <div class="grow"></div>

      <section class="sign">
        <div class="s"><div class="line"></div><div class="cap">${s.sigCustomer}</div></div>
        <div class="s"><div class="line"></div><div class="cap">${s.sigClinic}</div></div>
      </section>

      <div class="foot">
        <span class="thanks">${s.thanks}</span>
        <span>${ltr(esc(WEBSITE))}${preSale ? "" : ` · ${ltr(esc(invoiceNo(invoice.id)))}`}</span>
      </div>
    </div>
    `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/>
    <title>${preSale ? esc(s.preSale) : esc(invoiceNo(invoice.id))}</title>
    <style>${page} ${css}</style></head>
    <body>${body}
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
    </body></html>`;
}

/* ============================================================================
 * الوصلُ الفارغ — ورقةٌ تُطبع بلا بيانات، تُملأ بالقلم.
 *
 * طلبُ المالك حرفياً: «وصل فارغ اني امليه للزبون واحدد الخصومات والباقات».
 * وهي حالةٌ قائمةٌ بالعيادة لا استثناء: بيعٌ يُتّفق عليه بالكلام — باقةُ
 * تلقيحٍ، خصمٌ لزبونٍ قديم، عمليةٌ تُسعَّر عند الحضور — والزبونُ يريد ورقةً
 * بيده الآن، والإدخالُ للنظام يجيء بعدها.
 *
 * ثلاثةُ قيودٍ تحكمها:
 *
 * ١) **نفسُ قالب A4 حرفاً بحرف** (`A4_CSS` و`contactLineHTML` مرفوعتان لهذا).
 *    قالبٌ منسوخٌ ينحرف بشهر — الترويسةُ تكبر هنا ولا تكبر هناك — فيستلم
 *    الزبونُ ورقتين من عيادةٍ واحدةٍ لا تشبهان بعضَهما.
 *
 * ٢) **لا رقمَ فاتورةٍ مخترَعاً.** رقمٌ مطبوعٌ مسبقاً على ورقةٍ لا وجودَ لها
 *    بالسجلّ يصنع رقمَين لفاتورةٍ واحدةٍ يومَ تُدخَل — أو فاتورتين برقمٍ
 *    واحد. الخانةُ سطرٌ فارغٌ يكتبه من يملأ، وتبقى الورقةُ بلا ادّعاء.
 *
 * ٣) **شارةُ «تُملأ باليد» ظاهرة.** ورقةٌ فارغةٌ بترويسة عيادةٍ تشبه إيصالاً
 *    تماماً؛ والشارةُ تقول للزبون — ولمن يراجع الدفتر لاحقاً — إنّ ما عليها
 *    خطُّ يدٍ لا خرجٌ من نظام.
 * ==========================================================================*/
export interface BlankFormOptions {
  clinicName: string;
  clinicPhone?: string | null;
  brand?: string;
  lang: string;
  logoUrl?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  qrDataUrl?: string | null;
  storeUrl?: string | null;
  /** عددُ أسطر الأصناف الفارغة — الافتراضيُّ يملأ ورقةَ A4 بلا صفحةٍ ثانية. */
  rows?: number;
}

export function buildBlankFormHTML(opts: BlankFormOptions): string {
  const s = strings(opts.lang);
  const brand = esc(opts.brand || "doctorVet");
  const logo = opts.logoUrl ? esc(String(opts.logoUrl)) : "";
  const fb = (opts.facebook || "").trim();
  const ig = (opts.instagram || "").trim();
  const WEBSITE = siteHost();
  const contactLine = contactLineHTML(opts.clinicPhone, fb, ig, false);
  /* أحدَ عشرَ سطراً: مقيسةٌ على الورقة نفسِها لا مخمَّنة — الثاني عشر يدفع
     التوقيعَ لصفحةٍ ثانيةٍ فارغةٍ إلا منه. */
  /* و`Number.isFinite` قبل القصّ: `Math.max(4, NaN)` = NaN، و`Array.from`
     على طولٍ NaN تُرجع مصفوفةً **فارغة** — فتخرج ورقةٌ بلا سطرٍ واحدٍ يُكتب
     فيه، وهي ورقةٌ تُطبع ولا تُستعمل. أمسكه الفحص. */
  const want = Number(opts.rows);
  const n = Number.isFinite(want) ? Math.max(4, Math.min(20, Math.round(want))) : 9;
  const rows = Array.from({ length: n }, (_, i) =>
    `<tr><td class="i-idx">${ltr(String(i + 1))}</td><td></td><td class="i-num"></td><td class="i-num"></td><td class="i-num"></td></tr>`).join("");

  const body = `
    ${logo ? `<div class="watermark faint"><img src="${logo}" alt=""/></div>` : ""}
    <div class="sheet blankpage">

      <header class="masthead">
        <div class="who">
          ${logo ? `<img src="${logo}" alt=""/>` : ""}
          <div style="min-width:0">
            <div class="brand">${brand}</div>
            <h1 class="clinic">${esc(opts.clinicName)}</h1>
            ${contactLine}
          </div>
        </div>
        <div class="doc">
          <div class="doc-kind">${s.receipt}</div>
          <div class="docf"><span class="k">${s.no}</span><span class="wl"></span></div>
          <div class="docf"><span class="k">${s.date}</span><span class="wl"></span></div>
        </div>
      </header>
      <div class="spine"></div><div class="spine-sub"></div>

      <div class="chips"><span class="chip">${s.handFill}</span></div>

      <section class="meta">
        <div class="cell"><div class="k">${s.billedTo}</div><div class="wl"></div></div>
        <div class="cell"><div class="k">${s.phone}</div><div class="wl"></div></div>
        <div class="cell"><div class="k">${s.pet}</div><div class="wl"></div></div>
        <div class="cell"><div class="k">${s.seller}</div><div class="wl"></div></div>
      </section>

      <table class="blank">
        <thead><tr>
          <th class="i-idx">#</th><th>${s.item}</th>
          <th class="i-num">${s.qty}</th><th class="i-num">${s.price}</th><th class="i-num">${s.amount}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="close">
        <div class="close-a">
          <div class="paybox">
            <div class="k">${s.payment}</div>
            <div class="boxes">
              <span class="b"><i></i>${s.pay.cash}</span>
              <span class="b"><i></i>${s.pay.card}</span>
              <span class="b"><i></i>${s.pay.transfer}</span>
              <span class="b"><i></i>${s.credit}</span>
            </div>
          </div>
          <div class="paybox">
            <div class="k">${s.pkg}</div>
            <div class="wl"></div>
          </div>
          <div class="paybox">
            <div class="k">${s.notes}</div>
            <div class="wl"></div>
            <div class="wl"></div>
          </div>
          ${opts.qrDataUrl ? `<div class="qrbox">
            <img src="${esc(opts.qrDataUrl)}" alt=""/>
            <div><div class="t">${opts.storeUrl ? s.scanStore : s.scanUs}</div><div class="u">${WEBSITE}</div></div>
          </div>` : ""}
        </div>

        <div class="close-b">
          <div class="tot">
            <div class="r"><span>${s.subtotal}</span><span class="wv"></span></div>
            <div class="r disc"><span>${s.discount}</span><span class="wv"></span></div>
            <div class="grand"><span class="l">${s.total}</span><span class="wv"></span></div>
            <div class="r after"><span>${s.paid}</span><span class="wv"></span></div>
            <div class="due"><span class="l">${s.due}</span><span class="wv"></span></div>
          </div>
        </div>
      </section>

      <div class="grow"></div>

      <section class="sign">
        <div class="s"><div class="line"></div><div class="cap">${s.sigCustomer}</div></div>
        <div class="s"><div class="line"></div><div class="cap">${s.sigClinic}</div></div>
      </section>

      <div class="foot">
        <span class="thanks">${s.thanks}</span>
        <span>${ltr(esc(WEBSITE))}</span>
      </div>
    </div>
  `;

  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/>
    <title>${esc(s.receipt)} — ${esc(s.handFill)}</title>
    <style>@page { size: A4; margin: 0; } ${A4_CSS}</style></head>
    <body>${body}
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>
    </body></html>`;
}

/** يفتح الوصلَ الفارغ بنافذةٍ ويطلق حوارَ الطباعة. `false` = المتصفّح حجبها. */
export async function openBlankFormPrint(opts: BlankFormOptions): Promise<boolean> {
  /* النافذةُ تُفتح **داخل ضغطة المستخدم** ثم يُكتب المستند بعد تجهيز الـQR —
     لو انتظرنا التجهيز أوّلاً لعدَّها المتصفّحُ منبثقةً غيرَ مطلوبةٍ وحجبها.
     نفسُ ترتيب `openInvoicePrint`. */
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return false;
  try {
    w.document.write('<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem;text-align:center;color:#475569">…</body>');
  } catch { /* بعض المتصفحات تمنع الكتابة المبكرة */ }
  const extra = await printAssets({ ...opts, format: "a4" } as InvoicePrintOptions);
  const html = buildBlankFormHTML({ ...opts, qrDataUrl: extra.qrDataUrl ?? null });
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/* تجهيز أصول الطباعة: رمزُ QR للنسختَين، وشعارٌ ثنائي اللون للحراريّ وحدَه.
 *
 * **والـQR كان للحراريّ فقط.** وترويسةُ هذا الملفّ تقول إنّ القسيمةَ أوسعُ
 * سطحِ انتشارٍ للمتجر بفارقٍ مقيس (١١٩٧ فاتورةً بسبعة أيام) — وكلُّ فاتورةِ
 * A4 كانت تخرج بلا ذلك السطح، وهي التي تُسلَّم بيدٍ وتُحفظ بملفّ. فصار
 * الرمزُ للنسختين، والشعارُ المونوكرومُ للحراريّ وحدَه (رأسُه ثنائيّ).
 *
 * الفشل هنا لا يمنع الطباعة أبداً — نطبع بلا الأصل الذي تعذّر. */
async function printAssets(opts: InvoicePrintOptions): Promise<Partial<InvoicePrintOptions>> {
  const out: Partial<InvoicePrintOptions> = {};
  if (opts.format === "thermal" && opts.logoUrl) {
    try {
      const { toThermalMono } = await import("@/lib/image");
      out.logoUrl = await toThermalMono(opts.logoUrl);
    } catch { /* نطبع الشعار كما هو */ }
  }
  /* QR: المتجرُ أوّلاً حين يكون مفعَّلاً، ثمّ واتساب العيادة، ثمّ موقعُ المنصّة.
   * و`?r=r` يوسم المصدرَ بالقسيمة فيُقاس أثرُها بـت١ (`ref_host` لا يكفي:
   * الماسحُ يفتح الرابطَ مباشرةً بلا مُحيل). */
  const digits = (opts.clinicPhone ?? "").replace(/\D/g, "");
  const target = opts.storeUrl ? `${opts.storeUrl}?r=r`
    : digits ? `https://wa.me/${digits}`
    : `https://${siteHost()}`;
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
  const extra = await printAssets(opts);
  const html = buildInvoiceHTML(invoice, items, { ...opts, ...extra });
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
