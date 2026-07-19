import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  ScanLine,
  Settings as SettingsIcon,
  History,
  PawPrint,
  Search,
  LogOut,
  Languages,
  ArrowLeftRight,
  Boxes,
  Store,
  MessageCircle,
  Briefcase,
  BarChart3,
  Sparkles,
  Crown,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/lib/subscription";
import { useEntitlements } from "@/lib/entitlements";
import { formatNum } from "@/lib/utils";
import { setLang, type Lang } from "@/i18n";
import { playTap } from "@/lib/sounds";
import { prefetchHandlers, prefetchAllIdle } from "@/lib/routePrefetch";
import { warmDataIdle } from "@/lib/prefetchData";
import { ThemeToggle, Tooltip } from "@/components/ui";
import { OverrideCorner } from "@/components/ManagerOverride";
import { Logo } from "@/components/Logo";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { useCommandPalette } from "./CommandPaletteProvider";
import { cn } from "@/lib/utils";

/** Desktop navigation rail with profile card (ref img 1). Hidden below lg. */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user, signOut, roles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const palette = useCommandPalette();
  const { can } = usePermissions();
  const { has } = useEntitlements();
  const otherRole = activeRole === "clinic" ? "owner" : "clinic";

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
    { to: "/charts", icon: LayoutGrid, label: t("nav.charts", "الطبلات") },
    { to: "/records", icon: ClipboardList, label: t("records.title") },
    { to: "/inventory", icon: Boxes, label: t("nav.inventory", "Inventory"), show: can("manageInventory") },
    { to: "/retail", icon: Store, label: t("nav.retail", "Retail & Sales"), show: can("processSales") && has("pos") },
    { to: "/reports", icon: BarChart3, label: t("nav.reports", "التقارير"), show: can("viewReports") && has("reports") },
    { to: "/campaigns", icon: MessageCircle, label: t("nav.campaigns", "WhatsApp Campaigns"), show: has("whatsapp") },
    { to: "/staff", icon: Briefcase, label: t("nav.staff", "Staff Management"), show: can("manageStaff") },
    { to: "/scan", icon: ScanLine, label: t("nav.scan") },
    { to: "/activity", icon: History, label: t("nav.activity", "سجل الحركات"), show: can("manageSettings") },
    { to: "/settings", icon: SettingsIcon, label: t("nav.settings"), show: can("manageSettings") },
  ].filter((it) => it.show !== false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(to + "/");

  const initials = (user?.full_name || "")
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel =
    user?.role === "admin" ? t("role.admin", "Clinic") : user?.role === "reception" ? t("role.reception", "Reception") : t("role.doctor", "Veterinarian");

  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line bg-surface-1 p-4 no-print lg:flex">
      {/* Brand */}
      <Link to="/" className="mb-5 flex items-center gap-2.5 px-2 font-display font-extrabold tracking-tighter2 text-ink">
        <Logo size={40} />
        <span className="text-lg">{t("app.name")}</span>
      </Link>

      {/* Search */}
      <button
        onClick={() => palette.open()}
        className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-subtle transition hover:text-ink"
      >
        <Search size={17} />
        <span className="flex-1 text-start">{t("nav.search", "Search")}</span>
        <kbd className="rounded-md border border-line bg-surface-1 px-1.5 text-2xs font-semibold">⌘K</kbd>
      </button>

      {/* Branch switcher — renders only when the clinic has 2+ branches. */}
      <BranchSwitcher className="mt-3" />

      {/* Nav */}
      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
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
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={19} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Subscription status — always visible so paying is one tap away. */}
      <SubscriptionNavCard />

      {/* Profile card + actions */}
      <div className="mt-2">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-grad font-display text-sm font-bold text-white shadow-soft">
            {initials || <PawPrint size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user?.full_name}</p>
            <p className="truncate text-xs text-ink-subtle">{roleLabel}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Tooltip label={i18n.language === "ar" ? "English" : "العربية"}>
            <button
              onClick={() => { setLang((i18n.language === "ar" ? "en" : "ar") as Lang); playTap(); }}
              className="grid h-10 w-10 place-items-center rounded-full text-ink-muted transition hover:bg-surface-1 hover:text-ink"
            >
              <Languages size={18} />
            </button>
          </Tooltip>
          <ThemeToggle />
          <OverrideCorner />
          {roles.length > 1 && (
            <Tooltip label={t("role.switchTo", { role: t(`role.${otherRole}`), defaultValue: "Switch to {{role}}" })}>
              <button
                onClick={() => { switchRole(); navigate("/"); }}
                className="grid h-10 w-10 place-items-center rounded-full text-ink-muted transition hover:bg-brand-50 hover:text-brand-600"
              >
                <ArrowLeftRight size={18} />
              </button>
            </Tooltip>
          )}
          <div className="flex-1" />
          <Tooltip label={t("nav.logout")}>
            <button
              onClick={() => { signOut(); navigate("/login"); }}
              className="grid h-10 w-10 place-items-center rounded-full text-ink-muted transition hover:bg-danger-50 hover:text-danger-600"
            >
              <LogOut size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
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
  const { status, trialDaysLeft, periodDaysLeft } = useSubscription();

  if (status === "trialing") {
    return (
      <button
        onClick={() => { playTap(); navigate("/subscribe"); }}
        className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-brand-grad p-3 text-start text-white shadow-soft transition hover:shadow-raised"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><Sparkles size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">اشترك الآن</span>
          <span className="block text-2xs text-white/85">تجربة مجانية · باقي {formatNum(trialDaysLeft)} يوم</span>
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
          <span className="block text-sm font-bold">انتهى الاشتراك</span>
          <span className="block text-2xs opacity-80">جدّد للمتابعة</span>
        </span>
        <ArrowLeft size={16} className="shrink-0 opacity-70" />
      </button>
    );
  }

  if (status === "active") {
    return (
      <button
        onClick={() => { playTap(); navigate("/subscribe"); }}
        className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface-2 p-3 text-start transition hover:bg-surface-3"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15"><Crown size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">اشتراكك فعّال</span>
          <span className="block text-2xs text-ink-subtle">باقي {formatNum(periodDaysLeft)} يوم</span>
        </span>
      </button>
    );
  }

  return null;
}
