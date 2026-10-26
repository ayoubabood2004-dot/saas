/* ============================================================================
 * بطاقاتُ الأسعار — شهريٌّ افتراضاً (دراسةُ السعر: العرضُ السنويّ افتراضاً يُظهر رقماً كبيراً
 * والعاديةُ والمطوّرة بلا خصمٍ سنويّ أصلاً). والتوفيرُ يُذكر حيث هو حقيقيٌّ وحده (السوبر).
 *
 * الأسعارُ تُرسم ثابتةً ساعةَ البناء، ثم تُسأل `public_pricing()` بعد التحميل: تعديلُ المالك لسعرٍ
 * من لوحته يصل للزائر بلا نشر — والدينارُ هو ما تقبضه Wayl حرفاً بحرف (`iqdOf`).
 * ==========================================================================*/
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { editionByCode, fmtNum, fmtPrice, priceFor } from "../editions";
import type { PlanId, PricingData } from "../types";
import { livePricing } from "../livePricing";

export interface PricingTableProps {
  edition: string;
  data: PricingData;
  plans: { id: PlanId; name: string; for: string; cta: string; badge?: string; highlights: string[]; href: string }[];
  labels: { monthly: string; annual: string; save: string; perMonth: string; perYear: string; perDay: string; usdLine: string };
}

export default function PricingTable({ edition, data: initial, plans, labels }: PricingTableProps) {
  const ed = editionByCode(edition)!;
  const [annual, setAnnual] = useState(false);
  const [data, setData] = useState(initial);
  useEffect(() => {
    let alive = true;
    livePricing().then((d) => { if (alive && d) setData(d); }).catch(() => { /* تبقى أسعارُ البناء */ });
    return () => { alive = false; };
  }, []);

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div role="radiogroup" className="inline-flex rounded-full border border-rule bg-white p-1">
          {([false, true] as const).map((a) => (
            <button
              key={String(a)}
              type="button"
              role="radio"
              aria-checked={annual === a}
              onClick={() => setAnnual(a)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${annual === a ? "bg-navy text-white" : "text-navy-2 hover:text-navy"}`}
            >
              {a ? labels.annual : labels.monthly}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const pr = priceFor(ed, p.id, data);
          const amount = annual ? pr.annual : pr.monthly;
          const saving = pr.monthly * 12 - pr.annual;
          const perDay = (annual ? pr.annual / 365 : pr.monthly / 30);
          const featured = !!p.badge;
          return (
            <article key={p.id} className={`relative flex flex-col rounded-3xl border bg-white p-7 ${featured ? "border-stamp shadow-[0_30px_60px_-34px_rgb(62_47_179/0.55)]" : "border-rule"}`}>
              {p.badge && <span className="absolute -top-3 start-7 rounded-full bg-stamp px-3 py-1 text-xs font-bold text-white">{p.badge}</span>}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <p className="mt-1 min-h-[3rem] text-sm leading-6 text-navy-3">{p.for}</p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="num font-display text-4xl font-bold tracking-tight text-navy" dir="auto">{fmtPrice(ed, pr.currency, amount)}</span>
                <span className="text-sm text-navy-3">{annual ? labels.perYear : labels.perMonth}</span>
              </p>
              <p className="mt-1 text-xs text-navy-3">
                {labels.perDay.replace("{{amount}}", fmtPrice(ed, pr.currency, perDay, pr.currency !== "IQD" && perDay < 10 ? 2 : 0))}
              </p>
              {pr.currency === "IQD" && (
                <p className="mt-0.5 text-xs text-navy-3">{labels.usdLine.replace("{{amount}}", `$${fmtNum(annual ? pr.usdAnnual : pr.usdMonthly)}`)}</p>
              )}
              {annual && saving > 0 && (
                <p className="mt-2 inline-flex w-fit rounded-full bg-dose-50 px-2.5 py-0.5 text-xs font-bold text-dose-700">
                  {labels.save.replace("{{amount}}", fmtPrice(ed, pr.currency, saving))}
                </p>
              )}
              <a href={p.href} data-cta={`plan-${p.id}`} className={`mt-6 ${featured ? "btn-primary" : "btn-ghost"}`}>{p.cta}</a>
              <ul className="mt-6 space-y-2.5 border-t border-rule pt-5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm leading-6 text-navy-2">
                    <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-dose" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
