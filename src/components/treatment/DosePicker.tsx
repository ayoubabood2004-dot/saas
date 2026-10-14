import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DoseRoute, Species } from "@/types";
import {
  DOSE_ROUTES, unitsFor, laddersFor, initialTab, formatAmount, validQty, qtyBounds, switchRoute, pickUnit, pinFits, lastFor, num,
  type DoseUnit, type DoseValue, type QtyError, type PinLike,
} from "@/lib/doseUnits";
import { routeName } from "@/lib/flowsheet";
import { repo } from "@/lib/repo";
import { NumberPadSheet } from "./NumberPadSheet";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * DosePicker — الجرعةُ بضغطة: الطريق ⇒ الوحدة ⇒ الكمّية من سلّمٍ يغطّي المدى كلَّه.
 *
 * قرارُ المالك (D5/D5+): كلُّ درجةٍ زرّ — مل من 0.01 إلى 60 (والخيلُ والأبقارُ فوقها)،
 * والحبّةُ أرباعاً من ¼ إلى 10، والقطرةُ والبخّةُ والكبسولةُ أعداداً من 1 إلى 20، والوحدةُ
 * الدولية أنصافاً ثم آحاداً حتى 50، وماءُ الشرب مل/لتر وغم/لتر. والتبويبُ يُفتح على القيمة
 * المثبّتة («آخر مرة» أو «المحسوبة»)، والكتابةُ احتياطٌ يُفحص بنفس الوحدة.
 *
 * تغييرُ الشكل يمسح الرقم ويقولها (لا تحويلَ أبداً)، والطريقُ بين الحقن الثلاثة يُبقيه.
 * مشترك: نافذةُ الزيارة، ونافذةُ التعديل، وورقةُ الطبلة، وبطاقةُ الدواء — فنصوصُه بنطاقاتٍ
 * باردة (dose، flow) لا بنطاقِ صفحة. لا autoFocus ولا حقلَ كتابة (اللوحةُ بلا حقل).
 * ==========================================================================*/

/** قيمةٌ مثبّتة بطريقها: «المحسوبة» لا تُعرض إلا بطريقها، و«آخر مرة» (لهذا المريض) بطريقها أو بلا طريقٍ قديم. */
export type DosePinned = PinLike;

/** تسميةُ الدرجة: الحبّةُ والكيسُ والسنتيمترُ بالكسور (1¼، ½)، والباقي رقماً. */
function rung(unit: DoseUnit, v: number): string {
  if (unit !== "tab" && unit !== "sachet" && unit !== "cm") return num(v);
  const whole = Math.floor(v + 1e-9);
  const frac = Number((v - whole).toFixed(2));
  const g = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  if (!g) return num(v);
  return whole ? `${whole}${g}` : g;
}

