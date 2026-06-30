export type Role = "owner" | "doctor" | "reception" | "admin";

/** Top-level account type a single user can hold (one account, possibly both). */
export type AccountRole = "owner" | "clinic";

export type Species = "dog" | "cat" | "horse" | "cow" | "bird" | "rabbit" | "other";
export type Sex = "male" | "female" | "unknown";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  /** Effective role for the active session (clinic → admin/doctor/reception, or owner). */
  role: Role;
  /** Account types this user holds — a single user can be both a clinic and an owner. */
  roles: AccountRole[];
  phone?: string;
  clinic_id?: string | null;
}

export interface Clinic {
  id: string;
  name: string;
  city?: string;
  phone?: string;
}

/** A person attached to a pet (owner, co-owner, emergency contact, caretaker). */
export interface PetContact {
  id: string;
  name: string;
  role?: string; // "Owner" | "Co-owner" | "Emergency" | "Caretaker" | "Walker"
  phone?: string;
  email?: string;
}

/** One recurring feeding slot in the diet schedule. */
export interface FeedingTime {
  id: string;
  label: string; // "Breakfast" | "Dinner" | custom
  time: string; // "08:00"
  frequency?: string; // "everyday" (default) | "weekdays" | "weekends"
  enabled: boolean;
}

export type FoodType = "dry" | "wet" | "home" | "raw" | "mixed" | "prescription";

/** Structured nutrition / feeding plan for a pet. */
export interface DietPlan {
  food_type?: FoodType;
  brand?: string; // product / recipe name
  daily_amount?: string; // "350 g/day", "2 cups"
  therapeutic?: boolean; // prescription / therapeutic diet
  therapeutic_reason?: string; // e.g. "Renal support", "Weight management"
  food_allergies?: string[];
  notes?: string;
  schedule?: FeedingTime[];
}

export interface Pet {
  id: string;
  owner_id: string;
  /** Owning clinic for tenant isolation (= the clinic's auth.users id). Null for owner-created pets. */
  clinic_id?: string | null;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  /** Hierarchical local address: governorate (المحافظة) → area (المنطقة). */
  owner_governorate?: string;
  owner_area?: string;
  name: string;
  species: Species;
  breed?: string;
  sex: Sex;
  dob?: string | null; // ISO date
  microchip_id?: string;
  color?: string;
  photo_url?: string | null;
  current_weight_kg?: number | null;
  nutrition_profile?: string;
  allergies?: string[];
  /** Free-text appearance / distinctive markings for identification. */
  distinctive_markings?: string;
  /** Important husbandry dates. */
  adopted_on?: string | null;
  neuter_status?: "intact" | "neutered" | "unknown";
  /** Additional people attached to this pet (beyond the primary owner fields). */
  contacts?: PetContact[];
  /** Structured nutrition / feeding plan. */
  diet?: DietPlan;
  /** Public, shareable token encoded in the QR for cross-clinic chart access. */
  passport_token: string;
  /** Permanent 4–6 digit universal identifier — same animal recognised at any clinic. */
  serial: string;
  /** Owner controls whether this animal is shared with clinics (default true). */
  shared_with_clinic?: boolean;
  created_at: string;
}

export interface WeightLog {
  id: string;
  pet_id: string;
  weight_kg: number;
  measured_at: string; // ISO date
}

export type VaccinationStatus = "administered" | "scheduled" | "overdue";

export interface Vaccination {
  id: string;
  pet_id: string;
  name: string; // e.g. Rabies, DHPP, Deworming
  status: VaccinationStatus;
  due_date?: string | null;
  administered_at?: string | null;
  dose_number?: number;
  doses_total?: number;
  lot_number?: string;
  administered_by?: string; // doctor / clinic name
  notes?: string;
}

export interface MediaItem {
  id: string;
  pet_id: string;
  kind: "photo" | "xray" | "ultrasound" | "lab" | "document";
  url: string; // object URL / storage URL
  caption?: string;
  created_at: string;
}

