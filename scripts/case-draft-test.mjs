/* ============================================================================
 * فحصُ مسودّة «حالة جديدة» — formDraft.ts + useFormDraft.ts + caseDraft.ts + draftPurge.ts (١٧/١٠).
 *
 * «بنصّ ما أسجّل الحالة السستم يرجع يحمل ويعيد كل الشغل من الصفر»: النموذجُ عاش
 * بحالة المكوّن وحدها. swUpdate.ts أوقف التحميلَ تحت اليد؛ وهذا يفحص خطَّ الدفاع
 * الثاني — أيُّ تحميلٍ، مهما كان سببُه، لا يُسقط ما كُتب — وما أمسكه تدقيقٌ عدائيّ عليه:
 *   ١) المخزن: ما حُفظ يُقرأ بعد «تحميل»، بنطاق العيادة والمستخدم وحدهما؛ فتحتان لا تكتب
 *      إحداهما فوق الأخرى؛ ٧ أيام وسقفُ ٥ — **والكنسُ على كلّ النطاقات** وسقفُ الجهاز؛ فوق
 *      ٤٠٠ ألف حرف أو امتلأ التخزين ⇒ بلا الصور ولا يرمي؛ والخروجُ يمسحها ويوقف حفظَها.
 *   ٢) الخطّاف بسلوكه (React مصغَّر): النطاقُ يتبدّل والنموذجُ مفتوح ⇒ لا يُكتب ما كُتب لعيادةٍ
 *      بنطاق أخرى؛ الحفظُ يمسح مسودّاتِ الحالة نفسِها ويُبقي غيرَها؛ الاسترجاعُ يتبنّى.
 *   ٣) قواعدُ الحالة: الفارغُ لا يُعرض، ومالكُ السجلّ ليس كتابة، و«وُجد» الرقمُ التسلسليّ فقط
 *      والمربّعُ يطابق الحيوانَ المعروض، و«هذه الحالةُ انحفظت» بالتطبيع على الطرفين.
 *   ٤) التوصيل: NewCase والخروج.
 *
 *   node scripts/case-draft-test.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got !== undefined ? ` — ${got}` : ""}`); } };

/* React مصغَّر لمكوّنٍ واحد: useRef/useState/useCallback/useEffect كما يستعملها الخطّاف —
 * التأثيراتُ تجري بعد «الرسم» وتنظيفُها عند تغيّر الاعتماديات أو الإزالة. */
const SHIM = `
let slots = [], i = 0, pending = [];
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
export function useRef(v) { const k = i++; if (!slots[k]) slots[k] = { current: v }; return slots[k]; }
export function useState(init) { const k = i++; if (!slots[k]) slots[k] = { v: typeof init === "function" ? init() : init }; const s = slots[k]; return [s.v, (n) => { s.v = typeof n === "function" ? n(s.v) : n; }]; }
export function useCallback(fn, deps) { const k = i++; if (!slots[k] || changed(slots[k].deps, deps)) slots[k] = { fn, deps }; return slots[k].fn; }
export function useEffect(fn, deps) { const k = i++; const prev = slots[k]; if (!prev || changed(prev.deps, deps)) pending.push(() => { prev?.cleanup?.(); slots[k] = { deps, cleanup: fn() }; }); }
export function __render(hook, props) { i = 0; pending = []; const r = hook(props); pending.forEach((f) => f()); return r; }
export function __unmount() { slots.forEach((s) => s?.cleanup?.()); slots = []; }
`;
const dir = mkdtempSync(join(tmpdir(), "casedraft-"));
writeFileSync(join(dir, "react-shim.mjs"), SHIM);
const src = (p) => join(process.cwd(), p).replace(/\\/g, "/");
writeFileSync(join(dir, "entry.ts"), [
  `export * from "${src("src/lib/formDraft.ts")}";`,
  `export * from "${src("src/lib/caseDraft.ts")}";`,
  `export * from "${src("src/lib/draftPurge.ts")}";`,
  `export { emptyIntake } from "${src("src/lib/intake.ts")}";`,
  `export { useFormDraft } from "${src("src/lib/useFormDraft.ts")}";`,
  `export { __render, __unmount } from "react";`,
].join("\n"));
// نسختان من الحزمة = تبويبان: حالةُ الوحدات مستقلّة (React والإيقاف)، والتخزينُ مشترك.
for (const out of ["m.mjs", "m2.mjs"]) {
  await build({ entryPoints: [join(dir, "entry.ts")], bundle: true, format: "esm", platform: "node", outfile: join(dir, out), logLevel: "silent",
    alias: { "@": join(process.cwd(), "src"), react: join(dir, "react-shim.mjs") } });
}

