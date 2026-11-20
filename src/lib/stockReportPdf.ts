/* ============================================================================
 * تقريرُ الجرد ملفَّ PDF (طلبُ المالك ١٧/١١: «نكدر نطبع جرد للعيادة … اريد همين يكون تصدير بي دي اف»).
 *
 * الورقةُ نفسُها التي تُطبع (`buildStockReportHTML`) — لا تقريرٌ ثانٍ يُكتب بجانبها فيفترقان: تُرسم بإطارٍ مخفيٍّ بعرض صفحة A4،
 * ويُرسم المتصفّحُ عربيتَها (لا مكتبةُ PDF تقطّع الحروف)، ثمّ تُصوَّر صفحةً صفحة إلى jsPDF.
 *  • **لا سطرَ يُقصّ بين صفحتين**: الصفحاتُ تُقسم عند حدود العناصر (رأسُ الورقة، المجاميع، كلُّ سطرِ مادّة)، وجدولٌ يكمل بصفحةٍ
 *    جديدة يعيد رأسَ شركته وعناوينَ أعمدته. والمجموعُ يُفحص: كلُّ سطرٍ بالورقة بصفحةٍ واحدة بالضبط (`paginate` صِرفة ومفحوصة).
 *  • **لا يحبس الشاشة**: صفحةٌ تُصوَّر ثمّ يتنفّس الخيط، والإطارُ لا يحمل إلا صفحتَه وقتَ تصويرها (لا نسخُ ألف سطرٍ لكلّ صفحة).
 *  • المكتبتان كسولتان (import() بأوّل ضغطة) — لا تدخلان الإقلاعَ ولا قطعةَ المخزن.
 * ========================================================================= */

export interface PdfUnitBlock { kind: "block"; h: number }
export interface PdfUnitGroup { kind: "group"; headH: number; rows: number[] }
export type PdfUnit = PdfUnitBlock | PdfUnitGroup;
export type PdfPart = { kind: "block"; unit: number } | { kind: "group"; unit: number; from: number; to: number; cont: boolean };

/** يقسم العناصرَ (بأطوالها) على صفحاتٍ بارتفاع `pageH`. سطرٌ لا يُقسم أبداً، ورأسُ الجدول لا يبقى وحده آخرَ صفحة (يُلحق بسطره
 *  الأوّل)، وما يكمل بصفحةٍ جديدة يعيد رأسَه (`cont`). عنصرٌ أطولُ من صفحة يأخذ صفحتَه وحده (يُقصّ ما تحته — لا يقع بالواقع). */
export function paginate(units: readonly PdfUnit[], pageH: number): PdfPart[][] {
  const pages: PdfPart[][] = [[]];
  let y = 0;
  const fresh = () => { if (pages[pages.length - 1].length) { pages.push([]); y = 0; } };
  units.forEach((u, unit) => {
    if (u.kind === "block") {
      if (y > 0 && y + u.h > pageH) fresh();
      pages[pages.length - 1].push({ kind: "block", unit });
      y += u.h;
      return;
    }
    let i = 0;
    if (u.rows.length === 0) {
      if (y > 0 && y + u.headH > pageH) fresh();
      pages[pages.length - 1].push({ kind: "group", unit, from: 0, to: 0, cont: false });
      y += u.headH;
      return;
    }
    while (i < u.rows.length) {
      if (y > 0 && y + u.headH + u.rows[i] > pageH) fresh();
      const from = i;
      y += u.headH;
      do { y += u.rows[i]; i++; } while (i < u.rows.length && y + u.rows[i] <= pageH);
      pages[pages.length - 1].push({ kind: "group", unit, from, to: i, cont: from > 0 });
      if (i < u.rows.length) fresh();
    }
  });
  return pages;
}

/* ── الهندسة: A4 بهامش ١٢ ملم كورقة الطباعة (@page) ─────────────────────────────────────────────── */
const PX_PER_MM = 96 / 25.4;
const MARGIN_MM = 12;
const CONTENT_W_MM = 210 - 2 * MARGIN_MM;
const CONTENT_H_MM = 297 - 2 * MARGIN_MM;
const W = Math.round(CONTENT_W_MM * PX_PER_MM);
const H = Math.floor(CONTENT_H_MM * PX_PER_MM);
/** سطرُ رقم الصفحة أسفلَها — محجوزٌ قبل التقسيم، فلا يغطّي سطراً. */
const FOOT = 18;

