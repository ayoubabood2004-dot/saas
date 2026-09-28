/* ============================================================================
 * متجرُ الأقفاص على الصفوف (0219) — «ما يعبر شيءٌ من عيادةٍ لعيادة».
 *
 * ── لماذا هذا الملفّ ──────────────────────────────────────────────────────
 * الشكوى: «الأقفاص وترتيبُها تعبر من عيادةٍ للأخرى». وكان الجذرُ ثلاثَ حلقات:
 * المتجرُ يقرأ مرآةَ الجهاز ويسمّيها «محفوظ بالسحابة»، ثم يرفع الرسمةَ كاملةً
 * بشرط رقم نسخةٍ يتصادف بين العيادات، وهويّةُ الكتابة تُقرأ لحظةَ الإرسال.
 * فيُقاد المتجرُ هنا بخادمٍ مزيّف **قواعدُه قواعدُ المرآة التجريبية الحقيقية**
 * (`demoCages.ts` — نفسُ حرّاس 0219 ونفسُ رموزها)، ويُسأل: متى ناديت، وبأيّ
 * عيادة، وشنو أرسلت، وشنو صار بالشاشة حين رُفضت.
 *
 *   node scripts/cage-rows-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
};
globalThis.__db = { admissions: [], pets: [] };
globalThis.__renames = [];

/* ---- الوحدتان الحقيقيتان من مصدرهما، وما حولهما مُوقَف --------------------- */
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      "react": `export const useSyncExternalStore = () => undefined;`,
      "@/lib/clinicSync": `
        export const sb = () => globalThis.__sb;
        export const registerHydrator = (fn) => { globalThis.__hyd = fn; };
        export const registerReset = (fn) => { globalThis.__reset = fn; };`,
      "@/lib/clinics": `export const getActiveClinicId = () => globalThis.__clinic;`,
      // القاموسُ غائبٌ بالفحص: المفتاحُ ومتغيّراتُه تكفي لقياس «يسمّي الساكن».
      "i18next": `export default { t: (k, v) => (typeof v === "string" ? v : (v && v.defaultValue) || [k, ...Object.values(v || {})].join(" ")) };`,
      "@/lib/opsStore": `export const opsStore = { mirrorCageRenames: (p) => { globalThis.__renames.push(...p); } };`,
      "./demoStore": `
        export const loadDB = () => JSON.parse(JSON.stringify(globalThis.__db));
        export const saveDB = (db) => { globalThis.__db = JSON.parse(JSON.stringify(db)); };`,
    };
    for (const [mod, src] of Object.entries(map)) {
      const filter = new RegExp(`^${mod.replace(/[/@.]/g, "\\$&")}$`);
      b.onResolve({ filter }, () => ({ path: mod, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path], loader: "js" }));
    }
  },
};

