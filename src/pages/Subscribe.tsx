import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Crown, Sparkles, Clock, ShieldCheck, Wallet, AlertTriangle } from "lucide-react";
import { PLANS, priceUsd, periodMonths, usdToIqd, DEFAULT_USD_RATE, type BillingPeriod } from "@/lib/plans";
import { useSubscription, activateSubscription, createPaymentLink, syncSubscriptionFromServer } from "@/lib/subscription";
import { sb } from "@/lib/clinicSync";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button, useToast } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/**
 * Subscription / billing page. Shows the three plans (monthly ↔ annual), each
 * priced in USD with its live Iraqi-Dinar equivalent, plus the clinic's current
 * status. In Phase 1 the "subscribe" button activates locally so the whole flow
 * is testable; Phase 3 swaps that single call for the Wayl payment redirect.
 */
export function Subscribe() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sub, status, trialDaysLeft, periodDaysLeft } = useSubscription();
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const period: BillingPeriod = annual ? "annual" : "monthly";

  // Pull the authoritative state from the server; on returning from Wayl
  // (?paid=1) the webhook may still be settling, so re-check a moment later.
  useEffect(() => {
    void syncSubscriptionFromServer();
    if (new URLSearchParams(window.location.search).get("paid") === "1") {
      toast.success("نتحقق من دفعتك…", "لحظات وتُفعّل خطتك تلقائياً.");
      const t = setTimeout(() => void syncSubscriptionFromServer(), 3500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId)!;
    setBusy(planId);
    playTap();
    // Real backend → Wayl hosted checkout: create the link server-side (secret
    // stays on the server) and redirect. Activation happens on the verified
    // webhook. Demo mode has no server, so activate locally for testing.
    if (sb()) {
      try {
        const url = await createPaymentLink(plan.id, period);
        window.location.href = url;
        return;
      } catch (e) {
        setBusy(null);
        playWarning();
        toast.error("تعذّر بدء الدفع", e instanceof Error ? e.message : undefined);
        return;
      }
    }
    activateSubscription(plan.id, period, periodMonths(period));
    setBusy(null);
    playSuccess();
    toast.success(`تم تفعيل خطة ${plan.name} (تجريبياً)`, "على السيرفر الحقيقي يتم الدفع عبر Wayl.");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <Sparkles size={14} /> اشتراك doctorVet
        </span>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tighter2 text-ink sm:text-4xl">اختر باقتك</h1>
        <p className="mt-3 text-lg text-ink-muted">أسعار بالدولار، تُدفع بالدينار بالسعر المكافئ.</p>
      </div>

      {/* Current status */}
      <StatusBanner status={status} trialDaysLeft={trialDaysLeft} periodDaysLeft={periodDaysLeft} planId={sub.plan} />

      {/* Monthly / annual toggle */}
      <div className="mt-6 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 p-1">
          <button onClick={() => { playTap(); setAnnual(false); }} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", !annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>شهري</button>
          <button onClick={() => { playTap(); setAnnual(true); }} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>سنوي</button>
        </div>
      </div>

      <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const usd = priceUsd(p, period);
          const iqd = usdToIqd(usd);
          const isCurrent = status === "active" && sub.plan === p.id;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 shadow-card",
                p.popular ? "border-brand-300 bg-surface-1 ring-1 ring-brand-200 dark:border-brand-500/40 dark:ring-brand-500/20" : "border-line bg-surface-1",
              )}
            >
              {p.popular && <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1 text-2xs font-extrabold text-white shadow-soft">👑 الأكثر تكاملاً</span>}
              <div className="flex items-center gap-2">
                <p className="font-display text-lg font-extrabold text-ink">{p.name}</p>
                {p.popular && <Crown size={16} className="text-brand-500" />}
              </div>
              <p className="text-2xs font-semibold text-ink-subtle">{p.tag}</p>

              <div className="mt-4 flex items-end gap-1">
                <AnimatePresence mode="popLayout">
                  <motion.span key={period} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }} className="font-display text-4xl font-extrabold tracking-tighter2 text-ink">
                    ${usd}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1 text-sm font-semibold text-ink-subtle">/ {annual ? "سنة" : "شهر"}</span>
              </div>
              <p className="mt-1 text-xs text-ink-subtle">≈ {money(iqd)} بالدينار</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {p.feats.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-muted">
                    <Check size={17} className="mt-0.5 shrink-0 text-success-600" /> {f}
                  </li>
                ))}
                {p.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-subtle/70">
                    <X size={17} className="mt-0.5 shrink-0 text-ink-subtle/50" /> {f}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-6 w-full"
                variant={p.popular ? "primary" : "secondary"}
                loading={busy === p.id}
                disabled={isCurrent}
                onClick={() => subscribe(p.id)}
              >
                {isCurrent ? "خطتك الحالية ✓" : "اشترك الآن"}
              </Button>
            </motion.div>
          );
        })}
      </div>

      {/* Cash payment note */}
      <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface-1 p-5 text-center shadow-card sm:flex-row sm:text-start">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Wallet size={22} /></span>
        <div className="flex-1">
          <p className="font-display font-bold text-ink">تفضّل الدفع كاش؟</p>
          <p className="mt-0.5 text-sm text-ink-muted">تواصل معنا ونفعّل اشتراكك يدوياً بعد استلام المبلغ عبر المندوب.</p>
        </div>
      </div>

      <p className="mt-5 text-center text-2xs text-ink-subtle">
        <ShieldCheck size={13} className="inline" /> الدفع بالدينار بالسعر المكافئ ($1 = {formatNum(DEFAULT_USD_RATE)} دينار) · زين كاش · فاست باي · Qi · كاش عبر مندوب
      </p>

      {isPlatformAdmin(user?.email) && (
        <div className="mt-4 text-center">
          <button onClick={() => navigate("/admin")} className="text-xs font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
            لوحة المنصّة (تفعيل يدوي وسعر الصرف)
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBanner({ status, trialDaysLeft, periodDaysLeft, planId }: { status: string; trialDaysLeft: number; periodDaysLeft: number; planId: string | null }) {
  const planName = PLANS.find((p) => p.id === planId)?.name;
  const map: Record<string, { cls: string; icon: typeof Clock; title: string; body: string }> = {
    trialing: {
      cls: "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200",
      icon: Sparkles, title: `أنت في الفترة التجريبية — باقي ${formatNum(trialDaysLeft)} يوم`,
      body: "كل الميزات مفتوحة. اشترك قبل انتهاء التجربة حتى لا يتوقف النظام.",
    },
    active: {
      cls: "border-success-200 bg-success-50 text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200",
      icon: ShieldCheck, title: `اشتراكك فعّال${planName ? ` — خطة ${planName}` : ""}`,
      body: `باقي ${formatNum(periodDaysLeft)} يوم على التجديد.`,
    },
    expired: {
      cls: "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200",
      icon: Clock, title: "انتهى اشتراكك — الوصول للقراءة فقط",
      body: "تقدر تشوف بياناتك، بس لا تقدر تضيف أو تبيع حتى تجدّد.",
    },
    locked: {
      cls: "border-danger-200 bg-danger-50 text-danger-800 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200",
      icon: AlertTriangle, title: "انتهت الفترة التجريبية",
      body: "اشترك بأي خطة لتفعيل النظام والوصول لعيادتك.",
    },
  };
  const s = map[status] ?? map.trialing;
  const Icon = s.icon;
  return (
    <div className={cn("mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-2xl border px-4 py-3.5", s.cls)}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-bold">{s.title}</p>
        <p className="text-sm opacity-90">{s.body}</p>
      </div>
    </div>
  );
}
