import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import type { Pet, TreatmentEntry, TaskType, DoseRoute } from "@/types";
import { cn, formatNum } from "@/lib/utils";

/** أرقام عربية-هندية لنصٍّ فيه أرقام (وقت مثل "08:00").
 *  formatNum يأخذ عدداً، والوقت نصٌّ بنقطتين — فيلزم تحويلٌ على الحروف. */
import { PetAvatar } from "@/components/PetAvatar";
import { playTap, playSuccess } from "@/lib/sounds";
import { taskStatus } from "@/lib/treatmentSchedule";
import {
  TASK_META, TASK_TYPES, ROUTES, routeName, routeShort, MISS_REASONS,
  typeOf, buildRows, cellState, hourColumns, nowOffset, petSummary, pad2, toMin,
  type OrderRow,
} from "@/lib/flowsheet";

/* ============================================================================
 * Flowsheet — ورقة العلاج: مرضى في صفوف، ساعات في أعمدة.
 *
 * ── لماذا شبكة لا قائمة ──────────────────────────────────────────────────
 * «الطبلة» في العيادة ورقةٌ مسطَّرة قبل أن تكون شاشة: أسماء بالصفوف، ساعات
 * بالأعمدة، وعلامة بكل خانة. الطبيب يعرف هذا الشكل قبل أن يفتح البرنامج،
 * فإعادته إليه تُلغي التعلّم كلّه. وشبكةٌ واحدة تجيب بنظرة على سؤالٍ لا
 * تجيب عنه أي قائمة: **ما الذي فات، وما الذي حان، وما الذي بقي — لكل مريض
 * في آنٍ واحد**.
 *
 * ── ثلاث فوارق جوهرية عن لوحة الجرعات ────────────────────────────────────
 * ١. الصف **أمرٌ** لا جرعة: «سيفترياكسون ١ مل وريدي» أربع مرات = صفٌّ واحد
 *    بأربع خانات، لا أربعة أسطر متكرّرة.
 * ٢. الورقة ليست أدوية فقط: سوائل وعلامات حيوية وتغذية وإخراج وتمريض —
 *    ولكلٍّ **طريقة إنجاز مختلفة**. الدواء علامة، والحرارة قيمةٌ تُكتب.
 * ٣. خط «الآن» يقطع الشبكة عمودياً: يمينه ما فات ويساره ما جاي. الموقع
 *    نفسه معلومة، فلا يحتاج الطبيب قراءة رقمٍ ليعرف أين هو من يومه.
 *
 * ــ ولا تُلغي هذه الورقة شيئاً: عرض البطاقات ولوحة الجرعات باقيان كما هما،
 * والطبيب يختار، ويُحفظ اختياره.
 * ==========================================================================*/

const COL_W = 58;      // عرض عمود الساعة
const LEAD_W = 250;    // عمود الأسماء والأوامر

export interface FlowPatient {
  petId: string;
  pet: Pet | undefined;
  /** رمز القفص إن كان راقداً — يُطبع على شريط المريض. */
  cage?: string | null;
  /** الغرفة/الجناح للتجميع المكاني. */
  room?: string | null;
  /** حرجة؟ يرث الشريط حدّاً أحمر. */
  critical?: boolean;
  doctor?: string | null;
}

type Editing =
  | { kind: "value"; entry: TreatmentEntry; type: TaskType }
  | { kind: "missed"; entry: TreatmentEntry }
  | null;

