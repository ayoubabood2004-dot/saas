/* ============================================================================
 * قسمةُ القاموس العربيّ — نصفٌ حارٌّ بالإقلاع، ونصفٌ باردٌ يُحمَّل كسولاً.
 *
 * ── الجذر ────────────────────────────────────────────────────────────────
 * `src/i18n/index.ts` كانت تستورد `ar.json` كلَّه استيراداً ثابتاً، والسلسلةُ
 * `repo → payrollDemo → payrollLabels → @/i18n` جرّته إلى حزمة `repo-*.js`
 * الإقلاعية: ٧٨ كيلو مضغوطة من ١٤١ (٥٥٪)، أغلبُها نصوصُ شاشاتٍ كسولةٍ أصلاً
 * (المزارع، الهبوط، المختبر، الرواتب…). فكلُّ نصٍّ جديدٍ لشاشةٍ عميقة كان يُدفع
 * من مسار الإقلاع — ثلاثُ رفعاتٍ لسقف `store-weight-guard` بثلاثة أيام، وكلُّها
 * لنفس السبب.
 *
 * ── العلاج: مصدرٌ واحدٌ يُقسَم عند البناء ──────────────────────────────────
 *   • `ar.json` يبقى الملفَّ الوحيدَ الذي يُحرَّر — فحارسُ التكافؤ، ومسحُ المفاتيح
 *     المكرّرة، و`store-i18n --check`، وكلُّ فحصٍ يقرأه يبقى كما هو.
 *   • `src/i18n/hot-paths.json` يسمّي ما تقرؤه شِفرةُ الإقلاع (نطاقاً أو فرعاً
 *     أو ورقة). والباقي باردٌ افتراضاً — نطاقٌ جديدٌ باردٌ حتى يُثبَت غيرُه.
 *   • `arHot.ts`/`arCold.ts` وحدتان بديلتان: داخل Vite يستبدلهما `i18nSplit()`
 *     بالنصفين، وخارجه (tsc، وحُزمُ esbuild بالفحوص) هما القاموسُ كاملاً —
 *     فالفحصُ يرى مفاتيحَ أكثرَ لا أقلّ.
 *
 * وهذه الوحدةُ **الوحيدةُ** التي تقسم: البنّاءُ والحارسُ (`i18n-hot-guard`)
 * والفحصُ (`i18n-cold-test`) يستوردونها، فلا نسختان من القسمة تفترقان بصمت.
 * ==========================================================================*/
import { readFileSync } from "node:fs";
import path from "node:path";

export const AR_JSON = "src/i18n/ar.json";
export const HOT_PATHS_JSON = "src/i18n/hot-paths.json";
export const STORE_AR_JSON = "src/i18n/store.ar.json";
export const AR_HOT_TS = "src/i18n/arHot.ts";
export const AR_COLD_TS = "src/i18n/arCold.ts";

const isObj = (v) => v !== null && typeof v === "object";
const norm = (id) => id.split("?")[0].split(path.sep).join("/");

/** المساراتُ الحارّة كما كُتبت بـ`hot-paths.json`. */
export function readHotPaths(root = process.cwd()) {
  const file = path.join(root, HOT_PATHS_JSON);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  if (!isObj(doc) || !Array.isArray(doc.hot) || doc.hot.some((p) => typeof p !== "string" || !p.trim())) {
    throw new Error(`${HOT_PATHS_JSON}: لازم يحمل "hot" قائمةَ نصوصٍ غيرِ فارغة`);
  }
  return doc.hot;
}

/** نطاقاتُ صفحة الزائر (`store.ar.json`) — تبقى حارّةً كاملةً (انظر `splitAr`). */
export function readStoreKeys(root = process.cwd()) {
  return Object.keys(JSON.parse(readFileSync(path.join(root, STORE_AR_JSON), "utf8")));
}

export function readAr(root = process.cwd()) {
  return JSON.parse(readFileSync(path.join(root, AR_JSON), "utf8"));
}

/**
 * القسمة: `(ar, hot, storeKeys) → {hot, cold}` بلا ورقةٍ في النصفين.
 *
 * تمشي `ar` بترتيبه المكتوب فيبقى كلُّ نصفٍ بترتيب مؤلّفه (مخرَجٌ ثابتٌ وضغطٌ
 * ثابت). وترمي — لا تتجاهل — على:
 *   • مسارٍ لا وجودَ له: مسارٌ حارٌّ مكتوبٌ خطأً يبرّد نطاقَه بصمت؛
 *   • مسارٍ **داخل** مصفوفة: المصفوفاتُ (صياغاتُ واتساب، مزايا الخطط) تُقرأ
 *     بـ`returnObjects` قطعةً واحدة، ونصفُ مصفوفةٍ قائمةٌ ناقصةٌ تُصدَّق؛
 *   • مسارين متداخلين (`payroll` و`payroll.el`): أحدُهما لغوٌ يُضلّل القارئ؛
 *   • نطاقٍ من `store.ar.json` ليس حارّاً كاملاً: صفحةُ الزائر بالوضع التجريبيّ
 *     تمرّ من `storeApi → repo → index.ts` فتعيد تهيئةَ i18next بالنصف الحارّ —
 *     ونطاقٌ باردٌ من نطاقاتها يُمحى من شاشتها.
 */
