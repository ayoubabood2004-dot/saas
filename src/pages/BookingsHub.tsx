import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarCheck2, ChevronLeft, ChevronRight, Check, X, Phone, MessageCircle,
  UserCheck, UserX, Stethoscope, DoorOpen, Flag, Hourglass, TrendingUp,
  CalendarDays, LayoutGrid,
} from "lucide-react";
import type { Appointment, AppointmentStatus, Pet } from "@/types";
import { repo } from "@/lib/repo";
import { bumpBookingRequests } from "@/lib/bookingRequests";
import { getDialCode, getClinicName } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { formatTime, dateLocale, cn, formatNum, localISO } from "@/lib/utils";
import { getCached, setCached } from "@/lib/swrCache";
import { PetAvatar } from "@/components/PetAvatar";
import { EmptyState, useToast } from "@/components/ui";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * «الحجوزات» — the booking command centre.
 *   • Two views (Reception-style toggle): يومي = premium timeline with a live
 *     «الآن» marker + lifecycle actions; شهري = full month calendar where every
 *     day shows its load at a glance and clicks through to that day.
 *   • KPI cards adapt to the visible period; filter chips segment by attendance
 *     (منو حضر فعلاً vs منو بس حجز).
 *   • All day math is LOCAL-calendar based (UTC must never hide an evening).
 * ==========================================================================*/

type FilterKey = "all" | "requested" | "confirmed" | "attended" | "no_show" | "cancelled";
type ViewKey = "day" | "month";

const bucketOf = (s: AppointmentStatus): Exclude<FilterKey, "all"> =>
  s === "requested" ? "requested"
  : s === "confirmed" ? "confirmed"
  : s === "cancelled" ? "cancelled"
  : s === "no_show" ? "no_show"
  : "attended"; // checked_in | in_room | done

