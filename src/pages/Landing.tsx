import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CalendarDays, ClipboardList, Store, BarChart3, Stethoscope, HeartPulse,
  Syringe, MessageCircle, Boxes, Building2, ShieldCheck, Check, Plus, Sparkles,
  Bell, Wallet, ArrowLeft, Star, Menu, X, TrendingUp, Cake, Globe,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { LanguagePicker } from "@/components/LanguagePicker";
import { localeInfo } from "@/i18n";
import { track } from "@/lib/track";

/* ============================================================================
 * وجهة كل زرّ بالصفحة.
 *
 * النقرة وعدٌ، والشاشة التالية تفي به أو تنقضه. صفحةٌ تبيع للعيادات ثم تهبط
 * بالزائر على سؤال «مالك حيوان أم عيادة؟» تسأله عمّا أجاب عنه بفعله قبل
 * ثانيتين. فالرابط يحمل ثلاثة أشياء: أنه عيادة، وأنه قادمٌ ليسجّل لا ليدخل،
 * وبأي لغة كان يقرأ — واللغة تُحمَل صراحةً لأن نطاق التطبيق قد ينفصل يوماً
 * فلا يعبر معه المخزن المحلي.
 * ==========================================================================*/
const startHref = (lang: string) => appUrl(`/login?as=clinic&new=1&lang=${encodeURIComponent(lang)}`);
import { appUrl, appHostLabel } from "@/lib/appUrl";
import { cn, formatNum, formatDec } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import { CURRENCIES, currencyInfo, currencyName, guessCountry, fetchLiveRates, usdTo } from "@/lib/currency";

/* ============================================================================
 * Landing — the public marketing page on the ROOT domain. Theme-aware and built
 * entirely from the app's own design system so it reads as one product. The
 * centrepiece is a LIVE, clickable app window: switch screens, add items to a
 * real cart, open a case — a hands-on feel, not a screenshot. Everything is
 * self-contained (no external images).
 *
 * ── اللغة ─────────────────────────────────────────────────────────────────
 * الصفحة **مترجَمة بالكامل**، والافتراضي الإنجليزية: زائر لا يعرف المنتج بعد
 * قد يأتي من أي مكان، ومبدّل اللغة بالأعلى يخدمه من أول شاشة. والاتجاه يُشتقّ
 * من سجل اللغات لا يُثبَّت بالكود — فأي لغة RTL تُضاف تنقلب لها الصفحة من
 * سطرها بالسجل، بلا شرطٍ مبعثر هنا.
 * ==========================================================================*/

export function Landing() {
  const { t, i18n } = useTranslation();
  const dir = localeInfo(i18n.language).dir;

  useEffect(() => {
    const prev = document.title;
    document.title = t("landing.title", "doctorVet");
    return () => { document.title = prev; };
  }, [t]);

  // زيارةٌ واحدة تُسجَّل مرّة، مهما أُعيد التصيير أو بُدِّلت اللغة.
  useEffect(() => { track("page_view", undefined, true); }, []);

  return (
    <div dir={dir} className="min-h-screen bg-surface-1 font-sans text-ink antialiased">
      <Nav />
      <Hero />
      <Marquee />
      <Features />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ----------------------------------------------------------------- Nav ---- */
function Nav() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { href: "#features", label: t("landing.nav.features", "المميزات") },
    { href: "#pricing", label: t("landing.nav.pricing", "الأسعار") },
  ];
  return (
    <header className={cn(
      "sticky top-0 z-50 transition-all duration-300",
      scrolled ? "border-b border-line bg-surface-1/80 backdrop-blur-xl" : "bg-transparent",
    )}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tighter2">
          <Logo size={38} /> doctorVet
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguagePicker />
          <a href={appUrl(`/login?lang=${i18n.language}`)} className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition hover:text-ink sm:block">{t("landing.nav.login", "تسجيل الدخول")}</a>
          <a href={startHref(i18n.language)} onClick={() => track("cta_click", { at: "nav" })} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-raised">
            {t("landing.cta.start")} <ArrowLeft size={15} className="rtl:rotate-0 ltr:-scale-x-100" />
          </a>
          <button onClick={() => setOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full text-ink-muted md:hidden" aria-label={t("landing.nav.menu", "القائمة")}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-surface-1 px-4 py-3 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-semibold text-ink hover:bg-surface-2">{l.label}</a>
          ))}
          <a href={appUrl(`/login?lang=${i18n.language}`)} className="block rounded-xl px-3 py-3 font-semibold text-brand-700 dark:text-brand-300">{t("landing.nav.login", "تسجيل الدخول")}</a>
        </div>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- Hero ---- */
