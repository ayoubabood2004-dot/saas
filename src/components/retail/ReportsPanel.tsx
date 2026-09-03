import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Banknote, TrendingUp, Receipt, Crown, Package, Trophy, CalendarRange, UserCheck, Users, RefreshCw } from "lucide-react";
import type { ReceiptsDay, ReceiptsTotal, TopProductRow, StaffSalesRow } from "@/types";
import { repo } from "@/lib/repo";
import { staffNameMap } from "@/lib/staffNames";
import { Button } from "@/components/ui";
import { cn, money, formatNum, dateLocale } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * تقارير شاشة البيع — القاعدةُ تجمع، والمتصفّح يعرض (0149).
 *
 * كانت هذه اللوحة تجيب كلَّ سطور الفواتير (أكبرُ جدولٍ بالعيادة) وكلَّ الفواتير
 * لتجمعها بالمتصفّح. الآن تسأل أربعَ دوالّ ترجّع الأرقامَ جاهزة: المقبوضات باليوم،
 * مجموعُ المدّة، الأكثرُ مبيعاً، والمبيعات حسب الموظف — بلا سطرٍ واحد.
 *
 * CASH BASIS كما كان: كلُّ رقمٍ يجمع مالاً وصل فعلاً، بتاريخ وصوله (قسطُ دينٍ يوم
 * تحصيله، والتوصيلُ يوم تسليم السائق)، والربحُ يُنسب بنسبة ما وصل. المنطقُ نفسه
 * بالقاعدة (receipt_legs) وفحصُ التطابق بالحزمة يثبت أنه يطابق receiptsOf فلساً بفلس.
 * ==========================================================================*/

