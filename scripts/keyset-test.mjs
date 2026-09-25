/* ============================================================================
 * فحصُ الجلب بالمؤشّر القيميّ (keyset) — ط٤ من docs/pos-freshness-plan.md
 *
 * `allPages` كانت تتقدّم **بالموقع**: «من الصفّ ١٠٠١». وحذفٌ بجهازٍ ثانٍ بين
 * الطلبتين يُصعد كلَّ ما بعده خانةً — فيسقط صفٌّ بين الطلبتين، صامتاً: مادّةٌ
 * بالرفّ لا تظهر بالقائمة. صارت تتقدّم **بالمعرّف**: «كلُّ ما بعد آخر ما وصل».
 *
 * والمؤشّرُ يشترط أن يكون `id` الترتيبَ الوحيد بالخادم — فالفرزُ للعرض نزل
 * للواجهة. وشرطُ «لا مشكلةَ مع العيادات» أن يبقى ترتيبُ كلّ شاشةٍ **حرفياً**
 * كما كان. فهذا الملفّ يحرس ثلاثة أشياء:
 *   ١) مقارِنُ الواجهة يطابق ترتيبَ القاعدة — على قوائمَ **قيست من الإنتاج**
 *      (١٩ أيلول ٢٠٢٦، PostgreSQL 17.6، ICU en-US، إصدار الترتيب 153.121).
 *   ٢) عقدُ المستدعين الـ٣١: لا ترتيبَ بالخادم، وكلُّ من كان يرتّب يمرّر نفسَ
 *      العمود ونفسَ الاتجاه ونوعَ العمود المقيس.
 *   ٣) `allPages` نفسُها بالمؤشّر لا بالموقع.
 *
 *   node scripts/keyset-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, existsSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function load(entry) {
  if (!existsSync(entry)) return null;
  const b = await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
}
const shuffle = (a, seed) => {
  const out = [...a]; let s = seed;
  for (let i = out.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

/* ── ١) المقارِنُ يطابق القاعدة — قوائمُ مقيسةٌ بالإنتاج لا مفترَضة ──────── */
console.log("▸ ١) ترتيبُ الواجهة = ترتيبُ القاعدة (قوائمُ مقيسة من الإنتاج)");
// `select json_agg(x order by x)` على نصوصٍ مصطنعة (لا بياناتِ عيادة).
const DB_TEXT = ["","ـ","  space","_u","(x)","*star","#1","~t","🐶 dog","1","10 kg","100","2","33","٣٣","9 kg","A 1","A_1","A-1","a1","alpha","Alpha","beta","Beta","dog","e","E","é","ê","o","Ö","ROYAL","royal canin","Royal Canin","space","ss","ß","z","Zeta","Ω","آلة","أموكسيسيلين","ؤلؤ","إبرة","ئ","ابرة","اموكسيسيلين","ج2","ج٢","حبوب","حبّوب","حُبوب","درونتال","درونتال بلس","درونتال-بلس","علبة","علبه","مصطفى","مصطفي"];
// `json_agg(to_json(t) order by t desc)` — بصيغة PostgREST نفسها، والجلسة UTC.
const DB_TS_DESC = ["2026-09-08T00:00:00+00:00","2026-09-07T23:59:59.999999+00:00","2026-09-07T11:04:37+00:00","2026-09-07T11:04:36.999999+00:00","2026-09-07T11:04:36.5+00:00","2026-09-07T11:04:36.45+00:00","2026-09-07T11:04:36.4+00:00","2026-09-07T11:04:36.2+00:00","2026-09-07T11:04:36.123456+00:00","2026-09-07T11:04:36.12345+00:00","2026-09-07T11:04:36.1234+00:00","2026-09-07T11:04:36.000001+00:00","2026-09-07T11:04:36+00:00","2025-12-31T23:59:59+00:00","2025-12-31T23:00:00+00:00"];
const DB_DATE_ASC = ["2025-12-31","2026-01-09","2026-09-07","2026-09-10","2026-10-01"];

