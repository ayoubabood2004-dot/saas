/* ============================================================================
 * ديونُ الشركة القديمة الكثيرة (0291) بالواجهة — بسلوكه، ثمّ الأسلاك، ثمّ طفرات. الخادمُ (الدالّة بحرّاسها والمرجعُ والفهرسُ الفريد
 * والسباقُ والتدقيق) يفحصه قسمُ 0291 بالحزمة على بوستغريس.
 *   أ) الصِّرف: السطورُ تُقرأ كما يقرؤها الخادم (المبلغُ بكلمته، «14.169.000» و«٢٬٥٠٠٬٠٠٠»)، والفارغُ يُترك ولا يُعدّ، والسببُ
 *      الأوّل برقم سطره بين غير الفارغة، والمجموعُ بالسنت، والسقفُ خمسون؛ والمحاولةُ المعلَّقة تُقرأ بحذر.
 *   ب) المرآةُ التجريبية: ثلاثةُ ديونٍ بتواريخها، والإعادةُ ترجعها نفسَها بلا رابع، والمرجعُ نفسُه بطلبٍ آخر ref_mismatch، والطبيبُ
 *      والمرجعُ والسطورُ وسطرٌ مرفوض يقول رقمَه ولا يكتب شيئاً، والدولار، والتسديدُ يذهب لها أوّلاً، والإعادةُ بعد التعديل، والبابُ
 *      القديم كما هو.
 *   ج) الحكمُ والمرآةُ متّفقان على شبكةٍ (المبلغ × التاريخ × الملاحظة): ما تقبله النافذةُ يقبله الخادم، وما ترفضه يرفضه.
 *   د) الأسلاك. هـ) طفرات (طفرةٌ لا تجد نصَّها فشلٌ لا «تُمسك»).
 *
 *   node scripts/company-openings-test.mjs
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

class MutMissing extends Error {}
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
async function load(muts = []) {
  const hit = new Set();
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
        for (const m of mine) {
          if (!s.includes(m[1])) throw new MutMissing(`طفرةٌ ما لقت نصّها بـ${rel}: ${m[1]}`);
          s = s.replace(m[1], m[2]);
          hit.add(m);
        }
        return { contents: s, loader: "ts" };
      });
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/repo.ts";',
        'export * as O from "./src/lib/companyOpenings.ts";',
        'export { addCompanyOpenings, openingsReady } from "./src/lib/companyOpeningsApi.ts";',
        'export { editCompanyEntry } from "./src/lib/companyEntryEditApi.ts";',
        'export { buildCompanyLedger } from "./src/lib/companyLedger.ts";',
        'export { loadDemoCompanyOpenings } from "./src/lib/repoDemo.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "company-openings-test-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [plug], logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  /* الطفرةُ على وحدةٍ كسولة (المرآة) تُحمَّل بالحزمة نفسِها: لازم تكون انطبقت، وإلا فالفحصُ لم يرَها. */
  for (const m of muts) if (!hit.has(m)) throw new MutMissing(`طفرةٌ ما انطبقت (الوحدةُ ما انحزمت؟): ${m[0]}`);
  const dir = mkdtempSync(path.join(tmpdir(), "company-openings-test-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const session = (role) => {
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id: "u-1", clinic_id: "clinic-1", rawRole: role, staff: { clinicId: "clinic-1", role } } }));
};
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };
const hintOf = async (f) => { try { await f(); return ""; } catch (e) { return String(e.hint ?? ""); } };
const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const L = (k, date, amount, note = "") => ({ k, date, amount, note });

