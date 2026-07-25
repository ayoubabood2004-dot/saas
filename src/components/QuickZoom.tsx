// ============================================================================
// أ− / أ+ — تكبير وتصغير عرض السستم كله من داخل الواجهة.
//
// كثير من لابتوبات العيادات على تكبير نظام ١٢٥–١٥٠٪ فتضيق الشاشة الفعلية
// وتختفي أطراف الواجهة، والمستخدم لا يعرف زوم المتصفح. هذان الزران يعتمدان
// آلية حجم الخط (rem) نفسها: كل النصوص والمسافات تتناسق معاً ولا يختل أي
// تخطيط، والاختيار يُحفَظ لهذا الجهاز فقط.
// ============================================================================
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/ui";
import { stepFontScale, canStepFontScale, getFontScale, FONT_SCALES } from "@/lib/fontScale";
import { playTap } from "@/lib/sounds";

/** شريط أفقي كامل: أ− ــ النسبة الحالية ــ أ+ (للشريط الجانبي). */
export function QuickZoomBar() {
  const { t, i18n } = useTranslation();
  const [, bump] = useState(0);
  const glyph = i18n.language === "ar" ? "أ" : "A";
  const pct = FONT_SCALES.find((s) => s.id === getFontScale())?.pct ?? 100;
  const step = (dir: 1 | -1) => {
    playTap();
    stepFontScale(dir);
    bump((n) => n + 1);
  };
  const btn = "grid h-8 w-9 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-1 hover:text-ink disabled:opacity-35";
  return (
    <div className="mt-2 flex items-center justify-between rounded-2xl border border-line bg-surface-2 px-2 py-1">
      <Tooltip label={t("nav.zoomOut", "تصغير العرض")}>
        <button onClick={() => step(-1)} disabled={!canStepFontScale(-1)} aria-label={t("nav.zoomOut", "تصغير العرض")} className={btn}>
          <span className="text-[12px] font-black leading-none" dir="ltr">{glyph}−</span>
        </button>
      </Tooltip>
      <span className="text-2xs font-black tabular-nums text-ink-subtle">{t("nav.zoomLabel", "عرض الشاشة")} · {Math.round(pct)}٪</span>
      <Tooltip label={t("nav.zoomIn", "تكبير العرض")}>
        <button onClick={() => step(1)} disabled={!canStepFontScale(1)} aria-label={t("nav.zoomIn", "تكبير العرض")} className={btn}>
          <span className="text-[15px] font-black leading-none" dir="ltr">{glyph}+</span>
        </button>
      </Tooltip>
    </div>
  );
}

export function QuickZoom({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [, bump] = useState(0);
  const glyph = i18n.language === "ar" ? "أ" : "A";
  const step = (dir: 1 | -1) => {
    playTap();
    stepFontScale(dir);
    bump((n) => n + 1);
  };
  const btn = compact
    ? "grid h-9 w-9 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-35"
    : "grid h-10 w-10 place-items-center rounded-full text-ink-muted transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-35";
  return (
    <>
      <Tooltip label={t("nav.zoomOut", "تصغير العرض")}>
        <button onClick={() => step(-1)} disabled={!canStepFontScale(-1)} aria-label={t("nav.zoomOut", "تصغير العرض")} className={btn}>
          <span className="text-[13px] font-black leading-none" dir="ltr">{glyph}−</span>
        </button>
      </Tooltip>
      <Tooltip label={t("nav.zoomIn", "تكبير العرض")}>
        <button onClick={() => step(1)} disabled={!canStepFontScale(1)} aria-label={t("nav.zoomIn", "تكبير العرض")} className={btn}>
          <span className="text-[16px] font-black leading-none" dir="ltr">{glyph}+</span>
        </button>
      </Tooltip>
    </>
  );
}
