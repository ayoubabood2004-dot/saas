/* ============================================================================
 * «تم التذكير» — والتذكيراتُ المتأخرة التي لا تروح حتى بعد الإرسال
 *
 * الشكوى (المالك): «التذكيرات المتأخرة حتى لو يدزون رسائل فيها تضل متأخرة وما
 * تروح. أريد زرّاً بداخل كل تذكير: تم التذكير — يودّيه للخطوة التي بعدها كأنما
 * أرسلتُ رسالةً وكمّلت كلَّ شيء».
 *
 * المقيس قبل الكتابة: حالةُ التذكير (أُرسلت، جاؤوا) كانت **بمتصفّح الجهاز وحده**،
 * والجسرُ العابرُ للأجهزة سجلُّ الواتساب مطابَقاً بـ«الحيوان + النوع» — وصفحةُ
 * الحملات تسجّل رسائلَ التذكير `manual` منذ c3680c1، فلا يطابق شيئاً. بالإنتاج
 * ٢٢٢ صفّاً أحمرَ بـ١٢ عيادة، ١٣٩ منها أُرسلت لنفس الحيوان.
 *
 * العلاج: علاماتٌ على الخادم (0208) مفتاحُها (الصفّ، تاريخ الاستحقاق) — فيتبعها كلُّ
 * جهاز، ويتجدّد الموعدُ فتسقط القديمة وحدَها (هذه «الخطوةُ التالية» بلا اختلاق).
 * ولا أثرَ سريريّ: «تم التذكير» لا يكتب «أُعطيت الجرعة».
 *
 *   node scripts/reminders-done-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");

/* ── ١) الحكمُ على الصفّ: جدولُ القرار سلوكاً ─────────────────────────────── */
console.log("▸ الحكم — «تم التذكير» يعلو، والعلامةُ لا تنطبق إلا على تاريخها");
const pure = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/reminderMarks";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  plugins: [{ name: "types", setup(b) {
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export {};", loader: "js" }));
  } }],
}).catch(() => null);
const M = pure ? await import("data:text/javascript;base64," + Buffer.from(pure.outputFiles[0].text).toString("base64")) : null;
check("الوحدةُ صِرفةٌ مفحوصة (src/lib/reminderMarks.ts)", !!M && typeof M.judgeLifecycle === "function");
if (M && typeof M.judgeLifecycle === "function") {
  const J = M.judgeLifecycle;
  const row = { kind: "vaccine", date: "2026-09-01", inDays: -23 };
  const base = { done: false, localOutcome: null, sentAt: null, sentAgoDays: 0, graceDays: 3 };
  check("بلا شيء ⇒ قيد المتابعة (أحمرُ المتأخر)", J(row, base).st === "active");
  check("«تم التذكير» ⇒ جاؤوا، ويُعرف أنه «تم»", J(row, { ...base, done: true }).st === "arrived" && J(row, { ...base, done: true }).done === true);
  check("  ويعلو على «ما جاء» اليدويّ وعلى غياب السستم وعلى الإرسال",
    J({ ...row, autoMissed: true }, { ...base, done: true, localOutcome: { s: "missed", d: row.date }, sentAt: "2026-09-02", sentAgoDays: -22 }).st === "arrived");
  check("أُرسلت ⇒ أُرسلت", J(row, { ...base, sentAt: "2026-09-22", sentAgoDays: -2 }).st === "sent");
  check("  وبعد مهلة السماح من يوم الإرسال ⇒ ما جاؤوا", J(row, { ...base, sentAt: "2026-09-10", sentAgoDays: -14 }).st === "missed");
  check("  وعيدُ الميلاد لا «غيابَ» له", J({ ...row, kind: "birthday" }, { ...base, sentAt: "2026-09-10", sentAgoDays: -14 }).st === "sent");
  check("تثبيتُ الدكتور يخصّ تاريخَه وحدَه", J(row, { ...base, localOutcome: { s: "arrived", d: row.date } }).st === "arrived"
    && J(row, { ...base, localOutcome: { s: "arrived", d: "2026-06-01" } }).st === "active");
  check("وشهادةُ السستم: وصولٌ ثم غياب", J({ ...row, autoArrivedAt: "2026-09-05" }, base).st === "arrived" && J({ ...row, autoMissed: true }, base).st === "missed");

  const marks = [
    { id: "1", row_key: "vax-a", due_date: "2026-09-01", state: "done", sent_at: "2026-09-02T10:00:00Z", marked_at: "x" },
    { id: "2", row_key: "rem-b", due_date: "2026-09-10", state: "sent", sent_at: "2026-09-11T08:00:00Z", marked_at: "x" },
  ];
  const idx = M.indexMarks(marks);
  check("العلامةُ بـ(الصفّ، التاريخ): «تم» لموعدٍ لا تنطبق على الموعد التالي — «الخطوةُ التالية»",
    M.isDone(idx, "vax-a", "2026-09-01") === true && M.isDone(idx, "vax-a", "2026-10-01") === false);
  check("  ويومُ الإرسال من الخادم يُقرأ بالصفّ وتاريخه", M.serverSentDay(idx, "rem-b", "2026-09-10") === "2026-09-11"
    && M.serverSentDay(idx, "rem-b", "2026-09-17") === null && M.serverSentDay(idx, "nope", "2026-09-10") === null);
  check("  و«أُرسلت» ليست «تم»", M.isDone(idx, "rem-b", "2026-09-10") === false);
}