const REVEAL = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

function Hero() {
  const { t, i18n } = useTranslation();
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 start-1/4 h-[38rem] w-[38rem] rounded-full bg-brand-500/20 blur-[120px] dark:bg-brand-500/15" />
        <div className="absolute -top-24 end-0 h-[28rem] w-[28rem] rounded-full bg-accent-500/10 blur-[110px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-10 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:pt-20">
        {/* Copy */}
        <motion.div initial="initial" animate="animate" className="text-center lg:text-start">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3.5 py-1.5 text-xs font-bold text-brand-700 shadow-card dark:text-brand-300"
          >
            <Sparkles size={14} /> {t("landing.hero.badge", "منظومة إدارة العيادات البيطرية")}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 text-balance font-display text-4xl font-extrabold leading-[1.1] tracking-tighter2 sm:text-5xl lg:text-6xl"
          >
            {t("landing.hero.h1a", "عيادتك البيطرية كاملة،")}
            <span className="bg-gradient-to-l from-brand-600 to-sky-400 bg-clip-text text-transparent">{t("landing.hero.h1b", " بمكان واحد.")}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted lg:mx-0"
          >
            {t("landing.hero.sub")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.19 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <a href={startHref(i18n.language)} onClick={() => track("cta_click", { at: "hero" })} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-raised active:scale-[0.98]">
              {t("landing.cta.start")} <ArrowLeft size={18} className="ltr:-scale-x-100" />
            </a>
            <a href="#features" className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-1 px-6 py-3.5 text-base font-bold text-ink transition hover:bg-surface-2">
              {t("landing.hero.seeFeatures", "شاهد المميزات")}
            </a>
          </motion.div>

          {/* المتردّد لا يقول «غالي»، بل يفكّر «شنو أخسر لو ما نفع؟». الجواب
              مكانه تحت الزرّ لا مدفوناً أسفل صفحة الأسعار. */}
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-3 text-sm font-semibold text-ink-subtle"
            data-reassure
          >
            {t("landing.cta.reassure")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-subtle lg:justify-start"
          >
            {[t("landing.hero.perk1"), t("landing.hero.perk2"), t("landing.hero.perk3"), t("landing.hero.perk4")].map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5"><Check size={15} className="text-success-600" /> {f}</span>
            ))}
          </motion.div>
        </motion.div>

        {/* Interactive product */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <AppShowcase />
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------- Interactive app window -- */
type ScreenKey = "board" | "record" | "pos" | "reports";
const SCREENS: { key: ScreenKey; icon: typeof CalendarDays }[] = [
  { key: "board", icon: CalendarDays },
  { key: "record", icon: ClipboardList },
  { key: "pos", icon: Store },
  { key: "reports", icon: BarChart3 },
];

function AppShowcase() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<ScreenKey>("board");
  const [touched, setTouched] = useState(false);
  const reduce = useReducedMotion();

  // Auto-tour the screens until the visitor takes the wheel — makes it feel alive.
  useEffect(() => {
    if (touched || reduce) return;
    const id = window.setInterval(() => {
      setScreen((s) => SCREENS[(SCREENS.findIndex((x) => x.key === s) + 1) % SCREENS.length].key);
    }, 3800);
    return () => window.clearInterval(id);
  }, [touched, reduce]);

  const pick = (k: ScreenKey) => { setTouched(true); setScreen(k); };

  return (
    <div className="relative">
      <div aria-hidden className="absolute inset-x-6 -bottom-4 h-10 rounded-full bg-brand-900/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.6rem] border border-line bg-surface-1 shadow-raised">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-danger-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <span className="h-3 w-3 rounded-full bg-success-400/70" />
          </span>
          <span className="mx-auto inline-flex items-center gap-1.5 rounded-lg bg-surface-1 px-3 py-1 text-2xs font-semibold text-ink-subtle" dir="ltr">
            <ShieldCheck size={12} className="text-success-600" /> {appHostLabel()}
          </span>
        </div>

        <div className="flex h-[26rem] sm:h-[27rem]">
          {/* Mini sidebar */}
          <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-e border-line bg-surface-2/40 py-3 sm:w-40 sm:items-stretch sm:px-2.5">
            <span className="mb-2 hidden items-center gap-2 px-2 font-display text-sm font-extrabold sm:flex"><Logo size={26} /> doctorVet</span>
            <span className="mb-1 grid h-9 w-9 place-items-center rounded-xl bg-brand-grad text-white sm:hidden"><LogoMark size={16} /></span>
            {SCREENS.map((s) => {
              const Icon = s.icon;
              const active = screen === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => pick(s.key)}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl px-0 py-2.5 text-sm font-semibold transition sm:px-3",
                    "justify-center sm:justify-start",
                    active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="hidden sm:inline">{t(`landing.demo.${s.key}`)}</span>
                </button>
              );
            })}
          </aside>

          {/* Screen */}
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={reduce ? {} : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? {} : { opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0 overflow-y-auto p-3.5 sm:p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {screen === "board" && <BoardScreen />}
                {screen === "record" && <RecordScreen />}
                {screen === "pos" && <PosScreen />}
                {screen === "reports" && <ReportsScreen />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Hint chip */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-2xs font-semibold text-ink-subtle">
        <Sparkles size={13} className="text-brand-500" /> {t("landing.demo.hint")}
      </div>
    </div>
  );
}

/* ---- Screen: operational board (click a case → detail popover) ---- */
const BOARD_STATUS = {
  care: { key: "stCare", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", av: "bg-amber-100 text-amber-700" },
  boarding: { key: "stBoarding", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200", av: "bg-sky-100 text-sky-700" },
  done: { key: "stDone", dot: "bg-success-500", chip: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200", av: "bg-success-100 text-success-700" },
} as const;
type BoardStatus = keyof typeof BOARD_STATUS;
/** الحالات المعروضة — أسماؤها وأصحابها مفاتيح ترجمة لا نصوص: العرض التوضيحي
 *  يجب أن يُقرأ بلغة الزائر، وإلا صار برهاناً على أن المنتج بلغة واحدة. */
const BOARD_CASES: { id: string; status: BoardStatus }[] = [
  { id: "c1", status: "care" },
  { id: "c2", status: "care" },
  { id: "c3", status: "boarding" },
  { id: "c4", status: "done" },
];

function BoardScreen() {
  const { t } = useTranslation();
  const [sel, setSel] = useState<string | null>("c1");
  const cols: { key: BoardStatus; title: string }[] = [
    { key: "care", title: t("landing.board.colCare") },
    { key: "boarding", title: t("landing.board.colBoarding") },
    { key: "done", title: t("landing.board.colDone") },
  ];
  const nameOf = (id: string) => t(`landing.board.${id}`);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold">{t("landing.board.title")}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Bell size={11} /> {t("landing.board.bell")}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((col) => (
          <div key={col.key} className="rounded-xl border border-line bg-surface-2/40 p-1.5">
            <p className="mb-1.5 px-1 text-2xs font-bold text-ink-muted">{col.title}</p>
            <div className="space-y-1.5">
              {BOARD_CASES.filter((c) => c.status === col.key).map((c) => {
                const m = BOARD_STATUS[c.status];
                const active = sel === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSel(active ? null : c.id)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg border bg-surface-1 p-1.5 text-start transition",
                      active ? "border-brand-400 shadow-card ring-2 ring-brand-400/40" : "border-line hover:border-brand-200",
                    )}
                  >
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-extrabold", m.av)}>{nameOf(c.id).slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-2xs font-bold text-ink">{nameOf(c.id)}</span>
                    </span>
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Detail — reacts to the selected case */}
      <AnimatePresence mode="wait">
        {sel && (() => {
          const c = BOARD_CASES.find((x) => x.id === sel)!;
          const m = BOARD_STATUS[c.status];
          return (
            <motion.div
              key={sel}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22 }}
              className="mt-2.5 rounded-xl border border-line bg-surface-1 p-2.5 shadow-card"
            >
              <div className="flex items-center gap-2.5">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold", m.av)}>{nameOf(c.id).slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{nameOf(c.id)}</p>
                  <p className="truncate text-2xs text-ink-muted">{t(`landing.board.${c.id}o`)} · {t(`landing.board.${c.id}m`)}</p>
                </div>
                <span className={cn("chip shrink-0 text-2xs font-semibold", m.chip)}>{t(`landing.board.${m.key}`)}</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-success-100 py-1.5 text-2xs font-bold text-success-700 dark:bg-success-500/20 dark:text-success-300"><MessageCircle size={12} /> {t("landing.board.wa")}</span>
                <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 py-1.5 text-2xs font-bold text-white"><ClipboardList size={12} /> {t("landing.board.openCase")}</span>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

/* ---- Screen: unified medical record (الطبلة) ---- */
function RecordScreen() {
  const { t } = useTranslation();
  const rows = [
    { icon: Syringe, tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", title: t("landing.record.r1"), meta: t("landing.record.r1m") },
    { icon: HeartPulse, tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", title: t("landing.record.r2"), meta: t("landing.record.r2m") },
    { icon: Cake, tint: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300", title: t("landing.record.r3"), meta: t("landing.record.r3m") },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-gradient-to-l from-brand-500/10 to-transparent p-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl dark:bg-brand-500/20">🐕</span>
        <div>
          <p className="font-display text-sm font-extrabold text-ink">{t("landing.record.pet")}</p>
          <p className="text-2xs text-ink-muted">{t("landing.record.breed")}</p>
        </div>
        <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-1 text-2xs font-bold text-brand-700 dark:text-brand-300"><ShieldCheck size={11} /> {t("landing.record.passport")}</span>
      </div>
      <div className="mb-2 flex gap-1.5">
        {[t("landing.record.tab1"), t("landing.record.tab2"), t("landing.record.tab3")].map((label, i) => (
          <span key={label} className={cn("rounded-lg px-2.5 py-1 text-2xs font-bold", i === 0 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>{label}</span>
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", r.tint)}><Icon size={15} /></span>
              <div className="min-w-0">
                <p className="truncate text-2xs font-bold text-ink">{r.title}</p>
                <p className="truncate text-2xs text-ink-subtle">{r.meta}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Screen: POS — click products, watch the cart total update (real!) ---- */
const POS_PRODUCTS = [
  { id: "p1", price: 32 },
  { id: "p2", price: 12 },
  { id: "p3", price: 4 },
  { id: "p4", price: 9 },
];
function PosScreen() {
  const { t } = useTranslation();
  const [cart, setCart] = useState<Record<string, number>>({ p1: 1 });
  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => s + (POS_PRODUCTS.find((p) => p.id === id)?.price ?? 0) * q, 0);
  const count = items.reduce((s, [, q]) => s + q, 0);
  return (
    <div>
      <h3 className="mb-2.5 font-display text-sm font-extrabold">{t("landing.pos.title")}</h3>
      <div className="grid grid-cols-2 gap-2">
        {POS_PRODUCTS.map((p) => (
          <button
            key={p.id}
            onClick={() => add(p.id)}
            className="group flex flex-col items-start rounded-xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-brand-300 hover:shadow-card active:scale-[0.97]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300"><Plus size={16} /></span>
            <span className="mt-1.5 line-clamp-1 text-2xs font-bold text-ink">{t(`landing.pos.${p.id}`)}</span>
            <span className="text-2xs font-bold text-brand-600 dark:text-brand-300">${p.price}</span>
          </button>
        ))}
      </div>
      <motion.div layout className="mt-2.5 rounded-xl border border-line bg-surface-2/50 p-2.5">
        <div className="flex items-center justify-between text-2xs font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1"><Store size={13} /> {t("landing.pos.cart", { n: count })}</span>
          <AnimatePresence mode="popLayout">
            <motion.span key={total} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="font-display text-base font-extrabold text-ink">
              ${total}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-2xs font-bold text-white">
          <Wallet size={13} /> {t("landing.pos.checkout")}
        </div>
      </motion.div>
    </div>
  );
}

/* ---- Screen: reports — animated bars ---- */
function ReportsScreen() {
  const { t } = useTranslation();
  const bars = [40, 62, 48, 78, 55, 90, 70];
  const days = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`landing.reports.d${n}`));
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        {[
          { k: t("landing.reports.revToday"), v: "$1,420", i: Wallet, t: "text-success-600" },
          { k: t("landing.reports.cases"), v: "31", i: Stethoscope, t: "text-brand-600" },
          { k: t("landing.reports.growth"), v: "+18%", i: TrendingUp, t: "text-accent-600" },
        ].map((s) => {
          const Icon = s.i;
          return (
            <div key={s.k} className="rounded-xl border border-line bg-surface-1 p-2">
              <Icon size={14} className={s.t} />
              <p className="mt-1 font-display text-sm font-extrabold text-ink">{s.v}</p>
              <p className="text-2xs text-ink-subtle">{s.k}</p>
            </div>
          );
        })}
      </div>
      <div className="rounded-xl border border-line bg-surface-1 p-3">
        <p className="mb-2 text-2xs font-bold text-ink-muted">{t("landing.reports.weekRev")}</p>
        <div className="flex h-28 items-end justify-between gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                initial={{ height: 6 }} animate={{ height: `${h}%` }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: "easeOut" }}
                className={cn("w-full rounded-md", i === 5 ? "bg-brand-600" : "bg-brand-500/30")}
                style={{ minHeight: 6 }}
              />
              <span className="text-[9px] font-bold text-ink-subtle">{days[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Marquee ---- */
function Marquee() {
  const { t } = useTranslation();
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => t(`landing.marquee.m${n}`));
  return (
    <div className="border-y border-line bg-surface-2/40 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 text-sm font-bold text-ink-subtle">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {it}</span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Features ---- */
/** الأيقونة واللون هنا، والنصّ بملفات اللغات — بيانات العرض لا تحمل نصّاً. */
const FEATURES = [
  { icon: CalendarDays, tint: "text-brand-600 bg-brand-50 dark:bg-brand-500/15" },
  { icon: ClipboardList, tint: "text-rose-600 bg-rose-50 dark:bg-rose-500/15" },
  { icon: Store, tint: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15" },
  { icon: Wallet, tint: "text-amber-600 bg-amber-50 dark:bg-amber-500/15" },
  { icon: MessageCircle, tint: "text-green-600 bg-green-50 dark:bg-green-500/15" },
  { icon: BarChart3, tint: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15" },
  { icon: Building2, tint: "text-sky-600 bg-sky-50 dark:bg-sky-500/15" },
  { icon: ShieldCheck, tint: "text-violet-600 bg-violet-50 dark:bg-violet-500/15" },
];

function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <motion.div {...REVEAL} className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Boxes size={14} /> {t("landing.features.badge")}</span>
        <h2 className="mt-4 text-balance font-display text-3xl font-extrabold tracking-tighter2 sm:text-4xl">{t("landing.features.h2")}</h2>
        <p className="mt-3 text-lg text-ink-muted">{t("landing.features.sub")}</p>
      </motion.div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="group rounded-2xl border border-line bg-surface-1 p-5 shadow-card transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-raised"
            >
              <span className={cn("grid h-11 w-11 place-items-center rounded-2xl transition group-hover:scale-110", f.tint)}><Icon size={21} /></span>
              <h3 className="mt-4 font-display text-base font-extrabold text-ink">{t(`landing.features.f${i + 1}t`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{t(`landing.features.f${i + 1}b`)}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Pricing ---- */
/** The growth story: سجّل → بِع → اكتمل. Monthly OR annual (annual = 12× monthly,
 *  no discount). Features are deliberately loaded onto the highlighted "السوبر"
 *  so any serious clinic gravitates to it. 14-day free trial of the full Super.
 *  Plans come from the shared src/lib/plans.ts — one source of truth with the
 *  in-app subscription/billing system. */
/** عملة الزائر: أينما كان بالعالم يشوف الأسعار بعملته المحلية تلقائياً —
 *  التخمين من لغة متصفحه/منطقته الزمنية، والتحويل بسعر صرف حي (يُجلب مرة
 *  ويُخزَّن يوماً؛ جدول ثابت يغطي لو ما وصلت الشبكة). ?cur=SAR يفرضها،
 *  واختياره اليدوي من القائمة يُحفظ لزياراته القادمة. */
function useVisitorCurrency() {
  const [cur, setCurState] = useState<string>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("cur")?.toUpperCase();
      if (q && CURRENCIES[q]) return q;
      const saved = localStorage.getItem("vp_landing_cur");
      if (saved && CURRENCIES[saved]) return saved;
    } catch { /* ignore */ }
    return guessCountry()?.cur ?? "USD";
  });
  const [live, setLive] = useState<Record<string, number> | null>(null);
  useEffect(() => { void fetchLiveRates().then(setLive).catch(() => {}); }, []);
  const setCur = (c: string) => {
    setCurState(c);
    try { localStorage.setItem("vp_landing_cur", c); } catch { /* ignore */ }
  };
  const fmt = (usd: number) => {
    if (cur === "USD") return `$${formatNum(usd)}`;
    const info = currencyInfo(cur);
    const v = usdTo(usd, cur, live);
    return `${info.frac ? formatDec(v) : formatNum(v)} ${info.symAr}`;
  };
  return { cur, setCur, fmt, isUsd: cur === "USD" };
}

function Pricing() {
  const { t, i18n } = useTranslation();
  const [annual, setAnnual] = useState(true);
  // اسم العملة بلغة الزائر — المُعرَّف مرّةً واحدة بـlib/currency.
  const curName = (code: string) => currencyName(code, i18n.language);
  const fx = useVisitorCurrency();
  return (
    <section id="pricing" className="border-t border-line bg-surface-2/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div {...REVEAL} className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Star size={14} /> {t("landing.pricing.badge")}</span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tighter2 sm:text-4xl">{t("landing.pricing.h2")}</h2>
          <p className="mt-3 text-lg text-ink-muted">{t("landing.pricing.sub")}</p>

          {/* Monthly / annual toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 p-1">
            <button onClick={() => setAnnual(false)} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", !annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>{t("landing.pricing.monthly")}</button>
            <button onClick={() => setAnnual(true)} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>{t("landing.pricing.annual")}</button>
          </div>

          {/* عملة الزائر — مكتشَفة تلقائياً وقابلة للتبديل */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Globe size={15} className="text-ink-subtle" />
            <select
              data-cur-select
              value={fx.cur}
              onChange={(e) => fx.setCur(e.target.value)}
              className="rounded-full border border-line bg-surface-1 px-3.5 py-1.5 text-sm font-bold text-ink shadow-card outline-none transition hover:border-brand-300"
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>{curName(c.code)} ({c.code})</option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-2xs text-ink-subtle">{t("landing.pricing.curHint")}</p>
        </motion.div>

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 shadow-card transition hover:shadow-raised",
                p.popular ? "border-brand-300 bg-surface-1 ring-1 ring-brand-200 lg:-translate-y-3 dark:border-brand-500/40 dark:ring-brand-500/20" : "border-line bg-surface-1",
              )}
            >
              {p.popular && <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1 text-2xs font-extrabold text-white shadow-soft">{t("landing.pricing.mostComplete")}</span>}
              <p className="font-display text-lg font-extrabold text-ink">{t(`plans.${p.id}.name`, p.name)}</p>
              <p className="text-2xs font-semibold text-ink-subtle">{t(`plans.${p.id}.tag`, p.tag)}</p>
              <div className="mt-4 flex flex-wrap items-end gap-1">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={(annual ? "y" : "m") + fx.cur + p.id}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}
                    data-price3x
                    className={cn(
                      "font-display font-extrabold tracking-tighter2 text-ink",
                      // الدينار/الليرة السنوية أرقام طويلة — نصغّر قليلاً حتى لا تنكسر البطاقة
                      fx.fmt(annual ? p.annualUsd : p.monthlyUsd).length > 11 ? "text-2xl leading-9" : "text-4xl",
                    )}
                  >
                    {fx.fmt(annual ? p.annualUsd : p.monthlyUsd)}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1 text-sm font-semibold text-ink-subtle">/ {annual ? t("landing.pricing.perYear") : t("landing.pricing.perMonth")}</span>
              </div>
              {!fx.isUsd && (
                <p className="mt-1 text-2xs font-semibold text-ink-subtle" dir="ltr">
                  = ${formatNum(annual ? p.annualUsd : p.monthlyUsd)} USD
                </p>
              )}
              {annual && p.annualUsd < p.monthlyUsd * 12 && (
                <p className="mt-1 w-fit rounded-full bg-success-50 px-2.5 py-0.5 text-2xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                  {t("landing.pricing.twoFree")}
                </p>
              )}
              <ul className="mt-5 flex-1 space-y-2.5">
                {(t(`plans.${p.id}.feats`, { returnObjects: true, defaultValue: p.feats }) as string[]).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-muted">
                    <Check size={17} className="mt-0.5 shrink-0 text-success-600" /> {f}
                  </li>
                ))}
                {(t(`plans.${p.id}.missing`, { returnObjects: true, defaultValue: p.missing }) as string[]).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-subtle/70">
                    <X size={17} className="mt-0.5 shrink-0 text-ink-subtle/50" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href={startHref(i18n.language)} onClick={() => track("cta_click", { at: "plan" })}
                className={cn(
                  "mt-6 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-bold transition active:scale-[0.98]",
                  p.popular ? "bg-brand-600 text-white shadow-soft hover:bg-brand-700 hover:shadow-raised" : "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2",
                )}
              >
                {t("landing.cta.start")} <ArrowLeft size={15} className="ltr:-scale-x-100" />
              </a>
            </motion.div>
          ))}
        </div>

        {/* The 14-day free trial — its own standalone rectangle under the plans */}
        <motion.div {...REVEAL} className="mt-6 overflow-hidden rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/40 dark:border-brand-500/40 dark:bg-brand-500/10">
          <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:p-7 sm:text-start">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Sparkles size={26} /></span>
            <div className="flex-1">
              <p className="font-display text-xl font-extrabold text-ink">{t("landing.pricing.trialTitle")}</p>
              <p className="mt-1 text-sm text-ink-muted">{t("landing.pricing.trialBody")}</p>
            </div>
            <a href={startHref(i18n.language)} onClick={() => track("cta_click", { at: "trial" })} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-raised active:scale-[0.98]">
              {t("landing.cta.start")} <ArrowLeft size={16} className="ltr:-scale-x-100" />
            </a>
          </div>
        </motion.div>

        <p className="mt-6 text-center text-2xs text-ink-subtle">
          {fx.cur === "IQD" ? t("landing.pricing.payNoteIQD") : t("landing.pricing.payNoteOther")}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Final CTA --- */
function FinalCTA() {
  const { t, i18n } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <motion.div
        {...REVEAL}
        className="relative overflow-hidden rounded-[2rem] bg-brand-grad px-6 py-14 text-center shadow-raised sm:px-12"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -end-10 -top-10 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-16 start-10 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-extrabold tracking-tighter2 text-white sm:text-4xl">
            {t("landing.cta.h2")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">{t("landing.cta.sub")}</p>
          <a href={startHref(i18n.language)} onClick={() => track("cta_click", { at: "final" })} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-extrabold text-brand-700 shadow-soft transition hover:shadow-raised active:scale-[0.98]">
            {t("landing.cta.start")} <ArrowLeft size={18} className="ltr:-scale-x-100" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/* --------------------------------------------------------------- Footer ---- */
function Footer() {
  const { t, i18n } = useTranslation();
  return (
    <footer className="border-t border-line bg-surface-2/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tighter2"><Logo size={34} /> doctorVet</a>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-muted">
          <a href="#features" className="hover:text-ink">{t("landing.nav.features")}</a>
          <a href="#pricing" className="hover:text-ink">{t("landing.nav.pricing")}</a>
          <a href={appUrl(`/login?lang=${i18n.language}`)} className="hover:text-ink">{t("landing.nav.login")}</a>
        </nav>
        <p className="text-2xs text-ink-subtle">© {new Date().getFullYear()} doctorVet · {t("landing.footer.rights")}</p>
      </div>
    </footer>
  );
}
