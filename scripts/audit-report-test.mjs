/* ============================================================================
 * تقريرُ فحص المخزن المطبوع (src/lib/auditReport.ts) — بالمخرَج الحقيقيّ من المصدر نفسه (esbuild).
 *
 * الورقةُ تُعطى للعيادة وتُقرأ رقماً رقماً، فيُفحص ما يُخطئ بصمت:
 *   • الاسمُ يُدخله الموظّف: «<» و«"» و«&» لا تكسر الورقة ولا تصير وسماً.
 *   • من لا يرى المال (restricted) لا يرى مبلغاً بأيّ مكان — لا بالغلاف ولا بالجداول ولا بالبطاقات.
 *   • «أهمّ ما لگيناه» لا يقول «0 مادة بلا باركود و5…» ولا «0 ما انباعت…»: الجزءُ الصفر لا يُقال.
 *   • كلُّ جدولٍ متّسق: خلايا كلّ صفّ = أعمدةُ رأسه (عمودُ الرمز يختفي إن كان كلُّه فارغاً، والقيمةُ
 *     للمدير وحده، والخانةُ الفارغة لبعض الفحوص، والمجموعةُ بعنوانٍ يمتدّ بـcolspan).
 *   • الأقسامُ بترتيب «ابدأ من هنا»، و«✔ تبقى هذي» على صفّ المصنع الوحيد لا غيره.
 *   • ورقةُ الرفّ تعدّ المادةَ مرّةً واحدة وإن ظهرت بسؤالين.
 *   • بلا إجماليّات (فشل جلبُها) الورقةُ تُبنى وتسقط بطاقتاها وحدهما، وبلا ملاحظات تقول «ماكو».
 *
 *   node scripts/audit-report-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, dispatchEvent() { return true; } };

const dir = mkdtempSync(join(tmpdir(), "auditrep-"));
const out = join(dir, "r.mjs");
await esbuild.build({
  entryPoints: ["src/lib/auditReport.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") },
});
const R = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

/* t كما يقرؤه التطبيق: القاموسُ العربيّ أوّلاً ثم الافتراض، و{{x}} بلا تهريب (i18next escapeValue:false) */
const ar = JSON.parse(readFileSync(new URL("../src/i18n/ar.json", import.meta.url), "utf8"));
const lookup = (k) => k.split(".").reduce((o, p) => (o == null ? o : o[p]), ar);
const t = (k, d) => {
  const vars = typeof d === "object" && d ? d : {};
  const def = typeof d === "string" ? d : vars.defaultValue;
  const v = lookup(k);
  return String(typeof v === "string" ? v : def ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => (vars[n] != null ? vars[n] : ""));
};

let seq = 0;
const row = (kind, o = {}) => ({
  kind, why: null, product_id: `p${++seq}`, product_name: `مادة ${seq}`, code: null, grp: null,
  stock: 1, value: 0, qty: null, days: null, company_id: null, company_name: null, ...o,
});
const html = (audit, o = {}) => {
  const sections = R.buildAuditModel(t, { audit, health: o.health ?? [] }, () => true);
  return R.buildAuditReportHTML({ t, lang: "ar", clinic: o.clinic ?? "عيادة", days: 90, restricted: !!o.restricted, sections, totals: o.totals === undefined ? { products: 500, value: 9_000_000 } : o.totals });
};
const summary = (audit, restricted = false) => R.summarize(t, R.buildAuditModel(t, { audit, health: [] }, () => true), { products: 100, value: 1_000_000 }, restricted);

