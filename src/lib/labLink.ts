// ============================================================================
// labLink — the UNIVERSAL analyzer message brain. Give it the raw text a lab
// machine emitted (in ANY of the common wire languages) and it returns clean,
// canonical values ready for the المختبر sheet. No device model needed up
// front: analyzers of every brand speak one of only a few standard dialects.
//
//   detectProtocol → hl7 | astm | generic
//   parseMessage   → RawTuple[] {code, value, units, flag, isPercent}
//   normalize      → { values: {canonicalId: number}, percents, unknown[] }
//
// Codes are mapped to our canonical parameter ids through a big built-in
// dictionary PLUS a LEARNABLE per-clinic override — the first time a device
// emits an unrecognised code the doctor maps it once and it's remembered
// forever, so after a few clinics the engine silently understands every
// machine in the field. Everything runs on-device; no lab subscription.
//
// Canonical ids (must match labCatalog.ts):
//   wbc rbc hgb hct mcv mchc plt neut lymph mono eos
//   bun crea phos alt ast alp ggt tbil tp alb glob glu amyl lipa chol
//   na k cl ca t4 usg uph
// ============================================================================

export type Protocol = "hl7" | "astm" | "generic";

export interface RawTuple {
  code: string;        // the analyzer's literal test code, upper-cased
  value: number;
  units?: string;
  flag?: string;       // L / H / LL / HH / N ... as emitted
  isPercent?: boolean; // a differential percentage line, not an absolute count
}

export interface ParsedMessage {
  protocol: Protocol;
  tuples: RawTuple[];
  patientHint?: string; // any patient/sample id the message carried (for matching)
}

/* ============================ Canonical dictionary ============================
 * canonical id → every code an analyzer might print for it (UPPER-CASE, no #/%,
 * spaces collapsed). Percent-differential codes are handled separately below. */
