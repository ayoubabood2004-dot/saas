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

/* ── هويّةُ doctorVet بالورقة: أزرقُ الطبّ البيطريّ (brand-600 #1266d8 وسلّمُه) ومرجانُ العلامة — ألوانُ الواجهة نفسُها
 *    (tailwind.config.js)، وعلامةٌ مائيّة بشعار العيادة (أو كفّ doctorVet) تتكرّر على كلّ صفحةٍ مطبوعة. ── */
export function buildCaseSheetHTML(s: CaseSheet, o: RenderOpts = {}): string {
  const p = PAPER[s.paper] ?? PAPER.a4;
  const tagged = !!o.editable || !!o.marks;
  // بالطباعة وبعرض ما انطبع: سطرٌ أفرغه الطبيبُ لا يُرسم، وقسمٌ بلا محتوى لا يُرسم — وبالتعديل يبقى ليُضغط.
  const prune = !o.editable;
  const at = (k: string) => (tagged
    ? ` data-k="${esc(k)}"${o.editable ? ' contenteditable="plaintext-only" spellcheck="false"' : ""}${o.marks?.has(k) ? ' data-ed="1"' : ""}`
    : "");
  const title = (bk: string, t?: string) => (t !== undefined && (!prune || !blank(t))
    ? `<h2 class="sec"><span class="dot"></span><span class="ttl"${at(`${bk}.title`)}>${esc(t)}</span></h2>` : "");
  const tone = (t: Tone | undefined) => (t && TONES.includes(t) ? t : null);

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
        const cell = (r: Row, c: string, i: number) => {
          const k = `${b.key}.r.${r.key}.${i}`;
          const tn = i === b.statusCol ? tone(r.tone) : null;
          // الحالةُ شارةٌ بلونها — ما لم يعدّلها الطبيب (اللونُ لنصّ النظام) وما لم تفرغ.
          return tn && !blank(c) && !o.edited?.has(k)
            ? `<td dir="auto"><span class="pill t-${tn}"${at(k)}>${esc(c)}</span></td>`
            : `<td dir="auto"${at(k)}>${esc(c)}</td>`;
        };
        return `${title(b.key, b.title)}<div class="tbl"><table><thead><tr>${b.head.map((h, i) => `<th${at(`${b.key}.h.${i}`)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.cells.map((c, i) => cell(r, c, i)).join("")}</tr>`).join("")
        }</tbody></table></div>${b.note !== undefined && (!prune || !blank(b.note)) ? `<p class="tnote"${at(`${b.key}.note`)}>${esc(b.note)}</p>` : ""}`;
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
  const soc = s.clinic.socials ?? {};
  const socials = ([["facebook", "clinic.fb", FB_ICON], ["instagram", "clinic.ig", IG_ICON]] as const)
    .filter(([k]) => soc[k] !== undefined && (!prune || !blank(soc[k])))
    .map(([k, key, icon]) => `<span class="s">${icon}<span dir="ltr"${at(key)}>${esc(soc[k])}</span></span>`).join("");
  const css = `
    :root{--b:#1266d8;--b5:#2f7df2;--b7:#0f51b0;--b8:#13468d;--b9:#143b73;--b95:#0d2449;--b50:#eef6ff;--b100:#d9ebff;--b200:#bad9ff;--sky:#38bdf8;--ink:#0b1220;--mut:#475569;--sub:#64748b}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:"Segoe UI",system-ui,-apple-system,Tahoma,"Noto Naskh Arabic","Noto Sans Arabic",Arial,sans-serif;font-size:${p.font};line-height:1.55}
    .sheet{position:relative;width:${p.width};max-width:100%;margin:0 auto;padding:${p.margin}}
    .sheet>*:not(.wm){position:relative;z-index:1}
    .wm{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
    .wm img{width:60%;max-width:118mm;opacity:.065;filter:grayscale(100%)}
    .wm svg{width:46%;max-width:92mm;opacity:.05}
    .hd{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:14px}
    .hd .end{text-align:end}
    .eyebrow{display:inline-flex;align-items:center;gap:5px;font-size:.7em;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--b)}
    .eyebrow svg{width:13px;height:13px;flex:none}
    .name{font-size:1.6em;font-weight:800;color:var(--b95);line-height:1.2;margin-top:3px}
    .line{color:var(--mut);font-size:.86em;margin-top:2px}
    .soc{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:4px;color:var(--sub);font-size:.8em}
    .soc .s{display:inline-flex;align-items:center;gap:4px}
    .soc svg{width:12px;height:12px;flex:none}
    .mid img{display:block;max-height:78px;max-width:132px;object-fit:contain;margin:0 auto}
    .mid svg{display:block;width:56px;height:56px;margin:0 auto;border-radius:14px;box-shadow:0 4px 14px rgba(18,102,216,.25)}
    .title{font-size:1.5em;font-weight:800;color:var(--b);line-height:1.25}
    .meta{color:var(--mut);font-size:.86em;margin-top:2px}
    .meta b{color:var(--ink)}
    .band{height:4px;border-radius:4px;background:linear-gradient(90deg,var(--b),var(--b5) 55%,var(--sky));margin:10px 0 6px}
    [dir=rtl] .band{background:linear-gradient(270deg,var(--b),var(--b5) 55%,var(--sky))}
    h2.sec{display:flex;align-items:center;gap:8px;margin:14px 0 7px;font-size:1.02em;font-weight:800;color:var(--b95);break-after:avoid}
    h2.sec .dot{flex:none;width:8px;height:8px;border-radius:3px;background:var(--b);box-shadow:0 0 0 3px var(--b100)}
    h2.sec::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--b100),transparent)}
    [dir=rtl] h2.sec::after{background:linear-gradient(270deg,var(--b100),transparent)}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 16px;border:1px solid var(--b100);border-radius:12px;padding:9px 13px;background:rgba(238,246,255,.55)}
    .cell{display:flex;flex-direction:column;min-width:0}
    .cell .k{font-size:.74em;font-weight:700;color:#6b7f99}
    .cell .v{font-weight:700;color:var(--ink);overflow-wrap:anywhere}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:8px;margin:12px 0 2px}
    .st{position:relative;overflow:hidden;border:1px solid var(--b100);border-radius:12px;padding:9px 8px 7px;text-align:center;background:rgba(255,255,255,.7)}
    .st::before{content:"";position:absolute;inset-inline:0;top:0;height:3px;background:linear-gradient(90deg,var(--b),var(--sky))}
    .st .sv{font-size:1.32em;font-weight:800;color:var(--b7)}
    .st .sk{font-size:.76em;font-weight:600;color:var(--sub)}
    .tbl{border:1px solid var(--b100);border-radius:12px;overflow:hidden}
    table{width:100%;border-collapse:collapse;font-size:.93em}
    thead{display:table-header-group}
    th{background:rgba(238,246,255,.95);color:var(--b9);font-weight:800;text-align:start;padding:6px 10px;border-bottom:1px solid var(--b100)}
    td{padding:6px 10px;border-top:1px solid #edf2f8;vertical-align:top;overflow-wrap:anywhere}
    tbody tr:first-child td{border-top:none}
    tbody tr:nth-child(even) td{background:rgba(246,250,255,.6)}
    tr{break-inside:avoid}
    .pill{display:inline-block;padding:1px 10px;border-radius:999px;font-weight:700;font-size:.9em}
    .t-ok{background:#dcfce7;color:#166534}.t-bad{background:#fee2e2;color:#991b1b}.t-warn{background:#fef3c7;color:#92400e}.t-info{background:var(--b50);color:var(--b7)}
    .tnote{font-size:.82em;color:var(--sub);margin:4px 2px 0}
    ul.list{margin:0;padding:8px 13px;list-style:none;border:1px solid var(--b100);border-radius:12px;background:rgba(238,246,255,.4)}
    ul.list li{position:relative;padding-inline-start:16px;margin:3px 0}
    ul.list li::before{content:"";position:absolute;inset-inline-start:2px;top:.62em;width:6px;height:6px;border-radius:50%;background:var(--b)}
    .text{white-space:pre-wrap;border:1px solid var(--b100);border-inline-start:4px solid var(--b);border-radius:12px;padding:8px 13px;background:rgba(238,246,255,.4)}
    .k,.v,.sv,.sk,th,td,li,.ttl,.name,.line,.title,.meta,.l,.val,.ft{white-space:pre-line}
    .sign{display:grid;grid-template-columns:repeat(${Math.max(1, sigs.length)},minmax(0,1fr));gap:16px;margin-top:20px;break-inside:avoid}
    .sg{position:relative;border:1.5px dashed #9fb6d4;border-radius:14px;min-height:98px;padding:9px 12px;display:flex;flex-direction:column;justify-content:space-between}
    .sg .l{font-weight:800;font-size:.9em;color:var(--b95)}
    .sg .val{color:var(--mut);font-size:.88em}
    .sg.stamp::after{content:"";position:absolute;inset-inline-end:14px;top:50%;transform:translateY(-50%);width:64px;height:64px;border:1.5px dashed #c6d6ea;border-radius:50%}
    .foot{margin-top:16px;padding-top:8px;border-top:1px solid var(--b100);display:flex;justify-content:space-between;align-items:center;gap:10px;color:var(--sub);font-size:.76em}
    .foot .by{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .foot .by svg{width:12px;height:12px}
    @media screen{
      body{background:#e9eef5}
      .sheet{background:#fff;margin:16px auto;border-radius:6px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 14px 36px rgba(15,23,42,.12)}
    }
    @media print{.sheet{padding:0;width:auto;margin:0}.wm{position:fixed}}
    @page{size:${p.size};margin:${p.margin};@bottom-center{content:counter(page) " / " counter(pages);font-size:8pt;color:#94a3b8}}
    @media (max-width:520px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hd{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.hd .mid{display:none}.sheet{padding:14px}}
    ${tagged ? `@media screen{
      [data-k]{border-radius:3px;outline:1px dashed transparent;outline-offset:1px}
      [contenteditable]{cursor:text;min-width:1.5em;display:inline-block}
      td[contenteditable],th[contenteditable],li[contenteditable],div[contenteditable]{display:revert}
      [contenteditable]:hover{outline-color:#8cc0ff}
      [contenteditable]:focus{outline:2px solid var(--b);background:var(--b50)}
      [data-ed]{background:#fef08a;box-shadow:0 0 0 1px #facc15}
      [contenteditable]:empty::before{content:"\\2026";color:#cbd5e1}
    }` : ""}
  `;
  const auto = s.autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},250);});window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},200);});</script>`
    : "";
  return `<!doctype html><html lang="${esc(s.lang)}" dir="${s.dir === "ltr" ? "ltr" : "rtl"}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(s.docTitle)}</title><style>${css}</style></head><body data-paper="${esc(s.paper)}">
