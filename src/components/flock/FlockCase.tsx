/* ============================================================================
 * صفحةُ حالة الحقل (docs/field-cases-plan.md §٧-ج) — رفيقةُ نطاق flk.
 *
 * رأسٌ ثابت (الحقل، العمر، الحيّ، النفوق، حالُ آخر زيارة)، وتحته ما يجب أن يُرى قبل أيّ شيء: «ممنوع البيع
 * قبل…»، سحبٌ غير معروف، تحصينٌ متأخّر أو قريب، نفوقٌ فوق الحدّ بقاعاته **كلِّها**، زيارةٌ متأخّرة. ثمّ الأفعال
 * بنقرة، والأقسامُ. والحزمةُ كلُّها من نداءٍ واحد (`flock_case_bundle`) يُعاد بعد كلّ حفظ — والإعادةُ الفاشلة
 * تُقال («المعروض قد يكون قديماً») لا تبقى صامتة. والوجبةُ المغلقة تقولها بدل الأفعال (الخادمُ يرفض الكتابة).
 * ========================================================================= */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Camera, ClipboardList, Lock, MessageCircle, MoreVertical, Pencil, Phone, Pill,
  RefreshCw, ShieldAlert, Skull, Stethoscope, Syringe, Trash2, TrendingDown, TrendingUp, Minus, Unlock,
} from "lucide-react";
import { Badge, Button, Dialog, useToast } from "@/components/ui";
import { LoadBoundary } from "@/components/LoadBoundary";
import { usePermissions } from "@/hooks/usePermissions";
import { page } from "@/lib/lazyPage";
import { cn, formatNum, localISO } from "@/lib/utils";
import { getDialCode } from "@/lib/settings";
import { waNumber } from "@/lib/phone";
import { prepareUpload } from "@/lib/image";
import { describeUploadError } from "@/lib/errors";
import { flockApi } from "@/lib/flockApi";
import { addDays, ageOn, dailyLosses, diffDays, dueOn, FLOCK_ALERT_PCT } from "@/lib/flockMath";
import type { FlockBundle, FlockMedia, FlockMortality, FlockTreatment, FlockVax, FlockVisit } from "@/lib/flockTypes";
import { ageLabel, dayLabel, flockError, isClosed, localDay, num, relDay } from "./flockShared";
import { CaseEditSheet, CloseSheet, FarmEditSheet, MortalitySheet, ProgramsSheet, VaxSheet, type VaxMode } from "./FlockSheets";
import { TreatmentCard, TreatmentSheet } from "./FlockTreatment";

const loadVisit = () => page(() => import("@/components/flock/FlockVisit").then((m) => ({ default: m.FlockVisit })), ["flkv"]);
let FlockVisitLazy = loadVisit();
const loadPhotoSource = () => page(() => import("@/components/attach/Attach").then((m) => ({ default: m.PhotoSource })), ["att"]);
let PhotoSourceLazy = loadPhotoSource();

type Tab = "timeline" | "mortality" | "visits" | "vax" | "tx" | "feed" | "media";
type Sheet =
  | { k: "mortality"; row?: FlockMortality }
  | { k: "vax"; vax?: FlockVax; mode: VaxMode }
  | { k: "tx"; tx?: FlockTreatment }
  | { k: "visit"; visit?: FlockVisit }
  | { k: "close" } | { k: "edit" } | { k: "farm" } | { k: "programs" } | { k: "menu" }
  | null;

