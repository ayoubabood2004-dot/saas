import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, PawPrint, LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LogoMark } from "@/components/Logo";
import { playTap } from "@/lib/sounds";
import type { AccountRole } from "@/types";

/** Shown right after login when an account holds BOTH workspaces — pick one to continue. */
export function RoleSelect() {
  const { t } = useTranslation();
  const { user, chooseRole, signOut } = useAuth();
  const navigate = useNavigate();

  const pick = (r: AccountRole) => { playTap(); chooseRole(r); navigate("/"); };
  const firstName = (user?.full_name || "").trim().split(" ")[0];

  const cards = [
    { role: "clinic" as const, Icon: Building2, title: t("role.select.clinic", "Continue as Clinic"), sub: t("role.select.clinicSub", "Manage patients, boarding & treatments"), tint: "from-brand-500 to-brand-700" },
    { role: "owner" as const, Icon: PawPrint, title: t("role.select.owner", "Continue as Pet Owner"), sub: t("role.select.ownerSub", "Your pets, records & appointments"), tint: "from-accent-500 to-accent-600" },
  ];

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><LogoMark size={30} /></div>
        <h1 className="font-display text-2xl font-extrabold text-ink">{t("role.select.title", "Choose how to continue")}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {firstName
            ? t("role.select.greeting", { name: firstName, defaultValue: "Welcome back, {{name}} — this account has both workspaces." })
            : t("role.select.sub", "This account has access to both workspaces.")}
        </p>

        <div className="mt-6 space-y-3">
          {cards.map(({ role, Icon, title, sub, tint }) => (
            <button
              key={role}
              onClick={() => pick(role)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface-1 p-4 text-start transition hover:border-brand-300 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-soft`}><Icon size={24} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold text-ink">{title}</span>
                <span className="block truncate text-xs text-ink-muted">{sub}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-subtle transition group-hover:translate-x-0.5 rtl:rotate-180" />
            </button>
          ))}
        </div>

        <button onClick={() => { signOut(); navigate("/login"); }} className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-subtle transition hover:text-ink">
          <LogOut size={14} /> {t("auth.signOut", "Sign out")}
        </button>
      </motion.div>
    </div>
  );
}
