/* ============================================================================
 * عقدُ تصنيفات السحوبات (0227) — الواجهةُ والقاعدةُ تقولان الشيءَ نفسَه.
 *
 * ما يحرسه:
 *   • `RESERVED_RAW` = `_expense_reserved_keys()` نصّاً وترتيباً، والتلميحاتُ حرفاً،
 *     والسقفان (٤٠ حرفاً، ٦٠ تصنيفاً) — مرآةٌ تنحرف تقول «مسموح» والخادمُ يرفض.
 *   • نصوصُ النظام الثابتة (مرتجع، payroll، payroll_loan، سحب مخزن) موجودةٌ **بآخر
 *     تعريفٍ** لكلّ دالّةٍ كاتبة — نصٌّ تغيّر هناك يُسقط جدولَه التلقائيّ إلى «بدون تصنيف».
 *   • الجداول: كلُّ سحبٍ بجدولٍ واحد بالضبط ومجموعُها = المجموع؛ العضويةُ بالمعرّف وحده
 *     (نصٌّ يطابق تصنيفاً بلا معرّف ⇒ «بدون تصنيف»)؛ والمؤرشفُ بسحوبه يبقى جدولُه.
 *   • الشاشة: التصنيفُ إلزاميٌّ قبل الحفظ ويُرسل معرّفاً ونصّاً، ولا جلبَ بلا مدّة بعد
 *     الحفظ (كان يقول «تعذّر» عن حفظٍ نجح فتُكتب نسخةٌ ثانية)، وفشلُ القراءة يُقال.
 *
 *   node scripts/withdrawals-contract.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.env.TZ = "Asia/Baghdad";
let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };

const dir = mkdtempSync(join(tmpdir(), "wdr-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/expenseCategoryRules.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const R = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

const MIG = "supabase/migrations";
const sql = readFileSync(`${MIG}/0227_expense_categories.sql`, "utf8");
const C0 = (id, name, archived_at = null) => ({ id, name, created_at: "2026-01-01", archived_at });

console.log("▸ المرآةُ والقاعدة");
const resBody = sql.match(/function public\._expense_reserved_keys\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1] ?? "";
const sqlReserved = [...resBody.matchAll(/inv_norm_group\('([^']*)'\)/g)].map((m) => m[1]);
check("الأسماءُ المحجوزة = _expense_reserved_keys() نصّاً وترتيباً", JSON.stringify(sqlReserved) === JSON.stringify(R.RESERVED_RAW), { sqlReserved, ts: R.RESERVED_RAW });
const sqlHints = Object.fromEntries([...sql.matchAll(/raise exception '(\w+)'\s+using hint = '([^']*)'/g)].map((m) => [m[1], m[2]]));
check("التلميحاتُ الخمسة حرفاً بحرف (المرآةُ ترفع ما يرفعه الخادم)",
  Object.keys(sqlHints).length === 5 && Object.entries(sqlHints).every(([k, v]) => R.EXPENSE_CATEGORY_HINTS[k] === v)
  && Object.keys(R.EXPENSE_CATEGORY_HINTS).length === 5, { sqlHints });
check("سقفُ الاسم ٤٠ بالحارس وبقيد الجدول = EXPENSE_CATEGORY_MAX_LEN",
  /char_length\(new\.name\) > 40/.test(sql) && /char_length\(btrim\(name\)\) between 1 and 40/.test(sql) && R.EXPENSE_CATEGORY_MAX_LEN === 40);
check("سقفُ العيادة ٦٠ = EXPENSE_CATEGORIES_CAP، على الفعّالة بالإضافة والاسترجاع",
  (sql.match(/c\.archived_at is null\) >= 60 then/g) ?? []).length === 2 && R.EXPENSE_CATEGORIES_CAP === 60);
check("  ومرآتُه على الفعّالة كذلك (الأرشفةُ تُفرغ مكاناً)",
  R.categoryNameProblem("جديد", [...Array.from({ length: 59 }, (_, i) => C0(`a${i}`, `ت${i}`)), C0("z", "مؤرشف", "2026-01-01")]) === null
  && R.categoryNameProblem("جديد", Array.from({ length: 60 }, (_, i) => C0(`a${i}`, `ت${i}`))) === "expense_categories_full"
  && R.restoreProblem(Array.from({ length: 60 }, (_, i) => C0(`a${i}`, `ت${i}`))) === "expense_categories_full" && R.restoreProblem([]) === null);
check("الإعادةُ لا تُنشئ شبحاً: التحويلُ يقرأ غيرَ المربوط وحده والعمودُ قبله",
  sql.indexOf("add column if not exists category_id") < sql.indexOf("with legacy as") && /where method <> 'stock' and category_id is null/.test(sql));

/* آخرُ تعريفٍ لكلّ دالّةٍ كاتبة: الملفُّ الأحدث الذي يعرّفها، من موضع تعريفها إلى التالي. */
const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const latestBody = (fn) => {
  const re = new RegExp(`create (or replace )?function (public\\.)?${fn}\\s*\\(`, "i");
  for (const f of files.slice().reverse()) {
    const s = readFileSync(join(MIG, f), "utf8");
    const m = re.exec(s);
    if (!m) continue;
    const rest = s.slice(m.index + 1);
    const next = rest.search(/create (or replace )?function /i);
    return { file: f, body: next < 0 ? rest : rest.slice(0, next) };
  }
  return { file: null, body: "" };
};
const WRITERS = [
  ["payroll_pay_slip", R.SYSTEM_EXPENSE_TEXT.payroll],
  ["payroll_disburse_advance", R.SYSTEM_EXPENSE_TEXT.payroll],
  ["payroll_disburse_loan", R.SYSTEM_EXPENSE_TEXT.payroll_loan],
  ["retail_return", R.SYSTEM_EXPENSE_TEXT.returns],
  ["stock_count_decide", R.SYSTEM_EXPENSE_TEXT.stock],
];
for (const [fn, text] of WRITERS) {
  const { file, body } = latestBody(fn);
  check(`${fn} (${file ?? "؟"}) يكتب «${text}» — جدولُه التلقائيّ يعرفه`, !!file && /insert into (public\.)?expenses/i.test(body) && body.includes(`'${text}'`), file);
}

