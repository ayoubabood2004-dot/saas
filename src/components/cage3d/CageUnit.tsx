import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Edges, Text, Html } from "@react-three/drei";
import { Color } from "three";
import type { Group, MeshStandardMaterial, PointLight } from "three";
import { NEON, NIGHT, DANGER, HOT, DIGIT_FONT, KIND_AR, statusOfCage, type CageSpec } from "./neon";

/* ============================================================================
 * CageUnit — قفص واحد مجسّم: قاعدة، هيكل معدني، جوف غامق، قضبان ستيل أمامية،
 * شريط نيون للحالة على العتبة، رقم مضيء، وبطاقة المريض الراقد فوقه.
 *
 * أثناء السحب يتكلم القفص بالضوء نفسه (dropHint):
 *   candidate — قفص متاح: نبض هادئ «تعال هنا».
 *   hot       — الهدف الصالح تحت المؤشر: توهّج أبيض-سيان ساطع + رفعة.
 *   blocked   — مشغول تحت المؤشر: يحمرّ «مو هنا».
 * وكل الانتقالات تتنفّس بالـlerp (لون وشدّة معاً) بدل القفز — فالمشهد يحس
 * فيزيائياً، ولا شيء يومض فجأة.
 * ==========================================================================*/

export const CAGE_W = 1.7, CAGE_H = 1.15, CAGE_D = 1.5;
const BARS = 7;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type DropHint = "idle" | "candidate" | "hot" | "blocked";

