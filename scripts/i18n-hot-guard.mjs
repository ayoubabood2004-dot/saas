/* ============================================================================
 * حارسُ الإقلاع الحارّ — «شِفرةُ الإقلاع لا تقرأ إلا النصفَ الحارّ من القاموس».
 *
 * ── لماذا ─────────────────────────────────────────────────────────────────
 * `ar.json` كلُّه كان بحزمة الإقلاع (٧٨ كيلو مضغوطة، ٥٥٪ من `repo-*.js`)، فكلُّ
 * نصٍّ جديدٍ لشاشةٍ عميقةٍ كان يُدفع من مسار الإقلاع — ثلاثُ رفعاتٍ للسقف بثلاثة
 * أيام. فقُسم القاموسُ عند البناء (`scripts/i18n-split.mjs`): نصفٌ حارٌّ مع
 * القشرة، ونصفٌ باردٌ تنتظره كلُّ صفحةٍ عبر `page()`.
 *
 * والقسمةُ صحيحةٌ ما دامت شِفرةُ الإقلاع لا تقرأ مفتاحاً بارداً. فإن قرأته رسمت
 * القشرةُ (الشريطُ الجانبيّ، العلويّ، حارسُ الأخطاء، `repo`…) مفتاحاً خاماً أو
 * نصّاً افتراضياً إنكليزياً على شاشةٍ عربية — أو **خزّنته** بقاعدة العيادة.
 * ولا يظهر هذا بمراجعةِ شِفرة: `t("farm.title")` بملفٍّ إقلاعيٍّ تبدو كأيّ نداء.
 * فالحارسُ يقرأ الرسمَ البيانيّ للاستيرادات فعلاً ويفحص ما تقرؤه كلُّ وحدة.
 *
 * ── النطاق ───────────────────────────────────────────────────────────────
 *   EAGER    = الإغلاقُ الثابت لـ`src/main.tsx` (مِتافايل esbuild — أوسعُ من
 *              رسمِ Vite قليلاً، فيُنذر زيادةً ولا يُفلت).
 *   UNGATED  = ما تستورده وحدةٌ إقلاعيةٌ ديناميكياً **خارج** بوّابة الصفحة
 *              (عدا `App.tsx` — كلُّها داخل `page()` بالقاعدة R4 — و`routePrefetch`
 *              الذي يسخّن ولا يرسم، ومحمّلاتِ القواميس بـ`src/i18n/`)، وما تستورده
 *              هي بدورها. هذه ترسم أو تكتب قبل وصول النصف البارد أيضاً.
 *
 * ── القواعد ──────────────────────────────────────────────────────────────
 *   R1 (EAGER ∪ UNGATED) لا نصَّ حرفيّاً ولا قالبَ ولا وصلَ `+` يقع على مفتاحٍ
 *      بارد، إلا بسطرٍ موسومٍ `/* not-i18n-key: السبب *\/` (نصٌّ يشبه المفتاح وليس
 *      مفتاحاً). والرسالةُ تقول السطرَ الذي يُضاف لـ`hot-paths.json` بالضبط.
 *   R2 (EAGER ∪ UNGATED) مفتاحٌ غيرُ حرفيٍّ بـ`t()`/`i18n.t()`/`i18next.t()` أو
 *      `<Trans i18nKey={…}>` يحتاج `/* i18n-opaque: السبب *\/` بعد أن تتحقّق أن كلَّ
 *      ما قد يصله حارّ. ولا `useTranslation(وسيط)` ولا `keyPrefix` ولا `getFixedT`
 *      ولا `i18n.exists` ولا `getResource*` — تكسر فرضَ المسح الحرفيّ.
 *   R3 (src كلُّه) لا `t()` تُقيَّم على مستوى الوحدة: تُقيَّم مرّةً عند الاستيراد —
 *      و`routePrefetch` يقيّم وحداتِ الصفحات خارج البوّابة — فتُحفظ مفتاحاً خاماً.
 *   R4 `lazy()` بشِفرة الإقلاع (EAGER ∪ UNGATED) لا تكون إلا بـ`src/lib/lazyPage.ts`
 *      (ومنها `page()`)؛ وكلُّ `import()` بـ`App.tsx` وسيطُ `page(` المستوردة منها.
 *   R5 (src كلُّه) لا يستورد `ar.json` إلا `arHot.ts`/`arCold.ts`، ولا يستوردهما إلا
 *      `index.ts`: الحارَّ ثابتاً والباردَ ديناميكياً.
 *   R6 (src كلُّه) `changeLanguage(` بـ`src/i18n/index.ts` و`src/lib/portal.ts` وحدَهما
 *      — التبديلُ يمرّ من `setLang` الذي يحمّل القاموسَ أوّلاً.
 *   R7 كلُّ مسارٍ حارٍّ تقرؤه شِفرةُ الإقلاع فعلاً (عدا نطاقاتِ `store.ar.json`):
 *      سقّاطةٌ — القاموسُ الإقلاعيّ ينكمش ولا يكبر بلا سبب.
 *   R8 سلامةُ الأداة (خروجٌ ٢): ٥٠ وحدةً إقلاعيةً فأكثر، منها App وSidebar وrepo،
 *      ولا صفحةَ من `src/pages/` بينها. وقبل كلّ شيء فحصٌ ذاتيّ على نصوصٍ مصنوعة:
 *      **حارسٌ لا يرى أسوأُ من لا حارس** — يمرّر ويُصدَّق.
 *
 *   node scripts/i18n-hot-guard.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import ts from "typescript";
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitAr, readAr, readHotPaths, readStoreKeys, HOT_PATHS_JSON } from "./i18n-split.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const t0 = Date.now();

/* ── القاموس والقسمة ─────────────────────────────────────────────────────── */
const ar = readAr(ROOT);
const NS = new Set(Object.keys(ar));
const STORE_KEYS = readStoreKeys(ROOT);
let HOT = null;
let setupError = null;
if (!existsSync(path.join(ROOT, HOT_PATHS_JSON))) setupError = `${HOT_PATHS_JSON} غيرُ موجود — لا قائمةَ حارّة، فلا يُعرف ما يحقّ لشِفرة الإقلاع أن تقرأه`;
else {
  try { HOT = readHotPaths(ROOT); splitAr(ar, HOT, STORE_KEYS); }
  catch (e) { setupError = `${HOT_PATHS_JSON}: ${e.message}`; HOT = null; }
}

