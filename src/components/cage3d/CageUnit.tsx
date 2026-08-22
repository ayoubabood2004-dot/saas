import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  BoxGeometry, CanvasTexture, Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, RepeatWrapping, RingGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BufferGeometry, Group } from "three";
import { NEON, NIGHT, DANGER, DOSE, HOT, KIND_AR, statusOfCage, type CageSpec } from "./neon";
import { lowTier } from "./quality";

/* ============================================================================
 * CageUnit — قفصٌ حديدي مغلق على نسق الصورة المرجعية:
 *
 *   قاعدةٌ مصبوبة بشفةٍ بارزة  →  إطار أنابيب فولاذية (٤ قوائم + مدّتان)
 *   →  شبكٌ سلكي على الجهات الأربع  →  **سقفٌ شبكي مغلق**  →  لافتةُ رقمٍ
 *   فاتحة معلّقة على الباب  →  والساكن بمنتصف الجوف تماماً.
 *
 * ── لماذا سقفٌ مغلق أصلاً ─────────────────────────────────────────────────
 * النسخة السابقة كانت حظيرةً مفتوحة السقف، فالقفص يُقرأ «صندوقاً» لا قفصاً،
 * وينكشف جوفه من فوق فتضيع حدوده بالمنظر الإيزومتري. الإغلاق يعطيه صمتاً
 * هندسياً: مكعّبٌ تامٌّ تُقرأ أضلاعه الاثنا عشر كلها، تماماً كالصورة.
 *
 * ── الحالة تُقرأ من القاعدة لا من الهيكل ──────────────────────────────────
 * الصورة فولاذٌ صامت بلا لون، والمنتج يحتاج لوناً يقول «فاضٍ/ممتلئ/جرعة».
 * فالحلّ: يبقى الهيكل فولاذاً كما هو، ويُحمل اللون على **شريطٍ مضيء يطوّق
 * القاعدة** — يُرى من كل زاوية، ولا يلوّن القفص نفسه فيخرج عن الصورة.
 *
 * ── الهندسة مشتركة ومدموجة ────────────────────────────────────────────────
 * كل الأجزاء تُبنى مرة واحدة على مستوى الملف وتتشاركها كل الأقفاص: ٦ شبكات
 * للقفص (قاعدة، إطار، شبك جوانب، شبك سقف، طوق حالة، لافتة). الفريد لكل قفص
 * شيئان فقط: خامة طوق الحالة ونسيج رقمه. ولا ضوء نقطي واحد.
 *
 * أثناء السحب يتكلم القفص بطوقه (dropHint):
 *   candidate — متاح: نبض أبيض هادئ «تعال هنا».
 *   hot       — الهدف تحت المؤشر: توهّج ساطع + رفعة.
 *   blocked   — مشغول تحت المؤشر: ينطفئ لرمادي «مو هنا».
 * ==========================================================================*/

/* مقاس القفص: مربّع القاعدة عمداً (٣٫٢×٣٫٢) — فخطوة الشبكة ضِعفُه بالضبط
 * (CELL = ٦٫٤) تعطي فجوةً بحجم قفصٍ كامل **بالاتجاهين معاً**. لو اختلف
 * العرض عن العمق لاختلفت الفجوتان وانكسر النظام البصري. */
export const CAGE_W = 3.2, CAGE_D = 3.2, CAGE_H = 2.4;
const TUBE = 0.085;            // مقطع أنبوب الإطار
const PLINTH_H = 0.34;         // ارتفاع القاعدة المصبوبة
/** ارتفاع مركز القفص عن أرض المشهد — يُحسب فيستقرّ قاع القاعدة على الأرض
 *  بالضبط بدل رقمٍ مضبوطٍ بالعين يغوص أو يطفو كلما تغيّر المقاس. */
export const BASE_Y = CAGE_H / 2 + PLINTH_H - 0.055;

const HW = CAGE_W / 2, HH = CAGE_H / 2, HD = CAGE_D / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** استثناء من التصويب — شبكة زينة لا تُختبر بالشعاع. */
const noHit = () => null;

export type DropHint = "idle" | "candidate" | "hot" | "blocked";

