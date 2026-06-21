// Staff management + Role-Based Access Control (RBAC). A clinic's team is a mini-HR
// record (a "CV" per member) persisted per-clinic in localStorage — the same pattern
// as services/breeds/promotions. The permission matrix below is the single source of
// truth for what each role may do; the usePermissions hook reads it for the live user.
import { getActiveClinicId } from "./clinics";
import { uid } from "./utils";
import { DOCTORS } from "./clinic";
import type { Role } from "@/types";

export type StaffRole = "manager" | "veterinarian" | "receptionist" | "groomer";
export type StaffStatus = "active" | "suspended";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  /** Degree / specialty, e.g. "جراحة عامة". */
  specialty: string;
  joinDate: string; // ISO date (YYYY-MM-DD)
  status: StaffStatus;
  /** Short free-text bio shown on the profile. */
  bio: string;
  /** Optional avatar data URL. */
  avatar?: string | null;
}

export const STAFF_ROLES: StaffRole[] = ["manager", "veterinarian", "receptionist", "groomer"];

/* ----------------------------- Permissions ----------------------------- */

export type Capability =
  | "manageStaff"
  | "manageSettings"
  | "viewReports"
  | "viewProfits"
  | "deleteInvoices"
  | "processSales"
  | "manageInventory"
  | "editMedical"
  | "addPets"
  | "viewCalendar";

/** Ordered capability catalogue with Arabic labels — drives the read-only checklist. */
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

/** What each role may do. The manager holds every capability. */
export const PERMISSIONS: Record<StaffRole, Capability[]> = {
  manager: CAPABILITIES.map((c) => c.id), // full access
  veterinarian: ["viewCalendar", "addPets", "editMedical", "processSales", "manageInventory"],
  receptionist: ["viewCalendar", "addPets", "processSales"],
  groomer: ["viewCalendar", "addPets"],
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "مدير العيادة",
  veterinarian: "طبيب بيطري",
  receptionist: "موظف استقبال",
  groomer: "أخصائي عناية",
};

export function roleCan(role: StaffRole, cap: Capability): boolean {
  return PERMISSIONS[role]?.includes(cap) ?? false;
}

/** Map the app's auth Role to a staff role for permission checks. Defaults to the
 *  fully-privileged manager so a clinic owner is never locked out of their own app. */
export function appRoleToStaffRole(role?: Role | null): StaffRole {
  switch (role) {
    case "doctor": return "veterinarian";
    case "reception": return "receptionist";
    case "admin": return "manager";
    default: return "manager";
  }
}

/* ----------------------------- Persistence ----------------------------- */

const keyName = () => `vp_staff_${getActiveClinicId()}`;

function seed(): StaffMember[] {
  const roles: StaffRole[] = ["manager", "veterinarian", "veterinarian"];
  const specialties = ["جراحة عامة", "الطب الباطني", "التطعيم والوقاية"];
  const base = DOCTORS.map((d, i) => ({
    id: d.id,
    name: d.name,
    email: `${d.id}@happypaws.vet`,
    phone: `+964 770 000 100${i}`,
    role: roles[i] ?? "veterinarian",
    specialty: specialties[i] ?? "طب بيطري عام",
    joinDate: ["2021-03-01", "2022-07-15", "2023-01-10"][i] ?? "2023-01-01",
    status: "active" as StaffStatus,
    bio: "عضو في فريق عيادة doctorVet.",
    avatar: null,
  }));
  base.push(
    { id: uid("staff"), name: "نور قاسم", email: "noor@happypaws.vet", phone: "+964 771 222 3344", role: "receptionist", specialty: "إدارة مكتب الاستقبال", joinDate: "2023-09-05", status: "active", bio: "مسؤولة استقبال العملاء وجدولة المواعيد.", avatar: null },
    { id: uid("staff"), name: "حسن علي", email: "hasan@happypaws.vet", phone: "+964 772 555 6677", role: "groomer", specialty: "العناية والتجميل", joinDate: "2024-02-20", status: "active", bio: "أخصائي حلاقة وعناية بالحيوانات.", avatar: null },
  );
  return base;
}

export function getStaff(): StaffMember[] {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) {
      const parsed = JSON.parse(raw) as StaffMember[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(list: StaffMember[]) {
  try { localStorage.setItem(keyName(), JSON.stringify(list)); } catch { /* ignore */ }
}

export function upsertStaff(member: StaffMember): StaffMember[] {
  const list = getStaff();
  const idx = list.findIndex((m) => m.id === member.id);
  if (idx >= 0) list[idx] = member; else list.push(member);
  save(list);
  return list;
}

export function removeStaff(id: string): StaffMember[] {
  const list = getStaff().filter((m) => m.id !== id);
  save(list);
  return list;
}

export function toggleStaffStatus(id: string): StaffMember[] {
  const list = getStaff();
  const m = list.find((x) => x.id === id);
  if (m) m.status = m.status === "active" ? "suspended" : "active";
  save(list);
  return list;
}

export function blankStaff(): StaffMember {
  return { id: uid("staff"), name: "", email: "", phone: "", role: "receptionist", specialty: "", joinDate: new Date().toISOString().slice(0, 10), status: "active", bio: "", avatar: null };
}
