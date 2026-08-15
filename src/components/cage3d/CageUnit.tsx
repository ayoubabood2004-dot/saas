import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Text, Html } from "@react-three/drei";
import { Color, MeshStandardMaterial } from "three";
import type { Group, PointLight } from "three";
import { speciesPhoto } from "@/lib/petPhotos";
import { NEON, NIGHT, DANGER, HOT, DIGIT_FONT, KIND_AR, statusOfCage, type CageSpec } from "./neon";

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

export const CAGE_W = 1.7, CAGE_H = 1.0, CAGE_D = 1.5;
const POST = 0.06;           // سماكة القوائم
const LOWER_H = 0.4;         // اللوح المعدني السفلي
const BARS = 7;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type DropHint = "idle" | "candidate" | "hot" | "blocked";

export function CageUnit({ spec, position, dropHint, dragActive, ghost, arrivedRef, onHoverChange, onCardDown }: {
  spec: CageSpec;
  position: [number, number, number];
  dropHint: DropHint;
  dragActive: boolean;
  ghost: boolean;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  onHoverChange: (code: string | null) => void;
  /** بداية إيماءة على البطاقة — الأب يقرر: حركة قصيرة = تفاصيل، طويلة = سحب. */
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
}) {
  const [hover, setHover] = useState(false);
  const [imgFail, setImgFail] = useState(false);
  const grp = useRef<Group>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);
  const tmp = useMemo(() => new Color(), []);

  const status = statusOfCage(spec);
  const occupied = !!spec.occupant;
  const baseColor = NEON[status];

  // خامة إطار النيون — واحدة لكل الأضلاع، تُدار يدوياً وتُتلف عند الفك.
  const rimMat = useMemo(() => new MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 1.6, toneMapped: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 7.5);
    const g = grp.current, shell = shellMat.current, l = glow.current;

    const colorTarget = dropHint === "blocked" ? DANGER : dropHint === "hot" ? HOT : baseColor;
    let intensity =
      dropHint === "hot" ? 4.0 :
      dropHint === "blocked" ? 1.8 :
      dropHint === "candidate" ? 1.5 + Math.sin(state.clock.elapsedTime * 5) * 0.5 :
      hover ? 3.0 : occupied ? 1.7 : 0.65;
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
  });

  const topY = CAGE_H / 2;
  const innerW = CAGE_W - POST * 2, innerD = CAGE_D - POST * 2;

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}>

      {/* القاعدة — ترفع الحظيرة وتعطيها ثقل المعدّات الحقيقية */}
      <RoundedBox args={[CAGE_W + 0.16, 0.14, CAGE_D + 0.16]} radius={0.04} position={[0, -CAGE_H / 2 - 0.07, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={NIGHT.plinth} metalness={0.6} roughness={0.4} />
      </RoundedBox>

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

      {/* البوابة الأمامية: قضبان سفلية + زجاج فوقها + مقبض */}
      {Array.from({ length: BARS }, (_, i) => (
        <mesh key={i} position={[-(innerW - 0.2) / 2 + (i * (innerW - 0.2)) / (BARS - 1), -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 - 0.02]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, LOWER_H, 10]} />
          <meshStandardMaterial color={NIGHT.bars} metalness={0.65} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, -CAGE_H / 2 + LOWER_H + 0.03, CAGE_D / 2 - 0.02]}>
        <boxGeometry args={[innerW, 0.035, 0.035]} />
        <meshStandardMaterial color={NIGHT.shell} metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0, LOWER_H / 2 - 0.06, CAGE_D / 2 - 0.015]}>
        <planeGeometry args={[innerW, CAGE_H - LOWER_H - 0.1]} />
        <meshStandardMaterial color="#bfe9f5" transparent opacity={0.13} roughness={0.1} metalness={0.1} depthWrite={false} />
      </mesh>

      {/* لوحة الرقم «المحفورة» على الواجهة */}
      <RoundedBox args={[0.52, 0.2, 0.03]} radius={0.02} position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 + 0.012]}>
        <meshStandardMaterial color={NIGHT.plate} metalness={0.8} roughness={0.35} />
      </RoundedBox>
      <Text font={DIGIT_FONT} fontSize={0.12} position={[0, -CAGE_H / 2 + LOWER_H / 2 + 0.02, CAGE_D / 2 + 0.032]}
        color={NIGHT.plateInk} anchorX="center" anchorY="middle">
        {spec.code}
      </Text>

      {/* ضوء الحالة داخل الحظيرة — يصبغ الفرشة والزجاج بلون الراقد */}
      <pointLight ref={glow} color={baseColor} intensity={occupied ? 1.0 : 0.3} distance={2.6} position={[0, 0.25, 0.2]} />

      {/* المريض بصورته الحقيقية واقفاً على الفرشة (إيموجي احتياطاً بلا شبكة) */}
      {spec.occupant && !ghost && (
        <Html center position={[0, -CAGE_H / 2 + 0.42, 0.05]} zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
          {imgFail ? (
            <span style={{ fontSize: 40, filter: `drop-shadow(0 0 10px ${baseColor})` }}>{spec.occupant.emoji}</span>
          ) : (
            <img src={speciesPhoto(spec.occupant.species, 128)} alt={spec.occupant.name}
              onError={() => setImgFail(true)}
              style={{
                width: 62, height: 62, objectFit: "cover", borderRadius: 14,
                border: `2px solid ${baseColor}aa`, boxShadow: `0 6px 18px #000b, 0 0 14px ${baseColor}55`,
              }} />
          )}
        </Html>
      )}

      {/* مرساة إحداثيات للاختبارات الآلية — بلا أي أثر بصري */}
      <Html center position={[0, 0, 0]} style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
        <span data-cage3d={spec.code} style={{ width: 1, height: 1, display: "block" }} />
      </Html>

      {/* بطاقة المريض فوق الحظيرة — ضغطة قصيرة تفاصيل، وسحبة تنقله */}
      {spec.occupant && (
        <Html center position={[0, topY + 0.55, 0]} zIndexRange={[40, 0]}
          style={{ pointerEvents: dragActive || ghost ? "none" : "auto" }}>
          <div data-occ-of={spec.code}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onCardDown(spec.code, e); }}
            style={{
              direction: "rtl", display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: 12, cursor: "grab", touchAction: "none",
              userSelect: "none", whiteSpace: "nowrap",
              background: "#0c1626f0", border: `1px solid ${baseColor}66`,
              boxShadow: `0 0 16px ${baseColor}40`,
              opacity: ghost ? 0.28 : 1, transition: "opacity .18s ease",
            }}>
            {imgFail ? (
              <span style={{ fontSize: 20, filter: `drop-shadow(0 0 6px ${baseColor})` }}>{spec.occupant.emoji}</span>
            ) : (
              <img src={speciesPhoto(spec.occupant.species, 64)} alt="" onError={() => setImgFail(true)}
                style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 8, border: `1px solid ${baseColor}88`, pointerEvents: "none" }} />
            )}
            <span style={{ display: "grid", lineHeight: 1.25 }}>
              <b style={{ color: NIGHT.ink, fontSize: 12.5, fontWeight: 800 }}>{spec.occupant.name}</b>
              <i style={{ color: baseColor, fontSize: 10, fontStyle: "normal", fontWeight: 700 }}>{KIND_AR[spec.occupant.status]}</i>
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