/** تثبيت حافة لوحات drei على المرساة — **إصلاح انزياحٍ سبَّبته RTL**.
 *
 *  عنصر <Html> الداخلي مطلقُ الموضع بلا left/right، فموضعه «الساكن» يُحسب
 *  من اتجاه الكتابة: بصفحةٍ عربية تُحاذى **حافته اليمنى** على المرساة، ثم
 *  يزيحه توسيطُ drei نصفَ عرضه، فيستقرّ مركزه على مسافة عرضٍ كامل يسار
 *  القفص. قِسناه: ٦٢ بكسل لعنصرٍ عرضه ٦٢ — بالضبط. وleft:0 صريحة تُخرجه من
 *  حساب الموضع الساكن كلياً فيعود التوسيط صحيحاً بأي اتجاه كتابة. */
const HTML_ANCHOR = { left: 0, top: 0 } as const;

/* ---------------------------------------------------------------------------
 * هندسات مشتركة — تُبنى مرة واحدة لكل التطبيق.
 * ------------------------------------------------------------------------ */
const at = (g: BufferGeometry, x: number, y: number, z: number, ry = 0): BufferGeometry => {
  const m = new Matrix4();
  if (ry) m.makeRotationY(ry);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
};

/** القاعدة: صبّةٌ سفلية عريضة + شفةٌ أضيق فوقها + صينية الأرضية داخل الإطار.
 *  الطبقتان تصنعان الحرف المشطوف الذي يميّز قاعدة الصورة بلا هندسة مشطوفة. */
const GEO_PLINTH = mergeGeometries([
  at(new BoxGeometry(CAGE_W + 0.36, PLINTH_H * 0.5, CAGE_D + 0.36), 0, -HH - PLINTH_H * 0.75, 0),
  at(new BoxGeometry(CAGE_W + 0.12, PLINTH_H * 0.5, CAGE_D + 0.12), 0, -HH - PLINTH_H * 0.25, 0),
  at(new BoxGeometry(CAGE_W - TUBE, 0.05, CAGE_D - TUBE), 0, -HH + 0.025, 0),
])!;

/** الإطار كله بشبكة واحدة: ٤ قوائم + مدّة علوية + مدّة سفلية + عضادتا الباب
 *  ومقبضه. أنابيبُ مربعة المقطع كما بالصورة — لا اسطوانات (أرخص وأقرب). */
const GEO_FRAME = mergeGeometries([
  // القوائم الأربعة
  ...([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) =>
    at(new BoxGeometry(TUBE, CAGE_H, TUBE), sx * (HW - TUBE / 2), 0, sz * (HD - TUBE / 2))),
  // مدّتان أفقيتان (علوية وسفلية) × أربع جهات
  ...([1, -1] as const).flatMap((sy) => [
    ...([1, -1] as const).map((sz) =>
      at(new BoxGeometry(CAGE_W, TUBE, TUBE), 0, sy * (HH - TUBE / 2), sz * (HD - TUBE / 2))),
    ...([1, -1] as const).map((sx) =>
      at(new BoxGeometry(TUBE, TUBE, CAGE_D), sx * (HW - TUBE / 2), sy * (HH - TUBE / 2), 0)),
  ]),
  // عضادتا الباب على الواجهة + ساكفه — يقرأه العين باباً لا لوحاً شبكياً
  ...([-1, 1] as const).map((sx) =>
    at(new BoxGeometry(TUBE * 0.8, CAGE_H - TUBE * 2, TUBE * 0.8), sx * (HW * 0.62), 0, HD - TUBE * 0.45)),
  at(new BoxGeometry(HW * 1.24, TUBE * 0.8, TUBE * 0.8), 0, HH * 0.52, HD - TUBE * 0.45),
  // المقبض
  at(new BoxGeometry(0.05, 0.34, 0.05), HW * 0.46, -HH * 0.12, HD + 0.03),
])!;

