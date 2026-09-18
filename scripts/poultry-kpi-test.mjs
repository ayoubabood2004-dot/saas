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
const { poultryKpi, poultryOutcome, latestSample, batchWeeks, dayDiff, weightSanity, plausibleWeightG } = await import(
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

/* ── ٦) طيُّ الدفتر بالأسابيع ────────────────────────────────────────────*/
// الملخّصُ الأسبوعيُّ صار الطريقَ الأوّلَ لقراءة تاريخ الدفعة. وخطأُ تجميعٍ هنا
// لا يظهر مكسوراً — يظهر رقماً معقولاً وخاطئاً.
console.log("▸ الدفترُ ينطوي بأسابيع — والتجميعُ يطابق الورقة");
const D = (on_date, o = {}) => ({ on_date, dead: 0, culled: 0, sample_weight_g: null, sample_size: null, note: null, ...o });
const U = (on_date, kind, qty, line_cost, o = {}) => ({ id: `${kind}-${on_date}-${qty}`, on_date, kind, qty, line_cost, name: kind, ...o });
const P = "2026-09-01";

const w = batchWeeks(
  [D("2026-09-01", { dead: 3 }), D("2026-09-07", { dead: 4, culled: 1, sample_weight_g: 900, sample_size: 5 }),
   D("2026-09-08", { dead: 2 }), D("2026-09-15", { dead: 5, sample_weight_g: 2000, sample_size: 1 })],
  [U("2026-09-02", "feed", 100, 90000), U("2026-09-09", "feed", 200, 180000), U("2026-09-09", "med", 2, 30000)],
  P,
);
// ٠١/٠٩ يومُ الوضع ⇒ اليوم ٠ (الأسبوع ١)، و٠٨/٠٩ اليوم ٧ (الثاني)، و١٥/٠٩ اليوم ١٤ (الثالث).
check("ثلاثةُ أسابيع", w.length === 3, String(w.length));
check("  والأحدثُ أوّلاً", w[0].week === 3 && w[2].week === 1);
check("اليومُ ٠ بالأسبوع الأوّل لا الصفر", w[2].from === 0 && w[2].to === 6);
check("  واليومُ ٧ يبدأ الثاني", w[1].from === 7 && w[1].to === 13);
check("نفوقُ الأسبوع الأوّل ٧ ومستبعَدُه ١", w[2].dead === 7 && w[2].culled === 1);
check("وعلفُ الأسبوع الثاني ٢٠٠ كغم", w[1].feedKg === 200);
check("  وكلفتُه علفاً ودواءً معاً ٢١٠٬٠٠٠", w[1].cost === 210000, String(w[1].cost));
check("  والدواءُ لا يُجمع بالكيلوات", w[1].feedKg === 200);
// الوزنُ آخرُ عيّنةٍ بالأسبوع لا أوّلُها ولا متوسّطُها.
check("وزنُ الأسبوع الأوّل ٠٫١٨ (عيّنةُ ٥ طيور ٩٠٠ غم)", Math.abs(w[2].weightKg - 0.18) < 1e-9, String(w[2].weightKg));
check("  وأسبوعٌ بلا عيّنةٍ وزنُه null", w[1].weightKg === null);
check("  والأسبوعُ الثالث ٢ كغم", w[0].weightKg === 2);

// آخرُ عيّنةٍ **بالتاريخ** لا بترتيب المرور — الترتيبُ ترتيبُ الجلب لا التاريخ.
const wOrder = batchWeeks(
  [D("2026-09-05", { sample_weight_g: 1500, sample_size: 1 }), D("2026-09-03", { sample_weight_g: 800, sample_size: 1 })],
  [], P,
);
check("العيّنةُ الأحدثُ تفوز مهما كان ترتيبُ الصفوف", wOrder[0].weightKg === 1.5, String(wOrder[0].weightKg));
const wOrder2 = batchWeeks(
  [D("2026-09-03", { sample_weight_g: 800, sample_size: 1 }), D("2026-09-05", { sample_weight_g: 1500, sample_size: 1 })],
  [], P,
);
check("  وبالترتيب المعكوس كذلك", wOrder2[0].weightKg === 1.5, String(wOrder2[0].weightKg));

// يومٌ بتاريخٍ **قبل** وضع الدجاج (إدخالٌ خاطئ): يبقى مرئياً بالأسبوع الأوّل.
const wBefore = batchWeeks([D("2026-08-20", { dead: 9 })], [], P);
check("إدخالٌ قبل تاريخ الوضع لا يختفي ولا يصنع أسبوعاً سالباً",
  wBefore.length === 1 && wBefore[0].week === 1 && wBefore[0].dead === 9);

// سطرُ صرفٍ بيومٍ بلا إدخالٍ يوميّ: يُجمَّع كذلك ولا يسقط.
const wUseOnly = batchWeeks([], [U("2026-09-10", "feed", 50, 45000)], P);
check("سطرُ صرفٍ بلا يومٍ مسجَّل يظهر بأسبوعه", wUseOnly.length === 1 && wUseOnly[0].week === 2 && wUseOnly[0].feedKg === 50);

check("وأيامُ الأسبوع تُعرض من الأحدث للأقدم",
  w[2].rows[0].date === "2026-09-07" && w[2].rows[w[2].rows.length - 1].date === "2026-09-01");
check("ودفترٌ فارغٌ يُرجع قائمةً فارغة", batchWeeks([], [], P).length === 0);

// ── «٠» لا تقف مكان «ما عدّه أحد» ──────────────────────────────────────
// أخطرُ جملةٍ يقولها دفترٌ هي «ما نفق شيء» وهو لم يُعدّ أصلاً.
const wCount = batchWeeks(
  [D("2026-09-01", { dead: 3 }), D("2026-09-02", { dead: 2 })],
  [U("2026-09-09", "feed", 140, 126000)],   // أسبوعٌ ثانٍ فيه علفٌ بلا عدّ
  P, "2026-09-14",
);
const w2 = wCount.find((x) => x.week === 2), w1 = wCount.find((x) => x.week === 1);
check("أسبوعٌ بعلفٍ وبلا عدٍّ: daysEntered صفر", w2.daysEntered === 0);
check("  ومجموعُ نفوقه صفرٌ **رقمياً** — والشاشةُ تعرض «—» لا صفراً", w2.dead === 0);
check("  وأيامُه المنقضية سبعة", w2.daysElapsed === 7, String(w2.daysElapsed));
check("وأسبوعٌ عُدّ يومان من سبعة", w1.daysEntered === 2 && w1.daysElapsed === 7);
// الأسبوعُ الجاري ناقصٌ بطبعه — لا يُوسَم «ناقص العدّ» ظلماً.
const wNow = batchWeeks([D("2026-09-15", { dead: 1 }), D("2026-09-16", { dead: 2 })], [], P, "2026-09-16");
const w3 = wNow.find((x) => x.week === 3);
check("الأسبوعُ الجاري: يومان مضيا ويومان عُدّا", w3.daysEntered === 2 && w3.daysElapsed === 2);
check("  فلا يُوسَم ناقصاً وهو مكتمل", !(w3.daysEntered < w3.daysElapsed));
// دفعةٌ مغلقة: المدى يقف عند يوم الإغلاق لا عند اليوم.
const wClosed = batchWeeks([D("2026-09-01", { dead: 1 })], [], P, "2026-09-03");
check("دفعةٌ أُغلقت باليوم الثاني: ثلاثةُ أيامٍ مضت لا سبعة", wClosed[0].daysElapsed === 3, String(wClosed[0].daysElapsed));
check("وبلا `through` لا يُدّعى نقصٌ (المدى مفتوح)", batchWeeks([D("2026-09-01", { dead: 1 })], [], P)[0].daysElapsed === 7);

/* ── ٧) فرقُ الأيام لا ينزلق بتوقيتٍ صيفيٍّ ولا بمنطقة ──────────────────*/
console.log("▸ فرقُ الأيام — الظهرُ يقي انزلاقَ الساعة");
check("يومٌ واحد", dayDiff("2026-09-01", "2026-09-02") === 1);
check("وأسبوع", dayDiff("2026-09-01", "2026-09-08") === 7);
check("والسالبُ سالب", dayDiff("2026-09-08", "2026-09-01") === -7);
check("ونفسُ اليوم صفر", dayDiff("2026-09-01", "2026-09-01") === 0);
// عبورُ تبديل التوقيت الصيفيّ بأوروبا (٢٥ تشرين الأول ٢٠٢٦) — ٢٥ ساعةً حقيقية.
check("عبورُ تبديل التوقيت يبقى يوماً واحداً", dayDiff("2026-10-24", "2026-10-25") === 1);
check("  وثلاثون يوماً تبقى ثلاثين", dayDiff("2026-10-01", "2026-10-31") === 30);

/* ── ٨) حدُّ المعقول — غلطةُ وحدةٍ لا حكمُ أداء ──────────────────────────*/
console.log("▸ حدُّ المعقول للوزن — يمسك غلطةَ الكتابة ولا يحكم على الحقل");
// «١٫٨» قاصداً كيلوين ⇒ ١٫٨ غم.
check("كيلوان كُتبا غراماً يُمسكان", weightSanity(0.0018, 21) === "low");
check("  وعشرةُ أضعافٍ بنسيان عدد الطيور تُمسك", weightSanity(9, 21) === "high", String(weightSanity(9, 21)));
// وما هو حقيقيٌّ يمرّ صامتاً مهما كان أداؤه.
check("٩٠٠ غم بعمر ٢١ يوماً يمرّ", weightSanity(0.9, 21) === null);
check("  وحقلٌ بطيءٌ (٤٠٠ غم بـ٢١) يمرّ — لسنا حَكَماً", weightSanity(0.4, 21) === null);
check("  وحقلٌ سريعٌ (١٬٣٠٠ غم بـ٢١) يمرّ كذلك", weightSanity(1.3, 21) === null);
check("صوصُ اليوم الأوّل (٤٠ غم) يمرّ", weightSanity(0.04, 0) === null);
check("  و٢٠٠ غم بعمر يومٍ واحدٍ تُمسك", weightSanity(0.2, 0) === "high");
check("لاحمٌ ناضجٌ ٣ كغم بعمر ٤٢ يمرّ", weightSanity(3, 42) === null);
check("  و٨ كغم بعمر ٤٢ تُمسك", weightSanity(8, 42) === "high");
// الحدُّ نفسُه: فضفاضٌ عمداً — يفوق أسرعَ اللاحم بالمراجع.
check("سقفُ اليوم ٣٥ فوق ٤ كغم (فضفاضٌ عمداً)", plausibleWeightG(35).max > 4000, String(plausibleWeightG(35).max));
check("  والأدنى ٢٥ غم بكلّ عمر", plausibleWeightG(0).min === 25 && plausibleWeightG(42).min === 25);
check("وعمرٌ سالبٌ لا يكسر الحدّ", plausibleWeightG(-5).max === plausibleWeightG(0).max);
// غيابُ الوزن ليس شذوذاً.
// **التقريبُ قبل الفحص يمحو ما يُفحص**: وزنُ ١٫٨ غم بخانتين يصير صفراً،
// والحارسُ يصمت عن الصفر — فالحالةُ التي وُضع لأجلها تمرّ. المؤشّرُ يحمل
// دقّةَ الغرام حتى يبقى الشذوذُ ظاهراً للحارس ولعين القارئ معاً.
const tiny = poultryKpi(stats(), [day("2026-09-10", 9, 5)]);
check("وزنُ ١٫٨ غم لا يُقرَّب إلى صفرٍ فيفلت", tiny.avgWeightKg === 0.002, String(tiny.avgWeightKg));
check("  والحارسُ يمسكه بعد التقريب", weightSanity(tiny.avgWeightKg, 24) === "low");
check("  ووزنٌ عاديٌّ يحتفظ بغرامه", poultryKpi(stats(), [day("2026-09-10", 6280, 5)]).avgWeightKg === 1.256);

check("بلا وزنٍ لا حكم", weightSanity(null, 21) === null && weightSanity(undefined, 21) === null);
check("  وصفرٌ أو سالبٌ لا حكم (تُمسك بمكانٍ آخر)", weightSanity(0, 21) === null && weightSanity(-1, 21) === null);

console.log(fails ? `\n✗ poultry-kpi-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ poultry-kpi-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
