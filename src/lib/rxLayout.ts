/* ============================================================================
 * راجيتةُ العيادة (0261) — شكلُ التصميم، وقيمُه الافتراضية، وتنظيفُه.
 *
 * وحدةٌ صِرفة (بلا React ولا repo ولا نصوصٍ عربية): تقرؤها شاشةُ الراجيتة ومصمِّمُها وبانيها (rxPrint) والمرآةُ
 * التجريبية والفحوص. والتصميمُ يصل من القاعدة كما كتبته أيُّ نسخة — أحدثُ أو أقدم — فكلُّ قراءةٍ تمرّ من
 * `cleanRxPad`: قيمةٌ غريبة ترجع لافتراضها، ورقمٌ يُحصر بمداه، ونصٌّ يُقصّ بطوله؛ فلا يُسقط تصميمٌ مكسورٌ طباعةً.
 *
 * المواضعُ نسبٌ مئوية من الصفحة (لا مليمترات): الصفحةُ نفسُها تُطبع A5 أو A4 والخاناتُ تبقى على خطوطها.
 * ========================================================================= */

export type RxPaperSize = "a5" | "a4";
export type RxMode = "template" | "image";
export type RxLang = "en" | "ar";
/** علامةُ النوع على الراجيتة (Canine / Feline / Exotic) — "" = بلا علامة (حصان، بقرة…). */
export type RxKind = "canine" | "feline" | "exotic" | "";
export type RxFont = "ruqaa" | "naskh" | "kufi";
export type RxSlotKey = "date" | "name" | "age" | "owner" | "weight" | "doctor";
export type RxTickKey = "canine" | "feline" | "exotic";

/** خانةٌ نصّية فوق صورة الراجيتة: الزاويةُ (x، y أعلى السطر) والعرض — كلُّها % من الصفحة. */
export interface RxSlot { x: number; y: number; w: number; on: boolean }
export interface RxBox { x: number; y: number; w: number; h: number }
export interface RxPoint { x: number; y: number; on: boolean }
export interface RxDoctor { name: string; lines: string }
export interface RxWatermark { src: "logo" | "emblem" | "none"; size: number; opacity: number; y: number; gray: boolean }

export interface RxPadConfig {
  v: 1;
  mode: RxMode;
  paper: RxPaperSize;
  /** لغةُ عناوين الورقة (Date، Patient's name…) — لا لغةُ الواجهة. */
  lang: RxLang;
  /** لونُ الطباعة (العناوين والخطوط): الورقةُ المطبوعة بلونٍ واحد كما تطبعها المطبعة. */
  accent: string;
  /** خطُّ اسم العيادة بالعربية: رقعة (لافتاتُ العراق وخطُّ اليد) أو نسخ أو كوفي. */
  font: RxFont;
  title: string;
  subtitle: string;
  showLogo: boolean;
  logoSide: "right" | "left";
  emblemPath: string | null;
  doctors: RxDoctor[];
  address: string;
  phones: string[];
  hours: "auto" | "custom" | "off";
  hoursText: string;
  socials: boolean;
  owner: boolean;
  weight: boolean;
  signature: boolean;
  wm: RxWatermark;
  /* ── صورةُ راجيتة العيادة خلفيةً ── */
  bgPath: string | null;
  bgFit: "fill" | "contain";
  /** true: تُطبع الصورةُ (ورقٌ أبيض) · false: لا تُطبع (الطباعةُ فوق الراجيتة المطبوعة نفسِها). */
  bgPrint: boolean;
  fontPt: number;
  slots: Record<RxSlotKey, RxSlot>;
  ticks: Record<RxTickKey, RxPoint>;
  body: RxBox;
  /** معايرةُ الطابعة بالمليمتر — تُطبَّق بالطباعة فوق الراجيتة المطبوعة وحدها. */
  nudge: { x: number; y: number };
}

