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
/** شكلُ الورقة: رسميّ، حديث، أنيق — يُحفظ مع التقرير فيُعاد رسمُه بشكله. */
export type Theme = "formal" | "modern" | "elegant";
export const THEMES: readonly Theme[] = ["formal", "modern", "elegant"];
export const DEFAULT_THEME: Theme = "formal";

/** خانةٌ بعنوانها وقيمتها: الشبكة، وسطورُ الترويسة المقابلة، والتواقيع. */
export interface Field { key: string; label: string; value: string }
export interface Stat { key: string; value: string; label: string }
/** لونُ حالة السطر (انطت/ما انطت/متأخّرة…) — يُرسم شارةً بعمود الحالة، ويسقط إن عدّل الطبيبُ نصَّها (اللونُ للنصّ الأصليّ). */
export type Tone = "ok" | "bad" | "warn" | "info";
export const TONES: readonly Tone[] = ["ok", "bad", "warn", "info"];
export interface Row { key: string; cells: string[]; tone?: Tone }
export interface Item { key: string; text: string }

/** `fixed`: محتوىً محرّرُه خانةٌ بالنافذة (النصائح، ملاحظةُ الطبيب) — لا يُعدَّل داخل الورقة، وعنوانُه يُعدَّل. */
export type SheetBlock =
  | { key: string; kind: "grid"; title?: string; cells: Field[] }
  | { key: string; kind: "stats"; items: Stat[] }
  | { key: string; kind: "table"; title: string; head: string[]; rows: Row[]; note?: string; statusCol?: number }
  | { key: string; kind: "list"; title: string; items: Item[]; fixed?: boolean }
  | { key: string; kind: "text"; title: string; text: string; fixed?: boolean };

export interface CaseSheet {
  v: 1;
  lang: string;
  dir: "rtl" | "ltr";
  paper: Paper;
  /** الشكل — الغائبُ (ورقةٌ قبل الأشكال) يُرسم بالافتراضيّ. */
  theme?: Theme;
  /** عنوانُ الورقة («تقرير الفندقة»…). */
  title: string;
  /** عنوانُ النافذة (التبويب) — الاسمُ والعنوان. */
  docTitle: string;
  clinic: { name: string; lines: string[]; logoUrl?: string | null; site?: string; socials?: { facebook?: string; instagram?: string } };
  /** سطورُ الترويسة المقابلة (تاريخ الطباعة، رقم الملف…). */
  meta: Field[];
  blocks: SheetBlock[];
  signatures: Field[];
  footer?: string;
  /** تصريحُ الطبيب بالورقة لا سجلُّ النظام: «العلاج مكتمل» (كلُّ الجرع انعطت ولو ما خُتمت) — يُحفظ مع التقرير فيُعرف بعدها. */
  claims?: { complete?: boolean };
  /** المعاينةُ داخل الصفحة بلا طباعةٍ تلقائيّة؛ النافذةُ تطبع حين تكتمل وتُغلق بعدها. */
  autoPrint: boolean;
}

/** تعديلُ الطبيب على نصٍّ بمفتاحه: كان `from` (نصُّ النظام) وصار `to`. `label` مكانُه مقروءاً لسجلّ التعديلات. */
export interface SheetEdit { k: string; from: string; to: string; label?: string }
export type Edits = Record<string, SheetEdit>;

/** نوعُ المكان — يسمّي به المنادي مكانَ التعديل («عنوان الورقة»، «اسم العيادة»…). */
export type Spot = "title" | "clinic" | "meta" | "heading" | "label" | "value" | "stat" | "head" | "cell" | "note" | "item" | "text" | "sig" | "footer";

/** علامةُ doctorVet (الكفُّ بوسادةِ مُحدِّد QR ومركزٍ مرجانيّ — public/favicon.svg) مضمَّنةً: تُطبع بلا ملفٍّ خارجيّ. */
const PAW = (id: string) => `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f7df2"/><stop offset="1" stop-color="#1257c0"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#${id})"/><g transform="translate(9.6 9.6) scale(0.7)" fill="#fff"><rect x="4" y="12.5" width="13" height="13" rx="4.5"/><rect x="25.5" y="4.5" width="13" height="13" rx="4.5"/><rect x="47" y="12.5" width="13" height="13" rx="4.5"/><path fill-rule="evenodd" d="M26.5 27h11a10 10 0 0 1 10 10v11a10 10 0 0 1-10 10h-11a10 10 0 0 1-10-10V37a10 10 0 0 1 10-10zm1 4.5h9a5.5 5.5 0 0 1 5.5 5.5v9a5.5 5.5 0 0 1-5.5 5.5h-9a5.5 5.5 0 0 1-5.5-5.5v-9a5.5 5.5 0 0 1 5.5-5.5z"/><rect x="25.5" y="36" width="13" height="13" rx="4" fill="#ff7a45"/></g></svg>`;
const FB_ICON = `<svg viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;
const IG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="csig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".45" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#csig)"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.3" fill="#fff"/></svg>`;

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
    ...(s.clinic.socials ? { socials: {
      ...(s.clinic.socials.facebook !== undefined ? { facebook: fn("clinic.fb", s.clinic.socials.facebook, "clinic", []) } : {}),
      ...(s.clinic.socials.instagram !== undefined ? { instagram: fn("clinic.ig", s.clinic.socials.instagram, "clinic", []) } : {}),
    } } : {}),
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
          rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c, i) => fn(`${b.key}.r.${r.key}.${i}`, c, "cell", [bt, r.cells[0] ?? "", b.head[i] ?? ""])) })),
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
  /** مفاتيحُ نصوصٍ عدّلها الطبيب — شارةُ لون الحالة تسقط عنها (اللونُ يقول نصَّ النظام لا ما كتبه). */
  edited?: ReadonlySet<string>;
}

