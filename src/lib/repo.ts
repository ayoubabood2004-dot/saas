// Data-access layer. Currently backed by the local demo store so the app is fully
// usable before a backend exists. Each method is async and isolated so a Supabase
// implementation can be dropped in here without touching the UI.
import { loadDB, saveDB } from "./demoStore";

/* موحِّدا مطابقة المخزون — مرآةُ inv_norm_code/inv_norm_name على الخادم:
 * قاعدتان تنحرفان تعني قطعةً تُطابَق محلياً وتتوأم سحابياً. */
const invNormCode = (v: string | null | undefined): string =>
  (v ?? "").replace(/\s+/g, "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const invNormName = (v: string | null | undefined): string =>
  (v ?? "")
    // أ/إ/آ→ا · ة→ه · ى→ي — بمهارب يونيكود: بنيةُ مطابقةٍ لا نصٌّ معروض.
    .replace(/[\u0623\u0625\u0622]/g, "\u0627").replace(/\u0629/g, "\u0647").replace(/\u0649/g, "\u064A")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ").trim().toLowerCase();
import { supabase } from "./supabase";
import { outboxEnqueue, outboxEnqueueRpc, isNetworkError } from "./outbox";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, AppointmentStatus, ClinicInfo, PublicStaff, DailyNote, TreatmentEntry, Admission, Branch, Reminder, Product, Company, CompanySection, Purchase, PurchaseItem, PurchasePayment, PurchaseDraftLine, PurchaseMeta, Courier, DeliveryOrder, PetMovement, DemoDB, Invoice, InvoiceItem, CheckoutItem, SaleMeta, Customer, DiscountType, PaymentMethod, PaymentSplit, WhatsAppMessage, AuditEntry, LoginEvent, PetNote, Expense, ExpenseMethod, ReturnMeta, RetailReturnResult, HealthMetric, ClinicVisit , Surgery, LabResult, LabDeviceLink, LabDeviceInbox, LabStatusValue, PetProblem, CareEntry, FeatureRequest, GeneratedBarcode, StoreProfile, StoreOrder, StoreOrderItem, StoreFrontInfo, StoreCatalogItem, Journey, JourneyEvent, JourneyKind, JourneyStage, JourneyPublicView, EditLine } from "@/types";
import type { PayrollPolicyDTO, StaffComp, StaffRecurring, PayrollAdjustment, PayrollRun, Payslip, PayslipLine, StaffLoan, StaffLoanEvent, PayslipDraft, PayMethod } from "@/types";
import * as PD from "./payrollDemo";
import { paidOf, round2 } from "./debt";
import { isValidSlug, normalizeSlug, demoOrderNo } from "./storeLib";
import { journeyToken, OWNER_REACTIONS } from "./journey";
import { getClinicName, getClinicLogo, getClinicSocials } from "./settings";
import { uid, uuid, ageMonths, localISO, normalizeCode } from "./utils";
import { phoneKey } from "./phone";
import { loadOwners } from "./owners";
import { loadClinics, getActiveClinicId } from "./clinics";
import { listStaff } from "./staff";

/** Sort key for a case/admission — newest first. Prefers the precise `created_at`
 *  timestamp (so same-day cases keep their true insertion order) and falls back to
 *  the day-granularity `admitted_on` for any legacy row that predates the column. */
function admOrderKey(a: Admission): string {
  return a.created_at ?? a.admitted_on;
}

/** Resolve a discount input (percent 0–100 or a fixed amount) to an amount, clamped to [0, subtotal]. */
export function resolveDiscount(subtotal: number, type: DiscountType | null | undefined, value: number): number {
  if (!type || !value || value <= 0) return 0;
  if (type === "percent") return Math.round(subtotal * Math.min(value, 100)) / 100;
  return Math.min(value, subtotal);
}

/** Demo-store sale core: create the invoice + its items and decrement stock. Shared by
 *  the quick POS checkout and the retail checkout (which adds customer/discount/payment). */
/** Append one movement event (demo mirror of the 0070 server trigger). Caller saves. */
function pushMovementLocal(db: DemoDB, m: Omit<PetMovement, "id" | "at" | "created_at">): void {
  if (!db.petMovements) db.petMovements = [];
  const now = new Date().toISOString();
  db.petMovements.push({ ...m, id: uid("mov"), at: now, created_at: now });
}

function createInvoiceLocal(items: CheckoutItem[], meta?: SaleMeta): Invoice {
  const db = loadDB();
  if (!db.products) db.products = [];
  if (!db.invoices) db.invoices = [];
  if (!db.invoiceItems) db.invoiceItems = [];
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const cost = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const dtype = meta?.discount_type ?? null;
  // A cashier-set final price wins outright — it may be a markup ABOVE the subtotal or a
  // discount below it. Otherwise fall back to the percent/fixed discount computation.
  let total: number; let discount: number;
  if (meta?.final_total != null) {
    total = Math.max(0, Math.round(meta.final_total));
    discount = Math.max(0, subtotal - total);
  } else {
    discount = resolveDiscount(subtotal, dtype, meta?.discount_value ?? 0);
    total = Math.max(0, subtotal - discount);
  }
  // Amount received today. Absent → paid in full; otherwise clamp into [0, total] (a
  // shortfall becomes a credit/debt sale; any overpayment is change and never exceeds the total).
  const amountPaid = meta?.amount_paid != null ? Math.max(0, Math.min(total, Math.round(meta.amount_paid * 100) / 100)) : total;
  const invoice: Invoice = {
    id: uid("inv"),
    customer_name: meta?.customer_name?.trim() || null,
    customer_phone: meta?.customer_phone?.trim() || null,
    pet_name: meta?.pet_name?.trim() || null,
    subtotal, discount, discount_type: discount > 0 ? (dtype ?? "fixed") : null,
    payment_method: meta?.payment_method ?? null,
    payment_details: meta?.payment_details && meta.payment_details.length ? meta.payment_details : null,
    total, amount_paid: amountPaid, cost_total: cost, profit: total - cost, item_count: count,
    print_count: 0, status: "paid", refunded_at: null,
    staff_id: meta?.staff_id?.trim() || null,
    notes: meta?.notes?.trim() || null,
    created_at: new Date().toISOString(),
  };
  db.invoices.push(invoice);
  const r3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
  for (const i of items) {
    // Box-equivalent removed from stock: the fraction for sub-unit sales, else the qty.
    const stockQty = i.stock_qty != null ? i.stock_qty : i.qty;
    let fromPool = 0;
    if (i.product_id) {
      const p = db.products.find((x) => x.id === i.product_id);
      // سطر راجع (كمية سالبة، 0122): القطعة ترجع لرصيد المنتج المعروف —
      // نفس مسار دالّة السيرفر حرفياً فلا يختلف حسابان للمخزون.
      if (p && stockQty < 0) {
        p.stock = Math.round((p.stock + -stockQty) * 1000) / 1000;
      } else if (p) {
        // Known-first: sell the product's own tracked stock, then fall back to
        // its section pool (the unknown legacy reserve). Round to 3 dp to avoid drift.
        let rem = stockQty;
        const fromStock = Math.min(rem, Math.max(0, p.stock || 0));
        if (fromStock > 0) { p.stock = r3(p.stock - fromStock); rem -= fromStock; }
        if (rem > 0 && p.section_id) {
          const sec = (db.companySections ?? []).find((x) => x.id === p.section_id);
          const pool = sec?.pooled_stock ?? 0;
          if (sec && pool > 0) {
            fromPool = Math.min(rem, pool);
            sec.pooled_stock = r3(pool - fromPool);
            rem -= fromPool;
          }
        }
      }
    }
    db.invoiceItems.push({ id: uid("ii"), invoice_id: invoice.id, product_id: i.product_id ?? null, name: i.name, barcode: i.barcode ?? null, qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost, line_total: i.qty * i.unit_price, stock_qty: stockQty, pooled_qty: fromPool, unit_label: i.unit_label ?? null });
  }
  saveDB(db);
  return invoice;
}
/** Credit a refunded/voided line back to inventory, reversing the pool-first
 *  split: the part that came from the section pool returns to the pool, the rest
 *  to the product's tracked stock. Legacy rows (pooled_qty absent) → all to stock. */
function restockLocal(db: ReturnType<typeof loadDB>, it: InvoiceItem) {
  if (!it.product_id) return;
  const p = (db.products ?? []).find((x) => x.id === it.product_id);
  if (!p) return;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const sq = it.stock_qty != null ? it.stock_qty : it.qty;
  const pq = it.pooled_qty ?? 0;
  let credited = 0;
  if (pq > 0 && p.section_id) {
    const sec = (db.companySections ?? []).find((s) => s.id === p.section_id);
    if (sec) { sec.pooled_stock = r3((sec.pooled_stock ?? 0) + pq); credited = pq; }
  }
  p.stock = r3(p.stock + (sq - credited));
}
import type { PreparedUpload } from "./image";

/** Collapse invoice rows into distinct customers (keyed by phone, else name), most-recent first. */
function dedupeCustomers(rows: { customer_name?: string | null; customer_phone?: string | null; created_at: string }[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  const map = new Map<string, Customer>();
  for (const inv of rows) {
    const name = (inv.customer_name ?? "").trim();
    const phone = (inv.customer_phone ?? "").trim();
    if (!name && !phone) continue;
    const key = (phone || name).toLowerCase();
    const prev = map.get(key);
    if (prev) { prev.visits += 1; if (inv.created_at > prev.last_seen) prev.last_seen = inv.created_at; }
    else map.set(key, { name, phone, last_seen: inv.created_at, visits: 1 });
  }
  let list = Array.from(map.values());
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q));
  return list.sort((a, b) => b.last_seen.localeCompare(a.last_seen)).slice(0, 8);
}

/** A clinic owner-contact field counts as "blank" when empty or the "—" placeholder
 *  NewCase writes for walk-ins — only then may a claiming owner account fill it. */
function blankOwnerField(v?: string | null): boolean {
  const s = (v ?? "").trim();
  return !s || s === "—";
}

/* Daily sticky notes — device-local store. The demo's persistence AND the cloud
 * fallback while migration 0080 hasn't been applied yet (notes then stay on the
 * device instead of erroring; the widget keeps working either way). */
const dailyNotesKey = () => `vp_daily_notes_${getActiveClinicId()}`;
function dailyNotesLoad(): Record<string, DailyNote> {
  try { return JSON.parse(localStorage.getItem(dailyNotesKey()) ?? "{}") as Record<string, DailyNote>; } catch { return {}; }
}
function dailyNoteLocalGet(dateISO: string): DailyNote | null {
  return dailyNotesLoad()[dateISO] ?? null;
}
function dailyNoteLocalSet(dateISO: string, content: string, author?: string | null) {
  const map = dailyNotesLoad();
  map[dateISO] = { note_date: dateISO, content, updated_by: author ?? null, updated_at: new Date().toISOString() };
  try { localStorage.setItem(dailyNotesKey(), JSON.stringify(map)); } catch { /* ignore */ }
}

/* Demo-only audit + login trails (localStorage). On Supabase these live in the
 * audit_log / login_events tables; in demo we keep small local mirrors so the
 * Reports security-log views are populated and testable offline. */
