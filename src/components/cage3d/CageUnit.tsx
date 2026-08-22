import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  BoxGeometry, BufferAttribute, CanvasTexture, Color, Matrix4, MeshBasicMaterial,
  MeshPhongMaterial, PlaneGeometry, RepeatWrapping, RingGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BufferGeometry, Group } from "three";
import { NEON, NIGHT, DANGER, DOSE, FREE, HOT, KIND_AR, OCCUPIED, statusOfCage, type CageSpec, type Occupant } from "./neon";
import { formatNum } from "@/lib/utils";
import i18n from "@/i18n";

/* نصوص البطاقة عبر i18n مباشرةً (لا useTranslation): هذه مكوّناتٌ صغيرة
 * تُركَّب داخل مشهدٍ ثلاثي الأبعاد بكثرة، وربطُ كلٍّ منها بمراقب تغيّر اللغة
 * يعيد تركيبها جميعاً بلا داعٍ — واللغة لا تتبدّل والطبيب واقفٌ بالغرفة. */
const T = {
  free: () => i18n.t("cages.freeShort", "فاضٍ"),
  owner: () => i18n.t("cages.owner", "المالك"),
  phone: () => i18n.t("cages.phone", "الهاتف"),
  cage: () => i18n.t("cages.cage", "القفص"),
  doseNow: () => i18n.t("cages.doseNow", "جرعة مستحقّة الآن"),
  hint: () => i18n.t("cages.cardHint", "اضغط للملف الطبي · اسحب لنقله"),
  dayN: (n: string) => i18n.t("cages.dayN", { n, defaultValue: "اليوم {{n}}" }),
};
/* ملاحظة: ما عاد للقفص فرعٌ «خفيف» يُسقط أجزاءه.
 * كان الشبك يُسقَط على الأجهزة الضعيفة — فيخسر أضعفُ جهازٍ **هويةَ الشكل
 * نفسها**. بعد الدمج (نداءان للقفص كله) وخامة فونج وإسقاطِ خرائط الظل
 * وخريطة البيئة، صار المشهد الكامل أرخصَ من «الخفيف» القديم، فما بقي شيءٌ
 * يستحقّ الإسقاط. الفروق الباقية بين المستويين تُدار بالمشهد (Cage3DDemo):
 * كثافة البكسل، وتنعيم الحواف، وظلّ الملامسة. */

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

/* ألوان الجسم — تُخبز في **ألوان الرؤوس** لا في خاماتٍ منفصلة.
 * لماذا: القاعدة أغمق من الإطار (تُقرأ ثِقلاً تحته)، والصينية أغمق منهما
 * (تعطي الساكنَ خلفيةً يُقرأ عليها). ثلاثةُ ألوانٍ كانت تعني ثلاث خامات =
 * ثلاثة نداءات رسم لكل قفص. بلونِ رأسٍ واحدٍ مخبوز يصير الجسمُ كلّه شبكةً
 * واحدة وخامةً واحدة ونداءً واحداً — بلا أي تنازل عن التدرّج. */
/* المدى القيمي هو ما يصنع «المعدن». اللوحة السابقة كانت كلها بالربع الأفتح
 * (إطارٌ ٩٣٪ وقاعدةٌ ٧١٪ وصينيةٌ ٨٠٪) — ثلاثُ درجاتٍ متلاصقة تُقرأ لوناً
 * واحداً باهتاً مهما أضأتَها. الآن الفارق بين أفتحِ جزءٍ وأغمقه يقارب
 * الضعف، فيُقرأ القفص جسماً مصنوعاً من معدنٍ له وجوهٌ وظِلال — وهو أيضاً
 * أقربُ للصورة المرجعية: فولاذٌ **متوسّط** بلمعاتٍ بيضاء، لا أبيضُ كامل. */
const C_FRAME = "#9fb2c6";   // فولاذ الإطار: متوسّط، واللمعةُ المرآوية ترفعه للنصوع
const C_PLINTH = "#54657a";  // القاعدة: داكنة فتُثبِّت القفص على أرضه
const C_TRAY = "#7a8da1";    // صينية الأرضية: أغمقها فيُقرأ الساكن عليها

