/* ============================================================================
 * لوحةُ المتجر (0229) — الحسابُ النقيّ وراء شاشة المصوّر وتشكيلة المتجر.
 *
 * تعريفٌ واحدٌ لكلّ سؤال: «جاهزٌ للنشر؟»، «بلا صورة؟»، «نافد؟» — يقرؤه
 * العدّادُ والتصفيةُ والنشرُ الجماعيّ معاً. عدّادٌ يقول ٢٧ وتصفيةٌ تعرض ٢٥
 * بتعريفين مختلفين تكذّب الشاشةَ على نفسها، والمصوّرُ يصدّق أوّلَهما.
 *
 * ومرآةُ «الجاهز» بالخادم هي `store_publish` (0229): الشروطُ الإلزاميةُ نفسُها
 * (صورة + سعرٌ موجب + غيرُ منتهٍ) — والخادمُ حَكَمٌ يقول ما تخطّاه ولماذا.
 * ==========================================================================*/
import { daysToExpiry } from "./expiry";
import { normalizeCode, searchable } from "./utils";

/** ما تحتاجه اللوحةُ من المنتج — أعمدةُ `photo_products()` الآمنة (بلا سعر شراء). */
export interface BoardRow {
  id: string;
  name: string;
  barcode?: string | null;
  company_name?: string | null;
  image_path?: string | null;
  store_visible: boolean;
  store_featured: boolean;
  store_desc?: string | null;
  sell_price?: number | null;
  stock?: number | null;
  pooled?: boolean | null;
  /** 0229: التوفّرُ كما يراه الزبون (تعبيرُ store_catalog: رصيدُ الصفّ أو حوضُ صنفه). */
  available?: boolean | null;
  expiry_date?: string | null;
  store_section_id?: string | null;
  store_sort?: number | null;
  below_cost?: boolean | null;
  alt_codes?: string[] | null;
}

export type BoardFilter =
  | "nophoto" | "photo" | "shown" | "hidden" | "ready" | "shownNoPhoto"
  | "noprice" | "nodesc" | "nosection" | "out" | "expired" | "belowCost" | "featHidden" | "all";

/** ترتيبُ الأزرار — الأولُ الأهمّ لشغل المصوّر. */
export const BOARD_FILTERS: BoardFilter[] = [
  "nophoto", "shownNoPhoto", "ready", "photo", "shown", "hidden",
  "noprice", "nodesc", "nosection", "out", "expired", "belowCost", "featHidden", "all",
];

/** تصفياتٌ تُخفى حين تكون صفراً — عيوبٌ لا أقسامُ عمل. */
export const QUIET_WHEN_ZERO: ReadonlySet<BoardFilter> = new Set<BoardFilter>(
  ["shownNoPhoto", "noprice", "nodesc", "nosection", "out", "expired", "belowCost", "featHidden", "ready"],
);

export const hasPhoto = (p: BoardRow) => !!p.image_path;
export const hasPrice = (p: BoardRow) => (Number(p.sell_price) || 0) > 0;
/** نافدٌ كما يراه الزبون: من `available` إن وصل (الحوضُ محسوب بالخادم)، وإلا من الرصيد —
 *  المجمَّعُ بلا رصيد صفٍّ قد يُباع من حوضه، فلا يُقال «نافد» عنه بلا جواب الخادم. */
export const isOut = (p: BoardRow) => (p.available != null ? !p.available : (Number(p.stock) || 0) <= 0 && !p.pooled);
/** منتهٍ = آخرُ يومٍ صالحٍ مضى (المتجرُ يخفيه بالخادم منذ 0212). */
export const isExpired = (p: BoardRow, todayISO?: string) => {
  const d = daysToExpiry(p.expiry_date ?? null, todayISO);
  return d !== null && d < 0;
};

export type Missing = "photo" | "price" | "expired";
export type Warn = "desc" | "section" | "stock";

