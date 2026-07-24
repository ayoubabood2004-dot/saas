// Data-access layer. Currently backed by the local demo store so the app is fully
// usable before a backend exists. Each method is async and isolated so a Supabase
// implementation can be dropped in here without touching the UI.
import { loadDB, saveDB } from "./demoStore";
import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, AppointmentStatus, TreatmentEntry, Admission, Branch, Reminder, Product, Company, CompanySection, Purchase, PurchaseItem, PurchaseDraftLine, PurchaseMeta, Courier, DeliveryOrder, PetMovement, DemoDB, Invoice, InvoiceItem, CheckoutItem, SaleMeta, Customer, DiscountType, PaymentMethod, PaymentSplit, WhatsAppMessage, AuditEntry, LoginEvent, PetNote, Expense, ClinicVisit } from "@/types";
import { uid, uuid, ageMonths } from "./utils";

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
      if (p) {
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
/** 30-day retention — the demo mirror of purge_activity_log(). */
function demoAuditPurge() {
  const cutoff = Date.now() - 30 * 86400000;
  try {
    localStorage.setItem(DEMO_AUDIT_KEY, JSON.stringify(demoAuditLoad().filter((e) => new Date(e.created_at).getTime() >= cutoff)));
  } catch { /* ignore */ }
}
function demoLoginLoad(): LoginEvent[] {
  try { const r = localStorage.getItem(DEMO_LOGIN_KEY); if (r) return JSON.parse(r) as LoginEvent[]; } catch { /* ignore */ }
  return [];
}
function demoLoginSave(list: LoginEvent[]) { try { localStorage.setItem(DEMO_LOGIN_KEY, JSON.stringify(list)); } catch { /* ignore */ } }

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

  async getPetByToken(token: string): Promise<Pet | undefined> {
    return loadDB().pets.find((p) => p.passport_token.toUpperCase() === token.trim().toUpperCase());
  },

  async getPetBySerial(serial: string): Promise<Pet | undefined> {
    const s = serial.trim();
    return loadDB().pets.find((p) => p.serial === s);
  },

  /** Owner claims an existing animal (by serial) into their profile. */
  async claimPet(serial: string, owner: { owner_id: string; owner_name?: string; owner_phone?: string; owner_email?: string }): Promise<Pet | undefined> {
    const db = loadDB();
    const pet = db.pets.find((p) => p.serial === serial.trim());
    if (!pet) return undefined;
    pet.owner_id = owner.owner_id;
    if (owner.owner_name) pet.owner_name = owner.owner_name;
    if (owner.owner_phone) pet.owner_phone = owner.owner_phone;
    if (owner.owner_email) pet.owner_email = owner.owner_email;
    saveDB(db);
    return pet;
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

  async addTreatment(input: Omit<TreatmentEntry, "id" | "created_at">): Promise<TreatmentEntry> {
    const db = loadDB();
    const entry: TreatmentEntry = { ...input, id: uid("tx"), created_at: new Date().toISOString() };
    db.treatments.push(entry);
    saveDB(db);
    return entry;
  },

  async deleteTreatment(id: string): Promise<void> {
    const db = loadDB();
    db.treatments = db.treatments.filter((t) => t.id !== id);
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
  async getProductByBarcode(barcode: string, _clinicId?: string): Promise<Product | undefined> {
    const code = barcode.trim();
    return (loadDB().products ?? []).find((p) => (p.barcode ?? "") === code);
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
  async listPurchases(_clinicId?: string): Promise<Purchase[]> {
    return (loadDB().purchases ?? []).slice().sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""));
  },
  async listPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
    return (loadDB().purchaseItems ?? []).filter((x) => x.purchase_id === purchaseId);
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
      // Resolve a product: explicit id, else an existing barcode in stock.
      let pid = l.product_id ?? null;
      if (!pid && l.barcode) pid = db.products.find((p) => (p.barcode ?? "") === l.barcode)?.id ?? null;
      const existing = pid ? db.products.find((x) => x.id === pid) : undefined;
      if (existing) {
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
        const np: Product = {
          id: uid("prod"), clinic_id: null, company_id: companyId,
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
      notes: meta.notes?.trim() || null, purchased_at: meta.purchased_at || now,
      staff_id: meta.staff_id ?? null, created_at: now,
    };
    db.purchases.push(purchase);
    saveDB(db);
    return purchase;
  },

  async listInvoices(_clinicId?: string): Promise<Invoice[]> {
    return (loadDB().invoices ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
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
  async listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return (loadDB().invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId);
  },
  async listAllInvoiceItems(_clinicId?: string): Promise<InvoiceItem[]> {
    return (loadDB().invoiceItems ?? []).slice();
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
      inv.payment_details = clean;
      inv.payment_method = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
      saveDB(db);
    }
    return inv;
  },
  /** Distinct walk-in customers seen on past invoices, most-recent first. */
  async searchCustomers(query: string, _clinicId?: string): Promise<Customer[]> {
    return dedupeCustomers(loadDB().invoices ?? [], query);
  },

  /* ---- Cash expenses / withdrawals ledger ---- */
  async listExpenses(_clinicId?: string): Promise<Expense[]> {
    return demoExpensesLoad().slice().sort((a, b) => b.spent_at.localeCompare(a.spent_at));
  },
  async addExpense(input: Omit<Expense, "id" | "created_at">): Promise<Expense> {
    const e: Expense = { ...input, id: uid("exp"), clinic_id: null, created_at: new Date().toISOString() };
    demoExpensesSave([e, ...demoExpensesLoad()]);
    return e;
  },
  async deleteExpense(id: string): Promise<void> {
    const before = demoExpensesLoad();
    const row = before.find((x) => x.id === id);
    demoExpensesSave(before.filter((x) => x.id !== id));
    if (row) demoAuditPush({ action: "DELETE", entity: "expenses", entity_id: id, details: row as unknown as Record<string, unknown> });
  },

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
  addClinicVisit: { entity: "clinic_visits", action: "INSERT" },
  updateClinicVisit: { entity: "clinic_visits", action: "UPDATE" },
  addExpense: { entity: "expenses", action: "INSERT" },
  addMedia: { entity: "media_items", action: "INSERT" },
  addTreatment: { entity: "treatment_entries", action: "INSERT" },
  setTreatmentGiven: { entity: "treatment_entries", action: "UPDATE" },
  deleteTreatment: { entity: "treatment_entries", action: "DELETE" },
  addAdmission: { entity: "admissions", action: "INSERT" },
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
  createCourier: { entity: "couriers", action: "INSERT" },
  updateCourier: { entity: "couriers", action: "UPDATE" },
  createDeliveryOrder: { entity: "delivery_orders", action: "INSERT" },
  updateDeliveryOrder: { entity: "delivery_orders", action: "UPDATE" },
  checkout: { entity: "invoices", action: "INSERT" },
  retailCheckout: { entity: "invoices", action: "INSERT" },
  settleInvoice: { entity: "invoices", action: "UPDATE" },
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
    let q = sbc().from("pets").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Pet>(await q);
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
  async getPetBySerial(serial) {
    return maybe<Pet>(await sbc().from("pets").select("*").eq("serial", serial.trim()).maybeSingle());
  },
  async claimPet(serial, owner) {
    const patch: Partial<Pet> = { owner_id: owner.owner_id };
    if (owner.owner_name) patch.owner_name = owner.owner_name;
    if (owner.owner_phone) patch.owner_phone = owner.owner_phone;
    if (owner.owner_email) patch.owner_email = owner.owner_email;
    return maybe<Pet>(await sbc().from("pets").update(patch).eq("serial", serial.trim()).select().maybeSingle());
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
    const serial = String(Math.floor(10000 + Math.random() * 90000));
    return need<Pet>(await sbc().from("pets").insert({ ...input, serial }).select().single());
  },
  async updatePet(petId, patch) {
    return maybe<Pet>(await sbc().from("pets").update(patch).eq("id", petId).select().maybeSingle());
  },
  async deletePet(petId) {
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
    if (petIds.length === 0) return [];
    return listOf<Vaccination>(await sbc().from("vaccinations").select("*").in("pet_id", petIds));
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
    if (petIds.length === 0) return [];
    return listOf<MedicalVisit>(await sbc().from("medical_visits").select("*").in("pet_id", petIds).order("visit_date", { ascending: false }));
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
    if (petIds.length === 0) return [];
    const items = listOf<MediaItem>(await sbc().from("media_items").select("*").in("pet_id", petIds));
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
    return listOf<Appointment>(
      await sbc().from("appointments").select("*").gte("scheduled_at", `${startISO.slice(0, 10)}T00:00:00`).lte("scheduled_at", `${endISO.slice(0, 10)}T23:59:59.999`).neq("status", "cancelled").order("scheduled_at", { ascending: true }),
    );
  },
  async listWaiting(doctorId) {
    return listOf<Appointment>(await sbc().from("appointments").select("*").eq("doctor_id", doctorId).in("status", ["checked_in", "in_room"]).order("triage_score", { ascending: true }));
  },
  async slotTaken(doctorId, scheduledAt) {
    return listOf<{ id: string }>(await sbc().from("appointments").select("id").eq("doctor_id", doctorId).eq("scheduled_at", scheduledAt).neq("status", "cancelled")).length > 0;
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
    if (petIds.length === 0) return [];
    return listOf<TreatmentEntry>(await sbc().from("treatment_entries").select("*").in("pet_id", petIds));
  },
  async addTreatment(input) {
    return need<TreatmentEntry>(await sbc().from("treatment_entries").insert(input).select().single());
  },
  async deleteTreatment(id) {
    ok(await sbc().from("treatment_entries").delete().eq("id", id));
  },
  async setTreatmentGiven(id, given, by, at) {
    ok(await sbc().from("treatment_entries").update({ administered_at: given ? (at || new Date().toISOString()) : null, administered_by: given ? by : null }).eq("id", id));
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
    let q = sbc().from("reminders").select("*");
    if (filter && "ownerId" in filter) {
      q = filter.ownerId == null ? q.is("owner_id", null) : q.eq("owner_id", filter.ownerId);
    }
    return listOf<Reminder>(await q.order("date", { ascending: true }));
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
    let q = sbc().from("products").select("*").order("name", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Product>(await q);
  },
  async getProductByBarcode(barcode, clinicId) {
    let q = sbc().from("products").select("*").eq("barcode", barcode.trim());
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return maybe<Product>(await q.maybeSingle());
  },
  async createProduct(input) {
    return need<Product>(await sbc().from("products").insert(input).select().single());
  },
  async updateProduct(id, patch) {
    return maybe<Product>(await sbc().from("products").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteProduct(id) {
    ok(await sbc().from("products").delete().eq("id", id));
  },

  /* ---------------- Companies (الشركات) ---------------- */
  async listCompanies(clinicId) {
    let q = sbc().from("companies").select("*").order("name", { ascending: true });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Company>(await q);
  },
  async createCompany(input) {
    return need<Company>(await sbc().from("companies").insert(input).select().single());
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
    let q = sbc().from("company_sections").select("*").order("name", { ascending: true });
    if (companyId) q = q.eq("company_id", companyId);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<CompanySection>(await q);
  },
  async createCompanySection(input) {
    return need<CompanySection>(await sbc().from("company_sections").insert(input).select().single());
  },
  async updateCompanySection(id, patch) {
    return maybe<CompanySection>(await sbc().from("company_sections").update(patch).eq("id", id).select().maybeSingle());
  },
  async deleteCompanySection(id) {
    // FK on products.section_id is ON DELETE SET NULL, so products survive.
    ok(await sbc().from("company_sections").delete().eq("id", id));
  },

  /* ---------------- Purchases (المشتريات) ---------------- */
  async listPurchases(clinicId) {
    let q = sbc().from("purchases").select("*").order("purchased_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Purchase>(await q);
  },
  async listPurchaseItems(purchaseId) {
    return listOf<PurchaseItem>(await sbc().from("purchase_items").select("*").eq("purchase_id", purchaseId));
  },
  async recordPurchase(lines, meta) {
    // Atomic on the server: restock/create products + insert purchase & items.
    return need<Purchase>(await sbc().rpc("record_purchase", { p_lines: lines, p_meta: meta }));
  },

  async listInvoices(clinicId) {
    let q = sbc().from("invoices").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Invoice>(await q);
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
    let q = sbc().from("delivery_orders").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<DeliveryOrder>(await q);
  },
  async createDeliveryOrder(input) {
    return need<DeliveryOrder>(await sbc().from("delivery_orders").insert(input).select().single());
  },
  async updateDeliveryOrder(id, patch) {
    return maybe<DeliveryOrder>(await sbc().from("delivery_orders").update(patch).eq("id", id).select().maybeSingle());
  },

  /* ---------------- Retail & advanced invoicing ---------------- */
  async retailCheckout(items, meta) {
    // Atomic on the server: invoice (+ customer/discount/payment) + items + stock.
    return need<Invoice>(await sbc().rpc("retail_checkout", { p_items: items, p_meta: meta }));
  },
  async listInvoiceItems(invoiceId) {
    return listOf<InvoiceItem>(await sbc().from("invoice_items").select("*").eq("invoice_id", invoiceId));
  },
  async listAllInvoiceItems(clinicId) {
    let q = sbc().from("invoice_items").select("*");
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<InvoiceItem>(await q);
  },
  async refundInvoice(invoiceId) {
    // Server marks refunded + returns units to stock (idempotent).
    return need<Invoice>(await sbc().rpc("refund_invoice", { p_invoice: invoiceId }));
  },
  async deleteInvoice(invoiceId) {
    ok(await sbc().rpc("delete_invoice", { p_invoice: invoiceId }));
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
    const dominant = clean.reduce((b, p) => (p.amount > b.amount ? p : b), clean[0]).method;
    return need<Invoice>(await sbc().from("invoices").update({ payment_details: clean, payment_method: dominant }).eq("id", invoiceId).select().single());
  },
  async searchCustomers(query, clinicId) {
    let q = sbc().from("invoices").select("customer_name,customer_phone,created_at").order("created_at", { ascending: false }).limit(300);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const rows = listOf<{ customer_name: string | null; customer_phone: string | null; created_at: string }>(await q);
    return dedupeCustomers(rows, query);
  },
  async listExpenses(clinicId) {
    let q = sbc().from("expenses").select("*").order("spent_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Expense>(await q);
  },
  async addExpense(input) {
    // clinic_id + staff_id are stamped by the column defaults (auth_clinic() / auth.uid());
    // send only the explicit fields so a caller can never set another clinic's id.
    return need<Expense>(await sbc().from("expenses").insert({
      amount: input.amount, description: input.description,
      category: input.category ?? null, spent_at: input.spent_at,
    }).select().single());
  },
  async deleteExpense(id) {
    ok(await sbc().from("expenses").delete().eq("id", id));
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

const WRITE_RE = /^(add|create|update|delete|settle|checkout|save|remove|discharge|refund|set|record|invalidate|cancel|apply|restock|move|assign|activate|bulk|import|deduct|upsert|toggle)/i;

export const repo: typeof demoRepo = new Proxy(baseRepo, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function" && typeof prop === "string" && WRITE_RE.test(prop)) {
      return (...args: unknown[]) => {
        if (readOnlyChecker()) return Promise.reject(new ReadOnlyError());
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
}) as typeof demoRepo;