const DEMO_AUDIT_KEY = "vp_demo_audit";
const DEMO_LOGIN_KEY = "vp_demo_login";
const DEMO_NOTES_KEY = "vp_demo_pet_notes";
function demoNotesLoad(): PetNote[] {
  try { const r = localStorage.getItem(DEMO_NOTES_KEY); if (r) return JSON.parse(r) as PetNote[]; } catch { /* ignore */ }
  return [];
}
function demoNotesSave(list: PetNote[]) { try { localStorage.setItem(DEMO_NOTES_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
const DEMO_EXPENSES_KEY = "vp_demo_expenses";
function demoExpensesLoad(): Expense[] {
  try { const r = localStorage.getItem(DEMO_EXPENSES_KEY); if (r) return JSON.parse(r) as Expense[]; } catch { /* ignore */ }
  return [];
}
function demoExpensesSave(list: Expense[]) { try { localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
/** تسجيل مصروف بالوضع التجريبي. مشتركٌ بين addExpense وترحيل الرواتب حتى
 *  يمرّ خروج المال من مسلكٍ واحد مهما كان مصدره. */
function demoAddExpense(input: Omit<Expense, "id" | "created_at">): Expense {
  const e: Expense = { ...input, id: uid("exp"), clinic_id: null, created_at: new Date().toISOString() };
  demoExpensesSave([e, ...demoExpensesLoad()]);
  return e;
}
function demoAuditLoad(): AuditEntry[] {
  try { const r = localStorage.getItem(DEMO_AUDIT_KEY); if (r) return JSON.parse(r) as AuditEntry[]; } catch { /* ignore */ }
  return [];
}
/** Signed-in demo user's display name — stamped on demo log rows (the server
 *  stores auth.uid() instead and the UI resolves it via the staff list). */
function demoActorName(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem("vp_session") || "null") as { raw?: { full_name?: string } } | null;
    return s?.raw?.full_name ?? null;
  } catch { return null; }
}
function demoAuditPush(e: Omit<AuditEntry, "id" | "created_at" | "actor">) {
  const details = { ...((e.details ?? {}) as Record<string, unknown>), __actor: demoActorName() };
  const entry: AuditEntry = { ...e, details, id: uid("au"), actor: null, created_at: new Date().toISOString() };
  try { localStorage.setItem(DEMO_AUDIT_KEY, JSON.stringify([entry, ...demoAuditLoad()].slice(0, 500))); } catch { /* ignore */ }
}
/** ما يمسّ مالاً أو مخزوناً — يعيش أطول لأنه دليلٌ يُسأل عنه بعد شهور،
 *  لا ضجيجاً ينتهي بيومه. نفس قائمة هجرة 0129 حرفياً. */
const AUDIT_MONEY_ENTITIES = new Set([
  "invoices", "invoice_items",
  "purchases", "purchase_items", "purchase_payments",
  "expenses", "products",
  "delivery_orders", "store_orders",
]);

/** احتفاظٌ بطبقتين — مرآة `purge_audit_log()` بالوضع التجريبي (هجرة 0129):
 *  المال والمخزون سنة، وما عداهما تسعون يوماً. */
function demoAuditPurge() {
  const now = Date.now();
  const noiseCut = now - 90 * 86400000;
  const moneyCut = now - 365 * 86400000;
  try {
    localStorage.setItem(DEMO_AUDIT_KEY, JSON.stringify(
      demoAuditLoad().filter((e) => {
        const at = new Date(e.created_at).getTime();
        return at >= (AUDIT_MONEY_ENTITIES.has(e.entity ?? "") ? moneyCut : noiseCut);
      }),
    ));
  } catch { /* ignore */ }
}
function demoLoginLoad(): LoginEvent[] {
  try { const r = localStorage.getItem(DEMO_LOGIN_KEY); if (r) return JSON.parse(r) as LoginEvent[]; } catch { /* ignore */ }
  return [];
}
function demoLoginSave(list: LoginEvent[]) { try { localStorage.setItem(DEMO_LOGIN_KEY, JSON.stringify(list)); } catch { /* ignore */ } }

// ---- Lab lifecycle (LIS) helpers, shared by demo + cloud repos. ----
const LAB_STAGE_COL: Record<string, keyof LabResult> = {
  ordered: "ordered_at", collected: "collected_at", running: "running_at", resulted: "resulted_at", verified: "verified_at",
};
/** Stamp a new lab record's lifecycle: a placeholder order starts «ordered»,
 *  a real result lands «resulted» (awaiting the doctor's release), and every
 *  reached stage gets its timestamp so turnaround time is measurable. */
function labLifecycleFields(input: Omit<LabResult, "id" | "created_at" | "clinic_id">, nowISO: string) {
  const isPlaceholder = input.panel_id === "ordered" && !(input.values?.length) && !input.snap_result;
  const status = input.status ?? (isPlaceholder ? "ordered" : "resulted");
  const reachedResult = status === "resulted" || status === "verified";
  return {
    status,
    priority: input.priority ?? "routine",
    ordered_at: input.ordered_at ?? nowISO,
    collected_at: input.collected_at ?? null,
    running_at: input.running_at ?? null,
    resulted_at: input.resulted_at ?? (reachedResult ? nowISO : null),
    verified_at: input.verified_at ?? (status === "verified" ? nowISO : null),
    collected_by: input.collected_by ?? null,
    verified_by: input.verified_by ?? null,
  };
}

const demoRepo = {
  async listPets(ownerId: string): Promise<Pet[]> {
    return loadDB().pets.filter((p) => p.owner_id === ownerId);
  },

  /** All pets for a clinic (used by the clinic log / records). Demo is single-tenant. */
  async listAllPets(_clinicId?: string): Promise<Pet[]> {
    return loadDB().pets;
  },

  /** Update an owner's contact details across all of their pets. */
  async updateOwnerContact(ownerId: string, patch: { owner_name?: string; owner_phone?: string; owner_email?: string }): Promise<void> {
    const db = loadDB();
    for (const p of db.pets) {
      if (p.owner_id === ownerId) Object.assign(p, patch);
    }
    saveDB(db);
  },

  async getPet(petId: string): Promise<Pet | undefined> {
    return loadDB().pets.find((p) => p.id === petId);
  },

  /** Batch pet fetch — ONE round-trip for a whole list (bookings/requests views). */
  async getPetsByIds(ids: string[]): Promise<Pet[]> {
    if (ids.length === 0) return [];
    const set = new Set(ids);
    return loadDB().pets.filter((p) => set.has(p.id));
  },

  async getPetByToken(token: string): Promise<Pet | undefined> {
    return loadDB().pets.find((p) => p.passport_token.toUpperCase() === token.trim().toUpperCase());
  },

  async getPetBySerial(serial: string): Promise<Pet | undefined> {
    const s = serial.trim();
    return loadDB().pets.find((p) => p.serial === s);
  },

  /** Owner claims an existing animal (by serial) into their profile.
   *  Claiming only LINKS the account (owner_id). The clinic's stored customer
   *  fields (اسم المراجع/هاتفه) are never overwritten — they're only filled
   *  when the clinic left them blank. */
  async claimPet(serial: string, owner: { owner_id: string; owner_name?: string; owner_phone?: string; owner_email?: string }): Promise<Pet | undefined> {
    const db = loadDB();
    const pet = db.pets.find((p) => p.serial === serial.trim());
    if (!pet) return undefined;
    pet.owner_id = owner.owner_id;
    if (blankOwnerField(pet.owner_name) && owner.owner_name) pet.owner_name = owner.owner_name;
    if (blankOwnerField(pet.owner_phone) && owner.owner_phone) pet.owner_phone = owner.owner_phone;
    if (blankOwnerField(pet.owner_email) && owner.owner_email) pet.owner_email = owner.owner_email;
    saveDB(db);
    return pet;
  },

  /** Phone-as-identity auto-claim: link every pet registered (in any clinic) under
   *  the account's phone number to this owner account. Only the LINK (owner_id)
   *  changes — clinic-entered contact fields stay untouched. Pets already linked
   *  to another real owner account are never re-claimed. Returns the newly linked pets. */
  async claimPetsByPhone(input: { owner_id: string; phone?: string; name?: string; email?: string }): Promise<Pet[]> {
    const key = phoneKey(input.phone ?? "");
    if (key.length < 8) return [];
    const db = loadDB();
    const ownerAccountIds = new Set(loadOwners().map((o) => o.id));
    const claimed: Pet[] = [];
    for (const p of db.pets) {
      if (p.owner_id === input.owner_id) continue;
      if (ownerAccountIds.has(p.owner_id)) continue; // belongs to another owner account
      if (phoneKey(p.owner_phone ?? "") !== key) continue;
      p.owner_id = input.owner_id;
      if (blankOwnerField(p.owner_name) && input.name) p.owner_name = input.name;
      if (blankOwnerField(p.owner_email) && input.email) p.owner_email = input.email;
      claimed.push(p);
    }
    if (claimed.length) saveDB(db);
    return claimed;
  },

  /** Clinic lookup of an owner's shared pets by email (cross-clinic account access). */
  async getPetsByOwnerEmail(email: string): Promise<Pet[]> {
    const e = email.trim().toLowerCase();
    if (!e) return [];
    return loadDB().pets.filter((p) => (p.owner_email ?? "").toLowerCase() === e && p.shared_with_clinic !== false);
  },

  /** Shared pets for an owner id (used when a clinic scans the owner's personal QR). */
  async getSharedPetsByOwnerId(ownerId: string): Promise<Pet[]> {
    return loadDB().pets.filter((p) => p.owner_id === ownerId && p.shared_with_clinic !== false);
  },

  async createPet(input: Omit<Pet, "id" | "passport_token" | "created_at" | "serial">): Promise<Pet> {
    const db = loadDB();
    const existing = new Set(db.pets.map((p) => p.serial));
    let serial = "";
    do { serial = String(Math.floor(10000 + Math.random() * 90000)); } while (existing.has(serial));
    const pet: Pet = {
      ...input,
      id: uid("pet"),
      passport_token: `PET-${input.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-${uid("").slice(1, 6).toUpperCase()}`,
      serial,
      created_at: new Date().toISOString(),
    };
    db.pets.push(pet);
    saveDB(db);
    return pet;
  },

  async updatePet(petId: string, patch: Partial<Pet>): Promise<Pet | undefined> {
    const db = loadDB();
    const pet = db.pets.find((p) => p.id === petId);
    if (!pet) return undefined;
    Object.assign(pet, patch);
    saveDB(db);
    return pet;
  },

  async deletePet(petId: string): Promise<void> {
    const db = loadDB();
    db.pets = db.pets.filter((p) => p.id !== petId);
    // Cascade the pet's dependent records so nothing is left dangling (mirrors the
    // `on delete cascade` foreign keys used in the Supabase schema).
    db.weightLogs = db.weightLogs.filter((w) => w.pet_id !== petId);
    db.vaccinations = db.vaccinations.filter((v) => v.pet_id !== petId);
    db.visits = db.visits.filter((v) => v.pet_id !== petId);
    db.media = db.media.filter((m) => m.pet_id !== petId);
    db.treatments = db.treatments.filter((tr) => tr.pet_id !== petId);
    db.admissions = db.admissions.filter((a) => a.pet_id !== petId);
    if (db.appointments) db.appointments = db.appointments.filter((a) => a.pet_id !== petId);
    saveDB(db);
  },

  async listWeights(petId: string): Promise<WeightLog[]> {
    return loadDB()
      .weightLogs.filter((w) => w.pet_id === petId)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  },

  async addWeight(petId: string, weight_kg: number, measured_at?: string): Promise<WeightLog> {
    const db = loadDB();
    const log: WeightLog = { id: uid("w"), pet_id: petId, weight_kg, measured_at: measured_at ?? new Date().toISOString().slice(0, 10) };
    db.weightLogs.push(log);
    const pet = db.pets.find((p) => p.id === petId);
    if (pet) pet.current_weight_kg = weight_kg;
    saveDB(db);
    return log;
  },

  async listVaccinations(petId: string): Promise<Vaccination[]> {
    return loadDB().vaccinations.filter((v) => v.pet_id === petId);
  },

  /** Vaccinations across a set of pets (the clinic directory) — for the
   *  dashboard reminders feed (vaccines + deworming due soon). */
  async listAllVaccinations(petIds: string[]): Promise<Vaccination[]> {
    const ids = new Set(petIds);
    return (loadDB().vaccinations ?? []).filter((v) => ids.has(v.pet_id));
  },

  async addVaccination(input: Omit<Vaccination, "id">): Promise<Vaccination> {
    const db = loadDB();
    const v: Vaccination = { ...input, id: uid("v") };
    db.vaccinations.push(v);
    saveDB(db);
    return v;
  },

  /** Patch a vaccination in place — e.g. administering a scheduled booster. */
  async updateVaccination(id: string, patch: Partial<Omit<Vaccination, "id" | "pet_id">>): Promise<void> {
    const db = loadDB();
    const v = db.vaccinations.find((x) => x.id === id);
    if (!v) return;
    Object.assign(v, patch);
    saveDB(db);
  },

  async listVisits(petId: string): Promise<MedicalVisit[]> {
    return loadDB()
      .visits.filter((v) => v.pet_id === petId)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /** Visits for a set of pets (the clinic's directory), newest first — one pass. */
  async listAllVisits(petIds: string[]): Promise<MedicalVisit[]> {
    const ids = new Set(petIds);
    return (loadDB().visits ?? [])
      .filter((v) => ids.has(v.pet_id))
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /** Every visit for the clinic in ONE query — see listClinicTreatments for why. */
  async listClinicVisits(_clinicId?: string): Promise<MedicalVisit[]> {
    return (loadDB().visits ?? []).slice().sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  /* ---- Care sheet: fluids, vitals, intake/output beside the doses ---- */
  async listCareEntries(petId: string, day?: string): Promise<CareEntry[]> {
    return (loadDB().careEntries ?? [])
      .filter((c) => c.pet_id === petId && (!day || c.day === day))
      .sort((a, b) => (a.day === b.day ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.day.localeCompare(b.day)));
  },

  async addCareEntry(input: Omit<CareEntry, "id" | "created_at">): Promise<CareEntry> {
    const db = loadDB();
    const row: CareEntry = { ...input, id: uid("care"), created_at: new Date().toISOString() };
    (db.careEntries ??= []).push(row);
    saveDB(db);
    return row;
  },

  async deleteCareEntry(id: string): Promise<void> {
    const db = loadDB();
    db.careEntries = (db.careEntries ?? []).filter((c) => c.id !== id);
    saveDB(db);
  },

  /* ---- Problem list (POMR) — persists across visits, read at prescribing time ---- */
  async listProblems(petId: string): Promise<PetProblem[]> {
    return (loadDB().petProblems ?? [])
      .filter((p) => p.pet_id === petId)
      .sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "active" ? -1 : 1));
  },

  async addProblem(input: Omit<PetProblem, "id" | "created_at">): Promise<PetProblem> {
    const db = loadDB();
    const row: PetProblem = { ...input, id: uid("prob"), created_at: new Date().toISOString() };
    (db.petProblems ??= []).unshift(row);
    saveDB(db);
    return row;
  },

  async updateProblem(id: string, patch: Partial<PetProblem>): Promise<void> {
    const db = loadDB();
    const row = (db.petProblems ?? []).find((p) => p.id === id);
    if (row) Object.assign(row, patch);
    saveDB(db);
  },

  async deleteProblem(id: string): Promise<void> {
    const db = loadDB();
    db.petProblems = (db.petProblems ?? []).filter((p) => p.id !== id);
    saveDB(db);
  },

  /* ---- طلبات التطوير: المساعد يرفعها، والعيادة تتابع حالتها ---- */
  async listFeatureRequests(): Promise<FeatureRequest[]> {
    return (loadDB().featureRequests ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addFeatureRequest(input: Omit<FeatureRequest, "id" | "created_at" | "updated_at" | "status"> & { status?: FeatureRequest["status"] }): Promise<FeatureRequest> {
    const db = loadDB();
    const now = new Date().toISOString();
    const row: FeatureRequest = { status: "new", ...input, id: uid("freq"), created_at: now, updated_at: now };
    (db.featureRequests ??= []).unshift(row);
    saveDB(db);
    return row;
  },

  async updateFeatureRequest(id: string, patch: Partial<FeatureRequest>): Promise<void> {
    const db = loadDB();
    const row = (db.featureRequests ?? []).find((r) => r.id === id);
    if (row) Object.assign(row, patch, { updated_at: new Date().toISOString() });
    saveDB(db);
  },

  /** Admin: أسقفُ المزوّد وما استُهلك منها (هجرة 0137). بالوضع التجريبي ماكو
   *  خادمٌ ولا باقة، فالقائمة فارغة — واللوحة تخفي نفسها بدل ما تخترع أرقاماً. */
  async systemHealth(): Promise<HealthMetric[]> {
    return [];
  },

  /** Admin: كل الطلبات عبر كل العيادات — بالديمو نفس قائمة العيادة الوحيدة. */
  async adminListFeatureRequests(): Promise<FeatureRequest[]> {
    return (loadDB().featureRequests ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addVisit(input: Omit<MedicalVisit, "id">): Promise<MedicalVisit> {
    const db = loadDB();
    // Snapshot the patient's age at visit time (unless the caller already provided it).
    const patient_age_months = input.patient_age_months ?? ageMonths(db.pets.find((p) => p.id === input.pet_id)?.dob);
    const v: MedicalVisit = { ...input, patient_age_months, id: uid("vis") };
    db.visits.push(v);
    saveDB(db);
    return v;
  },

  /* ---------------- Clinical / progress notes ---------------- */
  async listPetNotes(petId: string): Promise<PetNote[]> {
    return demoNotesLoad().filter((n) => n.pet_id === petId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async addPetNote(input: { pet_id: string; note_text: string; author_id?: string | null; author_name?: string | null; visit_id?: string | null }): Promise<PetNote> {
    const note: PetNote = {
      id: uid("note"), pet_id: input.pet_id, clinic_id: null,
      author_id: input.author_id ?? null, author_name: input.author_name ?? null,
      note_text: input.note_text, visit_id: input.visit_id ?? null, created_at: new Date().toISOString(),
    };
    demoNotesSave([note, ...demoNotesLoad()]);
    return note;
  },

  /* ---------------- Laboratory (المختبر) ---------------- */
  async listLabResults(petId: string): Promise<LabResult[]> {
    return (loadDB().labResults ?? [])
      .filter((r) => r.pet_id === petId)
      .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  },
  async addLabResult(input: Omit<LabResult, "id" | "created_at" | "clinic_id">): Promise<LabResult> {
    const db = loadDB();
    const now = new Date().toISOString();
    const row: LabResult = { ...input, ...labLifecycleFields(input, now), id: uid("lab"), clinic_id: null, created_at: now };
    (db.labResults ??= []).unshift(row);
    saveDB(db);
    return row;
  },
  /** Advance a lab order to the next lifecycle stage, stamping the moment (and
   *  who, for collect/verify). Earlier stamps are preserved. */
  async advanceLabStatus(id: string, status: LabStatusValue, extra?: { collected_by?: string | null; verified_by?: string | null }): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (!r) return;
    const now = new Date().toISOString();
    r.status = status;
    const col = LAB_STAGE_COL[status];
    if (col && !r[col]) (r as unknown as Record<string, unknown>)[col] = now;
    if (extra?.collected_by !== undefined && status === "collected") r.collected_by = extra.collected_by;
    if (extra?.verified_by !== undefined && status === "verified") r.verified_by = extra.verified_by;
    saveDB(db);
  },
  async setLabPriority(id: string, priority: "routine" | "urgent"): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (r) { r.priority = priority; saveDB(db); }
  },
  async setLabBilled(id: string, billed: boolean): Promise<void> {
    const db = loadDB();
    const r = (db.labResults ??= []).find((x) => x.id === id);
    if (r) { r.billed = billed; saveDB(db); }
  },
  /** Clinic-wide lab results — feeds the clinical report (عدد التحاليل بالفترة). */
  async listClinicLabResults(_clinicId?: string): Promise<LabResult[]> {
    return (loadDB().labResults ?? []).slice().sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  },
  async deleteLabResult(id: string): Promise<void> {
    const db = loadDB();
    db.labResults = (db.labResults ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /* ---------------- Lab device bridge (الجسر الشبكي للمختبر) ---------------- */
  async createDeviceLink(name: string): Promise<LabDeviceLink> {
    const db = loadDB();
    const token = (uuid() + uuid()).replace(/-/g, ""); // secret credential, 64 hex
    const row: LabDeviceLink = {
      id: uid("dev"), clinic_id: null, name: name.trim() || "جهاز المختبر",
      token, revoked: false, last_seen_at: null, created_at: new Date().toISOString(),
    };
    (db.deviceLinks ??= []).unshift(row);
    saveDB(db);
    return row;
  },
  async listDeviceLinks(): Promise<LabDeviceLink[]> {
    return (loadDB().deviceLinks ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async revokeDeviceLink(id: string): Promise<void> {
    const db = loadDB();
    const r = (db.deviceLinks ??= []).find((x) => x.id === id);
    if (r) { r.revoked = true; saveDB(db); }
  },
  /** New (unhandled) inbox messages for this clinic, newest first. */
  async listDeviceInbox(): Promise<LabDeviceInbox[]> {
    return (loadDB().deviceInbox ?? [])
      .filter((m) => m.status === "new")
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  },
  async markInboxHandled(id: string, status: "accepted" | "dismissed"): Promise<void> {
    const db = loadDB();
    const m = (db.deviceInbox ??= []).find((x) => x.id === id);
    if (m) { m.status = status; m.handled_at = new Date().toISOString(); saveDB(db); }
  },
  /** Deliver a raw device message into the inbox (demo mirror of the cloud RPC).
   *  Used by the in-app «رسالة تجريبية» test and by the local simulator. */
  async ingestDeviceMessage(token: string, raw: string): Promise<string | null> {
    const db = loadDB();
    const link = (db.deviceLinks ?? []).find((x) => x.token === token && !x.revoked);
    if (!link) return null;
    const row: LabDeviceInbox = {
      id: uid("inbox"), clinic_id: link.clinic_id ?? null, link_id: link.id,
      device_name: link.name, raw, status: "new", received_at: new Date().toISOString(), handled_at: null,
    };
    (db.deviceInbox ??= []).unshift(row);
    link.last_seen_at = row.received_at;
    saveDB(db);
    return row.id;
  },

  /* ---------------- Clinic visits (الزيارات) ---------------- */
  async listClinicVisitsForPet(petId: string): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.pet_id === petId)
      .sort((a, b) => (b.opened_at || "").localeCompare(a.opened_at || ""));
  },
  async getClinicVisit(id: string): Promise<ClinicVisit | null> {
    return (loadDB().clinicVisits ?? []).find((v) => v.id === id) ?? null;
  },
  /** Clinic-wide list of still-open visits (across all pets) — powers the charts hub. */
  async listOpenClinicVisits(_clinicId?: string): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.status === "open")
      .sort((a, b) => (b.opened_at || "").localeCompare(a.opened_at || ""));
  },
  /** الحالات المنتهية (مع نتيجتها) — تغذي سكشن الحالات والمنقطعين والتقارير. */
  async listEndedClinicVisits(_clinicId?: string, limit = 300): Promise<ClinicVisit[]> {
    return (loadDB().clinicVisits ?? [])
      .filter((v) => v.status === "ended")
      .sort((a, b) => (b.ended_at || b.opened_at || "").localeCompare(a.ended_at || a.opened_at || ""))
      .slice(0, limit);
  },
  async addClinicVisit(input: Omit<ClinicVisit, "id" | "created_at">): Promise<ClinicVisit> {
    const db = loadDB();
    const v: ClinicVisit = { created_at: new Date().toISOString(), ...input, id: uid("visit") };
    (db.clinicVisits ??= []).unshift(v);
    saveDB(db);
    return v;
  },
  async updateClinicVisit(id: string, patch: Partial<ClinicVisit>): Promise<void> {
    const db = loadDB();
    const v = (db.clinicVisits ??= []).find((x) => x.id === id);
    if (v) { Object.assign(v, patch); saveDB(db); }
  },

  async listMedia(petId: string): Promise<MediaItem[]> {
    return loadDB()
      .media.filter((m) => m.pet_id === petId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /** Media across a set of pets (clinic-wide) — for the Lab & X-Ray report. */
  async listAllMedia(petIds: string[]): Promise<MediaItem[]> {
    const ids = new Set(petIds);
    return (loadDB().media ?? []).filter((m) => ids.has(m.pet_id));
  },

  async addMedia(input: Omit<MediaItem, "id" | "created_at">): Promise<MediaItem> {
    const db = loadDB();
    const m: MediaItem = { ...input, id: uid("m"), created_at: new Date().toISOString() };
    db.media.push(m);
    saveDB(db);
    return m;
  },

  /**
   * Upload a prepared (already client-side compressed) file and link it to a pet.
   * Demo mode has no object storage, so the compressed image is kept inline.
   */
  async uploadMedia(petId: string, upload: PreparedUpload, kind: MediaItem["kind"], caption?: string): Promise<MediaItem> {
    return demoRepo.addMedia({ pet_id: petId, kind, url: upload.dataUrl, caption });
  },

  async listAppointmentsForOwner(ownerId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.owner_id === ownerId && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** All non-cancelled appointments for a single pet (used by the pet workspace rail). */
  async listAppointmentsForPet(petId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.pet_id === petId && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** All appointments on a given calendar day (clinic-wide). */
  async listAppointmentsForDay(dayISO: string): Promise<Appointment[]> {
    const day = dayISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => a.scheduled_at.slice(0, 10) === day && a.status !== "cancelled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Appointments across a date range in ONE query (used by the dashboard week view). */
  async listAppointmentsInRange(startISO: string, endISO: string): Promise<Appointment[]> {
    const start = startISO.slice(0, 10);
    const end = endISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => { const d = a.scheduled_at.slice(0, 10); return d >= start && d <= end && a.status !== "cancelled"; })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Patients checked in and waiting for / in a given doctor's room. */
  async listWaiting(doctorId: string): Promise<Appointment[]> {
    return loadDB()
      .appointments.filter((a) => a.doctor_id === doctorId && (a.status === "checked_in" || a.status === "in_room"))
      .sort((a, b) => (a.triage_score ?? 9) - (b.triage_score ?? 9));
  },

  async slotTaken(doctorId: string, scheduledAt: string): Promise<boolean> {
    return loadDB().appointments.some(
      (a) => a.doctor_id === doctorId && a.scheduled_at === scheduledAt && a.status !== "cancelled",
    );
  },

  /** EVERY booking of a calendar day — cancelled and no-show included — for the
   *  الحجوزات hub. Day matching uses the LOCAL calendar (Iraq evenings must not
   *  leak into tomorrow via UTC). */
  async listBookingsForDay(dayISO: string): Promise<Appointment[]> {
    const day = dayISO.slice(0, 10);
    return loadDB()
      .appointments.filter((a) => localISO(new Date(a.scheduled_at)) === day)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** Incoming owner bookings awaiting the clinic's decision (طلبات الحجز).
   *  Anything still "requested" from yesterday onwards — the reception inbox. */
  async listBookingRequests(): Promise<Appointment[]> {
    const since = new Date(Date.now() - 86400000).toISOString();
    return loadDB()
      .appointments.filter((a) => a.status === "requested" && a.scheduled_at >= since)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },

  /** The clinic's shared sticky note for one calendar day (dashboard widget). */
  async getDailyNote(dateISO: string): Promise<DailyNote | null> {
    return dailyNoteLocalGet(dateISO);
  },

  async saveDailyNote(dateISO: string, content: string, author?: string): Promise<void> {
    dailyNoteLocalSet(dateISO, content, author ?? demoActorName());
  },

  /** Busy times for a set of doctors in a window — feeds the availability badges
   *  and the slot grid. Times only; no patient information. */
  async listDoctorBusySlots(doctorIds: string[], fromISO: string, toISO: string): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    if (doctorIds.length === 0) return out;
    const ids = new Set(doctorIds);
    for (const a of loadDB().appointments) {
      if (!ids.has(a.doctor_id) || a.status === "cancelled") continue;
      if (a.scheduled_at < fromISO || a.scheduled_at > toISO) continue;
      (out[a.doctor_id] ??= []).push(a.scheduled_at);
    }
    return out;
  },

  /** Booking directory: clinics an owner can book at (safe public fields only). */
  async listClinicDirectory(): Promise<ClinicInfo[]> {
    return loadClinics().map((c) => ({ id: c.id, name: c.name, city: c.city ?? null, phone: c.phone ?? null }));
  },

  /** Active bookable team of one clinic (demo shares the single local roster). */
  async listClinicStaffPublic(_clinicId: string): Promise<PublicStaff[]> {
    const list = await listStaff();
    return list
      .filter((s) => s.status === "active")
      .map((s) => ({ id: s.id, name: s.name, role: s.role, specialty: s.specialty || null }));
  },

  async createAppointment(input: Omit<Appointment, "id" | "created_at">): Promise<Appointment> {
    const db = loadDB();
    const apt: Appointment = { ...input, id: uid("apt"), created_at: new Date().toISOString() };
    db.appointments.push(apt);
    saveDB(db);
    return apt;
  },

  async updateAppointment(id: string, patch: Partial<Appointment>): Promise<Appointment | undefined> {
    const db = loadDB();
    const apt = db.appointments.find((a) => a.id === id);
    if (!apt) return undefined;
    Object.assign(apt, patch);
    saveDB(db);
    return apt;
  },

  async setAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
    await this.updateAppointment(id, { status });
  },

  async listTreatments(petId: string): Promise<TreatmentEntry[]> {
    return loadDB()
      .treatments.filter((t) => t.pet_id === petId)
      .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : a.day.localeCompare(b.day)));
  },

  /** Treatments across a set of pets (clinic-wide) — for the Dispensed Medications report. */
  async listAllTreatments(petIds: string[]): Promise<TreatmentEntry[]> {
    const ids = new Set(petIds);
    return (loadDB().treatments ?? []).filter((t) => ids.has(t.pet_id));
  },

  /**
   * Treatments for the whole clinic in ONE query, optionally narrowed to a single
   * day. Prefer this over listAllTreatments(petIds) on clinic-wide screens: the
   * pet-id variant sends every patient id in the URL, which grows without bound
   * as the clinic does. RLS already scopes rows to the clinic.
   */
  async listClinicTreatments(_clinicId?: string, day?: string): Promise<TreatmentEntry[]> {
    const all = loadDB().treatments ?? [];
    return (day ? all.filter((t) => t.day === day) : all.slice())
      .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : b.day.localeCompare(a.day)));
  },

  async addTreatment(input: Omit<TreatmentEntry, "id" | "created_at">): Promise<TreatmentEntry> {
    const db = loadDB();
    const entry: TreatmentEntry = { ...input, id: uid("tx"), created_at: new Date().toISOString() };
    db.treatments.push(entry);
    saveDB(db);
    return entry;
  },

  /** Batch insert for whole treatment plans — ONE write instead of a round-trip
   *  per dose (a 3-drug × 10-day plan used to cost 30 sequential requests). */
  async addTreatments(inputs: Omit<TreatmentEntry, "id" | "created_at">[]): Promise<void> {
    if (inputs.length === 0) return;
    const db = loadDB();
    const at = new Date().toISOString();
    for (const input of inputs) db.treatments.push({ ...input, id: uid("tx"), created_at: at });
    saveDB(db);
  },

  async deleteTreatment(id: string): Promise<void> {
    const db = loadDB();
    db.treatments = db.treatments.filter((t) => t.id !== id);
    saveDB(db);
  },

  /* ---- العمليات الجراحية (سجل الحالة) ---- */
  async listSurgeries(petId: string): Promise<Surgery[]> {
    return (loadDB().surgeries ?? [])
      .filter((x) => x.pet_id === petId)
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  },

  async addSurgery(input: Omit<Surgery, "id" | "created_at">): Promise<Surgery> {
    const db = loadDB();
    const row: Surgery = { ...input, id: uid("srg"), created_at: new Date().toISOString() };
    db.surgeries = [...(db.surgeries ?? []), row];
    saveDB(db);
    return row;
  },

  /** كل عمليات العيادة (لعدّاد الشهر في سجل الطبلات). */
  async listAllSurgeries(): Promise<Surgery[]> {
    return (loadDB().surgeries ?? []).slice().sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  },

  async updateSurgery(id: string, patch: Partial<Surgery>): Promise<void> {
    const db = loadDB();
    db.surgeries = (db.surgeries ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x));
    saveDB(db);
  },

  async deleteSurgery(id: string): Promise<void> {
    const db = loadDB();
    db.surgeries = (db.surgeries ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /** Toggle a scheduled treatment between given/not-given (flowsheet check-off).
   *  `at` overrides the administration time (defaults to now). */
  async setTreatmentGiven(id: string, given: boolean, by?: string, at?: string): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.administered_at = given ? (at || new Date().toISOString()) : null;
    tx.administered_by = given ? by : undefined;
    if (given) tx.missed_reason = null;   // أُنجزت ⇒ ما عاد لها سببُ فوات
    saveDB(db);
  },

  /** تسجيل مهمة **بقيمة**: حرارة، نسبة أكل، حجم سوائل، نتيجة فحص.
   *  الدواء يُنجَز بعلامة، وهذه لا تُنجَز إلا بما قِيس فعلاً — فالقيمة جزءٌ
   *  من الإنجاز لا ملحقٌ به. */
  async setTreatmentResult(id: string, result: string, by?: string, at?: string): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.result = result;
    tx.administered_at = at || new Date().toISOString();
    tx.administered_by = by;
    tx.missed_reason = null;
    saveDB(db);
  },
  /** تعديل أمرٍ قبل إعطائه: الاسم/الكمية/الوقت/التكرار — به يصير «تعديل اليوم
   *  أو كل الأيام الباقية» بلا هدمٍ وإعادة بناء. */
  async updateTreatment(id: string, patch: Partial<Pick<TreatmentEntry, "medication" | "amount" | "time" | "observations" | "route">>): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    Object.assign(tx, patch);
    saveDB(db);
  },

  /** توثيق فوات مهمة بسببها — تبقى غير مُنجَزة، لكنها ما عادت مجهولة. */
  async setTreatmentMissed(id: string, reason: string | null): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.missed_reason = reason;
    saveDB(db);
  },

  async listAdmissions(_clinicId?: string): Promise<Admission[]> {
    return loadDB()
      .admissions.slice()
      .sort((a, b) => admOrderKey(b).localeCompare(admOrderKey(a)));
  },

  async listAdmissionsForPet(petId: string): Promise<Admission[]> {
    return loadDB()
      .admissions.filter((a) => a.pet_id === petId)
      .sort((a, b) => admOrderKey(b).localeCompare(admOrderKey(a)));
  },

  async addAdmission(input: Omit<Admission, "id">): Promise<Admission> {
    const db = loadDB();
    // Stamp the creation time so ordering is exact, then prepend so the local cache
    // mirrors the newest-first fetch — the new case shows at the top instantly.
    const adm: Admission = { created_at: new Date().toISOString(), ...input, id: uid("adm") };
    db.admissions.unshift(adm);
    // Mirror the production trigger: every admission writes an 'admitted' event
    // to the per-animal movement trail (سجل الحركات).
    pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "admitted", to_kind: adm.kind, to_cage: adm.cage ?? null });
    saveDB(db);
    return adm;
  },

  async updateAdmission(id: string, patch: Partial<Admission>): Promise<void> {
    const db = loadDB();
    const adm = db.admissions.find((a) => a.id === id);
    if (adm) {
      const before = { status: adm.status, kind: adm.kind, cage: adm.cage ?? null };
      Object.assign(adm, patch);
      // Mirror the production trigger (migration 0070) exactly — see its rules.
      if (before.status === "active" && adm.status === "discharged") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "discharged", from_kind: adm.kind });
      } else if (before.status === "discharged" && adm.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "admitted", to_kind: adm.kind, to_cage: adm.cage ?? null });
      }
      if (adm.kind !== before.kind && adm.status === "active" && before.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "transferred", from_kind: before.kind, to_kind: adm.kind });
      }
      if ((adm.cage ?? null) !== before.cage && adm.status === "active" && before.status === "active") {
        pushMovementLocal(db, { pet_id: adm.pet_id, admission_id: adm.id, event: "cage_changed", from_cage: before.cage, to_cage: adm.cage ?? null });
      }
      saveDB(db);
    }
  },

  /** The animal's movement trail — newest first (سجل حركات الحيوان). */
  async listPetMovements(petId: string): Promise<PetMovement[]> {
    return (loadDB().petMovements ?? [])
      .filter((m) => m.pet_id === petId)
      .sort((a, b) => b.at.localeCompare(a.at));
  },

  /** Branches — the clinic's physical locations. Main branch first, then by age. */
  async listBranches(_clinicId?: string): Promise<Branch[]> {
    return (loadDB().branches ?? [])
      .filter((b) => b.is_active !== false)
      .sort((a, b) => Number(!!b.is_main) - Number(!!a.is_main) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  },

  async createBranch(input: Omit<Branch, "id" | "created_at">): Promise<Branch> {
    const db = loadDB();
    const branch: Branch = { ...input, id: uid("br"), created_at: new Date().toISOString() };
    db.branches = [...(db.branches ?? []), branch];
    saveDB(db);
    return branch;
  },

  async updateBranch(id: string, patch: Partial<Omit<Branch, "id" | "clinic_id">>): Promise<void> {
    const db = loadDB();
    const branch = (db.branches ?? []).find((b) => b.id === id);
    if (branch) {
      Object.assign(branch, patch);
      saveDB(db);
    }
  },

  /** Reminders. Pass { ownerId } to scope: null/undefined-in-key → clinic reminders, a value → that owner's. */
  async listReminders(filter?: { ownerId?: string | null }): Promise<Reminder[]> {
    const db = loadDB();
    const all = db.reminders ?? [];
    const list = filter && "ownerId" in filter
      ? all.filter((r) => (filter.ownerId == null ? !r.owner_id : r.owner_id === filter.ownerId))
      : all;
    return list.slice().sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  },

  async addReminder(input: Omit<Reminder, "id" | "created_at">): Promise<Reminder> {
    const db = loadDB();
    if (!db.reminders) db.reminders = [];
    const r: Reminder = { ...input, id: uid("rem"), created_at: new Date().toISOString() };
    db.reminders.push(r);
    saveDB(db);
    return r;
  },

  async updateReminder(id: string, patch: Partial<Reminder>): Promise<void> {
    const db = loadDB();
    const r = (db.reminders ?? []).find((x) => x.id === id);
    if (r) { Object.assign(r, patch); saveDB(db); }
  },

  async removeReminder(id: string): Promise<void> {
    const db = loadDB();
    db.reminders = (db.reminders ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /* ---------------- Inventory & POS ---------------- */
  async listProducts(_clinicId?: string): Promise<Product[]> {
    return (loadDB().products ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  /** هل قاعدة البيانات تدعم عمود مجموعات الدفعات (bulk_group / ترحيل 0075)؟
   *  المخزن المحلي يدعمه دائماً؛ السحابة تُفحص فعلياً لتنبيه العيادة قبل أن
   *  تضيع روابط المجموعات بصمت. */
  async supportsBulkGroup(): Promise<boolean> {
    return true;
  },
  async getProductByBarcode(barcode: string, _clinicId?: string): Promise<Product | undefined> {
    const code = normalizeCode(barcode);
    if (!code) return undefined;
    // الرمزُ الأساسي أو أيُّ رمزٍ إضافي — ونطبّع المخزون أيضاً، فصفٌّ قديم
    // فيه محرفٌ غير مرئيّ يبقى قابلاً للمسح.
    return (loadDB().products ?? []).find(
      (p) => normalizeCode(p.barcode) === code || (p.alt_codes ?? []).some((c) => normalizeCode(c) === code),
    );
  },
  /** يربط رمزاً بمنتجٍ قائم بدل إنشاء منتجٍ جديد — نظير attach_product_code. */
  async attachProductCode(productId: string, code: string): Promise<Product> {
    const c = normalizeCode(code);
    if (!c) throw new Error("empty code");
    const db = loadDB();
    const taken = (db.products ?? []).find(
      (p) => p.id !== productId && (normalizeCode(p.barcode) === c || (p.alt_codes ?? []).some((x) => normalizeCode(x) === c)),
    );
    if (taken) throw new Error("code already belongs to another product");
    const p = (db.products ?? []).find((x) => x.id === productId);
    if (!p) throw new Error("product not found");
    if (normalizeCode(p.barcode) !== c && !(p.alt_codes ?? []).some((x) => normalizeCode(x) === c)) {
      p.alt_codes = [...(p.alt_codes ?? []), c];
      saveDB(db);
    }
    return p;
  },
  async createProduct(input: Omit<Product, "id" | "created_at">): Promise<Product> {
    const db = loadDB();
    if (!db.products) db.products = [];
    const p: Product = { ...input, id: uid("prod"), created_at: new Date().toISOString() };
    db.products.push(p);
    saveDB(db);
    return p;
  },
  async updateProduct(id: string, patch: Partial<Product>): Promise<Product | undefined> {
    const db = loadDB();
    const p = (db.products ?? []).find((x) => x.id === id);
    if (!p) return undefined;
    Object.assign(p, patch);
    saveDB(db);
    return p;
  },
  async deleteProduct(id: string): Promise<void> {
    const db = loadDB();
    db.products = (db.products ?? []).filter((x) => x.id !== id);
    saveDB(db);
  },

  /* ---- سجل الباركودات المولدة (مولد الباركود الداخلي) ---- */
  async listGeneratedBarcodes(): Promise<GeneratedBarcode[]> {
    return (loadDB().generatedBarcodes ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  /** تسمية/إعادة تسمية باركود مولد — الاسم يظهر بالسجل وعلى الملصق المطبوع. */
  async updateGeneratedBarcode(id: string, patch: Partial<Pick<GeneratedBarcode, "label" | "product_id">>): Promise<void> {
    const db = loadDB();
    const row = (db.generatedBarcodes ?? []).find((g) => g.id === id);
    if (row) { Object.assign(row, patch); saveDB(db); }
  },

  /** حفظ دفعة أكواد مولدة — إدراج واحد للدفعة كلها. */
  async addGeneratedBarcodes(rows: Omit<GeneratedBarcode, "id" | "created_at">[]): Promise<GeneratedBarcode[]> {
    const db = loadDB();
    const now = new Date().toISOString();
    const existing = new Set((db.generatedBarcodes ?? []).map((g) => g.barcode));
    const fresh = rows
      .filter((r) => !existing.has(r.barcode)) // مرآة قيد unique بالسحابة
      .map((r) => ({ ...r, id: uid("gbc"), created_at: now }));
    (db.generatedBarcodes ??= []).unshift(...fresh);
    saveDB(db);
    return fresh;
  },

  /* ---------------- المتجر الإلكتروني (0095) ----------------
   * جهة العيادة: هوية المتجر + صندوق الطلبات وقراراته.
   * الواجهة العامة: ثلاث دوال يستعملها الزائر بلا حساب — مرايا حرفية
   * لدوال RPC السحابية (نفس التحققات، نفس أكواد الأخطاء) حتى الوضع
   * التجريبي يتصرف مثل الإنتاج واحد لواحد. */
  async getStoreProfile(): Promise<StoreProfile | null> {
    return loadDB().storeProfile ?? null;
  },
  async saveStoreProfile(p: Omit<StoreProfile, "updated_at">): Promise<StoreProfile> {
    if (!isValidSlug(p.slug)) throw new Error("slug_invalid");
    const db = loadDB();
    const prof: StoreProfile = { ...(db.storeProfile ?? {}), ...p, updated_at: new Date().toISOString() };
    db.storeProfile = prof;
    saveDB(db);
    return prof;
  },
  /** هل الرابط متاح؟ (بالتجريبي عيادة واحدة — يكفي أن تكون الصيغة سليمة.) */
  async checkStoreSlug(slug: string): Promise<boolean> {
    return isValidSlug(normalizeSlug(slug));
  },
  async listStoreOrders(limit = 300): Promise<StoreOrder[]> {
    return (loadDB().storeOrders ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },
  async updateStoreOrder(id: string, patch: Partial<Pick<StoreOrder, "status" | "invoice_id" | "decided_at">>): Promise<void> {
    const db = loadDB();
    const o = (db.storeOrders ?? []).find((x) => x.id === id);
    if (o) { Object.assign(o, patch); saveDB(db); }
  },

  /* ---- رحلة الحيوان بالعيادة (متتبّع المالك) ---- */
  async getActiveJourney(petId: string): Promise<Journey | null> {
    return (loadDB().journeys ?? []).find((j) => j.pet_id === petId && j.status === "active") ?? null;
  },
  async listJourneyEvents(journeyId: string): Promise<JourneyEvent[]> {
    return (loadDB().journeyEvents ?? [])
      .filter((e) => e.journey_id === journeyId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async createJourney(petId: string, kind: JourneyKind, createdByName?: string | null): Promise<Journey> {
    const db = loadDB();
    // رحلة نشطة واحدة لكل حيوان — الموجودة تُعاد بدل إنشاء ثانية بالغلط.
    const existing = (db.journeys ?? []).find((j) => j.pet_id === petId && j.status === "active");
    if (existing) return existing;
    const now = new Date().toISOString();
    const j: Journey = {
      id: uid("jr"), clinic_id: null, pet_id: petId, kind,
      stage: "arrived", status: "active", token: journeyToken(),
      started_at: now, closed_at: null, last_seen_at: null, silent: false,
    };
    (db.journeys ??= []).unshift(j);
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: j.id, clinic_id: null, kind: "stage",
      stage: "arrived", created_by_name: createdByName ?? demoActorName(), created_at: now,
    });
    saveDB(db);
    return j;
  },
  async advanceJourney(journeyId: string, stage: JourneyStage, createdByName?: string | null): Promise<void> {
    const db = loadDB();
    const j = (db.journeys ?? []).find((x) => x.id === journeyId);
    if (!j || j.status !== "active") return;
    j.stage = stage;
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: journeyId, clinic_id: null, kind: "stage",
      stage, created_by_name: createdByName ?? demoActorName(), created_at: new Date().toISOString(),
    });
    saveDB(db);
  },
  async addJourneyNote(journeyId: string, input: { body?: string; photo?: string }, createdByName?: string | null): Promise<void> {
    const db = loadDB();
    if (!(db.journeys ?? []).some((x) => x.id === journeyId && x.status === "active")) return;
    (db.journeyEvents ??= []).push({
      id: uid("je"), journey_id: journeyId, clinic_id: null,
      kind: input.photo ? "photo" : "message",
      body: input.body?.slice(0, 500) || null, photo: input.photo ?? null,
      created_by_name: createdByName ?? demoActorName(), created_at: new Date().toISOString(),
    });
    saveDB(db);
  },
  /**
   * إغلاق الرحلة. `silent` هو صمّام الأخبار الصعبة: الرابط يموت فوراً وما
   * ينضاف أي حدث — لأن الوفاة والتدهور طريقهما الهاتف حصراً، لا الإشعارات.
   */
  async closeJourney(journeyId: string, opts?: { silent?: boolean }): Promise<void> {
    const db = loadDB();
    const j = (db.journeys ?? []).find((x) => x.id === journeyId);
    if (!j) return;
    j.status = "closed";
    j.closed_at = new Date().toISOString();
    if (opts?.silent) j.silent = true;
    saveDB(db);
  },
  /** الصفحة العامة — مرآة track_journey: نفس القصّ، ولا معلومة طبية. */
  async trackJourneyPublic(token: string): Promise<JourneyPublicView | null> {
    const db = loadDB();
    const t = token.trim().toUpperCase();
    const j = (db.journeys ?? []).find((x) => x.token === t);
    if (!j || j.silent) return null;
    if (j.status === "closed" && j.closed_at && Date.now() - new Date(j.closed_at).getTime() > 48 * 3600_000) return null;
    j.last_seen_at = new Date().toISOString();
    saveDB(db);
    const pet = db.pets.find((p) => p.id === j.pet_id);
    return {
      pet_name: pet?.name ?? "حبيبك",
      clinic_name: getClinicName() || "العيادة",
      clinic_phone: null,
      kind: j.kind, stage: j.stage, status: j.status, started_at: j.started_at,
      events: (db.journeyEvents ?? [])
        .filter((e) => e.journey_id === j.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ id: e.id, kind: e.kind, stage: e.stage, body: e.body, photo: e.photo, reaction: e.reaction, created_at: e.created_at })),
    };
  },
  async reactJourneyPublic(token: string, eventId: string, emoji: string): Promise<boolean> {
    if (!(OWNER_REACTIONS as readonly string[]).includes(emoji)) return false;
    const db = loadDB();
    const t = token.trim().toUpperCase();
    const j = (db.journeys ?? []).find((x) => x.token === t && !x.silent);
    if (!j) return false;
    const e = (db.journeyEvents ?? []).find((x) => x.id === eventId && x.journey_id === j.id && x.kind !== "stage");
    if (!e) return false;
    e.reaction = emoji;
    saveDB(db);
    return true;
  },

  /* ---- الواجهة العامة (الزائر) ---- */
  async storeFrontPublic(slug: string): Promise<StoreFrontInfo | null> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || sp.slug !== normalizeSlug(slug)) return null;
    const socials = getClinicSocials();
    return {
      name: getClinicName() || "عيادة بيطرية",
      logo_url: getClinicLogo(),
      phone: sp.whatsapp ?? null,
      whatsapp: sp.whatsapp ?? null,
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      bio: sp.bio ?? null,
      delivery_fee: sp.delivery_fee,
      min_order: sp.min_order,
    };
  },
  async storeCatalogPublic(slug: string, limit = 60, offset = 0): Promise<StoreCatalogItem[]> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || sp.slug !== normalizeSlug(slug)) return [];
    const poolOf = (p: Product) => (db.companySections ?? []).find((s) => s.id === p.section_id)?.pooled_stock ?? 0;
    const cap = Math.min(Math.max(limit, 1), 100); // نفس سقف السيرفر
    return (db.products ?? [])
      .filter((p) => p.store_visible)
      .sort((a, b) => (a.category ?? "z").localeCompare(b.category ?? "z") || a.name.localeCompare(b.name))
      .slice(Math.max(offset, 0), Math.max(offset, 0) + cap)
      .map((p) => ({
        id: p.id, name: p.name, category: p.category ?? null, subcategory: p.subcategory ?? null,
        price: p.sell_price, descr: p.store_desc ?? null,
        available: p.stock > 0 || poolOf(p) > 0,
      }));
  },
  async placeStoreOrder(
    slug: string,
    info: { name: string; phone: string; address?: string; note?: string },
    items: { product_id: string; qty: number }[],
  ): Promise<{ ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number }> {
    const db = loadDB();
    const sp = db.storeProfile;
    if (!sp?.enabled || sp.slug !== normalizeSlug(slug)) return { ok: false, error: "closed" };
    const name = (info.name ?? "").trim();
    if (name.length < 2 || name.length > 80) return { ok: false, error: "bad_name" };
    const digits = (info.phone ?? "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: "bad_phone" };
    if ((info.address ?? "").length > 300 || (info.note ?? "").length > 500) return { ok: false, error: "bad_input" };
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return { ok: false, error: "bad_items" };
    // مضاد الإغراق — مرآة حدود السيرفر (10 لكل رقم / 300 للعيادة باليوم).
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const recent = (db.storeOrders ?? []).filter((o) => new Date(o.created_at).getTime() > dayAgo);
    if (recent.filter((o) => o.customer_phone.replace(/\D/g, "") === digits).length >= 10) return { ok: false, error: "rate_limited" };
    if (recent.length >= 300) return { ok: false, error: "rate_limited" };
    // البنود: المنتج لازم منشور، والسعر يُقرأ من القاعدة الآن ويتجمّد.
    const lines: StoreOrderItem[] = [];
    for (const it of items) {
      const qty = Math.floor(it.qty);
      if (!Number.isFinite(qty) || qty < 1 || qty > 99) return { ok: false, error: "bad_items" };
      const p = (db.products ?? []).find((x) => x.id === it.product_id && x.store_visible);
      if (!p) return { ok: false, error: "bad_items" };
      lines.push({ product_id: p.id, name: p.name, qty, price: p.sell_price, total: Math.round(p.sell_price * qty * 100) / 100 });
    }
    const subtotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
    if (sp.min_order > 0 && subtotal < sp.min_order) return { ok: false, error: "min_order", min_order: sp.min_order };
    const total = Math.round((subtotal + sp.delivery_fee) * 100) / 100;
    const order: StoreOrder = {
      id: uid("so"), order_no: demoOrderNo(),
      customer_name: name, customer_phone: (info.phone ?? "").trim(),
      address: (info.address ?? "").trim() || null, note: (info.note ?? "").trim() || null,
      items: lines, subtotal, delivery_fee: sp.delivery_fee, total,
      status: "new", invoice_id: null, decided_at: null, created_at: new Date().toISOString(),
    };
    (db.storeOrders ??= []).unshift(order);
    saveDB(db);
    return { ok: true, order_no: order.order_no, total };
  },

  /* ---------------- Companies (الشركات) — inventory grouping ---------------- */
  async listCompanies(_clinicId?: string): Promise<Company[]> {
    return (loadDB().companies ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  async createCompany(input: Omit<Company, "id" | "created_at">): Promise<Company> {
    const db = loadDB();
    if (!db.companies) db.companies = [];
    const c: Company = { ...input, id: uid("co"), created_at: new Date().toISOString() };
    db.companies.push(c);
    saveDB(db);
    return c;
  },
  async updateCompany(id: string, patch: Partial<Company>): Promise<Company | undefined> {
    const db = loadDB();
    const c = (db.companies ?? []).find((x) => x.id === id);
    if (!c) return undefined;
    Object.assign(c, patch);
    saveDB(db);
    return c;
  },
  async deleteCompany(id: string): Promise<void> {
    const db = loadDB();
    db.companies = (db.companies ?? []).filter((x) => x.id !== id);
    // Its sections go too; products keep existing but lose the (now-gone) links.
    const gone = new Set((db.companySections ?? []).filter((s) => s.company_id === id).map((s) => s.id));
    db.companySections = (db.companySections ?? []).filter((s) => s.company_id !== id);
    for (const p of db.products ?? []) {
      if (p.company_id === id) p.company_id = null;
      if (p.section_id && gone.has(p.section_id)) p.section_id = null;
    }
    saveDB(db);
  },

  /* ---------------- Company sections (أصناف) — groups inside a company ---------------- */
  async listCompanySections(companyId?: string, _clinicId?: string): Promise<CompanySection[]> {
    let rows = (loadDB().companySections ?? []).slice();
    if (companyId) rows = rows.filter((s) => s.company_id === companyId);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
  async createCompanySection(input: Omit<CompanySection, "id" | "created_at">): Promise<CompanySection> {
    const db = loadDB();
    if (!db.companySections) db.companySections = [];
    const s: CompanySection = { ...input, id: uid("sec"), created_at: new Date().toISOString() };
    db.companySections.push(s);
    saveDB(db);
    return s;
  },
  async updateCompanySection(id: string, patch: Partial<CompanySection>): Promise<CompanySection | undefined> {
    const db = loadDB();
    const s = (db.companySections ?? []).find((x) => x.id === id);
    if (!s) return undefined;
    Object.assign(s, patch);
    saveDB(db);
    return s;
  },
  async deleteCompanySection(id: string): Promise<void> {
    const db = loadDB();
    db.companySections = (db.companySections ?? []).filter((x) => x.id !== id);
    // Products stay in the company — they just lose the (now-gone) section link.
    for (const p of db.products ?? []) if (p.section_id === id) p.section_id = null;
    saveDB(db);
  },

  /* ---------------- Purchases (المشتريات) — restock from a company ---------------- */
  async listPurchases(_clinicId?: string, range?: DateRange): Promise<Purchase[]> {
    return within(loadDB().purchases ?? [], "purchased_at", range).sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""));
  },
  async listPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
    return (loadDB().purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId);
  },
  /** كل سطور الشراء دفعة واحدة — تقرير التصنيفات يقارن المبيع بالمشترى. */
  async listAllPurchaseItems(_clinicId?: string, range?: DateRange): Promise<PurchaseItem[]> {
    return within(loadDB().purchaseItems ?? [], "created_at", range);
  },
  /** Bulk-receive stock from a company: restock existing barcodes (+ refresh
   *  prices), create new products for unknown barcodes, and save a purchase
   *  record. Mirrors the record_purchase RPC used on Supabase. */
  async recordPurchase(lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
    const db = loadDB();
    if (!db.products) db.products = [];
    if (!db.purchases) db.purchases = [];
    if (!db.purchaseItems) db.purchaseItems = [];
    const now = new Date().toISOString();
    const companyId = meta.company_id ?? null;
    const purchaseId = uid("pur");
    const round3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100; // match numeric(12,2) on the server
    const minStock = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
    let total = 0, count = 0;
    for (const l of lines) {
      const qty = round3(Number(l.qty) || 0);
      const cost = round2(Number(l.purchase_price) || 0);
      const sell = round2(Number(l.sell_price) || 0);
      total += qty * cost;
      count += qty;
      // Resolve a product: explicit id → barcode **موحَّداً** → الاسم موحَّداً.
      // ٥٣٩١ و5391 قطعةٌ واحدة، والقطعة المسجّلة بلا باركود تُشترى باسمها
      // فتُرصَّد بمكانها وتتعلّم الباركود — لا توأمَ أعمى بـ«بدون صنف».
      let pid = l.product_id ?? null;
      const code = invNormCode(l.barcode);
      if (!pid && code) {
        pid = db.products
          .filter((p) => invNormCode(p.barcode) === code && (p.barcode ?? "") !== "")
          .sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId)
            || Number(b.section_id != null) - Number(a.section_id != null))[0]?.id ?? null;
      }
      const lname = invNormName(l.name);
      if (!pid && lname.length >= 2 && lname !== "item") {
        pid = db.products
          .filter((p) => invNormName(p.name) === lname)
          .sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId)
            || Number(b.section_id != null) - Number(a.section_id != null))[0]?.id ?? null;
      }
      const existing = pid ? db.products.find((x) => x.id === pid) : undefined;
      if (existing) {
        if (!existing.barcode && l.barcode?.trim()) existing.barcode = l.barcode.trim();
        existing.stock = round3((existing.stock || 0) + qty);
        // A received count makes this a TRACKED product — no longer part of the
        // section's unknown pool (the pool itself is deliberately left untouched).
        existing.pooled = false;
        // Only refresh a price when a positive value was entered — a blank/0
        // field on a restock line KEEPS the product's real price (never zero it).
        if (cost > 0) existing.purchase_price = cost;
        if (sell > 0) existing.sell_price = sell;
        const ms = minStock(l.min_stock);
        if (ms != null) existing.min_stock = ms;
        if (l.expiry_date) existing.expiry_date = l.expiry_date;
        if (l.category) existing.category = l.category;
        if (!existing.company_id && companyId) existing.company_id = companyId;
        pid = existing.id;
      } else {
        // صنف القطعة الجديدة — يُقبل فقط إن كان صنفاً حقيقياً لهذه الشركة.
        const sec = l.section_id
          ? (db.companySections ?? []).find((x) => x.id === l.section_id
              && (!companyId || x.company_id === companyId))?.id ?? null
          : null;
        const np: Product = {
          id: uid("prod"), clinic_id: null, company_id: companyId, section_id: sec,
          barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
          category: l.category ?? null, subcategory: null,
          purchase_price: cost, sell_price: sell, stock: qty,
          min_stock: minStock(l.min_stock) ?? 0, expiry_date: l.expiry_date || null,
          created_at: now,
        };
        db.products.push(np);
        pid = np.id;
      }
      db.purchaseItems.push({
        id: uid("pi"), purchase_id: purchaseId, clinic_id: null, product_id: pid,
        barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
        category: l.category ?? null, qty, purchase_price: cost, sell_price: sell, created_at: now,
      });
    }
    const totalR = Math.round(total * 100) / 100;
    const paid = meta.amount_paid != null ? Math.max(0, Math.min(totalR, Math.round(meta.amount_paid * 100) / 100)) : totalR;
    const purchase: Purchase = {
      id: purchaseId, clinic_id: null, company_id: companyId, company_name: meta.company_name ?? null,
      reference: meta.reference?.trim() || null, total: totalR, item_count: Math.round(count),
      amount_paid: paid, payment_method: meta.payment_method ?? null,
      status: paid >= totalR ? "paid" : paid <= 0 ? "unpaid" : "partial",
      supplier_name: meta.supplier_name?.trim() || null,
      supplier_phone: meta.supplier_phone?.trim() || null,
      notes: meta.notes?.trim() || null, purchased_at: meta.purchased_at || now,
      staff_id: meta.staff_id ?? null, created_at: now,
    };
    db.purchases.push(purchase);
    saveDB(db);
    return purchase;
  },
  /** تعديل فاتورة شراء محفوظة: يُعكس أثر سطورها القديمة على المخزون ثم تُنزَّل
   *  السطور الجديدة بنفس المطابقة الذكية — السطر غير المتغيّر أثره الصافي صفر.
   *  المدفوع يبقى كما سُدِّد (مقصوصاً على الإجمالي الجديد). يطابق update_purchase RPC. */
  async updatePurchase(purchaseId: string, lines: PurchaseDraftLine[], meta: PurchaseMeta): Promise<Purchase> {
    const db = loadDB();
    const purchase = (db.purchases ?? []).find((x) => x.id === purchaseId);
    if (!purchase) throw new Error("purchase not found");
    if (!lines.length) throw new Error("empty purchase");
    const companyId = purchase.company_id ?? null;
    const round3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const minStock = (v: number | null | undefined) => (v != null && !Number.isNaN(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
    // ١) اعكس السطور القديمة ثم أزلها
    for (const it of (db.purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId)) {
      const p = it.product_id ? db.products.find((x) => x.id === it.product_id) : undefined;
      if (p) p.stock = Math.max(0, round3((p.stock || 0) - (it.qty || 0)));
    }
    db.purchaseItems = (db.purchaseItems ?? []).filter((x) => x.purchase_id !== purchaseId);
    // ٢) نزّل الجديدة — نفس مطابقة recordPurchase
    const now = new Date().toISOString();
    let total = 0, count = 0;
    for (const l of lines) {
      const qty = round3(Number(l.qty) || 0);
      const cost = round2(Number(l.purchase_price) || 0);
      const sell = round2(Number(l.sell_price) || 0);
      total += qty * cost;
      count += qty;
      let pid = l.product_id ?? null;
      const code = invNormCode(l.barcode);
      if (!pid && code) {
        pid = db.products
          .filter((p) => invNormCode(p.barcode) === code && (p.barcode ?? "") !== "")
          .sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId)
            || Number(b.section_id != null) - Number(a.section_id != null))[0]?.id ?? null;
      }
      const lname = invNormName(l.name);
      if (!pid && lname.length >= 2 && lname !== "item") {
        pid = db.products
          .filter((p) => invNormName(p.name) === lname)
          .sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId)
            || Number(b.section_id != null) - Number(a.section_id != null))[0]?.id ?? null;
      }
      const existing = pid ? db.products.find((x) => x.id === pid) : undefined;
      if (existing) {
        if (!existing.barcode && l.barcode?.trim()) existing.barcode = l.barcode.trim();
        existing.stock = round3((existing.stock || 0) + qty);
        existing.pooled = false;
        if (cost > 0) existing.purchase_price = cost;
        if (sell > 0) existing.sell_price = sell;
        const ms = minStock(l.min_stock);
        if (ms != null) existing.min_stock = ms;
        if (l.expiry_date) existing.expiry_date = l.expiry_date;
        if (l.category) existing.category = l.category;
        if (!existing.company_id && companyId) existing.company_id = companyId;
        pid = existing.id;
      } else {
        const sec = l.section_id
          ? (db.companySections ?? []).find((x) => x.id === l.section_id
              && (!companyId || x.company_id === companyId))?.id ?? null
          : null;
        const np: Product = {
          id: uid("prod"), clinic_id: null, company_id: companyId, section_id: sec,
          barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
          category: l.category ?? null, subcategory: null,
          purchase_price: cost, sell_price: sell, stock: qty,
          min_stock: minStock(l.min_stock) ?? 0, expiry_date: l.expiry_date || null,
          created_at: now,
        };
        db.products.push(np);
        pid = np.id;
      }
      db.purchaseItems.push({
        id: uid("pi"), purchase_id: purchaseId, clinic_id: null, product_id: pid,
        barcode: l.barcode?.trim() || null, name: l.name?.trim() || "Item",
        category: l.category ?? null, qty, purchase_price: cost, sell_price: sell, created_at: now,
      });
    }
    // ٣) رأس الفاتورة — المدفوع الحقيقي يبقى مقصوصاً على الإجمالي الجديد
    const totalR = round2(total);
    const prevPaid = purchase.amount_paid != null ? purchase.amount_paid : purchase.total;
    const paid = Math.max(0, Math.min(totalR, round2(meta.amount_paid != null ? meta.amount_paid : prevPaid)));
    purchase.total = totalR;
    purchase.item_count = Math.round(count);
    purchase.amount_paid = paid;
    purchase.status = paid >= totalR ? "paid" : paid <= 0 ? "unpaid" : "partial";
    if (meta.reference?.trim()) purchase.reference = meta.reference.trim();
    if (meta.payment_method) purchase.payment_method = meta.payment_method;
    purchase.supplier_name = meta.supplier_name !== undefined ? (meta.supplier_name?.trim() || null) : purchase.supplier_name;
    purchase.supplier_phone = meta.supplier_phone !== undefined ? (meta.supplier_phone?.trim() || null) : purchase.supplier_phone;
    purchase.notes = meta.notes !== undefined ? (meta.notes?.trim() || null) : purchase.notes;
    if (meta.purchased_at) purchase.purchased_at = meta.purchased_at;
    saveDB(db);
    return purchase;
  },
  /** سجل تسديدات فاتورة شراء — كل دفعة انسدّت على دين المورّد. */
  async listPurchasePayments(purchaseId: string): Promise<PurchasePayment[]> {
    return (loadDB().purchasePayments ?? [])
      .filter((x) => x.purchase_id === purchaseId)
      .sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""));
  },
  /** تسديد دفعة على فاتورة شراء آجلة: تُقص على المتبقّي، تُسجَّل في سجل
   *  التسديدات، ويُحدَّث رأس الفاتورة. يطابق settle_purchase RPC في السحابة. */
  async settlePurchase(purchaseId: string, amount: number, method: PaymentMethod = "cash", note?: string | null): Promise<Purchase | undefined> {
    const db = loadDB();
    const p = (db.purchases ?? []).find((x) => x.id === purchaseId);
    if (!p) return undefined;
    const paid = p.amount_paid != null ? p.amount_paid : p.total;
    const due = Math.max(0, p.total - paid);
    const amt = Math.round(Math.min(Math.max(Number(amount) || 0, 0), due) * 100) / 100;
    if (amt <= 0) throw new Error("nothing to settle");
    if (!db.purchasePayments) db.purchasePayments = [];
    const now = new Date().toISOString();
    db.purchasePayments.push({
      id: uid("pp"), clinic_id: null, purchase_id: p.id, company_id: p.company_id ?? null,
      amount: amt, method, note: note?.trim() || null, paid_at: now, staff_id: null, created_at: now,
    });
    p.amount_paid = Math.round((paid + amt) * 100) / 100;
    p.status = p.amount_paid >= p.total ? "paid" : p.amount_paid <= 0 ? "unpaid" : "partial";
    saveDB(db);
    return p;
  },
  /** هل قاعدة البيانات تدعم دفتر ديون المورّدين (ترحيل 0076)؟ */
  /** ترتيب «بدون صنف»: كل توأمٍ لقطعةٍ مصنَّفة يُدمج بأصله — العدد يُجمع،
   *  والأصل يكسب الباركود إن كان بلا باركود، والتاريخ يتبع الأصل. */
  async tidyInventory(): Promise<{ merged: number; kept: number }> {
    const db = loadDB();
    const items = db.purchaseItems ?? [];
    const inv = db.invoiceItems ?? [];
    let merged = 0, kept = 0;
    for (const dup of [...(db.products ?? [])].filter((p) => !p.section_id)) {
      const code = invNormCode(dup.barcode);
      const name = invNormName(dup.name);
      let target =
        (code ? db.products.find((p) => p.id !== dup.id && p.section_id && invNormCode(p.barcode) === code && (p.barcode ?? "") !== "") : undefined)
        ?? (name.length >= 2
          ? db.products.find((p) => p.id !== dup.id && p.section_id
              && (p.company_id ?? null) === (dup.company_id ?? null)
              && invNormName(p.name) === name)
          : undefined);
      if (!target) { kept++; continue; }
      target.stock = Math.max(0, (target.stock || 0) + Math.max(0, dup.stock || 0));
      if (!target.barcode && dup.barcode) target.barcode = dup.barcode;
      if (!target.expiry_date && dup.expiry_date) target.expiry_date = dup.expiry_date;
      for (const it of items) if (it.product_id === dup.id) it.product_id = target.id;
      for (const it of inv) if ((it as { product_id?: string | null }).product_id === dup.id) (it as { product_id?: string | null }).product_id = target.id;
      db.products = db.products.filter((p) => p.id !== dup.id);
      merged++;
    }
    saveDB(db);
    return { merged, kept };
  },

  async supportsSupplierLedger(): Promise<boolean> {
    return true;
  },

  async listInvoices(_clinicId?: string, range?: DateRange): Promise<Invoice[]> {
    return within(loadDB().invoices ?? [], "created_at", range).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async checkout(items: CheckoutItem[]): Promise<Invoice> {
    return createInvoiceLocal(items);
  },

  /* ---------------- Delivery (التوصيل — الدفع عند الاستلام) ---------------- */
  async listCouriers(_clinicId?: string): Promise<Courier[]> {
    return (loadDB().couriers ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  async createCourier(input: Omit<Courier, "id" | "created_at">): Promise<Courier> {
    const db = loadDB();
    if (!db.couriers) db.couriers = [];
    const c: Courier = { ...input, id: uid("cur"), created_at: new Date().toISOString() };
    db.couriers.push(c);
    saveDB(db);
    return c;
  },
  async updateCourier(id: string, patch: Partial<Courier>): Promise<Courier | undefined> {
    const db = loadDB();
    const c = (db.couriers ?? []).find((x) => x.id === id);
    if (!c) return undefined;
    Object.assign(c, patch);
    saveDB(db);
    return c;
  },
  async listDeliveryOrders(_clinicId?: string): Promise<DeliveryOrder[]> {
    return (loadDB().deliveryOrders ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createDeliveryOrder(input: Omit<DeliveryOrder, "id" | "created_at">): Promise<DeliveryOrder> {
    const db = loadDB();
    if (!db.deliveryOrders) db.deliveryOrders = [];
    const o: DeliveryOrder = { ...input, id: uid("dlv"), created_at: new Date().toISOString() };
    db.deliveryOrders.push(o);
    saveDB(db);
    return o;
  },
  async updateDeliveryOrder(id: string, patch: Partial<DeliveryOrder>): Promise<DeliveryOrder | undefined> {
    const db = loadDB();
    const o = (db.deliveryOrders ?? []).find((x) => x.id === id);
    if (!o) return undefined;
    Object.assign(o, patch);
    saveDB(db);
    return o;
  },

  /* ---------------- Retail & advanced invoicing ---------------- */
  async retailCheckout(items: CheckoutItem[], meta: SaleMeta): Promise<Invoice> {
    return createInvoiceLocal(items, meta);
  },
  /** إرجاعٌ خالص — مرآةُ `retail_return` (هجرة 0132) بنفس قواعدها حرفياً:
   *  ما تُنشأ فاتورة، والبضاعة ترجع للرصيد، وسحبٌ منفصل لكل صنف. */
  async retailReturn(items: CheckoutItem[], meta: ReturnMeta): Promise<RetailReturnResult> {
    const method: ExpenseMethod = meta.method === "card" ? "card" : meta.method === "transfer" || meta.method === "bank" ? "bank" : "cash";
    const db = loadDB();
    let total = 0, lines = 0;
    const at = new Date().toISOString();
    for (const it of items) {
      const qty = Math.abs(Number(it.qty) || 0);
      if (qty === 0) continue;
      const stockQty = Math.abs(Number(it.stock_qty ?? qty) || 0);
      const price = Math.abs(Number(it.unit_price) || 0);
      const amount = Math.round(qty * price * 100) / 100;

      if (it.product_id) {
        const p = db.products.find((x) => x.id === it.product_id);
        if (p) p.stock = Math.round(((p.stock ?? 0) + stockQty) * 1000) / 1000;
      }
      if (amount > 0) {
        const qtyTxt = qty === 1 ? "" : ` \u00d7 ${String(qty)}`;
        const who = meta.customer_name?.trim() ? ` \u2014 ${meta.customer_name.trim()}` : "";
        const note = meta.note?.trim() ? ` (${meta.note.trim()})` : "";
        demoAddExpense({
          amount,
          description: `\u0631\u0627\u062c\u0639: ${it.name || "\u0635\u0646\u0641"}${qtyTxt}${who}${note}`,
          category: "\u0645\u0631\u062a\u062c\u0639",
          method, spent_at: at,
        });
        total += amount;
      }
      lines += 1;
    }
    if (lines === 0) throw new Error("no items");
    saveDB(db);
    return { total: Math.round(total * 100) / 100, lines, method };
  },
  async listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return (loadDB().invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
  },
  async listAllInvoiceItems(_clinicId?: string, range?: DateRange): Promise<InvoiceItem[]> {
    // البنود التجريبية ما بيها تاريخ خاص، فترث تاريخ فاتورتها — نفس ما تفعله
    // هجرة 0133 بالسحابة، حتى تتطابق النسختان بالنتيجة لا بالشكل وحده.
    const db = loadDB();
    const items = db.invoiceItems ?? [];
    if (!range?.from && !range?.to) return items.slice();
    const at = new Map((db.invoices ?? []).map((i) => [i.id, i.created_at]));
    return items.filter((it) => {
      const d = (it as { created_at?: string }).created_at ?? at.get(it.invoice_id) ?? "";
      return (!range.from || d >= range.from) && (!range.to || d <= range.to);
    });
  },
  async refundInvoice(invoiceId: string): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status !== "refunded") {
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) restockLocal(db, it);
      inv.status = "refunded";
      inv.refunded_at = new Date().toISOString();
      saveDB(db);
    }
    return inv;
  },
  async deleteInvoice(invoiceId: string): Promise<void> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    // Restock unless it was already refunded (which already restocked).
    if (inv && inv.status !== "refunded") {
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) restockLocal(db, it);
    }
    db.invoices = (db.invoices ?? []).filter((x) => x.id !== invoiceId);
    db.invoiceItems = (db.invoiceItems ?? []).filter((x) => x.invoice_id !== invoiceId);
    saveDB(db);
    // Mirror the server audit trigger so the demo's security log shows deletions.
    if (inv) demoAuditPush({ action: "DELETE", entity: "invoices", entity_id: invoiceId, details: inv as unknown as Record<string, unknown> });
  },
  /** Record a debt installment: add `amount` to what's been paid (never above the total),
   *  appending a payment leg. Once amount_paid reaches the total the sale is fully settled. */
  /* ---- تعديل أصناف فاتورة قائمة (0110) — للطلبات التي تُعدَّل بعد إصدارها،
   * وأشهر حالتها: زبون التوصيل يتصل بعد دقائق ليضيف صنفاً أو يغيّر كمية.
   *
   * القاعدة الحاكمة: **لا ينزلق مخزون ولا نقد**. لذلك التعديل يتم بعكس كامل
   * ثم إعادة خصم — لا بتعديل تفاضلي هشّ:
   *   ١) كل سطر قائم يُعاد للمخزون بنفس التقسيم الذي خرج به (حصّة القسم
   *      المشترك تعود للقسم، والباقي لرصيد المنتج) عبر restockLocal نفسها.
   *   ٢) تُحذف الأسطر القديمة وتُخصم الأسطر الجديدة بنفس منطق البيع تماماً
   *      (المخزون المعروف أولاً ثم مخزون القسم).
   *   ٣) المدفوع لا يُلمَس أبداً؛ يُعاد حساب الإجمالي والربح، ويُحدَّث المبلغ
   *      المطلوب من السواق = الإجمالي الجديد − المدفوع.
   * فاتورة مرتجعة لا تُعدَّل: سجلّها مغلق والطريق الصحيح إرجاعٌ جديد. ---- */
  async editInvoiceLines(invoiceId: string, lines: EditLine[], note?: string | null): Promise<Invoice> {
    const money2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = (lines ?? [])
      .map((l) => ({ ...l, qty: Math.round((Number(l.qty) || 0) * 1000) / 1000, unit_price: Math.max(0, Number(l.unit_price) || 0), unit_cost: Math.max(0, Number(l.unit_cost) || 0) }))
      .filter((l) => l.qty > 0);
    if (!clean.length) throw new Error("empty invoice");

    const oldTotal = Number(inv.total) || 0;
    const before = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
    // ١) العكس الكامل — نفس دالة الإرجاع حرفياً فلا يختلف حسابان للمخزون أبداً.
    for (const it of before) restockLocal(db, it);
    db.invoiceItems = (db.invoiceItems ?? []).filter((x) => x.invoice_id !== invoiceId);

    // ٢) إعادة الخصم بنفس منطق البيع (المعروف أولاً ثم القسم المشترك).
    const r3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    for (const i of clean) {
      const prev = i.id ? before.find((b) => b.id === i.id) : undefined;
      // سطر قائم بكمية معدّلة: نسبة المخزون تتبع الكمية (بيع الأجزاء).
      const perUnit = prev && prev.qty > 0 && prev.stock_qty != null ? prev.stock_qty / prev.qty : 1;
      // الواجهة تمرّر المسحوب صراحةً للأسطر الجديدة ببيع الأجزاء؛ وإلا نستنتجه
      // من نسبة السطر القديم — فلا ينزلق المخزون عند تغيير كمية حبّات.
      const stockQty = i.stock_qty != null ? r3(i.stock_qty) : r3(i.qty * perUnit);
      let fromPool = 0;
      if (i.product_id) {
        const p = (db.products ?? []).find((x) => x.id === i.product_id);
        if (p) {
          const avail = r3((p.stock || 0) + (p.section_id ? ((db.companySections ?? []).find((x) => x.id === p.section_id)?.pooled_stock ?? 0) : 0));
          if (stockQty > avail + 0.0005) throw new Error(`not enough stock: ${i.name}`);
          let rem = stockQty;
          const fromStock = Math.min(rem, Math.max(0, p.stock || 0));
          if (fromStock > 0) { p.stock = r3(p.stock - fromStock); rem -= fromStock; }
          if (rem > 0 && p.section_id) {
            const sec = (db.companySections ?? []).find((x) => x.id === p.section_id);
            const pool = sec?.pooled_stock ?? 0;
            if (sec && pool > 0) { fromPool = Math.min(rem, pool); sec.pooled_stock = r3(pool - fromPool); rem -= fromPool; }
          }
        }
      }
      db.invoiceItems.push({
        id: i.id && prev ? i.id : uid("ii"), invoice_id: invoiceId, product_id: i.product_id ?? null,
        name: i.name, barcode: i.barcode ?? null, qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost,
        line_total: r2(i.qty * i.unit_price), stock_qty: stockQty, pooled_qty: fromPool, unit_label: i.unit_label ?? null,
      });
    }

    // ٣) إعادة الحساب — الخصم ورسوم التوصيل كما هي، والمدفوع لا يُمَس.
    const subtotal = r2(clean.reduce((s, l) => s + l.qty * l.unit_price, 0));
    const cost = r2(clean.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    const discount = Math.max(0, Number(inv.discount) || 0);
    // أجرة التوصيل ليست عموداً بالفاتورة بل سطراً داخلها («أجرة توصيل»)، فهي
    // محسوبة ضمن المجموع الفرعي تلقائياً — ولا تُجمع مرتين.
    inv.subtotal = subtotal;
    inv.total = Math.max(0, r2(subtotal - discount));
    inv.cost_total = cost;
    inv.profit = r2(inv.total - cost);
    inv.item_count = clean.reduce((n, l) => n + l.qty, 0);
    const paid = inv.amount_paid != null ? inv.amount_paid : 0;
    // المدفوع أكبر من الإجمالي الجديد (نقص أصناف بعد الدفع) → يبقى كما هو
    // ويظهر كفائض للزبون؛ لا نتصرّف بنقد الزبون تلقائياً.
    const cod = Math.max(0, r2(inv.total - paid));
    // الطلب المستلم أو الراجع سجلٌّ مالي مغلق — لا يُعاد حساب مستحقّه.
    const ord = (db.deliveryOrders ?? []).find((o) => o.invoice_id === invoiceId && (o.status === "preparing" || o.status === "out"));
    if (ord) ord.cod_amount = cod;
    // أثر المراجعة: سجل الحركات يلتقط الفعل آلياً (DEMO_ACTIVITY_MAP / محفّزات
    // السيرفر)، وسببُ التعديل يُختم داخل الفاتورة نفسها فيبقى ملازماً لها
    // ويظهر بطباعتها — تعديل مالٍ بلا سبب مكتوب بابُ سرقة.
    const stamp = `تعديل ${new Date().toLocaleDateString("en-CA")}: ${before.length}→${clean.length} سطر · ${money2(oldTotal)} ← ${money2(inv.total)}${note ? ` · ${String(note).trim().slice(0, 120)}` : ""}`;
    inv.notes = inv.notes ? `${inv.notes}\n${stamp}` : stamp;
    saveDB(db);
    return inv;
  },
  /** المرتجع (0121): إرجاع أصنافٍ محددة بكمياتها — المخزون يرجع بنفس تقسيمه
   *  وقت البيع، الفاتورة يُعاد حسابها، والنقد الخارج فعلاً يُسجَّل سطراً
   *  سالباً (نفس آلية تصحيح التحصيل). إرجاع الكل = refund كامل بدلالاته. */
  async returnInvoiceItems(invoiceId: string, returns: { item_id: string; qty: number }[], method?: PaymentMethod | null, note?: string | null): Promise<Invoice> {
    const money2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const wanted = new Map((returns ?? []).filter((x) => x && x.qty > 0).map((x) => [x.item_id, r3(x.qty)]));
    if (!wanted.size) throw new Error("nothing to return");
    const items = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);

    // إرجاع كامل؟ ⇒ نفس دلالات refundInvoice: استرجاع الكل وقلب الحالة فقط.
    const full = items.length > 0 && items.every((it) => (wanted.get(it.id) ?? 0) + 0.0005 >= it.qty);
    if (full) {
      for (const it of items) restockLocal(db, it);
      inv.status = "refunded";
      inv.refunded_at = new Date().toISOString();
      saveDB(db);
      return inv;
    }

    for (const it of items) {
      const retQty = Math.min(wanted.get(it.id) ?? 0, it.qty);
      if (retQty <= 0) continue;
      // المخزون بنسب البيع نفسها: المسحوب لكل وحدة، وحصة القسم نسبية.
      if (it.product_id) {
        const per = it.qty > 0 && it.stock_qty != null ? it.stock_qty / it.qty : 1;
        const retStock = r3(retQty * per);
        let retPool = r3((it.pooled_qty ?? 0) * (retQty / it.qty));
        const p = (db.products ?? []).find((x) => x.id === it.product_id);
        if (p) {
          const sec = retPool > 0 && p.section_id ? (db.companySections ?? []).find((s) => s.id === p.section_id) : undefined;
          if (sec) sec.pooled_stock = r3((sec.pooled_stock ?? 0) + retPool);
          else retPool = 0;
          p.stock = r3(p.stock + (retStock - retPool));
        }
        if (retQty + 0.0005 >= it.qty) {
          db.invoiceItems = db.invoiceItems.filter((x) => x.id !== it.id);
        } else {
          it.qty = r3(it.qty - retQty);
          it.line_total = r2(it.qty * it.unit_price);
          if (it.stock_qty != null) it.stock_qty = r3(it.stock_qty - retStock);
          if (it.pooled_qty != null) it.pooled_qty = r3(it.pooled_qty - retPool);
        }
      } else if (retQty + 0.0005 >= it.qty) {
        db.invoiceItems = db.invoiceItems.filter((x) => x.id !== it.id);
      } else {
        it.qty = r3(it.qty - retQty);
        it.line_total = r2(it.qty * it.unit_price);
      }
    }

    // إعادة الحساب — الخصم الثابت يبقى كما هو.
    const left = (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
    const subtotal = r2(left.reduce((s, l) => s + l.line_total, 0));
    const discount = Math.max(0, Number(inv.discount) || 0);
    const oldTotal = Number(inv.total) || 0;
    inv.subtotal = subtotal;
    inv.total = Math.max(0, r2(subtotal - discount));
    inv.cost_total = r2(left.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    inv.profit = r2(inv.total - inv.cost_total);
    inv.item_count = left.reduce((n, l) => n + l.qty, 0);

    // النقد الخارج فعلاً = المدفوع فوق الإجمالي الجديد. آجلة ⇒ الدين ينقص وحده.
    const paid = inv.amount_paid != null ? inv.amount_paid : inv.total;
    const back = Math.max(0, r2(paid - inv.total));
    if (back > 0) {
      const legs = [...(inv.payment_details ?? [])];
      const dominant = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
      const m = (method ?? dominant ?? inv.payment_method ?? "cash") as PaymentMethod;
      const posSum = r2(legs.filter((l) => l.amount > 0).reduce((s2, l) => s2 + l.amount, 0));
      if (posSum < paid) legs.push({ method: (inv.payment_method ?? m) as PaymentMethod, amount: r2(paid - posSum), at: inv.created_at });
      // ختم «مرتجع» بمهارب يونيكود: بياناتٌ تطابق ختم السيرفر حرفياً، لا نص واجهة.
      const label = "\u0645\u0631\u062A\u062C\u0639" + (note?.trim() ? `: ${note.trim().slice(0, 100)}` : "");
      legs.push({ method: m, amount: -back, at: new Date().toISOString(), note: label });
      inv.payment_details = legs;
      inv.amount_paid = Math.max(0, r2(paid - back));
      const pos = legs.filter((l) => l.amount > 0);
      if (pos.length) inv.payment_method = pos.reduce((b2, p2) => (p2.amount > b2.amount ? p2 : b2), pos[0]).method;
    }

    // «مرتجع … أُعيد نقداً …» بمهارب يونيكود — ختمٌ يطابق ختم دالّة السيرفر (0121).
    const RET_WORD = "\u0645\u0631\u062A\u062C\u0639";
    const BACK_WORDS = "\u0623\u064F\u0639\u064A\u062F \u0646\u0642\u062F\u0627\u064B";
    const stamp = `${RET_WORD} ${new Date().toLocaleDateString("en-CA")}: ${money2(oldTotal)} ← ${money2(inv.total)}${back > 0 ? ` · ${BACK_WORDS} ${money2(back)}` : ""}${note?.trim() ? ` · ${note.trim().slice(0, 120)}` : ""}`;
    inv.notes = inv.notes ? `${inv.notes}\n${stamp}` : stamp;
    saveDB(db);
    return inv;
  },
  async settleInvoice(invoiceId: string, amount: number, method: PaymentMethod = "cash"): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    // Match the server RPC's contract so demo and production behave identically.
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const paid = inv.amount_paid != null ? inv.amount_paid : inv.total;
    const add = Math.max(0, Math.min(Math.round((Number(amount) || 0) * 100) / 100, Math.round((inv.total - paid) * 100) / 100));
    if (add > 0) {
      inv.amount_paid = Math.round((paid + add) * 100) / 100;
      // Stamp the settlement with the collection time so the money reports date it on
      // the day it was actually received, not the original invoice day.
      const legs = [...(inv.payment_details ?? []), { method, amount: add, at: new Date().toISOString() }];
      inv.payment_details = legs;
      inv.payment_method = legs.reduce((b, p) => (p.amount > b.amount ? p : b), legs[0]).method;
      saveDB(db);
    }
    return inv;
  },
  async bumpInvoicePrints(invoiceId: string): Promise<number> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return 0;
    inv.print_count = (inv.print_count ?? 0) + 1;
    saveDB(db);
    return inv.print_count;
  },
  /** Correct a cashier's payment-method mistake on an existing invoice. Keeps a single
   *  settled leg in sync so print/analytics agree; refunded sales are locked. */
  async setInvoicePaymentMethod(invoiceId: string, method: PaymentMethod): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status === "refunded") throw new Error("invoice refunded");
    inv.payment_method = method;
    if (inv.payment_details && inv.payment_details.length === 1) {
      inv.payment_details = [{ ...inv.payment_details[0], method }];
    }
    saveDB(db);
    return inv;
  },
  /** Rewrite a split payment's legs (correct a mis-keyed method / re-allocate the
   *  breakdown). Only the method×amount split changes — the total collected
   *  (amount_paid) and the debt math are untouched; the caller guarantees the legs
   *  sum to what was already received. */
  async setInvoicePaymentDetails(invoiceId: string, legs: PaymentSplit[]): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return undefined;
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = legs.filter((l) => l && l.method && Number(l.amount) > 0);
    if (clean.length) {
      // سطور التصحيح (السالبة) تُحفظ كما هي: إعادة توزيع السِّيَق تخصّ ما
      // وصل فعلاً، وإسقاطُ عكسٍ سابق هنا يعيد للفاتورة مالاً لم يصل.
      const fixes = (inv.payment_details ?? []).filter((l) => Number(l.amount) < 0);
      inv.payment_details = [...clean, ...fixes];
      inv.payment_method = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
      saveDB(db);
    }
    return inv;
  },
  /** تصحيح تحصيل (0113): مالٌ سُجّل واصلاً ولم يصل. الفاتورة لا تتغيّر —
   *  يُضاف سطر تحصيلٍ سالب فينزل المدفوع ويظهر الباقي ديناً تلقائياً.
   *  الحُرّاس هنا نسخة طبق الأصل من حُرّاس دالة الخادم: حارسٌ لا يوجد
   *  بالوضع التجريبي هو حارسٌ لم يُفحص. */
  async correctInvoiceReceipt(invoiceId: string, amount: number, reason: string, method?: PaymentMethod | null): Promise<Invoice | undefined> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const who = (inv.customer_name ?? "").trim() || (inv.customer_phone ?? "").trim();
    if (!who) throw new Error("customer required");
    const cut = round2(Number(amount));
    if (!(cut > 0)) throw new Error("bad amount");
    if (cut > paidOf(inv)) throw new Error("above collected");

    const legs = [...(inv.payment_details ?? [])];
    const dominant = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
    const m = (method ?? dominant ?? inv.payment_method ?? "cash") as PaymentMethod;
    // البيعة البسيطة تُخزَّن بلا سِيَق، والتقارير تشتقّ منها ساقاً ضمنية ما
    // دامت المصفوفة فارغة. إضافةُ السالب فوق الفراغ تُسقط تلك الضمنية فيبقى
    // سالبٌ وحده. نُثبّت الأصل صراحةً أولاً ثم نعكس عليه.
    const posSum = round2(legs.filter((l) => l.amount > 0).reduce((s2, l) => s2 + l.amount, 0));
    const wasPaid = paidOf(inv);
    if (posSum < wasPaid) {
      legs.push({ method: (inv.payment_method ?? m) as PaymentMethod, amount: round2(wasPaid - posSum), at: inv.created_at });
    }
    // السبب اختياري — ويُكتَب مفتاحاً حين يوجد وحده (كما بدالّة الخادم).
    const why = (reason ?? "").trim();
    inv.payment_details = [...legs, { method: m, amount: -cut, at: new Date().toISOString(), ...(why ? { note: why } : {}) }];
    inv.amount_paid = Math.max(0, round2(wasPaid - cut));
    const pos = inv.payment_details.filter((l) => l.amount > 0);
    if (pos.length) inv.payment_method = pos.reduce((b, p) => (p.amount > b.amount ? p : b), pos[0]).method;
    saveDB(db);
    return inv;
  },
  /** Distinct walk-in customers seen on past invoices, most-recent first. */
  async searchCustomers(query: string, _clinicId?: string): Promise<Customer[]> {
    return dedupeCustomers(loadDB().invoices ?? [], query);
  },

  /* ---- Cash expenses / withdrawals ledger ---- */
  async listExpenses(_clinicId?: string, range?: DateRange): Promise<Expense[]> {
    return within(demoExpensesLoad(), "spent_at", range).sort((a, b) => b.spent_at.localeCompare(a.spent_at));
  },
  async addExpense(input: Omit<Expense, "id" | "created_at">): Promise<Expense> {
    return demoAddExpense(input);
  },
  async deleteExpense(id: string): Promise<void> {
    const before = demoExpensesLoad();
    const row = before.find((x) => x.id === id);
    demoExpensesSave(before.filter((x) => x.id !== id));
    if (row) demoAuditPush({ action: "DELETE", entity: "expenses", entity_id: id, details: row as unknown as Record<string, unknown> });
  },

  /* ---- الرواتب (0112) — الوضع التجريبي يفرض حُرّاس الخادم نفسها ---- */
  async getPayrollPolicy(): Promise<PayrollPolicyDTO> { return PD.getPolicy(); },
  async setPayrollPolicy(p: PayrollPolicyDTO): Promise<PayrollPolicyDTO> { return PD.setPolicy(p); },
  async listStaffComp(): Promise<StaffComp[]> { return PD.listComp(); },
  async setStaffComp(staffId: string, from: string, base: number, note?: string | null): Promise<StaffComp> {
    return PD.setComp(staffId, from, base, note);
  },
  async deleteStaffComp(id: string): Promise<void> { PD.deleteComp(id); },
  async listStaffRecurring(): Promise<StaffRecurring[]> { return PD.listRecurring(); },
  async addStaffRecurring(staffId: string, code: string, amount: number, note?: string | null): Promise<StaffRecurring> {
    return PD.addRecurring(staffId, code, amount, note);
  },
  async deleteStaffRecurring(id: string): Promise<void> { PD.deleteRecurring(id); },
  async listPayrollAdjustments(period?: string): Promise<PayrollAdjustment[]> { return PD.listAdjustments(period); },
  async addPayrollAdjustment(staffId: string, period: string, code: string, amount?: number | null, qty?: number | null, reason?: string | null): Promise<PayrollAdjustment> {
    return PD.addAdjustment(staffId, period, code, amount, qty, reason);
  },
  async deletePayrollAdjustment(id: string): Promise<void> { PD.deleteAdjustment(id); },
  async reversePayrollAdjustment(id: string, amount?: number | null, qty?: number | null, reason?: string | null): Promise<PayrollAdjustment> {
    return PD.reverseAdjustment(id, amount, qty, reason);
  },
  async unpayPayslip(slipId: string): Promise<Payslip> {
    return PD.unpaySlip(slipId, async (id) => { await this.deleteExpense(id); });
  },
  async listPayrollRuns(): Promise<PayrollRun[]> { return PD.listRuns(); },
  async openPayrollRun(period: string): Promise<PayrollRun> { return PD.openRun(period); },
  async savePayrollSlips(runId: string, slips: PayslipDraft[]): Promise<{ run: string; payslips: number }> {
    return PD.saveSlips(runId, slips);
  },
  async listPayslips(runId?: string): Promise<Payslip[]> { return PD.listSlips(runId); },
  async listPayslipLines(payslipIds?: string[]): Promise<PayslipLine[]> { return PD.listLines(payslipIds); },
  async approvePayrollRun(runId: string): Promise<PayrollRun> { return PD.approveRun(runId); },
  async payPayslip(slipId: string, method: PayMethod): Promise<Payslip> {
    return PD.paySlip(slipId, method, async (e) => demoAddExpense(e));
  },
  async closePayrollRun(runId: string): Promise<PayrollRun> { return PD.closeRun(runId); },
  async listStaffLoans(): Promise<StaffLoan[]> { return PD.listLoans(); },
  async listLoanEvents(loanId?: string): Promise<StaffLoanEvent[]> { return PD.listLoanEvents(loanId); },
  async disburseLoan(staffId: string, staffName: string, principal: number, installment: number, reason: string | null, method: PayMethod): Promise<StaffLoan> {
    return PD.disburseLoan(staffId, staffName, principal, installment, reason, method, async (e) => demoAddExpense(e));
  },
  /** سحبٌ على حساب الشهر: سلفةٌ قسطُها أصلُها، تُقطع كاملةً بأقرب قسيمة (0140). */
  async disburseAdvance(staffId: string, staffName: string, amount: number, reason: string | null, method: PayMethod): Promise<StaffLoan> {
    return PD.disburseLoan(staffId, staffName, amount, amount, reason, method, async (e) => demoAddExpense(e), "advance");
  },
  async writeOffLoan(loanId: string, note: string): Promise<StaffLoan> { return PD.writeOffLoan(loanId, note); },

  /** Log a WhatsApp message send (campaign history / "last contacted"). */
  async logWhatsApp(input: { pet_id?: string | null; owner_name?: string | null; owner_phone?: string | null; reminder_type?: string | null }): Promise<void> {
    const db = loadDB();
    if (!db.waMessages) db.waMessages = [];
    db.waMessages.push({ ...input, id: uid("wa"), sent_at: new Date().toISOString() });
    saveDB(db);
  },
  /** The clinic's WhatsApp send history, newest first. */
  async listWhatsAppLog(): Promise<WhatsAppMessage[]> {
    return (loadDB().waMessages ?? []).slice().sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  },
  async listAuditLog(_clinicId?: string, limit = 200): Promise<AuditEntry[]> {
    return demoAuditLoad().slice(0, limit);
  },
  /** Drop this clinic's activity older than 30 days (fire-and-forget from the log page). */
  async purgeAuditLog(): Promise<void> {
    demoAuditPurge();
  },
  /** Record a client-side action (print / export) in the activity log. Best-effort. */
  async logClientEvent(event: string, details?: Record<string, unknown>): Promise<void> {
    demoAuditPush({ action: "CLIENT", entity: "client", entity_id: null, details: { ...(details ?? {}), event } });
  },
  async listLoginEvents(_clinicId?: string, limit = 100): Promise<LoginEvent[]> {
    return demoLoginLoad().slice(0, limit);
  },
  async logLogin(input: { email?: string | null; name?: string | null }): Promise<void> {
    const e: LoginEvent = { id: uid("lg"), clinic_id: null, user_id: null, email: input.email ?? null, name: input.name ?? null, created_at: new Date().toISOString() };
    demoLoginSave([e, ...demoLoginLoad()].slice(0, 100));
  },
};

