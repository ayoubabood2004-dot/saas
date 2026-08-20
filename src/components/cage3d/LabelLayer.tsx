import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { FREE, OCCUPIED, NIGHT } from "./neon";

/* ============================================================================
 * LabelLayer — طبقة التسميات بمساحة الشاشة.
 *
 * ── لماذا وُجدت ───────────────────────────────────────────────────────────
 * كل نصوص المشهد كانت مرسومةً **داخل الأجسام** (نسيجٌ على لوح)، فحجمها مربوط
 * بحجم العالم: كلما أبعد الطبيب تقلّص النص معه. القياس الفعلي على آيباد
 * ١١٩٤×٨٣٤ عند التكبير الافتراضي (٤٢): ارتفاع رقم القفص **٦ بكسل** — غير
 * مقروء. وليقرأه كان عليه التكبير إلى ١٠٣ (×٢٫٤٦)، وعندها تنكمش مساحة الأرضية
 * المرئية **ستة أضعاف**: يخسر نظرة الغرفة كلها مقابل رقمٍ واحد.
 *
 * والعلّة هندسية لا فنية: بكاميرا المنظر الإيزومتري تُسقَط الوحدة العالمية
 * الرأسية على ٣٥ بكسل، والأفقية على ١٧ فقط. ونصّ اللوحة ارتفاعه ٠٫١٥٢ وحدة
 * ⇒ ٥٫٣ بكسل. أي حلٍّ يبقي النص داخل العالم يظلّ رهينةَ التكبير.
 *
 * ── المبدأ ────────────────────────────────────────────────────────────────
 * ما تفعله خرائط العالم: **الأجسام تتقلّص، والتسميات لا**. التسمية هنا نصُّ
 * DOM بحجم بكسل ثابت، يُسقَط موضعه من العالم كل إطار — فيُقرأ عند أي تكبير.
 *
 * وثلاثة قيود تمنع الحلّ من أن ينقلب فوضى:
 *   ١) تكبير دلالي: البعيد لا يحتاج أرقام أقفاصٍ ستتكدّس، بل أسماء غرفٍ
 *      وعدّاد إشغال. الأرقام تظهر عند الاقتراب، وأسماء النزلاء عند القرب.
 *   ٢) منع التصادم بالأولوية: الغرفة أولاً، ثم القفص المشغول، ثم الفارغ.
 *      المتراكب يُخفى — «حساء التسميات» أسوأ من غيابها.
 *   ٣) حاوٍ واحد ومرور واحد: لا مكوّن DOM ثلاثي الأبعاد لكل قفص. التحديث
 *      يكتب `transform` على عقدٍ جاهزة، ويُتخطّى كلياً إن لم تتحرّك الكاميرا.
 *
 * الطبقة نصفان عمداً: `LabelOverlay` يرسم العُقد **خارج** الكانفس (فمصالحُ
 * React الثلاثي لا يحاول تفسير <div> كجسمٍ مجسّم)، و`LabelPositioner` يعيش
 * **داخله** ليقرأ الكاميرا كل إطار ويكتب مواضعها. خريطة العُقد تربطهما.
 * ==========================================================================*/

export interface LabelSpec {
  id: string;
  kind: "cage" | "room";
  text: string;
  /** سطر ثانٍ صغير — عدّاد إشغال الغرفة مثلاً. */
  sub?: string;
  world: [number, number, number];
  occupied?: boolean;
}

/** عتبات التكبير الدلالي — مقيسة على المشهد الحقيقي لا مخمّنة. */
export const LOD_CAGE_ZOOM = 30;   // دونها: أسماء الغرف وحدها

const PAD = 3;      // هامش حول صندوق التسمية عند فحص التصادم
const cmp = (a: Placed, b: Placed) => a.pri - b.pri;

interface Placed { pri: number; x: number; y: number; w: number; h: number; i: number }

/** خريطة العُقد المشتركة بين النصفين — المفتاح معرّف التسمية. */
export type LabelNodes = React.MutableRefObject<Map<string, HTMLDivElement | null>>;

