/* ============================================================================
 * صورةُ المنتج (0229) — من الكاميرا أو الألبوم إلى ملفّين: كاملٌ للتكبير
 * ومصغّرٌ لشبكة المتجر.
 *
 * ── لماذا ملفّان ─────────────────────────────────────────────────────────
 * كانت الصورةُ تُحفظ بـ٨٠٠ بكسل وجودة ٠٫٧٢ (معدّلُها ١١١ ك.ب مقيسةً على
 * الإنتاج): خفيفةٌ بالشبكة وضبابيةٌ حين يكبّرها الزبونُ ليقرأ العلبة. ورفعُها
 * وحدَها إلى ١٦٠٠ يجعل صفحةَ ستّين منتجاً عشرين ميغا على هاتفٍ بباقةٍ عراقية.
 * فالكاملُ للتفاصيل والتكبير، والمصغّرُ (٤٨٠) للشبكة — والقديمُ بلا مصغّر
 * يُعرض بكامله كما كان (`thumbOf` يرجع null فيسقط المتصفّحُ على الأصل).
 *
 * ── والتعديلُ قبل الرفع ──────────────────────────────────────────────────
 * تدويرٌ بخطوات ٩٠°، وقصٌّ مربّعٌ من الوسط (بطاقةُ المتجر مربّعة)، وتحسينُ
 * إضاءةٍ بمدّ المدى، وتبييضُ خلفيةٍ **موحّدة** بالغمر من الحواف — المنطقُ
 * نفسُه الذي يفرّغ شعارَ العيادة (`image.ts`)، إلا أنه يطلي أبيضَ لا شفافاً
 * لأن JPEG بلا قناة شفافية. وخلفيةٌ غيرُ موحّدة (رفٌّ، يدٌ، طاولة) لا تُمسّ:
 * تبييضٌ يأكل حافةَ العلبة أسوأُ من خلفيةٍ عادية.
 *
 * الدوالُّ النقيّة (بلا DOM) أوّلاً وتُفحص بـ`scripts/store-board-test.mjs`.
 * ==========================================================================*/
import { borderBackground, colorDist, type PreparedUpload } from "./image";

export const FULL_DIM = 1600;
export const FULL_QUALITY = 0.82;
export const THUMB_DIM = 480;
export const THUMB_QUALITY = 0.78;
/** سقفُ الدلو ٢ ميغا (0184) — نترك هامشاً ونعيد الترميز بجودةٍ أقلّ إن تجاوزناه. */
export const MAX_BYTES = 1_900_000;

export type PhotoSource = "camera" | "album" | "library";
export type Rotation = 0 | 90 | 180 | 270;

export interface PhotoEdit {
  rot: Rotation;
  square: boolean;
  enhance: boolean;
  whiteBg: boolean;
}
export const NO_EDIT: PhotoEdit = { rot: 0, square: false, enhance: false, whiteBg: false };

/** ما يُحفظ مع الصورة بـ`products.image_meta` — ويُصدَّق ما دام `path` يطابق `image_path`. */
export interface ImageMeta {
  v: 1;
  path: string;
  thumb: string | null;
  w: number;
  h: number;
  bytes: number;
  src: PhotoSource;
  edits?: string[];
}

/* ------------------------------ نقيّة ------------------------------ */

/** أبعادُ الصورة بعد التدوير. */
export function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h };
}

/** مربّعٌ من الوسط بضلع أقصر البعدين. */
export function squareRect(w: number, h: number): { x: number; y: number; size: number } {
  const size = Math.min(w, h);
  return { x: Math.floor((w - size) / 2), y: Math.floor((h - size) / 2), size };
}

/** تصغيرٌ يحفظ النسبة — لا تكبيرَ أبداً (صورةٌ صغيرةٌ مكبَّرةٌ أضببُ لا أوضح). */
export function fitDims(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h) || 1;
  const s = Math.min(1, max / longest);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** مسارُ المصغّر من مسار الكامل: `…/id-ts.jpg` ⇒ `…/id-ts.thumb.jpg`. */
export function thumbPathFor(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, "") + ".thumb.jpg";
}

/** المصغّرُ الموثوق: من الوصف إن كان يصف **هذه** الصورة، وإلا لا شيء.
 *  دمجُ توأمين قد يأخذ الصورةَ من صفٍّ والوصفَ من آخر (0184 يطوي الحقولَ
 *  واحداً واحداً) — فوصفٌ لا يطابق المسارَ يُتجاهل كأنه لم يكن. */
export function thumbOf(path: string | null | undefined, meta: Partial<ImageMeta> | null | undefined): string | null {
  if (!path || !meta || meta.path !== path || !meta.thumb) return null;
  return meta.thumb;
}

