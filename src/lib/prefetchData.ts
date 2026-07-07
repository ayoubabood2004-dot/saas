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
import type {
  Pet, Admission, TreatmentEntry, MedicalVisit, Product, Invoice, InvoiceItem, MediaItem, AuditEntry, LoginEvent, Expense,
} from "@/types";

const cid = (clinicId?: string | null) => clinicId ?? "anon";

// ---- Records (السجلات) ----
export type RecordsSnap = { pets: Pet[]; admissions: Admission[]; treatments: TreatmentEntry[]; visits: MedicalVisit[] };
export const recordsKey = (clinicId?: string | null) => `records:${cid(clinicId)}`;
export async function loadRecordsSnap(clinicId?: string | null): Promise<RecordsSnap> {
  const id = clinicId ?? undefined;
  const [allPets, admissions] = await Promise.all([repo.listAllPets(id), repo.listAdmissions(id)]);
  const pets = allPets.filter((p) => p.shared_with_clinic !== false);
  const ids = pets.map((p) => p.id);
  const [treatments, visits] = await Promise.all([
    Promise.all(pets.map((p) => repo.listTreatments(p.id))).then((r) => r.flat()),
    repo.listAllVisits(ids),
  ]);
  return { pets, admissions, treatments, visits };
}

// ---- Retail & Sales (المبيعات) ----
export type RetailSnap = { products: Product[]; invoices: Invoice[] };
export const retailKey = (clinicId?: string | null) => `retail:${cid(clinicId)}`;
export async function loadRetailSnap(clinicId?: string | null): Promise<RetailSnap> {
  const id = clinicId ?? undefined;
  const [products, invoices] = await Promise.all([repo.listProducts(id), repo.listInvoices(id)]);
  return { products, invoices };
}

// ---- Reports (التقارير) ----
export type AnalyticsSnap = {
  pets: Pet[]; invoices: Invoice[]; items: InvoiceItem[]; products: Product[]; visits: MedicalVisit[];
  staff: StaffMember[]; media: MediaItem[]; treatments: TreatmentEntry[]; audit: AuditEntry[]; logins: LoginEvent[];
  expenses: Expense[];
};
export const analyticsKey = (clinicId?: string | null) => `analytics:${cid(clinicId)}`;
export async function loadAnalyticsSnap(clinicId?: string | null): Promise<AnalyticsSnap> {
  const id = clinicId ?? undefined;
  const [pets, invoices, items, products] = await Promise.all([
    repo.listAllPets(id), repo.listInvoices(id), repo.listAllInvoiceItems(id), repo.listProducts(id),
  ]);
  const petIds = pets.map((p) => p.id);
  const [visits, media, treatments, staff, audit, logins, expenses] = await Promise.all([
    repo.listAllVisits(petIds),
    repo.listAllMedia(petIds).catch(() => [] as MediaItem[]),
    repo.listAllTreatments(petIds).catch(() => [] as TreatmentEntry[]),
    listStaff().catch(() => [] as StaffMember[]),
    repo.listAuditLog(id).catch(() => [] as AuditEntry[]),
    repo.listLoginEvents(id).catch(() => [] as LoginEvent[]),
    // Back-compat guard: the expenses table (migration 0052) may not exist yet.
    repo.listExpenses(id).catch(() => [] as Expense[]),
  ]);
  return { pets, invoices, items, products, visits, media, treatments, staff, audit, logins, expenses };
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
