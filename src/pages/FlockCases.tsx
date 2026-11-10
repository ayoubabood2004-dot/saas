/* ============================================================================
 * «حقول الدواجن» للعيادات — حالةُ الحقل (0265، docs/field-cases-plan.md §٧-أ).
 *
 * القائمةُ وجباتٌ لا حيوانات: لكلّ وجبةٍ مفتوحة بطاقةٌ بعمرها وحيّها ونفوقها وشاراتها، مرتّبةٌ بالأهمّ
 * (إنذارُ نفوق، تحصينٌ متأخّر، زيارةٌ متأخّرة، سحب). وشريطُ «اليوم» فوقها يفلتر بنقرة.
 * والإحصاءُ من الخادم (`flock_board` ⇒ `_flock_stats`)، والتجريبيُّ بمرآته المفحوصة (flock-parity).
 * وفشلُ القراءة يُقال بـ«أعد المحاولة» — لا قائمةٌ فارغة تُصدَّق «ماكو حقول» (CLAUDE.md §٣).
 * ========================================================================= */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AlertTriangle, Bird, CalendarClock, Plus, RefreshCw, Search, ShieldAlert, Stethoscope, Syringe } from "lucide-react";
import { Badge, Button, Segmented } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { cn, formatNum, localISO } from "@/lib/utils";
import { diffDays } from "@/lib/flockMath";
import { flockApi } from "@/lib/flockApi";
import type { FlockBoardRow } from "@/lib/flockTypes";
import { ageLabel, dayLabel, flockError, matchesBoard, relDay, urgency } from "@/components/flock/flockShared";
import { FlockCasePage } from "@/components/flock/FlockCase";
import { FlockOpenPage } from "@/components/flock/FlockIntake";

type Focus = "alert" | "vax" | "visit" | "wd" | null;

export function FlockCases() {
  return (
    <Routes>
      <Route index element={<Board />} />
      <Route path="new" element={<FlockOpenPage />} />
      <Route path="c/:caseId" element={<FlockCasePage />} />
      <Route path="*" element={<Navigate to="/poultry" replace />} />
    </Routes>
  );
}

function Board() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [rows, setRows] = useState<FlockBoardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<Focus>(null);
  const today = localISO();

  const load = useCallback(async (s: typeof status) => {
    setErr(null);
    try { setRows(await flockApi.board(s)); }
    catch (e) { setRows(null); setErr(flockError(e, t)); }
  }, [t]);
  useEffect(() => { setRows(null); void load(status); }, [status, load]);

  const open = (rows ?? []).filter((r) => r.case.status === "open");
  const due = {
    alert: open.filter((r) => r.stats.mortality_alert),
    vax: open.filter((r) => r.stats.vax_overdue > 0 || (r.stats.next_vax && diffDays(today, r.stats.next_vax.due_on) <= 1)),
    visit: open.filter((r) => r.stats.visit_overdue || (r.stats.next_visit_on && r.stats.next_visit_on <= today)),
    wd: open.filter((r) => r.stats.in_withdrawal || r.stats.withdrawal_unknown),
  };

  // ≤ ٣٠٠ وجبة: الفرزُ بكلّ رسمةٍ أرخصُ من مذكّرةٍ تنسى «اليوم» عند منتصف الليل.
  const shown = (rows ?? []).filter((r) => matchesBoard(r, q) && (!focus || due[focus].includes(r)))
    .sort((a, b) =>
      (a.case.status === b.case.status ? 0 : a.case.status === "open" ? -1 : 1)
      || urgency(b.stats, today) - urgency(a.stats, today)
      || b.case.placed_on.localeCompare(a.case.placed_on));

  const chips: { k: Exclude<Focus, null>; icon: ReactNode; label: string; tone: string }[] = [
    { k: "alert", icon: <AlertTriangle size={15} />, label: t("flk.today.alert"), tone: "text-danger-700 dark:text-danger-300" },
    { k: "vax", icon: <Syringe size={15} />, label: t("flk.today.vax"), tone: "text-warn-700 dark:text-warn-300" },
    { k: "visit", icon: <Stethoscope size={15} />, label: t("flk.today.visit"), tone: "text-brand-700 dark:text-brand-300" },
    { k: "wd", icon: <ShieldAlert size={15} />, label: t("flk.today.wd"), tone: "text-danger-700 dark:text-danger-300" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Bird size={22} /></span>
          <div>
            <h1 className="text-xl font-extrabold text-ink">{t("flk.title")}</h1>
            <p className="text-xs text-ink-subtle">{t("flk.subtitle")}</p>
          </div>
        </div>
        {can("addPets") && (
          <Button leftIcon={<Plus size={18} />} onClick={() => navigate("new")} data-flock-new>{t("flk.newCase")}</Button>
        )}
      </div>

      {status !== "closed" && rows && open.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-flock-today>
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => setFocus(focus === c.k ? null : c.k)}
              className={cn("card flex items-center gap-2 p-3 text-start text-sm font-bold transition", c.tone,
                focus === c.k && "ring-2 ring-brand-500", due[c.k].length === 0 && "opacity-60")}>
              <span className="shrink-0">{c.icon}</span><span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="shrink-0 text-base font-extrabold tabular-nums">{due[c.k].length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("flk.search")} />
        </div>
        <Segmented size="sm" layoutId="flock-status" value={status} onChange={(v) => { setFocus(null); setStatus(v); }}
          options={[{ value: "open", label: t("flk.status.open") }, { value: "closed", label: t("flk.status.closed") }, { value: "all", label: t("flk.status.all") }]} />
      </div>

      {err ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center" data-flock-error>
          <AlertTriangle size={28} className="text-danger-600" />
          <p className="text-sm text-ink">{err}</p>
          <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void load(status)}>{t("flk.retry")}</Button>
        </div>
      ) : !rows ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-32 animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-muted" data-flock-empty>
          {q || focus ? t("flk.noMatch") : status === "closed" ? t("flk.noClosed") : t("flk.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-flock-list>
          {shown.map((r) => <CaseCard key={r.case.id} r={r} today={today} onOpen={() => navigate(`c/${r.case.id}`)} />)}
        </div>
      )}
    </div>
  );
}