const po = await load("src/lib/pgOrder.ts");
check("وحدةُ الترتيب موجودة (src/lib/pgOrder.ts)", !!po);
if (po) {
  /* المعرّفاتُ **معكوسةٌ** عن الترتيب المتوقَّع — عمداً. لو سارت معه لأنتج أيُّ
   * مقارِنٍ يسقط للتعادل بـid ترتيبَ القاعدة **بالصدفة**: مقارِنٌ بلا ذيلِ البايت
   * («ـ» مقابل "") أو بالميلّي لا بالميكرو (.1234 مقابل .12345) كان سيمرّ. هكذا
   * أيُّ اعتمادٍ على المعرّف يقلب الترتيب فيُكشف. (أمسكه فحصُ الطفرات قبل أن يُكتب.) */
  const rows = (vals, col) => vals.map((v, i) => ({ id: `00000000-0000-0000-0000-${String(vals.length - i).padStart(12, "0")}`, [col]: v }));
  const same = (got, want) => got.findIndex((x, i) => x !== want[i]);
  for (const seed of [1, 7, 42]) {
    const t = shuffle(rows(DB_TEXT, "name"), seed).sort(po.pgCompare({ col: "name", asc: true, kind: "text" })).map((r) => r.name);
    const d = same(t, DB_TEXT);
    check(`  نصوص (ICU en-US، بذيلِ مقارنةٍ بالمحارف كالقاعدة) — خلطة ${seed}`, d < 0, d < 0 ? "" : `@${d}: ${JSON.stringify(t.slice(d, d + 3))} ≠ ${JSON.stringify(DB_TEXT.slice(d, d + 3))}`);
  }
  for (const seed of [3, 11]) {
    const t = shuffle(rows(DB_TS_DESC, "created_at"), seed).sort(po.pgCompare({ col: "created_at", asc: false, kind: "time" })).map((r) => r.created_at);
    const d = same(t, DB_TS_DESC);
    check(`  أوقات تنازلياً حتى الميكروثانية (.4 < .45 < .5) — خلطة ${seed}`, d < 0, d < 0 ? "" : `@${d}: ${t[d]} ≠ ${DB_TS_DESC[d]}`);
  }
  const dd = shuffle(rows(DB_DATE_ASC, "day"), 5).sort(po.pgCompare({ col: "day", asc: true, kind: "date" })).map((r) => r.day);
  check("  تواريخ تصاعدياً", same(dd, DB_DATE_ASC) < 0, JSON.stringify(dd));

  // التعادلُ يُكسر بـid تصاعدياً — كما كان `allPages` يُلحق `order("id")` بعد عمود المستدعي.
  const tie = [
    { id: "b0000000-0000-0000-0000-000000000000", name: "x" },
    { id: "a0000000-0000-0000-0000-000000000000", name: "x" },
    { id: "c0000000-0000-0000-0000-000000000000", name: "x" },
  ].sort(po.pgCompare({ col: "name", asc: true, kind: "text" })).map((r) => r.id[0]).join("");
  check("  التعادلُ يُكسر بالمعرّف تصاعدياً (a ثم b ثم c)", tie === "abc", tie);
  const tieDesc = [
    { id: "b0000000-0000-0000-0000-000000000000", t: "2026-01-01T00:00:00+00:00" },
    { id: "a0000000-0000-0000-0000-000000000000", t: "2026-01-01T00:00:00+00:00" },
  ].sort(po.pgCompare({ col: "t", asc: false, kind: "time" })).map((r) => r.id[0]).join("");
  check("  وبالتنازليّ أيضاً المعرّفُ تصاعديّ (order id asc لا يتبع اتجاهَ العمود)", tieDesc === "ab", tieDesc);

  // NULL: بوستغريس يضع الفارغَ **آخراً** تصاعدياً و**أوّلاً** تنازلياً (NULLS LAST/FIRST الافتراضيّ).
  const nul = (asc) => [{ id: "1", v: "b" }, { id: "2", v: null }, { id: "3", v: "a" }]
    .sort(po.pgCompare({ col: "v", asc, kind: "text" })).map((r) => r.v ?? "∅").join("");
  check("  الفارغُ آخراً تصاعدياً", nul(true) === "ab∅", nul(true));
  check("  والفارغُ أوّلاً تنازلياً", nul(false) === "∅ba", nul(false));
}

