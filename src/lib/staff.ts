// Staff management + Role-Based Access Control (RBAC).
//
// Persistence is now Supabase-first: when a real backend is configured the team
// lives in the `staff` table (clinic-isolated by the unified  clinic_id =
// auth_clinic()  policy). Without a backend it transparently falls back to
// localStorage (demo / offline). The first Supabase load auto-migrates any
// staff a clinic had created locally, so nothing is lost in the transition.
//
// The permission matrix below is pure/client-side and is the single source of
// truth for what each role may do (read by the usePermissions hook).
import { getActiveClinicId } from "./clinics";
import { uuid } from "./utils";
import { DOCTORS } from "./clinic";
import { supabase } from "./supabase";
import type { Role } from "@/types";

export type StaffRole = "manager" | "veterinarian" | "receptionist" | "groomer";
// "pending" = invited but hasn't joined via their link yet; "active" = joined.
export type StaffStatus = "pending" | "active" | "suspended";

/** Per-staff custom overrides: a capability → allowed boolean. Absent keys fall
 *  back to the base-role preset. An empty map means "use the role preset". */
export type PermissionMap = Partial<Record<Capability, boolean>>;

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  specialty: string;
  joinDate: string; // ISO date (YYYY-MM-DD)
  status: StaffStatus;
  bio: string;
  avatar?: string | null;
  /** Granular overrides on top of the role preset (see effectiveCan). */
  permissions?: PermissionMap;
  /** Links a roster row to the invite that created it (for onboarding activation). */
  inviteCode?: string | null;
  /** The auth user this staff row belongs to (set on join) — used to attribute audit events. */
  userId?: string | null;
}

export const STAFF_ROLES: StaffRole[] = ["manager", "veterinarian", "receptionist", "groomer"];

/* ----------------------------- Permissions ----------------------------- */

export type Capability =
  | "manageStaff" | "manageSettings" | "viewReports" | "viewProfits"
  | "deleteInvoices" | "processSales" | "manageInventory" | "editMedical"
  | "addPets" | "viewCalendar";

export const CAPABILITIES: { id: Capability; label: string }[] = [
  { id: "viewCalendar", label: "عرض التقويم والمواعيد" },
  { id: "addPets", label: "إضافة المرضى وفتح الملفات" },
  { id: "editMedical", label: "تعديل السجلات الطبية والعلاجات" },
  { id: "processSales", label: "إجراء عمليات البيع (الكاشير)" },
  { id: "manageInventory", label: "إدارة المخزون والمنتجات" },
  { id: "viewReports", label: "عرض تقارير المبيعات" },
  { id: "viewProfits", label: "الاطّلاع على الأرباح والإيرادات" },
  { id: "deleteInvoices", label: "حذف الفواتير نهائياً" },
  { id: "manageSettings", label: "تعديل إعدادات العيادة" },
  { id: "manageStaff", label: "إدارة الكادر والصلاحيات" },
];

export const PERMISSIONS: Record<StaffRole, Capability[]> = {
  manager: CAPABILITIES.map((c) => c.id),
  veterinarian: ["viewCalendar", "addPets", "editMedical", "processSales", "manageInventory"],
  receptionist: ["viewCalendar", "addPets", "processSales"],
  groomer: ["viewCalendar", "addPets"],
};

/** High-risk capabilities that trigger a confirmation when granted to non-managers. */
export const SENSITIVE_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "viewProfits", "deleteInvoices", "manageStaff", "manageSettings",
]);

/** The base-role preset as a full capability → boolean map. */
export function presetMap(role: StaffRole): Record<Capability, boolean> {
  return Object.fromEntries(CAPABILITIES.map((c) => [c.id, roleCan(role, c.id)])) as Record<Capability, boolean>;
}

/**
 * The effective verdict for a capability: a per-staff override wins when present,
 * otherwise the base-role preset. Managers always have everything.
 */
export function effectiveCan(role: StaffRole, cap: Capability, overrides?: PermissionMap | null): boolean {
  if (role === "manager") return true;
  if (overrides && cap in overrides) return !!overrides[cap];
  return roleCan(role, cap);
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "مدير العيادة",
  veterinarian: "طبيب بيطري",
  receptionist: "موظف استقبال",
  groomer: "أخصائي عناية",
};

export function roleCan(role: StaffRole, cap: Capability): boolean {
  return PERMISSIONS[role]?.includes(cap) ?? false;
}