console.log("▸ الجداول");
const C = (id, name, created_at, archived_at = null) => ({ id, name, created_at, archived_at });
const cats = [C("rent", "إيجار", "2026-01-02"), C("cash", "قاصة", "2026-01-01"), C("old", "كهرباء", "2026-01-03", "2026-05-01"), C("idle", "صيانة", "2026-01-04"), C("gone", "قديم", "2026-01-05", "2026-02-01")];
const E = (id, amount, extra) => ({ id, amount, description: id, spent_at: `2026-10-0${(id.length % 7) + 1}T09:00:00Z`, created_at: "2026-10-01T09:00:00Z", method: "cash", ...extra });
const rows = [
  E("r1", 100, { category_id: "rent", category: "ايجار", spent_at: "2026-10-02T09:00:00Z" }),
  E("r2", 50.25, { category_id: "rent", category: "إيجار", spent_at: "2026-10-05T09:00:00Z" }),
  E("c1", 10, { category_id: "cash", category: "قاصة" }),
  E("o1", 7, { category_id: "old", category: "كهرباء" }),
  E("x1", 3, { category_id: "unknown-id", category: "شي قديم" }),
  E("n1", 20, { category: "ايجار" }),            // نصٌّ يطابق تصنيفاً بلا معرّف ⇒ «بدون تصنيف»
  E("n2", 5, { category: null }),
  E("s1", 30, { category: "مرتجع", method: "card" }),
  E("s2", 500, { category: "payroll", method: "bank" }),
  E("s3", 40, { category: "Payroll ", method: "cash" }), // نفسُ تطبيع القاعدة
  E("s4", 70, { category: "payroll_loan" }),
  E("s5", 60, { category: "سحب مخزن", method: "stock" }),
  E("s6", 9, { category: "شي ثاني", method: "stock" }),   // الطريقةُ تحسم لا النصّ
];
const { tables, idle } = R.groupWithdrawals(rows, cats);
const keys = tables.map((t) => t.key);
check("الترتيب: التصنيفاتُ بإنشائها، ثم مجهولُ المعرّف، ثم «بدون تصنيف»، ثم النظام",
  JSON.stringify(keys) === JSON.stringify(["cat:cash", "cat:rent", "cat:old", "cat:unknown-id", "none", "sys:returns", "sys:payroll", "sys:payroll_loan", "sys:stock"]), keys);
