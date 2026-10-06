// need-void-guard — `need()` ترمي على «لا بيانات»، ودالّةٌ ترجع void لا ترجع بيانات أبداً.
// فـ`need(await sbc().rpc("f"))` على دالّةٍ void يحسب كلَّ نجاحٍ فشلاً: عدّادُ صيغ المسح
// كان يعيد ما رفعه ويرفعه ثانيةً فتضخّم ×٥٠–١٧٠ (مقيس ٣/١٠). يقرأ آخرَ تعريفٍ لكلّ دالّة
// بالهجرات ويفشّل البناء إن كانت void.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repo = readFileSync("src/lib/repo.ts", "utf8");
const called = [...repo.matchAll(/need(?:<[^>]*>)?\(\s*await\s+sbc\(\)\.rpc\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]);
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
  if (r.startsWith("void@")) { bad++; console.log(`   ✗ need() على ${n} — ترجع void (${r.split("@")[1]}): كلُّ نجاحٍ يُحسب فشلاً. افحص error وحده.`); }
}
if (unknown.length) console.log(`   · لم أجد تعريفاً بالهجرات لـ: ${unknown.join("، ")} (تُركت)`);
console.log(`${bad ? "✗" : "✓"} need-void-guard: فُحصت ${names.length} دالّةً تنادى عبر need()، ${bad} منها void.`);
if (bad) process.exit(1);
