/* ============================================================================
 * فحصُ انقسام القاموس بسلوكه — يحمّل `src/i18n/index.ts` مبنيّاً بحزمٍ منفصلة
 * (كما يبنيه Vite: الباردُ ملفٌّ مستقلّ) ويسأل i18next نفسَه (م٠·١).
 *
 * الحارسُ (`i18n-split-guard`) يقرأ الشِفرةَ والخريطة؛ هذا يشغّلها:
 *   ١) الإقلاعُ بالعربية: النطاقاتُ الحارّة تُترجَم فوراً.
 *   ٢) بعد `loadColdAr` القاموسُ المدموج = ar.json **حرفاً بحرف** — لا نطاقَ
 *      ناقص، ولا دمجَ يدوس قيمةً حارّة.
 *   ٣) من لغتُه الإنكليزية لا يُنزَّل له الباردُ أصلاً — ولا يُطلب منه.
 *   ٤) فشلُ التنزيل **يرفض** (لا يُرسم بنصف نصوص) ويُصفّر الوعد، فالنداءُ
 *      التالي يعيد المحاولة وينجح.
 *   ٥) السورانيةُ تسقط للعربية فتحتاج الباردَ.
 *
 *   node scripts/i18n-split-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const AR = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const COLD = /export default\s*\{([^}]*)\}/.exec(readFileSync("src/i18n/arCold.ts", "utf8"))[1]
  .split(",").map((x) => x.trim()).filter(Boolean);

/* داخل node_modules لا /tmp: الحزمةُ تترك react خارجياً فلازم يراها node. */
const root = mkdtempSync(join(process.cwd(), "node_modules", ".vp-split-"));
let seq = 0;

/** يبني نسخةً جديدةً بمجلّدٍ خاصّ (فلا يعيد `import` نسخةً مخزّنة) ويحمّلها. */
async function boot(stored) {
  const out = join(root, String(seq++));
  await esbuild.build({
    entryPoints: ["src/i18n/index.ts"], bundle: true, format: "esm", splitting: true,
    outdir: out, platform: "neutral", write: true,
    external: ["react", "react-dom", "html-parse-stringify"],
    loader: { ".json": "json" }, logLevel: "silent",
  });
  writeFileSync(join(out, "_hps.mjs"), "export default { parse: () => [], stringify: () => \"\" };\n");
  for (const f of readdirSync(out).filter((f) => f.endsWith(".js"))) {
    const p = join(out, f);
    writeFileSync(p, readFileSync(p, "utf8").replace(/from\s*"html-parse-stringify"/g, 'from "./_hps.mjs"'));
  }
  const mem = new Map(stored ? [["vp_lang", stored]] : []);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: () => null, get length() { return mem.size; },
  };
  const el = { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } };
  globalThis.document = {
    documentElement: el, head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  const toasts = [];
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent(ev) { toasts.push(ev?.detail); return true; } };

  const chunks = readdirSync(out).filter((f) => f.endsWith(".js") && f !== "index.js");
  const coldChunk = chunks.find((f) => /^arCold-/.test(f));
  return { out, coldChunk, chunks, mem, el, toasts, load: () => import(pathToFileURL(join(out, "index.js")).href) };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const coldNs = (i18n) => Object.keys(AR).filter((ns) => i18n.getResource("ar", "translation", ns) === undefined);