export function appRoleToStaffRole(role?: Role | null): StaffRole {
  switch (role) {
    case "doctor": return "veterinarian";
    case "reception": return "receptionist";
    case "admin": return "manager";
    default: return "manager";
  }
}

export function blankStaff(): StaffMember {
  // A real UUID so the row drops straight into the Supabase `staff` table.
  return { id: uuid(), name: "", email: "", phone: "", role: "receptionist", specialty: "", joinDate: new Date().toISOString().slice(0, 10), status: "active", bio: "", avatar: null, permissions: {} };
}

/* ----------------------------- localStorage (demo / migration source) ---- */

const keyName = () => `vp_staff_${getActiveClinicId()}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seed(): StaffMember[] {
  const roles: StaffRole[] = ["manager", "veterinarian", "veterinarian"];
  const specialties = ["جراحة عامة", "الطب الباطني", "التطعيم والوقاية"];
  const dates = ["2021-03-01", "2022-07-15", "2023-01-10"];
  const base: StaffMember[] = DOCTORS.map((d, i) => ({
    id: uuid(), name: d.name, email: `${d.id}@happypaws.vet`, phone: `+964 770 000 100${i}`,
    role: roles[i] ?? "veterinarian", specialty: specialties[i] ?? "طب بيطري عام",
    joinDate: dates[i] ?? "2023-01-01", status: "active", bio: "عضو في فريق عيادة doctorVet.", avatar: null,
  }));
  base.push(
    { id: uuid(), name: "نور قاسم", email: "noor@happypaws.vet", phone: "+964 771 222 3344", role: "receptionist", specialty: "إدارة مكتب الاستقبال", joinDate: "2023-09-05", status: "active", bio: "مسؤولة استقبال العملاء وجدولة المواعيد.", avatar: null },
    { id: uuid(), name: "حسن علي", email: "hasan@happypaws.vet", phone: "+964 772 555 6677", role: "groomer", specialty: "العناية والتجميل", joinDate: "2024-02-20", status: "active", bio: "أخصائي حلاقة وعناية بالحيوانات.", avatar: null },
  );
  return base;
}

function loadLocal(): StaffMember[] {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) { const p = JSON.parse(raw) as StaffMember[]; if (Array.isArray(p)) return p; }
  } catch { /* ignore */ }
  const fresh = seed();
  saveLocal(fresh);
  return fresh;
}

function saveLocal(list: StaffMember[]) {
  try { localStorage.setItem(keyName(), JSON.stringify(list)); } catch { /* ignore */ }
}

/* ----------------------------- Supabase mapping -------------------------- */

interface StaffRow {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; specialty: string | null; join_date: string | null;
  status: string; bio: string | null; avatar: string | null;
  permissions: PermissionMap | null; invite_code?: string | null; user_id?: string | null;
}

const rowToMember = (r: StaffRow): StaffMember => ({
  id: r.id, name: r.name, email: r.email ?? "", phone: r.phone ?? "",
  role: (r.role as StaffRole) ?? "receptionist", specialty: r.specialty ?? "",
  joinDate: r.join_date ?? "", status: (r.status as StaffStatus) ?? "active",
  bio: r.bio ?? "", avatar: r.avatar ?? null,
  permissions: (r.permissions && typeof r.permissions === "object") ? r.permissions : {},
  inviteCode: r.invite_code ?? null,
  userId: r.user_id ?? null,
});

// clinic_id is intentionally omitted — the DB default (auth.uid()) + RLS stamp it.
const memberToRow = (m: StaffMember) => ({
  id: UUID_RE.test(m.id) ? m.id : uuid(),
  name: m.name, email: m.email || null, phone: m.phone || null,
  role: m.role, specialty: m.specialty || null, join_date: m.joinDate || null,
  status: m.status, bio: m.bio || null, avatar: m.avatar ?? null,
  permissions: m.permissions ?? {},
});

/* ----------------------------- Public async API -------------------------- */

/** Load the clinic's team. Supabase when configured (RLS-isolated), else local
 *  demo seed. A real (Supabase) clinic starts EMPTY — the manager adds their own
 *  team; we never seed fake sample staff into a live clinic. */
export async function listStaff(): Promise<StaffMember[]> {
  if (!supabase) return loadLocal();
  const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as StaffRow[]).map(rowToMember);
}

export async function saveStaff(m: StaffMember): Promise<void> {
  if (!supabase) {
    const list = loadLocal();
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m; else list.push(m);
    saveLocal(list);
    return;
  }
  const { error } = await supabase.from("staff").upsert(memberToRow(m));
  if (error) throw new Error(error.message);
}

export async function deleteStaff(id: string): Promise<void> {
  if (!supabase) { saveLocal(loadLocal().filter((x) => x.id !== id)); return; }
  // Atomic removal (migration 0072): revokes the MEMBERSHIP (the actual access),
  // burns the invite code, and deletes the roster row — in one server call. The
  // old client-side roster delete left the membership active, so a "removed"
  // employee silently kept full access to the clinic.
  const { data, error } = await supabase.rpc("remove_staff_member", { p_staff: id });
  if (!error) {
    const r = (data ?? {}) as { ok?: boolean; error?: string };
    if (r.ok === false) throw new Error(r.error ?? "remove_failed");
    return;
  }
  // Pre-0072 backend (function missing) → legacy roster-only delete.
  if (!/function|schema cache|does not exist|PGRST202|42883/i.test(error.message)) throw new Error(error.message);
  const { error: e2 } = await supabase.from("staff").delete().eq("id", id);
  if (e2) throw new Error(e2.message);
}

export async function setStaffStatus(id: string, status: StaffStatus): Promise<void> {
  if (!supabase) {
    const list = loadLocal();
    const m = list.find((x) => x.id === id);
    if (m) m.status = status;
    saveLocal(list);
    return;
  }
  const { error } = await supabase.from("staff").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---- Demo-mode onboarding (mirrors the server triggers in migration 0029) ----
 * On Supabase the DB does this automatically; in demo mode the invite flow calls
 * these so invited staff still appear (pending) and activate on join. */

/** Mirror an invite into a PENDING roster row (demo only; no-op on Supabase). */
export function addPendingStaffLocal(email: string | null, role: StaffRole, code: string) {
  if (supabase) return;
  const list = loadLocal();
  if (list.some((s) => s.inviteCode === code)) return;
  list.push({
    id: uuid(), name: email || `دعوة ${code}`, email: email || "", phone: "",
    role, specialty: "", joinDate: "", status: "pending", bio: "", avatar: null,
    permissions: {}, inviteCode: code,
  });
  saveLocal(list);
}

/** Remove a still-pending roster row when its invite is revoked (demo only). */
export function removePendingStaffLocal(code: string) {
  if (supabase) return;
  saveLocal(loadLocal().filter((s) => !(s.inviteCode === code && s.status === "pending")));
}

/** Flip a pending roster row to active when its invite is accepted (demo only). */
export function activateStaffByInviteLocal(code: string) {
  if (supabase) return;
  const list = loadLocal();
  const m = list.find((s) => s.inviteCode === code);
  if (m) { m.status = "active"; m.joinDate = m.joinDate || new Date().toISOString().slice(0, 10); saveLocal(list); }
}

/* -------- Current user's granular permission overrides (for usePermissions) ----
 * The logged-in staff member is matched to their staff row by email (the staff
 * directory isn't joined to auth by id). Cached per-email so repeated mounts
 * don't refetch. Managers never need this (they have everything). */
let permsCache: { email: string; perms: PermissionMap } | null = null;

const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();

/** Synchronously read cached overrides for an email (null if not yet hydrated). */
export function peekMyPermissions(email?: string | null): PermissionMap | null {
  const e = normEmail(email);
  return permsCache && permsCache.email === e ? permsCache.perms : null;
}

/** Fetch (and cache) the staff-row overrides for the given email. */
export async function hydrateMyPermissions(email?: string | null): Promise<PermissionMap> {
  const e = normEmail(email);
  if (!e) return {};
  if (permsCache && permsCache.email === e) return permsCache.perms;
  let perms: PermissionMap = {};
  try {
    if (!supabase) {
      perms = loadLocal().find((m) => normEmail(m.email) === e)?.permissions ?? {};
    } else {
      const { data } = await supabase.from("staff").select("permissions").ilike("email", e).limit(1).maybeSingle();
      const p = (data as { permissions?: PermissionMap } | null)?.permissions;
      perms = (p && typeof p === "object") ? p : {};
    }
  } catch { perms = {}; }
  permsCache = { email: e, perms };
  return perms;
}
