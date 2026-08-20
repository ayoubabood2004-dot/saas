/* ============================================================================
 * قسيمة الراتب — المستند الذي يستلمه الموظف.
 *
 * قاعدة التصميم الوحيدة هنا: **كل رقم يشرح نفسه**. قطعٌ بلا سبب ولا طريقة
 * حساب هو نزاعٌ مؤجَّل، وقسطُ سلفةٍ بلا «الباقي بعده» يجبر الموظف على السؤال
 * كل شهر. ولهذا تُطبع قاعدة أجر اليوم على المستند: من لا يعرف كيف انحسب القطع
 * يشكّ بالسستم كلّه، وهو محقّ.
 * ==========================================================================*/
import type { Payslip, PayslipLine, PayrollPolicyDTO } from "@/types";
import { elementOf } from "./payroll";

export interface PayslipPrintOptions {
  clinicName: string;
  clinicPhone?: string | null;
  logoUrl?: string | null;
  currency: string;
  /** الفترة كما تُعرَض: «2026-08». */
  period: string;
  policy: PayrollPolicyDTO;
  /** رقم القسيمة المعروض. */
  slipNo: string;
  /** «٨٠مم» للطابعة الحرارية بدل A4. */
  thermal?: boolean;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
/** مبلغ معزول اتجاهياً — بدونه تنقلب إشارة السالب لآخر الرقم داخل مستند RTL. */
const ltr = (s: string) => `<span dir="ltr" style="unicode-bidi:isolate">${s}</span>`;

/** سطر الشرح تحت البند: كيف انحسب، ولماذا، وما الباقي. */
function explain(l: PayslipLine, policy: PayrollPolicyDTO): string {
  const bits: string[] = [];
  if (l.qty != null && l.rate != null) {
    const unit = l.code === "ABS" || l.code === "UNPAID" ? "يوم" : "وحدة";
    bits.push(`${fmt(l.qty)} ${unit} × ${ltr(fmt(l.rate))}`);
    if (l.code === "ABS" || l.code === "UNPAID") {
      bits.push(policy.dayRateBasis === "calendar_30"
        ? "أجر اليوم = الأساسي ÷ ٣٠"
        : `أجر اليوم = الأساسي ÷ ${fmt(policy.workingDays)} يوم عمل`);
    }
  }
  if (l.reason) bits.push(esc(l.reason));
  if (l.deferred > 0) bits.push(`رُحِّل للشهر الجاي: ${ltr(fmt(l.deferred))}`);
  return bits.join(" · ");
}

export function buildPayslipHTML(
  slip: Payslip, lines: PayslipLine[], opts: PayslipPrintOptions,
): string {
  const earn = lines.filter((l) => l.kind === "earning");
  const ded = lines.filter((l) => l.kind === "deduction");
  const label = (code: string) => esc(elementOf(code)?.labelAr ?? code);
  const W = opts.thermal ? "80mm" : "210mm";

  const rows = (ls: PayslipLine[], sign: string) => ls.map((l) => `
    <tr>
      <td class="n">
        <b>${label(l.code)}</b>
        ${(() => { const e = explain(l, opts.policy); return e ? `<i>${e}</i>` : ""; })()}
      </td>
      <td class="a">${ltr(sign + fmt(l.amount))}</td>
    </tr>`).join("");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>قسيمة راتب — ${esc(slip.staff_name)}</title>
<style>
  @page { size: ${opts.thermal ? "80mm auto" : "A4"}; margin: ${opts.thermal ? "4mm" : "12mm"}; }
  * { box-sizing: border-box; }
  body { width: ${W}; margin: 0 auto; padding: ${opts.thermal ? "2mm" : "0"};
         font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
         font-size: ${opts.thermal ? "11px" : "13px"}; color: #101828; line-height: 1.6; }
  .head { display: flex; align-items: flex-start; gap: 10px; border-bottom: 2px solid #101828; padding-bottom: 8px; }
  .head img { height: ${opts.thermal ? "26px" : "42px"}; object-fit: contain; }
  .head h1 { margin: 0; font-size: ${opts.thermal ? "13px" : "17px"}; }
  .head .sub { font-size: 11px; color: #667085; }
  .head .no { margin-inline-start: auto; text-align: end; font-size: 11px; color: #667085; }
  .head .no b { display: block; color: #101828; font-size: 12px; direction: ltr; }
  h2 { margin: 14px 0 4px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
  h2.e { color: #0b6b5f; }
  h2.d { color: #a92a24; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; border-bottom: 1px dotted #d0d5dd; }
  td.n b { font-weight: 600; }
  td.n i { display: block; font-style: normal; font-size: 10px; color: #667085; line-height: 1.45; }
  td.a { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; width: 1%; }
  .sum { display: flex; justify-content: space-between; padding: 5px 0; font-weight: 700; border-top: 1px solid #101828; margin-top: 4px; }
  .net { display: flex; justify-content: space-between; align-items: baseline;
         margin-top: 12px; padding: 9px 11px; background: #101828; color: #fff; border-radius: 4px; }
  .net b { font-size: ${opts.thermal ? "15px" : "19px"}; font-variant-numeric: tabular-nums; }
  .meta { margin-top: 10px; font-size: 10.5px; color: #667085; line-height: 1.7; }
  .sig { display: flex; justify-content: space-between; gap: 20px; margin-top: ${opts.thermal ? "16px" : "34px"}; font-size: 11px; color: #475467; }
  .sig div { flex: 1; border-top: 1px solid #98a2b3; padding-top: 5px; text-align: center; }
</style></head><body>
  <div class="head">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ""}
    <div>
      <h1>${esc(opts.clinicName)}</h1>
      <div class="sub">قسيمة راتب${opts.clinicPhone ? ` · ${esc(opts.clinicPhone)}` : ""}</div>
    </div>
    <div class="no">
      <b>${esc(opts.slipNo)}</b>
      ${esc(slip.staff_name)}<br>فترة ${ltr(esc(opts.period))}
    </div>
  </div>

  <h2 class="e">الزيادات</h2>
  <table>${rows(earn, "")}</table>
  <div class="sum"><span>إجمالي الأجر</span><span>${ltr(fmt(slip.gross))}</span></div>

  ${ded.length ? `
  <h2 class="d">القطوعات</h2>
  <table>${rows(ded, "−")}</table>
  <div class="sum"><span>إجمالي القطوعات</span><span>${ltr("−" + fmt(slip.deductions))}</span></div>` : ""}

  <div class="net"><span>الصافي المستحق</span><b>${ltr(fmt(slip.net) + " " + esc(opts.currency))}</b></div>

  <div class="meta">
    الأجر الأساسي الساري: ${ltr(fmt(slip.base_amount))} ·
    سقف الاستقطاع: ${ltr(String(opts.policy.deductionCapPct))}٪
    ${slip.deferred > 0 ? `<br><b>رُحِّل للشهر الجاي: ${ltr(fmt(slip.deferred))}</b> — لأن القطوعات تجاوزت السقف، فلا ينزل الصافي إلى صفر.` : ""}
    ${slip.paid_at ? `<br>دُفع ${slip.pay_method === "cash" ? "نقداً من الصندوق" : slip.pay_method === "bank" ? "حوالة بنكية" : "محفظة"} · ${esc(new Date(slip.paid_at).toLocaleDateString("ar-IQ"))}` : "<br>لم يُدفع بعد."}
  </div>

  <div class="sig"><div>توقيع المستلم</div><div>عن العيادة</div></div>
</body></html>`;
}

/** يفتح المستند بنافذة طباعة. يرجع false إذا حجب المتصفّح النوافذ. */
export function openPayslip(slip: Payslip, lines: PayslipLine[], opts: PayslipPrintOptions): boolean {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return false;
  w.document.open();
  w.document.write(buildPayslipHTML(slip, lines, opts));
  w.document.close();
  return true;
}

/** رقم القسيمة المعروض: PS-YYYY-MM-#### من معرّفها — ثابتٌ ومقروء. */
export function payslipNo(slip: Payslip, period: string): string {
  const tail = slip.id.replace(/[^0-9a-f]/gi, "").slice(-4).toUpperCase().padStart(4, "0");
  return `PS-${period.slice(0, 7)}-${tail}`;
}
