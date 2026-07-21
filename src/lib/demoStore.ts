import type { DemoDB, Pet, Vaccination, WeightLog, MedicalVisit, MediaItem, Appointment, TreatmentEntry, Admission, Reminder, Product, Company, CompanySection, ClinicVisit } from "@/types";
import { uid } from "./utils";

const KEY = "vp_demo_db_v12";

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** ISO datetime `days` from now at the given hour:minute. */
function isoAt(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seed(): DemoDB {
  const ownerId = "demo-owner";
  const maya = { owner_name: "Maya Khalil", owner_phone: "+964 770 111 2222", owner_email: "maya.khalil@email.com" };
  const khaled = { owner_id: "owner_khaled", owner_name: "Khaled Saleh", owner_phone: "+964 771 333 4444", owner_email: "khaled.saleh@email.com" };
  const sara = { owner_id: "owner_sara", owner_name: "Sara Nabil", owner_phone: "+964 750 555 6666", owner_email: "sara.nabil@email.com" };
  const ahmed = { owner_id: "owner_ahmed", owner_name: "Ahmed Fathi", owner_phone: "+964 781 777 8888", owner_email: "ahmed.fathi@email.com" };

  const bobby: Pet = {
    id: "pet_bobby",
    owner_id: ownerId,
    ...maya,
    name: "Bobby",
    species: "dog",
    breed: "Golden Retriever",
    sex: "male",
    dob: iso(-1000),
    microchip_id: "990012345678901",
    color: "Golden",
    photo_url: null,
    current_weight_kg: 28.4,
    nutrition_profile: "Adult large-breed dry food, 350g/day",
    allergies: ["Penicillin"],
    distinctive_markings: "Light eyebrow markings and a heart-shaped white patch on the chest. Small dark freckle on the left paw.",
    adopted_on: iso(-980),
    neuter_status: "neutered",
    contacts: [
      { id: uid("ct"), name: "Maya Khalil", role: "Owner", phone: "+964 770 111 2222", email: "maya.khalil@email.com" },
      { id: uid("ct"), name: "Omar Khalil", role: "Emergency", phone: "+964 770 999 0000" },
    ],
    diet: {
      food_type: "dry",
      brand: "Royal Canin Maxi Adult",
      daily_amount: "350 g/day",
      therapeutic: false,
      food_allergies: ["Chicken"],
      notes: "Prefers food slightly warmed. No table scraps — tends to gain weight quickly.",
      schedule: [
        { id: uid("ft"), label: "Breakfast", time: "08:00", frequency: "everyday", enabled: true },
        { id: uid("ft"), label: "Dinner", time: "18:30", frequency: "everyday", enabled: true },
      ],
    },
    passport_token: "PET-BOBBY-7F3A9",
    serial: "10001",
    created_at: new Date().toISOString(),
  };
  const luna: Pet = {
    id: "pet_luna",
    owner_id: ownerId,
    ...maya,
    name: "Luna",
    species: "cat",
    breed: "Domestic Shorthair",
    sex: "female",
    dob: iso(-600),
    microchip_id: "990098765432109",
    color: "Grey tabby",
    photo_url: null,
    current_weight_kg: 4.1,
    nutrition_profile: "Indoor cat formula, 60g/day",
    allergies: [],
    distinctive_markings: "Classic grey tabby 'M' on forehead; white mittens on both front paws.",
    adopted_on: iso(-560),
    neuter_status: "neutered",
    contacts: [
      { id: uid("ct"), name: "Maya Khalil", role: "Owner", phone: "+964 770 111 2222", email: "maya.khalil@email.com" },
    ],
    diet: {
      food_type: "wet",
      brand: "Hill's Science Diet Indoor",
      daily_amount: "60 g/day",
      therapeutic: false,
      food_allergies: [],
      notes: "Fresh water fountain refilled daily.",
      schedule: [
        { id: uid("ft"), label: "Morning", time: "07:30", frequency: "everyday", enabled: true },
        { id: uid("ft"), label: "Evening", time: "19:00", frequency: "everyday", enabled: true },
      ],
    },
    passport_token: "PET-LUNA-2C8B1",
    serial: "10002",
    created_at: new Date().toISOString(),
  };
  const francisco: Pet = {
    id: "pet_francisco",
    owner_id: ownerId,
    ...maya,
    name: "Francisco",
    species: "dog",
    breed: "Beagle",
    sex: "male",
    dob: iso(-1500),
    microchip_id: "990055544433322",
    color: "Tricolor",
    photo_url: null,
    current_weight_kg: 12.6,
    nutrition_profile: "Recovery diet, soft food 3×/day",
    allergies: [],
    distinctive_markings: "Classic tricolor beagle; white tail tip; brown ticking on the muzzle.",
    adopted_on: iso(-1450),
    neuter_status: "intact",
    diet: {
      food_type: "prescription",
      brand: "Hill's i/d Digestive Care",
      daily_amount: "Soft food, small portions",
      therapeutic: true,
      therapeutic_reason: "Gastrointestinal recovery (post-gastroenteritis)",
      food_allergies: [],
      notes: "Soft/wet food only during recovery. Reassess diet at next recheck.",
      schedule: [
        { id: uid("ft"), label: "Morning", time: "08:00", frequency: "everyday", enabled: true },
        { id: uid("ft"), label: "Midday", time: "13:00", frequency: "everyday", enabled: true },
        { id: uid("ft"), label: "Evening", time: "18:00", frequency: "everyday", enabled: true },
      ],
    },
    passport_token: "PET-FRAN-9K4D2",
    serial: "10003",
    created_at: new Date().toISOString(),
  };
  const mk = (over: Partial<Pet> & { id: string; name: string; species: Pet["species"]; passport_token: string; serial: string }): Pet => ({
    owner_id: ownerId, sex: "unknown", allergies: [], photo_url: null, dob: null,
    created_at: new Date().toISOString(), ...over,
  });
  const rocky = mk({ id: "pet_rocky", ...khaled, name: "Rocky", species: "dog", breed: "German Shepherd", sex: "male", dob: iso(-1300), current_weight_kg: 33.0, passport_token: "PET-ROCKY-5H1J7", serial: "10004" });
  const bella = mk({ id: "pet_bella", ...khaled, name: "Bella", species: "cat", breed: "Persian", sex: "female", dob: iso(-800), current_weight_kg: 3.8, passport_token: "PET-BELLA-3M2N8", serial: "10005" });
  const coco = mk({ id: "pet_coco", ...sara, name: "Coco", species: "rabbit", breed: "Holland Lop", sex: "female", dob: iso(-400), current_weight_kg: 1.7, passport_token: "PET-COCO-8P4Q1", serial: "10006" });
  const max = mk({ id: "pet_max", ...ahmed, name: "Max", species: "horse", breed: "Arabian", sex: "male", dob: iso(-2600), current_weight_kg: 430, passport_token: "PET-MAX-6R7S3", serial: "10007" });

  const weightLogs: WeightLog[] = [
    { id: uid("w"), pet_id: bobby.id, weight_kg: 18, measured_at: iso(-300) },
    { id: uid("w"), pet_id: bobby.id, weight_kg: 23.5, measured_at: iso(-200) },
    { id: uid("w"), pet_id: bobby.id, weight_kg: 26, measured_at: iso(-100) },
    { id: uid("w"), pet_id: bobby.id, weight_kg: 27.8, measured_at: iso(-30) },
    { id: uid("w"), pet_id: bobby.id, weight_kg: 28.4, measured_at: iso(-2) },
    { id: uid("w"), pet_id: luna.id, weight_kg: 2.8, measured_at: iso(-200) },
    { id: uid("w"), pet_id: luna.id, weight_kg: 3.6, measured_at: iso(-90) },
    { id: uid("w"), pet_id: luna.id, weight_kg: 4.1, measured_at: iso(-10) },
  ];

  const vaccinations: Vaccination[] = [
    { id: uid("v"), pet_id: bobby.id, name: "Rabies", status: "administered", administered_at: iso(-180), dose_number: 1, doses_total: 1, administered_by: "Dr. Sarah — Happy Paws", lot_number: "RB-2231" },
    { id: uid("v"), pet_id: bobby.id, name: "DHPP", status: "administered", administered_at: iso(-180), dose_number: 3, doses_total: 3, administered_by: "Dr. Sarah — Happy Paws", lot_number: "DH-1192" },
    { id: uid("v"), pet_id: bobby.id, name: "Deworming", status: "overdue", due_date: iso(-1), dose_number: 1, doses_total: 1 },
    { id: uid("v"), pet_id: bobby.id, name: "Leptospirosis", status: "scheduled", due_date: iso(21), dose_number: 1, doses_total: 1 },
    { id: uid("v"), pet_id: luna.id, name: "Rabies", status: "administered", administered_at: iso(-120), dose_number: 1, doses_total: 1, administered_by: "Dr. Omar — VetCare" },
    { id: uid("v"), pet_id: luna.id, name: "FVRCP", status: "scheduled", due_date: iso(14), dose_number: 2, doses_total: 3 },
  ];

  const visits: MedicalVisit[] = [
    {
      id: uid("vis"),
      pet_id: bobby.id,
      clinic_name: "Happy Paws Veterinary Clinic",
      doctor_name: "Dr. Sarah Mansour",
      visit_date: iso(-180),
      subjective: "Owner reports occasional limping after long walks.",
      objective: "T 38.7°C, HR 92, RR 22. Mild stiffness in right hind leg.",
      assessment: "Early hip dysplasia (suspected)",
      plan: "Joint supplement daily. Recheck in 3 months. X-ray recommended.",
      treatments: ["Glucosamine supplement", "Carprofen 75mg"],
      notes: "Owner advised to limit high-impact exercise.",
    },
    {
      id: uid("vis"),
      pet_id: bobby.id,
      clinic_name: "Happy Paws Veterinary Clinic",
      doctor_name: "Dr. Sarah Mansour",
      visit_date: iso(-30),
      subjective: "Routine wellness check.",
      objective: "T 38.4°C, HR 88, RR 20. BCS 5/9. Coat healthy.",
      assessment: "Healthy — routine wellness",
      plan: "Continue current diet. Due for deworming.",
      treatments: [],
      notes: "",
    },
  ];

  const media: MediaItem[] = [];

  // Francisco is on a 3-day continued (inpatient) treatment course.
  const treatments: TreatmentEntry[] = [
    { id: uid("tx"), pet_id: francisco.id, day: iso(-2), doctor: "Dr. Sarah Mansour", medication: "Amoxicillin 250mg", time: "08:00", amount: "1 tablet", observations: "Lethargic, low appetite. Mild fever.", created_at: new Date().toISOString() },
    { id: uid("tx"), pet_id: francisco.id, day: iso(-2), doctor: "Dr. Sarah Mansour", medication: "Lactated Ringer's (IV)", time: "09:30", amount: "250 ml", observations: "Started IV fluids for dehydration.", created_at: new Date().toISOString() },
    { id: uid("tx"), pet_id: francisco.id, day: iso(-1), doctor: "Dr. Omar Haddad", medication: "Amoxicillin 250mg", time: "08:00", amount: "1 tablet", observations: "More alert, ate small portion. Fever down.", created_at: new Date().toISOString() },
    { id: uid("tx"), pet_id: francisco.id, day: iso(-1), doctor: "Dr. Omar Haddad", medication: "Maropitant", time: "08:15", amount: "1.0 ml SC", observations: "No vomiting overnight.", created_at: new Date().toISOString() },
    { id: uid("tx"), pet_id: francisco.id, day: iso(0), doctor: "Dr. Sarah Mansour", medication: "Amoxicillin 250mg", time: "08:00", amount: "1 tablet", observations: "Bright, eating normally. Hydration good — plan discharge tomorrow.", created_at: new Date().toISOString() },
    // Bella — current daily-treatment case
    { id: uid("tx"), pet_id: bella.id, day: iso(0), doctor: "Dr. Omar Haddad", medication: "Meloxicam", time: "09:00", amount: "0.3 ml", observations: "Post-spay recovery, comfortable.", created_at: new Date().toISOString() },
    { id: uid("tx"), pet_id: bella.id, day: iso(0), doctor: "Dr. Omar Haddad", medication: "Cefovecin (Convenia)", time: "09:05", amount: "0.4 ml SC", observations: "Single long-acting antibiotic.", created_at: new Date().toISOString() },
  ];

  // Clinic admissions / cases — active treatment, active boarding, and discharged history.
  const admissions: Admission[] = [
    { id: uid("adm"), pet_id: francisco.id, kind: "treatment", status: "active", admitted_on: iso(-2), reason: "Gastroenteritis — IV fluids & antibiotics" },
    { id: uid("adm"), pet_id: bella.id, kind: "treatment", status: "active", admitted_on: iso(0), reason: "Post-operative care (spay)" },
    { id: uid("adm"), pet_id: rocky.id, kind: "boarding", status: "active", admitted_on: iso(-1), cage: "B-3", reason: "Owner travelling — 5 nights" },
    { id: uid("adm"), pet_id: coco.id, kind: "boarding", status: "active", admitted_on: iso(0), cage: "B-1", reason: "Boarding — 2 nights" },
    { id: uid("adm"), pet_id: luna.id, kind: "treatment", status: "discharged", admitted_on: iso(-40), discharged_on: iso(-38), reason: "Upper respiratory infection" },
    { id: uid("adm"), pet_id: max.id, kind: "boarding", status: "discharged", admitted_on: iso(-15), discharged_on: iso(-12), reason: "Boarding" },
    { id: uid("adm"), pet_id: bobby.id, kind: "treatment", status: "discharged", admitted_on: iso(-180), discharged_on: iso(-179), reason: "Wellness observation" },
  ];

  const appointments: Appointment[] = [
    {
      id: uid("apt"),
      pet_id: bobby.id,
      owner_id: ownerId,
      doctor_id: "doc-sarah",
      doctor_name: "Dr. Sarah Mansour",
      service: "consultation",
      status: "confirmed",
      scheduled_at: isoAt(2, 10, 20),
      duration_min: 20,
      symptoms: "Follow-up on right hind leg stiffness.",
      created_at: new Date().toISOString(),
    },
    {
      id: uid("apt"),
      pet_id: luna.id,
      owner_id: ownerId,
      doctor_id: "doc-lina",
      doctor_name: "Dr. Lina Aziz",
      service: "vaccination",
      status: "requested",
      scheduled_at: isoAt(4, 11, 0),
      duration_min: 20,
      created_at: new Date().toISOString(),
    },
    // Today's clinic board (for reception calendar demo)
    {
      id: uid("apt"),
      pet_id: bobby.id,
      owner_id: ownerId,
      doctor_id: "doc-sarah",
      doctor_name: "Dr. Sarah Mansour",
      service: "surgery",
      status: "confirmed",
      scheduled_at: isoAt(0, 9, 0),
      duration_min: 20,
      symptoms: "Dental extraction.",
      created_at: new Date().toISOString(),
    },
    {
      id: uid("apt"),
      pet_id: luna.id,
      owner_id: ownerId,
      doctor_id: "doc-omar",
      doctor_name: "Dr. Omar Haddad",
      service: "telehealth",
      status: "confirmed",
      scheduled_at: isoAt(0, 10, 40),
      duration_min: 20,
      created_at: new Date().toISOString(),
    },
  ];

  const reminders: Reminder[] = [
    // Clinic-scoped (staff dashboard)
    { id: uid("rem"), category: "reminder", title: "Reorder rabies vaccine stock", date: iso(2).slice(0, 10), time: "09:00", recurring: "none", enabled: true, created_at: new Date().toISOString() },
    { id: uid("rem"), category: "recheck", title: "Francisco — post-op recheck", pet_id: francisco.id, pet_name: francisco.name, date: iso(3).slice(0, 10), time: "10:30", recurring: "none", enabled: true, created_at: new Date().toISOString() },
    { id: uid("rem"), category: "grooming", title: "Deep-clean boarding kennels", date: iso(5).slice(0, 10), time: "17:00", recurring: "weekly", enabled: true, created_at: new Date().toISOString() },
    // Owner-scoped (demo owner portal)
    { id: uid("rem"), owner_id: ownerId, category: "grooming", title: "Bobby grooming — Shiny Fur Salon", pet_id: bobby.id, pet_name: bobby.name, date: iso(4).slice(0, 10), time: "16:00", recurring: "none", enabled: true, created_at: new Date().toISOString() },
    { id: uid("rem"), owner_id: ownerId, category: "medication", title: "Luna — flea & tick medication", pet_id: luna.id, pet_name: luna.name, date: iso(1).slice(0, 10), time: "08:00", recurring: "monthly", enabled: true, created_at: new Date().toISOString() },
    { id: uid("rem"), owner_id: ownerId, category: "recheck", title: "Bobby — annual wellness check", pet_id: bobby.id, pet_name: bobby.name, date: iso(9).slice(0, 10), time: "11:00", recurring: "none", enabled: true, created_at: new Date().toISOString() },
  ];

  // Inventory & POS — sample suppliers (شركات) + clinic stock filed under them.
  const coRoyal: Company = { id: uid("co"), name: "Royal Canin", note: "موزّع: الوكيل الرسمي", created_at: new Date().toISOString() };
  const coBoehringer: Company = { id: uid("co"), name: "Boehringer Ingelheim", note: null, created_at: new Date().toISOString() };
  const coHills: Company = { id: uid("co"), name: "Hill's", note: null, created_at: new Date().toISOString() };
  const companies: Company[] = [coRoyal, coBoehringer, coHills];

  // Sections (أصناف) inside a company — the middle level of Company → Section → Barcode.
  const secRoyalDry: CompanySection = { id: uid("sec"), company_id: coRoyal.id, name: "دراي فود", created_at: new Date().toISOString() };
  const secBoehParasite: CompanySection = { id: uid("sec"), company_id: coBoehringer.id, name: "مضادات الطفيليات", created_at: new Date().toISOString() };
  const companySections: CompanySection[] = [secRoyalDry, secBoehParasite];

  const products: Product[] = [
    { id: uid("prod"), barcode: "6221031492015", name: "Royal Canin Maxi Adult 4kg", category: "food", company_id: coRoyal.id, section_id: secRoyalDry.id, purchase_price: 22, sell_price: 32, stock: 14, min_stock: 5, expiry_date: iso(420), created_at: new Date().toISOString() },
    { id: uid("prod"), barcode: "6224000110017", name: "Frontline Plus (Dog, single pipette)", category: "medicine", company_id: coBoehringer.id, section_id: secBoehParasite.id, purchase_price: 6.5, sell_price: 12, stock: 40, min_stock: 10, expiry_date: iso(210), created_at: new Date().toISOString() },
    { id: uid("prod"), barcode: "5391520947018", name: "Drontal Plus Dewormer (tablet)", category: "medicine", company_id: coBoehringer.id, section_id: secBoehParasite.id, purchase_price: 1.8, sell_price: 4, stock: 8, min_stock: 10, expiry_date: iso(30), created_at: new Date().toISOString() },
    { id: uid("prod"), barcode: "6291100630019", name: "Hill's i/d Digestive Care 360g can", category: "food", company_id: coHills.id, purchase_price: 2.4, sell_price: 4.5, stock: 26, min_stock: 6, expiry_date: iso(180), created_at: new Date().toISOString() },
    { id: uid("prod"), barcode: "4002448210010", name: "Cat scratching post — medium", category: "accessories", purchase_price: 9, sell_price: 18, stock: 5, min_stock: 3, expiry_date: null, created_at: new Date().toISOString() },
    { id: uid("prod"), barcode: "8901030710011", name: "Disposable syringe 5ml (box of 100)", category: "consumables", purchase_price: 7, sell_price: 14, stock: 3, min_stock: 5, expiry_date: iso(-10), created_at: new Date().toISOString() },
  ];

  const clinicVisits: ClinicVisit[] = [
    { id: uid("visit"), pet_id: rocky.id, kind: "checkup", status: "ended", condition: "recovered", opened_at: isoAt(-25, 10, 0), ended_at: isoAt(-25, 10, 20), opened_by: "Dr. Sarah Mansour", outcome: "recovered", summary: "فحص عام سليم", created_at: isoAt(-25, 10, 0) },
    { id: uid("visit"), pet_id: luna.id, kind: "illness", status: "ended", condition: "under_treatment", opened_at: isoAt(-40, 9, 30), ended_at: isoAt(-38, 12, 0), opened_by: "Dr. Sarah Mansour", outcome: "recovered", summary: "شُفيت من التهاب الجهاز التنفسي العلوي", created_at: isoAt(-40, 9, 30) },
  ];

  return {
    pets: [bobby, luna, francisco, rocky, bella, coco, max],
    weightLogs, vaccinations, visits, clinicVisits, media, appointments, treatments, admissions, reminders,
    products, companies, companySections, invoices: [], invoiceItems: [],
  };
}

export function loadDB(): DemoDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoDB;
  } catch {
    /* ignore */
  }
  const fresh = seed();
  saveDB(fresh);
  return fresh;
}

export function saveDB(db: DemoDB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export function resetDB(): DemoDB {
  const fresh = seed();
  saveDB(fresh);
  return fresh;
}

/**
 * Drop demo databases left behind by OLDER app versions (vp_demo_db_v1..v11).
 * Each old DB can hold compressed base64 media and silently eats the ~5 MB
 * localStorage quota — once full, writes throw and the app appears to "freeze".
 * Safe + idempotent: only removes vp_demo_db_v* keys that aren't the current one.
 * Returns the number of stale keys removed.
 */
export function pruneStaleStorage(): number {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vp_demo_db_v") && k !== KEY) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
    return stale.length;
  } catch {
    return 0;
  }
}
