import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronsUp, GripVertical, Star } from "lucide-react";
import { cn, formatNum } from "@/lib/utils";
import type { MedItem } from "@/lib/medIndex";
import type { ClinicDrugOp } from "@/types";
import { dropIndex, dropOp, medCollision, TOUCH_TOLERANCE, type DragData, type DropData } from "./medDnd";

/* ============================================================================
 * «أدويتي» — القائمةُ المرتّبة، بالمنتقي وبالإعدادات.
 *
 * صفوفٌ عموديّة بـ٥٦px: [مقبض ٤٤px] [الاسم + العائلة] [★]. السحبُ من المقبض وحده
 * (`setActivatorNodeRef`) — فالإصبعُ على الاسم يختار ولا يسحب، والتمريرُ بالإصبع يبقى
 * يعمل. والمقبضُ نفسُه يحمل الأسهم (↑/↓) فمن لا يسحب يرتّب بالكيبورد، والإعلانُ بالعربية
 * بالاسم والمكان. وبالإعدادات ↑/↓ و«لفوق» أزرارٌ ظاهرة — البابُ الذي يعمل دائماً.
 *
 * والإفلاتُ يمرّ من `planDrop` وحده: عمليةٌ واحدة، ولا `put` ثانٍ لما بـ«أدويتي».
 * ==========================================================================*/

/** الفأرةُ واللمسُ وحدهما يبدآن سحبَ بلاطة — Space/Enter عليها تعني «اختر» لا «ارفع». */
export function pressOnly(listeners: ReturnType<typeof useDraggable>["listeners"]) {
  return {
    onMouseDown: listeners?.onMouseDown as React.MouseEventHandler<HTMLButtonElement> | undefined,
    onTouchStart: listeners?.onTouchStart as React.TouchEventHandler<HTMLButtonElement> | undefined,
  };
}

export function useMedSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // ضغطٌ مطوَّل ٢٠٠ms: التمريرُ السريع بالإصبع يبقى تمريراً لا سحباً. والإفلاتُ خارج هدفٍ
    // لا يكتب شيئاً (medCollision) — فالضغطةُ البطيئة لا تصير كتابةً بقائمة العيادة.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: TOUCH_TOLERANCE } }),
  );
}

interface BoardProps {
  items: MedItem[];
  mode: "pick" | "manage";
  readOnly?: boolean;
  /** صفٌّ يُسحب الآن (يبهت مكانه). */
  draggingId?: string | null;
  /** مكانُ الإفلات المتوقَّع: قبل هذا الصفّ أو بعده. */
  hint?: { id: string; after: boolean } | null;
  onTap?(it: MedItem): void;
  /** بوضع multi: الصفُّ المختار يُرى مختاراً — الضغطةُ الثانية تشيله، فلا تُضغط وهي عمياء. */
  isSelected?(it: MedItem): boolean;
  onUnstar(it: MedItem): void;
  onMove(it: MedItem, after: string | null): void;
  announce(msg: string): void;
  empty?: ReactNode;
}

export function MyMedsBoard({ items, mode, readOnly, draggingId, hint, onTap, isSelected, onUnstar, onMove, announce, empty }: BoardProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `mine-${mode}-end`, data: { kind: "end" } satisfies DropData });
  const ids = items.map((x) => x.drugId as string);
  const moveTo = (it: MedItem, to: number) => {
    const from = ids.indexOf(it.drugId as string);
    if (readOnly || to < 0 || to >= ids.length || to === from) return;
    const rest = ids.filter((x) => x !== it.drugId);
    onMove(it, to === 0 ? null : rest[to - 1]);
    announce(t("mymeds.annPos", { name: it.label, pos: formatNum(to + 1), total: formatNum(ids.length), defaultValue: "{{name}} بالمكان {{pos}} من {{total}}" }));
  };
  return (
    <div ref={setNodeRef} data-mymeds-board={mode} className={cn("space-y-1.5 rounded-2xl transition", isOver && "bg-brand-50/70 ring-2 ring-brand-400 dark:bg-brand-500/10")}>
      {items.length === 0 ? empty : items.map((it, i) => (
        <Row key={it.drugId} it={it} index={i} total={items.length} mode={mode} readOnly={readOnly}
          fading={draggingId === it.drugId} selected={mode === "pick" && !!isSelected?.(it)}
          hint={hint && hint.id === it.drugId ? (hint.after ? "after" : "before") : null}
          onTap={onTap} onUnstar={onUnstar} moveTo={moveTo} />
      ))}
    </div>
  );
}

