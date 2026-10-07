/* ============================================================================
 * «الأسعارُ تغيّرت» بسلوكه — src/lib/priceSync.ts + priceGen.ts، وحرّاسُ البيع بنصّهم.
 * ما يحرسه (تدقيقٌ عدائيّ على 0226):
 *   • أوّلُ سؤالٍ أساسٌ صامت — إلا إن فاته سؤالٌ قبله (تابٌ مخفيّ، شبكة): يُعامل تغيّراً.
 *   • كلُّ تغيّرٍ يرفع الجيل، والقائمةُ تُختم بجيل بدء جلبها — أقدمُ = لا بيع منها.
 *   • قراءةُ خدماتٍ تعثّرت تبقى «قديمة» حتى تنجح، وتُعاد بكلّ سؤال، ويُبثّ نجاحُها.
 *   • اللقطاتُ تُعلَّم قديمةً لا تُرمى (فشلُ التحديث بعدها شريطٌ لا شاشةُ فشل).
 *   • والبيعُ: السؤالُ تحت قفلٍ وبمهلة، والسلّةُ المتغيّرة أثناءه لا تُباع.
 *
 *   node scripts/price-sync-test.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };

// نافذةٌ ووثيقةٌ صغيرتان: الأحداثُ تُعدّ، والظهورُ يُبدَّل.
const events = [];
globalThis.window = {
  dispatchEvent: (e) => { events.push(e.detail); return true; },
  setInterval: () => 1, clearInterval: () => {}, addEventListener: () => {}, removeEventListener: () => {},
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.document = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };

const ctl = { epoch: 0, epochFails: false, svcFails: false, svcCalls: 0, stale: [] };
globalThis.__ps = ctl;
const stubs = {
  name: "ps-stubs",
  setup(b) {
    const map = {
      "./repo": "export const repo = { priceEpoch: async () => { if (globalThis.__ps.epochFails) throw new Error('net'); return globalThis.__ps.epoch; } };",
      "./services": "export async function refreshServices() { globalThis.__ps.svcCalls++; if (globalThis.__ps.svcFails) throw new Error('net'); return {}; }",
      "./swrCache": "export function markStale(k) { globalThis.__ps.stale.push(k); }",
      "./prefetchData": "export const retailKey = (c) => `retail:${c ?? 'self'}`;",
    };
    b.onResolve({ filter: /^\.\/(repo|services|swrCache|prefetchData)$/ }, (a) => ({ path: a.path, namespace: "ps" }));
    b.onLoad({ filter: /.*/, namespace: "ps" }, (a) => ({ contents: map[a.path], loader: "js" }));
  },
};
const dir = mkdtempSync(join(tmpdir(), "psync-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/priceSync.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", plugins: [stubs] });
const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

console.log("▸ الأساسُ والتغيّر");
ctl.epoch = 5;
let r = await m.checkPriceEpoch("c1");
check("أوّلُ سؤالٍ ناجحٍ بوقته أساسٌ صامت: لا تغيّر، لا حدث، والجيلُ كما هو", r?.changed === false && events.length === 0 && m.priceGen() === 0, { r, events, g: m.priceGen() });
ctl.epoch = 6;
r = await m.checkPriceEpoch("c1");
check("زاد العدّاد ⇒ تغيّر: حدثٌ واحد، والجيلُ ١، والخدماتُ قُرئت", r?.changed === true && events.length === 1 && m.priceGen() === 1 && ctl.svcCalls === 1, { r, n: events.length, g: m.priceGen() });
check("  واللقطتان عُلِّمتا قديمتين (لا رُميتا)", ctl.stale.includes("retail:c1") && ctl.stale.includes("inv_c1"), ctl.stale);
r = await m.checkPriceEpoch("c1");
check("نفسُ العدّاد ⇒ لا شيء", r?.changed === false && events.length === 1 && m.priceGen() === 1);

console.log("▸ قائمةٌ بجيلها");
m.noteListGen("retail:c1", 0);
check("قائمةٌ جُلبت قبل التغيّر (جيل ٠) أقدمُ من الجيل الآن", m.listGenOf("retail:c1") < m.priceGen());
m.noteListGen("retail:c1", m.priceGen());
check("  وبعد جلبٍ بدأ بعده ليست أقدم", !(m.listGenOf("retail:c1") < m.priceGen()));
check("  ولقطةٌ لا نعرف جيلَها (-1) تُعامَل قديمة", m.listGenOf("never") === -1);