const leaves = [];
const nodes = new Set();
(function walk(o, p) {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k;
    // المصفوفةُ ورقةٌ واحدة: تُقرأ بـreturnObjects كاملة.
    if (v && typeof v === "object" && !Array.isArray(v)) { nodes.add(q); walk(v, q); } else leaves.push(q);
  }
})(ar, "");
const leafSet = new Set(leaves);
const under = (p) => leaves.filter((l) => l === p || l.startsWith(p + "."));
const PLURAL = ["_zero", "_one", "_two", "_few", "_many", "_other"];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nsOf = (v) => { const m = /^([A-Za-z_$][\w$]*)\./.exec(v); return m && NS.has(m[1]) ? m[1] : null; };
const isHotIn = (hot) => (leaf) => hot.some((p) => leaf === p || leaf.startsWith(p + "."));

/** الأوراقُ التي قد يقرؤها نصٌّ حرفيّ؛ [] = ليس مفتاحاً بـar.json (يتيمٌ أو شبيه — ليس شأنَ هذا الحارس). */
function touchedByLiteral(v, appended) {
  if (leafSet.has(v)) return [v];
  if (nodes.has(v)) return under(v);
  const pl = PLURAL.map((s) => v + s).filter((k) => leafSet.has(k));
  if (pl.length) return pl;
  if (appended || /[._-]$/.test(v)) return leaves.filter((l) => l.startsWith(v) && l.length > v.length);
  return [];
}
function touchedByTemplate(parts) {
  const re = new RegExp("^" + parts.map(escRe).join("[^]*?") + "$");
  const hit = new Set();
  for (const k of [...leafSet, ...nodes]) if (re.test(k)) for (const l of under(k)) hit.add(l);
  for (const l of leaves) for (const s of PLURAL) if (l.endsWith(s) && re.test(l.slice(0, -s.length))) hit.add(l);
  return [...hit];
}
/** أدقُّ مسارٍ يضمّ هذه الأوراق — «السطرُ الذي يُضاف» بالرسالة. */
function commonPath(ls) {
  let segs = ls[0].split(".");
  for (const l of ls.slice(1)) {
    const s = l.split(".");
    let i = 0;
    while (i < segs.length && i < s.length && segs[i] === s[i]) i++;
    segs = segs.slice(0, i);
  }
  return segs.join(".") || ls[0].split(".")[0];
}

