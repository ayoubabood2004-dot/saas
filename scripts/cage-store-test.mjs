/* ============================================================================
 * متجرُ تخطيط الأقفاص — «الجهازُ الثاني ما يدوس ترتيبَ الأوّل».
 *
 * ── لماذا هذا الملفّ ──────────────────────────────────────────────────────
 * شكوى العيادة: «أرتّب غرف الأقفاص على حاسبة، وأفتحه على حاسبة ثانية فيصير
 * الترتيب عشوائياً وكل الأقفاص بغرفة وحدة» — والأسوأ أنّ الحاسبة الثانية
 * **تكتب** تلك الفوضى فوق ترتيب الأولى.
 *
 * والجذرُ الحاكم: **كتابةٌ قبل قراءة**. متجرٌ لم يُرطَّب بعدُ لا يعرف ماذا
 * بالسحابة، فأيُّ حفظٍ منه حفظُ فراغٍ فوق تخطيطٍ قائم.
 *
 * و`cage-layout-test` يفحص الوحدةَ النقيّة (`cageLayout.ts`): الترقيةَ والبذرةَ
 * والتوقيع. وحزمةُ SQL تفحص `save_cage_layout` (الحفظَ بشرط النسخة والتعارضَ
 * والسجلّ). **وبينهما فجوة**: المتجرُ نفسُه — متى يُنادي الخادمَ ومتى يسكت.
 * وهي بالضبط موضعُ الجذر. فيُقاد المتجرُ هنا بسحابةٍ مزيّفةٍ سلوكُها سلوكُ
 * 0195 حرفاً بحرف، ويُسأل: كم مرّةً ناديت، وبأيّ نسخة، وشنو صار بالسحابة.
 *
 *   node scripts/cage-store-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
};

/* ---- السحابةُ المزيّفة: سلوكُ `save_cage_layout` (0195) ------------------- */
const cloud = { rev: 0, layout: null };
const calls = [];
let online = true;
const fakeClient = {
  rpc(fn, args) {
    calls.push({ fn, ...args });
    if (fn !== "save_cage_layout") return Promise.resolve({ data: [], error: null });
    // **الحفظُ بشرط النسخة**: أساسٌ لا يطابق ⇒ تعارضٌ، ولا شيءَ يُكتب.
    if (args.p_base_rev !== cloud.rev) {
      return Promise.resolve({ data: { ok: false, conflict: true, rev: cloud.rev, layout: cloud.layout }, error: null });
    }
    cloud.rev += 1; cloud.layout = args.p_json;
    return Promise.resolve({ data: { ok: true, rev: cloud.rev }, error: null });
  },
};

/* ---- الوحدةُ الحقيقية من مصدرها، وما حولها مُوقَف ------------------------- */
let hydrator = null, resetter = null;
let clinic = "c1";
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      "react": `export const useSyncExternalStore = () => undefined;`,
      "@/lib/clinicSync": `
        export const sb = () => globalThis.__sb;
        export const registerHydrator = (fn) => { globalThis.__hyd = fn; };
        export const registerReset = (fn) => { globalThis.__reset = fn; };`,
      "@/lib/settings": `
        export const getCageLayoutRaw = () => globalThis.__cloud.layout;
        export const getCageLayoutRev = () => globalThis.__cloud.rev;
        export const noteCageLayoutSaved = () => {};
        export const hydrateClinicPrefs = async () => {};`,
      "@/lib/clinics": `export const getActiveClinicId = () => globalThis.__clinic;`,
    };
    for (const [mod, src] of Object.entries(map)) {
      const filter = new RegExp(`^${mod.replace(/[/@]/g, "\\$&")}$`);
      b.onResolve({ filter }, () => ({ path: mod, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path], loader: "js" }));
    }
  },
};
globalThis.__sb = fakeClient;
globalThis.__cloud = cloud;
globalThis.__clinic = clinic;

