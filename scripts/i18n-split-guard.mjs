/* ============================================================================
 * حارسُ انقسام القاموس — الحارُّ بالإقلاع، الباردُ كسول، ولا وميض (م٠·١).
 *
 * `ar.json` كلُّه كان يُحمَّل مع كلّ فتحِ تطبيق (٧٧ ألف بايتٍ مضغوطة)، والقشرةُ
 * تقرأ منه ٢٢ نطاقاً. فانقسم: الحارُّ يُستورد بالاسم بـ`src/i18n/index.ts`،
 * والباقي بـ`src/i18n/arCold.ts` يُحمَّل كسولاً وتنتظره كلُّ شاشةٍ بـ`page()`.
 *
 * **وخطرُ هذا الانقسام مقيسٌ لا نظريّ**: من ٣٤١٩ نداءً للنطاقات الباردة،
 * ٧١٨ افتراضيُّها إنكليزيّ و٦٣٥ بلا افتراض — فأيُّ شاشةٍ تُرسم قبل الباردِ تعرض
 * لعيادةٍ عراقية «Today» و«claim.notFound». وreact-i18next لا يعيد الرسمَ حين
 * يُضاف قاموس، فالوميضُ يبقى حتى تُغلق الشاشة.
 *
 * فيحرس من طرفين:
 *
 *   ثابتاً (بـlint، بلا بناء):
 *     ١) الحارُّ ∪ الباردُ = مفاتيحُ ar.json كلُّها، ولا تقاطع — نطاقٌ جديدٌ
 *        منسيٌّ كان سيظهر مفاتيحَ خامّةً للأبد.
 *     ٢) ما يُستورد = ما يُصدَّر بكلّ ملف — نطاقٌ مستوردٌ غيرُ مصدَّر يسقط بصمت.
 *     ٣) لا استيرادَ افتراضيّاً لـar.json بالشِفرة — سطرٌ واحدٌ يعيد الـ٧٧ ألفاً.
 *     ٤) `page()` تنتظر `loadColdAr` — بوابةُ الشاشات كلِّها.
 *
 *   بعد البناء (`--post-build`، يقرأ `dist/.vite/manifest.json`):
 *     ٥) ملفّاتُ الإقلاع لا تذكر نطاقاً بارداً (مفتاحٌ بعلامة اقتباس: "ns.).
 *     ٦) كلُّ كسولٍ يُستدعى من الإقلاع **بغير** `page()` لا يذكر نطاقاً بارداً
 *        — فهو يُرسم بلا بوابة.
 *     ٧) القاموسُ الباردُ حزمةٌ مستقلّة خارجَ الإقلاع فعلاً.
 *     ٨) كلُّ شاشةٍ بـ`page()` لها حزمةٌ بالخريطة — وإلا فالفحصُ ٦ يفحص وهماً.
 *     ٩) **النصوصُ نفسُها بالبايت**: نصوصُ الباردِ ليست بالإقلاع وهي بحزمة arCold،
 *        ونصوصُ الحارِّ بالإقلاع (وإلا فالفحصُ أعمى). الفحوصُ ٥–٨ مرّت كلُّها على
 *        انقسامٍ لم يحدث — هذا وحدَه أمسكه.
 *
 * ويقول ما فحص بالأرقام — «حارسٌ يخرج صفراً بلا كلمة ليس حارساً» (CLAUDE.md).
 *
 *   node scripts/i18n-split-guard.mjs              # ثابت
 *   node scripts/i18n-split-guard.mjs --post-build # بعد vite build
 * ==========================================================================*/
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POST = process.argv.includes("--post-build");
let fails = 0;
const fail = (m) => { fails++; console.error(`   ✗ ${m}`); };
const ok = (m) => console.log(`   ✓ ${m}`);

const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const ALL = Object.keys(ar);

/* الفحصُ على الشِفرة لا على شرحها: تعليقٌ يقتبس السطرَ الممنوع ليحذّر منه
 * (كما بـindex.ts) كان يُفشّل الحارس، واستيرادٌ معلَّقٌ كان سيُحسب حيّاً.
 * `//` بعد `:` يُترك — عنوانُ https ليس تعليقاً. */
const code = (file) => readFileSync(file, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:\\])\/\/[^\n]*/gm, "$1");

/** أسماءُ الاستيراد بالاسم من ./ar.json بملف، وأسماءُ الكائن المصدَّر/المبنيّ. */
const namedFromAr = (file) => {
  const s = code(file);
  const m = /import\s*\{([^}]*)\}\s*from\s*["']\.\/ar\.json["']/.exec(s);
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : null;
};
const objectKeys = (file, re) => {
  const m = re.exec(code(file));
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : null;
};

