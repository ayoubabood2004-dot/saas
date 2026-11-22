/* ============================================================================
 * ملخّصُ الحالة وورقتُها (src/lib/caseSummary.ts، caseSheetCompose.ts، caseSheetPrint.ts) — بسلوكها.
 *
 * النموذج: حالةُ الجرعة كالطبلة (انطت بختمها، «ما انطت» المحسومة وحدها فائتة، و«أُجّلت» متأخّرةٌ لا فائتة)، والأدويةُ
 * وحدها (لا سوائل ولا متابعات)، ومدى الإقامة يقصر كلَّ شيء، والإقامةُ بساعتَي الحركة، واللقاحاتُ معطاةٌ وقادمةٌ ومتأخّرة،
 * وملاحظاتُ النظام (البروتوكول، «⟦D:») خارج ملاحظات الطبيب، واليومُ المحلّيُّ لا يومُ غرينتش.
 * الورقة: مفتاحُ «أسماء الأدوية» يُخفيها فعلاً، والأقسامُ المطفأةُ لا تُرسم، والنصائحُ الفارغة تُرمى، وكلُّ نصٍّ يُهرَّب،
 * وحجمُ الورقة بـ@page. وطفراتٌ على المصدر يجب أن تُمسك.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const FILES = { summary: "src/lib/caseSummary.ts", compose: "src/lib/caseSheetCompose.ts", print: "src/lib/caseSheetPrint.ts" };
async function load(over = {}) {
  const src = (k) => over[k] ?? readFileSync(FILES[k], "utf8");
  const entry = `export * from "./__s.ts"; export * from "./__c.ts"; export * from "./__p.ts"; export { encodeClinical } from "./clinicalRecord"; export { PROTO_MARK } from "./protocolMark";`;
  const dir = mkdtempSync(join(tmpdir(), "casesum-"));
  try {
    const built = await esbuild.build({
      stdin: { contents: entry, resolveDir: "src/lib", loader: "ts", sourcefile: "entry.ts" },
      bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
      plugins: [{
        name: "mut", setup(b) {
          b.onResolve({ filter: /^\.\/(__s|__c|__p)\.ts$/ }, (a) => ({ path: a.path, namespace: "mut" }));
          b.onResolve({ filter: /^\.\/(caseSummary|caseSheetPrint)$/ }, (a) => ({ path: a.path === "./caseSummary" ? "./__s.ts" : "./__p.ts", namespace: "mut" }));
          b.onLoad({ filter: /.*/, namespace: "mut" }, (a) => ({
            contents: a.path.includes("__s") ? src("summary") : a.path.includes("__c") ? src("compose") : src("print"),
            loader: "ts", resolveDir: "src/lib",
          }));
        },
      }],
    });
    const f = join(dir, "m.mjs");
    writeFileSync(f, built.outputFiles[0].text);
    return await import(pathToFileURL(f).href);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

