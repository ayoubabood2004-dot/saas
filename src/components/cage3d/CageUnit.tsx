import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Edges, Text } from "@react-three/drei";
import type { Group, MeshStandardMaterial, PointLight } from "three";
import { NEON, NIGHT, DIGIT_FONT, type CageSpec } from "./neon";

/* ============================================================================
 * CageUnit — قفص واحد مجسّم: قاعدة، هيكل معدني، جوف غامق، قضبان ستيل أمامية،
 * شريط نيون للحالة على العتبة، ورقم مضيء فوق الباب.
 *
 * الإحساس «الفيزيائي» يجي من ثلاث لمسات: توهّج الـemissive يتنفّس نعومة نحو
 * قيمته الهدف بكل إطار (بدل قفزة on/off عند المرور)، ضوء نقطي ملوّن داخل
 * القفص المشغول يلطّخ القضبان والأرضية بلون حالته، والمرور يرفع القفص ملمترات
 * ويشدّ توهّجه — نفس لغة hover بالبطاقات المسطّحة لكن بالمكان.
 * ==========================================================================*/

export const CAGE_W = 1.7, CAGE_H = 1.15, CAGE_D = 1.5;
const BARS = 7;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function CageUnit({ spec, position }: { spec: CageSpec; position: [number, number, number] }) {
  const [hover, setHover] = useState(false);
  const grp = useRef<Group>(null);
  const stripMat = useRef<MeshStandardMaterial>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);

  const occupied = spec.status !== "free";
  const color = NEON[spec.status];

  useFrame((_, dt) => {
    // تنفّس التوهّج: 12% من المسافة نحو الهدف بكل ~إطار — انتقال حريري بلا مكتبة سبرنغ.
    const k = Math.min(1, dt * 7.5);
    const strip = stripMat.current, shell = shellMat.current, g = grp.current, l = glow.current;
    if (strip) strip.emissiveIntensity = lerp(strip.emissiveIntensity, hover ? 3.2 : occupied ? 1.9 : 0.7, k);
    if (shell) shell.emissiveIntensity = lerp(shell.emissiveIntensity, hover ? 0.32 : occupied ? 0.11 : 0.07, k);
    if (l) l.intensity = lerp(l.intensity, hover ? 1.6 : occupied ? 1.0 : 0.25, k);
    if (g) g.position.y = lerp(g.position.y, hover ? position[1] + 0.06 : position[1], k);
  });

  return (
    <group ref={grp} position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}>

      {/* القاعدة (بلينث) — ترفع القفص عن الأرض وتعطيه ثقل المعدّات الحقيقية */}
      <RoundedBox args={[CAGE_W + 0.14, 0.12, CAGE_D + 0.14]} radius={0.03} position={[0, -CAGE_H / 2 - 0.06, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#0b1322" metalness={0.6} roughness={0.4} />
      </RoundedBox>

      {/* الهيكل المعدني */}
      <RoundedBox args={[CAGE_W, CAGE_H, CAGE_D]} radius={0.06} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial ref={shellMat} color={NIGHT.shell} metalness={0.55} roughness={0.35}
          emissive={color} emissiveIntensity={0.05} />
        <Edges scale={1.002} color={color} />
      </RoundedBox>

      {/* جوف القفص — لوح غاطس خلف القضبان يعطي عمقاً حقيقياً للفتحة */}
      <mesh position={[0, -0.02, CAGE_D / 2 - 0.09]}>
        <planeGeometry args={[CAGE_W - 0.26, CAGE_H - 0.3]} />
        <meshStandardMaterial color={NIGHT.cavity} roughness={0.95} />
      </mesh>

      {/* سرير الراقد — يوحي بالإشغال قبل ما ننقل شرائح الحيوانات بالمرحلة الجاية */}
      {occupied && (
        <RoundedBox args={[CAGE_W - 0.55, 0.1, CAGE_D - 0.75]} radius={0.04} position={[0, -CAGE_H / 2 + 0.12, 0.12]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.6} />
        </RoundedBox>
      )}

      {/* ضوء الحالة داخل القفص — قريب من الفتحة حتى تلتقط القضبان توهّجه */}
      <pointLight ref={glow} color={color} intensity={occupied ? 1.0 : 0.25} distance={2.8} position={[0, 0.12, 0.55]} />

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
        <meshStandardMaterial ref={stripMat} color={color} emissive={color} emissiveIntensity={occupied ? 1.9 : 0.55} toneMapped={false} />
      </mesh>

      {/* الرقم المجسّم — خط محلي، مع هالة بلون الحالة حتى يقرأ من بعيد */}
      <Text font={DIGIT_FONT} fontSize={0.3} position={[0, CAGE_H / 2 + 0.26, CAGE_D / 2 - 0.1]}
        color={NIGHT.ink} anchorX="center" anchorY="middle"
        outlineWidth={0.012} outlineBlur={0.06} outlineColor={color}>
        {spec.code}
      </Text>
    </group>
  );
}
