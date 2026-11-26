import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { loadRejects, matchAll, rejectKey } from "@/lib/imageMatch";
import { useMatchData } from "@/lib/photoMatchData";
import { cn, formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * شريطُ «لكينا صور بالمكتبة لمنتجاتك» — بصفحة صور المنتجات والمتجر (قرارُ المالك ٢٥/١١).
 *
 * يحسب بالبيانات نفسِها التي تفتحها الصفحة (`useMatchData` بخبيئةٍ مشتركة) فالعددُ هنا هو عددُ الصفحة.
 * لا يظهر لمن لا يملك الإذن، ولا عن فشل جلب (الصفحةُ تقول الفشل؛ الشريطُ إعلانٌ لا حالة)، و«مو هسّه»
 * يُخفيه لهذه الجلسة وحدها.
 * ========================================================================= */
const LATER = "vp_pmatch_later:";

export default function MatchBanner({ className = "mb-4" }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const key = user?.clinic_id ?? user?.id ?? null;
  const allowed = can("manageProductPhotos") || can("manageStore");
  const [later, setLater] = useState(() => {
    try { return !!key && sessionStorage.getItem(LATER + key) === "1"; } catch { return false; }
  });
  const { state } = useMatchData(key, allowed && !later);
  const counts = useMemo(() => {
    if (typeof state !== "object" || !key) return null;
    const rej = loadRejects(key);
    const r = matchAll(state.products, state.library, { skip: (pid, path) => rej.has(rejectKey(pid, path)) });
    return { missing: r.code.length + r.name.length, replace: r.replace.length };
  }, [state, key]);

  if (!allowed || later || !counts || counts.missing + counts.replace === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10", className)} data-pmatch-banner>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white"><Sparkles size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-ink">
          {counts.missing > 0 ? t("pmbn.banner", { n: formatNum(counts.missing) }) : t("pmbn.bannerOnlyReplace", { n: formatNum(counts.replace) })}
        </p>
        {counts.missing > 0 && counts.replace > 0 && (
          <p className="text-xs font-semibold text-ink-muted">{t("pmbn.bannerReplace", { n: formatNum(counts.replace) })}</p>
        )}
      </div>
      <Link to="/photos/match" onClick={() => playTap()} data-pmatch-open
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition hover:bg-brand-700">
        {t("pmbn.bannerOpen")}
      </Link>
      <button type="button" onClick={() => {
        playTap(); setLater(true);
        try { if (key) sessionStorage.setItem(LATER + key, "1"); } catch { /* تخزينٌ مرفوض: يُخفى لهذه الرسمة */ }
      }} title={t("pmbn.bannerLater")} aria-label={t("pmbn.bannerLater")}
        className="grid h-10 w-10 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-2 hover:text-ink">
        <X size={16} />
      </button>
    </div>
  );
}