try {
  console.log("▸ الإقلاعُ بالعربية");
  const a = await boot(null);
  check("الباردُ حزمةٌ مستقلّة بالبناء (لا مدموجٌ بالمدخل)", !!a.coldChunk, `الحزم: ${a.chunks.join(" ")}`);
  const A = await a.load();
  const i18n = A.default;
  check("اللغةُ عربية", i18n.language === "ar", i18n.language);
  const hotKey = "nav." + Object.keys(AR.nav)[0];
  check(`الحارُّ يُترجَم فوراً (${hotKey})`, i18n.t(hotKey) === AR.nav[Object.keys(AR.nav)[0]], i18n.t(hotKey));
  await A.loadColdAr();
  const merged = i18n.getResourceBundle("ar", "translation");
  check("بعد loadColdAr القاموسُ المدموج = ar.json حرفاً بحرف", isDeepStrictEqual(merged, AR),
        `ناقص: ${coldNs(i18n).join(" ") || "—"}`);
  const coldKey = "cages." + Object.keys(AR.cages)[0];
  check(`والباردُ يُترجَم (${coldKey})`, i18n.t(coldKey) === AR.cages[Object.keys(AR.cages)[0]], i18n.t(coldKey));
  const p1 = A.loadColdAr(), p2 = A.loadColdAr();
  check("النداءاتُ المتكرّرة تتشارك وعداً واحداً", p1 === p2);
  check("needsColdAr: ar نعم · en لا · ckb نعم (تسقط للعربية)",
        A.needsColdAr("ar") && !A.needsColdAr("en") && A.needsColdAr("ckb"));

  console.log("▸ الإقلاعُ بالإنكليزية");
  const e = await boot("en");
  const E = await e.load();
  await E.i18nReady; await tick();
  const missing = coldNs(E.default);
  check(`من اختار الإنكليزية لا يُنزَّل له الباردُ (${COLD.length} نطاقاً غائباً)`,
        COLD.length > 0 && isDeepStrictEqual([...missing].sort(), [...COLD].sort()),
        `محمّلٌ منها: ${COLD.filter((n) => !missing.includes(n)).join(" ") || "—"}`);

  console.log("▸ فشلُ التنزيل");
  const f = await boot("en");
  const hidden = join(f.out, f.coldChunk + ".off");
  renameSync(join(f.out, f.coldChunk), hidden);
  const F = await f.load();
  await F.i18nReady;
  let rejected = false;
  await F.loadColdAr().catch(() => { rejected = true; });
  check("فشلُ التنزيل يرفض (فالشاشةُ لا تُرسم بنصف نصوص)", rejected);
  const before = { lang: F.default.language, stored: f.mem.get("vp_lang"), dir: f.el.dir };
  await F.setLang("ar");
  check("وتبديلُ اللغة عند فشله لا يغيّر شيئاً: لا لغة ولا اتجاه ولا تفضيلٌ محفوظ",
        F.default.language === before.lang && f.mem.get("vp_lang") === before.stored && f.el.dir === before.dir,
        JSON.stringify({ lang: F.default.language, stored: f.mem.get("vp_lang"), dir: f.el.dir }));
  check("  ويقولها بإشعار", f.toasts.some((x) => x?.tone === "error" && /./.test(x?.title ?? "")), JSON.stringify(f.toasts));
  renameSync(hidden, join(f.out, f.coldChunk));
  let second = "ok";
  await F.loadColdAr().catch((err) => { second = String(err?.code ?? err); });
  check("والوعدُ يُصفَّر: المحاولةُ التالية تنزّل وتنجح", second === "ok" && coldNs(F.default).length === 0,
        second !== "ok" ? second : `ناقص: ${coldNs(F.default).length}`);

  console.log("▸ آخرُ اختيارٍ يفوز");
  await Promise.all([F.setLang("ar"), F.setLang("en")]);
  check("العربية ثم الإنكليزية فوراً ⇒ إنكليزيةٌ بنصّها واتجاهها وحفظها",
        F.default.language === "en" && f.mem.get("vp_lang") === "en" && f.el.dir === "ltr",
        JSON.stringify({ lang: F.default.language, stored: f.mem.get("vp_lang"), dir: f.el.dir }));
  await F.setLang("ar");
  check("والعربيةُ وحدَها ⇒ عربيةٌ بنصّها واتجاهها وحفظها",
        F.default.language === "ar" && f.mem.get("vp_lang") === "ar" && f.el.dir === "rtl",
        JSON.stringify({ lang: F.default.language, stored: f.mem.get("vp_lang"), dir: f.el.dir }));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${fails ? "✗" : "✓"} i18n-split-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
