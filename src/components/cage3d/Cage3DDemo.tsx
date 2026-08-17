import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, ContactShadows, Html, Grid as DreiGrid, MapControls } from "@react-three/drei";
import { CanvasTexture, MOUSE, Plane, RepeatWrapping, TOUCH, Vector2, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ChevronRight, Hammer, ClipboardList, Maximize, Minus, Move, Plus, Search, Trash2, X, FileText, UserPlus } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D, type DropHint } from "./CageUnit";
import { NEON, NIGHT, KIND_AR, SPECIES_AR, SPECIES_EMOJI, type Occupant } from "./neon";
import {
  CELL, LED_CHOICES, cageStudio, useCageStudio, cageAt, cellFree, bounds,
  cellWorld, cornerWorld, buildPartitions, doorCell, codesFromPrefs, type Room3D,
} from "./store";
import { opsStore } from "@/lib/opsStore";
import { statusOf } from "@/lib/opsStatus";
import { repo } from "@/lib/repo";
import type { Admission } from "@/types";
import { speciesPhoto } from "@/lib/petPhotos";
import { formatNum, localISO } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * استوديو الأقفاص — على البيانات الحقيقية:
 *
 * المرضى من opsStore (نفس مصدر التقويم الرئيسي): القفص يُسكنه الرقود النشط
 * الذي يحمل رمزه بحقل admission.cage، وكل نقلة = opsStore.patch → تنحفظ
 * بالسيرفر وتتسجّل برحلة الحيوان (cage_changed) وتظهر فوراً بالتقويم
 * وخريطة 2D. «الملف الطبي» يفتح سجل الحيوان الفعلي، و«إسكان حيوان» يبحث
 * بسجلاتك ويحطه بقفص بضغطتين. التخطيط يُعكس لخريطة 2D (clinic_prefs)،
 * وأي رمز قفص موجود بالسستم وغير مرسوم هنا يُتبنّى تلقائياً — لا يختفي
 * حيوان أبداً. النقل بضغطتين، والبناء بضغطة خلية، ولافتة كل غرفة معلّقة
 * فوق بابها (وبوضع البناء ضغطها يفتح لوحتها: اسم، ترقيم تلقائي، حذف).
 * ==========================================================================*/

const FLY_Y = 1.5;
const REST_Y = 1.2;
const WALL_H = 1.65;

interface DragState {
  occ: Occupant;
  fromPos: [number, number, number];
  phase: "drag" | "return";
}

/* refs عابرة للحدود DOM ⇄ Canvas بلا رندر */
const placing = { current: false };
const ghostCell = { current: null as null | { x: number; z: number; valid: boolean } };
const lastPtr = { x: 0, y: 0 };
const dragOver = { current: null as string | null };

function ptrNDC(el: HTMLCanvasElement, out: Vector2): Vector2 {
  const r = el.getBoundingClientRect();
  return out.set(((lastPtr.x - r.left) / r.width) * 2 - 1, -(((lastPtr.y - r.top) / r.height) * 2 - 1));
}

const norm = (c?: string | null) => (c ?? "").trim().toLowerCase();
const dayNo = (iso?: string) => {
  const t = new Date((iso ?? "") + "T00:00:00").getTime();
  return Number.isNaN(t) ? 1 : Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
};

/** جرعة العلاج مستحقّة؟ — نفس معادلة لوحات الاستقبال (ما انكملت اليوم أو مرّت
 *  نافذة الدورة cycle_hours). الفندقة الصِرفة ما عندها جرعات. */
const doseDueOf = (a: Admission): boolean => {
  if (a.status !== "active" || (a.kind !== "treatment" && a.kind !== "treatment_boarding")) return false;
  if (!a.last_completed_at) return true;
  const cyc = a.cycle_hours && a.cycle_hours > 0 ? a.cycle_hours : 24;
  return Date.now() >= new Date(a.last_completed_at).getTime() + cyc * 3600000;
};

/** خطوات الجولة التعريفية — تُعرض مرة واحدة لكل جهاز عند أول فتح.
 *  v2: انضافت خطوة الكاميرا (تكبير وتحريك) فتنعرض مرة جديدة لمن شاف v1. */
const TOUR_KEY = "vp_cage3d_tour_v2";
const TOUR: { emoji: string; title: string; body: string }[] = [
  {
    emoji: "🐾", title: "النقل بضغطتين",
    body: "اضغط بطاقة الحيوان فوق قفصه، بعدين اضغط القفص الجديد — ينتقل فوراً، وينحفظ بالسيرفر ويظهر بالتقويم الرئيسي وبرحلة الحيوان.",
  },
  {
    emoji: "📋", title: "كل شيء عن الساكن",
    body: "اضغط جسم القفص: تشوف تفاصيل الحيوان وتفتح ملفه الطبي وتنقله. والقفص اللي يومض كهرماني 💉 يعني موعد جرعة ساكنه حان.",
  },
  {
    emoji: "🤏", title: "كبّر وتحرّك براحتك",
    body: "قرّب وبعّد بأصبعين (أو بعجلة الفأرة)، واسحب الأرضية بإصبع واحد حتى تتحرك بالمكان. وأزرار ＋ − ⛶ على الجنب — زر ⛶ يرجّعك للمنظر الكامل بضغطة.",
  },
  {
    emoji: "🔎", title: "وين الحيوان؟",
    body: "بلوحة «المنامات» اكتب اسم الحيوان واضغط سطره — قفصه يلمع لك بالمشهد. وزر «إسكان حيوان» يجيب أي حيوان من سجلاتك ويحطه بقفص بضغطتين.",
  },
];

/** حدود تكبير الكاميرا — أوسع من نطاق الملاءمة التلقائية (44–92) بهامش مريح. */
const ZOOM_MIN = 20, ZOOM_MAX = 200;

/** واجهة التحكم بالكاميرا التي نحتاجها من MapControls — بنيوية حتى لا نستورد
 *  أنواع three-stdlib مباشرة. */
interface CamCtl {
  target: Vector3;
  object: { position: Vector3; zoom: number; updateProjectionMatrix: () => void };
  update: () => void;
}

