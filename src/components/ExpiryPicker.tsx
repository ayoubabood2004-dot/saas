import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronDown, Keyboard, X } from "lucide-react";
import { cn, localISO } from "@/lib/utils";
import { daysToExpiry } from "@/lib/expiry";
import { isTopModal, pushModal, removeModal } from "@/lib/modalStack";
import { ExpiryInput } from "@/components/ExpiryInput";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * مختارُ الانتهاء بضغطتين — سنة ثمّ شهر (طلبُ المالك بعد الدفعات).
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * المقيس (الإنتاج، ٢٦/٩): **صفرُ** سطرِ شراءٍ من ٩٤٦ عليه تاريخ انتهاء. السطرُ السريع
 * لإعادة التخزين ما كان يعرض الخانةَ أصلاً (مخفيّةٌ خلف «تعديل الأسعار»)، والمفتوحُ
 * كان تقويمَ المتصفّح: تقليبُ سنين وأشهر للوصول ليومٍ **ليس مطبوعاً على العلبة** —
 * علبةُ الدواء تقول `EXP 03/2027` لا يوماً. فالمختارُ يسأل ما على العلبة:
 *   • صفُّ سنين وشبكةُ أشهر، ضغطتان ⇒ **آخرُ يومٍ بالشهر** (هكذا يُقرأ EXP 03/2027).
 *   • أشهرُ السنة الحالية التي فاتت رماديّة — لا يُختار منتهٍ بالغلط.
 *   • «نفس آخر مرّة» ضغطةٌ واحدة حين يُعاد شراءُ الصنف بنفس تاريخه.
 *   • ويومٌ بعينه ممكنٌ بالكتابة لمن علبتُه تطبعه (`ExpiryInput`).
 * ويسجّل نفسَه بمكدّس النوافذ وهو مفتوح: Esc تطوي المختارَ وحدَه لا الفاتورةَ تحته.
 * واللوحةُ تُرسم **فوق كلّ شيء** (portal، موضعٌ ثابتٌ من الزرّ) وتنفتح للأعلى إن ضاق ما
 * تحتها: داخل نافذةٍ قابلةٍ للتمرير كانت تُقصّ بحافّتها فلا يُضغط الشهر (أمسكتها القيادة).
 * ========================================================================= */

const YEARS_AHEAD = 5;

/** آخرُ يومٍ بالشهر كـISO. */
export const endOfMonthISO = (y: number, m: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

const parse = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};

