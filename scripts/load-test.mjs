/* ============================================================================
 * قياس طاقة النظام — كم طلباً متزامناً يتحمّل قبل ما ينحني؟
 *
 * ── لماذا لا نطلق ألفين طلب مباشرةً ──────────────────────────────────────
 * لأن القاعدة فيها عيادات تبيع الآن. وإطلاقُ ألفين طلبٍ عليها بوقت الدوام
 * يعني كاشيراً حقيقياً ينتظر بمنتصف بيعة — أي أننا نصنع العطل الذي جئنا
 * نقيسه.
 *
 * ولا حاجة أصلاً. الطاقة تُشتَقّ ولا تُجرَّب:
 *
 *      الطاقة (طلب/ثانية) = حجم المسبح ÷ متوسط زمن الاستعلام
 *
 * فيكفي أن نصعد بالتزامن تدريجياً حتى نجد **الركبة** — النقطة التي يتوقّف
 * عندها المردود عن الزيادة ويبدأ الزمن بالتضخّم. عندها نعرف حجم المسبح
 * الفعليّ وزمن الخدمة، فنحسب الألفين على الورق.
 *
 * ── وحارسٌ يوقفه قبل أن يؤذي ─────────────────────────────────────────────
 * السكربت يقطع من نفسه إذا تجاوز الخطأُ ٪١٠ أو تجاوز p95 خمسَ ثوانٍ. أي أنه
 * يجد الحدّ ثم يتراجع، لا يدفعه حتى ينكسر.
 *
 * وكل الطلبات **قراءةٌ فقط** — ولا صفَّ يُكتب ولا يُحذف.
 *
 * ── التشغيل ──────────────────────────────────────────────────────────────
 *   DV_URL=https://xxxx.supabase.co \
 *   DV_ANON=<المفتاح العلني> \
 *   DV_EMAIL=<بريد مستخدم بالعيادة> DV_PASSWORD=<كلمته> \
 *   node scripts/load-test.mjs
 *
 * خيارات:
 *   --max 200     أقصى تزامن (الافتراضي ٥٠ — ارفعه بقصدٍ لا سهواً)
 *   --seconds 6   مدّة كل درجة
 *
 * المفتاح العلني (anon) وحده لا يكفي: سياسات الصفوف تربط القراءة بعيادة
 * المستخدم، فبلا جلسةٍ حقيقية تقرأ صفراً من الصفوف ويصير القياس كذبة.
 * ==========================================================================*/

const URL_BASE = process.env.DV_URL?.replace(/\/+$/, "");
const ANON = process.env.DV_ANON;
const EMAIL = process.env.DV_EMAIL;
const PASSWORD = process.env.DV_PASSWORD;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const MAX = arg("max", 50);
const SECONDS = arg("seconds", 6);

/** حدود الأمان: نتوقّف عند أوّل مؤشّر ضيق، لا نكسر لنرى أين ينكسر. */
const ABORT_ERR_PCT = 10;
const ABORT_P95_MS = 5000;

if (!URL_BASE || !ANON) {
  console.error("✗ لازم DV_URL و DV_ANON. شوف الترويسة.");
  process.exit(1);
}

/* ── جلسة حقيقية: بدونها ما تقرأ سياساتُ الصفوف شيئاً ────────────────────*/
async function signIn() {
  if (!EMAIL || !PASSWORD) return null;
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) { console.error("✗ فشل تسجيل الدخول:", r.status, (await r.text()).slice(0, 160)); process.exit(1); }
  return (await r.json()).access_token;
}

const token = await signIn();
if (!token) {
  console.error("✗ لازم DV_EMAIL و DV_PASSWORD — بلا جلسةٍ حقيقية القياس كذبة (تقرأ صفر صفوف).");
  process.exit(1);
}
const H = { apikey: ANON, authorization: `Bearer ${token}` };

/* ── حِملان: خفيفٌ يقيس الرحلة، وثقيلٌ يقيس شغلاً حقيقياً ────────────────*/
const LOADS = [
  {
    id: "خفيف",
    what: "صفٌّ واحد من الحيوانات — يقيس زمن الرحلة والمسبح وحدهما",
    url: `${URL_BASE}/rest/v1/pets?select=id&limit=1`,
  },
  {
    id: "ثقيل",
    what: "صفحةُ ألف بند فاتورة — نفس ما تسحبه التقارير فعلاً",
    url: `${URL_BASE}/rest/v1/invoice_items?select=id,qty,line_total,created_at&order=id.asc&limit=1000`,
  },
];

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