export function CageUnit({ spec, position, dropHint, dragActive, ghost, arrivedRef, onHoverChange, onGrab }: {
  spec: CageSpec;
  position: [number, number, number];
  dropHint: DropHint;
  /** سحب جارٍ بأي مكان — يعطّل تفاعل بطاقات الراقدين حتى لا تحجب الالتقاط. */
  dragActive: boolean;
  /** الراقد بهذا القفص هو المسحوب حالياً — بطاقته تصير شبحاً بمكانها. */
  ghost: boolean;
  /** طوابع وصول حديثة (code → performance.now) — تعطي ومضة استقبال تتلاشى. */
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  onHoverChange: (code: string | null) => void;
  onGrab: (code: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const grp = useRef<Group>(null);
  const stripMat = useRef<MeshStandardMaterial>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);
  const tmp = useMemo(() => new Color(), []);

  const status = statusOfCage(spec);
  const occupied = !!spec.occupant;
  const baseColor = NEON[status];

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 7.5);
    const strip = stripMat.current, shell = shellMat.current, g = grp.current, l = glow.current;

    // لون الهدف حسب حالة الإفلات، ثم اللمعان فوقه
    const colorTarget = dropHint === "blocked" ? DANGER : dropHint === "hot" ? HOT : baseColor;
    let intensity =
      dropHint === "hot" ? 4.2 :
      dropHint === "blocked" ? 1.6 :
      dropHint === "candidate" ? 1.5 + Math.sin(state.clock.elapsedTime * 5) * 0.5 :
      hover ? 3.2 : occupied ? 1.9 : 0.7;
    // ومضة استقبال بعد إفلات ناجح — تتلاشى خلال ~نصف ثانية
    const arrived = arrivedRef.current.get(spec.code);
    if (arrived != null) {
      const age = (performance.now() - arrived) / 1000;
      if (age < 1.2) intensity += Math.exp(-age * 4) * 3; else arrivedRef.current.delete(spec.code);
    }

    if (strip) {
      strip.emissiveIntensity = lerp(strip.emissiveIntensity, intensity, k);
      strip.emissive.lerp(tmp.set(colorTarget), k);
      strip.color.lerp(tmp.set(colorTarget), k);
    }
    if (shell) {
      shell.emissiveIntensity = lerp(shell.emissiveIntensity, dropHint === "hot" ? 0.3 : hover ? 0.32 : occupied ? 0.11 : 0.07, k);
      shell.emissive.lerp(tmp.set(colorTarget), k);
    }
    if (l) {
      l.intensity = lerp(l.intensity, dropHint === "hot" ? 1.8 : hover ? 1.6 : occupied ? 1.0 : 0.25, k);
      l.color.lerp(tmp.set(colorTarget), k);
    }
    if (g) g.position.y = lerp(g.position.y, hover || dropHint === "hot" ? position[1] + 0.07 : position[1], k);
  });

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); onHoverChange(spec.code); if (!dragActive) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); onHoverChange(null); if (!dragActive) document.body.style.cursor = ""; }}>

      {/* القاعدة (بلينث) — ترفع القفص عن الأرض وتعطيه ثقل المعدّات الحقيقية */}
      <RoundedBox args={[CAGE_W + 0.14, 0.12, CAGE_D + 0.14]} radius={0.03} position={[0, -CAGE_H / 2 - 0.06, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#0b1322" metalness={0.6} roughness={0.4} />
      </RoundedBox>

      {/* الهيكل المعدني */}
      <RoundedBox args={[CAGE_W, CAGE_H, CAGE_D]} radius={0.06} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial ref={shellMat} color={NIGHT.shell} metalness={0.55} roughness={0.35}
          emissive={baseColor} emissiveIntensity={0.07} />
        <Edges scale={1.002} color={baseColor} />
      </RoundedBox>

      {/* جوف القفص — لوح غاطس خلف القضبان يعطي عمقاً حقيقياً للفتحة */}
      <mesh position={[0, -0.02, CAGE_D / 2 - 0.09]}>
        <planeGeometry args={[CAGE_W - 0.26, CAGE_H - 0.3]} />
        <meshStandardMaterial color={NIGHT.cavity} roughness={0.95} />
      </mesh>

      {/* سرير الراقد */}
      {occupied && !ghost && (
        <RoundedBox args={[CAGE_W - 0.55, 0.1, CAGE_D - 0.75]} radius={0.04} position={[0, -CAGE_H / 2 + 0.12, 0.12]}>
          <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={0.5} roughness={0.6} />
        </RoundedBox>
      )}

      {/* ضوء الحالة داخل القفص — قريب من الفتحة حتى تلتقط القضبان توهّجه */}
      <pointLight ref={glow} color={baseColor} intensity={occupied ? 1.0 : 0.25} distance={2.8} position={[0, 0.12, 0.55]} />

      {/* قضبان الستيل الأمامية */}
      {Array.from({ length: BARS }, (_, i) => (
        <mesh key={i} position={[-(CAGE_W - 0.34) / 2 + (i * (CAGE_W - 0.34)) / (BARS - 1), -0.02, CAGE_D / 2 - 0.02]} castShadow>
          <cylinderGeometry args={[0.026, 0.026, CAGE_H - 0.3, 10]} />
          <meshStandardMaterial color={NIGHT.bars} metalness={0.65} roughness={0.3} />
        </mesh>
      ))}

      {/* شريط النيون على العتبة العليا — مؤشر الحالة الأساسي */}
      <mesh position={[0, CAGE_H / 2 - 0.08, CAGE_D / 2 + 0.005]}>
        <boxGeometry args={[CAGE_W - 0.2, 0.045, 0.03]} />
        <meshStandardMaterial ref={stripMat} color={baseColor} emissive={baseColor} emissiveIntensity={occupied ? 1.9 : 0.7} toneMapped={false} />
      </mesh>

      {/* الرقم المجسّم */}
      <Text font={DIGIT_FONT} fontSize={0.3} position={[0, CAGE_H / 2 + 0.26, CAGE_D / 2 - 0.1]}
        color={NIGHT.ink} anchorX="center" anchorY="middle"
        outlineWidth={0.012} outlineBlur={0.06} outlineColor={baseColor}>
        {spec.code}
      </Text>

      {/* مرساة إحداثيات للاختبارات الآلية — بلا أي أثر بصري */}
      <Html center position={[0, 0, 0]} style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
        <span data-cage3d={spec.code} style={{ width: 1, height: 1, display: "block" }} />
      </Html>

      {/* بطاقة المريض — الالتقاط يبدأ منها؛ أثناء سحبه تبقى شبحاً بمكانها */}
      {spec.occupant && (
        <Html center position={[0, CAGE_H / 2 + 0.62, 0]} zIndexRange={[40, 0]}
          style={{ pointerEvents: dragActive || ghost ? "none" : "auto" }}>
          <div data-occ-of={spec.code}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onGrab(spec.code); }}
            style={{
              direction: "rtl", display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: 12, cursor: "grab", touchAction: "none",
              userSelect: "none", whiteSpace: "nowrap",
              background: "#0c1626f0", border: `1px solid ${baseColor}66`,
              boxShadow: `0 0 16px ${baseColor}40`,
              opacity: ghost ? 0.28 : 1, transition: "opacity .18s ease",
            }}>
            <span style={{ fontSize: 20, filter: `drop-shadow(0 0 6px ${baseColor})` }}>{spec.occupant.emoji}</span>
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
