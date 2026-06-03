// Clinic accounts (demo). Each clinic registers its own info and keeps an independent
// data namespace (catalogs, ranges, dial code) keyed by its id — see getActiveClinicId().

export interface ClinicAccount {
  id: string;
  name: string;
  email: string;
  password: string; // demo only — never store plaintext passwords in production
  city?: string;
  phone?: string;
  license?: string;
  created_at: string;
}

const KEY = "vp_clinics";
const ACTIVE_KEY = "vp_active_clinic";

const SEED: ClinicAccount[] = [
  {
    id: "clinic-happy-paws",
    name: "Happy Paws Veterinary Clinic",
    email: "clinic@happypaws.vet",
    password: "demo1234",
    city: "Baghdad",
    phone: "+964 770 000 0000",
    created_at: new Date().toISOString(),
  },
];

export function loadClinics(): ClinicAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ClinicAccount[];
  } catch {
    /* ignore */
  }
  saveClinics(SEED);
  return SEED;
}

function saveClinics(list: ClinicAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getClinic(id: string): ClinicAccount | undefined {
  return loadClinics().find((c) => c.id === id);
}

export type RegisterResult = { ok: true; clinic: ClinicAccount } | { ok: false; error: "email_taken" };

export function registerClinic(input: { name: string; email: string; password: string; city?: string; phone?: string; license?: string }): RegisterResult {
  const list = loadClinics();
  const email = input.email.trim().toLowerCase();
  if (list.some((c) => c.email.toLowerCase() === email)) return { ok: false, error: "email_taken" };
  const clinic: ClinicAccount = {
    id: `clinic_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    email,
    password: input.password,
    city: input.city?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    license: input.license?.trim() || undefined,
    created_at: new Date().toISOString(),
  };
  list.push(clinic);
  saveClinics(list);
  return { ok: true, clinic };
}

export function authenticateClinic(email: string, password: string): ClinicAccount | null {
  const e = email.trim().toLowerCase();
  return loadClinics().find((c) => c.email.toLowerCase() === e && c.password === password) ?? null;
}

export function getClinicByEmail(email: string): ClinicAccount | undefined {
  const e = email.trim().toLowerCase();
  return loadClinics().find((c) => c.email.toLowerCase() === e);
}

export function setClinicPassword(email: string, newPassword: string): boolean {
  const list = loadClinics();
  const c = list.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!c) return false;
  c.password = newPassword;
  saveClinics(list);
  return true;
}

/* ---------------- Active clinic (drives per-clinic data namespacing) ---------------- */
export function getActiveClinicId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || "default";
  } catch {
    return "default";
  }
}

export function setActiveClinicId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearActiveClinic() {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
