/* ============================================================================
 * سندُ التلف (0254) وبطاقاتُ مستهلكات الخدمات (0252) بالسلوك — react-mini على الشِّفرة الحقيقية:
 * WasteTab.tsx (التبويبُ والبطاقات)، وPendingTab وStockCount من StockCount.tsx. بابُ الخادم بديلٌ يسجّل
 * ما يصله ويرجع ما يُعطى (consumptionApi وrepo)، والحسابُ الدقيق (consumption.ts) والتنسيقُ حقيقيّان،
 * والترجمةُ من ar.json ثم النصِّ الافتراضيّ (كالتطبيق بعد دمج المفاتيح).
 *
 *   أ) فوق الرصيد: الضغطةُ الأولى لا ترسل شيئاً وتسأل بمكان السطر، و«أي، سجّل» ترسله بـack_over؛
 *      ورفضُ الخادم (رصيدٌ تحرّك) يعيد التحميل ويُبقي السند.
 *   ب) المدير: «سجّل وطبّق» (apply) ونتيجتُه بالسطر وخسارتِه، وما بقي تحت الصفر.
 *   ج) غيرُ المدير: «أرسل للمدير» (بلا apply)، «ينتظر موافقة المدير — الرصيد ما يتغيّر»، وما سينزل تحت الصفر.
 *   د) كلفتُها صفر تُقال بالسطر وبالنتيجة (ولمن يرى الكلفة وحده).
 *   هـ) `?inv=` يعبّي بالوحدة الصغيرة بالضبط (مجموعُ المواصفات لكلّ مادة، d = ما رجع)، وما لا يُكتب يُقال —
 *      وبعد تعديلٍ (relink) ما رجع ولم يُصرف من جديد، على جواب القاعدة الحقيقيّ؛ وفاتورةٌ مجهولة «ما لكيناها».
 *   و) فشلُ قراءة الفاتورة: «أعد المحاولة» ولا سطرَ واحد، والإعادةُ تعبّي. وسطرٌ أُضيف والطلبُ بالطريق (أو بعد
 *      إرسالٍ ضاع جوابُه) يبقى بالمسودّة؛ وما دون منزلة الرصيد لا يُقال «راح يصير −0».
 *   ز) PendingTab: شارةُ «سند تلف» و«تلف ٢ مل»، والمعاينةُ بلا حصر، ولا «تغيّر من وقت العدّ» للسند، وكلفةٌ
 *      صفر تُقال، وما بقي تحت الصفر يصل الصفحة — ويبقى ظاهراً بعد إعادة تحميلها (StockCount كاملة). وكلفةُ
 *      العدّ والسحب والراكد بما يلقطه الخادم (stock_unit_cost، 0255) وبعنوانه، والسندُ المعتمد بوحدته بالتقرير.
 *   ح) البطاقات: الفشلُ «أعد المحاولة» لا أصفار، والنجاحُ بأرقامه ووحدته.
 *   ط) **الحارسُ يجرّب نفسه**: كلُّ طفرةٍ تكسر ما يحرسه فحصٌ مسمّى يجب أن تُسقطه — طفرةٌ لا تنطبق
 *      حرفاً واحداً على المصدر تُسقط الفحصَ كلَّه (لا طفرةَ صامتة تمرّ «خضراء»). والطفرةُ تُعاد على
 *      **السيناريو الذي كتب فحصَها** بالتشغيل الحقيقيّ لا على بادئة اسمه: ref.* وmgr.* من سيناريو over، وكان
 *      اختيارُه بالبادئة ينادي سيناريو غيرَ موجود فتُعدّ رميتُه إمساكاً — طفرةٌ لا تغيّر شيئاً مرّت «ممسوكة».
 *   ي) **الدفعةُ لا التراكم (ui2)**: `?inv=&at=` يعبّي ما رجّعه الفعلُ وحده (−Σ qty لأحداث دفعاته) — ترجيعٌ ثانٍ على
 *      الفاتورة لا يعيد تعبئة الأوّل (restored_qty تراكميّ)؛ وما سُجّل هدراً (waste، معلَّقاً أو مطبَّقاً) لا يُعبّأ —
 *      بالدفعات وبلاها، والفاتورةُ المسجّلةُ كلُّها سطرٌ واحد؛ والسطرُ المعبّأ يرسل src_invoice وsrc_batches (كلَّ
 *      دفعةٍ من الرابط رجعت فيها مادتُه، تصاعدياً) والمكتوبُ باليد بلاهما؛ وغيابُ moves أو now_us أو waste «أعد المحاولة» لا «ماكو»؛
 *      والبحثُ بالرمز codeMatcher (طيُّ الحالة وجزءُ الرمز) بالسند وبعدّ اليوم؛ ولا لونَ فوق 700 (لا CSS له).
 *      وكلفةُ معاينة العدّ coalesce لا nullif (متوسّطٌ صفر كلفةٌ صفر) — حارسُ رجوعٍ لشِّفرةٍ صحّت بالجولة الأولى.
 *   ك) **على الشِّفرة القديمة**: WASTE_TAB_SRC / STOCK_COUNT_SRC يحزمان من ملفٍّ آخر (نسخةُ ما قبل تغييرٍ) بلا طفرات،
 *      ويشترط أن يسقط **كلُّ** فحصٍ جديد — فحصٌ جديد يمرّ على الشِّفرة القديمة لا يحرس التغيير. `WASTE_OLD` يسمّي
 *      الجولة: ui2 (افتراضاً: ما قبلها، فيسقط NEW_KEYS وFIX2_KEYS) أو fix2 (شِفرةُ ui2 قبل تدقيقها: يسقط FIX2_KEYS
 *      وحده ويمرّ الباقي). و`--i18n <قطعة.json>` يضع قطعةَ ترجمةٍ لم تُدمج فوق ar.json (يُكرَّر لأكثر من قطعة)؛
 *      وبلاها يُقرأ النصُّ الافتراضيّ بالشِّفرة.
 *   ل) **تدقيق ui2 (fix2)**: سندٌ عُبّي من الفاتورة كلِّها (بلا دفعة) يمنع دفعةً سبقته؛ وجوابٌ بلا items أو بلا
 *      live_qty/restored_qty «أعد المحاولة» لا «ماكو» ولا سندٌ ناقص؛ ودفعاتٌ ليست بالدفتر «الرابط ما يطابق» لا «ماكو»؛
 *      والتوأمان بالاسم كلاهما يُقال بلا مفتاحٍ مكرّر.
 *   م) **الدفعاتُ كلُّها لا أحدثُها (multi)**: سطرٌ عُبّي من دفعتين (فعلان بنافذة إشعارٍ واحدة) يحفظهما معاً، فرابطٌ لاحق
 *      بأيٍّ منهما وحدها لا يعبّيه ثانيةً — كان يُحفظ أحدثُهما فيُعبّأ الأقدمُ مرّةً ثانية ويُشطب مرّتين بعد الموافقة.
 *      وسطرُ هدرٍ دفعاتُه فارغة أو بالشكل القديم (batch_us وحده) «أعد المحاولة».
 *   ن) **التدقيقُ العدائيّ (w5a)**: سقفُ البحث يقول إنه سقف ورمزٌ كُتب كاملاً أوّلاً (more)؛ عنوانُ التعبئة يتبع المعبّأَ والمتخطّى
 *      والمسجّلَ معاً (head)؛ انتهاءُ رفع PIN المدير لا يفكّ السندَ المكتوب ويُقال «محفوظ» (pin)؛ السالبُ بوحدة المخزون (negunit
 *      ومعها mgr.neg/staff.will/will.half/page.negs)؛ الفاصلُ بلغة الواجهة (sep)؛ تاريخُ البطاقات بمساعدات التطبيق (dates)؛
 *      «بالكلفة» لا «بمتوسط الكلفة» (pend.label، report.dead)؛ سطرٌ كُتب باليد والقراءةُ بالطريق يبقى ويأخذ مرجعَ الترجيع، والعدُّ
 *      ما أُضيف، وجوابُ رابطٍ تبدّل لا يُضمّ (race)؛ والإمساكُ بما تضيّعه إعادةُ التحميل لا بوجود السطر (hold).
 *   س) **ui3**: تعديلُ صاحب العيادة على الوصفة يُقال «صاحب العيادة» (by_owner) والغائبُ «موظف» كما كان (owner)؛ وعدُّ الدفعات يُجمع
 *      ويُقارن بالرصيد بالضبط كالخادم — ٠٫٠٥ + ٠٫٠٧ على ٠٫١٢ «مطابق» بلا سبب، والفرقُ الحقيقيّ يُسأل باتجاهه، والرصيدُ العائمُ بمنازله
 *      الثلاث والنصفُ بعيداً عن الصفر كالمرآة (lots)؛ ورفضُ الجرد بتلميح المرآة كالخادم وتعليقُ countError يقولها (errs).
 *   ع) **تدقيق ui3 (ui3f)**: عددٌ أدقّ من ثلاث منازل (٠٫١٢٠٤، أو دفعةٌ ٠٫٠٥٠٤) يُقال بالسطر ويُرفض إرسالُه — لا «الفرق +0» وسببٌ
 *      تُرجعه الموافقةُ إلى الرصيد نفسه، ولا تقريبٌ صامت (fine)؛ ووحدةُ العدّ بالحقل وبالفرق للموزون (كغ) ولما له وحدةٌ صغيرة (علبة)،
 *      والبسيطةُ بلا كلمة (units)، وبانتظار الموافقة كذلك (punit)؛ وتعليقُ countError لا ينسب الرفضَ بلا تلميح لخادمٍ أقدم (errs).
 *   ف) **r3**: رفضُ waste_source_taken (ما عُبّي من فاتورةٍ سجّله غيرُنا قبلنا — والخادمُ يرفض السندَ كلَّه) يُقال بتلميحه، ثمّ تُقرأ
 *      الفاتورةُ من جديد ويُحكم كلُّ سطرٍ بمرجعه بقاعدة التعبئة: ما سُجّل يُشال ويُقال باسمه ووقته بجملتها، والباقي «ما انسجل بعد» ويُرسَل
 *      وحده بقيمه ومراجعه، والصفحةُ تُعاد؛ وقراءةٌ فشلت أو ناقصة أو لا تقول شيئاً لا تشيل شيئاً، وما أُضيف والقراءةُ بالطريق يبقى (taken).
 *      واسمُ المادّة الطويل يلتفّ بملاحظة الشيل وببطاقة التعبئة وبملاحظة ?p= — مقيسٌ بالمتصفّح على ٣٧٥: البطاقةُ بلا لفٍّ كانت تمرّر الصفحة (wrap).
 *   ص) **تدقيق r3 (r3f)**: إعادةُ القراءة تحكم بقاعدة الخادم (0254) لا بالتعبئة — رابطٌ قديم ثمّ تعديلٌ رفع سطرَ الخدمة كان يُبقي المادّةَ
 *      بالسند تُرفض للأبد (relink)؛ وكلُّ فاتورةٍ تحكم سطورَها (twoInv)، والقراءةُ العالقة تفكّ القفلَ بمهلة ٨ ثوانٍ (wait، مؤقّتاتٌ بيد الفحص)،
 *      وسندُ الفاتورة كلِّها بحدّ المللي (wholeEdge)؛ وسندٌ أفرغته القراءةُ يُشال رابطُه وبطاقتُه (emptied) إلا رابطاً تعبئتُه بالطريق
 *      (emptyLoading)، و«الباقي ما انسجل» عن سطور السند
 *      المرفوض وحدها (leftOnly، leftRace)، والملاحظةُ تغيب برابطٍ آخر (nextLink) أو بإفراغ صاحب السند له (handEmpty).
 *   ق–خ) **البيعُ قبل الجرد (0266، neg)** — StockCount كاملة على بابٍ مزيَّف (countPage؛ `@/lib/negStockApi` بديلٌ صريح لأنه كسول):
 *      ما رآه العادّ (seen) صفُّه الطازج لحظةَ أوّل ضغطة لا رصيدُ الصفحة، مجمَّدٌ ومرسَلٌ مع كلّ سطر (seen)، وسؤالُه العالق بمهلة (seenwait)؛ count_moved يمسح ما تحرّك
 *      وحده ويعيد التحميلَ والسؤال (moved، على خادمٍ أمين يقارن كالهجرة)؛ ٤٥٠ سطراً تُرسل ٢٠٠/٢٠٠/٥٠ وتُجمع (chunks)، وفشلُ الثانية
 *      يوقف ما بعدها ويُبقي ما لم يُرسل بالضبط ويُعاد وحده (chunkfail)؛ «خطأ إدخال» لأوّل عدٍّ بعيادةٍ استعملت الوضع وحدها (first)؛
 *      بطاقةُ «جرد البداية» (opencard)؛ والتوأمُ بالاسم (twin).
 *
 *   node scripts/waste-tab-test.mjs [--i18n <fragment.json>]…
 *   WASTE_TAB_SRC=<قديم.tsx> STOCK_COUNT_SRC=<قديم.tsx> [WASTE_OLD=ui2|fix2|multi|w5a|ui3|ui3f|r3|r3f|neg] node scripts/waste-tab-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const J = (x) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));

/* ---- متصفّحٌ بالحدّ الأدنى (utils/currency تقرأ التخزين) ---------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window ??= { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };

/* ---- القاموس: ar.json (وen.json)، وفوق كلٍّ قطعةٌ لم تُدمج بعد (--i18n) — وبلاها النصُّ الافتراضيّ بالشِّفرة للمفتاح الغائب.
 *      اللغةُ `globalThis.__lang` ("ar" افتراضاً): فحوصُ الإنكليزية (فاصلٌ عربيّ بجملةٍ إنكليزية) تبدّلها ثم ترجعها. --- */
const frags = process.argv.flatMap((a, i) => (a === "--i18n" ? [process.argv[i + 1]] : []));
const merge = (a, b) => {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k] ?? {}, v) : v;
  return out;
};
const dictSrc = (lang) => (frags.length
  ? `const ${lang.toUpperCase()} = ${JSON.stringify(frags.reduce((acc, f) => merge(acc, JSON.parse(readFileSync(f, "utf8"))[lang]), JSON.parse(readFileSync(`src/i18n/${lang}.json`, "utf8"))))};`
  : `import ${lang.toUpperCase()} from "./src/i18n/${lang}.json";`);
const AR_SRC = `${dictSrc("ar")} ${dictSrc("en")}`;
if (frags.length) console.log(`   (القاموس: ar.json وen.json وفوقهما ${frags.join(" ثم ")})`);

/* ---- البدائل --------------------------------------------------------------- */
const iconNames = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
const T = `(k, d) => {
  const v = k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), globalThis.__lang === "en" ? EN : AR);
  const s = typeof v === "string" ? v : typeof d === "string" ? d : (d && d.defaultValue) || k;
  return d && typeof d === "object" ? s.replace(/{{(\\w+)}}/g, (_m, n) => (d[n] == null ? "" : String(d[n]))) : s;
}`;
const STUBS = {
  "react-i18next": `${AR_SRC} const t = ${T}; const i18n = { get language() { return globalThis.__lang ?? "ar"; } }; export const useTranslation = () => ({ t, i18n }); export default {};`,
  /* `exists` كالحقيقيّ بعد تحميل النطاق: المفتاحُ نصٌّ بقاموس اللغة الحاليّة — به يصل countError فرعَ الترجمة (رمزٌ بلا تلميح، أو
     واجهةٌ غيرُ عربية)؛ كان `() => false` فلا يُجرَّب ذلك الفرعُ أبداً. ولا يقرؤه غيرُ countError بالملفّين. */
  i18next: `${AR_SRC} const t = ${T}; const i = { t, get language() { return globalThis.__lang ?? "ar"; }, exists: (k) => typeof String(k).split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), globalThis.__lang === "en" ? EN : AR) === "string", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "react-router-dom": `import { useSyncExternalStore } from "react";
    const subs = new Set();
    const read = () => globalThis.__url ?? "";
    const set = (next) => { const v = typeof next === "function" ? next(new URLSearchParams(read())) : next; globalThis.__url = String(v); for (const f of [...subs]) f(); };
    globalThis.__go = set;   // العنوانُ يتبدّل والصفحةُ مفتوحة (رجوعٌ/تقدّمٌ بالمتصفّح)
    const sub = (cb) => { subs.add(cb); return () => subs.delete(cb); };
    export const Link = ({ children }) => children;
    export function useSearchParams() { const url = useSyncExternalStore(sub, read, read); return [new URLSearchParams(url), set]; }`,
  "@/components/ui": `import { createElement as h, forwardRef } from "react";
    export const Button = forwardRef(({ children, leftIcon, loading, variant, size, ...p }, _r) => h("x-Button", { ...p, disabled: !!(p.disabled || loading) }, children));
    export const Skeleton = (p) => h("x-Skeleton", p);
    export const Badge = ({ children, ...p }) => h("x-Badge", p, children);
    export const Segmented = ({ options, value, onChange }) => h("x-Segmented", { value }, options.map((o) => h("button", { key: o.value, "data-seg": o.value, onClick: () => onChange(o.value) }, o.label)));
    export const Dialog = ({ open, children, footer }) => (open ? h("x-Dialog", {}, children, footer) : null);
    export const useToast = () => globalThis.__toast;`,
  "@/lib/consumptionApi": "export const consumptionApi = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__api[k](...a) });",
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__repo[k](...a) });",
  /* بابُ البيع قبل الجرد (0266) — كسولٌ بالصفحة (import()) فلا يصنع له المُحزِّمُ بديلاً وحده. الافتراضيّ: عيادةٌ ما استعملت الوضع،
     و«سجّل العدّ» يمرّ إلى `__repo.submitStockCount` بلا seen (فحوصُ ما قبل 0266 تقرأ ما أُرسل كما كان)؛ و`__neg` يبدّل أيَّ دالّة. */
  "@/lib/negStockApi": `const dflt = {
      state: async () => ({ clinic: "c1", active: false, used: false, until: null, since: null, endedAt: null, serverNow: null, at: 0 }),
      countSubmitSeen: async (lines) => globalThis.__repo.submitStockCount(lines.map(({ seen: _s, ...l }) => l)),
    };
    export const negApi = new Proxy({}, { get: (_t, k) => (...a) => ((globalThis.__neg ?? {})[k] ?? dflt[k])(...a) });`,
  "@/lib/inflight": "export const holdUpdates = (ms) => { const x = { ms, released: false }; globalThis.__holds.push(x); return () => { x.released = true; }; };",
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load) => lazy(load);`,
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  /* الصلاحيةُ تتبدّل والصفحةُ مفتوحة (انتهاءُ رفع PIN المدير ثم رفعٌ ثانٍ): `__setPerm` يعيد رسمَ من يقرؤها كالخطّاف الحقيقيّ. */
  "@/hooks/usePermissions": `import { useSyncExternalStore } from "react";
    const subs = new Set();
    globalThis.__setPerm = (p) => { globalThis.__perm = p; for (const f of [...subs]) f(); };
    const sub = (cb) => { subs.add(cb); return () => subs.delete(cb); };
    const read = () => globalThis.__perm;
    export const usePermissions = () => useSyncExternalStore(sub, read, read);`,
  "@/lib/managerOverride": "export const useOverride = () => ({ restricted: false, stockLocked: false, active: false });",
  "@/lib/settings": "export const getCountDailyN = () => 5; export const setCountDailyN = () => {};",
  "@/pages/InventoryAudit": "export const InventoryAuditView = () => null; export const StockReportButtons = () => null;",
  "lucide-react": iconNames.map((k) => `export const ${k} = () => null;`).join("\n"),
};