/* Demo-only activity mirror: on Supabase, DB triggers (migrations 0018 + 0044)
 * record every INSERT/UPDATE/DELETE automatically. In demo mode we wrap the
 * mutating repo methods ONCE so the clinic activity log fills up identically —
 * offline and testable. Logging failures never break the real operation. */
const DEMO_ACTIVITY_MAP: Record<string, { entity: string; action: "INSERT" | "UPDATE" | "DELETE" }> = {
  createPet: { entity: "pets", action: "INSERT" },
  updatePet: { entity: "pets", action: "UPDATE" },
  deletePet: { entity: "pets", action: "DELETE" },
  addWeight: { entity: "weight_logs", action: "INSERT" },
  addVaccination: { entity: "vaccinations", action: "INSERT" },
  addVisit: { entity: "medical_visits", action: "INSERT" },
  addPetNote: { entity: "pet_notes", action: "INSERT" },
  addLabResult: { entity: "lab_results", action: "INSERT" },
  deleteLabResult: { entity: "lab_results", action: "DELETE" },
  advanceLabStatus: { entity: "lab_results", action: "UPDATE" },
  createDeviceLink: { entity: "lab_device_links", action: "INSERT" },
  createJourney: { entity: "journeys", action: "INSERT" },
  advanceJourney: { entity: "journeys", action: "UPDATE" },
  addJourneyNote: { entity: "journey_events", action: "INSERT" },
  closeJourney: { entity: "journeys", action: "UPDATE" },
  revokeDeviceLink: { entity: "lab_device_links", action: "UPDATE" },
  addCareEntry: { entity: "care_entries", action: "INSERT" },
  deleteCareEntry: { entity: "care_entries", action: "DELETE" },
  addProblem: { entity: "pet_problems", action: "INSERT" },
  updateProblem: { entity: "pet_problems", action: "UPDATE" },
  addFeatureRequest: { entity: "feature_requests", action: "INSERT" },
  updateFeatureRequest: { entity: "feature_requests", action: "UPDATE" },
  addGeneratedBarcodes: { entity: "generated_barcodes", action: "INSERT" },
  updateGeneratedBarcode: { entity: "generated_barcodes", action: "UPDATE" },
  saveStoreProfile: { entity: "store_profiles", action: "UPDATE" },
  updateStoreOrder: { entity: "store_orders", action: "UPDATE" },
  placeStoreOrder: { entity: "store_orders", action: "INSERT" },
  deleteProblem: { entity: "pet_problems", action: "DELETE" },
  addClinicVisit: { entity: "clinic_visits", action: "INSERT" },
  updateClinicVisit: { entity: "clinic_visits", action: "UPDATE" },
  addExpense: { entity: "expenses", action: "INSERT" },
  setStaffComp: { entity: "staff_comp", action: "INSERT" },
  deleteStaffComp: { entity: "staff_comp", action: "DELETE" },
  openPayrollRun: { entity: "payroll_runs", action: "INSERT" },
  savePayrollSlips: { entity: "payslips", action: "INSERT" },
  approvePayrollRun: { entity: "payroll_runs", action: "UPDATE" },
  payPayslip: { entity: "payslips", action: "UPDATE" },
  unpayPayslip: { entity: "payslips", action: "UPDATE" },
  addPayrollAdjustment: { entity: "payroll_adjustments", action: "INSERT" },
  deletePayrollAdjustment: { entity: "payroll_adjustments", action: "DELETE" },
  reversePayrollAdjustment: { entity: "payroll_adjustments", action: "UPDATE" },
  closePayrollRun: { entity: "payroll_runs", action: "UPDATE" },
  disburseLoan: { entity: "staff_loans", action: "INSERT" },
  disburseAdvance: { entity: "staff_loans", action: "INSERT" },
  attachProductCode: { entity: "products", action: "UPDATE" },
  writeOffLoan: { entity: "staff_loans", action: "UPDATE" },
  setPayrollPolicy: { entity: "payroll_settings", action: "UPDATE" },
  addMedia: { entity: "media_items", action: "INSERT" },
  addTreatment: { entity: "treatment_entries", action: "INSERT" },
  addTreatments: { entity: "treatment_entries", action: "INSERT" },
  setTreatmentGiven: { entity: "treatment_entries", action: "UPDATE" },
  setTreatmentResult: { entity: "treatment_entries", action: "UPDATE" },
  updateTreatment: { entity: "treatment_entries", action: "UPDATE" },
  setTreatmentMissed: { entity: "treatment_entries", action: "UPDATE" },
  deleteTreatment: { entity: "treatment_entries", action: "DELETE" },
  addAdmission: { entity: "admissions", action: "INSERT" },
  addSurgery: { entity: "surgeries", action: "INSERT" },
  updateSurgery: { entity: "surgeries", action: "UPDATE" },
  deleteSurgery: { entity: "surgeries", action: "DELETE" },
  updateAdmission: { entity: "admissions", action: "UPDATE" },
  createBranch: { entity: "branches", action: "INSERT" },
  addReminder: { entity: "reminders", action: "INSERT" },
  createProduct: { entity: "products", action: "INSERT" },
  updateProduct: { entity: "products", action: "UPDATE" },
  deleteProduct: { entity: "products", action: "DELETE" },
  createCompany: { entity: "companies", action: "INSERT" },
  updateCompany: { entity: "companies", action: "UPDATE" },
  deleteCompany: { entity: "companies", action: "DELETE" },
  createCompanySection: { entity: "company_sections", action: "INSERT" },
  updateCompanySection: { entity: "company_sections", action: "UPDATE" },
  deleteCompanySection: { entity: "company_sections", action: "DELETE" },
  recordPurchase: { entity: "purchases", action: "INSERT" },
  updatePurchase: { entity: "purchases", action: "UPDATE" },
  createCourier: { entity: "couriers", action: "INSERT" },
  updateCourier: { entity: "couriers", action: "UPDATE" },
  createDeliveryOrder: { entity: "delivery_orders", action: "INSERT" },
  updateDeliveryOrder: { entity: "delivery_orders", action: "UPDATE" },
  checkout: { entity: "invoices", action: "INSERT" },
  retailCheckout: { entity: "invoices", action: "INSERT" },
  retailReturn: { entity: "expenses", action: "INSERT" },
  settleInvoice: { entity: "invoices", action: "UPDATE" },
  correctInvoiceReceipt: { entity: "invoices", action: "UPDATE" },
  editInvoiceLines: { entity: "invoices", action: "UPDATE" },
  returnInvoiceItems: { entity: "invoices", action: "UPDATE" },
  refundInvoice: { entity: "invoices", action: "UPDATE" },
  setInvoicePaymentMethod: { entity: "invoices", action: "UPDATE" },
  setInvoicePaymentDetails: { entity: "invoices", action: "UPDATE" },
  uploadMedia: { entity: "media_items", action: "INSERT" },
  updateVaccination: { entity: "vaccinations", action: "UPDATE" },
  createAppointment: { entity: "appointments", action: "INSERT" },
  updateAppointment: { entity: "appointments", action: "UPDATE" },
  setAppointmentStatus: { entity: "appointments", action: "UPDATE" },
  updateReminder: { entity: "reminders", action: "UPDATE" },
  removeReminder: { entity: "reminders", action: "DELETE" },
  updateBranch: { entity: "branches", action: "UPDATE" },
  logWhatsApp: { entity: "wa_messages", action: "INSERT" },
  settlePurchase: { entity: "purchases", action: "UPDATE" },
};
{
  const target = demoRepo as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const [method, meta] of Object.entries(DEMO_ACTIVITY_MAP)) {
    const orig = target[method];
    if (typeof orig !== "function") continue;
    target[method] = async (...args: unknown[]) => {
      const res = await orig.apply(demoRepo, args);
      try {
        const row = (res && typeof res === "object" ? res : (typeof args[0] === "object" && args[0] !== null ? args[0] : undefined)) as Record<string, unknown> | undefined;
        const entityId = (row && typeof row.id === "string" ? row.id : undefined) ?? (typeof args[0] === "string" ? args[0] : null);
        demoAuditPush({ action: meta.action, entity: meta.entity, entity_id: entityId, details: row ?? null });
        // Checkout also logs each sold LINE — mirroring the invoice_items trigger.
        if ((method === "checkout" || method === "retailCheckout") && Array.isArray(args[0])) {
          for (const it of args[0] as Array<Record<string, unknown>>) {
            const qty = Number(it.qty) || 0; const price = Number(it.unit_price) || 0;
            demoAuditPush({ action: "INSERT", entity: "invoice_items", entity_id: null, details: { ...it, line_total: Math.round(qty * price * 100) / 100 } });
          }
        }
      } catch { /* the log must never break the operation itself */ }
      return res;
    };
  }
}

