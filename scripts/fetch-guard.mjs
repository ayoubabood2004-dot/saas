/* ============================================================================
 * حارس الجلب — «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» (CLAUDE.md §٣).
 *
 * الحقيقةُ الحاملة: `postgrest-js` يحوّل حتى فشلَ الشبكة إلى `res.error` لا إلى
 * رمية، ولا `throwOnError` بالمستودع كلِّه. فدالّةُ ريبو ترجع `[]` على الخطأ
 * تجعل كلَّ `catch` عند مستهلكيها **ميّتاً** — والفشلُ يصل «نجاحاً فارغاً»،
 * فتُقال «ماكو» عن موجود: مرتجعٌ يُرفض، وإيصالٌ يُطبع بلا سطور، وسلّةُ محذوفاتٍ
 * تبدو فارغةً فيُعاد إدخالُ المحذوف توأماً.
 *
 * فحصان ساكنان:
 *  ١) قوائمُ القرار المسمّاة أدناه لا تمرّ بـ`listOf` — تمرّ بـ`listOrThrow`
 *     أو `allPages` أو `need`.
 *  ٢) لا `.catch(() => [])` ولا `.catch(() => {})` جديدةً بالشاشات الحرجة.
 *
 * والاستثناءُ ممكنٌ لكنه **مرئيٌّ ومكتوبٌ سببُه**: وسمُ السطر بـ
 * `/* swallow-ok: <السبب> *\/`.
 *
 *   node scripts/fetch-guard.mjs
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";

/** قوائمُ يُبنى عليها قرارُ مالٍ أو استرجاعٍ أو طباعةٍ — فشلُها يُرمى لا يُبلع. */
const DECISION_LISTS = [
  "listInvoiceItems",
  "listPurchaseItems",
  "searchInvoices",
  "listDeletedProducts",
  "listStoreOrders",
  "addGeneratedBarcodes",
  // منتقي المكتبة: فشلٌ صامتٌ يقول «ما بيها صور» فيصوّر المستخدمُ المادّةَ
  // من جديد — والصورةُ موجودة. قائمةٌ يُبنى عليها فعلٌ، فترمي (البند ٢٠).
  "listImageLibrary",
  // بحثُ الزبون بالبيع والقسمُ بالتقارير (0232): «ماكو زبون» عن موجودٍ يجعل الكاشير
  // يكتبه من جديد، و«ماكو زبائن» بالتقارير قائمةٌ ناقصةٌ تُصدَّق — فترمي.
  "findCustomers",
  // تمديدُ الخطة يقرأ آخرَ يومٍ من القاعدة قبل أن يكتب: قائمةٌ ناقصة تمدّد يوماً غيرَ الأخير.
  "listVisitTreatments",
];

/** شاشاتٌ فشلُها يقلب قراراً — لا تبتلع بها فشلاً بلا سببٍ مكتوب. */
const CRITICAL_SCREENS = [
  "src/pages/Inventory.tsx",
  "src/pages/ClinicStore.tsx",
  "src/components/inventory/Purchases.tsx",
  "src/components/inventory/SupplierLedger.tsx",
  "src/components/inventory/CompanyStatement.tsx",
  "src/components/inventory/BarcodeStudio.tsx",
  "src/components/retail/ReturnsPanel.tsx",
  "src/components/retail/InvoicesPanel.tsx",
  // «خصم على الدين» (0241): حسابُ الزبون الناقص يقول «ما خصمنا له قبل» عن موجود — والنافذةُ تحجب الحفظ حتى يكتمل.
  "src/components/retail/ForgiveDialog.tsx",
  "src/components/retail/usePrintInvoice.ts",
  // شاشةُ البيع وبحثُ زبونها (0232): «ماكو زبون» عن خطأٍ يجعل الكاشير يكتب زبوناً موجوداً
  // من جديد، و«لا توجد حيوانات» عن خطأٍ تُخبَّأ طولَ الجلسة.
  "src/components/retail/SaleBuilder.tsx",
  "src/components/retail/CustomerSearch.tsx",
];

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const WAIVER = /\/\*\s*swallow-ok:/;
let bad = 0;
const say = (file, line, msg) => { bad++; console.error(`   ✗ ${file}:${line} — ${msg}`); };

