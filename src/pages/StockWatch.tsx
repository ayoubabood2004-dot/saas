import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CalendarX2, Copy, Hourglass, Lock, PackageX, RotateCw, Search, Telescope, Trash2 } from "lucide-react";
import type { Company, Product } from "@/types";
import { repo } from "@/lib/repo";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, formatNum, formatQty, localISO, money, normalizeCode, searchable } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { addDaysISO, horizonDays, matchesFilter, watchRows, watchSummary, type Horizon, type WatchFilter, type WatchRow } from "@/lib/stockWatch";
import { playSuccess, playTap } from "@/lib/sounds";

/* ============================================================================
 * مراقبةُ المخزون — «شكد بعد لكل منتج؟» (طلبُ المالك بعد م٦).
 *
 * صفحةٌ واحدة تجمع ما بُني بالموجات: تاريخُ الانتهاء (قاعدةُ 0210)، ومعدّلُ البيع (0215)،
 * والنفادُ المتوقَّع. والعيادةُ تختار المدى — شهر، شهرين، ثلاثة، أربعة، ستة، أو يوماً
 * بعينه — فيُقال ما ينتهي وما يخلص داخله، وما سيبقى على الرف ويفوت انتهاؤه.
 * الحسابُ كلُّه بـ`stockWatch.ts` النقيّة المفحوصة؛ هذه الشاشةُ تعرض ولا تحسب.
 * ========================================================================= */

const DAYS = 30;
const MONTHS = [1, 2, 3, 4, 6] as const;
const KEY = "vp_watch_horizon";
const SHOW = 300;

function readHorizon(): Horizon {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Horizon | null;
    if (v && ((v.kind === "months" && MONTHS.includes(v.n as 1)) || (v.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)))) return v;
  } catch { /* swallow-ok: تفضيلُ عرضٍ بالجهاز، وغيابُه = شهر */ }
  return { kind: "months", n: 1 };
}

const slash = (iso: string) => iso.slice(0, 10).replace(/-/g, "/");

