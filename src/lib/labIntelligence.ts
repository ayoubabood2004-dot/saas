// ============================================================================
// قارئ النتائج الذكي — a local clinical-pathology interpretation engine.
//
// Reads a whole panel (and the patient's prior panel) the way IDEXX DecisionIQ
// and human-lab QC systems do, but 100% on-device — no server, no key, no lab
// subscription. Everything here is established veterinary clinical-pathology
// knowledge encoded as deterministic rules, so the doctor can trust WHY every
// note appears. Final judgement always stays with the veterinarian.
//
// Four layers, mirroring the world's best systems:
//   1. Critical values  — life-threatening results surfaced FIRST (ARUP/CLSI).
//   2. Delta check      — a value that jumped implausibly vs last time (sample
//                          error, or a real fast change to act on).
//   3. Pattern reading  — meaning from GROUPS of values, not single numbers
//                          (stress vs inflammatory leukogram, regenerative vs
//                          non-regenerative anemia, renal / hepatic / pancreatic
//                          / electrolyte pictures) → interpretation + next step.
//   4. Severity index   — one glanceable score (طبيعي / انتبه / حرج).
//
// Refs (encoded, not fetched): Clinician's Brief leukogram patterns; stress
// leukogram (cortisol) physiology; regenerative vs non-regen anemia workups;
// ARUP delta-check practice; CLSI EP33; IDEXX DecisionIQ interpretation model.
// ============================================================================
import type { LabResult, LabValue, Species } from "@/types";

export type Tone = "critical" | "warn" | "info" | "good";

export interface Insight {
  id: string;
  tone: Tone;
  title: string;       // what the system sees
  detail?: string;     // the next-step consideration (DecisionIQ-style)
  tags?: string[];     // the abbreviations this insight is built from
}

/* --------------------------- 1. Critical values ---------------------------
 * Absolute red lines — a value here means "act now", independent of trend.
 * Bands are deliberately conservative small-animal emergency thresholds. */
interface CriticalRule { id: string; low?: number; high?: number; msg: string; species?: Species }
const CRITICAL: Record<string, CriticalRule[]> = {
  k:    [{ id: "k-hi", high: 7.5, msg: "بوتاسيوم قاتل — خطر توقّف القلب. عالج فوراً (كالسيوم/سوائل/أنسولين-غلوكوز)." },
         { id: "k-lo", low: 2.5, msg: "بوتاسيوم منخفض جداً — ضعف عضلي وخطر لانظمية. عوّض بحذر." }],
  glu:  [{ id: "glu-lo", low: 40, msg: "سكر منهار (هبوط حاد) — خطر تشنّج وغيبوبة. أعطِ غلوكوز فوراً." },
         { id: "glu-hi", high: 400, msg: "سكر مرتفع جداً — احتمال حماض كيتوني سكري (DKA). افحص الكيتونات." }],
  hct:  [{ id: "hct-lo", low: 15, msg: "هيماتوكريت منهار — فقر دم شديد يهدد الحياة. فكّر بنقل دم." }],
  ca:   [{ id: "ca-hi", high: 16, msg: "كالسيوم مرتفع جداً — خطر على القلب والكلى. ابحث عن السبب فوراً." },
         { id: "ca-lo", low: 6, msg: "كالسيوم منخفض جداً — خطر تكزّز وتشنّج." }],
  plt:  [{ id: "plt-lo", low: 30, msg: "صفيحات منهارة — خطر نزف تلقائي. تجنّب أي إجراء جارح." }],
  crea: [{ id: "crea-hi", high: 5, msg: "كرياتينين مرتفع جداً — فشل كلوي حاد/شديد. سوائل وريدية عاجلة." }],
  na:   [{ id: "na-hi", high: 175, msg: "صوديوم مرتفع جداً — جفاف شديد/عصبي. صحّح ببطء." },
         { id: "na-lo", low: 130, msg: "صوديوم منخفض جداً — خطر وذمة دماغية عند التصحيح السريع." }],
};

function criticalInsights(values: LabValue[]): Insight[] {
  const out: Insight[] = [];
  for (const v of values) {
    if (v.value === undefined) continue;
    for (const r of CRITICAL[v.id] ?? []) {
      if (r.low !== undefined && v.value < r.low) out.push({ id: r.id, tone: "critical", title: `⚠ ${v.abbr ?? v.label}: ${r.msg}`, tags: [v.id] });
      if (r.high !== undefined && v.value > r.high) out.push({ id: r.id, tone: "critical", title: `⚠ ${v.abbr ?? v.label}: ${r.msg}`, tags: [v.id] });
    }
  }
  return out;
}

