import { useAuth } from "@/contexts/AuthContext";
import { appRoleToStaffRole, roleCan, type Capability, type StaffRole } from "@/lib/staff";

/**
 * RBAC hook — derives the live user's capabilities from their auth role.
 *
 * Usage (template):
 *   const { can } = usePermissions();
 *   {can("manageSettings") && <SettingsTab />}      // hidden for receptionists
 *   {can("viewReports")    && <ReportsTab />}        // hidden for receptionists
 *   <Button disabled={!can("deleteInvoices")}>حذف</Button>
 *
 * Roles map: admin → manager, doctor → veterinarian, reception → receptionist.
 */
export function usePermissions(): { role: StaffRole; can: (cap: Capability) => boolean } {
  const { user } = useAuth();
  const role = appRoleToStaffRole(user?.role);
  return { role, can: (cap: Capability) => roleCan(role, cap) };
}
