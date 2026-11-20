/* ============================================================================
 * علاماتُ فحص المخزن على ورقة الجرد (0245، «مثبَّتٌ داخل الجرد») — بالمخرجَين الحقيقيَّين.
 *
 * الطباعةُ (`buildStockReportHTML`) والإكسل (`buildStocktakeWorkbook`) من المصدر نفسه (esbuild)،
 * بلا علاماتٍ ثم بها، ويُفحص:
 *   • بلاها: الورقةُ كما كانت حرفاً — لا سطرَ ملخّص، ولا عمودَ V، والمدى حتى U (دورٌ لا يرى الفحص).
 *   • بها: سطرُ الملخّص بالأعلى (قبل أوّل مجموعة)، وعلامةُ كلّ مادةٍ بسطرها هي لا بغيره، والسطرُ
 *     المجمَّعُ بلا علامة، وعمودُ V بعنوانه وقيمه، والمدى/التصفية/الدمجُ تمتدّ إليه —
 *     **ومعادلاتُ الفرق لم تتحرّك** (عمودٌ يُدرَج وسطَ الخريطة ينقلها بصمت).
 *   • والعلاماتُ نصٌّ يُهرَّب: اسمٌ بـ«<» لا يكسر الورقة.
 *
 *   node scripts/audit-marks-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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

const T = "const tr = (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k);";
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^(@\/i18n|i18next|react-i18next)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^(\.\/supabase|@\/lib\/supabase)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: a.path.includes("supabase") ? "export const supabase = null;"
        : `${T} const i = { t: tr, language: 'ar', use: () => i, init: () => i, on: () => i, exists: () => false }; export default i; export const t = tr;`,
      loader: "js",
    }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: 'export { buildStockReportHTML } from "./src/lib/stockReportPrint.ts"; export { buildStocktakeWorkbook } from "./src/lib/stockReportXlsx.ts"; export { auditMarks, auditMarksFailed } from "./src/lib/auditMarks.ts";',
    resolveDir: process.cwd(), sourcefile: "audit-marks-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  external: ["xlsx-js-style"],
  define: { "import.meta.env": "__VITE_ENV__" },
  banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(join(tmpdir(), "audit-marks-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const xmod = await import("xlsx-js-style");
const XLSX = xmod.default ?? xmod;

const CO = { id: "co1", name: "شركة ألف" };
const SEC = { id: "s1", company_id: "co1", name: "صنف", pooled_stock: 4 };
const P = (id, name, extra = {}) => ({ id, name, barcode: `62${id.padStart(11, "0")}`, alt_codes: [], purchase_price: 1000, sell_price: 1500, stock: 5, created_at: "2026-01-01", ...extra });
const products = [
  P("1", "حقيبة نقل", { company_id: "co1", section_id: "s1", stock: 10000 }),
  P("2", "مادة سليمة", { company_id: "co1", section_id: "s1" }),
  P("3", "بلا رمز <script>", { barcode: null }),
];
const marks = {
  byProduct: new Map([["1", ["كمية مشكوكة", "تكرار؟"]], ["3", ["بلا باركود"]]]),
  summary: "فحص المخزن (بيع آخر ٩٠ يوم): كمية مشكوكة ١ · تكرار؟ ١ · بلا باركود ١",
  header: "ملاحظات الفحص",
};

console.log("▸ ورقةُ الطباعة");
{
  const plain = M.buildStockReportHTML(products, [CO], [SEC]);
  const html = M.buildStockReportHTML(products, [CO], [SEC], marks);
  check("بلا علامات: لا سطرَ ملخّص ولا علامة", !plain.includes('class="auditsum"') && !plain.includes('class="audit"'));
  const sum = html.indexOf('<div class="auditsum">');
  check("بها: سطرُ الملخّص موجودٌ وقبل أوّل مجموعة", sum > 0 && sum < html.indexOf('<section class="grp">'), String(sum));
  check("  ونصُّه كما مُرِّر", html.includes(marks.summary));
  const rowOf = (name) => html.split("<tr").find((r) => r.includes(name)) ?? "";
  check("علامتا «حقيبة نقل» بسطرها", rowOf("حقيبة نقل").includes("كمية مشكوكة · تكرار؟"));
  check("  و«مادة سليمة» بلا علامة", !rowOf("مادة سليمة").includes('class="audit"'));
  const poolRow = html.split("<tr").find((r) => r.includes('class="pool"'));
  check("  والسطرُ المجمَّعُ موجودٌ وبلا علامة", !!poolRow && !poolRow.includes('class="audit"'));
  check("والاسمُ يُهرَّب (لا <script> خامّ)", !html.includes("<script>") && html.includes("&lt;script&gt;"));
  // الباركودُ مرسومٌ يُمسح من الورقة — وما يزيد عن عرض العمود نصٌّ (التصغيرُ يرقّق الخطوط تحت ما تقرؤه طابعة)
  const bcHtml = M.buildStockReportHTML([...products, P("4", "رمز طويل", { company_id: "co1", barcode: "ABCDEFGHIJKLMNOPQRSTUVWXYZ12" })], [CO], [SEC]);
  const bcRow = (name) => bcHtml.split("<tr").find((r) => r.includes(name)) ?? "";
  check("باركودُ «مادة سليمة» مرسوم (svg) ونصُّه تحته", bcRow("مادة سليمة").includes('<svg class="bc"') && bcRow("مادة سليمة").includes(">6200000000002<"));
  check("  ورمزٌ من ٢٨ حرفاً (أعرضُ من العمود) نصٌّ لا رسمٌ مصغَّر", !bcRow("رمز طويل").includes("<svg") && bcRow("رمز طويل").includes('class="mono">ABCDEFGHIJKLMNOPQRSTUVWXYZ12<'));
  check("  و«بلا رمز» شرطةٌ لا رسم", !bcRow("بلا رمز").includes("<svg"));
}

console.log("▸ ملفُّ الإكسل");
{
  const now = new Date("2026-10-19T09:00:00Z");
  const sheetOf = (wb) => wb.Sheets[wb.SheetNames[0]];
  const plain = sheetOf(M.buildStocktakeWorkbook(XLSX, products, [CO], [SEC], now, "عيادة", undefined));
  const ws = sheetOf(M.buildStocktakeWorkbook(XLSX, products, [CO], [SEC], now, "عيادة", marks));
  const range = (s) => XLSX.utils.decode_range(s["!ref"]);
  check("بلا علامات: المدى حتى U ولا عمودَ V", range(plain).e.c === 20 && !plain.V4, plain["!ref"]);
  check("  والتصفيةُ حتى U", /^A4:U\d+$/.test(plain["!autofilter"].ref), plain["!autofilter"].ref);
  check("بها: المدى حتى V، والتصفيةُ والدمجُ معه", range(ws).e.c === 21 && /^A4:V\d+$/.test(ws["!autofilter"].ref) && ws["!merges"].every((m) => m.e.c === 21));
  check("  وعنوانُ العمود V4", ws.V4?.v === marks.header, JSON.stringify(ws.V4?.v));
  check("  وسطرُ الملخّص بجانب ساعة اللقطة (A2)", String(ws.A2?.v ?? "").includes(marks.summary) && String(plain.A2?.v ?? "").length > 0 && !String(plain.A2.v).includes("فحص"));
  // سطرُ كلّ مادة بمعرّفها (العمود U) لا بترتيبٍ مفترَض.
  const rowById = (id) => { for (let r = 5; r < 200; r++) if (ws[`U${r}`]?.v === id) return r; return -1; };
  const r1 = rowById("1"), r2 = rowById("2"), r3 = rowById("3");
  check("  علامتا «حقيبة نقل» بخلية V بسطرها", r1 > 0 && ws[`V${r1}`]?.v === "كمية مشكوكة · تكرار؟", JSON.stringify(ws[`V${r1}`]?.v));
  check("  و«مادة سليمة» خليةٌ فارغة", r2 > 0 && ws[`V${r2}`]?.v === "");
  check("  و«بلا رمز» علامتُه", r3 > 0 && ws[`V${r3}`]?.v === "بلا باركود");
  check("ومعادلاتُ الفرق بأعمدتها: فرقُ القطع بإشارته، وقيمتُه من القيمة كما تُعرض (MAX(J،0) كعمود رأس المال)",
    ws[`N${r1}`]?.f === `IF(M${r1}="","",M${r1}-J${r1})` && ws[`O${r1}`]?.f === `IF(M${r1}="","",(M${r1}-MAX(J${r1},0))*H${r1})`
    && ws[`K${r1}`]?.f === `MAX(J${r1},0)*H${r1}` && plain[`N${r1}`]?.f === ws[`N${r1}`]?.f, JSON.stringify([ws[`N${r1}`]?.f, ws[`O${r1}`]?.f, ws[`K${r1}`]?.f]));
  check("  والعمودُ الأصفر للعادّ ما زال M", ws.M4?.v === plain.M4?.v);
  /* بيعٌ قبل الجرد (0266): سطرٌ رصيدُه −٤ بسعر ٥٬٠٠٠ وسطرٌ ١٠ بسعر ١٠٠. رأسُ المال ١٬٠٠٠ قبل العدّ وبعده إن عُدّ السالبُ صفراً —
   * فصافي أثر الجرد صفر لا +٢٠٬٠٠٠ «زيادة». المعادلاتُ تُحسب هنا بيدٍ بنصّها (الورقةُ لا تُحسب بالمكتبة). */
  const negPs = [P("n1", "سالبة", { stock: -4, purchase_price: 5000, sell_price: 6000 }), P("n2", "موجبة", { stock: 10, purchase_price: 100, sell_price: 150 })];
  const wn = sheetOf(M.buildStocktakeWorkbook(XLSX, negPs, [], [], now, "عيادة", undefined));
  const rowOf = (id) => { for (let r = 5; r < 50; r++) if (wn[`U${r}`]?.v === id) return r; return -1; };
  const rn = rowOf("n1"), rp = rowOf("n2");
  const evalCell = (f, vals) => {
    // IF(M="","",X) و MAX(a,0) و + − * فقط — ما تكتبه الورقةُ بهذين العمودين.
    const m = /^IF\(M\d+="","",(.*)\)$/.exec(f);
    const body = (m ? m[1] : f).replace(/MAX\(([A-Z]\d+),0\)/g, (_, c) => `Math.max((${vals[c.replace(/\d+/, "")]}),0)`).replace(/\b([A-Z])\d+\b/g, (_, c) => `(${vals[c]})`);
    return Function(`return (${body});`)();
  };
  const counted = { n1: 0, n2: 10 };
  let sumO = 0, sumK = 0, sumMH = 0;
  for (const [id, r] of [["n1", rn], ["n2", rp]]) {
    const vals = { J: wn[`J${r}`].v, H: wn[`H${r}`].v, M: counted[id] };
    sumO += evalCell(wn[`O${r}`].f, vals); sumK += evalCell(wn[`K${r}`].f, vals); sumMH += vals.M * vals.H;
  }
  check("سطرٌ تحت الصفر: قيمتُه المخزّنة صفر، وصافي أثر الجرد = رأسُ المال بعد العدّ − قبله (صفرٌ لا +٢٠٬٠٠٠)",
    rn > 0 && wn[`K${rn}`]?.v === 0 && sumK === 1000 && sumO === sumMH - sumK && sumO === 0, JSON.stringify({ K: wn[`K${rn}`]?.v, sumK, sumO, sumMH }));
  const tot = (() => { for (let r = 5; r < 50; r++) if (String(wn[`A${r}`]?.v ?? "") === "المجموع") return r; return -1; })();
  const lo = Math.min(rn, rp), hi = Math.max(rn, rp);
  check("  ومجموعُ عمود «العدد بالنظام» مجموعُه كما هو (٦ بإشارته) — ورقةُ العدّ تُطابَق به: فعلي − نظام = الفرق",
    tot > 0 && wn[`J${tot}`]?.f === `SUM(J${lo}:J${hi})` && wn[`J${tot}`]?.v === 6, JSON.stringify({ f: wn[`J${tot}`]?.f, v: wn[`J${tot}`]?.v }));
  const wbn = M.buildStocktakeWorkbook(XLSX, negPs, [], [], now, "عيادة", undefined);
  const sum = wbn.Sheets[wbn.SheetNames[1]];
  const cells = Object.keys(sum).filter((k) => /^A\d+$/.test(k)).map((k) => ({ r: Number(k.slice(1)), label: String(sum[k].v ?? "") }));
  const rowOfLabel = (txt) => cells.find((x) => x.label.startsWith(txt))?.r ?? -1;
  const rUnits = rowOfLabel("إجمالي القطع"), rSys = rowOfLabel("العدد بالنظام"), rAct = rowOfLabel("مجموع القطع الفعلية"), rNet = rowOfLabel("صافي فرق القطع");
  check("  والملخّص: «إجمالي القطع» قطعُ الرفّ (١٠ كبطاقة الشركة)، و«العدد بالنظام» (٦ بإشارته) قبل «الفعلية» و«صافي الفرق» — فيتّفق الحساب أمام العين",
    rUnits > 0 && sum[`B${rUnits}`]?.v === 10 && rSys > 0 && rSys < rAct && rAct < rNet && /^SUM\('[^']+'!J\d+:J\d+\)$/.test(String(sum[`B${rSys}`]?.f ?? "")),
    JSON.stringify({ rUnits, units: sum[`B${rUnits}`]?.v, rSys, fSys: sum[`B${rSys}`]?.f, rAct, rNet }));
  /* والمعادلةُ تحمل قيمتَها لحظةَ التصدير: LibreOffice لا يعيد حسابَ xlsx عند الفتح (افتراضيّاً، مقيسٌ بـsoffice) فيعرض المخزّن — كان
   * صفراً لكلّ سطر: «العدد بالنظام» صفرٌ ويبقى (لا يتبع ما يُكتب بالأصفر)، و«أسطر لم تُعدّ بعد» صفرٌ والأسطرُ كلُّها لم تُعدّ. */
  const rLeft = rowOfLabel("أسطر لم تُعدّ بعد"), rDone = rowOfLabel("أسطر عُدَّت فعلاً");
  check("  وقيمُها المخزّنة كما يحسبها البرنامج لحظةَ التصدير (العمودُ الأصفرُ فارغ): «العدد بالنظام» ٦، و«لم تُعدّ» ٢، و«عُدّت» صفر",
    sum[`B${rSys}`]?.v === 6 && sum[`B${rLeft}`]?.v === 2 && sum[`B${rDone}`]?.v === 0 && sum[`B${rAct}`]?.v === 0 && sum[`B${rNet}`]?.v === 0,
    JSON.stringify({ sys: sum[`B${rSys}`]?.v, left: sum[`B${rLeft}`]?.v, done: sum[`B${rDone}`]?.v }));
  /* عيادةٌ بلا أسطر: المدى لا يبدأ بعد نهايته — J5:J4 يُقرأ J4:J5 فيأخذ خليةَ العنوان («أسطر فيها فرق: 1» عن ورقةٍ فارغة، مقيسٌ بـLibreOffice). */
  const wbe = M.buildStocktakeWorkbook(XLSX, [], [], [], now, "عيادة", undefined);
  const sumE = wbe.Sheets[wbe.SheetNames[1]];
  const ranges = Object.values(sumE).filter((x) => x && typeof x === "object" && x.f).flatMap((x) => [...String(x.f).matchAll(/!([A-Z])(\d+):([A-Z])(\d+)/g)].map((m) => [Number(m[2]), Number(m[4])]));
  check("  وعيادةٌ بلا أسطر: لا مدى مقلوب بمعادلات الملخّص", ranges.length > 0 && ranges.every(([a, b]) => a <= b), JSON.stringify(ranges.slice(0, 4)));
  const wbp = M.buildStocktakeWorkbook(XLSX, products, [CO], [SEC], now, "عيادة", undefined);
  const sumP = wbp.Sheets[wbp.SheetNames[1]];
  check("  وعيادةٌ بلا سالب: لا سطرَ «العدد بالنظام» بالملخّص (هو «إجمالي القطع» نفسُه)",
    !Object.keys(sumP).some((k) => /^A\d+$/.test(k) && String(sumP[k].v ?? "").startsWith("العدد بالنظام")));
}