const seen = tables.flatMap((t) => t.rows.map((r) => r.id));
check("كلُّ سحبٍ بجدولٍ واحدٍ بالضبط", seen.length === rows.length && new Set(seen).size === rows.length, seen);
const sumT = Math.round(tables.reduce((s, t) => s + t.total, 0) * 100) / 100;
const sumR = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
check("مجموعُ الجداول = مجموعُ السحوبات (فلساً بفلس)", sumT === sumR, { sumT, sumR });
const tb = (k) => tables.find((t) => t.key === k);
check("العضويةُ بالمعرّف: «ايجار» بلا معرّف ببدون تصنيف لا بجدول الإيجار", tb("cat:rent").rows.length === 2 && tb("none").rows.map((r) => r.id).sort().join() === "n1,n2");
check("المؤرشفُ بسحوبه يبقى جدولُه بتصنيفه", tb("cat:old")?.category?.archived_at === "2026-05-01");
check("ومعرّفٌ لا تعرفه القائمة جدولٌ بلا تصنيف ولا يُرمى صفُّه", tb("cat:unknown-id") && tb("cat:unknown-id").category === undefined && tb("cat:unknown-id").rows[0].id === "x1");
check("«Payroll » بجدول الرواتب (تطبيعُ القاعدة)، وسحبُ المخزن بطريقته", tb("sys:payroll").rows.length === 2 && tb("sys:stock").rows.map((r) => r.id).sort().join() === "s5,s6");
check("الخاملُ: الفعّالُ بلا سحب وحده (المؤرشفُ لا يُذكر)", idle.map((c) => c.id).join() === "idle", idle.map((c) => c.id));
check("الصفوفُ بالجدول من الأحدث", tb("cat:rent").rows.map((r) => r.id).join() === "r2,r1", tb("cat:rent").rows.map((r) => r.id));
check("الاختيارُ: الفعّالةُ وحدها بترتيب إنشائها", R.pickableCategories(cats).map((c) => c.id).join() === "cash,rent,idle");

console.log("▸ فحصُ الاسم (مرآةُ ترتيب الحارس)");
const P = R.categoryNameProblem;
check("فارغٌ وبمحارفَ خفيةٍ وحدها ⇒ bad_name", P("   ", cats) === "expense_category_bad_name" && P("\u200f\u200b", cats) === "expense_category_bad_name");
check("٤١ حرفاً ⇒ bad_name، و٤٠ تمرّ", P("ب".repeat(41), []) === "expense_category_bad_name" && P("ب".repeat(40), []) === null);
check("المحجوز قبل التوأم: «مرتجع» و«PAYROLL_LOAN»", P("مرتجع", []) === "expense_category_reserved" && P("PAYROLL_LOAN", []) === "expense_category_reserved");
check("التوأمُ بالتطبيع («قاصه» توأمُ «قاصة»)، والمؤرشفُ محسوب («كهرباء» مؤرشف)", P("قاصه", cats) === "expense_category_twin" && P("كهرباء", cats) === "expense_category_twin");
check("التسميةُ لنفس المفتاح تمرّ حتى لو كان المحجوزُ مستحيلاً عليه", P("قاصه", cats, "cash") === null);
check("السقفُ عند الإضافة وحدها", P("جديد", Array.from({ length: 60 }, (_, i) => C(`k${i}`, `ت${i}`, "2026"))) === "expense_categories_full" && P("جديد", Array.from({ length: 60 }, (_, i) => C(`k${i}`, `ت${i}`, "2026")), "k0") === null);
check("رمزُ الرفض يُقرأ من رسالة الخادم", R.expenseCategoryErrorCode(new Error("expense_category_twin")) === "expense_category_twin" && R.expenseCategoryErrorCode(new Error("boom")) === null);