function Row({ it, index, total, mode, readOnly, fading, selected, hint, onTap, onUnstar, moveTo }: {
  it: MedItem; index: number; total: number; mode: "pick" | "manage"; readOnly?: boolean; fading: boolean; selected: boolean;
  hint: "before" | "after" | null;
  onTap?(it: MedItem): void; onUnstar(it: MedItem): void; moveTo(it: MedItem, to: number): void;
}) {
  const { t } = useTranslation();
  const drag = useDraggable({ id: `row:${it.drugId}`, data: { kind: "row", item: it } satisfies DragData, disabled: readOnly });
  const drop = useDroppable({ id: `slot:${it.drugId}`, data: { kind: "slot", id: it.drugId as string } satisfies DropData });
  const onGripKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); moveTo(it, index - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveTo(it, index + 1); }
    else if (e.key === "Home") { e.preventDefault(); moveTo(it, 0); }
  };
  /* Alt+↑/↓ على صفٍّ مركَّز (الإعدادات) — بلا لمسِ المقبض. */
  const onRowKey = (e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp") { e.preventDefault(); moveTo(it, index - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveTo(it, index + 1); }
  };
  return (
    <div ref={drop.setNodeRef} className="relative">
      {hint === "before" && <span className="pointer-events-none absolute -top-1 inset-x-2 h-1 rounded-full bg-brand-500" />}
      <div ref={drag.setNodeRef} data-mymed={it.key} data-mymed-pos={index + 1} onKeyDown={mode === "manage" ? onRowKey : undefined}
        tabIndex={mode === "manage" ? 0 : undefined}
        className={cn("flex min-h-14 items-center gap-1 rounded-2xl border pe-1 transition", fading && "opacity-30",
          selected ? "border-success-500 bg-success-50 dark:bg-success-500/10" : "border-line bg-surface-1")}>
        <button type="button" ref={drag.setActivatorNodeRef} {...drag.listeners} {...drag.attributes}
          disabled={readOnly} onKeyDown={onGripKey} data-medgrip
          aria-label={t("mymeds.gripAria", { name: it.label, defaultValue: "اسحب لترتيب {{name}}" })}
          aria-roledescription={t("mymeds.gripRole", "مقبض ترتيب — الأسهم للنقل")}
          className="grid h-14 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-s-2xl text-ink-subtle transition hover:bg-surface-2 hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40">
          <GripVertical size={18} />
        </button>
        <button type="button" onClick={() => onTap?.(it)} className="min-w-0 flex-1 py-1.5 text-start" data-mymed-pick={it.key}
          {...(mode === "pick" ? { "aria-pressed": selected } : {})}>
          <span className="block truncate text-sm font-black text-ink">{it.label}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
            {it.sub && <span className="truncate" dir="auto">{it.sub}</span>}
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5">{t(`mymeds.fam.${it.family}`)}</span>
            {selected && <span className="shrink-0 rounded-full bg-success-700 px-1.5 py-0.5 text-white" data-mymed-added>{t("mymeds.added", "أُضيف ✓")}</span>}
          </span>
        </button>
        {mode === "manage" && (
          <span className="flex shrink-0 items-center">
            <button type="button" disabled={readOnly || index === 0} onClick={() => moveTo(it, 0)} aria-label={t("mymeds.toTop", "لفوق")} title={t("mymeds.toTop", "لفوق")}
              className="grid h-11 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 disabled:opacity-30"><ChevronsUp size={17} /></button>
            <button type="button" disabled={readOnly || index === 0} onClick={() => moveTo(it, index - 1)} aria-label={t("mymeds.up", "فوق")}
              className="grid h-11 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={17} /></button>
            <button type="button" disabled={readOnly || index === total - 1} onClick={() => moveTo(it, index + 1)} aria-label={t("mymeds.down", "جوّه")}
              className="grid h-11 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={17} /></button>
          </span>
        )}
        <button type="button" data-medstar={it.key} aria-pressed disabled={readOnly} onClick={() => onUnstar(it)}
          aria-label={t("mymeds.starOff", "شيله من أدويتي")} title={t("mymeds.starOff", "شيله من أدويتي")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-warn-500 transition hover:bg-surface-2 disabled:opacity-40">
          <Star size={19} fill="currentColor" />
        </button>
      </div>
      {hint === "after" && <span className="pointer-events-none absolute -bottom-1 inset-x-2 h-1 rounded-full bg-brand-500" />}
    </div>
  );
}

