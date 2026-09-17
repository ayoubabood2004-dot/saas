/* ============================================================================
 * توليدُ قاموس الزائر — `src/i18n/store.ar.json`.
 *
 * `ar.json` كاملاً **٧٢ كيلو مضغوطة**: نصوصُ الرواتب والمختبر والأقفاص
 * والفوترة، ولا سطرَ منها يُقرأ بصفحة زبونٍ يشتري شامبو قطط. والأقسامُ التي
 * تمسّها صفحاتُ الزائر ستّةٌ لا أكثر ⇒ **٦٫٤ كيلو**.
 *
 * والتوليدُ من `ar.json` نفسِه لا نسخاً يدويّاً: مفتاحٌ يُعدَّل بالأصل يتبعه
 * الملفُّ المولَّد، و`--check` يفشّل البناءَ إن بارَ. (نسختان تنحرفان أخطرُ
 * من نسخةٍ ثقيلة — قاعدةُ المشروع.)
 *
 *   node scripts/store-i18n.mjs          يكتب
 *   node scripts/store-i18n.mjs --check  يتحقّق فقط
 * ==========================================================================*/
import { readFileSync, writeFileSync } from "node:fs";

/* الأقسامُ التي تمسّها `Storefront` و`StoreTrack` و`TrackJourney` وما
 * تستوردُه (`errors.ts` تنادي `auth.*`). إضافةُ قسمٍ هنا قرارٌ واعٍ يُقاس. */
export const STORE_NS = ["sf", "track", "portal", "errors", "auth", "common"];
const OUT = "src/i18n/store.ar.json";

const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const missing = STORE_NS.filter((k) => !(k in ar));
if (missing.length) { console.error(`✗ store-i18n: أقسامٌ غير موجودة بـar.json: ${missing.join(", ")}`); process.exit(1); }

const subset = {};
for (const k of STORE_NS) subset[k] = ar[k];
const text = `${JSON.stringify(subset, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let cur = null;
  try { cur = readFileSync(OUT, "utf8"); } catch { /* غير موجود */ }
  if (cur !== text) {
    console.error(`✗ store-i18n: ${OUT} بارَ عن ar.json — شغّل: node scripts/store-i18n.mjs`);
    process.exit(1);
  }
  const keys = STORE_NS.reduce((n, k) => n + Object.keys(ar[k]).length, 0);
  console.log(`✓ store-i18n: قاموسُ الزائر مطابقٌ لـar.json (${STORE_NS.length} أقسام، ${keys} مفتاحاً).`);
} else {
  writeFileSync(OUT, text);
  console.log(`✓ store-i18n: كُتب ${OUT}`);
}