/** النصف المرئي — يُركَّب **خارج** الكانفس فوقه مباشرة. */
export function LabelOverlay({ labels, nodes }: { labels: LabelSpec[]; nodes: LabelNodes }) {
  return (
    <div data-labels3d style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 20 }}>
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(n) => { nodes.current.set(l.id, n); }}
          data-label3d={l.id}
          data-labelkind={l.kind}
          style={{
            position: "absolute", top: 0, left: 0, display: "none",
            direction: "rtl", whiteSpace: "nowrap", userSelect: "none",
            willChange: "transform",
            ...(l.kind === "room"
              ? {
                background: "#0b1725f2", border: "1px solid #2c4b6b", borderRadius: 12,
                padding: "5px 12px", boxShadow: "0 6px 18px #0009",
              }
              : {
                background: "#0b1725f2",
                border: `2px solid ${l.occupied ? OCCUPIED : FREE}`,
                borderRadius: 9, padding: "2px 8px",
                boxShadow: `0 0 10px ${(l.occupied ? OCCUPIED : FREE)}55, 0 3px 8px #0009`,
              }),
          }}
        >
          {l.kind === "room" ? (
            <span style={{ display: "grid", justifyItems: "center", lineHeight: 1.15 }}>
              <b style={{ color: NIGHT.ink, fontSize: 16, fontWeight: 900 }}>{l.text}</b>
              {l.sub && <i style={{ color: "#9fb6cc", fontSize: 12, fontWeight: 800, fontStyle: "normal" }}>{l.sub}</i>}
            </span>
          ) : (
            <b style={{
              color: NIGHT.ink, fontSize: 13, fontWeight: 900,
              fontVariantNumeric: "tabular-nums", letterSpacing: 0.2,
            }}>{l.text}</b>
          )}
        </div>
      ))}
    </div>
  );
}

/** النصف الحاسب — يعيش **داخل** الكانفس ليقرأ الكاميرا كل إطار. */
export function LabelPositioner({ labels, nodes, hiddenFor }: {
  labels: LabelSpec[];
  nodes: LabelNodes;
  /** رمز قفصٍ تُخفى تسميته (المحمول أثناء النقل مثلاً). */
  hiddenFor?: string | null;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const v = useMemo(() => new Vector3(), []);
  /** آخر حالة كاميرا حُسبت بها — بلا تغيّرٍ لا نعيد الحساب أصلاً. */
  const last = useMemo(() => ({ z: -1, x: 0, y: 0, n: -1, hidden: "" }), []);

  useFrame(() => {
    const el = gl.domElement;
    const W = el.clientWidth, H = el.clientHeight;
    const zoom = (camera as unknown as { zoom?: number }).zoom ?? 1;
    const key = hiddenFor ?? "";
    if (last.z === zoom && last.x === camera.position.x && last.y === camera.position.z
      && last.n === labels.length && last.hidden === key) return;
    last.z = zoom; last.x = camera.position.x; last.y = camera.position.z;
    last.n = labels.length; last.hidden = key;

    const showCages = zoom >= LOD_CAGE_ZOOM;
    const boxes: Placed[] = [];
    // ترتيب الأولوية: الغرفة (٠) ثم القفص المشغول (١) ثم الفارغ (٢).
    const order = labels
      .map((l, i) => ({ i, pri: l.kind === "room" ? 0 : l.occupied ? 1 : 2, x: 0, y: 0, w: 0, h: 0 }))
      .sort(cmp);

    for (const o of order) {
      const l = labels[o.i];
      const node = nodes.current.get(l.id);
      if (!node) continue;
      if (l.kind === "cage" && (!showCages || l.id === hiddenFor)) { node.style.display = "none"; continue; }

      v.set(l.world[0], l.world[1], l.world[2]).project(camera);
      const sx = (v.x * 0.5 + 0.5) * W;
      const sy = (-v.y * 0.5 + 0.5) * H;
      // خارج الشاشة → لا يُرسم ولا يزاحم غيره على المساحة.
      if (sx < -80 || sx > W + 80 || sy < -60 || sy > H + 60) { node.style.display = "none"; continue; }

      // القياس يحتاج العقدة ظاهرة؛ نُظهرها ثم نقرّر.
      const prev = node.style.display;
      if (prev === "none") node.style.display = "";
      const w = node.offsetWidth || 40, h = node.offsetHeight || 18;
      const x = sx - w / 2, y = sy - h / 2;
      const hit = boxes.some((b) =>
        x < b.x + b.w + PAD && x + w + PAD > b.x && y < b.y + b.h + PAD && y + h + PAD > b.y);
      if (hit) { node.style.display = "none"; continue; }
      boxes.push({ pri: o.pri, x, y, w, h, i: o.i });
      node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }
  });

  return null;
}