/* ── ١) قوائمُ القرار لا تمرّ بالبلّاعة ─────────────────────────────────── */
const repoSrc = fs.readFileSync("src/lib/repo.ts", "utf8").split(/\r?\n/);
for (const name of DECISION_LISTS) {
  // نبحث عن تعريف الدالّة ثم نفحص جسمها حتى الإغلاق بمستوى المِلكية
  for (let i = 0; i < repoSrc.length; i++) {
    if (repoSrc[i].trim() !== `async ${name}(` && !repoSrc[i].trim().startsWith(`async ${name}(`)) continue;
    let depth = 0, started = false;
    for (let j = i; j < repoSrc.length && j < i + 40; j++) {
      const line = repoSrc[j];
      if (/\blistOf\s*</.test(line) && !WAIVER.test(line)) {
        say("src/lib/repo.ts", j + 1, `\`${name}\` قائمةُ قرارٍ تمرّ بـlistOf — استعمل listOrThrow أو allPages (أو وسّمها /* swallow-ok: السبب */)`);
      }
      for (const ch of line) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
      if (started && depth <= 0) break;
    }
  }
}

/* ── ٢) لا ابتلاعَ صامتاً بالشاشات الحرجة ──────────────────────────────── */
const SWALLOW = /\.catch\s*\(\s*\(\s*\)\s*=>\s*(\[\s*\]|\{\s*\}|null|undefined)\s*\)/;
/* ونفسُ الابتلاع بصيغة `try/catch`: `catch { setX([]) }` يكتب «ماكو» مكانَ «ما وصلنا»
 * (بحثُ الزبون ومنتقي الحيوانات بشاشة البيع كانا هكذا — 0232). */
const CATCH_EMPTY = /catch\s*(\([^)]*\))?\s*\{\s*set\w+\(\s*\[\s*\]\s*\)/;
/* وبصيغة الوعد: `.catch(() => { if (alive) setItems([]); })` — سطورُ الفاتورة بتفاصيلها كانت هكذا، وصارت
 * تُقرأ لثلاثة قراراتِ مال (تحذيرُ الكلفة الصفرية بالخصم، و«ترجع للرف»، والوصلُ المطبوع) — 0241. */
const PROMISE_EMPTY = /\.catch\s*\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*(?:if\s*\([^)]*\)\s*)?set\w+\(\s*\[\s*\]\s*\)/;
for (const f of CRITICAL_SCREENS) {
  if (!fs.existsSync(f)) { console.error(`   ✗ ${f} — مفقود من قائمة الحارس (حدِّث القائمة أو أعد الملف)`); bad++; continue; }
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (SWALLOW.test(line) && !WAIVER.test(line)) {
      say(f, i + 1, "ابتلاعٌ صامت `.catch(() => …)` — اعرض «تعذّر — أعد المحاولة» أو وسّمه /* swallow-ok: السبب */");
    }
    if (PROMISE_EMPTY.test(line) && !WAIVER.test(line)) {
      say(f, i + 1, "`.catch(() => { setX([]) })` يكتب قائمةً فارغةً عن خطأ — احفظ الفشلَ حالةً واعرض «أعد المحاولة» أو وسّمه /* swallow-ok: السبب */");
    }
    if (CATCH_EMPTY.test(line) && !WAIVER.test(line)) {
      say(f, i + 1, "`catch { setX([]) }` يكتب قائمةً فارغةً عن خطأ — اعرض «تعذّر — أعد المحاولة» أو وسّمه /* swallow-ok: السبب */");
    }
  });
}

if (bad) {
  console.error(`\n✗ fetch-guard: ${bad} موضعاً يبلع الفشل. قائمةٌ ناقصة أخطرُ من خطأ ظاهر — الخطأ يُرى ويُعاد، والنقصُ يُصدَّق.\n`);
  process.exit(1);
}
console.log(`✓ fetch-guard: ${DECISION_LISTS.length} قائمةَ قرارٍ ترمي، و${CRITICAL_SCREENS.length} شاشةً حرجةً بلا ابتلاعٍ صامت.`);