/* ============================================================================
 * Live Supabase implementation — used automatically when VITE_SUPABASE_* are
 * set. The TS types already use snake_case, so DB rows map 1:1 (cast directly).
 * ==========================================================================*/
function sbc(): SupabaseClient {
  if (!supabase) throw new Error("[supabase] client is not configured");
  return supabase;
}
function listOf<T>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) { console.error("[supabase]", res.error.message); return []; }
  return (res.data ?? []) as T[];
}

/**
 * استعلام .in() على دفعات بدل مصفوفة واحدة غير محدودة.
 *
 * PostgREST يمرّر قائمة المعرفات داخل رابط الطلب، وكل uuid يستهلك ~٣٩ حرفاً
 * بعد الترميز. عيادة بـ٢٠٠+ حيوان تتجاوز حدود طول الرابط عند الوكيل الأمامي،
 * والرفض يرجع بلا ترويسات CORS فيظهر للطبيب «TypeError: Failed to fetch»
 * الغامضة — يعني الشاشة تعمل بالعيادة الصغيرة وتنكسر لمّا تكبر. مئة معرف
 * لكل دفعة ≈ ٤KB، بهامش مريح تحت أي حد شائع.
 */
const IN_CHUNK = 100;
async function inChunks<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  if (ids.length <= IN_CHUNK) return ids.length === 0 ? [] : query(ids);
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...await query(ids.slice(i, i + IN_CHUNK)));
  }
  return out;
}
/**
 * كسر سقف الألف: PostgREST يقصّ أي استعلام على 1000 صف افتراضياً — بصمت.
 *
 * العيادة الكبيرة تتجاوز ألف منتج/فاتورة، فتظهر أول ألفٍ فقط (بترتيب
 * الاستعلام) ويبدو ما بعدها «مختفياً»: الدكتور يضيف منتجاً ثم «ما يلگيه»،
 * والبيع يرفض باركوداً موجوداً فعلاً لأنه خارج الألف المقروءة. هذا المساعد
 * يسحب صفحات كاملة حتى النهاية، بترتيب ثابت (ترتيب الاستعلام + id كاسر
 * تعادل) كي لا يتكرر صف بين صفحتين ولا يسقط.
 */
