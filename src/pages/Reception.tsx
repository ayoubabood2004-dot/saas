import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  CalendarDays, Stethoscope, BedDouble, CalendarClock, LogOut, Plus, HeartPulse,
  ChevronRight, ChevronLeft, LayoutGrid, Columns3, GripVertical,
} from "lucide-react";
import type { Admission, Pet } from "@/types";
import { opsStore } from "@/lib/opsStore";
import { PetAvatar } from "@/components/PetAvatar";
import { Button, useToast } from "@/components/ui";
import { cn, localISO } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { useAuth } from "@/contexts/AuthContext";

/* ============================================================================
 * التقويم الرئيسي — Operational Operations Calendar.
 *
 * Not a booking tool: it manages the clinic's live medical cases + boarding
 * (الفندقة) as draggable cards. Two views share one DnD engine:
 *   • Monthly grid — drag a pet between days to reschedule the stay (admitted_on).
 *   • Daily kanban — drag a pet between status columns (care ⇄ boarding ⇄ …).
 * Every drop updates local state instantly (buttery), then fires the Supabase
 * UPDATE in the background (revert on failure). Clicking any card opens the
 * pet's unified medical record (الطبلة). RTL-first, premium status colours.
 * ==========================================================================*/

type OpStatus = "scheduled" | "care" | "careBoarding" | "boarding" | "done";

/** The kanban columns, in reading order (RTL flips them visually). */
const COLUMN_ORDER: OpStatus[] = ["scheduled", "care", "careBoarding", "boarding", "done"];

const STATUS_META: Record<OpStatus, {
  key: string; def: string; icon: typeof Stethoscope;
  head: string; dot: string; card: string; over: string; chip: string;
}> = {
  scheduled: {
    key: "reception.schedBoarding", def: "حجوزات الفندقة", icon: CalendarClock,
    head: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    dot: "bg-violet-500",
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-500/30 dark:bg-violet-500/10",
    over: "ring-violet-400/70 bg-violet-50/80 dark:bg-violet-500/10",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  },
  care: {
    key: "reception.care", def: "تحت الرعاية الطبية", icon: Stethoscope,
    head: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    dot: "bg-amber-500",
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10",
    over: "ring-amber-400/70 bg-amber-50/80 dark:bg-amber-500/10",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  },
  careBoarding: {
    key: "reception.careBoarding", def: "الفندقة العلاجية", icon: HeartPulse,
    head: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    dot: "bg-rose-500",
    card: "border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10",
    over: "ring-rose-400/70 bg-rose-50/80 dark:bg-rose-500/10",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  },
  boarding: {
    key: "reception.boarding", def: "الفندقة", icon: BedDouble,
    head: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    dot: "bg-sky-500",
    card: "border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10",
    over: "ring-sky-400/70 bg-sky-50/80 dark:bg-sky-500/10",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  },
  done: {
    key: "reception.doneLeft", def: "مكتملة / غادرت", icon: LogOut,
    head: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200",
    dot: "bg-success-500",
    card: "border-success-200 bg-success-50/60 dark:border-success-500/30 dark:bg-success-500/10",
    over: "ring-success-400/70 bg-success-50/80 dark:bg-success-500/10",
    chip: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200",
  },
};

const AR_WEEKDAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const dayNumber = (admittedOn: string): number => {
  const t = new Date(admittedOn + "T00:00:00").getTime();
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
};
const arDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("ar-EG-u-nu-latn", { day: "2-digit", month: "long" });
const arMonthYear = (d: Date) => d.toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });

/** Six-week matrix covering the cursor's month, weeks starting Saturday. */
function monthMatrix(cursor: Date): Date[][] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startIdx = (first.getDay() + 1) % 7; // Sat=0 … Fri=6
  const cur = new Date(first.getFullYear(), first.getMonth(), 1 - startIdx);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}

