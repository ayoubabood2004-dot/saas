import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  BoxGeometry, CanvasTexture, Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, RingGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BufferGeometry, Group } from "three";
import { DF, NEON, NIGHT, DANGER, DOSE, HOT, KIND_AR, statusOfCage, type CageSpec } from "./neon";
import { lowTier } from "./quality";

/* ============================================================================
 * CageUnit — حظيرة بيطرية مفتوحة السقف: قاعدة، أربعة قوائم وإطار ليد علوي
 * يحمل لون الحالة، جدران زجاجية فوق لوح معدني، باب أمامي، فرشة، لوحة رقم،
 * والمريض بصورته فوقها.
 *
 * ── الهندسة مشتركة ومدموجة (إعادة بناء الأداء) ────────────────────────────
 * النسخة السابقة كانت ترسم ~٥٠ شبكة لكل قفص، ولكل شبكة خامتها الخاصة، **ومعها
 * ضوءٌ نقطي لكل قفص**. اثنا عشر قفصاً = ٦٠٨ نداء رسم و٦٧ ألف مثلث و٢١ ضوءاً —
 * وكل ضوء يدخل حلقة شادر البكسل لكل مادة مضاءة بالمشهد، فالجهاز الضعيف يختنق.
 *
 * الآن: كل الأجزاء المعدنية (القوائم + ألواح الجدران + إطار الباب + المقبض)
 * مدموجة بهندسة واحدة تُبنى مرة واحدة على مستوى الملف وتتشاركها كل الأقفاص،
 * وكذلك الزجاج والقاعدة والفرشة واللوحة. الفريد لكل قفص شيئان فقط: خامة إطار
 * الليد (لون الحالة) ونسيج رقمه. ولا ضوء نقطي واحد — الإطار المضيء يكفي.
 *   ٧ شبكات للقفص بدل ~٥٠، وخامتان بدل ~٢٠، وصفر أضواء إضافية.
 *
 * أثناء السحب تتكلم الحظيرة بالضوء (dropHint):
 *   candidate — متاحة: نبض أبيض هادئ «تعال هنا».
 *   hot       — الهدف تحت المؤشر: توهّج أبيض ساطع + رفعة.
 *   blocked   — مشغولة تحت المؤشر: تنطفئ لرمادي «مو هنا».
 * (اللون الأحمر صار هوية «فاضٍ»، فما عاد يصلح إشارةَ منع.)
 * ==========================================================================*/

export const CAGE_W = 2.0, CAGE_H = 1.12, CAGE_D = 1.75;
const POST = 0.06;           // سماكة القوائم
const LOWER_H = 0.3;         // اللوح المعدني السفلي — منخفض ليتّسع الزجاج
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** استثناء من التصويب — شبكة زينة لا تُختبر بالشعاع. */
const noHit = () => null;

export type DropHint = "idle" | "candidate" | "hot" | "blocked";

/* ---------------------------------------------------------------------------
 * هندسات مشتركة — تُبنى مرة واحدة لكل التطبيق. الدمج هنا (لا بالتشغيل) لأن
 * الأقفاص كلها بالقياس نفسه: قفصٌ جديد لا يكلّف هندسةً جديدة، بل موضعاً فقط.
 * ------------------------------------------------------------------------ */
const at = (g: BufferGeometry, x: number, y: number, z: number, ry = 0): BufferGeometry => {
  const m = new Matrix4();
  if (ry) m.makeRotationY(ry);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
};
const innerW = CAGE_W - POST * 2, innerD = CAGE_D - POST * 2;
const doorW = innerW - 0.16;

/** القاعدة + أرضية الحظيرة — خامة واحدة (نفس اللون أصلاً). */
const GEO_BASE = mergeGeometries([
  at(new BoxGeometry(CAGE_W + 0.16, 0.14, CAGE_D + 0.16), 0, -CAGE_H / 2 - 0.07, 0),
  at(new BoxGeometry(innerW, 0.02, innerD), 0, -CAGE_H / 2 + 0.02, 0),
])!;

/** الفرشة المبطّنة. */
const GEO_CUSHION = new BoxGeometry(innerW - 0.16, 0.09, innerD - 0.16);
GEO_CUSHION.translate(0, -CAGE_H / 2 + 0.09, 0);

