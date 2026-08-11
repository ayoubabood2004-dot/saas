// Client-side image preparation for the media vault. Images are downscaled and
// re-encoded to JPEG (Canvas API, no dependency) so uploads stay small and the
// UI stays fast even with many photos. Non-images (e.g. PDF lab reports) pass
// through untouched.

export interface PreparedUpload {
  /** Bytes to upload to storage. */
  blob: Blob;
  /** Inline data URL — used by demo mode (no object storage) and for instant preview. */
  dataUrl: string;
  /** File extension for the storage object name. */
  ext: string;
  contentType: string;
}

/** Thrown when the original file is larger than the hard input cap. */
export class FileTooLargeError extends Error {
  constructor(public readonly maxMb: number) {
    super(`File exceeds ${maxMb} MB`);
    this.name = "FileTooLargeError";
  }
}

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // reject originals over 25 MB before touching the canvas
export const MAX_INPUT_MB = Math.round(MAX_INPUT_BYTES / 1024 / 1024);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The file could not be read as an image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), type, quality);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  // Preferred path: FileReader. Some restricted mobile webviews don't expose it
  // ("Can't find variable: FileReader"), so fall back to ArrayBuffer + base64,
  // which avoids the FileReader global entirely.
  if (typeof FileReader !== "undefined") {
    try {
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error ?? new Error("The file could not be encoded"));
        r.readAsDataURL(blob);
      });
    } catch {
      /* fall through to the manual encoder */
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // chunk to avoid call-stack limits on large buffers
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === "undefined") throw new Error("This browser cannot encode files");
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/**
 * Prepare a file for the media vault.
 * @param file the user-selected file
 * @param opts.maxDim longest edge in px after downscale (default 1600)
 * @param opts.quality JPEG quality 0–1 (default 0.72)
 */
/* ============================================================================
 * تحضير الشعار (اللوجو) — مسار خاص غير مسار صور الملفات الطبية.
 *
 * prepareUpload يعيد الترميز إلى JPEG — وJPEG بلا قناة شفافية، فكان اللوجو
 * الشفاف «ينسطح» على أسود ويتشوه، والخلفية البيضاء ما تنفرغ أبداً. هنا:
 *   · لوجو أصلاً مفرّغ (فيه شفافية) → لا نلمس بكسلاته إطلاقاً؛ تصغير + PNG.
 *   · لوجو على خلفية موحّدة (بيضاء عادةً) → تفريغ بالغمر من الحواف فقط:
 *     البكسلات المتصلة بالإطار وبلون الخلفية تصير شفافة — الأبيض داخل
 *     اللوجو (كتابة، عيون…) محمي لأنه غير متصل بالحافة. مع تنعيم حرف
 *     وقصّ تلقائي على حدود المحتوى.
 *   · صورة فوتوغرافية (خلفية غير موحّدة) → لا تفريغ؛ نرجعها كما هي حتى
 *     لا «نشوّه» — التفريغ للخلفيات المسطحة فقط.
 * ==========================================================================*/

/** فرق لوني إقليدي بين بكسل بالمصفوفة ولون مرجعي. */
const colorDist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.sqrt((d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2);

/** هل بالصورة شفافية فعلية؟ (أكثر من ٠.٥٪ من البكسلات نصف شفافة فأكثر) */
function hasRealAlpha(data: Uint8ClampedArray): boolean {
  let n = 0;
  const total = data.length / 4;
  const need = Math.max(8, Math.floor(total * 0.005));
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 200 && ++n >= need) return true;
  }
  return false;
}

/** لون الخلفية المرشح من إطار الصورة + نسبة تجانس الإطار معه. */
function borderBackground(data: Uint8ClampedArray, w: number, h: number): { r: number; g: number; b: number; uniformity: number } {
  const idxs: number[] = [];
  for (let x = 0; x < w; x++) { idxs.push((0 * w + x) * 4, ((h - 1) * w + x) * 4); }
  for (let y = 1; y < h - 1; y++) { idxs.push((y * w) * 4, (y * w + w - 1) * 4); }
  // اللون الغالب بتكميم خشن (٣٢ درجة) — أمتن من المتوسط الذي يفسده لوجو يلمس الحافة.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of idxs) {
    const k = (data[i] >> 5 << 10) | (data[i + 1] >> 5 << 5) | (data[i + 2] >> 5);
    const b = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(k, b);
  }
  let top: { n: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) if (!top || b.n > top.n) top = b;
  const r = top!.r / top!.n, g = top!.g / top!.n, b = top!.b / top!.n;
  let close = 0;
  for (const i of idxs) if (colorDist(data, i, r, g, b) <= 44) close++;
  return { r, g, b, uniformity: close / idxs.length };
}

/**
 * تفريغ الخلفية بالغمر من الحواف — يعدّل المصفوفة بمكانها.
 * @returns true إذا صار تفريغ فعلاً (خلفية موحّدة)، false إذا تُركت الصورة.
 */