/* ── خانة واحدة ─────────────────────────────────────────────────────────── */
const Cell = memo(function Cell({ list, todayISO, now, alt, onTap, onLong }: {
  list: TreatmentEntry[] | undefined;
  todayISO: string;
  now: string;
  alt: boolean;
  onTap: (e: TreatmentEntry) => void;
  onLong: (e: TreatmentEntry) => void;
}) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  if (!list || !list.length) {
    return <div className={cn("border-s border-line", alt && "bg-surface-2/40")} />;
  }
  const state = cellState(list, todayISO, now);
  /* ساعةٌ فيها جرعتان (٠٨:٠٠ و٠٨:٣٠) تُرسم خانةً واحدة — والضغطة يجب أن
   * تُصيب **الجرعة المعلّقة التالية** لا أوّل جرعةٍ بالقائمة. لولا ذلك
   * لأعاد الضغطُ تسجيلَ جرعةٍ أُعطيت فلا يتغيّر شيء بالشاشة، والطبيب يضغط
   * ثانيةً وثالثة ظنّاً أن الورقة معطّلة. */
  const first = list.find((t) => !t.administered_at) ?? list[0];
  const done = list.filter((t) => t.administered_at).length;
  const missed = list.find((t) => !t.administered_at && t.missed_reason);
  /* القيمة المسجَّلة تُعرَض بدل علامة الصح: قياسٌ بلا رقمه ليس قياساً. */
  const shown = list.find((t) => t.result)?.result;

  const press = (fn: () => void) => ({
    onPointerDown: () => {
      if (holdRef.current) clearTimeout(holdRef.current);
      holdRef.current = setTimeout(() => { holdRef.current = null; onLong(first); }, 550);
    },
    onPointerUp: () => { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; fn(); } },
    onPointerLeave: () => { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } },
  });

  const base = "grid h-7 min-w-7 place-items-center rounded-md text-2xs font-black tabular-nums transition active:scale-90";
  return (
    <div className={cn("grid place-items-center border-s border-line py-1.5", alt && "bg-surface-2/40")}>
      <button
        type="button"
        data-cell={first.id}
        data-state={state}
        title={`${first.time} · ${first.medication}${missed ? ` — ${missed.missed_reason}` : ""}`}
        {...press(() => onTap(first))}
        className={cn(
          base,
          state === "given" && "bg-success-50 px-1.5 text-success-700 ring-1 ring-success-300/70 dark:bg-success-500/15 dark:text-success-300 dark:ring-success-500/30",
          state === "overdue" && (missed
            ? "bg-surface-3 px-1.5 text-ink-subtle ring-1 ring-line-strong"
            : "bg-danger-500 px-1.5 text-white shadow-sm"),
          state === "due" && "bg-warn-50 px-1.5 text-warn-700 ring-2 ring-warn-500 dark:bg-warn-500/15 dark:text-warn-300",
          state === "upcoming" && "border-2 border-dashed border-line-strong text-ink-subtle",
        )}
      >
        {state === "given"
          ? (shown ?? <Check size={13} strokeWidth={3.5} />)
          : state === "overdue"
            ? (missed ? "—" : "!")
            : state === "due"
              ? <span className="h-2 w-2 rounded-full bg-warn-500 motion-safe:animate-pulse" />
              : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
      </button>
      {list.length > 1 && (
        <span className="mt-0.5 text-[9px] font-bold tabular-nums text-ink-subtle">
          {formatNum(done)}/{formatNum(list.length)}
        </span>
      )}
    </div>
  );
});