/* ── ٢) عقدُ المستدعين الـ٣١ ──────────────────────────────────────────────
 * مُستخرَجٌ آلياً من الشيفرة **قبل** التحويل (١٩ أيلول ٢٠٢٦): كلُّ دالّةٍ وعمودُ
 * ترتيبها واتجاهُه. والنوعُ مقيسٌ من information_schema بالإنتاج: `name` نصّ،
 * و`visit_date`/`day`/`date` تاريخ، والبقيةُ timestamptz. `null` = بلا ترتيب
 * (كانت تُرجَع بترتيب id وحده، والمؤشّرُ يُرجعها بنفسه). */
const CONTRACT = {
  listAllPets: ["created_at", false, "time"],
  listAllVaccinations: null,
  listAllVisits: ["visit_date", false, "date"],
  listClinicVisits: ["visit_date", false, "date"],
  listClinicLabResults: ["taken_at", false, "time"],
  listAllMedia: null,
  listAppointmentsInRange: ["scheduled_at", true, "time"],
  listAllTreatments: null,
  listClinicTreatments: ["day", false, "date"],
  listReminders: ["date", true, "date"],
  listProducts: ["name", true, "text"],
  listFarmProducts: ["name", true, "text"],
  listDeletedProducts: ["deleted_at", false, "time"],
  listDeletedCompanies: ["deleted_at", false, "time"],
  listDeletedCompanySections: ["deleted_at", false, "time"],
  listGeneratedBarcodes: ["created_at", false, "time"],
  listNewStoreOrders: ["created_at", false, "time"],
  listCompanies: ["name", true, "text"],
  listCompanySections: ["name", true, "text"],
  listPurchases: ["purchased_at", false, "time"],
  listAllPurchaseItems: null,
  listInvoices: ["created_at", false, "time"],
  listDeliveryOrders: ["created_at", false, "time"],
  listCourierSettlements: ["created_at", false, "time"],
  listAllInvoiceItems: null,
  listInvoicesTouching: null,
  customerInvoices: null,
  listInvoiceItemsFor: null,
  listInvoicesByIds: null,
  openDebts: null,
  listExpenses: ["spent_at", false, "time"],
  // 0208: علاماتُ التذكير تُفهرَس بخريطةٍ بالمفتاح — ترتيبُها لا يعني شيئاً.
  listReminderMarks: null,
  // 0211: كشفُ الشراء — يُرتَّب بالمتصفّح (created_at ثمّ line_no)؛ القصُّ عند الألف كان يُسقط أحدثَ دفعة.
  listPurchaseEffects: null,
};