export function Reception() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const todayISO = localISO();

  // The shared, synchronous ops cache — the SAME source-of-truth the New Case modal
  // and the drag-and-drop both write through. Seeded from the snapshot instantly (so a
  // just-registered walk-in is already here with no flicker), then reconciled via hydrate.
  const [ops, setOps] = useState(() => opsStore.get());
  const [view, setView] = useState<"month" | "day">("day");
  const [cursor, setCursor] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const admissions = ops.admissions;
  const pets = ops.pets;
  const loading = !ops.hydrated;

  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    void opsStore.hydrate(user?.clinic_id ?? user?.id).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusOf = (a: Admission): OpStatus => {
    if (a.status === "discharged") return "done";
    if (a.kind === "treatment") return "care";
    if (a.kind === "treatment_boarding") return "careBoarding";
    return (a.admitted_on || "") > todayISO ? "scheduled" : "boarding";
  };

  const byStatus = useMemo(() => {
    const m: Record<OpStatus, Admission[]> = { scheduled: [], care: [], careBoarding: [], boarding: [], done: [] };
    for (const a of admissions) m[statusOf(a)].push(a);
    // Newest admitted first within a column (done can be long — cap the tail visually only).
    for (const k of COLUMN_ORDER) m[k].sort((a, b) => (b.admitted_on || "").localeCompare(a.admitted_on || ""));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissions, todayISO]);

  const byDay = useMemo(() => {
    const m = new Map<string, Admission[]>();
    for (const a of admissions) {
      const d = a.admitted_on;
      if (!d) continue;
      const arr = m.get(d) ?? [];
      arr.push(a);
      m.set(d, arr);
    }
    return m;
  }, [admissions]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const patchForStatus = (target: OpStatus): Partial<Admission> => {
    const tomorrow = localISO(new Date(Date.now() + 86400000));
    switch (target) {
      case "care": return { kind: "treatment", status: "active", discharged_on: null };
      case "careBoarding": return { kind: "treatment_boarding", status: "active", admitted_on: todayISO, discharged_on: null };
      case "boarding": return { kind: "boarding", status: "active", admitted_on: todayISO, discharged_on: null };
      case "scheduled": return { kind: "boarding", status: "active", admitted_on: tomorrow, discharged_on: null };
      case "done": return { status: "discharged", discharged_on: todayISO };
    }
  };

  // Drag drop → the shared store patches optimistically (instant), persists in the
  // background and reverts the row on failure; we just add the tap/success/error cues.
  const persist = async (id: string, patch: Partial<Admission>) => {
    playTap();
    try {
      await opsStore.patch(id, patch);
      playSuccess();
    } catch (e) {
      playWarning();
      toast.error(t("reception.moveError", "تعذّر تحديث الحالة، حاول مجدداً."), e instanceof Error ? e.message : undefined);
    }
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over;
    if (!over) return;
    const id = String(e.active.id);
    const adm = admissions.find((a) => a.id === id);
    if (!adm) return;
    const overId = String(over.id);
    if (overId.startsWith("col:")) {
      const target = overId.slice(4) as OpStatus;
      if (statusOf(adm) === target) return;
      void persist(id, patchForStatus(target));
    } else if (overId.startsWith("day:")) {
      const date = overId.slice(4);
      if (adm.admitted_on === date) return;
      void persist(id, { admitted_on: date });
    }
  };

  const activeAdm = activeId ? admissions.find((a) => a.id === activeId) : null;

  const stats = COLUMN_ORDER.map((s) => ({ status: s, count: byStatus[s].length }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><CalendarDays size={20} /></span>
        <div className="me-auto">
          <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("reception.title")}</h1>
          <p className="text-xs text-ink-subtle">{t("reception.opsSubtitle", "أدِر الحالات الطبية والفندقة — اسحب لإعادة الجدولة أو تغيير الحالة.")}</p>
        </div>
        {/* View toggle */}
        <div className="inline-flex items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
          <button onClick={() => { playTap(); setView("day"); }} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition", view === "day" ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
            <Columns3 size={15} /> {t("reception.viewDay", "يومي")}
          </button>
          <button onClick={() => { playTap(); setView("month"); }} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition", view === "month" ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
            <LayoutGrid size={15} /> {t("reception.viewMonth", "شهري")}
          </button>
        </div>
        <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => { playTap(); navigate("/new-case"); }}>
          {t("newCase.newCaseBtn")}
        </Button>
      </div>

      {/* Status summary strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ status, count }) => {
          const m = STATUS_META[status];
          const Icon = m.icon;
          return (
            <div key={status} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-card">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", m.head)}><Icon size={18} /></span>
              <div className="min-w-0">
                <p className="font-display text-xl font-extrabold leading-none text-ink">{count}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{t(m.key, m.def)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        {view === "day" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn key={status} status={status} items={byStatus[status]} pets={pets} onOpen={(pid) => navigate(`/pet/${pid}?tab=timeline`)} statusOf={statusOf} loading={loading} />
            ))}
          </div>
        ) : (
          <MonthGrid cursor={cursor} setCursor={setCursor} byDay={byDay} pets={pets} todayISO={todayISO} statusOf={statusOf} onOpen={(pid) => navigate(`/pet/${pid}?tab=timeline`)} />
        )}

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
          {activeAdm ? <OpCard adm={activeAdm} pet={pets[activeAdm.pet_id]} status={statusOf(activeAdm)} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ---------------- Kanban column (droppable) ---------------- */
function KanbanColumn({ status, items, pets, onOpen, statusOf, loading }: {
  status: OpStatus; items: Admission[]; pets: Record<string, Pet>; onOpen: (petId: string) => void;
  statusOf: (a: Admission) => OpStatus; loading: boolean;
}) {
  const { t } = useTranslation();
  const m = STATUS_META[status];
  const Icon = m.icon;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex flex-col">
      <div className={cn("mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 font-display text-sm font-bold", m.head)}>
        <Icon size={16} /> <span className="truncate">{t(m.key, m.def)}</span>
        <span className="ms-auto rounded-full bg-white/50 px-2 text-2xs font-extrabold tabular-nums text-inherit dark:bg-black/20">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        data-col={status}
        className={cn(
          "min-h-[140px] flex-1 space-y-2.5 rounded-2xl border border-dashed p-2 transition-colors",
          isOver ? cn("ring-2", m.over) : "border-line bg-surface-2/40",
        )}
      >
        {loading ? (
          <div className="space-y-2.5">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-surface-2" />)}</div>
        ) : items.length === 0 ? (
          <p className="grid h-24 place-items-center text-center text-xs text-ink-subtle">{t("reception.colEmpty", "اسحب حالة إلى هنا")}</p>
        ) : (
          items.map((a) => <DraggableCard key={a.id} adm={a} pet={pets[a.pet_id]} status={statusOf(a)} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

/* ---------------- Month grid (droppable day cells) ---------------- */
function MonthGrid({ cursor, setCursor, byDay, pets, todayISO, statusOf, onOpen }: {
  cursor: Date; setCursor: (d: Date) => void; byDay: Map<string, Admission[]>; pets: Record<string, Pet>;
  todayISO: string; statusOf: (a: Admission) => OpStatus; onOpen: (petId: string) => void;
}) {
  const { t } = useTranslation();
  const weeks = useMemo(() => monthMatrix(cursor), [cursor]);
  const month = cursor.getMonth();
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="card p-3 sm:p-4">
      {/* Month nav — chevrons are direction-agnostic in RTL (prev = ChevronRight). */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => { playTap(); shift(-1); }} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-muted transition hover:bg-surface-2"><ChevronRight size={18} /></button>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-extrabold text-ink">{arMonthYear(cursor)}</h2>
          <button onClick={() => { playTap(); setCursor(new Date()); }} className="chip bg-brand-50 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("reception.today", "اليوم")}</button>
        </div>
        <button onClick={() => { playTap(); shift(1); }} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-muted transition hover:bg-surface-2"><ChevronLeft size={18} /></button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {AR_WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-2xs font-bold text-ink-subtle sm:text-xs">{d}</div>
        ))}
        {weeks.flat().map((date) => {
          const iso = localISO(date);
          const inMonth = date.getMonth() === month;
          const isToday = iso === todayISO;
          const items = byDay.get(iso) ?? [];
          return <DayCell key={iso} iso={iso} dayNum={date.getDate()} inMonth={inMonth} isToday={isToday} items={items} pets={pets} statusOf={statusOf} onOpen={onOpen} />;
        })}
      </div>
    </div>
  );
}

function DayCell({ iso, dayNum, inMonth, isToday, items, pets, statusOf, onOpen }: {
  iso: string; dayNum: number; inMonth: boolean; isToday: boolean; items: Admission[];
  pets: Record<string, Pet>; statusOf: (a: Admission) => OpStatus; onOpen: (petId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso}` });
  return (
    <div
      ref={setNodeRef}
      data-day={iso}
      className={cn(
        "min-h-[92px] rounded-xl border p-1.5 transition-colors sm:min-h-[112px]",
        inMonth ? "border-line bg-surface-1" : "border-transparent bg-surface-2/30",
        isOver && "ring-2 ring-brand-400/70 bg-brand-50/60 dark:bg-brand-500/10",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-2xs font-bold tabular-nums", isToday ? "bg-brand-600 text-white" : inMonth ? "text-ink-muted" : "text-ink-subtle/50")}>{dayNum}</span>
        {items.length > 0 && <span className="text-2xs font-bold text-ink-subtle">{items.length}</span>}
      </div>
      <div className="space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maxHeight: 72 }}>
        {items.map((a) => <DraggableChip key={a.id} adm={a} pet={pets[a.pet_id]} status={statusOf(a)} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

/* ---------------- Draggable wrappers ---------------- */
function DraggableCard({ adm, pet, status, onOpen }: { adm: Admission; pet?: Pet; status: OpStatus; onOpen: (petId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: adm.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-card={adm.id} onClick={() => { playTap(); onOpen(adm.pet_id); }} className={cn("cursor-pointer touch-none", isDragging && "opacity-30")}>
      <OpCard adm={adm} pet={pet} status={status} />
    </div>
  );
}

function DraggableChip({ adm, pet, status, onOpen }: { adm: Admission; pet?: Pet; status: OpStatus; onOpen: (petId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: adm.id });
  const m = STATUS_META[status];
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      data-card={adm.id}
      onClick={() => { playTap(); onOpen(adm.pet_id); }}
      title={pet?.name}
      className={cn("flex cursor-pointer touch-none items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-semibold", m.chip, isDragging && "opacity-30")}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
      <span className="truncate">{pet?.name ?? "—"}</span>
    </div>
  );
}

/* ---------------- Presentational card (shared by column + DragOverlay) ---------------- */
function OpCard({ adm, pet, status, overlay }: { adm: Admission; pet?: Pet; status: OpStatus; overlay?: boolean }) {
  const { t } = useTranslation();
  const m = STATUS_META[status];
  const meta =
    status === "care" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}`
      : status === "boarding" || status === "careBoarding" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}${adm.cage ? ` · ${t("records.cage", "قفص")} ${adm.cage}` : ""}`
        : status === "scheduled" ? `${t("reception.arrives", "الوصول")} ${arDate(adm.admitted_on)}`
          : adm.discharged_on ? `${t("reception.left", "غادر")} ${arDate(adm.discharged_on)}` : arDate(adm.admitted_on);
  return (
    <div className={cn("rounded-2xl border p-2.5 shadow-card", m.card, overlay ? "w-64 rotate-2 cursor-grabbing shadow-raised" : "")}>
      <div className="flex items-center gap-2.5">
        <GripVertical size={15} className="shrink-0 text-ink-subtle/60" />
        {pet && <PetAvatar pet={pet} size={38} photoFallback />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{pet?.name ?? "—"}</p>
          <p className="truncate text-2xs text-ink-muted">{pet?.owner_name || "—"}</p>
        </div>
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", m.dot)} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn("chip text-2xs font-semibold", m.chip)}>{t(m.key, m.def)}</span>
        <span className="truncate text-2xs text-ink-subtle">{meta}</span>
      </div>
      {adm.reason && <p className="mt-1.5 truncate text-2xs text-ink-muted">{adm.reason}</p>}
    </div>
  );
}
