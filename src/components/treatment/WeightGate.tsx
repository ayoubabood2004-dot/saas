import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Scale, Delete, Check } from "lucide-react";
import type { Species, WeightLog } from "@/types";
import { repo } from "@/lib/repo";
import { useToast } from "@/components/ui";
import { cn, formatDec, formatDate } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * WeightGate — الوزن سؤالٌ لا حقلٌ جانبيّ.
 *
 * كان شريطاً بنفسجياً هادئاً بحقل رقمٍ صغير، وحين يكون فارغاً («—») تنهار
 * الشاشة كلها بصمت إلى الكتابة اليدوية: كل جرعةٍ تُحسب من الوزن، فغيابه
 * يُعطّل الميزة الأساسية بلا أن يقول ذلك. صار بطاقةً كهرمانية بلوحة أرقامٍ
 * **ظاهرة أصلاً** — الوزن الحقيقي يكلّف ضغطتين لا ثلاثاً.
 *
 * والحارس ينبّه ولا يخمّن: لا متوسّطَ نوعٍ ولا رقمَ مقترح ولا قصّ. القيم
 * المعروضة هي أوزانُ هذا الحيوان المسجَّلة وحدها، ومعها تواريخها — والضغط
 * عليها **يزرع** الرقم ولا يؤكّده.
 * ==========================================================================*/

/** مدى معقولية لكل نوع — للتنبيه فقط، لا يُعدَّل به رقمٌ أبداً. */
const BANDS: Record<string, { min: number; max: number }> = {
  dog: { min: 0.3, max: 90 }, cat: { min: 0.1, max: 12 }, rabbit: { min: 0.3, max: 8 },
  bird: { min: 0.02, max: 3 }, horse: { min: 40, max: 800 }, cow: { min: 20, max: 1000 },
};
const bandFor = (sp?: Species) => (sp && BANDS[sp]) || { min: 0.02, max: 1000 };

