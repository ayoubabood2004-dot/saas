/* ============================================================================
 * حارسُ شاشة البيع ومستهلكات الخدمة (0252) — «المعرّفُ لا يتبدّل، والحالةُ تُفصل بسطرها».
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * سطرُ الخدمة صار يحمل للخادم `service_id` ومستهلكاتِ حالةٍ عُدّلت، والخادمُ يخصم بها المخزن. فكلُّ ثغرةٍ
 * هنا تخصم أو لا تخصم بصمت: بندٌ بلا service_id لا يُخصم له شيء، ومسحةٌ خلف الورقة تبيع علبةً انصرفت على
 * الحالة، وF2 خلفها يبيع والتعديلُ لم يُحفظ، وإعادةُ مفتاح سطرٍ تُسقط بندَ المختبر من تتبّعه ومن «امسح
 * الزبون»، وقصُّ «s:» من معرّف `s:<id>#k` يطلب خدمةً غيرَ موجودة، وشارةٌ على بندٍ بلا معرّف تعِد بخصمٍ لا
 * يقع، واستيرادٌ ثابتٌ لوحدةٍ جديدة يدفع اسمَها الإقلاع.
 *
 * بالنصّ (كـmed-entry-guard، على المصدر بلا تعليقات):
 *  ١) قائمةُ البيعة تحمل service_id لسطر الخدمة (بلا راجع وبمعرّفٍ uuid بنمط c_uuid الخادم نفسِه، يُقرأ من
 *     الهجرة) ومستهلكاتِه إن عُدّلت — ومعرّفٌ غيرُه يرفض به الخادمُ البيعةَ كلَّها (service_id_bad) فلا يُرسل؛
 *  ٢) الماسحُ يسكت والورقةُ مفتوحة: `|| !!consFor` قبل `|| medPickerOpen` مباشرةً؛
 *  ٣) معالجُ posV2: سطرُه الأوّل `if (medPickerOpen) return;` والثاني `if (consFor) return;`؛
 *  ٤) تتبّعُ المختبر يقرأ `l.serviceId` ولا قصَّ للمعرّف بالملفّ، وحالةٌ فُصلت لا تكرّر قيداً؛
 *  ٥) الشارةُ بشرط خدمةٍ بمعرّفٍ بلا راجع، بنصّ `pos.cat.consumables`، ونقطتُها لما عُدّل — بسطرٍ تحت الاسم لا
 *     داخل سطره المقصوص (`truncate`: بسلّةٍ عرضُها ٣٦٢ كانت تُقصّ كلُّها، مقيسٌ بالمتصفّح)، وتنتظر الملخّصَ على
 *     العاديّ (سطرٌ يظهر ويختفي يقفز بالسلّة)، والملخّصُ بمهلةٍ فلا ينتظر للأبد؛
 *  ٦) لا كتابةَ تعيد مفتاحَ سطر: المعرّفُ الجديد للنسخة المفصولة وحدها (copyId)؛
 *  ٧) لا استيرادَ ثابتاً لـconsumption ولا consumptionApi ولا ConsumablesSheet (ولا نوعاً) — import() وحده،
 *     والورقةُ والإشعارُ بـpage(…, ["rcp"]) داخل LoadBoundary + Suspense، ونطاقُ rcp بقاعدة
 *     i18n-owned-guard نفسِها (checkOwned)؛
 *  ٨) شكلُ الإتمام المقفول باقٍ: القفلُ ← holdUpdates ← persistMedicalEntries ← finally؛
 *  ٩–١١) الإضافةُ من serviceLineId، وخصائصُ الورقة (الدور، الكلفة، «هالحالة بس»)، ومعاينةُ الربح؛
 *  ١٢) كلفةُ سطر المادّة (0255) من مرآة الخادم الوحيدة (productLineCostCents) بـimport("@/lib/consumption") مرّةً واحدة —
 *     لا حسابَ هنا — والمواضعُ التي تُنشئ الكلفة (المرتجع، الوزن، العلبة/المفرد، التبديل) تمرّ من productLineCost.
 * وبالسلوك — SaleBuilder.tsx نفسُه محزوماً ببدائلَ تُولَّد من سطور استيراده (نهجُ inventory-cas-test ح)،
 * ودوالُّه الصِّرفة تُصدَّر عند التحميل والملفُّ لا يُمسّ:
 *  أ) ٣ ⇐ ٢ + ١: التعديلُ على السطر الجديد وحده، والقديمُ بمعرّفه وكلِّ حقوله؛ و«كل حالات السطر» بمكانها؛
 *  ب) الإضافةُ تزيد السطرَ العاديّ — لا المعدَّل ولا بندَ المختبر — وتأخذ أصغرَ #k حرّ؛
 *  ج) المسودّةُ تحفظ المستهلكات وترجعها، والمكسورُ يسقط كلُّه ولا يُسقط الشاشة؛
 *  د) الشاشةُ مرسومةً (react-mini): الشارةُ ونقطتُها، الورقةُ بخصائصها ودورِها وقطعتِها الكسولة، الماسحُ
 *     مطفأٌ تحتها، الحفظُ يفصل ويغلق، الإتمامُ يرسل service_id والمستهلكات، والإشعارُ بعد البيعة لمن فيها ما
 *     يُخصم، والربحُ «—» ما دامت الكلفةُ لا تُعرف، وحالةٌ فُصلت لا تكرّر قيدَ المختبر ولا العملية، وخدمةٌ بمعرّفٍ
 *     ليس uuid (كتالوجٌ محلّيٌّ من ١٥–٢٢/٦) تُباع بلا service_id ولا شارة ولا كلفةَ مواد ولا إشعار، والربحُ — معاينةً
 *     وبشاشة «تمّ» (ربحُ الخادم وفيه كلفةُ المواد) — لمن يرى الأرباح والجهازُ غيرُ مقيَّد وحده؛
 *  هـ) كلفةُ سطر المادّة كما يكتبها الخادم (0255 `_product_line_cost`)، مقيسةً بمرآةٍ هنا مستقلّةٍ عن consumption.ts (من
 *     النصّ العشريّ بأعدادٍ صحيحة): المتوسّطُ حاضرٌ وغائبٌ وصفرٌ وسالب، والمفردُ بقسمةٍ لا تنتهي ونصفِ فلس، والحقلُ وما
 *     لا يعرفه الجهاز بكلفة الجهاز؛ ثم بالشاشة: كلُّ موضعٍ يُنشئ الكلفة، والمسودّةُ القديمة، والقائمةُ حين تتحدّث، وكلُّ
 *     سطرٍ بقائمة البيعة بكميّته وstock_qty كما أُرسلا، ومعاينةُ الربح — و«—» حين لا يصل الحساب (فاشلاً أو بالطريق)، والفتحةُ
 *     التالية تعيده؛ وسطرُ مفردٍ قاسمُه (unitsPerBox السطر، قاسمُ stock_qty بالإتمام) غيرُ قاسم المادّة اليوم بما يكلّفه الخادم؛
 *  و) ملخّصُ الوصفات يتجدّد بتابٍ مفتوحٍ طولَ النهار لا مرّةً للتركيب: مع كلّ قائمةٍ تصل، ومع كلّ بيعةٍ تبدأ، وعند الإتمام —
 *     بنافذة طزاجةٍ لا تعيد القراءةَ بلا داعٍ، والفاشلُ يُعاد بأوّل فرصة، والقديمُ معروضٌ حتى يصل الجديد، وجوابٌ يصل بعد شاشة
 *     «تمّ» يُركّب إشعارَها (الساعةُ تتقدّم بيد الفحص: Date.now)؛
 *  ز) بيعةٌ فيها سطرُ مادّةٍ تقرأ دفترَها بشاشة «تمّ» (0253 لا يقصّ عند الصفر: قائمةٌ قديمة تنزل بالرصيد تحته) — والراجعُ لا؛
 *  ح) سطرٌ بلا مادّة ليس خدمة (دواءٌ من تبويب الأدوية، أجرةُ التوصيل) يُرسل service_id: null صريحاً — غيابُ المفتاح يقرؤه الخادمُ
 *     جهازاً ما تحدّث فيصنّفه بالاسم (old_device) — وبندُ خدمةٍ بلا معرّفٍ يعرفه الخادم يبقى بلا المفتاح؛
 *  ط) قطعةُ الورقة والإشعار وقاموسُ rcp تُطلب مع الشاشة (تسخينٌ لا يرسم شيئاً، وفشلُه صامتٌ ويُعاد بالفتحة التالية) — لا أوّلَ
 *     مرّةٍ بعد البيعة، بتبويبٍ حُذفت قطعتُه القديمة فيحمّله appUpdate ويرمي إيصالَ البيعة.
 *
 *   SB_SRC=<نسخة> يفحص نسخةً أخرى من الشاشة (قبل تصليح) والملفُّ لا يُمسّ — كلُّ فحصٍ جديد يسقط على ما قبله.
 *
 * ويقول ما فحص، ويفشل على صفر. و`--mutants` يبني الشاشةَ بطفراتٍ مسمّاة (نصٌّ يُستبدل بالذاكرة) ويشترط أن
 * تُسقط كلُّ طفرةٍ فحصاً واحداً على الأقلّ — وطفرةٌ لا يجد نصُّها مكانَه تُفشل كذلك، وطفرةٌ لم يُسقطها إلا فشلُ الحزمة
 * أو خطأٌ رُمي أو خطأُ رسم (`infra`) طفرةٌ مكسورة لا ممسوكة: نصٌّ لا يُحزم «يُمسَك» بلا أن يُفحص شيء.
 *
 *   node scripts/salebuilder-cons-guard.mjs
 *   node scripts/salebuilder-cons-guard.mjs --mutants
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkOwned } from "./i18n-owned-guard.mjs";

const SB_PATH = "src/components/retail/SaleBuilder.tsx";
const SHEET_PATH = "src/components/retail/ConsumablesSheet.tsx";
const SRC = readFileSync(process.env.SB_SRC || SB_PATH, "utf8").replace(/\r\n/g, "\n");
if (process.env.SB_SRC) console.log(`   (SaleBuilder من ${process.env.SB_SRC})`);
const SHEET = readFileSync(SHEET_PATH, "utf8");
const J = (x) => JSON.stringify(x);

/** النصُّ بلا تعليقات بنفس الطول — شرحٌ يذكر consFor أو service_id ليس شِفرة (med-entry-guard). */
const strip = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));

