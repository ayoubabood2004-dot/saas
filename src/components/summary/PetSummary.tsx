// ============================================================================
// «الملخّص» — أوّلُ ما يراه الطبيب بملف أيّ حيوان (مالكُ النطاق `psum`، كسولٌ من صفحة الحيوان).
//
// طلبُ المالك ٢٢/١١: «أوّل ما يدخل الطبيب على أي حيوان يكون هذا السكشن موجود بشكل افتراضي — ملخّص لكل شي عن الحالة
// بشكل أقسام: لقاحاته شنو ماخذ أو لا، علاجاته هل ماخذها أو لا، زياراته، ملاحظات الدكتور، وشوكت دخل وشوكت طلع بكل مرة…
// وقابلية إنه ينطبع، ولمّا أدوس على شي يوديني لمكانه الحقيقي».
//
// يقرأ ما حمّلته الصفحةُ أصلاً (لا رحلةَ ثانية لما عندها) والحسابُ كلُّه من `buildCaseModel` (صِرف، مفحوص)؛ ويجلب وحده
// ما لا تحمّله الصفحة: سجلَّ الحركة (ساعاتُ الدخول والخروج) والعمليات — وفشلُهما يُقال بسطرٍ لا يُسقط الملخّص.
// وكلُّ بطاقةٍ زرٌّ لمكانها: اللقاحُ لتبويب اللقاحات، والدواءُ لطبلة زيارته، والزيارةُ لصفحتها، والإقامةُ للدخول والخروج.
// ============================================================================
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Printer, Home, BedDouble, Pill, Syringe, Stethoscope, NotebookPen, FlaskConical, Scissors, CalendarClock, Images,
  Scale, ChevronLeft, AlertTriangle, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui";
import { repo } from "@/lib/repo";
import { page } from "@/lib/lazyPage";
import { cn, formatDate, formatNum, formatTime, localISO } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { buildCaseModel, type CaseInput, type MedLine } from "@/lib/caseSummary";
import type { Pet, PetMovement, Surgery } from "@/types";

/* نافذةُ الطباعة كسولةٌ بنطاقها (`csht`) — لا يدفعها إلا من يضغط «اطبع». */
const CaseSheetDialog = page(() => import("@/components/summary/CaseSheetDialog").then((m) => ({ default: m.CaseSheetDialog })), ["csht"]);

export type SummaryGo = "visits" | "stays" | "vaccines" | "treatment" | "history" | "notes" | "labs" | "media" | "timeline";

function Card({ icon: Icon, title, count, tone = "brand", onOpen, children, attr }: {
  icon: typeof Pill; title: string; count?: string; tone?: "brand" | "danger" | "success" | "warn" | "violet" | "teal" | "sky" | "amber";
  onOpen?: () => void; children: ReactNode; attr: string;
}) {
  const { t } = useTranslation();
  const tones: Record<string, string> = {
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-200",
    success: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200",
    warn: "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-200",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  };
  return (
    <section className="card flex flex-col gap-3 p-4" data-sum={attr}>
      <header className="flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon size={18} /></span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">{title}</h3>
        {count && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold tabular-nums text-ink-muted">{count}</span>}
        {onOpen && (
          <button type="button" onClick={() => { playTap(); onOpen(); }} data-sum-open={attr}
            className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-brand-600 transition hover:bg-surface-2">
            {t("psum.open")} <ChevronLeft size={14} className="ltr:rotate-180" />
          </button>
        )}
      </header>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </section>
  );
}

/** سطرٌ بالبطاقة — زرٌّ لمكانه حين يُعطى `onGo`. */
function Row({ onGo, children, attr }: { onGo?: () => void; children: ReactNode; attr?: string }) {
  const cls = "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-sm";
  return onGo
    ? <button type="button" onClick={() => { playTap(); onGo(); }} className={cn(cls, "transition hover:bg-surface-2")} data-sum-row={attr}>{children}</button>
    : <div className={cls}>{children}</div>;
}
const Empty = ({ text }: { text: string }) => <p className="px-2 text-xs text-ink-subtle">{text}</p>;

function DoseBar({ m }: { m: MedLine }) {
  const pct = (n: number) => `${m.total ? (n / m.total) * 100 : 0}%`;
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <span className="h-full bg-success-500" style={{ width: pct(m.given) }} />
      <span className="h-full bg-slate-400" style={{ width: pct(m.missed) }} />
      <span className="h-full bg-danger-500" style={{ width: pct(m.overdue) }} />
    </span>
  );
}

