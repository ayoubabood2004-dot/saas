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
  check("ومعادلاتُ الفرق لم تتحرّك (M و J و H كما كانت)",
    ws[`N${r1}`]?.f === `IF(M${r1}="","",M${r1}-J${r1})` && ws[`O${r1}`]?.f === `IF(M${r1}="","",(M${r1}-J${r1})*H${r1})`
    && plain[`N${r1}`]?.f === ws[`N${r1}`]?.f, ws[`N${r1}`]?.f);
  check("  والعمودُ الأصفر للعادّ ما زال M", ws.M4?.v === plain.M4?.v);
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
      A("slow", "d"), A("zero_sold", "e"), A("no_company", "e"), A("prefix_split", "e"), A("no_code", "f")],
    [H("twin", "a"), H("arabic", "g"), H("alt_owned", "h")]);
  check("ترتيبٌ بالخطورة وبلا تكرار: «a» كمية ثم تكرار ثم رمز يدوي",
    JSON.stringify(m.byProduct.get("a")) === JSON.stringify(["كمية مشكوكة", "تكرار؟", "رمز يدوي"]), JSON.stringify(m.byProduct.get("a")));
  check("  وما انباعت ووقف بيعها كلمةٌ واحدة، والبطيئةُ غيرُها",
    m.byProduct.get("b")?.[0] === "ما ينباع" && m.byProduct.get("c")?.[0] === "ما ينباع" && m.byProduct.get("d")?.[0] === "بطيء");
  check("  وما تقوله الورقةُ أصلاً لا يُكرَّر (نافد، الشركات)", !m.byProduct.has("e"));
  check("  و0168: العربيُّ «رمز معطوب» والمستعارُ «تكرار؟»", m.byProduct.get("g")?.[0] === "رمز معطوب" && m.byProduct.get("h")?.[0] === "تكرار؟");
  // الأرقامُ بلغة الواجهة (formatNum) — تُوحَّد لاتينيةً للمقارنة.
  const sum = m.summary.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  check("  والملخّصُ يعدّ الموادَّ بكلّ علامة وبترتيبها",
    sum.includes("كمية مشكوكة 1 · تكرار؟ 2 · بلا باركود 1 · رمز يدوي 1 · رمز معطوب 1 · ما ينباع 2 · بطيء 1") && sum.includes("90"), m.summary);
  const clean = M.auditMarks(tr, [A("zero_sold", "e")], []);
  check("ومخزنٌ بلا علامة يقول «ماكو ملاحظات» لا سطراً فارغاً", clean.byProduct.size === 0 && clean.summary.includes("ماكو ملاحظات"), clean.summary);
  const failed = M.auditMarksFailed(tr);
  check("وفشلُ الفحص يُقال بسطر الورقة، بلا علامات", failed.byProduct.size === 0 && failed.summary.includes("ما وصلت"), failed.summary);
}

console.log(`\n${fails ? "✗" : "✓"} audit-marks-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
