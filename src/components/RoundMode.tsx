import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, SkipForward, Play, ArrowRight, AlertTriangle, Info, Stethoscope } from "lucide-react";
import type { Pet, TreatmentEntry } from "@/types";
import { cn, formatNum, formatDec } from "@/lib/utils";
import { fmtClock } from "@/lib/clock";
import { PetAvatar } from "@/components/PetAvatar";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { TASK_META, typeOf, routeName, MISS_REASONS } from "@/lib/flowsheet";
import { buildRound, lateText, alertsFor, tally, type RoundStop, type RoundOutcome } from "@/lib/round";
import { scaleFor, tempRange, parseNum, classifyNum, type ObsScale, type ObsTone } from "@/lib/observations";

/* ============================================================================
 * RoundMode — الجولة: مهمّةٌ واحدة بملء الشاشة، ثم التي بعدها.
 *
 * الشبكة خريطةٌ تُقرأ، وهذه طريقٌ يُمشى. الطبيب هنا لا يبحث عن خانة: يقرأ
 * اسم الدواء بحجمٍ يُقرأ من بعيد، وجرعته وطريقه مكتوبين لا مقصوصين، وكم
 * تأخّرت بالحروف — ثم يضغط زرّاً واحداً بارتفاع ٦٢ بكسل.
 *
 * وثلاثة قرارات لا اثنان: **أُعطيت · فاتت · تخطّى**. و«تخطّى» ليست ترفاً —
 * الحيوان قد يكون بالتصوير الآن، فلا يصحّ أن تُجبر الطبيب على حكمٍ لا يملكه:
 * تُترك معلّقةً بالورقة كما هي، لا تُسجَّل ولا تُهمَل.
 * ==========================================================================*/

