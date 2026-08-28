import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Scale, X, Check, Delete, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui";
import { cn, money, formatNum, fmtKg } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * WeightPicker — منتقي الوزن للمنتجات التي تُباع بالكتلة (0124).
 *
 * الطبيب واقفٌ مستعجل والزبون ينتظر: «نص كيلو دراي فود». الشكل القديم كان
 * يكلّفه ضغطتين (رقاقة ثم زر تأكيد) وحقلَ إدخالٍ مركّزاً يرفع كيبورد الآيباد
 * فوق النافذة فيغطّي السعر وزرّ الإضافة. هنا: **ضغطة واحدة تخلّص** — كل مربّع
 * يحمل وزنه وسعره معاً، فالضغطة نفسها هي القراءة والتنفيذ.
 *
 * ثلاثة قرارات مقصودة، لا تُعكس بلا سبب:
 *
 * ١) الورقة ملتصقة بأسفل الشاشة ولا تستعمل <Modal>: مودال البيت يتوسّط من
 *    breakpoint sm فما فوق، فعلى آيباد ٨٢٠px يصير كل هدفٍ بمنتصف الشاشة بعيداً
 *    عن الإبهام. الأسفل هو حيث تكون اليد أصلاً.
 *
 * ٢) ضغطةٌ واحدة تبيع، لكن الراجع يحتاج تأكيداً: بالبيع المخزون سقفٌ يحمي،
 *    والسعر مطبوعٌ على المربّع قبل نزول الإصبع، والزبون واقفٌ يتحقّق. بالراجع
 *    لا سقف أصلاً (رصيدٌ لا نهائي) والفلوس تطلع من الدرج — فلمسةٌ طائشة على
 *    «٥ كغ» تعني ٢٥ ألفاً تخرج بلا حارس. لذلك المربّع بالراجع **يختار** لا يبيع.
 *
 * ٣) الإدخال بالكيلو وفيه مفتاح فاصلة، لا بالغرام: الميزان يكتب «١.٣٤»،
 *    فيكتبها الطبيب حرفياً. إدخالٌ بالغرام يجعل «١-٣-٤» تُقرأ ١٣٤ غراماً —
 *    غلطٌ بعشرة أضعاف يبدو صحيحاً على الشاشة، والسقف أعمى عنه لأن الناقص
 *    أصغر لا أكبر. الفاصلة العربية (،) والإنكليزية (.) كلاهما مقبول.
 *
 * ولا حقلَ إدخالٍ واحد بالمكوّن كله: هذا ضمانٌ ميكانيكيّ أن كيبورد iOS لا
 * يقدر يطلع فوق الورقة — لا حيلةَ blur ولا سباق تركيز.
 *
 * الأهداف ٥٦px فما فوق، على معيار QtyPad: ضغطةٌ خاطئة هنا وزنٌ خاطئ بالفاتورة
 * والمخزون معاً.
 * ==========================================================================*/

/** سلّم الأوزان: تسعةُ أوزانٍ ثابتة بشبكة ٣×٣، نفسها لكل منتجٍ وللأبد.
 *  لا تُرتَّب ولا تتبدّل بالمخزون: خانةٌ تعني شيئاً مختلفاً كل مرة هي بالضبط
 *  ما يجعل «ضغطة واحدة» خطرة. القراءة بالعربية يمين←يسار وفوق←تحت، فالأخفّ
 *  بالزاوية اليمنى العليا صعوداً إلى ٥ كغ باليسرى السفلى — بعد أسبوع تصير
 *  الزاوية ذاكرةَ يدٍ لا قراءةَ عين.
 *  ١٠٠/٢٥٠/٥٠٠/٧٥٠ غ للحوم والمكافآت، و١…٥ كغ للدراي فود والرمل. */
const LADDER = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];

/** خطوة التعديل الدقيق، وسقف الحاجز الأعلى للمخزن اللانهائي (الراجع). */
const STEP_G = 50;
const MAX_KG = 999;

const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

