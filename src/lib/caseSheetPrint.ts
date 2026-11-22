// ============================================================================
// ورقةُ الحالة المطبوعة — «تقرير الحالة والعلاج» (طلبُ المالك ٢٢/١١): معلوماتُ العيادة، والحيوانُ وصاحبُه، والإقامة،
// وكيف عُولجت الحالة بأدويتها وجرعها، واللقاحات، والملاحظات، ونصائحُ للمالك، ومكانُ ختم العيادة وتوقيعها وتوقيع المالك
// — بحجم الورقة الذي يختاره الطبيب (A4 أو A5 أو Letter).
//
// بانٍ صِرفٌ بلا نصوص: كلُّ عنوانٍ وكلمةٍ تأتي من المنادي بنطاقه (csht) — الورقةُ تتبع لغةَ الواجهة ولا عربيةَ صلبة هنا
// (i18n-guard). وكلُّ ما يُكتب يُهرَّب. وورقةُ تقرير الزبون (careReportPrint) باقيةٌ كما هي بقاعدتها «بلا أسماء أدوية»؛
// وهذه تطبع الأدويةَ والجرعات لأن المالكَ طلبها صراحةً، والطبيبُ يُطفئها من نافذة الطباعة إن شاء.
//
// والطباعةُ داخل الضغطة (درسُ الراجيتة والواتساب): `openCaseSheet` تفتح النافذةَ وتكتب فيها بالضغطة نفسِها، فلا بيانات
// تُنتظر بعدها — النافذةُ تُحضَّر قبل أن يُضغط «اطبع».
// ============================================================================

export type Paper = "a4" | "a5" | "letter";
export const PAPERS: readonly Paper[] = ["a4", "a5", "letter"];

export type SheetBlock =
  | { kind: "grid"; title?: string; cells: [string, string][] }
  | { kind: "stats"; items: [string, string][] }
  | { kind: "table"; title: string; head: string[]; rows: string[][]; note?: string }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "text"; title: string; text: string };

export interface CaseSheet {
  lang: string;
  dir: "rtl" | "ltr";
  paper: Paper;
  /** عنوانُ الورقة («تقرير الحالة والعلاج»). */
  title: string;
  /** عنوانُ النافذة (التبويب) — الاسمُ والعنوان. */
  docTitle: string;
  clinic: { name: string; lines: string[]; logoUrl?: string | null; site?: string };
  /** سطورُ الترويسة المقابلة (تاريخ الطباعة، رقم الملف…). */
  meta: [string, string][];
  blocks: SheetBlock[];
  signatures: { label: string; value?: string }[];
  footer?: string;
  /** المعاينةُ داخل الصفحة بلا طباعةٍ تلقائيّة؛ النافذةُ تطبع حين تكتمل وتُغلق بعدها. */
  autoPrint: boolean;
}

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** مقاساتُ الورقة: حجمُ @page والهامشُ وخطُّ الأساس — A5 أصغرُ خطّاً كي لا يتكسّر جدولُ الجرعات. */
const PAPER: Record<Paper, { size: string; width: string; margin: string; font: string }> = {
  a4: { size: "A4", width: "210mm", margin: "12mm", font: "12.5px" },
  a5: { size: "A5", width: "148mm", margin: "8mm", font: "10.5px" },
  letter: { size: "Letter", width: "216mm", margin: "12mm", font: "12.5px" },
};

function blockHTML(b: SheetBlock): string {
  const title = (t?: string) => (t ? `<h2 class="sec"><span class="bar"></span>${esc(t)}</h2>` : "");
  switch (b.kind) {
    case "grid":
      return `${title(b.title)}<div class="grid">${b.cells.map(([k, v]) => `<div class="cell"><span class="k">${esc(k)}</span><span class="v" dir="auto">${esc(v) || "—"}</span></div>`).join("")}</div>`;
    case "stats":
      return `<div class="stats">${b.items.map(([v, k]) => `<div class="st"><div class="sv">${esc(v)}</div><div class="sk">${esc(k)}</div></div>`).join("")}</div>`;
    case "table":
      return `${title(b.title)}<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        b.rows.map((r) => `<tr>${r.map((c) => `<td dir="auto">${esc(c)}</td>`).join("")}</tr>`).join("")
      }</tbody></table>${b.note ? `<p class="tnote">${esc(b.note)}</p>` : ""}`;
    case "list":
      return `${title(b.title)}<ul class="list">${b.items.map((i) => `<li dir="auto">${esc(i)}</li>`).join("")}</ul>`;
    case "text":
      return `${title(b.title)}<div class="text" dir="auto">${esc(b.text)}</div>`;
  }
}