/** يخبز لوناً ثابتاً في رؤوس الشكل — الخطوة التي تسمح بدمج قطعٍ مختلفة
 *  الألوان في شبكةٍ واحدة. (three يحوّل sRGB→خطّي عند إنشاء Color، فالقيم
 *  المكتوبة هنا بالفضاء العامل الصحيح.) */
const tint = (g: BufferGeometry, hex: string): BufferGeometry => {
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new BufferAttribute(arr, 3));
  return g;
};

/** جسم القفص كلّه بشبكةٍ واحدة: قاعدة (صبّتان + صينية) + إطار (٤ قوائم
 *  و٨ مدّات وعضادتا الباب وساكفه ومقبضه). */
const GEO_BODY = mergeGeometries([
  // القاعدة المصبوبة: صبّةٌ عريضة + شفةٌ أضيق = حرفٌ مشطوف بلا هندسة مشطوفة
  tint(at(new BoxGeometry(CAGE_W + 0.36, PLINTH_H * 0.5, CAGE_D + 0.36), 0, -HH - PLINTH_H * 0.75, 0), C_PLINTH),
  tint(at(new BoxGeometry(CAGE_W + 0.12, PLINTH_H * 0.5, CAGE_D + 0.12), 0, -HH - PLINTH_H * 0.25, 0), C_PLINTH),
  tint(at(new BoxGeometry(CAGE_W - TUBE, 0.05, CAGE_D - TUBE), 0, -HH + 0.025, 0), C_TRAY),
  ...[
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
  ].map((g) => tint(g, C_FRAME)),
])!;

/** يخبز مقياس تكرار النسيج في **إحداثيات الرؤوس** بدل خاصية repeat بالخامة.
 *  هذه هي الحيلة التي تسمح بدمج الجدران الأربعة والسقف — بكثافةِ شبكٍ مختلفة
 *  للسقف — في شبكةٍ واحدة بخامةٍ واحدة: repeat خاصيةُ خامة، فلو اختلفت لزم
 *  خامتان ونداءان؛ أمّا الإحداثيات فخاصيةُ شكل، تُدمَج معه. */
const uvScale = (g: BufferGeometry, sx: number, sy: number): BufferGeometry => {
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
};

/** الشبك كله — الجدران الأربعة **والسقف** — بشبكةٍ واحدة وخامةٍ واحدة. */
const INSET = TUBE * 0.55;
const roof = new PlaneGeometry(CAGE_W - TUBE, CAGE_D - TUBE);
roof.rotateX(-Math.PI / 2);
roof.translate(0, HH - INSET, 0);
const GEO_SCREEN = mergeGeometries([
  uvScale(at(new PlaneGeometry(CAGE_W - TUBE, CAGE_H - TUBE), 0, 0, HD - INSET), 1.8, 1.35),
  uvScale(at(new PlaneGeometry(CAGE_W - TUBE, CAGE_H - TUBE), 0, 0, -HD + INSET), 1.8, 1.35),
  uvScale(at(new PlaneGeometry(CAGE_D - TUBE, CAGE_H - TUBE), HW - INSET, 0, 0, Math.PI / 2), 1.8, 1.35),
  uvScale(at(new PlaneGeometry(CAGE_D - TUBE, CAGE_H - TUBE), -HW + INSET, 0, 0, Math.PI / 2), 1.8, 1.35),
  uvScale(roof, 1.9, 1.9),
])!;

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
/* مقاس نسيج اللافتة: نسيجٌ لكل قفص (الرقم يختلف)، فذاكرته تُضرب بعدد
 * الأقفاص — لكنّ اللافتة هي **أهمُّ ما يُقرأ بالمشهد**، فتستحق بكسلاتها.
 * ٣٨٤×٢١٦ تبقى حادّةً عند أقصى تكبير. */
const SIGN_TEX_W = 384, SIGN_TEX_H = 216;
/** عرض اللافتة = ٥٦٪ من عرض الباب (كان ٤٠٪): تملأ صدر القفص فيُقرأ رقمها
 *  من آخر الغرفة بلا تكبير. أكبرُ من ذلك يزاحم ميدالية الساكن. */
