/* ============================================================================
 * قالبُ تطابق البيع — عرباتٌ تُمرَّر على النصفين: `retail_checkout` بالقاعدة،
 * و`createInvoiceLocal` بالواجهة. فلسٌ واحد يفرق = فشل.
 *
 * لماذا: المرآةُ التجريبية هي ما تجري عليه فحوصُ المنطق (CLAUDE.md §٤)، وكانت
 * تنحرف عن الخادم بالمال نفسِه — `Math.round(final_total)` تدوّر إلى **الدينار
 * الكامل** بينما الخادم `numeric(14,2)`. فـ1562.5 تصير 1563 هنا و1562.50 هناك:
 * نصفُ دينارٍ بكلّ فاتورة، وهو الفرعُ الوحيد الذي تسلكه شاشةُ البيع.
 *
 * والعرباتُ ليست أمثلةً بيدي: تُولَّد ببذرةٍ ثابتة وتقصد **الحوافّ** — كسورٌ
 * تكشف موضعَ التدوير (0.005 بثلاثة سطور)، وكمياتٌ كسرية، وخصمٌ بالنسبة وبالمبلغ
 * وبصفر، وسعرٌ نهائيٌّ أعلى من المجموع وأدنى منه.
 *
 *   node scripts/checkout-fixture.mjs <dir>
 * يكتب: cases.json (ما يُمرَّر للقاعدة) و expected.json (ما حسبته الواجهة).
 * ==========================================================================*/
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: checkout-fixture.mjs <dir>"); process.exit(1); }

/* ---- متصفّحٌ بالحدّ الأدنى، ثم تحميلُ repo.ts بنصفه التجريبيّ -------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(t) { this.type = t; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",   // النصفُ التجريبيّ
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" },
  banner: { js: "const __VITE_ENV__ = {};" },
});
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "ckf-"));
const file = path.join(tmp, "repo.mjs");
fs.writeFileSync(file, built.outputFiles[0].text);
const { repo } = await import(new URL(`file://${file}`).href);
fs.rmSync(tmp, { recursive: true, force: true });

/* ---- عرباتٌ ببذرةٍ ثابتة، تقصد الحوافّ ------------------------------------ */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20260916);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

const cases = [];
/* حوافُّ مقصودةٌ بالاسم — لا تُترك للعشوائية. */
cases.push({ why: "ثلاثةُ سطورٍ بنصف فلس: موضعُ التدوير يظهر هنا وحدَه",
  items: [{ name: "أ", qty: 1, unit_price: 0.005, unit_cost: 0 },
          { name: "ب", qty: 1, unit_price: 0.005, unit_cost: 0 },
          { name: "ج", qty: 1, unit_price: 0.005, unit_cost: 0 }], meta: {} });
cases.push({ why: "سعرٌ نهائيٌّ بنصف دينار — العطبُ الأصليّ بعينه",
  items: [{ name: "أ", qty: 1, unit_price: 2000, unit_cost: 1000 }], meta: { final_total: 1562.5 } });
cases.push({ why: "سعرٌ نهائيٌّ أعلى من المجموع (زيادةٌ لا خصم)",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 400 }], meta: { final_total: 1750.25 } });
cases.push({ why: "سعرٌ نهائيٌّ يساوي المجموع ⇒ الخصمُ صفرٌ والوسمُ null",
  items: [{ name: "أ", qty: 2, unit_price: 500, unit_cost: 100 }], meta: { final_total: 1000 } });
cases.push({ why: "سعرٌ نهائيّ ووسمُ percent ⇒ الخادمُ يفرض fixed",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 100 }], meta: { final_total: 900, discount_type: "percent", discount_value: 10 } });
cases.push({ why: "خصمٌ ثابتٌ بقيمة صفر ⇒ الوسمُ يبقى fixed لا يصير null",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 100 }], meta: { discount_type: "fixed", discount_value: 0 } });
cases.push({ why: "خصمٌ بالنسبة بقيمة صفر ⇒ الوسمُ يبقى percent",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 100 }], meta: { discount_type: "percent", discount_value: 0 } });
cases.push({ why: "خصمُ نسبةٍ كسريّ",
  items: [{ name: "أ", qty: 3, unit_price: 333.33, unit_cost: 100 }], meta: { discount_type: "percent", discount_value: 7.5 } });
cases.push({ why: "خصمٌ ثابتٌ أكبر من المجموع ⇒ يُقصّ عند المجموع",
  items: [{ name: "أ", qty: 1, unit_price: 500, unit_cost: 100 }], meta: { discount_type: "fixed", discount_value: 900 } });
