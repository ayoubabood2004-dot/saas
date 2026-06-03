import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Profile, Role } from "@/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import { setActiveClinicId, clearActiveClinic, type ClinicAccount } from "@/lib/clinics";
import type { OwnerAccount } from "@/lib/owners";

interface AuthState {
  user: Profile | null;
  loading: boolean;
  demo: boolean;
  signInDemo: (role: Role, name?: string) => void;
  signInClinic: (clinic: ClinicAccount) => void;
  signInOwner: (owner: OwnerAccount) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const KEY = "vp_session";

const DEMO_OWNER: Profile = {
  id: "demo-owner",
  full_name: "Maya Khalil",
  email: "owner@demo.vet",
  role: "owner",
};

const DEMO_VET: Profile = {
  id: "demo-vet",
  full_name: "Dr. Sarah Mansour",
  email: "vet@demo.vet",
  role: "doctor",
  clinic_id: "clinic-happy-paws",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    const profile: Profile = {
      id: clinic.id,
      full_name: clinic.name,
      email: clinic.email,
      role: "admin",
      clinic_id: clinic.id,
    };
    setActiveClinicId(clinic.id);
    persist(profile);
  };

  const signInOwner = (owner: OwnerAccount) => {
    clearActiveClinic();
    persist({ id: owner.id, full_name: owner.name, email: owner.email, role: "owner", phone: owner.phone });
  };

  const signOut = () => {
    setUser(null);
    clearActiveClinic();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<AuthState>(
    () => ({ user, loading, demo: !isSupabaseConfigured, signInDemo, signInClinic, signInOwner, signOut }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
