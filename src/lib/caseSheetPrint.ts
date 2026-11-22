// ============================================================================
// ورقةُ الحالة المطبوعة — «تقرير الحالة والعلاج» / «تقرير الفندقة» (طلبُ المالك ٢٢/١١): معلوماتُ العيادة، والحيوانُ
// وصاحبُه، والإقامةُ يوماً بيوم، وكيف عُولجت الحالة بأدويتها وجرعها، واللقاحات، والملاحظات، ونصائحُ للمالك، ومكانُ ختم
// العيادة وتوقيعها وتوقيع المالك — بحجم الورقة الذي يختاره الطبيب (A4 أو A5 أو Letter).
//
// بانٍ صِرفٌ بلا نصوص: كلُّ عنوانٍ وكلمةٍ تأتي من المنادي بنطاقه (csht) — الورقةُ تتبع لغةَ الواجهة ولا عربيةَ صلبة هنا
// (i18n-guard). وكلُّ ما يُكتب يُهرَّب — ومنه ما كتبه الطبيبُ بيده.
//
// **كلُّ كلمةٍ تُعدَّل** (قرارُ المالك: «الدكتور يكدر يعدّل كل شيء وكل كلمة مكتوبة»): لكلّ نصٍّ بالورقة مفتاحٌ ثابت
// (`mapTexts`) لا يتغيّر بإطفاء قسمٍ أو تبديل الورق — والتعديلُ `{from, to}` على مفتاحه يُطبَّق ما دام نصُّ النظام
// تحته هو `from` نفسُه: بياناتٌ تغيّرت (مدى آخر، جرعةٌ انعطت بعده) تُسقط التعديلَ القديم ولا تلصقه على نصٍّ غيره.
// وما انطبع يُحفظ (0287) نموذجاً لا HTML: يُعاد رسمُه مُهرَّباً دائماً، ونصُّ النظام الأصليّ يُستعاد من التعديلات.
//
// والطباعةُ داخل الضغطة (درسُ الراجيتة والواتساب): `openCaseSheet` تفتح النافذةَ وتكتب فيها بالضغطة نفسِها.
// ============================================================================

export type Paper = "a4" | "a5" | "letter";
export const PAPERS: readonly Paper[] = ["a4", "a5", "letter"];

/** خانةٌ بعنوانها وقيمتها: الشبكة، وسطورُ الترويسة المقابلة، والتواقيع. */
export interface Field { key: string; label: string; value: string }
export interface Stat { key: string; value: string; label: string }
export interface Row { key: string; cells: string[] }
export interface Item { key: string; text: string }

/** `fixed`: محتوىً محرّرُه خانةٌ بالنافذة (النصائح، ملاحظةُ الطبيب) — لا يُعدَّل داخل الورقة، وعنوانُه يُعدَّل. */
export type SheetBlock =
  | { key: string; kind: "grid"; title?: string; cells: Field[] }
  | { key: string; kind: "stats"; items: Stat[] }
  | { key: string; kind: "table"; title: string; head: string[]; rows: Row[]; note?: string }
  | { key: string; kind: "list"; title: string; items: Item[]; fixed?: boolean }
  | { key: string; kind: "text"; title: string; text: string; fixed?: boolean };

export interface CaseSheet {
  v: 1;
  lang: string;
  dir: "rtl" | "ltr";
  paper: Paper;
  /** عنوانُ الورقة («تقرير الفندقة»…). */
  title: string;
  /** عنوانُ النافذة (التبويب) — الاسمُ والعنوان. */
  docTitle: string;
  clinic: { name: string; lines: string[]; logoUrl?: string | null; site?: string };
  /** سطورُ الترويسة المقابلة (تاريخ الطباعة، رقم الملف…). */
  meta: Field[];
  blocks: SheetBlock[];
  signatures: Field[];
  footer?: string;
  /** المعاينةُ داخل الصفحة بلا طباعةٍ تلقائيّة؛ النافذةُ تطبع حين تكتمل وتُغلق بعدها. */
  autoPrint: boolean;
}

/** تعديلُ الطبيب على نصٍّ بمفتاحه: كان `from` (نصُّ النظام) وصار `to`. `label` مكانُه مقروءاً لسجلّ التعديلات. */
export interface SheetEdit { k: string; from: string; to: string; label?: string }
export type Edits = Record<string, SheetEdit>;

