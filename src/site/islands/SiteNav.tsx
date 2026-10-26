/* الرأسُ: الشعار، «المنتج» بقائمته العملاقة مقسّمةً بيوم العيادة، والأسعار والأمان والأسئلة،
 * ومحوِّلُ الدولة، والدخول، وزرُّ التجربة. وعلى الهاتف: درجٌ بالمجموعات نفسها. */
import { useEffect, useState } from "react";
import { ChevronDown, Menu, X, ArrowUpLeft, ArrowUpRight } from "lucide-react";
import EditionSwitcher, { type SwitcherProps } from "./EditionSwitcher";

export interface NavItem { title: string; short: string; href: string }
export interface SiteNavProps {
  dir: "rtl" | "ltr";
  brand: string;
  homeHref: string;
  labels: { product: string; pricing: string; security: string; faq: string; start: string; login: string; menu: string; close: string; all: string };
  groups: { title: string; items: NavItem[] }[];
  featured: { title: string; body: string; href: string };
  links: { pricing: string; security: string; faq: string; start: string; features: string };
  cta: { label: string; href: string };
  loginHref: string;
  switcher: SwitcherProps;
}

function Logo({ brand }: { brand: string }) {
  return (
    <span className="flex items-center gap-2.5" dir="ltr">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <circle cx="17" cy="17" r="15.5" fill="none" stroke="#3E2FB3" strokeWidth="2" strokeDasharray="3.5 3" />
        <circle cx="17" cy="17" r="11" fill="#1266D8" />
        <path d="M17 11.5v11M11.5 17h11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight text-navy">{brand}</span>
    </span>
  );
}

export default function SiteNav(p: SiteNavProps) {
  const [mega, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const Arrow = p.dir === "rtl" ? ArrowUpLeft : ArrowUpRight;

  useEffect(() => {
    if (!mega && !drawer) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMega(false); setDrawer(false); } };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [mega, drawer]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule/80 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="container flex h-16 items-center justify-between gap-4">
        <a href={p.homeHref} aria-label={p.brand}><Logo brand={p.brand} /></a>

        <nav aria-label={p.labels.menu} className="hidden items-center gap-1 lg:flex">
          <button
            type="button"
            aria-expanded={mega}
            onClick={() => setMega((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy"
          >
            {p.labels.product}
            <ChevronDown size={16} aria-hidden className={`transition ${mega ? "rotate-180" : ""}`} />
          </button>
          <a href={p.links.pricing} className="rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy">{p.labels.pricing}</a>
          <a href={p.links.start} className="rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy">{p.labels.start}</a>
          <a href={p.links.security} className="rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy">{p.labels.security}</a>
          <a href={p.links.faq} className="rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy">{p.labels.faq}</a>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block"><EditionSwitcher {...p.switcher} /></div>
          <a href={p.loginHref} className="hidden rounded-full px-3 py-2 text-[15px] font-semibold text-navy-2 transition hover:text-navy sm:inline-flex">{p.labels.login}</a>
          <a href={p.cta.href} data-cta="nav" className="btn-primary hidden px-5 py-2.5 text-sm sm:inline-flex">{p.cta.label}</a>
          <button type="button" onClick={() => setDrawer(true)} aria-label={p.labels.menu} className="grid h-10 w-10 place-items-center rounded-full border border-rule bg-white lg:hidden">
            <Menu size={20} aria-hidden />
          </button>
        </div>
      </div>

      {/* القائمةُ العملاقة — مجموعاتٌ بيوم العيادة، وبطاقةٌ مميّزة */}
      {mega && (
        <div className="absolute inset-x-0 top-16 hidden border-b border-rule bg-white shadow-[0_30px_60px_-40px_rgb(15_30_53/0.45)] lg:block">
          <div className="container grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.2fr)] gap-6 py-8">
            {p.groups.map((g) => (
              <div key={g.title}>
                <p className="mb-3 text-xs font-bold text-stamp">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map((it) => (
                    <li key={it.href}>
                      <a href={it.href} className="block rounded-xl px-2 py-2 transition hover:bg-paper">
                        <span className="block text-sm font-semibold text-navy">{it.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-navy-3">{it.short}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <a href={p.featured.href} className="group flex flex-col justify-between rounded-2xl bg-navy p-5 text-white">
              <span>
                <span className="block font-display text-base font-bold">{p.featured.title}</span>
                <span className="mt-2 block text-sm leading-6 text-white/75">{p.featured.body}</span>
              </span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white">
                <Arrow size={16} aria-hidden className="transition group-hover:-translate-y-0.5" />
              </span>
            </a>
            <a href={p.links.features} className="col-span-6 text-sm font-semibold text-brand-700 hover:underline">{p.labels.all}</a>
          </div>
        </div>
      )}

      {/* درجُ الهاتف */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={p.labels.menu}>
          <div className="absolute inset-0 bg-navy/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 end-0 flex w-[min(24rem,100%)] flex-col overflow-y-auto bg-white">
            <div className="flex h-16 items-center justify-between border-b border-rule px-5">
              <Logo brand={p.brand} />
              <button type="button" onClick={() => setDrawer(false)} aria-label={p.labels.close} className="grid h-10 w-10 place-items-center rounded-full border border-rule"><X size={20} aria-hidden /></button>
            </div>
            <div className="space-y-6 px-5 py-6">
              {p.groups.map((g) => (
                <div key={g.title}>
                  <p className="mb-2 text-xs font-bold text-stamp">{g.title}</p>
                  <ul className="grid grid-cols-1 gap-1">
                    {g.items.map((it) => (
                      <li key={it.href}><a href={it.href} className="block rounded-xl px-3 py-2.5 text-[15px] font-semibold text-navy hover:bg-paper">{it.title}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
              <a href={p.featured.href} className="block rounded-xl bg-paper px-3 py-2.5 text-[15px] font-semibold text-navy">{p.featured.title}</a>
              <div className="grid gap-1 border-t border-rule pt-4">
                {([[p.links.pricing, p.labels.pricing], [p.links.start, p.labels.start], [p.links.security, p.labels.security], [p.links.faq, p.labels.faq], [p.loginHref, p.labels.login]] as const).map(([h, l]) => (
                  <a key={h} href={h} className="rounded-xl px-3 py-2.5 text-[15px] font-semibold text-navy hover:bg-paper">{l}</a>
                ))}
              </div>
              <EditionSwitcher {...p.switcher} />
              <a href={p.cta.href} data-cta="drawer" className="btn-primary w-full">{p.cta.label}</a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