/** جاهزيةُ النشر: الناقصُ الإلزاميّ يمنع، والتنبيهُ يُقال ولا يمنع (قرار المالك ١). */
export function readiness(p: BoardRow, todayISO?: string, sectionsOn = true): { ok: boolean; missing: Missing[]; warn: Warn[] } {
  const missing: Missing[] = [];
  if (!hasPhoto(p)) missing.push("photo");
  if (!hasPrice(p)) missing.push("price");
  if (isExpired(p, todayISO)) missing.push("expired");
  const warn: Warn[] = [];
  if (!p.store_desc) warn.push("desc");
  if (sectionsOn && !p.store_section_id) warn.push("section");
  if (isOut(p)) warn.push("stock");
  return { ok: missing.length === 0, missing, warn };
}

/** هل المنتجُ بهذه التصفية — `activeSections` معرّفاتُ الأقسام غيرِ المؤرشفة. */
export function inFilter(p: BoardRow, f: BoardFilter, todayISO?: string, activeSections?: ReadonlySet<string>): boolean {
  switch (f) {
    case "all": return true;
    case "nophoto": return !hasPhoto(p);
    case "photo": return hasPhoto(p);
    case "shown": return p.store_visible;
    case "hidden": return !p.store_visible;
    case "ready": return !p.store_visible && readiness(p, todayISO).ok;
    case "shownNoPhoto": return p.store_visible && !hasPhoto(p);
    // العيوبُ على **المنشور** وحدَه: «بلا وصف» عن منتجٍ مخفيٍّ ليس عيباً بالمتجر.
    case "noprice": return p.store_visible && !hasPrice(p);
    case "nodesc": return p.store_visible && !p.store_desc;
    case "nosection": return p.store_visible && !(p.store_section_id && (!activeSections || activeSections.has(p.store_section_id)));
    case "out": return p.store_visible && isOut(p);
    case "expired": return p.store_visible && isExpired(p, todayISO);
    case "belowCost": return p.store_visible && !!p.below_cost;
    // مميّزٌ مخفيٌّ لا يفيد بشيء — كان المميّزُ الوحيدُ بأكبر عيادة مخفياً.
    case "featHidden": return p.store_featured && !p.store_visible;
  }
}

/** عدّادُ كلّ تصفية — بنفس `inFilter` حرفياً. */
export function boardCounts(rows: readonly BoardRow[], todayISO?: string, activeSections?: ReadonlySet<string>): Record<BoardFilter, number> {
  const out = Object.fromEntries(BOARD_FILTERS.map((f) => [f, 0])) as Record<BoardFilter, number>;
  for (const p of rows) for (const f of BOARD_FILTERS) if (inFilter(p, f, todayISO, activeSections)) out[f]++;
  return out;
}

/** شريطُ التقدّم: المنشورُ بصورةٍ من كلّ المنشور. */
export function progress(rows: readonly BoardRow[]): { done: number; total: number } {
  let done = 0, total = 0;
  for (const p of rows) if (p.store_visible) { total++; if (hasPhoto(p)) done++; }
  return { done, total };
}

/**
 * البحثُ بالطرفين: الاسمُ والشركةُ من `searchable`، والرمزُ (الباركود ورموزُه
 * الإضافية) من `normalizeCode` — تطبيعُ طرفٍ واحدٍ يفشل بصمتٍ ويبدو أنه يعمل.
 */
export function matchesQuery(p: BoardRow, q: string): boolean {
  const raw = q.trim();
  if (!raw) return true;
  const needle = searchable(raw);
  if (needle && searchable(`${p.name} ${p.company_name ?? ""}`).includes(needle)) return true;
  const code = normalizeCode(raw);
  if (!code) return false;
  const codes = [p.barcode, ...(p.alt_codes ?? [])].filter(Boolean).map((c) => normalizeCode(String(c)));
  return codes.some((c) => c.includes(code));
}

/**
 * منتجُ المسحة: مطابقةٌ تامّةٌ للرمز (الأساسيّ أو الإضافيّ) — لا جزئية.
 *
 * ثلاثةُ أجوبةٍ لا اثنان: «لا منتج» و«منتجٌ واحد» و«أكثرُ من منتج». كان الثالثُ يرجع
 * كالأوّل فيُقال «الرمز مو لمنتج بالمخزون» عن توأمين بالرفّ — وهو بالضبط «ماكو منتج»
 * الذي أعاد عيادةً لإدخال مادّتها مرّةً ثانية. التوأمان لا يُفتح أحدُهما اعتباطاً،
 * ويُقالان بعددهما.
 */
