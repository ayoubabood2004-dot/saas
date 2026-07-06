import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  appRoleToStaffRole, effectiveCan, hydrateMyPermissions, peekMyPermissions,
  type Capability, type PermissionMap, type StaffRole,
} from "@/lib/staff";
import { useOverride } from "@/lib/managerOverride";

/**
 * RBAC hook — derives the live user's capabilities from their base role PLUS any
 * granular per-staff overrides (stored as the staff row's `permissions` JSONB and
 * matched to the user by email). Managers always have everything.
 *
 * Manager Override (وضع المدير) folds in transparently:
 *  · an active PIN unlock ⇒ the effective role is "manager" (full view);
 *  · a device pinned to reception mode ⇒ everything is capped at the
 *    receptionist preset — even for a signed-in manager account.
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
export function usePermissions(): { role: StaffRole; baseRole: StaffRole; can: (cap: Capability) => boolean } {
  const { user } = useAuth();
  const baseRole = appRoleToStaffRole(user?.role);
  const ov = useOverride();
  const role: StaffRole = ov.active ? "manager" : ov.deviceLocked ? "receptionist" : baseRole;
  const [overrides, setOverrides] = useState<PermissionMap | null>(() => peekMyPermissions(user?.email));

  useEffect(() => {
    // Managers have everything; no per-user lookup needed.
    if (role === "manager" || !user?.email) { setOverrides(null); return; }
    let alive = true;
    void hydrateMyPermissions(user.email).then((o) => { if (alive) setOverrides(o); });
    return () => { alive = false; };
  }, [user?.email, role]);

  // A locked device ignores per-staff extras too — the cap must be exactly the
  // receptionist preset, or a manager's own staff-row grants would leak through.
  const ignoreOverrides = role === "manager" || (ov.deviceLocked && !ov.active);
  return { role, baseRole, can: (cap: Capability) => effectiveCan(role, cap, ignoreOverrides ? null : overrides) };
}
