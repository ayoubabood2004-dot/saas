/* ============================================================================
 * صف الحساب + قائمته — ذيل الشريط الجانبي بصف واحد.
 *
 * كان الذيل خمس طبقات مكدّسة (كارت اشتراك + كارت حساب + شريط تكبير + صف
 * أيقونات + ختم نسخة) تاكل ~٢٣٢ بكسل فتزاحم قوائم التنقّل وتفرض سكرول.
 * صار صفاً واحداً (~٥٨ بكسل) يفتح قائمة فيها كل شيء — نفس نمط الأنظمة
 * العالمية (Linear / Notion / Slack): الشريط للتنقّل، والحساب وإعداداته
 * السريعة بقائمة واحدة.
 *
 * قواعد التصميم المثبّتة هنا:
 *   · نقطة صغيرة على الأفاتار تحمل حالة الاشتراك — معلومة بلا مساحة.
 *   · الاشتراك الفعّال لا يأخذ مساحة دائمة (سطر داخل القائمة يكفي)؛ أما
 *     التجربة والمنتهي فيبقيان كارتاً بارزاً بالشريط لأنهما يطلبان فعلاً.
 *   · الخروج آخر عنصر وبلون الخطر — عرف عالمي يمنع الضغط الخاطئ.
 *   · القائمة تُغلق بالضغط خارجها أو Esc أو بعد أي إجراء يغادر الصفحة.
 * ==========================================================================*/
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronUp, Crown, Languages, Sun, Moon, ArrowLeftRight, LogOut, PawPrint, Sparkles, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/lib/subscription";
import { useTheme } from "@/lib/theme";
import { setLang, localeInfo, type Lang } from "@/i18n";
import { selectableLocales } from "@/i18n/registry";
import { stepFontScale, canStepFontScale, getFontScale, FONT_SCALES } from "@/lib/fontScale";
import { OverrideCorner } from "@/components/ManagerOverride";
import { playTap } from "@/lib/sounds";
import { cn, formatNum } from "@/lib/utils";

/** لون نقطة الحالة على الأفاتار — تُقرأ بلمحة بلا أي نص. */
const DOT: Record<string, string> = {
  active: "bg-success-500",
  trialing: "bg-brand-500",
  expired: "bg-warn-500",
};

