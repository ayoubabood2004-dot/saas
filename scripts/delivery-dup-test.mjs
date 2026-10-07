/* ============================================================================
 * فحصُ المسار السحابيّ لـ`createDeliveryOrder` — المنطقُ الجديدُ الوحيد بموجة
 * 0180، وكان الوحيدَ بلا فحص.
 *
 * `repo-demo-test` يجعل `./supabase` = null فيختار النسخةَ التجريبية بنيوياً،
 * فلا يلمس هذا الفرع أبداً. وحزمةُ القاعدة تفحص الفهرسَ لا الشِفرةَ التي
 * تتعامل معه. فالفجوةُ بينهما هي بالضبط ما يجعل زرَّ «أعد المحاولة» مأموناً
 * أو كاذباً.
 *
 * ثلاثُ حالاتٍ تُفحص، وكلُّها تُبنى على عميلٍ مزيّفٍ يردّ ما نمليه:
 *   ١) 23505 باسم فهرسنا + الصفُّ القائم مقروء ⇒ يُرجَع القائمُ بلا رمي.
 *   ٢) 23505 بقيدٍ آخر ⇒ **يُرمى** — الرمزُ وحدَه لا يعني «توأمُ فاتورة».
 *   ٣) 23505 باسم فهرسنا لكن بحثُ التوأم يفشل أو يرجع فارغاً ⇒ **يُرمى**،
 *      لا يُبلَع: الصمتُ هنا يقول «انسجّل» وما انسجّل.
 *
 *   node scripts/delivery-dup-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* عميلٌ مزيّف يقرأ سيناريوه من `globalThis.__DLV` — سلسلةٌ تتذكّر أفعالها،
 * فنميّز الإدخالَ من بحثِ التوأم عند لحظة الحلّ. */
