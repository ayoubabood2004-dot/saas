/* ============================================================================
 * تعديلُ الرصيد السابق والتسوية بدفتر الشركة (0281) بالواجهة — بسلوكه، ثمّ الأسلاك، ثمّ طفرات. الخادمُ (الدالّة بحرّاسها، العمودُ،
 * الصلاحياتُ والتدقيق) يفحصه قسمُ 0281 بالحزمة على بوستغريس.
 *   أ) الصِّرف: سجلُّ التعديلات يُقرأ ولا يُسقطه سطرٌ تالف؛ من يتعدّل؛ الحدُّ الأدنى (الدائنُ بما انسدّ منه، والمدينُ بلا حدّ)؛
 *      حكمُ النافذة بترتيب رفض الخادم وما تقوله تحت الزرّ بترتيب القارئ، وأثرُ التعديل على رصيد الشركة.
 *   ب) المرآةُ التجريبية: الرفضُ نفسُه بترتيبه (الدور، ما رآه، بلا سبب، بلا تغيير، تحت ما انسدّ، التسويةُ بلا سبب، التسديد، الملغاة،
 *      الخمسون)، والقبولُ يكتب «كان ← صار» بسببه، والدفترُ يقرأ المبلغَ الجديد.
 *   ج) الحكمُ والمرآةُ متّفقان على كلّ مسودّة من شبكةٍ (المبلغ × التاريخ × الملاحظة × السبب): ما تقبله النافذةُ يقبله الخادم.
 *   د) الأسلاك. هـ) طفرات.
 *
 *   node scripts/company-entry-edit-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (f) => readFileSync(f, "utf8");
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } }, visibilityState: "visible",
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
async function load(muts = []) {
  const plug = {
    name: "stubs",
    setup(b) {
      const map = {
        i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
        "./supabase": "export const supabase = null;",
        "./globalToast": "export const emitGlobalToast = () => {};",
      };
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
      b.onLoad({ filter: /src[\\/]lib[\\/][A-Za-z]+\.ts$/ }, (a) => {
        const rel = path.relative(process.cwd(), a.path).split(path.sep).join("/");
        const mine = muts.filter((m) => m[0] === rel);
        if (!mine.length) return undefined;
        let s = readFileSync(a.path, "utf8");
        for (const [, from, to] of mine) {
          if (!s.includes(from)) throw new Error(`طفرةٌ ما لقت نصّها بـ${rel}: ${from}`);
          s = s.replace(from, to);
        }
        return { contents: s, loader: "ts" };
      });
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/repo.ts";',
        'export * as E from "./src/lib/companyEntryEdit.ts";',
        'export { editCompanyEntry, entryEditReady } from "./src/lib/companyEntryEditApi.ts";',
        'export { buildCompanyLedger } from "./src/lib/companyLedger.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "company-entry-edit-test-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [plug], logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(path.join(tmpdir(), "company-entry-edit-test-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const session = (role) => {
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id: "u-1", clinic_id: "clinic-1", rawRole: role, staff: { clinicId: "clinic-1", role } } }));
};
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };
const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

async function behaviour(M, say) {
  let ok = true;
  const c = (name, cond, detail) => { if (say) check(name, cond, detail); if (!cond) ok = false; };
  const { E, repo, editCompanyEntry, entryEditReady, buildCompanyLedger } = M;

  /* أ) الصِّرف */
  const raw = [
    { at: "2026-11-01T10:00:00Z", by: "u", reason: " غلط ", before: { amount: "1000000.00", date: "2025-06-01", note: "دفتر" }, after: { amount: 1200000, date: "2025-06-01", note: " دفتر " } },
    { at: "x", reason: "تالف", before: { amount: "x", date: "2025-06-01" }, after: { amount: 1, date: "2025-06-01" } },
    null, "s",
    { at: "2026-11-02T10:00:00Z", reason: "تاريخ", before: { amount: 1200000, date: "2025-06-01", note: null }, after: { amount: 1200000, date: "2025-05-01T00:00:00", note: "" } },
  ];
  const ed = E.readEdits(raw);
  c("سجلُّ التعديلات: سطران سليمان بترتيبهما، والتالفُ يُترك، والسببُ والملاحظةُ مقصوصان، والفارغةُ null، والتاريخُ يومٌ",
    ed.length === 2 && ed[0].reason === "غلط" && ed[0].before.amount === 1000000 && ed[0].after.note === "دفتر"
    && ed[1].after.date === "2025-05-01" && ed[1].after.note === null && E.readEdits(null).length === 0 && E.readEdits({}).length === 0,
    JSON.stringify(ed));
  const ent = (o) => ({ id: "e1", company_id: "co", kind: "opening", direction: "credit", amount: 1000, entry_date: "2025-06-01", note: null, created_at: "t", voided_at: null, ...o });
  c("من يتعدّل: الرصيدُ السابق والتسويةُ الحيّان وحدهما",
    E.editableEntry(ent()) && E.editableEntry(ent({ kind: "adjust", direction: "debit" })) && !E.editableEntry(ent({ kind: "payment", direction: "debit" }))
    && !E.editableEntry(ent({ voided_at: "2026-01-01" })));
  c("الحدُّ: الدائنُ = ما انسدّ منه (المبلغ − الرصيد السابق الموجب)، والرصيدُ السالب يحرّم أيَّ نزول، والمدينُ بلا حدّ",
    E.editFloor(ent(), 400) === 600 && E.editFloor(ent(), 1500) === 0 && E.editFloor(ent(), -50) === 1000 && E.editFloor(ent({ direction: "debit", kind: "adjust" }), 0) === null);
  const P = (o, d, pool = 1000) => E.planEdit(ent(o), { amount: 1000, date: "2025-06-01", note: "", reason: "سبب", ...d }, pool, TODAY);
  c("الحكم: لا تغيير ⇒ noChange (والنافذةُ تقولها قبل السبب)، وتغييرٌ بلا سبب ⇒ reason",
    P({}, { reason: "" }).why === "reason" && P({}, { reason: "" }).show === "noChange" && P({}, {}).why === "noChange"
    && P({}, { amount: 1100, reason: " " }).why === "reason" && P({}, { amount: 1100, reason: " " }).show === "reason" && P({}, { amount: 1100 }).ok);
  c("  المبلغُ صفرٌ أو فارغٌ أو ليس رقماً ⇒ amount (يُقال قبل السبب)، والتاريخُ بالمستقبل أو قبل ٢٠٠٠ ⇒ date",
    P({}, { amount: 0 }).show === "amount" && P({}, { amount: null, reason: "" }).show === "amount" && P({}, { amount: NaN }).why === "amount"
    && P({}, { date: "2999-01-01" }).why === "date" && P({}, { date: "1999-12-31" }).why === "date" && P({}, { date: TODAY }).ok);
  c("  الدائن: تحت ما انسدّ ⇒ floor بالحدّ، وعليه بالضبط يمرّ، وصعودُه يمرّ ولو الرصيدُ سالب",
    P({}, { amount: 500 }, 400).why === "floor" && P({}, { amount: 500 }, 400).floor === 600 && P({}, { amount: 600 }, 400).ok
    && P({}, { amount: 1500 }, -80).ok && P({}, { amount: 999.99 }, -80).why === "floor");
  c("  التسوية: بلا ملاحظة ⇒ noteRequired، والمدينةُ تنزل وتصعد بلا حدّ",
    P({ kind: "adjust", direction: "debit", note: "خصم" }, { note: " " }).why === "noteRequired"
    && P({ kind: "adjust", direction: "debit", note: "خصم" }, { amount: 1, note: "خصم" }, -9999).ok);
  c("  الطولُ: سببٌ فوق ٣٠٠ وملاحظةٌ فوق ٥٠٠ تُرفضان",
    P({}, { amount: 1100, reason: "x".repeat(301) }).why === "reasonLong" && P({}, { note: "x".repeat(501) }).why === "noteLong");
  const up = P({}, { amount: 1250.555 }), dn = P({ kind: "adjust", direction: "debit", note: "خ" }, { amount: 1300, note: "خ" });
  c("  الأثر: الدائنُ يزيد الرصيدَ بفرقه (بمنزلتين)، والمدينُ يُنقصه بفرقه",
    up.diff === 250.56 && up.balanceDelta === 250.56 && dn.diff === 300 && dn.balanceDelta === -300 && up.changed.amount && !up.changed.date);
  c("  الملاحظةُ تُقارن مقصوصةً (مسافاتٌ وحدها ليست تغييراً)",
    P({ note: "دفتر" }, { note: "  دفتر " }).why === "noChange" && P({ note: "دفتر" }, { note: "" }).changed.note);

  /* ب) المرآةُ التجريبية */
  mem.clear();
  session("owner");
  c("القاعدةُ تعرف التعديل بالتجريبيّ دائماً (entryEditReady)", entryEditReady(ent()));
  const co = await repo.createCompany({ name: "شركة التعديل" });
  const op = await repo.addCompanyOpening(co.id, 1000000, "2025-06-01", "من الدفتر");
  const seen = (e) => E.seenOf(e);
  const list = async () => (await repo.listCompanyEntries()).filter((x) => x.company_id === co.id);
  const one = async (id) => (await list()).find((x) => x.id === id);
  session("doctor");
  c("الطبيبُ لا يعدّل (forbidden)", (await errOf(() => editCompanyEntry(op.id, 1200000, "2025-06-01", "من الدفتر", "غلط", seen(op)))) === "forbidden");
  session("owner");
  const rej = await Promise.all([
    errOf(() => editCompanyEntry(op.id, 1200000, "2025-06-01", "من الدفتر", "  ", seen(op))),
    errOf(() => editCompanyEntry(op.id, 1200000, "2025-06-01", "من الدفتر", "غلط", { ...seen(op), amount: 999999 })),
    errOf(() => editCompanyEntry(op.id, 1200000, "2025-06-01", "من الدفتر", "غلط", { ...seen(op), note: null })),
    errOf(() => editCompanyEntry(op.id, 1000000, "2025-06-01", " من الدفتر ", "غلط", seen(op))),
    errOf(() => editCompanyEntry(op.id, 0, "2025-06-01", "من الدفتر", "غلط", seen(op))),
    errOf(() => editCompanyEntry(op.id, 1200000, "2999-01-01", "من الدفتر", "غلط", seen(op))),
    errOf(() => editCompanyEntry("nope", 1200000, "2025-06-01", "من الدفتر", "غلط", seen(op))),
  ]);
  c("المرآة: الرفضُ كالخادم (بلا سبب، ما رآه غيرُ الحاليّ، بلا تغيير، صفر، المستقبل، حركةٌ غائبة)",
    rej.join("|") === "reason_required|entry_changed|entry_changed|no_change|bad_amount|bad_date|no_entry", rej.join("|"));
  const r1 = await editCompanyEntry(op.id, 1200000, "2025-06-01", "من الدفتر", " غلط بالكتابة ", seen(op));
  const after1 = await one(op.id);
  const h1 = E.readEdits(after1.edits);
  c("  القبول: ١٬٢٠٠٬٠٠٠، وسطرٌ بسببه المقصوص ومَن، وكان ١٬٠٠٠٬٠٠٠ وصار ١٬٢٠٠٬٠٠٠",
    r1.amount === 1200000 && after1.amount === 1200000 && h1.length === 1 && h1[0].reason === "غلط بالكتابة" && h1[0].by === "u-1"
    && h1[0].before.amount === 1000000 && h1[0].after.amount === 1200000, JSON.stringify(after1));
  await repo.companyPay(co.id, 700000, "cash", null, null);
  const poolOf = async () => buildCompanyLedger({ purchases: [], payments: [], entries: await list(), charges: [] }).totals.poolDue;
  c("  تسديدٌ ٧٠٠٬٠٠٠ ⇒ الرصيدُ السابق ٥٠٠٬٠٠٠ بالدفتر", (await poolOf()) === 500000);
  const floorErr = await (async () => { try { await editCompanyEntry(op.id, 600000, "2025-06-01", "من الدفتر", "تسوية", seen(after1)); return null; } catch (e) { return e; } })();
  c("  النزولُ لـ٦٠٠٬٠٠٠ ⇒ has_payments وجملتُه تقول الحدّ ٧٠٠٬٠٠٠",
    floorErr?.message === "has_payments" && /700,000/.test(floorErr?.hint ?? ""), floorErr?.hint);
  await editCompanyEntry(op.id, 700000, "2025-05-01", "", "مطابقة مع كشف الشركة", seen(after1));
  const after2 = await one(op.id);
  c("  و٧٠٠٬٠٠٠ بتاريخٍ جديد وملاحظةٍ ممسوحة يمرّ: سطران، والرصيدُ السابق صفر",
    after2.amount === 700000 && after2.entry_date === "2025-05-01" && after2.note === null && E.readEdits(after2.edits).length === 2 && (await poolOf()) === 0);
  const adj = await repo.addCompanyAdjust(co.id, "debit", 50000, "2025-07-01", "خصم كمية");
  c("  التسوية: بلا ملاحظة ⇒ note_required، ورفعُها لـ٨٠٬٠٠٠ يمرّ بلا حدّ",
    (await errOf(() => editCompanyEntry(adj.id, 80000, "2025-07-01", "", "زيادة", seen(adj)))) === "note_required"
    && (await editCompanyEntry(adj.id, 80000, "2025-07-01", "خصم كمية وأجرة", "اتفاق جديد", seen(adj))).amount === 80000);
  const pay = (await list()).find((x) => x.kind === "payment");
  c("  التسديدُ ⇒ not_editable", (await errOf(() => editCompanyEntry(pay.id, 1, "2025-08-01", "", "غلط", seen(pay)))) === "not_editable");
  const adj2 = await one(adj.id);
  await repo.voidCompanyEntry(adj.id, "غلط");
  c("  والملغاةُ ⇒ already_void", (await errOf(() => editCompanyEntry(adj.id, 90000, "2025-07-01", "خصم كمية وأجرة", "غلط", seen(adj2)))) === "already_void");
  const db = JSON.parse(localStorage.getItem([...mem.keys()].find((k) => (mem.get(k) ?? "").includes(op.id))));
  const row = (db.companyEntries ?? []).find((x) => x.id === op.id);
  if (row) { row.edits = Array.from({ length: 50 }, (_, i) => ({ reason: `x${i}` })); }
  localStorage.setItem([...mem.keys()].find((k) => (mem.get(k) ?? "").includes(op.id)), JSON.stringify(db));
  c("  وبعد خمسين تعديلاً ⇒ too_many_edits",
    (await errOf(() => editCompanyEntry(op.id, 800000, "2025-05-01", "", "مرّة زيادة", seen(after2)))) === "too_many_edits");

  /* ج) الحكمُ والمرآةُ متّفقان على الشبكة */
  mem.clear();
  session("owner");
  const co2 = await repo.createCompany({ name: "شركة الشبكة" });
  let disagree = 0, n = 0;
  const amounts = [null, 0, 299.99, 300, 300.004, 500, 1000, 1000.004, 1500];
  const dates = ["2025-06-01", "2025-01-01", "2999-01-01"];
  const notes = ["", "دفتر", " دفتر "];
  const reasons = ["", "سبب"];
  for (const kind of ["opening", "adjustCredit", "adjustDebit"]) {
    for (const a of amounts) for (const d of dates) for (const nt of notes) for (const rs of reasons) {
      mem.clear(); session("owner");
      const cc = await repo.createCompany({ name: "شركة الشبكة" });
      const e0 = kind === "opening" ? await repo.addCompanyOpening(cc.id, 1000, "2025-06-01", "دفتر")
        : await repo.addCompanyAdjust(cc.id, kind === "adjustCredit" ? "credit" : "debit", 1000, "2025-06-01", "دفتر");
      if (kind !== "adjustDebit") await repo.companyPay(cc.id, 700, "cash", null, null);
      const ledger = buildCompanyLedger({ purchases: [], payments: [], entries: (await repo.listCompanyEntries()).filter((x) => x.company_id === cc.id), charges: [] });
      const plan = E.planEdit(e0, { amount: a, date: d, note: nt, reason: rs }, ledger.totals.poolDue, TODAY);
      const got = await errOf(() => editCompanyEntry(e0.id, a ?? NaN, d, nt, rs, E.seenOf(e0)));
      n++;
      if (plan.ok !== (got === "قُبل")) { disagree++; if (say && disagree <= 3) console.error(`      ${kind} ${a} ${d} «${nt}» «${rs}»: ${plan.why} مقابل ${got}`); }
    }
  }
  void co2;
  c(`الحكمُ والمرآةُ متّفقان على ${n} مسودّة (ما تقبله النافذةُ يقبله الخادم، وما ترفضه يرفضه)`, disagree === 0, `${disagree} خلاف`);
  return ok;
}

