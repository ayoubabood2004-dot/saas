import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, ContactShadows, Html, Grid as DreiGrid } from "@react-three/drei";
import { CanvasTexture, Plane, RepeatWrapping, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ChevronRight, Hammer, ClipboardList, Plus, Trash2, X, FileText } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D, type DropHint } from "./CageUnit";
import { NEON, NIGHT, KIND_AR, SPECIES_AR, type Occupant } from "./neon";
import {
  CELL, LED_CHOICES, cageStudio, useCageStudio, cellFree, bounds,
  cellWorld, cornerWorld, buildPartitions, type Room3D,
} from "./store";
import { speciesPhoto } from "@/lib/petPhotos";
import { formatNum } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * استوديو الأقفاص — وضعان فوق حالة واحدة (cage3dStore):
 *
 *   الإدارة اليومية — المخطط مقفول: سحب المرضى بين الأقفاص (نفس المحرّك)،
 *   لوحة المنامات، وتفاصيل المريض بضغطة مع «فتح الملف الطبي»
 *   (openMedicalRecord — يرتبط بسجل الحيوان الحقيقي عند ربط المرحلة ٤).
 *
 *   وضع البناء — الطبيب يرسم منشأته: غرف جديدة بالاسم والأبعاد تُصفّ
 *   تلقائياً، قفص جديد يُسحب من اللوح ويلتقط لخلية الشبكة (شبح أخضر/أحمر
 *   حسب الصلاحية)، القواطع الزجاجية تتولّد وحدها من حدود الغرف (الضلع
 *   المشترك قاطع واحد، ولكل غرفة باب)، والنقر على قفص يفتح لوح خصائصه:
 *   رقمه ولون ليده.
 * ==========================================================================*/

const FLY_Y = 1.5;
const REST_Y = 1.2;
const WALL_H = 1.65;

interface DragState {
  from: string;
  occ: Occupant;
  fromPos: [number, number, number];
  phase: "drag" | "return";
}

/* إشارات سحب «قفص جديد» من اللوح — refs عابرة للحدود DOM ⇄ Canvas بلا رندر. */
const placing = { current: false };
const ghostCell = { current: null as null | { x: number; z: number; valid: boolean } };

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