const LEGEND: { label: string; c: string }[] = [
  { label: "فندقة", c: NEON.boarding },
  { label: "علاج", c: NEON.care },
  { label: "فندقة علاجية", c: NEON.careBoarding },
  { label: "متاح", c: NEON.free },
];

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
            <mesh position={[0, WALL_H / 2 - 0.09, 0]}>
              <boxGeometry args={[len, WALL_H, 0.045]} />
              <meshStandardMaterial color="#bfe9f5" transparent opacity={0.13} roughness={0.08} metalness={0.1} depthWrite={false} />
            </mesh>
            <mesh position={[0, WALL_H - 0.09, 0]}>
              <boxGeometry args={[len + 0.06, 0.06, 0.08]} />
              <meshStandardMaterial color={NIGHT.shell} metalness={0.8} roughness={0.3} />
            </mesh>
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

/* ── أرضيات الغرف + لافتة كل غرفة معلّقة فوق بابها ─────────────────────── */
function RoomFloors({ s, build, occCount, onEditRoom }: {
  s: ReturnType<typeof cageStudio.get>;
  build: boolean;
  occCount: (r: Room3D) => number;
  onEditRoom: (id: string) => void;
}) {
  return (
    <>
      {s.rooms.map((r) => {
        const [wx, wz] = cornerWorld(s, r.x, r.z);
        const w = r.w * CELL, d = r.d * CELL;
        const [dx, dz] = doorCell(r);
        const [doorWX, doorWZ] = cornerWorld(s, dx, dz);
        return (
          <group key={r.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx + w / 2, -0.07, wz + d / 2]} receiveShadow>
              <planeGeometry args={[w - 0.12, d - 0.12]} />
              <meshStandardMaterial color="#10192b" transparent opacity={0.5} roughness={0.9} />
            </mesh>
            {/* اللافتة فوق الباب: قائمتان + لوح — والاسم عليها ببطاقة واضحة */}
            <group position={[doorWX + CELL / 2, 0, doorWZ]}>
              <mesh position={[0, WALL_H + 0.14, 0]}>
                <boxGeometry args={[CELL - 0.5, 0.34, 0.06]} />
                <meshStandardMaterial color={NIGHT.plate} metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, WALL_H - 0.02, 0]}>
                <boxGeometry args={[CELL - 0.44, 0.045, 0.05]} />
                <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={1.4} toneMapped={false} />
              </mesh>
              <Html center position={[0, WALL_H + 0.14, 0.06]} zIndexRange={[33, 0]}
                style={{ pointerEvents: build ? "auto" : "none" }}>
                <button type="button" data-sign3d={r.name}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (build) { playTap(); onEditRoom(r.id); } }}
                  style={{
                    direction: "rtl", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                    background: "#0d1b2ef2", border: "1px solid #2a6076", borderRadius: 8, padding: "4px 12px",
                    boxShadow: "0 0 14px #22d3ee33", cursor: build ? "pointer" : "default",
                  }}>
                  <b style={{ color: "#d8f6ff", fontSize: 12.5, fontWeight: 800 }}>{r.name}</b>
                  <i style={{ color: "#5f88a5", fontSize: 10, fontStyle: "normal", fontWeight: 700 }}>
                    {formatNum(occCount(r))} 🐾
                  </i>
                </button>
              </Html>
            </group>
          </group>
        );
      })}
    </>
  );
}

function CellPads({ s, onPick }: {
  s: ReturnType<typeof cageStudio.get>;
  onPick: (x: number, z: number) => void;
}) {
  const pads: React.ReactNode[] = [];
  for (const r of s.rooms) {
    for (let i = 0; i < r.w; i++) for (let j = 0; j < r.d; j++) {
      const x = r.x + i, z = r.z + j;
      if (cageAt(s, x, z)) continue;
      const [wx, wz] = cellWorld(s, x, z);
      pads.push(
        <group key={`${x},${z}`}>
          <mesh position={[wx, -0.03, wz]} rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => { if (e.delta < 10) { e.stopPropagation(); onPick(x, z); } }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "copy"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}>
            <planeGeometry args={[CELL - 0.45, CELL - 0.45]} />
            <meshStandardMaterial color="#4ade80" transparent opacity={0.22}
              emissive="#4ade80" emissiveIntensity={0.7} />
          </mesh>
          <Html center position={[wx, 0.02, wz]} zIndexRange={[28, 0]} style={{ pointerEvents: "none" }}>
            <span data-cell3d={`${x},${z}`} style={{ color: "#4ade80cc", fontSize: 22, fontWeight: 800, textShadow: "0 0 8px #4ade8088" }}>+</span>
          </Html>
        </group>,
      );
    }
  }
  return <>{pads}</>;
}

