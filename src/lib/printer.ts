// ============================================================================
// عرض إيصال الطابعة الحرارية — تفضيل لهذا الجهاز.
//
// «٨٠مم» اسم الورق لا عرض الطباعة: رأس الطابعة يطبع عدداً ثابتاً من النقاط
// (٣٨٤ أو ٥٧٦ عادةً) والسائق يضيف هامشاً، فالعرض الفعّال يختلف من موديل
// لموديل — وإذا كان المستند أعرض من رأس الطباعة، تنلف زيادة كل سطر على
// الجهة الثانية فيطلع «نصف الكلام هنا والنصف هناك».
//
// فبدل التخمين: شريط قياس يُطبع مرة وحدة (أعمدة بأطوال معلومة)، الدكتور
// يشوف أطول عمود طُبع سليماً بلا التفاف، ويختار العرض من الإعدادات.
// الاختيار لهذا الجهاز فقط — عيادة عندها طابعتان تضبط كل جهاز على حِدة.
// ============================================================================
export const RECEIPT_WIDTHS = [58, 62, 66, 70, 72, 76, 80] as const;
/** الافتراضي ٦٦مم: عرض يطبع سليماً على طابعات ٨٠مم بكل مواديلها المتفاوتة
 *  (٧٢ التفّت فعلياً على طابعة حقيقية بالميدان) — والزيادة تُضبط بشريط القياس
 *  لمن طابعته تتحمّل أكثر. الأمان أولاً: عرض أنقص يعني هامشاً، والزيادة تعني
 *  كلاماً ملتفّاً أو مقصوصاً. */
export const DEFAULT_RECEIPT_WIDTH = 66;

const KEY = "vp_receipt_width_mm";

export function getReceiptWidth(): number {
  try {
    const raw = Number(localStorage.getItem(KEY));
    if (RECEIPT_WIDTHS.includes(raw as (typeof RECEIPT_WIDTHS)[number])) return raw;
  } catch { /* ignore */ }
  return DEFAULT_RECEIPT_WIDTH;
}

export function setReceiptWidth(mm: number): void {
  try {
    if (mm === DEFAULT_RECEIPT_WIDTH) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(mm));
  } catch { /* ignore */ }
}

/**
 * شريط القياس: أعمدة سوداء بأطوال معلومة من حافة الورق اليسرى، كل عمود
 * مكتوب طوله. العمود الذي يُطبع خطاً واحداً نظيفاً = عرض مسموح؛ وأول عمود
 * ينكسر أو يترك أثراً بالجهة الثانية = تجاوز رأس الطباعة.
 *
 * الأعمدة حدودٌ (border) لا خلفيات — الخلفيات تُسقَط إذا «رسومات الخلفية»
 * مطفية بنافذة الطباعة، والحدود تُطبع دائماً.
 */
export function openReceiptCalibration(): boolean {
  const bars = RECEIPT_WIDTHS.map((mm) => `
    <div class="row">
      <div class="bar" style="width:${mm}mm"></div>
      <div class="lbl">${mm} mm</div>
    </div>`).join("");

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
  <title>قياس عرض الطابعة</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { width: 80mm; color: #000; background: #fff;
           font-family: "Segoe UI","Noto Sans Arabic",Tahoma,system-ui,sans-serif; font-size: 11px; }
    .head { padding: 4mm 3mm 2mm; text-align: center; }
    .head b { font-size: 13px; font-weight: 800; display: block; }
    .head p { margin: 2mm 0 0; font-size: 10px; line-height: 1.6; }
    /* الأعمدة تبدأ من حافة الورق تماماً (بلا حاشية) حتى يكون الطول مقروءاً */
    .row { padding: 0; margin: 0 0 3.5mm; }
    .bar { border-top: 3.5mm solid #000; }
    .lbl { font-size: 10px; font-weight: 800; padding-inline-start: 1mm; direction: ltr; }
    .note { padding: 2mm 3mm 0; font-size: 10px; line-height: 1.7; }
    .feed { font-size: 9px; line-height: 5.5mm; }
  </style></head><body>
    <div class="head">
      <b>قياس عرض الطابعة</b>
      <p>أطول عمود يُطبع خطاً واحداً نظيفاً بلا أثر بالجهة الثانية = عرض طابعتك.</p>
    </div>
    ${bars}
    <div class="note">اختر هذا الرقم من: الإعدادات ← الطابعة الحرارية ← عرض الإيصال.</div>
    <div class="feed">${"&nbsp;<br/>".repeat(5)}&nbsp;</div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150);});</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=420,height=680");
  if (!w) return false; // popup blocked
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
