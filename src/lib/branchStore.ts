import { useEffect, useState } from "react";
import type { Branch } from "@/types";
import { repo } from "./repo";

/* ============================================================================
 * branchStore — the synchronous source-of-truth for the clinic's branches and
 * the device's ACTIVE branch. Same framework-light pub/sub pattern as opsStore.
 *
 * Semantics (chosen for zero-risk to existing data):
 *   • A clinic with fewer than 2 branch rows is a single-branch clinic: the
 *     switcher never renders and nothing anywhere is filtered — identical to
 *     the app before branches existed.
 *   • active = "all"  → no filtering (the manager's overview; also the default).
 *   • active = <id>   → that branch only. The MAIN branch additionally owns
 *     every row whose branch_id is NULL (all pre-branches data), so history is
 *     never orphaned and no backfill is ever needed.
 *   • The choice persists per clinic per device (localStorage) — a reception
 *     PC stays pinned to its branch across reloads.
 * ==========================================================================*/

export type ActiveBranch = "all" | string;

export interface BranchState {
  branches: Branch[];
  active: ActiveBranch;
  hydrated: boolean;
}

let state: BranchState = { branches: [], active: "all", hydrated: false };
let clinicKey = ""; // which clinic the store is hydrated for
let inflight: Promise<void> | null = null; // dedupes concurrent hydrates
const listeners = new Set<() => void>();

function set(next: Partial<BranchState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

const storageKey = () => `vp_active_branch:${clinicKey || "default"}`;

function readSaved(): ActiveBranch {
  try { return (localStorage.getItem(storageKey()) as ActiveBranch) || "all"; } catch { return "all"; }
}

export const branchStore = {
  get(): BranchState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Hydrate for a clinic (no-op if already hydrated for it). Restores the saved
   *  active branch, dropping it back to "all" if that branch no longer exists. */
  async ensure(clinicId?: string): Promise<void> {
    const key = clinicId ?? "";
    if (key === clinicKey && (state.hydrated || inflight)) return inflight ?? undefined;
    clinicKey = key;
    // Re-read this clinic's saved selection (also covers switching clinics).
    set({ active: readSaved(), hydrated: false });
    await branchStore.refresh();
  },

  /** Re-pull the branch list (after create/rename) and re-validate the selection. */
  async refresh(): Promise<void> {
    const run = (async () => {
      let branches: Branch[] = [];
      try { branches = await repo.listBranches(clinicKey || undefined); } catch { branches = []; }
      let active = state.active;
      if (active !== "all" && !branches.some((b) => b.id === active)) active = "all";
      set({ branches, active, hydrated: true });
    })();
    inflight = run.finally(() => { inflight = null; });
    return inflight;
  },

  setActive(id: ActiveBranch) {
    try { localStorage.setItem(storageKey(), id); } catch { /* private mode */ }
    set({ active: id });
  },

  /** The branch to stamp on NEW rows. NULL when on "all" or the main branch —
   *  NULL always means main, so single-branch clinics keep writing NULL forever. */
  branchForWrite(): string | null {
    const { branches, active } = state;
    if (active === "all") return null;
    const main = branches.find((b) => b.is_main);
    return active === main?.id ? null : active;
  },
};

/** Does a row (by its branch_id) belong to the active selection?
 *  NULL rows belong to the MAIN branch. "all" matches everything. */
export function matchesBranch(rowBranchId: string | null | undefined, active: ActiveBranch, branches: Branch[]): boolean {
  if (active === "all") return true;
  const main = branches.find((b) => b.is_main);
  if (active === main?.id) return rowBranchId == null || rowBranchId === active;
  return rowBranchId === active;
}

/** React hook — subscribe to the branch state and hydrate it for the clinic. */
export function useBranchState(clinicId?: string): BranchState {
  const [snap, setSnap] = useState(branchStore.get());
  useEffect(() => {
    const unsub = branchStore.subscribe(() => setSnap(branchStore.get()));
    void branchStore.ensure(clinicId).catch(() => {});
    return unsub;
  }, [clinicId]);
  return snap;
}