/** وصفٌ يصف هذه الصورةَ بالذات — أو لا شيء. */
export function metaOf(path: string | null | undefined, meta: Partial<ImageMeta> | null | undefined): ImageMeta | null {
  if (!path || !meta || meta.path !== path) return null;
  return meta as ImageMeta;
}

/** لحظةُ الرفع من اسم الملف: `${product}-${Date.now().toString(36)}.jpg`. */
export function uploadedAt(path: string | null | undefined): Date | null {
  if (!path || path.startsWith("data:") || path.startsWith("library/")) return null;
  const m = /-([0-9a-z]{6,12})(?:\.thumb)?\.[a-z0-9]+$/i.exec(path);
  if (!m) return null;
  const ms = parseInt(m[1], 36);
  // نافذةٌ معقولة: من ٢٠٢٤ إلى ٢٠٤٠ — ذيلٌ آخرُ بالاسم ليس طابعاً زمنياً.
  if (!Number.isFinite(ms) || ms < 1_704_067_200_000 || ms > 2_208_988_800_000) return null;
  return new Date(ms);
}

/**
 * تحسينُ الإضاءة: مدُّ مدى السطوع بين المئين الأوّل والتاسع والتسعين.
 * صورةُ رفٍّ تحت ضوءٍ أصفرَ خافتٍ تقع كلُّها بين ٤٠ و١٩٠ — تُمدّ إلى ٠–٢٥٥
 * فتنفتح الألوانُ والكتابة. ومدىً شبهُ كامل لا يُمسّ (لا نشوّه صورةً جيدة).
 * @returns هل تغيّر شيء.
 */
export function autoLevels(data: Uint8ClampedArray): boolean {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[y | 0]++; n++;
  }
  if (!n) return false;
  const pick = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; }
    return 255;
  };
  const lo = pick(0.01), hi = pick(0.99);
  if (hi - lo >= 235 || hi - lo < 24) return false;
  const k = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (data[i] - lo) * k;
    data[i + 1] = (data[i + 1] - lo) * k;
    data[i + 2] = (data[i + 2] - lo) * k;
  }
  return true;
}

/**
 * تبييضُ الخلفية الموحّدة — غمرٌ من الحواف بلون الإطار الغالب، ثمّ طلاءٌ أبيض
 * بحافةٍ ممزوجة (لا هالة). المنطقُ مرآةُ `removeBorderBackground` بـ`image.ts`.
 * @returns هل تبيّضت (false = خلفيةٌ غيرُ موحّدة أو تبييضٌ يأكل الصورة).
 */
export function whitenBackground(data: Uint8ClampedArray, w: number, h: number): boolean {
  const bg = borderBackground(data, w, h);
  if (bg.uniformity < 0.62) return false;
  const TOL = 48;
  const mark = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (!mark[p] && colorDist(data, p * 4, bg.r, bg.g, bg.b) <= TOL) { mark[p] = 1; stack.push(p); }
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
  for (let p = 0; p < mark.length; p++) if (mark[p]) cut++;
  // ما تبيّض شيءٌ يُذكر، أو تبيّضت الصورةُ كلُّها تقريباً (علبةٌ بيضاءُ على أبيض) ⇒ لا.
  if (cut < mark.length * 0.02 || cut > mark.length * 0.97) return false;
  for (let p = 0; p < mark.length; p++) {
    if (!mark[p]) continue;
    const i = p * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
  // الحافة: البكسلُ الباقي الملاصقُ لمبيَّضٍ والقريبُ من لون الخلفية يُمزج نحو الأبيض بنسبة قربه.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mark[p]) continue;
      const near = (x > 0 && mark[p - 1]) || (x < w - 1 && mark[p + 1]) || (y > 0 && mark[p - w]) || (y < h - 1 && mark[p + w]);
      if (!near) continue;
      const i = p * 4;
      const d = colorDist(data, i, bg.r, bg.g, bg.b);
      if (d >= TOL * 2) continue;
      const a = Math.min(1, Math.max(0.25, d / (TOL * 2)));
      data[i] = data[i] * a + 255 * (1 - a);
      data[i + 1] = data[i + 1] * a + 255 * (1 - a);
      data[i + 2] = data[i + 2] * a + 255 * (1 - a);
    }
  }
  return true;
}

/** أسماءُ التعديلات المطبَّقة — تُحفظ بالوصف ليعرف المديرُ ما مرّ على الصورة. */
export function editNames(e: PhotoEdit, applied: { enhance: boolean; whiteBg: boolean }): string[] {
  const out: string[] = [];
  if (e.rot) out.push(`rot${e.rot}`);
  if (e.square) out.push("square");
  if (e.enhance && applied.enhance) out.push("enhance");
  if (e.whiteBg && applied.whiteBg) out.push("white");
  return out;
}

