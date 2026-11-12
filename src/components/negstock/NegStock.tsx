/* ============================================================================
 * البيعُ قبل الجرد (0266) — مالكُ النطاق `nstk`: كلُّ نصٍّ للوضع هنا، وكلُّ شاشةٍ تحمّل ما ترسمه بـ
 * `page(() => import("@/components/negstock/NegStock").then(…), ["nstk"])` — لا استيرادَ ثابتاً ولا نوعاً (النصفُ البارد ممتلئ،
 * والإقلاعُ يدفع سطرَ النطاق وحده).
 *
 *  ١) NegStockCard — بطاقةُ الإعدادات: الحالة، وما بقي (بلا سعر شراء، ما انعدّ، تحت الصفر، معلَّق)، والمدّةُ بليلتها، والإقرار،
 *     والتشغيلُ والتمديدُ والإطفاء (بلوحةٍ تقول ما بقي — لا window.confirm)، والسجلّ، والخطوات. للمدير من حسابه وحده
 *     (ownerAccountFrom) — والخادمُ يحكم بالدور الأساس والعيادةِ التي تراها البطاقة.
 *  ٢) NegBar — شريحةُ الكاشير بجانب «راجع» (بلون العلامة لا الكهرمانيّ: الكهرمانيُّ و«بالسالب» معناهما وضعُ الراجع هنا)،
 *     ورسالةٌ مرّةً عند كلّ انتقال (انفتح/انتهى)، ونصوصُ الرفض من شاشة البيع (`say`) — الشاشةُ لا تحمل نصوصَ النطاق.
 *  ٣) NegCheckoutDialog — قبل البيعة: سطورٌ رفعها الوضعُ والخادمُ لا يقبلها الآن، بسببها، و«شيلها وكمّل».
 * ========================================================================= */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, History, Info, Loader2, RotateCcw } from "lucide-react";
import { Button, Dialog, useToast } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { ownerAccountFrom, useOverride } from "@/lib/managerOverride";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatDate, formatQty } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { negApi } from "@/lib/negStockApi";
import { daysLeft, lastDayOf, type NegBarView, type NegRefusedLine, type NegReport, type NegSay, type NegSetResult } from "@/lib/negStock";

/** رصيدٌ بإشارته داخل جملةٍ عربية: معزولٌ باتّجاهه (LRI…PDI) — «-3» بعد كلمةٍ عربية كانت ترسم الإشارةَ على الطرف الآخر («3-»). */
const signedQty = (n: number): string => `\u2066${formatQty(n)}\u2069`;

/* ── نصوصُ الرفض ─────────────────────────────────────────────────────────────────────────────────────── */
/** رفضُ الخادم برمزه (neg_stock_*) — بنصّ النطاق؛ وغيرُه كما تقوله الأخطاءُ العامّة. */
export function negErrorText(e: unknown, t: TFunction): string {
  const code = e instanceof Error ? e.message : "";
  if (/^neg_stock_\w+$/.test(code)) return t(`nstk.set.err.${code}`, { defaultValue: describeDbError(e, t) });
  return describeDbError(e, t);
}

/** يومٌ للعرض بتاريخ الجهاز (الليلةُ نفسُها: الثالثة فجراً بعده). */
const dayText = (d: Date | string | null | undefined, lang: string): string => (d ? formatDate(d instanceof Date ? d.toISOString() : d, lang) : "");
/** آخرُ يومٍ لو شُغّل الآن d يوماً — كالخادم: اليومُ + d (الليلةُ بعده). */
function lastDayFor(d: number): Date {
  const x = new Date();
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() + d);
  return x;
}
/** نهايتُه لحظةً (الثالثة فجراً بعد آخر يوم) — للمقارنة بالنهاية القائمة وبالسقف. */
function endFor(d: number): number {
  const x = lastDayFor(d);
  x.setDate(x.getDate() + 1);
  x.setHours(3, 0, 0, 0);
  return x.getTime();
}
const DURATIONS = [7, 14, 30] as const;