export const RX_SLOT_KEYS: readonly RxSlotKey[] = ["date", "name", "age", "owner", "weight", "doctor"];
export const RX_TICK_KEYS: readonly RxTickKey[] = ["canine", "feline", "exotic"];
export const RX_PAPER: Record<RxPaperSize, { w: number; h: number }> = { a5: { w: 148, h: 210 }, a4: { w: 210, h: 297 } };
/** ألوانُ مطابع: حبرٌ واحدٌ غامق يُقرأ أبيضَ وأسودَ إن صُوّرت الورقة. الأوّلُ الافتراضيّ. */
export const RX_ACCENTS = ["#1f5f55", "#1e3a6e", "#2d3340", "#0f6e7a", "#6b2737", "#4b2e6b"] as const;
export const RX_LIMITS = { doctors: 4, phones: 3, body: 8000, title: 60, subtitle: 80, address: 160, hoursText: 80, phone: 24, docName: 60, docLines: 120 } as const;

export const RX_DEFAULT: RxPadConfig = {
  v: 1,
  mode: "template",
  paper: "a5",
  lang: "en",
  accent: RX_ACCENTS[0],
  font: "ruqaa",
  title: "",
  subtitle: "",
  showLogo: true,
  logoSide: "right",
  emblemPath: null,
  doctors: [],
  address: "",
  phones: [],
  hours: "auto",
  hoursText: "",
  socials: true,
  owner: true,
  weight: true,
  signature: true,
  wm: { src: "logo", size: 55, opacity: 8, y: 58, gray: true },
  bgPath: null,
  bgFit: "fill",
  bgPrint: true,
  fontPt: 12,
  slots: {
    date: { x: 62, y: 23, w: 30, on: true },
    name: { x: 8, y: 27.5, w: 48, on: true },
    age: { x: 62, y: 27.5, w: 30, on: true },
    owner: { x: 8, y: 32, w: 48, on: false },
    weight: { x: 62, y: 32, w: 30, on: false },
    doctor: { x: 56, y: 91, w: 36, on: false },
  },
  ticks: { canine: { x: 10, y: 23, on: true }, feline: { x: 24, y: 23, on: true }, exotic: { x: 38, y: 23, on: true } },
  body: { x: 8, y: 38, w: 84, h: 48 },
  nudge: { x: 0, y: 0 },
};

/* ── التنظيف ─────────────────────────────────────────────────────────────── */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, dflt: number, step = 0.1): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  const c = Math.min(max, Math.max(min, n));
  return Number((Math.round(c / step) * step).toFixed(2)) || 0;
};
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);
/** نصٌّ بسطرٍ واحد: محارفُ التحكّم والمسافاتُ المكرّرة تُطوى، ويُقصّ بطوله. */
export const cleanLine = (v: unknown, max: number): string =>
  (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** نصٌّ بأسطر (درجاتُ الدكتور): سطران على الأكثر، كلٌّ منظَّف. */
const cleanLines = (v: unknown, max: number, lines = 2): string =>
  (typeof v === "string" ? v : "").split(/\r?\n/).map((l) => cleanLine(l, max)).filter(Boolean).slice(0, lines).join("\n").slice(0, max);
const pick = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T => (allowed.includes(v as T) ? (v as T) : dflt);

/** مسارُ صورةٍ بالدلو (`<عيادة>/rx-…png`) — أو `data:image/…` بالتجريبيّ وحده (لا دلوَ هناك). */
export function cleanImagePath(v: unknown, allowData: boolean): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^data:/i.test(s)) return allowData && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(s) ? s : null;
  return s.length <= 300 && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(s) && !s.includes("..") ? s : null;
}

const cleanSlot = (v: unknown, d: RxSlot): RxSlot => {
  const o = isObj(v) ? v : {};
  const x = num(o.x, 0, 95, d.x);
  return { x, y: num(o.y, 0, 98, d.y), w: num(o.w, 5, Math.max(5, 100 - x), Math.min(d.w, 100 - x)), on: bool(o.on, d.on) };
};
const cleanPoint = (v: unknown, d: RxPoint): RxPoint => {
  const o = isObj(v) ? v : {};
  return { x: num(o.x, 0, 98, d.x), y: num(o.y, 0, 98, d.y), on: bool(o.on, d.on) };
};

/**
 * التصميمُ كما تقرؤه كلُّ شاشة. `allowData`: التجريبيّ وحده (صورُه `data:` بلا دلو) — بالسحابة القاعدةُ ترفضها
 * أصلاً (`_rx_pad_ok`)، والتنظيفُ يسقطها إن وصلت فلا يُرسَل حفظٌ ترفضه.
 */