export function splitAr(ar, hotPaths, storeKeys = []) {
  const seen = new Set();
  for (const p of hotPaths) {
    if (seen.has(p)) throw new Error(`مسارٌ حارٌّ مكرّر: ${p}`);
    seen.add(p);
  }
  for (const a of hotPaths) {
    for (const b of hotPaths) {
      if (a !== b && b.startsWith(a + ".")) throw new Error(`مساران حارّان متداخلان: "${a}" يضمّ "${b}" — احذف أحدَهما`);
    }
  }
  for (const p of hotPaths) {
    let node = ar;
    for (const s of p.split(".")) {
      if (Array.isArray(node)) throw new Error(`مسارٌ حارٌّ داخل مصفوفة (المصفوفةُ تُقرأ كاملةً): ${p}`);
      if (!isObj(node) || !Object.prototype.hasOwnProperty.call(node, s)) throw new Error(`مسارٌ حارٌّ لا وجودَ له بـar.json: ${p}`);
      node = node[s];
    }
  }
  const hotSet = new Set(hotPaths);
  for (const k of storeKeys) {
    if (!hotSet.has(k)) throw new Error(`نطاقُ صفحة الزائر "${k}" (store.ar.json) لازم يكون حارّاً كاملاً بـhot-paths.json`);
  }
  const prefixes = new Set();
  for (const p of hotPaths) {
    const segs = p.split(".");
    for (let i = 1; i < segs.length; i++) prefixes.add(segs.slice(0, i).join("."));
  }
  const walk = (node, at) => {
    const hot = {}, cold = {};
    let h = 0, c = 0;
    for (const [k, v] of Object.entries(node)) {
      const p = at ? `${at}.${k}` : k;
      if (hotSet.has(p)) { hot[k] = v; h++; }
      else if (prefixes.has(p) && isObj(v) && !Array.isArray(v)) {
        const r = walk(v, p);
        if (r.h) { hot[k] = r.hot; h++; }
        if (r.c) { cold[k] = r.cold; c++; }
      } else { cold[k] = v; c++; }
    }
    return { hot, cold, h, c };
  };
  const r = walk(ar, "");
  return { hot: r.hot, cold: r.cold };
}

/** كلُّ ورقة (والمصفوفةُ تُفكّ إلى عناصرها) — للمقارنة والعدّ. */
export function leafPaths(o, prefix = "", out = []) {
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) leafPaths(v, p, out); else out.push(p);
  }
  return out;
}

/** القسمةُ كما يراها البنّاء — من ملفّات الشجرة نفسِها. */
export function splitFromTree(root = process.cwd()) {
  return splitAr(readAr(root), readHotPaths(root), readStoreKeys(root));
}

/**
 * مُلحَقُ Vite. `enforce: "pre"` حتى يسبق مُلحَقَ TS: يُرجع لـ`arHot.ts`
 * و`arCold.ts` نصفَيهما بدل استيرادهما القاموسَ كاملاً.
 *
 * ويُفشّل البناءَ (`generateBundle`) — برسالةٍ عربية — ما لم تصحّ خمسٌ معاً:
 *   ١) حزمةٌ واحدةٌ فيها `arCold.ts`، ولا شيءَ معه فيها؛
 *   ٢) `arCold` ليس بالإغلاق الثابت لأيّ مدخل (لا يُحمَّل قبل أوّل رسم)؛
 *   ٣) لا حزمةَ فيها `ar.json` نفسُه (استيرادٌ مباشرٌ للقاموس كلِّه يرجعه للإقلاع)؛
 *   ٤) إغلاقُ `store.html` الثابت لا يحمل نصفاً ولا آخر؛
 *   ٥) `arHot` بإغلاق `index.html` الثابت (الواجهةُ ترسم به قبل كلِّ شيء).
 * أمّا حذفُ المُلحَق كلِّه فلا تمسكه هذه (تذهب معه) — يمسكه سقفُ `main` المُنزَل
 * بـ`store-weight-guard`: بلا قسمةٍ يعود القاموسُ كلُّه ويتجاوز السقف.
 */
