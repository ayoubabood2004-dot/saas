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
/** مفتاحٌ واحدٌ يرفض الكتابة (جهازٌ قرب امتلائه: الأكبرُ يُرفض والأصغرُ يُقبل). */
let failKey = null;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (quotaFull || k === failKey) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } mem.set(k, v); },
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
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
/* `auth.storageKey` كما بـauth-js: مفتاحُ الجلسة المحفوظة بالمتصفّح (sb-<المشروع>-auth-token). */
const SB_KEY = "sb-test-auth-token";
globalThis.__sb = {
  auth: { storageKey: SB_KEY },
  from: (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); return result(); } }),
  rpc: async (fn, args) => {
    // my_workspace: عيادةُ الخادم لهذه الجولة (auth_clinic) — لا يُعدّ نداءَ رفع.
    if (fn === "my_workspace") {
      if (globalThis.__mode === "net") throw new TypeError("Failed to fetch");
      return { data: { clinic_id: globalThis.__serverClinic ?? null }, error: null };
    }
    calls.push({ kind: "rpc", fn, args }); return result();
  },
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
/* الطابورُ وقراراتُ صفحة المراجعة (outboxShelf.ts — كسولةٌ مع الصفحة) بحزمةٍ واحدة: نفسُ التخزين. */
const built = await esbuild.build({
  stdin: { contents: `export * from "./src/lib/outbox.ts"; export * from "./src/lib/outboxShelf.ts";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubSupabase],
});
const ob = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

/* ── الفحوص ──────────────────────────────────────────────────────────────*/
let fail = 0;
const chk = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`   ✓ ${label}`);
  else { console.log(`   ✗ ${label} — طلع «${g}» والمتوقّع «${w}»`); fail = 1; }
};
/* هويّةُ الجهاز الآن — **كما بالإنتاج**: جلسةُ Supabase بمفتاحها، ومفتاحُ العيادة. لا `vp_session`:
 * النسخةُ السحابيّة لا تكتبها أبداً، وكان القالبُ يكتبها بيده فلم يرَ أن كلَّ عمليةٍ بالإنتاج
 * خُتمت «بلا أحد» وذهبت للمعطّلات (١٣/١٠). */
const signIn = (user, clinic, { confirmed = true } = {}) => {
  if (user) mem.set(SB_KEY, JSON.stringify({ access_token: "t", user: { id: user } }));
  else mem.delete(SB_KEY);
  if (clinic) mem.set("vp_active_clinic", clinic); else mem.delete("vp_active_clinic");
  // والخادمُ يوجّه حيث يقصد المتصفّح (المالكُ: مفتاحُه "default" وعيادتُه حسابُه) — ما لم يقل الفحصُ غيرَ ذلك.
  globalThis.__serverClinic = clinic || user || null;
  /* وAuthContext يحفظ ما قاله my_workspace (serverClinic.ts) — منه وحده يُختم الطابور. `confirmed: false`
   * = my_workspace فشل بالإقلاع (شبكةٌ متعثّرة): لا عيادةَ مؤكَّدة. */
  if (user && confirmed) mem.set("vp_server_clinic", JSON.stringify({ u: user, c: clinic || user }));
  else mem.delete("vp_server_clinic");
};
const reset = () => {
  mem.clear(); calls.length = 0; events.length = 0; shouts.length = 0; quotaFull = false; failKey = null; globalThis.__mode = "ok";
  signIn("user-A", "clinic-A");
};

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
chk("«أعد المحاولة» من صفحة المراجعة يرجّعها", ob.outboxReviveOne("e2"), { ok: true });
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

// ٨) والشكل القديم (بلا kind) يُقرأ إدراجاً — طابورُ جهازٍ لم يُحدَّث بعد.
//    لكنه بلا ختمِ هويّة، فلا يُرفع باسم الحاضر: يُنقل للرفّ ليقرّر بشر.
reset();
mem.set("vp_outbox_v1", JSON.stringify([{ id: "old1", table: "products", row: { id: "old1" }, queued_at: "x", tries: 0 }]));
chk("طابورٌ قديم يُقرأ", ob.outboxCount(), 1);
await ob.flushOutbox();
chk("وما يُرفع باسم مجهول", [calls.length, ob.outboxCount(), ob.outboxDeadCount()], [0, 0, 1]);
chk("بل ينتظر قرارَ بشرٍ بالرفّ", ob.outboxDead()[0].id, "old1");
/* قرارُ المالك ١٣/١٠: ما بلا ختمٍ لا يُرفع بضغطةِ «متعثّرة» — قد تكون العيادةُ أدخلته يدوياً
 * بعد أن رأته عالقاً، فرفعُه الأعمى يكرّره. يُراجَع وحدةً وحدة (outboxReviveOne / outboxDiscard). */
await ob.flushOutbox();
chk("ما بلا ختمٍ يبقى بالرفّ — لا يُحيا وحدَه بجولةٍ أخرى (لا رفعَ أعمى)", [calls.length, ob.outboxDeadCount(), ob.outboxCount()], [0, 1, 0]);
chk("  ويظهر بقائمة المراجعة", ob.outboxReviewList().map((o) => o.id), ["old1"]);
chk("«ارفعها» عليه بعينه يختمه بمن قرّر", ob.outboxReviveOne("old1"), { ok: true });
chk("  مختوماً بالداخل", JSON.parse(mem.get("vp_outbox_v1"))[0].who, { user: "user-A", clinic: "clinic-A" });
await ob.flushOutbox();
chk("  ويُرفع", [calls[0]?.kind, calls[0]?.table, ob.outboxCount(), ob.outboxDeadCount()], ["insert", "products", 0, 0]);

// «احذفها»: من الرفّ إلى أرشيفٍ بالجهاز — لا محو، ولا رفع
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([
  { kind: "rpc", id: "retail_return:r-old", fn: "retail_return", args: { p_items: [{ qty: -2, unit_price: 5000 }], p_meta: { client_ref: "r-old" } }, queued_at: "2026-10-01T10:00:00Z", tries: 0, last_error: "queued by an older version — resume it to send it under your account" },
  { kind: "insert", id: "e-stamped", table: "expenses", row: { id: "e-stamped", amount: 9 }, queued_at: "2026-10-02T10:00:00Z", tries: 10, last_error: "violates check", who: { user: "user-A", clinic: "clinic-A" } },
]));
chk("القائمةُ ما بلا ختمٍ وحده", ob.outboxReviewList().map((o) => o.id), ["retail_return:r-old"]);
chk("«احذفها» تشيله من الرفّ", [ob.outboxDiscard("retail_return:r-old"), ob.outboxReviewList().length], [{ ok: true }, 0]);
chk("  إلى الأرشيف بحمولته ووقت القرار", [ob.outboxDiscarded()[0]?.id, typeof ob.outboxDiscarded()[0]?.discarded_at], ["retail_return:r-old", "string"]);
await ob.flushOutbox();
chk("  ولا يُرفع", calls.filter((c) => c.fn === "retail_return").length, 0);
chk("والمختومُ بالرفّ (رفضته القاعدة) يُعاد بـ«أعد المحاولة»", [ob.outboxReviveOne("e-stamped"), ob.outboxCount()], [{ ok: true }, 1]);
quotaFull = true;
mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "insert", id: "p-x", table: "products", row: { id: "p-x" }, queued_at: "x", tries: 0 }]));
chk("أرشيفٌ لم يثبت (جهازٌ ممتلئ) ⇒ لا حذف، والسببُ «storage»", [ob.outboxDiscard("p-x"), ob.outboxDeadCount()], [{ ok: false, reason: "storage" }, 1]);
quotaFull = false;
signIn(null, "clinic-A");
chk("«ارفعها» بلا جلسة ⇒ لا شيء، والسببُ «no_session» (لا رفعَ باسم لا أحد)", [ob.outboxReviveOne("p-x"), ob.outboxDeadCount()], [{ ok: false, reason: "no_session" }, 1]);
signIn("user-A", "clinic-A");
chk("«ارفعها» على ما لم يعد بالرفّ ⇒ «missing» لا «سجّل دخول»", ob.outboxReviveOne("ماكو"), { ok: false, reason: "missing" });

/* ٩) **هويّةُ صاحب العملية**: الطابورُ يعيش بالجهاز، والجهازُ يتبدّل عليه أهلُه.
 *    عمليةٌ خُتمت بعيادةٍ لا تُرفع بهويّة الداخل بعدها — وإلا هبط مرتجعُ عيادةٍ
 *    ومصروفُها بدفتر عيادةٍ أخرى. تنتظر أهلَها بلا أن يُحرق عدّادُها. */
reset();
ob.outboxEnqueue("expenses", { id: "x1", amount: 400000 });
signIn("user-B", "clinic-B");               // كاشيرٌ ثانٍ بعيادةٍ ثانية على نفس الجهاز
let rb = await ob.flushOutbox();
chk("ما تُرفع بهويّة غير صاحبها", [rb.sent, calls.length], [0, 0]);
chk("وتبقى بالطابور لا بالمعطّلات", [ob.outboxCount(), ob.outboxDeadCount()], [1, 0]);
signIn("user-A", "clinic-A");               // رجع صاحبُها
rb = await ob.flushOutbox();
chk("وترتفع حين يعود أهلُها", [rb.sent, calls[0]?.row?.id, ob.outboxCount()], [1, "x1", 0]);

// وتبديلُ العيادة وحدَه يكفي (مشغّلُ المنصّة يترك عيادةً ويدخل غيرها)
reset();
ob.outboxEnqueueRpc("retail_return", { p_items: [], p_meta: { client_ref: "r-1" } });
signIn("user-A", "clinic-B");
rb = await ob.flushOutbox();
chk("تبديلُ العيادة بنفس المستخدم يمنع الرفع أيضاً", [rb.sent, ob.outboxCount()], [0, 1]);

/* ١٠) **الحالُ السحابيّ كما هو** (١٣/١٠): لا `vp_session` أبداً، والهويّةُ من جلسة Supabase.
 *     كانت كلُّ عمليةٍ تُختم «بلا أحد» فتُنقل للمعطّلات بأوّل جولة، و«استأنف» يختمها بلا أحدٍ
 *     ثانيةً — مرتجعٌ ومصروفٌ قيل عنهما «تنحفظ لاحقاً» ولم يصلا. */
reset();
chk("لا vp_session بالحال السحابيّ", mem.has("vp_session"), false);
ob.outboxEnqueue("expenses", { id: "c1", amount: 250 });
chk("العمليةُ مختومةٌ بصاحب الجلسة وعيادته", JSON.parse(mem.get("vp_outbox_v1"))[0].who, { user: "user-A", clinic: "clinic-A" });
r = await ob.flushOutbox();
chk("وتُرفع فعلاً — لا تذهب للمعطّلات", [r.sent, ob.outboxCount(), ob.outboxDeadCount(), calls.length], [1, 0, 0, 1]);

// المالكُ: مفتاحُه «default» (لا يُكتب له مفتاح) — يُختم ويُرفع بنفس المعنى
reset(); signIn("owner-O", null);
ob.outboxEnqueueRpc("retail_return", { p_items: [], p_meta: { client_ref: "r-own" } });
chk("مالكٌ بمفتاح default يُختم بعيادته المؤكَّدة (حسابُه) لا بـdefault", JSON.parse(mem.get("vp_outbox_v1"))[0].who, { user: "owner-O", clinic: "owner-O" });
r = await ob.flushOutbox();
chk("  ويُرفع", [r.sent, ob.outboxCount()], [1, 0]);

// بلا جلسة: لا أحد — لا رفعَ باسم مجهول (يُحفظ ويُنقل للرفّ لقرار بشر كما كان)
reset(); signIn(null, "clinic-A");
ob.outboxEnqueue("expenses", { id: "c2" });
r = await ob.flushOutbox();
chk("بلا جلسة: لا نداءَ للخادم", [calls.length, ob.outboxDeadCount()], [0, 1]);
signIn("user-A", "clinic-A");
chk("  وبعد الدخول تُعرض للمراجعة (لا تُرفع وحدَها)", [(await ob.flushOutbox()).sent, ob.outboxReviewList().length], [0, 1]);
ob.outboxReviveOne(ob.outboxReviewList()[0].id); r = await ob.flushOutbox();
chk("  و«ارفعها» يختمها بالداخل ويرفعها (كان «استأنف» يختمها بلا أحدٍ ثانيةً)", [r.sent, ob.outboxDeadCount()], [1, 0]);

// مفتاحُ الجلسة غاب من العميل (نسخةٌ لاحقة): يُعثر عليه بشكله — لا رجوعَ صامتٌ إلى «لا أحد»
reset();
delete globalThis.__sb.auth.storageKey;
ob.outboxEnqueue("expenses", { id: "c3" });
r = await ob.flushOutbox();
chk("بلا storageKey: البحثُ عن sb-*-auth-token يجد الحساب", [r.sent, ob.outboxDeadCount()], [1, 0]);
globalThis.__sb.auth.storageKey = SB_KEY;

// جلسةٌ تبدّلت لحسابٍ آخر على نفس الجهاز: تنتظر أهلَها (لا ترتفع باسمه)
reset();
ob.outboxEnqueue("expenses", { id: "c4" });
signIn("user-B", "clinic-A");
r = await ob.flushOutbox();
chk("حسابٌ آخر بنفس العيادة: لا رفع، وتبقى بالطابور", [r.sent, ob.outboxCount(), ob.outboxDeadCount()], [0, 1, 0]);

/* ١١) **تزامنٌ أثناء انتظار الشبكة** (تدقيق ١٣/١٠): كانت الجولةُ تكتب لقطةَ أوّلها بعد كلّ طلب —
 *     فيضيع ما أُضيف وما أُعيد من المراجعة، ويرجع ويُرفع ما سُحب (سحبٌ حذفه المدير). */
reset();
{
  ob.outboxEnqueue("expenses", { id: "slow", amount: 1 });
  ob.outboxEnqueue("expenses", { id: "del-me", amount: 2 });
  mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "insert", id: "legacy", table: "expenses", row: { id: "legacy", amount: 3 }, queued_at: "2026-10-01T00:00:00Z", tries: 0 }]));
  let release;
  const gate = new Promise((r) => { release = r; });
  const realFrom = globalThis.__sb.from;
  globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => {
    calls.push({ kind: "insert", table, row, opts });
    if (row.id === "slow") await gate;   // الطلبُ الأوّل معلَّقٌ بالشبكة
    return result();
  } });
  const flush = ob.flushOutbox();
  await new Promise((r) => setTimeout(r, 0));
  ob.outboxEnqueue("expenses", { id: "new-exp", amount: 4 });   // حفظٌ بلا نت أثناء الطلب
  ob.outboxDrop("del-me");                                      // حذفُ سحبٍ لم يصل
  ob.outboxReviveOne("legacy");                                 // «ارفعها» من المراجعة
  release();
  const fr = await flush;
  globalThis.__sb.from = realFrom;
  const sentIds = calls.map((c) => c.row?.id);
  chk("ما سُحب أثناء الطلب لا يُرفع", sentIds.includes("del-me"), false);
  chk("وما أُضيف أو أُعيد أثناءه لا يضيع: بالطابور أو مرفوع", ["new-exp", "legacy"].every((id) => sentIds.includes(id) || ob.outboxCount() > 0 && JSON.parse(mem.get("vp_outbox_v1")).some((o) => o.id === id)), true);
  await ob.flushOutbox();
  const all = calls.map((c) => c.row?.id);
  chk("  وبالجولة التالية يُرفع كلُّه مرّةً واحدة", [all.filter((x) => x === "new-exp").length, all.filter((x) => x === "legacy").length, ob.outboxCount(), ob.outboxDeadCount()], [1, 1, 0, 0]);
  chk("  والأوّلُ رُفع مرّةً", all.filter((x) => x === "slow").length, 1);
  void fr;
}

// نسخةٌ أحدث بنفس المفتاح وصلت أثناء الطلب: لا تُشال بنجاح القديمة
reset();
{
  ob.outboxEnqueue("poultry_daily", { cycle_id: "cy-9", on_date: "2026-10-05", dead: 1 }, { id: "pd:9", conflict: "cycle_id,on_date" });
  let release; const gate = new Promise((r) => { release = r; });
  const realFrom = globalThis.__sb.from;
  globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); if (row.dead === 1) await gate; return result(); } });
  const flush = ob.flushOutbox();
  await new Promise((r) => setTimeout(r, 0));
  ob.outboxEnqueue("poultry_daily", { cycle_id: "cy-9", on_date: "2026-10-05", dead: 5 }, { id: "pd:9", conflict: "cycle_id,on_date" });
  release(); await flush;
  chk("نجاحُ النسخة القديمة لا يشيل الأحدث", JSON.parse(mem.get("vp_outbox_v1")).map((o) => o.row.dead), [5]);
  await ob.flushOutbox();
  globalThis.__sb.from = realFrom;
  chk("  والأحدثُ يُرفع بدوره", calls.map((c) => c.row.dead), [1, 5]);
}

// ما أُعيد من المراجعة بمفتاحٍ طبيعيّ لا يدمج فوق الخادم (اليومُ ربما صُحّح يدوياً بعدها)
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "insert", id: "pd:old", table: "poultry_daily", row: { cycle_id: "c", on_date: "2026-10-04", dead: 3 }, conflict: "cycle_id,on_date", queued_at: "2026-10-04T00:00:00Z", tries: 0 }]));
ob.outboxReviveOne("pd:old"); await ob.flushOutbox();
/* كان «لا يدمج» فيصير DO NOTHING صامتاً بيومٍ موجود: تصحيحُ اليوم يضيع ويُقال «ارتفعت» (تدقيق ١٣/١٠).
 * صار يدمج — والصفحةُ تعرض يومَ الخادم بجانبه قبل أن تُفتح «ارفعها». */
chk("إدخالُ يومٍ من المراجعة: يدمج (لا DO NOTHING صامت)", calls[0]?.opts, { onConflict: "cycle_id,on_date", ignoreDuplicates: false });

// outboxDrop يشيل نسخةَ الرفّ بنفس المفتاح (حُفظ أونلاين بعدها)
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "insert", id: "pd:x", table: "poultry_daily", row: { cycle_id: "c", on_date: "d", dead: 1 }, queued_at: "q", tries: 0 }]));
chk("outboxDrop يشيل نسخةَ الرفّ المتقادمة", [ob.outboxDrop("pd:x"), ob.outboxDeadCount()], [true, 0]);

// القوائم: مرفوضةٌ مختومة، ومنتظرةٌ لغير الداخل
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([
  { kind: "insert", id: "rej", table: "companies", row: { id: "rej", name: "تاج" }, queued_at: "q", tries: 10, last_error: "company_twin_name", who: { user: "user-A", clinic: "clinic-A" } },
  { kind: "insert", id: "leg", table: "companies", row: { id: "leg" }, queued_at: "q", tries: 0 },
  null, { kind: "insert", table: "products" },
]));
chk("المرفوضةُ المختومة بقائمتها، وبلا ختمٍ بقائمتها، والتالفُ لا يُقرأ", [ob.outboxRejectedList().map((o) => o.id), ob.outboxReviewList().map((o) => o.id)], [["rej"], ["leg"]]);
chk("«أعد المحاولة» على المرفوضة يبقيها بختمها", (ob.outboxReviveOne("rej"), JSON.parse(mem.get("vp_outbox_v1"))[0].who), { user: "user-A", clinic: "clinic-A" });
ob.outboxEnqueue("expenses", { id: "mine" });
signIn("user-B", "clinic-A");
chk("المنتظرةُ لحسابٍ آخر تُعدّ للداخل الجديد", ob.outboxWaitingOthers().map((o) => o.id).sort(), ["mine", "rej"]);

/* ١٢) تدقيقٌ ثانٍ ١٣/١٠ */
// الخادمُ يوجّه لعيادةٍ غيرِ المختومة (مفتاحٌ بقي على عيادةٍ انتهت جلستُها): لا رفع، تنتظر
reset();
ob.outboxEnqueue("expenses", { id: "x-op" });
globalThis.__serverClinic = "own-clinic";
r = await ob.flushOutbox();
chk("الخادمُ يقول عيادةً أخرى ⇒ لا رفع، وتبقى بالطابور", [r.sent, calls.length, ob.outboxCount(), ob.outboxDeadCount()], [0, 0, 1, 0]);
globalThis.__serverClinic = "clinic-A";
r = await ob.flushOutbox();
chk("  ورجع الخادمُ لعيادتها ⇒ تُرفع", [r.sent, ob.outboxCount()], [1, 0]);

// مرتجعٌ أقدمُ من ٦ أيام: يُوقف للمراجعة لا يُعاد أعمى (مرجعُه بالخادم يُمسح بعد ٧)
reset();
mem.set("vp_outbox_v1", JSON.stringify([{ kind: "rpc", id: "retail_return:old", fn: "retail_return", args: { p_items: [{ qty: -1, unit_price: 10 }], p_meta: { client_ref: "old" } }, queued_at: new Date(Date.now() - 8 * 86400000).toISOString(), tries: 0, who: { user: "user-A", clinic: "clinic-A" } }]));
r = await ob.flushOutbox();
chk("مرتجعٌ عمرُه ٨ أيام: لا نداء، وبقائمة المراجعة", [calls.length, ob.outboxReviewList().map((o) => o.id)], [0, ["retail_return:old"]]);
ob.outboxReviveOne("retail_return:old"); r = await ob.flushOutbox();
chk("  و«ارفعها» بعد المراجعة يرفعه (قرارُ بشر)", [r.sent, calls[0]?.fn], [1, "retail_return"]);

// جهازٌ قرب امتلائه: «ارفعها» لا تُضيّع العملية — تبقى بالرفّ
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "insert", id: "e-legacy", table: "expenses", row: { id: "e-legacy", amount: 7 }, queued_at: "q", tries: 0 }]));
failKey = "vp_outbox_v1";
chk("الطابورُ لا يثبت ⇒ «storage» والعمليةُ باقيةٌ بالرفّ (لا ضياعَ من الاثنين)", [ob.outboxReviveOne("e-legacy"), ob.outboxDead().map((o) => o.id)], [{ ok: false, reason: "storage" }, ["e-legacy"]]);
failKey = null;

// والرفُّ لا يثبت عند النقل إليه ⇒ تبقى بالطابور
reset();
mem.set("vp_outbox_v1", JSON.stringify([{ kind: "insert", id: "nobody", table: "products", row: { id: "nobody" }, queued_at: "q", tries: 0 }]));
failKey = "vp_outbox_dead_v1";
await ob.flushOutbox();
chk("رفٌّ لا يثبت ⇒ العمليةُ باقيةٌ بالطابور (كانت تضيع من الاثنين)", [ob.outboxCount(), ob.outboxDeadCount()], [1, 0]);
failKey = null;

// سقفُ الرفّ لا يرمي ما يحتاج مراجعة
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ kind: "insert", id: "leg-" + i, table: "expenses", row: { id: "leg-" + i }, queued_at: "q", tries: 0 }))));
ob.outboxEnqueue("expenses", { id: "rej-1" });
globalThis.__mode = "reject";
for (let i = 0; i < 10; i++) await ob.flushOutbox();
chk("رفٌّ ممتلئٌ بما يحتاج مراجعة: لا يُرمى منه شيء", [ob.outboxReviewList().length, ob.outboxDead().some((o) => o.id === "rej-1")], [200, true]);
globalThis.__mode = "ok";

// انتهاءُ الجلسة رفضٌ عابر: لا يُحتسب على العملية
reset();
ob.outboxEnqueue("expenses", { id: "jwt-1" });
const realFrom2 = globalThis.__sb.from;
globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); return { error: { message: "JWT expired" } }; } });
for (let i = 0; i < 12; i++) await ob.flushOutbox();
globalThis.__sb.from = realFrom2;
chk("JWT expired ×١٢ ⇒ لا يُحتسب ولا يُنقل للرفّ", [ob.outboxCount(), ob.outboxDeadCount(), JSON.parse(mem.get("vp_outbox_v1"))[0].tries], [1, 0, 0]);

// ما ينتظر حساباً آخر: يُؤرشف بقرار المدير (لا يبقى عالقاً أبداً)
reset();
ob.outboxEnqueue("expenses", { id: "theirs" });
signIn("user-B", "clinic-A");
chk("«احذفها» على ما ينتظر حساباً آخر ⇒ أرشيف", [ob.outboxDiscard("theirs"), ob.outboxCount(), ob.outboxDiscarded()[0]?.id], [{ ok: true }, 0, "theirs"]);

/* ١٣) التحقّقُ الأخير ١٣/١٠ — كلُّ عيبٍ بفحصه */
// «احذفها» تحذف النسخةَ التي رآها المدير وحدها: نسخةٌ أحدثُ بنفس المفتاح لم يرَها أحد تبقى
reset();
{
  const A = { kind: "insert", id: "pd:z", table: "poultry_daily", row: { cycle_id: "c", on_date: "d", dead: 1 }, conflict: "cycle_id,on_date", queued_at: "2026-10-04T00:00:00Z", tries: 10, last_error: "x", who: { user: "user-A", clinic: "clinic-A" } };
  const B = { ...A, row: { ...A.row, dead: 9 }, queued_at: "2026-10-05T00:00:00Z" };
  mem.set("vp_outbox_dead_v1", JSON.stringify([B]));   // الرفُّ استبدل A بـB بعد أن رُسمت الصفحة
  chk("«احذفها» على نسخةٍ تبدّلت ⇒ «missing» والأحدثُ باقٍ", [ob.outboxDiscard("pd:z", A), ob.outboxDead().map((o) => o.row.dead), ob.outboxDiscarded().length], [{ ok: false, reason: "missing" }, [9], 0]);
  chk("  و«ارفعها» على نسخةٍ تبدّلت ⇒ «missing» لا رفعَ لما لم يُرَ", [ob.outboxReviveOne("pd:z", A), ob.outboxCount()], [{ ok: false, reason: "missing" }, 0]);
  chk("  وعلى النسخة المعروضة نفسِها ⇒ تُؤرشف هي", [ob.outboxDiscard("pd:z", B), ob.outboxDeadCount(), ob.outboxDiscarded()[0]?.row?.dead], [{ ok: true }, 0, 9]);
  // ومن الطابور (ما ينتظر حساباً آخر): إدخالُ يومٍ صُحّح بعد الرسم لا يُحذف بالمعرّف
  mem.set("vp_outbox_v1", JSON.stringify([{ ...B, tries: 0, who: { user: "user-B", clinic: "clinic-A" } }]));
  chk("  ومن الطابور: النسخةُ القديمة المعروضة ⇒ لا يُحذف الأحدث", [ob.outboxDiscard("pd:z", { ...A, who: { user: "user-B", clinic: "clinic-A" } }), ob.outboxCount()], [{ ok: false, reason: "missing" }, 1]);
}

// متقادمةٌ مختومةٌ بحسابٍ آخر: لا تُعاد باسمه (كانت «ارفعها» تُعرض عليها)
reset();
mem.set("vp_outbox_dead_v1", JSON.stringify([{ kind: "rpc", id: "retail_return:b", fn: "retail_return", args: { p_items: [], p_meta: { client_ref: "b" } }, queued_at: "2026-10-01T00:00:00Z", tries: 0, stale: true, who: { user: "user-B", clinic: "clinic-B" } }]));
chk("«ارفعها» على متقادمةٍ لحساب آخر ⇒ «other_owner»، وتبقى بالرفّ", [ob.outboxReviveOne("retail_return:b"), ob.outboxDeadCount(), ob.outboxCount()], [{ ok: false, reason: "other_owner" }, 1, 0]);
chk("  ولا يُسأل الخادمُ عن أثرها من عيادةٍ أخرى (RLS يقول «ما لكينا» كذباً)", ob.traceable(ob.outboxDead()[0]), false);
signIn("user-B2", "clinic-B");
chk("  وحسابٌ آخر بنفس عيادتها يُسأل عنها", ob.traceable(ob.outboxDead()[0]), true);
signIn("user-A", "clinic-A");
chk("  وما بلا ختمٍ يُسأل عنه (يُرفع — إن رُفع — هنا)", ob.traceable({ kind: "rpc", id: "x", fn: "retail_return", args: {}, queued_at: "q", tries: 0 }), true);

// الإعفاءُ من التوقيف ٦ أيامٍ من قرار المراجعة وحدها (كان أبدياً)
reset();
{
  const day = 86400000;
  const ret = (id, reviewedAgo) => ({ kind: "rpc", id, fn: "retail_return", args: { p_items: [], p_meta: { client_ref: id } }, queued_at: new Date(Date.now() - 20 * day).toISOString(), tries: 0, who: { user: "user-A", clinic: "clinic-A" }, reviewed_at: new Date(Date.now() - reviewedAgo * day).toISOString() });
  mem.set("vp_outbox_v1", JSON.stringify([ret("old-review", 7), ret("fresh-review", 1)]));
  r = await ob.flushOutbox();
  chk("مراجعةٌ قبل ٧ أيام ⇒ يُوقف ثانيةً؛ وقبل يوم ⇒ يُرفع", [calls.map((c) => c.args.p_meta.client_ref), ob.outboxReviewList().map((o) => o.id)], [["fresh-review"], ["old-review"]]);
  ob.outboxReviveOne("old-review");
  const q = JSON.parse(mem.get("vp_outbox_v1"))[0];
  chk("  و«ارفعها» تختم وقتَ القرار من جديد وتمسح «متقادمة»", [q.stale, Date.now() - Date.parse(q.reviewed_at) < 5000], [undefined, true]);
}

// كلُّ محاولة رفعٍ للمرتجع يُحفظ وقتُها، ومدّةُ البحث عن أثره تغطّيها (كانت لحظةَ الحفظ وحدها)
reset();
{
  const realRpc = globalThis.__sb.rpc;
  globalThis.__sb.rpc = async (fn, args) => {
    if (fn === "my_workspace") return { data: { clinic_id: globalThis.__serverClinic }, error: null };
    calls.push({ kind: "rpc", fn, args }); throw new TypeError("Failed to fetch");   // وصل؟ ضاع الجواب
  };
  ob.outboxEnqueueRpc("retail_return", { p_items: [], p_meta: { client_ref: "att" } });
  const q0 = new Date(Date.now() - 3600000).toISOString();   // قبل ساعة (أقدمُ من ٦ أيام يُوقف قبل أيّ محاولة)
  mem.set("vp_outbox_v1", JSON.stringify(JSON.parse(mem.get("vp_outbox_v1")).map((o) => ({ ...o, queued_at: q0 }))));
  await ob.flushOutbox();
  globalThis.__sb.rpc = realRpc;
  const op = JSON.parse(mem.get("vp_outbox_v1"))[0];
  chk("محاولةٌ ضاع جوابُها ⇒ وقتُها محفوظٌ بالعملية", [calls.length, op.attempts?.length], [1, 1]);
  const span = ob.traceSpan(op, "2030-01-01T00:00:00Z");
  chk("  ومدّةُ الأثر من الحفظ إلى آخر محاولة", [span.from, span.to], [q0, op.attempts[0]]);
  chk("  وبلا ختم (محاولاتُه لم تُسجَّل) ⇒ إلى الآن", ob.traceSpan({ ...op, who: undefined }, "2030-01-01T00:00:00Z").to, "2030-01-01T00:00:00Z");
}

// الخادمُ يُسأل قبل كلّ عملية: تبدّلت العيادةُ بالخادم وسط الجولة ⇒ ما بعدها ينتظر
reset();
{
  ob.outboxEnqueue("expenses", { id: "m1" });
  ob.outboxEnqueue("expenses", { id: "m2" });
  const realFrom = globalThis.__sb.from;
  globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); globalThis.__serverClinic = "other-clinic"; return result(); } });
  r = await ob.flushOutbox();
  globalThis.__sb.from = realFrom;
  chk("عيادةُ الخادم تبدّلت بعد الأولى ⇒ الثانيةُ لا تُرفع وتبقى", [r.sent, calls.map((c) => c.row.id), ob.outboxCount()], [1, ["m1"], 1]);
}

// رفضٌ عابرٌ بالحالة (503 بنصٍّ لا يُعرف) لا يُحتسب
reset();
{
  ob.outboxEnqueue("expenses", { id: "s503" });
  const realFrom = globalThis.__sb.from;
  globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); return { status: 503, error: { message: "upstream said no" } }; } });
  for (let i = 0; i < 12; i++) await ob.flushOutbox();
  globalThis.__sb.from = realFrom;
  chk("503 ×١٢ ⇒ لا يُحتسب ولا يُنقل للرفّ", [ob.outboxCount(), ob.outboxDeadCount(), JSON.parse(mem.get("vp_outbox_v1"))[0].tries], [1, 0, 0]);
}

// سقفُ الرفّ: أقدمُ المرفوضة تذهب للأرشيف — لا للعدم
reset();
{
  mem.set("vp_outbox_dead_v1", JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ kind: "insert", id: "rj-" + i, table: "expenses", row: { id: "rj-" + i }, queued_at: "q", tries: 10, last_error: "x", who: { user: "user-A", clinic: "clinic-A" } }))));
  ob.outboxEnqueue("expenses", { id: "rj-new" });
  globalThis.__mode = "reject";
  for (let i = 0; i < 10; i++) await ob.flushOutbox();
  globalThis.__mode = "ok";
  chk("رفٌّ ممتلئٌ بالمرفوضة ⇒ الأقدمُ للأرشيف والجديدُ بالرفّ", [ob.outboxDeadCount(), ob.outboxDead().some((o) => o.id === "rj-new"), ob.outboxDiscarded().map((o) => o.id)], [200, true, ["rj-0"]]);
}

/* ١٤) الختمُ عيادةُ الخادم المؤكَّدة (serverClinic.ts) — تدقيقٌ عدائيّ ١٣/١٠ على fff3027.
 *     "default" بالمفتاح كان «عيادتي» و«لم يُحسم» معاً. */
// المشغّلُ داخلَ عيادة زبونٍ والمفتاحُ لم يُحسم (my_workspace فشل بعد الدخول): لا يُرفع بعيادته هو بعد خروجه
reset();
{
  signIn("op-P", null, { confirmed: false });   // داخلَ C، والمفتاحُ default، ولا تأكيد
  globalThis.__serverClinic = "clinic-C";
  ob.outboxEnqueue("expenses", { id: "exp-c", amount: 9000 });
  chk("بلا عيادةٍ مؤكَّدة ⇒ يُختم «?» لا default", JSON.parse(mem.get("vp_outbox_v1"))[0].who, { user: "op-P", clinic: ob.UNCONFIRMED });
  r = await ob.flushOutbox();
  chk("  ولا يُرفع على ظنّ: للمراجعة", [calls.length, ob.outboxReviewList().map((o) => o.id)], [0, ["exp-c"]]);
  signIn("op-P", null);                           // خرج: الخادمُ يقول عيادتَه، ومؤكَّدة
  r = await ob.flushOutbox();
  chk("  وبعد خروجه لا يهبط سحبُ الزبون بعيادته (كان يُرفع إليها)", [calls.length, ob.outboxDeadCount()], [0, 1]);
}
// موظّفٌ بلا تأكيدٍ ثم تأكّد: عمليتُه «مجهولةُ العيادة» له — لا «حساب ثاني» بلا مخرج
reset();
{
  signIn("staff-S", "clinic-C", { confirmed: false });
  ob.outboxEnqueue("products", { id: "prd-s", name: "x" });
  await ob.flushOutbox();
  chk("بلا تأكيد ⇒ للمراجعة، ولا تُعدّ «حساب ثاني»", [ob.outboxReviewList().length, ob.outboxWaitingOthers().length, ob.ownerState(ob.outboxDead()[0])], [1, 0, "unknown"]);
  chk("  «ارفعها» وعيادتُه بعدها غير مؤكَّدة ⇒ «unconfirmed» (لا ختمَ على ظنّ)", [ob.outboxReviveOne("prd-s"), ob.outboxDeadCount()], [{ ok: false, reason: "unconfirmed" }, 1]);
  signIn("staff-S", "clinic-C");
  chk("  وبعد التأكيد: «ارفعها» تختمها بعيادته المؤكَّدة", [ob.outboxReviveOne("prd-s"), JSON.parse(mem.get("vp_outbox_v1"))[0].who], [{ ok: true }, { user: "staff-S", clinic: "clinic-C" }]);
  r = await ob.flushOutbox();
  chk("  وتُرفع", [r.sent, calls[0]?.row?.id], [1, "prd-s"]);
  // و«?» لحسابٍ آخر: لا تُراجَع باسمه
  signIn("other-U", "clinic-C", { confirmed: false });
  ob.outboxEnqueue("products", { id: "prd-u" });
  signIn("staff-S", "clinic-C");
  await ob.flushOutbox();
  chk("  و«?» لحسابٍ آخر: تبقى له بالطابور (حساب ثاني) — لا تُنقل لمراجعة الداخل", [ob.outboxWaitingOthers().map((o) => o.id), ob.outboxDeadCount()], [["prd-u"], 0]);
}
// AuthContext يحفظ التأكيدَ من my_workspace وحده، ويُنسى حيث يتبدّل التوجيه
{
  const fs = await import("node:fs");
  const auth = fs.readFileSync("src/contexts/AuthContext.tsx", "utf8");
  const lm = auth.slice(auth.indexOf("async function loadMembership"), auth.indexOf("const DEMO_OWNER"));
  chk("AuthContext: التأكيدُ من my_workspace وحده (لا من جدول العضوية)", [(lm.match(/rememberServerClinic\(/g) || []).length, lm.indexOf("rememberServerClinic(") < lm.indexOf('from("memberships")')], [1, true]);
  const so = auth.slice(auth.indexOf("const signOut = () =>"), auth.indexOf("const signOut = () =>") + 1500);
  chk("  والخروجُ ينساه", /forgetServerClinic\(\)/.test(so), true);
  const pa = fs.readFileSync("src/lib/platformAdmin.ts", "utf8");
  const enter = pa.slice(pa.indexOf("export async function platformEnter"), pa.indexOf("export async function platformLeave"));
  const leave = pa.slice(pa.indexOf("export async function platformLeave"), pa.indexOf("export async function platformLeave") + 400);
  chk("  ودخولُ المشغّل عيادةً وخروجُه", [/forgetServerClinic\(\)/.test(enter), /forgetServerClinic\(\)/.test(leave)], [true, true]);
  const inv = fs.readFileSync("src/lib/invites.ts", "utf8");
  chk("  وقبولُ دعوةٍ وتركُ عيادة", (inv.match(/if \(r\.ok\) forgetServerClinic\(\)/g) || []).length, 2);
  const obs = fs.readFileSync("src/lib/outbox.ts", "utf8");
  chk("  والطابورُ لا يقرأ مفتاحَ العيادة المحلّيّ", /vp_active_clinic/.test(obs.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), false);
}
// سُحبت أثناء سؤال الخادم (my_workspace): لا تُرفع نسخةٌ لم تعد موجودة
reset();
{
  ob.outboxEnqueue("expenses", { id: "gone" });
  let release; const gate = new Promise((res) => { release = res; });
  const realRpc = globalThis.__sb.rpc;
  globalThis.__sb.rpc = async (fn, args) => {
    if (fn === "my_workspace") { await gate; return { data: { clinic_id: globalThis.__serverClinic }, error: null }; }
    return realRpc(fn, args);
  };
  const fl = ob.flushOutbox();
  await new Promise((res) => setTimeout(res, 0));
  ob.outboxDrop("gone");
  release(); await fl;
  globalThis.__sb.rpc = realRpc;
  chk("حُذفت أثناء سؤال الخادم ⇒ لا upsert", calls.filter((c) => c.row?.id === "gone").length, 0);
}

/* ١٥) تدقيقٌ عدائيّ ثانٍ ١٣/١٠: الهويّةُ قبل كلّ عملية. طلبٌ عالقٌ والكاشيرُ يخرج بتبويبٍ ثانٍ ويدخل
 *     غيرُه بنفس العيادة — وكلُّ طلبٍ يحمل جلسةَ التخزين الآن، فكان الثاني يُرفع باسم الداخل الجديد. */
reset();
{
  ob.outboxEnqueue("expenses", { id: "e1" });
  ob.outboxEnqueue("expenses", { id: "e2" });
  let release; const gate = new Promise((res) => { release = res; });
  const realFrom = globalThis.__sb.from;
  globalThis.__sb.from = (table) => ({ upsert: async (row, opts) => { calls.push({ kind: "insert", table, row, opts }); if (row.id === "e1") await gate; return result(); } });
  const fl = ob.flushOutbox();
  await new Promise((res) => setTimeout(res, 0));
  signIn("user-B", "clinic-A");                // التبويبُ الثاني: خرج A ودخل B بنفس العيادة
  release(); await fl;
  chk("دخل غيرُه أثناء الجولة ⇒ الثانيةُ لا تُرفع باسمه، وتبقى لأهلها", [calls.map((c) => c.row.id), ob.outboxWaitingOthers().map((o) => o.id)], [["e1"], ["e2"]]);
  signIn("user-A", "clinic-A");
  await ob.flushOutbox();
  globalThis.__sb.from = realFrom;
  chk("  ورجع صاحبُها ⇒ تُرفع", [calls.map((c) => c.row.id), ob.outboxCount()], [["e1", "e2"], 0]);
}

// ── المفتاحُ الطبيعيّ: إدخالُ اليوم (0193) ───────────────────────────────
// صفُّ اليوم مفتاحُه (الدفعة + التاريخ) لا معرّفٌ مولودٌ بالجهاز. وثلاثةُ
// فروقٍ عن الإدراج العاديّ، كلٌّ منها كان عطباً محتملاً:
//   ١) معرّفُ العملية **منفصلٌ عن الحمولة** — وإلا رُفع «poultry_daily:…»
//      بعمود `id` فرفضه بوستغريس وانتهت عمليةٌ سليمةٌ بالمعطّلات.
//   ٢) الرفعُ **يدمج** لا يتجاهل — ما كُتب بالجملون لازم يصل.
//   ٣) إعادةُ الإدخال **تستبدل** المطبور — آخرُ ما كتبه هو الصحيح.
reset();
const dayRow = { cycle_id: "cy-1", on_date: "2026-09-18", dead: 7 };
chk("إدخالُ اليوم يدخل بمفتاحه الطبيعيّ",
  ob.outboxEnqueue("poultry_daily", dayRow, { id: "poultry_daily:cy-1:2026-09-18", conflict: "cycle_id,on_date" }), true);
chk("والحمولةُ بلا معرّفِ عمليةٍ مدسوس", Object.keys(dayRow).includes("id"), false);
ob.outboxEnqueue("poultry_daily", { cycle_id: "cy-1", on_date: "2026-09-18", dead: 9 },
  { id: "poultry_daily:cy-1:2026-09-18", conflict: "cycle_id,on_date" });
chk("وإعادةُ كتابته تستبدل ولا تضيف", ob.outboxCount(), 1);
r = await ob.flushOutbox();
chk("والمرفوعُ آخرُ ما كُتب", [r.sent, calls[0].row.dead], [1, 9]);
chk("بمفتاحه الطبيعيّ ودمجاً لا تجاهلاً",
  calls[0].opts, { onConflict: "cycle_id,on_date", ignoreDuplicates: false });

// وإسقاطُ عمليةٍ بعد نجاحٍ أونلاين على نفس المفتاح: نسخةٌ قديمةٌ لا تعود
// بعد دقائقَ لتدهس ما حُفظ بعدها.
reset();
ob.outboxEnqueue("poultry_daily", { cycle_id: "cy-2", on_date: "2026-09-18", dead: 1 },
  { id: "poultry_daily:cy-2:2026-09-18", conflict: "cycle_id,on_date" });
ob.outboxDrop("poultry_daily:cy-2:2026-09-18");
chk("outboxDrop يُسقط ما نجح أونلاين", ob.outboxCount(), 0);
ob.outboxDrop("ماكو-هيچي");
chk("وإسقاطُ ما لا وجودَ له لا يكسر شيئاً", ob.outboxCount(), 0);

// ── والصرفُ لا يدخل إلا بمرجع ────────────────────────────────────────────
reset();
chk("صرفٌ بلا مرجعٍ يُرفض من الطابور",
  ob.outboxEnqueueRpc("poultry_consume", { p_cycle: "cy-1", p_qty: 10 }), false);
chk("  ويصرخ بالسبب", shouts.some((s) => /client_ref/.test(s)), true);
chk("وبمرجعٍ يدخل",
  ob.outboxEnqueueRpc("poultry_consume", { p_cycle: "cy-1", p_qty: 10, p_meta: { client_ref: "pc-1" } }), true);
r = await ob.flushOutbox();
chk("ويُرفع نداءً للدالّة", [r.sent, calls[0].fn], [1, "poultry_consume"]);

console.log("");
if (fail) { console.log("✗ اكو فحصٌ فشل"); process.exit(1); }
console.log("✓ كل فحوص الصندوق عبرت");
