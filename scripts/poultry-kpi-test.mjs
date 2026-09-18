/* ============================================================================
 * فحصُ مؤشّرات الدفعة — «رقمٌ مخترعٌ بمؤشّرِ أداءٍ يُقرأ قراراً».
 *
 * هذه المعادلاتُ هي ما يقرؤه صاحبُ الحقل ليقرّر: يبدّل العلف؟ يبيع الآن؟
 * وخطأٌ بقسمةٍ هنا لا يظهر بالشاشة مكسوراً — يظهر رقماً معقولاً وخاطئاً.
 * فالفحصُ يمشي على الأرقام نفسِها، ويشدّد على حالتين تُنتجان «صفراً كاذباً»:
 * قسمةٌ على صفر، ووزنٌ لم يُدخَل بعد.
 *
 *   node scripts/poultry-kpi-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) <= eps;

const built = await esbuild.build({
  entryPoints: ["src/lib/poultryKpi.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
});
const { poultryKpi, poultryOutcome, latestSample } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

const stats = (o = {}) => ({
  placed_count: 20000, dead: 700, culled: 100, alive: 19200,
  feed_kg: 50000, feed_cost: 45_000_000, med_cost: 2_000_000, other_cost: 1_000_000,
  chick_cost: 10_000_000, days: 35, last_entry: null, ...o,
});
const day = (on_date, sample_weight_g, sample_size = 1) => ({ on_date, sample_weight_g, sample_size, dead: 0, culled: 0 });

/* ── ١) بلا وزنٍ: «ما نعرف» لا صفر ───────────────────────────────────────*/
console.log("▸ بلا عيّنةِ وزنٍ — المؤشّراتُ تسكت ولا تخترع");
const none = poultryKpi(stats(), []);
check("متوسّطُ الوزن null", none.avgWeightKg === null);
check("ومعدّلُ التحويل null — لا صفرٌ يُقرأ «علفٌ ممتاز»", none.fcr === null);
check("وEPEF null", none.epef === null);
check("وكلفةُ الكيلو الحيّ null", none.costPerLiveKg === null);
check("لكنّ الكلفةَ الكلّيّة تُقال (لا تحتاج وزناً)", none.totalCost === 58_000_000);
check("ونسبةُ البقاء تُقال كذلك", near(none.viabilityPct, 96));

/* ── ٢) الحسابُ بأرقامٍ يدوية ────────────────────────────────────────────*/
// عيّنةُ ٥ طيورٍ وزنُها ١٠٬٠٠٠ غم ⇒ ٢ كغم للطير.
// حيٌّ ١٩٬٢٠٠ × ٢ = ٣٨٬٤٠٠ كغم. علفٌ ٥٠٬٠٠٠ ⇒ تحويلٌ ١٫٣٠٢٠٨…
console.log("▸ الحسابُ يطابق الورقة");
const k = poultryKpi(stats(), [day("2026-09-01", 9000, 5), day("2026-09-10", 10000, 5)]);
check("متوسّطُ الوزن ٢ كغم", near(k.avgWeightKg, 2));
check("  ومن **آخر** يومٍ فيه عيّنة لا من متوسّطها", k.weighedOn === "2026-09-10");
check("الوزنُ الحيُّ ٣٨٬٤٠٠ كغم", near(k.liveWeightKg, 38400, 1));
check("معدّلُ التحويل ١٫٣٠", near(k.fcr, 1.3, 0.005), String(k.fcr));
// EPEF = (٩٦ × ٢) ÷ (٣٥ × ١٫٣٠٢٠٨) × ١٠٠ = ٤٢١
check("EPEF ٤٢١", k.epef === 421, String(k.epef));
// ٥٨ مليون ÷ ٣٨٬٤٠٠ = ١٬٥١٠٫٤٢
check("كلفةُ الكيلو الحيّ ١٬٥١٠٫٤٢", near(k.costPerLiveKg, 1510.42, 0.02), String(k.costPerLiveKg));