console.log("▸ الشاشةُ والمستودع بنصّهما");
const hub = readFileSync("src/pages/AnalyticsHub.tsx", "utf8");
const sub = hub.slice(hub.indexOf("const submit = async () => {"), hub.indexOf("const onDeleteClick"));
check("التصنيفُ إلزاميٌّ قبل الحفظ، ويُرسل معرّفاً ونصّاً", sub.indexOf("if (!cat)") > 0 && sub.indexOf("if (!cat)") < sub.indexOf("repo.addExpense(") && sub.includes("category_id: cat.id") && sub.includes("category: cat.name"));
check("ولا جلبَ للسحوبات بعد الحفظ أو الحذف (كان بلا مدّة وبنفس try الحفظ)", !hub.includes("repo.listExpenses("));
check("  والحفظُ يُضاف للقائمة خارج try الكتابة", sub.indexOf("onChanged(") > sub.indexOf("} catch (e) {"));
check("وفشلُ قراءة السحوبات يُقال بالشاشة (لا «٠» عن خطأ)", hub.includes("loadFailed={expensesFailed}") && /\{!loadFailed && \(/.test(hub));
const pf = readFileSync("src/lib/prefetchData.ts", "utf8");
check("  واللقطةُ تعلّمه ولا تبلعه", pf.includes("expensesFailed = true") && !/listExpenses\([^)]*\)\.catch\(\(\) => \[\] as Expense\[\]\)/.test(pf));
const repoSrc = readFileSync("src/lib/repo.ts", "utf8");
check("addExpense يرسل category_id (والطابورُ يحمل الصفَّ نفسَه)", /category_id: input\.category_id \?\? null/.test(repoSrc));
const roBlock = repoSrc.slice(repoSrc.indexOf("const READ_ONLY_ALLOWED"), repoSrc.indexOf("]);", repoSrc.indexOf("const READ_ONLY_ALLOWED")));
check("قراءةُ التصنيفات مسموحةٌ بالاشتراك المنتهي، وكتاباتُها لا", roBlock.includes('"listExpenseCategories"') && !/"(createExpenseCategory|renameExpenseCategory|setExpenseCategoryArchived)"/.test(roBlock));
check("قراءةُ التصنيفات ترمي (listOrThrow) — «ماكو تصنيفات» عن خطأٍ تُصدَّق", /async listExpenseCategories\(\) \{\s*return listOrThrow</.test(repoSrc));
const delBody = repoSrc.slice(repoSrc.indexOf("async deleteExpense(id) {"), repoSrc.indexOf("async listExpenseCategories()"));
check("حذفُ السحب: القاعدةُ ثم الطابور، وصفرُ صفوفٍ بلا شيءٍ بالطابور يُرمى (سحبٌ بالطابور كان يرجع بعد «انحذف»)",
  delBody.indexOf('.delete().eq("id", id).select("id")') > 0 && delBody.indexOf("outboxDrop(id)") > delBody.indexOf(".delete()") && delBody.includes("no_row_updated"));
const ob = readFileSync("src/lib/outbox.ts", "utf8");
check("  وoutboxDrop يقول هل كان الصفُّ بالطابور", /export function outboxDrop\(id: string\): boolean/.test(ob));
check("اللقطاتُ تُرقَّع كلٌّ بقائمتها (لا بقائمة الشاشة — مدّةٌ تبدّلت أثناء الحفظ)", hub.includes("patchCachedPrefix<AnalyticsSnap>(analyticsPrefix(") && !/setCached<AnalyticsSnap>\(cacheKey, \{ \.\.\.snap, expenses/.test(hub));
check("وفشلُ السحوبات يصل «صافي النقد» والتصدير لا شاشة السحوبات وحدها", hub.includes("expensesFailed={expensesFailed} onRetry=") && /canProfit && !expensesFailed && \(/.test(hub) && /const exportCSV = \(\) => \{[\s\S]{0,200}if \(expensesFailed\)/.test(hub));
check("  وفشلُ اللقطة كلِّها بلا لقطةٍ محفوظة يُعلَّم كذلك", /catch \{[\s\S]{0,260}if \(alive && !cached\) setExpensesFailed\(true\)/.test(hub));
{
  const d2 = mkdtempSync(join(tmpdir(), "swr-")); const o2 = join(d2, "m.mjs");
  await build({ entryPoints: ["src/lib/swrCache.ts"], bundle: true, format: "esm", platform: "node", outfile: o2, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  const S = await import(pathToFileURL(o2).href); rmSync(d2, { recursive: true, force: true });
  S.setCached("analytics:c1:a:b", { expenses: [{ id: "x" }] }, 1000);
  S.setCached("analytics:c1:c:d", { expenses: [{ id: "y" }] }, 2000);
  S.setCached("analytics:c2:a:b", { expenses: [{ id: "z" }] }, 3000);
  S.patchCachedPrefix("analytics:c1:", (s) => ({ ...s, expenses: [{ id: "new" }, ...s.expenses] }));
  check("patchCachedPrefix: كلُّ لقطةٍ بقائمتها، وبعمرها، ولا تمسّ عيادةً أخرى",
    S.getCached("analytics:c1:a:b").expenses.map((e) => e.id).join() === "new,x" && S.getCached("analytics:c1:c:d").expenses.map((e) => e.id).join() === "new,y"
    && S.cachedAt("analytics:c1:a:b") === 1000 && S.getCached("analytics:c2:a:b").expenses.length === 1);
}
const en = JSON.parse(readFileSync("src/i18n/en.json", "utf8")), ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
check("لكلّ رمزِ رفضٍ ترجمتُه بالقاموسين", Object.keys(R.EXPENSE_CATEGORY_HINTS).every((k) => en.wdr?.err?.[k] && ar.wdr?.err?.[k]));
check("ولكلّ جدولِ نظامٍ اسمُه بالقاموسين", R.SYSTEM_TABLE_ORDER.every((k) => en.wdr?.sys?.[k] && ar.wdr?.sys?.[k]));

console.log(fail === 0 ? `✓ withdrawals-contract: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