<div class="sheet">
  <div class="wm">${logo ? `<img src="${logo}" alt=""/>` : PAW("cswm")}</div>
  <header class="hd">
    <div class="clinic">
      <div class="eyebrow">${PAW("cseb")}doctorVet</div>
      <div class="name"${at("clinic.name")}>${esc(s.clinic.name)}</div>
      ${lines.map(([l, i]) => `<div class="line" dir="auto"${at(`clinic.line.${i}`)}>${esc(l)}</div>`).join("")}
      ${socials ? `<div class="soc">${socials}</div>` : ""}
    </div>
    <div class="mid">${logo ? `<img src="${logo}" alt=""/>` : PAW("csmd")}</div>
    <div class="doc end">
      <div class="title"${at("title")}>${esc(s.title)}</div>
      ${meta.map((f) => `<div class="meta"><span${at(`meta.${f.key}.k`)}>${esc(f.label)}</span>: <b dir="auto"${at(`meta.${f.key}.v`)}>${esc(f.value)}</b></div>`).join("")}
    </div>
  </header>
  <div class="band"></div>
  ${s.blocks.map(blockHTML).join("\n")}
  ${sigs.length ? `<div class="sign">${sigs.map((g) => `<div class="sg${g.key === "clinic" ? " stamp" : ""}"><span class="l"${at(`sig.${g.key}.k`)}>${esc(g.label)}</span><span class="val" dir="auto"${at(`sig.${g.key}.v`)}>${esc(g.value)}</span></div>`).join("")}</div>` : ""}
  <footer class="foot"><span class="ft" dir="auto"${at("footer")}>${esc(s.footer ?? "")}</span><span class="by" dir="ltr">${PAW("csft")}doctorVet${s.clinic.site && s.clinic.site.trim().toLowerCase() !== "doctorvet" ? ` · ${esc(s.clinic.site)}` : ""}</span></footer>
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
    v: 1, lang: str(o.lang) || "ar", dir: o.dir === "ltr" ? "ltr" : "rtl", paper, title: str(o.title), docTitle: str(o.docTitle),
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