/* ── عيّنةٌ تغطّي كلّ فحص ─────────────────────────────────────────────────── */
const EVIL = `حقيبة <img src=x onerror=alert(1)> "كبيرة" & صغيرة`;
const full = [
  row("impossible", { product_name: EVIL, stock: 10000, value: 123_456_789, days: null }),
  row("impossible", { why: "units", stock: 1728, value: 4_321_987, qty: 1728, days: 9000 }),
  // صفّا «نفس الاسم» أدناه هما صفّا التوأم نفسُهما بالقاعدة (نفس product_id) — وإلا لم تُفحص «تُعدّ مرّة»
  row("dup_twin", { product_id: "ham-shelf", why: "shelf", product_name: "طعام هامستر", code: "238", grp: "طعام هامستر", stock: 23, value: 57_500 }),
  row("dup_twin", { product_id: "ham-factory", why: "factory", product_name: "طعام هامستر", code: "6978661630512", grp: "طعام هامستر", stock: 15, value: 52_500 }),
  row("dup_twin", { why: "factory", product_name: "عضاضة", code: "4052916415436", grp: "عضاضة", stock: 1 }),
  row("dup_twin", { why: "factory", product_name: "عضاضة", code: "846998048248", grp: "عضاضة", stock: 3 }),
  row("dup_name", { product_id: "ham-shelf", product_name: "طعام هامستر", code: "238", grp: "طعام هامستر", stock: 23 }),
  row("dup_name", { product_id: "ham-factory", product_name: "طعام هامستر", code: "6978661630512", grp: "طعام هامستر", stock: 15 }),
  row("dup_name", { product_name: "سناك كلاب", code: "6953182712756", grp: "سناك كلاب" }),
  row("dup_name", { product_name: "سناك كلاب", code: "6953182712794", grp: "سناك كلاب" }),
  row("no_code", { product_name: "اطواق ببغاء" }),
  row("no_code", { product_name: "سنارة" }),
  row("hand_code", { why: "short", code: "7101" }),
  row("hand_code", { why: "check", code: "6950202165302" }),
  row("never_sold", { code: "8859387701947", value: 288_000, days: 71 }),
  row("stopped", { code: "8436611140910", value: 77_777, days: 40 }),
  row("slow", { code: "3182550816533", value: 66_666, days: 400 }),
  row("zero_sold", { code: "6941", stock: 0, qty: 5, days: 3 }),
  row("no_company", { why: "hint", company_name: "شركة <الرافدين>" }),
  row("no_company", {}),
  row("prefix_split", { code: "6953182712756", grp: "6953182", company_name: "أ" }),
  row("prefix_split", { code: "6953182712794", grp: "6953182", company_name: "ب" }),
];

console.log("▸ الاسمُ يُهرَّب");
{
  const h = html(full, { clinic: `ابن "الهيثم" <x-clinic>` });
  check("لا وسمَ <img من اسم مادة", !h.includes("<img"));
  check("  والاسمُ يظهر مهرَّباً", h.includes("&lt;img src=x onerror=alert(1)&gt; &quot;كبيرة&quot; &amp; صغيرة"));
  check("  واسمُ الشركة المقترحة مهرَّب", h.includes("شركة &lt;الرافدين&gt;") && !h.includes("<الرافدين>"));
  check("  واسمُ العيادة مهرَّب (العنوانُ والغلاف)", !h.includes("<x-clinic>") && (h.match(/&quot;الهيثم&quot; &lt;x-clinic&gt;/g) || []).length === 2);
}

console.log("▸ من لا يرى المال لا يرى مبلغاً");
{
  const money = ["123,456,789", "4,321,987", "57,500", "52,500", "288,000", "77,777", "66,666", "9,000,000"];
  const open = html(full);
  check("المديرُ يرى المبالغ (الفحصُ نفسُه يرى ما يبحث عنه)", money.filter((m) => m !== "9,000,000").every((m) => open.includes(m)) && open.includes("9,000,000"));
  const shut = html(full, { restricted: true });
  const leaked = money.filter((m) => shut.includes(m));
  check("restricted: ولا مبلغ واحد", leaked.length === 0, leaked.join(" "));
  check("  ولا «IQD» بأيّ مكان", !/IQD|د\.ع/.test(shut));
  const s = summary(full, true);
  check("  ولا بالملخّص («أهمّ ما لگيناه»)", !s.findings.some((f) => /IQD|٪ من قيمة/.test(f)), s.findings.find((f) => /IQD/.test(f)));
}

console.log("▸ الجزءُ الصفر لا يُقال");
{
  const onlyHand = summary([row("hand_code", { why: "short", code: "77" }), row("hand_code", { why: "short", code: "78" })]);
  const codes = onlyHand.findings.find((f) => f.includes("مكتوب باليد")) ?? "";
  check("رموزٌ يدوية بلا «بلا باركود»: لا «0 مادة»", codes && !/(^|[^\d])0 /.test(codes), codes);
  check("  والجملةُ تبدأ بعددها", codes.startsWith("2 "), codes);
  const onlyNo = summary([row("no_code")]);
  const nc = onlyNo.findings.find((f) => f.includes("بلا باركود")) ?? "";
  check("بلا باركود وحدها: لا ذكرَ للرمز اليدويّ", nc.startsWith("1 ") && !nc.includes("مكتوب باليد"), nc);
  const onlySlow = summary([row("slow", { value: 10, days: 400 })]);
  const idle = onlySlow.findings.find((f) => f.includes("بطيئة")) ?? "";
  check("راكدٌ بطيءٌ وحده: لا «0 ما انباعت» ولا «0 وقف»", idle && !/(^|[^\d])0 /.test(idle) && !idle.includes("ما انباعت") && !idle.includes("وقف"), idle);
  const all3 = summary([row("never_sold", { days: 40 }), row("stopped", { days: 40 }), row("slow", { days: 400 })]);
  const i3 = all3.findings.find((f) => f.includes("بضاعة واقفة")) ?? "";
  check("  والثلاثةُ معاً بفواصلها", i3.includes("ما انباعت") && i3.includes("وقف بيعها") && i3.includes("بطيئة") && (i3.match(/، و/g) || []).length === 2, i3);
}

