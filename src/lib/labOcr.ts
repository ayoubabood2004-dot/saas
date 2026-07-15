// ============================================================================
// Lab-image OCR — read a photographed CBC report in the browser (no server, no
// key) and pull out the numeric values so the التحاليل sliders can be pre-filled
// for the doctor to REVIEW. OCR is best-effort: the doctor always confirms.
//
// Uses tesseract.js (loaded lazily, English is enough for the Latin parameter
// abbreviations + digits printed on virtually every analyser slip).
// ============================================================================
import { CBC, type CbcParam } from "./cbc";

/** Analyser slips print the Latin abbreviation (and often a longer name); match
 *  either. Order follows CBC so the first plausible line per parameter wins. */
const SYNONYMS: Record<string, string[]> = {
  wbc: ["WBC", "WBCS", "WHITE BLOOD", "LEUKOCYTE", "LEUCOCYTE", "LEUKOCYTES", "LEUCOCYTES"],
  rbc: ["RBC", "RBCS", "RED BLOOD", "ERYTHROCYTE", "ERYTHROCYTES"],
  hgb: ["HGB", "HB", "HAEMOGLOBIN", "HEMOGLOBIN"],
  hct: ["HCT", "PCV", "HAEMATOCRIT", "HEMATOCRIT"],
  plt: ["PLT", "PLATELETS", "PLATELET", "THROMBOCYTE", "THROMBOCYTES"],
  mcv: ["MCV"],
  neut: ["NEUT", "NEUTROPHILS", "NEUTROPHIL", "NEU", "GRAN", "GRANULOCYTE"],
  lymph: ["LYMPH", "LYMPHOCYTES", "LYMPHOCYTE", "LYM"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Normalise a line so dotted abbreviations (W.B.C) and unicode digits collapse
 *  to plain forms the matchers expect. */
function normLine(line: string): string {
  return line
    .toUpperCase()
    // W.B.C → WBC, H.B → HB
    .replace(/\b([A-Z])\.([A-Z])\.([A-Z])\b/g, "$1$2$3")
    .replace(/\b([A-Z])\.([A-Z])\b/g, "$1$2")
    .replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)));
}

/** Extract the reported value from the text that follows a matched parameter. */
function valueAfter(rest: string, p: CbcParam): number | null {
  let s = rest
    // drop reference ranges like 6.0-17.0 (value is printed before them)
    .replace(/\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?/g, " ")
    // drop unit multipliers like 10^3, 10*6, x10^9, 10³
    .replace(/[xX*]?\s*10\s*[\^*]?\s*[0-9³⁶⁹]/g, " ");
  const acceptsPercent = p.unit === "%";
  // first standalone number, skipping a %-suffixed one unless the unit IS %
  const re = /(\d+(?:[.,]\d+)?)\s*(%?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[2] === "%" && !acceptsPercent) continue;
    let v = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(v)) continue;
    // absolute counts (e.g. PLT 250000) → analyser 10³ scale
    if (v > p.max && v / 1000 >= p.min && v / 1000 <= p.max * 1.2) v = v / 1000;
    // keep it on the slider
    v = Math.min(p.max, Math.max(p.min, v));
    return Math.round(v / p.step) * p.step;
  }
  return null;
}

/** Parse OCR text → { paramId: value } for every CBC parameter we can find. */
export function parseCbcFromText(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = text.split(/\r?\n/).map(normLine).filter(Boolean);
  for (const p of CBC) {
    let found: number | null = null;
    outer:
    for (const syn of SYNONYMS[p.id] ?? [p.abbr]) {
      const re = new RegExp(`\\b${escapeRe(syn)}\\b`);
      // Try EVERY line the synonym appears on — a percentage differential line
      // ("LYM% 35 %") must not shadow the real absolute-value line ("LYM 3.2").
      for (const line of lines) {
        if (!re.test(line)) continue;
        const rest = line.slice(line.search(re) + syn.length);
        const v = valueAfter(rest, p);
        if (v !== null) { found = v; break outer; }
      }
    }
    if (found !== null) out[p.id] = found;
  }
  return out;
}

/** Run OCR on an image (data URL / URL / File) and return the parsed CBC values. */
export async function readLabImage(src: string | File): Promise<{ values: Record<string, number>; text: string }> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(src, "eng");
  const text = data?.text ?? "";
  return { values: parseCbcFromText(text), text };
}
