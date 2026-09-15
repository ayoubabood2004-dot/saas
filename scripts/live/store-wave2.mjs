/* ============================================================================
 * فحصٌ حيٌّ لموجة ٢ — متصفّحٌ حقيقيّ على الوضع التجريبيّ.
 *
 * ليس جزءاً من `npm run build` (يحتاج خادمَ تطوير ومتصفّحاً)، ويُشغَّل يدوياً:
 *     npm run dev -- --port 5199 --strictPort   # بطرفٍ آخر
 *     npm run live:store
 *
 * ولماذا حيٌّ لا ساكن: ثلاثةٌ من عيوب هذه الموجة لا يراها فحصُ نصٍّ إطلاقاً —
 * السلّةُ تُقصّ لأن المؤثّرَ يجري قبل اكتمال الكتلوج، والرايةُ تعلق لأن صفحةً
 * مكرّرةً تُبقيها مرفوعة، والعددُ يكذب لأنه يُحسب فوق قائمةٍ ناقصة. كلُّها
 * أحداثُ زمنِ تشغيل.
 *
 * ومقيسٌ بالتجربة: بإرجاع شرط تنظيف السلّة إلى ما كان، تبقى السلّةُ بسطرٍ
 * واحدٍ من اثنين — والفحصُ يحمرّ. وأوّلُ صياغةٍ لهذا الزرع كانت **فارغة**:
 * الأسماءُ تُفرز معجمياً فـ«منتج رقم 28» يقع داخل الصفحة الأولى، فيمرّ الفحصُ
 * بسببٍ خاطئ. الأسماءُ الآن مصفَّرةُ البادئة فالمرتبةُ معلومة.
 * ==========================================================================*/
/* playwright مركَّبٌ عالمياً لا بتبعيّات المشروع (المتصفّحُ مهيّأٌ بالبيئة
 * تحت PLAYWRIGHT_BROWSERS_PATH). فالاستيرادُ بالاسم يفشل حين يُشغَّل الملفُّ
 * من جذر المشروع — نجرّب الاسمَ أوّلاً ثم المسارَ العالميّ، ونقول السببَ
 * صراحةً إن غاب بدل أن نسقط برسالةِ node خام. */
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* نجرّب التالي */ }
}
if (!chromium) {
  console.error("✗ live-store: ما لكيت playwright. ركّبه: npm i -D playwright  (أو شغّله من بيئةٍ فيها النسخةُ العالمية)");
  process.exit(1);
}
const B = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL = "http://localhost:5199";
const DB_KEY = "vp_demo_db_v13";
let fails = 0, passes = 0;
const check = (n, c, d = "") => { if (c) { passes++; console.log("   ✓ " + n); } else { fails++; console.error("   ✗ " + n + (d ? " — " + d : "")); } };

const browser = await chromium.launch({ executablePath: B });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const calls = [], netFails = [];
page.on("console", (m) => { if (m.type() === "error") calls.push(m.text()); });
page.on("requestfailed", (r) => netFails.push(r.url().slice(0, 90) + " :: " + (r.failure()?.errorText ?? "")));

await page.goto(URL + "/", { waitUntil: "domcontentloaded" });
await page.evaluate((KEY) => {
  let db = {};
  try { db = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { db = {}; }
  db.products = Array.from({ length: 30 }, (_, i) => ({
    // أسماءٌ مصفَّرةُ البادئة: الفرزُ معجميّ، فاسمٌ بلا تصفيرٍ يضع «رقم 28»
    // داخل الصفحة الأولى ويجعل فحصَ السلّة فارغاً — يمرّ بسببٍ خاطئ.
    id: "p" + i, clinic_id: "c1", name: "منتج " + String(i + 1).padStart(2, "0"), category: "food",
    sell_price: 1000 + i, stock: 10, store_visible: true, store_featured: false,
  }));
  db.storeProfile = { clinic_id: "c1", slug: "livetest", enabled: true, delivery_fee: 0, min_order: 0, bio: null, whatsapp: null, updated_at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(db));
  localStorage.setItem("vp_store_cart_livetest", JSON.stringify([{ id: "p0", qty: 1 }, { id: "p29", qty: 2 }]));
}, DB_KEY);

await page.goto(URL + "/s/livetest", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const more = page.locator("button", { hasText: /عرض المزيد/ });
const hasMoreBtn = await more.count();
check("زرُّ «عرض المزيد» ظاهرٌ مع ٣٠ منتجاً (PAGE=24)", hasMoreBtn > 0, `count=${hasMoreBtn}`);

const beforeText = await page.locator("body").innerText();
check("العددُ لا يُعرض قبل اكتمال التشكيلة", !/\d+\s*منتج\b/.test(beforeText.split("عرض المزيد")[0]),
      beforeText.match(/\d+\s*منتج\b/)?.[0] ?? "");

if (hasMoreBtn > 0) { await more.first().click(); await page.waitForTimeout(1200); }
const afterText = await page.locator("body").innerText();
check("وبعد التحميل يظهر العدد", /٣٠|30/.test(afterText), afterText.match(/[\d٠-٩]+\s*منتج/)?.[0] ?? "لا عدد");

const cart = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("vp_store_cart_livetest") ?? "[]"); } catch { return []; } });
check("سطرُ السلّة من الصفحة الثانية (منتج 30، مرتبة ٢٩) ما انقصّ", cart.some((l) => l.id === "p29"), JSON.stringify(cart));

check("الرايةُ نزلت بعد آخر صفحة (لا حلقة)", (await page.locator("button", { hasText: /عرض المزيد/ }).count()) === 0);

/* التأكيدُ على أخطاء الكونسول وحدها — وهي إشارةُ المنتج. وفشلُ الشبكة يُطبع
 * معلومةً لا حكماً: خطوطُ غوغل محجوبةٌ بشهادة الوكيل بهذه البيئة، ووحداتُ
 * Vite تُلغى بالتنقّل (ERR_ABORTED) — أثرُ بيئةٍ لا عطب. وإخفاؤهما داخل مُصفٍّ
 * نصّيٍّ واسع كان سيبتلع خطأً حقيقياً معهما. */
const real = calls.filter((x) => !/fonts\.(googleapis|gstatic)\.com/.test(x) && !/ERR_CERT_AUTHORITY_INVALID/.test(x));
check("ولا خطأ بالكونسول", real.length === 0, real.slice(0, 2).join(" | "));
console.log("   ℹ فشلُ شبكةٍ (بيئة، لا حكم):", netFails.length);

await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-store: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
