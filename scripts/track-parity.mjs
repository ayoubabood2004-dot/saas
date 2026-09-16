/* ============================================================================
 * تطابقُ قوائم أحداث القياس — ثلاثةُ أطرافٍ لا يجوز أن تنحرف.
 *
 * الحدثُ يمرّ بثلاث بوّابات: نوعُ `LandingEvent` بالمتصفّح، ومجموعةُ `EVENTS`
 * بدالّة الحافة، وقيدُ `landing_events_event_check` بالقاعدة. والحصرُ بثلاثة
 * مواضع **مقصود** (0114): كلٌّ يحمي حين يُنشر الآخرُ بخطأ.
 *
 * لكنّ الانحرافَ بينها **يفشل بصمت**، وهذا ما يجعل الحارسَ ضرورياً لا تجميلاً:
 *   • اسمٌ بالمتصفّح وحدَه ⇒ دالّةُ الحافة تُسقطه بـ204 (لا خطأ).
 *   • اسمٌ بالحافة وحدَه   ⇒ القاعدةُ ترفض الإدراج، و`api/track.ts` يبلع الفشل
 *                            بتصميمه («القياس لا يُسقط تجربة الزائر أبداً»).
 * فبالحالتين يبدو القياسُ شغّالاً وهو يقيس صفراً — ثمّ تُبنى عليه قراراتُ منتج.
 *
 * وهذا ليس فرضاً: خطّةُ ت١ كُتب فيها أنّ «قيدَ الجدول على device وحده» فلا
 * حاجةَ لهجرة. القياسُ على الإنتاج كذّبها — والقيدُ على `event` موجودٌ منذ 0114.
 *
 *   node scripts/track-parity.mjs
 * ==========================================================================*/
import fs from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const set = (a) => [...new Set(a)].sort();
const same = (a, b) => JSON.stringify(set(a)) === JSON.stringify(set(b));
const missing = (a, b) => set(a).filter((x) => !b.includes(x));

/* ── ١) المتصفّح: اتحادُ نوع `LandingEvent` ─────────────────────────────── */
const web = fs.readFileSync("src/lib/track.ts", "utf8");
const typeBlock = /export type LandingEvent\s*=([\s\S]*?);/.exec(web)?.[1];
if (!typeBlock) { console.error("   ✗ track-parity: ما انقرأ نوعُ LandingEvent"); process.exit(1); }
const webEvents = [...typeBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

/* ── ٢) الحافة: مجموعةُ EVENTS ──────────────────────────────────────────── */
const edge = fs.readFileSync("api/track.ts", "utf8");
const edgeBlock = /const EVENTS = new Set\(\[([\s\S]*?)\]\)/.exec(edge)?.[1];
if (!edgeBlock) { console.error("   ✗ track-parity: ما انقرأت مجموعةُ EVENTS"); process.exit(1); }
const edgeEvents = [...edgeBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

/* ── ٣) القاعدة: **آخرُ** قيدٍ يُكتب بالهجرات يفوز ───────────────────────── */
const migDir = "supabase/migrations";
let dbEvents = null, dbFrom = null;
for (const f of fs.readdirSync(migDir).sort()) {
  const sql = fs.readFileSync(`${migDir}/${f}`, "utf8");
  const m = /check\s*\(\s*event\s+in\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
  if (m && /landing_events/.test(sql)) { dbEvents = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]); dbFrom = f; }
}
if (!dbEvents) { console.error("   ✗ track-parity: ما انقرأ قيدُ landing_events من الهجرات"); process.exit(1); }

/* حارسُ الحارس: قائمةٌ فارغةٌ تجعل كلَّ مقارنةٍ تنجح بلا أن تقيس شيئاً. */
if (!webEvents.length || !edgeEvents.length || !dbEvents.length) {
  console.error(`   ✗ track-parity: قائمةٌ فارغة (متصفّح ${webEvents.length}، حافة ${edgeEvents.length}، قاعدة ${dbEvents.length}) — الحارسُ يقيس لا شيء`);
  process.exit(1);
}

console.log(`▸ أحداثُ القياس — متصفّح ${webEvents.length} · حافة ${edgeEvents.length} · قاعدة ${dbEvents.length} (${dbFrom})`);
check("المتصفّحُ والحافةُ نفسُ القائمة", same(webEvents, edgeEvents),
  `بالمتصفّح ولا بالحافة: [${missing(webEvents, edgeEvents)}] · بالحافة ولا بالمتصفّح: [${missing(edgeEvents, webEvents)}]`);
check("  والحافةُ والقاعدةُ نفسُها", same(edgeEvents, dbEvents),
  `بالحافة وترفضه القاعدة: [${missing(edgeEvents, dbEvents)}] · بالقاعدة وتُسقطه الحافة: [${missing(dbEvents, edgeEvents)}]`);

/* وقمعُ المتجر موجودٌ فعلاً — وإلا فالجزءُ الثالث كلُّه بلا قياس. */
const STORE = ["store_view", "store_add", "store_checkout_open", "store_order"];
check("  وأحداثُ قمع المتجر الأربعةُ بالأطراف الثلاثة",
  STORE.every((e) => webEvents.includes(e) && edgeEvents.includes(e) && dbEvents.includes(e)),
  `ناقصٌ: ${STORE.filter((e) => !(webEvents.includes(e) && edgeEvents.includes(e) && dbEvents.includes(e)))}`);

console.log(fails ? `\n✗ track-parity: ${passes} نجحت، ${fails} فشلت` : `\n✓ track-parity: الأطرافُ الثلاثةُ متطابقة (${dbEvents.length} حدثاً)`);
process.exit(fails ? 1 : 0);