/** نوعُ المكان — يسمّي به المنادي مكانَ التعديل («عنوان الورقة»، «اسم العيادة»…). */
export type Spot = "title" | "clinic" | "meta" | "heading" | "label" | "value" | "stat" | "head" | "cell" | "note" | "item" | "text" | "sig" | "footer";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type TextFn = (key: string, text: string, spot: Spot, crumbs: string[]) => string;

/** يمرّ على كلّ نصٍّ يُعدَّل بمفتاحه الثابت (بترتيب الورقة) ويبني ورقةً جديدة بما يرجعه `fn`. `crumbs` كلماتُ
 *  الورقة نفسِها حول المكان (عنوانُ القسم، أوّلُ خانةٍ بالسطر، رأسُ العمود) — لسجلّ التعديلات بلا نصٍّ هنا. */
export function mapTexts(s: CaseSheet, fn: TextFn): CaseSheet {
  const title = fn("title", s.title, "title", []);
  const clinic = {
    ...s.clinic,
    name: fn("clinic.name", s.clinic.name, "clinic", []),
    lines: s.clinic.lines.map((l, i) => fn(`clinic.line.${i}`, l, "clinic", [])),
  };
  const meta = s.meta.map((f) => ({
    key: f.key,
    label: fn(`meta.${f.key}.k`, f.label, "meta", [f.label]),
    value: fn(`meta.${f.key}.v`, f.value, "meta", [f.label]),
  }));
  const blocks: SheetBlock[] = s.blocks.map((b) => {
    const head = (t: string | undefined) => (t === undefined ? undefined : fn(`${b.key}.title`, t, "heading", [t]));
    const bt = "title" in b && b.title ? b.title : "";
    switch (b.kind) {
      case "grid":
        return { ...b, title: head(b.title), cells: b.cells.map((c) => ({
          key: c.key,
          label: fn(`${b.key}.${c.key}.k`, c.label, "label", [bt, c.label]),
          value: fn(`${b.key}.${c.key}.v`, c.value, "value", [bt, c.label]),
        })) };
      case "stats":
        return { ...b, items: b.items.map((it) => ({
          key: it.key,
          value: fn(`${b.key}.${it.key}.v`, it.value, "stat", [it.label]),
          label: fn(`${b.key}.${it.key}.k`, it.label, "stat", [it.label]),
        })) };
      case "table":
        return { ...b, title: head(b.title)!,
          head: b.head.map((h, i) => fn(`${b.key}.h.${i}`, h, "head", [bt, h])),
          rows: b.rows.map((r) => ({ key: r.key, cells: r.cells.map((c, i) => fn(`${b.key}.r.${r.key}.${i}`, c, "cell", [bt, r.cells[0] ?? "", b.head[i] ?? ""])) })),
          ...(b.note !== undefined ? { note: fn(`${b.key}.note`, b.note, "note", [bt]) } : {}),
        };
      case "list":
        return { ...b, title: head(b.title)!, items: b.fixed ? b.items : b.items.map((it) => ({ key: it.key, text: fn(`${b.key}.i.${it.key}`, it.text, "item", [bt]) })) };
      case "text":
        return { ...b, title: head(b.title)!, text: b.fixed ? b.text : fn(`${b.key}.text`, b.text, "text", [bt]) };
    }
  });
  const signatures = s.signatures.map((g) => ({
    key: g.key,
    label: fn(`sig.${g.key}.k`, g.label, "sig", [g.label]),
    value: fn(`sig.${g.key}.v`, g.value, "sig", [g.label]),
  }));
  const footer = s.footer === undefined ? undefined : fn("footer", s.footer, "footer", []);
  return { ...s, title, clinic, meta, blocks, signatures, ...(footer !== undefined ? { footer } : {}) };
}

/** كلُّ نصوص الورقة بمفاتيحها. */
export function sheetTexts(s: CaseSheet): Map<string, string> {
  const m = new Map<string, string>();
  mapTexts(s, (k, x) => { m.set(k, x); return x; });
  return m;
}