async function behaviour(M, say) {
  let ok = true;
  const c = (name, cond, detail) => { if (say) check(name, cond, detail); if (!cond) ok = false; };
  const { O, repo, addCompanyOpenings, openingsReady, editCompanyEntry, buildCompanyLedger } = M;

  /* أ) الصِّرف */
  const p1 = O.planOpenings([L("a", "2025-01-05", "14.169.000", " فاتورة ١١ "), L("b", "2025-02-10", "  ", " "), L("c", "2025-03-01", "٢٬٥٠٠٬٠٠٠"),
    L("d", "2025-03-02", "0.10"), L("e", "2025-03-02", "0.20")], TODAY);
  c("السطور: «14.169.000» أربعةَ عشرَ مليوناً، و«٢٬٥٠٠٬٠٠٠» مليونين ونصف، والملاحظةُ مقصوصة، والفارغُ كلُّه يُترك ولا يُعدّ",
    p1.ok && p1.count === 4 && p1.rows.length === 4 && p1.rows[0].amount === "14169000.00" && p1.rows[0].note === "فاتورة ١١"
    && p1.rows[1].amount === "2500000.00" && p1.rows[1].note === null && !p1.bad.has("b") && !p1.cents.has("b"), JSON.stringify(p1.rows));
  c("  والمجموعُ بالسنت بلا عائم (٠٫١٠ + ٠٫٢٠ = ٠٫٣٠ بالضبط)", p1.totalCents === 1416900000n + 250000000n + 30n, String(p1.totalCents));
  const bad = O.planOpenings([L("x0", "2025-01-01", "", ""), L("x1", "2025-01-01", "100"), L("x2", "2025-01-01", "مليون"), L("x3", "2025-01-01", "", "بلا مبلغ"),
    L("x4", "2025-01-01", "0"), L("x5", "2025-01-01", "-5"), L("x6", "2999-01-01", "5"), L("x7", "1999-12-31", "5"), L("x8", "", "5"), L("x9", "2025-1-5", "5"),
    L("y0", "2025-01-01", "5", "x".repeat(501))], TODAY);
  c("الأسباب: مبلغٌ لا يُقرأ (cents null)، وملاحظةٌ بلا مبلغ، وصفر، وسالب ⇒ amount؛ وتاريخٌ بالمستقبل وقبل ٢٠٠٠ وفارغٌ وبشكلٍ آخر ⇒ date؛ وفوق ٥٠٠ ⇒ noteLong",
    !bad.ok && bad.cents.get("x2") === null && !bad.cents.has("x3")
    && ["x2", "x3", "x4", "x5"].every((k) => bad.bad.get(k) === "amount") && ["x6", "x7", "x8", "x9"].every((k) => bad.bad.get(k) === "date")
    && bad.bad.get("y0") === "noteLong" && !bad.bad.has("x0") && !bad.bad.has("x1") && bad.rows.length === 1,
    JSON.stringify([...bad.bad]));
  c("  وأوّلُ سببٍ برقم سطره بين غير الفارغة (الفارغُ الأوّل لا يُعدّ ⇒ السطر ٢)",
    bad.why?.kind === "line" && bad.why.no === 2 && bad.why.what === "amount", JSON.stringify(bad.why));
  const emoji = "🐾".repeat(500);
  c("  والطولُ بالحروف كالخادم لا بوحدات UTF-16: ٥٠٠ رمزٍ تمرّ، و٥٠١ لا",
    O.planOpenings([L("e1", "2025-01-01", "5", emoji)], TODAY).ok && O.planOpenings([L("e1", "2025-01-01", "5", emoji + "🐾")], TODAY).why?.what === "noteLong");
  const many = (n) => Array.from({ length: n }, (_, i) => L(`m${i}`, "2025-01-01", "1"));
  c("السقف: خمسون تمرّ وواحدٌ وخمسون tooMany، والفارغُ كلُّه empty",
    O.planOpenings(many(50), TODAY).ok && O.planOpenings(many(51), TODAY).why?.kind === "tooMany"
    && O.planOpenings([L("z", TODAY, "", "")], TODAY).why?.kind === "empty" && O.OPENINGS_MAX === 50);
  const okP = JSON.stringify({ ref: "cop_abc123", cur: "IQD", lines: [L("a", "2025-01-05", "100"), { k: 1 }, null] });
  c("المحاولةُ المعلَّقة تُقرأ بحذر: السليمةُ بسطورها السليمة، والمرجعُ بنقطتين أو عملةٌ أخرى أو نصٌّ تالف أو بلا سطور ⇒ لا شيء",
    O.readOpeningsPending(okP)?.lines.length === 1 && O.readOpeningsPending(okP.replace("cop_abc123", "a:b:c")) === null
    && O.readOpeningsPending(okP.replace('"IQD"', '"EUR"')) === null && O.readOpeningsPending("{x") === null && O.readOpeningsPending(null) === null
    && O.readOpeningsPending(JSON.stringify({ ref: "cop_abc123", cur: "USD", lines: [{ k: 1 }] })) === null);

  /* ب) المرآةُ التجريبية */
  mem.clear();
  session("owner");
  c("القاعدةُ تعرف الباب بالتجريبيّ دائماً (openingsReady)", (await openingsReady()) === true);
  const co = await repo.createCompany({ name: "شركة الديون القديمة" });
  const co2 = await repo.createCompany({ name: "شركة ثانية" });
  const list = async (id = co.id) => (await repo.listCompanyEntries()).filter((x) => x.company_id === id);
  const three = O.planOpenings([L("a", "2025-01-05", "2,000,000", " فاتورة ورقية ١١ "), L("b", "2025-02-10", "3000000"), L("c", "2025-03-01", "4500000.555")], TODAY).rows;
  const r1 = await addCompanyOpenings(co.id, "IQD", three, "refT001");
  const e1 = await list();
  c("ثلاثةُ ديونٍ بثلاثة تواريخ بطلبٍ واحد: «رصيد سابق» حيّة بمبالغها (الكسرُ لمنزلتين) ومرجعٌ لكلّ سطر",
    r1.replayed === false && r1.entries.length === 3 && e1.length === 3
    && e1.map((x) => `${x.entry_date}=${x.amount}=${x.note ?? "-"}=${x.client_ref}=${x.kind}/${x.direction}=${x.currency}`).sort().join(",")
      === "2025-01-05=2000000=فاتورة ورقية ١١=refT001:1=opening/credit=IQD,2025-02-10=3000000=-=refT001:2=opening/credit=IQD,2025-03-01=4500000.56=-=refT001:3=opening/credit=IQD",
    JSON.stringify(e1));
  const led = buildCompanyLedger({ purchases: [], payments: [], entries: e1, charges: [] });
  c("  والدفترُ يعرضها ثلاثةَ سطورٍ بتواريخها، والرصيدُ السابق مجموعُها",
    led.rows.map((r) => `${r.kind}@${r.day}`).join(",") === "opening@2025-01-05,opening@2025-02-10,opening@2025-03-01"
    && led.totals.poolDue === 9500000.56 && led.totals.balance === 9500000.56 && led.hasOpening, JSON.stringify(led.totals));
  const r2 = await addCompanyOpenings(co.id, "IQD", three, "refT001");
  c("الإعادةُ بالمرجع نفسِه ترجع الثلاثةَ نفسَها بمعرّفاتها (replayed) بلا رابع",
    r2.replayed === true && r2.entries.map((x) => x.id).join(",") === r1.entries.map((x) => x.id).join(",") && (await list()).length === 3);
  const mis = await Promise.all([
    errOf(() => addCompanyOpenings(co.id, "IQD", [three[0], { ...three[1], amount: "3000001.00" }, three[2]], "refT001")),
    errOf(() => addCompanyOpenings(co.id, "IQD", three.slice(0, 2), "refT001")),
    errOf(() => addCompanyOpenings(co.id, "IQD", [{ ...three[0], date: "2025-01-06" }, three[1], three[2]], "refT001")),
    errOf(() => addCompanyOpenings(co2.id, "IQD", three, "refT001")),
    errOf(() => addCompanyOpenings(co.id, "USD", three, "refT001")),
  ]);
  c("  والمرجعُ نفسُه بطلبٍ آخر ⇒ ref_mismatch: مبلغ، عدد، تاريخ، شركةٌ أخرى، عملةٌ أخرى", mis.join("|") === "ref_mismatch|ref_mismatch|ref_mismatch|ref_mismatch|ref_mismatch", mis.join("|"));
  session("doctor");
  c("الطبيبُ لا يضيف (forbidden)", (await errOf(() => addCompanyOpenings(co2.id, "IQD", three, "refT002"))) === "forbidden");
  session("owner");
  const rej = await Promise.all([
    errOf(() => addCompanyOpenings(co2.id, "IQD", three, "")),
    errOf(() => addCompanyOpenings(co2.id, "IQD", three, "a:b:c")),
    errOf(() => addCompanyOpenings(co2.id, "IQD", [], "refT003")),
    errOf(() => addCompanyOpenings(co2.id, "IQD", many(51).map(() => ({ amount: "1.00", date: "2025-01-01", note: null })), "refT004")),
    errOf(() => addCompanyOpenings(co2.id, "EUR", three, "refT005")),
    errOf(() => addCompanyOpenings("nope", "IQD", three, "refT006")),
  ]);
  c("الرفض: مرجعٌ فارغ أو بنقطتين، وسطورٌ فارغة أو ٥١، وعملةٌ ثالثة، وشركةٌ غائبة", rej.join("|") === "bad_ref|bad_ref|bad_rows|bad_rows|bad_currency|no_company", rej.join("|"));
  const lineBad = [{ amount: "100.00", date: "2025-01-01", note: null }, { amount: "0.00", date: "2025-01-02", note: null }];
  c("سطرٌ مرفوض يقول رقمَه (السطر 2) ولا يكتب شيئاً — ولا السطرَ الأوّل",
    (await errOf(() => addCompanyOpenings(co2.id, "IQD", lineBad, "refT007"))) === "bad_amount"
    && /السطر 2/.test(await hintOf(() => addCompanyOpenings(co2.id, "IQD", lineBad, "refT007")))
    && (await errOf(() => addCompanyOpenings(co2.id, "IQD", [{ amount: "1.00", date: "2999-01-01", note: null }], "refT008"))) === "bad_date"
    && (await list(co2.id)).length === 0);
  c("سطرٌ بلا تاريخ ⇒ bad_date «اكتب تاريخ الدين» (كلُّ دينٍ بتاريخه — لا «اليوم» صامت)",
    (await errOf(() => addCompanyOpenings(co2.id, "IQD", [{ amount: "1.00", date: "", note: null }], "refT010"))) === "bad_date"
    && (await errOf(() => addCompanyOpenings(co2.id, "IQD", [{ amount: "1.00", note: null }], "refT011"))) === "bad_date");
  c("الدولار: العيادةُ بلا دولار ⇒ usd_disabled", (await errOf(() => addCompanyOpenings(co2.id, "USD", [{ amount: "100.00", date: "2025-04-01", note: null }], "refT009"))) === "usd_disabled");
  const pay = await repo.companyPay(co.id, 6000000, "cash", null, null);
  c("التسديدُ على الحساب يذهب للديون القديمة أوّلاً (٦٬٠٠٠٬٠٠٠ كلُّها)", pay.to_opening === 6000000 && pay.to_invoices === 0, JSON.stringify(pay));
  const third = (await list()).find((x) => x.client_ref === "refT001:3");
  await editCompanyEntry(third.id, 3000000, third.entry_date, null, "مطابقة الكشف", { amount: third.amount, date: third.entry_date, note: null });
  const r3 = await addCompanyOpenings(co.id, "IQD", three, "refT001");
  c("  وإعادةُ الطلب بعد تعديله ما زالت «الطلبَ نفسَه» (الأصلُ من سجلّ التعديل) — ترجع الصفوفَ كما هي الآن",
    r3.replayed === true && r3.entries.map((x) => x.amount).join(",") === "2000000,3000000,3000000", r3.entries.map((x) => x.amount).join(","));
  c("البابُ القديم كما هو: دينٌ ثانٍ بلا مرجع ⇒ opening_exists", (await errOf(() => repo.addCompanyOpening(co.id, 5, null, null))) === "opening_exists");

  /* ج) الحكمُ والمرآةُ متّفقان على الشبكة */
  mem.clear(); session("owner");
  const g = await repo.createCompany({ name: "شركة الشبكة" });
  const amounts = ["", "0", "-5", "abc", "14.169.000", "2,500,000", "٢٥٠٠٠٠٠", "0.004", "0.005", "100.555", "1e3", "12,5"];
  const dates = [TODAY, "2025-01-05", "2999-01-01", "1999-12-31", "2000-01-01", ""];
  const notes = ["", "شنو", "x".repeat(501)];
  let n = 0, disagree = 0, seq = 0;
  for (const a of amounts) for (const d of dates) for (const nt of notes) {
    const plan = O.planOpenings([L("g", d, a, nt)], TODAY);
    if (plan.why?.kind === "empty") continue;
    const row = plan.ok ? plan.rows[0] : { amount: a, date: d, note: nt || null };
    const got = await errOf(() => addCompanyOpenings(g.id, "IQD", [row], `grid${++seq}`));
    n++;
    if (plan.ok !== (got === "قُبل")) { disagree++; if (say && disagree <= 3) console.error(`      «${a}» ${d || "∅"} ${nt.length}: ${JSON.stringify(plan.why)} مقابل ${got}`); }
  }
  c(`الحكمُ والمرآةُ متّفقان على ${n} سطراً (ما تقبله النافذةُ يقبله الخادم، وما ترفضه يرفضه)`, disagree === 0 && n > 150, `${disagree} خلاف`);
  return ok;
}