export function RoundMode({
  entries, petOf, cageOf, todayISO, nowHHMM, onGive, onValue, onMissed, onClose,
}: {
  entries: TreatmentEntry[];
  petOf: (petId: string) => Pet | undefined;
  cageOf: (petId: string) => string | null;
  todayISO: string;
  nowHHMM: string;
  onGive: (e: TreatmentEntry) => void;
  onValue: (e: TreatmentEntry, value: string) => void;
  onMissed: (e: TreatmentEntry, reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  /* المحطّات تُبنى **مرّةً عند البدء** ثم تُجمَّد.
   *
   * لو أُعيد بناؤها مع كل تسجيل لتقلّصت القائمة تحت إصبع الطبيب: يضغط
   * «أُعطيت» فتختفي المحطّة فتقفز التي بعدها مكانها — وتضيع «١ من ٨». */
  const [stops] = useState<RoundStop[]>(
    () => buildRound(entries, petOf, cageOf, todayISO, nowHHMM),
  );
  const [i, setI] = useState(0);
  const [out, setOut] = useState<(RoundOutcome | null)[]>(() => stops.map(() => null));
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);   // لوحة أسباب الفوات
  /** خرج الطبيب من سُلَّم الخيارات إلى الكتابة الحرّة — لهذه المحطّة وحدها. */
  const [free, setFree] = useState(false);
  const [started, setStarted] = useState(false);

  const done = i >= stops.length;
  const stop = done ? null : stops[i];
  const sum = tally(out);

  /* الخروج بمفتاح Esc — الجولة شاشةٌ كاملة، ولا يصحّ أن تحبس أحداً. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const advance = (r: RoundOutcome) => {
    setOut((cur) => cur.map((x, k) => (k === i ? r : x)));
    setDraft("");
    setAsking(false);
    setFree(false);
    setI((k) => k + 1);
  };

  if (!started) {
    const late = stops.filter((s) => s.lateMins > 0).length;
    return (
      <Shell onClose={onClose} tag="roundintro">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-[2rem] bg-brand-600 text-white shadow-soft">
            <Stethoscope size={44} />
          </span>
          <h2 className="font-display text-2xl font-extrabold text-ink">
            {stops.length ? t("round.ready", "جولة اليوم جاهزة") : t("round.nothing", "ما بقي شيء مستحقّ الآن")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {stops.length
              ? t("round.orderHint", "مرتّبة بترتيب مشيك بين الأقفاص")
              : t("round.nothingHint", "كل المستحقّ اليوم أُنجز — والقادم لم يحن بعد.")}
          </p>

          {stops.length > 0 && (
            <>
              <div className="mt-5 flex justify-center gap-2.5">
                <Tally n={late} label={t("round.late", "متأخّرة")} tone="danger" />
                <Tally n={stops.length - late} label={t("round.dueNow", "مستحقّة الآن")} tone="warn" />
                <Tally n={stops.length} label={t("round.total", "المجموع")} />
              </div>
              <button type="button" data-roundstart onClick={() => { playTap(); setStarted(true); }}
                className="btn btn-primary mx-auto mt-6 gap-2 px-8 text-base" style={{ minHeight: 56 }}>
                <Play size={18} /> {t("round.start", "ابدأ الجولة")}
              </button>
            </>
          )}
          {!stops.length && (
            <button type="button" onClick={onClose} className="btn btn-secondary mx-auto mt-6" style={{ minHeight: 48 }}>
              {t("round.back", "ارجع لورقة العلاج")}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell onClose={onClose} tag="roundsummary">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto mb-5 grid h-22 w-22 place-items-center rounded-[1.9rem] bg-success-600 text-white shadow-soft"
            style={{ width: 88, height: 88 }}>
            <Check size={42} strokeWidth={3} />
          </span>
          <h2 className="font-display text-2xl font-extrabold text-ink">{t("round.finished", "خلصت الجولة")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t("round.finishedHint", "كل شيء انسجّل بالورقة — تقدر تراجعه أو تتراجع عن أي واحد.")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Tally n={sum.given} label={t("round.oGiven", "أُعطيت")} tone="success" />
            <Tally n={sum.missed} label={t("round.oMissed", "فاتت")} tone="warn" />
            <Tally n={sum.skipped} label={t("round.oSkipped", "تخطّيت")} />
          </div>
          <button type="button" data-roundback onClick={onClose}
            className="btn btn-secondary mx-auto mt-6 gap-2" style={{ minHeight: 52 }}>
            <ArrowRight size={17} className="rtl:rotate-180" /> {t("round.back", "ارجع لورقة العلاج")}
          </button>
        </div>
      </Shell>
    );
  }

  const e = stop!.entry;
  const meta = TASK_META[typeOf(e)];
  const alerts = alertsFor(e, stop!.pet);
  const blocking = alerts.find((a) => a.blocking);
  const needsValue = meta.needsValue;
  /* المتابعة ذات السُلَّم: أزرارُ اختيارٍ تُسجِّل وتتقدّم بضغطةٍ واحدة —
   * أسرع حتى من الورقة، فاليد الثانية ممسكةٌ بالحيوان. */
  const scale = needsValue ? scaleFor(e) : null;

  return (
    <Shell onClose={onClose} tag="roundcard">
      <div className="mx-auto w-full max-w-lg">
        {/* التقدّم — «أين أنا من الجولة» بلا حساب */}
        <div className="mb-2 flex items-center gap-3">
          <span className="text-xs font-extrabold text-ink-muted">
            <b className="font-display text-lg text-ink">{formatNum(i + 1)}</b>
            {" "}{t("round.ofN", { n: formatNum(stops.length), defaultValue: "من {{n}}" })}
          </span>
        </div>
        <div className="mb-3.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${Math.round((i / stops.length) * 100)}%` }} />
        </div>

        <div data-roundstop={e.id} className="overflow-hidden rounded-3xl border border-line bg-surface-1 shadow-soft motion-safe:animate-scale-in">
          {/* مَن أمامك — الصورة والقفص قبل أي تفصيل */}
          <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
            {stop!.pet
              ? <PetAvatar pet={stop!.pet} size={52} className="shrink-0 rounded-2xl" />
              : <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-surface-3 text-2xl" style={{ width: 52, height: 52 }}>🐾</span>}
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold leading-tight text-ink" dir="auto">
                {stop!.pet?.name ?? "—"}
              </p>
              <p className="truncate text-2xs text-ink-subtle">
                {[stop!.pet?.current_weight_kg ? `${formatDec(stop!.pet.current_weight_kg)} ${t("flow.kg", "كغ")}` : null, stop!.pet?.breed]
                  .filter(Boolean).join(" · ")}
              </p>
            </div>
            {stop!.cage && (
              <span className="ms-auto shrink-0 rounded-xl bg-ink px-3 py-1.5 text-sm font-black text-surface-1">
                {stop!.cage}
              </span>
            )}
          </div>

          <div className="px-4 py-5">
            <span className={cn("mb-3.5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-black ring-1",
              stop!.lateMins > 0
                ? "bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-500/15 dark:text-danger-300 dark:ring-danger-500/30"
                : "bg-warn-50 text-warn-700 ring-warn-300 dark:bg-warn-500/15 dark:text-warn-300")}>
              <span className={cn("h-2 w-2 rounded-full", stop!.lateMins > 0 ? "bg-danger-500" : "bg-warn-500")} />
              {lateText(stop!.lateMins)}
              {e.time ? ` · ${t("round.dueAt", { at: fmtClock(e.time), defaultValue: "موعدها {{at}}" })}` : ""}
            </span>

            <h3 data-rounddrug className="font-display text-4xl font-extrabold leading-[1.15] tracking-tight text-ink" dir="auto">
              {e.medication || meta.ar()}
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              {e.amount && <Fact label={t("round.fDose", "الجرعة")} value={e.amount} />}
              {e.route && <Fact label={t("round.fRoute", "الطريق")} value={routeName(e.route)} />}
              {!e.amount && !e.route && <Fact label={t("round.fType", "النوع")} value={meta.ar()} />}
            </div>

            {alerts.map((a) => (
              <div key={a.id} className={cn("mt-3 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3",
                a.tone === "critical" ? "border-danger-300 bg-danger-50 dark:border-danger-500/40 dark:bg-danger-500/10"
                  : a.tone === "warn" ? "border-warn-300 bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10"
                    : "border-line bg-surface-2")}
                data-roundalert={a.tone}>
                {a.tone === "info"
                  ? <Info size={17} className="mt-0.5 shrink-0 text-ink-subtle" />
                  : <AlertTriangle size={17} className={cn("mt-0.5 shrink-0", a.tone === "critical" ? "text-danger-600" : "text-warn-600")} />}
                <div className="min-w-0">
                  <p className={cn("text-xs font-black",
                    a.tone === "critical" ? "text-danger-700 dark:text-danger-300"
                      : a.tone === "warn" ? "text-warn-700 dark:text-warn-300" : "text-ink-muted")}>{a.title}</p>
                  {a.detail && <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">{a.detail}</p>}
                </div>
              </div>
            ))}

            {/* المتابعة ذات السُلَّم: اختيارٌ يسجِّل ويتقدّم بضغطةٍ واحدة.
                وما لا سُلَّمَ له يبقى على لوحة الأرقام القديمة. */}
            {needsValue && !asking && scale && !free && (
              <RoundObs
                key={e.id}
                scale={scale}
                species={stop!.pet?.species}
                petId={e.pet_id}
                current={e.result}
                onPick={(v) => { onValue(e, v); playSuccess(); advance("given"); }}
                onFree={() => { playTap(); setFree(true); }}
              />
            )}

            {/* القياس يُكتب هنا — بلوحة أرقامٍ داخل البطاقة لا بكيبورد النظام */}
            {needsValue && !asking && (!scale || free) && (
              <div className="mt-4">
                <div data-roundreadout className={cn("mb-2.5 grid place-items-center rounded-2xl border-2 border-line-strong bg-surface-1 font-display text-3xl font-extrabold",
                  !draft && "text-base font-semibold text-ink-subtle")}
                  style={{ minHeight: 64 }}>
                  {draft || meta.valueHint?.() || t("round.typeValue", "اكتب القياس")}
                </div>
                <NumPad onKey={(k) => {
                  playTap();
                  if (k === "⌫") setDraft((d) => d.slice(0, -1));
                  else if (k === "." && draft.includes(".")) return;
                  else setDraft((d) => d + k);
                }} />
              </div>
            )}
          </div>

          {/* الأفعال — أو أسباب الفوات مكانها */}
          {asking ? (
            <div className="grid gap-2 px-4 pb-4">
              <p className="text-xs font-black text-ink">
                {t("round.whyMissed", { d: e.medication || meta.ar(), defaultValue: "ليش فاتت {{d}}؟" })}
              </p>
              {MISS_REASONS.map((r) => (
                <button key={r.id} type="button" data-roundreason={r.id}
                  onClick={() => { playTap(); onMissed(e, r.label()); advance("missed"); }}
                  className="rounded-xl bg-surface-2 px-4 text-start text-sm font-bold text-ink transition hover:bg-warn-50 hover:text-warn-700"
                  style={{ minHeight: 52 }}>
                  {r.label()}
                </button>
              ))}
              <button type="button" onClick={() => { playTap(); setAsking(false); }}
                className="text-2xs font-bold text-ink-subtle transition hover:text-ink" style={{ minHeight: 44 }}>
                {t("round.backToCard", "رجوع")}
              </button>
            </div>
          ) : (
            <div className="grid gap-2 px-4 pb-4">
              {/* المهمّة ذات السُلَّم أزرارُها **هي** الفعل — زرٌّ أخضر إضافي
                  تحتها كان سيسأل «سجّل ماذا؟» بلا جواب. */}
              {(!scale || free) && <button type="button" data-roundgive
                disabled={(needsValue && !draft.trim()) || !!blocking}
                onClick={() => {
                  if (needsValue) { onValue(e, draft.trim()); } else { onGive(e); }
                  playSuccess();
                  advance("given");
                }}
                className="flex items-center justify-center gap-2.5 rounded-2xl bg-success-600 text-lg font-black text-white shadow-soft transition hover:bg-success-700 active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                style={{ minHeight: 62 }}>
                <Check size={22} strokeWidth={3} />
                {blocking
                  ? t("round.blocked", "ممنوع — راجع التنبيه")
                  : needsValue
                    ? (draft.trim() ? t("round.saveValue", { v: draft.trim(), defaultValue: "سجّل {{v}}" }) : t("round.typeFirst", "اكتب القياس أولاً"))
                    : t("round.give", "أُعطيت")}
              </button>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" data-roundmiss onClick={() => { playWarning(); setAsking(true); }}
                  className="rounded-xl border border-line bg-surface-2 text-sm font-bold text-ink-muted transition hover:border-warn-300 hover:bg-warn-50 hover:text-warn-700"
                  style={{ minHeight: 50 }}>
                  {t("round.miss", "فاتت")}
                </button>
                <button type="button" data-roundskip onClick={() => { playTap(); advance("skipped"); }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-sm font-bold text-ink-muted transition hover:bg-surface-3 hover:text-ink"
                  style={{ minHeight: 50 }}>
                  <SkipForward size={15} /> {t("round.skip", "تخطّى")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* نقاط الجولة — أخضر أُعطيت · أصفر فاتت · رمادي تخطّيت */}
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {stops.map((s, k) => (
            <span key={s.entry.id}
              className={cn("h-2 w-2 rounded-full transition",
                k === i ? "scale-150 bg-brand-600"
                  : out[k] === "given" ? "bg-success-500"
                    : out[k] === "missed" ? "bg-warn-500"
                      : out[k] === "skipped" ? "bg-ink-subtle" : "bg-line-strong")} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── قطع ────────────────────────────────────────────────────────────────── */

/** غلافُ شاشةٍ كاملة — الجولة تحتاج الشاشة كلها، ولا شيء يزاحمها. */
function Shell({ children, onClose, tag }: { children: React.ReactNode; onClose: () => void; tag: string }) {
  const { t } = useTranslation();
  const props = { [`data-${tag}`]: "" };
  return (
    <div {...props} className="fixed inset-0 z-50 overflow-y-auto bg-surface p-4 pt-5 sm:p-6">
      <div className="mx-auto flex max-w-lg justify-end">
        <button type="button" data-roundclose onClick={onClose} aria-label={t("round.exit", "اخرج من الجولة")}
          className="grid place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
          style={{ width: 44, height: 44 }}>
          <X size={19} />
        </button>
      </div>
      <div className="grid min-h-[70vh] place-items-center">{children}</div>
    </div>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone?: "danger" | "warn" | "success" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 px-5 py-2.5" style={{ minWidth: 96 }}>
      <b className={cn("block font-display text-2xl font-extrabold leading-tight tabular-nums",
        tone === "danger" ? "text-danger-600" : tone === "warn" ? "text-warn-700" : tone === "success" ? "text-success-600" : "text-ink")}>
        {formatNum(n)}
      </b>
      <span className="text-2xs text-ink-subtle">{label}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl bg-surface-2 px-3.5 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</span>
      <span className="block text-base font-bold text-ink" dir="auto">{value}</span>
    </span>
  );
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"];

function NumPad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div data-roundpad className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button key={k} type="button" data-roundkey={k} onClick={() => onKey(k)}
          className={cn("grid place-items-center rounded-xl font-mono text-xl font-black transition active:scale-95",
            k === "⌫" ? "bg-surface-3 text-ink-muted hover:bg-danger-50 hover:text-danger-600" : "bg-surface-2 text-ink hover:bg-surface-3")}
          style={{ minHeight: 58 }}>
          {k}
        </button>
      ))}
    </div>
  );
}

/* ── متابعةٌ بسُلَّم — داخل بطاقة الجولة ─────────────────────────────────── */

/** نقطة الدرجة — لغةُ اللون نفسها بالورقة والجولة واليومية. */
const OBS_DOT: Record<ObsTone, string> = {
  good: "bg-success-500",
  mid: "bg-warn-500",
  low: "bg-orange-500",
  crit: "bg-danger-500",
  none: "bg-line-strong",
};

/**
 * أزرار الاختيار المعياري داخل البطاقة: الضغطة تسجِّل وتتقدّم للمحطّة
 * التالية — لا زرَّ تأكيدٍ بعدها، فاليد الثانية ممسكةٌ بالحيوان.
 * والحرارة تجمع الخيارين: كلمةً بضغطة، أو رقماً بشرائحَ جاهزةٍ تُضبط
 * بـ±٠٫١ وتتلوّن لحظياً على مدى هذا النوع وهذا الحيوان.
 */
function RoundObs({ scale, species, petId, current, onPick, onFree }: {
  scale: ObsScale;
  species?: Pet["species"];
  petId: string;
  current?: string | null;
  onPick: (v: string) => void;
  /** بابُ الكتابة الحرّة — «45 مل» ليست أحد الخيارات ولا يصحّ ضياعها. */
  onFree: () => void;
}) {
  const { t } = useTranslation();
  const [num, setNum] = useState<number | null>(() => parseNum(current));
  const numeric = scale.numeric;
  const range = numeric ? tempRange(species, petId) : null;
  const tone: ObsTone | null = num !== null && range ? classifyNum(num, range) : null;
  const bump = (d: number) => {
    playTap();
    setNum((n) => Math.round(((n ?? (range ? (range.min + range.max) / 2 : 38.5)) + d) * 10) / 10);
  };
  return (
    <div className="mt-4" data-roundobs={scale.id}>
      <div className="grid gap-2">
        {scale.options.map((op) => (
          <button key={op.id} type="button" data-roundobsopt={op.id}
            onClick={() => { playTap(); onPick(op.label()); }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 px-4 text-start transition hover:border-brand-300 hover:bg-surface-2 active:scale-[.985]"
            style={{ minHeight: 58 }}>
            <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full", OBS_DOT[op.tone])} aria-hidden />
            <span className="text-lg font-black text-ink">{op.label()}</span>
            {op.hint && <span className="ms-auto text-2xs leading-snug text-ink-subtle">{op.hint()}</span>}
          </button>
        ))}
      </div>

      {numeric && (
        <>
          <p className="mb-1.5 mt-3.5 text-2xs font-bold text-ink-muted">
            {range
              ? t("obs.orNumber", { min: formatDec(range.min), max: formatDec(range.max), defaultValue: "أو سجّل الرقم — الطبيعي {{min}}–{{max}}" })
              : t("obs.orNumberNoSp", "أو سجّل الرقم — نوع الحيوان غير مسجَّل فلا مدى يُحكَم عليه")}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {numeric.presets.map((n) => (
              <button key={n} type="button" data-roundobsnum={n.toFixed(1)}
                onClick={() => { playTap(); setNum(n); }}
                className={cn("rounded-xl font-mono text-sm font-black transition active:scale-95",
                  num === n ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink hover:bg-surface-3")}
                style={{ minHeight: 48 }}>
                {n.toFixed(1)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" onClick={() => bump(-numeric.step)}
              className="grid place-items-center rounded-xl bg-surface-2 font-mono text-lg font-black text-ink transition hover:bg-surface-3 active:scale-95"
              style={{ width: 52, height: 52 }}>−</button>
            <div data-roundobsval className={cn("grid flex-1 place-items-center rounded-xl font-mono text-2xl font-black tabular-nums ring-1",
              tone === "good" && "bg-success-50 text-success-700 ring-success-300/70 dark:bg-success-500/15 dark:text-success-300",
              tone === "low" && "bg-orange-50 text-orange-700 ring-orange-400/70 dark:bg-orange-500/15 dark:text-orange-300",
              tone === "crit" && "bg-danger-50 text-danger-700 ring-danger-400 dark:bg-danger-500/15 dark:text-danger-300",
              tone === null && "bg-surface-2 text-ink-subtle ring-line")}
              style={{ height: 52 }}>
              {num !== null ? num.toFixed(1) : "—"}
            </div>
            <button type="button" onClick={() => bump(numeric.step)}
              className="grid place-items-center rounded-xl bg-surface-2 font-mono text-lg font-black text-ink transition hover:bg-surface-3 active:scale-95"
              style={{ width: 52, height: 52 }}>+</button>
          </div>
          <button type="button" data-roundobssave disabled={num === null}
            onClick={() => { if (num !== null) onPick(num.toFixed(1)); }}
            className="btn btn-primary mt-2 w-full disabled:opacity-50" style={{ minHeight: 52 }}>
            {t("obs.saveNum", "سجّل الرقم")}
          </button>
        </>
      )}

      <button type="button" data-roundobsfree onClick={onFree}
        className="mt-3 w-full rounded-xl px-3 text-2xs font-bold text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
        style={{ minHeight: 44 }}>
        {t("obs.freeValue", "قيمة أخرى — اكتبها بنفسك (مل، ٪، ملاحظة…)")}
      </button>
    </div>
  );
}
