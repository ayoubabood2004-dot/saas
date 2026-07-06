import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Languages,
  Volume2,
  VolumeX,
  LogOut,
  ScanLine,
  CalendarDays,
  Settings as SettingsIcon,
  ClipboardList,
  Search,
  Menu,
  X,
  ArrowLeftRight,
  Boxes,
  Store,
  MessageCircle,
  Briefcase,
  BarChart3,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { setLang, type Lang } from "@/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { isSoundEnabled, setSoundEnabled, playTap } from "@/lib/sounds";
import { prefetchHandlers } from "@/lib/routePrefetch";
import { Tooltip, ThemeToggle } from "@/components/ui";
import { OverrideCorner } from "@/components/ManagerOverride";
import { Logo } from "@/components/Logo";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { branchStore } from "@/lib/branchStore";
import { useCommandPalette } from "@/components/CommandPaletteProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

export function TopBar({ mobileOnly = false }: { mobileOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, signOut, roles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const palette = useCommandPalette();
  const { can } = usePermissions();
  const [sound, setSound] = useState(isSoundEnabled());
  const [menuOpen, setMenuOpen] = useState(false);
  const otherRole = activeRole === "clinic" ? "owner" : "clinic";

  const staff = user?.role === "doctor" || user?.role === "reception" || user?.role === "admin";

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Eagerly hydrate the branch store on every layout (the sidebar is desktop-only),
  // so the device's saved branch is restored before any write stamps a branch —
  // a mobile reload followed by an immediate "new case" still lands correctly.
  useEffect(() => {
    if (staff) void branchStore.ensure(user?.clinic_id ?? user?.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, user?.clinic_id, user?.id]);

  const toggleLang = () => {
    setLang(i18n.language === "ar" ? "en" : ("ar" as Lang));
    playTap();
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) playTap();
  };

  const navItems = staff
    ? [
        { to: "/reception", icon: CalendarDays, label: t("reception.title") },
        { to: "/records", icon: ClipboardList, label: t("records.title") },
        { to: "/inventory", icon: Boxes, label: t("nav.inventory", "Inventory"), show: can("manageInventory") },
        { to: "/retail", icon: Store, label: t("nav.retail", "Retail & Sales"), show: can("processSales") },
        { to: "/reports", icon: BarChart3, label: t("nav.reports", "التقارير"), show: can("viewReports") },
        { to: "/campaigns", icon: MessageCircle, label: t("nav.campaigns", "WhatsApp Campaigns") },
        { to: "/staff", icon: Briefcase, label: t("nav.staff", "Staff Management"), show: can("manageStaff") },
        { to: "/scan", icon: ScanLine, label: t("nav.scan") },
      ].filter((it) => it.show !== false)
    : [];

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <header className={cn("sticky top-0 z-40 border-b border-line bg-surface-1/80 backdrop-blur-xl no-print", mobileOnly && "lg:hidden")}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5 font-display font-extrabold tracking-tighter2 text-ink">
            <Logo size={40} />
            <span className="hidden text-lg sm:block">{t("app.name")}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  {...prefetchHandlers(item.to)}
                  className={cn(
                    "relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    active ? "text-brand-700 dark:text-brand-300" : "text-ink-muted hover:text-ink hover:bg-surface-2",
                  )}
                >
                  {/* Instant CSS active background (no framer-motion layoutId) —
                      the sliding projection cost a DOM measure on every nav. */}
                  {active && <span className="absolute inset-0 rounded-full bg-brand-50 dark:bg-brand-500/15" />}
                  <span className="relative z-10 inline-flex items-center gap-2">
                    <Icon size={17} />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {staff && (
              <Tooltip label="Search · ⌘K">
                <button
                  onClick={() => palette.open()}
                  className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 py-2 pl-3 pr-2.5 text-sm text-ink-subtle transition hover:text-ink sm:flex"
                >
                  <Search size={16} />
                  <span className="hidden lg:inline">Search</span>
                  <kbd className="rounded-md border border-line bg-surface-1 px-1.5 text-2xs font-semibold">⌘K</kbd>
                </button>
              </Tooltip>
            )}

            <Tooltip label={i18n.language === "ar" ? "English" : "العربية"}>
              <button onClick={toggleLang} className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink">
                <Languages size={19} />
              </button>
            </Tooltip>

            <Tooltip label={t("nav.sound")}>
              <button onClick={toggleSound} className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink">
                {sound ? <Volume2 size={19} /> : <VolumeX size={19} className="text-ink-subtle" />}
              </button>
            </Tooltip>

            <ThemeToggle />
            <OverrideCorner compact />

            {staff && can("manageSettings") && (
              <Tooltip label={t("nav.settings")}>
                <Link to="/settings" className="hidden h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink sm:grid">
                  <SettingsIcon size={19} />
                </Link>
              </Tooltip>
            )}

            {roles.length > 1 && (
              <Tooltip label={t("role.switchTo", { role: t(`role.${otherRole}`), defaultValue: "Switch to {{role}}" })}>
                <button
                  onClick={() => { switchRole(); navigate("/"); }}
                  className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-brand-50 hover:text-brand-600"
                >
                  <ArrowLeftRight size={19} />
                </button>
              </Tooltip>
            )}

            {user && (
              <Tooltip label={t("nav.logout")}>
                <button
                  onClick={() => {
                    signOut();
                    navigate("/login");
                  }}
                  className="hidden h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-danger-50 hover:text-danger-600 sm:grid"
                >
                  <LogOut size={19} />
                </button>
              </Tooltip>
            )}

            {/* Mobile menu trigger */}
            {staff && (
              <button onClick={() => setMenuOpen((v) => !v)} className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 md:hidden">
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-t border-line md:hidden"
            >
              <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
                {/* Branch switcher — mobile placement (renders only with 2+ branches). */}
                <BranchSwitcher className="mb-1" inline />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    palette.open();
                  }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-ink-muted hover:bg-surface-2"
                >
                  <Search size={18} /> Search patients
                </button>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      {...prefetchHandlers(item.to)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-3 font-medium",
                        isActive(item.to) ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink hover:bg-surface-2",
                      )}
                    >
                      <Icon size={18} /> {item.label}
                    </Link>
                  );
                })}
                {can("manageSettings") && (
                  <Link to="/settings" className="flex items-center gap-3 rounded-2xl px-3 py-3 text-ink hover:bg-surface-2">
                    <SettingsIcon size={18} /> {t("nav.settings")}
                  </Link>
                )}
                {roles.length > 1 && (
                  <button
                    onClick={() => { setMenuOpen(false); switchRole(); navigate("/"); }}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 text-ink hover:bg-surface-2"
                  >
                    <ArrowLeftRight size={18} /> {t("role.switchTo", { role: t(`role.${otherRole}`), defaultValue: "Switch to {{role}}" })}
                  </button>
                )}
                <button
                  onClick={() => {
                    signOut();
                    navigate("/login");
                  }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-danger-600 hover:bg-danger-50"
                >
                  <LogOut size={18} /> {t("nav.logout")}
                </button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
    </header>
  );
}
