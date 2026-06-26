// Staff invites — a manager invites teammates by email or by a short code; the
// invitee redeems it via the accept_invite() RPC (see migration 0017), which
// creates their clinic membership. Supabase-first with a localStorage fallback
// for demo/offline so the UI never breaks.
import { supabase } from "./supabase";
import { getActiveClinicId } from "./clinics";
import { uuid } from "./utils";
import type { StaffRole } from "./staff";

export interface Invite {
  id: string;
  email: string | null;
  role: StaffRole;
  code: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

const genCode = () => `VET-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const demoKey = () => `vp_invites_${getActiveClinicId()}`;

function demoLoad(): Invite[] {
  try { const r = localStorage.getItem(demoKey()); if (r) return JSON.parse(r) as Invite[]; } catch { /* ignore */ }
  return [];
}
function demoSave(list: Invite[]) { try { localStorage.setItem(demoKey(), JSON.stringify(list)); } catch { /* ignore */ } }

/** The shareable join link for an invite code. */
export const joinLink = (code: string) => `${window.location.origin}/join?code=${encodeURIComponent(code)}`;

/** Create a pending invite. Email is optional (code invites). Returns the new invite. */
export async function createInvite(role: StaffRole, email?: string): Promise<Invite> {
  if (!supabase) {
    const inv: Invite = { id: uuid(), email: email?.trim() || null, role, code: genCode(), status: "pending", created_at: new Date().toISOString() };
    demoSave([inv, ...demoLoad()]);
    return inv;
  }
  const { data, error } = await supabase
    .from("invites")
    .insert({ role, email: email?.trim() || null })
    .select("id,email,role,code,status,created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Invite;
}

/** Pending invites for the active clinic. */
export async function listInvites(): Promise<Invite[]> {
  if (!supabase) return demoLoad().filter((i) => i.status === "pending");
  const { data, error } = await supabase
    .from("invites")
    .select("id,email,role,code,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invite[];
}

/** Revoke (cancel) a pending invite. */
export async function revokeInvite(id: string): Promise<void> {
  if (!supabase) { demoSave(demoLoad().filter((i) => i.id !== id)); return; }
  const { error } = await supabase.from("invites").update({ status: "revoked" }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Redeem an invite for the signed-in user (creates their membership). Pass
 *  confirm=true to proceed past the owner workspace-switch warning. */
export async function acceptInvite(code: string, confirm = false): Promise<{ ok: boolean; error?: string; clinicName?: string; role?: StaffRole }> {
  if (!supabase) return { ok: true, clinicName: "عيادة تجريبية", role: "receptionist" };
  const { data, error } = await supabase.rpc("accept_invite", { p_code: code, p_confirm: confirm });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok: boolean; error?: string; clinic_name?: string; role?: StaffRole };
  return { ok: r.ok, error: r.error, clinicName: r.clinic_name, role: r.role };
}

/** Leave a clinic you joined as staff — restores your own clinic as the active
 *  workspace (your data was only hidden, never deleted). No-op in demo mode. */
export async function leaveClinic(clinicId?: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: true };
  const { data, error } = await supabase.rpc("leave_clinic", { p_clinic: clinicId ?? null });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok: boolean; error?: string };
  return { ok: r.ok, error: r.error };
}