const outerH = (el: Element): number => {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
};
const nextFrame = (w: Window) => new Promise<void>((r) => w.requestAnimationFrame(() => r()));
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

async function settled(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images);
  await Promise.all(imgs.map((im) => (im.complete ? null : new Promise<void>((r) => { im.onload = im.onerror = () => r(); setTimeout(r, 6000); }))));
  try { await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 4000))]); } catch { /* swallow-ok: بلا FontFaceSet يُرسم بما وصل */ }
}

/** يرسم `html` (مستندُ ورقة الجرد كاملاً) ملفَّ PDF ويُنزّله باسم `fileName`. `onPage(i, n)` بعد كلّ صفحة. يرمي على أيّ فشل —
 *  لا ملفٌّ ناقصٌ يُنزَّل. */
export async function exportStockReportPdf(html: string, fileName: string, onPage?: (done: number, total: number) => void): Promise<number> {
  const [{ jsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = h2c.default;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-${W * 4}px;top:0;width:${W}px;height:${H}px;border:0;pointer-events:none;`;
  document.body.appendChild(frame);
  try {
    const win = frame.contentWindow!;
    const doc = frame.contentDocument!;
    doc.open();
    /* بلا مستمع الطباعة (الورقةُ تطبع نفسها عند التحميل)، وبعرض الصفحة بلا هامش (الهامشُ يضعه jsPDF). */
    /* وارتفاعُ السطر صريح: html2canvas يرسم الخلايا واحدةً بعد واحدة، فذيلُ حرفٍ عربيٍّ نازلٌ تحت خليّته (سطرُ العنوان الثاني
     * «العدد الفعلي») تغطّيه خلفيةُ السطر التالي — والمتصفّحُ يرسم الخلفياتِ كلَّها قبل النصوص فلا يُرى هذا بالطباعة. */
    doc.write(html.replace(/<body[^>]*>/, "<body>").replace("</style>", `html,body{width:${W}px;background:#fff}body{line-height:1.5}td.name,td.note,.head [dir]{text-align:right}</style>`));
    doc.close();
    /* اتّجاهُ كلّ خليّةٍ من نصّها (dir=auto): html2canvas يرسم بالاتّجاه المحسوب للعقدة كلِّها — خليّةٌ لاتينيةٌ بورقةٍ عربية كانت
     * تُرسم rtl فينقلب قوسُها «Dewormer )tablet(» (مقيسٌ بالملفّ)، وقرارُ الاتّجاه كلمةً كلمة قلب أقواسَ العربية بدلها (مقيس).
     * بالخليّة نفسِها يقرّر المتصفّحُ ما يقرّره لفقرته، والمحاذاةُ تبقى يميناً كالورقة. */
    for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
      if (!el.hasAttribute("dir") && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) el.setAttribute("dir", "auto");
    }
    await settled(doc);
    await nextFrame(win);

    /* ١) القياس — على الورقة كاملةً مرّةً واحدة. */
    const kids = Array.from(doc.body.children) as HTMLElement[];
    const units: PdfUnit[] = [];
    const parts: { el: HTMLElement; gh?: HTMLElement | null; table?: HTMLTableElement | null; rows?: HTMLTableRowElement[]; cols?: number[] }[] = [];
    for (const el of kids) {
      if (el.matches("section.grp")) {
        const gh = el.querySelector<HTMLElement>(".gh");
        const table = el.querySelector("table");
        const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
        const cs = win.getComputedStyle(el);
        const headH = (parseFloat(cs.marginTop) || 0) + (gh ? gh.getBoundingClientRect().height : 0) + (table?.tHead?.getBoundingClientRect().height ?? 0);
        units.push({ kind: "group", headH, rows: rows.map((r) => r.getBoundingClientRect().height) });
        /* عروضُ الأعمدة كما قيست بالجدول كاملاً: جدولُ الصفحة يُبنى من بعض السطور، وبتخطيطٍ تلقائيّ تتغيّر عروضُه فيلتفّ اسمٌ أو
         * ملاحظةٌ سطراً زائداً وتطول الصفحةُ عمّا قُسمت عليه فيُقصّ آخرُها (مراجعة). فتُثبَّت بها (table-layout: fixed). */
        const cols = Array.from(table?.tHead?.rows[0]?.cells ?? []).map((c) => c.getBoundingClientRect().width);
        parts.push({ el, gh, table, rows, cols });
      } else {
        units.push({ kind: "block", h: outerH(el) });
        parts.push({ el });
      }
    }
    const pages = paginate(units, H - FOOT);

    /* ٢) التصوير — صفحةً صفحة على مسرحٍ فارغ: الأصلُ يُفصل من المستند فلا يُنسخ مع كلّ صفحة. */
    const keep = doc.createDocumentFragment();
    for (const el of kids) keep.appendChild(el);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let p = 0; p < pages.length; p++) {
      const stage = doc.createElement("div");
      /* بارتفاع الصفحة على الأقلّ، ويطول لكتلةٍ أطولَ من صفحة (تُصغَّر لتسعها أدناه) — لا قصَّ صامتاً لشيء. */
      stage.style.cssText = `position:relative;width:${W}px;min-height:${H}px;background:#fff;padding-bottom:${FOOT}px;box-sizing:border-box;`;
      for (const part of pages[p]) {
        const src = parts[part.unit];
        if (part.kind === "block") { stage.appendChild(src.el.cloneNode(true)); continue; }
        const sec = src.el.cloneNode(false) as HTMLElement;
        if (src.gh) sec.appendChild(src.gh.cloneNode(true));
        if (src.table) {
          const tb = src.table.cloneNode(false) as HTMLTableElement;
          if (src.cols?.length) {
            tb.style.tableLayout = "fixed";
            const cg = doc.createElement("colgroup");
            for (const w of src.cols) { const col = doc.createElement("col"); col.style.width = `${w}px`; cg.appendChild(col); }
            tb.appendChild(cg);
          }
          if (src.table.tHead) tb.appendChild(src.table.tHead.cloneNode(true));
          const body = doc.createElement("tbody");
          for (const r of (src.rows ?? []).slice(part.from, part.to)) body.appendChild(r.cloneNode(true));
          tb.appendChild(body);
          sec.appendChild(tb);
        }
        stage.appendChild(sec);
      }
      const foot = doc.createElement("div");
      foot.style.cssText = "position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:9px;color:#94a3b8;direction:ltr;";
      foot.textContent = `${p + 1} / ${pages.length}`;
      stage.appendChild(foot);
      doc.body.appendChild(stage);
      await nextFrame(win);
      const sh = Math.max(H, Math.ceil(stage.getBoundingClientRect().height));
      const canvas = await html2canvas(stage, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true, windowWidth: W, windowHeight: sh });
      const img = canvas.toDataURL("image/jpeg", 0.9);
      canvas.width = 0; canvas.height = 0;
      if (p > 0) pdf.addPage("a4", "portrait");
      /* صفحةٌ أطولُ من A4 (كتلةٌ لا تنقسم أطولُ من صفحة) تُصغَّر كلُّها لتسع — تبقى كاملةً مقروءة لا مقصوصة. */
      const k = Math.min(1, H / sh);
      pdf.addImage(img, "JPEG", MARGIN_MM + (CONTENT_W_MM * (1 - k)) / 2, MARGIN_MM, CONTENT_W_MM * k, CONTENT_H_MM * k * (sh / H), undefined, "FAST");
      stage.remove();
      onPage?.(p + 1, pages.length);
      await breathe();
    }
    /* التنزيلُ كإكسل الجرد: الرابطُ داخل المستند قبل الضغط (خارجَه يتجاهل المتصفّحُ اسمَ الملفّ). */
    const url = URL.createObjectURL(pdf.output("blob"));
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    return pages.length;
  } finally {
    frame.remove();
  }
}
