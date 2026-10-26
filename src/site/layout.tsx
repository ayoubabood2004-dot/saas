/* إطارُ كلّ صفحة: الشريطُ المقترِح، والرأسُ، والمحتوى، والتذييلُ — بنسخةٍ ولغةٍ واحدة. */
import type { ReactNode } from "react";
import { Island } from "./island";
import { useSite, href, signupHref, loginHref, fill } from "./ctx";
import { EDITIONS, priceFor } from "./editions";
import { FEATURE_SLUGS } from "./types";
import type { SiteNavProps } from "./islands/SiteNav";
import type { SwitcherProps } from "./islands/EditionSwitcher";
import type { SuggestBarProps } from "./islands/SuggestBar";
import NAMES from "./data/names.json";

/** اسمُ الدولة بلغة الصفحة من بيانات CLDR — إلا ما يكتبه أهلُه بغير اسمها هناك (`data/names.json`). */
export function countryName(cc: string | null, lang: "ar" | "en"): string {
  if (!cc) return lang === "ar" ? "English" : "English";
  const own = (NAMES[lang] as Record<string, string>)[cc];
  if (own) return own;
  try { return new Intl.DisplayNames([lang], { type: "region" }).of(cc) ?? cc; } catch { return cc; }
}

/** ما بعد رمز النسخة بالمسار — المحوِّلُ يفتح الصفحةَ نفسها بنسخةٍ أخرى. */
function restOf(path: string, edition: string): string {
  const r = path.slice(edition.length + 1);
  return r === "/" ? "" : r;
}

export function switcherProps(compact = false, dark = false): SwitcherProps {
  const { ed, c, route, pricing } = useSite();
  return {
    current: ed.code,
    label: c.common.switcher.label,
    title: c.common.switcher.title,
    search: c.common.switcher.search,
    options: EDITIONS.map((e) => ({
      code: e.code,
      name: e.code === "en" ? c.common.switcher.english : countryName(e.country, ed.lang),
      // العملةُ التي تعرضها النسخةُ فعلاً: بلا سعرٍ ثبّته المالك بعملتها تعرض الدولار — فرمزُها «$» لا «ر.س».
      sym: priceFor(e, "basic", pricing).currency === e.currency ? (ed.lang === "ar" ? e.symAr : e.symEn) : "$",
    })),
    rest: route.edition ? restOf(route.path, route.edition) : "",
    compact,
    dark,
  };
}

function Header() {
  const { ed, c } = useSite();
  const card = (slug: (typeof FEATURE_SLUGS)[number]) => ({ title: c.features.cards[slug].title, short: c.features.cards[slug].short, href: href(ed.code, "feature", slug) });
  const props: SiteNavProps = {
    dir: ed.lang === "ar" ? "rtl" : "ltr",
    brand: "doctorVet",
    homeHref: href(ed.code, "home"),
    labels: { ...c.common.nav, all: c.common.mega.all },
    groups: c.common.mega.groups.map((g) => ({ title: g.title, items: g.items.map(card) })),
    featured: { title: c.common.mega.featured.title, body: c.common.mega.featured.body, href: href(ed.code, "feature", c.common.mega.featured.slug) },
    links: { pricing: href(ed.code, "pricing"), security: href(ed.code, "security"), faq: href(ed.code, "faq"), start: href(ed.code, "start"), features: href(ed.code, "features") },
    cta: { label: c.common.cta.primary, href: signupHref(ed, "nav") },
    loginHref: loginHref(ed),
    switcher: switcherProps(),
  };
  return <Island name="SiteNav" props={props} className="sticky top-0 z-40" />;
}

function Suggest() {
  const { ed, c, route } = useSite();
  const names: Record<string, string> = {};
  const tz: Record<string, string> = {};
  for (const e of EDITIONS) {
    if (!e.country) continue;
    names[e.code] = countryName(e.country, ed.lang);
    for (const z of e.tz) tz[z] = e.code;
  }
  const props: SuggestBarProps = {
    current: ed.code,
    names,
    tz,
    text: c.common.switcher.suggest,
    yes: c.common.switcher.yes,
    no: c.common.switcher.no,
    rest: route.edition ? restOf(route.path, route.edition) : "",
  };
  return <Island name="SuggestBar" props={props} />;
}

function Footer() {
  const { ed, c, year } = useSite();
  const f = c.common.footer;
  const col = (title: string, links: [string, string][]) => (
    <div>
      <p className="mb-3 text-sm font-bold text-white">{title}</p>
      <ul className="space-y-2">
        {links.map(([h, l]) => <li key={h}><a href={h} className="text-sm text-white/70 transition hover:text-white">{l}</a></li>)}
      </ul>
    </div>
  );
  return (
    <footer className="bg-navy text-white">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-xl font-bold" dir="ltr">doctorVet</p>
          <p className="mt-3 max-w-xs text-sm leading-7 text-white/70">{f.tagline}</p>
          <div className="mt-5"><Island name="EditionSwitcher" props={switcherProps(false, true)} /></div>
        </div>
        {col(f.product, c.common.mega.groups.flatMap((g) => g.items).slice(0, 8).map((s) => [href(ed.code, "feature", s), c.features.cards[s].title]))}
        {col(f.resources, [[href(ed.code, "pricing"), c.common.nav.pricing], [href(ed.code, "start"), c.common.nav.start], [href(ed.code, "faq"), c.common.nav.faq], [href(ed.code, "security"), c.common.nav.security], [href(ed.code, "features"), c.common.mega.all]])}
        {col(f.legal, [[href(ed.code, "privacy"), f.privacy], [href(ed.code, "terms"), f.terms], [loginHref(ed), c.common.cta.login]])}
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/60">
          <span>{fill(f.rights, { year })}</span>
          <span>{f.madeIn}</span>
        </div>
      </div>
    </footer>
  );
}

export function Breadcrumbs({ trail }: { trail: [string, string | null][] }) {
  return (
    <nav aria-label="breadcrumb" className="mb-6 text-sm text-navy-3">
      <ol className="flex flex-wrap items-center gap-2">
        {trail.map(([label, h], i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {h ? <a href={h} className="hover:text-navy">{label}</a> : <span className="text-navy-2">{label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">↓</a>
      <Suggest />
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
