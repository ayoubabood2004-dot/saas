import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Lock, Eye, Sparkles, ArrowLeft } from "lucide-react";
import { useSubscription, syncSubscriptionFromServer } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/**
 * Subscription gate around the app content:
 *   • blocked  (never paid, trial over) → force the subscribe screen, nothing else
 *   • readonly (was a subscriber, lapsed) → a persistent "read-only" banner
 *                (writes are separately blocked at the repo layer)
 *   • trialing with ≤3 days left → a gentle "trial ending" nudge
 * Writes for read-only clinics are enforced centrally in repo.ts; this is the
 * visible half of the same rule.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { access, status, trialDaysLeft } = useSubscription();

  useEffect(() => { void syncSubscriptionFromServer(); }, []);

  // Never-subscribed clinic: the system is hidden — only /subscribe is reachable.
  if (access === "blocked" && location.pathname !== "/subscribe") {
    return <Navigate to="/subscribe" replace />;
  }

  return (
    <>
      {access === "readonly" && location.pathname !== "/subscribe" && <ReadOnlyBanner />}
      {access === "full" && status === "trialing" && trialDaysLeft <= 3 && location.pathname !== "/subscribe" && (
        <TrialEndingBanner days={trialDaysLeft} />
      )}
      {children}
    </>
  );
}

function ReadOnlyBanner() {
  const navigate = useNavigate();
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-warn-200 bg-warn-50 px-4 py-2.5 text-sm text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
      <span className="flex items-center gap-2 font-semibold">
        <Eye size={16} className="shrink-0" />
        انتهى اشتراكك — أنت في وضع <b>القراءة فقط</b>. تقدر تشوف بياناتك، بس لا تقدر تضيف أو تعدّل حتى تجدّد.
      </span>
      <button
        onClick={() => navigate("/subscribe")}
        className="inline-flex items-center gap-1.5 rounded-full bg-warn-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-soft transition hover:bg-warn-700"
      >
        <Lock size={13} /> جدّد الاشتراك
      </button>
    </div>
  );
}

function TrialEndingBanner({ days }: { days: number }) {
  const navigate = useNavigate();
  return (
    <div className={cn("no-print flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm",
      days <= 1
        ? "border-danger-200 bg-danger-50 text-danger-800 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200"
        : "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200")}
    >
      <span className="flex items-center gap-2 font-semibold">
        <Sparkles size={16} className="shrink-0" />
        {days <= 1 ? "تنتهي فترتك التجريبية اليوم" : `تنتهي فترتك التجريبية خلال ${days} أيام`} — اشترك للاستمرار بلا انقطاع.
      </span>
      <button
        onClick={() => navigate("/subscribe")}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700"
      >
        اختر باقتك <ArrowLeft size={13} />
      </button>
    </div>
  );
}