/** localStorage مزيّف — بسقفٍ اختياريّ للبايتات (امتلاء الجهاز). */
function memStore(capBytes = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      const before = m.get(k);
      m.set(k, String(v));
      if (size() > capBytes) { if (before === undefined) m.delete(k); else m.set(k, before); const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
    },
    removeItem: (k) => { m.delete(k); },
  };
}
// بيئةُ المتصفّح التي يلمسها الخطّاف: التخزين ومؤقّتُ التأجيل والأحداث.
const LS = memStore();
let timers = [];
globalThis.localStorage = LS;
globalThis.window = {
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: (id) => { timers[id - 1] = null; },
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const runTimers = () => { const t = timers; timers = []; t.forEach((f) => f && f()); };

const fd = await import(pathToFileURL(join(dir, "m.mjs")).href);
const fd2 = await import(pathToFileURL(join(dir, "m2.mjs")).href); // التبويبُ الثاني
rmSync(dir, { recursive: true, force: true });
const cd = fd, intake = fd;

const animal = (p = {}) => ({
  key: "a1", photo: null, name: "", species: "dog", breed: "", sex: "unknown", dob: "", weight: "", color: "",
  microchip: "", allergies: "", notes: "", health: "healthy", diagnosis: "", disp: "log", cage: "", addMeds: true,
  intake: intake.emptyIntake(), ...p,
});
const serial = (p = {}) => ({ serial: "", found: false, admittedOn: "2026-10-17", disp: "log", cage: "", addMeds: true, health: "healthy", diagnosis: "", intake: intake.emptyIntake(), ...p });
const kase = (p = {}) => ({ v: 1, entry: "new", step: 1, admittedOn: "2026-10-17", ownerCollapsed: false, owner: cd.emptyOwner(), animals: [animal()], serial: serial(), ...p });
const owner = (p) => ({ ...cd.emptyOwner(), ...p });

const A = { form: "newcase", clinic: "clinic-A", user: "doc-1" };
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

console.log("▸ formDraft: ما كُتب ينجو من التحميل");
{
  const s = memStore();
  const typed = kase({ owner: owner({ name: "ابو علي", phone: "+964 7701234567" }), animals: [animal({ name: "لولو", notes: "يستفرغ من يومين" })] });
  check("الحفظ ⇒ «كامل»", fd.saveDraft(A, "tab1", typed, { store: s, now: NOW }) === "full");
  const after = fd.listDrafts(A, s, NOW + 5_000);
  check("بعد التحميل تُقرأ كما كُتبت", after.length === 1 && after[0].data.owner.name === "ابو علي" && after[0].data.animals[0].notes === "يستفرغ من يومين", JSON.stringify(after[0]?.data?.owner));
  check("  بمعرّف فتحتها ووقتها", after[0]?.id === "tab1" && after[0]?.savedAt === NOW);
  check("عيادةٌ أخرى لا تراها", fd.listDrafts({ ...A, clinic: "clinic-B" }, s, NOW).length === 0);
  check("  ولا زميلٌ على نفس الجهاز", fd.listDrafts({ ...A, user: "doc-2" }, s, NOW).length === 0);
  check("  ولا نموذجٌ آخر", fd.listDrafts({ ...A, form: "other" }, s, NOW).length === 0);
  fd.dropDraft(A, "tab1", s);
  check("الحذف يمسحها", fd.listDrafts(A, s, NOW).length === 0);
}

console.log("▸ formDraft: فتحتان، وعمر، وسقف، وكنسُ الجهاز كلِّه");
{
  const s = memStore();
  fd.saveDraft(A, "tab1", kase({ owner: owner({ name: "الأولى" }) }), { store: s, now: NOW });
  fd.saveDraft(A, "tab2", kase({ owner: owner({ name: "الثانية" }) }), { store: s, now: NOW + 1_000 });
  const both = fd.listDrafts(A, s, NOW + 2_000);
  check("فتحتان ⇒ مسودّتان، لا تكتب واحدةٌ فوق الأخرى", both.length === 2 && both[0]?.data.owner.name === "الثانية", both.map((d) => d.data.owner.name).join("|"));
  check("بعد ٧ أيام تنتهي وتُمسح (بنطاقها)", fd.listDrafts(A, s, NOW + 7 * DAY + 2_000).length === 0 && s.m.size === 0, String(s.m.size));
  const s2 = memStore();
  for (let i = 0; i < 7; i++) fd.saveDraft(A, `t${i}`, kase({ owner: owner({ name: `م${i}` }) }), { store: s2, now: NOW + i * 1_000 });
  const capped = fd.listDrafts(A, s2, NOW + 10_000);
  check(`سقفُ النطاق ${fd.DRAFT_MAX_PER_SCOPE} — الأقدمُ يُطوى`, capped.length === fd.DRAFT_MAX_PER_SCOPE && capped[0].id === "t6" && !capped.some((d) => d.id === "t0" || d.id === "t1"), capped.map((d) => d.id).join(","));
  const s3 = memStore();
  s3.setItem(fd.scopePrefix(A) + "bad", "{not json");
  s3.setItem(fd.scopePrefix(A) + "liar", JSON.stringify({ id: "other", savedAt: NOW, data: {} }));
  check("التالفُ والمزوَّرُ يُمسحان ولا يُعرضان", fd.listDrafts(A, s3, NOW).length === 0 && s3.m.size === 0);
  check("نطاقٌ بنقطتين لا يتسرّب لغيره", fd.scopePrefix({ form: "newcase", clinic: "a:b", user: "c" }) !== fd.scopePrefix({ form: "newcase", clinic: "a", user: "b:c" }));
  // الكنس: موظّفٌ ترك وعيادةٌ زارها المشغّل — نطاقاتٌ لا تُفتح ثانيةً (تدقيقٌ عدائيّ)
  const s4 = memStore();
  fd.saveDraft({ ...A, user: "left-staff" }, "old", kase({ owner: owner({ name: "قديم" }) }), { store: s4, now: NOW });
  fd.saveDraft({ ...A, clinic: "visited" }, "fresh", kase({ owner: owner({ name: "حديث" }) }), { store: s4, now: NOW + 6 * DAY });
  s4.setItem("vp_draft:newcase:x:y:broken", "{garbage");
  s4.setItem("vp_sale_draft_clinic-A", "{\"cart\":[]}");
  fd.sweepDrafts(s4, NOW + 7 * DAY + 1_000);
  check("الكنسُ يمسح المنتهيةَ والتالفة بكلّ النطاقات", s4.getItem(fd.scopePrefix({ ...A, user: "left-staff" }) + "old") === null && s4.getItem("vp_draft:newcase:x:y:broken") === null);
  check("  ويُبقي الحيّة، ولا يلمس غيرَ المسودّات", s4.getItem(fd.scopePrefix({ ...A, clinic: "visited" }) + "fresh") !== null && s4.getItem("vp_sale_draft_clinic-A") !== null);
  const s5 = memStore();
  for (let i = 0; i < 15; i++) fd.saveDraft({ ...A, user: `u${i}` }, `d${i}`, kase({ owner: owner({ name: `م${i}` }) }), { store: s5, now: NOW + i });
  fd.sweepDrafts(s5, NOW + 100);
  const left = [...s5.m.keys()].filter((k) => k.startsWith("vp_draft:"));
  check(`  وسقفُ الجهاز ${fd.DRAFT_MAX_TOTAL} (الأقدمُ يُطوى)`, left.length === fd.DRAFT_MAX_TOTAL && !left.some((k) => k.endsWith(":d0") || k.endsWith(":d2")), String(left.length));
}

console.log("▸ formDraft: الحجم والتخزينُ الممتلئ (تدقيقٌ عدائيّ)");
{
  const photo = "data:image/jpeg;base64," + "A".repeat(150_000);
  const litter = kase({ owner: owner({ name: "ابو علي" }), animals: [1, 2, 3].map((i) => animal({ key: `a${i}`, name: `جرو${i}`, photo })) });
  const roomy = memStore();
  const r0 = fd.saveDraft(A, "litter", litter, { store: roomy, now: NOW, lighten: cd.lightenCaseDraft });
  const got0 = fd.listDrafts(A, roomy, NOW)[0];
  check("فوق ٤٠٠ ألف حرف ⇒ بلا الصور ولو التخزينُ فارغ (لا تأكل مكانَ السلّة والطابور)", r0 === "light" && got0?.lightened === true && got0.data.animals.every((a) => a.photo === null && a.name), r0);
  const one = kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "لولو", photo: "data:image/jpeg;base64," + "A".repeat(60_000) })] });
  const s = memStore(20_000);
  const r = fd.saveDraft(A, "tab1", one, { store: s, now: NOW, lighten: cd.lightenCaseDraft });
  const got = fd.listDrafts(A, s, NOW)[0];
  check("امتلأ التخزين ⇒ بلا الصور («خفيفة»)", r === "light" && got?.lightened === true && got.data.animals[0].photo === null && got.data.animals[0].name === "لولو", r);
  let threw = false, r2;
  try { r2 = fd.saveDraft(A, "tab1", one, { store: memStore(10), now: NOW, lighten: cd.lightenCaseDraft }); } catch { threw = true; }
  check("ولا مكانَ حتى لها ⇒ «فشل» بلا رمي", !threw && r2 === "failed", String(r2));
  check("بلا تخزين (وضعٌ خاصّ) ⇒ لا شيء ولا رمي", fd.saveDraft(A, "x", one, { store: null }) === "failed" && fd.listDrafts(A, null).length === 0);
}