export function FlockCasePage() {
  const { caseId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const [b, setB] = useState<FlockBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [visitTick, setVisitTick] = useState(0);
  const seq = useRef(0);
  const today = localISO();

  /** يرجع الحزمةَ الجديدة (أو null إن فشلت) — من يفتح شيئاً بعد الحفظ يفتحه منها لا من القديمة. */
  const reload = useCallback(async (): Promise<FlockBundle | null> => {
    const my = ++seq.current;
    try {
      const nb = await flockApi.bundle(caseId);
      if (my === seq.current) { setB(nb); setErr(null); setStale(false); }
      return nb;
    } catch (e) {
      if (my === seq.current) { setErr(flockError(e, t)); setStale(true); }
      return null;
    }
  }, [caseId, t]);
  useEffect(() => { setB(null); setErr(null); setStale(false); void reload(); }, [reload]);

  const saved = useCallback((msg?: string) => {
    setSheet(null);
    if (msg) toast.success(msg);
    void reload();
  }, [reload, toast]);

  if (!b) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <BackLink onClick={() => navigate("/poultry")} label={t("flk.back")} />
        {err ? (
          <div className="card flex flex-col items-center gap-3 p-8 text-center" data-flock-error>
            <AlertTriangle size={28} className="text-danger-600" />
            <p className="text-sm text-ink">{err}</p>
            <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void reload()}>{t("flk.retry")}</Button>
          </div>
        ) : (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="card h-28 animate-pulse" />)}</div>
        )}
      </div>
    );
  }

  const c = b.case;
  const s = b.stats;
  const closed = isClosed(c);
  const houseName = (id: string | null) => b.houses.find((h) => h.id === id)?.label ?? t("flk.wholeFlock");
  const layer = c.kind === "layer" || c.kind === "breeder";

  const tabs: { k: Tab; label: string; n?: number }[] = [
    { k: "timeline", label: t("flk.tab.timeline") },
    { k: "mortality", label: t("flk.tab.mortality"), n: b.mortality.length },
    { k: "visits", label: t("flk.tab.visits"), n: b.visits.length },
    { k: "vax", label: t("flk.tab.vax"), n: b.vax.length },
    { k: "tx", label: t("flk.tab.tx"), n: b.treatments.filter((x) => x.status !== "replaced").length },
    { k: "feed", label: t("flk.tab.feed") },
    { k: "media", label: t("flk.tab.media"), n: b.media.length },
  ];

  const actions: { k: string; icon: ReactNode; label: string; on: () => void; show: boolean }[] = [
    { k: "visit", icon: <Stethoscope size={20} />, label: t("flk.act.visit"), on: () => setSheet({ k: "visit" }), show: can("editMedical") },
    { k: "mortality", icon: <Skull size={20} />, label: t("flk.act.mortality"), on: () => setSheet({ k: "mortality" }), show: can("addPets") },
    { k: "tx", icon: <Pill size={20} />, label: t("flk.act.tx"), on: () => setSheet({ k: "tx" }), show: can("editMedical") },
    { k: "vax", icon: <Syringe size={20} />, label: t("flk.act.vax"), on: () => setSheet({ k: "vax", mode: "new" }), show: can("editMedical") },
    { k: "media", icon: <Camera size={20} />, label: t("flk.act.photo"), on: () => setTab("media"), show: can("addPets") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" data-flock-case={c.id}>
      <BackLink onClick={() => navigate("/poultry")} label={t("flk.back")} />

      {stale && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-flock-stale>
          <AlertTriangle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">{t("flk.stale")}{err ? ` — ${err}` : ""}</span>
          <button type="button" className="font-bold underline" onClick={() => void reload()}>{t("flk.retry")}</button>
        </div>
      )}

      {/* ── الرأس ─────────────────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-ink">{b.farm.name}</h1>
            <div className="truncate text-xs text-ink-muted">
              {[b.farm.owner_name, b.farm.area || b.farm.governorate].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {b.farm.owner_phone && (
              <>
                <a href={`tel:${b.farm.owner_phone}`} className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink" aria-label={t("flk.call")}><Phone size={18} /></a>
                <a href={`https://wa.me/${waNumber(b.farm.owner_phone, getDialCode())}`} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-xl text-success-600 transition hover:bg-surface-2" aria-label={t("flk.whatsapp")}><MessageCircle size={18} /></a>
              </>
            )}
            {(can("addPets") || can("editMedical")) && (
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink" aria-label={t("flk.more")} onClick={() => setSheet({ k: "menu" })} data-flock-menu><MoreVertical size={18} /></button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="brand" className="text-xs">{t(`flk.kind.${c.kind}`)}{c.breed ? ` · ${c.breed}` : ""}</Badge>
          <Badge tone={closed ? "neutral" : "sky"} className="text-xs" data-flock-age>
            {closed ? t("flk.closedOn", { day: dayLabel(c.closed_on, today) }) : ageLabel(t, c.placed_on, today)}
          </Badge>
          {b.houses.length > 1 && <Badge tone="neutral" className="text-xs">{t("flk.housesN", { n: b.houses.length })}</Badge>}
          {c.hatchery && <Badge tone="neutral" className="text-xs">{c.hatchery}</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <HeadStat label={t("flk.stat.alive")} value={formatNum(s.alive)} sub={t("flk.stat.of", { n: formatNum(s.placed) })} />
          <HeadStat label={t("flk.stat.mortality")} value={`${num(s.cum_pct)}%`} sub={t("flk.stat.deadCulled", { dead: formatNum(s.dead), culled: formatNum(s.culled) })} warn={s.mortality_alert} />
          <HeadStat label={t("flk.stat.lastVisit")} value={s.last_visit_at ? relDay(t, localDay(s.last_visit_at), today) : "—"}
            sub={s.last_trend ? t(`flk.trend.${s.last_trend}`) : t("flk.stat.noVisit")} icon={trendIcon(s.last_trend)} />
        </div>
      </div>

      {/* ── التنبيهات ──────────────────────────────────────────────────────── */}
      <div className="mt-3 space-y-2" data-flock-alerts>
        {!closed && s.in_withdrawal && s.safe_meat_from && (
          <AlertRow tone="danger" icon={<ShieldAlert size={18} />}>{t("flk.alert.wd", { day: dayLabel(s.safe_meat_from, today) })}</AlertRow>
        )}
        {!closed && s.withdrawal_unknown && <AlertRow tone="danger" icon={<ShieldAlert size={18} />}>{t("flk.alert.wdUnknown")}</AlertRow>}
        {!closed && layer && s.safe_egg_from && s.safe_egg_from > today && (
          <AlertRow tone="danger" icon={<ShieldAlert size={18} />}>{t("flk.alert.wdEgg", { day: dayLabel(s.safe_egg_from, today) })}</AlertRow>
        )}
        {!closed && layer && s.egg_withdrawal_unknown && <AlertRow tone="danger" icon={<ShieldAlert size={18} />}>{t("flk.alert.wdEggUnknown")}</AlertRow>}
        {!closed && s.mortality_alert && (
          <AlertRow tone="danger" icon={<AlertTriangle size={18} />}>
            {s.alert_houses.length ? t("flk.alert.mortHouses", { houses: s.alert_houses.map(houseName).join(t("common.listSep")), pct: FLOCK_ALERT_PCT }) : t("flk.alert.mort", { pct: FLOCK_ALERT_PCT })}
          </AlertRow>
        )}
        {!closed && s.vax_overdue > 0 && <AlertRow tone="warn" icon={<Syringe size={18} />}>{t("flk.alert.vaxLate", { n: s.vax_overdue })}</AlertRow>}
        {!closed && s.next_vax && diffDays(today, s.next_vax.due_on) <= 3 && diffDays(today, s.next_vax.due_on) >= 0 && (
          <AlertRow tone="warn" icon={<Syringe size={18} />}>
            {t("flk.alert.vaxNext", { vaccine: s.next_vax.vaccine, route: t(`flk.route.${s.next_vax.route}`), age: s.next_vax.age, when: relDay(t, s.next_vax.due_on, today) })}
          </AlertRow>
        )}
        {!closed && s.visit_overdue && s.next_visit_on && (
          <AlertRow tone="warn" icon={<Stethoscope size={18} />}>{t("flk.alert.visitLate", { day: dayLabel(s.next_visit_on, today) })}</AlertRow>
        )}
      </div>

      {/* ── الأفعال ───────────────────────────────────────────────────────── */}
      {closed ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink-muted" data-flock-closed>
          <Lock size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">{t("flk.closedNote", { reason: c.close_reason ? t(`flk.close.reason.${c.close_reason}`) : "—" })}</span>
          {can("editMedical") && (
            <Button size="sm" variant="outline" leftIcon={<Unlock size={15} />} onClick={async () => {
              try { await flockApi.reopenCase(c.id); saved(t("flk.reopened")); } catch (e) { toast.error(flockError(e, t)); }
            }} data-flock-reopen>{t("flk.reopen")}</Button>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-5 gap-2" data-flock-actions>
          {actions.filter((a) => a.show).map((a) => (
            <button key={a.k} type="button" onClick={a.on} data-flock-act={a.k}
              className="card flex flex-col items-center gap-1 px-1 py-3 text-xs font-bold text-ink transition hover:shadow-raised">
              <span className="text-brand-600 dark:text-brand-300">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}

      {/* ── الأقسام ───────────────────────────────────────────────────────── */}
      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)} data-flock-tab={x.k}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              tab === x.k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
            {x.label}{x.n ? <span className="ms-1 opacity-75">{x.n}</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === "timeline" && <Timeline b={b} today={today} houseName={houseName} />}
        {tab === "mortality" && (
          <MortalityTab b={b} today={today} houseName={houseName} canEdit={!closed && can("addPets")}
            onEdit={(row) => setSheet({ k: "mortality", row })} onDeleted={() => saved(t("flk.deleted"))} />
        )}
        {tab === "visits" && <VisitsTab b={b} today={today} onOpen={(visit) => setSheet({ k: "visit", visit })} />}
        {tab === "vax" && (
          <VaxTab b={b} today={today} canEdit={!closed && can("editMedical")} canPrograms={can("manageSettings")}
            onAct={(vax, mode) => setSheet({ k: "vax", vax, mode })} onPrograms={() => setSheet({ k: "programs" })} onDeleted={() => saved(t("flk.deleted"))} />
        )}
        {tab === "tx" && (
          <div className="space-y-3" data-flock-tx-list>
            {!closed && can("editMedical") && (
              <Button variant="secondary" leftIcon={<Pill size={16} />} onClick={() => setSheet({ k: "tx" })}>{t("flk.tx.new")}</Button>
            )}
            {b.treatments.length === 0 && <Empty text={t("flk.tx.none")} />}
            {[...b.treatments]
              .sort((x, y) => rank(x) - rank(y) || y.start_on.localeCompare(x.start_on) || y.version - x.version)
              .map((tx) => (
                <TreatmentCard key={tx.id} b={b} tx={tx} today={today} closed={closed} canEdit={can("editMedical")} canSend={can("addPets")}
                  onEdit={() => setSheet({ k: "tx", tx })} onChanged={(msg) => saved(msg)} />
              ))}
          </div>
        )}
        {tab === "feed" && <FeedTab b={b} today={today} />}
        {tab === "media" && (
          <MediaTab b={b} canAdd={can("addPets")} canRemove={can("editMedical")} onChanged={() => saved()} />
        )}
      </div>

      {/* ── النوافذ ───────────────────────────────────────────────────────── */}
      {sheet?.k === "mortality" && <MortalitySheet b={b} row={sheet.row} onClose={() => setSheet(null)} onSaved={() => saved(t("flk.saved"))} />}
      {sheet?.k === "vax" && <VaxSheet b={b} vax={sheet.vax} mode={sheet.mode} onClose={() => setSheet(null)} onSaved={() => saved(t("flk.saved"))} />}
      {sheet?.k === "tx" && <TreatmentSheet b={b} tx={sheet.tx} onClose={() => setSheet(null)} onSaved={(msg) => saved(msg)} />}
      {sheet?.k === "close" && <CloseSheet b={b} onClose={() => setSheet(null)} onSaved={() => saved(t("flk.closedDone"))} />}
      {sheet?.k === "edit" && <CaseEditSheet b={b} onClose={() => setSheet(null)} onSaved={() => saved(t("flk.saved"))} />}
      {sheet?.k === "farm" && <FarmEditSheet b={b} onClose={() => setSheet(null)} onSaved={() => saved(t("flk.saved"))} />}
      {sheet?.k === "programs" && <ProgramsSheet onClose={() => setSheet(null)} />}
      {sheet?.k === "menu" && (
        <Dialog open onClose={() => setSheet(null)} title={b.farm.name} size="sm">
          <div className="grid gap-2">
            {!closed && can("addPets") && <Button variant="outline" leftIcon={<Pencil size={16} />} onClick={() => setSheet({ k: "edit" })} data-flock-edit>{t("flk.editCase")}</Button>}
            {can("addPets") && <Button variant="outline" leftIcon={<Pencil size={16} />} onClick={() => setSheet({ k: "farm" })} data-flock-farm-edit>{t("flk.farmEdit.title")}</Button>}
            {!closed && can("editMedical") && <Button variant="outline" leftIcon={<Lock size={16} />} onClick={() => setSheet({ k: "close" })} data-flock-close>{t("flk.closeCase")}</Button>}
            {closed && <p className="text-sm text-ink-muted">{t("flk.closedHint")}</p>}
          </div>
        </Dialog>
      )}
      {sheet?.k === "visit" && (
        <LoadBoundary scope="flock-visit" onRetry={() => { FlockVisitLazy = loadVisit(); setVisitTick((n) => n + 1); }}>
          <Suspense fallback={null}>
            <FlockVisitLazy key={`${visitTick}-${sheet.visit?.id ?? "new"}`} b={b} visit={sheet.visit} canEdit={!closed && can("editMedical")}
              canPhoto={can("addPets")} onClose={() => setSheet(null)} onChanged={() => void reload()}
              onSaved={async (msg: string, v?: FlockVisit) => {
                // الزيارةُ المحفوظة تُفتح من الحزمة **الجديدة** وحدها: فتحُها من القديمة (بلا نافقها وتشريحها) ثمّ «عدّل»
                // قبل وصول الجديدة كان يرسل [] فيمسحهما الخادم (مراجعةٌ عدائيّة). تفشل الإعادة ⇒ تبقى مغلقة وشريطُ «قديم».
                toast.success(msg);
                setSheet(null);
                const nb = await reload();
                const fresh = v && nb ? nb.visits.find((x) => x.id === v.id) : undefined;
                if (fresh) setSheet((cur) => cur ?? { k: "visit", visit: fresh });
              }} />
          </Suspense>
        </LoadBoundary>
      )}
    </div>
  );
}

const rank = (x: FlockTreatment) => (x.status === "active" ? 0 : x.status === "stopped" || x.status === "done" ? 1 : 2);
const trendIcon = (tr: FlockVisit["trend"]) =>
  tr === "better" ? <TrendingUp size={14} className="text-success-600" /> : tr === "worse" ? <TrendingDown size={14} className="text-danger-600" /> : tr === "same" ? <Minus size={14} /> : null;

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="btn-ghost mb-2 px-2 py-1 text-sm" onClick={onClick} data-flock-back>
      <ArrowLeft size={18} className="rtl:rotate-180" /> {label}
    </button>
  );
}

