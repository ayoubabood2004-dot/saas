/* ============================================================================
 * أرشفةُ أدوية النظام (0280) — الصِّرفُ: الحالة، ومن يُخفى من المنتقي، وخطّتا الأرشفة والترجيع. بلا شبكةٍ ولا React (تقوده فحوصُ node).
 *
 * الدواءُ بالمنتقي يأتي من ثلاثة: كتالوجُ النظام (والدليلُ فوقه بالطبلة)، وصفوفُ العيادة، والمخزن. ما للعيادة صفٌّ له يُؤرشف
 * بصفّه (0229 — يبقى كما كان)؛ وما هو من النظام يُخفى **باسمه** (`clinic_drug_hidden`) أو بزرّ «قائمة النظام مخفيّة» (`catalog_off`):
 *  • المخفيُّ بالاسم يختفي ولو كان له صفٌّ (نجمةٌ قديمة أو تصنيفٌ أو سعرُ جرعة) — والترجيعُ يعيده بمكانه، لأن الصفَّ لم يُمسّ.
 *  • زرُّ القائمة يُخفي من النظام **ما ليس للعيادة**: ما له صفٌّ حيّ (أضافته، نجّمته، صنّفته، سعّرته) أو رصيدٌ بالمخزن يبقى —
 *    عيادةٌ تبني قائمتها لا تفقد دواءً على رفّها.
 *  • المخزنُ وحده (منتجٌ بلا اسمٍ بالكتالوج) لا يُخفى أبداً: بضاعةٌ لا كتالوج (كإخفاء العائلة، 0268).
 * والسجلّاتُ القديمة لا تُمسّ: الإخفاءُ خيارُ عرض.
 * ==========================================================================*/

export interface DrugArchive {
  /** الجدولان موجودان (الهجرةُ نزلت). false ⇒ الميزةُ مخفيّة والقائمةُ كما كانت. */
  ready: boolean;
  /** قائمةُ النظام مخفيّة. */
  off: boolean;
  /** المخفيُّ بالاسم: مفتاحُ searchable(name) ⇒ الاسمُ ولحظةُ إخفائه. */
  hidden: ReadonlyMap<string, { name: string; at: string }>;
}
export const NO_ARCHIVE: DrugArchive = { ready: false, off: false, hidden: new Map() };

/** صفوفُ الجدولين كما يرجعها الخادم ⇒ الحالة. شكلٌ مكسور يرمي — لا قائمةٌ «بلا مخفيّ» تُصدَّق. */
export function readArchive(cat: readonly unknown[], rows: readonly unknown[]): DrugArchive {
  const bad = () => { throw new Error("drug_archive_shape"); };
  const c = cat[0] as { catalog_off?: unknown } | undefined;
  if (c !== undefined && (typeof c !== "object" || c === null || typeof c.catalog_off !== "boolean")) bad();
  const hidden = new Map<string, { name: string; at: string }>();
  for (const r of rows) {
    const x = r as { name_key?: unknown; name?: unknown; hidden_at?: unknown } | null;
    if (!x || typeof x.name_key !== "string" || !x.name_key || typeof x.name !== "string" || typeof x.hidden_at !== "string") bad();
    hidden.set(x!.name_key as string, { name: x!.name as string, at: x!.hidden_at as string });
  }
  return { ready: true, off: c?.catalog_off === true, hidden };
}

export type HiddenBy = "name" | "catalog";
export interface ArchivableItem { key: string; name: string; base: string; drugId?: string; products: readonly unknown[] }

/** لماذا يُخفى هذا من المنتقي (أو لا). */
export function hiddenBy(it: ArchivableItem, a: DrugArchive | null | undefined): HiddenBy | null {
  if (!a || it.base === "stock") return null;
  if (a.hidden.has(it.key)) return "name";
  if (a.off && (it.base === "catalog" || it.base === "formulary") && !it.drugId && it.products.length === 0) return "catalog";
  return null;
}

export const isSystem = (it: Pick<ArchivableItem, "base">) => it.base === "catalog" || it.base === "formulary";

/** أرشفةُ ما اختاره الطبيب: ما للعيادة صفُّه (أضافته بنفسها) يُؤرشف بصفّه، وما من النظام يُخفى باسمه. والأخيرةُ والمخزنُ لا. */
export function archivePlan(items: readonly Pick<ArchivableItem, "name" | "base" | "drugId">[]): { hideNames: string[]; archiveIds: string[] } {
  const hideNames: string[] = [], archiveIds: string[] = [];
  for (const it of items) {
    if (isSystem(it)) hideNames.push(it.name);
    else if (it.base === "custom" && it.drugId) archiveIds.push(it.drugId);
  }
  return { hideNames, archiveIds };
}

export type ArchivedEntry =
  | { kind: "name"; key: string; name: string; at: string }
  | { kind: "row"; key: string; name: string; at: string; id: string }
  | { kind: "catalog"; key: string; name: string };

/** «المؤرشفة» بقائمةٍ واحدة: المخفيُّ بالاسم أوّلاً (الأحدث فوق)، ثمّ صفوفُ العيادة المؤرشفة (الأحدث فوق، وصفٌّ لكلّ اسم —
 *  واسمٌ له صفٌّ حيّ أو مخفيٌّ بالاسم لا يتكرّر)، ثمّ ما أخفاه زرُّ القائمة بترتيب الاسم. */
export function archivedEntries(
  a: DrugArchive,
  rows: readonly { id: string; name: string; archived_at: string | null }[],
  catalogHidden: readonly { key: string; name: string }[],
  keyOf: (name: string) => string,
): ArchivedEntry[] {
  const out: ArchivedEntry[] = [];
  const seen = new Set<string>();
  for (const [key, v] of [...a.hidden].sort((x, y) => (x[1].at < y[1].at ? 1 : x[1].at > y[1].at ? -1 : 0))) {
    out.push({ kind: "name", key, name: v.name, at: v.at });
    seen.add(key);
  }
  const live = new Set(rows.filter((r) => r.archived_at == null).map((r) => keyOf(r.name)));
  for (const r of rows.filter((x) => x.archived_at != null).sort((x, y) => ((x.archived_at as string) < (y.archived_at as string) ? 1 : -1))) {
    const key = keyOf(r.name);
    if (!key || seen.has(key) || live.has(key)) continue;
    seen.add(key);
    out.push({ kind: "row", key, name: r.name, at: r.archived_at as string, id: r.id });
  }
  for (const c of [...catalogHidden].sort((x, y) => x.name.localeCompare(y.name))) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ kind: "catalog", key: c.key, name: c.name });
  }
  return out;
}

/** ترجيعُ ما اختاره: المخفيُّ بالاسم يُرجع باسمه، والصفُّ المؤرشف يُسترجع، وما أخفاه زرُّ القائمة يصير للعيادة (صفٌّ حيّ خارج
 *  «أدويتي») فيبقى ظاهراً والقائمةُ مخفيّة. */
export function restorePlan(entries: readonly ArchivedEntry[]): { unhideNames: string[]; restoreIds: string[]; keepNames: string[] } {
  const unhideNames: string[] = [], restoreIds: string[] = [], keepNames: string[] = [];
  for (const e of entries) {
    if (e.kind === "name") unhideNames.push(e.name);
    else if (e.kind === "row") restoreIds.push(e.id);
    else keepNames.push(e.name);
  }
  return { unhideNames, restoreIds, keepNames };
}

export function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
/** حدُّ الخادم لدفعة الإخفاء (clinic_drug_hide) — ودفعةُ عمليات «أدويتي» ٢٠٠ (MAX_OPS). */
export const HIDE_BATCH = 500;
