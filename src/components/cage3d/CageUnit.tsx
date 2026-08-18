import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Html } from "@react-three/drei";
import { CanvasTexture, Color, MeshStandardMaterial } from "three";
import type { Group, PointLight } from "three";
import { DF, NEON, NIGHT, DANGER, DOSE, HOT, KIND_AR, statusOfCage, type CageSpec } from "./neon";

/* ============================================================================
 * CageUnit — حظيرة بيطرية واقعية مفتوحة السقف: قاعدة معدنية، أربعة قوائم
 * وإطار علوي يحمل نيون الحالة، جدران زجاجية فوق لوح معدني سفلي، بوابة قضبان
 * أمامية، فرشة مبطّنة، لوحة رقم «محفورة»، والمريض بصورته الحقيقية واقفاً
 * داخل الحظيرة وبطاقته فوقها.
 *
 * أثناء السحب تتكلم الحظيرة بالضوء (dropHint):
 *   candidate — متاحة: نبض هادئ «تعال هنا».
 *   hot       — الهدف الصالح تحت المؤشر: توهّج أبيض-سيان ساطع + رفعة.
 *   blocked   — مشغولة تحت المؤشر: تحمرّ «مو هنا».
 * إطار النيون العلوي كله خامة واحدة مشتركة بين أضلاعه الأربعة، فمرجع واحد
 * يلوّنها ويشدّها معاً بالـlerp كل إطار — لا شيء يومض فجأة.
 * ==========================================================================*/

export const CAGE_W = 2.0, CAGE_H = 1.12, CAGE_D = 1.75;
const POST = 0.06;           // سماكة القوائم
const LOWER_H = 0.3;         // اللوح المعدني السفلي — منخفض ليتّسع الزجاج
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type DropHint = "idle" | "candidate" | "hot" | "blocked";