const TODAY = "2026-11-20";
const tx = (id, day, time, medication, extra = {}) => ({ id, pet_id: "p1", day, time, medication, amount: "1 ml", created_at: `${day}T08:00:00Z`, ...extra });
function fixture(M) {
  const treatments = [
    tx("t1", "2026-11-16", "08:00", "Amoxicillin", { route: "im", administered_at: "2026-11-16T05:10:00Z", visit_id: "v1" }),
    tx("t2", "2026-11-17", "08:00", "Amoxicillin", { route: "im", missed_reason: "past:not_given" }),
    tx("t3", "2026-11-18", "08:00", "Amoxicillin", { route: "im", missed_reason: "أُجّلت" }),
    tx("t4", "2026-11-20", "20:00", "Amoxicillin", { route: "im", amount: "1.5 ml" }),
    tx("t5", "2026-11-22", "08:00", "Amoxicillin", { route: "im" }),
    tx("t6", "2026-11-18", "09:00", "Meloxicam", { route: "sc", administered_at: "2026-11-18T06:00:00Z" }),
    tx("f1", "2026-11-18", "10:00", "Ringer", { task_type: "fluid", administered_at: "2026-11-18T07:00:00Z" }),
    tx("x1", "2026-11-18", "11:00", "temperature", { task_type: "vitals" }),
    tx("o1", "2026-10-01", "08:00", "Old drug", { administered_at: "2026-10-01T05:00:00Z" }),
  ];
  const admissions = [
    { id: "a0", pet_id: "p1", kind: "boarding", status: "discharged", admitted_on: "2026-09-29", discharged_on: "2026-10-02" },
    { id: "a1", pet_id: "p1", kind: "treatment_boarding", status: "active", admitted_on: "2026-11-16", cage: "105", reason: "تسمّم" },
  ];
  const movements = [
    { id: "m1", pet_id: "p1", admission_id: "a1", at: "2026-11-16T06:30:00Z", event: "admitted", created_at: "" },
    { id: "m2", pet_id: "p1", admission_id: "a0", at: "2026-09-29T07:00:00Z", event: "admitted", created_at: "" },
    { id: "m3", pet_id: "p1", admission_id: "a0", at: "2026-10-02T13:00:00Z", event: "discharged", created_at: "" },
  ];
  const vaccines = [
    { id: "v1", pet_id: "p1", name: "Rabies", status: "administered", administered_at: "2026-11-17", dose_number: 1, doses_total: 1 },
    { id: "v2", pet_id: "p1", name: "DHPP", status: "scheduled", due_date: "2026-12-01" },
    { id: "v3", pet_id: "p1", name: "Leptospira", status: "scheduled", due_date: "2026-11-10" },
    { id: "v4", pet_id: "p1", name: "Old vax", status: "administered", administered_at: "2026-05-01" },
  ];
  const notes = [
    { id: "n1", pet_id: "p1", note_text: M.encodeClinical({ v: 1, diagnoses: [{ system: "gi", disease: "Gastroenteritis", severity: "moderate" }] }, "Vomiting since yesterday"), created_at: "2026-11-16T07:00:00Z" },
    { id: "n2", pet_id: "p1", note_text: `${M.PROTO_MARK}protocol`, created_at: "2026-11-17T07:00:00Z" },
    { id: "n3", pet_id: "p1", note_text: "⟦D:2026-11-17⟧ day note", created_at: "2026-11-17T08:00:00Z" },
    { id: "n4", pet_id: "p1", note_text: "Owner says eats well", author_name: "د. علي", created_at: "2026-11-18T09:00:00Z" },
  ];
  const appointments = [
    { id: "ap1", pet_id: "p1", status: "confirmed", scheduled_at: "2026-11-25T09:00:00Z", doctor_name: "د. علي" },
    { id: "ap2", pet_id: "p1", status: "cancelled", scheduled_at: "2026-11-26T09:00:00Z" },
    { id: "ap3", pet_id: "p1", status: "done", scheduled_at: "2026-11-27T09:00:00Z" },
  ];
  return { treatments, admissions, movements, vaccines, notes, clinicVisits: [{ id: "cv1", pet_id: "p1", kind: "illness", status: "open", opened_at: "2026-11-16T06:00:00Z", reason: "قيء" }],
    visits: [], labs: [{ id: "l1", pet_id: "p1", panel_label: "CBC", taken_at: "2026-11-17T10:00:00Z", panel_id: "cbc", kind: "numeric", created_at: "" }],
    media: [], appointments, weights: [{ id: "w1", pet_id: "p1", weight_kg: 4.2, measured_at: "2026-11-16T06:00:00Z" }, { id: "w2", pet_id: "p1", weight_kg: 4.5, measured_at: "2026-10-01T06:00:00Z" }] };
}

const fakeT = (k, o) => {
  if (typeof o === "string") return `{${k}}`;
  const p = o && typeof o === "object" ? Object.entries(o).filter(([x]) => x !== "defaultValue").map(([x, v]) => `${x}=${v}`).join(",") : "";
  return p ? `{${k}|${p}}` : `{${k}}`;
};
const PET = { id: "p1", owner_id: "o", name: "Nb <script>", species: "cat", sex: "female", owner_name: "Ali", owner_phone: "0770", passport_token: "", serial: "C-12", created_at: "" };

