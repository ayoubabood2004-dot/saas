// تعديلُ موعد اللقاح — القاعدةُ النقيّة (src/lib/vaccineDue.ts).
// الواقعةُ التي يحرسها: تأجيلُ لقاحٍ متأخرٍ لموعدٍ قادم يلزم أن يرجعه «مجدول»، وإلا بقيت
// العلامةُ الحمراء على موعدٍ لم يحن (الحالةُ تُكتب ولا تقلبها مهمّةٌ بالخادم).
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "vxdue-"));
const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/vaccineDue.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };
const T = "2026-09-29";
console.log("▸ vaccine-due: الحالةُ تتبع الموعد");
check("متأخرٌ أُجّل لبعد أسبوع ⇒ مجدول (تنطفئ الحمراء)", m.statusForDue("2026-10-06", T) === "scheduled");
check("موعدُ اليوم ليس متأخراً", m.statusForDue(T, T) === "scheduled");
check("موعدٌ صُحّح لأمس ⇒ متأخر فعلاً", m.statusForDue("2026-09-28", T) === "overdue");
check("طابعُ وقتٍ كامل يُقرأ بيومه", m.statusForDue("2026-10-01T00:00:00Z", T) === "scheduled");
check("تاريخٌ غير حقيقيّ يُرفض (31 شباط)", !m.validDue("2026-02-31", T));
check("  وصيغةٌ ناقصة تُرفض", !m.validDue("2026-9-1", T) && !m.validDue("", T));
check("  وأبعدُ من خمس سنوات يُرفض، وأقدمُ من سنة يُرفض", !m.validDue("2032-01-01", T) && !m.validDue("2025-01-01", T));
check("  وموعدٌ معقول يمرّ", m.validDue("2026-10-06", T) && m.validDue("2026-09-01", T));
check("«بعد شهر» من ٣١ كانون الثاني يعبر الشهرَ صحيحاً", m.addDays("2026-01-31", 30) === "2026-03-02", m.addDays("2026-01-31", 30));
console.log(`\n${fail ? "✗" : "✓"} vaccine-due-test: ${pass} نجحت، ${fail} فشلت`);
if (fail) process.exit(1);