/* ── الماسح ───────────────────────────────────────────────────────────────── */
const T_CALLEES = new Set(["t", "i18n.t", "i18next.t"]);
const BANNED_MEMBERS = new Set(["getFixedT", "getResource", "getResourceBundle", "getDataByLanguage"]);
const LAZY_HOME = "src/lib/lazyPage.ts";
const LANG_SWITCHERS = new Set(["src/i18n/index.ts", "src/lib/portal.ts"]);

/** مسارُ وحدةٍ مستورَدة بصيغةٍ موحّدة (بلا امتداد ts/tsx/js، والـjson يبقى) أو null لحزمةٍ خارجية. */
function resolveSpec(fromFile, spec) {
  const s = spec.split("?")[0];
  let p;
  if (s.startsWith("@/")) p = "src/" + s.slice(2);
  else if (s.startsWith(".")) p = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), s));
  else return null;
  return p.replace(/\.(tsx?|m?js)$/, "");
}
const AR_JSON_ID = "src/i18n/ar.json", AR_HOT_ID = "src/i18n/arHot", AR_COLD_ID = "src/i18n/arCold";

function inFunction(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p)) return true;
    if (ts.isPropertyDeclaration(p)) return !(ts.getCombinedModifierFlags(p) & ts.ModifierFlags.Static);
    if (ts.isClassStaticBlockDeclaration(p)) return false;
  }
  return false;
}
/** مفتاحٌ مرئيٌّ للمسح: نصٌّ حرفيّ، أو قالبٌ رأسُه نطاق، أو شرطٌ/اختيارٌ كلُّ فروعه كذلك. */
function isVisibleKey(e) {
  if (ts.isParenthesizedExpression(e)) return isVisibleKey(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (ts.isTemplateExpression(e)) return !!nsOf(e.head.text);
  if (ts.isConditionalExpression(e)) return isVisibleKey(e.whenTrue) && isVisibleKey(e.whenFalse);
  return false;
}

/**
 * يمسح ملفّاً واحداً ويرجع ما وجد مصنّفاً بقاعدته. `startup` = الملفّ بشِفرة
 * الإقلاع (EAGER ∪ UNGATED) فتنطبق عليه R1/R2/R4-lazy. `hot` = القائمةُ الحارّة.
 */
function scanFile(file, text, { startup, hot }) {
  const isHot = isHotIn(hot);
  const out = { findings: [], usedHot: new Set() };
  const add = (rule, line, msg) => out.findings.push({ rule, file, line, msg });
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split(/\r?\n/);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const endLineOf = (n) => sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
  const marked = (n, tag) => {
    const re = new RegExp(`/\\*\\s*${tag}:\\s*[^*\\s]`);
    for (let l = lineOf(n); l <= endLineOf(n); l++) if (re.test(lines[l - 1] ?? "")) return true;
    return false;
  };
  const calleeText = (c) => (ts.isIdentifier(c.expression) || ts.isPropertyAccessExpression(c.expression)) ? c.expression.getText(sf) : "";

  // ربطاتُ `lazy` من react: `lazy` (ولو بـas)، و`React.lazy` عبر الافتراضيّ أو النطاق.
  const lazyNames = new Set();
  const reactNs = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== "react") continue;
    const ic = st.importClause;
    if (!ic || ic.isTypeOnly) continue;
    if (ic.name) reactNs.add(ic.name.text);
    const nb = ic.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) reactNs.add(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly && (el.propertyName ?? el.name).text === "lazy") lazyNames.add(el.name.text);
  }
  const inTypePosition = (n) => { for (let p = n.parent; p; p = p.parent) { if (ts.isTypeNode(p) && !ts.isExpressionWithTypeArguments(p)) return true; if (ts.isStatement(p)) return false; } return false; };

  const record = (spec, kind, n) => {
    const id = resolveSpec(file, spec);
    if (!id) return;
    const where = lineOf(n);
    if (id === AR_JSON_ID && file !== "src/i18n/arHot.ts" && file !== "src/i18n/arCold.ts") {
      add("R5", where, `يستورد ar.json مباشرةً — القاموسُ كلُّه يعود لمسار الإقلاع. استورد النصوصَ من "@/i18n" (i18next) لا الملفّ`);
    }
    if (id === AR_HOT_ID && !(file === "src/i18n/index.ts" && kind === "static")) {
      add("R5", where, `يستورد arHot${kind === "static" ? "" : " ديناميكياً"} — لا يستورده إلا src/i18n/index.ts استيراداً ثابتاً`);
    }
    if (id === AR_COLD_ID && !(file === "src/i18n/index.ts" && kind === "dynamic")) {
      add("R5", where, `يستورد arCold${kind === "dynamic" ? " ديناميكياً" : " ثابتاً"} — لا يستورده إلا ensureDictionary() بـsrc/i18n/index.ts بـimport() ديناميكيّ`);
    }
  };

  const visit = (n) => {
    // R5: الاستيراداتُ الثابتة وإعادةُ التصدير
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(n) ? !!n.importClause?.isTypeOnly : n.isTypeOnly;
      if (!typeOnly) record(n.moduleSpecifier.text, "static", n);
    }

    // R1: نصٌّ حرفيٌّ / قالبٌ يقع على مفاتيح القاموس
    if (startup) {
      let touched = null, shown = null;
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && nsOf(n.text)
          && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isLiteralTypeNode(n.parent)
          && !(ts.isCallExpression(n.parent) && n.parent.expression.kind === ts.SyntaxKind.ImportKeyword)) {
        const appended = ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken && n.parent.left === n;
        touched = touchedByLiteral(n.text, appended);
        shown = JSON.stringify(n.text);
      } else if (ts.isTemplateExpression(n) && nsOf(n.head.text)) {
        touched = touchedByTemplate([n.head.text, ...n.templateSpans.map((s) => s.literal.text)]);
        shown = n.getText(sf);
      }
      if (touched && touched.length && !marked(n, "not-i18n-key")) {
        for (const l of touched) for (const p of hot) if (l === p || l.startsWith(p + ".")) out.usedHot.add(p);
        const cold = touched.filter((l) => !isHot(l));
        if (cold.length) {
          add("R1", lineOf(n), `يقرأ ${shown.length > 70 ? shown.slice(0, 70) + "…" : shown} ⇐ ${cold.length} مفتاحاً بارداً (مثل ${cold.slice(0, 3).join("، ")}). إمّا أضف  "${commonPath(cold)}",  إلى "hot" بـ${HOT_PATHS_JSON} (بايتاتُ إقلاعٍ — قِسها بـstore-weight-guard)، أو انقل الشِفرةَ إلى وحدةٍ خلف page()، أو إن لم يكن مفتاحاً فوسّم السطرَ /* not-i18n-key: السبب */`);
        }
      }
    }

    if (ts.isCallExpression(n)) {
      const callee = calleeText(n);
      // R5: import() و require()
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) record(n.arguments[0].text, "dynamic", n);
      if (callee === "require" && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) record(n.arguments[0].text, "static", n);
      if (T_CALLEES.has(callee) && n.arguments.length) {
        // R3: t() على مستوى الوحدة
        if (!inFunction(n)) add("R3", lineOf(n), `${callee}() تُقيَّم على مستوى الوحدة — مرّةً عند الاستيراد، قبل النصف البارد وقبل أيّ تبديل لغة (و routePrefetch يقيّم الصفحاتِ خارج البوّابة). انقلها داخل دالّة/مكوّن`);
        // R2: مفتاحٌ غيرُ مرئيّ
        if (startup && !isVisibleKey(n.arguments[0]) && !marked(n, "i18n-opaque")) {
          add("R2", lineOf(n), `${callee}(${n.arguments[0].getText(sf).slice(0, 60)}) بمفتاحٍ لا يراه المسح بشِفرة الإقلاع — تحقّق أن كلَّ مفتاحٍ يصله حارّ ثم وسّمه /* i18n-opaque: السبب */`);
        }
      }
      // R6: تبديلُ اللغة
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "changeLanguage" && !LANG_SWITCHERS.has(file)) {
        add("R6", lineOf(n), "changeLanguage( مباشرةً — التبديلُ يمرّ من setLang() (src/i18n/index.ts) الذي يحمّل الحزمةَ ونصفَ العربية البارد قبل الحفظ وقلب الاتجاه");
      }
      if (startup) {
        if (callee === "useTranslation" && n.arguments.length) add("R2", lineOf(n), "useTranslation(وسيط) بشِفرة الإقلاع — نطاقٌ/keyPrefix يُخفي المفاتيحَ عن المسح الحرفيّ");
        if (ts.isPropertyAccessExpression(n.expression)) {
          const m = n.expression.name.text, obj = n.expression.expression.getText(sf);
          if (BANNED_MEMBERS.has(m) || (m === "exists" && /^(i18n|i18next)$/.test(obj))) add("R2", lineOf(n), `${obj}.${m}() بشِفرة الإقلاع — يقرأ القاموسَ بلا مفتاحٍ يراه المسح`);
        }
      }
    }
    if (startup && ts.isIdentifier(n) && n.text === "keyPrefix" && !inTypePosition(n)) add("R2", lineOf(n), "keyPrefix بشِفرة الإقلاع — يُخفي المفاتيحَ عن المسح الحرفيّ");
    if (startup && ts.isJsxAttribute(n) && n.name.getText(sf) === "i18nKey" && n.initializer && ts.isJsxExpression(n.initializer)) {
      const e = n.initializer.expression;
      if (e && !isVisibleKey(e) && !marked(n, "i18n-opaque")) add("R2", lineOf(n), `<Trans i18nKey={${e.getText(sf).slice(0, 60)}}> بمفتاحٍ لا يراه المسح — وسّمه /* i18n-opaque: السبب */ بعد التحقّق`);
    }

    // R4: lazy() بشِفرة الإقلاع خارج lazyPage.ts
    if (startup && file !== LAZY_HOME) {
      const isLazyRef = (ts.isIdentifier(n) && lazyNames.has(n.text) && !ts.isImportSpecifier(n.parent) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n))
        || (ts.isPropertyAccessExpression(n) && n.name.text === "lazy" && ts.isIdentifier(n.expression) && reactNs.has(n.expression.text));
      if (isLazyRef && !inTypePosition(n)) add("R4", lineOf(n), "lazy() بشِفرة الإقلاع — صفحةٌ كسولةٌ هنا تُرسم قبل النصف البارد. استعمل page() من @/lib/lazyPage");
    }

    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/* ── الفحصُ الذاتيّ: حارسٌ لا يرى أسوأُ من لا حارس ───────────────────────── */
{
  const hot = HOT ?? ["common", "errors"];
  const isHot = isHotIn(hot);
  const cold1 = leaves.find((l) => !isHot(l) && /^farm\.[A-Za-z]+$/.test(l)) ?? leaves.find((l) => !isHot(l));
  const coldNs = cold1.split(".")[0];
  const coldNode = [...nodes].find((n) => n.startsWith(coldNs + ".") && !isHot(n) && under(n).length > 1) ?? coldNs;
  const hot1 = leaves.find((l) => isHot(l) && !/[{}]/.test(l));
  const F = "src/lib/__selftest.ts";
  const cases = [
    [`export const A = () => t("${cold1}");`, { R1: 1 }],
    [`export const M = { a: "${cold1}" };`, { R1: 1 }],
    ["export const B = (k: string) => t(`" + coldNode + ".${k}`);", { R1: 1 }],
    [`export const C = (x: string) => "${coldNs}." + x;`, { R1: 1 }],
    [`export const D = () => t("${hot1}");`, {}],
    [`export const E = (x: string) => x.startsWith("${cold1}"); /* not-i18n-key: اسمُ حدثٍ بسجلّ التدقيق */`, {}],
    [`export const G = (key: string) => t(key);`, { R2: 1 }],
    [`export const H = (key: string) => t(key); /* i18n-opaque: لا يصلها إلا errors.* */`, {}],
    [`export const L = t("${hot1}");`, { R3: 1 }],
    [`import { lazy as later } from "react";\nexport const P = later(() => import("./x"));`, { R4: 1 }],
    [`import ar from "../i18n/ar.json";\nexport const Q = () => ar;`, { R5: 1 }],
    [`export const S = (i18n: { changeLanguage(l: string): void }) => i18n.changeLanguage("ar");`, { R6: 1 }],
  ];
  let blind = 0;
  for (const [src, want] of cases) {
    const { findings } = scanFile(F, src, { startup: true, hot });
    const got = {};
    for (const f of findings) got[f.rule] = (got[f.rule] ?? 0) + 1;
    const rules = new Set([...Object.keys(want), ...Object.keys(got)]);
    const off = [...rules].filter((r) => (got[r] ?? 0) !== (want[r] ?? 0));
    if (off.length) { blind++; console.error(`   ✗ فحصٌ ذاتيّ: الحارسُ لا يرى كما يدّعي — ${off.map((r) => `${r} ${got[r] ?? 0}/${want[r] ?? 0}`).join("، ")} ← ${src.replace(/\n/g, " ⏎ ")}`); }
  }
  if (blind) { console.error(`\n✗ i18n-hot-guard: الفحصُ الذاتيّ فشل (${blind}/${cases.length}) — عطلٌ بالأداة، ولا يُصدَّق مرورُها.`); process.exit(2); }
  console.log(`   ✓ فحصٌ ذاتيّ: ${cases.length} نصوصٍ مصنوعة، كلٌّ صُنّف كما يجب`);
}