export function ExpiryPicker({ value, onChange, suggest, compact, id }: {
  value: string;
  onChange: (iso: string) => void;
  /** تاريخٌ يُقترح بضغطة (آخرُ تاريخٍ معروفٍ للمادة، إن لم يفُت). */
  suggest?: string | null;
  /** زرٌّ أصغر لسطورٍ ضيّقة (السطرُ السريع بالشراء). */
  compact?: boolean;
  id?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const today = localISO();
  const now = parse(today)!;
  const cur = parse(value);
  const [year, setYear] = useState<number>(cur?.y ?? now.y);
  const modalId = useId();
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const PANEL_W = 304, PANEL_H = 380;
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const place = () => {
      const r = box.current!.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(PANEL_W, vw - 16);
      const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
      const below = vh - r.bottom;
      const top = below >= PANEL_H + 8 || r.top < PANEL_H ? Math.min(r.bottom + 4, Math.max(8, vh - PANEL_H - 8)) : r.top - PANEL_H - 4;
      setPos({ top: Math.max(8, top), left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => { if (open) { setYear(cur?.y && cur.y >= now.y ? cur.y : now.y); setTyping(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    pushModal(modalId);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopModal(modalId)) setOpen(false); };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const n = e.target as Node;
      if (box.current?.contains(n) || panel.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      removeModal(modalId);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, modalId]);

  const locale = i18n.language.startsWith("ar") ? "ar-IQ" : i18n.language;
  const monthName = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    return (m: number) => f.format(new Date(Date.UTC(2000, m - 1, 1)));
  }, [locale]);
  const label = (iso: string) => {
    const p = parse(iso);
    if (!p) return "";
    const eom = endOfMonthISO(p.y, p.m) === iso.slice(0, 10);
    return eom ? `${monthName(p.m)} ${p.y}` : `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
  };
  const days = value ? daysToExpiry(value, today) : null;
  const tone = days === null ? "" : days < 0 ? "border-danger-300 text-danger-700 dark:border-danger-500/40 dark:text-danger-300"
    : days <= 90 ? "border-warn-300 text-warn-800 dark:border-warn-500/40 dark:text-warn-200" : "text-ink";
  const pick = (iso: string) => { playTap(); onChange(iso); setOpen(false); };
  const sug = suggest && suggest.slice(0, 10) >= today && suggest.slice(0, 10) !== value.slice(0, 10) ? suggest.slice(0, 10) : null;

  return (
    <div className="relative" ref={box}>
      <button type="button" id={id} data-expiry-picker aria-expanded={open}
        onClick={() => { playTap(); setOpen((o) => !o); }}
        className={cn("input flex items-center gap-1.5 text-start", compact ? "h-10 w-36 px-2 text-sm" : "w-full", tone)}>
        <CalendarClock size={14} className="shrink-0 opacity-70" />
        <span className={cn("min-w-0 flex-1 truncate font-semibold", !value && "font-normal text-ink-subtle")}>
          {value ? label(value) : t("xp.pick", "ينتهي…")}
        </span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>
      {open && pos && createPortal(
        <div data-expiry-panel ref={panel} dir={i18n.dir()}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.min(PANEL_W, window.innerWidth - 16) }}
          className="z-[70] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl border border-line bg-surface-1 p-3 shadow-raised">
          {sug && (
            <button type="button" data-xp-suggest onClick={() => pick(sug)}
              className="mb-2 flex w-full items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-brand-800 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200">
              <span>{t("xp.same", "نفس آخر مرة")}</span><span>{label(sug)}</span>
            </button>
          )}
          <p className="mb-1 text-2xs font-semibold text-ink-subtle">{t("xp.year", "السنة")}</p>
          <div className="mb-2 grid grid-cols-5 gap-1">
            {Array.from({ length: YEARS_AHEAD }, (_, i) => now.y + i).map((y) => (
              <button key={y} type="button" data-xp-year={y} aria-pressed={year === y} onClick={() => { playTap(); setYear(y); }}
                className={cn("rounded-lg py-2 text-sm font-extrabold tabular-nums transition",
                  year === y ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink hover:bg-surface-3")}>
                {y}
              </button>
            ))}
          </div>
          <p className="mb-1 text-2xs font-semibold text-ink-subtle">{t("xp.month", "الشهر (ينتهي آخره)")}</p>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const past = year === now.y && m < now.m;
              const iso = endOfMonthISO(year, m);
              const on = value.slice(0, 10) === iso;
              return (
                <button key={m} type="button" data-xp-month={m} disabled={past} onClick={() => pick(iso)}
                  className={cn("flex flex-col items-center rounded-lg py-1.5 transition",
                    on ? "bg-brand-600 text-white" : past ? "cursor-not-allowed bg-surface-2 text-ink-subtle/50" : "bg-surface-2 text-ink hover:bg-surface-3")}>
                  <span className="text-base font-extrabold leading-tight tabular-nums">{m}</span>
                  <span className="text-2xs leading-tight">{monthName(m)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            {value ? (
              <button type="button" data-xp-clear onClick={() => pick("")}
                className="flex items-center gap-1 text-xs font-semibold text-ink-subtle hover:text-danger-600">
                <X size={12} /> {t("xp.clear", "بلا تاريخ")}
              </button>
            ) : <span />}
            <button type="button" onClick={() => setTyping((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-ink-subtle hover:text-brand-600">
              <Keyboard size={12} /> {t("xp.exact", "العلبة بيها يوم؟ اكتبه")}
            </button>
          </div>
          {typing && (
            <div className="mt-2">
              <ExpiryInput value={value} onChange={(iso) => { if (iso) pick(iso); }} invalidLabel={t("pos.expiryInvalid", "تاريخ غير صحيح")} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
