import type { ReturnGroup } from "@/lib/expiry";

/* ============================================================================
 * كشفُ الإرجاع للطباعة (م٤، docs/expiry-plan.md ٣·٢) — ورقةٌ تُسلَّم للمندوب أو تُحفظ
 * بالعيادة: مجمَّعةٌ بالشركة، لكلّ مادّة عددُها وتاريخُها وكلفتُها، ومجموعُ كلّ شركة
 * والمجموعُ الكلّي. **بالمبالغ** عمداً — هذه ورقةُ العيادة لتعرف ما يرجع لها؛ أمّا نصُّ
 * الواتساب (`returnListText`) فبلا أسعار كما قُرّر بـم١.
 *
 * النصوصُ كلُّها تصل من المستدعي بـ`t` (لا نصَّ صلباً هنا)، والقيمُ تُهرَّب.
 * ========================================================================= */

export interface ReturnPrintLabels {
  title: string; company: string; item: string; qty: string; expiry: string;
  cost: string; total: string; groupTotal: string; grandTotal: string; printedAt: string;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function buildReturnStatementHTML(groups: ReturnGroup[], L: ReturnPrintLabels, opts: {
  lang: string; clinicName: string; money: (n: number) => string; qty: (n: number) => string; date: string;
}): string {
  const dir = opts.lang.startsWith("ar") ? "rtl" : "ltr";
  const day = (d: unknown) => String(d ?? "").slice(0, 10).replace(/-/g, "/") || "—";
  const grand = groups.reduce((s, g) => s + g.value, 0);
  const body = groups.map((g) => `
    <section>
      <h2>${esc(L.company)}: ${esc(g.company)}</h2>
      <table>
        <thead><tr><th>${esc(L.item)}</th><th>${esc(L.qty)}</th><th>${esc(L.expiry)}</th><th>${esc(L.cost)}</th><th>${esc(L.total)}</th></tr></thead>
        <tbody>${g.rows.map((p) => {
          const q = Number(p.stock) || 0, c = Number(p.purchase_price) || 0;
          return `<tr><td>${esc(p.name)}</td><td class="n">${esc(opts.qty(q))}</td><td class="n" dir="ltr">${esc(day(p.expiry_date))}</td><td class="n">${esc(opts.money(c))}</td><td class="n">${esc(opts.money(q * c))}</td></tr>`;
        }).join("")}</tbody>
        <tfoot><tr><td colspan="4">${esc(L.groupTotal)}</td><td class="n">${esc(opts.money(g.value))}</td></tr></tfoot>
      </table>
    </section>`).join("");
  return `<!doctype html><html lang="${esc(opts.lang)}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(L.title)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:#111;margin:24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}
  h1{font-size:20px;margin:0} h2{font-size:15px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:start}
  th{font-size:12px;color:#555} .n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
  tfoot td{font-weight:700;border-top:2px solid #999}
  .grand{margin-top:18px;font-size:16px;font-weight:800;display:flex;justify-content:space-between;border-top:2px solid #111;padding-top:8px}
  @media print{body{margin:10mm}}
</style></head><body>
<header><h1>${esc(L.title)}</h1><div>${esc(opts.clinicName)} · ${esc(L.printedAt)} ${esc(opts.date)}</div></header>
${body}
<div class="grand"><span>${esc(L.grandTotal)}</span><span>${esc(opts.money(grand))}</span></div>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`;
}

/** يفتح الكشفَ بنافذةٍ ويطبع. `false` = المتصفّحُ حجب النافذة (يُقال للمستخدم). */
export function openReturnStatement(html: string): boolean {
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
