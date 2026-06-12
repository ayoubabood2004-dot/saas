import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  ScanLine,
  Settings as SettingsIcon,
  PawPrint,
  Search,
  LogOut,
  Languages,
  ArrowLeftRight,
  Barcode,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { setLang, type Lang } from "@/i18n";
import { playTap } from "@/lib/sounds";
import { ThemeToggle, Tooltip } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { useCommandPalette } from "./CommandPaletteProvider";
import { cn } from "@/lib/utils";

/** Desktop navigation rail with profile card (ref img 1). Hidden below lg. */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user, signOut, roles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const palette = useCommandPalette();
  const otherRole = activeRole === "clinic" ? "owner" : "clinic";

  const items = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard", "Dashboard"), exact: true },
    { to: "/reception", icon: CalendarDays, label: t("reception.title") },
    { to: "/records", icon: ClipboardList, label: t("records.title") },
    { to: "/inventory", icon: Barcode, label: t("nav.inventory", "Inventory & POS") },
    { to: "/scan", icon: ScanLine, label: t("nav.scan") },
    { to: "/settings", icon: SettingsIcon, label: t("nav.settings") },
  ];

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

      {/* Nav */}
      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => playTap()}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-colors",
                active ? "text-brand-700 dark:text-brand-200" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-2xl bg-brand-50 dark:bg-brand-500/15"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={19} />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

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