async function suite(M, label = "") {
  const before = fails;
  const F = fixture(M);
  // ── حالةُ الجرعة ──
  check(`${label}الجرعة: انطت بختمها، و«ما انطت» المحسومة فائتة، و«أُجّلت» متأخّرة، واليوم مستحقّة، وبعده قادمة`,
    ["t1", "t2", "t3", "t4", "t5"].map((id) => M.doseState(F.treatments.find((t) => t.id === id), TODAY)).join() === "given,missed,overdue,due,upcoming");
  // ── السجلُّ كلُّه ──
  const all = M.buildCaseModel(F, { today: TODAY, now: "2026-11-20T09:00:00Z" });
  const amox = all.meds.find((m) => m.name === "Amoxicillin");
  check(`${label}الأدويةُ وحدها (لا سوائل ولا متابعات)`, all.meds.map((m) => m.name).sort().join() === "Amoxicillin,Meloxicam,Old drug", all.meds.map((m) => m.name).join());
  check(`${label}الدواءُ بعدّه: انطت ١ وفاتت ١ ومتأخّرة ١ وباقية ٢ من ٥، والمقداران، والطريق، وزيارتُه`,
    amox && amox.total === 5 && amox.given === 1 && amox.missed === 1 && amox.overdue === 1 && amox.pending === 2 && amox.amounts.join("|") === "1 ml|1.5 ml" && amox.route === "im" && amox.visitId === "v1",
    JSON.stringify(amox));
  check(`${label}المجاميع`, JSON.stringify(all.totals) === JSON.stringify({ meds: 3, doses: 7, given: 3, missed: 1, overdue: 1, pending: 2 }), JSON.stringify(all.totals));
  check(`${label}الإقامات: الأحدثُ أوّلاً، والقائمةُ حاليّة، والساعاتُ من الحركة`,
    all.stays.map((s) => s.id).join() === "a1,a0" && all.current?.id === "a1" && all.current.inAt === "2026-11-16T06:30:00Z" && all.stays[1].outAt === "2026-10-02T13:00:00Z" && all.current.days === 5,
    JSON.stringify(all.stays.map((s) => [s.id, s.inAt, s.outAt, s.days])));
  check(`${label}اللقاحات: معطاةٌ، وقادمةٌ، ومتأخّرةٌ (موعدٌ مضى ولو «مجدول»)`,
    all.vaccines.given.map((v) => v.id).join() === "v1,v4" && all.vaccines.due.map((v) => v.id).join() === "v2" && all.vaccines.overdue.map((v) => v.id).join() === "v3");
  check(`${label}ملاحظاتُ الطبيب بلا علامات النظام، والتشخيصُ من الملاحظة السريريّة`,
    all.notes.map((n) => n.id).join() === "n4,n1" && all.diagnoses.join() === "Gastroenteritis" && all.notes[1].text === "Vomiting since yesterday", JSON.stringify(all.notes.map((n) => [n.id, n.text])));
  check(`${label}المواعيدُ القادمة بلا الملغيّ والمنتهي`, all.upcoming.map((a) => a.id).join() === "ap1");
  check(`${label}الوزن: آخرُ قياسين`, all.weight.last?.id === "w1" && all.weight.prev?.id === "w2");
  // ── مدى الإقامة ──
  const r = M.stayRange(F.admissions[1], TODAY);
  const stay = M.buildCaseModel({ ...F, admissions: [F.admissions[1]] }, { today: TODAY, range: r });
  check(`${label}مدى الإقامة: من الدخول لليوم، والدواءُ القديمُ خارجه، واللقاحُ القديمُ خارجه`,
    r.from === "2026-11-16" && r.to === TODAY && !stay.meds.some((m) => m.name === "Old drug") && stay.vaccines.given.map((v) => v.id).join() === "v1" && stay.stays.length === 1,
    JSON.stringify({ r, meds: stay.meds.map((m) => m.name) }));
  check(`${label}اليومُ المحلّيّ لا يومُ غرينتش (٢٢:٣٠ غرينتش = اليوم التالي ببغداد)`, M.dayOf("2026-11-20T22:30:00Z") === "2026-11-21" && M.dayOf("2026-11-20") === "2026-11-20");

  // ── الورقة ──
  const clinic = { name: "Clinic & Co", lines: ["Baghdad"], logoUrl: null, site: "doctorvet.vet" };
  const base = { t: fakeT, lang: "ar", pet: PET, model: stay, scope: "stay", paper: "a5", showDrugs: true, showDoseLog: true,
    parts: { vaccines: true, visits: true, notes: true, labs: true }, tips: ["tip one", "  ", "tip two"], doctorNote: "Rest 3 days",
    clinic, doctor: "Dr. A", today: TODAY, autoPrint: false };
  const html = (o = {}) => M.buildCaseSheetHTML(M.composeSheet({ ...base, ...o }));
  const h1 = html();
  check(`${label}الورقة: الأدويةُ وسجلُّ الجرعات حين يُطلبان`, h1.includes("Amoxicillin") && h1.includes("{csht.doseLog}") && h1.includes("{csht.states.missed}"), "");
  check(`${label}  و«ما انطت» لا تُكرَّر بعلامة السجلّ السابق بجانبها`, !h1.includes("{csht.states.missed} (") && !h1.includes("past:not_given"));
  const h2 = html({ showDrugs: false });
  check(`${label}  و«أخفِ الأدوية» يُخفي أسماءها فعلاً ويقول العددَ وحده`, !h2.includes("Amoxicillin") && !h2.includes("Meloxicam") && h2.includes("{csht.dosesHidden|given=") && !h2.includes("{csht.doseLog}"));
  const h3 = html({ showDoseLog: false });
  check(`${label}  وسجلُّ الجرعات يُطفأ وحده والجدولُ باقٍ`, h3.includes("Amoxicillin") && !h3.includes("{csht.doseLog}"));
  const h4 = html({ parts: { vaccines: false, visits: false, notes: false, labs: false } });
  check(`${label}الأقسامُ المطفأة لا تُرسم`, !h4.includes("{csht.vaccines}") && !h4.includes("{csht.visits}") && !h4.includes("{csht.notes}") && !h4.includes("{csht.labs}") && h1.includes("{csht.vaccines}") && h1.includes("{csht.labs}"));
  check(`${label}النصائحُ بلا السطر الفارغ، وملاحظةُ الطبيب، والتوقيعان باسمَي الطبيب والمالك`,
    (h1.match(/<li dir="auto">tip/g) ?? []).length === 2 && !/<li dir="auto">\s*<\/li>/.test(h1) && h1.includes("Rest 3 days") && h1.includes("{csht.sigClinic}") && h1.includes("Dr. A") && h1.includes("{csht.sigOwner}") && h1.includes(">Ali<"));
  check(`${label}كلُّ نصٍّ يُهرَّب`, h1.includes("Nb &lt;script&gt;") && !h1.includes("Nb <script>") && h1.includes("Clinic &amp; Co"));
  check(`${label}حجمُ الورقة بـ@page (A5 و Letter و A4)`, h1.includes("size:A5") && html({ paper: "letter" }).includes("size:Letter") && html({ paper: "a4" }).includes("size:A4"));
  check(`${label}المعاينةُ بلا طباعةٍ تلقائيّة، والنافذةُ تطبع`, !h1.includes("window.print") && html({ autoPrint: true }).includes("window.print"));
  check(`${label}الإقامةُ بالورقة: النوعُ وقفصها و«بعده بالعيادة»`, h1.includes("{csht.kinds.treatment_boarding}") && h1.includes(">105<") && h1.includes("{csht.stillIn}"));
  check(`${label}اللقاحُ المتأخّر موسوم`, h1.includes("Leptospira") && h1.includes("{csht.overdueTag}"));
  return fails === before;
}

