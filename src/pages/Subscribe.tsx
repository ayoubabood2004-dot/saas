import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Crown, Sparkles, Clock, ShieldCheck, Wallet, AlertTriangle, ArrowDown } from "lucide-react";
import { PLANS, priceUsd, periodMonths, usdToIqd, DEFAULT_USD_RATE, TRIAL_DAYS, type BillingPeriod } from "@/lib/plans";
import { useSubscription, activateSubscription, createPaymentLink, syncSubscriptionFromServer } from "@/lib/subscription";
import { sb } from "@/lib/clinicSync";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button, useToast } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/**
 * Subscription / billing page — a world-class pricing screen. Three plans
 * (monthly ↔ annual), each priced in USD with its live Iraqi-Dinar equivalent,
 * fronted by a status hero that shows the clinic's trial/subscription days at a
 * glance. On a real backend "subscribe" opens the Wayl hosted checkout; in demo
 * mode it activates locally so the whole flow stays testable.
 */
export function Subscribe() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sub, status, trialDaysLeft, periodDaysLeft } = useSubscription();
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const period: BillingPeriod = annual ? "annual" : "monthly";
  const plansRef = useRef<HTMLDivElement>(null);

  const scrollToPlans = () => {
    playTap();
    plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Heading */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/60 bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300">
          <Sparkles size={14} /> اشتراك doctorVet
        </span>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tighter2 text-ink sm:text-[2.6rem] sm:leading-tight">
          خطة تكبر مع عيادتك
        </h1>
        <p className="mt-3 text-lg text-ink-muted">
          أسعار واضحة بالدولار، تُدفع بالدينار بالسعر المكافئ. بدّل أو ألغِ متى ما تحب.
        </p>
      </div>

      {/* Status hero — the clinic's days at a glance */}
      <StatusHero
        status={status}
        trialDaysLeft={trialDaysLeft}
        periodDaysLeft={periodDaysLeft}
        planId={sub.plan}
        period={sub.period}
        onCta={scrollToPlans}
      />

      {/* Monthly / annual toggle */}
      <div className="mt-9 flex justify-center">
        <div className="inline-flex items-center rounded-full border border-line bg-surface-1 p-1 shadow-soft">
          <button
            onClick={() => { playTap(); setAnnual(false); }}
            className={cn("rounded-full px-6 py-2 text-sm font-bold transition-all", !annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}
          >
            شهري
          </button>
          <button
            onClick={() => { playTap(); setAnnual(true); }}
            className={cn("rounded-full px-6 py-2 text-sm font-bold transition-all", annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}
          >
            سنوي
          </button>
        </div>
      </div>

      {/* Plans */}
      <div ref={plansRef} className="mt-8 grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((p, i) => {
          const usd = priceUsd(p, period);
          const iqd = usdToIqd(usd);
          const isCurrent = status === "active" && sub.plan === p.id;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className={cn(
                "relative flex flex-col rounded-3xl p-6 transition-shadow",
                p.popular
                  ? "border-2 border-brand-400/70 bg-gradient-to-b from-brand-50/70 to-surface-1 shadow-raised dark:border-brand-500/40 dark:from-brand-500/10 dark:to-surface-1 lg:-mt-3 lg:mb-3 lg:z-10"
                  : "border border-line bg-surface-1 shadow-card hover:shadow-raised",
              )}
            >
              {p.popular && (
                <span className="absolute -top-3.5 start-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand-grad px-4 py-1.5 text-2xs font-extrabold text-white shadow-soft">
                  <Crown size={13} /> الأكثر شيوعاً
                </span>
              )}

              {/* Name + positioning */}
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl font-extrabold text-ink">{p.name}</h3>
              </div>
              <p className="mt-1 min-h-[2.5rem] text-sm text-ink-subtle">{p.tag}</p>

              {/* Price */}
              <div className="mt-4 flex items-end gap-1.5">
                <span className="mb-1 font-display text-xl font-bold text-ink-subtle">$</span>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={period}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="font-display text-5xl font-extrabold leading-none tracking-tighter2 text-ink"
                  >
                    {formatNum(usd)}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1.5 text-sm font-semibold text-ink-subtle">/ {annual ? "سنة" : "شهر"}</span>
              </div>
              <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
                ≈ {money(iqd)} بالدينار
              </p>

              {/* CTA */}
              <Button
                className="mt-6 w-full"
                size="lg"
                variant={p.popular ? "primary" : "secondary"}
                loading={busy === p.id}
                disabled={isCurrent}
                onClick={() => subscribe(p.id)}
              >
                {isCurrent ? "خطتك الحالية ✓" : "اشترك الآن"}
              </Button>

              {/* Features */}
              <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-5">
                {p.feats.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-ink">
                    <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", p.popular ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" : "bg-success-50 text-success-600 dark:bg-success-500/15")}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      {/* Cash payment note */}
      <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface-1 p-5 text-center shadow-card sm:flex-row sm:text-start">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Wallet size={22} /></span>
        <div className="flex-1">
          <p className="font-display font-bold text-ink">تفضّل الدفع كاش؟</p>
          <p className="mt-0.5 text-sm text-ink-muted">تواصل معنا ونفعّل اشتراكك يدوياً بعد استلام المبلغ عبر المندوب.</p>
        </div>
      </div>

      {/* Trust row */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-2xs font-medium text-ink-subtle">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-success-600" /> دفع آمن عبر Wayl</span>
        <span className="opacity-40">•</span>
        <span>$1 = {formatNum(DEFAULT_USD_RATE)} دينار</span>
        <span className="opacity-40">•</span>
        <span>زين كاش · فاست باي · Qi</span>
        <span className="opacity-40">•</span>
        <span>كاش عبر مندوب</span>
      </div>

      {isPlatformAdmin(user?.email) && (
        <div className="mt-6 text-center">
          <button onClick={() => navigate("/admin")} className="text-xs font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
            لوحة المنصّة (تفعيل يدوي وسعر الصرف)
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Status hero — a premium banner that surfaces the clinic's remaining days.
 * Trialing / active render a circular progress ring around the day count;
 * expired / locked render a status icon. Each has a matching CTA.
 * ------------------------------------------------------------------------ */
function StatusHero({
  status, trialDaysLeft, periodDaysLeft, planId, period, onCta,
}: {
  status: string; trialDaysLeft: number; periodDaysLeft: number;
  planId: string | null; period: string | null; onCta: () => void;
}) {
  const planName = PLANS.find((p) => p.id === planId)?.name;

  if (status === "trialing") {
    const total = Math.max(TRIAL_DAYS, trialDaysLeft);
    return (
      <HeroShell tone="brand">
        <Ring pct={trialDaysLeft / total} tone="brand" days={trialDaysLeft} />
        <HeroText
          eyebrow="الفترة التجريبية"
          title={`باقي ${formatNum(trialDaysLeft)} يوم من تجربتك المجانية`}
          body="كل الميزات مفتوحة. اشترك قبل انتهاء التجربة حتى لا يتوقف النظام."
        />
        <Button className="shrink-0" onClick={onCta} rightIcon={<ArrowDown size={16} />}>اختر باقة</Button>
      </HeroShell>
    );
  }

  if (status === "active") {
    const total = periodDaysLeft > 0 ? Math.max(periodDaysLeft, period === "annual" ? 365 : 30) : 30;
    return (
      <HeroShell tone="success">
        <Ring pct={periodDaysLeft / total} tone="success" days={periodDaysLeft} />
        <HeroText
          eyebrow={planName ? `خطة ${planName} · فعّالة` : "اشتراكك فعّال"}
          title={`باقي ${formatNum(periodDaysLeft)} يوم على التجديد`}
          body="كل شيء يعمل. نذكّرك قبل انتهاء المدّة لتجديد اشتراكك."
        />
      </HeroShell>
    );
  }

  if (status === "expired") {
    return (
      <HeroShell tone="warn">
        <IconBadge tone="warn"><Clock size={30} /></IconBadge>
        <HeroText
          eyebrow="انتهى الاشتراك"
          title="وضع القراءة فقط"
          body="تقدر تشوف بياناتك وسجلاتك، بس لا تقدر تضيف أو تبيع حتى تجدّد."
        />
        <Button className="shrink-0" onClick={onCta} rightIcon={<ArrowDown size={16} />}>جدّد الآن</Button>
      </HeroShell>
    );
  }

  // locked
  return (
    <HeroShell tone="danger">
      <IconBadge tone="danger"><AlertTriangle size={30} /></IconBadge>
      <HeroText
        eyebrow="انتهت الفترة التجريبية"
        title="فعّل النظام للمتابعة"
        body="اشترك بأي خطة للوصول لعيادتك وكل ميزاتها."
      />
      <Button className="shrink-0" onClick={onCta} rightIcon={<ArrowDown size={16} />}>اختر باقة</Button>
    </HeroShell>
  );
}

const TONE: Record<string, { wrap: string; text: string }> = {
  brand:   { wrap: "border-brand-200/70 bg-gradient-to-br from-brand-50 to-surface-1 dark:border-brand-500/25 dark:from-brand-500/10 dark:to-surface-1", text: "text-brand-600 dark:text-brand-300" },
  success: { wrap: "border-success-200/70 bg-gradient-to-br from-success-50 to-surface-1 dark:border-success-500/25 dark:from-success-500/10 dark:to-surface-1", text: "text-success-600 dark:text-success-300" },
  warn:    { wrap: "border-warn-200/70 bg-gradient-to-br from-warn-50 to-surface-1 dark:border-warn-500/25 dark:from-warn-500/10 dark:to-surface-1", text: "text-warn-700 dark:text-warn-300" },
  danger:  { wrap: "border-danger-200/70 bg-gradient-to-br from-danger-50 to-surface-1 dark:border-danger-500/25 dark:from-danger-500/10 dark:to-surface-1", text: "text-danger-600 dark:text-danger-300" },
};

function HeroShell({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn("mx-auto mt-8 flex max-w-3xl flex-col items-center gap-5 rounded-3xl border p-6 text-center shadow-card sm:flex-row sm:text-start", TONE[tone].wrap)}
    >
      {children}
    </motion.div>
  );
}

function HeroText({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-2xs font-extrabold uppercase tracking-wider text-ink-subtle">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{title}</h2>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </div>
  );
}

/** Circular progress ring with the day count in the middle. */
function Ring({ pct, tone, days }: { pct: number; tone: "brand" | "success"; days: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className={cn("relative grid h-[88px] w-[88px] shrink-0 place-items-center", TONE[tone].text)}>
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} strokeWidth="7" className="fill-none stroke-current opacity-15" />
        <motion.circle
          cx="44" cy="44" r={r} strokeWidth="7" strokeLinecap="round"
          className="fill-none stroke-current"
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - clamped) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ strokeDasharray: circ }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="font-display text-2xl font-extrabold text-ink">{formatNum(days)}</div>
          <div className="text-2xs font-semibold text-ink-subtle">يوم</div>
        </div>
      </div>
    </div>
  );
}

function IconBadge({ tone, children }: { tone: "warn" | "danger"; children: React.ReactNode }) {
  return (
    <div className={cn("grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-white/60 shadow-soft dark:bg-white/5", TONE[tone].text)}>
      {children}
    </div>
  );
}
