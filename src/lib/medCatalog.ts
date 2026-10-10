/* ============================================================================
 * كتالوجُ الأدوية المدمج — بياناتٌ لا حالة (كسول؛ لا يستورده الإقلاع).
 *
 * كان يسكن `meds.ts` الذي يستورده `clinicConfig` لأثره الجانبيّ (مُرطِّبُ «أدوية العيادة»)
 * فيُحزَم الكتالوجُ كلُّه مع الإقلاع. «أدويةُ العيادة» صارت «أدويتي» (0229) فذهب المُرطِّب،
 * والكتالوجُ يُقرأ من مكانين: فهرسُ المنتقي (MedPickerData) وصنفُ العرض للمالك (catalogTypeOf ← meds.ts).
 * ==========================================================================*/
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

let typeByName: Map<string, string> | null = null;

/** صنفُ الدواء العلاجيّ كما بالكتالوج (بالاسم الكامل بلا حالة) — وما ليس فيه null. */
export function catalogTypeOf(name: string): string | null {
  if (!typeByName) {
    typeByName = new Map();
    for (const c of MED_CATALOG) for (const m of c.items) typeByName.set(m.toLowerCase(), c.type);
  }
  return typeByName.get(name.trim().toLowerCase()) ?? null;
}
