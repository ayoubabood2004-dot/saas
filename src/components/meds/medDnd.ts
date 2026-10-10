import { pointerWithin, closestCenter, type Active, type CollisionDetection, type DragEndEvent, type Over } from "@dnd-kit/core";
import { planDrop, type MedItem } from "@/lib/medIndex";
import type { ClinicDrugOp } from "@/types";

/* ============================================================================
 * السحبُ إلى «أدويتي» — أين أُفلت، وماذا يعني الإفلات. بلا React (يقوده فحصُ node بـdnd-kit
 * الحقيقيّ).
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * كان الاصطدامُ «المؤشّرُ داخل هدف، وإلا الأقرب» (`closestCenter` احتياطاً). والأقربُ لا يكون
 * فارغاً أبداً ما دام بالشاشة هدفٌ واحد — والرفُّ «★ أدويتي» واللوحةُ وشريطُ الإفلات حاضرةٌ
 * دائماً. فكلُّ سحبٍ يُفلت **أينما** أُفلت صار عمليةً على قائمة العيادة: إصبعٌ استراح ٢٠٠ms على
 * بلاطةٍ ثم رُفع (أو توقّف ثم مرّر) كتب الدواءَ بـ«أدويتي» لكلّ أطباء العيادة أو أعاد ترتيبها،
 * والدواءُ الذي قُصد لم يُختر. لا موضعَ إفلاتٍ يلغي، وEscape لا يوجد بالهاتف.
 *
 * الآن: الإفلاتُ يُحسب **حيث الإصبع** وحده — خارج الأهداف ⇒ لا شيء يُكتب. والأقربُ يبقى
 * للكيبورد وحده (لا إحداثيات مؤشّر). وضغطةٌ مطوّلةٌ بلا حركة ثم رفعٌ خارج الأهداف = ضغطة:
 * تختار الدواء كما قصدت اليد.
 * ==========================================================================*/

export type DragData = { kind: "tile"; item: MedItem; via?: "recent" } | { kind: "row"; item: MedItem };
export type DropData = { kind: "slot"; id: string } | { kind: "end" };

/** الهدفُ تحت المؤشّر وحده؛ والأقربُ للكيبورد وحده (لا مؤشّرَ له) — لا «أقربَ» يكتب عن إفلاتٍ بالفراغ. */
export const medCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

/** موضعُ الإدراج من هدف الإفلات: صفٌّ ⇒ قبله أو بعده بحسب النصف الذي فوقه المسحوب، وغيرُه ⇒ آخرُها. */
export function dropIndex(mineIds: readonly string[], active: Active, over: Over | null): number | null | undefined {
  if (!over) return undefined;
  const d = over.data.current as DropData | undefined;
  if (!d) return undefined;
  if (d.kind === "end") return null;
  const i = mineIds.indexOf(d.id);
  if (i < 0) return null;
  const r = active.rect.current.translated;
  const mid = over.rect.top + over.rect.height / 2;
  const center = r ? r.top + r.height / 2 : mid;
  return center > mid ? i + 1 : i;
}

/** عمليةُ الإفلات أو لا شيء — مرآةُ planDrop بأدوات dnd-kit. */
export function dropOp(mineIds: readonly string[], e: Pick<DragEndEvent, "active" | "over">, newId: () => string): ClinicDrugOp | null {
  const data = e.active.data.current as DragData | undefined;
  if (!data) return null;
  const at = dropIndex(mineIds, e.active, e.over);
  if (at === undefined) return null;
  const it = data.item;
  return planDrop(mineIds, { id: it.drugId ?? newId(), name: it.name, family: it.family, inMine: it.inMine && !!it.drugId }, at);
}

/** تسامحُ الضغط المطوَّل (TouchSensor) — حركةٌ أقلّ منه ضغطةٌ لا سحب. */
export const TOUCH_TOLERANCE = 8;

/** إصبعٌ ضُغط مطوّلاً ورُفع بلا حركة: نيّتُه «اختر» — الفأرةُ لا تبدأ سحباً بلا حركة أصلاً. */
export function isStillPress(activator: Event | null | undefined, delta: { x: number; y: number }): boolean {
  const touch = !!activator && typeof (activator as { touches?: unknown }).touches === "object";
  return touch && Math.hypot(delta.x, delta.y) < TOUCH_TOLERANCE;
}