cases.push({ why: "كميةٌ كسرية ⇒ item_count عددٌ صحيح لا 0.125",
  items: [{ name: "أ", qty: 0.125, unit_price: 8000, unit_cost: 4000 }], meta: {} });
cases.push({ why: "مدخَلُ خصمٍ بثلاث خاناتٍ عشرية ⇒ يُدوَّر قبل القصّ",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 100 }], meta: { discount_type: "fixed", discount_value: 10.005 } });
cases.push({ why: "وسمٌ غيرُ معروف ⇒ لا خصمَ ولا وسم",
  items: [{ name: "أ", qty: 1, unit_price: 1000, unit_cost: 100 }], meta: { discount_type: "bogus", discount_value: 50 } });
cases.push({ why: "مدفوعٌ جزئيّ بكسر",
  items: [{ name: "أ", qty: 1, unit_price: 1000.55, unit_cost: 100 }], meta: { amount_paid: 300.456 } });

/* ثم عشوائيٌّ ببذرةٍ ثابتة — ما لم نفكّر به. */
for (let c = 0; c < 60; c++) {
  const n = int(1, 5);
  const items = Array.from({ length: n }, (_, i) => ({
    name: `م${i}`,
    qty: rnd() < 0.3 ? r3(rnd() * 3) || 0.001 : int(1, 9),
    unit_price: r2(rnd() * 5000),
    unit_cost: r2(rnd() * 2000),
  }));
  const m = rnd();
  const meta = m < 0.3 ? { final_total: r2(rnd() * 20000) }
    : m < 0.5 ? { discount_type: "percent", discount_value: r2(rnd() * 100) }
    : m < 0.7 ? { discount_type: "fixed", discount_value: r2(rnd() * 5000) }
    : {};
  if (rnd() < 0.4) meta.amount_paid = r2(rnd() * 10000);
  cases.push({ why: `عشوائيّ #${c}`, items, meta });
}

/* ---- ما تحسبه الواجهة ------------------------------------------------------ */
const expected = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const inv = await repo.retailCheckout(c.items.map((x) => ({ ...x, product_id: null })), { ...c.meta, client_ref: `ck-${i}` });
  expected.push({
    i, why: c.why,
    subtotal: Number(inv.subtotal), discount: Number(inv.discount),
    discount_type: inv.discount_type ?? null,
    total: Number(inv.total), amount_paid: Number(inv.amount_paid),
    cost_total: Number(inv.cost_total), profit: Number(inv.profit),
    item_count: Number(inv.item_count),
  });
}

/* ---- نداءاتُ القاعدة: **نفسُ** العربات، بلا نسخةٍ ثانيةٍ تنحرف ------------- */
const sql = [];
/* `is_local = false`: psql يلفّ كلَّ عبارةٍ بمعاملتها، و`true` تموت معها. */
sql.push("select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);");
sql.push("create table if not exists _ck(i int primary key, inv jsonb);");
sql.push("truncate _ck;");
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const items = JSON.stringify(c.items.map((x) => ({ ...x, product_id: null })));
  const meta = JSON.stringify({ ...c.meta, client_ref: `ck-${i}` });
  const q = (x) => "$ck$" + x + "$ck$";
  sql.push(`insert into _ck(i, inv) select ${i}, to_jsonb(retail_checkout(${q(items)}::jsonb, ${q(meta)}::jsonb));`);
}
/* `\\copy` يشترط سطراً واحداً؛ ونحتاج JSON خاماً بلا هروب — فـ`\\o` أبسط وأصدق. */
sql.push(`\\o ${path.join(dir, "actual.json")}`);
sql.push(`\\t on`);
sql.push(`\\a`);
sql.push(`select coalesce(json_agg(json_build_object('i', i, 'subtotal', (inv->>'subtotal')::numeric, 'discount', (inv->>'discount')::numeric, 'discount_type', inv->>'discount_type', 'total', (inv->>'total')::numeric, 'amount_paid', (inv->>'amount_paid')::numeric, 'cost_total', (inv->>'cost_total')::numeric, 'profit', (inv->>'profit')::numeric, 'item_count', (inv->>'item_count')::int) order by i), '[]'::json) from _ck;`);
sql.push(`\\o`);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify(cases, null, 1));
fs.writeFileSync(path.join(dir, "expected.json"), JSON.stringify(expected, null, 1));
fs.writeFileSync(path.join(dir, "calls.sql"), sql.join("\n") + "\n");
console.log(`checkout-fixture: ${cases.length} عربةً كُتبت إلى ${dir}`);
