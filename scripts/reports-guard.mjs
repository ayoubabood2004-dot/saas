/* ============================================================================
 * حارس التقارير — لا قراءةَ لجداول المال بلا مدّة.
 *
 * القياس: سبعةُ مواضع كانت تنزّل كلَّ الفواتير وكلَّ سطورها لتفلتر بالمتصفّح؛
 * عيادةٌ تنزّل ميغابايتات كل فتحة، وعند ١٠٠ ألف سطر يطيح الجهاز. هذا الحارس
 * يمنع رجوعَ العادة بالغلط: كلُّ نداء `listInvoices(` أو `listAllInvoiceItems(`
 * لازم يمرّر مدّةً (وسيطٌ ثانٍ غير undefined) أو يُوسَم على نفس السطر بـ
 * `/* unbounded: <سبب> *\/` — فيبقى الاستثناءُ مرئياً ومكتوباً سببُه.
 *
 *   node scripts/reports-guard.mjs
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const CALLS = /\brepo\.(listInvoices|listAllInvoiceItems)\s*\(/g;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(ROOT);

/** يقرأ الوسائط بين القوسين المتوازنين ابتداءً من موضع القوس الفاتح. */
function argsAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}
const splitTop = (s) => {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

let bad = 0, ok = 0, marked = 0;
for (const f of files) {
  if (f.endsWith(path.join("lib", "repo.ts"))) continue; // التعريفات نفسها
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(CALLS)) {
    const open = m.index + m[0].length - 1;
    const args = splitTop(argsAt(src, open));
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    const lineEnd = src.indexOf("\n", m.index);
    const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    const lineNo = src.slice(0, m.index).split("\n").length;
    const hasRange = args.length >= 2 && args[1] !== "undefined" && args[1] !== "null";
    if (hasRange) { ok++; continue; }
    if (/\/\*\s*unbounded:\s*\S/.test(line)) { marked++; continue; }
    bad++;
    console.error(`   ✗ ${f}:${lineNo} — ${m[1]}( بلا مدّة: مرّر { from, to } أو وسِمه على السطر بـ /* unbounded: السبب */`);
  }
}
if (bad) { console.error(`✗ reports-guard: ${bad} نداءً بلا مدّة`); process.exit(1); }
console.log(`✓ reports-guard: ${ok} نداءً بمدّة، و${marked} موسومةً بسببها، ولا نداءَ أعمى.`);
