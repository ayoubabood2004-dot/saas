import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Profile, Role, AccountRole } from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/errors";
import { setActiveClinicId, clearActiveClinic, type ClinicAccount } from "@/lib/clinics";
import type { OwnerAccount } from "@/lib/owners";

interface SignupExtra {
  phone?: string;
  city?: string;
}

/** Raw record loaded from the backend before an active role is resolved. */
interface RawProfile {
  id: string;
  full_name: string;
  email: string;
  rawRole: Role; // the stored staff sub-role (admin/doctor/reception) or 'owner'
  roles: AccountRole[]; // account types the user holds
  phone?: string;
  clinic_id?: string | null;
}

interface AuthState {
  user: Profile | null;
  loading: boolean;
  demo: boolean;
  /** True when the user arrived via a password-recovery link and must set a new password. */
  recovery: boolean;
  /** Account types the signed-in user holds. */
  roles: AccountRole[];
  /** Active account type for this session (null while a both-role choice is pending). */
  activeRole: AccountRole | null;
  /** True when the user holds BOTH account roles and hasn't picked one for this session. */
  needsRoleChoice: boolean;
  chooseRole: (r: AccountRole) => void;
  switchRole: () => void;
  /** Append an account role to the *currently signed-in* user (secure: server uses auth.uid()). */
  addRole: (r: AccountRole) => Promise<{ error: string | null }>;
  signInDemo: (role: Role, name?: string) => void;
  signInClinic: (clinic: ClinicAccount) => void;
  signInOwner: (owner: OwnerAccount) => void;
  // Live Supabase email/password auth (used when env vars are configured).
  signUpEmail: (email: string, password: string, fullName: string, role: Role, extra?: SignupExtra) => Promise<{ error: string | null; needsConfirm?: boolean; alreadyExists?: boolean }>;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  verifyEmailCode: (email: string, token: string) => Promise<{ error: string | null }>;
  resendSignupCode: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const KEY = "vp_session";
const ACTIVE_KEY = "vp_active_role";

const isAccountRole = (r: unknown): r is AccountRole => r === "owner" || r === "clinic";
/** Map an effective role to its account type. */
const accountOf = (role: Role): AccountRole => (role === "owner" ? "owner" : "clinic");

function readStoredActive(): AccountRole | null {
  try { const v = localStorage.getItem(ACTIVE_KEY); return isAccountRole(v) ? v : null; } catch { return null; }
}
function storeActive(r: AccountRole | null) {
  try { if (r) localStorage.setItem(ACTIVE_KEY, r); else localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
}

/** Effective app role given the active account type. Clinic keeps the staff sub-role. */
function effectiveRole(active: AccountRole, raw: RawProfile): Role {
  if (active === "owner") return "owner";
  return raw.rawRole !== "owner" ? raw.rawRole : "admin";
}

const DEMO_OWNER = { id: "demo-owner", full_name: "Maya Khalil", email: "owner@demo.vet" };
const DEMO_VET = { id: "demo-vet", full_name: "Dr. Sarah Mansour", email: "vet@demo.vet", clinic_id: "clinic-happy-paws" };

/** Fetch the app profile row (1:1 with auth.users) for a signed-in Supabase user. */
async function loadRawProfile(userId: string): Promise<RawProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) return null;
    const rawRole = ((data.role as Role) ?? "owner");
    // `roles` column may not exist yet (before migration 0005) — derive from `role`.
    const fromArr = Array.isArray(data.roles) ? (data.roles as unknown[]).filter(isAccountRole) : [];
    const roles = fromArr.length ? fromArr : [accountOf(rawRole)];
    return { id: data.id, full_name: data.full_name, email: data.email, rawRole, roles, phone: data.phone ?? undefined, clinic_id: data.clinic_id ?? null };
  } catch {
    // Network/backend error (e.g. project paused) — treat as "no profile" so boot never hangs.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<RawProfile | null>(null);
  const [activeRole, setActiveRole] = useState<AccountRole | null>(readStoredActive());
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  // ---- Mount: restore session (Supabase live, or demo localStorage) -------
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const sb = supabase;
      let active = true;
      // Failsafe: a slow/unreachable backend must never trap the app on a blank spinner.
      const failsafe = setTimeout(() => { if (active) setLoading(false); }, 7000);
      const finish = () => { if (active) { clearTimeout(failsafe); setLoading(false); } };

      void (async () => {
        try {
          const { data } = await withTimeout(sb.auth.getSession(), 8000);
          if (!active) return;
          const session = data.session;
          if (session?.user) {
            // A valid persisted session exists (e.g. after F5). Build a minimal
            // profile from the session token so that a transient profiles-read
            // failure can NEVER log the user out on refresh.
            const meta = (session.user.user_metadata ?? {}) as { full_name?: string; role?: Role; phone?: string };
            const metaRole: Role = (meta.role as Role) || "owner";
            const fallback: RawProfile = {
              id: session.user.id,
              full_name: meta.full_name || session.user.email?.split("@")[0] || "User",
              email: session.user.email ?? "",
              rawRole: metaRole,
              roles: [accountOf(metaRole)],
              phone: meta.phone,
              clinic_id: null,
            };
            const rp = await loadRawProfile(session.user.id).catch(() => null);
            if (active) setRaw(rp ?? fallback);
          } else if (active) {
            setRaw(null);
          }
        } catch {
          /* getSession timed out / errored — show login (the failsafe also covers it) */
        } finally {
          finish();
        }
      })();

      const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        // Only an explicit sign-out (or a dead refresh token) clears the user.
        if (event === "SIGNED_OUT") { if (active) setRaw(null); finish(); return; }
        // No valid session and NOT an explicit sign-out → a transient blip; never
        // log the user out over it.
        if (!session?.user) { finish(); return; }
        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION: the session is
        // valid. Refresh the profile, but if that read fails transiently KEEP the
        // current user instead of throwing them out mid-session.
        try {
          const rp = await loadRawProfile(session.user.id);
          if (active) setRaw((prev) => rp ?? prev);
        } catch {
          /* keep the current user */
        } finally {
          finish();
        }
      });
      return () => { active = false; clearTimeout(failsafe); sub.subscription.unsubscribe(); };
    }

    // Demo mode
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { raw?: RawProfile; active?: AccountRole } | Profile;
        if (parsed && "raw" in parsed && parsed.raw) {
          setRaw(parsed.raw);
          if (isAccountRole(parsed.active)) setActiveRole(parsed.active);
        } else if (parsed && "role" in parsed) {
          // Legacy single-role session.
          const p = parsed as Profile;
          setRaw({ id: p.id, full_name: p.full_name, email: p.email, rawRole: p.role, roles: [accountOf(p.role)], phone: p.phone, clinic_id: p.clinic_id ?? null });
          setActiveRole(accountOf(p.role));
        }
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Derive active role + the exposed Profile ---------------------------
  const resolvedActive: AccountRole | null = !raw
    ? null
    : raw.roles.length <= 1
      ? (raw.roles[0] ?? accountOf(raw.rawRole))
      : (activeRole && raw.roles.includes(activeRole)) ? activeRole : null;
  const needsRoleChoice = !!raw && resolvedActive === null;

  const user = useMemo<Profile | null>(() => {
    if (!raw) return null;
    const act = resolvedActive ?? raw.roles[0] ?? accountOf(raw.rawRole);
    return {
      id: raw.id, full_name: raw.full_name, email: raw.email,
      role: effectiveRole(act, raw), roles: raw.roles,
      phone: raw.phone, clinic_id: raw.clinic_id ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, resolvedActive]);

  // Keep the active clinic id in sync with the active role.
  useEffect(() => {
    if (resolvedActive === "clinic" && raw?.clinic_id) setActiveClinicId(raw.clinic_id);
    else if (resolvedActive === "owner") clearActiveClinic();
  }, [resolvedActive, raw]);

  // ---- Demo persistence ---------------------------------------------------
  const persistRaw = (rp: RawProfile, active: AccountRole) => {
    setRaw(rp);
    setActiveRole(active);
    storeActive(active);
    try { localStorage.setItem(KEY, JSON.stringify({ raw: rp, active })); } catch { /* ignore */ }
  };

  const signInDemo = (role: Role, name?: string) => {
    const base = role === "owner" ? DEMO_OWNER : DEMO_VET;
    persistRaw({ id: base.id, full_name: name || base.full_name, email: base.email, rawRole: role, roles: [accountOf(role)], clinic_id: (base as { clinic_id?: string }).clinic_id ?? null }, accountOf(role));
  };
  const signInClinic = (clinic: ClinicAccount) => {
    persistRaw({ id: clinic.id, full_name: clinic.name, email: clinic.email, rawRole: "admin", roles: ["clinic"], clinic_id: clinic.id }, "clinic");
  };
  const signInOwner = (owner: OwnerAccount) => {
    persistRaw({ id: owner.id, full_name: owner.name, email: owner.email, rawRole: "owner", roles: ["owner"], phone: owner.phone, clinic_id: null }, "owner");
  };

  // ---- Role management ----------------------------------------------------
  const chooseRole = (r: AccountRole) => {
    if (!raw || !raw.roles.includes(r)) return;
    storeActive(r);
    setActiveRole(r);
    if (!isSupabaseConfigured) { try { localStorage.setItem(KEY, JSON.stringify({ raw, active: r })); } catch { /* ignore */ } }
  };
  const switchRole = () => {
    if (!raw || raw.roles.length < 2 || !resolvedActive) return;
    const other = raw.roles.find((x) => x !== resolvedActive);
    if (other) chooseRole(other);
  };
  const addRole = async (r: AccountRole): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc("add_my_role", { p_role: r });
        if (error) return { error: error.message };
        const next = Array.isArray(data) ? (data as unknown[]).filter(isAccountRole) : null;
        setRaw((prev) => (prev ? { ...prev, roles: next && next.length ? next : Array.from(new Set([...prev.roles, r])) } : prev));
        storeActive(r);
        setActiveRole(r);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to add role" };
      }
    }
    if (raw) persistRaw({ ...raw, roles: Array.from(new Set([...raw.roles, r])) }, r);
    return { error: null };
  };

  // ---- Live Supabase auth -------------------------------------------------
  const signUpEmail = async (email: string, password: string, fullName: string, role: Role, extra?: SignupExtra) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role, phone: extra?.phone || null, city: extra?.city || null } },
    });
    if (error) return { error: error.message };
    // Enumeration protection: an existing confirmed email returns a user with no
    // identities and sends no code. Surface that so the UI can route to "sign in
    // and add this role" instead of failing with a duplicate-email error.
    if (data.user && (data.user.identities?.length ?? 0) === 0) return { error: null, alreadyExists: true };
    return { error: null, needsConfirm: !data.session };
  };

  const signInEmail = async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const sb = supabase;
    try {
      // Clear any stale/expired session + auth locks BEFORE authenticating, so a
      // corrupt token can't make the new sign-in hang or conflict. scope:"local"
      // just clears storage (no network round-trip that could itself hang).
      try { await withTimeout(sb.auth.signOut({ scope: "local" }), 4000); } catch { /* ignore */ }
      // Bound the sign-in so a hung request can NEVER leave the button on "Loading…".
      const { error } = await withTimeout(sb.auth.signInWithPassword({ email: email.trim(), password }), 12000);
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Sign-in failed." };
    }
  };

  const verifyEmailCode = async (email: string, token: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "signup" });
    return { error: error?.message ?? null };
  };

  const resendSignupCode = async (email: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    return { error: error?.message ?? null };
  };

  const resetPassword = async (email: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setRecovery(false);
    return { error: error?.message ?? null };
  };

  const signOut = () => {
    if (isSupabaseConfigured && supabase) void supabase.auth.signOut();
    setRaw(null);
    setActiveRole(null);
    setRecovery(false);
    storeActive(null);
    clearActiveClinic();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  const value = useMemo<AuthState>(
    () => ({
      user, loading, recovery, demo: !isSupabaseConfigured,
      roles: raw?.roles ?? [], activeRole: resolvedActive, needsRoleChoice,
      chooseRole, switchRole, addRole,
      signInDemo, signInClinic, signInOwner,
      signUpEmail, signInEmail, verifyEmailCode, resendSignupCode, resetPassword, updatePassword, signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, recovery, raw, resolvedActive, needsRoleChoice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