// ملاحظة: القائمة تخلط الأسماء النصية بأكواد LOINC العالمية عمداً. الأجهزة
// الحديثة (Mindray BC، Sysmex، Abbott…) ترسل بـHL7 كوداً رقمياً مثل «6690-2»
// بدل «WBC» — فبلا هذي الأكواد تصل النتيجة ويقف السستم عاجزاً عن فهمها.
const DICT: Record<string, string[]> = {
  wbc:  ["WBC", "WBCS", "WBC#", "WB", "LEUKOCYTE", "LEUKOCYTES", "LEUCOCYTE", "LEUCOCYTES", "WHITE BLOOD CELL", "WHITE BLOOD CELLS", "WHITE BLOOD", "6690-2", "804-5", "26464-8"],
  rbc:  ["RBC", "RBCS", "RBC#", "ERYTHROCYTE", "ERYTHROCYTES", "RED BLOOD CELL", "RED BLOOD CELLS", "RED BLOOD", "789-8", "790-6", "26453-1"],
  hgb:  ["HGB", "HB", "HG", "HGB#", "HAEMOGLOBIN", "HEMOGLOBIN", "718-7", "30313-1", "30350-3"],
  hct:  ["HCT", "PCV", "HCT#", "HAEMATOCRIT", "HEMATOCRIT", "4544-3", "20570-8", "31100-1"],
  mcv:  ["MCV", "787-2", "30428-7"],
  mchc: ["MCHC", "786-4", "28540-3"],
  plt:  ["PLT", "PLT#", "PLATELET", "PLATELETS", "THROMBOCYTE", "THROMBOCYTES", "THR", "777-3", "26515-7"],
  neut: ["NEUT", "NEUT#", "NEU", "NE", "NE#", "GRAN", "GRAN#", "GRA", "GRA#", "GR", "GR#", "GRANULOCYTE", "GRANULOCYTES", "NEUTROPHIL", "NEUTROPHILS", "SEG", "751-8", "26499-4", "753-4"],
  lymph:["LYMPH", "LYM", "LY", "LYM#", "LY#", "LYMPH#", "LYMPHOCYTE", "LYMPHOCYTES", "LYMPHO", "731-0", "26474-7", "732-8"],
  mono: ["MONO", "MON", "MO", "MON#", "MO#", "MONO#", "MID", "MID#", "MXD", "MONOCYTE", "MONOCYTES", "742-7", "26484-6", "743-5"],
  eos:  ["EOS", "EO", "EO#", "EOS#", "EOSINOPHIL", "EOSINOPHILS", "711-2", "26449-9", "712-0"],
  bun:  ["BUN", "UREA", "UREA NITROGEN", "BLOOD UREA", "BLOOD UREA NITROGEN", "BUN/UREA", "UN", "3094-0", "6299-2", "22664-7"],
  crea: ["CREA", "CRE", "CREAT", "CREATININE", "CREATinine", "CR", "2160-0", "38483-4"],
  phos: ["PHOS", "PHOSPHORUS", "PHOSPHATE", "IP", "PHOS(P)", "PO4", "2777-1", "14879-1"],
  alt:  ["ALT", "GPT", "SGPT", "ALAT", "ALT/GPT", "ALT(GPT)", "1742-6", "1743-4"],
  ast:  ["AST", "GOT", "SGOT", "ASAT", "AST/GOT", "AST(GOT)", "1920-8", "30239-8"],
  alp:  ["ALP", "ALKP", "ALKPHOS", "ALK PHOS", "ALK.PHOS", "ALKALINE PHOSPHATASE", "ALPL", "6768-6", "1783-0"],
  ggt:  ["GGT", "GAMMA GT", "GAMMAGT", "Y-GT", "GAMMA-GT", "2324-2"],
  tbil: ["TBIL", "TBIL#", "T BIL", "T.BIL", "TOTAL BILIRUBIN", "BILIRUBIN", "BILIRUBIN TOTAL", "TBILI", "TB", "1975-2", "42719-5"],
  tp:   ["TP", "TOTAL PROTEIN", "T PROTEIN", "T.PROTEIN", "TPROT", "TOT PROTEIN", "2885-2", "2884-5"],
  alb:  ["ALB", "ALBUMIN", "ALBUMINE", "1751-7", "61151-7"],
  glob: ["GLOB", "GLOBULIN", "GLB", "2336-6", "10834-0"],
  glu:  ["GLU", "GLUC", "GLUCOSE", "GLU-", "GLUCOSA", "BG", "BLOOD GLUCOSE", "2345-7", "2339-0", "15074-8"],
  amyl: ["AMYL", "AMY", "AMYLASE", "A-AMYL", "1798-8", "1795-4"],
  lipa: ["LIPA", "LIP", "LIPASE", "3040-3", "24331-1"],
  chol: ["CHOL", "CHOLESTEROL", "TC", "T-CHO", "TCHO", "CHO", "2093-3", "2085-9"],
  na:   ["NA", "NA+", "SODIUM", "NATRIUM", "2951-2", "2947-0"],
  k:    ["K", "K+", "POTASSIUM", "KALIUM", "2823-3", "6298-4"],
  cl:   ["CL", "CL-", "CHLORIDE", "CHLORID", "2075-0", "2069-3"],
  ca:   ["CA", "CA++", "CA2+", "CALCIUM", "T-CA", "TCA", "17861-6", "2000-8"],
  t4:   ["T4", "TT4", "TOTAL T4", "THYROXINE", "TETRAIODOTHYRONINE", "3026-2", "3024-7"],
  usg:  ["USG", "SG", "SP GR", "SP.GR", "SPECIFIC GRAVITY", "5811-5", "2965-2"],
  uph:  ["UPH", "URINE PH", "U-PH", "5803-2", "2756-5"],
};

/** Codes that are DIFFERENTIAL PERCENTAGES (not absolute counts) — routed to
 *  the same canonical id but tagged isPercent so the caller won't store them as
 *  the absolute value. */
const PERCENT_CODES: Record<string, string> = {
  "LYMPH%": "lymph", "LYM%": "lymph", "LY%": "lymph",
  "NEUT%": "neut", "NEU%": "neut", "NE%": "neut", "GRAN%": "neut", "GRA%": "neut", "GR%": "neut", "SEG%": "neut",
  "MONO%": "mono", "MON%": "mono", "MO%": "mono", "MID%": "mono", "MXD%": "mono",
  "EOS%": "eos", "EO%": "eos",
  // أكواد LOINC للنِسَب التفريقية — نفس المعنى بلغة الأجهزة الحديثة.
  "736-9": "lymph", "26478-8": "lymph",
  "770-8": "neut", "23761-0": "neut", "26511-6": "neut",
  "5905-5": "mono", "26485-3": "mono",
  "713-8": "eos", "26450-7": "eos",
};