const built = await esbuild.build({
  entryPoints: ["src/components/cage3d/store.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs], logLevel: "silent",
});
const S = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const { cageStudio, flushCageLayout } = S;
hydrator = globalThis.__hyd; resetter = globalThis.__reset;
const flush = async () => { flushCageLayout(); await new Promise((r) => setTimeout(r, 0)); };
const saves = () => calls.filter((c) => c.fn === "save_cage_layout").length;

/* ── ١) الجذر: لا كتابةَ قبل قراءة ────────────────────────────────────────── */
console.log("▸ ١) الجهازُ الي ما قرأ ما يكتب — الجذرُ نفسُه");
cloud.rev = 3;
cloud.layout = JSON.stringify({ v: 2, rooms: [{ id: "r1", name: "غرفة الإقامة", x: 0, z: 0, w: 3, d: 2 }], cages: [{ code: "101", x: 0, z: 0 }] });
const cloudBefore = cloud.layout;
check("المتجرُ يبدأ غيرَ جاهز", cageStudio.get().ready === false);
cageStudio.addRoom("غرفة مخترَعة", 2, 2);
await flush();
check("**إضافةُ غرفةٍ قبل الترطيب لا تنادي الخادمَ إطلاقاً**", saves() === 0, `نادى ${saves()}`);
check("  والسحابةُ ما تحرّكت", cloud.layout === cloudBefore && cloud.rev === 3);

/* ── ٢) يقرأ أوّلاً، ثمّ يرى ما رتّبه الجهازُ الأوّل ──────────────────────── */
console.log("\n▸ ٢) يقرأ فيرى ترتيبَ الجهاز الأوّل كما هو");
await hydrator();
const st = cageStudio.get();
check("صار جاهزاً وبنسخة السحابة", st.ready === true && st.rev === 3, `rev=${st.rev}`);
check("  وغرفةُ الأوّل باسمها", st.rooms.length === 1 && st.rooms[0].name === "غرفة الإقامة", JSON.stringify(st.rooms.map((r) => r.name)));
check("  وقفصُها بمكانه", st.cages.length === 1 && st.cages[0].code === "101");
check("  والغرفةُ المخترَعةُ قبل القراءة اختفت", !st.rooms.some((r) => r.name === "غرفة مخترَعة"));
check("  ولا نداءَ حفظٍ عن الترطيب", saves() === 0, `نادى ${saves()}`);

/* ── ٣) تعديلٌ بعد القراءة يُحفظ بنسخته ──────────────────────────────────── */
console.log("\n▸ ٣) تعديلٌ بعد القراءة يُحفظ بالنسخة الصحيحة");
cageStudio.addRoom("الفندقة", 2, 2);
await flush();
check("نادى الخادمَ مرّةً واحدة", saves() === 1, `نادى ${saves()}`);
check("  وبالأساس ٣ (نسخةُ ما قرأ)", calls.at(-1).p_base_rev === 3, String(calls.at(-1).p_base_rev));
check("  والسحابةُ صارت ٤", cloud.rev === 4);
check("  وفيها الغرفتان", JSON.parse(cloud.layout).rooms.length === 2);
check("  والحالةُ «محفوظ»", cageStudio.get().sync === "saved" && cageStudio.get().rev === 4);

/* ── ٤) التعارضُ لا يُحسم تلقائياً ولا يدوس ─────────────────────────────── */
console.log("\n▸ ٤) جهازٌ نسختُه قديمة: تعارضٌ، ولا شيءَ يُداس");
cloud.rev = 9;
cloud.layout = JSON.stringify({ v: 2, rooms: [{ id: "rX", name: "غرفةُ جهازٍ آخر", x: 0, z: 0, w: 2, d: 2 }], cages: [] });
const cloudAtConflict = cloud.layout;
cageStudio.addRoom("غرفةٌ متأخّرة", 2, 2);
await flush();
check("الحالةُ «تعارض»", cageStudio.get().sync === "conflict", cageStudio.get().sync);
check("  **والسحابةُ ما تغيّرت**", cloud.layout === cloudAtConflict && cloud.rev === 9);
check("  ونسخةُ السحابة معروضةٌ ليختار صاحبُها", !!cageStudio.get().conflict
  && cageStudio.get().conflict.rev === 9
  && cageStudio.get().conflict.layout.rooms[0].name === "غرفةُ جهازٍ آخر",
  JSON.stringify(cageStudio.get().conflict?.layout?.rooms?.map((r) => r.name)));
check("  وما على الشاشة باقٍ ما انمسح", cageStudio.get().rooms.some((r) => r.name === "غرفةٌ متأخّرة"));

/* ── ٥) تبديلُ العيادة يُفرغ ولا يكتب ───────────────────────────────────── */
console.log("\n▸ ٥) تبديلُ العيادة: تفريغٌ فوريّ، ولا كتابةَ بعده");
const n0 = saves();
resetter();
check("التخطيطُ فُرّغ وصار غيرَ جاهز", cageStudio.get().rooms.length === 0 && cageStudio.get().ready === false);
cageStudio.addRoom("غرفةُ عيادةٍ ثانية", 2, 2);
await flush();
check("  ولا نداءَ حفظٍ بعد التبديل", saves() === n0, `نادى ${saves() - n0}`);
check("  والسحابةُ ما زالت ٩", cloud.rev === 9);

/* ── ٦) عيادةٌ بلا تخطيطٍ سحابيّ: فراغٌ يبقى فراغاً، ولا بذرة ─────────────── */
console.log("\n▸ ٦) عيادةٌ جديدة: فراغٌ يبقى فراغاً");
cloud.rev = 0; cloud.layout = null;
await hydrator();
check("جاهزٌ وفارغ", cageStudio.get().ready === true && cageStudio.get().rooms.length === 0 && cageStudio.get().cages.length === 0);
check("  ولا بذرةَ «غرفة الإقامة» انزرعت", !JSON.stringify(cageStudio.get()).includes("غرفة الإقامة"));
const n1 = saves();
check("  ولا نداءَ حفظٍ عن فتحِ شاشةٍ فارغة", n1 === saves() && cloud.rev === 0);

/* ── ٧) بلا شبكة: يُحفظ محلّياً ويُقال «غير محفوظ» لا «تمّ» ──────────────── */
console.log("\n▸ ٧) بلا سحابة: يُقال بصوتٍ إنه غيرُ مرفوع");
globalThis.__sb = null;
cageStudio.addRoom("غرفةٌ بلا شبكة", 2, 2);
await flush();
check("الحالةُ «بلا اتصال» لا «محفوظ»", cageStudio.get().sync === "offline", cageStudio.get().sync);
check("  والسحابةُ ما لُمست", cloud.rev === 0 && cloud.layout === null);
globalThis.__sb = fakeClient;

console.log(`\n${fails ? "✗" : "✓"} cage-store-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
