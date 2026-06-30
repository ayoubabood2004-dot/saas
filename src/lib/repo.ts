// Data-access layer. Currently backed by the local demo store so the app is fully
// usable before a backend exists. Each method is async and isolated so a Supabase
// implementation can be dropped in here without touching the UI.
import { loadDB, saveDB } from "./demoStore";
import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, AppointmentStatus, TreatmentEntry, Admission, Reminder, Product, Invoice, InvoiceItem, CheckoutItem, SaleMeta, Customer, DiscountType, WhatsAppMessage } from "@/types";
import { uid, uuid, ageMonths } from "./utils";

/** Resolve a discount input (percent 0–100 or a fixed amount) to an amount, clamped to [0, subtotal]. */
export function resolveDiscount(subtotal: number, type: DiscountType | null | undefined, value: number): number {
  if (!type || !value || value <= 0) return 0;
  if (type === "percent") return Math.round(subtotal * Math.min(value, 100)) / 100;
  return Math.min(value, subtotal);
}

/** Demo-store sale core: create the invoice + its items and decrement stock. Shared by
 *  the quick POS checkout and the retail checkout (which adds customer/discount/payment). */
function createInvoiceLocal(items: CheckoutItem[], meta?: SaleMeta): Invoice {
  const db = loadDB();
  if (!db.products) db.products = [];
  if (!db.invoices) db.invoices = [];
  if (!db.invoiceItems) db.invoiceItems = [];
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const cost = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const dtype = meta?.discount_type ?? null;
  const discount = resolveDiscount(subtotal, dtype, meta?.discount_value ?? 0);
  const total = Math.max(0, subtotal - discount);
  const invoice: Invoice = {
    id: uid("inv"),
    customer_name: meta?.customer_name?.trim() || null,
    customer_phone: meta?.customer_phone?.trim() || null,
    pet_name: meta?.pet_name?.trim() || null,
    subtotal, discount, discount_type: discount > 0 ? dtype : null,
    payment_method: meta?.payment_method ?? null,
    total, cost_total: cost, profit: total - cost, item_count: count,
    print_count: 0, status: "paid", refunded_at: null,
    staff_id: meta?.staff_id?.trim() || null,
    created_at: new Date().toISOString(),
  };
  db.invoices.push(invoice);
  for (const i of items) {
    db.invoiceItems.push({ id: uid("ii"), invoice_id: invoice.id, product_id: i.product_id ?? null, name: i.name, barcode: i.barcode ?? null, qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost, line_total: i.qty * i.unit_price });
    if (i.product_id) {
      const p = db.products.find((x) => x.id === i.product_id);
      if (p) p.stock = Math.max(0, p.stock - i.qty);
    }
  }
  saveDB(db);
  return invoice;
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

  async listMedia(petId: string): Promise<MediaItem[]> {
    return loadDB()
      .media.filter((m) => m.pet_id === petId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
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

  /** Toggle a scheduled treatment between given/not-given (flowsheet check-off). */
  async setTreatmentGiven(id: string, given: boolean, by?: string): Promise<void> {
    const db = loadDB();
    const tx = db.treatments.find((t) => t.id === id);
    if (!tx) return;
    tx.administered_at = given ? new Date().toISOString() : null;
    tx.administered_by = given ? by : undefined;
    saveDB(db);
  },

  async listAdmissions(_clinicId?: string): Promise<Admission[]> {
    return loadDB()
      .admissions.slice()
      .sort((a, b) => b.admitted_on.localeCompare(a.admitted_on));
  },

  async listAdmissionsForPet(petId: string): Promise<Admission[]> {
    return loadDB()
      .admissions.filter((a) => a.pet_id === petId)
      .sort((a, b) => b.admitted_on.localeCompare(a.admitted_on));
  },

  async addAdmission(input: Omit<Admission, "id">): Promise<Admission> {
    const db = loadDB();
    const adm: Admission = { ...input, id: uid("adm") };
    db.admissions.push(adm);
    saveDB(db);
    return adm;
  },

  async updateAdmission(id: string, patch: Partial<Admission>): Promise<void> {
    const db = loadDB();
    const adm = db.admissions.find((a) => a.id === id);
    if (adm) {
      Object.assign(adm, patch);
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
  async listInvoices(_clinicId?: string): Promise<Invoice[]> {
    return (loadDB().invoices ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async checkout(items: CheckoutItem[]): Promise<Invoice> {
    return createInvoiceLocal(items);
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
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) {
        if (it.product_id) {
          const p = (db.products ?? []).find((x) => x.id === it.product_id);
          if (p) p.stock += it.qty; // return units to stock
        }
      }
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
      for (const it of (db.invoiceItems ?? []).filter((x) => x.invoice_id === invoiceId)) {
        if (it.product_id) {
          const p = (db.products ?? []).find((x) => x.id === it.product_id);
          if (p) p.stock += it.qty;
        }
      }
    }
    db.invoices = (db.invoices ?? []).filter((x) => x.id !== invoiceId);
    db.invoiceItems = (db.invoiceItems ?? []).filter((x) => x.invoice_id !== invoiceId);
    saveDB(db);
  },
  async bumpInvoicePrints(invoiceId: string): Promise<number> {
    const db = loadDB();
    const inv = (db.invoices ?? []).find((x) => x.id === invoiceId);
    if (!inv) return 0;
    inv.print_count = (inv.print_count ?? 0) + 1;
    saveDB(db);
    return inv.print_count;
  },
  /** Distinct walk-in customers seen on past invoices, most-recent first. */
  async searchCustomers(query: string, _clinicId?: string): Promise<Customer[]> {
    return dedupeCustomers(loadDB().invoices ?? [], query);
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
};

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
  async listMedia(petId) {
    return listOf<MediaItem>(await sbc().from("media_items").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async addMedia(input) {
    return need<MediaItem>(await sbc().from("media_items").insert(input).select().single());
  },
  async uploadMedia(petId, upload, kind, caption) {
    const sb = sbc();
    // UUID object name keeps uploads collision-free; foldered by pet for tidiness.
    const path = `${petId}/${uuid()}.${upload.ext}`;
    const up = await sb.storage.from("medical-media").upload(path, upload.blob, {
      contentType: upload.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) {
      const e = new Error(up.error.message) as Error & { name: string };
      e.name = "StorageError";
      throw e;
    }
    const { data: pub } = sb.storage.from("medical-media").getPublicUrl(path);
    // Link the stored file to the pet's record (FK pet_id) so it lives in the vault.
    return need<MediaItem>(
      await sb.from("media_items").insert({ pet_id: petId, kind, url: pub.publicUrl, caption }).select().single(),
    );
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
  async addTreatment(input) {
    return need<TreatmentEntry>(await sbc().from("treatment_entries").insert(input).select().single());
  },
  async deleteTreatment(id) {
    ok(await sbc().from("treatment_entries").delete().eq("id", id));
  },
  async setTreatmentGiven(id, given, by) {
    ok(await sbc().from("treatment_entries").update({ administered_at: given ? new Date().toISOString() : null, administered_by: given ? by : null }).eq("id", id));
  },
  async listAdmissions(clinicId) {
    let q = sbc().from("admissions").select("*").order("admitted_on", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Admission>(await q);
  },
  async listAdmissionsForPet(petId) {
    return listOf<Admission>(await sbc().from("admissions").select("*").eq("pet_id", petId).order("admitted_on", { ascending: false }));
  },
  async addAdmission(input) {
    return need<Admission>(await sbc().from("admissions").insert(input).select().single());
  },
  async updateAdmission(id, patch) {
    ok(await sbc().from("admissions").update(patch).eq("id", id));
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
  async listInvoices(clinicId) {
    let q = sbc().from("invoices").select("*").order("created_at", { ascending: false });
    if (clinicId) q = q.eq("clinic_id", clinicId);
    return listOf<Invoice>(await q);
  },
  async checkout(items) {
    // Atomic on the server (creates invoice + items, decrements stock, computes profit).
    return need<Invoice>(await sbc().rpc("pos_checkout", { p_items: items }));
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
  async bumpInvoicePrints(invoiceId) {
    const res = await sbc().rpc("bump_invoice_prints", { p_invoice: invoiceId });
    if (res.error) { console.error("[supabase]", res.error.message); return 0; }
    return (res.data as number) ?? 0;
  },
  async searchCustomers(query, clinicId) {
    let q = sbc().from("invoices").select("customer_name,customer_phone,created_at").order("created_at", { ascending: false }).limit(300);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const rows = listOf<{ customer_name: string | null; customer_phone: string | null; created_at: string }>(await q);
    return dedupeCustomers(rows, query);
  },
  async logWhatsApp(input) {
    ok(await sbc().from("wa_messages").insert(input));
  },
  async listWhatsAppLog() {
    return listOf<WhatsAppMessage>(await sbc().from("wa_messages").select("*").order("sent_at", { ascending: false }).limit(1000));
  },
};

/** Live when Supabase is configured, otherwise the local demo store. */
export const repo = supabase ? supabaseRepo : demoRepo;