console.log("▸ ٢) عقدُ المستدعين الـ٣١ — لا ترتيبَ بالخادم، والعرضُ بنفس ترتيبه");
// نهاياتُ الأسطر للسحب لا للفحص: نسخةُ ويندوز CRLF، والمستودعُ LF.
const src = readFileSync("src/lib/repo.ts", "utf8").replace(/\r\n/g, "\n");
const lines = src.split("\n");
/** كلُّ نداءٍ لـallPages: اسمُ الدالّة الحاضنة ونصُّ وسائطه كاملاً (أقواسٌ متوازنة). */
const calls = [];
for (let i = 0; i < lines.length; i++) {
  if (!/allPages<\w+>\(/.test(lines[i]) || /function allPages/.test(lines[i])) continue;
  let name = "?";
  for (let j = i; j >= 0; j--) { const m = lines[j].match(/^\s{2}async (\w+)\(/); if (m) { name = m[1]; break; } }
  const start = src.indexOf("allPages<", lines.slice(0, i).join("\n").length);
  const open = src.indexOf("(", start);
  let depth = 0, k = open;
  for (; k < src.length; k++) { if (src[k] === "(") depth++; else if (src[k] === ")") { depth--; if (depth === 0) break; } }
  // فاصلةٌ لاحقة (`},\n)`) ليست وسيطاً ثالثاً — تُقصّ قبل التقسيم.
  const args = src.slice(open + 1, k).replace(/,\s*$/, "");
  // الوسيطُ الثاني = ما بعد آخر فاصلةٍ بالمستوى الأعلى.
  let d = 0, split = -1;
  for (let x = 0; x < args.length; x++) { const c = args[x]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === "," && d === 0) split = x; }
  const make = split >= 0 ? args.slice(0, split) : args;
  const sort = split >= 0 ? args.slice(split + 1).trim() : "";
  calls.push({ name, make, sort });
}
check("عددُ المستدعين ٣٣ — لا مستدعٍ ضاع ولا جديدٌ بلا عقد", calls.length === 33, `طلع ${calls.length}`);
const names = new Set(calls.map((c) => c.name));
check("  وكلُّهم بالعقد بأسمائهم", Object.keys(CONTRACT).every((n) => names.has(n)) && [...names].every((n) => n in CONTRACT),
  `ناقص: ${Object.keys(CONTRACT).filter((n) => !names.has(n)).join("، ")} / زائد: ${[...names].filter((n) => !(n in CONTRACT)).join("، ")}`);
const serverOrdered = calls.filter((c) => /\.order\(/.test(c.make)).map((c) => c.name);
check("لا مستدعٍ يرتّب بالخادم (المؤشّرُ يشترط id ترتيباً وحيداً)", serverOrdered.length === 0, serverOrdered.join("، "));
for (const c of calls) {
  const want = CONTRACT[c.name];
  if (!(c.name in CONTRACT)) continue;
  if (want === null) { check(`  ${c.name}: بلا فرز (كان بترتيب id وحده)`, c.sort === "", c.sort); continue; }
  const m = c.sort.match(/^\{\s*col:\s*"(\w+)",\s*asc:\s*(true|false),\s*kind:\s*"(\w+)"\s*\}$/);
  const got = m ? [m[1], m[2] === "true", m[3]] : null;
  check(`  ${c.name}: ${want[0]} ${want[1] ? "تصاعدياً" : "تنازلياً"} (${want[2]})`,
    !!got && got[0] === want[0] && got[1] === want[1] && got[2] === want[2], c.sort || "(لا فرز)");
}

/* ── ٣) allPages نفسُها بالمؤشّر ─────────────────────────────────────────── */
console.log("▸ ٣) allPages تتقدّم بالمعرّف لا بالموقع");
const ap = src.slice(src.indexOf("async function allPages"), src.indexOf("\n}\n", src.indexOf("async function allPages")));
check("  تسأل «ما بعد آخر معرّف» (gt id)", /\.gt\("id",/.test(ap));
check("  وبسقفٍ للطلبة (limit)", /\.limit\(PAGE_ROWS\)/.test(ap));
check("  ولا تتقدّم بالموقع (لا range)", !/\.range\(/.test(ap));
check("  وتفرز للعرض بعد اكتمال الجلب (pgCompare)", /pgCompare(<\w+>)?\(sort\)/.test(ap));
check("  وتقف بصوتٍ إن لم تتقدّم (لا حلقةَ لا نهائية)", /no progress|لم تتقدّم/.test(ap));

console.log(`\n${fails ? "✗" : "✓"} keyset-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
