import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pill, Syringe, Eye, Hand, ChevronDown, Lock, BookOpen, Beaker, Calculator, Scale, Plus, Trash2, RefreshCw,
} from "lucide-react";
import type { Species } from "@/types";
import type { ChartFlags } from "@/lib/problems";
import {
  matchMonograph, doseFor, calcDose, checkSafety, hasBlocking, appFreqHours,
  APP_ROUTE, CLASS_LABEL, ROUTE_LABEL, FREQ_LABEL, isBannedFor, type DoseAlert,
} from "@/lib/vetFormulary";
import { DoseAlertRow, type DosePatch } from "@/components/DoseBlock";
import { NumberPadSheet } from "./NumberPadSheet";
import { cn, formatNum, formatDec } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * DrugCard — الوصفة تُقرأ جملةً، وتُعدَّل بالضغط على كلماتها.
 *
 * كان السطر نموذجَ إدخالٍ: حقلُ اسم، ومبدّلُ وضع، وحقلُ ملغ/كغ، وحقلُ تركيز،
 * وستّ رقاقات طريق، وخمس رقاقات تكرار، وحقلُ أيام — صناديقُ ملوّنة داخل
 * صناديق. صار بطاقةً تُقرأ بنظرة: الاسم، **وكم يُسحب فعلاً** بأكبر خطّ،
 * وبأيّ طريق وكم مرّة وكم يوم — وكل كلمةٍ منها زرُّ تعديلها.
 *
 * ثلاث قواعد سلامةٍ مبنيّة بالتركيب لا بالانضباط:
 *  ١) **الرقم لا يُلوَّن أبداً.** اللون معناه الحالة دائماً، فلو لبس الجواب
 *     لوناً ضاع الفرق بين «هذا هو المقدار» و«هذا آمن».
 *  ٢) **البطاقة لا تنطوي وفيها تحذير.** الانطواء وعدٌ بأن checkSafety ما
 *     رجّع شيئاً فوق info؛ والاستثناء الوحيد «ما في جرعة موثّقة» بعد أن
 *     يجيب الطبيب بجرعةٍ يدوية — وتحذيرها يبقى مطبوعاً على البطاقة المطويّة.
 *  ٣) **كل بلاطة جرعة تطبع ملغ/كغ تحتها.** فمستحيلٌ تركيبياً أن تُختار جرعةٌ
 *     جاهزة بلا أن يرى الطبيب المعدّل الذي التزم به.
 * ==========================================================================*/

export interface DrugRow {
  id: string; name: string; dose: string; mgPerKg?: number; freq: string; days: number;
  note?: string; route?: string; doseMode?: "weight" | "manual";
  strength?: number; solid?: boolean; strengthConfirmed?: boolean;
}

const QTYS = ["¼", "½", "¾", "1", "1.5", "2", "3", "5", "10"];
const UNIT_KEYS: { key: string; def: string; solid?: boolean }[] = [
  { key: "tplan.unitTablet", def: "\u062d\u0628\u0629", solid: true },
  { key: "tplan.unitMl", def: "\u0645\u0644", solid: false },
  { key: "tplan.unitDrop", def: "\u0642\u0637\u0631\u0629" },
  { key: "tplan.unitSpray", def: "\u0628\u062e\u0651\u0629" },
  { key: "tplan.unitSachet", def: "\u0643\u064a\u0633" },
  { key: "tplan.unitAmp", def: "\u0623\u0645\u0628\u0648\u0644\u0629", solid: false },
  { key: "tplan.unitUnit", def: "\u0648\u062d\u062f\u0629" },
];

/** خطوة المؤشّر تُشتقّ من عرض النافذة، لا ثابتة: نافذة الميلوكسيكام للقطة
 *  ٠٫٠٥–٠٫١، وخطوةٌ ثابتة بـ٠٫٥ تساوي خمسة أضعاف النافذة كلها. */