/** رأسُ بطاقةٍ مسحوبة — فوق كلّ شيء (z-90) وبـportal: ورقةُ المنتقي مُزاحةٌ بـtransform
 *  فتُحسب الإحداثياتُ غلطاً لو رُسم داخلها. */
export function MedDragOverlay({ item }: { item: MedItem | null }) {
  return createPortal(
    <div className="relative z-[90]">
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }} zIndex={90}>
        {item ? (
          <div className="w-60 rotate-2 rounded-2xl border-2 border-brand-400 bg-surface-1 px-3 py-2.5 shadow-raised">
            <span className="block truncate text-sm font-black text-ink">{item.label}</span>
            {item.sub && <span className="block truncate text-2xs font-semibold text-ink-subtle" dir="auto">{item.sub}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </div>,
    document.body,
  );
}

/** السحبُ بالإعدادات: لوحةُ «أدويتي» وحدها بسياقها — ترتيبٌ بالمقبض والأسهم والأزرار. */
export function MyMedsStandalone(props: Omit<BoardProps, "draggingId" | "hint" | "mode"> & { onOp(op: ClinicDrugOp): void; onLift?(): void }) {
  const { t } = useTranslation();
  const sensors = useMedSensors();
  const [active, setActive] = useState<MedItem | null>(null);
  const [hint, setHint] = useState<{ id: string; after: boolean } | null>(null);
  const ids = props.items.map((x) => x.drugId as string);
  const onStart = (e: DragStartEvent) => { setActive((e.active.data.current as DragData | undefined)?.item ?? null); props.onLift?.(); };
  const onOver = (e: DragOverEvent) => {
    const at = e.over ? dropIndex(ids, e.active, e.over) : undefined;
    if (at == null) { setHint(null); return; }
    setHint(at >= ids.length ? { id: ids[ids.length - 1], after: true } : { id: ids[at], after: false });
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null); setHint(null);
    const op = dropOp(ids, e, () => "");
    if (op) props.onOp(op);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={medCollision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}
      onDragCancel={() => { setActive(null); setHint(null); props.announce(t("mymeds.annCancel", "أُلغي السحب")); }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => t("mymeds.annLift", { name: (active.data.current as DragData | undefined)?.item.label ?? "", defaultValue: "رفعت {{name}}" }),
          onDragOver: () => undefined, onDragEnd: () => undefined,
          onDragCancel: () => t("mymeds.annCancel", "أُلغي السحب"),
        },
        screenReaderInstructions: { draggable: t("mymeds.gripRole", "مقبض ترتيب — الأسهم للنقل") },
      }}>
      <MyMedsBoard {...props} mode="manage" draggingId={active?.drugId ?? null} hint={hint} />
      <MedDragOverlay item={active} />
    </DndContext>
  );
}
