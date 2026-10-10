import type { ClinicDrug, ClinicDrugOp, DrugFamilyKey, MedicineStock, Species } from "@/types";
import { FORMULARY, DRUG_BY_ID, matchMonograph, doseFor, isBannedFor, type DrugClass, type Monograph } from "./vetFormulary";
import { searchable } from "./utils";

/* ============================================================================
 * medIndex — قلبُ «أدويتي» والمنتقي الموحَّد، بلا React (تقوده فحوصُ node).
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * منتقي الأدوية كان يقصّ قائمتَه على ١٢٠ بلا كلمة والكتالوجُ وحده ١٢٣: ثلاثةُ أدويةٍ
 * لا تظهر أبداً بباب «الكل» بكلّ عيادة، وتسعةٌ وستّون بأكبرها، وشارةُ الباب تقول
 * العددَ كاملاً. وأسماءُ الأصناف إنكليزيةٌ بالواجهة العربية (مفاتيحُها غائبة)، والصنفُ
 * الأكبر يُفتح أوّلاً — «أخرى» بمخزون العيادة. «قائمةٌ ناقصة أخطرُ من خطأ ظاهر.»
 *
 * هنا: كلُّ دواءٍ مرّةً واحدة بمفتاح `searchable(name)` (الطرفان من نفس الدالّة)،
 * بأصنافٍ ثابتةِ الترتيب و«أخرى» آخرَها، وبلا سقف. و`applyOps` مرآةُ
 * `clinic_drugs_apply` (0229) سطراً بسطر — نفسُ الموضع ونفسُ الرفض ونفسُ ترتيب
 * الرفض — يفحص تطابقَهما `clinic-drugs-parity` على بوستغريس حقيقيّ.
 * ==========================================================================*/

export type FamilyKey = DrugFamilyKey;

/** الترتيبُ ثابت — لا يُفرز بالعدد أبداً، و«أخرى» آخرُه. مرآةُ قيد CHECK بـ0229. */
export const FAMILIES: readonly FamilyKey[] = [
  "antibiotics", "analgesics", "anesthetics", "antiparasitics", "antifungals", "steroids",
  "gi", "cardiac", "endocrine", "derm", "fluids", "emergency", "vitamins", "other",
];
export const isFamily = (x: unknown): x is FamilyKey => typeof x === "string" && (FAMILIES as readonly string[]).includes(x);

/** الصنفُ الإنكليزيّ القديم لكلّ عائلة — ملاحظاتُ نموذج الدواء («Injection · Antibiotics»)
 *  تبقى حرفاً كما كانت، ومرآةُ `_clinic_drugs_family` بـ0230 بالاتجاه الآخر. */
export const FAMILY_TYPE: Record<FamilyKey, string> = {
  antibiotics: "Antibiotics",
  analgesics: "NSAIDs & Analgesics",
  anesthetics: "Anesthetics & Sedatives",
  antiparasitics: "Antiparasitics",
  antifungals: "Antifungals",
  steroids: "Corticosteroids",
  gi: "Gastrointestinal",
  cardiac: "Cardiac & Diuretics",
  endocrine: "Endocrine & Hormones",
  derm: "Antihistamines & Dermatology",
  fluids: "Fluids & Electrolytes",
  emergency: "Emergency & Antidotes",
  vitamins: "Vitamins & Supplements",
  other: "Other",
};
/** اسمٌ قديمٌ كان بجدول المنتقي ولا يوجد بالكتالوج — يُطوى لعائلته لا لـ«أخرى». */
export const TYPE_ALIASES: Readonly<Record<string, FamilyKey>> = { "Allergy & Dermatology": "derm" };

export function familyOfCatalogType(type: string | null | undefined): FamilyKey {
  const t = String(type ?? "").trim();
  for (const k of FAMILIES) if (FAMILY_TYPE[k] === t) return k;
  return TYPE_ALIASES[t] ?? "other";
}

