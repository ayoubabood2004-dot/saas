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
 *     أو `allPages` أو `need` (وبباب المستهلكات `rpcJson`) — ولا تبلع فشلَها بـ`.catch`.
 *     وكلُّ اسمٍ بالقائمة يجب أن يُلقى معرَّفاً: اسمٌ لا يُلقى فحصٌ لم يجرِ.
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
  // سجلُّ تسديدات فاتورة الشراء: فارغٌ عن خطأ يقول «ما سدّدنا شي» عن فاتورةٍ سُدّدت.
  "listPurchasePayments",
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
  // مستهلكاتُ الخدمات (0252، consumptionApi.ts): وصفةٌ فارغةٌ عن خطأ تُحفظ فوق الحقيقية، وملخّصٌ فارغ
  // يحذف خدمةً بوصفتها بضغطة، وصرفُ فاتورةٍ فارغ يسكت عن نقصٍ ولا يملأ سندَ التلف، وتقريرٌ فارغ أصفار.
  "recipeGet",
  "recipeSummary",
  "invoiceConsumption",
  "reportConsumables",
];

/** ملفّاتٌ تُعرَّف بها قوائمُ القرار: الريبو، وبابُ المستهلكات الكسول (خارجه لأن الريبو بحزمة الإقلاع). */
const DECISION_SOURCES = ["src/lib/repo.ts", "src/lib/consumptionApi.ts"];

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
  // دفترُ الديون: طلباتُ التوصيل تفرز مالَ المندوب عن دين الزبون — «ماكو طلبات» عن خطأٍ
  // يُهبط ما دفعه الزبونُ للمندوب ديناً عليه، فيُطالَب بمالٍ دفعه.
  "src/components/retail/DebtsPanel.tsx",
  // مطابقةُ الصندوق: «ماكو فواتير» عن خطأٍ يرسم مفروضاً صفراً، وزرُّ التأكيد يحفظ العدَّ كلَّه
  // «زيادة» باسم الكاشير. الفشلُ بطاقةُ إعادةٍ والتأكيدُ محجوب حتى يكتمل الجلب.
  "src/components/retail/CashReconcile.tsx",
  // تعديلُ طلب التوصيل والفاتورة (0110): الحفظُ يستبدل سطورَ الفاتورة كلَّها، ومنها ما يستلمه السائق (الإجمالي الجديد
  // − المدفوع) وحارسُ المخزون (الحاجةُ الإضافية مقابل الرصيد + حوض القسم). سطورٌ فارغةٌ عن خطأ يُضاف لها الصنفُ
  // المطلوب فتُحفظ فاتورةً بلا ما كان فيها — يرجع للمخزن ما خرج، ويُحسب ما يستلمه السائق على صنفٍ واحد.
  "src/components/retail/DeliveryEditDialog.tsx",
  // مستهلكاتُ الخدمات (0252–0254): محرّرُ الوصفة (موادُّ ناقصة = «ماكو مادة» عن موجودٍ يُضاف توأماً أو
  // وصفةٌ تُحفظ ناقصة)، وورقةُ السطر وإشعارُها (فشلٌ صامت = «ما انصرف شي» والرصيدُ تحت الصفر)،
  // وتبويبُ التلف (صرفُ فاتورةٍ فارغ عن خطأ = موادُّ رجعت للمخزن ولا تُشطب، وبطاقاتُ التقرير أصفار).
  "src/components/settings/RecipeEditor.tsx",
  "src/components/retail/ConsumablesSheet.tsx",
  "src/components/stock/WasteTab.tsx",
  // الجردُ وسنداتُ التلف (0216، 0254): الموافقةُ تُرحّل الرصيد وتكتب الخسارة — معلَّقاتٌ فارغةٌ عن خطأ تقول «ماكو
  // شي ينتظر» فيبقى الفرقُ بلا قرار، ومنتجاتٌ فارغةٌ عن خطأ تُخفي ما يُعدّ.
  "src/pages/StockCount.tsx",
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

/* ── أنماطُ الابتلاع (يقرؤها الفحصان) ─────────────────────────────────── */
/* والصبُّ لا يغيّر المعنى: `.catch(() => [] as PurchaseItem[])` هو `.catch(() => [])` بثوبٍ
 * يرضي tsc — وبه نجت تفاصيلُ فاتورة الشراء: فشلُ `listPurchaseItems` صار «فاتورةٌ بلا بضاعة»
 * تُطبع ناقصةً ويفتح «تعديل» بنّاءها بلا سطور. ومثلُه وسيطٌ مُسمّى (`(e) =>` و`e =>`).
 * ومثلُه الخريطةُ الفارغة `({})`: ملخّصُ الوصفات أو صرفُ الفواتير خريطةٌ لا مصفوفة (0252)، و`{}` عن
 * خطأ يقول «ماكو وصفة» فتُحذف خدمةٌ بوصفتها بضغطة، و«ما انصرف شي» عن فاتورةٍ صرفت. */
const SWALLOW = /\.catch\s*\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\[\s*\]|\{\s*\}|\(\s*\{\s*\}\s*\)|null|undefined)(?:\s+as\s+[^)]+)?\s*\)/;
/* ونفسُ الابتلاع بصيغة `try/catch`: `catch { setX([]) }` يكتب «ماكو» مكانَ «ما وصلنا»
 * (بحثُ الزبون ومنتقي الحيوانات بشاشة البيع كانا هكذا — 0232). */
