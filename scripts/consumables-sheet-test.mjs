/* ============================================================================
 * ورقةُ مستهلكات السطر وإشعارُ ما بعد البيعة (ConsumablesSheet.tsx) — بالسلوك لا بالنصّ.
 *
 * المكوّنُ الحقيقيّ مرسوماً بـreact-mini-host على شجرة كائنات: الضغطةُ نداءُ onClick نفسِه، والكتابةُ
 * onChange نفسُه. والبابُ (consumptionApi) والريبو والهويّةُ والصلاحياتُ والراوترُ بدائلُ تُدار من هنا؛
 * والحسابُ (consumption.ts) وأكوادُ المادّة (productCodes.ts) والتنسيقُ (utils.ts) حقيقيّة.
 *
 * الورقة:
 *   أ) للقراءة لمن ليس طبيباً ولا مديراً: الحقولُ مقفولة، لا حفظ، والسطرُ يقول لمن التعديل.
 *   ب) رأسُ «لكل حالة · السطر ×٣» ومجموعُ كلّ سطر = الكمية × الحالات بالألف.
 *   ج) ×٣ ⇒ زرّان («هالحالة بس» = one، «كل حالات السطر» = line)؛ ×١ ⇒ زرٌّ واحد = line.
 *   د) قائمةٌ لم تتغيّر ⇒ onSave(null)؛ «رجّع للوصفة» ⇒ null؛ كلُّ السطور شيلت ⇒ [] وكلفتُها ٠.
 *   هـ) المسحُ: رمزٌ مجهول يُقال كما وصل؛ المعروفُ يُضاف أو +١ (والرمزُ الإضافيّ بلا حالة أحرف)؛
 *      الحوضُ يُرفض بسببه. ومادّةٌ لا يجدها الخادمُ لا تُرسل (يرفض البيعةَ كلَّها عليها).
 *   و) الوصفةُ ما وصلت ⇒ للقراءة مع «أعد المحاولة»، والمحاولةُ تفتحها؛ وبتعديلٍ قائم تبقى قابلةً للتعديل —
 *      ومادّتُه الغائبةُ عن القائمة مجهولةٌ لا «محذوفة»: تُرسل كما حُفظت وكلفةُ الحالة null (قراءةٌ فشلت لا
 *      تُسقط سطراً). وخدمةٌ ما وصلت السحابة لا تَعِد بـ«تخصم الوصفة كما هي».
 *   ز) لا تكتب على props (مجمَّدة هنا)، والكلفةُ بالفلس: ٣ أزواج من علبة ٥٠ بـ٥٠٠٠ + سرنجة ٢٥٠ = ٥٥٠؛
 *      وبلا showCost لا رمزَ عملةٍ بأيّ مكان. ورصيدُ سطر الوحدة الصغيرة بوحدة المخزون («1 علبة» لا «1»).
 *   م) دمجٌ ترك سطرين بوحدةٍ واحدة يُجمع؛ ومادّةٌ بوحدتين تُرفض باسمها؛ والحيّةُ الغائبةُ عن القائمة تُرسل
 *      بكلفة سطر الوصفة؛ والحفظُ مقفولٌ والوصفةُ بالطريق؛ والحوضُ مقفولٌ بالقائمة؛ وEnter لا يتسرّب؛ و٤٠ حدّ.
 * الإشعار:
 *   ح) بيعةٌ نظيفة صامتة (والقراءةُ حصلت فعلاً — مرّةً واحدة لا بكلّ رسم)؛ العجزُ يُقال بكميته ورصيده،
 *      والكتمُ يُخفيه الآن والمرّةَ القادمة بنفس العيادة، لا بعيادةٍ ثانية، ومخزنٌ مكسور = لا كتم.
 *   ط) service_missing بنصّه وكلُّ تخطٍّ بنصّه؛ override_none صامت؛ رصيدٌ سالبٌ لسطر مادّة يُقال؛ والمكتومةُ
 *      تغيب بتخطّيها وسالبها؛ والكتمُ يحفظ آخرَ ٥٠٠.
 *   ي) فشلُ القراءة يُقال (وبالبيعة: «انحفظت الفاتورة، بس…») وفاتورةٌ غائبةٌ بالجواب لا تمرّ صامتة، ولا
 *      قائمةٌ مكسورة (تخطّياتٌ أو سالبٌ ليست مصفوفة).
 *   ك) المعاينة: ٢ مل من قنينة ٥٠٠ لكلّ حالة × ٣ = ٦ مل بالضبط، ولحالةٍ واحدة باقية ٤؛ سطرٌ ما لمسه
 *      الترجيع لا يُحسب؛ وهدفٌ = الكمية الحالية ⇒ لا شيء (لا «×٠» من غبار العائم).
 *   ل) بعد الترجيع: ما رجّعه **هذا الفعل** بدفعته (أحداثُه بـat_us) لا المتراكمُ منذ البيعة — ترجيعٌ بعد مرتجعٍ
 *      أقدم يقول الثاني وحده؛ وزرُّ «سجّلها هدر» لمن له manageInventory وحده ووجهتُه بدفعاته
 *      (/inventory/count?tab=waste&inv=…&at=…)؛ والتعديلُ صافيه بدفعته (صرفُ الربط يُطرح: رفعُ السطر لا يقول شيئاً).
 *      و«رجعت الفلوس» بعلاماتها معاً: cashBack من الأمّ، والدفعةُ ليست تعديلاً، وكلُّ سطرٍ رجعت موادُّه باقٍ —
 *      لا بلا مال، ولا بعد الحذف، ولا بعد تعديل، ولا وأسماءُ السطور ما انقرأت؛ وترجيعٌ بعد تعديلٍ أقدم يقولها.
 *   ن) النافذة: now_us − at_us ≤ (t1 − sentAt)·1000 + 250000 بالضبط (الحدُّ داخلٌ والميكروثانيةُ بعده خارجة)،
 *      ودفعتان بداخلها تصاعدياً بالوجهة؛ وبلا sentAt لا شيء؛ وmoves أو now_us أو at_us غائبةٌ ⇒ فشلٌ يُقال، ومثلُها
 *      أحداثٌ فارغة أو ناقصة (مجموعُها غيرُ الحيّ). و«أعد المحاولة» بعد دقيقة لا تتبنّى ترجيعَ جهازٍ ثانٍ جاء بعد أوّل
 *      قراءة: ≥ (ts − t0)·1000 − 250000 (ولو بساعةٍ مقرّبة). (والبيعةُ والمعاينة بلاها تعمل — فحوصُ ح–ك بلا moves.)
 *      والساعةُ (performance.now) بيد الفحص.
 *   س) الرصيدُ رصيدُ صفّ المادّة: سطرُ الوصفة برصيد الخادم، ومادّةٌ بقسمٍ بلا رقم — لا الصفّ + حوضُ القسم.
 *   وللقراءة: «رجّع للوصفة» ظاهرٌ لكلّ دور ما دام بالسطر تعديل؛ والمعاينةُ بالحذف «الحذف يرجّع للمخزن».
 *   ع) (w5a) ورقةٌ تغيّرت عمّا فُتحت به لا تُرمى بلمسة: الستارةُ/Esc/X (onClose الـDialog) و«إغلاق» تسأل بنافذةٍ فوقها
 *      تقول ما يصير لو طلع، «لا، ارجع» وEsc السؤال يُبقيان التعديل، و«إي، طلّعني» تُغلق بلا حفظ؛ ولا سؤالَ لورقةٍ ما
 *      انلمست، ولا لتعديلٍ رجع لكميته (2.0 = 2)، ولا لطيّ الدمج، ولا للقراءة؛ والمسحةُ تعديل؛ والتحديثُ ممسوكٌ ما دام
 *      بالورقة ما لم يُحفظ (inflight.formHeld) ويُفلت بإزالتها.
 *   ف) للقراءة على خدمةٍ بلا وصفة: «ما ينخصم إلها شي» (أو «ينخصم اللي بالقائمة») لا «ضيف اللي استعملته».
 *   ص) «+ مادة» بعلامة + واحدة (لا أيقونةَ قبل نصّها)، وحقلُ الكمية باسم مادّته وaria-invalid وسببه، ومجموعةُ الوحدة
 *      وحقلا المسح والبحث بأسمائها.
 * الإشعار (w5a):
 *   ق) «لا تذكّرني» يُقال بمكانه («انكتم تذكير … على هالجهاز») ومعه «رجّع التذكير» يشيلها وحدها من المخزن؛ والمكتومُ
 *      من إشعارٍ سابق يغيب كما تقرّر (بتخطّيه وسالبه).
 *   ر) مادّةٌ تنباع بالوزن (by_weight من الخادم): «كغ» بالبيعة والمعاينة و«رجّعنا»، وبلا العلامة «علبة» كما كان.
 *   ش) قراءةٌ عالقة (مؤقّتاتٌ بيد الفحص): بعد ١٠ ثوانٍ فشلٌ يُقال بإعادته لا صمتٌ كبيعةٍ نظيفة، وأسماءُ السطور العالقة
 *      لا تحجب الدفتر بعد ٣ ثوانٍ (الجملةُ المحايدة وزرُّ الهدر).
 *   ت) تعديلٌ رفع سطرَ خدمة: صافي الدفعة صرفٌ والمادّةُ صارت تحت الصفر ⇒ «ما كفّى: انخصم <الصافي> والرصيد صار …» بزرّ
 *      كتمه؛ والصافي صفر (الربطُ يعيد كتابةَ العجز على رصيدٍ سالب) أو الرصيدُ كفّى ⇒ صامت؛ ونقصٌ ورفعٌ معاً كلٌّ بجملته؛
 *      ومادّةٌ بوحدتين بصافيها لا «رجّعنا» وتحذيرٌ عنها معاً.
 * الإشعار (ui3):
 *   ث) سالبُ سطر المادّة (بيعت من قائمةٍ قديمة — والإشعارُ يُرسم بعد كلّ بيعةٍ فيها سطرُ مادّة) بزرّ كتمه وتراجعِه بمكانه
 *      كالعجز («لا إنذارَ بلا كتم»)، وبوحدته حين يقولها الخادمُ عن المادّة نفسِها: by_weight بمواصفتها true ⇒ «كغ»، false ⇒
 *      «علبة»؛ وغيابُها (خادمٌ أقدم، null، أو سطرُ مادّةٍ بلا مواصفة) ⇒ رقمُه وحده كما كان — لا «علبة» بالتخمين عن كيلو.
 *      (r3) وعلامةُ السالب نفسِه (StockNegative.by_weight) قبل مواصفته: بها وحدها يعرف سطرُ مادّةٍ بلا مواصفة وحدتَه (true «كغ»،
 *      false «علبة»)، وnull أو غيرُ منطقيّ لا يقرّر فتحكم المواصفة — `n.bw ?? (قاعدةُ المواصفة)`.
 *      وفشلُ قراءة البيعة (ي، ش) يقول «الرصيد والمستهلكات» — بيعةُ موادٍّ وحدها تُقرأ هي الأخرى.
 *   ذ) by_weight من ConsumptionSpec نفسِه لا من نوعٍ محلّيّ يوسّعه — الفحصُ الوحيدُ بالنصّ: تغييرُ نوعٍ لا سلوكَ له.
 *   ض) (تحقّقُ ui3) اسمٌ طويلٌ بلا فاصل يلتفّ بعموده بكلّ سطرٍ بالإشعار (overflow-wrap يُورَث من حاويته): كان يرسم فوق
 *      «لا تذكّرني» و«سجّلها هدر» وتقع ضغطةُ آخره عليهما (مقيسٌ بالمتصفّح على ٣٧٥ بكسل) — والفحصُ يقرأ الأصنافَ صعوداً من نصّه.
 *   ظ) (تحقّقُ ui3) كتمٌ ما انحفظ (setItem يرمي: مخزنٌ ممتلئ أو مقفول) يُقال «هنا بس — … فيرجع المرّة الجاية» لا «على هالجهاز»،
 *      وتراجعُه يرجّع السطر، والإشعارُ الجاي يقولها؛ والمخزنُ إن رجع يكتب يقول «على هالجهاز» وينحفظ.
 *
 * وعدمُ الخواء: `--mutants` يبني المكوّنَ بطفراتٍ مسمّاة (نصٌّ يُستبدل بالذاكرة، والملفُّ لا يُمسّ)
 * ويشترط أن تُسقط كلُّ طفرةٍ فحصاً واحداً على الأقلّ — وطفرةٌ لا يجد نصُّها مكانَه تُفشل كذلك، ومثلُها طفرةٌ لا
 * تنبني (لم يُفحص فيها شيء، فـ«أمسكها» عنها خواء).
 * ولإثبات أن الفحوصَ الجديدة تمسك ما قبلها: CONSUMABLES_SHEET_SRC=<نسخةٌ أخرى من الملفّ> تُفحص بدل الأصل.
 *
 *   node scripts/consumables-sheet-test.mjs
 *   node scripts/consumables-sheet-test.mjs --mutants
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SRC_PATH = "src/components/retail/ConsumablesSheet.tsx";
const SRC = readFileSync(process.env.CONSUMABLES_SHEET_SRC || SRC_PATH, "utf8");
if (process.env.CONSUMABLES_SHEET_SRC) console.log(`   (ConsumablesSheet من ${process.env.CONSUMABLES_SHEET_SRC})`);
const J = (x) => JSON.stringify(x);

/* ساعةُ الجهاز بيد الفحص: الإشعارُ يقرأ performance.now() لحظةَ وصول القراءة (t1). تُركَّب داخل الجولة وحدها
 * وتُرفع بعدها — ومجدولُ React أخذ الحقيقيّةَ لحظةَ تحميل الحزمة (قبل الجولة) فلا يتأثّر بها. */
const REAL_PERF = globalThis.performance;
const clock = { now: 0 };
const FAKE_PERF = { now: () => clock.now, timeOrigin: REAL_PERF.timeOrigin };

/* ومؤقّتاتُ الجهاز بيد الفحص (القسم «ش» وحده): setTimeout يُسجَّل ولا يجري حتى advance — ومجدولُ React ومُرسِمُه أخذا
 * الحقيقيّةَ لحظةَ تحميل الحزمة فلا يتأثّران؛ ولا يقرؤها هنا غيرُ مهلة القراءة (withTimeout بـerrors.ts) ومهلةِ الأسماء. */
const REAL_TIMERS = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
const settleAll = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
const timers = {
  now: 0, list: [],
  fake() {
    this.now = 0; this.list = [];
    globalThis.setTimeout = (fn, ms = 0, ...a) => { const t = { fn, at: this.now + (Number(ms) || 0), a }; this.list.push(t); return t; };
    globalThis.clearTimeout = (t) => { this.list = this.list.filter((x) => x !== t); };
  },
  real() { globalThis.setTimeout = REAL_TIMERS.set; globalThis.clearTimeout = REAL_TIMERS.clear; this.list = []; },
  /** الساعةُ تتقدّم `ms`، وكلُّ ما حان يجري بترتيب وقته ثم تستقرّ الوعود. */
  async advance(ms) {
    this.now += ms;
    for (;;) {
      const due = this.list.filter((t) => t.at <= this.now).sort((x, y) => x.at - y.at);
      if (!due.length) break;
      this.list = this.list.filter((t) => !due.includes(t));
      for (const t of due) t.fn(...t.a);
      await settleAll();
    }
    await settleAll();
  },
};

/* ---- متصفّحٌ بالحدّ الأدنى قبل تحميل الوحدات ---------------------------------- */
const mem = new Map();
/** مخزنٌ ممتلئ أو مقفول (سفاري الخاصّ القديم، بياناتُ الموقع ممنوعة): setItem يرمي كما يرمي المتصفّح — القسم «ظ». */
const store = { failWrites: false };
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (store.failWrites) throw new Error("QuotaExceededError: the quota has been exceeded"); mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };

/* ---- البدائل ----------------------------------------------------------------- */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); const s = typeof d === "string" ? d : (opt.defaultValue ?? k); return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); }`;
const icons = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  // الأيقونةُ عقدةٌ باسمها بلا نصّ: «+» مرسومةً بجانب نصٍّ يبدأ بـ«+» تُرى (أيقونةُ الزرّ تُرسم كما يرسمها Button).
  "lucide-react": `import { createElement } from "react";\n${icons.map((k) => `export const ${k} = () => createElement("x-icon", { "data-icon": "${k}" });`).join("\n")}`,
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
  // الـDialog يكشف onClose كما يصله: الستارةُ وEsc وX بـui/Dialog.tsx كلُّها tryClose ⇒ onClose — فالفحصُ يناديه بنفسه.
  "@/components/ui": `import { createElement } from "react";
    export const Dialog = ({ open, title, children, footer, onClose }) => (open ? createElement("x-Dialog", { "data-dialog": typeof title === "string" ? title : "", onClose }, createElement("x-title", null, title), children, createElement("x-footer", null, footer)) : null);
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, leftIcon ?? null, children);
    export const Skeleton = (p) => createElement("x-Skeleton", p);`,
  "@/lib/consumptionApi": "export const consumptionApi = new Proxy({}, { get: (_t, k) => globalThis.__consApi[k] });",
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => globalThis.__repo[k] });",
  "@/contexts/AuthContext": "export const useAuth = () => ({ user: globalThis.__user });",
  "@/hooks/usePermissions": "export const usePermissions = () => ({ can: (c) => globalThis.__caps.has(c), role: 'reception', baseRole: 'reception' });",
  "react-router-dom": "export const useNavigate = () => (to) => { globalThis.__nav.push(to); };",
};

/** المكوّنُ بنصٍّ معطى (الأصل، أو طفرةٌ منه) مع المُرسِم — نسخةُ React واحدة. */
async function build(source) {
  const built = await esbuild.build({
    stdin: {
      // وإمساكُ التحديث حقيقيّ (inflight.ts، بلا اعتماديات): نسخةٌ واحدة يقرؤها الفحصُ والمكوّن.
      contents: `export { default as Sheet, ConsumptionNotice } from "./${SRC_PATH}";\nexport { formHeld } from "./src/lib/inflight.ts";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
      resolveDir: process.cwd(), sourcefile: "consumables-sheet-ui.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "cons-ui",
      setup(b) {
        b.onLoad({ filter: /[\\/]src[\\/]components[\\/]retail[\\/]ConsumablesSheet\.tsx$/ }, () => ({ contents: source, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUB, a.path) ? { path: a.path, namespace: "cons-stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "cons-stub" }, (a) => ({ contents: STUB[a.path], loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "consumables-sheet-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  // والنصُّ نفسُه مع الوحدة: فحصُ العقد (ذ) يقرأ ما بُني منه — الطفرةُ لا الأصل.
  try { return { ...(await import(pathToFileURL(file).href)), SOURCE: source }; } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ---- البيانات ----------------------------------------------------------------- */
const prod = (o) => ({ barcode: null, alt_codes: [], purchase_price: 0, avg_cost: null, sell_price: 0, stock: 0, has_sub_unit: false,
  sub_unit_name: null, units_per_box: null, pooled: false, farm_id: null, sold_by_weight: false, created_at: "2026-01-01T00:00:00Z", ...o });
const GLOVES = prod({ id: "p-gloves", name: "كفوف", barcode: "6221000000017", alt_codes: ["G-77"], purchase_price: 5000, stock: 1, has_sub_unit: true, sub_unit_name: "زوج", units_per_box: 50 });
const SYR = prod({ id: "p-syr", name: "سرنجة", barcode: "111222", purchase_price: 250, stock: 10 });
const LYSE = prod({ id: "p-lyse", name: "Lyse", barcode: "333444", purchase_price: 60000, stock: 2, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 500 });
const POOL = prod({ id: "p-pool", name: "شاش", barcode: "555666", pooled: true, purchase_price: 100 });
const FARM = prod({ id: "p-farm", name: "علف", barcode: "777888", farm_id: "f1", purchase_price: 100 });
const ZERO = prod({ id: "p-zero", name: "قطن", barcode: "999000", purchase_price: 100, stock: 0 });
const PRODUCTS = [GLOVES, SYR, LYSE, POOL, FARM, ZERO];
const rl = (o) => ({ id: `r-${o.product_id}`, position: 0, problem: null, stock: 0, unit_label: null, units_per_box: null, unit_cost: 0, per_value: 0, ...o });
const RECIPE = { fingerprint: "fp1", flat_cost: null, lines: [
  rl({ product_id: "p-gloves", product_name: "كفوف", qty: 2, unit: "sub", stock: 1, unit_label: "زوج", units_per_box: 50, unit_cost: 5000, per_value: 200 }),
  rl({ product_id: "p-syr", product_name: "سرنجة", qty: 1, unit: "stock", position: 1, stock: 10, unit_cost: 250, per_value: 250 }),
] };
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const spec = (o) => ({ spec_id: `s-${o.product_id}`, unit: "stock", unit_label: null, per_qty: 1, per_div: 1, live_qty: 0, live_value: 0,
  restored_qty: 0, shortfall: 0, note: null, source: "recipe", ...o });
const inv = (items, skips = [], negatives = []) => ({ items, skips, negatives });
/* الدفترُ بأحداثه (عقدُ ui2): كلُّ حدثٍ {at_us, qty} — وأحداثُ الفعل الواحد تحمل at_us واحداً هو دفعتُه. والأرقامُ
 * كما يحسبها الخادم: حالةُ Lyse = ٢ مل من قنينة ٥٠٠ = 0.004 علبة، فالبيعةُ بثلاث حالات 0.012. */
const NOW = 1_761_900_000_000_000;          // now() القراءة بالميكروثانية
const SENT = 1000, T1 = 1800;               // sentAt ولحظةُ وصول القراءة (مللي) ⇒ النافذة 800 + 250 مللي
const WIN = (T1 - SENT) * 1000 + 250_000;   // = 1,050,000 µs
const SALE = NOW - 86_400_000_000;          // البيعة: قبل يوم
const OLD = NOW - 3_600_000_000;            // فعلٌ أقدم على الفاتورة نفسها: قبل ساعة
const OWN = NOW - 300_000;                  // هذا الفعل: قبل القراءة بـ٣٠٠ مللي
const mv = (at_us, qty) => ({ at_us, qty });
const lyse = (o) => spec({ product_id: "p-lyse", product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, ...o });
const timed = (entry) => ({ ...entry, now_us: NOW });
/** فشلُ قراءة البيعة (ui3): الرصيدُ والمستهلكاتُ معاً — الإشعارُ يُرسم بعد بيعةِ موادٍّ وحدها أيضاً (سالبُها من القراءة نفسِها)،
 *  و«المستهلكات» وحدها عن بيعةٍ ما فيها خدمة تقول غيرَ ما فشل. والقديمةُ لا تُقال بعدها. */
const SALE_FAIL = "انحفظت الفاتورة، بس ما گدرنا نتأكد من الرصيد والمستهلكات — شوف حركات المادة";
const OLD_SALE_FAIL = "ما گدرنا نتأكد من المستهلكات";
/** مرتجعُ حالةٍ قبل ساعة، ثم ترجيعُ الحالتين الباقيتين الآن — والمتراكمُ (restored_qty) ثلاثُ حالات. */
const TWICE = { inv1: timed(inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OLD, -0.004), mv(OWN, -0.008)] })] })) };
/** مرتجعٌ قبل ساعة (−`first`)، ثم تعديلٌ الآن: محفّزُ الحذف يردّ ما بقي بالسطر القديم (−`rest`)، ومواصفةُ ربطٍ
 *  تولد بالدفعة نفسها بالكمية الجديدة (+`relink`) على السطر بمعرّفه الجديد. */
