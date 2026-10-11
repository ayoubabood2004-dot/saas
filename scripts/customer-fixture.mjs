/* ============================================================================
 * قالبُ دليل الزبائن (0232) — بياناتٌ بكلّ الأشكال، والمتوقَّعُ تحسبه المرآةُ نفسُها.
 *
 * نفسُ منهج report-fixture: يكتب `fixture.sql` (فواتير وسطور وحيوانات لثلاث عيادات)
 * و`calls.sql` (نداءاتُ customer_search بكلّ نصٍّ وترتيبٍ وفلتر وصفحة)، و`expected.json`
 * الذي تحسبه `buildCustomerDirectory` **من المصدر** (esbuild) على صفوف كلّ عيادةٍ وحدها
 * وبمفتاح دولتها. ثم `customer-parity.mjs` يقارن ناتجَ القاعدة به حقلاً بحقل.
 *
 * والقالبُ يُقاس على ما تُنتجه القاعدةُ فعلاً لا على ما يُسهّل الفحص (CLAUDE.md §٣):
 *   • رقمٌ واحد بأربع صيغ وثلاثة أسماء؛ «+964» وحده باسمين؛ اسمٌ بلا رقم واسمٌ برقم؛
 *   • أسماءٌ بديلة («—»، «بدون»، «زبون»)، وNBSP، و«%» و«_» بالأسماء؛
 *   • فاتورةٌ مردودة وحدها؛ وزبونٌ فاتورتُه الوحيدة أقدمُ من نافذة الـ٣٠٠ القديمة؛
 *   • صاحبُ حيوانٍ لم يشترِ (٣ حيوانات، واحدٌ متوفّى)؛ حيوانٌ بلا عيادة مشترَك؛
 *     حيوانٌ مخفيٌّ عن العيادة؛ وحيوانُ عيادةٍ ثانية برقم زبونٍ من الأولى؛
 *   • عيادةٌ سعودية (+966): «05…» و«+966 5…» زبونٌ واحد، ورقمٌ عراقيّ يبقى بمفتاحه؛
 *   • سطورٌ بلا منتج (تُجمع بالاسم المطويّ)، وكمياتٌ بنصف، وسطرُ إرجاعٍ سالب.
 *
 *   node scripts/customer-fixture.mjs <outDir>
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2];
if (!out) { console.error("الاستعمال: node scripts/customer-fixture.mjs <outDir>"); process.exit(2); }

const built = await esbuild.build({
  entryPoints: ["src/lib/customerDirectory.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|.*\/i18n.*)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default {}; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const tmp = mkdtempSync(join(tmpdir(), "custfix-"));
const mf = join(tmp, "m.mjs");
writeFileSync(mf, built.outputFiles[0].text);
const D = await import(pathToFileURL(mf).href).finally(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- مولّدٌ حتميّ: نفسُ القالب بكلّ تشغيل ------------------------------ */
let seed = 20261011;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
let idn = 0;
const uuid = (tag) => { idn++; return `c2320000-${tag}-4000-8000-${String(idn).padStart(12, "0")}`; };
const BASE = Date.parse("2026-10-01T09:00:00Z");
const at = (days, mins = 0) => new Date(BASE - days * 86400000 + mins * 60000).toISOString();

const CU1 = "c2320000-0000-4000-8000-0000000000c1";   // عراقية (+964)
const CU2 = "c2320000-0000-4000-8000-0000000000c2";   // عراقيةٌ ثانية — للعزل
const CU3 = "c2320000-0000-4000-8000-0000000000c3";   // سعودية (+966)
const DIAL = { [CU1]: "+964", [CU2]: "+964", [CU3]: "+966" };

const invoices = [], items = [], pets = [];
const PRODUCTS = [uuid("aaaa"), uuid("aaaa"), uuid("aaaa"), uuid("aaaa"), uuid("aaaa")];
const FREE = ["علاج قطط", "علاج قطة", "علاج  قطه", "رمل", "طوق ٢"];
const inv = (clinic, name, phone, days, extra = {}) => {
  const id = uuid("bbbb");
  invoices.push({ id, clinic_id: clinic, customer_name: name, customer_phone: phone, status: "paid", created_at: at(days, idn % 600), ...extra });
  const n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const withPid = rnd() < 0.7;
    const pid = withPid ? pick(PRODUCTS) : null;
    const qty = pick([1, 1, 2, 3, 0.5, 1.5]);
    items.push({ id: uuid("cccc"), invoice_id: id, clinic_id: clinic, product_id: pid, name: pid ? `منتج ${PRODUCTS.indexOf(pid) + 1}` : pick(FREE), qty });
  }
  return id;
};
const pet = (clinic, name, owner, phone, days, extra = {}) =>
  pets.push({ id: uuid("dddd"), clinic_id: clinic, name, owner_name: owner, owner_phone: phone, species: pick(["cat", "dog", "bird"]),
    deceased: false, shared_with_clinic: true, created_at: at(days), ...extra });