/** أصنافُ الدليل الدوائيّ → العائلة — للدواء الموثَّق الذي لا اسمَ له بالكتالوج وحده. */
const CLASS_FAMILY: Record<DrugClass, FamilyKey> = {
  nsaid: "analgesics", opioid: "analgesics", corticosteroid: "steroids", sedative: "anesthetics", anesthetic: "anesthetics",
  "beta-lactam": "antibiotics", fluoroquinolone: "antibiotics", aminoglycoside: "antibiotics", tetracycline: "antibiotics",
  nitroimidazole: "antibiotics", sulfonamide: "antibiotics", macrolide: "antibiotics",
  antifungal: "antifungals", antiparasitic: "antiparasitics", antiemetic: "gi", gastroprotectant: "gi",
  diuretic: "cardiac", anticonvulsant: "emergency", antihistamine: "derm", vitamin: "vitamins", other: "other",
};
export const familyOfClass = (c: DrugClass): FamilyKey => CLASS_FAMILY[c] ?? "other";

/* ============================================================================
 * applyOps — مرآةُ clinic_drugs_apply (0229)
 * ==========================================================================*/

export const POS_STEP = 1024;
export const MAX_LIVE = 400;
export const MAX_OPS = 200;

/** تلميحاتُ الخادم حرفاً بحرف (`raise … using hint`) — بمهارب يونيكود لأنها عقدٌ مع
 *  القاعدة لا نصٌّ يُترجم، ويفحص `clinic-drugs-test` تطابقَها مع نصّ 0229. */
export const DRUG_HINTS = {
  no_clinic: "\u0644\u0627 \u0639\u064a\u0627\u062f\u0629\u064e \u0644\u0644\u062c\u0644\u0633\u0629 \u2014 \u0633\u062c\u0651\u0644 \u062f\u062e\u0648\u0644 \u0645\u0646 \u062c\u062f\u064a\u062f.",
  clinic_switched: "\u062a\u0628\u062f\u0651\u0644\u062a \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062c\u0647\u0627\u0632 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629. \u0645\u0627 \u0627\u0646\u062d\u0641\u0638 \u0634\u064a.",
  bad_ops: "\u0637\u0644\u0628\u064c \u063a\u064a\u0631 \u0645\u0641\u0647\u0648\u0645 \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629.",
  too_many_ops: "\u062a\u0639\u062f\u064a\u0644\u0627\u062a \u0643\u062b\u064a\u0631\u0629 \u0628\u0637\u0644\u0628 \u0648\u0627\u062d\u062f \u2014 \u062d\u062f\u0651\u062b \u0627\u0644\u0635\u0641\u062d\u0629 \u0648\u062c\u0631\u0651\u0628 \u0623\u0642\u0644.",
  drug_row_gone: "\u062a\u063a\u064a\u0651\u0631\u062a \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0646 \u062c\u0647\u0627\u0632 \u062b\u0627\u0646\u064a \u2014 \u0631\u062c\u0651\u0639\u0646\u0627\u0647\u0627 \u0645\u062b\u0644 \u0645\u0627 \u0628\u0627\u0644\u062e\u0627\u062f\u0645\u060c \u0639\u064a\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
  drug_exists: "\u0627\u0644\u062f\u0648\u0627\u0621 \u0645\u0648\u062c\u0648\u062f: \u00ab%s\u00bb \u2014 \u0627\u0633\u062a\u0639\u0645\u0644\u0647 \u0628\u062f\u0644 \u0645\u0627 \u062a\u0636\u064a\u0641 \u0646\u0633\u062e\u0629 \u062b\u0627\u0646\u064a\u0629.",
  clinic_drugs_full: "\u0648\u0635\u0644\u062a \u0664\u0660\u0660 \u062f\u0648\u0627\u0621 \u2014 \u0623\u0631\u0634\u0641 \u062f\u0648\u0627\u0621 \u0645\u0627 \u062a\u0633\u062a\u0639\u0645\u0644\u0647 \u0623\u0648\u0651\u0644\u0627\u064b",
  clinic_drugs_frozen: "\u0647\u0648\u064a\u0629 \u0627\u0644\u062f\u0648\u0627\u0621 \u0648\u0639\u064a\u0627\u062f\u062a\u0647 \u0645\u0627 \u062a\u062a\u063a\u064a\u0651\u0631",
  clinic_drugs_bad_name: "\u0627\u0633\u0645 \u0627\u0644\u062f\u0648\u0627\u0621 \u0644\u0627\u0632\u0645 \u064a\u0643\u0648\u0646 \u0628\u064a\u0646 \u062d\u0631\u0641 \u0648\u0661\u0662\u0660 \u062d\u0631\u0641\u0627\u064b.",
} as const;
export type DrugErrorCode = keyof typeof DRUG_HINTS;