console.log("▸ الخدماتُ تتعثّر");
ctl.svcFails = true; ctl.epoch = 7;
r = await m.checkPriceEpoch("c1");
check("تغيّرٌ وقراءةُ الخدمات تعثّرت ⇒ «الخدماتُ قديمة» والحدثُ يقولها", r?.changed === true && m.servicesStaleNow() === true && events.at(-1)?.servicesOk === false);
const calls = ctl.svcCalls;
r = await m.checkPriceEpoch("c1");
check("  تبقى قديمة وتُعاد بكلّ سؤال (لا تُنسى لأن العدّادَ خُتم)", m.servicesStaleNow() === true && ctl.svcCalls === calls + 1 && r?.changed === false);
ctl.svcFails = false;
const before = events.length;
await m.checkPriceEpoch("c1");
check("  ونجاحُها يرفع العلَم ويُبثّ (الشاشةُ تقرأ الكتالوجَ الطازج)", m.servicesStaleNow() === false && events.length === before + 1 && events.at(-1)?.servicesOk === true);

console.log("▸ أساسٌ فاته سؤال");
m.resetPriceEpoch();
const g0 = m.priceGen();
document.visibilityState = "hidden";
const stop = m.watchPriceEpoch("c1");
document.visibilityState = "visible";
ctl.epoch = 9;
r = await m.checkPriceEpoch("c1");
stop();
check("التابُ كان مخفيّاً عند أوّل سؤال ⇒ أوّلُ جوابٍ بعده تغيّرٌ لا أساسٌ صامت", r?.changed === true && m.priceGen() === g0 + 1, { r, g: m.priceGen(), g0 });
m.resetPriceEpoch();
ctl.epochFails = true;
r = await m.checkPriceEpoch("c1");
check("  وسؤالٌ تعثّر يرجع null ولا يعلن تغيّراً", r === null);
ctl.epochFails = false;
const g1 = m.priceGen();
r = await m.checkPriceEpoch("c1");
check("  ثمّ أوّلُ جوابٍ ناجحٍ بعده تغيّر (البياناتُ قد تسبق رفعاً لا نعرفه)", r?.changed === true && m.priceGen() === g1 + 1);
check("الجيلُ يزيد بالتصفير (قائمةُ عيادةٍ سابقة لا تصير طازجة)", (() => { const a = m.priceGen(); m.resetPriceEpoch(); return m.priceGen() === a + 1; })());

console.log("▸ حرّاسُ البيع بنصّهم (SaleBuilder)");
const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
const co = sb.slice(sb.indexOf("const checkout = async (ack: CheckoutAck = {})"), sb.indexOf("const rep = cart.filter((l) => repriced.has(l.id));"));
const lockAt = co.indexOf("checkingRef.current = true;"), awaitAt = co.indexOf("await withTimeout(checkPriceEpoch(clinicId)");
check("السؤالُ تحت القفل وبمهلة (لا ضغطةٌ عالقة تبيع سلّةً قديمة بعد بيعةٍ تمّت)", lockAt > 0 && awaitAt > lockAt && co.includes("if (inFlightRef.current || checkingRef.current) return;"));
check("  والسلّةُ المتغيّرة أثناءه لا تُباع، ولا تغيّرٌ عُرف أثناءه يمرّ", co.indexOf("if (cartRef.current !== cart) return;") > awaitAt && co.includes("priceGen() !== genAtClick"));
check("  والقائمةُ تُحكم بجيلها لحظةَ السؤال لا بـ«وصلت قائمةٌ أخرى»", co.includes("if (listStale())") && !sb.includes("pendingListRef"));
check("  وحارسُ الخدمات من الوحدة لا من حالة الشاشة (ينجو من إعادة التركيب)", co.includes("servicesStaleNow()"));
const rs = readFileSync("src/pages/RetailSales.tsx", "utf8"), inv = readFileSync("src/pages/Inventory.tsx", "utf8");
check("مالكا القائمة يسمعان الحدثَ ويختمان الجيل (الكاشير والجملة)", [rs, inv].every((s) => s.includes("PRICES_EVENT") && s.includes("noteListGen(") && s.includes("listGen={listGen}")));

console.log(fail === 0 ? `✓ price-sync: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
