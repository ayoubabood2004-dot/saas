/* ============================================================================
 * صفحةُ مراجعة ما لم يصل الخادم (قرارُ المالك ١٣/١٠) — مرسومةً بـReact الحقيقيّ والقاموسين.
 *
 * من ٢٦/٩ إلى ١٣/١٠ كان ختمُ الطابور «بلا أحد» بالنسخة السحابيّة، فكلُّ ما فشل شبكياً ذهب
 * للرفّ ولم يُحيِه «استأنف». ورفعُه الأعمى قد يكرّر ما أدخلته العيادةُ يدوياً — فيُعرض وحدةً
 * وحدة: نوعُه، ووقتُه، وما بحمولته (اسم، مبلغ، عدد)، و«ارفعها» / «احذفها» يسأل بالاسم.
 *
 *   node scripts/outbox-review-test.mjs
 * ==========================================================================*/
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
const AR = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const EN = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));
const root = process.cwd();

const stubs = {
  name: "ssr-stubs",
  setup(b) {
    const map = {
      "react-i18next": `
        const get = (o, k) => k.split(".").reduce((a, s) => (a && typeof a === "object" ? a[s] : undefined), o);
        const fill = (s, v) => String(s).replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/g, (_, k) => (v && v[k] != null ? String(v[k]) : ""));
        export const t = (key, a, b) => {
          const opts = typeof a === "object" && a ? a : (b || {});
          const def = typeof a === "string" ? a : (opts.defaultValue ?? key);
          const hit = get(globalThis.__dict || {}, key);
          return fill(typeof hit === "string" ? hit : def, opts);
        };
        export const useTranslation = () => ({ t, i18n: { language: globalThis.__lang || "ar" } });
      `,
      "@/components/ui": `
        import { createElement as h } from "react";
        export const Button = ({ children, variant, size, ...p }) => h("button", p, children);
      `,
      "@/lib/sounds": "export const playTap = () => {};",
      "@/lib/outbox": `
        export const outboxReviewList = () => globalThis.__list || [];
        export const outboxWaitingOthers = () => globalThis.__others || [];
        export const flushOutbox = async () => ({ sent: 0, left: 0, dead: 0 });
      `,
      "@/lib/outboxShelf": `
        export const outboxRejectedList = () => globalThis.__rejected || [];
        export const outboxReviveOne = () => ({ ok: true });
        export const outboxDiscard = () => ({ ok: true });
        const me = () => globalThis.__me || "u";
        export const ownerState = (op) => !op.who || (op.who.clinic === "?" && op.who.user === me()) ? "unknown" : op.who.user === me() ? "mine" : "other";
        export const traceable = () => true;
        export const traceSpan = (op, now) => ({ from: op.queued_at, to: now });
      `,
      "@/lib/managerOverride": "export const useOverride = () => ({ active: false, until: null, deviceLocked: !!globalThis.__restricted, restricted: !!globalThis.__restricted, stockLocked: false });",
      "@/lib/repo": "export const repo = { listReturnRows: async () => [], listPoultryDaily: async () => [] };",
      "@/hooks/usePermissions": "export const usePermissions = () => ({ role: globalThis.__role || 'manager', baseRole: globalThis.__role || 'manager', can: () => true });",
    };
    const keys = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
    b.onResolve({ filter: new RegExp(`^(${keys})$`) }, (a) => ({ path: a.path, namespace: "ssr" }));
    b.onLoad({ filter: /.*/, namespace: "ssr" }, (a) => ({ contents: map[a.path], loader: "js", resolveDir: root }));
  },
};
let M;
try {
  const built = await esbuild.build({
    stdin: { contents: `
      export { renderToStaticMarkup } from "react-dom/server.browser";
      export { createElement } from "react";
      export { MemoryRouter } from "react-router-dom";
      export { OutboxReview, opSummary, sharesServerRow } from "./src/pages/OutboxReview.tsx";
      export { matchReturnRows, returnLineMatches, expectedReturnRows, traceBounds } from "./src/lib/returnTrace.ts";
      export { SYSTEM_EXPENSE_TEXT } from "./src/lib/expenseCategoryRules.ts";
    `, resolveDir: root, loader: "tsx", sourcefile: "obx.tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    plugins: [stubs], define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" }, tsconfig: "tsconfig.json",
  });
  const dir = mkdtempSync(join(tmpdir(), "obx-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  M = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
} catch (e) {
  console.error(`✗ outbox-review-test: ما انبنت الصفحة — ${String(e?.message ?? e).split("\n").slice(0, 3).join(" ")}`);
  process.exit(1);
}
const h = M.createElement;
const html = (lang) => {
  globalThis.__dict = lang === "en" ? EN : AR; globalThis.__lang = lang;
  return M.renderToStaticMarkup(h(M.MemoryRouter, null, h(M.OutboxReview)));
};
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const RET = { kind: "rpc", id: "retail_return:r1", fn: "retail_return", queued_at: "2026-10-01T09:30:00Z", tries: 0,
  args: { p_items: [{ qty: -2, unit_price: 5000, name: "درونتال" }, { qty: -1, unit_price: 2500 }], p_meta: { client_ref: "r1" } } };
const EXP = { kind: "insert", id: "e1", table: "expenses", queued_at: "2026-10-02T10:00:00Z", tries: 0, row: { id: "e1", amount: 25000, description: "مولدة" } };
const PRD = { kind: "insert", id: "p1", table: "products", queued_at: "2026-10-03T10:00:00Z", tries: 0, row: { id: "p1", name: "رويال كانين ٢ كغ" } };
const DAY = { kind: "insert", id: "poultry_daily:c:2026-10-04", table: "poultry_daily", queued_at: "2026-10-04T10:00:00Z", tries: 0, row: { cycle_id: "c", on_date: "2026-10-04", dead: 3 } };
const USE = { kind: "rpc", id: "poultry_consume:u1", fn: "poultry_consume", queued_at: "2026-10-03T08:00:00Z", tries: 0, args: { p_name: "علف بادئ", p_qty: 2.5, p_on_date: "2026-10-03", p_meta: { client_ref: "u1" } } };
const REJ = { kind: "insert", id: "co1", table: "companies", queued_at: "2026-10-05T10:00:00Z", tries: 10, last_error: "company_twin_name", who: { user: "u", clinic: "c" }, row: { id: "co1", name: "تاج الخيل" } };

console.log("▸ opSummary — ما بالحمولة وحده");
{
  const r = M.opSummary(RET);
  check("مرتجع: المجموعُ |كمية×سعر| والعدد", r.kind === "retail_return" && r.amount === 12500 && r.lines === 2, JSON.stringify(r));
  check("  والاسمُ من المواد إن لم يكن زبون", r.name === "درونتال", String(r.name));
  check("  وسطورُه كما يكتبها الخادم (وما بلا اسمٍ «صنف» — اسمُ الخادم له)", JSON.stringify(r.returnLines) === JSON.stringify([{ desc: "راجع: درونتال × 2", amount: 10000 }, { desc: "راجع: صنف", amount: 2500 }]), JSON.stringify(r.returnLines));
  const e = M.opSummary(EXP);
  check("سحب: المبلغُ والوصف", e.kind === "expenses" && e.amount === 25000 && e.name === "مولدة", JSON.stringify(e));
  check("منتج: الاسم بلا مبلغ", M.opSummary(PRD).name === "رويال كانين ٢ كغ" && M.opSummary(PRD).amount === null);
  check("إدخالٌ يومي: التاريخ يوماً لا اسماً، والنافقُ ظاهر", M.opSummary(DAY).day === "2026-10-04" && M.opSummary(DAY).name === null && M.opSummary(DAY).dead === 3);
  const u = M.opSummary(USE);
  check("صرفُ دواجن: الاسمُ واليومُ والكميةُ بكسرها — لا «عدد مواد»", u.name === "علف بادئ" && u.qty === 2.5 && u.day === "2026-10-03" && u.lines === null, JSON.stringify(u));
  check("مدخلٌ ناقص (بلا args/row) لا يرمي", (() => { try { M.opSummary({ kind: "rpc", id: "x", fn: "retail_return", queued_at: "q", tries: 0 }); M.opSummary({ kind: "insert", id: "y", table: "products", queued_at: "q", tries: 0 }); return true; } catch { return false; } })());
}

console.log("▸ أثرُ المرتجع بالخادم (returnTrace) — النصُّ كاملاً كما يكتبه retail_return (0136)");
{
  const at = "2026-10-01T09:30:00Z";
  const R = M.SYSTEM_EXPENSE_TEXT.returns;
  const row = (min, desc, amount, cat = R, id = desc + min) => ({ id, category: cat, spent_at: new Date(Date.parse(at) + min * 60000).toISOString(), description: desc, amount });
  const pt = { from: at, to: at };
  // نصُّ الخادم: 'راجع: ' || الاسم || ' × ' كميةٌ (≠١، بلا أصفار) || ' — ' زبون || ' (' ملاحظة ')'
  const E = M.expectedReturnRows({ p_items: [{ qty: -2, unit_price: 5000, name: " درونتال " }, { qty: 1.5, unit_price: 1000.005, name: "طوق" }, { qty: 0.0004, unit_price: 9, name: "ذرّة" }, { qty: -1, unit_price: 0, name: "مجاني" }], p_meta: { customer_name: " حسن ", note: "كسر", client_ref: "x" } });
  check("السطور: الاسمُ بلا مسافات، والكميةُ بلا أصفار، والزبونُ والملاحظة", JSON.stringify(E.map((l) => l.desc)) === JSON.stringify(["راجع: درونتال × 2 — حسن (كسر)", "راجع: طوق × 1.5 — حسن (كسر)"]), JSON.stringify(E));
  check("  والمبلغُ round(round3(كمية)×round2(سعر)، ٢) — والكميةُ دون ٠٫٠٠٠٥ والمبلغُ الصفرُ لا سطرَ لهما", JSON.stringify(E.map((l) => l.amount)) === JSON.stringify([10000, 1500.02]), JSON.stringify(E));
  const L = M.expectedReturnRows({ p_items: [{ qty: -2, unit_price: 5000, name: "درونتال" }, { qty: 1, unit_price: 2500, name: "طوق" }], p_meta: { customer_name: "أبو علي" } });
  const rows = [row(3, "راجع: درونتال × 2 — أبو علي", 10000), row(3, "راجع: طوق — أبو علي", 2500)];
  check("كلُّ سطرٍ بنصّه ومبلغه ⇒ أثر", M.matchReturnRows(rows, pt, L).length === 2);
  check("  ونصفُ تطابقٍ (سطرٌ ناقص) ⇒ لا أثر", M.matchReturnRows([rows[0]], pt, L).length === 0);
  check("  ومبلغٌ مختلف ⇒ لا أثر", M.matchReturnRows([row(3, "راجع: درونتال × 2 — أبو علي", 9000), rows[1]], pt, L).length === 0);
  /* التدقيقُ العدائيّ ١٣/١٠: كانت بادئةُ الاسم تكفي، فمرتجعُ زبونٍ آخر لنفس المادّة والمبلغ قيل عنه
   * «وصلت — الأسلم تحذفها»، والحذفُ يُسقط ردَّ مالٍ ومخزونٍ حقيقيّ. */
  check("  وزبونٌ آخر لنفس المادّة والمبلغ ⇒ ليس هو", M.matchReturnRows([row(3, "راجع: درونتال × 2 — حسن", 10000), rows[1]], pt, L).length === 0);
  check("  وكميةٌ أخرى بنفس المبلغ ⇒ ليس هو", !M.returnLineMatches(row(3, "راجع: درونتال × 4 — أبو علي", 10000), pt, L[0]));
  check("  واسمٌ يبدأ به (درونتال بلس) ⇒ ليس هو", !M.returnLineMatches(row(3, "راجع: درونتال بلس × 2 — أبو علي", 10000), pt, L[0]));
  check("  وساعةُ الجهاز منحرفةٌ ٣ ساعات ⇒ ما زال أثراً", M.matchReturnRows([row(180, rows[0].description, 10000), row(180, rows[1].description, 2500)], pt, L).length === 2);
  check("  وبعد يومين ⇒ ليس أثراً", M.matchReturnRows([row(2880, rows[0].description, 10000), row(2880, rows[1].description, 2500)], pt, L).length === 0);
  const late = { from: at, to: new Date(Date.parse(at) + 2 * 86400000).toISOString() };
  check("  لكن محاولةُ رفعٍ بعد يومين ⇒ المدّةُ تمتدّ لها فيُرى أثرُها", M.matchReturnRows([row(2880, rows[0].description, 10000), row(2880, rows[1].description, 2500)], late, L).length === 2);
  check("  ومدّةٌ تالفة ⇒ لا حدودَ سؤال (يُقال «تعذّر» لا «ما لكينا»)", M.traceBounds({ from: "x", to: at }) === null && M.matchReturnRows(rows, { from: "x", to: at }, L).length === 0);
  check("  وتصنيفٌ غير «مرتجع» ⇒ ليس أثراً", !M.returnLineMatches(row(2, rows[0].description, 10000, "إيجار"), pt, L[0]));
  check("  ومرتجعٌ بلا سطورٍ (كلُّه مجّاني) ⇒ لا أثرَ مزعوم", M.matchReturnRows(rows, pt, []).length === 0);
  // سطرُ خادمٍ واحد لعمليتين بالقائمة: يُقال (لا تُحذف الاثنتان)
  const tr = { a: { state: "found", at, desc: "d", ids: ["r1"] }, b: { state: "found", at, desc: "d", ids: ["r1"] }, c: { state: "found", at, desc: "d", ids: ["r2"] }, d: { state: "none" } };
  check("سطرٌ واحد يطابق عمليتين ⇒ يُنبَّه عليهما، لا على غيرهما", M.sharesServerRow(tr, "a") && M.sharesServerRow(tr, "b") && !M.sharesServerRow(tr, "c") && !M.sharesServerRow(tr, "d"));
}

console.log("▸ الصفحةُ بالعربية");
{
  globalThis.__role = "manager"; globalThis.__rejected = []; globalThis.__others = [];
  globalThis.__list = [RET, EXP, PRD, DAY];
  const raw = html("ar");
  const s = text(raw);
  check("العنوانُ والمقدّمة وأنّ مصدرَها مجهول", s.includes(AR.obx.title) && s.includes(AR.obx.intro) && s.includes(AR.obx.originUnknown));
  check("كلُّ نوعٍ باسمه العربيّ", [AR.obx.kind.retail_return, AR.obx.kind.expenses, AR.obx.kind.products, AR.obx.kind.poultry_daily].every((k) => s.includes(k)));
  check("المبلغُ مقروءاً", s.includes("12,500") || s.includes("١٢٬٥٠٠"), s.slice(0, 200));
  const btn = (attr) => [...raw.matchAll(new RegExp(`<button[^>]*${attr}[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
  check("وزرّا «ارفعها» و«احذفها» لكلّ واحدة", btn("data-obx-send").length === 4 && btn("data-obx-send").every((x) => x === AR.obx.send)
    && btn("data-obx-discard").length === 4 && btn("data-obx-discard").every((x) => x === AR.obx.discard), JSON.stringify([btn("data-obx-send"), btn("data-obx-discard")]));
  check("لا مفتاحَ خام (obx.)", !/obx\./.test(s), s.match(/obx\.[\w.]+/)?.[0]);
  /* أوّلُ رسم: سؤالُ الخادم عن المرتجع لم يبدأ بعد — «ارفعها» عليه مقفولة (كانت مفتوحةً لحظة)، والسحبُ مفتوح. */
  const sendOf = (id) => raw.match(new RegExp(`data-obx-item="${id.replace(/[:.]/g, "\\$&")}"[\\s\\S]*?<button([^>]*data-obx-send[^>]*)>`))?.[1] ?? "";
  check("أوّلُ رسم: «ارفعها» على المرتجع وإدخالِ اليوم مقفولةٌ قبل جواب الخادم، وعلى السحب لا", /disabled/.test(sendOf(RET.id)) && /disabled/.test(sendOf(DAY.id)) && !/disabled/.test(sendOf(EXP.id)), JSON.stringify([sendOf(RET.id), sendOf(DAY.id), sendOf(EXP.id)]));
  globalThis.__list = [];
  check("قائمةٌ فارغة ⇒ «ماكو شي باقي»", text(html("ar")).includes(AR.obx.empty));

  // المرفوضةُ: سببُها ظاهر و«عيد المحاولة»؛ والمنتظرةُ لحسابٍ آخر للعلم بلا أزرار
  globalThis.__rejected = [REJ]; globalThis.__others = [EXP];
  const r2 = html("ar"); const t2 = text(r2);
  check("المرفوضةُ بقسمها، بسببها و«عيد المحاولة»", /data-obx-section="rejected"/.test(r2) && t2.includes("company_twin_name") && t2.includes(AR.obx.retry));
  check("  والمنتظرةُ لحسابٍ آخر بقسمها بلا أزرار", /data-obx-section="others"/.test(r2) && (r2.match(/data-obx-send/g) || []).length === 1);
  // غيرُ المدير: يرى ولا يرفع ولا يحذف
  globalThis.__role = "reception"; globalThis.__list = [RET];
  const r3 = html("ar");
  check("غيرُ المدير: لا «ارفعها» ولا «احذفها»، وجملةُ «لمدير العيادة»", !/data-obx-send|data-obx-discard/.test(r3) && text(r3).includes(AR.obx.managerOnly));
  // مديرٌ على جهازٍ مقفول: مثلُ غيرِ المدير (الكاشيرُ أمام الجهاز)
  globalThis.__role = "manager"; globalThis.__restricted = true;
  const r4 = html("ar");
  check("جهازٌ مقفول: لا أزرار ولو كان الحسابُ مديراً", !/data-obx-send|data-obx-discard/.test(r4) && text(r4).includes(AR.obx.managerOnly));
  globalThis.__restricted = false;
  // ما ينتظر حساباً آخر، ومرفوضةٌ مختومةٌ بحسابٍ آخر: «احذفها» وحدها
  globalThis.__list = []; globalThis.__others = [EXP]; globalThis.__rejected = [{ ...REJ, who: { user: "someone-else", clinic: "c" } }];
  const r5 = html("ar");
  check("حسابٌ آخر: «احذفها» وحدها (لا «ارفعها» ولا «عيد المحاولة»)", (r5.match(/data-obx-discard[^-]/g) || []).length === 2 && !/data-obx-send/.test(r5) && text(r5).includes(AR.obx.otherOwner));
  // متقادمةٌ بقسم المراجعة: للداخل ⇒ سببُ التوقيف و«ارفعها»؛ لحسابٍ آخر ⇒ «احذفها» وحدها
  const STALE = { ...RET, id: "retail_return:st", stale: true, who: { user: "u", clinic: "c" } };
  globalThis.__list = [STALE, { ...STALE, id: "retail_return:st2", who: { user: "someone-else", clinic: "c2" } }]; globalThis.__others = []; globalThis.__rejected = [];
  const r6 = html("ar"); const t6 = text(r6);
  check("متقادمةٌ للداخل: سببُها و«ارفعها»؛ ولحسابٍ آخر: «احذفها» وحدها", t6.includes(AR.obx.staleNote) && t6.includes(AR.obx.otherOwner) && !t6.includes(AR.obx.originUnknown)
    && (r6.match(/data-obx-send/g) || []).length === 1 && (r6.match(/data-obx-discard[^-]/g) || []).length === 2, t6.slice(0, 300));
  // ختمُه هو بلا عيادةٍ مؤكَّدة: «ارفعها» (تُختم بعيادته الآن) وسببُها — لا «حساب ثاني»
  globalThis.__list = [{ ...EXP, who: { user: "u", clinic: "?" } }];
  const r7 = html("ar"); const t7 = text(r7);
  check("بلا عيادةٍ مؤكَّدة (ختمُ الداخل): سببُها و«ارفعها»، لا «حساب ثاني»", t7.includes(AR.obx.clinicUnknown) && !t7.includes(AR.obx.otherOwner) && (r7.match(/data-obx-send/g) || []).length === 1, t7.slice(0, 300));
  globalThis.__role = "manager"; globalThis.__rejected = []; globalThis.__others = [];
}

console.log("▸ الصفحةُ بالإنكليزية");
{
  globalThis.__list = [RET, EXP];
  const s = text(html("en"));
  check("بالإنكليزية: العنوانُ ونوعا العمليتين", s.includes(EN.obx.title) && s.includes(EN.obx.kind.retail_return) && s.includes(EN.obx.kind.expenses));
  check("  ولا عربيةَ من القاموس (عدا ما بحمولة العيادة)", !s.includes(AR.obx.title) && !s.includes(AR.obx.send));
}

console.log("▸ دبابيس — الشارةُ تنقل للمراجعة، والصفحةُ خلف page()");
{
  const chip = readFileSync("src/components/OutboxChip.tsx", "utf8");
  check("الشارةُ الحمراء (أو ما ينتظر حساباً آخر) ⇒ /outbox، ولا إحياءَ أعمى", /if \(dead > 0 \|\| others > 0\) navigate\("\/outbox"/.test(chip) && !/outboxRevive\(/.test(chip));
  check("  و«بانتظار النت» تعدّ ما للداخل وحدَه", /const own = \(\) => outboxCount\(\) - outboxWaitingOthers\(\)\.length/.test(chip));
  const side = readFileSync("src/components/Sidebar.tsx", "utf8");
  check("والشارةُ بالقائمة الجانبية أيضاً (الشريطُ العلويّ مخفيٌّ للكادر فوق lg)", /<OutboxChip compact=\{folded\} \/>/.test(side));
  const app = readFileSync("src/App.tsx", "utf8");
  check("App: /outbox بصفحةٍ عبر page()، للعيادة وحدها", /const OutboxReview = page\(\(\) => import\("@\/pages\/OutboxReview"\)/.test(app) && /path="\/outbox" element=\{<Protected><ClinicOnly><OutboxReview/.test(app));
}

console.log(fails ? `\n✗ outbox-review-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ outbox-review-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