/* ── أ–ج ── */
const M = await load();
await behaviour(M, true);

/* ── د) الأسلاك ── */
const book = code("src/pages/CompanyBook.tsx");
check("الدفتر: الزرُّ «دين قديم» للمدير بأيّ وقت حين تعرف القاعدةُ الباب، وقبلها ما دام ما سُجّل",
  /isManager && \(opReady === true \|\| !L\.hasOpening\)/.test(book) && /openingsReady\(\)\.then\(/.test(book)
  && /<OldDebtsModal [\s\S]{0,240}?multi=\{opReady === true\}/.test(book));
check("  النافذة: السطرُ الفارغ يُشال قبل الإرسال، وطلبٌ واحد بمرجع النافذة، والمجهولةُ تُقفل على الإعادة بالمرجع نفسِه",
  /const send = pinned \? lines : lines\.filter\(\(l\) => !isBlankLine\(l\)\);/.test(book)
  && /addCompanyOpenings\(companyId, cur, sp\.rows, ref\.current\)/.test(book)
  && /if \(shouldReleaseRef\(fresh, e\)\) \{ ref\.current = uid\("cop"\); setPinned\(false\); writePending\(null\); \}/.test(book)
  && /else \{ setPinned\(true\); writePending\(\{ ref: ref\.current, cur, lines: send \}\); \}/.test(book));
check("  والمحاولةُ المعلَّقة بالجلسة بالعيادة والشركة والعملة، وتُقرأ عند الفتح وحده",
  /const pendKey = `vp_cop_pending_\$\{getActiveClinicId\(\)\}_\$\{companyId\}_\$\{cur\}`;/.test(book)
  && /readOpeningsPending\(sessionStorage\.getItem\(pendKey\)\)/.test(book) && /\}, \[open\]\);/.test(book));