const blank = (x: string | undefined) => !x || !x.trim();
/** خطُّ الواجهة نفسُه (IBM Plex Sans Arabic، tailwind fontFamily.arabic) — والنافذةُ تنتظره قبل الطباعة (مهلةٌ ثمّ الاحتياطيّ). */
const FONT_HREF = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";

type Grid = Extract<SheetBlock, { kind: "grid" }>;
type Stats = Extract<SheetBlock, { kind: "stats" }>;
type Table = Extract<SheetBlock, { kind: "table" }>;

/* ── ثلاثةُ أشكالٍ من نموذجٍ واحد (طلبُ المالك: «احترافي») — رسميّ (ورقةُ عيادة بجداول وختمٍ كحليّ)، وحديث (شريطُ العلامة
 *    وبطاقاتٌ وخطٌّ زمنيّ)، وأنيق (ترويسةٌ بالوسط وعناوينُ بزخرفة). الهيكلُ واحد: الحيوانُ وصاحبُه متجاوران، والإقامةُ سطرٌ واحد،
 *    واليومياتُ زمنيّة، وكلُّ نصٍّ بمفتاحه بكلّ شكل (التعديلُ لا يعرف الشكل)، والشكلُ يُحفظ مع التقرير فيُعاد كما انطبع. ── */
