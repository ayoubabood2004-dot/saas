// ============================================================================
// كاتالوجُ موزّعٍ PDF ⇒ صورٌ بأسمائها (طلبُ المالك ٢٥/١١: «نرفع بي دي اف عادي وهو يستلمها، بس الأسماء…»).
//
// صِرفٌ بلا pdf.js ولا DOM — يأخذ ما قرأه pdfCatalog.ts من كلّ صفحة (مواضعَ الصور ومقاطعَ النصّ بإحداثيّاتٍ من
// أعلى الصفحة) ويقرّر، ويفحصه pdf-catalog-test بسلوكه. الطريقة:
//   ١) المقاطعُ أسطر: المقاطعُ على خطٍّ واحد متقاربةً سطرٌ، بترتيب القراءة (العربيُّ يمين ⇐ يسار).
//   ٢) ما ليس منتجاً يُشال: صورةٌ صغيرة (أيقونة)، أو تغطّي الصفحة (خلفيّة)، أو تتكرّر بموضعها على صفحاتٍ كثيرة
//      (شعار)؛ وسطرٌ يتكرّر على أكثر الصفحات (رأسٌ أو تذييل).
//   ٣) كلُّ سطرٍ للصورة الأقرب إليه — تحتها أو جنبها أقربُ من فوقها — بحدٍّ أقصى من حجمها. هذا يكفي الشكلين
//      الشائعين: شبكةُ بطاقات (الاسمُ تحت الصورة) وجدولٌ (الصورةُ بعمود والاسمُ والرمزُ بأعمدةٍ جنبها).
//   ٤) أسطرُ الصورة ⇒ باركود (٨–١٤ رقماً، والصالحُ بخانة التحقّق أوّلاً) واسم (الباقي بلا سعرٍ ولا عناوين).
// الاسمُ تخمين: الشاشةُ تعرض كلَّ صورةٍ باسمها ليُصحَّح قبل الرفع، ولا يُرفع ما بلا اسم.
// ============================================================================
import { normalizeDigits } from "./digits";

export interface Box { x0: number; y0: number; x1: number; y1: number }
/** صورةٌ بالصفحة: الصندوقُ بوحدات الصفحة من أعلاها، و`w`/`h` أبعادُها الأصليّة بالبكسل (0 إن لم تُعرف). */
export interface PdfImage extends Box { page: number; key: string; w: number; h: number }
/** مقطعُ نصّ كما يرجعه pdf.js مُحوَّلاً: الصندوقُ من أعلى الصفحة، و`rtl` اتجاهُه. */
export interface PdfText extends Box { page: number; str: string; rtl?: boolean }
export interface PdfLine extends Box { page: number; text: string }
export interface PdfPage { page: number; width: number; height: number; images: PdfImage[]; texts: PdfText[] }

export interface CatalogEntry {
  page: number;
  image: PdfImage;
  /** أسطرُ النصّ التي نُسبت لها بترتيبها — تُعرض بالمراجعة كما هي. */
  lines: string[];
  name: string;
  barcode: string | null;
}
export interface CatalogRead {
  entries: CatalogEntry[];
  /** صفحاتٌ بلا نصٍّ أصلاً (مصوَّرةٌ بالماسح) — الاسمُ لا يُقرأ منها. */
  scanned: number[];
  dropped: { small: number; background: number; repeated: number };
}

const AR = /[\u0600-\u06FF]/;
const MIN_SIDE_PT = 28;      // أصغرُ من ~١ سم: أيقونة
const MIN_PX = 48;
const BG_SHARE = 0.85;       // تغطّي ٨٥٪ من الصفحة: خلفيّة
/* التكرارُ: على نصف الصفحات فأكثر، وصفحتين على الأقلّ — كاتالوجٌ بصفحتين شعارُه على الاثنتين (مقيسٌ بالمتصفّح:
 * بحدِّ «ثلاث صفحات» طلع شعارُ ملفٍّ بصفحتين منتجاً اسمُه عنوانُ الكاتالوج). وملفٌّ بصفحةٍ واحدة لا تكرارَ فيه يُقاس. */
const repeatMin = (pages: number) => Math.max(2, Math.ceil(pages / 2));
const HEAD = 0.12, FOOT = 0.1;

/** ١) المقاطعُ ⇒ أسطر. خطٌّ واحد = مراكزُها العموديّة تتقارب بنصف ارتفاع السطر، والفجوةُ الأفقيّة أقلُّ من
 *  ارتفاعين (عمودان متجاوران بجدولٍ سطران لا سطر). */