const editAfter = (first, rest, relink) => ({ inv1: timed(inv({
  it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OLD, -first), mv(OWN, -rest)] })],
  it2: [lyse({ spec_id: "s-relink", live_qty: relink, source: "relink", moves: [mv(OWN, relink)] })],
})) });

/* ---- الجولةُ الواحدة على نسخةٍ من المكوّن ----------------------------------------- */
async function runSuite(UI, verbose) {
  globalThis.performance = FAKE_PERF;
  try { return await runChecks(UI, verbose); } finally { globalThis.performance = REAL_PERF; }
}
async function runChecks(UI, verbose) {
  const R = { pass: 0, fail: [] };
  const check = (name, cond, detail = "") => {
    if (cond) R.pass++;
    else R.fail.push(name);
    if (verbose) (cond ? console.log : console.error)(`   ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  };
  const section = (s) => { if (verbose) console.log(`▸ ${s}`); };
  const { React, mount, Sheet, ConsumptionNotice, SOURCE } = UI;
  const h = React.createElement;
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
  const reset = (api = {}) => {
    mem.clear();
    store.failWrites = false;
    globalThis.__nav = [];
    globalThis.__user = { id: "u1", clinic_id: "c1" };
    globalThis.__caps = new Set(["manageInventory"]);
    globalThis.__repo = { listInvoiceItemsFor: async () => [] };
    globalThis.__consApi = { recipeGet: async () => RECIPE, invoiceConsumption: async () => ({}), ...api };
  };
  const tryCase = async (name, fn) => {
    try { await fn(); } catch (e) { check(`${name} — رمى`, false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | ")); }
  };
  /** نصُّ عقدةٍ أو "" إن غابت — فغيابُها يُسقط الفحصَ بنفسه لا برمي (ui.text(null) يرمي، وundefined يقرأ الجذرَ كلَّه). */
  const textOf = (ui, n) => (n ? ui.text(n) : "");
  /** عُقدٌ بخاصّيةٍ تحت عقدةٍ بعينها — «زرُّ وحدةِ هذا السطر» بلا افتراضٍ عن تعشيش الوسوم. */
  const within = (node, attr, value) => {
    const out = [];
    const walk = (n) => { if (n.props && attr in n.props && (value === undefined || String(n.props[attr]) === String(value))) out.push(n); n.children.forEach(walk); };
    if (node) walk(node);
    return out;
  };
  /** جملةُ سطرِ تحذيرٍ وحدها (أوّلُ أبنائه) بلا نصّ زرّه — «صار -1» بالضبط لا «صار -1لا تذكّرني…». */
  const lineOf = (ui, row) => (row && row.children[0] ? ui.text(row.children[0]) : "");
  /** هل يلتفّ نصُّ هذه العقدة داخل عموده؟ overflow-wrap يُورَث، فأقربُ جدٍّ يقرّره يحكم: break-words/break-all يلفّان
   *  الكلمةَ الطويلة، وtruncate يقصّها بنقاط؛ وbreak-normal أو لا شيء = اسمٌ بلا فاصلٍ أعرضُ من عموده يطلع منه ويرسم فوق
   *  جاره — زرّ الكتم (مقيسٌ بالمتصفّح على ٣٧٥ بكسل: عمودٌ ١٤٨ ونصٌّ ١٩٤، وضغطةُ آخر الاسم تقع على الزرّ). */
  const wraps = (node) => {
    for (let x = node; x; x = x.parent) {
      const cls = String(x.props?.className ?? "").split(/\s+/);
      if (cls.includes("break-words") || cls.includes("break-all") || cls.includes("truncate")) return true;
      if (cls.includes("break-normal")) return false;
    }
    return false;
  };
  /** عقدةُ النصّ التي فيها `s` (الاسمُ يدخل جملتَه بالترجمة فيصير نصّاً واحداً). */
  const textNode = (ui, s) => ui.all().find((x) => x.type === "#text" && String(x.text).includes(s)) ?? null;

  /** ورقةٌ مرسومة: `calls` ما وصل onSave/onClose. */
  const openSheet = async (props = {}) => {
    const calls = [];
    const P = { open: true, onClose: () => calls.push(["close"]), serviceId: "svc1", serviceName: "تعقيم قطة", lineQty: 1, value: undefined,
      products: PRODUCTS, canEdit: true, showCost: true, onSave: (n, e, s) => calls.push(["save", n, e, s]), ...props };
    const ui = mount(h(Sheet, P));
    await flush();
    const byAttr = (attr, v) => ui.find(attr, v);
    const type = async (attr, v, value) => { const n = byAttr(attr, v); if (!n) throw new Error(`ما لكيت ${attr}=${v}`); n.props.onChange({ target: { value } }); await flush(); };
    const press = async (attr, v) => { ui.click(byAttr(attr, v)); await flush(); };
    const scan = async (code) => {
      await type("data-cons-scan", undefined, code);
      const n = byAttr("data-cons-scan");
      n.props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
      await flush();
    };
    const saves = () => calls.filter((c) => c[0] === "save");
    return { ui, calls, saves, byAttr, type, press, scan, text: () => ui.text(), done: () => ui.unmount() };
  };

  /* ── أ) للقراءة ───────────────────────────────────────────────────────── */
  section("أ) لمن ليس طبيباً ولا مديراً: الورقةُ تُرى ولا تُلمس");
  reset();
  await tryCase("readonly", async () => {
    const s = await openSheet({ canEdit: false });
    const qtys = s.ui.findAll("data-cons-qty");
    check("السطران ظاهران من الوصفة", s.ui.findAll("data-cons-row").length === 2, String(s.ui.findAll("data-cons-row").length));
    check("  وحقولُ الكمية كلُّها مقفولة", qtys.length === 2 && qtys.every((n) => n.props.disabled === true), J(qtys.map((n) => n.props.disabled)));
    check("  وأزرارُ الشيل والوحدة مقفولة", s.ui.findAll("data-cons-remove").every((n) => n.props.disabled) && s.ui.findAll("data-cons-unit").every((n) => n.props.disabled));
    check("  ولا زرَّ حفظ ولا «رجّع للوصفة» ولا مسح ولا «+ مادة»", !s.byAttr("data-cons-save") && !s.byAttr("data-cons-reset") && !s.byAttr("data-cons-scan") && !s.byAttr("data-cons-add"));
    check("  والسطرُ يقول «تعديل المستهلكات للطبيب أو المدير»", s.text().includes("تعديل المستهلكات للطبيب أو المدير"), s.text());
    s.done();
  });
  await tryCase("readonlyReset", async () => {
    // الرجوعُ للوصفة لا يحتاج دوراً بالخادم، وتلميحُ consumables_case_role يقول للاستقبال «شيل التعديل» — فالزرُّ له.
    const s = await openSheet({ canEdit: false, value: [{ product_id: "p-syr", qty: 2, unit: "stock" }] });
    const r = s.byAttr("data-cons-reset");
    check("للقراءة وبالسطر تعديلٌ قائم: «رجّع للوصفة» ظاهرٌ مفتوح", !!r && !r.props.disabled, String(!!r));
    if (r) await s.press("data-cons-reset");
    check("  وضغطُه ⇒ onSave(null, null, line)، والحقولُ باقيةٌ مقفولة ولا حفظ",
      J(s.saves()) === J([["save", null, null, "line"]]) && s.ui.findAll("data-cons-qty").every((n) => n.props.disabled === true) && !s.byAttr("data-cons-save"), J(s.saves()));
    s.done();
  });

  /* ── ب) الرأس والمجموع ────────────────────────────────────────────────── */
  section("ب) لكل حالة، ومجموعُ السطر بالحالات");
  reset();
  await tryCase("header", async () => {
    const s = await openSheet({ lineQty: 3 });
    const head = s.ui.text(s.byAttr("data-cons-header"));
    check("الرأس «لكل حالة · السطر ×3»", head.includes("لكل حالة") && head.includes("السطر ×3"), head);
    const tg = s.ui.text(s.byAttr("data-cons-total", "p-gloves")), ts = s.ui.text(s.byAttr("data-cons-total", "p-syr"));
    check("  الكفوف: ٢ زوج لكل حالة × ٣ = 6 زوج", tg.replace(/\s+/g, " ").trim() === "= 6 زوج", J(tg));
    check("  والسرنجة: 1 × ٣ = 3 علبة", ts.replace(/\s+/g, " ").trim() === "= 3 علبة", J(ts));
    // الرصيدُ بوحدة المخزون: «1» بجانب «2 زوج» تُقرأ زوجاً واحداً وهي علبةٌ بخمسين.
    const stG = textOf(s.ui, within(s.byAttr("data-cons-row", "p-gloves"), "data-cons-stock")[0]);
    const stS = textOf(s.ui, within(s.byAttr("data-cons-row", "p-syr"), "data-cons-stock")[0]);
    check("  ورصيدُ سطرٍ بالوحدة الصغيرة بوحدة المخزون: «الرصيد: 1 علبة»", stG === "الرصيد: 1 علبة", J(stG));
    check("  وسطرُ العلبة رصيدُه بوحدته: «الرصيد: 10»", stS === "الرصيد: 10", J(stS));
    s.done();
    const one = await openSheet({ lineQty: 1 });
    check("وبحالةٍ واحدة لا «×» ولا مجموع", !one.ui.text(one.byAttr("data-cons-header")).includes("×") && one.ui.findAll("data-cons-total").length === 0);
    one.done();
  });

  /* ── ج) الزرّان ونطاقهما ───────────────────────────────────────────────── */
  section("ج) ×٣ ⇒ «هالحالة بس» و«كل حالات السطر»؛ ×١ ⇒ حفظ واحد");
  reset();
  await tryCase("scopes", async () => {
    let s = await openSheet({ lineQty: 3 });
    check("زرّان: one و line", !!s.byAttr("data-cons-save", "one") && !!s.byAttr("data-cons-save", "line"));
    check("  و«كل حالات السطر (×3)»", s.ui.text(s.byAttr("data-cons-save", "line")).includes("(×3)"), s.ui.text(s.byAttr("data-cons-save", "line")));
    await s.type("data-cons-qty", "p-gloves", "3");
    await s.press("data-cons-save", "one");
    let c = s.saves()[0];
    check("  «هالحالة بس» بقائمةٍ معدّلة ⇒ scope one", c && c[3] === "one" && J(c[1]) === J([{ product_id: "p-gloves", qty: 3, unit: "sub" }, { product_id: "p-syr", qty: 1, unit: "stock" }]), J(c));
    check("  والكلفةُ بالفلس: ٣ أزواج من ٥٠ بـ٥٠٠٠ = 300 + سرنجة 250 = 550", c && c[2] === 550, J(c?.[2]));
    s.done();
    s = await openSheet({ lineQty: 3 });
    await s.type("data-cons-qty", "p-gloves", "3");
    await s.press("data-cons-save", "line");
    c = s.saves()[0];
    check("  «كل حالات السطر» ⇒ scope line", c && c[3] === "line" && c[1]?.length === 2, J(c));
    s.done();
    s = await openSheet({ lineQty: 1 });
    check("×١ ⇒ زرٌّ واحد line بلا one", !!s.byAttr("data-cons-save", "line") && !s.byAttr("data-cons-save", "one") && s.ui.text(s.byAttr("data-cons-save", "line")) === "حفظ");
    s.done();
  });

  /* ── د) الوصفة كما هي، والرجوع لها، والشيل كلّه ──────────────────────────── */
  section("د) لا تغيير ⇒ null؛ «رجّع للوصفة» ⇒ null؛ شيلُ الكلّ ⇒ []");
  reset();
  await tryCase("same/reset/empty", async () => {
    let s = await openSheet();
    await s.press("data-cons-save", "line");
    check("حفظٌ بلا تغيير ⇒ onSave(null, null, line)", J(s.saves()[0]) === J(["save", null, null, "line"]), J(s.saves()));
    check("  ولا «رجّع للوصفة» بلا تعديلٍ قائم", !s.byAttr("data-cons-reset"));
    s.done();
    s = await openSheet({ value: [{ product_id: "p-syr", qty: 2, unit: "stock" }] });
    check("تعديلٌ قائم: الورقةُ منه (السرنجة 2 وحدها)", s.ui.findAll("data-cons-row").length === 1 && s.byAttr("data-cons-qty", "p-syr")?.props.value === "2");
    await s.press("data-cons-reset");
    check("  «رجّع للوصفة» ⇒ onSave(null, null, line)", J(s.saves()[0]) === J(["save", null, null, "line"]), J(s.saves()));
    s.done();
    s = await openSheet({ value: [{ product_id: "p-gloves", qty: "2.000", unit: "sub" }, { product_id: "p-syr", qty: 1, unit: "stock" }] });
    await s.press("data-cons-save", "line");
    check("تعديلٌ يساوي الوصفة (2.000 = 2) ⇒ null", J(s.saves()[0]) === J(["save", null, null, "line"]), J(s.saves()));
    s.done();
    s = await openSheet();
    await s.press("data-cons-remove", "p-gloves");
    await s.press("data-cons-remove", "p-syr");
    check("  السطورُ شيلت", s.ui.findAll("data-cons-row").length === 0);
    await s.press("data-cons-save", "line");
    check("شيلُ الكلّ ⇒ onSave([], 0, line)", J(s.saves()[0]) === J(["save", [], 0, "line"]), J(s.saves()));
    s.done();
  });

  /* ── هـ) المسح والإضافة ─────────────────────────────────────────────────── */
  section("هـ) المسح: المجهولُ كما وصل، والمعروفُ يُضاف أو +١، والحوضُ مرفوضٌ بسببه");
  reset();
  await tryCase("scan", async () => {
    const s = await openSheet();
    await s.scan("x-77z ");
    const note = s.ui.text(s.byAttr("data-cons-scan-note"));
    check("رمزٌ مجهول يُقال كما وصل («x-77z » حرفاً)", note.includes("الباركود x-77z  مو موجود بمخزنك"), J(note));
    check("  ولا سطرَ أُضيف", s.ui.findAll("data-cons-row").length === 2);
    await s.scan("g-77");
    check("الرمزُ الإضافيّ بحالة أحرفٍ أخرى ⇒ الكفوف +١ (2 ⇒ 3)", s.byAttr("data-cons-qty", "p-gloves")?.props.value === "3", s.byAttr("data-cons-qty", "p-gloves")?.props.value);
    await s.scan("333444");
    const lyse = s.byAttr("data-cons-row", "p-lyse");
    check("مادّةٌ جديدة ⇒ سطرٌ بكمية 1 وبوحدتها الصغيرة", !!lyse && s.byAttr("data-cons-qty", "p-lyse")?.props.value === "1"
      && within(lyse, "data-cons-unit", "sub")[0]?.props["aria-pressed"] === true && within(lyse, "data-cons-unit", "stock")[0]?.props["aria-pressed"] === false);
    await s.scan("555666");
    check("الحوضُ لا يُضاف ويُقال سببُه", !s.byAttr("data-cons-row", "p-pool") && s.ui.text(s.byAttr("data-cons-scan-note")).includes("حوض القسم"));
    await s.press("data-cons-add");
    await s.type("data-cons-search", undefined, "علف");
    const farm = s.byAttr("data-cons-pick", "p-farm");
    check("«+ مادة»: الحقلُ ظاهرٌ مقفولٌ بسببه", !!farm && farm.props.disabled === true && s.ui.text(farm).includes("مخزون الحقل"));
    await s.type("data-cons-search", undefined, "قطن");
    await s.press("data-cons-pick", "p-zero");
    check("  واختيارُ مادّة يضيفها", !!s.byAttr("data-cons-row", "p-zero"));
    check("  ورصيدُها ٠ ينذر ولا يمنع", s.byAttr("data-cons-stock", "low") !== null && s.ui.text(s.byAttr("data-cons-stock", "low")).includes("تصير بالسالب"));
    await s.press("data-cons-save", "line");
    const c = s.saves()[0];
    check("  والحفظُ يرسلها كلَّها بكمياتها (والحوضُ ليس منها)", c && J(c[1]) === J([
      { product_id: "p-gloves", qty: 3, unit: "sub" }, { product_id: "p-syr", qty: 1, unit: "stock" },
      { product_id: "p-lyse", qty: 1, unit: "sub" }, { product_id: "p-zero", qty: 1, unit: "stock" }]), J(c));
    s.done();
  });
  reset({ recipeGet: async () => ({ ...RECIPE, lines: [...RECIPE.lines, rl({ product_id: "p-gone", product_name: "خيط جراحي", qty: 1, unit: "stock", problem: "product_gone", position: 2 })] }) });
  await tryCase("gone", async () => {
    const s = await openSheet();
    check("مادّةٌ ما يجدها الخادم: سطرٌ باسم لقطتها وسببه", s.ui.text(s.byAttr("data-cons-row", "p-gone")).includes("خيط جراحي") && s.ui.text(s.byAttr("data-cons-row", "p-gone")).includes("ما تنحسب"));
    await s.press("data-cons-save", "line");
    check("  وحفظٌ بلا تغيير ⇒ null (الوصفةُ كما هي)", J(s.saves()[0]?.[1]) === "null", J(s.saves()));
    await s.type("data-cons-qty", "p-syr", "2");
    await s.press("data-cons-save", "line");
    const c = s.saves()[1];
    check("  وتعديلٌ لا يرسلها (الخادمُ يرفض البيعة عليها)", c && J(c[1]) === J([{ product_id: "p-gloves", qty: 2, unit: "sub" }, { product_id: "p-syr", qty: 2, unit: "stock" }]), J(c));
    s.done();
  });
  reset();
  await tryCase("invalid", async () => {
    const s = await openSheet();
    await s.type("data-cons-qty", "p-syr", "0.0005");
    await s.press("data-cons-save", "line");
    check("كميةٌ بأربع منازل ⇒ لا حفظ، والسطرُ أحمر، و«صحّح الكميات»", s.saves().length === 0 && !!s.byAttr("data-cons-badqty") && s.text().includes("صحّح الكميات"));
    await s.type("data-cons-qty", "p-syr", "٢");
    await s.press("data-cons-save", "line");
    check("  والرقمُ الشرقيّ «٢» يُقرأ 2", J(s.saves()[0]?.[1]?.[1]) === J({ product_id: "p-syr", qty: 2, unit: "stock" }), J(s.saves()));
    s.done();
  });

  /* ── و) الوصفة ما وصلت ─────────────────────────────────────────────────── */
  section("و) الوصفةُ ما وصلت ⇒ للقراءة مع «أعد المحاولة»");
  let fails = 1;
  reset({ recipeGet: async () => { if (fails-- > 0) throw Object.assign(new Error("boom"), { code: "P0001", hint: "الخادم مشغول" }); return RECIPE; } });
  await tryCase("recipeFail", async () => {
    const s = await openSheet();
    check("النصّ «ما گدرنا نجيب الوصفة — البيعة تخصم الوصفة كما هي»", s.text().includes("ما گدرنا نجيب الوصفة — البيعة تخصم الوصفة كما هي"), s.text());
    check("  ولا سطرَ ولا حفظَ ولا مسح", s.ui.findAll("data-cons-row").length === 0 && !s.byAttr("data-cons-save") && !s.byAttr("data-cons-scan"));
    await s.press("data-cons-retry");
    check("  و«أعد المحاولة» تجيبها وتفتحها", s.ui.findAll("data-cons-row").length === 2 && !!s.byAttr("data-cons-save", "line") && !s.byAttr("data-cons-recipe-fail"));
    s.done();
  });
  reset({ recipeGet: async () => { throw new Error("offline"); } });
  await tryCase("recipeFailOwn", async () => {
    const s = await openSheet({ value: [{ product_id: "p-syr", qty: 1, unit: "stock" }] });
    check("وبتعديلٍ قائم: تبقى قابلةً للتعديل وتقول إن الوصفة ما وصلت", !!s.byAttr("data-cons-save", "line") && s.text().includes("ما گدرنا نجيب الوصفة") && !s.text().includes("البيعة تخصم الوصفة كما هي"));
    await s.press("data-cons-save", "line");
    check("  وحفظُها يرسل القائمة (لا مقارنةَ بوصفةٍ مجهولة)", J(s.saves()[0]?.[1]) === J([{ product_id: "p-syr", qty: 1, unit: "stock" }]), J(s.saves()));
    s.done();
  });
  reset({ recipeGet: async () => { throw new Error("offline"); } });
  await tryCase("recipeFailUnknown", async () => {
    // مادّةٌ بالتعديل غائبةٌ عن قائمة هالشاشة (أُضيفت من جهازٍ آخر) والوصفةُ ما انقرأت: مجهولةٌ لا محذوفة.
    const s = await openSheet({ value: [{ product_id: "p-new", qty: 1, unit: "stock" }, { product_id: "p-syr", qty: 1, unit: "stock" }] });
    const row = textOf(s.ui, s.byAttr("data-cons-row", "p-new"));
    check("وبوصفةٍ ما وصلت: مادّةُ التعديل الغائبة عن القائمة «مو بقائمة هالشاشة» لا «مو موجودة بالمخزن»",
      row.includes("مو بقائمة هالشاشة — حدّث الصفحة") && !row.includes("مو موجودة بالمخزن"), J(row));
    const cc = textOf(s.ui, s.byAttr("data-cons-case-cost"));
    check("  وكلفةُ الحالة «—» لا رقمٌ ينقصها", cc.includes("—") && !cc.includes("د.ع"), J(cc));
    await s.type("data-cons-qty", "p-syr", "2");
    await s.press("data-cons-save", "line");
    const c = s.saves()[0];
    check("  والحفظُ يرسلها كما حُفظت (قراءةٌ فشلت لا تُسقط سطراً)، وكلفتُها مجهولة ⇒ est = null",
      c && J(c[1]) === J([{ product_id: "p-new", qty: 1, unit: "stock" }, { product_id: "p-syr", qty: 2, unit: "stock" }]) && c[2] === null, J(c));
    s.done();
  });
  reset({ recipeGet: async () => { throw Object.assign(new Error("recipe_service_missing"), { code: "P0001", hint: "الخدمة ما وصلت للسحابة بعد — انتظر لحظة وأعد المحاولة" }); } });
  await tryCase("recipeSvcMissing", async () => {
    const s = await openSheet();
    const box = textOf(s.ui, s.byAttr("data-cons-recipe-fail"));
    check("الخدمةُ ما وصلت السحابة: لا «البيعة تخصم الوصفة كما هي» (ما راح ينخصم شي) والتلميحُ يقول السبب",
      box.includes("ما گدرنا نجيب الوصفة") && !box.includes("البيعة تخصم الوصفة كما هي") && box.includes("الخدمة ما وصلت للسحابة بعد"), J(box));
    s.done();
  });

  /* ── ز) props مجمَّدة، والكلفة ──────────────────────────────────────────── */
  section("ز) لا كتابةَ على props، والكلفةُ لمن يراها وحده");
  reset();
  await tryCase("frozen", async () => {
    const value = deepFreeze([{ product_id: "p-gloves", qty: 2, unit: "sub" }, { product_id: "p-syr", qty: 1, unit: "stock" }]);
    const products = deepFreeze(PRODUCTS.map((p) => ({ ...p })));
    const s = await openSheet({ value, products });
    await s.type("data-cons-qty", "p-gloves", "4");
    await s.press("data-cons-remove", "p-syr");
    await s.scan("333444");
    await s.press("data-cons-save", "line");
    check("props مجمَّدة: التعديلُ والشيلُ والمسحُ والحفظ تمرّ", J(s.saves()[0]?.[1]) === J([{ product_id: "p-gloves", qty: 4, unit: "sub" }, { product_id: "p-lyse", qty: 1, unit: "sub" }]), J(s.saves()));
    check("  والقيمةُ كما وصلت", J(value) === J([{ product_id: "p-gloves", qty: 2, unit: "sub" }, { product_id: "p-syr", qty: 1, unit: "stock" }]));
    check("  وكلفةُ الحالة 4 أزواج = 400 + 1 مل Lyse من 500 بـ60000 = 120 ⇒ 520", s.saves()[0]?.[2] === 520, J(s.saves()[0]?.[2]));
    s.done();
    const hidden = await openSheet({ showCost: false });
    check("showCost=false ⇒ لا كلفةَ بالورقة", !hidden.byAttr("data-cons-cost") && !hidden.byAttr("data-cons-case-cost"));
    check("  ولا رمزَ عملةٍ بأيّ مكانٍ منها (لا مالَ يتسرّب بنصٍّ آخر)", !hidden.text().includes("د.ع"), hidden.text());
    await hidden.type("data-cons-qty", "p-syr", "2");
    await hidden.press("data-cons-save", "line");
    check("  والكلفةُ تُحسب مع ذلك لمعاينة الربح (200 + 500 = 700)", hidden.saves()[0]?.[2] === 700, J(hidden.saves()));
    hidden.done();
    const shown = await openSheet();
    check("showCost=true ⇒ كلفةُ كلّ سطر وكلفةُ الحالة", shown.ui.findAll("data-cons-cost").length === 2 && shown.ui.text(shown.byAttr("data-cons-case-cost")).includes("450"));
    check("  (ورمزُ العملة الذي يطبعه money() هنا «د.ع» — فغيابُه أعلاه ليس صدفة)", shown.text().includes("د.ع"), shown.text());
    shown.done();
  });
  await tryCase("closeDiscards", async () => {
    // الإغلاقُ بعد «إي، طلّعني» يرمي التعديل: الأمُّ تطوي الورقة ثم تفتحها، فتبدأ من الوصفة لا ممّا كُتب.
    const saves = [];
    let setOpen = null;
    const Host = () => {
      const [open, set] = React.useState(true);
      setOpen = set;
      return h(Sheet, { open, onClose: () => set(false), serviceId: "svc1", serviceName: "تعقيم قطة", lineQty: 1, value: undefined,
        products: PRODUCTS, canEdit: true, showCost: false, onSave: (...a) => saves.push(a) });
    };
    const ui = mount(h(Host));
    await flush();
    ui.find("data-cons-qty", "p-gloves").props.onChange({ target: { value: "9" } });
    await flush();
    ui.click(ui.find("data-cons-close"));
    await flush();
    check("«إغلاق» على ورقةٍ معدّلة يسأل أوّلاً (الورقةُ باقية، بلا حفظ)", !!ui.find("data-cons-leave") && !!ui.find("data-cons-sheet") && saves.length === 0);
    const yes = ui.find("data-cons-leave-yes");
    if (yes) ui.click(yes);
    await flush();
    check("  و«إي، طلّعني» تطوي الورقة بلا حفظ", ui.container.children.length === 0 && saves.length === 0);
    setOpen(true);
    await flush();
    check("  وفتحُها من جديد يبدأ من الوصفة (2 لا 9)", ui.find("data-cons-qty", "p-gloves")?.props.value === "2", ui.find("data-cons-qty", "p-gloves")?.props.value);
    ui.unmount();
  });

  /* ── م) ما يَعِد به المكوّنُ ولم يكن مفحوصاً ──────────────────────────────── */
  section("م) دمجٌ ترك سطرين، ومادّةٌ بوحدتين، وغائبةٌ عن القائمة، والوصفةُ بالطريق، والحدود");
  reset({ recipeGet: async () => ({ ...RECIPE, lines: [...RECIPE.lines,
    rl({ id: "r-dup", product_id: "p-gloves", product_name: "كفوف", qty: 3, unit: "sub", position: 2, units_per_box: 50, unit_cost: 5000, per_value: 300 })] }) });
  await tryCase("mergeFold", async () => {
    const s = await openSheet();
    check("سطران لمادّةٍ بنفس الوحدة (دمج) ⇒ سطرٌ واحد بمجموعهما بالألف (2 + 3 = 5)",
      s.ui.findAll("data-cons-row").length === 2 && s.byAttr("data-cons-qty", "p-gloves")?.props.value === "5", J(s.ui.findAll("data-cons-qty").map((n) => n.props.value)));
    await s.press("data-cons-save", "line");
    check("  وحفظُه بلا تغيير ⇒ null (هو الوصفةُ نفسُها)", J(s.saves()[0]) === J(["save", null, null, "line"]), J(s.saves()));
    s.done();
  });
  reset();
  await tryCase("twoUnits", async () => {
    const s = await openSheet({ value: [{ product_id: "p-gloves", qty: 2, unit: "sub" }, { product_id: "p-gloves", qty: 1, unit: "stock" }] });
    await s.press("data-cons-save", "line");
    check("مادّةٌ بوحدتين ⇒ لا حفظ، و«\"كفوف\" مكرّرة — خلّيها بسطر واحد» (الخادمُ يرفض التكرار بالتعديل)",
      s.saves().length === 0 && textOf(s.ui, s.byAttr("data-cons-err")).includes("\"كفوف\" مكرّرة"), textOf(s.ui, s.byAttr("data-cons-err")));
    s.done();
  });
  reset({ recipeGet: async () => ({ ...RECIPE, lines: [...RECIPE.lines,
    rl({ product_id: "p-new", product_name: "محلول", qty: 10, unit: "sub", position: 2, stock: 3, unit_label: "مل", units_per_box: 500, unit_cost: 6000, per_value: 120 })] }) });
  await tryCase("staleRow", async () => {
    const s = await openSheet();
    const row = textOf(s.ui, s.byAttr("data-cons-row", "p-new"));
    check("مادّةٌ حيّةٌ بالوصفة وغائبةٌ عن القائمة: باسم الوصفة و«مو بقائمة هالشاشة — حدّث الصفحة»", row.includes("محلول") && row.includes("مو بقائمة هالشاشة — حدّث الصفحة"), J(row));
    await s.type("data-cons-qty", "p-syr", "2");
    await s.press("data-cons-save", "line");
    const c = s.saves()[0];
    check("  وتُرسل، وكلفتُها من سطر الوصفة: 10 مل من 500 بـ6000 = 120 ⇒ 200 + 500 + 120 = 820",
      c && J(c[1]?.[2]) === J({ product_id: "p-new", qty: 10, unit: "sub" }) && c[2] === 820, J(c));
    s.done();
  });
  let release = null;
  reset({ recipeGet: () => new Promise((r) => { release = () => r(RECIPE); }) });
  await tryCase("loadingGate", async () => {
    const s = await openSheet({ value: [{ product_id: "p-syr", qty: 1, unit: "stock" }] });
    check("الوصفةُ بالطريق ⇒ الحفظُ مقفول (المقارنةُ بها لم تُحسم)", s.byAttr("data-cons-save", "line")?.props.disabled === true);
    release(); await flush();
    check("  ووصولُها يفتحه", s.byAttr("data-cons-save", "line")?.props.disabled === false);
    s.done();
  });
  reset();
  await tryCase("limits", async () => {
    let s = await openSheet();
    await s.press("data-cons-add");
    await s.type("data-cons-search", undefined, "شاش");
    const pool = s.byAttr("data-cons-pick", "p-pool");
    check("«+ مادة»: الحوضُ ظاهرٌ مقفولٌ بسببه", !!pool && pool.props.disabled === true && textOf(s.ui, pool).includes("حوض القسم"), textOf(s.ui, pool));
    const calls = [];
    await s.type("data-cons-scan", undefined, "111222");
    s.byAttr("data-cons-scan").props.onKeyDown({ key: "Enter", preventDefault() { calls.push("preventDefault"); }, stopPropagation() { calls.push("stopPropagation"); } });
    await flush();
    check("Enter الماسح لا يحفظ النافذة ولا يصل مستمعاً خلفها", J(calls) === J(["preventDefault", "stopPropagation"]), J(calls));
    s.done();
    const forty = Array.from({ length: 40 }, (_, i) => ({ product_id: `p-y${i}`, qty: 1, unit: "stock" }));
    s = await openSheet({ value: forty, products: [...PRODUCTS, ...forty.map((e, i) => prod({ id: e.product_id, name: `مادة ${i}`, stock: 1 }))] });
    check("٤٠ سطراً ⇒ «+ مادة» مقفول", s.byAttr("data-cons-add")?.props.disabled === true);
    await s.scan("111222");
    check("  ومسحُ مادّةٍ جديدة يُرفض بـ«40 مادة بالأكثر» بلا سطرٍ زائد",
      s.ui.findAll("data-cons-row").length === 40 && textOf(s.ui, s.byAttr("data-cons-scan-note")).includes("40 مادة بالأكثر"), textOf(s.ui, s.byAttr("data-cons-scan-note")));
    s.done();
  });

  /* ── س) الرصيد ─────────────────────────────────────────────────────────── */
  section("س) الرصيدُ رصيدُ صفّ المادّة (عليه يكتب الصرف): سطرُ الوصفة برصيد الخادم، ومادّةٌ بقسمٍ بلا رقم");
  // قائمةُ البيع رصيدُها الصفُّ + حوضُ القسم (sellable.ts) أو لقطةٌ قديمة؛ والوصفةُ تقرأ الصفَّ من الخادم لحظةَ الفتح.
  reset({ recipeGet: async () => ({ ...RECIPE, lines: [{ ...RECIPE.lines[0], stock: 1 }, { ...RECIPE.lines[1], stock: 0 }] }) });
  await tryCase("stockSource", async () => {
    const BAND = prod({ id: "p-band", name: "ضماد", barcode: "121212", purchase_price: 100, stock: 9, section_id: "sec1" });
    const s = await openSheet({ products: [{ ...GLOVES, stock: 7 }, { ...SYR, stock: 5, section_id: "sec1" }, LYSE, BAND] });
    const stG = textOf(s.ui, within(s.byAttr("data-cons-row", "p-gloves"), "data-cons-stock")[0]);
    check("سطرُ وصفة: رصيدُ الخادم «الرصيد: 1 علبة» لا رقمُ قائمة البيع (7)", stG === "الرصيد: 1 علبة", J(stG));
    const stS = within(s.byAttr("data-cons-row", "p-syr"), "data-cons-stock")[0];
    check("  وصفُّها صفر وقائمةُ البيع ٥ بحوض قسمها: «الرصيد 0 — تنخصم وتصير بالسالب» (الصرفُ من الصفّ وحده)",
      stS?.props["data-cons-stock"] === "low" && textOf(s.ui, stS).includes("الرصيد 0 — تنخصم وتصير بالسالب"), textOf(s.ui, stS));
    await s.press("data-cons-add");
    await s.type("data-cons-search", undefined, "ضماد");
    const pick = s.byAttr("data-cons-pick", "p-band");
    check("«+ مادة»: مادّةٌ بقسمٍ بلا رقم رصيد (رقمُ القائمة يضمّ حوضاً لا يُصرف منه)", !!pick && !textOf(s.ui, pick).includes("الرصيد"), textOf(s.ui, pick));
    await s.press("data-cons-pick", "p-band");
    const band = s.byAttr("data-cons-row", "p-band");
    check("  وسطرُها بالورقة بلا سطر رصيد", !!band && within(band, "data-cons-stock").length === 0 && !textOf(s.ui, band).includes("الرصيد"), textOf(s.ui, band));
    await s.press("data-cons-add");
    await s.type("data-cons-search", undefined, "كفوف");
    const pg = textOf(s.ui, s.byAttr("data-cons-pick", "p-gloves"));
    check("  ومادّةُ الوصفة بالقائمة برصيد الخادم «الرصيد: 1» لا 7", pg.includes("الرصيد: 1") && !pg.includes("7"), J(pg));
    s.done();
  });

  /* ── ع) الخروج ─────────────────────────────────────────────────────────── */
  section("ع) ورقةٌ معدّلة لا تُرمى بلمسة: الستارةُ وEsc وX و«إغلاق» تسأل، والتحديثُ لا ينزل تحتها");
  // الستارةُ وEsc وX بـui/Dialog.tsx كلُّها tryClose ⇒ onClose الـDialog — فالفحصُ يناديه كما تناديه.
  const dialogs = (s) => s.ui.findAll("data-dialog");
  // غيابُ النافذة أو الزرّ يُسقط فحصَه هو (لا يرمي فيُخفي ما بعده) — فنسخةٌ قديمة تُري كلَّ فحصٍ يفشل وحده.
  const dismiss = async (s, i = 0) => { const d = dialogs(s)[i]; if (d) { d.props.onClose(); await flush(); } };
  const pressIf = async (s, attr, v) => { if (s.byAttr(attr, v)) await s.press(attr, v); };
  reset();
  await tryCase("leave", async () => {
    let s = await openSheet();
    await dismiss(s);
    check("ورقةٌ ما انلمست: الستارة/Esc/X تُغلقها فوراً بلا سؤال", J(s.calls) === J([["close"]]) && !s.byAttr("data-cons-leave"), J(s.calls));
    s.done();

    s = await openSheet();
    await s.type("data-cons-qty", "p-gloves", "3");
    await dismiss(s);
    check("بعد تعديل (كفوف 2 ⇒ 3): الستارة/Esc/X لا تُغلق — تسأل «تطلع وتضيّع تعديل هالحالة؟»",
      s.calls.length === 0 && !!s.byAttr("data-cons-leave") && s.text().includes("تطلع وتضيّع تعديل هالحالة؟"), J(s.calls));
    check("  والسؤالُ يقول ما يصير لو طلع: «البيعة تخصم الوصفة كما هي»", textOf(s.ui, s.byAttr("data-cons-leave")).includes("البيعة تخصم الوصفة كما هي"),
      textOf(s.ui, s.byAttr("data-cons-leave")));
    check("  والتعديلُ باقٍ تحته (3)", s.byAttr("data-cons-qty", "p-gloves")?.props.value === "3");
    check("  ونسخةٌ جديدة لا تنزل تحت تعديلٍ لم يُحفظ (holdUpdates)", UI.formHeld() === true);
    const hadNo = !!s.byAttr("data-cons-leave-no");
    await pressIf(s, "data-cons-leave-no");
    check("«لا، ارجع»: السؤالُ يروح والورقةُ مفتوحة بالتعديل", hadNo && !s.byAttr("data-cons-leave") && s.calls.length === 0 && s.byAttr("data-cons-qty", "p-gloves")?.props.value === "3", J(s.calls));
    await dismiss(s);
    const hadAsk = dialogs(s).length === 2;
    await dismiss(s, 1);
    check("  وEsc/ستارةُ نافذة السؤال نفسِها = «لا، ارجع» (لا تطلع)", hadAsk && !s.byAttr("data-cons-leave") && s.calls.length === 0 && s.byAttr("data-cons-qty", "p-gloves")?.props.value === "3", J(s.calls));
    s.calls.length = 0;
    await s.press("data-cons-close");
    check("«إغلاق» على ورقةٍ معدّلة يسأل كذلك", !!s.byAttr("data-cons-leave") && s.calls.length === 0, J(s.calls));
    const hadYes = !!s.byAttr("data-cons-leave-yes");
    s.calls.length = 0;
    await pressIf(s, "data-cons-leave-yes");
    check("  و«إي، طلّعني» ⇒ onClose مرّةً بلا حفظ", hadYes && J(s.calls) === J([["close"]]), J(s.calls));
    s.done();
    await flush();
    check("  والإمساكُ يُفلت بإزالة الورقة", UI.formHeld() === false);

    s = await openSheet();
    await s.type("data-cons-qty", "p-gloves", "3");
    await s.type("data-cons-qty", "p-gloves", "2.0");
    await dismiss(s);
    check("تعديلٌ رجع لنفس الكمية (3 ⇒ 2.0 = 2): يُغلق بلا سؤال، ولا إمساك", J(s.calls) === J([["close"]]) && UI.formHeld() === false, J(s.calls));
    s.done();

    s = await openSheet();
    await s.scan("333444");
    await dismiss(s);
    check("مادّةٌ انضافت بالمسح ثم الستارة: يسأل (المسحةُ ما تنرمي بصمت)", s.calls.length === 0 && !!s.byAttr("data-cons-leave"), J(s.calls));
    s.done();

    s = await openSheet({ value: [{ product_id: "p-syr", qty: 2, unit: "stock" }] });
    await s.press("data-cons-remove", "p-syr");
    await dismiss(s);
    check("تعديلٌ قائم وانشال سطرُه: السؤالُ يقول «تبقى القائمة اللي حفظتها قبل»",
      s.calls.length === 0 && textOf(s.ui, s.byAttr("data-cons-leave")).includes("تبقى القائمة اللي حفظتها قبل"), textOf(s.ui, s.byAttr("data-cons-leave")));
    s.done();

    s = await openSheet({ canEdit: false });
    await dismiss(s);
    check("للقراءة: الستارةُ تُغلق فوراً (ما يقدر يعدّل شي)", J(s.calls) === J([["close"]]));
    s.done();

    s = await openSheet();
    await s.type("data-cons-qty", "p-gloves", "4");
    await s.press("data-cons-save", "line");
    check("والحفظُ نفسُه لا يسأل: onSave مباشرةً", s.saves().length === 1 && !s.byAttr("data-cons-leave"), J(s.calls));
    s.done();
    await flush();
  });
  reset({ recipeGet: async () => ({ ...RECIPE, lines: [...RECIPE.lines,
    rl({ id: "r-dup", product_id: "p-gloves", product_name: "كفوف", qty: 3, unit: "sub", position: 2, units_per_box: 50, unit_cost: 5000, per_value: 300 })] }) });
  await tryCase("leaveFold", async () => {
    const s = await openSheet();
    await dismiss(s);
    check("طيُّ الدمج وحده (سطران ⇒ سطر) ليس تعديلاً: يُغلق بلا سؤال", J(s.calls) === J([["close"]]) && !s.byAttr("data-cons-leave"), J(s.calls));
    s.done();
  });

  /* ── ف) للقراءة بلا وصفة ───────────────────────────────────────────────── */
  section("ف) للقراءة على خدمةٍ بلا وصفة: لا «ضيف اللي استعملته» لمن لا يقدر يضيف");
  reset({ recipeGet: async () => ({ fingerprint: "fp0", flat_cost: null, lines: [] }) });
  await tryCase("readonlyNoRecipe", async () => {
    let s = await openSheet({ canEdit: false });
    let nr = textOf(s.ui, s.byAttr("data-cons-norecipe"));
    check("للقراءة: «هالخدمة ما إلها وصفة — ما ينخصم إلها شي» لا «ضيف اللي استعملته»", nr === "هالخدمة ما إلها وصفة — ما ينخصم إلها شي" && !s.text().includes("ضيف اللي استعملته"), J(nr));
    s.done();
    s = await openSheet({ canEdit: false, value: [{ product_id: "p-syr", qty: 2, unit: "stock" }] });
    nr = textOf(s.ui, s.byAttr("data-cons-norecipe"));
    check("  وللقراءة وبالسطر قائمةٌ محفوظة: «هالخدمة ما إلها وصفة — ينخصم اللي بالقائمة»", nr === "هالخدمة ما إلها وصفة — ينخصم اللي بالقائمة", J(nr));
    s.done();
    s = await openSheet();
    nr = textOf(s.ui, s.byAttr("data-cons-norecipe"));
    check("وللطبيب/المدير يبقى «هالخدمة ما إلها وصفة — ضيف اللي استعملته»", nr === "هالخدمة ما إلها وصفة — ضيف اللي استعملته", J(nr));
    s.done();
  });

  /* ── ص) علامةٌ واحدة، وأسماءٌ لقارئ الشاشة ────────────────────────────────── */
  section("ص) «+ مادة» بعلامة + واحدة، وكلُّ حقلٍ باسمه لقارئ الشاشة");
  reset();
  await tryCase("a11y", async () => {
    const s = await openSheet();
    const add = s.byAttr("data-cons-add");
    const icons = within(add, "data-icon").map((n) => n.props["data-icon"]);
    check("«+ مادة»: علامةُ + مرّةً واحدة — لا أيقونةَ قبل نصٍّ يبدأ بـ«+»", !!add && textOf(s.ui, add) === "+ مادة" && icons.length === 0, J({ text: textOf(s.ui, add), icons }));
    const qg = s.byAttr("data-cons-qty", "p-gloves");
    check("حقلُ الكمية باسم مادّته (aria-label «كفوف»)", qg?.props["aria-label"] === "كفوف", J(qg?.props["aria-label"]));
    check("  وكلُّ حقول الكمية مسمّاة", s.ui.findAll("data-cons-qty").every((n) => typeof n.props["aria-label"] === "string" && n.props["aria-label"].length > 0));
    const grp = within(s.byAttr("data-cons-row", "p-gloves"), "role", "group")[0];
    check("  ومجموعةُ الوحدة باسمها («وحدة \"كفوف\"»)", grp?.props["aria-label"] === "وحدة \"كفوف\"", J(grp?.props["aria-label"]));
    check("  وحقلٌ سليم aria-invalid=false", qg?.props["aria-invalid"] === false, J(qg?.props["aria-invalid"]));
    await s.type("data-cons-qty", "p-gloves", "0");
    await s.press("data-cons-save", "line");
    const bad = s.byAttr("data-cons-qty", "p-gloves");
    const why = bad?.props["aria-describedby"];
    check("  والمعلَّمُ بالأحمر aria-invalid=true ويشير لسببه (aria-describedby ⇒ «اكتب كمية أكبر من صفر…»)",
      bad?.props["aria-invalid"] === true && !!why && s.ui.all().some((n) => n.props?.id === why && "data-cons-badqty" in n.props), J({ inv: bad?.props["aria-invalid"], why }));
    check("  وحقلا المسح والبحث باسميهما", s.byAttr("data-cons-scan")?.props["aria-label"] === "امسح العلبة اللي استعملتها", J(s.byAttr("data-cons-scan")?.props["aria-label"]));
    await s.press("data-cons-add");
    check("  (والبحث: «ابحث عن مادة بالاسم أو الباركود…»)", s.byAttr("data-cons-search")?.props["aria-label"] === "ابحث عن مادة بالاسم أو الباركود…");
    s.done();
  });

  /* ── الإشعار ─────────────────────────────────────────────────────────────── */
  const openNotice = async (props, Host = null) => {
    const ui = mount(Host ? h(Host) : h(ConsumptionNotice, props));
    await flush();
    return { ui, text: () => ui.text(), empty: () => ui.container.children.length === 0, done: () => ui.unmount() };
  };
  const counted = (map) => { const calls = []; return { calls, fn: async (ids) => { calls.push(ids); return typeof map === "function" ? map(ids) : map; } }; };

  section("ح) البيعةُ النظيفة صامتة، والعجزُ يُقال، والكتمُ يبقى بالجهاز");
  await tryCase("clean", async () => {
    const api = counted({ inv1: inv({ it1: [spec({ product_id: "p-syr", product_name: "سرنجة", per_qty: 1, live_qty: 1 })] }) });
    reset({ invoiceConsumption: api.fn });
    let force = null;
    const Host = () => { const [n, set] = React.useState(0); force = set; return h(ConsumptionNotice, { mode: "sale", invoiceIds: ["inv1"], targets: [{ item_id: "x", qty: n }] }); };
    const n = await openNotice(null, Host);
    force(1); await flush(); force(2); await flush();
    check("بيعةٌ نظيفة ⇒ لا شيء", n.empty(), n.text());
    check("  والقراءةُ حصلت فعلاً، مرّةً واحدة رغم إعادة الرسم", api.calls.length === 1 && J(api.calls[0]) === J(["inv1"]), J(api.calls));
    n.done();
  });
  const shortMap = {
    inv1: inv({
      it1: [spec({ product_id: "p-gloves", product_name: "الكفوف", per_qty: 3, live_qty: 3, shortfall: 2 }),
        spec({ product_id: "p-syr", product_name: "سرنجة", per_qty: 1, live_qty: 1 })],
    }, [], [{ product_id: "p-gloves", name: "الكفوف", stock: -2 }]),
  };
  await tryCase("shortfall", async () => {
    reset({ invoiceConsumption: async () => shortMap });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const line = n.ui.text(n.ui.find("data-cons-short", "p-gloves"));
    check("العجز: «⚠️ الكفوف رصيدها بالنظام ما كفّى: انخصم 3 علبة والرصيد صار -2. سجّل فاتورة الشراء أو سوّ جرد.»",
      line.includes("⚠️ الكفوف رصيدها بالنظام ما كفّى: انخصم 3 علبة والرصيد صار -2. سجّل فاتورة الشراء أو سوّ جرد."), J(line));
    check("  ورصيدُها السالب لا يُقال مرّتين", !n.ui.find("data-cons-neg", "p-gloves"));
    n.ui.click(n.ui.find("data-cons-mute", "p-gloves")); await flush();
    // الكتمُ يُقال بمكانه: ضغطةٌ واحدة بالغلط (ومكانُ الزرّ بعد البيعة مكانُ «إيصال 80مم» قبلها) لا تكتم للأبد بصمت.
    const mutedLine = textOf(n.ui, n.ui.find("data-cons-muted", "p-gloves"));
    check("«لا تذكّرني بهالمادة» تشيل جملةَ العجز الآن، وبمكانها «انكتم تذكير \"الكفوف\" على هالجهاز» ومعه «رجّع التذكير»",
      !n.ui.find("data-cons-short", "p-gloves") && mutedLine.includes("انكتم تذكير \"الكفوف\" على هالجهاز")
        && textOf(n.ui, n.ui.find("data-cons-unmute", "p-gloves")) === "رجّع التذكير", n.text());
    check("  والكتمُ بمخزن العيادة: vp_cons_mute_c1 = [\"p-gloves\"]", mem.get("vp_cons_mute_c1") === J(["p-gloves"]), J(mem.get("vp_cons_mute_c1")));
    n.done();
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  والمرّة القادمة لا تُقال", n.empty(), n.text());
    n.done();
    globalThis.__user = { id: "u2", clinic_id: "c2" };
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وبعيادةٍ ثانية تُقال (المفتاحُ مفتاحُ العيادة)", !!n.ui.find("data-cons-short", "p-gloves"));
    n.done();
    globalThis.__user = { id: "u1", clinic_id: "c1" };
    mem.set("vp_cons_mute_c1", "{oops");
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  ومخزنٌ مكسور = لا كتم", !!n.ui.find("data-cons-short", "p-gloves"));
    n.done();
    globalThis.__user = { id: "u9", clinic_id: null };
    mem.clear();
    mem.set("vp_cons_mute_default", J(["p-gloves"]));
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وصاحبُ عيادةٍ بلا clinic_id: مفتاحُه u9 كمسوّدة البيع لا default", !!n.ui.find("data-cons-short", "p-gloves"));
    n.done();
  });
  await tryCase("shortfallSub", async () => {
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [spec({ product_id: "p-gloves", product_name: "كفوف", unit: "sub", unit_label: "زوج", per_qty: 3, per_div: 50, live_qty: 0.06, shortfall: 0.04 })] },
      [], [{ product_id: "p-gloves", name: "كفوف", stock: -0.04 }]) }) });
    const n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const line = n.text();
    check("وبالوحدة الصغيرة: «انخصم 3 زوج والرصيد صار -0.04 علبة»", line.includes("انخصم 3 زوج والرصيد صار -0.04 علبة"), J(line));
    n.done();
  });
  await tryCase("muteCap", async () => {
    reset({ invoiceConsumption: async () => shortMap });
    mem.set("vp_cons_mute_c1", J(Array.from({ length: 600 }, (_, i) => `m${i}`)));
    const n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    n.ui.click(n.ui.find("data-cons-mute", "p-gloves")); await flush();
    const kept = JSON.parse(mem.get("vp_cons_mute_c1") ?? "[]");
    check("الكتمُ يحفظ آخرَ ٥٠٠: الأحدثُ يبقى والأقدمُ يسقط", kept.length === 500 && kept[kept.length - 1] === "p-gloves" && kept.includes("m599") && !kept.includes("m0"),
      J([kept.length, kept[0], kept[kept.length - 1]]));
    n.done();
  });

  section("ط) ما لم يُخصم يُقال، وما صفّره الطبيبُ لا يُقال");
  await tryCase("skips", async () => {
    reset({ invoiceConsumption: async () => ({ inv1: inv({}, [
      { item_id: "it9", note: "service_missing", product_id: null, product_name: null, qty: null, unit: null, line_name: "تعقيم قطة", source: "none" },
      { item_id: "it8", note: "override_none", product_id: null, product_name: null, qty: null, unit: null, line_name: "فحص", source: "override" },
      { item_id: "it7", note: "in_trash", product_id: "p-x", product_name: "خيط", qty: 1, unit: "stock", line_name: "خياطة", source: "recipe" },
    ], [{ product_id: "p-syr", name: "سرنجة", stock: -1 }]) }) });
    const n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("service_missing: «\"تعقيم قطة\" ما انخصمت مستهلكاتها — الخدمة مو موجودة بالسحابة. حدّث الصفحة»",
      n.text().includes("\"تعقيم قطة\" ما انخصمت مستهلكاتها — الخدمة مو موجودة بالسحابة. حدّث الصفحة"), n.text());
    check("  والمحذوفة: «\"خيط\" ما انخصمت — المادة بالمحذوفات»", n.text().includes("\"خيط\" ما انخصمت — المادة بالمحذوفات"));
    check("  وoverride_none لا يُقال بالبيع", !n.text().includes("فحص") && !n.ui.find("data-cons-skip", "override_none"));
    // (تحقّقُ ui3) سطرُ مادّةٍ بلا مواصفةٍ بالفاتورة لا يقول العقدُ وحدتَه (StockNegative بلا by_weight): رقمُه وحده كما كان —
    // «علبة» عن مادّةٍ تنباع بالكيلو تخمينٌ يكذب. والوحدةُ تُقال حين تقولها مواصفةُ المادّة نفسِها (القسم «ث»).
    const negSyr = lineOf(n.ui, n.ui.find("data-cons-neg", "p-syr"));
    check("  والرصيدُ السالب لسطر مادّة يُقال برقمه: «\"سرنجة\" رصيدها صار -1» — بلا «علبة» بالتخمين", negSyr === "\"سرنجة\" رصيدها صار -1", J(negSyr || n.text()));
    n.done();
    reset({ invoiceConsumption: async () => ({ inv1: inv({}, [{ item_id: "it8", note: "override_none", product_id: null, product_name: null, qty: null, unit: null, line_name: "فحص", source: "override" }]) }) });
    const quiet = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وبيعةٌ ما فيها إلا override_none صامتة", quiet.empty(), quiet.text());
    quiet.done();
  });
  await tryCase("skipsAll", async () => {
    reset({ invoiceConsumption: async () => ({ inv1: inv({}, [
      { item_id: "it2", note: "old_device", product_id: null, product_name: null, qty: null, unit: null, line_name: "خدمة قديمة", source: "none" },
      { item_id: "it3", note: "product_gone", product_id: "p-g", product_name: "خيط", qty: 1, unit: "stock", line_name: "خياطة", source: "recipe" },
      { item_id: "it3", note: "pooled", product_id: "p-p", product_name: "شاش", qty: 1, unit: "stock", line_name: "خياطة", source: "recipe" },
      { item_id: "it3", note: "farm_stock", product_id: "p-f", product_name: "علف", qty: 1, unit: "stock", line_name: "خياطة", source: "recipe" },
      { item_id: "it3", note: "no_sub_unit", product_id: "p-n", product_name: "قطن", qty: 1, unit: "sub", line_name: "خياطة", source: "recipe" },
    ], [{ product_id: "p-z", name: "زرق", stock: -3 }]) }) });
    mem.set("vp_cons_mute_c1", J(["p-p", "p-z"]));   // كُتما ببيعةٍ سابقة بهالجهاز
    const n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const tx = n.text();
    check("old_device: «\"خدمة قديمة\" ما انخصمت مستهلكاتها — وصلت من جهاز ما تحدّث. حدّث الصفحة على كل جهاز»",
      tx.includes("\"خدمة قديمة\" ما انخصمت مستهلكاتها — وصلت من جهاز ما تحدّث. حدّث الصفحة على كل جهاز"), tx);
    check("  product_gone: «\"خيط\" ما انخصمت — المادة مو موجودة بالمخزن»", tx.includes("\"خيط\" ما انخصمت — المادة مو موجودة بالمخزن"), tx);
    check("  farm_stock: «\"علف\" ما انخصمت — من مخزون الحقل»", tx.includes("\"علف\" ما انخصمت — من مخزون الحقل"), tx);
    check("  no_sub_unit: «\"قطن\" ما انخصمت — ما إلها وحدة صغيرة»", tx.includes("\"قطن\" ما انخصمت — ما إلها وحدة صغيرة"), tx);
    check("  ومادّةٌ مكتومةٌ بهالجهاز تغيب بتخطّيها وبرصيدها السالب، والباقي يُقال", !tx.includes("شاش") && !tx.includes("زرق") && !n.ui.find("data-cons-neg", "p-z"), tx);
    n.done();
    mem.clear();
    const m = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وبلا كتم: «\"شاش\" ما انخصمت — رصيدها بحوض القسم» و«\"زرق\" رصيدها صار -3» (برقمه: بلا مواصفةٍ تقول وحدتَه)",
      m.text().includes("\"شاش\" ما انخصمت — رصيدها بحوض القسم") && lineOf(m.ui, m.ui.find("data-cons-neg", "p-z")) === "\"زرق\" رصيدها صار -3", m.text());
    m.done();
  });

  section("ي) فشلُ القراءة يُقال، ولا صمتَ عن فاتورةٍ ما انقرأت");
  await tryCase("readFail", async () => {
    let bad = 1;
    reset({ invoiceConsumption: async () => { if (bad-- > 0) throw new Error("offline"); return { inv1: inv({}) }; } });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    // (ui3) والإشعارُ يُرسم بعد بيعةِ موادٍّ وحدها أيضاً — فالفشلُ يقول الرصيدَ والمستهلكاتِ معاً، لا «المستهلكات» عن بيعةٍ بلا خدمة.
    check(`«${SALE_FAIL}» — بيعةٌ بلا خدمة (موادٌّ وحدها) فشلت قراءتُها تُقال بالرصيد، والجملةُ القديمة لا`,
      n.text().includes(SALE_FAIL) && !n.text().includes(OLD_SALE_FAIL) && !!n.ui.find("data-cons-fail"), n.text());
    n.ui.click(n.ui.find("data-cons-retry")); await flush();
    check("  و«أعد المحاولة» تقرأ من جديد (فاتورةٌ نظيفة ⇒ صمت)", n.empty(), n.text());
    n.done();
    reset({ invoiceConsumption: async () => ({}) });
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("فاتورةُ البيعة غائبةٌ بالجواب ⇒ «ما گدرنا نتأكد من الرصيد والمستهلكات» لا صمت", n.text().includes(SALE_FAIL), n.text());
    n.done();
    reset({ invoiceConsumption: async () => { throw new Error("offline"); } });
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"] });
    check("وبالمعاينة: «ما گدرنا نقرأ المستهلكات» مع «أعد المحاولة»", n.text().includes("ما گدرنا نقرأ المستهلكات") && !!n.ui.find("data-cons-retry"), n.text());
    n.done();
    // أحداثُها متّسقة (مجموعُها صفر): حيٌّ «oops» يُقرأ صفراً كان سيمرّ بفحص المجموع ويقول «1 علبة» — فالفشلُ من الرقم نفسه.
    reset({ invoiceConsumption: async () => ({ inv1: timed(inv({ it1: [spec({ product_id: "p", product_name: "x", live_qty: "oops", moves: [mv(SALE, 1), mv(OWN, -1)] })] })) }) });
    clock.now = SENT;
    n = await openNotice({ mode: "returned", invoiceIds: ["inv1"], sentAt: SENT, cashBack: true });
    check("ورقمٌ ما ينقرأ بالجواب ⇒ فشلٌ يُقال لا صفرٌ يُصدَّق", !!n.ui.find("data-cons-fail"), n.text());
    n.done();
    // قائمةٌ مكسورة بالجواب لا تصير «لا شيء»: البيعةُ الصامتة تعني «ما صار شي» — عمّا لم يُقرأ.
    reset({ invoiceConsumption: async () => ({ inv1: { items: {}, skips: { oops: 1 }, negatives: [] } }) });
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("والتخطّياتُ ليست مصفوفة ⇒ «ما گدرنا نتأكد من الرصيد والمستهلكات» لا صمت", n.text().includes(SALE_FAIL), n.text());
    n.done();
    reset({ invoiceConsumption: async () => ({ inv1: { items: {}, skips: [], negatives: "x" } }) });
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  والسالبُ ليس مصفوفة ⇒ كذلك", n.text().includes(SALE_FAIL), n.text());
    n.done();
  });

  section("ك) المعاينة بالضبط: ٢ مل من قنينة ٥٠٠ لكلّ حالة × ٣ حالات");
  const lyseMap = { inv1: inv({ it1: [spec({ product_id: "p-lyse", product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, live_qty: 0.012 })] }) };
  await tryCase("preview", async () => {
    reset({ invoiceConsumption: async () => lyseMap });
    let n = await openNotice({ mode: "preview", invoiceIds: ["inv1"] });
    check("الفاتورة كلُّها: «الترجيع يرجّع للمخزن: Lyse ×6 مل»", n.text().includes("الترجيع يرجّع للمخزن: Lyse ×6 مل"), n.text());
    n.done();
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"], action: "delete" });
    check("  ونافذةُ الحذف (action=delete): «الحذف يرجّع للمخزن: Lyse ×6 مل» لا «الترجيع»", n.text().includes("الحذف يرجّع للمخزن: Lyse ×6 مل") && !n.text().includes("الترجيع"), n.text());
    n.done();
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"], targets: [{ item_id: "it1", qty: 1 }] });
    check("  وحالةٌ واحدة باقية: «Lyse ×4 مل»", n.text().includes("Lyse ×4 مل"), n.text());
    n.done();
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"], targets: [{ item_id: "other", qty: 0 }] });
    check("  وسطرٌ ما لمسه الترجيع لا يُحسب", n.empty(), n.text());
    n.done();
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [spec({ product_id: "p-syr", product_name: "سرنجة", per_qty: 0.7, live_qty: 2.1 }),
      spec({ product_id: "p-v", product_name: "قنينة", unit: "sub", unit_label: "مل", per_qty: 1, per_div: 3, live_qty: 1 })] }) }) });
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"], targets: [{ item_id: "it1", qty: 3 }] });
    check("  وهدفٌ = الكمية الحالية (0.7 × 3 = 2.1، و1/3 × 3) ⇒ لا شيء", n.empty(), n.text());
    n.done();
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"], targets: [{ item_id: "it1", qty: 1 }] });
    check("  و٣ ⇒ ١: «سرنجة ×1.4 علبة، قنينة ×2 مل» (T(1) = 0.333333333 فالباقي × 3 = 2 بالضبط)", n.text().includes("سرنجة ×1.4 علبة، قنينة ×2 مل"), n.text());
    n.done();
  });

  section("ل) بعد الترجيع: ما رجّعه هذا الفعل بدفعته، و«سجّلها هدر» بدفعاته لمن له المخزون");
  /** قراءةٌ يصل جوابُها والساعةُ عند T1 (والطلبُ أُرسل والساعةُ عند SENT). */
  const readAt = (map) => async () => { clock.now = T1; return map; };
  /** «رجّعنا» كما تمرّره الأمّ: sentAt قبل طلبها، وcashBack ما ردّته من مال بهذا الفعل. */
  const openRet = (props = {}) => { clock.now = SENT; return openNotice({ mode: "returned", invoiceIds: ["inv1"], sentAt: SENT, cashBack: true, ...props }); };
  const named = (...pairs) => { globalThis.__repo = { listInvoiceItemsFor: async () => pairs.map(([id, name]) => ({ id, name })) }; };
  await tryCase("returned", async () => {
    reset({ invoiceConsumption: readAt(TWICE) });
    named(["it1", "تعقيم قطة"]);
    let n = await openRet();
    check("ترجيعٌ بعد مرتجعٍ أقدم: «رجعت الفلوس، ورجّعنا مستهلكات \"تعقيم قطة\" للمخزن (4 مل Lyse).» — دفعتُه وحدها لا المتراكم (6 مل)",
      n.text().includes("رجعت الفلوس، ورجّعنا مستهلكات \"تعقيم قطة\" للمخزن (4 مل Lyse).") && !n.text().includes("6 مل"), n.text());
    const btn = n.ui.find("data-cons-waste", "inv1");
    check("  و«إذا انصرفت فعلاً: سجّلها هدر» لمن له manageInventory", !!btn && n.text().includes("إذا انصرفت فعلاً:") && n.ui.text(btn) === "سجّلها هدر");
    if (btn) { n.ui.click(btn); await flush(); }
    check(`  والزرّ يفتح /inventory/count?tab=waste&inv=inv1&at=${OWN} — دفعةُ هذا الفعل وحدها (ما رجع قبله لا يُعبّأ ثانيةً)`,
      J(globalThis.__nav) === J([`/inventory/count?tab=waste&inv=inv1&at=${OWN}`]), J(globalThis.__nav));
    n.done();
    globalThis.__caps = new Set();
    n = await openRet();
    check("وبلا manageInventory: الجملةُ بلا زرٍّ ولا «إذا انصرفت»", n.text().includes("رجّعنا مستهلكات") && !n.ui.find("data-cons-waste") && !n.text().includes("إذا انصرفت"), n.text());
    n.done();
    globalThis.__caps = new Set(["manageInventory"]);
    // «رجعت الفلوس» بعلاماتها معاً — وكلُّ جملةٍ محايدة هنا بكمية الدفعة (4 لا 6).
    const plain = "رجّعنا مستهلكات للمخزن (4 مل Lyse).";
    for (const [name, props, who] of [
      ["الأمُّ ما ردّت مالاً بهذا الفعل (cashBack=false: فاتورةُ دين، أو حذف)", { cashBack: false }, () => named(["it1", "تعقيم قطة"])],
      ["  وبلا cashBack أصلاً", { cashBack: undefined }, () => named(["it1", "تعقيم قطة"])],
      ["  وأسماءُ السطور ما وصلت", {}, () => { globalThis.__repo = { listInvoiceItemsFor: async () => { throw new Error("offline"); } }; }],
      ["  وبعد حذف الفاتورة (سطورُها راحت)", {}, () => named()],
      ["  وبعد تعديلٍ شال سطرَ الخدمة (السطورُ الباقية بمعرّفاتٍ جديدة)", {}, () => named(["it-kept-new", "علف"])],
    ]) {
      who();
      n = await openRet(props);
      check(`${name} ⇒ «${plain}» بلا «رجعت الفلوس»`, n.text().includes(plain) && !n.text().includes("رجعت الفلوس"), n.text());
      n.done();
    }
    // التعديل: محفّزُ الحذف يردّ السطرَ القديم والربطُ يصرف الجديد بالدفعة نفسها — الصافي وحده، ولا «رجعت الفلوس».
    reset({ invoiceConsumption: readAt(editAfter(0.004, 0.008, 0.004)) });
    named(["it1", "تعقيم قطة"], ["it2", "تعقيم قطة"]);
    n = await openRet();
    check("مرتجعٌ قبل ساعة ثم تعديلٌ ٢ ⇒ ١: الصافي حالةٌ «رجّعنا مستهلكات للمخزن (2 مل Lyse).» — والتعديلُ لا يقول «رجعت الفلوس» ولو قالتها الأمُّ وانقرأت الأسماء",
      n.text().includes("رجّعنا مستهلكات للمخزن (2 مل Lyse).") && !n.text().includes("رجعت الفلوس"), n.text());
    n.done();
    reset({ invoiceConsumption: readAt(editAfter(0.004, 0.008, 0.008)) });
    n = await openRet();
    check("  ومرتجعٌ ثم تعديلٌ ما غيّر السطر (٢ ⇒ ٢): القديمُ رجع والربطُ صرفه بالدفعة نفسها ⇒ لا شيء", n.empty(), n.text());
    n.done();
    reset({ invoiceConsumption: readAt(editAfter(0.008, 0.004, 0.008)) });
    n = await openRet();
    check("  ومرتجعُ حالتين ثم تعديلٌ رفع السطر (١ ⇒ ٢): ما رجع شيءٌ بهذا الفعل ⇒ لا شيء", n.empty(), n.text());
    n.done();
    // ترجيعٌ الآن لفاتورةٍ عُدّلت قبل ساعة: مواصفةُ الربط وُلدت بدفعةٍ أقدم — فالدفعةُ ترجيعٌ لا تعديل.
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({
      it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OLD, -0.012)] })],
      it2: [lyse({ spec_id: "s-relink", live_qty: 0, restored_qty: 0.012, source: "relink", moves: [mv(OLD, 0.012), mv(OWN, -0.012)] })],
    })) }) });
    named(["it2", "تعقيم قطة"]);
    n = await openRet();
    check("ترجيعٌ الآن لفاتورةٍ عُدّلت قبل ساعة: «رجعت الفلوس، ورجّعنا مستهلكات \"تعقيم قطة\" للمخزن (6 مل Lyse).» — ربطٌ قديم لا يجعل الترجيعَ تعديلاً",
      n.text().includes("رجعت الفلوس، ورجّعنا مستهلكات \"تعقيم قطة\" للمخزن (6 مل Lyse)."), n.text());
    n.done();
  });

  section("ن) النافذة بالميكروثانية، ودفعتان بداخلها تصاعدياً، وبلا sentAt لا شيء، والشكلُ الناقص فشلٌ يُقال");
  await tryCase("window", async () => {
    // حدثٌ عند الحدّ تماماً (now − WIN) داخل، والميكروثانيةُ قبله خارجة: النافذة = (T1 − SENT)·1000 + 250000.
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({ it1: [lyse({ live_qty: 0.004, restored_qty: 0.008,
      moves: [mv(SALE, 0.012), mv(NOW - WIN - 1, -0.004), mv(NOW - WIN, -0.004)] })] })) }) });
    named(["it1", "تعقيم قطة"]);
    let n = await openRet();
    check(`الحدّ: حدثٌ عند now − ${WIN} µs يُعدّ وما قبله بميكروثانيةٍ لا ⇒ «(2 مل Lyse)» لا 4`,
      n.text().includes("(2 مل Lyse).") && !n.text().includes("4 مل"), n.text());
    n.done();
    // دفعتان بداخلها (فعلٌ سبق الضغطةَ بأقلّ من قراءة + ٢٥٠ مللي): كلتاهما، والوجهةُ بهما تصاعدياً لا بترتيب ورودهما.
    const A = NOW - 900_000, B = NOW - 200_000;
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({
      it1: [lyse({ live_qty: 0.008, restored_qty: 0.004, moves: [mv(SALE, 0.012), mv(B, -0.004)] })],
      it3: [spec({ spec_id: "s-syr", product_id: "p-syr", product_name: "سرنجة", live_qty: 0, restored_qty: 1, moves: [mv(SALE, 1), mv(A, -1)] })],
    })) }) });
    n = await openRet();
    const w = n.ui.find("data-cons-waste", "inv1");
    if (w) { n.ui.click(w); await flush(); }
    check(`  ودفعتان بداخلها ⇒ «سجّلها هدر» بـat=${A},${B} تصاعدياً`, J(globalThis.__nav) === J([`/inventory/count?tab=waste&inv=inv1&at=${A},${B}`]), J(globalThis.__nav));
    n.done();
    reset({ invoiceConsumption: readAt(TWICE) });
    named(["it1", "تعقيم قطة"]);
    clock.now = SENT;
    n = await openNotice({ mode: "returned", invoiceIds: ["inv1"], cashBack: true });
    check("بلا sentAt (أمٌّ لم تمرّر لحظةَ طلبها): «رجّعنا» لا يقول شيئاً — لا يعرف أيَّ دفعةٍ دفعتُه", n.empty(), n.text());
    n.done();
    // غيابُ ما يقرؤه «رجّعنا» خطأُ شكل: «أعد المحاولة» — لا «ما رجع شي» ولا المتراكمُ مكانه.
    for (const [name, map] of [
      ["مواصفةٌ بلا moves", { inv1: timed(inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012 })] })) }],
      ["  وفاتورةٌ بلا now_us", { inv1: inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OWN, -0.012)] })] }) }],
      ["  وحدثٌ بلا at_us", { inv1: timed(inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), { qty: -0.012 }] })] })) }],
      // وأحداثٌ ناقصة كالغائبة: المواصفةُ وُلدت بحدثها، وحيُّها مجموعُ أحداثها — فارغةٌ تقول «ما رجع شي»، وناقصةٌ أقلَّ ممّا رجع.
      ["  ومواصفةٌ أحداثُها فارغة (وحيُّها صفر)", { inv1: timed(inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [] })] })) }],
      ["  وأحداثٌ ناقصة (المرتجعُ الأقدم غائب: مجموعُها 0.004 والحيُّ 0)", { inv1: timed(inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OWN, -0.008)] })] })) }],
    ]) {
      reset({ invoiceConsumption: readAt(map) });
      named(["it1", "تعقيم قطة"]);
      n = await openRet();
      check(`${name} ⇒ «ما گدرنا نقرأ المستهلكات» مع «أعد المحاولة»`,
        !!n.ui.find("data-cons-fail") && n.text().includes("ما گدرنا نقرأ المستهلكات") && !!n.ui.find("data-cons-retry") && !n.ui.find("data-cons-returned"), n.text());
      n.done();
    }
  });
  await tryCase("retry", async () => {
    // «أعد المحاولة» تقرأ بعد دقيقة — والأوقاتُ كما تقع: الطلبُ عند SENT، والفعلُ انتهى عند 1240 قبل أن يُرسم الإشعار عند 1250
    // (t0، وأوّلُ قراءةٍ فشلت). ساعةُ الخادم S(t) = NOW + (t − 1400)·1000. وجهازٌ ثانٍ رجّع الحالتين الباقيتين عند 30000.
    // وساعةٌ مقرّبة (Firefox يقرّب performance.now لـ١٠٠ مللي): now() الإعادة عند 60910 وساعةُ إرسالها تقول 61000.
    const S = (t) => NOW + (t - 1400) * 1000;
    const RETRY = 61_000, MINE = S(1240), LATER = S(30_000);
    let calls = 0;
    reset({ invoiceConsumption: async () => {
      calls++;
      if (calls === 1) { clock.now = T1; throw new Error("offline"); }
      clock.now = RETRY + 500;
      return { inv1: { ...inv({ it1: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(MINE, -0.004), mv(LATER, -0.008)] })] }), now_us: S(60_910) } };
    } });
    named(["it1", "تعقيم قطة"]);
    clock.now = SENT + 250;
    const n = await openNotice({ mode: "returned", invoiceIds: ["inv1"], sentAt: SENT, cashBack: true });
    const failedFirst = !!n.ui.find("data-cons-fail");
    clock.now = RETRY;
    const r = n.ui.find("data-cons-retry");
    if (r) { n.ui.click(r); await flush(); }
    const w = n.ui.find("data-cons-waste", "inv1");
    if (w) { n.ui.click(w); await flush(); }
    check(`«أعد المحاولة» بعد دقيقة: ترجيعُ جهازٍ ثانٍ بعد أوّل قراءة ليس «هذا الفعل» ⇒ «(2 مل Lyse)» لا 6، و«سجّلها هدر» بـat=${MINE} وحدها (وبساعةٍ مقرّبة)`,
      failedFirst && n.text().includes("(2 مل Lyse).") && !n.text().includes("6 مل") && J(globalThis.__nav) === J([`/inventory/count?tab=waste&inv=inv1&at=${MINE}`]),
      `${n.text()} ${J(globalThis.__nav)}`);
    n.done();
  });

  section("ق) الكتمُ يُقال بمكانه ويُتراجع عنه بنفس الإشعار — والمكتومُ من قبل يغيب كما تقرّر");
  await tryCase("unmute", async () => {
    reset({ invoiceConsumption: async () => shortMap });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    n.ui.click(n.ui.find("data-cons-mute", "p-gloves")); await flush();
    const un = n.ui.find("data-cons-unmute", "p-gloves");
    if (un) { n.ui.click(un); await flush(); }
    check("«رجّع التذكير» بنفس الإشعار: جملةُ العجز ترجع ومعها زرُّ الكتم", !!un && !!n.ui.find("data-cons-short", "p-gloves") && !!n.ui.find("data-cons-mute", "p-gloves") && !n.ui.find("data-cons-muted"), n.text());
    check("  والمخزنُ ما عاد يكتمها (vp_cons_mute_c1 بلاها)", !JSON.parse(mem.get("vp_cons_mute_c1") ?? "[]").includes("p-gloves"), J(mem.get("vp_cons_mute_c1")));
    n.done();
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  والإشعارُ القادم يقولها", !!n.ui.find("data-cons-short", "p-gloves"), n.text());
    n.done();
    mem.set("vp_cons_mute_c1", J(["m1", "p-gloves", "m2"]));
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  ومكتومةٌ بإشعارٍ سابق تغيب كلُّها — لا سطرَ «انكتم» عن كتمٍ ما صار هنا", n.empty(), n.text());
    n.done();
    // والتراجعُ يشيلها وحدها: ما كتمه الجهازُ غيرَها يبقى.
    mem.set("vp_cons_mute_c1", J(["m1", "m2"]));
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    n.ui.click(n.ui.find("data-cons-mute", "p-gloves")); await flush();
    const un2 = n.ui.find("data-cons-unmute", "p-gloves");
    if (un2) { n.ui.click(un2); await flush(); }
    check("  والتراجعُ يشيل هالمادّة وحدها من المكتوم (m1 وm2 باقيتان)", J(JSON.parse(mem.get("vp_cons_mute_c1") ?? "[]")) === J(["m1", "m2"]), J(mem.get("vp_cons_mute_c1")));
    n.done();
  });

  section("ر) مادّةٌ تنباع بالوزن (by_weight من الخادم): «كغ» بالأوضاع الثلاثة لا «علبة» — وبلا العلامة «علبة» كما كان");
  const sand = (o) => spec({ product_id: "p-sand", product_name: "رمل قطط", by_weight: true, per_qty: 0.5, ...o });
  await tryCase("kg", async () => {
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [sand({ live_qty: 0.5, shortfall: 0.3 })] }, [], [{ product_id: "p-sand", name: "رمل قطط", stock: -0.3 }]) }) });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("البيعة: «⚠️ رمل قطط رصيدها بالنظام ما كفّى: انخصم 0.5 كغ والرصيد صار -0.3.» لا «علبة»",
      n.text().includes("⚠️ رمل قطط رصيدها بالنظام ما كفّى: انخصم 0.5 كغ والرصيد صار -0.3.") && !n.text().includes("علبة"), n.text());
    n.done();
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"] });
    check("  والمعاينة: «الترجيع يرجّع للمخزن: رمل قطط ×0.5 كغ»", n.text().includes("الترجيع يرجّع للمخزن: رمل قطط ×0.5 كغ") && !n.text().includes("علبة"), n.text());
    n.done();
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({ it1: [sand({ live_qty: 0, restored_qty: 0.5, moves: [mv(SALE, 0.5), mv(OWN, -0.5)] })] })) }) });
    named(["it1", "إيواء ليلة"]);
    n = await openRet();
    check("  وبعد الترجيع: «رجعت الفلوس، ورجّعنا مستهلكات \"إيواء ليلة\" للمخزن (0.5 كغ رمل قطط).»",
      n.text().includes("رجعت الفلوس، ورجّعنا مستهلكات \"إيواء ليلة\" للمخزن (0.5 كغ رمل قطط).") && !n.text().includes("علبة"), n.text());
    n.done();
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [spec({ product_id: "p-x", product_name: "شاش", per_qty: 0.5, live_qty: 0.5 })] }) }) });
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"] });
    check("  وبلا by_weight (قراءةٌ بلا العلامة): «شاش ×0.5 علبة» — لا تخمين", n.text().includes("شاش ×0.5 علبة"), n.text());
    n.done();
  });

  section("ش) قراءةٌ عالقة لا تُشبه بيعةً نظيفة: مهلةٌ ثم «أعد المحاولة»، وأسماءُ السطور لا تحجب ما قُرئ");
  await tryCase("stall", async () => {
    timers.fake();
    try {
      let calls = 0;
      reset({ invoiceConsumption: () => (++calls === 1 ? new Promise(() => {}) : Promise.resolve(shortMap)) });
      let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
      await timers.advance(9_999);
      check("البيعة والقراءةُ عالقة: قبل ١٠ ثوانٍ لا شيء (كالتحميل)", n.empty(), n.text());
      await timers.advance(1);
      check("  وعند ١٠ ثوانٍ «انحفظت الفاتورة، بس ما گدرنا نتأكد من الرصيد والمستهلكات» مع «أعد المحاولة» — لا صمتٌ كبيعةٍ نظيفة",
        n.text().includes(SALE_FAIL) && !!n.ui.find("data-cons-retry"), n.text());
      const r1 = n.ui.find("data-cons-retry");
      if (r1) { n.ui.click(r1); await flush(); }
      check("  و«أعد المحاولة» تقرأ من جديد وتقول العجز", !!n.ui.find("data-cons-short", "p-gloves"), n.text());
      n.done();
      // «رجّعنا»: الدفترُ وصل وأسماءُ السطور عالقة ⇒ بعد ٣ ثوانٍ الجملةُ المحايدة وزرُّ الهدر — لا إشعارٌ فارغ.
      reset({ invoiceConsumption: readAt(TWICE) });
      globalThis.__repo = { listInvoiceItemsFor: () => new Promise(() => {}) };
      n = await openRet();
      check("«رجّعنا» والأسماءُ عالقة: لا شيء قبل المهلة", n.empty(), n.text());
      await timers.advance(3_000);
      check("  وبعد ٣ ثوانٍ: «رجّعنا مستهلكات للمخزن (4 مل Lyse).» وزرُّ الهدر — الأسماءُ تسمّي الجملة ولا تحجب ما قُرئ",
        n.text().includes("رجّعنا مستهلكات للمخزن (4 مل Lyse).") && !n.text().includes("رجعت الفلوس") && !!n.ui.find("data-cons-waste", "inv1"), n.text());
      n.done();
      // «رجّعنا» والدفترُ نفسُه عالق ⇒ «ما گدرنا نقرأ المستهلكات» بعد المهلة، والإعادةُ تقول ما رجع بدفعته.
      calls = 0;
      reset({ invoiceConsumption: () => { if (++calls === 1) return new Promise(() => {}); clock.now = T1; return Promise.resolve(TWICE); } });
      named(["it1", "تعقيم قطة"]);
      n = await openRet();
      await timers.advance(10_000);
      check("«رجّعنا» والدفترُ عالق: عند ١٠ ثوانٍ «ما گدرنا نقرأ المستهلكات» مع «أعد المحاولة»",
        !!n.ui.find("data-cons-fail") && n.text().includes("ما گدرنا نقرأ المستهلكات") && !!n.ui.find("data-cons-retry"), n.text());
      const r2 = n.ui.find("data-cons-retry");
      if (r2) { n.ui.click(r2); await flush(); }
      check("  و«أعد المحاولة» تقول ما رجع بدفعته «(4 مل Lyse)»", n.text().includes("(4 مل Lyse)."), n.text());
      n.done();
    } finally { timers.real(); }
  });

  section("ت) تعديلٌ رفع سطرَ خدمة: ما صرفه بلا رصيد يُقال بصافي دفعته (لا منع، والسالبُ يُقال) — والصافي صفر صامت");
  /* تعديلٌ الآن رفع «تعقيم» ١ ⇒ ٢ (وصفتُه علبةُ كفوف): محفّزُ الحذف ردّ القديم (−1) والربطُ صرف ٢ بالدفعة نفسها —
     كما يكتبها الخادم (0255 edit ثم _consumption_relink)، ومواصفةُ الربط تحمل عجزَ حركتها كلِّها (0.5). */
  const gl = (o) => spec({ product_id: "p-gloves", product_name: "كفوف", per_qty: 1, ...o });
  const editNow = (before, after, stock, extra = {}) => ({ inv1: timed(inv({
    it1: [gl({ live_qty: 0, restored_qty: before, moves: [mv(SALE, before), mv(OWN, -before)] })],
    it2: [gl({ spec_id: "s-relink", source: "relink", live_qty: after, shortfall: stock < 0 ? Math.min(after, -stock) : 0, moves: [mv(OWN, after)] })],
    ...extra,
  }, [], stock < 0 ? [{ product_id: "p-gloves", name: "كفوف", stock }] : [])) });
  await tryCase("editUse", async () => {
    reset({ invoiceConsumption: readAt(editNow(1, 2, -0.5)) });
    named(["it2", "تعقيم"]);
    let n = await openRet({ cashBack: false });
    const line = textOf(n.ui, n.ui.find("data-cons-short", "p-gloves"));
    check("رفعُ ١ ⇒ ٢ والرصيدُ صار −0.5: «⚠️ كفوف رصيدها بالنظام ما كفّى: انخصم 1 علبة والرصيد صار -0.5.» (صافي الدفعة ١ لا ٢)",
      line.includes("⚠️ كفوف رصيدها بالنظام ما كفّى: انخصم 1 علبة والرصيد صار -0.5. سجّل فاتورة الشراء أو سوّ جرد."), J(line || n.text()));
    check("  ومعه «لا تذكّرني بهالمادة»، ولا «رجّعنا» ولا زرُّ هدر (ما رجع شي)",
      !!n.ui.find("data-cons-mute", "p-gloves") && !n.text().includes("رجّعنا") && !n.ui.find("data-cons-waste"), n.text());
    if (n.ui.find("data-cons-mute", "p-gloves")) { n.ui.click(n.ui.find("data-cons-mute", "p-gloves")); await flush(); }
    check("  والكتمُ هنا كالبيعة: يُقال بمكانه ويُحفظ", !!n.ui.find("data-cons-muted", "p-gloves") && JSON.parse(mem.get("vp_cons_mute_c1") ?? "[]").includes("p-gloves"));
    n.done();
    n = await openRet({ cashBack: false });
    check("  ومادّةٌ مكتومة لا تُقال بعدها", n.empty(), n.text());
    n.done();
    reset({ invoiceConsumption: readAt(editNow(1, 1, -0.5)) });
    n = await openRet({ cashBack: false });
    check("تعديلٌ ما غيّر السطر والرصيدُ سالبٌ من قبل (الربطُ يكتب عجزَه ثانيةً): الصافي صفر ⇒ لا شيء", n.empty(), n.text());
    n.done();
    reset({ invoiceConsumption: readAt(editNow(1, 2, 3)) });
    n = await openRet({ cashBack: false });
    check("رفعٌ والرصيدُ كفّى (3): صامت كبيعةٍ نظيفة", n.empty(), n.text());
    n.done();
    // تعديلٌ نقّص Lyse ورفع الكفوف بالدفعة نفسها: الاثنان يُقالان كلٌّ بجملته.
    reset({ invoiceConsumption: readAt(editNow(1, 2, -0.5, { it3: [lyse({ live_qty: 0, restored_qty: 0.012, moves: [mv(SALE, 0.012), mv(OWN, -0.012)] })],
      it4: [lyse({ spec_id: "s-lyse-relink", source: "relink", live_qty: 0.004, moves: [mv(OWN, 0.004)] })] })) });
    named(["it2", "تعقيم"], ["it4", "تحليل"]);
    n = await openRet({ cashBack: false });
    check("نقصٌ ورفعٌ بتعديلٍ واحد: «رجّعنا مستهلكات للمخزن (4 مل Lyse).» وزرُّ الهدر، وتحذيرُ الكفوف معه",
      n.text().includes("رجّعنا مستهلكات للمخزن (4 مل Lyse).") && !!n.ui.find("data-cons-waste", "inv1") && textOf(n.ui, n.ui.find("data-cons-short", "p-gloves")).includes("انخصم 1 علبة والرصيد صار -0.5"), n.text());
    n.done();
    // مادّةٌ واحدة بوحدتين بالدفعة: سطرٌ نقص بالمل (+0.004 علبة) وسطرٌ زاد بالعلبة (−0.01) ⇒ صافيها صرفُ 0.006 علبة — لا «رجّعنا 2 مل» وتحذيرٌ معاً.
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({
      it1: [lyse({ live_qty: 0.008, restored_qty: 0.004, moves: [mv(SALE, 0.012), mv(OWN, -0.004)] })],
      it2: [spec({ spec_id: "s-lyse-box", product_id: "p-lyse", product_name: "Lyse", per_qty: 0.01, live_qty: 0.01, moves: [mv(OWN, 0.01)], source: "relink" })],
    }, [], [{ product_id: "p-lyse", name: "Lyse", stock: -0.002 }])) }) });
    n = await openRet({ cashBack: false });
    check("مادّةٌ بوحدتين صافيها صرف: «انخصم 0.006 علبة والرصيد صار -0.002» ولا «رجّعنا» عنها",
      textOf(n.ui, n.ui.find("data-cons-short", "p-lyse")).includes("انخصم 0.006 علبة والرصيد صار -0.002") && !n.text().includes("رجّعنا"), n.text());
    n.done();
  });

  section("ث) (ui3) سالبُ سطر المادّة: بوحدة مخزونه، وبزرّ كتمه وتراجعِه بمكانه — «لا إنذارَ بلا كتم» (قرارُ المالك ب٢)");
  /* بيعةُ مادّةٍ من قائمةٍ قديمة (جهازٌ ثانٍ باع آخرَ علبة) نزل بها رصيدُها تحت الصفر: سطرُ المادّة لا مواصفةَ له، والقراءةُ
     تقولها بـnegatives وحده — والإشعارُ يُرسم بعد كلّ بيعةٍ فيها سطرُ مادّة، فبلا كتمٍ تُقال بكلّ بيعةٍ بعدها ولا يُسكتها شيء. */
  const staleSale = { inv1: inv({}, [], [{ product_id: "p-syr", name: "سرنجة", stock: -1 }]) };
  await tryCase("negMute", async () => {
    reset({ invoiceConsumption: async () => staleSale });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const row = n.ui.find("data-cons-neg", "p-syr");
    check("بيعةُ مادّةٍ نزل رصيدُها تحت الصفر: «\"سرنجة\" رصيدها صار -1» — برقمه (سطرُ مادّةٍ بلا مواصفة لا يقول العقدُ وحدتَه)",
      lineOf(n.ui, row) === "\"سرنجة\" رصيدها صار -1", J(lineOf(n.ui, row) || n.text()));
    const btn = within(row, "data-cons-mute", "p-syr")[0];
    check("  وبسطرها «لا تذكّرني بهالمادة»", !!btn && textOf(n.ui, btn) === "لا تذكّرني بهالمادة", n.text());
    if (btn) { n.ui.click(btn); await flush(); }
    check("  والكتمُ يُقال بمكانه: «انكتم تذكير \"سرنجة\" على هالجهاز» ومعه «رجّع التذكير»، والسالبُ غاب",
      !!btn && !n.ui.find("data-cons-neg", "p-syr") && textOf(n.ui, n.ui.find("data-cons-muted", "p-syr")).includes("انكتم تذكير \"سرنجة\" على هالجهاز")
        && textOf(n.ui, n.ui.find("data-cons-unmute", "p-syr")) === "رجّع التذكير", n.text());
    check("  ويُحفظ بمخزن كتم العيادة نفسِه: vp_cons_mute_c1 = [\"p-syr\"]", mem.get("vp_cons_mute_c1") === J(["p-syr"]), J(mem.get("vp_cons_mute_c1")));
    const un = n.ui.find("data-cons-unmute", "p-syr");
    if (un) { n.ui.click(un); await flush(); }
    check("  و«رجّع التذكير» يعيد السالبَ بزرّ كتمه ويشيلها من المخزن",
      !!un && !!within(n.ui.find("data-cons-neg", "p-syr"), "data-cons-mute", "p-syr")[0] && !n.ui.find("data-cons-muted")
        && !JSON.parse(mem.get("vp_cons_mute_c1") ?? "[]").includes("p-syr"), `${n.text()} ${J(mem.get("vp_cons_mute_c1"))}`);
    const again = n.ui.find("data-cons-mute", "p-syr");
    if (again) { n.ui.click(again); await flush(); }
    n.done();
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وبعد كتمها: البيعةُ القادمة بالسالب نفسِه صامتة — لا سطرَ «انكتم» عن كتمٍ ما صار هنا", !!again && n.empty(), n.text());
    n.done();
  });
  await tryCase("negUnit", async () => {
    // سطرُ خدمةٍ صرف من رمل القطط والرصيدُ كفّى، ثم سطرُ المادّة نفسِها بيع من قائمةٍ قديمة: مواصفتُها بالفاتورة تقول by_weight؛
    // والسرنجةُ بنفس البيعة سطرُ مادّةٍ بلا مواصفة.
    const sandSale = (o) => ({ inv1: inv({ it1: [spec({ product_id: "p-sand", product_name: "رمل قطط", per_qty: 0.5, live_qty: 0.5, ...o })] }, [],
      [{ product_id: "p-sand", name: "رمل قطط", stock: -0.3 }, { product_id: "p-syr", name: "سرنجة", stock: -1 }]) });
    // (تحقّقُ ui3) الوحدةُ حين يقولها الخادمُ عن المادّة نفسِها وحدها: by_weight بمواصفتها true ⇒ «كغ»، false ⇒ «علبة»؛
    // وغيابُه (خادمٌ أقدم) أو null أو سطرُ مادّةٍ بلا مواصفة ⇒ الرقمُ وحده كما كان قبل ui3 — «علبة» عن رصيدٍ بالكيلو كذبة.
    const sandOf = (ui) => lineOf(ui, ui.find("data-cons-neg", "p-sand"));
    reset({ invoiceConsumption: async () => sandSale({ by_weight: true }) });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("مادّةٌ تنباع بالوزن (by_weight=true بمواصفتها): «\"رمل قطط\" رصيدها صار -0.3 كغ» لا «علبة»", sandOf(n.ui) === "\"رمل قطط\" رصيدها صار -0.3 كغ", J(sandOf(n.ui) || n.text()));
    check("  ومادّةٌ بلا مواصفة بنفس البيعة: «\"سرنجة\" رصيدها صار -1» — كيلو غيرِها لا يصير كيلوها، ولا «علبة» بالتخمين",
      lineOf(n.ui, n.ui.find("data-cons-neg", "p-syr")) === "\"سرنجة\" رصيدها صار -1", n.text());
    n.done();
    reset({ invoiceConsumption: async () => sandSale({ by_weight: false }) });
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وby_weight=false: «\"رمل قطط\" رصيدها صار -0.3 علبة» — العقدُ قالها", sandOf(n.ui) === "\"رمل قطط\" رصيدها صار -0.3 علبة", J(sandOf(n.ui) || n.text()));
    n.done();
    for (const [name, o] of [["  وبلا by_weight (خادمٌ أقدم)", {}], ["  وby_weight=null", { by_weight: null }]]) {
      reset({ invoiceConsumption: async () => sandSale(o) });
      n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
      check(`${name}: «\"رمل قطط\" رصيدها صار -0.3» برقمه كما كان — لا «علبة» ولا «كغ» بالتخمين`, sandOf(n.ui) === "\"رمل قطط\" رصيدها صار -0.3", J(sandOf(n.ui) || n.text()));
      n.done();
    }
    // سطرُ مادّةٍ تنباع بالوزن بيع من قائمةٍ قديمة (لا مواصفةَ لها بالفاتورة): كان يُقال «-0.5 علبة» عن رصيدٍ بالكيلو.
    reset({ invoiceConsumption: async () => ({ inv1: inv({}, [], [{ product_id: "p-sand", name: "رمل قطط", stock: -0.5 }]) }) });
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  وسطرُ مادّةٍ بلا مواصفة (تنباع بالكيلو) وسالبُه بلا by_weight (خادمٌ أقدم): «\"رمل قطط\" رصيدها صار -0.5» — لا «-0.5 علبة»", sandOf(n.ui) === "\"رمل قطط\" رصيدها صار -0.5", J(sandOf(n.ui) || n.text()));
    n.done();
  });
  await tryCase("negOwnUnit", async () => {
    // (r3) StockNegative.by_weight: الخادمُ يقول وحدةَ السالب نفسِه (products.sold_by_weight لحظةَ القراءة) — وبه وحده يعرفها سطرُ مادّةٍ
    // بلا مواصفة (بيع من قائمةٍ قديمة). القاعدة: `n.bw ?? (قاعدةُ المواصفة)` — علامةُ السالب أوّلاً، وnull أو غيرُ منطقيّ لا يقرّر.
    const sandOf = (ui) => lineOf(ui, ui.find("data-cons-neg", "p-sand"));
    const sandSpec = (bw) => ({ it1: [spec({ product_id: "p-sand", product_name: "رمل قطط", per_qty: 0.5, live_qty: 0.5, by_weight: bw })] });
    const sale = (o, items = {}) => ({ inv1: inv(items, [], [{ product_id: "p-sand", name: "رمل قطط", stock: -0.5, ...o }]) });
    const say = async (data) => {
      reset({ invoiceConsumption: async () => data });
      const n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
      const got = sandOf(n.ui) || n.text();
      n.done();
      return got;
    };
    let got = await say(sale({ by_weight: true }));
    check("(r3) سطرُ مادّةٍ بلا مواصفة وسالبُه يقول by_weight=true: «\"رمل قطط\" رصيدها صار -0.5 كغ» — لا الرقمُ وحده", got === "\"رمل قطط\" رصيدها صار -0.5 كغ", J(got));
    got = await say(sale({ by_weight: false }));
    check("  (r3) وسالبُه يقول by_weight=false: «… -0.5 علبة» — العقدُ قالها", got === "\"رمل قطط\" رصيدها صار -0.5 علبة", J(got));
    got = await say(sale({ by_weight: false }, sandSpec(true)));
    check("  (r3) وعلامةُ السالب قبل مواصفتها: السالبُ false والمواصفةُ true ⇒ «علبة» (n.bw ?? المواصفة)", got === "\"رمل قطط\" رصيدها صار -0.5 علبة", J(got));
    got = await say(sale({ by_weight: null }, sandSpec(true)));
    check("  وby_weight=null بالسالب لا يقرّر: قاعدةُ المواصفة ⇒ «كغ»", got === "\"رمل قطط\" رصيدها صار -0.5 كغ", J(got));
    got = await say(sale({ by_weight: "true" }));
    check("  وعلامةٌ ليست منطقيةً بالسالب («true» نصّاً) لا تقرّر: بلا مواصفة ⇒ الرقمُ وحده", got === "\"رمل قطط\" رصيدها صار -0.5", J(got));
  });

  section("ذ) (ui3) by_weight من العقد نفسِه: لا نوعَ محلّيّ يوسّع ConsumptionSpec");
  /* تغييرُ نوعٍ وحده لا سلوكَ له يُفحص، فهذا الفحصُ الوحيدُ هنا بالنصّ (بلا التعليقات): نوعٌ محلّيّ (`ConsumptionSpec & {…}`)
     يُبقي الشاشةَ تُبنى لو غاب الحقلُ من العقد أو تبدّل اسمُه، فتقول «علبة» عن الكيلو بصمت — والقراءةُ المباشرة يُسقطها tsc. */
  {
    const code = String(SOURCE).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const direct = /\bkg: s\.by_weight === true,/.test(code), widened = /ConsumptionSpec\s*&/.test(code) || /\bSpecWire\b/.test(code);
    check("normalizeInv يقرأ s.by_weight من العقد مباشرةً (kg: s.by_weight === true) — لا نوعَ محلّيّ يوسّعه", direct && !widened, J({ direct, widened }));
  }

  section("ض) (تحقّقُ ui3) اسمٌ طويلٌ بلا فاصل يلتفّ بعموده — لا يرسم فوق زرّه ولا تقع ضغطةُ آخره عليه");
  /* مقيسٌ بالمتصفّح على ٣٧٥ بكسل (المكوّنُ الحقيقيّ وButton وCSS التطبيق): عمودُ سطر السالب ١٤٨ بكسل واسمُ
     «Metronidazole500mgTabletsBox» ١٩٤ — فطلع ٣٨ بكسلاً فوق «لا تذكّرني بهالمادة»، وelementFromPoint هناك = الزرّ: ضغطةٌ على
     آخر الاسم تكتم المادّة. ومثلُه العجزُ و«انكتم …» وسطرُ «رجّعنا» بجانب «سجّلها هدر» (عمودُه ١٠٣). الاسمُ بيانُ مستخدمٍ بأيّ طول. */
  const LONG = "Metronidazole500mgTabletsBox";
  await tryCase("wrap", async () => {
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [spec({ product_id: "p-l1", product_name: `${LONG}-Short`, per_qty: 3, live_qty: 3, shortfall: 2 })] },
      [{ item_id: "it2", note: "pooled", product_id: "p-l2", product_name: `${LONG}-Pool`, qty: 1, unit: "stock", line_name: "خياطة", source: "recipe" }],
      [{ product_id: "p-l1", name: `${LONG}-Short`, stock: -2 }, { product_id: "p-l3", name: `${LONG}-Neg`, stock: -1 }]) }) });
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check(`البيعة: سالبٌ باسمٍ بلا فاصل («${LONG}») يلتفّ بعموده (overflow-wrap: break-word يُورَث) — لا يركب «لا تذكّرني بهالمادة»`,
      !!n.ui.find("data-cons-neg", "p-l3") && wraps(textNode(n.ui, `${LONG}-Neg`)), n.text());
    check("  وجملةُ العجز كذلك", !!n.ui.find("data-cons-short", "p-l1") && wraps(textNode(n.ui, `${LONG}-Short`)), n.text());
    check("  وسطرُ التخطّي كذلك (لا يطلع من الإشعار)", !!n.ui.find("data-cons-skip", "pooled") && wraps(textNode(n.ui, `${LONG}-Pool`)), n.text());
    const m = n.ui.find("data-cons-mute", "p-l3");
    if (m) { n.ui.click(m); await flush(); }
    check("  و«انكتم تذكير …» باسمه بجانب «رجّع التذكير» كذلك", !!n.ui.find("data-cons-muted", "p-l3") && wraps(textNode(n.ui, `انكتم تذكير "${LONG}-Neg"`)), n.text());
    n.done();
    reset({ invoiceConsumption: readAt({ inv1: timed(inv({ it1: [spec({ product_id: "p-l4", product_name: LONG, live_qty: 0, restored_qty: 1, moves: [mv(SALE, 1), mv(OWN, -1)] })] })) }) });
    named(["it1", "تعقيم قطة"]);
    n = await openRet();
    check("«رجّعنا» باسمٍ بلا فاصل بجانب «إذا انصرفت فعلاً: سجّلها هدر» يلتفّ بعموده", !!n.ui.find("data-cons-waste", "inv1") && wraps(textNode(n.ui, LONG)), n.text());
    n.done();
    reset({ invoiceConsumption: async () => ({ inv1: inv({ it1: [spec({ product_id: "p-l5", product_name: LONG, live_qty: 1 })] }) }) });
    n = await openNotice({ mode: "preview", invoiceIds: ["inv1"] });
    check("  والمعاينةُ كذلك", !!n.ui.find("data-cons-notice", "preview") && wraps(textNode(n.ui, LONG)), n.text());
    n.done();
  });

  section("ظ) (تحقّقُ ui3) كتمٌ ما انحفظ بالجهاز (المخزنُ ممتلئ أو مقفول) يُقال «هنا بس» — لا «على هالجهاز» عمّا يرجع بالإشعار الجاي");
  const ONCE = (name) => `انكتم تذكير "${name}" هنا بس — ما گدرنا نحفظه على هالجهاز، فيرجع المرّة الجاية`;
  await tryCase("muteUnsaved", async () => {
    reset({ invoiceConsumption: async () => staleSale });
    store.failWrites = true;
    let n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const b = n.ui.find("data-cons-mute", "p-syr");
    if (b) { n.ui.click(b); await flush(); }
    const note = textOf(n.ui, n.ui.find("data-cons-muted", "p-syr"));
    check(`المخزنُ يرمي: كتمُ السالب ⇒ «${ONCE("سرنجة")}» — لا «انكتم تذكير "سرنجة" على هالجهاز» (الكتابةُ تُسمَع)`,
      note.includes(ONCE("سرنجة")) && !note.includes("انكتم تذكير \"سرنجة\" على هالجهاز"), J(note || n.text()));
    check("  ومعه «رجّع التذكير»، والمخزنُ ما فيه شي", textOf(n.ui, n.ui.find("data-cons-unmute", "p-syr")) === "رجّع التذكير" && !mem.has("vp_cons_mute_c1"), J([...mem.keys()]));
    n.done();
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    check("  والإشعارُ الجاي يقولها كما قيل («فيرجع المرّة الجاية»)", !!n.ui.find("data-cons-neg", "p-syr"), n.text());
    const b2 = n.ui.find("data-cons-mute", "p-syr");
    if (b2) { n.ui.click(b2); await flush(); }
    const u2 = n.ui.find("data-cons-unmute", "p-syr");
    if (u2) { n.ui.click(u2); await flush(); }
    check("  و«رجّع التذكير» بعد كتمٍ ما انحفظ يرجّع السالبَ بزرّ كتمه", !!u2 && !!within(n.ui.find("data-cons-neg", "p-syr"), "data-cons-mute", "p-syr")[0] && !n.ui.find("data-cons-muted"), n.text());
    n.done();
    reset({ invoiceConsumption: async () => shortMap });
    store.failWrites = true;
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const g = n.ui.find("data-cons-mute", "p-gloves");
    if (g) { n.ui.click(g); await flush(); }
    check(`  وجملةُ العجز كذلك: «${ONCE("الكفوف")}»`, textOf(n.ui, n.ui.find("data-cons-muted", "p-gloves")).includes(ONCE("الكفوف")), n.text());
    n.done();
    store.failWrites = false;
    n = await openNotice({ mode: "sale", invoiceIds: ["inv1"] });
    const g2 = n.ui.find("data-cons-mute", "p-gloves");
    if (g2) { n.ui.click(g2); await flush(); }
    const ok = textOf(n.ui, n.ui.find("data-cons-muted", "p-gloves"));
    check("  والمخزنُ رجع يكتب: «انكتم تذكير \"الكفوف\" على هالجهاز» وينحفظ — لا «هنا بس» بعده",
      ok.includes("انكتم تذكير \"الكفوف\" على هالجهاز") && !ok.includes("هنا بس") && mem.get("vp_cons_mute_c1") === J(["p-gloves"]), J([ok, mem.get("vp_cons_mute_c1")]));
    n.done();
  });
  return R;
}

