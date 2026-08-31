/* ============================================================================
 * فحص صندوق الصادر — على الشِفرة نفسها، لا على نسخةٍ منها.
 *
 * الطابور هو المكان الوحيد بالنظام الذي **يحتفظ** ببياناتٍ لم تصل الخادم بعد.
 * فأخطاؤه ليست أعطالاً تُرى، بل ضياعاً صامتاً: صفٌّ يختفي من جهازٍ ما، ولا
 * أحد يعرف. ولا مشغّلَ فحوصٍ بالمشروع، فنبني الوحدة بـesbuild (موجودٌ أصلاً
 * مع vite) ونبدّل `./supabase` بعميلٍ مزيّف، ثم نشغّلها بـnode بذاكرةٍ محلّية
 * مصنوعة. أي أن المفحوص هو `src/lib/outbox.ts` حرفاً بحرف.
 *
 *   node scripts/outbox-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

/* ── بيئةُ متصفّحٍ مصغّرة ─────────────────────────────────────────────────*/
let quotaFull = false;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (quotaFull) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } mem.set(k, v); },
  removeItem: (k) => mem.delete(k),
};
/* الشِفرة تصرخ بالكونسول عمداً عند الضياع — فنلتقط الصرخة ونعدّها بدل أن
 * تُغرِق مخرجَ الفحص بأثرِ مكدّسٍ لا يفيد. */
const shouts = [];
const realError = console.error;
console.error = (...a) => { shouts.push(String(a[0])); };
process.on("exit", () => { console.error = realError; });

const events = [];
globalThis.window = { dispatchEvent: (e) => { events.push(e.detail); return true; }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

/* ── عميلُ سوبابيس المزيّف: سلوكُه يتبدّل بين الفحوص ─────────────────────*/
const calls = [];
globalThis.__mode = "ok";
const result = () => {
  if (globalThis.__mode === "net") { const e = new TypeError("Failed to fetch"); throw e; }
  if (globalThis.__mode === "reject") return { error: { message: 'violates check constraint "expenses_amount_check"' } };
  return { error: null };
};
globalThis.__sb = {
  from: (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); return result(); } }),
  rpc: async (fn, args) => { calls.push({ kind: "rpc", fn, args }); return result(); },
};

/* ── بناءُ الوحدة الحقيقية ───────────────────────────────────────────────*/
const stubSupabase = {
  name: "stub-supabase",
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, () => ({ path: "supabase", namespace: "stub" }));
    // وكيلٌ لا كائنٌ ثابت: كي يقرأ الفحصُ التالي سلوكاً جديداً بلا إعادة استيراد.
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export const supabase = new Proxy({}, { get: (_t, k) => globalThis.__sb[k] });",
      loader: "js",
    }));
  },
};
const built = await esbuild.build({
  entryPoints: ["src/lib/outbox.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubSupabase],
});
const ob = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

/* ── الفحوص ──────────────────────────────────────────────────────────────*/
let fail = 0;
const chk = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`   ✓ ${label}`);
  else { console.log(`   ✗ ${label} — طلع «${g}» والمتوقّع «${w}»`); fail = 1; }
};
const reset = () => { mem.clear(); calls.length = 0; events.length = 0; shouts.length = 0; quotaFull = false; globalThis.__mode = "ok"; };

console.log("▸ صندوق الصادر…");

// ١) الإدراج يدخل ويُرفع
reset();
chk("الإدراج يدخل الطابور", ob.outboxEnqueue("expenses", { id: "e1", amount: 5 }), true);
chk("والعدّاد يراه", ob.outboxCount(), 1);
let r = await ob.flushOutbox();
chk("والرفع يفرّغه", [r.sent, ob.outboxCount()], [1, 0]);
chk("بـupsert متجاهلٍ للتكرار", calls[0].opts, { onConflict: "id", ignoreDuplicates: true });

// ٢) جهازٌ ممتلئ: الحفظ يفشل ويقولها — ولا يدّعي نجاحاً
reset();
quotaFull = true;
chk("جهازٌ ممتلئ يُرجِع false لا true", ob.outboxEnqueue("products", { id: "p1" }), false);
chk("ويصرخ بالكونسول لا يبلعها", shouts.some((s) => /device storage refused/.test(s)), true);

// ٣) رفضٌ دائم: تنتقل للمعطّلات ولا تُحذف
reset();
ob.outboxEnqueue("expenses", { id: "e2", amount: -1 });
globalThis.__mode = "reject";
for (let i = 0; i < 12; i++) await ob.flushOutbox();
chk("رفضٌ متكرّر يُفرّغ الطابور", ob.outboxCount(), 0);
chk("ولا يمحو العملية — تصير معطّلة", ob.outboxDeadCount(), 1);
chk("بحمولتها كاملة", ob.outboxDead()[0].row, { id: "e2", amount: -1 });
chk("وسببُ رفضها معها", /expenses_amount_check/.test(ob.outboxDead()[0].last_error ?? ""), true);
chk("وانصرخ بانتقالها", shouts.some((s) => /moved to dead letters/.test(s)), true);

// ٤) والاستئناف يرجّعها بعد أن يُصلَّح السبب
globalThis.__mode = "ok";
chk("الاستئناف يرجّعها", ob.outboxRevive(), 1);
chk("والرفّ يفرغ", ob.outboxDeadCount(), 0);
r = await ob.flushOutbox();
chk("وتُرفع فعلاً", [r.sent, ob.outboxCount()], [1, 0]);

// ٥) نداءُ دالّةٍ بلا مرجع: يُرفض — الإعادة بلا مرجعٍ ازدواج
reset();
chk("نداءٌ بلا مرجع يُرفض", ob.outboxEnqueueRpc("retail_return", { p_items: [], p_meta: {} }), false);
chk("وما يدخل الطابور", ob.outboxCount(), 0);

// ٦) وبمرجع: يدخل ويُنادى بحرفه
reset();
const args = { p_items: [{ qty: -1 }], p_meta: { client_ref: "s-abc" } };
chk("وبمرجع يدخل", ob.outboxEnqueueRpc("retail_return", args), true);
chk("وإعادةُ نفس المرجع ما تكرّره", (ob.outboxEnqueueRpc("retail_return", args), ob.outboxCount()), 1);
await ob.flushOutbox();
chk("ويُنادى بحججه حرفاً بحرف", calls[0], { kind: "rpc", fn: "retail_return", args });

// ٧) فشلُ شبكة: يبقى بالطابور بلا احتساب محاولة
reset();
ob.outboxEnqueue("expenses", { id: "e3" });
globalThis.__mode = "net";
await ob.flushOutbox();
await ob.flushOutbox();
chk("فشلُ الشبكة يُبقيها", ob.outboxCount(), 1);
chk("وما يحتسب عليها محاولة", ob.outboxDeadCount(), 0);

// ٨) والشكل القديم (بلا kind) يُقرأ إدراجاً — طابورُ جهازٍ لم يُحدَّث بعد
reset();
mem.set("vp_outbox_v1", JSON.stringify([{ id: "old1", table: "products", row: { id: "old1" }, queued_at: "x", tries: 0 }]));
chk("طابورٌ قديم يُقرأ", ob.outboxCount(), 1);
await ob.flushOutbox();
chk("ويُرفع إدراجاً", [calls[0]?.kind, calls[0]?.table, ob.outboxCount()], ["insert", "products", 0]);

console.log("");
if (fail) { console.log("✗ اكو فحصٌ فشل"); process.exit(1); }
console.log("✓ كل فحوص الصندوق عبرت");
