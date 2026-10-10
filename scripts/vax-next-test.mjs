/* ============================================================================
 * سلسلةُ اللقاح (vaxNext.ts) — الجرعةُ المعطاةُ تسأل عن الجاية، والمعطاةُ اليوم تستهلك المستحقّة.
 *
 * القياسُ الذي سبقه (١٠/١٠، الإنتاج): «أعطِ الجرعة» بالسجلّ وعلامةُ «تمّ» بالتقويم كانتا تقلبان
 * الجرعةَ «معطاة» بلا سؤال عن التالية، فالكادرُ يعيد إضافةَ اللقاح ليحصل على موعد (٤٠ جرعةً
 * مكرّرة بنفس اليوم)، و«انعطى اليوم» يترك المستحقّةَ معلّقة (نحو ١١٢ تذكيراً كاذباً).
 * السلوكُ الحقيقيّ للحفظ مفحوصٌ بـrepo-demo-test (persistMedicalEntries على المخزن التجريبيّ).
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "vaxnext-"));
const out = join(dir, "m.mjs");
await build({
  entryPoints: ["src/lib/vaxNext.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": join(process.cwd(), "src") },
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const V = (id, name, status, extra = {}) => ({ id, pet_id: "p", name, status, due_date: null, administered_at: null, ...extra });

console.log("▸ «نفسُ المدّة السابقة»");
{
  // سلسلةُ جرو: جرعةٌ ١/٩ ثمّ الثانية مجدولة بعد ٣ أسابيع (٢٢/٩)، تُعطى ٢٤/٩ ⇒ الجاية ٣ أسابيع من ٢٤/٩.
  const s = [V("a", "DHPP", "administered", { administered_at: "2026-09-01" }), V("b", "DHPP", "scheduled", { due_date: "2026-09-22" })];
  const r = m.suggestNext(s, s[1], "2026-09-24");
  check("٣ أسابيع ⇒ «3 أسابيع» مطبَّقةً على يوم الإعطاء لا على الموعد", r?.interval.key === "medentry.b3w" && r.due === "2026-10-15", JSON.stringify(r));
  const y = [V("a", "Rabies", "administered", { administered_at: "2025-10-10" }), V("b", "Rabies", "overdue", { due_date: "2026-10-10" })];
  check("سنويّ ⇒ «سنة»", m.suggestNext(y, y[1], "2026-10-12")?.interval?.key === "medentry.b1y");
  const j = [V("a", "Deworm", "administered", { administered_at: "2026-08-01" }), V("b", "Deworm", "scheduled", { due_date: "2026-09-02" })];
  check("شهرٌ بفرق يومين (٣٢ يوماً) ⇒ «شهر» (هامش)", m.suggestNext(j, j[1], "2026-09-02")?.interval?.key === "medentry.b1m");
  const odd = [V("a", "X", "administered", { administered_at: "2026-08-01" }), V("b", "X", "scheduled", { due_date: "2026-09-15" })];
  const ro = m.suggestNext(odd, odd[1], "2026-09-15");
  check("٤٥ يوماً لا تطابق مدّةً جاهزة ⇒ لا اقتراح (بالأيام كان ينزاح الموعدُ كلَّ سنة)", ro === null, JSON.stringify(ro));
  const moved = [V("a", "Rabies", "administered", { administered_at: "2025-10-10" }), V("b", "Rabies", "overdue", { due_date: "2026-12-10" })];
  check("  وسنويٌّ أُجّل شهرين (٤٢٦ يوماً) ⇒ لا اقتراحَ منحرف", m.suggestNext(moved, moved[1], "2026-12-10") === null);
  check("بلا جرعةٍ سابقة ⇒ لا اقتراح (الطبيبُ يختار)", m.suggestNext([V("b", "X", "scheduled", { due_date: "2026-09-15" })], { id: "b", name: "X", due_date: "2026-09-15" }, "2026-09-15") === null);
  const tiny = [V("a", "X", "administered", { administered_at: "2026-09-12" }), V("b", "X", "scheduled", { due_date: "2026-09-15" })];
  check("فجوةٌ أقلّ من أسبوع ليست سلسلة ⇒ لا اقتراح", m.suggestNext(tiny, tiny[1], "2026-09-15") === null);
  const other = [V("a", "Rabies", "administered", { administered_at: "2026-08-01" }), V("b", "DHPP", "scheduled", { due_date: "2026-08-22" })];
  check("جرعةُ لقاحٍ آخر لا تُحسب سابقة", m.suggestNext(other, other[1], "2026-08-22") === null);
  const ws = [V("a", " dhpp ", "administered", { administered_at: "2026-09-01" }), V("b", "DHPP", "scheduled", { due_date: "2026-09-22" })];
  check("الاسمُ بالمسافات وحالة الأحرف نفسُ اللقاح", m.suggestNext(ws, ws[1], "2026-09-22")?.interval?.key === "medentry.b3w");
  const after = [V("a", "DHPP", "administered", { administered_at: "2026-09-30" }), V("b", "DHPP", "scheduled", { due_date: "2026-09-22" })];
  check("جرعةٌ معطاةٌ **بعد** موعد هذه ليست سابقتَها", m.suggestNext(after, after[1], "2026-09-22") === null);
}

console.log("▸ الجاية المحجوزة أصلاً لا تُكرَّر");
{
  const s = [V("b", "Rabies", "scheduled", { due_date: "2026-10-10" }), V("c", "Rabies", "scheduled", { due_date: "2027-10-10" }), V("d", "DHPP", "scheduled", { due_date: "2026-12-01" })];
  check("لاحقةٌ لنفس اللقاح بعد يوم الإعطاء", m.laterPending(s, s[0], "2026-10-10")?.id === "c");
  check("  وغيرُها لا (لقاحٌ آخر، أو هي نفسها)", m.laterPending([s[0], s[2]], s[0], "2026-10-10") === null);
}

console.log("▸ «انعطى اليوم» يستهلك المستحقّة — الأقربَ لليوم، وبنافذة ٧ أيام");
{
  const T = "2026-10-10";
  const s = [
    V("old", "Rabies", "overdue", { due_date: "2025-10-03" }),
    V("late", "Rabies", "overdue", { due_date: "2026-10-01" }),
    V("soon", "Rabies", "scheduled", { due_date: "2026-10-15" }),
    V("plan", "Lepto", "scheduled", { due_date: null }),
    V("given", "Rabies", "administered", { administered_at: "2025-10-01" }),
  ];
  check("المتأخرةُ الأحدث لا الأقدم (معلّقةُ ٢٠٢٥ لا تُختم «انعطت اليوم»)", m.pendingToConsume(s, "rabies", T)?.id === "late");
  check("  والقريبةُ خلال ٧ أيام تُستهلك إن لم تكن متأخرة", m.pendingToConsume([s[2]], "Rabies", T)?.id === "soon");
  check("  والحدُّ بالضبط: +٧ تُستهلك و+٨ لا (أصغرُ معزّزٍ ١٤ يوماً)",
    m.pendingToConsume([V("x", "R", "scheduled", { due_date: "2026-10-17" })], "R", T)?.id === "x"
      && m.pendingToConsume([V("x", "R", "scheduled", { due_date: "2026-10-18" })], "R", T) === null);
  check("  ومعزّزُ ٣ أسابيع أو شهرٍ (حُجز للتوّ) لا يُستهلك", m.pendingToConsume([V("b", "DHPP", "scheduled", { due_date: "2026-10-31" })], "DHPP", T) === null);
  check("  وخطّةٌ بلا تاريخ تُستهلك", m.pendingToConsume(s, "Lepto", T)?.id === "plan");
  check("  والمعطاةُ لا تُستهلك", m.pendingToConsume([s[4]], "Rabies", T) === null);
  const todayGiven = [V("g", "DHPP", "administered", { administered_at: T }), V("n", "DHPP", "scheduled", { due_date: "2026-10-12" })];
  check("لقاحٌ انعطى اليومَ أصلاً: الحفظةُ الثانية لا تستهلك شيئاً (المعزّزُ المحجوزُ ليس هذه)",
    m.givenToday(todayGiven, "dhpp", T) && m.pendingToConsume(todayGiven, "DHPP", T) === null);
}

console.log("▸ الأسلاك");
{
  const me = readFileSync("src/components/MedicalEntry.tsx", "utf8");
  const blk = /export const BOOSTERS: Booster\[\] = \[([\s\S]*?)\];/.exec(me)?.[1] ?? "";
  const shown = [...blk.matchAll(/key: "([^"]+)", def: "[^"]*", (days|months|years): (\d+)/g)].map((x) => `${x[1]}:${x[2]}:${x[3]}`);
  const logic = m.VAX_INTERVALS.map((iv) => `${iv.key}:${iv.days ? "days" : iv.months ? "months" : "years"}:${iv.days ?? iv.months ?? iv.years}`);
  check("مددُ النموذج (BOOSTERS) = مددُ الاقتراح (VAX_INTERVALS) مفتاحاً ومدّة", shown.length === 7 && shown.join() === logic.join(), `${shown.join()} ≠ ${logic.join()}`);

  const adm = readFileSync("src/components/vaccines/AdministerDoseModal.tsx", "utf8");
  check("النافذة: الحفظُ يحتاج جواباً عن الجاية (أو جايةً محجوزة) — لا إعطاءَ صامت",
    /const answered = !!already \|\| \(!!choice/.test(adm) && /disabled=\{!answered\}/.test(adm) && /if \(!vaccine \|\| busy \|\| !answered\) return;/.test(adm));
  check("  ولا يختار عن الطبيب: الاقتراحُ ★ والاختيارُ يبدأ فارغاً لكلّ جرعة", /setGivenDone\(false\);\s*setChoice\(null\);/.test(adm) && !/setChoice\(s \?/.test(adm));
  check("  والتواريخُ بسنتها، والتاريخُ اليدويّ بسقف ٥ سنوات (validDue)",
    /formatDate\(d, i18n\.language, true\)/.test(adm) && /!validDue\(nextDue, todayISO\)/.test(adm) && /max=\{addInterval\(todayISO, \{ years: 5 \}\)\}/.test(adm));
  check("  والإغلاقُ أثناء الحفظ ممنوع، وبعد إعطاءٍ بلا حجز يحدّث الأب",
    /dismissible=\{!busy\}/.test(adm) && /const close = \(\) => \{ if \(busy\) return; if \(givenDone\) onSaved\(\); onClose\(\); \};/.test(adm));
  check("  وحفظٌ يرجع بعد الإغلاق يحدّث الأبَ ولا يغلق نافذةَ جرعةٍ أخرى — والعلَمُ يُرفع بكلّ تركيب (الوضعُ الصارم)",
    /onSaved\(\);\s*if \(alive\.current\) onClose\(\);/.test(adm) && /useEffect\(\(\) => \{ alive\.current = true; return \(\) => \{ alive\.current = false; \}; \}, \[\]\);/.test(adm));
  check("  والإعطاءُ محروس (repo.administerVaccination) وفشلُ الحجز لا يعيد الإعطاء",
    /await repo\.administerVaccination\(vaccine\.id/.test(adm) && /if \(!givenDone\) \{/.test(adm) && /setGivenDone\(true\)/.test(adm));
  check("  و«ماكو جرعة جاية» خيارٌ صريح", /data-next-none/.test(adm));
  const pp = readFileSync("src/pages/PetPassport.tsx", "utf8");
  check("ملفُّ الحيوان: كلا الموضعين بالنافذة الجديدة (مفتاحُها الجرعة) ومعهما سلسلةُ الحيوان",
    (pp.match(/<AdministerDoseModal key=\{administer\?\.id \?\? "none"\} vaccine=\{administer\} series=\{(vaccines|vaccinations)\}/g) ?? []).length === 2 && !/AdministerBoosterModal/.test(pp));
  check("  ونماذجُ لقاح الملفّ تقرأ سجلَّه (تنبيهُ «راح تنحسب» يظهر بالملفّ لا بالبيع وحده)",
    (pp.match(/initialMode="vaccination" lockMode onCommit=\{(commit|commitVaccine)\} defaultDoctor=\{user\?\.full_name\} allowHistory petId=\{pet\.id\}/g) ?? []).length === 2);
  const rc = readFileSync("src/pages/Reception.tsx", "utf8");
  check("التقويم: علامةُ اللقاح تفتح النافذةَ (كسولة) لا تكتب «معطاة» بصمت",
    /const AdministerDoseModal = lazy\(/.test(rc) && /if \(v\) setDoseFor\(v\);/.test(rc) && /<AdministerDoseModal key=\{doseFor\.id\}/.test(rc)
      && !/repo\.updateVaccination\(id, \{ status: "administered"/.test(rc));
  const ms = readFileSync("src/lib/medSync.ts", "utf8");
  check("medSync: «انعطى اليوم» يستهلك المستحقّةَ ويحجز الجاية بلا تكرار",
    /pendingToConsume\(series, e\.name, today\)/.test(ms) && /repo\.administerVaccination\(due\.id/.test(ms) && /if \(e\.nextDue && !dup\)/.test(ms)
      && /const dupToday = !!series && givenToday\(series, e\.name, today\);/.test(ms) && /let consumed = dupToday;/.test(ms));
  const rp = readFileSync("src/lib/repo.ts", "utf8");
  check("repo: الإعطاءُ لا يمسّ المعطاة، وصفرُ صفوفٍ يرمي (updatedRows لا updated وحدها)",
    /async administerVaccination\(id, patch\) \{\s*updatedRows\(await sbc\(\)\.from\("vaccinations"\)\.update\(\{ \.\.\.patch, status: "administered", due_date: null \}\)\s*\.eq\("id", id\)\.neq\("status", "administered"\)\.select\("id"\)\)/.test(rp)
      && /function updatedRows\([\s\S]{0,300}rows\.length === 0\) assertUpdated\(undefined\)/.test(rp));
}

console.log(`\n${fail ? "✗" : "✓"} vax-next-test: ${pass} نجحت، ${fail} فشلت`);
process.exit(fail ? 1 : 0);
