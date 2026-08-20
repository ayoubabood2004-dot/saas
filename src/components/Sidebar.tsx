import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarCheck2,
  ClipboardList,
  LayoutGrid,
  Box,
  ScanLine,
  Settings as SettingsIcon,
  History,
  Search,
  Boxes,
  Store,
  ShoppingBag,
  MessageCircle,
  BellRing,
  Briefcase,
  BarChart3,
  Slice,
  ChevronDown,
  Sparkles,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useBookingRequestCount } from "@/lib/bookingRequests";
import { useStoreOrderCount } from "@/lib/storeOrdersLive";
import { useSubscription } from "@/lib/subscription";
import { useEntitlements } from "@/lib/entitlements";
import { formatNum } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { prefetchHandlers, prefetchAllIdle } from "@/lib/routePrefetch";
import { warmDataIdle } from "@/lib/prefetchData";
import { AccountMenu } from "@/components/AccountMenu";
import { Logo } from "@/components/Logo";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { useCommandPalette } from "./CommandPaletteProvider";
import { useNavFolded, setNavFolded } from "@/lib/navFold";
import { cn } from "@/lib/utils";

/** Desktop navigation rail with profile card (ref img 1). Hidden below lg. */
export function Sidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const palette = useCommandPalette();
  const { can } = usePermissions();
  const { has } = useEntitlements();
  // وضع التركيز: الشريط يصير سكّة أيقونات ٧٦px فتتحرّر ١٨٠px للشاشة الواقفة
  // عليها (الكاشير أساساً). التنقّل لا يُفقد — كل أيقونة تبقى بمكانها نفسه.
  const folded = useNavFolded();

  // Once idle after first paint, eagerly warm EVERY route's JS chunk AND the
  // data snapshots for the heavy screens — so any navigation is "click → already
  // there" with no chunk download, no Suspense fallback, no data fetch.
  useEffect(() => {
    prefetchAllIdle();
    warmDataIdle(user?.clinic_id ?? user?.id, {
      records: true,
      retail: can("processSales"),
      analytics: can("viewReports"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RBAC-aware navigation — items requiring a capability the role lacks are hidden.
  const items = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard", "Dashboard"), exact: true },
    { to: "/reception", icon: CalendarDays, label: t("reception.title") },
    { to: "/bookings", icon: CalendarCheck2, label: t("bookings.title", "الحجوزات") },
    {
      to: "/charts", icon: LayoutGrid, label: t("nav.charts", "الطبلات"),
      // قائمة منسدلة: الطبلات (خطط العلاج) + العمليات (سجل الجراحة الكامل).
      children: [
        { to: "/charts", icon: LayoutGrid, label: t("nav.charts", "الطبلات") },
        { to: "/surgeries", icon: Slice, label: t("nav.surgeries", "العمليات") },
      ],
    },
    // غرفة الأقفاص المجسّمة — رابط مباشر حتى ما تضل مخبّأة داخل الطبلات.
    { to: "/cage3d", icon: Box, label: t("nav.cageRoom", "غرفة الأقفاص") },
    { to: "/records", icon: ClipboardList, label: t("records.title") },
    { to: "/inventory", icon: Boxes, label: t("nav.inventory", "Inventory"), show: can("manageInventory") },
    { to: "/retail", icon: Store, label: t("nav.retail", "Retail & Sales"), show: can("processSales") && has("pos") },
    { to: "/store", icon: ShoppingBag, label: t("nav.store", "المتجر الإلكتروني"), show: can("processSales") && has("store") },
    { to: "/reports", icon: BarChart3, label: t("nav.reports", "التقارير"), show: can("viewReports") && has("reports") },
    {
      to: "/campaigns", icon: MessageCircle, label: t("nav.campaigns", "WhatsApp Campaigns"), show: has("whatsapp"),
      // قائمة منسدلة: الحملات (إرسال جماعي) + التذكيرات (كل ما يجب تذكّره).
      children: [
        { to: "/campaigns", icon: MessageCircle, label: t("nav.campaignsChild", "الحملات") },
        { to: "/reminders", icon: BellRing, label: t("nav.reminders", "التذكيرات") },
      ],
    },
    { to: "/staff", icon: Briefcase, label: t("nav.staff", "Staff Management"), show: can("manageStaff") },
    { to: "/scan", icon: ScanLine, label: t("nav.scan") },
    { to: "/activity", icon: History, label: t("nav.activity", "سجل الحركات"), show: can("manageSettings") },
    { to: "/settings", icon: SettingsIcon, label: t("nav.settings"), show: can("manageSettings") },
  ].filter((it) => it.show !== false);

  // فتح/غلق المجموعات المنسدلة — حالة مستقلة لكل مجموعة (الطبلات، الواتساب…).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // عدّاد حي لطلبات الحجز الجديدة (زبائن) — نفس المجس المشترك مال الجرس.
  const bookingReqs = useBookingRequestCount();
  // عدّاد حي لطلبات المتجر الجديدة — يشتغل فقط لما ميزة المتجر متاحة.
  const storeOrders = useStoreOrderCount(has("store") && can("processSales"));
  const toggleGroup = (key: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <aside className={cn(
      "fixed inset-y-0 start-0 z-40 hidden flex-col border-e border-line bg-surface-1 no-print lg:flex",
      folded ? "w-[4.75rem] px-2 py-4" : "w-64 p-4",
    )}>
      {/* Brand + زر الطيّ */}
      <div className={cn("mb-5 flex items-center", folded ? "flex-col gap-2" : "gap-2.5 px-2")}>
        <Link to="/" className="flex min-w-0 items-center gap-2.5 font-display font-extrabold tracking-tighter2 text-ink">
          <Logo size={folded ? 34 : 40} />
          {!folded && <span className="truncate text-lg">{t("app.name")}</span>}
        </Link>
        <button
          onClick={() => { playTap(); setNavFolded(!folded); }}
          title={folded ? t("nav.unfold", "توسيع الشريط") : t("nav.fold", "طيّ الشريط — مساحة أكبر للشاشة")}
          aria-label={folded ? t("nav.unfold", "توسيع الشريط") : t("nav.fold", "طيّ الشريط — مساحة أكبر للشاشة")}
          aria-pressed={folded}
          data-navfold
          className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-2 hover:text-ink", !folded && "ms-auto")}
        >
          {folded ? <PanelLeftOpen size={18} className="rtl:rotate-180" /> : <PanelLeftClose size={18} className="rtl:rotate-180" />}
        </button>
      </div>

      {/* Search */}
      <button
        onClick={() => palette.open()}
        title={folded ? t("nav.search", "Search") : undefined}
        className={cn(
          "flex items-center rounded-2xl border border-line bg-surface-2 text-sm text-ink-subtle transition hover:text-ink",
          folded ? "h-11 justify-center" : "gap-2.5 px-3.5 py-2.5",
        )}
      >
        <Search size={17} />
        {!folded && <>
          <span className="flex-1 text-start">{t("nav.search", "Search")}</span>
          <kbd className="rounded-md border border-line bg-surface-1 px-1.5 text-2xs font-semibold">⌘K</kbd>
        </>}
      </button>

      {/* Branch switcher — renders only when the clinic has 2+ branches. */}
      <BranchSwitcher className="mt-3" compact={folded} />

      {/* Nav */}
      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pe-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          // بالسكّة المطويّة: المجموعة تصير أيقونةً واحدة تفتح قسمها الأول —
          // قائمةٌ منسدلة داخل ٧٦px ستكون عبثاً، والوجهة تبقى بضغطة واحدة.
          const kidActive = "children" in item && item.children ? item.children.some((k) => isActive(k.to)) : false;
          if (folded) {
            const badge = (item.to === "/reception" || item.to === "/bookings") ? bookingReqs : item.to === "/store" ? storeOrders : 0;
            return (
              <Link
                key={item.to} to={item.to} {...prefetchHandlers(item.to)} onClick={() => playTap()}
                title={item.label} aria-label={item.label}
                className={cn(
                  "relative grid h-12 place-items-center rounded-2xl transition-colors",
                  active || kidActive ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon size={21} />
                {badge > 0 && (
                  <span className="absolute end-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white shadow-soft">
                    {badge}
                  </span>
                )}
              </Link>
            );
          }
          if ("children" in item && item.children) {
            const kids = item.children;
            const anyActive = kids.some((k) => isActive(k.to));
            const open = openGroups.has(item.to) || anyActive;
            return (
              <div key={item.to}>
                <button
                  onClick={() => { playTap(); toggleGroup(item.to); }}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-colors",
                    anyActive ? "text-brand-700 dark:text-brand-200" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {anyActive && <span className="absolute inset-0 rounded-2xl bg-brand-50 dark:bg-brand-500/15" />}
                  <span className="relative z-10 flex flex-1 items-center gap-3"><Icon size={19} /> {item.label}</span>
                  <ChevronDown size={15} className={cn("relative z-10 transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="mt-1 space-y-1 border-s-2 border-line ps-3 ms-5">
                    {kids.map((k) => {
                      const KIcon = k.icon;
                      const kActive = isActive(k.to);
                      return (
                        <Link
                          key={k.to} to={k.to} {...prefetchHandlers(k.to)} onClick={() => playTap()}
                          className={cn(
                            "relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                            kActive ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <KIcon size={17} /> {k.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              {...prefetchHandlers(item.to)}
              onClick={() => playTap()}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-colors",
                active ? "text-brand-700 dark:text-brand-200" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {/* Instant CSS active background — no framer-motion layoutId. The
                  shared-layout "projection" that slides this pill forced a DOM
                  measure (measureScroll) + delta math on EVERY navigation, which
                  profiling flagged as the top cost of switching sections. */}
              {active && <span className="absolute inset-0 rounded-2xl bg-brand-50 dark:bg-brand-500/15" />}
              <span className="relative z-10 flex flex-1 items-center gap-3">
                <Icon size={19} />
                {item.label}
              </span>
              {/* عدّاد طلبات الحجز الجديدة — على الاستقبال وقسم الحجوزات */}
              {(item.to === "/reception" || item.to === "/bookings") && bookingReqs > 0 && (
                <span className="relative z-10 grid h-5 min-w-5 place-items-center rounded-full bg-danger-500 px-1.5 text-2xs font-bold text-white shadow-soft animate-pulse">
                  {bookingReqs}
                </span>
              )}
              {/* عدّاد طلبات المتجر الجديدة */}
              {item.to === "/store" && storeOrders > 0 && (
                <span className="relative z-10 grid h-5 min-w-5 place-items-center rounded-full bg-danger-500 px-1.5 text-2xs font-bold text-white shadow-soft animate-pulse">
                  {storeOrders}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ذيل الشريط — صف حساب واحد يفتح قائمة فيها الاشتراك والتكبير واللغة
          والمظهر وقفل الجهاز وتبديل الدور والخروج ورقم النسخة. الاشتراك يأخذ
          كارتاً بارزاً فوقه فقط عندما يطلب فعلاً (تجربة/منتهٍ). */}
      {!folded && <SubscriptionNavCard />}
      <AccountMenu compact={folded} />
    </aside>
  );
}

/**
 * Subscription status card in the sidebar — makes upgrading discoverable so a
 * trialing clinic never has to hunt for a URL. Trial → an eye-catching upgrade
 * card; active → a subtle "days left"; expired → a renew prompt. One tap → the
 * subscribe screen. Hidden while blocked (the whole app is already the gate).
 */
function SubscriptionNavCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { status, trialDaysLeft } = useSubscription();

  if (status === "trialing") {
    return (
      <button
        onClick={() => { playTap(); navigate("/subscribe"); }}
        className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-brand-grad p-3 text-start text-white shadow-soft transition hover:shadow-raised"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><Sparkles size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t("sub.subscribeNow", "اشترك الآن")}</span>
          <span className="block text-2xs text-white/85">{t("sub.trialLeft", { n: formatNum(trialDaysLeft), defaultValue: "تجربة مجانية · باقي {{n}} يوم" })}</span>
        </span>
        <ArrowLeft size={16} className="shrink-0 text-white/80" />
      </button>
    );
  }

  if (status === "expired") {
    return (
      <button
        onClick={() => { playTap(); navigate("/subscribe"); }}
        className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-warn-300 bg-warn-50 p-3 text-start text-warn-800 transition hover:bg-warn-100 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-500/20"><Sparkles size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t("sub.expired", "انتهى الاشتراك")}</span>
          <span className="block text-2xs opacity-80">{t("sub.renew", "جدّد للمتابعة")}</span>
        </span>
        <ArrowLeft size={16} className="shrink-0 opacity-70" />
      </button>
    );
  }

  // اشتراك فعّال = لا شيء مطلوب منك، فلا يستحق مساحة دائمة: نقطة خضراء على
  // الأفاتار وسطر داخل قائمة الحساب يكفيان (قاعدة «المساحة للفعل لا للحالة»).
  return null;
}