/** كل المعدن بشبكة واحدة: ٤ قوائم + ٣ ألواح سفلية + إطار الباب + المقبض. */
const GEO_METAL = mergeGeometries([
  // القوائم الأربعة
  ...([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) =>
    at(new BoxGeometry(POST, CAGE_H, POST), sx * (CAGE_W / 2 - POST / 2), 0, sz * (CAGE_D / 2 - POST / 2))),
  // الألواح المعدنية السفلية: الخلف + الجانبان
  at(new BoxGeometry(innerW, LOWER_H, 0.025), 0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, -CAGE_D / 2 + 0.015),
  at(new BoxGeometry(innerD, LOWER_H, 0.025), -CAGE_W / 2 + 0.015, -CAGE_H / 2 + LOWER_H / 2 + 0.02, 0, Math.PI / 2),
  at(new BoxGeometry(innerD, LOWER_H, 0.025), CAGE_W / 2 - 0.015, -CAGE_H / 2 + LOWER_H / 2 + 0.02, 0, Math.PI / 2),
  // إطار الباب: عضادتان وساكفان
  at(new BoxGeometry(0.045, CAGE_H - 0.18, 0.032), -doorW / 2, 0.02, CAGE_D / 2 - 0.014),
  at(new BoxGeometry(0.045, CAGE_H - 0.18, 0.032), doorW / 2, 0.02, CAGE_D / 2 - 0.014),
  at(new BoxGeometry(innerW - 0.13, 0.045, 0.032), 0, 0.02 + (CAGE_H - 0.2) / 2, CAGE_D / 2 - 0.014),
  at(new BoxGeometry(innerW - 0.13, 0.045, 0.032), 0, 0.02 - (CAGE_H - 0.2) / 2, CAGE_D / 2 - 0.014),
  // المقبض
  at(new BoxGeometry(0.04, 0.3, 0.04), innerW / 2 - 0.2, 0.06, CAGE_D / 2 + 0.015),
])!;

/** الزجاج كله بشبكة واحدة: الجانبان والخلف والباب. */
const GEO_GLASS = mergeGeometries([
  at(new PlaneGeometry(innerW, CAGE_H - LOWER_H - 0.1), 0, LOWER_H / 2 - 0.06, -CAGE_D / 2 + 0.015),
  at(new PlaneGeometry(innerD, CAGE_H - LOWER_H - 0.1), -CAGE_W / 2 + 0.015, LOWER_H / 2 - 0.06, 0, Math.PI / 2),
  at(new PlaneGeometry(innerD, CAGE_H - LOWER_H - 0.1), CAGE_W / 2 - 0.015, LOWER_H / 2 - 0.06, 0, Math.PI / 2),
  at(new PlaneGeometry(doorW, CAGE_H - 0.22), 0, 0.02, CAGE_D / 2 - 0.02),
])!;

/** إطار الليد العلوي — أربعة أضلاع بشبكة واحدة (مؤشر الحالة الأساسي). */
const GEO_RIM = mergeGeometries([
  at(new BoxGeometry(CAGE_W, 0.045, 0.045), 0, CAGE_H / 2, CAGE_D / 2 - POST / 2),
  at(new BoxGeometry(CAGE_W, 0.045, 0.045), 0, CAGE_H / 2, -CAGE_D / 2 + POST / 2),
  at(new BoxGeometry(0.045, 0.045, CAGE_D), CAGE_W / 2 - POST / 2, CAGE_H / 2, 0),
  at(new BoxGeometry(0.045, 0.045, CAGE_D), -CAGE_W / 2 + POST / 2, CAGE_H / 2, 0),
])!;

const PLATE_Y = -CAGE_H / 2 + LOWER_H / 2 + 0.04;
const GEO_PLATE = new BoxGeometry(0.68, 0.27, 0.03);
GEO_PLATE.translate(0, PLATE_Y, CAGE_D / 2 + 0.012);
const GEO_CODE = new PlaneGeometry(0.63, 0.236);
GEO_CODE.translate(0, PLATE_Y, CAGE_D / 2 + 0.03);
/** بساط أرضي غير مرئي تحت القفص — يلتقط الضغطات التي تقع على أرضه أو حول
 *  قاعدته. بلا شيءٍ أرضي كان الشعاع يمرّ بين القوائم فيسقط بلا هدف، والطبيب
 *  يظنّ ضغطته لم تُسجَّل. صندوقٌ مصمت بدله لا يصلح: بمنظر إيزومتري يحجب صندوقُ
 *  القفص الأمامي قفصَ الخلف فتذهب الضغطة للجار الغلط. */