export function DosePicker({
  drugName, value, onChange, species, pinned, routeLocked, unitsOverride, onNeedRoute, petId,
}: {
  drugName: string;
  /** المريض: «آخر مرة» جرعتُه هو من هذا الدواء — لا آخرُ جرعةٍ بالعيادة لأيّ حيوان (ببغاءٌ بجرعة قطّة). */
  petId?: string | null;
  value: DoseValue;
  onChange: (v: DoseValue) => void;
  species?: Species | string | null;
  /** قيمةٌ تُثبَّت أمام السلّم: «المحسوبة» من الدليل — وإلا «آخر مرة» من سجلّ العيادة. */
  pinned?: DosePinned | null;
  /** الطريقُ يُختار بمكانٍ آخر (بطاقةُ الدواء): رقاقاتُه لا تُرسم. */
  routeLocked?: boolean;
  /** وحداتٌ بديلة («عين / أذن» بالمعالج). */
  unitsOverride?: readonly DoseUnit[];
  /** بلا طريق والطريقُ مقفول: «اختر طريق الإعطاء أولاً» يقفز إليه. */
  onNeedRoute?: () => void;
}) {
  const { t } = useTranslation();
  const [lastRows, setLastRows] = useState<{ amount: string | null; route: string | null }[]>([]);
  const [notice, setNotice] = useState("");
  const [pad, setPad] = useState(false);

  /* «آخر مرة»: جرعاتُ **هذا المريض** من هذا الدواء (الأحدثُ أوّلاً) — قيمةٌ تُعرض لا تُختار وحدها، وبلا مريضٍ لا شيء. */
  useEffect(() => {
    const name = drugName.trim();
    if (pinned || !name || !petId) { setLastRows([]); return; }
    let alive = true;
    repo.lastDoseOf(name, petId)
      .then((rows) => { if (alive) setLastRows(rows); })
      .catch(() => { /* swallow-ok: a default, never a decision — the ladder works without it */ });
    return () => { alive = false; };
  }, [drugName, pinned, petId]);

  const units = unitsOverride ? [...unitsOverride] : unitsFor(value.route, drugName);
  const unit: DoseUnit | null = value.unit && units.includes(value.unit) ? value.unit : null;
  /** الطرقُ التي يصلح لها المثبّت: طريقُ المنتقي، و«عين / أذن» بالمعالج كلاهما. */
  const pinRoutes: DoseRoute[] = value.route ? [value.route] : unitsOverride ? ["ocular", "otic"] : [];
  const unitsKey = units.join(",");
  const last = useMemo<DosePinned | null>(() => {
    const p = lastFor(lastRows, pinRoutes, units);
    return p ? { qty: p.qty, unit: p.unit, kind: "last", route: p.route } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRows, value.route, unitsKey]);
  const pin = pinned ?? last;
  const pinOk = pinFits(pin, pinRoutes, units);
  const tabs = useMemo(() => laddersFor(unit, species), [unit, species]);
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => {
    setTab(initialTab(tabs, unit, value.qty ?? (pin && pinOk && pin.unit === unit ? pin.qty : null)));
    // التبويبُ يُعاد حين تتبدّل الوحدة وحدها — لا مع كلّ ضغطة درجة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, tabs]);
  const current = tabs.find((x) => x.id === tab) ?? tabs[0] ?? null;

  const uName = (u: string) => t(`dose.u.${u}`);
  const errText = (e: QtyError) => e.code === "whole" ? t("dose.badWhole", "هذي الوحدة بالعدد الصحيح بس")
    : e.code === "quarter" ? t("dose.badQuarter", "تنقسم لأرباع بس (¼ ½ ¾)")
      : e.code === "half" ? t("dose.badHalf", "خطوة نص وحدة بس")
        : t("dose.badRange", { min: num(e.min), max: num(e.max), defaultValue: "خارج المدى المسموح ({{min}}–{{max}})" });

  const chooseRoute = (r: DoseRoute) => {
    playTap();
    const sw = switchRoute(value, r, drugName);
    onChange(sw.value);
    setNotice(!sw.changed ? ""
      : sw.changed.kind === "unit"
        ? t("dose.unitChanged", { from: uName(sw.changed.from), to: uName(sw.changed.to), defaultValue: "تغيّرت الوحدة من {{from}} إلى {{to}} — اختر الكمية من جديد" })
        : t("dose.formChanged", { from: routeName(sw.changed.from as DoseRoute), to: routeName(sw.changed.to as DoseRoute), defaultValue: "تغيّر طريق الإعطاء من {{from}} إلى {{to}} — اختر الكمية من جديد" }));
  };
  const chooseUnit = (u: DoseUnit) => {
    playTap();
    if (value.qty != null && value.unit && value.unit !== u) {
      setNotice(t("dose.unitChanged", { from: uName(value.unit), to: uName(u), defaultValue: "تغيّرت الوحدة من {{from}} إلى {{to}} — اختر الكمية من جديد" }));
    } else setNotice("");
    onChange(pickUnit({ ...value, unit }, u));
  };
  const chooseQty = (q: number, u: DoseUnit = unit as DoseUnit) => { playTap(); setNotice(""); onChange({ ...value, unit: u, qty: q }); };

  const bounds = unit ? qtyBounds(unit, species) : null;
  const text = unit && value.qty != null ? formatAmount({ qty: value.qty, unit }) : "";

  return (
    <div className="min-w-0 space-y-2" data-dosepicker>
      {!routeLocked && (
        <div>
          <div className="mb-1 text-2xs font-bold text-ink-muted">{t("flow.taskRoute", "طريق الإعطاء")}</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("flow.taskRoute", "طريق الإعطاء")}>
            {DOSE_ROUTES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={value.route === r} data-dose-route={r} onClick={() => chooseRoute(r)}
                className={cn("min-h-[44px] rounded-xl border px-3 text-xs font-extrabold transition",
                  value.route === r ? "border-brand-600 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-2 text-ink-muted hover:border-brand-300")}>
                {routeName(r)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!units.length ? (
        <button type="button" data-dose-pickroute onClick={() => { playTap(); onNeedRoute?.(); }}
          className="w-full rounded-xl border-2 border-dashed border-line px-3 py-3 text-xs font-bold text-ink-muted">
          {t("dose.pickRoute", "اختر طريق الإعطاء أولاً")}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t("dose.qty", "الكمية")}>
            {units.map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} data-dose-unit={u} onClick={() => chooseUnit(u)}
                className={cn("min-h-[44px] rounded-xl border px-3 text-xs font-extrabold transition",
                  unit === u ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:border-brand-300")}>
                {uName(u)}
              </button>
            ))}
          </div>

          {pin && pinOk && (
            <button type="button" data-dose-pin={pin.kind} onClick={() => chooseQty(pin.qty, pin.unit)}
              className={cn("flex min-h-[44px] w-full items-center gap-2 rounded-xl border-2 px-3 text-start transition",
                value.qty === pin.qty && unit === pin.unit ? "border-brand-600 bg-brand-600 text-white" : "border-brand-300 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200")}>
              <span className="text-2xs font-black opacity-80">{pin.kind === "calc" ? t("dose.pinCalc", "المحسوبة") : t("dose.pinLast", "آخر مرة")}</span>
              <span className="text-sm font-black">{formatAmount({ qty: pin.qty, unit: pin.unit })}</span>
            </button>
          )}

          {unit && tabs.length > 1 && (
            <div className="min-w-0 overflow-x-auto" data-dose-tabs>
              <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
                {tabs.map((x) => (
                  <button key={x.id} type="button" role="tab" aria-selected={current?.id === x.id} data-dose-tab={x.id} onClick={() => { playTap(); setTab(x.id); }}
                    className={cn("min-h-[40px] shrink-0 rounded-lg px-3 text-xs font-black transition",
                      current?.id === x.id ? "bg-surface-1 text-brand-700 shadow-soft dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
                    <bdi dir="ltr">{x.label}</bdi>
                  </button>
                ))}
              </div>
            </div>
          )}

          {unit && current && (
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-label={t("dose.qty", "الكمية")} data-dose-grid>
              {current.values.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={value.qty === v} data-dose-val={v} onClick={() => chooseQty(v)}
                  className={cn("min-h-[48px] min-w-0 rounded-xl border text-sm font-black tabular-nums transition",
                    value.qty === v ? "border-brand-600 bg-brand-600 text-white shadow-soft" : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
                  <bdi dir="ltr">{rung(unit, v)}</bdi>
                </button>
              ))}
            </div>
          )}

          {unit && (
            <button type="button" data-dose-other onClick={() => { playTap(); setPad(true); }}
              className="min-h-[44px] rounded-xl border border-dashed border-line px-3 text-xs font-bold text-ink-muted transition hover:border-brand-300">
              {t("dose.other", "رقم ثاني")}
            </button>
          )}
        </>
      )}

      {text && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs font-black text-ink" data-dose-preview>
          {t("dose.preview", { text: value.route ? `${text} · ${routeName(value.route)}` : text, defaultValue: "ينكتب: {{text}}" })}
        </p>
      )}
      {unit === "ml" && value.qty != null && value.qty < 0.1 && (
        <p className="rounded-xl bg-warn-50 px-3 py-2 text-2xs font-bold text-warn-700 dark:bg-warn-500/10 dark:text-warn-300" data-dose-small>
          {t("dose.small", "حجم صغير — سرنجة ١ مل أو خفّف")}
        </p>
      )}
      <p className={cn("text-2xs font-bold text-warn-700 dark:text-warn-300", !notice && "sr-only")} aria-live="polite" data-dose-notice>{notice}</p>

      {unit && bounds && (
        <NumberPadSheet open={pad} title={t("dose.padTitle", { unit: uName(unit), defaultValue: "الكمية بـ{{unit}}" })} unit={uName(unit)}
          initial={value.qty ?? undefined} decimals={bounds.decimals > 0} maxDecimals={Math.max(1, bounds.decimals)} min={bounds.min} max={bounds.max}
          validate={(n) => { const e = validQty(unit, n, species); return e ? errText(e) : null; }}
          onClose={() => setPad(false)}
          onSubmit={(n) => { setPad(false); chooseQty(n); }} />
      )}
    </div>
  );
}
