// Data-access layer. Currently backed by the local demo store so the app is fully
// usable before a backend exists. Each method is async and isolated so a Supabase
// implementation can be dropped in here without touching the UI.
import { loadDB, saveDB } from "./demoStore";
import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, AppointmentStatus, TreatmentEntry, Admission, Reminder } from "@/types";
import { uid } from "./utils";

const demoRepo = {
  async listPets(ownerId: string): Promise<Pet[]> {
    return loadDB().pets.filter((p) => p.owner_id === ownerId);
  },

  /** All pets known to the clinic (used by the clinic log / records). */
  async listAllPets(): Promise<Pet[]> {
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

  async addVaccination(input: Omit<Vaccination, "id">): Promise<Vaccination> {
    const db = loadDB();
    const v: Vaccination = { ...input, id: uid("v") };
    db.vaccinations.push(v);
    saveDB(db);
    return v;
  },

  async listVisits(petId: string): Promise<MedicalVisit[]> {
    return loadDB()
      .visits.filter((v) => v.pet_id === petId)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  },

  async addVisit(input: Omit<MedicalVisit, "id">): Promise<MedicalVisit> {
    const db = loadDB();
    const v: MedicalVisit = { ...input, id: uid("vis") };
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

  async listAdmissions(): Promise<Admission[]> {
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
function need<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error || res.data == null) throw new Error(`[supabase] ${res.error?.message ?? "no data returned"}`);
  return res.data as T;
}

const supabaseRepo: typeof demoRepo = {
  async listPets(ownerId) {
    return listOf<Pet>(await sbc().from("pets").select("*").eq("owner_id", ownerId));
  },
  async listAllPets() {
    return listOf<Pet>(await sbc().from("pets").select("*").order("created_at", { ascending: false }));
  },
  async updateOwnerContact(ownerId, patch) {
    await sbc().from("pets").update(patch).eq("owner_id", ownerId);
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
  async addVaccination(input) {
    return need<Vaccination>(await sbc().from("vaccinations").insert(input).select().single());
  },
  async listVisits(petId) {
    return listOf<MedicalVisit>(await sbc().from("medical_visits").select("*").eq("pet_id", petId).order("visit_date", { ascending: false }));
  },
  async addVisit(input) {
    return need<MedicalVisit>(await sbc().from("medical_visits").insert(input).select().single());
  },
  async listMedia(petId) {
    return listOf<MediaItem>(await sbc().from("media_items").select("*").eq("pet_id", petId).order("created_at", { ascending: false }));
  },
  async addMedia(input) {
    return need<MediaItem>(await sbc().from("media_items").insert(input).select().single());
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
    await sbc().from("appointments").update({ status }).eq("id", id);
  },
  async listTreatments(petId) {
    return listOf<TreatmentEntry>(await sbc().from("treatment_entries").select("*").eq("pet_id", petId).order("day", { ascending: true }).order("time", { ascending: true }));
  },
  async addTreatment(input) {
    return need<TreatmentEntry>(await sbc().from("treatment_entries").insert(input).select().single());
  },
  async deleteTreatment(id) {
    await sbc().from("treatment_entries").delete().eq("id", id);
  },
  async setTreatmentGiven(id, given, by) {
    await sbc().from("treatment_entries").update({ administered_at: given ? new Date().toISOString() : null, administered_by: given ? by : null }).eq("id", id);
  },
  async listAdmissions() {
    return listOf<Admission>(await sbc().from("admissions").select("*").order("admitted_on", { ascending: false }));
  },
  async listAdmissionsForPet(petId) {
    return listOf<Admission>(await sbc().from("admissions").select("*").eq("pet_id", petId).order("admitted_on", { ascending: false }));
  },
  async addAdmission(input) {
    return need<Admission>(await sbc().from("admissions").insert(input).select().single());
  },
  async updateAdmission(id, patch) {
    await sbc().from("admissions").update(patch).eq("id", id);
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
    await sbc().from("reminders").update(patch).eq("id", id);
  },
  async removeReminder(id) {
    await sbc().from("reminders").delete().eq("id", id);
  },
};

/** Live when Supabase is configured, otherwise the local demo store. */
export const repo = supabase ? supabaseRepo : demoRepo;
