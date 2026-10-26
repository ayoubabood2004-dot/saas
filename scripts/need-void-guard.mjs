// need-void-guard — `need()` ترمي على «لا بيانات»، ودالّةٌ ترجع void لا ترجع بيانات أبداً.
// فـ`need(await sbc().rpc("f"))` على دالّةٍ void يحسب كلَّ نجاحٍ فشلاً: عدّادُ صيغ المسح
// كان يعيد ما رفعه ويرفعه ثانيةً فتضخّم ×٥٠–١٧٠ (مقيس ٣/١٠). يقرأ آخرَ تعريفٍ لكلّ دالّة
// بالهجرات ويفشّل البناء إن كانت void.
// وبابُ المستهلكات الكسول (consumptionApi.ts، 0252–0255) خارجَ الريبو ونظيرُ need فيه `rpcJson`:
// يرمي على الخطأ وعلى `data == null` بالمثل، فنداؤه على دالّةٍ void يحسب كلَّ نجاحٍ فشلاً كذلك.
// وملفٌّ لا يُلقى فيه نداءٌ واحد يُفشّل: حارسٌ يخرج صفراً بلا كلمة ليس حارساً.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCES = [
  ["src/lib/repo.ts", /need(?:<[^>]*>)?\(\s*await\s+sbc\(\)\.rpc\(\s*"([a-z_0-9]+)"/g],
  ["src/lib/consumptionApi.ts", /rpcJson(?:<[^>]*>)?\(\s*"([a-z_0-9]+)"/g],
];
let empty = 0;
const called = [], perFile = [];
for (const [file, re] of SOURCES) {
  const found = existsSync(file) ? [...readFileSync(file, "utf8").matchAll(re)].map((m) => m[1]) : [];
  if (!found.length) { empty++; console.log(`   ✗ ${file}: ${existsSync(file) ? "ولا نداءَ واحداً — صيغةُ النداء تغيّرت؟ حدِّث نمطَه هنا" : "مفقود — حدِّث SOURCES"}`); }
  called.push(...found);
  perFile.push(`${file.split("/").pop()} ${new Set(found).size}`);
}
const names = [...new Set(called)];

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const ret = new Map();   // آخرُ تعريفٍ يغلب
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\([^)]*\)\s*returns\s+(setof\s+)?([a-z_0-9.\[\]]+)/gi)) {
    ret.set(m[1].toLowerCase(), `${m[2] ? "setof " : ""}${m[3].toLowerCase()}@${f}`);
  }
}

let bad = 0, unknown = [];
for (const n of names) {
  const r = ret.get(n);
  if (!r) { unknown.push(n); continue; }
  if (r.startsWith("void@")) { bad++; console.log(`   ✗ need()/rpcJson على ${n} — ترجع void (${r.split("@")[1]}): كلُّ نجاحٍ يُحسب فشلاً. افحص error وحده.`); }
}
if (unknown.length) console.log(`   · لم أجد تعريفاً بالهجرات لـ: ${unknown.join("، ")} (تُركت)`);
console.log(`${bad || empty ? "✗" : "✓"} need-void-guard: فُحصت ${names.length} دالّةً تنادى عبر need()/rpcJson (${perFile.join("، ")})، ${bad} منها void.`);
if (bad || empty) process.exit(1);