/* ══ ١) بطاقةُ الإعدادات ══════════════════════════════════════════════════════════════════════════════ */
export function NegStockCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { baseRole } = usePermissions();
  const ov = useOverride();
  const [rep, setRep] = useState<NegReport | null | "failed">(null);
  const [days, setDays] = useState<number>(7);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [offAsk, setOffAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(() => {
    setRep(null);
    negApi.report().then((r) => { if (alive.current) setRep(r); }, () => { if (alive.current) setRep("failed"); });
  }, []);
  useEffect(load, [load]);

  if (rep && rep !== "failed" && rep.absent) return null;   // الهجرةُ ما نزلت بعد — الميزةُ غائبة لا «تعذّر»
  if (rep === "failed") {
    return (
      <div className="card mb-4 flex items-center gap-3 p-5" data-neg-card>
        <p className="flex-1 text-sm text-ink-subtle">{t("nstk.set.loadFailed")}</p>
        <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={load}>{t("nstk.set.retry")}</Button>
      </div>
    );
  }
  if (!rep) return <div className="card mb-4 grid place-items-center p-6 text-ink-subtle" data-neg-card><Loader2 size={16} className="animate-spin" /></div>;

  const lang = i18n.language;
  const canAct = rep.operator || ownerAccountFrom(ov.deviceLocked, ov.active, baseRole === "manager");
  const on = rep.active;
  const left = on ? daysLeft(rep, performance.now()) : 0;
  const lastNight = on && left <= 1;
  const capMs = rep.capUntil ? Date.parse(rep.capUntil) : Infinity;
  const curEnd = on && rep.until ? Date.parse(rep.until) : 0;
  const overCap = (d: number) => !rep.operator && endFor(d) > capMs;
  const grows = (d: number) => !on || endFor(d) > curEnd;
  const pick = DURATIONS.includes(days as 7 | 14 | 30) ? days : 7;
  const pickOk = grows(pick) && !overCap(pick);
  const needNote = rep.operator && !note.trim();

  /* الرسالةُ مما فعله الخادم (changed/action) لا من الضغطة ولا من تقريرٍ فُتح قبلها: تمديدٌ لا يُطيل (مديرٌ ثانٍ مدّده أبعد) وإطفاءُ ما
   * انطفى أصلاً لا يكتبان سطراً — «تمدّد لحد…» كانت تُقال لهما بنغمة نجاح، ومقارنةٌ بتقرير البطاقة القديم لا ترى الأوّل. */
  const run = async (f: () => Promise<NegSetResult>, said: (s: NegSetResult) => { text: string; changed: boolean }) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const m = said(await f());
      if (m.changed) { playSuccess(); toast.success(m.text); }
      else { playTap(); toast.toast({ tone: "info", title: m.text }); }
      setAck(false); setNote(""); setOffAsk(false);
      load();
    } catch (e) {
      playWarning();
      const m = negErrorText(e, t);
      setErr(m);
      toast.error(m);
    } finally { setBusy(false); }
  };
  const turnOn = () => run(() => negApi.set(rep.clinic ?? "", true, pick, ack, note.trim() || null), (s) => {
    const day = dayText(s.until ? lastDayOf(s.until) : null, lang);
    if (!s.changed) return { text: t("nstk.set.unchanged", { day }), changed: false };
    return { text: t(s.action === "extend" ? "nstk.set.extended" : "nstk.set.turnedOn", { day }), changed: true };
  });
  const turnOff = () => run(() => negApi.set(rep.clinic ?? "", false, null, false, note.trim() || null), (s) =>
    (s.changed ? { text: t("nstk.set.turnedOff"), changed: true } : { text: t("nstk.set.alreadyOff", { day: dayText(s.endedAt, lang) }), changed: false }));

  const stateLine = on
    ? (lastNight ? t("nstk.set.stateLast") : t("nstk.set.stateOn", { day: dayText(lastDayOf(rep.until as string), lang), n: left }))
    : rep.endedAt ? t("nstk.set.stateEnded", { day: dayText(rep.endedAt, lang) }) : t("nstk.set.stateOff");
  /* السجلّ: الأحدثُ أوّلاً، و«انتهى وحده» سطرٌ مشتقٌّ حين انتهت آخرُ فترةٍ بالوقت (الانتهاءُ لا يكتب شيئاً). */
  const expiredRow = !on && rep.log[0] && rep.log[0].action !== "off" && rep.until ? rep.until : null;

  return (
    <div className="card mb-4 p-5" data-neg-card>
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink"><ClipboardCheck size={18} className="text-brand-600" /> {t("nstk.set.title")}</h2>
      <p className="mb-3 text-xs leading-relaxed text-ink-subtle">{t("nstk.set.hint")}</p>
      <p data-neg-state={on ? "on" : rep.endedAt ? "ended" : "off"}
        className={cn("mb-3 rounded-xl px-3 py-2 text-sm font-bold", on ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "bg-surface-2 text-ink-muted")}>
        {stateLine}
      </p>

      <ul className="mb-4 space-y-1 text-xs font-semibold text-ink-muted" data-neg-preflight>
        {rep.zeroCost > 0 && (
          <li data-neg-zerocost className="text-danger-700 dark:text-danger-300">
            {t("nstk.set.zeroCost", { n: rep.zeroCost })} · <Link to="/inventory?filter=nocost" className="underline">{t("nstk.set.showNoCost")}</Link>
          </li>
        )}
        <li data-neg-uncounted>{t("nstk.set.neverCounted", { n: rep.neverCounted, z: rep.uncountedNonpos })}</li>
        {rep.negatives > 0 && <li data-neg-negatives>{t("nstk.set.negatives", { n: rep.negatives })}</li>}
        {rep.pending > 0 && (
          <li data-neg-pending>{t("nstk.set.pending", { n: rep.pending })} · <Link to="/inventory/count?tab=pending" className="underline">{t("nstk.set.goCount")}</Link></li>
        )}
      </ul>

      {!canAct ? (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-ink-muted" data-neg-manager-only><Info size={13} className="mt-0.5 shrink-0" /> {t("nstk.set.managerOnly")}</p>
      ) : offAsk ? (
        <div className="space-y-2 rounded-xl border border-line bg-surface-1 p-3" data-neg-offask>
          <p className="text-sm font-bold text-ink">{t("nstk.set.offTitle")}</p>
          {/* «كل المواد انعدّت» حين لا يبقى غيرُ معدودٍ وحده: موادُّ ما انعدّت ورصيدُها موجب تُرفض بالكاشير حين يخلص رصيدُها — تُقال هنا. */}
          <p className="text-xs text-ink-muted" data-neg-off-left>
            {rep.neverCounted === 0 ? t("nstk.set.offClean")
              : rep.uncountedNonpos === 0 ? t("nstk.set.offUncounted", { n: rep.neverCounted })
                : rep.uncountedNeg > 0 ? t("nstk.set.offLeft", { n: rep.uncountedNonpos, neg: rep.uncountedNeg })
                  : t("nstk.set.offLeftZero", { n: rep.uncountedNonpos })}
            {rep.pending > 0 && <> {t("nstk.set.offPending", { n: rep.pending })}</>}
          </p>
          <p className="text-xs font-semibold text-ink">{t("nstk.set.offSafe")}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/inventory/count" data-neg-keep-counting className="btn btn-primary h-9 px-3 text-xs">{t("nstk.set.keepCounting")}</Link>
            <Button size="sm" variant="secondary" loading={busy} data-neg-off-now onClick={() => void turnOff()}>{t("nstk.set.offNow")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} data-neg-off-back onClick={() => { playTap(); setOffAsk(false); }}>{t("nstk.set.offBack")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="label">{t("nstk.set.days")}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("nstk.set.days")}>
              {DURATIONS.map((d) => {
                const dis = !grows(d) || overCap(d);
                return (
                  <button key={d} type="button" data-neg-days={d} aria-pressed={pick === d} disabled={dis}
                    title={overCap(d) ? t("nstk.set.overCap", { day: dayText(rep.capUntil, lang) }) : t("nstk.set.until", { day: dayText(lastDayFor(d), lang) })}
                    onClick={() => { playTap(); setDays(d); }}
                    className={cn("h-9 rounded-full border px-3 text-xs font-bold transition disabled:opacity-40",
                      pick === d ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-1 text-ink-muted hover:text-ink")}>
                    {t(`nstk.set.d${d}`)}
                  </button>
                );
              })}
            </div>
            {overCap(pick) && <p className="mt-1 text-2xs font-semibold text-warn-700 dark:text-warn-300">{t("nstk.set.overCap", { day: dayText(rep.capUntil, lang) })}</p>}
          </div>
          <label className="flex items-start gap-2 text-xs font-semibold text-ink" data-neg-ack>
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              {t("nstk.set.ack", { day: dayText(lastDayFor(pick), lang) })}
              {rep.zeroCost > 0 && <> {t("nstk.set.ackNoCost", { n: rep.zeroCost })}</>}
            </span>
          </label>
          <input className="input" data-neg-note maxLength={200} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(rep.operator ? "nstk.set.notePhOp" : "nstk.set.notePh")} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-neg-on loading={busy} disabled={!ack || !pickOk || needNote} onClick={() => void turnOn()}>
              {t(on ? "nstk.set.extend" : "nstk.set.turnOn", { day: dayText(lastDayFor(pick), lang) })}
            </Button>
            {on && <Button size="sm" variant="secondary" data-neg-off onClick={() => { playTap(); setOffAsk(true); }}>{t("nstk.set.turnOff")}</Button>}
          </div>
        </div>
      )}
      {err && <p className="mt-2 rounded-lg bg-danger-50 p-2 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-neg-err>{err}</p>}

      <details className="mt-4 text-xs text-ink-muted" data-neg-steps>
        <summary className="cursor-pointer font-bold text-ink">{t("nstk.set.steps")}</summary>
        <ol className="mt-2 list-decimal space-y-1 ps-5">
          {[1, 2, 3, 4, 5, 6].map((i) => <li key={i}>{t(`nstk.set.step${i}`)}</li>)}
        </ol>
        <p className="mt-2">{t("nstk.set.lockReception")}</p>
        <p className="mt-1">{t("nstk.set.store")}</p>
      </details>

      {(rep.log.length > 0 || expiredRow) && (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><History size={13} /> {t("nstk.set.log")}</p>
          <ul className="divide-y divide-line rounded-xl border border-line text-xs" data-neg-log>
            {expiredRow && <li className="px-3 py-2 text-ink-subtle" data-neg-log-expired>{t("nstk.set.logExpired", { until: dayText(expiredRow, lang) })}</li>}
            {rep.log.map((r, i) => {
              const who = r.byName ?? t("nstk.set.who");
              const text = r.action === "off" ? t("nstk.set.logOff", { who, n: r.negatives ?? 0 })
                : t(r.action === "on" ? "nstk.set.logOn" : "nstk.set.logExtend", { who, until: dayText(r.until ? lastDayOf(r.until) : null, lang) });
              return (
                <li key={`${r.at}-${i}`} className="px-3 py-2" data-neg-log-row={r.action}>
                  <p className="font-semibold text-ink">{text}</p>
                  <p className="text-2xs text-ink-subtle">{dayText(r.at, lang)}{r.note ? ` · ${r.note}` : ""}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ══ ٢) شريحةُ الكاشير ونصوصُ الرفض ═════════════════════════════════════════════════════════════════════ */

export function NegBar({ view, say, onReady, compact }: {
  /** onReady: «وصلتُ» عند التركيب، وما يرجعه يُنادى عند الفكّ — الشاشةُ لا ترسل رسالةً لشريحةٍ راحت. */
  view: NegBarView; say: NegSay | null; onReady?: () => (() => void) | void; compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const lang = i18n.language;
  useEffect(() => onReady?.(), [onReady]);
  /* رسالةُ الانتقال مرّةً: أوّلُ جوابٍ أساسٌ صامت، وما بعده إن تبدّل يُقال. */
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view.active;
    if (p === null || p === view.active) return;
    if (view.active) toast.success(t("nstk.turnedOn", { day: dayText(view.until ? lastDayOf(view.until) : null, lang) }));
    else { playWarning(); toast.toast({ tone: "error", title: t("nstk.turnedOff") }); }
  }, [view.active, view.until, lang, t, toast]);
  const lastSay = useRef(0);
  useEffect(() => {
    if (!say || say.n === lastSay.current) return;
    lastSay.current = say.n;
    if (say.kind === "noCost") {
      toast.toast({ tone: "error", title: t("nstk.noCost", { name: say.name }),
        action: say.canOpen && say.productId ? { label: t("nstk.openProduct"), onClick: () => navigate(`/inventory?edit=${encodeURIComponent(say.productId as string)}`) } : undefined });
    } else if (say.kind === "counted") {
      toast.error(t("nstk.counted", { name: say.name, stock: signedQty(say.stock) }));
    } else if (say.kind === "unsure") {
      toast.error(t("nstk.unsure", { name: say.name }));
    } else {
      toast.error(t("nstk.ended", { name: say.name, stock: signedQty(say.stock) }));
    }
  }, [say, t, toast, navigate]);

  const recentEnd = !view.active && view.endedAt && Date.now() - Date.parse(view.endedAt) < 3 * 86_400_000;
  if (!view.active && !recentEnd) return null;
  const label = view.active
    ? (view.lastNight ? t("nstk.chipLast") : t("nstk.chip", { day: dayText(view.until ? lastDayOf(view.until) : null, lang) }))
    : t("nstk.chipEnded");
  return (
    <button type="button" data-neg-chip={view.active ? "on" : "ended"} title={label}
      onClick={() => { playTap(); if (view.active) toast.toast({ tone: "info", title: t("nstk.chipHelp", { day: dayText(view.until ? lastDayOf(view.until) : null, lang) }) }); }}
      className={cn("inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-2xs font-extrabold",
        view.active ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200"
          : "border-line bg-surface-2 text-ink-muted")}>
      <ClipboardCheck size={13} className="shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </button>
  );
}

/* ══ ٣) قبل البيعة: ما لا يُباع تحت الصفر الآن ═══════════════════════════════════════════════════════════════ */
export function NegCheckoutDialog({ open, lines, allCart, locked, onRemove, onRetry, onBack }: {
  /** locked: محاولةٌ سابقةٌ بمرجع هذه البيعة مجهولةُ المصير — لا «شيل وكمّل» يغيّر سلّتَها تحت مرجعها. */
  open: boolean; lines: NegRefusedLine[]; allCart: boolean; locked?: boolean; onRemove: () => void; onRetry: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const unsure = lines.some((l) => l.why === "unsure");
  const off = !unsure && lines.length > 0 && lines.every((l) => l.why === "off");
  return (
    <Dialog open={open} onClose={onBack} size="sm" title={t(off ? "nstk.chk.titleOff" : "nstk.chk.title")}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" data-neg-chk-back onClick={() => { playTap(); onBack(); }}>{t("nstk.chk.back")}</Button>
          {unsure && <Button variant="secondary" data-neg-chk-retry onClick={() => { playTap(); onRetry(); }}>{t("nstk.chk.retry")}</Button>}
          {/* يقصّ ويقف: المجموعُ الجديد يُرى قبل الإتمام (إكمالٌ بالرسمة نفسِها سجّل مجموعاً مثبَّتاً قديماً). */}
          {!unsure && !allCart && !locked && <Button variant="primary" data-neg-chk-remove onClick={() => { playTap(); onRemove(); toast.toast({ tone: "info", title: t("nstk.chk.removed") }); }}>{t("nstk.chk.remove")}</Button>}
        </div>
      }>
      <div className="space-y-2" data-neg-chk>
        <p className="text-sm text-ink-muted">{unsure ? t("nstk.chk.unsure") : t("nstk.chk.body")}</p>
        {!unsure && (
          <ul className="space-y-1.5">
            {lines.map((l) => (
              <li key={l.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-neg-chk-line={l.id}>
                <p className="font-bold text-ink">{l.name}</p>
                <p className="text-xs text-ink-muted">
                  {/* ما عادت بالمخزن (انحذفت أو اندمجت) بلا رصيد: «رصيده بالنظام 0» عن صفٍّ غائب كان يدعو لإدخاله من جديد. */}
                  {l.why === "gone" || l.stock == null ? t("nstk.chk.lineGone", { qty: formatQty(l.qty) }) : t("nstk.chk.line", { qty: formatQty(l.qty), stock: signedQty(l.stock) })} · {t(`nstk.chk.why.${l.why}`)}
                  {l.keep != null && <> · <span className="font-semibold text-ink" data-neg-chk-keep={l.keep}>{l.keep > 0 ? t("nstk.chk.keep", { n: formatQty(l.keep) }) : t("nstk.chk.drop")}</span></>}
                </p>
              </li>
            ))}
          </ul>
        )}
        {allCart && !unsure && !locked && <p className="text-xs font-semibold text-warn-700 dark:text-warn-300" data-neg-chk-allcart>{t(off ? "nstk.chk.allCartOff" : "nstk.chk.allCart")}</p>}
        {locked && <p className="text-xs font-semibold text-warn-700 dark:text-warn-300" data-neg-chk-locked>{t("nstk.chk.locked")}</p>}
      </div>
    </Dialog>
  );
}