function CaseCard({ r, today, onOpen }: { r: FlockBoardRow; today: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const s = r.stats;
  const closed = r.case.status === "closed";
  const nv = s.next_vax;
  return (
    <button type="button" onClick={onOpen} data-flock-card={r.case.id}
      className={cn("card flex flex-col gap-2 p-4 text-start transition hover:shadow-raised", s.mortality_alert && !closed && "ring-1 ring-danger-500")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-extrabold text-ink">{r.farm.name}</div>
          <div className="truncate text-xs text-ink-muted">
            {[r.farm.owner_name, r.farm.area].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <Badge tone={closed ? "neutral" : "brand"} className="shrink-0 text-xs">
          {t(`flk.kind.${r.case.kind}`)}{r.case.breed ? ` · ${r.case.breed}` : ""}
        </Badge>
      </div>
      <div className="text-sm font-bold text-brand-700 dark:text-brand-300">
        {closed ? t("flk.closedOn", { day: dayLabel(r.case.closed_on, today) }) : ageLabel(t, r.case.placed_on, today)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>{t("flk.alive", { alive: formatNum(s.alive), placed: formatNum(s.placed) })}</span>
        <span className={cn(s.mortality_alert && "font-bold text-danger-700 dark:text-danger-300")}>{t("flk.cumPct", { pct: s.cum_pct })}</span>
        {r.houses > 1 && <span>{t("flk.housesN", { n: r.houses })}</span>}
      </div>
      {!closed && (
        <div className="flex flex-wrap gap-1.5">
          {s.mortality_alert && <Badge tone="danger" className="text-xs"><AlertTriangle size={12} /> {t("flk.badge.alert")}</Badge>}
          {s.in_withdrawal && s.safe_meat_from && <Badge tone="danger" className="text-xs"><ShieldAlert size={12} /> {t("flk.badge.wd", { day: dayLabel(s.safe_meat_from, today) })}</Badge>}
          {s.withdrawal_unknown && <Badge tone="danger" className="text-xs">{t("flk.badge.wdUnknown")}</Badge>}
          {s.vax_overdue > 0 && <Badge tone="warn" className="text-xs"><Syringe size={12} /> {t("flk.badge.vaxLate", { n: s.vax_overdue })}</Badge>}
          {nv && s.vax_overdue === 0 && diffDays(today, nv.due_on) <= 2 && (
            <Badge tone="warn" className="text-xs"><Syringe size={12} /> {nv.vaccine} · {relDay(t, nv.due_on, today)}</Badge>
          )}
          {s.visit_overdue && <Badge tone="warn" className="text-xs"><CalendarClock size={12} /> {t("flk.badge.visitLate")}</Badge>}
        </div>
      )}
    </button>
  );
}
