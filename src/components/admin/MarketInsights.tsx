import { useEffect, useMemo, useState } from "react";
import { TrendingUp, PawPrint, Stethoscope, Receipt, MessageCircle, AlertTriangle, SlidersHorizontal } from "lucide-react";
import {
  fetchClinicVolumes, fetchMarketMonthly, spreadOf, simulateLimit,
  type ClinicVolume, type MonthPoint, type Metric,
} from "@/lib/market";
import { money, formatNum, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import { playTap } from "@/lib/sounds";

/* ---------------------------------------------------------------------------
 * حركة السوق — الشاشة التي تحوّل «كم نحدّد؟» من تخمين إلى قراءة.
 *
 * ثلاث طبقات بترتيب مقصود:
 *   ١) التوزيع  — أين تقف العيادة الوسطى فعلاً. الوسيط لا المتوسط: عيادة واحدة
 *      ضخمة ترفع المتوسط وتخفي أن أغلب السوق أصغر بكثير، فتُبنى الحدود على وهم.
 *   ٢) المحاكاة — تكتب حدّاً فيقول لك كم عيادة يخنقها الآن، قبل ما تطبّقه.
 *   ٣) الاتجاه والتفصيل — هل السوق يكبر، ومن يقود الحجم.
 * ------------------------------------------------------------------------- */

const METRICS: { id: Metric; label: string; unit: string; icon: React.ReactNode }[] = [
  { id: "pets", label: "حيوانات جديدة", unit: "حيوان", icon: <PawPrint size={14} /> },
  { id: "cases", label: "حالات مفتوحة", unit: "حالة", icon: <Stethoscope size={14} /> },
  { id: "wa", label: "رسائل واتساب", unit: "رسالة", icon: <MessageCircle size={14} /> },
  { id: "invoices", label: "فواتير بيع", unit: "فاتورة", icon: <Receipt size={14} /> },
];

const WINDOWS = [
  { days: 30, label: "٣٠ يوم" },
  { days: 90, label: "٩٠ يوم" },
  { days: 365, label: "سنة" },
];

export function MarketInsights() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<ClinicVolume[] | null | undefined>(undefined);
  const [months, setMonths] = useState<MonthPoint[] | null>(null);
  const [metric, setMetric] = useState<Metric>("pets");
  const [limit, setLimit] = useState("25");

  useEffect(() => {
    let alive = true;
    setRows(undefined);
    void fetchClinicVolumes(days).then((r) => { if (alive) setRows(r); });
    void fetchMarketMonthly(6).then((m) => { if (alive) setMonths(m); });
    return () => { alive = false; };
  }, [days]);

  const meta = METRICS.find((m) => m.id === metric)!;
  const spread = useMemo(() => (rows ? spreadOf(rows, metric) : null), [rows, metric]);
  const sim = useMemo(
    () => (rows && limit.trim() !== "" ? simulateLimit(rows, metric, Math.max(0, Number(limit) || 0)) : null),
    [rows, metric, limit],
  );
  const top = useMemo(
    () => (rows ? [...rows].filter((r) => r[metric] > 0).sort((a, b) => b[metric] - a[metric]) : []),
    [rows, metric],
  );

  return (
    <section className="mb-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><TrendingUp size={18} /></span>
          <h2 className="font-display font-bold text-ink">حركة السوق</h2>
        </div>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button key={w.days} type="button" onClick={() => { playTap(); setDays(w.days); }}
              className={cn("rounded-full px-3 py-1 text-2xs font-bold transition",
                days === w.days ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        شكد تُدخل العيادات فعلاً — حتى تُضبط الحدود والأسعار بالقراءة لا بالتخمين.
      </p>

      {rows === undefined ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : rows === null ? (
        <div className="flex items-start gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-2xs leading-relaxed text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>بيانات السوق ما توصل لأن هجرة <b>0106_market_insights</b> لسه ما تشغّلت. شغّلها وأعد التحديث.</span>
        </div>
      ) : (
        <>
          {/* اختيار المقياس */}
          <div className="mb-3 flex flex-wrap items-center gap-1">
            {METRICS.map((m) => (
              <button key={m.id} type="button" onClick={() => { playTap(); setMetric(m.id); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-2xs font-bold transition",
                  metric === m.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {/* ١) التوزيع */}
          {spread && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { v: spread.p50, l: "العيادة الوسطى", hint: "نصف السوق تحت هذا الرقم" },
                  { v: spread.p75, l: "٧٥٪ من السوق", hint: "ثلاثة أرباع تحته" },
                  { v: spread.p90, l: "٩٠٪ من السوق", hint: "تسعة من كل عشرة تحته" },
                  { v: spread.max, l: "الأعلى", hint: "أنشط عيادة عندك" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-surface-2 px-3 py-2.5" title={s.hint}>
                    <div className="text-2xs font-semibold text-ink-subtle">{s.l}</div>
                    <div className="font-display text-xl font-extrabold tabular-nums text-ink">
                      {formatNum(Math.round(s.v))}<span className="ms-1 text-2xs font-bold text-ink-subtle">{meta.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">
                محسوبة على <b className="text-ink-muted">{formatNum(spread.active)}</b> عيادة أدخلت شيئاً خلال الفترة
                {spread.idle > 0 && <> · <b className="text-ink-muted">{formatNum(spread.idle)}</b> عيادة ما لمست النظام (مستبعَدة حتى ما تشوّه الأرقام)</>}
                {" · "}المجموع <b className="text-ink-muted">{formatNum(spread.total)}</b> {meta.unit}
              </p>
            </>
          )}

          {/* ٢) المحاكاة — القرار */}
          <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/25 dark:bg-brand-500/10">
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-black text-brand-700 dark:text-brand-300">
              <SlidersHorizontal size={13} /> لو حطيت الحد…
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" inputMode="numeric" min="0" dir="ltr"
                className="input w-24 py-1.5 text-center" value={limit}
                onChange={(e) => setLimit(e.target.value)} placeholder="25" />
              <span className="text-xs font-bold text-ink-muted">{meta.unit} بالفترة</span>
              {sim && (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-success-100 px-2.5 py-1 font-black text-success-800 dark:bg-success-500/20 dark:text-success-200">
                    يكفي {formatNum(sim.fits)} عيادة
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 font-black",
                    sim.exceeds === 0
                      ? "bg-surface-2 text-ink-subtle"
                      : "bg-danger-100 text-danger-800 dark:bg-danger-500/20 dark:text-danger-200")}>
                    يخنق {formatNum(sim.exceeds)} ({formatNum(sim.pct)}٪)
                  </span>
                  {sim.worstOver > 0 && (
                    <span className="text-2xs text-ink-subtle">أكبر تجاوز: +{formatNum(sim.worstOver)} {meta.unit}</span>
                  )}
                </span>
              )}
            </div>
            {sim && spread && spread.active > 0 && (
              <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                {sim.pct === 0
                  ? "هذا الحد ما يخنق ولا عيادة — سخيّ، وممكن يكون أسخى من اللازم تجارياً."
                  : sim.pct <= 15
                    ? "حد متوازن: يخدم أغلب السوق، والقلّة الي تتجاوزه هي مرشّحك الطبيعي لباقة أعلى."
                    : sim.pct <= 40
                      ? "حد ضاغط: يدفع شريحة معتبرة للترقية — مربح، بس راقب الشكاوى."
                      : "حد خانق: أكثر من ٤٠٪ من السوق يصطدم بيه، وهذا يولّد إحباطاً لا ترقيات."}
              </p>
            )}
          </div>

          {/* ٣) الاتجاه */}
          {months && months.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-bold text-ink">الاتجاه — آخر ٦ أشهر</h3>
              <div className="overflow-x-auto">
                <div className="flex min-w-max items-end gap-2">
                  {(() => {
                    const peak = Math.max(1, ...months.map((m) => m[metric]));
                    return months.map((m) => (
                      <div key={m.month} className="flex w-16 flex-col items-center gap-1">
                        <span className="text-2xs font-bold tabular-nums text-ink">{formatNum(m[metric])}</span>
                        <span className="flex h-20 w-full items-end rounded-lg bg-surface-2">
                          <span className="w-full rounded-lg bg-brand-500 transition-all"
                            style={{ height: `${Math.max(4, (m[metric] / peak) * 100)}%` }} />
                        </span>
                        <span className="text-[10px] text-ink-subtle">{m.month.slice(0, 7)}</span>
                        <span className="text-[10px] text-ink-subtle">{formatNum(m.clinicsActive)} عيادة</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ٤) من يقود الحجم */}
          {top.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-bold text-ink">العيادات حسب {meta.label}</h3>
              <div className="space-y-1.5">
                {top.slice(0, 12).map((r) => {
                  const peak = top[0][metric] || 1;
                  return (
                    <div key={r.clinicId} className="flex items-center gap-2.5 rounded-xl border border-line p-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                        {r.clinicName || r.email || "—"}
                        {r.plan && <span className="ms-1.5 font-normal text-ink-subtle">{r.plan}</span>}
                      </span>
                      <span className="hidden w-24 shrink-0 sm:block">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r[metric] / peak) * 100}%` }} />
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-extrabold tabular-nums text-ink">{formatNum(r[metric])}</span>
                      <span className="shrink-0 text-[10px] text-ink-subtle">{formatNum(r.activeDays)} يوم نشط</span>
                      {r.revenue > 0 && <span className="hidden shrink-0 text-[10px] text-ink-subtle sm:block">{money(r.revenue)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