const CATCH_EMPTY = /catch\s*(\([^)]*\))?\s*\{\s*set\w+\(\s*\[\s*\]\s*\)/;
/* وبصيغة الوعد: `.catch(() => { if (alive) setItems([]); })` — سطورُ الفاتورة بتفاصيلها كانت هكذا، وصارت
 * تُقرأ لثلاثة قراراتِ مال (تحذيرُ الكلفة الصفرية بالخصم، و«ترجع للرف»، والوصلُ المطبوع) — 0241. */
const PROMISE_EMPTY = /\.catch\s*\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*(?:if\s*\([^)]*\)\s*)?set\w+\(\s*\[\s*\]\s*\)/;
/* وبصيغة الاحتياط داخل `.catch`: `setX((cur) => cur ?? [])` — «ماكو» ما لم تكن لقطة.
 * دفترُ الديون كان هكذا: فشلُ جلب التوصيل صار «ماكو طلبات»، فهبط مالُ المندوب ديناً
 * على الزبون. اللقطةُ تُبقى إن وُجدت؛ وإلا فحالةُ خطأٍ تُعرض لا قائمةٌ فارغة. */
const CATCH_SET_EMPTY = /\.catch\s*\(.*\bset\w+\(\s*\(?\s*\w*\s*\)?\s*=>\s*\w+\s*(?:\?\?|\|\|)\s*\[\s*\]/;

/* ── ١) قوائمُ القرار لا تمرّ بالبلّاعة ─────────────────────────────────── */
/* التعريفُ بصيغتين: دالّةُ الريبو `async name(…) {`، وخاصّيّةُ الباب الكسول `name: (…) =>` أو
 * `name: async (…) =>` (نصفا consumptionApi: السحابةُ والتجريبيّة). وجسمُ سهمٍ بلا قوسٍ معقوف سطرُه
 * وحده — وإلا امتدّ الفحصُ إلى جسم الخاصّيّة التالية ونُسب ما فيه لغيرها. */
const found = new Map(DECISION_LISTS.map((n) => [n, 0]));
for (const src of DECISION_SOURCES) {
  if (!fs.existsSync(src)) { console.error(`   ✗ ${src} — مفقود من مصادر قوائم القرار (حدِّث DECISION_SOURCES أو أعد الملف)`); bad++; continue; }
  const lines = fs.readFileSync(src, "utf8").split(/\r?\n/);
  for (const name of DECISION_LISTS) {
    const def = new RegExp(`^(?:async\\s+${name}\\s*\\(|${name}\\s*:\\s*(?:async\\s*)?(?:\\(|\\w+\\s*=>))`);
    for (let i = 0; i < lines.length; i++) {
      if (!def.test(lines[i].trim())) continue;
      found.set(name, found.get(name) + 1);
      let depth = 0, started = false;
      for (let j = i; j < lines.length && j < i + 40; j++) {
        const line = lines[j];
        if (/\blistOf\s*</.test(line) && !WAIVER.test(line)) {
          say(src, j + 1, `\`${name}\` قائمةُ قرارٍ تمرّ بـlistOf — استعمل listOrThrow أو allPages (أو وسّمها /* swallow-ok: السبب */)`);
        }
        if (SWALLOW.test(line) && !WAIVER.test(line)) {
          say(src, j + 1, `\`${name}\` قائمةُ قرارٍ تبلع فشلَها بـ\`.catch(() => …)\` — ارمِ الخطأ ودَع الشاشةَ تقول «أعد المحاولة» (أو وسّمها /* swallow-ok: السبب */)`);
        }
        for (const ch of line) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
        if (started && depth <= 0) break;
        if (!started && /=>/.test(line) && /[,;]\s*$/.test(line.replace(/\s\/\/.*$/, ""))) break;
      }
    }
  }
}
for (const [name, n] of found) {
  if (n) continue;
  bad++;
  console.error(`   ✗ \`${name}\` بقائمة القرار ولا تعريفَ له بـ${DECISION_SOURCES.join(" ولا ")} — فحصٌ لم يجرِ (حدِّث القائمة أو المصادر)`);
}

/* ── ٢) لا ابتلاعَ صامتاً بالشاشات الحرجة ──────────────────────────────── */
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
    if (CATCH_SET_EMPTY.test(line) && !WAIVER.test(line)) {
      say(f, i + 1, "`.catch(() => setX((cur) => cur ?? []))` يجعل الفشلَ بلا لقطةٍ قائمةً فارغة — احفظ حالةَ خطأٍ واعرض «أعد المحاولة» أو وسّمه /* swallow-ok: السبب */");
    }
  });
}

if (bad) {
  console.error(`\n✗ fetch-guard: ${bad} موضعاً يبلع الفشل. قائمةٌ ناقصة أخطرُ من خطأ ظاهر — الخطأ يُرى ويُعاد، والنقصُ يُصدَّق.\n`);
  process.exit(1);
}
const defs = [...found.values()].reduce((a, b) => a + b, 0);
console.log(`✓ fetch-guard: ${DECISION_LISTS.length} قائمةَ قرارٍ ترمي (${defs} تعريفاً بـ${DECISION_SOURCES.join(" و")})، و${CRITICAL_SCREENS.length} شاشةً حرجةً بلا ابتلاعٍ صامت.`);
