/* ============================================================================
 * فحصُ قياس صيغ المسح (م٣) — `gs1.ts` (التصنيف) و`scanStats.ts` (العدّاد).
 *
 * التصنيفُ: رؤوسُ AIM لعائلة GS1، والفاصلُ FNC1، وGS1 بلا رأسٍ ولا فاصل،
 * والأطوالُ القياسية، وما ليس رمزاً (اسمٌ مكتوب، عربيّ) لا يُعدّ.
 * والعدّاد: صامتٌ، مختومٌ بالعيادة، يرفع مرّةً بالساعة، ويُبقي ما فشل رفعُه.
 *
 *   node scripts/gs1-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.__sent = [];
globalThis.__fail = false;

const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
      "@/lib/repo": "export const repo = { async noteScanShapes(day, counts, samples, clinic) { if (globalThis.__fail) throw new Error('net'); globalThis.__sent.push({ day, counts, samples, clinic }); } };",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency|@\/lib\/repo)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const build = async (entry) => {
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral",
    plugins: [stubs], alias: { "@/lib/utils": "./src/lib/utils.ts", "@/lib/gs1": "./src/lib/gs1.ts" }, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const G = await build("src/lib/gs1.ts");
const S = await build("src/lib/scanStats.ts");

console.log("▸ ١) التصنيف");
const GS = "\u001d";
check("]d2 + GS1 ⇒ gs1_aim (DataMatrix بصيغة GS1)", G.scanShape("]d201062850960008421727053110A123") === "gs1_aim");
check("]C1 ⇒ gs1_aim (GS1-128)", G.scanShape("]C10106285096000842") === "gs1_aim");
check("فاصلُ FNC1 وصل ⇒ gs1_sep", G.scanShape(`010628509600084217270531${GS}10A123`) === "gs1_sep");
check("(01)+١٤+(17)… بلا رأسٍ ولا فاصل ⇒ gs1_ai", G.scanShape("0106285096000842172705311024A123") === "gs1_ai");
check("EAN-13 ⇒ ean13 (الأغلب المتوقَّع)", G.scanShape("6285096000842") === "ean13");
check("  وأرقامٌ عربية تُطبَّع قبل الحكم", G.scanShape("٦٢٨٥٠٩٦٠٠٠٨٤٢") === "ean13");
check("UPC-A / EAN-8 / GTIN-14", G.scanShape("012345678905") === "upca" && G.scanShape("96385074") === "ean8" && G.scanShape("06285096000842") === "gtin14");
check("  و]E0 (AIM لـEAN) يُقشَّر ولا يُعدّ GS1", G.scanShape("]E06285096000842") === "ean13");
check("رقمُ رفٍّ يدويّ ⇒ digits", G.scanShape("247") === null && G.scanShape("24715") === "digits");
check("Code128 بحروف ⇒ alnum", G.scanShape("W90-AB") === "alnum");
check("اسمٌ مكتوب بصندوق المسح لا يُعدّ", G.scanShape("شامبو كلاب") === null && G.scanShape("royal canin") === null);
check("  ولا القصيرُ ولا الفارغ", G.scanShape("12") === null && G.scanShape("") === null && G.scanShape(null) === null);
check("  و١٦ رقماً تبدأ بـ01 ليست GS1 (قصيرةٌ عن معرّفٍ ثانٍ)", G.scanShape("0106285096000842") === "digits");
check("العيّنةُ تُظهر المحارفَ الخفيّة", G.sampleOf(`0106${GS}10`) === "0106<GS>10" && G.sampleOf("a\tb") === "a<9>b");

console.log("▸ ٢) العدّاد");
S.noteScan("6285096000842", "sale", "C1");
S.noteScan("6285096000842", "sale", "C1");
S.noteScan("]d201062850960008421727053110A123", "purchase", "C1");
check("المسحةُ الأولى ترفع فوراً (لم يُرفع شيءٌ قبل) — ثمّ لا شيء قبل ساعة", __sent.length === 1, JSON.stringify(__sent));
await new Promise((r) => setTimeout(r, 10));
const st = JSON.parse(mem.get("vp_scan_shapes_v1"));
const k = Object.keys(st).find((x) => x.startsWith("C1|"));
check("  والباقي محفوظٌ بالجهاز مختوماً بالعيادة واليوم", !!k && st[k].counts["sale:ean13"] === 1 && st[k].counts["purchase:gs1_aim"] === 1, JSON.stringify(st));
check("  والعيّنةُ لـGS1 وحدَه", st[k].samples.length === 1 && st[k].samples[0].startsWith("]d2"));
S.noteScan("شامبو", "purchase", "C1");
S.noteScan("6285096000842", "sale", null);
check("الاسمُ والمسحةُ بلا عيادة لا يُعدّان", JSON.parse(mem.get("vp_scan_shapes_v1"))[k].counts["sale:ean13"] === 1);

S.noteScan("6285096000842", "sale", "C2");
globalThis.__sent = [];
await S.flushScanStats("C1");
check("الرفعُ يرفع دفعاتِ عيادته وحدَها", __sent.length === 1 && __sent[0].clinic === "C1" && __sent[0].counts["sale:ean13"] === 1);
const after = JSON.parse(mem.get("vp_scan_shapes_v1"));
check("  ودفعةُ العيادة الأخرى تبقى لها (جهازٌ مشترك)", Object.keys(after).some((x) => x.startsWith("C2|")) && !Object.keys(after).some((x) => x.startsWith("C1|")));

globalThis.__fail = true;
S.noteScan("6285096000842", "sale", "C1");
await S.flushScanStats("C1");
const kept = JSON.parse(mem.get("vp_scan_shapes_v1"));
const k2 = Object.keys(kept).find((x) => x.startsWith("C1|"));
check("فشلُ الرفع لا يُضيّع العدّ — يرجع للجهاز", !!k2 && kept[k2].counts["sale:ean13"] === 1, JSON.stringify(kept));
globalThis.__fail = false;

mem.set("vp_scan_shapes_v1", "{not json");
let threw = false;
try { S.noteScan("6285096000842", "sale", "C1"); } catch { threw = true; }
check("مخزنٌ تالف لا يكسر المسحة", !threw);

console.log(`\n${fails ? "✗" : "✓"} gs1-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