const FAKE_SUPABASE = `
  const make = (acts = []) => new Proxy(function () {}, {
    get(_t, k) {
      if (k === "then") {
        const s = globalThis.__DLV;
        const sent = globalThis.__DLV_SENT ?? [];
        const last = sent.length ? sent[sent.length - 1] : null;
        const res = acts.includes("insert") ? (typeof s.insert === "function" ? s.insert(last) : s.insert)
          : acts.includes("update") ? (typeof s.update === "function" ? s.update(last) : s.update)
          : s.lookup;
        return (ok) => { ok(res); };
      }
      if (k === "catch" || k === "finally") return () => make(acts);
      // ما أُرسل للخادم يُحفظ — فنفحص الحمولةَ نفسَها لا ما رجع وحده.
      return (...a) => {
        if (k === "insert" || k === "update") (globalThis.__DLV_SENT ??= []).push(JSON.parse(JSON.stringify(a[0])));
        return make([...acts, String(k)]);
      };
    },
    apply() { return make(acts); },
  });
  export const supabase = {
    from: () => make(), rpc: () => make(), schema: () => ({ from: () => make() }),
    storage: { from: () => make() },
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
  };
`;
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js",
  "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": FAKE_SUPABASE,
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
  banner: { js: "const __VITE_ENV__ = { VITE_SUPABASE_URL: 'https://x.test', VITE_SUPABASE_ANON_KEY: 'k' };" },
});
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".vp-dlv-"));
const file = join(dir, "repo.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
rmSync(dir, { recursive: true, force: true });

const repo = mod.repo;
if (!repo) { console.error("✗ delivery-dup-test: ما انحمّلت الوحدة"); process.exit(1); }

const PAYLOAD = {
  clinic_id: "c1", invoice_id: "inv_1", branch_id: null, courier_id: null,
  customer_name: "زبون", customer_phone: "07701234567", zone: null, address: null, note: null,
  delivery_fee: 0, fee_to_clinic: false, cod_amount: 7000, prepaid: 0,
  status: "preparing", dispatched_at: null, delivered_at: null, returned_at: null,
};
const EXISTING = { id: "dlv_existing", invoice_id: "inv_1", cod_amount: 7000 };
const dup = (msg) => ({ data: null, error: { code: "23505", message: msg } });

async function run(scenario) {
  globalThis.__DLV = scenario;
  try { return { row: await repo.createDeliveryOrder(PAYLOAD), threw: false }; }
  catch (e) { return { err: e, threw: true }; }
}

console.log("▸ 0180 (سحابيّ): 23505 يُرجع القائمَ ولا يبلع غيرَه");

const a = await run({
  insert: dup('duplicate key value violates unique constraint "delivery_orders_invoice_uniq"'),
  lookup: { data: EXISTING, error: null },
});
check("توأمُ الفاتورة يُرجع الصفَّ القائم بلا رمي", !a.threw && a.row?.id === "dlv_existing",
      a.threw ? `رمى: ${a.err?.message}` : `رجع: ${JSON.stringify(a.row)}`);

const b = await run({
  insert: dup('duplicate key value violates unique constraint "delivery_orders_pkey"'),
  lookup: { data: EXISTING, error: null },
});
check("وقيدٌ آخر بنفس الرمز يُرمى — الرمزُ وحدَه لا يعني توأمَ فاتورة", b.threw,
      b.threw ? "" : `رجع بلا رمي: ${JSON.stringify(b.row)}`);

const c = await run({
  insert: dup('duplicate key value violates unique constraint "delivery_orders_invoice_uniq"'),
  lookup: { data: null, error: { code: "42501", message: "rls" } },
});
check("وبحثُ التوأم إن فشل يُرمى الخطأُ الأصليّ (لا صمتَ يقول «انسجّل»)", c.threw,
      c.threw ? "" : `رجع بلا رمي: ${JSON.stringify(c.row)}`);

const d = await run({
  insert: dup('duplicate key value violates unique constraint "delivery_orders_invoice_uniq"'),
  lookup: { data: null, error: null },
});
check("  وكذلك إن رجع البحثُ فارغاً بلا خطأ", d.threw,
      d.threw ? "" : `رجع بلا رمي: ${JSON.stringify(d.row)}`);

console.log("▸ 0225 (سحابيّ): رقمُ الطلب يُطبَّع، والفارغُ لا يُرسل، وغيابُ العمود لا يُسقط الطلب");
const runP = async (payload, scenario) => {
  globalThis.__DLV = scenario; globalThis.__DLV_SENT = [];
  try { return { row: await repo.createDeliveryOrder(payload), threw: false, sent: globalThis.__DLV_SENT }; }
  catch (e) { return { err: e, threw: true, sent: globalThis.__DLV_SENT }; }
};
const okRow = (row) => ({ data: { ...row, id: "dlv_new", created_at: "2026-10-07T10:00:00Z" }, error: null });

const e = await runP({ ...PAYLOAD, courier_ref: " ‏bx-١٢٣ " }, { insert: okRow });
check("الرقمُ يُرسل مطبَّعاً (شرقيّ ← لاتينيّ، بلا خفيٍّ ولا مسافات، والحالةُ كما هي)", !e.threw && e.sent[0]?.courier_ref === "bx-123", JSON.stringify(e.sent[0]?.courier_ref));
const f = await runP({ ...PAYLOAD, courier_ref: "   " }, { insert: okRow });
check("  والفارغُ لا يُرسل أصلاً (قيدُ 0225 يرفض '')", !f.threw && !("courier_ref" in (f.sent[0] ?? {})), JSON.stringify(f.sent[0]));
const g = await runP({ ...PAYLOAD, courier_ref: "AW-55" }, {
  insert: (row) => ("courier_ref" in row
    ? { data: null, error: { code: "42703", message: 'column "courier_ref" of relation "delivery_orders" does not exist' } }
    : okRow(row)),
});
check("قاعدةٌ قبل 0225: الطلبُ يُحفظ بلا رقمه بدل أن يسقط كلُّه", !g.threw && g.sent.length === 2 && !("courier_ref" in g.sent[1]), g.threw ? g.err?.message : JSON.stringify(g.sent));
check("  والصفُّ الراجع بلا رقم — فشاشةُ البيع تقارن وتقولها (لا إسقاطَ صامت)", !g.threw && !g.row?.courier_ref, JSON.stringify(g.row));
const h = await runP({ ...PAYLOAD, courier_ref: "AW-55" }, {
  insert: () => ({ data: null, error: { code: "23514", message: 'new row violates check constraint "delivery_orders_courier_ref_len"' } }),
});
check("  وخطأٌ آخر لا يُعاد بلا رقم: يُرمى", h.threw && h.sent.length === 1, h.threw ? "" : JSON.stringify(h.sent));

globalThis.__DLV = { update: (patch) => ({ data: { id: "dlv_1", ...patch }, error: null }) }; globalThis.__DLV_SENT = [];
await repo.updateDeliveryOrder("dlv_1", { courier_ref: "  " });
check("updateDeliveryOrder: مسحُ الرقم يُرسل NULL لا ''", globalThis.__DLV_SENT[0]?.courier_ref === null, JSON.stringify(globalThis.__DLV_SENT[0]));
globalThis.__DLV_SENT = [];
await repo.updateDeliveryOrder("dlv_1", { courier_ref: "bx ١٢٣" });
check("  والكتابةُ بنفس تطبيع الإنشاء", globalThis.__DLV_SENT[0]?.courier_ref === "bx123", JSON.stringify(globalThis.__DLV_SENT[0]));
globalThis.__DLV_SENT = [];
await repo.updateDeliveryOrder("dlv_1", { status: "out" });
check("  ونداءٌ بلا رقم لا يلمسه (لا مفتاحَ courier_ref بالحمولة)", !("courier_ref" in (globalThis.__DLV_SENT[0] ?? {})), JSON.stringify(globalThis.__DLV_SENT[0]));

console.log(`\n${fails ? "✗" : "✓"} delivery-dup-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