export function cleanRxPad(raw: unknown, opts: { allowData?: boolean } = {}): RxPadConfig {
  const o = isObj(raw) ? raw : {};
  const D = RX_DEFAULT;
  const allowData = !!opts.allowData;
  const wm = isObj(o.wm) ? o.wm : {};
  const slots = isObj(o.slots) ? o.slots : {};
  const ticks = isObj(o.ticks) ? o.ticks : {};
  const body = isObj(o.body) ? o.body : {};
  const nudge = isObj(o.nudge) ? o.nudge : {};
  const bx = num(body.x, 0, 90, D.body.x);
  const by = num(body.y, 0, 90, D.body.y);
  const doctors = (Array.isArray(o.doctors) ? o.doctors : [])
    .filter(isObj)
    .map((d) => ({ name: cleanLine(d.name, RX_LIMITS.docName), lines: cleanLines(d.lines, RX_LIMITS.docLines) }))
    .filter((d) => d.name || d.lines)
    .slice(0, RX_LIMITS.doctors);
  const phones = (Array.isArray(o.phones) ? o.phones : [])
    .map((p) => cleanLine(p, RX_LIMITS.phone))
    .filter(Boolean)
    .slice(0, RX_LIMITS.phones);
  const accent = typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent.toLowerCase() : D.accent;
  return {
    v: 1,
    mode: pick(o.mode, ["template", "image"] as const, D.mode),
    paper: pick(o.paper, ["a5", "a4"] as const, D.paper),
    lang: pick(o.lang, ["en", "ar"] as const, D.lang),
    accent,
    font: pick(o.font, ["ruqaa", "naskh", "kufi"] as const, D.font),
    title: cleanLine(o.title, RX_LIMITS.title),
    subtitle: cleanLine(o.subtitle, RX_LIMITS.subtitle),
    showLogo: bool(o.showLogo, D.showLogo),
    logoSide: pick(o.logoSide, ["right", "left"] as const, D.logoSide),
    emblemPath: cleanImagePath(o.emblemPath, allowData),
    doctors,
    address: cleanLine(o.address, RX_LIMITS.address),
    phones,
    hours: pick(o.hours, ["auto", "custom", "off"] as const, D.hours),
    hoursText: cleanLine(o.hoursText, RX_LIMITS.hoursText),
    socials: bool(o.socials, D.socials),
    owner: bool(o.owner, D.owner),
    weight: bool(o.weight, D.weight),
    signature: bool(o.signature, D.signature),
    wm: {
      src: pick(wm.src, ["logo", "emblem", "none"] as const, D.wm.src),
      size: num(wm.size, 15, 95, D.wm.size, 1),
      opacity: num(wm.opacity, 2, 30, D.wm.opacity, 1),
      y: num(wm.y, 15, 85, D.wm.y, 1),
      gray: bool(wm.gray, D.wm.gray),
    },
    bgPath: cleanImagePath(o.bgPath, allowData),
    bgFit: pick(o.bgFit, ["fill", "contain"] as const, D.bgFit),
    bgPrint: bool(o.bgPrint, D.bgPrint),
    fontPt: num(o.fontPt, 8, 18, D.fontPt, 0.5),
    slots: Object.fromEntries(RX_SLOT_KEYS.map((k) => [k, cleanSlot(slots[k], D.slots[k])])) as Record<RxSlotKey, RxSlot>,
    ticks: Object.fromEntries(RX_TICK_KEYS.map((k) => [k, cleanPoint(ticks[k], D.ticks[k])])) as Record<RxTickKey, RxPoint>,
    body: { x: bx, y: by, w: num(body.w, 10, Math.max(10, 100 - bx), Math.min(D.body.w, 100 - bx)), h: num(body.h, 8, Math.max(8, 100 - by), Math.min(D.body.h, 100 - by)) },
    nudge: { x: num(nudge.x, -15, 15, 0, 0.5), y: num(nudge.y, -15, 15, 0, 0.5) },
  };
}