/* ── ٢) مرآةُ الديمو: نفسُ دلالة الجدول سلوكاً ─────────────────────────────── */
console.log("▸ الريبو (التجريبي) — «تم» فوق «أُرسلت» يُبقي يومَها، والتراجعُ صادق");
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
};
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubMap = {
  i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
  "./supabase": "export const supabase = null;",
  "./globalToast": "export const emitGlobalToast = () => {};",
};
let repo = null;
try {
  const built = await esbuild.build({
    entryPoints: ["src/lib/repo.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{ name: "stubs", setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubMap[a.path] ?? "export default {};", loader: "js" }));
    } }],
  });
  const dir = mkdtempSync(join(tmpdir(), "rem-done-"));
  const file = join(dir, "repo.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
  repo = mod.repo ?? mod.demoRepo ?? null;
} catch { repo = null; }
const has = (f) => !!repo && typeof repo[f] === "function";
check("الريبو التجريبيّ فيه الأربع (قراءة، تم، أُرسلت، تراجع)",
  ["listReminderMarks", "markReminderDone", "markReminderSent", "undoReminderDone"].every(has));
if (["listReminderMarks", "markReminderDone", "markReminderSent", "undoReminderDone"].every(has)) {
  const get = async (k, d) => (await repo.listReminderMarks("2000-01-01")).find((m) => m.row_key === k && m.due_date === d);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await repo.markReminderSent("vax-1", "2026-09-01");
  const s1 = await get("vax-1", "2026-09-01");
  check("«أُرسلت» تُسجَّل بيومها", s1?.state === "sent" && !!s1?.sent_at);
  await sleep(5);
  await repo.markReminderSent("vax-1", "2026-09-01");
  const s2 = await get("vax-1", "2026-09-01");
  check("  وإعادةُ الإرسال تجدّد اليوم (مهلةُ السماح تُعدّ منه)", s2?.state === "sent" && s2.sent_at > s1.sent_at);
  const d1 = await repo.markReminderDone("vax-1", "2026-09-01");
  check("«تم» فوق «أُرسلت» ⇒ تم، ويومُ الإرسال باقٍ", d1?.state === "done" && d1.sent_at === s2.sent_at);
  await repo.markReminderSent("vax-1", "2026-09-01");
  check("  و«أُرسلت» بعدها لا تُنزل «تم»", (await get("vax-1", "2026-09-01"))?.state === "done");
  await repo.undoReminderDone("vax-1", "2026-09-01");
  const u1 = await get("vax-1", "2026-09-01");
  check("التراجعُ عن «تم» أُرسلت قبلها ⇒ تعود «أُرسلت» (لا أحمرَ كأنها لم تُرسل)", u1?.state === "sent" && u1.sent_at === s2.sent_at);

  await repo.markReminderDone("srg-2", "2026-08-20");
  await repo.undoReminderDone("srg-2", "2026-08-20");
  check("  و«تم» بلا إرسالٍ قبلها ⇒ التراجعُ يزيل العلامة", (await get("srg-2", "2026-08-20")) === undefined);
  let threw = null;
  try { await repo.undoReminderDone("srg-2", "2026-08-20"); } catch (e) { threw = e; }
  check("  وتراجعٌ لا شيءَ تحته يُرمى (لا «تراجعتُ» كاذبة)", !!threw && (threw.code === "no_row_updated" || /no_row_updated/.test(String(threw.message))));

  await repo.markReminderDone("rem-3", "2026-09-01");
  await repo.markReminderDone("rem-3", "2026-10-01");
  const all = await repo.listReminderMarks("2000-01-01");
  check("«تم» لموعدين للتذكير نفسه علامتان — لا تختلطان", all.filter((m) => m.row_key === "rem-3").length === 2);
  const recent = await repo.listReminderMarks("2026-09-15");
  check("القراءةُ محدودةٌ بالتاريخ", recent.every((m) => m.due_date >= "2026-09-15") && recent.some((m) => m.row_key === "rem-3"));
}

