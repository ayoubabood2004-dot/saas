import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CalendarDays, ClipboardList, Store, BarChart3, Stethoscope, HeartPulse,
  Syringe, MessageCircle, Boxes, Building2, ShieldCheck, Check, Plus, Sparkles,
  Bell, Wallet, ArrowLeft, Star, Menu, X, TrendingUp, Cake,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { appUrl, appHostLabel } from "@/lib/appUrl";
import { cn } from "@/lib/utils";

/* ============================================================================
 * Landing — the public marketing page on the ROOT domain. Arabic-first, RTL,
 * theme-aware, and built entirely from the app's own design system so it reads
 * as one product. The centrepiece is a LIVE, clickable app window: switch
 * screens, add items to a real cart, open a case — a hands-on feel, not a
 * screenshot. Everything is self-contained (no external images).
 * ==========================================================================*/

export function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = "doctorVet — منظومة إدارة العيادات البيطرية";
    return () => { document.title = prev; };
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-surface-1 font-sans text-ink antialiased">
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
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { href: "#features", label: "المميزات" },
    { href: "#pricing", label: "الأسعار" },
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
          <a href={appUrl("/login")} className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition hover:text-ink sm:block">تسجيل الدخول</a>
          <a href={appUrl("/login")} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-raised">
            ابدأ مجاناً <ArrowLeft size={15} />
          </a>
          <button onClick={() => setOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full text-ink-muted md:hidden" aria-label="القائمة">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-surface-1 px-4 py-3 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-semibold text-ink hover:bg-surface-2">{l.label}</a>
          ))}
          <a href={appUrl("/login")} className="block rounded-xl px-3 py-3 font-semibold text-brand-700 dark:text-brand-300">تسجيل الدخول</a>
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
            <Sparkles size={14} /> منظومة إدارة العيادات البيطرية
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 text-balance font-display text-4xl font-extrabold leading-[1.1] tracking-tighter2 sm:text-5xl lg:text-6xl"
          >
            عيادتك البيطرية كاملة،
            <span className="bg-gradient-to-l from-brand-600 to-sky-400 bg-clip-text text-transparent"> بمكان واحد.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted lg:mx-0"
          >
            سجل طبي موحّد، تقويم تشغيلي، مخزون وكاشير، حملات واتساب، وتعدد فروع — بواجهة عربية بسيطة وسلسة، تشتغل بالدينار وبلا أي خبرة تقنية.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.19 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <a href={appUrl("/login")} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-raised active:scale-[0.98]">
              ابدأ مجاناً — 14 يوم <ArrowLeft size={18} />
            </a>
            <a href="#features" className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-1 px-6 py-3.5 text-base font-bold text-ink transition hover:bg-surface-2">
              شاهد المميزات
            </a>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-subtle lg:justify-start"
          >
            {["واتساب مدمج", "تعدد فروع", "يعمل بالدينار", "بلا خبرة تقنية"].map((f) => (
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
const SCREENS: { key: ScreenKey; label: string; icon: typeof CalendarDays }[] = [
  { key: "board", label: "التقويم", icon: CalendarDays },
  { key: "record", label: "الطبلة", icon: ClipboardList },
  { key: "pos", label: "الكاشير", icon: Store },
  { key: "reports", label: "التقارير", icon: BarChart3 },
];

function AppShowcase() {
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
                  <span className="hidden sm:inline">{s.label}</span>
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
        <Sparkles size={13} className="text-brand-500" /> جرّبه بنفسك — اضغط على الأقسام والعناصر
      </div>
    </div>
  );
}

/* ---- Screen: operational board (click a case → detail popover) ---- */
const BOARD_STATUS = {
  care: { label: "رعاية طبية", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", av: "bg-amber-100 text-amber-700" },
  boarding: { label: "فندقة", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200", av: "bg-sky-100 text-sky-700" },
  done: { label: "غادرت", dot: "bg-success-500", chip: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200", av: "bg-success-100 text-success-700" },
} as const;
type BoardStatus = keyof typeof BOARD_STATUS;
const BOARD_CASES: { id: string; name: string; owner: string; status: BoardStatus; meta: string }[] = [
  { id: "c1", name: "ريكس", owner: "أحمد سالم", status: "care", meta: "اليوم 3" },
  { id: "c2", name: "لونا", owner: "سارة كريم", status: "care", meta: "اليوم 1" },
  { id: "c3", name: "مشمش", owner: "علي حسن", status: "boarding", meta: "قفص A2 · اليوم 5" },
  { id: "c4", name: "بوبي", owner: "نور محمد", status: "done", meta: "غادر اليوم" },
];

function BoardScreen() {
  const [sel, setSel] = useState<string | null>("c1");
  const cols: { key: BoardStatus; title: string }[] = [
    { key: "care", title: "رعاية طبية" },
    { key: "boarding", title: "الفندقة" },
    { key: "done", title: "مكتملة" },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold">التقويم الرئيسي</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Bell size={11} /> اليوم 3 · متأخر 1</span>
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
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-extrabold", m.av)}>{c.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-2xs font-bold text-ink">{c.name}</span>
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
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold", m.av)}>{c.name.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                  <p className="truncate text-2xs text-ink-muted">{c.owner} · {c.meta}</p>
                </div>
                <span className={cn("chip shrink-0 text-2xs font-semibold", m.chip)}>{m.label}</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-success-100 py-1.5 text-2xs font-bold text-success-700 dark:bg-success-500/20 dark:text-success-300"><MessageCircle size={12} /> واتساب</span>
                <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 py-1.5 text-2xs font-bold text-white"><ClipboardList size={12} /> فتح الطبلة</span>
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
  const rows = [
    { icon: Syringe, tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", title: "تطعيم رباعي", meta: "أُعطي اليوم · د. سارة" },
    { icon: HeartPulse, tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", title: "فحص وعلاج", meta: "حرارة 38.6 · مضاد حيوي" },
    { icon: Cake, tint: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300", title: "عيد ميلاد قريب", meta: "بعد 4 أيام 🎂" },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-gradient-to-l from-brand-500/10 to-transparent p-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl dark:bg-brand-500/20">🐕</span>
        <div>
          <p className="font-display text-sm font-extrabold text-ink">ريكس</p>
          <p className="text-2xs text-ink-muted">كلب · جيرمن شيبرد · 3 سنوات</p>
        </div>
        <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-1 text-2xs font-bold text-brand-700 dark:text-brand-300"><ShieldCheck size={11} /> جواز موحّد</span>
      </div>
      <div className="mb-2 flex gap-1.5">
        {["الخط الزمني", "التطعيمات", "الملاحظات"].map((t, i) => (
          <span key={t} className={cn("rounded-lg px-2.5 py-1 text-2xs font-bold", i === 0 ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>{t}</span>
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
  { id: "p1", name: "رويال كانين 4كغ", price: 32 },
  { id: "p2", name: "فرونت لاين (بيبيت)", price: 12 },
  { id: "p3", name: "درونتال (حبة)", price: 4 },
  { id: "p4", name: "شامبو طبي", price: 9 },
];
function PosScreen() {
  const [cart, setCart] = useState<Record<string, number>>({ p1: 1 });
  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => s + (POS_PRODUCTS.find((p) => p.id === id)?.price ?? 0) * q, 0);
  const count = items.reduce((s, [, q]) => s + q, 0);
  return (
    <div>
      <h3 className="mb-2.5 font-display text-sm font-extrabold">نقطة البيع</h3>
      <div className="grid grid-cols-2 gap-2">
        {POS_PRODUCTS.map((p) => (
          <button
            key={p.id}
            onClick={() => add(p.id)}
            className="group flex flex-col items-start rounded-xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-brand-300 hover:shadow-card active:scale-[0.97]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300"><Plus size={16} /></span>
            <span className="mt-1.5 line-clamp-1 text-2xs font-bold text-ink">{p.name}</span>
            <span className="text-2xs font-bold text-brand-600 dark:text-brand-300">${p.price}</span>
          </button>
        ))}
      </div>
      <motion.div layout className="mt-2.5 rounded-xl border border-line bg-surface-2/50 p-2.5">
        <div className="flex items-center justify-between text-2xs font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1"><Store size={13} /> السلة ({count})</span>
          <AnimatePresence mode="popLayout">
            <motion.span key={total} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="font-display text-base font-extrabold text-ink">
              ${total}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-2xs font-bold text-white">
          <Wallet size={13} /> إتمام البيع
        </div>
      </motion.div>
    </div>
  );
}

/* ---- Screen: reports — animated bars ---- */
function ReportsScreen() {
  const bars = [40, 62, 48, 78, 55, 90, 70];
  const days = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        {[
          { k: "إيراد اليوم", v: "$1,420", i: Wallet, t: "text-success-600" },
          { k: "حالات", v: "31", i: Stethoscope, t: "text-brand-600" },
          { k: "نمو", v: "٪18+", i: TrendingUp, t: "text-accent-600" },
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
        <p className="mb-2 text-2xs font-bold text-ink-muted">إيراد الأسبوع</p>
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
  const items = ["سجل طبي موحّد", "تقويم تشغيلي", "مخزون وكاشير", "الديون والدفع الآجل", "حملات واتساب", "تقارير وتحليلات", "تعدد فروع", "صلاحيات الفريق"];
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
const FEATURES = [
  { icon: CalendarDays, title: "التقويم التشغيلي", body: "تابع الحالات الحية والفندقة والتذكيرات بلوحة واحدة، واسحب لتغيير الحالة.", tint: "text-brand-600 bg-brand-50 dark:bg-brand-500/15" },
  { icon: ClipboardList, title: "السجل الطبي الموحّد", body: "جواز واحد لكل حيوان: تطعيمات، علاجات، وملاحظات عبر كل الزيارات.", tint: "text-rose-600 bg-rose-50 dark:bg-rose-500/15" },
  { icon: Store, title: "مخزون وكاشير", body: "بيع بالتجزئة أو بالأجزاء، خصم مخزون تلقائي، وفواتير أنيقة.", tint: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15" },
  { icon: Wallet, title: "الديون والدفع الآجل", body: "تابع المتبقّي على كل عميل وسدّده لاحقاً — بلا دفتر ورقي.", tint: "text-amber-600 bg-amber-50 dark:bg-amber-500/15" },
  { icon: MessageCircle, title: "حملات واتساب", body: "ذكّر الملاّك بالتطعيمات والمواعيد برسالة واحدة بلمسة.", tint: "text-green-600 bg-green-50 dark:bg-green-500/15" },
  { icon: BarChart3, title: "تقارير وتحليلات", body: "إيرادات، أداء الموظفين، وأكثر — بتقارير جاهزة للطباعة و Excel.", tint: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15" },
  { icon: Building2, title: "تعدد الفروع", body: "أدِر كل فروعك من حساب واحد — سجل مشترك وعمليات منفصلة.", tint: "text-sky-600 bg-sky-50 dark:bg-sky-500/15" },
  { icon: ShieldCheck, title: "صلاحيات دقيقة", body: "أنت تحدد شنو يشوف ويسوي كل موظف — أمان وخصوصية تامة.", tint: "text-violet-600 bg-violet-50 dark:bg-violet-500/15" },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <motion.div {...REVEAL} className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Boxes size={14} /> كل شي بمكان واحد</span>
        <h2 className="mt-4 text-balance font-display text-3xl font-extrabold tracking-tighter2 sm:text-4xl">كل ما تحتاجه عيادتك — بلا تعقيد</h2>
        <p className="mt-3 text-lg text-ink-muted">أدوات احترافية بواجهة بسيطة، مصمّمة للعقل البشري.</p>
      </motion.div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="group rounded-2xl border border-line bg-surface-1 p-5 shadow-card transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-raised"
            >
              <span className={cn("grid h-11 w-11 place-items-center rounded-2xl transition group-hover:scale-110", f.tint)}><Icon size={21} /></span>
              <h3 className="mt-4 font-display text-base font-extrabold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Pricing ---- */
const TIERS = [
  { name: "الأساسية", m: 19, y: 190, tag: "لعيادة صغيرة", pop: false, feats: ["مستخدمان", "حيوانات ومنتجات بلا حد", "التقويم والسجل الطبي", "تذكيرات واتساب"] },
  { name: "الاحترافية", m: 39, y: 390, tag: "الأكثر رواجاً", pop: true, feats: ["حتى 6 مستخدمين", "المخزون والكاشير", "الديون + حملات واتساب", "التقارير والتحليلات", "إدارة الفندقة"] },
  { name: "المتقدمة", m: 89, y: 890, tag: "للمستشفيات والفروع", pop: false, feats: ["مستخدمون بلا حد", "تعدد الفروع", "أداء الموظفين", "دعم مخصص + تدريب"] },
];

function Pricing() {
  const [annual, setAnnual] = useState(false);
  return (
    <section id="pricing" className="border-t border-line bg-surface-2/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div {...REVEAL} className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Star size={14} /> أسعار عادلة</span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tighter2 sm:text-4xl">اختر باقتك</h2>
          <p className="mt-3 text-lg text-ink-muted">ابدأ مجاناً 14 يوم — بلا بطاقة.</p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 p-1">
            <button onClick={() => setAnnual(false)} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", !annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>شهري</button>
            <button onClick={() => setAnnual(true)} className={cn("inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition", annual ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>
              سنوي <span className={cn("rounded-full px-1.5 py-0.5 text-2xs", annual ? "bg-white/20" : "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300")}>شهران هدية</span>
            </button>
          </div>
        </motion.div>

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 shadow-card transition hover:shadow-raised",
                t.pop ? "border-brand-300 bg-surface-1 ring-1 ring-brand-200 lg:-translate-y-3 dark:border-brand-500/40 dark:ring-brand-500/20" : "border-line bg-surface-1",
              )}
            >
              {t.pop && <span className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1 text-2xs font-extrabold text-white shadow-soft">الأكثر رواجاً</span>}
              <p className="font-display text-lg font-extrabold text-ink">{t.name}</p>
              <p className="text-2xs font-semibold text-ink-subtle">{t.tag}</p>
              <div className="mt-4 flex items-end gap-1">
                <AnimatePresence mode="popLayout">
                  <motion.span key={annual ? "y" : "m"} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }} className="font-display text-4xl font-extrabold tracking-tighter2 text-ink">
                    ${annual ? t.y : t.m}
                  </motion.span>
                </AnimatePresence>
                <span className="mb-1 text-sm font-semibold text-ink-subtle">/ {annual ? "سنة" : "شهر"}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {t.feats.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-muted">
                    <Check size={17} className="mt-0.5 shrink-0 text-success-600" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href={appUrl("/login")}
                className={cn(
                  "mt-6 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-bold transition active:scale-[0.98]",
                  t.pop ? "bg-brand-600 text-white shadow-soft hover:bg-brand-700 hover:shadow-raised" : "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2",
                )}
              >
                ابدأ الآن <ArrowLeft size={15} />
              </a>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-center text-2xs text-ink-subtle">الدفع بالدينار بالسعر المكافئ · زين كاش · فاست باي · Qi · كاش عبر مندوب</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Final CTA --- */
function FinalCTA() {
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
            جاهز تدير عيادتك بشكل أفضل؟
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">ابدأ مجاناً اليوم — الإعداد دقائق، والفريق كله يتعلمها بسرعة.</p>
          <a href={appUrl("/login")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-extrabold text-brand-700 shadow-soft transition hover:shadow-raised active:scale-[0.98]">
            ابدأ مجاناً <ArrowLeft size={18} />
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/* --------------------------------------------------------------- Footer ---- */
function Footer() {
  return (
    <footer className="border-t border-line bg-surface-2/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tighter2"><Logo size={34} /> doctorVet</a>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-muted">
          <a href="#features" className="hover:text-ink">المميزات</a>
          <a href="#pricing" className="hover:text-ink">الأسعار</a>
          <a href={appUrl("/login")} className="hover:text-ink">تسجيل الدخول</a>
        </nav>
        <p className="text-2xs text-ink-subtle">© {new Date().getFullYear()} doctorVet · جميع الحقوق محفوظة</p>
      </div>
    </footer>
  );
}
