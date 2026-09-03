import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Lock, Eye, Sparkles, ArrowLeft } from "lucide-react";
import { useSubscription, syncSubscriptionFromServer } from "@/lib/subscription";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/platformAdmin";
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
  const { user } = useAuth();
  // مشغّلُ المنصّة (0151) قد يدخل عيادةً مقفلةً ليصلح لها — البوّابةُ لا تطرده.
  const operator = isPlatformAdmin(user?.email);

  useEffect(() => { void syncSubscriptionFromServer(); }, []);

  // Never-subscribed clinic: the system is hidden — only the subscribe screen
  // (and the platform-operator console) stay reachable.
  if (access === "blocked" && !operator && location.pathname !== "/subscribe" && location.pathname !== "/admin" && location.pathname !== "/platform") {
    return <Navigate to="/subscribe" replace />;
  }

  // شاشات الإنشاء بوضع القراءة فقط: نوقفها عند الباب بدل ما يملأ الطبيب
  // نموذجاً كاملاً ثم يُرفض بالحفظ. المنع الحقيقي بطبقة البيانات — هذا احترام
  // لوقته.
  if (access === "readonly" && CREATE_ROUTES.some((r) => location.pathname.startsWith(r))) {
    return (
      <>
        <ReadOnlyBanner />
        <LockedCreateNotice />
      </>
    );
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

/** المسارات التي وظيفتها إنشاء سجل جديد — تُقفل كلياً بوضع القراءة فقط. */
const CREATE_ROUTES = ["/new-case"];

function LockedCreateNotice() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
      <span className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-warn-50 text-warn-600 dark:bg-warn-500/15">
        <Lock size={28} />
      </span>
      <h1 className="text-lg font-extrabold text-ink">ما تكدر تفتح حالة جديدة</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        انتهى اشتراك العيادة، فالإضافة والتعديل متوقفان. كل بياناتك وحالاتك السابقة محفوظة
        وتقدر تشوفها وتطبعها — ويرجع كل شيء طبيعياً لحظة التجديد.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => navigate("/subscribe")}
          className="inline-flex items-center gap-1.5 rounded-full bg-warn-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-soft transition hover:bg-warn-700"
        >
          <Lock size={15} /> جدّد الاشتراك
        </button>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-bold text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          رجوع
        </button>
      </div>
    </div>
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
