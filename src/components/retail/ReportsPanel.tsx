import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Banknote, TrendingUp, Receipt, Crown, Package, Trophy, CalendarRange } from "lucide-react";
import type { Invoice, InvoiceItem } from "@/types";
import { repo } from "@/lib/repo";
import { cn, money, formatNum, dateLocale } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

const isPaid = (i: Invoice) => (i.status ?? "paid") !== "refunded";
// Compact axis labels for large Iraqi Dinar amounts (Western numerals): 1500000 → "1.5M".
const compactNum = (v: number): string =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`
    : v >= 1e3 ? `${Math.round(v / 1e3)}k`
      : formatNum(v);
const localYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
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

export function ReportsPanel({ invoices, clinicId }: { invoices: Invoice[]; clinicId?: string }) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<Period>("day");
  const [items, setItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    let alive = true;
    repo.listAllInvoiceItems(clinicId).then((r) => { if (alive) setItems(r); }).catch(() => {});
    return () => { alive = false; };
  }, [clinicId]);

  // Fixed "today" KPIs (per spec).
  const today = localYMD(new Date());
  const todays = invoices.filter((i) => localYMD(new Date(i.created_at)) === today && isPaid(i));
  const todayGross = todays.reduce((s, i) => s + i.total, 0);
  const todayNet = todays.reduce((s, i) => s + i.profit, 0);

  const buckets = useMemo(() => buildBuckets(period, i18n.language), [period, i18n.language]);
  const periodStart = buckets[0]?.start ?? new Date(0);

  // Chart data + period totals.
  const { chart, pGross, pNet, pCount } = useMemo(() => {
    const acc = new Map<string, { gross: number; net: number; count: number }>();
    let pGross = 0, pNet = 0, pCount = 0;
    for (const inv of invoices) {
      if (!isPaid(inv)) continue;
      const d = new Date(inv.created_at);
      if (d < periodStart) continue;
      const k = bucketKeyOf(d, period);
      const cur = acc.get(k) ?? { gross: 0, net: 0, count: 0 };
      cur.gross += inv.total; cur.net += inv.profit; cur.count += 1;
      acc.set(k, cur);
      pGross += inv.total; pNet += inv.profit; pCount += 1;
    }
    const chart = buckets.map((b) => ({ label: b.label, gross: Math.round((acc.get(b.key)?.gross ?? 0) * 100) / 100, net: Math.round((acc.get(b.key)?.net ?? 0) * 100) / 100 }));
    return { chart, pGross, pNet, pCount };
  }, [invoices, buckets, period, periodStart]);

  // Top products within the period (paid only).
  const top = useMemo(() => {
    const okIds = new Set(invoices.filter((i) => isPaid(i) && new Date(i.created_at) >= periodStart).map((i) => i.id));
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      if (!okIds.has(it.invoice_id)) continue;
      const key = it.product_id || it.name;
      const cur = m.get(key) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty; cur.revenue += it.line_total; m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [items, invoices, periodStart]);

  const maxRevenue = top[0]?.revenue ?? 1;
  const hasChart = chart.some((c) => c.gross > 0);

  const PERIODS: { id: Period; label: string }[] = [
    { id: "day", label: t("retail.daily", "Daily") },
    { id: "week", label: t("retail.weekly", "Weekly") },
    { id: "month", label: t("retail.monthly", "Monthly") },
    { id: "year", label: t("retail.yearly", "Yearly") },
  ];

  return (
    <div className="space-y-5">
      {/* Today KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiBig icon={Banknote} tone="brand" label={t("retail.todayGross", "Today's gross income")} value={money(todayGross)} />
        <KpiBig icon={TrendingUp} tone="success" label={t("retail.todayNet", "Today's net profit")} value={money(todayNet)} />
        <KpiBig icon={Receipt} tone="accent" label={t("retail.totalInvoices", "Total invoices")} value={String(invoices.length)} />
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
          <h3 className="font-display font-bold text-ink">{t("retail.salesOverTime", "Sales over time")}</h3>
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
      </div>

      {/* Top products */}
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-ink"><Trophy size={17} className="text-amber-500" /> {t("retail.topProducts", "Top-selling products")}</h3>
        {top.length === 0 ? (
          <div className="grid h-24 place-items-center text-sm text-ink-subtle">{t("retail.noTop", "No sales in this period.")}</div>
        ) : (
          <div className="space-y-2.5">
            {top.map((p, i) => (
              <motion.div key={p.name + i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3">
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
                    <span className="shrink-0 text-2xs text-ink-subtle">{t("retail.unitsSold", { n: p.qty, defaultValue: "{{n}} sold" })}</span>
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