export function StockWatch() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = usePermissions();
  const { restricted } = useOverride();
  const [data, setData] = useState<{ products: Product[]; sold: Map<string, number>; companies: Company[] } | "loading" | "error">("loading");
  const [h, setH] = useState<Horizon>(readHorizon);
  const [filter, setFilter] = useState<WatchFilter>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(SHOW);
  const today = localISO();

  const load = useCallback(async () => {
    setData("loading");
    try {
      const [products, sold, companies] = await Promise.all([repo.listProducts(), repo.productSalesRate(DAYS), repo.listCompanies()]);
      setData({ products, sold, companies });
    } catch { setData("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const pick = (next: Horizon) => {
    playTap(); setH(next); setLimit(SHOW);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* swallow-ok: تفضيلُ عرض */ }
  };

  const ready = typeof data === "object" ? data : null;
  const rows = useMemo(() => (ready ? watchRows(ready.products, ready.sold, DAYS, today, h) : []), [ready, today, h]);
  const sum = useMemo(() => watchSummary(rows), [rows]);
  const companyOf = useMemo(() => {
    const m = new Map((ready?.companies ?? []).map((c) => [c.id, c.name]));
    return (p: Product) => (p.company_id ? m.get(p.company_id) ?? "" : "");
  }, [ready]);
  const shown = useMemo(() => {
    const s = searchable(q.trim());
    const hasCode = normalizeCode(q) !== "";
    return rows.filter((r) => matchesFilter(r, filter)
      && (!s || searchable(r.product.name).includes(s) || searchable(companyOf(r.product)).includes(s)
        || (hasCode && [r.product.barcode, ...(r.product.alt_codes ?? [])].some((c) => normalizeCode(c) === normalizeCode(q)))));
  }, [rows, filter, q, companyOf]);
  const H = horizonDays(h, today);
  const rangeLabel = h.kind === "months"
    ? t(`watch.m${h.n}`)
    : t("watch.until", { d: slash(h.date), defaultValue: "لحد {{d}}" });

  if (!can("manageInventory")) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("watch.noAccess", "المراقبة لمن عنده صلاحية إدارة المخزن. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  const expiryText = (r: WatchRow) => {
    if (r.expiryDays === null) return t("watch.noExpiry", "بلا تاريخ انتهاء");
    const d = slash(String(r.product.expiry_date));
    if (r.expiryDays < 0) return t("watch.expiredAgo", { n: formatNum(-r.expiryDays), d, defaultValue: "منتهية من {{n}} يوم ({{d}})" });
    if (r.expiryDays === 0) return t("watch.expiresToday", { d, defaultValue: "آخر يوم صالح اليوم ({{d}})" });
    return t("watch.expiresIn", { n: formatNum(r.expiryDays), d, defaultValue: "تنتهي بعد {{n}} يوم ({{d}})" });
  };
  const runoutText = (r: WatchRow) => {
    if (r.runoutDays === null) return r.stock > 0 ? t("watch.notSelling", "ما انباعت بآخر ٣٠ يوم") : t("watch.emptyIdle", "رصيدها صفر");
    if (r.runoutDays === 0) return t("watch.outNow", "خلصت — تنباع وماكو رصيد");
    const n = Math.max(1, Math.round(r.runoutDays));
    return t("watch.runsOutIn", { n: formatNum(n), d: slash(addDaysISO(today, n)), defaultValue: "تخلص بعد ~{{n}} يوم ({{d}})" });
  };

  const copy = async () => {
    const lines = shown.slice(0, 500).map((r) => `• ${r.product.name} — ${t("watch.copyStock", { n: formatQty(r.stock), defaultValue: "الرصيد {{n}}" })} — ${expiryText(r)} — ${runoutText(r)}`);
    const text = [t("watch.copyHead", { range: rangeLabel, d: slash(today), defaultValue: "مراقبة المخزون ({{range}}) — {{d}}" }), ...lines].join("\n");
    try { await navigator.clipboard.writeText(text); playSuccess(); toast.success(t("watch.copied", { n: formatNum(lines.length), defaultValue: "انسخت {{n}} مادة" })); }
    catch { toast.error(t("watch.copyFail", "ما انسخت — المتصفّح منع الحافظة")); }
  };

  const cards: { f: WatchFilter; icon: typeof CalendarClock; tone: string; label: string; value: string; sub?: string }[] = [
    { f: "expires", icon: CalendarClock, tone: "text-warn-700 dark:text-warn-300", label: t("watch.cExpires", { range: rangeLabel, defaultValue: "تنتهي خلال {{range}}" }), value: formatNum(sum.expires.n), sub: restricted ? undefined : money(sum.expires.value) },
    { f: "runsOut", icon: Hourglass, tone: "text-brand-700 dark:text-brand-300", label: t("watch.cRunsOut", { range: rangeLabel, defaultValue: "تخلص خلال {{range}}" }), value: formatNum(sum.runsOut) },
    { f: "waste", icon: Trash2, tone: "text-danger-700 dark:text-danger-300", label: t("watch.cWaste", "راح تبقى وتنتهي بالرف"), value: formatQty(sum.waste.units), sub: restricted ? undefined : money(sum.waste.value) },
    { f: "expired", icon: CalendarX2, tone: "text-danger-700 dark:text-danger-300", label: t("watch.cExpired", "منتهية هسه"), value: formatNum(sum.expired.n), sub: restricted ? undefined : money(sum.expired.value) },
    { f: "noDate", icon: PackageX, tone: "text-ink-muted", label: t("watch.cNoDate", "بلا تاريخ انتهاء"), value: formatNum(sum.noDate) },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/inventory" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("watch.back", "رجوع للمخزون")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Telescope size={24} /></span>
        <div className="me-auto min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("watch.title", "مراقبة المخزون")}</h1>
          <p className="text-sm text-ink-subtle">{t("watch.sub", "شكد باقي لكل مادة — لحد ما تنتهي، ولحد ما تخلص")}</p>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3" data-watch-range>
        <span className="text-xs font-bold text-ink-muted">{t("watch.rangeLabel", "شوف لحد:")}</span>
        {MONTHS.map((n) => (
          <button key={n} type="button" aria-pressed={h.kind === "months" && h.n === n} data-watch-months={n}
            onClick={() => pick({ kind: "months", n })}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              h.kind === "months" && h.n === n ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {t(`watch.m${n}`)}
          </button>
        ))}
        <label className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
          h.kind === "date" ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
          {t("watch.exactDay", "يوم محدد")}
          <input type="date" className="rounded-md bg-surface-1 px-1.5 py-0.5 text-sm text-ink" min={today} data-watch-date
            value={h.kind === "date" ? h.date : ""} onChange={(e) => { if (e.target.value) pick({ kind: "date", date: e.target.value }); }} />
        </label>
        <span className="ms-auto text-2xs text-ink-subtle">{t("watch.rangeDays", { n: formatNum(H), d: slash(addDaysISO(today, H)), defaultValue: "{{n}} يوم — لحد {{d}}" })}</span>
      </div>

      {data === "loading" ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : data === "error" ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="text-sm text-ink-muted">{t("watch.loadFailed", "ما كدرنا نجيب المخزون — المشكلة بالاتصال ولا شي ضاع.")}</p>
          <Button leftIcon={<RotateCw size={16} />} onClick={() => { playTap(); void load(); }}>{t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-watch-cards>
            {cards.map((c) => (
              <button key={c.f} type="button" aria-pressed={filter === c.f} data-watch-card={c.f}
                onClick={() => { playTap(); setFilter((cur) => (cur === c.f ? "all" : c.f)); setLimit(SHOW); }}
                className={cn("card flex flex-col items-start gap-1 p-3 text-start transition",
                  filter === c.f ? "ring-2 ring-brand-500" : "hover:border-line-strong")}>
                <span className={cn("flex items-center gap-1.5 text-2xs font-bold", c.tone)}><c.icon size={14} /> {c.label}</span>
                <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{c.value}</span>
                {c.sub && <span className="text-2xs font-semibold tabular-nums text-ink-subtle">{c.sub}</span>}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="card flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
              <Search size={16} className="text-ink-subtle" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} data-watch-search
                onChange={(e) => { setQ(e.target.value); setLimit(SHOW); }} placeholder={t("watch.searchPh", "ابحث بالاسم أو الشركة أو الباركود")} />
            </label>
            {filter !== "all" && (
              <Button size="sm" variant="ghost" onClick={() => { playTap(); setFilter("all"); }}>{t("watch.showAll", "اعرض الكل")}</Button>
            )}
            <Button size="sm" variant="secondary" leftIcon={<Copy size={14} />} disabled={!shown.length} onClick={() => void copy()} data-watch-copy>
              {t("watch.copy", "انسخ القائمة")}
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="card p-6 text-center text-sm text-ink-subtle" data-watch-empty>{t("watch.none", "ماكو مواد بهذا الاختيار.")}</p>
          ) : (
            <ul className="space-y-1.5" data-watch-list>
              {shown.slice(0, limit).map((r) => {
                const exTone = r.expired ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200"
                  : r.expiresIn ? "bg-warn-50 text-warn-800 dark:bg-warn-500/15 dark:text-warn-200" : "bg-surface-2 text-ink-muted";
                const roTone = r.runoutDays !== null && r.runoutDays <= 7 ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200"
                  : r.runsOutIn ? "bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200" : "bg-surface-2 text-ink-muted";
                return (
                  <li key={r.product.id} className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5" data-watch-row>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-bold text-ink">{r.product.name}</p>
                      <p className="truncate text-2xs text-ink-subtle">
                        {companyOf(r.product) || t("watch.noCompany", "بدون شركة")}
                        {" · "}{t("watch.stock", { n: formatQty(r.stock), defaultValue: "الرصيد {{n}}" })}
                        {r.perDay > 0 && <> · {t("watch.perWeek", { n: formatQty(Math.round(r.perDay * 70) / 10), defaultValue: "{{n}} بالأسبوع" })}</>}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-2xs font-bold tabular-nums", exTone)} data-watch-expiry>{expiryText(r)}</span>
                    <span className={cn("rounded-full px-2.5 py-1 text-2xs font-bold tabular-nums", roTone)} data-watch-runout>{runoutText(r)}</span>
                    {/* داخل المدى وحده — كالبطاقة؛ وإلا صار كلُّ ما لا يُباع إنذاراً أحمرَ لانتهاءٍ بعد سنة. */}
                    {matchesFilter(r, "waste") && (
                      <p className="basis-full text-2xs font-semibold text-danger-700 dark:text-danger-300" data-watch-waste>
                        {t("watch.waste", { n: formatQty(r.leftAtExpiry), defaultValue: "بهذا البيع راح يبقى {{n}} وتنتهي بالرف — رجّعها للشركة أو نزّل سعرها قبل لا يفوت وقت الإرجاع" })}
                        {!restricted && Number(r.product.purchase_price) > 0 && <> · {money(r.leftAtExpiry * Number(r.product.purchase_price))}</>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {shown.length > limit && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" onClick={() => { playTap(); setLimit((n) => n + SHOW); }}>
                {t("watch.more", { n: formatNum(shown.length - limit), defaultValue: "اعرض الباقي ({{n}})" })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