/* ----------------------------- 2. Delta check -----------------------------
 * Compare each value to the SAME parameter in the previous result. A jump past
 * a reference-change threshold is flagged: could be a sample/handling error, or
 * a real fast change worth chasing. Percent-based, with per-analyte floors so
 * naturally-swingy analytes (enzymes) don't over-fire. */
const DELTA_PCT: Record<string, number> = { // % change that trips the check
  hct: 25, hgb: 25, wbc: 60, plt: 60, neut: 70, lymph: 70,
  bun: 60, crea: 40, phos: 50, glu: 60, k: 25, na: 8, cl: 12, ca: 20,
  alt: 120, ast: 120, alp: 120, tbil: 100, tp: 20, alb: 25, t4: 60,
};
const DELTA_DEFAULT = 60;

function deltaInsights(values: LabValue[], prior?: LabResult | null): Insight[] {
  if (!prior?.values?.length) return [];
  const prev = new Map(prior.values.filter((v) => v.value !== undefined).map((v) => [v.id, v.value!]));
  const out: Insight[] = [];
  for (const v of values) {
    if (v.value === undefined) continue;
    const p = prev.get(v.id);
    if (p === undefined || p === 0) continue;
    const pct = Math.abs((v.value - p) / p) * 100;
    const limit = DELTA_PCT[v.id] ?? DELTA_DEFAULT;
    if (pct >= limit) {
      const dir = v.value > p ? "ارتفع" : "انخفض";
      out.push({
        id: `delta-${v.id}`, tone: "warn",
        title: `⚡ ${v.abbr ?? v.label} ${dir} بشكل حاد عن آخر تحليل (${fmt(p)} ← ${fmt(v.value)})`,
        detail: "تغيّر كبير خلال فترة قصيرة — تأكّد أن العينة سليمة (بلا تجلّط/انحلال)، وإن صحّ فهو تحوّل سريع يستحق المتابعة العاجلة.",
        tags: [v.id],
      });
    }
  }
  return out;
}

/* --------------------------- 3. Pattern reading ---------------------------
 * The heart of DecisionIQ: meaning from combinations. Each rule needs its
 * inputs present (missing value ⇒ rule silently skips) and reads BOTH numbers
 * and the 5-level qualitative flags, so it works even on verdict-only entry. */
type Dir = "low" | "high" | "normal";
const dirOf = (v?: LabValue): Dir | undefined => {
  if (!v) return undefined;
  if (v.flag === "very_low" || v.flag === "low") return "low";
  if (v.flag === "very_high" || v.flag === "high") return "high";
  return "normal";
};