/* ── بالنصّ ───────────────────────────────────────────────────────────────── */
function textChecks(src) {
  const out = [];
  const ck = (name, ok, detail = "") => out.push({ name, ok: !!ok, detail });
  const code = strip(src);

  const coAt = code.indexOf("const checkout = async (ack: CheckoutAck = {})");
  const mapAt = coAt < 0 ? -1 : code.indexOf("const items: CheckoutItem[] = cart.map((l) => {", coAt);
  const itemsMap = mapAt < 0 ? "" : code.slice(mapAt, code.indexOf("\n      });", mapAt));
  const spread = /\.\.\.\(sid \? \{ service_id: sid, \.\.\.\(Array\.isArray\(l\.consumables\) \? \{ consumables: l\.consumables \} : \{\}\) \} : ([^\n]*?)\{\}\),/.exec(itemsMap);
  ck("١) قائمةُ البيعة: سطرُ الخدمة (بلا راجع وبمعرّفٍ يعرفه الخادم) يحمل service_id، ومستهلكاتِ الحالة إن عُدّلت",
    /const sid = cloudServiceId\(l\);/.test(itemsMap) && !!spread,
    itemsMap ? itemsMap.replace(/\s+/g, " ").slice(-240) : "ما لقيتُ قائمةَ البيعة داخل checkout");
  /* غيابُ المفتاح يقرؤه الخادمُ «جهازاً ما تحدّث» فيصنّف السطرَ بالاسم (0252 _consumption_plan: old_device) — لقاحٌ من تبويب
   * الأدوية اسمُه اسمُ خدمةٍ لها وصفة كان يُقال عنه «ما انخصمت مستهلكاتها، حدّث الأجهزة» بلا علاقة. والبندُ الخدميّ بلا معرّف
   * (مختبرٌ ما طابق، كتالوجٌ قديم) خدمةٌ فعلاً: يبقى بلا المفتاح فيقول الاسمُ عنه. */
  ck("  وسطرٌ بلا مادّة ليس خدمة (دواءٌ أو لقاحٌ من تبويب الأدوية) يقولها بـservice_id: null صريحاً — وبندُ الخدمة بلا معرّف بلا المفتاح",
    spread?.[1] === '!l.product_id && l.kind !== "service" ? { service_id: null } : ', J(spread?.[1] ?? null));
  /* ومعرّفُ الخدمة يُرسل بنمط الخادم نفسِه: c_uuid بـ_consumption_plan يُقارَن بـ`~*` (بلا حالة) — نمطٌ يُقرأ من آخر
   * تعريفٍ بالهجرات لا يُنسخ هنا، فإن تغيّر الخادمُ سقط الفحص. */
  const planSql = ["0255_moving_average.sql", "0254_waste_voucher.sql", "0253_stock_truth_fixes.sql", "0252_service_consumption.sql"]
    .map((f) => { try { return readFileSync(`supabase/migrations/${f}`, "utf8"); } catch { return ""; } })
    .find((txt) => /create or replace function public\._consumption_plan\(/.test(txt)) ?? "";
  const planBody = planSql.slice(planSql.lastIndexOf("create or replace function public._consumption_plan("));
  const sqlUuid = /c_uuid\s+constant text := '([^']+)';/.exec(planBody)?.[1] ?? null;
  const sqlCaseless = /v_raw !~\* c_uuid then\s+raise exception 'service_id_bad'/.test(planBody);
  const gate = /const SVC_UUID = \/([^/]+)\/i;\nfunction cloudServiceId\(l: Line\): string \| null \{\n {2}return l\.kind === "service" && !l\.ret && !!l\.serviceId && SVC_UUID\.test\(l\.serviceId\) \? l\.serviceId : null;\n\}/.exec(code);
  ck("  والمعرّفُ بنمط الخادم (c_uuid، بلا حالة) — وما سواه لا يُرسل: service_id_bad يرفض البيعةَ كلَّها",
    !!sqlUuid && sqlCaseless && !!gate && gate[1] === sqlUuid, J({ sql: sqlUuid, caseless: sqlCaseless, client: gate?.[1] ?? null }));

  const scan = /useBarcodeScanner\(handleScan,\s*\{\s*disabled:([^}]*)\}\);/.exec(code);
  ck("٢) الماسحُ يسكت والورقةُ مفتوحة: `|| !!consFor` قبل `|| medPickerOpen` مباشرةً، والشكلُ ينتهي بـmedPickerOpen })",
    !!scan && /\|\| !!consFor \|\| medPickerOpen\s*$/.test(scan[1]), scan ? scan[1].trim() : "ما لقيتُ useBarcodeScanner(handleScan, …)");

  const keyFn = /if \(!posV2\) return;\s*const onKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/.exec(code)?.[1] ?? "";
  ck("٣) معالجُ posV2: medPickerOpen أوّلاً، و`if (consFor) return;` سطراً ثانياً (F2 و«/» لا يمسّان السلّة خلف الورقة)",
    /^\s*if \(medPickerOpen\) return;\s*if \(consFor\) return;/.test(keyFn) && /"F2"/.test(keyFn),
    keyFn.trim().split("\n").slice(0, 2).map((l) => l.trim()).join(" ⏎ "));

  const labAt = code.indexOf('if (l.kind !== "service" || !l.petId || l.id.startsWith("s:lab:")) continue;');
  const labLoop = labAt < 0 ? "" : code.slice(labAt, code.indexOf("void repo.addLabResult(", labAt));
  ck("٤) تتبّعُ المختبر يعرف الخدمةَ بـl.serviceId (سطرُها الثاني `s:<id>#k`)، ولا قصَّ لمعرّف سطرٍ بالملفّ",
    /const sid = l\.serviceId \?\? "";/.test(labLoop) && !/\.id\.slice\(2\)/.test(code) && !/\.id\.startsWith\("s:"\)\s*\?/.test(code),
    labLoop.replace(/\s+/g, " ").slice(0, 200));
  ck("  وحالةٌ فُصلت عن سطرها لا تكرّر «بانتظار النتائج» ولا العملية (repeatsCase بالحلقتين)",
    /if \(repeatsCase\(cart, l\)\) continue;/.test(labLoop)
    && /if \(l\.kind !== "service" \|\| repeatsCase\(cart, l\)\) return \{ l, m: null \};/.test(code));

  const chipAt = code.indexOf("data-conschip={l.id}");
  const chipFrom = chipAt < 0 ? -1 : code.lastIndexOf("{!!cloudServiceId(l)", chipAt);
  const chipHead = chipFrom < 0 ? "" : code.slice(chipFrom, chipAt);
  const chipBody = chipAt < 0 ? "" : code.slice(chipAt, code.indexOf("</button>", chipAt));
  ck("٥) الشارةُ بشرط خدمةٍ بمعرّفٍ يعرفه الخادم بلا راجع (وملخّصٍ وصل بوصفة أو فشل، أو تعديلٍ قائم)، بنصّ pos.cat.consumables، ونقطتُها لما عُدّل",
    /^\{!!cloudServiceId\(l\) && \(consOn \|\| Array\.isArray\(l\.consumables\)\) && \(\s*<div className="mt-0\.5 flex items-center gap-1">\s*<button type="button" $/.test(chipHead)
    && /onClick=\{\(\) => openCons\(l\.id\)\}/.test(chipBody) && /\{t\("pos\.cat\.consumables", /.test(chipBody)
    && /\{Array\.isArray\(l\.consumables\) && <span data-consdot /.test(chipBody)
    && /const consOn = !!consSum && \("error" in consSum \|\| Object\.keys\(consSum\.data\)\.length > 0\);/.test(code),
    chipHead.replace(/\s+/g, " "));
  /* وبسطرٍ تحت الاسم لا داخله: سطرُ الاسم `truncate` (overflow: hidden)، وبسلّةٍ عرضُها ٣٦٢ (١٣٦٦ والقائمةُ مفتوحة) كان
   * عمودُ الاسم ١٣٢ والشارةُ بعد «تعقيم ذكر» و«خدمة» تبدأ خارجه — مقصوصةٌ كلُّها: لا تُرى ولا تُضغط ولا نقطتُها (مقيسٌ
   * بالمتصفّح، getBoundingClientRect). الرسمُ هنا بلا قياس، فالفحصُ بالنصّ: الشارةُ بعد إغلاق سطر الاسم لا قبله. */
  const nameRowAt = code.indexOf('<p className={cn("flex items-center gap-1.5 truncate font-bold text-ink"');
  const nameRowEnd = nameRowAt < 0 ? -1 : code.indexOf("</p>", nameRowAt);
  ck("  والشارةُ بسطرٍ تحت الاسم لا داخل سطره المقصوص (truncate) — هناك كانت تُقصّ فلا تُرى ولا تُضغط",
    nameRowAt > 0 && chipFrom > nameRowEnd && !code.slice(nameRowAt, nameRowEnd).includes("data-conschip"), J({ nameRowAt, nameRowEnd, chipFrom }));
  ck("  وملخّصُ الوصفات بمهلة: نداءٌ عالق (لا مهلةَ fetch عامّة) يصير فشلاً يُقال — شارةٌ على كلّ خدمة وإعادةٌ بالضغطة — لا انتظاراً بلا شارة",
    /\.then\(\(m\) => withTimeout\(m\.consumptionApi\.recipeSummary\(\), \d{4,5}\)\)/.test(code));

  const fnAt = code.indexOf("function consSaved(");
  const saved = fnAt < 0 ? "" : code.slice(fnAt, code.indexOf("\n}\n", fnAt));
  const scAt = code.indexOf("const saveCons = (");
  const saveCons = scAt < 0 ? "" : code.slice(scAt, code.indexOf("\n  };", scAt));
  const idWrites = [...(saved + saveCons).matchAll(/\bid:\s*(?!string\b)[\w.`${}]+|\.id\s*=(?!=)/g)].map((m) => m[0]);
  ck("٦) لا كتابةَ تعيد مفتاحَ سطرٍ قائم: المعرّفُ الجديد للنسخة المفصولة وحدها (copyId)، والقديمُ بمعرّفه",
    saved !== "" && saveCons !== "" && idWrites.length === 2 && idWrites.every((w) => /^id:\s*copyId$/.test(w))
    && /out\.splice\(at, 1, \{ \.\.\.l, qty: l\.qty - 1 \}, withCons\(\{ \.\.\.l, id: copyId, qty: 1 \}\)\);/.test(saved)
    && /onSave=\{\(next, est, scope\) => saveCons\(l\.id, next, est, scope\)\}/.test(code), J(idWrites));

  const statics = [...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1])
    .filter((s) => /(^|\/)(consumption|consumptionApi|ConsumablesSheet)$/.test(s));
  ck("٧) لا استيرادَ ثابتاً لـconsumption ولا consumptionApi ولا ConsumablesSheet (ولا نوعاً) — import() وحده",
    statics.length === 0 && !/\brequire\(/.test(code), statics.join(" · "));
  ck("  والبابُ بـimport(\"@/lib/consumptionApi\")، والورقةُ والإشعارُ بـpage(() => import(…), [\"rcp\"])",
    /import\("@\/lib\/consumptionApi"\)/.test(code)
    && /page\(\(\) => import\("@\/components\/retail\/ConsumablesSheet"\), \["rcp"\]\)/.test(code)
    && /page\(\(\) => import\("@\/components\/retail\/ConsumablesSheet"\)\.then\(\(m\) => \(\{ default: m\.ConsumptionNotice \}\)\), \["rcp"\]\)/.test(code));
  ck("  وكلتاهما داخل LoadBoundary + Suspense، و«أعد المحاولة» تصنع قطعةً جديدة",
    /<LoadBoundary scope="cons-sheet" onRetry=\{\(\) => \{ ConsSheetLazy = loadConsSheet\(\); setConsLazyTick\(\(n\) => n \+ 1\); \}\}>\s*<Suspense fallback=\{null\}>\s*<ConsSheetLazy\b/.test(code)
    && /<LoadBoundary scope="cons-notice" onRetry=\{\(\) => \{ ConsNoticeLazy = loadConsNotice\(\); setConsLazyTick\(\(n\) => n \+ 1\); \}\}>\s*<Suspense fallback=\{null\}>\s*<ConsNoticeLazy mode="sale" invoiceIds=\{\[done\.invoice\.id\]\} negFold=\{doneNegIds\} \/>/.test(code));
  const owned = checkOwned({ rcp: { owner: SHEET_PATH, with: [] } }, [{ rel: SB_PATH, text: src }, { rel: SHEET_PATH, text: SHEET }], "");
  ck("  ونطاقُ rcp بقاعدة i18n-owned-guard نفسِها: محمَّلٌ بـpage(…, [\"rcp\"]) هنا، ولا استيرادَ ثابتاً لمالكه، ولا مفتاحَ rcp.* بالشاشة",
    owned.length === 0, owned.join(" | "));

  const dlvAt = code.indexOf("const dlvStrip = ");
  const co = coAt < 0 || dlvAt < 0 ? "" : code.slice(coAt, dlvAt);
  const lockAt = co.indexOf("inFlightRef.current = true"), holdAt = co.indexOf("const releaseUpdates = holdUpdates();");
  const medAt = co.indexOf("persistMedicalEntries("), finAt = co.lastIndexOf("} finally {"), relAt = co.lastIndexOf("releaseUpdates();");
  ck("٨) الإتمامُ بشكله المقفول: القفلُ ← holdUpdates ← persistMedicalEntries ← finally يُفلت",
    lockAt > 0 && holdAt > lockAt && medAt > holdAt && finAt > medAt && relAt > finAt, J({ lockAt, holdAt, medAt, finAt, relAt }));
  ck("  والإشعارُ يُقرَّر قبل ختم البيعة مباشرةً (noticeLine: ما قد يُخصم له أو سطرُ مادّة)، والختمُ ومسحُ المسودّة كما هما",
    /setDoneCons\(cart\.some\(\(l\) => noticeLine\(l, consSum\)\)\);\s*setDone\(\{ invoice, items: invItems \}\);\s*clearSaleDraft\(draftScope\);/.test(co));
  ck("  وأجرةُ التوصيل (سطرٌ بلا مادّة ليس خدمة) تُرسل service_id: null صريحاً كسطر الدواء",
    /items\.push\(\{ product_id: null, name: t\("retail\.deliveryFeeLine", "أجرة توصيل"\),[^\n]*\bservice_id: null \}\);/.test(co));
  /* 0253 أزال القصَّ عند الصفر: سطرُ مادّةٍ من قائمةٍ قديمة (جهازٌ ثانٍ باع آخرَ علبة) أو من حوضٍ نفد ينزل بالرصيد تحت الصفر
   * والبيعةُ تمرّ — وقرارُ المالك (ب٢) «تكمل وتُقال بصوت». فالقراءةُ بعد البيعة لكلّ سطرِ مادّةٍ يخرج من الرفّ، لا للراجع. */
  ck("١٣) شاشةُ «تمّ» تقرأ الدفتر لما قد يُخصم له (consCandidate) ولسطر مادّةٍ يخرج من الرفّ — لا للراجع (يزيد الرصيد)",
    /function noticeLine\(l: Line, sum: ConsSummary \| null\): boolean \{\n {2}return consCandidate\(l, sum\) \|\| \(!!l\.product_id && !l\.ret\);\n\}/.test(code));
  /* ط) التسخين: القطعةُ وقاموسُها يُطلبان مع الشاشة (page بنطاق rcp — ensureOwned بالطريق نفسه) لا أوّلَ مرّةٍ بعد البيعة؛ ومكانُه
   * الشاشةُ نفسُها لا شاشةُ «تمّ» (هناك يكون الطلبُ الأوّل بعد البيعة — ما يُصلح هذا). */
  const doneAt = code.indexOf("  if (done) {\n    return (");
  const mainAt = doneAt < 0 ? -1 : code.indexOf("\n  return (\n    <>", doneAt);
  const warmAt = code.indexOf("<ConsWarmBoundary><Suspense fallback={null}><ConsWarmLazy /></Suspense></ConsWarmBoundary>");
  ck("١٤) قطعةُ الورقة والإشعار تُسخَّن مع الشاشة: page(…, [\"rcp\"]) يرجع مكوّناً لا يرسم شيئاً، بحارسٍ صامت، خارجَ شاشة «تمّ»",
    code.includes(`const loadConsWarm = () => page(() => ${WARM_IMPORT}, ["rcp"]);`) && /const ConsWarmDone = \(\) => null;/.test(code)
    && doneAt > 0 && mainAt > doneAt && warmAt > mainAt && code.split("<ConsWarmLazy").length - 1 === 1,
    J({ doneAt, mainAt, warmAt }));

  ck("٩) الإضافةُ تمرّ من serviceLineId على السلّة الحيّة، والسطرُ الجديد بمعرّفه هو",
    /const id = serviceLineId\(cartRef\.current, s\.id\);\s*return bump\(id, \(\) => \(\{ id, kind: "service",/.test(code));

  const sheetTag = /<ConsSheetLazy\b[\s\S]*?\/>/.exec(code)?.[0] ?? "";
  ck("١٠) الورقةُ: التعديلُ للطبيب أو المدير (role بمفتاح المدير الحيّ)، والكلفةُ لمن يرى الأرباح، و«هالحالة بس» من ٢",
    /canEdit=\{consCanEdit\}/.test(sheetTag) && /showCost=\{showProfit\}/.test(sheetTag) && /lineQty=\{l\.qty >= 2 \? l\.qty : 1\}/.test(sheetTag)
    && /onClose=\{\(\) => setConsFor\(null\)\}/.test(sheetTag) && /value=\{l\.consumables\}/.test(sheetTag) && /products=\{products\}/.test(sheetTag)
    && /const consCanEdit = effRole === "manager" \|\| effRole === "veterinarian";/.test(code)
    && /const \{ role: effRole, can \} = usePermissions\(\);/.test(code) && /const showProfit = can\("viewProfits"\) && !devRestricted;/.test(code),
    sheetTag.replace(/\s+/g, " ").slice(0, 220));

  ck("١١) معاينةُ الربح لمن يرى الأرباح، وبكلفة المستهلكات، و«—» ما دامت لا تُعرف (مستهلكاتٌ، أو سطرُ مادّةٍ بلا حساب الخادم)",
    /\{showProfit && <div data-profitpreview\b[^\n]*\{profitShown === null \? "—" : money\(profitShown\)\}<\/div>\}/.test(code)
    && /const profitShown = consCost === null \|\| lineCostUnknown \? null : profit - consCost;/.test(code) && !/\bmoney\(profit\)/.test(code));

  /* ١٢) كلفةُ سطر المادّة (0255) من مرآة الخادم الوحيدة بـimport() — قطعةُ البيع لا تستورد وحدةً جديدة ثابتاً (٧)، ولا
   * تقريبَ يُكتب هنا ثانيةً. والمواضعُ التي تُنشئ كلفةَ سطرٍ تمرّ منها كلُّها، ولا `unit_cost: p.purchase_price` بعد. */
  const loadAt = code.indexOf("function loadLineCost(");
  const loadFn = loadAt < 0 ? "" : code.slice(loadAt, code.indexOf("\n}\n", loadAt));
  const fnBody = (head, end) => { const at = code.indexOf(head); return at < 0 ? "" : code.slice(at, code.indexOf(end, at)); };
  const sites = {
    addReturn: fnBody("const addReturn = (p: Product", "\n    }, n);"),
    addWeightLine: fnBody("const addWeightLine = (p: Product", "\n  };"),
    addProduct: fnBody("const addProduct = (p: Product", "\n  };"),
    setSaleUnit: fnBody("const setSaleUnit = (id: string", "\n    }));"),
  };
  ck("١٢) كلفةُ سطر المادّة من مرآة الخادم (productLineCostCents) بـimport(\"@/lib/consumption\") مرّةً واحدة — لا حسابَ ثانٍ هنا",
    code.split('import("@/lib/consumption")').length - 1 === 1 && /m\.productLineCostCents\(/.test(loadFn) && /lineCostFn = \(p, per(, pack)?\) =>/.test(loadFn),
    loadFn.replace(/\s+/g, " ").slice(0, 200));
  ck("  وكلُّ موضعٍ يُنشئ كلفةَ سطر مادّة يمرّ من productLineCost (المرتجع، الوزن، العلبة/المفرد، التبديل) — لا بسعر الشراء خاماً",
    Object.values(sites).every((b) => /unit_cost[^\n]*productLineCost\(/.test(b)) && !/unit_cost: p\.purchase_price\b/.test(code) && !/unit_cost: startSub \? subCost/.test(code),
    J(Object.fromEntries(Object.entries(sites).map(([k, b]) => [k, /unit_cost[^\n]*productLineCost\(/.test(b)]))));
  return out;
}

/* ── بالسلوك: الحزمةُ ───────────────────────────────────────────────────────── */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const listeners = new Map();
globalThis.window = {
  localStorage: globalThis.localStorage, setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 900,
  addEventListener: (t, f) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
  removeEventListener: (t, f) => { listeners.get(t)?.delete(f); },
  dispatchEvent: (e) => { for (const f of listeners.get(e.type) ?? []) f(e); return true; },
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};
globalThis.document = globalThis.document ?? {
  activeElement: null, body: { style: {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { lang: "ar", dir: "rtl", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
/* ساعةٌ تتقدّم بيد الفحص (Date.now وحده — مؤقّتاتُ React بـperformance.now): تابُ كاشيرٍ مفتوحٌ ساعاتٍ بلا انتظارٍ حقيقيّ. */
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms) => { clockOffset += ms; };

const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); const s = typeof d === "string" ? d : (opt.defaultValue ?? k); return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); }`;
/** قواعدُ صِرفة تُحزم حقيقيّة؛ وكلُّ استيرادٍ آخر لـSaleBuilder.tsx بديل. */
const REAL = new Set(["react", "@/lib/utils", "@/lib/productCodes", "@/lib/errors", "@/lib/cartCap", "@/lib/cartReprice", "@/lib/retailBridge",
  "@/lib/saleCustomer", "@/lib/priceDraft", "@/lib/customerName", "@/lib/debt", "@/lib/medSale"]);
const SB = "globalThis.__sb";
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar", dir: () => "rtl" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Dialog = ({ open, title, children, footer, size, onClose, ...p }) => (open ? createElement("x-Dialog", p, children, footer) : null);
    export const useToast = () => ${SB}.toast;`,
  "@/lib/repo": `export const repo = new Proxy({}, { get: (_t, k) => ${SB}.repo[k] });
    export const resolveDiscount = (sub, type, v) => (type === "percent" ? Math.round(sub * v) / 100 : Math.min(sub, v));`,
  "@/contexts/AuthContext": `export const useAuth = () => ({ user: ${SB}.user });`,
  "@/hooks/usePermissions": `export const usePermissions = () => ${SB}.perm;`,
  "@/lib/managerOverride": `export const useOverride = () => ${SB}.ov;`,
  "@/lib/entitlements": "export const useEntitlements = () => ({ has: () => true });",
  "@/hooks/useBarcodeScanner": `export const useBarcodeScanner = (h, o) => { ${SB}.scanner = { h, o }; };`,
  "@/components/meds/MedPicker": "export const useMedPickerOpen = () => false;",
  "./ServiceQuickSelect": `import { createElement } from "react"; export const ServiceQuickSelect = (p) => { ${SB}.sqs = p; return createElement("x-ServiceQuickSelect", { flashId: p.flashId }); };`,
  "./CustomerSearch": `export const useCustomerSearch = () => ({ type() {}, focus() {}, blur() {}, cancel() {}, close() {}, move() {}, highlighted: () => null, open: false, rows: [] });
    export const CustomerDropdown = () => null; export const CustomerPetsStrip = () => null;`,
  "@/lib/services": `export const getServiceCatalog = () => ${SB}.catalog; export const findServiceByBarcode = () => null;`,
  "@/lib/promotions": "export const computePromotions = () => ({ applied: [], totalDiscount: 0 }); export const getPromoRules = () => [];",
  "@/lib/settings": `export const getDialCode = () => "+964"; export const getPreSalePrint = () => false; export const getResizableCart = () => false;
    export const getPosV2 = () => false; export const getPosCompact = () => false; export const getPosCustomerOpen = () => false; export const getClinicLogo = () => null;
    export const getClinicSocials = () => ({}); export const getClinicName = () => ""; export const getDeliveryZones = () => []; export const getQtyPromos = () => [];
    export const getExpiryWindows = () => ({ returnDays: 90, criticalDays: 30 });`,
  "@/lib/navFold": "export const useNavFolded = () => false; export const setNavFolded = () => {};",
  "@/lib/posLayout": `const L = { side: "end", cartZoom: 1, gridZoom: 1, wFrac: null, hFrac: null };
    export const loadPosLayout = () => ({ ...L }); export const savePosLayout = (p) => ({ ...L, ...p }); export const stepZoom = (z) => z;`,
  "@/lib/inflight": "export const holdAll = (xs) => Promise.all(xs); export const holdUpdates = () => () => {};",
  "@/lib/medSync": "export const persistMedicalEntries = async () => {};",
  "@/lib/saleDate": `export const canBackdate = () => false; export const checkSaleMoment = () => ({ ok: true, at: null }); export const saleTz = () => "Asia/Baghdad";`,
  "@/lib/backdate": `export const clockOf24 = () => "12:00";`,
  "./SaleDateBar": `export const SaleDateBar = () => null; export const saleDateMessage = () => "";`,
  "@/lib/staffNames": "export const matchStaffToUser = async () => null; export const resolveStaffName = async () => null;",
  "@/lib/priceSync": `export const PRICES_EVENT = "vp-prices-changed"; export const checkPriceEpoch = async () => null; export const priceGen = () => 0; export const servicesStaleNow = () => false;`,
  "@/lib/surgeryCatalog": `export const matchSurgeryService = () => null; export const isSurgeryCategoryName = (n) => n === "العمليات"; export const surgeryByRef = () => null;`,
  "@/lib/invoicePrint": `export const invoiceNo = (id) => "INV-" + String(id).slice(-4); export const openInvoicePrint = async () => true;`,
  "@/lib/branchStore": "export const branchStore = { branchForWrite: () => null };",
  /* `calls`: كم مرّةً طلب React القطعة (رسمُها الأوّل) — لا نداءاتُ الفحص المباشرة لـload. */
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load, ns) => { const e = { load, ns, calls: 0 }; (globalThis.__pages ||= []).push(e); return lazy(() => { e.calls++; return load(); }); };`,
  "@/components/LoadBoundary": `import { createElement } from "react";
    export const LoadBoundary = ({ children, onRetry, scope }) => createElement("x-LoadBoundary", { onRetry, scope }, children);`,
  /* الوحدةُ الكسولة نفسُها: الورقةُ والإشعارُ يكتبان خصائصهما لنقرأها. */
  "@/components/retail/ConsumablesSheet": `import { createElement } from "react";
    function ConsumablesSheetStub(p) { ${SB}.sheet = p; return p.open ? createElement("x-ConsSheet", { serviceId: p.serviceId }) : null; }
    ConsumablesSheetStub.__which = "sheet";
    export default ConsumablesSheetStub;
    export function ConsumptionNotice(p) { ${SB}.notice = p; return createElement("x-ConsNotice", { mode: p.mode }); }
    ConsumptionNotice.__which = "notice";`,
  "@/lib/consumptionApi": `export const consumptionApi = { recipeSummary: (...a) => ${SB}.recipeSummary(...a) };`,
  /* خاناتُ الطبيب (0258): قطعتُها وبابُها بديلان صامتان — هذا الحارسُ يقيس المستهلكات، وخاناتُ الطبيب يقيسها pos-tabs-test. */
  "@/components/retail/PosCustomTabs": "export const PosTabPills = () => null; export const PosTabGrid = () => null; export const PosTabEditor = () => null;",
  "@/lib/posTabsApi": "export const posTabsApi = { list: async () => [] };",
  /* البيعُ قبل الجرد (0266): مطفأٌ هنا — بابٌ بلا حالة، والشريحةُ والنافذةُ لا ترسمان (يفحصهما neg-stock-test). */
  "@/lib/negStockApi": `export const negKey = (u) => (u ?? "anon") + "|c1"; export const negSnap = () => ({ state: null, counted: new Set(), failed: false });
    export const subscribeNeg = () => () => {}; export const refreshNeg = async () => null; export const activeNow = () => false; export const liftable = () => false;
    export const daysLeft = () => 0; export const bigLifted = () => false; export const lastDayOf = (u) => new Date(u);
    export const negApi = { check: async () => ({ clinic: "c1", active: false, until: null, refused: [] }) };`,
  "@/components/negstock/NegStock": "export const NegBar = () => null; export const NegCheckoutDialog = () => null; export const NegStockCard = () => null;",
  /* نسبةُ الراجع (المالك ١٠/١١): قطعتُها بديلٌ صامت هنا (تُستورد بـimport() وحده فلا يولّدها البديلُ الآليّ) — يقيسها ret-pct-test. */
  "@/components/retail/RetPct": "export const RetModeBar = () => null; export const RetPureNote = () => null; export const RET_PCTS = [100];",
};
/** أسماءُ ما يستورده الملفّ من كلّ مُحدِّد (لا الأنواع) — لتوليد البديل. */
function importsOf(src) {
  const map = new Map();
  for (const m of src.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
    if (m[1]) continue;
    const names = map.get(m[3]) ?? new Set();
    for (const part of (/\{([\s\S]*)\}/.exec(m[2])?.[1] ?? "").split(",")) {
      const s = part.trim();
      if (s && !s.startsWith("type ")) names.add(s.split(/\s+as\s+/)[0].trim());
    }
    if (!m[2].trim().startsWith("{") && /^\s*\w+\s*(,|$)/.test(m[2])) names.add("default");
    map.set(m[3], names);
  }
  return map;
}
/** البديلُ المولَّد: مكوّنٌ يرسم أولادَه، وخطّافٌ يرجع كائناً، وثابتٌ صفر، ودالّةٌ لا تفعل شيئاً. */
function autoStub(spec, names) {
  if (spec === "lucide-react") return [...names].map((k) => `export const ${k} = () => null;`).join("\n");
  return ['import { createElement } from "react";', ...[...names].map((k) => {
    const v = /^use[A-Z]/.test(k) ? "() => ({})" : /^[A-Z][a-z]/.test(k) ? `(p) => createElement("x-${k}", p, p?.children)`
      : /^[A-Z_0-9]+$/.test(k) ? "0" : "() => undefined";
    return k === "default" ? `export default ${v};` : `export const ${k} = ${v};`;
  })].join("\n");
}
const EXPORTS = "serviceLineId, nextCaseId, consSaved, repeatsCase, caseBase, draftConsumables, draftLine, loadSaleDraft, saveSaleDraft, consCaseCost, consCandidate, noticeLine, productLineCost, loadLineCost, recostLines";
/** نصُّ تسخين القطعة بالشاشة — يُلفّ بخطّافٍ (`__warmImport`) يُفشله الفحصُ متى شاء كما يفشل تحميلُ قطعةٍ بالمتصفّح. */
const WARM_IMPORT = 'import("@/components/retail/ConsumablesSheet").then(() => ({ default: ConsWarmDone }))';
async function build(source) {
  const imports = importsOf(source);
  const fromSB = (importer) => /[\\/]src[\\/]components[\\/]retail[\\/]SaleBuilder\.tsx$/.test(importer ?? "");
  // ما ليس بالنسخة لا يُصدَّر (نسخةٌ قبل التصليح تُحزم فتسقط فحوصُها واحداً واحداً، لا الحزمةُ كلُّها).
  const names = EXPORTS.split(", ").filter((n) => new RegExp(`\\b(?:function|const|let)\\s+${n}\\b`).test(source));
  /* حسابُ كلفة السطر يُطلب بـimport(): هنا بخطّافٍ (`__consImport`) يرجع الوحدةَ الحقيقية (`__cons`) أو يفشل كما يفشل
   * تحميلُ قطعة — فيُرى الفشلُ وإعادتُه بالفتحة التالية بحزمةٍ واحدة. */
  const body = source.replace('import("@/lib/consumption")', "globalThis.__consImport()")
    .replace(WARM_IMPORT, 'globalThis.__warmImport(() => import("@/components/retail/ConsumablesSheet")).then(() => ({ default: ConsWarmDone }))');
  const built = await esbuild.build({
    stdin: {
      contents: `export * from "./${SB_PATH}";\nexport { isCustomerBound } from "./src/lib/saleCustomer.ts";\nexport { money } from "./src/lib/utils.ts";\nexport * as __cons from "./src/lib/consumption.ts";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
      resolveDir: process.cwd(), sourcefile: "salebuilder-cons-ui.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "salebuilder-cons",
      setup(b) {
        // الدوالُّ الصِّرفة غيرُ مُصدَّرة: تُصدَّر هنا عند التحميل، والملفُّ نفسُه لا يُمسّ.
        b.onLoad({ filter: /[\\/]src[\\/]components[\\/]retail[\\/]SaleBuilder\.tsx$/ }, () => ({ contents: `${body}\nexport { ${names.join(", ")} };\n`, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "sb-stub" };
          if (fromSB(a.importer) && !REAL.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "sb-stub" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "sb-stub" }, (a) => ({ contents: STUB[a.path] ?? autoStub(a.path, imports.get(a.path) ?? new Set()), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "salebuilder-cons-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  globalThis.__pages = [];
  try { return await import(pathToFileURL(file).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ── البيانات ───────────────────────────────────────────────────────────────── */
/* معرّفاتُ الخدمات uuid كمعرّفات clinic_services (a0a0… تعقيم، b0b0… فحص، 1ab0… CBC، 5e60… خصي، bad0… ملخّصٌ مكسور):
 * الخادمُ يرفض البيعةَ كلَّها على service_id ليس uuid، فالشاشةُ لا ترسله. و`svc_legacy01` معرّفٌ من كتالوج ١٥–٢٢/٦
 * (`uid("svc")`) بقي محلّياً — سطرُه يُباع بلا service_id ولا شارة ولا إشعار. */
const LEGACY = "svc_legacy01";
const CAT = {
  categories: [{ id: "c-gen", name: "عام" }, { id: "c-lab", name: "المختبر" }, { id: "c-srg", name: "العمليات" }],
  services: [
    { id: "a0a0a0a0-0000-4000-8000-00000000000a", category_id: "c-gen", name: "تعقيم", price: 25000, cost: 1000, surgery_ref: null },
    { id: "b0b0b0b0-0000-4000-8000-00000000000b", category_id: "c-gen", name: "فحص", price: 10000, cost: null, surgery_ref: null },
    { id: "1ab01ab0-0000-4000-8000-0000000001ab", category_id: "c-lab", name: "CBC", price: 15000, cost: 0, surgery_ref: null },
    { id: "5e60c000-0000-4000-8000-0000000005e6", category_id: "c-srg", name: "خصي", price: 50000, cost: 0, surgery_ref: null },
    { id: LEGACY, category_id: "c-gen", name: "حلاقة", price: 8000, cost: null, surgery_ref: null },
  ],
};
const SVC = Object.fromEntries(CAT.services.map((s) => [s.id, s]));
const SUM = { "a0a0a0a0-0000-4000-8000-00000000000a": { lines: 2, cost: 3000, broken: 0 }, "1ab01ab0-0000-4000-8000-0000000001ab": { lines: 1, cost: 500, broken: 0 }, "5e60c000-0000-4000-8000-0000000005e6": { lines: 1, cost: 0, broken: 0 } };
const E1 = [{ product_id: "p-gloves", qty: 2, unit: "sub" }];
const E2 = [{ product_id: "p-syr", qty: 1, unit: "stock" }];
/** سطرُ خدمةٍ كما يكتبه addService. */
const svcLine = (id, serviceId, o = {}) => ({
  id, kind: "service", name: serviceId ? SVC[serviceId].name : "تحليل غريب", barcode: null,
  unit_price: serviceId ? SVC[serviceId].price : 0, unit_cost: serviceId ? (SVC[serviceId].cost ?? 0) : 0,
  listAt: serviceId ? SVC[serviceId].price : undefined, priceManual: false, qty: 1, stock: null, product_id: null, subcategory: null,
  serviceId, petId: null, petName: null, surgeryCat: false, surgeryRef: null, ...o,
});
const draftOf = (cart, o = {}) => ({ cart, name: "", phone: "", salePets: [], discountType: "percent", discountValue: "", finalOverride: null, cashierId: null, ...o });
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const sameBut = (a, b, skip) => Object.keys({ ...a, ...b }).filter((k) => !skip.includes(k)).every((k) => J(a[k]) === J(b[k]));

/* موادُّ القائمة (0255): المتوسّطُ غيرُ سعر الشراء عمداً — بكلفة الجهاز القديمة كانت المعاينةُ تتبع آخرَ فاتورة شراء. */
const PRD = (o) => ({ barcode: null, sell_price: 1000, stock: 50, has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, farm_id: null, pooled: false, created_at: "2026-01-01", ...o });
const PA = PRD({ id: "pA", name: "أموكسي", purchase_price: 1250, avg_cost: 1171.428572, sell_price: 2000 });
const PB = PRD({ id: "pB", name: "سرنجات", purchase_price: 960, avg_cost: 1001.05, sell_price: 1400, stock: 5, has_sub_unit: true, units_per_box: 10, sub_unit_name: "سرنجة", sub_unit_price: 150 });
const PC = PRD({ id: "pC", name: "أمبولات", purchase_price: 1200, avg_cost: 1171.428572, sell_price: 1800, stock: 0.667, has_sub_unit: true, units_per_box: 3, sub_unit_name: "أمبولة", sub_unit_price: 700 });
const PD = PRD({ id: "pD", name: "دراي فود", purchase_price: 3000, avg_cost: 3333.333333, sell_price: 5000, stock: 20, sold_by_weight: true });
const PE = PRD({ id: "pE", name: "شامبو", purchase_price: 7.5, avg_cost: null, sell_price: 12, stock: 9 });
const PG = PRD({ id: "pG", name: "سعرٌ تالف", purchase_price: -50, avg_cost: null, sell_price: 100, stock: 9 });
const PF = PRD({ id: "pF", name: "علف الحقل", purchase_price: 500, avg_cost: 450, sell_price: 800, stock: 10, farm_id: "farm-1" });
const PH = PRD({ id: "pH", name: "قطرات", purchase_price: 800, avg_cost: 1171.428572, sell_price: 1500, stock: 6, has_sub_unit: true, units_per_box: 12, sub_unit_name: "قطرة", sub_unit_price: 150 });
const PJ = PRD({ id: "pJ", name: "حقن", purchase_price: 120, avg_cost: 128.17, sell_price: 200, stock: 5, has_sub_unit: true, units_per_box: 10, sub_unit_name: "حقنة", sub_unit_price: 25 });

/* مرآةُ `_product_line_cost` (0255) — مستقلّةٌ عن consumption.ts عمداً، من النصّ العشريّ بأعدادٍ صحيحة: الشاشةُ تحسب بتلك،
 * ومقارنتُها بنفسها لا تمسك خطأً فيها. */
const babs = (n) => (n < 0n ? -n : n);
/** x كما يقرؤه numeric مقرَّباً لـs منازل (النصفُ بعيداً عن الصفر) ← عددٌ صحيح ×10ˢ، من نصّه لا من عائمه. */
function scaled(x, s) {
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(x));
  if (!m || !(m[2] || m[3])) throw new Error(`scaled: ${x}`);
  const frac = m[3] ?? "";
  const digits = BigInt((m[2] || "") + frac || "0");
  const k = s - frac.length + Number(m[4] ?? 0);
  const v = k >= 0 ? digits * 10n ** BigInt(k) : (digits * 2n + 10n ** BigInt(-k)) / (2n * 10n ** BigInt(-k));
  return m[1] === "-" ? -v : v;
}
/** `_product_line_cost(clinic, product, qty, stock_qty, device)`: مادّةٌ لا يعرفها الخادم (`p` غائب) أو من الحقل ⇒ device كما
 *  هو؛ وإلا k = greatest(coalesce(avg_cost, purchase_price, 0), 0) بأعمدتها (٦ و٢ منازل)، والمفردُ (has_sub_unit و
 *  units_per_box > ٠ و stock_qty حاضرة و |round(stock_qty,3)| ≠ |round(qty,3)|) ⇒ _cons_round_div(k, units_per_box, 2)، وإلا round(k, 2). */
function portLineCost(p, qty, stockQty, device) {
  if (!p || p.farm_id) return device;
  const raw = p.avg_cost != null ? scaled(p.avg_cost, 6) : p.purchase_price != null ? scaled(p.purchase_price, 2) * 10_000n : 0n;
  const ku = raw > 0n ? raw : 0n;
  const upb = p.has_sub_unit && p.units_per_box != null ? scaled(p.units_per_box, 3) : 0n;
  const sub = upb > 0n && stockQty != null && babs(scaled(stockQty, 3)) !== babs(scaled(qty ?? 0, 3));
  // k ≥ ٠ بفلوسه: div(|n|·200 + |d|, 2|d|) بمقاييسه (ku ×10⁶، upb ×10³) = ⌊(ku + 5·upb) / (10·upb)⌋، وround(k, 2) = ⌊(ku + 5000) / 10⁴⌋.
  const cents = sub ? (ku + 5n * upb) / (10n * upb) : (ku + 5_000n) / 10_000n;
  return Number(cents) / 100;
}

/* ── أ–ج) الدوالُّ الصِّرفة ─────────────────────────────────────────────────── */
async function unitChecks(M, ck) {
  const ov = (id, sid, cons = E1, o = {}) => svcLine(id, sid, { consumables: cons, consEst: 100, ...o });
  // ب) أين تنزل الإضافة
  const L = M.serviceLineId;
  ck("ب) سلّةٌ فارغة ⇒ s:<id>", L([], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a");
  ck("  وسطرُها العاديّ يزيد", L([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a");
  ck("  وسطرٌ معدَّل لا يكبر ⇒ s:<id>#2", L([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("  و[] تعديلٌ أيضاً (لا شيء لهالحالة) ⇒ #2", L([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", [])], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("  وأوّلُ عاديٍّ بعد المعدَّل يزيد (#2)", L([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("  ومعدَّلان ⇒ #3", L([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), ov("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#3");
  ck("  وأصغرُ k حرّ لا آخرُه (#2 حرّ و#3 محجوز ⇒ #2)", L([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), ov("s:a0a0a0a0-0000-4000-8000-00000000000a#3", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("  وبندُ المختبر لا يُزاد أبداً (s:lab: بنفس الخدمة)", L([svcLine("s:lab:L1", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a"
    && L([svcLine("s:lab:L1", "a0a0a0a0-0000-4000-8000-00000000000a"), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("  وخدمةٌ أخرى لا تُحسب", L([svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b")], "a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a");
  ck("nextCaseId: الأصلُ قبل #k، وأصغرُ حرّ من ٢، وبادئةُ المختبر تبقى",
    M.nextCaseId([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")], "s:a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2"
    && M.nextCaseId([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a")], "s:a0a0a0a0-0000-4000-8000-00000000000a#2") === "s:a0a0a0a0-0000-4000-8000-00000000000a#3"
    && M.nextCaseId([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#3", "a0a0a0a0-0000-4000-8000-00000000000a")], "s:a0a0a0a0-0000-4000-8000-00000000000a") === "s:a0a0a0a0-0000-4000-8000-00000000000a#2"
    && M.nextCaseId([svcLine("s:lab:L1", "a0a0a0a0-0000-4000-8000-00000000000a")], "s:lab:L1") === "s:lab:L1#2");

  // أ) الفصل
  const pet = { petId: "pet-1", petName: "Luna" };
  const P = { id: "p:x", kind: "product", name: "شامبو", barcode: null, unit_price: 5000, unit_cost: 3000, qty: 1, stock: 4, product_id: "x", subcategory: null };
  const A = svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { qty: 3, ...pet, unit_price: 24000, priceManual: true });
  const B = svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b");
  const cart = [P, A, B].map((x) => Object.freeze({ ...x }));
  Object.freeze(cart);
  let r = M.consSaved(cart, "s:a0a0a0a0-0000-4000-8000-00000000000a", E1, 1500, "one");
  const a2 = r.cart.find((x) => x.id === "s:a0a0a0a0-0000-4000-8000-00000000000a"), c2 = r.cart.find((x) => x.id === "s:a0a0a0a0-0000-4000-8000-00000000000a#2");
  ck("أ) «هالحالة بس» على ×٣ ⇒ ٢ + ١ بالضبط، والنسخةُ بعده مباشرةً بمعرّفٍ جديد", J(r.cart.map((x) => x.id)) === J(["p:x", "s:a0a0a0a0-0000-4000-8000-00000000000a", "s:a0a0a0a0-0000-4000-8000-00000000000a#2", "s:b0b0b0b0-0000-4000-8000-00000000000b"])
    && a2?.qty === 2 && c2?.qty === 1 && r.copyId === "s:a0a0a0a0-0000-4000-8000-00000000000a#2", J(r.cart.map((x) => [x.id, x.qty])));
  ck("  والتعديلُ على الجديد وحده: القديمُ بلا مستهلكاتٍ ولا كلفة", !has(a2, "consumables") && !has(a2, "consEst") && J(c2?.consumables) === J(E1) && c2?.consEst === 1500);
  ck("  والقديمُ بمعرّفه وكلِّ حقوله (إلا الكمية)", sameBut(a2, A, ["qty"]));
  ck("  والنسخةُ: نفسُ الحيوان والسعرِ اليدويّ وكلِّ حقل إلا المعرّفَ والكميةَ والتعديل", sameBut(c2, A, ["id", "qty", "consumables", "consEst"]) && c2?.petId === "pet-1" && c2?.unit_price === 24000 && c2?.priceManual === true);
  ck("  والسلّةُ الواصلة لم تُمسّ (مجمَّدة)", cart.length === 3 && cart[1].qty === 3 && !has(cart[1], "consumables"));
  r = M.consSaved(cart, "s:a0a0a0a0-0000-4000-8000-00000000000a", E1, 1500, "line");
  ck("«كل حالات السطر»: على السطر نفسه، بنفس المعرّف والكمية، ولا سطرَ جديد", r.copyId === null && r.cart.length === 3
    && r.cart[1].id === "s:a0a0a0a0-0000-4000-8000-00000000000a" && r.cart[1].qty === 3 && J(r.cart[1].consumables) === J(E1) && r.cart[1].consEst === 1500 && sameBut(r.cart[1], A, ["consumables", "consEst"]));
  const back = M.consSaved(r.cart, "s:a0a0a0a0-0000-4000-8000-00000000000a", null, null, "line").cart[1];
  ck("  و«رجّع للوصفة» يشيل التعديلَ وكلفتَه", !has(back, "consumables") && !has(back, "consEst") && back.id === "s:a0a0a0a0-0000-4000-8000-00000000000a");
  r = M.consSaved([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")], "s:a0a0a0a0-0000-4000-8000-00000000000a", E1, 10, "one");
  ck("  و«هالحالة بس» بحالةٍ واحدة = السطرُ كلُّه (لا سطرَ بكمية صفر)", r.copyId === null && r.cart.length === 1 && r.cart[0].qty === 1 && J(r.cart[0].consumables) === J(E1));
  r = M.consSaved([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { qty: 1.5 })], "s:a0a0a0a0-0000-4000-8000-00000000000a", E1, 10, "one");
  ck("  وكميةٌ دون ٢ (١٫٥) حالةٌ واحدة كذلك", r.copyId === null && r.cart.length === 1 && r.cart[0].qty === 1.5 && J(r.cart[0].consumables) === J(E1));
  const plain3 = [svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { qty: 3 })];
  r = M.consSaved(plain3, "s:a0a0a0a0-0000-4000-8000-00000000000a", null, null, "one");
  ck("  و«هالحالة بس» بالوصفة على سطرٍ بالوصفة: لا شيءَ يُفصل", r.copyId === null && r.cart === plain3);
  r = M.consSaved([ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", E2, { qty: 3, consEst: 800 })], "s:a0a0a0a0-0000-4000-8000-00000000000a", null, null, "one");
  ck("  وبالوصفة على سطرٍ معدَّل: الحالةُ تعود للوصفة والباقي على تعديله", r.copyId === "s:a0a0a0a0-0000-4000-8000-00000000000a#2" && r.cart[0].qty === 2 && J(r.cart[0].consumables) === J(E2)
    && r.cart[0].consEst === 800 && r.cart[1].qty === 1 && !has(r.cart[1], "consumables") && !has(r.cart[1], "consEst"));
  r = M.consSaved([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a", { qty: 2 })], "s:a0a0a0a0-0000-4000-8000-00000000000a#2", E1, 10, "one");
  ck("  وفصلٌ من #2 ⇒ #3 بعده", J(r.cart.map((x) => [x.id, x.qty])) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#3", 1]]) && J(r.cart[2].consumables) === J(E1));
  const lab = svcLine("s:lab:L1", "1ab01ab0-0000-4000-8000-0000000001ab", { qty: 2 });
  r = M.consSaved([lab], "s:lab:L1", E1, 10, "one");
  ck("  وبندُ المختبر يبقى بندَ مختبر: النسخةُ s:lab:L1#2 فيتخطّاها تتبّعُ المختبر وتبقى مربوطةً بالزبون",
    r.copyId === "s:lab:L1#2" && r.cart[0].id === "s:lab:L1" && M.isCustomerBound(r.cart[0]) && M.isCustomerBound(r.cart[1]), J(r.cart.map((x) => x.id)));
  ck("  ومعرّفٌ غيرُ موجود لا يغيّر شيئاً", M.consSaved(cart, "s:none", E1, 1, "one").cart === cart);

  // تكرارُ القيد بعد الفصل
  const s1 = svcLine("s:1ab01ab0-0000-4000-8000-0000000001ab", "1ab01ab0-0000-4000-8000-0000000001ab", pet), s2 = svcLine("s:1ab01ab0-0000-4000-8000-0000000001ab#2", "1ab01ab0-0000-4000-8000-0000000001ab", pet), s3 = svcLine("s:1ab01ab0-0000-4000-8000-0000000001ab#3", "1ab01ab0-0000-4000-8000-0000000001ab", { petId: "pet-2" });
  ck("repeatsCase: حالةٌ فُصلت (نفسُ الأصل ونفسُ الحيوان) تتكرّر، وأوّلُ العائلة لا", M.repeatsCase([s1, s2], s2) && !M.repeatsCase([s1, s2], s1));
  const a1 = svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", pet);   // السطرُ نفسُه من السلّة (الحلقتان تمرّان على عناصرها)
  ck("  وحيوانٌ آخر قيدُه له، والترتيبُ لا يهمّ، وخدمةٌ أخرى لا", !M.repeatsCase([s1, s3], s3) && M.repeatsCase([s2, s1], s1) && !M.repeatsCase([s2, s1], s2)
    && !M.repeatsCase([s1, a1], a1));

  // ج) المسودّة
  mem.clear();
  const okLine = ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", E1, { consEst: 1500 });
  M.saveSaleDraft("c9", draftOf([okLine, svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b")]));
  const d = M.loadSaleDraft("c9");
  ck("ج) المسودّةُ تحفظ المستهلكات وكلفتَها وترجعها كما هي", J(d?.cart?.[0]?.consumables) === J(E1) && d.cart[0].consEst === 1500 && J(d.cart[1]) === J(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b")));
  const BAD = {
    "نصّ": "x", "كائن": { product_id: "p" }, "معرّفٌ رقم": [{ product_id: 5, qty: 1, unit: "stock" }], "معرّفٌ فارغ": [{ product_id: "", qty: 1, unit: "stock" }],
    "كميةٌ صفر": [{ product_id: "p", qty: 0, unit: "stock" }], "كميةٌ سالبة": [{ product_id: "p", qty: -1, unit: "stock" }],
    "كميةٌ نصّ": [{ product_id: "p", qty: "1", unit: "stock" }], "أربعُ مراتب": [{ product_id: "p", qty: 1.0005, unit: "stock" }],
    "فوق المليون": [{ product_id: "p", qty: 2e6, unit: "stock" }], "وحدةٌ غريبة": [{ product_id: "p", qty: 1, unit: "box" }],
    "بلا وحدة": [{ product_id: "p", qty: 1 }], "مادّةٌ مكرّرة": [{ product_id: "P1", qty: 1, unit: "stock" }, { product_id: "p1", qty: 2, unit: "sub" }],
    "٤١ مادّة": Array.from({ length: 41 }, (_, i) => ({ product_id: `p${i}`, qty: 1, unit: "stock" })), "مدخلٌ null": [null],
  };
  const dropped = Object.entries(BAD).filter(([, v]) => {
    mem.set("vp_sale_draft_c9", J(draftOf([{ ...svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { qty: 2 }), consumables: v, consEst: 99 }])));
    const l = M.loadSaleDraft("c9")?.cart?.[0];
    return !l || has(l, "consumables") || has(l, "consEst") || l.qty !== 2 || l.serviceId !== "a0a0a0a0-0000-4000-8000-00000000000a" || l.id !== "s:a0a0a0a0-0000-4000-8000-00000000000a";
  }).map(([k]) => k);
  ck(`  ومستهلكاتٌ مكسورة تسقط كلُّها مع كلفتها والسطرُ باقٍ (${Object.keys(BAD).length} صيغة)`, dropped.length === 0, dropped.join(" · "));
  mem.set("vp_sale_draft_c9", J(draftOf([{ ...okLine, consumables: [], consEst: 0 }, { ...okLine, id: "s:x", consEst: "x" }, { ...okLine, id: "s:y", consEst: -5 }])));
  const k = M.loadSaleDraft("c9")?.cart ?? [];
  ck("  و[] تبقى بكلفة صفر، وكلفةٌ مكسورة وحدها تسقط والتعديلُ باقٍ", J(k[0]?.consumables) === "[]" && k[0]?.consEst === 0
    && J(k[1]?.consumables) === J(E1) && !has(k[1], "consEst") && J(k[2]?.consumables) === J(E1) && !has(k[2], "consEst"));
  let threw = null, odd = null, junk;
  try { mem.set("vp_sale_draft_c9", J({ cart: "x" })); odd = M.loadSaleDraft("c9"); mem.set("vp_sale_draft_c9", "{oops"); junk = M.loadSaleDraft("c9"); } catch (e) { threw = e; }
  ck("  ومسودّةٌ بلا سلّةٍ مصفوفة أو نصٌّ مكسور لا يُسقطان شيئاً", threw === null && odd?.cart === "x" && junk === null, String(threw));

  // كلفةُ المعاينة والمرشَّح للإشعار
  const sum = { data: { "a0a0a0a0-0000-4000-8000-00000000000a": { cost: 3000 }, "bad0bad0-0000-4000-8000-000000000bad": { cost: "x" } } };
  const C = M.consCaseCost, K = M.consCandidate;
  ck("كلفةُ الحالة: الوصفةُ من الملخّص، والتعديلُ من الورقة، وبلا وصفة صفر، والمادّةُ صفر",
    C(svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), sum) === 3000 && C(ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", E1, { consEst: 1500 }), null) === 1500
    && C(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), sum) === 0 && C(P, null) === 0 && C(svcLine("s:lab:L9", null), null) === 0);
  ck("  وما لا يُعرف null: ملخّصٌ لم يصل أو فشل، وتعديلٌ بلا كلفة، وكلفةٌ مكسورة",
    C(svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), null) === null && C(svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), { error: new Error("x") }) === null
    && C(ov("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", E1, { consEst: undefined }), sum) === null && C(svcLine("s:bad0bad0-0000-4000-8000-000000000bad", "a0a0a0a0-0000-4000-8000-00000000000a", { serviceId: "bad0bad0-0000-4000-8000-000000000bad" }), sum) === null);
  ck("المرشَّحُ للإشعار: وصفةٌ بالملخّص، أو تعديل، أو خدمةٌ والملخّصُ مجهول — لا خدمةٌ بلا وصفة ولا مادّة ولا بندٌ بلا معرّف",
    K(svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), sum) && K(ov("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), { data: {} }) && K(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), null)
    && K(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), { error: 1 }) && !K(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), { data: {} }) && !K(P, null) && !K(svcLine("s:lab:L9", null), null));
  // معرّفٌ ليس uuid لا يعرفه الخادم (كتالوج ١٥–٢٢/٦): لا يُخطَّط أبداً — كلفتُه صفر لا «—»، ولا إشعارَ له، ولو حمل تعديلاً
  const old = svcLine(`s:${LEGACY}`, LEGACY), oldOv = svcLine(`s:${LEGACY}`, LEGACY, { consumables: E1, consEst: 700 });
  const UP = "A0A0A0A0-0000-4000-8000-00000000000A";
  ck("ومعرّفُ خدمةٍ ليس uuid (svc_…): كلفتُه صفر والملخّصُ مجهولٌ أو فاشل، ولا إشعار — ولا بتعديلٍ عليه",
    C(old, null) === 0 && C(old, { error: 1 }) === 0 && C(oldOv, sum) === 0 && !K(old, null) && !K(old, { error: 1 }) && !K(oldOv, sum),
    J({ cost: [C(old, null), C(old, { error: 1 }), C(oldOv, sum)], cand: [K(old, null), K(old, { error: 1 }), K(oldOv, sum)] }));
  ck("  وuuid بحروفٍ كبيرة يبقى معرّفاً (الخادمُ يقارن بلا حالة)",
    K(svcLine(`s:${UP}`, "a0a0a0a0-0000-4000-8000-00000000000a", { serviceId: UP }), null) && C(svcLine(`s:${UP}`, "a0a0a0a0-0000-4000-8000-00000000000a", { serviceId: UP }), null) === null);
  /* شاشةُ «تمّ» تقرأ الدفتر لما قد يُخصم له، ولسطر مادّةٍ يخرج من الرفّ: 0253 لا يقصّ عند الصفر، فقائمةٌ قديمة تنزل بالرصيد تحته
   * والإشعارُ يقوله (negatives تضمّ سطورَ المواد). والمرشَّحُ للاستهلاك (consCandidate) كما هو: سطرُ المادّة لا يُخصم له شيء. */
  const N = typeof M.noticeLine === "function" ? M.noticeLine : () => undefined;
  const RET = { ...P, id: "r:x", ret: true, stock: null };
  const MED = { id: "m:d1", kind: "med", name: "تعقيم", barcode: null, unit_price: 5000, unit_cost: 0, qty: 1, stock: null, product_id: null, subcategory: null };
  ck("noticeLine: سطرُ مادّةٍ يُقرأ دفترُه بعد البيعة أيّاً كان الملخّص، ومعه ما قد يُخصم له — لا الراجعُ ولا الدواءُ ولا خدمةٌ بلا وصفة ولا معرّفٌ ليس uuid",
    N(P, null) === true && N(P, { data: {} }) === true && N(P, { error: 1 }) === true && N(RET, null) === false && N(RET, { data: {} }) === false
    && N(svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), sum) === true
    && N(svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b"), { data: {} }) === false
    && N(MED, null) === false && N(old, null) === false && !K(P, null),
    J({ P: N(P, null), RET: N(RET, null), MED: N(MED, null), old: N(old, null) }));
}

/* ── هـ) كلفةُ سطر المادّة (0255): productLineCost وrecostLines ───────────────── */
async function costChecks(M, ck) {
  await M.loadLineCost?.();
  const PLC = typeof M.productLineCost === "function" ? M.productLineCost : () => undefined;
  const RC = typeof M.recostLines === "function" ? M.recostLines : () => undefined;
  const P0 = (o) => ({ id: "x", name: "x", purchase_price: 0, avg_cost: null, has_sub_unit: false, units_per_box: null, farm_id: null, ...o });
  const SUB = (avg, upb, o = {}) => P0({ avg_cost: avg, has_sub_unit: true, units_per_box: upb, ...o });
  const old = P0({ purchase_price: 980 });
  delete old.avg_cost;
  /** [الاسم، المادّة، مفرد؟، كلفة الجهاز، المتوقَّع، قاسمُ السطر؟] — والمتوقَّعُ المكتوبُ باليد يُطابَق بالمرآة قبل أن يُسأل عنه.
   *  قاسمُ السطر (unitsPerBox السطر، به يقسم الإتمامُ stock_qty) هو قاسمُ المادّة ما لم يُكتب — سطرٌ وُضع قبل أن تتبدّل وحدتُها. */
  const T = [
    ["هـ١) المتوسّطُ حاضر (علبة): ١١٧١٫٤٢٨٥٧٢ ⇒ ١١٧١٫٤٣ — لا آخرُ سعر شراء (١٢٥٠)", P0({ avg_cost: 1171.428572, purchase_price: 1250 }), false, 1250, 1171.43],
    ["  والمتوسّطُ غائب (null) ⇒ سعرُ الشراء بمنزلتين", P0({ purchase_price: 1250.5 }), false, 1250.5, 1250.5],
    ["  وصفٌّ قبل 0255 بلا حقل المتوسّط ⇒ سعرُ الشراء", old, false, 980, 980],
    ["  ومتوسّطٌ صفرٌ صريح كلفةٌ لا «مجهول» (coalesce لا nullif) ⇒ ٠", P0({ avg_cost: 0, purchase_price: 900 }), false, 900, 0],
    ["  وسعرُ شراءٍ سالب بلا متوسّط ⇒ ٠ (greatest)", P0({ purchase_price: -50 }), false, -50, 0],
    ["  ومتوسّطٌ سالب (بياناتٌ تالفة) ⇒ ٠، ولا يرجع لسعر الشراء", P0({ avg_cost: -3, purchase_price: 10 }), false, 10, 0],
    ["  ونصفُ الفلس للأعلى بالعلبة: ١٫٠٠٥ ⇒ ١٫٠١ (بالعائم ١٫٠٠)", P0({ avg_cost: 1.005 }), false, 0, 1.01],
    ["  وسعرُ شراءٍ عائمٌ من التجريبيّ (٠٫١ + ٠٫٢) يُقرأ كما يقرّبه عمودُه ⇒ ٠٫٣٠", P0({ purchase_price: 0.1 + 0.2 }), false, 0.1 + 0.2, 0.3],
    ["هـ٢) المفردُ بقسمةٍ لا تنتهي: ١١٧١٫٤٢٨٥٧٢ ÷ ٣ ⇒ ٣٩٠٫٤٨ (لا ١٢٠٠ ÷ ٣)", SUB(1171.428572, 3, { purchase_price: 1200 }), true, 400, 390.48],
    ["  و٢ ÷ ٣ ⇒ ٠٫٦٧", SUB(2, 3), true, 0, 0.67],
    ["  و١ ÷ ٧ ⇒ ٠٫١٤", SUB(1, 7), true, 0, 0.14],
    ["  و٠٫٠١ ÷ ٣ ⇒ ٠", SUB(0.01, 3), true, 0, 0],
    /* نصفُ فلسٍ بالضبط بعد القسمة: العائمُ (Math.round(k ÷ u × 100) ÷ 100) يقرأ k أقلَّ قليلاً فينزل — مقيسٌ على أسعارٍ
     * بمنزلتين حتى ٥٬٠٠٠ و١٤ قسمة (٢، ٣، ٤، ٥، ٦، ٨، ١٠، ١٢، ٢٠، ٢٤، ٢٥، ٣٠، ٥٠، ١٠٠): ٥٥٬٦٥٢ حالةً كلُّها للأسفل (و٥٥٬٣٥٥
     * بـEPSILON). و٢٥٠٠٫٥ ÷ ١٠٠ ليست منها (العائمُ ٢٥٫٠١). */
    ["  ونصفُ الفلس للأعلى بالقسمة: ١٠٠١٫٠٥ ÷ ١٠ ⇒ ١٠٠٫١١ (بالعائم ١٠٠٫١٠)", SUB(1001.05, 10), true, 96, 100.11],
    ["  و١٢٨٫١٧ ÷ ٢ ⇒ ٦٤٫٠٩ (بالعائم ٦٤٫٠٨)", SUB(128.17, 2), true, 0, 64.09],
    ["  و٢٥٠٠٫٥ ÷ ١٠٠ ⇒ ٢٥٫٠١", SUB(2500.5, 100), true, 24, 25.01],
    ["  وسرنجةٌ من ١٠٠ بعلبةٍ ٢٥٬٠٠٠ ⇒ ٢٥٠", SUB(25000, 100), true, 0, 250],
    ["  ووحدةٌ كسرية (٢٫٥ بالعلبة): ١٠ ⇒ ٤", SUB(10, 2.5), true, 0, 4],
    ["  وعلبةٌ من وحدةٍ واحدة: المفردُ كالعلبة (١٠٫٠٠٥ ⇒ ١٠٫٠١)", SUB(10.005, 1), true, 0, 10.01],
    ["  والمفردُ على مادّةٍ بلا وحدةٍ صغيرة (has_sub_unit لا) ⇒ كلفةُ العلبة", P0({ avg_cost: 30.5, units_per_box: 10 }), true, 3.05, 30.5],
    ["  وعلبةُ مادّةٍ لها وحدةٌ صغيرة ⇒ كلفةُ العلبة (٢٥٠٠٫٥٠)", SUB(2500.5, 100), false, 2400, 2500.5],
    /* الحكمُ بقاسم السطر لا المادّة: سطرٌ وُضع والعلبةُ بوحدةٍ واحدة يُرسل stock_qty = الكمية ولو صارت المادّةُ ١٠٠ بالعلبة، فالخادمُ
     * يكلّفه علبة — والحكمُ بقاسم المادّة كان يقول ٢٥٫٠١ عن سطرٍ يُكتب ٢٥٠٠٫٥٠ (مقيسٌ بـ_product_line_cost الحقيقية). */
    ["  ومفردٌ قاسمُه ١ والمادّةُ صارت ١٠٠ بالعلبة: الإتمامُ يرسل stock_qty = الكمية فالخادمُ يكلّفه علبة ⇒ ٢٥٠٠٫٥٠ (لا ٢٥٫٠١)", SUB(2500.5, 100), true, 24, 2500.5, 1],
    ["هـ٣) مادّةُ الحقل ⇒ كلفةُ الجهاز كما هي حرفاً", P0({ farm_id: "farm-1", avg_cost: 450, purchase_price: 500 }), false, 123.456, 123.456],
    ["  ومادّةٌ لا يعرفها الجهاز ⇒ كلفةُ الجهاز كما هي", undefined, true, 777.7, 777.7],
  ];
  for (const [name, p, sub, dev, exp, linePer] of T) {
    const per = sub ? (linePer ?? p?.units_per_box ?? null) : null;
    const port = portLineCost(p, 1, per ? 1 / per : 1, dev);
    if (port !== exp) throw new Error(`المرآةُ والمتوقَّعُ يختلفان: ${name.trim()} (${port} ≠ ${exp})`);
    const got = PLC(p, per, dev);
    ck(name, got === exp, J({ got, exp }));
  }

  const pl = (id, pid, o) => ({ id, kind: "product", name: pid, barcode: null, unit_price: 1000, qty: 1, stock: 10, product_id: pid, subcategory: null, ...o });
  const byId = new Map([PA, PB, PF].map((p) => [p.id, p]));
  const svc = svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a");
  const med = { id: "m:d1", kind: "med", name: "دواء", barcode: null, unit_price: 500, unit_cost: 0, qty: 1, stock: null, product_id: null, subcategory: null };
  const cart = [pl("p:pA", "pA", { unit_cost: 1250 }), pl("p:pB", "pB", { unit_cost: 96, hasSubUnit: true, unitsPerBox: 10, saleUnit: "sub" }),
    pl("p:pGone", "pGone", { unit_cost: 999 }), pl("p:pF", "pF", { unit_cost: 500 }), pl("r:pA", "pA", { unit_cost: 1250, ret: true, stock: null }), svc, med];
  const out = RC(cart, byId);
  ck("هـ٤) recostLines: سطرُ المادّة بالقائمة بكلفة الخادم لوحدته (علبة ١١٧١٫٤٣، مفرد ١٠٠٫١١، مرتجع ١١٧١٫٤٣)، وما غاب صفُّه ومادّةُ الحقل والخدمةُ والدواءُ كما هي (نفسُ الكائن)",
    J(out?.map((l) => l.unit_cost)) === J([1171.43, 100.11, 999, 500, 1171.43, svc.unit_cost, 0]) && out[2] === cart[2] && out[3] === cart[3] && out[5] === cart[5] && out[6] === cart[6],
    J(out?.map((l) => [l.id, l.unit_cost])));
  ck("  ونفسُ السلّة حين لا يتغيّر شيء (لا رسمَ ولا حفظَ مسودّة)", !!out && RC(out, byId) === out);
  /* الكلفةُ وحدها: سعرٌ كُتب بيد (priceManual) أو كميةٌ أو وحدةٌ تتبدّل بإعادة الكلفة سعرٌ يُباع به غيرُ ما رآه الكاشير. */
  const before = cart.map((l) => ({ ...l, priceManual: true }));
  const moved = RC(before, byId);
  ck("  وإعادةُ الكلفة لا تمسّ غيرَ unit_cost (السعرُ اليدويّ والكميةُ والوحدةُ والمعرّفُ كما هي)",
    !!moved && moved.length === before.length && moved.every((l, i) => sameBut(l, before[i], ["unit_cost"])) && moved[0].unit_cost === 1171.43,
    J(moved?.map((l, i) => Object.keys({ ...l, ...before[i] }).filter((k) => k !== "unit_cost" && J(l[k]) !== J(before[i][k])))));
}

/* ── د) الشاشةُ مرسومة ─────────────────────────────────────────────────────── */
const flush = async () => { for (let i = 0; i < 16; i++) await new Promise((r) => setImmediate(r)); };
function freshEnv(o = {}) {
  const log = { checkout: [], lab: [], surgery: [], errors: [], sumCalls: 0 };
  const sumImpl = o.summary ?? (async () => SUM);
  globalThis.__sb = {
    log,
    user: { id: "u1", clinic_id: "c1", full_name: "د. سارة", email: "s@x" },
    perm: o.perm ?? { role: "veterinarian", baseRole: "veterinarian", can: (c) => c === "viewProfits" },
    ov: { active: false, until: null, deviceLocked: false, restricted: false, stockLocked: false, ...(o.ov ?? {}) },
    catalog: CAT,
    recipeSummary: () => { log.sumCalls++; return sumImpl(log.sumCalls); },
    repo: {
      retailCheckout: async (items, meta) => {
        log.checkout.push({ raw: items, items: JSON.parse(J(items)), meta });
        return { id: "inv-1", clinic_id: "c1", total: meta.final_total, amount_paid: meta.amount_paid, profit: 0, cost_total: 0, subtotal: meta.final_total, discount: 0,
          customer_name: null, customer_phone: null, pet_name: meta.pet_name, status: "paid", created_at: "2026-10-31T09:00:00.000Z", recorded_at: null, item_count: items.length };
      },
      addLabResult: async (x) => { log.lab.push(x); return x; },
      listClinicVisitsForPet: async () => [],
      addClinicVisit: async () => ({ id: "visit-1" }),
      addSurgery: async (x) => { log.surgery.push(x); return x; },
      setLabBilled: async () => {}, logClientEvent: async () => {}, addPetNote: async () => {}, priceRaisePrior: async () => ({}),
    },
    toast: { toast() {}, success() {}, warn() {}, error: (a, b) => { log.errors.push([a, b ?? null]); } },
    sheet: null, notice: null, scanner: null, sqs: null,
  };
  return log;
}
async function session(M, { draft = null, products = [], ...env } = {}) {
  mem.clear();
  if (draft) mem.set("vp_sale_draft_c1", J(draft));
  const log = freshEnv(env);
  /* القائمةُ بحالةٍ عند أبٍ صغير: تحديثُها (عودةُ التاب، شراءٌ من جهازٍ آخر) يصل الشاشةَ كما يصلها من RetailSales. */
  const Host = () => {
    const [list, setList] = M.React.useState(products);
    globalThis.__sb.setProducts = setList;
    return M.React.createElement(M.SaleBuilder, { products: list, clinicId: "c1", onSold() {} });
  };
  const ui = M.mount(M.React.createElement(Host));
  await flush();
  const sb = () => globalThis.__sb;
  /** أوّلُ عقدةٍ تحت `n` بخاصّية data-… (القيمةُ اختيارية). */
  const within = (n, attr, value) => {
    if (!n) return null;
    if (n.props && attr in n.props && (value === undefined || String(n.props[attr]) === String(value))) return n;
    for (const c of n.children) { const f = within(c, attr, value); if (f) return f; }
    return null;
  };
  return {
    ui, log, sb,
    setProducts: async (list) => { sb().setProducts(list); await flush(); },
    tap: async (id) => { ui.click(ui.find("data-prodcard", id)); await flush(); },
    retMode: async () => { ui.click(ui.find("data-retmode")); await flush(); },
    weigh: async (kg) => { const w = ui.all().find((n) => n.type === "x-WeightPicker"); if (!w) throw new Error("منتقي الوزن ما انفتح"); w.props.onSubmit(kg); await flush(); },
    /** زرُّ العلبة/المفرد بسطرٍ بعينه (صفُّه أبو `data-linetotal`). */
    unit: async (id, u) => { ui.click(within(ui.find("data-linetotal", id)?.parent, "data-saleunit", u)); await flush(); },
    costOf: (id) => (JSON.parse(mem.get("vp_sale_draft_c1") ?? "null")?.cart ?? []).find((l) => l.id === id)?.unit_cost,
    cart: () => JSON.parse(mem.get("vp_sale_draft_c1") ?? "null")?.cart ?? [],
    chip: (id) => ui.find("data-conschip", id),
    dot: (id) => { const c = ui.find("data-conschip", id); return !!c && c.children.some((n) => n.props && "data-consdot" in n.props); },
    sheetOpen: () => ui.all().some((n) => n.type === "x-ConsSheet"),
    noticeShown: () => ui.all().some((n) => n.type === "x-ConsNotice"),
    services: async () => { ui.click(ui.all().find((n) => n.type === "button" && ui.text(n) === "Services")); await flush(); },
    pick: async (id, times = 1) => { for (let i = 0; i < times; i++) sb().sqs.onPick(SVC[id]); await flush(); },
    open: async (id) => { ui.click(ui.find("data-conschip", id)); await flush(); },
    save: async (next, est, scope) => { sb().sheet.onSave(next, est, scope); await flush(); },
    close: async () => { sb().sheet.onClose(); await flush(); },
    profit: () => { const n = ui.find("data-profitpreview"); return n ? ui.text(n) : null; },
    /** ربحُ شاشة «تمّ» (ربحُ الخادم، وفيه كلفةُ المواد بعد 0252). */
    doneProfit: () => ui.all().some((n) => n.type === "span" && ui.text(n).trim().startsWith("Profit")),
    scannerOff: () => !!sb().scanner?.o?.disabled,
    checkout: async () => { ui.click(ui.all().find((n) => n.type === "button" && ui.text(n).startsWith("إصدار الفاتورة"))); for (let i = 0; i < 4; i++) await flush(); },
    /** «بيع جديد» من شاشة «تمّ» (reset). */
    newSale: async () => { ui.click(ui.all().find((n) => n.type === "button" && ui.text(n).includes("New sale"))); await flush(); },
    remove: async (id) => { const row = ui.find("data-linetotal", id)?.parent; ui.click(row?.children.find((n) => n.type === "button" && n.props["aria-label"] === "Remove")); await flush(); },
    end: () => ui.unmount(),
  };
}
async function mountChecks(M, ck) {
  const ids = (S) => S.cart().map((l) => [l.id, l.qty]);
  /* `own`: السيناريو يضمّ «بلا خطأ رسم» لآخر فحوصه — فحصٌ مستقلٌّ به يمرّ على ما قبل التصليح ولا يقيس شيئاً جديداً. */
  const scenario = async (name, fn, own = false) => {
    let S = null;
    try { await fn((s) => { S = s; return s; }); } catch (e) { ck(`${name}: جرى حتى آخره`, false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), true); }
    if (S) { if (!own) ck(`${name}: بلا خطأ رسمٍ واحد`, S.ui.errors.length === 0, S.ui.errors.map(String).join(" | "), true); S.end(); }
  };

  await scenario("د١", async (use) => {
    const S = use(await session(M));
    const pages0 = globalThis.__pages.length;
    const [g0, g1, g2] = globalThis.__pages.filter((p) => J(p.ns) === J(["rcp"]));   // وقطعُ ptab (0258) بجانبها
    ck("د١) قطعُ الورقة والإشعار والتسخين كسولةٌ عند التحميل، كلٌّ بنطاقها rcp", pages0 >= 3 && [g0, g1, g2].every((p) => J(p?.ns) === J(["rcp"])), J(globalThis.__pages.map((p) => p.ns)));
    const [m0, m1, m2] = await Promise.all([g0, g1, g2].map((p) => p?.load?.()));
    ck("  والمحمِّلات: الورقةُ (default) والإشعارُ (ConsumptionNotice) من ConsumablesSheet نفسِها، والتسخينُ مكوّنٌ لا يرسم شيئاً",
      m0?.default?.__which === "sheet" && m1?.default?.__which === "notice" && typeof m2?.default === "function" && m2.default() === null && !m2.default.__which);
    await S.services();
    await S.pick("a0a0a0a0-0000-4000-8000-00000000000a", 3);
    ck("  الخدمةُ ×٣ سطرٌ واحد s:a0a0a0a0-0000-4000-8000-00000000000a، وعليه الشارةُ بلا نقطة", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3]]) && !!S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a") && !S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a"), J(ids(S)));
    ck("  ومعاينةُ الربح تطرح كلفةَ الوصفة: ٧٥٬٠٠٠ − ٣٬٠٠٠ − ٣×٣٬٠٠٠", S.profit()?.includes(M.money(63000)), S.profit());
    ck("  والماسحُ يسمع والورقةُ مغلقة", !S.scannerOff());
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    const p = S.sb().sheet;
    ck("  الشارةُ تفتح الورقة: الخدمةُ واسمُها، ×٣، بلا تعديل، للطبيب، وبالكلفة لمن يرى الأرباح",
      S.sheetOpen() && p?.open === true && p.serviceId === "a0a0a0a0-0000-4000-8000-00000000000a" && p.serviceName === "تعقيم" && p.lineQty === 3 && p.value === undefined
      && p.canEdit === true && p.showCost === true && Array.isArray(p.products), J(p && { ...p, products: p.products?.length, onSave: !!p.onSave }));
    ck("  والماسحُ صامتٌ والورقةُ مفتوحة (مسحتُها لها لا للسلّة)", S.scannerOff());
    const lb = S.ui.find("scope", "cons-sheet");
    ck("  والورقةُ داخل LoadBoundary (cons-sheet)", lb?.type === "x-LoadBoundary");
    lb?.props.onRetry(); await flush();
    ck("  و«أعد المحاولة» تصنع قطعةً جديدة وتُرسم بها", globalThis.__pages.length === pages0 + 1 && S.sheetOpen(), J({ pages: globalThis.__pages.length }));
    await S.save(E1, 1500, "one");
    let c = S.cart();
    ck("  «هالحالة بس» ⇒ s:a0a0a0a0-0000-4000-8000-00000000000a ×٢ بالوصفة و s:a0a0a0a0-0000-4000-8000-00000000000a#2 ×١ بالتعديل بعده مباشرةً", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 2], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1]])
      && !has(c[0], "consumables") && J(c[1].consumables) === J(E1) && c[1].consEst === 1500, J(c));
    ck("  والنسخةُ بكلّ حقول أصلها إلا المعرّفَ والكميةَ والتعديل", sameBut(c[1], c[0], ["id", "qty", "consumables", "consEst"]));
    ck("  والورقةُ تُغلق بالحفظ والماسحُ يعود", !S.sheetOpen() && !S.scannerOff());
    ck("  والنقطةُ على الجديد وحده", !S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a") && S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a#2"));
    ck("  والمعاينةُ: ٢×٣٬٠٠٠ + ١٬٥٠٠", S.profit()?.includes(M.money(75000 - 3000 - 7500)), S.profit());
    await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  وإضافةٌ بعدها تزيد السطرَ العاديّ لا المعدَّل", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1]]), J(ids(S)));
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    await S.save(E2, 800, "line");
    c = S.cart();
    ck("  «كل حالات السطر» على مكانه: s:a0a0a0a0-0000-4000-8000-00000000000a ×٣ بتعديله، بنفس المعرّف", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1]]) && J(c[0].consumables) === J(E2) && c[0].consEst === 800);
    await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  وكلاهما معدَّل ⇒ الإضافةُ سطرٌ جديد بأصغر k حرّ (s:a0a0a0a0-0000-4000-8000-00000000000a#3)، وبطاقتُها تومض بأصل السطر",
      J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#3", 1]]) && S.sb().sqs?.flashId === "s:a0a0a0a0-0000-4000-8000-00000000000a", J({ ids: ids(S), flash: S.sb().sqs?.flashId }));
    await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  والتالية تزيد #3 (أوّلُ عاديّ)", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#3", 2]]), J(ids(S)));
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a#2");
    ck("  وورقةُ #2 تحمل تعديلَه وحالتَه الواحدة", J(S.sb().sheet?.value) === J(E1) && S.sb().sheet?.lineQty === 1);
    await S.save(null, null, "line");
    ck("  و«رجّع للوصفة» يشيل التعديلَ والنقطةَ والمعرّفُ باقٍ", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 3], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#3", 2]]) && !has(S.cart()[1], "consumables") && !S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a#2"));
    ck("  والمعاينةُ: ١٥٠٬٠٠٠ − ٦٬٠٠٠ − (٣×٨٠٠ + ٣×٣٬٠٠٠)", S.profit()?.includes(M.money(150000 - 6000 - 11400)), S.profit());
    await S.checkout();
    const sent = S.log.checkout[0];
    ck("  الإتمامُ: كلُّ سطر خدمةٍ يحمل service_id، والمعدَّلُ مستهلكاتِه، والباقي بلا مفتاحها", !!sent && sent.items.length === 3
      && sent.items.every((x) => x.service_id === "a0a0a0a0-0000-4000-8000-00000000000a") && J(sent.items[0].consumables) === J(E2)
      && !has(sent.raw[1], "consumables") && !has(sent.raw[2], "consumables") && J(sent.items.map((x) => x.qty)) === J([3, 1, 2]), J(sent?.items));
    ck("  وشاشةُ «تمّ» تعرض ربحَ الخادم لمن يرى الأرباح", S.doneProfit());
    ck("  وشاشةُ «تمّ» تقرأ دفترَ الفاتورة (ConsumptionNotice sale) داخل LoadBoundary", S.noticeShown() && S.sb().notice?.mode === "sale"
      && J(S.sb().notice?.invoiceIds) === J(["inv-1"]) && S.ui.find("scope", "cons-notice")?.type === "x-LoadBoundary", J(S.sb().notice));
  });

  await scenario("د٢", async (use) => {
    const S = use(await session(M));
    await S.services(); await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    ck("د٢) سطرُ الورقة خرج من السلّة ⇒ تُغلق، والماسحُ يعود", S.scannerOff() && (await S.remove("s:a0a0a0a0-0000-4000-8000-00000000000a"), !S.scannerOff() && !S.sheetOpen() && S.cart().length === 0));
    await S.pick("a0a0a0a0-0000-4000-8000-00000000000a"); await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    await S.checkout();   // بيعةٌ تمّت والورقةُ مفتوحة (الزرُّ خلفها يُضغط هنا مباشرةً)
    ck("  وبيعةٌ تمّت والورقةُ مفتوحة ⇒ تُغلق: مسحةُ شاشة «تمّ» تبدأ بيعةً جديدة لا تُبتلع", S.log.checkout.length === 1 && !S.scannerOff() && S.noticeShown());
  });

  await scenario("د٣", async (use) => {
    const S = use(await session(M, { summary: async (n) => { if (n <= 2) throw Object.assign(new Error("boom"), { code: "PGRST000" }); return {}; } }));
    await S.services(); await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    /* الفاشلُ ليس طازجاً: البيعةُ التي تبدأ تعيده بلا انتظار نافذة الطزاجة (و) — وفشل ثانيةً هنا فيبقى فشلاً يُقال. */
    ck("د٣) الملخّصُ فشل ⇒ يُعاد مع البيعة الجديدة (نداءٌ ثانٍ)، وفشلُه الثاني: الشارةُ على سطر الخدمة، والربحُ «—» لا رقمٌ منفوخ",
      S.log.sumCalls === 2 && !!S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a") && S.profit()?.includes("—") && !S.profit()?.includes(M.money(24000)), J({ calls: S.log.sumCalls, profit: S.profit() }));
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  والضغطةُ تعيده (نداءٌ ثالث) والورقةُ تُفتح", S.log.sumCalls === 3 && S.sheetOpen(), J({ calls: S.log.sumCalls }));
    ck("  ووصل فارغاً (لا وصفات) ⇒ لا شارةَ على العاديّ، والربحُ بلا مستهلكات", !S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a") && S.profit()?.includes(M.money(24000)), S.profit());
    await S.close();
    ck("  والإغلاقُ يعيد الماسح", !S.sheetOpen() && !S.scannerOff());
    await S.checkout();
    const it = S.log.checkout[0]?.raw?.[0];
    ck("  ولا إشعارَ لبيعةٍ لا يُخصم لها شيء، وservice_id يُرسل كعادته بلا مستهلكات", !S.noticeShown() && S.sb().notice === null && it?.service_id === "a0a0a0a0-0000-4000-8000-00000000000a" && !has(it, "consumables"), J(it));
  });

  await scenario("د٤", async (use) => {
    const S = use(await session(M, {
      summary: () => new Promise(() => {}),
      draft: draftOf([svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b", { consumables: E2, consEst: 800 })]),
    }));
    await S.services(); await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    /* الشارةُ بسطرٍ تحت الاسم: سطرٌ يظهر ثم يختفي لحظةَ وصول ملخّصٍ فارغ (أغلبُ العيادات بلا وصفة) يقفز بالسلّة عند كلّ
     * فتحٍ ورجوعٍ للتبويب — فالعاديُّ ينتظر الملخّص (§11.5: وصفةٌ بالعيادة أو ملخّصٌ فاشل)، والمعدَّلُ شارتُه باقية. */
    ck("د٤) الملخّصُ لم يصل ⇒ لا شارةَ على العاديّ بعد (والمعدَّلُ بشارته ونقطته)، والربحُ «—»",
      !S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a") && S.dot("s:b0b0b0b0-0000-4000-8000-00000000000b") && S.profit()?.includes("—"),
      J({ plain: !!S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a"), edited: S.dot("s:b0b0b0b0-0000-4000-8000-00000000000b"), profit: S.profit() }));
    await S.checkout();
    ck("  والإشعارُ يُقرأ بعد البيعة (لا نعرف أنّ الخدمة بلا وصفة)", S.noticeShown(), J(S.sb().notice));
  });

  await scenario("د٥", async (use) => {
    const S = use(await session(M, {
      summary: async () => ({}), perm: { role: "receptionist", baseRole: "receptionist", can: () => false },
      draft: draftOf([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { consumables: E1, consEst: 1200 }), svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b")]),
    }));
    ck("د٥) لا وصفةَ بالعيادة ⇒ لا شارةَ على العاديّ — إلا ما عُدّل (بنقطته)", S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a") && !S.chip("s:b0b0b0b0-0000-4000-8000-00000000000b"));
    ck("  ومن لا يرى الأرباح لا يرى معاينتَها", S.profit() === null);
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    const p = S.sb().sheet;
    ck("  والاستقبالُ يرى الورقةَ للقراءة، بلا كلفة، بتعديلها", p?.canEdit === false && p?.showCost === false && J(p?.value) === J(E1), J(p && { canEdit: p.canEdit, showCost: p.showCost }));
    await S.close();
    await S.checkout();
    const raw = S.log.checkout[0]?.raw ?? [];
    ck("  والتعديلُ يصل الخادمَ (هو يفرض الدور)، والإشعارُ يُقرأ", J(raw[0]?.consumables) === J(E1) && raw[1]?.service_id === "b0b0b0b0-0000-4000-8000-00000000000b" && !has(raw[1], "consumables") && S.noticeShown(), J(raw));
    /* ربحُ الخادم بعد 0252 = السعرُ − الكلفةُ الثابتة − كلفةُ المواد: فرقُه عن سعر الخدمة كلفةُ موادّها بالضبط (§11.9: لمن يرى
     * الأرباح والجهازُ غيرُ مقيَّد). معاينةٌ مخفيّةٌ بالسلّة وربحٌ ظاهرٌ بعد ثانيتين بشاشة «تمّ» = لا إخفاء. */
    ck("  وشاشةُ «تمّ» لا تعرض الربحَ لمن لا يرى الأرباح (فيه كلفةُ المواد)", !S.doneProfit());
  });

  await scenario("د١٠", async (use) => {
    const S = use(await session(M, {
      perm: { role: "manager", baseRole: "manager", can: () => true }, ov: { restricted: true },
      draft: draftOf([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")]),
    }));
    ck("د١٠) جهازٌ مقيَّد (المديرُ عليه): لا معاينةَ ربح", S.profit() === null, S.profit());
    await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  والورقةُ يعدّلها المدير بلا كلفة", S.sb().sheet?.canEdit === true && S.sb().sheet?.showCost === false, J({ canEdit: S.sb().sheet?.canEdit, showCost: S.sb().sheet?.showCost }));
    await S.close();
    await S.checkout();
    ck("  ولا ربحَ بشاشة «تمّ»", S.log.checkout.length === 1 && !S.doneProfit());
  });

  await scenario("د٦", async (use) => {
    const S = use(await session(M, {
      draft: draftOf([
        svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a", { consumables: E1, consEst: 1500 }),
        svcLine("s:lab:L1", "a0a0a0a0-0000-4000-8000-00000000000a", { name: "CBC", consumables: "garbage" }),
        svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a#2", "a0a0a0a0-0000-4000-8000-00000000000a", { consumables: [{ product_id: 5, qty: 1, unit: "stock" }], consEst: 99 }),
        svcLine("s:lab:L2", null),
        svcLine("s:b0b0b0b0-0000-4000-8000-00000000000b", "b0b0b0b0-0000-4000-8000-00000000000b", { qty: 1.5 }),
      ]),
    }));
    const c = S.cart();
    ck("د٦) مسودّةٌ فيها مكسور تُفتح: السليمُ بتعديله وكلفته، والمكسورُ بلا تعديلٍ ولا كلفة، والباقي كما هو",
      c.length === 5 && J(c[0].consumables) === J(E1) && c[0].consEst === 1500 && !has(c[1], "consumables") && !has(c[2], "consumables") && !has(c[2], "consEst")
      && c[3].id === "s:lab:L2" && c[4].qty === 1.5, J(c.map((l) => [l.id, l.consumables ?? null, l.consEst ?? null])));
    ck("  والشاراتُ: المعدَّلُ بنقطة، والمكسورُ بلا نقطة، وبندُ المختبر المطابق بشارة، وبلا معرّف بلا شارة",
      S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a") && !!S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a#2") && !S.dot("s:a0a0a0a0-0000-4000-8000-00000000000a#2") && !!S.chip("s:lab:L1") && !S.dot("s:lab:L1") && !S.chip("s:lab:L2") && !!S.chip("s:b0b0b0b0-0000-4000-8000-00000000000b"));
    await S.services(); await S.pick("a0a0a0a0-0000-4000-8000-00000000000a");
    ck("  والإضافةُ تزيد أوّلَ عاديٍّ ليس بندَ مختبر (s:a0a0a0a0-0000-4000-8000-00000000000a#2) — لا المعدَّلَ ولا s:lab: قبله", J(ids(S)) === J([["s:a0a0a0a0-0000-4000-8000-00000000000a", 1], ["s:lab:L1", 1], ["s:a0a0a0a0-0000-4000-8000-00000000000a#2", 2], ["s:lab:L2", 1], ["s:b0b0b0b0-0000-4000-8000-00000000000b", 1.5]]), J(ids(S)));
    await S.open("s:b0b0b0b0-0000-4000-8000-00000000000b");
    ck("  وكميةٌ دون ٢ (١٫٥) تُعطى الورقةَ حالةً واحدة (لا «هالحالة بس»)", S.sb().sheet?.lineQty === 1, J(S.sb().sheet?.lineQty));
    await S.close(); await S.open("s:a0a0a0a0-0000-4000-8000-00000000000a#2");
    ck("  و×٢ تُعطاها ٢", S.sb().sheet?.lineQty === 2, J(S.sb().sheet?.lineQty));
  });

  await scenario("د٧", async (use) => {
    const S = use(await session(M, { draft: draftOf([], { salePets: [{ id: "pet-1", name: "Luna", species: "cat" }] }) }));
    await S.services();
    await S.pick("1ab01ab0-0000-4000-8000-0000000001ab", 2); await S.open("s:1ab01ab0-0000-4000-8000-0000000001ab"); await S.save(E1, 50, "one");
    await S.pick("5e60c000-0000-4000-8000-0000000005e6", 2); await S.open("s:5e60c000-0000-4000-8000-0000000005e6"); await S.save([], 0, "one");
    const c = S.cart();
    ck("د٧) تحليلٌ وعمليةٌ لحيوانٍ واحد، فُصلت من كلٍّ حالة — والنسخُ بحيوانها", J(ids(S)) === J([["s:1ab01ab0-0000-4000-8000-0000000001ab", 1], ["s:1ab01ab0-0000-4000-8000-0000000001ab#2", 1], ["s:5e60c000-0000-4000-8000-0000000005e6", 1], ["s:5e60c000-0000-4000-8000-0000000005e6#2", 1]])
      && c.every((l) => l.petId === "pet-1") && J(c[3].consumables) === "[]" && S.dot("s:5e60c000-0000-4000-8000-0000000005e6#2"), J(c.map((l) => [l.id, l.petId])));
    await S.checkout();
    ck("  والإتمامُ يكتب «بانتظار النتائج» مرّةً واحدة وعمليةً واحدة كما قبل الفصل", S.log.lab.length === 1 && S.log.lab[0].pet_id === "pet-1" && S.log.lab[0].panel_label === "CBC"
      && S.log.surgery.length === 1, J({ lab: S.log.lab.length, surgery: S.log.surgery.length }));
    ck("  وكلُّ نسخةٍ تحمل service_id خدمتها ومستهلكاتِها ([] لا شيء)", J((S.log.checkout[0]?.items ?? []).map((x) => [x.service_id, x.consumables ?? null]))
      === J([["1ab01ab0-0000-4000-8000-0000000001ab", null], ["1ab01ab0-0000-4000-8000-0000000001ab", E1], ["5e60c000-0000-4000-8000-0000000005e6", null], ["5e60c000-0000-4000-8000-0000000005e6", []]]));
  });

  /* معرّفُ خدمةٍ ليس uuid (كتالوجٌ محلّيٌّ من ١٥–٢٢/٦ لم يصل السحابة): الخادمُ والتجريبيُّ يرفضان البيعةَ كلَّها عليه
   * (service_id_bad) — «حدّث الصفحة» لا تصلحه. فلا يُرسل، ولا شارةَ تعِد بخصم، ولا كلفةَ مواد، ولا إشعار. */
  await scenario("د٨", async (use) => {
    const S = use(await session(M, {
      summary: () => new Promise(() => {}),
      draft: draftOf([svcLine(`s:${LEGACY}`, LEGACY, { qty: 2, consumables: E1, consEst: 700 })]),
    }));
    ck("د٨) خدمةٌ بمعرّفٍ ليس uuid والملخّصُ مجهول: لا شارة (ولو حملت مسودّتُها تعديلاً)، والربحُ رقمٌ بلا مواد",
      !S.chip(`s:${LEGACY}`) && S.profit()?.includes(M.money(16000)) && !S.profit()?.includes("—"), J({ chip: !!S.chip(`s:${LEGACY}`), profit: S.profit() }));
    await S.checkout();
    const it = S.log.checkout[0]?.raw?.[0];
    ck("  والإتمامُ يبيعها بلا service_id ولا مستهلكات (لا يرفض الخادمُ البيعة)، ولا إشعارَ بعدها",
      S.log.checkout.length === 1 && !!it && !has(it, "service_id") && !has(it, "consumables") && it.qty === 2 && !S.noticeShown(), J({ it, notice: S.noticeShown() }));
  });

  await scenario("د٩", async (use) => {
    const S = use(await session(M, {
      summary: async () => { throw new Error("boom"); },
      draft: draftOf([svcLine(`s:${LEGACY}`, LEGACY), svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")]),
    }));
    ck("د٩) والملخّصُ فاشل: الشارةُ على خدمة الـuuid وحدها", !S.chip(`s:${LEGACY}`) && !!S.chip("s:a0a0a0a0-0000-4000-8000-00000000000a"));
    await S.checkout();
    const raw = S.log.checkout[0]?.raw ?? [];
    ck("  والإتمامُ: service_id لخدمة الـuuid وحدها", raw.length === 2 && !has(raw[0], "service_id") && raw[1]?.service_id === "a0a0a0a0-0000-4000-8000-00000000000a" && S.noticeShown(), J(raw));
  });

  /* ── ز) بيعةٌ فيها سطرُ مادّة تقرأ دفترَها: 0253 لا يقصّ عند الصفر، فقائمةٌ قديمة تنزل بالرصيد تحته والبيعةُ تمرّ ───────── */
  const A_ID = "a0a0a0a0-0000-4000-8000-00000000000a", B_ID = "b0b0b0b0-0000-4000-8000-00000000000b", SVC_A = `s:${A_ID}`;
  const lineA = { id: "p:pA", kind: "product", name: PA.name, barcode: null, unit_price: 2000, unit_cost: 1250, qty: 1, stock: 50, product_id: "pA", subcategory: null, saleUnit: "box", priceManual: false };
  await scenario("ز١", async (use) => {
    const S = use(await session(M, { products: [PA] }));
    await S.tap("pA");
    await S.checkout();
    ck("ز١) بيعةُ مادّةٍ وحدها (بلا خدمة): شاشةُ «تمّ» تقرأ دفترَ الفاتورة — قائمةٌ قديمة (جهازٌ ثانٍ باع آخرَ علبة) تنزل بالرصيد تحت الصفر والبيعةُ تمرّ، والإشعارُ يقوله",
      S.log.checkout.length === 1 && S.noticeShown() && S.sb().notice?.mode === "sale" && J(S.sb().notice?.invoiceIds) === J(["inv-1"]),
      J({ items: S.log.checkout[0]?.items?.map((x) => [x.product_id, x.qty]), notice: S.sb().notice }));
  });
  await scenario("ز٢", async (use) => {
    const S = use(await session(M, { products: [PA] }));
    await S.tap("pA"); await S.services(); await S.pick(B_ID);
    await S.checkout();
    ck("ز٢) ومادّةٌ مع خدمةٍ بلا وصفة: الإشعارُ يُقرأ كذلك (كان لا يُركَّب إلا لما قد يُخصم له)", S.log.checkout.length === 1 && S.noticeShown(), J(S.sb().notice));
  });
  await scenario("ز٣", async (use) => {
    const S = use(await session(M, { products: [PA], draft: draftOf([svcLine(`s:${B_ID}`, B_ID), { ...lineA, id: "r:pA", stock: null, ret: true }]) }));
    await S.checkout();
    ck("ز٣) والراجعُ وحده (مع خدمةٍ بلا وصفة) لا يُركّب الإشعار: يزيد الرصيد لا ينقصه",
      S.log.checkout.length === 1 && S.log.checkout[0].items.some((x) => x.qty < 0 && x.product_id === "pA") && !S.noticeShown(),
      J({ n: S.log.checkout.length, notice: S.sb().notice }));
  });
  await scenario("ز٤", async (use) => {
    const S = use(await session(M, { products: [PA] }));
    await S.tap("pA"); await S.checkout();
    const first = S.noticeShown();
    await S.newSale();
    await S.services(); await S.pick(B_ID); await S.checkout();
    ck("ز٤) والقرارُ لكلّ بيعةٍ وحدها: بيعةُ مادّةٍ تقرأ دفترَها، والتي بعدها (خدمةٌ بلا وصفة) لا ترث إشعارَها",
      first && S.log.checkout.length === 2 && !S.noticeShown(), J({ first, n: S.log.checkout.length, notice: S.noticeShown() }));
  });

  /* ── ح) سطرٌ بلا مادّة ليس خدمة يقولها: غيابُ service_id يقرؤه الخادمُ جهازاً ما تحدّث (old_device بالاسم) ───────────── */
  await scenario("ح١", async (use) => {
    const med = { id: "m:d1", kind: "med", name: "تعقيم", barcode: null, unit_price: 5000, unit_cost: 0, qty: 1, stock: null, product_id: null, subcategory: null,
      med: { id: "d1", kind: "vaccination", name: "تعقيم", nextDue: null, administered: true }, petId: null, petName: null };
    const S = use(await session(M, { draft: draftOf([med, svcLine("s:lab:L2", null, { name: "تحليل برّا" }), svcLine(`s:${B_ID}`, B_ID)]) }));
    await S.checkout();
    const raw = S.log.checkout[0]?.raw ?? [];
    ck("ح١) سطرُ دواءٍ بلا مادّة (تبويب الأدوية) يُرسل service_id: null صريحاً — اسمُه اسمُ خدمةٍ لها وصفة («تعقيم»)، وغيابُ المفتاح يصنّفه الخادمُ بالاسم «جهاز ما تحدّث»",
      raw.length === 3 && has(raw[0], "service_id") && raw[0].service_id === null && raw[0].product_id === null, J(raw[0]));
    ck("  وبندُ خدمةٍ بلا معرّف (مختبرٌ ما طابق) بلا المفتاح — خدمةٌ فعلاً يقول عنها اسمُها كما كان — وخدمةُ الكتالوج بمعرّفها",
      raw.length === 3 && !has(raw[1], "service_id") && raw[2]?.service_id === B_ID, J(raw.slice(1)));
  });

  /* ── و) ملخّصُ الوصفات يتجدّد: تابُ الكاشير يبقى على «بيع» ساعات (القائمةُ تتجدّد تحته بلا تركيب) ──────────────────── */
  await scenario("و١", async (use) => {
    const S = use(await session(M, { summary: async (n) => (n === 1 ? {} : SUM) }));
    await S.setProducts([PA]);
    await S.services(); await S.pick(A_ID);
    ck("و١) بنافذة الطزاجة: قائمةٌ تصل وبيعةٌ تبدأ لا يعيدان قراءةَ الملخّص (قراءةٌ واحدة للتركيب)", S.log.sumCalls === 1 && !S.chip(SVC_A), J({ calls: S.log.sumCalls }));
    await S.remove(SVC_A);
    advance(60_000);   // التابُ بقي مفتوحاً، والمديرُ حفظ أوّلَ وصفةٍ من جهازه
    await S.pick(A_ID);
    ck("  وبيعةٌ تبدأ بعد دقيقة تعيد قراءتَه: وصفةٌ حُفظت من جهازٍ ثانٍ بعد فتح التاب تُرى — الشارةُ، ومعاينةُ الربح بكلفة موادّها (٢٥٬٠٠٠ − ١٬٠٠٠ − ٣٬٠٠٠)",
      S.log.sumCalls === 2 && !!S.chip(SVC_A) && !!S.profit()?.includes(M.money(21000)), J({ calls: S.log.sumCalls, chip: !!S.chip(SVC_A), profit: S.profit() }));
    await S.checkout();
    ck("  والإشعارُ بعد البيعة يُقرأ لها", S.log.checkout.length === 1 && S.noticeShown(), J(S.sb().notice));
  });
  await scenario("و٢", async (use) => {
    const S = use(await session(M, { summary: async (n) => (n === 1 ? {} : SUM) }));
    await S.services(); await S.pick(A_ID);
    advance(60_000);
    await S.setProducts([PA]);   // جلبُ القائمة: كلَّ ٥ دقائق، عودةُ التاب، بعد البيعة
    ck("و٢) والقائمةُ حين تصل بعد دقيقة تعيد قراءتَه — والسلّةُ المفتوحة ترى الوصفة (الشارةُ والربحُ بكلفة الموادّ)",
      S.log.sumCalls === 2 && !!S.chip(SVC_A) && !!S.profit()?.includes(M.money(21000)), J({ calls: S.log.sumCalls, profit: S.profit() }));
  });
  await scenario("و٥", async (use) => {
    const S = use(await session(M, { summary: async (n) => (n === 1 ? {} : SUM) }));
    advance(-3_600_000);   // ساعةُ الجهاز رجعت ساعة (ضبطُ الوقت)
    await S.services(); await S.pick(A_ID);
    ck("و٥) وساعةُ الجهاز إن رجعت للوراء لا تُسكت القراءة (فرقٌ سالب ليس «طازجاً»): البيعةُ التي تبدأ تقرأ الملخّص",
      S.log.sumCalls === 2 && !!S.chip(SVC_A), J({ calls: S.log.sumCalls, chip: !!S.chip(SVC_A) }));
  });
  await scenario("و٣", async (use) => {
    let release = () => {};
    const late = new Promise((r) => { release = r; });
    const S = use(await session(M, { summary: (n) => (n <= 2 ? Promise.resolve({}) : late) }));
    advance(60_000);
    await S.services(); await S.pick(A_ID);   // البيعةُ بدأت والوصفةُ لم تُحفظ بعد
    advance(60_000);                          // وحُفظت والسلّةُ مفتوحة
    await S.checkout();
    const before = { calls: S.log.sumCalls, done: S.log.checkout.length, notice: S.noticeShown() };
    release(SUM); await flush();
    ck("و٣) وصفةٌ حُفظت والسلّةُ مفتوحة: الإتمامُ يسأل الملخّصَ معه (لا ينتظره)، وجوابُه بعد شاشة «تمّ» يُركّب إشعارَها",
      before.calls === 3 && before.done === 1 && !before.notice && S.noticeShown() && J(S.sb().notice?.invoiceIds) === J(["inv-1"]), J({ before, after: S.noticeShown() }));
  });
  await scenario("و٤", async (use) => {
    let release = () => {};
    const pend = new Promise((r) => { release = r; });
    const S = use(await session(M, { products: [PA], summary: (n) => (n === 1 ? Promise.resolve(SUM) : n === 2 ? pend : Promise.reject(new Error("boom"))) }));
    await S.services(); await S.pick(A_ID);
    const p0 = S.profit();
    advance(60_000);
    await S.setProducts([PA]);   // قراءةٌ ثانية بالطريق
    const mid = { calls: S.log.sumCalls, chip: !!S.chip(SVC_A), profit: S.profit() };
    release(SUM); await flush();
    ck("و٤) والقراءةُ الجديدة بالطريق: الملخّصُ القديم معروضٌ حتى تصل (الشارةُ لا تختفي، والربحُ لا يصير «—»)",
      !!p0?.includes(M.money(21000)) && mid.calls === 2 && mid.chip && mid.profit === p0 && !!S.chip(SVC_A), J({ p0, mid }));
    advance(60_000);
    await S.setProducts([PA]);   // وقراءةٌ تفشل بعد ملخّصٍ صالح
    await S.pick(B_ID);
    ck("  وفشلُها حالةٌ تُقال كفشل التركيب: الشارةُ على كلّ خدمة، والربحُ «—» — لا ملخّصٌ قديمٌ يُصدَّق",
      S.log.sumCalls === 3 && !!S.chip(`s:${B_ID}`) && !!S.profit()?.includes("—"), J({ calls: S.log.sumCalls, profit: S.profit() }));
  });

  /* ── كلفةُ سطر المادّة بالشاشة (0255): كلُّ موضعٍ يُنشئها، وما يُرسل، وما يُعاين ─────────────── */
  const sendRows = (S, list) => {
    const by = new Map(list.map((p) => [p.id, p]));
    return (S.log.checkout[0]?.items ?? []).filter((x) => x.product_id)
      .map((x) => ({ id: `${x.qty < 0 ? "r" : "p"}:${x.product_id}`, qty: x.qty, sq: x.stock_qty, sent: x.unit_cost, booked: portLineCost(by.get(x.product_id), x.qty, x.stock_qty, x.unit_cost) }));
  };
  await scenario("د١١", async (use) => {
    const LIST = [PA, PB, PC, PD, PE, PG];
    const S = use(await session(M, { products: LIST }));
    await S.tap("pA"); await S.tap("pA");
    await S.tap("pB");
    const b = [S.costOf("p:pB")];
    await S.unit("p:pB", "sub"); b.push(S.costOf("p:pB"));
    await S.unit("p:pB", "box"); b.push(S.costOf("p:pB"));
    await S.unit("p:pB", "sub"); b.push(S.costOf("p:pB"));
    await S.tap("pC");
    await S.tap("pD"); await S.weigh(0.375);
    await S.tap("pE"); await S.tap("pG");
    await S.retMode(); await S.tap("pA"); await S.retMode();
    const c = S.cart();
    const costs = Object.fromEntries(c.map((l) => [l.id, l.unit_cost]));
    ck("د١١) سطرُ المادّة بكلفة الخادم من أوّل إضافة: علبةٌ بالمتوسّط ١١٧١٫٤٣ (لا آخرَ سعر شراء ١٢٥٠)، ومفردٌ أوّل ٣٩٠٫٤٨ (لا ٤٠٠)، وكيلو ٣٣٣٣٫٣٣، وبلا متوسّط ٧٫٥٠، وسعرٌ سالب صفر",
      costs["p:pA"] === 1171.43 && costs["p:pC"] === 390.48 && costs["p:pD"] === 3333.33 && costs["p:pE"] === 7.5 && costs["p:pG"] === 0, J(costs));
    ck("  والتبديلُ علبة ⇄ مفرد بكلفة الخادم لكلّ وحدة: ١٠٠١٫٠٥ ⇄ ١٠٠٫١١ (نصفُ الفلس للأعلى — بالعائم ١٠٠٫١٠، والجهازُ ٩٦)", J(b) === J([1001.05, 100.11, 1001.05, 100.11]), J(b));
    ck("  والمرتجعُ بالسلّة بكلفة الخادم كذلك (١١٧١٫٤٣)", costs["r:pA"] === 1171.43, J(costs["r:pA"]));
    /* المعاينةُ بحساب الشاشة نفسِه (المجموعُ ناقصَ Σ الكمية × الكلفة) لكن بكلفة الخادم المكتوبة باليد — ويُشترط أن يختلف
     * رقمُها عن رقم كلفة الجهاز القديمة، وإلا ما فُحص شيء. */
    const EXP = { "p:pA": 1171.43, "p:pB": 100.11, "p:pC": 390.48, "p:pD": 3333.33, "p:pE": 7.5, "p:pG": 0, "r:pA": 1171.43 };
    const DEV = { "p:pA": 1250, "p:pB": 96, "p:pC": 400, "p:pD": 3000, "p:pE": 7.5, "p:pG": -50, "r:pA": 1250 };
    const sg = (l) => (l.ret ? -1 : 1);
    const sub = c.reduce((s, l) => s + sg(l) * l.qty * l.unit_price, 0);
    const exp = sub - c.reduce((s, l) => s + sg(l) * l.qty * EXP[l.id], 0);
    const dev = sub - c.reduce((s, l) => s + sg(l) * l.qty * DEV[l.id], 0);
    ck("  ومعاينةُ الربح بما سيكتبه الخادم لا بآخر سعر شراء", c.length === 7 && !!S.profit()?.includes(M.money(exp)) && M.money(exp) !== M.money(dev),
      J({ shown: S.profit(), exp: M.money(exp), dev: M.money(dev) }));
    await S.checkout();
    const rows = sendRows(S, LIST);
    ck("  والإتمامُ: كلُّ سطرِ مادّةٍ يُرسل ما يكتبه الخادمُ لكميّته وstock_qty كما أُرسلا (مرآةُ _product_line_cost)، بلا خطأ رسم",
      rows.length === 7 && rows.every((r) => r.sent === r.booked) && J(rows.map((r) => r.sent)) === J([1171.43, 100.11, 390.48, 3333.33, 7.5, 0, 1171.43])
      && S.ui.errors.length === 0, J({ rows, errors: S.ui.errors.map(String) }));
  }, true);

  await scenario("د١٢", async (use) => {
    const L = (id, pid, o) => ({ id, kind: "product", name: pid, barcode: null, unit_price: 1000, qty: 1, stock: 10, product_id: pid, subcategory: null, priceManual: false, ...o });
    const LIST = [PA, PB, PE, PF];
    const S = use(await session(M, {
      products: LIST,
      draft: draftOf([
        L("p:pA", "pA", { unit_cost: 1250, unit_price: 2000, stock: 50 }),
        L("p:pB", "pB", { unit_cost: 96, unit_price: 150, qty: 3, stock: 5, hasSubUnit: true, unitsPerBox: 10, subUnitName: "سرنجة", boxPrice: 1400, subPrice: 150, boxCost: 960, saleUnit: "sub" }),
        L("p:pGone", "pGone", { unit_cost: 999, unit_price: 1500 }),
        L("p:pGone2", "pGone2", { unit_cost: 1000, unit_price: 1600, hasSubUnit: true, unitsPerBox: 4, subUnitName: "قطعة", boxPrice: 1600, subPrice: 450, boxCost: 1000, saleUnit: "box" }),
        L("p:pF", "pF", { unit_cost: 500, unit_price: 800 }),
        L("r:pA", "pA", { unit_cost: 1250, unit_price: 2000, stock: null, ret: true }),
      ]),
    }));
    const k = (id) => S.costOf(id);
    ck("د١٢) مسودّةٌ بكلفة الجهاز القديمة تُفتح بكلفة الخادم: العلبةُ ١١٧١٫٤٣ والمفردُ ١٠٠٫١١ والمرتجعُ ١١٧١٫٤٣ — وما غاب صفُّه (٩٩٩) ومادّةُ الحقل (٥٠٠) بكلفتهما",
      k("p:pA") === 1171.43 && k("p:pB") === 100.11 && k("r:pA") === 1171.43 && k("p:pGone") === 999 && k("p:pGone2") === 1000 && k("p:pF") === 500,
      J(S.cart().map((l) => [l.id, l.unit_cost])));
    await S.unit("p:pGone2", "sub");
    await S.unit("p:pB", "box");
    ck("  والتبديلُ لمادّةٍ غابت عن القائمة بكلفة الجهاز كما كانت (١٠٠٠ ÷ ٤ = ٢٥٠)، ولما بالقائمة بكلفة الخادم (١٠٠١٫٠٥ لا ٩٦٠)",
      k("p:pGone2") === 250 && k("p:pB") === 1001.05, J([k("p:pGone2"), k("p:pB")]));
    await S.checkout();
    const rows = sendRows(S, LIST);
    const sent = Object.fromEntries(rows.map((r) => [r.id, r.sent]));
    ck("  والإتمامُ: ما لا يعرفه الجهاز ومادّةُ الحقل بكلفة الجهاز (يأخذها الخادمُ لهما)، والباقي بما يكتبه الخادم، بلا خطأ رسم",
      rows.length === 6 && rows.every((r) => r.sent === r.booked) && J(sent) === J({ "p:pA": 1171.43, "p:pB": 1001.05, "p:pGone": 999, "p:pGone2": 250, "p:pF": 500, "r:pA": 1171.43 })
      && S.ui.errors.length === 0, J({ rows, errors: S.ui.errors.map(String) }));
  }, true);

  await scenario("د١٣", async (use) => {
    const S = use(await session(M, { products: [PA] }));
    await S.tap("pA");
    const c = [S.costOf("p:pA")];
    await S.setProducts([{ ...PA, avg_cost: 1300.004999 }]); c.push(S.costOf("p:pA"));
    await S.setProducts([{ ...PA, avg_cost: 1300.005 }]); c.push(S.costOf("p:pA"));
    ck("د١٣) القائمةُ تتحدّث (شراءٌ من جهازٍ آخر حرّك المتوسّط) ⇒ السطرُ القائم يتبعها كما يكتبها الخادمُ لحظةَ البيعة: ١١٧١٫٤٣ ← ١٣٠٠٫٠٠ ← ١٣٠٠٫٠١",
      J(c) === J([1171.43, 1300, 1300.01]), J(c));
    ck("  والمعاينةُ معها (٢٬٠٠٠ − ١٣٠٠٫٠١)، بلا خطأ رسم", !!S.profit()?.includes(M.money(2000 - 1300.01)) && M.money(2000 - 1300.01) !== M.money(2000 - 1250)
      && S.ui.errors.length === 0, J({ profit: S.profit(), errors: S.ui.errors.map(String) }));
  }, true);

  /* د١٤) سطورٌ أقدم من مادّتها (مسودّةٌ من أمس، أو وحدةٌ تبدّلت بجهازٍ آخر والسلّةُ مفتوحة): الإتمامُ يقسم stock_qty بـunitsPerBox
   * **السطر**، والخادمُ يقرّر المفردَ منه ثم يقسم الكلفةَ بقاسم المادّة الحيّ — فالشاشةُ تكلّف بالحكمين كما هما. وكيلو المسودّة
   * بكلفته القديمة يُعاد كذلك. */
  await scenario("د١٤", async (use) => {
    const L = (id, pid, o) => ({ id, kind: "product", name: pid, barcode: null, qty: 1, product_id: pid, subcategory: null, priceManual: false, ...o });
    const LIST = [PB, PD, PH, PJ];
    const S = use(await session(M, {
      products: LIST,
      draft: draftOf([
        L("p:pH", "pH", { unit_cost: 800, unit_price: 150, qty: 3, stock: 6, hasSubUnit: true, unitsPerBox: 1, subUnitName: "قطرة", boxPrice: 1500, subPrice: 150, boxCost: 800, saleUnit: "sub" }),
        L("p:pB", "pB", { unit_cost: 960, unit_price: 1400, stock: 5, hasSubUnit: true, unitsPerBox: 1, subUnitName: "سرنجة", boxPrice: 1400, subPrice: 150, boxCost: 960, saleUnit: "box" }),
        L("p:pJ", "pJ", { unit_cost: 30, unit_price: 25, qty: 2, stock: 5, hasSubUnit: true, unitsPerBox: 4, subUnitName: "حقنة", boxPrice: 200, subPrice: 25, boxCost: 120, saleUnit: "sub" }),
        L("p:pD", "pD", { unit_cost: 3000, unit_price: 5000, qty: 0.375, stock: 20, byWeight: true, perKgPrice: 5000, perKgCost: 3000 }),
      ]),
    }));
    const k = (id) => S.costOf(id);
    ck("د١٤) مسودّةٌ بسطورٍ أقدم من مادّتها: مفردٌ قاسمُه ١ والمادّةُ ١٢ بالعلبة يُكتب علبة (١١٧١٫٤٣ لا ٩٧٫٦٢)، وقاسمُه ٤ والمادّةُ ١٠ بقسمة الخادم على ١٠ (١٢٫٨٢ لا ٣٢٫٠٤)، والكيلو ٣٣٣٣٫٣٣ لا ٣٠٠٠",
      k("p:pH") === 1171.43 && k("p:pJ") === 12.82 && k("p:pD") === 3333.33, J(S.cart().map((l) => [l.id, l.unit_cost])));
    await S.unit("p:pB", "sub");
    ck("  والتبديلُ لمفردٍ بسطرٍ قاسمُه ١ (والمادّةُ ١٠ بالعلبة): stock_qty = الكمية فالخادمُ يكتبه علبة ⇒ ١٠٠١٫٠٥ (لا ١٠٠٫١١)",
      k("p:pB") === 1001.05 && S.cart().find((l) => l.id === "p:pB")?.saleUnit === "sub", J(S.cart().find((l) => l.id === "p:pB")));
    await S.checkout();
    const rows = sendRows(S, LIST);
    ck("  والإتمامُ: كلُّ سطرٍ منها يُرسل ما يكتبه الخادمُ لكميّته وstock_qty كما أُرسلا (مرآةُ _product_line_cost)، بلا خطأ رسم",
      rows.length === 4 && rows.every((r) => r.sent === r.booked)
      && J(Object.fromEntries(rows.map((r) => [r.id, r.sent]))) === J({ "p:pH": 1171.43, "p:pB": 1001.05, "p:pJ": 12.82, "p:pD": 3333.33 })
      && S.ui.errors.length === 0, J({ rows, errors: S.ui.errors.map(String) }));
  }, true);
}

/* ── هـ٠) حسابُ الكلفة لم يصل: «—» لا ربحٌ بآخر سعر شراء، والبيعةُ تمشي، والفتحةُ التالية تعيد طلبَه ─────────
 * يجري قبل أيّ تحميلٍ ناجح بالحزمة: الحسابُ إن وصل مرّةً بقي للتبويب كلِّه (كالإنتاج بين التبويبات). */
async function failChecks(M, ck, setFail, setHold) {
  const lineA = { id: "p:pA", kind: "product", name: PA.name, barcode: null, unit_price: 2000, unit_cost: 1250, qty: 2, stock: 50, product_id: "pA", subcategory: null, saleUnit: "box", priceManual: false };
  setFail(true);
  let S = await session(M, { products: [PA, PB], draft: draftOf([lineA]) });
  const p0 = S.profit();
  await S.tap("pB");
  const bCost = S.costOf("p:pB");
  const p1 = S.profit();
  await S.checkout();
  const sent = (S.log.checkout[0]?.items ?? []).map((x) => x.unit_cost);
  const errs = S.ui.errors.map(String);
  S.end();
  S = await session(M, { draft: draftOf([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a")]) });
  const pSvc = S.profit();
  S.end();
  ck("هـ٠) حسابُ كلفة المادّة فشل تحميلُه ⇒ معاينةُ الربح «—» ما دام بالسلّة سطرُ مادّة (لا ربحاً بآخر سعر شراء)، وسلّةُ خدماتٍ وحدها برقمها — والبيعةُ تمشي بكلفة الجهاز",
    !!p0?.includes("—") && !!p1?.includes("—") && !!pSvc && !pSvc.includes("—") && pSvc.includes(M.money(25000 - 1000 - 3000))
    && bCost === PB.purchase_price && J(sent) === J([1250, PB.purchase_price]) && errs.length === 0, J({ p0, p1, pSvc, bCost, sent, errs }));
  /* سطرُ المادّة الراجعُ وحده (مع خدمةٍ تُبقي السلّةَ بيعة) سطرُ مادّةٍ كذلك: الخادمُ يكلّفه بنفسه كالبيع. */
  S = await session(M, { products: [PA], draft: draftOf([svcLine("s:a0a0a0a0-0000-4000-8000-00000000000a", "a0a0a0a0-0000-4000-8000-00000000000a"), { ...lineA, id: "r:pA", qty: 1, stock: null, ret: true }]) });
  const pRet = S.profit();
  S.end();
  ck("  وسلّةٌ مادّتُها راجعٌ وحده (مع خدمة): «—» كذلك — كلفةُ الراجع يكتبها الخادمُ لا آخرُ سعر شراء", !!pRet?.includes("—"), J(pRet));
  setFail(false);
  /* والفتحةُ التالية والقطعةُ بالطريق (تُنزَّل لأوّل مرّة): «—» حتى تصل — لا ربحٌ بكلفة الجهاز — ثم الرقم. */
  let release = () => {};
  setHold(new Promise((r) => { release = r; }));
  S = await session(M, { products: [PA], draft: draftOf([lineA]) });
  const pWait = S.profit(), costWait = S.costOf("p:pA");
  setHold(null); release(M.__cons); await flush();
  const after = S.costOf("p:pA"), p2 = S.profit();
  S.end();
  ck("  وهو بالطريق لم يصل بعد: «—» كذلك والسطرُ بكلفة الجهاز حتى يصل — لا ربحاً بآخر سعر شراء",
    !!pWait?.includes("—") && costWait === 1250, J({ pWait, costWait }));
  ck("  وفتحةُ الشاشة التالية تعيد طلبَه: يصل، والسطرُ بكلفة الخادم (١١٧١٫٤٣ لا ١٢٥٠) والمعاينةُ برقمها",
    after === 1171.43 && !!p2?.includes(M.money(2 * 2000 - 2 * 1171.43)) && !p2.includes("—"), J({ after, p2 }));
}

/* ── ط) تسخينُ القطعة: أوّلُ تركيبٍ بالحزمة (React.lazy يخبّئ ما حمّله — فالتركيبُ الأوّل وحده يقيس) ───────────────
 * شاشةُ «تمّ» تطلب الإشعارَ بعد كلّ بيعةٍ تقريباً، وأوّلُ طلبٍ للقطعة هناك — بتبويبٍ استولت عليه نسخةٌ أحدث وحُذفت قطعتُه
 * القديمة — كان يحمّل الصفحة (appUpdate) ويرمي الإيصال. فالقطعةُ وقاموسُ rcp يُطلبان مع الشاشة، والتسخينُ لا يرسم شيئاً،
 * وفشلُه صامت (الورقةُ والإشعارُ يقولان فشلَهما بمكانهما) ويُعاد بالفتحة التالية. */
async function warmChecks(M, ck, setWarmFail) {
  const P = () => globalThis.__pages ?? [];
  // ومعها منذ 0258 ثلاثُ قطع خانات الطبيب (الشريطُ والشبكةُ والمحرّر) بنطاقها ptab، ومنذ 0267 تسخينُ نصوص الكارتون بنطاقها pks —
  // قطعةُ المستهلكات تبقى ثلاثاً بنطاقها.
  const rcpPages = () => P().filter((p) => J(p.ns) === J(["rcp"]));
  // ومنذ 0269 تسخينُ نصوص سطور الطبلة بنطاقها dosl.
  ck("ط١) ثلاثُ قطعٍ كسولة عند التحميل كلٌّ بنطاقها rcp: الورقة، والإشعار، والتسخين — وثلاثٌ لخانات الطبيب بنطاقها ptab، وتسخينُ الكارتون بـpks وسطورِ الطبلة بـdosl، ولا غيرُها",
    rcpPages().length === 3 && P().length === 8 && P().filter((p) => J(p.ns) === J(["pks"])).length === 1 && P().filter((p) => J(p.ns) === J(["dosl"])).length === 1
      && P().every((p) => J(p.ns) === J(["rcp"]) || J(p.ns) === J(["ptab"]) || J(p.ns) === J(["pks"]) || J(p.ns) === J(["dosl"])), J(P().map((p) => p.ns)));
  setWarmFail(true);
  const loud = console.error;
  console.error = () => {};   // React يكتب الخطأَ الممسوك بالكونسول — المقيسُ أنه لم يُفلت
  let S = null;
  try { S = await session(M); } finally { console.error = loud; }
  const calls = rcpPages().map((p) => p.calls);
  ck("  وأوّلُ تركيبٍ يطلب التسخينَ وحده قبل أيّ بيعة — لا الورقةَ ولا الإشعار", calls[2] === 1 && calls[0] === 0 && calls[1] === 0 && S.log.checkout.length === 0, J(calls));
  ck("  وفشلُ التسخين صامت: لا خطأ رسم، والشاشةُ بمكانها (لا حارسَ يقول «تعذّر» بلا شيءٍ طُلب)",
    S.ui.errors.length === 0 && !!S.ui.find("data-retmode") && !S.ui.all().some((n) => n.type === "x-LoadBoundary" && n.props?.scope === "cons-warm"),
    J({ errors: S.ui.errors.map(String) }));
  S.end();
  setWarmFail(false);
  S = await session(M);
  const w = rcpPages()[3];
  ck("  ويُعاد بالفتحة التالية: قطعةُ تسخينٍ جديدة يطلبها التركيبُ التالي وتصل بلا خطأ", rcpPages().length === 4 && J(w?.ns) === J(["rcp"]) && w?.calls === 1 && S.ui.errors.length === 0,
    J({ n: rcpPages().length, calls: rcpPages().map((p) => p.calls), errors: S.ui.errors.map(String) }));
  S.end();
}

/* ── التشغيل ───────────────────────────────────────────────────────────────── */
async function runSuite(source, verbose) {
  /* `infra`: فحصٌ يقول إن الحزمةَ أو الرسمَ أو كتلةً جرت (لا ما تفعله الشاشة) — يُعدّ كغيره، لكنه وحده لا يُمسك طفرة. */
  const R = { pass: 0, fail: [], infra: [] };
  const ck = (name, ok, detail = "", infra = false) => {
    if (ok) { R.pass++; if (verbose) console.log(`   ✓ ${name}`); }
    else { R.fail.push(name); if (infra) R.infra.push(name); if (verbose) console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
  };
  if (verbose) console.log("▸ بالنصّ — SaleBuilder.tsx بلا تعليقات");
  for (const c of textChecks(source)) ck(c.name, c.ok, c.detail);
  let M;
  try { M = await build(source); } catch (e) { ck("SaleBuilder.tsx يُحزم ببدائله", false, String(e.message).split("\n").slice(0, 3).join(" | "), true); return R; }
  ck("SaleBuilder.tsx يُحزم ببدائله وتُصدَّر دوالُّه الصِّرفة", typeof M.SaleBuilder === "function" && typeof M.consSaved === "function" && typeof M.serviceLineId === "function", "", true);
  /* بابُ حساب الكلفة (import("@/lib/consumption") بالشاشة): الوحدةُ الحقيقية، أو فشلُ تحميل قطعةٍ كما يقوله المتصفّح، أو قطعةٌ
   * بالطريق (`consHold`: وعدٌ يحلّه الفحصُ متى شاء). */
  let consFail = false, consHold = null;
  globalThis.__consImport = () => (consFail ? Promise.reject(new TypeError("Failed to fetch dynamically imported module")) : consHold ?? Promise.resolve(M.__cons));
  let warmFail = false;
  globalThis.__warmImport = (real) => (warmFail ? Promise.reject(new TypeError("Failed to fetch dynamically imported module")) : real());
  if (verbose) console.log("▸ بالسلوك — تسخينُ قطعة الورقة والإشعار مع الشاشة (أوّلُ تركيبٍ بالحزمة)");
  /* وحسابُ الكلفة فاشلٌ أثناءها: الحسابُ إن وصل مرّةً بقي للحزمة كلِّها، وهـ٠ بعدها يقيس «قبل أيّ تحميلٍ ناجح». */
  consFail = true;
  try { await warmChecks(M, ck, (v) => { warmFail = v; }); } catch (e) { ck("ط) فحصُ التسخين جرى حتى آخره", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), true); }
  consFail = false;
  if (verbose) console.log("▸ بالسلوك — حسابُ كلفة المادّة يفشل تحميلُه ثم يصل (قبل أيّ تحميلٍ ناجح بالحزمة)");
  try { await failChecks(M, ck, (v) => { consFail = v; }, (p) => { consHold = p; }); } catch (e) { ck("هـ٠) فحصُ فشل التحميل جرى حتى آخره", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), true); }
  if (verbose) console.log("▸ بالسلوك — الدوالُّ الصِّرفة (الفصل، الإضافة، المسودّة، الكلفة)");
  try { await unitChecks(M, ck); } catch (e) { ck("الدوالُّ الصِّرفة جرت حتى آخرها", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), true); }
  if (verbose) console.log("▸ بالسلوك — كلفةُ سطر المادّة (productLineCost، recostLines) بمرآة _product_line_cost");
  try { await costChecks(M, ck); } catch (e) { ck("هـ) فحوصُ الكلفة جرت حتى آخرها", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), true); }
  if (verbose) console.log("▸ بالسلوك — الشاشةُ مرسومة (react-mini)");
  await mountChecks(M, ck);
  return R;
}

const MUTANTS = [
  ["الإضافةُ تزيد السطرَ المعدَّل", 'l.serviceId === serviceId && !Array.isArray(l.consumables) && !l.id.startsWith("s:lab:")', 'l.serviceId === serviceId && !l.id.startsWith("s:lab:")'],
  ["الإضافةُ تزيد بندَ المختبر", 'l.serviceId === serviceId && !Array.isArray(l.consumables) && !l.id.startsWith("s:lab:")', "l.serviceId === serviceId && !Array.isArray(l.consumables)"],
  ["الإضافةُ لا تمرّ من serviceLineId", "const id = serviceLineId(cartRef.current, s.id);", "const id = `s:${s.id}`;"],
  ["رقمُ الحالة ليس أصغرَ حرّ", "while (ids.has(`${base}#${k}`)) k++;", "while (ids.has(`${base}#${k}`)) k += 2;"],
  ["التعديلُ على الأصل لا على النسخة", "out.splice(at, 1, { ...l, qty: l.qty - 1 }, withCons({ ...l, id: copyId, qty: 1 }));", "out.splice(at, 1, withCons({ ...l, qty: l.qty - 1 }), { ...l, id: copyId, qty: 1 });"],
  ["الأصلُ يتبدّل معرّفُه", "{ ...l, qty: l.qty - 1 }, withCons", "{ ...l, id: `${l.id}~`, qty: l.qty - 1 }, withCons"],
  ["الحالةُ لا تُنقص من أصلها", "{ ...l, qty: l.qty - 1 }, withCons", "{ ...l }, withCons"],
  ["النسخةُ بآخر السلّة", "out.splice(at, 1, { ...l, qty: l.qty - 1 }, withCons({ ...l, id: copyId, qty: 1 }));", "out.splice(at, 1, { ...l, qty: l.qty - 1 }); out.push(withCons({ ...l, id: copyId, qty: 1 }));"],
  ["النسخةُ بأصل الخدمة لا بأصل السطر", "const copyId = nextCaseId(cart, l.id);", "const copyId = nextCaseId(cart, `s:${l.serviceId}`);"],
  ["الكلفةُ لا تُحفظ مع التعديل", "if (next !== null) { y.consumables = next; y.consEst = est; }", "if (next !== null) { y.consumables = next; }"],
  ["«رجّع للوصفة» يُبقي القديم", "delete y.consumables; delete y.consEst;", ""],
  ["«هالحالة بس» بحالةٍ واحدة تفصل", 'if (scope === "line" || l.qty < 2)', 'if (scope === "line")'],
  ["الحفظُ لا يصل السلّة", "setCart((c) => consSaved(c, id, next, est, scope).cart);", ""],
  ["الورقةُ مفتوحةٌ بعد الحفظ", "    setConsFor(null);\n    playSuccess();", "    playSuccess();"],
  ["سطرٌ غاب والورقةُ معلّقة", "if (consFor && (done || !cart.some((l) => l.id === consFor && !!cloudServiceId(l)))) setConsFor(null);", "if (false) setConsFor(null);"],
  ["بيعةٌ تمّت والماسحُ صامت", "if (consFor && (done || !cart.some(", "if (consFor && (!cart.some("],
  ["المسودّةُ تُبقي المكسور", "const consumables = draftConsumables(l.consumables);", "const consumables = l.consumables as ConsumableEntry[] | undefined;"],
  ["المسودّةُ تُسقط السليم", "if (consumables) {\n    out.consumables = consumables;", "if (false) {\n    out.consumables = consumables;"],
  ["المسودّةُ تقبل أربعَ مراتب", " || Math.round(e.qty * 1000) / 1000 !== e.qty", ""],
  ["المسودّةُ تقبل مادّةً مكرّرة", "if (seen.has(k)) return undefined;", ""],
  ["الملخّصُ الفاشل كلفتُه صفر", 'if (!sum || "error" in sum) return null;', 'if (!sum || "error" in sum) return 0;'],
  ["التعديلُ يُحسب بالوصفة", 'if (Array.isArray(l.consumables)) return typeof l.consEst === "number" && Number.isFinite(l.consEst) ? l.consEst : null;', ""],
  ["الإشعارُ لكلّ بيعة", 'return Array.isArray(l.consumables) || !sum || "error" in sum || !!sum.data[sid];', "return true;"],
  ["لا إشعارَ بعد البيعة", "setDoneCons(cart.some((l) => noticeLine(l, consSum)));", "setDoneCons(false);"],
  // شاشةُ «تمّ» وسطرُ المادّة (0253 لا يقصّ عند الصفر)
  ["الإشعارُ يبقى من البيعة السابقة", "setDoneCons(cart.some((l) => noticeLine(l, consSum)));", ""],
  ["سطرُ المادّة لا يُركّب الإشعار", "return consCandidate(l, sum) || (!!l.product_id && !l.ret);", "return consCandidate(l, sum);"],
  ["الراجعُ يُركّب الإشعار", "return consCandidate(l, sum) || (!!l.product_id && !l.ret);", "return consCandidate(l, sum) || !!l.product_id;"],
  // ملخّصُ الوصفات يتجدّد بتابٍ مفتوحٍ طولَ النهار
  ["الملخّصُ لا يتجدّد مع القائمة", "useEffect(() => { warmConsSummary(); }, [products]);", "useEffect(() => { warmConsSummary(); }, []);"],
  ["الملخّصُ لا يتجدّد مع البيعة الجديدة", "useEffect(() => { if (saleStarted) warmConsSummary(); }, [saleStarted]);", ""],
  ["الإتمامُ لا يسأل الملخّص", "    warmConsSummary();\n    checkingRef.current = true;", "    checkingRef.current = true;"],
  ["شاشةُ «تمّ» لا تتبع الملخّص", "if (done && !doneCons && cart.some((l) => noticeLine(l, consSum))) setDoneCons(true);", ""],
  ["الملخّصُ بلا نافذة طزاجة", "if (at !== null && now >= at && now - at < CONS_SUM_FRESH_MS) return;", ""],
  ["الساعةُ الراجعة تُسكت القراءة", "if (at !== null && now >= at && now - at < CONS_SUM_FRESH_MS) return;", "if (at !== null && now - at < CONS_SUM_FRESH_MS) return;"],
  ["الفاشلُ يُحسب طازجاً", "      consSumAtRef.current = null;   // الفاشلُ ليس طازجاً: يُعاد بأوّل فرصة\n", ""],
  ["الملخّصُ يُمحى أثناء الإعادة", "    consSumAtRef.current = now;\n    const seq", "    consSumAtRef.current = now;\n    setConsSum(null);\n    const seq"],
  ["الفشلُ بعد ملخّصٍ صالح يُبقيه", "      setConsSum({ error });\n    };", "      setConsSum((s) => (s && \"data\" in s ? s : { error }));\n    };"],
  // تسخينُ قطعة الورقة والإشعار مع الشاشة
  ["لا تسخينَ عند الفتح", "      <ConsWarmBoundary><Suspense fallback={null}><ConsWarmLazy /></Suspense></ConsWarmBoundary>\n", ""],
  ["التسخينُ بلا rcp", ".then(() => ({ default: ConsWarmDone })), [\"rcp\"]);", ".then(() => ({ default: ConsWarmDone })), []);"],
  ["التسخينُ لا يُعاد بعد فشله", "    ConsWarmLazy = loadConsWarm();   // `lazy()` يخبّئ الرفض: الفتحةُ التالية تطلب قطعةً جديدة\n", ""],
  ["الماسحُ يسمع خلف الورقة", "|| !!consFor || medPickerOpen", "|| medPickerOpen"],
  ["F2 خلف الورقة", "      if (consFor) return;", ""],
  ["قصُّ المعرّف عاد", 'const sid = l.serviceId ?? "";', 'const sid = l.id.startsWith("s:") ? l.id.slice(2) : "";'],
  ["البندُ بلا service_id", "...(sid ? { service_id: sid, ...(Array.isArray(l.consumables) ? { consumables: l.consumables } : {}) } : !l.product_id && l.kind !== \"service\" ? { service_id: null } : {}),", ""],
  ["سطرُ الدواء بلا service_id صريح", ": !l.product_id && l.kind !== \"service\" ? { service_id: null } : {}),", ": {}),"],
  ["بندُ الخدمة بلا معرّف يُرسل null", "!l.product_id && l.kind !== \"service\" ? { service_id: null }", "!l.product_id ? { service_id: null }"],
  ["أجرةُ التوصيل بلا service_id صريح", "unit_label: null, service_id: null });", "unit_label: null });"],
  ["التعديلُ لا يُرسل", "{ service_id: sid, ...(Array.isArray(l.consumables) ? { consumables: l.consumables } : {}) }", "{ service_id: sid }"],
  ["معرّفٌ ليس uuid يُرسل", "SVC_UUID.test(l.serviceId) ? l.serviceId : null;", "true ? l.serviceId : null;"],
  ["uuid بحروفٍ كبيرة لا يُرسل", "[0-9a-f]{12}$/i;", "[0-9a-f]{12}$/;"],
  ["القائمةُ تتجاوز البوّابة", "...(sid ? { service_id: sid,", "...(l.kind === \"service\" && !l.ret && l.serviceId ? { service_id: l.serviceId,"],
  ["استيرادٌ ثابتٌ للباب", 'import { page } from "@/lib/lazyPage";', 'import { page } from "@/lib/lazyPage";\nimport { consumptionApi as _ca } from "@/lib/consumptionApi";'],
  ["الشارةُ على بندٍ بلا معرّف", "{!!cloudServiceId(l) && (consOn", '{l.kind === "service" && !l.ret && (consOn'],
  ["الشارةُ على معرّفٍ ليس uuid", "{!!cloudServiceId(l) && (consOn", '{l.kind === "service" && !l.ret && !!l.serviceId && (consOn'],
  ["الشارةُ بلا نقطة", "{Array.isArray(l.consumables) && <span data-consdot", "{false && <span data-consdot"],
  ["الشارةُ تختفي عن المعدَّل", "(consOn || Array.isArray(l.consumables)) && (", "consOn && ("],
  ["الشارةُ وملخّصٌ فارغ", "Object.keys(consSum.data).length > 0", "true"],
  ["الشارةُ والملخّصُ بالطريق", 'const consOn = !!consSum && ("error" in consSum', 'const consOn = !consSum || ("error" in consSum'],
  ["الشارةُ داخل سطر الاسم المقصوص", '<span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("retail.service", "Service")}</span>}',
    '<span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("retail.service", "Service")}</span>}<button type="button" data-conschip={l.id} onClick={() => openCons(l.id)} className="chip">{t("pos.cat.consumables", "مستهلكات")}</button>'],
  ["الملخّصُ بلا مهلة", ".then((m) => withTimeout(m.consumptionApi.recipeSummary(), 10000))", ".then((m) => m.consumptionApi.recipeSummary())"],
  ["التعديلُ لكلّ دور", 'const consCanEdit = effRole === "manager" || effRole === "veterinarian";', "const consCanEdit = true;"],
  ["الكلفةُ لمن لا يرى الأرباح", "canEdit={consCanEdit} showCost={showProfit}", "canEdit={consCanEdit} showCost"],
  ["الربحُ لكلّ دور", "{showProfit && <div data-profitpreview", "{true && <div data-profitpreview"],
  ["ربحُ «تمّ» لكلّ دور", '{showProfit && <span className="flex items-center gap-1 text-success-600">', '{true && <span className="flex items-center gap-1 text-success-600">'],
  ["الربحُ منفوخٌ والكلفةُ مجهولة", "const profitShown = consCost === null || lineCostUnknown ? null : profit - consCost;", "const profitShown = consCost === null ? profit : lineCostUnknown ? null : profit - consCost;"],
  ["الربحُ بلا مستهلكات", "const profitShown = consCost === null || lineCostUnknown ? null : profit - consCost;", "const profitShown = consCost === null || lineCostUnknown ? null : profit;"],
  ["الملخّصُ لا يُعاد بالضغطة", 'if (consSum && "error" in consSum) warmConsSummary();', ""],
  ["الفصلُ يكرّر «بانتظار النتائج»", "if (repeatsCase(cart, l)) continue;", ""],
  ["الفصلُ يكرّر العملية", 'if (l.kind !== "service" || repeatsCase(cart, l)) return { l, m: null };', 'if (l.kind !== "service") return { l, m: null };'],
  ["الوميضُ بالمعرّف الكامل", "flashId={flash && caseBase(flash)}", "flashId={flash}"],
  ["الكسورُ تُعرض «هالحالة بس»", "lineQty={l.qty >= 2 ? l.qty : 1}", "lineQty={l.qty}"],
  // كلفةُ سطر المادّة (0255)
  ["المرتجعُ بآخر سعر شراء", "unit_cost: productLineCost(p, null, p.purchase_price),\n        qty: 1, stock: null,", "unit_cost: p.purchase_price,\n        qty: 1, stock: null,"],
  ["الوزنُ بآخر سعر شراء", "unit_cost: productLineCost(p, null, p.purchase_price),\n      qty, stock:", "unit_cost: p.purchase_price,\n      qty, stock:"],
  ["العلبةُ بآخر سعر شراء", "unit_cost: productLineCost(p, startSub ? unitsPerBox : null, startSub ? subCost : p.purchase_price),", "unit_cost: startSub ? productLineCost(p, unitsPerBox, subCost) : p.purchase_price,"],
  ["المفردُ الأوّل بقسمةٍ عائمة لسعر الشراء", "unit_cost: productLineCost(p, startSub ? unitsPerBox : null, startSub ? subCost : p.purchase_price),", "unit_cost: startSub ? subCost : productLineCost(p, null, p.purchase_price),"],
  ["المفردُ الأوّل بكلفة العلبة", "unit_cost: productLineCost(p, startSub ? unitsPerBox : null, startSub ? subCost : p.purchase_price),", "unit_cost: productLineCost(p, null, startSub ? subCost : p.purchase_price),"],
  ["التبديلُ بكلفة الجهاز", "const unit_cost = productLineCost(products.find((p) => p.id === l.product_id), toSub ? (l.unitsPerBox as number) : null, device);", "const unit_cost = device;"],
  ["التبديلُ للمفرد بكلفة العلبة", "products.find((p) => p.id === l.product_id), toSub ? (l.unitsPerBox as number) : null, device);", "products.find((p) => p.id === l.product_id), null, device);"],
  // قاسمُ المفرد من المادّة لا من السطر (ما كان قبل التصليح): سطرٌ قاسمُه ١ يُكتب علبة، والحكمُ بقاسم المادّة يقول مفرداً
  ["التبديلُ يحكم بقاسم المادّة لا السطر", "products.find((p) => p.id === l.product_id), toSub ? (l.unitsPerBox as number) : null, device);", "products.find((p) => p.id === l.product_id), toSub ? (products.find((p) => p.id === l.product_id)?.units_per_box ?? null) : null, device);"],
  ["إعادةُ الكلفة تحكم بقاسم المادّة لا السطر", "l.unitsPerBox > 0 ? l.unitsPerBox : null, l.unit_cost);", "l.unitsPerBox > 0 ? (byId.get(l.product_id)?.units_per_box ?? null) : null, l.unit_cost);"],
  ["القسمةُ بقاسم السطر لا المادّة", "m.productLineCostCents(p, 1000n, per != null", "m.productLineCostCents(per != null && per > 0 ? { ...p, units_per_box: per } : p, 1000n, per != null"],
  ["الحقلُ بكلفة الخادم", "return p && !p.farm_id && lineCostFn ? lineCostFn(p, per) : device;", "return p && lineCostFn ? lineCostFn(p, per) : device;"],
  ["ما لا يعرفه الجهاز بكلفةٍ صفر", "return p && !p.farm_id && lineCostFn ? lineCostFn(p, per) : device;", "return lineCostFn && !p?.farm_id ? lineCostFn(p ?? ({} as Product), per) : device;"],
  ["المتوسّطُ يُتجاهل", "m.productLineCostCents(p, 1000n,", "m.productLineCostCents({ ...p, avg_cost: null }, 1000n,"],
  ["الحسابُ بالعائم", "return m.fromScaled(m.productLineCostCents(p, 1000n, per != null && per > 0 ? m.roundScaled(1 / per, 3) : 1000n, 0n), 2);",
    "return Math.max(0, Math.round(((p.avg_cost ?? p.purchase_price ?? 0) / (per != null && per !== 1 && p.has_sub_unit && (p.units_per_box ?? 0) > 0 ? (p.units_per_box as number) : 1)) * 100) / 100);"],
  ["المفردُ بلا فرعه بالخادم", "per != null && per > 0 ? m.roundScaled(1 / per, 3) : 1000n", "1000n"],
  ["لا إعادةَ كلفةٍ للسلّة", "    setCart((c) => recostLines(c, byId));\n", "\n"],
  ["الكلفةُ لا تتبع القائمة", "}, [products, lineCostState]);", "}, [lineCostState]);"],
  ["إعادةُ الكلفة تتخطّى المرتجع", "if (l.kind !== \"product\" || !l.product_id) return l;\n    const unit_cost", "if (l.kind !== \"product\" || !l.product_id || l.ret) return l;\n    const unit_cost"],
  ["إعادةُ الكلفة تتخطّى الكيلو", "if (l.kind !== \"product\" || !l.product_id) return l;\n    const unit_cost", "if (l.kind !== \"product\" || !l.product_id || l.byWeight) return l;\n    const unit_cost"],
  ["إعادةُ الكلفة تعامل المفردَ علبة", "l.saleUnit === \"sub\" && !!l.unitsPerBox && l.unitsPerBox > 0 ? l.unitsPerBox : null, l.unit_cost);", "null, l.unit_cost);"],
  ["إعادةُ الكلفة تمسّ السعرَ اليدويّ", "    changed = true;\n    return { ...l, unit_cost };", "    changed = true;\n    return { ...l, unit_cost, priceManual: false };"],
  ["المعاينةُ والحسابُ لم يصل", "const profitShown = consCost === null || lineCostUnknown ? null : profit - consCost;", "const profitShown = consCost === null ? null : profit - consCost;"],
  ["«—» بسلّة خدماتٍ بلا مادّة", "const lineCostUnknown = lineCostState !== \"ready\" && cart.some((l) => l.kind === \"product\" && !!l.product_id);", "const lineCostUnknown = lineCostState !== \"ready\";"],
  ["«—» للفاشل وحده لا لما بالطريق", "const lineCostUnknown = lineCostState !== \"ready\" && cart.some(", "const lineCostUnknown = lineCostState === \"failed\" && cart.some("],
  ["«—» يتجاهل سطرَ المادّة الراجع", "cart.some((l) => l.kind === \"product\" && !!l.product_id);", "cart.some((l) => l.kind === \"product\" && !!l.product_id && !l.ret);"],
  ["الفشلُ لا يُعاد بالفتحة التالية", "(e) => { lineCostLoad = null; throw e; }", "(e) => { throw e; }"],
  ["الفشلُ يُعدّ وصولاً", "() => { if (alive) setLineCostState(\"failed\"); }", "() => { if (alive) setLineCostState(\"ready\"); }"],
  ["الحسابُ لا يُطلب عند الفتح", "    loadLineCost().then(() => { if (alive) setLineCostState(\"ready\"); }", "    Promise.resolve().then(() => { if (alive) setLineCostState(\"ready\"); }"],
  ["استيرادٌ ثابتٌ للحساب", 'import { page } from "@/lib/lazyPage";', 'import { page } from "@/lib/lazyPage";\nimport { productLineCostCents as _plc } from "@/lib/consumption";'],
];

const mutate = process.argv.includes("--mutants");
const R = await runSuite(SRC, !mutate);
let bad = R.fail.length;
const total = R.pass + R.fail.length;
if (total === 0) { bad++; console.error("✗ salebuilder-cons-guard: لم يُفحص شيء — حارسٌ يخرج صفراً بلا كلمة ليس حارساً"); }
if (mutate) {
  console.log(`▸ الأصل: ${R.pass} نجحت، ${R.fail.length} فشلت${R.fail.length ? ` — ${R.fail.join("؛ ")}` : ""}`);
  console.log(`▸ ${MUTANTS.length} طفرة — كلُّ واحدةٍ لازم تُسقط فحصاً`);
  for (const [name, from, to] of MUTANTS) {
    const at = SRC.split(from).length - 1;
    if (at !== 1) { bad++; console.error(`   ✗ ${name}: نصُّها يقع ${at} مرّة بالمصدر (لازم مرّة) — حدّث الطفرة`); continue; }
    /* طفرةٌ تكسر حارساً يكتب React أخطاءَه الممسوكة بالكونسول بكلّ تركيب — العدُّ وحده يُقرأ هنا (التشغيلُ الأصليّ يبقى بصوته). */
    const loud = console.error;
    console.error = () => {};
    let r;
    try { r = await runSuite(SRC.replace(from, to), false); } finally { console.error = loud; }
    const real = r.fail.filter((f) => !r.infra.includes(f));
    if (real.length) console.log(`   ✓ ${name} — أمسكها ${real.length}: ${real.slice(0, 2).join("؛ ")}${real.length > 2 ? "…" : ""}`);
    else if (r.fail.length) { bad++; console.error(`   ✗ ${name} — ما أسقطها فحصٌ يقيس، سقطت بالحزمة أو بخطأٍ رُمي وحده (${r.fail.join("؛ ")}) — طفرةٌ مكسورة لا ممسوكة`); }
    else { bad++; console.error(`   ✗ ${name} — مرّت كلُّ الفحوص (${r.pass})`); }
  }
}
console.log(bad
  ? `\n✗ salebuilder-cons-guard: ${R.pass} نجحت، ${bad} فشلت`
  : `\n✓ salebuilder-cons-guard: ${R.pass} فحصاً (بالنصّ والسلوك)${mutate ? `، و${MUTANTS.length} طفرةً أمسكتها الفحوص كلَّها` : ""}`);
process.exit(bad ? 1 : 0);