/* ---- العيادة الأولى (+964) ------------------------------------------------ */
// رقمٌ واحد بأربع صيغ وثلاثة أسماء — زبونٌ واحد، واسمُ العرض أحدثُها.
const FMT = ["+964 7701234567", "07701234567", "00964 770 123 4567", "٠٧٧٠١٢٣٤٥٦٧"];
const NM = ["أحمد علي", "احمد علي", "ابو حسن"];
for (let k = 0; k < 9; k++) inv(CU1, NM[k % 3], FMT[k % 4], 3 + k * 7);
pet(CU1, "لونا", "أحمد علي", "07701234567", 40);
pet(CU1, "ماكس", "احمد", "+964 770 123 4567", 20);
// «سارة» بلا رقم، و«سارة» برقم — زبونان؛ وحيوانُ «سارة» بلا رقم يلحق الأولى.
inv(CU1, "سارة", null, 11); inv(CU1, "سارة", "", 15); inv(CU1, "سارة", "07709999999", 5);
pet(CU1, "بسبوسة", "سارة", null, 60);
// مفتاحُ الدولة وحده باسمين: زبونان بالاسم، لا p:964.
inv(CU1, "زبون أول", "+964", 8); inv(CU1, "زبون ثاني", "+964", 9); inv(CU1, "زبون أول", "964", 30);
// أسماءٌ ملغومة: NBSP، و% و_.
inv(CU1, "علي\u{a0}حسين", "07801234567", 12); inv(CU1, "%علي_", "07802234567", 13); inv(CU1, "a_b%", null, 14);
// بدائل: «—» بلا رقم (عابرٌ بلا هويّة)، و«بدون» برقم (زبونٌ بلا اسم عرض)، و«زبون» وحده.
inv(CU1, "—", null, 2); inv(CU1, "بدون", "07801112222", 4); inv(CU1, "زبون", null, 6);
// فاتورةٌ مردودة وحدها: شراء ٠ وإرجاع ١.
inv(CU1, "مرتجع", "07812345678", 16, { status: "refunded" });
// زبونٌ فاتورتُه الوحيدة أقدمُ من كلّ شيء (خارج نافذة الـ٣٠٠ القديمة).
inv(CU1, "قديم جداً", "07501234567", 120);
// زبونٌ دائم بستّ فواتير.
for (let k = 0; k < 6; k++) inv(CU1, "حسن الدائم", "07711223344", 1 + k * 3);
// تعادلُ الوقت: زبونان بنفس اللحظة بالضبط — يحسمهما المفتاح.
invoices.push({ id: uuid("bbbb"), clinic_id: CU1, customer_name: "تعادل ب", customer_phone: "07733333333", status: "paid", created_at: at(50) });
invoices.push({ id: uuid("bbbb"), clinic_id: CU1, customer_name: "تعادل أ", customer_phone: "07722222222", status: "paid", created_at: at(50) });
// صاحبُ حيوانٍ لم يشترِ: ٣ حيوانات وواحدٌ متوفّى، ورقمٌ بـ«+964 0».
pet(CU1, "زيتونة", "أم محمد", "+964 0770 555 1234", 70);
pet(CU1, "فلفل", "ام محمد", "07705551234", 65);
pet(CU1, "سمسم", "أم محمد", "07705551234", 90, { deceased: true });
// حيوانٌ مخفيٌّ عن العيادة: لا يُحسب ولا يجعل «بدون» صاحبَ حيوان.
pet(CU1, "مخفي", "بدون", "07801112222", 10, { shared_with_clinic: false });
// حيوانٌ مشترَكٌ بلا عيادة: ليس من زبائن أحد.
pet(null, "مشترك", "غريب مشترك", "07990000000", 10);
// زبائنُ عشوائيون حتى ٣٦٠ فاتورة على ١٢٠ يوماً.
const FIRST = ["محمد", "علي", "حسين", "زينب", "فاطمة", "مريم", "عباس", "مصطفى", "نور", "رقية", "ياسر", "هدى"];
const LAST = ["الكاظمي", "العبيدي", "الجبوري", "التميمي", "الربيعي", "السعدي"];
const people = [];
for (let k = 0; k < 70; k++) {
  const nm = `${pick(FIRST)} ${pick(LAST)}`;
  const r = rnd();
  const ph = r < 0.15 ? null : `07${pick(["70", "71", "80", "81", "90"])}${String(1000000 + Math.floor(rnd() * 8999999))}`;
  people.push([nm, ph]);
}
while (invoices.filter((i) => i.clinic_id === CU1).length < 360) {
  const [nm, ph] = pick(people);
  const fmt = ph && rnd() < 0.3 ? `+964 ${ph.slice(1)}` : ph;
  inv(CU1, rnd() < 0.1 ? nm.replace("ة", "ه") : nm, fmt, Math.floor(rnd() * 119), rnd() < 0.05 ? { status: "refunded" } : {});
}
for (let k = 0; k < 12; k++) { const [nm, ph] = pick(people); pet(CU1, `حيوان ${k + 1}`, nm, ph, Math.floor(rnd() * 200)); }
// سطرُ إرجاعٍ سالب بفاتورة الزبون الدائم.
items.push({ id: uuid("cccc"), invoice_id: invoices.find((i) => i.customer_name === "حسن الدائم").id, clinic_id: CU1, product_id: PRODUCTS[0], name: "منتج 1", qty: -1 });