function GhostCage({ s }: { s: ReturnType<typeof cageStudio.get> }) {
  const grp = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);

  useFrame((st) => {
    const g = grp.current;
    if (!g) return;
    if (!placing.current) { g.visible = false; ghostCell.current = null; return; }
    st.raycaster.setFromCamera(ptrNDC(st.gl.domElement, ndc), st.camera);
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

function DragAvatar({ drag, s, onReturned }: {
  drag: DragState;
  s: ReturnType<typeof cageStudio.get>;
  onReturned: () => void;
}) {
  const grp = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const target = useMemo(() => new Vector3(...drag.fromPos).setY(FLY_Y), [drag.fromPos]);
  const color = NEON[drag.occ.status];
  const [imgFail, setImgFail] = useState(false);

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    if (drag.phase === "drag") {
      state.raycaster.setFromCamera(ptrNDC(state.gl.domElement, ndc), state.camera);
      if (state.raycaster.ray.intersectPlane(floor, hit)) {
        target.set(hit.x, FLY_Y, hit.z);
        const b = bounds(s);
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        const gx = Math.floor(hit.x / CELL + cx), gz = Math.floor(hit.z / CELL + cz);
        dragOver.current = s.cages.find((c) => c.x === gx && c.z === gz)?.code ?? null;
      }
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
            {imgFail || !drag.occ.photoUrl ? (
              <span style={{ fontSize: 22, filter: `drop-shadow(0 0 8px ${color})` }}>{drag.occ.emoji}</span>
            ) : (
              <img src={drag.occ.photoUrl} alt="" onError={() => setImgFail(true)}
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

function Scene({ s, occOf, drag, carrySource, hoverCage, arrivedRef, camZoom, ctlRef, setHoverCage, onCardDown, onReturned, onTapCage, onPickCell, onEditRoom }: {
  s: ReturnType<typeof cageStudio.get>;
  occOf: (code: string) => Occupant | null;
  drag: DragState | null;
  carrySource: string | null;      // رمز قفص المحمول (إن كان له قفص)
  hoverCage: string | null;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  camZoom: number;                 // ملاءمة تلقائية — يبقى بيد المستخدم بعد أول قرصة
  ctlRef: React.MutableRefObject<CamCtl | null>;
  setHoverCage: (c: string | null) => void;
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  onReturned: () => void;
  onTapCage: (code: string) => void;
  onPickCell: (x: number, z: number) => void;
  onEditRoom: (id: string) => void;
}) {
  const wood = useMemo(makeWoodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const build = s.mode === "build";

  const b = bounds(s);
  const [wminX, wminZ] = cornerWorld(s, b.minX, b.minZ);
  const wallZ = wminZ - 1.7, wallX = wminX - 1.7;

  const moveActive = !build && (drag?.phase === "drag" || carrySource !== null || !!drag);
  const hintFor = (code: string): DropHint => {
    if (build || !moveActive) return "idle";
    const occ = occOf(code);
    if (code === carrySource || (drag && dragOver.current === code && !occ)) return occ ? "candidate" : "hot";
    if (code === hoverCage && drag) return occ ? "blocked" : "hot";
    return occ ? "idle" : "candidate";
  };

  const occCount = (r: Room3D) =>
    s.cages.filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d && occOf(c.code)).length;

  return (
    <>
      <color attach="background" args={[NIGHT.bg]} />
      <fog attach="fog" args={[NIGHT.bg, 28, 52]} />
      <OrthographicCamera makeDefault position={[12, 12, 12]} zoom={camZoom} near={0.1} far={80} />
      {/* تحكم الكاميرا: قرصة بأصبعين تكبّر، وسحب الأرضية (إصبع أو فأرة) يحرّك،
          والدوران معطّل حتى تبقى الزاوية الإيزومترية ثابتة. سحب بطاقات المرضى
          ما يتأثر — أحداثها تُلتقط على عنصر DOM فلا تصل للكانفس أصلاً. */}
      <MapControls
        makeDefault
        enableRotate={false}
        enableDamping
        dampingFactor={0.14}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        target={[0, 0.35, 0]}
        touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        ref={(v: unknown) => { ctlRef.current = v as CamCtl | null; }}
      />

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

      {build && (
        <DreiGrid position={[0, -0.06, 0]} args={[40, 40]}
          cellSize={CELL} cellThickness={1} cellColor="#1d4356"
          sectionSize={CELL * 4} sectionThickness={1.3} sectionColor="#2a6076"
          fadeDistance={30} fadeStrength={1.4} followCamera={false} />
      )}

      <RoomFloors s={s} build={build} occCount={occCount} onEditRoom={onEditRoom} />
      <Partitions rooms={s.rooms} s={s} />
      {build && <CellPads s={s} onPick={onPickCell} />}

      {s.cages.map((c) => {
        const [wx, wz] = cellWorld(s, c.x, c.z);
        const occ = occOf(c.code);
        return (
          <CageUnit key={c.code}
            spec={{ code: c.code, occupant: occ }}
            position={[wx, 0.525, wz]}
            dropHint={hintFor(c.code)}
            dragActive={!!drag || build}
            ghost={(drag?.occ.admId ?? null) === occ?.admId && !!occ || carrySource === c.code}
            neon={c.color}
            selected={(build && s.selected === c.code) || carrySource === c.code}
            showCard={!build}
            arrivedRef={arrivedRef}
            onHoverChange={setHoverCage}
            onCardDown={onCardDown}
            onTap={onTapCage} />
        );
      })}

      {build && <GhostCage s={s} />}
      {drag && !build && <DragAvatar drag={drag} s={s} onReturned={onReturned} />}

      <ContactShadows position={[0, -0.08, 0]} opacity={0.5} scale={26} blur={2.4} far={3.5} color="#241505" />
    </>
  );
}

const WEEK_LETTERS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const todayIdx = () => (new Date().getDay() + 1) % 7;

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: NIGHT.glassPanel, border: "1px solid #16324a", backdropFilter: "blur(10px)", ...extra,
});

function webglOK(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function Cage3DDemo() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user } = useAuth();
  const s = useCageStudio();
  const build = s.mode === "build";
  const [glSupported] = useState(webglOK);
  const clinicId = user?.clinic_id ?? user?.id;

  /* المرضى الحقيقيون — نفس مخزن التقويم الرئيسي */
  const [ops, setOps] = useState(() => opsStore.get());
  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    void opsStore.hydrate(clinicId).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [carrying, setCarrying] = useState<Occupant | null>(null);
  const [hoverCage, setHoverCage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [roomDialog, setRoomDialog] = useState(false);
  const [roomEdit, setRoomEdit] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomW, setRoomW] = useState(3);
  const [roomD, setRoomD] = useState(2);
  const [renumBase, setRenumBase] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [picker, setPicker] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [findQ, setFindQ] = useState("");
  /* الجولة التعريفية — مرة واحدة لكل جهاز؛ رقم الخطوة أو null بعد إنهائها */
  const [tour, setTour] = useState<number | null>(() => {
    try { return localStorage.getItem(TOUR_KEY) ? null : 0; } catch { return null; }
  });
  const arrivedRef = useRef(new Map<string, number>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef<{ code: string; x: number; y: number } | null>(null);
  useEffect(() => () => { if (pulseTimer.current) clearInterval(pulseTimer.current); }, []);

  /* الكاميرا: ملاءمة تلقائية على التخطيط + أزرار تكبير/تصغير/توسيط */
  const ctlRef = useRef<CamCtl | null>(null);
  const camZoom = useMemo(() => {
    const b = bounds(s);
    const span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * 1.4) * CELL;
    return Math.max(44, Math.min(92, 660 / Math.max(span, 7)));
  }, [s]);
  const zoomBy = (f: number) => {
    playTap();
    const c = ctlRef.current;
    if (!c) return;
    c.object.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.object.zoom * f));
    c.object.updateProjectionMatrix();
    c.update();
  };
  /** رجوع للمنظر الكامل: وسط المشهد + ملاءمة التخطيط الحالي (لا حالة لحظة الفتح). */
  const resetCam = () => {
    playTap();
    const c = ctlRef.current;
    if (!c) return;
    c.target.set(0, 0.35, 0);
    c.object.position.set(12, 12, 12);
    c.object.zoom = camZoom;
    c.object.updateProjectionMatrix();
    c.update();
  };
  /* مجس للاختبارات الآلية (بيئة التطوير فقط) — يقرأ حالة الكاميرا الفعلية */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__cageCam = () => {
      const c = ctlRef.current;
      return c ? { zoom: c.object.zoom, tx: c.target.x, tz: c.target.z } : null;
    };
    return () => { delete (window as unknown as Record<string, unknown>).__cageCam; };
  }, []);

  const endTour = () => {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* خصوصية متشددة — ما نكسر الشاشة */ }
    setTour(null);
  };

  /** «وين الحيوان؟» — يخلي قفصه يلمع بالمشهد ٤ ثوانٍ (نبض متجدد كل نصف ثانية). */
  const locate = (code: string, name: string) => {
    playTap();
    setCarrying(null);
    setDetailFor(null);
    if (pulseTimer.current) clearInterval(pulseTimer.current);
    const until = performance.now() + 4200;
    arrivedRef.current.set(code, performance.now());
    pulseTimer.current = setInterval(() => {
      if (performance.now() > until) {
        if (pulseTimer.current) clearInterval(pulseTimer.current);
        pulseTimer.current = null;
        return;
      }
      arrivedRef.current.set(code, performance.now());
    }, 480);
    say(`${name} هنا — القفص ${code} يلمع لك`);
  };

  const say = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  /* اشتقاق الرقود النشطة → راقد لكل رمز قفص */
  const makeOcc = (a: Admission): Occupant => {
    const p = ops.pets[a.pet_id];
    const st = statusOf(a);
    return {
      admId: a.id,
      petId: a.pet_id,
      name: p?.name ?? "حيوان",
      speciesAr: p ? (SPECIES_AR[p.species] ?? "حيوان") : "حيوان",
      photoUrl: p ? (p.photo_url || speciesPhoto(p.species, 128)) : null,
      emoji: p ? (SPECIES_EMOJI[p.species] ?? "🐾") : "🐾",
      status: st === "done" ? "boarding" : st,
      days: dayNo(a.admitted_on),
      doseDue: doseDueOf(a),
    };
  };
  const actives = useMemo(() => ops.admissions.filter((a) => a.status !== "discharged"), [ops.admissions]);
  /* دقّاقة كل دقيقة — حتى ينطفئ/يشتعل وميض «جرعة مستحقّة» بلا تحديث يدوي */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const occByCage = useMemo(() => {
    const m = new Map<string, Occupant>();
    for (const a of actives) {
      const k = norm(a.cage);
      if (!k || m.has(k)) continue;
      m.set(k, makeOcc(a));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actives, ops.pets, tick]);
  const occOf = (code: string) => occByCage.get(norm(code)) ?? null;
  const carrySource = useMemo(() => {
    if (!carrying) return null;
    const a = actives.find((x) => x.id === carrying.admId);
    const k = norm(a?.cage);
    return k ? s.cages.find((c) => norm(c.code) === k)?.code ?? null : null;
  }, [carrying, actives, s.cages]);

  /* التبنّي: رموز على رقود نشطة أو بخريطة 2D وغير مرسومة هنا → تُغرز تلقائياً */
  useEffect(() => {
    if (!ops.hydrated) return;
    const codes = [
      ...actives.map((a) => (a.cage ?? "").trim()).filter(Boolean),
      ...codesFromPrefs(),
    ];
    if (codes.length) cageStudio.adoptCodes(codes);
  }, [ops.hydrated, actives]);

  const positions = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    s.cages.forEach((c) => {
      const [wx, wz] = cellWorld(s, c.x, c.z);
      m.set(norm(c.code), [wx, 0.525, wz]);
    });
    return m;
  }, [s]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const occRef = useRef(occByCage);
  occRef.current = occByCage;

  /** النقل الفعلي: opsStore.patch → السيرفر + رحلة الحيوان + كل الشاشات. */
  const tryMove = (occ: Occupant, toCode: string): boolean => {
    const sitting = occRef.current.get(norm(toCode));
    if (sitting && sitting.admId !== occ.admId) {
      playWarning();
      say(`القفص ${toCode} مشغول — اختر قفصاً فاضياً`);
      return false;
    }
    if (sitting?.admId === occ.admId) return false;
    playTap();
    arrivedRef.current.set(toCode, performance.now());
    opsStore.patch(occ.admId, { cage: toCode })
      .then(() => { playSuccess(); say(`انتقل ${occ.name} إلى القفص ${toCode}`); })
      .catch(() => { playWarning(); say("تعذّر حفظ النقلة — حاول مجدداً"); });
    return true;
  };

  /* تتبّع المؤشر + تفكيك «ضغطة أم سحبة» على بطاقة المريض */
  const onCardDown = (code: string, e: { clientX: number; clientY: number }) => {
    lastPtr.x = e.clientX; lastPtr.y = e.clientY;
    if (drag || build) return;
    pending.current = { code, x: e.clientX, y: e.clientY };
  };
  useEffect(() => {
    const track = (e: PointerEvent) => { lastPtr.x = e.clientX; lastPtr.y = e.clientY; };
    const mv = (e: PointerEvent) => {
      track(e);
      const p = pending.current;
      const threshold = e.pointerType === "touch" ? 14 : 8;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= threshold) return;
      pending.current = null;
      const occ = occRef.current.get(norm(p.code));
      const pos = positionsRef.current.get(norm(p.code));
      if (!occ || !pos) return;
      playTap();
      setDetailFor(null);
      setCarrying(null);
      document.body.style.cursor = "grabbing";
      setDrag({ occ, fromPos: pos, phase: "drag" });
    };
    const up = () => {
      const p = pending.current;
      pending.current = null;
      if (!p) return;
      playTap();
      setDetailFor(null);
      const occ = occRef.current.get(norm(p.code));
      if (occ) setCarrying((c) => (c?.admId === occ.admId ? null : occ));
    };
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("pointermove", mv, true);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("pointermove", mv, true);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, build]);

  /* إفلات السحب المتواصل — الهدف من موضع الإصبع (dragOver) */
  useEffect(() => {
    if (!drag || drag.phase !== "drag") return;
    const up = () => {
      document.body.style.cursor = "";
      const over = dragOver.current ?? hoverCage;
      dragOver.current = null;
      if (over && tryMove(drag.occ, over)) {
        setDrag(null);
      } else {
        setDrag((d) => (d ? { ...d, phase: "return" } : null));
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, hoverCage]);

  /* إفلات «قفص جديد» المسحوب من اللوح */
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

  useEffect(() => {
    if (carrying && build) setCarrying(null);
  }, [carrying, build]);

  const onPickCell = (x: number, z: number) => {
    const cage = cageStudio.placeCage(x, z);
    if (cage) {
      playSuccess();
      setCodeDraft(cage.code);
      say(`انضاف القفص ${cage.code} — رقمه ولونه بلوح الخصائص`);
    }
  };

  const onTapCage = (code: string) => {
    playTap();
    if (build) {
      cageStudio.select(s.selected === code ? null : code);
      setCodeDraft(code);
      return;
    }
    if (carrying) {
      if (carrySource && norm(carrySource) === norm(code)) { setCarrying(null); return; }
      if (tryMove(carrying, code)) setCarrying(null);
      return;
    }
    if (occOf(code)) setDetailFor((d) => (d === code ? null : code));
  };

  /** تغيير رقم قفص — مع مزامنة رقود ساكنه إن وُجد حتى لا ينقطع الربط. */
  const commitRename = (oldCode: string, newCode: string) => {
    const next = newCode.trim();
    if (!next || next === oldCode) return;
    const occ = occRef.current.get(norm(oldCode));
    if (!cageStudio.updateCage(oldCode, { code: next })) {
      playWarning();
      say("الرقم مستعمل بقفص ثاني");
      setCodeDraft(oldCode);
      return;
    }
    playSuccess();
    say("انحفظ رقم القفص");
    if (occ) void opsStore.patch(occ.admId, { cage: next }).catch(() => {});
  };

  const renumber = (roomId: string) => {
    const base = Number(renumBase);
    if (!Number.isFinite(base) || base < 1) { playWarning(); say("اكتب رقم البداية — مثال ١٠١"); return; }
    const changes = cageStudio.renumberRoom(roomId, base);
    for (const ch of changes) {
      const occ = occRef.current.get(norm(ch.from));
      if (occ) void opsStore.patch(occ.admId, { cage: ch.to }).catch(() => {});
    }
    playSuccess();
    say(`ترقّمت ${formatNum(changes.length)} أقفاص تلقائياً`);
  };

  const openRecord = (occ: Occupant) => {
    playTap();
    navigate(`/pet/${occ.petId}?tab=timeline`);
  };

  /* «إسكان حيوان»: بحث بسجلاتك — رقود بلا قفص يُحمل مباشرة، وبلا رقود يُرقد أولاً */
  const unassigned = useMemo(
    () => actives.filter((a) => !norm(a.cage) || !s.cages.some((c) => norm(c.code) === norm(a.cage))),
    [actives, s.cages],
  );
  const pickRows = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    const admitted = new Set(actives.map((a) => a.pet_id));
    const rows: Array<{ pet: NonNullable<typeof ops.pets[string]>; adm: Admission | null }> = [];
    for (const a of actives) {
      const p = ops.pets[a.pet_id];
      if (p) rows.push({ pet: p, adm: a });
    }
    for (const p of Object.values(ops.pets)) if (!admitted.has(p.id)) rows.push({ pet: p, adm: null });
    const f = q
      ? rows.filter(({ pet }) =>
          pet.name?.toLowerCase().includes(q) || pet.owner_name?.toLowerCase().includes(q) || (pet.serial ?? "").includes(q))
      : rows;
    // بلا قفص أولاً، ثم بلا رقود، ثم البقية
    return f.sort((a, b) => {
      const ka = a.adm ? (norm(a.adm.cage) ? 2 : 0) : 1;
      const kb = b.adm ? (norm(b.adm.cage) ? 2 : 0) : 1;
      return ka - kb;
    }).slice(0, 8);
  }, [pickQ, actives, ops.pets]);

  const pickPet = async (pet: { id: string; name: string; species: Parameters<typeof speciesPhoto>[0] }, adm: Admission | null, kind?: Admission["kind"]) => {
    playTap();
    setPicker(false);
    setPickQ("");
    if (adm) {
      setCarrying(makeOcc(adm));
      say(`اضغط القفص اللي تريد تحط ${pet.name} بيه`);
      return;
    }
    try {
      const created = await repo.addAdmission({
        pet_id: pet.id, kind: kind ?? "boarding", status: "active",
        admitted_on: localISO(), cage: "",
      });
      await opsStore.hydrate(clinicId);
      setCarrying(makeOcc(created));
      say(`انفتح رقود ${pet.name} — اضغط القفص اللي تريده`);
    } catch {
      playWarning();
      say("تعذّر فتح الرقود — حاول مجدداً");
    }
  };

  if (!glSupported) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: NIGHT.bg }} dir="rtl">
        <div className="w-80 rounded-2xl p-5 text-center" style={glass()}>
          <p className="text-3xl">🐾</p>
          <h1 className="mt-2 text-sm font-black" style={{ color: NIGHT.ink }}>جهازك ما يدعم العرض المجسّم</h1>
          <p className="mt-1.5 text-xs font-bold leading-relaxed" style={{ color: "#8fa8bd" }}>
            خريطة الأقفاص المسطّحة تعطيك نفس الإدارة الكاملة وتشتغل على كل الأجهزة.
          </p>
          <button type="button" onClick={() => navigate("/charts")}
            className="mt-4 h-9 w-full rounded-lg text-xs font-black" style={{ background: "#22d3ee", color: "#04222b" }}>
            فتح خريطة الأقفاص
          </button>
        </div>
      </div>
    );
  }

  const stays = s.cages.filter((c) => occOf(c.code));
  /* «وين الحيوان؟» — ترشيح المنامات والراقدين بلا قفص باسم الحيوان */
  const fq = findQ.trim().toLowerCase();
  const staysShown = fq ? stays.filter((c) => occOf(c.code)!.name.toLowerCase().includes(fq)) : stays;
  const unassignedShown = unassigned.flatMap((a) => {
    const p = ops.pets[a.pet_id];
    return p && (!fq || p.name.toLowerCase().includes(fq)) ? [{ a, p }] : [];
  });
  const detailOcc = !build && detailFor ? occOf(detailFor) : null;
  const selCage = build && s.selected ? s.cages.find((c) => c.code === s.selected) : null;
  const editRoom = roomEdit ? s.rooms.find((r) => r.id === roomEdit) : null;
  const canBuild = can("manageSettings");

  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas shadows dpr={[1, 2]}>
        <Suspense fallback={null}>
          <Scene s={s} occOf={occOf} drag={drag} carrySource={carrySource} hoverCage={hoverCage}
            arrivedRef={arrivedRef} camZoom={camZoom} ctlRef={ctlRef} setHoverCage={setHoverCage} onCardDown={onCardDown}
            onReturned={() => setDrag(null)} onTapCage={onTapCage} onPickCell={onPickCell}
            onEditRoom={(id) => { setRoomEdit(id); setRenumBase(""); }} />
        </Suspense>
      </Canvas>

      {/* العنوان + مبدّل الوضعين + رجوع */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>لوحة تحكم الأقفاص المتقدمة — عيادة doctorVet</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#8fa8bd" }}>
            {build
              ? "وضع البناء: اضغط خلية خضراء = قفص جديد · اضغط القفص لرقمه ولونه · اضغط لافتة الغرفة لاسمها وترقيمها"
              : "اضغط بطاقة المريض ثم القفص الجديد — انتهى · اضغط جسم القفص لتفاصيله · كبّر بأصبعين واسحب الأرضية تتحرك"}
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
              <button type="button" onClick={() => { playTap(); setDetailFor(null); setDrag(null); setCarrying(null); setPicker(false); cageStudio.setMode("build"); }}
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

      {/* لوحة المنامات — من الرقود الحقيقية + «وين الحيوان؟»: اضغط سطراً يلمع قفصه */}
      {!build && (
        <div data-panel3d className="pointer-events-auto absolute top-20 start-4 hidden w-56 rounded-2xl p-3 sm:start-6 sm:block" style={glass()}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black" style={{ color: NIGHT.ink }}>المنامات الحالية</h2>
            <span className="rounded-full px-1.5 text-[10px] font-black tabular-nums" style={{ background: "#12253a", color: "#7dd3fc" }}>
              {formatNum(stays.length)}
            </span>
          </div>
          <div className="relative mb-2">
            <Search size={12} className="pointer-events-none absolute inset-y-0 my-auto ms-2" style={{ color: "#64809c" }} />
            <input value={findQ} onChange={(e) => setFindQ(e.target.value)} data-find3d
              placeholder="وين الحيوان؟ اكتب اسمه…"
              className="h-8 w-full rounded-lg ps-7 pe-2 text-[11px] font-bold"
              style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }} />
          </div>
          <div className="mb-2 flex justify-between px-0.5">
            {WEEK_LETTERS.map((l, i) => (
              <span key={l} className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-black"
                style={i === todayIdx() ? { background: "#22d3ee", color: "#04222b" } : { color: "#64809c" }}>
                {l}
              </span>
            ))}
          </div>
          <div className="space-y-1.5" style={{ maxHeight: "38vh", overflowY: "auto" }}>
            {staysShown.map((c) => {
              const o = occOf(c.code)!;
              return (
                <button key={c.code} type="button" data-stay3d={c.code}
                  onClick={() => locate(c.code, o.name)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition hover:brightness-125"
                  style={{ background: "#0c192bcc" }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEON[o.status], boxShadow: `0 0 7px ${NEON[o.status]}` }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold" style={{ color: NIGHT.ink }}>
                    {o.name}{o.doseDue ? " 💉" : ""}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold" style={{ color: "#64809c" }}>
                    {KIND_AR[o.status]} · قفص {c.code}
                  </span>
                </button>
              );
            })}
            {/* الراقدون بلا قفص — ضغطة تحملهم للإسكان فوراً */}
            {unassignedShown.map(({ a, p }) => (
              <button key={a.id} type="button"
                onClick={() => { playTap(); setCarrying(makeOcc(a)); say(`اضغط القفص اللي تريد تحط ${p.name} بيه`); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition hover:brightness-125"
                style={{ background: "#1d160ccc", border: "1px solid #7c520d55" }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "#f0b26b", boxShadow: "0 0 7px #f0b26b" }} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold" style={{ color: NIGHT.ink }}>{p.name}</span>
                <span className="shrink-0 text-[10px] font-bold" style={{ color: "#f0b26b" }}>بلا قفص — أسكنه</span>
              </button>
            ))}
            {staysShown.length === 0 && unassignedShown.length === 0 && (
              <p className="text-[10px] font-bold" style={{ color: "#64809c" }}>
                {findQ.trim() ? "ما لقيناه بالمنامات — جرّب «إسكان حيوان» تحت." : "ما في منامات حالياً."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* شريط الحَمل */}
      {carrying && !build && (
        <div data-move3d className="absolute inset-x-0 bottom-16 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl py-2 pe-2 ps-4"
            style={{ ...glass(), border: `1px solid ${NEON[carrying.status]}66`, boxShadow: `0 0 24px ${NEON[carrying.status]}33` }}>
            <Move size={15} style={{ color: NEON[carrying.status] }} />
            <span className="text-xs font-extrabold" style={{ color: NIGHT.ink }}>
              وين ننقل {carrying.name}؟ <span style={{ color: "#8fa8bd" }}>اضغط أي قفص ينبض</span>
            </span>
            <button type="button" onClick={() => { playTap(); setCarrying(null); }}
              className="h-8 rounded-xl px-3 text-[11px] font-extrabold"
              style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* أزرار الكاميرا — تكبير/تصغير/رجوع للمنظر الكامل (لغير المتعوّد على القرصة) */}
      <div className="absolute end-4 top-1/2 flex -translate-y-1/2 flex-col gap-1.5 sm:end-6">
        <button type="button" data-zin3d onClick={() => zoomBy(1.35)} aria-label="تكبير"
          className="grid h-10 w-10 place-items-center rounded-xl transition active:scale-95"
          style={{ ...glass(), color: "#9fdcef" }}>
          <Plus size={17} />
        </button>
        <button type="button" data-zout3d onClick={() => zoomBy(1 / 1.35)} aria-label="تصغير"
          className="grid h-10 w-10 place-items-center rounded-xl transition active:scale-95"
          style={{ ...glass(), color: "#9fdcef" }}>
          <Minus size={17} />
        </button>
        <button type="button" data-zfit3d onClick={resetCam} aria-label="المنظر الكامل"
          className="grid h-10 w-10 place-items-center rounded-xl transition active:scale-95"
          style={{ ...glass(), color: "#9fdcef" }}>
          <Maximize size={16} />
        </button>
      </div>

      {/* زر «إسكان حيوان» — بحث بسجلاتك وحطّه بقفص */}
      {!build && !carrying && (
        <button type="button" data-pick3d
          onClick={() => { playTap(); setPicker(true); setPickQ(""); }}
          className="absolute bottom-16 end-4 inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-xs font-black sm:end-6"
          style={{ background: "#22d3ee", color: "#04222b", boxShadow: "0 0 24px #22d3ee55" }}>
          <UserPlus size={15} /> إسكان حيوان
        </button>
      )}

      {/* حوار الإسكان */}
      {picker && (
        <div className="absolute inset-0 z-10 grid place-items-center p-4" style={{ background: "#00000088" }}
          onClick={() => setPicker(false)}>
          <div data-picker3d className="w-full max-w-sm rounded-2xl p-4" style={glass()} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black" style={{ color: NIGHT.ink }}>إسكان حيوان بقفص</h2>
              <button type="button" onClick={() => setPicker(false)} className="p-1" style={{ color: "#64809c" }}><X size={15} /></button>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="pointer-events-none absolute inset-y-0 my-auto ms-2.5" style={{ color: "#64809c" }} />
              <input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ابحث بالاسم أو صاحب الحيوان أو الرقم…"
                className="h-10 w-full rounded-lg ps-8 pe-2.5 text-xs font-bold"
                style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }} />
            </div>
            <div className="space-y-1.5" style={{ maxHeight: 300, overflowY: "auto" }}>
              {pickRows.map(({ pet, adm }) => {
                const caged = adm && norm(adm.cage) && s.cages.some((c) => norm(c.code) === norm(adm.cage));
                return (
                  <div key={pet.id} className="rounded-xl p-2" style={{ background: "#0c192bcc" }}>
                    <div className="flex items-center gap-2.5">
                      <img src={pet.photo_url || speciesPhoto(pet.species, 64)} alt=""
                        className="h-9 w-9 rounded-lg object-cover" style={{ border: "1px solid #16324a" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold" style={{ color: NIGHT.ink }}>{pet.name}</p>
                        <p className="text-[10px] font-bold" style={{ color: adm ? (caged ? "#64809c" : "#f0b26b") : "#7c95ab" }}>
                          {adm ? (caged ? `بقفص ${adm.cage}` : "راقد بلا قفص") : "ما عنده رقود مفتوح"}
                        </p>
                      </div>
                      {adm ? (
                        <button type="button" onClick={() => void pickPet(pet, adm)}
                          className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-extrabold"
                          style={{ background: "#22d3ee", color: "#04222b" }}>
                          {caged ? "انقله" : "أسكنه"}
                        </button>
                      ) : (
                        <div className="flex shrink-0 gap-1">
                          {(["treatment", "boarding", "treatment_boarding"] as const).map((k) => (
                            <button key={k} type="button" onClick={() => void pickPet(pet, null, k)}
                              className="h-8 rounded-lg px-2 text-[10px] font-extrabold"
                              style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
                              {k === "treatment" ? "علاج" : k === "boarding" ? "فندقة" : "فندقة علاجية"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {pickRows.length === 0 && (
                <p className="py-4 text-center text-[11px] font-bold" style={{ color: "#64809c" }}>ما لقينا نتيجة — جرّب اسماً آخر.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* وضع البناء: لوح الأدوات */}
      {build && (
        <div data-builder3d className="absolute bottom-16 start-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl p-2"
          style={{ ...glass(), insetInlineStart: "50%", transform: "translateX(50%)" }}>
          <div data-newcage
            onPointerDown={(e) => { e.preventDefault(); lastPtr.x = e.clientX; lastPtr.y = e.clientY; playTap(); placing.current = true; document.body.style.cursor = "copy"; }}
            className="flex cursor-grab select-none items-center gap-2 rounded-xl border border-dashed px-3 py-2"
            style={{ borderColor: "#4ade8088", color: "#4ade80", touchAction: "none" }}>
            <Plus size={14} />
            <span className="text-[11px] font-extrabold">قفص جديد — اضغط خلية خضراء أو اسحبني</span>
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

      {/* وضع البناء: لوح خصائص القفص — الرقم يُحفظ وحده (Enter أو مغادرة الحقل) */}
      {selCage && (
        <div data-props3d className="absolute top-20 start-4 w-56 rounded-2xl p-3 sm:start-6" style={glass()}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black" style={{ color: NIGHT.ink }}>خصائص القفص</h2>
            <button type="button" onClick={() => cageStudio.select(null)} className="p-1" style={{ color: "#64809c" }}><X size={14} /></button>
          </div>
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>رقم القفص — يُحفظ وحده</label>
          <input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)}
            onBlur={() => commitRename(selCage.code, codeDraft)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(selCage.code, codeDraft); } }}
            className="mb-3 h-10 w-full rounded-lg px-2 text-sm font-black tabular-nums"
            style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a", direction: "ltr", textAlign: "center" }} />
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>لون الليد (وهو فاضٍ)</label>
          <div className="mb-3 flex gap-1.5">
            {LED_CHOICES.map((c) => (
              <button key={c} type="button" onClick={() => { playTap(); cageStudio.updateCage(selCage.code, { color: c }); }}
                className="h-8 w-8 rounded-full transition"
                style={{
                  background: c, boxShadow: `0 0 10px ${c}`,
                  outline: (selCage.color ?? NEON.free) === c ? "2px solid #fff" : "none", outlineOffset: 2,
                }} />
            ))}
          </div>
          <button type="button"
            onClick={() => { playTap(); cageStudio.removeCage(selCage.code); say("انحذف القفص"); }}
            className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-extrabold"
            style={{ background: "#2b1214", color: "#f87171", border: "1px solid #7f1d1d55" }}>
            <Trash2 size={12} /> حذف القفص
          </button>
        </div>
      )}

      {/* وضع البناء: لوحة الغرفة (من لافتة بابها): اسم + ترقيم تلقائي + حذف */}
      {editRoom && build && (
        <div data-roomedit3d className="absolute top-20 end-4 w-60 rounded-2xl p-3 sm:end-6" style={glass()}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black" style={{ color: NIGHT.ink }}>لوحة الغرفة</h2>
            <button type="button" onClick={() => setRoomEdit(null)} className="p-1" style={{ color: "#64809c" }}><X size={14} /></button>
          </div>
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>اسم الغرفة — يُحفظ وأنت تكتب</label>
          <input value={editRoom.name}
            onChange={(e) => cageStudio.updateRoom(editRoom.id, { name: e.target.value })}
            className="mb-3 h-10 w-full rounded-lg px-2.5 text-xs font-bold"
            style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }} />
          <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>ترقيم كل أقفاصها تلقائياً</label>
          <div className="mb-3 flex gap-1.5">
            <input value={renumBase} onChange={(e) => setRenumBase(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder="يبدأ من — مثال 101"
              className="h-10 w-full rounded-lg px-2 text-xs font-black tabular-nums"
              style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a", direction: "ltr", textAlign: "center" }} />
            <button type="button" onClick={() => renumber(editRoom.id)}
              className="h-10 shrink-0 rounded-lg px-3 text-[11px] font-extrabold"
              style={{ background: "#22d3ee", color: "#04222b" }}>
              رقّم
            </button>
          </div>
          <button type="button"
            onClick={() => { playTap(); cageStudio.removeRoom(editRoom.id); setRoomEdit(null); say("انحذفت الغرفة — مرضاها ما ينمسّون"); }}
            className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-extrabold"
            style={{ background: "#2b1214", color: "#f87171", border: "1px solid #7f1d1d55" }}>
            <Trash2 size={12} /> حذف الغرفة
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
              className="mb-3 h-10 w-full rounded-lg px-2.5 text-xs font-bold"
              style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }} />
            <div className="mb-4 flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>العرض (أقفاص)</label>
                <select value={roomW} onChange={(e) => setRoomW(Number(e.target.value))}
                  className="h-10 w-full rounded-lg px-2 text-xs font-bold"
                  style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold" style={{ color: "#64809c" }}>العمق (صفوف)</label>
                <select value={roomD} onChange={(e) => setRoomD(Number(e.target.value))}
                  className="h-10 w-full rounded-lg px-2 text-xs font-bold"
                  style={{ background: "#0c192b", color: NIGHT.ink, border: "1px solid #16324a" }}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button type="button"
              onClick={() => {
                const r = cageStudio.addRoom(roomName, roomW, roomD);
                playSuccess();
                say(`انبنت ${r.name} — اضغط خلاياها الخضراء لملئها أقفاصاً`);
                setRoomDialog(false);
              }}
              className="h-10 w-full rounded-lg text-xs font-black" style={{ background: "#fb923c", color: "#3b1a04" }}>
              بناء الغرفة
            </button>
          </div>
        </div>
      )}

      {/* تفاصيل المريض + الملف الطبي الحقيقي + نقله */}
      {detailOcc && detailFor && (
        <div data-detail3d className="absolute bottom-24 start-4 w-60 rounded-2xl p-3 sm:start-6"
          style={{ ...glass(), border: `1px solid ${NEON[detailOcc.status]}55` }}>
          <button type="button" onClick={() => setDetailFor(null)} className="absolute end-2 top-2 p-1" style={{ color: "#64809c" }}>
            <X size={14} />
          </button>
          <div className="flex items-center gap-3">
            {detailOcc.photoUrl ? (
              <img src={detailOcc.photoUrl} alt={detailOcc.name}
                className="h-14 w-14 rounded-xl object-cover"
                style={{ border: `2px solid ${NEON[detailOcc.status]}aa` }} />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl text-3xl" style={{ background: "#0c192b" }}>{detailOcc.emoji}</span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: NIGHT.ink }}>
                {detailOcc.name} <span className="text-[10px] font-bold" style={{ color: "#64809c" }}>· {detailOcc.speciesAr}</span>
              </p>
              <p className="mt-0.5 text-[11px] font-extrabold" style={{ color: NEON[detailOcc.status] }}>
                {KIND_AR[detailOcc.status]} — اليوم {formatNum(detailOcc.days)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold" style={{ color: "#64809c" }}>القفص {detailFor}</p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button type="button" data-record3d onClick={() => openRecord(detailOcc)}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg text-[11px] font-extrabold"
              style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
              <FileText size={12} /> الملف الطبي
            </button>
            <button type="button" data-movebtn3d
              onClick={() => { playTap(); setDetailFor(null); setCarrying(detailOcc); }}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg text-[11px] font-extrabold"
              style={{ background: NEON[detailOcc.status], color: "#04121b" }}>
              <Move size={12} /> نقله لقفص آخر
            </button>
          </div>
        </div>
      )}

      {/* إشعار النقلة */}
      <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-4"
        style={{ opacity: note ? 1 : 0, transform: `translateY(${note ? 0 : 8}px)`, transition: "all .25s ease" }}>
        {note && (
          <span data-note3d className="rounded-full px-4 py-2 text-xs font-extrabold"
            style={{ background: "#0e1a2ef2", color: "#c8f4e4", border: "1px solid #14532d" }}>
            {note}
          </span>
        )}
      </div>

      {!build && !carrying && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-4 sm:p-6">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ background: "#0e1a2eeb", color: "#c8dbea", border: "1px solid #16324a" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: l.c, boxShadow: `0 0 8px ${l.c}` }} /> {l.label}
            </span>
          ))}
        </div>
      )}

      {/* الجولة التعريفية — ثلاث فقاعات، مرة واحدة لكل جهاز */}
      {tour !== null && (
        <div className="absolute inset-0 z-20 grid place-items-center p-4" style={{ background: "#000000a6" }}
          onClick={endTour}>
          <div data-tour3d className="w-full max-w-xs rounded-2xl p-5 text-center" style={glass()} onClick={(e) => e.stopPropagation()}>
            <p className="text-4xl">{TOUR[tour].emoji}</p>
            <h2 className="mt-2 text-sm font-black" style={{ color: NIGHT.ink }}>{TOUR[tour].title}</h2>
            <p className="mt-1.5 text-xs font-bold leading-relaxed" style={{ color: "#8fa8bd" }}>{TOUR[tour].body}</p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {TOUR.map((_, i) => (
                <span key={i} className="h-1.5 rounded-full transition-all"
                  style={{ width: i === tour ? 18 : 6, background: i === tour ? "#22d3ee" : "#2a4a63" }} />
              ))}
            </div>
            <button type="button" data-tournext
              onClick={() => { playTap(); if (tour + 1 < TOUR.length) setTour(tour + 1); else endTour(); }}
              className="mt-4 h-10 w-full rounded-lg text-xs font-black"
              style={{ background: "#22d3ee", color: "#04222b" }}>
              {tour + 1 < TOUR.length ? "التالي" : "يلّا نبدي 🚀"}
            </button>
            <button type="button" onClick={() => { playTap(); endTour(); }}
              className="mt-1.5 h-8 w-full rounded-lg text-[11px] font-extrabold" style={{ color: "#64809c" }}>
              تخطّي الشرح
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