/** شبك الجهات الأربع بشبكةٍ واحدة (يقع داخل الإطار بقليل فلا يتداخل معه). */
const INSET = TUBE * 0.55;
const GEO_MESH = mergeGeometries([
  at(new PlaneGeometry(CAGE_W - TUBE, CAGE_H - TUBE), 0, 0, HD - INSET),
  at(new PlaneGeometry(CAGE_W - TUBE, CAGE_H - TUBE), 0, 0, -HD + INSET),
  at(new PlaneGeometry(CAGE_D - TUBE, CAGE_H - TUBE), HW - INSET, 0, 0, Math.PI / 2),
  at(new PlaneGeometry(CAGE_D - TUBE, CAGE_H - TUBE), -HW + INSET, 0, 0, Math.PI / 2),
])!;

/** السقف الشبكي — الفرق الجوهري عن النسخة السابقة: القفص مغلقٌ تماماً. */
const GEO_ROOF = new PlaneGeometry(CAGE_W - TUBE, CAGE_D - TUBE);
GEO_ROOF.rotateX(-Math.PI / 2);
GEO_ROOF.translate(0, HH - INSET, 0);

/** طوق الحالة — شريطٌ رفيع يدور على شفة القاعدة، هو حاملُ اللون الوحيد. */
const GEO_RIM = mergeGeometries([
  ...([1, -1] as const).map((sz) =>
    at(new BoxGeometry(CAGE_W + 0.14, 0.045, 0.05), 0, -HH - PLINTH_H * 0.5, sz * (HD + 0.06))),
  ...([1, -1] as const).map((sx) =>
    at(new BoxGeometry(0.05, 0.045, CAGE_D + 0.14), sx * (HW + 0.06), -HH - PLINTH_H * 0.5, 0)),
])!;

/* ── لافتة الرقم (نسق الصورة) ───────────────────────────────────────────────
 * لوحٌ **فاتح** برقمٍ داكن — عكس النسخة السابقة تماماً. بالصورة اللافتة هي
 * الشيء الوحيد المضيء على هيكلٍ رمادي، فتقفز للعين بلا أي توهّج صناعي.
 * تُرسم كلها داخل نسيجٍ واحد على لوحٍ شفاف: حوافُّ مدوّرة حقيقية بلا هندسة. */
const SIGN_TEX_W = 380, SIGN_TEX_H = 216;
const SIGN_W = CAGE_W * 0.4;
const SIGN_H = SIGN_W * (SIGN_TEX_H / SIGN_TEX_W);
/** ارتفاع مركز اللافتة من قاع الإطار — للاختبارات والتوثيق. */
export const PLATE_Y_REL = CAGE_H * 0.63;
const PLATE_Y = PLATE_Y_REL - HH;
const GEO_SIGN = new PlaneGeometry(SIGN_W, SIGN_H);
GEO_SIGN.translate(0, PLATE_Y, HD + 0.055);

/** بساط الالتقاط الأرضي — يغطي مسقط القفص وهامشاً حوله فقط.
 *  بعد أن صارت الفجوة بحجم قفصٍ كامل، ما عاد يصحّ أن يمتدّ البساط لكل الخلية:
 *  ضغطةٌ على فراغٍ بعيدٍ عن أي قفص يجب أن تبقى ضغطةَ فراغ. */
const GEO_PAD = new PlaneGeometry(CAGE_W + 0.7, CAGE_D + 0.7);
GEO_PAD.rotateX(-Math.PI / 2);
GEO_PAD.translate(0, -HH - PLINTH_H + 0.02, 0);

/** هالة الأرض — تُركّب فقط للقفص المحوَّم عليه أو المستهدَف. */
const GEO_HALO = new RingGeometry(CAGE_W * 0.76, CAGE_W * 0.93, 40);
GEO_HALO.rotateX(-Math.PI / 2);
GEO_HALO.translate(0, -HH - PLINTH_H + 0.015, 0);

/* ── خامات مشتركة — واحدة لكل مادة بالمشهد كله ──────────────────────────── */
/** الفولاذ المصقول: قاعدةٌ أغمق قليلاً من الإطار فتُقرأ ثِقلاً تحت الهيكل. */
const MAT_PLINTH = new MeshStandardMaterial({ color: "#aeb6bf", metalness: 0.55, roughness: 0.45 });
const MAT_FRAME = new MeshStandardMaterial({ color: "#d3d9e0", metalness: 0.7, roughness: 0.28 });