/* ---- العيادة الثانية: نفسُ رقم زبونٍ من الأولى، وحيوانٌ برقمه ---------------- */
inv(CU2, "زبون عيادة ثانية", "07701234567", 1);
pet(CU2, "غريب", "زبون عيادة ثانية", "07701234567", 1);
inv(CU2, "مرتجع ثاني", "07812345678", 2);

/* ---- العيادة السعودية (+966) ---------------------------------------------- */
inv(CU3, "سعود", "0501234567", 3); inv(CU3, "سعود", "+966 50 123 4567", 4); inv(CU3, "سعود", "00966501234567", 5);
inv(CU3, "عراقي", "+964 7701234567", 6); inv(CU3, "عراقي", "07701234567", 7);
pet(CU3, "صقر", "فهد", "+966 55 000 1111", 30);
inv(CU3, "فهد", "0550001111", 8);

/* ---- النداءات --------------------------------------------------------------- */
const calls = [];
const add = (clinic, q, sort, filter, limit, offset, top, tag = "") =>
  calls.push({ id: `q${String(calls.length + 1).padStart(4, "0")}`, clinic, q, sort, filter, limit, offset, top, tag });
const Q1 = [null, "", "0770", "770", "+964 770", "٠٧٧٠", "07701234567", "7701234567", "احمد", "أحمد", "سارة", "ساره", "زبون",
  "لونا", "زيتونة", "%ع", "ع_", "a_", "%", "علي", "0", "ع", "nomatch", "123", "0780", "حسن", "ام محمد", "07705551234"];
for (const q of Q1) for (const sort of ["match", "recent", "purchases"]) for (const filter of ["all", "nopets"]) add(CU1, q, sort, filter, 5, 0, 0);
// المشي على الصفحات (لا فجوة ولا تكرار): القائمةُ كلُّها بصفحاتٍ من ٥.
for (const [sort, filter] of [["recent", "all"], ["purchases", "nopets"], ["match", "all"]]) {
  for (let o = 0; o <= 150; o += 5) add(CU1, null, sort, filter, 5, o, 0, `walk:${sort}:${filter}`);
}
for (let o = 0; o <= 40; o += 5) add(CU1, "0", "match", "all", 5, o, 0, "walk:short");
for (let o = 0; o <= 60; o += 5) add(CU1, "07", "match", "all", 5, o, 0, "walk:short2");
for (let o = 0; o <= 60; o += 5) add(CU1, "0780", "match", "all", 5, o, 0, "walk:0780");
// أكثرُ ما يشتريه: صفحةُ «زبائن المبيعات» كما تطلبها التقارير، وبحثٌ بالاسم.
add(CU1, null, "purchases", "nopets", 50, 0, 3, "top");
add(CU1, null, "recent", "nopets", 20, 10, 5, "top");
add(CU1, "حسن", "match", "all", 5, 0, 2, "top");
add(CU1, "07701234567", "match", "all", 5, 0, 5, "top");
// السقوف: صفحةٌ أكبرُ من ١٠٠ تُقصّ، وإزاحةٌ سالبة صفر.
add(CU1, null, "recent", "all", 500, 0, 0, "clamp");
add(CU1, null, "recent", "all", 0, -7, 0, "clamp");
// العيادة السعودية: «05…» = «+966 5…»، والعراقيُّ بمفتاحه.
for (const q of [null, "05", "0501", "501234567", "+966 50", "00966 50", "964", "7701234567", "+964 770", "0550", "صقر"]) add(CU3, q, "match", "all", 8, 0, 0);
// العيادة الثانية: زبونُها وحدها.
for (const q of [null, "07701234567", "مرتجع"]) add(CU2, q, "match", "all", 8, 0, 0);
// معاملٌ غيرُ معروف يُرفض بالطرفين.
add(CU1, null, "price", "all", 5, 0, 0, "bad");
add(CU1, null, "match", "debts", 5, 0, 0, "bad");