check("  وقبل الهجرة: سطرٌ واحد بالباب القديم (purchaseFx.opening / repo.addCompanyOpening)",
  /if \(!many\) \{[\s\S]{0,400}purchaseFx\.opening\(companyId, cur, amt, one\.date, one\.note\)[\s\S]{0,120}repo\.addCompanyOpening\(companyId, amt, one\.date, one\.note\)/.test(book));
check("  والمبلغُ يُقال بكلمة (ما قُرئ وما لم يُقرأ والكسرُ بالدينار)، والزرُّ لا يقف بلا جملة",
  /data-book-odread/.test(book) && /data-book-odbad/.test(book) && /data-book-odfrac/.test(book)
  && /if \(!pinned && !sp\.ok\) \{ playWarning\(\); setErr\(whyText\(sp\.why\)\); return; \}/.test(book) && !/disabled=\{!plan\.ok\}[^\n]*data-book-openingsave/.test(book));
const api = code("src/lib/companyOpeningsApi.ts");
check("الباب: company_openings_add بأسماء معاملاتها، والتجريبيُّ من باب repoDemo، والقراءةُ فقط تمنع، والغيابُ وحده «لا»",
  /rpcJson<OpeningsResult>\("company_openings_add", \{ p_company: companyId, p_currency: cur, p_rows: rows, p_ref: ref \}\)/.test(api)
  && /m\.loadDemoCompanyOpenings\(\)\)\)\.demoCompanyOpenings\(companyId, cur, rows, ref\)/.test(api) && /isConfigReadOnly\(\)/.test(api)
  && /if \(isOpeningsAbsent\(e\)\) return false;\s*throw e;/.test(api)
  && /export const loadDemoCompanyOpenings = \(\) => import\("\.\/demoCompanyOpenings"\)/.test(src("src/lib/repoDemo.ts")));