function patternInsights(values: LabValue[], species?: Species): Insight[] {
  const by = new Map(values.map((v) => [v.id, v]));
  const d = (id: string) => dirOf(by.get(id));
  const has = (id: string) => by.has(id);
  const out: Insight[] = [];

  // ---- Leukogram: stress (cortisol) vs inflammatory ----
  // Stress/steroid: neutrophilia + lymphopenia + eosinopenia (± monocytosis dog).
  if (d("neut") === "high" && d("lymph") === "low" && (d("eos") === "low" || !has("eos"))) {
    out.push({
      id: "stress-leukogram", tone: "info",
      title: "🧠 نمط إجهاد (كورتيزول): عدلات↑ مع لمفاويات↓" + (d("eos") === "low" ? " وحمضات↓" : ""),
      detail: "غالباً استجابة توتر/ستيرويد وليس التهاباً بالضرورة — لا تُبالغ بتفسيره كعدوى. أعد التقييم بعد زوال التوتر إن أمكن.",
      tags: ["neut", "lymph", "eos"],
    });
  }
  // Inflammatory: neutrophilia + monocytosis (+ often left shift, not modeled).
  else if (d("neut") === "high" && d("mono") === "high") {
    out.push({
      id: "inflammatory-leukogram", tone: "warn",
      title: "🧠 نمط التهابي: عدلات↑ ووحيدات↑",
      detail: "يوحي بالتهاب/عدوى نشطة. ابحث عن البؤرة سريرياً؛ فكّر ببروتين طور حاد أو زرع إن استمر.",
      tags: ["neut", "mono"],
    });
  }
  // Marked leukocytosis alone.
  else if (d("wbc") === "high" && (by.get("wbc")?.flag === "very_high")) {
    out.push({ id: "leukocytosis", tone: "warn", title: "🧠 ارتفاع شديد بالكريات البيضاء", detail: "التهاب/عدوى شديدة أو استجابة لوكيميّة — يستحق فحصاً معمقاً.", tags: ["wbc"] });
  }

  // ---- Anemia: regenerative vs non-regenerative ----
  if (d("hct") === "low" || d("hgb") === "low") {
    const mcvHi = d("mcv") === "high";
    const mcvLo = d("mcv") === "low";
    if (mcvHi) {
      out.push({ id: "anemia-regen", tone: "warn", title: "🩸 فقر دم مع MCV↑ (متجدّد غالباً)", detail: "يوافق نزفاً أو انحلالاً — ابحث عن مصدر نزيف/طفيليات دم. أكّد بعدّ الشبكيات (reticulocytes) إن توفّر.", tags: ["hct", "mcv"] });
    } else if (mcvLo) {
      out.push({ id: "anemia-microcytic", tone: "warn", title: "🩸 فقر دم مع MCV↓ (صغير الكريات)", detail: "كلاسيكياً نقص حديد/نزف مزمن (أو خلل بورتوسستمي في بعض السلالات). قيّم الحديد ومصدر النزف المزمن.", tags: ["hct", "mcv"] });
    } else {
      // Non-regenerative pointer when renal picture co-exists.
      if (d("crea") === "high" || d("bun") === "high") {
        out.push({ id: "anemia-ckd", tone: "warn", title: "🩸 فقر دم غير متجدّد مع مؤشرات كلوية", detail: "نمط شائع بمرض الكلى المزمن (نقص الإريثروبويتين). اربطه باللوحة الكلوية أدناه.", tags: ["hct", "crea"] });
      } else {
        out.push({ id: "anemia-nonregen", tone: "info", title: "🩸 فقر دم — صنّف تجدّده", detail: "MCV طبيعي — قد يكون غير متجدّد (مرض مزمن/غدد صم/نخاع). عدّ الشبكيات يحسم.", tags: ["hct"] });
      }
    }
  }

  // ---- Renal picture ----
  const renalHits = [d("bun") === "high", d("crea") === "high", d("phos") === "high"].filter(Boolean).length;
  if (renalHits >= 2) {
    out.push({
      id: "renal-pattern", tone: "warn",
      title: "💧 نمط كلوي: " + [d("bun") === "high" && "BUN↑", d("crea") === "high" && "كرياتينين↑", d("phos") === "high" && "فسفور↑"].filter(Boolean).join(" + "),
      detail: "يوحي بقصور كلوي (آزوتيميا). فرّق قبل/بعد كلوي بالكثافة النوعية للبول (USG)؛ قيّم الترطيب والضغط. تابع الكرياتينين لتصنيف المرحلة.",
      tags: ["bun", "crea", "phos"],
    });
  } else if (d("crea") === "high" && d("bun") !== "high") {
    out.push({ id: "crea-solo", tone: "info", title: "💧 كرياتينين↑ منفرد", detail: "قد يسبق الآزوتيميا الكاملة — أعد الفحص وقيّم الكثافة النوعية للبول.", tags: ["crea"] });
  }

  // ---- Hepatic picture ----
  const hepHits = [d("alt") === "high", d("ast") === "high", d("alp") === "high", d("ggt") === "high"].filter(Boolean).length;
  if (hepHits >= 2 || (hepHits >= 1 && d("tbil") === "high")) {
    out.push({
      id: "hepatic-pattern", tone: "warn",
      title: "🟠 نمط كبدي: " + [d("alt") === "high" && "ALT↑", d("ast") === "high" && "AST↑", d("alp") === "high" && "ALP↑", d("ggt") === "high" && "GGT↑", d("tbil") === "high" && "بيليروبين↑"].filter(Boolean).join(" + "),
      detail: (d("alp") === "high" && d("alt") !== "high")
        ? "غلبة ALP/GGT تميل لركود صفراوي — قيّم القنوات الصفراوية والغدد. صوّر البطن إن استمر."
        : "ارتفاع إنزيمات خلوية كبدية — قيّم السبب (سموم/التهاب/دواء)؛ أحماض صفراوية لوظيفة الكبد إن لزم.",
      tags: ["alt", "ast", "alp", "ggt", "tbil"],
    });
  }

  // ---- Pancreatic pointer ----
  if (d("amyl") === "high" && d("lipa") === "high") {
    out.push({ id: "pancreatic-pattern", tone: "info", title: "🧪 أميليز↑ ولايبيز↑", detail: "قد يوحي بالتهاب بنكرياس — أكّد بفحص أنسب (cPL/fPL) وبالصورة السريرية؛ الإنزيمات وحدها غير حاسمة.", tags: ["amyl", "lipa"] });
  }

  // ---- Protein pattern ----
  if (d("tp") === "high" && d("glob") === "high" && d("alb") !== "high") {
    out.push({ id: "hyperglob", tone: "info", title: "🔬 بروتين↑ بسبب الغلوبيولين", detail: "يوحي بالتهاب مزمن/عدوى/مناعي (أحياناً FIP بالقطط). قيّم نسبة ألبومين/غلوبيولين.", tags: ["tp", "glob", "alb"] });
  }
  if (d("alb") === "low" && d("glob") === "low") {
    out.push({ id: "panhypo", tone: "warn", title: "🔬 هبوط ألبومين وغلوبيولين معاً", detail: "فقد بروتين (نزف/اعتلال معوي/كلوي) — قيّم البراز والبول والبطن.", tags: ["alb", "glob"] });
  } else if (d("alb") === "low") {
    out.push({ id: "hypoalb", tone: "info", title: "🔬 ألبومين↓", detail: "قد يعكس مرض كبد/فقد كلوي-معوي/التهاباً. اربطه بباقي اللوحة.", tags: ["alb"] });
  }

  // ---- Electrolyte: Na/K ratio (Addisonian pointer) ----
  const na = by.get("na")?.value, k = by.get("k")?.value;
  if (na !== undefined && k !== undefined && k > 0) {
    const ratio = na / k;
    if (ratio < 27) out.push({ id: "na-k-ratio", tone: "warn", title: `⚡ نسبة صوديوم/بوتاسيوم منخفضة (${ratio.toFixed(0)})`, detail: "نسبة <27 تثير الشك بقصور الكظر (أديسون) — فكّر باختبار ACTH التحفيزي، خاصة مع خمول وبطء قلب.", tags: ["na", "k"] });
  }

  // ---- Glucose ----
  if (d("glu") === "high" && by.get("glu")?.flag === "very_high") {
    out.push({ id: "hyperglycemia", tone: "warn", title: "🍬 سكر مرتفع بوضوح", detail: species === "cat" ? "بالقطط قد يكون توتراً عابراً — أكّد بالفركتوزامين قبل تشخيص السكري." : "قيّم السكري (فركتوزامين + سكر البول).", tags: ["glu"] });
  }

  return out;
}