console.log("▸ useFormDraft بسلوكه: النطاقُ يتبدّل تحت النموذج (تدقيقٌ عدائيّ)");
{
  const B = { form: "newcase", clinic: "clinic-B", user: "op" };
  const O = { form: "newcase", clinic: "op-own", user: "op" };
  const typed = kase({ owner: owner({ name: "زبون عيادة B", phone: "+964 7709999999" }), animals: [animal({ name: "ريكس" })] });
  const props = (scope, value) => ({ scope, value, isEmpty: (d) => cd.caseDraftIsEmpty(d), lighten: cd.lightenCaseDraft });
  fd.__render(fd.useFormDraft, props(B, kase()));
  fd.__render(fd.useFormDraft, props(B, typed)); runTimers();
  check("الكتابةُ تُحفظ بنطاقها", fd.listDrafts(B).length === 1);
  fd.__render(fd.useFormDraft, props(O, typed)); runTimers();   // جلسةُ المشغّل انتهت: العيادةُ صارت O
  check("النطاقُ تبدّل ⇒ لا يُكتب ما كُتب لـB بنطاق O", fd.listDrafts(O).length === 0 && ![...LS.m.keys()].some((k) => k.startsWith(fd.scopePrefix(O))));
  fd.__unmount();
  check("  ولا عند خروج النموذج", fd.listDrafts(O).length === 0);
  check("  ومسودّةُ B باقيةٌ بأرضها", fd.listDrafts(B).length === 1);
  LS.m.clear();
}
{
  const props = (value) => ({ scope: A, value, isEmpty: (d) => cd.caseDraftIsEmpty(d), lighten: cd.lightenCaseDraft });
  // فتحةٌ أولى: كُتبت ثم رجع الطبيبُ للسجلّ (خروجُ النموذج يحفظها)
  fd.__render(fd.useFormDraft, props(kase({ owner: owner({ name: "أبو علي" }), animals: [animal({ name: "لولو" })] })));
  fd.__unmount();
  fd.saveDraft(A, "other-case", kase({ owner: owner({ name: "ام حسن" }), animals: [animal({ name: "بسبوس" })] }), {});
  // فتحةٌ ثانية من ملفّ المالك: كتبها من جديد وحفظها
  const savedCase = kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "لولو" })] });
  const h = fd.__render(fd.useFormDraft, props(savedCase)); runTimers();
  check("قبل الحفظ: عرضٌ لمسودّتين أخريين", h.offer !== null && fd.listDrafts(A).length === 3, String(fd.listDrafts(A).length));
  h.clear((d) => cd.draftIsSavedCase(d, savedCase.owner, ["لولو"]));
  const left = fd.listDrafts(A).map((d) => d.data.owner.name);
  check("الحفظُ يمسح مسودّتَه ومسودّةَ الحالة نفسِها (أبو/ابو)", !left.includes("أبو علي") && !left.includes("ابو علي"), left.join("|"));
  check("  ويُبقي مسودّةَ حالةٍ أخرى", left.length === 1 && left[0] === "ام حسن", left.join("|"));
  fd.__unmount();
  check("  ولا يعيد الكتابةَ عند خروج النموذج", fd.listDrafts(A).length === 1);
  LS.m.clear();
}
{
  const props = (value) => ({ scope: A, value, isEmpty: (d) => cd.caseDraftIsEmpty(d), lighten: cd.lightenCaseDraft });
  fd.saveDraft(A, "before-reload", kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "لولو" })] }), {});
  const h = fd.__render(fd.useFormDraft, props(kase()));      // «تحميل»: النموذجُ يفتح فارغاً
  check("بعد التحميل: تُعرض ولا تُسترجع وحدها", h.offer?.id === "before-reload" && h.offer.data.owner.name === "ابو علي");
  const rec = h.take();
  const h2 = fd.__render(fd.useFormDraft, props(rec.data)); runTimers();
  check("«رجّعها» يتبنّاها (لا مسودّةَ ثانية)", fd.listDrafts(A).length === 1 && fd.listDrafts(A)[0].id === "before-reload" && h2.offer === null);
  fd.__unmount();
  LS.m.clear();
}