check("  والبابُ ومرآتُه كسولان: لا يستوردهما repo.ts ولا الإقلاع",
  !/companyOpenings/.test(code("src/lib/repo.ts")) && !/companyOpenings/.test(code("src/main.tsx")) && !/companyOpenings/.test(code("src/App.tsx")));
const sl = code("src/components/inventory/SupplierLedger.tsx");
check("تبويبُ الديون: كلُّ شركةٍ مضافة لها بطاقةٌ بدفترها ولو بلا حركة، إلا ما له بطاقةٌ باسمه",
  /for \(const co of companies\) \{\s*if \(m\.has\(co\.id\) \|\| m\.has\(`n:\$\{co\.name\.trim\(\)\.toLowerCase\(\)\}`\)\) continue;/.test(sl)
  && /idle: true,/.test(sl) && (sl.match(/idle: false,/g) ?? []).length === 3);
check("  و«عليها دين» بالعملتين، و«مسدَّدة» لما كان عليه شيء — لا لشركةٍ بلا حركة",
  /const owes = g\.owed > 0 \|\| g\.owedUsd > 0;/.test(sl) && /filter === "settled" \? !owes && !g\.idle/.test(sl));
const mig = src("supabase/migrations/0291_company_old_debts.sql");
const run = src("supabase/tests/run.sh");
check("الهجرة: الكاتبةُ definer بمسار، وتسأل الحارسَ قبل الإعادة، للداخلين لا لـanon، وبالحزمة (WAVE وقسمها)",
  /security definer\s+set search_path = public/.test(mig) && mig.indexOf("company_entry_guard(p_company, null, true)") < mig.indexOf("v_old.n > 0")
  && /revoke all on function public\.company_openings_add\(uuid, text, jsonb, text\) from public, anon;/.test(mig)
  && /grant execute on function public\.company_openings_add\(uuid, text, jsonb, text\) to authenticated;/.test(mig)
  && /create unique index if not exists company_entries_client_ref_uniq/.test(mig)
  && /\$MIG\/0291_company_old_debts\.sql"/.test(run) && /# ── 0291: /.test(run));
const ar = JSON.parse(src("src/i18n/ar.json")).cbook, en = JSON.parse(src("src/i18n/en.json")).cbook;
const pick = (o, k) => k.split(".").reduce((x, p) => (x && typeof x === "object" ? x[p] : undefined), o);
const usedOd = [...new Set([...src("src/pages/CompanyBook.tsx").matchAll(/t\("cbook\.(od\.[A-Za-z.]+)"/g)].map((m) => m[1]))];
const whyKeys = ["od.why.amount", "od.why.date", "od.why.noteLong"];
check("النصوص: كلُّ مفتاح «ديون قديمة» تقرؤه الشاشة بالقاموسين (ومنها أسبابُ السطر)",
  usedOd.length >= 15 && [...usedOd, ...whyKeys].every((k) => typeof pick(ar, k) === "string" && typeof pick(en, k) === "string"),
  [...usedOd, ...whyKeys].filter((k) => typeof pick(ar, k) !== "string" || typeof pick(en, k) !== "string").join(","));

/* ── هـ) طفرات ── */
console.log("▸ طفرات");
const MUTS = [
  ["السطرُ الفارغ يُعدّ", "src/lib/companyOpenings.ts", "    if (isBlankLine(l)) continue;\n", ""],
  ["النافذةُ بلا فحص التاريخ", "src/lib/companyOpenings.ts", 'else if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(l.date) || l.date > today || l.date < "2000-01-01") w = "date";', ""],
  ["الطولُ بوحدات UTF-16", "src/lib/companyOpenings.ts", "else if ([...note].length > 500) w = \"noteLong\";", "else if (note.length > 500) w = \"noteLong\";"],
  ["المجموعُ لا يجمع", "src/lib/companyOpenings.ts", "    total += c!;", "    total += 0n;"],
  ["المعلَّقةُ بأيّ مرجع", "src/lib/companyOpenings.ts", "!/^[A-Za-z0-9_-]{3,80}$/.test(v.ref) || ", ""],
  ["المرآةُ تعيد بلا مقارنة المحتوى", "src/lib/demoCompanyOpenings.ts", "&& want != null && o.cents === want && o.date === day", ""],
  ["المرآةُ تعيد بلا مقارنة العملة", "src/lib/demoCompanyOpenings.ts", ' && (e.currency ?? "IQD") === c', ""],
  ["المرآةُ لأيّ دور", "src/lib/demoCompanyOpenings.ts", 'if (demoBaseRole() !== "manager" && !demoPinLive())', "if (false)"],
  ["المرآةُ بلا مرجعٍ على الصفّ", "src/lib/demoCompanyOpenings.ts", ", client_ref: `${r}:${i}` });", " });"],
  ["المرآةُ بلا فحص التاريخ", "src/lib/demoCompanyOpenings.ts", 'if (date > today || date < "2000-01-01")', "if (false)"],
  ["المرآةُ تكتب قبل أن تفحص الكلّ", "src/lib/demoCompanyOpenings.ts", "    made.push({ ...demoEntry(companyId, \"opening\", \"credit\", Number(decText(amt, 2)), date, null, note), currency: c, client_ref: `${r}:${i}` });",
    "    made.push({ ...demoEntry(companyId, \"opening\", \"credit\", Number(decText(amt, 2)), date, null, note), currency: c, client_ref: `${r}:${i}` }); (db.companyEntries ??= []).push(made[made.length - 1]); saveDB(db); made.pop();"],
  ["المرآةُ تقبل الدولار بلا تفعيل", "src/lib/demoCompanyOpenings.ts", 'if (c === "USD" && !(await demoUsdState()).enabled)', "if (false)"],
];
for (const [name, file, from, to] of MUTS) {
  let caught;
  try { caught = !(await behaviour(await load([[file, from, to]]), false)); }
  catch (e) { caught = e instanceof MutMissing ? null : true; if (caught === null) console.error(`      ${e.message}`); }
  check(`طفرة «${name}» تُمسك`, caught === true);
}

console.log(`\n${fails ? "✗" : "✓"} ديونُ الشركة القديمة: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
