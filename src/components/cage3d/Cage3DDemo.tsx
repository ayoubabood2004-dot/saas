import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, ContactShadows, Html, Grid as DreiGrid, MapControls, RoundedBox } from "@react-three/drei";
import { BoxGeometry, CanvasTexture, Matrix4, MOUSE, Plane, PMREMGenerator, RepeatWrapping, TOUCH, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ChevronRight, Hammer, ClipboardList, Maximize, Minus, Move, Plus, Search, Trash2, X, FileText, UserPlus } from "lucide-react";
import { CageUnit, CAGE_W, CAGE_D, CAGE_H, BASE_Y, type DropHint } from "./CageUnit";
import { LabelOverlay, LabelPositioner, type LabelSpec, type LabelNodes } from "./LabelLayer";
import { NEON, NIGHT, KIND_AR, SPECIES_AR, SPECIES_EMOJI, type Occupant } from "./neon";
import { useQuality, setTier, getTier, type Tier } from "./quality";
import {
  CELL, cageStudio, useCageStudio, cageAt, cellFree, bounds,
  cellWorld, cornerWorld, buildPartitions, codesFromPrefs, type Room3D,
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
import i18n from "@/i18n";

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

const FLY_Y = 2.4;
const REST_Y = 2.0;
const WALL_H = 0.95;
/* ارتفاع لافتة الغرفة — مستقلٌّ عن الإزارة عمداً: الإزارة انخفضت لتكشف
 * الأقفاص، واللافتة يجب أن تبقى **فوق سقوف الأقفاص** حتى تُقرأ من بعيد. */
const SIGN_TOP = BASE_Y + CAGE_H / 2 + 0.75;
/* إزاحة الكاميرا عن هدفها — **آيزومترك حقيقي** كالصورة المرجعية: الإزاحة
 * متساوية على المحاور الثلاثة، أي اتجاه نظرٍ (١،١،١). هذا بالضبط ما يجعل
 * محاور العالم الثلاثة تُسقَط على الشاشة بزوايا ١٢٠° متساوية، فتنحدر أضلاع
 * القفص الأفقية ٣٠° عن الأفق ويقف ركنه مواجهاً للناظر — لا زاوية «قريبة من
 * الإيزومترية» بل هي نفسها. أيّ اختلافٍ بين x وz يكسر تساوي الزوايا فوراً.
 * وهي إزاحةٌ لا موقفٌ مطلق: الهدف يتحرك لمركز الغرفة الرئيسية والكاميرا
 * تتبعه بالفرق نفسه، فتثبت الزاوية مهما تغيّر التخطيط. */
const CAM_OFF: [number, number, number] = [14, 14, 14];

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

/** حدود تكبير الكاميرا — أوسع من نطاق الملاءمة التلقائية (66–150) بهامش مريح. */
const ZOOM_MIN = 20, ZOOM_MAX = 200;

/** واجهة التحكم بالكاميرا التي نحتاجها من MapControls — بنيوية حتى لا نستورد
 *  أنواع three-stdlib مباشرة. */
interface CamCtl {
  target: Vector3;
  object: { position: Vector3; zoom: number; updateProjectionMatrix: () => void };
  update: () => void;
}

/* الأسطورة لونان لا أربعة: «وين فاضي؟» هو السؤال الوحيد الذي يُسأل من بعيد. */
const LEGEND: { label: string; c: string }[] = [
  { label: "فاضٍ", c: NEON.free },
  { label: "ممتلئ", c: NEON.boarding },
];

function makeWoodTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    g.fillStyle = `hsl(${28 + Math.random() * 5}, ${22 + Math.random() * 6}%, ${58 + Math.random() * 7}%)`;
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

/** حدود الغرف صارت **إزارةً منخفضة** لا جداراً: إزارة أرضية + لوح معدني
 *  قصير + مدّة علوية، بلا زجاج. جدارٌ بعلوّ القفص كان يقف بين الناظر وبين
 *  الصف الأمامي فيقطع أضلاعه — والمطلوب وضوحُ الصورة المرجعية قبل أي شيء.
 *  الإزارة تكفي لتقول «هذه الغرفة» وهي أوطأ من أن تحجب. */
const WALL_LOWER = 0.62;
function Partitions({ rooms, s }: { rooms: Room3D[]; s: ReturnType<typeof cageStudio.get> }) {
  const { low } = useQuality();
  const segs = useMemo(() => buildPartitions(rooms), [rooms]);
  /* كل الجدران بثلاث شبكات لا ستٍّ لكل مقطع. غرفة ٤×٣ تعطي ١٤ مقطعاً — أي ٨٤
   * شبكة و٨٤ نداء رسم في النسخة السابقة، وهي وحدها كانت تفوق كل الأقفاص.
   * الدمج يتمّ عند تغيّر الغرف فقط، لا كل إطار. */
  const merged = useMemo(() => {
    const metal: BufferGeometry[] = [];
    const plinth: BufferGeometry[] = [];
    const put = (arr: BufferGeometry[], g: BufferGeometry, x: number, y: number, z: number, ry: number) => {
      const m = new Matrix4();
      if (ry) m.makeRotationY(ry);
      m.setPosition(x, y, z);
      g.applyMatrix4(m);
      arr.push(g);
    };
    for (const seg of segs) {
      const [ax, az] = cornerWorld(s, seg.x1, seg.z1);
      const [bx, bz] = cornerWorld(s, seg.x2, seg.z2);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const ry = seg.z1 === seg.z2 ? 0 : Math.PI / 2;
      put(plinth, new BoxGeometry(len + 0.04, 0.17, 0.12), cx, 0.015, cz, ry);
      put(metal, new BoxGeometry(len, WALL_LOWER, 0.07), cx, WALL_LOWER / 2 + 0.05, cz, ry);
      put(metal, new BoxGeometry(len + 0.06, 0.07, 0.1), cx, WALL_H - 0.09, cz, ry);
      for (const o of [-len / 2, len / 2]) {
        const px = ry ? cx : cx + o;
        const pz = ry ? cz + o : cz;
        put(metal, new BoxGeometry(0.1, WALL_H, 0.1), px, WALL_H / 2 - 0.05, pz, 0);
      }
    }
    return {
      metal: metal.length ? mergeGeometries(metal) : null,
      plinth: plinth.length ? mergeGeometries(plinth) : null,
    };
  }, [segs, s]);
  useEffect(() => () => { merged.metal?.dispose(); merged.plinth?.dispose(); }, [merged]);

  return (
    <>
      {merged.plinth && (
        <mesh geometry={merged.plinth} receiveShadow={!low}>
          <meshStandardMaterial color="#c4ccd6" metalness={0.2} roughness={0.5} />
        </mesh>
      )}
      {merged.metal && (
        <mesh geometry={merged.metal} castShadow={!low}>
          <meshStandardMaterial color="#dbe1e9" metalness={0.4} roughness={0.32} />
        </mesh>
      )}
    </>
  );
}

/* ── أرضيات الغرف + باب حقيقي بعضادتين وساكف تعلوه لافتة الاسم ──────────── */
function RoomFloors({ s }: { s: ReturnType<typeof cageStudio.get> }) {
  /* لافتة الباب صُغّرت ورُفعت: بالكاميرا شبه الأمامية صار اللوح الكبير
   * يُسقَط فوق واجهة قفص الصف الأمامي فيحجب لوحة رقمه — لوحٌ أنحف أعلى
   * الساكف يقرأه الداخل ولا يغطّي شيئاً. */
  const signW = Math.min(CELL * 0.42, 2.7);
  return (
    <>
      {s.rooms.map((r) => {
        const [wx, wz] = cornerWorld(s, r.x, r.z);
        const w = r.w * CELL, d = r.d * CELL;
        return (
          <group key={r.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx + w / 2, -0.07, wz + d / 2]} receiveShadow>
              <planeGeometry args={[w - 0.12, d - 0.12]} />
              <meshStandardMaterial color="#cfd7e0" transparent opacity={0.85} roughness={0.8} />
            </mesh>
            {/* لافتة الغرفة على سياجها **الخلفي** لا على باب أمامي: بالكاميرا
                شبه الأمامية كان لوح الباب يُسقَط فوق واجهة قفصٍ بالصف الأمامي
                فيحجب لوحة رقمه. الآن تطفو فوق الصف الأخير كلافتة قسمٍ فندقية
                معلّقة بقائمين على السياج — تُقرأ من بعيد ولا تغطي شيئاً. */}
            <group position={[wx + w / 2, 0, wz + 0.55]}>
              {[-signW / 3, signW / 3].map((o, i) => (
                <mesh key={i} position={[o, SIGN_TOP / 2, 0]}>
                  <cylinderGeometry args={[0.03, 0.03, SIGN_TOP, 10]} />
                  <meshStandardMaterial color="#8d9aa8" metalness={0.9} roughness={0.25} />
                </mesh>
              ))}
              {/* الطبقة الخلفية: ستيل مصقول أعرض قليلاً وبإزاحة — مثل اللافتات الفندقية */}
              <RoundedBox args={[signW + 0.16, 0.6, 0.05]} radius={0.06} position={[0, SIGN_TOP, -0.06]} castShadow>
                <meshStandardMaterial color="#e6ebf0" metalness={0.7} roughness={0.22} />
              </RoundedBox>
              {/* اللوح الأمامي الداكن بزوايا دائرية */}
              <RoundedBox args={[signW, 0.52, 0.1]} radius={0.08} position={[0, SIGN_TOP, 0.02]} castShadow>
                <meshStandardMaterial color="#5d6a78" metalness={0.4} roughness={0.4} />
              </RoundedBox>
              {/* لوح اللافتة يبقى جسماً حقيقياً، أمّا الاسم فصار تسميةً بمساحة
                  الشاشة تُرسم فوقه (LabelLayer): نصٌّ منسوجٌ بالجسم يتقلّص مع
                  العالم فيصير ٦ بكسل عند التكبير الافتراضي — انظر دراسة المقروئية. */}
              {/* مرساة اختبارات غير مرئية — ببيئة التطوير فقط */}
              {import.meta.env.DEV && (
                <Html center position={[0, SIGN_TOP, 0.09]} zIndexRange={[8, 0]} style={{ left: 0, top: 0, pointerEvents: "none" }}>
                  <span data-sign3d={r.name} style={{ width: 1, height: 1, display: "block" }} />
                </Html>
              )}
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
            <planeGeometry args={[CAGE_W + 0.5, CAGE_D + 0.5]} />
            <meshStandardMaterial color="#4ade80" transparent opacity={0.22}
              emissive="#4ade80" emissiveIntensity={0.7} />
          </mesh>
          {/* علامة «+» مجسّمة بدل لوحة DOM: كل خلية فاضية كانت لوحة DOM تُحسب
              كل إطار — بغرفة كبيرة صارت عشرات وهي أصل اللاق بوضع البناء */}
          <mesh position={[wx, 0.0, wz]}>
            <boxGeometry args={[0.6, 0.05, 0.12]} />
            <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
          <mesh position={[wx, 0.0, wz]}>
            <boxGeometry args={[0.12, 0.05, 0.6]} />
            <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
          {/* مرساة اختبارات — ببيئة التطوير فقط، ولا لوحة DOM واحدة بالإنتاج */}
          {import.meta.env.DEV && (
            <Html center position={[wx, 0.02, wz]} zIndexRange={[8, 0]} style={{ left: 0, top: 0, pointerEvents: "none" }}>
              <span data-cell3d={`${x},${z}`} style={{ width: 1, height: 1, display: "block" }} />
            </Html>
          )}
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
    g.position.set(wx, BASE_Y, wz);
    const c = valid ? "#4ade80" : "#ef4444";
    mat.current?.color.set(c);
    mat.current?.emissive.set(c);
  });

  return (
    <group ref={grp} visible={false}>
      <mesh>
        <boxGeometry args={[CAGE_W, CAGE_H, CAGE_D]} />
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
        <Html center zIndexRange={[24, 0]} style={{ left: 0, top: 0, pointerEvents: "none" }}>
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
        {/* بلا ضوء نقطي مع المحمول: إضافة ضوء أو حذفه تُجبر three على إعادة
            ترجمة شادر كل خامة بالمشهد — أي تلعثمة مضمونة بالضبط عند بدء
            السحب وعند نهايته، وهي أكثر لحظة يجب أن تكون فيها الحركة سلسة. */}
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[drag.fromPos[0], 0.02, drag.fromPos[2]]}>
        <ringGeometry args={[0.34, 0.46, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </>
  );
}

/** مجس أداء للاختبارات (بيئة التطوير فقط): نداءات الرسم والمثلثات والأضواء
 *  أرقامٌ مستقلة عن قوة الجهاز — الحكم عليها أصدق من fps بمحاكي برمجي. */
const sceneCamera: { current: import("three").Camera | null } = { current: null };
function PerfProbe() {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const camera = useThree((st) => st.camera);
  sceneCamera.current = camera;
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cagePerf = () => {
      let lights = 0, meshes = 0;
      scene.traverse((o) => {
        const any = o as unknown as { isLight?: boolean; isMesh?: boolean };
        if (any.isLight) lights++;
        if (any.isMesh) meshes++;
      });
      return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0, lights, meshes };
    };
    /** قياس المقروئية: يُسقط نقاطاً من العالم على الشاشة فنعرف بالبكسل الحقيقي
     *  كم يبلغ ارتفاع رقم القفص واسم الغرفة — الحكم بالقياس لا بالانطباع. */
    (window as unknown as Record<string, unknown>).__cageProject = (pts: [number, number, number][]) => {
      const cam = (window as unknown as { __cageCamObj?: unknown }).__cageCamObj as { projectPoint?: unknown } | undefined;
      void cam;
      const v = new Vector3();
      const el = gl.domElement;
      const w = el.clientWidth, h = el.clientHeight;
      const camera = (gl as unknown as { __c?: unknown }).__c;
      void camera;
      return pts.map(([x, y, z]) => {
        v.set(x, y, z).project(sceneCamera.current!);
        return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
      });
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__cagePerf;
      delete (window as unknown as Record<string, unknown>).__cageProject;
    };
  }, [gl, scene]);
  return null;
}

function Scene({ s, occOf, drag, carrySource, hoverCage, arrivedRef, camZoom, camTarget, ctlRef, labels, labelNodes, setHoverCage, onCardDown, onReturned, onTapCage, onPickCell }: {
  s: ReturnType<typeof cageStudio.get>;
  occOf: (code: string) => Occupant | null;
  drag: DragState | null;
  carrySource: string | null;      // رمز قفص المحمول (إن كان له قفص)
  hoverCage: string | null;
  arrivedRef: React.MutableRefObject<Map<string, number>>;
  camZoom: number;                 // ملاءمة تلقائية — يبقى بيد المستخدم بعد أول قرصة
  camTarget: [number, number, number]; // مركز الافتتاح — الغرفة الرئيسية
  ctlRef: React.MutableRefObject<CamCtl | null>;
  labels: LabelSpec[];
  labelNodes: LabelNodes;
  setHoverCage: (c: string | null) => void;
  onCardDown: (code: string, e: { clientX: number; clientY: number }) => void;
  onReturned: () => void;
  onTapCage: (code: string) => void;
  onPickCell: (x: number, z: number) => void;
}) {
  const { low } = useQuality();
  const wood = useMemo(makeWoodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const build = s.mode === "build";

  const b = bounds(s);
  const [wminX, wminZ] = cornerWorld(s, b.minX, b.minZ);
  const wallZ = wminZ - 1.7, wallX = wminX - 1.7;
  // طول كل جدار = امتداد التخطيط + هامش، فيبقى الجدار خلفيةً للغرف لا شريطاً
  // يمتدّ للأفق.
  const wallLenX = (b.maxX - b.minX) * CELL + 5.6;
  const wallLenZ = (b.maxZ - b.minZ) * CELL + 5.6;

  const moveActive = !build && (drag?.phase === "drag" || carrySource !== null || !!drag);
  const hintFor = (code: string): DropHint => {
    if (build || !moveActive) return "idle";
    const occ = occOf(code);
    if (code === carrySource || (drag && dragOver.current === code && !occ)) return occ ? "candidate" : "hot";
    if (code === hoverCage && drag) return occ ? "blocked" : "hot";
    return occ ? "idle" : "candidate";
  };

  const inRoom = (r: Room3D) => s.cages.filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d);
  const occCount = (r: Room3D) => inRoom(r).filter((c) => occOf(c.code)).length;
  void occCount;

  return (
    <>
      {import.meta.env.DEV && <PerfProbe />}
      {/* نهارٌ هادئ: خلفية عاجية دافئة بدل الليل — الوضوح قبل الإبهار */}
      <color attach="background" args={["#efe9df"]} />
      {!low && <fog attach="fog" args={["#efe9df", 66, 128]} />}
      {!low && <EnvLight />}
      <OrthographicCamera makeDefault
        position={[camTarget[0] + CAM_OFF[0], camTarget[1] + CAM_OFF[1], camTarget[2] + CAM_OFF[2]]}
        zoom={camZoom} near={0.1} far={80} />
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
        target={camTarget}
        touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        ref={(v: unknown) => { ctlRef.current = v as CamCtl | null; }}
      />

      {/* ضوءان اثنان للمشهد كله. كل ضوء إضافي يدخل حلقةَ شادر البكسل لكل مادة
          مضاءة — والنسخة السابقة كانت تضيف ضوءاً نقطياً لكل قفص فتبلغ ٢١ ضوءاً
          باثني عشر قفصاً؛ هذا وحده كان يخنق الأجهزة الضعيفة. */}
      <ambientLight intensity={low ? 1.35 : 1.05} />
      {/* ضوء نصف كروي — تدرّج سماء/أرض بكلفة شبه معدومة، يعوّض غياب خريطة
          البيئة بالوضع الخفيف فما يخرج المعدن أسود. */}
      <hemisphereLight color="#ffffff" groundColor="#b9a488" intensity={low ? 0.8 : 0.55} />
      <directionalLight color="#fff6e8" position={[6, 11, 4]} intensity={low ? 1.35 : 1.1}
        castShadow={!low} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow={!low}>
        <planeGeometry args={[Math.max(24, wallLenX + 12), Math.max(24, wallLenZ + 12)]} />
        {low
          ? <meshBasicMaterial color="#b28a5c" />
          : <meshStandardMaterial map={wood} roughness={0.8} metalness={0.05} />}
      </mesh>

      {/* جدارا المنشأة — بطول التخطيط لا ٦٠ وحدة: الجدار الممتد للأفق كان
          يرسم إسفيناً أسود يقطع الشاشة قطرياً، وهو أول ما يُقرأ «تصميماً
          مخربطاً» قبل أن تُرى الأقفاص أصلاً. */}
      <mesh position={[wallX + wallLenX / 2, 1.9, wallZ]}>
        <planeGeometry args={[wallLenX, 4]} />
        <meshStandardMaterial color="#e2d8c9" roughness={0.9} />
      </mesh>
      <mesh position={[wallX, 1.9, wallZ + wallLenZ / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[wallLenZ, 4]} />
        <meshStandardMaterial color="#d9cfc0" roughness={0.9} />
      </mesh>
      <mesh position={[wallX + wallLenX / 2, 3.88, wallZ + 0.02]}>
        <boxGeometry args={[wallLenX, 0.05, 0.05]} />
        <meshStandardMaterial color="#b7ab93" roughness={0.6} />
      </mesh>
      <mesh position={[wallX + 0.02, 3.88, wallZ + wallLenZ / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[wallLenZ, 0.05, 0.05]} />
        <meshStandardMaterial color="#b7ab93" roughness={0.6} />
      </mesh>

      {build && (
        <DreiGrid position={[0, -0.06, 0]} args={[60, 60]}
          cellSize={CELL} cellThickness={1} cellColor="#c0b8a6"
          sectionSize={CELL * 4} sectionThickness={1.3} sectionColor="#a89d86"
          fadeDistance={44} fadeStrength={1.4} followCamera={false} />
      )}

      <RoomFloors s={s} />
      <Partitions rooms={s.rooms} s={s} />
      {build && <CellPads s={s} onPick={onPickCell} />}

      {s.cages.map((c) => {
        const [wx, wz] = cellWorld(s, c.x, c.z);
        const occ = occOf(c.code);
        return (
          <CageUnit key={c.code}
            spec={{ code: c.code, occupant: occ }}
            position={[wx, BASE_Y, wz]}
            dropHint={hintFor(c.code)}
            dragActive={!!drag || build}
            ghost={(drag?.occ.admId ?? null) === occ?.admId && !!occ || carrySource === c.code}
            selected={(build && s.selected === c.code) || carrySource === c.code}
            showCard={!build}
            arrivedRef={arrivedRef}
            onHoverChange={setHoverCage}
            onCardDown={onCardDown}
            onTap={onTapCage} />
        );
      })}

      <LabelPositioner labels={labels} nodes={labelNodes} hiddenFor={carrySource} />

      {build && <GhostCage s={s} />}
      {drag && !build && <DragAvatar drag={drag} s={s} onReturned={onReturned} />}

      {/* ظل ملامسة يُخبز مرة واحدة لكل تخطيط (المفتاح يعيد الخبز عند التغيير) —
          كان يُعاد رسمه كل إطار ويستنزف معالج رسوميات الآيباد بلا داعٍ */}
      {!low && (
        <ContactShadows key={`${s.rooms.length}-${s.cages.length}`} frames={1}
          position={[0, -0.08, 0]} opacity={0.32} scale={58} blur={2.6} far={4.2} color="#5a4630" />
      )}
    </>
  );
}

const WEEK_LETTERS = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const todayIdx = () => (new Date().getDay() + 1) % 7;

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: NIGHT.glassPanel, border: "1px solid #16324a", backdropFilter: "blur(10px)", ...extra,
});

/** خريطة بيئة محلية (بلا شبكة): المعادن بلا بيئة تعكس سواداً — هذي تخلي
 *  ستيل اللافتات وألواح الجدران وأُطر الأقفاص تلمع كمعدن حقيقي، بشدة
 *  مخفّضة حتى يبقى مزاج الليل. */
function EnvLight() {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function webglOK(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function Cage3DDemo({ onBoard }: { onBoard?: () => void } = {}) {
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
  /* حلقة الرسم عند الطلب: بالسكون لا يُرسم إطار واحد — لا حرارة ولا بطارية
   * ولا معالج على جهاز ضعيف. تعود «دائمة» فقط وهناك ما يتحرك فعلاً: تفاعل
   * كاميرا، سحب، تحويم، وضع بناء، أو نبض جرعة مستحقّة. */
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = () => {
    setInteracting(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // ٩٠٠ms بعد آخر لمسة: تكفي لتهدئة تخميد الكاميرا وحركة الوصول.
    idleTimer.current = setTimeout(() => setInteracting(false), 900);
  };
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);
  const { tier, low } = useQuality();
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

  /* الكاميرا: الافتتاح متوسّطٌ على **أكبر غرفة** لا على مركز التخطيط كله
   * (نسق الصورة المرجعية: صفُّ الغرفة يملأ عرض الشاشة). بغرفتين متباعدتين
   * كان مركز التخطيط فراغاً بينهما، فتُفتتح الشاشة على أرضٍ خالية والغرفتان
   * مقصوصتان على الحافتين. −١٫٢ بالعمق تدفع الغرفة قليلاً نحو أسفل الشاشة
   * فلا يبتلع ممرُّ الأرضية الأمامي نصفَ المنظر. */
  const ctlRef = useRef<CamCtl | null>(null);
  const primaryRoom = useMemo(
    () => (s.rooms.length ? s.rooms.reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a)) : null),
    [s]);
  const camTarget = useMemo<[number, number, number]>(() => {
    if (!primaryRoom) return [0, CAGE_H * 0.35, 0];
    const [wx, wz] = cornerWorld(s, primaryRoom.x, primaryRoom.z);
    return [wx + (primaryRoom.w * CELL) / 2, CAGE_H * 0.35, wz + (primaryRoom.d * CELL) / 2];
  }, [s, primaryRoom]);
  const camZoom = useMemo(() => {
    /* الملاءمة تُحسب بمقاس **الشاشة** لا بمقاس العالم: بإسقاطٍ آيزومتري
     * تُسقَط غرفةٌ عمقها D وعرضها W على معينٍ عرضه (W+D)/√2 — فالغرفة
     * الطويلة الضيقة تحتاج التصغير نفسه الذي تحتاجه المربعة بالمساحة
     * ذاتها. القسمة على الجذر هي كل الفرق بين ملاءمةٍ صحيحة وأخرى تقطع
     * الغرفة من حافتها. والأرضية ٤٦ تُبقي القفص كبيراً بالتخطيطات
     * الواسعة: لا تُصغَّر الغرفة لتدخل كلها، بل يُبلغ بعيدُها بالسحب. */
    const w = primaryRoom ? primaryRoom.w : 3, d = primaryRoom ? primaryRoom.d : 2;
    const screenSpan = ((w + d) * CELL) / Math.SQRT2;
    return Math.max(46, Math.min(88, 1080 / Math.max(screenSpan, 8)));
  }, [primaryRoom]);
  const zoomBy = (f: number) => {
    playTap();
    // نبضة إطارات: حلقة الرسم «عند الطلب» لا تُنعَش بضغطة زرٍّ خارج الكانفس،
    // فكانت بطاقات النزلاء والتسميات **تتجمّد بمكانها القديم** عند التكبير
    // بالأزرار بينما يتحرّك المشهد تحتها. اكتشفه قياس المقروئية.
    poke();
    const c = ctlRef.current;
    if (!c) return;
    c.object.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.object.zoom * f));
    c.object.updateProjectionMatrix();
    c.update();
  };
  /** رجوع لمنظر الافتتاح: مركز الغرفة الرئيسية + ملاءمة التخطيط الحالي. */
  const resetCam = () => {
    playTap();
    poke();
    const c = ctlRef.current;
    if (!c) return;
    c.target.set(camTarget[0], camTarget[1], camTarget[2]);
    c.object.position.set(camTarget[0] + CAM_OFF[0], camTarget[1] + CAM_OFF[1], camTarget[2] + CAM_OFF[2]);
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

  /* أي تغيّر يمسّ المشهد يشغّل الإطارات ٩٠٠ms: الانتقالات اللونية تُحسب
   * بالتدريج كل إطار، وبحلقة «عند الطلب» بلا هذه النبضة كان اللون يتجمّد
   * بمنتصف الطريق بعد نقل حيوان — أزرق باهت لا هو أحمر ولا أزرق. */
  useEffect(() => { poke(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [s, ops, hoverCage, drag, carrying, detailFor]);

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
      m.set(norm(c.code), [wx, BASE_Y, wz]);
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
      say(`انضاف القفص ${cage.code} — كمّل بناء، ورقمه ولونه بضغطة عليه`);
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

  /* تسميات بمساحة الشاشة — أسماء الغرف على لافتات أبوابها، وأرقام الأقفاص عند
   * مقدّمة كل قفص (تحت بطاقة النزيل فلا تتزاحمان). الحجم بالبكسل ثابت فتُقرأ
   * عند أي تكبير — انظر LabelLayer ودراسة المقروئية. */
  const labelNodes: LabelNodes = useRef(new Map<string, HTMLDivElement | null>());
  const labels: LabelSpec[] = useMemo(() => {
    const out: LabelSpec[] = [];
    for (const r of s.rooms) {
      const inR = s.cages.filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d);
      const [wx, wz] = cornerWorld(s, r.x, r.z);
      out.push({
        id: `room:${r.id}`, kind: "room", text: r.name,
        sub: inR.length ? `${formatNum(inR.filter((c) => occOf(c.code)).length)}/${formatNum(inR.length)}` : undefined,
        // على مركز لوح السياج الخلفي نفسه — فتُقرأ التسميةُ نصَّ اللافتة
        // الفيزيائية لا رقاقةً سابحة فوقها.
        world: [wx + (r.w * CELL) / 2, SIGN_TOP, wz + 0.62],
      });
    }
    /* لا أرقام عائمة بعد اليوم: رقم القفص لافتةٌ مرسومة على جسمه نفسه
     * (CageUnit) — كما طلب المالك حرفياً. تسميات الغرف وحدها تبقى فوقية. */
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, occOf]);
  /* نبض الجرعة المستحقّة يحتاج إطارات مستمرة — لكنه نادر، فلا يُبقي الحلقة
   * دائرةً إلا وهو موجود فعلاً. */
  const anyDose = stays.some((c) => occOf(c.code)?.doseDue);
  const liveFrames = interacting || !!drag || !!carrying || build || !!hoverCage || anyDose;
  const selCage = build && s.selected ? s.cages.find((c) => c.code === s.selected) : null;
  const editRoom = roomEdit ? s.rooms.find((r) => r.id === roomEdit) : null;
  const canBuild = can("manageSettings");

  return (
    <div className="fixed inset-0 z-50" style={{ background: NIGHT.bg }} dir="rtl">
      <Canvas
        shadows={!low}
        dpr={low ? 1 : [1, 1.75]}
        gl={{ antialias: !low, powerPreference: "high-performance" }}
        frameloop={liveFrames ? "always" : "demand"}
        onPointerDown={poke} onWheel={poke}
      >
        <Suspense fallback={null}>
          <Scene s={s} occOf={occOf} drag={drag} carrySource={carrySource} hoverCage={hoverCage}
            arrivedRef={arrivedRef} camZoom={camZoom} camTarget={camTarget} ctlRef={ctlRef} labels={labels} labelNodes={labelNodes}
            setHoverCage={setHoverCage} onCardDown={onCardDown}
            onReturned={() => setDrag(null)} onTapCage={onTapCage} onPickCell={onPickCell} />
        </Suspense>
      </Canvas>
      <LabelOverlay labels={labels} nodes={labelNodes} />

      {/* العنوان + مبدّل الوضعين + رجوع */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-lg font-black" style={{ color: NIGHT.ink }}>لوحة تحكم الأقفاص المتقدمة — عيادة doctorVet</h1>
          <p className="mt-0.5 text-xs font-bold" style={{ color: "#8fa8bd" }}>
            {build
              ? "وضع البناء: اضغط خلية خضراء = قفص جديد · اضغط القفص لرقمه ولونه · وعدّل أي غرفة من أزرار ✏️ تحت"
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
          {/* الرجوع لعرض البطاقات — الافتراضي الجديد؛ المجسّم خيارُ من يحبه */}
          {onBoard && (
            <button type="button" data-toboard onClick={() => { playTap(); onBoard(); }}
              className="pointer-events-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-extrabold transition"
              style={{ background: "#0e1a2e", color: "#c9f4d8", border: "1px solid #14532d" }}>
              {i18n.t("cages.toBoard", "عرض البطاقات")}
            </button>
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
        <div data-panel3d className="pointer-events-auto absolute top-20 start-4 z-30 hidden w-56 rounded-2xl p-3 sm:start-6 sm:block" style={glass()}>
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
        <div data-move3d className="absolute inset-x-0 bottom-16 z-30 flex justify-center px-4">
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
      <div className="absolute end-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1.5 sm:end-6">
        {/* الجودة: تلقائي ← عالية ← خفيفة. الجهاز الضعيف يُكتشف وحده، والزر
            موجود لأن الكشف التلقائي يخطئ أحياناً — والطبيب أدرى بجهازه. */}
        <button type="button" data-q3d
          onClick={() => { playTap(); const next: Tier = getTier() === "auto" ? "light" : getTier() === "light" ? "high" : "auto"; setTier(next); }}
          aria-label="جودة العرض"
          title={tier === "auto" ? "الجودة: تلقائي" : tier === "light" ? "الجودة: خفيفة (أسلس على الأجهزة الضعيفة)" : "الجودة: عالية"}
          className="grid h-10 w-10 place-items-center rounded-xl text-[10px] font-black transition active:scale-95"
          style={{ ...glass(), color: low ? "#f59e0b" : "#9fdcef" }}>
          {tier === "auto" ? "تلقا" : tier === "light" ? "خفيف" : "عالي"}
        </button>
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
          className="absolute bottom-16 end-4 z-30 inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-xs font-black sm:end-6"
          style={{ background: "#22d3ee", color: "#04222b", boxShadow: "0 0 24px #22d3ee55" }}>
          <UserPlus size={15} /> إسكان حيوان
        </button>
      )}

      {/* حوار الإسكان */}
      {picker && (
        <div className="absolute inset-0 z-40 grid place-items-center p-4" style={{ background: "#00000088" }}
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
        <div data-builder3d className="absolute bottom-16 start-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl p-2"
          style={{ ...glass(), insetInlineStart: "50%", transform: "translateX(50%)" }}>
          <div data-newcage
            onPointerDown={(e) => { e.preventDefault(); lastPtr.x = e.clientX; lastPtr.y = e.clientY; playTap(); placing.current = true; document.body.style.cursor = "copy"; }}
            className="flex cursor-grab select-none items-center gap-2 rounded-xl border border-dashed px-3 py-2"
            style={{ borderColor: "#4ade8088", color: "#4ade80", touchAction: "none" }}>
            <Plus size={14} />
            <span className="text-[11px] font-extrabold">قفص جديد — اضغط خلية خضراء أو اسحبني</span>
          </div>
          <button type="button" onClick={() => { playTap(); setRoomName(""); setRoomDialog(true); }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold"
            style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
            <Plus size={13} /> غرفة جديدة
          </button>
          {/* تعديل الغرف من هنا (اسم، ترقيم، لون، حذف) — لا من لافتاتها */}
          <div className="flex items-center gap-1.5 overflow-x-auto" style={{ maxWidth: "38vw" }}>
            {s.rooms.map((r) => (
              <button key={r.id} type="button" data-roomchip={r.name}
                onClick={() => { playTap(); setRoomEdit(r.id); setRenumBase(""); }}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[11px] font-extrabold"
                style={roomEdit === r.id
                  ? { background: "#22d3ee", color: "#04222b" }
                  : { background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
                ✏️ {r.name}
              </button>
            ))}
          </div>
          <span className="px-1 text-[10px] font-bold" style={{ color: "#64809c" }}>
            {formatNum(s.rooms.length)} غرف · {formatNum(s.cages.length)} قفص
          </span>
        </div>
      )}

      {/* وضع البناء: لوح خصائص القفص — الرقم يُحفظ وحده (Enter أو مغادرة الحقل) */}
      {selCage && (
        <div data-props3d className="absolute top-20 start-4 z-30 w-56 rounded-2xl p-3 sm:start-6" style={glass()}>
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
          {/* لا مُنتقي ألوان: اللون صار معنى لا زينة — أحمر فاضٍ وأزرق ممتلئ. */}
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
        <div data-roomedit3d className="absolute top-20 end-4 z-30 w-60 rounded-2xl p-3 sm:end-6" style={glass()}>
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
        <div className="absolute inset-0 z-40 grid place-items-center" style={{ background: "#00000088" }}
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
        <div data-detail3d className="absolute bottom-24 start-4 z-30 w-60 rounded-2xl p-3 sm:start-6"
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
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-40 flex justify-center px-4"
        style={{ opacity: note ? 1 : 0, transform: `translateY(${note ? 0 : 8}px)`, transition: "all .25s ease" }}>
        {note && (
          <span data-note3d className="rounded-full px-4 py-2 text-xs font-extrabold"
            style={{ background: "#0e1a2ef2", color: "#c8f4e4", border: "1px solid #14532d" }}>
            {note}
          </span>
        )}
      </div>

      {!build && !carrying && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-3 p-4 sm:p-6">
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
        <div className="absolute inset-0 z-50 grid place-items-center p-4" style={{ background: "#000000a6" }}
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