/* ---- الطفرات: كلُّ واحدةٍ لازم يُسقطها فحص ------------------------------------------ */
const MUTANTS = [
  ["الإغلاقُ يُبقي التعديل", "if (!p.open) return null;\n  return <SheetBody {...p} />;", "return <div hidden={!p.open}><SheetBody {...p} /></div>;"],
  ["القراءةُ فقط تُفتح للكلّ","const editable = canEdit && rows !== null", "const editable = rows !== null"],
  ["مجموعُ السطر بلا الحالات", "roundDiv(v.qtyM * lineM, 1000n)", "v.qtyM"],
  ["زرٌّ واحد دائماً", "{editable && (many ? (", "{editable && (false ? ("],
  ["«هالحالة بس» ترسل line", "onClick={() => save(\"one\")}", "onClick={() => save(\"line\")}"],
  ["لا مقارنةَ بالوصفة", "if (rs.kind === \"ok\" && sameConsumables(shown, recipeRows))", "if (false)"],
  ["«رجّع للوصفة» ترسل []", "onClick={() => onSave(null, null, \"line\")}", "onClick={() => onSave([], null, \"line\")}"],
  ["القائمةُ الفارغة تُحسب وصفة", "sameConsumables(shown, recipeRows)) { onSave(null, null, scope); return; }", "(sameConsumables(shown, recipeRows) || !shown.length)) { onSave(null, null, scope); return; }"],
  ["المجهولُ يُطبَّع قبل أن يُقال", "{ code }) });", "{ code: code.trim().toUpperCase() }) });"],
  ["فشلُ الوصفة = وصفةٌ فارغة", "(e) => { if (alive) setRs({ kind: \"failed\", e }); },", "() => { if (alive) { setRs({ kind: \"ok\", r: { fingerprint: \"\", flat_cost: null, lines: [] } }); setRows((cur) => cur ?? []); } },"],
  ["مادّةٌ غائبة تُرسل", "      sendable = false;\n", "\n"],
  ["الكلفةُ لا تُرسل", "onSave(next, sent.every((v) => v.known) ? fromScaled(est, 2) : null, scope);", "onSave(next, null, scope);"],
  ["الورقةُ تكتب على props", "removeRow = (i: number) => { setRows((cur) => (cur ? cur.filter((_, j) => j !== i) : cur));",
    "removeRow = (i: number) => { if (Array.isArray(value)) (value as unknown as Row[]).splice(i, 1); setRows((cur) => (cur ? cur.filter((_, j) => j !== i) : cur));"],
  ["الإضافةُ بالعلبة دائماً", "unit: subUnitMilli(p) !== null ? \"sub\" : \"stock\" }", "unit: \"stock\" }"],
  ["الحوضُ يُضاف بالمسح", "if (p.pooled) return t(\"rcp.pooled\", \"رصيدها بحوض القسم — ما تنخصم\");\n    const i", "const i"],
  ["الإضافةُ تتجاهل الرمز الإضافيّ", "findByCode(products, code) ?? rescueScan(products, code)?.product ?? matchTruncatedCode(products, code)", "products.find((x) => x.barcode === code)"],
  ["العجزُ لا يُقال", "if (!specs.some((s) => s.shortM > 0n)) continue;", "if (true) continue;"],
  ["الكتمُ لا يُحفظ", "    const saved = writeMuted(clinicKey, next);\n", "    const saved = true;\n"],
  ["مفتاحُ الكتم بلا عيادة", "const muteKey = (clinic: string) => `vp_cons_mute_${clinic}`;", "const muteKey = (_clinic: string) => `vp_cons_mute`;"],
  ["مفتاحُ العيادة default دائماً", "const clinicKey = user?.clinic_id ?? user?.id ?? \"default\";", "const clinicKey = user?.clinic_id ?? \"default\";"],
  ["مخزنُ كتمٍ مكسور يكتم الكلّ", "  } catch {\n    return new Set();\n  }", "  } catch {\n    return new Set([\"p-gloves\"]);\n  }"],
  ["service_missing صامت", "case \"service_missing\":", "case \"service_missing_off\" as ConsumptionSkip[\"note\"]:"],
  ["المحذوفةُ صامتة","case \"in_trash\":", "case \"in_trash_off\" as ConsumptionSkip[\"note\"]:"],
  ["الرصيدُ السالب صامت", "if (short.has(n.product_id)) continue;", "continue;"],
  ["override_none يُقال", "default: break;", "default: said(`${k.note}|${k.line_name}`, k.line_name, null); break;"],
  ["فشلُ البيعة صامت", "if (mode === \"sale\" && (st.kind === \"failed\" || st.invs.some((x) => x === null)))", "if (mode === \"sale\" && st.kind === \"failed\")"],
  ["رقمٌ مكسور يصير صفراً", "const scaled = (x: unknown, s: number): bigint => roundScaled(x as number, s);", "const scaled = (x: unknown, s: number): bigint => { try { return roundScaled(x as number, s); } catch { return 0n; } };"],
  ["الصغيرةُ بلا × per_div", "unit === \"sub\" ? roundDiv(n * dM, NANO)", "unit === \"sub\" ? roundDiv(n, MILLI_PER_NANO)"],
  ["سطرٌ لم يُلمس يُحسب صفراً", "const target = tmap ? tmap.get(s.item) : 0;", "const target = tmap ? (tmap.get(s.item) ?? 0) : 0;"],
  ["زرُّ الهدر للكلّ", "{can(\"manageInventory\") && (", "{true && ("],
  ["وجهةُ الهدر بلا التبويب", "/inventory/count?tab=waste&inv=", "/inventory/count?inv="],
  ["بلا أسماء السطور", "named.length > 0 && named.every((x): x is string => !!x)", "false"],
  ["القراءةُ بكلّ رسم", "}, [idsKey, mode, tick, sentAt]);", "}, [idsKey, mode, tick, sentAt, targets]);"],
  // ── ما أُصلح بالتدقيق (كلٌّ منها كان السلوكَ القائم قبله) ──
  ["«رجعت الفلوس» بلا علامتها", "const refund = cashBack === true && !edit && named.length > 0 && named.every((x): x is string => !!x);", "const refund = cashBack === true && !edit;"],
  ["قراءةٌ فشلت تُسقط المجهول", "} else if (!rl && rs.kind !== \"ok\") {", "} else if (false) {"],
  ["كلفةُ المجهول صفر", "onSave(next, sent.every((v) => v.known) ? fromScaled(est, 2) : null, scope);", "onSave(next, fromScaled(est, 2), scope);"],
  ["كلفةُ الحالة رقمٌ ناقص", "v: caseKnown ? money(fromScaled(caseC, 2)) : \"—\"", "v: money(fromScaled(caseC, 2))"],
  ["الرصيدُ بلا وحدته", "v.row.unit === \"sub\" ? `${formatQty(v.stock)} ${v.stockWord}` : formatQty(v.stock)", "formatQty(v.stock)"],
  ["قائمةٌ مكسورة تصير فارغة",
    "  if (!Array.isArray(raw.skips) || !Array.isArray(raw.negatives)) throw new Error(\"invoice_consumption_shape\");\n  const skips = raw.skips;\n  const negatives = raw.negatives\n",
    "  const skips = Array.isArray(raw.skips) ? raw.skips : [];\n  const negatives = (Array.isArray(raw.negatives) ? raw.negatives : [])\n"],
  ["الخدمةُ الغائبة تَعِد بالخصم", "{own || svcMissing ? t(", "{own ? t("],
  // ── ما كان مَوعوداً بلا فحص ──
  ["الدمجُ لا يُجمع", "if (at >= 0 && m !== null && out[at].m !== null) { out[at].m = (out[at].m as bigint) + m; continue; }", ""],
  ["التكرارُ بوحدتين يمرّ بلا اسمه", "if (seen.has(keyOf(v.row.id))) {", "if (false) {"],
  ["الغائبةُ عن القائمة بلا كلفة الوصفة", "k = roundScaled(rl.unit_cost ?? 0, 6);", "k = 0n;"],
  ["الحفظُ والوصفةُ بالطريق", "const ready = editable && rs.kind !== \"loading\";", "const ready = editable;"],
  ["الحوضُ يُختار بالقائمة", "x.pooled ? t(\"rcp.pooled\"", "false ? t(\"rcp.pooled\""],
  ["Enter يتسرّب خلف الورقة", "e.preventDefault(); e.stopPropagation();", ""],
  ["المسحُ يتجاوز الأربعين بصمت", "if (rows && rows.length >= MAX_RECIPE_LINES && !rows.some((r) => keyOf(r.id) === keyOf(p.id))) {", "if (false) {"],
  ["old_device صامت", "case \"old_device\":", "case \"old_device_off\" as ConsumptionSkip[\"note\"]:"],
  ["product_gone صامت", "case \"product_gone\":", "case \"product_gone_off\" as ConsumptionSkip[\"note\"]:"],
  ["الحوضُ صامت", "case \"pooled\":", "case \"pooled_off\" as ConsumptionSkip[\"note\"]:"],
  ["الحقلُ صامت", "case \"farm_stock\":", "case \"farm_stock_off\" as ConsumptionSkip[\"note\"]:"],
  ["بلا وحدةٍ صغيرة صامت", "case \"no_sub_unit\":", "case \"no_sub_unit_off\" as ConsumptionSkip[\"note\"]:"],
  ["الكتمُ لا يُخفي التخطّي", "if (seen.has(key) || (pid && muted.has(pid))) return;", "if (seen.has(key)) return;"],
  ["الكتمُ لا يُخفي السالب", "if (muted.has(pid)) return null;", "if (muted.has(pid) && kind === \"short\") return null;"],
  ["الكتمُ يحفظ الأقدم", ".slice(-500)", ".slice(0, 500)"],
  // ── ui2: «رجّعنا» بدفعة هذا الفعل، والمال بعلاماته، والمعاينةُ بالحذف، والرجوعُ للوصفة لكلّ دور، والرصيدُ رصيدُ الصفّ ──
  ["الدفعةُ كلُّ الأحداث (المتراكم)", "if (now - m.at <= w && now - m.at >= after) seen.add(m.at);", "seen.add(m.at);"],
  ["النافذةُ بلا مهلة الـ٢٥٠", "+ 250_000n;", "+ 0n;"],
  ["حدُّ النافذة مفتوح", "if (now - m.at <= w && ", "if (now - m.at < w && "],
  ["t1 قبل القراءة", "    const part = await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);\n    // الجوابُ وصل: now() الخادم لهذه القراءة قبل هذه اللحظة حتماً.\n    const t1 = performance.now();\n",
    "    const t1 = performance.now();\n    const part = await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);\n"],
  ["بلا sentAt يُقال من الصفر", "typeof sentAt === \"number\" && Number.isFinite(sentAt) ? sentAt : null;", "typeof sentAt === \"number\" && Number.isFinite(sentAt) ? sentAt : (mode === \"returned\" ? 0 : null);"],
  ["صرفُ الربط لا يُطرح", "(at.has(m.at) ? a - m.n : a)", "(at.has(m.at) && m.n < 0n ? a - m.n : a)"],
  ["التعديلُ يقول «رجعت الفلوس»", "cashBack === true && !edit && named", "cashBack === true && named"],
  ["المالُ بلا cashBack", "const refund = cashBack === true && !edit", "const refund = !edit"],
  ["ربطٌ قديم يجعل الترجيعَ تعديلاً", "if (s.relink && s.moves.length > 0 && at.has(s.moves.reduce((a, m) => (m.at < a ? m.at : a), s.moves[0].at))) edit = true;", "if (s.relink) edit = true;"],
  // (الغائبةُ تصير حدثاً واحداً قديماً بقدر الحيّ — تمرّ بفحص المجموع وتقول «ما رجع شي»؛ `= []` تمسكها الآن الأحداثُ الفارغة.)
  ["moves الغائبة = لا شيء", "if (win && !Array.isArray(s.moves)) throw new Error(\"invoice_consumption_shape\");", "if (win && !Array.isArray(s.moves)) s.moves = [{ at_us: 0, qty: s.live_qty }];"],
  ["now_us الغائبُ صفر", "const now = usOf(raw.now_us);", "const now = raw.now_us == null ? 0n : usOf(raw.now_us);"],
  ["حدثٌ بلا وقتٍ يُتخطّى", "({ at: usOf(m?.at_us), n: scaled(m?.qty, 9) })", "({ at: usOf(m?.at_us ?? 0), n: scaled(m?.qty, 9) })"],
  ["الشكلُ الصارم بكلّ وضع", "if (win && !Array.isArray(s.moves))", "if (!Array.isArray(s.moves))"],
  ["الهدرُ بلا الدفعات", "&at=${inv.batches.join(\",\")}", ""],
  ["الدفعاتُ بلا ترتيب", "batches = [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));", "batches = [...seen];"],
  ["الحذفُ يقول «الترجيع»", "{action === \"delete\"", "{false"],
  ["«رجّع للوصفة» للمحرّر وحده", "      {own && (", "      {editable && own && ("],
  ["الرصيدُ من قائمة البيع", "const stock = rowStock(p, rl);", "const stock = p ? Number(p.stock) : (rl?.stock ?? null);"],
  ["سطرُ الوصفة برصيد القائمة", "rl ? rl.stock : p && !p.section_id ? Number(p.stock) : null;", "p && !p.section_id ? Number(p.stock) : rl ? rl.stock : null;"],
  ["مادّةٌ بقسمٍ برقم القائمة", "rl ? rl.stock : p && !p.section_id ? Number(p.stock) : null;", "rl ? rl.stock : p ? Number(p.stock) : null;"],
  ["«+ مادة» برصيد القائمة", "const st = rowStock(x, rlm.get(keyOf(x.id)) ?? null);", "const st = Number(x.stock);"],
  // ── تدقيقُ ui2: «أعد المحاولة» لا تتبنّى فعلاً جاء بعد أوّل قراءة، وأحداثٌ فارغةٌ أو ناقصة فشلٌ يُقال ──
  ["دفعةٌ بعد أوّل قراءة تُعدّ", " && now - m.at >= after", ""],
  ["أوّلُ قراءةٍ تتجدّد بكلّ محاولة", "const t0 = first.current && first.current.key === key ? first.current.t0 : performance.now();", "const t0 = performance.now();"],
  ["الطرفُ الأحدث بلا مهلة", "const after = BigInt(Math.floor((win.ts - win.t0) * 1000)) - 250_000n;", "const after = BigInt(Math.floor((win.ts - win.t0) * 1000));"],
  ["ts بعد وصول القراءة", "    const ts = performance.now();\n    const part = await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);\n",
    "    const part = await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);\n    const ts = performance.now();\n"],
  ["أحداثٌ فارغة تمرّ", "if (!s.moves.length || s.moves.reduce(", "if (s.moves.reduce("],
  ["الحيُّ لا يُقارَن بأحداثه", "if (!s.moves.length || s.moves.reduce((a, m) => a + m.n, 0n) !== s.liveN) throw", "if (!s.moves.length) throw"],
  // ── w5a: الخروجُ يسأل، وللقراءة بلا وعد، وعلامةٌ واحدة وأسماء، والكتمُ يُتراجع عنه، والكيلو، والمهلة، وصرفُ التعديل ──
  ["الستارةُ تُغلق بلا سؤال", "<Dialog open onClose={tryClose} size=\"lg\"", "<Dialog open onClose={onClose} size=\"lg\""],
  ["«إغلاق» بلا سؤال", "data-cons-close onClick={tryClose}", "data-cons-close onClick={onClose}"],
  ["التعديلُ يُقارَن بنصّه", "${milliOf(r.qty) ?? `?${qtyText(r.qty)}`}", "${qtyText(r.qty)}"],
  ["طيُّ الدمج يُعدّ تعديلاً", "setBase((cur) => cur ?? foldEntries(r.lines));", "setBase((cur) => cur ?? r.lines.map((l) => ({ id: l.product_id, qty: String(l.qty), unit: l.unit })));"],
  ["السؤالُ بلا إمساك", "  useEffect(() => (changed ? holdUpdates(Infinity) : undefined), [changed]);\n", "\n"],
  ["«إي، طلّعني» لا تُغلق", "onClick={() => { setLeave(false); onClose(); }}", "onClick={() => setLeave(false)}"],
  ["Esc على السؤال يطلع", "<Dialog open={leave} onClose={() => setLeave(false)}", "<Dialog open={leave} onClose={onClose}"],
  ["السؤالُ يَعِد بالوصفة دائماً", "{own\n            ? t(\"rcp.leaveAskOwn\"", "{false\n            ? t(\"rcp.leaveAskOwn\""],
  ["للقراءة «ضيف اللي استعملته»", "{editable\n                  ? t(\"rcp.noRecipe\"", "{true\n                  ? t(\"rcp.noRecipe\""],
  ["للقراءة بقائمةٍ «ما ينخصم شي»", ": own && rows.length > 0", ": false"],
  ["«+ مادة» بأيقونةٍ قبل «+»", "data-cons-add\n", "data-cons-add leftIcon={<RotateCcw size={14} />}\n"],
  ["الكميةُ بلا اسم", "aria-label={v.name} aria-invalid={bad}", "aria-invalid={bad}"],
  ["المعلَّمُ بلا aria-invalid", "aria-invalid={bad} aria-describedby", "aria-invalid={false} aria-describedby"],
  ["سببُ المعلَّم بلا ربط", "aria-describedby={bad ? `${uid}-bad-${i}` : undefined}", "aria-describedby={undefined}"],
  ["مجموعةُ الوحدة بلا اسم", "role=\"group\"\n                          aria-label=", "role=\"group\"\n                          data-x="],
  ["المسحُ بلا اسم", "aria-label={t(\"rcp.scanPh\", \"امسح العلبة اللي استعملتها\")}", ""],
  ["الكتمُ بلا تراجع", "if (fresh.has(pid)) {", "if (false) {"],
  ["التراجعُ لا يمسح المخزن", "    writeMuted(clinicKey, left);\n", "\n"],
  ["التراجعُ يُبقيها مكتومةً بالإشعار", "setMuted((cur) => new Set([...cur].filter((x) => x !== pid)));", ""],
  ["المكتومُ من قبل يُقال", "    if (muted.has(pid)) return null;\n", "\n"],
  ["الكيلو «علبة»", "const stockWord = (kg: boolean) => (kg ? kgWord : box);", "const stockWord = (kg: boolean) => (kg ? box : box);"],
  ["by_weight يُتجاهل", "kg: s.by_weight === true,", "kg: false,"],
  ["قراءةُ الدفتر بلا مهلة", "await withTimeout(consumptionApi.invoiceConsumption(chunk), READ_MS);\n    // الجوابُ", "await consumptionApi.invoiceConsumption(chunk);\n    // الجوابُ"],
  ["الأسماءُ تحجب ما قُرئ", "names: await settleWithin(names, NAMES_MS),", "names: await names,"],
  ["صرفُ التعديل لا يُقال", "if (line) warn.push(line);", ""],
  ["الصرفُ يُقال والرصيدُ كفّى", "const neg = inv.negatives.find((x) => x.product_id === g.product_id);",
    "const neg = inv.negatives.find((x) => x.product_id === g.product_id) ?? { product_id: g.product_id, name: g.name, stockM: 0n };"],
  ["مادّةٌ بوحدتين بلا صافيها", "const net = gs.reduce((a, g) => a + g.n, 0n);", "const net = gs.reduce((a, g) => (g.n < 0n ? a + g.n : a), 0n);"],
  ["مادّةٌ صافيها صرف تُقال «رجّعنا»", "if (gs.every((g) => g.n > 0n)) { ret.push(...gs); continue; }", "ret.push(...gs.filter((g) => g.n > 0n)); if (gs.every((g) => g.n > 0n)) continue;"],
  // ── ui3: سالبُ سطر المادّة بزرّ كتمه وتراجعِه ووحدته، وفشلُ البيعة بالرصيد، وby_weight من العقد ──
  ["السالبُ بلا زرّ كتم", "<Button size=\"sm\" variant=\"ghost\" data-cons-mute={pid} onClick={() => mute(pid)}>{t(\"rcp.mute\", \"لا تذكّرني بهالمادة\")}</Button>",
    "{kind === \"short\" && <Button size=\"sm\" variant=\"ghost\" data-cons-mute={pid} onClick={() => mute(pid)}>{t(\"rcp.mute\", \"لا تذكّرني بهالمادة\")}</Button>}"],
  ["كتمُ السالب يُخفيه بلا كلمة ولا تراجع", "if (short.has(n.product_id)) continue;", "if (short.has(n.product_id) || muted.has(n.product_id)) continue;"],
  ["السالبُ يُقال مع عجزه مرّتين", "if (short.has(n.product_id)) continue;", ""],
  ["السالبُ بلا وحدته", "const stock = kg === null ? num : `${num} ${stockWord(kg)}`;", "const stock = num;"],
  ["السالبُ «علبة» عن الكيلو", "own.some((s) => s.bw === true) ? true : ", ""],
  ["كيلو مادّةٍ أخرى يصير كيلوها", "const own = inv.specs.filter((s) => s.product_id === n.product_id);", "const own = inv.specs;"],
  ["فشلُ البيعة بجملة المستهلكات وحدها", "t(\"rcp.saleFailStock\", \"انحفظت الفاتورة، بس ما گدرنا نتأكد من الرصيد والمستهلكات — شوف حركات المادة\")",
    "t(\"rcp.saleFail\", \"انحفظت الفاتورة، بس ما گدرنا نتأكد من المستهلكات — شوف حركات المادة\")"],
  // سلوكُها كالأصل تماماً — يمسكها فحصُ العقد (ذ) وحده، وهو ما يُثبت أنه ليس خواءً.
  ["نوعٌ محلّيّ يوسّع العقد", "kg: s.by_weight === true,", "kg: (s as ConsumptionSpec & { by_weight?: boolean | null }).by_weight === true,"],
  // ── تحقّقُ ui3: وحدةُ السالب حين يقولها الخادمُ وحده، والكلمةُ الطويلة تلتفّ، وكتمٌ ما انحفظ يُقال «هنا بس» ──
  ["السالبُ «علبة» بالتخمين", "const stock = kg === null ? num : `${num} ${stockWord(kg)}`;", "const stock = `${num} ${stockWord(kg === true)}`;"],
  ["علامةُ false تُنسى", "own.some((s) => s.bw === false) ? false : null", "null"],
  ["by_weight الخامُ يُتجاهل بالسالب", "bw: typeof s.by_weight === \"boolean\" ? s.by_weight : null,", "bw: null,"],
  ["إشعارُ البيعة لا يلفّ الكلمة", "space-y-1.5 break-words rounded-xl border border-warn-200", "space-y-1.5 rounded-xl border border-warn-200"],
  ["«رجّعنا» لا يلفّ الكلمة", "space-y-1.5 break-words rounded-xl border border-line bg-surface-2", "space-y-1.5 rounded-xl border border-line bg-surface-2"],
  ["المعاينةُ لا تلفّ الكلمة", "flex items-start gap-1.5 break-words rounded-xl", "flex items-start gap-1.5 rounded-xl"],
  ["كتمٌ ما انحفظ يُعدّ محفوظاً", "return true; } catch { return false; }", "return true; } catch { return true; }"],
  ["كتمٌ ما انحفظ يُقال «على هالجهاز»", "{fresh.get(pid)\n            ? t(\"rcp.mutedNote\"", "{true\n            ? t(\"rcp.mutedNote\""],
  ["كتمٌ ما انحفظ يغيب بلا كلمة ولا تراجع", "    setFresh((cur) => new Map([...cur, [pid, saved]]));\n", "    if (saved) setFresh((cur) => new Map([...cur, [pid, saved]]));\n"],
  // ── r3: StockNegative.by_weight — علامةُ السالب نفسِه أوّلاً، وnull أو غيرُ منطقيّ لا يقرّر ──
  ["السالبُ لا يقرأ by_weight نفسَه", "bw: typeof n.by_weight === \"boolean\" ? n.by_weight : null }", "bw: null }"],
  ["علامةُ السالب لا تُحسب بالحكم", "const kg = n.bw ?? (", "const kg = ("],
  ["المواصفةُ قبل علامة السالب", "const kg = n.bw ?? (own.some((s) => s.bw === true) ? true : own.some((s) => s.bw === false) ? false : null);",
    "const kg = (own.some((s) => s.bw === true) ? true : own.some((s) => s.bw === false) ? false : null) ?? n.bw;"],
  ["true وحدها من علامة السالب", "bw: typeof n.by_weight === \"boolean\" ? n.by_weight : null }", "bw: n.by_weight === true ? true : null }"],
  ["null بالسالب جوابٌ يُسكت المواصفة", "const kg = n.bw ?? (", "const kg = n.bw !== undefined ? n.bw : ("],
  ["علامةُ السالب بلا فحص نوعها", "bw: typeof n.by_weight === \"boolean\" ? n.by_weight : null }", "bw: (n.by_weight ?? null) as boolean | null }"],
];

