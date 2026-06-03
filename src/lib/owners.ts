// Pet-owner accounts (demo). Each owner registers their own info and gets a personal
// barcode (owner_token) — distinct from each pet's passport QR and from clinic accounts.

export interface OwnerAccount {
  id: string;
  name: string;
  email: string;
  password: string; // demo only
  phone?: string;
  owner_token: string; // personal QR / barcode
  created_at: string;
}

const KEY = "vp_owners";

const SEED: OwnerAccount[] = [
  {
    id: "demo-owner",
    name: "Maya Khalil",
    email: "owner@demo.vet",
    password: "demo1234",
    phone: "+964 770 111 2222",
    owner_token: "OWNER-MAYA-5G7H2",
    created_at: new Date().toISOString(),
  },
];

export function loadOwners(): OwnerAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as OwnerAccount[];
  } catch {
    /* ignore */
  }
  saveOwners(SEED);
  return SEED;
}

function saveOwners(list: OwnerAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getOwner(id: string): OwnerAccount | undefined {
  return loadOwners().find((o) => o.id === id);
}

export function getOwnerByToken(token: string): OwnerAccount | undefined {
  const t = token.trim().toUpperCase();
  return loadOwners().find((o) => o.owner_token.toUpperCase() === t);
}

function makeToken(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "OWNER";
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `OWNER-${base}-${rand}`;
}

export type OwnerRegisterResult = { ok: true; owner: OwnerAccount } | { ok: false; error: "email_taken" };

export function registerOwner(input: { name: string; email: string; password: string; phone?: string }): OwnerRegisterResult {
  const list = loadOwners();
  const email = input.email.trim().toLowerCase();
  if (list.some((o) => o.email.toLowerCase() === email)) return { ok: false, error: "email_taken" };
  const owner: OwnerAccount = {
    id: `owner_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    email,
    password: input.password,
    phone: input.phone?.trim() || undefined,
    owner_token: makeToken(input.name),
    created_at: new Date().toISOString(),
  };
  list.push(owner);
  saveOwners(list);
  return { ok: true, owner };
}

export function authenticateOwner(email: string, password: string): OwnerAccount | null {
  const e = email.trim().toLowerCase();
  return loadOwners().find((o) => o.email.toLowerCase() === e && o.password === password) ?? null;
}

export function getOwnerByEmail(email: string): OwnerAccount | undefined {
  const e = email.trim().toLowerCase();
  return loadOwners().find((o) => o.email.toLowerCase() === e);
}

export function setOwnerPassword(email: string, newPassword: string): boolean {
  const list = loadOwners();
  const o = list.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!o) return false;
  o.password = newPassword;
  saveOwners(list);
  return true;
}
