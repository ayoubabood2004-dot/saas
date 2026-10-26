/* ============================================================================
 * رسمُ الموقع ساعةَ البناء — يُحزم بـ`vite.site-ssr.config.ts` ويُنادى من `scripts/site-prerender.mjs`.
 *
 * كلُّ صفحةٍ × كلُّ نسخة ⇒ HTML ثابتٌ برأسه الخاصّ: `lang`/`dir`، العنوانُ والوصف بلغة النسخة
 * ولهجتها، `canonical`، وتبادلُ `hreflang` مع كلّ النسخ الأخرى، ووسومُ المشاركة — فمعاينةُ الرابط
 * بالواتساب وGoogle يريان صفحةَ البلد نفسها بلا جافاسكربت.
 * ==========================================================================*/
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { setIslandRenderer } from "./island";
import SiteNav from "./islands/SiteNav";
import EditionSwitcher from "./islands/EditionSwitcher";
import SuggestBar from "./islands/SuggestBar";
import PricingTable from "./islands/PricingTable";
import TourTabs from "./islands/TourTabs";
import RoiCalc from "./islands/RoiCalc";
import PriceFrom from "./islands/PriceFrom";
import { SiteCtx } from "./ctx";
import { contentFor } from "./content";
import { EDITIONS, editionByCode, DEFAULT_EDITION, type Edition } from "./editions";
import { FEATURE_SLUGS, type PageKind, type PricingData, type Route, type SiteContent } from "./types";
import { HomePage, PricingPage, FeaturesPage, FeaturePage, FaqPage, SecurityPage, StartPage, LegalPage } from "./pages";

setIslandRenderer((C, props) => renderToString(createElement(C, props)), { SiteNav, EditionSwitcher, SuggestBar, PricingTable, TourTabs, RoiCalc, PriceFrom });

export const ORIGIN = "https://www.doctorvet.vet";
const KINDS: PageKind[] = ["home", "pricing", "features", "faq", "security", "start", "privacy", "terms"];

export function pathOf(edition: string | null, kind: PageKind, slug?: string): string {
  if (!edition) return `/${kind}`;
  if (kind === "home") return `/${edition}`;
  if (kind === "feature") return `/${edition}/features/${slug}`;
  return `/${edition}/${kind}`;
}

export function routes(): Route[] {
  const out: Route[] = [];
  for (const e of EDITIONS) {
    for (const kind of KINDS) out.push({ edition: e.code, kind, path: pathOf(e.code, kind) });
    for (const slug of FEATURE_SLUGS) out.push({ edition: e.code, kind: "feature", slug, path: pathOf(e.code, "feature", slug) });
  }
  // صفحتا القانون بالجذر أيضاً: صفحةُ التسجيل بالتطبيق تربط إليهما بلا معرفةٍ بالنسخة.
  out.push({ edition: null, kind: "privacy", path: "/privacy" }, { edition: null, kind: "terms", path: "/terms" });
  return out;
}

const cache = new Map<string, SiteContent>();
function contentOf(ed: Edition): SiteContent {
  const k = `${ed.lang}:${ed.dialect ?? ""}`;
  if (!cache.has(k)) cache.set(k, contentFor(ed.lang, ed.dialect));
  return cache.get(k)!;
}

function metaOf(c: SiteContent, r: Route): { title: string; description: string } {
  switch (r.kind) {
    case "feature": return c.feature[r.slug!].meta;
    case "home": return c.home.meta;
    case "pricing": return c.pricing.meta;
    case "features": return c.features.meta;
    case "faq": return c.faq.meta;
    case "security": return c.security.meta;
    case "start": return c.start.meta;
    default: return c[r.kind].meta;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface Rendered { html: string; head: string; lang: string; dir: "rtl" | "ltr" }

export function render(r: Route, pricing: PricingData, year: number): Rendered {
  const ed = editionByCode(r.edition ?? DEFAULT_EDITION)!;
  const c = contentOf(ed);
  const page = (() => {
    switch (r.kind) {
      case "home": return createElement(HomePage);
      case "pricing": return createElement(PricingPage);
      case "features": return createElement(FeaturesPage);
      case "feature": return createElement(FeaturePage, { slug: r.slug! });
      case "faq": return createElement(FaqPage);
      case "security": return createElement(SecurityPage);
      case "start": return createElement(StartPage);
      case "privacy": return createElement(LegalPage, { which: "privacy" });
      case "terms": return createElement(LegalPage, { which: "terms" });
    }
  })();
  const html = renderToStaticMarkup(createElement(SiteCtx.Provider, { value: { ed, c, route: r, pricing, year } }, page));

  const m = metaOf(c, r);
  const url = `${ORIGIN}${r.path}`;
  const alt = r.edition
    ? EDITIONS.map((e) => `<link rel="alternate" hreflang="${e.hreflang}" href="${ORIGIN}${pathOf(e.code, r.kind, r.slug)}" />`).join("\n    ")
      + `\n    <link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathOf("en", r.kind, r.slug)}" />`
    : "";
  const locale = ed.lang === "ar" ? `ar_${ed.country}` : "en_US";
  const ld = r.kind === "home" || r.kind === "pricing"
    ? `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "doctorVet",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${ORIGIN}${pathOf(ed.code, "home")}`,
      inLanguage: ed.hreflang,
      // بلا `offers`: سعرٌ يُكتب هنا ساعةَ البناء يبقى بنتائج البحث بعد أن يغيّره المالكُ من لوحته، والصفحةُ
      // نفسُها تسأل السعرَ حيّاً — فمقتطفُ البحث كان سيعرض ما لا يُقبض (تدقيقٌ عدائيّ، ٢٦/١٠).
    }).replace(/</g, "\\u003c")}</script>`
    : "";
  const head = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    alt,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="doctorVet" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${locale}" />`,
    `<meta property="og:image" content="${ORIGIN}/og.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    ld,
  ].filter(Boolean).join("\n    ");
  return { html, head, lang: ed.hreflang, dir: ed.lang === "ar" ? "rtl" : "ltr" };
}

/** أسعارُ الأساس بالدولار — احتياطُ البناء حين لا تصل القاعدة (البناءُ المحلّيّ بلا مفاتيح). */
export { PLANS as BASE_PLANS, DEFAULT_USD_RATE } from "../lib/plans";
