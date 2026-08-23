import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Plus, X, ChevronDown, RotateCcw } from "lucide-react";
import type { Pet, Species, TreatmentEntry, TaskType, DoseRoute } from "@/types";
import { cn, formatNum, formatDec } from "@/lib/utils";

/** أرقام عربية-هندية لنصٍّ فيه أرقام (وقت مثل "08:00").
 *  formatNum يأخذ عدداً، والوقت نصٌّ بنقطتين — فيلزم تحويلٌ على الحروف. */
import { PetAvatar } from "@/components/PetAvatar";
import { playTap, playSuccess } from "@/lib/sounds";
import {
  searchDrugs, doseFor, calcDose, isBannedFor, FREQ_LABEL,
  type Monograph, type Route,
} from "@/lib/vetFormulary";
import {
  TASK_META, TASK_TYPES, ROUTES, routeName, routeShort, MISS_REASONS,
  typeOf, buildRows, cellState, hourColumns, isGapBefore, nowOffset, petSummary, pad2, toMin,
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

/* عرض عمود الساعة يتبع حجم الخانة لا العكس: الخانة أولاً هدفُ لمسٍ (٤٤ بكسل
 * هي أصغر ما تصيبه إصبعٌ بثقة — وقِسنا القديمة ٢٤٫٥)، والعمود يتّسع لها. */
const CELL = 44;
const COL_W = CELL + 18;
const LEAD_W = 208;    // عمود الأوامر

/** طرق الدليل الدوائي ← طرق ورقة العلاج. الاتجاه المعاكس موجود بالدليل
 *  (`APP_ROUTE`) لكنه بمعرّفات شاشة الخطة، وهذه معرّفاتنا نحن. */
/** أوّل حرفين من اسم المُعطي — توقيعٌ يُقرأ داخل مربّعٍ من ٤٤ بكسل.
 *  «Dr. Sarah Mansour» ← «SM» · «سارة منصور» ← «سم». */
function initialsOf(name: string | null | undefined): string | null {
  const parts = (name ?? "").replace(/^(د\.|دكتور|dr\.?)\s*/i, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** «HH:MM» من طابعٍ زمني — للعرض بشريط التأكيد. */
const hhmmOf = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const APP_ROUTE_BACK: Partial<Record<Route, DoseRoute>> = {
  PO: "po", IV: "iv", IM: "im", SC: "sc", topical: "topical",
};

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
const Cell = memo(function Cell({ list, todayISO, now, alt, hour, gap, sel, onTap, onAdd }: {
  list: TreatmentEntry[] | undefined;
  todayISO: string;
  now: string;
  alt: boolean;
  hour: number;
  /** بين هذا العمود وسابقه ساعاتٌ مطويّة — يُرسم حدٌّ أغمق. */
  gap: boolean;
  /** الخانة التي يتحدّث عنها شريط التأكيد الآن — تُحاط بحلقةٍ لتُربط به. */
  sel: boolean;
  onTap: (e: TreatmentEntry) => void;
  /** الخانة الفارغة تُنشئ جرعةً بساعتها — إن وُصل هذا النداء. */
  onAdd?: (hour: number) => void;
}) {
  /* الفراغ ليس عدماً بل **مكاناً**: الضغط عليه يكتب جرعةً بساعته، فيُختار
   * الوقت بموضع الإصبع لا بمنتقي وقتٍ يُفتح ويُغلق. و«+» باهتةٌ ظاهرةٌ
   * دائماً — الآيباد بلا تحويم، وإيماءةٌ لا تُرى لا تُستعمل. */
  if (!list || !list.length) {
    return (
      <div className={cn("grid place-items-center py-1.5", gap ? "border-s-2 border-line-strong" : "border-s border-line", alt && "bg-surface-2/40")}>
        {onAdd ? (
          <button type="button" data-addcell={hour} onClick={() => { playTap(); onAdd(hour); }}
            style={{ height: CELL, width: CELL }}
            className="grid place-items-center rounded-xl border border-dashed border-transparent text-line-strong opacity-35 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 hover:opacity-100 dark:hover:bg-brand-500/10">
            <Plus size={14} />
          </button>
        ) : <span style={{ height: CELL }} />}
      </div>
    );
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

  /* الضغط المطوّل حُذف.
   *
   * كان الطريق الوحيد لـ«فاتت»: ضغطةٌ تُمسك ٥٥٠ms. وهي إيماءةٌ لا تُرى فلا
   * تُكتشف، وتُلغى بأدنى حركة إصبع (`pointerleave`) — أي أنها تفشل على آيباد
   * بيدٍ مشغولة أكثر مما تنجح. فصار للخانة فعلٌ واحد: ضغطة. و«فاتت»
   * و«تراجع» انتقلا إلى شريط التأكيد الذي يظهر بعد الضغطة نفسها — حيث
   * يحتاجهما الطبيب فعلاً، وحيث يراهما بلا أن يبحث.
   */

  const base = "grid place-items-center rounded-xl text-sm font-black tabular-nums transition active:scale-90";
  return (
    <div className={cn("grid place-items-center py-1.5", gap ? "border-s-2 border-line-strong" : "border-s border-line", alt && "bg-surface-2/40")}>
      <button
        type="button"
        data-cell={first.id}
        data-state={state}
        style={{ height: CELL, minWidth: CELL }}
        title={`${first.time} · ${first.medication}${missed ? ` — ${missed.missed_reason}` : ""}`}
        onClick={() => onTap(first)}
        className={cn(
          base,
          sel && "ring-2 ring-brand-600 ring-offset-1 ring-offset-surface-1",
          state === "given" && "bg-success-50 px-1.5 text-success-700 ring-1 ring-success-300/70 dark:bg-success-500/15 dark:text-success-300 dark:ring-success-500/30",
          state === "overdue" && (missed
            ? "bg-surface-3 px-1.5 text-ink-subtle ring-1 ring-line-strong"
            : "bg-danger-500 px-1.5 text-white shadow-sm"),
          state === "due" && "bg-warn-50 px-1.5 text-warn-700 ring-2 ring-warn-500 dark:bg-warn-500/15 dark:text-warn-300",
          state === "upcoming" && "border-2 border-dashed border-line-strong text-ink-subtle",
        )}
      >
        {/* الخانة المُنجَزة تحمل **أحرف مَن أعطى** لا علامة صحٍّ مجهولة — كما
            توقّع الممرّضة بمربّع الورقة الورقية. والقيمة تسبقها حين تكون
            قياساً: «٣٩٫٦» أنفع من صحٍّ وأحرف. */}
        {state === "given"
          ? (shown ?? initialsOf(first.administered_by) ?? <Check size={18} strokeWidth={3.5} />)
          : state === "overdue"
            ? (missed ? "—" : "!")
            : state === "due"
              ? <span className="h-2.5 w-2.5 rounded-full bg-warn-500 motion-safe:animate-pulse" />
              : <span className="h-2 w-2 rounded-full bg-line-strong" />}
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
  patients, entries, todayISO, nowHHMM, groupLabel, focused, onGive, onUndo, onValue, onMissed, onAddTask, onAddAt, onOpenPet,
}: {
  patients: FlowPatient[];
  entries: TreatmentEntry[];
  todayISO: string;
  /** الوقت الحالي "HH:MM" — يُمرَّر لا يُقرأ، فالورقة قابلة للاختبار بأي لحظة. */
  nowHHMM: string;
  /** عنوان المجموعة الحالية (يظهر على شريط القسم). */
  groupLabel?: (p: FlowPatient) => string;
  onGive: (e: TreatmentEntry) => void;
  /** إلغاء تسجيلٍ تمّ — الخانة ترجع معلّقة. */
  onUndo: (e: TreatmentEntry) => void;
  onValue: (e: TreatmentEntry, value: string) => void;
  onMissed: (e: TreatmentEntry, reason: string | null) => void;
  onAddTask: (petId: string) => void;
  /** ضغطُ خانةٍ فارغة: يفتح الإضافة بساعتها جاهزة. */
  onAddAt?: (petId: string, hour: number) => void;
  /** مريضٌ واحد معروض: اسمه فوق الورقة، فلا يُكرَّر شريطُه داخلها. */
  focused?: boolean;
  onOpenPet: (petId: string) => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState<Editing>(null);
  /* شريط التأكيد: يظهر بعد كل ضغطةٍ على خانة، ويحمل الأفعال النادرة —
   * «تراجع» و«بل فاتت» — عند اللحظة التي يحتاجها الطبيب فيها بالضبط.
   * وهو أيضاً ما يجعل التوثيق مرئياً: مَن أعطى ومتى، وهما مسجّلان بقاعدة
   * البيانات من قبل لكن لم يكن لهما مكانٌ يُقرآن فيه. */
  /* يُحفظ **المعرّف** لا نسخةُ الصف: الشريط يقرأ الصفَّ الحيّ من `entries`
   * عند كل رسمة، فيعرض مَن أعطى ومتى كما حُفظا فعلاً — لا كما خمّنّاهما لحظة
   * الضغط قبل أن تعود الكتابة. */
  const [confirmId, setConfirmId] = useState<{ id: string; justGiven: boolean } | null>(null);
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

  /** الصفّ الذي يتحدّث عنه الشريط — من البيانات الحيّة دائماً. */
  const confirm = useMemo(() => {
    if (!confirmId) return null;
    const entry = today.find((e) => e.id === confirmId.id);
    return entry ? { entry, justGiven: confirmId.justGiven } : null;
  }, [confirmId, today]);

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

  /**
   * ضغطة الخانة — فعلٌ واحد لا اثنان.
   *
   * المعلّقة تُعطى فوراً (وهو الفعل الغالب بالجولة، فلا يصحّ أن يكلّف ضغطتين)،
   * والمُنجَزة **تُفتَح للمراجعة لا تُصمّ**: كانت `if (administered_at) return`
   * تعني أن ضغطةً بالغلط لا تُراجَع أبداً — جرعةٌ تُسجَّل ولم تُعطَ، والوردية
   * التالية تصدّقها. وهذا خطرٌ سريري لا إزعاج واجهة.
   */
  const openCell = (e: TreatmentEntry) => {
    playTap();
    if (e.administered_at) { setConfirmId({ id: e.id, justGiven: false }); return; }
    const type = typeOf(e);
    if (TASK_META[type].needsValue) { setDraft(e.result ?? ""); setEdit({ kind: "value", entry: e, type }); return; }
    onGive(e);
    playSuccess();
    setConfirmId({ id: e.id, justGiven: true });
  };

  /** التراجع: الخانة ترجع معلّقةً كما كانت، بلا سؤالٍ ولا حوار. */
  const undo = (e: TreatmentEntry) => {
    playTap();
    onUndo(e);
    setConfirmId(null);
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
            {cols.map((h, ci) => {
              const past = h < Math.floor(toMin(nowHHMM) / 60);
              const here = h === Math.floor(toMin(nowHHMM) / 60);
              return (
                <div key={h} data-hourcol={h}
                  className={cn("py-2 text-center text-2xs font-black tabular-nums",
                    isGapBefore(cols, ci) ? "border-s-2 border-line-strong" : "border-s border-line",
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

                {!focused && (<>
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
                </>)}

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
                          hour={h} alt={ci % 2 === 1} gap={isGapBefore(cols, ci)}
                          sel={!!confirm && !!row.byHour.get(h)?.some((x) => x.id === confirm.entry.id)}
                          onTap={openCell}
                          onAdd={onAddAt ? (hh) => onAddAt(p.petId, hh) : undefined} />
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
      {/* شريط التأكيد — يلي كل ضغطة، ويحمل ما لا يصحّ أن يكون مخفياً:
          مَن أعطى ومتى، وطريقُ التراجع، وطريقُ «بل فاتت».
          وهو **ملصقٌ بأسفل الشاشة** لا بأسفل الورقة: الورقة تطول فينزل معها
          خارج المنظر، ثم قِسناه فوجدناه يقع تحت زرّ المساعد العائم فيبتلع
          ضغطة «تراجع». فصار مكانه ثابتاً معلوماً، وفيه فسحةٌ تُخلي زرّ
          المساعد (`pe-20`) فلا يتزاحمان أبداً. */}
      {confirm && (
        <div data-confirmbar
          className={cn("fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-raised pe-20 sm:pe-3",
            confirm.justGiven
              ? "border-success-300 bg-success-50 dark:border-success-500/40 dark:bg-success-500/10"
              : "border-line bg-surface-2")}>
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl",
            confirm.justGiven ? "bg-success-600 text-white" : "bg-surface-3 text-ink-muted")}>
            <Check size={16} strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-ink" dir="auto">
              {confirm.entry.medication}
              {confirm.entry.amount ? <span className="font-normal text-ink-muted"> · {confirm.entry.amount}</span> : null}
            </p>
            <p className="truncate text-2xs font-bold text-ink-subtle">
              {t("flow.givenAt", { at: hhmmOf(confirm.entry.administered_at), by: confirm.entry.administered_by ?? t("flow.byUnknown", "غير مسجَّل"), defaultValue: "أُعطيت {{at}} · {{by}}" })}
              {confirm.entry.time && hhmmOf(confirm.entry.administered_at) !== confirm.entry.time
                ? ` · ${t("flow.wasDue", { at: confirm.entry.time, defaultValue: "موعدها {{at}}" })}` : ""}
            </p>
          </div>
          <button type="button" data-undo onClick={() => undo(confirm.entry)}
            className="flex items-center gap-1.5 rounded-xl bg-surface-1 px-3 text-2xs font-bold text-ink-muted ring-1 ring-line transition hover:text-danger-600 hover:ring-danger-300"
            style={{ minHeight: 40 }}>
            <RotateCcw size={14} /> {t("flow.undo", "تراجع")}
          </button>
          <button type="button" data-butmissed
            onClick={() => { playTap(); onUndo(confirm.entry); setEdit({ kind: "missed", entry: confirm.entry }); setConfirmId(null); }}
            className="flex items-center gap-1.5 rounded-xl bg-surface-1 px-3 text-2xs font-bold text-ink-muted ring-1 ring-line transition hover:text-warn-700 hover:ring-warn-300"
            style={{ minHeight: 40 }}>
            {t("flow.butMissed", "بل فاتت")}
          </button>
          <button type="button" data-closebar onClick={() => setConfirmId(null)} aria-label={t("common.close", "إغلاق")}
            className="grid shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-3"
            style={{ width: 40, height: 40 }}><X size={16} /></button>
        </div>
      )}

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

/** مفاتيح اللوحة — عشرة أرقام وفاصلةٌ ومحو. */
const PAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"];

/**
 * لوحة القيمة — بأرقامها الخاصة لا بكيبورد النظام.
 *
 * الحرارة والوزن ونسبة الأكل كلها أرقام، وفتحُ كيبورد الآيباد لها يقلب نصف
 * الشاشة ويُخفي ما كان الطبيب ينظر إليه، ثم يحتاج ضغطةً لإغلاقه. ولوحةٌ من
 * اثني عشر مفتاحاً بحجم ٥٦ بكسل أسرع وأدقّ — والإدخال يبقى داخل السياق.
 * وحقل الكتابة باقٍ لمن أراد لوحة نظامه (المقاسات غير الرقمية مثل «بال/تغوّط»).
 */
function ValueSheet({ entry, hint, value, onChange, onCancel, onSave, inputRef }: {
  entry: TreatmentEntry; hint: string; value: string;
  onChange: (v: string) => void; onCancel: () => void; onSave: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  const tapKey = (k: string) => {
    playTap();
    if (k === "⌫") { onChange(value.slice(0, -1)); return; }
    if (k === "." && value.includes(".")) return;
    onChange(value + k);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onCancel}>
      <div data-valuesheet onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl border border-line bg-surface-1 p-4 shadow-lg sm:max-w-sm sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink" dir="auto">{entry.medication}</p>
            <p className="mt-0.5 font-mono text-2xs font-bold text-ink-subtle">{entry.time}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel", "إلغاء")}
            className="grid shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-2"
            style={{ width: 44, height: 44 }}><X size={18} /></button>
        </div>
        <label className="mb-1 block text-2xs font-bold text-ink-muted">{hint}</label>
        <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
          inputMode="decimal" data-valueinput
          className="input w-full text-center font-mono text-2xl font-black" style={{ minHeight: 60 }} />

        <div data-numpad className="mt-3 grid grid-cols-3 gap-1.5">
          {PAD.map((k) => (
            <button key={k} type="button" data-padkey={k} onClick={() => tapKey(k)}
              className={cn("grid place-items-center rounded-xl font-mono text-lg font-black transition active:scale-95",
                k === "⌫" ? "bg-surface-3 text-ink-muted hover:bg-danger-50 hover:text-danger-600" : "bg-surface-2 text-ink hover:bg-surface-3")}
              style={{ minHeight: 56 }}>
              {k}
            </button>
          ))}
        </div>

        <button type="button" data-valuesave onClick={onSave} disabled={!value.trim()}
          className="btn btn-primary mt-3 w-full disabled:opacity-50" style={{ minHeight: 52 }}>
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

/**
 * لوحة «مهمة جديدة» — الدواء يجلب جرعته بنفسه.
 *
 * ── ما الذي تغيّر ولماذا ─────────────────────────────────────────────────
 * كانت اللوحة تسأل ستّ أسئلة: النوع (سبعة أزرار) والاسم والكمية والطريق
 * وثماني خانات أوقات. والطبيب لا يفكّر هكذا: هو يفكّر بدواءٍ لحيوانٍ وزنه
 * كذا، والباقي يعرفه الدليل الدوائي.
 *
 * والدليل موجودٌ بالمشروع من قبل (`vetFormulary.ts`): ثمانية وخمسون دواءً
 * بنوافذ جرعاتٍ **لكل نوع حيوان** مصدرها Plumb's وBSAVA، ومعها محرّك يحوّل
 * ملغم/كغ إلى **مل بتركيز القنينة الحقيقي**. كان يعمل بشاشة خطة العلاج
 * وحدها؛ فوُصل هنا. فيكفي أن يكتب أول حروف الدواء: يختاره من القائمة، فتُملأ
 * الجرعة والطريق والتكرار والأوقات — ويبقى كلُّ حقلٍ قابلاً للتعديل بيده.
 *
 * وما لا يُحسب لا يُدَّعى: بلا وزنٍ مسجَّل للحيوان لا تُعرض جرعةٌ محسوبة، بل
 * يُقال إن الوزن ناقص. رقمٌ مخترَعٌ أخطر من خانةٍ فارغة.
 */
export function AddTaskSheet({ petName, todayISO, presetHour, weightKg, species, onClose, onAdd }: {
  petName: string;
  todayISO: string;
  /** ساعةٌ جاءت من خانةٍ فارغة ضُغطت — تُملأ جاهزةً بدل البحث عنها. */
  presetHour?: number | null;
  weightKg?: number | null;
  species?: Species | null;
  onClose: () => void;
  onAdd: (rows: Omit<TreatmentEntry, "id" | "created_at">[]) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<TaskType>("drug");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState<DoseRoute | "">("");
  const [times, setTimes] = useState<string[]>(
    presetHour != null ? [`${pad2(presetHour)}:00`] : ["10:00"],
  );
  const [picked, setPicked] = useState<Monograph | null>(null);
  const [more, setMore] = useState(false);

  /* الاقتراحات تظهر ما دام الطبيب يكتب ولم يختر بعد. اختياره يُغلقها — قائمةٌ
   * تبقى مفتوحة فوق ما كتبه تحجب عنه ما فعل. */
  const suggestions = useMemo(() => {
    if (type !== "drug" || picked || label.trim().length < 2) return [];
    return searchDrugs(label.trim(), 5);
  }, [type, label, picked]);

  /** الجرعة المحسوبة للدواء المختار — أو سببُ تعذّرها. */
  const computed = useMemo(() => {
    if (!picked) return null;
    const sp: Species = species ?? "other";
    const banned = isBannedFor(picked, sp);
    if (banned) return { banned };
    const win = doseFor(picked, sp);
    if (!win) return { none: true };
    if (!weightKg || weightKg <= 0) return { noWeight: true, win };
    const strength = picked.strengths?.[0];
    const calc = calcDose({
      mgPerKg: win.typical, weightKg, strength, solid: picked.solid, freq: win.freq,
    });
    return { win, calc, strength };
  }, [picked, species, weightKg]);

  /** اختيار دواءٍ من الدليل: يملأ الاسم والجرعة والطريق والأوقات دفعةً واحدة. */
  const pick = (d: Monograph) => {
    playTap();
    setPicked(d);
    setLabel(d.en);
    const sp: Species = species ?? "other";
    const win = doseFor(d, sp);
    if (!win) return;
    const r = APP_ROUTE_BACK[win.routes[0]];
    if (r) setRoute(r);
    if (weightKg && weightKg > 0) {
      const strength = d.strengths?.[0];
      const c = calcDose({ mgPerKg: win.typical, weightKg, strength, solid: d.solid, freq: win.freq });
      setAmount(c.tabletsLabel ? `${c.tabletsLabel} قرص` : c.mlRounded != null ? `${c.mlRounded} مل` : `${Math.round(c.mg * 100) / 100} ملغم`);
    }
    /* الأوقات تُشتقّ من تكرار الدليل ابتداءً من الساعة القادمة — لا يؤشّرها
     * الطبيب بيده، وخانةٌ منسيّةٌ من ثمانٍ تعني جرعةً ضائعة. */
    if (presetHour == null && win.freq > 0) {
      const startH = new Date().getHours() + 1;
      const out: string[] = [];
      for (let h = startH; h < 24; h += win.freq) out.push(`${pad2(h)}:00`);
      setTimes(out.length ? out : [`${pad2(Math.min(23, startH))}:00`]);
    }
  };

  /* الاسم الافتراضي يتبع النوع: «علامات حيوية» لا تحتاج كتابة اسم، والدواء
   * لا يصحّ بلا اسم. فالحقل يُملأ تلقائياً ويبقى قابلاً للتعديل. */
  useEffect(() => {
    if (type === "drug") { setLabel(""); setPicked(null); }
    else { setLabel(TASK_META[type].ar()); setPicked(null); }
  }, [type]);

  const toggleTime = (v: string) =>
    setTimes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort()));

  const SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
  const allSlots = presetHour != null && !SLOTS.includes(`${pad2(presetHour)}:00`)
    ? [...SLOTS, `${pad2(presetHour)}:00`].sort()
    : SLOTS;
  const valid = label.trim().length > 0 && times.length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div data-addtasksheet onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface-1 p-4 shadow-lg sm:max-w-lg sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink">{t("flow.newTask", "مهمة جديدة")}</p>
            <p className="mt-0.5 text-2xs font-bold text-ink-subtle">
              {petName}{weightKg ? ` · ${formatDec(weightKg)} ${t("flow.kg", "كغ")}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.cancel", "إلغاء")}
            className="grid shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-2"
            style={{ width: 44, height: 44 }}><X size={18} /></button>
        </div>

        {/* الاسم — ومعه الدليل الدوائي حين يكون النوع دواءً */}
        <label className="mb-1 block text-2xs font-bold text-ink-muted">
          {type === "drug" ? t("flow.drugName", "اسم الدواء") : t("flow.taskName", "الاسم")}
        </label>
        <input value={label} data-taskname autoFocus
          onChange={(e) => { setLabel(e.target.value); setPicked(null); }}
          className="input w-full" style={{ minHeight: 48 }}
          placeholder={type === "drug" ? t("flow.drugPh", "اكتب أول حروفه — مثلاً: amox") : TASK_META[type].ar()} />

        {suggestions.length > 0 && (
          <div data-drughits className="mt-1.5 overflow-hidden rounded-2xl border border-line">
            {suggestions.map((d) => {
              const win = doseFor(d, species ?? "other");
              return (
                <button key={d.id} type="button" data-drughit={d.id} onClick={() => pick(d)}
                  className="flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-start transition last:border-0 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{d.en}</span>
                    <span className="block truncate text-2xs text-ink-subtle">
                      {d.ar}{win ? ` · ${win.typical} ${t("flow.mgkg", "ملغم/كغ")} · ${FREQ_LABEL[win.freq]}` : ""}
                    </span>
                  </span>
                  <Plus size={15} className="shrink-0 text-brand-600" />
                </button>
              );
            })}
          </div>
        )}

        {/* ما حسبه الدليل — يُرى قبل الحفظ لا بعده */}
        {computed?.banned && (
          <p data-drugbanned className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
            ⚠ {computed.banned}
          </p>
        )}
        {computed?.noWeight && (
          <p data-noweight className="mt-2 rounded-xl bg-warn-50 px-3 py-2 text-2xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
            {t("flow.noWeight", "وزن الحيوان غير مسجَّل — سجّله بملفه لتُحسب الجرعة تلقائياً.")}
          </p>
        )}
        {computed?.calc && computed.win && (
          <p data-dosecalc className="mt-2 rounded-xl bg-success-50 px-3 py-2 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">
            {t("flow.doseCalc", { mgkg: computed.win.typical, w: formatDec(weightKg ?? 0), mg: Math.round(computed.calc.mg * 100) / 100, defaultValue: "{{mgkg}} ملغم/كغ × {{w}} كغ = {{mg}} ملغم" })}
            {computed.calc.mlRounded != null
              ? ` ← ${t("flow.doseMl", { n: computed.calc.mlRounded, defaultValue: "{{n}} مل" })}` : ""}
            {computed.calc.tabletsLabel
              ? ` ← ${t("flow.doseTabs", { n: computed.calc.tabletsLabel, defaultValue: "{{n}} قرص" })}` : ""}
            {computed.strength
              ? ` (${computed.calc.tabletsLabel
                  ? t("flow.perTab", { n: computed.strength, defaultValue: "{{n}} ملغم/قرص" })
                  : t("flow.perMl", { n: computed.strength, defaultValue: "{{n}} ملغم/مل" })})` : ""}
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,170px]">
          <div>
            <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskAmount", "الكمية / المعدّل")}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} data-taskamount
              className="input w-full" style={{ minHeight: 48 }}
              placeholder={type === "fluid" ? t("flow.phRate", "5 مل/سا") : t("flow.phDose", "1 مل")} />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-bold text-ink-muted">{t("flow.taskRoute", "طريق الإعطاء")}</label>
            <select value={route} onChange={(e) => setRoute(e.target.value as DoseRoute | "")} data-taskroute
              className="input w-full" style={{ minHeight: 48 }}>
              <option value="">{t("flow.routeNone", "—")}</option>
              {ROUTES.map((r) => (
                <option key={r} value={r}>{routeName(r)}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-1 mt-3 block text-2xs font-bold text-ink-muted">{t("flow.taskTimes", "الأوقات اليوم")}</label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {allSlots.map((s) => (
            <button key={s} type="button" data-taskslot={s} onClick={() => { playTap(); toggleTime(s); }}
              className={cn("rounded-xl px-3 font-mono text-xs font-bold transition",
                times.includes(s) ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}
              style={{ minHeight: 44 }}>
              {s}
            </button>
          ))}
        </div>

        {/* نوع المهمة — الدواء هو الغالب، وما عداه خلف طيّة */}
        <button type="button" data-taskmore onClick={() => { playTap(); setMore((m) => !m); }}
          className="mb-2 flex w-full items-center gap-1.5 rounded-xl px-1 py-2 text-2xs font-bold text-ink-subtle transition hover:text-ink">
          <ChevronDown size={14} className={cn("transition", more && "rotate-180")} />
          {t("flow.taskType", "نوع المهمة")} — {TASK_META[type].ar()}
        </button>
        {more && (
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {TASK_TYPES.map((k) => (
              <button key={k} type="button" data-tasktype={k} onClick={() => { playTap(); setType(k); }}
                className={cn("rounded-xl px-1 text-center text-2xs font-bold transition",
                  type === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}
                style={{ minHeight: 48 }}>
                <span className="block text-sm leading-tight">{TASK_META[k].glyph}</span>
                {TASK_META[k].ar()}
              </button>
            ))}
          </div>
        )}

        <button type="button" data-addtasksave disabled={!valid}
          onClick={() => {
            if (!valid) return;
            playSuccess();
            onAdd(times.map((time) => ({
              pet_id: "", visit_id: null, day: todayISO, time,
              // `amount` عمودٌ **not null** منذ الهجرة الأولى، يوم كان كل صفٍّ
              // دواءً وللدواء كميةٌ دائماً. والورقة الجديدة تضيف مهامّ بلا
              // كمية — حرارةٌ تُقاس، وإخراجٌ يُلاحَظ، وتمريضٌ يُنفَّذ. فكان
              // إرسال `null` يُرفض بقيد القاعدة فتفشل الإضافة كلّها.
              // والفراغ يفي بالقيد ويُقرأ فارغاً بالعرض (نصٌّ فارغ = لا شيء).
              medication: label.trim(), amount: amount.trim(),
              task_type: type, route: route || null,
              observations: null, administered_at: null, administered_by: null,
            } as unknown as Omit<TreatmentEntry, "id" | "created_at">)));
          }}
          className="btn btn-primary w-full disabled:opacity-50" style={{ minHeight: 52 }}>
          {t("flow.addNTasks", { n: formatNum(times.length), defaultValue: "أضِف {{n}} مهمة" })}
        </button>
      </div>
    </div>
  );
}