const PAGE_ROWS = 1000;

/** مدى تاريخٍ اختياريّ للقراءات الثقيلة (ISO). حين يُمرَّر يُفلتَر **بالقاعدة**
 *  بدل أن تنزل كل صفوف العيادة ثم يرمي المتصفح ما هو خارج المدى — الفلتر
 *  نفسه، ومكانه هو ما تغيّر. */
export interface DateRange { from?: string | null; to?: string | null }

/** نظيرُ `inRange` بالوضع التجريبي: يصفّي مصفوفةً على عمودٍ زمنيّ. */
function within<T>(rows: T[], col: string, r?: DateRange): T[] {
  if (!r?.from && !r?.to) return rows.slice();
  return rows.filter((x) => {
    const d = String((x as Record<string, unknown>)[col] ?? "");
    return (!r.from || d >= r.from) && (!r.to || d <= r.to);
  });
}

/** يشدّ استعلاماً على عمودٍ زمنيّ بالمدى المطلوب. بلا مدى يمرّ كما هو، فتبقى
 *  كل النداءات القائمة على سلوكها السابق حرفياً. */
function inRange<T>(q: T, col: string, r?: DateRange): T {
  const x = q as unknown as { gte(c: string, v: string): T; lte(c: string, v: string): T };
  let out = q;
  if (r?.from) out = x.gte(col, r.from);
  if (r?.to) out = (out as unknown as typeof x).lte(col, r.to);
  return out;
}
async function allPages<T>(make: () => unknown): Promise<T[]> {
  type Q = {
    order: (c: string, o: { ascending: boolean }) => Q;
    range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const out: T[] = [];
  // نتقدّم بما **وصل** لا بما **طُلب**، ونتوقّف عند صفحةٍ فارغة لا عند صفحةٍ ناقصة.
  //
  // الشرط القديم كان `rows.length < PAGE_ROWS ⇒ انتهت البيانات`، وهو يفترض أن
  // الخادم يعطي دائماً ما طُلب. لكن PostgREST عنده سقفُ صفوفٍ خاصٌّ به لكل طلب،
  // فإن كان أقلّ من ألف رجعت الصفحةُ الأولى ناقصةً فظنّها الكودُ الأخيرة — فيتوقّف
  // عند الحدّ ويصير **كلُّ ما بعده غيرَ موجود بنظر الشاشة**: يبحث الطبيب باسم
  // منتجٍ ترتيبُه بالذيل فلا يلقاه، والمنتجاتُ الأخرى ظاهرةٌ أمامه فيستنتج أن
  // مادّته لم تُدخَل، فيعيد إدخالها.
  //
  // والتقدّمُ بما وصل يجعل الحلقة صحيحةً مهما كان سقفُ الخادم — بلا أن نعرفه.
  for (let from = 0; ;) {
    const r = await (make() as Q).order("id", { ascending: true }).range(from, from + PAGE_ROWS - 1);
    // وفشلٌ يُرمى ولا يُبلع: كانت تُرجع ما جمعته — صفراً بالصفحة الأولى — فتقول
    // الشاشة «ماكو منتجات» عن مخزنٍ عامر. قائمةٌ ناقصة أسوأ من خطأ: الخطأ يُرى
    // ويُعاد، والنقصُ يُصدَّق.
    if (r.error) throw new Error(r.error.message);
    const rows = (r.data ?? []) as T[];
    out.push(...rows);
    if (rows.length === 0) return out;
    from += rows.length;
  }
}
function maybe<T>(res: { data: unknown; error: { message: string } | null }): T | undefined {
  if (res.error) { console.error("[supabase]", res.error.message); return undefined; }
  return (res.data ?? undefined) as T | undefined;
}
function need<T>(res: { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }): T {
  if (res.error || res.data == null) {
    const src = res.error;
    // Preserve the Postgres error code/details so callers can show a specific,
    // friendly message (e.g. a unique-constraint conflict) instead of a generic one.
    const err = new Error(src?.message ?? "No data returned") as Error & { code?: string; details?: string; hint?: string };
    if (src?.code) err.code = src.code;
    if (src?.details) err.details = src.details;
    if (src?.hint) err.hint = src.hint;
    throw err;
  }
  return res.data as T;
}
/** For write ops (update/delete/rpc) that return no row: throw on error so a
 *  failed mutation surfaces to the caller instead of failing silently. */
function ok(res: { error: { message: string; code?: string; details?: string; hint?: string } | null }): void {
  if (res.error) {
    const err = new Error(res.error.message) as Error & { code?: string; details?: string; hint?: string };
    if (res.error.code) err.code = res.error.code;
    if (res.error.details) err.details = res.error.details;
    if (res.error.hint) err.hint = res.error.hint;
    throw err;
  }
}

// medical-media is a PRIVATE bucket: media_items.url holds the storage PATH, and
// we mint a short-lived signed URL for display. Legacy rows that still hold a full
// http(s)/data:/blob: URL pass straight through, so the switch is seamless.
const MEDIA_BUCKET = "medical-media";
const MEDIA_URL_TTL = 60 * 60 * 8; // 8 hours — comfortably longer than a work session
const isStoragePath = (u: string): boolean => !!u && !/^(https?:|data:|blob:)/i.test(u);
async function withSignedMedia(items: MediaItem[]): Promise<MediaItem[]> {
  const paths = items.filter((m) => isStoragePath(m.url)).map((m) => m.url);
  if (paths.length === 0) return items;
  try {
    const { data } = await sbc().storage.from(MEDIA_BUCKET).createSignedUrls(paths, MEDIA_URL_TTL);
    const signed = new Map<string, string>();
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, d.signedUrl);
    return items.map((m) => (isStoragePath(m.url) && signed.has(m.url) ? { ...m, url: signed.get(m.url)! } : m));
  } catch {
    return items; // never let a signing hiccup drop the whole gallery
  }
}

