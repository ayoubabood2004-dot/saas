/* ============================================================================
 * photoPipeline — هندسةُ محرّر الصورة وسياسةُ ترميزها، بلا DOM (تقوده فحوصُ node).
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * كانت الصورةُ تُرفع لحظةَ اختيار الملفّ: ٨٠٠ بكسل بجودة ٠٫٧٢، بلا معاينةٍ ولا قصٍّ
 * ولا تدوير، والمعاينةُ الوحيدة ٤٤ بكسل. فالمصوّرُ يرى خطأَه بعد أن صار بالمتجر، وصورةٌ
 * مقلوبةٌ أو بنصفها طاولةٌ تبقى. وطلبُ المالك: الصورةُ **أكبرُ** عند الإضافة، والإضافةُ
 * **أسهل**، والصورةُ **أوضحُ** للزبون.
 *
 * فالمحرّرُ يعرض الصورةَ كاملةً قبل الحفظ، ويدوّر ويقصّ (حرّاً أو مربّعاً)، ويرفع نسختين:
 * الكاملةَ (١٦٠٠ بجودة ٠٫٨٢ تنزل خطوةً إن جاوزت ١٫٨ ميغا — سقفُ الدلو ٢) والمصغّرةَ
 * (٤٨٠ بجودة ٠٫٧٨) لبطاقات الشبكة — فالزبونُ لا ينزّل الكاملةَ إلا بورقة المادّة.
 * والتجريبيُّ بلا دلو: عنوانٌ مضمَّنٌ بحجم اليوم (٨٠٠) — حصّةُ الجهاز خمسةُ ميغا.
 *
 * الحسابُ هنا خالص: الإطارُ والتحويلُ والخطوات والترتيب؛ والرسمُ يمرّ من `renderPlan`
 * على سياقٍ يُمرَّر (حقيقيٌّ بالمتصفّح، مزيّفٌ بالفحص) — فالأبيضُ قبل الرسم يُفحص لا يُفترض.
 * ==========================================================================*/

export type Rot = 0 | 90 | 180 | 270;
/** مستطيلُ القصّ بإحداثياتٍ نسبيّة (٠…١) **بعد التدوير**. */
export interface Crop { x: number; y: number; w: number; h: number }
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

export interface Step { edge: number; q: number }
/** الكاملة: ١٦٠٠/٠٫٨٢ ⇒ ١٦٠٠/٠٫٧٢ ⇒ ١٢٨٠/٠٫٧٢ — أوّلُ ما يصير تحت ١٫٨ ميغا. */
export const FULL_STEPS: readonly Step[] = [{ edge: 1600, q: 0.82 }, { edge: 1600, q: 0.72 }, { edge: 1280, q: 0.72 }];
export const THUMB: Step = { edge: 480, q: 0.78 };
/** التجريبيّ: عنوانٌ مضمَّنٌ بحجم اليوم بلا مصغّرة (`cardImagePath` تمرّر `data:`). */
export const DEMO_FULL: Step = { edge: 800, q: 0.72 };
export const SOFT_MAX = 1.8 * 1024 * 1024;
export const BUCKET_MAX = 2 * 1024 * 1024;
/** أصغرُ ضلعٍ للقصّ بالبكسل (بالصورة بعد التدوير) — قصٌّ أصغرُ منه صورةٌ لا تُقرأ. */
export const MIN_CROP_PX = 48;

export function targets(demo: boolean): { steps: readonly Step[]; thumb: Step | null } {
  return demo ? { steps: [DEMO_FULL], thumb: null } : { steps: FULL_STEPS, thumb: THUMB };
}

export function rotatedSize(w: number, h: number, rot: Rot): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h };
}
export function rotateBy(rot: Rot, delta: 90 | -90): Rot {
  return (((rot + delta) % 360 + 360) % 360) as Rot;
}

