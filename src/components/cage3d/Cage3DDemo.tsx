import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, Grid, ContactShadows, Html } from "@react-three/drei";
import { Plane, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { ChevronRight } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D, type DropHint } from "./CageUnit";
import { NEON, NIGHT, KIND_AR, SAMPLE_CAGES, type CageSpec, type Occupant } from "./neon";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * Cage3DDemo — المرحلتان ٢+٣: تفاعل الإضاءة + السحب والإفلات داخل المشهد.
 *
 * dnd-kit لا يرى داخل WebGL (ما في DOM هناك)، فالسحب هنا محرّك أصلي فوق
 * أدوات R3F نفسها:
 *   • الالتقاط من بطاقة المريض (pointerdown).
 *   • التتبّع بإسقاط شعاع المؤشر على مستوى الأرض رياضياً كل إطار — البطاقة
 *     الطائرة تلحق المؤشر بمطاردة أسّية (تسبقها قليلاً وتستقر بنعومة)،
 *     وحلقة ضوء بلون حالة المريض تنزلق على الأرضية تحتها.
 *   • الأقفاص تتكلم بالضوء: المتاح ينبض «تعال»، الهدف تحت المؤشر يتوهّج
 *     أبيض-سيان ويرتفع، والمشغول يحمرّ «ممنوع».
 *   • الإفلات على متاح يُسكِن المريض (ومضة استقبال + صوت نجاح)، وأي إفلات
 *     آخر يرجّع البطاقة لقفصها بحركة عودة مرنة — ولا حالة ضائعة أبداً.
 *
 * onMove(from, to) نقطة الربط الجاهزة للمرحلة ٤: نفس اللحظة التي سنستدعي
 * فيها opsStore.patch حتى يتحدّث الباكند ويتسجّل cage_changed.
 * ==========================================================================*/

const SPACING_X = CAGE_W + 0.75;
const SPACING_Z = CAGE_D + 1.05;
const PER_ROW = 3;
const FLY_Y = 1.5;          // ارتفاع البطاقة أثناء الطيران
const REST_Y = 1.2;         // ارتفاعها لحظة الالتقاط فوق القفص

interface DragState {
  from: string;
  occ: Occupant;
  fromPos: [number, number, number];
  phase: "drag" | "return";
}

const LEGEND: { label: string; c: string }[] = [
  { label: "فندقة", c: NEON.boarding },
  { label: "علاج", c: NEON.care },
  { label: "فندقة علاجية", c: NEON.careBoarding },
  { label: "متاح", c: NEON.free },
];

