import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  CalendarDays, Stethoscope, Plus, HeartPulse, Search,
  ChevronRight, ChevronLeft, LayoutGrid, Columns3, GripVertical, Syringe, Bug, Cake, Bell, X, Check, MessageCircle,
} from "lucide-react";
import type { Admission, Pet, Vaccination, Reminder, VaccinationStatus } from "@/types";
import { opsStore } from "@/lib/opsStore";
import { COLUMN_ORDER, STATUS_META, statusOf, patchForStatus, type OpStatus } from "@/lib/opsStatus";
import { matchesBranch, useBranchState } from "@/lib/branchStore";
import { repo } from "@/lib/repo";
import { getCached, setCached } from "@/lib/swrCache";
import { buildCalendarReminders, occursOn, type CalReminder, type CalReminderKind } from "@/lib/calendarReminders";
import { PetAvatar } from "@/components/PetAvatar";
import { Button, useToast } from "@/components/ui";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber, phoneDigits } from "@/lib/phone";
import { normalizeDigits } from "@/lib/digits";
import { cn, localISO, dateLocale } from "@/lib/utils";
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


/** Reminder kinds plotted on the month grid — each its own colour + icon so a
 *  glance tells you what's coming (تطعيم / ديدان / عيد ميلاد / تذكير). */
const REMINDER_META: Record<CalReminderKind, { key: string; def: string; icon: typeof Syringe; chip: string; dot: string }> = {
  vaccine: {
    key: "reception.remVaccine", def: "تطعيم", icon: Syringe,
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  deworming: {
    key: "reception.remDeworming", def: "ديدان", icon: Bug,
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  birthday: {
    key: "reception.remBirthday", def: "عيد ميلاد", icon: Cake,
    chip: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200",
    dot: "bg-pink-500",
  },
  reminder: {
    key: "reception.remReminder", def: "تذكير", icon: Bell,
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
};

/** Week starts Saturday. Follows the UI language (Western digits either way). */
const WEEKDAYS = () =>
  dateLocale().startsWith("ar")
    ? ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]
    : ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

const dayNumber = (admittedOn: string): number => {
  const t = new Date(admittedOn + "T00:00:00").getTime();
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
};
const arDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(dateLocale(), { day: "2-digit", month: "long" });
const arMonthYear = (d: Date) => d.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
const arFullDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });

/** Open WhatsApp to the owner with a pre-filled Arabic message. Builds the
 *  international number from the clinic dial code (same helper as Campaigns), so a
 *  nationally-stored 07xx… becomes a valid link. No-op if there's no number. */
