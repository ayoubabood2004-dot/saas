// Small sample of the ICD-Vet style diagnosis catalogue for the Assessment typeahead.
export interface DiagnosisCode {
  code: string;
  name: string;
}

export const ICD_VET: DiagnosisCode[] = [
  { code: "GI-01", name: "Acute gastroenteritis" },
  { code: "GI-02", name: "Parvovirus enteritis" },
  { code: "GI-05", name: "Foreign body obstruction" },
  { code: "MS-01", name: "Hip dysplasia" },
  { code: "MS-02", name: "Cranial cruciate ligament rupture" },
  { code: "MS-04", name: "Osteoarthritis" },
  { code: "MS-07", name: "Long bone fracture" },
  { code: "DM-01", name: "Atopic dermatitis" },
  { code: "DM-03", name: "Flea allergy dermatitis" },
  { code: "DM-05", name: "Otitis externa" },
  { code: "RS-01", name: "Kennel cough (infectious tracheobronchitis)" },
  { code: "RS-03", name: "Feline upper respiratory infection" },
  { code: "CV-02", name: "Dilated cardiomyopathy" },
  { code: "CV-04", name: "Congestive heart failure" },
  { code: "UG-01", name: "Feline lower urinary tract disease (FLUTD)" },
  { code: "UG-03", name: "Chronic kidney disease" },
  { code: "EN-02", name: "Diabetes mellitus" },
  { code: "EN-04", name: "Hyperthyroidism" },
  { code: "PA-01", name: "Tick-borne blood parasites (Babesia/Ehrlichia)" },
  { code: "PA-03", name: "Intestinal helminthiasis" },
  { code: "WN-00", name: "Healthy — routine wellness" },
];

export function searchDiagnoses(query: string): DiagnosisCode[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return ICD_VET.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)).slice(0, 8);
}