/* بعرض خلية الشبكة بالضبط (٣ وحدات): يغطّي كل ما يخصّ القفص ولا يتعدّى على
 * جاره — فما تذهب ضغطةٌ لقفصٍ غير الذي قصده الطبيب. */
const GEO_PAD = new PlaneGeometry(2.98, 2.98);
GEO_PAD.rotateX(-Math.PI / 2);
GEO_PAD.translate(0, -CAGE_H / 2 - 0.13, 0);

/** هالة الأرض — تُركّب فقط للقفص المحوَّم عليه أو المستهدَف، لا لكل قفص. */
const GEO_HALO = new RingGeometry(1.16, 1.46, 32);
GEO_HALO.rotateX(-Math.PI / 2);
GEO_HALO.translate(0, -CAGE_H / 2 - 0.135, 0);

/* خامات مشتركة — خامة واحدة لكل مادة بالمشهد كله.
 * المعدنية منخفضة عمداً: المعدن بلا خريطة بيئة يعكس سواداً، والوضع الخفيف
 * يُسقط خريطة البيئة — فالنسخة السابقة كانت تُظلم المشهد كله على الجهاز الذي
 * يحتاج الوضوح أكثر من غيره. خشونة أعلى + معدنية أقل = معدنٌ مقروء بلا بيئة. */