console.log("▸ caseDraft: متى تُعدّ فارغة، و«وُجد»، و«انحفظت»");
{
  check("نموذجٌ لم يُلمس ⇒ فارغ", cd.caseDraftIsEmpty(kase()));
  check("اختيارُ النوع والجنس وحده ⇒ فارغ (افتراضات)", cd.caseDraftIsEmpty(kase({ animals: [animal({ species: "cat", sex: "female" })] })));
  check("حرفٌ باسم المالك ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ owner: owner({ name: "ا" }) })));
  check("التاريخُ المرضيّ وحده ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ animals: [animal({ intake: { ...intake.emptyIntake(), history: "يستفرغ" } })] })));
  check("رقمٌ تسلسليّ بالتبويب الثاني ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ entry: "serial", serial: serial({ serial: "10001" }) })));
  const pre = { name: "ابو علي", phone: "+964 7701234567", email: "", governorate: "بغداد", area: "" };
  check("مالكٌ جاء جاهزاً من السجلّ ⇒ فارغ (ليس كتابة)", cd.caseDraftIsEmpty(kase({ owner: { ...pre } }), pre));
  check("  وتعديلُه ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ owner: { ...pre, area: "الكرادة" } }), pre));
  // «وُجد» (تدقيقٌ عدائيّ): وجد A ثم عدّل المربّعَ إلى رقم B بلا بحث
  check("المربّعُ يطابق الحيوانَ المعروض ⇒ وُجد", cd.serialFound("10001", "10001", serial(), false) === true);
  check("  عُدِّل المربّعُ بعد البحث ⇒ لم يوجد (الاسترجاعُ لا يبحث عن B وحده)", cd.serialFound("10002", "10001", serial(), false) === false);
  check("  ومسترجَعٌ لم يرجع بحثُه بعد ⇒ يبقى «وُجد» لرقمه", cd.serialFound("10001", null, { found: true, serial: "10001" }, false) === true);
  check("  ورقمٌ آخر أو «لم يوجد» ⇒ لا", cd.serialFound("10003", null, { found: true, serial: "10001" }, false) === false && cd.serialFound("10001", null, { found: true, serial: "10001" }, true) === false);
  const saved = owner({ name: "أبو علي", phone: "+964 770 123 4567" });
  check("«انحفظت»: نفسُ المالك بهمزةٍ أخرى ونفسُ الحيوان", cd.draftIsSavedCase(kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "لولو" })] }), saved, ["لولو"]));
  check("  أو بالهاتف وحده (أرقامُه)", cd.draftIsSavedCase(kase({ owner: owner({ phone: "+9647701234567" }), animals: [animal({ name: "لولو" })] }), saved, ["لولو"]));
  check("  حيوانٌ آخر ⇒ حالةٌ أخرى", !cd.draftIsSavedCase(kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "ريكس" })] }), saved, ["لولو"]));
  check("  مالكٌ آخر ⇒ حالةٌ أخرى", !cd.draftIsSavedCase(kase({ owner: owner({ name: "ام حسن" }), animals: [animal({ name: "لولو" })] }), saved, ["لولو"]));
  check("  وهاتفٌ قصيرٌ لا يطابق وحده", !cd.draftIsSavedCase(kase({ owner: owner({ phone: "77" }) }), owner({ phone: "77" }), []));
}

