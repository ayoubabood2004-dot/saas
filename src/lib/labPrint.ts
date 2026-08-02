// Printable laboratory report (تقرير التحاليل) — the clinic-branded document a
// doctor prints or saves as PDF for the owner. Mirrors invoicePrint's approach:
// build a self-contained RTL HTML document, open a window, auto-invoke print.
import type { Pet, LabResult } from "@/types";
import { formatDate } from "@/lib/utils";

export interface LabPrintOptions {
  clinicName: string;
  clinicPhone?: string | null;
  logoUrl?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

const SPECIES_AR: Record<string, string> = { dog: "كلب", cat: "قطة", horse: "حصان", cow: "بقرة", bird: "طائر", rabbit: "أرنب", other: "أخرى" };
const FLAG_AR = { low: "منخفض ↓", normal: "طبيعي", high: "مرتفع ↑" } as const;
const FLAG_COLOR = { low: "#0369a1", normal: "#15803d", high: "#b91c1c" } as const;
const FLAG_BG = { low: "#e0f2fe", normal: "#f0fdf4", high: "#fee2e2" } as const;

function resultSection(r: LabResult): string {
  const rows = (r.values ?? []).map((v) => `
    <tr>
      <td class="pname"><b dir="ltr">${esc(v.abbr ?? "")}</b> ${esc(v.label ?? "")}</td>
      <td class="num"><b>${fmt(v.value)}</b> <span class="unit">${esc(v.unit)}</span></td>
      <td class="num">${v.low !== undefined && v.high !== undefined ? `${fmt(v.low)} – ${fmt(v.high)}` : "—"}</td>
      <td><span class="flag" style="color:${FLAG_COLOR[v.flag]};background:${FLAG_BG[v.flag]}">${FLAG_AR[v.flag]}</span></td>
    </tr>`).join("");
  const snap = r.kind === "snap" && r.snap_result
    ? `<div class="snap ${r.snap_result === "positive" ? "pos" : "neg"}">${r.snap_result === "positive" ? "النتيجة: إيجابية ⚠" : "النتيجة: سلبية ✓"}</div>`
    : "";
  return `
  <section class="result">
    <div class="rhead">
      <h3>${esc(r.panel_label)}</h3>
      <span dir="ltr">${esc(formatDate(r.taken_at, "ar"))}</span>
    </div>
    ${rows ? `<table><thead><tr><th>الفحص</th><th>النتيجة</th><th>النطاق الطبيعي</th><th>الحكم</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${snap}
    ${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}
    ${r.doctor ? `<p class="doc">الطبيب: ${esc(r.doctor)}</p>` : ""}
  </section>`;
}

export function buildLabReportHTML(pet: Pet, results: LabResult[], opts: LabPrintOptions): string {
  const sections = results.map(resultSection).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>تقرير التحاليل — ${esc(pet.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; padding: 28px; font-size: 13px; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #1266d8; padding-bottom: 14px; }
  header img { width: 58px; height: 58px; object-fit: contain; border-radius: 12px; }
  .cname { font-size: 21px; font-weight: 800; color: #1266d8; }
  .cphone { color: #475569; font-size: 12px; margin-top: 2px; }
  .doctitle { margin-inline-start: auto; text-align: left; }
  .doctitle b { font-size: 16px; }
  .doctitle span { display: block; color: #475569; font-size: 11px; margin-top: 2px; }
  .petbox { display: flex; flex-wrap: wrap; gap: 18px; background: #f1f5f9; border-radius: 12px; padding: 12px 16px; margin: 16px 0; }
  .petbox div b { display: block; font-size: 11px; color: #64748b; font-weight: 600; }
  .result { margin-bottom: 18px; break-inside: avoid; }
  .rhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .rhead h3 { font-size: 15px; color: #0f172a; }
  .rhead span { color: #64748b; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1266d8; color: #fff; padding: 7px 10px; font-size: 12px; text-align: right; }
  td { border-bottom: 1px solid #e2e8f0; padding: 7px 10px; }
  .num { direction: ltr; text-align: right; font-variant-numeric: tabular-nums; }
  .unit { color: #64748b; font-size: 11px; }
  .flag { border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 11px; }
  .snap { border-radius: 12px; padding: 12px; text-align: center; font-size: 16px; font-weight: 800; margin-top: 6px; }
  .snap.pos { background: #fee2e2; color: #b91c1c; }
  .snap.neg { background: #f0fdf4; color: #15803d; }
  .notes { background: #f8fafc; border-radius: 10px; padding: 9px 12px; margin-top: 8px; white-space: pre-wrap; color: #334155; }
  .doc { margin-top: 6px; color: #64748b; font-size: 11px; }
  footer { margin-top: 26px; border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; color: #64748b; font-size: 11px; }
  @media print { body { padding: 10mm; } }
</style></head><body>
<header>
  ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ""}
  <div>
    <div class="cname">${esc(opts.clinicName)}</div>
    ${opts.clinicPhone ? `<div class="cphone" dir="ltr">${esc(opts.clinicPhone)}</div>` : ""}
  </div>
  <div class="doctitle"><b>تقرير التحاليل المخبرية</b><span dir="ltr">${esc(formatDate(new Date().toISOString(), "ar"))}</span></div>
</header>
<div class="petbox">
  <div><b>الحيوان</b>${esc(pet.name)}</div>
  <div><b>النوع</b>${esc(SPECIES_AR[pet.species] ?? pet.species)}${pet.breed ? ` · ${esc(pet.breed)}` : ""}</div>
  ${pet.owner_name ? `<div><b>المربي</b>${esc(pet.owner_name)}</div>` : ""}
  ${pet.owner_phone ? `<div><b>الهاتف</b><span dir="ltr">${esc(pet.owner_phone)}</span></div>` : ""}
  ${pet.current_weight_kg ? `<div><b>الوزن</b>${fmt(pet.current_weight_kg)} كغم</div>` : ""}
</div>
${sections}
<footer><span>صدر عن ${esc(opts.clinicName)} عبر نظام doctorVet</span><span>نتمنى السلامة لـ${esc(pet.name)} 🐾</span></footer>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body></html>`;
}

/** Open the report in a print window. Returns false when the popup was blocked. */
export function openLabPrint(pet: Pet, results: LabResult[], opts: LabPrintOptions): boolean {
  const w = window.open("", "_blank", "width=860,height=940");
  if (!w) return false;
  w.document.open();
  w.document.write(buildLabReportHTML(pet, results, opts));
  w.document.close();
  return true;
}
