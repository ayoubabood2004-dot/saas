import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck2, ChevronLeft, ChevronRight, Check, X, Phone, MessageCircle,
  UserCheck, UserX, Stethoscope, DoorOpen, Flag, Hourglass,
} from "lucide-react";
import type { Appointment, AppointmentStatus, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { bumpBookingRequests } from "@/lib/bookingRequests";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { formatTime, dateLocale, cn } from "@/lib/utils";
import { PetAvatar } from "@/components/PetAvatar";
import { EmptyState, useToast } from "@/components/ui";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * «الحجوزات» — the booking command centre. Every appointment of the day sits at
 * its exact time in one ordered schedule, flows through a full lifecycle
 * (جديد ← مؤكد ← حضر ← اكتمل / ما حضر / ملغي), and the filter chips answer the
 * business questions at a glance: who actually ATTENDED vs who merely booked.
 * ==========================================================================*/

type FilterKey = "all" | "requested" | "confirmed" | "attended" | "no_show" | "cancelled";

/** Which lifecycle bucket a status belongs to (attended = physically showed up). */
const bucketOf = (s: AppointmentStatus): Exclude<FilterKey, "all"> =>
  s === "requested" ? "requested"
  : s === "confirmed" ? "confirmed"
  : s === "cancelled" ? "cancelled"
  : s === "no_show" ? "no_show"
  : "attended"; // checked_in | in_room | done

const STATUS_CHIP: Record<AppointmentStatus, { key: string; def: string; cls: string; icon: typeof Check }> = {
  requested:  { key: "bookings.st.requested",  def: "جديد — ينتظر التأكيد", cls: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300", icon: Hourglass },
  confirmed:  { key: "bookings.st.confirmed",  def: "مؤكد",                 cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", icon: Check },
  checked_in: { key: "bookings.st.checked_in", def: "حضر ✓",                cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", icon: UserCheck },
  in_room:    { key: "bookings.st.in_room",    def: "بالغرفة",              cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", icon: DoorOpen },
  done:       { key: "bookings.st.done",       def: "اكتملت الزيارة",       cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", icon: Flag },
  no_show:    { key: "bookings.st.no_show",    def: "ما حضر",               cls: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300", icon: UserX },
  cancelled:  { key: "bookings.st.cancelled",  def: "ملغي",                 cls: "bg-surface-2 text-ink-subtle", icon: X },
};

export function BookingsHub() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dayISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  })();

  const load = async () => {
    try {
      const list = await repo.listBookingsForDay(dayISO);
      setAppts(list);
      const map: Record<string, Pet> = {};
      await Promise.all(
        [...new Set(list.map((a) => a.pet_id))].map(async (id) => {
          const p = await repo.getPet(id).catch(() => undefined);
          if (p) map[id] = p;
        }),
      );
      setPets(map);
    } catch { /* transient */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayISO]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: appts.length, requested: 0, confirmed: 0, attended: 0, no_show: 0, cancelled: 0 };
    for (const a of appts) c[bucketOf(a.status)]++;
    return c;
  }, [appts]);

  const visible = filter === "all" ? appts : appts.filter((a) => bucketOf(a.status) === filter);

  const setStatus = async (a: Appointment, status: AppointmentStatus, okMsgKey: string, okMsgDef: string) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      await repo.setAppointmentStatus(a.id, status);
      playSuccess();
      toast.success(t(okMsgKey, okMsgDef));
      setAppts((rs) => rs.map((r) => (r.id === a.id ? { ...r, status } : r)));
      if (a.status === "requested") bumpBookingRequests();
    } catch (e) {
      playWarning();
      toast.error(t("records.saveError", "تعذر الحفظ — حاول مرة ثانية."), e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const waHref = (a: Appointment): string | null => {
    const phone = pets[a.pet_id]?.owner_phone;
    if (!phone) return null;
    const when = `${new Date(a.scheduled_at).toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "long", day: "numeric", month: "long" })} ${formatTime(a.scheduled_at, i18n.language)}`;
    const msg = t("bookReq.waMsg", {
      owner: pets[a.pet_id]?.owner_name ?? "", pet: pets[a.pet_id]?.name ?? "", when, clinic: getClinicName(),
      defaultValue: "مرحباً {{owner}} 🌟 تم تأكيد موعد {{pet}} — {{when}} في {{clinic}}. بانتظاركم!",
    });
    return `https://wa.me/${waNumber(phone, getDialCode())}?text=${encodeURIComponent(msg)}`;
  };

  const lang = i18n.language === "ar" ? dateLocale() : "en-US";
  const dayDate = new Date(dayISO + "T12:00:00");
  const isPastSlot = (a: Appointment) => new Date(a.scheduled_at).getTime() < Date.now();
  const PrevIcon = i18n.dir() === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;

  const FILTERS: { key: FilterKey; label: string; tone: string }[] = [
    { key: "all",       label: t("bookings.fAll", "الكل"),             tone: "text-ink" },
    { key: "requested", label: t("bookings.fRequested", "جديدة"),      tone: "text-warn-700 dark:text-warn-300" },
    { key: "confirmed", label: t("bookings.fConfirmed", "مؤكدة"),      tone: "text-brand-700 dark:text-brand-300" },
    { key: "attended",  label: t("bookings.fAttended", "حضروا"),       tone: "text-success-700 dark:text-success-300" },
    { key: "no_show",   label: t("bookings.fNoShow", "ما حضروا"),      tone: "text-danger-700 dark:text-danger-300" },
    { key: "cancelled", label: t("bookings.fCancelled", "ملغية"),      tone: "text-ink-subtle" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header + day navigation */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><CalendarCheck2 size={20} /></span>
        <div className="me-auto">
          <h1 className="font-display text-xl font-extrabold tracking-tighter2 text-ink">{t("bookings.title", "الحجوزات")}</h1>
          <p className="text-xs text-ink-subtle">{t("bookings.subtitle", "كل حجز بموعده — من الطلب إلى الحضور")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface-1 p-1">
          <button onClick={() => { playTap(); setOffset((o) => o - 1); }} className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"><PrevIcon size={18} /></button>
          <div className="min-w-36 text-center">
            <p className="text-sm font-bold text-ink tabular-nums">{dayDate.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}</p>
            {offset !== 0 && (
              <button onClick={() => { playTap(); setOffset(0); }} className="text-2xs font-bold text-brand-600 hover:underline">{t("stickyNotes.backToday", "ارجع لليوم")}</button>
            )}
          </div>
          <button onClick={() => { playTap(); setOffset((o) => o + 1); }} className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"><NextIcon size={18} /></button>
        </div>
      </div>

      {/* Filter chips = live summary (منو حضر، منو بس حجز…) */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { playTap(); setFilter(f.key); }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition",
              filter === f.key ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 hover:border-brand-200",
              filter !== f.key && f.tone,
            )}
          >
            {f.label}
            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-2xs font-bold", filter === f.key ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Ordered schedule */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 size={26} />} title={t("bookings.empty", "ماكو حجوزات بهذا اليوم/الفلتر.")} />
      ) : (
        <div className="space-y-2">
          {visible.map((a) => {
            const pet = pets[a.pet_id];
            const chip = STATUS_CHIP[a.status] ?? STATUS_CHIP.requested;
            const ChipIcon = chip.icon;
            const wa = waHref(a);
            return (
              <div key={a.id} className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-3.5 sm:flex-row sm:items-center", a.status === "cancelled" && "opacity-60")}>
                {/* الوقت — العمود الثابت الي يرتب الجدول */}
                <div className="flex shrink-0 items-center gap-3 sm:w-24 sm:flex-col sm:gap-0.5 sm:text-center">
                  <p className="font-display text-lg font-extrabold text-ink tabular-nums">{formatTime(a.scheduled_at, i18n.language)}</p>
                  <p className="text-2xs text-ink-subtle">{a.duration_min} {t("common.minutes", "دقيقة")}</p>
                </div>

                <button onClick={() => navigate(`/pet/${a.pet_id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                  {pet && <PetAvatar pet={pet} size={44} photoFallback />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {pet?.name ?? t("bookReq.aPet", "حيوان")}
                      {pet?.owner_name && <span className="font-normal text-ink-muted"> — {pet.owner_name}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                      <span className="flex items-center gap-1"><Stethoscope size={12} /> {t(`service.${a.service}`)} · {a.doctor_name}</span>
                      {a.symptoms && <span className="truncate">💬 {a.symptoms}</span>}
                    </span>
                  </span>
                </button>

                <span className={cn("inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold sm:self-center", chip.cls)}>
                  <ChipIcon size={13} /> {t(chip.key, chip.def)}
                </span>

                {/* الإجراءات حسب مرحلة الحجز */}
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {pet?.owner_phone && (
                    <a href={`tel:${pet.owner_phone}`} onClick={() => playTap()} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted transition hover:text-brand-600"><Phone size={15} /></a>
                  )}
                  {wa && a.status !== "cancelled" && a.status !== "no_show" && (
                    <a href={wa} target="_blank" rel="noreferrer" onClick={() => playTap()} className="grid h-9 w-9 place-items-center rounded-xl bg-success-500 text-white shadow-soft transition hover:bg-success-600"><MessageCircle size={15} /></a>
                  )}
                  {a.status === "requested" && (
                    <>
                      <button disabled={busyId === a.id} onClick={() => setStatus(a, "cancelled", "bookReq.rejected", "تم الاعتذار عن الحجز")} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"><X size={14} /> {t("bookReq.reject", "اعتذار")}</button>
                      <button disabled={busyId === a.id} onClick={() => setStatus(a, "confirmed", "bookReq.confirmed", "تم تأكيد الحجز ✓")} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50"><Check size={14} /> {t("bookReq.confirm", "تأكيد الحجز")}</button>
                    </>
                  )}
                  {a.status === "confirmed" && (
                    <>
                      <button disabled={busyId === a.id} onClick={() => setStatus(a, "no_show", "bookings.markedNoShow", "انعلم: ما حضر")} className={cn("inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50", isPastSlot(a) ? "border-danger-300 bg-danger-50 text-danger-700 hover:bg-danger-100 dark:bg-danger-500/15 dark:text-danger-300" : "border-line bg-surface-2 text-ink-muted hover:text-danger-600")}><UserX size={14} /> {t("bookings.noShowBtn", "ما حضر")}</button>
                      <button disabled={busyId === a.id} onClick={() => setStatus(a, "checked_in", "bookings.markedArrived", "أهلاً به — وصل ✓")} className="inline-flex items-center gap-1 rounded-xl bg-success-500 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-success-600 disabled:opacity-50"><UserCheck size={14} /> {t("bookings.arrivedBtn", "وصل")}</button>
                    </>
                  )}
                  {(a.status === "checked_in" || a.status === "in_room") && (
                    <button disabled={busyId === a.id} onClick={() => setStatus(a, "done", "bookings.markedDone", "اكتملت الزيارة 🎉")} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50"><Flag size={14} /> {t("bookings.doneBtn", "اكتملت")}</button>
                  )}
                  {a.status === "no_show" && (
                    <button disabled={busyId === a.id} onClick={() => setStatus(a, "checked_in", "bookings.markedArrived", "أهلاً به — وصل ✓")} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted transition hover:text-success-600 disabled:opacity-50"><UserCheck size={14} /> {t("bookings.cameAfterAll", "لا، حضر")}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