/* ── أ–ج ── */
const M = await load();
await behaviour(M, true);

/* ── د) الأسلاك ── */
const book = code("src/pages/CompanyBook.tsx");
check("الدفتر: زرُّ التعديل للمدير على ما يتعدّل والقاعدةُ تعرفه، وشارةُ «معدّلة» تفتح السجلّ لكلّ من يرى الدفتر",
  /const canEdit = [^\n]*isManager && !!e && editableEntry\(e\) && entryEditReady\(e\)/.test(book)
  && (book.match(/canEdit\(r\) && \(/g) ?? []).length === 2 && (book.match(/\{editedChip\(r\)\}/g) ?? []).length === 2
  && /data-book-edited[\s\S]{0,120}openHistory\(r\)/.test(book));
check("  النافذةُ ترسل ما رآه لحظةَ الفتح (seenOf بمعرّف حركته) وما قرّره planEdit، وتقول لماذا الزرُّ موقوف",
  /setOpened\(\{ target, seen: s \}\)/.test(book) && /opened\.target !== target\) return null/.test(book) && /if \(!target\) \{ setOpened\(null\); return; \}/.test(book)
  && /editCompanyEntry\(e\.id, plan\.after\.amount, plan\.after\.date, plan\.after\.note, reason\.trim\(\), seen\)/.test(book)
  && /disabled=\{!plan\.ok\}/.test(book) && /\{plan\.show && \(/.test(book));
check("  وما تغيّر من جهازٍ ثانٍ أو أُلغي يُغلق النافذةَ ويعيد التحميل",
  /code === "entry_changed" \|\| code === "already_void" \|\| code === "no_entry"\) onDone\(\)/.test(book));
check("  والطباعةُ تقول «معدّلة»", /editCount\(r\) \? t\("cbook\.editedPrint"/.test(book));
const api = code("src/lib/companyEntryEditApi.ts");
check("الباب: company_entry_edit بأسماء معاملاتها وp_seen، والتجريبيُّ من باب repoDemo، والقراءةُ فقط تمنع",
  /rpcJson<CompanyEntry>\("company_entry_edit", \{\s*p_entry: id, p_amount: amount, p_date: date, p_note: note, p_reason: reason, p_seen: seen,/.test(api)
  && /m\.loadDemoCompanyEntryEdit\(\)\)\)\.demoCompanyEntryEdit\(id, amount, date, note, reason, seen\)/.test(api) && /isConfigReadOnly\(\)/.test(api)
  && /export const loadDemoCompanyEntryEdit = \(\) => import\("\.\/demoCompanyEntryEdit"\)/.test(src("src/lib/repoDemo.ts")));
check("  والبابُ وحدتُه كسولة: لا يستورده repo.ts ولا الإقلاع",
  !/companyEntryEdit/.test(code("src/lib/repo.ts")) && !/companyEntryEdit/.test(code("src/main.tsx")) && !/companyEntryEdit/.test(code("src/App.tsx")));
const mig = src("supabase/migrations/0281_company_entry_edit.sql");
check("الهجرة: العمودُ بلا NOT NULL، والدالّةُ definer بمسار، للداخلين لا لـanon، وبالحزمة (WAVE وقسمها)",
  /add column if not exists edits jsonb;/.test(mig) && /security definer\s+set search_path = public/.test(mig)
  && /revoke all on function public\.company_entry_edit\(uuid, numeric, date, text, text, jsonb\) from public, anon;/.test(mig)
  && /grant execute on function public\.company_entry_edit\(uuid, numeric, date, text, text, jsonb\) to authenticated;/.test(mig)
  && /\$MIG\/0281_company_entry_edit\.sql"/.test(src("supabase/tests/run.sh")) && /# ── 0281: /.test(src("supabase/tests/run.sh")));
const ar = JSON.parse(src("src/i18n/ar.json")).cbook, en = JSON.parse(src("src/i18n/en.json")).cbook;
const used = [...new Set([...src("src/pages/CompanyBook.tsx").matchAll(/t\(`?"?cbook\.([A-Za-z0-9]+)/g)].map((m) => m[1]))];
check("النصوص: كلُّ مفتاحٍ تقرؤه الشاشة بالقاموسين (مع أزرار الأسباب)",
  [...used, "rTypo", "rStatement", "rAgreement", "rDate", "rForgot"].every((k) => ar[k] && en[k]), used.filter((k) => !ar[k] || !en[k]).join(","));

/* ── هـ) طفرات ── */
console.log("▸ طفرات");
const MUTS = [
  ["الحدُّ يتجاهل ما انسدّ", "src/lib/companyEntryEdit.ts", "return r2(Math.max(0, e.amount - Math.max(0, poolDue)));", "return 0;"],
  ["النافذةُ لا تفحص الحدّ", "src/lib/companyEntryEdit.ts", 'if (floor != null && amount > 0 && amount < was.amount && amount < floor - 0.005) has.add("floor");', ""],
  ["الأثرُ بلا عكس المدين", "src/lib/companyEntryEdit.ts", 'const balanceDelta = e.direction === "credit" ? diff : r2(-diff);', "const balanceDelta = diff;"],
  ["الملاحظةُ بلا قصّ", "src/lib/companyEntryEdit.ts", 'const noteOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);', 'const noteOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);'],
  ["النافذةُ تقول السببَ قبل «ما تغيّر»", "src/lib/companyEntryEdit.ts", 'const show = first(["amount", "date", "floor", "noteRequired", "noteLong", "noChange", "reasonLong", "reason"]);', 'const show = first(["reason", "amount", "date", "floor", "noteRequired", "noteLong", "noChange", "reasonLong"]);'],
  ["السجلُّ يُسقطه سطرٌ تالف", "src/lib/companyEntryEdit.ts", "if (!before || !after) continue;", "if (!before || !after) return [];"],
  ["المرآةُ بلا حدّ", "src/lib/demoCompanyEntryEdit.ts", "if (pool - (e.amount - amt) < -0.005) {", "if (false) {"],
  ["المرآةُ بلا ما رآه", "src/lib/demoCompanyEntryEdit.ts", "if (!seen || r2(Number(seen.amount)) !== r2(e.amount) || seen.date !== e.entry_date || trimOrNull(seen.note) !== trimOrNull(e.note)) {", "if (!seen) {"],
  ["المرآةُ لأيّ دور", "src/lib/demoCompanyEntryEdit.ts", 'if (demoBaseRole() !== "manager" && !demoPinLive())', "if (false)"],
  ["المرآةُ تمحو السجلّ", "src/lib/demoCompanyEntryEdit.ts", "edits: [...edits, {", "edits: [{"],
  ["المرآةُ تعدّل التسديد", "src/lib/demoCompanyEntryEdit.ts", 'if (e.kind !== "opening" && e.kind !== "adjust")', 'if (e.kind !== "opening" && e.kind !== "adjust" && e.kind !== "payment")'],
  ["المرآةُ بلا سقف", "src/lib/demoCompanyEntryEdit.ts", "if (edits.length >= 50)", "if (false)"],
];
for (const [name, file, from, to] of MUTS) {
  let caught;
  try { caught = !(await behaviour(await load([[file, from, to]]), false)); } catch { caught = true; }
  check(`طفرة «${name}» تُمسك`, caught);
}

console.log(`\n${fails ? "✗" : "✓"} تعديلُ دفتر الشركة: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