/** يطبّق التعديلات: تعديلٌ يُطبَّق ما دام نصُّ النظام تحته `from` نفسُه — وإلا سقط (بياناتٌ تغيّرت تحته). */
export function applyEdits(s: CaseSheet, edits: Edits): { sheet: CaseSheet; applied: SheetEdit[] } {
  const applied: SheetEdit[] = [];
  const sheet = mapTexts(s, (k, x) => {
    const e = edits[k];
    if (!e || e.from !== x || e.to === x) return x;
    applied.push({ k, from: x, to: e.to, ...(e.label ? { label: e.label } : {}) });
    return e.to;
  });
  return { sheet, applied };
}

/** نصُّ النظام الأصليّ من ورقةٍ انطبعت وتعديلاتِها. */
export function revertEdits(s: CaseSheet, list: readonly SheetEdit[]): CaseSheet {
  const m = new Map(list.map((e) => [e.k, e]));
  return mapTexts(s, (k, x) => { const e = m.get(k); return e && e.to === x ? e.from : x; });
}

/** مقاساتُ الورقة: حجمُ @page والهامشُ وخطُّ الأساس — A5 أصغرُ خطّاً كي لا يتكسّر جدولُ الجرعات. */
const PAPER: Record<Paper, { size: string; width: string; margin: string; font: string }> = {
  a4: { size: "A4", width: "210mm", margin: "12mm", font: "12.5px" },
  a5: { size: "A5", width: "148mm", margin: "8mm", font: "10.5px" },
  letter: { size: "Letter", width: "216mm", margin: "12mm", font: "12.5px" },
};

export interface RenderOpts {
  /** المعاينةُ تُعدَّل: كلُّ نصٍّ بمفتاحه قابلٌ للكتابة، والفارغُ يبقى مرسوماً ليُضغط. */
  editable?: boolean;
  /** المعدَّلُ يُعلَّم على الشاشة وحدها (لا بالطباعة). */
  marks?: ReadonlySet<string>;
}

const blank = (x: string | undefined) => !x || !x.trim();

