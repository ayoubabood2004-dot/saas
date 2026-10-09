/* ============================================================================
 * ملفُّ التراجع يعيد أجساماً قديمة **حرفاً** — وهذا الفحصُ يقارن كلَّ جسمٍ بأصله.
 *
 *     node scripts/rollback-copy-check.mjs supabase/tests/rollback_0229.sql supabase/migrations
 *
 * كلُّ كتلةٍ تبدأ بسطرِ «-- <اسم> من NNNN (حرفاً)» وتنتهي قبل السطر الفارغ التالي الذي
 * يليه تعليق؛ نصُّها يجب أن يوجد كما هو داخل `NNNN_*.sql`. نسخةٌ يدويّةٌ تنحرف بصمت —
 * وتراجعٌ يعيد جسماً «قريباً من القديم» أسوأُ من لا تراجع: يُصدَّق.
 * يطبع `ok:<عدد الكتل>` أو سببَ الفشل (والحزمةُ تقارن النصّ).
 * ==========================================================================*/
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [file, migDir] = process.argv.slice(2);
if (!file || !migDir) { console.error("usage: rollback-copy-check.mjs <rollback.sql> <migrations-dir>"); process.exit(2); }
const src = readFileSync(file, "utf8");
const migs = readdirSync(migDir);
const head = /^-- (.+?) من (\d{4}) \(حرفاً\)\n/gm;
const marks = [...src.matchAll(head)];
if (!marks.length) { console.log("no-blocks"); process.exit(1); }
const bad = [];
marks.forEach((m, i) => {
  const start = m.index + m[0].length;
  const end = i + 1 < marks.length ? marks[i + 1].index : src.indexOf("\n-- ──", start);
  const body = src.slice(start, end < 0 ? undefined : end).trim();
  const mig = migs.find((f) => f.startsWith(m[2] + "_"));
  if (!mig) { bad.push(`${m[1]}: no migration ${m[2]}`); return; }
  if (!readFileSync(join(migDir, mig), "utf8").includes(body)) bad.push(`${m[1]}: differs from ${mig}`);
});
if (bad.length) { console.log(bad.join("; ")); process.exit(1); }
console.log(`ok:${marks.length}`);