/** أكبرُ مربّعٍ بالوسط — بالبكسل لا بالنسبة (صورةٌ ٤:٣ مربّعُها ٠٫٧٥ × ١). */
export function squareIn(rw: number, rh: number): Crop {
  const s = Math.min(rw, rh);
  return { x: (rw - s) / 2 / rw, y: (rh - s) / 2 / rh, w: s / rw, h: s / rh };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
type Corner = "nw" | "ne" | "sw" | "se";

/** سحبُ زاوية: الزاويةُ المقابلةُ ثابتة، والحدودُ والأصغرُ محفوظان، والمربّعُ مربّعٌ بالبكسل. */
export function dragCorner(c: Crop, corner: Corner, dxN: number, dyN: number, rw: number, rh: number, square: boolean): Crop {
  const min = Math.min(MIN_CROP_PX, rw, rh);
  let x0 = c.x * rw, y0 = c.y * rh, x1 = (c.x + c.w) * rw, y1 = (c.y + c.h) * rh;
  const dx = dxN * rw, dy = dyN * rh;
  if (corner === "nw" || corner === "sw") x0 = clamp(x0 + dx, 0, x1 - min); else x1 = clamp(x1 + dx, x0 + min, rw);
  if (corner === "nw" || corner === "ne") y0 = clamp(y0 + dy, 0, y1 - min); else y1 = clamp(y1 + dy, y0 + min, rh);
  if (square) {
    const s = Math.min(x1 - x0, y1 - y0);
    if (corner === "nw" || corner === "sw") x0 = x1 - s; else x1 = x0 + s;
    if (corner === "nw" || corner === "ne") y0 = y1 - s; else y1 = y0 + s;
  }
  return { x: x0 / rw, y: y0 / rh, w: (x1 - x0) / rw, h: (y1 - y0) / rh };
}
/**
 * قناعُ ما حول القصّ: أربعةُ أحزمةٍ (فوق، تحت، يسار، يمين) تغطّي الصورةَ خارج القصّ بالضبط —
 * داخل [0،1]² وحدَها. كان القناعُ ظلّاً بـ9999px على إطار القصّ لا يقصّه إلا أوّلُ سلفٍ يقصّ (منطقةُ
 * التمرير كلُّها): التلميحُ وأزرارُ التدوير والقصّ وبطاقةُ «هكذا تظهر بالمتجر» تحت حجابٍ أسود ٤٥٪ —
 * الأزرارُ تبدو معطَّلة، والبطاقةُ التي وُضعت لتُري الصورةَ كما هي تُريها أغمق.
 */
export function maskBands(c: Crop): Crop[] {
  const right = c.x + c.w, bottom = c.y + c.h;
  return [
    { x: 0, y: 0, w: 1, h: c.y },
    { x: 0, y: bottom, w: 1, h: 1 - bottom },
    { x: 0, y: c.y, w: c.x, h: c.h },
    { x: right, y: c.y, w: 1 - right, h: c.h },
  ];
}

/** سحبُ المستطيل كلِّه داخل الصورة. */
export function dragMove(c: Crop, dxN: number, dyN: number): Crop {
  return { ...c, x: clamp(c.x + dxN, 0, 1 - c.w), y: clamp(c.y + dyN, 0, 1 - c.h) };
}

/** تحويلُ الرسم: نقطةُ المصدر (x,y) ⇒ (a·x + c·y + e, b·x + d·y + f) — مرآةُ `setTransform`. */
export type Matrix = [number, number, number, number, number, number];
export interface Plan { outW: number; outH: number; matrix: Matrix }

/**
 * إطارُ الرسم: المصدرُ (srcW×srcH) يُدار `rot` مع عقارب الساعة، ثم يُقصّ `crop`، ثم يُصغَّر
 * ليصير أطولُ ضلعٍ `edge` (لا يُكبَّر أبداً). النتيجةُ حجمُ اللوحة ومصفوفةُ تحويلٍ واحدة
 * يُرسم بها المصدرُ عند (٠،٠) — بلا لوحةٍ وسيطة.
 */
export function editPlan(srcW: number, srcH: number, rot: Rot, crop: Crop, edge: number): Plan {
  const { w: rw, h: rh } = rotatedSize(srcW, srcH, rot);
  const cx = crop.x * rw, cy = crop.y * rh, cw = crop.w * rw, ch = crop.h * rh;
  const s = Math.min(1, edge / Math.max(cw, ch, 1));
  const outW = Math.max(1, Math.round(cw * s));
  const outH = Math.max(1, Math.round(ch * s));
  let m: Matrix;
  if (rot === 0) m = [s, 0, 0, s, -s * cx, -s * cy];
  else if (rot === 90) m = [0, s, -s, 0, s * (srcH - cx), -s * cy];
  else if (rot === 180) m = [-s, 0, 0, -s, s * (srcW - cx), s * (srcH - cy)];
  else m = [0, -s, s, 0, -s * cx, s * (srcW - cy)];
  return { outW, outH, matrix: m };
}
/** أين تقع نقطةُ المصدر على اللوحة (للفحص وللمعاينة). */
export const mapPoint = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** ما يحتاجه الرسمُ من سياق اللوحة — الحقيقيُّ يطابقه، والفحصُ يزيّفه. */
export interface CtxLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(src: CanvasImageSource, x: number, y: number): void;
}
/** **أبيضُ قبل الرسم**: PNG شفّافٌ بـJPEG (بلا قناة شفافية) كان يصير أسودَ — خلفيةُ العلبة سوداء. */
export function renderPlan(ctx: CtxLike, plan: Plan, src: CanvasImageSource): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, plan.outW, plan.outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(...plan.matrix);
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** خطواتُ الترميز: أوّلُ نتيجةٍ تحت ١٫٨ ميغا تُعتمد، وإلا الأخيرة — وفوق سقف الدلو (٢) خطأٌ يُقال. */
export async function encodeWithSteps<T extends { size: number }>(steps: readonly Step[], encodeAt: (s: Step) => Promise<T>): Promise<{ out: T; step: Step }> {
  let last: { out: T; step: Step } | null = null;
  for (const step of steps) {
    const out = await encodeAt(step);
    last = { out, step };
    if (out.size <= SOFT_MAX) return last;
  }
  if (!last) throw new Error("no_encode_steps");
  if (last.out.size > BUCKET_MAX) throw Object.assign(new Error("photo_too_large"), { name: "FileTooLargeError", maxMb: 2 });
  return last;
}

