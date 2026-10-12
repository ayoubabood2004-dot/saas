import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, ChevronsUp, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { dropAfter, SORT_MOUSE_DISTANCE, SORT_TOUCH_DELAY, SORT_TOUCH_TOLERANCE, sortCollision, stepAfter, topAfter } from "@/lib/sortDnd";

/* ============================================================================
 * قائمةٌ تُرتَّب (تصنيفاتُ المتجر، وموادُّ تصنيف) — رفيقةُ «المتجر الإلكتروني».
 *
 * الحاسوب: مقبضٌ يُسحب (عتبةُ ٦ بكسل) ويُفلت **على صفّ** — خارج الصفوف لا شيءَ يُكتب
 * (sortDnd)، والمقبضُ نفسُه يحمل ↑/↓ وHome للكيبورد. الهاتف: ↑ ↓ «لفوق» ظاهرةٌ دائماً — البابُ
 * الذي يعمل بلا سحب. وكلُّ نقلٍ عمليةٌ نسبيّة واحدة (`after`) يحسب الخادمُ موضعَها.
 * ==========================================================================*/

export function SortList({ ids, readOnly, busy, onMove, row }: {
  ids: string[];
  /**
   * بلا **حقّ** الترتيب (المصوّر): لا مقبضَ ولا أسهم. والحقُّ وحده يُخفيها — لا الحفظُ الجاري: كانت
   * تختفي ما دام الحفظُ بالطريق (`disabled={!canEdit || busy}`)، فيقفز سطرُ الأدوات بالهاتف إلى مكانها
   * ويقع «…» (تعديل ← «شيل التصنيف…») تحت ↓ بالضبط — والضغطةُ الثانية تفتح النافذةَ بدل أن تنقل (قيس
   * بـ٣٧٥: ما تحت الإصبع «جوّه» ← «تعديل» ← «جوّه»).
   */
  readOnly?: boolean;
  /** حفظٌ بالطريق: الأسهمُ والمقبضُ **بمكانها معطَّلة** — ضغطةٌ ثانيةٌ سريعة لا تقع على زرٍّ آخر، ولا على
   *  سهم الصفّ الذي صعد مكانَ المنقول (فيرجعه). */
  busy?: boolean;
  onMove: (id: string, after: string | null) => void;
  /** المقبضُ (الحاسوب) والأسهمُ (الهاتف) منفصلان: الصفُّ يضعهما حيث يتّسع — سطرٌ ثانٍ بالهاتف. */
  row: (id: string, c: { handle: ReactNode; arrows: ReactNode }) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: SORT_MOUSE_DISTANCE } }),
    useSensor(TouchSensor, { activationConstraint: { delay: SORT_TOUCH_DELAY, tolerance: SORT_TOUCH_TOLERANCE } }),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const after = dropAfter(ids, e.active, e.over);
    if (after !== undefined) onMove(String(e.active.id), after);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={sortCollision}
      onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onEnd}>
      <div className="space-y-2" data-sortlist>
        {ids.map((id, i) => (
          <SortRow key={id} id={id} index={i} ids={ids} readOnly={readOnly} busy={busy} dragging={dragging === id} onMove={onMove} row={row} />
        ))}
      </div>
    </DndContext>
  );
}

function SortRow({ id, index, ids, readOnly, busy, dragging, onMove, row }: {
  id: string; index: number; ids: string[]; readOnly?: boolean; busy?: boolean; dragging: boolean;
  onMove: (id: string, after: string | null) => void;
  /** المقبضُ (الحاسوب) والأسهمُ (الهاتف) منفصلان: الصفُّ يضعهما حيث يتّسع — سطرٌ ثانٍ بالهاتف. */
  row: (id: string, c: { handle: ReactNode; arrows: ReactNode }) => ReactNode;
}) {
  const { t } = useTranslation();
  const drag = useDraggable({ id, disabled: readOnly || busy });
  const drop = useDroppable({ id });
  const go = (after: string | null | undefined) => { if (after !== undefined && !busy) onMove(id, after); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); go(stepAfter(ids, id, -1)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); go(stepAfter(ids, id, 1)); }
    else if (e.key === "Home") { e.preventDefault(); go(topAfter(ids, id)); }
  };
  const tr = drag.transform;
  const btn = "grid h-9 w-9 place-items-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2 active:scale-95 disabled:opacity-30";
  const handle = readOnly ? null : (
    <>
      {/* الحاسوب: مقبضٌ يُسحب ويُرتَّب بالأسهم */}
      <button type="button" ref={drag.setActivatorNodeRef} {...drag.attributes}
        onMouseDown={drag.listeners?.onMouseDown as React.MouseEventHandler<HTMLButtonElement> | undefined}
        onTouchStart={drag.listeners?.onTouchStart as React.TouchEventHandler<HTMLButtonElement> | undefined}
        onKeyDown={onKey} data-sorthandle
        aria-label={t("cat.dragHandle", "اسحب للترتيب — أو استعمل الأسهم ↑ ↓")}
        className="hidden h-9 w-7 shrink-0 cursor-grab place-items-center rounded-lg text-ink-subtle hover:bg-surface-2 active:cursor-grabbing sm:grid">
        <GripVertical size={16} />
      </button>
    </>
  );
  const arrows = readOnly ? null : (
    <>
      {/* الهاتف: أسهمٌ ظاهرةٌ دائماً */}
      <span className="flex shrink-0 items-center gap-1 sm:hidden" data-sortarrows aria-busy={busy || undefined}>
        <button type="button" className={btn} disabled={busy || index === 0} onClick={() => go(stepAfter(ids, id, -1))} aria-label={t("cat.moveUp", "فوق")}><ArrowUp size={15} /></button>
        <button type="button" className={btn} disabled={busy || index === ids.length - 1} onClick={() => go(stepAfter(ids, id, 1))} aria-label={t("cat.moveDown", "جوّه")}><ArrowDown size={15} /></button>
        <button type="button" className={btn} disabled={busy || index === 0} onClick={() => go(topAfter(ids, id))} aria-label={t("cat.moveTop", "لفوق")}><ChevronsUp size={15} /></button>
      </span>
    </>
  );
  return (
    <div ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      style={tr ? { transform: `translate3d(${tr.x}px, ${tr.y}px, 0)` } : undefined}
      className={cn("relative rounded-2xl transition-shadow", dragging && "z-10 shadow-raised ring-2 ring-brand-400",
        drop.isOver && !dragging && "ring-2 ring-brand-300")}>
      {row(id, { handle, arrows })}
    </div>
  );
}
