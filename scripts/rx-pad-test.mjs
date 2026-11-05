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
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
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
      'export { encodeClinical } from "./src/lib/clinicalRecord.ts";',
      'export { registerConfigReadOnlyChecker } from "./src/lib/clinicSync.ts";',
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
const { L, P, X, A, encodeClinical, registerConfigReadOnlyChecker } = mod;
if (!L || !P || !X || !A || !registerConfigReadOnlyChecker) { console.error("✗ rx-pad-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.code ?? e.name ?? e.message; } };

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
  const big = L.cleanRxPad({ title: "x".repeat(500), address: "‮abc\u0007  def", subtitle: "a\nb" });
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
    a5.includes("data-overflow") && a5.includes("cloneNode(true)") && a5.includes("split(/(\\s+)/)") && a5.includes("data-pages") && a5.includes("document.fonts.ready"));
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
  check("الإلغاءُ للمدير: الطبيبُ يُرفض (rx_void_manager)", await errOf(() => api.voidRx(r1.id, "غلط")) === "42501" && (await api.listForPet(pet))[0].voided_at === null);
  as("m1", "admin");
  const v = await api.voidRx(r1.id, "  كُتبت لحيوانٍ ثانٍ  ");
  check("  والمديرُ يلغيها مرّةً — والسببُ منظّف", !!v.voided_at && v.void_reason === "كُتبت لحيوانٍ ثانٍ" && (await api.listForPet(pet))[0].voided_at !== null);
  check("  وإلغاءٌ ثانٍ ⇒ rx_stale (صفرُ صفوف)", await errOf(() => api.voidRx(r1.id, "x")) === "rx_stale");
  as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" });
  check("والمصوّرُ مسيَّج: لا يرى السجلَّ ولا التصميم، ولا يكتب (42501)",
    (await api.listForPet(pet)).length === 0 && (await api.getPad()) === null && await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "42501");
  as("v1", "doctor");
  registerConfigReadOnlyChecker(() => true);
  check("و«القراءة فقط» يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError) — والقراءةُ تبقى",
    await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "ReadOnlyError" && (await api.listForPet(pet)).length === 1);
  registerConfigReadOnlyChecker(() => false);
  quota = 10;
  check("والامتلاءُ يُرمى ولا يُبلع («ما انحفظ» لا «تمّ»)", await errOf(() => api.add({ pet_id: pet, pet_name: "", doctor_name: "", fields: {}, body: "x" })) === "QuotaExceededError"
    && (quota = Infinity, (await api.listForPet(pet)).length === 1));
  quota = Infinity;
}

/* ── هـ) الأسلاك ──────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: القطعةُ كسولة بنطاقها، والطباعةُ داخل الضغطة، ولا autoFocus ولا window.confirm");
{
  const pp = code("src/pages/PetPassport.tsx"), vp = code("src/pages/VisitPage.tsx"), st = code("src/pages/Settings.tsx");
  const lazyRx = /page\(\(\) => import\("@\/components\/rx\/RxPad"\)\.then\(\(m\) => \(\{ default: m\.(RxButton|RxSettingsCard) \}\)\), \["rx"\]\)/;
  check("ملفُّ الحيوان وصفحةُ الحالة والإعدادات تحمّل المالكَ كسولاً بنطاقه (page(…, [\"rx\"]))، ولا استيرادَ ثابتاً",
    lazyRx.test(pp) && lazyRx.test(vp) && lazyRx.test(st) && ![pp, vp, st].some((s) => /from\s*["']@\/components\/rx\//.test(s)));
  check("  والزرُّ لمن يكتب بالسجلّ الطبيّ (editMedical) ولا يراه المالك", /const canRx = !isOwner && can\("editMedical"\)/.test(pp) && /\{canRx && \(/.test(pp) && /const canRx = can\("editMedical"\)/.test(vp));
  check("  وبطاقةُ الإعدادات لمن يملك إدارة الإعدادات", /\{canSettings && <RxCardSlot \/>\}/.test(st));
  const sheet = code("src/components/rx/RxSheet.tsx"), designer = code("src/components/rx/RxDesigner.tsx");
  const printFn = /const print = \(\) => \{([\s\S]*?)\n  \};/.exec(sheet)?.[1] ?? "";
  check("الطباعةُ داخل الضغطة: openRxPrint قبل أيّ await، والحفظُ بعدها",
    !!printFn && printFn.indexOf("openRxPrint(") >= 0 && !/await/.test(printFn.slice(0, printFn.indexOf("openRxPrint("))) && printFn.indexOf("save()") > printFn.indexOf("openRxPrint("));
  check("  وطباعةٌ ثانيةٌ بلا تغيير لا تكتب سجلّاً ثانياً (البصمة)، والفارغةُ لا تُحفظ", /key === savedKey/.test(printFn) && /if \(!clean\.trim\(\)\)/.test(printFn));
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

console.log(fails ? `\n✗ rx-pad-test: ${passes} نجح، ${fails} فشل` : `\n✓ rx-pad-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