/* ------------------------------ المتصفّح ------------------------------ */

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** يقرأ الملفَّ صورةً. الاتجاهُ من EXIF يطبّقه المتصفّحُ نفسُه عند الرسم
 *  (`image-orientation: from-image` افتراضيٌّ بكروم ٨١+ وسفاري ١٣٫١+).
 *  الرابطُ يبقى حيّاً ما دامت المعاينةُ مفتوحة — سفاري قد يرمي المفكوكَ ويعيد
 *  القراءةَ من الرابط عند الرسم؛ فيُحرَّر بـ`releasePhoto` عند الإغلاق. */
export async function loadPhoto(file: File | Blob): Promise<HTMLImageElement> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("File exceeds 25 MB");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("The file could not be read as an image"));
      el.src = url;
    });
    // قنبلةُ فكّ ضغط: ملفٌّ صغيرٌ يُفكّ إلى جيجابكسل فيُسقط التبويب.
    if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error("File exceeds 25 MB");
    return img;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** يحرّر رابطَ صورةٍ قُرئت من ملفّ — لا يمسّ روابطَ الشبكة. */
export function releasePhoto(img: HTMLImageElement | null | undefined): void {
  if (img?.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
}

/** صورةٌ من رابط (صورةُ مكتبةٍ أو القائمةُ لإعادة التعديل) — بلا تلويث اللوحة. */
export async function loadPhotoUrl(src: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("The file could not be read as an image"));
    el.src = src;
  });
}

/** يرسم الصورةَ بالتعديل على لوحةٍ بأقصى ضلع `max`. خلفيةٌ بيضاء أوّلاً: PNG
 *  شفّافٌ من الألبوم كان يصير أسودَ بـJPEG (لا قناةَ شفافية). */
export function renderPhoto(img: HTMLImageElement, e: PhotoEdit, max: number): { canvas: HTMLCanvasElement; applied: { enhance: boolean; whiteBg: boolean } } {
  const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  const crop = e.square ? squareRect(sw, sh) : { x: 0, y: 0, size: 0 };
  const cw = e.square ? crop.size : sw, ch = e.square ? crop.size : sh;
  const r = rotatedSize(cw, ch, e.rot);
  const out = fitDims(r.w, r.h, max);
  const canvas = document.createElement("canvas");
  canvas.width = out.w; canvas.height = out.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: e.enhance || e.whiteBg });
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.w, out.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(out.w / 2, out.h / 2);
  ctx.rotate((e.rot * Math.PI) / 180);
  // بعد التدوير يُرسم بأبعاد ما قبله: عرضُ الرسم = ضلعُ المصدر المقابل.
  const dw = e.rot === 90 || e.rot === 270 ? out.h : out.w;
  const dh = e.rot === 90 || e.rot === 270 ? out.w : out.h;
  ctx.drawImage(img, crop.x, crop.y, cw, ch, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  const applied = { enhance: false, whiteBg: false };
  if (e.enhance || e.whiteBg) {
    const data = ctx.getImageData(0, 0, out.w, out.h);
    if (e.whiteBg) applied.whiteBg = whitenBackground(data.data, out.w, out.h);
    if (e.enhance) applied.enhance = autoLevels(data.data);
    ctx.putImageData(data, 0, 0);
  }
  return { canvas, applied };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), "image/jpeg", quality);
  });
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

export interface EncodedPhoto {
  full: PreparedUpload;
  thumb: PreparedUpload;
  w: number;
  h: number;
  bytes: number;
  edits: string[];
}

/** الملفّان الجاهزان للرفع. الكاملُ يُعاد ترميزُه بجودةٍ أدنى إن تجاوز السقف. */
export async function encodeProductPhoto(img: HTMLImageElement, e: PhotoEdit, withDataUrl: boolean): Promise<EncodedPhoto> {
  const { canvas, applied } = renderPhoto(img, e, FULL_DIM);
  let blob = await toBlob(canvas, FULL_QUALITY);
  for (const q of [0.72, 0.62, 0.5]) {
    if (blob.size <= MAX_BYTES) break;
    blob = await toBlob(canvas, q);
  }
  const t = document.createElement("canvas");
  const td = fitDims(canvas.width, canvas.height, THUMB_DIM);
  t.width = td.w; t.height = td.h;
  const tctx = t.getContext("2d");
  if (!tctx) throw new Error("Canvas is not supported in this browser");
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(canvas, 0, 0, td.w, td.h);
  const tblob = await toBlob(t, THUMB_QUALITY);
  const full: PreparedUpload = { blob, dataUrl: withDataUrl ? await toDataUrl(blob) : "", ext: "jpg", contentType: "image/jpeg" };
  const thumb: PreparedUpload = { blob: tblob, dataUrl: withDataUrl ? await toDataUrl(tblob) : "", ext: "jpg", contentType: "image/jpeg" };
  return { full, thumb, w: canvas.width, h: canvas.height, bytes: blob.size, edits: editNames(e, applied) };
}
