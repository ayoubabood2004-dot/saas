// معلوماتُ الحالة عند الدخول — القاعدةُ النقيّة (src/lib/intake.ts).
// ما يحرسه: «صارلها N يوم» يصير يومَ بدايةٍ صحيحاً، والعلاماتُ معرّفاتُ كتالوج المعالج، والتشخيصُ
// يأخذ جهازَه إن عُرف، والمعلوماتُ تنتظر أوّلَ زيارةٍ (لا القديمةُ منها ولا المربوطة)، وتعبّي المعالج.
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "intake-"));
const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/intake.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };
const D = (p) => ({ ...m.emptyIntake(), ...p });

console.log("▸ intake: المدّة ويومُ البداية");
check("«صارلها ٣ أيام» يوم ٦/١٠ ⇒ بدأت ٣/١٠", m.onsetDay("2026-10-06", 3) === "2026-10-03");
check("  وتعبر الشهر: ١٠ أيام قبل ٥/١٠ ⇒ ٢٥/٩", m.onsetDay("2026-10-05", 10) === "2026-09-25");
check("  و«اليوم» (٠) ⇒ يومُ الدخول نفسُه", m.onsetDay("2026-10-06", 0) === "2026-10-06");
check("مدّةٌ سالبة أو فوق السنة أو نصٌّ ⇒ لا مدّة", m.cleanSince(-1) === null && m.cleanSince(400) === null && m.cleanSince("abc") === null && m.cleanSince("") === null);
check("  و«٤٫٦» تُقرّب لـ٥", m.cleanSince("4.6") === 5);

console.log("▸ intake: الفراغ لا يُحفظ");
check("مسودّةٌ فارغة ⇒ فارغة", m.isEmptyIntake(m.emptyIntake()));
check("  ومسافاتٌ بالنصّ فارغة", m.isEmptyIntake(D({ history: "   " })));
check("  ومدّةٌ وحدها ليست فارغة (اليوم = ٠ معلومة)", !m.isEmptyIntake(D({ sinceDays: 0 })));

console.log("▸ intake: السجلُّ المنظّم");
const rec = m.intakeRecord(D({ history: "  يستفرغ من يومين  ", sinceDays: 2, diagnosis: "التهاب رئوي", signs: ["vomiting", "vomiting", "anorexia"], qualifiers: { vomiting: { freq: "x" }, ghost: { a: "b" }, anorexia: {} } }), "2026-10-06");
check("نوعُه intake — لا يُحسب «خطة علاج»", rec.kind === "intake" && m.isIntake(rec) && !m.isIntake({ v: 1 }));
check("  والتاريخُ مقصوصٌ مع المدّة ويوم البداية", rec.intake?.history === "يستفرغ من يومين" && rec.intake?.sinceDays === 2 && rec.intake?.onset === "2026-10-04", JSON.stringify(rec.intake));
check("  والعلاماتُ بلا تكرار، والوصفُ لعلامةٍ مختارةٍ وحدها ولا فارغ", rec.symptoms.join(",") === "vomiting,anorexia" && Object.keys(rec.qualifiers).join(",") === "vomiting", JSON.stringify(rec.qualifiers));
check("  والتشخيصُ المعروف يأخذ جهازَه", rec.diagnoses?.[0]?.system === "respiratory" && rec.diagnoses[0].disease === "التهاب رئوي");
check("تشخيصٌ حرّ غيرُ معروف ⇒ «عام» لا يُرمى", m.diagnosisOf("Canine Parvovirus (Parvo)")?.system === "general" && m.diagnosisOf("  ") === null);
check("مسودّةٌ بالعلامات وحدها لا تخترع تاريخاً ولا تشخيصاً", (() => { const r = m.intakeRecord(D({ signs: ["cough"] }), "2026-10-06"); return !r.intake && !r.diagnoses && r.symptoms.length === 1; })());
const txt = m.intakeText(D({ history: "قيء", sinceDays: 3, diagnosis: "بارفو", signs: ["a", "b"] }), (id) => id.toUpperCase(), { history: "H", since: (n) => `${n}d`, diagnosis: "D", signs: "S", sep: " / " });
check("السطرُ المقروء: تاريخ — مدّة، ثم تشخيص، ثم علامات", txt === "H: قيء — 3d\nD: بارفو\nS: A / B", JSON.stringify(txt));

