import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Syringe, HeartPulse, ShieldCheck, CalendarClock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Pet, Vaccination, WeightLog, Admission } from "@/types";
import { ProgressRing } from "@/components/ui";
import { daysUntil } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";

/** At-a-glance patient health card row (ref img 1 metrics). */
export function HealthSnapshot({
  pet,
  vaccines,
  weights,
  admissions,
  stack = false,
  className = "",
}: {
  pet: Pet;
  vaccines: Vaccination[];
  weights: WeightLog[];
  admissions: Admission[];
  /** Vertical single-column layout (for a narrow side rail). */
  stack?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  const vacc = useMemo(() => {
    // Future "scheduled" boosters are plans, not gaps — exclude them from the ring.
    const counted = vaccines.filter((v) => v.status !== "scheduled");
    const total = counted.length;
    const done = counted.filter((v) => v.status === "administered").length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [vaccines]);

  const weightInfo = useMemo(() => {
    const sorted = [...weights].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const latest = sorted.at(-1)?.weight_kg ?? pet.current_weight_kg ?? null;
    const prev = sorted.length >= 2 ? sorted.at(-2)!.weight_kg : null;
    const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;
    return { latest, delta, series: sorted.slice(-8).map((w) => w.weight_kg) };
  }, [weights, pet.current_weight_kg]);

  // Therapeutic boarding is both treatment + boarding; surface it as under-treatment.
  const activeTx = admissions.find((a) => (a.kind === "treatment" || a.kind === "treatment_boarding") && a.status === "active");
  const boarding = admissions.find((a) => (a.kind === "boarding" || a.kind === "treatment_boarding") && a.status === "active");

  const nextVaccine = useMemo(() => {
    const upcoming = vaccines
      .filter((v) => v.status !== "administered" && v.due_date)
      .map((v) => ({ v, days: daysUntil(v.due_date!) }))
      .sort((a, b) => a.days - b.days);
    return upcoming[0] ?? null;
  }, [vaccines]);

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className={`grid gap-3 no-print ${stack ? "grid-cols-1" : "sm:grid-cols-3"} ${className}`}>
      {/* Vaccination ring */}
      <motion.div variants={staggerItem} className="card flex items-center gap-4 p-4">
        <ProgressRing
          value={vacc.done}
          max={Math.max(vacc.total, 1)}
          size={84}
          stroke={9}
          color="#16a34a"
          centerTop={<span className="text-lg">{vacc.pct}%</span>}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Syringe size={15} className="text-success-600" /> {t("snapshot.vaccinated", "Vaccinated")}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {vacc.total ? `${vacc.done}/${vacc.total} ${t("snapshot.doses", "doses")}` : t("snapshot.noVaccines", "None logged")}
          </p>
        </div>
      </motion.div>

      {/* Weight trend */}
      <motion.div variants={staggerItem} className="card flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><HeartPulse size={15} className="text-brand-600" /> {t("snapshot.weight", "Weight")}</p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-tighter2 text-ink">
            {weightInfo.latest != null ? weightInfo.latest : "—"}
            <span className="ms-1 text-sm font-medium text-ink-muted">{t("common.kg")}</span>
          </p>
          {weightInfo.delta != null && (
            <span className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${weightInfo.delta > 0 ? "text-success-600" : weightInfo.delta < 0 ? "text-accent-600" : "text-ink-subtle"}`}>
              {weightInfo.delta > 0 ? <TrendingUp size={13} /> : weightInfo.delta < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
              {weightInfo.delta > 0 ? "+" : ""}{weightInfo.delta} {t("common.kg")}
            </span>
          )}
        </div>
        <Sparkline values={weightInfo.series} />
      </motion.div>

      {/* Care status */}
      <motion.div variants={staggerItem} className="card flex items-center gap-4 p-4">
        {activeTx ? (
          <StatusTile icon={<HeartPulse size={20} />} tone="accent" title={t("snapshot.underTreatment", "Under treatment")} sub={`${t("snapshot.day", "Day")} ${dayNumber(activeTx.admitted_on)}`} />
        ) : boarding ? (
          <StatusTile icon={<CalendarClock size={20} />} tone="sky" title={t("snapshot.boarding", "Boarding")} sub={boarding.cage || t("snapshot.staying", "Staying")} />
        ) : nextVaccine ? (
          <StatusTile
            icon={<CalendarClock size={20} />}
            tone={nextVaccine.days < 0 ? "danger" : "warn"}
            title={nextVaccine.days < 0 ? t("snapshot.overdue", "Vaccine overdue") : t("snapshot.nextVaccine", "Next vaccine")}
            sub={nextVaccine.days < 0 ? nextVaccine.v.name : t("snapshot.inDays", { days: Math.max(nextVaccine.days, 0), defaultValue: "in {{days}} days" })}
          />
        ) : (
          <StatusTile icon={<ShieldCheck size={20} />} tone="success" title={t("snapshot.allGood", "All up to date")} sub={t("snapshot.healthy", "Healthy")} />
        )}
      </motion.div>
    </motion.div>
  );
}

function dayNumber(admittedOn: string): number {
  const start = new Date(admittedOn);
  const now = new Date();
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
}

const TONES = {
  accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300",
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
};

function StatusTile({ icon, tone, title, sub }: { icon: React.ReactNode; tone: keyof typeof TONES; title: string; sub: string }) {
  return (
    <>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${TONES[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{sub}</p>
      </div>
    </>
  );
}

/** Minimal dependency-free SVG sparkline. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return [x, y];
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} className="shrink-0" viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1266d8" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1266d8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} stroke="#1266d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.5" fill="#1266d8" />
    </svg>
  );
}
