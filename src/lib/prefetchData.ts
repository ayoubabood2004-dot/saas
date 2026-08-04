// Single source of truth for the data snapshots behind the heavy screens, so the
// page's own load() and the idle background-warmer fetch IDENTICALLY (same query
// composition, same cache key, same snapshot shape — no drift). The warmer runs
// after login while the browser is idle, so the FIRST visit to Records / Sales /
// Reports is already instant instead of paying a multi-second fetch.
//
// Same synchronous cache as opsStore/swrCache — no TanStack Query.

import { repo } from "@/lib/repo";
import { listStaff, type StaffMember } from "@/lib/staff";
import { getCached, setCached } from "@/lib/swrCache";
import { localISO } from "@/lib/utils";
import type { LabResult,
  Pet, Admission, TreatmentEntry, MedicalVisit, Product, Invoice, InvoiceItem, MediaItem, AuditEntry, LoginEvent, Expense,
} from "@/types";

const cid = (clinicId?: string | null) => clinicId ?? "anon";

// ---- Records (السجلات) ----
/** NOTE: `treatments` is TODAY's doses only — that is all this screen counts.
 *  Anything needing dose history must fetch it itself, not read it from here. */
export type RecordsSnap = { pets: Pet[]; admissions: Admission[]; treatments: TreatmentEntry[]; visits: MedicalVisit[] };
export const recordsKey = (clinicId?: string | null) => `records:${cid(clinicId)}`;
export async function loadRecordsSnap(clinicId?: string | null): Promise<RecordsSnap> {
  const id = clinicId ?? undefined;
  // This used to be a request PER PET (`pets.map(p => listTreatments(p.id))`), so a
  // clinic with 400 patients fired 400 queries — six at a time through the browser's
  // connection limit — and the page timed out to a blank screen before they landed.
  //
  // Two corrections: fetch clinic-wide in ONE query instead of one per pet, and pull
  // only TODAY's doses, because the only thing this screen does with treatments is
  // count today's per patient (see `medsToday` in ClinicRecords). Nothing waits on
  // the pet list any more either, so all four run in parallel instead of in a waterfall.
  const [allPets, admissions, treatments, visits] = await Promise.all([
    repo.listAllPets(id),
    repo.listAdmissions(id),
    repo.listClinicTreatments(id, localISO()),
    repo.listClinicVisits(id),
  ]);
  const pets = allPets.filter((p) => p.shared_with_clinic !== false);
  return { pets, admissions, treatments, visits };
}

// ---- Retail & Sales (المبيعات) ----
export type RetailSnap = { products: Product[]; invoices: Invoice[] };
export const retailKey = (clinicId?: string | null) => `retail:${cid(clinicId)}`;
export async function loadRetailSnap(clinicId?: string | null): Promise<RetailSnap> {
  const id = clinicId ?? undefined;
  const [products, invoices, sections] = await Promise.all([
    repo.listProducts(id),
    repo.listInvoices(id),
    repo.listCompanySections(undefined, id).catch(() => []),
  ]);
  // For the TILL only, a product's sellable count = its own tracked stock PLUS its
  // section's pooled (legacy) reserve — so pooled barcodes (stock 0) are sellable
  // and the cart naturally stops at zero. The real per-layer deduction (tracked
  // first, then pool) happens server-side at checkout; this just sets the cap.
  const pool = new Map(sections.map((s) => [s.id, s.pooled_stock ?? 0]));
  const effective = products.map((p) => {
    const extra = p.section_id ? (pool.get(p.section_id) ?? 0) : 0;
    return extra > 0 ? { ...p, stock: (p.stock || 0) + extra } : p;
  });
  return { products: effective, invoices };
}

// ---- Reports (التقارير) ----
export type AnalyticsSnap = {
  pets: Pet[]; invoices: Invoice[]; items: InvoiceItem[]; products: Product[]; visits: MedicalVisit[];
  staff: StaffMember[]; media: MediaItem[]; treatments: TreatmentEntry[]; audit: AuditEntry[]; logins: LoginEvent[];
  expenses: Expense[]; labs: LabResult[];
};
export const analyticsKey = (clinicId?: string | null) => `analytics:${cid(clinicId)}`;
export async function loadAnalyticsSnap(clinicId?: string | null): Promise<AnalyticsSnap> {
  const id = clinicId ?? undefined;
  const [pets, invoices, items, products] = await Promise.all([
    repo.listAllPets(id), repo.listInvoices(id), repo.listAllInvoiceItems(id), repo.listProducts(id),
  ]);
  const petIds = pets.map((p) => p.id);
  const [visits, media, treatments, staff, audit, logins, expenses, labs] = await Promise.all([
    // Clinic-scoped, not pet-id-scoped: the `in(petIds)` form puts every patient id
    // into the query URL, which eventually exceeds what the server will accept.
    repo.listClinicVisits(id),
    repo.listAllMedia(petIds).catch(() => [] as MediaItem[]),
    repo.listClinicTreatments(id).catch(() => [] as TreatmentEntry[]),
    listStaff().catch(() => [] as StaffMember[]),
    repo.listAuditLog(id).catch(() => [] as AuditEntry[]),
    repo.listLoginEvents(id).catch(() => [] as LoginEvent[]),
    // Back-compat guard: the expenses table (migration 0052) may not exist yet.
    repo.listExpenses(id).catch(() => [] as Expense[]),
    // Back-compat guard: lab_results (migration 0086) may not exist yet.
    repo.listClinicLabResults(id).catch(() => [] as LabResult[]),
  ]);
  return { pets, invoices, items, products, visits, media, treatments, staff, audit, logins, expenses, labs };
}

/** Warm a data snapshot into the cache once, but only if a page visit hasn't
 *  already populated it. Failures are swallowed — this is best-effort speed. */
function warmOnce<T>(key: string, loader: () => Promise<T>): void {
  if (getCached<T>(key) !== undefined) return;
  loader().then((snap) => setCached<T>(key, snap)).catch(() => {});
}

type WarmWhat = { records?: boolean; retail?: boolean; analytics?: boolean };
let started = false;

/**
 * Background-prefetch the data for the screens the signed-in user can reach,
 * during browser idle time after first paint. Gated by capability so we don't
 * fire queries a user has no access to. Runs at most once per session.
 */
export function warmDataIdle(clinicId: string | null | undefined, what: WarmWhat): void {
  if (started) return;
  started = true;
  const run = () => {
    if (what.records) warmOnce(recordsKey(clinicId), () => loadRecordsSnap(clinicId));
    if (what.retail) warmOnce(retailKey(clinicId), () => loadRetailSnap(clinicId));
    if (what.analytics) warmOnce(analyticsKey(clinicId), () => loadAnalyticsSnap(clinicId));
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
