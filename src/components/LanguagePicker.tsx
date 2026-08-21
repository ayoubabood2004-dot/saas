import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Check, ChevronDown } from "lucide-react";
import { setLang, localeInfo, type Lang } from "@/i18n";
import { selectableLocales } from "@/i18n/registry";
import { playTap } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/* ============================================================================
 * مبدّل اللغة العام — للزائر قبل تسجيل الدخول.
 *
 * قائمة الحساب فيها مبدّل، لكنه خلف تسجيل الدخول: زائر صفحة الهبوط لا يملك
 * حساباً أصلاً. وهذا المكوّن هو الوجه العلني لنفس السجل: كل لغة تُعرض
 * **باسمها بلغتها** لا بترجمتها — من يبحث عن العربية يبحث عن كلمة «العربية»،
 * ولا تنفعه كلمة "Arabic" إن كان لا يقرأ الإنجليزية.
 * ==========================================================================*/
export function LanguagePicker({ compact = false }: { compact?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const langs = selectableLocales();
  const current = localeInfo(i18n.language);

  // الإغلاق بالنقر خارجها وبالمفتاح — قائمةٌ لا تُغلق بالهروب فخٌّ للوحة المفاتيح.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // لغةٌ واحدة متاحة ⇒ لا معنى لمبدّل.
  if (langs.length < 2) return null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        data-langpicker
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("landing.langLabel", "اللغة")}
        onClick={() => { playTap(); setOpen((v) => !v); }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1/70 font-semibold text-ink-muted transition hover:border-brand-300 hover:text-ink",
          compact ? "px-2.5 py-1.5 text-2xs" : "px-3 py-2 text-sm",
        )}
      >
        <Languages size={compact ? 14 : 16} />
        <span>{current.native}</span>
        <ChevronDown size={13} className={cn("transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          data-langmenu
          className="absolute end-0 z-50 mt-2 min-w-[11rem] overflow-hidden rounded-2xl border border-line-strong bg-surface-1 p-1.5 shadow-raised"
        >
          {langs.map((l) => {
            const active = l.code === current.code;
            return (
              <button
                key={l.code}
                role="menuitem"
                data-langopt={l.code}
                onClick={() => { playTap(); setLang(l.code as Lang); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition",
                  active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink hover:bg-surface-2",
                )}
                // كل خيار باتجاه لغته: العربية تُقرأ يميناً ولو كانت القائمة إنجليزية.
                dir={l.dir}
              >
                <span className="flex-1 text-start">{l.native}</span>
                {active && <Check size={15} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