export function WeightGate({ species, speciesLabel, petId, lang, onConfirm, onSkip }: {
  species?: Species;
  speciesLabel: string;
  petId?: string;
  lang: string;
  onConfirm: (kg: number, savedToChart: boolean) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [odd, setOdd] = useState(false);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<WeightLog[]>([]);

  useEffect(() => {
    if (!petId) return;
    let alive = true;
    repo.listWeights(petId)
      .then((r) => { if (alive) setLogs([...r].sort((a, b) => (b.measured_at ?? "").localeCompare(a.measured_at ?? "")).slice(0, 2)); })
      .catch(() => { /* التاريخ إضافة، لا يعطّل البوابة */ });
    return () => { alive = false; };
  }, [petId]);

  const band = useMemo(() => bandFor(species), [species]);
  const val = Math.round((Number(raw) || 0) * 1000) / 1000;
  const ok = val > 0;
  const outside = ok && (val < band.min || val > band.max);

  const press = (k: string) => {
    setOdd(false);
    setRaw((r) => {
      if (k === "back") { playTap(); return r.slice(0, -1); }
      if (k === ".") { if (r.includes(".")) { playWarning(); return r; } playTap(); return r === "" ? "0." : `${r}.`; }
      const dot = r.indexOf(".");
      if (dot >= 0 && r.length - dot - 1 >= 2) { playWarning(); return r; }
      if (r.length >= 6) { playWarning(); return r; }
      const next = (r + k).replace(/^0+(?=\d)/, "");
      if ((Number(next) || 0) > 2000) { playWarning(); return r; }
      playTap();
      return next;
    });
  };

  const confirm = async () => {
    if (!ok || busy) return;
    if (outside && !odd) { playWarning(); setOdd(true); return; }
    let saved = false;
    if (save && petId) {
      setBusy(true);
      try {
        await repo.addWeight(petId, val);
        saved = true;
        playSuccess();
        toast.success(t("tplan.weightSaved", "انحفظ الوزن بملف الحيوان"));
      } catch {
        // الوزن يبقى محلياً فتُحسب الجرعات — الفشل بالحفظ لا يعطّل الخطة.
        toast.error(t("tplan.weightSaveFail", "ما انحفظ بالملف — الجرعات تنحسب بهالزيارة"));
      } finally { setBusy(false); }
    }
    onConfirm(val, saved);
  };

  return (
    <div data-weightgate className="rounded-3xl border-2 border-warn-300 bg-warn-50 p-4 dark:border-warn-500/40 dark:bg-warn-500/10">
      <div className="flex items-center gap-2">
        <Scale size={22} className="shrink-0 text-warn-700 dark:text-warn-300" />
        <h3 className="text-lg font-black text-ink">{t("tplan.weightGate", "شكد وزن الحيوان؟")}</h3>
      </div>
      <p className="mt-0.5 text-sm font-semibold text-ink-muted">{t("tplan.weightGateWhy", "بلا وزن ما تنحسب أي جرعة تلقائياً")}</p>

      <div className={cn("my-3 text-center text-4xl font-black tabular-nums", outside ? "text-warn-700 dark:text-warn-300" : "text-ink")}>
        {raw || "—"} <span className="text-lg font-extrabold text-ink-muted">{t("tplan.kg", "كغ")}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
          <button key={k} type="button" data-wgkey={k} onClick={() => press(k)}
            className="h-14 rounded-2xl border border-line bg-surface-1 text-2xl font-black tabular-nums text-ink transition active:bg-warn-100 dark:active:bg-warn-500/20">{k}</button>
        ))}
        <button type="button" data-wgkey="." onClick={() => press(".")} className="h-14 rounded-2xl border border-line bg-surface-1 text-2xl font-black text-ink transition active:bg-warn-100 dark:active:bg-warn-500/20">.</button>
        <button type="button" data-wgkey="0" onClick={() => press("0")} className="h-14 rounded-2xl border border-line bg-surface-1 text-2xl font-black tabular-nums text-ink transition active:bg-warn-100 dark:active:bg-warn-500/20">0</button>
        <button type="button" data-wgback onClick={() => press("back")} aria-label={t("common.clear", "مسح")}
          className="grid h-14 place-items-center rounded-2xl border border-line bg-surface-1 text-ink-subtle transition active:bg-warn-100 dark:active:bg-warn-500/20"><Delete size={22} className="rtl:rotate-180" /></button>
      </div>

      {/* أوزانٌ مسجَّلة حقيقية — تزرع اللوحة ولا تؤكّد، ومعها تواريخها */}
      {logs.map((w) => (
        <button key={w.id} type="button" onClick={() => { playTap(); setRaw(String(w.weight_kg)); setOdd(false); }}
          className="mt-2 h-14 w-full rounded-2xl border-2 border-dashed border-warn-300 px-3 text-start text-sm font-extrabold text-warn-700 transition hover:bg-warn-100 dark:border-warn-500/40 dark:text-warn-300 dark:hover:bg-warn-500/15">
          {t("tplan.lastWeight", { w: formatDec(w.weight_kg), d: formatDate(w.measured_at, lang), defaultValue: "آخر وزن مسجّل {{w}} كغ — {{d}}" })}
        </button>
      ))}

      {petId && (
        <button type="button" onClick={() => { playTap(); setSave((v) => !v); }}
          className="mt-2 flex h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink">
          {t("tplan.saveToChart", "سجّله بملف الحيوان")}
          <span className={cn("grid h-6 w-11 items-center rounded-full p-0.5 transition", save ? "bg-brand-600" : "bg-line-strong")}>
            <span className={cn("h-5 w-5 rounded-full bg-white shadow transition-transform", save ? "translate-x-0 rtl:-translate-x-5" : "translate-x-5 rtl:translate-x-0")} />
          </span>
        </button>
      )}

      <button type="button" data-wgconfirm disabled={!ok || busy} onClick={() => void confirm()}
        className={cn("mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-black text-white shadow-soft transition",
          !ok ? "cursor-not-allowed bg-surface-3 text-ink-subtle" : "bg-warn-600 hover:bg-warn-700")}>
        <Check size={19} />
        {odd
          ? t("tplan.weightOdd", { w: formatDec(val), sp: speciesLabel, defaultValue: "متأكد؟ {{w}} كغ لـ{{sp}} — اضغط مرة ثانية" })
          : t("tplan.weightSave", "تم — احسب الجرعات")}
      </button>

      <button type="button" onClick={() => { playTap(); onSkip(); }} className="mt-1.5 h-11 w-full text-sm font-bold text-ink-subtle underline transition hover:text-ink">
        {t("tplan.weightSkip", "ما أعرف الوزن — أكتب الجرعات يدوياً")}
      </button>
    </div>
  );
}