/** المعايير التي لها صيغتان: عدد مطلق ونسبة مئوية من الكريات البيضاء. */
const DIFFERENTIAL = new Set(["neut", "lymph", "mono", "eos"]);

/** Codes we deliberately ignore (not in our canonical set) — silences noise
 *  like RDW/MCH/MPV/PDW rather than surfacing them as "unknown". */
const IGNORE = new Set([
  "RDW", "RDW-SD", "RDW-CV", "MCH", "MPV", "PDW", "PCT", "P-LCR", "P-LCC", "NRBC", "RET", "IG", "BASO", "BA", "BA#", "BA%", "ATL", "AL",
  // مقابلاتها بأكواد LOINC + حقول ليست فحوصاً أصلاً (عمر المريض مثلاً) —
  // بدونها تظهر للطبيب كـ«أكواد مجهولة» ويُطلب منه تعليمها بلا فائدة.
  "788-0", "21000-5", "30385-9",           // RDW-CV / RDW-SD
  "785-6", "28539-5",                      // MCH
  "32623-1", "776-5",                      // MPV / PDW
  "704-7", "706-2", "26444-0", "30180-4",  // Basophils (abs/%)
  "30525-0", "29463-7", "8302-2",          // العمر / الوزن / الطول — بيانات مريض لا فحوص
  "58410-2", "57021-8", "69742-3",         // عناوين لوحات CBC (لا قيم)
]);

/** Build the reverse lookup once (code → canonical id). */
const CODE_TO_ID: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [id, codes] of Object.entries(DICT)) for (const c of codes) m[normCode(c)] = id;
  return m;
})();

/** Normalise a raw code for matching: upper-case, strip #, collapse spaces/dots. */
function normCode(code: string): string {
  return code.toUpperCase().replace(/[#]/g, "").replace(/[.\s]+/g, " ").trim();
}

/* --------------------------- Learnable per-clinic map --------------------------- */
const LEARN_KEY = (clinicId?: string) => `vp_lablink_map_${clinicId ?? "default"}`;

/** The clinic's own learned code→id overrides (device-specific names). */
export function getLearnedMap(clinicId?: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY(clinicId)) || "{}"); } catch { return {}; }
}
/** Teach the engine that a device's code means a canonical id (remembered forever). */
export function learnCode(code: string, canonicalId: string, clinicId?: string): void {
  const map = getLearnedMap(clinicId);
  map[normCode(code)] = canonicalId;
  try { localStorage.setItem(LEARN_KEY(clinicId), JSON.stringify(map)); } catch { /* quota — non-fatal */ }
}
/** Forget a learned mapping. */
export function unlearnCode(code: string, clinicId?: string): void {
  const map = getLearnedMap(clinicId);
  delete map[normCode(code)];
  try { localStorage.setItem(LEARN_KEY(clinicId), JSON.stringify(map)); } catch { /* ignore */ }
}

/** Resolve a raw code to a canonical id (learned overrides win), or null. */
export function resolveCode(code: string, clinicId?: string): { id: string; isPercent: boolean } | null {
  const raw = code.toUpperCase().trim();
  if (PERCENT_CODES[raw]) return { id: PERCENT_CODES[raw], isPercent: true };
  const n = normCode(code);
  if (IGNORE.has(raw) || IGNORE.has(n)) return null;
  const learned = getLearnedMap(clinicId)[n];
  if (learned) return { id: learned, isPercent: false };
  const built = CODE_TO_ID[n];
  if (built) return { id: built, isPercent: false };
  return null;
}