console.log("▸ «انحفظت»: هاتفٌ مختلف، وحيوانٌ بلا اسم فيه شغل (تدقيقٌ عدائيّ ثانٍ)");
{
  const savedOwner = owner({ name: "محمد", phone: "+964 7801112222" });
  check("نفسُ الاسم وهاتفان كاملان مختلفان ⇒ شخصان (لا تُمسح مسودّتُه)",
    !cd.draftIsSavedCase(kase({ owner: owner({ name: "محمد", phone: "+964 7709998888" }), animals: [animal({ name: "مشمش", diagnosis: "x" })] }), savedOwner, ["مشمش"]));
  check("  وحيوانٌ بلا اسم فيه تشخيصٌ وصورة ⇒ ليس «هذه الحالة»",
    !cd.draftIsSavedCase(kase({ owner: owner({ name: "محمد" }), animals: [animal({ weight: "4", diagnosis: "التهاب", photo: "data:x" })] }), savedOwner, ["لولو"]));
  check("  ومالكٌ وحده بلا حيوانٍ مكتوب ⇒ نعم (جزءٌ من الحالة نفسِها)",
    cd.draftIsSavedCase(kase({ owner: owner({ name: "محمد" }) }), savedOwner, ["لولو"]));
  check("  ونفسُ الاسم وهاتفُ المسودّة ناقص ⇒ يطابق بالاسم",
    cd.draftIsSavedCase(kase({ owner: owner({ name: "محمد", phone: "+964 " }), animals: [animal({ name: "مشمش" })] }), savedOwner, ["مشمش"]));
}