export function i18nSplit() {
  let root = process.cwd();
  let split = null;
  const ids = () => ({
    hot: norm(path.join(root, AR_HOT_TS)),
    cold: norm(path.join(root, AR_COLD_TS)),
    ar: norm(path.join(root, AR_JSON)),
  });
  const watched = () => [AR_JSON, HOT_PATHS_JSON, STORE_AR_JSON].map((f) => norm(path.join(root, f)));
  const resplit = () => { split = splitFromTree(root); };
  return {
    name: "i18n-split",
    enforce: "pre",
    configResolved(config) { root = config.root; },
    buildStart() {
      resplit();
      for (const f of watched()) this.addWatchFile(f);
    },
    load(id) {
      const n = norm(id);
      const { hot, cold } = ids();
      if (n !== hot && n !== cold) return null;
      if (!split) resplit();
      return `export default ${JSON.stringify(n === hot ? split.hot : split.cold)};\n`;
    },
    handleHotUpdate(ctx) {
      if (!watched().includes(norm(ctx.file))) return undefined;
      resplit();
      const { hot, cold } = ids();
      for (const id of [hot, cold]) {
        const mod = ctx.server.moduleGraph.getModuleById(id);
        if (mod) ctx.server.moduleGraph.invalidateModule(mod);
      }
      // إعادةُ تحميلٍ كاملة لا تبديلٌ ساخن: i18next يدمج الحزمةَ الباردة مرّةً
      // واحدةً ولا يعيد قراءتها، فالتبديلُ الساخن يُبقي النصَّ القديم معروضاً.
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    },
    generateBundle(_opts, bundle) {
      const { hot, cold, ar } = ids();
      const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const has = (c, id) => Object.keys(c.modules).some((m) => norm(m) === id);
      const closure = (start) => {
        const out = new Set();
        const q = [start];
        while (q.length) {
          const c = q.pop();
          if (!c || out.has(c.fileName)) continue;
          out.add(c.fileName);
          for (const f of c.imports) q.push(byFile.get(f));
        }
        return [...out].map((f) => byFile.get(f));
      };
      const entry = (html) => chunks.find((c) => c.isEntry && c.facadeModuleId && norm(c.facadeModuleId).endsWith(`/${html}`));
      const errs = [];
      const coldChunks = chunks.filter((c) => has(c, cold));
      if (coldChunks.length !== 1) errs.push(`النصفُ البارد بـ${coldChunks.length} حزمة (المطلوب واحدة بالضبط)`);
      for (const c of coldChunks) {
        const others = Object.keys(c.modules).filter((m) => norm(m) !== cold);
        if (others.length) errs.push(`حزمةُ النصف البارد ${c.fileName} تحمل غيرَه: ${others.slice(0, 3).map(norm).join("، ")}`);
      }
      const full = chunks.filter((c) => has(c, ar));
      if (full.length) errs.push(`ar.json كاملاً داخل ${full.map((c) => c.fileName).join("، ")} — استيرادٌ مباشرٌ للقاموس يرجعه للإقلاع (استورد من @/i18n)`);
      const main = entry("index.html");
      const store = entry("store.html");
      if (!main) errs.push("لم أجد مدخلَ index.html بالحزم — لا أستطيع التحقّق فلا أمرّر");
      if (!store) errs.push("لم أجد مدخلَ store.html بالحزم — لا أستطيع التحقّق فلا أمرّر");
      if (main) {
        const cl = closure(main);
        if (cl.some((c) => has(c, cold))) errs.push("النصفُ البارد بالإغلاق الثابت لـindex.html — صار يُحمَّل قبل أوّل رسم");
        if (!cl.some((c) => has(c, hot))) errs.push("النصفُ الحارّ غائبٌ عن الإغلاق الثابت لـindex.html — القشرةُ سترسم مفاتيحَ خاماً");
      }
      if (store) {
        const cl = closure(store);
        if (cl.some((c) => has(c, hot) || has(c, cold))) errs.push("نصفٌ من القاموس بالإغلاق الثابت لـstore.html — صفحةُ الزائر لها store.ar.json وحدَه");
      }
      if (errs.length) this.error(`i18n-split: قسمةُ القاموس لم تصحّ:\n  • ${errs.join("\n  • ")}`);
    },
  };
}

/** نصُّ وحدة النصف البارد كما يكتبها الفحص: تعدّ مرّاتِ تقييمها. */
export function coldModuleSource(cold) {
  return `globalThis.__arColdEvals = (globalThis.__arColdEvals || 0) + 1;\nexport default ${JSON.stringify(cold)};\n`;
}

/**
 * نفسُ القسمة داخل esbuild — للفحوص. النصفُ الحارّ يُضمَّن، والباردُ يبقى
 * استيراداً ديناميكياً **خارجياً** إلى `coldExternal` (ملفٌّ يكتبه الفحصُ أو
 * يحذفه) — فيُمتحن الفشلُ الحقيقيّ والمحاولةُ الثانية، لا غلافُ esbuild.
 */
export function esbuildI18nSplit({ root = process.cwd(), coldExternal = "./arCold.mjs", split: given } = {}) {
  const split = given ?? splitFromTree(root);
  return {
    name: "i18n-split-esbuild",
    setup(b) {
      b.onResolve({ filter: /^\.\/arCold$/ }, (a) =>
        norm(a.importer).endsWith("/src/i18n/index.ts") ? { path: coldExternal, external: true } : undefined);
      b.onLoad({ filter: /[\\/]src[\\/]i18n[\\/]arHot\.ts$/ }, () => ({
        contents: `export default ${JSON.stringify(split.hot)};`, loader: "js",
      }));
    },
  };
}