/** نسيج الشبك: قضبانٌ فولاذية متعامدة — تُرسم بحافةٍ داكنة وقلبٍ فاتح، فتبدو
 *  أسلاكاً مستديرة لها سُمك لا خطوطاً مسطّحة. الفراغ بينها شفافٌ يُقصّ حاداً
 *  (alphaTest) فلا وميضَ ترتيبِ شفافية بين وجهٍ ووجه. */
function makeBarTexture(step: number, bar: number): CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, S, S);
  const draw = (vertical: boolean) => {
    for (let i = 0; i <= S; i += step) {
      const grad = vertical ? g.createLinearGradient(i - bar / 2, 0, i + bar / 2, 0)
        : g.createLinearGradient(0, i - bar / 2, 0, i + bar / 2);
      grad.addColorStop(0, "#59636f");
      grad.addColorStop(0.38, "#dfe6ec");
      grad.addColorStop(1, "#6d7986");
      g.fillStyle = grad;
      if (vertical) g.fillRect(i - bar / 2, 0, bar, S);
      else g.fillRect(0, i - bar / 2, S, bar);
    }
  };
  draw(false);   // الأفقية أولاً ثم العمودية فوقها = تقاطعٌ يُقرأ لُحاماً
  draw(true);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
/* كثافة الشبك تُحاكي الصورة: ~٩ خانات بالعرض و~٧ بالارتفاع على الجوانب،
 * وشبكةٌ أنعم قليلاً على السقف. الأكثفُ من ذلك يتحوّل — عند التصغير — إلى
 * رمادٍ صلب يبتلع الأسلاك، والأقلُّ يفقد القفصَ هويّته. */
const TEX_MESH = makeBarTexture(52, 12);
TEX_MESH.repeat.set(1.8, 1.35);
const TEX_ROOF = makeBarTexture(38, 10);
TEX_ROOF.repeat.set(1.9, 1.9);
const meshMat = (map: CanvasTexture) => new MeshStandardMaterial({
  map, transparent: true, alphaTest: 0.32, side: 2,
  color: "#c9d1d9", metalness: 0.5, roughness: 0.4,
});
const MAT_MESH = meshMat(TEX_MESH);
const MAT_ROOF = meshMat(TEX_ROOF);