/* ----------------------------- 4. Severity index -----------------------------
 * One glanceable number. Weighs how far each value sits from normal (5-level
 * flag) plus any critical hits — so the doctor knows in a second how sick. */
export type Severity = "normal" | "attention" | "critical";
const FLAG_WEIGHT: Record<LabValue["flag"], number> = { normal: 0, low: 1, high: 1, very_low: 2, very_high: 2 };

export function severityOf(values: LabValue[], criticalCount: number): { level: Severity; score: number; abnormal: number } {
  let score = 0, abnormal = 0;
  for (const v of values) { const w = FLAG_WEIGHT[v.flag]; score += w; if (w > 0) abnormal++; }
  score += criticalCount * 5;
  const level: Severity = criticalCount > 0 || score >= 8 ? "critical" : score >= 3 ? "attention" : "normal";
  return { level, score, abnormal };
}

/* --------------------------------- Public --------------------------------- */
export interface Interpretation {
  insights: Insight[];        // ordered: critical → warn → info
  severity: { level: Severity; score: number; abnormal: number };
  critical: Insight[];
}

/** Read one numeric result in the context of the patient's prior one. */
export function interpretResult(result: LabResult, prior?: LabResult | null, species?: Species): Interpretation {
  const values = (result.values ?? []).filter(Boolean);
  const critical = criticalInsights(values);
  const delta = deltaInsights(values, prior);
  const patterns = patternInsights(values, species);
  const order: Record<Tone, number> = { critical: 0, warn: 1, info: 2, good: 3 };
  const insights = [...critical, ...delta, ...patterns].sort((a, b) => order[a.tone] - order[b.tone]);
  const severity = severityOf(values, critical.length);
  return { insights, severity, critical };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1));
