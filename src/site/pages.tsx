/* قوالبُ صفحات الموقع — هيكلٌ بلا نصّ؛ النصُّ كلُّه من المحتوى (العربية البيضاء + طبقة اللهجة). */
import { ArrowLeft, ArrowRight, Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { useSite, href, signupHref, fill } from "./ctx";
import { Page, Breadcrumbs, countryName } from "./layout";
import { Section, CtaPair, Reassure, FaqList, CellMark, MockSheet, StampDot } from "./ui";
import { Booklet } from "./Booklet";
import { Island } from "./island";
import type { FeatureSlug, PlanId } from "./types";
import type { PricingTableProps } from "./islands/PricingTable";
import type { TourTabsProps } from "./islands/TourTabs";
import type { RoiCalcProps } from "./islands/RoiCalc";
import type { PriceFromProps } from "./islands/PriceFrom";

/** سهمٌ يتبع اتجاه القراءة. */
function Fwd({ size = 16 }: { size?: number }) {
  const { ed } = useSite();
  const A = ed.lang === "ar" ? ArrowLeft : ArrowRight;
  return <A size={size} aria-hidden />;
}

function FinalCta({ title, sub, at }: { title: string; sub: string; at: string }) {
  const { ed, c } = useSite();
  return (
    <Section tone="ink">
      <div className="relative overflow-hidden rounded-[32px] bg-[radial-gradient(120%_140%_at_100%_0%,#1266D8_0%,#173563_55%,#132B50_100%)] px-6 py-14 text-center ring-1 ring-white/10 sm:px-14">
        <span aria-hidden className="stamp absolute -top-6 end-8 h-28 w-28 border-white/25 text-white/25" />
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-white/80">{sub}</p>
        <div className="mt-8 flex justify-center">
          <CtaPair primary={c.common.cta.primary} primaryHref={signupHref(ed, at)} secondary={c.common.nav.pricing} secondaryHref={href(ed.code, "pricing")} at={at} light />
        </div>
        <div className="flex justify-center"><Reassure text={c.common.cta.reassure} light /></div>
      </div>
    </Section>
  );
}

const ROI_FEE: Record<string, number> = { IQD: 15000, SAR: 150, AED: 150, QAR: 150, KWD: 10, BHD: 10, OMR: 10, JOD: 15, ILS: 80, EGP: 300, MAD: 150, TND: 40, DZD: 2000, LYD: 50, MRU: 600, USD: 20 };

/* ══════════════════════════════ الرئيسية ══════════════════════════════ */
export function HomePage() {
  const { ed, c, pricing } = useSite();
  const h = c.home;
  const tour: TourTabsProps = {
    tabs: h.tour.tabs.map((t) => ({ key: t.key, label: t.label, title: t.title, body: t.body, bullets: t.bullets, href: href(ed.code, "feature", t.feature) })),
    more: c.common.learnMore,
    rtl: ed.lang === "ar",
  };
  return (
    <Page>
      {/* البطل: النتيجةُ لا الوصف، وبطاقةُ التطعيم توقيعاً */}
      <section className="relative overflow-hidden pb-16 pt-12 sm:pb-24 sm:pt-16">
        <div aria-hidden className="pointer-events-none absolute -top-40 end-[-10%] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(18,102,216,0.12),transparent)]" />
        <div className="container grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="eyebrow"><StampDot />{h.hero.badge}</p>
            <h1 className="mt-4 text-balance font-display text-[2.35rem] font-bold leading-[1.18] tracking-tight sm:text-[3.4rem]">
              {h.hero.title} <span className="text-brand-600">{h.hero.titleAccent}</span>
            </h1>
            <p className="lead mt-5 max-w-xl">{h.hero.sub}</p>
            <div className="mt-8">
              <CtaPair primary={c.common.cta.primary} primaryHref={signupHref(ed, "hero")} secondary={c.common.cta.secondary} secondaryHref={href(ed.code, "features")} at="hero" />
            </div>
            <Reassure text={c.common.cta.reassure} />
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {h.hero.points.map((pt) => (
                <li key={pt} className="flex items-start gap-2 text-sm leading-6 text-navy-2">
                  <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-dose" /><span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
          {h.hero.card ? <Booklet c={h.hero.card} /> : null}
        </div>
      </section>

      <Section tone="white" title={h.segments.title} sub={h.segments.sub}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {h.segments.items.map((s) => (
            <a key={s.key} href={s.link === "start" ? href(ed.code, "start") : s.link === "pricing" ? href(ed.code, "pricing") : href(ed.code, "feature", s.link)} className="group card flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-300">
              <h3 className="font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-7 text-navy-3">{s.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">{c.common.learnMore}<Fwd /></span>
            </a>
          ))}
        </div>
      </Section>

      <Section title={h.pains.title} sub={h.pains.sub}>
        <ul className="grid gap-4 lg:grid-cols-2">
          {h.pains.items.map((p) => (
            <li key={p.pain} className="card grid gap-4 p-6 sm:grid-cols-2">
              <p className="flex items-start gap-2 text-[15px] leading-7 text-navy-2"><TriangleAlert size={18} aria-hidden className="mt-1 shrink-0 text-due" />{p.pain}</p>
              <a href={href(ed.code, "feature", p.feature)} className="flex items-start gap-2 rounded-2xl bg-dose-50 p-4 text-[15px] font-semibold leading-7 text-dose-700 hover:underline">
                <Check size={18} aria-hidden className="mt-1 shrink-0" />{p.fix}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="white" title={h.tour.title} sub={h.tour.sub}>
        <Island name="TourTabs" props={tour} />
      </Section>

      <Section title={h.diff.title} sub={h.diff.sub}>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {h.diff.items.map((d) => (
            <div key={d.title} className="border-t-2 border-navy pt-5">
              <h3 className="font-display text-lg font-bold">{d.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-navy-3">{d.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="white" title={h.start.title} sub={h.start.sub}>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {h.start.steps.map((s, i) => (
            <li key={s.title} className="card relative p-6">
              <span className="stamp h-11 w-11 font-display text-base font-bold">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-navy-3">{s.body}</p>
            </li>
          ))}
        </ol>
        <a href={href(ed.code, "start")} className="mt-8 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">{h.start.link}<Fwd /></a>
      </Section>

      <Section title={h.pricingTeaser.title} sub={h.pricingTeaser.sub}>
        <div className="card flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center">
          <Island name="PriceFrom" props={{ edition: ed.code, data: pricing, from: h.pricingTeaser.from, perMonth: c.pricing.perMonth } satisfies PriceFromProps} />
          <a href={href(ed.code, "pricing")} className="btn-ghost">{h.pricingTeaser.link}</a>
        </div>
      </Section>

      <Section tone="white" title={h.security.title} sub={h.security.sub}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {h.security.items.map((s) => (
            <div key={s.title} className="rounded-3xl bg-paper p-6">
              <ShieldCheck size={22} aria-hidden className="text-stamp" />
              <h3 className="mt-3 font-display text-base font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-navy-3">{s.body}</p>
            </div>
          ))}
        </div>
        <a href={href(ed.code, "security")} className="mt-8 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">{h.security.link}<Fwd /></a>
      </Section>

      <Section title={h.faq.title}>
        <FaqList items={h.faq.items} />
        <a href={href(ed.code, "faq")} className="mt-8 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">{h.faq.link}<Fwd /></a>
      </Section>

      <FinalCta title={h.final.title} sub={h.final.sub} at="final" />
    </Page>
  );
}

/* ══════════════════════════════ الأسعار ═══════════════════════════════ */
export function PricingPage() {
  const { ed, c, pricing } = useSite();
  const p = c.pricing;
  const ids: PlanId[] = ["basic", "advanced", "super"];
  const table: PricingTableProps = {
    edition: ed.code,
    data: pricing,
    plans: ids.map((id) => ({ id, ...p.plans[id], href: signupHref(ed, `plan-${id}`) })),
    labels: { monthly: p.toggle.monthly, annual: p.toggle.annual, save: p.toggle.save, perMonth: p.perMonth, perYear: p.perYear, perDay: p.perDay, usdLine: p.usdLine },
  };
  // ثمنُ الجرعة المعزّزة بعملة العيادة نفسها، لا بعملة الاشتراك: الحاسبةُ كانت تتبع السعر، فبلا سعرٍ محلّيّ
  // حسبت بالدولار تحت حقلٍ عنوانُه «بالريال».
  const roi: RoiCalcProps = {
    edition: ed.code, currency: ed.currency,
    title: p.roi.title, sub: p.roi.sub, missedLabel: p.roi.missedLabel, feeLabel: p.roi.feeLabel, result: p.roi.result, note: p.roi.note,
    defaults: { missed: 10, fee: ROI_FEE[ed.currency] ?? 20 },
  };
  return (
    <Page>
      <section className="pb-6 pt-14 text-center sm:pt-20">
        <div className="container">
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">{p.hero.title}</h1>
          <p className="lead mx-auto mt-4 max-w-2xl">{p.hero.sub}</p>
        </div>
      </section>
      <section className="pb-16">
        <div className="container">
          <Island name="PricingTable" props={table} />
          <p className="mt-6 text-center text-sm text-navy-3">{ed.payOnline ? p.payment.iraq : fill(p.payment.other, { country: countryName(ed.country, ed.lang) })}</p>
        </div>
      </section>

      <Section tone="white" title={p.includes.title}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.includes.items.map((it) => (
            <li key={it} className="flex items-start gap-2.5 rounded-2xl bg-paper px-4 py-3 text-[15px] leading-7 text-navy-2"><Check size={18} aria-hidden className="mt-1 shrink-0 text-dose" />{it}</li>
          ))}
        </ul>
      </Section>

      <Section title={p.compare.title}>
        <div className="overflow-x-auto rounded-3xl border border-rule bg-white">
          <table className="w-full min-w-[640px] border-collapse text-start">
            {/* لا `sticky` هنا: داخل صندوق التمرير الأفقي يلتصق بالصندوق لا بالشاشة، فينزل ٦٤ بكسلاً ويغطّي عنوانَ أوّل مجموعة. */}
            <thead className="bg-white">
              <tr className="border-b border-rule">
                <th scope="col" className="px-5 py-4 text-start text-sm font-semibold text-navy-3">{p.compare.plansHeader}</th>
                {ids.map((id) => <th key={id} scope="col" className="px-5 py-4 text-center font-display text-base font-bold">{p.plans[id].name}</th>)}
              </tr>
            </thead>
            {p.compare.groups.map((g) => (
              <tbody key={g.title}>
                <tr><th colSpan={4} scope="colgroup" className="bg-paper px-5 py-3 text-start text-sm font-bold text-stamp">{g.title}</th></tr>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-t border-rule">
                    <th scope="row" className="px-5 py-3.5 text-start text-sm font-medium text-navy-2">{r.label}</th>
                    {/* نصٌّ واحدٌ للباقات الثلاث («باقة منفصلة») خليةٌ واحدة — مكرّراً ثلاثاً يُقرأ كأنه بكلّ باقة. */}
                    {typeof r.basic === "string" && ids.every((id) => r[id] === r.basic)
                      ? <td colSpan={ids.length} className="px-5 py-3.5 text-center"><CellMark v={r.basic} /></td>
                      : ids.map((id) => <td key={id} className="px-5 py-3.5 text-center"><CellMark v={r[id]} /></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Section>

      <Section tone="white">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-paper p-7">
            <h2 className="font-display text-2xl font-bold">{p.trial.title}</h2>
            <ul className="mt-5 space-y-3">
              {p.trial.items.map((t) => <li key={t} className="flex items-start gap-2.5 text-[15px] leading-7 text-navy-2"><Check size={18} aria-hidden className="mt-1 shrink-0 text-dose" />{t}</li>)}
            </ul>
          </div>
          <div className="rounded-3xl bg-paper p-7">
            <h2 className="font-display text-2xl font-bold">{p.payment.title}</h2>
            <p className="mt-5 text-[15px] leading-8 text-navy-2">{ed.payOnline ? p.payment.iraq : fill(p.payment.other, { country: countryName(ed.country, ed.lang) })}</p>
          </div>
        </div>
      </Section>

      <Section><Island name="RoiCalc" props={roi} /></Section>

      <Section tone="white" title={p.faq.title}><FaqList items={p.faq.items} /></Section>
      <FinalCta title={p.final.title} sub={p.final.sub} at="pricing-final" />
    </Page>
  );
}

/* ══════════════════════════ فهرسُ التصنيفات ════════════════════════════ */
export function FeaturesPage() {
  const { ed, c } = useSite();
  return (
    <Page>
      <section className="pb-4 pt-14 sm:pt-20">
        <div className="container">
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">{c.features.hero.title}</h1>
          <p className="lead mt-4 max-w-2xl">{c.features.hero.sub}</p>
        </div>
      </section>
      {c.common.mega.groups.map((g) => (
        <Section key={g.title} eyebrow={g.title}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((s) => <FeatureCard key={s} slug={s} />)}
          </div>
        </Section>
      ))}
      <Section eyebrow={c.common.mega.featured.title}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><FeatureCard slug={c.common.mega.featured.slug} /></div>
      </Section>
      <FinalCta title={c.home.final.title} sub={c.home.final.sub} at="features-final" />
    </Page>
  );
  function FeatureCard({ slug }: { slug: FeatureSlug }) {
    const f = c.feature[slug];
    return (
      <a href={href(ed.code, "feature", slug)} className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-300">
        <span className="text-xs font-bold text-stamp">{c.common.planBadge[f.plan]}</span>
        <h2 className="mt-2 font-display text-lg font-bold">{c.features.cards[slug].title}</h2>
        <p className="mt-2 flex-1 text-sm leading-7 text-navy-3">{c.features.cards[slug].short}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">{c.common.learnMore}<Fwd /></span>
      </a>
    );
  }
}

/* ══════════════════════════════ تصنيف ════════════════════════════════ */
export function FeaturePage({ slug }: { slug: FeatureSlug }) {
  const { ed, c } = useSite();
  const f = c.feature[slug];
  return (
    <Page>
      <section className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <div className="container">
          <Breadcrumbs trail={[[c.common.breadcrumbHome, href(ed.code, "home")], [c.common.mega.all, href(ed.code, "features")], [c.features.cards[slug].title, null]]} />
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div>
              <p className="eyebrow"><StampDot />{f.hero.eyebrow}</p>
              <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-[1.2] sm:text-5xl">{f.hero.title}</h1>
              <p className="lead mt-5 max-w-xl">{f.hero.sub}</p>
              <p className="mt-5 inline-flex rounded-full bg-stamp-50 px-3 py-1 text-sm font-semibold text-stamp">{c.common.planBadge[f.plan]}</p>
              <div className="mt-7"><CtaPair primary={c.common.cta.primary} primaryHref={signupHref(ed, `feature-${slug}`)} secondary={c.common.nav.pricing} secondaryHref={href(ed.code, "pricing")} at={`feature-${slug}`} /></div>
              <Reassure text={c.common.cta.reassure} />
            </div>
            <MockSheet title={f.mock.title} label={c.common.demoLabel} rows={f.mock.rows} />
          </div>
        </div>
      </section>

      <Section tone="white" title={f.pains.title}>
        <div className="grid gap-4 md:grid-cols-3">
          {f.pains.items.map((p) => (
            <div key={p.title} className="rounded-3xl bg-paper p-6">
              <TriangleAlert size={20} aria-hidden className="text-due" />
              <h3 className="mt-3 font-display text-lg font-bold">{p.title}</h3>
              <p className="mt-2 text-sm leading-7 text-navy-3">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={f.steps.title}>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {f.steps.items.map((s, i) => (
            <li key={s.title} className="card p-6">
              <span className="stamp h-11 w-11 font-display text-base font-bold">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-navy-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="white" title={f.caps.title}>
        <div className="space-y-12">
          {f.caps.groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-5 flex items-center gap-2 font-display text-xl font-bold"><StampDot />{g.title}</h3>
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => (
                  <div key={it.title} className="border-t border-rule pt-4">
                    <p className="font-semibold text-navy">{it.title}</p>
                    <p className="mt-1.5 text-sm leading-7 text-navy-3">{it.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-stamp-50 p-6">
          <p className="max-w-3xl text-[15px] leading-7 text-navy-2"><span className="font-bold text-stamp">{c.common.planBadge[f.plan]} — </span>{f.planNote}</p>
          <a href={href(ed.code, "pricing")} className="btn-ghost">{c.common.nav.pricing}</a>
        </div>
      </Section>

      <Section title={c.home.faq.title}><FaqList items={f.faqs} /></Section>

      <Section tone="white" title={c.common.related}>
        <div className="grid gap-4 sm:grid-cols-3">
          {f.related.map((s) => (
            <a key={s} href={href(ed.code, "feature", s)} className="card group flex flex-col p-6 transition hover:border-brand-300">
              <span className="font-display text-lg font-bold">{c.features.cards[s].title}</span>
              <span className="mt-2 text-sm leading-7 text-navy-3">{c.features.cards[s].short}</span>
            </a>
          ))}
        </div>
        <a href={href(ed.code, "features")} className="mt-8 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">{c.common.backToFeatures}<Fwd /></a>
      </Section>
      <FinalCta title={c.home.final.title} sub={c.home.final.sub} at={`feature-${slug}-final`} />
    </Page>
  );
}

/* ═══════════════════════ الأسئلة · الأمان · كيف تبدأ ═══════════════════════ */
function SimpleHero({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="pb-6 pt-14 sm:pt-20">
      <div className="container">
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">{title}</h1>
        <p className="lead mt-4 max-w-2xl">{sub}</p>
      </div>
    </section>
  );
}

export function FaqPage() {
  const { c } = useSite();
  return (
    <Page>
      <SimpleHero title={c.faq.hero.title} sub={c.faq.hero.sub} />
      {c.faq.groups.map((g) => <Section key={g.title} eyebrow={g.title}><FaqList items={g.items} /></Section>)}
      <FinalCta title={c.home.final.title} sub={c.home.final.sub} at="faq-final" />
    </Page>
  );
}

export function SecurityPage() {
  const { c } = useSite();
  const s = c.security;
  return (
    <Page>
      <SimpleHero title={s.hero.title} sub={s.hero.sub} />
      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          {s.sections.map((x) => (
            <article key={x.title} className="card p-7">
              <ShieldCheck size={24} aria-hidden className="text-stamp" />
              <h2 className="mt-3 font-display text-xl font-bold">{x.title}</h2>
              <p className="mt-2 text-[15px] leading-7 text-navy-3">{x.body}</p>
              <ul className="mt-4 space-y-2">
                {x.bullets.map((b) => <li key={b} className="flex items-start gap-2 text-sm leading-6 text-navy-2"><Check size={16} aria-hidden className="mt-1 shrink-0 text-dose" />{b}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-3xl border border-due/25 bg-due-50 p-7">
          <h2 className="font-display text-xl font-bold">{s.limits.title}</h2>
          <ul className="mt-4 space-y-2">
            {s.limits.items.map((b) => <li key={b} className="flex items-start gap-2 text-[15px] leading-7 text-navy-2"><TriangleAlert size={17} aria-hidden className="mt-1 shrink-0 text-due" />{b}</li>)}
          </ul>
        </div>
      </Section>
      <FinalCta title={c.home.final.title} sub={c.home.final.sub} at="security-final" />
    </Page>
  );
}

export function StartPage() {
  const { c } = useSite();
  const s = c.start;
  return (
    <Page>
      <SimpleHero title={s.hero.title} sub={s.hero.sub} />
      <Section>
        <ol className="space-y-5">
          {s.steps.map((x, i) => (
            <li key={x.title} className="card grid gap-5 p-7 sm:grid-cols-[auto_1fr]">
              <span className="stamp h-14 w-14 font-display text-xl font-bold">{i + 1}</span>
              <div>
                <h2 className="font-display text-xl font-bold">{x.title}</h2>
                <p className="mt-2 text-[15px] leading-7 text-navy-3">{x.body}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {x.bullets.map((b) => <li key={b} className="flex items-start gap-2 text-sm leading-6 text-navy-2"><Check size={16} aria-hidden className="mt-1 shrink-0 text-dose" />{b}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-3xl bg-stamp-50 p-7">
          <h2 className="font-display text-xl font-bold">{s.honest.title}</h2>
          <ul className="mt-4 space-y-2">
            {s.honest.items.map((b) => <li key={b} className="flex items-start gap-2 text-[15px] leading-7 text-navy-2"><StampDot />{b}</li>)}
          </ul>
        </div>
      </Section>
      <Section tone="white" title={c.home.faq.title}><FaqList items={s.faq} /></Section>
      <FinalCta title={c.home.final.title} sub={c.home.final.sub} at="start-final" />
    </Page>
  );
}

export function LegalPage({ which }: { which: "privacy" | "terms" }) {
  const { c } = useSite();
  const l = c[which];
  return (
    <Page>
      <article className="container max-w-3xl py-14 sm:py-20">
        <h1 className="font-display text-4xl font-bold leading-tight">{l.title}</h1>
        <p className="mt-3 text-sm text-navy-3" dir="ltr">{l.updated}</p>
        <p className="lead mt-6">{l.intro}</p>
        {l.sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="font-display text-2xl font-bold">{s.title}</h2>
            <div className="prose-site mt-4">{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
          </section>
        ))}
      </article>
    </Page>
  );
}
