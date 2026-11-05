/* ============================================================================
 * راجيتةُ العيادة (0261) — بالواجهة: التنظيفُ والباني والأسطرُ والمرآةُ والأسلاك. أمّا الجدولان (التجميد، والإلغاءُ
 * للمدير، والسياج، والقيود) فيفحصها قسمُ 0261 بالحزمة على بوستغريس.
 *   أ) التنظيف (rxLayout): تصميمٌ مكسورٌ أو من نسخةٍ أخرى يُقرأ ولا يُسقط الطباعة — الأرقامُ تُحصر، والألوانُ تُفحص،
 *      والصورُ مساراتٌ (`data:` بالتجريبيّ وحده)، والسقوفُ سقوفُ القيد بالهجرة.
 *   ب) الباني (rxPrint): كلُّ ما يُكتب يُهرَّب (document.write بأصل التطبيق)، والروابطُ https/data:image/blob وحدها،
 *      ولا NaN بالأنماط، والطباعةُ الآليةُ بنافذة الطباعة وحدها، والقالبُ وصورةُ الراجيتة والمعايرةُ كلٌّ بما يخصّه.
 *   ج) الأسطر (rxLines): أحدثُ خطةٍ بأدوية لا أوّلُ ما وصل، والجرعةُ كما حُفظت (لا formatNum)، والإدراجُ لا يكرّر.
 *   د) المرآةُ التجريبية بالمستودع الحقيقيّ: التصميمُ بشرط «كما فُتح»، والراجيتةُ تُختم ولا تولد ملغاة، والإلغاءُ مرّةً
 *      وللمدير، والمصوّرُ مسيَّج، و«القراءة فقط» يمنع الكتابة، والامتلاءُ يُرمى لا يُبلع.
 *   هـ) الأسلاك: الملفّاتُ لا تستورد القطعةَ ثابتاً، والطباعةُ داخل الضغطة قبل أيّ await، ولا autoFocus ولا window.confirm.
 *   و) الحفظُ ونوافذُ الطباعة (rxSave) بسلوكهما: لقطةٌ واحدة لكلّ مسودّة، ونافذتان سجلٌّ واحد، والمحفوظُ مجموعة، والطابورُ يقف
 *      عند أوّل فشل، والنسخةُ الجديدة ممسوكةٌ حتى يستقرّ الحفظ، والرسائلُ تُوزَّع لنافذتها — ورسالةُ الرفض «للمدير» من rxErrorText نفسِها.
 *   ز) سجلُّ الحركات مرسوماً (react-mini) بصفوفٍ كما يكتبها الخادم: الجملُ، وسببُ الإلغاء كاملاً، ولا طبيبَ موقِّعٌ فاعلاً لإلغاءٍ
 *      أو حذف (ولا لحذفٍ بلا فاعل — «النظام») — وطفراتٌ تُثبت أنّ الفحصَ ليس فارغاً.
 *   ح) سكربتا الترتيب والطباعة بسلوكهما على مستندٍ مزيَّف (محرّكُ قياسٍ صغير، ووجوهُ خطٍّ تصل وحدها، وشعارٌ يأخذ من المربّع، وساعةٌ
 *      وأحداثٌ بيد الفحص): الإعادةُ لا تكرّر سطراً ولا تُبقي فائضاً ولا حجماً، والخطوطُ تُطلب مع المستند وتُطبَّق بعده، والطباعةُ تنتظر
 *      الخطوطَ وتقيس من جديد فلا سطرَ مخفيّاً، والفائضُ لا يُطبع، والنافذةُ تُغلق بعدها — وطفراتٌ على السكربت نفسِه.
 *   ط) عناوينُ الورقة والتعافي بسلوكهما: «تعذّر» لا تُمسح بإعادة المحاولة، والتنزيلُ البطيء ليس «تعذّر»، والتحديثُ لا يُحمَّل فوق نصٍّ
 *      كُتب أثناء إلغاء الخدمة — وطفراتٌ على كلٍّ.
 *
 *   node scripts/rx-pad-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (f) => readFileSync(f, "utf8");
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ rx-pad-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);

const mem = new Map();
let quota = Infinity;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    const s = String(v);
    if (s.length > quota) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    mem.set(k, s);
  },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",
      "@/lib/supabase": "export const supabase = null;",
      "./globalToast": "export const emitGlobalToast = () => {};",
      /* rxShared (لـrxErrorText وحدها): قاموسٌ ونطاقٌ لا يُحمَّلان بالفحص. */
      "react-i18next": "export const useTranslation = () => ({ t: (k) => k, i18n: { language: 'ar', getFixedT: () => (k) => k } }); export const initReactI18next = {};",
      "@/i18n": "const i = { t: (k) => k, language: 'ar' }; export default i; export const ensureDictionary = async () => {}; export const ensureOwned = async () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|@\/lib\/supabase|\.\/globalToast|react-i18next|@\/i18n)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: [
      'export * from "./src/lib/repo.ts";',
      'export * as L from "./src/lib/rxLayout.ts";',
      'export * as P from "./src/lib/rxPrint.ts";',
      'export * as X from "./src/lib/rxLines.ts";',
      'export * as A from "./src/lib/rxApi.ts";',
      'export * as S from "./src/lib/rxSave.ts";',
      'export { rxErrorText } from "./src/components/rx/rxShared.ts";',
      'export { encodeClinical } from "./src/lib/clinicalRecord.ts";',
      'export { registerConfigReadOnlyChecker } from "./src/lib/clinicSync.ts";',
      'export * as U from "./src/lib/appUpdate.ts";',
      'export * as F from "./src/lib/inflight.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "rx-pad-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "rx-pad-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { L, P, X, A, S, U, F, rxErrorText, encodeClinical, registerConfigReadOnlyChecker } = mod;
if (!L || !P || !X || !A || !S || !U || !F || !rxErrorText || !registerConfigReadOnlyChecker) { console.error("✗ rx-pad-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.code ?? e.name ?? e.message; } };
/* الرمزُ والرسالةُ معاً: رفضُ السياج العامّ 42501 أيضاً — والشاشةُ تقرأ «للمدير» من الرسالة (rxErrorText). */
const errFull = async (f) => { try { await f(); return "قُبل"; } catch (e) { return `${e.code ?? ""}|${e.message ?? ""}`; } };

/* ── أ) التنظيف ─────────────────────────────────────────────────────────── */
console.log("▸ التنظيف: تصميمٌ مكسور يُقرأ ولا يُسقط الطباعة");
{
  const d = L.cleanRxPad(null);
  check("لا شيء ⇒ الافتراضيّ كاملاً (A5، قالب، عناوين إنكليزية، رقعة، لونُ المطبعة الأوّل)",
    d.paper === "a5" && d.mode === "template" && d.lang === "en" && d.font === "ruqaa" && d.accent === L.RX_ACCENTS[0] && d.doctors.length === 0 && d.v === 1);
  const g = L.cleanRxPad({
    mode: "hologram", paper: "b5", lang: "fr", accent: "red", font: "comic",
    wm: { size: 900, opacity: -4, y: "NaN", gray: "yes", src: "moon" },
    slots: { date: { x: 99, y: -5, w: 50 }, name: { x: "12", y: 30, w: 1000 } },
    body: { x: 70, y: 90, w: 90, h: 90 }, nudge: { x: 100, y: -100 }, fontPt: 99,
    doctors: [1, { name: "  Dr.  Ali  ", lines: "B.V.M.S\nMSc\nPhD\n" }, { name: "" , lines: "" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
    phones: ["0770", "  ", "0771", "0772", "0773"],
    emblemPath: "data:image/png;base64,AAAA", bgPath: "../../etc/passwd",
  });
  check("قيمٌ غريبة ترجع لافتراضها (النوع، الورقة، اللغة، اللون، الخطّ، مصدرُ العلامة)",
    g.mode === "template" && g.paper === "a5" && g.lang === "en" && g.accent === L.RX_ACCENTS[0] && g.font === "ruqaa" && g.wm.src === "logo" && g.wm.gray === true);
  check("والأرقامُ تُحصر بمداها (العلامة ١٥–٩٥ و٢–٣٠، الخطّ ٨–١٨، المعايرة ±١٥ مم، والعرضُ لا يتجاوز حافّة الصفحة)",
    g.wm.size === 95 && g.wm.opacity === 2 && g.wm.y === L.RX_DEFAULT.wm.y && g.fontPt === 18 && g.nudge.x === 15 && g.nudge.y === -15
    && g.slots.date.x === 95 && g.slots.date.y === 0 && g.slots.date.w <= 5 && g.slots.name.x === 12 && g.slots.name.w === 88
    && g.body.x === 70 && g.body.w === 30 && g.body.y === 90 && g.body.h === 10, JSON.stringify({ wm: g.wm, d: g.slots.date, n: g.slots.name, b: g.body }));
  check("الدكاترةُ أربعةٌ على الأكثر، منظَّفون، والفارغُ يسقط، والدرجاتُ سطران",
    g.doctors.length === 4 && g.doctors[0].name === "Dr. Ali" && g.doctors[0].lines === "B.V.M.S\nMSc" && g.doctors[3].name === "D");
  check("والهواتفُ ثلاثة بلا فارغ", g.phones.join(",") === "0770,0771,0772");
  check("والصورُ: data: تسقط بالسحابة، ومسارٌ فيه .. يسقط", g.emblemPath === null && g.bgPath === null);
  const demo = L.cleanRxPad({ emblemPath: "data:image/png;base64,AAAA", bgPath: "data:text/html;base64,PHNjcmlwdD4=" }, { allowData: true });
  check("  وبالتجريبيّ data:image تبقى، وdata:text لا", demo.emblemPath === "data:image/png;base64,AAAA" && demo.bgPath === null);
  check("  ومسارُ الدلو يبقى كما هو", L.cleanRxPad({ bgPath: "11111111-1111-1111-1111-111111111111/rx-bg-lk3.jpg" }).bgPath === "11111111-1111-1111-1111-111111111111/rx-bg-lk3.jpg");
  check("والتنظيفُ ثابت (تنظيفُ النظيف لا يغيّره) — «حفظ» لا يرى تغييراً لم يحصل", L.sameRxPad(L.cleanRxPad(g), g) && L.sameRxPad(L.cleanRxPad(L.RX_DEFAULT), L.RX_DEFAULT));
  const big = L.cleanRxPad({ title: "x".repeat(500), address: "\u202eabc\u0007  def", subtitle: "a\nb" });
  check("والنصوصُ بسطرٍ واحد وبسقفها، بلا محارف تحكّمٍ ولا اتّجاهٍ مقلوب", big.title.length === 60 && big.address === "abc def" && big.subtitle === "a b");
  const f = L.cleanRxFields({ date: "2026-1-5", name: "x".repeat(200), kind: "dragon", owner: 5 });
  check("خاناتُ المريض: تاريخٌ بصيغته وإلا فارغ، والنوعُ من الثلاثة، والنصُّ ٨٠ حرفاً",
    f.date === "" && f.name.length === 80 && f.kind === "" && f.owner === "" && L.cleanRxFields({ date: "2026-11-05", kind: "feline" }).kind === "feline");
  check("النوعُ من الحيوان: كلب وقطّة باسمهما، والطيرُ والأرنبُ وغيرُهما Exotic، والحصانُ والبقرةُ بلا علامة",
    ["dog", "cat", "bird", "rabbit", "other", "horse", "cow", undefined].map(L.rxKindOf).join(",") === "canine,feline,exotic,exotic,exotic,,,");
  check("نصُّ الوصفة: CRLF ⇒ سطر، ومحارفُ التحكّم تسقط، والفراغُ بآخر السطر والأسطرُ الفارغةُ بالطرفين، وسقفُه ٨٠٠٠",
    L.cleanRxBody("\r\n\r\nA  \r\n\u0001B\t\n\n") === "A\nB" && L.cleanRxBody("x".repeat(9000)).length === 8000);
  check("الساعةُ بصيغتها: ١٢ (بكلمتي اللغة) و٢٤، والدوامُ سطرٌ بفترتيه",
    L.clockText("00:30", "12", "am", "pm") === "12:30 am" && L.clockText("14:05", "12", "ص", "م") === "2:05 م" && L.clockText("9:00", "24", "a", "p") === "09:00"
    && L.hoursLine({ am: { from: "10:00", to: "14:00" }, pm: { from: "16:00", to: "00:00" } }, "12", "am", "pm") === "10:00 am – 2:00 pm  ·  4:00 pm – 12:00 am"
    && L.hoursLine({ am: null, pm: null }, "12", "am", "pm") === "");
  check("العمرُ بالإنكليزية", L.ageTextEn({ years: 1, months: 0 }) === "1 year" && L.ageTextEn({ years: 3, months: 4 }) === "3 years 4 months" && L.ageTextEn({ years: 0, months: 0 }) === "Newborn" && L.ageTextEn(null) === "");
  check("  والأيامُ بالإنكليزية لسطر الخطة على الورقة الإنكليزية (بواجهةٍ عربية كان يُدرج «7 أيام»)", L.daysTextEn(1) === "1 day" && L.daysTextEn(7) === "7 days" && L.daysTextEn(2) === "2 days");
  const fx = { date: "2026-11-05", name: "Bobby", owner: "", age: "", weight: "", kind: "canine" };
  check("بصمةُ المسودّة: نفسُ المكتوب بفراغٍ زائد = نفسُها (طباعةٌ ثانية لا تكتب سجلّاً ثانياً)، وتغييرُ حرفٍ يغيّرها",
    L.rxDraftKey(fx, "A\n", "Dr") === L.rxDraftKey({ ...fx }, "A", "Dr") && L.rxDraftKey(fx, "A", "Dr") !== L.rxDraftKey(fx, "B", "Dr"));
  const sql = src("supabase/migrations/0261_rx_pad.sql");
  check("وسقوفُ الواجهة سقوفُ القيد بالهجرة (النصُّ ٨٠٠٠، الأسماءُ ١٢٠، السببُ ٢٠٠، التصميمُ ٢٤٠٠٠ بلا data:)",
    L.RX_LIMITS.body === 8000 && /between 1 and 8000/.test(sql) && /doctor_name, ''\)\) <= 120/.test(sql) && /void_reason, ''\)\) <= 200/.test(sql)
    && /octet_length\(p::text\) <= 24000/.test(sql) && /position\('"data:' in lower\(p::text\)\) = 0/.test(sql));
}