/** تصميمان سواء؟ (زرُّ «حفظ» والسؤالُ قبل الإغلاق) — بعد التنظيف، فترتيبُ المفاتيح لا يُحسب تغييراً. */
export function sameRxPad(a: RxPadConfig, b: RxPadConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ── خاناتُ المريض ─────────────────────────────────────────────────────────── */
export interface RxFields {
  /** يومٌ محلّيّ YYYY-MM-DD (لا toISOString — يومُ غرينتش). */
  date: string;
  name: string;
  owner: string;
  age: string;
  weight: string;
  kind: RxKind;
}
export const RX_FIELD_MAX = 80;

export function cleanRxFields(raw: unknown): RxFields {
  const o = isObj(raw) ? raw : {};
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "";
  return {
    date,
    name: cleanLine(o.name, RX_FIELD_MAX),
    owner: cleanLine(o.owner, RX_FIELD_MAX),
    age: cleanLine(o.age, RX_FIELD_MAX),
    weight: cleanLine(o.weight, RX_FIELD_MAX),
    kind: pick(o.kind, ["canine", "feline", "exotic", ""] as const, ""),
  };
}

/** النوعُ من الحيوان: الكلبُ والقطّة باسمهما، والطيرُ والأرنبُ وغيرُهما «Exotic»، والحصانُ والبقرةُ بلا علامة. */
export function rxKindOf(species: string | null | undefined): RxKind {
  switch (species) {
    case "dog": return "canine";
    case "cat": return "feline";
    case "bird": case "rabbit": case "other": return "exotic";
    default: return "";
  }
}

/** نصُّ الوصفة كما يُحفظ ويُطبع: أسطرٌ بلا محارف تحكّم، وبلا فراغٍ زائد بآخرها، وبسقفه. */
export function cleanRxBody(v: unknown): string {
  return (typeof v === "string" ? v : "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .split("\n").map((l) => l.replace(/\s+$/, "")).join("\n")
    .replace(/^\n+|\n+$/g, "")
    .slice(0, RX_LIMITS.body);
}

/* ── عناوينُ الورقة ──────────────────────────────────────────────────────── */
export type RxLabelKey = "canine" | "feline" | "exotic" | "date" | "name" | "age" | "owner" | "weight" | "hours" | "tel" | "signature" | "am" | "pm";
export type RxLabels = Record<RxLabelKey, string>;
/** الإنكليزيةُ كما تُطبع على راجيتات العيادات (الواجهةُ العربية لا تنزّل قاموسَها الإنكليزيّ لهذا). */
export const RX_LABELS_EN: RxLabels = {
  canine: "Canine", feline: "Feline", exotic: "Exotic", date: "Date", name: "Patient's name", age: "Age",
  owner: "Owner", weight: "Weight", hours: "Clinic Hours", tel: "Tel.", signature: "Signature", am: "am", pm: "pm",
};

/** العمرُ بالإنكليزية للورقة الإنكليزية: "3 years 4 months" (الكلماتُ نفسُها بقاموس الواجهة). */
export function ageTextEn(age: { years: number; months: number } | null): string {
  if (!age) return "";
  if (age.years <= 0 && age.months <= 0) return "Newborn";
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${age.years === 1 ? "year" : "years"}`);
  if (age.months > 0) parts.push(`${age.months} ${age.months === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

/** "14:30" ⇒ "2:30 pm" بصيغة ١٢ (بكلمتي اللغة)، أو كما هو بصيغة ٢٤. */
export function clockText(hhmm: string, fmt: "12" | "24", am: string, pm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  if (fmt === "24") return `${m[1].padStart(2, "0")}:${m[2]}`;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? pm : am}`;
}

/** الدوامُ سطراً: «10:00 am – 2:00 pm · 4:00 pm – 12:00 am»، أو "" بلا دوام. */
export function hoursLine(w: { am: { from: string; to: string } | null; pm: { from: string; to: string } | null }, fmt: "12" | "24", am: string, pm: string): string {
  return [w.am, w.pm].filter((s): s is { from: string; to: string } => !!s)
    .map((s) => `${clockText(s.from, fmt, am, pm)} – ${clockText(s.to, fmt, am, pm)}`).join("  ·  ");
}

/** بصمةُ مسودّة الراجيتة (الخاناتُ والنصّ والدكتور): «اطبع» ثانيةً بلا تغيير لا يكتب سجلّاً ثانياً. */
export function rxDraftKey(fields: RxFields, body: string, doctor: string): string {
  return JSON.stringify([cleanRxFields(fields), cleanRxBody(body), cleanLine(doctor, 120)]);
}
