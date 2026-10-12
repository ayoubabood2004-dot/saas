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

export function SortList({ ids, disabled, onMove, row }: {
  ids: string[];
  /** بلا ترتيب (المصوّر، أو أثناء حفظ): لا مقبضَ ولا أسهم. */
  disabled?: boolean;
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
          <SortRow key={id} id={id} index={i} ids={ids} disabled={disabled} dragging={dragging === id} onMove={onMove} row={row} />
        ))}
      </div>
    </DndContext>
  );
}

function SortRow({ id, index, ids, disabled, dragging, onMove, row }: {
  id: string; index: number; ids: string[]; disabled?: boolean; dragging: boolean;
  onMove: (id: string, after: string | null) => void;
  /** المقبضُ (الحاسوب) والأسهمُ (الهاتف) منفصلان: الصفُّ يضعهما حيث يتّسع — سطرٌ ثانٍ بالهاتف. */
  row: (id: string, c: { handle: ReactNode; arrows: ReactNode }) => ReactNode;
}) {
  const { t } = useTranslation();
  const drag = useDraggable({ id, disabled });
  const drop = useDroppable({ id });
  const go = (after: string | null | undefined) => { if (after !== undefined) onMove(id, after); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); go(stepAfter(ids, id, -1)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); go(stepAfter(ids, id, 1)); }
    else if (e.key === "Home") { e.preventDefault(); go(topAfter(ids, id)); }
  };
  const tr = drag.transform;
  const btn = "grid h-9 w-9 place-items-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2 active:scale-95 disabled:opacity-30";
  const handle = disabled ? null : (
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
  const arrows = disabled ? null : (
    <>
      {/* الهاتف: أسهمٌ ظاهرةٌ دائماً */}
      <span className="flex shrink-0 items-center gap-1 sm:hidden" data-sortarrows>
        <button type="button" className={btn} disabled={index === 0} onClick={() => go(stepAfter(ids, id, -1))} aria-label={t("cat.moveUp", "فوق")}><ArrowUp size={15} /></button>
        <button type="button" className={btn} disabled={index === ids.length - 1} onClick={() => go(stepAfter(ids, id, 1))} aria-label={t("cat.moveDown", "جوّه")}><ArrowDown size={15} /></button>
        <button type="button" className={btn} disabled={index === 0} onClick={() => go(topAfter(ids, id))} aria-label={t("cat.moveTop", "لفوق")}><ChevronsUp size={15} /></button>
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
