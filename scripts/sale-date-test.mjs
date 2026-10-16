// «تاريخ المبيع» — القاعدةُ النقيّة (src/lib/saleDate.ts) ومرآتُها retail_checkout (0242).
// ما يحرسه: يومٌ قبل اليوم وحده، ولا أقدم من ٧ أيام، والتاريخُ محلّيّ لا يوم غرينتش (بيعةُ ما بعد منتصف
// الليل ببغداد كانت ستُحسب أمس)، والسِّيَقُ تُكتب بلا `at` فتُؤرَّخ بالفاتورة — وشاشةُ البيع تحفظ اليومَ مع
// مرجع المحاولة وتُرجعه لليوم بعد كلّ بيعة.
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "sale-date-"));
const out = join(dir, "m.mjs");
await build({
  entryPoints: ["src/lib/saleDate.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  alias: { "@": join(process.cwd(), "src") },
});
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${got ?? ""}`); } };
const NOW = new Date("2026-10-17T14:30:00+03:00");
const code = (r) => (r.ok ? "ok" : r.code);

console.log("▸ sale-date: حدودُ المنتقي");
const b = m.saleDayBounds(NOW);
check("اليومُ ١٧/١٠ ⇒ من ١٠/١٠ إلى ١٦/١٠", b.today === "2026-10-17" && b.min === "2026-10-10" && b.max === "2026-10-16", JSON.stringify(b));
check("  وحدُّ الشهر لا ينزلق (٣/١١ ⇒ من ٢٧/١٠)", m.saleDayBounds(new Date("2026-11-03T10:00:00+03:00")).min === "2026-10-27");
check("  وحدُّ السنة (٢/١ ⇒ أمسُ ١/١ وأقدمُه ٢٦/١٢)", (() => { const x = m.saleDayBounds(new Date("2027-01-02T10:00:00+03:00")); return x.max === "2027-01-01" && x.min === "2026-12-26"; })());

console.log("▸ sale-date: أيُّ لحظةٍ تُقبل");
const at = m.checkSaleMoment("2026-10-16", "15:00", NOW);
check("أمس ١٥:٠٠ بغداد ⇒ ١٢:٠٠ غرينتش، ويومُها ١٦/١٠", at.ok && at.at === "2026-10-16T12:00:00.000Z" && at.day === "2026-10-16", JSON.stringify(at));
check("  واليومُ نفسُه يُرفض ولو بساعةٍ مضت (sale_day_not_past)", code(m.checkSaleMoment("2026-10-17", "09:00", NOW)) === "sale_day_not_past");
check("  والغدُ يُرفض", code(m.checkSaleMoment("2026-10-18", "09:00", NOW)) === "sale_day_not_past");
check("  وقبل ٧ أيام يُقبل، وقبل ٨ يُرفض (backdate_window)", code(m.checkSaleMoment("2026-10-10", "09:00", NOW)) === "ok" && code(m.checkSaleMoment("2026-10-09", "23:59", NOW)) === "backdate_window");
check("  و٣١ شباط والساعة ٢٥:٠٠ يُرفضان (sale_at_invalid)", code(m.checkSaleMoment("2026-02-31", "10:00", NOW)) === "sale_at_invalid" && code(m.checkSaleMoment("2026-10-16", "25:00", NOW)) === "sale_at_invalid");
check("  ونصٌّ لا يُفهم لحظةً يُرفض", code(m.checkSaleAt("أمس", NOW)) === "sale_at_invalid" && code(m.checkSaleAt(null, NOW)) === "sale_at_invalid");

console.log("▸ sale-date: منتصفُ الليل ببغداد (درسُ 0223)");
const AFTER_MIDNIGHT = new Date("2026-10-17T00:10:00+03:00"); // = 16/10 21:10 غرينتش
check("الساعة ٠٠:١٠ يومُ ١٧ محلّياً: ٢٣:٣٠ أمس تُقبل (وهي ١٦/١٠ بغرينتش أيضاً)", m.checkSaleMoment("2026-10-16", "23:30", AFTER_MIDNIGHT).ok);
check("  و«اليوم» ١٧/١٠ ٠٠:٠٥ تُرفض — وغرينتش يقول ١٦/١٠ (التاريخُ محلّيّ)", code(m.checkSaleMoment("2026-10-17", "00:05", AFTER_MIDNIGHT)) === "sale_day_not_past");
check("  ولحظةٌ جاهزة: ٢١:٠٥ غرينتش يوم ١٦ = ٠٠:٠٥ بغداد يوم ١٧ ⇒ «اليوم» لا أمس", code(m.checkSaleAt("2026-10-16T21:05:00.000Z", AFTER_MIDNIGHT)) === "sale_day_not_past");

console.log("▸ sale-date: مَن يرى الاختيار");
check("المدير ⇒ نعم", m.canBackdate({ role: "manager", restricted: false }));
check("  والاستقبالُ والطبيبُ ⇒ لا", !m.canBackdate({ role: "receptionist", restricted: false }) && !m.canBackdate({ role: "veterinarian", restricted: false }));
check("  والجهازُ المقفولُ بلا مفتاح ⇒ لا حتى لحساب المدير", !m.canBackdate({ role: "manager", restricted: true }));
check("  ومشغّلُ المنصّة ⇒ لا", !m.canBackdate({ role: "manager", restricted: false, operator: true }));

console.log("▸ sale-date: السِّيَقُ تُؤرَّخ بالفاتورة");
const legs = m.stripLegTimes([{ method: "cash", amount: 1500, at: "2026-10-17T11:00:00.000Z" }, { method: "card", amount: 500 }]);
check("`at` يُشال من كلّ ساق والباقي كما هو", JSON.stringify(legs) === JSON.stringify([{ method: "cash", amount: 1500 }, { method: "card", amount: 500 }]), JSON.stringify(legs));
check("  وبلا سِيَق ⇒ null (كالخادم)", m.stripLegTimes([]) === null && m.stripLegTimes(null) === null);
check("isBackdated: الختمُ وحده يحكم", m.isBackdated({ recorded_at: "2026-10-17T11:00:00Z" }) && !m.isBackdated({ recorded_at: null }) && !m.isBackdated(null));

console.log("▸ sale-date: شاشةُ البيع (فحصٌ نصّيّ — ما لا يُرسم هنا)");
const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
check("اليومُ يُحفظ بالمسودّة **مع المرجع** (إعادةٌ بعد تحديثٍ لا تفقده)", /saleDay, saleTime, clientRef: saleRefSaved, custAuto \}\);/.test(sb) && /promoOn, saleDay, saleTime, saleRefSaved, custAuto, done\]\);/.test(sb));
check("  ويرجع لليوم بعد كلّ بيعة إلا «فاتورة ثانية لنفس اليوم»", /setSaleDay\(keep\?\.day \?\? null\)/.test(sb) && /keepDayRef\.current = \{ day: saleDay, time: saleTime \}/.test(sb));
check("  واللحظةُ المرسلة من checkSaleMoment وحدها، وبتوقيت الجهاز", /const c = checkSaleMoment\(saleDay, saleTime\)/.test(sb) && /sale_at: saleAt, sale_tz: saleTz\(\)/.test(sb));
check("  والتوصيلُ والإرجاعُ الخالص لا يُؤرَّخان بصمت", /deliveryOn \? "delivery" as const/.test(sb) && /saleDateMessage\("return"/.test(sb));
check("  وسجلُّ الحيوان بيوم البيعة كما ختمه الخادم", /const soldAt = invoice\.recorded_at \? invoice\.created_at : null/.test(sb) && /persistMedicalEntries\(pid, user\?\.full_name, drafts, soldAt\)/.test(sb));
const mig = readFileSync("supabase/migrations/0242_backdated_sale.sql", "utf8");
check("المرآةُ والخادمُ بنفس النافذة (٧ أيام)", m.BACKDATE_DAYS === 7 && /v_day < v_today - 7/.test(mig));

console.log(`\n${fail ? "✗" : "✓"} sale-date-test: ${pass} نجحت، ${fail} فشلت`);
process.exit(fail ? 1 : 0);