export function CageUnit({ spec, position, dropHint, dragActive, ghost, arrivedRef, onHoverChange, onCardDown, selected, showCard = true, onTap }: {
  spec: CageSpec;
  position: [number, number, number];
  dropHint: DropHint;
  dragActive: boolean;
  ghost: boolean;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  onHoverChange: (code: string | null) => void;
  /** بداية إيماءة على البطاقة — الأب يقرر: حركة قصيرة = تفاصيل، طويلة = سحب. */
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  /** محدّد بوضع البناء — توهّج أبيض ثابت فوق أي حالة. */
  selected?: boolean;
  /** بطاقة المريض تُرسم بوضع الإدارة فقط. */
  showCard?: boolean;
  /** نقرة قصيرة على جسم القفص (فرق حركة < ٦ بكسل) — تحديد أو فتح ملف. */
  onTap?: (code: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [imgFail, setImgFail] = useState(false);
  /** التكبير الدلالي: 0 = بعيد (ميدالية فقط)، 1 = قريب (ميدالية + اسم). */
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const hoverRef = useRef(false);
  const lastZoomRef = useRef(0);
  const setHov = (v: boolean) => { hoverRef.current = v; setHover(v); };
  const grp = useRef<Group>(null);
  const haloMat = useRef<MeshStandardMaterial>(null);
  const tmp = useMemo(() => new Color(), []);

  const status = statusOfCage(spec);
  const occupied = !!spec.occupant;
  const baseColor = occupied ? NEON[status] : NEON.free;

  // خامة طوق الحالة — الوحيدة الفريدة لكل قفص، تُدار يدوياً وتُتلف عند الفك.
  const rimMat = useMemo(() => new MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 1.6, toneMapped: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  // اللافتة كاملةً كنسيج: لوحٌ فاتح مدوّر + حدٌّ رمادي + مسماران + رقم داكن
  const codeMat = useMemo(() => {
    const W = SIGN_TEX_W, H = SIGN_TEX_H, R = 18;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    // ظلٌّ يفصل اللوح عن الشبك خلفه فيُقرأ معلّقاً لا مطبوعاً
    g.shadowColor = "#0b0f1466";
    g.shadowOffsetY = 6;
    g.shadowBlur = 12;
    rr(10, 10, W - 20, H - 20, R);
    const face = g.createLinearGradient(0, 10, 0, H - 10);
    face.addColorStop(0, "#fbfaf6");
    face.addColorStop(1, "#dfe0da");
    g.fillStyle = face;
    g.fill();
    g.shadowColor = "transparent";
    // حدّان: خارجيٌّ رمادي وداخليٌّ رفيع — حافة اللوح المعدنية المطويّة
    rr(10, 10, W - 20, H - 20, R);
    g.strokeStyle = "#8b939c";
    g.lineWidth = 4;
    g.stroke();
    rr(20, 20, W - 40, H - 40, R * 0.7);
    g.strokeStyle = "#b9bdb6";
    g.lineWidth = 2;
    g.stroke();
    // مسمارا تثبيت
    for (const x of [34, W - 34]) {
      g.beginPath();
      g.arc(x, H / 2, 7, 0, Math.PI * 2);
      g.fillStyle = "#9aa2ab";
      g.fill();
    }
    // الرقم الداكن — قلب اللافتة
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "800 112px ui-monospace, SFMono-Regular, Menlo, monospace";
    let code = spec.code;
    while (g.measureText(code).width > W - 110 && code.length > 2) code = code.slice(0, -1);
    g.fillStyle = "#242a31";
    g.fillText(code, W / 2, H / 2 + 5);
    const t = new CanvasTexture(c);
    t.anisotropy = 8;
    return new MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
  }, [spec.code]);
  useEffect(() => () => { codeMat.map?.dispose(); codeMat.dispose(); }, [codeMat]);

  /** الحالة الساكنة = لا شيء يتحرك: نخرج من حلقة الإطار مبكراً بدل حساب
   *  ألوانٍ لا تتغيّر لكل قفص كل إطار. */
  const animating = hover || selected || dropHint !== "idle" || !!spec.occupant?.doseDue || arrivedRef.current.has(spec.code);
  const settled = useRef(false);
  useEffect(() => { settled.current = false; }, [animating, baseColor]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 7.5);
    const g = grp.current;

    // عتبة التكبير الدلالي — مع تخلفية صغيرة حتى ما يرفرف الاسم عند الحد
    const zoom = (state.camera as unknown as { zoom?: number }).zoom ?? 60;
    const wantNear = nearRef.current ? zoom > 30 : zoom >= 35;
    if (wantNear !== nearRef.current) {
      nearRef.current = wantNear;
      setNear(wantNear);
    }
    // المتصفح ما يعيد حساب hover لما يتحرك المشهد تحت مؤشر ساكن — فأي حركة
    // كاميرا ملموسة تلغي التحويم حتى لا يعلق الاسم/الهالة على قفص بعيد
    if (hoverRef.current && Math.abs(zoom - lastZoomRef.current) > 1.2) {
      setHov(false);
      onHoverChange(null);
      if (!dragActive) document.body.style.cursor = "";
    }
    lastZoomRef.current = zoom;

    if (settled.current && !animating) return;

    let colorTarget = selected ? "#ffffff"
      : dropHint === "blocked" ? "#64748b"   // مطفأ رمادي = «مو هنا»
        : dropHint === "hot" || dropHint === "candidate" ? HOT
          : baseColor;
    let intensity =
      selected ? 3.2 + Math.sin(state.clock.elapsedTime * 6) * 0.4 :
        dropHint === "hot" ? 4.0 :
          dropHint === "blocked" ? 0.25 :
            dropHint === "candidate" ? 1.3 + Math.sin(state.clock.elapsedTime * 5) * 0.45 :
              hover ? 2.6 : occupied ? 1.7 : 1.0;
    // جرعة مستحقّة: بوضع السكون يتناوب الطوق بين لون الساكن والكهرماني —
    // نداء «تعال أعطِ الدواء» يُقرأ من آخر الممر (الـlerp يحوّله لنبض ناعم).
    if (spec.occupant?.doseDue && !selected && dropHint === "idle" && !hover) {
      const w = Math.sin(state.clock.elapsedTime * 3.4);
      if (w > 0) { colorTarget = DOSE; intensity = 3.0; }
    }
    const arrived = arrivedRef.current.get(spec.code);
    if (arrived != null) {
      const age = (performance.now() - arrived) / 1000;
      if (age < 1.2) intensity += Math.exp(-age * 4) * 3; else arrivedRef.current.delete(spec.code);
    }

    rimMat.emissiveIntensity = lerp(rimMat.emissiveIntensity, intensity, k);
    tmp.set(colorTarget);
    rimMat.emissive.lerp(tmp, k);
    rimMat.color.lerp(tmp, k);
    const targetY = hover || dropHint === "hot" ? position[1] + 0.08 : position[1];
    if (g) g.position.y = lerp(g.position.y, targetY, k);
    const halo = haloMat.current;
    if (halo) {
      const on = hover || dropHint === "hot";
      const breathe = 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
      halo.opacity = lerp(halo.opacity, on ? breathe : 0, k);
      halo.emissive.lerp(tmp, k);
      halo.color.lerp(tmp, k);
    }
    // استقرّ كل شيء ⇒ توقّف عن الحساب حتى يتغيّر شيء فعلاً
    if (!animating
      && Math.abs(rimMat.emissiveIntensity - intensity) < 0.01
      && (!g || Math.abs(g.position.y - targetY) < 0.001)) settled.current = true;
  });
  const showHalo = hover || dropHint === "hot";
  const low = lowTier();

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHov(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}
      onClick={(e) => { if (e.delta < 6 && onTap) { e.stopPropagation(); onTap(spec.code); } }}>

      {/* بساط الالتقاط الأرضي — غير مرئي، بلا كلفة رسم */}
      <mesh geometry={GEO_PAD} visible={false} />
      {/* القاعدة المصبوبة + صينية الأرضية */}
      <mesh geometry={GEO_PLINTH} material={MAT_PLINTH} castShadow={!low} receiveShadow={!low} />
      {/* إطار الأنابيب كاملاً */}
      <mesh geometry={GEO_FRAME} material={MAT_FRAME} castShadow={!low} />
      {/* الشبك: الجهات الأربع ثم السقف المغلق — هوية الشكل، تبقى بكل الأجهزة */}
      <mesh geometry={GEO_MESH} material={MAT_MESH} raycast={noHit} />
      <mesh geometry={GEO_ROOF} material={MAT_ROOF} raycast={noHit} />
      {/* طوق الحالة على شفة القاعدة — حاملُ اللون الوحيد */}
      <mesh geometry={GEO_RIM} material={rimMat} raycast={noHit} />
      {/* اللافتة — نسيجٌ واحد بكل تفاصيلها */}
      <mesh geometry={GEO_SIGN} material={codeMat} raycast={noHit} />

      {/* هالة الاستجابة الأرضية — تُركّب عند الحاجة فقط */}
      {showHalo && (
        <mesh geometry={GEO_HALO} raycast={noHit}>
          <meshStandardMaterial ref={haloMat} color={baseColor} emissive={baseColor} emissiveIntensity={1.2}
            toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* مرساة اختبارات غير مرئية — ببيئة التطوير فقط */}
      {import.meta.env.DEV && (
        <Html center position={[0, PLATE_Y, HD + 0.06]}
          zIndexRange={[10, 0]} style={{ ...HTML_ANCHOR, pointerEvents: "none" }}>
          <span data-cage3d={spec.code} style={{ width: 12, height: 8, display: "block" }} />
        </Html>
      )}

      {/* الساكن **بمنتصف جوف القفص تماماً** — لا فوقه ولا على واجهته:
       *  ميداليةٌ بصورته واسمُه تحتها، فيُقرأ واقفاً داخل قفصه كما بالواقع.
       *  والتكبير الدلالي يبقى: بعيدٌ = ميدالية، قريبٌ = ينضاف الاسم،
       *  تحويمٌ = ينضاف نوع الإقامة. */}
      {spec.occupant && showCard && (
        <Html center position={[0, -HH * 0.05, 0]}
          zIndexRange={hover ? [24, 0] : [20, 0]}
          style={{ ...HTML_ANCHOR, pointerEvents: dragActive || ghost ? "none" : "auto" }}>
          <div data-occ-of={spec.code}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onCardDown(spec.code, e); }}
            onPointerEnter={() => { setHov(true); onHoverChange(spec.code); }}
            onPointerLeave={() => { setHov(false); onHoverChange(null); }}
            style={{
              direction: "rtl", display: "grid", justifyItems: "center", rowGap: 5,
              cursor: "grab", touchAction: "none", userSelect: "none",
              opacity: ghost ? 0.28 : 1,
              /* حجمٌ بمساحة الشاشة لا بمقياس العالم. distanceFactor يصلح
               * لكاميرا منظورية: هنا — وبكاميرا أورثوغرافية — كان يصغّر
               * العنصر **بعد** توسيطه بنسبةٍ مئوية، فينزلق الساكن عن مركز
               * قفصه كلما بَعُد القفصُ عن الكاميرا (القريب يبقى بمكانه
               * والبعيد ينزاح — وهو ما كان يظهر). بلا العامل يبقى الساكن
               * بمنتصف جوفه تماماً، والتكبير الدلالي وحده يتكفّل بالمقياس. */
              transform: `scale(${near ? 1 : 0.74})`,
              transformOrigin: "center",
              transition: "opacity .18s ease, transform .18s ease",
            }}>
            {/* الميدالية */}
            <span style={{ position: "relative", width: 62, height: 62, display: "block" }}>
              {imgFail || !spec.occupant.photoUrl ? (
                <span style={{
                  display: "grid", placeItems: "center", width: 62, height: 62, fontSize: 32,
                  borderRadius: "50%", background: "#0c1626f2",
                  border: `3.5px solid ${baseColor}`, boxShadow: `0 0 16px ${baseColor}88, 0 6px 14px #000a`,
                }}>{spec.occupant.emoji}</span>
              ) : (
                <img src={spec.occupant.photoUrl ?? ""} alt="" onError={() => setImgFail(true)}
                  style={{
                    width: 62, height: 62, objectFit: "cover", borderRadius: "50%",
                    border: `3.5px solid ${baseColor}`, background: "#0c1626",
                    boxShadow: `0 0 16px ${baseColor}88, 0 6px 14px #000a`,
                    pointerEvents: "none", display: "block",
                  }} />
              )}
              {spec.occupant.doseDue && (
                <span data-dose3d title="جرعة مستحقّة" style={{
                  position: "absolute", top: -3, insetInlineEnd: -5,
                  width: 22, height: 22, borderRadius: "50%", background: DOSE,
                  border: "2px solid #241503", boxShadow: `0 0 12px ${DOSE}cc`,
                  display: "grid", placeItems: "center", fontSize: 11, lineHeight: 1,
                }}>💉</span>
              )}
            </span>
            {/* فص الاسم — بالقرب أو عند التحويم */}
            {(near || hover) && (
              <b style={{
                background: "#0c1626f2", border: `1.5px solid ${baseColor}`,
                borderRadius: 10, padding: "3px 11px", whiteSpace: "nowrap",
                maxWidth: 128, overflow: "hidden", textOverflow: "ellipsis",
                color: NIGHT.ink, fontSize: 13, fontWeight: 800,
                boxShadow: `0 0 12px ${baseColor}44, 0 5px 12px #0009`,
              }}>{spec.occupant.name}</b>
            )}
            {/* النوع — عند التحويم فقط */}
            {hover && !dragActive && (
              <i style={{
                background: "#0c1626e8", borderRadius: 7, padding: "1px 7px",
                color: baseColor, fontSize: 11.5, fontStyle: "normal", fontWeight: 800, whiteSpace: "nowrap",
              }}>{KIND_AR[spec.occupant.status]}</i>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export { DANGER };