console.log("▸ auditMarks — من ملاحظات الفحص إلى كلمةٍ لكلّ مادة");
{
  const tr = (k, d) => {
    const o = typeof d === "string" ? { defaultValue: d } : (d ?? {});
    return String(o.defaultValue ?? k).replace(/{{(\w+)}}/g, (_, x) => String(o[x] ?? ""));
  };
  const A = (kind, id, why = null) => ({ kind, why, product_id: id, product_name: id, code: null, grp: null, stock: 1, value: 0, qty: null, days: null, company_id: null, company_name: null });
  const H = (kind, id) => ({ kind, product_id: id, product_name: id, code: "x" });
  const m = M.auditMarks(tr,
    [A("hand_code", "a", "short"), A("dup_twin", "a", "shelf"), A("impossible", "a", "value"), A("never_sold", "b"), A("stopped", "c"),
      A("slow", "d"), A("zero_sold", "e"), A("no_company", "e"), A("prefix_split", "e"), A("no_code", "f"), A("zero_sold", "z"), A("no_company", "z")],
    [H("twin", "a"), H("arabic", "g"), H("alt_owned", "h")]);
  check("ترتيبٌ بالخطورة وبلا تكرار: «a» كمية ثم تكرار ثم رمز يدوي",
    JSON.stringify(m.byProduct.get("a")) === JSON.stringify(["كمية مشكوكة", "تكرار؟", "رمز يدوي"]), JSON.stringify(m.byProduct.get("a")));
  check("  وما انباعت ووقف بيعها كلمةٌ واحدة، والبطيئةُ غيرُها",
    m.byProduct.get("b")?.[0] === "ما ينباع" && m.byProduct.get("c")?.[0] === "ما ينباع" && m.byProduct.get("d")?.[0] === "بطيء");
  check("  وما تقوله الورقةُ أصلاً لا يُكرَّر (نافد، بدون شركة)", !m.byProduct.has("z"));
  check("  وبادئةٌ بشركتين «شركة؟» — المادةُ بمجموعةٍ قد تكون غلطاً ولا شيءَ يقوله", JSON.stringify(m.byProduct.get("e")) === JSON.stringify(["شركة؟"]), JSON.stringify(m.byProduct.get("e")));
  check("  و0168: العربيُّ «رمز معطوب» والمستعارُ «تكرار؟»", m.byProduct.get("g")?.[0] === "رمز معطوب" && m.byProduct.get("h")?.[0] === "تكرار؟");
  // الأرقامُ بلغة الواجهة (formatNum) — تُوحَّد لاتينيةً للمقارنة.
  const sum = m.summary.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  check("  والملخّصُ يعدّ الموادَّ بكلّ علامة وبترتيبها",
    sum.includes("كمية مشكوكة 1 · تكرار؟ 2 · بلا باركود 1 · رمز يدوي 1 · رمز معطوب 1 · شركة؟ 1 · ما ينباع 2 · بطيء 1") && sum.includes("90"), m.summary);
  const clean = M.auditMarks(tr, [], []);
  check("وفحصٌ فارغٌ فعلاً يقول «ماكو ملاحظات»", clean.byProduct.size === 0 && clean.summary.includes("ماكو ملاحظات"), clean.summary);
  const elsewhere = M.auditMarks(tr, [A("zero_sold", "e"), A("no_company", "e"), A("no_company", "y")], []);
  check("  وملاحظاتٌ بلا علامة لا تُقال «ماكو» — تُقال بعدد موادّها", elsewhere.byProduct.size === 0 && !elsewhere.summary.includes("✓") && elsewhere.summary.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).includes("2 مادة"), elsewhere.summary);
  const failed = M.auditMarksFailed(tr);
  check("وفشلُ الفحص يُقال بسطر الورقة، بلا علامات", failed.byProduct.size === 0 && failed.summary.includes("ما وصلت"), failed.summary);
}

console.log(`\n${fails ? "✗" : "✓"} audit-marks-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
