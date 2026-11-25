// ============================================================================
// قراءةُ كاتالوج PDF بالمتصفّح (pdf.js، كسول — لا يدفع وزنَه إلا من يفتح الاستيراد). الملفُّ لا يغادر الجهاز:
// الصفحةُ تُقرأ هنا، وما يُرفع صورُ المنتجات المقصوصة وحدها كما في استيراد الإكسل.
//
// من كلّ صفحة: مواضعُ الصور (من قائمة أوامر الرسم، بمصفوفة التحويل الجارية — النماذجُ المتداخلة تحمل مصفوفتَها)
// ومقاطعُ النصّ بمواضعها؛ والقرارُ (أيُّ نصٍّ لأيّ صورة) بـpdfCatalogLayout.ts الصِّرف. والصورةُ تُقصّ من رسم
// الصفحة كما تُرى (بالقناع والتحويل كما رسمها الموزّع) بدقّةٍ من أبعادها الأصليّة، بحدّ قماشٍ يحتمله الهاتف.
//
// `legacy`: بناءٌ بمكمّلاتٍ للمتصفّحات الأقدم (آيباد العيادة). و`isEvalSupported: false`: سياسةُ المحتوى بلا
// unsafe-eval، والعاملُ ملفٌّ من الأصل نفسِه (worker-src 'self').
// ============================================================================
import type { PdfImage, PdfPage, PdfText } from "./pdfCatalogLayout";

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Doc = Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>;
type Page = Awaited<ReturnType<Doc["getPage"]>>;

let lib: Promise<Pdfjs> | null = null;
function pdfjs(): Promise<Pdfjs> {
  lib ??= (async () => {
    const [m, w] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    m.GlobalWorkerOptions.workerSrc = w.default;
    return m;
  })().catch((e) => { lib = null; throw e; });
  return lib;
}

export class PdfError extends Error {
  constructor(public code: "not_pdf" | "encrypted" | "load_failed") { super(code); }
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export interface OpenPdf {
  pages: number;
  readPage(n: number): Promise<PdfPage>;
  /** قصُّ صورٍ من صفحةٍ واحدة برسمةٍ واحدة. `maxSide` أطولُ ضلعٍ للمقصوص (للمعاينة صغير، للرفع كبير). */
  crop(n: number, boxes: readonly PdfImage[], maxSide: number, type?: "image/png" | "image/jpeg"): Promise<Blob[]>;
  close(): void;
}

/** صفحةٌ ⇒ مواضعُ صورها ونصوصِها (من أعلاها). مصدّرةٌ ليفحصها pdf-catalog-test بـpdf.js الحقيقيّ على ملفٍّ مصنوع. */
export async function readPdfPage(O: Pdfjs["OPS"], page: Page, n: number): Promise<PdfPage> {
  const vp = page.getViewport({ scale: 1 });
  const toBox = (pts: [number, number][]) => {
    const v = pts.map(([x, y]) => vp.convertToViewportPoint(x, y) as [number, number]);
    return { x0: Math.min(...v.map((p) => p[0])), x1: Math.max(...v.map((p) => p[0])), y0: Math.min(...v.map((p) => p[1])), y1: Math.max(...v.map((p) => p[1])) };
  };
  // الصور: مصفوفةُ التحويل الجارية عبر save/restore/transform والنماذج.
  const ops = await page.getOperatorList();
  const images: PdfImage[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i] as unknown[];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() ?? ctm;
    else if (fn === O.transform) ctm = mul(ctm, a as M);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); const mx = a?.[0] as M | null; if (mx && mx.length === 6) ctm = mul(ctm, mx); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject) {
      const inline = fn === O.paintInlineImageXObject ? (a?.[0] as { width?: number; height?: number } | undefined) : undefined;
      const w = Number(inline ? inline.width : a?.[1]) || 0;
      const h = Number(inline ? inline.height : a?.[2]) || 0;
      const b = toBox([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]);
      images.push({ ...b, page: n, key: `${n}:${i}`, w, h });
    }
  }
  // النصّ: صندوقُ كلّ مقطع من خطّ قاعدته وارتفاعه.
  const tc = await page.getTextContent();
  const texts: PdfText[] = [];
  for (const it of tc.items as { str?: string; transform?: number[]; width?: number; height?: number; dir?: string }[]) {
    if (!it.str || !it.transform) continue;
    const [, , , d, e, f] = it.transform as M;
    const h = it.height || Math.abs(d) || 1;
    const b = toBox([[e, f - h * 0.2], [e + (it.width ?? 0), f + h * 0.8]]);
    texts.push({ ...b, page: n, str: it.str, rtl: it.dir === "rtl" });
  }
  return { page: n, width: vp.width, height: vp.height, images, texts };
}

