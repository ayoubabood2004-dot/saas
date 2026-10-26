/* ============================================================================
 * تحميلُ محتوى الموقع ساعةَ البناء: العربيةُ البيضاء أو الإنكليزية، وفوقها طبقةُ لهجة النسخة.
 * الطبقةُ جزئية: ما تذكره يحلّ محلّ الأساس، وما لا تذكره يبقى أبيض. والقوائمُ (المصفوفات)
 * بطولها نفسِه تُدمج عنصراً عنصراً، و`null` عنصرٌ كما بالأساس — والحارسُ يرفض أيَّ نسخةٍ من الأساس
 * بالطبقة، لأنها تبقى قديمةً بصمت حين يُصحَّح الأساس.
 * ==========================================================================*/
import type { DialectId, FeatureSlug, Lang, SiteContent } from "./types";
import { FEATURE_SLUGS } from "./types";

const FILES = import.meta.glob("./content/**/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

function file(path: string): unknown {
  return FILES[`./content/${path}.json`];
}
function must(path: string): unknown {
  const v = file(path);
  if (v === undefined) throw new Error(`site content missing: ${path}.json`);
  return v;
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  // القائمةُ بطول الأساس تُدمج عنصراً عنصراً (null = كما بالأساس): الطبقةُ تحمل سؤالَ اللهجة وحده،
  // وجوابُ الفصحى يأتي من الأساس دائماً — نسخةٌ منه بالطبقة كانت ستبقى قديمةً حين يُصحَّح الأساس.
  if (Array.isArray(base) && Array.isArray(over) && over.length === base.length) return base.map((b, i) => deepMerge(b, over[i])) as T;
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== "object" || typeof over !== "object") return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (k.startsWith("$")) continue;
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function contentFor(lang: Lang, dialect: DialectId | null): SiteContent {
  const page = <T,>(name: string): T => {
    const base = must(`${lang}/${name}`) as T;
    return lang === "ar" && dialect ? deepMerge(base, file(`dialects/${dialect}/${name}`)) : base;
  };
  const feature = {} as Record<FeatureSlug, SiteContent["feature"][FeatureSlug]>;
  for (const slug of FEATURE_SLUGS) feature[slug] = page(`features/${slug}`);
  return {
    common: page("common"),
    home: page("home"),
    pricing: page("pricing"),
    features: page("features"),
    feature,
    faq: page("faq"),
    security: page("security"),
    start: page("start"),
    privacy: page("privacy"),
    terms: page("terms"),
  };
}