/* ── الورقة ─────────────────────────────────────────────────────────────── */
export function Flowsheet({
  patients, entries, todayISO, nowHHMM, groupLabel, onGive, onValue, onMissed, onAddTask, onOpenPet,
}: {
  patients: FlowPatient[];
  entries: TreatmentEntry[];
  todayISO: string;
  /** الوقت الحالي "HH:MM" — يُمرَّر لا يُقرأ، فالورقة قابلة للاختبار بأي لحظة. */
  nowHHMM: string;
  /** عنوان المجموعة الحالية (يظهر على شريط القسم). */
  groupLabel?: (p: FlowPatient) => string;
  onGive: (e: TreatmentEntry) => void;
  onValue: (e: TreatmentEntry, value: string) => void;
  onMissed: (e: TreatmentEntry, reason: string | null) => void;
  onAddTask: (petId: string) => void;
  onOpenPet: (petId: string) => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /* ورقةُ **اليوم**، لا ورقة الملف كله.
   *
   * الخطة الواحدة تمتدّ أياماً: «أموكسيسيلين ٠٨:٠٠» يتكرّر خمسة أيام بخمسة
   * صفوفٍ بقاعدة البيانات. وبلا هذا الترشيح تنطبق الأيام الخمسة على شبكة
   * ساعاتٍ واحدة فتصير خانة الثامنة صباحاً «٠/٥» — جرعةُ أمسٍ وجرعةُ غدٍ
   * ملتصقتان بجرعة اليوم، والطبيب يضغط فيسجّل جرعة يومٍ مضى. الترشيح هنا
   * لا بالصفحة: الورقة تعرف يومها فتحرسه بنفسها. */
  const today = useMemo(() => entries.filter((e) => e.day === todayISO), [entries, todayISO]);

  const cols = useMemo(() => hourColumns(today, toMin(nowHHMM)), [today, nowHHMM]);
  const rowsByPet = useMemo(() => {
    const m = new Map<string, OrderRow[]>();
    for (const p of patients) {
      m.set(p.petId, buildRows(today.filter((e) => e.pet_id === p.petId)));
    }
    return m;
  }, [patients, today]);

  const off = nowOffset(cols, toMin(nowHHMM));
  const gridW = LEAD_W + cols.length * COL_W;

  /* الورقة تمتدّ بعرض ساعات اليوم كلها، و«الآن» قد يقع خارج الشاشة عند
   * الفتح — وهو آخر ما يصحّ أن يُبحَث عنه. فتُمرَّر مرة واحدة عند أول رسم
   * لتضع اللحظة الحالية بمنتصف المنظر. مرّةً فقط: تمريرٌ يتكرّر مع كل
   * تحديث يسحب الورقة من تحت إصبع الطبيب وهو يقرأ. */
  const scroller = useRef<HTMLDivElement>(null);
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || off === null) return;
    let frames = 0;   // سقف المحاولات — ورقةٌ لا تحتاج تمريراً لا تدور بلا نهاية
    let raf = 0;
    /* تمرير الورقة لتضع «الآن» بمنتصف المنظر عند الفتح.
     *
     * الدقّة هنا مكتسَبة بالقياس لا بالتخمين:
     * ١) لا تُنفَّذ المحاولة قبل أن تتّسع الشبكة فعلاً. عند أول إطار تكون
     *    الصفوف لم تُخطَّط بعد فيساوي عرضُ المحتوى عرضَ المنظر، والكتابة
     *    تُقَصّ إلى صفر — ولو عددناها نجاحاً لأُقفل التمرير للأبد.
     * ٢) إشارة scrollLeft بالاتجاه من اليمين لليسار تختلف بين المتصفّحات،
     *    فنكتب ثم نقرأ: إن لم تتحرّك بالسالب جرّبنا الموجب. القراءة بعد
     *    الكتابة تُرجع القيمة المقصوصة فعلاً، فالتصحيح ذاتي.
     * ٣) وسقفٌ للمحاولات حتى لا تدور حلقةٌ على ورقةٍ لا تحتاج تمريراً. */
    const tick = () => {
      const el = scroller.current;
      if (!el) return;
      const room = el.scrollWidth - el.clientWidth;
      if (room > 1) {
        const x = LEAD_W + off * cols.length * COL_W;
        const want = Math.max(0, Math.round(x - el.clientWidth / 2));
        if (want > 0) {
          el.scrollLeft = -want;
          if (el.scrollLeft === 0) el.scrollLeft = want;
        }
        /* لا تُقفل المحاولة إلا إذا تحرّكت الورقة فعلاً.
         *
         * قِسناه: الجرعات تُحمَّل بالخلفية، فأول رسمةٍ تحمل **عموداً
         * واحداً** (الساعة الحالية وحدها). كان التأثير يجري عليها فيحسب
         * أنه لا يحتاج تمريراً ويُقفل نفسه — ثم تصل البيانات فتتّسع الورقة
         * إلى ست عشرة ساعة و«الآن» خارج الشاشة بلا رجعة. */
        if (el.scrollLeft !== 0) { centred.current = true; return; }
      }
      if (++frames < 40) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [off, cols.length]);

  useEffect(() => { if (edit?.kind === "value") setTimeout(() => inputRef.current?.focus(), 30); }, [edit]);

  const openCell = (e: TreatmentEntry) => {
    const type = typeOf(e);
    if (e.administered_at) return;               // المنجَز لا يُعاد فتحه بضغطة عابرة
    playTap();
    if (TASK_META[type].needsValue) { setDraft(e.result ?? ""); setEdit({ kind: "value", entry: e, type }); }
    else { onGive(e); playSuccess(); }
  };
  const openMissed = (e: TreatmentEntry) => {
    if (e.administered_at) return;
    playTap();
    setEdit({ kind: "missed", entry: e });
  };

  if (!patients.length) return null;

  return (
    <div className="relative">
      <div ref={scroller} className="overflow-x-auto rounded-2xl border border-line bg-surface-1" data-flowsheet>
        <div className="relative" style={{ minWidth: gridW }}>

          {/* ترويسة الساعات — لاصقة حتى لا يضيع العمود عند التمرير الطويل */}
          <div className="sticky top-0 z-20 grid border-b border-line-strong bg-surface-1"
            style={{ gridTemplateColumns: `${LEAD_W}px repeat(${cols.length}, ${COL_W}px)` }}>
            <div className="sticky start-0 z-10 border-e border-line-strong bg-surface-1 px-3 py-2 text-2xs font-extrabold text-ink-subtle">
              {t("flow.leadHead", "المريض · الأمر")}
            </div>
            {cols.map((h) => {
              const past = h < Math.floor(toMin(nowHHMM) / 60);
              const here = h === Math.floor(toMin(nowHHMM) / 60);
              return (
                <div key={h} data-hourcol={h}
                  className={cn("border-s border-line py-2 text-center text-2xs font-black tabular-nums",
                    here ? "text-danger-600 dark:text-danger-300" : past ? "text-ink-subtle/50" : "text-ink-subtle")}>
                  {pad2(h)}
                </div>
              );
            })}
          </div>

          {patients.map((p, i) => {
            const rows = rowsByPet.get(p.petId) ?? [];
            const sum = petSummary(rows, todayISO, nowHHMM);
            const band = groupLabel?.(p);
            const prevBand = i > 0 ? groupLabel?.(patients[i - 1]) : undefined;
            return (
              <div key={p.petId}>
                {band && band !== prevBand && (
                  <div className="sticky start-0 flex items-center gap-2 border-y border-line bg-surface-2 px-3 py-1.5">
                    <span className="text-2xs font-extrabold text-ink">{band}</span>
                  </div>
                )}

                {/* شريط المريض */}
                {/* شريط المريض. اسمُه وشارةُ تأخيره وزرُّ إضافته **كلها داخل
                    العمود اللاصق**: الورقة تمتدّ بعرض ساعات اليوم، فما يوضع
                    خارج العمود يُدفَع لآخرها ويحتاج تمريراً أفقياً للوصول
                    إليه — قِسناه: زرُّ «مهمة» كان يقع خارج الشاشة تماماً. */}
                <div className={cn("grid border-t border-line-strong bg-surface-2/60",
                  p.critical && "shadow-[inset_3px_0_0_theme(colors.danger.500)]")}
                  style={{ gridTemplateColumns: `${LEAD_W}px 1fr` }}>
                  <div className="sticky start-0 z-10 flex items-center gap-2 border-e border-line-strong bg-surface-2/60 px-2.5 py-1.5">
                    <button type="button" data-flowpet={p.petId} onClick={() => { playTap(); onOpenPet(p.petId); }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-start transition hover:bg-surface-3">
                      {p.pet
                        ? <PetAvatar pet={p.pet} size={26} className="shrink-0 rounded-md" />
                        : <span className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-md bg-surface-3 text-sm">🐾</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-extrabold leading-tight text-ink" dir="auto">{p.pet?.name ?? "—"}</span>
                        <span className="flex items-center gap-1.5">
                          {sum.total > 0 && (
                            <span className="text-[10px] font-bold tabular-nums text-ink-subtle">
                              {t("flow.doneOf", { a: formatNum(sum.done), b: formatNum(sum.total), defaultValue: "أُنجز {{a}} من {{b}}" })}
                            </span>
                          )}
                          {sum.overdue > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-danger-50 px-1.5 text-[10px] font-black text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
                              <AlertTriangle size={9} /> {formatNum(sum.overdue)}
                            </span>
                          )}
                        </span>
                      </span>
                      {p.cage && (
                        <span className="shrink-0 rounded border border-line-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-muted">
                          {p.cage}
                        </span>
                      )}
                    </button>
                    <button type="button" data-addtask={p.petId} onClick={() => { playTap(); onAddTask(p.petId); }}
                      title={t("flow.addTask", "مهمة")}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-1 text-ink-muted ring-1 ring-line transition hover:text-brand-600 hover:ring-brand-300">
                      <Plus size={13} />
                    </button>
                  </div>
                  <div />
                </div>

                {/* صفوف الأوامر */}
                {rows.length === 0 ? (
                  <div className="grid border-b border-line" style={{ gridTemplateColumns: `${LEAD_W}px 1fr` }}>
                    <div className="sticky start-0 z-10 border-e border-line-strong bg-surface-1 px-3 py-2 text-[11px] text-ink-subtle">
                      {t("flow.noOrders", "بلا أوامر اليوم")}
                    </div>
                    <div />
                  </div>
                ) : rows.map((row) => {
                  const meta = TASK_META[row.type];
                  return (
                    <div key={row.key} data-orderrow={row.key}
                      className="group grid border-b border-line transition hover:bg-surface-2/50"
                      style={{ gridTemplateColumns: `${LEAD_W}px repeat(${cols.length}, ${COL_W}px)` }}>
                      <div className="sticky start-0 z-10 flex items-center gap-2 border-e border-line-strong bg-surface-1 px-2.5 py-1.5 group-hover:bg-surface-2/50">
                        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-black",
                          row.type === "drug" && "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
                          row.type === "fluid" && "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
                          row.type === "vitals" && "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300",
                          row.type === "feed" && "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
                          row.type === "elim" && "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
                          (row.type === "nurse" || row.type === "lab") && "bg-surface-3 text-ink-muted",
                        )}>{meta.glyph}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-bold leading-tight text-ink" dir="auto">{row.label}</span>
                          <span className="block truncate font-mono text-[9.5px] leading-tight text-ink-subtle" dir="auto">
                            {[row.amount, row.route ? routeShort(row.route) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </div>
                      {cols.map((h, ci) => (
                        <Cell key={h} list={row.byHour.get(h)} todayISO={todayISO} now={nowHHMM}
                          alt={ci % 2 === 1} onTap={openCell} onLong={openMissed} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* خط «الآن» — الصورة التي تبقى بعد إغلاق الشاشة */}
          {off !== null && (
            <div data-nowline aria-hidden
              className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-danger-500"
              style={{ insetInlineStart: LEAD_W + off * cols.length * COL_W }}>
              <span className="absolute top-0 max-w-max -translate-x-1/2 rounded-b bg-danger-500 px-1.5 py-0.5 font-mono text-[10px] font-black text-white rtl:translate-x-1/2">
                {nowHHMM}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* دليل القراءة — لغةُ لونٍ لم تُشرح ليست لغة */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2 text-2xs font-bold text-ink-subtle">
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded bg-success-50 ring-1 ring-success-300 dark:bg-success-500/20" /> {t("flow.kDone", "أُنجزت")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded bg-danger-500" /> {t("flow.kLate", "متأخّرة")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded bg-warn-50 ring-2 ring-warn-500 dark:bg-warn-500/20" /> {t("flow.kDue", "مستحقّة الآن")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border-2 border-dashed border-line-strong" /> {t("flow.kPlan", "مجدولة")}</span>
        <span className="ms-auto basis-full text-ink-subtle/90 sm:basis-auto">{t("flow.hint", "اضغط الخانة لتسجيلها · اضغط مطوّلاً لتوثيق سبب الفوات")}</span>
      </div>

      {/* تسجيل قيمة */}
      {edit?.kind === "value" && (
        <ValueSheet
          entry={edit.entry}
          hint={TASK_META[edit.type].valueHint?.() ?? ""}
          value={draft}
          onChange={setDraft}
          onCancel={() => setEdit(null)}
          onSave={() => {
            const v = draft.trim();
            if (!v) return;
            onValue(edit.entry, v);
            playSuccess();
            setEdit(null);
          }}
          inputRef={inputRef}
        />
      )}

      {/* توثيق سبب الفوات */}
      {edit?.kind === "missed" && (
        <MissedSheet
          entry={edit.entry}
          onClose={() => setEdit(null)}
          onPick={(reason) => { onMissed(edit.entry, reason); playTap(); setEdit(null); }}
        />
      )}
    </div>
  );
}

/* ── لوحة إدخال القيمة ──────────────────────────────────────────────────── */
function ValueSheet({ entry, hint, value, onChange, onCancel, onSave, inputRef }: {
  entry: TreatmentEntry; hint: string; value: string;
  onChange: (v: string) => void; onCancel: () => void; onSave: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onCancel}>
      <div data-valuesheet onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl border border-line bg-surface-1 p-4 shadow-lg sm:max-w-sm sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink">{entry.medication}</p>
            <p className="mt-0.5 font-mono text-2xs font-bold text-ink-subtle">{entry.time}</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-ink-subtle"><X size={16} /></button>
        </div>
        <label className="mb-1 block text-2xs font-bold text-ink-muted">{hint}</label>
        <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
          inputMode="decimal" data-valueinput
          className="input w-full text-center font-mono text-lg font-black" />
        <button type="button" data-valuesave onClick={onSave} disabled={!value.trim()}
          className="btn btn-primary mt-3 w-full disabled:opacity-50">
          {t("flow.saveValue", "سجّل")}
        </button>
      </div>
    </div>
  );
}

/* ── لوحة سبب الفوات ────────────────────────────────────────────────────── */
function MissedSheet({ entry, onClose, onPick }: {
  entry: TreatmentEntry; onClose: () => void; onPick: (reason: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div data-missedsheet onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl border border-line bg-surface-1 p-4 shadow-lg sm:max-w-sm sm:rounded-3xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-sm font-black text-ink">{t("flow.whyMissed", "لماذا فاتت؟")}</p>
          <button type="button" onClick={onClose} className="p-1 text-ink-subtle"><X size={16} /></button>
        </div>
        <p className="mb-3 text-2xs text-ink-subtle">
          {entry.medication} · <span className="font-mono">{entry.time}</span>
        </p>
        <div className="grid gap-1.5">
          {MISS_REASONS.map((r) => (
            <button key={r.id} type="button" data-reason={r.id} onClick={() => onPick(r.label())}
              className="rounded-xl bg-surface-2 px-3 py-2.5 text-start text-xs font-bold text-ink transition hover:bg-surface-3">
              {r.label()}
            </button>
          ))}
          {entry.missed_reason && (
            <button type="button" onClick={() => onPick(null)}
              className="mt-1 rounded-xl px-3 py-2 text-2xs font-bold text-ink-subtle transition hover:text-danger-600">
              {t("flow.clearReason", "امسح السبب المسجّل")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── إضافة مهمة ─────────────────────────────────────────────────────────── */
export function AddTaskSheet({ petName, todayISO, onClose, onAdd }: {
  petName: string;
  todayISO: string;
  onClose: () => void;
  onAdd: (rows: Omit<TreatmentEntry, "id" | "created_at">[]) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<TaskType>("vitals");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState<DoseRoute | "">("");
  const [times, setTimes] = useState<string[]>(["10:00"]);

  /* الاسم الافتراضي يتبع النوع: «علامات حيوية» لا تحتاج كتابة اسم، والدواء
   * لا يصحّ بلا اسم. فالحقل يُملأ تلقائياً ويبقى قابلاً للتعديل. */
  useEffect(() => { setLabel(TASK_META[type].ar()); }, [type]);

  const toggleTime = (v: string) =>
    setTimes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort()));

  const SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
  const valid = label.trim().length > 0 && times.length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div data-addtasksheet onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface-1 p-4 shadow-lg sm:max-w-md sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink">{t("flow.newTask", "مهمة جديدة")}</p>
            <p className="mt-0.5 text-2xs font-bold text-ink-subtle">{petName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-ink-subtle"><X size={16} /></button>
        </div>

        <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskType", "نوع المهمة")}</label>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {TASK_TYPES.map((k) => (
            <button key={k} type="button" data-tasktype={k} onClick={() => { playTap(); setType(k); }}
              className={cn("rounded-xl px-1 py-2 text-center text-2xs font-bold transition",
                type === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
              <span className="block text-sm leading-tight">{TASK_META[k].glyph}</span>
              {TASK_META[k].ar()}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskName", "الاسم")}</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} data-taskname
          className="input mb-3 w-full" placeholder={TASK_META[type].ar()} />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskAmount", "الكمية / المعدّل")}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} data-taskamount
              className="input w-full" placeholder={type === "fluid" ? t("flow.phRate", "5 مل/سا") : t("flow.phDose", "1 مل")} />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskRoute", "طريق الإعطاء")}</label>
            <select value={route} onChange={(e) => setRoute(e.target.value as DoseRoute | "")} data-taskroute
              className="input w-full">
              <option value="">{t("flow.routeNone", "—")}</option>
              {ROUTES.map((r) => (
                <option key={r} value={r}>{routeName(r)}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskTimes", "الأوقات اليوم")}</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SLOTS.map((s) => (
            <button key={s} type="button" data-taskslot={s} onClick={() => { playTap(); toggleTime(s); }}
              className={cn("rounded-lg px-2.5 py-1.5 font-mono text-2xs font-bold transition",
                times.includes(s) ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
              {s}
            </button>
          ))}
        </div>

        <button type="button" data-addtasksave disabled={!valid}
          onClick={() => {
            onAdd(times.map((time) => ({
              pet_id: "", // يملؤه المستدعي
              day: todayISO,
              medication: label.trim(),
              time,
              amount: amount.trim(),
              task_type: type,
              route: route || null,
            })));
            playSuccess();
          }}
          className="btn btn-primary w-full disabled:opacity-50">
          {t("flow.addNTasks", { n: formatNum(times.length), defaultValue: "أضِف {{n}} مهمة" })}
        </button>
      </div>
    </div>
  );
}

/** حالة المهمة — يُعاد تصديره ليستعمله المستدعي بلا استيراد ثانٍ. */
export { taskStatus };
