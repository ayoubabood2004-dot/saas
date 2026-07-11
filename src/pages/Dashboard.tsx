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
  ArrowRight,
  Activity,
  Lightbulb,
  RotateCw,
  WifiOff,
  AlertTriangle,
  Package,
  CheckCircle2,
  Sun,
  Sunrise,
  Moon,
} from "lucide-react";
import type { Appointment, Pet, Admission, Species, Reminder, Invoice, Product } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { formatTime, dateLocale, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { BirthdaysWidget } from "@/components/BirthdaysWidget";
import { RemindersWidget } from "@/components/RemindersWidget";
import { buildUpcomingEvents } from "@/lib/events";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { Card, CardTitle, Button, Badge, RingStat, Skeleton, EmptyState, type CurvePoint } from "@/components/ui";
import { staggerContainer, staggerItem, fadeUp } from "@/lib/motion";

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
  type Snap = { pets: Pet[]; appts: Appointment[]; admissions: Admission[]; reminders: Reminder[]; invoices: Invoice[]; products: Product[]; activity: CurvePoint[] };
  const cacheKey = `dashboard:${user?.clinic_id ?? user?.id ?? "anon"}`;
  const seed = getCached<Snap>(cacheKey);

  const [loading, setLoading] = useState(!seed);
  const [pets, setPets] = useState<Pet[]>(seed?.pets ?? []);
  const [appts, setAppts] = useState<Appointment[]>(seed?.appts ?? []);
  const [admissions, setAdmissions] = useState<Admission[]>(seed?.admissions ?? []);
  const [reminders, setReminders] = useState<Reminder[]>(seed?.reminders ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(seed?.invoices ?? []);
  const [products, setProducts] = useState<Product[]>(seed?.products ?? []);
  const [activity, setActivity] = useState<CurvePoint[]>(seed?.activity ?? []);
  const [error, setError] = useState(false);

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
      // One range query covers the whole week; invoices + products power the
      // visits + low-stock widgets (this clinic barely uses bookings, so the
      // home screen leads with daily activity and inventory — no money figures).
      const [allPets, adm, rem, weekAppts, invs, prods] = await withTimeout(Promise.all([
        repo.listAllPets(user?.clinic_id ?? user?.id),
        repo.listAdmissions(user?.clinic_id ?? user?.id),
        repo.listReminders({ ownerId: null }),
        repo.listAppointmentsInRange(days[0].toISOString(), days[6].toISOString()),
        repo.listInvoices(user?.clinic_id ?? user?.id).catch(() => [] as Invoice[]),
        repo.listProducts(user?.clinic_id ?? user?.id).catch(() => [] as Product[]),
      ]), 12000);
      if (!mounted.current) return; // unmounted mid-flight → drop the result
      const apptsOn = (d: Date) => weekAppts.filter((a) => a.scheduled_at.slice(0, 10) === d.toISOString().slice(0, 10));
      const todayAppts = apptsOn(days[6]); // today is the last day
      // Activity chart = sales per day over the week (local-day match), so the
      // graph reflects real revenue-driving traffic rather than empty bookings.
      const dayKey = (dt: Date) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      const salesOn = (d: Date) => invs.filter((iv) => iv.status !== "refunded" && dayKey(new Date(iv.created_at)) === dayKey(d)).length;
      const activityPts = days.map((d) => ({
        label: d.toLocaleDateString(i18n.language === "ar" ? dateLocale() : "en-US", { weekday: "short" }),
        value: salesOn(d),
      }));
      setPets(allPets);
      setAdmissions(adm);
      setReminders(rem);
      setAppts(todayAppts);
      setInvoices(invs);
      setProducts(prods);
      setActivity(activityPts);
      // Snapshot for instant paint on the next visit to the home screen.
      setCached<Snap>(cacheKey, { pets: allPets, admissions: adm, reminders: rem, appts: todayAppts, invoices: invs, products: prods, activity: activityPts });
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

  // Today's visits = today's completed sales (refunds excluded), a count only —
  // the dashboard intentionally shows NO money figures. Uses local start-of-day
  // so "today" matches the owner's wall clock, not UTC.
  const startMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const todaySales = useMemo(
    () => invoices.filter((iv) => iv.status !== "refunded" && new Date(iv.created_at).getTime() >= startMs),
    [invoices, startMs],
  );
  const casesToday = todaySales.length;
  const pctBusy = Math.min(casesToday / 15, 1); // soft daily-traffic gauge for the ring

  // Therapeutic boarding counts as BOTH an active case and a boarder.
  const activeCases = admissions.filter((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active");
  const boarding = admissions.filter((a) => (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status === "active");
  const cycleDone = (a: Admission) => {
    if (!a.last_completed_at) return false;
    const win = (a.cycle_hours ?? 24) * 3600 * 1000;
    return Date.now() - new Date(a.last_completed_at).getTime() < win;
  };
  const casesDoneCount = activeCases.filter(cycleDone).length;
  const pctCases = activeCases.length ? casesDoneCount / activeCases.length : 0;
  const pctBoard = Math.min(boarding.length / 12, 1);

  // Low-stock: any product at/below its reorder level (its own min_stock, else 5).
  const LOW_STOCK = 5;
  const lowStock = useMemo(
    () => products.filter((p) => p.stock <= (p.min_stock && p.min_stock > 0 ? p.min_stock : LOW_STOCK)),
    [products],
  );
  const pctLow = products.length ? lowStock.length / products.length : 0;

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
  const TimeIcon = hour < 12 ? Sunrise : hour < 18 ? Sun : Moon; // greeting mood, by clock

  // Live pulse pills shown inside the hero — the clinic's state at a glance.
  const pulse = [
    { icon: Stethoscope, value: casesToday, label: t("dash.casesTodayShort", "حالة اليوم") },
    { icon: Activity, value: activeCases.length, label: t("dash.casesShort", "تحت العلاج") },
    { icon: PawPrint, value: boarding.length, label: t("dash.boardingShort", "إقامة") },
    { icon: AlertTriangle, value: lowStock.length, label: t("dash.lowStockShort", "نقص مخزون") },
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

      {/* Greeting hero — a living centrepiece: a drifting aurora, an animated
          ECG "clinic pulse" line, and count-up vitals. Answers "how are we
          doing right now?" before a single click, and feels alive doing it. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="relative overflow-hidden rounded-3xl bg-brand-grad p-6 text-white shadow-soft sm:p-8">
        {/* Drifting aurora — two soft colour blobs that give the panel depth and
            gentle motion without ever pulling the eye. */}
        <motion.div aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl"
          animate={{ x: [0, 34, 0], y: [0, 22, 0], scale: [1, 1.15, 1] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="pointer-events-none absolute -right-12 top-4 h-64 w-64 rounded-full bg-accent-400/20 blur-3xl"
          animate={{ x: [0, -28, 0], y: [0, 26, 0], scale: [1.1, 1, 1.1] }} transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }} />
        <PawPrint className="pointer-events-none absolute -bottom-9 right-6 text-white/10" size={140} />
        {/* Signature: the clinic's heartbeat, sweeping across the base. */}
        <ClinicPulseLine />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80">
              <TimeIcon size={16} className="text-white/90" />
              {dateLabel}
            </p>
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
        {/* Pulse pills — count-up vitals */}
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative mt-5 flex flex-wrap gap-2">
          {pulse.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.span key={i} variants={staggerItem} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-white/25">
                <Icon size={14} className="text-white/80" />
                <AnimatedNumber value={p.value} className="tabular-nums" />
                <span className="text-white/75">{p.label}</span>
              </motion.span>
            );
          })}
        </motion.div>
      </motion.div>

      {/* KPI grid */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)
        ) : (
          <>
            <RingStat className="transition duration-200 hover:-translate-y-0.5 hover:shadow-soft" label={t("dash.casesToday", "Cases today")} value={<AnimatedNumber value={casesToday} />} percent={pctBusy} color="#1266d8" center={<Stethoscope size={18} className="text-brand-600" />} hint={t("dash.recordedToday", "recorded today")} />
            <RingStat className="transition duration-200 hover:-translate-y-0.5 hover:shadow-soft" label={t("dash.activeCases", "Active cases")} value={<AnimatedNumber value={activeCases.length} />} percent={pctCases} color="#8b5cf6" hint={t("dash.underTreatment", "under treatment")} />
            <RingStat className="transition duration-200 hover:-translate-y-0.5 hover:shadow-soft" label={t("dash.boarding", "Boarding")} value={<AnimatedNumber value={boarding.length} />} percent={pctBoard} color="#0ea5e9" hint={t("dash.guests", "guests staying")} />
            <RingStat className="transition duration-200 hover:-translate-y-0.5 hover:shadow-soft" label={t("dash.lowStock", "Low stock")} value={<AnimatedNumber value={lowStock.length} />} percent={pctLow} color={lowStock.length ? "#ef4444" : "#10b981"} center={<AlertTriangle size={18} className={lowStock.length ? "text-danger-600" : "text-success-600"} />} hint={t("dash.reorderSoon", "needs reordering")} />
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
              <CardTitle>{t("dash.visitsToday", "Today's visits")}</CardTitle>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={15} />} onClick={() => navigate("/reports")}>
                {t("nav.reports")}
              </Button>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            ) : todaySales.length === 0 ? (
              <EmptyState icon={<PawPrint size={28} />} title={t("dash.noSalesToday", "No sales yet today")} description={t("dash.noSalesHint", "Sales you record will show up here as they happen.")} action={<Button leftIcon={<Plus size={16} />} onClick={() => navigate("/retail")}>{t("nav.retail")}</Button>} />
            ) : (
              <div className="space-y-2">
                {todaySales.slice(0, 7).map((iv) => {
                  const due = (iv.total || 0) - (iv.amount_paid ?? iv.total ?? 0);
                  const name = iv.pet_name || iv.customer_name || t("dash.walkIn", "زبون");
                  return (
                    <motion.button
                      key={iv.id}
                      variants={fadeUp}
                      onClick={() => navigate("/reports")}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-brand-200 hover:bg-surface-2 dark:hover:border-brand-500/40"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center">
                        <span className="font-display text-sm font-bold text-ink">{formatTime(iv.created_at, i18n.language)}</span>
                      </div>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15"><PawPrint size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{name}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                          <ClipboardList size={11} /> {formatNum(iv.item_count || 0)} {t("dash.itemsWord", "صنف")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {due > 0
                          ? <Badge tone="warn" dot>{t("dash.credit", "آجل")}</Badge>
                          : <Badge tone="success">{t("dash.paidBadge", "مدفوع")}</Badge>}
                      </div>
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
          <Card padded>
            <div className="mb-3 flex items-center justify-between">
              <CardTitle>{t("dash.reorderSoon", "Reorder soon")}</CardTitle>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={15} />} onClick={() => navigate("/inventory")}>
                {t("nav.inventory")}
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
            ) : lowStock.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-success-100 bg-success-50/60 p-4 dark:border-success-500/20 dark:bg-success-500/10">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-500 text-white"><CheckCircle2 size={18} /></span>
                <p className="text-sm font-medium text-success-800 dark:text-success-200">{t("dash.stockHealthy", "Stock levels look healthy.")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { playTap(); navigate("/inventory"); }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-warn-200 hover:bg-surface-2 dark:hover:border-warn-500/40"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-50 text-warn-600 dark:bg-warn-500/15"><Package size={16} /></span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</p>
                    <Badge tone={p.stock <= 0 ? "danger" : "warn"}>{p.stock <= 0 ? t("dash.outOfStock", "نفد") : t("dash.unitsLeft", { n: formatNum(p.stock), defaultValue: "متبقّي {{n}}" })}</Badge>
                  </button>
                ))}
                {lowStock.length > 6 && (
                  <p className="pt-1 text-center text-xs text-ink-subtle">{t("dash.andMore", { n: formatNum(lowStock.length - 6), defaultValue: "و {{n}} غيرها" })}</p>
                )}
              </div>
            )}
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