const SIGN_W = CAGE_W * 0.56;
const SIGN_H = SIGN_W * (SIGN_TEX_H / SIGN_TEX_W);
/** ارتفاع مركز اللافتة من قاع الإطار — للاختبارات والتوثيق. */
export const PLATE_Y_REL = CAGE_H * 0.63;
const PLATE_Y = PLATE_Y_REL - HH;
const GEO_SIGN = new PlaneGeometry(SIGN_W, SIGN_H);
GEO_SIGN.translate(0, PLATE_Y, HD + 0.055);

/** هدف اللمس: **صندوقٌ غير مرئي بحجم القفص** لا بساطٌ أرضي.
 *  البساط المسطّح كان يلتقط ما يقع على مسقط القفص فقط، فالضغطة على أعلى
 *  القفص — وهو أكثرُ ما تقع عليه العين بمنظرٍ إيزومتري — كانت تمرّ بين
 *  الأسلاك وتضيع. الصندوق يجعل مساحةَ اللمس **ظِلَّ القفص على الشاشة
 *  بالضبط**. ولأنه غير مرئي فكلفته صفر بالرسم: شكلٌ واحد يُختبر بالشعاع. */
const GEO_HIT = new BoxGeometry(CAGE_W + 0.36, CAGE_H + PLINTH_H, CAGE_D + 0.36);
GEO_HIT.translate(0, -PLINTH_H / 2, 0);

/** هالة الأرض — تُركّب فقط للقفص المحوَّم عليه أو المستهدَف. */
const GEO_HALO = new RingGeometry(CAGE_W * 0.56, CAGE_W * 0.64, 40);
GEO_HALO.rotateX(-Math.PI / 2);
GEO_HALO.translate(0, -HH - PLINTH_H + 0.015, 0);

/* ── خامات مشتركة — واحدة لكل مادة بالمشهد كله ──────────────────────────── */
/** فونج لا فيزيائية (Standard): المشهد أسلوبيٌّ إيزومتري لا عرضٌ واقعي.
 *  خامة PBR تحسب توزيعاً مجهرياً وانعكاسَ بيئةٍ لكل بكسل — كلفةٌ تُدفَع على
 *  كل شاشةٍ ضعيفة مقابل فرقٍ لا يكاد يُرى على فولاذٍ مصقولٍ بلون واحد.
 *  فونج تعطي البريق نفسه بلمعةٍ مرآوية صريحة وبجزءٍ من الكلفة، **وتُغني عن
 *  خريطة البيئة كلياً** (وكانت هي سببَ الرمادِ الغبِر: معدنٌ بلا بيئةٍ
 *  كافية يعكس عتمة). */
const MAT_BODY = new MeshPhongMaterial({
  vertexColors: true, specular: "#ffffff", shininess: 90, reflectivity: 0.45,
});

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
      /* حافّةٌ فاتحة لا داكنة: الحوافُّ الداكنة تمتزج — عند التصغير — بلونٍ
       * رماديٍّ متوسط يجعل القفصَ يبدو **مغبَّراً**. سلكٌ فاتحُ القلب هادئُ
       * الحافة يبقى سلكاً مهما صَغُر. */
      grad.addColorStop(0, "#5d6d7e");
      grad.addColorStop(0.4, "#eef4fa");
      grad.addColorStop(1, "#6d7d8e");
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
/* نسيجٌ واحد للجدران والسقف معاً — الكثافة تُخبز بالإحداثيات (uvScale)
 * لا بـrepeat، فالسقف أنعم من الجدران بلا خامةٍ ثانية. */
const TEX_SCREEN = makeBarTexture(52, 12);
const MAT_SCREEN = new MeshPhongMaterial({
  map: TEX_SCREEN, transparent: true, alphaTest: 0.34, side: 2,
  color: "#aebfd0", specular: "#ffffff", shininess: 60,
});

/** سطرٌ من سطور البطاقة: عنوانٌ خافت وقيمةٌ واضحة. يُحذف السطر كلّه إن
 *  غابت قيمته — بطاقةٌ بحقولٍ فارغة أسوأ من بطاقةٍ أقصر. */
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={{ color: "#6f8ba6", fontSize: 10.5, fontWeight: 700, flex: "0 0 auto" }}>{label}</span>
      <span style={{
        color: NIGHT.ink, fontSize: 11.5, fontWeight: 800, textAlign: "start",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl",
      }}>{value}</span>
    </div>
  );
}