const W = "src/components/stock/WasteTab.tsx", S = "src/pages/StockCount.tsx";
/** مصدرُ كلّ ملفّ: الحقيقيّ، أو نسخةٌ أخرى منه (ما قبل تغيير) — ويُحزم باسم الحقيقيّ فتُحلّ استيراداتُه كما هي. */
const FROM = { [W]: process.env.WASTE_TAB_SRC || W, [S]: process.env.STOCK_COUNT_SRC || S };
const OLD = FROM[W] !== W || FROM[S] !== S;
if (OLD) console.log(`   (المصدر: ${FROM[W]} و${FROM[S]} — بلا طفرات، وكلُّ فحصٍ جديد يجب أن يسقط)`);
/** يحزم الشِّفرةَ الحقيقية — أو طفرةً منها — مع البدائل ومُرسِم react-mini بنسخة React واحدة. */
async function build(mut = null) {
  // نهاياتُ الأسطر LF قبل الطفرة: سحبُ ويندوز (core.autocrlf) يكتبها CRLF، وطفرةٌ بسطرين لا تنطبق عليها.
  const lf = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const src = { [W]: lf(FROM[W]), [S]: `${lf(FROM[S])}\nexport { PendingTab };` };
  if (mut) {
    const s = src[mut.file], i = s.indexOf(mut.from);
    if (i < 0 || s.indexOf(mut.from, i + 1) >= 0) throw new Error(`الطفرة لا تنطبق مرّةً واحدة بالضبط على ${mut.file}: ${mut.from}`);
    src[mut.file] = s.slice(0, i) + mut.to + s.slice(i + mut.from.length);
  }
  const built = await esbuild.build({
    stdin: {
      contents: [
        `export { default as WasteTab, ConsumablesCards } from "./${W}";`,
        `export { StockCount, PendingTab } from "./${S}";`,
        `export { money, formatDate, formatTime } from "./src/lib/utils.ts";`,
        `export { invoiceNo } from "./src/lib/invoiceNo.ts";`,
        `export * as C from "./src/lib/consumption.ts";`,
        `export { mount } from "./scripts/react-mini-host.js";`,
        `export * as React from "react";`,
      ].join("\n"),
      resolveDir: process.cwd(), loader: "tsx", sourcefile: "waste-tab-entry.tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "waste-tab",
      setup(b) {
        b.onLoad({ filter: /[\\/]src[\\/]components[\\/]stock[\\/]WasteTab\.tsx$/ }, () => ({ contents: src[W], loader: "tsx" }));
        b.onLoad({ filter: /[\\/]src[\\/]pages[\\/]StockCount\.tsx$/ }, () => ({ contents: src[S], loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUBS, a.path) ? { path: a.path, namespace: "stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "waste-tab-"));
  const file = join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  // SRC: المصدرُ كما حُزم (بطفرته) — لفحوص الصنف التي لا يُرى أثرُها بالسلوك (لونٌ لا CSS له).
  try { return { ...(await import(pathToFileURL(file).href)), SRC: src }; } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ---- البيانات ---------------------------------------------------------------- */
const P = (id, name, o = {}) => ({ id, name, barcode: null, alt_codes: [], stock: 5, purchase_price: 1000, sell_price: 2000, pooled: false, farm_id: null,
  has_sub_unit: false, sub_unit_name: null, units_per_box: null, sold_by_weight: false, created_at: "2026-10-01T00:00:00Z", ...o });
const LYSE = P("p-lyse", "Lyse", { stock: 1, purchase_price: 60000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 500 });
const GLOVES = P("p-gloves", "قفازات", { stock: -0.02, purchase_price: 12500 });
const FREE = P("p-free", "شاش مجاني", { stock: 5, purchase_price: 0 });
const DIL = P("p-dil", "Diluent", { stock: 3, purchase_price: 150000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 20000 });
const POOL = P("p-pool", "قفازات حوض", { pooled: true });
const SYR = P("p-syr", "سرنجة", { stock: -0.01, purchase_price: 25000 });
const ALL = [LYSE, GLOVES, FREE, DIL, POOL];
const INV = "0b6f4f7e-8a1c-4e8e-9d55-3c1f0a2b9e77";
const row = (o) => ({ id: "r", product_id: null, product_name: "", system_qty: 0, counted_qty: 0, unit_cost: 0, reason: "damaged", note: null, status: "pending",
  counted_by: null, counted_by_name: "علي", counted_at: "2026-10-31T08:00:00Z", decided_by: null, decided_by_name: null, decided_at: null,
  applied_delta: null, expense_id: null, lot_counts: null, ...o });
const PENDING_ROWS = [
  row({ id: "w1", product_id: LYSE.id, product_name: "Lyse", system_qty: 0.004, counted_qty: 0, unit_cost: 60000, note: "انكسرت", source: "waste", entered_qty: 2, entered_unit: "sub", unit_label: "مل" }),
  row({ id: "c1", product_id: SYR.id, product_name: "سرنجة", system_qty: 0.04, counted_qty: 0.02, unit_cost: 25000, source: "count" }),
  row({ id: "w2", product_id: FREE.id, product_name: "شاش مجاني", system_qty: 1, counted_qty: 0, unit_cost: 0, note: "انفتح", source: "waste", entered_qty: 1, entered_unit: "stock", unit_label: null }),
];
const DECIDED = { approved: 3, rejected: 0, void: 0, withdrawals: [{ reason: "damaged", amount: 740, expense_id: "e9" }], negatives: [{ product_id: SYR.id, name: "سرنجة", stock: -0.03 }] };

/* فاتورةٌ مرّت بتعديل — جوابُ invoice_consumption_get **كما رجع من القاعدة** (0252–0255 على PGlite، ٣١/١٠):
 * «خدمة» ×٢ (لكلّ مرّة: ١٠ مل محلول من ٢٠٠٠٠، و١ قطعة من ١٠) و«خدمة ثانية» ×١ (١ قطعة) — الرصيدُ ٠٫٩٩٩ و٠٫٧٠٠؛
 * ثم تعديلٌ أنقص «خدمة» إلى ١ وأبقى الثانية (الجهازُ يرسل id كلّ سطر) — الرصيدُ ٠٫٩٩٩ و٠٫٨٠٠: رجع ٠٫٠٠٠٥ محلول
 * و٠٫١ قطعة؛ ثم ترجيعُ الفاتورة كلِّها — ١٫٠٠٠ و١٫٠٠٠: رجع ما صرفته البيعة كلُّه (٠٫٠٠١ و٠٫٣). التعديلُ يردّ
 * مواصفاتِ كلِّ السطور كاملةً ويصرفها من جديد بمواصفاتٍ relink، فمجموعُ restored_qty وحده ٠٫٠٠١/٠٫٣ بعد التعديل
 * و٠٫٠٠١٥/٠٫٥ بعد الترجيع — ضعفُ ما رجع وثلاثةُ أضعافه. */
const SOL = P("a2590000-0000-4000-8000-000000000036", "محلول", { stock: 0.999, purchase_price: 150000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 20000 });
const PIECE = P("a2590000-0000-4000-8000-000000000037", "قطعة", { stock: 0.8, purchase_price: 1000, has_sub_unit: true, sub_unit_name: "قطعة", units_per_box: 10 });
const RL_INV = "b058f63e-8a9c-4341-9659-c7246ee33236";
/* دفعاتُ الأفعال (at_us = now() لمعاملة الفعل، µs منذ ١٩٧٠): البيعة، ثم فعلٌ أوّل (مرتجعٌ جزئيّ أو تعديل) بعد ١٠ دقائق،
 * ثم ترجيعٌ بعد ٢٠ — وnow() للقراءة بعدها بثانية. والـmoves أدناه مبنيّةٌ من القيم المقيسة نفسها (الحيُّ = Σ الأحداث،
 * وما رجع = T(الأعلى) − الحيّ)؛ الخادمُ لم يكتب الحقلَ بعد (ui2.md) — فهي العقدُ كما بـconsumptionApi.ts. */
const T0 = 1793430000000000, T1 = 1793430600000000, T2 = 1793431200000000, NOW_US = 1793431201000000;
const mv = (...xs) => xs.map(([at_us, qty]) => ({ at_us, qty }));
const rs = (item, spec, pid, name, source, live, restored, lv, moves) => [item, { note: null, unit: "sub", source, per_div: pid === SOL.id ? 20000 : 10, per_qty: pid === SOL.id ? 10 : 1, spec_id: spec,
  live_qty: live, shortfall: 0, live_value: lv, product_id: pid, unit_label: pid === SOL.id ? "مل" : "قطعة", product_name: name, restored_qty: restored, moves: mv(...moves) }];
const rlEntry = (specs) => { const items = {}; for (const [item, s] of specs) (items[item] ??= []).push(s); return { items, skips: [], negatives: [], now_us: NOW_US, waste: [] }; };
const RL_EDIT = rlEntry([
  rs("7133cbd1-5598-447e-8e44-d1960444ce48", "504cd785-df49-47b6-b9d4-6c0a8706d918", PIECE.id, "قطعة", "recipe", 0, 0.1, 0, [[T0, 0.1], [T1, -0.1]]),
  rs("a7e659ce-e3d1-4b73-8a25-4e48493ce526", "421dd849-2b90-452b-887f-4cb0b75bc34a", PIECE.id, "قطعة", "relink", 0.1, 0, 100, [[T1, 0.1]]),
  rs("a7e659ce-e3d1-4b73-8a25-4e48493ce526", "ace4379f-d740-4ef3-947f-6eee005065a7", SOL.id, "محلول", "relink", 0.0005, 0, 75, [[T1, 0.0005]]),
  rs("c48f9e65-8035-4cdf-bd92-2d7dd785e429", "c54cbd77-2ab3-4a58-9fd2-25483ff6317a", PIECE.id, "قطعة", "relink", 0.1, 0, 100, [[T1, 0.1]]),
  rs("efb6055b-5732-4811-93ff-ca7ad4c5b4a9", "e9887d4c-1a2b-4f21-a64f-630a59c61956", PIECE.id, "قطعة", "recipe", 0, 0.2, 0, [[T0, 0.2], [T1, -0.2]]),
  rs("efb6055b-5732-4811-93ff-ca7ad4c5b4a9", "63a10ebd-e7d7-4875-951e-4e2227ddf78e", SOL.id, "محلول", "recipe", 0, 0.001, 0, [[T0, 0.001], [T1, -0.001]]),
]);
const RL_REFUND = rlEntry([
  rs("7133cbd1-5598-447e-8e44-d1960444ce48", "504cd785-df49-47b6-b9d4-6c0a8706d918", PIECE.id, "قطعة", "recipe", 0, 0.1, 0, [[T0, 0.1], [T1, -0.1]]),
  rs("a7e659ce-e3d1-4b73-8a25-4e48493ce526", "421dd849-2b90-452b-887f-4cb0b75bc34a", PIECE.id, "قطعة", "relink", 0, 0.1, 0, [[T1, 0.1], [T2, -0.1]]),
  rs("a7e659ce-e3d1-4b73-8a25-4e48493ce526", "ace4379f-d740-4ef3-947f-6eee005065a7", SOL.id, "محلول", "relink", 0, 0.0005, 0, [[T1, 0.0005], [T2, -0.0005]]),
  rs("c48f9e65-8035-4cdf-bd92-2d7dd785e429", "c54cbd77-2ab3-4a58-9fd2-25483ff6317a", PIECE.id, "قطعة", "relink", 0, 0.1, 0, [[T1, 0.1], [T2, -0.1]]),
  rs("efb6055b-5732-4811-93ff-ca7ad4c5b4a9", "e9887d4c-1a2b-4f21-a64f-630a59c61956", PIECE.id, "قطعة", "recipe", 0, 0.2, 0, [[T0, 0.2], [T1, -0.2]]),
  rs("efb6055b-5732-4811-93ff-ca7ad4c5b4a9", "63a10ebd-e7d7-4875-951e-4e2227ddf78e", SOL.id, "محلول", "recipe", 0, 0.001, 0, [[T0, 0.001], [T1, -0.001]]),
]);
/* «خدمة ثانية» وحدها من الجواب نفسه: سطرٌ مرّ بتعديلٍ بلا تغيير — رجع وانصرف، فما رجع شي. */
const RL_SAME = rlEntry([
  rs("7133cbd1-5598-447e-8e44-d1960444ce48", "504cd785-df49-47b6-b9d4-6c0a8706d918", PIECE.id, "قطعة", "recipe", 0, 0.1, 0, [[T0, 0.1], [T1, -0.1]]),
  rs("c48f9e65-8035-4cdf-bd92-2d7dd785e429", "c54cbd77-2ab3-4a58-9fd2-25483ff6317a", PIECE.id, "قطعة", "relink", 0.1, 0, 100, [[T1, 0.1]]),
]);

/* فاتورةٌ رجعت مرّتين (ui2): «خدمة» ×٣ (لكلّ مرّة ٢ مل Lyse من ٥٠٠ و١٠ مل Diluent من ٢٠٠٠٠) و«خدمة ثانية» ×١ (علبة
 * قفازات). T1 مرتجعٌ جزئيّ: مرّةٌ من «خدمة» والقفازاتُ كلُّها؛ T2 ترجيعُ الباقي: مرّتان. restored_qty تراكميٌّ: ٦ مل و٣٠ مل
 * وعلبة — والذي رجّعه T2 وحده ٤ مل و٢٠ مل بلا قفازات. `waste`: ما سُجّل هدراً من الفاتورة. */
const TWO = (waste = []) => ({ items: {
  it1: [
    { spec_id: "t-lyse", product_id: LYSE.id, product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, live_qty: 0, live_value: 0, restored_qty: 0.012, shortfall: 0, note: null, source: "recipe",
      moves: mv([T0, 0.012], [T1, -0.004], [T2, -0.008]) },
    { spec_id: "t-dil", product_id: DIL.id, product_name: "Diluent", unit: "sub", unit_label: "مل", per_qty: 10, per_div: 20000, live_qty: 0, live_value: 0, restored_qty: 0.0015, shortfall: 0, note: null, source: "recipe",
      moves: mv([T0, 0.0015], [T1, -0.0005], [T2, -0.001]) },
  ],
  it2: [{ spec_id: "t-glv", product_id: GLOVES.id, product_name: "قفازات", unit: "stock", unit_label: null, per_qty: 1, per_div: 1, live_qty: 0, live_value: 0, restored_qty: 1, shortfall: 0, note: null, source: "recipe",
    moves: mv([T0, 1], [T1, -1]) }],
}, skips: [], negatives: [], now_us: NOW_US, waste });
/** سطرُ هدرٍ سُجّل من الفاتورة (InvoiceWasteRow): `b` دفعةٌ أو دفعات أو null (عُبّي من الفاتورة كلِّها). ومعه batch_us
 *  (أحدثُها) — شكلُ ما قبل الدفعات المتعدّدة، لا يقرؤه إلا القديمُ بوضع WASTE_OLD: به تمرّ فحوصُه القديمة وتسقط الجديدةُ
 *  لسببها لا لشكلٍ غاب. */
const WR = (product_id, b, status, counted_at = "2026-10-31T09:30:00.000Z") => {
  const batches = b === null ? null : [].concat(b);
  return { id: `wr-${product_id}-${batches ? batches.join("+") : null}`, product_id, batches, batch_us: batches ? batches[batches.length - 1] : null, status, qty: 1, unit: "sub", counted_at };
};

/* ---- أدوات الرسم -------------------------------------------------------------- */
const within = (n, attr, value) => {
  const out = [];
  const walk = (x) => { if (x.props && attr in x.props && (value === undefined || String(x.props[attr]) === String(value))) out.push(x); x.children.forEach(walk); };
  if (n) walk(n);
  return out;
};
/** هل يلتفّ نصُّ العقدة بعموده؟ overflow-wrap يُورَث، فأقربُ جدٍّ يقرّره يحكم (كقسم «ض» بـconsumables-sheet-test): break-words أو
 *  break-all يلفّان، وtruncate يقصّ بنقاط؛ وbreak-normal أو لا شيء = اسمٌ بلا فاصلٍ أعرضُ من عموده يطلع منه — مقيسٌ بالمتصفّح (r3): اسمٌ
 *  لاتينيٌّ بـ٤٨ حرفاً يطلع ٥٤ بكسلاً من بطاقة التعبئة ويمرّر الصفحةَ ٣٨ بكسلاً على ٣٧٥. */
const wraps = (node) => {
  for (let x = node; x; x = x.parent) {
    const cls = String(x.props?.className ?? "").split(/\s+/);
    if (cls.includes("break-words") || cls.includes("break-all") || cls.includes("truncate")) return true;
    if (cls.includes("break-normal")) return false;
  }
  return false;
};
function harness(M, ui) {
  const one = (attr, value, root) => (root ? within(root, attr, value)[0] : ui.find(attr, value)) ?? null;
  const typeIn = async (attr, value, root) => { const n = one(attr, undefined, root); if (!n) throw new Error(`ما لكيت ${attr}`); n.props.onChange({ target: { value } }); await ui.settle(); };
  const click = async (attr, value, root) => { const n = one(attr, value, root); if (!n) throw new Error(`ما لكيت ${attr}${value === undefined ? "" : `=${value}`}`); ui.click(n); await ui.settle(); };
  const add = async (q, id) => { await typeIn("data-waste-search", q); await click("data-waste-add", id); };
  return { ui, one, typeIn, click, add, text: (n) => (n ? ui.text(n) : "") };
}
function session(M, { products = ALL, isManager = true, showCost = true, url = "tab=waste", api = {}, pending = new Set() } = {}) {
  globalThis.__url = url;
  const log = { calls: [], toasts: [], changed: 0 };
  globalThis.__toast = { success: (m) => log.toasts.push(["success", m]), error: (m) => log.toasts.push(["error", m]), warn: (m) => log.toasts.push(["warn", m]), toast: (x) => log.toasts.push(["toast", x?.title]) };
  globalThis.__holds = [];
  globalThis.__api = new Proxy({}, { get: (_t, k) => async (...a) => { log.calls.push([k, ...a]); if (!api[k]) throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); return api[k](...a); } });
  const ui = M.mount(M.React.createElement(M.WasteTab, { products, failed: false, pendingIds: pending, isManager, showCost, onChanged: () => { log.changed++; } }));
  return { ...harness(M, ui), log, sends: () => log.calls.filter((c) => c[0] === "submitWaste") };
}
/** يفتح التبويبَ برابط `?inv=` (و`&at=` إن أُعطي) على جوابٍ واحد، ويرجع ما عُبّي: «الاسم:الكمية+الوحدة» مرتّبةً، ونصَّ
 *  التبويب، وسطورَ «سجّلتها هدر قبل»، وسطرَ «الفاتورة كلُّها»، وسطورَ التخطّي، وسطرَ «الرابط ما يطابق»، وبطاقةَ الفشل،
 *  وهل أمسك السندُ النسخةَ الجديدة. */
async function fillFrom(M, entry, { at, inv = INV, products = [LYSE, DIL, GLOVES] } = {}) {
  const s = session(M, { products, url: `tab=waste&inv=${inv}${at === undefined ? "" : `&at=${at}`}`, api: { invoiceConsumption: async () => ({ [inv]: entry }) } });
  await s.ui.settle();
  const names = new Map(products.map((p) => [p.id, p.name]));
  const got = s.ui.findAll("data-waste-line").map((n) => {
    const sub = within(n, "data-waste-unit", "sub")[0]?.props["aria-pressed"] === true;
    return `${names.get(n.props["data-waste-line"]) ?? n.props["data-waste-line"]}:${within(n, "data-waste-qty")[0]?.props.value}${sub ? "sub" : "stock"}`;
  }).sort();
  const out = { got, text: s.text(s.ui.container), already: s.ui.findAll("data-waste-already").map((n) => s.text(n)), all: s.text(s.one("data-waste-all-recorded")),
    skips: s.ui.findAll("data-waste-skip").map((n) => s.text(n)), bad: s.text(s.one("data-waste-inv-badlink")), info: s.text(s.one("data-waste-inv")),
    kept: s.ui.findAll("data-waste-kept").map((n) => s.text(n)), failed: !!s.one("data-waste-inv-failed"), held: globalThis.__holds.some((h) => !h.released) };
  s.ui.unmount();
  return { ...out, errors: s.ui.errors };
}

/* ---- عدُّ اليوم بمادةٍ واحدة (ui3 وتدقيقُه) ------------------------------------------ */
const LOT = (product_id, id, qty, expiry_date) => ({ id, product_id, qty, received_qty: qty, expiry_date, received_at: "2026-09-01T00:00:00Z", source: "purchase", purchase_id: null, company_name: null, note: null });
/** يفتح «عدّ اليوم» على مادةٍ واحدة ويكتب عدَّها (دفعةً دفعة بترتيب الصفحة — الأقربُ انتهاءً أوّلاً — أو بحقلها الواحد)، ثم «سجّل
 *  العدّ» (و`reason` يُختار بعد رفضٍ أوّل ثم يُعاد الإرسال): ما رُسم — نصُّ السطر والفرقُ والأسباب، وسطرُ «بثلاث مراتب»، وكلماتُ
 *  الوحدة بجانب الحقول، وفروقُ الدفعات — وما أُرسل، وما قيل. */
async function countOnce(M, p, lots, typed, { reason } = {}) {
  const sent = [], toasts = [];
  globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
  globalThis.__toast = { success: (m) => toasts.push(["success", m]), error: (m) => toasts.push(["error", m]), warn() {}, toast() {} };
  globalThis.__holds = [];
  globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
  globalThis.__repo = {
    listProducts: async () => [p], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => lots.map((x) => ({ ...x })),
    listStockCounts: async () => [], reportStockLosses: async () => [],
    submitStockCount: async (lines) => { sent.push(JSON.parse(J(lines))); return { matched: 1, pending: 0 }; },
  };
  globalThis.__url = "";
  const ui = M.mount(M.React.createElement(M.StockCount));
  await ui.settle();
  const h = harness(M, ui);
  const line = () => ui.findAll("data-count-line").find((n) => ui.text(n).includes(p.name));
  if (!line()) { await h.typeIn("data-count-search", p.name); await h.click("data-count-add"); }
  for (const [i, v] of typed.entries()) {
    const input = lots.length > 1 ? within(line(), "data-count-lot-input")[i] : within(line(), "data-count-input")[0];
    if (!input) throw new Error(`ما لكيت حقل العدّ ${i} لـ${p.name}`);
    input.props.onChange({ target: { value: v } });
    await ui.settle();
  }
  const texts = (attr) => within(line(), attr).map((n) => ui.text(n));
  const out = { text: ui.text(line()), diff: h.text(within(line(), "data-count-diff")[0]), reasons: within(line(), "data-count-reason").map((n) => n.props["data-count-reason"]),
    fine: h.text(within(line(), "data-count-fine")[0]), units: texts("data-count-unit"), lotDiffs: texts("data-count-lot-diff") };
  await h.click("data-count-submit");
  out.first = { sent: sent.length, toasts: toasts.map(([k, m]) => `${k}:${m}`) };
  if (reason) { ui.click(within(line(), "data-count-reason", reason)[0]); await ui.settle(); await h.click("data-count-submit"); }
  ui.unmount();
  return { ...out, sent, toasts: toasts.map(([k, m]) => `${k}:${m}`), errors: ui.errors };
}

/* ---- البيعُ قبل الجرد (0266): صفحةُ العدّ كاملةً على بابٍ مزيَّف ------------------------------------------- */
/** يفتح «عدّ اليوم» (StockCount كاملة) على `products` و`state` (حالةُ العدّ: مادّةٌ بلا سطرٍ «ما انعدّت أبداً») و`pending`. الخادمُ
 *  رصيدُه بـ`server` (تقرؤه getProductById وكلُّ تحميل — الصفحةُ لقطةُ آخر تحميل كالحقيقيّ)، و`fail` موادُّ يرمي سؤالُ صفّها. وبابُ
 *  الوضع: `used`، وcountSubmitSeen يسجّل ما يصله (`log.sends`) ويجيب `answer(lines, k, stockOf)` — رميتُه رفضٌ (k رقمُ النداء من ١،
 *  وstockOf رصيدُ الخادم الآن). */
async function countPage(M, { products, state = new Map(), pending = [], used = false, server = new Map(), fail = new Set(), companies = [],
  answer = (lines) => ({ matched: lines.length, pending: 0 }), counted = undefined } = {}) {
  const log = { sends: [], toasts: [], loads: 0, fresh: new Map(), cos: 0, missing: [] };
  globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
  globalThis.__toast = { success: (m) => log.toasts.push(`success:${m}`), error: (m) => log.toasts.push(`error:${m}`), warn() {}, toast() {} };
  globalThis.__holds = [];
  globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
  const now = (p) => ({ ...p, stock: server.has(p.id) ? server.get(p.id) : p.stock });
  globalThis.__repo = {
    listProducts: async () => { log.loads++; return products.map(now); },
    productSalesRate: async () => new Map(), stockCountState: async () => state, listActiveLots: async () => [],
    listStockCounts: async () => pending, reportStockLosses: async () => [],
    getProductById: async (id) => {
      log.fresh.set(id, (log.fresh.get(id) ?? 0) + 1);
      if (fail.has(id)) throw new Error("Failed to fetch");
      const p = products.find((x) => x.id === id);
      return p ? now(p) : undefined;
    },
    listCompanies: async () => { log.cos++; return companies; },
    submitStockCount: async () => { throw new Error("نداءٌ غير متوقّع: submitStockCount — العدُّ يمرّ من countSubmitSeen (0266)"); },
  };
  let k = 0;
  globalThis.__neg = {
    state: async () => ({ clinic: "c1", active: false, used, until: null, since: null, endedAt: null, serverNow: null, at: 0 }),
    /* المعدودةُ بتعريف الخادم (neg_stock_counted) — undefined: بابٌ بلاها (فيرجع لحالة العدّ)، "fail": سؤالٌ فشل. */
    ...(counted === undefined ? {} : { counted: async () => { if (counted === "fail") throw new Error("Failed to fetch"); return new Set(counted); } }),
    countSubmitSeen: async (lines) => {
      log.sends.push(JSON.parse(J(lines)));
      return answer(lines, ++k, (id) => { const p = products.find((x) => x.id === id); return p ? Number(now(p).stock) || 0 : undefined; });
    },
  };
  globalThis.__url = "";
  const ui = M.mount(M.React.createElement(M.StockCount));
  await ui.settle();
  const h = harness(M, ui);
  const lineOf = (id) => ui.findAll("data-count-line").find((n) => n.props["data-count-line"] === id) ?? null;
  const ids = () => ui.findAll("data-count-line").map((n) => String(n.props["data-count-line"]));
  const textOf = (id) => { const n = lineOf(id); return n ? ui.text(n) : ""; };
  /* الأدواتُ لا ترمي على عنصرٍ غائب — تسجّله (`log.missing`) وتمضي، فيسقط الفحصُ بنتيجته: على الشِّفرة القديمة (WASTE_OLD=neg) لا حقلَ
     بمعرّف السطر ولا بطاقة، ورميةٌ كانت تُسقط السيناريو كلَّه فتُعدّ «فحصاً قديماً يسقط». */
  const miss = (what) => { log.missing.push(what); };
  const type = async (id, v) => { const n = within(lineOf(id), "data-count-input")[0]; if (!n) return miss(`input:${id}`); n.props.onChange({ target: { value: v } }); await ui.settle(); };
  const valueOf = (id) => within(lineOf(id), "data-count-input")[0]?.props.value;
  const pressed = (id) => within(lineOf(id), "data-count-reason").filter((n) => n.props["aria-pressed"] === true).map((n) => n.props["data-count-reason"]);
  const reason = async (id, r) => { const n = within(lineOf(id), "data-count-reason", r)[0]; if (!n) return miss(`reason:${id}:${r}`); ui.click(n); await ui.settle(); };
  const tap = async (attr) => { const n = h.one(attr); if (!n || n.props.disabled) return miss(attr); ui.click(n); await ui.settle(); };
  const submit = () => tap("data-count-submit");
  /** يختار من قائمة شركات «جرد البداية» (كاختيار المستخدم: onChange بالقيمة). */
  const pickCo = async (key) => { const s = h.one("data-count-open-company"); if (!s) return miss("company"); s.props.onChange({ target: { value: key } }); await ui.settle(); };
  const options = () => { const s = h.one("data-count-open-company"); return s ? s.children.map((c) => ui.text(c)) : null; };
  return { ui, h, log, lineOf, ids, textOf, type, valueOf, pressed, reason, tap, submit, pickCo, options, done: () => { ui.unmount(); return ui.errors; } };
}
/** رفضُ count_moved كما يرميه rpcJson (وdemoCountSubmitSeen): الرمزُ بـmessage، والمعرّفاتُ مصفوفةَ JSON بـdetails. */
const movedErr = (ids, hint) => Object.assign(new Error("count_moved"), { code: "P0001", details: JSON.stringify(ids), ...(hint ? { hint } : {}) });
/** خادمٌ أمين: يقارن seen كلِّ سطرٍ برصيده الآن (بمنازله الثلاث) ويردّ count_moved بما تحرّك — مرآةُ stock_count_submit_seen. */
const honest = (lines, _k, stockOf) => {
  if (lines.some((l) => typeof l.seen !== "number")) throw Object.assign(new Error("count_seen_missing"), { code: "P0001" });
  const moved = lines.filter((l) => Math.round(stockOf(l.product_id) * 1000) !== Math.round(l.seen * 1000)).map((l) => l.product_id);
  if (moved.length) throw movedErr(moved);
  return { matched: lines.length, pending: 0 };
};
/** ٤٥٠ مادّةً بلا عدٍّ بثلاث شركاتٍ (١٥٠ لكلٍّ) بعيادةٍ استعملت الوضع، تُضاف كلُّها من بطاقة «جرد البداية» ويُكتب لكلٍّ «0» — دفعةً
 *  واحدة ثمّ رسمةٌ واحدة (كلُّ نداءٍ بسطره بدالّته: الدوالُّ ثابتة والدمجُ على آخر حالة). */
async function bigCount(M, answer) {
  const COS = [1, 2, 3].map((i) => ({ id: `co-${i}`, name: `شركة ${i}`, created_at: "2026-01-01T00:00:00Z" }));
  const products = Array.from({ length: 450 }, (_, i) => P(`p-ch-${String(i).padStart(3, "0")}`, `مادة ${String(i).padStart(3, "0")}`, { stock: 0, company_id: COS[Math.floor(i / 150)].id }));
  const pg = await countPage(M, { products, used: true, companies: COS, answer });
  for (const c of COS) await pg.pickCo(c.id);
  for (const n of pg.ui.findAll("data-count-line")) within(n, "data-count-input")[0]?.props.onChange({ target: { value: "0" } });
  await pg.ui.settle();
  return { ...pg, products };
}

/* ---- السيناريوهات: كلٌّ يكتب نتائجه بمفاتيح تسمّيها الطفرات ---------------------------- */
const SCENARIOS = {
  /* أ+ب: قفازاتٌ رصيدُها −٠٫٠٢ وتلفُ نصف علبة — المدير */
  async over(M, ok) {
    const s = session(M, { api: { submitWaste: async () => ({ pending: 0, ids: ["c1"], decided: { approved: 1, rejected: 0, void: 0, withdrawals: [{ reason: "damaged", amount: 6250, expense_id: "e1" }], negatives: [{ product_id: GLOVES.id, name: "قفازات", stock: -0.52 }] }, lines: [{ product_id: GLOVES.id, name: "قفازات", stock_now: -0.02, stock_after: -0.52 }] }) } });
    await s.ui.settle();
    await s.add("قفاز", GLOVES.id);
    const line = s.one("data-waste-line", GLOVES.id);
    await s.typeIn("data-waste-qty", "0.5", line);
    await s.typeIn("data-waste-note", "وگعت", line);
    ok("over.hold", "سطرٌ بالسند يمسك النسخةَ الجديدة بلا سقف (holdUpdates(Infinity))", globalThis.__holds.some((h) => h.ms === Infinity && !h.released), J(globalThis.__holds));
    ok("over.label", "المدير يرى «سجّل وطبّق»", s.text(s.one("data-waste-send")).includes("سجّل وطبّق"), s.text(s.one("data-waste-send")));
    await s.click("data-waste-send");
    const over = s.one("data-waste-over");
    ok("over.first", "فوق الرصيد: الضغطةُ الأولى لا ترسل شيئاً وتسأل بمكان السطر بالرقمين",
      s.sends().length === 0 && s.text(over).includes('"قفازات" رصيدها بالنظام −0.02 علبة وانت كاتب تلف 0.5 علبة — متأكد؟') && !!s.one("data-waste-over-yes"),
      J({ sends: s.sends().length, over: s.text(over) }));
    await s.click("data-waste-over-yes");
    const call = s.sends()[0];
    ok("over.second", "«أي، سجّل» ترسل السطرَ نفسَه بـack_over، والمديرُ يطبّق (apply) بمرجع",
      s.sends().length === 1 && call[1].length === 1 && J(call[1][0]) === J({ product_id: GLOVES.id, qty: 0.5, unit: "stock", reason: "damaged", note: "وگعت", ack_over: true })
        && call[2] === true && typeof call[3] === "string" && call[3].length > 4, J(call));
    const done = s.one("data-waste-done", "applied");
    ok("mgr.result", 'النتيجة: «انخصم … وانسجّل خسارة … بـ"سحب مخزن — تالف" (مو من الدرج)»',
      s.text(done).includes(`انخصم 0.5 علبة من "قفازات" وانسجّل خسارة ${M.money(6250)} بـ"سحب مخزن — تالف" (مو من الدرج)`), s.text(done));
    ok("mgr.neg", 'وما بقي تحت الصفر يُقال بوحدة المخزون: «"قفازات" رصيدها صار −0.52 علبة بعد الموافقة — …»',
      s.text(s.one("data-waste-neg")).includes('"قفازات" رصيدها صار −0.52 علبة بعد الموافقة — سجّل فاتورة الشراء أو سوّ جرد'), s.text(done));
    ok("over.release", "الإرسالُ يمسح السندَ ويُفلت الإمساك ويعيد تحميل الصفحة", !s.one("data-waste-line") && globalThis.__holds.every((h) => h.released) && s.log.changed === 1,
      J({ holds: globalThis.__holds, changed: s.log.changed }));
    s.ui.unmount();
    // الخادمُ يرى رصيداً أحدث (فوق الرصيد بعد التحميل): يُقال تلميحُه، تُعاد البيانات، ويبقى السند —
    // والإعادةُ بنفس المرجع (إرسالٌ ضاع جوابُه لا يُسجَّل مرّتين)، والسندُ التالي بمرجعٍ جديد.
    let k2 = 0;
    const s2 = session(M, { api: { submitWaste: async (lines) => {
      if (k2++ === 0) throw Object.assign(new Error("waste_exceeds_stock"), { code: "P0001", hint: "«Lyse» رصيدها بالنظام 0 وانت كاتب تلف 1 — إذا صحيح أكّد مرّة ثانية" });
      return { pending: lines.length, ids: ["x"], decided: null, lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id, stock_now: 1, stock_after: 0 })) };
    } } });
    await s2.ui.settle();
    await s2.add("lyse", LYSE.id);
    const l2 = s2.one("data-waste-line", LYSE.id);
    await s2.typeIn("data-waste-qty", "1", l2); await s2.typeIn("data-waste-note", "x", l2);
    await s2.click("data-waste-send");
    ok("over.server", "رفضُ الخادم waste_exceeds_stock: تلميحُه يُقال، والبياناتُ تُعاد، والسندُ باقٍ",
      s2.sends().length === 1 && s2.log.toasts.some(([k, m]) => k === "error" && m.includes("أكّد مرّة ثانية")) && s2.log.changed === 1 && !!s2.one("data-waste-line", LYSE.id),
      J({ toasts: s2.log.toasts, changed: s2.log.changed }));
    await s2.click("data-waste-send");
    await s2.add("شاش", FREE.id);
    const l3 = s2.one("data-waste-line", FREE.id);
    await s2.typeIn("data-waste-qty", "1", l3); await s2.typeIn("data-waste-note", "y", l3);
    await s2.click("data-waste-send");
    const refs = s2.sends().map((c) => c[3]);
    ok("ref.retry", "إعادةُ المسودّة نفسها بنفس المرجع (client_ref)", refs.length === 3 && typeof refs[0] === "string" && refs[0] === refs[1], J(refs));
    ok("ref.fresh", "وبعد النجاح سندٌ جديد بمرجعٍ جديد", refs.length === 3 && refs[2] !== refs[1], J(refs));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* ج: الاستقبال — Lyse رصيدُها ٠٫٠٠٢ (١ مل) وتلفُ ٢ مل بالصغيرة */
  async staff(M, ok) {
    const s = session(M, { isManager: false, products: [{ ...LYSE, stock: 0.002 }, GLOVES],
      api: { submitWaste: async () => ({ pending: 1, ids: ["c2"], decided: null, lines: [{ product_id: LYSE.id, name: "Lyse", stock_now: 0.002, stock_after: -0.002 }] }) } });
    await s.ui.settle();
    await s.add("lyse", LYSE.id);
    const line = s.one("data-waste-line", LYSE.id);
    await s.click("data-waste-unit", "sub", line);
    await s.typeIn("data-waste-qty", "2", line);
    await s.typeIn("data-waste-note", "انكسرت", line);
    ok("staff.button", "غيرُ المدير يرى «أرسل للمدير» لا «سجّل وطبّق»", s.text(s.one("data-waste-send")).includes("أرسل للمدير") && !s.text(s.one("data-waste-send")).includes("طبّق"), s.text(s.one("data-waste-send")));
    await s.click("data-waste-send");
    ok("over.sub", "وفوق الرصيد بالصغيرة يُقال بالمل: «رصيدها بالنظام 1 مل وانت كاتب تلف 2 مل»",
      s.sends().length === 0 && s.text(s.one("data-waste-over")).includes('"Lyse" رصيدها بالنظام 1 مل وانت كاتب تلف 2 مل — متأكد؟'), s.text(s.one("data-waste-over")));
    await s.click("data-waste-over-yes");
    const call = s.sends()[0];
    ok("staff.apply", "يُرسل بلا تطبيق (apply = false)، بالصغيرة كما كُتبت", !!call && call[2] === false && J(call[1]) === J([{ product_id: LYSE.id, qty: 2, unit: "sub", reason: "damaged", note: "انكسرت", ack_over: true }]), J(call));
    const done = s.one("data-waste-done", "pending");
    ok("staff.text", "«انسجل وينتظر موافقة المدير — الرصيد ما يتغيّر هسه» و«Lyse · تلف 2 مل»",
      s.text(done).includes("انسجل وينتظر موافقة المدير — الرصيد ما يتغيّر هسه") && s.text(done).includes("Lyse · تلف 2 مل") && !s.one("data-waste-done", "applied"), s.text(done));
    ok("staff.will", "وما سينزل تحت الصفر بعد الموافقة يُقال بوحدة المخزون (−0.002 علبة، لا رقمٌ عارٍ يُقرأ ملاً بعد «تلف 2 مل»)", s.text(s.one("data-waste-will")).includes('"Lyse" رصيدها راح يصير −0.002 علبة بعد الموافقة'), s.text(done));
    s.ui.unmount();
    return s.ui.errors;
  },

  /* د: مادةٌ كلفتُها صفر */
  async zero(M, ok) {
    const s = session(M, { api: { submitWaste: async () => ({ pending: 0, ids: ["c3"], decided: { approved: 1, rejected: 0, void: 0, withdrawals: [], negatives: [] }, lines: [{ product_id: FREE.id, name: FREE.name, stock_now: 5, stock_after: 4 }] }) } });
    await s.ui.settle();
    await s.add("شاش", FREE.id);
    const line = s.one("data-waste-line", FREE.id);
    ok("zero.line", "السطرُ يقول «كلفتها صفر — تنخصم من المخزون بس ما تنحسب خسارة»", s.text(s.one("data-waste-zero", undefined, line)).includes("كلفتها صفر — تنخصم من المخزون بس ما تنحسب خسارة"), s.text(line));
    await s.typeIn("data-waste-qty", "1", line); await s.typeIn("data-waste-note", "انفتح", line);
    await s.click("data-waste-send");
    ok("zero.result", "والنتيجةُ تقولها بلا «خسارة»", s.text(s.one("data-waste-done-zero")).includes('انخصم 1 علبة من "شاش مجاني" — كلفتها صفر') && !s.one("data-waste-done-line"),
      s.text(s.one("data-waste-done", "applied")));
    s.ui.unmount();
    const s2 = session(M, { showCost: false });
    await s2.ui.settle();
    await s2.add("شاش", FREE.id);
    ok("zero.hidden", "ومن لا يرى الكلفة لا يُقال له عنها", !s2.one("data-waste-zero"));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* هـ: ?inv= — Lyse بمواصفتين (٠٫٠٠٤ + ٠٫٠٠٢ علبة = ٣ مل)، Diluent ٠٫٠٠٠٥ = ١٠ مل، مادةٌ محذوفة، وأخرى ما رجع منها شي */
  async inv(M, ok) {
    // رابطٌ قديم بلا `at`: تراكميٌّ كما كان — والعقدُ الجديد حاضرٌ بالجواب (أحداثُ البيعة ثم الإرجاع، ولا هدرَ مسجّل).
    const spec = (o) => {
      const x = { spec_id: "s", product_id: "", product_name: "", unit: "sub", unit_label: "مل", per_qty: 1, per_div: 500, live_qty: 0, live_value: 0, restored_qty: 0, shortfall: 0, note: null, source: "recipe", ...o };
      return { ...x, moves: mv(...[[T0, x.live_qty + x.restored_qty], [T1, -x.restored_qty]].filter(([, q]) => q !== 0)) };
    };
    const map = { [INV]: { items: {
      it1: [spec({ product_id: LYSE.id, product_name: "Lyse", per_qty: 2, restored_qty: 0.004 }), spec({ product_id: DIL.id, product_name: "Diluent", per_qty: 10, per_div: 20000, restored_qty: 0.0005 })],
      it2: [spec({ product_id: LYSE.id, product_name: "Lyse", restored_qty: 0.002 }), spec({ product_id: "p-gone", product_name: "خيط جراحي", unit: "stock", per_div: 1, restored_qty: 1 }), spec({ product_id: GLOVES.id, product_name: "قفازات", unit: "stock", per_div: 1, restored_qty: 0 })],
    }, skips: [], negatives: [], now_us: NOW_US, waste: [] } };
    const s = session(M, { url: `tab=waste&inv=${INV}`, api: { invoiceConsumption: async () => map, submitWaste: async (lines) => ({ pending: 0, ids: ["a", "b"], decided: { approved: 2, rejected: 0, void: 0, withdrawals: [], negatives: [] }, lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id, stock_now: 1, stock_after: 0.5 })) }) } });
    await s.ui.settle();
    const ls = s.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"]);
    const qtyOf = (id) => within(s.one("data-waste-line", id), "data-waste-qty")[0]?.props.value;
    const subOn = (id) => within(s.one("data-waste-line", id), "data-waste-unit", "sub")[0]?.props["aria-pressed"] === true;
    const noteOf = (id) => within(s.one("data-waste-line", id), "data-waste-note")[0]?.props.value;
    ok("inv.lines", "سطرٌ لكلّ مادة رجعت، بالوحدة الصغيرة: Lyse ٣ مل (مواصفتان)، Diluent ١٠ مل",
      J(ls) === J([LYSE.id, DIL.id]) && qtyOf(LYSE.id) === "3" && qtyOf(DIL.id) === "10" && subOn(LYSE.id) && subOn(DIL.id), J({ ls, l: qtyOf(LYSE.id), d: qtyOf(DIL.id) }));
    const no = M.invoiceNo(INV);
    ok("inv.note", `السببُ تالف والملاحظةُ «مواد خدمة مرجّعة — فاتورة ${no}»`,
      noteOf(LYSE.id) === `مواد خدمة مرجّعة — فاتورة ${no}` && within(s.one("data-waste-line", LYSE.id), "data-waste-reason", "damaged")[0]?.props["aria-pressed"] === true, noteOf(LYSE.id));
    ok("inv.skip", "وما لا يُكتب يُقال باسمه (محذوفة) — ولا يسقط بصمت", s.text(s.one("data-waste-skip")).includes('"خيط جراحي" ما موجودة بالمخزن') && s.text(s.one("data-waste-inv")).includes("عبّينا 2 مادة"), s.text(s.one("data-waste-inv")));
    await s.click("data-waste-send");
    const call = s.sends()[0];
    const dOf = (l) => { const p = l.product_id === LYSE.id ? LYSE : DIL; return M.C.stockNano(M.C.toMilli(l.qty), l.unit === "sub" ? M.C.subUnitMilli(p) : 1000n); };
    ok("inv.exact", "المُرسَل بالصغيرة يرجع d = ما رجع بالضبط (٠٫٠٠٦ و٠٫٠٠٠٥ علبة)",
      !!call && call[1].length === 2 && call[1].every((l) => l.unit === "sub" && l.reason === "damaged" && !("ack_over" in l))
        && dOf(call[1][0]) === M.C.roundScaled(0.006, 9) && dOf(call[1][1]) === M.C.roundScaled(0.0005, 9), J(call?.[1]));
    ok("inv.drop", "وبعد الإرسال يُشال inv من العنوان (لا تعبئةَ ثانية للفاتورة نفسها)", !/(^|&)inv=/.test(globalThis.__url) && s.log.calls.filter((c) => c[0] === "invoiceConsumption").length === 1, globalThis.__url);
    s.ui.unmount();
    return s.ui.errors;
  },

  /* و: فشلُ قراءة الفاتورة */
  async fail(M, ok) {
    let n = 0;
    const s = session(M, { url: `tab=waste&inv=${INV}`, api: { invoiceConsumption: async () => {
      if (n++ === 0) throw new Error("Failed to fetch");
      return { [INV]: { items: { it1: [{ spec_id: "s", product_id: LYSE.id, product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, live_qty: 0, live_value: 0, restored_qty: 0.004, shortfall: 0, note: null, source: "recipe", moves: mv([T0, 0.004], [T1, -0.004]) }] }, skips: [], negatives: [], now_us: NOW_US, waste: [] } };
    } } });
    await s.ui.settle();
    ok("fail.retry", "فشلُ القراءة: «ما گدرنا نجيب مواد الفاتورة» وزرُّ «أعد المحاولة»", !!s.one("data-waste-inv-failed") && !!s.one("data-waste-inv-retry"), s.text(s.ui.container));
    ok("fail.nolines", "ولا سطرَ واحد (لا نصفُ سند)", s.ui.findAll("data-waste-line").length === 0 && !globalThis.__holds.some((h) => !h.released));
    await s.click("data-waste-inv-retry");
    ok("fail.after", "والإعادةُ تعبّي", s.ui.findAll("data-waste-line").length === 1 && !s.one("data-waste-inv-failed"), s.text(s.ui.container));
    s.ui.unmount();
    return s.ui.errors;
  },

  /* هـ٢: فاتورةٌ مرّت بتعديل (جوابُ القاعدة الحقيقيّ، RL_*) — يعبّي ما رجع ولم يُصرف من جديد، كإشعار «رجّعنا مستهلكات» */
  async relink(M, ok) {
    const errors = [];
    const fill = async (entry) => {
      const s = session(M, { products: [SOL, PIECE], url: `tab=waste&inv=${RL_INV}`, api: { invoiceConsumption: async () => ({ [RL_INV]: entry }) } });
      await s.ui.settle();
      const got = s.ui.findAll("data-waste-line").map((n) => {
        const sub = within(n, "data-waste-unit", "sub")[0]?.props["aria-pressed"] === true;
        return `${n.props["data-waste-line"] === SOL.id ? "محلول" : "قطعة"}:${within(n, "data-waste-qty")[0]?.props.value}${sub ? "sub" : "stock"}`;
      }).sort();
      const text = s.text(s.ui.container);
      s.ui.unmount();
      errors.push(...s.ui.errors);
      return { got, text };
    };
    const a = await fill(RL_EDIT);
    ok("relink.edit", "بعد تعديلٍ أنقص سطراً: يعبّي ما رجع فعلاً (١٠ مل محلول، ١ قطعة) — لا موادَّ كلِّ السطور (٢٠ مل، ٣ قطع)",
      J(a.got) === J(["قطعة:1sub", "محلول:10sub"]), J(a.got));
    const b = await fill(RL_REFUND);
    ok("relink.refund", "وبعد ترجيع الفاتورة كلِّها: ما صرفته البيعةُ كلُّه (٢٠ مل، ٣ قطع) — لا ٣٠ مل و٥ قطع",
      J(b.got) === J(["قطعة:3sub", "محلول:20sub"]), J(b.got));
    const c = await fill(RL_SAME);
    ok("relink.same", "وسطرٌ مرّ بتعديلٍ بلا تغيير: ما رجع شي — «ماكو مواد خدمة رجعت…» ولا سطر",
      c.got.length === 0 && c.text.includes("ماكو مواد خدمة رجعت للمخزن"), J(c));
    return errors;
  },

  /* هـ٣: فاتورةٌ ما يعرفها الخادم بهالعيادة — «ما لكيناها» لا «ماكو مواد رجعت»؛ والمعرّفُ بحروفٍ كبيرة يُلقى */
  async unknown(M, ok) {
    const s = session(M, { url: `tab=waste&inv=${INV}`, api: { invoiceConsumption: async () => ({}) } });
    await s.ui.settle();
    ok("inv.unknown", `فاتورةٌ ما رجعت بالجواب: «فاتورة ${M.invoiceNo(INV)} ما لكيناها بهالعيادة» — لا «ماكو مواد رجعت» ولا سطر`,
      s.text(s.one("data-waste-inv-unknown")).includes(`فاتورة ${M.invoiceNo(INV)} ما لكيناها بهالعيادة`) && !s.one("data-waste-inv") && s.ui.findAll("data-waste-line").length === 0, s.text(s.ui.container));
    s.ui.unmount();
    const up = INV.toUpperCase();
    const s2 = session(M, { url: `tab=waste&inv=${up}`, api: { invoiceConsumption: async () => ({ [INV]: { items: { it1: [{ spec_id: "s", product_id: LYSE.id, product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, live_qty: 0, live_value: 0, restored_qty: 0.004, shortfall: 0, note: null, source: "recipe", moves: mv([T0, 0.004], [T1, -0.004]) }] }, skips: [], negatives: [], now_us: NOW_US, waste: [] } }) } });
    await s2.ui.settle();
    ok("inv.case", "ومعرّفٌ بالعنوان بحروفٍ كبيرة يلقى فاتورتَه (الخادمُ يكتب المفتاحَ بحروفٍ صغيرة)", s2.ui.findAll("data-waste-line").length === 1 && !s2.one("data-waste-inv-unknown"), s2.text(s2.ui.container));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* سطرٌ أُضيف والطلبُ بالطريق، أو بعد إرسالٍ ضاع جوابُه: يبقى بالمسودّة — يُشال ما سجّله الخادمُ وحده */
  async inflight(M, ok) {
    let release = null;
    const s = session(M, { api: { submitWaste: (lines) => new Promise((res) => {
      release = () => res({ pending: lines.length, ids: ["q1"], decided: null, lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id === FREE.id ? FREE.name : l.product_id, stock_now: 5, stock_after: 4 })) });
    }) } });
    await s.ui.settle();
    await s.add("شاش", FREE.id);
    const l1 = s.one("data-waste-line", FREE.id);
    await s.typeIn("data-waste-qty", "1", l1); await s.typeIn("data-waste-note", "انفتح", l1);
    await s.click("data-waste-send");
    await s.add("lyse", LYSE.id);
    // كُتب فيه والطلبُ بالطريق: عملٌ يمسك النسخةَ الجديدة (سطرٌ بلا شيءٍ مكتوب لا يمسك — hold.pick)
    await s.typeIn("data-waste-note", "انكسرت", s.one("data-waste-line", LYSE.id));
    release?.();
    await s.ui.settle();
    const left = s.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"]);
    ok("inflight.keep", "سطرٌ أُضيف وكُتب فيه والطلبُ بالطريق يبقى بعد نجاحه (والإمساكُ معه)، ويُشال ما سُجّل وحده",
      s.sends().length === 1 && J(left) === J([LYSE.id]) && !!s.one("data-waste-done", "pending") && globalThis.__holds.some((h) => h.ms === Infinity && !h.released), J({ left, sends: s.sends().length }));
    s.ui.unmount();
    // الإرسالُ الأوّل سُجّل وضاع جوابُه (شبكة)؛ أُضيفت مادة؛ الإعادةُ بنفس المرجع ترجع نتيجةَ الأوّل (rpc_refs) — بلاها.
    let k = 0;
    const s2 = session(M, { isManager: false, api: { submitWaste: async () => {
      if (k++ === 0) throw new Error("Failed to fetch");
      return { pending: 1, ids: ["q2"], decided: null, lines: [{ product_id: FREE.id, name: FREE.name, stock_now: 5, stock_after: 4 }] };
    } } });
    await s2.ui.settle();
    await s2.add("شاش", FREE.id);
    const m1 = s2.one("data-waste-line", FREE.id);
    await s2.typeIn("data-waste-qty", "1", m1); await s2.typeIn("data-waste-note", "انفتح", m1);
    await s2.click("data-waste-send");
    await s2.add("lyse", LYSE.id);
    const m2 = s2.one("data-waste-line", LYSE.id);
    await s2.typeIn("data-waste-qty", "0.5", m2); await s2.typeIn("data-waste-note", "انكسرت", m2);
    await s2.click("data-waste-send");
    const done = s2.one("data-waste-done", "pending");
    const left2 = s2.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"]);
    ok("replay.keep", "إعادةٌ رجعت بنتيجة الإرسال الأوّل: النتيجةُ تقول ما سُجّل (شاش)، وما أُضيف بعده (Lyse) باقٍ بالمسودّة لا «انسجل»",
      s2.sends().length === 2 && s2.sends()[0][3] === s2.sends()[1][3] && J(left2) === J([LYSE.id]) && s2.text(done).includes("شاش مجاني") && !s2.text(done).includes("Lyse"), J({ left2, done: s2.text(done) }));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* ما سينزل تحت الصفر بمنازل الرصيد: ٠٫٢ مل من ٥٠٠ على رصيدٍ صفر (٠ − ٠٫٠٠٠٤) لا يُقال «راح يصير −0» */
  async willzero(M, ok) {
    const errors = [];
    const run = async (after) => {
      const s = session(M, { isManager: false, products: [{ ...LYSE, stock: 0 }], api: { submitWaste: async () => ({ pending: 1, ids: ["z"], decided: null, lines: [{ product_id: LYSE.id, name: "Lyse", stock_now: 0, stock_after: after }] }) } });
      await s.ui.settle();
      await s.add("lyse", LYSE.id);
      const line = s.one("data-waste-line", LYSE.id);
      await s.click("data-waste-unit", "sub", line);
      await s.typeIn("data-waste-qty", "0.2", line); await s.typeIn("data-waste-note", "انسكب", line);
      await s.click("data-waste-send");
      await s.click("data-waste-over-yes");
      const out = { done: !!s.one("data-waste-done", "pending"), will: s.text(s.one("data-waste-will")), all: s.text(s.ui.container) };
      s.ui.unmount();
      errors.push(...s.ui.errors);
      return out;
    };
    const a = await run(-0.0004);
    ok("will.zero", "٠ − ٠٫٠٠٠٤: لا «رصيدها راح يصير −0» (ما دون منزلة الرصيد يحمله المرحَّل)", a.done && a.will === "" && !/−0(?![.\d])/.test(a.all), J(a));
    const b = await run(-0.0005);
    ok("will.half", "و٠ − ٠٫٠٠٠٥ يُقال «−0.001 علبة» (النصفُ بعيداً عن الصفر كتقريب الرصيد)", b.will.includes('"Lyse" رصيدها راح يصير −0.001 علبة بعد الموافقة'), J(b));
    return errors;
  },

  /* `?p=` يختار مادة، ومسحُ السند يُفلت؛ ومادةُ حوضٍ لا تُضاف ويُقال لماذا */
  async pick(M, ok) {
    const s = session(M, { url: `tab=waste&p=${LYSE.id}` });
    await s.ui.settle();
    // (والإمساكُ بما كُتب لا بوجود السطر: hold.pick)
    ok("pick.add", "?p= يختار المادة: سطرٌ واحدٌ لها", J(s.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"])) === J([LYSE.id]),
      J(s.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"])));
    await s.click("data-waste-remove", undefined, s.one("data-waste-line", LYSE.id));
    ok("pick.clear", "مسحُ السند يُفلت الإمساك ويشيل p من العنوان (إعادةُ التحميل لا تعبّي من جديد)", !s.one("data-waste-line") && globalThis.__holds.every((h) => h.released) && !/(^|&)p=/.test(globalThis.__url), globalThis.__url);
    s.ui.unmount();
    const s2 = session(M, { url: `tab=waste&p=${POOL.id}` });
    await s2.ui.settle();
    ok("pick.pooled", "ومادةُ حوضٍ لا تُضاف — ويُقال لماذا", !s2.one("data-waste-line") && s2.text(s2.one("data-waste-pick")).includes('"قفازات حوض" رصيدها بمخزون القسم — ما تنسجل هنا'), s2.text(s2.ui.container));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* ز: PendingTab وحده — سندٌ بالصغيرة، جردٌ نزل رصيدُه تحت فرقه بعد العدّ، وسندٌ كلفتُه صفر */
  async pend(M, ok) {
    const log = { negs: [], decide: [], changed: 0 };
    globalThis.__toast = { success() {}, error: (m) => log.err = m, warn() {}, toast() {} };
    globalThis.__repo = { decideStockCounts: async (ids, approve) => { log.decide.push([ids, approve]); return DECIDED; } };
    const prods = new Map([LYSE, SYR, FREE].map((p) => [p.id, p]));
    const ui = M.mount(M.React.createElement(M.PendingTab, { rows: PENDING_ROWS, productOf: (id) => prods.get(id ?? ""), isManager: true, restricted: false,
      onChanged: async () => { log.changed++; }, onNegatives: (l) => log.negs.push(l) }));
    await ui.settle();
    const h = harness(M, ui);
    const rowOf = (name) => ui.findAll("data-pending-row").find((n) => ui.text(n).startsWith(name));
    const w = rowOf("Lyse"), c = rowOf("سرنجة");
    ok("pend.chip", "السندُ بشارة «سند تلف» والجردُ بلاها", ui.text(within(w, "data-pending-waste")[0] ?? { type: "#text", text: "", children: [] }).includes("سند تلف") && within(c, "data-pending-waste").length === 0, ui.text(w));
    ok("pend.line", "السندُ «تلف 2 مل» لا «النظام … ← لقينا …»، والجردُ بسطره", ui.text(w).includes("تلف 2 مل") && !ui.text(w).includes("النظام") && ui.text(c).includes("النظام 0.04 ← لقينا 0.02"), `${ui.text(w)} | ${ui.text(c)}`);
    await h.click("data-pending-approve");
    const dlg = h.one("data-confirm-approve");
    ok("pend.noclamp", `المعاينةُ بلا حصر: جردٌ رصيدُه −0.01 وفرقُه −0.02 يُحسب سحبه — المجموع ${M.money(740)} (الحصرُ كان يقول ${M.money(240)})`,
      h.text(dlg).includes(M.money(740)) && !h.text(dlg).includes(M.money(240)), h.text(dlg));
    ok("pend.items", "ونصُّ السحب كما يكتبه الخادم: «Lyse ×2 مل» و«سرنجة ×0.02»", h.text(dlg).includes("Lyse ×2 مل") && h.text(dlg).includes("سرنجة ×0.02"), h.text(dlg));
    const changed = h.one("data-confirm-changed");
    ok("pend.changed", "«تغيّر من وقت العدّ» للجرد وحده — السندُ فرقٌ لا يتقادم، والنصُّ لا يقول «ما ينزل تحت الصفر»",
      h.text(changed).includes("«سرنجة»") && !h.text(changed).includes("Lyse") && !h.text(changed).includes("شاش") && h.text(changed).includes("ولو نزل تحت الصفر"), h.text(changed));
    ok("pend.zero", "والكلفةُ الصفر تُقال بالاسم بالموافقة", h.text(h.one("data-confirm-zero")).includes("«شاش مجاني»: كلفتها صفر"), h.text(dlg));
    /* لقطةُ السطر stock_unit_cost (0255): المتوسّطُ إن عُرف وإلا سعرُ الشراء — ولا تعبئةَ لما قبل 0255، فيومَ النشر كلُّ مادةٍ
     * بسعر شرائها (وهذه السطورُ كذلك: unit_cost = سعرُ الشراء). «بالكلفة» صادقةٌ بالحالين؛ «بمتوسط الكلفة» و«بسعر الشراء» كلٌّ بحال. */
    ok("pend.label", "والسحبُ يُقال «بالكلفة» (لقطةُ stock_unit_cost: المتوسّطُ أو سعرُ الشراء) — لا «بمتوسط الكلفة» ولا «بسعر الشراء»",
      h.text(dlg).includes(`بقيمة ${M.money(740)} (بالكلفة، ما يطلع من القاصة)`) && !h.text(dlg).includes("بسعر الشراء") && !h.text(dlg).includes("بمتوسط الكلفة"), h.text(dlg));
    await h.click("data-pending-go");
    ok("pend.negs", "بعد الموافقة: ما بقي تحت الصفر يصل الصفحة (negatives)، ثم إعادةُ التحميل",
      J(log.negs) === J([DECIDED.negatives]) && log.changed === 1 && J(log.decide) === J([[["w1", "c1", "w2"], true]]), J(log));
    ui.unmount();
    return ui.errors;
  },

  /* ز (الصفحة): StockCount كاملة — الموافقةُ تعيد التحميل والسالبُ يبقى ظاهراً؛ والسندُ لا يضيع بتبديل التبويب */
  async page(M, ok) {
    let pend = PENDING_ROWS;
    globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__holds = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = {
      listProducts: async () => [...ALL, SYR], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [],
      listStockCounts: async (q) => ("pending" in q ? pend : []), reportStockLosses: async () => [],
      decideStockCounts: async () => { pend = []; return DECIDED; },
    };
    globalThis.__url = "tab=pending";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    await h.click("data-pending-approve");
    await h.click("data-pending-go");
    await ui.settle();
    ok("page.negs", 'بعد الموافقة وإعادة التحميل: «"سرنجة" رصيدها صار −0.03 علبة بعد الموافقة — …» باقٍ بالصفحة (بوحدة المخزون)',
      h.text(h.one("data-pending-neg")).includes('"سرنجة" رصيدها صار −0.03 علبة بعد الموافقة — سجّل فاتورة الشراء أو سوّ جرد') && !!h.one("data-pending-empty"), h.text(ui.container).slice(0, 400));
    await h.click("data-seg", "waste");
    await ui.settle();
    await h.add("قفاز", GLOVES.id);
    await h.typeIn("data-waste-qty", "2", h.one("data-waste-line", GLOVES.id));
    await h.click("data-seg", "pending");
    await ui.settle();
    const box = () => h.one("data-count-waste");
    const qtyIn = () => within(within(box(), "data-waste-line", GLOVES.id)[0] ?? { props: {}, children: [] }, "data-waste-qty")[0]?.props.value;
    const kept1 = box()?.props.hidden === true && within(box(), "data-waste-line", GLOVES.id).length === 1 && qtyIn() === "2";
    await h.click("data-seg", "waste");
    await ui.settle();
    ok("page.keep", "سندٌ مكتوب يبقى حين يُبدَّل التبويب ويُرجع إليه (مخفيٌّ لا مُزال) — بكميته وإمساكه",
      kept1 && box()?.props.hidden === false && within(box(), "data-waste-line", GLOVES.id).length === 1 && qtyIn() === "2" && globalThis.__holds.some((x) => x.ms === Infinity && !x.released), J({ kept1, hidden: box()?.props.hidden, qty: qtyIn() }));
    ui.unmount();
    return ui.errors;
  },

  /* عدّ اليوم (0255): معاينةُ الفرق بكلفة ما سيُسجَّل — stock_count_submit يلقط stock_unit_cost (المتوسّط) لا سعرَ الشراء */
  async today(M, ok) {
    const AVG = P("p-avg", "مرهم بالمتوسط", { stock: 5, purchase_price: 1000, avg_cost: 2000 });
    // متوسّطٌ صفرٌ صريح: stock_unit_cost = greatest(coalesce(0, 1000, 0), 0) = 0 — كلفةٌ صفر لا «مجهول» يتبع سعرَ الشراء.
    const ZERO = P("p-avg0", "شاش متوسطه صفر", { stock: 5, purchase_price: 1000, avg_cost: 0 });
    globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__holds = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = {
      listProducts: async () => [AVG, ZERO], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [],
      listStockCounts: async () => [], reportStockLosses: async () => [],
    };
    globalThis.__url = "";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    const lineOf = () => ui.findAll("data-count-line").find((n) => ui.text(n).includes(AVG.name));
    if (!lineOf()) { await h.typeIn("data-count-search", "مرهم"); await h.click("data-count-add"); }
    await h.typeIn("data-count-input", "3", lineOf());
    const diff = h.text(within(lineOf(), "data-count-diff")[0]);
    ok("today.money", `لقيت ٣ من ٥ (متوسطها ٢٠٠٠، سعرُ شرائها ١٠٠٠): الفرقُ يُقال ${M.money(4000)} — ما سيُسجَّل — لا ${M.money(2000)}`,
      diff.includes(`· ${M.money(4000)}`) && !diff.includes(M.money(2000)), diff);
    const zl = () => ui.findAll("data-count-line").find((n) => ui.text(n).includes(ZERO.name));
    if (!zl()) { await h.typeIn("data-count-search", "شاش"); await h.click("data-count-add"); }
    await h.typeIn("data-count-input", "3", zl());
    const zd = h.text(within(zl(), "data-count-diff")[0]);
    ok("today.zeroAvg", `ومتوسطُها صفرٌ صريح (سعرُ شرائها ١٠٠٠): كلفتُها صفر — الفرقُ بلا مبلغ (حارسُ ٠ < الكلفة)، لا ${M.money(2000)} بسعر الشراء`,
      zd.includes("الفرق") && !zd.includes("·") && !zd.includes(M.money(2000)), zd);
    ui.unmount();
    return ui.errors;
  },

  /* وين راحت الفلوس: السندُ بما كُتب ووحدته (١ مل من ٢٠٠٠٠ = −٠٫٠٠٠٠٥ كان «−0»)، والراكدُ بعنوان ما يُحسب به */
  async report(M, ok) {
    const APPROVED = [
      row({ id: "a1", product_id: DIL.id, product_name: "Diluent", system_qty: 0.00005, counted_qty: 0, unit_cost: 150000, status: "approved", applied_delta: -0.00005, decided_by_name: "المدير",
        decided_at: "2026-10-31T09:00:00Z", source: "waste", entered_qty: 1, entered_unit: "sub", unit_label: "مل" }),
      row({ id: "a2", product_id: SYR.id, product_name: "سرنجة", system_qty: 0.04, counted_qty: 0.02, unit_cost: 25000, status: "approved", applied_delta: -0.02, decided_by_name: "المدير",
        decided_at: "2026-10-31T09:00:00Z", source: "count" }),
    ];
    globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__holds = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = {
      listProducts: async () => [...ALL, SYR], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [],
      listStockCounts: async (q) => ("pending" in q ? [] : APPROVED), reportStockLosses: async () => [{ reason: "damaged", lines: 2, qty: 0.02005, value: 507.5 }],
    };
    globalThis.__url = "tab=report";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    const losses = h.text(h.one("data-report-losses"));
    ok("report.waste", "السندُ المعتمد يُقال «تالف −1 مل» لا «−0»، والجردُ بفرقه «تالف −0.02»",
      losses.includes("تالف −1 مل") && losses.includes("تالف −0.02") && !/−0(?![.\d])/.test(losses), losses);
    const dead = h.text(h.one("data-report-dead"));
    // deadStock: avg_cost ?? purchase_price — وهذه الموادُّ كلُّها بلا متوسّط (يومَ نشر 0255 كلُّ الرفّ كذلك): «بالكلفة» صادقةٌ بالحالين.
    ok("report.dead", "والراكدُ «بالكلفة» (المتوسّطُ أو سعرُ الشراء) — لا «بمتوسط الكلفة» عن موادَّ بلا متوسّط ولا «بسعر الشراء»",
      dead.includes("مادة — بالكلفة") && !dead.includes("بمتوسط الكلفة") && !dead.includes("بسعر الشراء"), dead);
    ui.unmount();
    return ui.errors;
  },

  /* ح: البطاقات */
  async cards(M, ok) {
    let n = 0;
    const REPORT = {
      products: [{ product_id: LYSE.id, name: "Lyse", used: 0.006, value: 360, short: 0, lines: 2 }, { product_id: GLOVES.id, name: "قفازات", used: 2, value: 25000, short: 0.5, lines: 1 }],
      short_products: 1,
      overrides: { count: 12, recent: [{ invoice_id: INV, created_at: "2026-10-30T10:00:00Z", service_name: "تعقيم قطة", products: ["Lyse", "قفازات"], by_name: "د. سارة" }, { invoice_id: INV, created_at: "2026-10-29T10:00:00Z", service_name: "فحص", products: [], by_name: null }] },
      unconsumed: { old_device: 2, service_missing: 1, recent: [{ invoice_id: INV, created_at: "2026-10-28T10:00:00Z", line_name: "تطعيم", note: "old_device" }] },
    };
    const calls = [];
    globalThis.__api = { reportConsumables: async (from, to) => { calls.push([from, to]); if (n++ === 0) throw new Error("Failed to fetch"); return REPORT; } };
    const mk = (showCost) => M.mount(M.React.createElement(M.ConsumablesCards, { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", showCost, products: ALL }));
    const ui = mk(true);
    await ui.settle();
    const h = harness(M, ui);
    ok("cards.fail", "فشلُ التقرير: «ما گدرنا نجيب مستهلكات الخدمات» وزرُّ «أعد المحاولة» — ولا بطاقة", !!h.one("data-cons-failed") && !!h.one("data-cons-retry") && !h.one("data-cons"), h.text(ui.container));
    ok("cards.nozero", "ولا صفرٌ عن مجهول", !/: 0( |$)/.test(h.text(ui.container)) && !h.text(ui.container).includes("انصرفت"), h.text(ui.container));
    await h.click("data-cons-retry");
    const all = h.text(h.one("data-cons"));
    ok("cards.after", "الإعادةُ تطلب المدّةَ نفسها", calls.length === 2 && J(calls[0]) === J(calls[1]) && J(calls[0]) === J(["2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]), J(calls));
    ok("cards.used", `«انصرفت على الخدمات هالفترة: ${M.money(25360)} (كلفة الخدمات، مو خسارة)» وLyse بالمل (٠٫٠٠٦ علبة = ٣ مل)`,
      h.text(h.one("data-cons-used")).includes(`انصرفت على الخدمات هالفترة: ${M.money(25360)} (كلفة الخدمات، مو خسارة)`) && h.text(h.one("data-cons-used")).includes("3 مل"), h.text(h.one("data-cons-used")));
    ok("cards.short", "«صُرفت بلا رصيد: 1 مادة» بالمادة وكميتها", h.text(h.one("data-cons-short")).includes("صُرفت بلا رصيد: 1 مادة") && h.text(h.one("data-cons-short")).includes("قفازات0.5 علبة"), h.text(h.one("data-cons-short")));
    const ov = h.one("data-cons-overrides");
    ok("cards.overrides", "«تعديلات على الوصفة: 12 حالة» تنفتح: من ومتى وبأيّ مواد، و«بلا مواد» لقائمةٍ فارغة، و«يعرض آخر 2 بس»",
      ov?.type === "details" && h.text(ov).includes("تعديلات على الوصفة: 12 حالة") && h.text(ov).includes("تعقيم قطة — Lyse، قفازات") && h.text(ov).includes("د. سارة")
        && h.text(ov).includes("فحص — بلا مواد") && h.text(ov).includes("يعرض آخر 2 بس") && h.text(ov).includes(M.invoiceNo(INV)), h.text(ov));
    ok("cards.unconsumed", "«خدمات انباعت بلا خصم مستهلكات: 3 (…)» بالجهاز القديم", h.text(h.one("data-cons-unconsumed")).includes("خدمات انباعت بلا خصم مستهلكات: 3 (أجهزة ما تحدّثت أو خدمة مو موجودة)")
      && h.text(h.one("data-cons-unconsumed")).includes("تطعيمجهاز ما تحدّث"), h.text(h.one("data-cons-unconsumed")));
    ok("cards.money", "المبالغُ لمن يرى الكلفة", all.includes(M.money(360)));
    ui.unmount();
    const u2 = mk(false);
    await u2.settle();
    const t2 = u2.text(u2.container);
    ok("cards.nocost", "ومن لا يرى الكلفة: عددُ الموادّ لا المبلغ", t2.includes("انصرفت على الخدمات هالفترة: 2 مادة") && !t2.includes(M.money(25360)) && !t2.includes(M.money(360)), t2);
    u2.unmount();
    return [...ui.errors, ...u2.errors];
  },

  /* ي١) الدفعةُ لا التراكم: TWO بعد فعلين — T1 وحده ثم T2 وحده؛ وجوابُ القاعدة (RL_REFUND) بالترجيع وحده؛ وقائمةٌ تالفة لا تعبّي */
  async batch(M, ok) {
    const errors = [];
    const run = async (entry, o) => { const r = await fillFrom(M, entry, o); errors.push(...r.errors); return r; };
    const a = await run(TWO(), { at: `${T1}` });
    ok("batch.fill", "`at=T1`: يعبّي ما رجّعه ذلك الفعلُ وحده — Lyse ٢ مل وDiluent ١٠ مل والقفازاتُ علبة (لا التراكميّ ٦ مل و٣٠ مل)",
      J(a.got) === J(["Diluent:10sub", "Lyse:2sub", "قفازات:1stock"]), J(a.got));
    const b = await run(TWO(), { at: `${T2}` });
    ok("batch.second", "ترجيعٌ ثانٍ على الفاتورة (`at=T2`): ما رجّعه هو وحده — Lyse ٤ مل وDiluent ٢٠ مل، والقفازاتُ (رجعت بالأوّل) لا تُعبّأ ثانيةً",
      J(b.got) === J(["Diluent:20sub", "Lyse:4sub"]), J(b.got));
    const c = await run(RL_REFUND, { at: `${T2}`, inv: RL_INV, products: [SOL, PIECE] });
    ok("batch.relink", "جوابُ القاعدة بعد تعديلٍ ثم ترجيع (`at=T2`): ما رجّعه الترجيعُ وحده (٢ قطعة، ١٠ مل) — لا ما رجع بالتعديل قبله (التراكميّ ٣ و٢٠)",
      J(c.got) === J(["قطعة:2sub", "محلول:10sub"]), J(c.got));
    const BAD = `الرابط ما يطابق أي ترجيع بفاتورة ${M.invoiceNo(INV)} — ما نعرف شنو رجع للمخزن، فما نعبّي منه شي`;
    const d = await run(TWO(), { at: `${T1},x` });
    ok("batch.bad", "وقائمةُ دفعاتٍ فيها ما ليس عدداً لا تعبّي شيئاً — لا رجوعَ للتراكميّ، ولا «ماكو مواد رجعت» عن مجهول: «الرابط ما يطابق…»",
      d.got.length === 0 && d.bad.includes(BAD) && !d.text.includes("ماكو مواد") && !d.held, J({ got: d.got, bad: d.bad, held: d.held }));
    // دفعةٌ عددٌ سليم لا حدثَ لها بالدفتر (رابطٌ مقطوع، أو لغير هالفاتورة): مجهولٌ لا صفر؛ ودفعةٌ بالدفتر رجّعت صفراً
    // (تعديلٌ بلا تغيير: RL_SAME بدفعة T1) هي وحدها «ماكو مواد رجعت» — وهي صادقة.
    // ورابطٌ طابقت بعضُ دفعاته (T2 ومعها دفعةٌ لا حدثَ لها): تعبئةُ T2 وحدها تُسقط الباقيةَ بصمت — مجهولٌ كلُّه.
    const e = await run(TWO(), { at: `${T0 + 7}` });
    const e2 = await run(TWO(), { at: `${T2},${T0 + 7}` });
    const f = await run(RL_SAME, { at: `${T1}`, inv: RL_INV, products: [SOL, PIECE] });
    ok("batch.unmatched", "دفعةٌ ليست بدفتر الفاتورة (وحدها أو مع دفعةٍ سليمة): «الرابط ما يطابق…» لا «ماكو مواد رجعت» ولا نصفُ تعبئة — ودفعةٌ بالدفتر ما رجّعت شي تبقى «ماكو» (صادقة)",
      [e, e2].every((r) => r.got.length === 0 && r.bad.includes(BAD) && !r.text.includes("ماكو مواد") && !r.held)
        && f.got.length === 0 && f.text.includes("ماكو مواد خدمة رجعت للمخزن") && f.bad === "", J({ e: [e.got, e.bad], e2: [e2.got, e2.bad], f: [f.got, f.bad] }));
    return errors;
  },

  /* ي٢) مرجعُ السطر: كلُّ سطرٍ عُبّي يرسل src_invoice وكلَّ دفعةٍ من الرابط رجعت فيها مادتُه، والمكتوبُ باليد بلاهما */
  async src(M, ok) {
    const products = [LYSE, DIL, { ...GLOVES, stock: 5 }, FREE];
    const s = session(M, { products, url: `tab=waste&inv=${INV}&at=${T1},${T2}`, api: {
      invoiceConsumption: async () => ({ [INV]: TWO() }),
      submitWaste: async (lines) => ({ pending: 0, ids: lines.map((_, i) => `w${i}`), decided: { approved: lines.length, rejected: 0, void: 0, withdrawals: [], negatives: [] },
        lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id, stock_now: 5, stock_after: 4 })) }),
    } });
    await s.ui.settle();
    await s.add("شاش", FREE.id);
    const fl = s.one("data-waste-line", FREE.id);
    await s.typeIn("data-waste-qty", "1", fl); await s.typeIn("data-waste-note", "انفتح", fl);
    await s.click("data-waste-send");
    const sent = s.sends()[0]?.[1] ?? [];
    const by = Object.fromEntries(sent.map((l) => [l.product_id, l]));
    const src = (id) => J([by[id]?.src_invoice ?? null, by[id]?.src_batches ?? null]);
    ok("batch.src", "كلُّ سطرٍ عُبّي يرسل src_invoice وكلَّ دفعةٍ من الرابط رجعت فيها مادتُه تصاعدياً (Lyse وDiluent ← T1 وT2، القفازاتُ ← T1 وحدها)، والمكتوبُ باليد بلاهما",
      sent.length === 4 && src(LYSE.id) === J([INV, [T1, T2]]) && src(DIL.id) === J([INV, [T1, T2]]) && src(GLOVES.id) === J([INV, [T1]])
        && by[LYSE.id]?.qty === 6 && by[LYSE.id]?.unit === "sub" && !!by[FREE.id] && !("src_invoice" in by[FREE.id]) && !("src_batches" in by[FREE.id])
        && !sent.some((l) => "src_batch_us" in l), J(sent));
    ok("batch.drop", "وبعد الإرسال يُشال inv وat من العنوان (لا تعبئةَ ثانية للرابط نفسه)", !/(^|&)(inv|at)=/.test(globalThis.__url), globalThis.__url);
    s.ui.unmount();
    return s.ui.errors;
  },

  /* ي٣) ما سُجّل هدراً لا يُعبّأ ثانيةً — بدفعات الرابط (والمعلَّقُ يُعدّ)، وسطرٌ من دفعةٍ أخرى لا يمنع، وبلا دفعات أيُّ سطرٍ
   *     من الفاتورة يمنع؛ والفاتورةُ المسجّلةُ كلُّها سطرٌ واحد بلا سند */
  async already(M, ok) {
    const errors = [];
    const run = async (entry, o) => { const r = await fillFrom(M, entry, o); errors.push(...r.errors); return r; };
    const A1 = "2026-10-31T09:30:00.000Z", A2 = "2026-10-31T09:40:00.000Z";
    const when = (iso) => `${M.formatDate(iso, "ar")} ${M.formatTime(iso, "ar")}`;
    const a = await run(TWO([WR(LYSE.id, T2, "pending", A1)]), { at: `${T2}` });
    ok("already.batch", `Lyse لها سطرٌ معلَّق من هالترجيع: ما تُعبّأ وتُقال «"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)})» — وDiluent يُعبّأ`,
      J(a.got) === J(["Diluent:20sub"]) && a.already.length === 1 && a.already[0].includes(`"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`) && a.text.includes("عبّينا 1 مادة"), J(a));
    const b = await run(TWO([WR(LYSE.id, T1, "approved", A1)]), { at: `${T2}` });
    ok("already.other", "وسطرٌ من دفعةٍ أخرى (T1) لا يمنع تعبئةَ ما رجّعه هذا الترجيع (Lyse ٤ مل)", J(b.got) === J(["Diluent:20sub", "Lyse:4sub"]) && b.already.length === 0, J(b));
    /* م) سطرٌ عُبّي من دفعتين (T1 وT2: فعلان بنافذة إشعارٍ واحدة) يُرى من أيٍّ منهما: رابطٌ لاحق بـT1 وحدها (إشعارُ
     *    الجهاز الآخر) أو بـT2 وحدها لا يعبّي Lyse ثانيةً — كان يُحفظ أحدثُهما (T2) فيُعبّأ ما رجّعه T1 مرّةً ثانية. */
    const m1 = await run(TWO([WR(LYSE.id, [T1, T2], "approved", A1)]), { at: `${T1}` });
    const m2 = await run(TWO([WR(LYSE.id, [T1, T2], "approved", A1)]), { at: `${T2}` });
    ok("already.multi", "سطرٌ عُبّي من دفعتين يمنع رابطاً بأيٍّ منهما: T1 وحدها ← Diluent ١٠ مل والقفازات، وT2 وحدها ← Diluent ٢٠ مل — وLyse «سجّلتها هدر قبل لهالترجيع» بالاثنين",
      J(m1.got) === J(["Diluent:10sub", "قفازات:1stock"]) && J(m2.got) === J(["Diluent:20sub"])
        && [m1, m2].every((r) => r.already.length === 1 && r.already[0].includes(`"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)})`)),
      J({ m1: [m1.got, m1.already], m2: [m2.got, m2.already] }));
    const c = await run(TWO([WR(LYSE.id, T1, "approved", A1), WR(GLOVES.id, null, "pending", A2)]));
    ok("already.inv", "رابطٌ قديم بلا at: تراكميٌّ كما كان، وكلُّ مادةٍ لها سطرٌ من الفاتورة بأيّ دفعة (أو بلا دفعة) لا تُعبّأ — تُقال باسمها",
      J(c.got) === J(["Diluent:30sub"]) && c.already.length === 2 && c.already.some((x) => x.includes(`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)})`))
        && c.already.some((x) => x.includes(`"قفازات" سجّلتها هدر قبل من هالفاتورة (${when(A2)})`)), J(c));
    const d = await run(TWO([WR(LYSE.id, T2, "approved"), WR(DIL.id, T2, "pending")]), { at: `${T2}` });
    ok("already.all", `كلُّ ما رجّعه الترجيعُ مسجّل: سطرٌ واحد «مواد فاتورة ${M.invoiceNo(INV)} … سجّلتها هدر قبل» — بلا «ماكو» ولا «عبّينا» ولا سند`,
      d.got.length === 0 && d.all.includes(`مواد فاتورة ${M.invoiceNo(INV)} اللي رجعت للمخزن سجّلتها هدر قبل — ما نعبّيها مرّة ثانية`) && d.already.length === 0
        && !d.text.includes("ماكو مواد") && !d.text.includes("عبّينا") && !d.held, J(d));
    /* سندٌ عُبّي من الفاتورة كلِّها (batch_us null: رابطٌ بلا at) شمل كلَّ ما رجع قبل تسجيله: سُجّل بعد T2 فيمنع T2؛
     * وقبله (07:15، بين T1 وT2) ما شمله فيُعبّأ — ورابطُ T1+T2 تسبق أقدمُ دفعتيه السندَ فلا يُعبّأ (المقارنةُ بالأقدم لا
     * بالأحدث)، ووقتٌ لا يُقرأ يُعدّ بعد كلّ دفعة. كان يُتجاوز بالدفعات فيُعبّأ ما شُطب مرّةً ثانية. */
    const BEFORE = "2026-10-31T07:15:00.000Z";
    const e = await run(TWO([WR(LYSE.id, null, "approved", A1)]), { at: `${T2}` });
    const f = await run(TWO([WR(LYSE.id, null, "approved", BEFORE)]), { at: `${T2}` });
    const g = await run(TWO([WR(LYSE.id, null, "pending", BEFORE)]), { at: `${T1},${T2}` });
    const h = await run(TWO([WR(LYSE.id, null, "approved", "")]), { at: `${T2}` });
    ok("already.whole", `سندُ الفاتورة كلِّها (بلا دفعة) سُجّل بعد الترجيع: Lyse ما تُعبّأ وتُقال «"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)})» — وقبله تُعبّأ ٤ مل، ورابطُ دفعتين أقدمُهما قبله لا يعبّيها، ووقتٌ لا يُقرأ يمنع`,
      J(e.got) === J(["Diluent:20sub"]) && e.already.length === 1 && e.already[0].includes(`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)}) — ما نعبّيها مرّة ثانية`)
        && J(f.got) === J(["Diluent:20sub", "Lyse:4sub"]) && f.already.length === 0
        && J(g.got) === J(["Diluent:30sub", "قفازات:1stock"]) && g.already.length === 1
        && J(h.got) === J(["Diluent:20sub"]) && h.already.length === 1, J({ e: [e.got, e.already], f: [f.got, f.already], g: [g.got, g.already], h: [h.got, h.already] }));
    /* توأمان بنفس الاسم (مقيسان بالمخازن): سطرا «سجّلتها هدر» وسطرا التخطّي كلُّها تُرسم بلا مفتاحٍ مكرّر — المفتاحُ
     * بالاسم كان مكرّراً، وReact معه يُسقط أحدَ السطرين أو يكرّره (تحذيرُه يُمسك هنا). */
    const TW = P("p-twin", "Lyse", { stock: 1, purchase_price: 60000, has_sub_unit: true, sub_unit_name: "مل", units_per_box: 500 });
    const tw = TWO([WR(LYSE.id, T2, "approved"), WR(TW.id, T2, "pending")]);
    tw.items.it2 = [{ ...tw.items.it1[0], spec_id: "tw", product_id: TW.id, moves: mv([T0, 0.012], [T2, -0.008]) },
      ...["g1", "g2"].map((sid) => ({ ...tw.items.it1[0], spec_id: sid, product_id: `p-gone-${sid}`, product_name: "خيط جراحي", moves: mv([T0, 0.002], [T2, -0.002]) }))];
    const warned = [], orig = console.error;
    console.error = (...a) => { warned.push(a.map(String).join(" ")); };
    let tr;
    try { tr = await run(tw, { at: `${T2}`, products: [LYSE, DIL, TW] }); } finally { console.error = orig; }
    const dup = warned.filter((x) => /same key/.test(x));
    ok("already.twins", "توأمان باسم «Lyse» سُجّلا ومحذوفتان باسم «خيط جراحي»: كلُّ سطرٍ يُقال (٢ و٢) بلا مفتاحٍ مكرّر",
      J(tr.got) === J(["Diluent:20sub"]) && tr.already.length === 2 && tr.skips.filter((x) => x.includes('"خيط جراحي" ما موجودة بالمخزن')).length === 2 && dup.length === 0,
      J({ got: tr.got, already: tr.already.length, skips: tr.skips.length, dup: dup.map((x) => x.slice(0, 120)) }));
    return errors;
  },

  /* ي٤) العقدُ الجديد غائب (moves أو now_us أو waste): بطاقةُ الفشل وإعادة — لا «ماكو» ولا تعبئة؛ والإعادةُ بجوابٍ كامل تعبّي */
  async shape(M, ok) {
    const errors = [];
    const run = async (entry, o) => { const r = await fillFrom(M, entry, o); errors.push(...r.errors); return r; };
    const noMoves = TWO(); delete noMoves.items.it1[1].moves;
    const noNow = TWO(); delete noNow.now_us;
    const noWaste = TWO(); delete noWaste.waste;
    for (const [key, entry, what] of [["shape.moves", noMoves, "مواصفةٌ بلا moves"], ["shape.now", noNow, "جوابٌ بلا now_us"], ["shape.waste", noWaste, "جوابٌ بلا waste"]]) {
      const r = await run(entry, { at: `${T2}` });
      ok(key, `${what}: بطاقةُ «ما گدرنا نجيب مواد الفاتورة» — لا سطرَ ولا «ماكو مواد رجعت»`, r.failed && r.got.length === 0 && !r.text.includes("ماكو مواد") && !r.held, J({ got: r.got, failed: r.failed }));
    }
    // م) سطرُ هدرٍ دفعاتُه فارغة، أو بالشكل القديم (batch_us وحده بلا batches): شكلٌ ناقص — بطاقةُ الفشل، لا تعبئةٌ تتجاهله.
    const emptyB = TWO([{ ...WR(LYSE.id, T2, "pending"), batches: [] }]);
    const oldB = TWO([WR(LYSE.id, T2, "pending")]); delete oldB.waste[0].batches;
    const rb = [await run(emptyB, { at: `${T2}` }), await run(oldB, { at: `${T2}` })];
    ok("shape.batches", "سطرُ هدرٍ دفعاتُه فارغة أو بالشكل القديم (batch_us وحده): بطاقةُ الفشل — لا سطرَ ولا «ماكو مواد رجعت»",
      rb.every((r) => r.failed && r.got.length === 0 && !r.text.includes("ماكو مواد") && !r.held), J(rb.map((r) => ({ failed: r.failed, got: r.got }))));
    let n = 0;
    const s = session(M, { products: [LYSE, DIL, GLOVES], url: `tab=waste&inv=${INV}&at=${T2}`, api: { invoiceConsumption: async () => ({ [INV]: n++ === 0 ? noWaste : TWO() }) } });
    await s.ui.settle();
    const first = !!s.one("data-waste-inv-failed");
    if (first) await s.click("data-waste-inv-retry");
    ok("shape.retry", "والإعادةُ بجوابٍ كامل تعبّي ما رجّعه الترجيع", first && s.ui.findAll("data-waste-line").length === 2 && !s.one("data-waste-inv-failed"), s.text(s.ui.container));
    s.ui.unmount();
    errors.push(...s.ui.errors);
    // ومثلُها ما يُقرأ من القديم: items غائبة أو null أو مصفوفة (الخادمُ يكتبها {} ولا يُسقطها) — كان `items ?? {}`
    // يقولها «ماكو مواد رجعت»؛ ومواصفةٌ بلا restored_qty (بيعة) أو live_qty (ربط) — كان `Number(…) || 0` يُسقط Lyse من
    // الرابط القديم بلا كلمة، ويعبّي بعد تعديلٍ قطعتين والراجعُ واحدة (حيُّ الربط الغائب لا يُطرح).
    const noItems = TWO(); delete noItems.items;
    const nullItems = TWO(); nullItems.items = null;
    const arrItems = TWO(); arrItems.items = [];
    const ri = [await run(noItems, {}), await run(nullItems, {}), await run(arrItems, { at: `${T2}` })];
    ok("shape.items", "جوابٌ بلا items (غائبة، null، مصفوفة): بطاقةُ الفشل — لا «ماكو مواد رجعت»، بلا at ومعه",
      ri.every((r) => r.failed && r.got.length === 0 && !r.text.includes("ماكو مواد") && !r.held), J(ri.map((r) => ({ failed: r.failed, got: r.got }))));
    const noRest = TWO(); delete noRest.items.it1[0].restored_qty;
    const noLive = structuredClone(RL_EDIT); delete noLive.items["c48f9e65-8035-4cdf-bd92-2d7dd785e429"][0].live_qty;
    const rq = [await run(noRest, {}), await run(noLive, { inv: RL_INV, products: [SOL, PIECE] })];
    ok("shape.qty", "مواصفةٌ بلا restored_qty أو live_qty: بطاقةُ الفشل — لا سندٌ ناقصٌ مادة، ولا قطعتان عن واحدة",
      rq.every((r) => r.failed && r.got.length === 0 && !r.held), J(rq.map((r) => ({ failed: r.failed, got: r.got }))));
    return errors;
  },

  /* ي٥) البحثُ بالرمز من مصدره الواحد (codeMatcher): رقمُ رفٍّ بحروفٍ صغيرة، وجزءٌ من باركودٍ إضافيّ — بالسند وبعدّ اليوم */
  async code(M, ok) {
    const SHELF = P("p-shelf", "مرهم عيون", { barcode: "W90", alt_codes: ["8711908384001"] });
    const s = session(M, { products: [...ALL, SHELF] });
    await s.ui.settle();
    const found = async (q) => { await s.typeIn("data-waste-search", q); return s.ui.findAll("data-waste-add").map((n) => n.props["data-waste-add"]); };
    const a = await found("w90");
    ok("code.case", "السند: «w90» يلقى مادةً رمزُها «W90» (طيُّ الحالة)", a.includes(SHELF.id), J(a));
    const b = await found("384001"), c = await found("999999");
    ok("code.partial", "وجزءٌ من باركودها الإضافيّ («384001» من 8711908384001) يلقاها، ورمزٌ غريبٌ لا يلقى شيئاً", b.includes(SHELF.id) && c.length === 0, J({ b, c }));
    s.ui.unmount();
    globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__holds = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = { listProducts: async () => [SHELF], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [], listStockCounts: async () => [], reportStockLosses: async () => [] };
    globalThis.__url = "";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    const hits = async (q) => { await h.typeIn("data-count-search", q); return ui.findAll("data-count-add").map((n) => ui.text(n)); };
    const x = await hits("w90"), y = await hits("384001");
    ok("count.code", "وعدُّ اليوم كذلك: «w90» وجزءُ الباركود الإضافيّ يلقيان المادة", x.some((v) => v.includes(SHELF.name)) && y.some((v) => v.includes(SHELF.name)), J({ x, y }));
    ui.unmount();
    return [...s.ui.errors, ...ui.errors];
  },

  /* ي٦) لا لونَ فوق 700 على سطور الميزة: السلالمُ الدلالية تقف عند 700 (CLAUDE.md §٣) — صنفٌ بلا CSS والنصُّ يرث لونَ أبيه */
  async colors(M, ok) {
    const bad = (s) => s.match(/\btext-(?:warn|danger|success)-(?:800|900)\b/g) ?? [];
    ok("color.waste", "WasteTab.tsx (ملفُّ الميزة كلُّه): ولا صنف text-*-800/900", bad(M.SRC[W]).length === 0, bad(M.SRC[W]).join(","));
    const line = M.SRC[S].split("\n").find((l) => l.includes('t("cnt.neg.withdrawCost"')) ?? "";
    ok("color.withdraw", "وسطرُ «وينسجل سحب … بالكلفة» بـStockCount (سطرُ الميزة) بلون 700", line !== "" && bad(line).length === 0 && line.includes("text-warn-700"), line.trim().slice(0, 160));
    return [];
  },

  /* ن١) سقفُ البحث يقول إنه سقف (w5a): ١٢ قفازاً بالاسم ← ٨ تُرى و«و4 غيرها — اكتب أكثر»؛ وبلا زيادة لا سطر. ورمزٌ كُتب كاملاً
   *     (رقمُ رفٍّ «47») لا يضيّقه حرفٌ آخر: مطابقُه بالضبط أوّلاً، لا خلف عشرة باركوداتٍ تحويه فقط (codeMatcher جزئيّ). */
  async more(M, ok) {
    const GL = Array.from({ length: 12 }, (_, i) => P(`p-gl${i}`, `قفاز ${i + 1}`));
    const s = session(M, { products: GL });
    await s.ui.settle();
    await s.typeIn("data-waste-search", "قفاز");
    const shown = s.ui.findAll("data-waste-add").length, more = s.text(s.one("data-waste-more"));
    await s.typeIn("data-waste-search", "قفاز 1");
    const few = s.ui.findAll("data-waste-add").length, fewMore = !!s.one("data-waste-more");
    ok("pick.more", "١٢ مطابقة: ٨ تُرى وسطرٌ يقول «و4 غيرها — اكتب أكثر»؛ وأربعٌ بلا زيادة بلا سطر (القائمةُ المقصوصة لا تُصدَّق بصمت)",
      shown === 8 && more.includes("و4 غيرها — اكتب أكثر") && few === 4 && !fewMore, J({ shown, more, few, fewMore }));
    s.ui.unmount();
    const SHELF = P("p-47", "يود للجروح", { barcode: "47" });
    const BC = Array.from({ length: 10 }, (_, i) => P(`p-bc${i}`, `أدوية ${i}`, { barcode: `869047${String(i).padStart(7, "0")}` }));
    const s2 = session(M, { products: [...BC, SHELF] });
    await s2.ui.settle();
    await s2.typeIn("data-waste-search", "47");
    const ids = s2.ui.findAll("data-waste-add").map((n) => n.props["data-waste-add"]), more2 = s2.text(s2.one("data-waste-more"));
    ok("pick.exact", "رقمُ رفٍّ «47» كُتب كاملاً: مادتُه أوّلاً — لا خارج الثمانية خلف باركوداتٍ تحويه — و«و3 غيرها»",
      ids[0] === SHELF.id && ids.length === 8 && more2.includes("و3 غيرها"), J({ ids, more2 }));
    s2.ui.unmount();
    return [...s.ui.errors, ...s2.ui.errors];
  },

  /* ن٢) عنوانُ التعبئة يتبع (المعبّأ، المتخطّى، المسجّل) معاً (w5a): كلُّ ما رجع لا يُسجَّل هنا (حوضٌ ومحذوفة) ← «رجعت مواد … بس ما
   *     عبّينا منها شي — السبب تحت» لا «ماكو مواد رجعت»؛ ومسجّلةٌ ومحذوفة ← العنوانُ نفسُه وسطرُ «سجّلتها هدر» باسمها — لا «اللي رجعت
   *     سجّلتها هدر قبل» عن مادةٍ ما سُجّلت. («كلُّه مسجّل» سطراً واحداً، و«ماكو» عمّا لم يرجع: already.all وrelink.same.) */
  async head(M, ok) {
    const errors = [];
    const run = async (entry, o) => { const r = await fillFrom(M, entry, o); errors.push(...r.errors); return r; };
    const HELD = `رجعت مواد للمخزن من فاتورة ${M.invoiceNo(INV)} بس ما عبّينا منها شي — السبب تحت`;
    const a = await run(TWO(), { at: `${T2}`, products: [{ ...LYSE, pooled: true }, GLOVES] });
    ok("fill.held", "كلُّ ما رجع ما ينسجل هنا (Lyse صارت بالحوض، Diluent انحذفت): «رجعت مواد … بس ما عبّينا منها شي — السبب تحت» وسببُ كلٍّ باسمه — لا «ماكو مواد رجعت»",
      a.got.length === 0 && a.info.includes(HELD) && !a.text.includes("ماكو مواد") && a.skips.length === 2 && a.skips.some((x) => x.includes('"Lyse" رصيدها بمخزون القسم'))
        && a.skips.some((x) => x.includes('"Diluent" ما موجودة بالمخزن')) && !a.held, J({ info: a.info, skips: a.skips }));
    const b = await run(TWO([WR(LYSE.id, T2, "approved")]), { at: `${T2}`, products: [LYSE, GLOVES] });
    ok("fill.mixed", "Lyse سُجّلت وDiluent انحذفت: «… بس ما عبّينا منها شي» وسطرُ «\"Lyse\" سجّلتها هدر قبل» باسمها — لا «اللي رجعت سجّلتها هدر قبل» عن Diluent",
      b.got.length === 0 && b.all === "" && b.info.includes(HELD) && b.already.length === 1 && b.already[0].includes('"Lyse" سجّلتها هدر قبل لهالترجيع')
        && b.skips.length === 1 && b.skips[0].includes('"Diluent" ما موجودة بالمخزن'), J({ info: b.info, already: b.already, skips: b.skips, all: b.all }));
    return errors;
  },

  /* ن٣) انتهاءُ رفع PIN المدير والسندُ مكتوب (w5a): «الجرد لمن عنده صلاحية…» والسندُ باقٍ مخفياً بإمساكه ويُقال إنه محفوظ، ورفعٌ ثانٍ
   *     يرجعه كما كُتب (كعدّ اليوم) — كانت العودةُ المبكّرة تفكّه فتضيع المسودّة. ومن لا صلاحيةَ له أصلاً لا يُركَّب له ولا يُقرأ له شيء. */
  async pin(M, ok) {
    const ELEV = { can: () => true, role: "manager", baseRole: "receptionist" };
    const BASE = { can: (k) => k !== "manageInventory" && k !== "viewProfits", role: "receptionist", baseRole: "receptionist" };
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__holds = [];
    const calls = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { calls.push(String(k)); throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = {
      listProducts: async () => [...ALL, SYR], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [],
      listStockCounts: async () => [], reportStockLosses: async () => [],
    };
    globalThis.__perm = ELEV;
    globalThis.__url = "tab=waste";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    await h.add("قفاز", GLOVES.id);
    const line = () => h.one("data-waste-line", GLOVES.id);
    await h.typeIn("data-waste-qty", "0.5", line());
    await h.typeIn("data-waste-note", "وگعت", line());
    globalThis.__setPerm(BASE);   // انتهى رفعُ PIN المدير
    await ui.settle();
    const lost = { noAccess: h.text(ui.container).includes("الجرد لمن عنده صلاحية إدارة المخزن"), hidden: h.one("data-count-waste")?.props.hidden ?? null,
      kept: h.text(h.one("data-count-waste-kept")), held: globalThis.__holds.some((x) => x.ms === Infinity && !x.released) };
    globalThis.__setPerm(ELEV);   // رفعٌ ثانٍ
    await ui.settle();
    const back = line();
    const got = { hidden: h.one("data-count-waste")?.props.hidden ?? null, qty: back ? within(back, "data-waste-qty")[0]?.props.value : null, note: back ? within(back, "data-waste-note")[0]?.props.value : null };
    ok("page.pin", "انتهى رفعُ PIN المدير والسندُ مكتوب: «الجرد لمن عنده صلاحية…» و«سند التلف اللي كتبته محفوظ»، والسندُ مخفيٌّ بإمساكه — ورفعٌ ثانٍ يرجعه بكميته وملاحظته",
      lost.noAccess && lost.hidden === true && lost.kept.includes("سند التلف اللي كتبته محفوظ") && lost.held && got.hidden === false && got.qty === "0.5" && got.note === "وگعت",
      J({ lost, got }));
    ui.unmount();
    // من لا صلاحيةَ له يفتح ?tab=waste&inv=: لا سندَ يُركَّب ولا قراءة — والإشعارُ بلا «محفوظ».
    globalThis.__perm = BASE;
    globalThis.__url = `tab=waste&inv=${INV}`;
    calls.length = 0;
    const u2 = M.mount(M.React.createElement(M.StockCount));
    await u2.settle();
    const h2 = harness(M, u2);
    ok("page.pin.never", "ومن لا صلاحيةَ له أصلاً (?tab=waste&inv=): لا يُركَّب السندُ ولا يُقرأ له شيء، ولا «محفوظ»",
      !h2.one("data-count-waste") && !h2.one("data-count-waste-kept") && calls.length === 0 && h2.text(u2.container).includes("الجرد لمن عنده صلاحية إدارة المخزن"),
      J({ calls, text: h2.text(u2.container).slice(0, 200) }));
    u2.unmount();
    return [...ui.errors, ...u2.errors];
  },

  /* ن٤) السالبُ بوحدة المخزون (w5a): بعد «انخصم 2 مل» «"Lyse" رصيدها صار −0.002 علبة» لا «−0.002» يُقرأ ملاً، والموزونُ بالكيلو —
   *     بالتطبيق (negatives) وبالانتظار (stock_after). */
  async negunit(M, ok) {
    const FEED = P("p-feed", "علف بالكيلو", { stock: 5, purchase_price: 4000, sold_by_weight: true });
    const run = async (isManager, decided) => {
      const s = session(M, { isManager, products: [LYSE, FEED], api: { submitWaste: async () => ({ pending: decided ? 0 : 2, ids: ["n1", "n2"], decided,
        lines: [{ product_id: LYSE.id, name: "Lyse", stock_now: 0.002, stock_after: -0.002 }, { product_id: FEED.id, name: FEED.name, stock_now: 0.2, stock_after: -0.3 }] }) } });
      await s.ui.settle();
      await s.add("lyse", LYSE.id);
      const l = s.one("data-waste-line", LYSE.id);
      await s.click("data-waste-unit", "sub", l);
      await s.typeIn("data-waste-qty", "2", l); await s.typeIn("data-waste-note", "انكسرت", l);
      await s.add("علف", FEED.id);
      const f = s.one("data-waste-line", FEED.id);
      await s.typeIn("data-waste-qty", "0.5", f); await s.typeIn("data-waste-note", "تبلّل", f);
      await s.click("data-waste-send");
      const out = { done: s.text(s.one("data-waste-done", decided ? "applied" : "pending")), neg: s.ui.findAll(decided ? "data-waste-neg" : "data-waste-will").map((n) => s.text(n)) };
      s.ui.unmount();
      return { ...out, errors: s.ui.errors };
    };
    const a = await run(true, { approved: 2, rejected: 0, void: 0, withdrawals: [{ reason: "damaged", amount: 2240, expense_id: "e" }],
      negatives: [{ product_id: LYSE.id, name: "Lyse", stock: -0.002 }, { product_id: FEED.id, name: FEED.name, stock: -0.3 }] });
    const b = await run(false, null);
    ok("neg.unit", "السالبُ بوحدة المخزون: بعد «انخصم 2 مل» «\"Lyse\" رصيدها صار −0.002 علبة» والموزونُ «−0.3 كغ» — بالتطبيق وبالانتظار",
      a.done.includes('انخصم 2 مل من "Lyse"') && a.neg.some((x) => x.includes('"Lyse" رصيدها صار −0.002 علبة بعد الموافقة')) && a.neg.some((x) => x.includes('"علف بالكيلو" رصيدها صار −0.3 كغ بعد الموافقة'))
        && b.neg.some((x) => x.includes('"Lyse" رصيدها راح يصير −0.002 علبة بعد الموافقة')) && b.neg.some((x) => x.includes('"علف بالكيلو" رصيدها راح يصير −0.3 كغ بعد الموافقة')),
      J({ a: a.neg, b: b.neg }));
    return [...a.errors, ...b.errors];
  },

  /* ن٥) الفاصلُ بلغة الواجهة (w5a): جملٌ إنكليزية لا يفصلها «،» عربيّ — نتيجةُ سندٍ بسطرين، وموادُّ «تعديلات على الوصفة». */
  async sep(M, ok) {
    const errors = [];
    globalThis.__lang = "en";
    try {
      const A = P("p-a", "Gloves", { stock: 5, purchase_price: 12500 }), B = P("p-b", "Syringe", { stock: 5, purchase_price: 25000 });
      const s = session(M, { products: [A, B], api: { submitWaste: async (lines) => ({ pending: 0, ids: ["s1", "s2"],
        decided: { approved: 2, rejected: 0, void: 0, withdrawals: [{ reason: "damaged", amount: 37500, expense_id: "e" }], negatives: [] },
        lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id === A.id ? "Gloves" : "Syringe", stock_now: 5, stock_after: 4 })) }) } });
      await s.ui.settle();
      for (const [q, p] of [["glo", A], ["syr", B]]) {
        await s.add(q, p.id);
        const l = s.one("data-waste-line", p.id);
        await s.typeIn("data-waste-qty", "1", l); await s.typeIn("data-waste-note", "broken", l);
      }
      await s.click("data-waste-send");
      const done = s.text(s.one("data-waste-done-line"));
      s.ui.unmount(); errors.push(...s.ui.errors);
      globalThis.__api = { reportConsumables: async () => ({ products: [], short_products: 0, unconsumed: { old_device: 0, service_missing: 0, recent: [] },
        overrides: { count: 1, recent: [{ invoice_id: INV, created_at: "2026-10-30T10:00:00Z", service_name: "Cat spay", products: ["Gloves", "Syringe"], by_name: "Dr. Sara" }] } }) };
      const ui = M.mount(M.React.createElement(M.ConsumablesCards, { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", showCost: true, products: [A, B] }));
      await ui.settle();
      const ov = ui.text(ui.find("data-cons-override") ?? ui.container);
      ui.unmount(); errors.push(...ui.errors);
      ok("sep.en", 'بالإنكليزية: «1 box taken off "Gloves", 1 box taken off "Syringe", and a loss of …» و«Cat spay — Gloves, Syringe» — بلا «،» عربيّ',
        !done.includes("،") && done.includes('1 box taken off "Gloves", 1 box taken off "Syringe", and a loss of') && !ov.includes("،") && ov.includes("Cat spay — Gloves, Syringe"), J({ done, ov }));
    } finally { globalThis.__lang = "ar"; }
    return errors;
  },

  /* ن٦) تاريخُ البطاقات بمساعدات التطبيق (w5a): formatDate + formatTime بأرقامٍ غربية — لا toLocaleString() بمحليّة المتصفّح (شهرٌ
   *     أوّلاً بـen-US، أو أرقامٌ شرقية بـar-IQ، وثوانٍ)؛ ووقتٌ لا يُقرأ «—» لا «Invalid Date». */
  async dates(M, ok) {
    const OV = "2026-10-11T09:24:07Z", UN = "2026-10-05T07:05:09Z";
    globalThis.__api = { reportConsumables: async () => ({ products: [], short_products: 0,
      overrides: { count: 2, recent: [{ invoice_id: INV, created_at: OV, service_name: "تعقيم", products: ["Lyse"], by_name: "د. علي" }, { invoice_id: INV, created_at: "", service_name: "فحص", products: [], by_name: null }] },
      unconsumed: { old_device: 1, service_missing: 0, recent: [{ invoice_id: INV, created_at: UN, line_name: "تطعيم", note: "old_device" }] } }) };
    const ui = M.mount(M.React.createElement(M.ConsumablesCards, { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", showCost: true, products: ALL }));
    await ui.settle();
    const rows = ui.findAll("data-cons-override").map((n) => ui.text(n)), un = ui.text(ui.find("data-cons-skip") ?? ui.container);
    ui.unmount();
    const app = (iso) => `${M.formatDate(iso, "ar")} ${M.formatTime(iso, "ar")}`;
    ok("cards.date", `التاريخُ بمساعدات التطبيق («${app(OV)}») لا toLocaleString() («${new Date(OV).toLocaleString()}»)، ووقتٌ لا يُقرأ «—» لا «Invalid Date»`,
      !!rows[0]?.includes(app(OV)) && !rows[0]?.includes(new Date(OV).toLocaleString()) && un.includes(app(UN)) && !un.includes(new Date(UN).toLocaleString())
        && !!rows[1]?.includes("· — ·") && !rows.join("").includes("Invalid Date"), J({ rows, un }));
    return ui.errors;
  },

  /* ن٧) سطرٌ كُتب باليد والقراءةُ بالطريق (أو بعد فشلٍ فإعادة) ومادتُه رجعت (w5a): يبقى بكميته وملاحظته (ما كُتب لا يُمسح)، ويأخذ مرجعَ
   *     الترجيع (src_invoice، src_batches) فلا يُعبّأ ثانيةً بزيارةٍ لاحقة — ويُقال «موجودة بسندك — رجع منها 4 مل»؛ و«عبّينا N» ما أُضيف
   *     فعلاً. وسطرٌ بلا كمية يأخذ كميةَ التعبئة ووحدتها (يُعدّ معبّأً). كان سطرُ التعبئة يسقط بصمت والعدُّ يقول ٢ عن واحدة. */
  async race(M, ok) {
    const errors = [];
    const sentOf = (s) => Object.fromEntries((s.sends()[0]?.[1] ?? []).map((x) => [x.product_id, x]));
    const submit = async (lines) => ({ pending: 0, ids: lines.map((_, i) => `r${i}`), decided: { approved: lines.length, rejected: 0, void: 0, withdrawals: [], negatives: [] },
      lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id, stock_now: 5, stock_after: 4 })) });
    const url = `tab=waste&inv=${INV}&at=${T2}`, products = [LYSE, DIL, GLOVES];
    // أ) القراءةُ بالطريق، وLyse كُتبت باليد ٤ مل بملاحظتها
    let release;
    const s = session(M, { products, url, api: { invoiceConsumption: () => new Promise((r) => { release = () => r({ [INV]: TWO() }); }), submitWaste: submit } });
    await s.ui.settle();
    const loading = !s.one("data-waste-inv") && !!s.one("data-waste-search");
    await s.add("lyse", LYSE.id);
    const l = s.one("data-waste-line", LYSE.id);
    await s.click("data-waste-unit", "sub", l);
    await s.typeIn("data-waste-qty", "4", l); await s.typeIn("data-waste-note", "انكسرت وقت الخدمة", l);
    release(); await s.ui.settle();
    const info = s.text(s.one("data-waste-inv")), kept = s.ui.findAll("data-waste-kept").map((n) => s.text(n));
    await s.click("data-waste-send");
    const by = sentOf(s);
    ok("race.src", "القراءةُ بالطريق وLyse مكتوبةٌ باليد: تبقى بكميتها وملاحظتها وتأخذ مرجعَ الترجيع (src_invoice وsrc_batches=[T2]) — «موجودة بسندك — رجع منها 4 مل» و«عبّينا 1 مادة» لا 2",
      loading && info.includes("عبّينا 1 مادة") && kept.length === 1 && kept[0].includes('"Lyse" موجودة بسندك — رجع منها 4 مل')
        && by[LYSE.id]?.qty === 4 && by[LYSE.id]?.unit === "sub" && by[LYSE.id]?.note === "انكسرت وقت الخدمة" && by[LYSE.id]?.src_invoice === INV && J(by[LYSE.id]?.src_batches) === J([T2])
        && by[DIL.id]?.src_invoice === INV && J(by[DIL.id]?.src_batches) === J([T2]), J({ loading, info, kept, sent: s.sends()[0]?.[1] }));
    s.ui.unmount(); errors.push(...s.ui.errors);
    // ب) أُضيفت Lyse ولم يُكتب فيها شيء: تأخذ كميةَ التعبئة ووحدتها ومرجعها — وتُعدّ معبّأة
    let rel2;
    const s2 = session(M, { products, url, api: { invoiceConsumption: () => new Promise((r) => { rel2 = () => r({ [INV]: TWO() }); }), submitWaste: submit } });
    await s2.ui.settle();
    await s2.add("lyse", LYSE.id);
    rel2(); await s2.ui.settle();
    const info2 = s2.text(s2.one("data-waste-inv")), kept2 = s2.ui.findAll("data-waste-kept").length;
    const l2 = s2.one("data-waste-line", LYSE.id);
    const q2 = within(l2, "data-waste-qty")[0]?.props.value, sub2 = within(l2, "data-waste-unit", "sub")[0]?.props["aria-pressed"] === true;
    await s2.click("data-waste-send");
    const by2 = sentOf(s2);
    ok("race.empty", "سطرٌ أُضيف بلا كمية والقراءةُ بالطريق: يأخذ كميةَ التعبئة ووحدتها (4 مل) ومرجعَها — «عبّينا 2 مادة» بلا «موجودة بسندك»",
      info2.includes("عبّينا 2 مادة") && kept2 === 0 && q2 === "4" && sub2 && by2[LYSE.id]?.src_invoice === INV && J(by2[LYSE.id]?.src_batches) === J([T2]), J({ info2, kept2, q2, sub2 }));
    s2.ui.unmount(); errors.push(...s2.ui.errors);
    // ج) القراءةُ فشلت، فكُتبت Lyse باليد ٢ مل، ثم «أعد المحاولة»
    let n = 0;
    const s3 = session(M, { products, url, api: { invoiceConsumption: async () => { if (n++ === 0) throw new Error("Failed to fetch"); return { [INV]: TWO() }; }, submitWaste: submit } });
    await s3.ui.settle();
    await s3.add("lyse", LYSE.id);
    const l3 = s3.one("data-waste-line", LYSE.id);
    await s3.click("data-waste-unit", "sub", l3);
    await s3.typeIn("data-waste-qty", "2", l3); await s3.typeIn("data-waste-note", "انسكب", l3);
    await s3.click("data-waste-inv-retry");
    const info3 = s3.text(s3.one("data-waste-inv")), kept3 = s3.ui.findAll("data-waste-kept").map((x) => s3.text(x));
    const q3 = within(s3.one("data-waste-line", LYSE.id), "data-waste-qty")[0]?.props.value;
    await s3.click("data-waste-send");
    const by3 = sentOf(s3);
    ok("race.retry", "فشلت القراءة فكُتبت Lyse باليد ٢ مل ثم «أعد المحاولة»: ٢ مل تبقى ويُقال «رجع منها 4 مل»، والمرجعُ معها، و«عبّينا 1 مادة»",
      info3.includes("عبّينا 1 مادة") && kept3.length === 1 && kept3[0].includes("رجع منها 4 مل") && q3 === "2" && by3[LYSE.id]?.qty === 2
        && by3[LYSE.id]?.src_invoice === INV && J(by3[LYSE.id]?.src_batches) === J([T2]), J({ info3, kept3, q3, sent: s3.sends()[0]?.[1] }));
    s3.ui.unmount(); errors.push(...s3.ui.errors);
    // د) العنوانُ تبدّل إلى رابطٍ ثانٍ والقراءةُ الأولى بالطريق: جوابُ الأوّل يصل بعده فلا يُضمّ إلى سند الثاني (نتيجةُ رابطٍ تبدّل ليست نتيجة)
    const OTHER = "c0ffee00-1111-4222-8333-444455556666";
    const glovesOnly = { items: { it2: TWO().items.it2 }, skips: [], negatives: [], now_us: NOW_US, waste: [] };
    let relA;
    const s4 = session(M, { products, url, api: { invoiceConsumption: (ids) => (ids[0] === INV ? new Promise((r) => { relA = () => r({ [INV]: TWO() }); }) : Promise.resolve({ [OTHER]: glovesOnly })) } });
    await s4.ui.settle();
    globalThis.__go(`tab=waste&inv=${OTHER}&at=${T1}`);
    await s4.ui.settle();
    relA?.(); await s4.ui.settle();
    const ls4 = s4.ui.findAll("data-waste-line").map((x) => x.props["data-waste-line"]), info4 = s4.text(s4.one("data-waste-inv"));
    ok("race.stale", "رابطٌ تبدّل والقراءةُ الأولى بالطريق: جوابُها المتأخّر لا يُضمّ إلى سند الرابط الثاني — القفازاتُ وحدها و«عبّينا 1 مادة» من فاتورته",
      J(ls4) === J([GLOVES.id]) && info4.includes(M.invoiceNo(OTHER)) && info4.includes("عبّينا 1 مادة"), J({ ls4, info4 }));
    s4.ui.unmount(); errors.push(...s4.ui.errors);
    return errors;
  },

  /* ن٨) الإمساكُ بما تضيّعه إعادةُ التحميل لا بوجود السطر (w5a، كعدّ اليوم): تعبئةُ رابطٍ كما هي والرابطُ بالعنوان، أو سطرٌ لم يُكتب
   *     فيه، لا يمسك النسخةَ الجديدة (إعادةُ التحميل تبنيه كما هو) — وتعديلُها، أو شيلُ سطرٍ منها والرابطُ باقٍ (يرجع ممتلئاً فيُرسَل ما
   *     استُثني)، أو بقاؤها بعد أن شالت النتيجةُ الرابطَ من العنوان، أو كميةٌ أو ملاحظةٌ مكتوبة: يمسك. */
  async hold(M, ok) {
    const errors = [];
    const held = () => globalThis.__holds.some((h) => h.ms === Infinity && !h.released);
    const open = async () => {
      const s = session(M, { products: [LYSE, DIL, GLOVES], url: `tab=waste&inv=${INV}&at=${T2}`, api: { invoiceConsumption: async () => ({ [INV]: TWO() }),
        submitWaste: async (lines) => ({ pending: 1, ids: ["h1"], decided: null,
          lines: lines.filter((x) => x.product_id === LYSE.id).map((x) => ({ product_id: x.product_id, name: "Lyse", stock_now: 1, stock_after: 0.992 })) }) } });
      await s.ui.settle();
      return s;
    };
    const a = await open();
    const filled = a.ui.findAll("data-waste-line").length, pristine = held();
    await a.typeIn("data-waste-qty", "3", a.one("data-waste-line", LYSE.id));
    const edited = held();
    a.ui.unmount(); errors.push(...a.ui.errors);
    ok("hold.prefill", "تعبئةُ رابطٍ لم تُمسّ (سطران) لا تمسك النسخةَ الجديدة — إعادةُ التحميل تبنيها كما هي", filled === 2 && !pristine, J({ filled, pristine }));
    ok("hold.edit", "وتعديلُ كميتها يمسك", edited, J({ edited }));
    const b = await open();
    await b.click("data-waste-remove", undefined, b.one("data-waste-line", LYSE.id));
    const removed = { held: held(), url: globalThis.__url, left: b.ui.findAll("data-waste-line").length };
    b.ui.unmount(); errors.push(...b.ui.errors);
    ok("hold.remove", "وشيلُ سطرٍ منها والرابطُ باقٍ بالعنوان يمسك (إعادةُ التحميل ترجعه ممتلئاً فيُرسَل ما استُثني)",
      removed.held && removed.left === 1 && /(^|&)inv=/.test(removed.url), J(removed));
    const c = await open();
    await c.click("data-waste-send");
    const after = { held: held(), url: globalThis.__url, left: c.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"]) };
    c.ui.unmount(); errors.push(...c.ui.errors);
    ok("hold.after", "ونتيجةٌ سجّلت بعضها وشالت الرابطَ من العنوان: الباقي (Diluent) يمسك — لا رابطَ يبنيه بعد",
      after.held && J(after.left) === J([DIL.id]) && !/(^|&)inv=/.test(after.url), J(after));
    // ?p= وسطرُ البحث: لا يمسكان حتى يُكتب فيهما — ملاحظةً أو كمية.
    const d = session(M, { url: `tab=waste&p=${LYSE.id}` });
    await d.ui.settle();
    const pick = held();
    await d.typeIn("data-waste-note", "انكسرت", d.one("data-waste-line", LYSE.id));
    const pickNote = held();
    await d.add("قفاز", GLOVES.id);
    await d.typeIn("data-waste-note", "", d.one("data-waste-line", LYSE.id));
    const searchAdd = held();
    await d.typeIn("data-waste-qty", "1", d.one("data-waste-line", GLOVES.id));
    const searchQty = held();
    d.ui.unmount(); errors.push(...d.ui.errors);
    ok("hold.pick", "سطرُ ?p= وسطرُ البحث بلا شيءٍ مكتوب لا يمسكان؛ ملاحظةٌ أو كميةٌ تُكتب تمسك",
      !pick && pickNote && !searchAdd && searchQty, J({ pick, pickNote, searchAdd, searchQty }));
    return errors;
  },

  /* س١) مَن عدّل الوصفة (ui3؛ `by_owner` بعقد consumptionApi): صاحبُ العيادة لا صفَّ كادرٍ له (0083) فكانت البطاقةُ تقول عنه «موظف» —
   *     صارت «صاحب العيادة». والاسمُ أوّلاً (كـapproverOf)؛ والمشغّلُ (by_owner false ولا اسم — لا أثرَ له عند العيادة بالاتفاق) «موظف»؛
   *     وخادمٌ أقدم (بلا by_owner) «موظف» كما كان — الغائبُ لا يُخمَّن. */
  async owner(M, ok) {
    const R = (service_name, by_name, extra = {}) => ({ invoice_id: INV, created_at: "2026-10-30T10:00:00Z", service_name, products: ["Lyse"], by_name, ...extra });
    globalThis.__api = { reportConsumables: async () => ({ products: [], short_products: 0, unconsumed: { old_device: 0, service_missing: 0, recent: [] },
      overrides: { count: 4, recent: [R("تعقيم", null, { by_owner: true }), R("فحص", "د. علي", { by_owner: false }), R("تطعيم", null, { by_owner: false }), R("قص أظافر", null)] } }) };
    const ui = M.mount(M.React.createElement(M.ConsumablesCards, { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", showCost: true, products: ALL }));
    await ui.settle();
    // مَن: أوّلُ ما بالسطر الثاني من صفّ التعديل («مَن · متى · رقم الفاتورة»).
    const who = ui.findAll("data-cons-override").map((n) => ui.text(n.children[1] ?? n).split(" · ")[0]);
    ui.unmount();
    ok("cons.owner", "تعديلُ صاحب العيادة (by_owner، بلا اسم كادر) يُقال «صاحب العيادة» لا «موظف»", who[0] === "صاحب العيادة", J(who));
    ok("cons.staff", "والموظّفُ باسمه (by_owner false)", who[1] === "د. علي", J(who));
    ok("cons.operator", "والمشغّلُ (by_owner false ولا اسم) «موظف» — لا «صاحب العيادة»، ولا أثرَ له عند العيادة", who[2] === "موظف", J(who));
    ok("cons.oldServer", "وخادمٌ أقدم بلا by_owner: «موظف» كما كان — الغائبُ لا يُخمَّن", who[3] === "موظف", J(who));
    return ui.errors;
  },

  /* س٢) عدُّ الدفعات بالضبط كما يجمعه الخادم (ui3؛ stock_count_submit: numeric بلا تقريب، والرصيدُ بمنازل عموده الثلاث): دفعتا ٠٫٠٥
   *     و٠٫٠٧ على رصيدٍ ٠٫١٢ (و٠٫٧ و٠٫١ على ٠٫٨) «مطابق للنظام» بلا سبب، ويُرسل المجموعُ بالضبط والدفعتان كما كُتبتا — العائمُ
   *     ٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١ «زايدة» و٠٫٧٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩ «ناقصة» كانا يطلبان سبباً لا يطلبه الخادم ولا يرسلان بلاه. ورصيدٌ عائمٌ
   *     بالتجريبيّ — صاعداً (٠٫١ + ٠٫٢) ونازلاً (٠٫٧ + ٠٫١) — وعدٌّ ٠٫٣ و٠٫٨ «مطابق» كالمرآة (milliOf: يُقرَّب لا يُقطع)، والنصفُ بعيداً
   *     عن الصفر (٠٫٠٠٠٥ هو ٠٫٠٠١، و−٠٫٠٠٠٥ هو −٠٫٠٠١). وفرقٌ حقيقيّ — نقصٌ (٠٫٠٥ + ٠٫٠٦) أو زيادةٌ (٠٫٠٥ + ٠٫٠٨) — يُقال ويُسأل
   *     سببُه باتجاهه ولا يُرسل بلاه. */
  async lots(M, ok) {
    const errors = [];
    const count = async (...a) => { const r = await countOnce(M, ...a); errors.push(...r.errors); return r; };
    const L12 = P("p-l12", "مضاد بدفعتين", { stock: 0.12, purchase_price: 10000 });
    const L8 = P("p-l8", "محلول بدفعتين", { stock: 0.8, purchase_price: 10000 });
    const LOTS12 = [LOT(L12.id, "l12-b", 0.07, "2027-06-01"), LOT(L12.id, "l12-a", 0.05, "2027-01-01")];
    const a = await count(L12, LOTS12, ["0.05", "0.07"]);
    const b = await count(L8, [LOT(L8.id, "l8-a", 0.7, "2027-01-01"), LOT(L8.id, "l8-b", 0.1, "2027-06-01")], ["0.7", "0.1"]);
    ok("count.lotSum", "دفعتا ٠٫٠٥ و٠٫٠٧ على رصيدٍ ٠٫١٢، و٠٫٧ و٠٫١ على ٠٫٨: «مطابق للنظام» بلا فرقٍ ولا سبب (العائمُ «زايدة» و«ناقصة»)",
      [a, b].every((x) => x.text.includes("مطابق للنظام") && x.diff === "" && x.reasons.length === 0), J({ a: [a.text, a.reasons], b: [b.text, b.reasons] }));
    const one = (id, counted, lots) => [{ product_id: id, counted, reason: null, note: null, lots }];
    ok("count.lotSent", "و«سجّل العدّ» يرسله بلا سبب ولا «اختر السبب»: المجموعُ ٠٫١٢ و٠٫٨ بالضبط، والدفعتان كما كُتبتا",
      J(a.sent) === J([one(L12.id, 0.12, [{ lot_id: "l12-a", counted: 0.05 }, { lot_id: "l12-b", counted: 0.07 }])])
        && J(b.sent) === J([one(L8.id, 0.8, [{ lot_id: "l8-a", counted: 0.7 }, { lot_id: "l8-b", counted: 0.1 }])])
        && ![...a.toasts, ...b.toasts].some((x) => x.startsWith("error:")), J({ a: a.sent, b: b.sent, toasts: [...a.toasts, ...b.toasts] }));
    const NZ = P("p-nz", "شاش رصيده عائم", { stock: 0.1 + 0.2, purchase_price: 1000 });
    const c = await count(NZ, [], ["0.3"]);
    ok("count.noisyStock", "رصيدٌ عائمٌ بالتجريبيّ (٠٫١ + ٠٫٢ = ٠٫٣٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٤) وعدٌّ ٠٫٣: «مطابق» ويُرسل بلا سبب — الرصيدُ بمنازل عموده الثلاث كالمرآة والخادم",
      c.text.includes("مطابق للنظام") && c.reasons.length === 0 && J(c.sent) === J([[{ product_id: NZ.id, counted: 0.3, reason: null, note: null }]]), J({ text: c.text, sent: c.sent, toasts: c.toasts }));
    // ui3f: النزولُ العائم يُقرَّب لثلاث منازل لا يُقطع (٠٫٧٩٩ كانت «زايدة»)، والنصفُ بعيداً عن الصفر — كـroundScaled بالمرآة.
    const ND = P("p-nd", "مطهّر رصيده نازل", { stock: 0.7 + 0.1, purchase_price: 1000 });
    const nd = await count(ND, [], ["0.8"]);
    ok("count.noisyDown", "ورصيدٌ عائمٌ نازل (٠٫٧ + ٠٫١ = ٠٫٧٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩) وعدٌّ ٠٫٨: «مطابق» ويُرسل بلا سبب — الرصيدُ يُقرَّب لمنازله الثلاث لا يُقطع (٠٫٧٩٩ «زايدة»)",
      nd.text.includes("مطابق للنظام") && nd.reasons.length === 0 && J(nd.sent) === J([[{ product_id: ND.id, counted: 0.8, reason: null, note: null }]]), J({ text: nd.text, sent: nd.sent, toasts: nd.toasts }));
    const T5 = P("p-t5", "شاش رصيده نصف", { stock: 0.0005, purchase_price: 1000 });
    const TN = P("p-tn", "شاش رصيده نصف سالب", { stock: -0.0005, purchase_price: 1000 });
    const tp = await count(T5, [], ["0.001"]), tn = await count(TN, [], ["0"]);
    ok("count.tie", "والنصفُ بعيداً عن الصفر كالمرآة: رصيدٌ ٠٫٠٠٠٥ هو ٠٫٠٠١ فعدُّ ٠٫٠٠١ «مطابق» ويُرسل؛ و−٠٫٠٠٠٥ هو −٠٫٠٠١ فعدُّ ٠ «الفرق +0.001» بأسباب الزيادة ولا يُرسل بلاه",
      tp.text.includes("مطابق للنظام") && J(tp.sent) === J([[{ product_id: T5.id, counted: 0.001, reason: null, note: null }]])
        && !tn.text.includes("مطابق للنظام") && tn.diff.includes("الفرق +0.001") && J(tn.reasons) === J(["found", "entry_error"]) && tn.sent.length === 0,
      J({ tp: [tp.text, tp.sent], tn: [tn.diff, tn.reasons, tn.sent] }));
    const d = await count(L12, LOTS12, ["0.05", "0.06"], { reason: "shortage" });
    ok("count.lotReal", "فرقٌ حقيقيّ (٠٫٠٥ + ٠٫٠٦ على ٠٫١٢): «الفرق −0.01» بأسباب النقص، والإرسالُ بلا سبب «اختر السبب» ولا يرسل — وبالسبب يرسل ٠٫١١ به",
      d.diff.includes("الفرق −0.01") && J(d.reasons) === J(["damaged", "expired", "shortage", "entry_error"]) && d.first.sent === 0
        && d.first.toasts.some((x) => x.startsWith("error:") && x.includes("بيها فرق — اختر السبب"))
        && J(d.sent) === J([[{ product_id: L12.id, counted: 0.11, reason: "shortage", note: null, lots: [{ lot_id: "l12-a", counted: 0.05 }, { lot_id: "l12-b", counted: 0.06 }] }]]), J(d));
    const g = await count(L12, LOTS12, ["0.05", "0.08"], { reason: "found" });
    ok("count.lotGain", "وزيادةٌ حقيقيّة (٠٫٠٥ + ٠٫٠٨ على ٠٫١٢): «الفرق +0.01» بأسباب الزيادة، والإرسالُ بلا سبب لا يرسل — وبالسبب يرسل ٠٫١٣ به",
      g.diff.includes("الفرق +0.01") && J(g.reasons) === J(["found", "entry_error"]) && g.first.sent === 0
        && g.first.toasts.some((x) => x.startsWith("error:") && x.includes("بيها فرق — اختر السبب"))
        && J(g.sent) === J([[{ product_id: L12.id, counted: 0.13, reason: "found", note: null, lots: [{ lot_id: "l12-a", counted: 0.05 }, { lot_id: "l12-b", counted: 0.08 }] }]]), J(g));
    return errors;
  },

  /* ع١) عددٌ أدقّ من ثلاث منازل (ui3f): الرصيدُ numeric(14,3) لا يحمله، والخادمُ يقبله فرقاً — ٠٫١٢٠٤ على ٠٫١٢ «يُسأل سببُه» ثم تُرجعه
   *     الموافقةُ (round(stock + d, 3)) إلى الرصيد نفسه — والسطرُ كان يقول «الفرق +0» ويطلب سبباً، والدفعةُ «(النظام 0.05 — +0)». صار
   *     يُقال بالسطر («بثلاث مراتب عشرية أقصى»، كسند التلف والوصفة) ويُرفض إرسالُه بالاسم؛ ولا يُقرَّب لثلاث منازل صامتاً — ٠٫١٢٠٤
   *     «مطابق» ويُرسل ٠٫١٢ تقريبٌ لعددٍ كتبه أحد (toMilli: «لا تقريبَ صامتاً»). */
  async fine(M, ok) {
    const errors = [];
    const count = async (...a) => { const r = await countOnce(M, ...a); errors.push(...r.errors); return r; };
    const FINE = "اكتب العدد بثلاث مراتب عشرية أقصى";
    /** الإرسالُ رُفض بالاسم وبسببه («بثلاث مراتب») — لا «اختر السبب» — ولم يُرسل شيء. */
    const refused = (r, name) => r.first.sent === 0 && r.sent.length === 0 && r.toasts.includes(`error:«${name}»: ${FINE}`);
    const L12 = P("p-l12", "مضاد بدفعتين", { stock: 0.12, purchase_price: 10000 });
    const e = await count(L12, [LOT(L12.id, "l12-b", 0.07, "2027-06-01"), LOT(L12.id, "l12-a", 0.05, "2027-01-01")], ["0.0504", "0.07"]);
    ok("count.fineLots", "دفعةٌ أدقّ من ثلاث منازل (٠٫٠٥٠٤ + ٠٫٠٧ على ٠٫١٢): السطرُ يقول «بثلاث مراتب عشرية أقصى» — لا «الفرق +0» ولا سبب ولا «مطابق»، ولا «(النظام 0.05 — +0)» بالدفعة — والإرسالُ يُرفض بالاسم ولا يرسل",
      e.fine.includes(FINE) && e.diff === "" && e.reasons.length === 0 && !e.text.includes("مطابق للنظام") && !e.text.includes("+0") && e.lotDiffs.length === 0 && refused(e, L12.name), J(e));
    const F1 = P("p-f1", "قطرة بحقل واحد", { stock: 0.12, purchase_price: 10000 });
    const f = await count(F1, [], ["0.1204"]);
    ok("count.fineOne", "وحقلٌ واحد ٠٫١٢٠٤ على ٠٫١٢: «بثلاث مراتب عشرية أقصى» ويُرفض بالاسم — لا يُقرَّب صامتاً لـ٠٫١٢ «مطابق» ويُرسل، ولا «الفرق +0» وسبب",
      f.fine.includes(FINE) && f.diff === "" && f.reasons.length === 0 && !f.text.includes("مطابق للنظام") && refused(f, F1.name), J(f));
    return errors;
  },

  /* ع٢) وحدةُ العدّ (ui3f): الحقلُ كان «لقيت» والفرقُ رقماً عارياً — والموزونُ بالكيلو، وما له وحدةٌ صغيرة يُعدّ بالعلب (٢٫٥ لا ٢٥٠
   *     حبّة). الكلمةُ بجانب كلّ حقل (الواحد والدفعات) وبالفرق وبفرق الدفعة، بكلمات المخزون (retail.unitKg / unitBox)؛ والمادةُ البسيطة
   *     — لا وزنٌ ولا وحدةٌ صغيرة — عددُها بلا كلمة كما كان. */
  async units(M, ok) {
    const errors = [];
    const count = async (...a) => { const r = await countOnce(M, ...a); errors.push(...r.errors); return r; };
    const KG = P("p-kg", "لحم مفروم", { stock: 0.12, purchase_price: 10000, sold_by_weight: true });
    const kg = await count(KG, [LOT(KG.id, "kg-b", 0.07, "2027-06-01"), LOT(KG.id, "kg-a", 0.05, "2027-01-01")], ["0.05", "0.06"]);
    const BX = P("p-bx", "سرنجات بالعلبة", { stock: 2.5, purchase_price: 5000, has_sub_unit: true, sub_unit_name: "حبة", units_per_box: 100 });
    const bx = await count(BX, [], ["2"]);
    ok("count.unit", "الموزونُ «كغ» بجانب كلّ حقل وبالفرق («النظام يگول 0.12 كغ — الفرق −0.01 كغ»، والدفعةُ «(النظام 0.07 كغ — −0.01 كغ)»)، وما له وحدةٌ صغيرة «علبة» («الفرق −0.5 علبة») — لا رقمٌ عارٍ يُعدّ بالحبّات",
      J(kg.units) === J(["كغ", "كغ"]) && kg.diff.includes("النظام يگول 0.12 كغ — الفرق −0.01 كغ") && J(kg.lotDiffs) === J(["(النظام 0.07 كغ — −0.01 كغ)"])
        && J(bx.units) === J(["علبة"]) && bx.diff.includes("النظام يگول 2.5 علبة — الفرق −0.5 علبة"), J({ kg: [kg.units, kg.diff, kg.lotDiffs], bx: [bx.units, bx.diff] }));
    const L12 = P("p-l12", "مضاد بدفعتين", { stock: 0.12, purchase_price: 10000 });
    const pl = await count(L12, [LOT(L12.id, "l12-b", 0.07, "2027-06-01"), LOT(L12.id, "l12-a", 0.05, "2027-01-01")], ["0.05", "0.06"]);
    const PL = P("p-pl", "قفاز بسيط", { stock: 5, purchase_price: 1000 });
    const sg = await count(PL, [], ["3"]);
    ok("count.unitPlain", "والمادةُ البسيطة (لا وزنٌ ولا وحدةٌ صغيرة) بلا كلمة وحدة كما كانت — «الفرق −0.01» و«الفرق −2»، لا «علبة»",
      pl.units.length === 0 && sg.units.length === 0 && pl.diff.includes("الفرق −0.01") && sg.diff.includes("الفرق −2") && ![pl.text, sg.text].some((x) => x.includes("علبة") || x.includes("كغ")),
      J({ pl: [pl.units, pl.diff], sg: [sg.units, sg.diff] }));
    return errors;
  },

  /* ع٣) وبانتظار الموافقة (ui3f): الجردُ بوحدته حيث تلتبس كعدّ اليوم — «(−0.01 كغ)» و«(−0.5 علبة)» — والبسيطةُ بلا كلمة. */
  async punit(M, ok) {
    const KG = P("p-kg", "لحم مفروم", { stock: 0.11, sold_by_weight: true });
    const BX = P("p-bx", "سرنجات بالعلبة", { stock: 2, has_sub_unit: true, sub_unit_name: "حبة", units_per_box: 100 });
    const rows = [
      row({ id: "u1", product_id: KG.id, product_name: KG.name, system_qty: 0.12, counted_qty: 0.11, unit_cost: 10000, reason: "shortage", source: "count" }),
      row({ id: "u2", product_id: BX.id, product_name: BX.name, system_qty: 2.5, counted_qty: 2, unit_cost: 5000, reason: "shortage", source: "count" }),
      row({ id: "u3", product_id: SYR.id, product_name: "سرنجة", system_qty: 0.04, counted_qty: 0.02, unit_cost: 25000, reason: "shortage", source: "count" }),
    ];
    globalThis.__toast = { success() {}, error() {}, warn() {}, toast() {} };
    globalThis.__repo = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    const prods = new Map([KG, BX, SYR].map((p) => [p.id, p]));
    const ui = M.mount(M.React.createElement(M.PendingTab, { rows, productOf: (id) => prods.get(id ?? ""), isManager: true, restricted: false,
      onChanged: async () => {}, onNegatives: () => {} }));
    await ui.settle();
    const rowOf = (name) => { const n = ui.findAll("data-pending-row").find((x) => ui.text(x).startsWith(name)); return n ? ui.text(n) : ""; };
    const kg = rowOf(KG.name), bx = rowOf(BX.name), sy = rowOf("سرنجة");
    ui.unmount();
    ok("count.unitPending", "بانتظار الموافقة: «النظام 0.12 ← لقينا 0.11 (−0.01 كغ)» و«(−0.5 علبة)»، والبسيطةُ «(−0.02)» بلا كلمة",
      kg.includes("النظام 0.12 ← لقينا 0.11 (−0.01 كغ)") && bx.includes("النظام 2.5 ← لقينا 2 (−0.5 علبة)") && sy.includes("النظام 0.04 ← لقينا 0.02 (−0.02)") && !sy.includes("علبة"),
      J({ kg, bx, sy }));
    return ui.errors;
  },

  /* س٣) رفضُ الجرد برمزه وتلميحه (ui3): المرآةُ التجريبيةُ ترمي كالخادم — Error("count_…") بـP0001 وتلميحِه حرفاً (refuse بـdemoCounts) —
   *     فبالعربية يُقال التلميحُ كما هو (يسمّي المادة)، وبالإنكليزية يُترجم الرمزُ (cnt.err.*)، ورفضٌ بلا تلميح يُترجم بالعربية (احتياطٌ:
   *     كلُّ رفعٍ count_* بالهجرات 0216–0255 وكلُّ refuse بالمرآة يحمل hint). وتعليقُ countError يقول هذا — لا «المرآةُ التجريبيةُ رمزٌ
   *     وحده» (كذب منذ حملت المرآةُ التلميح)، ولا «رفضٌ بلا تلميح (خادمٌ أقدم)» (ui3f: لا خادمَ يرسله — كذبٌ ثانٍ بالتصليح الأوّل). */
  async errs(M, ok) {
    const SP = P("p-err", "سرنجة 5 مل", { stock: 5, purchase_price: 1000 });
    const HINT = "«سرنجة 5 مل» عدّها أحد وتنتظر موافقة المدير — يوافق أو يرفض أوّلاً";
    const toasts = [];
    let refusal = null;
    globalThis.__perm = { can: () => true, role: "manager", baseRole: "manager" };
    globalThis.__toast = { success() {}, error: (m) => toasts.push(m), warn() {}, toast() {} };
    globalThis.__holds = [];
    globalThis.__api = new Proxy({}, { get: (_t, k) => async () => { throw new Error(`نداءٌ غير متوقّع: ${String(k)}`); } });
    globalThis.__repo = {
      listProducts: async () => [SP], productSalesRate: async () => new Map(), stockCountState: async () => new Map(), listActiveLots: async () => [],
      listStockCounts: async () => [], reportStockLosses: async () => [], submitStockCount: async () => { throw refusal; },
    };
    globalThis.__url = "";
    const ui = M.mount(M.React.createElement(M.StockCount));
    await ui.settle();
    const h = harness(M, ui);
    const line = () => ui.findAll("data-count-line").find((n) => ui.text(n).includes(SP.name));
    if (!line()) { await h.typeIn("data-count-search", "سرنجة"); await h.click("data-count-add"); }
    await h.typeIn("data-count-input", "3", line());
    await h.click("data-count-reason", "damaged", line());
    /** رفضٌ كما يرميه refuse بـdemoCounts (ورمزُ الخادم وتلميحُه كما يصلان من rpc). */
    const refuse = (hint) => Object.assign(new Error("count_already_pending"), { code: "P0001" }, hint ? { hint } : {});
    const said = async (lang, e) => {
      globalThis.__lang = lang; refusal = e; toasts.length = 0;
      try { await h.click("data-count-submit"); await ui.settle(); } finally { globalThis.__lang = "ar"; }
      return [...toasts];
    };
    const ar = await said("ar", refuse(HINT)), en = await said("en", refuse(HINT)), bare = await said("ar", refuse(null));
    ui.unmount();
    ok("errs.hintAr", "بالعربية: رفضُ المرآة (P0001 وتلميحُها) يُقال بتلميحه كما هو — يسمّي المادة", J(ar) === J([HINT]), J(ar));
    ok("errs.codeEn", "وبالإنكليزية يُترجم الرمز (cnt.err.already_pending) — لا تلميحٌ عربيّ بواجهةٍ إنكليزية",
      J(en) === J(["This item was already counted and awaits manager approval — approve or reject it first"]), J(en));
    ok("errs.codeOnly", "ورفضٌ بلا تلميح (احتياطٌ — لا يرسله الخادمُ ولا المرآةُ اليوم) يُترجم بالعربية (cnt.err.already_pending)", J(bare) === J(["هاي المادة عدّها أحد وتنتظر موافقة المدير — يوافق أو يرفض أول"]), J(bare));
    const src = M.SRC[S], at = src.indexOf("function countError(");
    const doc = at > 0 ? src.slice(src.lastIndexOf("/**", at), at) : "";
    ok("errs.doc", "وتعليقُ countError صادق: المرآةُ تحمل تلميحَ الخادم حرفاً (demoCounts) لا «رمزٌ وحده»، والرفضُ بلا تلميح احتياطٌ لا «خادمٌ أقدم» (كلُّ رفعٍ count_* يحمل hint)",
      doc !== "" && !doc.includes("رمزٌ وحده") && doc.includes("demoCounts") && !doc.includes("خادمٌ أقدم") && doc.includes("احتياط"), doc.trim().slice(0, 320));
    return ui.errors;
  },

  /* ف) (r3) رفضُ waste_source_taken (0254، جولة SQL الثانية): سطرٌ عُبّي من فاتورة سجّله غيرُنا قبلنا — تبويبٌ أو جهازٌ ثانٍ بعد «سجّل
   *     وطبّق»، أو مسودّةٌ قديمة — فيرفض الخادمُ السندَ كلَّه قبل أيّ كتابة، بتلميحه (P0001 + hint كما يصل describeDbError). كان التلميحُ
   *     يُقال والسطرُ يبقى بالسند يُرسَل ويُرفض للأبد (والباقي معه). الآن: تُقرأ الفاتورةُ من جديد — قراءةُ التعبئة نفسُها — ويُحكم كلُّ سطرٍ
   *     بمرجعه بقاعدة التعبئة (بدفعاته، وبلاها الفاتورةُ كلُّها، وسندُ الفاتورة كلِّها بعد أقدم دفعة): ما سُجّل يُشال ويُقال باسمه ووقته
   *     بجملة التعبئة، والباقي يبقى بقيمه ومراجعه ويُقال «ما انسجل بعد»، والصفحةُ تُعاد؛ وقراءةٌ فشلت أو ناقصة أو لا تقول شيئاً لا تشيل
   *     شيئاً؛ وما أُضيف والقراءةُ بالطريق يبقى. */
  async taken(M, ok) {
    const errors = [];
    const A1 = "2026-10-31T09:30:00.000Z";
    const when = (iso) => `${M.formatDate(iso, "ar")} ${M.formatTime(iso, "ar")}`;
    const HINT = "«Lyse» انسجلت هدر قبل من هالفاتورة — ما تنسجل مرّة ثانية";
    /** الرفضُ كما يرميه rpcJson بـconsumptionApi (والمرآةُ بـdemoHint): الرمزُ بـmessage، وP0001، والتلميحُ العربيّ. */
    const refuse = () => Object.assign(new Error("waste_source_taken"), { code: "P0001", hint: HINT });
    const okRes = (lines) => ({ pending: 0, ids: lines.map((_, i) => `t${i}`), decided: { approved: lines.length, rejected: 0, void: 0, withdrawals: [], negatives: [] },
      lines: lines.map((l) => ({ product_id: l.product_id, name: l.product_id, stock_now: 5, stock_after: 4 })) });
    const products = [LYSE, DIL, { ...GLOVES, stock: 5 }, FREE];
    const LEFT = "شلناها من السند — والباقي ما انسجل بعد، راجعه وأرسله مرّة ثانية";
    /** يفتح رابطَ الفاتورة (`at`، وnull رابطٌ قديم بلاها) على جوابٍ أوّل للتعبئة، ثمّ يجيب كلَّ قراءةٍ بعده بـ`again` (جوابٌ أو دالّة)،
     *  ويضيف «شاش مجاني» باليد (إلا `hand: false`)، ويرسل: الإرسالُ الأوّل يُرفض بـwaste_source_taken وما بعده ينجح. */
    const open = async ({ at = `${T2}`, first = TWO(), again, hand = true, before } = {}) => {
      let sends = 0;
      const s = session(M, { products, url: `tab=waste&inv=${INV}${at === null ? "" : `&at=${at}`}`, api: {
        invoiceConsumption: (() => { let n = 0; return async (ids) => (n++ === 0 ? (typeof first === "function" ? first(ids) : { [INV]: first }) : typeof again === "function" ? again(ids) : again); })(),
        submitWaste: async (lines) => { if (sends++ === 0) throw refuse(); return okRes(lines); },
      } });
      await s.ui.settle();
      if (before) await before(s);
      if (hand) {
        await s.add("شاش", FREE.id);
        const fl = s.one("data-waste-line", FREE.id);
        await s.typeIn("data-waste-qty", "1", fl); await s.typeIn("data-waste-note", "انفتح", fl);
      }
      await s.click("data-waste-send");
      return s;
    };
    const ids = (s) => s.ui.findAll("data-waste-line").map((n) => n.props["data-waste-line"]).sort();
    const said = (s) => s.ui.findAll("data-waste-taken-line").map((n) => s.text(n));
    const reads = (s) => s.log.calls.filter((c) => c[0] === "invoiceConsumption").map((c) => c[1]);
    const done = (s) => { s.ui.unmount(); errors.push(...s.ui.errors); };

    // أ) دفعةُ T2: عُبّي Lyse ٤ مل وDiluent ٢٠ مل، وأُضيف الشاشُ باليد — وLyse سجّلها جهازٌ ثانٍ (معلَّقٌ بدفعة T2)
    const a = await open({ again: { [INV]: TWO([WR(LYSE.id, T2, "pending", A1)]) } });
    const aIds = ids(a), aSaid = said(a), aLeft = a.text(a.one("data-waste-taken-left")), aReads = reads(a), aChanged = a.log.changed, aBlock = !!a.one("data-waste-taken");
    const aWrap = { taken: wraps(a.ui.findAll("data-waste-taken-line")[0]), left: wraps(a.one("data-waste-taken-left")), fill: wraps(a.ui.findAll("data-waste-inv")[0]?.children?.[0]) };
    ok("taken.hint", "الرفضُ يُقال بتلميح الخادم كما هو (P0001 + hint كما يصل describeDbError) — يسمّي المادة",
      a.log.toasts.some(([k, m]) => k === "error" && m === HINT), J(a.log.toasts));
    ok("taken.reread", "وتُقرأ الفاتورةُ من جديد — قراءةُ التعبئة نفسُها (invoiceConsumption([الفاتورة])) مرّةً بعد الرفض",
      J(aReads) === J([[INV], [INV]]), J(aReads));
    ok("taken.drop", "وما سجّله غيرُنا (Lyse) يُشال من السند — والباقي (Diluent والشاش) يبقى",
      J(aIds) === J([DIL.id, FREE.id].sort()), J(aIds));
    ok("taken.say", `ويُقال باسمه ووقته بجملة التعبئة نفسها: «"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية» — لا شيلَ بصمت`,
      J(aSaid) === J([`"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`]), J(aSaid));
    ok("taken.left", `ومعه أن الباقي ما انسجل: «${LEFT}» — الخادمُ رفض السندَ كلَّه`, aLeft === LEFT, J(aLeft));
    ok("wrap.taken", "واسمُ المادّة بأيّ طول يلتفّ بملاحظة الشيل وبـ«الباقي» (break-words يُورَث) — لا يطلع منها ولا يمرّر الصفحة على ٣٧٥", aWrap.taken && aWrap.left, J(aWrap));
    ok("wrap.fill", "وبطاقةُ التعبئة كذلك (اسمُ المسجّل والمتخطّى والباقي بالسند) — كانت بلا لفّ: اسمٌ لاتينيٌّ بـ٤٨ حرفاً يطلع ٥٤ بكسلاً ويمرّر الصفحة ٣٨ (مقيس)", aWrap.fill, J(aWrap));
    ok("taken.reload", "والصفحةُ تُعاد (معلَّقٌ أو رصيدٌ تحرّك من تحتها)", aChanged === 1, J({ changed: aChanged }));
    await a.click("data-waste-send");
    const resent = a.sends()[1]?.[1] ?? [];
    const by = Object.fromEntries(resent.map((l) => [l.product_id, l]));
    ok("taken.resend", "والإرسالُ الثاني يرسل الباقي وحده بقيمه ومراجعه: Diluent ٢٠ مل بمرجع T2، والشاشُ بلا مرجع — بلا Lyse",
      resent.length === 2 && !by[LYSE.id] && by[DIL.id]?.qty === 20 && by[DIL.id]?.unit === "sub" && by[DIL.id]?.src_invoice === INV && J(by[DIL.id]?.src_batches) === J([T2])
        && by[FREE.id]?.qty === 1 && by[FREE.id]?.note === "انفتح" && !("src_invoice" in by[FREE.id]), J(resent));
    ok("taken.cleared", "وملاحظةُ الشيل تبقى حتى يُسجَّل السند، ثمّ تغيب (النتيجةُ تقول ما سُجّل)", aBlock && !a.one("data-waste-taken") && !!a.one("data-waste-done"),
      J({ before: aBlock, after: !!a.one("data-waste-taken"), done: !!a.one("data-waste-done") }));
    done(a);

    // ب) رابطٌ قديم بلا at (السطورُ بلا دفعات): أيُّ سطرٍ للمادة من الفاتورة يكفي — «من هالفاتورة»
    const b = await open({ at: null, again: { [INV]: TWO([WR(LYSE.id, T1, "approved", A1)]) } });
    ok("taken.inv", `رابطٌ قديم بلا دفعات: سطرُ Lyse من الفاتورة بأيّ دفعة يُشيله — «"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)})»، والباقي يبقى`,
      J(ids(b)) === J([DIL.id, GLOVES.id, FREE.id].sort()) && J(said(b)) === J([`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)}) — ما نعبّيها مرّة ثانية`]), J({ ids: ids(b), said: said(b) }));
    done(b);

    // ج) سندُ الفاتورة كلِّها (بلا دفعات) سُجّل بعد أقدم دفعةٍ للسطر: شملها — يُشال، «من هالفاتورة»
    const c = await open({ at: `${T1},${T2}`, again: { [INV]: TWO([WR(LYSE.id, null, "pending", A1)]) } });
    ok("taken.whole", `سندُ الفاتورة كلِّها سُجّل بعد أقدم دفعة سطر Lyse (T1 وT2): يُشال ويُقال «من هالفاتورة» — والقفازاتُ وDiluent يبقيان`,
      J(ids(c)) === J([DIL.id, GLOVES.id, FREE.id].sort()) && J(said(c)) === J([`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)}) — ما نعبّيها مرّة ثانية`]), J({ ids: ids(c), said: said(c) }));
    done(c);

    // د) سطرٌ لـLyse من دفعةٍ أخرى (T1) لا يمسّ سطرَها من T2 — وDiluent سُجّل بـT2 فيُشال وحده
    const d = await open({ again: { [INV]: TWO([WR(LYSE.id, T1, "approved", A1), WR(DIL.id, T2, "pending", A1)]) } });
    ok("taken.batch", "بدفعات السطر لا بالفاتورة: سطرُ Lyse من T1 لا يشيل سطرَها من T2 (الخادمُ يقبله)، وDiluent المسجّلُ بـT2 يُشال ويُقال",
      J(ids(d)) === J([LYSE.id, FREE.id].sort()) && J(said(d)) === J([`"Diluent" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`]), J({ ids: ids(d), said: said(d) }));
    done(d);

    // هـ) كلُّ ما عُبّي سُجّل ولا سطرَ باليد: السندُ فرغ — يُقالان، ولا «الباقي ما انسجل» عن لا شيء
    const e = await open({ hand: false, again: { [INV]: TWO([WR(LYSE.id, T2, "approved", A1), WR(DIL.id, T2, "approved", A1)]) } });
    ok("taken.empty", "كلُّ ما عُبّي سُجّل: السطران يُشالان ويُقالان، ولا «الباقي ما انسجل» والسندُ فارغ",
      ids(e).length === 0 && said(e).length === 2 && !e.one("data-waste-taken-left"), J({ ids: ids(e), said: said(e) }));
    done(e);

    // و) القراءةُ فشلت، أو جاءت ناقصة (بلا now_us)، أو لا تقول شيئاً مسجّلاً: لا شيءَ يُشال — المجهولُ لا يُحكم، والتلميحُ قيل
    const f = await open({ again: async () => { throw new Error("Failed to fetch"); } });
    ok("taken.readFail", "إعادةُ القراءة فشلت: السندُ كما هو (لا شيلَ بالتخمين) والتلميحُ قيل",
      J(ids(f)) === J([DIL.id, LYSE.id, FREE.id].sort()) && !f.one("data-waste-taken") && f.log.toasts.some(([, m]) => m === HINT), J({ ids: ids(f), taken: !!f.one("data-waste-taken") }));
    done(f);
    const broken = TWO([WR(LYSE.id, T2, "pending", A1)]); delete broken.now_us;
    const g = await open({ again: { [INV]: broken } });
    ok("taken.shape", "وجوابٌ ناقص (بلا now_us) لا يُحكم به ولو قال إن Lyse سُجّلت: السندُ كما هو",
      J(ids(g)) === J([DIL.id, LYSE.id, FREE.id].sort()) && !g.one("data-waste-taken"), J({ ids: ids(g) }));
    done(g);
    const n0 = await open({ again: { [INV]: TWO() } });
    ok("taken.none", "وقراءةٌ لا تقول شيئاً مسجّلاً (رُفض سندُ الجهاز الثاني بينهما): لا شيءَ يُشال ولا يُقال",
      J(ids(n0)) === J([DIL.id, LYSE.id, FREE.id].sort()) && !n0.one("data-waste-taken"), J({ ids: ids(n0) }));
    done(n0);

    // ز) القراءةُ بالطريق وأُضيفت القفازاتُ باليد: الشيلُ على السند كما هو ساعتَه — القفازاتُ تبقى
    let release;
    const r = await open({ again: () => new Promise((res) => { release = () => res({ [INV]: TWO([WR(LYSE.id, T2, "pending", A1)]) }); }) });
    const busyWhile = !!r.one("data-waste-send")?.props.disabled;
    // بلا رمي: على شِفرةٍ أقدم (WASTE_OLD) قد لا يكون زرُّ الإضافة — فيسقط الفحصُ نفسُه لا السيناريو كلُّه.
    const added = await (async () => { try { await r.add("قفاز", GLOVES.id); return true; } catch { return false; } })();
    release?.(); await r.ui.settle();
    ok("taken.race", "القراءةُ بالطريق (والإرسالُ مقفول) وأُضيفت القفازاتُ باليد: تبقى بعد الشيل — Lyse وحدها تُشال",
      busyWhile && added && J(ids(r)) === J([DIL.id, GLOVES.id, FREE.id].sort()) && said(r).length === 1, J({ busyWhile, added, ids: ids(r), said: said(r) }));
    done(r);

    // ح) Lyse كُتبت باليد والتعبئةُ بالطريق فأخذت مرجعَ الترجيع («موجودة بسندك»): سجّلها غيرُنا ⇒ تُشال وتُقال كالمعبّأة — بقاؤها يُرسلها هدراً ثانياً
    let relFill;
    const k = await open({ first: () => new Promise((res) => { relFill = () => res({ [INV]: TWO() }); }), again: { [INV]: TWO([WR(LYSE.id, T2, "pending", A1)]) },
      before: async (s) => {
        try {   // بلا رمي على شِفرةٍ أقدم: يسقط الفحصُ بنفسه
          await s.add("lyse", LYSE.id);
          const l = s.one("data-waste-line", LYSE.id);
          await s.click("data-waste-unit", "sub", l);
          await s.typeIn("data-waste-qty", "4", l); await s.typeIn("data-waste-note", "انكسرت وقت الخدمة", l);
        } catch { /* swallow-ok: الفحصُ أدناه يقول ما لم يحدث */ }
        relFill?.(); await s.ui.settle();
      } });
    ok("taken.kept", "سطرٌ كُتب باليد أخذ مرجعَ الترجيع وسجّله غيرُنا: يُشال ويُقال باسمه — لا يبقى يُرسَل هدراً ثانياً",
      J(ids(k)) === J([DIL.id, FREE.id].sort()) && said(k).length === 1 && said(k)[0].startsWith('"Lyse" سجّلتها هدر قبل لهالترجيع'), J({ ids: ids(k), said: said(k) }));
    done(k);

    /* ── r3f (تدقيق r3): الحكمُ بقاعدة الخادم لا بالتعبئة، وكلُّ فاتورةٍ تحكم سطورَها، والمهلةُ تفكّ القفل، وما يُقال بعد الشيل صادق ── */
    const ly = (o) => ({ spec_id: "rl-ly", product_id: LYSE.id, product_name: "Lyse", unit: "sub", unit_label: "مل", per_qty: 2, per_div: 500, live_value: 0, shortfall: 0,
      note: null, source: "recipe", ...o });
    const entryOf = (items, waste = []) => ({ items, skips: [], negatives: [], now_us: NOW_US, waste });
    const INV_B = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", TB0 = T0 + 5, TB = T2 + 7;

    // ي) رابطٌ قديم (بلا at) عبّى Lyse ٢ مل، وسجّلها جهازٌ ثانٍ من الرابط نفسه، ثمّ تعديلٌ رفع سطرَ الخدمة (relink حيُّه ٠٫٠١٦ فوق ما رجع
    //    ٠٫٠١٢ — صافيها −٠٫٠٠٤): الخادمُ يرفض بأيّ سطرٍ للمادّة من الفاتورة (v_sb null) — وقاعدةُ التعبئة كانت تتخطّى المادّةَ (صافيها ≤ ٠) قبل أن
    //    تنظر بما سُجّل، فتبقى بالسند ويُرفض السندُ كلُّه مع كلّ إرسال (مقيسٌ بالتجريبيّ الحقيقيّ، verify3 E3).
    const preEdit = entryOf({ it1: [ly({ live_qty: 0.008, restored_qty: 0.004, moves: mv([T0, 0.012], [T1, -0.004]) })] });
    const postEdit = entryOf({ it1: [ly({ live_qty: 0, restored_qty: 0.012, moves: mv([T0, 0.012], [T1, -0.004], [T2, -0.008]) }),
      ly({ spec_id: "rl-ly2", source: "relink", live_qty: 0.016, restored_qty: 0, moves: mv([T2, 0.016]) })] }, [WR(LYSE.id, null, "approved", A1)]);
    const rl = await open({ at: null, first: preEdit, again: { [INV]: postEdit } });
    const rlIds = ids(rl), rlSaid = said(rl), rlLeft = rl.text(rl.one("data-waste-taken-left"));
    if (rl.one("data-waste-send") && !rl.one("data-waste-send").props.disabled) await rl.click("data-waste-send");
    const rlResent = rl.sends()[1]?.[1] ?? [];
    ok("taken.relink", `رابطٌ قديم وتعديلٌ رفع سطرَ الخدمة بعد التعبئة: سطرُ Lyse من الفاتورة يكفي الخادمَ ليرفض، فيُشال ويُقال «"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)})» والشاشُ يُرسَل وحده — كان Lyse يبقى ويُرفض للأبد`,
      J(rlIds) === J([FREE.id]) && J(rlSaid) === J([`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(A1)}) — ما نعبّيها مرّة ثانية`]) && rlLeft === LEFT
        && rlResent.length === 1 && rlResent[0]?.product_id === FREE.id, J({ ids: rlIds, said: rlSaid, left: rlLeft, resent: rlResent }));
    done(rl);

    // ك) فاتورتان بسندٍ واحد: Lyse من A (at=T2) وDiluent من B برابطٍ قديم — وبسجلّ A سطرُ Diluent (سُجّل من A قبلُ). الرفضُ لـLyse: كلُّ فاتورةٍ
    //    تحكم سطورَها وحدها، فـDiluent من B (لا سطرَ له بسجلّ B، والخادمُ يقبله) يبقى ويُرسَل بمرجع B بلا دفعات.
    const dilB = entryOf({ itB: [{ spec_id: "b-dil", product_id: DIL.id, product_name: "Diluent", unit: "sub", unit_label: "مل", per_qty: 10, per_div: 20000, live_qty: 0,
      live_value: 0, restored_qty: 0.0005, shortfall: 0, note: null, source: "recipe", moves: mv([TB0, 0.0005], [TB, -0.0005]) }] });
    let aWaste = [WR(DIL.id, T2, "approved", A1)], tvSends = 0;
    const tv = session(M, { products, url: `tab=waste&inv=${INV}&at=${T2}`, api: {
      invoiceConsumption: async (q) => Object.fromEntries(q.map((id) => [id, id === INV ? TWO(aWaste) : dilB])),
      submitWaste: async (lines) => { if (tvSends++ === 0) throw refuse(); return okRes(lines); },
    } });
    await tv.ui.settle();
    globalThis.__go(`tab=waste&inv=${INV_B}`); await tv.ui.settle();
    const tvDraft = ids(tv);
    aWaste = [...aWaste, WR(LYSE.id, T2, "pending", A1)];
    await tv.click("data-waste-send");
    const tvIds = ids(tv), tvSaid = said(tv);
    if (tv.one("data-waste-send") && !tv.one("data-waste-send").props.disabled) await tv.click("data-waste-send");
    const tvResent = tv.sends()[1]?.[1] ?? [];
    ok("taken.twoInv", "فاتورتان بسندٍ واحد: Lyse من A تُشال (سجّلها غيرُنا)، وDiluent من B يبقى ويُرسَل بمرجع B — سطرُ Diluent بسجلّ A لا يحكم سطرَ B (والخادمُ يقبله)",
      J(tvDraft) === J([DIL.id, LYSE.id].sort()) && J(tvIds) === J([DIL.id]) && J(tvSaid) === J([`"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`])
        && tvResent.length === 1 && tvResent[0]?.product_id === DIL.id && tvResent[0]?.src_invoice === INV_B && !("src_batches" in (tvResent[0] ?? {})),
      J({ draft: tvDraft, ids: tvIds, said: tvSaid, resent: tvResent }));
    done(tv);

    // ل) القراءةُ بعد الرفض لا تجيب أبداً: «سجّل وطبّق» مقفولٌ وهي بالطريق، وعند ٨ ثوانٍ (withTimeout) ينفكّ والسندُ كما هو — لا قفلَ للأبد.
    //    مؤقّتاتُ الثانية فأكثر بيد الفحص (لا يضعها هنا غيرُ المهلة)، وما دونها حقيقيّ (settle بـreact-mini: setTimeout(r, 0)).
    const REAL_TIMERS = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
    const held = [];
    let clockMs = 0, wt = null;
    globalThis.setTimeout = (fn, ms = 0, ...rest) => {
      if (!(Number(ms) >= 1000)) return REAL_TIMERS.set(fn, ms, ...rest);
      const h = { fn, at: clockMs + Number(ms), rest };
      held.push(h);
      return h;
    };
    globalThis.clearTimeout = (h) => { const i = held.indexOf(h); if (i >= 0) held.splice(i, 1); else REAL_TIMERS.clear(h); };
    try {
      wt = await open({ again: () => new Promise(() => {}) });
      const tick = async (ms) => {
        clockMs += ms;
        for (const h of held.filter((x) => x.at <= clockMs).sort((x, y) => x.at - y.at)) { held.splice(held.indexOf(h), 1); h.fn(...h.rest); }
        await wt.ui.settle();
      };
      const busy = () => !!wt.one("data-waste-send")?.props.disabled;
      const busy0 = busy();
      await tick(7_999);
      const busy7 = busy();
      await tick(1);
      const busy8 = busy();
      ok("taken.wait", "القراءةُ بعد الرفض عالقة: «سجّل وطبّق» مقفولٌ وهي بالطريق (وعند ٧٫٩٩٩ ثانية)، وعند ٨ ثوانٍ ينفكّ والسندُ كما هو بلا شيلٍ ولا ملاحظة — والتلميحُ قيل",
        busy0 && busy7 && !busy8 && J(ids(wt)) === J([DIL.id, LYSE.id, FREE.id].sort()) && !wt.one("data-waste-taken") && wt.log.toasts.some(([, m]) => m === HINT),
        J({ busy0, busy7, busy8, ids: ids(wt), taken: !!wt.one("data-waste-taken") }));
    } finally { globalThis.setTimeout = REAL_TIMERS.set; globalThis.clearTimeout = REAL_TIMERS.clear; }
    if (wt) done(wt);

    // م) سندُ الفاتورة كلِّها بحدّ الدفعة بالمللي كالخادم (_cons_at_us ÷ ١٠٠٠ >= أقدمُ دفعات السطر ÷ ١٠٠٠): سُجّل قبل دفعة السطر بمللي فما شملها
    //    (Lyse يبقى، والرفضُ لـDiluent المسجّل بـT2)، وبمللّيها نفسِه شملها (يُشال، «من هالفاتورة»).
    const msIso = (ms) => new Date(ms).toISOString();
    const T2ms = Math.floor(T2 / 1000);
    const we1 = await open({ hand: false, again: { [INV]: TWO([WR(LYSE.id, null, "approved", msIso(T2ms - 1)), WR(DIL.id, T2, "pending", A1)]) } });
    const we1Ids = ids(we1), we1Said = said(we1);
    done(we1);
    const we2 = await open({ hand: false, again: { [INV]: TWO([WR(LYSE.id, null, "approved", msIso(T2ms))]) } });
    const we2Ids = ids(we2), we2Said = said(we2);
    done(we2);
    ok("taken.wholeEdge", "سندُ الفاتورة كلِّها قبل دفعة السطر بمللي لا يشيله (الخادمُ يقبله) — وبمللّيها نفسِه يشيله «من هالفاتورة»",
      J(we1Ids) === J([LYSE.id]) && J(we1Said) === J([`"Diluent" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`])
        && J(we2Ids) === J([DIL.id]) && J(we2Said) === J([`"Lyse" سجّلتها هدر قبل من هالفاتورة (${when(msIso(T2ms))}) — ما نعبّيها مرّة ثانية`]),
      J({ we1Ids, we1Said, we2Ids, we2Said }));

    // ن) إعادةُ القراءة أفرغت السند (Lyse وحدها، سجّلها جهازٌ ثانٍ): يُشال الرابطُ كأيّ سندٍ فرغ — كانت «عبّينا 1 مادة … راجع الكميات وسجّل» تبقى
    //    فوق سندٍ فارغ وزرٍّ مقفول — والملاحظةُ تبقى بلا «الباقي». ثمّ سطرٌ باليد (ما أُرسل قطّ): لا «الباقي ما انسجل… أرسله مرّة ثانية» فوقه.
    //    ثمّ رابطٌ آخر يعبّي: الملاحظةُ عن السند السابق تغيب.
    const ONE = entryOf({ it1: [ly({ live_qty: 0, restored_qty: 0.012, moves: mv([T0, 0.012], [T1, -0.004], [T2, -0.008]) })] });
    const glvB = entryOf({ itB: [{ spec_id: "b-glv", product_id: GLOVES.id, product_name: "قفازات", unit: "stock", unit_label: null, per_qty: 1, per_div: 1, live_qty: 0,
      live_value: 0, restored_qty: 1, shortfall: 0, note: null, source: "recipe", moves: mv([TB0, 1], [TB, -1]) }] });
    let oneWaste = [], emSends = 0;
    const em = session(M, { products, url: `tab=waste&inv=${INV}&at=${T2}`, api: {
      invoiceConsumption: async (q) => Object.fromEntries(q.map((id) => [id, id === INV ? { ...ONE, waste: oneWaste } : glvB])),
      submitWaste: async (lines) => { if (emSends++ === 0) throw refuse(); return okRes(lines); },
    } });
    await em.ui.settle();
    const emDraft = ids(em);
    oneWaste = [WR(LYSE.id, T2, "approved", A1)];
    await em.click("data-waste-send");
    const emState = { ids: ids(em), said: said(em), left: !!em.one("data-waste-taken-left"), card: em.text(em.one("data-waste-inv")), url: globalThis.__url };
    ok("taken.emptied", `القراءةُ أفرغت السند: Lyse تُشال وتُقال، بلا «الباقي»، ويُشال الرابطُ وبطاقتُه — لا «عبّينا 1 … راجع الكميات وسجّل» فوق سندٍ فارغ`,
      J(emDraft) === J([LYSE.id]) && emState.ids.length === 0 && J(emState.said) === J([`"Lyse" سجّلتها هدر قبل لهالترجيع (${when(A1)}) — ما نعبّيها مرّة ثانية`])
        && !emState.left && emState.card === "" && !/(^|&)(inv|at)=/.test(emState.url), J(emState));
    const emAdded = await (async () => { try { await em.add("شاش", FREE.id); return true; } catch { return false; } })();
    const emHand = { ids: ids(em), said: said(em), left: !!em.one("data-waste-taken-left") };
    ok("taken.leftOnly", "وبعده سطرٌ باليد (ما أُرسل قطّ): الملاحظةُ تقول ما شيل، بلا «الباقي ما انسجل بعد، راجعه وأرسله مرّة ثانية» فوقه",
      emAdded && J(emHand.ids) === J([FREE.id]) && emHand.said.length === 1 && !emHand.left, J(emHand));
    globalThis.__go(`tab=waste&inv=${INV_B}&at=${TB}`); await em.ui.settle();
    const emNext = { block: !!em.one("data-waste-taken"), card: em.text(em.one("data-waste-inv")), ids: ids(em) };
    ok("taken.nextLink", `ثمّ رابطٌ آخر (فاتورة B) يعبّي: ملاحظةُ السند السابق تغيب، والبطاقةُ بطاقةُ B — كانت «"Lyse" سجّلتها… والباقي ما انسجل» تقف فوق تعبئةٍ ما أُرسلت`,
      emState.said.length === 1 && !emNext.block && emNext.card.includes(M.invoiceNo(INV_B)) && J(emNext.ids) === J([FREE.id, GLOVES.id].sort()), J(emNext));
    done(em);

    // س) بقي سطرٌ بعد الشيل ثمّ شاله صاحبُه بيده فصار السندُ فارغاً: الملاحظةُ تغيب معه — كانت تبقى فوق سندٍ فارغ والعنوانُ بلا رابط.
    const he = await open({ hand: false, again: { [INV]: TWO([WR(LYSE.id, T2, "pending", A1)]) } });
    const heBefore = said(he).length;
    const heRemoved = await (async () => { try { await he.click("data-waste-remove", undefined, he.one("data-waste-line", DIL.id)); return true; } catch { return false; } })();
    ok("taken.handEmpty", "بقي Diluent بعد الشيل ثمّ شاله صاحبُه بيده: السندُ فارغ والملاحظةُ تغيب معه",
      heBefore === 1 && heRemoved && ids(he).length === 0 && !he.one("data-waste-taken"), J({ heBefore, heRemoved, ids: ids(he), block: !!he.one("data-waste-taken") }));
    done(he);

    // ع) السندُ Lyse وحدها، وأُضيفت القفازاتُ باليد والقراءةُ بالطريق، فشالت القراءةُ Lyse: «الباقي ما انسجل… أرسله مرّة ثانية» عن سطور السند
    //    المرفوض وحدها — والقفازاتُ ما أُرسلت قطّ (والملاحظةُ تقول ما شيل).
    let relLr;
    const lr = await open({ hand: false, first: ONE, again: () => new Promise((res) => { relLr = () => res({ [INV]: { ...ONE, waste: [WR(LYSE.id, T2, "pending", A1)] } }); }) });
    const lrAdded = await (async () => { try { await lr.add("قفاز", GLOVES.id); return true; } catch { return false; } })();
    relLr?.(); await lr.ui.settle();
    ok("taken.leftRace", "أُضيفت القفازاتُ والقراءةُ بالطريق ثمّ شيلت Lyse: لا «الباقي ما انسجل… أرسله مرّة ثانية» فوق سطرٍ ما أُرسل، والملاحظةُ تقول Lyse",
      lrAdded && J(ids(lr)) === J([GLOVES.id]) && said(lr).length === 1 && !lr.one("data-waste-taken-left"), J({ lrAdded, ids: ids(lr), said: said(lr), left: !!lr.one("data-waste-taken-left") }));
    done(lr);

    // ف) القراءةُ بعد الرفض بالطريق، وفُتح رابطٌ آخر (B) وتعبئتُه بالطريق، ثمّ أفرغت القراءةُ السند: رابطُ B لا يُشال — تصل تعبئتُه ببطاقتها
    //    (شيلُه كان يضمّ سطورَه للسند والبطاقةُ مخفيّة، فلا يُقال من أين جاءت). حارسُ رجوعٍ لإفراغ القراءة (r3f): شِفرةُ r3 لا تشيل رابطاً أصلاً.
    let relA = null, relB = null, elReads = 0;
    const el = session(M, { products, url: `tab=waste&inv=${INV}&at=${T2}`, api: {
      invoiceConsumption: async (q) => {
        if (q[0] === INV_B) return new Promise((res) => { relB = () => res({ [INV_B]: glvB }); });
        return elReads++ === 0 ? { [INV]: ONE } : new Promise((res) => { relA = () => res({ [INV]: { ...ONE, waste: [WR(LYSE.id, T2, "pending", A1)] } }); });
      },
      submitWaste: async () => { throw refuse(); },
    } });
    await el.ui.settle();
    el.one("data-waste-send")?.props.onClick(); await el.ui.settle();
    globalThis.__go(`tab=waste&inv=${INV_B}&at=${TB}`); await el.ui.settle();
    relA?.(); await el.ui.settle();
    relB?.(); await el.ui.settle();
    const elState = { url: globalThis.__url, card: el.text(el.one("data-waste-inv")), ids: ids(el), said: said(el) };
    ok("taken.emptyLoading", "القراءةُ أفرغت السندَ ورابطُ B تعبئتُه بالطريق: رابطُ B يبقى وتصل تعبئتُه ببطاقتها (القفازات)، والملاحظةُ تقول Lyse",
      elState.url.includes(`inv=${INV_B}`) && elState.card.includes(M.invoiceNo(INV_B)) && J(elState.ids) === J([GLOVES.id]) && elState.said.length === 1, J(elState));
    done(el);

    // ط) ملاحظةُ ?p= (مادّةٌ بحوض القسم) تقول اسمَها — وتلتفّ كالبطاقتين
    const pk = session(M, { products: [...products, POOL], url: `tab=waste&p=${POOL.id}` });
    await pk.ui.settle();
    const pick = pk.one("data-waste-pick");
    ok("wrap.pick", "وملاحظةُ ?p= (اسمُ المادّة ولماذا لا تُسجَّل هنا) تلتفّ كذلك", !!pick && wraps(pick), pk.text(pick));
    done(pk);
    return errors;
  },

  /* ق) البيعُ قبل الجرد (0266) — الفرقُ الوهميّ: الصفحةُ تحمّل الرصيدَ مرّةً والخادمُ يلقطه لحظةَ «سجّل العدّ»، فما انباع بين كتابة العدد
   *    وإرساله كان يرجع «زيادة» لم توجد (وجردُ الشهر التالي يقلبها «عجزاً» يُسجَّل خسارة). السطرُ يحمل seen: صفُّه الطازج لحظةَ أوّل ضغطة
   *    — لا رصيدُ الصفحة القديم (seen.base) — ولا يُحدَّث بالضغطات بعدها (seen.frozen)، ويُرسل مع كلّ سطر (seen.sent)؛ وفشلُ قراءة الصفّ
   *    يرجع للمحمَّل والخادمُ يحكم (seen.fallback). */
  async seen(M, ok) {
    const A = P("p-seen-a", "ميلوكسيكام", { stock: 5 }), B = P("p-seen-b", "سيفترياكسون", { stock: 5 });
    const server = new Map();
    const pg = await countPage(M, { products: [A, B], server, fail: new Set([B.id]) });
    server.set(A.id, 4);                       // بيعٌ بعد فتح الصفحة وقبل العدّ: الصفحةُ تقول ٥ والرفُّ ٤
    await pg.type(A.id, "4");
    const t1 = pg.textOf(A.id);
    ok("seen.base", "أوّلُ ضغطة تقرأ صفَّ المادّة طازجاً: عدُّ ٤ على رصيدٍ صار ٤ «مطابق» — لا «الفرق −1» على رصيد الصفحة القديم (٥)",
      t1.includes("مطابق للنظام") && within(pg.lineOf(A.id), "data-count-diff").length === 0 && pg.log.fresh.get(A.id) === 1, J({ t1, fresh: [...pg.log.fresh] }));
    server.set(A.id, 3);                       // بيعٌ بعد كتابة العدد: ما رآه العادّ يبقى ٤
    await pg.type(A.id, "45");
    await pg.type(A.id, "4");
    const t2 = pg.textOf(A.id);
    ok("seen.frozen", "والضغطاتُ بعدها لا تعيد السؤال ولا تحدّث ما رآه العادّ: سؤالٌ واحد، والعدُّ ٤ «مطابق» لما رآه (لا «الفرق +1» على ٣)",
      pg.log.fresh.get(A.id) === 1 && t2.includes("مطابق للنظام"), J({ t2, fresh: [...pg.log.fresh] }));
    await pg.type(B.id, "5");
    await pg.submit();
    const sent = pg.log.sends[0] ?? [];
    ok("seen.sent", "«سجّل العدّ» يرسل seen مع السطر — ما رآه العادّ لحظةَ أوّل ضغطة (٤)، لا رصيدُ الصفحة (٥) ولا رصيدُ الإرسال (٣)",
      pg.log.sends.length === 1 && J(sent.find((l) => l.product_id === A.id)) === J({ product_id: A.id, counted: 4, reason: null, note: null, seen: 4 }), J(pg.log.sends));
    ok("seen.fallback", "وفشلُ قراءة الصفّ يرجع لرصيد الصفحة (والخادمُ يحكم بـcount_moved) — لا سطرٌ بلا seen",
      pg.log.fresh.get(B.id) === 1 && J(sent.find((l) => l.product_id === B.id)) === J({ product_id: B.id, counted: 5, reason: null, note: null, seen: 5 }), J(sent));
    return pg.done();
  },

  /* ق٢) سؤالُ الصفّ عالق (0266): «سجّل العدّ» ينتظر ما رآه العادّ — وبلا مهلة كان يعلّق للأبد والزرُّ يدور. عند ٨ ثوانٍ (withTimeout)
   *     يرجع لرصيد الصفحة والخادمُ يحكم (seen.wait). مؤقّتاتُ الثانية فأكثر بيد الفحص كـtaken.wait، وما دونها حقيقيّ (settle). */
  async seenwait(M, ok) {
    const REAL = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
    const held = [];
    let clock = 0, pg = null;
    globalThis.setTimeout = (fn, ms = 0, ...rest) => {
      if (!(Number(ms) >= 1000)) return REAL.set(fn, ms, ...rest);
      const h = { fn, at: clock + Number(ms), rest };
      held.push(h);
      return h;
    };
    globalThis.clearTimeout = (h) => { const i = held.indexOf(h); if (i >= 0) held.splice(i, 1); else REAL.clear(h); };
    try {
      const H = P("p-hang", "بنسلين", { stock: 6 });
      pg = await countPage(M, { products: [H] });
      globalThis.__repo.getProductById = () => new Promise(() => {});   // سؤالٌ لا يجيب أبداً
      await pg.type(H.id, "6");
      await pg.submit();
      const tick = async (ms) => {
        clock += ms;
        for (const h of held.filter((x) => x.at <= clock).sort((x, y) => x.at - y.at)) { held.splice(held.indexOf(h), 1); h.fn(...h.rest); }
        await pg.ui.settle();
      };
      const busy = () => !!pg.h.one("data-count-submit")?.props.disabled;
      const busy0 = busy() && pg.log.sends.length === 0;
      await tick(7_999);
      const busy7 = busy() && pg.log.sends.length === 0;
      await tick(1);
      ok("seen.wait", "سؤالُ الصفّ عالق: «سجّل العدّ» ينتظره (وعند ٧٫٩٩٩ ثانية) — وعند ٨ ثوانٍ يرسل برصيد الصفحة (٦) ولا يعلّق",
        busy0 && busy7 && J(pg.log.sends) === J([[{ product_id: H.id, counted: 6, reason: null, note: null, seen: 6 }]]) && pg.log.toasts.at(-1) === "success:انسجل العدّ: 1 مطابقة، و0 بيها فرق تنتظر موافقة المدير",
        J({ busy0, busy7, sends: pg.log.sends, toasts: pg.log.toasts }));
    } finally {
      globalThis.setTimeout = REAL.set;
      globalThis.clearTimeout = REAL.clear;
    }
    return pg ? pg.done() : [];
  },

  /* ر) count_moved (0266): ما تحرّك رصيدُه بعد كتابة عدده يردّه الخادمُ بمعرّفاته (detail) بلا أثر — يُمسح عددُه وحده (moved.only)
   *    ويُقال (moved.toast)، والصفحةُ تُعاد (moved.reload)، وإعادةُ عدّه تسأل صفَّه من جديد فيُرسل بما رآه الآن (moved.recount) — لا
   *    بالمجمَّد القديم: كان سيُردّ للأبد. والخادمُ هنا أمين (honest): يقارن seen برصيده لحظةَ النداء كـstock_count_submit_seen. */
  async moved(M, ok) {
    const A = P("p-mv-a", "أموكسيسيلين ١٠٪", { stock: 5 }), B = P("p-mv-b", "ديكساميثازون", { stock: 5 }), C = P("p-mv-c", "فيتامين ب", { stock: 5 });
    const server = new Map();
    const pg = await countPage(M, { products: [A, B, C], server, answer: honest });
    for (const x of [A, B, C]) await pg.type(x.id, "5");
    server.set(A.id, 4);                       // بيعٌ بعد كتابة العدد وقبل «سجّل العدّ»
    await pg.submit();
    ok("moved.only", "رفضُ count_moved يمسح عددَ ما تحرّك وحده — الباقي كما كُتب",
      pg.log.sends.length === 1 && pg.valueOf(A.id) === "" && pg.valueOf(B.id) === "5" && pg.valueOf(C.id) === "5",
      J({ a: pg.valueOf(A.id), b: pg.valueOf(B.id), c: pg.valueOf(C.id), sends: pg.log.sends.length }));
    ok("moved.toast", "ويُقال: «رصيد هذي المواد تغيّر من وقت ما كتبت العدد … انمسح عددها، اعدّها مرّة ثانية»",
      pg.log.toasts.includes("error:رصيد هذي المواد تغيّر من وقت ما كتبت العدد (بيع أو شراء) — انمسح عددها، اعدّها مرّة ثانية"), J(pg.log.toasts));
    ok("moved.reload", "والصفحةُ تُعاد (رصيدٌ تحرّك من تحتها)", pg.log.loads === 2, `loads=${pg.log.loads}`);
    await pg.type(A.id, "4");
    await pg.submit();
    const second = pg.log.sends[1] ?? [];
    ok("moved.recount", "وإعادةُ العدّ تسأل صفَّه من جديد فيُرسل بما رآه الآن (٤) مع الباقيَين — والخادمُ يقبله",
      pg.log.fresh.get(A.id) === 2 && second.length === 3 && J(second.find((l) => l.product_id === A.id)) === J({ product_id: A.id, counted: 4, reason: null, note: null, seen: 4 })
        && pg.log.toasts.at(-1) === "success:انسجل العدّ: 3 مطابقة، و0 بيها فرق تنتظر موافقة المدير", J({ fresh: [...pg.log.fresh], second, toasts: pg.log.toasts }));
    return pg.done();
  },

  /* ش) الإرسالُ دفعاتٌ (0266): سقفُ الخادم ٢٠٠ سطرٍ بالنداء — ٤٥٠ سطراً تُرسل ٢٠٠/٢٠٠/٥٠ بالتتابع وتُجمع أرقامُها (chunk.sizes، chunk.saved).
   *    والسطورُ من بطاقة «جرد البداية» (شركاتٌ بـ١٥٠): هي مصدرُ القوائم الكبيرة. وفشلُ دفعةٍ بسيناريو وحده (chunkfail): كلُّ طفرةٍ تعيد
   *    جلسةً واحدة بـ٤٥٠ سطراً لا اثنتين. */
  async chunks(M, ok) {
    const a = await bigCount(M, (lines) => ({ matched: lines.length - 1, pending: 1 }));
    const shown = a.ids().length;
    await a.submit();
    ok("chunk.sizes", "٤٥٠ سطراً تُرسل ٢٠٠ ثم ٢٠٠ ثم ٥٠ بالتتابع — كلُّ سطرٍ مرّةً وبـseen",
      shown === 450 && J(a.log.sends.map((x) => x.length)) === J([200, 200, 50]) && a.log.sends.flat().every((l) => typeof l.seen === "number")
        && new Set(a.log.sends.flat().map((l) => l.product_id)).size === 450, J({ shown, sizes: a.log.sends.map((x) => x.length) }));
    ok("chunk.saved", "والنجاحُ كلُّه يقول مجموعَ الدفعات (447 مطابقة و3 بيها فرق) ويشيل السطورَ كلَّها",
      a.log.toasts.includes("success:انسجل العدّ: 447 مطابقة، و3 بيها فرق تنتظر موافقة المدير") && a.ids().length === 0, J({ toasts: a.log.toasts, left: a.ids().length }));
    return a.done();
  },

  /* ش٢) فشلُ الدفعة الثانية (0266): يوقف ما بعدها (chunk.stop) ويقول «انسجل ٢٠٠ من ٤٥٠» بسببه (chunk.partial)، والقائمةُ تُبقي بالضبط ما لم
   *    يُرسل بأعداده (chunk.left)؛ و«سجّل العدّ» ثانيةً يرسل الباقي وحده — لا يعيد ما انسجل (chunk.retry). */
  async chunkfail(M, ok) {
    const b = await bigCount(M, (lines, k) => { if (k === 2) throw new Error("Failed to fetch"); return { matched: lines.length, pending: 0 }; });
    await b.submit();
    const sent1 = new Set((b.log.sends[0] ?? []).map((l) => l.product_id));
    const left = b.products.map((x) => x.id).filter((id) => !sent1.has(id));
    const shown = b.ids();
    ok("chunk.stop", "فشلُ الدفعة الثانية يوقف ما بعدها — لا ثالثةَ تُرسل", J(b.log.sends.map((x) => x.length)) === J([200, 200]), J(b.log.sends.map((x) => x.length)));
    ok("chunk.partial", "ويُقال «انسجل 200 من 450 — الباقي ما انسجل وبقى بالقائمة: …» بسبب الفشل",
      b.log.toasts.some((x) => x.startsWith("error:انسجل 200 من 450 — الباقي ما انسجل وبقى بالقائمة: ")), J(b.log.toasts));
    ok("chunk.left", "والقائمةُ تُبقي بالضبط ما لم يُسجَّل (٢٥٠) بأعداده — وما انسجل يُشال",
      shown.length === 250 && J([...shown].sort()) === J([...left].sort()) && shown.every((id) => b.valueOf(id) === "0"),
      J({ n: shown.length, stray: shown.filter((id) => sent1.has(id)).slice(0, 3) }));
    await b.submit();
    const again = b.log.sends.slice(2);
    ok("chunk.retry", "و«سجّل العدّ» ثانيةً يرسل الباقيَ وحده (٢٠٠ ثم ٥٠) — لا سطرَ انسجل يُعاد — ويقول «انسجل العدّ: 250…» ولا يبقى سطر",
      J(again.map((x) => x.length)) === J([200, 50]) && again.flat().every((l) => !sent1.has(l.product_id))
        && b.log.toasts.at(-1) === "success:انسجل العدّ: 250 مطابقة، و0 بيها فرق تنتظر موافقة المدير" && b.ids().length === 0,
      J({ sizes: again.map((x) => x.length), last: b.log.toasts.at(-1), left: b.ids().length }));
    return b.done();
  },

  /* ت) أوّلُ عدٍّ بعد البيع قبل الجرد (0266): بعيادةٍ استعملت الوضع، مادّةٌ ما انعدّت أبداً سببُ فرقها «خطأ إدخال» مختارٌ مسبقاً ومعه لماذا
   *    (first.pre) ويُرسل (first.sent)، ويتغيّر باليد والتلميحُ يغيب (first.change) — فرقُ رصيدٍ منقول خطأُ إدخالٍ لا خسارة. ولا لمادّةٍ
   *    انعدّت قبل (first.counted) ولا بعيادةٍ ما استعملته (first.unused). */
  async first(M, ok) {
    const errors = [];
    const NEW = P("p-first-new", "كلوربرومازين", { stock: 10 }), OLD = P("p-first-old", "بروكايين", { stock: 10 });
    const state = new Map([[OLD.id, { lastCountedAt: "2026-09-01T08:00:00Z", lastDiffAt: null }]]);
    const hint = (pg, id) => pg.textOf(id).includes("أول عدّ لهالمادة: السبب مختار «خطأ إدخال»");
    const a = await countPage(M, { products: [NEW, OLD], state, used: true });
    await a.type(NEW.id, "7");
    await a.type(OLD.id, "7");
    ok("first.pre", "مادّةٌ ما انعدّت أبداً بعيادةٍ استعملت الوضع: «خطأ إدخال» مختارٌ لفرقها، ومعه «أول عدّ لهالمادة…»",
      J(a.pressed(NEW.id)) === J(["entry_error"]) && hint(a, NEW.id), J({ pressed: a.pressed(NEW.id), text: a.textOf(NEW.id) }));
    ok("first.counted", "ومادّةٌ انعدّت قبل: لا سببَ مختار ولا تلميح", a.pressed(OLD.id).length === 0 && !hint(a, OLD.id), J({ pressed: a.pressed(OLD.id) }));
    await a.submit();
    const refused = a.log.sends.length === 0 && a.log.toasts.includes(`error:«${OLD.name}» بيها فرق — اختر السبب`);
    await a.reason(OLD.id, "shortage");
    await a.submit();
    const byId = new Map((a.log.sends[0] ?? []).map((l) => [l.product_id, l]));
    ok("first.sent", "الإرسالُ بلا سببٍ للمعدودة قبل يُرفض باسمها، وبعده يرسل «خطأ إدخال» للجديدة و«عجز» المختار للقديمة",
      refused && byId.get(NEW.id)?.reason === "entry_error" && byId.get(OLD.id)?.reason === "shortage", J({ refused, sends: a.log.sends, toasts: a.log.toasts }));
    errors.push(...a.done());
    const b = await countPage(M, { products: [NEW, OLD], state, used: true });
    await b.type(NEW.id, "7");
    await b.reason(NEW.id, "damaged");
    const bHint = hint(b, NEW.id), bPressed = b.pressed(NEW.id);
    await b.submit();
    ok("first.change", "والمختارُ يتغيّر باليد («تالف»): التلميحُ يغيب ويُرسل ما اختير",
      J(bPressed) === J(["damaged"]) && !bHint && b.log.sends[0]?.[0]?.reason === "damaged", J({ bPressed, bHint, sends: b.log.sends }));
    errors.push(...b.done());
    /* عدٌّ أوّلُ رُفض: حالةُ العدّ فيها سطرُه، والخادمُ لا يعدّها «انعدّت» (neg_stock_counted) — فعدُّها الحقيقيُّ الأوّل يختار «خطأ
       إدخال» كالتي ما انعدّت؛ وسؤالُ الخادم فشل ⇒ حالةُ العدّ كما كانت (لا «انعدّت» مخترعة ولا خطأ). */
    const PND = P("p-first-pnd", "سيفترياكسون", { stock: 0 });
    const r1 = await countPage(M, { products: [NEW, OLD, PND], state, used: true, counted: [],
      pending: [row({ id: "pp", product_id: PND.id, product_name: PND.name, source: "count", system_qty: 0, counted_qty: 1 })] });
    await r1.type(OLD.id, "7");
    ok("first.rejected", "عدٌّ رُفض ليس «انعدّت»: بتعريف الخادم (لا مطابق ولا موافَق) يُختار «خطأ إدخال» لعدّها الأوّل الحقيقيّ",
      J(r1.pressed(OLD.id)) === J(["entry_error"]), J({ pressed: r1.pressed(OLD.id) }));
    const left1 = r1.h.text(r1.h.one("data-count-open-left"));
    ok("first.pendingNot", "  ومادّةٌ عدُّها معلَّق ليست «ما انعدّت» ولو لم يعدّها الخادم (لا تُعدّ ثانيةً قبل قراره): «باقي 2» لا 3",
      left1 === "باقي 2 مادة ما انعدّت أبداً، منها 0 رصيدها صفر أو تحت الصفر", left1);
    errors.push(...r1.done());
    const r2 = await countPage(M, { products: [NEW, OLD], state, used: true, counted: "fail" });
    await r2.type(OLD.id, "7");
    await r2.type(NEW.id, "7");
    ok("first.rejectedFallback", "  وسؤالُ الخادم فشل: حالةُ العدّ كما كانت (القديمةُ بلا اختيار، والجديدةُ «خطأ إدخال»)",
      r2.pressed(OLD.id).length === 0 && J(r2.pressed(NEW.id)) === J(["entry_error"]), J({ old: r2.pressed(OLD.id), neu: r2.pressed(NEW.id) }));
    errors.push(...r2.done());
    const c = await countPage(M, { products: [NEW, OLD], state, used: false });
    await c.type(NEW.id, "7");
    const cPressed = c.pressed(NEW.id), cHint = hint(c, NEW.id);
    await c.submit();
    ok("first.unused", "وبعيادةٍ ما استعملت الوضع: لا اختيارَ مسبق ولا تلميح، والإرسالُ يطلب السبب",
      cPressed.length === 0 && !cHint && c.log.sends.length === 0 && c.log.toasts.includes(`error:«${NEW.name}» بيها فرق — اختر السبب`), J({ cPressed, cHint, toasts: c.log.toasts }));
    errors.push(...c.done());
    return errors;
  },

  /* ث) بطاقةُ «جرد البداية» (0266): لعيادةٍ استعملت الوضع وحدها، ولا تُسأل الشركاتُ بغيرها (open.hidden)؛ تقول كم باقي بلا عدٍّ ومنها كم
   *    رصيدُه ≤ ٠ (open.left)، وقائمةَ الشركات بعدد ما لم ينعدّ ولم يُعرض — وما شركتُه ما عادت بالقائمة «بدون شركة» (open.options)؛ واختيارُ
   *    شركة يضيف ٢٠٠ أقصى (open.add)، ما رصيدُه ≤ ٠ أوّلاً (open.order)، بشارة «ما انعدّت أبداً» (open.chip)، والباقي بالاختيار التالي
   *    (open.again)، و«بدون شركة» (open.none)؛ وما ينتظر الموافقة من العدّ لا السند ومعه «وافق هسه» (open.pending). */
  async opencard(M, ok) {
    const errors = [];
    const COS = [["co-a", "شركة ألف"], ["co-b", "شركة باء"], ["co-c", "شركة جيم"]].map(([id, name]) => ({ id, name, created_at: "2026-01-01T00:00:00Z" }));
    const pad = (i) => String(i).padStart(3, "0");
    // الموجبةُ أسماؤها أوّلاً بالأبجدية (a…) وما رصيدُه ≤ ٠ آخراً (z…): ترتيبٌ بالاسم وحده يُسقطه من أوّل ٢٠٠.
    const posA = Array.from({ length: 200 }, (_, i) => P(`p-oa-${pad(i)}`, `a${pad(i)}`, { stock: 2, company_id: "co-a" }));
    const nonA = Array.from({ length: 30 }, (_, i) => P(`p-oz-${pad(i)}`, `z${pad(i)}`, { stock: i % 2 ? -1 : 0, company_id: "co-a" }));
    const bs = [0, 1, 2].map((i) => P(`p-ob-${i}`, `b${i}`, { stock: 0, company_id: "co-b" }));
    const none = [P("p-on-0", "n0", { stock: 0, company_id: null }), P("p-on-1", "n1", { stock: 0 }), P("p-on-2", "n2", { stock: 0, company_id: "co-gone" })];
    const counted = [P("p-oc-0", "c0", { stock: 2, company_id: "co-a" }), P("p-oc-1", "c1", { stock: 2, company_id: "co-a" })];
    const products = [...posA, ...nonA, ...bs, ...none, ...counted];
    const state = new Map(counted.map((p) => [p.id, { lastCountedAt: "2026-09-01T08:00:00Z", lastDiffAt: null }]));
    const pending = [row({ id: "pc", product_id: counted[0].id, product_name: "c0", source: "count", system_qty: 2, counted_qty: 1 }),
      row({ id: "pw", product_id: counted[1].id, product_name: "c1", source: "waste", system_qty: 2, counted_qty: 1 })];
    const off = await countPage(M, { products, state, pending, used: false, companies: COS });
    ok("open.hidden", "بعيادةٍ ما استعملت البيعَ قبل الجرد: لا بطاقة ولا سؤالَ شركات", !off.h.one("data-count-open") && off.log.cos === 0, J({ cos: off.log.cos }));
    errors.push(...off.done());
    const pg = await countPage(M, { products, state, pending, used: true, companies: COS });
    const leftText = pg.h.text(pg.h.one("data-count-open-left"));
    ok("open.left", "«باقي 236 مادة ما انعدّت أبداً، منها 36 رصيدها صفر أو تحت الصفر» — القابلةُ للعدّ بلا سطرٍ بحالة العدّ",
      leftText === "باقي 236 مادة ما انعدّت أبداً، منها 36 رصيدها صفر أو تحت الصفر", leftText);
    const picks = pg.ids();
    const fromA = 230 - picks.filter((id) => id.startsWith("p-oa-") || id.startsWith("p-oz-")).length;
    ok("open.options", "قائمةُ الشركات: ما لها موادُّ لم تنعدّ ولم تُعرض بعددها — والتي بلا مواد تغيب، وما شركتُه ما عادت بالقائمة «بدون شركة»",
      J(pg.options()) === J(["أضف مواد شركة للعدّ", `شركة ألف (${fromA})`, "شركة باء (3)", "بدون شركة (3)"]), J({ options: pg.options(), picks }));
    const before = new Set(pg.ids());
    await pg.pickCo("co-a");
    const added = pg.ids().filter((id) => !before.has(id));
    ok("open.add", "اختيارُ «شركة ألف» يضيف ٢٠٠ أقصى من موادّها التي لم تنعدّ (لا المعدودة ولا المعروضة) ويقولها",
      added.length === 200 && added.every((id) => id.startsWith("p-oa-") || id.startsWith("p-oz-")) && pg.log.toasts.includes("success:انضافت 200 مادة للعدّ"),
      J({ n: added.length, toasts: pg.log.toasts }));
    ok("open.order", "وما رصيدُه صفر أو تحت الصفر أوّلاً — الثلاثون كلُّها قبل أيّ موجب",
      added.slice(0, 30).every((id) => id.startsWith("p-oz-")) && added.filter((id) => id.startsWith("p-oz-")).length === 30, J(added.slice(0, 32)));
    const chipText = added.length ? pg.textOf(added[0]) : "";
    ok("open.chip", "وشارتُها «ما انعدّت أبداً» لا «أضفتها بالبحث»", chipText.includes("ما انعدّت أبداً") && !chipText.includes("أضفتها بالبحث"), chipText);
    const before2 = new Set(pg.ids());
    await pg.pickCo("co-a");
    const again = pg.ids().filter((id) => !before2.has(id));
    ok("open.again", `واختيارُها ثانيةً يضيف الباقي (${fromA - 200}) — لا ما أُضيف قبل`,
      again.length === fromA - 200 && pg.log.toasts.at(-1) === `success:انضافت ${fromA - 200} مادة للعدّ`, J({ n: again.length, last: pg.log.toasts.at(-1) }));
    const before3 = new Set(pg.ids());
    await pg.pickCo("~none");
    const nn = pg.ids().filter((id) => !before3.has(id)).sort();
    ok("open.none", "و«بدون شركة» يضيف ما بلا شركة وما شركتُه ما عادت بالقائمة (n0، n1، n2)", J(nn) === J(none.map((p) => p.id).sort()), J(nn));
    const pend = pg.h.text(pg.h.one("data-count-open-pending"));
    await pg.tap("data-count-open-go");
    ok("open.pending", "وما ينتظر الموافقة من العدّ وحده (لا سند التلف): «1 عدّ ينتظر الموافقة…» و«وافق هسه» تفتح تبويبَها",
      pend.includes("1 عدّ ينتظر الموافقة — الرصيد ما يتصحّح قبلها") && globalThis.__url === "tab=pending", J({ pend, url: globalThis.__url }));
    errors.push(...pg.done());
    return errors;
  },

  /* خ) التوأمُ بالاسم (0266، CLAUDE.md §٣: رمزٌ ثانٍ لنفس المادّة): مادّتان قابلتان للعدّ بنفس الاسم بعد التطبيع (searchable: الهمزة) — عدُّ
   *    واحدةٍ يترك الأخرى برصيدها، فالسطرُ يقولها (twin.say). والمجمَّعةُ (حوضُ قسم) لا تُعدّ فلا تجعل مادّةً توأماً، والمنفردةُ بلا تلميح
   *    (twin.not). */
  async twin(M, ok) {
    const A1 = P("p-tw-1", "أموكسيسيلين", { stock: 3 }), A2 = P("p-tw-2", "اموكسيسيلين", { stock: 2 });
    const S1 = P("p-tw-3", "سرنجة ٥ مل", { stock: 4 }), S2 = P("p-tw-4", "سرنجة ٥ مل", { stock: 4, pooled: true });
    const M1 = P("p-tw-5", "ميترونيدازول", { stock: 1 });
    const pg = await countPage(M, { products: [A1, A2, S1, S2, M1] });
    const tw = (id) => within(pg.lineOf(id), "data-count-twin").length > 0;
    ok("twin.say", "توأمان بالاسم (أموكسيسيلين/اموكسيسيلين): كلُّ سطرٍ يقول «بالمخزن مادة ثانية بنفس الاسم — ادمجهن أول، أو اعدّ الاثنين»",
      tw(A1.id) && tw(A2.id) && pg.textOf(A1.id).includes("بالمخزن مادة ثانية بنفس الاسم — ادمجهن أول، أو اعدّ الاثنين"), J(pg.ids()));
    ok("twin.not", "والمجمَّعةُ لا تجعل «سرنجة ٥ مل» توأماً، والمنفردةُ بلا تلميح", !!pg.lineOf(S1.id) && !tw(S1.id) && !!pg.lineOf(M1.id) && !tw(M1.id), J(pg.ids()));
    return pg.done();
  },
};

/* الفحوصُ الجديدة بهذه الجولة (ui2) ← سيناريوها: كلٌّ يجب أن يسقط على الشِّفرة القديمة (WASTE_TAB_SRC / STOCK_COUNT_SRC).
 * وحارسُ الرجوع today.zeroAvg يمرّ عليها عمداً: معاينةُ العدّ بالمتوسّط صحّت بالجولة الأولى — طفرتُه وحدها تُثبت أنه يحرس. */
const NEW_KEYS = {
  "batch.fill": "batch", "batch.second": "batch", "batch.relink": "batch", "batch.bad": "batch", "batch.src": "src", "batch.drop": "src",
  "already.batch": "already", "already.other": "already", "already.inv": "already", "already.all": "already",
  "shape.moves": "shape", "shape.now": "shape", "shape.waste": "shape", "shape.retry": "shape",
  "code.case": "code", "code.partial": "code", "count.code": "code", "color.waste": "colors", "color.withdraw": "colors",
};
/* فحوصُ تدقيق الجولة (fix2) ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة ui2 قبل التصليح (`WASTE_OLD=fix2` ونسختُها
 * بـWASTE_TAB_SRC) — وعلى ما قبل ui2 كذلك. batch.bad تغيّر حكمُه: قائمةٌ تالفة مجهولٌ لا «ماكو مواد رجعت». */
const FIX2_KEYS = { "batch.bad": "batch", "batch.unmatched": "batch", "already.whole": "already", "already.twins": "already", "shape.items": "shape", "shape.qty": "shape" };
/* فحوصُ الدفعات المتعدّدة (multi) ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة ui2 بعد تدقيقها (`WASTE_OLD=multi`: دفعةٌ واحدة
 * batch_us تُحفظ، أحدثُها) — وعلى كلّ ما قبلها كذلك. batch.src تغيّر حكمُه: الدفعاتُ كلُّها لا أحدثُها. */
const MULTI_KEYS = { "batch.src": "src", "already.multi": "already", "shape.batches": "shape" };
/* فحوصُ التدقيق العدائيّ w5a ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة multi بعد تدقيقها (`WASTE_OLD=w5a`) — وعلى كلّ ما قبلها
 * كذلك. ومعها فحوصٌ قديمة تغيّر حكمُها: السالبُ بوحدة المخزون (mgr.neg، staff.will، will.half، page.negs)، و«بالكلفة» لا
 * «بمتوسط الكلفة» (pend.label، report.dead)، وسطرُ السحب بمفتاحه الجديد (color.withdraw). */
const W5A_KEYS = {
  "pick.more": "more", "pick.exact": "more", "fill.held": "head", "fill.mixed": "head", "page.pin": "pin", "neg.unit": "negunit",
  "mgr.neg": "over", "staff.will": "staff", "will.half": "willzero", "page.negs": "page", "sep.en": "sep", "cards.date": "dates",
  "pend.label": "pend", "report.dead": "report", "color.withdraw": "colors", "race.src": "race", "race.empty": "race", "race.retry": "race",
  "race.stale": "race", "hold.prefill": "hold", "hold.pick": "hold",
};
/* فحوصُ ui3 ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة w5a بعد دمجها (`WASTE_OLD=ui3`) — وعلى كلّ ما قبلها كذلك: صاحبُ العيادة
 * باسم دوره، وعدُّ الدفعات بالضبط (والرصيدُ العائمُ بمنازل عموده: صاعداً ونازلاً، والنصفُ بعيداً عن الصفر)، وتعليقُ countError صادق.
 * noisyDown وtie أضافهما تدقيقُ ui3 (ui3f) ليحرسا تقريبَ الرصيد (at3) — يمرّان على شِفرة ui3 قبل التدقيق، وطفرتا القطع والنصفِ نحو
 * الصفر تُثبتان أنهما يحرسان؛ ويسقطان على w5a (العائمُ «زايدة»). */
const UI3_KEYS = { "cons.owner": "owner", "count.lotSum": "lots", "count.lotSent": "lots", "count.noisyStock": "lots", "count.noisyDown": "lots", "count.tie": "lots", "errs.doc": "errs" };
/* فحوصُ تدقيق ui3 (ui3f) ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة ui3 قبل تدقيقها (`WASTE_OLD=ui3f`) — وعلى كلّ ما قبلها كذلك: العددُ
 * الأدقّ من ثلاث منازل يُقال ويُرفض (حكمٌ تغيّر: count.subMilli «يُسأل سببُه» صار count.fineLots)، ووحدةُ العدّ حيث تلتبس، وتعليقُ
 * countError لا ينسب الرفضَ بلا تلميح لخادمٍ أقدم (errs.doc بالقائمتين). */
const UI3F_KEYS = { "count.fineLots": "fine", "count.fineOne": "fine", "count.unit": "units", "count.unitPending": "punit", "errs.doc": "errs" };
/* فحوصُ r3 ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة ui3 بعد تدقيقها ودمجها (`WASTE_OLD=r3`) — وعلى كلّ ما قبلها كذلك: رفضُ
 * waste_source_taken يعيد قراءةَ الفاتورة ويشيل ما سُجّل بقاعدة التعبئة ويقوله، والباقي «ما انسجل بعد» ويُرسَل وحده، والصفحةُ تُعاد. */
const R3_KEYS = {
  "taken.reread": "taken", "taken.drop": "taken", "taken.say": "taken", "taken.left": "taken", "taken.reload": "taken", "taken.resend": "taken",
  "taken.cleared": "taken", "taken.inv": "taken", "taken.whole": "taken", "taken.batch": "taken", "taken.empty": "taken", "taken.race": "taken", "taken.kept": "taken",
  // والاسمُ الطويل يلتفّ بملاحظة الشيل وببطاقة التعبئة وبملاحظة ?p= (مقيسٌ بالمتصفّح على ٣٧٥: البطاقةُ بلا لفٍّ كانت تمرّر الصفحة)
  "wrap.taken": "taken", "wrap.fill": "taken", "wrap.pick": "taken",
};
/* فحوصُ تدقيق r3 (r3f) ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة r3 قبل تدقيقها (`WASTE_OLD=r3f`) — وعلى كلّ ما قبلها كذلك: الحكمُ بقاعدة
 * الخادم (رابطٌ قديم وتعديلٌ بعد التعبئة: كانت المادّةُ تبقى وتُرفض للأبد)، وسندٌ أفرغته القراءةُ يُشال رابطُه، و«الباقي» عن سطور السند
 * المرفوض وحدها، والملاحظةُ تغيب برابطٍ آخر أو بإفراغ صاحب السند له. */
const R3F_KEYS = { "taken.relink": "taken", "taken.emptied": "taken", "taken.leftOnly": "taken", "taken.nextLink": "taken", "taken.handEmpty": "taken", "taken.leftRace": "taken" };
/* فحوصُ البيع قبل الجرد (0266) ← سيناريوها: كلٌّ يجب أن يسقط على شِفرة الجرد قبلها (`WASTE_OLD=neg` ونسختُها بـSTOCK_COUNT_SRC) — وعلى
 * كلّ ما قبلها كذلك: ما رآه العادّ (seen) طازجاً ومجمَّداً ومرسَلاً، وcount_moved يمسح ما تحرّك وحده ويُعيد السؤال، والإرسالُ دفعاتٌ تقف عند
 * أوّل فشل، و«خطأ إدخال» لأوّل عدٍّ بعيادةٍ استعملت الوضع، وبطاقةُ «جرد البداية»، والتوأمُ بالاسم. */
const NEG_KEYS = {
  "seen.base": "seen", "seen.frozen": "seen", "seen.sent": "seen", "seen.fallback": "seen", "seen.wait": "seenwait",
  "moved.only": "moved", "moved.toast": "moved", "moved.reload": "moved", "moved.recount": "moved",
  "chunk.sizes": "chunks", "chunk.saved": "chunks", "chunk.stop": "chunkfail", "chunk.partial": "chunkfail", "chunk.left": "chunkfail", "chunk.retry": "chunkfail",
  "first.pre": "first", "first.sent": "first", "first.change": "first", "first.rejected": "first", "first.rejectedFallback": "first", "first.pendingNot": "first",
  "open.left": "opencard", "open.options": "opencard", "open.add": "opencard", "open.order": "opencard", "open.chip": "opencard",
  "open.again": "opencard", "open.none": "opencard", "open.pending": "opencard",
  "twin.say": "twin",
};
/* حرّاسُ رجوعٍ تمرّ على القديم عمداً — القديمُ صحيحٌ فيها، والتصليحُ لا يكسرها (طفراتُها تُثبت أنها تحرس): متوسّطٌ صفر، ومن لا
 * صلاحيةَ له لا يُركَّب له السند، وتعبئةٌ عُدّلت أو شيل منها سطرٌ والرابطُ باقٍ أو بقيت بعد شيله تمسك. ومن ui3: الموظّفُ باسمه والمشغّلُ
 * والخادمُ الأقدم «موظف»، والفرقُ الحقيقيّ يُسأل باتجاهيه (نقصاً وزيادةً)، ورفضُ الجرد بتلميحه وبترجمة رمزه؛ ومن ui3f: المادةُ البسيطة
 * بلا كلمة وحدة. */
const REGRESSION_KEYS = { "today.zeroAvg": "today", "page.pin.never": "pin", "hold.edit": "hold", "hold.remove": "hold", "hold.after": "hold",
  "cons.staff": "owner", "cons.operator": "owner", "cons.oldServer": "owner", "count.lotReal": "lots", "count.lotGain": "lots",
  "errs.hintAr": "errs", "errs.codeEn": "errs", "errs.codeOnly": "errs", "count.unitPlain": "units",
  /* ومن r3: الرفضُ يُقال بتلميحه، وقراءةٌ فشلت أو ناقصة أو لا تقول شيئاً مسجّلاً لا تشيل شيئاً — القديمُ لا يشيل أصلاً فيمرّ فيها،
     وطفراتُها (الشيلُ بالتخمين، والجوابُ الناقص يُحكم به) تُثبت أنها تحرس. */
  "taken.hint": "taken", "taken.readFail": "taken", "taken.shape": "taken", "taken.none": "taken",
  /* ومن r3f: سطرُ فاتورةٍ ثانية لا يُحكم بسجلّ الأولى، والقراءةُ العالقة تفكّ القفلَ بمهلتها، وسندُ الفاتورة كلِّها بحدّ المللي — شِفرةُ r3
     صحيحةٌ فيها فتمرّ، وطفراتُها (حذفُ فحص الفاتورة، حذفُ المهلة، والحدُّ بلا وقت أو بـ<) تُثبت أنها تحرس. ورابطٌ تعبئتُه بالطريق لا يشيله
     إفراغُ القراءة (حدُّ تصليح r3f نفسِه: r3 لا تشيل رابطاً أصلاً، وطفرتُه تُثبت أنه يحرس). */
  "taken.twoInv": "taken", "taken.wait": "taken", "taken.wholeEdge": "taken", "taken.emptyLoading": "taken",
  /* ومن 0266: ما لا يفعله القديمُ أصلاً فيمرّ عليه — لا اختيارَ مسبق لمادّةٍ انعدّت ولا بعيادةٍ ما استعملت الوضع، ولا بطاقة، ولا توأمٌ
     من مجمَّعة — وطفراتُها (التسرّبُ لهما، والبطاقةُ للكلّ، والمجمَّعةُ توأماً) تُثبت أنها تحرس. */
  "first.counted": "first", "first.unused": "first", "open.hidden": "opencard", "twin.not": "twin" };
/** ما يجب أن يسقط على «القديم»: بعد ui2 كلُّ ما أُضيف منذها، وبعد fix2 ما أضافه التصليحُ وما بعده، وبعد multi ما
 *  أضافته الدفعاتُ المتعدّدة وما بعدها، وبعد w5a ما أضافه تدقيقُها وما بعده، وبعد ui3 ما أضافته وتدقيقُها، وبعد ui3f ما أضافه
 *  تدقيقُها وما بعده، وبعد r3 ما أضافه تدقيقُها وحده (والباقي يمرّ). */
const ROUND = process.env.WASTE_OLD || "ui2";
if (!["ui2", "fix2", "multi", "w5a", "ui3", "ui3f", "r3", "r3f", "neg"].includes(ROUND)) throw new Error(`WASTE_OLD: ui2 أو fix2 أو multi أو w5a أو ui3 أو ui3f أو r3 أو r3f أو neg — لا «${ROUND}»`);
const MUST_FAIL = ROUND === "neg" ? NEG_KEYS : ROUND === "r3f" ? { ...R3F_KEYS, ...NEG_KEYS } : ROUND === "r3" ? { ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : ROUND === "ui3f" ? { ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : ROUND === "ui3" ? { ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : ROUND === "w5a" ? { ...W5A_KEYS, ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : ROUND === "multi" ? { ...MULTI_KEYS, ...W5A_KEYS, ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : ROUND === "fix2" ? { ...FIX2_KEYS, ...MULTI_KEYS, ...W5A_KEYS, ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS }
  : { ...NEW_KEYS, ...FIX2_KEYS, ...MULTI_KEYS, ...W5A_KEYS, ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS };

/** يشغّل السيناريوهات المسمّاة على حزمةٍ — ويرجع نتيجةَ كلّ مفتاح **وسيناريوه**. خطأُ رسمٍ أو رميةٌ تُسقط
 *  السيناريو كلَّه. واسمٌ لا سيناريو له يرمي هنا: كان المشغّلُ يختار السيناريو ببادئة المفتاح (ref.retry ←
 *  «ref»، ولا سيناريو بها)، فيرمي النداءُ نفسُه وتُعدّ الرميةُ «إمساكاً» — طفرةٌ لا تغيّر حرفاً كانت تمرّ خضراء. */
async function runAll(M, names = Object.keys(SCENARIOS)) {
  const out = [];
  for (const name of names) {
    if (typeof SCENARIOS[name] !== "function") throw new Error(`لا سيناريو باسم «${name}»`);
    const mine = [];
    const ok = (key, label, cond, detail = "") => mine.push({ key, scenario: name, label, ok: !!cond, detail });
    // بابُ الوضع افتراضيٌّ لكلّ سيناريو (عيادةٌ ما استعملته) — بابٌ مزيَّفٌ تركه سيناريو رمى قبل نهايته لا يصل غيرَه.
    globalThis.__neg = undefined;
    try {
      const errors = await SCENARIOS[name](M, ok);
      if (errors?.length) mine.push({ key: `${name}.render`, scenario: name, label: `${name}: بلا خطأ رسم`, ok: false, detail: errors.map(String).join(" | ") });
    } catch (e) {
      mine.push({ key: `${name}.threw`, scenario: name, label: `${name}: رمى`, ok: false, detail: String(e?.stack ?? e).split("\n").slice(0, 4).join(" ") });
    }
    out.push(...mine);
  }
  return out;
}

let fails = 0, passes = 0;
const say = (good, label, detail = "") => {
  if (good) { passes++; console.log(`   ✓ ${label}`); } else { fails++; console.error(`   ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

console.log(OLD ? "▸ ك) الشِّفرةُ القديمة (المصدرُ البديل)" : "▸ أ–ي) الشِّفرةُ الحقيقية");
const real = await build();
const results = await runAll(real);
for (const r of results) say(r.ok, r.label, r.detail);
const keys = new Set(results.map((r) => r.key));
/** المفتاحُ ← السيناريو الذي كتبه بالتشغيل الحقيقيّ (لا بادئةُ اسمه: ref.retry وmgr.* من سيناريو over). */
const scenarioOf = new Map(results.map((r) => [r.key, r.scenario]));

if (OLD) {
  /* ك) كلُّ فحصٍ جديد يسقط على القديم: فحصُه نفسُه، أو لم يُبلَغ لأن **سيناريوه** سقط قبله (قاعدةُ الطفرات نفسها). والقديمةُ
   *    تُطبع كما هي (يجب أن تمرّ: لم يتغيّر فيها إلا أنّ أجوبتها تحمل العقدَ الجديد)، ولا طفرات: نصوصُها نصوصُ الجديد. */
  const caughtOn = (k, scen) => results.some((r) => r.key === k && !r.ok) || (!results.some((r) => r.key === k) && results.some((r) => !r.ok && r.scenario === scen));
  const since = ["ui2", "fix2", "multi", "w5a", "ui3", "ui3f", "r3", "r3f", "neg"];
  console.log(`▸ ك) الفحوصُ الجديدة (${since.slice(since.indexOf(ROUND)).join(" و")}) على الشِّفرة القديمة — كلٌّ يجب أن يسقط`);
  let missed = 0;
  for (const [k, scen] of Object.entries(MUST_FAIL)) { const c = caughtOn(k, scen); if (!c) missed++; console.log(`   ${c ? "✓" : "✗"} ${k}: ${c ? "يسقط على القديم" : "يمرّ على القديم — لا يحرس التغيير"}`); }
  for (const [k, scen] of Object.entries(REGRESSION_KEYS)) console.log(`   ℹ ${k} (حارسُ رجوع): ${caughtOn(k, scen) ? "يسقط" : "يمرّ — القديمُ صحيحٌ فيه، وطفرتُه تُثبت أنه يحرس"}`);
  const oldKeys = results.filter((r) => !(r.key in MUST_FAIL) && !(r.key in REGRESSION_KEYS));
  const oldBad = oldKeys.filter((r) => !r.ok);
  console.log(`   الفحوصُ القديمة على القديم: ${oldKeys.length - oldBad.length}/${oldKeys.length} تمرّ${oldBad.length ? ` — سقطت: ${oldBad.map((r) => r.key).join(", ")}` : ""}`);
  console.log(missed || oldBad.length ? `\n✗ waste-tab-test (قديم): ${missed} فحصاً جديداً يمرّ، و${oldBad.length} قديماً يسقط` : `\n✓ waste-tab-test (قديم): كلُّ الفحوص الجديدة (${Object.keys(MUST_FAIL).length}) تسقط، وكلُّ القديمة (${oldKeys.length}) تمرّ`);
  process.exit(missed || oldBad.length ? 1 : 0);
}
// قائمةُ الجديد تسمّي فحوصاً موجودة بسيناريوهاتها — لا مفتاحَ قديمَ الاسم يُعدّ «ساقطاً على القديم» لأنه غائب.
const stale = Object.entries({ ...NEW_KEYS, ...FIX2_KEYS, ...MULTI_KEYS, ...W5A_KEYS, ...UI3_KEYS, ...UI3F_KEYS, ...R3_KEYS, ...R3F_KEYS, ...NEG_KEYS, ...REGRESSION_KEYS }).filter(([k, scen]) => scenarioOf.get(k) !== scen).map(([k]) => k);
say(stale.length === 0, `NEW_KEYS (${Object.keys(NEW_KEYS).length}) وFIX2_KEYS (${Object.keys(FIX2_KEYS).length}) وMULTI_KEYS (${Object.keys(MULTI_KEYS).length}) وW5A_KEYS (${Object.keys(W5A_KEYS).length}) وUI3_KEYS (${Object.keys(UI3_KEYS).length}) وUI3F_KEYS (${Object.keys(UI3F_KEYS).length}) وR3_KEYS (${Object.keys(R3_KEYS).length}) وR3F_KEYS (${Object.keys(R3F_KEYS).length}) وNEG_KEYS (${Object.keys(NEG_KEYS).length}) وREGRESSION_KEYS فحوصٌ موجودة بسيناريوهاتها`, stale.join(","));

/* ط) الطفرات: كلُّ واحدةٍ تكسر ما يحرسه فحصٌ مسمّى — ويجب أن يسقط. */
const MUTANTS = [
  { file: W, from: "useEffect(() => (dirty ? holdUpdates(Infinity) : undefined), [dirty]);", to: "useEffect(() => undefined, [dirty]);", breaks: ["over.hold"], why: "لا إمساك" },
  { file: W, from: "if (over.length) { playWarning(); return; }", to: "if (over.length && false) { playWarning(); return; }", breaks: ["over.first"], why: "بلا سؤالٍ قبل الإرسال" },
  { file: W, from: "...(ack ? { ack_over: true } : {}),", to: "", breaks: ["over.second"], why: "التأكيدُ لا يُرسل" },
  { file: W, from: 'if (code === "waste_exceeds_stock") setAsked(new Set(lines.map((x) => x.id)));\n      if (/^waste_(exceeds_stock|already_pending|product_missing|source_taken)$/.test(code)) void onChanged();', to: "", breaks: ["over.server"], why: "رفضُ الخادم لا يعيد التحميل" },
  { file: W, from: "const ref = (refRef.current ??= newRef());", to: "const ref = newRef();", breaks: ["ref.retry"], why: "مرجعٌ جديد لكلّ إعادة" },
  { file: W, from: "      refRef.current = null;\n      setDone({ r: res, sent });", to: "      setDone({ r: res, sent });", breaks: ["ref.fresh"], why: "مرجعُ السند السابق للسند التالي" },
  { file: W, from: "consumptionApi.submitWaste(payload, isManager, ref)", to: "consumptionApi.submitWaste(payload, true, ref)", breaks: ["staff.apply"], why: "غيرُ المدير يطبّق" },
  { file: W, from: '{isManager ? t("cnt.waste.apply", "سجّل وطبّق") : t("cnt.waste.send", "أرسل للمدير")}', to: '{t("cnt.waste.apply", "سجّل وطبّق")}', breaks: ["staff.button"], why: "زرٌّ واحدٌ للكلّ" },
  { file: W, from: "const lossText = loss ? t(", to: "const lossText = false ? t(", breaks: ["mgr.result"], why: "الخسارةُ لا تُقال" },
  { file: W, from: "{(dec.negatives ?? []).map((n) => (", to: "{([] as StockNegative[]).map((n) => (", breaks: ["mgr.neg"], why: "السالبُ لا يُقال" },
  { file: W, from: "{rows.filter(({ l }) => Number.isFinite(Number(l.stock_after)) && roundScaled(Number(l.stock_after), 3) < 0n).map(({ l }) => (", to: "{rows.filter(() => false).map(({ l }) => (", breaks: ["staff.will", "will.half"], why: "ما سينزل تحت الصفر لا يُقال" },
  { file: W, from: "{rows.filter(({ l }) => Number.isFinite(Number(l.stock_after)) && roundScaled(Number(l.stock_after), 3) < 0n).map(({ l }) => (", to: "{rows.filter(({ l }) => Number(l.stock_after) < 0).map(({ l }) => (", breaks: ["will.zero"], why: "«راح يصير −0» عمّا دون منزلة الرصيد" },
  { file: W, from: 'const relink = s.source === "relink";', to: "const relink = false;", breaks: ["relink.edit", "relink.refund", "relink.same"], why: "التعبئةُ تجمع restored_qty وحده (موادُّ كلِّ سطرٍ مرّ بتعديل)" },
  { file: W, from: 'if (!entry) { setFill({ ...base, st: "unknown" }); return; }', to: "", breaks: ["inv.unknown"], why: "فاتورةٌ مجهولة تُقال «ماكو مواد رجعت»" },
  { file: W, from: "const key = map[id] ? id : id.toLowerCase();", to: "const key = id;", breaks: ["inv.case"], why: "معرّفٌ بحروفٍ كبيرة لا يلقى فاتورتَه" },
  { file: W, from: "setLines((cur) => cur.filter((x) => !recorded.has(x.id)));", to: "setLines([]);", breaks: ["inflight.keep", "replay.keep"], why: "النجاحُ يمسح ما لم يُرسل" },
  { file: W, from: "{p && showCost && stockUnitCost(p) === 0n && <p", to: "{p && showCost && false && <p", breaks: ["zero.line"], why: "الكلفةُ الصفر بلا كلمة" },
  { file: W, from: "const zero = rs.filter((x) => showCost && x.s?.zero);", to: "const zero = rs.filter(() => false);", breaks: ["zero.result"], why: "النتيجةُ تخفي الكلفةَ الصفر" },
  { file: W, from: "const asSub = upb !== null && (g.sub || g.r % 1_000_000n !== 0n);", to: "const asSub = false;", breaks: ["inv.lines"], why: "التعبئةُ بالعلبة" },
  { file: W, from: "else { g.r += r; g.sub ||= s.unit === \"sub\"; }", to: "else { g.r = r; g.sub ||= s.unit === \"sub\"; }", breaks: ["inv.lines", "inv.exact"], why: "مواصفتان لمادةٍ لا تُجمعان" },
  { file: W, from: "if (!p) { skipped.push({ name: g.name, why: \"gone\" }); continue; }", to: "if (!p) { continue; }", breaks: ["inv.skip"], why: "المحذوفةُ تسقط بصمت" },
  { file: W, from: '    } catch {\n      setFill({ ...base, st: "error" });', to: '    } catch {\n      setFill({ ...base, st: "done" });', breaks: ["fail.retry"], why: "الفشلُ يُقال «ماكو»" },
  { file: W, from: "else { setPickNote(null); add(p); }", to: "else { setPickNote(null); }", breaks: ["pick.add"], why: "?p= لا يختار" },
  { file: W, from: "if (!next.length) { refRef.current = null; setAsked(new Set()); dropParams(); }", to: "if (!next.length) { refRef.current = null; setAsked(new Set()); }", breaks: ["pick.clear"], why: "المسحُ يُبقي p بالعنوان" },
  { file: W, from: "else if (!countable(p)) setPickNote(", to: "else if (false) setPickNote(", breaks: ["pick.pooled"], why: "مادةُ الحوض تُضاف" },
  { file: W, from: 'catch { if (my === seq.current) setRes("error"); }', to: "catch { if (my === seq.current) setRes({ products: [], short_products: 0, overrides: { count: 0, recent: [] }, unconsumed: { old_device: 0, service_missing: 0, recent: [] } }); }", breaks: ["cards.fail", "cards.nozero"], why: "فشلُ التقرير أصفار" },
  { file: W, from: "{showCost ? t(\"cnt.cons.used\"", to: "{true ? t(\"cnt.cons.used\"", breaks: ["cards.nocost"], why: "المبلغُ لمن لا يرى الكلفة" },
  { file: S, from: "const applied = (r: CountRow) => r.counted_qty - r.system_qty;", to: "const applied = (r: CountRow) => { const cur = Number(stockOf(r.product_id) ?? r.system_qty) || 0; return Math.max(0, cur + (r.counted_qty - r.system_qty)) - cur; };", breaks: ["pend.noclamp"], why: "الحصرُ القديم" },
  { file: S, from: 'const waste = r.source === "waste";', to: "const waste = false;", breaks: ["pend.chip", "pend.line"], why: "السندُ يُعرض جرداً" },
  { file: S, from: 'return r.source !== "waste" && cur !== undefined', to: "return cur !== undefined", breaks: ["pend.changed"], why: "السندُ «تغيّر من وقت العدّ»" },
  { file: S, from: "onNegatives(approve ? ((r as CountDecision & { negatives?: CountNegative[] }).negatives ?? []) : []);", to: "onNegatives([]);", breaks: ["pend.negs", "page.negs"], why: "السالبُ بعد الموافقة لا يُقال" },
  { file: S, from: 'const wasteBox = (wasteSeen || (tab === "waste" && allowed)) && (', to: 'const wasteBox = tab === "waste" && allowed && (', breaks: ["page.keep", "page.pin"], why: "السندُ يضيع بتبديل التبويب (وبانتهاء الرفع)" },
  { file: S, from: "const unitCostOf = (p: Product): number => Math.max(Number(p.avg_cost ?? p.purchase_price ?? 0) || 0, 0);", to: "const unitCostOf = (p: Product): number => Math.max(Number(p.purchase_price) || 0, 0);", breaks: ["today.money"], why: "معاينةُ العدّ بسعر الشراء والخادمُ يلقط المتوسّط" },
  { file: S, from: 't("cnt.neg.withdrawCost", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بالكلفة، ما يطلع من القاصة):" })', to: 't("cnt.willWithdraw", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بسعر الشراء، ما يطلع من القاصة):" })', breaks: ["pend.label"], why: "السحبُ «بسعر الشراء» ومادتُه بالمتوسّط" },
  { file: S, from: 't("cnt.neg.withdrawCost", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بالكلفة، ما يطلع من القاصة):" })', to: 't("cnt.neg.willWithdraw", { v: money(withdrawTotal), defaultValue: "وينسجل سحب من المخزن اليوم بقيمة {{v}} (بمتوسط الكلفة، ما يطلع من القاصة):" })', breaks: ["pend.label"], why: "السحبُ «بمتوسط الكلفة» ومادتُه بلا متوسّط (يومَ نشر 0255 كلُّ الرفّ)" },
  { file: S, from: 'c.source === "waste" && c.entered_qty != null ?', to: "false ?", breaks: ["report.waste"], why: "السندُ المعتمد بفرقه بالعلبة («−0»)" },
  { file: S, from: 't("cnt.neg.deadCost", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بالكلفة" })', to: 't("cnt.deadCount", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بسعر الشراء" })', breaks: ["report.dead"], why: "الراكدُ «بسعر الشراء» ومادتُه بالمتوسّط" },
  { file: S, from: 't("cnt.neg.deadCost", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بالكلفة" })', to: 't("cnt.neg.deadCount", { n: formatNum(dead.length), defaultValue: "{{n}} مادة — بمتوسط الكلفة" })', breaks: ["report.dead"], why: "الراكدُ «بمتوسط الكلفة» وموادُّه بلا متوسّط" },
  /* ي) ui2 — كلُّ طفرةٍ تعيد قطعةً من الشِّفرة القديمة (أو خطأً قريباً منها) ويجب أن يُسقطها فحصُها. */
  { file: W, from: "if (!batches.has(at)) continue;", to: "", breaks: ["batch.fill", "batch.second", "batch.relink"], why: "أحداثُ كلّ الدفعات تُجمع لا دفعةُ الفعل" },
  // (fix2: قائمةٌ تالفة صار يحرسها inLedger قبل التخطيط — فبابُها batch.bad بطفرته أدناه، لا هنا)
  { file: W, from: "key, batches);", to: "key, null);", breaks: ["batch.fill", "batch.second", "batch.relink"], why: "رابطٌ بدفعاته يُعبّأ تراكمياً (restored_qty) كالقديم" },
  { file: W, from: "return new Set(xs.every((x) => /^\\d{1,16}$/.test(x)) ? xs.map(Number) : []);", to: "return xs.every((x) => /^\\d{1,16}$/.test(x)) ? new Set(xs.map(Number)) : null;", breaks: ["batch.bad"], why: "قائمةُ دفعاتٍ تالفة ترجع للتراكميّ" },
  { file: W, from: "...(d.src ? { src_invoice: d.src.inv, ...(d.src.batches ? { src_batches: d.src.batches } : {}) } : {}),", to: "", breaks: ["batch.src"], why: "السطرُ المعبّأ لا يحمل مرجعَه للخادم" },
  { file: W, from: ".map(([at]) => at).sort((a, b) => a - b);", to: ".map(([at]) => at).sort((a, b) => a - b).slice(-1);", breaks: ["batch.src"], why: "أحدثُ دفعةٍ وحدها (ما قبل multi): رابطٌ لاحق بالأقدم يعبّيها ثانيةً" },
  { file: W, from: ".map(([at]) => at).sort((a, b) => a - b);", to: ".map(([at]) => at).sort((a, b) => b - a);", breaks: ["batch.src"], why: "الدفعاتُ تنازلياً لا تصاعدياً" },
  { file: W, from: "src: { inv, batches: mine.length ? mine : null } });", to: "src: { inv, batches: batches ? [...batches].sort((a, b) => a - b) : null } });", breaks: ["batch.src"], why: "كلُّ دفعات الرابط ولو لم ترجع فيها المادة" },
  { file: W, from: 'n.delete("inv"); n.delete("at"); n.delete("p");', to: 'n.delete("inv"); n.delete("p");', breaks: ["batch.drop"], why: "at يبقى بالعنوان بعد الإرسال" },
  { file: W, from: "if (w) { already.push({ id, name: p?.name ?? g.name, at: w.counted_at, inv: fromInv }); continue; }", to: "", breaks: ["already.batch", "already.inv", "already.all"], why: "ما سُجّل هدراً يُعبّأ ثانيةً" },
  { file: W, from: "    if (batches && !(w.batches !== null && w.batches.some((b) => batches.has(Number(b))))) {", to: "    if (false) {", breaks: ["already.other"], why: "سطرٌ من دفعةٍ أخرى يمنع تعبئةَ هذا الترجيع" },
  { file: W, from: "w.batches.some((b) => batches.has(Number(b)))", to: "batches.has(Number(w.batches[w.batches.length - 1]))", breaks: ["already.multi"], why: "سطرٌ من دفعتين يُرى بأحدثهما وحدها" },
  { file: W, from: "(Array.isArray(w.batches) && w.batches.length > 0 && w.batches.every(num))", to: "Array.isArray(w.batches)", breaks: ["shape.batches"], why: "سطرُ هدرٍ دفعاتُه فارغة يمرّ كأنه كامل" },
  { file: W, from: "if (!w.product_id) continue;", to: 'if (!w.product_id || w.status !== "approved") continue;', breaks: ["already.batch"], why: "المعلَّقُ لا يُعدّ — يُعبّأ ما أُرسل للمدير" },
  { file: W, from: ': fill.already.length > 0 ? "all" : "empty";', to: ': "empty";', breaks: ["already.all"], why: "الفاتورةُ المسجّلةُ كلُّها تُقال «ماكو رجع»" },
  { file: W, from: '{head !== "all" && fill.already.map((a, i) =>', to: "{false && fill.already.map((a, i) =>", breaks: ["already.batch", "already.inv", "fill.mixed"], why: "ما سُجّل فلم يُعبّأ لا يُقال باسمه" },
  { file: W, from: 'return a.inv ? t("cnt.waste.alreadyInv"', to: 'return !a.inv ? t("cnt.waste.alreadyInv"', breaks: ["already.batch", "already.inv"], why: "«لهالترجيع» و«من هالفاتورة» متبادلان" },
  { file: W, from: 'if (!shaped(entry)) { setFill({ ...base, st: "error" }); return; }', to: "", breaks: ["shape.moves", "shape.now", "shape.waste", "shape.retry"], why: "جوابٌ بلا العقد الجديد يُعبّأ كأنه كامل" },
  { file: W, from: "return num(e.now_us) && Array.isArray(e.waste)", to: "return Array.isArray(e.waste)", breaks: ["shape.now"], why: "now_us الغائب يمرّ" },
  { file: W, from: "    const byCode = codeMatcher(q);\n    const all = products.filter(", to: '    const byCode = (p: Product) => [p.barcode, ...(p.alt_codes ?? [])].some((a) => (a ?? "").trim() === q.trim());\n    const all = products.filter(', breaks: ["code.case", "code.partial"], why: "السندُ يبحث بالرمز === بلا طيّ ولا جزء" },
  { file: S, from: "    const byCode = codeMatcher(q);\n    return ready.products.filter(", to: '    const byCode = (p: Product) => [p.barcode, ...(p.alt_codes ?? [])].some((a) => (a ?? "").trim() === q.trim());\n    return ready.products.filter(', breaks: ["count.code"], why: "عدُّ اليوم يبحث بالرمز === بلا طيّ ولا جزء" },
  { file: W, from: 'text-warn-700 dark:text-warn-200" data-waste-will>', to: 'text-warn-800 dark:text-warn-200" data-waste-will>', breaks: ["color.waste"], why: "لونٌ فوق 700 بالسند (لا CSS له)" },
  { file: S, from: '<p className="font-bold text-warn-700 dark:text-warn-200">{t("cnt.neg.withdrawCost"', to: '<p className="font-bold text-warn-800 dark:text-warn-200">{t("cnt.neg.withdrawCost"', breaks: ["color.withdraw"], why: "سطرُ السحب بلونٍ فوق 700" },
  { file: S, from: "Math.max(Number(p.avg_cost ?? p.purchase_price ?? 0) || 0, 0)", to: "Math.max(Number(p.avg_cost || p.purchase_price || 0) || 0, 0)", breaks: ["today.zeroAvg"], why: "متوسّطٌ صفر «مجهول» يتبع سعرَ الشراء (nullif لا coalesce)" },
  { file: S, from: "{!restricted && unitCostOf(p) > 0 && <>", to: "{!restricted && <>", breaks: ["today.zeroAvg"], why: "مبلغُ فرقٍ صفر يُقال (بلا حارس > 0)" },
  /* fix2 — كلُّ طفرةٍ تعيد شِفرةَ ui2 قبل التصليح (أو خطأً قريباً منه) ويجب أن يُسقطها فحصُها. */
  { file: W, from: "    && !!items && typeof items === \"object\" && !Array.isArray(items)\n    && Object.values(e.items).every(", to: "    && Object.values(e.items ?? {}).every(", breaks: ["shape.items"], why: "جوابٌ بلا items يُقال «ماكو مواد رجعت»" },
  { file: W, from: "specs.every((s) => !!s && num(s.live_qty) && num(s.restored_qty) && ", to: "specs.every((s) => !!s && ", breaks: ["shape.qty"], why: "مواصفةٌ بلا restored_qty/live_qty تُعدّ صفراً" },
  { file: W, from: "      if (w.batches === null && msOf(w) >= msOf(whole.get(k) ?? w)) whole.set(k, w);\n", to: "", breaks: ["already.whole"], why: "سندُ الفاتورة كلِّها لا يمنع دفعةً سبقته (يُعبّأ ما شُطب)" },
  { file: W, from: "if (first !== null && BigInt(first) / 1000n <= msOf(wh)) { w = wh; fromInv = true; }", to: "if (first !== null) { w = wh; fromInv = true; }", breaks: ["already.whole"], why: "سندُ الفاتورة كلِّها يمنع دفعةً بعده (ما شملها)" },
  { file: W, from: "for (const [at, v] of g.per) if (v > 0n && (first === null || at < first)) first = at;", to: "for (const [at, v] of g.per) if (v > 0n && (first === null || at > first)) first = at;", breaks: ["already.whole"], why: "يُقاس سندُ الفاتورة كلِّها بأحدث دفعة لا بأقدمها" },
  { file: W, from: "return Number.isFinite(x) ? x : Infinity; };", to: "return Number.isFinite(x) ? x : 0; };", breaks: ["already.whole"], why: "سندٌ بوقتٍ لا يُقرأ يُعدّ قبل كلّ دفعة" },
  { file: W, from: "      if (batches && !inLedger(entry, batches)) { setFill({ ...base, st: \"bad\" }); return; }\n", to: "", breaks: ["batch.bad", "batch.unmatched"], why: "رابطٌ لا يطابق الدفتر يُقال «ماكو مواد رجعت»" },
  { file: W, from: "return b.size > 0 && [...b].every((x) => seen.has(x));", to: "return [...b].some((x) => seen.has(x));", breaks: ["batch.unmatched"], why: "رابطٌ طابق بعضُه يُعبّأ بما طابق ويُسقط الباقي بصمت" },
  { file: W, from: 't("cnt.waste.invEmpty", { no: invoiceNo(fill.id), defaultValue: "ماكو مواد خدمة رجعت للمخزن من فاتورة {{no}} — ما في شي ينسجل" })',
    to: 't("cnt.waste.invBadLink", { no: invoiceNo(fill.id), defaultValue: "الرابط ما يطابق أي ترجيع بفاتورة {{no}} — ما نعرف شنو رجع للمخزن، فما نعبّي منه شي" })', breaks: ["batch.unmatched"], why: "دفعةٌ بالدفتر ما رجّعت شي تُقال «الرابط ما يطابق»" },
  { file: W, from: "fill.already.map((a, i) => <p key={`r:${i}`}", to: "fill.already.map((a, i) => <p key={`r:${a.name}`}", breaks: ["already.twins"], why: "مفتاحُ «سجّلتها» بالاسم (توأمان مكرّران)" },
  { file: W, from: "fill.skipped.map((s, i) => <p key={`s:${i}`}", to: "fill.skipped.map((s, i) => <p key={`${s.why}:${s.name}`}", breaks: ["already.twins"], why: "مفتاحُ التخطّي بالاسم (توأمان مكرّران)" },
  /* w5a — كلُّ طفرةٍ تعيد خللاً أمسكه التدقيقُ العدائيّ (أو خطأً قريباً منه) ويجب أن يُسقطها فحصُها. */
  { file: W, from: '{results.more > 0 && <p className="mt-1 text-2xs text-ink-subtle" data-waste-more>', to: '{false && <p className="mt-1 text-2xs text-ink-subtle" data-waste-more>', breaks: ["pick.more", "pick.exact"], why: "السقفُ يقصّ بصمت (لا «و٤ غيرها»)" },
  { file: W, from: "more: Math.max(0, ranked.length - PICK_MAX) };", to: "more: 0 };", breaks: ["pick.more"], why: "عددُ المخفيّ صفرٌ دائماً" },
  { file: W, from: "const ranked = [...all.filter(exact), ...all.filter((p) => !exact(p))];", to: "const ranked = all;", breaks: ["pick.exact"], why: "رمزٌ كُتب كاملاً يسقط خلف باركوداتٍ تحويه" },
  { file: W, from: ': fill.skipped.length + fill.kept.length > 0 ? "held"', to: ': false ? "held"', breaks: ["fill.held", "fill.mixed"], why: "عنوانٌ لا يرى المتخطّى («ماكو رجع» فوق ما رجع)" },
  { file: W, from: "fill.skipped.length + fill.kept.length > 0", to: "fill.kept.length > 0", breaks: ["fill.held", "fill.mixed"], why: "العنوانُ يختاره المعبّأُ والمسجّلُ وحدهما (الخللُ الأصليّ)" },
  { file: W, from: '{head !== "all" && fill.already.map((a, i) =>', to: '{head === "filled" && fill.already.map((a, i) =>', breaks: ["fill.mixed"], why: "المسجّلةُ لا تُقال باسمها إلا بجانب معبّأ" },
  { file: S, from: "        {wasteBox}\n      </div>\n    );\n  }\n", to: "      </div>\n    );\n  }\n", breaks: ["page.pin"], why: "شاشةُ «لا صلاحية» بلا السند (العودةُ المبكّرة القديمة)" },
  { file: S, from: '<div key="waste" hidden=', to: "<div hidden=", breaks: ["page.pin"], why: "السندُ بلا مفتاحه: يُطابَق بموضعه فيُفكّ" },
  { file: S, from: '{wasteSeen && wasteDraft > 0 && <p key="kept"', to: '{false && <p key="kept"', breaks: ["page.pin"], why: "«سندك محفوظ» لا يُقال" },
  { file: S, from: "onChanged={load} onDraft={setWasteDraft} />", to: "onChanged={load} />", breaks: ["page.pin"], why: "الصفحةُ لا تعرف أن بالسند سطوراً" },
  { file: S, from: 'useEffect(() => { if (tab === "waste" && allowed) setWasteSeen(true); }, [tab, allowed]);', to: 'useEffect(() => { if (tab === "waste") setWasteSeen(true); }, [tab, allowed]);', breaks: ["page.pin.never"], why: "من لا صلاحيةَ له يُركَّب له السندُ ويُقرأ له" },
  { file: W, from: 'const stockSaid = (t: TFunction, n: number, p: Product | undefined): string => `${signed(n)} ${unitWord(t, p, "stock")}`;', to: "const stockSaid = (t: TFunction, n: number, p: Product | undefined): string => signed(n);", breaks: ["neg.unit", "mgr.neg", "staff.will", "will.half"], why: "السالبُ رقمٌ عارٍ (يُقرأ ملاً بعد «انخصم 2 مل»)" },
  { file: S, from: "${formatQty(Math.abs(Number(x.stock) || 0))} ${stockWord(t, byId.get(x.product_id))}`", to: "${formatQty(Math.abs(Number(x.stock) || 0))}`", breaks: ["page.negs"], why: "سالبُ الموافقة رقمٌ عارٍ" },
  { file: W, from: '.join(paid.length > 1 ? t("common.listSep", "، ") : " ")', to: '.join(paid.length > 1 ? "، " : " ")', breaks: ["sep.en"], why: "«،» عربيٌّ ثابت بنتيجة السند" },
  { file: W, from: 'names(o.products).join(t("common.listSep", "، "))', to: 'names(o.products).join("، ")', breaks: ["sep.en"], why: "«،» عربيٌّ ثابت ببطاقة التعديلات" },
  { file: W, from: 'const when = (iso: string): string => (Number.isFinite(Date.parse(iso)) ? `${formatDate(iso, i18n.language)} ${formatTime(iso, i18n.language)}` : "—");', to: "const when = (iso: string): string => new Date(iso).toLocaleString();", breaks: ["cards.date"], why: "التاريخُ بمحليّة المتصفّح" },
  { file: W, from: 'dispatch({ k: "plan", v: { ...base, st: "done", skipped: plan.skipped, already: plan.already }, lines: plan.lines });', to: 'setLines((cur) => [...cur, ...plan.lines.filter((l) => !cur.some((c) => c.id === l.id))]); setFill({ ...base, st: "done", n: plan.lines.length, skipped: plan.skipped, already: plan.already });', breaks: ["race.src", "race.empty", "race.retry", "race.stale"], why: "التعبئةُ القديمة: سطرُها يسقط بصمت والعدُّ يعدّه" },
  { file: W, from: "src: c.src ?? l.src, seed };", to: "src: c.src, seed };", breaks: ["race.src", "race.empty", "race.retry"], why: "السطرُ المكتوبُ باليد لا يأخذ مرجعَ الترجيع (يُعبّأ ثانيةً لاحقاً)" },
  { file: W, from: "if (typed) kept.push({ id: l.id, name: l.name, unit: l.unit, qty: l.qty }); else added++;", to: "if (typed) kept.push({ id: l.id, name: l.name, unit: l.unit, qty: l.qty }); added++;", breaks: ["race.src", "race.retry"], why: "«عبّينا N» يعدّ ما بقي بكمية المستخدم" },
  { file: W, from: "qty: typed ? c.qty : l.qty,", to: "qty: l.qty,", breaks: ["race.retry"], why: "التعبئةُ تمسح الكميةَ المكتوبة" },
  { file: W, from: "unit: typed ? c.unit : l.unit, qty: typed ? c.qty : l.qty,", to: "unit: c.unit, qty: c.qty,", breaks: ["race.empty"], why: "سطرٌ بلا كمية لا يأخذ كميةَ التعبئة" },
  { file: W, from: "{fill.kept.map((k, i) => <p key={`k:${i}`}", to: "{[].map((k, i) => <p key={`k:${i}`}", breaks: ["race.src", "race.retry"], why: "ما بقي بكمية المستخدم لا يُقال (ولا ما رجع منه)" },
  { file: W, from: "  if (!mine) return s;\n", to: "", breaks: ["race.stale"], why: "جوابُ رابطٍ تبدّل يُضمّ إلى سند اللاحق" },
  { file: W, from: "const dirty = lines.some(worked) || (cut !== null && cut === fillKey);", to: "const dirty = lines.length > 0;", breaks: ["hold.prefill", "hold.pick"], why: "الإمساكُ بوجود السطر (الخللُ الأصليّ)" },
  { file: W, from: "if (gone?.seed && gone.seed.key === fillKey) setCut(fillKey);", to: "", breaks: ["hold.remove"], why: "شيلُ سطر تعبئةٍ والرابطُ باقٍ لا يمسك (يرجع ممتلئاً بإعادة التحميل)" },
  { file: W, from: "!(d.seed.key === fillKey && d.unit === d.seed.unit", to: "!(d.unit === d.seed.unit", breaks: ["hold.after"], why: "سطرُ تعبئةٍ شالت النتيجةُ رابطَه يُعدّ كما عبّاه" },
  { file: W, from: ': d.qty.trim() !== "" || d.note.trim() !== "");', to: ': d.qty.trim() !== "");', breaks: ["hold.pick"], why: "الملاحظةُ المكتوبة لا تمسك" },
  { file: W, from: "d.qty === d.seed.qty && ", to: "", breaks: ["hold.edit"], why: "تعديلُ كمية التعبئة لا يمسك" },
  /* ui3 — كلُّ طفرةٍ تعيد الخللَ الذي صُلّح (أو خطأً قريباً منه) ويجب أن يُسقطها فحصُها. */
  { file: W, from: 'o.by_owner === true ? t("cnt.cons.byOwner"', to: 'false ? t("cnt.cons.byOwner"', breaks: ["cons.owner"], why: "صاحبُ العيادة «موظف» (الخللُ الأصليّ)" },
  { file: W, from: 'o.by_owner === true ? t("cnt.cons.byOwner"', to: 'o.by_owner !== false ? t("cnt.cons.byOwner"', breaks: ["cons.oldServer"], why: "خادمٌ أقدم بلا by_owner يُخمَّن «صاحب العيادة»" },
  { file: W, from: 'o.by_owner === true ? t("cnt.cons.byOwner"', to: 'o.by_owner !== undefined ? t("cnt.cons.byOwner"', breaks: ["cons.operator"], why: "by_owner false (المشغّل) يُقال «صاحب العيادة»" },
  { file: W, from: "{o.by_name || (o.by_owner === true ?", to: "{(o.by_owner === true ?", breaks: ["cons.staff"], why: "اسمُ الموظّف يسقط" },
  { file: S, from: "return ls.reduce((s, x) => plus(s, exact(Number(l.lots[x.id]))), exact(0));", to: "return exact(ls.reduce((s, x) => s + Number(l.lots[x.id]), 0));", breaks: ["count.lotSum", "count.lotSent"], why: "مجموعُ الدفعات بالعائم (الخللُ الأصليّ)" },
  { file: S, from: "counted: toNum(got),", to: "counted: ls.length ? ls.reduce((s, x) => s + Number(l.lots[x.id]), 0) : toNum(got),", breaks: ["count.lotSent"], why: "المرسَلُ مجموعٌ عائم (٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١)" },
  // (0266: الإرسالُ يقارن بما رآه العادّ seen[i] لا بالمحمَّل — الطفرةُ نفسُها على نصّه الجديد)
  { file: S, from: "const diff = diffOf(got, seen[i]).sign;", to: "const diff = toNum(got) - seen[i];", breaks: ["count.noisyStock"], why: "الإرسالُ يقارن بالعائم والشاشةُ بالضبط" },
  /* «العدُّ يُقرَّب لثلاث منازل داخل diffOf» (plus(at3(got), …)) خرجت بتدقيق ui3: diffOf لا يُنادى إلا بعددٍ ليس tooFine فـat3 عليه
   * هويّةٌ — طفرةٌ مكافئة لا يُسقطها شيء. تقريبُ العدد نفسِه صار طفرةَ countedOf أدناه (count.fineOne). */
  { file: S, from: "const sys = at3(exact(Number(system) || 0))", to: "const sys = exact(Number(system) || 0)", breaks: ["count.noisyStock", "count.noisyDown"], why: "الرصيدُ العائمُ بلا منازل عموده الثلاث" },
  { file: S, from: "r = (2n * v + q) / (2n * q);", to: "r = v / q;", breaks: ["count.noisyDown", "count.tie"], why: "الرصيدُ يُقطع لثلاث منازل لا يُقرَّب (٠٫٧٩٩٩٩… ← ٠٫٧٩٩ «زايدة»)" },
  { file: S, from: "r = (2n * v + q) / (2n * q);", to: "r = (2n * v + q - 1n) / (2n * q);", breaks: ["count.tie"], why: "النصفُ نحو الصفر لا بعيداً عنه (٠٫٠٠٠٥ ← ٠، والمرآةُ ٠٫٠٠١)" },
  { file: S, from: "return { sign: d.n > 0n ? 1 : d.n < 0n ? -1 : 0, v: toNum(d) };", to: "return { sign: d.n > 0n ? -1 : d.n < 0n ? 1 : 0, v: toNum(d) };", breaks: ["count.lotReal", "count.lotGain"], why: "الإشارةُ مقلوبة: النقصُ بأسباب الزيادة والزيادةُ بأسباب النقص" },
  { file: S, from: "formatQty(Math.abs(df.v))", to: "formatQty(Math.abs(df.sign))", breaks: ["count.lotReal"], why: "الفرقُ يُقال بإشارته لا بقيمته" },
  { file: S, from: "والمرآةُ التجريبيةُ مثلَه، بتلميحه حرفاً (refuse بـdemoCounts)", to: "والمرآةُ التجريبيةُ رمزٌ وحده", breaks: ["errs.doc"], why: "التعليقُ القديم: «المرآةُ التجريبيةُ رمزٌ وحده»" },
  { file: S, from: "وبغير العربية يُترجم الرمزُ هنا من نطاق الصفحة. ورفضٌ بلا تلميح يُترجم كذلك —", to: "وبغير العربية، أو رفضٌ بلا تلميح (خادمٌ أقدم)، يُترجم الرمزُ هنا من نطاق الصفحة —", breaks: ["errs.doc"], why: "التعليقُ ينسب الرفضَ بلا تلميح لخادمٍ أقدم لا وجودَ له (تصليحُ ui3 الأوّل)" },
  { file: S, from: 'if (code && (!hint || !lang.startsWith("ar")) && i18next.exists(', to: "if (code && i18next.exists(", breaks: ["errs.hintAr"], why: "تلميحُ الخادم بالعربية يُستبدل بترجمة الرمز" },
  { file: S, from: '(!hint || !lang.startsWith("ar"))', to: "!hint", breaks: ["errs.codeEn"], why: "واجهةٌ إنكليزية تقول التلميحَ العربيّ" },
  { file: S, from: "&& i18next.exists(`cnt.err.${code}`)) return", to: "&& false) return", breaks: ["errs.codeEn", "errs.codeOnly"], why: "الرمزُ لا يُترجم أبداً" },
  /* ui3f — العددُ الأدقّ من ثلاث منازل، ووحدةُ العدّ. */
  { file: S, from: "? exact(Number(l.counted)) : null;", to: "? at3(exact(Number(l.counted))) : null;", breaks: ["count.fineOne"], why: "العددُ الواحد يُقرَّب لثلاث منازل صامتاً (٠٫١٢٠٤ ← ٠٫١٢ «مطابق» ويُرسل)" },
  { file: S, from: "if (tooFine(got)) { playWarning();", to: "if (false) { playWarning();", breaks: ["count.fineOne", "count.fineLots"], why: "الإرسالُ لا يرفض العددَ الأدقّ («اختر السبب» لفرقٍ تُرجعه الموافقة)" },
  { file: S, from: "const fine = got !== null && tooFine(got);", to: "const fine = false;", breaks: ["count.fineOne", "count.fineLots"], why: "السطرُ يقول «الفرق +0» ويطلب سبباً (الخللُ الأصليّ)" },
  { file: S, from: "const tooFine = (a: Exact): boolean => a.s > 3;", to: "const tooFine = (a: Exact): boolean => a.s > 4;", breaks: ["count.fineOne", "count.fineLots"], why: "أربعُ منازل تمرّ" },
  { file: S, from: "const ld = lv && !tooFine(lv) ? diffOf(lv, x.qty) : null;", to: "const ld = lv ? diffOf(lv, x.qty) : null;", breaks: ["count.fineLots"], why: "الدفعةُ الأدقّ تقول «(النظام 0.05 — +0)»" },
  { file: S, from: "{word && <span data-count-unit>{word}</span>}", to: "", breaks: ["count.unit"], why: "حقلُ العدّ «لقيت» بلا وحدة" },
  { file: S, from: '{word && <span className="text-ink-muted" data-count-unit>{word}</span>}', to: "", breaks: ["count.unit"], why: "حقلُ الدفعة بلا وحدة" },
  { file: S, from: "sys: `${formatQty(sys)}${u}`, diff: `${diff > 0 ? \"+\" : \"−\"}${formatQty(Math.abs(df.v))}${u}`", to: "sys: formatQty(sys), diff: `${diff > 0 ? \"+\" : \"−\"}${formatQty(Math.abs(df.v))}`", breaks: ["count.unit"], why: "الفرقُ رقمٌ عارٍ (الخللُ الأصليّ)" },
  { file: S, from: "sys: `${formatQty(x.qty)}${u}`, diff: `${ld.sign > 0 ? \"+\" : \"−\"}${formatQty(Math.abs(ld.v))}${u}`", to: "sys: formatQty(x.qty), diff: `${ld.sign > 0 ? \"+\" : \"−\"}${formatQty(Math.abs(ld.v))}`", breaks: ["count.unit"], why: "فرقُ الدفعة رقمٌ عارٍ" },
  { file: S, from: "(p?.sold_by_weight || (p?.has_sub_unit && Number(p.units_per_box) > 0) ? stockWord(t, p) : null)", to: "stockWord(t, p)", breaks: ["count.unitPlain"], why: "«علبة» على كلّ مادة — البسيطةُ أيضاً" },
  { file: S, from: "(p?.sold_by_weight || (p?.has_sub_unit && Number(p.units_per_box) > 0) ? stockWord(t, p) : null)", to: "(p?.sold_by_weight ? stockWord(t, p) : null)", breaks: ["count.unit"], why: "ما له وحدةٌ صغيرة بلا «علبة» (يُعدّ بالحبّات)" },
  { file: S, from: "${pw ? ` ${pw}` : \"\"}", to: "", breaks: ["count.unitPending"], why: "الجردُ المعلَّق بلا وحدة" },
  // ── r3: رفضُ waste_source_taken — إعادةُ قراءةٍ تشيل ما سُجّل بقاعدة التعبئة وتقوله، والباقي «ما انسجل بعد»، والصفحةُ تُعاد ──
  { file: W, from: 'if (code === "waste_source_taken") await dropTaken(plan.map((x) => x.d));', to: "", breaks: ["taken.reread", "taken.drop", "taken.say"], why: "«سُجّلت قبل» بلا إعادة قراءة: السطرُ يبقى يُرسَل ويُرفض للأبد" },
  { file: W, from: "{taken.length > 0 && (", to: "{false && (", breaks: ["taken.say", "taken.left"], why: "ما سُجّل يُشال بلا كلمة" },
  { file: W, from: "if (a) drop.set(srcKey(d.id, src), a);", to: "drop.set(srcKey(d.id, src), a ?? { id: d.id, name: d.name, at: \"\", inv: false });", breaks: ["taken.batch", "taken.none"], why: "كلُّ سطرٍ بمرجعٍ يُشال — بلا حكم القراءة" },
  { file: W, from: "const b = src.batches ? new Set(src.batches) : null;", to: "const b = null;", breaks: ["taken.batch"], why: "دفعاتُ السطر تُتجاهل: سطرٌ من دفعةٍ أخرى يشيله (والخادمُ يقبله)" },
  { file: W, from: "if (!entry || !shaped(entry)) return;", to: "if (!entry) return;", breaks: ["taken.shape"], why: "جوابٌ ناقص يُحكم به" },
  { file: W, from: "} catch { return; }\n      if (!entry", to: "} catch { for (const x of mine) drop.set(srcKey(x.d.id, x.src), { id: x.d.id, name: x.d.name, at: \"\", inv: false }); return; }\n      if (!entry", breaks: ["taken.readFail"], why: "قراءةٌ فشلت تشيل كلَّ ما له مرجع" },
  // (r3f: الشرطُ صار «سطرٌ من السند المرفوض باقٍ» — الطفرتان نفساهما على نصّه الجديد)
  { file: W, from: "{lines.some((d) => left.includes(d.id)) && <p className=\"font-bold text-ink\" data-waste-taken-left>", to: "{false && <p className=\"font-bold text-ink\" data-waste-taken-left>", breaks: ["taken.left"], why: "الباقي بلا «ما انسجل بعد» (يُقرأ «انسجل»)" },
  { file: W, from: "{lines.some((d) => left.includes(d.id)) && <p className=\"font-bold text-ink\" data-waste-taken-left>", to: "{<p className=\"font-bold text-ink\" data-waste-taken-left>", breaks: ["taken.empty"], why: "«الباقي ما انسجل» والسندُ فارغ" },
  { file: W, from: "product_missing|source_taken)$/", to: "product_missing)$/", breaks: ["taken.reload"], why: "«سُجّلت قبل» لا يعيد التحميل" },
  { file: W, from: '      dispatch({ k: "untaken" });\n', to: "", breaks: ["taken.cleared"], why: "ملاحظةُ الشيل تبقى بعد تسجيل السند" },
  // (r3f: النداءُ يحمل `sent`، وسطرُ الحفظ صار حقلاً بسطره — الطفرتان نفساهما على نصّهما الجديد)
  { file: W, from: '    if (drop.size) dispatch({ k: "taken", drop, sent: sent.map((d) => d.id) });', to: '    if (drop.size) { dispatch({ k: "taken", drop, sent: sent.map((d) => d.id) }); setLines(sent.filter((d) => !(d.src && drop.has(srcKey(d.id, d.src))))); }', breaks: ["taken.race"], why: "الشيلُ من لقطة الإرسال: ما أُضيف والقراءةُ بالطريق يضيع" },
  { file: W, from: "      taken: [...s.taken.filter((x) => !gone.some((g) => g.id === x.id)), ...gone],\n", to: "", breaks: ["taken.say"], why: "الشيلُ لا يُسجَّل للقول" },
  { file: W, from: "space-y-1 break-words rounded-xl bg-surface-2 p-3 text-xs\" data-waste-taken>", to: "space-y-1 rounded-xl bg-surface-2 p-3 text-xs\" data-waste-taken>", breaks: ["wrap.taken"], why: "ملاحظةُ الشيل لا تلفّ الاسمَ الطويل" },
  { file: W, from: "space-y-1 break-words rounded-xl bg-surface-2 p-3 text-xs\" data-waste-inv>", to: "space-y-1 rounded-xl bg-surface-2 p-3 text-xs\" data-waste-inv>", breaks: ["wrap.fill"], why: "بطاقةُ التعبئة لا تلفّ الاسمَ الطويل (تمرّر الصفحة)" },
  { file: W, from: "\"break-words rounded-xl bg-surface-2 p-3 text-xs font-semibold text-warn-700 dark:text-warn-200\" data-waste-pick>", to: "\"rounded-xl bg-surface-2 p-3 text-xs font-semibold text-warn-700 dark:text-warn-200\" data-waste-pick>", breaks: ["wrap.pick"], why: "ملاحظةُ ?p= لا تلفّ الاسمَ الطويل" },
  // ── r3f: تدقيق r3 — الحكمُ بقاعدة الخادم، وكلُّ فاتورةٍ لسطورها، والمهلة، وما يُقال بعد الشيل ──
  { file: W, from: "const a = takenBy(entry, d.id, byId.get(d.id)?.name ?? d.name, b);", to: "const a = planFromInvoice(entry, byId, \"\", id, b).already.find((x) => x.id.toLowerCase() === d.id.toLowerCase());", breaks: ["taken.relink"], why: "الحكمُ بقاعدة التعبئة (r3): مادّةٌ صافيها ≤ ٠ بعد تعديلٍ تُتخطّى قبل ما سُجّل فتبقى بالسند تُرفض للأبد" },
  { file: W, from: "if (!batches || (w.batches !== null && w.batches.some((x) => batches.has(Number(x))))) {", to: "if (!!batches && w.batches !== null && w.batches.some((x) => batches.has(Number(x)))) {", breaks: ["taken.relink", "taken.inv"], why: "سطرٌ بلا دفعات (رابطٌ قديم) لا يكفيه سطرُ المادّة من الفاتورة (والخادمُ يرفضه)" },
  { file: W, from: "w.batches === null && first !== null && BigInt(first) / 1000n <= msOf(w)", to: "w.batches === null && first !== null", breaks: ["taken.wholeEdge"], why: "سندُ الفاتورة كلِّها قبل دفعة السطر يشيله (والخادمُ يقبله)" },
  { file: W, from: "BigInt(first) / 1000n <= msOf(w)", to: "BigInt(first) / 1000n < msOf(w)", breaks: ["taken.wholeEdge"], why: "سندُ الفاتورة كلِّها بمللّي الدفعة نفسِه لا يشملها (الخادمُ: >=)" },
  { file: W, from: "return w ? { id, name, at: w.counted_at, inv: !batches || !hit } : null;", to: "return w ? { id, name, at: w.counted_at, inv: false } : null;", breaks: ["taken.relink", "taken.inv", "taken.whole"], why: "«لهالترجيع» عن سطرٍ بلا دفعات أو عن سندِ الفاتورة كلِّها" },
  { file: W, from: "if (src.inv !== id || (b && !inLedger(entry, b))) continue;", to: "if (b && !inLedger(entry, b)) continue;", breaks: ["taken.twoInv"], why: "سطرُ فاتورةٍ ثانية يُحكم بسجلّ الأولى فيُشال ويُقال «سجّلتها» (طفرةُ M1 بالتدقيق)" },
  { file: W, from: "const map = await withTimeout(consumptionApi.invoiceConsumption([id]));", to: "const map = await consumptionApi.invoiceConsumption([id]);", breaks: ["taken.wait"], why: "بلا مهلة: قراءةٌ عالقة تقفل «سجّل وطبّق» للأبد (طفرةُ M3 بالتدقيق)" },
  { file: W, from: "    refRef.current = null; setAsked(new Set()); dropParams();\n    /* eslint-disable-next-line", to: "    refRef.current = null; setAsked(new Set());\n    /* eslint-disable-next-line", breaks: ["taken.emptied"], why: "سندٌ أفرغته القراءةُ يُبقي رابطَه وبطاقةَ «عبّينا N — راجع الكميات وسجّل» فوق سندٍ فارغ" },
  { file: W, from: "    if (fill?.st === \"loading\" && fill.key === fillKey) return;\n", to: "", breaks: ["taken.emptyLoading"], why: "إفراغُ القراءة يشيل رابطاً تعبئتُه بالطريق فتُضمّ سطورُه بلا بطاقته" },
  { file: W, from: "emptied: lines.length ? s.emptied : s.emptied + 1 };", to: "emptied: s.emptied };", breaks: ["taken.emptied"], why: "إفراغُ القراءة لا يُعدّ فلا يُشال الرابط" },
  { file: W, from: "return a.v.st === \"loading\" && s.fill?.key !== a.v.key ? { ...s, fill: a.v, taken: [], left: [] } : { ...s, fill: a.v };", to: "return { ...s, fill: a.v };", breaks: ["taken.nextLink"], why: "رابطٌ آخر يعبّي وملاحظةُ السند السابق باقية" },
  { file: W, from: "    if (!next.length) dispatch({ k: \"untaken\" });\n", to: "", breaks: ["taken.handEmpty"], why: "صاحبُ السند أفرغه بيده والملاحظةُ باقية" },
  { file: W, from: "{lines.some((d) => left.includes(d.id)) && <p", to: "{lines.length > 0 && <p", breaks: ["taken.leftOnly", "taken.leftRace"], why: "«الباقي ما انسجل… أرسله مرّة ثانية» فوق سطرٍ ما أُرسل (شرطُ r3)" },
  { file: W, from: "left: lines.filter((d) => a.sent.includes(d.id)).map((d) => d.id),", to: "left: lines.map((d) => d.id),", breaks: ["taken.leftRace"], why: "ما أُضيف والقراءةُ بالطريق يُعدّ من السند المرفوض" },
  // ── 0266: البيعُ قبل الجرد — ما رآه العادّ، والدفعات، وcount_moved، وأوّلُ عدّ، وبطاقةُ جرد البداية، والتوأم ──
  { file: S, from: "    if (seenReq.current.has(p.id)) return;\n", to: "", breaks: ["seen.frozen"], why: "ما رآه العادّ يُحدَّث بكلّ ضغطة (يلحق البيعَ بعد العدّ — الفرقُ الوهميّ نفسُه)" },
  { file: S, from: ", seen: seen[i] });", to: " });", breaks: ["seen.sent"], why: "السطرُ يُرسل بلا seen (الخادمُ يرفضه count_seen_missing، والقديمُ يلقط رصيدَ الإرسال)" },
  { file: S, from: "        const fresh = await withTimeout(repo.getProductById(p.id));\n        if (fresh) return Number(fresh.stock) || 0;\n", to: "", breaks: ["seen.base"], why: "ما رآه العادّ = رصيدُ الصفحة القديم لا صفُّه الطازج" },
  { file: S, from: "const fresh = await withTimeout(repo.getProductById(p.id));", to: "const fresh = await repo.getProductById(p.id);", breaks: ["seen.wait"], why: "سؤالُ الصفّ بلا مهلة: عالقٌ يعلّق «سجّل العدّ» للأبد" },
  { file: S, from: "if (code === \"count_moved\") recount(movedIdsOf(e) ?? part.map((x) => x.product_id));", to: "if (code === \"count_moved\") recount(part.map((x) => x.product_id));", breaks: ["moved.only"], why: "count_moved يمسح أعدادَ الدفعة كلّها لا ما تحرّك" },
  { file: S, from: "    for (const id of gone) seenReq.current.delete(id); // يُسأل من جديد بأوّل ضغطة\n", to: "", breaks: ["moved.recount"], why: "ما تحرّك يُعاد عدُّه على الرصيد المجمَّد القديم — يُردّ count_moved للأبد" },
  { file: S, from: "product_missing|moved)$/", to: "product_missing)$/", breaks: ["moved.reload"], why: "count_moved لا يعيد التحميل (الصفحةُ على رصيدٍ تحرّك)" },
  { file: S, from: "forget(part.map((x) => x.product_id));", to: "forget(payload.map((x) => x.product_id));", breaks: ["chunk.left"], why: "الدفعةُ الأولى تمسح السطورَ كلَّها — ما لم يُرسل يضيع" },
  { file: S, from: "const r = await negApi.countSubmitSeen(part);", to: "const r = await negApi.countSubmitSeen(part).catch(() => ({ matched: 0, pending: 0 }));", breaks: ["chunk.stop", "chunk.left", "chunk.partial"], why: "الحلقةُ تكمل بعد الفشل وتشيل الدفعةَ الفاشلة كأنها انسجلت" },
  { file: S, from: "const CHUNK = 200;", to: "const CHUNK = 1000;", breaks: ["chunk.sizes", "open.add"], why: "بلا تقسيم: ٤٥٠ سطراً بنداءٍ واحد (الخادمُ يرفضه count_too_many)، والبطاقةُ بلا سقف" },
  { file: S, from: "matched += Number(r.matched) || 0;", to: "matched = Number(r.matched) || 0;", breaks: ["chunk.saved"], why: "«انسجل العدّ» برقم الدفعة الأخيرة لا مجموعها" },
  { file: S, from: "toast.error(done > 0 ? t(\"cnt.partial\",", to: "toast.error(false ? t(\"cnt.partial\",", breaks: ["chunk.partial"], why: "الفشلُ بعد دفعةٍ نجحت يُقال كأن شيئاً لم ينسجل" },
  { file: S, from: "(negUsed && neverIds.has(p.id) ? \"entry_error\" : null)", to: "(neverIds.has(p.id) ? \"entry_error\" : null)", breaks: ["first.unused"], why: "«خطأ إدخال» مختارٌ بعيادةٍ ما استعملت الوضع" },
  { file: S, from: "(negUsed && neverIds.has(p.id) ? \"entry_error\" : null)", to: "(negUsed ? \"entry_error\" : null)", breaks: ["first.counted"], why: "«خطأ إدخال» مختارٌ لمادّةٍ انعدّت قبل" },
  { file: S, from: "&& (countedIds ? !countedIds.has(p.id) : !ready.state.has(p.id))) : []), [ready, countedIds, pendingIds]);", to: "&& !ready.state.has(p.id)) : []), [ready, countedIds, pendingIds]);", breaks: ["first.rejected"], why: "«انعدّت» بحالة العدّ — المرفوضُ «انعدّت»" },
  { file: S, from: "countable(p) && !pendingIds.has(p.id)\n    && (countedIds", to: "countable(p)\n    && (countedIds", breaks: ["first.pendingNot"], why: "المعلَّقُ «ما انعدّت» بتعريف الخادم" },
  { file: S, from: "{pre !== null && reason === \"entry_error\" && <p", to: "{false && <p", breaks: ["first.pre"], why: "«خطأ إدخال» مختارٌ بلا كلمة لماذا" },
  { file: S, from: "{pre !== null && reason === \"entry_error\" && <p", to: "{pre !== null && <p", breaks: ["first.change"], why: "«السبب مختار خطأ إدخال» يُقال بعد ما تغيّر" },
  { file: S, from: "const openCard = negUsed && !!ready &&", to: "const openCard = !!ready &&", breaks: ["open.hidden"], why: "بطاقةُ جرد البداية لكلّ عيادة" },
  { file: S, from: ".slice(0, CHUNK).map((p) => p.id);", to: ".map((p) => p.id);", breaks: ["open.add"], why: "الشركةُ كلُّها بضغطة — بلا سقف" },
  { file: S, from: "Number((Number(a.stock) || 0) > 0) - Number((Number(b.stock) || 0) > 0) || ", to: "", breaks: ["open.order"], why: "بالاسم وحده: ما رصيدُه ≤ ٠ يسقط من أوّل ٢٠٠" },
  { file: S, from: "const k = p.company_id && known.has(p.company_id) ? p.company_id : NO_COMPANY;", to: "const k = p.company_id ? p.company_id : NO_COMPANY;", breaks: ["open.none", "open.options"], why: "مادّةٌ شركتُها ما عادت بالقائمة لا تُلقى بأيّ سلّة" },
  { file: S, from: ".filter((r) => (r.source ?? \"count\") === \"count\").length;", to: ".length;", breaks: ["open.pending"], why: "سندُ التلف يُعدّ «عدّاً ينتظر الموافقة»" },
  { file: S, from: "carded ? t(\"cnt.why.never\", \"ما انعدّت أبداً\") : ", to: "", breaks: ["open.chip"], why: "ما أضافته البطاقةُ يُقال «أضفتها بالبحث»" },
  { file: S, from: "      if (!countable(p)) continue;\n      const k = searchable(p.name);", to: "      const k = searchable(p.name);", breaks: ["twin.not"], why: "المجمَّعةُ تجعل مادّةً توأماً (لا تُعدّ)" },
  { file: S, from: "      const k = searchable(p.name);", to: "      const k = p.name;", breaks: ["twin.say"], why: "التوأمُ بالنصّ الخامّ لا بالتطبيع (الهمزة تفرّقهما)" },
];
console.log("▸ ط) الطفرات — كلٌّ يجب أن يُسقط فحصَه");
for (const m of MUTANTS) {
  const unknown = m.breaks.filter((k) => !keys.has(k));
  if (unknown.length) { say(false, `طفرة «${m.why}»: مفاتيحُها موجودة`, unknown.join(",")); continue; }
  let M2;
  try { M2 = await build(m); } catch (e) { say(false, `طفرة «${m.why}» تنطبق وتُحزم`, String(e?.message ?? e).split("\n")[0]); continue; }
  const names = [...new Set(m.breaks.map((k) => scenarioOf.get(k)))];
  const got = await runAll(M2, names);
  // ممسوكٌ: فحصُه نفسُه سقط، أو لم يُبلَغ لأن **سيناريوه** سقط قبله (رميةٌ أو فحصٌ أبكر) — لا سيناريوٌ آخر.
  const caught = m.breaks.filter((k) => got.some((r) => r.key === k && !r.ok)
    || (!got.some((r) => r.key === k) && got.some((r) => !r.ok && r.scenario === scenarioOf.get(k))));
  say(caught.length === m.breaks.length, `طفرة «${m.why}» يمسكها ${m.breaks.join(" و")}`, `مُسك: ${caught.join(",") || "∅"}`);
}

console.log(fails ? `\n✗ waste-tab-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ waste-tab-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