/**
 * A number that smoothly counts up to its target (ease-out) and re-animates
 * whenever the value changes — makes every KPI feel alive on load and refresh.
 * Locale-aware digits via formatNum. Honours prefers-reduced-motion by snapping.
 */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) { setShown(to); fromRef.current = to; return; }
    const duration = 850;
    let raf = 0;
    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setShown(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{formatNum(Math.round(shown))}</span>;
}

/**
 * The clinic's heartbeat — a faithful simulation of a bedside ECG monitor in
 * SWEEP mode. The trace is STATIONARY; a write-head ("pen") travels left→right
 * across a fixed screen, drawing the new PQRST signal in place and leaving a
 * short blank erase-gap just ahead of itself (exactly how a real monitor
 * refreshes). When the pen reaches the right edge it wraps back to the left and
 * overwrites — nothing ever scrolls, so it never reads as a looping video.
 *
 * The PQRST complex is synthesised from a sum of Gaussians. It never repeats:
 * heart rate drifts to a fresh random target every few seconds and each beat
 * varies slightly in amplitude, with a gentle baseline wander. Speed is tuned
 * to a realistic human rhythm (~5.5 s to sweep the screen, ~60–84 bpm).
 *
 * Drawn imperatively (one setAttribute per frame) so 60 fps costs no React
 * reconciliation. Pure decoration (aria-hidden); prefers-reduced-motion gets a
 * single static trace with no sweep.
 */