export function linesOf(texts: readonly PdfText[]): PdfLine[] {
  const items = texts.filter((t) => t.str.trim()).map((t) => ({ ...t, cy: (t.y0 + t.y1) / 2, hgt: Math.max(t.y1 - t.y0, 1) }));
  items.sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows.find((r) => r[0].page === it.page && Math.abs(r[0].cy - it.cy) <= Math.max(r[0].hgt, it.hgt) * 0.5);
    if (row) row.push(it); else rows.push([it]);
  }
  const out: PdfLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x0 - b.x0);
    // الفجوةُ تقسم الصفَّ أسطراً (خانتا جدول).
    const groups: (typeof row)[] = [];
    for (const it of row) {
      const g = groups[groups.length - 1];
      const prev = g?.[g.length - 1];
      if (prev && it.x0 - prev.x1 <= Math.max(prev.hgt, it.hgt) * 2) g.push(it); else groups.push([it]);
    }
    for (const g of groups) {
      const rtl = g.filter((x) => x.rtl ?? AR.test(x.str)).length * 2 > g.length;
      const ordered = rtl ? [...g].reverse() : g;
      let text = "";
      for (let i = 0; i < ordered.length; i++) {
        const a = ordered[i - 1], b = ordered[i];
        const gap = a ? (rtl ? a.x0 - b.x1 : b.x0 - a.x1) : 0;
        text += (a && (gap > Math.min(a.hgt, b.hgt) * 0.2) && !/\s$/.test(text) && !/^\s/.test(b.str) ? " " : "") + b.str;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      out.push({
        page: g[0].page, text,
        x0: Math.min(...g.map((x) => x.x0)), x1: Math.max(...g.map((x) => x.x1)),
        y0: Math.min(...g.map((x) => x.y0)), y1: Math.max(...g.map((x) => x.y1)),
      });
    }
  }
  return out;
}

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const shapeKey = (i: PdfImage) => `${i.w}x${i.h}@${Math.round(i.x0 / 6)},${Math.round(i.y0 / 6)},${Math.round((i.x1 - i.x0) / 6)}`;

/** المسافةُ من السطر إلى الصورة بوزن الجهة: تحتها وجنبها كما هي، وفوقها ×١٫٥ (العنوانُ فوق الصورة أندرُ من
 *  الاسم تحتها، وسطرٌ بين صورتين أولى بالتي فوقه). صفرٌ إن تداخلا. */
export function lineDistance(l: Box, img: Box): number {
  const dx = Math.max(0, img.x0 - l.x1, l.x0 - img.x1);
  const below = l.y0 - img.y1, above = img.y0 - l.y1;
  const dy = Math.max(0, below, above);
  const wy = above > 0 && above >= below ? 1.5 : 1;
  return Math.hypot(dx, dy * wy);
}

/** السطرُ بصفّ الصورة: نصفُ ارتفاعه فأكثر داخل مدى الصورة العموديّ. */
export function sameRow(l: Box, img: Box): boolean {
  const ov = Math.min(l.y1, img.y1) - Math.max(l.y0, img.y0);
  return ov >= (l.y1 - l.y0) * 0.5;
}

