// A broad starter list of common veterinary diagnoses across species, used as the
// suggestion source for the disease combobox. The doctor can always type a custom
// diagnosis that isn't here — this is just an autocomplete convenience, not a
// closed set. Names use the common clinical term (with a scientific/alt hint where
// helpful) so search matches what a vet would type.
export const COMMON_DISEASES: string[] = [
  // ── Canine ──
  "Canine Parvovirus (Parvo)",
  "Canine Distemper",
  "Infectious Canine Hepatitis (Adenovirus)",
  "Kennel Cough (Bordetella)",
  "Canine Influenza",
  "Leptospirosis",
  "Ehrlichiosis",
  "Babesiosis",
  "Heartworm Disease (Dirofilariasis)",
  "Gastric Dilatation-Volvulus (Bloat)",
  "Pyometra",
  "Hip Dysplasia",
  "Parvoviral Enteritis",

  // ── Feline ──
  "Feline Panleukopenia",
  "Feline Leukemia Virus (FeLV)",
  "Feline Immunodeficiency Virus (FIV)",
  "Feline Infectious Peritonitis (FIP)",
  "Feline Calicivirus",
  "Feline Herpesvirus (Rhinotracheitis)",
  "Feline Lower Urinary Tract Disease (FLUTD)",
  "Chronic Kidney Disease",
  "Hyperthyroidism",

  // ── Shared / general medicine ──
  "Rabies",
  "Ringworm (Dermatophytosis)",
  "Mastitis",
  "Conjunctivitis",
  "Otitis Externa (Ear infection)",
  "Gastroenteritis",
  "Pneumonia",
  "Bronchitis",
  "Dermatitis",
  "Atopic Dermatitis (Allergy)",
  "Flea Allergy Dermatitis",
  "Sarcoptic Mange",
  "Demodectic Mange",
  "Ear Mites",
  "Anemia",
  "Diabetes Mellitus",
  "Osteoarthritis",
  "Periodontal (Dental) Disease",
  "Urinary Tract Infection (UTI)",
  "Bladder Stones (Urolithiasis)",
  "Abscess",
  "Wound / Laceration",
  "Fracture",
  "Foreign Body Ingestion",
  "Poisoning / Toxicity",
  "Heat Stroke",
  "Allergic Reaction",
  "Obesity",
  "Malnutrition",
  "Dehydration",
  "Intestinal Parasites (Worms)",
  "Coccidiosis",
  "Giardiasis",
  "Tick Infestation",
  "Flea Infestation",

  // ── Equine ──
  "Equine Influenza",
  "Tetanus",
  "Strangles (Streptococcus equi)",
  "Colic",
  "Laminitis",
  "Equine Herpesvirus",
  "West Nile Virus",

  // ── Bovine / livestock ──
  "Foot-and-Mouth Disease",
  "Bovine Respiratory Disease",
  "Lumpy Skin Disease",
  "Brucellosis",
  "Blackleg",
  "Milk Fever (Hypocalcemia)",
  "Ketosis",
  "Bloat (Ruminal Tympany)",

  // ── Avian ──
  "Newcastle Disease",
  "Avian Influenza",
  "Avian Pox",

  // ── Zoonotic / other ──
  "Toxoplasmosis",
  "Leishmaniasis",
];