function openWhatsApp(phone: string | null | undefined, message: string) {
  const num = waNumber(phone ?? "", getDialCode());
  if (!num) return;
  playTap();
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

/** Is the treatment cycle's next dose due now? Never completed → due immediately;
 *  otherwise due once cycle_hours (default 24h) have passed since the last dose. */
function doseDue(a: Admission): boolean {
  if (!a.last_completed_at) return true;
  const cyc = a.cycle_hours && a.cycle_hours > 0 ? a.cycle_hours : 24;
  return Date.now() >= new Date(a.last_completed_at).getTime() + cyc * 3600000;
}

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
  const pets = ops.pets;
  const loading = !ops.hydrated;

  const clinicId = user?.clinic_id ?? user?.id;

  // Branch lens: with 2+ branches, the calendar shows only the active branch's
  // cases (rows with branch_id NULL belong to the main branch). "كل الفروع" —
  // and every single-branch clinic — sees everything, exactly as before.
  const { branches, active: activeBranch } = useBranchState(clinicId);
  const branchAdmissions = useMemo(
    () => (activeBranch === "all" || branches.length < 2
      ? ops.admissions
      : ops.admissions.filter((a) => matchesBranch(a.branch_id, activeBranch, branches))),
    [ops.admissions, activeBranch, branches],
  );

  // Find a specific animal instantly — by its name, serial / microchip number,
  // or the owner's name / phone. Filters every view (kanban, month, stats) live.
  const [search, setSearch] = useState("");
  const admissions = useMemo(() => {
    const q = normalizeDigits(search.trim().toLowerCase());
    if (!q) return branchAdmissions;
    const qDigits = q.replace(/\D/g, "");
    return branchAdmissions.filter((a) => {
      const p = pets[a.pet_id];
      if (!p) return false;
      if (p.name?.toLowerCase().includes(q)) return true;
      if (p.owner_name?.toLowerCase().includes(q)) return true;
      if ((p.serial ?? "").toLowerCase().includes(q)) return true;
      if ((p.microchip_id ?? "").toLowerCase().includes(q)) return true;
      if (qDigits && phoneDigits(p.owner_phone ?? "").includes(qDigits)) return true;
      return false;
    });
  }, [branchAdmissions, search, pets]);

  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    void opsStore.hydrate(clinicId).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reminders/vaccinations for the MONTH view — plotted on their due dates so
  // staff see what's coming ahead of time. Seeded from cache for an instant paint.
  const [reminders, setReminders] = useState<Reminder[]>(() => getCached<Reminder[]>(`recRem:${clinicId ?? "x"}`) ?? []);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(() => getCached<Vaccination[]>(`recVax:${clinicId ?? "x"}`) ?? []);

  useEffect(() => {
    let alive = true;
    repo.listReminders({ ownerId: null }).then((r) => { if (alive) { setReminders(r); setCached(`recRem:${clinicId ?? "x"}`, r); } }).catch(() => {});
    return () => { alive = false; };
  }, [clinicId]);

  const petIdsKey = useMemo(() => Object.keys(pets).sort().join(","), [pets]);
  useEffect(() => {
    const ids = petIdsKey ? petIdsKey.split(",") : [];
    if (!ids.length) return;
    let alive = true;
    repo.listAllVaccinations(ids).then((v) => { if (alive) { setVaccinations(v); setCached(`recVax:${clinicId ?? "x"}`, v); } }).catch(() => {});
    return () => { alive = false; };
  }, [petIdsKey, clinicId]);

  const byStatus = useMemo(() => {
    const m: Record<OpStatus, Admission[]> = { care: [], careBoarding: [], boarding: [], done: [] };
    for (const a of admissions) m[statusOf(a)].push(a);
    // Newest admitted first within a column (done can be long — cap the tail visually only).
    for (const k of COLUMN_ORDER) m[k].sort((a, b) => (b.admitted_on || "").localeCompare(a.admitted_on || ""));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissions, todayISO]);

  // Which cases sit on each day. A live boarding stay (فندقة / فندقة علاجية) is
  // present EVERY night from admission through today — not just its admission day —
  // so "من عندنا الليلة؟" is answerable on any day of the stay. Everything else
  // (treatment visits, discharged rows) stays on its single admission day.
  const byDay = useMemo(() => {
    const m = new Map<string, Admission[]>();
    const push = (iso: string, a: Admission) => { const arr = m.get(iso); if (arr) arr.push(a); else m.set(iso, [a]); };
    for (const a of admissions) {
      if (!a.admitted_on) continue;
      const boards = (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status !== "discharged";
      if (boards && a.admitted_on <= todayISO) {
        const cur = new Date(a.admitted_on + "T00:00:00");
        const end = new Date(todayISO + "T00:00:00");
        let guard = 0;
        while (cur <= end && guard < 400) { push(localISO(cur), a); cur.setDate(cur.getDate() + 1); guard++; }
      } else {
        push(a.admitted_on, a);
      }
    }
    return m;
  }, [admissions, todayISO]);

  // Dated reminders for exactly the visible month matrix (only computed in month view).
  const remindersByDay = useMemo(() => {
    if (view !== "month") return new Map<string, CalReminder[]>();
    const weeks = monthMatrix(cursor);
    return buildCalendarReminders({
      pets: Object.values(pets),
      vaccinations,
      reminders,
      fromISO: localISO(weeks[0][0]),
      toISO: localISO(weeks[5][6]),
      todayISO,
    });
  }, [view, cursor, pets, vaccinations, reminders, todayISO]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

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
    // Only the daily kanban has drop targets (status columns). The month view is a
    // calm read-only overview, so there is no day-to-day drag here.
    if (overId.startsWith("col:")) {
      const target = overId.slice(4) as OpStatus;
      if (statusOf(adm) === target) return;
      void persist(id, patchForStatus(target, todayISO));
    }
  };

  // Tick a reminder off in place: administer the vaccine/deworming dose, or disable
  // the custom reminder. Optimistic — the coloured dot vanishes instantly (an
  // administered vaccine / disabled reminder is dropped by buildCalendarReminders),
  // then persists in the background and re-syncs from the server on failure.
  const markReminderDone = (rem: CalReminder) => {
    if (!rem.refId) return;
    playTap();
    const key = clinicId ?? "x";
    if (rem.refKind === "vaccination") {
      const id = rem.refId, at = new Date().toISOString();
      setVaccinations((vs) => {
        const next = vs.map((v) => (v.id === id ? { ...v, status: "administered" as VaccinationStatus, administered_at: at } : v));
        setCached(`recVax:${key}`, next);
        return next;
      });
      repo.updateVaccination(id, { status: "administered", administered_at: at }).then(playSuccess).catch(() => {
        playWarning();
        toast.error(t("reception.doneError", "تعذّر حفظ الإجراء، حاول مجدداً."));
        repo.listAllVaccinations(Object.keys(pets)).then((v) => { setVaccinations(v); setCached(`recVax:${key}`, v); }).catch(() => {});
      });
    } else if (rem.refKind === "reminder") {
      const id = rem.refId;
      setReminders((rs) => {
        const next = rs.map((r) => (r.id === id ? { ...r, enabled: false } : r));
        setCached(`recRem:${key}`, next);
        return next;
      });
      repo.updateReminder(id, { enabled: false }).then(playSuccess).catch(() => {
        playWarning();
        toast.error(t("reception.doneError", "تعذّر حفظ الإجراء، حاول مجدداً."));
        repo.listReminders({ ownerId: null }).then((r) => { setReminders(r); setCached(`recRem:${key}`, r); }).catch(() => {});
      });
    }
  };

  // Record a treatment dose as given now — optimistic through the shared store,
  // so the "مستحق الآن" flag clears instantly and reverts on failure.
  const markDoseDone = (admId: string) => {
    playTap();
    opsStore.patch(admId, { last_completed_at: new Date().toISOString() })
      .then(playSuccess)
      .catch(() => { playWarning(); toast.error(t("reception.doseError", "تعذّر تسجيل الجرعة، حاول مجدداً.")); });
  };

  // Jot a one-off reminder straight onto a day, without leaving the calendar.
  const addQuickReminder = (dateISO: string, title: string) => {
    const key = clinicId ?? "x";
    repo.addReminder({ owner_id: null, pet_id: null, category: "recheck", title, date: dateISO, enabled: true, recurring: "none" })
      .then((r) => { setReminders((rs) => { const next = [...rs, r]; setCached(`recRem:${key}`, next); return next; }); playSuccess(); })
      .catch(() => { playWarning(); toast.error(t("reception.addError", "تعذّر إضافة التذكير، حاول مجدداً.")); });
  };

  // "What do I do today?" — reminders due today + how many are overdue (with the
  // earliest, so one tap jumps to it). Counted straight from the source rows so
  // it's accurate across every month; recurring reminders never count as overdue.
  const focus = useMemo(() => {
    let today = 0, overdue = 0;
    let earliest: string | null = null;
    const bump = (d: string) => { if (!earliest || d < earliest) earliest = d; };
    for (const v of vaccinations) {
      if (v.status === "administered" || !v.due_date) continue;
      const d = v.due_date.slice(0, 10);
      if (d === todayISO) today++;
      else if (d < todayISO) { overdue++; bump(d); }
    }
    for (const r of reminders) {
      if (!r.enabled) continue;
      const base = r.date.slice(0, 10);
      if (r.recurring && r.recurring !== "none") { if (occursOn(base, r.recurring, todayISO)) today++; }
      else if (base === todayISO) today++;
      else if (base < todayISO) { overdue++; bump(base); }
    }
    const td = new Date(todayISO + "T00:00:00");
    for (const p of Object.values(pets)) {
      if (!p.dob) continue;
      const b = new Date(p.dob);
      if (!Number.isNaN(b.getTime()) && b.getMonth() === td.getMonth() && b.getDate() === td.getDate()) today++;
    }
    return { today, overdue, earliest };
  }, [vaccinations, reminders, pets, todayISO]);

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

      {/* Find an animal — name, serial/microchip number, owner name or phone. */}
      <div className="relative mb-4">
        <Search size={17} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3.5 rtl:right-3.5" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("reception.searchPh", "ابحث: اسم الحيوان، رقمه، اسم المالك أو هاتفه…")}
          className="input h-11 w-full ps-10 pe-24 text-sm"
        />
        {search.trim() && (
          <span className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 ltr:right-2 rtl:left-2">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-bold tabular-nums text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {t("reception.searchCount", { n: admissions.length, defaultValue: "{{n}} نتيجة" })}
            </span>
            <button onClick={() => { playTap(); setSearch(""); }} aria-label={t("common.close", "إغلاق")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink">
              <X size={14} />
            </button>
          </span>
        )}
      </div>

      {/* Status summary strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn key={status} status={status} items={byStatus[status]} pets={pets} onOpen={(pid) => navigate(`/pet/${pid}?tab=timeline`)} statusOf={statusOf} loading={loading} />
            ))}
          </div>
        ) : (
          <MonthGrid cursor={cursor} setCursor={setCursor} byDay={byDay} remindersByDay={remindersByDay} pets={pets} todayISO={todayISO} statusOf={statusOf} focus={focus} onOpen={(pid) => navigate(`/pet/${pid}?tab=timeline`)} onOpenTab={(pid, tab) => navigate(`/pet/${pid}?tab=${tab}`)} onDone={markReminderDone} onDoseDone={markDoseDone} onAddReminder={addQuickReminder} />
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

/* ---------------- Month grid — at-a-glance overview + a readable day panel ----
 * The grid is deliberately calm: each day shows only coloured dots (reminders,
 * by kind) and a small badge for live cases — enough to scan a whole month in a
 * blink. Clicking a day opens the panel beside it with the FULL, plain-language
 * detail (pet names, owners, statuses, actions) so nothing needs deciphering.
 * ------------------------------------------------------------------------- */
function MonthGrid({ cursor, setCursor, byDay, remindersByDay, pets, todayISO, statusOf, focus, onOpen, onOpenTab, onDone, onDoseDone, onAddReminder }: {
  cursor: Date; setCursor: (d: Date) => void; byDay: Map<string, Admission[]>; remindersByDay: Map<string, CalReminder[]>;
  pets: Record<string, Pet>; todayISO: string; statusOf: (a: Admission) => OpStatus;
  focus: { today: number; overdue: number; earliest: string | null };
  onOpen: (petId: string) => void; onOpenTab: (petId: string, tab: string) => void; onDone: (rem: CalReminder) => void;
  onDoseDone: (admId: string) => void; onAddReminder: (dateISO: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const weeks = useMemo(() => monthMatrix(cursor), [cursor]);
  const month = cursor.getMonth();
  // The focused day whose details fill the side panel. Starts on today.
  const [selected, setSelected] = useState<string | null>(todayISO);
  const shift = (n: number) => { setSelected(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1)); };

  const selItems = selected ? (byDay.get(selected) ?? []) : [];
  const selRems = selected ? (remindersByDay.get(selected) ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,380px)] lg:items-start">
      {/* ---- Calendar ---- */}
      <div className="card p-3 sm:p-4">
        {/* Month nav — chevrons are direction-agnostic in RTL (prev = ChevronRight). */}
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => { playTap(); shift(-1); }} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-muted transition hover:bg-surface-2"><ChevronRight size={18} /></button>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-extrabold text-ink">{arMonthYear(cursor)}</h2>
            <button onClick={() => { playTap(); setCursor(new Date()); setSelected(todayISO); }} className="chip bg-brand-50 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("reception.today", "اليوم")}</button>
          </div>
          <button onClick={() => { playTap(); shift(1); }} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-muted transition hover:bg-surface-2"><ChevronLeft size={18} /></button>
        </div>

        {/* Focus strip — the "what do I do today?" answer: due-today + overdue,
            each a one-tap jump (overdue → the earliest late day). */}
        {(focus.today > 0 || focus.overdue > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {focus.today > 0 && (
              <button onClick={() => { playTap(); setCursor(new Date()); setSelected(todayISO); }} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-2xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25">
                <Bell size={12} /> {t("reception.dueToday", "اليوم")} {focus.today}
              </button>
            )}
            {focus.overdue > 0 && (
              <button onClick={() => { if (focus.earliest) { playTap(); setCursor(new Date(focus.earliest + "T00:00:00")); setSelected(focus.earliest); } }} className="inline-flex items-center gap-1.5 rounded-full bg-danger-100 px-3 py-1 text-2xs font-bold text-danger-700 transition hover:bg-danger-200 dark:bg-danger-500/20 dark:text-danger-200 dark:hover:bg-danger-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-danger-500" /> {t("reception.overdueCount", "متأخر")} {focus.overdue}
              </button>
            )}
          </div>
        )}

        {/* Legend — what the coloured dots on each day mean. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2">
          {(Object.keys(REMINDER_META) as CalReminderKind[]).map((k) => {
            const rm = REMINDER_META[k];
            return (
              <span key={k} className="inline-flex items-center gap-1.5 text-2xs font-semibold text-ink-muted">
                <span className={cn("h-2.5 w-2.5 rounded-full", rm.dot)} />
                {t(rm.key, rm.def)}
              </span>
            );
          })}
        </div>

        {/* Weekday headers + day cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS().map((d) => (
            <div key={d} className="pb-1 text-center text-2xs font-bold text-ink-subtle sm:text-xs">{d}</div>
          ))}
          {weeks.flat().map((date) => {
            const iso = localISO(date);
            const items = byDay.get(iso) ?? [];
            const rems = remindersByDay.get(iso) ?? [];
            return (
              <DayCell
                key={iso}
                iso={iso}
                dayNum={date.getDate()}
                inMonth={date.getMonth() === month}
                isToday={iso === todayISO}
                isSelected={iso === selected}
                caseCount={items.length}
                rems={rems}
                onSelect={() => { playTap(); setSelected(iso); }}
              />
            );
          })}
        </div>
      </div>

      {/* ---- Selected-day detail ---- */}
      <DayDetailPanel
        iso={selected}
        isToday={selected === todayISO}
        items={selItems}
        rems={selRems}
        pets={pets}
        statusOf={statusOf}
        onOpen={onOpen}
        onOpenTab={onOpenTab}
        onDone={onDone}
        onDoseDone={onDoseDone}
        onAddReminder={onAddReminder}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

/** One day in the month grid: a calm, scannable summary you tap to see details.
 *  Coloured dots = reminders (by kind); a small badge = live cases; a red mark
 *  in the corner flags anything overdue so it can't slip by. */
function DayCell({ iso, dayNum, inMonth, isToday, isSelected, caseCount, rems, onSelect }: {
  iso: string; dayNum: number; inMonth: boolean; isToday: boolean; isSelected: boolean;
  caseCount: number; rems: CalReminder[]; onSelect: () => void;
}) {
  const shownDots = rems.slice(0, 4);
  const extra = rems.length - shownDots.length;
  const hasOverdue = rems.some((r) => r.overdue);
  return (
    <button
      type="button"
      data-day={iso}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex min-h-[64px] flex-col rounded-xl border p-1.5 text-start transition sm:min-h-[88px]",
        inMonth ? "bg-surface-1" : "bg-surface-2/30",
        isSelected
          ? "border-brand-400 ring-2 ring-brand-400/60 dark:border-brand-500"
          : "border-line hover:border-brand-200 hover:bg-surface-2/60 dark:hover:border-brand-500/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-2xs font-bold tabular-nums", isToday ? "bg-brand-600 text-white" : inMonth ? "text-ink-muted" : "text-ink-subtle/50")}>{dayNum}</span>
        {hasOverdue && <span className="h-2 w-2 rounded-full bg-danger-500 ring-2 ring-danger-500/25" aria-hidden />}
      </div>

      {/* Reminder dots (coloured by kind) */}
      {rems.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          {shownDots.map((r) => (
            <span key={r.id} className={cn("h-2 w-2 rounded-full", REMINDER_META[r.kind].dot)} />
          ))}
          {extra > 0 && <span className="text-2xs font-bold leading-none text-ink-subtle">+{extra}</span>}
        </div>
      )}

      {/* Live-cases badge */}
      {caseCount > 0 && (
        <div className={cn("flex pt-1", rems.length === 0 && "mt-auto")}>
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-bold text-ink-muted">
            <HeartPulse size={10} className="text-brand-500" /> {caseCount}
          </span>
        </div>
      )}
    </button>
  );
}

/** The readable detail for the selected day — everything on that date laid out
 *  in plain, grouped rows so staff grasp and act on it without any deciphering. */
function DayDetailPanel({ iso, isToday, items, rems, pets, statusOf, onOpen, onOpenTab, onDone, onDoseDone, onAddReminder, onClose }: {
  iso: string | null; isToday: boolean; items: Admission[]; rems: CalReminder[];
  pets: Record<string, Pet>; statusOf: (a: Admission) => OpStatus; onOpen: (petId: string) => void;
  onOpenTab: (petId: string, tab: string) => void; onDone: (rem: CalReminder) => void;
  onDoseDone: (admId: string) => void; onAddReminder: (dateISO: string, title: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Reset the quick-add form whenever the selected day changes.
  useEffect(() => { setAdding(false); setDraft(""); }, [iso]);

  if (!iso) {
    return (
      <div className="card grid min-h-[220px] place-items-center p-6 text-center">
        <div>
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-ink-subtle"><CalendarDays size={22} /></span>
          <p className="text-sm font-semibold text-ink-muted">{t("reception.pickDay", "اختر يوماً من التقويم")}</p>
          <p className="mt-1 text-xs text-ink-subtle">{t("reception.pickDayHint", "لعرض التذكيرات والحالات في ذلك اليوم")}</p>
        </div>
      </div>
    );
  }

  const empty = rems.length === 0 && items.length === 0;
  const submitDraft = () => { const v = draft.trim(); if (v) { onAddReminder(iso, v); } setDraft(""); setAdding(false); };

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="mb-3 flex items-start gap-2">
        <div className="me-auto flex items-center gap-2">
          <h3 className="font-display text-base font-extrabold text-ink">{arFullDate(iso)}</h3>
          {isToday && <span className="chip bg-brand-50 text-2xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("reception.today", "اليوم")}</span>}
        </div>
        <button onClick={() => { playTap(); onClose(); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-2 hover:text-ink" aria-label={t("common.close", "إغلاق")}><X size={15} /></button>
      </div>

      {empty ? (
        <div className="grid min-h-[120px] place-items-center rounded-xl border border-dashed border-line bg-surface-2/30 p-6 text-center">
          <div>
            <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle"><CalendarDays size={18} /></span>
            <p className="text-xs font-semibold text-ink-muted">{t("reception.dayEmpty", "لا توجد تذكيرات أو حالات في هذا اليوم")}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {rems.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"><Bell size={13} /></span>
                <h4 className="font-display text-sm font-bold text-ink">{t("reception.remindersSection", "التذكيرات")}</h4>
                <span className="rounded-full bg-surface-2 px-1.5 text-2xs font-bold tabular-nums text-ink-muted">{rems.length}</span>
              </div>
              <div className="space-y-1.5">
                {rems.map((r) => <ReminderRow key={r.id} rem={r} pet={r.petId ? pets[r.petId] : undefined} onOpenTab={onOpenTab} onDone={onDone} />)}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><Stethoscope size={13} /></span>
                <h4 className="font-display text-sm font-bold text-ink">{t("reception.casesSection", "حالات العيادة")}</h4>
                <span className="rounded-full bg-surface-2 px-1.5 text-2xs font-bold tabular-nums text-ink-muted">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((a) => <CaseRow key={a.id} adm={a} pet={pets[a.pet_id]} status={statusOf(a)} onOpen={onOpen} onDoseDone={onDoseDone} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Quick-add — jot a one-off reminder onto this day without leaving. One field. */}
      <div className="mt-4 border-t border-line pt-3">
        {adding ? (
          <form onSubmit={(e) => { e.preventDefault(); submitDraft(); }} className="flex items-center gap-2">
            <input
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={t("reception.reminderPlaceholder", "عنوان التذكير…")}
              className="input h-9 flex-1 text-sm"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-2xs font-bold text-white transition hover:bg-brand-700">{t("common.save", "حفظ")}</button>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-2 hover:text-ink" aria-label={t("common.cancel", "إلغاء")}><X size={15} /></button>
          </form>
        ) : (
          <button onClick={() => { playTap(); setAdding(true); }} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-2xs font-semibold text-ink-muted transition hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-500/50">
            <Plus size={14} /> {t("reception.addReminder", "إضافة تذكير لهذا اليوم")}
          </button>
        )}
      </div>
    </div>
  );
}

/** A single reminder in the day panel — icon + who it's for + what it is, an
 *  overdue flag when late. Tapping the row opens the pet's record on the right
 *  tab; two quick actions handle it in place: WhatsApp the owner, or mark "تم"
 *  (administer the dose / disable the reminder). "تم" is hidden for repeating
 *  reminders (one flag would end the whole series). */
function ReminderRow({ rem, pet, onOpenTab, onDone }: {
  rem: CalReminder; pet?: Pet; onOpenTab: (petId: string, tab: string) => void; onDone: (rem: CalReminder) => void;
}) {
  const { t } = useTranslation();
  const rm = REMINDER_META[rem.kind];
  const Icon = rm.icon;
  const kindLabel = t(rm.key, rm.def);
  const title = rem.petName || rem.title || kindLabel;
  const sub = rem.petName && rem.title ? `${kindLabel} · ${rem.title}` : kindLabel;
  const tab = rem.kind === "vaccine" || rem.kind === "deworming" ? "vaccines" : "timeline";
  const canDone = !!rem.refKind && !rem.recurring;
  const phone = pet?.owner_phone;
  const openRecord = () => { if (rem.petId) { playTap(); onOpenTab(rem.petId, tab); } };
  const waMsg =
    rem.kind === "birthday"
      ? `كل عام و${rem.petName || "حبيبكم"} بخير 🎂🐾 — ${getClinicName() || "عيادتنا"}`
      : rem.kind === "vaccine" || rem.kind === "deworming"
        ? `مرحباً 🐾 تذكير من ${getClinicName() || "عيادتنا"}: حان موعد ${kindLabel}${rem.title ? ` (${rem.title})` : ""} لـ ${rem.petName || "حيوانكم"}.`
        : `مرحباً 🐾 تذكير من ${getClinicName() || "عيادتنا"}: ${rem.title || kindLabel}${rem.petName ? ` — ${rem.petName}` : ""}.`;
  return (
    <div
      onClick={openRecord}
      className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2", rem.petId && "cursor-pointer transition hover:bg-surface-2/60")}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", rm.chip)}><Icon size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-ink">{title}</p>
          {rem.overdue && <span className="chip shrink-0 bg-danger-100 text-2xs text-danger-700 dark:bg-danger-500/20 dark:text-danger-200">{t("reception.overdue", "متأخر")}</span>}
        </div>
        <p className="truncate text-2xs text-ink-muted">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {phone && (
          <button
            onClick={(e) => { e.stopPropagation(); openWhatsApp(phone, waMsg); }}
            aria-label={t("reception.whatsapp", "واتساب")}
            className="grid h-8 w-8 place-items-center rounded-lg bg-success-100 text-success-700 transition hover:bg-success-200 dark:bg-success-500/20 dark:text-success-300"
          >
            <MessageCircle size={15} />
          </button>
        )}
        {canDone && (
          <button
            onClick={(e) => { e.stopPropagation(); onDone(rem); }}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-2 text-2xs font-bold text-white transition hover:bg-brand-700"
          >
            <Check size={14} /> {t("reception.markDone", "تم")}
          </button>
        )}
      </div>
    </div>
  );
}

/** A single live case in the day panel — avatar, owner, status chip and how long
 *  it's been in the clinic. Tapping the row opens the record; a WhatsApp button
 *  reaches the owner. When a treatment case's next dose is due, a clear amber
 *  footer records it (تمت الجرعة) in one tap. */
function CaseRow({ adm, pet, status, onOpen, onDoseDone }: {
  adm: Admission; pet?: Pet; status: OpStatus; onOpen: (petId: string) => void; onDoseDone: (admId: string) => void;
}) {
  const { t } = useTranslation();
  const m = STATUS_META[status];
  const meta =
    status === "care" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}`
      : status === "boarding" || status === "careBoarding" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}${adm.cage ? ` · ${t("records.cage", "قفص")} ${adm.cage}` : ""}`
        : adm.discharged_on ? `${t("reception.left", "غادر")} ${arDate(adm.discharged_on)}` : arDate(adm.admitted_on);
  const phone = pet?.owner_phone;
  const waMsg = `مرحباً 🐾 من ${getClinicName() || "عيادتنا"} بخصوص ${pet?.name || "حيوانكم"}.`;
  // Treatment cases (care / therapeutic boarding) get a dose-due prompt.
  const dueDose = (status === "care" || status === "careBoarding") && doseDue(adm);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div onClick={() => { playTap(); onOpen(adm.pet_id); }} className="flex w-full cursor-pointer items-center gap-2.5 p-2 text-start transition hover:bg-surface-2/60">
        {pet ? <PetAvatar pet={pet} size={36} photoFallback /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-subtle"><Stethoscope size={16} /></span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{pet?.name ?? "—"}</p>
          <p className="truncate text-2xs text-ink-muted">{pet?.owner_name || "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <span className={cn("chip text-2xs font-semibold", m.chip)}>{t(m.key, m.def)}</span>
            <span className="text-2xs text-ink-subtle">{meta}</span>
          </div>
          {phone && (
            <button
              onClick={(e) => { e.stopPropagation(); openWhatsApp(phone, waMsg); }}
              aria-label={t("reception.whatsapp", "واتساب")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success-100 text-success-700 transition hover:bg-success-200 dark:bg-success-500/20 dark:text-success-300"
            >
              <MessageCircle size={15} />
            </button>
          )}
        </div>
      </div>
      {dueDose && (
        <button
          onClick={() => onDoseDone(adm.id)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-amber-200 bg-amber-50 py-1.5 text-2xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
        >
          <Check size={13} /> {t("reception.doseDue", "الجرعة مستحقة الآن — سجّل تمّت")}
        </button>
      )}
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

/* ---------------- Presentational card (shared by column + DragOverlay) ---------------- */
function OpCard({ adm, pet, status, overlay }: { adm: Admission; pet?: Pet; status: OpStatus; overlay?: boolean }) {
  const { t } = useTranslation();
  const m = STATUS_META[status];
  const meta =
    status === "care" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}`
      : status === "boarding" || status === "careBoarding" ? `${t("snapshot.day", "اليوم")} ${dayNumber(adm.admitted_on)}${adm.cage ? ` · ${t("records.cage", "قفص")} ${adm.cage}` : ""}`
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
