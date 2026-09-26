/* ============================================================================
 * فحصُ مراقبة المخزون — `src/lib/stockWatch.ts` بسلوكه.
 *   node scripts/watch-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'IQD', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const r = await esbuild.build({
  entryPoints: ["src/lib/stockWatch.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
  plugins: [stubs], alias: { "@/lib/utils": "./src/lib/utils.ts" }, logLevel: "silent",
});
const X = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const TODAY = "2026-09-26";
const P = (id, o = {}) => ({ id, name: id, stock: 10, purchase_price: 1000, expiry_date: null, ...o });
const M = (n) => ({ kind: "months", n });

console.log("▸ ١) المدى");
check("شهرٌ من ٢٦/٩ = ٣٠ يوماً (٢٦/١٠)", X.horizonDays(M(1), TODAY) === 30, X.horizonDays(M(1), TODAY));
check("  وأربعةُ أشهر = ١٢٢ يوماً (٢٦/١: ٣٠+٣١+٣٠+٣١)", X.horizonDays(M(4), TODAY) === 122, X.horizonDays(M(4), TODAY));
check("  ٣١/١ + شهر = ٢٨/٢ لا ٣/٣", X.horizonDays(M(1), "2027-01-31") === 28, X.horizonDays(M(1), "2027-01-31"));
check("  ويومٌ محدّد بعينه", X.horizonDays({ kind: "date", date: "2026-10-06" }, TODAY) === 10);
check("  ويومٌ فات = صفر", X.horizonDays({ kind: "date", date: "2026-09-01" }, TODAY) === 0);

console.log("▸ ٢) الانتهاء والنفاد");
{
  const sold = new Map([["fast", 60], ["slow", 3]]);
  const rows = X.watchRows([
    P("fast", { stock: 20, expiry_date: "2027-06-01" }),          // ٢/يوم ⇒ يخلص بعد ١٠ أيام
    P("slow", { stock: 20, expiry_date: "2026-10-15" }),          // ٠٫١/يوم، ينتهي بعد ١٩ يوماً ⇒ يبقى ١٨
    P("gone", { stock: 5, expiry_date: "2026-09-20" }),           // فات
    P("nodate", { stock: 3 }),
    P("far", { stock: 3, expiry_date: "2027-09-01" }),
    P("pool", { pooled: true, expiry_date: "2026-10-01" }),
  ], sold, 30, TODAY, M(1));
  const by = Object.fromEntries(rows.map((x) => [x.product.id, x]));
  check("المجمَّعةُ خارجة", !by.pool);
  check("السريعةُ تخلص بعد ١٠ أيام وداخل الشهر", by.fast.runoutDays === 10 && by.fast.runsOutIn, JSON.stringify(by.fast));
  check("  وانتهاؤها بعيد فلا تُحسب «تنتهي خلال الشهر»", !by.fast.expiresIn);
  check("البطيئةُ تنتهي بعد ١٩ يوماً (داخل الشهر)", by.slow.expiryDays === 19 && by.slow.expiresIn);
  check("  و**يبقى منها ١٨ تنتهي بالرف** (٢٠ − ٠٫١×٢٠ يوماً)", by.slow.leftAtExpiry === 18, String(by.slow.leftAtExpiry));
  check("المنتهيةُ منتهية، وكلُّ رصيدها باقٍ", by.gone.expired && by.gone.expiredQty === 5 && !by.gone.expiresIn);
  check("مادةٌ لا تُباع لا تاريخَ نفادٍ لها (لا يُخترع)", by.far.runoutDays === null && !by.far.runsOutIn);
  check("الترتيبُ: الأقربُ حدثاً أوّلاً (المنتهية ثم السريعة ثم البطيئة)", rows.slice(0, 3).map((x) => x.product.id).join() === "gone,fast,slow", rows.map((x) => x.product.id).join());
  check("  وما لا حدثَ له آخراً", rows[rows.length - 1].product.id === "nodate");
  const f = (k) => rows.filter((x) => X.matchesFilter(x, k)).map((x) => x.product.id).join();
  check("فلتر «تنتهي خلال المدة»", f("expires") === "slow", f("expires"));
  check("فلتر «تخلص خلال المدة»", f("runsOut") === "fast", f("runsOut"));
  check("فلتر «منتهية»", f("expired") === "gone");
  check("فلتر «يبقى وينتهي»", f("waste") === "slow", f("waste"));
  check("فلتر «بلا تاريخ»", f("noDate") === "nodate");
  const four = X.watchRows([P("far", { stock: 3, expiry_date: "2027-01-10" })], new Map(), 30, TODAY, M(4));
  check("المدى يغيّر الحكم: بعد ١٠٦ أيام خارج الشهر وداخل أربعة", four[0].expiresIn, JSON.stringify(four[0]));
  const s = X.watchSummary(rows);
  check("الملخّص: تنتهي ١ بقيمة ٢٠٬٠٠٠، منتهية ١ بـ٥٬٠٠٠، تخلص ١، يبقى ١٨ بـ١٨٬٠٠٠",
    s.expires.n === 1 && s.expires.value === 20000 && s.expired.n === 1 && s.expired.value === 5000 && s.runsOut === 1 && s.waste.units === 18 && s.waste.value === 18000,
    JSON.stringify(s));
  const zero = X.watchRows([P("z", { stock: 0, expiry_date: "2026-10-01" })], new Map([["z", 30]]), 30, TODAY, M(1));
  check("نافدةٌ تُباع = تخلص «بعد صفر»، ولا تُعدّ «تنتهي» (ماكو رصيد)", zero[0].runoutDays === 0 && zero[0].runsOutIn && !zero[0].expiresIn);
}
console.log("▸ ٣) بالدفعات (0217)");
{
  const L = (id, qty, expiry_date) => ({ id, product_id: "x", qty, received_qty: qty, expiry_date, received_at: "2026-01-01", source: "purchase" });
  const lots = new Map([["x", [L("a", 10, "2026-10-26"), L("b", 20, "2027-04-24"), L("z", 0, "2026-10-01")]]]);
  // تُباع ٠٫٥/يوم: الأولى (بعد ٣٠ يوماً) يُباع منها ١٥٫٥ ⇒ لا يبقى منها شيء؛ الثانية (٢١٠ يوم) تبدأ بعد العشرة ⇒ يُباع منها ٩٥٫٥ ⇒ لا يبقى.
  const fast = X.watchRows([P("x", { stock: 30, expiry_date: "2026-10-26" })], new Map([["x", 15]]), 30, TODAY, M(1), lots)[0];
  check("كلُّ دفعةٍ بتاريخها (الفارغةُ خارج)", fast.lots.length === 2 && fast.lots.map((g) => g.expiryDays).join() === "30,210", fast.lots.map((g) => g.expiryDays).join());
  check("  «تنتهي خلال شهر» = ١٠ لا ٣٠ (القيمةُ على الدفعة لا المادة)", fast.expiresIn && fast.expiringQty === 10);
  const slow = X.watchRows([P("x", { stock: 30, expiry_date: "2026-10-26", purchase_price: 100 })], new Map([["x", 3]]), 30, TODAY, M(1), lots)[0];
  // ٠٫١/يوم: من الأولى يُباع ٣٫١ قبل انتهائها ⇒ يبقى ٧ (مقرّباً للأعلى من ٦٫٩)
  check("  يبقى من الأولى ٧ تنتهي بالرف (٠٫١/يوم × ٣١ يوماً = ٣٫١ مبيعة)", slow.leftAtExpiry === 7, String(slow.leftAtExpiry));
  check("  والثانيةُ خارج الشهر فلا تُحسب «تبقى» الآن", slow.lots[1].inRange === false);
  const s = X.watchSummary([slow]);
  check("  والملخّص بقيمة الدفعة: تنتهي ١٠ × ١٠٠ = ١٬٠٠٠، ويبقى ٧٠٠", s.expires.value === 1000 && s.waste.value === 700, JSON.stringify(s));
  const mix = X.watchRows([P("y", { stock: 8 })], new Map([["y", 30]]), 30, TODAY, M(1),
    new Map([["y", [{ ...L("e", 3, "2026-09-20"), product_id: "y" }, { ...L("g", 5, "2027-01-01"), product_id: "y" }]]]))[0];
  check("منتهيةٌ وصالحة معاً: المنتهيةُ ٣ بقيمتها، والصالحةُ لا تُحسب منتهية", mix.expired && mix.expiredQty === 3 && !mix.expiresIn);
  check("  وتاريخُ المادة = الأقرب (المنتهي — التنبيهُ لا يختفي)", mix.expiryDays === -6);
}
check("addDaysISO", X.addDaysISO(TODAY, 10) === "2026-10-06");

console.log(`\n${fails ? "✗" : "✓"} watch-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