/* ── الرسمُ البيانيّ للاستيرادات ──────────────────────────────────────────── */
const alias = {
  name: "alias-at",
  setup(b) {
    const exts = ["", ".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"];
    // أوّلاً: ما يحلّه Vite وحدَه (`?raw` نصٌّ لا وحدة، و`virtual:`) — خارجيّ.
    b.onResolve({ filter: /^virtual:|\?/ }, (a) => ({ path: a.path, external: true }));
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = path.join(ROOT, "src", a.path.slice(2));
      for (const e of exts) if (existsSync(base + e) && statSync(base + e).isFile()) return { path: base + e };
      return undefined;
    });
    b.onResolve({ filter: /\.(css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|wav|sql|wasm)$/ }, (a) => ({ path: a.path, external: true }));
  },
};
const res = await esbuild.build({
  absWorkingDir: ROOT, entryPoints: ["src/main.tsx"], bundle: true, splitting: true, format: "esm", platform: "browser",
  outdir: "__i18n_hot_guard_never_written__", write: false, metafile: true, logLevel: "error",
  loader: { ".json": "json" }, define: { __BUILD_AT__: '"x"' }, jsx: "automatic", plugins: [alias],
});
const inputs = res.metafile.inputs;
const posix = (p) => p.split(path.sep).join("/");
const closure = (starts, skip = new Set()) => {
  const s = new Set(starts), q = [...starts];
  while (q.length) {
    const c = q.shift();
    for (const i of inputs[c]?.imports ?? []) {
      if (i.external || i.kind === "dynamic-import" || s.has(i.path) || skip.has(i.path)) continue;
      s.add(i.path); q.push(i.path);
    }
  }
  return s;
};
const EAGER = closure(["src/main.tsx"]);
const GATED_IMPORTERS = new Set(["src/App.tsx", "src/lib/routePrefetch.ts"]);
const ungatedFrom = (set) => {
  const roots = [];
  for (const f of set) {
    if (GATED_IMPORTERS.has(posix(f)) || posix(f).startsWith("src/i18n/")) continue;
    for (const i of inputs[f]?.imports ?? []) if (i.kind === "dynamic-import" && !i.external && posix(i.path).startsWith("src/")) roots.push(i.path);
  }
  return roots;
};
// UNGATED حتى الاستقرار: ما تستورده وحدةٌ غيرُ مبوَّبةٍ ديناميكياً غيرُ مبوَّبٍ أيضاً.
let UNGATED = new Set();
for (;;) {
  const next = closure(ungatedFrom(new Set([...EAGER, ...UNGATED])), EAGER);
  if (next.size === UNGATED.size) break;
  UNGATED = next;
}
const srcOf = (set) => [...set].map(posix).filter((f) => f.startsWith("src/") && /\.tsx?$/.test(f));
const eagerSrc = srcOf(EAGER), ungatedSrc = srcOf(UNGATED);