/** Visual identity of every lifecycle stage: chip + timeline/calendar dot + card accent. */
const STATUS_META: Record<AppointmentStatus, { key: string; def: string; chip: string; dot: string; edge: string; icon: typeof Check }> = {
  requested:  { key: "bookings.st.requested",  def: "جديد — ينتظر التأكيد", chip: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",          dot: "bg-warn-400",    edge: "border-s-warn-400",    icon: Hourglass },
  confirmed:  { key: "bookings.st.confirmed",  def: "مؤكد",                 chip: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",      dot: "bg-brand-500",   edge: "border-s-brand-500",   icon: Check },
  checked_in: { key: "bookings.st.checked_in", def: "حضر ✓",                chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",              dot: "bg-sky-500",     edge: "border-s-sky-500",     icon: UserCheck },
  in_room:    { key: "bookings.st.in_room",    def: "بالغرفة",              chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",              dot: "bg-sky-500",     edge: "border-s-sky-500",     icon: DoorOpen },
  done:       { key: "bookings.st.done",       def: "اكتملت الزيارة",       chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", dot: "bg-success-500", edge: "border-s-success-500", icon: Flag },
  no_show:    { key: "bookings.st.no_show",    def: "ما حضر",               chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",  dot: "bg-danger-500",  edge: "border-s-danger-500",  icon: UserX },
  cancelled:  { key: "bookings.st.cancelled",  def: "ملغي",                 chip: "bg-surface-2 text-ink-subtle",                                             dot: "bg-line-strong", edge: "border-s-line",        icon: X },
};

const dayISOFromOffset = (off: number) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return localISO(d);
};

export function BookingsHub() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>("day");
  const [offset, setOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [monthAppts, setMonthAppts] = useState<Appointment[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dayISO = dayISOFromOffset(offset);
  const dayKey = `bk_day_${dayISO}`;

  /* --------------------------- day data (SWR) ----------------------------
   * سرعة الضوء: أول ما تنفتح الصفحة (أو يتبدل اليوم) نرسم فوراً آخر نسخة
   * محفوظة بالذاكرة — بدون أي سكيلتون — والتحديث الحقيقي يصير بالخفاء ويحل
   * محلها بصمت. جلب الحيوانات صار دفعة وحدة بدل استعلام لكل حيوان. */
  useEffect(() => {
    if (view !== "day") return;
    const cached = getCached<{ appts: Appointment[]; pets: Record<string, Pet> }>(dayKey);
    if (cached) {
      setAppts(cached.appts);
      setPets(cached.pets);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let alive = true;
    void (async () => {
      try {
        const list = await repo.listBookingsForDay(dayISO);
        const petList = await repo.getPetsByIds([...new Set(list.map((a) => a.pet_id))]).catch(() => [] as Pet[]);
        const map = Object.fromEntries(petList.map((p) => [p.id, p]));
        setCached(dayKey, { appts: list, pets: map });
        if (!alive) return;
        setAppts(list);
        setPets(map);
      } catch { /* transient — keep whatever is painted */ } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayISO, view]);

  /* ------------------------------ month data ------------------------------ */
  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  useEffect(() => {
    if (view !== "month") return;
    const monthKey = `bk_month_${localISO(monthStart).slice(0, 7)}`;
    const cached = getCached<Appointment[]>(monthKey);
    if (cached) { setMonthAppts(cached); setLoading(false); } else setLoading(true);
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    repo.listAppointmentsInRange(localISO(monthStart), localISO(end))
      .then((list) => { setCached(monthKey, list); setMonthAppts(list); })
      .catch(() => { if (!cached) setMonthAppts([]); })
      .finally(() => setLoading(false));
  }, [view, monthStart]);

  /** month day → its bookings (local-calendar grouping). */
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of monthAppts) {
      const k = localISO(new Date(a.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [monthAppts]);

  /* ------------------------------- shared -------------------------------- */
  const scope = view === "day" ? appts : monthAppts;
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: scope.length, requested: 0, confirmed: 0, attended: 0, no_show: 0, cancelled: 0 };
    for (const a of scope) c[bucketOf(a.status)]++;
    return c;
  }, [scope]);

  const visible = filter === "all" ? appts : appts.filter((a) => bucketOf(a.status) === filter);
  const decided = counts.attended + counts.no_show;
  const attendRate = decided ? Math.round((counts.attended / decided) * 100) : null;

  const setStatus = async (a: Appointment, status: AppointmentStatus, okMsgKey: string, okMsgDef: string) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      await repo.setAppointmentStatus(a.id, status);
      playSuccess();
      toast.success(t(okMsgKey, okMsgDef));
      setAppts((rs) => {
        const next = rs.map((r) => (r.id === a.id ? { ...r, status } : r));
        setCached(dayKey, { appts: next, pets }); // الكاش يواكب فوراً
        return next;
      });
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
  const nowIndex = view === "day" && offset === 0 ? visible.findIndex((a) => !isPastSlot(a)) : -1;
  const PrevIcon = i18n.dir() === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;

  const KPIS = [
    { label: view === "day" ? t("bookings.kToday", "حجوزات اليوم") : t("bookings.kMonth", "حجوزات الشهر"), value: counts.all, icon: CalendarCheck2, wrap: "from-brand-50 to-sky-50 dark:from-brand-500/10 dark:to-sky-500/5", bubble: "bg-brand-600" },
    { label: t("bookings.kWaiting", "بالانتظار"), value: counts.requested + counts.confirmed, icon: Hourglass, wrap: "from-warn-50 to-amber-50 dark:from-warn-500/10 dark:to-warn-500/5", bubble: "bg-warn-500" },
    { label: t("bookings.kAttended", "حضروا"), value: counts.attended, icon: UserCheck, wrap: "from-success-50 to-emerald-50 dark:from-success-500/10 dark:to-success-500/5", bubble: "bg-success-500", sub: attendRate != null ? t("bookings.attendRate", { p: attendRate, defaultValue: "نسبة الحضور {{p}}%" }) : undefined },
    { label: t("bookings.kNoShow", "ما حضروا"), value: counts.no_show, icon: UserX, wrap: "from-danger-50 to-rose-50 dark:from-danger-500/10 dark:to-danger-500/5", bubble: "bg-danger-500" },
  ];

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("bookings.fAll", "الكل") },
    { key: "requested", label: t("bookings.fRequested", "جديدة") },
    { key: "confirmed", label: t("bookings.fConfirmed", "مؤكدة") },
    { key: "attended", label: t("bookings.fAttended", "حضروا") },
    { key: "no_show", label: t("bookings.fNoShow", "ما حضروا") },
    { key: "cancelled", label: t("bookings.fCancelled", "ملغية") },
  ];

  /* ---------------------------- month grid cells --------------------------- */
  // أسبوع العراق يبدأ السبت: getDay السبت=6 → عمود 0
  const colOf = (d: Date) => (d.getDay() + 1) % 7;
  const monthDays = useMemo(() => {
    const days: { iso: string; date: Date }[] = [];
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= end; i++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i);
      days.push({ iso: localISO(d), date: d });
    }
    return days;
  }, [monthStart]);
  const weekdayNames = useMemo(() => {
    // مرجع: سبت معروف (2026-01-03 سبت) — نولد الأسماء بلغة الواجهة
    const base = new Date("2026-01-03T12:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(lang, { weekday: "short" });
    });
  }, [lang]);
  const todayISO = localISO(new Date());

  const openDay = (iso: string) => {
    playTap();
    const diff = Math.round((new Date(iso + "T12:00:00").getTime() - new Date(todayISO + "T12:00:00").getTime()) / 864e5);
    setOffset(diff);
    setView("day");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* ── Header: العنوان + مبدل العرض + ملاح الفترة ── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><CalendarCheck2 size={21} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">{t("bookings.title", "الحجوزات")}</h1>
          <p className="text-xs text-ink-subtle">{t("bookings.subtitle", "كل حجز بموعده — من الطلب إلى الحضور")}</p>
        </div>

        {/* مبدل يومي/شهري — نفس نمط التقويم الرئيسي */}
        <div className="inline-flex items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
          <button onClick={() => { playTap(); setView("day"); }} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition", view === "day" ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
            <CalendarDays size={15} /> {t("bookings.viewDay", "يومي")}
          </button>
          <button onClick={() => { playTap(); setView("month"); }} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition", view === "month" ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
            <LayoutGrid size={15} /> {t("bookings.viewMonth", "شهري")}
          </button>
        </div>

        {/* ملاح الفترة */}
        <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface-1 p-1.5 shadow-card">
          <button onClick={() => { playTap(); view === "day" ? setOffset((o) => o - 1) : setMonthOffset((o) => o - 1); }} className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-brand-50 hover:text-brand-600 active:scale-95 dark:hover:bg-brand-500/15"><PrevIcon size={18} strokeWidth={2.5} /></button>
          <div className="min-w-40 text-center">
            <p className="font-display text-sm font-extrabold text-ink tabular-nums">
              {view === "day"
                ? dayDate.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })
                : monthStart.toLocaleDateString(lang, { month: "long", year: "numeric" })}
            </p>
            {view === "day" ? (
              offset !== 0 ? (
                <button onClick={() => { playTap(); setOffset(0); }} className="text-2xs font-bold text-brand-600 hover:underline">{t("stickyNotes.backToday", "ارجع لليوم")}</button>
              ) : (
                <p className="text-2xs font-semibold text-success-600">{t("stickyNotes.today", "اليوم")}</p>
              )
            ) : monthOffset !== 0 ? (
              <button onClick={() => { playTap(); setMonthOffset(0); }} className="text-2xs font-bold text-brand-600 hover:underline">{t("bookings.thisMonth", "هذا الشهر")}</button>
            ) : (
              <p className="text-2xs font-semibold text-success-600">{t("bookings.thisMonth", "هذا الشهر")}</p>
            )}
          </div>
          <button onClick={() => { playTap(); view === "day" ? setOffset((o) => o + 1) : setMonthOffset((o) => o + 1); }} className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-brand-50 hover:text-brand-600 active:scale-95 dark:hover:bg-brand-500/15"><NextIcon size={18} strokeWidth={2.5} /></button>
        </div>
      </div>

      {/* ── KPI strip (تتبع الفترة المعروضة) ── */}
      <motion.div key={view} variants={staggerContainer} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <motion.div key={k.label} variants={staggerItem} className={cn("relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br p-4", k.wrap)}>
              <span className={cn("mb-2 grid h-9 w-9 place-items-center rounded-xl text-white shadow-soft", k.bubble)}><Icon size={17} /></span>
              <p className="font-display text-3xl font-extrabold leading-none tracking-tighter2 text-ink tabular-nums">{formatNum(k.value)}</p>
              <p className="mt-1 text-xs font-semibold text-ink-muted">{k.label}</p>
              {k.sub && <p className="mt-0.5 flex items-center gap-1 text-2xs font-bold text-success-700 dark:text-success-300"><TrendingUp size={11} /> {k.sub}</p>}
            </motion.div>
          );
        })}
      </motion.div>

      {view === "month" ? (
        /* ═══════════════════════════ العرض الشهري ═══════════════════════════ */
        <div className="card overflow-hidden p-0">
          {/* رؤوس أيام الأسبوع */}
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/60">
            {weekdayNames.map((w) => (
              <div key={w} className="py-2.5 text-center text-xs font-bold text-ink-muted">{w}</div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }, (_, i) => <div key={i} className="m-1 h-24 animate-pulse rounded-xl bg-surface-2" />)}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {/* فراغات ما قبل أول يوم */}
              {Array.from({ length: colOf(monthStart) }, (_, i) => <div key={`b${i}`} className="min-h-24 border-b border-e border-line/60 bg-surface-2/30" />)}
              {monthDays.map(({ iso, date }) => {
                const list = byDay.get(iso) ?? [];
                const isToday = iso === todayISO;
                const dots = [...new Set(list.map((a) => STATUS_META[a.status]?.dot ?? "bg-line-strong"))].slice(0, 4);
                return (
                  <button
                    key={iso}
                    onClick={() => openDay(iso)}
                    className={cn(
                      "group relative min-h-24 border-b border-e border-line/60 p-1.5 text-start align-top transition hover:bg-brand-50/60 dark:hover:bg-brand-500/10",
                      isToday && "bg-brand-50/80 dark:bg-brand-500/15",
                    )}
                  >
                    <span className={cn(
                      "grid h-6 w-6 place-items-center rounded-full text-xs font-bold tabular-nums",
                      isToday ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted group-hover:text-ink",
                    )}>
                      {date.getDate()}
                    </span>
                    {list.length > 0 && (
                      <>
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-600/90 px-2 py-0.5 text-2xs font-bold text-white shadow-soft">
                          {formatNum(list.length)} {t("bookings.cellCount", "حجز")}
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          {dots.map((d) => <span key={d} className={cn("h-1.5 w-1.5 rounded-full", d)} />)}
                        </span>
                        {/* أول موعدين — لمحة سريعة */}
                        <span className="mt-1 hidden flex-col gap-0.5 lg:flex">
                          {list.slice(0, 2).map((a) => (
                            <span key={a.id} className="truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-ink-muted tabular-nums">
                              {formatTime(a.scheduled_at, i18n.language)} · {a.doctor_name.replace(/^Dr\.?\s*/i, "").split(" ")[0]}
                            </span>
                          ))}
                          {list.length > 2 && <span className="text-2xs font-bold text-brand-600">+{formatNum(list.length - 2)}</span>}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="border-t border-line bg-surface-2/40 px-4 py-2 text-center text-2xs text-ink-subtle">{t("bookings.monthHint", "اضغط أي يوم لفتح جدوله الكامل")}</p>
        </div>
      ) : (
        /* ═══════════════════════════ العرض اليومي ═══════════════════════════ */
        <>
          {/* الفلاتر */}
          <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-2xl bg-surface-2 p-1.5 no-print [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => { playTap(); setFilter(f.key); }}
                  className={cn(
                    "relative flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                    active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span layoutId="bookings-filter" className="absolute inset-0 rounded-xl bg-surface-1 shadow-card" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                  )}
                  <span className="relative z-10">{f.label}</span>
                  <span className={cn("relative z-10 grid h-5 min-w-5 place-items-center rounded-full px-1 text-2xs font-bold", active ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-subtle")}>
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* الخط الزمني */}
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-2" />)}</div>
          ) : visible.length === 0 ? (
            <EmptyState icon={<CalendarCheck2 size={26} />} title={t("bookings.empty", "ماكو حجوزات بهذا اليوم/الفلتر.")} />
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative">
              <span className="pointer-events-none absolute bottom-3 top-3 start-[4.4rem] hidden w-0.5 rounded-full bg-line sm:block" aria-hidden />
              <div className="space-y-3">
                {visible.map((a, i) => {
                  const pet = pets[a.pet_id];
                  const meta = STATUS_META[a.status] ?? STATUS_META.requested;
                  const ChipIcon = meta.icon;
                  const wa = waHref(a);
                  return (
                    <div key={a.id}>
                      {i === nowIndex && (
                        <div className="mb-3 flex items-center gap-2 ps-0 sm:ps-24">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-400 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger-500" />
                          </span>
                          <span className="text-xs font-bold text-danger-600 tabular-nums">{t("bookings.now", "الآن")} · {formatTime(new Date().toISOString(), i18n.language)}</span>
                          <span className="h-px flex-1 bg-danger-200 dark:bg-danger-500/30" />
                        </div>
                      )}

                      <motion.div variants={staggerItem} className="flex items-stretch gap-3 sm:gap-4">
                        <div className="relative hidden w-20 shrink-0 flex-col items-center justify-center sm:flex">
                          <p className="font-display text-base font-extrabold leading-tight text-ink tabular-nums">{formatTime(a.scheduled_at, i18n.language)}</p>
                          <p className="text-2xs text-ink-subtle">{a.duration_min} {t("common.minutes", "دقيقة")}</p>
                          <span className={cn("absolute -end-[0.72rem] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-surface shadow-soft", meta.dot)} aria-hidden />
                        </div>

                        <div className={cn(
                          "card group flex min-w-0 flex-1 flex-col gap-3 border-s-4 p-4 transition hover:-translate-y-0.5 hover:shadow-raised lg:flex-row lg:items-center",
                          meta.edge,
                          a.status === "cancelled" && "opacity-55 saturate-50",
                        )}>
                          <button onClick={() => navigate(`/pet/${a.pet_id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                            {pet && (
                              <span className="rounded-full ring-2 ring-transparent transition group-hover:ring-brand-200 dark:group-hover:ring-brand-500/40">
                                <PetAvatar pet={pet} size={48} photoFallback />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="truncate font-display font-bold text-ink">{pet?.name ?? t("bookReq.aPet", "حيوان")}</span>
                                {pet?.owner_name && <span className="truncate text-sm text-ink-muted">{pet.owner_name}</span>}
                                <span className="text-xs font-semibold text-ink-subtle tabular-nums sm:hidden">· {formatTime(a.scheduled_at, i18n.language)}</span>
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                                <span className="flex items-center gap-1"><Stethoscope size={12} className="text-brand-600" /> {t(`service.${a.service}`)} · {a.doctor_name}</span>
                                {a.symptoms && <span className="truncate italic">”{a.symptoms}“</span>}
                              </span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold", meta.chip)}>
                              <ChipIcon size={13} /> {t(meta.key, meta.def)}
                            </span>

                            <span className="ms-auto flex items-center gap-1.5 lg:ms-0">
                              {pet?.owner_phone && (
                                <a href={`tel:${pet.owner_phone}`} onClick={() => playTap()} title={t("dashboard.callClinic", "اتصال")}
                                   className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
                                  <Phone size={15} />
                                </a>
                              )}
                              {wa && a.status !== "cancelled" && a.status !== "no_show" && (
                                <a href={wa} target="_blank" rel="noreferrer" onClick={() => playTap()} title={t("bookReq.waTitle", "إبلاغ الزبون واتساب")}
                                   className="grid h-9 w-9 place-items-center rounded-xl bg-success-500 text-white shadow-soft transition hover:bg-success-600">
                                  <MessageCircle size={15} />
                                </a>
                              )}
                              {a.status === "requested" && (
                                <>
                                  <button disabled={busyId === a.id} onClick={() => setStatus(a, "cancelled", "bookReq.rejected", "تم الاعتذار عن الحجز")} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"><X size={14} /> {t("bookReq.reject", "اعتذار")}</button>
                                  <button disabled={busyId === a.id} onClick={() => setStatus(a, "confirmed", "bookReq.confirmed", "تم تأكيد الحجز ✓")} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50"><Check size={14} /> {t("bookReq.confirm", "تأكيد الحجز")}</button>
                                </>
                              )}
                              {a.status === "confirmed" && (
                                <>
                                  <button disabled={busyId === a.id} onClick={() => setStatus(a, "no_show", "bookings.markedNoShow", "انعلم: ما حضر")} className={cn("inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50", isPastSlot(a) ? "border-danger-300 bg-danger-50 text-danger-700 hover:bg-danger-100 dark:border-danger-500/40 dark:bg-danger-500/15 dark:text-danger-300" : "border-line bg-surface-2 text-ink-muted hover:text-danger-600")}><UserX size={14} /> {t("bookings.noShowBtn", "ما حضر")}</button>
                                  <button disabled={busyId === a.id} onClick={() => setStatus(a, "checked_in", "bookings.markedArrived", "أهلاً به — وصل ✓")} className="inline-flex items-center gap-1 rounded-xl bg-success-500 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-success-600 disabled:opacity-50"><UserCheck size={14} /> {t("bookings.arrivedBtn", "وصل")}</button>
                                </>
                              )}
                              {(a.status === "checked_in" || a.status === "in_room") && (
                                <button disabled={busyId === a.id} onClick={() => setStatus(a, "done", "bookings.markedDone", "اكتملت الزيارة 🎉")} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-50"><Flag size={14} /> {t("bookings.doneBtn", "اكتملت")}</button>
                              )}
                              {a.status === "no_show" && (
                                <button disabled={busyId === a.id} onClick={() => setStatus(a, "checked_in", "bookings.markedArrived", "أهلاً به — وصل ✓")} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-success-300 hover:text-success-600 disabled:opacity-50"><UserCheck size={14} /> {t("bookings.cameAfterAll", "لا، حضر")}</button>
                              )}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