console.log("▸ تبويبان على الجهاز نفسِه (تدقيقٌ عدائيّ ثانٍ)");
{
  const props = (value) => ({ scope: A, value, isEmpty: (d) => cd.caseDraftIsEmpty(d), lighten: cd.lightenCaseDraft });
  const X = kase({ owner: owner({ name: "ابو علي" }), animals: [animal({ name: "لولو" })] });
  const savedOf = (d) => cd.draftIsSavedCase(d, X.owner, ["لولو"]);
  // (أ) التبويب ١ يكتب، والتبويب ٢ يسترجعها ويحفظها، ثم يُغلق التبويب ١
  fd.__render(fd.useFormDraft, props(X)); runTimers();
  let h2 = fd2.__render(fd2.useFormDraft, props(kase()));
  const rec = h2.take();
  h2 = fd2.__render(fd2.useFormDraft, props(rec.data)); runTimers();
  h2.clear(savedOf);
  check("الحفظُ بتبويبٍ آخر ⇒ لا مسودّة", fd.listDrafts(A).length === 0);
  fd.__unmount(); fd2.__unmount();
  check("  وإغلاقُ التبويب الأوّل لا يعيدها «ما انحفظت»", fd.listDrafts(A).length === 0, String(fd.listDrafts(A).length));
  LS.m.clear();
  // (ب) التبويب ٢ كتبها من جديد بلا استرجاع وحفظها
  fd.__render(fd.useFormDraft, props(X)); runTimers();
  h2 = fd2.__render(fd2.useFormDraft, props(X)); runTimers();
  h2.clear(savedOf);
  fd.__unmount(); fd2.__unmount();
  check("  وكتابتُها من جديد وحفظُها ⇒ الأوّلُ لا يعيدها أيضاً", fd.listDrafts(A).length === 0, String(fd.listDrafts(A).length));
  LS.m.clear();
}
{
  const props = (value) => ({ scope: A, value, isEmpty: (d) => cd.caseDraftIsEmpty(d), lighten: cd.lightenCaseDraft });
  const X = kase({ owner: owner({ name: "ابو علي", phone: "+964 7701234567" }), animals: [animal({ name: "لولو" })] });
  fd.__render(fd.useFormDraft, props(X)); runTimers();     // «حالة جديدة» مفتوحةٌ بالتبويب ١
  await new Promise((r) => setTimeout(r, 5));
  fd2.purgeDrafts();                                         // الخروجُ ضُغط بالتبويب ٢
  check("الخروجُ بتبويبٍ آخر يمسحها", fd.listDrafts(A).length === 0);
  fd.__unmount();                                            // SIGNED_OUT يزيح نموذجَ التبويب ١ فيحفظه
  check("  وإزاحةُ النموذج بالتبويب ١ لا تعيد كتابتَها (هاتفُ المالك لا يبقى)", fd.listDrafts(A).length === 0 && ![...LS.m.keys()].some((k) => k.startsWith("vp_draft:")));
  await new Promise((r) => setTimeout(r, 5));
  fd.__render(fd.useFormDraft, props(X)); runTimers();     // دخولٌ جديد بعده: النموذجُ يحفظ عادياً
  check("  ونموذجٌ فُتح بعد الخروج يحفظ عادياً", fd.listDrafts(A).length === 1);
  fd.__unmount();
  LS.m.clear();
}

