import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  Boxes, DoorOpen, GripVertical, Loader2, Maximize2, PawPrint, Pencil, Plus, Trash2, X,
} from "lucide-react";
import type { Admission, Pet } from "@/types";
import { opsStore } from "@/lib/opsStore";
import { STATUS_META, statusOf, type OpStatus } from "@/lib/opsStatus";
import { getCageLayout, setCageLayout, type CageRoom } from "@/lib/settings";
import { PetAvatar } from "@/components/PetAvatar";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { cn, dateLocale, formatNum, uid } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * خريطة الأقفاص — المنشأة كما هي على الأرض.
 *
 * العيادة ترسم غرفها وأقفاصها مرة واحدة (محرّر التخطيط)، فتتحول شاشة السجل
 * إلى خريطة حيّة: كل قفص ببطاقة، والحيوان الراقد داخله بلون حالته، والسحب
 * والإفلات ينقله — إلى قفص فاضي (نقل)، إلى قفص مشغول (تبادل)، أو إلى «بلا
 * قفص» (إخراج). كل نقلة تمر عبر opsStore.patch فتُسجَّل تلقائياً بجدول
 * تنقلات الحيوان (cage_changed) بلا أي منطق إضافي هنا.
 *
 * قاعدة الأمانة: حقل القفص نص حر منذ البداية، فأي رمز موجود على رقود نشط
 * وغير مرسوم بالتخطيط يُتبنّى تلقائياً بغرفة «أقفاص غير مصنّفة» — ما في
 * حيوان يختفي من الخريطة أبداً مهما كان تخطيطها ناقصاً.
 * ==========================================================================*/

const norm = (c?: string | null) => (c ?? "").trim().toLowerCase();

/** نفس حساب التقويم الرئيسي: أول يوم بالرقود = «اليوم ١». */
const dayNumber = (admittedOn: string): number => {
  const t = new Date(admittedOn + "T00:00:00").getTime();
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
};

/** نفس قاعدة التقويم: بلا جرعة سابقة → مستحقّة فوراً، وإلا بعد مرور الدورة. */
function doseDue(a: Admission): boolean {
  if (!a.last_completed_at) return true;
  const cyc = a.cycle_hours && a.cycle_hours > 0 ? a.cycle_hours : 24;
  return Date.now() >= new Date(a.last_completed_at).getTime() + cyc * 3600000;
}

/** تسمية مختصرة تلائم بطاقة قفص صغيرة (بدل مسميات الأعمدة الطويلة). */
const KIND_SHORT: Record<OpStatus, string> = {
  care: "علاج", careBoarding: "فندقة علاجية", boarding: "فندقة", done: "غادر",
};

const FALLBACK_PET: Pick<Pet, "species" | "photo_url" | "name"> = { species: "cat", photo_url: null, name: "حيوان" };

/* ── شريحة الحيوان القابلة للسحب ─────────────────────────────────────────── */
function OccupantChip({ a, pet, onOpen }: { a: Admission; pet?: Pet; onOpen: (petId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  const meta = STATUS_META[statusOf(a)];
  const due = (a.kind === "treatment" || a.kind === "treatment_boarding") && doseDue(a);
  const p = pet ?? FALLBACK_PET;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} data-occ={a.id}
      onClick={() => { if (!isDragging) onOpen(a.pet_id); }}
      className={cn(
        "flex w-full cursor-grab touch-none select-none items-center gap-2 rounded-lg border p-1.5 transition active:cursor-grabbing",
        meta.card, isDragging && "opacity-30",
      )}>
      <GripVertical size={13} className="shrink-0 text-ink-subtle" aria-hidden />
      <PetAvatar pet={p} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-extrabold text-ink">{p.name}</p>
        <p className="truncate text-[10px] font-bold text-ink-subtle">
          اليوم {formatNum(dayNumber(a.admitted_on))} · {KIND_SHORT[statusOf(a)]}
        </p>
      </div>
      {due && <span className="h-2 w-2 shrink-0 animate-pulse-ring rounded-full bg-warn-500" title="جرعة مستحقّة الآن" />}
    </div>
  );
}

/** نسخة العرض أثناء السحب (DragOverlay) — نفس الشكل بلا سلوك. */
function ChipGhost({ a, pet }: { a: Admission; pet?: Pet }) {
  const meta = STATUS_META[statusOf(a)];
  const p = pet ?? FALLBACK_PET;
  return (
    <div className={cn("flex w-48 items-center gap-2 rounded-lg border p-1.5 shadow-card", meta.card)}>
      <GripVertical size={13} className="shrink-0 text-ink-subtle" aria-hidden />
      <PetAvatar pet={p} size={34} />
      <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-ink">{p.name}</p>
    </div>
  );
}