/* ── ب) الباني ─────────────────────────────────────────────────────────── */
console.log("▸ الباني: ما يُكتب يُهرَّب، والروابطُ تُفحص، والطباعةُ الآليةُ بنافذتها وحدها");
const doc = (over = {}) => ({
  cfg: L.cleanRxPad({ doctors: [{ name: "Dr. Ali", lines: "B.V.M.S" }], phones: ["+9647700000000"], address: "Al-Mansour" }),
  clinic: { title: "عيادة اليسار", subtitle: "Veterinary Clinic", logoUrl: "https://x.supabase.co/storage/v1/object/public/product-images/c/logo.png", emblemUrl: null, bgUrl: null, hours: "10:00 am – 2:00 pm", socials: [{ kind: "ig", handle: "@clinic" }] },
  fields: { date: "2026-11-05", name: "Bobby", owner: "Ahmed", age: "2 years", weight: "12 kg", kind: "feline" },
  dateText: "05/11/2026", body: "Amoxicillin 250 mg\n\nمرتين باليوم", doctor: "Dr. Ali", labels: L.RX_LABELS_EN, docTitle: "Rx — Bobby",
  ...over,
});
{
  const evil = `<script>alert(1)</script>"'><img src=x onerror=alert(2)>`;
  const h = P.buildRxHTML(doc({ body: evil, doctor: evil, fields: { ...doc().fields, name: evil, owner: evil }, clinic: { ...doc().clinic, title: evil, subtitle: evil, socials: [{ kind: "fb", handle: evil }] }, docTitle: evil }));
  check("نصُّ الطبيب والخاناتُ والعيادةُ تُهرَّب كلُّها — لا وسمَ يولد من نصّ", !h.includes("<script>alert") && !h.includes("<img src=x") && h.includes("&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&gt;&lt;img src=x onerror=alert(2)&gt;"));
  check("  وما بقي من <script> سكربتا الترتيب (والطباعة بنافذتها) وحدهما", (h.match(/<script>/g) ?? []).length === 1 && (P.buildRxHTML(doc(), { print: true }).match(/<script>/g) ?? []).length === 2);
  check("الروابط: https وdata:image وblob تمرّ، وjavascript: وdata:text لا",
    P.rxSafeUrl("https://a.supabase.co/x.png") !== null && P.rxSafeUrl("data:image/png;base64,AAAA") !== null && P.rxSafeUrl("blob:https://doctorvet.vet/1") !== null
    && P.rxSafeUrl("javascript:alert(1)") === null && P.rxSafeUrl("data:text/html;base64,AAAA") === null && P.rxSafeUrl('https://x.co/a"onerror="x') === null);
  const bad = P.buildRxHTML(doc({ cfg: { ...doc().cfg, accent: "red;}body{display:none", wm: { ...doc().cfg.wm, size: NaN, opacity: Infinity, y: NaN }, fontPt: NaN, nudge: { x: NaN, y: 1e9 } }, clinic: { ...doc().clinic, logoUrl: "javascript:alert(1)" } }));
  check("تصميمٌ لم يمرّ بالتنظيف: لا NaN ولا Infinity بالأنماط، ولونٌ غريب ⇒ الافتراضيّ، ورابطٌ خطِر لا يُكتب",
    !/NaN|Infinity/.test(bad) && !bad.includes("display:none;") && bad.includes("#1f5f55") && !bad.includes("javascript:"));
  const a5 = P.buildRxHTML(doc()), a4 = P.buildRxHTML(doc({ cfg: { ...doc().cfg, paper: "a4" } }));
  check("الورقة: A5 بـ148×210 مم، وA4 بـ210×297، وبلا هوامش", /@page\{size:148mm 210mm;margin:0\}/.test(a5) && /@page\{size:210mm 297mm;margin:0\}/.test(a4));
  check("المعاينةُ لا تطبع نفسها (data-preview بلا window.print)، ونافذةُ الطباعة تطبع وتُغلق بعدها",
    /<html[^>]*data-preview/.test(a5) && !a5.includes("window.print") && P.buildRxHTML(doc(), { print: true }).includes("window.print()") && !/<html[^>]*data-preview/.test(P.buildRxHTML(doc(), { print: true }))
    && P.buildRxHTML(doc(), { print: true }).includes("afterprint"));
  check("القالب: الترويسةُ بالشعار والاسم والدكتور، والتواصلُ بالدوام والهاتف، والعناوينُ بلغتها مهرَّبة",
    a5.includes('class="ttl">عيادة اليسار<') && a5.includes('class="dn">Dr. Ali<') && a5.includes("Clinic Hours:") && a5.includes("+9647700000000") && a5.includes("Patient&#39;s name:") && a5.includes("Al-Mansour"));
  check("  وعلامةُ النوع بمربّع المختار وحده (Feline)", (a5.match(/<i class="bx"><svg class="ck"/g) ?? []).length === 1 && /<i class="bx"><svg class="ck"[^]*?<\/svg><\/i>Feline/.test(a5));
  check("  والوصفةُ سطراً سطراً باتّجاهه، والسطرُ الفارغ يحفظ مكانه، والخطُّ يصغر بحدّه",
    a5.includes('<div class="ln" dir="auto">Amoxicillin 250 mg</div><div class="ln">&nbsp;</div><div class="ln" dir="auto">مرتين باليوم</div>') && /data-max="12\.5" data-min="9\.5"/.test(a5));
  check("  والعلامةُ المائية من الشعار (رمادية) وتسقط بلا مصدر", a5.includes('class="wm"') && a5.includes("filter:grayscale(1)") && !P.buildRxHTML(doc({ cfg: { ...doc().cfg, wm: { ...doc().cfg.wm, src: "none" } } })).includes('class="wm"'));
  check("  والدكتورُ تحت التوقيع، والحساباتُ بالذيل", a5.includes('class="sgn">Dr. Ali<') && a5.includes("@clinic"));
  check("  والشعارُ يمين أو يسار بطلب العيادة (والشعارُ الرسميّ بالجهة الثانية)",
    /cell-l">\s*<\/div>|cell-l"><\/div>/.test(a5) && /cell-r"><div class="brand">/.test(a5) && /cell-l"><div class="brand">/.test(P.buildRxHTML(doc({ cfg: { ...doc().cfg, logoSide: "left" } }))));
  const img = (over) => P.buildRxHTML(doc({ cfg: L.cleanRxPad({ mode: "image", bgPrint: false, nudge: { x: 2, y: -1.5 }, ...over }), clinic: { ...doc().clinic, bgUrl: "https://x.supabase.co/bg.jpg" } }));
  const im = img({}), imPrint = img({ bgPrint: true });
  check("صورةُ الراجيتة: الصورةُ خلفيةٌ والخاناتُ فوقها بمواضعها، وعلامةُ النوع المختار وحده",
    im.includes('<img class="bg" src="https://x.supabase.co/bg.jpg"') && /data-slot="name" style="left:8%;top:27.5%;width:48%">Bobby</.test(im)
    && (im.match(/data-tick=/g) ?? []).length === 1 && im.includes('data-tick="feline"') && !im.includes('data-slot="owner"'));
  check("  وفوق الراجيتة المطبوعة: الصورةُ لا تُطبع والمعايرةُ تزحزح الطبقة بالمليمتر", im.includes("@media print{.bg{display:none}}") && im.includes("translate(2mm,-1.5mm)"));
  check("  وعلى ورقٍ أبيض: الصورةُ تُطبع ولا زحزحة", !imPrint.includes("@media print{.bg{display:none}}") && !imPrint.includes("translate(2mm"));
  const cal = P.buildRxHTML(doc({ cfg: L.cleanRxPad({ mode: "image", bgPrint: true }), clinic: { ...doc().clinic, bgUrl: "https://x.supabase.co/bg.jpg" } }), { print: true, calibrate: true });
  check("  وصفحةُ المعايرة: الإطاراتُ متقطّعة والصورةُ لا تُطبع، وعلاماتُ الأنواع الثلاثة كلُّها", cal.includes('class="page cal"') && cal.includes(".cal .bg{display:none}") && (cal.match(/data-tick=/g) ?? []).length === 3);
  check("سكربتُ الترتيب: يصغّر حتى حدّه ثم صفحةٌ ثانية بترويستها ويقسم السطرَ عند كلمة، ويقول ما لم ينقسم",
    a5.includes("data-overflow") && a5.includes("cloneNode(true)") && a5.includes("split(/(\\s+)/)") && a5.includes("data-pages") && a5.includes("f.ready"));
  /* ── ما أمسكته المراجعةُ العدائيّة (٥/١١) ── */
  check("الترتيبُ يُعاد لا يُختم مرّةً: يشيل المستنسخات ويرجّع الأسطرَ كما كُتبت (فرعُ الإرجاع نفسُه — بلاه يضيع ما نُقل لصفحةٍ شيلت)، ويُعاد حين يصل خطّ، ويقول نهائيٌّ أم مؤقّت",
    a5.includes("window.__rxLayout=run") && a5.includes("if(pristine===null)pristine=b.innerHTML;else b.innerHTML=pristine;") && a5.includes("removeChild(all[i])") && a5.includes("'loadingdone'") && a5.includes("data-final"));
  check("  والنهائيُّ بعد الصور والخطوط بالاسم (data-faces → document.fonts.load)، والمؤقّتُ بعد ٤ ثوانٍ، والنهائيُّ قسراً بعد ٩",
    a5.includes("f.load(x)") && /data-faces="[^"]*Aref Ruqaa[^"]*Cormorant Garamond/.test(a5) && a5.includes("},4000)") && a5.includes("},9000)")
    && /data-faces="\[&quot;400 12px Cairo&quot;,&quot;600 12px Cairo&quot;\]"/.test(img({})));
  const fontsHref = /<html[^>]* data-fonts="(https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]*&amp;display=swap)"/.exec(a5)?.[1];
  check("  وورقةُ الخطوط ليست ورقةً بالمستند (معلَّقةً كانت تحجب التحميلَ فلا تسمع المعاينةُ قياسَها ولا تطبع النافذة): تُطلب preload بنفس العنوان (لا يحجب — مقيس) وتختم وصولَها قبل السكربت، وتُضاف ورقةً بعد التحميل",
    !/<link[^>]*rel="stylesheet"/.test(a5) && !a5.includes('id="rxf"') && !!fontsHref
    && a5.includes(`<link rel="preload" as="style" id="rxpre" href="${fontsHref}" onload="this.setAttribute('data-ok','1')" onerror="this.setAttribute('data-ok','0')">`)
    && a5.indexOf('id="rxpre"') < a5.indexOf("<script>") && a5.includes("lk.href=h;document.head.appendChild(lk);"));
  check("  والنهائيُّ القسريّ لا يُغلق الباب (لا loaded=css=true) — وسلوكُه كلُّه بالقسم ح على مستندٍ مزيَّف",
    !a5.includes("loaded=true;css=true") && a5.includes("function onCss(){if(css)return;css=true;if(!forced)settle();}"));
  check("  والمعاينةُ تبلّغ كلَّ ترتيب لإطارها الأب برسالةٍ برقم مستندها (لا بحدث التحميل الذي تحجبه صورةٌ معلَّقة)، ونافذةُ الطباعة لا ترسلها",
    a5.includes("if(window.parent!==window){try{window.parent.postMessage({rxLayout:{seq:root.getAttribute('data-rxseq')") && a5.includes("final:root.getAttribute('data-final')==='1'}},'*')"));
  check("رقمُ الصفحة: سطرُه **وعرضُه** محجوزان قبل القياس (&#8203;، ارتفاعٌ ثابت، ٧ch لا يُلفّ ولا ينكمش) — كتابتُه بعد الترتيب لا تكبّر التذييل (سطراً، أو بلفّ سطر الحسابات)",
    a5.includes('<span class="pno">&#8203;</span>') && /\.pno\{[^}]*line-height:1\.3;min-height:1\.3em/.test(a5) && /\.ft\{[^}]*line-height:1\.3/.test(a5)
    && /\.ft \.pno\{display:inline-block;flex:none;white-space:nowrap;min-width:7ch;/.test(a5));
  check("  والفائضُ يُفحص على **كلّ** صفحة بعد الترقيم (لا الأخيرة وحدها)", a5.includes("number(ps);") && a5.includes("for(i=0;i<ps.length;i++){var pb=L(ps[i]);if(pb&&over(pb))overflow=true;}"));
  check("  وصورةُ الراجيتة ترقّم صفحاتها أيضاً — تحت مربّع الوصفة بالطبقة نفسِها (فالمعايرةُ تزحزحه معها)",
    /<div class="pno pi" style="left:[\d.]+%;top:[\d.]+%;width:[\d.]+%">&#8203;<\/div>\s*<\/div>/.test(im) && /\.pi\{position:absolute/.test(im));
  const pr = P.buildRxHTML(doc({ overflowNote: "ما انطبعت <b>" }), { print: true });
  check("نافذةُ الطباعة حَكَم: تطبع بعد ترتيبٍ نهائيّ وحده، ولا تطبع ما فيه فائض — تُظهر الشريطَ وتبلّغ من فتحها (وسلوكُها بقسم ح)",
    pr.includes("data-final')!=='1')return") && pr.includes("function refuse(){var w=document.getElementById('rxwarn');if(w)w.hidden=false;tell('overflow');}")
    && /if\(!measure\(\)\)\{refuse\(\);return;\}tell\('print'\);setTimeout\(function\(\)\{if\(!measure\(\)\)\{refuse\(\);return;\}window\.focus\(\);window\.print\(\);\},150\);/.test(pr)
    && pr.includes("window.opener.postMessage({rx:t},'*')"));
  check("  وتنتظر التحميلَ **بحدثه** ثلاثَ ثوانٍ بعد نهائيٍّ قسريّ (صورةٌ تصل فيها تُعيد الترتيبَ قبل الحكم)، لا بـreadyState (complete بعد ١٠ م.ث بنافذة document.write)",
    pr.includes("window.addEventListener('load',function(){loaded=true;if(armed)setTimeout(fire,0);});") && pr.includes("if(loaded){fire();return;}setTimeout(fire,3000);")
    && !/readyState==='complete'\)\{?fire/.test(pr.slice(pr.indexOf("var done=false,armed=false"))));
  check("  والشريطُ نصُّ المستدعي مهرَّباً، مخفيٌّ حتى يلزم، ولا يُطبع — ولا يظهر بالمعاينة",
    pr.includes('<div id="rxwarn" class="rxwarn" role="alert" hidden>ما انطبعت &lt;b&gt;</div>') && pr.includes("@media print{.rxwarn{display:none!important}}")
    && !P.buildRxHTML(doc({ overflowNote: "x" })).includes('id="rxwarn"'));
  const arPad = P.buildRxHTML(doc({ cfg: { ...doc().cfg, lang: "ar" }, clinic: { ...doc().clinic, hours: "10:00 ص – 2:00 م" } }));
  check("الدوامُ باتّجاه نصّه (<bdi> بلا dir): «10:00 ص – 2:00 م» بعزلٍ يساريّ كان ينقلب — والهواتفُ وحدها يسار",
    arPad.includes("<bdi>10:00 ص – 2:00 م</bdi>") && !/<bdi dir="ltr">10:00/.test(arPad) && arPad.includes('<bdi dir="ltr">+9647700000000</bdi>'));
  check("وآخرُ صفحة بلا فاصل صفحةٍ بعدها (last-of-type: السكربتان بعد الصفحات)", a5.includes(".page:last-of-type{") && !a5.includes(".page:last-child"));
}

/* ── ج) الأسطر ─────────────────────────────────────────────────────────── */
console.log("▸ «من خطة العلاج»: أحدثُ خطةٍ بأدوية، والجرعةُ كما حُفظت");
{
  /* بالعلامة الحقيقية (encodeClinical: \x01CLINRX1\x01) — قالبٌ يكتب «CLINRX1» بيده كان سيُخفي أنّ البابَ لا يطابق أيَّ خطة. */
  const note = (rec, at) => ({ note_text: encodeClinical({ v: 1, ...rec }, "human"), created_at: at });
  const notes = [
    note({ kind: "intake", treatment: [{ name: "Intake", freq: "x", days: 1, doses: 1 }] }, "2026-11-05T10:00:00Z"),
    note({ treatment: [] }, "2026-11-04T10:00:00Z"),
    note({ treatment: [{ name: "Old", freq: "x", days: 3, doses: 3 }] }, "2026-10-01T10:00:00Z"),
    note({ treatment: [{ name: "Amoxicillin", dose: "0.06 ml", freq: "مرتين يومياً", days: 7, doses: 14, note: "IM · بعد الأكل" }, { name: "  ", freq: "", days: 0, doses: 0 }] }, "2026-11-03T10:00:00Z"),
    { note_text: "ملاحظة عادية", created_at: "2026-11-06T10:00:00Z" },
  ];
  const p = X.latestPlan(notes);
  check("أحدثُ خطةٍ بأدوية — لا «معلومات الدخول» ولا خطةٌ بلا دواء ولا أقدم، والترتيبُ لا يهمّ",
    p && p.at === "2026-11-03T10:00:00Z" && p.items.length === 1 && X.latestPlan([...notes].reverse()).at === p.at);
  check("  وبلا خطة ⇒ null (بعد قراءةٍ نجحت وحدها تعني «ماكو»)", X.latestPlan([notes[0], notes[1], notes[4]]) === null && X.latestPlan([]) === null);
  const line = X.planLine(p.items[0], (n) => `${n} أيام`);
  check("سطرُ الدواء: الاسمُ والجرعةُ كما حُفظت (0.06 لا 0) — التكرارُ · الأيامُ · الملاحظة", line === "Amoxicillin 0.06 ml — مرتين يومياً · 7 أيام · IM · بعد الأكل", line);
  check("  وبلا تعليمات: الاسمُ وحده", X.planLine({ name: "Vit B", freq: "", days: 0, doses: 0 }, () => "") === "Vit B");
  check("الإدراجُ بآخر النصّ ولا يكرّر سطراً موجوداً", X.appendLines("A\nB  ", ["B", " C ", ""]) === "A\nB\nC" && X.appendLines("", ["A"]) === "A" && X.appendLines("A", ["A"]) === "A");
  check("المنتقي: الدواءُ «بالنصّ» بسطرٍ يبدأ باسمه، والشيلُ للسطر كما أُدرج وحده (سطرٌ عليه جرعة يبقى)",
    X.hasDrugLine("Amoxicillin 250 mg\nX", "amoxicillin") && !X.hasDrugLine("Amoxicillinum", "Amoxicillin")
    && X.removeDrugLine("Amoxicillin\nAmoxicillin 250 mg", "Amoxicillin") === "Amoxicillin 250 mg");
  const old = "Metronidazole 250 mg\n1×1 لمدة 5 أيام\n\nVitamin B complex\n1×1 لمدة 5 أيام";
  check("«أضفها هنا» تنسخ نصَّها كما هو بعد سطرٍ فارغ — سطرُ الجرعة المكرّر لا يسقط (كان يُحذف بصمت)",
    X.appendBlock("Ceftriaxone 1 g IM\n1×1 لمدة 5 أيام\n", old) === `Ceftriaxone 1 g IM\n1×1 لمدة 5 أيام\n\n${old}`
    && X.appendBlock("", `\n\n   1×2\n${old}\n\n`) === `   1×2\n${old}` && X.appendBlock("A", "  \n ") === "A");
  const T = ["د", "دكتور", "دكتورة", "الدكتور", "الدكتورة", "dr", "doctor"];
  const pick = (me, names) => X.pickDoctor(me, names, T);
  check("الدكتورُ الموقّع بكلماتٍ كاملة: «حسن» ليس «محسن»، و«حسن علي» ليس «محسن علي»، و«علي» ليس «عليا»",
    pick("حسن", ["د. محسن جواد", "د. حسن علي"]) === "د. حسن علي" && pick("حسن علي", ["د. محسن علي", "د. حسن علي"]) === "د. حسن علي"
    && pick("علي", ["د. عليا كريم", "د. علي حسن"]) === "د. علي حسن");
  check("  واثنان طابقا ⇒ لا تخمين («علي» بـ«علي حسن» و«علي كاظم»)، وبلا مطابقة الوحيدُ وإلا لا أحد",
    pick("علي", ["د. علي حسن", "د. علي كاظم"]) === "" && pick("زيد", ["د. علي"]) === "د. علي" && pick("زيد", ["د. علي", "د. حسن"]) === "" && pick("", ["د. علي"]) === "د. علي");
  check("  والكلماتُ بترتيبها من أوّل الاسم: «علي» ليس «عباس علي» (علي اسمُ أبيه)، و«علي حسن» ليس «حسن علي» (ابنُه غالباً)",
    pick("علي", ["د. عباس علي", "د. علي كاظم"]) === "د. علي كاظم" && pick("علي", ["د. عباس علي", "د. زينب كاظم"]) === ""
    && pick("علي حسن", ["د. حسن علي", "د. زينب كاظم"]) === "" && pick("علي حسن كاظم", ["د. علي حسن", "د. زينب"]) === "د. علي حسن");
  check("  والألقابُ لا تُعدّ كلمة، والهمزةُ والتشكيلُ والحالةُ مطويّة",
    pick("علي حسن", ["دكتور علي", "د. زيد"]) === "دكتور علي" && pick("Ali Hassan", ["Dr. Ali", "Dr. Omar"]) === "Dr. Ali"
    && pick("احمد", ["د. أحمد كريم", "د. زينب"]) === "د. أحمد كريم" && pick("عَلِيّ", ["د. علي"]) === "د. علي" && pick("ZAINAB", ["Dr. Zainab Kareem", "Dr. Ali"]) === "Dr. Zainab Kareem");
}

/* ── د) المرآة ─────────────────────────────────────────────────────────── */
console.log("▸ المرآةُ التجريبية: التصميمُ بشرط «كما فُتح»، والراجيتةُ تُختم، والإلغاءُ للمدير، والسياج");
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: ["clinic"], clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: "clinic",
}));
{
  const api = A.rxApi;
  as("m1", "admin");
  check("لا تصميمَ محفوظ ⇒ null (الافتراضيّ)", (await api.getPad()) === null);
  const s1 = await api.savePad({ ...L.cleanRxPad({ doctors: [{ name: "Dr. Ali", lines: "" }] }), emblemPath: "data:image/png;base64,AAAA" }, null);
  check("أوّلُ حفظ يُختم، والصورةُ data: تبقى بالتجريبيّ", !!s1.updated_at && s1.cfg.doctors[0].name === "Dr. Ali" && s1.cfg.emblemPath === "data:image/png;base64,AAAA");
  check("  وإدخالٌ ثانٍ كأنه الأوّل ⇒ rx_stale (جهازٌ ثانٍ حفظ قبله)", await errOf(() => api.savePad(L.cleanRxPad({}), null)) === "rx_stale");
  const s2 = await api.savePad({ ...s1.cfg, paper: "a4" }, s1.updated_at);
  check("التعديلُ بشرط «كما فُتح» يمرّ ويختم من جديد", s2.cfg.paper === "a4" && s2.updated_at !== s1.updated_at && (await api.getPad()).cfg.paper === "a4");
  check("  وبنسخةٍ قديمة rx_stale — لا دوسٌ صامت", await errOf(() => api.savePad({ ...s1.cfg, paper: "a5" }, s1.updated_at)) === "rx_stale" && (await api.getPad()).cfg.paper === "a4");

  as("v1", "doctor");
  const pet = "pet-rx-1";
  const r1 = await api.add({ pet_id: pet, pet_name: "Bobby", doctor_name: "Dr. Ali", fields: { date: "2026-11-05", name: "Bobby", owner: "", age: "", weight: "", kind: "canine" }, body: "  Amoxicillin\r\n" });
  check("الطبيبُ يكتب راجيتة: تُختم بالكاتب واللحظة، وليست ملغاة، والنصُّ منظَّف", r1.author_id === "v1" && !!r1.issued_at && r1.voided_at === null && r1.body === "  Amoxicillin");
  check("  وتظهر بسجلّ الحيوان (الأحدثُ أوّلاً)، ولا تظهر لحيوانٍ آخر", (await api.listForPet(pet)).length === 1 && (await api.listForPet("other")).length === 0);
  check("  ونصٌّ فارغٌ (فراغات) يُرفض 23514 كالقيد", await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "  \n  " })) === "23514");
  check("الإلغاءُ للمدير: الطبيبُ يُرفض برمزه ورسالته (42501|rx_void_manager — الشاشةُ تقول «للمدير» من الرسالة)",
    await errFull(() => api.voidRx(r1.id, "غلط")) === "42501|rx_void_manager" && (await api.listForPet(pet))[0].voided_at === null);
  const cid = "0b0c0d0e-1111-4222-8333-944455556666";
  const k1 = await api.add({ id: cid, pet_id: pet, pet_name: "Bobby", doctor_name: "", fields: {}, body: "Ceftriaxone" });
  const k2 = await api.add({ id: cid, pet_id: pet, pet_name: "Bobby", doctor_name: "", fields: {}, body: "Ceftriaxone" });
  check("ومعرّفُ الجهاز يُحفظ، وإعادةُ الحفظ بنفسه (ردٌّ ضاع) ترجعها نفسَها — لا صفٌّ ثانٍ لورقةٍ واحدة",
    k1.id === cid && k2.id === cid && (await api.listForPet(pet)).filter((x) => x.id === cid).length === 1 && (await api.listForPet(pet)).length === 2);
  check("  ومعرّفٌ ليس uuid لا يُرسل (الخادمُ يختار)", !("id" in A.rxInsertRow({ id: "rx_123", pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) && A.rxInsertRow({ id: cid.toUpperCase(), pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" }).id === cid);
  as("m1", "admin");
  const v = await api.voidRx(r1.id, "  كُتبت لحيوانٍ ثانٍ  ");
  check("  والمديرُ يلغيها مرّةً — والسببُ منظّف", !!v.voided_at && v.void_reason === "كُتبت لحيوانٍ ثانٍ" && (await api.listForPet(pet)).find((x) => x.id === r1.id).voided_at !== null);
  check("  وإلغاءٌ ثانٍ ⇒ rx_stale (صفرُ صفوف)", await errOf(() => api.voidRx(r1.id, "x")) === "rx_stale");
  as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" });
  check("والمصوّرُ مسيَّج: لا يرى السجلَّ ولا التصميم، ولا يكتب (42501)",
    (await api.listForPet(pet)).length === 0 && (await api.getPad()) === null && await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "42501");
  as("v1", "doctor");
  registerConfigReadOnlyChecker(() => true);
  check("و«القراءة فقط» يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError) — والقراءةُ تبقى",
    await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "ReadOnlyError" && (await api.listForPet(pet)).length === 2);
  registerConfigReadOnlyChecker(() => false);
  quota = 10;
  check("والامتلاءُ يُرمى ولا يُبلع («ما انحفظ» لا «تمّ»)", await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "QuotaExceededError"
    && (quota = Infinity, (await api.listForPet(pet)).length === 2));
  quota = Infinity;
}

/* ── هـ) الأسلاك ──────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: القطعةُ كسولة بنطاقها، والطباعةُ داخل الضغطة، ولا autoFocus ولا window.confirm");
{
  const pp = code("src/pages/PetPassport.tsx"), vp = code("src/pages/VisitPage.tsx"), st = code("src/pages/Settings.tsx");
  const lazyRx = /page\(\(\) => import\("@\/components\/rx\/RxPad"\)\.then\(\(m\) => \(\{ default: m\.(RxButton|RxSettingsCard) \}\)\), \["rx"\]\)/;
  check("ملفُّ الحيوان وصفحةُ الحالة والإعدادات تحمّل المالكَ كسولاً بنطاقه (page(…, [\"rx\"]))، ولا استيرادَ ثابتاً",
    lazyRx.test(pp) && lazyRx.test(vp) && lazyRx.test(st) && ![pp, vp, st].some((s) => /from\s*["']@\/components\/rx\//.test(s)));
  /* كلُّ <RxButtonLazy بعد فتح `{canRx && ` لم يُغلق قبله (الزرُّ داخل البوّابة لا بجانبها). */
  const gated = (s) => {
    const uses = [...s.matchAll(/<RxButtonLazy\b/g)].map((m) => m.index);
    return uses.length > 0 && uses.every((i) => { const open = s.lastIndexOf("{canRx && ", i); return open >= 0 && !/\n\s{0,14}\)\}\n/.test(s.slice(open, i)); });
  };
  check("  والزرُّ لمن يكتب بالسجلّ الطبيّ (editMedical) ولا يراه المالك — بملفّ الحيوان وبصفحة الحالة (تُفتح لجلسة المالك أيضاً)",
    /const canRx = !isOwner && can\("editMedical"\)/.test(pp) && /const canRx = user\?\.role !== "owner" && can\("editMedical"\)/.test(vp) && gated(pp) && gated(vp));
  check("  وبطاقةُ الإعدادات لمن يملك إدارة الإعدادات", /\{canSettings && <RxCardSlot \/>\}/.test(st));
  const sheet = code("src/components/rx/RxSheet.tsx"), designer = code("src/components/rx/RxDesigner.tsx");
  const printFn = /const print = \(\) => \{([\s\S]*?)\n  \};/.exec(sheet)?.[1] ?? "";
  check("الطباعةُ داخل الضغطة: openRxPrint (والمستندُ فيها) قبل أيّ await، والحفظُ بعدها",
    !!printFn && printFn.indexOf("openRxPrint(") >= 0 && !/await/.test(printFn) && printFn.indexOf("saver.enqueue(snap)") > printFn.indexOf("openRxPrint(")
    && printFn.indexOf("saver.deferTo(snap, overflowed)") > printFn.indexOf("openRxPrint("));
  check("  وطباعةٌ ثانيةٌ بلا تغيير لا تكتب سجلّاً ثانياً — المحفوظُ بالبصمة، ولقطةُ المسودّة واحدةٌ بمعرّفها (saver.snapFor)، والفارغةُ لا تُحفظ",
    /if \(!canRecord \|\| saver\.isSaved\(key\)\)/.test(printFn) && /const snap = saver\.snapFor\(key, /.test(printFn) && /if \(!clean\.trim\(\)\)/.test(printFn)
    && !/uuid\(\)[^;]*\};\s*$/m.test(printFn.split("saver.snapFor")[0]));
  check("المحفوظُ لقطةُ ما انطبع لحظةَ الطباعة (بمعرّفٍ من الجهاز والنصِّ النظيف) — و«احفظها بالسجل» تحفظها هي لا المسودّةَ بعد تعديلها",
    /saver\.snapFor\(key, \(\) => \(\{ id: uuid\(\), pet_id: pet\.id, visit_id: visitId, pet_name: fields\.name \|\| pet\.name, doctor_name: doctor, fields, body: clean \}\)\)/.test(printFn)
    && /onClick=\{\(\) => void saver\.flush\(\)\}[^>]*data-rx-retry/.test(sheet) && /add: \(input\) => rxApi\.add\(input\)/.test(sheet)
    && !/rxApi\.add\(\{/.test(sheet) && !/const save = /.test(sheet));
  check("  والخروجُ يُسأل ما دامت ورقةٌ انطبعت ولم تُحفظ (ولو فُرّغ النصّ بعدها) أو نافذتُها تقرّر (قد تنسدّ بلا طباعة)، والنسخةُ الجديدة لا تنزل فوق نصٍّ لم يُحفظ — إلا بتحديثٍ اختاره الطبيب، والورقةُ غيرُ المحفوظة ممسوكةٌ دائماً",
    /if \(!dirty && !pendingN && !waiting\) return true;\s*setLeaveAsk\(true\);/.test(sheet)
    && /useEffect\(\(\) => \(pendingN > 0 \|\| \(dirty && !letGo\) \? holdUpdates\(Infinity\) : undefined\), \[dirty, pendingN, letGo\]\)/.test(sheet));
  /* تدقيقٌ خامس: «تقرّر» عن مسودّةٍ محفوظة كان يسأل «يضيع اللي كتبته»، والعنوانُ مختومٌ لحظةَ الفتح قال «بعدها ما طبعت» والورقةُ مطبوعة
     وحفظُها فشل فخرج الطبيبُ وضاعت لقطتُها، وإذنُ التحديث علمٌ عامّ عاش بعد ما أُذن له (نافذةٌ انسدّت فرجعت المسودّةُ بلا إمساك). */
  check("  و«تقرّر» لمسودّةٍ لم تُحفظ وحدها، وعنوانُ سؤال الخروج من الحال الآن (لا مختومٌ لحظةَ الفتح)، والسؤالُ يُغلق حين لا يبقى ما يضيع",
    /const waiting = !!clean\.trim\(\) && !saved && saver\.isWaiting\(key\);/.test(sheet)
    && /title=\{pendingN \? t\("rx\.leavePending"\) : waiting \? t\("rx\.leaveWaiting"\) : t\("rx\.leaveTitle"\)\}/.test(sheet)
    && /if \(leaveAsk && !dirty && !pendingN && !waiting\) setLeaveAsk\(false\);/.test(sheet) && /if \(reloadAsk && !dirty && !waiting\) setReloadAsk\(false\);/.test(sheet)
    && !/setLeaveAsk\(pendingN \?/.test(sheet) && !/leaveAsk === "/.test(sheet));
  check("  ونافذةٌ انسدّت قبل أن تطبع تُقال (onGone) — كانت تُضيّع المسودّةَ بصمت",
    /onGone: \(\) => \{ playWarning\(\); toast\.warn\(t\("rx\.goneUnprinted"\)\); \}/.test(sheet));
  check("  والقاموسُ العربيّ الذي لا يصل يُقال والنصُّ موجود (كان «اطبع» موقوفاً بلا كلمة)، والتحديثُ بطريق التعافي بعد أن يُفلت **نصُّ هذه المسودّة** إمساكَه، بسؤالٍ ونسخٍ إن كان نصّ أو نافذتُه تقرّر، وموقوفٌ مع ورقةٍ لم تُحفظ",
    /\{labelsFailed && \(\s*<div[^>]*data-rx-labels-fail/.test(sheet) && /onClick=\{askReload\} disabled=\{pendingN > 0\} data-rx-reload/.test(sheet)
    && /const askReload = \(\) => \{ playTap\(\); if \(dirty \|\| waiting\) \{ setCopied\(null\); setReloadAsk\(true\); \} else reloadPage\(\); \};/.test(sheet)
    && /const letGo = letGoKey !== null && letGoKey === key;/.test(sheet)
    && /setLetGoKey\(key\);\s*setReloading\(true\);\s*void labelsReload\(\)\.then\(\(ok\) => \{\s*if \(ok\) return;\s*setLetGoKey\(null\);\s*setReloading\(false\);/.test(sheet)
    && /onClick=\{reloadPage\} disabled=\{pendingN > 0\} data-rx-reload-do/.test(sheet) && /data-rx-reloading/.test(sheet) && !/setLetGo\(true\)/.test(sheet)
    && /navigator\.clipboard\.writeText\(clean\)/.test(sheet));
  check("  ونتيجةُ «انسخ النص» داخل سؤالها لا توست (بالهاتف يغطّي أزرارَه السفلية ٤ ثوانٍ)، والتنزيلُ البطيء يُقال بلا «تعذّر» ولا تحديث",
    /setCopied\("ok"\)/.test(sheet) && /setCopied\("fail"\)/.test(sheet) && /data-rx-copied=\{copied\}/.test(sheet) && !/toast\.(success|error)\(t\("rx\.(copied|copyFail)"\)\)/.test(sheet)
    && /\{labelsSlow && \(\s*<div[^>]*data-rx-labels-slow/.test(sheet) && /data-rxd-labels-slow/.test(designer));
  check("  ونافذةُ الطباعة حَكَم: قياسُ المعاينة لهذا المستند نهائيٌّ بلا فائض ⇒ حفظٌ فوراً، وإلا حين تقول «طبعتُ» (ولا يُحفظ ما رفضته) والنسخةُ الجديدة ممسوكة",
    /const measured = layout\.html === html;/.test(sheet) && /if \(saver\.isPending\(key\) \|\| \(measured && layout\.final && !layout\.overflow\)\) \{[\s\S]*?void saver\.enqueue\(snap\);[\s\S]*?\} else \{[\s\S]*?watchPrint\(w, saver\.deferTo\(snap, overflowed\)\)/.test(printFn)
    && /disabled=\{!labelsReady \|\| tooLong \|\| knownOverflow\}/.test(sheet) && /const knownOverflow = measured && layout\.overflow;/.test(sheet)
    && /hold: holdUpdates,/.test(sheet) && /const watchPrint = createPrintWatch\(browserWatchEnv\(\)\);/.test(sheet));
  check("  وإعادةُ الطباعة من السجلّ (بلا معاينة) تسمع رفضَ النافذة", /const reprint = [\s\S]*?watchPrint\(w, \{ onOverflow: overflowed \}\)/.test(sheet));
  check("الورقةُ من النصّ كما يُحفظ (cleanRxBody)، وأطولُ من السقف لا يُطبع ويُقال", /rxDoc\(cfg, labels, fields, clean, doctor, title\)/.test(sheet) && /const tooLong = body\.length > RX_LIMITS\.body;/.test(sheet) && /data-rx-toolong/.test(sheet));
  check("سطرٌ حُفظ يدخل القائمةَ إن كانت قائمةَ الخادم وحدها — فاشلةٌ أو قيدَ القراءة تُقرأ من جديد (لا «سابقة (1)» كاذبة)",
    /if \(h\.status === "ready"\) setHist\(\{ status: "ready", list: \[rec, \.\.\.h\.list\.filter/.test(sheet) && /else if \(h\.status !== "missing"\) setHistN\(\(x\) => x \+ 1\)/.test(sheet)
    && !/status: h\.status === "loading" \? "loading" : "ready"/.test(sheet));
  check("«أضفها هنا» تنسخ النصَّ كتلةً (appendBlock) لا سطراً سطراً بحذف المكرّر", /onReuse=\{\(r\) => \{ playTap\(\); setBody\(\(b\) => appendBlock\(b, r\.body\)\); \}\}/.test(sheet));
  check("والدكتورُ الموقّع بكلماتٍ كاملة ودكتورٍ واحد (pickDoctor) لا احتواءٌ أوّلُه يفوز", /const dr = pickDoctor\(user\?\.full_name, cfg\.doctors\.map\(\(d\) => d\.name\), t\("rx\.drTitles"\)\.split\(","\)\)/.test(sheet) && !/includes\(me\)/.test(sheet));
  check("وخاناتُ المريض بلغة الورقة بعد وصول قاموسها (tp)، وتصميمٌ وصل بعد البذر يعيد بذرَ ما لم يُلمس وحده، وفشلُ القاموس «أعد المحاولة»",
    /if \(pad\.status === "loading" \|\| !labelsReady\) return;\s*const s = seeded\.current;\s*if \(s && s\.cfg === cfg\) return;\s*const f = initialFields\(pet, cfg\.lang, tp\)/.test(sheet)
    && /age: cur\.age === s\.age \? f\.age : cur\.age, weight: cur\.weight === s\.weight \? f\.weight : cur\.weight/.test(sheet) && /setDoctor\(\(cur\) => \(!s \|\| cur === s\.doctor \? dr : cur\)\)/.test(sheet)
    && /data-rx-labels-fail/.test(sheet)
    && /\(\) => \{ if \(alive\) setFailed\(true\); \}/.test(code("src/components/rx/rxShared.ts")) && !/\(\) => \{ if \(alive\) setReady\(true\); \}, \(\) => \{ if \(alive\) setReady\(true\); \}/.test(code("src/components/rx/rxShared.ts"))
    /* و«تعذّر» لا يُمسح بإعادة المحاولة (يفحصه سلوكُ الخطّاف بقسم ط — هذا سلكٌ وحده)، ويُقال حين يعلق التحميلُ والتعافي ينتظر، والتحديثُ بطريق التعافي. */
    && !/setFailed\(false\);\s*Promise\.all/.test(code("src/components/rx/rxShared.ts"))
    && /window\.setTimeout\(\(\) => \{ if \(alive\) setStuck\(true\); \}, RX_LABELS_STUCK_MS\)/.test(code("src/components/rx/rxShared.ts"))
    && /const check = \(\) => setParked\(recoveryPending\(\)\);/.test(code("src/components/rx/rxShared.ts"))
    && /const reload = useCallback\(\(\) => recoverFromStaleShell\(\), \[\]\);/.test(code("src/components/rx/rxShared.ts"))
    /* «جاهز» بنفس الرسمة لا حالةٌ قديمة: التصميمُ يصل عربياً بعد الافتراضيّ الإنكليزيّ فكانت الخاناتُ تُبذر قبل القاموس («2 years» على ورقةٍ عربية — مشيٌ بالمتصفّح أمسكه). */
    && /const ready = !needLoad \|\| loaded;/.test(code("src/components/rx/rxShared.ts")) && !/useState\(!needLoad\)/.test(code("src/components/rx/rxShared.ts")));
  check("  وعلمُ «المكوّن حيّ» يُرفع بكلّ تركيب (StrictMode يعيد الأثر) — كان يُطفأ ولا يُشعل فلا تتحدّث القائمةُ بعد الحفظ",
    /useEffect\(\(\) => \{ alive\.current = true; return \(\) => \{ alive\.current = false; \}; \}, \[\]\);/.test(sheet));
  check("  وأيامُ سطر الخطة بلغة الورقة أيضاً (والإنكليزيةُ ثابتة)، وكلُّ قراءةٍ للخطة برقمها (جوابٌ متأخّر — نجاحاً أو فشلاً — لا يفتح لوحةً أُغلقت)",
    /const planDays = \(n: number\) => \(cfg\.lang === "en" \? daysTextEn\(n\) : tp\("rx\.days", \{ count: n \}\)\);/.test(sheet) && /const my = \+\+planSeq\.current;/.test(sheet) && /if \(my !== planSeq\.current\) return;/.test(sheet)
    && /if \(my === planSeq\.current\) setPlan\(\{ status: "error" \}\)/.test(sheet)
    && /if \(plan\.status !== "closed"\) \{ planSeq\.current\+\+; setPlan\(\{ status: "closed" \}\); return; \}/.test(sheet));
  const shared = code("src/components/rx/rxShared.ts");
  check("المصمِّم: «أعد التحميل» تقول «تحميل» بنفس الرسمة (لا يُبذر من الصفّ القديم وختمه)، وفشلُ القراءة لا يبذر الافتراضيّ",
    /const reload = useCallback\(\(\) => \{\s*setSt\(\(s\) => \(\{ \.\.\.s, status: "loading", error: null \}\)\);\s*setN/.test(shared)
    && /if \(pad\.status === "loading" \|\| pad\.status === "error" \|\| draft\) return;/.test(designer) && /data-rxd-loadfail/.test(designer));
  check("  والحفظُ موقوفٌ ما دام **أيُّ** رفعٍ بالطريق (عدّادٌ لكلّ نوع)، والرفعُ موقوفٌ أثناء الحفظ، ورفعٌ عالق يُقطع بمهلة، والخروجُ أثناءه يُسأل",
    /disabled=\{missing \|\| pad\.status !== "ready" \|\| !dirty \|\| uploading\}/.test(designer) && /if \(!draft \|\| missing \|\| uploading \|\| saving\) return;/.test(designer)
    && /const uploading = uploads\.bg \+ uploads\.emblem > 0;/.test(designer) && /setUploads\(\(u\) => \(\{ \.\.\.u, \[kind\]: Math\.max\(0, u\[kind\] \+ by\) \}\)\)/.test(designer)
    && /if \(!file \|\| saving\) return;/.test(designer) && /await withTimeout\(rxApi\.uploadImage\(kind, prepared\), UPLOAD_MS\)/.test(designer)
    && (designer.match(/off=\{saving\}/g) ?? []).length === 2 && /if \(!dirty && !uploading\) return true;/.test(designer));
  check("  والنسخةُ الجديدة لا تنزل فوق تصميمٍ لم يُحفظ، والرقمُ المبذور تعديلٌ يُحفظ",
    /useEffect\(\(\) => \(dirty \|\| uploading \? holdUpdates\(Infinity\) : undefined\), \[dirty, uploading\]\)/.test(designer) && /setDraft\(seeded\);\s*setBase\(c\);/.test(designer));
  check("  وصفحةُ المعايرة لا تنتظر قاموسَ العناوين (خاناتُها قيمٌ بلا عناوين — فشلُه كان يُسكت الزرّ)، وفشلُه بالمعاينة يُقال بـ«أعد المحاولة»",
    /const printCalibration = \(\) => \{\s*if \(!draft\) return;/.test(designer) && /data-rxd-labels-fail/.test(designer) && /onClick=\{labelsRetry\}/.test(designer)
    && /t\(reloading \? "rx\.reloading" : dirty \|\| uploading \? "rx\.labelsSaveFirst" : "rx\.labelsReload"\)/.test(designer) && /\{!reloading && !dirty && !uploading && <button[^>]*onClick=\{reloadPage\}/.test(designer));
  check("  والسهمُ لفوق وPageUp بمنزلق «فوق ↕ جوه» يرفعان الطباعة (قيمةٌ أصغر) — كانا يزيدانها فيزحزحان عكسَ عنوانه",
    /\(\{ ArrowUp: -step, ArrowDown: step, PageUp: -3, PageDown: 3 \} as Record<string, number>\)\[e\.key\]/.test(designer) && /data-r="nudge-y"/.test(designer)
    && /set\(\{ nudge: \{ \.\.\.draft\.nudge, y: clamp\(r1\(draft\.nudge\.y \+ by\), -15, 15\) \} \}\)/.test(designer));
  check("  وما تغيّر أثناء حفظ التصميم لا يُرمى (يبقى مفتوحاً بالباقي)، ورفعٌ تُرك بـ«اطلع» بلا نغمةٍ ولا رسالة",
    /const sent = draft;[\s\S]*?rxApi\.savePad\(sent, expect\)[\s\S]*?const now = draftRef\.current;\s*if \(now && !same\(now, sent\)\) \{\s*toast\.success\(t\("rx\.saved"\), t\("rx\.savedMore"\)\);\s*return;\s*\}\s*setDraft\(row\.cfg\);/.test(designer)
    && /if \(alive\.current\) playSuccess\(\);/.test(designer) && /if \(alive\.current\) \{\s*playWarning\(\);\s*toast\.error\(t\("rx\.uploadFail"\)/.test(designer));
  check("  وحفظٌ رجع بعد «اطلع» يُقال ولا يُغلق مصمِّماً فُتح بعده (onClose يُغلق ما هو مفتوح — كان يُطفئه ويرمي ما كُتب)، وفشلُه عن مصمِّمٍ متروك لا يُقال",
    /rxApi\.savePad\(sent, expect\);\s*if \(!alive\.current\) \{\s*onSaved\(\);\s*playSuccess\(\);\s*toast\.success\(t\("rx\.saved"\)\);\s*return;\s*\}/.test(designer)
    && /\} catch \(e\) \{\s*if \(!alive\.current\) return;/.test(designer));
  check("  والمقبضُ يأخذ التركيزَ بالضغطة (الأسهمُ له)، والسحبُ يكتب خانتَه وحدها فوق المسودّة الحالية",
    /closest<HTMLElement>\("\[data-handle\]"\)\?\.focus\(\{ preventScroll: true \}\)/.test(designer) && /setDraft\(\(cur\) => \{/.test(designer) && !/setDraft\(\(\) => apply\(d\.start/.test(designer));
  check("  ومنزلقُ المعايرة يمين/يسار فيزيائيّ (dir=ltr) — بالعربية كان يزحزح الطباعةَ عكسَ عنوانه، وصورةُ الراجيتة تُسطَّح على أبيض",
    /dir="ltr" onChange=\{\(v\) => set\(\{ nudge: \{ \.\.\.draft\.nudge, x: v \} \}\)\} data-r="nudge-x"/.test(designer) && /background: "#ffffff"/.test(designer)
    && /if \(opts\.background\) \{ ctx\.fillStyle = opts\.background; ctx\.fillRect\(0, 0, width, height\); \}\s*ctx\.drawImage/.test(code("src/lib/image.ts")));
  const act = code("src/pages/ActivityLog.tsx");
  check("سجلُّ الحركات: الحذفُ مع الحيوان باسمه، و«ألغى» حين تغيّر الإلغاءُ وحده، وبلا شاراتٍ خامّة (voided_at/voided_by/updated_by/config)",
    /: del \? t\("act\.rxDel", \{ pet: pn\(\) \}\)/.test(act) && /changesOfRaw\(d\)\.has\("voided_at"\) \? t\("act\.rxVoid"/.test(act)
    && /const CHANGE_NOISE = new Set\(\[[^\]]*"voided_at", "voided_by", "updated_by", "config"\]\)/.test(act));
  const mig = src("supabase/migrations/0261_rx_pad.sql");
  check("والهجرة: تدقيقُ الحذف بلقطته، والإلغاءُ حين يتغيّر وحده، والتجميدُ للصفّ كلّه إلا الإلغاء (ومنه المعرّف)، والحيوانُ يراه الكاتب",
    /create trigger audit_all after insert or delete on public\.pet_prescriptions/.test(mig) && /when \(old\.voided_at is distinct from new\.voided_at\) execute function audit_change\(\)/.test(mig)
    && /\(to_jsonb\(new\) - array\['voided_at', 'voided_by', 'void_reason'\]\)\s*is distinct from \(to_jsonb\(old\) - array\['voided_at', 'voided_by', 'void_reason'\]\)/.test(mig)
    && /and exists \(select 1 from public\.pets p where p\.id = pet_prescriptions\.pet_id\)/.test(mig) && /when p_entity = 'pet_prescriptions' then 'medical'   -- \+0261/.test(mig));
  check("لا autoFocus (المكوّنُ يرسم MedPicker) ولا window.confirm بالنافذة والمصمِّم",
    !/autoFocus/.test(sheet) && !/autoFocus/.test(designer) && !/\b(window\.)?confirm\(/.test(sheet.replace(/confirmClose\(|confirmVoid\(/g, "")) && !/\b(window\.)?confirm\(/.test(designer.replace(/confirmClose\(/g, "")));
  check("الإلغاءُ بتأكيدٍ داخل النافذة يقول ما يحصل، وللمدير وحده", /t\("rx\.voidHint"\)/.test(sheet) && /isManager && <button/.test(sheet) && /const isManager = role === "manager"/.test(sheet));
  check("«من خطة العلاج» قراءةٌ طازجة ترمي (rxApi.notes)، و«ماكو» بعد نجاحها وحده — وبلوغُ سقفها بلا خطة «تعذّر»",
    /const notes = await rxApi\.notes\(pet\.id\)/.test(sheet) && /latestPlan\(notes\)/.test(sheet) && /notes\.length >= RX_NOTES_LIMIT \? \{ status: "error" \} : \{ status: "none" \}/.test(sheet));
  check("  و«أعد المحاولة» بلوحة الخطة تعيد القراءةَ نفسَها (loadPlan) — لا الفتحَ/الإغلاق بنسخة حالةٍ قديمة يُغلق اللوحة",
    /onRetry=\{\(\) => void loadPlan\(\)\}/.test(sheet) && /const togglePlan = \(\) => \{/.test(sheet) && !/setTimeout\(\(\) => void openPlan/.test(sheet));
  /* علامةُ الملاحظة المنظّمة بمحرفَي تحكّم — نمطُ الخادم يطابقها بـ`_` (محرفٌ واحد)، وإلا «ماكو خطة» عن كلّ حيوان. */
  const mark = /const MARK = "([^"]+)"/.exec(src("src/lib/clinicalRecord.ts"))?.[1] ?? "";
  const pat = /\.like\("note_text", "([^"]+)"\)/.exec(code("src/lib/rxApi.ts"))?.[1] ?? "";
  const likeRe = new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".").replace(/%/g, "[\\s\\S]*") + "$");
  check("  ونمطُ الخادم يطابق علامةَ الخطة الحقيقية (\\x01CLINRX1\\x01) ولا يطابق ملاحظةً عادية",
    mark.length === 9 && likeRe.test(encodeClinical({ v: 1, treatment: [] }, "x")) && !likeRe.test("CLINRX1 نصّ") && !likeRe.test("ملاحظة"), `${JSON.stringify(mark)} ~ ${pat}`);
  const api = code("src/lib/rxApi.ts");
  check("البابُ: القراءةُ ترمي، والجدولُ الغائبُ rx_missing، والكتابةُ بشرط «كما فُتح»، ومجلّدُ الصورة من الخادم",
    /if \(error\) throw fail\(error\)/.test(api) && /42P01/.test(api) && /\.eq\("updated_at", expect\)/.test(api) && /\.is\("voided_at", null\)/.test(api) && /rpc\("my_workspace"\)/.test(api));
  const hp = JSON.parse(src("src/i18n/hot-paths.json"));
  check("النطاقُ مملوكٌ لـRxPad ورفاقُه الثلاثة", hp.owned.rx?.owner === "src/components/rx/RxPad.tsx" && (hp.owned.rx?.with ?? []).length === 3);
  check("وهجرةُ 0261 بموجة الحزمة وقسمُها فيها", /WAVE="[^"]*\$MIG\/0261_rx_pad\.sql/.test(src("supabase/tests/run.sh")) && /▸ 0261:/.test(src("supabase/tests/run.sh")));
}

/* ── و) الحفظُ ونوافذُ الطباعة (rxSave) بسلوكهما ───────────────────────────────── */
console.log("▸ الحفظ: لقطةٌ واحدة لكلّ مسودّة، ونافذتان سجلٌّ واحد، والطابورُ يقف عند الفشل، والنسخةُ الجديدة ممسوكة");
{
  /* نافذةٌ أمٌّ مزيَّفة: رسائلُ تُرسل بيد الفحص، ومؤقّتٌ يُدقّ بيده. */
  const env = () => {
    const ls = [], timers = new Map();
    let id = 0;
    return {
      listen: (f) => ls.push(f), every: (f) => { timers.set(++id, f); return id; }, stop: (i) => timers.delete(i),
      post: (source, data) => ls.forEach((f) => f(source, data)), tick: () => [...timers.values()].forEach((f) => f()), get timers() { return timers.size; },
    };
  };
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  /* مدخِلٌ مزيَّف: يسجّل المعرّفات، ويُفشَل أو يُعلَّق بالطلب. */
  const mk = () => {
    const log = { adds: [], holds: 0, released: 0, saved: [], failed: [], gone: [] };
    const ctl = { fail: false, gate: null };
    const sv = S.createRxSaver({
      add: async (input) => {
        log.adds.push(input.id);
        if (ctl.gate) await ctl.gate;
        if (ctl.fail) throw Object.assign(new Error("net"), { code: "net" });
        return { id: input.id };
      },
      hold: () => { log.holds++; let done = false; return () => { if (!done) { done = true; log.released++; } }; },
      onSaved: (snap) => log.saved.push(snap.key), onFail: (snap) => log.failed.push(snap.key), onChange() {},
      onGone: (snap) => log.gone.push(`${snap.key}@${log.released}`),
    });
    return { sv, log, ctl };
  };
  let n = 0;
  const make = () => ({ id: `id-${++n}` });

  {
    const { sv, log } = mk(), e = env(), watch = S.createPrintWatch(e);
    const w1 = { closed: false }, w2 = { closed: false };
    const a = sv.snapFor("K", make), b = sv.snapFor("K", make);
    watch(w1, sv.deferTo(a, () => {}));
    watch(w2, sv.deferTo(b, () => {}));
    check("مسودّةٌ واحدة طُبعت مرّتين قبل أن تقرّر نافذتُها: لقطةٌ واحدة بمعرّفٍ واحد، والإمساكُ من الضغطة", a === b && a.input.id === "id-1" && log.holds === 2 && sv.isWaiting("K") && log.released === 0);
    e.post(w1, { rx: "print" });
    await settle();
    e.post(w2, { rx: "print" });
    await settle();
    check("  والنافذتان تقولان «طبعتُ» ⇒ إدخالٌ واحد وسجلٌّ واحد — لا صفٌّ ثانٍ لا يُحذف", log.adds.join() === "id-1" && log.saved.join() === "K" && sv.isSaved("K") && !sv.isWaiting("K"), JSON.stringify(log));
    check("  والإمساكُ يُفلت بعد أن يستقرّ الحفظ (مرّةً لكلّ نافذة)", log.released === 2, JSON.stringify(log));
  }
  {
    const { sv, log } = mk(), e = env(), watch = S.createPrintWatch(e);
    const w = { closed: false };
    const k = sv.snapFor("K", make);
    watch(w, sv.deferTo(k, () => {}));
    await sv.enqueue(sv.snapFor("K", make));
    e.post(w, { rx: "print" });
    await settle();
    check("ضغطةٌ قبل القياس ثمّ ضغطةٌ بعده (حفظٌ فوريّ): رسالةُ الأولى المتأخّرة لا تكتب سجلّاً ثانياً", log.adds.length === 1 && sv.isSaved("K") && log.released === 1, JSON.stringify(log));
  }
  {
    const { sv, log } = mk(), e = env(), watch = S.createPrintWatch(e);
    const wx = { closed: false };
    watch(wx, sv.deferTo(sv.snapFor("X", make), () => {}));
    await sv.enqueue(sv.snapFor("Y", make));
    e.post(wx, { rx: "print" });
    await settle();
    check("نافذةٌ أقدم تقرّر بعد حفظ الأحدث: المحفوظُ مجموعة — الأحدثُ يبقى «انطبعت» ولا يُعاد", sv.isSaved("Y") && sv.isSaved("X") && log.adds.length === 2 && log.saved.join() === "Y,X", JSON.stringify(log));
  }
  {
    const { sv, log, ctl } = mk();
    ctl.fail = true;
    await sv.enqueue(sv.snapFor("A", make));
    check("فشلُ الحفظ يقف ويُبقي اللقطة (لـ«احفظها بالسجل») — لا تُرمى ويكمل", sv.failed && sv.isPending("A") && !sv.isSaved("A") && sv.pendingCount === 1 && log.failed.join() === "A");
    await sv.enqueue(sv.snapFor("B", make));
    check("  ولقطةٌ جديدة بعده تنتظر دورَها خلف الفاشلة (الترتيب) — والفاشلةُ تُعاد أوّلاً بمعرّفها", sv.pendingCount === 2 && log.adds.join() === `${sv.snapFor("A", make).input.id},${sv.snapFor("A", make).input.id}`, JSON.stringify(log.adds));
    ctl.fail = false;
    await sv.flush();
    check("  و«احفظها بالسجل» تحفظ الاثنتين بترتيبهما", log.saved.join() === "A,B" && sv.pendingCount === 0 && !sv.failed, JSON.stringify(log));
  }
  {
    let calls = 0;
    const sv = S.createRxSaver({
      add: (input) => { calls++; if (calls === 1) throw new Error("sync"); return Promise.resolve({ id: input.id }); },
      hold: () => () => {}, onSaved() {}, onFail() {}, onChange() {},
    });
    await sv.enqueue(sv.snapFor("A", make));
    await sv.flush();
    check("  ومُدخِلٌ يرمي فوراً (لا وعداً) لا يعلّق الطابورَ بجولةٍ منتهية: «احفظها» بعده تحفظ", !sv.busy && sv.isSaved("A") && calls === 2, `${calls}`);
  }
  {
    const { sv, log, ctl } = mk();
    let open;
    ctl.gate = new Promise((r) => { open = r; });
    const p1 = sv.enqueue(sv.snapFor("A", make));
    await settle();
    const p2 = sv.enqueue(sv.snapFor("B", make));
    check("لقطةٌ تُضاف أثناء حفظٍ جارٍ تلحقه الجولةُ نفسُها (لا تبقى بالطابور)", sv.busy && p1 === p2);
    open();
    ctl.gate = null;
    await p1;
    check("  وتُحفظ بعد الأولى", log.saved.join() === "A,B" && !sv.busy && sv.pendingCount === 0, JSON.stringify(log));
  }
  {
    const { sv, log, ctl } = mk(), e = env(), watch = S.createPrintWatch(e);
    let open;
    ctl.gate = new Promise((r) => { open = r; });
    const w = { closed: false };
    watch(w, sv.deferTo(sv.snapFor("K", make), () => {}));
    e.post(w, { rx: "print" });
    await settle();
    check("«طبعتُ» والحفظُ بالطريق: الإمساكُ باقٍ حتى يستقرّ (تحميلٌ بين الرسالة والكتابة كان يُسقطها)", log.adds.length === 1 && log.released === 0);
    open();
    await settle();
    check("  ويُفلت بعده", log.released === 1 && sv.isSaved("K"));
  }
  {
    const { sv, log } = mk(), e = env(), watch = S.createPrintWatch(e);
    let over = 0;
    const w = { closed: false };
    watch(w, sv.deferTo(sv.snapFor("K", make), () => { over++; }));
    e.post({ closed: false }, { rx: "print" });
    e.post(w, { rx: "nope" });
    check("رسالةٌ من نافذةٍ أخرى أو بنوعٍ آخر لا تُحسب", log.adds.length === 0 && sv.isWaiting("K"));
    e.post(w, { rx: "overflow" });
    e.post(w, { rx: "print" });
    await settle();
    check("«فائض» ⇒ لا ورقة ولا سجلّ، ويُقال، والإمساكُ يُفلت — ورسالةٌ بعدها من النافذة نفسِها لا تُحسب", over === 1 && log.adds.length === 0 && log.released === 1 && !sv.isWaiting("K") && !sv.isPending("K"), JSON.stringify(log));
  }
  {
    const { sv, log } = mk(), e = env(), watch = S.createPrintWatch(e);
    const w = { closed: false };
    watch(w, sv.deferTo(sv.snapFor("K", make), () => {}));
    w.closed = true;
    e.tick();
    e.tick();
    check("نافذةٌ أُغلقت تُمهَل قبل «ذهبت» (رسالتُها قد تكون خلف حوار الطباعة)", log.released === 0 && sv.isWaiting("K"));
    e.post(w, { rx: "print" });
    await settle();
    check("  ورسالتُها بالمهلة تُحفظ (ولا «ذهبت»)", log.adds.length === 1 && sv.isSaved("K") && log.released === 1 && log.gone.length === 0);
    const w2 = { closed: false };
    watch(w2, sv.deferTo(sv.snapFor("Q", make), () => {}));
    w2.closed = true;
    e.tick(); e.tick(); e.tick();
    check("  وبلا كلمة بعد المهلة ⇒ لا سجلّ، والإمساكُ يُفلت، والمؤقّتُ يقف — و«ذهبت» تُقال مرّةً بعد الإفلات (كانت صامتة فتضيع المسودّة)",
      log.adds.length === 1 && !sv.isWaiting("Q") && log.released === 2 && e.timers === 0 && log.gone.join() === "Q@2", `${e.timers} ${log.gone}`);
  }
  /* «ذهبت بلا شي» عن مسودّةٍ لم يحفظها غيرُها وحدها (تدقيقٌ خامس: بعد «انطبعت وانحفظت» قالت «ما انحفظ شي» عن الراجيتة نفسِها) —
     بسلوك الوحدة الحقيقية، وبطفراتٍ عليها تُثبت أنّ الفحصَ ليس فارغاً. */
  const loadSave = async (edit) => {
    const raw = src("src/lib/rxSave.ts");
    const t = await esbuild.transform(edit ? edit(raw) : raw, { loader: "ts", format: "esm" });
    const d = mkdtempSync(path.join(tmpdir(), "rx-save-"));
    const f = path.join(d, "m.mjs");
    writeFileSync(f, t.code);
    return import(pathToFileURL(f).href).finally(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
  };
  async function goneSuite(SM, ck) {
    const mk2 = () => {
      const log = { gone: [], adds: 0 };
      const sv = SM.createRxSaver({
        add: async (input) => { log.adds++; return { id: input.id }; }, hold: () => () => {},
        onSaved() {}, onFail() {}, onChange() {}, onGone: (snap) => log.gone.push(snap.key),
      });
      return { sv, log };
    };
    const shut = (e, ...ws) => { for (const w of ws) w.closed = true; e.tick(); e.tick(); e.tick(); };
    {
      const { sv, log } = mk2(), e = env(), watch = SM.createPrintWatch(e);
      const w = { closed: false };
      watch(w, sv.deferTo(sv.snapFor("K", make), () => {}));
      await sv.enqueue(sv.snapFor("K", make));
      shut(e, w);
      ck("نافذةٌ تقرّر ثمّ طباعةٌ ثانية حفظت فوراً، والأولى انسدّت: لا «ما انحفظ شي» بعد «انطبعت وانحفظت» (سجلٌّ واحد)", log.gone.length === 0 && log.adds === 1 && sv.isSaved("K"), JSON.stringify(log));
    }
    {
      const { sv, log } = mk2(), e = env(), watch = SM.createPrintWatch(e);
      const w1 = { closed: false }, w2 = { closed: false };
      watch(w1, sv.deferTo(sv.snapFor("K", make), () => {}));
      watch(w2, sv.deferTo(sv.snapFor("K", make), () => {}));
      e.post(w2, { rx: "print" });
      await settle();
      shut(e, w1);
      ck("  ونافذتان تقرّران: الثانيةُ طبعت والأولى انسدّت ⇒ لا «ذهبت»", log.gone.length === 0 && sv.isSaved("K"), JSON.stringify(log));
    }
    {
      const { sv, log } = mk2(), e = env(), watch = SM.createPrintWatch(e);
      const w1 = { closed: false }, w2 = { closed: false };
      watch(w1, sv.deferTo(sv.snapFor("K", make), () => {}));
      watch(w2, sv.deferTo(sv.snapFor("K", make), () => {}));
      shut(e, w1);
      const mid = log.gone.length;
      shut(e, w2);
      ck("  والاثنتان انسدّتا بلا طباعة ⇒ «ذهبت» مرّةً بعد الأخيرة (لا والثانيةُ ما زالت تقرّر)", mid === 0 && log.gone.join() === "K" && !sv.isWaiting("K"), `${mid} ${log.gone}`);
    }
    {
      const { sv, log } = mk2(), e = env(), watch = SM.createPrintWatch(e);
      const w = { closed: false };
      let over = 0;
      watch(w, sv.deferTo(sv.snapFor("K", make), () => { over++; }));
      e.post(w, { rx: "overflow" });
      shut(e, w);
      ck("  ونافذةٌ قالت «فائض» ثمّ انسدّت: الفائضُ وحده يُقال — لا «انسدّت قبل ما تطبع» فوقه", over === 1 && log.gone.length === 0, `${over} ${log.gone}`);
    }
  }
  await goneSuite(await loadSave(), check);
  {
    const swapS = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`الطفرة لم تجد نصَّها: ${from.slice(0, 50)}`); return s.split(from).join(to); };
    const MUT_S = [
      ["«ذهبت» بلا سؤالٍ عن المحفوظ (نسخةُ الجولة الرابعة)", swapS("if (!saved.has(snap.key) && !s.isPending(snap.key) && !waiting.has(snap.key)) s.deps.onGone?.(snap);", "s.deps.onGone?.(snap);")],
      ["«ذهبت» ونافذةٌ أخرى ما زالت تقرّر", swapS(" && !waiting.has(snap.key)) s.deps.onGone", ") s.deps.onGone")],
      ["الفائضُ يقول «ذهبت» أيضاً", swapS("onOverflow: () => { if (settle()) { release(); onOverflow(); } },", "onOverflow: () => { if (settle()) { release(); onOverflow(); s.deps.onGone?.(snap); } },")],
    ];
    for (const [name, edit] of MUT_S) {
      let caught = 0;
      try { await goneSuite(await loadSave(edit), (_n, ok) => { if (!ok) caught++; }); } catch { caught = -1; }
      check(`  طفرة «${name}» تُسقط فحصاً`, caught > 0, `caught=${caught}`);
    }
  }
  {
    const t = (k) => `T:${k}`;
    check("رسالةُ الرفض كما تقولها الشاشة (rxErrorText نفسُها): «للمدير» من رسالة المحفّز ولو برمز السياج العامّ، و«تغيّرت» و«مجمّدة»",
      rxErrorText(Object.assign(new Error("rx_void_manager"), { code: "42501" }), t) === "T:rx.voidManagerOnly"
      && rxErrorText(A.rxStale(), t) === "T:rx.stale" && rxErrorText(Object.assign(new Error("rx_frozen"), { code: "P0001" }), t) === "T:rx.frozen"
      && rxErrorText(Object.assign(new Error("rx_voided"), { code: "P0001" }), t) === "T:rx.frozen");
    as("v1", "doctor");
    const pet = "pet-rx-err";
    const r = await A.rxApi.add({ pet_id: pet, pet_name: "Bobby", doctor_name: "", fields: {}, body: "x" });
    let said = "";
    try { await A.rxApi.voidRx(r.id, "x"); } catch (e) { said = rxErrorText(e, t); }
    check("  وإلغاءُ الطبيب بالمرآة يصل الشاشةَ «للمدير» (الخطأُ نفسُه عبر rxErrorText — لا خطأَ قاعدةٍ عامّ)", said === "T:rx.voidManagerOnly", said);
  }
  const paper = code("src/components/rx/RxPaper.tsx");
  check("المعاينةُ تسمع القياسَ برسالةٍ من نافذة إطارها وحدها، وتنسبه لمستنده برقمه (لا لأحدث ما مُرّر)، والأقدمُ لا يُقرأ — ولا حدثَ تحميل",
    /if \(!frame\.current \|\| e\.source !== frame\.current\.contentWindow\) return;/.test(paper) && /const src = seq\.current\.byN\.get\(k\);/.test(paper)
    && /if \(src === undefined \|\| k < last\.current\) return;/.test(paper) && /html: src \}\)/.test(paper) && /useLayoutEffect\(\(\) => \{/.test(paper) && !/onLoad=/.test(paper));
}

/* ── ز) سجلُّ الحركات مرسوماً (react-mini، كـavg-cost-note-test) ─────────────────── */
console.log("▸ سجلُّ الحركات: الجملُ والشرائحُ والفاعلُ بصفوفٍ كما يكتبها الخادم — وطفراتٌ تُثبت أنّ الفحصَ ليس فارغاً");
{
  const ACT_FILE = "src/pages/ActivityLog.tsx";
  const AR = JSON.parse(src("src/i18n/ar.json"));
  const T_STUB = `
    const D = ${JSON.stringify({ act: AR.act, common: AR.common, errors: AR.errors })};
    const get = (k) => k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), D);
    const T = (k, d, x) => {
      const o = d && typeof d === "object" ? d : x && typeof x === "object" ? x : {};
      let s = get(k);
      if (typeof s !== "string") s = typeof d === "string" ? d : (o.defaultValue ?? k);
      return s.replace(/\\{\\{(\\w+)\\}\\}/g, (_, v) => (o[v] == null ? "" : String(o[v])));
    };
    export const useTranslation = () => ({ t: T, i18n: { language: "ar" } });
    export default {};`;
  const icons = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
  const STUBS = {
    "lucide-react": `const I = () => null; ${icons.map((k) => `export const ${k} = I;`).join("\n")}`,
    "react-i18next": T_STUB,
    i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
    "@/components/ui": `import { createElement, forwardRef } from "react";
      export const Button = forwardRef(({ children, leftIcon, rightIcon, loading, variant, size, ...p }, _r) => createElement("x-Button", { ...p, disabled: !!(p.disabled || loading) }, children));
      export const Skeleton = () => null;`,
    "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
    "@/lib/repo": "export const repo = { activitySummary: async () => [], activityActors: async () => [], activityPage: async () => globalThis.__actRows };",
    "@/lib/staff": "export const listStaff = async () => [];",
    "@/contexts/AuthContext": "export const useAuth = () => ({ user: { id: 'u1', full_name: 'x' } });",
    "@/hooks/usePermissions": "export const usePermissions = () => ({ can: () => true, role: 'manager', baseRole: 'manager' });",
    "@/lib/managerOverride": "export const useOverride = () => ({ restricted: false });",
  };
  const fileRe = new RegExp(`[\\\\/]${ACT_FILE.split("/").join("[\\\\/]")}$`);
  const loadAct = async (edit) => {
    const built = await esbuild.build({
      stdin: { contents: `export { ActivityLog } from "./${ACT_FILE}";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: "rx-act.tsx", loader: "tsx" },
      bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
      define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
      plugins: [{
        name: "rx-act-stubs",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUBS, a.path) ? { path: a.path, namespace: "stub" } : undefined));
          b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "jsx", resolveDir: process.cwd() }));
          if (edit) b.onLoad({ filter: fileRe }, (a) => ({ contents: edit(readFileSync(a.path, "utf8")), loader: "tsx" }));
        },
      }],
    });
    const d = mkdtempSync(path.join(tmpdir(), "rx-act-"));
    const f = path.join(d, "m.mjs");
    writeFileSync(f, built.outputFiles[0].text);
    return import(pathToFileURL(f).href).finally(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
  };
  const tick = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  const REASON = "كُتبت لحيوانٍ ثانٍ — الصحيح لونا";
  const now = new Date().toISOString();
  const ROWS = [
    // إلغاءٌ من حساب العيادة (لا صفَّ كادرٍ له، 0083): الفاعلُ «مدير العيادة» لا طبيبُها الموقِّع
    { id: 11, src: "a", created_at: now, actor: "c1", actor_name: null, kind: "medical", action: "UPDATE", entity: "pet_prescriptions", entity_id: "r1",
      brief: { pet_name: "بوبي", doctor_name: "د. علي", __changed: { voided_at: [null, now], voided_by: [null, "c1"], void_reason: [null, REASON] } } },
    // حذفُها مع حيوانها (المفتاحُ الأجنبيّ) بيد حسابٍ بلا صفّ كادر — حسابُ العيادة، أو (أندر) صاحبُ حيوانٍ مشترَك حذف حيوانه.
    // «مدير العيادة» صحيحٌ للأوّل وناقصٌ للثاني، والتمييزُ يحتاج الخادم: الواجهةُ لا تعرف حسابَ العيادة، ودخولُ المشغّل يُقرأ
    // «مدير العيادة» بالاتفاق (0151) فلا يُسمّى «خارج العيادة». المفحوصُ هنا ما يُمنع: نسبتُه لطبيبها الموقِّع.
    { id: 12, src: "a", created_at: now, actor: "o1", actor_name: null, kind: "medical", action: "DELETE", entity: "pet_prescriptions", entity_id: "r2",
      brief: { pet_name: "بوبي", doctor_name: "د. علي", body: "Amoxicillin" } },
    // كتابتُها من الحساب المشترك: الطبيبُ بالصفّ أصدقُ ما يُعرف
    { id: 13, src: "a", created_at: now, actor: "c1", actor_name: null, kind: "medical", action: "INSERT", entity: "pet_prescriptions", entity_id: "r3",
      brief: { pet_name: "بوبي", doctor_name: "د. علي" } },
    // تحديثٌ لا يمسّ الإلغاء: «حدّث» لا «ألغى»، وبلا شرائح ضجيج
    { id: 14, src: "a", created_at: now, actor: "u2", actor_name: "أحمد", kind: "medical", action: "UPDATE", entity: "pet_prescriptions", entity_id: "r4",
      brief: { pet_name: "بوبي", __changed: { updated_by: [null, "u2"] } } },
    // حذفٌ بلا فاعل (لوحةُ القاعدة، أو تتابعُ حذف حساب): «النظام» — لا الطبيبُ الموقِّع
    { id: 15, src: "a", created_at: now, actor: null, actor_name: null, kind: "medical", action: "DELETE", entity: "pet_prescriptions", entity_id: "r5",
      brief: { pet_name: "بوبي", doctor_name: "د. علي", body: "Amoxicillin" } },
    // إنشاءٌ بلا فاعل (سطورُ الملء الرجعيّ 0046 — كلُّها INSERT): طبيبُ الصفّ أصدقُ ما يُعرف
    { id: 16, src: "a", created_at: now, actor: null, actor_name: null, kind: "medical", action: "INSERT", entity: "pet_prescriptions", entity_id: "r6",
      brief: { pet_name: "بوبي", doctor_name: "د. علي" } },
    // تحديثٌ بلا فاعل (إلغاءٌ من لوحة القاعدة): «النظام» — لا الطبيبُ الموقِّع (كان صفُّ التحديث غائباً عن الفحص)
    { id: 17, src: "a", created_at: now, actor: null, actor_name: null, kind: "medical", action: "UPDATE", entity: "pet_prescriptions", entity_id: "r7",
      brief: { pet_name: "بوبي", doctor_name: "د. علي", __changed: { voided_at: [null, now], void_reason: [null, "x"] } } },
  ];
  async function suite(M, ck) {
    try {
      globalThis.__actRows = ROWS;
      const ui = M.mount(M.React.createElement(M.ActivityLog));
      await tick();
      const rows = ui.all().filter((x) => x.props && "data-actrow" in x.props);
      const info = rows.map((row) => {
        const ps = [];
        const walk = (x) => { if (x.type === "p") ps.push(x); x.children.forEach(walk); };
        walk(row);
        const chips = [];
        const walkC = (x) => { if (x.type === "span" && /rounded-lg bg-surface-2/.test(x.props.className ?? "")) chips.push(x.children.filter((c) => c.type === "b" || c.type === "span").map((c) => ui.text(c))); x.children.forEach(walkC); };
        walkC(row);
        const actor = [];
        const walkA = (x) => { if (x.type === "span" && /font-semibold text-ink-muted/.test(x.props.className ?? "")) actor.push(ui.text(x).trim()); x.children.forEach(walkA); };
        walkA(row);
        return { said: ui.text(ps[0] ?? row), chips, actor: actor[0] ?? "" };
      });
      ui.unmount();
      const [vd, del, add, upd, sysDel, backfill, sysUpd] = info;
      const J = JSON.stringify;
      ck("الإلغاءُ «ألغى راجيتة — بوبي»، وسببُه شريحةٌ واحدة بنصّه كاملاً (لا قصَّ عند ٢٨ قبل الحيوان الصحيح)، وبلا voided_at/voided_by خامّة",
        info.length === 7 && vd.said.includes("ألغى راجيتة — بوبي") && vd.chips.length === 1 && vd.chips[0][2] === REASON && vd.chips[0][0] === AR.act.f.void_reason, J(vd));
      ck("  وفاعلُه «مدير العيادة» — لا طبيبُها الموقِّع (الإلغاءُ للمدير وحده)", vd.actor === AR.act.manager, J(vd.actor));
      ck("الحذفُ مع الحيوان «انحذفت راجيتة مع حيوانها — بوبي»، وفاعلُه لا يُنسب للطبيب الموقِّع", del?.said.includes("انحذفت راجيتة مع حيوانها — بوبي") && del.actor === AR.act.manager, J(del));
      ck("الكتابةُ من الحساب المشترك تُنسب لطبيب الراجيتة (أصدقُ ما يُعرف)", add?.said.includes("كتب راجيتة لـ بوبي") && add.actor === "د. علي", J(add));
      ck("تحديثٌ لا يمسّ الإلغاء «حدّث راجيتة» بلا شرائح ضجيج، وبفاعله المسمّى", upd?.said.includes("حدّث راجيتة — بوبي") && upd.chips.length === 0 && upd.actor === "أحمد", J(upd));
      ck("حذفٌ بلا فاعل «النظام» لا الطبيبُ الموقِّع، وإنشاءٌ بلا فاعل (0046) بطبيبه",
        sysDel?.said.includes("انحذفت راجيتة مع حيوانها — بوبي") && sysDel.actor === AR.act.system && backfill?.actor === "د. علي", J([sysDel, backfill]));
      ck("  وإلغاءٌ بلا فاعل (لوحةُ القاعدة) «ألغى» وفاعلُه «النظام» لا الطبيبُ الموقِّع", sysUpd?.said.includes("ألغى راجيتة — بوبي") && sysUpd.actor === AR.act.system, J(sysUpd));
    } catch (e) {
      ck("سجلُّ الحركات يُرسم", false, String(e?.stack ?? e));
    }
  }
  await suite(await loadAct(), check);
  const swap = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`الطفرة لم تجد نصَّها: ${from.slice(0, 60)}`); return s.split(from).join(to); };
  const MUT = [
    ["الطبيبُ فاعلاً لكلّ صفّ", swap('const doc = r.action === "INSERT" ? d?.["doctor_name"] ?? d?.["doctor"] : null;', 'const doc = d?.["doctor_name"] ?? d?.["doctor"];')],
    ["والطبيبُ لكلّ صفٍّ بلا فاعل (نسخةُ الجولة الثالثة)", swap('const doc = r.action === "INSERT" ?', 'const doc = !r.actor || r.action === "INSERT" ?')],
    ["ولا طبيبَ حتى للإنشاء", swap('const doc = r.action === "INSERT" ?', 'const doc = false ?')],
    ["سببُ الإلغاء يُقصّ", swap('const FULL_TEXT = new Set(["recipe", "void_reason"]);', 'const FULL_TEXT = new Set(["recipe"]);')],
    ["مفاتيحُ التغيير الخامّ تُقرأ خطأً", swap('return new Set(c && typeof c === "object" && !Array.isArray(c) ? Object.keys(c) : []);', "return new Set<string>();")],
    ["الضجيجُ يُرسم شرائح", swap('"voided_at", "voided_by", "updated_by", "config"]);', '"config"]);')],
  ];
  for (const [name, edit] of MUT) {
    let caught = 0;
    try { await suite(await loadAct(edit), (_n, ok) => { if (!ok) caught++; }); } catch { caught = -1; }
    check(`  طفرة «${name}» تُسقط فحصاً`, caught > 0, `caught=${caught}`);
  }
}

/* ── ح) سكربتا الترتيب والطباعة بسلوكهما: مستندٌ مزيَّف بمحرّك قياسٍ صغير (سطرٌ بارتفاع خطّه، والخطُّ الحقيقيّ أعرضُ وأطول من
   الاحتياطيّ)، وساعةٌ وأحداثٌ بيد الفحص — السكربتُ نفسُه من المستند المبنيّ. كانت فحوصُهما نصّاً: إعادةُ ترتيبٍ تُبقي صفحةً قديمة
   (سطورٌ مكرّرة) كانت تمرّ (`i>0` → `i>1`، مراجعةٌ ثالثة). ── */
console.log("▸ سكربتا الترتيب والطباعة بسلوكهما: الإعادةُ لا تكرّر سطراً، والخطوطُ تُطلب مع المستند، والقسريُّ لا يطبع ما لم يُقس");
{
  const unesc = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const scriptsOf = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const mkHtml = (body, opts = {}) => P.buildRxHTML({
    cfg: L.cleanRxPad({ lang: "en" }), clinic: { title: "T", subtitle: "", logoUrl: null, emblemUrl: null, bgUrl: null, hours: "", socials: [] },
    fields: { date: "2026-11-05", name: "Bobby", owner: "", age: "", weight: "", kind: "" }, dateText: "05/11/2026", body, doctor: "",
    labels: L.RX_LABELS_EN, docTitle: "Rx", overflowNote: "OVER",
  }, opts);
  /* المحرّك: مربّعُ الوصفة ٣٠٠ بكسل عرضاً وطولاً؛ السطرُ = (حروفُه ÷ ما يسعه السطر) × حجمُ الخطّ × ١٫٥٥ × k. وكما كروميوم (تدقيقٌ
     خامس — مزيَّفٌ أعمى عنها مرّر عيبَ القصّ): الخطوطُ **وجهان** يصلان كلٌّ وحده (k يتغيّر مع كلّ وجه، وloadingdone بعد آخرهما
     وحده)، والشعارُ يأخذ ٤٠ بكسل من المربّع حين يصل (ومخفيّاً لا شيء)، وحدثُ التحميل بيد الفحص (المشهدُ يؤخّره ما دامت الخطوطُ
     تصل). `kPer` سالبٌ = الخطُّ الحقيقيّ أضيقُ من الاحتياطيّ. */
  function makeEnv(html, edit = (x) => x, opt = {}) {
    const kPer = opt.kPer ?? 0.075;
    const M = { css: false, face: { cairo: "unloaded", ruqaa: "unloaded" }, img: "pending", arriveDuringPrint: !!opt.arriveDuringPrint,
      get fonts() { return Object.values(this.face).every((s) => s === "loaded"); } };
    const loadingFaces = () => Object.values(M.face).some((s) => s === "loading");
    const kNow = () => 1 + kPer * Object.values(M.face).filter((s) => s === "loaded").length;
    const clock = { now: 0, q: [], n: 0 };
    const setT = (f, ms) => { clock.q.push({ at: clock.now + Math.max(0, Number(ms) || 0), f, id: ++clock.n }); return clock.n; };
    const doc = {};
    class El {
      constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attrs = new Map(Object.entries(attrs)); this.children = []; this.parentNode = null; this.text = ""; this.style = {}; this.ls = {}; this.hidden = false; }
      getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
      setAttribute(k, v) { this.attrs.set(k, String(v)); }
      removeAttribute(k) { this.attrs.delete(k); }
      get id() { return this.getAttribute("id") ?? ""; }
      set id(v) { this.setAttribute("id", v); }
      has(c) { return (this.getAttribute("class") ?? "").split(/\s+/).includes(c); }
      appendChild(c) { return this.insertBefore(c, null); }
      insertBefore(c, ref) {
        if (c.parentNode) c.parentNode.removeChild(c);
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        c.parentNode = this;
        return c;
      }
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
      get firstChild() { return this.children[0] ?? null; }
      get lastElementChild() { return this.children[this.children.length - 1] ?? null; }
      get nextSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] ?? null : null; }
      get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this.text; }
      set textContent(v) { this.children = []; this.text = String(v); }
      /* كالمستند: النسخةُ السطحية بلا نصّ (النصُّ ابنٌ بالمستند الحقيقيّ). */
      cloneNode(deep) { const c = new El(this.tagName, Object.fromEntries(this.attrs)); c.style = { ...this.style }; if (deep) { c.text = this.text; for (const k of this.children) c.appendChild(k.cloneNode(true)); } return c; }
      querySelectorAll(sel) { const cls = sel.replace(/^\./, ""), out = []; const walk = (e) => { for (const k of e.children) { if (k.has(cls)) out.push(k); walk(k); } }; walk(this); return out; }
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
      getElementsByTagName(tag) { const T = tag.toUpperCase(), out = []; const walk = (e) => { for (const k of e.children) { if (k.tagName === T) out.push(k); walk(k); } }; walk(this); return out; }
      /* الصورةُ: «مكتملة» حين تصل أو تفشل (المصدرُ واحدٌ لنسخ الصفحات كلّها). */
      get complete() { return this.tagName === "IMG" ? M.img !== "pending" : undefined; }
      addEventListener(t, f) { (this.ls[t] ||= []).push(f); }
      fire(t) { for (const f of this.ls[t] ?? []) f({ type: t }); }
      get innerHTML() { return JSON.stringify(this.children.map((c) => [c.getAttribute("class"), c.getAttribute("dir"), c.textContent])); }
      set innerHTML(h) {
        this.children = [];
        if (h) for (const [cls, dir, t] of JSON.parse(h)) { const e = new El("div", dir ? { class: cls, dir } : { class: cls }); e.text = t; this.appendChild(e); }
      }
      lineH(c) {
        const fs = parseFloat(this.style.fontSize) || 12, k = kNow();
        const cpl = Math.max(1, Math.floor(300 / (fs * 0.6 * k)));
        return Math.max(1, Math.ceil([...c.textContent].length / cpl)) * fs * 1.55 * k;
      }
      /* المربّعُ ٣٠٠ ناقصَ الشعار الواصل الظاهر بصفحته. */
      get clientHeight() {
        if (!this.has("rx-lines")) return 0;
        let p = this;
        while (p && !p.has("page")) p = p.parentNode;
        const logo = p ? p.getElementsByTagName("img").filter((i) => M.img === "ok" && i.style.display !== "none").length * 40 : 0;
        return 300 - logo;
      }
      get scrollHeight() { return this.has("rx-lines") ? Math.max(this.clientHeight, this.children.reduce((h, c) => h + this.lineH(c), 0)) : 0; }
    }
    const attrs = Object.fromEntries([.../<html([^>]*)>/.exec(html)[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], unesc(m[2])]));
    const root = new El("html", attrs), head = new El("head"), body = new El("body");
    root.appendChild(head); root.appendChild(body);
    if (html.includes('id="rxpre"')) head.appendChild(new El("link", { id: "rxpre" }));
    if (html.includes('id="rxwarn"')) { const w = new El("div", { id: "rxwarn" }); w.hidden = true; body.appendChild(w); }
    const lm = /<div class="rx-lines" data-max="([^"]+)" data-min="([^"]+)">((?:<div class="ln"[^>]*>[^<]*<\/div>)*)<\/div>/.exec(html);
    const page = new El("div", { class: "page" }), box = new El("div", { class: "rx-lines", "data-max": lm[1], "data-min": lm[2] });
    for (const m of lm[3].matchAll(/<div class="ln"( dir="auto")?>([^<]*)<\/div>/g)) { const e = new El("div", m[1] ? { class: "ln", dir: "auto" } : { class: "ln" }); e.text = unesc(m[2]); box.appendChild(e); }
    const foot = new El("footer", { class: "ft" }), pno = new El("span", { class: "pno" });
    if (opt.logo) { const hd = new El("header", { class: "hd" }); hd.appendChild(new El("img", { src: "logo" })); page.appendChild(hd); }
    foot.appendChild(pno); page.appendChild(box); page.appendChild(foot); body.appendChild(page);
    const find = (e, id) => { if (e.getAttribute("id") === id) return e; for (const k of e.children) { const r = find(k, id); if (r) return r; } return null; };
    const fl = { ls: [], pend: [] };
    const waitFonts = () => (loadingFaces() ? new Promise((r) => fl.pend.push(r)) : Promise.resolve([]));
    /* وجهٌ يصل: يحلّ محلَّ الاحتياطيّ بلا حدث؛ وآخرُ الواصلين يُطلق loadingdone ويحلّ «الجاهزية». */
    const faceDone = (name) => {
      if (M.face[name] !== "loading") return;
      M.face[name] = "loaded";
      if (!loadingFaces()) { fl.pend.splice(0).forEach((r) => r([])); fl.ls.forEach((f) => f()); }
    };
    Object.assign(doc, {
      documentElement: root, head, body, readyState: "loading",
      querySelector: (s) => root.querySelector(s), querySelectorAll: (s) => root.querySelectorAll(s),
      getElementById: (id) => find(root, id), createElement: (t) => new El(t), getElementsByTagName: (t) => root.getElementsByTagName(t),
      fonts: { load: () => waitFonts(), get ready() { return waitFonts(); }, get status() { return loadingFaces() ? "loading" : "loaded"; },
        addEventListener: (t, f) => { if (t === "loadingdone") fl.ls.push(f); } },
    });
    const msgs = [], told = [], prints = [];
    const ws = {};
    const hiddenNow = () => root.querySelectorAll(".page").filter((p) => { const b = p.querySelector(".rx-lines"); return b && b.scrollHeight > b.clientHeight + 1; }).length;
    const fireImg = (t) => root.getElementsByTagName("img").forEach((i) => i.fire(t));
    let closed = false;
    const win = {
      parent: { postMessage: (m) => { if (m && m.rxLayout) msgs.push({ t: clock.now, ...m.rxLayout }); } },
      opener: { postMessage: (m) => told.push(`${m.rx}@${clock.now}`) },
      addEventListener: (t, f) => { (ws[t] ||= []).push(f); },
      dispatchEvent: (e) => { for (const f of ws[e.type] ?? []) f(e); return true; },
      focus() {}, close() { closed = true; },
      /* المطبوعُ: الصفحاتُ والخطوطُ والأسطرُ المخفيّة تحت مربّعها لحظتَها — وشعارٌ يصل **أثناء** حوار الطباعة (أحداثُه بعده). */
      print: () => {
        const rec = { t: clock.now, pages: root.querySelectorAll(".page").length, fonts: M.fonts, hidden: hiddenNow() };
        if (M.arriveDuringPrint && M.img === "pending") { M.img = "ok"; rec.afterHidden = hiddenNow(); setT(() => fireImg("load"), 0); }
        prints.push(rec);
      },
    };
    class Ev { constructor(type) { this.type = type; } }
    for (const js of scriptsOf(html)) new Function("window", "document", "setTimeout", "Event", edit(js))(win, doc, setT, Ev);
    const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
    const advance = async (to) => {
      for (;;) {
        clock.q.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = clock.q[0];
        if (!t || t.at > to) break;
        clock.q.shift();
        clock.now = t.at;
        t.f();
        await flush();
      }
      clock.now = Math.max(clock.now, to);
    };
    const linesNow = () => root.querySelectorAll(".page").flatMap((p) => p.querySelector(".rx-lines").children.map((c) => c.textContent));
    const rxf = () => head.children.filter((c) => c.getAttribute("id") === "rxf");
    return {
      root, win, msgs, told, prints, M, rxf, linesNow, hiddenNow,
      pages: () => root.querySelectorAll(".page").length,
      fs: () => root.querySelector(".rx-lines")?.style.fontSize ?? "",
      closed: () => closed,
      at: async (t, f) => { await advance(t); if (f) f(); await flush(); },
      load: () => { doc.readyState = "complete"; win.dispatchEvent({ type: "load" }); },
      preOk: () => find(root, "rxpre")?.setAttribute("data-ok", "1"),
      /* ورقةُ الخطوط تصل: تُطبَّق إن كانت بالمستند (وسمُ #rxf ملصوق) فتبدأ الوجوهُ تنزل، وإلا لا شيء. */
      css: () => { const l = rxf()[0]; if (!l) return; M.css = true; for (const k of Object.keys(M.face)) if (M.face[k] === "unloaded") M.face[k] = "loading"; l.fire("load"); },
      face: (name) => faceDone(name),
      fonts: () => { if (!M.css) return; for (const k of Object.keys(M.face)) faceDone(k); },
      /* الخطوطُ حاضرةٌ قبل أيّ قياس (مستندٌ يُفتح والخطوطُ مخبّأة) — للمقارنة بترتيبٍ طازج. */
      fontsNow: () => { M.css = true; for (const k of Object.keys(M.face)) M.face[k] = "loaded"; },
      imgArrive: () => { M.img = "ok"; fireImg("load"); },
      afterprint: () => win.dispatchEvent({ type: "afterprint" }),
    };
  }
  const short = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. Amoxicillin 250 mg`).join("\n");
  const S70 = short(70);
  const want70 = S70.split("\n");
  const sameLines = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const fmt = (ms) => JSON.stringify(ms.map((m) => `${m.final ? "F" : "p"}${m.pages}${m.overflow ? "O" : ""}@${m.t}`));

  async function suite(edit, ck) {
    {
      const E = makeEnv(mkHtml(S70), edit);
      const runs = [];
      for (let i = 0; i < 3; i++) { E.win.__rxLayout(true); runs.push({ pages: E.pages(), lines: E.linesNow() }); }
      ck("الترتيبُ يُعاد كلَّ مرّةٍ من أوّله: ٧٠ سطراً بثلاث إعادات — نفسُ الصفحات ونفسُ الأسطر بترتيبها، لا سطرٌ مكرّر ولا ضائع",
        runs.every((r) => r.pages === 4 && sameLines(r.lines, want70)), JSON.stringify(runs.map((r) => [r.pages, r.lines.length])));
    }
    {
      const words = Array.from({ length: 300 }, (_, i) => `w${i}`).join(" ");
      const E = makeEnv(mkHtml(`Rx\n${words}`), edit);
      E.win.__rxLayout(true);
      E.win.__rxLayout(true);
      const got = E.linesNow();
      ck("  والسطرُ الأطولُ من الصفحة يُقسم عند كلمة على صفحاتٍ بلا كلمةٍ ضائعة، ولا فائض",
        E.pages() > 1 && got.length > 2 && got[0] === "Rx" && got.slice(1).every((x) => x.trim()) && got.slice(1).join(" ").replace(/\s+/g, " ").trim() === words
        && E.root.getAttribute("data-overflow") === null, `${E.pages()} ${JSON.stringify(got).slice(0, 200)}`);
      const U = makeEnv(mkHtml(`Rx\n${"x".repeat(3000)}`), edit);
      U.win.__rxLayout(true);
      ck("  وكلمةٌ لا تنقسم أطولُ من الصفحة ⇒ data-overflow (يُقال قبل الطباعة) لا قصٌّ صامت", U.root.getAttribute("data-overflow") === "1");
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(5, E.preOk);
      await E.at(10, E.load);
      await E.at(12, E.css);
      await E.at(30, E.fonts);
      await E.at(10000);
      ck("الخطوطُ مخبّأة: قياسٌ نهائيٌّ واحد بخطوطها (٥ صفحات) — لا ترتيبَ مؤقّتاً بالخطّ الاحتياطيّ يومض بالمعاينة مع كلّ تعديل",
        fmt(E.msgs) === JSON.stringify(["F5@30"]), fmt(E.msgs));
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(10, E.load);
      await E.at(2000, E.css);
      await E.at(2500, E.fonts);
      await E.at(10000);
      ck("  والخطوطُ بطيئة: مؤقّتٌ بعد ٤٠٠ م.ث من التحميل (احتياطيّ، ٤ صفحات)، ثمّ النهائيُّ بخطوطها", fmt(E.msgs) === JSON.stringify(["p4@410", "F5@2500"]), fmt(E.msgs));
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(300, E.preOk);
      await E.at(9005);
      const linked = E.rxf().length;
      await E.at(9010, E.css);
      await E.at(9300, E.fonts);
      ck("صورةٌ معلَّقة والخطوطُ وصلت بالـpreload: مؤقّتٌ بالرابعة، والقسريُّ بالتاسعة يطبّق الخطوط ويُعاد الترتيبُ حين تصل (كانت لا تُطلب إلا بعد التحميل فتضيع)",
        linked === 1 && fmt(E.msgs) === JSON.stringify(["p4@4000", "F4@9000", "F5@9300"]), `${linked} ${fmt(E.msgs)}`);
      await E.at(11000, E.load);
      ck("  وصورةٌ تصل بعد القسريّ تعيد الترتيبَ نهائياً (بلا ورقة خطوطٍ ثانية)", fmt(E.msgs.slice(3)) === JSON.stringify(["F5@11000"]) && E.rxf().length === 1, `${fmt(E.msgs)} ${E.rxf().length}`);
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(9500, E.preOk);
      await E.at(9600, E.css);
      await E.at(9700, E.fonts);
      ck("  والـpreload لم يصل قبل القسريّ: لا خطوطَ بعده (المقيسُ الاحتياطيّ هو المطبوع)", E.rxf().length === 0 && fmt(E.msgs) === JSON.stringify(["p4@4000", "F4@9000"]) && !E.M.fonts, fmt(E.msgs));
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(100, E.load);
      await E.at(9200);
      await E.at(9500, E.css);
      await E.at(9600, E.fonts);
      ck("  وورقةُ خطوطٍ أُضيفت بعد التحميل ولم تصل حتى القسريّ تُشال — وصولُها بعده لا يُطبَّق على ورقٍ نهائيّ",
        E.rxf().length === 0 && !E.M.css && fmt(E.msgs) === JSON.stringify(["p4@500", "F4@9000"]), fmt(E.msgs));
    }
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit);
      await E.at(5, E.preOk);
      await E.at(10, E.load);
      await E.at(12, E.css);
      await E.at(30, E.fonts);
      await E.at(20000);
      ck("نافذةُ الطباعة: تطبع مرّةً بعد النهائيّ والتحميل، وتقول «طبعتُ» قبلها", E.prints.length === 1 && E.prints[0].pages === 5 && E.prints[0].fonts && E.told.join() === "print@30", JSON.stringify([E.prints, E.told]));
      E.afterprint();
      await E.at(20400);
      ck("  وبعد الطباعة تُغلق نفسَها (afterprint) — كانت تُفحص نصّاً وحده", E.closed());
    }
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit);
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(9300, E.fonts);
      await E.at(20000);
      ck("  وصورةٌ معلَّقة: تنتظر التحميلَ ثلاثَ ثوانٍ بعد القسريّ ثمّ تطبع الترتيبَ الأخير (بخطوطه)",
        E.prints.length === 1 && E.prints[0].t >= 12000 && E.prints[0].pages === 5 && E.prints[0].fonts && E.told.join() === "print@12000", JSON.stringify([E.prints, E.told]));
    }
    {
      const E = makeEnv(mkHtml(`Rx\n${"x".repeat(3000)}`, { print: true }), edit);
      await E.at(10, E.load);
      await E.at(12, E.css);
      await E.at(30, E.fonts);
      await E.at(20000);
      const warn = E.root.querySelectorAll(".x").length === 0 && (function f(e) { if (e.getAttribute("id") === "rxwarn") return e; for (const k of e.children) { const r = f(k); if (r) return r; } return null; })(E.root);
      ck("  وما فيه فائضٌ لا يُطبع أبداً: الشريطُ يظهر و«فائض» تُقال (لا «طبعتُ»)", E.prints.length === 0 && E.told.join() === "overflow@30" && warn && warn.hidden === false, JSON.stringify([E.prints, E.told]));
    }
    /* تدقيقٌ خامس: النهائيُّ القسريّ يطبّق الخطوط فتنزل وتحجب حدثَ التحميل، والشعارُ يصل بعده، والوجوهُ تحلّ وجهاً وجهاً بلا حدث —
       ونافذةُ الطباعة كانت تطبع الترتيبَ المقيس قبلها وآخرُ الوصفة مخفيٌّ تحت مربّعها، بلا فائضٍ يُقال والسجلُّ «انطبعت». */
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit, { logo: true });
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(10000, E.imgArrive);
      await E.at(11000, () => E.face("cairo"));
      await E.at(13000, () => { E.face("ruqaa"); E.load(); });
      await E.at(20000);
      ck("الشعارُ يصل بعد القسريّ والوجوهُ تتوالى (التحميلُ محجوبٌ بها): نافذةُ الطباعة تنتظر الخطوطَ وتقيس من جديد — لا سطرَ مخفيّاً تحت مربّع الوصفة",
        E.prints.length === 1 && E.prints[0].hidden === 0 && E.prints[0].fonts && E.told.join() === "print@13000", JSON.stringify([E.prints, E.told]));
    }
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit, { logo: true });
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(10000, () => E.face("cairo"));
      await E.at(30000);
      ck("  ووجهٌ وصل والآخرُ والشعارُ معلَّقان: تنتظر الخطوطَ بسقفها (٤ ثوانٍ) ثمّ تطبع ما قاسته لحظتَها — لا سطرَ مخفيّاً",
        E.prints.length === 1 && E.prints[0].hidden === 0 && E.prints[0].t === 16150 && E.told.join() === "print@16000", JSON.stringify([E.prints, E.told]));
    }
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit);
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(16050, () => E.face("cairo"));
      await E.at(30000);
      ck("  ووجهٌ يحلّ بين القرار والطباعة (١٥٠ م.ث): يُقاس ثانيةً قبل print() مباشرةً", E.prints.length === 1 && E.prints[0].hidden === 0 && E.prints[0].t === 16150, JSON.stringify([E.prints, E.told]));
    }
    {
      const E = makeEnv(mkHtml(S70, { print: true }), edit, { logo: true, arriveDuringPrint: true });
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(9100, E.fonts);
      await E.at(30000);
      ck("  وصورةٌ لم تصل حتى القرار تُخفى: وصولُها أثناء حوار الطباعة لا يحرّك سطراً", E.prints.length === 1 && E.prints[0].hidden === 0 && E.prints[0].afterHidden === 0, JSON.stringify(E.prints));
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(300, E.preOk);
      await E.at(9010, E.css);
      await E.at(10000, () => E.face("cairo"));
      await E.at(10300);
      const h = E.hiddenNow();
      ck("المعاينة: وجهٌ يحلّ محلَّ الاحتياطيّ بلا حدث بعد القسريّ (والآخرُ معلَّق فلا loadingdone) ⇒ يُعاد الترتيبُ نهائياً خلال ربع ثانية",
        h === 0 && E.msgs.some((m) => m.final && m.t > 10000 && m.t <= 10250), `${h} ${fmt(E.msgs)}`);
    }
    {
      const E = makeEnv(mkHtml(S70), edit, { logo: true });
      await E.at(9200);
      await E.at(10000, E.imgArrive);
      ck("  وصورةٌ تصل بعد القسريّ وحدثُ التحميل لم يأتِ ⇒ يُعاد الترتيبُ بحدثها هي (لا أسطرَ مخفيّة تحت الشعار)", E.hiddenNow() === 0 && E.msgs.some((m) => m.final && m.t === 10000), fmt(E.msgs));
    }
    {
      const E = makeEnv(mkHtml(S70), edit);
      await E.at(9200);
      await E.at(11000, E.load);
      await E.at(11500, E.preOk);
      await E.at(11600, E.css);
      await E.at(11700, E.fonts);
      ck("  وتحميلٌ بعد القسريّ يعيد الترتيبَ ولا يضيف ورقةَ الخطوط (المقيسُ بالقسريّ لا يتبدّل بخطوطٍ بلا قياس)",
        E.rxf().length === 0 && !E.M.fonts && fmt(E.msgs) === JSON.stringify(["p4@4000", "F4@9000", "F4@11000"]), `${E.rxf().length} ${fmt(E.msgs)}`);
    }
    {
      /* الخطُّ الحقيقيّ أضيقُ من الاحتياطيّ: المؤقّتُ فاض وصغّر الخطَّ لحدّه، والنهائيُّ بخطوطه يتّسع — الإعادةُ تمسح الفائضَ وترجّع الحجمَ
         من أوّله (كان «يُعاد من أوّله» يُفحص بعدد الأسطر وحده فمرّ فائضٌ باقٍ وحجمٌ لا يُرجَع). */
      const body = "x".repeat(1200);
      const E = makeEnv(mkHtml(body), edit, { kPer: -0.075 });
      await E.at(5, E.preOk);
      await E.at(10, E.load);
      await E.at(12, E.css);
      await E.at(1000);
      const before = [E.root.getAttribute("data-overflow"), E.fs()];
      await E.at(2500, E.fonts);
      await E.at(3000);
      const Fr = makeEnv(mkHtml(body), edit, { kPer: -0.075 });
      Fr.fontsNow();
      Fr.win.__rxLayout(true);
      ck("  وخطٌّ أضيقُ من الاحتياطيّ: الترتيبُ النهائيّ بعد المؤقّت يمسح «فائض» المؤقّت ويرجّع حجمَ الخطّ كترتيبٍ طازج",
        before[0] === "1" && E.root.getAttribute("data-overflow") === null && E.fs() === Fr.fs() && E.fs() !== before[1], `${JSON.stringify(before)} → ${E.root.getAttribute("data-overflow")} ${E.fs()} (طازج ${Fr.fs()})`);
    }
  }
  await suite(undefined, check);
  const swapJs = (from, to) => (js) => (js.includes(from) ? js.split(from).join(to) : js);
  const MUT = [
    ["إعادةٌ تُبقي صفحةً قديمة (i>1)", swapJs("for(var i=all.length-1;i>0;i--)", "for(var i=all.length-1;i>1;i--)")],
    ["الإعادةُ لا ترجّع الأسطرَ الأصلية", swapJs("else b.innerHTML=pristine;", ";")],
    ["مؤقّتٌ فوريّ عند التحميل (وميضُ الجولة الثالثة)", swapJs("addFonts();\nsetTimeout(function(){if(root.getAttribute('data-final')!=='1')run(false);},400);", "run(false);addFonts();")],
    ["القسريُّ لا يطبّق خطوطَ الـpreload", swapJs("else if(!lk&&preOk())addFonts();", "")],
    ["وصولُ الخطوط بعد القسريّ لا يعيد الترتيب", swapJs("if(!settling&&(forced||(loaded&&css)))run(true);", "if(loaded&&(css||forced)&&!settling)run(true);")],
    ["ورقةٌ لم تصل لا تُشال عند القسريّ", swapJs("if(!css&&lk&&lk.parentNode)lk.parentNode.removeChild(lk);else ", "")],
    ["تحميلٌ بعد القسريّ لا يعيد الترتيب", swapJs("if(forced){run(true);return;}", "if(forced)return;")],
    ["الطباعةُ لا تنتظر التحميلَ بعد القسريّ", swapJs("if(loaded){fire();return;}setTimeout(fire,3000);", "fire();")],
    ["الفائضُ يُطبع", swapJs("return !root.getAttribute('data-overflow');}", "return true;}")],
    ["الطباعةُ لا تقيس من جديد (نسخةُ الجولة الرابعة)", swapJs("if(window.__rxLayout)window.__rxLayout(true);return !root", "return !root")],
    ["الطباعةُ لا تنتظر خطوطاً تصل", swapJs("if(f&&f.ready&&f.status==='loading'){f.ready.then(go2,go2);setTimeout(go2,4000);}else go2();", "go2();")],
    ["صورةٌ لم تصل لا تُخفى عند الطباعة", swapJs("im[i].style.display=im[i].complete?'':'none';", ";")],
    ["صورةٌ تصل بعد القسريّ لا تُسمع بحدثها", swapJs("im[j].addEventListener('load',late);im[j].addEventListener('error',late);", ";")],
    ["لا مراقبةَ للقياس والخطوطُ تصل", swapJs("run(true);setTimeout(watch,250);}},9000);", "run(true);}},9000);")],
    ["تحميلٌ بعد القسريّ يضيف ورقةَ الخطوط", swapJs("if(forced){run(true);return;}", "if(forced){addFonts();run(true);return;}")],
    ["نافذةُ الطباعة لا تُغلق بعدها", swapJs("window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},250);});", "")],
    ["الإعادةُ لا تمسح الفائض", swapJs("root.removeAttribute('data-overflow');var b=", "var b=")],
    ["الإعادةُ لا ترجّع حجمَ الخطّ", swapJs("fs=max;b.style.fontSize=fs+'pt';", "fs=max;")],
  ];
  for (const [name, edit] of MUT) {
    let caught = 0, applied = false;
    const ed = (js) => { const o = edit(js); if (o !== js) applied = true; return o; };
    try { await suite(ed, (_n, ok) => { if (!ok) caught++; }); } catch { caught = -1; }
    check(`  طفرة «${name}» تُسقط فحصاً`, applied && caught !== 0, `applied=${applied} caught=${caught}`);
  }
}

/* ── ط) عناوينُ الورقة العربية والتعافي بسلوكهما: خطّافُ useRxLabels مرسوماً (react-mini) بساعةٍ وتحميلٍ بيد الفحص، وrecoverFromStaleShell
   بمخبأٍ وخدمةٍ مزيَّفين. كان «أعد المحاولة» يُفحص بنصٍّ سالبٍ يطابق صيغةَ الجولة الثالثة وحدها (صيغتان شائعتان مرّتا)، وتنزيلٌ بطيءٌ
   يُقال «تعذّر»، والتحديثُ يُحمَّل فوق نصٍّ كُتب أثناء إلغاء الخدمة (تدقيقٌ خامس). ── */
console.log("▸ عناوينُ الورقة والتعافي بسلوكهما: «تعذّر» لا تُمسح بإعادة المحاولة، والبطيءُ ليس «تعذّر»، والتحديثُ لا يُحمَّل فوق نصٍّ كُتب أثناءه");
{
  const SH_FILE = "src/components/rx/rxShared.ts";
  const shRe = new RegExp(`[\\\\/]${SH_FILE.split("/").join("[\\\\/]")}$`);
  const STUBS_L = {
    "react-i18next": "export const useTranslation = () => ({ t: (k) => k, i18n: { language: 'en', getFixedT: () => (k) => k } }); export const initReactI18next = {};",
    "@/i18n": "export const ensureOwned = (...a) => globalThis.__lbl('owned', ...a); export const ensureDictionary = (...a) => globalThis.__lbl('dict', ...a); export default {};",
    "@/lib/appUpdate": "export const recoverFromStaleShell = async () => true; export const recoveryPending = () => !!globalThis.__parked;",
    "@/lib/settings": "export const getClinicLogo = () => null, getClinicName = () => '', getClinicSocials = () => ({}), getClockFormat = () => '12', getWorkHours = () => ({});",
    "@/lib/storeLib": "export const productImageUrl = (p) => p;",
    "@/lib/errors": "export const describeDbError = () => '';",
    "@/lib/supabase": "export const supabase = null;",
    "@/lib/rxApi": "export const rxApi = {}; export const isRxMissing = () => false;",
  };
  const loadLabels = async (edit) => {
    const built = await esbuild.build({
      stdin: { contents: `export { useRxLabels, RX_LABELS_STUCK_MS } from "./${SH_FILE}";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: "rx-labels.tsx", loader: "tsx" },
      bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
      define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
      plugins: [{
        name: "rx-labels-stubs",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUBS_L, a.path) ? { path: a.path, namespace: "stub" } : undefined));
          b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS_L[a.path], loader: "js" }));
          if (edit) b.onLoad({ filter: shRe }, (a) => ({ contents: edit(readFileSync(a.path, "utf8")), loader: "ts" }));
        },
      }],
    });
    const d = mkdtempSync(path.join(tmpdir(), "rx-lbl-"));
    const f = path.join(d, "m.mjs");
    writeFileSync(f, built.outputFiles[0].text);
    return import(pathToFileURL(f).href).finally(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
  };
  const tickR = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  /* ساعةٌ لمؤقّتات الخطّاف (window.setTimeout/setInterval) بيد الفحص. */
  const W = globalThis.window, saved = { st: W.setTimeout, ct: W.clearTimeout, si: W.setInterval, ci: W.clearInterval };
  const clk = { now: 0, q: [], n: 0 };
  W.setTimeout = (f, ms) => { clk.q.push({ at: clk.now + (ms || 0), f, id: ++clk.n }); return clk.n; };
  W.clearTimeout = (id) => { clk.q = clk.q.filter((x) => x.id !== id); };
  W.setInterval = (f, ms) => { const id = ++clk.n; const arm = (at) => clk.q.push({ at, f: () => { arm(clk.now + ms); f(); }, id }); arm(clk.now + ms); return id; };
  W.clearInterval = W.clearTimeout;
  const advance = async (ms) => {
    const to = clk.now + ms;
    for (;;) {
      clk.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = clk.q[0];
      if (!t || t.at > to) break;
      clk.q.shift();
      clk.now = t.at;
      t.f();
      await tickR();
    }
    clk.now = to;
    await tickR();
  };
  async function labelsSuite(M, ck) {
    const STUCK = M.RX_LABELS_STUCK_MS;
    const Probe = () => { globalThis.__r = M.useRxLabels("ar"); return null; };
    const snap = () => ({ ready: globalThis.__r.ready, failed: globalThis.__r.failed, slow: globalThis.__r.slow });
    const run = async (lbl, parked, steps) => {
      clk.q = []; clk.now = 0;
      globalThis.__lbl = lbl;
      globalThis.__parked = parked;
      const ui = M.mount(M.React.createElement(Probe));
      await tickR();
      try { return await steps(); } finally { ui.unmount(); await tickR(); }
    };
    {
      let attempt = 0;
      const got = await run((w) => { if (w === "owned") attempt++; return attempt === 1 ? Promise.reject(new Error("chunk")) : new Promise(() => {}); }, false, async () => {
        const a = snap();
        globalThis.__r.retry();
        const b = snap();
        await tickR();
        const c = snap();
        return { a, b, c };
      });
      ck("قطعةُ القاموس فشلت ⇒ «تعذّر»، و«أعد المحاولة» لا تُخفيه — لا لحظةَ الضغط ولا والمحاولةُ الثانية معلَّقة (القطعةُ لا تصل بنفس الصفحة)",
        got.a.failed && !got.a.slow && got.b.failed && got.c.failed && !got.c.ready, JSON.stringify(got));
    }
    {
      const got = await run(() => new Promise(() => {}), false, async () => {
        await advance(STUCK - 1);
        const a = snap();
        await advance(1);
        const b = snap();
        globalThis.__parked = true;
        await advance(1000);
        const c = snap();
        return { a, b, c };
      });
      ck("  وتنزيلٌ بطيءٌ بلا تعافٍ ينتظر ⇒ «بطيء» بعد مهلته لا «تعذّر» (تحديثٌ كان يرمي ما نزل)، ثمّ تعافٍ وقف خلف نصٍّ ممسوك ⇒ «تعذّر» خلال ثانية",
        !got.a.slow && !got.a.failed && got.b.slow && !got.b.failed && got.c.failed && !got.c.slow, JSON.stringify(got));
    }
    {
      let open;
      const p = new Promise((r) => { open = r; });
      const got = await run(() => p, false, async () => {
        await advance(STUCK);
        const a = snap();
        open();
        await tickR();
        const b = snap();
        return { a, b };
      });
      ck("  و«بطيء» يزول حين يصل القاموس (جاهز، بلا «تعذّر»)", got.a.slow && got.b.ready && !got.b.slow && !got.b.failed, JSON.stringify(got));
    }
    {
      const got = await run(() => new Promise(() => {}), true, async () => { await advance(STUCK); return snap(); });
      ck("  والتعافي واقفٌ عند المهلة (القطعةُ فشلت والنصُّ ممسوك) ⇒ «تعذّر» فوراً", got.failed && !got.slow, JSON.stringify(got));
    }
  }
  try {
    await labelsSuite(await loadLabels(), check);
    const swapL = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`الطفرة لم تجد نصَّها: ${from.slice(0, 50)}`); return s.split(from).join(to); };
    const MUT_L = [
      ["«أعد المحاولة» تمسح «تعذّر» بنداءها", swapL("const retry = useCallback(() => setN((x) => x + 1), []);", "const retry = useCallback(() => { setFailed(false); setN((x) => x + 1); }, []);")],
      ["«أعد المحاولة» تمسح «تعذّر» ببداية الأثر", swapL("const timer = window.setTimeout(", "setFailed(false);\n    const timer = window.setTimeout(")],
      ["البطيءُ «تعذّر» (نسخةُ الجولة الرابعة)", swapL("(failed || (stuck && parked))", "(failed || stuck)")],
      ["التعافي لا يُسأل عنه بعد المهلة", swapL("const iv = window.setInterval(check, 1000);", "const iv = 0;")],
    ];
    for (const [name, edit] of MUT_L) {
      let caught = 0;
      try { await labelsSuite(await loadLabels(edit), (_n, ok) => { if (!ok) caught++; }); } catch { caught = -1; }
      check(`  طفرة «${name}» تُسقط فحصاً`, caught > 0, `caught=${caught}`);
    }
  } finally {
    Object.assign(W, { setTimeout: saved.st, clearTimeout: saved.ct, setInterval: saved.si, clearInterval: saved.ci });
  }

  /* التعافي: المسحُ ثمّ إعادةُ الانتظار قبل التحميل — نصٌّ كُتب أثناء إلغاء الخدمة (أوّلُ زيارة: ٣٢ ثانية مقيسة) لا يُحمَّل فوقه. */
  const AU_FILE = "src/lib/appUpdate.ts";
  const auRe = new RegExp(`[\\\\/]${AU_FILE.split("/").join("[\\\\/]")}$`);
  const loadAU = async (edit) => {
    const built = await esbuild.build({
      stdin: { contents: `export * as U from "./${AU_FILE}";\nexport * as F from "./src/lib/inflight.ts";`, resolveDir: process.cwd(), sourcefile: "rx-au.ts", loader: "ts" },
      bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
      plugins: edit ? [{ name: "au-edit", setup(b) { b.onLoad({ filter: auRe }, (a) => ({ contents: edit(readFileSync(a.path, "utf8")), loader: "ts" })); } }] : [],
    });
    const d = mkdtempSync(path.join(tmpdir(), "rx-au-"));
    const f = path.join(d, "m.mjs");
    writeFileSync(f, built.outputFiles[0].text);
    return import(pathToFileURL(f).href).finally(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function auSuite({ U: UU, F: FF }, ck) {
    const reloads = [];
    const prev = { loc: W.location, ss: globalThis.sessionStorage, caches: globalThis.caches };
    let unreg = null;
    W.location = { reload: () => reloads.push(1) };
    globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.caches = { keys: async () => ["workbox-precache-v2"], delete: async () => true };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => [{ unregister: () => new Promise((r) => { unreg = r; }) }] } });
    try {
      const p = UU.recoverFromStaleShell();
      for (let i = 0; i < 20 && !unreg; i++) await sleep(10);
      const pending = UU.recoveryPending();
      const rel = FF.holdUpdates(Infinity);
      unreg(true);
      await sleep(700);
      const during = reloads.length;
      rel();
      await sleep(500);
      const ok = await Promise.race([p, sleep(1000).then(() => "timeout")]);
      ck("التعافي ينتظر ثانيةً بعد إلغاء الخدمة: نصٌّ كُتب أثناءه (نموذجٌ ممسوك) لا يُحمَّل فوقه، ويُحمَّل حين يُفلت — و«تعافٍ بالطريق» يُقال",
        !!unreg && pending && during === 0 && reloads.length === 1 && ok === true, JSON.stringify({ pending, during, reloads: reloads.length, ok }));
    } finally {
      W.location = prev.loc;
      globalThis.sessionStorage = prev.ss;
      globalThis.caches = prev.caches;
      delete navigator.serviceWorker;
    }
  }
  await auSuite(await loadAU(), check);
  {
    let caught = 0;
    try {
      await auSuite(await loadAU((s) => {
        const from = "await waitForWrites();\n    if (offline()) { inFlight = null; return false; }\n    window.location.reload();";
        if (!s.includes(from)) throw new Error("الطفرة لم تجد نصَّها");
        return s.split(from).join("window.location.reload();");
      }), (_n, ok) => { if (!ok) caught++; });
    } catch { caught = -1; }
    check("  طفرة «الفحصُ مرّةً قبل المسح وحده (نسخةُ الجولة الرابعة)» تُسقط فحصاً", caught > 0, `caught=${caught}`);
  }
}

console.log(fails ? `\n✗ rx-pad-test: ${passes} نجح، ${fails} فشل` : `\n✓ rx-pad-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