/* R8: سلامةُ الرسم — صفرُ وحداتٍ ليس نظافة، هو عطلُ أداة */
{
  const must = ["src/App.tsx", "src/components/Sidebar.tsx", "src/lib/repo.ts"];
  const missing = must.filter((m) => !eagerSrc.includes(m));
  const pages = eagerSrc.filter((f) => f.startsWith("src/pages/"));
  if (eagerSrc.length < 50 || missing.length || pages.length) {
    console.error(`✗ R8 رسمُ الإقلاع لا يُصدَّق: ${eagerSrc.length} وحدة${missing.length ? `، ينقصه ${missing.join("، ")}` : ""}${pages.length ? `، وفيه صفحاتٌ ثابتة: ${pages.join("، ")} (صفحةٌ بالإقلاع تُرسم بلا بوّابة)` : ""}`);
    process.exit(2);
  }
}

/* ── التطبيق ─────────────────────────────────────────────────────────────── */
const findings = [];
if (setupError) findings.push({ rule: "R0", file: HOT_PATHS_JSON, line: 1, msg: setupError });
const hotForScan = HOT ?? [];
const startupSet = new Set([...eagerSrc, ...ungatedSrc]);
/* الجردُ بالمجلّد لا بنمط `src/**\/*.ts`: ذاك النمطُ بـgit يشترط مجلّداً وسيطاً،
 * فيُسقط `src/App.tsx` و`src/main.tsx` — أهمَّ ملفّين هنا — بصمت (مقيس). */