const mutate = process.argv.includes("--mutants");
let base;
try { base = await build(SRC); } catch (e) {
  console.error(`   ✗ ConsumablesSheet.tsx ما ينبني — ${String(e.message).split("\n").slice(0, 3).join(" | ")}`);
  process.exit(1);
}
const R = await runSuite(base, !mutate);
let bad = R.fail.length;
if (mutate) {
  console.log(`▸ الأصل: ${R.pass} نجحت، ${R.fail.length} فشلت${R.fail.length ? ` — ${R.fail.join("؛ ")}` : ""}`);
  console.log(`▸ ${MUTANTS.length} طفرة — كلُّ واحدةٍ لازم تُسقط فحصاً`);
  for (const [name, from, to] of MUTANTS) {
    const at = SRC.split(from).length - 1;
    if (at !== 1) { bad++; console.error(`   ✗ ${name}: نصُّها يقع ${at} مرّة بالمصدر (لازم مرّة) — حدّث الطفرة`); continue; }
    let r;
    // طفرةٌ لا تنبني (أو جولةٌ رمت خارج حالاتها) لم يُفحص فيها شيء: «أمسكها» عنها خواء — تُفشل كطفرةٍ نجت.
    try { r = await runSuite(await build(SRC.replace(from, to)), false); } catch (e) { bad++; console.error(`   ✗ ${name}: لم تُفحص (لم تنبنِ أو رمت الجولة) — ${String(e?.message ?? e).split("\n")[0]}`); continue; }
    if (r.fail.length) console.log(`   ✓ ${name} — أمسكها ${r.fail.length}: ${r.fail.slice(0, 2).join("؛ ")}${r.fail.length > 2 ? "…" : ""}`);
    else { bad++; console.error(`   ✗ ${name} — مرّت كلُّ الفحوص (${r.pass})`); }
  }
}
console.log(bad ? `\n✗ consumables-sheet-test: ${bad} فشلت` : `\n✓ consumables-sheet-test: ${R.pass} فحصاً${mutate ? `، و${MUTANTS.length} طفرةً أمسكتها الفحوص كلَّها` : ""}`);
process.exit(bad ? 1 : 0);
