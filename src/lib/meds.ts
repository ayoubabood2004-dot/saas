// Comprehensive veterinary medication catalogue, grouped by therapeutic type.
// Doctors can extend the clinic's list at runtime (persisted) — see clinic-meds helpers.
import { getActiveClinicId } from "./clinics";

export interface MedCategory {
  type: string;
  items: string[];
}

export const MED_CATALOG: MedCategory[] = [
  {
    type: "Antibiotics",
    items: [
      "Amoxicillin 250mg", "Amoxicillin-Clavulanate", "Ampicillin", "Cephalexin", "Cefovecin (Convenia)",
      "Ceftriaxone", "Doxycycline", "Enrofloxacin (Baytril)", "Marbofloxacin", "Ciprofloxacin",
      "Metronidazole", "Clindamycin", "Trimethoprim-Sulfadiazine", "Gentamicin", "Amikacin",
      "Tylosin", "Penicillin G", "Azithromycin", "Chloramphenicol", "Florfenicol",
    ],
  },
  {
    type: "NSAIDs & Analgesics",
    items: [
      "Carprofen 75mg", "Meloxicam", "Robenacoxib (Onsior)", "Firocoxib (Previcox)", "Ketoprofen",
      "Tolfenamic acid", "Tramadol", "Gabapentin", "Buprenorphine", "Butorphanol",
      "Fentanyl", "Morphine", "Hydromorphone", "Paracetamol (dogs only)",
    ],
  },
  {
    type: "Anesthetics & Sedatives",
    items: [
      "Propofol", "Alfaxalone", "Ketamine", "Isoflurane", "Sevoflurane",
      "Dexmedetomidine", "Medetomidine", "Xylazine", "Acepromazine", "Midazolam",
      "Diazepam", "Atropine", "Glycopyrrolate", "Lidocaine 2%", "Bupivacaine",
    ],
  },
  {
    type: "Antiparasitics",
    items: [
      "Ivermectin", "Selamectin (Revolution)", "Moxidectin", "Milbemycin oxime", "Fipronil (Frontline)",
      "Imidacloprid (Advantage)", "Praziquantel (deworming)", "Pyrantel pamoate", "Fenbendazole (Panacur)",
      "Afoxolaner (NexGard)", "Fluralaner (Bravecto)", "Sarolaner", "Amitraz", "Toltrazuril",
    ],
  },
  {
    type: "Antifungals",
    items: ["Ketoconazole", "Itraconazole", "Fluconazole", "Griseofulvin", "Terbinafine", "Nystatin", "Amphotericin B"],
  },
  {
    type: "Corticosteroids",
    items: ["Prednisolone", "Prednisone", "Dexamethasone", "Methylprednisolone", "Triamcinolone", "Hydrocortisone"],
  },
  {
    type: "Gastrointestinal",
    items: [
      "Maropitant (Cerenia)", "Metoclopramide", "Ondansetron", "Omeprazole", "Pantoprazole",
      "Famotidine", "Ranitidine", "Sucralfate", "Cimetidine", "Kaolin-pectin", "Lactulose",
    ],
  },
  {
    type: "Cardiac & Diuretics",
    items: ["Furosemide", "Pimobendan (Vetmedin)", "Benazepril", "Enalapril", "Spironolactone", "Digoxin", "Diltiazem", "Atenolol"],
  },
  {
    type: "Endocrine & Hormones",
    items: ["Insulin", "Levothyroxine", "Methimazole", "Trilostane", "Desmopressin", "Oxytocin", "Prostaglandin F2α"],
  },
  {
    type: "Antihistamines & Dermatology",
    items: ["Diphenhydramine", "Chlorpheniramine", "Cetirizine", "Hydroxyzine", "Oclacitinib (Apoquel)", "Cyclosporine (Atopica)"],
  },
  {
    type: "Fluids & Electrolytes",
    items: ["Lactated Ringer's (IV)", "Normal Saline 0.9%", "Dextrose 5%", "Hetastarch", "Hypertonic Saline 7.5%", "Potassium Chloride", "Calcium Gluconate"],
  },
  {
    type: "Vaccines",
    items: ["Rabies", "DHPP", "DHLPP", "Bordetella", "Leptospirosis", "Canine Influenza", "FVRCP", "FeLV (Feline Leukemia)"],
  },
  {
    type: "Emergency & Antidotes",
    items: ["Epinephrine (Adrenaline)", "Naloxone", "Atipamezole (Antisedan)", "Flumazenil", "Vitamin K1", "Activated Charcoal", "Apomorphine", "Diazepam (seizure)"],
  },
];

export const BUILTIN_MEDICATIONS: string[] = MED_CATALOG.flatMap((c) => c.items);

const BUILTIN_TYPE = new Map<string, string>();
for (const c of MED_CATALOG) for (const m of c.items) BUILTIN_TYPE.set(m.toLowerCase(), c.type);

/* ---------------- Clinic-custom medications (doctor-managed, persisted) ---------------- */
export interface ClinicMed {
  name: string;
  type: string;
}

const keyName = () => `vp_clinic_meds_${getActiveClinicId()}`;

export function getClinicMeds(): ClinicMed[] {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) return JSON.parse(raw) as ClinicMed[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveClinicMeds(list: ClinicMed[]) {
  try {
    localStorage.setItem(keyName(), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Returns true if the medication is already known (built-in or clinic-added). */
export function medicationExists(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (BUILTIN_TYPE.has(n)) return true;
  return getClinicMeds().some((m) => m.name.toLowerCase() === n);
}

/** Adds a medication to the clinic list if not already present. Returns true if added. */
export function addClinicMed(name: string, type = "Other"): boolean {
  const clean = name.trim();
  if (!clean || medicationExists(clean)) return false;
  const list = getClinicMeds();
  list.push({ name: clean, type });
  saveClinicMeds(list);
  return true;
}

export function removeClinicMed(name: string) {
  saveClinicMeds(getClinicMeds().filter((m) => m.name.toLowerCase() !== name.trim().toLowerCase()));
}

/** All medication names (built-in + clinic), de-duplicated, for autocomplete. */
export function allMedicationNames(): string[] {
  const names = [...BUILTIN_MEDICATIONS, ...getClinicMeds().map((m) => m.name)];
  return Array.from(new Set(names));
}

export function medType(name: string): string {
  const n = name.trim().toLowerCase();
  return BUILTIN_TYPE.get(n) ?? getClinicMeds().find((m) => m.name.toLowerCase() === n)?.type ?? "Other";
}

/** Distinct medication types (built-in categories + any custom types). */
export function allMedTypes(): string[] {
  const types = [...MED_CATALOG.map((c) => c.type), ...getClinicMeds().map((m) => m.type)];
  return Array.from(new Set(types));
}

/**
 * What a viewer sees for a medication.
 * Clinic staff always see the exact medication. Clients (owners) see the prescribed name for
 * 7 days, after which only the therapeutic class is shown.
 */
export function medicationDisplay(name: string, prescribedISO: string, isOwner: boolean): string {
  if (!isOwner) return name;
  const days = (Date.now() - new Date(prescribedISO).getTime()) / 86400000;
  if (days <= 7) return name;
  return medType(name);
}