/* ============================================================================
 * OccupantCard — «مَن الساكن هنا؟» بلا فتح ملف.
 *
 * تنمو من الميدالية نفسها (تكبيرٌ من ٠٫٨ + انزلاقٌ لأعلى) فتُقرأ **امتداداً
 * لها** لا لوحةً هبطت من مكانٍ آخر — وهذا ما يجعل الطبيب يربطها بالقفص الذي
 * أشّر عليه فوراً حتى لو كانت الغرفة مزدحمة. وتُرسى فوق الميدالية لا تحتها:
 * أسفل القفص لافتةُ رقمه، وحجبُها يُفقد السياق كلّه.
 * ==========================================================================*/
function OccupantCard({ occ, code, color }: { occ: Occupant; code: string; color: string }) {
  /* تصحيحٌ أفقي يبقي البطاقة داخل الشاشة.
   * البطاقة تُرسى على قفصها، وقفصٌ عند حافة الشاشة يدفعها خارجها — فلا
   * تُقرأ، وأسوأ: تُنشئ فيضاناً أفقياً يزحزح المشهد كلّه. فنقيس موضعها بعد
   * التركيب ونزيحها للداخل بالقدر اللازم فقط — تبقى ملتصقةً بقفصها ما دامت
   * تسع، ولا تخرج أبداً. */
  const box = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    const over = Math.max(0, r.right + pad - window.innerWidth);
    const under = Math.max(0, pad - r.left);
    if (over > 0) setDx(-over);
    else if (under > 0) setDx(under);
  }, [code]);
  const kindLine = `${KIND_AR[occ.status]} — ${T.dayN(formatNum(occ.days))}`;
  const traits = [occ.speciesAr, occ.breed, occ.sexAr, occ.ageAr].filter(Boolean).join(" · ");
  return (
    <div ref={box} data-occcard={code} style={{
      position: "absolute", bottom: "calc(100% + 10px)", left: `calc(50% + ${dx}px)`,
      width: 226, padding: "10px 12px 9px", borderRadius: 14, textAlign: "start",
      background: "#081320f7", border: `1.5px solid ${color}`,
      boxShadow: `0 0 22px ${color}44, 0 14px 34px #000b`,
      /* بلا backdrop-filter: الترشيح الخلفي يُجبر المتصفّح على التقاط ما
       * خلف البطاقة لكل إطار — وما خلفها كانفس WebGL. كلفةٌ حقيقية على
       * الآيباد مقابل ضبابٍ لا يُرى أصلاً فوق خلفيةٍ معتمة ٩٧٪. */
      cursor: "default",
      animation: "vpCageCardIn .17s cubic-bezier(.2,.9,.3,1.15) both",
    }}>
      <p style={{ color: NIGHT.ink, fontSize: 15, fontWeight: 900, lineHeight: 1.2, margin: 0 }}>{occ.name}</p>
      {traits && <p style={{ color: "#8fb0cc", fontSize: 11, fontWeight: 700, margin: "2px 0 0" }}>{traits}</p>}
      <p style={{ color, fontSize: 11.5, fontWeight: 900, margin: "6px 0 0" }}>{kindLine}</p>
      <div style={{ height: 1, background: "#173049", margin: "8px 0 7px" }} />
      <div style={{ display: "grid", rowGap: 4 }}>
        <Row label={T.owner()} value={occ.ownerName} />
        <Row label={T.phone()} value={occ.ownerPhone} />
        <Row label={T.cage()} value={code} />
      </div>
      {occ.doseDue && (
        <p style={{
          margin: "8px 0 0", padding: "4px 8px", borderRadius: 8, textAlign: "center",
          background: `${DOSE}22`, border: `1px solid ${DOSE}77`,
          color: DOSE, fontSize: 11, fontWeight: 900,
        }}>💉 {T.doseNow()}</p>
      )}
      <p style={{ margin: "8px 0 0", color: "#5b7d9a", fontSize: 10, fontWeight: 700, textAlign: "center" }}>
        {T.hint()}
      </p>
    </div>
  );
}

