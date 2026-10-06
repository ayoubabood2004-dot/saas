// سجلُّ الدخول والخروج — القاعدةُ النقيّة (src/lib/stayLog.ts).
// ما يحرسه: كلُّ إقامةٍ بيوم دخولها وخروجها ومدّتها، وكلُّ حدثٍ بيومه وإقامته، والجرعاتُ مجمّعةً
// بيوم إعطائها لا بيوم جدولتها، ومعلوماتُ الدخول على إقامتها، وما خارج الإقامات لا يُرمى.
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const bundle = async (entry) => {
  const dir = mkdtempSync(join(tmpdir(), "stay-")); const out = join(dir, "m.mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true }); return m;
};
const m = await bundle("src/lib/stayLog.ts");
const ik = await bundle("src/lib/intake.ts");

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };
const T = "2026-10-06";
const at = (d, hm) => new Date(`${d}T${hm}:00`).toISOString();
const inp = {
  admissions: [
    { id: "A1", pet_id: "p", kind: "treatment", status: "discharged", admitted_on: "2026-09-01", discharged_on: "2026-09-04", cage: "B-2", outcome: "recovered", created_at: at("2026-09-01", "09:00") },
    { id: "A2", pet_id: "p", kind: "boarding", status: "active", admitted_on: "2026-10-04", created_at: at("2026-10-04", "10:00") },
  ],
  movements: [
    { id: "m1", pet_id: "p", admission_id: "A2", at: at("2026-10-04", "10:05"), event: "admitted", to_kind: "boarding", to_cage: "C-1", created_at: "" },
    { id: "m2", pet_id: "p", admission_id: "A2", at: at("2026-10-05", "08:00"), event: "cage_changed", from_cage: "C-1", to_cage: "C-3", created_at: "" },
  ],
  visits: [
    { id: "V1", pet_id: "p", kind: "illness", status: "ended", opened_at: at("2026-09-01", "09:30"), ended_at: at("2026-09-04", "18:00"), outcome: "recovered" },
    { id: "V2", pet_id: "p", kind: "grooming", status: "ended", opened_at: at("2026-09-20", "11:00"), ended_at: at("2026-09-20", "12:00") },
  ],
  treatments: [
    { id: "t1", pet_id: "p", day: "2026-09-01", time: "10:00", medication: "Ceftriaxone", amount: "1", task_type: "drug", administered_at: at("2026-09-01", "10:10") },
    { id: "t2", pet_id: "p", day: "2026-09-01", time: "20:00", medication: "Ceftriaxone", amount: "1", task_type: "drug", administered_at: at("2026-09-01", "20:05") },
    { id: "t3", pet_id: "p", day: "2026-09-02", time: "10:00", medication: "Metronidazole", amount: "1", task_type: "drug", administered_at: at("2026-09-03", "09:00") },
    { id: "t4", pet_id: "p", day: "2026-09-02", time: "20:00", medication: "Ceftriaxone", amount: "1", task_type: "drug", administered_at: null, missed_reason: "past:not_given" },
    { id: "t5", pet_id: "p", day: "2026-09-02", time: "12:00", medication: "حرارة", amount: "", task_type: "vitals", administered_at: at("2026-09-02", "12:00") },
    { id: "t6", pet_id: "p", day: "2026-09-03", time: "10:00", medication: "Ceftriaxone", amount: "1", task_type: "drug", administered_at: null },
  ],
  vaccinations: [{ id: "x1", pet_id: "p", name: "Rabies", status: "administered", administered_at: "2026-09-20" }, { id: "x2", pet_id: "p", name: "DHPP", status: "scheduled", due_date: "2026-11-01" }],
  notes: [
    { id: "n1", pet_id: "p", note_text: ik.encodeIntake({ ...ik.emptyIntake(), history: "يستفرغ", sinceDays: 2 }, "2026-09-01", "x"), visit_id: "V1", created_at: at("2026-09-01", "09:00") },
    { id: "n2", pet_id: "p", note_text: "اتصلوا أهله\nسطر ثاني", visit_id: null, created_at: at("2026-09-25", "15:00") },
    { id: "n3", pet_id: "p", note_text: "⟦D:2026-09-02⟧ملاحظة يوم", visit_id: "V1", created_at: at("2026-09-02", "15:00") },
  ],
  labs: [{ id: "l1", pet_id: "p", panel_label: "CBC", kind: "numeric", taken_at: at("2026-09-02", "11:00") }],
  weights: [{ id: "w1", pet_id: "p", weight_kg: 12.5, measured_at: "2026-10-05" }],
};
const log = m.buildStayLog(inp, T);
const [s2, s1] = log.stays;