console.log("▸ انقسامُ القاموس — ثابتاً");
const hot = namedFromAr("src/i18n/index.ts");
const cold = namedFromAr("src/i18n/arCold.ts");
if (!hot) fail("ما لكيت استيرادَ الحارّ بالاسم بـsrc/i18n/index.ts");
if (!cold) fail("ما لكيت استيرادَ البارد بالاسم بـsrc/i18n/arCold.ts");
if (hot && cold) {
  const H = new Set(hot), C = new Set(cold);
  const both = hot.filter((n) => C.has(n));
  const missing = ALL.filter((n) => !H.has(n) && !C.has(n));
  const ghost = [...hot, ...cold].filter((n) => !(n in ar));
  both.length ? fail(`نطاقٌ بالطرفين: ${both.join(" ")}`) : ok(`لا تقاطع (${hot.length} حارّ · ${cold.length} بارد)`);
  missing.length
    ? fail(`نطاقٌ بـar.json ما ينتمي لطرف — سيظهر مفاتيحَ خامّةً للأبد. أضفه لأحد الملفّين: ${missing.join(" ")}`)
    : ok(`الطرفان يغطّيان ar.json كلَّه (${ALL.length} نطاقاً)`);
  ghost.length ? fail(`مستوردٌ غيرُ موجودٍ بـar.json: ${ghost.join(" ")}`) : ok("لا نطاقَ وهميّ");

  const hotObj = objectKeys("src/i18n/index.ts", /const arHot\s*=\s*\{([^}]*)\}/);
  const coldObj = objectKeys("src/i18n/arCold.ts", /export default\s*\{([^}]*)\}/);
  const same = (a, b) => a && b && a.length === b.length && a.every((x) => b.includes(x));
  same(hot, hotObj) ? ok("الحارُّ: المستوردُ = المبنيّ") : fail(`الحارُّ: المستوردُ ≠ كائنُ arHot — ${JSON.stringify([hot?.length, hotObj?.length])}`);
  same(cold, coldObj) ? ok("الباردُ: المستوردُ = المصدَّر") : fail(`الباردُ: المستوردُ ≠ المصدَّر — ${JSON.stringify([cold?.length, coldObj?.length])}`);
}

// ٣) لا استيرادَ افتراضيّاً/شاملاً لـar.json بالشِفرة
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs|js)$/.test(f) ? [p] : []; });
const whole = walk("src").filter((f) => {
  const s = code(f);
  return /import\s+[A-Za-z_$][\w$]*\s*(,\s*\{[^}]*\})?\s+from\s*["'][^"']*\/ar\.json["']/.test(s)
      || /import\s*\*\s*as\s+\w+\s+from\s*["'][^"']*\/ar\.json["']/.test(s)
      || /import\(\s*["'][^"']*\/ar\.json["']\s*\)/.test(s);
});
whole.length ? fail(`استيرادٌ يجرّ ar.json كلَّه: ${whole.join(" ")}`) : ok(`لا استيرادَ شاملاً لـar.json (${walk("src").length} ملفاً مُسح)`);

// ٤) بوابةُ الشاشات
const app = code("src/App.tsx");
const pageDef = /const page[^=]*=\s*\(load\)\s*=>[\s\S]*?\n\n/.exec(app)?.[0] ?? "";
/retryImport\(loadColdAr\)/.test(pageDef) && /retryImport\(load\)/.test(pageDef)
  ? ok("page() تنتظر القاموسَ البارد مع حزمة الشاشة")
  : fail("page() بـApp.tsx ما تنتظر loadColdAr — الشاشاتُ تُرسم قبل نصوصها");