export function buildCaseSheetHTML(s: CaseSheet, o: RenderOpts = {}): string {
  const p = PAPER[s.paper] ?? PAPER.a4;
  const tagged = !!o.editable || !!o.marks;
  // بالطباعة وبعرض ما انطبع: سطرٌ أفرغه الطبيبُ لا يُرسم، وقسمٌ بلا محتوى لا يُرسم — وبالتعديل يبقى ليُضغط.
  const prune = !o.editable;
  const at = (k: string) => (tagged
    ? ` data-k="${esc(k)}"${o.editable ? ' contenteditable="plaintext-only" spellcheck="false"' : ""}${o.marks?.has(k) ? ' data-ed="1"' : ""}`
    : "");
  const title = (bk: string, t?: string) => (t !== undefined && (!prune || !blank(t))
    ? `<h2 class="sec"><span class="bar"></span><span class="ttl"${at(`${bk}.title`)}>${esc(t)}</span></h2>` : "");

  const blockHTML = (b: SheetBlock): string => {
    switch (b.kind) {
      case "grid": {
        const cells = prune ? b.cells.filter((c) => !blank(c.label) || !blank(c.value)) : b.cells;
        if (prune && !cells.length) return "";
        return `${title(b.key, b.title)}<div class="grid">${cells.map((c) =>
          `<div class="cell"><span class="k"${at(`${b.key}.${c.key}.k`)}>${esc(c.label)}</span><span class="v" dir="auto"${at(`${b.key}.${c.key}.v`)}>${esc(c.value) || (prune ? "—" : "")}</span></div>`).join("")}</div>`;
      }
      case "stats": {
        const items = prune ? b.items.filter((i) => !blank(i.value) || !blank(i.label)) : b.items;
        if (prune && !items.length) return "";
        return `<div class="stats">${items.map((i) =>
          `<div class="st"><div class="sv"${at(`${b.key}.${i.key}.v`)}>${esc(i.value)}</div><div class="sk"${at(`${b.key}.${i.key}.k`)}>${esc(i.label)}</div></div>`).join("")}</div>`;
      }
      case "table": {
        const rows = prune ? b.rows.filter((r) => r.cells.some((c) => !blank(c))) : b.rows;
        if (prune && !rows.length) return "";
        return `${title(b.key, b.title)}<table><thead><tr>${b.head.map((h, i) => `<th${at(`${b.key}.h.${i}`)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.cells.map((c, i) => `<td dir="auto"${at(`${b.key}.r.${r.key}.${i}`)}>${esc(c)}</td>`).join("")}</tr>`).join("")
        }</tbody></table>${b.note !== undefined && (!prune || !blank(b.note)) ? `<p class="tnote"${at(`${b.key}.note`)}>${esc(b.note)}</p>` : ""}`;
      }
      case "list": {
        const items = prune ? b.items.filter((i) => !blank(i.text)) : b.items;
        if (prune && !items.length) return "";
        return `${title(b.key, b.title)}<ul class="list">${items.map((i) => `<li dir="auto"${b.fixed ? "" : at(`${b.key}.i.${i.key}`)}>${esc(i.text)}</li>`).join("")}</ul>`;
      }
      case "text":
        if (prune && blank(b.text)) return "";
        return `${title(b.key, b.title)}<div class="text" dir="auto"${b.fixed ? "" : at(`${b.key}.text`)}>${esc(b.text)}</div>`;
    }
  };

  const logo = s.clinic.logoUrl ? esc(s.clinic.logoUrl) : "";
  const meta = prune ? s.meta.filter((f) => !blank(f.label) || !blank(f.value)) : s.meta;
  const sigs = prune ? s.signatures.filter((g) => !blank(g.label) || !blank(g.value)) : s.signatures;
  const lines = s.clinic.lines.map((l, i) => [l, i] as const).filter(([l]) => !prune || !blank(l));
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
    h2.sec .bar{display:inline-block;width:4px;height:1em;border-radius:2px;background:#1d4ed8;flex:none}
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
    .k,.v,.sv,.sk,th,td,li,.ttl,.name,.line,.title,.meta,.l,.val,.ft{white-space:pre-line}
    .sign{display:grid;grid-template-columns:repeat(${Math.max(1, sigs.length)},minmax(0,1fr));gap:14px;margin-top:18px;break-inside:avoid}
    .sg{border:1px dashed #94a3b8;border-radius:10px;min-height:92px;padding:6px 8px;display:flex;flex-direction:column;justify-content:space-between}
    .sg .l{font-weight:800;font-size:.92em}
    .sg .val{color:#334155;font-size:.9em}
    .foot{margin-top:12px;border-top:1px solid #e2e8f0;padding-top:6px;color:#64748b;font-size:.8em;display:flex;justify-content:space-between;gap:8px}
    @media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:0;width:auto}}
    @page{size:${p.size};margin:${p.margin}}
    @media (max-width:520px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    ${tagged ? `@media screen{
      [data-k]{border-radius:3px;outline:1px dashed transparent;outline-offset:1px}
      [contenteditable]{cursor:text;min-width:1.5em;display:inline-block}
      td[contenteditable],th[contenteditable],li[contenteditable],div[contenteditable]{display:revert}
      [contenteditable]:hover{outline-color:#93c5fd}
      [contenteditable]:focus{outline:2px solid #2563eb;background:#eff6ff}
      [data-ed]{background:#fef08a;box-shadow:0 0 0 1px #facc15}
      [contenteditable]:empty::before{content:"\\2026";color:#cbd5e1}
    }` : ""}
  `;
  const auto = s.autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},200);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>`
    : "";
  return `<!doctype html><html lang="${esc(s.lang)}" dir="${s.dir === "ltr" ? "ltr" : "rtl"}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(s.docTitle)}</title><style>${css}</style></head><body data-paper="${esc(s.paper)}">
<div class="sheet">
  <div class="top">
    <div class="clinic">
      <div class="name"${at("clinic.name")}>${esc(s.clinic.name)}</div>
      ${lines.map(([l, i]) => `<div class="line" dir="auto"${at(`clinic.line.${i}`)}>${esc(l)}</div>`).join("")}
    </div>
    ${logo ? `<div class="logo"><img src="${logo}" alt=""/></div>` : ""}
    <div class="doc">
      <div class="title"${at("title")}>${esc(s.title)}</div>
      ${meta.map((f) => `<div class="meta"><span${at(`meta.${f.key}.k`)}>${esc(f.label)}</span>: <b dir="auto"${at(`meta.${f.key}.v`)}>${esc(f.value)}</b></div>`).join("")}
    </div>
  </div>
  ${s.blocks.map(blockHTML).join("\n")}
  ${sigs.length ? `<div class="sign">${sigs.map((g) => `<div class="sg"><span class="l"${at(`sig.${g.key}.k`)}>${esc(g.label)}</span><span class="val" dir="auto"${at(`sig.${g.key}.v`)}>${esc(g.value)}</span></div>`).join("")}</div>` : ""}
  <div class="foot"><span class="ft" dir="auto"${at("footer")}>${esc(s.footer ?? "")}</span><span dir="ltr">${esc(s.clinic.site ?? "")}</span></div>
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

/* ── القراءةُ من القاعدة (0287): الورقةُ المحفوظة تُقرأ بحذر — jsonb قد يحمل أيَّ شيء ── */
const str = (x: unknown): string => (typeof x === "string" ? x : x == null ? "" : String(x));
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const fieldOf = (x: unknown, i: number): Field => { const o = obj(x); return { key: str(o.key) || String(i), label: str(o.label), value: str(o.value) }; };

/** ورقةٌ محفوظة كما تُرسم — أو null إن لم تكن ورقةً أصلاً. كلُّ نصٍّ يصير نصّاً، وكلُّ مفتاحٍ ناقصٍ يأخذ موضعه. */
export function readSheet(x: unknown): CaseSheet | null {
  const o = obj(x);
  if (o.v !== 1 || !Array.isArray(o.blocks)) return null;
  const paper = PAPERS.includes(o.paper as Paper) ? (o.paper as Paper) : "a4";
  const c = obj(o.clinic);
  const blocks: SheetBlock[] = [];
  arr(o.blocks).forEach((bx, bi) => {
    const b = obj(bx);
    const key = str(b.key) || `b${bi}`;
    const t = str(b.title);
    switch (b.kind) {
      case "grid": blocks.push({ key, kind: "grid", ...(b.title !== undefined ? { title: t } : {}), cells: arr(b.cells).map(fieldOf) }); break;
      case "stats": blocks.push({ key, kind: "stats", items: arr(b.items).map((ix, i) => { const it = obj(ix); return { key: str(it.key) || String(i), value: str(it.value), label: str(it.label) }; }) }); break;
      case "table": blocks.push({ key, kind: "table", title: t, head: arr(b.head).map(str),
        rows: arr(b.rows).map((rx, i) => { const r = obj(rx); return { key: str(r.key) || String(i), cells: arr(r.cells).map(str) }; }),
        ...(b.note !== undefined ? { note: str(b.note) } : {}) }); break;
      case "list": blocks.push({ key, kind: "list", title: t, items: arr(b.items).map((ix, i) => { const it = obj(ix); return { key: str(it.key) || String(i), text: str(it.text) }; }), ...(b.fixed ? { fixed: true } : {}) }); break;
      case "text": blocks.push({ key, kind: "text", title: t, text: str(b.text), ...(b.fixed ? { fixed: true } : {}) }); break;
      default: break;
    }
  });
  return {
    v: 1, lang: str(o.lang) || "ar", dir: o.dir === "ltr" ? "ltr" : "rtl", paper, title: str(o.title), docTitle: str(o.docTitle),
    clinic: { name: str(c.name), lines: arr(c.lines).map(str), logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null, site: str(c.site) },
    meta: arr(o.meta).map(fieldOf), blocks, signatures: arr(o.signatures).map(fieldOf),
    ...(o.footer !== undefined ? { footer: str(o.footer) } : {}),
    autoPrint: false,
  };
}

/** تعديلاتٌ محفوظة كما تُقرأ — كلُّ عنصرٍ بمفتاحٍ نصّيّ، والباقي يُرمى. */
export function readEdits(x: unknown): SheetEdit[] {
  return arr(x).map(obj).filter((e) => typeof e.k === "string" && e.k)
    .map((e) => ({ k: str(e.k), from: str(e.from), to: str(e.to), ...(typeof e.label === "string" && e.label ? { label: e.label } : {}) }));
}