export async function openPdf(file: File): Promise<OpenPdf> {
  const m = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  if (!(data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) throw new PdfError("not_pdf"); // %PDF
  let doc: Doc;
  try {
    doc = await m.getDocument({ data, isEvalSupported: false, disableAutoFetch: true, verbosity: 0 }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new PdfError(name === "PasswordException" ? "encrypted" : "load_failed");
  }
  const O = m.OPS;
  const pageCache = new Map<number, Page>();
  const getPage = async (n: number) => {
    let p = pageCache.get(n);
    if (!p) { p = await doc.getPage(n); pageCache.set(n, p); if (pageCache.size > 3) { const k = pageCache.keys().next().value!; pageCache.get(k)?.cleanup(); pageCache.delete(k); } }
    return p;
  };

  const readPage = async (n: number): Promise<PdfPage> => readPdfPage(O, await getPage(n), n);

  const crop = async (n: number, boxes: readonly PdfImage[], maxSide: number, type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob[]> => {
    if (!boxes.length) return [];
    const page = await getPage(n);
    const base = page.getViewport({ scale: 1 });
    // الدقّةُ: ما يكفي أكبرَ صورةٍ بأصلها حتى maxSide، وقماشٌ لا يتجاوز ١٦ مليون بكسل (حدّ سفاري).
    let s = 1;
    for (const b of boxes) {
      const side = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
      const want = Math.min(maxSide, Math.max(b.w, b.h) || maxSide) / side;
      s = Math.max(s, want);
    }
    s = Math.min(s, 6, Math.sqrt(16_000_000 / Math.max(base.width * base.height, 1)));
    const vp = page.getViewport({ scale: s });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PdfError("load_failed");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const out: Blob[] = [];
    for (const b of boxes) {
      const sx = Math.max(0, Math.floor(b.x0 * s)), sy = Math.max(0, Math.floor(b.y0 * s));
      const sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil((b.x1 - b.x0) * s)));
      const sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil((b.y1 - b.y0) * s)));
      const k = Math.min(1, maxSide / Math.max(sw, sh));
      const c2 = document.createElement("canvas");
      c2.width = Math.max(1, Math.round(sw * k)); c2.height = Math.max(1, Math.round(sh * k));
      const g = c2.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(canvas, sx, sy, sw, sh, 0, 0, c2.width, c2.height);
      if (type === "image/jpeg") { g.globalCompositeOperation = "destination-over"; g.fillStyle = "#ffffff"; g.fillRect(0, 0, c2.width, c2.height); }
      out.push(await new Promise<Blob>((res, rej) => c2.toBlob((bl) => (bl ? res(bl) : rej(new PdfError("load_failed"))), type, 0.72)));
      c2.width = 0; c2.height = 0;
    }
    canvas.width = 0; canvas.height = 0;   // سفاري يحتفظ بذاكرة القماش حتى يُصغَّر
    return out;
  };

  return { pages: doc.numPages, readPage, crop, close: () => { for (const p of pageCache.values()) p.cleanup(); void doc.destroy(); } };
}