// Compact axis labels for large Iraqi Dinar amounts (Western numerals): 1500000 → "1.5M".
const compactNum = (v: number): string =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`
    : v >= 1e3 ? `${Math.round(v / 1e3)}k`
      : formatNum(v);
const localYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

type Period = "day" | "week" | "month" | "year";

interface Bucket { key: string; label: string; start: Date }

function buildBuckets(period: Period, lang: string): Bucket[] {
  const loc = lang === "ar" ? dateLocale() : "en-US";
  const now = new Date();
  const out: Bucket[] = [];
  if (period === "day") {
    for (let i = 6; i >= 0; i--) { const d = startOfDay(now); d.setDate(d.getDate() - i); out.push({ key: localYMD(d), label: d.toLocaleDateString(loc, { weekday: "short" }), start: d }); }
  } else if (period === "week") {
    const m = startOfWeek(now);
    // Arabic month name + Western day number (avoids Eastern-Arabic digits from ar-EG).
    for (let i = 7; i >= 0; i--) { const d = new Date(m); d.setDate(d.getDate() - i * 7); out.push({ key: localYMD(d), label: `${d.toLocaleDateString(loc, { month: "short" })} ${d.getDate()}`, start: d }); }
  } else if (period === "month") {
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(loc, { month: "short" }), start: d }); }
  } else {
    for (let i = 4; i >= 0; i--) { const y = now.getFullYear() - i; out.push({ key: String(y), label: String(y), start: new Date(y, 0, 1) }); }
  }
  return out;
}

function bucketKeyOf(d: Date, period: Period): string {
  if (period === "day") return localYMD(startOfDay(d));
  if (period === "week") return localYMD(startOfWeek(d));
  if (period === "month") return `${d.getFullYear()}-${d.getMonth()}`;
  return String(d.getFullYear());
}

/** المنطقةُ الزمنية للجهاز — التجميعُ اليومي بالقاعدة يُجرى بها فتتطابق أيامُه مع أيام الطبيب. */
const deviceTz = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Baghdad"; } catch { return "Asia/Baghdad"; } };

export function ReportsPanel() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<Period>("day");
  // أسماء الكادر — لجدول «المبيعات حسب الموظف».
  const [staffById, setStaffById] = useState<Map<string, string>>(() => new Map());
  const [daily, setDaily] = useState<ReceiptsDay[]>([]);
  const [total, setTotal] = useState<ReceiptsTotal>({ gross: 0, net: 0, invoices: 0 });
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [staffRows, setStaffRows] = useState<StaffSalesRow[]>([]);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /** فشلَ الجلب؟ نقولها — لوحةٌ بأصفارٍ صامتة تكذب. */
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  const buckets = useMemo(() => buildBuckets(period, i18n.language), [period, i18n.language]);
  const periodStart = buckets[0]?.start ?? new Date(0);
  const periodStartMs = periodStart.getTime();

  useEffect(() => {
    let alive = true;
    setLoading(true); setFailed(false);
    const range = { from: new Date(periodStartMs).toISOString(), to: endOfDay(new Date()).toISOString() };
    Promise.all([
      repo.reportReceiptsDaily(range, deviceTz()),
      repo.reportReceiptsTotal(range),
      repo.reportTopProducts(range, 5),
      repo.reportStaff(range),
      repo.countInvoices(),
      staffNameMap().catch(() => new Map<string, string>()),
    ]).then(([d, tot, tp, st, n, names]) => {
      if (!alive) return;
      setDaily(d); setTotal(tot); setTop(tp); setStaffRows(st); setInvoiceCount(n); setStaffById(names);
    }).catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [periodStartMs, tick]);

  // Fixed "today" KPIs — اليومُ المحليّ من صفوف الأيام.
  const today = localYMD(new Date());
  const todayRow = daily.find((d) => d.day === today);
  const todayGross = todayRow?.gross ?? 0;
  const todayNet = todayRow?.net ?? 0;

  // Chart: أيامُ القاعدة تُجمع بالسلّة المطلوبة (يوم/أسبوع/شهر/سنة) — الأيام
  // محليّة أصلاً (p_tz) فالسلّةُ تُقرأ من ظهر اليوم لتفادي حدود المناطق الزمنية.
  const chart = useMemo(() => {
    const acc = new Map<string, { gross: number; net: number }>();
    for (const d of daily) {
      const k = bucketKeyOf(new Date(d.day + "T12:00:00"), period);
      const cur = acc.get(k) ?? { gross: 0, net: 0 };
      cur.gross += d.gross; cur.net += d.net; acc.set(k, cur);
    }
    return buckets.map((b) => ({ label: b.label, gross: Math.round((acc.get(b.key)?.gross ?? 0) * 100) / 100, net: Math.round((acc.get(b.key)?.net ?? 0) * 100) / 100 }));
  }, [daily, buckets, period]);
  const pGross = total.gross, pNet = total.net, pCount = total.invoices;

  // ---- المبيعات حسب الموظف (البائع) داخل الفترة المختارة ------------------
  // من باع شكد: عدد فواتير، إيراد، وربح لكل موظف مثبَّت على فواتيره — والفواتير
  // الي انباعت بلا تحديد بائع تنجمع بصف «غير محدد» حتى يبين حجمها ويقل مع الوقت.
  const byStaff = useMemo(() => staffRows
    .map((s) => ({
      id: s.staff_id ?? "__none",
      name: s.staff_id ? (staffById.get(s.staff_id) ?? t("retail.noSeller", "غير محدد")) : t("retail.noSeller", "غير محدد"),
      invoices: s.invoices, revenue: s.revenue, profit: s.profit,
    }))
    .sort((a, b) => (a.id === "__none" ? 1 : b.id === "__none" ? -1 : b.revenue - a.revenue)), [staffRows, staffById, t]);
  const maxStaffRev = Math.max(1, ...byStaff.map((s) => s.revenue));

  const maxRevenue = top[0]?.revenue ?? 1;
  const hasChart = chart.some((c) => c.gross > 0);

  const PERIODS: { id: Period; label: string }[] = [
    { id: "day", label: t("retail.daily", "Daily") },
    { id: "week", label: t("retail.weekly", "Weekly") },
    { id: "month", label: t("retail.monthly", "Monthly") },
    { id: "year", label: t("retail.yearly", "Yearly") },
  ];

  if (failed) {
    return (
      <div className="card space-y-4 p-10 text-center">
        <p className="mx-auto max-w-md text-ink-subtle">{t("retail.reportLoadFailed", "تعذّر تحميل التقرير. المشكلة بالاتصال ولا رقم ضاع — أعد المحاولة.")}</p>
        <Button leftIcon={<RefreshCw size={16} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", loading && "opacity-70 transition")} aria-busy={loading}>
      {/* Today KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiBig icon={Banknote} tone="brand" label={t("retail.todayReceived", "مقبوضات اليوم (فعلي)")} value={money(todayGross)} />
        <KpiBig icon={TrendingUp} tone="success" label={t("retail.todayNet", "Today's net profit")} value={money(todayNet)} />
        <KpiBig icon={Receipt} tone="accent" label={t("retail.totalInvoices", "Total invoices")} value={invoiceCount == null ? "…" : formatNum(invoiceCount)} />
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted"><CalendarRange size={15} /> {t("retail.report", "Report")}</span>
        <div className="ms-auto flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => { playTap(); setPeriod(p.id); }}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold transition", period === p.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-ink">{t("retail.receiptsOverTime", "المقبوضات عبر الوقت — حسب يوم الاستلام الفعلي")}</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> {t("retail.gross", "Gross")}</span>
            <span className="flex items-center gap-1.5 text-ink-muted"><span className="h-2.5 w-2.5 rounded-sm bg-success-500" /> {t("retail.net", "Net")}</span>
          </div>
        </div>
        {hasChart ? (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 6, right: 4, left: -16, bottom: 0 }} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "currentColor" }} className="text-ink-subtle" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "currentColor" }} className="text-ink-subtle" axisLine={false} tickLine={false} width={56} tickFormatter={compactNum} />
                <Tooltip cursor={{ fill: "rgba(120,120,120,0.08)" }} content={<ChartTip />} />
                <Bar dataKey="gross" radius={[5, 5, 0, 0]} maxBarSize={34}>
                  {chart.map((_, i) => <Cell key={i} fill="#1266d8" />)}
                </Bar>
                <Bar dataKey="net" radius={[5, 5, 0, 0]} maxBarSize={34}>
                  {chart.map((_, i) => <Cell key={i} fill="#16a34a" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-48 place-items-center text-center text-sm text-ink-subtle"><Package size={26} className="mb-2 opacity-40" /> {t("retail.noPeriodSales", "No sales in this period yet.")}</div>
        )}
        {/* Period summary */}
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <Mini label={t("retail.gross", "Gross")} value={money(pGross)} />
          <Mini label={t("retail.net", "Net")} value={money(pNet)} tone="success" />
          <Mini label={t("retail.salesN", "Sales")} value={String(pCount)} />
        </div>
        <p className="mt-2 text-center text-2xs text-ink-subtle">{t("retail.computedInDb", "الأرقام تُحسب بالقاعدة على كل فواتير الفترة — لا تنزّل الشاشة سطراً واحداً")}</p>
      </div>

      {/* المبيعات حسب الموظف — منو باع شكد بالفترة المختارة */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-ink"><Users size={17} className="text-brand-600" /> {t("retail.salesByStaff", "المبيعات حسب الموظف")}</h3>
        {byStaff.length === 0 ? (
          <div className="grid h-24 place-items-center text-sm text-ink-subtle">{t("retail.noPeriodSales", "No sales in this period yet.")}</div>
        ) : (
          <div className="space-y-2.5">
            {byStaff.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                  s.id === "__none" ? "bg-surface-2 text-ink-subtle"
                    : i === 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "bg-surface-2 text-ink-muted")}>
                  {s.id === "__none" ? "؟" : i === 0 ? <Crown size={16} /> : <UserCheck size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate text-sm font-semibold", s.id === "__none" ? "text-ink-subtle" : "text-ink")}>{s.name}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{money(s.revenue)}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full", s.id === "__none" ? "bg-ink-subtle/40" : "bg-brand-grad")} style={{ width: `${Math.max(4, (s.revenue / maxStaffRev) * 100)}%` }} />
                    </div>
                    <span className="shrink-0 text-2xs text-ink-subtle">
                      {t("retail.invoicesN", { n: formatNum(s.invoices), defaultValue: "{{n}} فاتورة" })} · {t("retail.net", "Net")} {money(s.profit)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {byStaff.some((s) => s.id === "__none") && (
          <p className="mt-3 border-t border-line pt-2 text-2xs text-ink-subtle">
            {t("retail.noSellerFootnote", "«غير محدد» = فواتير انباعت بلا اختيار بائع — حدّد موظف المبيعات عند البيع حتى تنحسب إله.")}
          </p>
        )}
      </div>

      {/* Top products */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-ink"><Trophy size={17} className="text-amber-500" /> {t("retail.topProducts", "Top-selling products")}</h3>
        {top.length === 0 ? (
          <div className="grid h-24 place-items-center text-sm text-ink-subtle">{t("retail.noTop", "No sales in this period.")}</div>
        ) : (
          <div className="space-y-2.5">
            {top.map((p, i) => (
              <motion.div key={p.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold",
                  i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-surface-2 text-ink-muted")}>
                  {i === 0 ? <Crown size={16} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{money(p.revenue)}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand-grad" style={{ width: `${Math.max(6, (p.revenue / maxRevenue) * 100)}%` }} />
                    </div>
                    <span className="shrink-0 text-2xs text-ink-subtle">{t("retail.unitsSold", { n: formatNum(p.qty), defaultValue: "{{n}} sold" })}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-3 py-2 text-xs shadow-raised">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-ink-muted"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} /> {p.name}: <span className="font-semibold text-ink tabular-nums">{money(p.value)}</span></p>
      ))}
    </div>
  );
}

function KpiBig({ icon: Icon, tone, label, value }: { icon: typeof Banknote; tone: "brand" | "success" | "accent"; label: string; value: string }) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
    accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
  };
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", tones[tone])}><Icon size={24} /></span>
      <div className="min-w-0">
        <p className="font-display text-xl font-extrabold leading-tight text-ink tabular-nums break-words">{value}</p>
        <p className="truncate text-xs text-ink-subtle">{label}</p>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div>
      <p className={cn("font-display text-lg font-bold tabular-nums", tone === "success" ? "text-success-600" : "text-ink")}>{value}</p>
      <p className="text-2xs text-ink-subtle">{label}</p>
    </div>
  );
}