/* ── بطاقة القفص (هدف إفلات) ─────────────────────────────────────────────── */
function CageTile({ code, list, pets, onOpen }: {
  code: string; list: Admission[]; pets: Record<string, Pet>; onOpen: (petId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cage:${norm(code)}`, data: { display: code } });
  const primary = list[0];
  const meta = primary ? STATUS_META[statusOf(primary)] : null;
  const due = !!primary && (primary.kind === "treatment" || primary.kind === "treatment_boarding") && doseDue(primary);
  return (
    <div ref={setNodeRef} data-cage={code}
      className={cn(
        "min-h-[96px] rounded-xl border p-2 transition",
        meta ? meta.card : "border-2 border-dashed border-line bg-surface-1",
        due && "ring-1 ring-warn-400/70",
        isOver && (meta ? cn("ring-2", meta.over) : "bg-brand-50/50 ring-2 ring-brand-400/70 dark:bg-brand-500/10"),
      )}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", meta ? meta.dot : "bg-line")} aria-hidden />
        <span className="truncate text-[11px] font-black text-ink" dir="auto">{code}</span>
        {list.length > 1 && (
          <span className="ms-auto rounded-full bg-surface-2 px-1.5 text-[10px] font-black tabular-nums text-ink-subtle">
            {formatNum(list.length)}
          </span>
        )}
      </div>
      {list.length === 0 ? (
        <p className="grid place-items-center py-4 text-[10px] font-bold text-ink-subtle">متاح</p>
      ) : (
        <div className="space-y-1">
          {list.map((a) => <OccupantChip key={a.id} a={a} pet={pets[a.pet_id]} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

/* ── حوض «بلا قفص» (هدف إفلات للإخراج) ──────────────────────────────────── */
function TrayZone({ tray, pets, onOpen }: {
  tray: Admission[]; pets: Record<string, Pet>; onOpen: (petId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });
  return (
    <div ref={setNodeRef} data-tray="" className={cn("card p-3", isOver && "ring-2 ring-brand-400/70")}>
      <div className="mb-2 flex items-center gap-2">
        <PawPrint size={15} className="text-ink-subtle" />
        <h3 className="text-sm font-black text-ink">بلا قفص</h3>
        <span className="rounded-full bg-surface-2 px-2 text-[11px] font-black tabular-nums text-ink-subtle">{formatNum(tray.length)}</span>
        <p className="ms-auto hidden text-[10px] font-bold text-ink-subtle sm:block">اسحب حيواناً إلى هنا لإخراجه من قفصه — أو اسحبه من هنا إلى قفص فاضي.</p>
      </div>
      {tray.length === 0 ? (
        <p className="text-xs font-bold text-ink-subtle">كل الحيوانات الراقدة موزّعة داخل أقفاصها.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tray.map((a) => <OccupantChip key={a.id} a={a} pet={pets[a.pet_id]} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

/* ── محرّر التخطيط ────────────────────────────────────────────────────────── */
function RoomEditor({ room, onChange, onDelete }: {
  room: CageRoom; onChange: (r: CageRoom) => void; onDelete: () => void;
}) {
  const [code, setCode] = useState("");
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState("");

  const addCode = () => {
    const c = code.trim();
    if (!c) return;
    if (room.cages.some((x) => norm(x) === norm(c))) { setCode(""); return; }
    onChange({ ...room, cages: [...room.cages, c] });
    setCode("");
  };
  // سلسلة سريعة: بادئة + عدد → «أ-١ … أ-٨» بضغطة واحدة بدل كتابة كل رمز بيده.
  const addSeries = () => {
    const p = prefix.trim(), n = Math.min(60, Math.max(1, Number(count) || 0));
    if (!p || !n) return;
    const have = new Set(room.cages.map(norm));
    const next = [...room.cages];
    for (let i = 1; i <= n; i++) {
      const c = `${p}-${i}`;
      if (!have.has(norm(c))) { next.push(c); have.add(norm(c)); }
    }
    onChange({ ...room, cages: next });
    setPrefix(""); setCount("");
  };

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-3">
      <div className="mb-2 flex items-center gap-2">
        <DoorOpen size={15} className="shrink-0 text-ink-subtle" />
        <input value={room.name} onChange={(e) => onChange({ ...room, name: e.target.value })}
          placeholder="اسم الغرفة (مثال: غرفة العزل)" className="input h-9 flex-1 text-sm font-bold" />
        <button type="button" onClick={onDelete} title="حذف الغرفة"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-subtle transition hover:border-danger-300 hover:text-danger-600">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {room.cages.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] font-black text-ink" dir="auto">
            {c}
            <button type="button" onClick={() => onChange({ ...room, cages: room.cages.filter((x) => x !== c) })}
              className="text-ink-subtle transition hover:text-danger-600" title="إزالة">
              <X size={12} />
            </button>
          </span>
        ))}
        {room.cages.length === 0 && <span className="text-[11px] font-bold text-ink-subtle">ما في أقفاص بعد — ضيف رموزها تحت.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input value={code} onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }}
          placeholder="رمز قفص (مثال: أ-١)" className="input h-9 w-36 text-sm" />
        <button type="button" onClick={addCode} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-ink">
          <Plus size={13} /> إضافة
        </button>
        <span className="mx-1 hidden text-[10px] font-bold text-ink-subtle sm:block">أو سلسلة:</span>
        <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="بادئة (أ)" className="input h-9 w-24 text-sm" />
        <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="العدد" className="input h-9 w-20 text-sm" />
        <button type="button" onClick={addSeries} className="h-9 rounded-lg border border-line px-2.5 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-ink">
          إنشاء سلسلة
        </button>
      </div>
    </div>
  );
}

function LayoutEditor({ open, onClose, initial, onSaved }: {
  open: boolean; onClose: () => void; initial: CageRoom[]; onSaved: (rooms: CageRoom[]) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<CageRoom[]>([]);
  useEffect(() => {
    if (open) setDraft(initial.length ? initial.map((r) => ({ ...r, cages: [...r.cages] })) : [{ id: uid("room"), name: "", cages: [] }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    // رمز القفص هو هوية الإفلات — تكراره عبر الغرف يجعل هدفين بنفس الاسم.
    const seen = new Map<string, string>();
    for (const r of draft) for (const c of r.cages) {
      const k = norm(c);
      if (seen.has(k)) { toast.error(`رمز القفص «${c}» مكرّر`, "كل قفص لازم يكون برمز فريد عبر كل الغرف."); return; }
      seen.set(k, c);
    }
    if (draft.some((r) => !r.name.trim() && r.cages.length > 0)) {
      toast.error("في غرفة بلا اسم", "سمِّ كل غرفة فيها أقفاص حتى تظهر على الخريطة.");
      return;
    }
    playTap();
    const clean = draft.filter((r) => r.name.trim());
    setCageLayout(clean);
    onSaved(getCageLayout());
    playSuccess();
    toast.success("انحفظ تخطيط الأقفاص");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="تخطيط الغرف والأقفاص" size="wide">
      <div className="space-y-3">
        <p className="text-xs font-bold leading-relaxed text-ink-subtle">
          ارسم عيادتك مرة واحدة: كل غرفة باسمها، وداخلها رموز أقفاصها. حذف قفص من التخطيط لا يمسّ أي حيوان —
          إذا كان فيه حيوان راقد يظهر تلقائياً ضمن «أقفاص غير مصنّفة» حتى ينتقل.
        </p>
        {draft.map((r, i) => (
          <RoomEditor key={r.id} room={r}
            onChange={(next) => setDraft((d) => d.map((x, j) => (j === i ? next : x)))}
            onDelete={() => setDraft((d) => d.filter((_, j) => j !== i))} />
        ))}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDraft((d) => [...d, { id: uid("room"), name: "", cages: [] }])}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-ink">
            <Plus size={14} /> إضافة غرفة
          </button>
          <button type="button" onClick={save}
            className="ms-auto inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-black text-white shadow-soft transition hover:bg-brand-700">
            حفظ التخطيط
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── الخريطة ──────────────────────────────────────────────────────────────── */
export function CageMap() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id;

  const [ops, setOps] = useState(() => opsStore.get());
  const [rooms, setRooms] = useState<CageRoom[]>(() => getCageLayout());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wall, setWall] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    if (!opsStore.get().hydrated) void opsStore.hydrate(clinicId).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // نبضة كل ٣٠ ثانية: تقلب «جرعة مستحقّة» بلا تحديث يدوي، وتحرّك ساعة وضع الشاشة.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const actives = useMemo(() => ops.admissions.filter((a) => a.status !== "discharged"), [ops.admissions]);
  const occupants = useMemo(() => {
    const m = new Map<string, Admission[]>();
    for (const a of actives) {
      const k = norm(a.cage);
      if (!k) continue;
      const arr = m.get(k);
      if (arr) arr.push(a); else m.set(k, [a]);
    }
    return m;
  }, [actives]);
  const tray = useMemo(() => actives.filter((a) => !norm(a.cage)), [actives]);

  // التبنّي التلقائي: رموز موجودة على رقود نشطة وغير مرسومة → غرفة اصطناعية.
  const shownRooms = useMemo(() => {
    const known = new Set<string>();
    for (const r of rooms) for (const c of r.cages) known.add(norm(c));
    const orphans: string[] = [];
    const seen = new Set<string>();
    for (const a of actives) {
      const k = norm(a.cage);
      if (!k || known.has(k) || seen.has(k)) continue;
      seen.add(k);
      orphans.push((a.cage ?? "").trim());
    }
    return orphans.length ? [...rooms, { id: "_adopted", name: "أقفاص غير مصنّفة", cages: orphans }] : rooms;
  }, [rooms, actives]);

  const totalCages = shownRooms.reduce((n, r) => n + r.cages.length, 0);
  const occupied = shownRooms.reduce((n, r) => n + r.cages.filter((c) => (occupants.get(norm(c)) ?? []).length > 0).length, 0);
  const free = totalCages - occupied;
  const petName = (a: Admission) => ops.pets[a.pet_id]?.name ?? "الحيوان";

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const persist = async (id: string, patch: Partial<Admission>): Promise<boolean> => {
    try {
      await opsStore.patch(id, patch);
      return true;
    } catch (e) {
      playWarning();
      toast.error("تعذّر نقل الحيوان، حاول مجدداً.", e instanceof Error ? e.message : undefined);
      return false;
    }
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over;
    if (!over) return;
    const id = String(e.active.id);
    const adm = actives.find((a) => a.id === id);
    if (!adm) return;
    const overId = String(over.id);
    playTap();

    if (overId === "tray") {
      if (!norm(adm.cage)) return;
      void persist(id, { cage: "" }).then((ok) => {
        if (ok) { playSuccess(); toast.success(`أُخرج ${petName(adm)} من قفصه`); }
      });
      return;
    }
    if (!overId.startsWith("cage:")) return;
    const targetKey = overId.slice(5);
    const display = (over.data.current as { display?: string } | undefined)?.display ?? targetKey;
    if (norm(adm.cage) === targetKey) return;

    const other = (occupants.get(targetKey) ?? []).find((o) => o.id !== id);
    if (!other) {
      void persist(id, { cage: display }).then((ok) => {
        if (ok) { playSuccess(); toast.success(`انتقل ${petName(adm)} إلى القفص ${display}`); }
      });
      return;
    }
    // القفص مشغول → تبادل: الساكن الحالي يأخذ قفص القادم (أو يصير بلا قفص لو
    // جاء من الحوض). نقلتان منفصلتان عبر opsStore — كل واحدة تُسجَّل بالتنقلات.
    const back = (adm.cage ?? "").trim();
    void (async () => {
      if (!(await persist(id, { cage: display }))) return;
      const ok2 = await persist(other.id, { cage: back });
      if (ok2) {
        playSuccess();
        toast.success(
          `تبادل: ${petName(adm)} إلى ${display}` + (back ? `، و${petName(other)} إلى ${back}` : `، و${petName(other)} صار بلا قفص`),
        );
      } else {
        // النقلة الأولى انحفظت والثانية لا — القفص يظهر بساكنَين على الخريطة
        // (النموذج يسمح)، والرسالة تخلي الإصلاح بسحبة واحدة واضحة.
        toast.error(`انتقل ${petName(adm)} إلى ${display}، لكن ما انتقل ${petName(other)}`, "اسحبه بنفسك لقفصه الجديد.");
      }
    })();
  };

  const activeAdm = activeId ? actives.find((a) => a.id === activeId) : undefined;
  const openPet = (petId: string) => { playTap(); navigate(`/pet/${petId}?tab=timeline`); };
  const canEdit = can("manageSettings");
  const loading = !ops.hydrated;
  const emptyLayout = rooms.length === 0 && occupants.size === 0;

  const clock = now.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });

  const body = (
    <div className="space-y-4">
      {/* شريط الحالة: عدادات + شريط الإشغال + مفاتيح اللون */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <span className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-center">
          <span className="block text-base font-black leading-none tabular-nums text-ink">{formatNum(totalCages)}</span>
          <span className="text-[10px] font-bold text-ink-subtle">قفص</span>
        </span>
        <span className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-center">
          <span className="block text-base font-black leading-none tabular-nums text-ink">{formatNum(occupied)}</span>
          <span className="text-[10px] font-bold text-ink-subtle">مشغول</span>
        </span>
        <span className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-center">
          <span className="block text-base font-black leading-none tabular-nums text-success-600 dark:text-success-300">{formatNum(free)}</span>
          <span className="text-[10px] font-bold text-ink-subtle">متاح</span>
        </span>
        {totalCages > 0 && (
          <div className="min-w-[120px] flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-brand-grad transition-all" style={{ width: `${Math.round((occupied / totalCages) * 100)}%` }} />
            </div>
            <p className="mt-0.5 text-[10px] font-bold text-ink-subtle">إشغال {formatNum(Math.round((occupied / totalCages) * 100))}٪</p>
          </div>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2 text-[10px] font-bold text-ink-subtle">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> علاج</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> فندقة علاجية</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> فندقة</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse-ring rounded-full bg-warn-500" /> جرعة مستحقّة</span>
        </div>
      </div>

      {loading ? (
        <div className="card grid place-items-center p-10"><Loader2 size={22} className="animate-spin text-ink-subtle" /></div>
      ) : emptyLayout ? (
        <div className="card grid place-items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Boxes size={26} /></span>
          <div>
            <h3 className="text-base font-black text-ink">ارسم خريطة عيادتك</h3>
            <p className="mx-auto mt-1 max-w-md text-xs font-bold leading-relaxed text-ink-subtle">
              عرّف غرفك وأقفاصها مرة واحدة، وبعدها كل حيوان راقد يظهر داخل قفصه على الخريطة —
              وتنقله بالسحب والإفلات، وكل نقلة تنحفظ برحلة الحيوان تلقائياً.
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={() => { playTap(); setEditorOpen(true); }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-black text-white shadow-soft transition hover:bg-brand-700">
              <Pencil size={14} /> رسم التخطيط
            </button>
          )}
        </div>
      ) : (
        shownRooms.filter((r) => r.cages.length > 0).map((room) => {
          const occ = room.cages.filter((c) => (occupants.get(norm(c)) ?? []).length > 0).length;
          return (
            <section key={room.id} data-room={room.name} className="card p-3">
              <div className="mb-2 flex items-center gap-2">
                <DoorOpen size={15} className="text-ink-subtle" />
                <h3 className="text-sm font-black text-ink" dir="auto">{room.name}</h3>
                <span className="rounded-full bg-surface-2 px-2 text-[11px] font-black tabular-nums text-ink-subtle">
                  {formatNum(occ)}/{formatNum(room.cages.length)}
                </span>
              </div>
              <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4", wall ? "xl:grid-cols-6 2xl:grid-cols-8" : "xl:grid-cols-5")}>
                {room.cages.map((c) => (
                  <CageTile key={norm(c)} code={c} list={occupants.get(norm(c)) ?? []} pets={ops.pets} onOpen={openPet} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {!loading && (!emptyLayout || tray.length > 0) && <TrayZone tray={tray} pets={ops.pets} onOpen={openPet} />}
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className={cn(wall && "fixed inset-0 z-50 overflow-y-auto bg-surface p-4 sm:p-6")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {wall && (
            <>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white shadow-card"><Boxes size={20} /></span>
              <h2 className="text-lg font-black text-ink">خريطة الأقفاص</h2>
              <span className="rounded-full border border-line bg-surface-1 px-3 py-1 text-sm font-black tabular-nums text-ink">{clock}</span>
            </>
          )}
          <div className="ms-auto flex items-center gap-2">
            {canEdit && !wall && (
              <button type="button" onClick={() => { playTap(); setEditorOpen(true); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-3 text-xs font-extrabold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                <Pencil size={13} /> تعديل التخطيط
              </button>
            )}
            <button type="button" onClick={() => { playTap(); setWall((w) => !w); }}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold transition",
                wall ? "bg-brand-600 text-white shadow-soft hover:bg-brand-700" : "border border-line bg-surface-1 text-ink-muted hover:border-brand-300 hover:text-ink")}>
              {wall ? <>خروج</> : <><Maximize2 size={13} /> شاشة الغرفة</>}
            </button>
          </div>
        </div>
        {body}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeAdm ? <ChipGhost a={activeAdm} pet={ops.pets[activeAdm.pet_id]} /> : null}
      </DragOverlay>
      <LayoutEditor open={editorOpen} onClose={() => setEditorOpen(false)} initial={rooms} onSaved={setRooms} />
    </DndContext>
  );
}