console.log("▸ كلُّ جدولٍ متّسق (خلايا الصفّ = أعمدة الرأس)");
const tablesOf = (h) => [...h.matchAll(/<table class="tbl[^"]*"><thead>([\s\S]*?)<\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/g)];
const cellsOf = (tr) => [...tr.matchAll(/<td\b([^>]*)>/g)].reduce((s, m) => s + Number(/colspan="(\d+)"/.exec(m[1])?.[1] ?? 1), 0);
for (const [label, h] of [["المدير", html(full)], ["restricted", html(full, { restricted: true })]]) {
  const tables = tablesOf(h);
  const bad = [];
  for (const [, head, body] of tables) {
    const cols = (head.match(/<th/g) || []).length;
    for (const tr of body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
      const n = cellsOf(tr.replace(/<svg[\s\S]*?<\/svg>/g, ""));
      if (n !== cols) bad.push(`${cols}≠${n}: ${tr.slice(0, 90)}`);
    }
  }
  check(`${label}: ${tables.length} جدولاً بلا صفٍّ أعرج`, tables.length >= 8 && bad.length === 0, bad.slice(0, 2).join(" | "));
}
{
  const h = html(full);
  const noCode = tablesOf(h).find(([, , body]) => body.includes("اطواق ببغاء"));
  check("«بلا باركود»: عمودُ الرمز مختفٍ (كلُّه فارغ)", noCode && !noCode[1].includes("الباركود</th>"));
  check("  والخانةُ الفارغة «الباركود اللي لگيته» باقية", noCode && noCode[1].includes("الباركود اللي لگيته"));
  const prefix = tablesOf(h).find(([, , body]) => body.includes("6953182") && body.includes('class="grp"'));
  check("البادئةُ بعنوان مجموعتها", !!prefix);
  const name = tablesOf(h).find(([, , body]) => body.includes("6953182712794") && body.includes('class="gs'));
  check("نفسُ الاسم: كلُّ مجموعةٍ تبدأ بحدّ (gs) والثانيةُ مظلّلة (alt)", name && (name[2].match(/class="gs/g) || []).length === 2 && name[2].includes("alt"));
}

console.log("▸ الترتيبُ وبطاقاتُ التوائم");
{
  const h = html(full);
  const order = [...h.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  const at = (s) => order.indexOf(s);
  check("الأقسامُ بترتيب «ابدأ من هنا»: المستحيلُ ← المكرّر ← الباركود ← الصفر ← الشركات ← الراكد",
    at("كميات مستحيلة") < at("مكرّر محتمل") && at("مكرّر محتمل") < at("الباركود") && at("الباركود") < at("رصيده صفر وينباع")
      && at("رصيده صفر وينباع") < at("الشركات") && at("الشركات") < at("راكد") && at("كميات مستحيلة") > 0, order.join(" ← "));
  const groups = h.match(/<article class="group">[\s\S]*?<\/article>/g) || [];
  check("بطاقتا توأمين", groups.length === 2);
  const hamster = groups.find((g) => g.includes("6978661630512")) ?? "";
  check("«✔ تبقى هذي» مرّةً على صفّ المصنع", (hamster.match(/keepmark/g) || []).length === 1 && /pcard keep">[\s\S]*?6978661630512/.test(hamster));
  check("  وخطوةُ الدمج تسمّي الصفّين ورمزيهما", hamster.includes("«طعام هامستر» (238)") && hamster.includes("بالباركود 6978661630512"));
  const two = groups.find((g) => g.includes("4052916415436")) ?? "";
  check("مصنعان بنفس الاسم: لا «تبقى هذي» بالتخمين", two && !two.includes("keepmark"));
  check("  والخطوةُ العامّة بدل اسمٍ مختار", two.includes("اختاروا الصف اللي عليه باركود العلبة"));
}

console.log("▸ ورقةُ الرفّ تعدّ مرّةً");
{
  const h = html(full);
  const sheet = h.slice(h.indexOf("ورقة الفحص بالرف"), h.indexOf("استبيان الموظفين"));
  const blanks = (sheet.match(/الفعلي: ______/g) || []).length, refs = (sheet.match(/انعدّت بالسؤال 1/g) || []).length;
  check("«طعام هامستر» بسؤالين: يُعدّ بالأوّل والثاني يحيل إليه (٦ خاناتٍ لا ٨)", blanks === 6 && refs === 2, `blanks=${blanks} refs=${refs}`);
}

console.log("▸ ما أمسكه التدقيقُ العدائيّ");
{
  // (١) فحصٌ بلا جملة: الغلافُ قال «مرتّب» والصفحاتُ بعده تعدّ رمزاً على منتجين
  const twinCode = html([], { health: [{ kind: "twin", product_id: "a", product_name: "سناك", code: "6953182712756" }, { kind: "twin", product_id: "b", product_name: "سناك ٢", code: "6953182712756" }] });
  check("رمزٌ على منتجين وحده: الغلافُ لا يقول «ماكو ملاحظات»", !twinCode.includes("ماكو ملاحظات"));
  check("  وله جملةٌ بالملخّص وخطوةٌ بـ«ابدأ من هنا»", twinCode.includes("باركود فيه خلل") && twinCode.includes("صلّحوا الباركودات اللي فيها خلل"));
  const prefixOnly = html([row("prefix_split", { code: "6953182712756", grp: "6953182", company_name: "أ" }), row("prefix_split", { code: "6953182712794", grp: "6953182", company_name: "ب" })]);
  check("بادئةٌ على شركتين وحدها: لا «ماكو ملاحظات»، ولها جملةٌ وخطوة", !prefixOnly.includes("ماكو ملاحظات") && prefixOnly.includes("بادئة مصنع موزّعة") && prefixOnly.includes("صحّحوا شركة المواد"));
  // (٢) بلا مال سقط الرقمُ وبقيت جملتُه: «قيمتها . ابدأوا»
  const imp = [row("impossible", { product_name: "حقيبة", stock: 10000, value: 1_000_000 })];
  const shutImp = summary(imp, true).findings[0] ?? "";
  check("restricted: جملةُ المستحيل بلا «قيمتها» ولا نقطةٍ يتيمة", !shutImp.includes("قيمتها") && !/\.\s*\./.test(shutImp) && shutImp.includes("رصيده 10,000. ابدأوا"), shutImp);
  const openImp = summary(imp).findings[0] ?? "";
  check("  والمديرُ يرى القيمةَ ونسبتَها", openImp.includes("قيمتها 1,000,000") && openImp.includes("100٪"), openImp);
  // (٣) «المجموعُ = مادتان» يناقض نفسَه حين رصيدُ صفٍّ صفر (نصفُ التوائم الحقيقية)
  check("بطاقةُ التوأم بلا حكمِ «مجموع الرصيدين»", !html(full).includes("مجموع الرصيدين"));
}

console.log("▸ الحوافّ");
{
  const noTotals = html(full, { totals: null });
  check("بلا إجماليّات: الورقةُ تُبنى", noTotals.includes("أهم ما لگيناه") && noTotals.length > 5000);
  const kl = [...noTotals.matchAll(/class="kl">([^<]*)</g)].map((m) => m[1]);
  check("  وتسقط بطاقتا «مادة بالنظام» و«قيمة المخزن» وحدهما", kl.length === 6 && !kl.includes("مادة بالنظام") && !kl.some((x) => x.startsWith("قيمة المخزن")), kl.join("، "));
  const empty = html([]);
  check("بلا ملاحظات: «ماكو ملاحظات» بدل القائمة", empty.includes("ماكو ملاحظات") && !empty.includes('<ol class="find">'));
  check("  والخطوةُ الوحيدة الجردُ بالورقة", (empty.match(/<li class="step /g) || []).length === 1 && empty.includes("جرد فعلي بالورقة"));
  check("  ولا جدول", tablesOf(empty).length === 0);
  const h = html(full);
  check("الرسمُ حيث يُمسح: رمزا اليدويّ مرسومان", /aria-label="7101"/.test(h) && /aria-label="6950202165302"/.test(h));
  check("  والراكدُ نصٌّ لا رسم (طويلٌ للقراءة)", h.includes(">8859387701947<") && !/aria-label="8859387701947"/.test(h));
  // `rows.map(row)` مرّر المصفوفةَ كلَّها صنفاً للصفّ: ٢٫٢ ميغا بدل نصف ميغا بالبيانات الحقيقية
  check("لا «[object» ولا «undefined» بالورقة", !/\[object|undefined/.test(h));
}

console.log(`\n${fails ? "✗" : "✓"} audit-report-test: ${passes} نجح، ${fails} فشل`);
if (fails) process.exit(1);