console.log("▸ الإشعار يقول ما حدث (تدقيقٌ عدائيّ ثانٍ)");
{
  const en = JSON.parse(readFileSync("src/i18n/en.json", "utf8")).newCase;
  const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8")).newCase;
  check("«بلا الصور» لا يدّعي «الذاكرة ممتلئة» (فوق ٤٠٠ ألف حرف ليس امتلاءً)", !/full/i.test(en.draftLight) && !/ممتلئ/.test(ar.draftLight), `${en.draftLight} | ${ar.draftLight}`);
  check("  و«لم تُحفظ» يقولها", /full/i.test(en.draftFailed) && /ممتلئ/.test(ar.draftFailed));
}

console.log("▸ الخروج: تُمسح المسودّاتُ ويقف حفظُها (تدقيقٌ عدائيّ)");
{
  fd.saveDraft(A, "x1", kase({ owner: owner({ name: "ابو علي", phone: "+964 7701234567" }) }), {});
  LS.setItem("vp_sale_draft_clinic-A", "{}");
  fd.purgeDrafts();
  check("purgeDrafts يمسح كلَّ vp_draft:* ولا يلمس غيرَها", ![...LS.m.keys()].some((k) => k.startsWith("vp_draft:")) && LS.getItem("vp_sale_draft_clinic-A") === "{}");
  check("  وبعده لا حفظ (خروجُ النموذج من الشاشة لا يعيد كتابتَها)", fd.saveDraft(A, "x2", kase({ owner: owner({ name: "س" }) }), {}) === "failed" && fd.listDrafts(A).length === 0);
}

