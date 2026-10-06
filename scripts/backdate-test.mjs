// التسجيلُ بتاريخٍ سابق — القاعدةُ النقيّة (src/lib/backdate.ts).
// ما يحرسه: كلُّ جرعةٍ تُختم بيومها لا بيوم إدخالها، والفائتُ يُحسم لا يُترك أحمرَ للأبد،
// والتاريخُ المحلّيّ لا يوم غرينتش (لقاحُ ما بعد منتصف الليل ببغداد كان ينكتب أمس).
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "backdate-"));
const out = join(dir, "m.mjs");
await build({
  entryPoints: ["src/lib/backdate.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": join(process.cwd(), "src") },
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };
const NOW = new Date("2026-10-06T14:30:00+03:00");
const T = "2026-10-06";
const tx = (id, day, time, extra = {}) => ({ id, pet_id: "p", day, time, medication: "Ceftriaxone", amount: "1ml", administered_at: null, task_type: "drug", ...extra });

console.log("▸ backdate: لحظةُ الزيارة السابقة");
check("يومٌ ووقتٌ محلّيّان ⇒ لحظةٌ صحيحة (١٨:٠٠ بغداد = ١٥:٠٠ غرينتش)", m.pastMoment("2026-09-01", "18:00", NOW) === "2026-09-01T15:00:00.000Z", m.pastMoment("2026-09-01", "18:00", NOW));
check("  واليومُ نفسُه قبل الساعة الآن يمرّ", m.pastMoment(T, "09:00", NOW) !== null);
check("  وبعدها بدقيقة يُرفض (زيارةٌ قادمة موعدٌ لا زيارة)", m.pastMoment(T, "14:31", NOW) === null);
check("  وغداً يُرفض", m.pastMoment("2026-10-07", "09:00", NOW) === null);
check("  و٣١ شباط يُرفض، والوقتُ ٢٥:٠٠ يُرفض", m.pastMoment("2026-02-31", "10:00", NOW) === null && m.pastMoment("2026-09-01", "25:00", NOW) === null);
check("  وسنةٌ مكتوبةٌ غلط (١٩٩٩) تُرفض", m.pastMoment("1999-09-01", "10:00", NOW) === null);

console.log("▸ backdate: «سُجّلت لاحقاً»");
check("فُتحت ١/٩ وانكتبت ٦/١٠ ⇒ لاحقاً", m.recordedLater("2026-09-01T15:00:00.000Z", "2026-10-06T11:00:00.000Z"));
check("  وزيارةٌ فُتحت صباحاً وانكتبت ظهراً بنفس اليوم ⇒ لا", !m.recordedLater("2026-10-06T06:00:00.000Z", "2026-10-06T09:00:00.000Z"));
check("  واليومُ محلّيّ: ٢٣:٣٠ بغداد (٢٠:٣٠ غرينتش) ثم ٠٠:٣٠ بغداد ⇒ يومان مختلفان", m.recordedLater("2026-10-05T20:30:00.000Z", "2026-10-05T21:30:00.000Z"));
check("  ولقاحٌ بعمود date (YYYY-MM-DD) يُقارن بيومه", m.recordedLater("2026-09-01", "2026-10-06T08:00:00.000Z") && !m.recordedLater("2026-10-06", "2026-10-06T08:00:00.000Z"));
check("  وصفٌّ قديمٌ بلا ختم إدخال ⇒ لا شارة (لا نعرف ≠ لاحقاً)", !m.recordedLater("2026-09-01", null) && !m.recordedLater("2026-09-01", undefined));

console.log("▸ backdate: الجرعاتُ الفائتة");
const rows = [
  tx("a", "2026-09-01", "20:00"), tx("b", "2026-09-01", "10:00"), tx("c", "2026-09-02", ""),
  tx("d", "2026-09-02", "10:00", { administered_at: "2026-09-02T07:00:00.000Z" }),
  tx("e", "2026-09-03", "10:00", { missed_reason: m.PAST_MISS_REASON }),
  tx("e2", "2026-09-03", "20:00", { missed_reason: "قرار الطبيب — أُجّلت" }),
  tx("f", "2026-09-03", "10:00", { task_type: "vitals" }),
  tx("g", T, "10:00"), tx("h", "2026-10-07", "10:00"),
];
const pend = m.pendingPast(rows, T).map((r) => r.id).join(",");
check("تنتظر قراراً: أدويةُ ما قبل اليوم، لا معطاة ولا محسومة — بترتيب اليوم ثم الساعة (والمؤجّلةُ بالجناح منها)", pend === "b,a,c,e2", pend);
check("  والمحسومةُ بعلامة نافذة الفائت وحدها — لا سببُ جناحٍ معناه «ما انطت بعد» (أُجّلت تبقى متأخرة)", m.isSettledMiss(rows[4], T) && !m.isSettledMiss(rows[5], T) && !m.isSettledMiss(rows[0], T));
check("  وفواتُ اليوم نفسه ليس محسوماً بعد (اليومُ ما خلص)", !m.isSettledMiss(tx("x", T, "08:00", { missed_reason: m.PAST_MISS_REASON }), T));
check("  وسببُ فواتٍ فارغٌ بالمسافات لا يحسم", !m.isSettledMiss(tx("y", "2026-09-01", "08:00", { missed_reason: "  " }), T));
check("ساعتا الجهاز والخادم: زيارةٌ ٢٣:٥٨ وختمُ الخادم ٠٠:٠١ ليست «بتاريخٍ سابق»", !m.recordedLater("2026-10-05T20:58:00.000Z", "2026-10-05T21:01:00.000Z", m.VISIT_LATE_GAP_MS) && m.recordedLater("2026-10-04T20:58:00.000Z", "2026-10-05T21:01:00.000Z", m.VISIT_LATE_GAP_MS));
check("إغلاقٌ بدقيقة الفتح نفسها يمرّ (الحقلُ بلا ثوانٍ)", m.endMoment("2026-09-01", "18:00", "2026-09-01T15:00:42.000Z", NOW) !== null);
check("لحظةُ الجرعة بيومها ووقتها المجدول — لا لحظة الإدخال", m.doseMoment(rows[0]) === "2026-09-01T17:00:00.000Z", m.doseMoment(rows[0]));
check("  وجرعةٌ بلا وقت ⇒ ظهرُ يومها (لا منتصفُ ليلٍ ينقلها لليوم السابق بغرينتش)", m.doseMoment(rows[2]) === "2026-09-02T09:00:00.000Z", m.doseMoment(rows[2]));
const w = m.pastWrites(m.pendingPast(rows, T), [{ id: "a", given: true }, { id: "b", given: false }, { id: "zzz", given: true }, { id: "d", given: true }]);
check("القرارات ⇒ كتابات: انطت بيومها، ما انطت بلا لحظة، والمجهولُ والمعطى سابقاً يُسقطان",
  w.length === 2 && w[0].id === "a" && w[0].given && w[0].at === "2026-09-01T17:00:00.000Z" && w[1].id === "b" && !w[1].given && !w[1].at, JSON.stringify(w));

console.log("▸ backdate: الإغلاقُ بتاريخ");
const opened = "2026-09-01T15:00:00.000Z";
check("الافتراضيُّ آخرُ جرعة بالخطة (وقتُها المجدول)", m.suggestedEnd(opened, rows.slice(0, 6), NOW) === "2026-09-03T17:00:00.000Z", m.suggestedEnd(opened, rows.slice(0, 6), NOW));
check("  ولا يتجاوز الآن (خطةٌ تمتدّ لبكرة)", m.suggestedEnd(opened, rows, NOW) === NOW.toISOString(), m.suggestedEnd(opened, rows, NOW));
check("  وبلا جرعات ⇒ لحظةُ الفتح", m.suggestedEnd(opened, [], NOW) === opened);
check("إغلاقٌ قبل الفتح يُرفض، وبعد الآن يُرفض، وبينهما يمرّ",
  m.endMoment("2026-08-31", "10:00", opened, NOW) === null && m.endMoment("2026-10-07", "10:00", opened, NOW) === null && m.endMoment("2026-09-05", "10:00", opened, NOW) === "2026-09-05T07:00:00.000Z");

console.log("▸ backdate: اللقاحاتُ السابقة");
check("المدّةُ بالتقويم كأزرار اليوم (addToToday): ٣١ كانون الثاني + شهر يعبر لآذار",
  m.addInterval("2026-01-31", { months: 1 }) === "2026-03-03", m.addInterval("2026-01-31", { months: 1 }));
check("  وسنة من ١/٣ = ١/٣ السنة الجاية، و٢١ يوماً تعبر الشهر", m.addInterval("2026-03-01", { years: 1 }) === "2027-03-01" && m.addInterval("2026-09-20", { days: 21 }) === "2026-10-11");
check("التواريخُ تُنظَّف: الفارغ والمستقبل والمكرّر يُسقط، والباقي تصاعدياً",
  m.cleanHistory(["2026-05-01", "", "2026-03-01", "2026-05-01", "2026-12-01", "2026-02-31"], T).join(",") === "2026-03-01,2026-05-01");
check("مشكلةُ الإدخال تُقال بنوعها", m.historyProblem([""], null, T) === "empty" && m.historyProblem(["2026-12-01"], null, T) === "future"
  && m.historyProblem(["1990-01-01"], null, T) === "tooOld" && m.historyProblem(["2026-05-01"], "2026-04-01", T) === "nextNotAfterLast"
  && m.historyProblem(["2026-05-01"], "2026-05-01", T) === "nextNotAfterLast" && m.historyProblem(["2026-05-01", ""], "2027-05-01", T) === null);
const vr = m.historyRows("DHPPi", ["2026-04-12", "2026-03-01", "2026-03-22"], "2027-04-12", T);
check("صفوفُ السجلّ: جرعةٌ معطاةٌ بيومها لكلّ تاريخ، مرقّمةٌ بالترتيب، بلا «من كم»، بلا طبيبٍ معطٍ",
  vr.length === 4 && vr.slice(0, 3).every((r, i) => r.status === "administered" && r.dose_number === i + 1 && r.doses_total === null && r.due_date === null && !("administered_by" in r))
  && vr[0].administered_at === "2026-03-01" && vr[2].administered_at === "2026-04-12", JSON.stringify(vr));
check("  ثم الموعدُ القادم مجدولاً برقمه التالي", vr[3].status === "scheduled" && vr[3].due_date === "2027-04-12" && vr[3].dose_number === 4 && vr[3].administered_at === null);
const late = m.historyRows("Rabies", ["2025-09-01"], "2026-09-01", T);
check("  وموعدٌ فات يُكتب «متأخر» — العلامةُ الحمراء والتذكير صادقان", late[1].status === "overdue", late[1]?.status);
check("  وموعدٌ لا يلي آخر جرعة لا يُكتب (الحارسُ بالدالّة لا بالشاشة وحدها)", m.historyRows("Rabies", ["2026-05-01"], "2026-04-01", T).length === 1);

console.log("▸ backdate: الأسلاكُ بمواضعها");
const med = readFileSync("src/lib/medSync.ts", "utf8");
check("medSync: السجلُّ السابق بجملةٍ واحدة (addVaccinations) — لا نصفَ سجلٍّ تكرّره إعادةُ المحاولة",
  /e\.history\?\.length[\s\S]{0,400}repo\.addVaccinations\(historyRows\(/.test(med));
check("medSync: لقاحُ اليوم يُكتب بيومه المحلّيّ لا toISOString()", /status: "administered",\s*administered_at: today,/.test(med) && !/administered_at: nowISO, due_date: null/.test(med));
const pp = readFileSync("src/pages/PetPassport.tsx", "utf8");
check("جرعةُ المعزّز تُكتب بيومها المحلّيّ (العمودُ date)", /administered_at: administeredDay,/.test(pp) && !/administered_at: administeredISO/.test(pp));
const rc = readFileSync("src/pages/Reception.tsx", "utf8");
check("وعلامةُ «انعطى» من التقويم كذلك", /at = localISO\(new Date\(\)\)/.test(rc));
const vp = readFileSync("src/pages/VisitPage.tsx", "utf8");
check("الطبلةُ: المتأخرةُ = pendingPast (الفائتُ المحسوم ليس متأخراً)", /const overdueDoses = useMemo\(\(\) => pendingPast\(medRows, todayISO\)/.test(vp));
check("  وجرعةُ يومٍ فات من «بالدواء» تفتح نافذةَ الوقت لا ختمَ الآن", /onGive=\{\(tx\) => \{ if \(tx\.day < todayISO\) \{ playTap\(\); setGiveId\(tx\.id\); \} else void giveQuick\(tx\); \}\}/.test(vp));
check("  و«تسجيل إعطائها الآن» مخفيٌّ لزيارةٍ بتاريخٍ سابق", /\{!backdated && \(\s*<button onClick=\{onGiveOverdue\}/.test(vp));
const vpn = readFileSync("src/components/VisitsPanel.tsx", "utf8");
check("فتحُ الزيارة يكتب اللحظةَ السابقة إن اختيرت", /opened_at: pastAt \?\? new Date\(\)\.toISOString\(\)/.test(vpn));
const ts = readFileSync("src/lib/treatmentSchedule.ts", "utf8");
const ch = readFileSync("src/pages/Charts.tsx", "utf8");
check("لوحاتُ الطبلات تعدّ المتأخر بـisOverdueNow (المحسومُ لا يُعدّ ولا يقول «منقطعة»)",
  /export function isOverdueNow/.test(ts) && (ch.match(/isOverdueNow\(t, todayISO\)/g) ?? []).length === 3 && !/taskStatus\(t, todayISO\) === "overdue"/.test(ch));

console.log(`\n${fail ? "✗" : "✓"} backdate-test: ${pass} نجحت، ${fail} فشلت`);
if (fail) process.exit(1);