/** Doctor's triage of the patient's overall state at a visit. */
export type PatientCondition = "excellent" | "good" | "critical";

/** Per-visit clinical assessment captured in the Medical Entry workflow. */
export interface MedicalAssessment {
  condition: PatientCondition | null;
  notes: string;
}

export interface MedicalVisit {
  id: string;
  pet_id: string;
  clinic_name: string;
  doctor_name: string;
  visit_date: string; // ISO date
  /** Patient's age in whole months at the time of the visit (historical snapshot). */
  patient_age_months?: number | null;
  // SOAP
  subjective?: string;
  objective?: string;
  assessment: string; // diagnosis name (required summary)
  plan?: string; // prescription / home advice
  treatments?: string[];
  notes?: string;
  /** Patient-condition triage (excellent / good / critical) for this visit. */
  condition?: PatientCondition | null;
}

export type ServiceType = "consultation" | "vaccination" | "surgery" | "telehealth" | "home";

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "in_room"
  | "done"
  | "cancelled";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  /** Service types this doctor handles. */
  services: ServiceType[];
}

export interface Appointment {
  id: string;
  pet_id: string;
  owner_id: string;
  doctor_id: string;
  doctor_name: string;
  service: ServiceType;
  status: AppointmentStatus;
  /** ISO datetime of the slot start. */
  scheduled_at: string;
  duration_min: number;
  symptoms?: string;
  /** Recorded at check-in. */
  checkin_weight_kg?: number | null;
  triage_score?: number | null; // 1 (critical) .. 5 (routine)
  created_at: string;
}

/** One row of an ongoing (multi-day) treatment sheet for an inpatient / continued course. */
export interface TreatmentEntry {
  id: string;
  pet_id: string;
  day: string; // ISO date
  doctor?: string; // doctor treating the patient that day
  medication: string; // type of medication
  time: string; // scheduled time of administration, e.g. "08:00"
  amount: string; // dose / quantity, e.g. "1.4 ml" or "75 mg"
  observations?: string; // daily note on the animal's condition
  /** Set when the dose has actually been administered (flowsheet done-state). */
  administered_at?: string | null; // ISO datetime
  administered_by?: string; // who gave it
  created_at: string;
}

export type AdmissionKind = "treatment" | "boarding";
export type AdmissionStatus = "active" | "discharged";

/** A clinic admission/case. Active treatment cases and boarding stays both live here;
 *  every admission (active or discharged) forms the clinic log. */
export interface Admission {
  id: string;
  pet_id: string;
  kind: AdmissionKind;
  status: AdmissionStatus;
  admitted_on: string; // ISO date
  discharged_on?: string | null;
  reason?: string;
  cage?: string; // for boarding
  /** Treatment cycle length in hours (24 = daily, 12 = twice daily). Default 24. */
  cycle_hours?: number;
  /** When the current cycle's treatment was last marked complete. */
  last_completed_at?: string | null;
}

/** Category of a unified-feed event / reminder (drives its icon + colour). */
export type EventCategory =
  | "appointment"
  | "medication"
  | "vaccine"
  | "recheck"
  | "grooming"
  | "feeding"
  | "boarding"
  | "reminder";

/** A user-created scheduled reminder that surfaces in the unified events feed. */
export interface Reminder {
  id: string;
  /** Owner-scoped reminder when set; clinic-scoped when null/undefined. */
  owner_id?: string | null;
  pet_id?: string | null;
  pet_name?: string;
  category: EventCategory;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  time?: string; // HH:MM
  recurring?: "none" | "daily" | "weekly" | "monthly";
  enabled: boolean;
  created_at: string;
}

/* ---------------- Inventory & POS ---------------- */
export type ProductCategory = "medicine" | "food" | "accessories" | "consumables" | "other";

