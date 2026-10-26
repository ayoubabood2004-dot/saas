/* ============================================================================
 * محرّرُ مستهلكات الخدمة وشريحتُه بالإعدادات (0252، التصميم §11.4 و§3.5) — بالسلوك لا بالنصّ.
 *
 * يُرسم RecipeEditor الحقيقيّ (react-mini) بحسابه الحقيقيّ (consumption.ts) ورسائلِ أخطائه الحقيقية
 * (errors.ts)، والمواد والوصفة من بديلين يتحكّم بهما الفحص — فيُرى ما يصل الخادمَ فعلاً:
 *   أ) فشلُ جلب المواد ⇒ «ما گدرنا نجيب المواد» و«إعادة المحاولة» وصفرُ سطور (لا نصفُ قائمة)، والمحاولةُ تجلب.
 *   ب) فشلُ recipeGet ⇒ قراءةٌ بلا سطور ولا حفظ، وتلميحُ الخادم كما هو.
 *   ج) المواد أغلى من الخدمة ⇒ أوّلُ «حفظ» يسأل ولا ينادي recipeSet، والضغطةُ الثانية تنادي.
 *   د) سؤالُ الكلفة اليدوية بأوّل حفظٍ وحده (وصفةٌ فارغةٌ عند الفتح + كلفة)، وclearFlatCost حسب الجواب.
 *   هـ) السطورُ المكسورة (محذوفة، غائبة، بالحوض، من الحقل، بلا وحدةٍ صغيرة) سطورٌ بأسبابها، والحفظُ يرفضها.
 *   و) تكرارُ الدمج: نفسُ الوحدة يُجمع، والعلبةُ إلى الصغيرة بالضبط، وما لا ينجمع يقفل الحفظ.
 *   ز) الحمولةُ بالضبط: الترتيب، الكمية (بالأرقام الشرقية)، الوحدة، البصمة — والأثرُ «٢ زوج = ٠٫٠٤ علبة · ٤٠٠».
 *   ح) recipe_moved ⇒ رسالتُه وزرُّ «حمّلها من جديد» والسطورُ باقية؛ ورفضُ الخادم وانتهاءُ الاشتراك بنصّهما.
 *   ط) من لا يعدّل الإعدادات لا يحفظ ولا يضيف ولا يشيل.
 *   ي) وحرّاسُ §3.5: كلفةٌ صفر، T(1) = 0، «بالمل؟» ورابطُ المادة، المنتقي (الحوض مقفول، المادةُ لا تُعرض
 *      مرّتين، الباركودُ والرموزُ الإضافية بالتطبيع على الطرفين)، سقفُ ٤٠، والكلفُ خلف showCost.
 *   ك) Settings.tsx نفسُها (ServiceSettings مرسوماً ببدائل مولّدة من سطور استيرادها): الشريحةُ بحالاتها
 *      (بلا أرقام وهي تُحمَّل، «(؟)» وسطرُ إعادةٍ عند الفشل — لا صفر)، المالُ خلف showCost، «كلفة غير المواد»،
 *      حذفُ خدمةٍ لها وصفة (أو لا نعرف) بضغطةٍ ثانية، وفتحُ المحرّر وإعادةُ الملخّص وقراءةُ الخدمات بعد التصفير.
 *   ل) وما أمسكه التدقيقُ العدائيّ بعد البناء (كلٌّ فشل على النسخة السابقة قبل تصليحه):
 *      recipe_moved ثمّ تعديلٌ كان يمسح رسالتَه وزرَّه والحفظُ مقفول؛ «أكثر من سعر الخدمة (٠)» لكلّ خدمةٍ بلا سعر؛
 *      المنتقي بـnormalizeCode و=== (لا «w90» = «W90» ولا جزءُ الرمز) — صار codeMatcher؛ «لا توجد نتائج» عن مادةٍ
 *      بالوصفة؛ رفضُ سطر الحقل بـ«ما عادت موجودة»؛ والإغلاقُ (الستارة، Esc، «إلغاء»، «افتح المادة») يمحو تعديلاً لم يُحفظ.
 *      وبالإعدادات (ك٢، ك٣): إطفاءُ عمليةٍ بمكتبة العمليات كان يحذفها ووصفتَها بلمسة، وحذفُ التصنيف بـwindow.confirm
 *      لا يذكر الوصفات.
 *      وبالجولة الخامسة (مقيسٌ بمتصفّحٍ بخطوط التطبيق وCSS المبنيّ): اسمُ المادة كان يأخذ ما يتركه سطرُ الحقول — ٤٥px بهاتفٍ
 *      عرضُه ٣٧٥، و«…وسط» و«…كبير» كلتاهما «كفو…» (ل٦)؛ وسؤالُ حذف الخدمة كان بعد القائمة كلّها، ٦٩٠–٨٦٦px تحت أوّل
 *      صفٍّ بتصنيفٍ من ١٢ — خارجَ الشاشة وزرُّ الحذف يبدو ميّتاً (ك٤).
 *      وبالجولة السادسة: المنتقي يقصّ عند ثمانٍ بصمت ورمزٌ كاملٌ خلف ما يحويه جزئياً (ل٧)؛ وسببُ القفل بجانب الاسم يتركه
 *      ٧٣–٧٧px بعرض ٣٧٥ والاسمُ الطويل يُقصّ حيث يفترق عن توأمه (ل٨)؛ و«كغم» و«وحدة» حيث يقول الكاشير «كغ» و«مفرد» (ل٩).
 *      وتدقيقُ الجولة على الفحص نفسه: «الرمزُ الكامل أوّلاً» طبّع طرفاً واحداً بكلّ حقل، و«يلفّ ولا يُقصّ» سأل عن صنفين لا عمّا يحمل اللفّ
 *      (min-w-0 للبند المرن، وnowrap يُورَث) — فطفراتٌ تعيد العيبَ نفسَه مرّت ١٥٧/٠. صار ل٧ طرفاً طرفاً بالحقلين، وwrapAudit لـل٦ ول٨.
 *
 * ولإثبات أن الفحص يمسك (لا يمرّ على تنفيذٍ مكسور): RECIPE_EDITOR_SRC=<نسخةٌ معدّلة> أو SETTINGS_SRC=<نسخة>
 * تُحمَّل مكانَ الملفّ الحقيقيّ بمساره نفسه — فالفحصُ يُشغَّل على طفرةٍ بلا لمس الملفّ.
 *
 *   node scripts/recipe-editor-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/* حلقةُ رسمٍ أو وعدٌ لا ينتهي يُفشل الفحصَ بمهلة — لا يأكل الذاكرةَ بصمت (أوّلُ نسخةٍ من المحرّر دارت هكذا). */
setTimeout(() => { console.error("\n✗ recipe-editor-test: انتهت المهلة (١٢٠ ثانية) — حلقةُ رسمٍ أو وعدٌ لا ينتهي"); process.exit(1); }, 120_000).unref();

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const J = (x) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? `${v}n` : v === Infinity ? "Infinity" : v));
/** قسمٌ يرمي (زرٌّ غاب فلا يُضغط) فشلٌ باسمه، والأقسامُ بعده تجري — لا انهيارٌ يُخفي ما بعده. */
async function section(title, fn) {
  if (title) console.log(title);
  try { await fn(); }
  catch (e) { check(`${title ? title.replace(/^▸ /, "") : "ServiceSettings"} — توقّف القسمُ بخطأ`, false, String(e?.stack ?? e).split("\n").slice(0, 2).join(" | ")); }
}

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };

/* ---- الترجمة: «⟦المفتاح⟧» ثمّ النصُّ الافتراضيّ بقيمه — فالرسالةُ تُطابَق بمفتاحها وأرقامها معاً ---- */
const T = `(k, d) => { const o = typeof d === "string" ? { defaultValue: d } : (d || {}); const s = String(o.defaultValue ?? k).replace(/\\{\\{(\\w+)\\}\\}/g, (_m, v) => String(o[v] ?? "")); return "⟦" + k + "⟧" + s; }`;
/* و`t` واحدةٌ ثابتة كما يعطيها react-i18next: دالّةٌ جديدةٌ بكلّ رسمٍ تجعل كلَّ أثرٍ يتبعها يدور بلا نهاية. */
const I18N = {
  "react-i18next": `const t = ${T}; const r = { t, i18n: { language: "ar" } }; export const useTranslation = () => r; export default {};`,
  i18next: `const i = { t: ${T}, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
};
/** النصُّ بلا علامات المفاتيح — لمقارنة جملةٍ فيها نداءاتٌ متداخلة («علبة» داخل الأثر). */
const plain = (s) => String(s ?? "").replace(/⟦[^⟧]*⟧/g, "");
const UI_STUB = `import { createElement as h, forwardRef } from "react";
  export const Button = forwardRef(({ children, leftIcon, rightIcon, loading, variant, size, ...p }, _r) => h("button", { ...p, "data-variant": variant, disabled: !!(p.disabled || loading) }, leftIcon, children));
  export const Dialog = ({ open, title, children, footer, onClose }) => (open ? h("x-Dialog", { "data-dialog": "", onClose }, h("x-title", null, title), children, footer ? h("x-footer", null, footer) : null) : null);
  export function Segmented({ options, value, onChange }) { return h("x-Seg", { "data-seg": value }, ...options.map((o) => h("button", { key: o.value, "data-seg-opt": o.value, "aria-selected": o.value === value, onClick: () => onChange(o.value) }, o.label))); }
  export const Skeleton = (p) => h("x-Skel", p);
  export const Badge = ({ children, ...p }) => h("x-Badge", p, children);
  export const useToast = () => globalThis.__toast;`;
const ICONS = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k)).map((k) => `export const ${k} = () => null;`).join("\n");

/** يحزم مدخلاً مع react-mini-host بنسخة React واحدة. `stubs`: مُحدِّدٌ ← نصُّ وحدة؛ `swap`: [نمطُ مسار، نصٌّ بديل]؛
 *  `stubFor(path, importer)` يقرّر بديلاً لكلّ استيرادٍ لا يُطابَق بالاسم (Settings.tsx: كلُّ ما لا يُفحص). */
async function build(entry, stubs, swap = [], stubFor = null) {
  const built = await esbuild.build({
    stdin: { contents: `${entry}\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: "recipe-editor-test.tsx", loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "rcp-stubs",
      setup(b) {
        for (const [re, text] of swap) b.onLoad({ filter: re }, () => ({ contents: text, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (Object.prototype.hasOwnProperty.call(stubs, a.path)) return { path: a.path, namespace: "rcp-stub" };
          const own = stubFor?.(a.path, a.importer);
          return own != null ? { path: a.path, namespace: "rcp-stub", pluginData: own } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "rcp-stub" }, (a) => ({ contents: a.pluginData ?? stubs[a.path], loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "recipe-editor-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

/* ---- الشجرة: البحثُ داخل عقدة، ونصُّها، وتفريغُ الطابور ------------------------- */
const walkAll = (n, out = []) => { out.push(n); n.children.forEach((c) => walkAll(c, out)); return out; };
const textOf = (n) => (!n ? "" : n.type === "#text" ? n.text : n.children.map(textOf).join(""));
const within = (n, attr, value) => (!n ? null : walkAll(n).find((x) => x.props && attr in x.props && (value === undefined || String(x.props[attr]) === String(value))) ?? null);
/* «يلفّ ولا يُقصّ» بخصائص CSS التي تحمله فعلاً، لا بوجود صنفٍ واحد (ل٦، ل٨). مقيسٌ بمتصفّحٍ بعرض ٣٧٥ بخطوط التطبيق وCSS المبنيّ:
 * break-words (overflow-wrap) لا يُصغّر الحدَّ الأدنى للمحتوى — فبندٌ بصفٍّ مرن بلا min-w-0 حدُّه عرضُ أطول كلمة، واسمٌ لاتينيّ بلا فاصل
 * («AMOXICILLINCLAVULANATEPOTASSIUM875MG125MG») يبرز خارج صفّه ٨٠–١١٤px وزرُّ شيل السطر خارج الشاشة؛ وnowrap بأيّ عنصرٍ حتى
 * الصفّ يُورَث فلا يلفّ الاسم (يطلع نصُّه ٥٨–١٣٤px خارج الصفّ). وكانت الفحوصُ تسأل «truncate غائب وbreak-words حاضر» فمرّ الاثنان ١٥٧/٠.
 * فيُمشى من الاسم حتى `top` (الصفّ أو زرّ المنتقي):
 *   shrinks  — كلُّ عنصرٍ أبوه صفٌّ مرن أو شبكة (لا flex-col) يصغر عن أطول كلمة: min-w-0، أو حاويةُ تمرير (overflow-hidden/auto)؛
 *   noNowrap — لا truncate ولا whitespace-nowrap/pre ولا text-nowrap بالسلسلة كلّها (white-space يُورَث)؛
 *   noClip   — والاسمُ نفسُه لا يُقصّ (text-ellipsis، overflow-hidden/clip، line-clamp)؛
 *   breaks   — ويكسر الكلمةَ الأطول من سطره: break-words/break-all/overflow-wrap:anywhere بالسلسلة (overflow-wrap يُورَث). */
const classOf = (n) => String(n?.props?.className ?? "");
const ROW_LAYOUT = /(^|\s)(inline-)?(flex|grid)(\s|$)/, COLUMN = /(^|\s)flex-col(-reverse)?(\s|$)/;
const ZERO_MIN = /(^|\s)(min-w-0|overflow-hidden|overflow-x-hidden|overflow-auto|overflow-x-auto)(\s|$)/;
const NOWRAP = /(^|\s)(truncate|whitespace-nowrap|whitespace-pre|text-nowrap)(\s|$)/;
const CLIP = /(^|\s)(truncate|text-ellipsis|text-clip|overflow-hidden|overflow-x-hidden|overflow-clip|overflow-x-clip|line-clamp-\d+)(\s|$)/;
const BREAKS = /(^|\s)(break-words|break-all|\[overflow-wrap:anywhere\])(\s|$)/;
function wrapAudit(nm, top) {
  const chain = [];
  for (let n = nm; n; n = n.parent) { chain.push(n); if (n === top) break; }
  if (!nm || !top || chain[chain.length - 1] !== top) return { shrinks: false, noNowrap: false, noClip: false, breaks: false };
  const inRow = (n) => ROW_LAYOUT.test(classOf(n.parent)) && !COLUMN.test(classOf(n.parent));
  return {
    shrinks: chain.slice(0, -1).every((n) => !inRow(n) || ZERO_MIN.test(classOf(n))),
    noNowrap: chain.every((n) => !NOWRAP.test(classOf(n))),
    noClip: !CLIP.test(classOf(nm)),
    breaks: chain.some((n) => BREAKS.test(classOf(n))),
  };
}
const wrapsOk = (a) => a.shrinks && a.noNowrap && a.noClip && a.breaks;
/* الأثرُ المؤجَّل والوعود: React على Node يجدول بـsetImmediate — والمؤقّتُ (١٥ms بويندوز) يبطّئ بلا فائدة. */
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

/* ═════════ أ–ي: المحرّر ═════════ */
const editorSwap = process.env.RECIPE_EDITOR_SRC ? [[/[\\/]src[\\/]components[\\/]settings[\\/]RecipeEditor\.tsx$/, readFileSync(process.env.RECIPE_EDITOR_SRC, "utf8")]] : [];
if (editorSwap.length) console.log(`   (RecipeEditor من ${process.env.RECIPE_EDITOR_SRC})`);
let ED = null;
try {
  ED = await build(`export { default as RecipeEditor } from "./src/components/settings/RecipeEditor.tsx";`, {
    ...I18N,
    "lucide-react": ICONS,
    "@/components/ui": UI_STUB,
    "@/lib/repo": "export const repo = { listProducts: (...a) => globalThis.__rcp.listProducts(...a) };",
    "@/lib/consumptionApi": "export const consumptionApi = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__rcp.api[k](...a) });",
    "@/lib/inflight": "export const holdUpdates = (ms) => { const r = globalThis.__rcp; r.holds.push(ms); let done = false; return () => { if (!done) { done = true; r.released++; } }; };",
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
    "react-router-dom": `import { createElement as h } from "react"; export const Link = ({ to, children, onClick, className }) => h("x-Link", { to, onClick, className }, children);
      export const useNavigate = () => (to) => { globalThis.__rcp.nav.push(to); };`,
  }, editorSwap);
} catch (e) { check("RecipeEditor.tsx يُحزم ويُرسم", false, String(e?.message ?? e).split("\n").slice(0, 4).join(" ")); }

/* المواد: كفوف (٥٠ زوجاً بالعلبة بـ١٠٬٠٠٠ ⇒ ٢٠٠ للزوج)، Lyse (٥٠٠ مل بـ٦٠٬٠٠٠ ⇒ ١٢٠ للمل)، Diluent (٢٠ لتراً)، خيطٌ
 * بسعر شراءٍ صفر، مادةٌ بالحوض، مادةٌ بالعلبة وحدها، مادةٌ بالكيلو، فيالُ ٢٫٥ مل، ومكعّبُ خمسة ملايين مل. */
const P = (id, name, x = {}) => ({ id, name, purchase_price: 0, sell_price: 0, stock: 10, barcode: null, alt_codes: [], pooled: false, farm_id: null,
  has_sub_unit: false, sub_unit_name: null, units_per_box: null, sold_by_weight: false, created_at: "2026-10-01T00:00:00Z", ...x });
const GLOVE = P("p-glove", "كفوف فحص", { purchase_price: 10000, has_sub_unit: true, sub_unit_name: "زوج", units_per_box: 50, barcode: "6281000012345", alt_codes: ["SH-12"] });
const LYSE = P("p-lyse", "Lyse", { purchase_price: 60000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 500 });
const CUBE = P("p-cube", "Diluent", { purchase_price: 250000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 20000 });
const SUTURE = P("p-sut", "خيط", { purchase_price: 0 });
const POOL = P("p-pool", "شاش القسم", { pooled: true, company_id: "co1", section_id: "s1" });
const BOX = P("p-box", "سرنجات علبة", { purchase_price: 5000 });
const KG = P("p-kg", "قطن طبي", { purchase_price: 8000, sold_by_weight: true });
const HAMZA = P("p-hamza", "أميكاسين", { purchase_price: 1000 });
const VIAL = P("p-vial", "فيال", { purchase_price: 1000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 2.5 });
const HUGE = P("p-huge", "محلول كبير", { purchase_price: 1000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 5000000 });
const ALL = [GLOVE, LYSE, CUBE, SUTURE, POOL, BOX, KG, HAMZA, VIAL, HUGE];
const EMPTY_FP = "d41d8cd98f00b204e9800998ecf8427e";   // md5('') — بصمةُ وصفةٍ فارغة كما يرجعها service_recipe_get
let lid = 0;
/** سطرٌ بشكل service_recipe_get. */
const L = (p, qty, unit, problem = null) => ({ id: `l${++lid}`, product_id: p.id, product_name: p.name, qty, unit, position: lid, problem,
  stock: p.stock, unit_label: unit === "sub" ? p.sub_unit_name : null, units_per_box: p.units_per_box, unit_cost: p.purchase_price, per_value: 0 });
const svcErr = (code, hint) => Object.assign(new Error(code), { code: "P0001", hint });

async function session(o = {}) {
  const log = { set: [], gets: 0, lists: 0, toasts: [], saved: [], closed: 0, getId: null };
  globalThis.__toast = { success: (a, b) => log.toasts.push(["success", a, b ?? null]), error: (a, b) => log.toasts.push(["error", a, b ?? null]), warn: (a, b) => log.toasts.push(["warn", a, b ?? null]), toast() {} };
  globalThis.__rcp = {
    holds: [], released: 0, nav: [],
    listProducts: async () => { log.lists++; const f = typeof o.listFail === "function" ? o.listFail(log.lists) : o.listFail; if (f) throw f; return o.products ?? ALL; },
    api: {
      recipeGet: async (id) => {
        log.gets++; log.getId = id;
        const f = typeof o.getFail === "function" ? o.getFail(log.gets) : o.getFail; if (f) throw f;
        return typeof o.get === "function" ? o.get(log.gets) : (o.get ?? { fingerprint: EMPTY_FP, flat_cost: null, lines: [] });
      },
      recipeSet: async (...a) => { log.set.push(a); if (o.setFail) throw o.setFail; return { lines: a[1].map((x, i) => ({ ...x, id: `n${i}` })), fingerprint: "fp-after" }; },
    },
  };
  const { React, mount, RecipeEditor } = ED;
  const ui = mount(React.createElement(RecipeEditor, { open: true, service: { id: o.svc ?? "svc-cat", name: o.name ?? "تعقيم قطة", price: o.price ?? 25000 },
    canEdit: o.canEdit ?? true, showCost: o.showCost ?? true, onClose: () => { log.closed++; }, onSaved: (r) => log.saved.push(r) }));
  await flush();
  const rows = () => ui.findAll("data-rcp-row");
  const row = (name) => rows().find((n) => textOf(n).includes(name)) ?? null;
  const press = async (attr, value) => { ui.click(ui.find(attr, value)); await flush(); };
  const qty = async (name, v) => { const inp = within(row(name), "data-rcp-qty"); if (!inp) throw new Error(`ما لكيت حقل كمية «${name}»`); inp.props.onChange({ target: { value: v } }); await flush(); };
  const unit = async (name, u) => { const b = within(row(name), "data-seg-opt", u); if (!b) throw new Error(`ما لكيت وحدة ${u} لـ«${name}»`); ui.click(b); await flush(); };
  const search = async (q) => { if (ui.find("data-rcp-add")) await press("data-rcp-add"); ui.find("data-rcp-search").props.onChange({ target: { value: q } }); await flush(); };
  const pick = async (q, id) => { await search(q); await press("data-rcp-pick", id); };
  const remove = async (name) => { ui.click(within(row(name), "data-rcp-remove")); await flush(); };
  const saveBtn = () => ui.find("data-rcp-save");
  const save = async () => { ui.click(saveBtn()); await flush(); };
  const problem = () => textOf(ui.find("data-rcp-problem"));
  return { ui, log, rows, row, press, qty, unit, search, pick, remove, save, saveBtn, problem, text: () => ui.text(), done: () => ui.unmount() };
}

if (ED) {
  /* ── أ) فشلُ المواد ─────────────────────────────────────────────────────── */
  await section("▸ أ) فشلُ جلب المواد ⇒ إعادة المحاولة، وصفرُ سطور", async () => {
    let s = await session({ listFail: (n) => (n === 1 ? new TypeError("Failed to fetch") : null), get: { fingerprint: "fp1", flat_cost: null, lines: [L(GLOVE, 2, "sub")] } });
    check("المحرّرُ يُرسم ويطلب المواد والوصفة معاً", s.log.lists === 1 && s.log.gets === 1 && s.log.getId === "svc-cat", J(s.log));
    check("«ما گدرنا نجيب المواد» و«إعادة المحاولة»", !!s.ui.find("data-rcp-failed") && s.text().includes("⟦services.rcp.loadFailed⟧ما گدرنا نجيب المواد") && !!s.ui.find("data-rcp-retry"), s.text().slice(0, 200));
    check("  وصفرُ سطور ولا حفظ ولا «+ مادة» — لا نصفُ قائمة", s.rows().length === 0 && !s.saveBtn() && !s.ui.find("data-rcp-add"), J({ rows: s.rows().length }));
    await s.press("data-rcp-retry");
    check("  و«إعادة المحاولة» تجلب الاثنين من جديد فتظهر السطور", s.log.lists === 2 && s.log.gets === 2 && s.rows().length === 1 && !s.ui.find("data-rcp-failed"), J({ lists: s.log.lists, gets: s.log.gets, rows: s.rows().length }));
    s.done();
    s = await session({ listFail: () => new TypeError("Failed to fetch"), get: { fingerprint: "fp1", flat_cost: null, lines: [L(GLOVE, 2, "sub")] } });
    check("  وفشلٌ ثانٍ يبقى فشلاً (لا سطورَ من الوصفة وحدها)", s.rows().length === 0 && !!s.ui.find("data-rcp-failed"));
    s.done();
  });

  /* ── ب) فشلُ الوصفة ─────────────────────────────────────────────────────── */
  await section("▸ ب) فشلُ recipeGet ⇒ قراءةٌ بلا سطور", async () => {
    const s = await session({ getFail: svcErr("recipe_service_missing", "الخدمة ما وصلت للسحابة بعد — انتظر لحظة وأعد المحاولة") });
    check("لا سطور ولا حفظ ولا منتقي، وزرُّ الإعادة", s.rows().length === 0 && !s.saveBtn() && !s.ui.find("data-rcp-add") && !!s.ui.find("data-rcp-retry"));
    check("  وتلميحُ الخادم يُقال كما هو (describeDbError)", s.text().includes("الخدمة ما وصلت للسحابة بعد — انتظر لحظة وأعد المحاولة"), s.text().slice(0, 200));
    s.done();
  });

  /* ── ج) المواد أغلى من الخدمة ──────────────────────────────────────────── */
  await section("▸ ج) المواد أغلى من سعر الخدمة ⇒ ضغطةٌ ثانية قبل الحفظ", async () => {
    const s = await session({ get: { fingerprint: "fp-c", flat_cost: null, lines: [L(LYSE, 2, "sub")] } });
    const total0 = s.ui.find("data-rcp-total");
    check("٢ مل Lyse = ٢٤٠ من ٢٥٬٠٠٠ (١٪) — والمجموعُ ليس أحمر", textOf(total0) === "⟦services.rcp.total⟧كلفة المواد لكل مرّة: 240 د.ع من سعر 25,000 د.ع (1٪)" && !String(total0?.props.className).includes("danger"), textOf(total0));
    await s.unit("Lyse", "stock");
    const total = s.ui.find("data-rcp-total");
    check("٢ علبة ⇒ ١٢٠٬٠٠٠ أكثر من ٢٥٬٠٠٠: المجموعُ أحمر", String(total?.props.className).includes("text-danger-600") && textOf(total).includes("120,000 د.ع"), J(total?.props.className));
    await s.save();
    check("أوّلُ «حفظ» يسأل «يمكن كاتب ٢ عبوة وانت تقصد ٢ مل؟» ولا ينادي recipeSet",
      !!s.ui.find("data-rcp-over") && s.text().includes("⟦services.rcp.overAsk⟧كلفة المواد (120,000 د.ع) أكثر من سعر الخدمة (25,000 د.ع) — يمكن كاتب ٢ عبوة وانت تقصد ٢ مل؟") && s.log.set.length === 0, J({ set: s.log.set.length }));
    await s.press("data-rcp-over-yes");
    check("  و«أي صحيح، احفظ» تنادي مرّةً بما رآه", s.log.set.length === 1 && J(s.log.set[0]) === J(["svc-cat", [{ product_id: "p-lyse", qty: 2, unit: "stock" }], "fp-c", false]), J(s.log.set));
    s.done();
    const s2 = await session({ get: { fingerprint: "fp-c", flat_cost: null, lines: [L(LYSE, 2, "sub")] } });
    await s2.unit("Lyse", "stock"); await s2.save();
    await s2.qty("Lyse", "3");
    check("  وتعديلٌ بعد السؤال يُسقطه (السؤالُ عن السطور التي رآها)", !s2.ui.find("data-rcp-over") && s2.log.set.length === 0);
    await s2.save();
    check("  …و«حفظ» بعده يسأل من جديد", !!s2.ui.find("data-rcp-over") && s2.log.set.length === 0);
    s2.done();
    const s3 = await session({ showCost: false, get: { fingerprint: "fp-c", flat_cost: null, lines: [L(LYSE, 2, "sub")] } });
    await s3.unit("Lyse", "stock"); await s3.save();
    check("  وبلا صلاحية الكلفة: لا مجموعَ ولا سؤالَ مال — يُحفظ مباشرة", !s3.ui.find("data-rcp-total") && !s3.ui.find("data-rcp-over") && s3.log.set.length === 1, J({ set: s3.log.set.length }));
    s3.done();
  });

  /* ── د) الكلفةُ المكتوبة باليد ──────────────────────────────────────────── */
  await section("▸ د) سؤالُ الكلفة اليدوية بأوّل حفظٍ وحده", async () => {
    const flatEmpty = { fingerprint: EMPTY_FP, flat_cost: 3000, lines: [] };
    let s = await session({ get: flatEmpty });
    await s.pick("كفوف", "p-glove");
    await s.save();
    check("وصفةٌ فارغة + كلفة ٣٬٠٠٠ ⇒ «الـ٣٬٠٠٠ شنو؟» ولا نداء",
      !!s.ui.find("data-rcp-flat") && s.text().includes("⟦services.rcp.flatAsk⟧هذي الخدمة بيها كلفة 3,000 د.ع مكتوبة بيدك. هسّة المواد تنحسب من الوصفة. الـ3,000 د.ع شنو؟") && s.log.set.length === 0, s.text().slice(-400));
    check("  وخياران فقط", walkAll(s.ui.find("data-rcp-flat")).filter((n) => n.type === "button").length === 2 && !!s.ui.find("data-rcp-flat-clear") && !!s.ui.find("data-rcp-flat-keep"));
    await s.press("data-rcp-flat-clear");
    check("  «صفّرها» ⇒ clearFlatCost = true، والبصمةُ بصمةُ الوصفة الفارغة (لا null)", s.log.set.length === 1 && s.log.set[0][3] === true && s.log.set[0][2] === EMPTY_FP && J(s.log.set[0][1]) === J([{ product_id: "p-glove", qty: 1, unit: "sub" }]), J(s.log.set));
    check("  والأبُ يُبلَّغ بالتصفير فيعيد قراءة الخدمات، والنافذةُ تُغلق", J(s.log.saved) === J([{ lines: 1, clearedFlat: true }]) && s.log.closed === 1, J(s.log.saved));
    s.done();
    s = await session({ get: flatEmpty });
    await s.pick("كفوف", "p-glove"); await s.save(); await s.press("data-rcp-flat-keep");
    check("  «خلّيها» ⇒ clearFlatCost = false", s.log.set.length === 1 && s.log.set[0][3] === false && J(s.log.saved) === J([{ lines: 1, clearedFlat: false }]), J(s.log.set));
    s.done();
    s = await session({ get: { fingerprint: "fp-d", flat_cost: 3000, lines: [L(GLOVE, 1, "sub")] } });
    await s.qty("كفوف فحص", "2"); await s.save();
    check("وصفةٌ قائمة عند الفتح ⇒ لا سؤال، والكلفةُ تبقى", !s.ui.find("data-rcp-flat") && s.log.set.length === 1 && s.log.set[0][3] === false, J(s.log.set));
    s.done();
    s = await session({ get: { fingerprint: EMPTY_FP, flat_cost: null, lines: [] } });
    await s.pick("كفوف", "p-glove"); await s.save();
    check("وصفةٌ فارغة بلا كلفة ⇒ لا سؤال", !s.ui.find("data-rcp-flat") && s.log.set.length === 1 && s.log.set[0][3] === false, J(s.log.set));
    s.done();
    s = await session({ get: flatEmpty, showCost: false });
    await s.pick("كفوف", "p-glove"); await s.save();
    check("  وبلا صلاحية الكلفة: السؤالُ نفسُه بلا الرقم", !!s.ui.find("data-rcp-flat") && s.text().includes("⟦services.rcp.flatAskNoNum⟧") && !s.text().includes("3,000"), s.text().slice(-300));
    s.done();
    s = await session({ get: flatEmpty, price: 100 });
    await s.pick("Lyse", "p-lyse"); await s.save();
    check("وفوق السعر أيضاً: سؤالُ المال أوّلاً، ثمّ الكلفة، ثمّ نداءٌ واحد", !!s.ui.find("data-rcp-over") && !s.ui.find("data-rcp-flat") && s.log.set.length === 0, J(s.log.set));
    await s.press("data-rcp-over-yes");
    check("  …«أي صحيح» ⇒ سؤالُ الكلفة لا نداء", !!s.ui.find("data-rcp-flat") && s.log.set.length === 0);
    await s.press("data-rcp-flat-clear");
    check("  …«صفّرها» ⇒ نداءٌ واحد بـtrue", s.log.set.length === 1 && s.log.set[0][3] === true, J(s.log.set));
    s.done();
  });

  /* ── هـ) السطورُ المكسورة ──────────────────────────────────────────────── */
  await section("▸ هـ) السطورُ المكسورة بأسبابها، والحفظُ يرفضها", async () => {
    const TRASHED = P("p-trash", "خيط جراحي"), GONE = P("p-gone", "مادة قديمة"), FARM = P("p-farm", "علف حقل", { farm_id: "f1" });
    const s = await session({ get: { fingerprint: "fp-e", flat_cost: null, lines: [
      L(TRASHED, 1, "stock", "in_trash"), L(GONE, 1, "stock", "product_gone"), L(POOL, 1, "stock", "pooled"), L(FARM, 1, "stock", "farm_stock"), L(BOX, 2, "sub", "no_sub_unit"), L(GLOVE, 1, "sub"),
    ] } });
    const broken = s.rows().map((n) => n.props["data-rcp-broken"]).filter(Boolean);
    check("خمسةُ سطورٍ مكسورة تبقى سطوراً بمشكلاتها، والسليمُ سليم", J(broken) === J(["in_trash", "product_gone", "pooled", "farm_stock", "no_sub_unit"]) && s.rows().length === 6, J(broken));
    check('  «"خيط جراحي" محذوفة — رجّعها من المحذوفات أو شيلها»', s.text().includes('⟦services.rcp.inTrash⟧"خيط جراحي" محذوفة — رجّعها من المحذوفات أو شيلها'));
    check("  وكلُّ سببٍ بمفتاحه", ["gone", "pooled", "farm", "noSubUnit"].every((k) => s.text().includes(`⟦services.rcp.${k}⟧`)));
    check("  والمكسورُ بلا حقل كمية — يُشال فقط", within(s.row("خيط جراحي"), "data-rcp-qty") === null && !!within(s.row("خيط جراحي"), "data-rcp-remove") && !!within(s.row("كفوف فحص"), "data-rcp-qty"));
    check("  و«بلا وحدة صغيرة» برابط المادة", within(s.row("سرنجات علبة"), "to", "/inventory?edit=p-box") !== null);
    await s.qty("كفوف فحص", "2"); await s.save();
    check("الحفظُ بمكسورٍ: أوّلُ رفضٍ على سطره ولا نداء", s.log.set.length === 0 && s.problem().includes('⟦services.rcp.inTrash⟧"خيط جراحي"')
      && String(s.row("خيط جراحي")?.props.className).includes("border-danger-400"), s.problem());
    for (const n of ["خيط جراحي", "مادة قديمة", "شاش القسم", "علف حقل", "سرنجات علبة"]) await s.remove(n);
    await s.save();
    check("  وبعد شيلها يُحفظ الباقي وحده", J(s.log.set[0]?.[1]) === J([{ product_id: "p-glove", qty: 2, unit: "sub" }]), J(s.log.set));
    s.done();
  });

  /* ── و) تكرارُ الدمج ───────────────────────────────────────────────────── */
  await section("▸ و) سطران لمادةٍ واحدة تركهما الدمج", async () => {
    let s = await session({ get: { fingerprint: "fp-f", flat_cost: null, lines: [L(GLOVE, 1, "sub"), L(LYSE, 2, "sub"), L(GLOVE, 2, "sub")] } });
    check("نفسُ الوحدة ⇒ سطرٌ واحد بالمجموع (٣ أزواج) و«جمعنا السطرين»", s.rows().length === 2 && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "3"
      && !!within(s.row("كفوف فحص"), "data-rcp-merged") && s.text().includes("⟦services.rcp.merged⟧انطوت مادتين بوحدة — جمعنا السطرين"), J(s.rows().map(textOf)));
    check("  والحفظُ مفتوح (ما بالشاشة غيرُ ما بالخادم)", s.saveBtn()?.props.disabled === false);
    await s.save();
    check("  ويُرسل بترتيب الظهور، سطرٌ لكلّ مادة", J(s.log.set[0]?.[1]) === J([{ product_id: "p-glove", qty: 3, unit: "sub" }, { product_id: "p-lyse", qty: 2, unit: "sub" }]), J(s.log.set));
    s.done();
    s = await session({ get: { fingerprint: "fp-f", flat_cost: null, lines: [L(GLOVE, 1, "stock"), L(GLOVE, 4, "sub")] } });
    check("علبة + ٤ أزواج ⇒ ٥٤ زوجاً (العلبةُ ٥٠ بالضبط)", s.rows().length === 1 && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "54" && s.ui.find("data-seg")?.props["data-seg"] === "sub", J(s.rows().map(textOf)));
    await s.save();
    check("  ويُرسل ٥٤ بالصغيرة", J(s.log.set[0]?.[1]) === J([{ product_id: "p-glove", qty: 54, unit: "sub" }]), J(s.log.set));
    s.done();
    s = await session({ get: { fingerprint: "fp-f", flat_cost: null, lines: [L(VIAL, 0.001, "stock"), L(VIAL, 1, "sub")] } });
    check("٠٫٠٠١ فيال × ٢٫٥ مل لا يقع على ثلاث منازل ⇒ يبقيان سطرين بتنبيه", s.rows().length === 2 && s.ui.findAll("data-rcp-dup").length === 2, J(s.rows().map(textOf)));
    check("  وهما كما بالخادم (يُخصمان كلاهما) فلا حفظ بلا تعديل", s.saveBtn()?.props.disabled === true);
    await s.qty("فيال", "0.002");
    await s.save();
    check("  وبعد تعديلٍ: الحفظُ يرفض «مكرّرة» ولا نداء", s.log.set.length === 0 && s.problem().includes("⟦services.rcp.dup⟧"), J({ set: s.log.set, p: s.problem() }));
    await s.remove("فيال");
    await s.save();
    check("  وشيلُ أحدهما يفتح الحفظ", s.log.set.length === 1 && J(s.log.set[0][1]) === J([{ product_id: "p-vial", qty: 1, unit: "sub" }]), J(s.log.set));
    s.done();
    s = await session({ get: { fingerprint: "fp-f", flat_cost: null, lines: [L(BOX, 1, "stock"), L(BOX, 2, "sub", "no_sub_unit")] } });
    check("ومادةٌ لا تنقسم بوحدتين ⇒ سطران (المكسورُ بسببه) والحفظُ يرفض", s.rows().length === 2 && s.ui.findAll("data-rcp-dup").length === 2 && s.rows()[1].props["data-rcp-broken"] === "no_sub_unit");
    s.done();
  });

  /* ── ز) الحمولةُ بالضبط ─────────────────────────────────────────────────── */
  await section("▸ ز) ما يصل recipeSet بالضبط، والأثرُ بالمخزن والمال", async () => {
    mem.clear();
    let s = await session({ get: { fingerprint: "fp-g", flat_cost: null, lines: [L(GLOVE, 2, "sub"), L(LYSE, 2, "sub")] } });
    const eff = (name) => textOf(within(s.row(name), "data-rcp-effect"));
    check("«٢ زوج = ٠٫٠٤ علبة · ٤٠٠» — من consumption.ts", eff("كفوف فحص").startsWith("⟦services.rcp.effectCost⟧") && plain(eff("كفوف فحص")) === "2 زوج = 0.04 علبة · 400 د.ع", eff("كفوف فحص"));
    check("  و«٢ مل = ٠٫٠٠٤ علبة · ٢٤٠»", plain(eff("Lyse")) === "2 مل = 0.004 علبة · 240 د.ع", eff("Lyse"));
    check("  والحفظُ مقفولٌ ولا شيء تغيّر، ولا إمساكَ للتحديث", s.saveBtn()?.props.disabled === true && globalThis.__rcp.holds.length === 0, J(globalThis.__rcp.holds));
    await s.qty("Lyse", "١٫٢٥");
    check("  والتعديلُ يمسك تحديثَ النسخة (holdUpdates(Infinity))", globalThis.__rcp.holds.length === 1 && globalThis.__rcp.holds[0] === Infinity, J(globalThis.__rcp.holds));
    await s.pick("diluent", "p-cube");
    await s.qty("Diluent", "10");
    check("  ١٠ مل من مكعّب ٢٠ لتراً = «أقل من ٠٫٠٠١» علبة · ١٢٥", plain(eff("Diluent")) === "10 مل = أقل من 0.001 علبة · 125 د.ع", eff("Diluent"));
    check("  و١٫٢٥ مل Lyse تقريبيّةٌ بعلامتها · ١٥٠", /^1\.25 مل = ≈0\.00[23] علبة · 150 د\.ع$/.test(plain(eff("Lyse"))), eff("Lyse"));
    await s.remove("كفوف فحص");
    await s.save();
    check("الترتيبُ والكميةُ (الشرقيةُ مقروءة) والوحدةُ والبصمةُ بالضبط",
      J(s.log.set) === J([["svc-cat", [{ product_id: "p-lyse", qty: 1.25, unit: "sub" }, { product_id: "p-cube", qty: 10, unit: "sub" }], "fp-g", false]]), J(s.log.set));
    check("«انحفظت…» ومعها «الأجهزة اللي ما تحدّثت ما تخصم» بأوّل حفظٍ على الجهاز", s.log.toasts.length === 1
      && s.log.toasts[0][1] === '⟦services.rcp.saved⟧انحفظت. من هسّة كل "تعقيم قطة" يخصم هالمواد ويحسب كلفتها'
      && s.log.toasts[0][2] === "⟦services.rcp.firstSave⟧الأجهزة اللي ما تحدّثت ما تخصم — سكّر doctorVet وافتحه على كل جهاز", J(s.log.toasts));
    check("  والنافذةُ تُغلق والأبُ يُبلَّغ", s.log.closed === 1 && J(s.log.saved) === J([{ lines: 2, clearedFlat: false }]));
    s.done(); await flush();   // تنظيفُ الأثر المؤجَّل عند الفكّ يجري بالطابور لا بنفس النداء
    check("  والإمساكُ يُفلت حين تُغلق", globalThis.__rcp.released === 1, J({ holds: globalThis.__rcp.holds, released: globalThis.__rcp.released }));
    s = await session({ get: { fingerprint: "fp-g2", flat_cost: null, lines: [L(GLOVE, 2, "sub")] } });
    await s.qty("كفوف فحص", "3"); await s.save();
    check("  وبالحفظ الثاني على نفس الجهاز: بلا تنبيه الأجهزة", s.log.toasts.length === 1 && s.log.toasts[0][2] === null, J(s.log.toasts));
    s.done();
    s = await session({ get: { fingerprint: "fp-g3", flat_cost: 3000, lines: [L(GLOVE, 2, "sub"), L(LYSE, 2, "sub")] } });
    await s.remove("كفوف فحص"); await s.remove("Lyse"); await s.save();
    check("  وشيلُ كلّ السطور يحفظ وصفةً فارغة (ولا سؤالَ كلفة)", J(s.log.set) === J([["svc-cat", [], "fp-g3", false]]), J(s.log.set));
    s.done();
  });

  /* ── ح) رفضُ الخادم ────────────────────────────────────────────────────── */
  await section("▸ ح) recipe_moved ورفضُ الخادم وانتهاءُ الاشتراك", async () => {
    let s = await session({ get: (n) => ({ fingerprint: `fp-h${n}`, flat_cost: null, lines: n === 1 ? [L(GLOVE, 2, "sub")] : [L(LYSE, 5, "sub")] }),
      setFail: svcErr("recipe_moved", "الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد") });
    await s.qty("كفوف فحص", "7"); await s.save();
    check("recipe_moved ⇒ «الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد»", !!s.ui.find("data-rcp-error") && textOf(s.ui.find("data-rcp-error")).includes("⟦services.rcp.moved⟧الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد"), s.text().slice(-300));
    check("  والنافذةُ باقية والسطرُ كما كُتب، والحفظُ مقفول حتى يُعاد التحميل", s.log.closed === 0 && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "7" && s.saveBtn()?.props.disabled === true && s.log.saved.length === 0);
    await s.press("data-rcp-reload");
    check("  و«حمّلها من جديد» تقرأ الوصفةَ الجديدة", s.log.gets === 2 && !!s.row("Lyse") && !s.row("كفوف فحص") && !s.ui.find("data-rcp-error"), J({ gets: s.log.gets, rows: s.rows().map(textOf) }));
    s.done();
    s = await session({ get: { fingerprint: "fp-h", flat_cost: null, lines: [L(GLOVE, 2, "sub")] }, setFail: svcErr("recipe_forbidden", "وصفة الخدمة يعدّلها المدير — افتح وضع المدير") });
    await s.qty("كفوف فحص", "4"); await s.save();
    check("recipe_forbidden ⇒ تلميحُ الخادم كما هو، والسطورُ سليمة", textOf(s.ui.find("data-rcp-error")) === "وصفة الخدمة يعدّلها المدير — افتح وضع المدير" && !s.ui.find("data-rcp-reload")
      && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "4" && s.log.closed === 0, textOf(s.ui.find("data-rcp-error")));
    check("  والحفظُ يُعاد بضغطة", s.saveBtn()?.props.disabled === false);
    s.done();
    s = await session({ get: { fingerprint: "fp-h", flat_cost: null, lines: [L(GLOVE, 2, "sub")] }, setFail: Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" }) });
    await s.qty("كفوف فحص", "4"); await s.save();
    check("اشتراكٌ منتهٍ (ReadOnlyError) ⇒ «القراءة فقط» من describeDbError", textOf(s.ui.find("data-rcp-error")).startsWith("⟦errors.readOnly⟧") && s.log.closed === 0, textOf(s.ui.find("data-rcp-error")));
    s.done();
  });

  /* ── ط) من لا يعدّل ─────────────────────────────────────────────────────── */
  await section("▸ ط) غيرُ المحرِّر يقرأ ولا يحفظ", async () => {
    const s = await session({ canEdit: false, get: { fingerprint: "fp-i", flat_cost: 3000, lines: [L(GLOVE, 2, "sub")] } });
    check("لا حفظ ولا «+ مادة» ولا شيل ولا حقل كمية، وملاحظةُ المدير", !s.saveBtn() && !s.ui.find("data-rcp-add") && s.ui.findAll("data-rcp-remove").length === 0
      && s.ui.findAll("data-rcp-qty").length === 0 && !!s.ui.find("data-rcp-readonly"));
    check("  والسطرُ يُقرأ بكميته، ولا نداء", s.rows().length === 1 && textOf(within(s.row("كفوف فحص"), "data-rcp-qtytext")) === "2 زوج" && s.log.set.length === 0);
    s.done();
  });

  /* ── ي) حرّاسُ §3.5 والمنتقي ────────────────────────────────────────────── */
  await section("▸ ي) الحرّاس: كلفةٌ صفر، T(1)=0، «بالمل؟»، المنتقي، السقف، والكلف", async () => {
    let s = await session({ get: { fingerprint: "fp-j", flat_cost: null, lines: [L(SUTURE, 1, "stock")] } });
    check('سعرُ شراءٍ صفر ⇒ «"خيط" سعر شرائه صفر — …حدّثه من المخزون»', s.text().includes('⟦services.rcp.zeroCost⟧"خيط" سعر شرائه صفر — كلفته ما راح تنحسب، حدّثه من المخزون'));
    check("  وبالعلبة وحدها: لا اختيارَ وحدة، و«بالمل؟» مغلق", !within(s.row("خيط"), "data-seg") && !!within(s.row("خيط"), "data-rcp-subask") && !s.ui.find("data-rcp-nosub"));
    s.ui.click(within(s.row("خيط"), "data-rcp-subask")); await flush();
    const nosub = s.ui.find("data-rcp-nosub");
    check("  «بالمل؟» ⇒ «هالمادة تنحسب بالعلبة بس…» ورابطُ /inventory?edit=p-sut", !!nosub && textOf(nosub).includes("⟦services.rcp.noSub⟧هالمادة تنحسب بالعلبة بس. تريد تخصم بالمل؟") && within(nosub, "to", "/inventory?edit=p-sut") !== null);
    s.done();
    s = await session({ showCost: false, get: { fingerprint: "fp-j", flat_cost: null, lines: [L(SUTURE, 1, "stock"), L(GLOVE, 2, "sub")] } });
    check("بلا صلاحية الكلفة: لا «سعر شرائه صفر» ولا مجموع ولا مالَ بأيّ مكان",
      !s.text().includes("⟦services.rcp.zeroCost⟧") && !s.ui.find("data-rcp-total") && !s.text().includes("د.ع") && plain(textOf(within(s.row("كفوف فحص"), "data-rcp-effect"))) === "2 زوج = 0.04 علبة", s.text());
    s.done();
    s = await session({ get: { fingerprint: "fp-j", flat_cost: null, lines: [] } });
    await s.pick("محلول", "p-huge");
    await s.qty("محلول كبير", "0.001");
    check("T(1) = 0 (٠٫٠٠١ مل من ٥ ملايين) ⇒ «الكمية صغيرة كلش — ما تبيّن بالمخزون»", textOf(within(s.row("محلول كبير"), "data-rcp-small")) === "⟦services.rcp.tooSmall⟧الكمية صغيرة كلش — ما تبيّن بالمخزون");
    await s.save();
    check("  والحفظُ يرفضها قبل النداء (recipe_too_small)", s.log.set.length === 0 && s.problem().includes("⟦services.rcp.tooSmall⟧"), s.problem());
    await s.qty("محلول كبير", "0.0005");
    check("  وأربعُ منازل ⇒ «اكتب كمية…» (لا تقريبَ صامت)", !!within(s.row("محلول كبير"), "data-rcp-badqty"));
    await s.save();
    check("  والحفظُ يرفضها (recipe_bad_line)", s.log.set.length === 0 && s.problem().includes("⟦services.rcp.badQty⟧"), s.problem());
    s.done();
    s = await session({ get: { fingerprint: "fp-j", flat_cost: null, lines: [L(GLOVE, 1, "sub")] } });
    await s.search("شاش");
    const poolBtn = s.ui.find("data-rcp-pick", "p-pool");
    check("المنتقي: مادةُ الحوض معروضةٌ مقفولةً بسببها", !!poolBtn && poolBtn.props.disabled === true && textOf(poolBtn).includes("⟦services.rcp.pickPooled⟧"));
    await s.search("كفوف");
    /* «لا توجد نتائج» عن مادةٍ بالرفّ كذبةٌ تُصدَّق (CLAUDE.md §٣: عيادةٌ أعادت إدخالَ ما برفّها) — فالتي بالوصفة
     * تُعرض مقفولةً بسببها، ولا تُضاف مرّتين ولو نودي زرُّها. */
    const inBtn = s.ui.find("data-rcp-pick", "p-glove");
    check("  والمادةُ التي بالوصفة تُعرض مقفولةً «موجودة بالوصفة» — لا «لا توجد نتائج» عن مادةٍ موجودة",
      !!inBtn && inBtn.props.disabled === true && textOf(inBtn).includes("⟦services.rcp.pickIn⟧") && !s.text().includes("⟦common.noMatches⟧"), s.text().slice(-200));
    inBtn?.props.onClick?.(); await flush();
    check("  ولا تُضاف مرّتين ولو نودي زرُّها", s.rows().length === 1, J(s.rows().length));
    s.done();
    s = await session({ get: { fingerprint: "fp-j", flat_cost: null, lines: [] } });
    await s.search("٦٢٨١٠٠٠٠١٢٣٤٥");
    check("  والباركودُ بالأرقام الشرقية يلقى المادة (normalizeCode على الطرفين)", !!s.ui.find("data-rcp-pick", "p-glove"));
    await s.search(" SH-12 ");
    check("  ورمزُها الإضافيّ (alt_codes) بمسافاته", !!s.ui.find("data-rcp-pick", "p-glove"));
    await s.search("اميكاسين");
    check("  والاسمُ بلا همزة يلقى «أميكاسين» (searchable)", !!s.ui.find("data-rcp-pick", "p-hamza"));
    await s.press("data-rcp-pick", "p-hamza");
    check("  والمادةُ بلا وحدةٍ صغيرة تُضاف بالعلبة (كلمةُ الكاشير retail.unitBox)", !within(s.row("أميكاسين"), "data-seg") && textOf(s.row("أميكاسين")).includes("⟦retail.unitBox⟧علبة"));
    await s.pick("كفوف", "p-glove");
    check("  والتي تنقسم تُضاف بالصغيرة (١ زوج)", within(s.row("كفوف فحص"), "data-seg")?.props["data-seg"] === "sub" && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "1");
    await s.pick("قطن", "p-kg");
    check("  والكيلو «كغ» (كالكاشير والمخزون، retail.unitKg) بلا «بالمل؟»", textOf(s.row("قطن طبي")).includes("⟦retail.unitKg⟧كغ") && !textOf(s.row("قطن طبي")).includes("كغم") && !within(s.row("قطن طبي"), "data-rcp-subask"));
    s.done();
    const forty = Array.from({ length: 40 }, (_v, i) => P(`p-x${i}`, `مادة ${i}`, { purchase_price: 10 }));
    s = await session({ products: [...ALL, ...forty], get: { fingerprint: "fp-j", flat_cost: null, lines: forty.map((p) => L(p, 1, "stock")) } });
    check("٤٠ سطراً ⇒ لا «+ مادة» بل «وصلت ٤٠ مادة»", !s.ui.find("data-rcp-add") && !!s.ui.find("data-rcp-full") && s.rows().length === 40);
    s.done();
  });

  /* ── ل) ما أمسكه التدقيقُ العدائيّ ─────────────────────────────────────────── */
  await section("▸ ل١) التدقيق: recipe_moved ثمّ تعديل — لا طريقَ مسدودٌ بلا كلمة", async () => {
    /* recipe_moved ثمّ أيُّ تعديل: كانت الرسالةُ وزرُّ «حمّلها من جديد» يختفيان (التعديلُ يمسح الخطأ) والحفظُ يبقى
     * مقفولاً — زرٌّ رماديّ بلا كلمة ولا مخرج إلا الإغلاق. */
    let s = await session({ get: (n) => ({ fingerprint: `fp-l${n}`, flat_cost: null, lines: n === 1 ? [L(GLOVE, 2, "sub")] : [L(LYSE, 5, "sub")] }),
      setFail: svcErr("recipe_moved", "الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد") });
    await s.qty("كفوف فحص", "7"); await s.save();
    await s.qty("كفوف فحص", "8");
    check("recipe_moved ثمّ تعديل: الرسالةُ و«حمّلها من جديد» باقيتان مع الحفظ المقفول — لا طريقَ مسدودٌ بلا كلمة",
      !!s.ui.find("data-rcp-reload") && textOf(s.ui.find("data-rcp-error")).includes("⟦services.rcp.moved⟧") && s.saveBtn()?.props.disabled === true, s.text().slice(-300));
    await s.press("data-rcp-reload");
    check("  و«حمّلها من جديد» تفتح الحفظ للوصفة الجديدة", s.log.gets === 2 && !!s.row("Lyse") && !s.ui.find("data-rcp-error"));
    s.done();
  });
  await section("▸ ل٢) التدقيق: خدمةٌ بلا سعر لا تُنذر «أكثر من سعر الخدمة (٠)»", async () => {
    /* خدمةٌ بلا سعر (٠ — مكتبةُ العمليات تضيفها هكذا، والسعرُ يُكتب بالكاشير): «أكثر من سعر الخدمة (٠)» كان يطلع
     * لكلّ وصفةٍ بكلفة — إنذارٌ دائم يعلّم الضغطَ بلا قراءة، والمجموعُ نفسُه يقول «بلا سعر». */
    let s = await session({ price: 0, get: { fingerprint: "fp-l", flat_cost: null, lines: [L(LYSE, 2, "sub")] } });
    await s.unit("Lyse", "stock");
    const t0 = s.ui.find("data-rcp-total");
    check("خدمةٌ بلا سعر: المجموعُ «كلفة المواد لكل مرّة: ١٢٠٬٠٠٠» بلا «من سعر» وليس أحمر",
      textOf(t0) === "⟦services.rcp.totalNoPrice⟧كلفة المواد لكل مرّة: 120,000 د.ع" && !String(t0?.props.className).includes("danger"), textOf(t0));
    await s.save();
    check("  والحفظُ بضغطة — لا «أكثر من سعر الخدمة (٠)»", !s.ui.find("data-rcp-over") && s.log.set.length === 1, J({ set: s.log.set.length, over: !!s.ui.find("data-rcp-over") }));
    s.done();
  });
  await section("▸ ل٣) التدقيق: البحثُ بالرمز بطيّ الحالة وبجزء الرمز (codeMatcher)", async () => {
    /* البحثُ بالرمز من مصدره الواحد (codeMatcher، productCodes.ts): طيُّ الحالة («w90» يلقى «W90» — رموزُ رفوفٍ مقيسة
     * بالإنتاج) وجزءُ الرمز كما بالبيع والشراء وورقة المستهلكات. normalizeCode بـ=== كان يفوّت الاثنين. */
    const s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [] } });
    await s.search("sh-12");
    check("الرمزُ الإضافيّ بحروفٍ صغيرة «sh-12» يلقى «SH-12»", !!s.ui.find("data-rcp-pick", "p-glove"));
    await s.search("٦٢٨١٠٠٠٠");
    check("  وأوّلُ ثماني خاناتٍ من الباركود (بالشرقية) تلقى المادة", !!s.ui.find("data-rcp-pick", "p-glove"));
    s.done();
  });
  await section("▸ ل٤) التدقيق: رفضُ سطر الحقل بسببه", async () => {
    /* رفضُ سطرٍ من مخزن الحقل يقول سببَه — لا «ما عادت موجودة بالمخزن» عن مادةٍ موجودةٍ بالحقل. */
    const FARM2 = P("p-farm2", "علف حقل", { farm_id: "f1" });
    const s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(FARM2, 1, "stock", "farm_stock"), L(GLOVE, 1, "sub")] } });
    await s.qty("كفوف فحص", "2"); await s.save();
    check("رفضُ سطر الحقل بسببه (من مخزن الحقل) لا «ما عادت موجودة»", s.log.set.length === 0 && s.problem().includes("⟦services.rcp.farm⟧") && !s.problem().includes("⟦services.rcp.gone⟧"), s.problem());
    s.done();
  });
  await section("▸ ل٥) التدقيق: الإغلاقُ وتعديلٌ لم يُحفظ يسأل", async () => {
    /* تعديلٌ لم يُحفظ لا يُمحى بلمسةٍ خارج النافذة أو Esc أو «إلغاء» (سابقةُ المشتريات والصورة: confirmClose). */
    let s = null;
    const dlg = () => s.ui.find("data-dialog");
    s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(GLOVE, 1, "sub")] } });
    dlg().props.onClose(); await flush();
    check("بلا تعديل: لمسةٌ خارج النافذة تُغلقها كما كانت", s.log.closed === 1 && !s.ui.find("data-rcp-leave"));
    s.done();
    s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(GLOVE, 1, "sub"), L(GLOVE, 2, "sub")] } });
    check("  (طيُّ الدمج وحده يفتح الحفظ…)", s.saveBtn()?.props.disabled === false);
    dlg().props.onClose(); await flush();
    check("  …ولا يُسأل عنه عند الخروج — لم تلمسه يد، والخادمُ يخصم السطرين كما هما", s.log.closed === 1 && !s.ui.find("data-rcp-leave"));
    s.done();
    s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(GLOVE, 1, "sub")] } });
    await s.qty("كفوف فحص", "3");
    dlg().props.onClose(); await flush();
    check("تعديلٌ لم يُحفظ + لمسةٌ خارج النافذة ⇒ «عندك تعديل ما انحفظ…» ولا إغلاق", s.log.closed === 0 && !!s.ui.find("data-rcp-leave") && s.text().includes("⟦services.rcp.leaveAsk⟧"), s.text().slice(-300));
    // Esc على السؤال = onClose نافذة السؤال (الثانية بالشجرة): يُغلقه والمحرّرُ وسطورُه باقية.
    s.ui.findAll("data-dialog")[1].props.onClose(); await flush();
    check("  Esc على السؤال يُغلقه، والمحرّرُ وسطورُه باقية", !s.ui.find("data-rcp-leave") && s.log.closed === 0
      && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "3");
    await s.press("data-rcp-cancel");
    check("  و«إلغاء» يسأل كذلك", s.log.closed === 0 && !!s.ui.find("data-rcp-leave"));
    await s.press("data-rcp-leave-no");
    check("  و«لا، ارجع» يبقي السطرَ كما كُتب", !s.ui.find("data-rcp-leave") && within(s.row("كفوف فحص"), "data-rcp-qty")?.props.value === "3" && s.log.closed === 0);
    await s.press("data-rcp-cancel");
    await s.press("data-rcp-leave-yes");
    check("  و«اطلع بدون حفظ» يُغلق بلا نداء", s.log.closed === 1 && s.log.set.length === 0);
    s.done();
    s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(SUTURE, 1, "stock"), L(GLOVE, 1, "sub")] } });
    await s.qty("كفوف فحص", "3");
    s.ui.click(within(s.row("خيط"), "data-rcp-subask")); await flush();
    let prevented = false;
    within(s.ui.find("data-rcp-nosub"), "to", "/inventory?edit=p-sut").props.onClick({ preventDefault() { prevented = true; }, stopPropagation() {} }); await flush();
    check("«افتح المادة» وتعديلٌ لم يُحفظ ⇒ لا ينتقل قبل أن يسأل", prevented && s.log.closed === 0 && !!s.ui.find("data-rcp-leave") && globalThis.__rcp.nav.length === 0);
    await s.press("data-rcp-leave-yes");
    check("  و«اطلع بدون حفظ» يروح للمادة ويُغلق", J(globalThis.__rcp.nav) === J(["/inventory?edit=p-sut"]) && s.log.closed === 1, J(globalThis.__rcp.nav));
    s.done();
    s = await session({ get: { fingerprint: "fp-l", flat_cost: null, lines: [L(SUTURE, 1, "stock")] } });
    s.ui.click(within(s.row("خيط"), "data-rcp-subask")); await flush();
    prevented = false;
    within(s.ui.find("data-rcp-nosub"), "to", "/inventory?edit=p-sut").props.onClick({ preventDefault() { prevented = true; }, stopPropagation() {} }); await flush();
    check("  وبلا تعديل: الرابطُ يمرّ ويُغلق المحرّر كما كان", !prevented && s.log.closed === 1);
    s.done();
  });
  await section("▸ ل٦) التدقيق: اسمُ المادة بسطره — لا تأكله الكميةُ والوحدة بعرض الهاتف", async () => {
    /* الاسمُ والكميةُ (w-24) والوحدةُ (Segmented) وزرُّ الشيل كانت بسطرٍ واحد، والاسمُ min-w-0 flex-1 (أساسُه صفر) فلا
     * يلفّ السطرُ أبداً ويمتصّ الاسمُ الضغطَ كلَّه: مقيسٌ بمتصفّحٍ بعرض ٣٧٥ — ٤٥px، و«كفوف فحص لاتكس وسط» و«…كبير»
     * كلتاهما «كفو…» بنفس الأثر، فيقع تعديلٌ على المقاس الغلط والخصمُ صامتٌ بكلّ بيعة. فالاسمُ بسطره مع زرّ الشيل وحده،
     * والكميةُ والوحدةُ تحته (كورقة المستهلكات)، ويلفّ ولا يُقصّ: الفرقُ بآخر الاسم، والهاتفُ لا يعرض title. */
    const MED = P("p-gm", "كفوف فحص لاتكس وسط", { purchase_price: 5000, has_sub_unit: true, sub_unit_name: "زوج", units_per_box: 50 });
    const LRG = P("p-gl", "كفوف فحص لاتكس كبير", { purchase_price: 5000, has_sub_unit: true, sub_unit_name: "زوج", units_per_box: 50 });
    const TAPE = P("p-tape", "لاصق جروح 2.5 سم");   // بالمحذوفات: غائبةٌ عن قائمة المواد الحيّة
    const prods = [...ALL, MED, LRG];
    const get = { fingerprint: "fp-n", flat_cost: null, lines: [L(MED, 1, "sub"), L(LRG, 1, "sub"), L(SUTURE, 1, "stock"), L(TAPE, 1, "stock", "in_trash")] };
    const NAMES = [MED.name, LRG.name, SUTURE.name, TAPE.name];
    /* عقدةُ الاسم بنيوياً (نصُّها الاسمُ وحده) — تُلقى بالنسختين، فالفحصُ يمسك القديمةَ بسببها لا بغياب وسم. */
    const nameOf = (row, name) => walkAll(row ?? { children: [] }).find((n) => n.type !== "#text" && n.children.length === 1 && n.children[0].type === "#text" && n.children[0].text === name) ?? null;
    const CTRL = ["data-rcp-qty", "data-seg", "data-rcp-qtytext", "data-rcp-subask"];
    /* «يلفّ ولا يُقصّ» من wrapAudit حتى الصفّ (data-rcp-row): الاسمُ بندٌ بسطرٍ مرن (مع زرّ الشيل) فيحتاج min-w-0، ولا nowrap يُورَث. */
    const audit = (s, names = NAMES) => names.map((name) => {
      const row = s.row(name), n = nameOf(row, name), line = n?.parent ?? null;
      return { name, crowd: line ? CTRL.filter((a) => within(line, a)) : ["(no name)"], ...wrapAudit(n, row), trashOnLine: !!line && !!within(line, "data-rcp-remove") };
    });
    let s = await session({ products: prods, get });
    const a = audit(s);
    check("سطرُ الاسم فيه الاسمُ وزرُّ الشيل وحدهما — لا كميةَ ولا وحدةَ ولا «بالمل؟» تزاحمه (بكلّ سطر: يُقسَم، علبة، محذوف)",
      a.every((x) => x.crowd.length === 0 && x.trashOnLine), J(a));
    check("  والاسمُ يلفّ ولا يُقصّ — «…وسط» و«…كبير» تُقرآن كاملتين: يصغر عن أطول كلمة (min-w-0)، لا nowrap حتى الصفّ، ولا قصّ، ويكسر الكلمة",
      a.every(wrapsOk), J(a.map(({ name, shrinks, noNowrap, noClip, breaks }) => ({ name, shrinks, noNowrap, noClip, breaks }))));
    const below = (name, attr) => { const row = s.row(name), line = nameOf(row, name)?.parent; return !!within(row, attr) && !!line && !within(line, attr); };
    check("  والأدواتُ باقيةٌ تحته: الكميةُ والوحدةُ للمقسوم، العلبةُ و«بالمل؟» للعلبة، والكميةُ نصّاً للمحذوف",
      below(MED.name, "data-rcp-qty") && below(LRG.name, "data-seg") && below(SUTURE.name, "data-rcp-subask") && below(TAPE.name, "data-rcp-qtytext"),
      J(NAMES.map((n) => CTRL.filter((x) => within(s.row(n), x)))));
    await s.qty(LRG.name, "3");
    await s.unit(MED.name, "stock");
    await s.remove(TAPE.name);
    await s.save();
    check("  وكلُّ تعديلٍ يقع على سطر مادّته: ٣ أزواج «كبير»، والعلبةُ لـ«وسط»، والمحذوفُ يُشال",
      J(s.log.set[0]?.[1]) === J([{ product_id: "p-gm", qty: 1, unit: "stock" }, { product_id: "p-gl", qty: 3, unit: "sub" }, { product_id: "p-sut", qty: 1, unit: "stock" }]), J(s.log.set));
    s.done();
    s = await session({ products: prods, get, canEdit: false });
    const ro = audit(s);
    check("  وللقارئ (بلا تعديل): الاسمُ بسطره ويلفّ، والكميةُ نصّاً تحته", ro.every((x) => x.crowd.length === 0 && wrapsOk(x))
      && NAMES.every((n) => !!within(s.row(n), "data-rcp-qtytext")), J(ro));
    s.done();
    /* واسمٌ لاتينيّ بلا فاصل (كما يُلصق من قائمة المورّد) أطولُ من سطره بكلمةٍ واحدة: مقيسٌ بعرض ٣٧٥ — بلا min-w-0 على الاسم صار
     * عرضُه ٣٧٢–٣٨٨px بصفٍّ عرضُه ٣٢٥ وزرُّ شيله بين −٨٩ و−٤١px (خارج الشاشة: سطرٌ لا يُشال)، وبـwhitespace-nowrap طلع نصُّه
     * ٥٨–٧٤px خارج الصفّ. */
    const CEF = P("p-cef", "CEFTRIAXONESODIUMPOWDERFORINJECTION1GVIAL", { purchase_price: 4000 });
    const MET = P("p-met", "METRONIDAZOLEINTRAVENOUSINFUSION500MG100ML", { purchase_price: 6000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 100 });
    for (const canEdit of [true, false]) {
      s = await session({ products: [...ALL, CEF, MET], get: { fingerprint: "fp-n2", flat_cost: null, lines: [L(CEF, 1, "stock"), L(MET, 2, "sub")] }, canEdit });
      const al = audit(s, [CEF.name, MET.name]);
      check(`  واسمٌ لاتينيّ بلا فاصل (${canEdit ? "للمحرِّر، وزرُّ الشيل بسطره" : "للقارئ"}): بسطره ويلفّ داخل صفّه — يصغر عن كلمته، لا nowrap حتى الصفّ، ويكسرها`,
        al.every((x) => x.crowd.length === 0 && wrapsOk(x) && x.trashOnLine === canEdit), J(al));
      s.done();
    }
  });
  await section("▸ ل٧) التدقيق: المنتقي يقول كم بقي خارج الثمانية، والرمزُ الكامل أوّلاً", async () => {
    /* .slice(0, 8) كان يقصّ بصمت: «قطن» بعيادةٍ فيها ١٣ مادةً بالاسم تُعرض ثمانٍ ولا كلمة — قائمةٌ قُصّت بصمت تُصدَّق
     * «ماكو» فيُختار أقربُ اسمٍ أو تُدخل المادةُ ثانيةً (CLAUDE.md §٣). والسطورُ المقفولة (بالوصفة، بالحوض) تأكل الأماكنَ
     * نفسها فتُعدّ معها. ورمزٌ كُتب كاملاً («47» رقمُ رفّ، «w90» رمزٌ إضافيّ) كان خلف رموزٍ تحويه جزئياً فيسقط خارج
     * الثمانية — مطابقُه بالضبط (matchCode، الأساسيُّ والإضافيّ) أوّلاً، كتبويب التلف. */
    const ROLLS = Array.from({ length: 12 }, (_v, i) => P(`p-roll${i + 1}`, `قطن طبي رول ${i + 1}`, { purchase_price: 100 }));
    const picks = (st) => st.ui.findAll("data-rcp-pick").map((b) => b.props["data-rcp-pick"]);
    const more = (st) => textOf(st.ui.find("data-rcp-more"));
    let s = await session({ products: [...ALL, ...ROLLS], get: { fingerprint: "fp-p", flat_cost: null, lines: [L(ROLLS[1], 1, "stock")] } });
    await s.search("قطن");
    check("«قطن» يطابق ١٣ مادة (الكيلو و١٢ رول): ثمانٍ معروضة وتحتها «و٥ غيرها — اكتب أكثر» — لا قصٌّ صامت",
      picks(s).length === 8 && more(s) === "⟦services.rcp.more⟧و5 غيرها — اكتب أكثر", J({ picks: picks(s), more: more(s) }));
    check("  والسطرُ المقفول (بالوصفة) معروضٌ ومعدودٌ بالثمانية — لا يُخفى ولا يُسقط من العدد",
      J(picks(s)) === J(["p-kg", ...ROLLS.slice(0, 7).map((p) => p.id)]) && s.ui.find("data-rcp-pick", "p-roll2")?.props.disabled === true, J(picks(s)));
    await s.search("قطن طبي رول 1");
    check("  وكتابةٌ أكثر تضيّقها (رول 1، 10، 11، 12): كلُّها معروضة ولا سطرَ عدد", picks(s).length === 4 && !s.ui.find("data-rcp-more"), J({ picks: picks(s), more: more(s) }));
    s.done();
    s = await session({ products: [...ALL, ...ROLLS.slice(0, 7)], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
    await s.search("قطن");
    check("  ثمانٍ بالضبط ⇒ كلُّها معروضة ولا سطرَ عدد", picks(s).length === 8 && !s.ui.find("data-rcp-more"), J({ picks: picks(s), more: more(s) }));
    s.done();
    s = await session({ products: [...ALL, ...ROLLS.slice(0, 8)], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
    await s.search("قطن");
    check("  وتسعٌ ⇒ «و١ غيرها»", picks(s).length === 8 && more(s) === "⟦services.rcp.more⟧و1 غيرها — اكتب أكثر", more(s));
    s.done();
    /* «47» كاملاً، وتسعُ موادّ قبله بالقائمة باركوداتُها تحويه (10470، 20471…). */
    const PART = Array.from({ length: 9 }, (_v, i) => P(`p-part${i}`, `مادة رف ${i}`, { barcode: `${i + 1}047${i}` }));
    const SHELF = P("p-shelf", "شاش رقم الرف", { barcode: "47" });
    s = await session({ products: [...PART, SHELF, ...ALL], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
    await s.search("47");
    check("رقمُ رفٍّ كاملٌ «47» ومطابقُه بالضبط بعد تسعِ موادّ تحويه جزئياً: أوّلُ النتائج (كان خارج الثمانية)، و«و٢ غيرها»",
      picks(s)[0] === "p-shelf" && picks(s).length === 8 && more(s) === "⟦services.rcp.more⟧و2 غيرها — اكتب أكثر", J({ picks: picks(s), more: more(s) }));
    check("  والجزئيُّ بعده بترتيبه — لا يُرمى", J(picks(s).slice(1)) === J(PART.slice(0, 7).map((p) => p.id)), J(picks(s)));
    if (s.ui.find("data-rcp-pick", "p-shelf")) await s.press("data-rcp-pick", "p-shelf");
    check("  وضغطُه يضيفه للوصفة", !!s.row("شاش رقم الرف"), J(s.rows().map(textOf)));
    s.done();
    /* رمزٌ إضافيّ بحروفٍ صغيرة: «w90» = «W90» بالضبط (طيُّ الحالة)، وثمانٍ قبله رموزُها الإضافية W900…W907 تحويه. */
    const ALTS = Array.from({ length: 8 }, (_v, i) => P(`p-alt${i}`, `ضماد ${i}`, { alt_codes: [`W90${i}`] }));
    const W90 = P("p-w90", "ضماد الرف", { barcode: "6200000000017", alt_codes: ["W90"] });
    s = await session({ products: [...ALTS, W90, ...ALL], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
    await s.search("w90");
    check("  ورمزٌ إضافيّ كاملٌ بحروفٍ صغيرة «w90» = «W90»: أوّلاً، و«و١ غيرها»", picks(s)[0] === "p-w90" && more(s) === "⟦services.rcp.more⟧و1 غيرها — اكتب أكثر", J({ picks: picks(s), more: more(s) }));
    s.done();
    /* ومطابقُ الرمز بالضبط مادةُ حوض: أوّلاً ومقفولةً بسببها — لا تختفي خلف الجزئيّ فيُظنّ أن الرمزَ ما ينعرف. */
    const POOLED47 = P("p-pool47", "شاش القسم برقم الرف", { barcode: "47", pooled: true, company_id: "co1", section_id: "s1" });
    s = await session({ products: [...PART, POOLED47, ...ALL], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
    await s.search("47");
    const first = s.ui.findAll("data-rcp-pick")[0];
    check("  ومطابقُه مادةُ حوض: أوّلاً ومقفولةً بسببها", first?.props["data-rcp-pick"] === "p-pool47" && first.props.disabled === true && textOf(first).includes("⟦services.rcp.pickPooled⟧"), textOf(first));
    await s.search("٤٧");
    check("  و«٤٧» بالأرقام الشرقية هو «47» بالضبط (التطبيعُ نفسُه على الطرفين)", picks(s)[0] === "p-pool47", J(picks(s)));
    s.done();
    /* والتطبيعُ على الطرفين لكلّ حقل — طرفاً طرفاً (CLAUDE.md §٣: تطبيعُ طرفٍ واحد يفشل بصمتٍ ويبدو أنه يعمل). ما فوق كان يُمرّر
     * طرفاً واحداً بكلّ حقل («47» مخزونٌ لا يحتاج تطبيعاً، و«w90» مكتوبٌ صغيراً): المكتوبُ بـnormalizeCode بلا طيّ الحالة، أو الباركودُ
     * المخزونُ خاماً، مرّا ١٥٧/٠ (التدقيق). فكلُّ حالةٍ لا تمرّ إلا إن طُبِّع طرفُها: «W90» مكتوباً و«w90» مخزوناً (شكلُ رقم الرفّ المقيس بـproductCodes.ts)،
     * و«W90» مخزوناً (normalizeCode يحفظ الحالة عند الحفظ)، والأرقامُ الشرقية والمسافةُ والعلامةُ الخفيّة بالمخزون ثمّ بالمكتوب —
     * بالأساسيّ ثمّ بالإضافيّ، وكلُّها خلف تسعِ موادّ تحويه جزئياً: طرفٌ بلا تطبيع يدفع المطابقَ خارج الثمانية. */
    const SIDES = [
      ["W90", "w90", "«W90» مكتوباً و«w90» مخزوناً"],
      ["w90", "W90", "«w90» مكتوباً و«W90» مخزوناً"],
      ["47", " ٤٧\u200F", "«47» مكتوباً والمخزونُ بأرقامٍ شرقية ومسافةٍ وعلامةٍ خفيّة"],
      ["\u200F٤٧ ", "47", "المكتوبُ بعلامةٍ خفيّة وأرقامٍ شرقية ومسافة و«47» مخزوناً"],
    ];
    for (const field of ["barcode", "alt_codes"]) {
      const code = (c) => (field === "barcode" ? { barcode: c } : { alt_codes: [c] });
      for (const [typed, stored, label] of SIDES) {
        const NEAR = Array.from({ length: 9 }, (_v, i) => P(`p-near${i}`, `لاصق ${i}`, code(`${stored}${i}`)));
        s = await session({ products: [...NEAR, P("p-hit", "لاصق الرف", code(stored)), ...ALL], get: { fingerprint: "fp-p", flat_cost: null, lines: [] } });
        await s.search(typed);
        check(`  ${field === "barcode" ? "الأساسيّ" : "الإضافيّ"}: ${label} ⇒ المطابقُ أوّلاً قبل تسعٍ تحويه، و«و٢ غيرها»`,
          picks(s)[0] === "p-hit" && picks(s).length === 8 && more(s) === "⟦services.rcp.more⟧و2 غيرها — اكتب أكثر", J({ picks: picks(s), more: more(s) }));
        s.done();
      }
    }
  });
  await section("▸ ل٨) التدقيق: سببُ القفل تحت اسم المادة بالمنتقي، والاسمُ يلفّ ولا يُقصّ", async () => {
    /* مقيسٌ بمتصفّحٍ بعرض ٣٧٥ بخطوط التطبيق وCSS المبنيّ (SCR/ui3-recipe/browser): السببُ بجانب الاسم يأخذ ١٩٨–٢٠٢px
     * فيبقى للاسم ٧٣–٧٧ — «شاش معق…» و«شاش مخز…» ولا يُعرف أيُّ مادةٍ قُفلت. والاسمُ الطويل يُقصّ بآخره حتى بلا سبب:
     * «…عبوة بلاستيك ٥٠٠ مل» و«…٢٥٠ مل» يحتاجان ٣٢٨–٣٣١ من ٢٨٣ فتتشابهان حيث تفترقان. فالسببُ بسطره تحت الاسم، والاسمُ
     * يلفّ ولا يُقصّ (كسطور الوصفة، ل٦: الفرقُ بآخر الاسم، والهاتفُ لا يعرض title). */
    const POOL_L = P("p-pl", "شاش معقم قسم الجراحة ١٠×١٠", { pooled: true, company_id: "co1", section_id: "s1" });
    const FARM_L = P("p-fl", "شاش مخزن الحقل الجنوبي", { farm_id: "f1" });
    const FREE = P("p-fr", "شاش ملفوف ٧ سم");
    const IN = P("p-in", "شاش طبي");
    /* واسمان لاتينيّان بلا فاصل (متاحٌ ومقفول) — المقيسان: بلا min-w-0 على حاوية الاسم برزا ٨٠ و٩٦px خارج صفّهما والمنتقي يتمرّر
     * أفقياً (٤٠٩ من ٣٢٣)، وبـwhitespace-nowrap على الاسم طلع نصُّهما ٨٠ و٩٦px خارج الصفّ (و١٣٤ لاسمٍ بمسافات) والمنتقي يتمرّر (٤٤٧ من ٣٢٣). */
    const AMX = P("p-amx", "AMOXICILLINCLAVULANATEPOTASSIUM875MG125MG");
    const AMXP = P("p-amxp", "AMOXICILLINTRIHYDRATEORALSUSPENSION250MG5ML", { pooled: true, company_id: "co1", section_id: "s1" });
    const s = await session({ products: [...ALL, POOL_L, FARM_L, FREE, IN, AMX, AMXP], get: { fingerprint: "fp-q", flat_cost: null, lines: [L(IN, 1, "stock")] } });
    await s.search("شاش");
    /* العقدتان بنيوياً (نصُّ الاسم وحده، ونصُّ السبب بمفتاحه) — تُلقيان بالنسختين، فالفحصُ يمسك القديمةَ بسببها لا بغياب وسم. */
    const leaf = (btn, ok) => walkAll(btn ?? { children: [] }).find((n) => n.type !== "#text" && n.children.length === 1 && n.children[0].type === "#text" && ok(n.children[0].text)) ?? null;
    const cls = (n) => String(n?.props?.className ?? "");
    /* «تحته» بقاعدة التدفّق: الأخوان ليسا بصفٍّ مرن، وأحدُهما كتلةٌ (block) فما بعدها يبدأ بسطرٍ جديد، والسببُ بعد الاسم.
     * و«يلفّ ولا يُقصّ» من wrapAudit حتى الزرّ: حاويةُ الاسم بندٌ بصفّ الزرّ المرن فتحتاج min-w-0، ولا nowrap يُورَث. */
    const pickRow = (id, name, key) => {
      const btn = s.ui.find("data-rcp-pick", id), nm = leaf(btn, (x) => x === name), why = key ? leaf(btn, (x) => x.startsWith(`⟦services.rcp.${key}⟧`)) : null, box = nm?.parent ?? null;
      const flexRow = /(^|\s)(inline-)?(flex|grid)(\s|$)/.test(cls(box)) && !/\bflex-col\b/.test(cls(box));
      const block = (n) => /(^|\s)block(\s|$)/.test(cls(n));
      return { id, disabled: btn?.props.disabled === true, name: !!nm, why: !!why, ...wrapAudit(nm, btn),
        under: !!nm && !!why && why.parent === box && !flexRow && (block(nm) || block(why)) && box.children.indexOf(why) > box.children.indexOf(nm) };
    };
    const locked = [pickRow("p-pl", POOL_L.name, "pickPooled"), pickRow("p-fl", FARM_L.name, "pickFarm"), pickRow("p-in", IN.name, "pickIn")];
    check("السطورُ المقفولة (حوض، حقل، بالوصفة): السببُ بسطره تحت الاسم — لا بجانبه بسطرٍ واحد يأكل الاسم",
      locked.every((r) => r.disabled && r.name && r.why && r.under), J(locked));
    const all4 = [...locked, pickRow("p-fr", FREE.name, null)];
    check("  والاسمُ يلفّ ولا يُقصّ بالمقفول والمتاح — «…٥٠٠ مل» و«…٢٥٠ مل» تُقرآن كاملتين: يصغر عن أطول كلمة (min-w-0)، لا nowrap حتى الزرّ، ولا قصّ، ويكسر الكلمة",
      all4.every((r) => r.name && wrapsOk(r)), J(all4));
    const free = s.ui.find("data-rcp-pick", "p-fr");
    check("  والمتاحُ بلا سطر سبب، ومفتوح", !!free && free.props.disabled === false && !leaf(free, (x) => x.startsWith("⟦services.rcp.pick")), textOf(free));
    if (free) await s.press("data-rcp-pick", "p-fr");
    check("  …وضغطُه يضيفه للوصفة", !!s.row("شاش ملفوف ٧ سم"), J(s.rows().map(textOf)));
    await s.search("AMOX");
    const latin = [pickRow("p-amx", AMX.name, null), pickRow("p-amxp", AMXP.name, "pickPooled")];
    check("  واسمٌ لاتينيّ بلا فاصل (متاحٌ، ومقفولٌ بسببه تحته): يلفّ داخل صفّه — يصغر عن كلمته، لا nowrap حتى الزرّ، ويكسرها",
      latin.every((r) => r.name && wrapsOk(r)) && latin[1].disabled && latin[1].under && !latin[0].disabled, J(latin));
    s.done();
  });
  await section("▸ ل٩) التدقيق: كلماتُ الوحدة كلماتُ الكاشير والمخزون — «كغ» و«مفرد» و«علبة»", async () => {
    /* مقيسٌ من الشاشات نفسها (التقرير): الكاشير يقول لمادّةٍ بالوزن «كغ» (retail.unitKg، retail.wKg) والمخزونُ «كغ»
     * (pos.qtyStockKg، pos.perKg)، ولوحدةٍ صغيرةٍ بلا اسم «مفرد» (retail.unitSingle: أزرارُ الوحدة وسطرُ السلّة) — وكذلك
     * ورقةُ المستهلكات وإشعارُها وتبويبُ التلف والجرد. والمحرّرُ وحده كان «كغم» و«وحدة»: نفسُ المادة بكلمتين بين
     * الإعدادات والكاشير، و«٢ وحدة = ٠٫٢ علبة» عن مادّةٍ تقول عنها ورقةُ المستهلكات «٢ مفرد». */
    const NONAME = P("p-nn", "قطرة عين", { purchase_price: 2000, has_sub_unit: true, sub_unit_name: null, units_per_box: 10 });
    const BLANK = P("p-bl", "مرهم عين", { purchase_price: 3000, has_sub_unit: true, sub_unit_name: "  ", units_per_box: 5 });
    const get = { fingerprint: "fp-r", flat_cost: null, lines: [L(KG, 1, "stock"), L(NONAME, 2, "sub"), L(BLANK, 1, "sub"), L(BOX, 1, "stock"), L(GLOVE, 2, "sub")] };
    let s = await session({ products: [...ALL, NONAME, BLANK], get });
    const opts = (name) => walkAll(s.row(name) ?? { children: [] }).filter((n) => n.props && "data-seg-opt" in n.props).map((n) => `${n.props["data-seg-opt"]}=${textOf(n)}`);
    const SUB = J(["stock=⟦retail.unitBox⟧علبة", "sub=⟦retail.unitSingle⟧مفرد"]);
    check("مادةٌ بالوزن: «كغ» (retail.unitKg) لا «كغم»", textOf(s.row("قطن طبي")).includes("⟦retail.unitKg⟧كغ") && !textOf(s.row("قطن طبي")).includes("كغم"), textOf(s.row("قطن طبي")));
    check("  ووحدةٌ صغيرةٌ بلا اسم (null، أو مسافات): «علبة | مفرد» — retail.unitBox وretail.unitSingle، لا «وحدة»",
      J(opts("قطرة عين")) === SUB && J(opts("مرهم عين")) === SUB, J([opts("قطرة عين"), opts("مرهم عين")]));
    check("  والأثرُ بنفس الكلمات: «٢ مفرد = ٠٫٢ علبة · ٤٠٠»", plain(textOf(within(s.row("قطرة عين"), "data-rcp-effect"))) === "2 مفرد = 0.2 علبة · 400 د.ع", textOf(within(s.row("قطرة عين"), "data-rcp-effect")));
    check("  والعلبةُ بكلمة الكاشير، والاسمُ المكتوب يبقى كما هو («زوج»)", textOf(s.row("سرنجات علبة")).includes("⟦retail.unitBox⟧علبة")
      && J(opts("كفوف فحص")) === J(["stock=⟦retail.unitBox⟧علبة", "sub=زوج"]), J(opts("كفوف فحص")));
    s.done();
    s = await session({ products: [...ALL, NONAME, BLANK], get, canEdit: false });
    const qt = (name) => plain(textOf(within(s.row(name), "data-rcp-qtytext")));
    check("  وللقارئ نصّاً: «1 كغ» و«2 مفرد»", qt("قطن طبي") === "1 كغ" && qt("قطرة عين") === "2 مفرد", J([qt("قطن طبي"), qt("قطرة عين")]));
    s.done();
    /* ولا قارئَ باقٍ للمفاتيح المتقاعدة — برهانُ الحذف للمدمج: المفتاحُ الميّت بالقاموس يُشال بعده. */
    const src = readFileSync(process.env.RECIPE_EDITOR_SRC || "src/components/settings/RecipeEditor.tsx", "utf8");
    const left = ["services.rcp.kg", "services.rcp.subUnit", "services.rcp.box"].filter((k) => src.includes(`"${k}"`));
    check("  ولا يقرأ المحرّرُ services.rcp.kg / subUnit / box بعد الآن", left.length === 0, J(left));
  });
}

/* ═════════ ك) Settings.tsx: الشريحةُ والحذفُ وإعادةُ القراءة ═════════ */
console.log("▸ ك) ServiceSettings الحقيقيّ — الشريحة، «كلفة غير المواد»، والحذفُ بضغطةٍ ثانية");
const SETTINGS = readFileSync(process.env.SETTINGS_SRC || "src/pages/Settings.tsx", "utf8");
if (process.env.SETTINGS_SRC) console.log(`   (Settings من ${process.env.SETTINGS_SRC})`);
/* كلُّ استيرادٍ لـSettings.tsx بديلٌ يُولَّد من سطور استيرادها (فاستيرادٌ جديد يأخذ بديلاً بلا تعديلٍ هنا)، إلا React
 * والأدوات الصِّرفة (utils: money وformatNum الحقيقيّان)، وما يُفحص (الخدمات والملخّص والمحرّر) فبديلٌ مكتوب. */
const settingsImports = new Map();
for (const m of SETTINGS.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
  if (m[1]) continue;
  const names = settingsImports.get(m[3]) ?? new Set();
  for (const part of (/\{([\s\S]*)\}/.exec(m[2])?.[1] ?? "").split(",")) {
    const s = part.trim();
    if (s && !s.startsWith("type ")) names.add(s.split(/\s+as\s+/)[0].trim());
  }
  if (!m[2].trim().startsWith("{") && /^\s*\w+\s*(,|$)/.test(m[2])) names.add("default");
  settingsImports.set(m[3], names);
}
const SVC_STUB = {
  ...I18N,
  "lucide-react": ICONS,
  "@/components/ui": UI_STUB,
  "@/hooks/usePermissions": "export const usePermissions = () => ({ role: 'manager', baseRole: 'manager', can: (c) => globalThis.__svc.can(c) });",
  "@/lib/managerOverride": "export const useOverride = () => ({ active: false, until: null, deviceLocked: false, restricted: globalThis.__svc.restricted, stockLocked: false }); export const ownerAccountFrom = () => true;",
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load) => lazy(load);`,
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  "@/components/settings/RecipeEditor": `import { createElement as h } from "react"; export default function RecipeEditor(p) { globalThis.__svc.editor = p; return h("x-Editor", { "data-editor": p.service.id }); }`,
  "@/lib/consumptionApi": "export const consumptionApi = { recipeSummary: () => globalThis.__svc.summary() };",
  "@/lib/sounds": "const n = () => {}; export const isSoundEnabled = () => false, setSoundEnabled = n, playSuccess = n, playTap = n, playWarning = n;",
  "@/lib/services": `
    export class ServicePriceMoved extends Error { constructor(c) { super("service_price_moved"); this.current = c; } }
    export const getServiceCatalog = () => globalThis.__svc.catalog;
    export const removeService = (id) => { globalThis.__svc.removed.push(id); globalThis.__svc.catalog = { ...globalThis.__svc.catalog, services: globalThis.__svc.catalog.services.filter((s) => s.id !== id) }; };
    export const refreshServices = async () => { globalThis.__svc.refreshed++; if (globalThis.__svc.next) globalThis.__svc.catalog = globalThis.__svc.next; return globalThis.__svc.catalog; };
    export const addServiceCategory = () => null, addService = () => null, updateService = (...a) => { globalThis.__svc.updates.push(a); };
    export const removeServiceCategory = (id) => { globalThis.__svc.catRemoved.push(id); };
    export const serviceBarcodeTaken = () => false, updateServicePrice = async () => {};`,
  /* مكتبةُ العمليات بعمليتين: «إطفاءُ» واحدةٍ حذفُ خدمتها (ووصفتها معها بالمفتاح الأجنبيّ). */
  "@/lib/surgeryCatalog": `export const SURGERY_CATALOG = [{ key: "k", icon: "", label: "جراحة", items: [{ en: "Spay", name: "تعقيم أنثى" }, { en: "Neuter", name: "تعقيم ذكر" }] }];
    export const isSurgeryCategoryName = (n) => n === "العمليات";`,
};
const REAL = new Set(["react", "@/lib/utils"]);
const svcStubOf = (spec) => {
  if (SVC_STUB[spec] != null) return SVC_STUB[spec];
  const names = [...(settingsImports.get(spec) ?? [])];
  return ['import { createElement } from "react";', ...names.map((k) => {
    if (k === "default") return 'export default "";';
    const v = /^use[A-Z]/.test(k) ? "() => ({})" : /^[A-Z][a-z]/.test(k) ? `(p) => createElement("x-${k}", p, p?.children)` : /^[A-Z_0-9]+$/.test(k) ? "[]" : "() => undefined";
    return `export const ${k} = ${v};`;
  })].join("\n");
};
const fromSettings = (importer) => /[\\/]src[\\/]pages[\\/]Settings\.tsx$/.test(importer ?? "");
let SV = null;
try {
  SV = await build('export { ServiceSettings } from "./src/pages/Settings.tsx";', { ...I18N },
    // ServiceSettings غيرُ مُصدَّر: يُصدَّر هنا عند التحميل، والملفُّ نفسُه لا يُمسّ.
    [[/[\\/]src[\\/]pages[\\/]Settings\.tsx$/, `${SETTINGS}\nexport { ServiceSettings };`]],
    (path, importer) => (fromSettings(importer) && !REAL.has(path) && !path.startsWith("react/") ? svcStubOf(path) : null));
} catch (e) { check("Settings.tsx يُحزم ويُرسم ServiceSettings", false, String(e?.message ?? e).split("\n").slice(0, 4).join(" ")); }

if (SV) await section(null, async () => {
  const CAT = { id: "c1", name: "العمليات" };
  const svcs = [
    { id: "svcA", category_id: "c1", name: "تعقيم قطة", price: 25000, cost: 3000 },
    { id: "svcB", category_id: "c1", name: "خياطة جرح", price: 15000, cost: null },
    { id: "svcC", category_id: "c1", name: "قص أظافر", price: 5000, cost: null },
  ];
  async function settings(o = {}) {
    let resolveSum = null;
    globalThis.__toast = { success() {}, error() {}, warn: (a) => { globalThis.__svc.warned.push(a); }, toast() {} };
    /* window.confirm يُقبل بلا قراءة (CLAUDE.md §٣) — يُعدّ نداؤه فيُفشل الفحصَ إن عاد. */
    globalThis.window.confirm = () => { globalThis.__svc.confirms++; return true; };
    globalThis.__svc = {
      catalog: { categories: o.categories ?? [CAT], services: (o.services ?? svcs).map((x) => ({ ...x })) }, next: o.next ?? null, removed: [], catRemoved: [], confirms: 0, updates: [], refreshed: 0, warned: [], editor: null,
      restricted: !!o.restricted, can: (c) => (o.can ? o.can(c) : true), sums: 0,
      summary: () => {
        globalThis.__svc.sums++;
        if (o.hold) return new Promise((r) => { resolveSum = r; });
        const f = typeof o.sumFail === "function" ? o.sumFail(globalThis.__svc.sums) : o.sumFail;
        return f ? Promise.reject(f) : Promise.resolve(o.summary ?? {});
      },
    };
    const ui = SV.mount(SV.React.createElement(SV.ServiceSettings));
    await flush();
    const chip = (id) => textOf(ui.find("data-svcrcp", id));
    const costLabel = (id) => textOf(ui.find("data-svccost", id)?.parent);
    const press = async (attr, value) => { ui.click(ui.find(attr, value)); await flush(); };
    return { ui, chip, costLabel, press, release: async (v) => { resolveSum?.(v); await flush(); }, done: () => ui.unmount() };
  }
  const SUM = { svcA: { lines: 4, cost: 3000, broken: 0 }, svcB: { lines: 2, cost: 500, broken: 1 } };

  let s = await settings({ hold: true });
  check("الملخّصُ يُطلب مرّةً عند فتح القسم", globalThis.__svc.sums === 1, J(globalThis.__svc.sums));
  check("وهو يُحمَّل: «مستهلكات» بلا أرقام على كلّ شريحة (لا صفر)", ["svcA", "svcB", "svcC"].every((id) => s.chip(id) === "⟦pos.cat.consumables⟧مستهلكات"), J(["svcA", "svcB", "svcC"].map(s.chip)));
  await s.press("data-svcdel", "svcC");
  check("  وحذفٌ والملخّصُ لم يصل ⇒ يُسأل («ما نعرف» ليست «ما إلها»)", globalThis.__svc.removed.length === 0 && !!s.ui.find("data-svcdel-ask", "svcC") && s.ui.text().includes("⟦services.rcp.delAskUnknown⟧"));
  await s.release(SUM);
  check("وصل: «مستهلكات (٤) · ٣٬٠٠٠» و«+ مستهلكات» لما بلا وصفة", s.chip("svcA") === "⟦services.rcp.chipCost⟧مستهلكات (4) · 3,000 د.ع" && s.chip("svcC") === "⟦services.rcp.chipAdd⟧+ مستهلكات", J([s.chip("svcA"), s.chip("svcC")]));
  check("  وسطرٌ لا يُخصم ⇒ علامةُ تنبيهٍ على شريحته وحدها", String(s.ui.find("data-svcrcp", "svcB")?.props.title).startsWith("⟦services.rcp.chipBroken⟧1 ") && s.ui.find("data-svcrcp", "svcA")?.props.title === undefined);
  check("  و«كلفة غير المواد» لما له وصفة، و«كلفة» لغيره", s.costLabel("svcA").includes("⟦services.rcp.costOther⟧كلفة غير المواد") && s.costLabel("svcC").includes("⟦services.costShort⟧كلفة"), J([s.costLabel("svcA"), s.costLabel("svcC")]));
  /* بجانب زرّ الحذف أكلت الشريحةُ عمودَ الاسم (min-w-0 flex-1): مقيسٌ بالمتصفّح بعرض ١٠٢٤ — الاسمُ ٤٤px بـ«+ مستهلكات»
   * وصفرٌ بـ«مستهلكات (٤) · ٣٬٠٠٠ د.ع». فمكانُها تحت الاسم بعموده، لا خليّةٌ بالصفّ تزاحم الحقول. */
  const chipNode = s.ui.find("data-svcrcp", "svcA");
  check("  والشريحةُ تحت اسم الخدمة بعموده — لا خليّةٌ بالصفّ تأكل الاسم", !!chipNode && textOf(chipNode.parent).startsWith("تعقيم قطة")
    && !within(chipNode.parent, "data-svccost") && !within(chipNode.parent, "data-svcdel"), textOf(chipNode?.parent).slice(0, 80));
  s.done();

  s = await settings({ summary: SUM, can: (c) => c !== "viewProfits" });
  check("بلا viewProfits: العددُ بلا مال", s.chip("svcA") === "⟦services.rcp.chip⟧مستهلكات (4)", s.chip("svcA"));
  s.done();
  s = await settings({ summary: SUM, restricted: true });
  check("  والجهازُ المقفول (restricted) كذلك", s.chip("svcA") === "⟦services.rcp.chip⟧مستهلكات (4)", s.chip("svcA"));
  s.done();

  s = await settings({ sumFail: (n) => (n === 1 ? new TypeError("Failed to fetch") : null), summary: SUM });
  check("فشلُ الملخّص ⇒ «مستهلكات (؟)» على كلّ شريحة وسطرُ إعادةٍ واحد", ["svcA", "svcB", "svcC"].every((id) => s.chip(id) === "⟦services.rcp.chipUnknown⟧مستهلكات (؟)") && s.ui.findAll("data-svcrcp-failed").length === 1, J(["svcA", "svcC"].map(s.chip)));
  check("  ولا «كلفة غير المواد» عن مجهول", s.costLabel("svcA").includes("⟦services.costShort⟧") && !s.costLabel("svcA").includes("costOther"));
  await s.press("data-svcrcp-retry");
  check("  و«إعادة المحاولة» تطلبه فتظهر الأرقام", globalThis.__svc.sums === 2 && s.chip("svcA").includes("مستهلكات (4)") && !s.ui.find("data-svcrcp-failed"), J({ sums: globalThis.__svc.sums, a: s.chip("svcA") }));
  s.done();

  s = await settings({ summary: SUM });
  await s.press("data-svcdel", "svcC");
  check("خدمةٌ بلا وصفة تُحذف كما كانت (ضغطةٌ واحدة)", J(globalThis.__svc.removed) === J(["svcC"]) && !s.ui.find("data-svcdel-ask"));
  await s.press("data-svcdel", "svcA");
  const ask = s.ui.find("data-svcdel-ask", "svcA");
  check('وخدمةٌ لها وصفة ⇒ «تحذف "تعقيم قطة" ووصفتها (٤ مواد)؟ الفواتير القديمة ما تتأثر» ولا حذف بعد', J(globalThis.__svc.removed) === J(["svcC"]) && !!ask
    && textOf(ask).includes('⟦services.rcp.delAsk⟧تحذف "تعقيم قطة" ووصفتها (4 مواد)؟ الفواتير القديمة ما تتأثر'), textOf(ask));
  await s.press("data-svcdel-yes");
  check("  والضغطةُ الثانية تحذف", J(globalThis.__svc.removed) === J(["svcC", "svcA"]) && !s.ui.find("data-svcdel-ask"));
  s.done();

  s = await settings({ summary: SUM, can: (c) => c !== "manageSettings" });
  await s.press("data-svcrcp", "svcA");
  const ed = globalThis.__svc.editor;
  check("الشريحةُ تفتح المحرّر بخدمتها، وcanEdit من manageSettings وshowCost من الأرباح وقفل الجهاز", !!s.ui.find("data-editor", "svcA") && ed?.service.id === "svcA" && ed.service.name === "تعقيم قطة"
    && ed.service.price === 25000 && ed.canEdit === false && ed.showCost === true && ed.open === true, J(ed && { id: ed.service.id, canEdit: ed.canEdit, showCost: ed.showCost }));
  s.done();

  const cleared = { categories: [CAT], services: svcs.map((x) => (x.id === "svcA" ? { ...x, cost: null } : { ...x })) };
  s = await settings({ summary: SUM, next: cleared });
  await s.press("data-svcrcp", "svcA");
  const costNode = s.ui.find("data-svccost", "svcA");
  const costBefore = costNode?.props.defaultValue;
  globalThis.__svc.editor.onSaved({ lines: 4, clearedFlat: false }); await flush();
  check("حفظٌ بلا تصفير ⇒ الملخّصُ يُعاد ولا تُقرأ الخدمات", globalThis.__svc.sums === 2 && globalThis.__svc.refreshed === 0 && s.ui.find("data-svccost", "svcA") === costNode,
    J({ sums: globalThis.__svc.sums, refreshed: globalThis.__svc.refreshed }));
  globalThis.__svc.editor.onSaved({ lines: 4, clearedFlat: true }); await flush();
  /* الحقلُ يأخذ قيمتَه مرّةً (defaultValue): بالمتصفّح لا يرى القيمةَ الجديدة إلا إن أُعيد بناؤه — فالمفحوصُ
   * أنه عقدةٌ جديدة (المفتاحُ بالكلفة)، لا خاصّيتُها وحدها (المضيفُ هنا يحدّثها بمكانها). */
  const costAfter = s.ui.find("data-svccost", "svcA");
  check("  وحفظٌ صفّر الكلفة ⇒ refreshServices، وحقلُ الكلفة يُبنى من جديد فارغاً (لا يبقى ٣٬٠٠٠ فيُكتب فوق التصفير)",
    globalThis.__svc.refreshed === 1 && globalThis.__svc.sums === 3 && costBefore === 3000 && !!costAfter && costAfter !== costNode && costAfter.props.defaultValue === "",
    J({ refreshed: globalThis.__svc.refreshed, sums: globalThis.__svc.sums, before: costBefore, after: costAfter?.props.defaultValue, same: costAfter === costNode }));
  globalThis.__svc.editor.onClose(); await flush();
  check("  والإغلاقُ يفكّ المحرّر", !s.ui.find("data-editor"));
  s.done();

  /* ── طريقا حذفٍ آخران يُسقطان الوصفة (التدقيق) ──────────────────────────────
   * إطفاءُ عمليةٍ بمكتبة العمليات = removeService بلمسة، وحذفُ التصنيف يأخذ خدماتِه — والوصفةُ تتبعهما بالمفتاح
   * الأجنبيّ. الأوّلُ كان بلا أيّ سؤال، والثاني بـwindow.confirm لا يذكر الوصفات. */
  const surg = [...svcs,
    { id: "svcS", category_id: "c1", name: "تعقيم أنثى", price: 100000, cost: null, surgery_ref: "Spay" },
    { id: "svcN", category_id: "c1", name: "تعقيم ذكر", price: 75000, cost: null, surgery_ref: "Neuter" }];
  const openLib = async (st) => {
    const b = st.ui.findAll("className").find((n) => n.type === "button" && textOf(n).includes("مكتبة العمليات الجاهزة"));
    st.ui.click(b); await flush();
  };
  const flip = async (st, name) => { st.ui.click(st.ui.find("aria-label", name)); await flush(); };
  await section("▸ ك٢) التدقيق: إطفاءُ عمليةٍ لها وصفة بمكتبة العمليات", async () => {
  let s = await settings({ services: surg, summary: { ...SUM, svcS: { lines: 3, cost: 9000, broken: 0 } } });
  await openLib(s);
  await flip(s, "تعقيم أنثى");
  check('إطفاءُ عمليةٍ لها وصفة بمكتبة العمليات لا يحذفها بلمسة — «تحذف "تعقيم أنثى" ووصفتها (٣ مواد)؟»',
    J(globalThis.__svc.removed) === "[]" && s.ui.text().includes('⟦services.rcp.delAsk⟧تحذف "تعقيم أنثى" ووصفتها (3 مواد)؟ الفواتير القديمة ما تتأثر'), J(globalThis.__svc.removed));
  await s.press("data-svcdel-yes");
  check("  والضغطةُ الثانية تحذفها", J(globalThis.__svc.removed) === J(["svcS"]) && !s.ui.find("data-svcdel-ask", "svcS"), J(globalThis.__svc.removed));
  await flip(s, "تعقيم ذكر");
  check("  وعمليةٌ بلا وصفة تنطفئ بلمسة كما كانت", J(globalThis.__svc.removed) === J(["svcS", "svcN"]));
  s.done();
  s = await settings({ services: surg, hold: true });
  await openLib(s);
  await flip(s, "تعقيم ذكر");
  check("  والملخّصُ لم يصل ⇒ يُسأل («ما نعرف» ليست «ما إلها»)", J(globalThis.__svc.removed) === "[]" && s.ui.text().includes("⟦services.rcp.delAskUnknown⟧"));
  s.done();
  });

  await section("▸ ك٣) التدقيق: حذفُ التصنيف بلا window.confirm ويقول الوصفات", async () => {
  let s = await settings({ summary: SUM });
  s.ui.click(s.ui.find("aria-label", "⟦common.delete⟧Delete")); await flush();   // أوّلُ «حذف» بالشجرة: رأسُ التصنيف
  check("حذفُ تصنيفٍ بخدماتٍ لها وصفات: لا window.confirm — جملةٌ بالشاشة تقول إن وصفات خدمتين تنحذف وياه",
    globalThis.__svc.confirms === 0 && globalThis.__svc.catRemoved.length === 0 && !!s.ui.find("data-svccat-ask", "c1")
    && textOf(s.ui.find("data-svccat-ask", "c1")).includes("⟦services.rcp.delCatRecipes⟧وتنحذف وياه وصفات المستهلكات لـ2 من خدماته. الفواتير القديمة ما تتأثر"),
    J({ confirms: globalThis.__svc.confirms, removed: globalThis.__svc.catRemoved, ask: textOf(s.ui.find("data-svccat-ask", "c1")) }));
  await s.press("data-svccat-yes");
  check("  والضغطةُ الثانية تحذفه", J(globalThis.__svc.catRemoved) === J(["c1"]) && globalThis.__svc.confirms === 0);
  s.done();
  s = await settings({ summary: SUM, categories: [{ id: "c2", name: "الأظافر" }], services: [{ ...svcs[2], category_id: "c2" }] });
  await s.press("data-svccat-del", "c2");
  check("  وتصنيفٌ بلا وصفات ⇒ جملةُ الحذف وحدها، بلا كلامٍ عن وصفات", !!s.ui.find("data-svccat-ask", "c2") && s.ui.text().includes("⟦services.confirmDelCat⟧")
    && !s.ui.text().includes("⟦services.rcp.delCat") && globalThis.__svc.catRemoved.length === 0);
  s.done();
  s = await settings({ sumFail: () => new TypeError("Failed to fetch") });
  s.ui.click(s.ui.find("aria-label", "⟦common.delete⟧Delete")); await flush();
  check("  وملخّصٌ فشل ⇒ «إذا بيها خدمات إلها وصفة… تنحذف وياها» (لا سكوت عن مجهول)",
    globalThis.__svc.catRemoved.length === 0 && s.ui.text().includes("⟦services.rcp.delCatUnknown⟧"));
  s.done();
  });

  await section("▸ ك٤) التدقيق: سؤالُ حذف الخدمة تحت صفّها — لا بعد القائمة كلّها", async () => {
  /* الجملةُ كانت تُرسم بعد services.map: بتصنيفٍ من ١٢ خدمة وقعت ٦٩٠–٨٦٦px تحت أوّل صفّ (مقيسٌ بمتصفّحٍ بحاسوبٍ وهاتف)
   * — خارجَ الشاشة، وما على الشاشة لا يتغيّر بعد الضغطة: زرُّ الحذف يبدو ميّتاً. ومكتبةُ العمليات تضعها تحت صفّها.
   * فالسؤالُ الأخُ التالي لصفّه بالقائمة، ويطلب أن يُرى («nearest»: لا يحرّك ما هو ظاهرٌ كلُّه) — صفٌّ بحافّة الشاشة. */
  const many = Array.from({ length: 12 }, (_v, i) => ({ id: `m${String(i + 1).padStart(2, "0")}`, category_id: "c1", name: `عملية ${i + 1}`, price: 50000 + i, cost: null }));
  const sum = Object.fromEntries(many.map((x, i) => [x.id, { lines: 2 + (i % 3), cost: 1000, broken: 0 }]));
  /* الطلبُ أن يُرى: scrollIntoView على عقدة السؤال — العقدةُ هنا كائنٌ بلا DOM، فيُراقَب من النموذج الأوّل ساعةَ الفعل وحده. */
  const watchScroll = async (fn) => {
    const seen = [];
    Object.defineProperty(Object.prototype, "scrollIntoView", { configurable: true, writable: true, enumerable: false,
      value(o) { seen.push([this?.props?.["data-svcdel-ask"] ?? null, J(o)]); } });
    try { await fn(); } finally { delete Object.prototype.scrollIntoView; }
    return seen;
  };
  const tap = (st, id) => watchScroll(async () => { st.ui.click(st.ui.find("data-svcdel", id)); await flush(); });
  const placed = (st, id) => {
    const ask = st.ui.find("data-svcdel-ask", id), row = st.ui.find("data-svcdel", id)?.parent ?? null, sibs = row?.parent?.children ?? [];
    return { ask: !!ask, sameList: !!ask && !!row && ask.parent === row.parent, next: !!ask && !!row && sibs.indexOf(ask) === sibs.indexOf(row) + 1 };
  };
  const OK = J({ ask: true, sameList: true, next: true });
  let s = await settings({ services: many, summary: sum });
  let seen = await tap(s, "m01");
  check("أوّلُ صفٍّ بتصنيفٍ من ١٢ خدمة ⇒ السؤالُ تحته مباشرةً (الأخُ التالي لصفّه)، لا بعد القائمة كلّها — ولا حذف",
    J(placed(s, "m01")) === OK && globalThis.__svc.removed.length === 0 && textOf(s.ui.find("data-svcdel-ask", "m01")).includes('⟦services.rcp.delAsk⟧تحذف "عملية 1" ووصفتها'),
    J({ placed: placed(s, "m01"), removed: globalThis.__svc.removed }));
  check("  ويطلب أن يُرى بأقلّ تمرير (block: nearest) — صفٌّ بحافّة الشاشة لا يُخفي سؤالَه", J(seen) === J([["m01", J({ block: "nearest" })]]), J(seen));
  seen = await tap(s, "m07");
  check("  وضغطُ حذفِ صفٍّ آخر ينقله تحت ذلك الصفّ — سؤالٌ واحدٌ بالشاشة", s.ui.findAll("data-svcdel-ask").length === 1 && J(placed(s, "m07")) === OK
    && J(seen) === J([["m07", J({ block: "nearest" })]]), J({ n: s.ui.findAll("data-svcdel-ask").length, placed: placed(s, "m07"), seen }));
  await s.press("data-svcdel-yes");
  check("  والضغطةُ الثانية تحذف خدمةَ صفّه هو، والسؤالُ يُغلق", J(globalThis.__svc.removed) === J(["m07"]) && s.ui.findAll("data-svcdel-ask").length === 0, J(globalThis.__svc.removed));
  s.done();
  s = await settings({ services: many, hold: true });
  await tap(s, "m12");
  check("  والملخّصُ لم يصل (كلُّ زرٍّ يسأل): آخرُ صفٍّ ⇒ «ما نعرف» تحته هو", J(placed(s, "m12")) === OK && s.ui.text().includes('⟦services.rcp.delAskUnknown⟧تحذف "عملية 12"؟')
    && globalThis.__svc.removed.length === 0, J(placed(s, "m12")));
  /* والتمريرُ عند ظهوره وحده: رسمٌ لاحق (وصولُ الملخّص، وهو يُعاد بعد كلّ حفظ وصفة) لا يجرّ الصفحةَ إليه ثانيةً. */
  seen = await watchScroll(() => s.release(sum));
  check("  ووصولُ الملخّص والسؤالُ مفتوح: الجملةُ تصير بعدد موادّها بمكانها، ولا تمريرَ ثانٍ", J(seen) === "[]" && J(placed(s, "m12")) === OK
    && textOf(s.ui.find("data-svcdel-ask", "m12")).includes('⟦services.rcp.delAsk⟧تحذف "عملية 12" ووصفتها'), J({ seen, placed: placed(s, "m12") }));
  s.done();
  });
});

console.log(fails ? `\n✗ recipe-editor-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ recipe-editor-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