/** خطأٌ بشكل خطأ الخادم كما يصل من PostgREST: `message` = الرمز، و`code` = P0001،
 *  و`hint` = الشرح العربيّ — فيقرؤه `describeDbError` كما يقرأ رفضَ القاعدة. */
export class DrugOpError extends Error {
  code: string;
  hint: string;
  constructor(reason: DrugErrorCode | "23505" | "23514", arg?: string) {
    super(reason);
    this.name = "DrugOpError";
    const known = reason in DRUG_HINTS;
    this.code = known ? "P0001" : reason;
    this.hint = known ? DRUG_HINTS[reason as DrugErrorCode].replace("%s", arg ?? "") : "";
  }
}
/** رمزُ الرفض من خطأ الخادم أو المرآة (الرسالةُ نفسُها). */
export const drugErrorCode = (e: unknown): string | null => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : null;
};
const fail = (reason: DrugErrorCode | "23505" | "23514", arg?: string): never => { throw new DrugOpError(reason, arg); };

/** مرآةُ `btrim(name, E' \t\r\n')` — لا `trim()` (تلك تقصّ محارفَ لا يقصّها الخادم). */
export const trimDrugName = (s: string | null | undefined): string => String(s ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
/** مفتاحُ الدواء — مرآةُ `search_norm(name)` بالفهرس الفريد. */
export const drugKey = (name: string | null | undefined): string => searchable(name);
const charLen = (s: string) => [...s].length;

/** ترتيبُ بوستغريس `order by pos, id` (المعرّفُ uuid يُقارن بايتاً بايتاً = نصّاً بحروفٍ صغيرة). */
export const cmpMine = (a: ClinicDrug, b: ClinicDrug): number =>
  ((a.pos ?? 0) - (b.pos ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const mineOrder = (rows: readonly ClinicDrug[]): ClinicDrug[] => rows.filter((r) => r.in_mine).sort(cmpMine);

const hasAfter = (o: object): boolean => Object.prototype.hasOwnProperty.call(o, "after") && (o as { after?: unknown }).after !== undefined;

/**
 * يطبّق دفعةً من العمليات كما يطبّقها الخادم — بالترتيب، وبالرفض نفسه وترتيبه.
 * لا يُغيّر المصفوفةَ الداخلة: رفضٌ بمنتصف الدفعة يرمي ولا يترك نصفَها (معاملةٌ واحدة).
 */
export function applyOps(rows: readonly ClinicDrug[], ops: readonly ClinicDrugOp[], now: string = new Date().toISOString()): ClinicDrug[] {
  if (!Array.isArray(ops)) fail("bad_ops");
  if (ops.length > MAX_OPS) fail("too_many_ops");
  const out: ClinicDrug[] = rows.map((r) => ({ ...r }));
  const liveCount = () => out.filter((r) => r.archived_at == null).length;
  const liveByKey = (k: string, except?: string) =>
    k === "" ? undefined : out.find((r) => r.archived_at == null && r.id !== except && drugKey(r.name) === k);

  /** الموضع — مرآةُ كتلة «slot» بالدالّة: آخرُ القائمة، أو أوّلُها، أو منتصفُ الفجوة بعد صفّ،
   *  وفجوةٌ أقلُّ من ٢ تُرقِّم «أدويتي» كلَّها ×١٠٢٤ ثم يُعاد الحساب مرّةً واحدة. */
  const slot = (self: string | null, has: boolean, after: string | null): number => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const others = out.filter((r) => r.in_mine && r.id !== self);
      if (!has) return (others.length ? Math.max(...others.map((r) => r.pos as number)) : 0) + POS_STEP;
      if (after === null) return (others.length ? Math.min(...others.map((r) => r.pos as number)) : POS_STEP) - POS_STEP;
      const a = out.find((r) => r.id === after && r.in_mine && r.archived_at == null);
      if (!a || after === self) return fail("drug_row_gone");
      const apos = a.pos as number;
      const later = others.filter((r) => (r.pos as number) > apos).map((r) => r.pos as number);
      if (!later.length) return apos + POS_STEP;
      const next = Math.min(...later);
      if (next - apos >= 2) return Math.floor((apos + next) / 2);
      if (attempt === 2) break;
      mineOrder(out).forEach((r, i) => { r.pos = (i + 1) * POS_STEP; });
    }
    return fail("drug_row_gone");
  };

  for (const o of ops) {
    if (!o || typeof o !== "object" || typeof (o as { id?: unknown }).id !== "string" || !(o as { id: string }).id) fail("bad_ops");
    switch (o.op) {
      case "put": {
        const name = trimDrugName(o.name);
        const k = drugKey(name);
        const has = hasAfter(o);
        const after = has ? (o.after ?? null) : null;
        const mine = !!o.mine;
        const hit = liveByKey(k);
        if (hit) {
          // موجودٌ حيّ: لا تسميةَ ولا صنفَ ولا إخراجَ من «أدويتي» — نجمةٌ أو نقلٌ لا غير.
          if (mine && (!hit.in_mine || has)) {
            const pos = slot(hit.id, has, after);
            if (!hit.in_mine) { hit.in_mine = true; hit.updated_at = now; }
            hit.pos = pos;
          }
          break;
        }
        const pos = mine ? slot(null, has, after) : null;
        // ترتيبُ رفض الإدراج كما بالقاعدة: المحفّز (الاسم، السقف) ← قيدُ الصنف ← المفتاحُ الأساسيّ.
        if (k === "" || charLen(name) > 120) fail("clinic_drugs_bad_name");
        if (liveCount() >= MAX_LIVE) fail("clinic_drugs_full");
        const family = (o.family || "other") as FamilyKey;
        if (!isFamily(family)) fail("23514");
        if (out.some((r) => r.id === o.id)) fail("23505");
        out.push({ id: o.id, name, family, in_mine: mine, pos, archived_at: null, created_at: now, updated_at: now });
        break;
      }
      case "unmine": {
        const r = out.find((x) => x.id === o.id && x.in_mine);
        if (r) { r.in_mine = false; r.pos = null; r.updated_at = now; }
        break;
      }
      case "move": {
        const r = out.find((x) => x.id === o.id && x.in_mine && x.archived_at == null);
        if (!r) return fail("drug_row_gone");
        r.pos = slot(r.id, true, o.after ?? null);
        break;
      }
      case "edit": {
        const r = out.find((x) => x.id === o.id && x.archived_at == null);
        if (!r) return fail("drug_row_gone");
        const name = typeof o.name === "string" ? trimDrugName(o.name) : r.name;
        const family = (o.family || r.family) as FamilyKey;
        if (name === r.name && family === r.family) break;
        if (drugKey(name) === "" || charLen(name) > 120) fail("clinic_drugs_bad_name");
        if (!isFamily(family)) fail("23514");
        const twin = liveByKey(drugKey(name), r.id);
        if (twin) fail("drug_exists", twin.name);
        r.name = name; r.family = family; r.updated_at = now;
        break;
      }
      case "archive": {
        const r = out.find((x) => x.id === o.id && x.archived_at == null);
        if (r) { r.archived_at = now; r.in_mine = false; r.pos = null; r.updated_at = now; }
        break;
      }
      case "restore": {
        const r = out.find((x) => x.id === o.id);
        if (!r) return fail("drug_row_gone");
        if (r.archived_at != null) {
          if (liveCount() >= MAX_LIVE) fail("clinic_drugs_full");
          const twin = liveByKey(drugKey(r.name), r.id);
          if (twin) fail("drug_exists", twin.name);
          r.archived_at = null; r.updated_at = now;
        }
        break;
      }
      default:
        fail("bad_ops");
    }
  }
  return out;
}

/* ============================================================================
 * planDrop — إفلاتٌ واحد = عمليةٌ واحدة
 * ==========================================================================*/

export interface DropItem {
  /** معرّفُ صفّه إن كان له صفّ (أو معرّفٌ جديد للإدراج). */
  id: string;
  name: string;
  family: FamilyKey;
  /** هل هو بـ«أدويتي» الآن؟ */
  inMine: boolean;
}

/**
 * `mineIds` = «أدويتي» بترتيبها، و`at` = موضعُ الإدراج (٠…n)، أو `null` = آخرُها (رفُّ
 * «★ أدويتي» أو الشريطُ اللاصق). دواءٌ خارجها ⇒ `put` بـ«بعد»، ودواءٌ فيها ⇒ `move` —
 * **لا `put` ثانٍ لما هو فيها أبداً**، ونفسُ المكان ⇒ لا شيء.
 */
export function planDrop(mineIds: readonly string[], item: DropItem, at: number | null): ClinicDrugOp | null {
  const n = mineIds.length;
  const t = at == null ? n : Math.max(0, Math.min(n, Math.trunc(at)));
  const i = item.inMine ? mineIds.indexOf(item.id) : -1;
  if (i >= 0) {
    if (t === i || t === i + 1) return null;
    return { op: "move", id: item.id, after: t === 0 ? null : mineIds[t - 1] };
  }
  if (t >= n) return { op: "put", id: item.id, name: item.name, family: item.family, mine: true };
  return { op: "put", id: item.id, name: item.name, family: item.family, mine: true, after: t === 0 ? null : mineIds[t - 1] };
}

/**
 * Escape بالمنتقي: أثناء السحب **يمرّ** (بلا preventDefault ولا stopPropagation) فيلغي
 * مستمعُ dnd-kit على المستند السحبَ — وإلا أغلق Escape المنتقي والسحبُ معلَّق. وبعده:
 * البحثُ أوّلاً، ثم الورقة.
 */
export function pickerKeyAction(e: { key: string; dragging: boolean; searchOn: boolean }): "pass" | "closeSearch" | "close" {
  if (e.key !== "Escape" || e.dragging) return "pass";
  return e.searchOn ? "closeSearch" : "close";
}

/**
 * Enter بحقل البحث **يضيف ولا يشيل أبداً**. الضغطةُ على بلاطةٍ مختارة بوضع multi تعني
 * «شيلها» لأن العينَ ترى «أُضيف ✓» عليها؛ أمّا Enter فيُضغط على نتيجةٍ لم تُرَ — أوّلُها
 * «أدويتي» (تُرتَّب أوّلاً)، فكان «amox» + Enter يمحو Amoxicillin-Clavulanate من الخطة
 * بجرعته المعدَّلة بدل أن يضيف Amoxicillin 250mg. المختارُ أصلاً ⇒ «موجود» ولا شيء يتغيّر.
 */
export function searchEnter<T>(results: readonly T[], isSelected: (it: T) => boolean, mode: "multi" | "single" | "manage"):
  { act: "pick"; it: T } | { act: "already"; it: T } | null {
  const it = results[0];
  if (it === undefined) return null;
  return mode === "multi" && isSelected(it) ? { act: "already", it } : { act: "pick", it };
}

/** حالُ «أدويتي» كما تُقال — قائمةٌ فارغةٌ عن خطأٍ أو تحميلٍ أو عيادةٍ تبدّلت ليست «فاضية». */
export type MineState = "list" | "empty" | "loading" | "error" | "switched";
export function mineState(status: "idle" | "loading" | "ready" | "error" | "switched", n: number): MineState {
  if (status === "switched") return "switched";
  if (n > 0) return "list";
  if (status === "ready") return "empty";
  return status === "error" ? "error" : "loading";
}

/**
 * ما يُقال فوق المنتقي حين لا يعمل كلُّه — بالترتيب. لا نجمةَ رماديةً بلا سبب، ولا عدسةٌ تقول
 * «ماكو» عن دواءٍ لم يصل:
 *  • switched / readOnly — كما كانا؛
 *  • stale — قراءةُ «أدويتي» فشلت والصفوفُ آخرُ ما وصل: النجمةُ والسحبُ موقوفان، والسببُ يُقال
 *    مع «أعد المحاولة» (الفارغةُ تقولها لوحتُها بنفسها)؛
 *  • stockFail — المخزنُ لم يصل: ما بالمخزن بلا اسمٍ بالكتالوج غائبٌ الآن لا معدوم.
 */
export type PickerNotice = "switched" | "readOnly" | "stale" | "stockFail";
export function pickerNotices(s: { status: string; readOnly: boolean; rows: number; stock: "hidden" | "loading" | "ok" | "failed" }): PickerNotice[] {
  const out: PickerNotice[] = [];
  if (s.status === "switched") out.push("switched");
  else if (s.readOnly) out.push("readOnly");
  if (s.status === "error" && s.rows > 0) out.push("stale");
  if (s.stock === "failed") out.push("stockFail");
  return out;
}

/**
 * «استبدال» بالمعالج: الدواءُ المختار بالخطة أصلاً بصفٍّ آخر ⇒ يبقى ذاك بجرعته ويُشال
 * المستبدَل (`dup`) — لا صفّان لدواءٍ واحد بجدولين وجرعتين على الطبلة. ونفسُ الصفّ ⇒ لا شيء
 * (البذرةُ لا تمحو جرعةً عدّلها الطبيب).
 */
export function replaceDecision(rows: readonly { id: string; name: string }[], replaceId: string, name: string):
  { kind: "replace" } | { kind: "same" } | { kind: "dup"; keep: string } {
  const k = searchable(name);
  const hit = k ? rows.find((r) => r.name.trim() && searchable(r.name) === k) : undefined;
  if (!hit) return { kind: "replace" };
  return hit.id === replaceId ? { kind: "same" } : { kind: "dup", keep: hit.id };
}

/* ============================================================================
 * buildMedIndex — كلُّ دواءٍ مرّةً واحدة، بلا سقف
 * ==========================================================================*/

export type MedSource = "mine" | "catalog" | "custom" | "stock" | "recent" | "free";

export interface MedItem {
  key: string;
  /** النصُّ الذي يُكتب بالسجلّ — اسمُ الكتالوج كما هو، أو اسمُ العيادة، أو المنتج. */
  name: string;
  /** عنوانُ البلاطة: العربيّ من الدليل، وإلا الاسم. */
  label: string;
  /** الاسمُ الخام تحت العنوان حين يختلفان. */
  sub: string | null;
  family: FamilyKey;
  familyType: string;
  base: "catalog" | "custom" | "stock" | "formulary" | "recent";
  drugId?: string;
  inMine: boolean;
  pos: number | null;
  monographId?: string;
  banned?: string;
  dosed: boolean;
  /** مجموعُ الرصيد للعرض — منتجاتٌ بنفس المفتاح. */
  stock?: number;
  products: MedicineStock[];
  hay: string;
}

export interface MedIndex {
  all: MedItem[];
  /** العائلاتُ التي فيها شيء، بالترتيب الثابت و«أخرى» آخرها. */
  families: { key: FamilyKey; count: number }[];
  byFamily: Map<FamilyKey, MedItem[]>;
  /** «أدويتي» بترتيبها. */
  mine: MedItem[];
  /** منتجاتُ المخزن التي لا توأمَ لها بالكتالوج ولا بأدوية العيادة. */
  stockLens: MedItem[];
  byKey: Map<string, MedItem>;
  /** «الأخيرة» — حتى ١٢ بلا تكرار. */
  recent: MedItem[];
  search(q: string): MedItem[];
}

export interface MedCatalogGroup { type: string; items: readonly string[] }

export interface BuildInput {
  catalog: readonly MedCatalogGroup[];
  rows: readonly ClinicDrug[];
  stock?: readonly MedicineStock[] | null;
  recent?: readonly string[] | null;
  species?: Species | null;
  /** «الموثَّق جرعتُه» وحده (محرّرُ البروتوكول): كلُّ دواءٍ بالدليل، ولا شيءَ بلاه. */
  only?: "dosable";
  /** الدليلُ كلُّه **فوق** الكتالوج (الطبلة): ما لا اسمَ له بالكتالوج (Ibuprofen، Aspirin،
   *  Permethrin) بلاطةٌ بشارة «ممنوع» لنوعه — غيابُه كان يدفع الممرّضة لكتابته حرّاً بلا تحذير. */
  formulary?: "all";
  stockMode?: "show" | "hide";
}

const haystack = (name: string, mono?: Monograph) =>
  [name, mono?.ar, mono?.en, ...(mono?.brands ?? [])].filter(Boolean).map((s) => searchable(s as string)).join("|");

/** ترتيبُ اليوم داخل الصنف: الممنوعُ آخراً، ثم المتوفّر، ثم ما له جرعة. */
const rankOf = (it: MedItem) => (it.banned ? 100 : 0) + ((it.stock ?? 0) > 0 ? 0 : 10) + (it.dosed ? 0 : 1);
const byRank = (a: MedItem, b: MedItem) => rankOf(a) - rankOf(b) || a.label.localeCompare(b.label, "ar") || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const byPos = (a: MedItem, b: MedItem) => ((a.pos ?? 0) - (b.pos ?? 0)) || ((a.drugId ?? "") < (b.drugId ?? "") ? -1 : (a.drugId ?? "") > (b.drugId ?? "") ? 1 : 0);
/** داخل العائلة: «أدويتي» أوّلاً بموضعها، ثم ترتيبُ اليوم. */
const inFamilyOrder = (a: MedItem, b: MedItem) =>
  a.inMine !== b.inMine ? (a.inMine ? -1 : 1) : a.inMine ? byPos(a, b) : byRank(a, b);

export function buildMedIndex(input: BuildInput): MedIndex {
  const species = input.species ?? null;
  const showStock = input.stockMode !== "hide";
  const items = new Map<string, MedItem>();

  const make = (name: string, family: FamilyKey, familyType: string, base: MedItem["base"], mono?: Monograph): MedItem => ({
    key: searchable(name), name, label: mono?.ar ?? name, sub: mono?.ar && mono.ar !== name ? name : null,
    family, familyType, base, inMine: false, pos: null, monographId: mono?.id,
    banned: mono && species ? isBannedFor(mono, species) : undefined,
    dosed: !!(mono && species && doseFor(mono, species)),
    products: [], hay: haystack(name, mono),
  });

  for (const g of input.catalog) {
    if (g.type === "Vaccines") continue;
    for (const name of g.items) {
      const k = searchable(name);
      if (!k || items.has(k)) continue;
      items.set(k, make(name, familyOfCatalogType(g.type), g.type, "catalog", matchMonograph(name)));
    }
  }
  if (input.only === "dosable" || input.formulary === "all") {
    // كلُّ دواءٍ بالدليل يُوصَل إليه: ما لا اسمَ له بالكتالوج (Ibuprofen، Aspirin، Permethrin) يُضاف بنفسه.
    const reached = new Set([...items.values()].map((it) => it.monographId).filter(Boolean));
    for (const m of FORMULARY) {
      if (reached.has(m.id)) continue;
      const k = searchable(m.en);
      if (!k || items.has(k)) continue;
      const fam = familyOfClass(m.klass);
      items.set(k, make(m.en, fam, FAMILY_TYPE[fam], "formulary", m));
    }
  }
  for (const r of input.rows) {
    if (r.archived_at != null) continue;
    const k = searchable(r.name);
    if (!k) continue;
    let it = items.get(k);
    if (!it) {
      const fam = isFamily(r.family) ? r.family : "other";
      it = make(r.name, fam, FAMILY_TYPE[fam], "custom", matchMonograph(r.name));
      items.set(k, it);
    }
    it.drugId = r.id;
    it.inMine = !!r.in_mine;
    it.pos = r.in_mine ? r.pos : null;
  }
  if (showStock) {
    for (const p of input.stock ?? []) {
      const k = searchable(p.name);
      if (!k) continue;
      let it = items.get(k);
      if (!it) { it = make(p.name, "other", FAMILY_TYPE.other, "stock", matchMonograph(p.name)); items.set(k, it); }
      it.products.push(p);
    }
    for (const it of items.values()) if (it.products.length) it.stock = it.products.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  }

  let all = [...items.values()];
  if (input.only === "dosable") all = all.filter((it) => !!it.monographId);
  const byKey = new Map(all.map((it) => [it.key, it] as const));

  const byFamily = new Map<FamilyKey, MedItem[]>();
  const stockLens: MedItem[] = [];
  for (const it of all) {
    if (it.base === "stock") { stockLens.push(it); continue; }
    const list = byFamily.get(it.family) ?? [];
    list.push(it);
    byFamily.set(it.family, list);
  }
  for (const list of byFamily.values()) list.sort(inFamilyOrder);
  stockLens.sort(inFamilyOrder);
  const families = FAMILIES.filter((f) => (byFamily.get(f)?.length ?? 0) > 0).map((f) => ({ key: f, count: byFamily.get(f)!.length }));
  const mine = all.filter((it) => it.inMine).sort(byPos);

  const recent: MedItem[] = [];
  const seen = new Set<string>();
  for (const raw of input.recent ?? []) {
    const name = trimDrugName(raw);
    const k = searchable(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const hit = byKey.get(k);
    if (hit) { recent.push(hit); }
    else {
      // اسمٌ كتبته العيادةُ («ميلوكسيكام») يحمل دليلَه — بلاه كانت ضغطتُه بالطبلة «بلا جرعة
      // موثّقة» كاذبة، بلا جرعةٍ ولا تحذيرِ نوع، والدليلُ يعرفه.
      const mono = matchMonograph(name);
      if (input.only !== "dosable" || mono) recent.push(make(name, "other", FAMILY_TYPE.other, "recent", mono));
    }
    if (recent.length >= 12) break;
  }

  const search = (q: string): MedItem[] => {
    const k = searchable(q.trim());
    const list = k ? all.filter((it) => it.hay.includes(k)) : all.slice();
    return list.sort(inFamilyOrder);
  };

  return { all, families, byFamily, mine, stockLens, byKey, recent, search };
}

/* ============================================================================
 * ما يعود للمضيف بعد الاختيار
 * ==========================================================================*/

export interface PickedMed {
  /** searchable(name) */
  key: string;
  /** النصُّ الوحيد الذي يُكتب بالسجلّات. */
  name: string;
  label: string;
  family: FamilyKey;
  /** الصنفُ الإنكليزيّ — ملاحظاتُ نموذج الدواء «Injection · Antibiotics» كما كانت. */
  familyType: string;
  source: MedSource;
  /** صفُّ clinic_drugs (بابُ المرحلة الثالثة؛ للمضيف أن يتجاهله). */
  drugId?: string;
  monographId?: string;
  /** للعرض وحده. */
  stock?: number;
  /** منتجٌ واحدٌ بالمخزن بنفس المفتاح — البيعُ يصير سطرَ منتج (جواب المالك ٢). */
  productId?: string;
}

export function pickedFrom(it: MedItem, via?: "mine" | "recent"): PickedMed {
  const base: MedSource = it.base === "formulary" ? "catalog" : it.base === "recent" ? "recent" : it.base;
  return {
    key: it.key, name: it.name, label: it.label, family: it.family, familyType: it.familyType,
    source: via ?? (it.inMine ? "mine" : base),
    drugId: it.drugId, monographId: it.monographId, stock: it.stock,
    productId: it.products.length === 1 ? it.products[0].id : undefined,
  };
}

/** «هالمرة بس»: اسمٌ مكتوب لا يُحفظ بمكان — ودليلُه إن عرفه (فالجرعةُ والمنعُ بالنوع يصلان). */
export function freePicked(name: string, family: FamilyKey): PickedMed {
  const n = trimDrugName(name);
  return { key: searchable(n), name: n, label: n, family, familyType: FAMILY_TYPE[family], source: "free", monographId: matchMonograph(n)?.id };
}

/**
 * دليلُ الدواء المختار: معرّفُه إن حمله، وإلا اسمُه — نفسُ ما تفعله خطةُ العلاج (formularySeed
 * من الاسم). المضيفُ الذي يحسب جرعةً لا يثق بغياب المعرّف: «الأخيرة» والمكتوبُ بيدٍ والمحفوظُ
 * قبل هذه الدفعة يصلون بلاه.
 */
export function monographOf(m: { monographId?: string | null; name: string }): Monograph | undefined {
  return (m.monographId ? DRUG_BY_ID.get(m.monographId) : undefined) ?? matchMonograph(m.name);
}