/* ================================ Protocol detect ================================ */
export function detectProtocol(raw: string): Protocol {
  const t = raw.replace(/\x0b|\x1c/g, "");
  if (/(^|[\r\n])MSH\|/.test(t) || /(^|[\r\n])OBX\|/.test(t)) return "hl7";
  // ASTM: high-level records start with a single upper letter + delimiter (H| P| O| R| L|)
  if (/(^|[\r\n])[HPORLCQ]\|/.test(t) && /(^|[\r\n])R\|/.test(t)) return "astm";
  return "generic";
}

/* ---- numeric helper ---- */
function num(s: string | undefined): number | null {
  if (!s) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (!m) return null;
  const v = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/* -------------------------------- HL7 v2 -------------------------------- */
// OBX|seq|NM|code^name^system|sub|value|units|refrange|flag|...
function parseHl7(raw: string): ParsedMessage {
  const segs = raw.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
  const tuples: RawTuple[] = [];
  let patientHint: string | undefined;
  for (const seg of segs) {
    const f = seg.split("|");
    if (f[0] === "PID") { patientHint = (f[3] || f[2] || "").split("^")[0] || patientHint; continue; }
    if (f[0] === "OBR") { patientHint = patientHint || (f[3] || "").split("^")[0]; continue; }
    if (f[0] !== "OBX") continue;
    const codeField = f[3] || "";            // WBC^White Blood Cells^L
    const code = (codeField.split("^")[0] || codeField.split("^")[1] || "").trim();
    if (!code) continue;
    const value = num(f[5]);
    if (value === null) continue;
    tuples.push({ code, value, units: (f[6] || "").trim() || undefined, flag: (f[8] || "").trim() || undefined, isPercent: /%/.test(f[6] || "") });
  }
  return { protocol: "hl7", tuples, patientHint };
}

/* -------------------------------- ASTM E1394 -------------------------------- */
// R|seq|^^^code^name|value|units|refrange|flag|...   (delimiters declared in H)
function parseAstm(raw: string): ParsedMessage {
  const records = raw.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
  // The H record declares delimiters: e.g. "H|\^&" → field | , repeat \ , component ^ , escape &
  let comp = "^";
  const hrec = records.find((r) => r.startsWith("H|"));
  if (hrec && hrec.length >= 5) { const d = hrec.slice(2); if (d[1]) comp = d[1]; }
  const tuples: RawTuple[] = [];
  let patientHint: string | undefined;
  for (const rec of records) {
    const f = rec.split("|");
    if (f[0] === "P") { patientHint = (f[3] || f[2] || "").split(comp)[0] || patientHint; continue; }
    if (f[0] !== "R") continue;
    // R-3 test id like ^^^WBC^White or ^^^^WBC
    const idField = f[2] || "";
    const parts = idField.split(comp).filter(Boolean);
    const code = (parts[0] || "").trim();
    if (!code) continue;
    const value = num(f[3]);
    if (value === null) continue;
    tuples.push({ code, value, units: (f[4] || "").trim() || undefined, flag: (f[6] || "").trim() || undefined, isPercent: /%/.test(f[4] || "") });
  }
  return { protocol: "astm", tuples, patientHint };
}

/* -------------------------------- Generic -------------------------------- */
// Handles plain analyzer/paper-style lines & CSV: "WBC 12.3 10^3/uL H",
// "WBC: 12.3", "WBC,12.3,10^3/uL,H", "WBC=12.3". One tuple per line.
function parseGeneric(raw: string): ParsedMessage {
  const lines = raw.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
  const tuples: RawTuple[] = [];
  for (const line of lines) {
    // CSV first
    if (line.includes(",") && !/[:=]/.test(line)) {
      const c = line.split(",").map((x) => x.trim());
      const value = num(c[1]);
      if (c[0] && value !== null) { tuples.push({ code: c[0], value, units: c[2] || undefined, flag: c[3] || undefined, isPercent: /%/.test(c[0]) || /%/.test(c[2] || "") }); continue; }
    }
    // key <sep> value units flag   — code is the leading token(s), value the first number
    const m = /^([A-Za-z][A-Za-z0-9%#/.\-\s]*?)[\s:=]+(-?\d+(?:[.,]\d+)?)\s*([^\s]*)?\s*([LHN]{0,2})?\s*$/.exec(line);
    if (m) {
      const code = m[1].trim();
      const value = num(m[2]);
      if (value === null) continue;
      tuples.push({ code, value, units: (m[3] || "").trim() || undefined, flag: (m[4] || "").trim() || undefined, isPercent: /%/.test(code) || /%/.test(m[3] || "") });
    }
  }
  return { protocol: "generic", tuples, patientHint: undefined };
}

/** Detect the wire language and parse into raw tuples. */
export function parseMessage(raw: string): ParsedMessage {
  const p = detectProtocol(raw);
  if (p === "hl7") return parseHl7(raw);
  if (p === "astm") return parseAstm(raw);
  return parseGeneric(raw);
}

/* ================================ Normalization ================================ */
export interface NormalizedReading {
  /** canonical id → absolute numeric value (percents excluded). */
  values: Record<string, number>;
  /** canonical id → differential percentage (kept separately). */
  percents: Record<string, number>;
  /** codes we couldn't map — the doctor teaches these once. */
  unknown: { code: string; value: number; units?: string }[];
  patientHint?: string;
}

/** Per-canonical unit scaling to our catalog units. Analyzers vary wildly here
 *  (PLT in 10^9/L vs 10^3/µL are numerically equal; absolute counts like
 *  250000 need ÷1000). We normalise conservatively and leave the value on the
 *  catalog scale so flagging/ranges stay correct. */
function scaleValue(id: string, value: number, units?: string): number {
  const u = (units || "").toLowerCase();
  // Platelet & WBC/RBC absolute counts printed in cells/µL → our 10³ (or 10⁶) scale.
  if (id === "plt" && value > 2000) return Math.round(value / 1000);
  if ((id === "wbc" || id === "neut" || id === "lymph" || id === "mono" || id === "eos") && value > 1000) return value / 1000;
  if (id === "rbc" && value > 1000) return value / 1e6;
  // HGB sometimes reported in g/L (e.g. 150) rather than g/dL (15).
  if (id === "hgb" && (u.includes("g/l") || value > 30)) return value / 10;
  // Glucose/BUN/etc mmol/L → mg/dL only if the unit clearly says mmol (leave otherwise).
  if (id === "glu" && u.includes("mmol")) return Math.round(value * 18);
  if (id === "bun" && u.includes("mmol")) return Math.round(value * 2.8);
  if (id === "crea" && u.includes("umol")) return Math.round((value / 88.4) * 100) / 100;
  return value;
}

/** Turn parsed tuples into canonical values, applying the learnable dictionary. */
export function normalize(msg: ParsedMessage, clinicId?: string): NormalizedReading {
  const values: Record<string, number> = {};
  const percents: Record<string, number> = {};
  const unknown: { code: string; value: number; units?: string }[] = [];
  for (const t of msg.tuples) {
    const r = resolveCode(t.code, clinicId);
    if (!r) {
      // ignore known-noise codes silently; surface genuinely unknown ones
      const n = normCode(t.code);
      if (!IGNORE.has(n) && !/%$/.test(t.code)) unknown.push({ code: t.code.trim(), value: t.value, units: t.units });
      continue;
    }
    // «نسبة» لها معنى فقط بالعد التفريقي للكريات البيضاء (مطلق مقابل %).
    // أما HCT فوحدته % أصلاً وهو قيمة مطلقة — لولا هذا الشرط لسقط بخانة
    // النِسَب واختفى من النتيجة رغم وصوله سليماً من الجهاز.
    if ((r.isPercent || t.isPercent) && DIFFERENTIAL.has(r.id)) {
      if (percents[r.id] === undefined) percents[r.id] = t.value;
      continue;
    }
    if (values[r.id] === undefined) values[r.id] = scaleValue(r.id, t.value, t.units);
  }
  return { values, percents, unknown, patientHint: msg.patientHint };
}

/** One-shot: raw analyzer text → canonical reading. */
export function readAnalyzerMessage(raw: string, clinicId?: string): NormalizedReading & { protocol: Protocol; count: number } {
  const msg = parseMessage(raw);
  const norm = normalize(msg, clinicId);
  return { ...norm, protocol: msg.protocol, count: Object.keys(norm.values).length };
}