/* ── القواطع الزجاجية المتولّدة تلقائياً من حدود الغرف ─────────────────── */
function Partitions({ rooms, s }: { rooms: Room3D[]; s: ReturnType<typeof cageStudio.get> }) {
  const segs = useMemo(() => buildPartitions(rooms), [rooms]);
  return (
    <>
      {segs.map((g) => {
        const [ax, az] = cornerWorld(s, g.x1, g.z1);
        const [bx, bz] = cornerWorld(s, g.x2, g.z2);
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const len = Math.hypot(bx - ax, bz - az);
        const horizontal = g.z1 === g.z2;
        return (
          <group key={`${g.x1},${g.z1}-${g.x2},${g.z2}`} position={[cx, 0, cz]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
            {/* لوح الزجاج */}
            <mesh position={[0, WALL_H / 2 - 0.09, 0]}>
              <boxGeometry args={[len, WALL_H, 0.045]} />
              <meshStandardMaterial color="#bfe9f5" transparent opacity={0.13} roughness={0.08} metalness={0.1} depthWrite={false} />
            </mesh>
            {/* السكة العلوية المعدنية */}
            <mesh position={[0, WALL_H - 0.09, 0]}>
              <boxGeometry args={[len + 0.06, 0.06, 0.08]} />
              <meshStandardMaterial color={NIGHT.shell} metalness={0.8} roughness={0.3} />
            </mesh>
            {/* قائمان عند الطرفين */}
            {[-len / 2, len / 2].map((o, i) => (
              <mesh key={i} position={[o, WALL_H / 2 - 0.09, 0]}>
                <boxGeometry args={[0.09, WALL_H, 0.09]} />
                <meshStandardMaterial color={NIGHT.shell} metalness={0.75} roughness={0.35} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

/* ── أرضيات الغرف وأسماؤها (وحذفها بوضع البناء) ────────────────────────── */
function RoomFloors({ s, build }: { s: ReturnType<typeof cageStudio.get>; build: boolean }) {
  return (
    <>
      {s.rooms.map((r) => {
        const [wx, wz] = cornerWorld(s, r.x, r.z);
        const w = r.w * CELL, d = r.d * CELL;
        return (
          <group key={r.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx + w / 2, -0.07, wz + d / 2]} receiveShadow>
              <planeGeometry args={[w - 0.12, d - 0.12]} />
              <meshStandardMaterial color="#10192b" transparent opacity={0.5} roughness={0.9} />
            </mesh>
            <Html center position={[wx + w / 2, 0.12, wz + 0.18]} zIndexRange={[32, 0]}
              style={{ pointerEvents: build ? "auto" : "none" }}>
              <div data-room3d={r.name} style={{
                direction: "rtl", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                background: "#0c1626d9", border: "1px solid #16324a", borderRadius: 9, padding: "3px 8px",
              }}>
                <b style={{ color: "#9fdcef", fontSize: 11, fontWeight: 800 }}>{r.name}</b>
                <i style={{ color: "#64809c", fontSize: 9, fontStyle: "normal" }}>{formatNum(r.w)}×{formatNum(r.d)}</i>
                {build && (
                  <button type="button" title="حذف الغرفة"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); playTap(); cageStudio.removeRoom(r.id); }}
                    style={{ color: "#f87171", display: "grid" }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

/* ── شبح القفص الجديد — يلتقط لخلية الشبكة ويتلوّن حسب الصلاحية ────────── */
function GhostCage({ s }: { s: ReturnType<typeof cageStudio.get> }) {
  const grp = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);

  useFrame((st) => {
    const g = grp.current;
    if (!g) return;
    if (!placing.current) { g.visible = false; ghostCell.current = null; return; }
    st.raycaster.setFromCamera(st.pointer, st.camera);
    if (!st.raycaster.ray.intersectPlane(floor, hit)) return;
    const b = bounds(s);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const x = Math.floor(hit.x / CELL + cx), z = Math.floor(hit.z / CELL + cz);
    const valid = cellFree(s, x, z);
    ghostCell.current = { x, z, valid };
    const [wx, wz] = cellWorld(s, x, z);
    g.visible = true;
    g.position.set(wx, 0.42, wz);
    const c = valid ? "#4ade80" : "#ef4444";
    mat.current?.color.set(c);
    mat.current?.emissive.set(c);
  });

  return (
    <group ref={grp} visible={false}>
      <mesh>
        <boxGeometry args={[CAGE_W, 0.9, CAGE_D]} />
        <meshStandardMaterial ref={mat} color="#4ade80" emissive="#4ade80" emissiveIntensity={0.7} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/* ── البطاقة الطائرة (سحب المرضى بوضع الإدارة) ─────────────────────────── */
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

function Scene({ s, drag, hoverCage, arrivedRef, setHoverCage, onCardDown, onReturned, onTapCage }: {
  s: ReturnType<typeof cageStudio.get>;
  drag: DragState | null;
  hoverCage: string | null;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  setHoverCage: (c: string | null) => void;
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  onReturned: () => void;
  onTapCage: (code: string) => void;
}) {
  const wood = useMemo(makeWoodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const build = s.mode === "build";

  // زووم يتكيف مع اتساع المخطط: منشأة أكبر → كاميرا أبعد — والجدران تنسحب معها
  const b = bounds(s);
  const span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * 1.4) * CELL;
  const zoom = Math.max(44, Math.min(92, 660 / Math.max(span, 7)));
  const [wminX, wminZ] = cornerWorld(s, b.minX, b.minZ);
  const wallZ = wminZ - 1.7, wallX = wminX - 1.7;

  const hintFor = (code: string): DropHint => {
    if (build || !drag || drag.phase !== "drag") return "idle";
    const occ = s.occupants[code];
    if (code === drag.from) return "candidate";
    if (code === hoverCage) return occ ? "blocked" : "hot";
    return occ ? "idle" : "candidate";
  };

  return (
    <>
      <color attach="background" args={[NIGHT.bg]} />
      <fog attach="fog" args={[NIGHT.bg, 28, 52]} />
      <OrthographicCamera makeDefault position={[12, 12, 12]} zoom={zoom} near={0.1} far={80}
        onUpdate={(c) => c.lookAt(0, 0.35, 0)} />

      <ambientLight intensity={0.55} />
      <directionalLight color="#ffe9d2" position={[6, 11, 4]} intensity={1.1} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight color="#22d3ee" position={[-8, 4.5, -5]} intensity={0.6} distance={30} />
      <pointLight color="#f43f5e" position={[9, 4, 7]} intensity={0.4} distance={30} />
      <pointLight color="#ffb066" position={[-4.5, 3, -4.5]} intensity={0.55} distance={16} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial map={wood} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* الجدران تتبع حدود المخطط وتلتقيان كزاوية غرفة حقيقية (حرف L لا X):
          كل جدار يبدأ من الركن ويمتد باتجاه واحد فقط */}
      <mesh position={[wallX + 20, 1.9, wallZ]}>
        <planeGeometry args={[40, 4]} />
        <meshStandardMaterial color={NIGHT.wall} roughness={0.9} />
      </mesh>
      <mesh position={[wallX, 1.9, wallZ + 20]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[40, 4]} />
        <meshStandardMaterial color={NIGHT.wall} roughness={0.9} />
      </mesh>
      <mesh position={[wallX + 20, 3.88, wallZ + 0.02]}>
        <boxGeometry args={[40, 0.05, 0.05]} />
        <meshStandardMaterial color={NIGHT.wallEdge} emissive={NIGHT.wallEdge} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <mesh position={[wallX + 0.02, 3.88, wallZ + 20]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[40, 0.05, 0.05]} />
        <meshStandardMaterial color={NIGHT.wallEdge} emissive={NIGHT.wallEdge} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <HexCluster position={[wallX + 0.05, 2.35, wminZ + 1.6]} rotation={[0, Math.PI / 2, 0]} color="#ff9e4d" />
      <HexCluster position={[wminX + 3.2, 2.3, wallZ + 0.05]} rotation={[0, 0, 0]} color="#22d3ee" />

      {/* شبكة البناء — تظهر بوضع البناء فقط، بمقاس خلية القفص نفسه */}
      {build && (
        <DreiGrid position={[0, -0.06, 0]} args={[40, 40]}
          cellSize={CELL} cellThickness={1} cellColor="#1d4356"
          sectionSize={CELL * 4} sectionThickness={1.3} sectionColor="#2a6076"
          fadeDistance={30} fadeStrength={1.4} followCamera={false} />
      )}

      <RoomFloors s={s} build={build} />
      <Partitions rooms={s.rooms} s={s} />

      {s.cages.map((c) => {
        const [wx, wz] = cellWorld(s, c.x, c.z);
        return (
          <CageUnit key={c.code}
            spec={{ code: c.code, occupant: s.occupants[c.code] ?? null }}
            position={[wx, 0.525, wz]}
            dropHint={hintFor(c.code)}
            dragActive={!!drag || build}
            ghost={drag?.from === c.code}
            neon={c.color}
            selected={build && s.selected === c.code}
            showCard={!build}
            arrivedRef={arrivedRef}
            onHoverChange={setHoverCage}
            onCardDown={onCardDown}
            onTap={onTapCage} />
        );
      })}

      {build && <GhostCage s={s} />}
      {drag && !build && <DragAvatar drag={drag} onReturned={onReturned} />}

      <ContactShadows position={[0, -0.08, 0]} opacity={0.5} scale={26} blur={2.4} far={3.5} color="#241505" />
    </>
  );
}

const WEEK_LETTERS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const todayIdx = () => (new Date().getDay() + 1) % 7;

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: NIGHT.glassPanel, border: "1px solid #16324a", backdropFilter: "blur(10px)", ...extra,
});

export default function Cage3DDemo({ openMedicalRecord }: {
  /** فتح الملف الطبي للمريض — المرحلة ٤ تمرّر دالة تنقل لسجل الحيوان الحقيقي. */
  openMedicalRecord?: (occ: Occupant) => void;
}) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const s = useCageStudio();
  const build = s.mode === "build";

  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverCage, setHoverCage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [roomDialog, setRoomDialog] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomW, setRoomW] = useState(3);
  const [roomD, setRoomD] = useState(2);
  const [codeDraft, setCodeDraft] = useState("");
  const arrivedRef = useRef(new Map<string, number>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ code: string; x: number; y: number } | null>(null);

  const say = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  /* ضغطة أم سحبة على بطاقة المريض؟ عتبة ٨ بكسل تفصل بينهما */
  const onCardDown = (code: string, e: { clientX: number; clientY: number }) => {
    if (drag || build) return;
    pending.current = { code, x: e.clientX, y: e.clientY };
  };
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 8) return;
      pending.current = null;
      const st = cageStudio.get();
      const occ = st.occupants[p.code];
      const cage = st.cages.find((c) => c.code === p.code);
      if (!occ || !cage) return;
      playTap();
      setDetailFor(null);
      document.body.style.cursor = "grabbing";
      const [wx, wz] = cellWorld(st, cage.x, cage.z);
      setDrag({ from: p.code, occ, fromPos: [wx, 0.525, wz], phase: "drag" });
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

  /* إفلات سحب المريض (وضع الإدارة) */
  useEffect(() => {
    if (!drag || drag.phase !== "drag") return;
    const up = () => {
      document.body.style.cursor = "";
      const occ = hoverCage ? s.occupants[hoverCage] : undefined;
      const validTarget = hoverCage && hoverCage !== drag.from && !occ && s.cages.some((c) => c.code === hoverCage);
      if (validTarget && cageStudio.moveOccupant(drag.from, hoverCage!)) {
        playSuccess();
        arrivedRef.current.set(hoverCage!, performance.now());
        say(`انتقل ${drag.occ.name} إلى القفص ${hoverCage}`);
        setDrag(null);
      } else {
        if (hoverCage && occ && hoverCage !== drag.from) {
          playWarning();
          say(`القفص ${hoverCage} مشغول — رجّعنا ${drag.occ.name} لمكانه`);
        }
        setDrag((d) => (d ? { ...d, phase: "return" } : null));
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, hoverCage, s]);

  /* إفلات «قفص جديد» من اللوح (وضع البناء) */
  useEffect(() => {
    if (!build) return;
    const up = () => {
      if (!placing.current) return;
      placing.current = false;
      document.body.style.cursor = "";
      const g = ghostCell.current;
      ghostCell.current = null;
      if (g?.valid) {
        const cage = cageStudio.placeCage(g.x, g.z);
        if (cage) { playSuccess(); say(`انضاف القفص ${cage.code} — اضغطه لتخصيصه`); return; }
      }
      playTap();
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [build]);

  /* نقرة على جسم القفص: بناء = تحديد للتخصيص، إدارة = تفاصيل الراقد */
  const onTapCage = (code: string) => {
    playTap();
    if (build) {
      cageStudio.select(s.selected === code ? null : code);
      setCodeDraft(code);
    } else if (s.occupants[code]) {
      setDetailFor((d) => (d === code ? null : code));
    }
  };

  const openRecord = (occ: Occupant) => {
    playTap();
    if (openMedicalRecord) { openMedicalRecord(occ); return; }
    // نقطة ربط المرحلة ٤: occ.petId → navigate(`/pet/${petId}?tab=timeline`)
    say(`ملف ${occ.name} الطبي يرتبط بسجل الحيوان الحقيقي بعد ربط البيانات`);
  };

  const stays = s.cages.filter((c) => s.occupants[c.code]);
  const detail = !build && detailFor ? s.cages.find((c) => c.code === detailFor) : null;
  const detailOcc = detail ? s.occupants[detail.code] : null;
  const selCage = build && s.selected ? s.cages.find((c) => c.code === s.selected) : null;
  const canBuild = can("manageSettings");

  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas shadows dpr={[1, 2]}>
        <Scene s={s} drag={drag} hoverCage={hoverCage} arrivedRef={arrivedRef}
          setHoverCage={setHoverCage} onCardDown={onCardDown}
          onReturned={() => setDrag(null)} onTapCage={onTapCage} />
      </Canvas>

      {/* العنوان + مبدّل الوضعين + رجوع */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>لوحة تحكم الأقفاص المتقدمة — عيادة doctorVet</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#8fa8bd" }}>
            {build
              ? "وضع البناء: ضيف غرفاً، اسحب «قفص جديد» لخلية بالشبكة، واضغط أي قفص لتخصيص رقمه ولون ليده"
              : "الإدارة اليومية: اضغط بطاقة المريض لتفاصيله وملفه · اسحبها لقفص متاح — المشغول يحمرّ والمتاح ينبض"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canBuild && (
            <div data-mode3d className="pointer-events-auto inline-flex rounded-full p-0.5" style={glass()}>
              <button type="button" onClick={() => { playTap(); cageStudio.setMode("manage"); }}
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-extrabold transition"
                style={!build ? { background: "#22d3ee", color: "#04222b" } : { color: "#7c95ab" }}>
                <ClipboardList size={12} /> الإدارة اليومية
              </button>
              <button type="button" onClick={() => { playTap(); setDetailFor(null); setDrag(null); cageStudio.setMode("build"); }}
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-extrabold transition"
                style={build ? { background: "#fb923c", color: "#3b1a04" } : { color: "#7c95ab" }}>
                <Hammer size={12} /> وضع البناء
              </button>
            </div>
          )}
          <button type="button" onClick={() => navigate("/charts")}
            className="pointer-events-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-extrabold transition"
            style={{ background: "#0e1a2e", color: "#9fdcef", border: "1px solid #164e63" }}>
            <ChevronRight size={14} /> رجوع للطبلات
          </button>
        </div>
      </div>

      {/* وضع الإدارة: لوحة المنامات الزجاجية */}
      {!build && (
        <div data-panel3d className="pointer-events-none absolute top-20 start-4 w-56 rounded-2xl p-3 sm:start-6" style={glass()}>
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
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEON[s.occupants[c.code]!.status], boxShadow: `0 0 7px ${NEON[s.occupants[c.code]!.status]}` }} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold" style={{ color: NIGHT.ink }}>{s.occupants[c.code]!.name}</span>
                <span className="shrink-0 text-[10px] font-bold" style={{ color: "#64809c" }}>
                  {KIND_AR[s.occupants[c.code]!.status]} · قفص {c.code}
                </span>
              </div>
            ))}
            {stays.length === 0 && <p className="text-[10px] font-bold" style={{ color: "#64809c" }}>ما في منامات حالياً.</p>}
          </div>
        </div>
      )}

      {/* وضع البناء: لوح الأدوات — قفص جديد (سحب) + غرفة جديدة + عدّادات */}
      {build && (
        <div data-builder3d className="absolute bottom-16 start-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl p-2"
          style={{ ...glass(), insetInlineStart: "50%", transform: "translateX(50%)" }}>
          <div data-newcage
            onPointerDown={(e) => { e.preventDefault(); playTap(); placing.current = true; document.body.style.cursor = "copy"; }}
            className="flex cursor-grab select-none items-center gap-2 rounded-xl border border-dashed px-3 py-2"
            style={{ borderColor: "#4ade8088", color: "#4ade80", touchAction: "none" }}>
            <Plus size={14} />
            <span className="text-[11px] font-extrabold">قفص جديد — اسحبه للمخطط</span>
          </div>
          <button type="button" onClick={() => { playTap(); setRoomName(""); setRoomDialog(true); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold"
            style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
            <Plus size={13} /> غرفة جديدة
          </button>
          <span className="px-1 text-[10px] font-bold" style={{ color: "#64809c" }}>
            {formatNum(s.rooms.length)} غرف · {formatNum(s.cages.length)} قفص
          </span>
        </div>
      )}

      {/* وضع البناء: لوح خصائص القفص المحدّد */}
      {selCage && (
        <div data-props3d className="absolute top-20 start-4 w-56 rounded-2xl p-3 sm:start-6" style={glass()}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black" style={{ color: NIGHT.ink }}>خصائص القفص</h2>
            <button type="button" onClick={() => cageStudio.select(null)} style={{ color: "#64809c" }}><X size={14} /></button>
          </div>
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>رقم القفص</label>
          <div className="mb-3 flex gap-1.5">
            <input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)}
              className="h-8 w-full rounded-lg px-2 text-xs font-black tabular-nums"
              style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a", direction: "ltr", textAlign: "center" }} />
            <button type="button"
              onClick={() => {
                if (cageStudio.updateCage(selCage.code, { code: codeDraft })) { playSuccess(); say("انحفظ رقم القفص"); }
                else { playWarning(); say("الرقم مستعمل بقفص ثاني"); }
              }}
              className="h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-extrabold"
              style={{ background: "#22d3ee", color: "#04222b" }}>
              حفظ
            </button>
          </div>
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>لون الليد (وهو فاضٍ)</label>
          <div className="mb-3 flex gap-1.5">
            {LED_CHOICES.map((c) => (
              <button key={c} type="button" onClick={() => { playTap(); cageStudio.updateCage(selCage.code, { color: c }); }}
                className="h-7 w-7 rounded-full transition"
                style={{
                  background: c, boxShadow: `0 0 10px ${c}`,
                  outline: (selCage.color ?? NEON.free) === c ? "2px solid #fff" : "none", outlineOffset: 2,
                }} />
            ))}
          </div>
          <button type="button"
            onClick={() => { playTap(); cageStudio.removeCage(selCage.code); say("انحذف القفص"); }}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-extrabold"
            style={{ background: "#2b1214", color: "#f87171", border: "1px solid #7f1d1d55" }}>
            <Trash2 size={12} /> حذف القفص
          </button>
        </div>
      )}

      {/* حوار غرفة جديدة */}
      {roomDialog && (
        <div className="absolute inset-0 z-10 grid place-items-center" style={{ background: "#00000088" }}
          onClick={() => setRoomDialog(false)}>
          <div data-roomdlg className="w-72 rounded-2xl p-4" style={glass()} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-sm font-black" style={{ color: NIGHT.ink }}>غرفة جديدة</h2>
            <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>اسم الغرفة</label>
            <input autoFocus value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="غرفة العزل"
              className="mb-3 h-9 w-full rounded-lg px-2.5 text-xs font-bold"
              style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }} />
            <div className="mb-4 flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>العرض (أقفاص)</label>
                <select value={roomW} onChange={(e) => setRoomW(Number(e.target.value))}
                  className="h-9 w-full rounded-lg px-2 text-xs font-bold"
                  style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>العمق (صفوف)</label>
                <select value={roomD} onChange={(e) => setRoomD(Number(e.target.value))}
                  className="h-9 w-full rounded-lg px-2 text-xs font-bold"
                  style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button type="button"
              onClick={() => {
                const r = cageStudio.addRoom(roomName, roomW, roomD);
                playSuccess();
                say(`انبنت ${r.name} — قواطعها الزجاجية انرسمت تلقائياً`);
                setRoomDialog(false);
              }}
              className="h-9 w-full rounded-lg text-xs font-black" style={{ background: "#fb923c", color: "#3b1a04" }}>
              بناء الغرفة
            </button>
          </div>
        </div>
      )}

      {/* وضع الإدارة: تفاصيل المريض + فتح الملف الطبي */}
      {detail && detailOcc && (
        <div data-detail3d className="absolute bottom-24 start-4 w-60 rounded-2xl p-3 sm:start-6"
          style={{ ...glass(), border: `1px solid ${NEON[detailOcc.status]}55` }}>
          <button type="button" onClick={() => setDetailFor(null)} className="absolute end-2 top-2" style={{ color: "#64809c" }}>
            <X size={14} />
          </button>
          <div className="flex items-center gap-3">
            <img src={speciesPhoto(detailOcc.species, 96)} alt={detailOcc.name}
              className="h-14 w-14 rounded-xl object-cover"
              style={{ border: `2px solid ${NEON[detailOcc.status]}aa` }} />
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: NIGHT.ink }}>
                {detailOcc.name} <span className="text-[10px] font-bold" style={{ color: "#64809c" }}>· {SPECIES_AR[detailOcc.species] ?? ""}</span>
              </p>
              <p className="mt-0.5 text-[11px] font-extrabold" style={{ color: NEON[detailOcc.status] }}>
                {KIND_AR[detailOcc.status]} — اليوم {formatNum(detailOcc.days)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold" style={{ color: "#64809c" }}>القفص {detail.code} · اسحب بطاقته لنقله</p>
            </div>
          </div>
          <button type="button" data-record3d onClick={() => openRecord(detailOcc)}
            className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-extrabold"
            style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
            <FileText size={12} /> فتح الملف الطبي
          </button>
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

      {!build && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-4 sm:p-6">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ background: "#0e1a2eeb", color: "#c8dbea", border: "1px solid #16324a" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: l.c, boxShadow: `0 0 8px ${l.c}` }} /> {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