export type ScanResult<T> = { kind: "none" } | { kind: "one"; row: T } | { kind: "many"; rows: T[] };
export function findByScan<T extends BoardRow>(rows: readonly T[], scanned: string): ScanResult<T> {
  const code = normalizeCode(scanned);
  if (!code) return { kind: "none" };
  const hits = rows.filter((p) => [p.barcode, ...(p.alt_codes ?? [])].some((c) => c && normalizeCode(String(c)) === code));
  if (hits.length === 0) return { kind: "none" };
  return hits.length === 1 ? { kind: "one", row: hits[0] } : { kind: "many", rows: hits };
}

/**
 * مسحةُ الماسح اليدويّ (لوحة مفاتيح) تُهمَل حين:
 *   • نافذةٌ مفتوحة (منتقي «أضف منتجات لهذا القسم»، استوديو الصورة، مكتبةُ الصور…):
 *     الماسحُ يكتب ببحثها هي، وفتحُ بطاقة المنتج **فوقها** مع كلّ مسحةٍ يقطع شغلها؛
 *   • أو التركيزُ بحقلِ كتابةٍ غيرِ بحث اللوحة (سعرٌ بمراجعة الأسعار، اسمُ قسم): الأرقامُ
 *     دخلت الحقلَ فعلاً، وفتحُ البطاقة يغطّي ما صار فيه.
 * بحثُ اللوحة نفسُه مقصودٌ للمسح، والزرُّ أو مربّعُ الاختيار ليسا حقلَ كتابة.
 */
export interface ScanFocus { tag: string; type?: string | null; editable?: boolean; boardSearch?: boolean }
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"]);
export function scanBlocked(openModals: number, focus: ScanFocus | null): boolean {
  if (openModals > 0) return true;
  if (!focus || focus.boardSearch) return false;
  if (focus.editable) return true;
  const tag = focus.tag.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((focus.type || "text").toLowerCase());
  return false;
}

/**
 * إخفاءٌ لا يرجع بضغطة: منشورٌ ناقصُه إلزاميّ (صورة/سعر/صلاحية). قبل 0229 كان النشرُ
 * بسعرٍ وحده، فبقي منشوراً بلا صورة (قرارُ المالك ١: ٩٩ من ١١٣ بأكبر متجر). الإخفاءُ
 * يمرّ بلا شرط، أما الرجوعُ فمن `store_publish` بشروطها — فما بلا صورة لا يرجع إلا
 * بصورة. فهذا وحدَه يُسأل قبل إخفائه، والمكتملُ يُخفى بضغطةٍ كما كان.
 */
export const hideRisk = (p: BoardRow, todayISO?: string) => p.store_visible && !readiness(p, todayISO).ok;

/** ما يُقال قبل إخفاء مجموعة: كم منها لا يرجع، وبأوّل سببٍ ناقص — نفسُ عدّ `store_publish`
 *  للمتخطّى (صورة ثمّ سعر ثمّ انتهاء)، فالسؤالُ يقول ما سيقوله النشرُ لو جُرّب بعده. */
export function hideRiskSummary(rows: readonly BoardRow[], todayISO?: string): { risky: number; photo: number; price: number; expired: number } {
  const out = { risky: 0, photo: 0, price: 0, expired: 0 };
  for (const p of rows) {
    if (!p.store_visible) continue;
    const m = readiness(p, todayISO).missing[0];
    if (!m) continue;
    out.risky++; out[m]++;
  }
  return out;
}

/**
 * الاختيارُ الفعّال = المختارُ **الظاهرُ** وحدَه. كان «اختر الظاهر» يقارن عددَ المختار بعدد
 * الظاهر، فاختيارُ ثلاثةٍ بقسمٍ ثمّ الانتقالُ لقسمٍ فيه ثلاثةٌ أخرى يقول «ألغِ الاختيار» بعلامةٍ
 * مؤشَّرة — و«اخفِ» تمسّ ثلاثةً لا تراها الشاشة. فالعضويةُ بالمعرّف، والفعلُ على ما يُرى.
 */
