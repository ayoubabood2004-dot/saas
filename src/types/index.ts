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
  /** The animal has passed away — suppresses birthday greetings/reminders. */
  deceased?: boolean;
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

/** A row on the hospital care sheet that isn't a drug dose. */
export type CareKind = "fluid" | "vital" | "intake" | "output";

/**
 * One timed entry on the treatment sheet beside the doses: a fluid rate, a
 * recorded vital, or an intake/output volume. One table with a discriminator
 * so the hour grid reads in a single query.
 */
export interface CareEntry {
  id: string;
  pet_id: string;
  clinic_id?: string | null;
  visit_id?: string | null;
  day: string;            // ISO date (LOCAL, like TreatmentEntry.day)
  time: string;           // 'HH:MM' — empty means no fixed hour
  kind: CareKind;
  label: string;
  value?: number | null;
  unit: string;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

/** What a problem affects — read by the prescription guard, not just a label. */
export type ProblemCategory =
  | "renal" | "hepatic" | "cardiac" | "endocrine" | "gi" | "derm" | "neuro" | "repro" | "other";

/**
 * One entry on the patient's master problem list (POMR). Unlike a diagnosis —
 * which lives inside the visit it was made in — a problem persists across visits
 * until someone resolves it, and is consulted every time a drug is prescribed.
 */
export interface PetProblem {
  id: string;
  pet_id: string;
  clinic_id?: string | null;
  title: string;
  category: ProblemCategory;
  status: "active" | "resolved";
  /** Chronic problems stay `active` — controlled is not the same as resolved. */
  chronic: boolean;
  severity?: "mild" | "moderate" | "severe" | null;
  onset_date?: string | null;
  notes?: string | null;
  opened_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

/**
 * طلب تطوير من الدكتور — يرفعه المساعد الذكي لما يُسأل عن شيء مو موجود
 * بالسستم (أو يكتبه الدكتور يدوياً). يقرأه مشغّل المنصة عبر كل العيادات.
 */
export interface FeatureRequest {
  id: string;
  clinic_id?: string | null;
  /** لقطة اسم العيادة وقت الإرسال — الأدمن يقرأ بلا join. */
  clinic_name?: string | null;
  requested_by?: string | null;
  /** نص الطلب كما صاغه الدكتور. */
  body: string;
  /** السؤال الأصلي الي عجز عنه المساعد (إن وجد). */
  question?: string | null;
  source: "assistant" | "manual";
  status: "new" | "planned" | "done" | "declined";
  /** رد مشغّل المنصة — يظهر للعيادة حتى يعرف الدكتور مصير طلبه. */
  admin_note?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/** باركود ولّده السستم للعيادة (EAN-13 داخلي بادئته 20) — مع سجله الكامل. */
export interface GeneratedBarcode {
  id: string;
  clinic_id?: string | null;
  /** الكود الكامل: 13 رقماً برقم تحقق سليم. */
  barcode: string;
  /** الغرض أو اسم المنتج وقت التوليد — حتى يبقى السجل مقروءاً. */
  label?: string | null;
  /** المنتج المربوط (إن وُلّد لمنتج محدد). */
  product_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

/** A free-text clinical / progress note on the patient record (سجل الملاحظات السريرية). */
export interface PetNote {
  id: string;
  pet_id: string;
  clinic_id?: string | null;
  /** The acting user who wrote the note (accountability). */
  author_id?: string | null;
  /** Denormalized author display name, snapshotted at write time. */
  author_name?: string | null;
  note_text: string;
  /** When set, this note belongs to a specific visit (زيارة). */
  visit_id?: string | null;
  created_at: string; // ISO timestamp
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
  | "no_show" // حجز وما حضر — يميز المتخلفين عن الملغين (migration 0081)
  | "cancelled";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  /** Service types this doctor handles. */
  services: ServiceType[];
}

/** Safe public listing of a clinic for the owner-side booking directory. */
export interface ClinicInfo {
  id: string;
  name: string;
  city?: string | null;
  phone?: string | null;
}

/** Safe public subset of a clinic staff member (owner-side booking). */
export interface PublicStaff {
  id: string;
  name: string;
  role: string;
  specialty?: string | null;
}

export interface Appointment {
  id: string;
  pet_id: string;
  owner_id: string;
  /** Clinic workspace the booking targets — how it reaches that clinic's reception. */
  clinic_id?: string | null;
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
/** نوع المهمة على ورقة العلاج.
 *
 *  الطبلة ليست جدول أدوية: الحيوان الراقد يأكل ويبول وتُقاس حرارته وتجري
 *  سوائله وتُغيَّر ضماداته. ولكل نوعٍ **طريقة إنجاز مختلفة**: الدواء يُنجَز
 *  بعلامة، والعلامات الحيوية والتغذية تُنجَز **بقيمةٍ تُكتب** — وهذا هو سبب
 *  وجود حقل result. */
export type TaskType = "drug" | "fluid" | "vitals" | "feed" | "elim" | "nurse" | "lab";

/** طريق الإعطاء — أحد «حقوق الدواء الخمسة». غيابه يعني أن المنفّذ يخمّن. */
export type DoseRoute = "iv" | "im" | "sc" | "po" | "topical" | "inhaled";

export interface TreatmentEntry {
  id: string;
  pet_id: string;
  day: string; // ISO date
  doctor?: string; // doctor treating the patient that day
  medication: string; // type of medication
  time: string; // scheduled time of administration, e.g. "08:00"
  amount: string; // dose / quantity, e.g. "1.4 ml" or "75 mg"
  /** نوع المهمة. غيابه = دواء (كل الصفوف قبل هجرة 0115). */
  task_type?: TaskType;
  /** طريق الإعطاء — للأدوية والسوائل. */
  route?: DoseRoute | null;
  /** القيمة المسجَّلة عند الإنجاز: «٣٩٫٦» أو «٨٠٪» أو «٣٤٠ مل». */
  result?: string | null;
  /** لماذا فاتت — توثيقٌ يحمي العيادة ويُغني ورقة التسليم. */
  missed_reason?: string | null;
  observations?: string; // daily note on the animal's condition
  /** Set when the dose has actually been administered (flowsheet done-state). */
  administered_at?: string | null; // ISO datetime
  administered_by?: string; // who gave it
  /** When set, this scheduled dose belongs to a visit's treatment plan. */
  visit_id?: string | null;
  /** Marks a dose whose plan row was edited after the plan was first saved. */
  edited?: boolean;
  created_at: string;
}

// "treatment_boarding" = therapeutic boarding: the pet is staying in the clinic
// AND under active medical care at the same time (counts as both boarding + care).
export type AdmissionKind = "treatment" | "boarding" | "treatment_boarding";
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
  /** Row creation timestamp (ISO). Drives newest-first ordering of the case history. */
  created_at?: string;
  /** Owning clinic (shared workspace). Scopes the operational calendar. */
  clinic_id?: string | null;
  /** Branch (location) inside the clinic. NULL always means the main branch —
   *  existing single-branch clinics never carry a value here. */
  branch_id?: string | null;
  /** How the stay ended: recovered (عايش) or deceased (متوفى). NULL = unspecified. */
  outcome?: "recovered" | "deceased" | null;
}

// A clinic VISIT (زيارة) — a self-contained encounter opened each time the pet
// comes in. Routine (checkup/grooming/…) visits are quick; an "illness" visit
// carries the full clinical workspace (diagnosis + a day-by-day treatment plan).
export type VisitKind = "illness" | "checkup" | "grooming" | "vaccination" | "followup" | "other";
export type VisitStatus = "open" | "ended";

export interface ClinicVisit {
  id: string;
  pet_id: string;
  clinic_id?: string | null;
  kind: VisitKind;
  reason?: string | null;
  status: VisitStatus;
  /** Case status at intake — a CaseOutcome id (under_treatment / recovered / …). */
  condition?: string | null;
  opened_at: string;            // ISO datetime the pet came in
  ended_at?: string | null;
  opened_by?: string | null;
  ended_by?: string | null;
  /** Final case status when the visit is ended — a CaseOutcome id. */
  outcome?: string | null;
  /** Closing note recorded on end. */
  summary?: string | null;
  created_at?: string;
}

/** A physical location of the clinic. Purely organisational — the security
 *  boundary stays clinic_id; branches never gate data access on their own. */
export interface Branch {
  id: string;
  clinic_id?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  /** The primary location. Pre-branches data (branch_id NULL) belongs to it. */
  is_main?: boolean;
  is_active?: boolean;
  created_at?: string;
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

/** One shared sticky-note pad per clinic per calendar day (dashboard widget). */
export interface DailyNote {
  note_date: string; // YYYY-MM-DD
  content: string;
  updated_by?: string | null;
  updated_at: string;
}

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

/** A supplier / brand "company" (شركة) — a section inside inventory that groups
 *  the barcodes/products belonging to it. Created by the clinic; a product links
 *  to at most one company via `company_id`. Clinic-isolated. */
export interface Company {
  id: string;
  /** Owning clinic (tenant isolation). */
  clinic_id?: string | null;
  name: string;
  /** Optional free-text note (agent, phone, price list…). */
  note?: string | null;
  created_at: string;
}

/** A named section/group (صنف) INSIDE a company — the middle level of the
 *  Company → Section → Barcode hierarchy. A product links to at most one section
 *  via `section_id` (and that section belongs to the product's company). */
export interface CompanySection {
  id: string;
  clinic_id?: string | null;
  /** The company this section lives under. */
  company_id: string;
  name: string;
  /** Legacy/opening "pooled" stock — an aggregate count of unknown per-barcode
   *  breakdown held at the section level. Barcodes added without a count draw
   *  from this pool; a sale of any barcode in the section decrements it first
   *  (oldest-stock-first), before touching a product's own tracked `stock`. */
  pooled_stock?: number | null;
  created_at: string;
}

export interface Product {
  /** منتجات أُضيفت سوية من «إضافة عدة باركودات» — نفس المعرف = مجموعة واحدة تُعدَّل معاً. */
  bulk_group?: string | null;
  id: string;
  /** Owning clinic (tenant isolation). */
  clinic_id?: string | null;
  barcode?: string | null;
  name: string;
  category?: ProductCategory | null;
  /** The company/brand (شركة) this product belongs to — see `Company`. Optional. */
  company_id?: string | null;
  /** The section (صنف) inside the company this product belongs to — see `CompanySection`. Optional. */
  section_id?: string | null;
  /** True = this barcode was added WITHOUT an individual count; its quantity is
   *  unknown and it sells from its section's pooled_stock. `stock` is usually 0
   *  until a purchase gives it a real count (which flips this back to false). */
  pooled?: boolean;
  /** Free-text subcategory (e.g. "معلبات", "رمل", "دراي فود") — used by Mix & Match promotions. */
  subcategory?: string | null;
  purchase_price: number;
  sell_price: number;
  stock: number;
  /** Reorder level — stock at or below this triggers a low-stock warning. */
  min_stock?: number | null;
  expiry_date?: string | null; // ISO date
  /** Fractional sales: the box can be broken into smaller units (e.g. a pill from a strip). */
  has_sub_unit?: boolean;
  /** Name of one sub-unit shown at the till, e.g. "حبة" / "شريط" / "مل". */
  sub_unit_name?: string | null;
  /** How many sub-units fill one box (e.g. 20 pills per box). */
  units_per_box?: number | null;
  /** Price of a single sub-unit (used when selling by the sub-unit). */
  sub_unit_price?: number | null;
  /** معروض بالمتجر الإلكتروني العام (0095). الافتراضي: مخفي. */
  store_visible?: boolean;
  /** وصف تسويقي قصير يظهر تحت الاسم ببطاقة المتجر. */
  store_desc?: string | null;
  created_at: string;
}

export type PaymentMethod = "cash" | "card" | "transfer";
/** One leg of a (possibly split) payment — a method and the amount paid through it.
 *  `at` is the ISO datetime the money was actually received; it is set on later debt
 *  installments (settlements) so the cash lands on the collection day, not the sale day.
 *  Absent on the original checkout legs (they fall back to the invoice's own date). */
/** ساقُ تحصيلٍ واحدة. **المبلغ السالب يعني تصحيح تحصيل** (قيدٌ عكسي، هجرة
 *  0113): مالٌ سُجّل واصلاً ولم يصل، فيُعكَس من نفس الجيب الذي دخل منه.
 *  والإشارة وحدها تميّزه — بلا عَلَمٍ إضافي يمكن أن يُنسى ضبطه. */
export interface PaymentSplit { method: PaymentMethod; amount: number; at?: string | null; note?: string | null }
/** Settlement state of a sale relative to its total. Derived from amount_paid vs total. */
export type PaymentStatus = "paid" | "partial" | "unpaid";
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
  /** Primary/dominant method (largest leg) — kept for legacy reads & quick filters. */
  payment_method?: PaymentMethod | null;
  /** Split payment: every method+amount leg of this sale. Single-method sales hold one leg. */
  payment_details?: PaymentSplit[] | null;
  total: number; // revenue after discount
  /** Cumulative amount received so far (incl. later installments). Absent on legacy rows = fully paid. */
  amount_paid?: number;
  cost_total: number; // sum of purchase prices (cost of goods)
  profit: number; // total - cost_total
  item_count: number; // number of units sold
  print_count?: number; // times this invoice has been printed
  status?: InvoiceStatus; // 'paid' | 'refunded'
  refunded_at?: string | null;
  /** Cashier / sales rep (staff id) who made the sale — for staff performance reports. */
  staff_id?: string | null;
  /** Free-text note the doctor/cashier attached at checkout (shown in the pet's
   *  record and on the printed invoice). Optional. */
  notes?: string | null;
  created_at: string;
}

/** Where a withdrawal's money physically came from — the drawer, the card
 *  terminal balance, or the bank account. Rows recorded before this existed
 *  are treated as cash (the ledger's original semantics). */
export type ExpenseMethod = "cash" | "card" | "bank";

/** An expense / withdrawal from the clinic (rent, supplies, salaries, petty
 *  cash…). Append-only ledger, clinic-isolated. `description` says WHERE &
 *  WHY the money was spent; `method` says which pocket it left. */
export interface Expense {
  id: string;
  clinic_id?: string | null;
  amount: number;                 // > 0
  description: string;            // where & why the money was spent (required)
  category?: string | null;       // optional bucket (rent/salaries/utilities/supplies…)
  method?: ExpenseMethod | null;  // cash (default) / card / bank
  staff_id?: string | null;       // who recorded it (auto-stamped)
  spent_at: string;               // ISO — when the money actually left
  created_at: string;             // ISO — when it was recorded
}

/** Verdict scale for a lab value — three levels come from numeric flagging,
 *  the five-level scale covers quick qualitative entry (بلا أرقام). */
export type LabValueFlag = "very_low" | "low" | "normal" | "high" | "very_high";

/** One measured value inside a numeric lab result. Range and unit are
 *  SNAPSHOTTED at entry time — analysers differ and references evolve, so a
 *  historic result is never re-judged by tomorrow's ranges. `value` is absent
 *  for qualitative (verdict-only) entries. */
export interface LabValue {
  id: string;                     // catalog param id, or a slug for free-form
  label?: string;                 // display label (required for free-form)
  abbr?: string;
  value?: number;                 // absent → verdict-only (qualitative) entry
  unit: string;
  low?: number;                   // snapshotted normal band
  high?: number;
  flag: LabValueFlag;
  /** true → the doctor recorded a verdict, not a number. */
  qualitative?: boolean;
}

/** A paired lab-machine receiver (المُستقبِل الصغير). `token` is the secret
 *  credential the receiver agent presents to the cloud ingest RPC — shown once
 *  at creation and stored on the receiver's config, not re-fetched into the UI. */
export interface LabDeviceLink {
  id: string;
  clinic_id?: string | null;
  name: string;                    // «جهاز CBC — غرفة المختبر»
  token: string;                   // secret; blank on list responses after creation
  revoked?: boolean;
  last_seen_at?: string | null;    // ISO — last message received from this device
  created_at: string;
}

/** One raw device message waiting in the clinic's inbox (before a doctor
 *  attaches it to a pet). Parsed on-device by labLink when accepted. */
export interface LabDeviceInbox {
  id: string;
  clinic_id?: string | null;
  link_id?: string | null;
  device_name?: string | null;     // snapshot of the device name at receipt
  raw: string;                     // the analyzer's raw message (HL7/ASTM/text)
  status: "new" | "accepted" | "dismissed";
  received_at: string;             // ISO
  handled_at?: string | null;
}

/** A laboratory result (نتيجة تحاليل) on a pet's record. Three shapes:
 *  numeric (CBC/chemistry values), snap (positive/negative rapid test),
 *  descriptive (cytology/culture/fecal — text + photo). */
export interface LabResult {
  id: string;
  pet_id: string;
  clinic_id?: string | null;
  visit_id?: string | null;       // الطبلة this was run under (if any)
  panel_id: string;               // catalog panel id ('cbc', 'snap', 'custom'…)
  panel_label: string;            // snapshot — survives catalog renames
  kind: "numeric" | "snap" | "descriptive";
  values?: LabValue[] | null;     // numeric panels
  snap_test_id?: string | null;   // snap: which rapid test
  snap_result?: "positive" | "negative" | null;
  notes?: string | null;          // findings / sediment / culture text
  photo_url?: string | null;      // photo of the analyser printout / slide
  doctor?: string | null;
  billed?: boolean | null;        // marked when charged on a sale
  taken_at: string;               // ISO — when the sample/result was taken
  created_at: string;
  // ---- lifecycle (LIS) — see src/lib/labStatus.ts ----
  status?: LabStatusValue | null; // ordered → collected → running → resulted → verified
  priority?: "routine" | "urgent" | null; // urgent = STAT (عاجل)
  ordered_at?: string | null;
  collected_at?: string | null;
  running_at?: string | null;
  resulted_at?: string | null;
  verified_at?: string | null;
  collected_by?: string | null;   // who drew the sample
  verified_by?: string | null;    // who released the result
}

/** Lab order lifecycle stage (kept here so LabResult stays self-describing). */
export type LabStatusValue = "ordered" | "collected" | "running" | "resulted" | "verified" | "canceled";

/** Sale-level metadata captured by the retail builder and sent to checkout. */
export interface SaleMeta {
  customer_name?: string | null;
  customer_phone?: string | null;
  /** Patient name when the sale is raised for a specific animal (prints on the invoice). */
  pet_name?: string | null;
  discount_type?: DiscountType | null;
  discount_value?: number; // raw input: a percent (0–100) or a fixed amount
  payment_method?: PaymentMethod | null;
  /** Split payment legs (method + amount). When present, their sum equals amount_paid. */
  payment_details?: PaymentSplit[] | null;
  /** Amount received today at checkout. When < total the sale is saved on credit (دفع آجل). */
  amount_paid?: number;
  /** Cashier-set final price to charge outright. May be ABOVE the cart subtotal (a markup)
   *  or below it (a discount). When present it IS the invoice total (clamped ≥ 0). */
  final_total?: number;
  /** Cashier / sales rep (staff id) who made the sale — for staff performance reports. */
  staff_id?: string | null;
  /** Free-text note the doctor/cashier attached at checkout. */
  notes?: string | null;
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
  /** Box-equivalent removed from stock (0.25 for 5 of 20 pills). Null on box sales → equals qty. */
  stock_qty?: number | null;
  /** How much of this line was drawn from the section's pooled_stock (vs the
   *  product's own tracked stock) at sale time. Lets a refund/void credit the
   *  exact split back — the pooled part to the pool, the rest to stock. */
  pooled_qty?: number | null;
  /** Unit the customer bought, snapshotted for the receipt (e.g. "علبة" / "حبة"). */
  unit_label?: string | null;
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
  /** Box-equivalent to deduct from stock (qty / units_per_box for sub-unit sales). Defaults to qty. */
  stock_qty?: number;
  /** Sale unit label persisted for the receipt (e.g. "علبة" / "حبة"). */
  unit_label?: string | null;
}

/* ---------------- Purchases (المشتريات — restocking from a company) ---------------- */
/** A purchase/restock invoice: goods received FROM a supplier company. Saving one
 *  bulk-updates inventory (existing products get +stock & refreshed prices; new
 *  barcodes become new products under the company) and keeps a printable record. */
export interface Purchase {
  id: string;
  clinic_id?: string | null;
  /** The supplier company (شركة) the goods came from. */
  company_id?: string | null;
  /** Snapshot of the company name at purchase time (survives company rename/delete). */
  company_name?: string | null;
  /** The supplier's own invoice/reference number (optional). */
  reference?: string | null;
  total: number;            // sum of line costs (qty × purchase_price)
  item_count: number;       // total units received across all lines
  /** Amount paid to the supplier so far. Absent = fully paid (legacy). */
  amount_paid?: number;
  payment_method?: PaymentMethod | null;
  /** Settlement state vs. total — derived from amount_paid. */
  status?: PaymentStatus;
  /** اسم المورد/المندوب الذي جهّز هذه الفاتورة (اختياري — ترحيل 0076). */
  supplier_name?: string | null;
  /** هاتف المورد/المندوب (اختياري). */
  supplier_phone?: string | null;
  notes?: string | null;
  purchased_at: string;     // ISO — when the goods were received
  staff_id?: string | null; // who recorded it
  created_at: string;
}

/** دفعة تسديد على فاتورة شراء آجلة — سجل «دفتر الديون» (ترحيل 0076).
 *  Every settlement leg against a supplier purchase; amount_paid on the
 *  purchase is the running sum, these rows are the history. */
export interface PurchasePayment {
  id: string;
  clinic_id?: string | null;
  purchase_id: string;
  company_id?: string | null;
  amount: number;
  method?: PaymentMethod | null;
  note?: string | null;
  paid_at: string; // ISO — when the money was handed over
  staff_id?: string | null;
  created_at: string;
}

/** One received line of a purchase — a snapshot of what came in and at what cost. */
export interface PurchaseItem {
  id: string;
  purchase_id: string;
  clinic_id?: string | null;
  /** The inventory product this line stocked (existing or newly created). */
  product_id?: string | null;
  barcode?: string | null;
  name: string;             // snapshot of the product name
  category?: ProductCategory | null;
  qty: number;              // units received (added to stock)
  purchase_price: number;   // cost per unit at receipt
  sell_price: number;       // sell price set/kept at receipt
  created_at: string;
}

/* ---------------- Pet movements (سجل حركات الحيوان) ---------------- */
export type PetMovementEvent = "admitted" | "discharged" | "transferred" | "cage_changed";

/** One immutable movement event in an animal's clinic history — written
 *  automatically whenever an admission is created or its status/kind/cage
 *  changes (server trigger in production; mirrored by the demo adapter). */
export interface PetMovement {
  id: string;
  clinic_id?: string | null;
  pet_id: string;
  admission_id?: string | null;
  at: string; // ISO — the exact moment of the movement
  event: PetMovementEvent;
  from_kind?: AdmissionKind | null;
  to_kind?: AdmissionKind | null;
  from_cage?: string | null;
  to_cage?: string | null;
  created_at: string;
}

/** سطر فاتورة بعد التعديل (0110): id موجود = سطر قائم يُعدَّل، غائب = سطر جديد.
 *  تُستهلك من repo.editInvoiceLines التي تعكس المخزون ثم تعيد خصمه بدقة. */
export interface EditLine {
  id?: string;
  product_id?: string | null;
  name: string;
  barcode?: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
  unit_label?: string | null;
  /** المسحوب من المخزون بمكافئ العلبة (٠٫٢٥ لخمس حبّات من علبة عشرين). غائب = يساوي الكمية. */
  stock_qty?: number | null;
}

/* ---------------- Delivery (التوصيل — الدفع عند الاستلام) ---------------- */
/** Lifecycle of a cash-on-delivery order:
 *  preparing (قيد التجهيز) → out (بالطريق) → delivered (مستلم) | returned (راجع). */
export type DeliveryStatus = "preparing" | "out" | "delivered" | "returned";

/** A delivery driver / courier company the clinic works with (سجل السواق). */
export interface Courier {
  id: string;
  clinic_id?: string | null;
  name: string;
  phone?: string | null;
  note?: string | null;   // company, vehicle, area…
  /** Archived couriers stay on old orders but disappear from pickers. */
  active: boolean;
  created_at: string;
}

/** A cash-on-delivery order wrapping a retail invoice. The invoice is created by
 *  the normal checkout with amount_paid = prepaid (stock deducted at dispatch,
 *  revenue NOT counted); the courier's hand-over settles the invoice (money
 *  enters on the day it actually arrives) and a returned order refunds it
 *  (restock, pooled-aware). */
export interface DeliveryOrder {
  id: string;
  clinic_id?: string | null;
  invoice_id: string;
  courier_id?: string | null;
  /** Branch the order was dispatched from (NULL = main/unassigned — shows everywhere). */
  branch_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  /** منطقة التوصيل المختارة من قائمة العيادة (0099) — لوين طالع الطلب. */
  zone?: string | null;
  address?: string | null;
  note?: string | null;
  /** Collected from the customer at the door ON TOP of the goods total. */
  delivery_fee: number;
  /** true → the fee is clinic revenue (added to the invoice as a service line,
   *  i.e. included in cod_amount); false → the courier keeps the fee. */
  fee_to_clinic: boolean;
  /** What the courier owes the clinic on return = the invoice's due at creation. */
  cod_amount: number;
  /** Paid in the clinic before dispatch (already in the invoice's amount_paid). */
  prepaid: number;
  status: DeliveryStatus;
  created_at: string;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  returned_at?: string | null;
}

/** One line from the purchase builder handed to the repo. `product_id` is set when
 *  the barcode/name matched an existing product (→ restock); otherwise a new
 *  product is created under the purchase's company. */
export interface PurchaseDraftLine {
  product_id?: string | null;
  barcode?: string | null;
  name: string;
  /** الصنف داخل الشركة الذي يهبط فيه المنتج **الجديد** — المطابَق يبقى بمكانه. */
  section_id?: string | null;
  category?: ProductCategory | null;
  qty: number;
  purchase_price: number;
  sell_price: number;
  min_stock?: number | null;
  expiry_date?: string | null;
}

/** Purchase-level metadata sent to the repo alongside the draft lines. */
export interface PurchaseMeta {
  company_id?: string | null;
  company_name?: string | null;
  reference?: string | null;
  amount_paid?: number;
  payment_method?: PaymentMethod | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  notes?: string | null;
  purchased_at?: string | null;
  staff_id?: string | null;
}

/* ---------------- Services & non-barcode items ---------------- */
/** A clinic-defined service category (e.g. Laboratory, Imaging, Consultation). */
export interface ServiceCategory { id: string; name: string }
/** A billable non-barcode service with a default price (overridable per sale). */
export interface Service {
  id: string; category_id: string; name: string; price: number;
  /** باركود تصنعه العيادة بنفسها للخدمة (0102): مسحه بالكاشير ينزّلها بالسلة
   *  فوراً، فالخدمات المتكررة تنباع بمسحة بدل تنقّل بين التصنيفات. */
  barcode?: string | null;
  /** مرجع لعملية من الكتالوج الجراحي (الاسم العلمي) — خدمة أُنشئت من «مكتبة
   *  العمليات»: تبقى معروفة النوع بدقة حتى لو غيّر الطبيب اسمها أو سعرها. */
  surgery_ref?: string | null;
}
export interface ServiceCatalog { categories: ServiceCategory[]; services: Service[] }

/** An audit-trail row (who did what, when) — from the audit_log table (migration 0018).
 *  Used by the Reports module's security log (e.g. deleted invoices + who deleted them). */
export interface AuditEntry {
  id: number | string;
  clinic_id?: string | null;
  actor?: string | null;   // auth.uid() of who performed the action
  action: string;          // INSERT | UPDATE | DELETE
  entity: string;          // affected table name
  entity_id?: string | null;
  details?: Record<string, unknown> | null; // snapshot of the affected row
  created_at: string;
}

/** A staff login event — for the Reports module's user-login audit trail. */
export interface LoginEvent {
  id: number | string;
  clinic_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  name?: string | null;
  created_at: string;
}

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

/** عملية جراحية مسجلة على حيوان — تُنشأ من داخل سجل الحالة (الطبلة). */
export interface Surgery {
  id: string;
  pet_id: string;
  /** الزيارة/الطبلة التي سُجلت منها العملية. */
  visit_id?: string | null;
  clinic_id?: string | null;
  /** اسم العملية (من الكتالوج أو مخصص). */
  name: string;
  /** تصنيف الكتالوج (تعقيم، عظام، …) — للعرض والفرز. */
  category?: string | null;
  performed_at: string; // ISO datetime
  surgeon?: string | null;
  anesthesia?: string | null;
  duration_min?: number | null;
  /** success | complications | critical */
  outcome?: string | null;
  /** المدخل الجراحي (Ventral midline, Flank, …). */
  approach?: string | null;
  /** أنماط الخياطة المستخدمة — نص مجمّع "نمط + نمط". */
  suture_pattern?: string | null;
  /** مادة الخيط (PDS, Vicryl, …). */
  suture_material?: string | null;
  /** قياس الخيط USP (3-0, 4-0, …). */
  suture_size?: string | null;
  notes?: string | null;
  /** موعد المتابعة / شيل الخيوط (تاريخ). */
  followup_on?: string | null;
  created_at?: string;
}

export interface DemoDB {
  pets: Pet[];
  weightLogs: WeightLog[];
  vaccinations: Vaccination[];
  media: MediaItem[];
  visits: MedicalVisit[];
  clinicVisits: ClinicVisit[];
  appointments: Appointment[];
  treatments: TreatmentEntry[];
  admissions: Admission[];
  reminders: Reminder[];
  products: Product[];
  companies?: Company[];
  companySections?: CompanySection[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  purchases?: Purchase[];
  purchaseItems?: PurchaseItem[];
  purchasePayments?: PurchasePayment[];
  couriers?: Courier[];
  deliveryOrders?: DeliveryOrder[];
  petMovements?: PetMovement[];
  surgeries?: Surgery[];
  waMessages?: WhatsAppMessage[];
  branches?: Branch[];
  labResults?: LabResult[];
  petProblems?: PetProblem[];
  careEntries?: CareEntry[];
  deviceLinks?: LabDeviceLink[];
  deviceInbox?: LabDeviceInbox[];
  featureRequests?: FeatureRequest[];
  generatedBarcodes?: GeneratedBarcode[];
  storeProfile?: StoreProfile | null;
  storeOrders?: StoreOrder[];
  journeys?: Journey[];
  journeyEvents?: JourneyEvent[];
}

/* ----------------------------- رحلة الحيوان بالعيادة ----------------------------- */

/** نوع الرحلة يحدد مراحلها — الكتلوك في lib/journey.ts. */
export type JourneyKind = "checkup" | "surgery" | "grooming" | "labs" | "boarding";
export type JourneyStage =
  | "arrived" | "waiting" | "with_doctor" | "done" | "ready"
  | "prep" | "in_surgery" | "out_ok" | "recovery"
  | "grooming" | "drying"
  | "sampled" | "processing" | "reviewed"
  | "settled";

/**
 * رحلة واحدة نشطة لكل حيوان: من الاستلام حتى التسليم. المالك يتابعها برابط
 * عام برمز — بلا تسجيل دخول — والرابط يموت بعد ٤٨ ساعة من الإغلاق.
 * `last_seen_at` يخبر الطبيب أن المالك شاف آخر تحديث (يمنع اتصالات «شنو صار؟»).
 */
export interface Journey {
  id: string;
  clinic_id?: string | null;
  pet_id: string;
  kind: JourneyKind;
  stage: JourneyStage;
  status: "active" | "closed";
  token: string;
  started_at: string;
  closed_at?: string | null;
  last_seen_at?: string | null;
  /** إغلاق صامت (نتيجة صعبة): لا حدث «جاهز» ولا أي إشعار — الهاتف فقط. */
  silent?: boolean;
  created_by?: string | null;
}

/** حدث بسجل الرحلة — السجل لا يُعدَّل: التسلسل الزمني هو الأحداث نفسها. */
export interface JourneyEvent {
  id: string;
  journey_id: string;
  clinic_id?: string | null;
  kind: "stage" | "message" | "photo";
  stage?: JourneyStage | null;
  body?: string | null;
  /** صورة مطمئنة صغيرة (data URL مضغوطة) — تُعرض للمالك مباشرة. */
  photo?: string | null;
  /** رد المالك بإيموجي — آخر رد يغلب. لا نص، لا دردشة. */
  reaction?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

/** ما تعيده صفحة التتبّع العامة — مقصوصة بعناية: ولا معلومة طبية. */
export interface JourneyPublicView {
  pet_name: string;
  clinic_name: string;
  clinic_phone?: string | null;
  kind: JourneyKind;
  stage: JourneyStage;
  status: "active" | "closed";
  started_at: string;
  events: Pick<JourneyEvent, "id" | "kind" | "stage" | "body" | "photo" | "reaction" | "created_at">[];
}

/* ----------------------------- المتجر الإلكتروني ----------------------------- */

/** هوية متجر العيادة العام: الرابط والإعدادات (صف واحد لكل عيادة). */
export interface StoreProfile {
  clinic_id?: string | null;
  /** المقطع الأخير من الرابط العام /s/<slug> — حروف إنكليزية صغيرة/أرقام/شرطات. */
  slug: string;
  enabled: boolean;
  bio?: string | null;
  delivery_fee: number;
  min_order: number;
  /** رقم واتساب استلام الطلبات (يرجع لهاتف العيادة إذا فارغ). */
  whatsapp?: string | null;
  updated_at?: string;
}

/** بند داخل طلب متجر — لقطة مجمّدة لحظة الطلب (الاسم والسعر من القاعدة). */
export interface StoreOrderItem { product_id: string; name: string; qty: number; price: number; total: number }

export type StoreOrderStatus = "new" | "accepted" | "rejected" | "cancelled";

/** طلب زبون من المتجر العام. القبول اليدوي هو الي يولد الفاتورة ويسحب المخزون. */
export interface StoreOrder {
  id: string;
  clinic_id?: string | null;
  /** رقم قصير للتخاطب مع الزبون (SO-3F9A2C). */
  order_no: string;
  customer_name: string;
  customer_phone: string;
  address?: string | null;
  note?: string | null;
  items: StoreOrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: StoreOrderStatus;
  /** فاتورة القبول (إن قُبل) — سحب المخزون صار عبرها. */
  invoice_id?: string | null;
  decided_at?: string | null;
  created_at: string;
}

/** بطاقة المتجر كما يراها الزائر المجهول (مخرجات store_front الآمنة فقط). */
export interface StoreFrontInfo {
  name: string;
  logo_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  bio: string | null;
  delivery_fee: number;
  min_order: number;
}

/** منتج بعين الزائر: أعمدة العرض فقط — «متوفر» boolean والكمية سر داخلي. */
export interface StoreCatalogItem {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number;
  descr: string | null;
  available: boolean;
}

/* ── الرواتب (هجرة 0112) ───────────────────────────────────────────────────
 * القسيمة **مبالغُها مخزّنة لا محسوبة عند العرض**: لو أُعيد اشتقاقها من
 * البيانات الحيّة لغيّرت زيادةُ راتبٍ اليوم قسيمةَ السنة الماضية. ومنطق
 * الحساب نفسه يسكن src/lib/payroll.ts دوالَّ نقيّة. */

/** أساس أجر اليوم — قرار العيادة، ويُطبع على القسيمة. */
export type PayrollDayRateBasis = "calendar_30" | "working_days";
export type PayrollRunStatus = "draft" | "calculated" | "approved" | "paid" | "closed";
export type PayMethod = "cash" | "bank" | "wallet";
export type PayLineKind = "earning" | "deduction";
export type LoanStatus = "active" | "settled" | "written_off";

export interface PayrollPolicyDTO {
  dayRateBasis: PayrollDayRateBasis;
  workingDays: number;
  deductionCapPct: number;
  roundTo: number;
}

/** صفٌّ مؤرَّخ من هيكل الأجر — الزيادة صفّ جديد لا تعديل فوق القديم. */
export interface StaffComp {
  id: string;
  clinic_id?: string | null;
  staff_id: string;
  effective_from: string;   // YYYY-MM-DD
  base_amount: number;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
}

/** بدل أو استقطاع ثابت يتكرّر كل شهر بلا إعادة إدخال. */
export interface StaffRecurring {
  id: string;
  clinic_id?: string | null;
  staff_id: string;
  code: string;
  amount: number;
  note?: string | null;
  from_date: string;
  to_date?: string | null;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  clinic_id?: string | null;
  period: string;           // أول يوم بالشهر
  status: PayrollRunStatus;
  /** لقطة السياسة وقت الاعتماد — بدونها يتغيّر الماضي بتغيّر الإعدادات. */
  policy?: PayrollPolicyDTO | null;
  calculated_at?: string | null; calculated_by?: string | null;
  approved_at?: string | null;   approved_by?: string | null;
  paid_at?: string | null;
  closed_at?: string | null;
  note?: string | null;
  created_at: string;
}

export interface Payslip {
  id: string;
  clinic_id?: string | null;
  run_id: string;
  staff_id: string;
  /** الاسم لقطةً: حذف الموظف لا يمحو قسائمه من التاريخ. */
  staff_name: string;
  branch_id?: string | null;
  base_amount: number;
  gross: number;
  deductions: number;
  /** ما رحّله السقف إلى الشهر الجاي. */
  deferred: number;
  net: number;
  paid_at?: string | null;
  pay_method?: PayMethod | null;
  expense_id?: string | null;
  created_at: string;
}

export interface PayslipLine {
  id: string;
  clinic_id?: string | null;
  payslip_id: string;
  code: string;
  kind: PayLineKind;
  qty?: number | null;
  rate?: number | null;
  amount: number;
  deferred: number;
  /** النصّ الحرّ تحت البند لا بدلاً عنه. */
  reason?: string | null;
  ref_kind?: string | null;
  ref_id?: string | null;
  created_at: string;
}

/** سلفة: ذمّة على الموظف — أصلٌ عند العيادة لا كلفة رواتب. */
export interface StaffLoan {
  id: string;
  clinic_id?: string | null;
  staff_id: string;
  principal: number;
  installment: number;
  remaining: number;
  reason?: string | null;
  status: LoanStatus;
  started_on: string;
  expense_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface StaffLoanEvent {
  id: string;
  clinic_id?: string | null;
  loan_id: string;
  kind: "disbursed" | "installment" | "written_off";
  amount: number;
  payslip_id?: string | null;
  note?: string | null;
  at: string;
  created_by?: string | null;
}

/** ما يرسله العميل لحفظ دورة — الخادم يشتقّ الإجماليات من السطور لا يقرأها. */
export interface PayslipDraft {
  staff_id: string;
  staff_name: string;
  branch_id?: string | null;
  base_amount: number;
  lines: Array<{
    code: string; kind: PayLineKind;
    qty?: number | null; rate?: number | null;
    amount: number; deferred?: number;
    reason?: string | null; ref_kind?: string | null; ref_id?: string | null;
  }>;
}