function removeBorderBackground(data: Uint8ClampedArray, w: number, h: number): boolean {
  const bg = borderBackground(data, w, h);
  // إطار غير متجانس = صورة فوتوغرافية/خلفية مزخرفة — لا نتدخل حتى لا نشوّه.
  if (bg.uniformity < 0.62) return false;

  const TOL = 48;
  const removed = new Uint8Array(w * h); // 1 = صار خلفية
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (!removed[p] && colorDist(data, p * 4, bg.r, bg.g, bg.b) <= TOL) { removed[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let cut = 0;
  for (let p = 0; p < removed.length; p++) if (removed[p]) { data[p * 4 + 3] = 0; cut++; }
  // ما انفرغ شيء يُذكر أو انفرغت الصورة كلها تقريباً → اعتبرها فشلاً وتراجَع.
  if (cut < removed.length * 0.02 || cut > removed.length * 0.98) {
    if (cut) for (let p = 0; p < removed.length; p++) if (removed[p]) data[p * 4 + 3] = 255;
    return false;
  }
  // تنعيم الحرف: البكسل المُبقى الملاصق لمُزال وقريب من لون الخلفية يخفّف
  // شفافيته بنسبة بُعده — حافة ناعمة بلا هالة بيضاء.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (removed[p]) continue;
      const nearCut = (x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) || (y > 0 && removed[p - w]) || (y < h - 1 && removed[p + w]);
      if (!nearCut) continue;
      const d = colorDist(data, p * 4, bg.r, bg.g, bg.b);
      if (d < TOL * 2) data[p * 4 + 3] = Math.min(data[p * 4 + 3], Math.round(255 * Math.min(1, Math.max(0.25, d / (TOL * 2)))));
    }
  }
  return true;
}

/** أصغر مستطيل يحوي المحتوى (alpha > 8) — للقص التلقائي حول اللوجو. */
function contentBounds(data: Uint8ClampedArray, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * تحضير شعار العيادة: تصغير + حفظ الشفافية + تفريغ الخلفية الموحّدة + قص.
 * الناتج دائماً PNG (شفافية بلا فقدان) إلا الصور الفوتوغرافية غير المفرّغة.
 */
export async function prepareLogo(file: File, opts: { maxDim?: number } = {}): Promise<PreparedUpload> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image processing is only available in the browser");
  }
  if (file.size > MAX_INPUT_BYTES) throw new FileTooLargeError(MAX_INPUT_MB);
  if (!file.type.startsWith("image/")) throw new Error("الملف المختار ليس صورة");

  const maxDim = opts.maxDim ?? 400;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if ((img.width * img.height) > 40_000_000) throw new FileTooLargeError(MAX_INPUT_MB);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    let canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const alreadyCut = hasRealAlpha(imageData.data);
    // مفرّغ أصلاً → بكسلاته مقدّسة. غير مفرّغ → نحاول تفريغ الخلفية الموحّدة.
    const didCut = alreadyCut ? false : removeBorderBackground(imageData.data, w, h);
    if (didCut) ctx.putImageData(imageData, 0, 0);

    if (alreadyCut || didCut) {
      // قصّ على حدود المحتوى + هامش ٤٪ — اللوجو يملأ إطاره بدل ما يسبح بفراغ.
      const bb = contentBounds(imageData.data, w, h);
      if (bb) {
        const pad = Math.round(Math.max(w, h) * 0.04);
        const cx = Math.max(0, bb.x0 - pad), cy = Math.max(0, bb.y0 - pad);
        const cw = Math.min(w, bb.x1 + pad + 1) - cx, ch = Math.min(h, bb.y1 + pad + 1) - cy;
        if (cw > 4 && ch > 4 && (cw < w || ch < h)) {
          const cropped = document.createElement("canvas");
          cropped.width = cw; cropped.height = ch;
          cropped.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
          canvas = cropped;
        }
      }
      const blob = await canvasToBlob(canvas, "image/png", 1);
      const dataUrl = await blobToDataUrl(blob);
      return { blob, dataUrl, ext: "png", contentType: "image/png" };
    }

    // صورة فوتوغرافية معتمة — بلا تفريغ؛ JPEG بجودة عالية يكفي ويصغر الحجم.
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, ext: "jpg", contentType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareUpload(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<PreparedUpload> {
  // Guard against any non-browser context (defensive — this is a client-only SPA).
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image processing is only available in the browser");
  }
  if (file.size > MAX_INPUT_BYTES) throw new FileTooLargeError(MAX_INPUT_MB);

  // Non-images (PDF lab reports, etc.) are uploaded as-is.
  if (!file.type.startsWith("image/")) {
    const dataUrl = await blobToDataUrl(file);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    return { blob: file, dataUrl, ext: ext || "bin", contentType: file.type || "application/octet-stream" };
  }

  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.72;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    // Decompression-bomb guard: a tiny highly-compressible file can decode to a
    // gigapixel bitmap and OOM/hang the tab. Reject anything above 40 megapixels
    // before we ever draw it (a real clinic photo is well under that).
    if ((img.width * img.height) > 40_000_000) throw new FileTooLargeError(MAX_INPUT_MB);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, ext: "jpg", contentType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