const MAT_BASE = new MeshStandardMaterial({ color: "#26313f", metalness: 0.25, roughness: 0.6 });
const MAT_CUSHION = new MeshStandardMaterial({ color: NIGHT.cushion, roughness: 0.9 });
const MAT_METAL = new MeshStandardMaterial({ color: "#4a586c", metalness: 0.35, roughness: 0.45 });
const MAT_GLASS = new MeshStandardMaterial({
  color: "#bfe9f5", transparent: true, opacity: 0.13, roughness: 0.1, metalness: 0.1, depthWrite: false, side: 2,
});
const MAT_PLATE = new MeshStandardMaterial({ color: "#33445a", metalness: 0.3, roughness: 0.5 });

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

  // خامة إطار الليد — الوحيدة الفريدة لكل قفص، تُدار يدوياً وتُتلف عند الفك.
  const rimMat = useMemo(() => new MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 1.6, toneMapped: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  // نسيج رقم القفص — يُرسم بالكانفس مرة لكل رمز (خط النظام، فوري، بلا شبكة)
  const codeMat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 256, 96);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "800 62px ui-monospace, SFMono-Regular, Menlo, monospace";
    let code = spec.code;
    while (g.measureText(code).width > 236 && code.length > 2) code = code.slice(0, -1);
    g.shadowColor = "#000000aa";
    g.shadowOffsetY = 2;
    g.shadowBlur = 2;
    g.fillStyle = NIGHT.plateInk;
    g.fillText(code, 128, 50);
    const t = new CanvasTexture(c);
    t.anisotropy = 4;
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
    const wantNear = nearRef.current ? zoom > 36 : zoom >= 41;
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
      : dropHint === "blocked" ? "#64748b"   // مطفأ رمادي = «مو هنا» (الأحمر صار هوية الفاضي)
        : dropHint === "hot" || dropHint === "candidate" ? HOT
          : baseColor;
    let intensity =
      selected ? 3.2 + Math.sin(state.clock.elapsedTime * 6) * 0.4 :
        dropHint === "hot" ? 4.0 :
          dropHint === "blocked" ? 0.25 :
            dropHint === "candidate" ? 1.3 + Math.sin(state.clock.elapsedTime * 5) * 0.45 :
              hover ? 3.0 : occupied ? 2.1 : 1.1;
    // جرعة مستحقّة: بوضع السكون يتناوب الإطار بين لون الساكن والكهرماني —
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
    const targetY = hover || dropHint === "hot" ? position[1] + 0.06 : position[1];
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

  const topY = CAGE_H / 2;
  const showHalo = hover || dropHint === "hot";

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHov(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}
      onClick={(e) => { if (e.delta < 6 && onTap) { e.stopPropagation(); onTap(spec.code); } }}>

      {/* بساط الالتقاط الأرضي — غير مرئي، بلا كلفة رسم */}
      <mesh geometry={GEO_PAD} visible={false} />
      {/* القاعدة + أرضية الحظيرة */}
      <mesh geometry={GEO_BASE} material={MAT_BASE} castShadow={!lowTier()} receiveShadow={!lowTier()} />
      {/* الفرشة */}
      <mesh geometry={GEO_CUSHION} material={MAT_CUSHION} raycast={noHit} />
      {/* كل المعدن بشبكة واحدة */}
      <mesh geometry={GEO_METAL} material={MAT_METAL} castShadow={!lowTier()} />
      {/* إطار الليد — لون الحالة */}
      <mesh geometry={GEO_RIM} material={rimMat} raycast={noHit} />
      {/* الزجاج (الجانبان + الخلف + الباب) — بالوضع الخفيف يُسقط تماماً */}
      {!lowTier() && <mesh geometry={GEO_GLASS} material={MAT_GLASS} raycast={noHit} />}
      {/* لوحة الرقم ورقمها */}
      <mesh geometry={GEO_PLATE} material={MAT_PLATE} />
      <mesh geometry={GEO_CODE} material={codeMat} raycast={noHit} />

      {/* هالة الاستجابة الأرضية — تُركّب عند الحاجة فقط */}
      {showHalo && (
        <mesh geometry={GEO_HALO} raycast={noHit}>
          <meshStandardMaterial ref={haloMat} color={baseColor} emissive={baseColor} emissiveIntensity={1.2}
            toneMapped={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* مرساة اختبارات غير مرئية — ببيئة التطوير فقط */}
      {import.meta.env.DEV && (
        <Html center position={[0, PLATE_Y - 0.02, CAGE_D / 2 + 0.035]}
          zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span data-cage3d={spec.code} style={{ width: 12, height: 8, display: "block" }} />
        </Html>
      )}

      {/* ميدالية الساكن — تكبيرٌ دلالي مثل الخرائط:
       *    بعيد → ميدالية مدوّرة صغيرة (صورة بحلقة بلون الحالة + نقطة جرعة)
       *    قريب → ينضاف فص الاسم تحتها
       *    تحويم → البطاقة الكاملة (الاسم + النوع) مرفوعة فوق الكل
       *  فما تتكدّس البطاقات فوق بعضها بالمنظر البعيد مهما كثر النزلاء. */}
      {spec.occupant && showCard && (
        <Html center position={[0, topY + 0.52, CAGE_D * 0.16]} distanceFactor={DF}
          zIndexRange={hover ? [24, 0] : [20, 0]}
          style={{ pointerEvents: dragActive || ghost ? "none" : "auto" }}>
          <div data-occ-of={spec.code}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onCardDown(spec.code, e); }}
            onPointerEnter={() => { setHov(true); onHoverChange(spec.code); }}
            onPointerLeave={() => { setHov(false); onHoverChange(null); }}
            style={{
              direction: "rtl", display: "grid", justifyItems: "center", rowGap: 4,
              cursor: "grab", touchAction: "none", userSelect: "none",
              opacity: ghost ? 0.28 : 1, transition: "opacity .18s ease",
            }}>
            {/* الميدالية */}
            <span style={{ position: "relative", width: 56, height: 56, display: "block" }}>
              {imgFail || !spec.occupant.photoUrl ? (
                <span style={{
                  display: "grid", placeItems: "center", width: 56, height: 56, fontSize: 29,
                  borderRadius: "50%", background: "#0c1626f2",
                  border: `3.5px solid ${baseColor}`, boxShadow: `0 0 16px ${baseColor}88, 0 6px 14px #000a`,
                }}>{spec.occupant.emoji}</span>
              ) : (
                <img src={spec.occupant.photoUrl ?? ""} alt="" onError={() => setImgFail(true)}
                  style={{
                    width: 56, height: 56, objectFit: "cover", borderRadius: "50%",
                    border: `3.5px solid ${baseColor}`, background: "#0c1626",
                    boxShadow: `0 0 16px ${baseColor}88, 0 6px 14px #000a`,
                    pointerEvents: "none", display: "block",
                  }} />
              )}
              {spec.occupant.doseDue && (
                <span data-dose3d title="جرعة مستحقّة" style={{
                  position: "absolute", top: -3, insetInlineEnd: -5,
                  width: 21, height: 21, borderRadius: "50%", background: DOSE,
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
                color: NIGHT.ink, fontSize: 14.5, fontWeight: 800,
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