/* ── ٤) أسطرُ الصورة ⇒ باركود واسم ───────────────────────────────────────────────────────────── */
/** خانةُ التحقّق لـEAN-8/UPC-A/EAN-13/GTIN-14. */
export function gtinValid(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  let s = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) s += d[i] * w;
  return (10 - (s % 10)) % 10 === check;
}
const CODE_RE = /(?<!\d)\d{8,14}(?!\d)/g;
/** سطرُ سعرٍ أو كمّيةٍ أو عنوانِ عمود — لا يدخل الاسم. */
const PRICE = /(?:\b(?:iqd|usd|price|qty|pcs)\b|\$|دينار|د\.ع|سعر|السعر|الكمية|العدد)/iu; /* i18n-data: كلماتُ السعر بأوراق الموزّعين تُطابَق، لا نصٌّ معروض */
/* عنوانُ حقلٍ قبل قيمته يُشال بفاصله وحده («Item: …»، لا «Item A»)، والعنوانُ وحده بعد أن خرج رمزُه سطرٌ لا اسم. */
const LABEL = /^(?:barcode|bar code|code|sku|ref|item|no\.?|ean|upc|باركود|الباركود|الرمز|رمز|كود)\s*[:：#-]\s*/iu; /* i18n-data: عناوينُ الحقول بأوراق الموزّعين تُشال من الاسم */
const LABEL_ONLY = /^(?:barcode|bar code|code|sku|ref|ean|upc|باركود|الباركود|الرمز|رمز|كود)\s*[:：#-]?$/iu; /* i18n-data: عناوينُ الحقول بأوراق الموزّعين */
const NUMERIC_ONLY = /^[\d\s.,:/\\-]+$/;

export function parseEntry(lines: readonly string[]): { name: string; barcode: string | null } {
  const codes: string[] = [];
  const nameParts: string[] = [];
  for (const raw of lines) {
    const line = normalizeDigits(raw).replace(/\s+/g, " ").trim();
    if (!line) continue;
    const found = line.match(CODE_RE) ?? [];
    codes.push(...found);
    let rest = line;
    for (const c of found) rest = rest.replace(c, " ");
    rest = rest.replace(LABEL, "").replace(/\s+/g, " ").trim();
    if (!rest || LABEL_ONLY.test(rest) || NUMERIC_ONLY.test(rest) || PRICE.test(rest)) continue;
    nameParts.push(rest);
  }
  const barcode = codes.find(gtinValid) ?? codes[0] ?? null;
  return { name: nameParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 120), barcode };
}

/** ٢+٣: صفحاتُ الملف ⇒ صورٌ بأسطرها وأسمائها. */
export function readCatalog(pages: readonly PdfPage[]): CatalogRead {
  const dropped = { small: 0, background: 0, repeated: 0 };
  const scanned: number[] = [];
  // الشعارُ: الشكلُ والموضعُ نفسُهما على صفحاتٍ كثيرة.
  const seen = new Map<string, Set<number>>();
  for (const pg of pages) for (const im of pg.images) {
    const k = shapeKey(im);
    const s = seen.get(k) ?? new Set<number>();
    s.add(pg.page); seen.set(k, s);
  }
  // الرأسُ والتذييل: سطرٌ بنصّه على أكثر من نصف الصفحات (وثلاثٍ فأكثر).
  const allLines = pages.map((pg) => linesOf(pg.texts));
  const lineCount = new Map<string, number>();
  for (const ls of allLines) for (const t of new Set(ls.map((l) => l.text))) lineCount.set(t, (lineCount.get(t) ?? 0) + 1);
  const repeatedLine = (t: string) => pages.length >= 2 && (lineCount.get(t) ?? 0) >= repeatMin(pages.length);

  const entries: CatalogEntry[] = [];
  pages.forEach((pg, idx) => {
    const pageArea = pg.width * pg.height;
    const imgs: PdfImage[] = [];
    for (const im of pg.images) {
      const w = im.x1 - im.x0, h = im.y1 - im.y0;
      if (w < MIN_SIDE_PT || h < MIN_SIDE_PT || (im.w && im.h && (im.w < MIN_PX || im.h < MIN_PX))) { dropped.small++; continue; }
      if (pageArea > 0 && area(im) / pageArea >= BG_SHARE) { dropped.background++; continue; }
      // شعارٌ: يتكرّر بموضعه **وبهامش الصفحة** (رأسٌ أو تذييل). التكرارُ وحده لا يكفي — شبكةُ الكاتالوج نفسُها
      // تتكرّر بمواضعها وأبعادها صفحةً بعد صفحة، وكانت تُرمى كلُّها شعاراً (مقيسٌ بالفحص).
      const margin = pg.height > 0 && (im.y1 <= pg.height * HEAD || im.y0 >= pg.height * (1 - FOOT));
      if (margin && (seen.get(shapeKey(im))?.size ?? 0) >= repeatMin(pages.length)) { dropped.repeated++; continue; }
      imgs.push(im);
    }
    const lines = allLines[idx].filter((l) => !repeatedLine(l.text));
    if (!pg.texts.some((t) => t.str.trim())) scanned.push(pg.page);
    const own = new Map<PdfImage, PdfLine[]>(imgs.map((im) => [im, []]));
    for (const l of lines) {
      let best: PdfImage | null = null, bd = Infinity;
      for (const im of imgs) {
        const d = lineDistance(l, im);
        // حدٌّ أقصى: سطرٌ أبعدُ من حجم الصورة عنها ليس لها (عنوانُ قسمٍ، ملاحظةٌ بأسفل الصفحة) — إلا سطراً
        // بصفّها (جدول: الرمزُ بعمودٍ بعيد عن الصورة لكن بصفّها)، والأقربُ يبقى الحَكَم بين صورتين بالصفّ نفسِه.
        const lim = sameRow(l, im) ? Infinity : Math.max(im.x1 - im.x0, im.y1 - im.y0) * 0.9;
        if (d <= lim && d < bd) { bd = d; best = im; }
      }
      if (best) own.get(best)!.push(l);
    }
    for (const im of imgs) {
      const ls = own.get(im)!.sort((a, b) => a.y0 - b.y0 || b.x1 - a.x1).map((l) => l.text);
      const { name, barcode } = parseEntry(ls);
      entries.push({ page: pg.page, image: im, lines: ls, name, barcode });
    }
  });
  return { entries, scanned, dropped };
}
