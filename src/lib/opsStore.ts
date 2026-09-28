import type { Admission, Pet } from "@/types";
import { repo } from "./repo";
import { registerReset } from "./clinicSync";

/* ============================================================================
 * opsStore — the single, synchronous source-of-truth for the clinic's live
 * operations (admissions = medical cases + boarding, plus the pets they belong
 * to). A tiny module-level pub/sub cache layered over the dual-adapter `repo`:
 *
 *   • Registration (New Case) writes through `addCase` → the pet's card is
 *     injected into the cache the instant it's persisted, so the التقويم الرئيسي
 *     shows it with ZERO fetch/flicker and no page reload.
 *   • The calendar's drag-and-drop writes through `patch` → optimistic update
 *     now, Supabase UPDATE in the background, revert on failure.
 *   • Any consumer (the calendar) subscribes and re-renders on every change.
 *
 * The cache survives route changes (module singleton), so a case registered on
 * /new-case is already present when /reception mounts. `hydrate` re-pulls from
 * the repo on mount, so writes made elsewhere (e.g. the patient profile) are
 * reconciled — one unified model, no disconnect. Deliberately framework-light:
 * plain state + a Set of listeners, NOT TanStack Query.
 * ==========================================================================*/

export interface OpsState {
  admissions: Admission[];
  pets: Record<string, Pet>;
  /** True once the first hydrate from the repo has resolved. */
  hydrated: boolean;
}

let state: OpsState = { admissions: [], pets: {}, hydrated: false };
const listeners = new Set<() => void>();

/** Replace state (new object ref so React bails out only when nothing changed) + notify. */
function set(next: Partial<OpsState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

export const opsStore = {
  /** Current snapshot — stable reference between mutations (safe for React state). */
  get(): OpsState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Pull the live truth from the repo and replace the cache. Reconciles any
   *  admission created/updated outside this store (e.g. from the patient profile). */
  async hydrate(clinicId?: string): Promise<OpsState> {
    const [admissions, petList] = await Promise.all([repo.listAdmissions(clinicId), repo.listAllPets(clinicId)]);
    const pets: Record<string, Pet> = {};
    for (const p of petList) pets[p.id] = p;
    set({ admissions, pets, hydrated: true });
    return state;
  },

  /** Register a new case: persist it, then inject the row (and its pet) into the
   *  cache so subscribers render it immediately. Returns the created admission. */
  async addCase(input: Omit<Admission, "id">, pet?: Pet): Promise<Admission> {
    const created = await repo.addAdmission(input);
    set({
      admissions: [created, ...state.admissions.filter((a) => a.id !== created.id)],
      pets: pet ? { ...state.pets, [pet.id]: pet } : state.pets,
    });
    return created;
  },

  /** Optimistically patch an admission (status / date / cage …): update the cache
   *  now, persist in the background, and revert the single row on failure. */
  async patch(id: string, patch: Partial<Admission>): Promise<void> {
    const before = state.admissions.find((a) => a.id === id);
    if (!before) return;
    set({ admissions: state.admissions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    try {
      await repo.updateAdmission(id, patch);
    } catch (e) {
      set({ admissions: state.admissions.map((a) => (a.id === id ? before : a)) });
      throw e;
    }
  },

  /** Ensure a pet is in the cache (used when a card needs its pet before hydrate). */
  upsertPet(pet: Pet) {
    if (state.pets[pet.id] === pet) return;
    set({ pets: { ...state.pets, [pet.id]: pet } });
  },

  /** مرآةٌ محلّية لما فعله الخادمُ بنفس معاملة إعادة الترقيم (0219): نصُّ كلّ ساكنٍ
   *  يتبع رقمَ قفصه. **لا كتابة** — الخادمُ كتب. والساكنون يُحسمون قبل أيّ تبديل،
   *  وإلا حرّك تبادلُ ١٠١↔١٠٢ الأوّلَ مرّتين. */
  mirrorCageRenames(pairs: Array<{ from: string; to: string }>) {
    if (!pairs.length) return;
    const norm = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();
    const to = new Map<string, string>();
    for (const p of pairs) {
      const occ = state.admissions.find((a) => a.status !== "discharged" && norm(a.cage) === norm(p.from));
      if (occ) to.set(occ.id, p.to);
    }
    if (!to.size) return;
    set({ admissions: state.admissions.map((a) => (to.has(a.id) ? { ...a, cage: to.get(a.id) as string } : a)) });
  },
};

/* تبديلُ العيادة يُفرغ النزلاء فوراً: عرضُ حيواناتِ عيادةٍ بأقفاص أخرى تسريبٌ يبدأ
   عرضاً قبل أن يصير كتابة (درس 0153، وبند ب٥ بـ`docs/cages-plan.md`). */
registerReset(() => { set({ admissions: [], pets: {}, hydrated: false }); });
