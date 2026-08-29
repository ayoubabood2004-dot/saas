import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { X, Delete, Check } from "lucide-react";
import { cn, formatDec } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * NumberPadSheet — رقمٌ واحد يُدخَل بالضغط لا بالكيبورد.
 *
 * كيبورد الآيباد يقلب نصف الشاشة ويغطّي ما ينظر إليه الطبيب، ثم يحتاج ضغطةً
 * لإغلاقه. وهذا الملف **ما بيه ولا حقل إدخالٍ واحد** — ضمانٌ ميكانيكيّ أن
 * كيبورد النظام لا يقدر يطلع فوق الورقة، لا حيلةَ blur ولا سباق تركيز
 * (نفس مبدأ WeightPicker بشاشة البيع).
 *
 * ورقةٌ واحدة تخدم أربعة أرقام: الوزن، وملغ/كغ، وعيار العبوة، وأيام العلاج —
 * فالطبيب يتعلّم لوحةً واحدة لا أربعاً.
 *
 * الحارس (band) ينبّه ولا يصحّح: يلوّن الرقم ويطلب ضغطةً ثانية، ولا يعدّل ما
 * كتبه الطبيب ولا يقترح رقماً — الوزن والجرعة بياناتٌ سريرية، والتخمين فيها
 * أسوأ من السؤال.
 * ==========================================================================*/

export function NumberPadSheet({
  open, title, unit, initial, decimals = true, min = 0, max = 100000,
  contextLine, band, bandWarn, history, confirmLabel, onClose, onSubmit, extra,
}: {
  open: boolean;
  title: string;
  /** وحدة القياس المعروضة بجانب الرقم («كغ»، «ملغ/كغ»، «يوم»…). */
  unit: string;
  initial?: number;
  /** يقبل الكسور؟ الأيام لا تقبل. */
  decimals?: boolean;
  min?: number;
  max?: number;
  /** سطرٌ يشرح السياق فوق الرقم (نافذة الدليل مثلاً). */
  contextLine?: string;
  /** مدى المعقولية — خارجه يُطلب تأكيدٌ ثانٍ، ولا يُعدَّل الرقم أبداً. */
  band?: { min: number; max: number };
  /** نصّ التحذير حين يخرج الرقم عن المدى. */
  bandWarn?: string;
  /** قيمٌ حقيقية مسجَّلة تُزرع بالشاشة بضغطة (آخر وزن مثلاً) — تزرع ولا تؤكّد. */
  history?: { label: string; value: number }[];
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (n: number) => void;
  /** عنصرٌ إضافي فوق زر التأكيد (مثل مبدّل «سجّله بملف الحيوان»). */
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const [odd, setOdd] = useState(false); // خرج عن المدى وينتظر ضغطةً ثانية

  useEffect(() => {
    if (!open) return;
    setRaw(initial && initial > 0 ? String(initial) : "");
    setTouched(false);
    setOdd(false);
  }, [open, initial]);

  /* الهروب يُلتقط قبل أن يصعد: مودال المعالج يسمع Escape على نفس العقدة
   * بمرحلة الفقاعة، فبلا التقاطٍ هنا كانت ضغطةٌ واحدة تغلق المعالج كلّه. */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, onClose]);

  if (!open) return null;

  const val = Math.round((Number(raw) || 0) * 1000) / 1000;
  const ok = val >= Math.max(min, 0.0001) && val <= max;
  const outOfBand = !!band && val > 0 && (val < band.min || val > band.max);

  const press = (k: string) => {
    setTouched(true);
    setOdd(false);
    setRaw((r0) => {
      const r = touched ? r0 : "";
      if (k === "back") { playTap(); return r.slice(0, -1); }
      if (k === ".") {
        if (!decimals || r.includes(".")) { playWarning(); return r; }
        playTap();
        return r === "" ? "0." : `${r}.`;
      }
      const dot = r.indexOf(".");
      if (dot >= 0 && r.length - dot - 1 >= 2) { playWarning(); return r; }
      if (r.length >= 6) { playWarning(); return r; }
      const next = (r + k).replace(/^0+(?=\d)/, "");
      if ((Number(next) || 0) > max) { playWarning(); return r; }
      playTap();
      return next;
    });
  };

  const confirm = () => {
    if (!ok) { playWarning(); return; }
    if (outOfBand && !odd) { playWarning(); setOdd(true); return; }
    onSubmit(val);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end no-print" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("common.close", "إغلاق")} onClick={onClose} className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}
        data-numpad
        className="relative mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-4xl border border-b-0 border-line bg-surface-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-raised"
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line" />

        <div className="flex items-start gap-2 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-ink">{title}</p>
            {contextLine && <p className="mt-0.5 text-2xs font-bold text-ink-subtle">{contextLine}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close", "إغلاق")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2"><X size={19} /></button>
        </div>

        {/* الرقم كبيراً — يلوّن بالتحذير خارج المدى، ولا يُصحَّح أبداً */}
        <div className={cn("rounded-2xl border-2 px-4 py-3 text-center", outOfBand ? "border-warn-300 bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10" : "border-line bg-surface-2")}>
          <span className={cn("font-display text-4xl font-black leading-none tabular-nums", outOfBand ? "text-warn-700 dark:text-warn-300" : touched ? "text-ink" : "text-ink-subtle")}>
            {touched ? (raw || "0") : (initial && initial > 0 ? formatDec(initial) : "—")}
          </span>
          <span className="ms-1.5 text-base font-bold text-ink-subtle">{unit}</span>
        </div>
        {outOfBand && bandWarn && (
          <p className="mt-1.5 rounded-xl bg-warn-50 px-3 py-1.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/10 dark:text-warn-300">{bandWarn}</p>
        )}

        {/* قيمٌ مسجَّلة حقيقية — تزرع الشاشة ولا تؤكّد */}
        {history && history.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {history.map((h) => (
              <button key={h.label} type="button" onClick={() => { playTap(); setTouched(true); setOdd(false); setRaw(String(h.value)); }}
                className="h-11 rounded-2xl border-2 border-dashed border-brand-300 px-3 text-xs font-extrabold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10">
                {h.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
            <button key={k} type="button" data-padkey={k} onClick={() => press(k)}
              className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-2xl font-black tabular-nums text-ink transition hover:bg-surface-2 active:bg-surface-3">
              {k}
            </button>
          ))}
          <button type="button" data-padkey="." disabled={!decimals} onClick={() => press(".")}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-2xl font-black text-ink transition hover:bg-surface-2 disabled:opacity-30">
            .
          </button>
          <button type="button" data-padkey="0" onClick={() => press("0")}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 font-display text-2xl font-black tabular-nums text-ink transition hover:bg-surface-2 active:bg-surface-3">
            0
          </button>
          <button type="button" data-padback onClick={() => press("back")} aria-label={t("common.clear", "مسح")}
            className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition hover:bg-surface-2 active:bg-surface-3">
            <Delete size={22} className="rtl:rotate-180" />
          </button>
        </div>

        {extra}

        <button type="button" data-padconfirm disabled={!ok} onClick={confirm}
          className={cn("mt-2.5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-black text-white shadow-soft transition",
            !ok ? "cursor-not-allowed bg-surface-3 text-ink-subtle" : odd ? "bg-warn-600 hover:bg-warn-700" : "bg-brand-600 hover:bg-brand-700")}>
          <Check size={19} /> {odd && bandWarn ? bandWarn : (confirmLabel ?? t("tplan.padConfirm", "تم"))}
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}