/* ── البطاقة الطائرة + حلقة الأرض — داخل الكانفس، تلحق المؤشر كل إطار ──── */
function DragAvatar({ drag, onReturned }: { drag: DragState; onReturned: () => void }) {
  const grp = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(...drag.fromPos).setY(FLY_Y), [drag.fromPos]);
  const color = NEON[drag.occ.status];

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    if (drag.phase === "drag") {
      // إسقاط شعاع المؤشر على مستوى الأرض — يشتغل مع الكاميرا الأورثوغرافية بلا أي مشهد إضافي
      state.raycaster.setFromCamera(state.pointer, state.camera);
      if (state.raycaster.ray.intersectPlane(floor, hit)) target.set(hit.x, FLY_Y, hit.z);
    } else {
      target.set(drag.fromPos[0], REST_Y, drag.fromPos[2]);
    }
    // مطاردة أسّية: سريعة بلا قفز، وتستقر بنعومة — إحساس «الورقة بالهواء»
    const k = Math.min(1, dt * (drag.phase === "drag" ? 14 : 10));
    g.position.lerp(target, k);
    if (drag.phase === "return" && g.position.distanceTo(target) < 0.06) onReturned();
    // حلقة الضوء تنزلق على الأرض تحت البطاقة، وتخفت كلما ارتفعت البطاقة
    const r = ring.current;
    if (r) {
      r.position.set(g.position.x, 0.02, g.position.z);
      (r.material as MeshBasicMaterial).opacity = 0.5 - (g.position.y - REST_Y) * 0.12;
    }
  });

  return (
    <>
      <group ref={grp} position={[drag.fromPos[0], REST_Y, drag.fromPos[2]]}>
        <Html center zIndexRange={[45, 0]} style={{ pointerEvents: "none" }}>
          <div style={{
            direction: "rtl", display: "flex", alignItems: "center", gap: 8,
            padding: "7px 12px", borderRadius: 13, whiteSpace: "nowrap",
            background: "#0c1626f7", border: `1px solid ${color}`,
            boxShadow: `0 0 26px ${color}88, 0 10px 24px #000a`,
            transform: "rotate(-3deg) scale(1.08)", cursor: "grabbing",
          }}>
            <span style={{ fontSize: 22, filter: `drop-shadow(0 0 8px ${color})` }}>{drag.occ.emoji}</span>
            <span style={{ display: "grid", lineHeight: 1.25 }}>
              <b style={{ color: NIGHT.ink, fontSize: 13, fontWeight: 800 }}>{drag.occ.name}</b>
              <i style={{ color, fontSize: 10, fontStyle: "normal", fontWeight: 700 }}>{KIND_AR[drag.occ.status]}</i>
            </span>
          </div>
        </Html>
        <pointLight color={color} intensity={1.2} distance={3.5} />
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[drag.fromPos[0], 0.02, drag.fromPos[2]]}>
        <ringGeometry args={[0.34, 0.46, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </>
  );
}

function Scene({ cages, positions, drag, hoverCage, arrivedRef, setHoverCage, onGrab, onReturned }: {
  cages: CageSpec[];
  positions: Map<string, [number, number, number]>;
  drag: DragState | null;
  hoverCage: string | null;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  setHoverCage: (c: string | null) => void;
  onGrab: (code: string) => void;
  onReturned: () => void;
}) {
  const hintFor = (c: CageSpec): DropHint => {
    if (!drag || drag.phase !== "drag") return "idle";
    if (c.code === drag.from) return "candidate";                       // قفصه — الرجوع دائماً مرحّب
    if (c.code === hoverCage) return c.occupant ? "blocked" : "hot";
    return c.occupant ? "idle" : "candidate";
  };

  return (
    <>
      <color attach="background" args={[NIGHT.bg]} />
      <fog attach="fog" args={[NIGHT.bg, 24, 44]} />
      <OrthographicCamera makeDefault position={[12, 12, 12]} zoom={96} near={0.1} far={80}
        onUpdate={(c) => c.lookAt(0, 0.15, 0)} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 11, 4]} intensity={0.95} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight color="#22d3ee" position={[-8, 4.5, -5]} intensity={0.7} distance={30} />
      <pointLight color="#f43f5e" position={[9, 4, 7]} intensity={0.55} distance={30} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={NIGHT.floor} roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid position={[0, -0.085, 0]} args={[60, 60]}
        cellSize={0.55} cellThickness={0.6} cellColor={NIGHT.gridCell}
        sectionSize={2.75} sectionThickness={1.1} sectionColor={NIGHT.gridSection}
        fadeDistance={34} fadeStrength={1.6} followCamera={false} />

      {cages.map((c) => (
        <CageUnit key={c.code} spec={c} position={positions.get(c.code)!}
          dropHint={hintFor(c)} dragActive={!!drag} ghost={drag?.from === c.code}
          arrivedRef={arrivedRef} onHoverChange={setHoverCage} onGrab={onGrab} />
      ))}

      {drag && <DragAvatar drag={drag} onReturned={onReturned} />}

      <ContactShadows position={[0, -0.08, 0]} opacity={0.55} scale={26} blur={2.4} far={3.5} color="#000000" />
    </>
  );
}