const srcOf = (clinic) => {
  const inv = invoices.filter((i) => i.clinic_id === clinic);
  const ids = new Set(inv.map((i) => i.id));
  return { invoices: inv, items: items.filter((it) => ids.has(it.invoice_id)), pets: pets.filter((p) => p.clinic_id === clinic) };
};
const expected = {};
for (const c of calls) {
  try {
    const page = D.buildCustomerDirectory(srcOf(c.clinic), DIAL[c.clinic], { q: c.q, sort: c.sort, filter: c.filter, limit: c.limit, offset: c.offset, top: c.top });
    expected[c.id] = { ...c, rows: page.rows, total: page.total };
  } catch (e) {
    expected[c.id] = { ...c, error: String(e.message) };
  }
}

/* ---- الكتابة ---------------------------------------------------------------- */
const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
let sql = "-- مولَّد من scripts/customer-fixture.mjs — لا يُحرَّر بيد.\n";
sql += `insert into auth.users(id) values ('${CU1}'),('${CU2}'),('${CU3}') on conflict do nothing;\n`;
sql += `insert into clinic_prefs(clinic_id, dial_code) values ('${CU1}','+964'),('${CU2}','+964'),('${CU3}','+966')\n  on conflict (clinic_id) do update set dial_code = excluded.dial_code;\n`;
for (const part of chunks(invoices, 100)) {
  sql += "insert into invoices(id, clinic_id, customer_name, customer_phone, status, created_at) values\n"
    + part.map((i) => `  (${lit(i.id)}, ${lit(i.clinic_id)}, ${lit(i.customer_name)}, ${lit(i.customer_phone)}, ${lit(i.status)}, ${lit(i.created_at)})`).join(",\n") + ";\n";
}
/* product_id مفتاحٌ أجنبيّ لجدول المنتجات — فالمنتجاتُ تُزرع قبل السطور. */
sql += "insert into products(id, clinic_id, name, barcode) values\n"
  + PRODUCTS.map((p, k) => `  (${lit(p)}, ${lit(CU1)}, ${lit(`منتج ${k + 1}`)}, ${lit(`CU-${k + 1}`)})`).join(",\n") + "\n  on conflict do nothing;\n";
/* قيدُ 0131 كما هو (لا يُرفع ولا يُبدَّل — فحوصٌ بعدنا تقيسه): سطرُ الإرجاع السالب
 * مخزونُه بنفس إشارته. */
for (const part of chunks(items, 200)) {
  sql += "insert into invoice_items(id, invoice_id, clinic_id, product_id, name, qty, unit_price, unit_cost, line_total, stock_qty) values\n"
    + part.map((it) => `  (${lit(it.id)}, ${lit(it.invoice_id)}, ${lit(it.clinic_id)}, ${lit(it.product_id)}, ${lit(it.name)}, ${it.qty}, 1000, 500, ${Math.abs(it.qty) * 1000}, ${it.qty})`).join(",\n") + ";\n";
}
sql += "insert into pets(id, clinic_id, name, owner_name, owner_phone, species, deceased, shared_with_clinic, created_at) values\n"
  + pets.map((p) => `  (${lit(p.id)}, ${lit(p.clinic_id)}, ${lit(p.name)}, ${lit(p.owner_name)}, ${lit(p.owner_phone)}, ${lit(p.species)}, ${p.deceased}, ${p.shared_with_clinic}, ${lit(p.created_at)})`).join(",\n") + ";\n";
writeFileSync(join(out, "fixture.sql"), sql);

let cs = "-- مولَّد من scripts/customer-fixture.mjs — لا يُحرَّر بيد.\n";
cs += "create table if not exists _cust_out(id text primary key, res json);\ntruncate _cust_out;\n";
cs += `create or replace function _cust_call(who uuid, q text, s text, f text, l int, o int, t int) returns json language plpgsql as $fn$
declare r json;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  select coalesce(json_agg(to_json(x) order by x.ordinality), '[]'::json) into r
    from customer_search(q, s, f, l, o, t) with ordinality as x;
  return r;
exception when others then return json_build_object('error', sqlerrm);
end $fn$;\n`;
for (const c of calls) {
  const q = c.q === null ? "null" : `$q$${c.q}$q$`;
  cs += `insert into _cust_out values ('${c.id}', _cust_call('${c.clinic}', ${q}, '${c.sort}', '${c.filter}', ${c.limit}, ${c.offset}, ${c.top}));\n`;
}
writeFileSync(join(out, "calls.sql"), cs);
writeFileSync(join(out, "expected.json"), JSON.stringify(expected));
console.log(`✓ customer-fixture: ${invoices.length} فاتورة، ${items.length} سطراً، ${pets.length} حيواناً، ${calls.length} نداءً`);