console.log("▸ stay-log: الإقامات");
check("إقامتان، الأحدثُ أوّلاً", log.stays.map((s) => s.id).join(",") === "A2,A1");
check("  الأولى: ١/٩ ← ٤/٩ = ٤ أيام، سليم، بقفصها", s1.inDay === "2026-09-01" && s1.outDay === "2026-09-04" && s1.days === 4 && s1.outcome === "recovered" && s1.cage === "B-2", JSON.stringify({ ...s1, dayLogs: undefined }));
check("  الثانية مفتوحة: بعده داخل، ومدّتُها لليوم (٤/١٠ ← ٦/١٠ = ٣)", s2.active && s2.outDay === null && s2.days === 3);
check("الخلاصة: مرّتان، ٧ أيام، آخر دخول ٤/١٠، بالعيادة هسّة", log.totals.stays === 2 && log.totals.daysInClinic === 7 && log.totals.lastIn === "2026-10-04" && log.totals.inNow);

console.log("▸ stay-log: الأيّام");
const day = (s, d) => s.dayLogs.find((x) => x.day === d)?.events ?? [];
const kinds = (ev) => ev.map((e) => e.kind).join(",");
check("الإقامةُ القديمة بلا حركاتٍ مختومة: دخلت بيومها وخرجت بيومها (بلا ساعة لا مخترعة)",
  day(s1, "2026-09-01").some((e) => e.kind === "in" && e.at === null) && day(s1, "2026-09-04").some((e) => e.kind === "out" && e.at === null));
check("  والمختومةُ بساعتها، وتغييرُ القفص بيومه", day(s2, "2026-10-04").some((e) => e.kind === "in" && e.at && e.data.toCage === "C-1") && day(s2, "2026-10-05").some((e) => e.kind === "cage" && e.data.toCage === "C-3"));
const d1 = day(s1, "2026-09-01").find((e) => e.kind === "doses");
check("الجرعاتُ مجمّعةٌ بالدواء: يوم ١/٩ «Ceftriaxone ×٢»", d1?.data.count === 2 && JSON.stringify(d1.data.list) === JSON.stringify([["Ceftriaxone", 2]]), JSON.stringify(d1));
check("  والجرعةُ تُحسب بيوم إعطائها (جرعةُ ٢/٩ انطت ٣/٩)", day(s1, "2026-09-03").some((e) => e.kind === "doses" && e.data.count === 1) && !day(s1, "2026-09-02").some((e) => e.kind === "doses"));
check("  والفائتةُ الموثّقة تُقال بيومها، وغيرُ الموثّقة لا تُخترع «ما انطت»", day(s1, "2026-09-02").some((e) => e.kind === "dosesMissed" && e.data.count === 1) && !day(s1, "2026-09-03").some((e) => e.kind === "dosesMissed"));
check("  والمتابعات (حرارة) ليست جرعات", !JSON.stringify(s1.dayLogs).includes("حرارة"));
check("الزيارةُ انفتحت وانغلقت بأيّامها، والتحليلُ بيومه", kinds(day(s1, "2026-09-01")).includes("visitOpen") && day(s1, "2026-09-04").some((e) => e.kind === "visitClose" && e.data.outcome === "recovered") && day(s1, "2026-09-02").some((e) => e.kind === "lab"));
check("  وأحداثُ اليوم بترتيب ساعاتها (دخل ٠٩:٠٠ ثم الزيارة ٠٩:٣٠ ثم الجرعات)", kinds(day(s1, "2026-09-01")).startsWith("in,visitOpen"), kinds(day(s1, "2026-09-01")));
check("معلوماتُ الدخول معلّقةٌ على إقامتها لا سطراً بين الأحداث", s1.intakes.length === 1 && s1.intakes[0].intake?.history === "يستفرغ" && !JSON.stringify(s1.dayLogs).includes("intake"));
check("وملاحظةُ يومِ الطبلة لا تتكرّر هنا", !JSON.stringify(log).includes("ملاحظة يوم"));
check("والوزنُ بيومه داخل الإقامة المفتوحة", day(s2, "2026-10-05").some((e) => e.kind === "weight" && e.data.kg === 12.5));

console.log("▸ stay-log: خارج الإقامات");
const out = Object.fromEntries(log.outside.map((d) => [d.day, kinds(d.events)]));
check("زيارةُ الحلاقة واللقاح (٢٠/٩) والملاحظة (٢٥/٩) خارج الإقامات — لا تُرمى", out["2026-09-20"]?.includes("visitOpen") && out["2026-09-20"]?.includes("vaccine") && out["2026-09-25"] === "note", JSON.stringify(out));
check("  والملاحظةُ بسطرها الأوّل", log.outside.find((d) => d.day === "2026-09-25").events[0].data.text === "اتصلوا أهله");
check("  واللقاحُ المجدول (لم يُعطَ) ليس حدثاً", !JSON.stringify(log).includes("DHPP"));
check("حيوانٌ بلا شيء ⇒ سجلٌّ فارغ لا خطأ", (() => { const e = m.buildStayLog({ admissions: [], movements: [], visits: [], treatments: [], vaccinations: [], notes: [], labs: [], weights: [] }, T); return e.stays.length === 0 && e.outside.length === 0 && e.totals.daysInClinic === 0 && e.totals.lastIn === null; })());

console.log(`\n${fail ? "✗" : "✓"} stay-log-test: ${pass} نجحت، ${fail} فشلت`);
if (fail) process.exit(1);