/** صورةٌ مرمَّزةٌ جاهزةٌ للرفع — بشكل ما يقبله `repo.uploadProductPhoto`. */
export interface UploadBlob { blob: Blob; dataUrl: string; ext: string; contentType: string }
export interface EncodedPhoto { full: UploadBlob; thumb: UploadBlob | null; previewUrl: string }

/** الرفعُ ثم الربط — بهذا الترتيب: رفعٌ فشل (المصغّرةُ أوّلاً بداخله) لا يغيّر مسارَ المنتج. */
export async function commitPhoto(
  repo: {
    uploadProductPhoto(clinic: string | null, product: string, photo: { full: UploadBlob; thumb: UploadBlob | null }): Promise<string>;
    setProductImage(product: string, path: string | null): Promise<void>;
  },
  clinic: string | null, productId: string, photo: EncodedPhoto,
): Promise<string> {
  const path = await repo.uploadProductPhoto(clinic, productId, { full: photo.full, thumb: photo.thumb });
  await repo.setProductImage(productId, path);
  return path;
}

/** «احفظ وروح للجاية بلا صورة»: القائمةُ كما كانت لحظةَ الفتح، والتالي بعد الحاليّ مما بلا صورةٍ **الآن**. */
export function nextWithoutPhoto(queue: readonly string[], current: string, hasPhoto: (id: string) => boolean): string | null {
  const at = queue.indexOf(current);
  for (let i = at + 1; i < queue.length; i++) if (!hasPhoto(queue[i])) return queue[i];
  return null;
}
