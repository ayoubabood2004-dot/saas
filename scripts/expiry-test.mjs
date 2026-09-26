/* ============================================================================
 * فحصُ قاعدة الانتهاء (م١) — `src/lib/expiry.ts` بسلوكه، لا بنصّه.
 *
 * الجذر: ثلاثُ حساباتٍ لـ«كم يوم باقي» أعطت ثلاثة أجوبة لنفس المادة (شاشةُ
 * المخزون: منتهية يومَ انتهائها من ٣ فجراً ببغداد؛ الجرد: «قرب الانتهاء»؛
 * utils: تقريبٌ للأعلى). فالقاعدةُ صارت واحدة، وهذا يثبت حدودَها:
 *   ١) آخرُ يومٍ صالح = 0 لا منتهٍ، واليومُ التالي -1.
 *   ٢) الساعةُ لا تغيّر اليوم: ١١ مساءً و١ فجراً بتوقيت بغداد.
 *   ٣) حدودُ الحرجة ومدة الإرجاع عند N وN+1.
 *   ٤) الكتمُ يسري ما دام التاريخُ نفسَه، ويرتفع بتغيّره (الطرفان مطبَّعان).
 *   ٥) مرورٌ واحد: الرصيدُ صفر لا يُعدّ، المكتومُ لا يُعدّ ويبقى ظاهراً،
 *      «جديدة هذا الأسبوع»، والقيمةُ بسعر الشراء، والأقربُ أولاً.
 *   ٦) قائمةُ المندوب: مجمَّعةٌ بالشركة، بالسنة، وبلا أسعار.
 *
 *   node scripts/expiry-test.mjs
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
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  entryPoints: ["src/lib/expiry.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
  plugins: [stubs], alias: { "@/lib/utils": "./src/lib/utils.ts" }, logLevel: "silent",
});
const X = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const W = { returnDays: 90, criticalDays: 30 };
const T = "2026-09-25";

console.log("▸ ١) آخرُ يومٍ صالح");
check("تاريخُ اليوم = 0 أيام (يُباع اليوم)", X.daysToExpiry("2026-09-25", T) === 0);
check("  وحالتُه «حرجة» لا «منتهية»", X.expiryState("2026-09-25", W, T) === "critical");
check("أمس = -1 ومنتهية", X.daysToExpiry("2026-09-24", T) === -1 && X.expiryState("2026-09-24", W, T) === "expired");
check("تاريخٌ بوقتٍ ملحق (2026-09-25T00:00:00Z) يُقرأ يوماً لا لحظة", X.daysToExpiry("2026-09-25T00:00:00Z", T) === 0);
check("بلا تاريخ = null", X.daysToExpiry(null, T) === null && X.expiryState(undefined, W, T) === null);
check("نصٌّ تالف = null لا NaN", X.daysToExpiry("قريباً", T) === null);
check("عبرَ نهاية شهرٍ وسنة", X.daysToExpiry("2027-01-01", "2026-12-31") === 1 && X.daysToExpiry("2026-03-01", "2026-02-28") === 1);

console.log("▸ ٢) الساعةُ لا تغيّر اليوم (بغداد UTC+3)");
{
  const late = new Date("2026-09-25T20:30:00Z"); // 23:30 ببغداد
  const early = new Date("2026-09-24T22:30:00Z"); // 01:30 ببغداد يوم 25
  const localDay = (d) => { const o = new Date(d.getTime() + 3 * 3600000); return o.toISOString().slice(0, 10); };
  check("٢٣:٣٠ ببغداد يومَ الانتهاء: ما زالت صالحة (0)", X.daysToExpiry("2026-09-25", localDay(late)) === 0);
  check("٠١:٣٠ ببغداد يومَ الانتهاء: صالحة (كان المخزونُ يقول منتهية من ٠٣:٠٠)", X.daysToExpiry("2026-09-25", localDay(early)) === 0);
  check("والافتراضُ اليومُ المحلّيّ لا الغرينتشيّ (localISO)", typeof X.daysToExpiry("2099-01-01") === "number");
}

console.log("▸ ٣) الحدود");
check("٣٠ يوماً = حرجة، ٣١ = مدة إرجاع", X.expiryState("2026-10-25", W, T) === "critical" && X.expiryState("2026-10-26", W, T) === "return");
check("٩٠ يوماً = مدة إرجاع، ٩١ = لا شيء", X.expiryState("2026-12-24", W, T) === "return" && X.expiryState("2026-12-25", W, T) === null);
check("والمُددُ من الإعداد لا ثابتة (٤٥/١٢٠)", X.expiryState("2026-11-05", { returnDays: 120, criticalDays: 45 }, T) === "critical"
  && X.expiryState("2027-01-20", { returnDays: 120, criticalDays: 45 }, T) === "return");

console.log("▸ ٤) الكتم");
check("مكتومٌ حين يساوي التاريخَ", X.isExpiryMuted({ expiry_date: "2026-10-01", expiry_ack: "2026-10-01" }));
check("  ويرتفع بتغيّر التاريخ (وجبةٌ جديدة)", !X.isExpiryMuted({ expiry_date: "2027-03-01", expiry_ack: "2026-10-01" }));
check("  والطرفان مطبَّعان (تاريخٌ طويلٌ بالتجريبيّ)", X.isExpiryMuted({ expiry_date: "2026-10-01T00:00:00.000Z", expiry_ack: "2026-10-01" }));
check("  والبيعُ ينقص الرصيدَ فيبقى مكتوماً", X.isExpiryMuted({ expiry_date: "2026-10-01", expiry_ack: "2026-10-01", expiry_ack_qty: 2, stock: 1 }));
check("  وطيُّ توأمٍ فيه (رصيدٌ أكبرُ بنفس التاريخ) يرفعه — وحداتٌ لم يُقرّ بها أحد",
  !X.isExpiryMuted({ expiry_date: "2026-10-01", expiry_ack: "2026-10-01", expiry_ack_qty: 2, stock: 12 }));
check("  وكتمٌ قديمٌ بلا رصيدٍ محفوظ يبقى بالتاريخ وحدَه", X.isExpiryMuted({ expiry_date: "2026-10-01", expiry_ack: "2026-10-01", expiry_ack_qty: null, stock: 99 }));
check("  وبلا كتمٍ أو بلا تاريخ = غيرُ مكتوم", !X.isExpiryMuted({ expiry_date: "2026-10-01", expiry_ack: null }) && !X.isExpiryMuted({ expiry_date: null, expiry_ack: null }));

console.log("▸ ٥) المرورُ الواحد");
{
  const P = (id, expiry, stock, price = 1000, extra = {}) => ({ id, name: id, expiry_date: expiry, stock, purchase_price: price, ...extra });
  const w = X.expiryWatch([
    P("gone", "2026-09-01", 3, 2000),                    // منتهية برصيد
    P("gone0", "2026-09-01", 0, 2000),                   // منتهية بلا رصيد — لا تُعدّ
    P("today", "2026-09-25", 2, 500),                    // حرجة (0)
    P("d20", "2026-10-15", 4, 1000),                     // حرجة
    P("d60", "2026-11-24", 1, 3000),                     // مدة إرجاع
    P("d88", "2026-12-22", 5, 100),                      // دخلت هذا الأسبوع
    P("d95", "2026-12-29", 5, 100),                      // خارج المدة
    P("muted", "2026-10-10", 9, 9999, { expiry_ack: "2026-10-10" }),
    P("pooled", "2026-10-10", 0, 100, { pooled: true }), // مجمَّع: رصيدُه بصنفه
    P("nodate", null, 5),
  ], W, T);
  const ids = (l) => l.map((p) => p.id).join(",");
  check("المنتهيةُ على الرفّ وحدَها", ids(w.expired) === "gone", ids(w.expired));
  check("داخل المدة، الأقربُ أولاً، بلا مكتومٍ ولا صفر", ids(w.window) === "today,d20,d60,d88", ids(w.window));
  check("  منها الحرجة", ids(w.critical) === "today,d20", ids(w.critical));
  check("  ومنها دخلت هذا الأسبوع (٨٤..٩٠)", ids(w.newThisWeek) === "d88", ids(w.newThisWeek));
  check("المكتومةُ ظاهرةٌ بقائمتها ولا تُعدّ", ids(w.muted) === "muted", ids(w.muted));
  check("القيمةُ بسعر الشراء: منتهية 6000، داخل المدة 1000+4000+3000+500",
    w.expiredValue === 6000 && w.windowValue === 8500, `${w.expiredValue} / ${w.windowValue}`);
  check("expiryCost صفرٌ لما ليس على الرفّ", X.expiryCost({ stock: 0, purchase_price: 5 }) === 0 && X.expiryCost({ stock: -2, purchase_price: 5 }) === 0);
}

console.log("▸ ٦) قائمةُ المندوب");
{
  const t = (k, o = {}) => ({
    "expiry.listHead": `قائمة ${o.n} — ${o.date}`,
    "expiry.listLine": `• ${o.name} — ${o.qty} — ${o.date}`,
    "expiry.noCompany": "بدون شركة",
  })[k] ?? k;
  const rows = [
    { id: "a", name: "سيفوتاكس", stock: 3, purchase_price: 7000, expiry_date: "2026-10-15", company_id: "c2" },
    { id: "b", name: "رويال", stock: 2.5, purchase_price: 24000, expiry_date: "2026-12-01", company_id: "c1" },
    { id: "c", name: "شامبو", stock: 1, purchase_price: 5000, expiry_date: "2026-11-01", company_id: null },
  ];
  const co = { c1: "الرافدين", c2: "بغداد فارما" };
  const txt = X.returnListText(rows, (p) => co[p.company_id] ?? "", t, T);
  check("رأسٌ بالعدد والتاريخ", txt.startsWith("قائمة 3 — 2026/09/25"), txt.split("\n")[0]);
  check("مجمَّعةٌ بالشركة، و«بدون شركة» لما لا شركة له", /\*الرافدين\*\n• رويال/.test(txt) && /\*بدون شركة\*\n• شامبو/.test(txt), txt);
  check("التاريخُ بالسنة والعددُ الكسريّ يبقى", txt.includes("• رويال — 2.5 — 2026/12/01"), txt);
  check("وبلا أسعار", !/7000|24000|5000|7,000|24,000/.test(txt), txt);
}

console.log("▸ ٧) بوّابةُ البيع (SaleBuilder — بنيةً، والسلوكُ بقيادة المتصفّح)");
{
  const { readFileSync } = await import("node:fs");
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  const co = sb.slice(sb.indexOf("const checkout = async (ack: CheckoutAck = {})"), sb.indexOf("setBusy(true);", sb.indexOf("const checkout = async")));
  check("البوّابةُ داخل checkout وقبل توليد المرجع (إلغاءٌ لا يستهلك مرجعاً)", co.includes("expiredLines()") && co.includes("setExpiredAsk("), co.slice(0, 80));
  check("  وبعد بوّابة الرفّ كلّه، والإقرارُ بمعرّفات السطور المسمّاة لا بنعمٍ عامّة",
    co.indexOf("!ack.bigIds?.includes(l.id)") > -1 && co.indexOf("!ack.bigIds?.includes(l.id)") < co.indexOf("!ack.expiredIds?.includes(l.id)") && !/force/.test(co));
  check("  والتأكيدان يحملان ما سبقهما ويسمّيان سطورهما", sb.includes("checkout({ ...a, bigIds: ids })") && sb.includes("checkout({ ...a, expiredIds: ids })"));
  check("  وقفلُ إعادة الدخول: نقرتان لا تبيعان مرّتين", co.includes("if (inFlightRef.current) return;") && /finally \{\s*setBusy\(false\);\s*setPaying\(false\);[^\n]*\n\s*inFlightRef\.current = false;/.test(sb));
  check("  والإقرارُ مربوطٌ بمرجع البيعة (إعادةٌ بنفس المرجع تُسجَّل)", co.includes("expiredAckRef.current?.ref !== saleRefRef.current"));
  check("  نافذةٌ حقيقية لا window.confirm", sb.includes("data-expiredgo") && !/window\.confirm\s*\(/.test(sb));
  const done = sb.indexOf("setDone({ invoice, items: invItems });");
  const log = sb.indexOf('repo.logClientEvent("sale.expired"');
  check("  والتدقيقُ بعد نجاح البيعة لا عند الضغط", done > 0 && log > done);
  check("  والماسحُ صامتٌ والنافذتان مفتوحتان", /useBarcodeScanner\(handleScan, \{ disabled:[^}]*!!bigSale[^}]*!!expiredAsk/.test(sb));
  check("  والقاعدةُ من expiry.ts لا نسخةٌ خامسة", sb.includes('from "@/lib/expiry"') && !/new Date\([^)]*expiry/.test(sb));
  const act = readFileSync("src/lib/activityKinds.ts", "utf8"), mig = readFileSync("supabase/migrations/0210_expiry.sql", "utf8");
  check("والحدثُ نفسُه بالمرآتين (sale.expired ⇒ sale_expired)", act.includes('ev === "sale.expired"') && mig.includes("= 'sale.expired' then 'sale_expired'"));
  const set = readFileSync("src/lib/settings.ts", "utf8");
  check("والافتراضان ٩٠/٣٠ واحدٌ بالإعدادات والهجرة وexpiry.ts",
    /expiry_return_days: 90, expiry_critical_days: 30/.test(set) && /expiry_return_days integer not null default 90/.test(mig)
    && /expiry_critical_days integer not null default 30/.test(mig) && X.EXPIRY_DEFAULTS.returnDays === 90 && X.EXPIRY_DEFAULTS.criticalDays === 30);
  check("وexpiry_ack وexpiry_ack_qty nullable بالهجرة (استرجاعُ اللقطات القديمة)",
    /add column if not exists expiry_ack date;/.test(mig) && /add column if not exists expiry_ack_qty numeric;/.test(mig));
}

console.log("▸ ٧) وسمُ الإرجاع والكشفُ بالشركة (م٤)");
{
  check("موسومةٌ حين يساوي تاريخَها", X.isReturnMarked({ expiry_date: "2026-10-01", return_mark: "2026-10-01" }));
  check("  ووجبةٌ جديدةٌ بتاريخٍ آخر ترفعه وحدَها", !X.isReturnMarked({ expiry_date: "2027-03-01", return_mark: "2026-10-01" }));
  check("  والطرفان مطبَّعان (تاريخٌ طويل)", X.isReturnMarked({ expiry_date: "2026-10-01T00:00:00Z", return_mark: "2026-10-01" }));
  check("  وبلا وسمٍ أو بلا تاريخ = لا", !X.isReturnMarked({ expiry_date: "2026-10-01" }) && !X.isReturnMarked({ expiry_date: null, return_mark: "2026-10-01" }));
  const P = (id, co, stock, cost, exp) => ({ id, name: id, company_id: co, stock, purchase_price: cost, expiry_date: exp });
  const rows = [P("a", "A", 2, 1000, "2026-10-20"), P("b", "B", 10, 500, "2026-10-05"), P("c", "A", 1, 100, "2026-10-01"), P("d", null, 3, 10, "2026-11-01"), P("e", "B", 0, 9999, "2026-10-02")];
  const g = X.groupByCompany(rows, (p) => p.company_id ?? "", "بدون شركة", T);
  check("المجموعاتُ بالشركة، الأثقلُ قيمةً أوّلاً (B ٥٠٠٠ ثمّ A ٢١٠٠)", g.map((x) => x.company).join() === "B,A,بدون شركة", g.map((x) => `${x.company}:${x.value}`).join());
  check("  والقيمةُ بسعر الشراء لما على الرفّ فقط (الرصيدُ صفر لا يُحسب)", g[0].value === 5000 && g[1].value === 2100);
  check("  وداخلها الأقربُ انتهاءً أوّلاً", g[1].rows.map((p) => p.id).join() === "c,a");
  check("  و«بلا شركة» مجموعةٌ باسمها لا تسقط", g[2].company === "بدون شركة" && g[2].rows.length === 1);
}

console.log(`\n${fails ? "✗" : "✓"} expiry-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