export function buildCaseSheetHTML(s: CaseSheet, o: RenderOpts = {}): string {
  const p = PAPER[s.paper] ?? PAPER.a4;
  const theme: Theme = s.theme && THEMES.includes(s.theme) ? s.theme : DEFAULT_THEME;
  const tagged = !!o.editable || !!o.marks;
  // بالطباعة وبعرض ما انطبع: سطرٌ أفرغه الطبيبُ لا يُرسم، وقسمٌ بلا محتوى لا يُرسم — وبالتعديل يبقى ليُضغط.
  const prune = !o.editable;
  const rtl = s.dir !== "ltr";
  const at = (k: string) => (tagged
    ? ` data-k="${esc(k)}"${o.editable ? ' contenteditable="plaintext-only" spellcheck="false"' : ""}${o.marks?.has(k) ? ' data-ed="1"' : ""}`
    : "");
  const span = (k: string, text: string, cls = "", rtlAuto = true) =>
    `<span${cls ? ` class="${cls}"` : ""}${rtlAuto ? ' dir="auto"' : ""}${at(k)}>${esc(text)}</span>`;
  const tone = (t: Tone | undefined) => (t && TONES.includes(t) ? t : null);
  const digits = (n: number) => (rtl ? String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d))) : String(n));
  let secNo = 0;
  const heading = (bk: string, t?: string) => {
    if (t === undefined || (prune && blank(t))) return "";
    secNo++;
    const ttl = span(`${bk}.title`, t, "ttl", false);
    if (theme === "formal") return `<h2 class="sec"><span class="no">${digits(secNo)}</span>${ttl}</h2>`;
    if (theme === "elegant") return `<h2 class="sec"><span class="orn"></span>${ttl}<span class="orn"></span></h2>`;
    return `<h2 class="sec"><span class="dot"></span>${ttl}</h2>`;
  };
  const fields = (b: Grid) => (prune ? b.cells.filter((c) => !blank(c.label) || !blank(c.value)) : b.cells);
  const val = (c: Field) => esc(c.value) || (prune ? "—" : "");
  const kv = (bk: string, c: Field) =>
    `<span class="k"${at(`${bk}.${c.key}.k`)}>${esc(c.label)}</span><span class="v" dir="auto"${at(`${bk}.${c.key}.v`)}>${val(c)}</span>`;
  const dl = (b: Grid) => `<div class="dl">${fields(b).map((c) => `<div class="dr">${kv(b.key, c)}</div>`).join("")}</div>`;

  /* الحيوانُ وصاحبُه متجاوران: جدولٌ رسميّ بأربعة أعمدة، أو بطاقتان، أو لوحتان بنقاط. */
  const pair = (a: Grid, b: Grid) => {
    if (theme === "formal") {
      const A = fields(a), B = fields(b), n = Math.max(A.length, B.length);
      const cells = (bk: string, c?: Field) => (c
        ? `<td class="ik"><span${at(`${bk}.${c.key}.k`)}>${esc(c.label)}</span></td><td class="iv" dir="auto"><span${at(`${bk}.${c.key}.v`)}>${val(c)}</span></td>`
        : `<td class="ik e"></td><td class="iv"></td>`);
      const rows = Array.from({ length: n }, (_, i) => `<tr>${cells(a.key, A[i])}${cells(b.key, B[i])}</tr>`).join("");
      return `<table class="info"><thead><tr><th colspan="2">${span(`${a.key}.title`, a.title ?? "", "", false)}</th><th colspan="2">${span(`${b.key}.title`, b.title ?? "", "", false)}</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const card = (g: Grid) => `<section class="${theme === "modern" ? "card" : "panel"}"><h3 class="ct">${span(`${g.key}.title`, g.title ?? "", "", false)}</h3>${dl(g)}</section>`;
    return `<div class="pair">${card(a)}${card(b)}</div>`;
  };
  /* الإقامةُ سطرٌ واحد: جدولٌ برأسٍ وقيمة، أو رقاقات، أو سطرٌ بالوسط. */
  const stay = (b: Grid) => {
    const F = fields(b);
    if (prune && !F.length) return "";
    if (theme === "formal") {
      return `${heading(b.key, b.title)}<table class="strip"><tr>${F.map((c) => `<th><span${at(`${b.key}.${c.key}.k`)}>${esc(c.label)}</span></th>`).join("")}</tr><tr>${
        F.map((c) => `<td dir="auto"><span${at(`${b.key}.${c.key}.v`)}>${val(c)}</span></td>`).join("")}</tr></table>`;
    }
    return `${heading(b.key, b.title)}<div class="${theme === "modern" ? "chips" : "strip"}">${F.map((c) => `<div class="chip">${kv(b.key, c)}</div>`).join("")}</div>`;
  };
  const stats = (b: Stats) => {
    const items = prune ? b.items.filter((i) => !blank(i.value) || !blank(i.label)) : b.items;
    if (prune && !items.length) return "";
    return `<div class="stats">${items.map((i) => `<div class="st"><div class="sv"${at(`${b.key}.${i.key}.v`)}>${esc(i.value)}</div><div class="sk"${at(`${b.key}.${i.key}.k`)}>${esc(i.label)}</div></div>`).join("")}</div>`;
  };
  const table = (b: Table) => {
    const rows = prune ? b.rows.filter((r) => r.cells.some((c) => !blank(c))) : b.rows;
    if (prune && !rows.length) return "";
    // اليومياتُ خطٌّ زمنيّ بالحديث وقائمةٌ بتواريخها بالأنيق — المفاتيحُ مفاتيحُ الجدول نفسُها.
    if (b.key === "days" && theme !== "formal") {
      const li = (r: Row) => `<li><span class="d" dir="auto"${at(`${b.key}.r.${r.key}.0`)}>${esc(r.cells[0] ?? "")}</span><span class="e" dir="auto"${at(`${b.key}.r.${r.key}.1`)}>${esc(r.cells[1] ?? "")}</span></li>`;
      return `${heading(b.key, b.title)}<ol class="${theme === "modern" ? "tl" : "diary"}">${rows.map(li).join("")}</ol>`;
    }
    const cell = (r: Row, c: string, i: number) => {
      const k = `${b.key}.r.${r.key}.${i}`;
      const tn = i === b.statusCol ? tone(r.tone) : null;
      // الحالةُ شارةٌ بلونها — ما لم يعدّلها الطبيب (اللونُ لنصّ النظام) وما لم تفرغ.
      return tn && !blank(c) && !o.edited?.has(k)
        ? `<td dir="auto"><span class="pill t-${tn}"${at(k)}>${esc(c)}</span></td>`
        : `<td dir="auto"${at(k)}>${esc(c)}</td>`;
    };
    return `${heading(b.key, b.title)}<div class="tbl"><table><thead><tr>${b.head.map((h, i) => `<th${at(`${b.key}.h.${i}`)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.cells.map((c, i) => cell(r, c, i)).join("")}</tr>`).join("")
    }</tbody></table></div>${b.note !== undefined && (!prune || !blank(b.note)) ? `<p class="tnote"${at(`${b.key}.note`)}>${esc(b.note)}</p>` : ""}`;
  };
  const blockHTML = (b: SheetBlock): string => {
    switch (b.kind) {
      case "grid": {
        if (b.key === "stay") return stay(b);
        const F = fields(b);
        if (prune && !F.length) return "";
        return `${heading(b.key, b.title)}${theme === "formal" ? `<div class="box">${dl(b)}</div>` : `<div class="${theme === "modern" ? "card solo" : "panel solo"}">${dl(b)}</div>`}`;
      }
      case "stats": return stats(b);
      case "table": return table(b);
      case "list": {
        const items = prune ? b.items.filter((i) => !blank(i.text)) : b.items;
        if (prune && !items.length) return "";
        return `${heading(b.key, b.title)}<ul class="list${b.key === "tips" ? " tips" : ""}">${items.map((i) => `<li dir="auto"${b.fixed ? "" : at(`${b.key}.i.${i.key}`)}>${esc(i.text)}</li>`).join("")}</ul>`;
      }
      case "text":
        if (prune && blank(b.text)) return "";
        return `${heading(b.key, b.title)}<div class="text" dir="auto"${b.fixed ? "" : at(`${b.key}.text`)}>${esc(b.text)}</div>`;
    }
  };
  // الحيوانُ وصاحبُه إن تجاورا بالنموذج يُرسمان معاً؛ وغيرُهما بالترتيب.
  const body: string[] = [];
  for (let i = 0; i < s.blocks.length; i++) {
    const b = s.blocks[i], n = s.blocks[i + 1];
    if (b.kind === "grid" && b.key === "pet" && n?.kind === "grid" && n.key === "owner" && (!prune || fields(b).length || fields(n).length)) {
      body.push(pair(b, n)); i++; continue;
    }
    body.push(blockHTML(b));
  }

  const logo = s.clinic.logoUrl ? esc(s.clinic.logoUrl) : "";
  const mark = (id: string) => (logo ? `<img src="${logo}" alt=""/>` : PAW(id));
  const meta = prune ? s.meta.filter((f) => !blank(f.label) || !blank(f.value)) : s.meta;
  const sigs = prune ? s.signatures.filter((g) => !blank(g.label) || !blank(g.value)) : s.signatures;
  const lines = s.clinic.lines.map((l, i) => [l, i] as const).filter(([l]) => !prune || !blank(l));
  const soc = s.clinic.socials ?? {};
  const socials = ([["facebook", "clinic.fb", FB_ICON], ["instagram", "clinic.ig", IG_ICON]] as const)
    .filter(([k]) => soc[k] !== undefined && (!prune || !blank(soc[k])))
    .map(([k, key, icon]) => `<span class="s">${icon}<span dir="ltr"${at(key)}>${esc(soc[k])}</span></span>`).join("");
  const name = `<div class="cname"${at("clinic.name")}>${esc(s.clinic.name)}</div>`;
  const lineHTML = lines.length ? `<div class="clines">${lines.map(([l, i]) => `<span dir="auto"${at(`clinic.line.${i}`)}>${esc(l)}</span>`).join("")}</div>` : "";
  const socHTML = socials ? `<div class="soc">${socials}</div>` : "";
  const title = `<div class="dtitle"${at("title")}>${esc(s.title)}</div>`;
  const metaHTML = meta.map((f) => `<div class="dmeta"><span${at(`meta.${f.key}.k`)}>${esc(f.label)}</span>: <b dir="auto"${at(`meta.${f.key}.v`)}>${esc(f.value)}</b></div>`).join("");
  const site = s.clinic.site && s.clinic.site.trim().toLowerCase() !== "doctorvet" ? ` · ${esc(s.clinic.site)}` : "";
  const header = theme === "formal"
    ? `<header class="hd"><div class="hd-id"><div class="hd-logo">${mark("csmd")}</div><div class="hd-txt">${name}${lineHTML}${socHTML}</div></div><div class="hd-doc">${title}${metaHTML}</div></header><div class="rule"></div>`
    : theme === "modern"
      ? `<header class="hd"><div class="hd-id"><div class="hd-logo">${mark("csmd")}</div><div class="hd-txt"><div class="eyebrow">doctorVet</div>${name}${lineHTML}${socHTML}</div></div><div class="hd-doc">${title}${metaHTML}</div></header>`
      : `<header class="hd"><div class="hd-logo">${mark("csmd")}</div>${name}${lineHTML}${socHTML}<div class="hd-title">${title}</div><div class="hd-meta">${metaHTML}</div></header><div class="rule"></div>`;
  const sign = sigs.length
    ? `<div class="sign">${sigs.map((g) => `<div class="sg${g.key === "clinic" ? " stamp" : ""}"><div class="sg-l"${at(`sig.${g.key}.k`)}>${esc(g.label)}</div><div class="sg-space"></div><div class="sg-line"></div><div class="sg-v" dir="auto"${at(`sig.${g.key}.v`)}>${esc(g.value)}</div></div>`).join("")}</div>`
    : "";

  const base = `
    :root{--b:#1266d8;--b5:#2f7df2;--b7:#0f51b0;--b9:#143b73;--nv:#0d2449;--b50:#eef6ff;--b100:#d9ebff;--b200:#bad9ff;--sky:#38bdf8;--ink:#1e293b;--mut:#475569;--sub:#64748b;--ln:#cbd5e1;--ln2:#e2e8f0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,"Noto Sans Arabic",Arial,sans-serif;font-size:${p.font};line-height:1.6}
    .sheet{position:relative;width:${p.width};max-width:100%;margin:0 auto;padding:${p.margin}}
    .sheet>*:not(.wm){position:relative;z-index:1}
    .wm{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
    .wm img{width:56%;max-width:112mm;opacity:.06;filter:grayscale(100%)}
    .wm svg{width:42%;max-width:86mm;opacity:.045}
    .k,.v,th,td,li,.ttl,.cname,.clines span,.dtitle,.dmeta,.sg-l,.sg-v,.ft,.sv,.sk,.d,.e{white-space:pre-line}
    .soc{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:.8em}
    .soc .s{display:inline-flex;align-items:center;gap:4px}
    .soc svg{width:12px;height:12px;flex:none}
    table{width:100%;border-collapse:collapse}
    thead{display:table-header-group}
    tr,li,.dr,.chip,.st{break-inside:avoid}
    h2.sec{break-after:avoid}
    .pill{display:inline-block;padding:0 10px;border-radius:999px;font-weight:600;font-size:.9em}
    .t-ok{background:#dcfce7;color:#166534}.t-bad{background:#fee2e2;color:#991b1b}.t-warn{background:#fef3c7;color:#92400e}.t-info{background:var(--b50);color:var(--b7)}
    .tnote{font-size:.82em;color:var(--sub);margin:4px 2px 0}
    .sign{display:grid;grid-template-columns:repeat(${Math.max(1, sigs.length)},minmax(0,1fr));gap:36px;margin-top:26px;break-inside:avoid}
    .sg{position:relative}
    .sg-l{font-weight:700;font-size:.9em}
    .sg-space{height:56px}
    .sg-line{border-top:1px solid #334155}
    .sg-v{color:var(--mut);font-size:.86em;margin-top:3px}
    .sg.stamp .sg-space::after{content:"";position:absolute;inset-inline-end:10%;top:22px;width:58px;height:58px;border:1.5px dashed #b8c7dc;border-radius:50%}
    .foot{margin-top:18px;padding-top:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;color:var(--sub);font-size:.74em}
    .foot .by{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .foot .by svg{width:12px;height:12px}
    @media screen{body{background:#e9eef5}.sheet{background:#fff;margin:16px auto;border-radius:4px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 14px 36px rgba(15,23,42,.12)}}
    @media print{.sheet{padding:0;width:auto;margin:0}.wm{position:fixed}}
    @page{size:${p.size};margin:${p.margin};@bottom-center{content:counter(page) " / " counter(pages);font-size:8pt;color:#94a3b8}}
  `;
  const THEME_CSS: Record<Theme, string> = {
    formal: `
      .hd{display:flex;justify-content:space-between;align-items:center;gap:18px}
      .hd-id{display:flex;align-items:center;gap:12px;min-width:0}
      .hd-logo img{display:block;max-height:66px;max-width:112px;object-fit:contain}
      .hd-logo svg{display:block;width:54px;height:54px}
      .cname{font-size:1.55em;font-weight:700;color:var(--nv);line-height:1.25}
      .clines{display:flex;flex-wrap:wrap;gap:0 14px;color:var(--mut);font-size:.84em}
      .soc{color:var(--sub);margin-top:1px}
      .hd-doc{flex:none;text-align:end}
      .dtitle{display:inline-block;background:var(--nv);color:#fff;font-weight:700;font-size:1.12em;padding:5px 16px;border-radius:2px;letter-spacing:.01em}
      .dmeta{color:var(--mut);font-size:.82em;margin-top:3px}
      .dmeta b{color:var(--ink);font-weight:600}
      .rule{border-top:2.5px solid var(--nv);border-bottom:1px solid var(--b);height:5px;margin:12px 0 14px}
      h2.sec{display:flex;align-items:center;gap:8px;margin:16px 0 7px;font-size:1.02em;font-weight:700;color:var(--nv);border-bottom:1px solid var(--ln);padding-bottom:4px}
      h2.sec .no{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 4px;border-radius:2px;background:var(--nv);color:#fff;font-size:.82em}
      table.info{border:1px solid var(--ln);font-size:.95em}
      table.info th{background:var(--nv);color:#fff;font-weight:600;text-align:start;padding:5px 10px}
      table.info td{border:1px solid var(--ln);padding:4px 10px}
      table.info td.ik{background:#f3f6fa;color:var(--mut);font-weight:600;width:15%;font-size:.92em}
      table.info td.ik.e{background:transparent}
      table.info td.iv{font-weight:600;width:35%}
      table.strip{border:1px solid var(--ln);font-size:.95em}
      table.strip th{background:#f3f6fa;color:var(--mut);font-weight:600;font-size:.88em;text-align:start;padding:4px 10px;border:1px solid var(--ln)}
      table.strip td{border:1px solid var(--ln);padding:5px 10px;font-weight:600}
      .stats{display:flex;border:1px solid var(--ln);margin-top:10px;background:#f8fafc}
      .st{flex:1 1 0;padding:6px 12px;border-inline-start:1px solid var(--ln)}
      .st:first-child{border-inline-start:none}
      .st .sv{font-size:1.12em;font-weight:700;color:var(--nv)}
      .st .sk{font-size:.8em;color:var(--mut)}
      .tbl table{border:1px solid var(--ln);font-size:.94em}
      .tbl th{background:#f3f6fa;color:var(--nv);font-weight:700;text-align:start;padding:5px 10px;border:1px solid var(--ln)}
      .tbl td{border:1px solid var(--ln);padding:5px 10px;vertical-align:top;overflow-wrap:anywhere}
      .box{border:1px solid var(--ln);padding:6px 10px}
      .dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 16px}
      .dr{display:flex;flex-direction:column}
      .dr .k{font-size:.78em;color:var(--mut);font-weight:600}
      .dr .v{font-weight:600}
      ul.list{margin:0;padding-inline-start:20px}
      ul.list li{margin:3px 0}
      .text{border-inline-start:3px solid var(--nv);padding:4px 12px;background:#f8fafc}
      .sg-l{color:var(--nv)}
      .foot{border-top:1px solid var(--ln)}
    `,
    modern: `
      .hd{display:flex;justify-content:space-between;align-items:center;gap:16px;color:#fff;border-radius:14px;padding:14px 18px;background:linear-gradient(${rtl ? 225 : 135}deg,#0f51b0,#1266d8 50%,#2f7df2)}
      .hd-id{display:flex;align-items:center;gap:13px;min-width:0}
      .hd-logo{flex:none;width:64px;height:64px;border-radius:15px;background:#fff;display:grid;place-items:center;box-shadow:0 4px 14px rgba(13,36,73,.22)}
      .hd-logo img{max-width:54px;max-height:54px;object-fit:contain}
      .hd-logo svg{width:48px;height:48px}
      .eyebrow{font-size:.66em;letter-spacing:.18em;text-transform:uppercase;font-weight:700;opacity:.85}
      .cname{font-size:1.5em;font-weight:700;line-height:1.25}
      .clines{display:flex;flex-wrap:wrap;gap:0 12px;font-size:.84em;opacity:.92}
      .soc{opacity:.95;margin-top:1px}
      .hd-doc{flex:none;text-align:end}
      .dtitle{font-size:1.3em;font-weight:700}
      .dmeta{font-size:.8em;opacity:.92}
      .dmeta b{font-weight:600}
      h2.sec{display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-size:1.02em;font-weight:700;color:var(--nv)}
      h2.sec .dot{flex:none;width:9px;height:9px;border-radius:3px;background:var(--b);box-shadow:0 0 0 3px var(--b100)}
      h2.sec::after{content:"";flex:1;height:1px;background:var(--b100)}
      .pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
      .card{border:1px solid var(--b100);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.78)}
      .card .ct{margin:0;padding:5px 12px;background:var(--b50);color:var(--b9);font-size:.95em;font-weight:700;border-bottom:1px solid var(--b100)}
      .card.solo{padding:2px 0}
      .dl{padding:6px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 14px}
      .card.solo .dl{grid-template-columns:repeat(3,minmax(0,1fr))}
      .dr{display:flex;flex-direction:column;min-width:0}
      .dr .k,.chip .k{font-size:.74em;color:#6b7f99;font-weight:600}
      .dr .v{font-weight:600;overflow-wrap:anywhere}
      .chips{display:flex;flex-wrap:wrap;gap:8px}
      .chip{display:flex;flex-direction:column;border:1px solid var(--b100);background:var(--b50);border-radius:10px;padding:4px 12px}
      .chip .v{font-weight:700;color:var(--b9)}
      .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:8px;margin-top:12px}
      .st{position:relative;overflow:hidden;border:1px solid var(--b100);border-radius:12px;padding:8px;text-align:center;background:rgba(255,255,255,.78)}
      .st::before{content:"";position:absolute;inset-inline:0;top:0;height:3px;background:linear-gradient(90deg,var(--b),var(--sky))}
      .st .sv{font-size:1.28em;font-weight:700;color:var(--b7)}
      .st .sk{font-size:.76em;color:var(--sub);font-weight:600}
      .tl{list-style:none;margin:0;padding:0;position:relative}
      .tl::before{content:"";position:absolute;inset-inline-start:6px;top:8px;bottom:8px;width:2px;background:var(--b100)}
      .tl li{position:relative;padding-inline-start:24px;margin:0 0 7px}
      .tl li::before{content:"";position:absolute;inset-inline-start:1px;top:.42em;width:8px;height:8px;border-radius:50%;background:#fff;border:2.5px solid var(--b)}
      .tl .d{display:block;font-weight:700;color:var(--b9);font-size:.9em}
      .tl .e{display:block}
      .tbl{border:1px solid var(--b100);border-radius:12px;overflow:hidden}
      .tbl table{font-size:.94em}
      .tbl th{background:var(--b50);color:var(--b9);font-weight:700;text-align:start;padding:6px 10px;border-bottom:1px solid var(--b100)}
      .tbl td{padding:6px 10px;border-top:1px solid #edf2f8;vertical-align:top;overflow-wrap:anywhere}
      .tbl tbody tr:first-child td{border-top:none}
      .tbl tbody tr:nth-child(even) td{background:rgba(246,250,255,.65)}
      ul.list{margin:0;padding:8px 14px;list-style:none;border:1px solid var(--b100);border-radius:12px;background:rgba(238,246,255,.55)}
      ul.list li{position:relative;padding-inline-start:16px;margin:3px 0}
      ul.list li::before{content:"";position:absolute;inset-inline-start:2px;top:.66em;width:6px;height:6px;border-radius:50%;background:var(--b)}
      .text{border:1px solid var(--b100);border-inline-start:4px solid var(--b);border-radius:12px;padding:8px 13px;background:rgba(238,246,255,.55)}
      .sg-l{color:var(--nv)}
      .foot{border-top:2px solid var(--b100)}
    `,
    elegant: `
      .hd{text-align:center}
      .hd-logo img{display:block;margin:0 auto;max-height:72px;max-width:124px;object-fit:contain}
      .hd-logo svg{display:block;margin:0 auto;width:54px;height:54px}
      .cname{font-size:1.7em;font-weight:700;color:var(--nv);margin-top:6px;line-height:1.25}
      .clines{display:flex;justify-content:center;flex-wrap:wrap;gap:0 16px;color:var(--mut);font-size:.84em;margin-top:2px}
      .soc{justify-content:center;color:var(--sub);margin-top:2px}
      .hd-title{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px}
      .hd-title::before,.hd-title::after{content:"";flex:0 1 110px;height:1px;background:linear-gradient(90deg,transparent,var(--b))}
      .hd-title::after{background:linear-gradient(90deg,var(--b),transparent)}
      .dtitle{font-size:1.28em;font-weight:700;color:var(--b)}
      .hd-meta{display:flex;justify-content:center;flex-wrap:wrap;gap:2px 22px;margin-top:2px}
      .dmeta{color:var(--mut);font-size:.82em}
      .dmeta b{color:var(--ink);font-weight:600}
      .rule{border-top:1px solid var(--nv);border-bottom:1px solid var(--nv);height:4px;margin:12px 0 14px}
      h2.sec{display:flex;align-items:center;justify-content:center;gap:12px;margin:18px 0 9px;font-size:1.02em;font-weight:700;color:var(--nv);letter-spacing:.02em}
      h2.sec .orn{flex:0 1 80px;height:1px;background:var(--b200)}
      .pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
      .panel{border-top:2px solid var(--nv);padding-top:4px}
      .panel .ct{margin:0 0 2px;text-align:center;font-size:.98em;font-weight:700;color:var(--nv)}
      .panel.solo{border-top:none}
      .dl{display:grid;grid-template-columns:minmax(0,1fr)}
      .panel.solo .dl{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px}
      .dr{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dotted #c3cfde}
      .dr .k{flex:none;color:var(--mut);font-size:.86em}
      .dr .v{font-weight:600;overflow-wrap:anywhere;min-width:0}
      .strip{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 0}
      .strip .chip{display:flex;flex-direction:column;align-items:center;padding:0 16px;border-inline-start:1px solid var(--b200)}
      .strip .chip:first-child{border-inline-start:none}
      .strip .k{font-size:.76em;color:var(--mut)}
      .strip .v{font-weight:700;color:var(--nv)}
      .stats{display:flex;justify-content:center;flex-wrap:wrap;margin-top:10px}
      .st{padding:2px 18px;text-align:center;border-inline-start:1px solid var(--b200)}
      .st:first-child{border-inline-start:none}
      .st .sv{font-size:1.2em;font-weight:700;color:var(--b)}
      .st .sk{font-size:.78em;color:var(--mut)}
      .diary{list-style:none;margin:0;padding:0}
      .diary li{display:flex;gap:12px;padding:4px 0;border-bottom:1px dotted #c3cfde}
      .diary .d{flex:none;min-width:30%;font-weight:700;color:var(--nv)}
      .diary .e{flex:1}
      .tbl table{font-size:.94em;border-top:1.5px solid var(--nv);border-bottom:1.5px solid var(--nv)}
      .tbl th{color:var(--nv);font-weight:700;text-align:start;padding:5px 10px;border-bottom:1px solid var(--nv)}
      .tbl td{padding:5px 10px;border-bottom:1px solid var(--ln2);vertical-align:top;overflow-wrap:anywhere}
      ul.list{margin:0;padding-inline-start:20px}
      ul.list li{margin:3px 0}
      ul.list li::marker{color:var(--b)}
      .text{text-align:center;font-style:normal;padding:4px 16px;color:var(--ink)}
      .sign{gap:60px}
      .sg{text-align:center}
      .sg-l{color:var(--nv)}
      .sg.stamp .sg-space::after{inset-inline-end:auto;inset-inline-start:50%;transform:translateX(${rtl ? "50%" : "-50%"})}
      .foot{border-top:1px solid var(--nv)}
    `,
  };
  const editCSS = tagged ? `@media screen{
      [data-k]{border-radius:3px;outline:1px dashed transparent;outline-offset:1px}
      [contenteditable]{cursor:text;min-width:1.5em;display:inline-block}
      td[contenteditable],th[contenteditable],li[contenteditable],div[contenteditable]{display:revert}
      [contenteditable]:hover{outline-color:#8cc0ff}
      [contenteditable]:focus{outline:2px solid var(--b);background:var(--b50)}
      .hd [contenteditable]:focus{color:inherit}
      [data-ed]{background:#fef08a !important;color:#1e293b !important;box-shadow:0 0 0 1px #facc15}
      [contenteditable]:empty::before{content:"\\2026";color:#cbd5e1}
    }` : "";
  const phone = `@media (max-width:520px){.pair{grid-template-columns:minmax(0,1fr)}.dl,.card.solo .dl,.panel.solo .dl{grid-template-columns:repeat(2,minmax(0,1fr))}.hd{flex-wrap:wrap}.sheet{padding:14px}table.info td.ik{width:auto}}`;
  // الطباعةُ حين يصل الخطّ (document.fonts.ready) أو بعد أربع ثوانٍ بالاحتياطيّ — لا نافذةٌ معلّقة بلا نت.
  const auto = s.autoPrint
    ? `<script>(function(){var done=false;function go(){if(done)return;done=true;window.focus();window.print();}
window.addEventListener('load',function(){var f=document.fonts&&document.fonts.ready;(f?f:Promise.resolve()).then(function(){setTimeout(go,150);});});
setTimeout(go,4000);window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});})();</script>`
    : "";
  return `<!doctype html><html lang="${esc(s.lang)}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(s.docTitle)}</title><link rel="stylesheet" href="${FONT_HREF}"/><style>${base}${THEME_CSS[theme]}${phone}${editCSS}</style></head><body data-paper="${esc(s.paper)}" data-theme="${theme}">
<div class="sheet">
  <div class="wm">${mark("cswm")}</div>
  ${header}
  ${body.join("\n")}
  ${sign}
  <footer class="foot"><span class="ft" dir="auto"${at("footer")}>${esc(s.footer ?? "")}</span><span class="by" dir="ltr">${PAW("csft")}doctorVet${site}</span></footer>
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
        rows: arr(b.rows).map((rx, i) => { const r = obj(rx); return { key: str(r.key) || String(i), cells: arr(r.cells).map(str), ...(TONES.includes(r.tone as Tone) ? { tone: r.tone as Tone } : {}) }; }),
        ...(b.note !== undefined ? { note: str(b.note) } : {}),
        ...(typeof b.statusCol === "number" && Number.isInteger(b.statusCol) ? { statusCol: b.statusCol } : {}) }); break;
      case "list": blocks.push({ key, kind: "list", title: t, items: arr(b.items).map((ix, i) => { const it = obj(ix); return { key: str(it.key) || String(i), text: str(it.text) }; }), ...(b.fixed ? { fixed: true } : {}) }); break;
      case "text": blocks.push({ key, kind: "text", title: t, text: str(b.text), ...(b.fixed ? { fixed: true } : {}) }); break;
      default: break;
    }
  });
  return {
    v: 1, lang: str(o.lang) || "ar", dir: o.dir === "ltr" ? "ltr" : "rtl", paper, ...(THEMES.includes(o.theme as Theme) ? { theme: o.theme as Theme } : {}),
    title: str(o.title), docTitle: str(o.docTitle),
    clinic: { name: str(c.name), lines: arr(c.lines).map(str), logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null, site: str(c.site),
      ...(c.socials ? { socials: { ...(obj(c.socials).facebook !== undefined ? { facebook: str(obj(c.socials).facebook) } : {}), ...(obj(c.socials).instagram !== undefined ? { instagram: str(obj(c.socials).instagram) } : {}) } } : {}) },
    meta: arr(o.meta).map(fieldOf), blocks, signatures: arr(o.signatures).map(fieldOf),
    ...(o.footer !== undefined ? { footer: str(o.footer) } : {}),
    ...(obj(o.claims).complete === true ? { claims: { complete: true } } : {}),
    autoPrint: false,
  };
}

/** تعديلاتٌ محفوظة كما تُقرأ — كلُّ عنصرٍ بمفتاحٍ نصّيّ، والباقي يُرمى. */
export function readEdits(x: unknown): SheetEdit[] {
  return arr(x).map(obj).filter((e) => typeof e.k === "string" && e.k)
    .map((e) => ({ k: str(e.k), from: str(e.from), to: str(e.to), ...(typeof e.label === "string" && e.label ? { label: e.label } : {}) }));
}
