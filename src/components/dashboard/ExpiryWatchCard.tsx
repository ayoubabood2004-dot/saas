import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CalendarX } from "lucide-react";
import type { Product } from "@/types";
import { Card, CardTitle, Button, Badge, Skeleton } from "@/components/ui";
import { money, formatNum, localISO } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { useOverride } from "@/lib/managerOverride";
import { getExpiryWindows } from "@/lib/settings";
import { expiryWatch, daysToExpiry } from "@/lib/expiry";

/* ============================================================================
 * كارتُ «قرب الانتهاء» بالرئيسية (م١ ٢·١) — الإنذارُ يمشي للمستخدم.
 *
 * بطاقةُ المخزون لا يراها إلا من فتح المخزون بنفسه؛ هذا يراه كلُّ من يفتح التطبيق.
 * ويُحسب من قائمة المنتجات **المحمَّلة أصلاً** بالرئيسية — صفرُ طلبٍ جديد — وبنفس
 * سلّة الشريحة التي يفتحها (`expiryWatch` ← `expiryBucket`)، فالعددُ هنا = طولُ القائمة هناك.
 *
 * يعرض **كلَّ** ما بمدة الإرجاع غيرَ المكتوم، لا «ما دخل هذا الأسبوع» وحدَه: مادةٌ دخلت
 * الأسبوعَ الماضي ولم يُتصرَّف بها كانت ستسقط من الكارت بصمتٍ بعد سبعة أيام. «هذا
 * الأسبوع» سطرٌ تحتها، والمنتهيةُ على الرفّ سطرٌ أحمرُ منفصل: خسارةٌ لا إنذار.
 *
 * القيمةُ بسعر الشراء هي الاستثناءُ الوحيد من «لا أرقامَ مال بالرئيسية» — لأنها مالٌ
 * يضيع لا مالٌ دخل، والدينارُ يحرّك حيث العددُ وحدَه لا (الخطة) — وتختفي بوضع المدير
 * كبطاقة «قيمة المخزون». وفشلُ جلب المنتجات يقول «تعذّر الفحص» لا «ماكو شي».
 * ========================================================================= */
export function ExpiryWatchCard({ products, loading, failed }: { products: Product[]; loading: boolean; failed: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { restricted } = useOverride();
  const w = getExpiryWindows();
  /* اليومُ مفتاحُ الحساب: شاشةٌ مفتوحةٌ طوال الليل كانت تبقي منتهيةَ الأمس «بالمدة» وشارتُها
   * «باقي -1 يوم» — والقائمةُ والشارةُ الآن من يومٍ واحد. */
  const today = localISO();
  const watch = useMemo(() => expiryWatch(products, w, today), [products, w.returnDays, w.criticalDays, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (filter: "return" | "expired") => { playTap(); navigate(`/inventory?filter=${filter}`); };
  const shown = watch.window.slice(0, 5);

  return (
    <Card padded data-expirycard>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle>{t("expiry.cardTitle")}</CardTitle>
        <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={15} />} onClick={() => open("return")}>
          {t("expiry.cardOpen")}
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
      ) : failed ? (
        <div className="flex items-center gap-3 rounded-2xl border border-warn-200 bg-warn-50/60 p-4 dark:border-warn-500/25 dark:bg-warn-500/10" data-expiryfailed>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-500 text-white"><AlertTriangle size={18} /></span>
          <p className="text-sm font-medium text-warn-800 dark:text-warn-200">{t("expiry.cardFailed")}</p>
        </div>
      ) : watch.window.length === 0 && watch.expired.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-success-100 bg-success-50/60 p-4 dark:border-success-500/20 dark:bg-success-500/10" data-expirynone>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-500 text-white"><CheckCircle2 size={18} /></span>
          <p className="text-sm font-medium text-success-800 dark:text-success-200">{t("expiry.cardNone", { n: w.returnDays })}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {watch.expired.length > 0 && (
            <button type="button" onClick={() => open("expired")} data-expiryexpired
              className="flex w-full items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50/70 p-3 text-start transition hover:bg-danger-50 dark:border-danger-500/30 dark:bg-danger-500/10">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger-500 text-white"><CalendarX size={17} /></span>
              <p className="min-w-0 flex-1 text-sm font-bold text-danger-700 dark:text-danger-300">
                {restricted
                  ? t("expiry.cardExpiredN", { n: formatNum(watch.expired.length) })
                  : t("expiry.cardExpired", { n: formatNum(watch.expired.length), v: money(Math.round(watch.expiredValue)) })}
              </p>
            </button>
          )}
          {watch.window.length > 0 && (
            <div className="rounded-2xl border border-warn-200 bg-warn-50/50 p-3 dark:border-warn-500/25 dark:bg-warn-500/10" data-expirywindow>
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <CalendarClock size={16} className="text-warn-600" />
                {t("expiry.cardHead", { n: formatNum(watch.window.length) })}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {!restricted && <span className="font-semibold text-warn-700 dark:text-warn-300" data-expiryvalue>{t("expiry.cardValue", { v: money(Math.round(watch.windowValue)) })}</span>}
                {!restricted && watch.newThisWeek.length > 0 && " · "}
                {watch.newThisWeek.length > 0 && <span data-expirynew>{t("expiry.cardNew", { n: formatNum(watch.newThisWeek.length) })}</span>}
              </p>
            </div>
          )}
          {shown.map((p) => {
            const d = daysToExpiry(p.expiry_date, today) ?? 0;
            return (
              <button key={p.id} type="button" onClick={() => open("return")}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-warn-200 hover:bg-surface-2 dark:hover:border-warn-500/40">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</p>
                <Badge tone={d <= w.criticalDays ? "danger" : "warn"}>{d === 0 ? t("expiry.lastDay") : t("expiry.daysLeft", { n: formatNum(d) })}</Badge>
              </button>
            );
          })}
          {watch.window.length > shown.length && (
            <p className="pt-1 text-center text-xs text-ink-subtle">{t("expiry.more", { n: formatNum(watch.window.length - shown.length) })}</p>
          )}
        </div>
      )}
    </Card>
  );
}