export function buildCaseSheetHTML(s: CaseSheet): string {
  const p = PAPER[s.paper] ?? PAPER.a4;
  const logo = s.clinic.logoUrl ? esc(s.clinic.logoUrl) : "";
  const css = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#0f172a}
    body{font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic","Noto Sans Arabic",Arial,sans-serif;font-size:${p.font};line-height:1.55}
    .sheet{width:${p.width};max-width:100%;margin:0 auto;padding:${p.margin}}
    .top{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid #1d4ed8;padding-bottom:8px;margin-bottom:10px}
    .clinic .name{font-size:1.45em;font-weight:800;color:#1e3a8a}
    .clinic .line{color:#475569;font-size:.92em}
    .logo img{max-height:64px;max-width:120px;object-fit:contain}
    .doc{text-align:end}
    .doc .title{font-size:1.3em;font-weight:800}
    .doc .meta{color:#475569;font-size:.9em}
    .doc .meta b{color:#0f172a}
    h2.sec{font-size:1.05em;font-weight:800;margin:12px 0 6px;display:flex;align-items:center;gap:6px;color:#0f172a;break-after:avoid}
    h2.sec .bar{display:inline-block;width:4px;height:1em;border-radius:2px;background:#1d4ed8}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 10px;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px}
    .cell{display:flex;flex-direction:column;min-width:0}
    .cell .k{font-size:.8em;color:#64748b}
    .cell .v{font-weight:700;overflow-wrap:anywhere}
    .stats{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
    .st{flex:1 1 0;min-width:70px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;padding:5px 6px;text-align:center}
    .st .sv{font-size:1.25em;font-weight:800;color:#1e3a8a}
    .st .sk{font-size:.8em;color:#475569}
    table{width:100%;border-collapse:collapse;font-size:.95em}
    thead{display:table-header-group}
    th{background:#f1f5f9;font-weight:800;text-align:start;padding:4px 6px;border:1px solid #e2e8f0}
    td{padding:4px 6px;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}
    tr{break-inside:avoid}
    .tnote{font-size:.85em;color:#64748b;margin:3px 0 0}
    ul.list{margin:0;padding-inline-start:18px}
    ul.list li{margin:2px 0}
    .text{white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px}
    .sign{display:grid;grid-template-columns:repeat(${Math.max(1, s.signatures.length)},minmax(0,1fr));gap:14px;margin-top:18px;break-inside:avoid}
    .sg{border:1px dashed #94a3b8;border-radius:10px;min-height:92px;padding:6px 8px;display:flex;flex-direction:column;justify-content:space-between}
    .sg .l{font-weight:800;font-size:.92em}
    .sg .val{color:#334155;font-size:.9em}
    .foot{margin-top:12px;border-top:1px solid #e2e8f0;padding-top:6px;color:#64748b;font-size:.8em;display:flex;justify-content:space-between;gap:8px}
    @media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:0;width:auto}}
    @page{size:${p.size};margin:${p.margin}}
    @media (max-width:520px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  const auto = s.autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},200);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>`
    : "";
  return `<!doctype html><html lang="${esc(s.lang)}" dir="${s.dir}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(s.docTitle)}</title><style>${css}</style></head><body data-paper="${s.paper}">
<div class="sheet">
  <div class="top">
    <div class="clinic">
      <div class="name">${esc(s.clinic.name)}</div>
      ${s.clinic.lines.filter(Boolean).map((l) => `<div class="line" dir="auto">${esc(l)}</div>`).join("")}
    </div>
    ${logo ? `<div class="logo"><img src="${logo}" alt=""/></div>` : ""}
    <div class="doc">
      <div class="title">${esc(s.title)}</div>
      ${s.meta.map(([k, v]) => `<div class="meta">${esc(k)}: <b dir="auto">${esc(v)}</b></div>`).join("")}
    </div>
  </div>
  ${s.blocks.map(blockHTML).join("\n")}
  ${s.signatures.length ? `<div class="sign">${s.signatures.map((g) => `<div class="sg"><span class="l">${esc(g.label)}</span><span class="val" dir="auto">${esc(g.value ?? "")}</span></div>`).join("")}</div>` : ""}
  <div class="foot"><span dir="auto">${esc(s.footer ?? "")}</span><span dir="ltr">${esc(s.clinic.site ?? "")}</span></div>
</div>
${auto}
</body></html>`;
}

/** يفتح الورقةَ بنافذةٍ ويكتبها **بالضغطة نفسِها** (لا await قبلها) — يُرجع false إن منعها حاجبُ النوافذ. */
export function openCaseSheet(html: string): boolean {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