console.log("▸ intake: تنتظر أوّلَ زيارة");
const enc = (d) => m.encodeIntake(D(d), "2026-10-06", "x");
const NOW = new Date("2026-10-06T12:00:00Z");
const notes = [
  { id: "n1", pet_id: "p", note_text: enc({ history: "أحدث" }), visit_id: null, created_at: "2026-10-05T10:00:00Z" },
  { id: "n2", pet_id: "p", note_text: enc({ history: "أقدم" }), visit_id: null, created_at: "2026-10-01T10:00:00Z" },
  { id: "n3", pet_id: "p", note_text: enc({ history: "مربوطة" }), visit_id: "v0", created_at: "2026-10-05T10:00:00Z" },
  { id: "n4", pet_id: "p", note_text: enc({ history: "قديمة كلش" }), visit_id: null, created_at: "2026-09-01T10:00:00Z" },
  { id: "n5", pet_id: "p", note_text: "ملاحظة عادية", visit_id: null, created_at: "2026-10-05T11:00:00Z" },
];
check("الغيرُ مربوطة خلال ١٤ يوماً، أحدثُها أوّلاً — لا المربوطة ولا القديمة ولا الملاحظة العادية",
  m.pendingIntakes(notes, NOW).map((n) => n.id).join(",") === "n1,n2", m.pendingIntakes(notes, NOW).map((n) => n.id).join(","));
const { parseClinical } = await (async () => { const d2 = mkdtempSync(join(tmpdir(), "cr-")); const o2 = join(d2, "c.mjs");
  await build({ entryPoints: ["src/lib/clinicalRecord.ts"], bundle: true, format: "esm", platform: "node", outfile: o2, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  const mod = await import(pathToFileURL(o2).href); rmSync(d2, { recursive: true, force: true }); return mod; })();
const recs = m.pendingIntakes(notes, NOW).map((n) => parseClinical(n.note_text).record);
const s2 = m.wizardSeed([
  m.intakeRecord(D({ history: "ب", signs: ["cough"], diagnosis: "التهاب رئوي", qualifiers: { cough: { k: "new" } } }), "2026-10-06"),
  m.intakeRecord(D({ history: "أ", signs: ["cough", "fever"], diagnosis: "التهاب رئوي", qualifiers: { cough: { k: "old" } } }), "2026-10-01"),
]);
check("بذرةُ المعالج: العلاماتُ بلا تكرار، والتشخيصُ مرّةً، والأحدثُ يغلب بالوصف، والتاريخُ بالملاحظات",
  s2.symptoms.join(",") === "cough,fever" && s2.diagnoses.length === 1 && s2.qualifiers.cough.k === "new" && s2.notes === "ب\nأ", JSON.stringify(s2));
check("  وبلا معلومات دخول ⇒ لا بذرة (المعالجُ يبدأ فارغاً كما كان)", m.wizardSeed([{ v: 1 }]) === null && recs.length === 2);

console.log("▸ intake: الأسلاكُ بمواضعها");
const nc = readFileSync("src/pages/NewCase.tsx", "utf8");
check("فتحُ حالة: معلوماتُ الحالة تُحفظ للحالتين (جديد + بالرقم) — وفشلُها يُقال لا يُسقط الحالة",
  (nc.match(/saveIntake\(pet\.id, intakeWithDx\(/g) ?? []).length === 2 && /intakeFailed\.push/.test(nc) && /intake\.saveFail/.test(nc));
check("  والتشخيصُ مصدرٌ واحد (حقلُ الصحّة) داخل تبويب «التشخيص الأولي»", (nc.match(/diagnosisSlot=\{\s*<HealthStatusField/g) ?? []).length === 2);
const vp = readFileSync("src/pages/VisitPage.tsx", "utf8");
check("صفحةُ الزيارة تربط المعلومات المنتظِرة بأوّل زيارةٍ مفتوحة وتعرضها حتى لو فشل الربط",
  /v\?\.status === "open" \? pendingIntakes\(ns\)/.test(vp) && /repo\.linkNotesToVisit\(/.test(vp) && /\.\.\.pending\.map/.test(vp));
check("  ولا تُحسب «خطة» (زرُّ التشخيص لا يصير «تعديل» بسببها) وتعبّي المعالج", /clinicalNotes = useMemo\(\(\) => allClinical\.filter\(\(x\) => !isIntake/.test(vp) && /<TreatmentPlan initial=\{planSeed/.test(vp));

console.log(`\n${fail ? "✗" : "✓"} intake-test: ${pass} نجحت، ${fail} فشلت`);
if (fail) process.exit(1);