console.log("▸ ملخّصُ الحالة وورقتُها");
await suite(await load());

const MUTANTS = [
  ["summary", "«أُجّلت» تُحسب فائتة", "if (isSettledMiss(t as TreatmentEntry, today)) return \"missed\";", "if (t.missed_reason && t.day < today) return \"missed\";"],
  ["summary", "السوائلُ تُحسب أدوية", "export const isDrugEntry = (t: Pick<TreatmentEntry, \"task_type\">): boolean => (t.task_type ?? \"drug\") === \"drug\";", "export const isDrugEntry = (_t: Pick<TreatmentEntry, \"task_type\">): boolean => true;"],
  ["summary", "يومُ غرينتش", "return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : localISO(d);", "return ts.slice(0, 10);"],
  ["summary", "علاماتُ النظام ملاحظات", "export const isDoctorNote = (text: string): boolean => !!text.trim() && !isProtocolMark(text) && !text.startsWith(\"⟦D:\");", "export const isDoctorNote = (text: string): boolean => !!text.trim();"],
  ["summary", "المدى لا يقصر الأدوية", ".filter((t) => isDrugEntry(t) && t.medication?.trim() && within(t.day, range))", ".filter((t) => isDrugEntry(t) && t.medication?.trim())"],
  ["summary", "اللقاحُ الفائت موعدُه قادم", "const vOverdue = vOpen.filter((v) => v.status === \"overdue\" || (!!v.due_date && dayOf(v.due_date) < today))", "const vOverdue = vOpen.filter((v) => v.status === \"overdue\")"],
  ["compose", "«أخفِ الأدوية» لا يُخفي", "    if (a.showDrugs) {", "    if (true) {"],
  ["compose", "النصائحُ الفارغة تُطبع", "const tips = a.tips.map((x) => x.trim()).filter(Boolean);", "const tips = a.tips;"],
  ["compose", "قسمُ اللقاحات لا يُطفأ", "  if (a.parts.vaccines) {", "  if (true) {"],
  ["print", "بلا تهريب", "export const esc = (s: unknown): string =>\n  String(s ?? \"\").replace(", "export const esc = (s: unknown): string =>\n  String(s ?? \"\").replace(/(?!)/g, (c: string) => c) || String(s ?? \"\").replace("],
  ["print", "حجمٌ واحد", "@page{size:${p.size};margin:${p.margin}}", "@page{size:A4;margin:${p.margin}}"],
];
console.log("▸ طفرات (كلُّها يجب أن تُمسك)");
for (const [file, what, from, to] of MUTANTS) {
  const src = readFileSync(FILES[file], "utf8");
  const mutated = src.replace(from, to);
  if (mutated === src) { fails++; console.error(`   ✗ الطفرة «${what}» لم تجد سطرَها — حدّث الفحص`); continue; }
  const quiet = console.log, quietErr = console.error, saved = fails, savedP = passes;
  console.log = () => {}; console.error = () => {};
  let caught;
  try { caught = !(await suite(await load({ [file]: mutated }), "")); } catch { caught = true; }
  console.log = quiet; console.error = quietErr; fails = saved; passes = savedP;
  check(`طفرة «${what}» يمسكها الفحص`, caught);
}

console.log(`${fails ? "✗" : "✓"} case-summary-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