export function WeightPicker({ open, name, perKg, stockKg, current, ret, onClose, onSubmit }: {
  open: boolean;
  /** اسم المنتج كما يظهر بالسلة. */
  name: string;
  /** سعر الكيلو الواحد — السعر يُحسب خطياً منه. */
  perKg: number;
  /** الرصيد بالكيلو. Infinity = بلا سقف (راجع أو منتج مجمّع). */
  stockKg: number;
  /** وزن السطر القائم عند التعديل، أو صفر عند الإضافة. */
  current: number;
  /** وضع الراجع: المربّع يختار ولا يبيع، والفلوس تطلع. */
  ret: boolean;
  onClose: () => void;
  onSubmit: (kg: number) => void;
}) {
  const { t } = useTranslation();
  /** المخزن النصّي بالكيلو — يُعرض حرفياً أثناء الكتابة كي لا تختفي الفاصلة. */
  const [raw, setRaw] = useState("");
  /** لم تُلمس بعد: الرقم المبدئي معروضٌ باهتاً وأول مفتاحٍ يمسحه كاملاً. */
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [alert, setAlert] = useState<{ kind: "clamp" | "tile" | "close"; n?: number } | null>(null);
  const [inert, setInert] = useState(false);
  const [ringClose, setRingClose] = useState(false);

  const committing = useRef(false);
  const lastKeyAt = useRef(0);
  const dropStreak = useRef(0);
  const preBurst = useRef("");
  const holdTimer = useRef<number | null>(null);
  const alertTimer = useRef<number | null>(null);
  const inertTimer = useRef<number | null>(null);
  const ringTimer = useRef<number | null>(null);

  /* كل فتحة تبدأ نظيفة: الوزن الحالي معروضٌ باهتاً، ولا شيء مركَّز. */
  useEffect(() => {
    if (!open) return;
    setRaw(current > 0 ? fmtKg(current) : "");
    setTouched(false);
    setFlash(null);
    setAlert(null);
    setInert(false);
    setRingClose(false);
    committing.current = false;
    lastKeyAt.current = 0;
    dropStreak.current = 0;
    preBurst.current = "";
  }, [open, current]);

  /* لا مؤقّتَ يعيش بعد الإغلاق. */
  useEffect(() => () => {
    [holdTimer, alertTimer, inertTimer, ringTimer].forEach((r) => { if (r.current) window.clearTimeout(r.current); });
  }, []);

  /* الصفحة لا تنزلق خلف الورقة المفتوحة — ما يفعله <Modal> ونحن هنا بلا مودال. */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ــــ المشتقّات: ما يُعرض هو بالضبط ما سيُباع ــــ
  const capped = !ret && Number.isFinite(stockKg);
  const cap = capped ? Math.max(0, round3(stockKg)) : Infinity;
  const typed = round3(Number(raw) || 0);
  const over = typed > cap + 1e-9;
  const val = Math.min(typed, cap);
  const ok = val > 0;
  const editing = current > 0;

  const flashAlert = useCallback((a: { kind: "clamp" | "tile" | "close"; n?: number }) => {
    setAlert(a);
    if (alertTimer.current) window.clearTimeout(alertTimer.current);
    alertTimer.current = window.setTimeout(() => setAlert(null), 2200);
  }, []);

  /** البيع النهائي — بابٌ واحد لكل الطرق (مربّع، زر، Enter)، وفيه حارس السقف
   *  ثالثَ طبقةٍ كي ينجو الشرط من كل مسار لا من مظهر المربّع وحده. */
  const commit = useCallback((kg: number, viaTile: boolean) => {
    if (committing.current) return;
    const kg3 = round3(kg);
    if (kg3 <= 0) { playWarning(); return; }
    if (capped && kg3 > cap + 1e-9) { playWarning(); flashAlert({ kind: "tile", n: cap }); return; }
    committing.current = true;
    if (viaTile) setFlash(kg3);
    // نافذةُ خمولٍ قصيرة: الورقة تُفتح من ضغطةٍ على شبكة المنتجات الحيّة خلفها،
    // فإصبعٌ يكمل نزوله بعد الإغلاق كان يضيف صنفاً ثانياً.
    setInert(true);
    inertTimer.current = window.setTimeout(() => onSubmit(kg3), 140);
  }, [capped, cap, flashAlert, onSubmit]);

  /** مفتاحٌ من اللوحة أو الكيبورد. أربعة حرّاس، كلٌّ يرفض بصوتٍ لا بصمت. */
  const press = useCallback((k: string) => {
    setTouched(true);
    setRaw((r0) => {
      // أول مفتاحٍ بعد الفتح يمسح الرقم المبدئي: هكذا نعرض للطبيب وزنَ سطره
      // الحالي بلا خطر «٢٠ ثم ٣ = ٢٠٣».
      const r = touched ? r0 : "";
      if (k === "back") { playTap(); return r.slice(0, -1); }
      if (k === ".") {
        if (r.includes(".")) { playWarning(); return r; }
        playTap();
        return r === "" ? "0." : `${r}.`;
      }
      const dot = r.indexOf(".");
      if (dot >= 0 && r.length - dot - 1 >= 3) { playWarning(); return r; } // دقّة الغرام
      if (r.length >= 6) { playWarning(); return r; }
      const next = (r + k).replace(/^0+(?=\d)/, "");
      if ((Number(next) || 0) > MAX_KG) { playWarning(); return r; }
      playTap();
      return next;
    });
  }, [touched]);

  /** يزرع وزناً جاهزاً بالشاشة (مربّعُ الراجع، «كل المتوفّر»، الخطوة). */
  const seed = useCallback((kg: number) => { setRaw(fmtKg(kg)); setTouched(true); }, []);

  /* مرايا الحالة الحيّة: سلسلةُ «الضغط المستمر» تُجدول نفسها بمؤقّتٍ يحمل
   * إغلاقَ لحظةِ الضغط، فلو قرأت الحالة من الإغلاق لبقيت تحسب من الوزن
   * الأول أبداً — تنبض وتصفّر ولا يتحرّك الرقم. المراجع تُقرأ حيّةً دائماً. */
  const valRef = useRef(val);
  const capRef = useRef(cap);
  const cappedRef = useRef(capped);
  valRef.current = val;
  capRef.current = cap;
  cappedRef.current = capped;

  /** خطوة ±٥٠ غ — تعدّل المسوّدة ولا تكتب بالسلة أبداً. */
  const step = useCallback((deltaG: number) => {
    const cur = valRef.current;
    const next = Math.min(Math.max(round3(cur + deltaG / 1000), 0), cappedRef.current ? capRef.current : MAX_KG);
    if (Math.abs(next - cur) < 1e-9) { playWarning(); return false; }
    // تحديثٌ فوريّ للمرآة: النبضة التالية (بعد ١١٠ms) تقرأ الوزن الجديد ولو لم
    // تكن إعادةُ الرسم قد جرت بعد.
    valRef.current = next;
    seed(next);
    playTap();
    return true;
  }, [seed]);

  /* الكيبورد والماسح. الماسح كيبوردٌ يطلق رشقةَ أرقام ثم Enter؛ أي مفتاحٍ
   * يصل بأقل من ٣٥ms بعد سابقه ليس يدَ إنسان — يُسقَط، وثالثُ إسقاطٍ متتالٍ
   * يُرجع المخزن كما تركه الطبيب وينبّه. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      const handled = (e.key >= "0" && e.key <= "9") || e.key === "." || e.key === "," || e.key === "\u066B"
        || e.key === "Backspace" || e.key === "Delete" || e.key === "Enter"
        || e.key === "ArrowUp" || e.key === "ArrowDown";
      if (!handled) return;
      e.preventDefault();
      const now = performance.now();
      // أول مفتاحٍ بعد الفتح لا سابقَ له: lastKeyAt صفرٌ فالفجوة هائلة ويمرّ.
      const gap = lastKeyAt.current === 0 ? Infinity : now - lastKeyAt.current;
      lastKeyAt.current = now;
      if (gap < 35) {
        dropStreak.current += 1;
        if (dropStreak.current === 3) { setRaw(preBurst.current); playWarning(); }
        return;
      }
      dropStreak.current = 0;
      preBurst.current = raw;
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "." || e.key === "," || e.key === "\u066B") press(".");
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Delete") { setRaw(""); setTouched(true); playTap(); }
      else if (e.key === "ArrowUp") step(STEP_G);
      else if (e.key === "ArrowDown") step(-STEP_G);
      else if (e.key === "Enter") { if (ok) commit(val, false); else playWarning(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, raw, ok, val, press, step, commit, onClose]);

  if (!open) return null;

  /** ضغطُ الخلفية يُغلق ما دام لا مسوّدة؛ بعد الكتابة يرنّ زرّ الإغلاق بدلها —
   *  بالوضع الأفقي تبقى الخلفية مكشوفة تماماً حيث تُمسك اليد الجهاز. */
  const onBackdrop = () => {
    if (!touched) { onClose(); return; }
    playWarning();
    flashAlert({ kind: "close" });
    setRingClose(true);
    if (ringTimer.current) window.clearTimeout(ringTimer.current);
    ringTimer.current = window.setTimeout(() => setRingClose(false), 900);
  };

  const holdStop = () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    window.removeEventListener("pointerup", holdStop);
    window.removeEventListener("pointercancel", holdStop);
  };
  const holdStart = (deltaG: number) => {
    if (!step(deltaG)) return;
    let ticks = 0;
    const repeat = () => {
      ticks += 1;
      // بعد ثانيتين من الاستمرار تكبر الخطوة: الوصول من ٠.٢ إلى ٤ كغ لا يجوز
      // أن يكلّف ثمانين نبضة.
      if (!step(ticks > 14 ? deltaG * 5 : deltaG)) { holdStop(); return; }
      holdTimer.current = window.setTimeout(repeat, 110);
    };
    holdTimer.current = window.setTimeout(repeat, 500);
    // شبكةُ أمانٍ على النافذة: لو صار الزرّ معطَّلاً أو خرج الإصبع من الورقة،
    // ما يوصل pointerup للزرّ نفسه — والسلسلة تبقى تنبض بعد رفع اليد.
    window.addEventListener("pointerup", holdStop, { once: true });
    window.addEventListener("pointercancel", holdStop, { once: true });
  };

  const title = editing ? t("retail.weightEdit", "عدّل الوزن") : t("retail.wTitle", "اختر الوزن");
  const stockTxt = capped ? fmtKg(cap) : "";
  const subtitle = capped
    ? (editing
      ? t("retail.wSubEdit", { k: formatNum(perKg), s: stockTxt, c: fmtKg(current), defaultValue: "سعر الكيلو {{k}} · المتوفّر {{s}} كغ · الحالي {{c}} كغ" })
      : t("retail.wSub", { k: formatNum(perKg), s: stockTxt, defaultValue: "سعر الكيلو {{k}} · المتوفّر {{s}} كغ" }))
    : (editing
      ? t("retail.wSubFreeEdit", { k: formatNum(perKg), c: fmtKg(current), defaultValue: "سعر الكيلو {{k}} · الحالي {{c}} كغ" })
      : t("retail.wSubFree", { k: formatNum(perKg), defaultValue: "سعر الكيلو {{k}}" }));

  const alertTxt = over
    ? t("retail.wClamped", { n: fmtKg(cap), defaultValue: "المخزون لا يكفي — ستُضاف {{n}} كغ فقط" })
    : alert?.kind === "tile" ? t("retail.wTileOver", { n: fmtKg(alert.n ?? 0), defaultValue: "المتوفّر {{n}} كغ فقط — اختر وزناً أقل" })
    : alert?.kind === "close" ? t("retail.wCloseHint", "اضغط زر الإغلاق للخروج بلا إضافة")
    : "";

  const doneLabel = !ok ? t("retail.wPick", "اختر وزناً")
    : ret ? t("retail.wAddRet", { w: fmtKg(val), p: money(val * perKg), defaultValue: "أضف الراجع {{w}} كغ · {{p}}" })
    : editing ? t("retail.wUpdate", { w: fmtKg(val), p: money(val * perKg), defaultValue: "حدّث {{w}} كغ · {{p}}" })
    : t("retail.wAdd", { w: fmtKg(val), p: money(val * perKg), defaultValue: "أضف {{w}} كغ · {{p}}" });

  const wLabel = (kg: number) => (kg < 1
    ? t("retail.wGrams", { n: formatNum(kg * 1000), defaultValue: "{{n}} غ" })
    : t("retail.wKg", { n: fmtKg(kg), defaultValue: "{{n}} كغ" }));

  const stepBtn = (deltaG: number) => {
    const blocked = !ok || (deltaG < 0 ? val <= 0 : capped && val >= cap - 1e-9);
    return (
      <button
        type="button" data-wstep={deltaG} disabled={blocked}
        onPointerDown={() => holdStart(deltaG)} onPointerUp={holdStop} onPointerLeave={holdStop} onPointerCancel={holdStop}
        aria-label={deltaG > 0
          ? t("retail.wStepUp", { n: formatNum(STEP_G), defaultValue: "زد {{n}} غرام" })
          : t("retail.wStepDown", { n: formatNum(STEP_G), defaultValue: "أنقص {{n}} غرام" })}
        className="inline-flex h-14 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-sm font-extrabold tabular-nums text-ink transition hover:bg-surface-3 active:scale-[0.97] disabled:opacity-40"
      >
        {deltaG > 0 ? <Plus size={16} /> : <Minus size={16} />}
        {t("retail.wGrams", { n: formatNum(STEP_G), defaultValue: "{{n}} غ" })}
      </button>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end no-print"
      role="dialog" aria-modal="true" aria-label={title}
      // نافذةُ الخمول تبتلع اللمسة ولا تمرّرها: الجذر يغطّي الشاشة ويظلّ
      // ملتقطاً للأحداث، فيلتقطها ويرميها. (pointer-events-none كان يفعل
      // العكس تماماً — يجعل الورقة شفّافة فتنزل اللمسة على شبكة المنتجات
      // خلفها فيُضاف صنفٌ ثانٍ، وهو الخطر نفسه الذي جاءت النافذة لتمنعه.)
      onPointerDownCapture={inert ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
      onClickCapture={inert ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
    >
      <button type="button" aria-label={t("common.close", "إغلاق")} onClick={onBackdrop} className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />

      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}
        data-weightpad
        className="relative mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-4xl border border-b-0 border-line bg-surface-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-raised lg:max-w-4xl"
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line" />

        {/* الترويسة: هوية المنتج وسعر الكيلو والمتوفّر بسطرٍ واحد */}
        <div className="flex items-center gap-2.5 pb-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Scale size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink">{name}</p>
            <p className="truncate text-2xs font-semibold tabular-nums text-ink-muted">{subtitle}</p>
          </div>
          {ret && <span className="shrink-0 rounded-full bg-danger-50 px-2 py-0.5 text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("retail.retChip", "راجع")}</span>}
          <button
            type="button" onClick={onClose} aria-label={t("common.close", "إغلاق")}
            className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink", ringClose && "ring-2 ring-brand-500")}
          >
            <X size={20} />
          </button>
        </div>

        {/* الشاشة: الوزن كبيراً، ومعادلةُ السعر مكشوفة تحته */}
        <div
          role="status" aria-live="polite"
          className={cn("flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3",
            over ? "border-danger-300 bg-danger-50 dark:border-danger-500/40 dark:bg-danger-500/10" : "border-line bg-surface-2")}
        >
          <div className="min-w-0">
            <p className="flex items-baseline">
              <span data-wval className={cn("font-display text-4xl font-extrabold leading-none tabular-nums", touched ? "text-ink" : "text-ink-subtle")}>
                {over ? fmtKg(val) : touched ? (raw || "0") : fmtKg(val)}
              </span>
              <span className="ms-1 text-base font-bold text-ink-subtle">{t("retail.unitKg", "كغ")}</span>
            </p>
            {/* ترميزان لرقمٍ واحد بسطر: الغرامات تقتل لبس ٧٥٠ مقابل ٠.٧٥،
                والمعادلة تجعل الخطّية مرئيةً لا مُصدَّقة. */}
            <p className="mt-1 truncate text-2xs font-bold tabular-nums text-ink-subtle">
              {val > 0
                ? t("retail.wEcho", { g: formatNum(val * 1000), w: fmtKg(val), k: formatNum(perKg), p: money(val * perKg), defaultValue: "{{g}} غ · {{w}} × {{k}} = {{p}}" })
                : t("retail.wEchoEmpty", "اختر وزناً من الأزرار أو اكتبه بالأرقام")}
            </p>
          </div>
          <span className={cn("shrink-0 font-display text-2xl font-extrabold tabular-nums", ret ? "text-danger-700 dark:text-danger-300" : "text-ink")}>
            {money(val * perKg)}
          </span>
        </div>

        {(over || alert) && (
          <p role="status" className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-2xs font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">{alertTxt}</p>
        )}

        {/* الجسم: المربّعات أولاً (فتقع باليمين بالعربية) واللوحة ثانياً */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr),17rem]">
          <div>
            <div className="grid grid-cols-3 gap-2.5">
              {LADDER.map((kg) => {
                const blocked = capped && kg > cap + 1e-9;
                const isFlash = flash != null && Math.abs(flash - kg) < 1e-9;
                const selected = !isFlash && val > 0 && Math.abs(val - kg) < 1e-9;
                return (
                  <button
                    key={kg} type="button" data-wtile={kg} aria-disabled={blocked}
                    aria-label={t("retail.wTileAria", { w: wLabel(kg), p: money(kg * perKg), defaultValue: "{{w}} بسعر {{p}}" })}
                    onClick={() => {
                      if (blocked) { playWarning(); flashAlert({ kind: "tile", n: cap }); return; }
                      // بالبيع: ضغطةٌ واحدة تخلّص. بالراجع: تختار فقط، والتأكيد بالزر.
                      if (ret) { playTap(); seed(kg); return; }
                      commit(kg, true);
                    }}
                    className={cn("relative grid h-20 place-content-center rounded-2xl border-2 text-center transition active:scale-[0.97]",
                      isFlash ? (ret ? "border-danger-600 bg-danger-600 text-white" : "border-brand-600 bg-brand-600 text-white")
                        : selected ? (ret ? "border-danger-600 bg-danger-50 dark:bg-danger-500/15" : "border-brand-600 bg-brand-50 dark:bg-brand-500/15")
                          : blocked ? "cursor-not-allowed border-line bg-surface-2 opacity-45"
                            : "border-line bg-surface-1 hover:bg-surface-2")}
                  >
                    {selected && (
                      <span className={cn("absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-white", ret ? "bg-danger-600" : "bg-brand-600")}><Check size={12} /></span>
                    )}
                    <span className={cn("font-display text-2xl font-extrabold leading-none tabular-nums", isFlash && "text-white")}>
                      {kg < 1 ? formatNum(kg * 1000) : fmtKg(kg)}
                      <span className={cn("ms-1 text-xs font-bold", isFlash ? "text-white/80" : "text-ink-subtle")}>
                        {kg < 1 ? t("retail.unitG", "غ") : t("retail.unitKg", "كغ")}
                      </span>
                    </span>
                    <span className={cn("mt-1.5 block text-sm font-bold tabular-nums",
                      isFlash ? "text-white/85"
                        : blocked ? "text-ink-subtle line-through decoration-danger-400 decoration-2"
                          : ret ? "text-danger-700 dark:text-danger-300" : "text-brand-700 dark:text-brand-300")}>
                      {money(kg * perKg)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* اختصارات ثابتة المكان: «كل المتوفّر» يزرع ولا يبيع أبداً */}
            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              <button
                type="button" data-wall disabled={!capped || cap <= 0}
                onClick={() => { playTap(); seed(cap); }}
                aria-label={t("retail.wAllAria", { w: stockTxt, p: money(cap * perKg), defaultValue: "كل المتوفّر {{w}} كغ بسعر {{p}}" })}
                className="flex h-14 flex-col items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 transition hover:bg-amber-100 disabled:opacity-40 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <span className="text-sm font-extrabold">{t("retail.wAll", "كل المتوفّر")}</span>
                <span className="text-2xs font-bold tabular-nums">{capped ? t("retail.wKg", { n: stockTxt, defaultValue: "{{n}} كغ" }) : "—"}</span>
              </button>
              {stepBtn(-STEP_G)}
              {stepBtn(STEP_G)}
            </div>

            {ret && (
              <p className="mt-2 text-center text-2xs font-bold text-danger-700 dark:text-danger-300">{t("retail.wRetHint", "الراجع يحتاج تأكيد — اختر الوزن ثم اضغط الزر")}</p>
            )}
          </div>

          {/* لوحة الأرقام: كيلوات بفاصلة، وبلا أي حقلِ إدخالٍ يرفع كيبورد الآيباد */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xs font-bold text-ink-subtle">{t("retail.wPadLabel", "اكتب الوزن بالكيلو")}</span>
              <button type="button" data-wclear onClick={() => { playTap(); setRaw(""); setTouched(true); }} className="h-8 rounded-lg px-3 text-2xs font-bold text-ink-subtle transition hover:bg-surface-2">
                {t("common.clear", "مسح")}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button key={k} type="button" data-wkey={k} onClick={() => press(k)}
                  className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-xl font-extrabold text-ink transition hover:bg-surface-2 active:bg-surface-3">
                  {formatNum(Number(k))}
                </button>
              ))}
              <button type="button" data-wkey="." onClick={() => press(".")}
                className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-2xl font-extrabold text-ink transition hover:bg-surface-2 active:bg-surface-3">
                .
              </button>
              <button type="button" data-wkey="0" onClick={() => press("0")}
                className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-xl font-extrabold text-ink transition hover:bg-surface-2 active:bg-surface-3">
                {formatNum(0)}
              </button>
              <button type="button" data-wback onClick={() => press("back")}
                className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition hover:bg-surface-2 active:bg-surface-3">
                <Delete size={20} className="rtl:rotate-180" />
              </button>
            </div>
          </div>
        </div>

        {/* الزر يحمل النتيجة لا الفعل: آخرُ ما تحت الإبهام يقول ماذا سيحدث */}
        <Button
          data-wdone className="mt-3 w-full" style={{ minHeight: 56 }}
          leftIcon={<Check size={20} />} variant={ret ? "danger" : "primary"}
          disabled={!ok} onClick={() => commit(val, false)}
        >
          {doneLabel}
        </Button>
      </motion.div>
    </div>,
    document.body,
  );
}