/** شارة «فاضٍ» — تُرسم بمركز كل قفصٍ خالٍ، تماماً حيث تقف ميدالية الساكن.
 *
 *  هذه هي الإجابة على «يميّز بلا تفكير»: مركزُ كل قفصٍ يحمل شيئاً واحداً لا
 *  ثالثَ له — صورةُ حيوانٍ أو شارةٌ خضراء. فالعين لا تبحث عن فرقٍ بين
 *  درجتَي رمادي ولا تحسب أطواقاً مضيئة؛ تمسح الغرفة مسحاً واحداً فتعرف. */
function FreeBadge({ code }: { code: string }) {
  return (
    <span data-freebadge={code} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "5px 12px 5px 9px", borderRadius: 999,
      background: "#071a10ef", border: `2px solid ${FREE}`,
      boxShadow: `0 0 14px ${FREE}66, 0 6px 14px #0009`,
      color: "#c9f9dd", fontSize: 12.5, fontWeight: 900, whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: "50%", background: FREE,
        boxShadow: `0 0 8px ${FREE}`, flex: "0 0 auto",
      }} />
      {T.free()}
    </span>
  );
}

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
  const haloMat = useRef<MeshBasicMaterial>(null);
  const tmp = useMemo(() => new Color(), []);

  const status = statusOfCage(spec);
  const occupied = !!spec.occupant;
  const baseColor = occupied ? NEON[status] : NEON.free;

  // خامة طوق الحالة — الوحيدة الفريدة لكل قفص، تُدار يدوياً وتُتلف عند الفك.
  const rimMat = useMemo(() => new MeshPhongMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 1.6, toneMapped: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  /* اللافتة كاملةً كنسيج: لوحٌ فاتح مدوّر + مسماران + رقم داكن + **شريط
   * حالةٍ مصمت أسفلها**. الشريط هنا لا كشبكةٍ ثالثة: اللافتة نسيجٌ فريدٌ
   * لكل قفصٍ أصلاً (الرقم يختلف)، فرسمُ شريطٍ داخله يكلّف صفراً بالرسم —
   * ويعطي أوضحَ إشارةٍ ممكنة، لأن اللافتة هي أكبرُ ما تقع عليه العين. */
  const codeMat = useMemo(() => {
    const W = SIGN_TEX_W, H = SIGN_TEX_H, R = 20;
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
    rr(8, 8, W - 16, H - 16, R);
    const face = g.createLinearGradient(0, 8, 0, H - 8);
    face.addColorStop(0, "#ffffff");
    face.addColorStop(1, "#eceee9");
    g.fillStyle = face;
    g.fill();
    g.shadowColor = "transparent";
    // حدّان: خارجيٌّ رمادي وداخليٌّ رفيع — حافة اللوح المعدنية المطويّة
    rr(8, 8, W - 16, H - 16, R);
    g.strokeStyle = "#5c6672";
    g.lineWidth = 5;
    g.stroke();
    rr(18, 18, W - 36, H - 36, R * 0.7);
    g.strokeStyle = "#aeb4ad";
    g.lineWidth = 2;
    g.stroke();
    // مسمارا تثبيت
    for (const x of [30, W - 30]) {
      g.beginPath();
      g.arc(x, H / 2, 7, 0, Math.PI * 2);
      g.fillStyle = "#9aa2ab";
      g.fill();
    }
    // الرقم الداكن — قلب اللافتة
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 132px ui-monospace, SFMono-Regular, Menlo, monospace";
    let code = spec.code;
    while (g.measureText(code).width > W - 96 && code.length > 2) code = code.slice(0, -1);
    g.fillStyle = "#12171c";
    g.fillText(code, W / 2, H / 2 + 6);
    // شريط الحالة: أخضرُ متاح أو أزرقُ مشغول، بعرض اللافتة أسفلها
    g.save();
    rr(8, 8, W - 16, H - 16, R);
    g.clip();
    g.fillStyle = occupied ? OCCUPIED : FREE;
    g.fillRect(8, H - 44, W - 16, 36);
    g.restore();
    const t = new CanvasTexture(c);
    t.anisotropy = 8;
    return new MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
  }, [spec.code, occupied]);
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
      : dropHint === "blocked" ? DANGER      // أحمر = «مو هنا»
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
      const breathe = 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.12;
      halo.opacity = lerp(halo.opacity, on ? breathe : 0, k);
      halo.color.lerp(tmp, k);
    }
    // استقرّ كل شيء ⇒ توقّف عن الحساب حتى يتغيّر شيء فعلاً
    if (!animating
      && Math.abs(rimMat.emissiveIntensity - intensity) < 0.01
      && (!g || Math.abs(g.position.y - targetY) < 0.001)) settled.current = true;
  });
  const showHalo = hover || dropHint === "hot";
  /* البطاقة الموسّعة تُفتح بالتأشير فقط، وتُغلق أثناء السحب أو البناء: أثناء
   * نقل حيوانٍ تكون العين على «وين أحطه» لا على «من هذا». */
  const showFull = hover && !dragActive && !ghost && showCard;

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHov(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}
      onClick={(e) => { if (e.delta < 6 && onTap) { e.stopPropagation(); onTap(spec.code); } }}>

      {/* هدف اللمس — غير مرئي، بلا كلفة رسم */}
      <mesh geometry={GEO_HIT} visible={false} />
      {/* الجسم كله (قاعدة + صينية + إطار) بنداءٍ واحد */}
      <mesh geometry={GEO_BODY} material={MAT_BODY} raycast={noHit} />
      {/* الشبك كله (جدرانٌ أربعة + سقف) بنداءٍ واحد */}
      <mesh geometry={GEO_SCREEN} material={MAT_SCREEN} raycast={noHit} />
      {/* طوق الحالة على شفة القاعدة — حاملُ اللون الوحيد */}
      <mesh geometry={GEO_RIM} material={rimMat} raycast={noHit} />
      {/* اللافتة — نسيجٌ واحد بكل تفاصيلها */}
      <mesh geometry={GEO_SIGN} material={codeMat} raycast={noHit} />

      {/* هالة الاستجابة الأرضية — تُركّب عند الحاجة فقط */}
      {showHalo && (
        <mesh geometry={GEO_HALO} raycast={noHit}>
          {/* هالةٌ مسطّحة لا تحتاج إضاءة — أرخص خامة بالمكتبة */}
          <meshBasicMaterial ref={haloMat} color={baseColor} toneMapped={false}
            transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* مرساة اختبارات غير مرئية — ببيئة التطوير فقط */}
      {import.meta.env.DEV && (
        <Html center position={[0, PLATE_Y, HD + 0.06]}
          zIndexRange={[10, 0]} style={{ ...HTML_ANCHOR, pointerEvents: "none" }}>
          <span data-cage3d={spec.code} style={{ width: 12, height: 8, display: "block" }} />
        </Html>
      )}

      {/* القفص الخالي: شارةٌ خضراء بمركزه — نفس موضع ميدالية الساكن تماماً */}
      {!spec.occupant && showCard && (
        <Html center position={[0, -HH * 0.05, 0]} zIndexRange={[16, 0]}
          style={{ ...HTML_ANCHOR, pointerEvents: "none" }}>
          <span style={{
            display: "block", direction: "rtl", userSelect: "none",
            transform: `scale(${near ? 1 : 0.8})`, transformOrigin: "center",
            transition: "transform .18s ease",
          }}>
            <FreeBadge code={spec.code} />
          </span>
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
            {/* فص الاسم — بالقرب، ويختفي حين تفتح البطاقة الموسّعة مكانه */}
            {near && !showFull && (
              <b style={{
                background: "#0c1626f2", border: `1.5px solid ${baseColor}`,
                borderRadius: 10, padding: "3px 11px", whiteSpace: "nowrap",
                maxWidth: 128, overflow: "hidden", textOverflow: "ellipsis",
                color: NIGHT.ink, fontSize: 13, fontWeight: 800,
                boxShadow: `0 0 12px ${baseColor}44, 0 5px 12px #0009`,
              }}>{spec.occupant.name}</b>
            )}
            {/* البطاقة الموسّعة — تنمو من فوق الميدالية عند التأشير */}
            {showFull && <OccupantCard occ={spec.occupant} code={spec.code} color={baseColor} />}
          </div>
        </Html>
      )}
    </group>
  );
}

export { DANGER };
