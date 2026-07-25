// ============================================================================
// صفحة «العمليات» — سجل بيانات كامل لكل العمليات الجراحية بالعيادة.
// تُفتح من قائمة الطبلات المنسدلة في الشريط الجانبي.
//
//   • مؤشرات: الإجمالي، هذا الشهر، نسبة النجاح، متوسط المدة، مواعيد المتابعة.
//   • اتجاه شهري (آخر ٦ أشهر) — أعمدة.
//   • أكثر العمليات إجراءً + توزيع النتائج + حسب الجرّاح.
//   • السجل الكامل: بحث + فلترة بالنتيجة، وكل صف يفتح ملف الحيوان.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Slice, Search, TrendingUp, Award, Clock, CalendarCheck2, UserRound, ChevronLeft, Loader2, Activity } from "lucide-react";
import type { Pet, Surgery } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { localISO, formatDate, formatNum, cn } from "@/lib/utils";
import { PetAvatar } from "@/components/PetAvatar";
import { playTap } from "@/lib/sounds";

const OUTCOME_META: Record<string, { label: string; dot: string; bar: string; chip: string }> = {
  success: { label: "ناجحة", dot: "bg-success-500", bar: "bg-success-500", chip: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" },
  complications: { label: "مضاعفات", dot: "bg-warn-500", bar: "bg-warn-500", chip: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300" },
  critical: { label: "حرجة", dot: "bg-danger-500", bar: "bg-danger-500", chip: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" },
};

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** اسم العملية بدون الشق الإنجليزي — للتجميع في «الأكثر إجراءً». */
const baseName = (n: string) => n.split("—")[0].trim() || n;

export function SurgeriesHub() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language;
  const todayISO = localISO();

  const [rows, setRows] = useState<Surgery[] | null>(null);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [q, setQ] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [srg, petList] = await Promise.all([
        repo.listAllSurgeries().catch(() => [] as Surgery[]),
        repo.listAllPets(user?.clinic_id ?? user?.id).catch(() => [] as Pet[]),
      ]);
      if (!alive) return;
      setRows(srg);
      const map: Record<string, Pet> = {};
      for (const p of petList) map[p.id] = p;
      setPets(map);
    })();
    return () => { alive = false; };
  }, [user?.clinic_id, user?.id]);

  const all = rows ?? [];
  const monthKey = todayISO.slice(0, 7);

  /* ---------- المؤشرات ---------- */
  const stats = useMemo(() => {
    const month = all.filter((s) => s.performed_at.slice(0, 7) === monthKey);
    const outcomes = { success: 0, complications: 0, critical: 0 } as Record<string, number>;
    let durSum = 0, durN = 0;
    for (const s of all) {
      if (s.outcome && outcomes[s.outcome] !== undefined) outcomes[s.outcome]++;
      if (s.duration_min) { durSum += s.duration_min; durN++; }
    }
    const judged = outcomes.success + outcomes.complications + outcomes.critical;
    const successRate = judged ? Math.round((outcomes.success / judged) * 100) : null;
    const upcoming = all.filter((s) => s.followup_on && s.followup_on >= todayISO).length;
    return { total: all.length, month: month.length, outcomes, successRate, avgDur: durN ? Math.round(durSum / durN) : null, upcoming };
  }, [all, monthKey, todayISO]);

  /* ---------- الاتجاه الشهري (آخر ٦ أشهر) ---------- */
  const trend = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = [];
    const d = new Date(todayISO + "T00:00:00");
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      out.push({ key, label: AR_MONTHS[m.getMonth()], n: all.filter((s) => s.performed_at.slice(0, 7) === key).length });
    }
    return out;
  }, [all, todayISO]);
  const trendMax = Math.max(1, ...trend.map((t) => t.n));

  /* ---------- الأكثر إجراءً + حسب الجرّاح ---------- */
  const topProcedures = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of all) m.set(baseName(s.name), (m.get(baseName(s.name)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [all]);
  const bySurgeon = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of all) if (s.surgeon) m.set(s.surgeon, (m.get(s.surgeon) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [all]);
  const topMax = Math.max(1, ...(topProcedures.map(([, n]) => n)));

  /* ---------- السجل ---------- */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((s) => {
      if (outcomeFilter && s.outcome !== outcomeFilter) return false;
      if (!needle) return true;
      const pet = pets[s.pet_id];
      return s.name.toLowerCase().includes(needle)
        || (pet?.name ?? "").toLowerCase().includes(needle)
        || (s.surgeon ?? "").toLowerCase().includes(needle);
    });
  }, [all, q, outcomeFilter, pets]);

  const booting = rows === null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:max-w-6xl xl:max-w-7xl">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-600 text-white shadow-card"><Slice size={22} /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-ink">العمليات الجراحية</h1>
          <p className="text-xs font-semibold text-ink-subtle">سجل بيانات كامل — كل عملية أجريتها، بنتائجها ومؤشراتها.</p>
        </div>
      </div>

      {booting ? (
        <div className="grid min-h-[40vh] place-items-center"><Loader2 size={28} className="animate-spin text-brand-600" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Kpi icon={<Slice size={17} />} tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" value={formatNum(stats.total)} label="إجمالي العمليات" />
            <Kpi icon={<TrendingUp size={17} />} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" value={formatNum(stats.month)} label="هذا الشهر" />
            <Kpi icon={<Award size={17} />} tone="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" value={stats.successRate === null ? "—" : `${formatNum(stats.successRate)}٪`} label="نسبة النجاح" />
            <Kpi icon={<Clock size={17} />} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" value={stats.avgDur === null ? "—" : `${formatNum(stats.avgDur)} د`} label="متوسط المدة" />
            <Kpi icon={<CalendarCheck2 size={17} />} tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" value={formatNum(stats.upcoming)} label="متابعات قادمة" />
          </div>

          {/* Analytics row */}
          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            {/* الاتجاه الشهري */}
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-ink"><Activity size={15} className="text-brand-600" /> العمليات شهرياً</h2>
              <div className="flex h-32 items-end gap-2">
                {trend.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-2xs font-black tabular-nums text-ink">{m.n > 0 ? formatNum(m.n) : ""}</span>
                    <div
                      className={cn("w-full rounded-t-lg transition-all", m.key === monthKey ? "bg-rose-500" : "bg-brand-200 dark:bg-brand-500/30")}
                      style={{ height: `${Math.max(4, (m.n / trendMax) * 88)}px` }}
                    />
                    <span className="text-[10px] font-bold text-ink-subtle">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* الأكثر إجراءً */}
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-ink"><Award size={15} className="text-rose-600" /> أكثر العمليات إجراءً</h2>
              {topProcedures.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-muted">لا بيانات بعد</p>
              ) : (
                <div className="space-y-2.5">
                  {topProcedures.map(([name, n]) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-bold text-ink">{name}</span>
                        <span className="shrink-0 font-black tabular-nums text-ink-muted">{formatNum(n)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${(n / topMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* النتائج + الجرّاحون */}
            <div className="card space-y-4 p-4">
              <div>
                <h2 className="mb-2.5 text-sm font-extrabold text-ink">توزيع النتائج</h2>
                {(["success", "complications", "critical"] as const).map((k) => {
                  const n = stats.outcomes[k];
                  const judged = stats.outcomes.success + stats.outcomes.complications + stats.outcomes.critical;
                  const pct = judged ? Math.round((n / judged) * 100) : 0;
                  return (
                    <div key={k} className="mb-2 flex items-center gap-2 text-xs">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", OUTCOME_META[k].dot)} />
                      <span className="w-16 font-bold text-ink">{OUTCOME_META[k].label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className={cn("h-full rounded-full", OUTCOME_META[k].bar)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-end font-black tabular-nums text-ink-muted">{formatNum(pct)}٪</span>
                    </div>
                  );
                })}
              </div>
              {bySurgeon.length > 0 && (
                <div className="border-t border-line pt-3">
                  <h2 className="mb-2 text-sm font-extrabold text-ink">حسب الجرّاح</h2>
                  {bySurgeon.map(([name, n]) => (
                    <div key={name} className="mb-1.5 flex items-center gap-2 text-xs">
                      <UserRound size={13} className="shrink-0 text-ink-subtle" />
                      <span className="flex-1 truncate font-bold text-ink">{name}</span>
                      <span className="font-black tabular-nums text-ink-muted">{formatNum(n)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* السجل الكامل */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><Slice size={15} className="text-rose-600" /> السجل الكامل <span className="chip bg-surface-2 text-2xs text-ink-muted">{formatNum(filtered.length)}</span></h2>
            <div className="ms-auto flex flex-wrap items-center gap-1.5">
              {(["success", "complications", "critical"] as const).map((k) => (
                <button key={k} onClick={() => { playTap(); setOutcomeFilter(outcomeFilter === k ? null : k); }}
                  className={cn("rounded-full px-3 py-1.5 text-2xs font-black transition", outcomeFilter === k ? OUTCOME_META[k].chip + " ring-1 ring-current" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {OUTCOME_META[k].label}
                </button>
              ))}
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />
                <input className="input h-9 w-52 text-xs ltr:pl-8 rtl:pr-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالعملية، الحيوان، أو الجرّاح…" />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card p-8 text-center text-sm text-ink-muted">
              {all.length === 0 ? "لا عمليات مسجلة بعد — تُسجل من داخل سجل الحالة بزر «تسجيل عملية»." : "لا نتائج مطابقة."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => {
                const pet = pets[s.pet_id];
                const om = s.outcome ? OUTCOME_META[s.outcome] : null;
                return (
                  <button key={s.id} onClick={() => { playTap(); navigate(`/pet/${s.pet_id}`); }}
                    className="flex w-full flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-3 text-start transition hover:border-rose-300">
                    {pet ? <PetAvatar pet={pet} size={38} /> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><Slice size={16} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-ink">{s.name}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs font-bold text-ink-subtle">
                        {pet && <span className="text-brand-700 dark:text-brand-300">{pet.name}</span>}
                        <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatDate(s.performed_at, lang)}</span>
                        {s.surgeon && <span className="inline-flex items-center gap-1"><UserRound size={11} /> {s.surgeon}</span>}
                        {s.duration_min ? <span>{formatNum(s.duration_min)} دقيقة</span> : null}
                      </span>
                    </span>
                    {s.followup_on && s.followup_on >= todayISO && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-2xs font-black text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><CalendarCheck2 size={11} /> متابعة {formatDate(s.followup_on, lang)}</span>
                    )}
                    {om && <span className={cn("rounded-full px-2.5 py-1 text-2xs font-black", om.chip)}>{om.label}</span>}
                    <ChevronLeft size={15} className="text-ink-subtle rtl:rotate-0 ltr:rotate-180" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: string; label: string }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate font-display text-lg font-black tabular-nums leading-tight text-ink">{value}</span>
        <span className="block text-2xs font-bold text-ink-subtle">{label}</span>
      </span>
    </div>
  );
}
