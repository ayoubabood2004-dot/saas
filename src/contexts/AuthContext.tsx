import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Profile, Role } from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { setActiveClinicId, clearActiveClinic, type ClinicAccount } from "@/lib/clinics";
import type { OwnerAccount } from "@/lib/owners";

interface SignupExtra {
  phone?: string;
  city?: string;
}

interface AuthState {
  user: Profile | null;
  loading: boolean;
  demo: boolean;
  /** True when the user arrived via a password-recovery link and must set a new password. */
  recovery: boolean;
  signInDemo: (role: Role, name?: string) => void;
  signInClinic: (clinic: ClinicAccount) => void;
  signInOwner: (owner: OwnerAccount) => void;
  // Live Supabase email/password auth (used when env vars are configured).
  signUpEmail: (email: string, password: string, fullName: string, role: Role, extra?: SignupExtra) => Promise<{ error: string | null; needsConfirm?: boolean }>;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  verifyEmailCode: (email: string, token: string) => Promise<{ error: string | null }>;
  resendSignupCode: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const KEY = "vp_session";

const DEMO_OWNER: Profile = { id: "demo-owner", full_name: "Maya Khalil", email: "owner@demo.vet", role: "owner" };
const DEMO_VET: Profile = { id: "demo-vet", full_name: "Dr. Sarah Mansour", email: "vet@demo.vet", role: "doctor", clinic_id: "clinic-happy-paws" };

/** Fetch the app profile row (1:1 with auth.users) for a signed-in Supabase user. */
async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role as Role,
    phone: data.phone ?? undefined,
    clinic_id: data.clinic_id ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const sb = supabase;
      let active = true;
      void sb.auth.getSession().then(async ({ data }) => {
        if (!active) return;
        setUser(data.session?.user ? await loadProfile(data.session.user.id) : null);
        setLoading(false);
      });
      const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        setUser(session?.user ? await loadProfile(session.user.id) : null);
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    }

    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const profile = JSON.parse(raw) as Profile;
        setUser(profile);
        if (profile.clinic_id) setActiveClinicId(profile.clinic_id);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (profile: Profile) => {
    setUser(profile);
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  };

  const signInDemo = (role: Role, name?: string) => {
    const base = role === "owner" ? DEMO_OWNER : DEMO_VET;
    const profile: Profile = { ...base, full_name: name || base.full_name, role };
    if (profile.clinic_id) setActiveClinicId(profile.clinic_id);
    else clearActiveClinic();
    persist(profile);
  };

  const signInClinic = (clinic: ClinicAccount) => {
    const profile: Profile = { id: clinic.id, full_name: clinic.name, email: clinic.email, role: "admin", clinic_id: clinic.id };
    setActiveClinicId(clinic.id);
    persist(profile);
  };

  const signInOwner = (owner: OwnerAccount) => {
    clearActiveClinic();
    persist({ id: owner.id, full_name: owner.name, email: owner.email, role: "owner", phone: owner.phone });
  };

  // --- Live Supabase auth ---------------------------------------------------
  const signUpEmail = async (email: string, password: string, fullName: string, role: Role, extra?: SignupExtra) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // handle_new_user() (DB trigger) reads these to populate the profile row.
      options: { data: { full_name: fullName.trim(), role, phone: extra?.phone || null, city: extra?.city || null } },
    });
    if (error) return { error: error.message };
    return { error: null, needsConfirm: !data.session };
  };

  const signInEmail = async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
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
    if (isSupabaseConfigured && supabase) {
      void supabase.auth.signOut();
      setUser(null);
      setRecovery(false);
      clearActiveClinic();
      return;
    }
    setUser(null);
    clearActiveClinic();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<AuthState>(
    () => ({
      user, loading, recovery, demo: !isSupabaseConfigured,
      signInDemo, signInClinic, signInOwner,
      signUpEmail, signInEmail, verifyEmailCode, resendSignupCode, resetPassword, updatePassword, signOut,
    }),
    [user, loading, recovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
