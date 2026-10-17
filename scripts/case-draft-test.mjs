/* ============================================================================
 * فحصُ مسودّة «حالة جديدة» — src/lib/formDraft.ts + src/lib/caseDraft.ts (١٧/١٠).
 *
 * «بنصّ ما أسجّل الحالة السستم يرجع يحمل ويعيد كل الشغل من الصفر»: النموذجُ عاش
 * بحالة المكوّن وحدها. swUpdate.ts أوقف التحميلَ تحت اليد؛ وهذا يفحص خطَّ الدفاع
 * الثاني — أيُّ تحميلٍ، مهما كان سببُه، لا يُسقط ما كُتب:
 *   ١) المخزن: ما حُفظ يُقرأ بعد «تحميل» (قراءةٌ جديدة من التخزين)، بنطاق العيادة
 *      والمستخدم وحدهما؛ فتحتان لا تكتب إحداهما فوق الأخرى؛ تنتهي بعد ٧ أيام؛ سقفُ
 *      النطاق ٥؛ امتلاءُ التخزين ⇒ تُحفظ بلا الصور ولا يرمي؛ التالفُ يُمسح.
 *   ٢) قواعدُ الحالة: الفارغُ لا يُعرض، وبياناتُ مالكٍ جاءت من السجلّ ليست كتابة،
 *      والصورُ أوّلُ ما يخفّ.
 *   ٣) النموذج: NewCase يحفظ بـuseFormDraft، ويمسح المسودّةَ بعد الحفظ الناجح بالمسارين.
 *
 *   node scripts/case-draft-test.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got !== undefined ? ` — ${got}` : ""}`); } };

const dir = mkdtempSync(join(tmpdir(), "casedraft-"));
const load = async (entry) => {
  const out = join(dir, entry.replace(/\W/g, "_") + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  return import(pathToFileURL(out).href);
};
const fd = await load("src/lib/formDraft.ts");
const cd = await load("src/lib/caseDraft.ts");
const intake = await load("src/lib/intake.ts");
rmSync(dir, { recursive: true, force: true });

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

const animal = (p = {}) => ({
  key: "a1", photo: null, name: "", species: "dog", breed: "", sex: "unknown", dob: "", weight: "", color: "",
  microchip: "", allergies: "", notes: "", health: "healthy", diagnosis: "", disp: "log", cage: "", addMeds: true,
  intake: intake.emptyIntake(), ...p,
});
const serial = (p = {}) => ({ serial: "", found: false, admittedOn: "2026-10-17", disp: "log", cage: "", addMeds: true, health: "healthy", diagnosis: "", intake: intake.emptyIntake(), ...p });
const kase = (p = {}) => ({ v: 1, entry: "new", step: 1, admittedOn: "2026-10-17", ownerCollapsed: false, owner: cd.emptyOwner(), animals: [animal()], serial: serial(), ...p });

const A = { form: "newcase", clinic: "clinic-A", user: "doc-1" };
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

console.log("▸ formDraft: ما كُتب ينجو من التحميل");
{
  const s = memStore();
  const typed = kase({ owner: { ...cd.emptyOwner(), name: "ابو علي", phone: "+964 7701234567" }, animals: [animal({ name: "لولو", notes: "يستفرغ من يومين" })] });
  check("الحفظ ⇒ «كامل»", fd.saveDraft(A, "tab1", typed, { store: s, now: NOW }) === "full");
  // «تحميل»: لا ذاكرةَ إلا التخزين — قراءةٌ جديدة كما يفعل المكوّن بعد الإقلاع.
  const after = fd.listDrafts(A, s, NOW + 5_000);
  check("بعد التحميل تُقرأ كما كُتبت", after.length === 1 && after[0].data.owner.name === "ابو علي" && after[0].data.animals[0].notes === "يستفرغ من يومين", JSON.stringify(after[0]?.data?.owner));
  check("  بمعرّف فتحتها ووقتها", after[0]?.id === "tab1" && after[0]?.savedAt === NOW);
  check("عيادةٌ أخرى لا تراها", fd.listDrafts({ ...A, clinic: "clinic-B" }, s, NOW).length === 0);
  check("  ولا زميلٌ على نفس الجهاز", fd.listDrafts({ ...A, user: "doc-2" }, s, NOW).length === 0);
  check("  ولا نموذجٌ آخر", fd.listDrafts({ ...A, form: "other" }, s, NOW).length === 0);
  fd.dropDraft(A, "tab1", s);
  check("الحذف يمسحها", fd.listDrafts(A, s, NOW).length === 0);
}

console.log("▸ formDraft: فتحتان، وعمر، وسقف");
{
  const s = memStore();
  fd.saveDraft(A, "tab1", kase({ owner: { ...cd.emptyOwner(), name: "الأولى" } }), { store: s, now: NOW });
  fd.saveDraft(A, "tab2", kase({ owner: { ...cd.emptyOwner(), name: "الثانية" } }), { store: s, now: NOW + 1_000 });
  const both = fd.listDrafts(A, s, NOW + 2_000);
  check("فتحتان ⇒ مسودّتان، لا تكتب واحدةٌ فوق الأخرى", both.length === 2, both.map((d) => d.data.owner.name).join("|"));
  check("  الأحدثُ أوّلاً", both[0]?.data.owner.name === "الثانية");
  check("بعد ٧ أيام تنتهي وتُمسح", fd.listDrafts(A, s, NOW + 7 * DAY + 2_000).length === 0 && s.m.size === 0, String(s.m.size));
  const s2 = memStore();
  for (let i = 0; i < 7; i++) fd.saveDraft(A, `t${i}`, kase({ owner: { ...cd.emptyOwner(), name: `م${i}` } }), { store: s2, now: NOW + i * 1_000 });
  const capped = fd.listDrafts(A, s2, NOW + 10_000);
  check(`سقفُ النطاق ${fd.DRAFT_MAX_PER_SCOPE} — الأقدمُ يُطوى`, capped.length === fd.DRAFT_MAX_PER_SCOPE && capped[0].id === "t6" && !capped.some((d) => d.id === "t0" || d.id === "t1"), capped.map((d) => d.id).join(","));
  const s3 = memStore();
  s3.setItem(fd.scopePrefix(A) + "bad", "{not json");
  s3.setItem(fd.scopePrefix(A) + "liar", JSON.stringify({ id: "other", savedAt: NOW, data: {} }));
  check("التالفُ والمزوَّرُ يُمسحان ولا يُعرضان", fd.listDrafts(A, s3, NOW).length === 0 && s3.m.size === 0);
  check("نطاقٌ بنقطتين لا يتسرّب لغيره", fd.scopePrefix({ form: "newcase", clinic: "a:b", user: "c" }) !== fd.scopePrefix({ form: "newcase", clinic: "a", user: "b:c" }));
}

console.log("▸ formDraft: التخزينُ ممتلئ");
{
  const photo = "data:image/jpeg;base64," + "A".repeat(60_000);
  const heavy = kase({ owner: { ...cd.emptyOwner(), name: "ابو علي" }, animals: [animal({ name: "لولو", photo })] });
  const s = memStore(20_000);
  const r = fd.saveDraft(A, "tab1", heavy, { store: s, now: NOW, lighten: cd.lightenCaseDraft });
  const got = fd.listDrafts(A, s, NOW)[0];
  check("امتلأ ⇒ تُحفظ بلا الصور («خفيفة»)", r === "light" && got?.lightened === true && got.data.animals[0].photo === null && got.data.animals[0].name === "لولو", r);
  const tiny = memStore(10);
  let threw = false, r2;
  try { r2 = fd.saveDraft(A, "tab1", heavy, { store: tiny, now: NOW, lighten: cd.lightenCaseDraft }); } catch { threw = true; }
  check("ولا مكانَ حتى لها ⇒ «فشل» بلا رمي (النموذجُ أهمّ من مسودّته)", !threw && r2 === "failed", String(r2));
  check("بلا تخزين (وضعٌ خاصّ) ⇒ لا شيء ولا رمي", fd.saveDraft(A, "x", heavy, { store: null }) === "failed" && fd.listDrafts(A, null).length === 0);
}

console.log("▸ caseDraft: متى تُعدّ فارغة");
{
  check("نموذجٌ لم يُلمس ⇒ فارغ", cd.caseDraftIsEmpty(kase()));
  check("اختيارُ النوع والجنس وحده ⇒ فارغ (افتراضات)", cd.caseDraftIsEmpty(kase({ animals: [animal({ species: "cat", sex: "female" })] })));
  check("حرفٌ باسم المالك ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ owner: { ...cd.emptyOwner(), name: "ا" } })));
  check("ملاحظةٌ بالحيوان ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ animals: [animal({ notes: "x" })] })));
  check("التاريخُ المرضيّ وحده ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ animals: [animal({ intake: { ...intake.emptyIntake(), history: "يستفرغ" } })] })));
  check("رقمٌ تسلسليّ بالتبويب الثاني ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ entry: "serial", serial: serial({ serial: "10001" }) })));
  const pre = { name: "ابو علي", phone: "+964 7701234567", email: "", governorate: "بغداد", area: "" };
  check("مالكٌ جاء جاهزاً من السجلّ ⇒ فارغ (ليس كتابة)", cd.caseDraftIsEmpty(kase({ owner: { ...pre } }), pre));
  check("  وتعديلُه ⇒ ليست فارغة", !cd.caseDraftIsEmpty(kase({ owner: { ...pre, area: "الكرادة" } }), pre));
  const who = cd.caseDraftWho(kase({ owner: { ...cd.emptyOwner(), phone: "+964 770" }, animals: [animal({ name: "لولو" }), animal({ key: "a2", name: " " })] }));
  check("العرضُ يقول المالك (أو هاتفه) والحيوانات المسمّاة", who.owner === "+964 770" && who.animals.length === 1 && who.animals[0] === "لولو", JSON.stringify(who));
}

console.log("▸ NewCase: النموذجُ موصول");
{
  const src = readFileSync("src/pages/NewCase.tsx", "utf8");
  check("يحفظ بـuseFormDraft", /useFormDraft<CaseDraft>\(/.test(src));
  check("  وبنطاق العيادة والمستخدم", /form:\s*"newcase",\s*clinic:\s*user\.clinic_id/.test(src) && /user:\s*user\.id/.test(src));
  const finish = src.slice(src.indexOf("const finish = async"), src.indexOf("if (outcomes)"));
  const okAt = finish.indexOf("playSuccess();"), clearAt = finish.indexOf("draft.clear()");
  const catchAt = finish.indexOf("} catch (e)");
  check("الحفظُ الناجح يمسح المسودّة (بعد النجاح لا قبله)", clearAt > okAt && okAt > catchAt && catchAt > 0, `${catchAt}/${okAt}/${clearAt}`);
  check("  وإدخالُ الرقم التسلسليّ أيضاً", /onAdmitted=\{\(o\) => \{ draft\.clear\(\);/.test(src));
  check("  والعرضُ بلا استرجاعٍ صامت (رجّعها/احذفها)", /<DraftOffer /.test(src) && /draft\.take\(\)/.test(src) && /draft\.dismiss\(\)/.test(src));
  /* أمسكه المختبر: «رجّعها» أعاد الاسمَ والحيوان والشكوى، والهاتفُ رجع فارغاً — PhoneInput
   * (ومثلُه المحافظة والعمر واللون) يأخذ قيمتَه مرّةً عند البناء. فالاسترجاعُ يعيد بناءَ النموذج كلِّه. */
  const restore = src.slice(src.indexOf("const restoreDraft"), src.indexOf("const discardDraft"));
  check("  والاسترجاعُ يعيد بناءَ النموذج (حقولٌ تأخذ قيمتَها مرّةً)", /setFormKey\(/.test(restore)
    && (src.match(/key=\{formKey\}/g) ?? []).length >= 3, `${(src.match(/key=\{formKey\}/g) ?? []).length} حاويات`);
}

console.log(`\n${fail ? "✗" : "✓"} case-draft: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
