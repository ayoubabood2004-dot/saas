import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { OrthographicCamera, Grid, ContactShadows } from "@react-three/drei";
import { ChevronRight } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D } from "./CageUnit";
import { NEON, NIGHT, SAMPLE_CAGES, type CageSpec } from "./neon";

/* ============================================================================
 * Cage3DDemo — المرحلة ١ من العرض المجسّم: بيئة الغرفة الإيزومترية.
 *
 * كاميرا أورثوغرافية من [1,1,1] (إيزومتري هندسي حقيقي: سمت ٤٥° وارتفاع
 * ~٣٥.٣°)، أرضية شبكة نيون تعطي إحساس «غرفة التحكم»، وإضاءة ثلاثية: مفتاح
 * أبيض خافت من الأعلى + حافة سيان من اليسار + حافة ماجنتا من اليمين، ثم كل
 * قفص مشغول يضيف توهّجه المحلي بنفسه (CageUnit).
 *
 * عيّنة ثابتة (٦ أقفاص بصفّين) عمداً — هذه مرحلة إتقان البصريات فقط؛ الربط
 * بالرقود الحقيقية والسحب يجيان بالمراحل الجاية فوق نفس المكوّنات.
 * ==========================================================================*/

const SPACING_X = CAGE_W + 0.75;
const SPACING_Z = CAGE_D + 1.05;
const PER_ROW = 3;

const LEGEND: { label: string; c: string }[] = [
  { label: "فندقة", c: NEON.boarding },
  { label: "علاج", c: NEON.care },
  { label: "فندقة علاجية", c: NEON.careBoarding },
  { label: "متاح", c: NEON.free },
];

function Scene({ cages }: { cages: CageSpec[] }) {
  // مواقع الشبكة متمركزة حول الأصل حتى تبقى الكاميرا ثابتة مهما تغيّر العدد.
  const placed = useMemo(() => {
    const rows = Math.ceil(cages.length / PER_ROW);
    return cages.map((spec, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      return {
        spec,
        pos: [
          (col - (Math.min(PER_ROW, cages.length) - 1) / 2) * SPACING_X,
          0.575,
          (row - (rows - 1) / 2) * SPACING_Z,
        ] as [number, number, number],
      };
    });
  }, [cages]);

  return (
    <>
      <color attach="background" args={[NIGHT.bg]} />
      <fog attach="fog" args={[NIGHT.bg, 24, 44]} />
      <OrthographicCamera makeDefault position={[12, 12, 12]} zoom={96} near={0.1} far={80}
        onUpdate={(c) => c.lookAt(0, 0.15, 0)} />

      {/* الإضاءة الثلاثية: مفتاح أبيض + حافتا نيون متقابلتان */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 11, 4]} intensity={0.95} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight color="#22d3ee" position={[-8, 4.5, -5]} intensity={0.7} distance={30} />
      <pointLight color="#f43f5e" position={[9, 4, 7]} intensity={0.55} distance={30} />

      {/* الأرضية: بلاطة داكنة + شبكة نيون تتلاشى بالأفق */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={NIGHT.floor} roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid position={[0, -0.085, 0]} args={[60, 60]}
        cellSize={0.55} cellThickness={0.6} cellColor={NIGHT.gridCell}
        sectionSize={2.75} sectionThickness={1.1} sectionColor={NIGHT.gridSection}
        fadeDistance={34} fadeStrength={1.6} followCamera={false} />

      {placed.map(({ spec, pos }) => <CageUnit key={spec.code} spec={spec} position={pos} />)}

      <ContactShadows position={[0, -0.08, 0]} opacity={0.55} scale={26} blur={2.4} far={3.5} color="#000000" />
    </>
  );
}

export default function Cage3DDemo({ cages = SAMPLE_CAGES }: { cages?: CageSpec[] }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas shadows dpr={[1, 2]}>
        <Scene cages={cages} />
      </Canvas>

      {/* طبقة الواجهة فوق المشهد: عنوان + مفاتيح الألوان + رجوع — DOM عادي RTL */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>خريطة الأقفاص المجسّمة</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#64809c" }}>
            معاينة المرحلة ١ — البيئة والإضاءة · مرّر فوق أي قفص
          </p>
        </div>
        <button type="button" onClick={() => navigate("/charts")}
          className="pointer-events-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-extrabold transition"
          style={{ background: "#0e1a2e", color: "#9fdcef", border: "1px solid #164e63" }}>
          <ChevronRight size={14} /> رجوع للطبلات
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-4 sm:p-6">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ background: "#0e1a2eeb", color: "#c8dbea", border: "1px solid #16324a" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: l.c, boxShadow: `0 0 8px ${l.c}` }} /> {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