export default function Cage3DDemo({ initialCages = SAMPLE_CAGES, onMove }: {
  initialCages?: CageSpec[];
  /** نقطة ربط المرحلة ٤ — تُستدعى بعد كل نقلة ناجحة (from → to). */
  onMove?: (from: string, to: string, occ: Occupant) => void;
}) {
  const navigate = useNavigate();
  const [cages, setCages] = useState<CageSpec[]>(initialCages);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverCage, setHoverCage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const arrivedRef = useRef(new Map<string, number>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positions = useMemo(() => {
    const rows = Math.ceil(cages.length / PER_ROW);
    const m = new Map<string, [number, number, number]>();
    cages.forEach((c, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      m.set(c.code, [
        (col - (Math.min(PER_ROW, cages.length) - 1) / 2) * SPACING_X,
        0.575,
        (row - (rows - 1) / 2) * SPACING_Z,
      ]);
    });
    return m;
  }, [cages]);

  const say = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  const onGrab = (code: string) => {
    const c = cages.find((x) => x.code === code);
    if (!c?.occupant || drag) return;
    playTap();
    document.body.style.cursor = "grabbing";
    setDrag({ from: code, occ: c.occupant, fromPos: positions.get(code)!, phase: "drag" });
  };

  // الإفلات: قرار واحد عند pointerup أينما وقع — على قفص، على الأرض، أو خارج الكانفس
  useEffect(() => {
    if (!drag || drag.phase !== "drag") return;
    const up = () => {
      document.body.style.cursor = "";
      const target = hoverCage ? cages.find((c) => c.code === hoverCage) : null;
      if (target && !target.occupant && target.code !== drag.from) {
        playSuccess();
        arrivedRef.current.set(target.code, performance.now());
        setCages((cs) => cs.map((c) =>
          c.code === drag.from ? { ...c, occupant: null } :
          c.code === target.code ? { ...c, occupant: drag.occ } : c));
        say(`انتقل ${drag.occ.name} إلى القفص ${target.code}`);
        onMove?.(drag.from, target.code, drag.occ);
        setDrag(null);
      } else {
        if (target?.occupant && target.code !== drag.from) {
          playWarning();
          say(`القفص ${target.code} مشغول — رجّعنا ${drag.occ.name} لمكانه`);
        }
        setDrag((d) => (d ? { ...d, phase: "return" } : null)); // حركة العودة ثم التلاشي
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, hoverCage, cages, onMove]);

  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas shadows dpr={[1, 2]}>
        <Scene cages={cages} positions={positions} drag={drag} hoverCage={hoverCage}
          arrivedRef={arrivedRef} setHoverCage={setHoverCage} onGrab={onGrab}
          onReturned={() => setDrag(null)} />
      </Canvas>

      {/* طبقة الواجهة فوق المشهد: عنوان + مفاتيح الألوان + رجوع — DOM عادي RTL */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>خريطة الأقفاص المجسّمة</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#64809c" }}>
            اسحب بطاقة مريض وأفلتها على قفص متاح — المشغول يحمرّ والمتاح ينبض
          </p>
        </div>
        <button type="button" onClick={() => navigate("/charts")}
          className="pointer-events-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-extrabold transition"
          style={{ background: "#0e1a2e", color: "#9fdcef", border: "1px solid #164e63" }}>
          <ChevronRight size={14} /> رجوع للطبلات
        </button>
      </div>

      {/* إشعار النقلة — نفس دور توست السستم لكن داخل صفحة المشهد المستقلة */}
      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4"
        style={{ opacity: note ? 1 : 0, transform: `translateY(${note ? 0 : 8}px)`, transition: "all .25s ease" }}>
        {note && (
          <span data-note3d className="rounded-full px-4 py-2 text-xs font-extrabold"
            style={{ background: "#0e1a2ef2", color: "#c8f4e4", border: "1px solid #14532d" }}>
            {note}
          </span>
        )}
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
