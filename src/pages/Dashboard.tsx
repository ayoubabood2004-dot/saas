import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { withTimeout } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Stethoscope,
  PawPrint,
  Plus,
  ScanLine,
  ClipboardList,
  Clock,
  ArrowRight,
  Activity,
  Lightbulb,
  RotateCw,
  WifiOff,
  Zap,
  Timer,
  CheckCircle2,
  Hourglass,
} from "lucide-react";
import type { Appointment, Pet, Admission, Species, Reminder } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { formatTime, dateLocale, formatNum, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { PetAvatar } from "@/components/PetAvatar";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { BirthdaysWidget } from "@/components/BirthdaysWidget";
import { RemindersWidget } from "@/components/RemindersWidget";
import { buildUpcomingEvents } from "@/lib/events";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { Card, CardTitle, Button, Badge, RingStat, Skeleton, EmptyState, ProgressRing, type CurvePoint } from "@/components/ui";
import { staggerContainer, fadeUp } from "@/lib/motion";

// recharts loads lazily (after first paint) — both charts share one chunk.
const SpeciesDonut = lazy(() => import("@/components/dashboard/DashboardCharts").then((m) => ({ default: m.SpeciesDonut })));
const ActivityCurve = lazy(() => import("@/components/dashboard/DashboardCharts").then((m) => ({ default: m.ActivityCurve })));

const SPECIES_COLOR: Record<Species, string> = {
  dog: "#1266d8",
  cat: "#38bdf8",
  horse: "#fb5413",
  cow: "#16a34a",
  bird: "#a855f7",
  rabbit: "#f59e0b",
  other: "#94a3b8",
};

// Tip of the day — bilingual (title + body keys resolved through i18n so the
// advice reads in the user's language, not hardcoded English).
const TIPS = ["coldChain", "painScore", "weightFirst", "triageColour", "ownerClarity"] as const;

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Stale-while-revalidate: seed from the last snapshot so returning to the home
  // screen paints its data instantly instead of flashing skeletons. We still
  // revalidate in the background on every mount and swap in fresh data.
  type Snap = { pets: Pet[]; appts: Appointment[]; admissions: Admission[]; reminders: Reminder[]; activity: CurvePoint[] };
  const cacheKey = `dashboard:${user?.clinic_id ?? user?.id ?? "anon"}`;
  const seed = getCached<Snap>(cacheKey);

  const [loading, setLoading] = useState(!seed);
  const [pets, setPets] = useState<Pet[]>(seed?.pets ?? []);
  const [appts, setAppts] = useState<Appointment[]>(seed?.appts ?? []);
  const [admissions, setAdmissions] = useState<Admission[]>(seed?.admissions ?? []);
  const [reminders, setReminders] = useState<Reminder[]>(seed?.reminders ?? []);
  const [activity, setActivity] = useState<CurvePoint[]>(seed?.activity ?? []);
  const [error, setError] = useState(false);
  // A gently-ticking clock (30s) drives the live "next up" countdown + now-state
  // without a heavy re-render loop.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const mounted = useRef(true);
  const load = async () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    // Only show skeletons on a cold load; a revalidation over cached data stays visible.
    if (mounted.current) { if (getCached<Snap>(cacheKey) === undefined) setLoading(true); setError(false); }
    try {
      // 4 queries instead of 10 — one range query covers the whole week.
      const [allPets, adm, rem, weekAppts] = await withTimeout(Promise.all([
        repo.listAllPets(user?.clinic_id ?? user?.id),
        repo.listAdmissions(user?.clinic_id ?? user?.id),
        repo.listReminders({ ownerId: null }),
        repo.listAppointmentsInRange(days[0].toISOString(), days[6].toISOString()),
      ]), 12000);
      if (!mounted.current) return; // unmounted mid-flight → drop the result
      const apptsOn = (d: Date) => weekAppts.filter((a) => a.scheduled_at.slice(0, 10) === d.toISOString().slice(0, 10));
      const todayAppts = apptsOn(days[6]); // today is the last day
      const activityPts = days.map((d) => ({
        label: d.toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "short" }),
        value: apptsOn(d).length,
      }));
      setPets(allPets);
      setAdmissions(adm);
      setReminders(rem);
      setAppts(todayAppts);
      setActivity(activityPts);
      // Snapshot for instant paint on the next visit to the home screen.
      setCached<Snap>(cacheKey, { pets: allPets, admissions: adm, reminders: rem, appts: todayAppts, activity: activityPts });
    } catch {
      if (mounted.current) setError(true); // surface a retry instead of endless skeletons
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    // Skip the background refetch when the snapshot is fresh (< 20s) — switching
    // back within that window renders once from cache, no second re-render.
    if (!isFresh(cacheKey, 20_000)) void load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const petById = useMemo(() => Object.fromEntries(pets.map((p) => [p.id, p])), [pets]);
  const waiting = appts.filter((a) => a.status === "checked_in" || a.status === "in_room");
  const done = appts.filter((a) => a.status === "done");
  // Therapeutic boarding counts as BOTH an active case and a boarder.
  const activeCases = admissions.filter((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active");
  const boarding = admissions.filter((a) => (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status === "active");

  // Proportions for the KPI rings.
  const cycleDone = (a: Admission) => {
    if (!a.last_completed_at) return false;
    const win = (a.cycle_hours ?? 24) * 3600 * 1000;
    return Date.now() - new Date(a.last_completed_at).getTime() < win;
  };
  const casesDoneCount = activeCases.filter(cycleDone).length;
  const pctAppts = appts.length ? done.length / appts.length : 0;
  const pctWaiting = appts.length ? waiting.length / appts.length : 0;
  const pctCases = activeCases.length ? casesDoneCount / activeCases.length : 0;
  const pctBoard = Math.min(boarding.length / 12, 1);

  // ---- "التالي في جدولك": the single next thing that needs the doctor. ----
  // Priority: a patient already waiting in the clinic → then the next scheduled
  // appointment still ahead → else nothing (a clear, calm empty state).
  const nextUp = useMemo(() => {
    const nextWaiting = [...waiting].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
    if (nextWaiting) return { appt: nextWaiting, kind: "waiting" as const };
    const upcoming = appts
      .filter((a) => a.status !== "done" && a.status !== "cancelled" && new Date(a.scheduled_at).getTime() >= nowMs - 5 * 60_000)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
    if (upcoming) return { appt: upcoming, kind: "upcoming" as const };
    return null;
  }, [appts, waiting, nowMs]);

  // Unified upcoming-events feed (color-coded: appointments, treatment-due, reminders)
  const events = useMemo(
    () => buildUpcomingEvents({
      now: Date.now(),
      pets,
      appointments: appts,
      admissions,
      reminders,
      includeOps: true,
      labels: { service: (s) => t(`service.${s}`), medicationDue: t("dash.txDue", "Treatment due"), waiting: t("dash.waitingRoom", "Waiting") },
    }),
    [pets, appts, admissions, reminders, t],
  );

  const speciesData = useMemo(() => {
    const counts = new Map<Species, number>();
    for (const p of pets) counts.set(p.species, (counts.get(p.species) ?? 0) + 1);
    return Array.from(counts.entries()).map(([species, value]) => ({ species, value })).sort((a, b) => b.value - a.value);
  }, [pets]);

  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? t("dash.morning", "Good morning") : hour < 18 ? t("dash.afternoon", "Good afternoon") : t("dash.evening", "Good evening");
  const dateLabel = today.toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "long", day: "numeric", month: "long" });
  const firstName = (user?.full_name || "").replace(/^Dr\.?\s*/i, "").split(" ")[0];
  const tipKey = TIPS[today.getDate() % TIPS.length];
  const progressPct = appts.length ? Math.round((done.length / appts.length) * 100) : 0;

  // Live pulse pills shown inside the hero — the clinic's state at a glance.
  const pulse = [
    { icon: CalendarDays, value: appts.length, label: t("dash.apptsWord", "موعد") },
    { icon: Hourglass, value: waiting.length, label: t("dash.waitingShort", "ينتظر") },
    { icon: Stethoscope, value: activeCases.length, label: t("dash.casesShort", "تحت العلاج") },
    { icon: PawPrint, value: boarding.length, label: t("dash.boardingShort", "إقامة") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Connection / load failure — offer a retry instead of endless skeletons */}
      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <WifiOff size={16} className="shrink-0" />
            {t("dash.loadError", "Couldn't reach the server — it may be paused or your connection dropped.")}
          </span>
          <Button variant="outline" size="sm" leftIcon={<RotateCw size={15} />} onClick={() => void load()}>
            {t("common.retry", "Retry")}
          </Button>
        </div>
      )}

      {/* Greeting hero — now carries the live clinic pulse so "how are we doing
          right now?" is answered before a single click. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="relative overflow-hidden rounded-3xl bg-brand-grad p-6 text-white shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <PawPrint className="pointer-events-none absolute -bottom-8 right-6 text-white/10" size={140} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">{dateLabel}</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tighter2 sm:text-3xl">
              {greeting}{firstName ? `، ${firstName}` : ""} 👋
            </h1>
            <p className="mt-1 text-white/80">{user?.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="accent" leftIcon={<Plus size={18} />} onClick={() => { playTap(); navigate("/new-case"); }}>
              {t("newCase.newCaseBtn")}
            </Button>
            <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25 dark:bg-white/15 dark:text-white" leftIcon={<ScanLine size={18} />} onClick={() => { playTap(); navigate("/scan"); }}>
              <span className="hidden sm:inline">{t("nav.scan")}</span>
            </Button>
          </div>
        </div>
        {/* Pulse pills */}
        <div className="relative mt-5 flex flex-wrap gap-2">
          {pulse.map((p, i) => {
            const Icon = p.icon;
            return (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm">
                <Icon size={14} className="text-white/80" />
                <span className="tabular-nums">{formatNum(p.value)}</span>
                <span className="text-white/75">{p.label}</span>
              </span>
            );
          })}
        </div>
      </motion.div>

      {/* ⭐ Next-up focus card — the one thing that needs the doctor now, with a
          live countdown. Calm, celebratory empty state when the queue is clear. */}
      <div className="mt-6">
        {loading ? (
          <Skeleton className="h-28 rounded-3xl" />
        ) : (
          <NextUpCard nextUp={nextUp} pet={nextUp ? petById[nextUp.appt.pet_id] : undefined} nowMs={nowMs} lang={i18n.language} onGo={(a) => navigate(`/consult/${a.pet_id}?appt=${a.id}`)} onNew={() => navigate("/new-case")} />
        )}
      </div>

      {/* KPI grid */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)
        ) : (
          <>
            <RingStat label={t("dash.todayAppts", "Today's appointments")} value={appts.length} percent={pctAppts} color="#10b981" hint={`${done.length} ${t("dash.done", "done")}`} />
            <RingStat label={t("dash.waiting", "Waiting now")} value={waiting.length} percent={pctWaiting} color="#f59e0b" hint={t("dash.inClinic", "in the clinic")} />
            <RingStat label={t("dash.activeCases", "Active cases")} value={activeCases.length} percent={pctCases} color="#8b5cf6" hint={t("dash.underTreatment", "under treatment")} />
            <RingStat label={t("dash.boarding", "Boarding")} value={boarding.length} percent={pctBoard} color="#0ea5e9" hint={t("dash.guests", "guests staying")} />
          </>
        )}
      </motion.div>

      {/* Main working area — two balanced columns; items-start so no card is
          stretched into the tall empty void the old layout showed. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {/* Left: schedule + activity */}
        <div className="space-y-6 lg:col-span-2">
          <Card padded>
            <div className="mb-4 flex items-center justify-between">
              <CardTitle>{t("dash.todaySchedule", "Today's schedule")}</CardTitle>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={15} />} onClick={() => navigate("/reception")}>
                {t("reception.title")}
              </Button>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            ) : appts.length === 0 ? (
              <EmptyState icon={<CalendarDays size={28} />} title={t("reception.noToday")} description={t("dash.emptyToday", "No appointments scheduled for today yet.")} action={<Button leftIcon={<Plus size={16} />} onClick={() => navigate("/new-case")}>{t("newCase.newCaseBtn")}</Button>} />
            ) : (
              <div className="space-y-2">
                {appts.slice(0, 7).map((a) => {
                  const pet = petById[a.pet_id];
                  const arrived = a.status === "checked_in" || a.status === "in_room";
                  return (
                    <motion.button
                      key={a.id}
                      variants={fadeUp}
                      onClick={() => navigate(arrived ? `/consult/${a.pet_id}?appt=${a.id}` : `/pet/${a.pet_id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-brand-200 hover:bg-surface-2 dark:hover:border-brand-500/40"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center">
                        <span className="font-display text-sm font-bold text-ink">{formatTime(a.scheduled_at, i18n.language)}</span>
                      </div>
                      {pet && <PetAvatar pet={pet} size={40} />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{pet?.name ?? "—"}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                          <Clock size={11} /> {t(`service.${a.service}`)} · {a.doctor_name.split(" ").slice(-1)}
                        </p>
                      </div>
                      <Badge tone={arrived ? "warn" : "neutral"} dot={arrived}>{t(`status.${a.status}`)}</Badge>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card padded>
            <div className="mb-2 flex items-center justify-between">
              <CardTitle>{t("dash.activity", "Clinic activity")}</CardTitle>
              <Badge tone="brand" icon={<Activity size={13} />}>{t("dash.last7", "Last 7 days")}</Badge>
            </div>
            {loading ? <Skeleton className="h-40 rounded-2xl" /> : (
              <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
                <ActivityCurve data={activity} unit="" />
              </Suspense>
            )}
          </Card>

          <Card padded>
            <CardTitle className="mb-3">{t("dash.population", "Patient population")}</CardTitle>
            {loading ? (
              <Skeleton className="mx-auto h-44 w-44 rounded-full" />
            ) : pets.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-subtle">{t("dash.noPatients", "No patients yet.")}</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
                <div className="relative h-44 w-44 shrink-0">
                  <Suspense fallback={<Skeleton className="h-44 w-44 rounded-full" />}>
                    <SpeciesDonut data={speciesData} colors={SPECIES_COLOR} />
                  </Suspense>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="font-display text-2xl font-extrabold text-ink">{formatNum(pets.length)}</p>
                      <p className="text-2xs uppercase tracking-wider text-ink-subtle">{t("dash.patients", "patients")}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:flex-col sm:justify-start">
                  {speciesData.map((d) => (
                    <span key={d.species} className="inline-flex items-center gap-2 text-sm text-ink-muted">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: SPECIES_COLOR[d.species] }} />
                      {t(`pet.species.${d.species}`)} <span className="font-bold text-ink tabular-nums">{formatNum(d.value)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right rail: today's progress + upcoming + reminders + birthdays + tip */}
        <div className="space-y-6">
          <Card padded className="flex flex-col items-center justify-center">
            <CardTitle className="mb-3 self-start">{t("dash.todayProgress", "Today's progress")}</CardTitle>
            {loading ? (
              <Skeleton className="h-32 w-32 rounded-full" />
            ) : (
              <ProgressRing value={done.length} max={Math.max(appts.length, 1)} color="#1266d8" centerTop={`${progressPct}%`} centerBottom={t("dash.completed", "completed")} />
            )}
            <p className="mt-3 text-sm text-ink-muted">
              {formatNum(done.length)}/{formatNum(appts.length)} {t("dash.apptsSeen", "appointments seen")}
            </p>
          </Card>

          <UpcomingEvents
            events={events}
            reminders={reminders}
            scope={{ ownerId: null }}
            pets={pets}
            now={Date.now()}
            loading={loading}
            onChanged={load}
            onEventClick={(e) => e.petId && navigate(`/pet/${e.petId}`)}
          />

          {/* Actionable reminders → WhatsApp Campaigns (birthdays, vaccines, deworming) */}
          <RemindersWidget pets={pets} />

          {/* Upcoming pet birthdays (CRM / retention) */}
          <BirthdaysWidget pets={pets} />

          {/* Advice / tip of the day (bilingual) */}
          <Card padded className="relative overflow-hidden bg-gradient-to-br from-brand-50 to-sky-50 dark:from-brand-500/10 dark:to-sky-500/5">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft"><Lightbulb size={17} /></span>
              <CardTitle>{t("dash.advice", "Advice")}</CardTitle>
            </div>
            <p className="font-display font-bold text-ink">{t(`dash.tip.${tipKey}.t`)}</p>
            <p className="mt-1 text-sm text-ink-muted">{t(`dash.tip.${tipKey}.b`)}</p>
          </Card>
        </div>
      </div>

      {/* Quick actions — a full-width footer of the most-used jumps. */}
      <Card padded className="mt-6">
        <CardTitle className="mb-3">{t("dash.quickActions", "Quick actions")}</CardTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <QuickAction icon={<ClipboardList size={20} />} label={t("records.title")} onClick={() => navigate("/records")} />
          <QuickAction icon={<CalendarDays size={20} />} label={t("reception.title")} onClick={() => navigate("/reception")} />
          <QuickAction icon={<ScanLine size={20} />} label={t("nav.scan")} onClick={() => navigate("/scan")} />
          <QuickAction icon={<Stethoscope size={20} />} label={t("newCase.newCaseBtn")} onClick={() => navigate("/new-case")} />
        </div>
      </Card>
    </div>
  );
}

/** The single next thing the doctor should do, with a live countdown. */
function NextUpCard({ nextUp, pet, nowMs, lang, onGo, onNew }: {
  nextUp: { appt: Appointment; kind: "waiting" | "upcoming" } | null;
  pet: Pet | undefined;
  nowMs: number;
  lang: string;
  onGo: (a: Appointment) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();

  // Clear queue → a calm, positive state (not an empty void).
  if (!nextUp) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface-1 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"><CheckCircle2 size={24} /></span>
          <div>
            <p className="font-display text-lg font-bold text-ink">{t("dash.allClear", "لا مواعيد قادمة الآن")}</p>
            <p className="text-sm text-ink-muted">{t("dash.allClearHint", "طابور اليوم فارغ — وقت مناسب للمتابعات أو استقبال حالة جديدة.")}</p>
          </div>
        </div>
        <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={onNew}>{t("newCase.newCaseBtn")}</Button>
      </div>
    );
  }

  const { appt, kind } = nextUp;
  const startMs = new Date(appt.scheduled_at).getTime();
  const diffMin = Math.round((startMs - nowMs) / 60_000);
  const waiting = kind === "waiting";
  // Countdown copy: waiting → "ينتظر الآن"; else in N min / N min ago / now.
  const when = waiting
    ? t("dash.waitingNow", "ينتظر الآن")
    : diffMin > 1 ? t("dash.inMin", { n: formatNum(diffMin), defaultValue: "بعد {{n}} دقيقة" })
      : diffMin >= -1 ? t("dash.nowLabel", "الآن")
        : t("dash.lateMin", { n: formatNum(Math.abs(diffMin)), defaultValue: "متأخّر {{n}} دقيقة" });
  const tone = waiting || diffMin <= 1 ? "urgent" : "calm";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border p-5 shadow-soft",
        tone === "urgent"
          ? "border-warn-300 bg-gradient-to-br from-warn-50 to-amber-50 dark:border-warn-500/40 dark:from-warn-500/10 dark:to-amber-500/5"
          : "border-brand-200 bg-gradient-to-br from-brand-50 to-sky-50 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-sky-500/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative shrink-0">
          {pet ? <PetAvatar pet={pet} size={56} /> : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-ink-subtle"><PawPrint size={24} /></span>}
          {tone === "urgent" && <span className="absolute -end-1 -top-1 h-3.5 w-3.5 animate-pulse rounded-full bg-warn-500 ring-2 ring-surface-1" />}
        </div>
        <div className="min-w-0">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold",
            tone === "urgent" ? "bg-warn-500/15 text-warn-700 dark:text-warn-300" : "bg-brand-500/15 text-brand-700 dark:text-brand-300",
          )}>
            {waiting ? <Hourglass size={12} /> : <Timer size={12} />}
            {t("dash.nextUp", "التالي في جدولك")}
          </span>
          <p className="mt-1 truncate font-display text-xl font-extrabold text-ink">{pet?.name ?? "—"}</p>
          <p className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
            <Clock size={13} /> {formatTime(appt.scheduled_at, lang)} · {t(`service.${appt.service}`)}
            <span className={cn("ms-1 font-bold", tone === "urgent" ? "text-warn-700 dark:text-warn-300" : "text-brand-700 dark:text-brand-300")}>· {when}</span>
          </p>
        </div>
      </div>
      <Button size="lg" leftIcon={<Zap size={18} />} onClick={() => { playTap(); onGo(appt); }}>
        {t("dash.startExam", "ابدأ الكشف")}
      </Button>
    </motion.div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={() => { playTap(); onClick(); }}
      className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface-1 p-4 text-center transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card dark:hover:border-brand-500/40"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
      <span className="text-xs font-semibold text-ink">{label}</span>
    </button>
  );
}