export interface Product {
  id: string;
  /** Owning clinic (tenant isolation). */
  clinic_id?: string | null;
  barcode?: string | null;
  name: string;
  category?: ProductCategory | null;
  /** Free-text subcategory (e.g. "معلبات", "رمل", "دراي فود") — used by Mix & Match promotions. */
  subcategory?: string | null;
  purchase_price: number;
  sell_price: number;
  stock: number;
  /** Reorder level — stock at or below this triggers a low-stock warning. */
  min_stock?: number | null;
  expiry_date?: string | null; // ISO date
  created_at: string;
}

export type PaymentMethod = "cash" | "card" | "transfer";
export type DiscountType = "percent" | "fixed";
export type InvoiceStatus = "paid" | "refunded";

/** A completed point-of-sale / retail transaction. */
export interface Invoice {
  id: string;
  clinic_id?: string | null;
  /** Walk-in customer captured at sale time (retail module; optional). */
  customer_name?: string | null;
  customer_phone?: string | null;
  /** Patient name when the sale was raised for a specific animal (optional). */
  pet_name?: string | null;
  subtotal?: number; // revenue before discount
  discount?: number; // resolved discount amount applied
  discount_type?: DiscountType | null;
  payment_method?: PaymentMethod | null;
  total: number; // revenue after discount
  cost_total: number; // sum of purchase prices (cost of goods)
  profit: number; // total - cost_total
  item_count: number; // number of units sold
  print_count?: number; // times this invoice has been printed
  status?: InvoiceStatus; // 'paid' | 'refunded'
  refunded_at?: string | null;
  /** Cashier / sales rep (staff id) who made the sale — for staff performance reports. */
  staff_id?: string | null;
  created_at: string;
}

/** Sale-level metadata captured by the retail builder and sent to checkout. */
export interface SaleMeta {
  customer_name?: string | null;
  customer_phone?: string | null;
  /** Patient name when the sale is raised for a specific animal (prints on the invoice). */
  pet_name?: string | null;
  discount_type?: DiscountType | null;
  discount_value?: number; // raw input: a percent (0–100) or a fixed amount
  payment_method?: PaymentMethod | null;
  /** Cashier / sales rep (staff id) who made the sale — for staff performance reports. */
  staff_id?: string | null;
}

/** A distinct retail customer, derived from past invoices for quick re-selection. */
export interface Customer {
  name: string;
  phone: string;
  last_seen: string; // ISO of most recent purchase
  visits: number;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  clinic_id?: string | null;
  product_id?: string | null;
  name: string; // snapshot of the product name at sale time
  barcode?: string | null;
  qty: number;
  unit_price: number; // sell price at sale time
  unit_cost: number; // purchase price at sale time
  line_total: number; // qty * unit_price
}

/** A line in the POS cart before checkout. */
export interface CartLine {
  product: Product;
  qty: number;
}

/** Normalized item sent to the checkout (snapshot of price/cost at sale time). */
export interface CheckoutItem {
  product_id?: string | null;
  name: string;
  barcode?: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
}

/* ---------------- Services & non-barcode items ---------------- */
/** A clinic-defined service category (e.g. Laboratory, Imaging, Consultation). */
export interface ServiceCategory { id: string; name: string }
/** A billable non-barcode service with a default price (overridable per sale). */
export interface Service { id: string; category_id: string; name: string; price: number }
export interface ServiceCatalog { categories: ServiceCategory[]; services: Service[] }

/** A logged WhatsApp message (campaign send history / "last contacted"). */
export interface WhatsAppMessage {
  id: string;
  clinic_id?: string | null;
  pet_id?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  reminder_type?: string | null;
  sent_at: string;
}

export interface DemoDB {
  pets: Pet[];
  weightLogs: WeightLog[];
  vaccinations: Vaccination[];
  media: MediaItem[];
  visits: MedicalVisit[];
  appointments: Appointment[];
  treatments: TreatmentEntry[];
  admissions: Admission[];
  reminders: Reminder[];
  products: Product[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  waMessages?: WhatsAppMessage[];
}