/* ── ٣) عقدُ الملفّات: الهجرة، السحابيّ، الشاشة، الحملات، اللوحة ──────────── */
console.log("▸ الهجرة 0208");
const MIG = read("supabase/migrations/0208_reminder_marks.sql");
check("جدولٌ بمفتاحٍ فريدٍ (العيادة، الصفّ، التاريخ)", /create table if not exists reminder_marks/.test(MIG)
  && /unique \(clinic_id, row_key, due_date\)/.test(MIG));
check("  والحالةُ «أُرسلت» أو «تم» فقط، ويومُ الإرسال منفصل", /check \(state in \('sent', 'done'\)\)/.test(MIG) && /sent_at\s+timestamptz/.test(MIG));
check("  وRLS بسياسةٍ واحدةٍ بنمط initplan، لا تقرأ جدولَها (0162)",
  /enable row level security/.test(MIG) && /for all to authenticated\s*using \(clinic_id = \(select auth_clinic\(\)\)\)\s*with check \(clinic_id = \(select auth_clinic\(\)\)\)/.test(MIG)
  && !/from reminder_marks/.test(MIG.slice(MIG.indexOf("create policy"))));
check("  ولا أثرَ لمشغّل المنصّة (0151): marked_by فارغٌ حين يعمل داخل العيادة",
  /marked_by\s+uuid default \(case when platform_acting_clinic\(\) is null then auth\.uid\(\) end\)/.test(MIG));
check("  ولا شيءَ لـanon", /revoke all on reminder_marks from anon/.test(MIG) && !/to anon/.test(MIG));
check("  وبالموجة (هجرةٌ خارجها غيرُ مفحوصة)", /0208_reminder_marks\.sql/.test((read("supabase/tests/run.sh").split("\n").find((l) => l.startsWith("WAVE=")) || "")));

console.log("▸ الريبو (السحابي)");
const REPO = read("src/lib/repo.ts");
const cloudAt = REPO.indexOf("  async listReminderMarks(since) {");
const cloud = cloudAt < 0 ? "" : REPO.slice(cloudAt, REPO.indexOf("  /* ---------------- Inventory & POS", cloudAt));
check("القراءةُ بـallPages وتُرمى (لا تُبلع: صفرُ علاماتٍ يعيد «تم» أحمرَ)", /return allPages<ReminderMark>\(\(\) => sbc\(\)\.from\("reminder_marks"\)\.select\("\*"\)\.gte\("due_date", since\)\);/.test(cloud) && !/\.catch\(/.test(cloud));
check("«تم»: upsert بالمفتاح الفريد، يُسمع صوتُه، ولا يحمل sent_at (فيبقى يومُ الإرسال)",
  /markReminderDone\(rowKey, dueDate\) \{[\s\S]{0,400}?return updated<ReminderMark>\([\s\S]{0,300}?onConflict: "clinic_id,row_key,due_date"/.test(cloud)
  && !/markReminderDone\(rowKey, dueDate\) \{[\s\S]{0,400}?sent_at: /.test(cloud));
check("«أُرسلت»: تجدّد يومَ «أُرسلت» وإلا إدراجٌ يُتجاهَل عند التعارض (لا تُنزل «تم»)",
  /\.eq\("state", "sent"\)\.select\("id"\)/.test(cloud) && /ignoreDuplicates: true/.test(cloud));
check("التراجع: «تم» ⇒ «أُرسلت» إن أُرسلت، وإلا تُحذف — وصفرُ صفوفٍ يُرمى",
  /undoReminderDone\(rowKey, dueDate\) \{[\s\S]*?\.not\("sent_at", "is", null\)[\s\S]*?\.delete\(\)[\s\S]*?=== 0\) assertUpdated/.test(cloud));
const RO = REPO.slice(REPO.indexOf("const READ_ONLY_ALLOWED"), REPO.indexOf("]);", REPO.indexOf("const READ_ONLY_ALLOWED")));
check("القراءةُ مسموحةٌ باشتراكٍ منتهٍ، والكتابةُ لا", /"listReminderMarks"/.test(RO) && !/"markReminderDone"|"markReminderSent"|"undoReminderDone"/.test(RO));

console.log("▸ مركز التذكيرات");
const HUB = read("src/pages/RemindersHub.tsx");
check("العلاماتُ تُحمَّل بلا .catch (فشلُها يُقال لا يُبلع)", /repo\.listReminderMarks\(since\),/.test(HUB) && !/listReminderMarks\([^)]*\)\.catch/.test(HUB));
check("  والفشلُ يُقال بشريطٍ وزرّ إعادة، ولا «كل شيء تحت السيطرة» على قائمةٍ لم تصل",
  /catch \{ setLoadErr\(true\); \}/.test(HUB) && /data-remloaderr/.test(HUB) && /rem\.loadFailed/.test(HUB) && /loadErr && allRows\.length === 0 \? null/.test(HUB));
check("الحكمُ بالدالّة الصِرفة، و«تم» من علامات الخادم", /judgeLifecycle\(r, \{/.test(HUB) && /const done = isDone\(markIndex, r\.id, r\.date\);/.test(HUB));
check("  و«أُرسلت» من الخادم دقيقةٌ بالصفّ وتاريخه", /const sd = serverSentDay\(markIndex, r\.id, r\.date\);/.test(HUB));
check("  و«تم» على موعدٍ قديم يخرج بعد مهلة الإبقاء (لا يبقى بـ«جاؤوا» للأبد)", /if \(done && r\.inDays < -OUTCOME_KEEP_DAYS\) return \[\];/.test(HUB));
const activeBtnAt = HUB.indexOf("{t(\"rem.sendShort\", \"ذكّر\")}");
const activeTail = activeBtnAt < 0 ? "" : HUB.slice(activeBtnAt, HUB.indexOf("</motion.div>", activeBtnAt));
check("زرُّ «تم التذكير» بكلّ صفٍّ قيد المتابعة — **ولو بلا هاتف** (كان بلا فعلٍ إطلاقاً)",
  /data-remdone=\{r\.id\}/.test(activeTail) && /\)\}\s*\{\/\*[\s\S]*?\*\/\}\s*<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); void markDone\(r\); \}\}/.test(activeTail));
