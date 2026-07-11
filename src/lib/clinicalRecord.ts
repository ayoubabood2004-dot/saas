// ============================================================================
// Structured clinical record — the diagnosis & treatment plan is saved as a
// normal pet note, but its body carries a machine-readable payload so the
// timeline can render it as an organised CARD instead of a wall of text.
//
// Wire format:  <MARK><json>\n<human-readable text>
// Plain renderers (print, Excel, older code) simply strip the first line and
// keep the human text; the rich card reads the JSON. Old notes (no marker)
// stay exactly as they were.
// ============================================================================
import type { Severity } from "@/lib/diagnoses";
import type { CaseOutcome } from "@/lib/clinicalKnowledge";
import type { CbcFlag } from "@/lib/cbc";

export interface ClinicalRecord {
  v: 1;
  focus?: { region: string; structure?: string; latin?: string };
  symptoms?: string[];                                   // symptom ids
  qualifiers?: Record<string, Record<string, string>>;   // symptomId → { qualifierId: chosen option }
  cbc?: { id: string; value: number; flag: CbcFlag }[];
  diagnoses?: { system: string; disease: string; severity: Severity }[];
  redFlags?: { name: string; note: string }[];
  zoonotic?: string[];
  reportable?: string[];
  pathogens?: { name: string; latin: string }[];
  treatment?: { name: string; dose?: string; freq: string; days: number; doses: number; note?: string }[];
  interactions?: { a: string; b: string; severity: "major" | "moderate"; note: string }[];
  notes?: string;                                        // free-text doctor clinical notes
  weightKg?: number;                                     // weight used for dose calculations
  outcome?: CaseOutcome;                                 // legacy — outcome now lives on the visit close
  hasPhoto?: boolean;
}

const MARK = "CLINRX1";

export function encodeClinical(rec: ClinicalRecord, human: string): string {
  return MARK + JSON.stringify(rec) + "\n" + human;
}

/** Split a note body into its structured record (if any) + human-readable text. */
export function parseClinical(text: string | null | undefined): { record: ClinicalRecord | null; text: string } {
  const s = text ?? "";
  if (!s.startsWith(MARK)) return { record: null, text: s };
  const nl = s.indexOf("\n");
  try {
    const record = JSON.parse(s.slice(MARK.length, nl < 0 ? s.length : nl)) as ClinicalRecord;
    return { record, text: nl < 0 ? "" : s.slice(nl + 1) };
  } catch {
    return { record: null, text: s };
  }
}

/** Just the human-readable text — for plain contexts (print / Excel / fallback). */
export function plainClinical(text: string | null | undefined): string {
  const { text: t } = parseClinical(text);
  return t || (text ?? "");
}