function ClinicPulseLine() {
  const baseRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const W = 600, H = 48, mid = H * 0.58, amp = 17; // viewBox + baseline + R height
    const cols = 300;                                 // screen columns (samples)
    const dx = W / (cols - 1);
    const T_screen = 5.5;                             // seconds to cross the screen (real ECG pace)
    const secPerCol = T_screen / cols;                // ECG time each column represents
    const colsPerSec = cols / T_screen;               // pen speed
    const GAP = 7;                                     // blank erase-bar width (cols) ahead of the pen

    const buf = new Array<number>(cols).fill(0);
    const blank = new Array<boolean>(cols).fill(false);

    // One PQRST beat as a sum of Gaussians over beat-phase p∈[0,1). R peaks at 1.
    const g = (p: number, mu: number, s: number, a: number) => a * Math.exp(-((p - mu) * (p - mu)) / (2 * s * s));
    const ecg = (p: number) =>
      g(p, 0.20, 0.028, 0.11) +   // P wave
      g(p, 0.385, 0.008, -0.07) + // Q
      g(p, 0.42, 0.009, 1.0) +    // R
      g(p, 0.46, 0.011, -0.22) +  // S
      g(p, 0.66, 0.046, 0.24);    // T wave

    const HEAD = 46; // columns just behind the pen drawn bright (the glowing "comet tail")

    let phase = Math.random();
    let beatAmp = 1;
    let rrMul = 1;                 // per-beat RR-interval multiplier (sinus arrhythmia)
    let bpm = 72, targetBpm = 72;

    const nextSample = () => {
      const prev = phase % 1;
      // A real heart isn't metronomic — each beat is slightly long or short.
      phase += (bpm / 60) * secPerCol / rrMul;
      if ((phase % 1) < prev) {     // a new beat begins
        beatAmp = 0.9 + Math.random() * 0.2;   // vary the height a touch
        rrMul = 0.93 + Math.random() * 0.14;   // vary the spacing a touch (HRV)
      }
      return ecg(phase % 1) * beatAmp + 0.02 * Math.sin(phase * 0.7); // + gentle baseline wander
    };

    // Draw a contiguous index run [a..b], lifting the pen across erase-gaps.
    const drawRun = (a: number, b: number) => {
      let d = "", pen = false;
      for (let i = a; i <= b; i++) {
        if (blank[i]) { pen = false; continue; }
        d += (pen ? " L" : " M") + (i * dx).toFixed(1) + " " + (mid - buf[i] * amp).toFixed(2);
        pen = true;
      }
      return d;
    };
    const fullD = () => drawRun(0, cols - 1);
    const headD = () => {                     // the last HEAD columns behind the pen, wrap-aware
      const end = (cursor - 1 + cols) % cols;
      const start = (cursor - HEAD + cols) % cols;
      return start <= end ? drawRun(start, end) : drawRun(start, cols - 1) + drawRun(0, end);
    };

    // Prime the whole screen with a continuous trace so it's alive on first paint.
    for (let i = 0; i < cols; i++) buf[i] = nextSample();
    let cursor = 0;
    baseRef.current?.setAttribute("d", fullD());
    headRef.current?.setAttribute("d", headD());

    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static trace, no sweep

    let raf = 0, last = performance.now(), acc = 0, nextChange = last + 3500;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (now >= nextChange) { targetBpm = 60 + Math.random() * 24; nextChange = now + 3500 + Math.random() * 4000; }
      bpm += (targetBpm - bpm) * Math.min(dt * 0.5, 1);
      acc += colsPerSec * dt;
      let steps = Math.floor(acc); acc -= steps;
      if (steps > cols) steps = cols;
      for (let s = 0; s < steps; s++) {
        buf[cursor] = nextSample();  // write fresh signal under the pen
        blank[cursor] = false;
        for (let k = 1; k <= GAP; k++) blank[(cursor + k) % cols] = true; // erase-bar just ahead
        cursor = (cursor + 1) % cols;
      }
      if (steps > 0) {
        baseRef.current?.setAttribute("d", fullD());
        headRef.current?.setAttribute("d", headD());
        const end = (cursor - 1 + cols) % cols;
        const cy = buf[end];
        dotRef.current?.setAttribute("cx", (end * dx).toFixed(1));
        dotRef.current?.setAttribute("cy", (mid - cy * amp).toFixed(2));
        dotRef.current?.setAttribute("r", (2.2 + Math.max(0, cy) * 2).toFixed(2)); // flare on the R spike
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden">
      <svg width="100%" height="100%" viewBox="0 0 600 48" className="h-full w-full" preserveAspectRatio="none">
        {/* Dim tail (older trace) + bright freshly-drawn head = a real monitor's fading glow */}
        <path ref={baseRef} fill="none" stroke="white" strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path ref={headRef} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))" }} />
        <circle ref={dotRef} cx="0" cy="28" r="2.4" fill="white" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.95))" }} />
      </svg>
    </div>
  );
}