const STEP_LADDER = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const stepFor = (min?: number, max?: number): number => {
  if (min === undefined || max === undefined) return 0.5;
  const span = (max - min) / 6;
  let s = 0.01;
  for (const v of STEP_LADDER) if (v <= span) s = v;
  return s;
};

/** نصّ الجرعة اليدوية = «كمية وحدة». يُفصَل بأول فراغٍ فقط، فتبقى الوحدة
 *  المركّبة سليمة. والمطابقة بالرمز الكامل لا بالبادئة: «1» بادئةُ «1.5»،
 *  فبلاطتان كانتا تُضيئان معاً على اختيارٍ واحد. */
const doseParts = (dose: string): { qty: string; unit: string } => {
  const s = dose.trim();
  if (!s) return { qty: "", unit: "" };
  const i = s.indexOf(" ");
  return i < 0 ? { qty: s, unit: "" } : { qty: s.slice(0, i), unit: s.slice(i + 1).trim() };
};

const ROUTE_ICON = (route?: string) =>
  route === "sc" || route === "im" || route === "iv" ? Syringe
    : route === "eye_ear" ? Eye
      : route === "topical" ? Hand
        : Pill;

export function DrugCard({
  row, species, weight, flags, allergies, concurrent, planDays, stockN,
  routes, freqs, open, locked: lockedProp, onToggle, onPatch, onRemove, onReplace, onNeedWeight,
}: {
  row: DrugRow;
  species?: Species;
  weight?: number;
  flags?: ChartFlags;
  allergies?: string[];
  concurrent: string[];
  planDays: number;
  stockN?: number;
  routes: { id: string; key: string; label: string }[];
  freqs: { id: string; key: string; label: string; perDay: number }[];
  open: boolean;
  locked?: boolean;
  onToggle: () => void;
  onPatch: (p: DosePatch & { note?: string; days?: number; strengthConfirmed?: boolean }) => void;
  onRemove: () => void;
  onReplace: () => void;
  onNeedWeight: () => void;
}) {
  const { t } = useTranslation();
  const [pad, setPad] = useState<null | "rate" | "strength" | "days">(null);
  const [freeText, setFreeText] = useState(false);
  const [noteOn, setNoteOn] = useState(false);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);

  const mono = useMemo(() => matchMonograph(row.name), [row.name]);
  const win = mono && species ? doseFor(mono, species) : undefined;
  const isSolid = row.solid ?? mono?.solid ?? false;
  const banned = mono && species ? isBannedFor(mono, species) : undefined;

  const calc = useMemo(() => {
    if (!row.mgPerKg || !weight) return undefined;
    return calcDose({ mgPerKg: row.mgPerKg, weightKg: weight, strength: row.strength, solid: isSolid, freq: appFreqHours(row.freq) });
  }, [row.mgPerKg, weight, row.strength, isSolid, row.freq]);

  const alerts = useMemo<DoseAlert[]>(() => {
    if (!mono || !species) return [];
    if (!row.mgPerKg) return checkSafety({ drug: mono, species, mgPerKg: 0, allergies, flags, concurrent });
    return checkSafety({
      drug: mono, species, weightKg: weight, mgPerKg: row.mgPerKg,
      route: row.route ? APP_ROUTE[row.route] : undefined,
      freq: appFreqHours(row.freq), allergies, flags, concurrent,
    });
  }, [mono, species, weight, row.mgPerKg, row.route, row.freq, allergies, flags, concurrent]);

  const manual = row.doseMode === "manual" || (!win && !!row.dose.trim()) || (!weight && !!row.dose.trim());
  const noWindowAnswered = !win && !!row.dose.trim();
  const criticalOpen = alerts.some((a) => a.tone === "critical");
  const warnOpen = alerts.some((a) => a.tone === "warn" && !(a.id === "no-window" && noWindowAnswered));
  const locked = lockedProp ?? (criticalOpen || warnOpen);
  const expanded = open || locked;

  /* العمود الجانبي — لونٌ واحد يقول حالة الوصفة بلا كلمة. */
  const spine = criticalOpen ? "bg-danger-500"
    : (warnOpen || manual || !win || row.strength === undefined) ? "bg-warn-500"
      : (row.mgPerKg && weight) ? "bg-success-500" : "bg-line";

  const step = stepFor(win?.min, win?.max);
  const topRate = win ? Math.min(win.max, win.hardMax ?? Infinity) : undefined;
  const inWindow = !!win && row.mgPerKg !== undefined && row.mgPerKg >= win.min && row.mgPerKg <= win.max;
  const overHard = !!win?.hardMax && row.mgPerKg !== undefined && row.mgPerKg > win.hardMax;

  const bump = (d: number) => {
    const next = Math.round(Math.max(0.001, (row.mgPerKg ?? win?.typical ?? step) + d) * 1000) / 1000;
    playTap();
    onPatch({ doseMode: "weight", mgPerKg: next, dose: "" });
  };

  const ring = (g: string) => focusGroup === g && "ring-2 ring-brand-400 ring-offset-2 ring-offset-surface-1";
  const jumpTo = (g: string) => { playTap(); if (!open) onToggle(); setFocusGroup(g); window.setTimeout(() => setFocusGroup(null), 700); };

  /** بلاطة جرعة: تحمل ما يُسحب فعلاً، وتحته ملغ/كغ دائماً. */
  const doseTile = (rate: number, kicker: string, ceiling: boolean) => {
    const c = weight ? calcDose({ mgPerKg: rate, weightKg: weight, strength: row.strength, solid: isSolid, freq: appFreqHours(row.freq) }) : undefined;
    const big = c?.mlRounded !== undefined ? `${formatDec(c.mlRounded)} ${t("tplan.mlUnit", "مل")}`
      : c?.tabletsLabel ? c.tabletsLabel
        : c ? `${formatDec(Math.round(c.mg * 100) / 100)} ${t("tplan.mgUnit", "ملغ")}` : "—";
    const on = row.mgPerKg !== undefined && Math.abs(row.mgPerKg - rate) < 1e-9;
    return (
      <button type="button" data-dosetile={rate} onClick={() => { playTap(); onPatch({ doseMode: "weight", mgPerKg: rate, dose: "" }); }}
        className={cn("min-h-[86px] rounded-2xl border-2 p-2 text-center transition active:scale-[0.98]",
          on ? "border-brand-600 bg-brand-600 text-white shadow-soft"
            : ceiling ? "border-warn-300 bg-warn-50 text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-300"
              : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
        <span className="block text-[10px] font-black uppercase opacity-80">{kicker}</span>
        <span className="mt-0.5 block text-xl font-black tabular-nums">{big}</span>
        <span className="mt-0.5 block text-[10px] font-bold tabular-nums opacity-80">
          {t("tplan.tileMath", { mg: c ? formatDec(Math.round(c.mg * 100) / 100) : "—", rate: formatDec(rate), defaultValue: "{{mg}} ملغ · {{rate}} ملغ/كغ" })}
        </span>
        {ceiling && win?.hardMaxReason && <span className="mt-0.5 block line-clamp-2 text-[10px] font-bold">{win.hardMaxReason}</span>}
      </button>
    );
  };

  const RouteIcon = ROUTE_ICON(row.route);
  const routeWord = routes.find((x) => x.id === row.route);
  const freqWord = freqs.find((x) => x.id === row.freq);
  const perDay = freqWord?.perDay ?? 0;
  const doses = perDay > 0 ? perDay * Math.max(0, row.days) : 0;

  return (
    <div className={cn("relative overflow-hidden rounded-3xl border bg-surface-1 shadow-card", hasBlocking(alerts) ? "border-danger-300 dark:border-danger-500/40" : "border-line")}>
      <span aria-hidden className={cn("absolute inset-y-3 start-0 w-1 rounded-full", spine)} />

      {/* ── الصف ١: الهوية ── */}
      <button type="button" data-drugcardhead={row.id}
        onClick={() => { playTap(); if (!locked || open) onToggle(); }}
        className="flex w-full items-center gap-2.5 py-2.5 pe-2 ps-4 text-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><RouteIcon size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-black leading-tight text-ink">{mono?.ar ?? row.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-2xs font-bold text-ink-subtle">
            {mono?.ar && mono.ar !== row.name && <span className="truncate">{row.name}</span>}
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
              {mono ? CLASS_LABEL[mono.klass] : t("tplan.notInFormulary", "مو بالدليل الدوائي")}
            </span>
          </span>
        </span>
        {stockN != null && <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-black text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("tplan.inStockN", { n: formatNum(stockN), defaultValue: "✓ متوفّر · {{n}}" })}</span>}
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle">
          {locked && !open ? <Lock size={16} /> : <ChevronDown size={18} className={cn("transition-transform duration-200", expanded && "rotate-180")} />}
        </span>
      </button>

      {/* ── الصف ٢: الجواب + كلمات الجملة ── */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 pb-2 pe-3.5 ps-4">
        {!weight && !manual ? (
          <button type="button" onClick={onNeedWeight} className="inline-flex h-14 items-center gap-2 rounded-2xl bg-warn-500 px-4 text-sm font-black text-white shadow-soft">
            <Scale size={18} /> {t("tplan.needWeightHere", "أدخل الوزن ليُحسب")}
          </button>
        ) : manual && row.dose.trim() ? (
          <span className="text-[22px] font-black leading-none text-ink">{row.dose.trim()}</span>
        ) : calc?.mlRounded !== undefined ? (
          <motion.span key={`ml-${calc.mlRounded}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="flex items-end gap-1">
            <span className="text-[32px] font-black leading-none tabular-nums text-ink">{formatDec(calc.mlRounded)}</span>
            <span className="text-base font-extrabold text-ink-muted">{t("tplan.mlUnit", "مل")}</span>
          </motion.span>
        ) : calc?.tabletsLabel ? (
          <motion.span key={`tab-${calc.tabletsLabel}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="text-[26px] font-black leading-none text-ink">{calc.tabletsLabel}</motion.span>
        ) : calc ? (
          <motion.span key={`mg-${calc.mg}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="flex items-end gap-1">
            <span className="text-[32px] font-black leading-none tabular-nums text-ink">{formatDec(Math.round(calc.mg * 100) / 100)}</span>
            <span className="text-base font-extrabold text-ink-muted">{t("tplan.mgUnit", "ملغ")}</span>
          </motion.span>
        ) : (
          <button type="button" onClick={() => jumpTo("dose")} className="inline-flex h-14 items-center gap-2 rounded-2xl border-2 border-brand-300 bg-brand-50 px-4 text-sm font-black text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <Calculator size={18} /> {t("tplan.pickDose", "اختر الجرعة")}
          </button>
        )}

        <span className="ms-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => jumpTo("route")} className={cn("inline-flex h-11 items-center rounded-xl px-3 text-[13px] font-extrabold transition", routeWord ? "bg-surface-2 text-ink hover:bg-brand-50 dark:hover:bg-brand-500/10" : "border border-dashed border-line text-ink-subtle")}>
            {routeWord ? t(routeWord.key, routeWord.label) : t("tplan.pickRoute", "طريقة الإعطاء")}
          </button>
          <button type="button" onClick={() => jumpTo("freq")} className={cn("inline-flex h-11 items-center rounded-xl px-3 text-[13px] font-extrabold transition", freqWord ? "bg-surface-2 text-ink hover:bg-brand-50 dark:hover:bg-brand-500/10" : "border border-dashed border-line text-ink-subtle")}>
            {freqWord ? t(freqWord.key, freqWord.label) : t("tplan.pickFreq", "التكرار")}
          </button>
          {row.freq !== "prn" && (
            <button type="button" onClick={() => jumpTo("days")} className="inline-flex h-11 items-center rounded-xl bg-surface-2 px-3 text-[13px] font-extrabold text-ink transition hover:bg-brand-50 dark:hover:bg-brand-500/10">
              {t("tplan.forDays", { n: formatNum(row.days), defaultValue: "لمدة {{n}} يوم" })}
            </button>
          )}
        </span>
      </div>

      {/* ── الصف ٣: من أين جاء هذا الرقم — أرقامٌ دائماً ── */}
      <div className="px-4 pb-3">
        {manual ? (
          <span className="inline-block rounded-lg bg-surface-2 px-2 py-1 text-xs font-black text-ink-muted">{t("tplan.provManual", "جرعة يدوية — بلا حساب بالوزن")}</span>
        ) : !win ? (
          <span className="inline-block rounded-lg bg-warn-50 px-2 py-1 text-xs font-black text-warn-700 dark:bg-warn-500/10 dark:text-warn-300">{t("tplan.provNoWindow", "ما في جرعة موثّقة لهذا النوع — الجرعة يدوية")}</span>
        ) : row.mgPerKg === undefined ? null : (
          <span className={cn("inline-block rounded-lg px-2 py-1 text-xs font-black tabular-nums", inWindow ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-300")}>
            {inWindow
              ? t("tplan.provIn", { d: formatDec(row.mgPerKg), min: formatDec(win.min), max: formatDec(win.max), defaultValue: "{{d}} ملغ/كغ · الدليل {{min}}–{{max}} ملغ/كغ" })
              : t("tplan.provOut", { d: formatDec(row.mgPerKg), min: formatDec(win.min), max: formatDec(win.max), defaultValue: "{{d}} ملغ/كغ · خارج الدليل {{min}}–{{max}}" })}
          </span>
        )}
        {!manual && row.mgPerKg !== undefined && (
          <button type="button" onClick={() => jumpTo("strength")} className={cn("mt-1 flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold",
            row.strength === undefined ? "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-300"
              : row.strengthConfirmed ? "text-ink-subtle underline decoration-dotted"
                : "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-300")}>
            {row.strength === undefined
              ? t("tplan.noStrengthYet", "ما محدّد عيار — الكمية بالملغ فقط")
              : row.strengthConfirmed
                ? t("tplan.strengthAt", { n: formatDec(row.strength), u: isSolid ? t("tplan.mgPerTab", "ملغ/حبة") : t("tplan.mgPerMl", "ملغ/مل"), defaultValue: "@ {{n}} {{u}} — بدّل" })
                : t("tplan.strengthUnconfirmed", { n: formatDec(row.strength), u: isSolid ? t("tplan.mgPerTab", "ملغ/حبة") : t("tplan.mgPerMl", "ملغ/مل"), defaultValue: "@ {{n}} {{u}} — أكّد العيار" })}
          </button>
        )}
      </div>

      {/* ── الصف ٤: الضمير — التحذيرات تبقى مطبوعة حتى على المطويّة ── */}
      {!expanded && alerts.some((a) => a.tone === "warn" || a.tone === "critical") && (
        <div className="space-y-1.5 px-4 pb-3.5">
          {alerts.filter((a) => a.tone === "warn" || a.tone === "critical").map((a) => <DoseAlertRow key={a.id} alert={a} />)}
        </div>
      )}

      {/* ── المفتوحة ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="overflow-hidden">
            <div className="space-y-3.5 border-t border-line/70 py-3.5 pe-3.5 ps-4">

              {/* نافذة الدليل — بلا صندوق */}
              {mono && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <BookOpen size={14} className="shrink-0 text-brand-600 dark:text-brand-300" />
                  <span className="text-sm font-black text-ink">{mono.ar}</span>
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">{CLASS_LABEL[mono.klass]}</span>
                  {win ? (
                    <span className="text-xs font-bold tabular-nums text-ink-muted">
                      {t("tplan.windowLine", { min: formatDec(win.min), max: formatDec(win.max), freq: FREQ_LABEL[win.freq], routes: win.routes.map((r) => ROUTE_LABEL[r]).join("/"), defaultValue: "الدليل {{min}}–{{max}} ملغ/كغ · {{freq}} · {{routes}}" })}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-warn-700 dark:text-warn-300">{t("tplan.noWindowLine", "ما في جرعة موثّقة لهذا النوع — راجع مرجع قبل الإعطاء")}</span>
                  )}
                  {win?.note && <span className="w-full text-2xs font-semibold text-ink-subtle">{win.note}</span>}
                  {(flags?.renal || flags?.hepatic) && <span className="w-full text-2xs font-black text-warn-700 dark:text-warn-300">{t("tplan.organCaution", "المريض عنده قصور — راجع الجرعة")}</span>}
                  {banned && <span className="w-full text-2xs font-black text-danger-700 dark:text-danger-300">{banned}</span>}
                </div>
              )}

              {/* الجرعة: بلاطات محسوبة، أو سلّم يدوي */}
              <div className={cn("rounded-2xl", ring("dose"))} data-dosegroup>
                {win && weight && !manual ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {doseTile(win.min, t("tplan.doseMin", "الأقل"), false)}
                      {doseTile(win.typical, t("tplan.doseTypical", "المعتادة"), false)}
                      {doseTile(topRate!, t("tplan.doseMax", "الأعلى"), win.hardMax !== undefined && topRate === win.hardMax)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => bump(-step)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-lg font-black text-ink">−</button>
                      <button type="button" onClick={() => { playTap(); setPad("rate"); }}
                        className={cn("h-11 min-w-[104px] rounded-xl bg-surface-2 px-2 text-sm font-black tabular-nums", overHard ? "text-danger-700 dark:text-danger-300" : inWindow ? "text-ink" : "text-warn-700 dark:text-warn-300")}>
                        {row.mgPerKg !== undefined ? formatDec(row.mgPerKg) : "—"} {t("tplan.mgPerKg", "ملغ/كغ")}
                      </button>
                      <button type="button" onClick={() => bump(step)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-lg font-black text-ink">+</button>
                      <span className="ms-auto text-2xs font-bold text-ink-subtle">{t("tplan.fineTune", "تعديل دقيق")}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
                      {QTYS.map((qv) => (
                        <button key={qv} type="button" onClick={() => { playTap(); const u = doseParts(row.dose).unit; onPatch({ doseMode: "manual", mgPerKg: undefined, dose: `${qv}${u ? ` ${u}` : ""}` }); }}
                          className={cn("h-12 rounded-2xl border text-base font-black tabular-nums transition", doseParts(row.dose).qty === qv ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
                          {qv}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {UNIT_KEYS.map((u) => {
                        const label = t(u.key, u.def);
                        const on = doseParts(row.dose).unit === label;
                        return (
                          <button key={u.key} type="button" onClick={() => { playTap(); const qv = doseParts(row.dose).qty || "1"; onPatch({ doseMode: "manual", mgPerKg: undefined, dose: `${qv} ${label}`, ...(u.solid !== undefined ? { solid: u.solid } : {}) }); }}
                            className={cn("h-12 min-w-[68px] rounded-2xl border px-3 text-sm font-bold transition", on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {freeText ? (
                      <input value={row.dose} onChange={(e) => onPatch({ doseMode: "manual", mgPerKg: undefined, dose: e.target.value })}
                        placeholder={t("tplan.dosePh", "اكتب الجرعة (مثال: قرص واحد، ٥ قطرات، 1 مل)")} className="input mt-2 h-12 w-full text-sm font-bold" />
                    ) : (
                      <button type="button" onClick={() => { playTap(); setFreeText(true); }} className="mt-2 text-2xs font-bold text-ink-muted underline transition hover:text-ink">{t("tplan.typeDose", "اكتب الجرعة بنفسك")}</button>
                    )}
                  </>
                )}
              </div>

              {/* العيار — رقاقاتٌ كبيرة بدل حقل رقم */}
              {!manual && (
                <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl", ring("strength"))} data-strengthgroup>
                  <span className="me-1 inline-flex items-center gap-1 text-2xs font-extrabold text-ink-muted">
                    <Beaker size={13} /> {isSolid ? t("tplan.tabStrength", "قوة الحبة") : t("tplan.vialStrength", "تركيز الأمبولة")}
                  </span>
                  {mono?.strengths?.map((s) => (
                    <button key={s} type="button" onClick={() => { playTap(); onPatch({ strength: s, solid: isSolid || undefined, strengthConfirmed: true }); }}
                      className={cn("h-12 min-w-[68px] rounded-2xl border-2 px-3 text-base font-black tabular-nums transition",
                        row.strength === s ? (row.strengthConfirmed ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 bg-brand-600 text-white ring-2 ring-warn-400") : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
                      {formatDec(s)}
                    </button>
                  ))}
                  <button type="button" onClick={() => { playTap(); setPad("strength"); }} className="h-12 rounded-2xl border-2 border-dashed border-line px-3 text-xs font-bold text-ink-muted transition hover:border-brand-300">
                    {t("tplan.otherStrength", "عيار ثاني")}
                  </button>
                  {row.strength !== undefined && !row.strengthConfirmed && (
                    <span className="w-full text-2xs font-black text-warn-700 dark:text-warn-300">{t("tplan.whichVial", { n: formatDec(row.strength), defaultValue: "أيّ عيار بيدك؟ الحساب دار على {{n}} — أكّده" })}</span>
                  )}
                  {!mono?.strengths?.length && <span className="w-full text-2xs font-semibold text-ink-subtle">{t("tplan.noStrengthNote", "بلا عيار: الكمية تظهر بالملغ فقط")}</span>}
                </div>
              )}

              {/* الطريق — الكل ظاهر، والموثّق منه بحلقة خضراء */}
              <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl", ring("route"))} data-routegroup>
                {routes.map((rt) => {
                  const documented = !!win?.routes.includes(APP_ROUTE[rt.id]);
                  return (
                    <button key={rt.id} type="button" onClick={() => { playTap(); onPatch({ route: row.route === rt.id ? undefined : rt.id }); }}
                      className={cn("h-11 rounded-2xl border px-4 text-sm font-bold transition",
                        row.route === rt.id ? "border-brand-600 bg-brand-600 text-white shadow-soft"
                          : cn("border-line bg-surface-2 text-ink-muted hover:border-brand-300", documented && "ring-1 ring-success-400 dark:ring-success-500/40"))}>
                      {t(rt.key, rt.label)}
                    </button>
                  );
                })}
              </div>

              {/* التكرار والأيام */}
              <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl", ring("freq"), ring("days"))} data-freqgroup>
                {freqs.map((f) => (
                  <button key={f.id} type="button" onClick={() => { playTap(); onPatch({ freq: f.id }); }}
                    className={cn("h-11 min-w-[56px] rounded-2xl border px-3 text-sm font-black transition", row.freq === f.id ? "border-brand-600 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-2 text-ink-muted hover:border-brand-300")}>
                    {t(f.key, f.label)}
                  </button>
                ))}
                {row.freq !== "prn" && (
                  <>
                    <span className="h-6 w-px bg-line" />
                    {[3, 5, 7, 10, 14].map((d) => (
                      <button key={d} type="button" onClick={() => { playTap(); onPatch({ days: d }); }}
                        className={cn("h-11 min-w-[48px] rounded-2xl border px-3 text-sm font-black tabular-nums transition", row.days === d ? "border-brand-600 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-2 text-ink-muted hover:border-brand-300")}>
                        {formatNum(d)}
                      </button>
                    ))}
                    <button type="button" onClick={() => { playTap(); setPad("days"); }} className="h-11 rounded-2xl border border-dashed border-line px-3 text-xs font-bold text-ink-muted">{t("tplan.other", "أخرى")}</button>
                    {row.days !== planDays && <span className="rounded-md bg-warn-50 px-1.5 py-0.5 text-[10px] font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">{t("tplan.differsFromPlan", "مختلفة عن الخطة")}</span>}
                  </>
                )}
                {doses > 0 && <span className="ms-auto rounded-full bg-success-50 px-2.5 py-1 text-2xs font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("tplan.dosesCount", { n: formatNum(doses), defaultValue: "{{n}} جرعة" })}</span>}
              </div>

              {/* التحذيرات — عارية، بلا صندوقٍ حولها */}
              {alerts.length > 0 && <div className="space-y-1.5">{alerts.map((a) => <DoseAlertRow key={a.id} alert={a} />)}</div>}

              {noteOn || row.note?.trim() ? (
                <input value={row.note ?? ""} onChange={(e) => onPatch({ note: e.target.value })} placeholder={t("tplan.notePh", "ملاحظة على هذا الدواء…")} className="input h-11 w-full text-sm" />
              ) : null}

              {/* التذييل — والحذف لا يُبلَغ إلا بفتح البطاقة */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {win && weight && (
                  <button type="button" onClick={() => { playTap(); onPatch({ doseMode: manual ? "weight" : "manual", ...(manual ? { dose: "", mgPerKg: win.typical } : { mgPerKg: undefined }) }); }}
                    className="h-11 rounded-xl px-3 text-xs font-extrabold text-ink-muted transition hover:bg-surface-2">
                    {manual ? t("tplan.backToCalc", "احسبها بالوزن") : t("tplan.manualDose", "جرعة يدوية")}
                  </button>
                )}
                {!noteOn && !row.note?.trim() && (
                  <button type="button" onClick={() => { playTap(); setNoteOn(true); }} className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-xs font-extrabold text-ink-muted transition hover:bg-surface-2"><Plus size={13} /> {t("tplan.addNote", "ملاحظة")}</button>
                )}
                <button type="button" onClick={onReplace} className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-xs font-extrabold text-ink-muted transition hover:bg-surface-2"><RefreshCw size={13} /> {t("tplan.replaceDrug", "بدّل الدواء")}</button>
                <button type="button" onClick={onRemove} className="ms-auto inline-flex h-11 items-center gap-1 rounded-xl px-3 text-xs font-extrabold text-danger-600 transition hover:bg-danger-50 dark:hover:bg-danger-500/10"><Trash2 size={13} /> {t("tplan.deleteDrug", "احذف")}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NumberPadSheet
        open={pad === "rate"} title={t("tplan.padMgKg", "الجرعة لكل كيلو")} unit={t("tplan.mgPerKg", "ملغ/كغ")}
        initial={row.mgPerKg} min={0.001} max={999}
        contextLine={win ? t("tplan.windowShort", { min: formatDec(win.min), max: formatDec(win.max), defaultValue: "الدليل {{min}}–{{max}} ملغ/كغ" }) : undefined}
        band={win ? { min: win.min, max: win.hardMax ?? win.max } : undefined}
        bandWarn={t("tplan.outsideWindow", "خارج نافذة الدليل — اضغط مرة ثانية لتأكيدها")}
        onClose={() => setPad(null)}
        onSubmit={(n) => { onPatch({ doseMode: "weight", mgPerKg: n, dose: "" }); setPad(null); }}
      />
      <NumberPadSheet
        open={pad === "strength"} title={isSolid ? t("tplan.tabStrength", "قوة الحبة") : t("tplan.vialStrength", "تركيز الأمبولة")}
        unit={isSolid ? t("tplan.mgPerTab", "ملغ/حبة") : t("tplan.mgPerMl", "ملغ/مل")}
        initial={row.strength} min={0.01} max={99999}
        onClose={() => setPad(null)}
        onSubmit={(n) => { onPatch({ strength: n, solid: isSolid || undefined, strengthConfirmed: true }); setPad(null); }}
      />
      <NumberPadSheet
        open={pad === "days"} title={t("tplan.padDays", "مدة العلاج")} unit={t("tplan.day", "يوم")}
        initial={row.days} decimals={false} min={1} max={365}
        onClose={() => setPad(null)}
        onSubmit={(n) => { onPatch({ days: Math.round(n) }); setPad(null); }}
      />
    </div>
  );
}