export function pickedIn<T extends { id: string }>(visible: readonly T[], picked: ReadonlySet<string>): T[] {
  return picked.size ? visible.filter((p) => picked.has(p.id)) : [];
}
export function allPicked(visible: readonly { id: string }[], picked: ReadonlySet<string>): boolean {
  return visible.length > 0 && visible.every((p) => picked.has(p.id));
}

/** «كل المنتجات عدها صور ✓» حكمٌ على المخزن كلّه — فلا يُقال عن بحثٍ أو قسمٍ واحد
 *  صوره كاملة والعدّادُ ما زال يقول مئات بلا صورة. */
export const allPhotosDone = (filter: BoardFilter, q: string, secFilter: string) =>
  filter === "nophoto" && !q.trim() && secFilter === "all";

export type BoardSort = "work" | "name" | "shelf";

/**
 * ترتيبُ اللوحة:
 *   • work  — ما ينقصه شغلٌ أوّلاً: المنشورُ بلا صورة، ثمّ الجاهزُ غيرُ المنشور،
 *             ثمّ الباقي — فالمهمّ يتصدّر بلا أن يُبحث عنه.
 *   • shelf — كما يراه الزبون: المميّزُ ثمّ ترتيبُ القسم اليدويّ ثمّ الاسم
 *             (مرآةُ `store_catalog2` بالخادم).
 *   • name  — أبجديّ.
 */
export function sortBoard<T extends BoardRow>(rows: readonly T[], mode: BoardSort, todayISO?: string, sectionOrder?: ReadonlyMap<string, number>): T[] {
  const arr = [...rows];
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id);
  if (mode === "name") return arr.sort(byName);
  if (mode === "shelf") {
    const sec = (p: T) => (p.store_section_id && sectionOrder?.has(p.store_section_id) ? sectionOrder.get(p.store_section_id)! : Number.MAX_SAFE_INTEGER);
    const ord = (p: T) => (p.store_sort ?? Number.MAX_SAFE_INTEGER);
    return arr.sort((a, b) => Number(b.store_featured) - Number(a.store_featured) || sec(a) - sec(b) || ord(a) - ord(b) || byName(a, b));
  }
  const rank = (p: T) => {
    if (p.store_visible && !hasPhoto(p)) return 0;
    if (!p.store_visible && readiness(p, todayISO).ok) return 1;
    if (!hasPhoto(p)) return 2;
    return p.store_visible ? 4 : 3;
  };
  return arr.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** ترتيبُ قسمٍ بعد نقل عنصرٍ خطوة (−١ للأعلى، +١ للأسفل) أو إلى البداية. */
export function moveInOrder(ids: readonly string[], id: string, to: "up" | "down" | "top"): string[] {
  const i = ids.indexOf(id);
  if (i < 0) return [...ids];
  const out = [...ids];
  out.splice(i, 1);
  const j = to === "top" ? 0 : to === "up" ? Math.max(0, i - 1) : Math.min(out.length, i + 1);
  out.splice(j, 0, id);
  return out;
}

/** قسمٌ اسمُه يطابق آخرَ بعد التطبيع — «اكل قطط» و«أكل قطط» قسمٌ واحد. مرآةُ `search_norm` بالقاعدة. */
export const sectionKey = (name: string) => searchable(name.trim());

export const SECTION_NAME_MAX = 40;
export const SECTIONS_CAP = 60;
/** سقفُ الوصف بالواجهة — الخادمُ يقبل ٢٠٠٠، والبطاقةُ تعرض سطرين والتفاصيلُ الباقي. */
export const DESC_MAX = 600;

export type SectionProblem = "empty" | "long" | "dup" | null;
export function sectionNameProblem(name: string, existing: readonly { id: string; name: string; archived_at?: string | null }[], selfId?: string): SectionProblem {
  const n = name.trim();
  if (!n) return "empty";
  if (n.length > SECTION_NAME_MAX) return "long";
  const k = sectionKey(n);
  // المؤرشفُ يُحسب أيضاً — مرآةُ store_section_save: قسمٌ مؤرشفٌ بنفس الاسم يُسترجع ولا يُنشأ ثانيه.
  if (existing.some((s) => s.id !== selfId && sectionKey(s.name) === k)) return "dup";
  return null;
}
