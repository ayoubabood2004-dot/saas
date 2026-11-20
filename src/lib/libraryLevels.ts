// ============================================================================
// مستوياتُ مكتبة الصور (0284): شركة ← صنف ← وكالة ← قسم — تجميعٌ واحد لشاشة المشغّل ومنتقي العيادة.
//
// النصوصُ حرّة (0175)، فالمقارنةُ بمفتاح المجموعة نفسِه الذي يطوي أسماءَ الشركات بالمخزون (`groupKey`):
// «اليف هاوس» و«اليف  هاوس» شركةٌ واحدة لا توأمان. والفارغُ مستوىً قائمٌ بذاته («بلا وكالة») لا يُرمى —
// صفوفُ ما قبل 0284 كلُّها بلا صنفٍ ولا وكالة، وتبقى ظاهرةً تحت «بلا…».
// ============================================================================
import { groupKey } from "./utils";
import type { LibraryImage } from "@/types";

export const LEVELS = ["company", "kind", "agency", "section"] as const;
export type Level = (typeof LEVELS)[number];
/** مسارٌ بالمكتبة: لكلّ مستوىً مختار مفتاحُه (`""` = «بلا»)، وغيرُ المختار غائب. */
export type LibPath = Partial<Record<Level, string>>;

export const valueOf = (r: LibraryImage, level: Level): string | null => {
  const v = (r[level] ?? "").trim();
  return v || null;
};
export const keyOfValue = (v: string | null): string => (v == null ? "" : groupKey(v));

/** الصفوفُ تحت المسار — كلُّ مستوىً مختار يطابق بمفتاحه. */
export function under(rows: LibraryImage[], path: LibPath): LibraryImage[] {
  const chosen = LEVELS.filter((l) => path[l] !== undefined);
  if (chosen.length === 0) return rows;
  return rows.filter((r) => chosen.every((l) => keyOfValue(valueOf(r, l)) === path[l]));
}

export interface LevelChild { key: string; label: string | null; count: number }

/** أبناءُ المستوى التالي تحت المسار: الاسمُ كما كُتب أوّلَ مرّة، والعدد، والمسمّى قبل «بلا». */
export function childrenOf(rows: LibraryImage[], path: LibPath, level: Level): LevelChild[] {
  const m = new Map<string, LevelChild>();
  for (const r of under(rows, path)) {
    const v = valueOf(r, level);
    const k = keyOfValue(v);
    const c = m.get(k);
    if (c) c.count++;
    else m.set(k, { key: k, label: v, count: 1 });
  }
  return [...m.values()].sort((a, b) =>
    a.label == null ? 1 : b.label == null ? -1 : a.label.localeCompare(b.label, "ar"));
}

/** أوّلُ مستوىً لم يُختر بعد (null = المسارُ كامل حتى القسم). */
export function nextLevel(path: LibPath): Level | null {
  return LEVELS.find((l) => path[l] === undefined) ?? null;
}

/** المسارُ مقطوعاً عند مستوى (للرجوع بفتات الخبز): المستوى نفسُه وما قبله يبقيان. */
export function cutAt(path: LibPath, level: Level | null): LibPath {
  if (level == null) return {};
  const out: LibPath = {};
  for (const l of LEVELS) {
    if (path[l] !== undefined) out[l] = path[l];
    if (l === level) break;
  }
  return out;
}
