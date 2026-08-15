import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, ContactShadows, Html } from "@react-three/drei";
import { CanvasTexture, Plane, RepeatWrapping, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { ChevronRight, X } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D, type DropHint } from "./CageUnit";
import { NEON, NIGHT, KIND_AR, SPECIES_AR, SAMPLE_CAGES, type CageSpec, type Occupant } from "./neon";
import { speciesPhoto } from "@/lib/petPhotos";
import { formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * Cage3DDemo — لوحة تحكم الأقفاص المتقدمة: غرفة دافئة بأرضية خشب وجدران
 * بلمسات نيون، حظائر معدن وزجاج واقعية، مرضى بصورهم، لوحة منامات زجاجية
 * متزامنة مع المشهد، وتفاصيل مريض بضغطة.
 *
 * الإيماءة الواحدة تُفكَّك بعتبة حركة (٨ بكسل — نفس فلسفة MouseSensor
 * بالخريطة المسطّحة): ضغطة قصيرة على البطاقة = تفاصيل المريض، وحركة أطول
 * = سحب حقيقي داخل المشهد (إسقاط شعاع المؤشر على مستوى الأرض كل إطار،
 * بطاقة طائرة تلحق بمطاردة أسّية، والحظائر تتكلم بالضوء: المتاح ينبض،
 * الهدف يتوهّج أبيض، والمشغول يحمرّ). لوحة المنامات تُشتق من نفس حالة
 * الأقفاص فتتزامن مع كل نقلة لحظياً — onMove(from, to) جاهزة للمرحلة ٤.
 * ==========================================================================*/

const SPACING_X = CAGE_W + 0.75;
const SPACING_Z = CAGE_D + 1.05;
const PER_ROW = 3;
const FLY_Y = 1.5;
const REST_Y = 1.2;

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

/** أرضية خشب مولّدة برمجياً — ألواح بعروق، صفر أصول خارجية. */
function makeWoodTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    g.fillStyle = `hsl(${22 + Math.random() * 6}, ${40 + Math.random() * 8}%, ${25 + Math.random() * 7}%)`;
    g.fillRect(0, y, 512, plankH);
    for (let i = 0; i < 34; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
      g.beginPath();
      const yy = y + Math.random() * plankH;
      g.moveTo(0, yy);
      g.bezierCurveTo(170, yy + Math.random() * 6 - 3, 340, yy + Math.random() * 6 - 3, 512, yy);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillRect(0, y, 512, 2);
    g.fillRect(Math.floor(Math.random() * 480), y, 2, plankH);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

/** عنقود سداسيات نيون على الجدار — لمسة «المنشأة التقنية» من المرجع. */
function HexCluster({ position, rotation, color }: {
  position: [number, number, number]; rotation: [number, number, number]; color: string;
}) {
  const cells: [number, number][] = [[0, 0], [1.06, 0], [0.53, 0.92], [-0.53, 0.92], [1.59, 0.92], [0.53, -0.92], [-1.06, 0]];
  return (
    <group position={position} rotation={rotation}>
      {cells.map(([x, y], i) => (
        <mesh key={i} position={[x * 0.44, y * 0.44, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={i % 2 ? 1.1 : 1.7} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ── البطاقة الطائرة + حلقة الأرض — داخل الكانفس، تلحق المؤشر كل إطار ──── */
function DragAvatar({ drag, onReturned }: { drag: DragState; onReturned: () => void }) {
  const grp = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(...drag.fromPos).setY(FLY_Y), [drag.fromPos]);
  const color = NEON[drag.occ.status];
  const [imgFail, setImgFail] = useState(false);

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    if (drag.phase === "drag") {
      state.raycaster.setFromCamera(state.pointer, state.camera);
      if (state.raycaster.ray.intersectPlane(floor, hit)) target.set(hit.x, FLY_Y, hit.z);
    } else {
      target.set(drag.fromPos[0], REST_Y, drag.fromPos[2]);
    }
    const k = Math.min(1, dt * (drag.phase === "drag" ? 14 : 10));
    g.position.lerp(target, k);
    if (drag.phase === "return" && g.position.distanceTo(target) < 0.06) onReturned();
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
            {imgFail ? (
              <span style={{ fontSize: 22, filter: `drop-shadow(0 0 8px ${color})` }}>{drag.occ.emoji}</span>
            ) : (
              <img src={speciesPhoto(drag.occ.species, 64)} alt="" onError={() => setImgFail(true)}
                style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 9, border: `1px solid ${color}` }} />
            )}
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

function Scene({ cages, positions, drag, hoverCage, arrivedRef, setHoverCage, onCardDown, onReturned }: {
  cages: CageSpec[];
  positions: Map<string, [number, number, number]>;
  drag: DragState | null;
  hoverCage: string | null;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  setHoverCage: (c: string | null) => void;
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  onReturned: () => void;
}) {
  const wood = useMemo(makeWoodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);

  const hintFor = (c: CageSpec): DropHint => {
    if (!drag || drag.phase !== "drag") return "idle";
    if (c.code === drag.from) return "candidate";
    if (c.code === hoverCage) return c.occupant ? "blocked" : "hot";
    return c.occupant ? "idle" : "candidate";
  };

  return (
    <>
      <color attach="background" args={[NIGHT.bg]} />
      <fog attach="fog" args={[NIGHT.bg, 28, 52]} />
      <OrthographicCamera makeDefault position={[12, 12, 12]} zoom={92} near={0.1} far={80}
        onUpdate={(c) => c.lookAt(0, 0.35, 0)} />

      {/* إضاءة دافئة: مفتاح كهرماني خفيف + حافتا نيون + دفء زاوية الجدارين */}
      <ambientLight intensity={0.55} />
      <directionalLight color="#ffe9d2" position={[6, 11, 4]} intensity={1.1} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight color="#22d3ee" position={[-8, 4.5, -5]} intensity={0.6} distance={30} />
      <pointLight color="#f43f5e" position={[9, 4, 7]} intensity={0.4} distance={30} />
      <pointLight color="#ffb066" position={[-4.5, 3, -4.5]} intensity={0.55} distance={16} />

      {/* أرضية الخشب */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial map={wood} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* الجداران الخلفيان بزاوية الغرفة + شريط نيون على حافتيهما العلويتين */}
      <mesh position={[0, 1.9, -5.1]}>
        <planeGeometry args={[40, 4]} />
        <meshStandardMaterial color={NIGHT.wall} roughness={0.9} />
      </mesh>
      <mesh position={[-6.3, 1.9, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[40, 4]} />
        <meshStandardMaterial color={NIGHT.wall} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.88, -5.08]}>
        <boxGeometry args={[40, 0.05, 0.05]} />
        <meshStandardMaterial color={NIGHT.wallEdge} emissive={NIGHT.wallEdge} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <mesh position={[-6.28, 3.88, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[40, 0.05, 0.05]} />
        <meshStandardMaterial color={NIGHT.wallEdge} emissive={NIGHT.wallEdge} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <HexCluster position={[-6.25, 2.35, -0.6]} rotation={[0, Math.PI / 2, 0]} color="#ff9e4d" />
      <HexCluster position={[1.6, 2.3, -5.05]} rotation={[0, 0, 0]} color="#22d3ee" />

      {cages.map((c) => (
        <CageUnit key={c.code} spec={c} position={positions.get(c.code)!}
          dropHint={hintFor(c)} dragActive={!!drag} ghost={drag?.from === c.code}
          arrivedRef={arrivedRef} onHoverChange={setHoverCage} onCardDown={onCardDown} />
      ))}

      {drag && <DragAvatar drag={drag} onReturned={onReturned} />}

      <ContactShadows position={[0, -0.08, 0]} opacity={0.5} scale={26} blur={2.4} far={3.5} color="#241505" />
    </>
  );
}

/* ── أحرف الأسبوع (يبدأ سبتاً كبقية السستم) مع تمييز اليوم ─────────────── */
const WEEK_LETTERS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const todayIdx = () => (new Date().getDay() + 1) % 7;

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
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const arrivedRef = useRef(new Map<string, number>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cagesRef = useRef(cages);
  cagesRef.current = cages;
  const pending = useRef<{ code: string; x: number; y: number } | null>(null);

  const positions = useMemo(() => {
    const rows = Math.ceil(cages.length / PER_ROW);
    const m = new Map<string, [number, number, number]>();
    cages.forEach((c, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      m.set(c.code, [
        (col - (Math.min(PER_ROW, cages.length) - 1) / 2) * SPACING_X,
        0.525,
        (row - (rows - 1) / 2) * SPACING_Z,
      ]);
    });
    return m;
  }, [cages]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const say = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  /* ضغطة أم سحبة؟ عتبة ٨ بكسل تفصل بينهما — نفس فلسفة الخريطة المسطّحة */
  const onCardDown = (code: string, e: { clientX: number; clientY: number }) => {
    if (drag) return;
    pending.current = { code, x: e.clientX, y: e.clientY };
  };
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 8) return;
      pending.current = null;
      const c = cagesRef.current.find((x) => x.code === p.code);
      if (!c?.occupant) return;
      playTap();
      setDetailFor(null);
      document.body.style.cursor = "grabbing";
      setDrag({ from: p.code, occ: c.occupant, fromPos: positionsRef.current.get(p.code)!, phase: "drag" });
    };
    const up = () => {
      const p = pending.current;
      pending.current = null;
      if (p) { playTap(); setDetailFor((d) => (d === p.code ? null : p.code)); }
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
  }, []);

  /* الإفلات: قرار واحد عند pointerup أينما وقع */
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
        setDrag((d) => (d ? { ...d, phase: "return" } : null));
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, hoverCage, cages, onMove]);

  const stays = cages.filter((c) => c.occupant);
  const detail = detailFor ? cages.find((c) => c.code === detailFor) : null;

  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas shadows dpr={[1, 2]}>
        <Scene cages={cages} positions={positions} drag={drag} hoverCage={hoverCage}
          arrivedRef={arrivedRef} setHoverCage={setHoverCage} onCardDown={onCardDown}
          onReturned={() => setDrag(null)} />
      </Canvas>

      {/* العنوان + الإرشادات + رجوع */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>لوحة تحكم الأقفاص المتقدمة — عيادة doctorVet</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#8fa8bd" }}>
            خريطة الأقفاص والمنامات · اضغط بطاقة المريض لتفاصيله · اسحبها وأفلتها في قفص متاح — المشغول يحمرّ والمتاح ينبض
          </p>
        </div>
        <button type="button" onClick={() => navigate("/charts")}
          className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-extrabold transition"
          style={{ background: "#0e1a2e", color: "#9fdcef", border: "1px solid #164e63" }}>
          <ChevronRight size={14} /> رجوع للطبلات
        </button>
      </div>

      {/* لوحة المنامات الزجاجية — تُشتق من نفس حالة الأقفاص فتتزامن مع كل سحبة */}
      <div data-panel3d className="pointer-events-none absolute top-20 start-4 w-56 rounded-2xl p-3 sm:start-6"
        style={{ background: NIGHT.glassPanel, border: "1px solid #16324a", backdropFilter: "blur(10px)" }}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black" style={{ color: NIGHT.ink }}>المنامات الحالية</h2>
          <span className="rounded-full px-1.5 text-[10px] font-black tabular-nums" style={{ background: "#12253a", color: "#7dd3fc" }}>
            {formatNum(stays.length)}
          </span>
        </div>
        <div className="mb-2 flex justify-between px-0.5">
          {WEEK_LETTERS.map((l, i) => (
            <span key={l} className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-black"
              style={i === todayIdx() ? { background: "#22d3ee", color: "#04222b" } : { color: "#64809c" }}>
              {l}
            </span>
          ))}
        </div>
        <div className="space-y-1.5">
          {stays.map((c) => (
            <div key={c.code} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#0c192bcc" }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEON[c.occupant!.status], boxShadow: `0 0 7px ${NEON[c.occupant!.status]}` }} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold" style={{ color: NIGHT.ink }}>{c.occupant!.name}</span>
              <span className="shrink-0 text-[10px] font-bold" style={{ color: "#64809c" }}>
                {KIND_AR[c.occupant!.status]} · قفص {c.code}
              </span>
            </div>
          ))}
          {stays.length === 0 && <p className="text-[10px] font-bold" style={{ color: "#64809c" }}>ما في منامات حالياً.</p>}
        </div>
      </div>

      {/* تفاصيل المريض — ضغطة قصيرة على بطاقته */}
      {detail?.occupant && (
        <div data-detail3d className="absolute bottom-24 start-4 w-60 rounded-2xl p-3 sm:start-6"
          style={{ background: NIGHT.glassPanel, border: `1px solid ${NEON[detail.occupant.status]}55`, backdropFilter: "blur(10px)" }}>
          <button type="button" onClick={() => setDetailFor(null)} className="absolute end-2 top-2" style={{ color: "#64809c" }}>
            <X size={14} />
          </button>
          <div className="flex items-center gap-3">
            <img src={speciesPhoto(detail.occupant.species, 96)} alt={detail.occupant.name}
              className="h-14 w-14 rounded-xl object-cover"
              style={{ border: `2px solid ${NEON[detail.occupant.status]}aa` }} />
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: NIGHT.ink }}>
                {detail.occupant.name} <span className="text-[10px] font-bold" style={{ color: "#64809c" }}>· {SPECIES_AR[detail.occupant.species] ?? ""}</span>
              </p>
              <p className="mt-0.5 text-[11px] font-extrabold" style={{ color: NEON[detail.occupant.status] }}>
                {KIND_AR[detail.occupant.status]} — اليوم {formatNum(detail.occupant.days)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold" style={{ color: "#64809c" }}>القفص {detail.code} · اسحب بطاقته لنقله</p>
            </div>
          </div>
        </div>
      )}

      {/* إشعار النقلة */}
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