const supabaseRepo: typeof demoRepo = {
  async listPets(ownerId) {
    return listOf<Pet>(await sbc().from("pets").select("*").eq("owner_id", ownerId));
  },
  async listAllPets(clinicId) {
    return allPages<Pet>(() => {
      let q = sbc().from("pets").select("*").order("created_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async updateOwnerContact(ownerId, patch) {
    ok(await sbc().from("pets").update(patch).eq("owner_id", ownerId));
  },
  async getPet(petId) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("id", petId).maybeSingle());
  },
  async getPetByToken(token) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("passport_token", token.trim().toUpperCase()).maybeSingle());
  },
  async getPetsByIds(ids) {
    return inChunks(ids, async (c) => listOf<Pet>(await sbc().from("pets").select("*").in("id", c)));
  },
  async getPetBySerial(serial) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("serial", serial.trim()).maybeSingle());
  },
  async claimPet(serial, owner) {
    // Claiming only LINKS the owner account. The clinic's stored customer name/
    // phone (اسم المراجع) must survive the claim — we read the row first and only
    // fill fields the clinic left blank.
    const cur = maybe<Pet>(await sbc().from("pets").select("*").eq("serial", serial.trim()).maybeSingle());
    if (!cur) return undefined;
    const patch: Partial<Pet> = { owner_id: owner.owner_id };
    if (blankOwnerField(cur.owner_name) && owner.owner_name) patch.owner_name = owner.owner_name;
    if (blankOwnerField(cur.owner_phone) && owner.owner_phone) patch.owner_phone = owner.owner_phone;
    if (blankOwnerField(cur.owner_email) && owner.owner_email) patch.owner_email = owner.owner_email;
    return maybe<Pet>(await sbc().from("pets").update(patch).eq("id", cur.id).select().maybeSingle());
  },
  async claimPetsByPhone(input) {
    // Server-side matching (migration 0077): the RPC uses the PROFILE's stored
    // phone — never a client-supplied one — so an account can only ever claim
    // pets registered under its own verified number. Missing RPC ⇒ no-op.
    try {
      const { data, error } = await sbc().rpc("claim_pets_by_phone", {
        p_name: input.name ?? null,
        p_email: input.email ?? null,
      });
      if (error) return [];
      return (data as Pet[]) ?? [];
    } catch {
      return [];
    }
  },
  async getPetsByOwnerEmail(email) {
    const e = email.trim();
    if (!e) return [];
    return listOf<Pet>(await sbc().from("pets").select("*").ilike("owner_email", e).eq("shared_with_clinic", true));
  },
  async getSharedPetsByOwnerId(ownerId) {
    return listOf<Pet>(await sbc().from("pets").select("*").eq("owner_id", ownerId).eq("shared_with_clinic", true));
  },
  async createPet(input) {
    // الرقم التسلسلي تولّده القاعدة (هجرة 0126): `nextval` ذرّيّ ثم تحويلٌ
    // تقابليّ، فالفرادة مضمونةٌ حسابياً لا احتمالياً. كان العميل يسحب رقماً
    // عشوائياً سحبةً واحدة بلا إعادة، فيصطدم بفهرسٍ فريد وتضيع الحالة —
    // ٠٫٧٩٪ اليوم، وترتفع مع كل حيوانٍ ينضاف.
    //
    // ما نمرّر `serial` أبداً: تمريره — ولو null — يلغي الـdefault ويرجّعنا
    // للحفرة. والحذف صريحٌ هنا لأن `input` يجي من نداءاتٍ كثيرة.
    const { serial: _ignored, ...clean } = input as typeof input & { serial?: string };
    void _ignored;

    // حزامٌ ثانٍ: نعيد المحاولة على **23505 وحدها** — خرق قيد الفرادة. أي
    // خطأٍ غيره (شبكة، صلاحية، عمود ناقص) يُرمى فوراً: إعادة المحاولة عليه
    // تخفي العطل وتكرّر الكتابة.
    let pet: Pet | undefined;
    for (let attempt = 0; ; attempt++) {
      try { pet = need<Pet>(await sbc().from("pets").insert(clean).select().single()); break; }
      catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "23505" || attempt >= 4) throw e;
      }
    }

    // قاعدةٌ ما نزلت عليها هجرة 0126 بعد ما بيها default، فيطلع الرقم فارغاً —
    // والفهرس الفريد يتجاهل NULL فما ينكشف الخلل بخطأ. والرقم هذا هو رقم ملفّ
    // المريض: مطبوعٌ بالموافقات وبالسجلّ وبيه يُبحث. فنملأه من العميل حينها،
    // بنفس حلقة التفادي، حتى تشتغل النسختان بأي ترتيبٍ نزلن به.
    if (!pet.serial) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const cand = String(Math.floor(10000 + Math.random() * 90000));
        try {
          const fixed = maybe<Pet>(await sbc().from("pets").update({ serial: cand }).eq("id", pet.id).select().maybeSingle());
          if (fixed) return fixed;
          break;
        } catch (e) {
          if ((e as { code?: string }).code !== "23505") break; // الحيوان انسجّل — الرقم تحسينٌ لا شرط
        }
      }
    }
    return pet;
  },
  async updatePet(petId, patch) {
    return maybe<Pet>(await sbc().from("pets").update(patch).eq("id", petId).select().maybeSingle());
  },
  async deletePet(petId) {
    // ملفات التخزين لا تلحقها الـcascade — صفوف media_items تنحذف مع الحيوان
    // لكن ملفات الأشعة/الـPDF كانت تبقى بالباكت للأبد (بيانات مرضى + كلفة).
    // نحذفها أولاً، بأفضل جهد: فشل التنظيف ما يمنع حذف الحيوان نفسه.
    try {
      const rows = listOf<{ url: string }>(await sbc().from("media_items").select("url").eq("pet_id", petId));
      const paths = rows.map((r) => r.url).filter(isStoragePath);
      for (let i = 0; i < paths.length; i += 50) {
        await sbc().storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 50));
      }
    } catch { /* best effort — the DB delete below is the operation that matters */ }
    // Dependent rows (visits, vaccinations, treatments, media, weights, admissions)
    // are removed by the schema's `on delete cascade` foreign keys.
    ok(await sbc().from("pets").delete().eq("id", petId));
  },
  async listWeights(petId) {
    return listOf<WeightLog>(await sbc().from("weight_logs").select("*").eq("pet_id", petId).order("measured_at", { ascending: true }));
  },
  async addWeight(petId, weight_kg, measured_at) {
    const log = need<WeightLog>(
      await sbc().from("weight_logs").insert({ pet_id: petId, weight_kg, measured_at: measured_at ?? new Date().toISOString().slice(0, 10) }).select().single(),
    );
    await sbc().from("pets").update({ current_weight_kg: weight_kg }).eq("id", petId);
    return log;
  },
  async listVaccinations(petId) {
    return listOf<Vaccination>(await sbc().from("vaccinations").select("*").eq("pet_id", petId));
  },
  async listAllVaccinations(petIds) {
    return inChunks(petIds, (c) => allPages<Vaccination>(() => sbc().from("vaccinations").select("*").in("pet_id", c)));
  },
  async addVaccination(input) {
    return need<Vaccination>(await sbc().from("vaccinations").insert(input).select().single());
  },
  async updateVaccination(id, patch) {
    ok(await sbc().from("vaccinations").update(patch).eq("id", id));
  },
  async listVisits(petId) {
    return listOf<MedicalVisit>(await sbc().from("medical_visits").select("*").eq("pet_id", petId).order("visit_date", { ascending: false }));
  },
  async listAllVisits(petIds) {
    return inChunks(petIds, (c) => allPages<MedicalVisit>(() => sbc().from("medical_visits").select("*").in("pet_id", c).order("visit_date", { ascending: false })));
  },
  async listClinicVisits(clinicId) {
    // ملاحظة: حتى limit(5000) كان يُقصّ على 1000 من الخادم — الصفحات هي الحل.
    return allPages<MedicalVisit>(() => {
      let q = sbc().from("medical_visits").select("*").order("visit_date", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async listCareEntries(petId, day) {
    let q = sbc().from("care_entries").select("*").eq("pet_id", petId).order("day", { ascending: true }).order("time", { ascending: true });
    if (day) q = q.eq("day", day);
    return listOf<CareEntry>(await q);
  },
  async addCareEntry(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id;   // stamped server-side by the auth_clinic() column default
    return need<CareEntry>(await sbc().from("care_entries").insert(rest).select().single());
  },
  async deleteCareEntry(id) {
    ok(await sbc().from("care_entries").delete().eq("id", id));
  },
  async listProblems(petId) {
    // clinic_id is stamped by the column default (auth_clinic()) — never sent by the client.
    return listOf<PetProblem>(
      await sbc().from("pet_problems").select("*").eq("pet_id", petId).order("created_at", { ascending: false }),
    ).sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
  },
  async addProblem(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id;
    return need<PetProblem>(await sbc().from("pet_problems").insert(rest).select().single());
  },
  async updateProblem(id, patch) {
    ok(await sbc().from("pet_problems").update(patch).eq("id", id));
  },
  async deleteProblem(id) {
    ok(await sbc().from("pet_problems").delete().eq("id", id));
  },
  async listFeatureRequests() {
    // RLS تحصرها بطلبات عيادة المستخدم نفسها.
    return listOf<FeatureRequest>(
      await sbc().from("feature_requests").select("*").order("created_at", { ascending: false }),
    );
  },
  async addFeatureRequest(input) {
    const { clinic_id, ...rest } = input;
    void clinic_id; // يُختم من default العمود auth_clinic() — لا يُرسل من العميل
    return need<FeatureRequest>(await sbc().from("feature_requests").insert({ status: "new", ...rest }).select().single());
  },
  async updateFeatureRequest(id, patch) {
    ok(await sbc().from("feature_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  },
  async systemHealth() {
    // الحارس داخل الدالّة نفسها (is_platform_admin)، فغيرُ المشغّل يستلم رفضاً
    // من الخادم لا قائمةً منقوصة.
    return listOf<HealthMetric>(await sbc().rpc("system_health", {}));
  },
  async adminListFeatureRequests() {
    // سياسة is_platform_admin() توسّع القراءة لكل العيادات لمشغّل المنصة.
    return listOf<FeatureRequest>(
      await sbc().from("feature_requests").select("*").order("created_at", { ascending: false }).limit(500),
    );
  },
  async addVisit(input) {
    // Snapshot the patient's age at visit time. Look up the pet's DOB when the caller
    // didn't supply the age, so every saved visit carries a historical age.
    let patient_age_months = input.patient_age_months ?? null;
    if (patient_age_months == null) {
      const { data } = await sbc().from("pets").select("dob").eq("id", input.pet_id).maybeSingle();
      patient_age_months = ageMonths((data as { dob?: string | null } | null)?.dob);
    }
    return need<MedicalVisit>(await sbc().from("medical_visits").insert({ ...input, patient_age_months }).select().single());
  },
  async listPetNotes(petId) {
    return listOf<PetNote>(await sbc().from("pet_notes").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async listLabResults(petId) {
    return listOf<LabResult>(await sbc().from("lab_results").select("*").eq("pet_id", petId).order("taken_at", { ascending: false }));
  },
  async addLabResult(input) {
    // clinic_id is stamped by the column default (auth_clinic()).
    const lc = labLifecycleFields(input, new Date().toISOString());
    return need<LabResult>(await sbc().from("lab_results").insert({
      pet_id: input.pet_id, visit_id: input.visit_id ?? null,
      panel_id: input.panel_id, panel_label: input.panel_label, kind: input.kind,
      values: input.values ?? null, snap_test_id: input.snap_test_id ?? null,
      snap_result: input.snap_result ?? null, notes: input.notes ?? null,
      photo_url: input.photo_url ?? null, doctor: input.doctor ?? null,
      billed: input.billed ?? false, taken_at: input.taken_at,
      status: lc.status, priority: lc.priority,
      ordered_at: lc.ordered_at, collected_at: lc.collected_at, running_at: lc.running_at,
      resulted_at: lc.resulted_at, verified_at: lc.verified_at,
      collected_by: lc.collected_by, verified_by: lc.verified_by,
    }).select().single());
  },
  async setLabBilled(id, billed) {
    ok(await sbc().from("lab_results").update({ billed }).eq("id", id));
  },
  async advanceLabStatus(id, status, extra) {
    const patch: Record<string, unknown> = { status };
    const col = LAB_STAGE_COL[status];
    if (col) patch[col] = new Date().toISOString();
    if (extra?.collected_by !== undefined && status === "collected") patch.collected_by = extra.collected_by;
    if (extra?.verified_by !== undefined && status === "verified") patch.verified_by = extra.verified_by;
    ok(await sbc().from("lab_results").update(patch).eq("id", id));
  },
  async setLabPriority(id, priority) {
    ok(await sbc().from("lab_results").update({ priority }).eq("id", id));
  },
  async listClinicLabResults(clinicId) {
    // limit(2000) كان يُقصّ على 1000 من الخادم أصلاً — الصفحات تضمن الاثنين.
    return allPages<LabResult>(() => {
      let q = sbc().from("lab_results").select("*").order("taken_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async deleteLabResult(id) {
    ok(await sbc().from("lab_results").delete().eq("id", id));
  },
  async createDeviceLink(name) {
    // token + clinic_id are stamped by column defaults; read them back for display.
    return need<LabDeviceLink>(await sbc().from("lab_device_links").insert({ name: name.trim() || "جهاز المختبر" }).select().single());
  },
  async listDeviceLinks() {
    return listOf<LabDeviceLink>(await sbc().from("lab_device_links").select("*").order("created_at", { ascending: false }));
  },
  async revokeDeviceLink(id) {
    ok(await sbc().from("lab_device_links").update({ revoked: true }).eq("id", id));
  },
  async listDeviceInbox() {
    return listOf<LabDeviceInbox>(await sbc().from("lab_device_inbox").select("*").eq("status", "new").order("received_at", { ascending: false }));
  },
  async markInboxHandled(id, status) {
    ok(await sbc().from("lab_device_inbox").update({ status, handled_at: new Date().toISOString() }).eq("id", id));
  },
  async ingestDeviceMessage(token, raw) {
    // Same secure path the receiver agent uses — SECURITY DEFINER RPC, token-authed.
    const { data, error } = await sbc().rpc("ingest_device_message", { p_token: token, p_raw: raw });
    if (error) return null;
    return (data as string | null) ?? null;
  },
  async addPetNote(input) {
    // clinic_id + author_id are stamped by the column defaults (auth_clinic() / auth.uid()).
    return need<PetNote>(await sbc().from("pet_notes").insert({
      pet_id: input.pet_id, note_text: input.note_text,
      author_id: input.author_id ?? undefined, author_name: input.author_name ?? null,
      visit_id: input.visit_id ?? null,
    }).select().single());
  },
  async listClinicVisitsForPet(petId) {
    return listOf<ClinicVisit>(await sbc().from("clinic_visits").select("*").eq("pet_id", petId).order("opened_at", { ascending: false }));
  },
  async getClinicVisit(id) {
    return maybe<ClinicVisit>(await sbc().from("clinic_visits").select("*").eq("id", id).maybeSingle()) ?? null;
  },
  async listOpenClinicVisits(clinicId) {
    let q = sbc().from("clinic_visits").select("*").eq("status", "open").order("opened_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<ClinicVisit>(await q);
  },
  async listEndedClinicVisits(clinicId, limit = 300) {
    let q = sbc().from("clinic_visits").select("*").eq("status", "ended").order("ended_at", { ascending: false }).limit(limit);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<ClinicVisit>(await q);
  },
  async addClinicVisit(input) {
    return need<ClinicVisit>(await sbc().from("clinic_visits").insert(input).select().single());
  },
  async updateClinicVisit(id, patch) {
    ok(await sbc().from("clinic_visits").update(patch).eq("id", id));
  },
  async listMedia(petId) {
    const items = listOf<MediaItem>(await sbc().from("media_items").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
    return withSignedMedia(items);
  },
  async listAllMedia(petIds) {
    const items = await inChunks(petIds, (c) => allPages<MediaItem>(() => sbc().from("media_items").select("*").in("pet_id", c)));
    return withSignedMedia(items);
  },
  async addMedia(input) {
    return need<MediaItem>(await sbc().from("media_items").insert(input).select().single());
  },
  async uploadMedia(petId, upload, kind, caption) {
    const sb = sbc();
    // UUID object name keeps uploads collision-free; foldered by pet (the folder
    // name IS the pet id — the storage RLS policy scopes access by it).
    const path = `${petId}/${uuid()}.${upload.ext}`;
    const up = await sb.storage.from(MEDIA_BUCKET).upload(path, upload.blob, {
      contentType: upload.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) {
      const e = new Error(up.error.message) as Error & { name: string };
      e.name = "StorageError";
      throw e;
    }
    // Store the PATH (private bucket); link the file to the pet's record.
    const item = need<MediaItem>(
      await sb.from("media_items").insert({ pet_id: petId, kind, url: path, caption }).select().single(),
    );
    // Return a ready-to-display signed URL so the just-uploaded image renders at once.
    const { data: signed } = await sb.storage.from(MEDIA_BUCKET).createSignedUrl(path, MEDIA_URL_TTL);
    return { ...item, url: signed?.signedUrl ?? item.url };
  },
  async listAppointmentsForOwner(ownerId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("owner_id", ownerId).neq("status", "cancelled").order("scheduled_at", { ascending: true }));
  },
  async listAppointmentsForPet(petId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("pet_id", petId).neq("status", "cancelled").order("scheduled_at", { ascending: true }));
  },
  async listAppointmentsForDay(dayISO) {
    const day = dayISO.slice(0, 10);
    return listOf<Appointment>(
      await sbc().from("appointments").select("*").gte("scheduled_at", `${day}T00:00:00`).lte("scheduled_at", `${day}T23:59:59.999`).neq("status", "cancelled").order("scheduled_at", { ascending: true }),
    );
  },
  async listAppointmentsInRange(startISO, endISO) {
    return allPages<Appointment>(() =>
      sbc().from("appointments").select("*").gte("scheduled_at", `${startISO.slice(0, 10)}T00:00:00`).lte("scheduled_at", `${endISO.slice(0, 10)}T23:59:59.999`).neq("status", "cancelled").order("scheduled_at", { ascending: true }),
    );
  },
  async listWaiting(doctorId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("doctor_id", doctorId).in("status", ["checked_in", "in_room"]).order("triage_score", { ascending: true }));
  },
  async slotTaken(doctorId, scheduledAt) {
    return listOf<{ id: string }>(await sbc().from("appointments").select("id").eq("doctor_id", doctorId).eq("scheduled_at", scheduledAt).neq("status", "cancelled")).length > 0;
  },
  async listBookingsForDay(dayISO) {
    // Fetch a ±1-day window then filter by the LOCAL calendar day — timestamps
    // are stored in UTC and Iraq runs +3, so a plain UTC window drops evenings.
    const day = dayISO.slice(0, 10);
    const from = new Date(`${day}T00:00:00`);
    from.setDate(from.getDate() - 1);
    const to = new Date(`${day}T00:00:00`);
    to.setDate(to.getDate() + 2);
    const rows = listOf<Appointment>(
      await sbc().from("appointments").select("*").gte("scheduled_at", from.toISOString()).lt("scheduled_at", to.toISOString()).order("scheduled_at", { ascending: true }),
    );
    return rows.filter((a) => localISO(new Date(a.scheduled_at)) === day);
  },
  async listBookingRequests() {
    // Clinic-scoped by RLS (appt_clinic_all): only this clinic's requests arrive.
    const since = new Date(Date.now() - 86400000).toISOString();
    return listOf<Appointment>(
      await sbc().from("appointments").select("*").eq("status", "requested").gte("scheduled_at", since).order("scheduled_at", { ascending: true }),
    );
  },
  async getDailyNote(dateISO) {
    try {
      const { data, error } = await sbc().from("clinic_notes").select("note_date, content, updated_by, updated_at").eq("note_date", dateISO).maybeSingle();
      if (error) return dailyNoteLocalGet(dateISO); // pre-0080 backend → device-local
      return (data as DailyNote | null) ?? null;
    } catch { return dailyNoteLocalGet(dateISO); }
  },
  async saveDailyNote(dateISO, content, author) {
    try {
      const { error } = await sbc().from("clinic_notes").upsert(
        { note_date: dateISO, content, updated_by: author ?? null, updated_at: new Date().toISOString() },
        { onConflict: "clinic_id,note_date" },
      );
      if (error) dailyNoteLocalSet(dateISO, content, author);
    } catch { dailyNoteLocalSet(dateISO, content, author); }
  },
  async listDoctorBusySlots(doctorIds, fromISO, toISO) {
    const out: Record<string, string[]> = {};
    if (doctorIds.length === 0) return out;
    try {
      const { data, error } = await sbc().rpc("doctor_busy_slots", { p_doctors: doctorIds, p_from: fromISO, p_to: toISO });
      if (error) return out; // pre-0079 backend — availability badges just don't show
      for (const row of (data as { doctor_id: string; scheduled_at: string }[]) ?? []) {
        (out[row.doctor_id] ??= []).push(row.scheduled_at);
      }
      return out;
    } catch { return out; }
  },
  async listClinicDirectory() {
    // Pre-0078 backend (RPC missing) → empty directory, the wizard copes.
    try {
      const { data, error } = await sbc().rpc("clinic_directory");
      if (error) return [];
      return ((data as { id: string; name: string; city: string | null; phone: string | null }[]) ?? []);
    } catch { return []; }
  },
  async listClinicStaffPublic(clinicId) {
    try {
      const { data, error } = await sbc().rpc("clinic_staff_public", { p_clinic: clinicId });
      if (error) return [];
      return ((data as { id: string; name: string; role: string; specialty: string | null }[]) ?? []);
    } catch { return []; }
  },
  async createAppointment(input) {
    return need<Appointment>(await sbc().from("appointments").insert(input).select().single());
  },
  async updateAppointment(id, patch) {
    return maybe<Appointment>(await sbc().from("appointments").update(patch).eq("id", id).select().maybeSingle());
  },
  async setAppointmentStatus(id, status) {
    ok(await sbc().from("appointments").update({ status }).eq("id", id));
  },
  async listTreatments(petId) {
    return listOf<TreatmentEntry>(await sbc().from("treatment_entries").select("*").eq("pet_id", petId).order("day", { ascending: true }).order("time", { ascending: true }));
  },
  async listAllTreatments(petIds) {
    return inChunks(petIds, (c) => allPages<TreatmentEntry>(() => sbc().from("treatment_entries").select("*").in("pet_id", c)));
  },
  async listClinicTreatments(clinicId, day) {
    // limit(5000) كان يُقصّ على 1000 من الخادم — طبلات اليوم النشط تفوقها بسهولة.
    return allPages<TreatmentEntry>(() => {
      let q = sbc().from("treatment_entries").select("*").order("day", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      if (day) q = q.eq("day", day);
      return q;
    });
  },
  async addTreatment(input) {
    return need<TreatmentEntry>(await sbc().from("treatment_entries").insert(input).select().single());
  },
  async addTreatments(inputs) {
    if (inputs.length === 0) return;
    // `amount` و`medication` عمودان **not null** بالقاعدة منذ الهجرة الأولى.
    // والحارس هنا لا بالنداء: أي مُنادٍ ينسى الكمية يُسقط الدفعة كلّها برفضٍ
    // من القاعدة، والقيد لا يُقرأ من موضع النداء. فالتطبيع مرّةً واحدة عند
    // البوّابة أضمن من تذكّره بكل موضع.
    const rows = inputs.map((r) => ({ ...r, amount: r.amount ?? "", medication: r.medication ?? "" }));
    ok(await sbc().from("treatment_entries").insert(rows)); // دفعة وحدة — رحلة سيرفر واحدة
  },
  async deleteTreatment(id) {
    ok(await sbc().from("treatment_entries").delete().eq("id", id));
  },
  async listSurgeries(petId) {
    // Pre-0073 backend (table missing) must never break the case page — empty list.
    try {
      return listOf<Surgery>(await sbc().from("surgeries").select("*").eq("pet_id", petId).order("performed_at", { ascending: false }));
    } catch { return []; }
  },
  async addSurgery(input) {
    return need<Surgery>(await sbc().from("surgeries").insert(input).select().single());
  },
  async listAllSurgeries() {
    try {
      return listOf<Surgery>(await sbc().from("surgeries").select("*").order("performed_at", { ascending: false }).limit(500));
    } catch { return []; }
  },
  async updateSurgery(id, patch) {
    ok(await sbc().from("surgeries").update(patch).eq("id", id));
  },
  async deleteSurgery(id) {
    ok(await sbc().from("surgeries").delete().eq("id", id));
  },
  async setTreatmentGiven(id, given, by, at) {
    ok(await sbc().from("treatment_entries").update({ administered_at: given ? (at || new Date().toISOString()) : null, administered_by: given ? by : null, ...(given ? { missed_reason: null } : {}) }).eq("id", id));
  },
  async setTreatmentResult(id, result, by, at) {
    ok(await sbc().from("treatment_entries").update({ result, administered_at: at || new Date().toISOString(), administered_by: by ?? null, missed_reason: null }).eq("id", id));
  },
  async setTreatmentMissed(id, reason) {
    ok(await sbc().from("treatment_entries").update({ missed_reason: reason }).eq("id", id));
  },
  async updateTreatment(id, patch) {
    ok(await sbc().from("treatment_entries").update(patch).eq("id", id));
  },
  async listAdmissions(clinicId) {
    // Newest case first — order by the precise created_at so cases opened on the same
    // day still sort by real entry order (the day-only admitted_on can't distinguish them).
    let q = sbc().from("admissions").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Admission>(await q);
  },
  async listAdmissionsForPet(petId) {
    return listOf<Admission>(await sbc().from("admissions").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async addAdmission(input) {
    // Omit a null branch_id so a pre-0042 database (no column yet) keeps working —
    // a real branch id can only exist after that migration created the table.
    const { branch_id, ...rest } = input;
    const row = branch_id ? { ...rest, branch_id } : rest;
    return need<Admission>(await sbc().from("admissions").insert(row).select().single());
  },
  async listPetMovements(petId) {
    return listOf<PetMovement>(await sbc().from("pet_movements").select("*").eq("pet_id", petId).order("at", { ascending: false }));
  },
  async updateAdmission(id, patch) {
    ok(await sbc().from("admissions").update(patch).eq("id", id));
  },
  async listBranches(clinicId) {
    // RLS already scopes to the clinic; the explicit filter is belt-and-suspenders.
    let q = sbc().from("branches").select("*").eq("is_active", true)
      .order("is_main", { ascending: false }).order("created_at", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Branch>(await q);
  },
  async createBranch(input) {
    // clinic_id is stamped server-side by the auth_clinic() column default.
    const { clinic_id: _omit, ...row } = input;
    return need<Branch>(await sbc().from("branches").insert(row).select().single());
  },
  async updateBranch(id, patch) {
    ok(await sbc().from("branches").update(patch).eq("id", id));
  },
  async listReminders(filter) {
    return allPages<Reminder>(() => {
      let q = sbc().from("reminders").select("*");
      if (filter && "ownerId" in filter) {
        q = filter.ownerId == null ? q.is("owner_id", null) : q.eq("owner_id", filter.ownerId);
      }
      return q.order("date", { ascending: true });
    });
  },
  async addReminder(input) {
    return need<Reminder>(await sbc().from("reminders").insert(input).select().single());
  },
  async updateReminder(id, patch) {
    ok(await sbc().from("reminders").update(patch).eq("id", id));
  },
  async removeReminder(id) {
    ok(await sbc().from("reminders").delete().eq("id", id));
  },

  /* ---------------- Inventory & POS ---------------- */
  async listProducts(clinicId) {
    // العيادة الكبيرة تتجاوز ألف منتج — بلا صفحات كان الجديد «يختفي» بعد الحد.
    return allPages<Product>(() => {
      let q = sbc().from("products").select("*").order("name", { ascending: true });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async supportsBulkGroup() {
    try {
      const r = await sbc().from("products").select("bulk_group").limit(1);
      // خطأ يذكر العمود = الترحيل 0075 غير منفَّذ بعد على قاعدة هذه العيادة.
      return !(r.error && /bulk_group/i.test(r.error.message));
    } catch {
      return true; // فشل شبكة — لا نُظهر تحذيراً خاطئاً
    }
  },
  async getProductByBarcode(barcode, clinicId) {
    const code = normalizeCode(barcode);
    if (!code) return undefined;
    // دالّةُ القاعدة تقرأ `barcode` والرموزَ الإضافية معاً (0141)، وبصلاحية
    // المُستدعي فسياساتُ الصفوف تحصرها بعيادته.
    const r = await sbc().rpc("product_by_code", { p_code: code });
    if (!r.error) {
      const rows = (r.data ?? []) as Product[];
      // صفّان = رمزٌ ملتبس. نرجّع الأوّل ونصرخ بالكونسول بدل ما نبلعه صامتين
      // ونقول «غير موجود» — وهذا بالضبط ما كانت تفعله maybeSingle.
      if (rows.length > 1) console.error("[pos] ambiguous code", code, rows.length);
      return rows[0];
    }
    // القاعدةُ لم تنزل عليها 0141 بعد: نرجع للمسار القديم بدل أن يتعطّل المسح.
    let q = sbc().from("products").select("*").eq("barcode", code).limit(2);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const rows = listOf<Product>(await q);
    if (rows.length > 1) console.error("[pos] ambiguous code", code, rows.length);
    return rows[0];
  },
  async attachProductCode(productId, code) {
    const c = normalizeCode(code);
    if (!c) throw new Error("empty code");
    const { data, error } = await sbc().rpc("attach_product_code", { p_product: productId, p_code: c });
    if (error) throw error;
    return data as Product;
  },
  async createProduct(input) {
    // المعرف يولد بالجهاز: فشل الشبكة يدخل صندوق الصادر ويُرفع لاحقاً بنفس
    // المعرف (upsert متجاهل التكرار) — لا منتج يضيع ولا يزدوج بضعف النت.
    // والباركود يُطبَّع عند الحفظ بنفس دالّة المسح، وإلا خُزّن بشكلٍ لا يُمسح.
    const row = { id: uuid(), ...input, barcode: normalizeCode(input.barcode) || null };
    try {
      // قبل ترحيلي 0075/0124 قد يغيب bulk_group أو sold_by_weight — أعد
      // المحاولة بدون العمود الناقص كي لا يفشل إنشاء المنتج كله.
      const r = await sbc().from("products").insert(row).select().single();
      if (r.error && /bulk_group|sold_by_weight/i.test(r.error.message)) {
        const { bulk_group, sold_by_weight, ...rest } = row as Record<string, unknown>;
        void bulk_group; void sold_by_weight;
        return need<Product>(await sbc().from("products").insert(rest as never).select().single());
      }
      return need<Product>(r);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("products", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as Product;
    }
  },
  async updateProduct(id, patch) {
    // نفس تطبيع الإنشاء — تعديلٌ يكتب باركوداً غيرَ مطبَّع يعيد المشكلة.
    if ("barcode" in patch) patch = { ...patch, barcode: normalizeCode(patch.barcode) || null };
    const r = await sbc().from("products").update(patch).eq("id", id).select().maybeSingle();
    if (r.error && /bulk_group|sold_by_weight/i.test(r.error.message)) {
      const { bulk_group, sold_by_weight, ...rest } = patch as Record<string, unknown>;
      void bulk_group; void sold_by_weight;
      return maybe<Product>(await sbc().from("products").update(rest as never).eq("id", id).select().maybeSingle());
    }
    return maybe<Product>(r);
  },
  async deleteProduct(id) {
    ok(await sbc().from("products").delete().eq("id", id));
  },

  /* ---------------- Companies (الشركات) ---------------- */
  async listGeneratedBarcodes() {
    return allPages<GeneratedBarcode>(() =>
      sbc().from("generated_barcodes").select("*").order("created_at", { ascending: false }),
    );
  },
  async updateGeneratedBarcode(id, patch) {
    ok(await sbc().from("generated_barcodes").update(patch).eq("id", id));
  },
  async addGeneratedBarcodes(rows) {
    // clinic_id يُختم من default العمود؛ upsert بتجاهل التعارض يحاكي سلوك الديمو
    // (كود موجود سابقاً لا يُدرج مرتين ولا يفشّل الدفعة كلها).
    const payload = rows.map(({ clinic_id, ...rest }) => { void clinic_id; return rest; });
    return listOf<GeneratedBarcode>(
      await sbc().from("generated_barcodes").upsert(payload, { onConflict: "clinic_id,barcode", ignoreDuplicates: true }).select(),
    );
  },

  /* ---------------- المتجر الإلكتروني (0095) ---------------- */
  async getStoreProfile() {
    return maybe<StoreProfile>(await sbc().from("store_profiles").select("*").maybeSingle()) ?? null;
  },
  async saveStoreProfile(p) {
    // clinic_id يُختم من default العمود (auth_clinic) والصف مفتاحه clinic_id.
    const { clinic_id, ...rest } = p as StoreProfile;
    void clinic_id;
    const res = await sbc().from("store_profiles")
      .upsert({ ...rest, slug: normalizeSlug(p.slug), updated_at: new Date().toISOString() }, { onConflict: "clinic_id" })
      .select().single();
    if (res.error) {
      // قيد slug الفريد → رسالة مفهومة بدل نص Postgres الخام.
      if (/store_profiles_slug_unique|duplicate key/i.test(res.error.message)) throw new Error("slug_taken");
      if (/store_slug_format|violates check/i.test(res.error.message)) throw new Error("slug_invalid");
      throw new Error(res.error.message);
    }
    return res.data as StoreProfile;
  },
  async checkStoreSlug(slug) {
    if (!isValidSlug(normalizeSlug(slug))) return false;
    const { data, error } = await sbc().rpc("store_slug_available", { p_slug: normalizeSlug(slug) });
    if (error) throw new Error(error.message);
    return !!data;
  },
  async listStoreOrders(limit = 300) {
    return listOf<StoreOrder>(
      await sbc().from("store_orders").select("*").order("created_at", { ascending: false }).limit(limit),
    );
  },
  async updateStoreOrder(id, patch) {
    ok(await sbc().from("store_orders").update(patch).eq("id", id));
  },
  /* ---- رحلة الحيوان بالعيادة ---- */
  async getActiveJourney(petId) {
    return maybe<Journey>(await sbc().from("journeys").select("*").eq("pet_id", petId).eq("status", "active").maybeSingle()) ?? null;
  },
  async listJourneyEvents(journeyId) {
    return listOf<JourneyEvent>(await sbc().from("journey_events").select("*").eq("journey_id", journeyId).order("created_at", { ascending: true }));
  },
  async createJourney(petId, kind, createdByName) {
    const clinicId = getActiveClinicId();
    // فهرس «رحلة نشطة واحدة» بالقاعدة يمنع التكرار — نعيد الموجودة بدل الفشل.
    const existing = maybe<Journey>(await sbc().from("journeys").select("*").eq("pet_id", petId).eq("status", "active").maybeSingle());
    if (existing) return existing;
    const j = need<Journey>(await sbc().from("journeys").insert({
      clinic_id: clinicId, pet_id: petId, kind, stage: "arrived", token: journeyToken(),
    }).select().single());
    ok(await sbc().from("journey_events").insert({
      journey_id: j.id, clinic_id: clinicId, kind: "stage", stage: "arrived", created_by_name: createdByName ?? null,
    }));
    return j;
  },
  async advanceJourney(journeyId, stage, createdByName) {
    const clinicId = getActiveClinicId();
    ok(await sbc().from("journeys").update({ stage }).eq("id", journeyId).eq("status", "active"));
    ok(await sbc().from("journey_events").insert({
      journey_id: journeyId, clinic_id: clinicId, kind: "stage", stage, created_by_name: createdByName ?? null,
    }));
  },
  async addJourneyNote(journeyId, input, createdByName) {
    ok(await sbc().from("journey_events").insert({
      journey_id: journeyId, clinic_id: getActiveClinicId(),
      kind: input.photo ? "photo" : "message",
      body: input.body?.slice(0, 500) || null, photo: input.photo ?? null,
      created_by_name: createdByName ?? null,
    }));
  },
  async closeJourney(journeyId, opts) {
    ok(await sbc().from("journeys").update({
      status: "closed", closed_at: new Date().toISOString(), ...(opts?.silent ? { silent: true } : {}),
    }).eq("id", journeyId));
  },
  async trackJourneyPublic(token) {
    const { data, error } = await sbc().rpc("track_journey", { p_token: token });
    if (error) throw new Error(error.message);
    const d = data as { ok?: boolean } & JourneyPublicView;
    if (!d?.ok) return null;
    return {
      pet_name: d.pet_name, clinic_name: d.clinic_name, clinic_phone: d.clinic_phone ?? null,
      kind: d.kind, stage: d.stage, status: d.status, started_at: d.started_at,
      events: d.events ?? [],
    };
  },
  async reactJourneyPublic(token, eventId, emoji) {
    const { data, error } = await sbc().rpc("react_journey", { p_token: token, p_event: eventId, p_emoji: emoji });
    if (error) return false;
    return !!(data as { ok?: boolean })?.ok;
  },

  async storeFrontPublic(slug) {
    const { data, error } = await sbc().rpc("store_front", { p_slug: slug });
    if (error) throw new Error(error.message);
    const d = data as { ok?: boolean } & StoreFrontInfo & { error?: string };
    if (!d?.ok) return null;
    return {
      name: d.name, logo_url: d.logo_url ?? null, phone: d.phone ?? null, whatsapp: d.whatsapp ?? null,
      facebook: d.facebook ?? null, instagram: d.instagram ?? null, bio: d.bio ?? null,
      delivery_fee: Number(d.delivery_fee) || 0, min_order: Number(d.min_order) || 0,
    };
  },
  async storeCatalogPublic(slug, limit = 60, offset = 0) {
    // ما قبل 0096 الدالة بوسيطة واحدة — نعيد النداء بلا صفحات بدل صفحة فارغة.
    let res = await sbc().rpc("store_catalog", { p_slug: slug, p_limit: limit, p_offset: offset });
    if (res.error && offset === 0) res = await sbc().rpc("store_catalog", { p_slug: slug });
    if (res.error) throw new Error(res.error.message);
    return ((res.data ?? []) as StoreCatalogItem[]).map((r) => ({ ...r, price: Number(r.price) || 0 }));
  },
  async placeStoreOrder(slug, info, items) {
    const { data, error } = await sbc().rpc("store_place_order", {
      p_slug: slug,
      p_name: info.name,
      p_phone: info.phone,
      p_address: info.address ?? "",
      p_note: info.note ?? "",
      p_items: items,
    });
    if (error) throw new Error(error.message);
    return (data ?? { ok: false, error: "unknown" }) as { ok: boolean; error?: string; order_no?: string; total?: number; min_order?: number };
  },

  async listCompanies(clinicId) {
    return allPages<Company>(() => {
      let q = sbc().from("companies").select("*").order("name", { ascending: true });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async createCompany(input) {
    const row = { id: uuid(), ...input };
    try {
      return need<Company>(await sbc().from("companies").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("companies", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as Company;
    }
  },
  async updateCompany(id, patch) {
    return maybe<Company>(await sbc().from("companies").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteCompany(id) {
    // FK on products.company_id is ON DELETE SET NULL, so products survive.
    ok(await sbc().from("companies").delete().eq("id", id));
  },

  /* ---------------- Company sections (أصناف) ---------------- */
  async listCompanySections(companyId, clinicId) {
    return allPages<CompanySection>(() => {
      let q = sbc().from("company_sections").select("*").order("name", { ascending: true });
      if (companyId) q = q.eq("company_id", companyId);
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async createCompanySection(input) {
    const row = { id: uuid(), ...input };
    try {
      return need<CompanySection>(await sbc().from("company_sections").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("company_sections", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, created_at: new Date().toISOString() } as CompanySection;
    }
  },
  async updateCompanySection(id, patch) {
    return maybe<CompanySection>(await sbc().from("company_sections").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteCompanySection(id) {
    // FK on products.section_id is ON DELETE SET NULL, so products survive.
    ok(await sbc().from("company_sections").delete().eq("id", id));
  },

  /* ---------------- Purchases (المشتريات) ---------------- */
  async listPurchases(clinicId, range) {
    return allPages<Purchase>(() => {
      let q = sbc().from("purchases").select("*").order("purchased_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "purchased_at", range);
    });
  },
  async listPurchaseItems(purchaseId) {
    return listOf<PurchaseItem>(await sbc().from("purchase_items").select("*").eq("purchase_id", purchaseId));
  },
  async listAllPurchaseItems(clinicId, range) {
    return allPages<PurchaseItem>(() => {
      let q = sbc().from("purchase_items").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    });
  },
  async recordPurchase(lines, meta) {
    // Atomic on the server: restock/create products + insert purchase & items.
    // قبل ترحيل 0076 يتجاهل الخادم supplier_name/supplier_phone بأمان.
    return need<Purchase>(await sbc().rpc("record_purchase", { p_lines: lines, p_meta: meta }));
  },
  async updatePurchase(purchaseId, lines, meta) {
    // Atomic on the server: reverse old line stock, re-apply new lines, replace items.
    return need<Purchase>(await sbc().rpc("update_purchase", { p_purchase: purchaseId, p_lines: lines, p_meta: meta }));
  },
  async listPurchasePayments(purchaseId) {
    // قبل ترحيل 0076 لا يوجد جدول purchase_payments — أعد قائمة فارغة.
    try {
      const r = await sbc().from("purchase_payments").select("*").eq("purchase_id", purchaseId).order("paid_at", { ascending: false });
      if (r.error) return [];
      return (r.data ?? []) as PurchasePayment[];
    } catch {
      return [];
    }
  },
  async settlePurchase(purchaseId, amount, method = "cash", note) {
    return need<Purchase>(await sbc().rpc("settle_purchase", { p_purchase: purchaseId, p_amount: amount, p_method: method, p_note: note ?? null }));
  },
  async tidyInventory() {
    const r = await sbc().rpc("inventory_tidy_uncat");
    if (r.error) throw r.error;
    const d = (r.data ?? {}) as { merged?: number; kept?: number };
    return { merged: Number(d.merged ?? 0), kept: Number(d.kept ?? 0) };
  },
  async supportsSupplierLedger() {
    try {
      const r = await sbc().from("purchase_payments").select("id").limit(1);
      // جدول ناقص = الترحيل 0076 غير منفَّذ بعد على قاعدة هذه العيادة.
      return !r.error;
    } catch {
      return true; // فشل شبكة — لا نُظهر تحذيراً خاطئاً
    }
  },

  async listInvoices(clinicId, range) {
    return allPages<Invoice>(() => {
      let q = sbc().from("invoices").select("*").order("created_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    });
  },
  async checkout(items) {
    // Atomic on the server (creates invoice + items, decrements stock, computes profit).
    return need<Invoice>(await sbc().rpc("pos_checkout", { p_items: items }));
  },

  /* ---------------- Delivery (التوصيل — الدفع عند الاستلام) ---------------- */
  async listCouriers(clinicId) {
    let q = sbc().from("couriers").select("*").order("name", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Courier>(await q);
  },
  async createCourier(input) {
    return need<Courier>(await sbc().from("couriers").insert(input).select().single());
  },
  async updateCourier(id, patch) {
    return maybe<Courier>(await sbc().from("couriers").update(patch).eq("id", id).select().maybeSingle());
  },
  async listDeliveryOrders(clinicId) {
    return allPages<DeliveryOrder>(() => {
      let q = sbc().from("delivery_orders").select("*").order("created_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return q;
    });
  },
  async createDeliveryOrder(input) {
    // Omit a null branch_id so a pre-0071 database (no column yet) keeps working.
    const { branch_id, zone, ...rest } = input;
    const row: Record<string, unknown> = { ...rest };
    if (branch_id) row.branch_id = branch_id;
    if (zone) row.zone = zone;
    const first = await sbc().from("delivery_orders").insert(row).select().single();
    // قاعدة قبل هجرة 0099 (بلا عمود zone): نعيد الإدخال بدون المنطقة بدل ما
    // يضيع طلب التوصيل كله — الفاتورة محفوظة أصلاً والطلب أهم من الحقل.
    if (first.error && zone && /zone/i.test(first.error.message ?? "")) {
      delete row.zone;
      return need<DeliveryOrder>(await sbc().from("delivery_orders").insert(row).select().single());
    }
    return need<DeliveryOrder>(first);
  },
  async updateDeliveryOrder(id, patch) {
    return maybe<DeliveryOrder>(await sbc().from("delivery_orders").update(patch).eq("id", id).select().maybeSingle());
  },

  /* ---------------- Retail & advanced invoicing ---------------- */
  async retailCheckout(items, meta) {
    // Atomic on the server: invoice (+ customer/discount/payment) + items + stock.
    return need<Invoice>(await sbc().rpc("retail_checkout", { p_items: items, p_meta: meta }));
  },
  async retailReturn(items, meta) {
    // ذرّيّة على الخادم: المخزون والسحوبات معاً أو لا شيء.
    const args = { p_items: items, p_meta: meta };
    try {
      return need<RetailReturnResult>(await sbc().rpc("retail_return", args));
    } catch (e) {
      // بخلاف البيعة، الإرجاع ما يعتمد عليه شيءٌ بعده — نتيجتُه رسالةٌ وحسب.
      // فيدخل الطابور بأمان (0136 يمنع ازدواجه بمرجعه)، ونُرجع حصيلةً
      // محسوبةً محلياً كي يرى الكاشير نفس الأرقام التي ستنزل.
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueueRpc("retail_return", args as unknown as Record<string, unknown>)) throw e;
      let total = 0, lines = 0;
      for (const it of items) {
        const qty = Math.abs(Number(it.qty) || 0);
        if (qty === 0) continue;
        total += Math.round(qty * Math.abs(Number(it.unit_price) || 0) * 100) / 100;
        lines += 1;
      }
      const m = meta.method;
      return { total, lines, method: m === "card" ? "card" : m === "transfer" || m === "bank" ? "bank" : "cash" };
    }
  },
  async listInvoiceItems(invoiceId) {
    return listOf<InvoiceItem>(await sbc().from("invoice_items").select("*").eq("invoice_id", invoiceId));
  },
  async listAllInvoiceItems(clinicId, range) {
    // أكبر جدول بالعيادة النشطة — بلا صفحات كانت التحليلات تحسب على أول ألف سطر فقط.
    // ومع المدى (0133) تنزل صفوف الشهر لا صفوف العمر كله.
    return allPages<InvoiceItem>(() => {
      let q = sbc().from("invoice_items").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "created_at", range);
    });
  },
  async refundInvoice(invoiceId) {
    // Server marks refunded + returns units to stock (idempotent).
    return need<Invoice>(await sbc().rpc("refund_invoice", { p_invoice: invoiceId }));
  },
  async deleteInvoice(invoiceId) {
    ok(await sbc().rpc("delete_invoice", { p_invoice: invoiceId }));
  },
  async editInvoiceLines(invoiceId, lines, note) {
    // ذرّية على السيرفر: العكس والخصم وإعادة الحساب وتحديث مستحقّ السواق
    // بمعاملة واحدة — انقطاع الشبكة لا يترك مخزوناً منقوصاً وفاتورة قديمة.
    return need<Invoice>(await sbc().rpc("edit_invoice_lines", { p_invoice: invoiceId, p_lines: lines, p_note: note ?? null }));
  },
  async returnInvoiceItems(invoiceId, returns, method, note) {
    // المرتجع ذرّي عالسيرفر (0121): مخزون + فاتورة + نقد بمعاملة واحدة.
    return need<Invoice>(await sbc().rpc("return_invoice_items", { p_invoice: invoiceId, p_returns: returns, p_method: method ?? null, p_note: note ?? null }));
  },
  async settleInvoice(invoiceId, amount, method = "cash") {
    // Atomic on the server: clamps to the outstanding balance, appends a payment leg.
    return need<Invoice>(await sbc().rpc("settle_invoice", { p_invoice: invoiceId, p_amount: amount, p_method: method }));
  },
  async bumpInvoicePrints(invoiceId) {
    const res = await sbc().rpc("bump_invoice_prints", { p_invoice: invoiceId });
    if (res.error) { console.error("[supabase]", res.error.message); return 0; }
    return (res.data as number) ?? 0;
  },
  async setInvoicePaymentMethod(invoiceId, method) {
    // Direct UPDATE (invoices_clinic_all policy permits staff). Sync a single leg too.
    const inv = need<Invoice>(await sbc().from("invoices").select("*").eq("id", invoiceId).single());
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const patch: Record<string, unknown> = { payment_method: method };
    if (Array.isArray(inv.payment_details) && inv.payment_details.length === 1) {
      patch.payment_details = [{ ...inv.payment_details[0], method }];
    }
    return need<Invoice>(await sbc().from("invoices").update(patch).eq("id", invoiceId).select().single());
  },
  async setInvoicePaymentDetails(invoiceId, legs) {
    const inv = need<Invoice>(await sbc().from("invoices").select("*").eq("id", invoiceId).single());
    if (inv.status === "refunded") throw new Error("invoice refunded");
    const clean = (legs as PaymentSplit[]).filter((l) => l && l.method && Number(l.amount) > 0);
    if (!clean.length) return inv;
    const fixes = (inv.payment_details ?? []).filter((l) => Number(l.amount) < 0);
    const dominant = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
    return need<Invoice>(await sbc().from("invoices")
      .update({ payment_details: [...clean, ...fixes], payment_method: dominant })
      .eq("id", invoiceId).select().single());
  },
  async correctInvoiceReceipt(invoiceId, amount, reason, method) {
    const { data, error } = await sbc().rpc("correct_invoice_receipt", {
      p_invoice: invoiceId, p_amount: amount, p_reason: reason, p_method: method ?? null,
    });
    if (error) throw error;
    return data as Invoice;
  },
  async searchCustomers(query, clinicId) {
    let q = sbc().from("invoices").select("customer_name,customer_phone,created_at").order("created_at", { ascending: false }).limit(300);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const rows = listOf<{ customer_name: string | null; customer_phone: string | null; created_at: string }>(await q);
    return dedupeCustomers(rows, query);
  },
  async listExpenses(clinicId, range) {
    return allPages<Expense>(() => {
      let q = sbc().from("expenses").select("*").order("spent_at", { ascending: false });
      if (clinicId) q = q.eq("clinic_id", clinicId);
      return inRange(q, "spent_at", range);
    });
  },
  async addExpense(input) {
    // clinic_id + staff_id are stamped by the column defaults (auth_clinic() / auth.uid());
    // send only the explicit fields so a caller can never set another clinic's id.
    //
    // والمعرّف يولَد بالجهاز لا بالقاعدة: بهذا وحده يصير الرفعُ المؤجَّل
    // متسامحاً مع التكرار، فسحبٌ سُجّل والنت واگع يدخل الطابور ولا يضيع —
    // ولا ينكتب مرّتين لو كان الطلب الأول قد وصل وضاع جوابه.
    const row = {
      id: uuid(), amount: input.amount, description: input.description,
      category: input.category ?? null, method: input.method ?? "cash", spent_at: input.spent_at,
    };
    try {
      return need<Expense>(await sbc().from("expenses").insert(row).select().single());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!outboxEnqueue("expenses", row as Record<string, unknown> & { id: string })) throw e;
      return { ...row, clinic_id: null, created_at: new Date().toISOString() } as Expense;
    }
  },
  async deleteExpense(id) {
    ok(await sbc().from("expenses").delete().eq("id", id));
  },

  /* ---- الرواتب (0112) ----
   * القراءة مباشرة (RLS تحصر: المدير يرى الكل، والموظف قسيمته وحدها).
   * الكتابة **كلّها** عبر دوال SECURITY DEFINER: سقف الاستقطاع، ومنع اعتماد
   * راتب النفس، والتجميد بعد الاعتماد — منطقٌ لا تعبّر عنه سياسة صفوف. */
  async getPayrollPolicy() {
    const { data, error } = await sbc().rpc("payroll_get_policy");
    if (error) throw error;
    return data as PayrollPolicyDTO;
  },
  async setPayrollPolicy(p) {
    const { data, error } = await sbc().rpc("payroll_set_policy", {
      p_basis: p.dayRateBasis, p_working_days: p.workingDays,
      p_cap_pct: p.deductionCapPct, p_round_to: p.roundTo,
    });
    if (error) throw error;
    return data as PayrollPolicyDTO;
  },
  async listStaffComp() {
    return listOf<StaffComp>(await sbc().from("staff_comp").select("*").order("effective_from", { ascending: false }));
  },
  async setStaffComp(staffId, from, base, note) {
    const { data, error } = await sbc().rpc("payroll_set_comp", {
      p_staff: staffId, p_from: from, p_base: base, p_note: note ?? null,
    });
    if (error) throw error;
    return data as StaffComp;
  },
  async deleteStaffComp(id) {
    const { error } = await sbc().rpc("payroll_delete_comp", { p_id: id });
    if (error) throw error;
  },
  async listStaffRecurring() {
    return listOf<StaffRecurring>(await sbc().from("staff_recurring").select("*"));
  },
  async addStaffRecurring(staffId, code, amount, note) {
    const { data, error } = await sbc().rpc("payroll_set_recurring", {
      p_staff: staffId, p_code: code, p_amount: amount, p_note: note ?? null,
    });
    if (error) throw error;
    return data as StaffRecurring;
  },
  async deleteStaffRecurring(id) {
    const { error } = await sbc().rpc("payroll_delete_recurring", { p_id: id });
    if (error) throw error;
  },
  async listPayrollAdjustments(period) {
    let q = sbc().from("payroll_adjustments").select("*").order("created_at", { ascending: true });
    if (period) q = q.eq("period", period);
    return listOf<PayrollAdjustment>(await q);
  },
  async addPayrollAdjustment(staffId, period, code, amount, qty, reason) {
    const { data, error } = await sbc().rpc("payroll_add_adjustment", {
      p_staff: staffId, p_period: period, p_code: code,
      p_amount: amount ?? 0, p_qty: qty ?? null, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as PayrollAdjustment;
  },
  async deletePayrollAdjustment(id) {
    const { error } = await sbc().rpc("payroll_delete_adjustment", { p_id: id });
    if (error) throw error;
  },
  async reversePayrollAdjustment(id, amount, qty, reason) {
    const { data, error } = await sbc().rpc("payroll_reverse_adjustment", {
      p_id: id, p_amount: amount ?? null, p_qty: qty ?? null, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as PayrollAdjustment;
  },
  async unpayPayslip(slipId) {
    const { data, error } = await sbc().rpc("payroll_unpay_slip", { p_slip: slipId });
    if (error) throw error;
    return data as Payslip;
  },
  async listPayrollRuns() {
    return listOf<PayrollRun>(await sbc().from("payroll_runs").select("*").order("period", { ascending: false }));
  },
  async openPayrollRun(period) {
    const { data, error } = await sbc().rpc("payroll_open_run", { p_period: period });
    if (error) throw error;
    return data as PayrollRun;
  },
  async savePayrollSlips(runId, slips) {
    const { data, error } = await sbc().rpc("payroll_save_slips", { p_run: runId, p_slips: slips });
    if (error) throw error;
    return data as { run: string; payslips: number };
  },
  async listPayslips(runId) {
    let q = sbc().from("payslips").select("*").order("staff_name");
    if (runId) q = q.eq("run_id", runId);
    return listOf<Payslip>(await q);
  },
  async listPayslipLines(payslipIds) {
    let q = sbc().from("payslip_lines").select("*");
    if (payslipIds) {
      if (!payslipIds.length) return [];
      q = q.in("payslip_id", payslipIds);
    }
    return listOf<PayslipLine>(await q);
  },
  async approvePayrollRun(runId) {
    const { data, error } = await sbc().rpc("payroll_approve", { p_run: runId });
    if (error) throw error;
    return data as PayrollRun;
  },
  async payPayslip(slipId, method) {
    const { data, error } = await sbc().rpc("payroll_pay_slip", { p_slip: slipId, p_method: method });
    if (error) throw error;
    return data as Payslip;
  },
  async closePayrollRun(runId) {
    const { data, error } = await sbc().rpc("payroll_close_run", { p_run: runId });
    if (error) throw error;
    return data as PayrollRun;
  },
  async listStaffLoans() {
    return listOf<StaffLoan>(await sbc().from("staff_loans").select("*").order("created_at", { ascending: false }));
  },
  async listLoanEvents(loanId) {
    let q = sbc().from("staff_loan_events").select("*").order("at", { ascending: false });
    if (loanId) q = q.eq("loan_id", loanId);
    return listOf<StaffLoanEvent>(await q);
  },
  async disburseLoan(staffId, _staffName, principal, installment, reason, method) {
    // الاسم يقرأه الخادم من صفّ الكادر لا من العميل — اسمٌ يرسله المتصفّح
    // يجعل بيان المصروف قابلاً للتزوير.
    const { data, error } = await sbc().rpc("payroll_disburse_loan", {
      p_staff: staffId, p_principal: principal, p_installment: installment,
      p_reason: reason, p_method: method,
    });
    if (error) throw error;
    return data as StaffLoan;
  },
  async disburseAdvance(staffId, _staffName, amount, reason, method) {
    const { data, error } = await sbc().rpc("payroll_disburse_advance", {
      p_staff: staffId, p_amount: amount, p_reason: reason, p_method: method,
    });
    if (error) throw error;
    return data as StaffLoan;
  },
  async writeOffLoan(loanId, note) {
    const { data, error } = await sbc().rpc("payroll_write_off_loan", { p_loan: loanId, p_note: note });
    if (error) throw error;
    return data as StaffLoan;
  },
  async logWhatsApp(input) {
    ok(await sbc().from("wa_messages").insert(input));
  },
  async listWhatsAppLog() {
    return listOf<WhatsAppMessage>(await sbc().from("wa_messages").select("*").order("sent_at", { ascending: false }).limit(1000));
  },
  async purgeAuditLog() {
    // Pre-0044 databases don't have the RPC yet — never surface that to the UI.
    try { await sbc().rpc("purge_activity_log"); } catch { /* retention starts after the migration */ }
  },
  async logClientEvent(event, details) {
    // Pre-0045 databases don't have the RPC yet — best-effort, always silent.
    try { await sbc().rpc("log_client_event", { p_event: event, p_details: details ?? {} }); } catch { /* ignore */ }
  },
  async listAuditLog(_clinicId, limit = 200) {
    // RLS already scopes to the manager's clinic; just order + cap.
    return listOf<AuditEntry>(await sbc().from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit));
  },
  async listLoginEvents(_clinicId, limit = 100) {
    return listOf<LoginEvent>(await sbc().from("login_events").select("*").order("created_at", { ascending: false }).limit(limit));
  },
  async logLogin(input) {
    // clinic_id/user_id are stamped by the column defaults (auth_clinic()/auth.uid()).
    ok(await sbc().from("login_events").insert({ email: input.email ?? null, name: input.name ?? null }));
  },
};

/** Live when Supabase is configured, otherwise the local demo store. */
const baseRepo = supabase ? supabaseRepo : demoRepo;

// ---------------------------------------------------------------------------
// Read-only guard. When a clinic's subscription has lapsed (was a subscriber,
// now expired → read-only access), it may still VIEW everything but must not
// change anything. Rather than disable every button, we block writes at the one
// chokepoint they all pass through: the repo. A checker is registered by
// src/lib/subscription.ts; it defaults to "allow" so nothing ever locks by
// accident (fail-open). Only method names that mutate are gated — reads pass
// straight through.
// ---------------------------------------------------------------------------
let readOnlyChecker: () => boolean = () => false;
export function registerReadOnlyChecker(fn: () => boolean) { readOnlyChecker = fn; }

/** Thrown by a blocked write so call sites can show a "renew to edit" message. */
export class ReadOnlyError extends Error {
  constructor() { super("READ_ONLY"); this.name = "ReadOnlyError"; }
}

/**
 * قائمة السماح — لا قائمة المنع.
 *
 * كانت البوابة تمنع الأسماء التي تبدأ ببادئات كتابة معروفة، فتسرّبت منها
 * عمليات حقيقية لأن أسماءها لا تبدأ بواحدة منها: `retailCheckout` (إتمام بيع
 * كامل!) و`uploadMedia` و`closeJourney` و`markInboxHandled` و`claimPet`…
 * والأخطر أن كل دالة جديدة تُضاف مستقبلاً تتسرّب افتراضياً.
 *
 * القاعدة انقلبت: في وضع القراءة فقط كل شيء ممنوع إلا ما يُعلَن هنا قراءةً
 * صريحة. الخطأ الآن يميل للأمان — دالة جديدة تُمنع حتى تُراجَع، بدل أن تمرّ
 * وتكتب على عيادة منتهي اشتراكها.
 */
const READ_ONLY_ALLOWED = new Set<string>([
  // --- كل القراءات (مولَّدة من دوال الريبو نفسها، فلا تسقط واحدة سهواً) ---
  "getActiveJourney", "getClinicVisit", "getDailyNote", "getPet", "getPetBySerial",
  "getPetByToken", "getPetsByIds", "getPetsByOwnerEmail", "getProductByBarcode",
  "getSharedPetsByOwnerId", "getStoreProfile", "listAdmissions", "listAdmissionsForPet",
  "listAllInvoiceItems", "listAllMedia", "listAllPets", "listAllSurgeries", "listAllTreatments",
  "listAllVaccinations", "listAllVisits", "listAppointmentsForDay", "listAppointmentsForOwner",
  "listAppointmentsForPet", "listAppointmentsInRange", "listAuditLog", "listBookingRequests",
  "listBookingsForDay", "listBranches", "listCareEntries", "listClinicDirectory",
  "listClinicLabResults", "listClinicStaffPublic", "listClinicTreatments", "listClinicVisits",
  "listClinicVisitsForPet", "listCompanies", "listCompanySections", "listCouriers",
  "listDeliveryOrders", "listDeviceInbox", "listDeviceLinks", "listDoctorBusySlots",
  "listEndedClinicVisits", "listExpenses", "listFeatureRequests", "listGeneratedBarcodes",
  "listInvoiceItems", "listInvoices", "listJourneyEvents", "listLabResults", "listLoginEvents",
  "listMedia", "listOpenClinicVisits", "listPetMovements", "listPetNotes", "listPets",
  "listProblems", "listProducts", "listPurchaseItems", "listPurchasePayments", "listPurchases",
  "listReminders", "listStoreOrders", "listSurgeries", "listTreatments", "listVaccinations",
  "listVisits", "listWaiting", "listWeights", "listWhatsAppLog", "searchCustomers",
  // --- الرواتب: القراءة تبقى بالاشتراك المنتهي (الموظف يشوف قسيمته) ---
  "getPayrollPolicy", "listStaffComp", "listStaffRecurring", "listPayrollRuns",
  "listPayslips", "listPayslipLines", "listStaffLoans", "listLoanEvents",
  "listPayrollAdjustments",
  // --- استعلامات مساعدة لا تكتب ---
  "checkStoreSlug", "slotTaken", "supportsBulkGroup", "supportsSupplierLedger",
  "adminListFeatureRequests", "systemHealth",
  // --- واجهات الزبون العامة (تعمل خارج جلسة العيادة) ---
  "storeFrontPublic", "storeCatalogPublic", "placeStoreOrder", "trackJourneyPublic",
  "reactJourneyPublic", "claimPet", "claimPetsByPhone",
  // --- سجلات تشغيلية لا تمثّل إدخال بيانات (وحجبها يكسر الدخول) ---
  "logLogin", "logClientEvent",
]);

/** يُستعمل بالاختبارات وبالتشخيص: هل هذه الدالة مسموحة بوضع القراءة فقط؟ */
export const isReadAllowed = (name: string): boolean => READ_ONLY_ALLOWED.has(name);

export const repo: typeof demoRepo = new Proxy(baseRepo, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function" && typeof prop === "string" && !READ_ONLY_ALLOWED.has(prop)) {
      return (...args: unknown[]) => {
        if (readOnlyChecker()) return Promise.reject(new ReadOnlyError());
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
}) as typeof demoRepo;