export function AccountMenu({ compact = false }: { compact?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, signOut, roles, activeRole, switchRole } = useAuth();
  const { status, trialDaysLeft, periodDaysLeft } = useSubscription();
  const { resolved, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // إعادة رسم عند تغيّر حجم العرض (الحجم محفوظ خارج React).
  const [, bumpZoom] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* إغلاق بالضغط خارج القائمة أو بمفتاح Esc — سلوك القوائم القياسي.
   *
   * استثناء واجب: النوافذ (Modal) تُرسَم بجذر الصفحة عبر بوابة، لكنها شجرياً
   * أبناء هذه القائمة. فأي ضغطة داخلها تبدو «خارج القائمة» فتُغلقها — وإغلاق
   * القائمة يفكّ النافذة معها. هذا ما كان يخفي لوحة رمز المدير عند أول رقم.
   * القاعدة: ما دام في نافذة مفتوحة، القائمة لا تُغلق بضغطة ولا بـEsc — النافذة
   * هي صاحبة التحكّم، وإغلاقها يرجّع السلوك الطبيعي. */
  useEffect(() => {
    if (!open) return;
    const dialogOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const onDown = (e: MouseEvent) => {
      if (dialogOpen()) return;
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogOpen()) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!user) return null;

  const initials = (user.full_name || "")
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel =
    user.role === "admin" ? t("role.admin", "العيادة")
      : user.role === "reception" ? t("role.reception", "الاستقبال")
        : t("role.doctor", "طبيب بيطري");

  const otherRole = activeRole === "clinic" ? "owner" : "clinic";
  const pct = FONT_SCALES.find((s) => s.id === getFontScale())?.pct ?? 100;
  const glyph = localeInfo(i18n.language).dir === "rtl" ? "أ" : "A";
  // لغات المخزن المعروضة — التجريبية تظهر خلف فلاغ vp_lang_exp فقط.
  const langs = selectableLocales();
  const zoom = (dir: 1 | -1) => { playTap(); stepFontScale(dir); bumpZoom((n) => n + 1); };

  const row = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors";
  const tail = "ms-auto text-2xs font-bold text-ink-subtle";

  return (
    <div ref={wrapRef} className="relative mt-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            role="menu"
            aria-label={t("nav.accountMenu", "قائمة الحساب")}
            className={cn(
              "absolute bottom-full z-50 mb-2 origin-bottom rounded-2xl border border-line-strong bg-surface-1 p-1.5 shadow-raised",
              // بالسكّة المطويّة الصفّ عرضه ٦٠px: لو ورثت القائمة عرضه لصارت
              // شريطاً لا يُقرأ — فتُثبّت على عرضها الطبيعي وتنسدل بجانبه.
              compact ? "start-0 w-64" : "start-0 end-0",
            )}
          >
            {/* الاشتراك — تفاصيله هنا دائماً، وبارزاً بالشريط فقط لما يحتاج فعلاً */}
            <button
              role="menuitem"
              onClick={() => { playTap(); setOpen(false); navigate("/subscribe"); }}
              className={cn(row, "border",
                status === "active" ? "border-success-100 bg-success-50 text-success-800 hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200"
                  : status === "expired" ? "border-warn-200 bg-warn-50 text-warn-800 hover:bg-warn-100 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200"
                    : "border-brand-100 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-200")}
            >
              {status === "expired" ? <AlertTriangle size={17} className="shrink-0" />
                : status === "trialing" ? <Sparkles size={17} className="shrink-0" />
                  : <Crown size={17} className="shrink-0" />}
              {t("sub.title", "الاشتراك")}
              <span className="ms-auto text-2xs font-extrabold tabular-nums opacity-90">
                {status === "expired"
                  ? t("sub.renewShort", "جدّد الآن")
                  : t("sub.daysLeft", { n: formatNum(status === "trialing" ? trialDaysLeft : periodDaysLeft), defaultValue: "باقي {{n}} يوم" })}
              </span>
            </button>

            <div className="my-1.5 h-px bg-line" />

            {/* حجم العرض — يبقى بمكانه ولا يغلق القائمة حتى يجرّب الدكتور الدرجات */}
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="whitespace-nowrap text-sm font-bold text-ink">{t("nav.zoomShort", "حجم العرض")}</span>
              <span className="ms-auto flex shrink-0 items-center gap-0.5 rounded-full border border-line p-0.5">
                <button
                  onClick={() => zoom(-1)} disabled={!canStepFontScale(-1)}
                  aria-label={t("nav.zoomOut", "تصغير العرض")}
                  className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-xs font-black text-ink-muted transition hover:bg-surface-3 hover:text-ink disabled:opacity-35"
                  dir="ltr"
                >{glyph}−</button>
                <span className="min-w-[2.1rem] text-center text-[10px] font-black tabular-nums text-ink-muted">{formatNum(Math.round(pct))}٪</span>
                <button
                  onClick={() => zoom(1)} disabled={!canStepFontScale(1)}
                  aria-label={t("nav.zoomIn", "تكبير العرض")}
                  className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-sm font-black text-ink-muted transition hover:bg-surface-3 hover:text-ink disabled:opacity-35"
                  dir="ltr"
                >{glyph}+</button>
              </span>
            </div>

            <div className="my-1.5 h-px bg-line" />

            {/* اللغة — بلغتين تبقى ضغطة تبديل واحدة (أسرع طريق)، ومع لغة
                ثالثة فما فوق تصير قائمة اختيار حقيقية من سجل اللغات. كل لغة
                تُعرض باسمها بلغتها — لا يُطلب من كردي أن يقرأ «Kurdish». */}
            {langs.length <= 2 ? (
              <button
                role="menuitem"
                onClick={() => { playTap(); setLang((langs.find((l) => l.code !== i18n.language)?.code ?? "en") as Lang); }}
                className={cn(row, "text-ink hover:bg-surface-2")}
              >
                <Languages size={17} className="shrink-0 text-ink-muted" />
                {t("nav.language", "اللغة")}
                <span className={tail}>{localeInfo(i18n.language).native}</span>
              </button>
            ) : (
              <div className="px-3 py-2">
                <div className="flex items-center gap-3 text-sm font-bold text-ink">
                  <Languages size={17} className="shrink-0 text-ink-muted" />
                  {t("nav.language", "اللغة")}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {langs.map((l) => (
                    <button
                      key={l.code}
                      role="menuitemradio"
                      aria-checked={i18n.language === l.code}
                      onClick={() => { playTap(); setLang(l.code as Lang); }}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-2xs font-bold transition-colors",
                        i18n.language === l.code ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                      )}
                    >
                      {l.native}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* المظهر */}
            <button
              role="menuitem"
              onClick={() => { playTap(); toggleTheme(); }}
              className={cn(row, "text-ink hover:bg-surface-2")}
            >
              {resolved === "dark" ? <Moon size={17} className="shrink-0 text-ink-muted" /> : <Sun size={17} className="shrink-0 text-ink-muted" />}
              {t("nav.theme", "المظهر")}
              <span className={tail}>{resolved === "dark" ? t("nav.themeDark", "داكن") : t("nav.themeLight", "فاتح")}</span>
            </button>

            {/* وضع المدير / قفل الجهاز — نفس منطق الأيقونة القديمة بهيئة سطر */}
            <OverrideCorner variant="menu" onDone={() => setOpen(false)} />

            {/* تبديل الدور — لحسابات لها مساحتان */}
            {roles.length > 1 && (
              <button
                role="menuitem"
                onClick={() => { playTap(); setOpen(false); switchRole(); navigate("/"); }}
                className={cn(row, "text-ink hover:bg-surface-2")}
              >
                <ArrowLeftRight size={17} className="shrink-0 text-ink-muted" />
                {t("role.switchTo", { role: t(`role.${otherRole}`), defaultValue: "التبديل إلى {{role}}" })}
              </button>
            )}

            <div className="my-1.5 h-px bg-line" />

            <button
              role="menuitem"
              onClick={() => { playTap(); signOut(); }}
              className={cn(row, "text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10")}
            >
              <LogOut size={17} className="shrink-0" />
              {t("nav.logout", "تسجيل الخروج")}
            </button>

            {/* ختم النسخة — يتغير مع كل نشر: تاريخ قديم = الجهاز على نسخة قديمة */}
            <p className="pb-1 pt-1.5 text-center text-[10px] tabular-nums text-ink-subtle/60" dir="ltr">
              v{new Date(__BUILD_AT__).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* صف الحساب — كامل ذيل الشريط */}
      <button
        onClick={() => { playTap(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={compact ? user.full_name : undefined}
        className={cn(
          "flex w-full items-center rounded-2xl border transition",
          compact ? "justify-center p-1.5" : "gap-3 p-2.5 text-start",
          open ? "border-brand-400 bg-surface-1 ring-2 ring-brand-500/25" : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2",
        )}
      >
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-grad font-display text-sm font-bold text-white shadow-soft">
          {initials || <PawPrint size={18} />}
          {DOT[status] && (
            <span className={cn("absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-surface-1", DOT[status])} />
          )}
        </span>
        {/* dir="auto" ضروري: اسم لاتيني داخل واجهة عربية كان ينقصّ من بدايته
            («…rah Mansour») لأن نهاية النص المنطقية تقع يساراً. */}
        {!compact && <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-sm font-bold text-ink">{user.full_name}</span>
          {/* الدور فقط — حالة الاشتراك تحملها النقطة وسطرُها داخل القائمة، فلا
              يطول السطر ولا ينقطع. */}
          <span className="block truncate text-2xs text-ink-subtle">{roleLabel}</span>
        </span>}
        {/* القائمة تفتح للأعلى: السهم لفوق وهي مغلقة، وينقلب عند الفتح. */}
        {!compact && <ChevronUp size={16} className={cn("shrink-0 transition-transform", open ? "rotate-180 text-brand-600" : "text-ink-subtle")} />}
      </button>
    </div>
  );
}