if (POST) {
  console.log("\n▸ انقسامُ القاموس — بعد البناء");
  const MAN = "dist/.vite/manifest.json";
  if (!existsSync(MAN)) { fail(`ماكو ${MAN} — build.manifest مطفأ؟ بلا الخريطة لا يُفحص شيء.`); }
  else {
    const man = JSON.parse(readFileSync(MAN, "utf8"));
    const COLD = cold ?? [];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const coldRe = COLD.length ? new RegExp(`["'\`](${COLD.map(esc).join("|")})\\.`, "g") : null;
    const keyPrefixRe = /keyPrefix\s*:\s*["'`]([A-Za-z_$][\w$]*)/g;
    const coldIn = (keys) => {
      const found = new Set();
      for (const k of keys) {
        if (!coldRe) break;
        const txt = readFileSync("dist/" + man[k].file, "utf8");
        for (const m of txt.matchAll(coldRe)) found.add(m[1]);
        /* و`useTranslation(undefined, { keyPrefix: "cages" })` ثم `t("doorDir")`: لا
         * يرد `"cages.` حرفاً، والنداءُ باردٌ مع ذلك (التدقيقُ العدائيّ). */
        for (const m of txt.matchAll(keyPrefixRe)) if (COLD.includes(m[1])) found.add(m[1]);
      }
      return [...found];
    };
    const closure = (roots) => { const seen = new Set(); const st = [...roots];
      while (st.length) { const k = st.pop(); if (seen.has(k) || !man[k]) continue; seen.add(k); for (const i of man[k].imports ?? []) st.push(i); }
      return seen; };
    const entry = Object.keys(man).find((k) => man[k].isEntry && /(^|\/)index\.html$/.test(k));
    if (!entry) fail("ما لكيت مدخلَ index.html بالخريطة");
    const boot = closure(entry ? [entry] : []);

    // ٥
    const bootCold = coldIn(boot);
    bootCold.length
      ? fail(`ملفّاتُ الإقلاع تذكر نطاقاً بارداً — انقله للحارّ أو أبعد النداءَ عن القشرة: ${bootCold.join(" ")}`)
      : ok(`ملفّاتُ الإقلاع (${boot.size}) لا تذكر أيَّ نطاقٍ بارد (${COLD.length} فُحصت)`);

    // ٨ + ٦
    const pageSrc = new Set([...app.matchAll(/page\(\s*\(\)\s*=>\s*import\(\s*"@\/([^"]+)"\s*\)/g)].map((m) => "src/" + m[1]));
    const pageKey = (k, p) => k === p || k.startsWith(p + ".") || k.startsWith(p + "/index.");
    const isPage = (k) => [...pageSrc].some((p) => pageKey(k, p));
    const pagesSeen = [...pageSrc].filter((p) => Object.keys(man).some((k) => pageKey(k, p)));
    pagesSeen.length === pageSrc.size
      ? ok(`كلُّ شاشات page() لها حزمةٌ بالخريطة (${pageSrc.size})`)
      : fail(`شاشاتٌ بلا حزمة: ${[...pageSrc].filter((p) => !pagesSeen.includes(p)).join(" ")}`);

    const direct = new Set();
    for (const k of boot) for (const d of man[k].dynamicImports ?? []) if (!boot.has(d)) direct.add(d);
    const ungated = [...direct].filter((d) => !isPage(d) && !/\/i18n\/arCold\./.test(d));
    let risky = 0;
    /* كلُّ ما يصله الكسولُ غيرُ المبوَّب — بالاستيراد الثابت **والكسول** معاً،
     * حتى يبلغ شاشةً بـpage() (تنتظر بنفسها) أو القاموسَ البارد. كان يتبع الثابتَ
     * وحدَه فيفوته مكوّنٌ على قفزتين كسولتين من القشرة. */
    const reach = (root) => { const seen = new Set(); const st = [root];
      while (st.length) { const k = st.pop(); if (seen.has(k) || !man[k] || boot.has(k)) continue;
        if (k !== root && (isPage(k) || /\/i18n\/arCold\./.test(k))) continue;
        seen.add(k); for (const i of [...(man[k].imports ?? []), ...(man[k].dynamicImports ?? [])]) st.push(i); }
      return seen; };
    for (const d of ungated) {
      const clo = reach(d);
      const used = coldIn(clo);
      if (used.length) { risky++; fail(`${d} يُستدعى من القشرة بلا page() ويذكر نطاقاً بارداً: ${used.join(" ")} — مرّره من page() أو انتظر loadColdAr قبل رسمه`); }
    }
    if (!risky) ok(`الكسولُ من القشرة بلا بوابة (${ungated.length}) لا يذكر نطاقاً بارداً`);

    // ٧
    const coldKey = Object.keys(man).find((k) => /\/i18n\/arCold\./.test(k));
    if (!coldKey) fail("القاموسُ الباردُ ما له حزمةٌ مستقلّة — هل صار يُستورد ثابتاً؟");
    else if (boot.has(coldKey)) fail("القاموسُ الباردُ داخلَ الإقلاع — الانقسامُ بلا أثر");
    else ok(`القاموسُ الباردُ حزمةٌ كسولة مستقلّة (${man[coldKey].file})`);

    /* ٩) **النصوصُ نفسُها، بالبايت.** الفحوصُ أعلاه تسأل عن الإشارات والحزم،
     * ومرّت كلُّها على انقسامٍ لم يحدث: Rollup يقسم بالوحدة لا بالاسم، فبقيت
     * نصوصُ ar.json كلُّها بالإقلاع وخرجت حزمةُ arCold ١٫٥ كيلو إشاراتٍ إليه
     * (`main.html` ٤٢٠٬٥٧٨ قبل وبعد). فهنا يُبحث عن النصّ العربيّ نفسِه: عيّنةٌ من
     * كلّ نطاقٍ بارد لا تكون بملفّات الإقلاع وتكون بحزمة arCold، وعيّنةٌ من كلّ
     * نطاقٍ حارّ تكون بالإقلاع — وإلا فالفحصُ أعمى لا يرى البايت أصلاً.
     * العيّنة **زوجُ مفتاحٍ ونصّ** كما يكتبه المصغِّر: `doorDir:"اتجاه باب القفص"`.
     * النصُّ وحدَه لا يكفي: أغلبُه يرد بالشِفرة افتراضاً لـ`t("ns.k", "…")` فيُحزم
     * مع شاشته بحقّ — أمّا صيغةُ `مفتاح:"نصّ"` فلا تخرج إلا من القاموس نفسِه.
     * ويُستبعد زوجٌ يتكرّر بنطاقين أو يرد بهذه الصيغة بالشِفرة، أو فيه محارفُ يهرّبها
     * المصغِّر. */
    if (coldKey && hot) {
      const read = (keys) => [...keys].map((k) => readFileSync("dist/" + man[k].file, "utf8")).join("\n");
      const bootText = read(boot);
      const coldClo = closure([coldKey]); for (const b of boot) coldClo.delete(b);
      const coldText = read(coldClo);
      const srcText = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
      const pairs = (o) => Object.entries(o).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v]] : v && typeof v === "object" ? pairs(v) : []);
      const probe = ([k, v]) => `${k}:"${v}"`;
      const owner = new Map();
      for (const ns of ALL) for (const p of new Set(pairs(ar[ns]).map(probe))) owner.set(p, owner.has(p) ? null : ns);
      const sample = (ns) => pairs(ar[ns])
        .filter(([k, v]) => /^[A-Za-z_$][\w$]*$/.test(k) && v.length >= 3 && /[؀-ۿ]/.test(v)
          && !/["'`\\\u0000-\u001f\u007f\u2028\u2029\ufeff]|\$\{|<\/script/i.test(v) && owner.get(probe([k, v])) === ns
          && !new RegExp(`\\b${k}\\s*:\\s*["'\`]${esc(v)}["'\`]`).test(srcText))
        .map(probe).sort((a, b) => b.length - a.length).slice(0, 3);

      const leaked = [], absent = [], blind = [], unsampled = [];
      let probes = 0;
      for (const ns of COLD) {
        const s = sample(ns);
        if (!s.length) { unsampled.push(ns); continue; }
        probes += s.length;
        if (s.some((v) => bootText.includes(v))) leaked.push(ns);
        if (s.some((v) => !coldText.includes(v))) absent.push(ns);
      }
      for (const ns of hot) { const s = sample(ns); if (s.length && !s.every((v) => bootText.includes(v))) blind.push(ns); }

      blind.length
        ? fail(`الفحصُ أعمى: نصوصٌ حارّةٌ غيرُ موجودةٍ بالإقلاع — ${blind.join(" ")} (المصغِّرُ يهرّب العربية؟)`)
        : ok(`الفحصُ يرى البايت: نصوصُ النطاقات الحارّة (${hot.length}) موجودةٌ بملفّات الإقلاع`);
      leaked.length
        ? fail(`نصوصٌ باردةٌ بملفّات الإقلاع — الانقسامُ لم يحدث: ${leaked.join(" ")}`)
        : ok(`لا نصَّ باردَ بالإقلاع (${probes} عيّنةً من ${COLD.length - unsampled.length} نطاقاً)`);
      absent.length
        ? fail(`نصوصٌ باردةٌ ليست بحزمة arCold: ${absent.join(" ")}`)
        : ok("وكلُّها بحزمة arCold نفسِها");
      if (unsampled.length) console.log(`   · بلا عيّنةٍ صالحة (نصوصُها قصيرةٌ أو مكرّرةٌ بالشِفرة): ${unsampled.join(" ")}`);
    }
  }
}

console.log(`\n${fails ? "✗" : "✓"} i18n-split-guard${POST ? " (بعد البناء)" : ""}: ${fails ? fails + " فشلت" : "كلُّ الفحوص عبرت"}`);
process.exit(fails ? 1 : 0);
