/* ============================================================================
 * حارسُ لغةِ الزائر — «الشكلُ يبدو سليماً، وهذا ما يجعل العطل يمرّ بلا أن يُرى».
 *
 * الصفحاتُ العامّة (مسارٌ بلا `<Protected>`) يفتحها زبونٌ عراقيٌّ بهاتفه بلا
 * جلسةٍ ولا تفضيلِ لغة. و`i18n` تفتح على ما بـ`vp_lang` — وهو فارغٌ عنده —
 * فتقع على الافتراض. و`preferArabicForVisitor()` هي التي تعرّب **بلا أن
 * تكتب تفضيلاً**، فمن اختار الإنكليزية صراحةً يبقى عليها.
 *
 * والعطبُ الذي يمسكه هذا الحارس: صفحةٌ تفرض `dir="rtl"` على حاويتها ولا
 * تنادي الدالّة. الإطارُ يصير عربياً والنصوصُ إنكليزية — يبدو سليماً بالنظرة
 * الأولى فلا يبلّغ عنه أحد. كانت `StoreTrack` كذلك (رفعها التدقيق)،
 * و`TrackJourney` كذلك (**لم يرفعها أحد** — وجدها هذا الحارسُ أوّلَ تشغيل).
 *
 *   node scripts/visitor-lang-guard.mjs
 * ==========================================================================*/
import fs from "node:fs";

const APP = fs.readFileSync("src/App.tsx", "utf8");
const CALL = "preferArabicForVisitor()";

/* المساراتُ العامّة: `<Route path=… element={<X …/>}` بلا `<Protected>` بالعنصر.
 * نقرأ App.tsx نفسَها لا قائمةً بيد — قائمةٌ بيدٍ تتقادم بصمتٍ عند أوّل مسارٍ جديد. */
const routes = [...APP.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)]
  .map(([, path, element]) => ({ path, element: element.trim() }));
if (routes.length < 5) {
  console.error(`   ✗ visitor-lang-guard: ما انقرأت المسارات من App.tsx (${routes.length}) — تبدّلت الصيغة؟`);
  process.exit(1);
}

const publicRoutes = routes.filter((r) => !r.element.includes("<Protected>"));
/* استثناءاتٌ **بالاسم والسبب** — لا بصمت. الحارسُ يقيس «صفحةٌ يفتحها زبونٌ
 * بلا جلسة»، وهذه مساراتٌ عامّةٌ بالتوجيه وليست كذلك بالمعنى:
 *
 *  • `*`      — مسارُ الالتقاط، ليس صفحةً يقرؤها أحد.
 *  • `/join`  — دخولُ **كادرٍ** بدعوة (تستعمل `useAuth`، ولا تفرض `dir`).
 *               تعريبُها قرارٌ آخر: تقلب لغةَ موظّفٍ بلا `vp_lang`، لا لغةَ
 *               زبونٍ يتصفّح متجراً. **بانتظار كلمة المالك** — وإن قال «عرّبها»
 *               فالإصلاحُ سطرٌ واحد وحذفُ هذا السطر.
 */
const IGNORE = new Set(["*", "/join"]);

let bad = 0, checked = 0;
for (const r of publicRoutes) {
  if (IGNORE.has(r.path)) continue;
  const comp = /<([A-Z][A-Za-z0-9]*)/.exec(r.element)?.[1];
  if (!comp) continue;
  // اسمُ المكوّن ⇐ ملفُّه من سطر الاستيراد الكسول بأعلى App.tsx.
  const imp = new RegExp(`const ${comp} = page\\(\\(\\) => import\\("@/pages/([^"]+)"`).exec(APP);
  if (!imp) continue;
  const file = `src/pages/${imp[1]}.tsx`;
  if (!fs.existsSync(file)) continue;
  checked++;
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes(CALL)) {
    bad++;
    console.error(`   ✗ ${file} — صفحةٌ عامّة (${r.path}) بلا ${CALL}`);
    console.error(`       زائرٌ بلا تفضيلِ لغة يراها بلغة الافتراض، ولو فرضتَ dir="rtl" على حاويتها.`);
  }
}

if (checked === 0) {
  console.error("   ✗ visitor-lang-guard: ما فُحصت صفحةٌ واحدة — الحارسُ يقيس لا شيء.");
  process.exit(1);
}
if (bad) process.exit(1);
console.log(`✓ visitor-lang-guard: ${checked} صفحةً عامّةً كلُّها تنادي ${CALL}.`);