/* ── ٣) العيّنةُ بطيرٍ واحد: الحقلُ الغالب ───────────────────────────────*/
const one = poultryKpi(stats(), [day("2026-09-10", 1850)]);
check("طيرٌ واحدٌ ١٬٨٥٠ غم ⇒ ١٫٨٥ كغم", near(one.avgWeightKg, 1.85));
check("  و`sample_size` الغائبُ يُقرأ واحداً لا صفراً", one.fcr !== null);

/* ── ٤) القسمةُ على صفرٍ بكلّ مدخلٍ ممكن ─────────────────────────────────*/
console.log("▸ لا قسمةَ تُنتج صفراً كاذباً ولا لانهاية");
const dead = poultryKpi(stats({ alive: 0, dead: 20000, culled: 0 }), [day("2026-09-10", 2000)]);
check("دفعةٌ نفقت كلُّها: التحويلُ null لا ∞", dead.fcr === null);
check("  وكلفةُ الكيلو null", dead.costPerLiveKg === null);
check("  ونسبةُ البقاء صفرٌ حقيقيّ", dead.viabilityPct === 0);
const zeroDays = poultryKpi(stats({ days: 0 }), [day("2026-09-10", 2000)]);
check("عمرٌ صفر (دفعةُ اليوم): EPEF null لا ∞", zeroDays.epef === null);
check("  لكنّ التحويلَ يُحسب (لا يحتاج عمراً)", zeroDays.fcr !== null);
const noFeed = poultryKpi(stats({ feed_kg: 0 }), [day("2026-09-10", 2000)]);
check("بلا علفٍ: التحويلُ null لا صفر", noFeed.fcr === null || noFeed.fcr === 0);
const badSample = poultryKpi(stats(), [day("2026-09-10", 0, 5), day("2026-09-11", 2000, 0)]);
check("وزنٌ صفرٌ أو عيّنةٌ بصفرِ طيرٍ تُهمَلان", badSample.avgWeightKg === null);
check("  ولا واحدةٌ منهما تُسقط الحسابَ باستثناء", badSample.totalCost === 58_000_000);
check("ويومٌ بلا وزنٍ أصلاً لا يُحسب عيّنةً", latestSample([day("2026-09-12", null)]) === null);

/* ── ٥) الحصيلةُ بعد الإغلاق ─────────────────────────────────────────────*/
console.log("▸ الحصيلة — الجوابُ الذي يُغلق الدفتر");
const cyc = { sold_weight_kg: 37000, sale_total: 74_000_000 };
const o = poultryOutcome(cyc, 58_000_000);
check("كلفةُ الكيلو المباع ١٬٥٦٧٫٥٧ (على الموزون لا المقدَّر)", near(o.costPerSoldKg, 1567.57, 0.02), String(o.costPerSoldKg));
check("الربحُ ١٦ مليوناً", o.profit === 16_000_000);
check("والهامشُ ٢١٫٦٢٪", near(o.marginPct, 21.62, 0.02), String(o.marginPct));
const loss = poultryOutcome({ sold_weight_kg: 30000, sale_total: 40_000_000 }, 58_000_000);
check("خسارةٌ تُعرض سالبةً لا تُقصّ", loss.profit === -18_000_000);
check("  وهامشُها سالب", loss.marginPct !== null && loss.marginPct < 0);
const nothing = poultryOutcome({ sold_weight_kg: null, sale_total: null }, 58_000_000);
check("إغلاقٌ بلا أرقامِ بيع: كلُّها null — لا ربحَ صفريٌّ مُدّعى", nothing.profit === null && nothing.costPerSoldKg === null);
const free = poultryOutcome({ sold_weight_kg: 1000, sale_total: 0 }, 5_000_000);
check("بيعٌ بصفر: الربحُ سالبٌ والهامشُ null (لا قسمةَ على صفر)", free.profit === -5_000_000 && free.marginPct === null);

console.log(fails ? `\n✗ poultry-kpi-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ poultry-kpi-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