const built = await esbuild.build({
  stdin: {
    contents: `export * from "./src/components/cage3d/store.ts"; export * as demo from "./src/lib/demoCages.ts";`,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
});
const S = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const { cageStudio, diffOps, demo } = S;
const hydrate = () => globalThis.__hyd();
const reset = () => globalThis.__reset();

/* ---- الخادمُ المزيّف: صفوفٌ بمفتاح العيادة وقواعدُ `demoCageApply` ---------- */
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const srv = { auth: A, calls: [], fail: null, mixed: false, loadError: null, hold: null };
const rowsOf = (clinic) => demo.demoCageLoad(clinic);
const q = (table) => {
  const res = () => {
    if (srv.loadError) return { data: null, error: srv.loadError };
    const r = rowsOf(srv.auth);
    const data = (table === "cage_rooms" ? r.rooms : r.cages).map((x) => ({ ...x, clinic_id: srv.auth }));
    if (srv.mixed && data.length) data[0] = { ...data[0], clinic_id: B };
    return { data, error: null };
  };
  const chain = { select: () => chain, order: () => chain, limit: () => Promise.resolve(res()) };
  return chain;
};
globalThis.__sb = {
  from: q,
  async rpc(fn, args) {
    if (fn === "my_workspace") return { data: { clinic_id: srv.auth }, error: null };
    if (fn !== "cage_layout_apply") return { data: null, error: { message: "unknown" } };
    srv.calls.push(args);
    if (srv.hold) await srv.hold;
    if (srv.fail) { const e = srv.fail; srv.fail = null; return { data: null, error: e }; }
    if (args.p_clinic !== srv.auth) {
      return { data: null, error: { code: "P0001", message: "clinic_switched", hint: "تبدّلت العيادة" } };
    }
    try { demo.demoCageApply(srv.auth, args.p_ops); }
    // الخادمُ الحقيقيّ يرسل الجملةَ جاهزة؛ المرآةُ ترسل مفتاحها — نحاكي الأوّل.
    catch (e) { return { data: null, error: { code: e.code, message: e.message, hint: [e.cageErr, ...Object.values(e.vars || {})].join(" ") } }; }
    return { data: { ok: true }, error: null };
  },
};
globalThis.__clinic = A;

/* ── ١) لا كتابةَ قبل قراءة ─────────────────────────────────────────────── */
console.log("▸ ١) الجهازُ الي ما قرأ ما يكتب");
check("المتجرُ يبدأ غيرَ جاهز", cageStudio.get().ready === false);
cageStudio.addRoom("غرفة قبل القراءة", 2, 2);
await settle();
check("**فعلٌ قبل الترطيب لا ينادي الخادمَ إطلاقاً**", srv.calls.length === 0, `نادى ${srv.calls.length}`);
check("  ولا يظهر بالشاشة", cageStudio.get().rooms.length === 0);

/* ── ٢) يقرأ من الجداول، ويختم بعيادة الخادم ────────────────────────────── */
console.log("\n▸ ٢) يقرأ من الجداول مباشرة — لا مرآةَ جهاز");
mem.set(`vp_clinic_prefs_${A}`, JSON.stringify({ cage_layout: '{"v":2,"rooms":[{"id":"x","name":"مرآة مسمومة","x":0,"z":0,"w":1,"d":1}],"cages":[]}' }));
await hydrate();
let st = cageStudio.get();
check("صار جاهزاً، والمصفوفةُ الفارغة وصولٌ صادق", st.ready === true && st.sync === "saved" && st.rooms.length === 0);
check("  **ولا أثرَ لمرآة الجهاز المسمومة**", !st.rooms.some((r) => r.name === "مرآة مسمومة"));

/* ── ٣) الأفعالُ تصير عملياتِ صفوف بدفعةٍ واحدة مختومة ─────────────────── */
console.log("\n▸ ٣) الأفعالُ دفعةٌ واحدة مختومةٌ بالعيادة التي قُرئ منها");
const room = cageStudio.addRoom("الفندقة", 3, 1);
cageStudio.addCageAuto(room.id);
cageStudio.addCageAuto(room.id);
cageStudio.addCageAuto(room.id);
await settle();
check("أفعالُ الضغطة الواحدة ⇒ نداءٌ واحد", srv.calls.length === 1, `نادى ${srv.calls.length}`);
const ops1 = srv.calls[0]?.p_ops ?? [];
check("  غرفةٌ وثلاثة أقفاص", ops1.filter((o) => o.op === "room_insert").length === 1 && ops1.filter((o) => o.op === "cage_insert").length === 3,
  JSON.stringify(ops1.map((o) => o.op)));
check("  **مختومةٌ بعيادة الخادم**", srv.calls[0]?.p_clinic === A);
check("  وكلُّ قفصٍ بغرفته", ops1.filter((o) => o.op === "cage_insert").every((o) => o.room_id === room.id));
check("  والحالةُ «محفوظ»", cageStudio.get().sync === "saved");
check("  والخادمُ فيه ما بالشاشة", rowsOf(A).cages.length === 3);

/* ── ٤) الترقيم: تبادلٌ ينجح، والساكنُ يتبع قفصَه بلا كتابة ────────────── */
console.log("\n▸ ٤) الترقيمُ والتسمية — الساكنُ يتبع قفصَه");
const codes0 = cageStudio.get().cages.map((c) => c.code);
globalThis.__db = { admissions: [{ id: "adm1", pet_id: "p1", status: "active", cage: codes0[0] }], pets: [{ id: "p1", name: "لولو" }] };
cageStudio.renumberRoom(room.id, 1, "أ-");
await settle();
st = cageStudio.get();
check("الترقيمُ انحفظ", st.sync === "saved" && st.cages.map((c) => c.code).join(",") === "أ-1,أ-2,أ-3", st.cages.map((c) => c.code).join(","));
check("  عملياتُ تحديث لا حذفٌ وإعادة إدراج (المعرّفُ باقٍ)", srv.calls.at(-1).p_ops.every((o) => o.op === "cage_update"));
check("  والخادمُ جرّ نصَّ الساكن", globalThis.__db.admissions[0].cage === "أ-1", globalThis.__db.admissions[0].cage);
check("  وذاكرةُ النزلاء المحلّية أُخبرت (بلا كتابة)", globalThis.__renames.some((p) => p.from === codes0[0] && p.to === "أ-1"),
  JSON.stringify(globalThis.__renames));
const n0 = srv.calls.length;
cageStudio.updateCage("أ-1", { code: "أ-2" });
await settle();
check("رقمٌ مستعمل يُرفض محلّياً بلا نداء", srv.calls.length === n0);

/* ── ٥) الرفضُ يُسمَع: الشاشةُ ترجع لما أكّده الخادم ─────────────────────── */
console.log("\n▸ ٥) الرفضُ يُسمَع — لا «تمّ» عن ما لم يحصل");
// جهازٌ ثانٍ رسم غرفةً وأخذ الرقم «٧٧٧» بعيداً عن شاشتنا.
const R2 = "88888888-0000-4000-8000-000000000008", K2 = "99999999-0000-4000-8000-000000000009";
demo.demoCageApply(A, [
  { op: "room_insert", id: R2, name: "العزل", x: 10, z: 0, w: 1, d: 1, door_side: null, door_at: null },
  { op: "cage_insert", id: K2, room_id: R2, code: "777", x: 10, z: 0, color: null, facing: 0, level: 0 },
]);
const seen = [];
const unsub = cageStudio.subscribe(() => { const s = cageStudio.get(); seen.push({ sync: s.sync, hint: s.error?.hint ?? null }); });
cageStudio.updateCage("أ-3", { code: "777" });
check("  الشاشةُ تعرض التعديلَ فوراً (تفاؤلياً)", cageStudio.get().cages.some((c) => c.code === "777" && c.id !== K2));
await settle();
unsub();
st = cageStudio.get();
check("الخادمُ رفض ⇒ الشاشةُ قالت «ما انحفظ» مع جملة الخادم", seen.some((x) => x.sync === "error" && x.hint), JSON.stringify(seen.map((x) => x.sync)));
check("  وقفصُنا رجع لرقمه المحفوظ (لا «٧٧٧» مزدوج)", st.cages.filter((c) => c.code === "777").length === 1 && st.cages.some((c) => c.code === "أ-3"),
  JSON.stringify(st.cages.map((c) => c.code)));
check("  ثم قرأت من جديد: غرفةُ الجهاز الثاني وقفصُه ظهرا", st.rooms.some((r) => r.id === R2) && st.cages.some((c) => c.id === K2));

/* ── ٦) هويّةٌ تبدّلت تحت الشاشة ⇒ الدفعةُ كلُّها تُرفض ───────────────────── */
console.log("\n▸ ٦) **الجذر**: الجلسةُ صارت عيادةً ثانية والشاشةُ ما زالت على الأولى");
const bRowsBefore = JSON.stringify(rowsOf(B));
srv.auth = B;   // انقضت جلسةُ المشغّل، أو تبويبٌ ثانٍ دخل عيادةً أخرى
cageStudio.addRoom("غرفةٌ ضالّة", 1, 1);
await settle();
const last = srv.calls.at(-1);
check("الدفعةُ خرجت مختومةً بالعيادة الأولى لا بالحالية", last.p_clinic === A, last.p_clinic);
check("  **وعيادةُ الجلسة الثانية ما انمسّت بصفٍّ واحد**", JSON.stringify(rowsOf(B)) === bRowsBefore);
check("  والغرفةُ الضالّة ما بقيت بالشاشة", !cageStudio.get().rooms.some((r) => r.name === "غرفةٌ ضالّة"));
check("  **ولا بُدّلت اللوحةُ بصمت لأقفاص العيادة الثانية** — تقف وتقول", cageStudio.get().sync === "error"
  && cageStudio.get().rooms.some((r) => r.id === room.id), cageStudio.get().sync);
await cageStudio.reload().catch(() => undefined);
check("  وحتى «أعد المحاولة» لا تبدّلها ما دامت الهويّةُ مختلفة", cageStudio.get().rooms.some((r) => r.id === room.id) && cageStudio.get().sync === "error");
srv.auth = A;
await hydrate();
check("  ورجوعُ الهويّة يرجّع الحفظ", cageStudio.get().sync === "saved");

/* ── ٧) قراءةٌ بخليط عيادتين تُرفض، وفشلُ القراءة لا يُعرض فراغاً «محفوظاً» ── */
console.log("\n▸ ٧) القراءةُ لا تكذب");
reset();
srv.mixed = true;
await hydrate();
st = cageStudio.get();
check("صفوفٌ من عيادتين بقراءةٍ واحدة ⇒ لا جاهزية ولا عرض", st.ready === false && st.sync === "error" && st.rooms.length === 0);
srv.mixed = false;
srv.loadError = { message: "network" };
await hydrate();
st = cageStudio.get();
check("فشلُ الشبكة ⇒ «ما قدرنا نجيب» لا لوحةٌ فارغة «محفوظة»", st.ready === false && st.sync === "error");
srv.loadError = null;
await hydrate();
check("  وإعادةُ المحاولة تجيبها", cageStudio.get().ready === true && cageStudio.get().cages.length > 0);

/* ── ٨) تبديلُ العيادة يُسقط ردّاً متأخّراً ─────────────────────────────── */
console.log("\n▸ ٨) ردٌّ وصل بعد تبديل العيادة يُرمى");
let release;
srv.hold = new Promise((r) => { release = r; });
cageStudio.addRoom("قبل التبديل", 1, 1);
await settle();
reset();
release(); srv.hold = null;
await settle();
st = cageStudio.get();
check("بعد التبديل الشاشةُ فارغة وغيرُ جاهزة — لا بقايا عيادةٍ سابقة", st.ready === false && st.rooms.length === 0);

/* ── ٩) الفرق: قفصٌ خارج كلّ غرفة لا يُرسل ──────────────────────────────── */
console.log("\n▸ ٩) الفرقُ لا يرسل قفصاً بلا غرفة");
let threw = false;
try { diffOps({ rooms: [], cages: [] }, { rooms: [], cages: [{ id: "x", code: "1", x: 0, z: 0 }] }); } catch { threw = true; }
check("قفصٌ خارج كلّ غرفة ⇒ رفضٌ محلّي", threw);

/* ── ١٠) المرآةُ التجريبية: حرّاسُ الخادم وترحيلُ الرسم القديم ───────────── */
console.log("\n▸ ١٠) المرآةُ التجريبية: نفسُ الحرّاس، والرسمُ القديم لا يُمحى");
mem.set("vp_cage3d_layout_demo1", JSON.stringify({ v: 2, rooms: [{ id: "r1", name: "القديمة", x: 0, z: 0, w: 2, d: 1 }], cages: [{ code: "11", x: 0, z: 0 }, { code: "12", x: 1, z: 0 }] }));
const d1 = demo.demoCageLoad("demo1");
check("رسمُ الجهاز القديم صار صفوفاً", d1.rooms.length === 1 && d1.cages.length === 2 && d1.cages.every((c) => c.room_id === d1.rooms[0].id));
check("  والمفتاحُ القديم حُذف (لا يُقرأ مرّتين)", !mem.has("vp_cage3d_layout_demo1"));
check("  وعيادةٌ تجريبيةٌ ثانية لا ترى صفوفها", demo.demoCageLoad("demo2").cages.length === 0);
globalThis.__db = { admissions: [{ id: "a9", pet_id: "p9", status: "active", cage: "11" }], pets: [{ id: "p9", name: "ميشو" }] };
let err = null;
try { demo.demoCageApply("demo1", [{ op: "cage_delete", id: d1.cages[0].id }]); } catch (e) { err = e; }
check("حذفُ قفصٍ مسكون يُرفض بالرمز نفسه", err?.message === "cage_occupied_delete", err?.message);
err = null;
try { demo.demoCageApply("demo1", [{ op: "room_delete", id: d1.rooms[0].id }]); } catch (e) { err = e; }
check("حذفُ غرفةٍ فيها أقفاص يُرفض", err?.message === "room_not_empty", err?.message);
err = null;
try { demo.demoCageApply("demo1", [{ op: "cage_update", id: "nope", room_id: d1.rooms[0].id, code: "13", x: 0, z: 0, color: null, facing: 0, level: 0 }]); } catch (e) { err = e; }
check("تحديثُ صفٍّ غير موجود يُرفض لا يُخلق", err?.message === "cage_row_gone", err?.message);
err = null;
try {
  demo.demoCageApply("demo1", [
    { op: "cage_update", id: d1.cages[0].id, room_id: d1.rooms[0].id, code: "12", x: 0, z: 0, color: null, facing: 0, level: 0 },
    { op: "cage_update", id: d1.cages[1].id, room_id: d1.rooms[0].id, code: "11", x: 1, z: 0, color: null, facing: 0, level: 0 },
  ]);
} catch (e) { err = e; }
check("تبادلُ رقمين ينجح (الحكمُ على الحالة النهائية كالخادم)", err === null, err?.message);
check("  والساكنُ تبع قفصَه", globalThis.__db.admissions[0].cage === "12", globalThis.__db.admissions[0].cage);
err = null;
const fresh = { id: "a10", pet_id: "p10", status: "active", cage: "12" };
try { demo.demoAdmissionCageGuard(globalThis.__db, fresh, null, "demo1"); } catch (e) { err = e; }
check("دخولٌ جديد بقفصٍ مسكون ⇒ «بلا قفص» لا رفض (كالخادم)", err === null && fresh.cage === "", `${err?.message} ${fresh.cage}`);
err = null;
globalThis.__db.admissions.push({ id: "a12", pet_id: "p12", status: "active", cage: "11" });
const mv = { id: "a12", pet_id: "p12", status: "active", cage: "12" };
try { demo.demoAdmissionCageGuard(globalThis.__db, mv, { status: "active", cage: "11" }, "demo1"); } catch (e) { err = e; }
check("نقلٌ إلى قفصٍ مسكون ⇒ رفضٌ يسمّي الساكن", err?.message === "cage_occupied" && err?.cageErr === "errOccupied" && err?.vars?.name === "ميشو",
  `${err?.message} ${err?.cageErr} ${JSON.stringify(err?.vars)}`);
err = null;
try { demo.demoAdmissionCageGuard(globalThis.__db, { ...mv, cage: "99" }, { status: "active", cage: "11" }, "demo1"); } catch (e) { err = e; }
check("نقلُ مربوطٍ إلى رقمٍ غير مرسوم ⇒ cage_not_drawn", err?.message === "cage_not_drawn" && err?.cageErr === "errCageNotDrawn", err?.message);
err = null;
try { demo.demoAdmissionCageGuard(globalThis.__db, { ...mv, cage: "98" }, { status: "active", cage: "97" }, "demo1"); } catch (e) { err = e; }
check("يتيمٌ يتنقّل بين أرقامٍ غير مرسومة ⇒ يمرّ", err === null, err?.message);
globalThis.__db.admissions.pop();
const re = { id: "a11", pet_id: "p11", status: "active", cage: "12" };
demo.demoAdmissionCageGuard(globalThis.__db, re, { status: "discharged", cage: "12" }, "demo1");
check("إعادةُ تفعيلِ مُخرَجٍ قفصُه مسكون ⇒ «بلا قفص» لا استيلاء", re.cage === "");
err = null;
globalThis.__db.admissions.push({ id: "a13", pet_id: "p13", status: "active", cage: "77" });
globalThis.__db.pets.push({ id: "p13", name: "بسبوس" });
const occCage = demo.demoCageLoad("demo1").cages.find((c) => c.code === "12");
try { demo.demoCageApply("demo1", [{ op: "cage_update", ...occCage, code: "77" }]); } catch (e) { err = e; }
check("قفصٌ مسكون يأخذ رقمَ راقدٍ يتيم ⇒ code_held_by_orphan بالاسم", err?.message === "code_held_by_orphan" && err?.vars?.name === "بسبوس", `${err?.message} ${JSON.stringify(err?.vars)}`);
check("  وما تغيّر شي (كلُّها أو لا شيء)", globalThis.__db.admissions[0].cage === "12" && demo.demoCageLoad("demo1").cages.some((c) => c.code === "12"));

console.log(`\n${fails ? "✗" : "✓"} cage-rows-test: ${passes} نجحت، ${fails} فشلت`);
if (fails) process.exit(1);