check("  وبـ«أُرسلت» و«ما جاؤوا» أيضاً", /\{\(view === "sent" \|\| view === "missed"\) && \(\s*<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); void markDone\(r\); \}\}/.test(HUB));
check("  ولا يختفي: بـ«جاؤوا» يُقال «تم التذكير» وبزرّ تراجع", /j\.done \? t\("rem\.markDone"/.test(HUB) && /data-remundodone=\{r\.id\}/.test(HUB) && /void undoDone\(r\)/.test(HUB));
check("  وضغطتان لا تكتبان مرّتين، والفشلُ يُقال", /if \(markBusy\) return;/.test(HUB) && /disabled=\{markBusy === r\.id\}/.test(HUB) && /describeDbError\(e, t\)/.test(HUB));
check("  ولا window.confirm (يُقبل بلا قراءة — CLAUDE.md)", !/window\.confirm/.test(HUB));
check("  ولا أثرَ سريريّ: «تم» لا يكتب لقاحاً ولا زيارة", /const markDone = async/.test(HUB) && !/markDone[\s\S]{0,900}?(updateVaccination|addVaccination|addVisit)/.test(HUB));

console.log("▸ الحملات — جذرُ «أُرسلت وبقيت حمراء»");
const CAMP = read("src/pages/WhatsAppCampaigns.tsx");
check("رسالةُ التذكير تُسجَّل بنوع التذكير لا بشريحة الصفحة (كانت manual دائماً منذ c3680c1)",
  /const kind = fromReminder\?\.kind \?\? \(segment === "all" \? "manual" : segment\);/.test(CAMP) && /\n\s+kind,\n/.test(CAMP) && !/kind: segment === "all" \? "manual" : segment/.test(CAMP));
check("  والنوعُ يُحمل من التذكير", /kind: prefill\.reminderKind \?\? null/.test(CAMP));
check("  و«أُرسلت» تُكتب على الخادم لكلّ الأجهزة، وفشلُها يُقال", /repo\.markReminderSent\(fr\.id, fr\.date\)\.catch\(\(\) => \{\s*toast\.error\(t\("rem\.sentMarkFailed"/.test(CAMP));

console.log("▸ لوحة التحكم");
const W = read("src/components/RemindersWidget.tsx");
check("الودجةُ لا تصرخ «متأخر» عن تذكيرٍ «تم»", /\.filter\(\(r\) => !isDone\(idx, r\.id, r\.date\)\)/.test(W) && /repo\.listReminderMarks\(since\)/.test(W));
check("  والصفُّ يحمل تاريخَه (مفتاحُ العلامة)", /date: v\.due_date\.slice\(0, 10\),/.test(read("src/lib/reminders.ts")));

console.log("▸ الترجمة");
const ar = JSON.parse(read("src/i18n/ar.json") || "{}"), en = JSON.parse(read("src/i18n/en.json") || "{}");
for (const k of ["markDone", "loadFailed", "sentMarkFailed"]) check(`  مفتاحُ rem.${k} بالملفّين`, !!ar?.rem?.[k] && !!en?.rem?.[k]);

console.log(`\n${fails ? "✗" : "✓"} reminders-done-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