/** يطلق `conc` طلباً باستمرار طوال `SECONDS`، ويقيس ما وصل. */
async function level(url, conc) {
  const lat = [];
  let ok = 0, bad = 0;
  const until = Date.now() + SECONDS * 1000;
  const worker = async () => {
    while (Date.now() < until) {
      const t0 = performance.now();
      try {
        const r = await fetch(url, { headers: H });
        await r.arrayBuffer();               // نستهلك الجسم — وإلا قِسنا الترويسة وحدها
        (r.ok ? ok++ : bad++);
      } catch { bad++; }
      lat.push(performance.now() - t0);
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, worker));
  const secs = (performance.now() - t0) / 1000;
  const s = lat.slice().sort((a, b) => a - b);
  const total = ok + bad;
  return {
    conc, ok, bad, rps: total / secs,
    p50: pct(s, .5), p95: pct(s, .95), p99: pct(s, .99),
    errPct: total ? (bad * 100 / total) : 0,
  };
}

const STEPS = [1, 2, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500].filter((n) => n <= MAX);

console.log(`▸ قياس الطاقة — أقصى تزامن ${MAX}، كل درجة ${SECONDS} ثوانٍ، قراءة فقط\n`);

const report = [];
for (const load of LOADS) {
  console.log(`── ${load.id}: ${load.what}`);
  console.log("   تزامن   طلب/ثانية    p50      p95      p99     خطأ");
  let best = { rps: 0 }, knee = null;

  for (const conc of STEPS) {
    const r = await level(load.url, conc);
    console.log(
      `   ${String(conc).padStart(5)}   ${r.rps.toFixed(1).padStart(9)}` +
      `   ${Math.round(r.p50).toString().padStart(5)}ms` +
      `   ${Math.round(r.p95).toString().padStart(5)}ms` +
      `   ${Math.round(r.p99).toString().padStart(5)}ms` +
      `   ${r.errPct.toFixed(1).padStart(5)}%`
    );
    if (r.rps > best.rps) best = r;
    // الركبة: المردود ما عاد يزيد رغم مضاعفة التزامن ⇒ المسبح امتلأ
    if (!knee && r.rps < best.rps * 1.05 && conc > 2) knee = r;
    if (r.errPct > ABORT_ERR_PCT || r.p95 > ABORT_P95_MS) {
      console.log(`   ⚠ توقّفنا هنا — ${r.errPct > ABORT_ERR_PCT ? "الخطأ تجاوز الحدّ" : "الزمن تجاوز الحدّ"}. ما ندفع أبعد على قاعدةٍ حيّة.`);
      break;
    }
  }
  report.push({ load, best, knee: knee ?? best });
  console.log("");
}

/* ── الجواب المحسوب: ألفا طلبٍ متزامن ────────────────────────────────────*/
console.log("── الخلاصة ─────────────────────────────────────────────────────");
for (const { load, best, knee } of report) {
  const rps = best.rps;
  const clear = rps > 0 ? 2000 / rps : Infinity;
  const verdict = clear <= 3 ? "✅ يعبرها بسهولة"
    : clear <= 12 ? "⚠️ يعبرها بتأخير محسوس"
    : "❌ أغلبها تنتهي مهلتها (مهلة التطبيق ١٢ ثانية)";
  console.log(
    `\n${load.id}:\n` +
    `   أعلى مردود قيسَ:  ${rps.toFixed(0)} طلب/ثانية عند تزامن ${best.conc}\n` +
    `   الركبة (امتلاء المسبح): تزامن ~${knee.conc}\n` +
    `   ٢٠٠٠ طلب متزامن يخلصون بـ ~${clear === Infinity ? "—" : clear.toFixed(1)} ثانية  →  ${verdict}`
  );
}
console.log(
  "\nملاحظة: المردود عند الحمل الثقيل هو الرقم الذي يهمّ — التقارير هي التي\n" +
  "تحجز المسبح طويلاً، لا الشاشات الخفيفة. وإذا انهار الثقيل قبل الخفيف\n" +
  "بكثير، فالمشكلة بحجم الاستعلام لا بعدد المستخدمين."
);
