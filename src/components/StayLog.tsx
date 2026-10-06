import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LogIn, LogOut, ArrowLeftRight, BedDouble, Stethoscope, Lock, Pill, SkipForward, Syringe,
  FlaskConical, Scale, NotebookPen, ClipboardList, ChevronDown, CalendarDays, Clock, RotateCw,
} from "lucide-react";
import type { Admission, ClinicVisit, LabResult, PetMovement, PetNote, TreatmentEntry, Vaccination, WeightLog } from "@/types";
import { repo } from "@/lib/repo";
import { buildStayLog, type DayLog, type LogEvent, type LogKind, type Stay } from "@/lib/stayLog";
import { visitKindMeta } from "@/lib/visits";
import { OUTCOMES } from "@/lib/clinicalKnowledge";
import { ClinicalRecordCard } from "@/components/ClinicalRecordCard";
import { formatDate, formatNum, formatTime, localISO, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * تبويبُ «الدخول والخروج» بملفّ الحيوان — كلُّ مرّةٍ دخل بيها العيادة: يومُ دخوله
 * وخروجه ومدّتُه، ووضعُه لمّا دخل (معلوماتُ الحالة)، وبكلّ يومٍ شنو صار وياه.
 * المنطقُ كلُّه بـ`stayLog.ts` (نقيّ ومفحوص)؛ هنا العرضُ وحده.
 * ========================================================================= */

const META: Record<LogKind, { icon: typeof LogIn; cls: string }> = {
  in: { icon: LogIn, cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" },
  out: { icon: LogOut, cls: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300" },
  transfer: { icon: ArrowLeftRight, cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  cage: { icon: BedDouble, cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  visitOpen: { icon: Stethoscope, cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  visitClose: { icon: Lock, cls: "bg-surface-2 text-ink-muted" },
  doses: { icon: Pill, cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" },
  dosesMissed: { icon: SkipForward, cls: "bg-surface-2 text-ink-muted" },
  vaccine: { icon: Syringe, cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  lab: { icon: FlaskConical, cls: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  weight: { icon: Scale, cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  note: { icon: NotebookPen, cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  plan: { icon: ClipboardList, cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
};

export function StayLogTab({ petId, admissions, visits, treatments, vaccinations, notes, labs, weights }: {
  petId: string; admissions: Admission[]; visits: ClinicVisit[]; treatments: TreatmentEntry[];
  vaccinations: Vaccination[]; notes: PetNote[]; labs: LabResult[]; weights: WeightLog[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [moves, setMoves] = useState<PetMovement[] | "loading" | "error">("loading");
  const admKey = admissions.map((a) => `${a.id}:${a.status}:${a.kind}:${a.cage ?? ""}`).join("|");
  const load = () => {
    setMoves("loading");
    repo.listPetMovements(petId).then(setMoves).catch(() => setMoves("error"));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [petId, admKey]);

  const log = useMemo(
    () => buildStayLog({ admissions, movements: Array.isArray(moves) ? moves : [], visits, treatments, vaccinations, notes, labs, weights }, localISO()),
    [admissions, moves, visits, treatments, vaccinations, notes, labs, weights],
  );

  const KIND: Record<string, string> = {
    treatment: t("records.kindTreatment", "علاج يومي"),
    boarding: t("records.kindBoarding", "فندقة"),
    treatment_boarding: t("records.kindCareBoarding", "فندقة علاجية"),
  };
  const kindOf = (k?: unknown) => (typeof k === "string" ? KIND[k] ?? k : "—");
  // كلُّ دواءٍ معزولُ الاتّجاه (FSI…PDI): اسمٌ لاتينيّ وعددُه بسطرٍ عربيّ كانا ينقلبان («2× Ceftriaxone»).
  const list = (v: unknown) => (Array.isArray(v) ? (v as [string, number][]).map(([n, c]) => `\u2068${c > 1 ? `${n} ×${formatNum(c)}` : n}\u2069`).join(t("common.listSep", "، ")) : "");

  const text = (e: LogEvent): string => {
    const d = e.data;
    switch (e.kind) {
      case "in": return t("movements.admitted", { kind: kindOf(d.to), defaultValue: "دخل العيادة — {{kind}}" }) + (d.toCage ? ` · ${t("records.cage", "قفص")} ${d.toCage}` : "");
      case "out": return t("movements.discharged", "خرج من العيادة");
      case "transfer": return t("movements.transferred", { from: kindOf(d.from), to: kindOf(d.to), defaultValue: "انتقل: {{from}} ← {{to}}" });
      case "cage": return t("movements.cage", { from: d.fromCage ?? "—", to: d.toCage ?? "—", defaultValue: "تغيير القفص: {{from}} ← {{to}}" });
      case "visitOpen": return t("stays.visitOpen", { kind: visitKindMeta(d.visitKind as never).label, defaultValue: "انفتحت زيارة — {{kind}}" });
      case "visitClose": {
        const o = OUTCOMES.find((x) => x.id === d.outcome);
        return o ? t("stays.visitCloseAs", { outcome: o.label, defaultValue: "انغلقت الزيارة — {{outcome}}" }) : t("stays.visitClose", "انغلقت الزيارة");
      }
      case "doses": return t("stays.doses", { n: formatNum(Number(d.count)), list: list(d.list), defaultValue: "انطت {{n}} جرعة: {{list}}" });
      case "dosesMissed": return t("stays.missed", { n: formatNum(Number(d.count)), list: list(d.list), defaultValue: "ما انطت {{n}} جرعة: {{list}}" });
      case "vaccine": return t("stays.vaccine", { name: d.name, defaultValue: "انلقح: {{name}}" });
      case "lab": return t("stays.lab", { name: d.name, defaultValue: "تحليل: {{name}}" });
      case "weight": return t("stays.weight", { kg: formatNum(Number(d.kg)), defaultValue: "الوزن {{kg}} كغم" });
      case "plan": {
        const dx = Array.isArray(d.dx) ? (d.dx as string[]).join(t("common.listSep", "، ")) : "";
        return dx ? t("stays.planDx", { dx, defaultValue: "تشخيص وخطة علاج: {{dx}}" }) : t("stays.plan", "تشخيص وخطة علاج");
      }
      case "note": return d.intake ? t("stays.intakeNote", { text: d.text, defaultValue: "معلومات الحالة: {{text}}" }) : String(d.text ?? "");
    }
  };

  if (moves === "loading") return <p className="py-10 text-center text-sm text-ink-subtle">{t("visit.loading", "جارٍ التحميل…")}</p>;

  return (
    <div className="space-y-4 animate-fade-in" data-staylog>
      {moves === "error" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
          {t("stays.movesFailed", "ما وصلت ساعات الدخول والخروج — الأيام معروضة بلا ساعة.")}
          <button type="button" onClick={() => { playTap(); load(); }} className="ms-auto inline-flex items-center gap-1 font-bold underline"><RotateCw size={12} /> {t("common.retry", "أعد المحاولة")}</button>
        </div>
      )}

      {/* الخلاصة */}
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-surface-1 text-center shadow-soft" data-stay-totals>
        <div className="py-3">
          <p className="text-lg font-extrabold tabular-nums text-ink">{formatNum(log.totals.stays)}</p>
          <p className="text-2xs font-bold text-ink-subtle">{t("stays.timesIn", "مرّات الدخول")}</p>
        </div>
        <div className="border-x border-line py-3">
          <p className="text-lg font-extrabold tabular-nums text-ink">{formatNum(log.totals.daysInClinic)}</p>
          <p className="text-2xs font-bold text-ink-subtle">{t("stays.daysIn", "يوم بالعيادة")}</p>
        </div>
        <div className="py-3">
          <p className="text-sm font-extrabold text-ink">{log.totals.lastIn ? formatDate(log.totals.lastIn, lang) : "—"}</p>
          {log.totals.inNow
            ? <p className="text-2xs font-bold text-success-600 dark:text-success-400">{t("stays.inNow", "بالعيادة هسّة")}</p>
            : <p className="text-2xs font-bold text-ink-subtle">{t("stays.lastIn", "آخر دخول")}</p>}
        </div>
      </div>

      {log.stays.length === 0 && log.outside.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-ink-subtle">
          <CalendarDays size={28} className="mb-2 opacity-40" />
          {t("stays.empty", "ما دخل العيادة بعد — من يدخل، تطلع هنا أيامه وكل شي صار وياه.")}
        </div>
      ) : (
        <>
          {log.stays.map((s, i) => <StayCard key={s.id} stay={s} defaultOpen={i === 0} lang={lang} kindOf={kindOf} text={text} />)}
          {log.outside.length > 0 && (
            <section className="card overflow-hidden" data-stay-outside>
              <h4 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-extrabold text-ink">
                <Stethoscope size={16} className="text-brand-600" /> {t("stays.outside", "زيارات بدون مبيت")}
                <span className="chip bg-surface-2 text-2xs font-semibold text-ink-muted">{formatNum(log.outside.length)}</span>
              </h4>
              <DayList days={log.outside} lang={lang} text={text} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StayCard({ stay, defaultOpen, lang, kindOf, text }: {
  stay: Stay; defaultOpen: boolean; lang: string; kindOf: (k?: unknown) => string; text: (e: LogEvent) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const outcome = stay.outcome === "deceased" ? t("stays.deceased", "متوفى") : stay.outcome === "recovered" ? t("stays.recovered", "طلع سليم") : null;
  return (
    <section className={cn("card overflow-hidden", stay.active && "border border-success-300 dark:border-success-500/40")} data-stay={stay.id}>
      <button type="button" onClick={() => { playTap(); setOpen((o) => !o); }}
        className="flex w-full flex-wrap items-center gap-3 p-4 text-start transition hover:bg-surface-2/50">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", stay.active ? "bg-success-500 text-white" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300")}><BedDouble size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-ink">
            {kindOf(stay.kind)}
            {stay.cage && <span className="chip bg-surface-2 text-2xs font-semibold text-ink-muted">{t("records.cage", "قفص")} {stay.cage}</span>}
            {stay.active && <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300"><span className="h-1.5 w-1.5 rounded-full bg-success-500" /> {t("stays.stillIn", "بعده داخل")}</span>}
            {outcome && <span className="chip bg-surface-2 text-2xs font-semibold text-ink-muted">{outcome}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ink-muted tabular-nums" data-stay-range>
            <span className="inline-flex items-center gap-1"><LogIn size={12} className="text-success-600" /> {formatDate(stay.inDay, lang)}</span>
            <span>←</span>
            <span className="inline-flex items-center gap-1"><LogOut size={12} className="text-danger-500" /> {stay.outDay ? formatDate(stay.outDay, lang) : t("stays.stillIn", "بعده داخل")}</span>
            <span className="text-ink-subtle">· {t("stays.nDays", { n: formatNum(stay.days), defaultValue: "{{n}} يوم" })}</span>
          </p>
          {stay.reason && <p className="mt-0.5 truncate text-2xs text-ink-subtle">{stay.reason}</p>}
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line p-3">
          {stay.intakes.map((r, i) => <ClinicalRecordCard key={i} record={r} compact />)}
          {stay.dayLogs.length > 0
            ? <DayList days={stay.dayLogs} lang={lang} text={text} startDay={stay.inDay} />
            : <p className="px-1 py-2 text-xs text-ink-subtle">{t("stays.noEvents", "ما انسجّل شي بأيام هاي الإقامة.")}</p>}
        </div>
      )}
    </section>
  );
}

function DayList({ days, lang, text, startDay }: { days: DayLog[]; lang: string; text: (e: LogEvent) => string; startDay?: string }) {
  const { t } = useTranslation();
  const dayIdx = (d: string) => (startDay ? Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86400000) + 1 : null);
  return (
    <ol className="divide-y divide-line/70">
      {days.map((d) => {
        const n = dayIdx(d.day);
        return (
          <li key={d.day} className="px-2 py-2.5" data-stay-day={d.day}>
            <p className="mb-1.5 flex items-center gap-2 text-xs font-extrabold text-ink">
              <CalendarDays size={13} className="text-brand-600" /> {formatDate(d.day, lang)}
              {n != null && n >= 1 && <span className="chip bg-surface-2 text-[10px] font-bold text-ink-muted">{t("stays.dayN", { n: formatNum(n), defaultValue: "اليوم {{n}}" })}</span>}
            </p>
            <ul className="space-y-1.5">
              {d.events.map((e, i) => {
                const M = META[e.kind];
                const Icon = M.icon;
                return (
                  <li key={i} className="flex items-start gap-2" data-stay-event={e.kind}>
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg", M.cls)}><Icon size={13} /></span>
                    <span className="min-w-0 flex-1 text-sm leading-snug text-ink">{text(e)}</span>
                    {e.at && <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold tabular-nums text-ink-subtle"><Clock size={10} /> {formatTime(e.at, lang)}</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
