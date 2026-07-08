import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles, ArrowLeft } from "lucide-react";
import { useEntitlements, minPlanFor, FEATURE_LABEL, type Feature } from "@/lib/entitlements";
import { planById } from "@/lib/plans";
import { Button } from "@/components/ui";
import { playTap } from "@/lib/sounds";

/**
 * Wraps a page/section that a clinic's PLAN may not include. If the plan allows
 * the feature (or the clinic is on its full-access trial) the children render;
 * otherwise a clean "upgrade" screen invites them to the matching plan. Blocks
 * direct-URL access too, since it lives inside the route element.
 */
export function FeatureGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { has } = useEntitlements();
  const navigate = useNavigate();

  if (has(feature)) return <>{children}</>;

  const plan = planById(minPlanFor(feature));
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4">
      <div className="w-full rounded-3xl border border-line bg-surface-1 p-8 text-center shadow-card">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-brand-grad text-white shadow-soft">
          <Lock size={28} />
        </span>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-ink">هذه الميزة ليست ضمن باقتك</h1>
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">{FEATURE_LABEL[feature]}</span> متوفّرة في باقة{" "}
          <span className="font-bold text-brand-600 dark:text-brand-300">{plan?.name}</span> وما فوق.
        </p>
        <Button className="mt-6 w-full" size="lg" leftIcon={<Sparkles size={16} />} onClick={() => { playTap(); navigate("/subscribe"); }}>
          رقِّ باقتك
        </Button>
        <button onClick={() => navigate(-1)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-ink">
          <ArrowLeft size={15} /> رجوع
        </button>
      </div>
    </div>
  );
}