export function PetSummary({ pet, input, onGo, canPrint }: {
  pet: Pet;
  /** ما حمّلته صفحةُ الحيوان — سجلُّ الحركة يُجلب هنا. */
  input: Omit<CaseInput, "movements">;
  onGo: (to: SummaryGo) => void;
  canPrint: boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const today = localISO();
  const [movements, setMovements] = useState<PetMovement[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[] | null>(null);
  const [extraFailed, setExtraFailed] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    setExtraFailed(false);
    Promise.all([repo.listPetMovements(pet.id), repo.listSurgeries(pet.id)])
      .then(([mv, sg]) => { if (alive) { setMovements(mv); setSurgeries(sg); } })
      .catch(() => { if (alive) { setExtraFailed(true); setSurgeries([]); } });
    return () => { alive = false; };
  }, [pet.id]);

  const full = useMemo<CaseInput>(() => ({ ...input, movements }), [input, movements]);
  const m = useMemo(() => buildCaseModel(full, { today }), [full, today]);
  const d = (iso: string | null | undefined) => (iso ? formatDate(iso, lang, true) : "—");
  const dt = (iso: string | null | undefined) => (iso ? `${formatDate(iso, lang, true)} · ${formatTime(iso, lang)}` : "—");
  const goVisit = (id: string) => navigate(`/pet/${pet.id}/visit/${id}`);
  const lastVisit = m.visits[0] ?? null;
  const nextVax = m.vaccines.overdue[0] ?? m.vaccines.due[0] ?? null;
  const w = m.weight;
  const trend = w.last && w.prev ? w.last.weight_kg - w.prev.weight_kg : null;

  const kpi = (label: string, value: string, tone: string, onClick?: () => void, attr?: string) => (
    <button type="button" disabled={!onClick} onClick={() => { if (onClick) { playTap(); onClick(); } }} data-sum-kpi={attr}
      className={cn("flex min-w-0 flex-col items-start gap-0.5 rounded-2xl border border-line bg-surface-1 p-3 text-start transition", onClick && "hover:border-brand-300")}>
      <span className="text-2xs font-bold text-ink-subtle">{label}</span>
      <span className={cn("truncate text-base font-extrabold", tone)} dir="auto">{value}</span>
    </button>
  );

  return (
    <div className="space-y-4" data-petsummary>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold text-ink">{t("psum.title")}</h2>
          <p className="text-xs text-ink-subtle">{t("psum.sub")}</p>
        </div>
        {canPrint && (
          <Button leftIcon={<Printer size={16} />} onClick={() => { playTap(); setPrinting(true); }} data-sum-print>{t("psum.print")}</Button>
        )}
      </div>

      {/* لمحةٌ أولى: وين هو الآن، وآخرُ زيارة، واللقاحُ الجاي، والجرعات، والوزن. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-sum-kpis>
        {kpi(t("psum.now"), m.current ? t("psum.inClinic", { cage: m.current.cage ?? "—", n: formatNum(m.current.days) }) : t("psum.atHome"),
          m.current ? "text-danger-700 dark:text-danger-200" : "text-success-700 dark:text-success-200", () => onGo("stays"), "now")}
        {kpi(t("psum.lastVisit"), lastVisit ? d(lastVisit.opened_at) : "—", "text-ink", lastVisit ? () => goVisit(lastVisit.id) : undefined, "visit")}
        {kpi(t("psum.nextVaccine"), nextVax ? `${nextVax.name} · ${d(nextVax.due_date)}` : "—",
          m.vaccines.overdue.length ? "text-danger-700 dark:text-danger-200" : "text-ink", () => onGo("vaccines"), "vaccine")}
        {kpi(t("psum.doses"), m.totals.doses ? t("psum.givenOf", { given: formatNum(m.totals.given), total: formatNum(m.totals.doses) }) : "—",
          m.totals.overdue ? "text-danger-700 dark:text-danger-200" : "text-ink", () => onGo("treatment"), "doses")}
        {kpi(t("psum.weight"), w.last ? `${t("psum.kg", { n: formatNum(w.last.weight_kg) })}${trend ? (trend > 0 ? " ↑" : " ↓") : ""}` : (pet.current_weight_kg ? t("psum.kg", { n: formatNum(pet.current_weight_kg) }) : "—"), "text-ink", undefined, "weight")}
      </div>
      {extraFailed && <p className="rounded-xl bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-700 dark:bg-warn-500/10" data-sum-extra-failed>{t("psum.extraFailed")}</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* الدخولُ والخروج — كلُّ إقامة بيومها وساعتها وقفصها ونتيجتها. */}
        <Card icon={BedDouble} title={t("psum.stays")} count={formatNum(m.stays.length)} tone="danger" onOpen={() => onGo("stays")} attr="stays">
          {m.stays.length === 0 ? <Empty text={t("psum.noStays")} /> : m.stays.slice(0, 5).map((s) => (
            <Row key={s.id} onGo={() => onGo("stays")} attr="stay">
              {s.active ? <Home size={15} className="shrink-0 text-danger-600" /> : <CheckCircle2 size={15} className="shrink-0 text-success-600" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{t(`psum.kinds.${s.kind}`)}{s.cage ? ` · ${t("psum.cage", { c: s.cage })}` : ""} · {t("psum.days", { n: formatNum(s.days) })}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {t("psum.inOut", { in: s.inAt ? dt(s.inAt) : d(s.inDay), out: s.outDay ? (s.outAt ? dt(s.outAt) : d(s.outDay)) : t("psum.stillIn") })}
                  {s.outcome ? ` · ${t(`psum.outcomes.${s.outcome}`)}` : ""}
                </span>
              </span>
            </Row>
          ))}
        </Card>

        {/* العلاجات — كلُّ دواء: كم انطت من كم، والفائتةُ والمتأخّرة، والضغطةُ لطبلة زيارته. */}
        <Card icon={Pill} title={t("psum.treatments")} count={formatNum(m.meds.length)} tone="brand" onOpen={() => onGo("treatment")} attr="meds">
          {m.meds.length === 0 ? <Empty text={t("psum.noMeds")} /> : (
            <>
              <div className="flex flex-wrap gap-1.5 px-2 text-2xs font-bold">
                <span className="inline-flex items-center gap-1 text-success-700 dark:text-success-200"><CheckCircle2 size={12} /> {t("psum.given", { n: formatNum(m.totals.given) })}</span>
                {m.totals.overdue > 0 && <span className="inline-flex items-center gap-1 text-danger-700 dark:text-danger-200"><AlertTriangle size={12} /> {t("psum.overdue", { n: formatNum(m.totals.overdue) })}</span>}
                {m.totals.missed > 0 && <span className="inline-flex items-center gap-1 text-ink-muted"><XCircle size={12} /> {t("psum.missed", { n: formatNum(m.totals.missed) })}</span>}
                {m.totals.pending > 0 && <span className="inline-flex items-center gap-1 text-ink-muted"><Clock size={12} /> {t("psum.pending", { n: formatNum(m.totals.pending) })}</span>}
              </div>
              {m.meds.slice(0, 8).map((x) => (
                <Row key={x.key} onGo={() => (x.visitId ? goVisit(x.visitId) : onGo("treatment"))} attr="med">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-bold text-ink" dir="auto">{x.name}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-ink-muted">{t("psum.givenOf", { given: formatNum(x.given), total: formatNum(x.total) })}</span>
                    </span>
                    <DoseBar m={x} />
                    <span className="block truncate text-2xs text-ink-subtle" dir="auto">
                      {[x.route ? t(`flow.route.${x.route}`, x.route) : "", x.amounts.join(" / "), x.firstDay === x.lastDay ? d(x.firstDay) : `${d(x.firstDay)} — ${d(x.lastDay)}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Row>
              ))}
            </>
          )}
        </Card>

        {/* اللقاحات — المتأخّرُ أوّلاً، ثمّ القادم، ثمّ ما أُخذ. */}
        <Card icon={Syringe} title={t("psum.vaccines")} count={formatNum(m.vaccines.given.length)} tone="violet" onOpen={() => onGo("vaccines")} attr="vaccines">
          {m.vaccines.given.length + m.vaccines.due.length + m.vaccines.overdue.length === 0 ? <Empty text={t("psum.noVaccines")} /> : (
            <>
              {m.vaccines.overdue.map((v) => (
                <Row key={v.id} onGo={() => onGo("vaccines")} attr="vax-overdue">
                  <AlertTriangle size={15} className="shrink-0 text-danger-600" />
                  <span className="min-w-0 flex-1 truncate font-bold text-danger-700 dark:text-danger-200" dir="auto">{v.name}</span>
                  <span className="shrink-0 text-xs font-bold text-danger-700 dark:text-danger-200">{t("psum.vaxOverdue", { d: d(v.due_date) })}</span>
                </Row>
              ))}
              {m.vaccines.due.slice(0, 3).map((v) => (
                <Row key={v.id} onGo={() => onGo("vaccines")} attr="vax-due">
                  <Clock size={15} className="shrink-0 text-violet-600" />
                  <span className="min-w-0 flex-1 truncate font-bold text-ink" dir="auto">{v.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{t("psum.vaxDue", { d: d(v.due_date) })}</span>
                </Row>
              ))}
              {m.vaccines.given.slice(0, 4).map((v) => (
                <Row key={v.id} onGo={() => onGo("vaccines")} attr="vax-given">
                  <CheckCircle2 size={15} className="shrink-0 text-success-600" />
                  <span className="min-w-0 flex-1 truncate text-ink" dir="auto">{v.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{t("psum.vaxGiven", { d: d(v.administered_at) })}</span>
                </Row>
              ))}
            </>
          )}
        </Card>

        {/* الزيارات — كلُّ زيارة لصفحتها (طبلتُها وجرعاتُها). */}
        <Card icon={Stethoscope} title={t("psum.visits")} count={formatNum(m.visits.length + m.soap.length)} tone="sky" onOpen={() => onGo("visits")} attr="visits">
          {m.visits.length + m.soap.length === 0 ? <Empty text={t("psum.noVisits")} /> : (
            <>
              {m.visits.slice(0, 5).map((v) => (
                <Row key={v.id} onGo={() => goVisit(v.id)} attr="visit">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", v.status === "open" ? "bg-danger-500" : "bg-success-500")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink" dir="auto">{v.reason?.trim() || t(`psum.visitKinds.${v.kind}`)}</span>
                    <span className="block truncate text-xs text-ink-subtle" dir="auto">{d(v.opened_at)}{v.status === "open" ? ` · ${t("psum.visitOpen")}` : v.outcome ? ` · ${v.outcome}` : ""}</span>
                  </span>
                </Row>
              ))}
              {m.soap.slice(0, 3).map((v) => (
                <Row key={v.id} onGo={() => onGo("history")} attr="soap">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink" dir="auto">{v.assessment || v.subjective || t("psum.soapVisit")}</span>
                    <span className="block truncate text-xs text-ink-subtle">{d(v.visit_date)}{v.doctor_name ? ` · ${v.doctor_name}` : ""}</span>
                  </span>
                </Row>
              ))}
            </>
          )}
        </Card>

        {/* ملاحظاتُ الطبيب — وتشخيصاتُها. */}
        <Card icon={NotebookPen} title={t("psum.notes")} count={formatNum(m.notes.length)} tone="amber" onOpen={() => onGo("notes")} attr="notes">
          {m.diagnoses.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2">
              {m.diagnoses.slice(0, 6).map((x) => <span key={x} className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200" dir="auto">{x}</span>)}
            </div>
          )}
          {m.notes.length === 0 ? <Empty text={t("psum.noNotes")} /> : m.notes.slice(0, 4).map((n) => (
            <Row key={n.id} onGo={() => (n.visitId ? goVisit(n.visitId) : onGo("notes"))} attr="note">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-ink" dir="auto">{n.text || n.diagnoses.join(" · ")}</span>
                <span className="block truncate text-xs text-ink-subtle">{dt(n.at)}{n.author ? ` · ${n.author}` : ""}</span>
              </span>
            </Row>
          ))}
        </Card>

        {/* المختبر والعمليات والمواعيد والوسائط — بطاقاتٌ أصغر. */}
        <Card icon={FlaskConical} title={t("psum.labs")} count={formatNum(m.labs.length)} tone="teal" onOpen={() => onGo("labs")} attr="labs">
          {m.labs.length === 0 ? <Empty text={t("psum.noLabs")} /> : m.labs.slice(0, 4).map((l) => (
            <Row key={l.id} onGo={() => onGo("labs")} attr="lab">
              <span className="min-w-0 flex-1 truncate font-bold text-ink" dir="auto">{l.panel_label}</span>
              <span className="shrink-0 text-xs text-ink-muted">{d(l.taken_at)}</span>
            </Row>
          ))}
        </Card>

        <Card icon={Scissors} title={t("psum.surgeries")} count={surgeries ? formatNum(surgeries.length) : undefined} tone="danger" onOpen={() => onGo("history")} attr="surgeries">
          {surgeries === null ? <Empty text={t("psum.loading")} /> : surgeries.length === 0 ? <Empty text={t("psum.noSurgeries")} /> : surgeries.slice(0, 4).map((s) => (
            <Row key={s.id} onGo={() => (s.visit_id ? goVisit(s.visit_id) : onGo("history"))} attr="surgery">
              <span className="min-w-0 flex-1 truncate font-bold text-ink" dir="auto">{s.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">{d(s.performed_at)}</span>
            </Row>
          ))}
        </Card>

        <Card icon={CalendarClock} title={t("psum.upcoming")} count={formatNum(m.upcoming.length)} tone="success" attr="upcoming">
          {m.upcoming.length === 0 ? <Empty text={t("psum.noUpcoming")} /> : m.upcoming.slice(0, 4).map((a) => (
            <Row key={a.id} attr="appointment">
              <span className="min-w-0 flex-1 truncate font-bold text-ink" dir="auto">{a.doctor_name || t("psum.appointment")}</span>
              <span className="shrink-0 text-xs text-ink-muted">{dt(a.scheduled_at)}</span>
            </Row>
          ))}
          {m.media > 0 && (
            <Row onGo={() => onGo("media")} attr="media">
              <Images size={15} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 text-ink">{t("psum.media", { n: formatNum(m.media) })}</span>
            </Row>
          )}
          {w.last && (
            <Row attr="weightrow">
              <Scale size={15} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 text-ink">{t("psum.weightLine", { n: formatNum(w.last.weight_kg), d: d(w.last.measured_at) })}</span>
            </Row>
          )}
        </Card>
      </div>

      {printing && (
        <Suspense fallback={null}>
          <CaseSheetDialog petId={pet.id} data={{ pet, input: full }} onClose={() => setPrinting(false)} />
        </Suspense>
      )}
    </div>
  );
}