function HeadStat({ label, value, sub, warn, icon }: { label: string; value: string; sub?: string; warn?: boolean; icon?: ReactNode }) {
  return (
    <div className={cn("rounded-xl bg-surface-2 px-2 py-2", warn && "bg-danger-50 dark:bg-danger-500/10")}>
      <div className="text-2xs font-bold text-ink-subtle">{label}</div>
      <div className={cn("flex items-center justify-center gap-1 text-base font-extrabold tabular-nums text-ink", warn && "text-danger-700 dark:text-danger-300")}>{icon}{value}</div>
      {sub && <div className="truncate text-2xs text-ink-muted">{sub}</div>}
    </div>
  );
}

function AlertRow({ tone, icon, children }: { tone: "danger" | "warn"; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm font-bold",
      tone === "danger" ? "border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200"
        : "border-warn-200 bg-warn-50 text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200")}>
      <span className="mt-0.5 shrink-0">{icon}</span><span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card p-6 text-center text-sm text-ink-muted">{text}</div>;
}

/* ── الخطّ الزمنيّ: كلُّ ما صار بعمره، الأحدثُ أوّلاً ───────────────────────── */
function Timeline({ b, today, houseName }: { b: FlockBundle; today: string; houseName: (id: string | null) => string }) {
  const { t } = useTranslation();
  const c = b.case;
  type Ev = { day: string; at: string; icon: ReactNode; text: string; sub?: string };
  const ev: Ev[] = [];
  ev.push({ day: c.placed_on, at: `${c.placed_on}T00`, icon: <ClipboardList size={15} />, text: t("flk.tl.placed", { n: formatNum(c.placed_count) }) });
  for (const v of b.visits) {
    const necro = b.necropsy.filter((n) => n.visit_id === v.id).length;
    ev.push({
      day: localDay(v.at), at: v.at, icon: <Stethoscope size={15} />,
      text: t("flk.tl.visit", { kind: t(`flk.visitKind.${v.kind}`) }) + (v.dx ? ` · ${v.dx}` : ""),
      sub: [necro ? t("flk.tl.necropsy", { n: necro }) : "", v.trend ? t(`flk.trend.${v.trend}`) : ""].filter(Boolean).join(" · ") || undefined,
    });
  }
  for (const m of b.mortality) {
    ev.push({
      day: m.on_date, at: `${m.on_date}T12${m.created_at}`, icon: <Skull size={15} />,
      text: t("flk.tl.mortality", { dead: formatNum(m.dead), culled: formatNum(m.culled) }),
      sub: [b.houses.length > 1 ? houseName(m.house_id) : "", m.days > 1 ? t("flk.mort.overDays", { n: m.days }) : "", m.note ?? ""].filter(Boolean).join(" · ") || undefined,
    });
  }
  for (const v of b.vax) {
    if (v.status === "given" && v.given_on) ev.push({ day: v.given_on, at: `${v.given_on}T13`, icon: <Syringe size={15} />, text: t("flk.tl.vaxGiven", { vaccine: v.vaccine, route: t(`flk.route.${v.route}`) }), sub: v.given_by ? t(`flk.givenBy.${v.given_by}`) : undefined });
    if (v.status === "skipped") ev.push({ day: localDay(v.updated_at), at: v.updated_at, icon: <Syringe size={15} />, text: t("flk.tl.vaxSkipped", { vaccine: v.vaccine }), sub: v.skip_reason ?? undefined });
  }
  for (const x of b.treatments) {
    if (x.status === "replaced") continue;
    ev.push({ day: x.start_on, at: `${x.start_on}T14`, icon: <Pill size={15} />, text: t("flk.tl.tx", { title: x.title || t("flk.tx.untitled"), n: x.lines.length }), sub: x.version > 1 ? t("flk.tx.version", { n: x.version }) : undefined });
    if (x.status === "stopped" && x.stopped_on) ev.push({ day: x.stopped_on, at: `${x.stopped_on}T15`, icon: <Pill size={15} />, text: t("flk.tl.txStopped", { title: x.title || t("flk.tx.untitled") }) });
  }
  if (b.media.length) {
    const byDay = new Map<string, number>();
    for (const m of b.media) { const day = localDay(m.created_at); byDay.set(day, (byDay.get(day) ?? 0) + 1); }
    for (const [day, n] of byDay) ev.push({ day, at: `${day}T16`, icon: <Camera size={15} />, text: t("flk.tl.photos", { n }) });
  }
  if (c.status === "closed" && c.closed_on) ev.push({ day: c.closed_on, at: `${c.closed_on}T23`, icon: <Lock size={15} />, text: t("flk.tl.closed", { reason: c.close_reason ? t(`flk.close.reason.${c.close_reason}`) : "—" }) });
  ev.sort((x, y) => y.day.localeCompare(x.day) || y.at.localeCompare(x.at));
  return (
    <ol className="space-y-2" data-flock-timeline>
      {ev.map((e, i) => (
        <li key={i} className="card flex items-start gap-3 p-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand-600 dark:text-brand-300">{e.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">{e.text}</div>
            {e.sub && <div className="text-xs text-ink-muted">{e.sub}</div>}
          </div>
          <div className="shrink-0 text-end text-2xs text-ink-subtle">
            <div className="font-bold">{dayLabel(e.day, today)}</div>
            <div>{t("flk.ageShort", { age: ageOn(c.placed_on, e.day) })}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── النافق: أعمدةُ آخر أسبوعين بالعتبة، وصفوفُه بالقاعة ───────────────────────── */
function MortalityTab({ b, today, houseName, canEdit, onEdit, onDeleted }: {
  b: FlockBundle; today: string; houseName: (id: string | null) => string; canEdit: boolean;
  onEdit: (row: FlockMortality) => void; onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [confirm, setConfirm] = useState<FlockMortality | null>(null);
  const [busy, setBusy] = useState(false);
  const s = b.stats;
  // يومٌ بيوم للوجبة كلّها: مجموعُ القاعات ÷ حيِّ بدايتها — آخرُ ١٤ يوماً حتى اليوم المرجع.
  const days = useMemo(() => {
    const per = new Map<string, { loss: number; alive: number }>();
    for (const d of dailyLosses(b.case, b.houses, b.mortality)) {
      const cur = per.get(d.day) ?? { loss: 0, alive: 0 };
      cur.loss += d.loss; cur.alive += d.alive_start;
      per.set(d.day, cur);
    }
    const ref = s.ref_on;
    const out: { day: string; pct: number | null; loss: number | null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = addDays(ref, -i);
      if (day < b.case.placed_on) continue;
      const v = per.get(day);
      out.push({ day, loss: v ? v.loss : null, pct: v && v.alive > 0 ? (v.loss * 100) / v.alive : null });
    }
    return out;
  }, [b, s.ref_on]);
  const max = Math.max(FLOCK_ALERT_PCT * 2, ...days.map((d) => d.pct ?? 0));
  const rows = [...b.mortality].sort((x, y) => y.on_date.localeCompare(x.on_date) || y.created_at.localeCompare(x.created_at));
  return (
    <div className="space-y-3" data-flock-mortality>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label={t("flk.mort.dead")} value={formatNum(s.dead)} />
        <MiniStat label={t("flk.mort.culled")} value={formatNum(s.culled)} />
        <MiniStat label={t("flk.mort.cum")} value={`${num(s.cum_pct)}%`} />
        <MiniStat label={t("flk.mort.week1")} value={s.week1_recorded ? `${num(s.week1_pct)}%` : "—"} sub={s.week1_done ? undefined : t("flk.mort.week1Running")} />
      </div>
      {days.length > 0 && (
        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span className="font-bold">{t("flk.mort.daily")}</span>
            <span>{t("flk.mort.threshold", { pct: FLOCK_ALERT_PCT })}</span>
          </div>
          <div className="relative flex h-28 items-end gap-1">
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-danger-500" style={{ bottom: `${(FLOCK_ALERT_PCT / max) * 100}%` }} />
            {days.map((d) => (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${dayLabel(d.day)} · ${d.pct == null ? "—" : `${num(d.pct, 3)}%`}`}>
                {d.pct == null ? (
                  <div className="w-full rounded-sm border border-dashed border-line" style={{ height: "4px" }} />
                ) : (
                  <div className={cn("w-full rounded-sm", d.pct >= FLOCK_ALERT_PCT ? "bg-danger-500" : "bg-brand-500")} style={{ height: `${Math.max(3, (d.pct / max) * 100)}%` }} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-2xs text-ink-subtle">
            <span>{dayLabel(days[0].day)}</span><span>{dayLabel(days[days.length - 1].day)}</span>
          </div>
          <p className="mt-2 text-2xs text-ink-subtle">{t("flk.mort.unknownDays")}</p>
        </div>
      )}
      {rows.length === 0 ? <Empty text={t("flk.mort.none")} /> : (
        <div className="card divide-y divide-line">
          {rows.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3" data-flock-mrow={m.id}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">{t("flk.tl.mortality", { dead: formatNum(m.dead), culled: formatNum(m.culled) })}</div>
                <div className="text-xs text-ink-muted">
                  {[dayLabel(m.on_date, today), t("flk.ageShort", { age: ageOn(b.case.placed_on, m.on_date) }), b.houses.length > 1 ? houseName(m.house_id) : "",
                    m.days > 1 ? t("flk.mort.overDays", { n: m.days }) : "", t(`flk.mort.src.${m.source}`), m.note ?? ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              {canEdit && m.source !== "visit" && (
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label={t("flk.edit")} onClick={() => onEdit(m)}><Pencil size={15} /></button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-danger-600" aria-label={t("flk.delete")} onClick={() => setConfirm(m)}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {confirm && (
        <Dialog open onClose={() => setConfirm(null)} title={t("flk.mort.deleteTitle")} size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t("flk.cancel")}</Button>
            <Button variant="danger" loading={busy} onClick={async () => {
              setBusy(true);
              try { await flockApi.deleteMortality(confirm.id); setConfirm(null); onDeleted(); }
              catch (e) { toast.error(flockError(e, t)); }
              finally { setBusy(false); }
            }} data-flock-confirm-delete>{t("flk.delete")}</Button>
          </>}>
          <p className="text-sm text-ink">{t("flk.mort.deleteBody", { dead: confirm.dead, culled: confirm.culled, day: dayLabel(confirm.on_date) })}</p>
        </Dialog>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-2xs font-bold text-ink-subtle">{label}</div>
      <div className="text-lg font-extrabold tabular-nums text-ink">{value}</div>
      {sub && <div className="text-2xs text-ink-muted">{sub}</div>}
    </div>
  );
}

/* ── الزيارات ────────────────────────────────────────────────────────────── */
function VisitsTab({ b, today, onOpen }: { b: FlockBundle; today: string; onOpen: (v: FlockVisit) => void }) {
  const { t } = useTranslation();
  const visits = [...b.visits].sort((x, y) => y.at.localeCompare(x.at));
  if (!visits.length) return <Empty text={t("flk.visits.none")} />;
  return (
    <div className="space-y-2" data-flock-visits>
      {visits.map((v) => {
        const necro = b.necropsy.filter((n) => n.visit_id === v.id).length;
        return (
          <button key={v.id} type="button" onClick={() => onOpen(v)} data-flock-visit={v.id}
            className="card flex w-full items-start gap-3 p-3 text-start transition hover:shadow-raised">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-brand-600 dark:text-brand-300"><Stethoscope size={16} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-ink">
                {t(`flk.visitKind.${v.kind}`)}{v.quick && <Badge tone="neutral" className="px-2 py-0 text-2xs">{t("flk.visits.quick")}</Badge>}
                {v.notifiable && <Badge tone="danger" className="px-2 py-0 text-2xs">{t("flk.visits.notifiable")}</Badge>}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {[v.dx, necro ? t("flk.tl.necropsy", { n: necro }) : "", v.trend ? t(`flk.trend.${v.trend}`) : ""].filter(Boolean).join(" · ") || t("flk.visits.noDx")}
              </div>
            </div>
            <div className="shrink-0 text-end text-2xs text-ink-subtle">
              <div className="font-bold">{dayLabel(localDay(v.at), today)}</div>
              <div>{t("flk.ageShort", { age: ageOn(b.case.placed_on, localDay(v.at)) })}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── التحصين: البرنامجُ على خطّ الأعمار — مخطَّط · اليوم · منجَز · متروك ───────────── */
function VaxTab({ b, today, canEdit, canPrograms, onAct, onPrograms, onDeleted }: {
  b: FlockBundle; today: string; canEdit: boolean; canPrograms: boolean;
  onAct: (v: FlockVax | undefined, mode: VaxMode) => void; onPrograms: () => void; onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<FlockVax | null>(null);
  const list = [...b.vax].sort((x, y) => (x.planned_age ?? 999) - (y.planned_age ?? 999) || (x.given_on ?? "").localeCompare(y.given_on ?? ""));
  return (
    <div className="space-y-3" data-flock-vax>
      <div className="flex flex-wrap gap-2">
        {canEdit && <Button variant="secondary" leftIcon={<Syringe size={16} />} onClick={() => onAct(undefined, "new")}>{t("flk.vax.add")}</Button>}
        {canPrograms && <Button variant="outline" onClick={onPrograms} data-flock-programs>{t("flk.vax.programs")}</Button>}
      </div>
      {list.length === 0 ? <Empty text={t("flk.vax.none")} /> : (
        <div className="card divide-y divide-line">
          {list.map((v) => {
            const due = v.planned_age != null ? dueOn(b.case.placed_on, v.planned_age) : null;
            const late = v.status === "planned" && due != null && due < today;
            return (
              <div key={v.id} className="flex items-start gap-3 p-3" data-flock-vrow={v.id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
                    {v.vaccine}
                    <Badge tone={v.status === "given" ? "success" : v.status === "skipped" ? "neutral" : late ? "danger" : "warn"} className="px-2 py-0 text-2xs">
                      {v.status === "planned" && late ? t("flk.vax.late") : t(`flk.vax.status.${v.status}`)}
                    </Badge>
                  </div>
                  <div className="text-xs text-ink-muted">
                    {[v.disease, t(`flk.route.${v.route}`),
                      v.status === "given" && v.given_on ? `${dayLabel(v.given_on, today)} · ${t("flk.ageShort", { age: ageOn(b.case.placed_on, v.given_on) })}` : "",
                      v.status === "given" && v.given_by ? t(`flk.givenBy.${v.given_by}`) : "",
                      v.status === "planned" && due ? `${t("flk.ageShort", { age: v.planned_age })} · ${dayLabel(due, today)} (${relDay(t, due, today)})` : "",
                      v.batch_no ? t("flk.vax.batchN", { no: v.batch_no }) : "",
                      v.status === "skipped" ? v.skip_reason ?? "" : ""].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {v.status === "planned" && <Button size="sm" variant="secondary" onClick={() => onAct(v, "give")} data-flock-vax-give>{t("flk.vax.give")}</Button>}
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label={t("flk.edit")} onClick={() => onAct(v, v.status === "planned" ? "edit" : v.status === "given" ? "give" : "skip")}><Pencil size={15} /></button>
                    {v.status !== "given" && (
                      <button type="button" disabled={busy === v.id} className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-danger-600" aria-label={t("flk.delete")}
                        onClick={() => setConfirm(v)} data-flock-vax-del={v.id}><Trash2 size={15} /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirm && (
        <Dialog open onClose={() => setConfirm(null)} size="sm" title={t("flk.vax.deleteTitle")}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t("flk.cancel")}</Button>
            <Button variant="danger" loading={busy === confirm.id} onClick={async () => {
              setBusy(confirm.id);
              try { await flockApi.deleteVax(confirm.id); setConfirm(null); onDeleted(); } catch (e) { toast.error(flockError(e, t)); } finally { setBusy(null); }
            }} data-flock-confirm-delete>{t("flk.delete")}</Button>
          </>}>
          <p className="text-sm text-ink">{t(confirm.status === "skipped" ? "flk.vax.deleteSkipped" : "flk.vax.deleteBody", { vaccine: confirm.vaccine, reason: confirm.skip_reason ?? "" })}</p>
        </Dialog>
      )}
    </div>
  );
}

/* ── العلف: من لقطة القطيع بالزيارات ─────────────────────────────────────────── */
function FeedTab({ b, today }: { b: FlockBundle; today: string }) {
  const { t } = useTranslation();
  const rows = [...b.visits].filter((v) => v.flock && (v.flock.feed_phase || v.flock.feed_source || v.flock.feed_kg_day != null || v.flock.water_l_day != null || v.flock.avg_weight_g != null))
    .sort((x, y) => y.at.localeCompare(x.at));
  if (!rows.length) return <Empty text={t("flk.feed.none")} />;
  return (
    <div className="card overflow-x-auto" data-flock-feed>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-start text-2xs text-ink-subtle">
          <th className="p-2 text-start">{t("flk.feed.day")}</th><th className="p-2 text-start">{t("flk.feed.phase")}</th>
          <th className="p-2 text-start">{t("flk.feed.source")}</th><th className="p-2">{t("flk.feed.kg")}</th>
          <th className="p-2">{t("flk.feed.water")}</th><th className="p-2">{t("flk.feed.weight")}</th>
        </tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b border-line last:border-0">
              <td className="p-2 text-xs"><div className="font-bold">{dayLabel(localDay(v.at), today)}</div><div className="text-ink-subtle">{t("flk.ageShort", { age: ageOn(b.case.placed_on, localDay(v.at)) })}</div></td>
              <td className="p-2">{v.flock.feed_phase ? t(`flk.feedPhase.${v.flock.feed_phase}`) : "—"}</td>
              <td className="p-2">{v.flock.feed_source || "—"}</td>
              <td className="p-2 text-center tabular-nums">{num(v.flock.feed_kg_day)}</td>
              <td className="p-2 text-center tabular-nums">{num(v.flock.water_l_day)}</td>
              <td className="p-2 text-center tabular-nums">{v.flock.avg_weight_g != null ? `${formatNum(v.flock.avg_weight_g)}${v.flock.sample_n ? ` (${v.flock.sample_n})` : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── المرفقات: صورُ الوجبة بروابطَ موقّعة، والإضافةُ بزرّين (صوّر / من الجهاز) ──────── */
function MediaTab({ b, canAdd, canRemove, onChanged }: { b: FlockBundle; canAdd: boolean; canRemove: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [urlErr, setUrlErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<FlockMedia | null>(null);
  const [tick, setTick] = useState(0);
  const paths = b.media.map((m) => m.path).join("|");
  useEffect(() => {
    let live = true;
    setUrlErr(false);
    flockApi.photoUrls(b.media.map((m) => m.path)).then((u) => { if (live) setUrls(u); }).catch(() => { if (live) setUrlErr(true); });
    return () => { live = false; };
  }, [paths]); // المساراتُ نصّاً: حزمةٌ جديدة بالصور نفسِها لا تعيد التوقيع
  const add = async (f: File) => {
    setBusy(true);
    try {
      const p = await prepareUpload(f, { maxDim: 1600 });
      await flockApi.uploadPhoto({ case_id: b.case.id, blob: p.blob, dataUrl: p.dataUrl, ext: p.ext, contentType: p.contentType });
      onChanged();
    } catch (e) {
      toast.error((e as { code?: string })?.code ? flockError(e, t) : describeUploadError(e, t));
    } finally { setBusy(false); }
  };
  const media = [...b.media].sort((x, y) => y.created_at.localeCompare(x.created_at));
  return (
    <div className="space-y-3" data-flock-media>
      {canAdd && (
        <LoadBoundary scope="flock-photo" onRetry={() => { PhotoSourceLazy = loadPhotoSource(); setTick((n) => n + 1); }}>
          <Suspense fallback={null}>
            <PhotoSourceLazy key={tick} onFile={(f: File) => void add(f)} busy={busy} />
          </Suspense>
        </LoadBoundary>
      )}
      {urlErr && <p className="text-xs text-danger-600">{t("flk.media.urlFail")}</p>}
      {media.length === 0 ? <Empty text={t("flk.media.none")} /> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) => (
            <button key={m.id} type="button" onClick={() => setView(m)} className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-surface-2" data-flock-photo={m.id}>
              {urls[m.path] ? <img src={urls[m.path]} alt={m.caption ?? ""} className="h-full w-full object-cover" loading="lazy" /> : <Camera size={20} className="text-ink-subtle" />}
              {m.bird_no != null && <span className="absolute bottom-1 start-1 rounded-md bg-ink/70 px-1.5 text-2xs font-bold text-white">{t("flk.media.bird", { n: m.bird_no })}</span>}
            </button>
          ))}
        </div>
      )}
      {view && (
        <Dialog open onClose={() => setView(null)} size="lg" title={view.caption || dayLabel(localDay(view.created_at))}
          footer={canRemove ? (
            <Button variant="danger" leftIcon={<Trash2 size={16} />} onClick={async () => {
              try { await flockApi.removeMedia(view.id); setView(null); onChanged(); } catch (e) { toast.error(flockError(e, t)); }
            }}>{t("flk.delete")}</Button>
          ) : undefined}>
          {urls[view.path] ? <img src={urls[view.path]} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" /> : <p className="text-sm text-ink-muted">{t("flk.media.urlFail")}</p>}
        </Dialog>
      )}
    </div>
  );
}