export function CageUnit({ spec, position, dropHint, dragActive, ghost, arrivedRef, onHoverChange, onCardDown, neon, selected, showCard = true, onTap }: {
  spec: CageSpec;
  position: [number, number, number];
  dropHint: DropHint;
  dragActive: boolean;
  ghost: boolean;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  onHoverChange: (code: string | null) => void;
  /** بداية إيماءة على البطاقة — الأب يقرر: حركة قصيرة = تفاصيل، طويلة = سحب. */
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  /** ليد مخصّص من وضع البناء — هوية القفص وهو فاضٍ (المشغول يلبس لون راقده). */
  neon?: string;
  /** محدّد بوضع البناء — توهّج أبيض ثابت فوق أي حالة. */
  selected?: boolean;
  /** بطاقة المريض تُرسم بوضع الإدارة فقط. */
  showCard?: boolean;
  /** نقرة قصيرة على جسم القفص (فرق حركة < ٦ بكسل) — تحديد أو فتح ملف. */
  onTap?: (code: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [imgFail, setImgFail] = useState(false);
  /** التكبير الدلالي: 0 = بعيد (ميدالية فقط)، 1 = قريب (ميدالية + اسم).
   *  يُشتق من تكبير الكاميرا كل إطار ويُحدَّث فقط عند عبور العتبة. */
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const hoverRef = useRef(false);
  const lastZoomRef = useRef(0);
  const setHov = (v: boolean) => { hoverRef.current = v; setHover(v); };
  const grp = useRef<Group>(null);
  const haloMat = useRef<MeshStandardMaterial>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);
  const tmp = useMemo(() => new Color(), []);

  const status = statusOfCage(spec);
  const occupied = !!spec.occupant;
  const baseColor = occupied ? NEON[status] : neon ?? NEON.free;

  // خامة إطار النيون — واحدة لكل الأضلاع، تُدار يدوياً وتُتلف عند الفك.
  const rimMat = useMemo(() => new MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 1.6, toneMapped: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  // نسيج رقم القفص — يُرسم بالكانفس مرة لكل رمز (خط النظام، فوري، بلا شبكة)
  const codeTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 256, 96);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "800 52px ui-monospace, SFMono-Regular, Menlo, monospace";
    let code = spec.code;
    while (g.measureText(code).width > 236 && code.length > 2) code = code.slice(0, -1);
    g.shadowColor = "#000000aa";
    g.shadowOffsetY = 2;
    g.shadowBlur = 2;
    g.fillStyle = NIGHT.plateInk;
    g.fillText(code, 128, 50);
    const t = new CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }, [spec.code]);
  useEffect(() => () => codeTex.dispose(), [codeTex]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 7.5);
    const g = grp.current, shell = shellMat.current, l = glow.current;

    // عتبة التكبير الدلالي — مع تخلفية صغيرة حتى ما يرفرف الاسم عند الحد
    const zoom = (state.camera as unknown as { zoom?: number }).zoom ?? 60;
    const wantNear = nearRef.current ? zoom > 44 : zoom >= 50;
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

    let colorTarget = selected ? "#ffffff" : dropHint === "blocked" ? DANGER : dropHint === "hot" ? HOT : baseColor;
    let intensity =
      selected ? 3.2 + Math.sin(state.clock.elapsedTime * 6) * 0.4 :
      dropHint === "hot" ? 4.0 :
      dropHint === "blocked" ? 1.8 :
      dropHint === "candidate" ? 1.5 + Math.sin(state.clock.elapsedTime * 5) * 0.5 :
      hover ? 3.0 : occupied ? 1.7 : 0.65;
    // جرعة مستحقّة: بوضع السكون يتناوب الإطار بين لون الساكن والكهرماني —
    // نداء «تعال أعطِ الدواء» يُقرأ من آخر الممر (الـlerp يحوّله لنبض ناعم).
    if (spec.occupant?.doseDue && !selected && dropHint === "idle" && !hover) {
      const w = Math.sin(state.clock.elapsedTime * 3.4);
      if (w > 0) { colorTarget = DOSE; intensity = 2.8; }
    }
    const arrived = arrivedRef.current.get(spec.code);
    if (arrived != null) {
      const age = (performance.now() - arrived) / 1000;
      if (age < 1.2) intensity += Math.exp(-age * 4) * 3; else arrivedRef.current.delete(spec.code);
    }

    rimMat.emissiveIntensity = lerp(rimMat.emissiveIntensity, intensity, k);
    rimMat.emissive.lerp(tmp.set(colorTarget), k);
    rimMat.color.lerp(tmp.set(colorTarget), k);
    if (shell) {
      shell.emissiveIntensity = lerp(shell.emissiveIntensity, dropHint === "hot" ? 0.25 : hover ? 0.2 : occupied ? 0.08 : 0.05, k);
      shell.emissive.lerp(tmp.set(colorTarget), k);
    }
    if (l) {
      l.intensity = lerp(l.intensity, dropHint === "hot" ? 1.9 : hover ? 1.5 : occupied ? 1.0 : 0.3, k);
      l.color.lerp(tmp.set(colorTarget), k);
    }
    if (g) g.position.y = lerp(g.position.y, hover || dropHint === "hot" ? position[1] + 0.06 : position[1], k);
    // هالة الاستجابة الأرضية: تظهر بنعومة عند التحويم وتتنفّس مع الزمن
    const halo = haloMat.current;
    if (halo) {
      const on = hover || dropHint === "hot";
      const breathe = 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
      halo.opacity = lerp(halo.opacity, on ? breathe : 0, k);
      halo.emissive.lerp(tmp.set(colorTarget), k);
      halo.color.lerp(tmp.set(colorTarget), k);
    }
  });

  const topY = CAGE_H / 2;
  const innerW = CAGE_W - POST * 2, innerD = CAGE_D - POST * 2;

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHov(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}
      onClick={(e) => { if (e.delta < 6 && onTap) { e.stopPropagation(); onTap(spec.code); } }}>

      {/* القاعدة — ترفع الحظيرة وتعطيها ثقل المعدّات الحقيقية */}
      <RoundedBox args={[CAGE_W + 0.16, 0.14, CAGE_D + 0.16]} radius={0.04} position={[0, -CAGE_H / 2 - 0.07, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={NIGHT.plinth} metalness={0.6} roughness={0.4} />
      </RoundedBox>

      {/* هالة الاستجابة الأرضية — تتوهّج بنعومة عند التحويم وعند الاستهداف */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -CAGE_H / 2 - 0.135, 0]}>
        <ringGeometry args={[1.16, 1.46, 48]} />
        <meshStandardMaterial ref={haloMat} color={NEON.free} emissive={NEON.free} emissiveIntensity={1.2}
          toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* أرضية الحظيرة + الفرشة المبطّنة (وسادة بخياطة وسطية) */}
      <mesh position={[0, -CAGE_H / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[innerW, innerD]} />
        <meshStandardMaterial color={NIGHT.plinth} roughness={0.85} />
      </mesh>
      <RoundedBox args={[innerW - 0.16, 0.09, innerD - 0.16]} radius={0.045} position={[0, -CAGE_H / 2 + 0.09, 0]} receiveShadow>
        <meshStandardMaterial color={NIGHT.cushion} roughness={0.95} />
      </RoundedBox>
      <mesh position={[0, -CAGE_H / 2 + 0.136, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[innerW - 0.2, 0.02]} />
        <meshStandardMaterial color={NIGHT.cushionSeam} roughness={1} />
      </mesh>

      {/* أربعة قوائم معدنية */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (CAGE_W / 2 - POST / 2), 0, sz * (CAGE_D / 2 - POST / 2)]} castShadow>
          <boxGeometry args={[POST, CAGE_H, POST]} />
          <meshStandardMaterial ref={i === 0 ? shellMat : undefined} color={NIGHT.shell} metalness={0.75} roughness={0.3}
            emissive={baseColor} emissiveIntensity={0.05} />
        </mesh>
      ))}

      {/* إطار النيون العلوي — أربعة أضلاع بخامة واحدة (مؤشر الحالة الأساسي) */}
      <mesh position={[0, topY, CAGE_D / 2 - POST / 2]} material={rimMat}><boxGeometry args={[CAGE_W, 0.045, 0.045]} /></mesh>
      <mesh position={[0, topY, -CAGE_D / 2 + POST / 2]} material={rimMat}><boxGeometry args={[CAGE_W, 0.045, 0.045]} /></mesh>
      <mesh position={[CAGE_W / 2 - POST / 2, topY, 0]} material={rimMat}><boxGeometry args={[0.045, 0.045, CAGE_D]} /></mesh>
      <mesh position={[-CAGE_W / 2 + POST / 2, topY, 0]} material={rimMat}><boxGeometry args={[0.045, 0.045, CAGE_D]} /></mesh>

      {/* الجدران: لوح معدني سفلي + زجاج شفاف فوقه (الجانبان والخلف) */}
      {([[0, -CAGE_D / 2 + 0.015, 0, innerW], [-CAGE_W / 2 + 0.015, 0, Math.PI / 2, innerD], [CAGE_W / 2 - 0.015, 0, Math.PI / 2, innerD]] as const)
        .map(([x, z, ry, w], i) => (
          <group key={i} position={[x, 0, z]} rotation={[0, ry, 0]}>
            <mesh position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, 0]}>
              <boxGeometry args={[w, LOWER_H, 0.025]} />
              <meshStandardMaterial color={NIGHT.shell} metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[0, LOWER_H / 2 - 0.06, 0]}>
              <planeGeometry args={[w, CAGE_H - LOWER_H - 0.1]} />
              <meshStandardMaterial color="#bfe9f5" transparent opacity={0.13} roughness={0.1} metalness={0.1} depthWrite={false} />
            </mesh>
          </group>
        ))}

      {/* الباب الزجاجي الأمامي — إطار ستانلس رفيع ومقبض وفتحات تهوية سفلية:
       *  كبينة عيادة حديثة، لا قضبان سجن. */}
      <group position={[0, 0, CAGE_D / 2 - 0.02]}>
        <mesh position={[0, 0.02, 0]}>
          <planeGeometry args={[innerW - 0.16, CAGE_H - 0.22]} />
          <meshStandardMaterial color="#cfeefb" transparent opacity={0.15} roughness={0.05} metalness={0.08} depthWrite={false} />
        </mesh>
        {/* إطار الباب */}
        {[-(innerW - 0.16) / 2, (innerW - 0.16) / 2].map((o, i) => (
          <mesh key={i} position={[o, 0.02, 0.006]} castShadow>
            <boxGeometry args={[0.045, CAGE_H - 0.18, 0.032]} />
            <meshStandardMaterial color={NIGHT.bars} metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        {[(CAGE_H - 0.2) / 2, -(CAGE_H - 0.2) / 2].map((y, i) => (
          <mesh key={i} position={[0, 0.02 + y, 0.006]}>
            <boxGeometry args={[innerW - 0.13, 0.045, 0.032]} />
            <meshStandardMaterial color={NIGHT.bars} metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        {/* المقبض الستانلس */}
        <mesh position={[innerW / 2 - 0.2, 0.06, 0.035]}>
          <cylinderGeometry args={[0.022, 0.022, 0.3, 10]} />
          <meshStandardMaterial color="#c9d5e0" metalness={0.9} roughness={0.18} />
        </mesh>
        {/* فتحات تهوية سفلية على جانبي لوحة الرقم */}
        {[-innerW * 0.28, innerW * 0.28].flatMap((x) =>
          [0, 1, 2].map((i) => (
            <mesh key={`${x}-${i}`} position={[x, -CAGE_H / 2 + 0.13 + i * 0.055, 0.006]}>
              <boxGeometry args={[innerW * 0.26, 0.016, 0.02]} />
              <meshStandardMaterial color={NIGHT.bars} metalness={0.7} roughness={0.3} />
            </mesh>
          )),
        )}
      </group>

      {/* لوحة الرقم «المحفورة» على الواجهة */}
      <RoundedBox args={[0.52, 0.2, 0.03]} radius={0.02} position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 + 0.012]}>
        <meshStandardMaterial color={NIGHT.plate} metalness={0.8} roughness={0.35} />
      </RoundedBox>
      {/* الرقم داخل خامة اللوحة نفسها (نسيج canvas): جزء فيزيائي من القفص
       *  يميل وينحجب معه — لا نص DOM طائف ولا نص مجسّم يجلب خطاً بـWorker
       *  (تعثّره كان يعلّق المشهد). وبالإنتاج: صفر عناصر DOM للقفص الفاضي. */}
      <mesh position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 + 0.03]}>
        <planeGeometry args={[0.48, 0.18]} />
        <meshBasicMaterial map={codeTex} transparent toneMapped={false} />
      </mesh>
      {/* مرساة اختبارات غير مرئية — ببيئة التطوير فقط */}
      {import.meta.env.DEV && (
        <Html center position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 + 0.035]}
          zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span data-cage3d={spec.code} style={{ width: 12, height: 8, display: "block" }} />
        </Html>
      )}

      {/* ضوء الحالة داخل الحظيرة — يصبغ الفرشة والزجاج بلون الراقد */}
      <pointLight ref={glow} color={baseColor} intensity={occupied ? 1.0 : 0.3} distance={2.6} position={[0, 0.25, 0.2]} />

      {/* ميدالية الساكن — تكبيرٌ دلالي مثل الخرائط:
       *    بعيد → ميدالية مدوّرة صغيرة (صورة بحلقة بلون الحالة + نقطة جرعة)
       *    قريب → ينضاف فص الاسم تحتها
       *    تحويم → البطاقة الكاملة (الاسم + النوع) مرفوعة فوق الكل
       *  فما تتكدّس البطاقات فوق بعضها بالمنظر البعيد مهما كثر النزلاء.
       *  نفس الإيماءات: ضغطة = حمل/تفاصيل، سحبة = نقل. */}
      {spec.occupant && showCard && (
        <Html center position={[0, topY + 0.3, CAGE_D * 0.18]} distanceFactor={DF}
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
            <span style={{ position: "relative", width: 46, height: 46, display: "block" }}>
              {imgFail || !spec.occupant.photoUrl ? (
                <span style={{
                  display: "grid", placeItems: "center", width: 46, height: 46, fontSize: 24,
                  borderRadius: "50%", background: "#0c1626f2",
                  border: `3px solid ${baseColor}`, boxShadow: `0 0 14px ${baseColor}88, 0 6px 14px #000a`,
                }}>{spec.occupant.emoji}</span>
              ) : (
                <img src={spec.occupant.photoUrl ?? ""} alt="" onError={() => setImgFail(true)}
                  style={{
                    width: 46, height: 46, objectFit: "cover", borderRadius: "50%",
                    border: `3px solid ${baseColor}`, background: "#0c1626",
                    boxShadow: `0 0 14px ${baseColor}88, 0 6px 14px #000a`,
                    pointerEvents: "none", display: "block",
                  }} />
              )}
              {spec.occupant.doseDue && (
                <span data-dose3d title="جرعة مستحقّة" style={{
                  position: "absolute", top: -3, insetInlineEnd: -5,
                  width: 17, height: 17, borderRadius: "50%", background: DOSE,
                  border: "2px solid #241503", boxShadow: `0 0 10px ${DOSE}cc`,
                  display: "grid", placeItems: "center", fontSize: 9, lineHeight: 1,
                }}>💉</span>
              )}
            </span>
            {/* فص الاسم — بالقرب أو عند التحويم */}
            {(near || hover) && (
              <b style={{
                background: "#0c1626f2", border: `1.5px solid ${baseColor}`,
                borderRadius: 9, padding: "2px 9px", whiteSpace: "nowrap",
                maxWidth: 116, overflow: "hidden", textOverflow: "ellipsis",
                color: NIGHT.ink, fontSize: 12.5, fontWeight: 800,
                boxShadow: `0 0 12px ${baseColor}44, 0 5px 12px #0009`,
              }}>{spec.occupant.name}</b>
            )}
            {/* النوع — عند التحويم فقط */}
            {hover && !dragActive && (
              <i style={{
                background: "#0c1626e8", borderRadius: 7, padding: "1px 7px",
                color: baseColor, fontSize: 10, fontStyle: "normal", fontWeight: 800, whiteSpace: "nowrap",
              }}>{KIND_AR[spec.occupant.status]}</i>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