console.log("▸ التوصيل: NewCase والخروج");
{
  const src = readFileSync("src/pages/NewCase.tsx", "utf8");
  check("يحفظ بـuseFormDraft بنطاق العيادة والمستخدم", /useFormDraft<CaseDraft>\(/.test(src) && /form:\s*"newcase",\s*clinic:\s*user\.clinic_id/.test(src) && /user:\s*user\.id/.test(src));
  const finish = src.slice(src.indexOf("const finish = async"), src.indexOf("if (outcomes)"));
  const okAt = finish.indexOf("playSuccess();"), clearAt = finish.indexOf("draft.clear("), catchAt = finish.indexOf("} catch (e)");
  check("الحفظُ الناجح يمسح المسودّة (بعد النجاح لا قبله) ومعها الحالةَ نفسَها", clearAt > okAt && okAt > catchAt && catchAt > 0 && /draft\.clear\(\(d\) => draftIsSavedCase\(/.test(finish), `${catchAt}/${okAt}/${clearAt}`);
  check("  ولا انتقالَ بعد خطأ «معلومات الحالة» (التوستُ يبقى)", /disp === "record" && intakeFailed\.length === 0\)/.test(finish));
  check("  وإدخالُ الرقم التسلسليّ يمسح مسودّاتِ رقمه", /onAdmitted=\{\(o, sn\) => \{ draft\.clear\(\(d\) => d\.entry === "serial"/.test(src));
  check("  و«وُجد» بقاعدة serialFound", /const found = serialFound\(serial, pet \? pet\.serial : null, initial, notFound\);/.test(src));
  check("  والعرضُ بلا استرجاعٍ صامت (رجّعها/احذفها)", /<DraftOffer /.test(src) && /draft\.take\(\)/.test(src) && /draft\.dismiss\(\)/.test(src));
  const restore = src.slice(src.indexOf("const restoreDraft"), src.indexOf("const discardDraft"));
  check("  والاسترجاعُ يعيد بناءَ النموذج (PhoneInput يأخذ قيمتَه مرّةً)", /setFormKey\(/.test(restore) && (src.match(/key=\{formKey\}/g) ?? []).length >= 3);
  const auth = readFileSync("src/contexts/AuthContext.tsx", "utf8");
  const so = auth.slice(auth.indexOf("const signOut = () =>"), auth.indexOf("window.location.href = \"/login\""));
  check("الخروجُ يمسح المسودّات قبل أن يزيح النموذجَ (setRaw(null))", so.indexOf("purgeDrafts();") > 0 && so.indexOf("purgeDrafts();") < so.indexOf("setRaw(null);"));
}

console.log(`\n${fail ? "✗" : "✓"} case-draft: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
