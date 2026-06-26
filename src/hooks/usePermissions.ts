import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  appRoleToStaffRole, effectiveCan, hydrateMyPermissions, peekMyPermissions,
  type Capability, type PermissionMap, type StaffRole,
} from "@/lib/staff";

/**
 * RBAC hook — derives the live user's capabilities from their base role PLUS any
 * granular per-staff overrides (stored as the staff row's `permissions` JSONB and
 * matched to the user by email). Managers always have everything.
 *
 * Usage (template):
 *   const { can } = usePermissions();
 *   {can("manageSettings") && <SettingsTab />}
 *   {can("viewReports")    && <ReportsTab />}
 *   <Button disabled={!can("deleteInvoices")}>حذف</Button>
 *
 * Reads overrides via the dual-adapter cache (one fetch per email, then cached) —
 * no external query library; just synchronous state + the existing data layer.
 */
export function usePermissions(): { role: StaffRole; can: (cap: Capability) => boolean } {
  const { user } = useAuth();
  const role = appRoleToStaffRole(user?.role);
  const [overrides, setOverrides] = useState<PermissionMap | null>(() => peekMyPermissions(user?.email));

  useEffect(() => {
    // Managers have everything; no per-user lookup needed.
    if (role === "manager" || !user?.email) { setOverrides(null); return; }
    let alive = true;
    void hydrateMyPermissions(user.email).then((o) => { if (alive) setOverrides(o); });
    return () => { alive = false; };
  }, [user?.email, role]);

  return { role, can: (cap: Capability) => effectiveCan(role, cap, role === "manager" ? null : overrides) };
}