const all = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts") && existsSync(path.join(ROOT, f)));
if (!all.includes("src/App.tsx") || !all.includes("src/main.tsx")) { console.error("✗ R8 جردُ src لم يضمّ App.tsx وmain.tsx — عطلٌ بالأداة"); process.exit(2); }
if (all.length < 100) { console.error(`✗ R8 جردُ src رجع ${all.length} ملفاً — عطلٌ بالأداة لا نظافة`); process.exit(2); }
const used = new Set();
for (const f of all) {
  const text = readFileSync(path.join(ROOT, f), "utf8");
  const r = scanFile(f, text, { startup: startupSet.has(f), hot: hotForScan });
  if (!HOT) r.findings = r.findings.filter((x) => x.rule !== "R1"); // بلا قائمةٍ حارّة كلُّ مفتاحٍ «بارد» — R0 يكفي
  findings.push(...r.findings);
  for (const p of r.usedHot) used.add(p);
}

/* R4 بـApp.tsx: كلُّ import() وسيطُ page(، وpage هي المستوردة من lazyPage */
{
  const f = "src/App.tsx";
  const sf = ts.createSourceFile(f, readFileSync(path.join(ROOT, f), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const importsPage = sf.statements.some((s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)
    && resolveSpec(f, s.moduleSpecifier.text) === "src/lib/lazyPage"
    && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings)
    && s.importClause.namedBindings.elements.some((e) => e.name.text === "page" && (e.propertyName ?? e.name).text === "page"));
  if (!importsPage) findings.push({ rule: "R4", file: f, line: 1, msg: "App.tsx لا تستورد page من @/lib/lazyPage — صفحاتُها لا تنتظر النصفَ البارد" });
  let paged = 0;
  const visit = (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === "page") {
      findings.push({ rule: "R4", file: f, line: lineOf(n), msg: "تعريفٌ محلّيٌّ لـpage بـApp.tsx يحجب page() التي تنتظر النصفَ البارد" });
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      let ok = false;
      for (let c = n, p = n.parent; p; c = p, p = p.parent) {
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "page" && p.arguments[0] === c) { ok = true; break; }
        if (ts.isStatement(p)) break;
      }
      if (ok) paged++;
      else findings.push({ rule: "R4", file: f, line: lineOf(n), msg: "import() بـApp.tsx خارج page( — ما يُحمَّل هنا يُرسم قبل النصف البارد" });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (paged < 20) { console.error(`✗ R8 App.tsx فيها ${paged} صفحةً عبر page( فقط — تبدّلت الصيغة؟ عطلٌ بالأداة لا نظافة`); process.exit(2); }
}

/* R7: كلُّ مسارٍ حارٍّ مستعمَلٌ بشِفرة الإقلاع — سقّاطة */
if (HOT) {
  for (const p of HOT) {
    if (STORE_KEYS.includes(p) || used.has(p)) continue;
    findings.push({ rule: "R7", file: HOT_PATHS_JSON, line: 1, msg: `المسارُ الحارّ "${p}" لا تقرؤه شِفرةُ الإقلاع — احذفه من "hot" (بايتاتُ إقلاعٍ بلا قارئ). القاموسُ الإقلاعيّ ينكمش ولا يكبر بلا سبب` });
  }
}

const RULE_ORDER = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"];
findings.sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || a.file.localeCompare(b.file) || a.line - b.line);
for (const x of findings) console.error(`   ✗ ${x.rule} ${x.file}:${x.line}${UNGATED.has(x.file) ? " (تُحمَّل ديناميكياً من الإقلاع خارج page())" : ""} — ${x.msg}`);

const ms = Date.now() - t0;
if (findings.length) {
  const by = {};
  for (const x of findings) by[x.rule] = (by[x.rule] ?? 0) + 1;
  console.error(`\n✗ i18n-hot-guard: ${findings.length} موضعاً (${Object.entries(by).map(([r, n]) => `${r}×${n}`).join("، ")}). شِفرةُ الإقلاع لا تقرأ إلا النصفَ الحارّ — وإلا رسمت مفتاحاً خاماً أو إنكليزيةً على شاشةٍ عربية قبل وصول النصف البارد.`);
  process.exit(1);
}
console.log(`✓ i18n-hot-guard: ${eagerSrc.length} وحدةً إقلاعية + ${ungatedSrc.length} خارج البوّابة تقرأ الحارَّ وحدَه؛ ${HOT.length} مساراً حارّاً (مستعمَل ${[...used].filter((p) => HOT.includes(p)).length}، ونطاقاتُ الزائر ${STORE_KEYS.length})؛ ${all.length} ملفاً بلا t() على مستوى الوحدة ولا استيرادٍ مباشرٍ للقاموس (${ms}ms)`);
