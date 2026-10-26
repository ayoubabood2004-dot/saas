/* ============================================================================
 * حارسُ إشعار المستهلكات بشاشات الترجيع (0252) — «يُحمَّل كسولاً، ولا يحجب الفعل».
 *
 * ترجيعُ فاتورةٍ فيها خدمةٌ صُرفت موادُّها يردّ الموادَّ للمخزن (المحفّزاتُ على الجداول)، والشاشةُ تقوله قبل
 * الضغطة وبعدها (التصميم §11.6 و§6.4): المعاينةُ بنافذة التأكيد (ReturnSheet بـForgiveDialog)، و«رجّعنا…»
 * ومعه «سجّلها هدر» بعد الترجيع والحذف (InvoicesPanel) والمرتجع (ReturnsPanel) وتعديلٍ نقّص سطرَ خدمةٍ أو
 * شاله (DeliveryEditDialog). والإشعارُ بقطعة ConsumablesSheet بنطاقها المملوك rcp: استيرادٌ ثابتٌ واحد
 * يُدخلها حزمةَ الشاشة بلا نصوصها، ومفتاحُ rcp. يُقرأ هنا يُرسم خاماً — والفعلُ لا ينتظرها: فشلُ القطعة
 * سطرٌ بحارسٍ بمكانه يُعاد، لا زرٌّ مقفول ولا فاتورةٌ تسقط.
 *
 * ١) نصّاً، بكلّ ملفٍّ من الأربعة: لا استيرادَ ثابتاً لـConsumablesSheet (بالاسم المستعار ولا بمسارٍ نسبيّ،
 *    ولا `import type` ولا `export … from`)؛ ولا مفتاحَ rcp.؛ ومُحمِّلٌ واحد
 *    page(() => import(…).then((m) => ({ default: m.ConsumptionNotice })), ["rcp"]) ولا `import(` غيرُه؛
 *    وكلُّ رسمٍ للقطعة داخل LoadBoundary وSuspense، و«أعد المحاولة» تصنع قطعةً جديدة (`lazy()` يخبّئ
 *    الرفض)؛ وأوضاعُه كما يُنتظر. ويجرّب نفسَه أوّلاً على نصوصٍ مصنوعة.
 *    و«رجّعنا» (0252 + عقدُ ui2) يقرأ دفعةَ الفعل لا المتراكم: كلُّ رسمٍ له يمرّر sentAt وcashBack، وكلُّ طلبِ
 *    ترجيعٍ (refundInvoice، deleteInvoice، returnInvoiceItems، editInvoiceLines) يسبقه مباشرةً
 *    `… = performance.now();` — لحظةٌ بعد الطلب تُسقط دفعتَه من النافذة، وDate.now ساعةٌ أخرى؛ والمعاينةُ
 *    بنافذة التأكيد تمرّر action (الحذفُ يقول «الحذف» لا «الترجيع»).
 * ٢) سلوكاً (react-mini): الشاشاتُ الأربع الحقيقية مرسومةً، والإشعارُ ونافذةُ التأكيد بديلان يكتبان ما وصلهما:
 *    المعاينةُ بسطر خدمةٍ وحده وبأهداف «الكمية بعد»، و«رجّعنا» بعد النجاح يبقى حتى يُغلق، والحذفُ يُبقي
 *    النافذةَ بسطر النجاح حتى «تم»، والتعديلُ يبلّغ مضيفَه عند الإغلاق (مضيفٌ يغلقها بـonSaved لا يُسقطها)،
 *    وفشلُ القطعة لا يقفل زرّ التأكيد. ولا طلبَ للقطعة لفاتورةٍ بلا سطر خدمة.
 *    والمعاينةُ وما «ترجع للرف» يُبنيان على سطور الفاتورة: سطورٌ لم تصل تُقال بمكانها بإعادة — لا سطورُ
 *    فاتورةٍ اختيرت قبلها (فشلاً أو جواباً متأخّراً)، ولا محرّرُ تعديلٍ فارغ يقول «لا نتائج» عن مادّةٍ بالرفّ،
 *    وحوضُ أقسامٍ ما وصل يُقال لا يُبلع.
 *    ولحظةُ الطلب: sentAt بين الضغطة والطلب نفسِه (الساعةُ تقفز ثانيةً عند كلّ طلب)، وcashBack ما ردّته الأمُّ
 *    من مالٍ بهذا الفعل (ترجيعُ مدفوعةٍ نعم ودينٍ لا، والحذفُ والتعديلُ لا، والمرتجعُ بما يخرج من الدرج).
 *    (w5a) والتعديلُ الذي **رفع** سطرَ خدمةٍ بخدمته يبقى كالنقص بالإشعار حتى «تم» — الربطُ يصرف حالةً أكثر بلا منع وقد
 *    تنزل المادّةُ تحت الصفر، فلا تُغلق النافذةُ صامتة (سطرٌ بلا خدمة زاد يُغلق كما كان). وإشعارُ المرتجع أوّلُ العمود
 *    الأيسر قبل البحث والفواتير (بالهاتف عمودٌ واحد) والشاشةُ تمرّره لمكانه مرّةً، ولا يعود برجوعٍ من فاتورةٍ تالية.
 *    والطفرةُ دالّةٌ على النصّ أيضاً (طفرةُ نقل: الإشعارُ يرجع تحت «خلاصة المرتجع»).
 *
 * ويقول ما فحص ويفشل على صفر. و`--mutants` يكسر الملفّات الأربعة بالذاكرة (الملفُّ لا يُمسّ) ويشترط أن
 * تُسقط كلُّ طفرةٍ فحصاً — وطفرةٌ لا يجد نصُّها مكانَه تُفشل كذلك، ومثلُها طفرةٌ لا تنبني (لم يُفحص فيها شيء).
 * ولإثبات أن الفحوصَ تمسك ما قبلها:
 * REVERSAL_SRC_DIR=<جذرٌ فيه src/components/retail/…> يفحص الشاشاتِ الأربع من هناك بدل المستودع.
 *
 *   node scripts/reversal-notice-guard.mjs
 *   node scripts/reversal-notice-guard.mjs --mutants
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTICE = "src/components/retail/ConsumablesSheet";
/** الملفّاتُ الأربعة وما يُنتظر منها. */
const FILES = {
  "src/components/retail/ForgiveDialog.tsx": { modes: ["preview"], previewTargets: true, previewAction: true },
  "src/components/retail/InvoicesPanel.tsx": { modes: ["returned"], sheet: "consumption", requests: ["refundInvoice", "deleteInvoice"] },
  "src/components/retail/ReturnsPanel.tsx": { modes: ["returned"], sheet: "targets", requests: ["returnInvoiceItems"] },
  "src/components/retail/DeliveryEditDialog.tsx": { modes: ["returned"], requests: ["editInvoiceLines"] },
};

/* ── ١) النصّ ─────────────────────────────────────────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** مُحدِّدٌ محلولٌ لمسارٍ من الجذر بلا امتداد (null لحزمةٍ خارجية). */
const resolveSpec = (fileRel, spec) => {
  let r = null;
  if (spec.startsWith("@/")) r = "src/" + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) r = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), spec));
  return r ? r.replace(/\.(tsx?|jsx?|mjs)$/, "").replace(/\/index$/, "") : null;
};
const LOADER = /const\s+(\w+)\s*=\s*\(\)\s*=>\s*page\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)\s*\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\(\{\s*default:\s*\3\.(\w+)\s*\}\)\s*\)\s*,\s*\[([^\]]*)\]\s*\)/g;

/** يفحص نصَّ ملفٍّ واحد: يرجع الأخطاءَ وما وجده (المُحمِّل، المكوّن، الرسوم وأوضاعها). */
export function checkText(rel, text, want) {
  const errs = [];
  const s = strip(text);
  const base = path.posix.basename(rel);
  // استيرادٌ ثابت بأيّ صيغة: import … from / export … from / import "…" / require("…")
  for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const m of s.matchAll(re)) if (resolveSpec(rel, m[1]) === NOTICE) errs.push(`${base}: استيرادٌ ثابتٌ لـConsumablesSheet («${m[0]}») — القطعةُ تدخل حزمةَ الشاشة بلا نطاقها rcp؛ حمّلها بـpage(() => import(…), ["rcp"])`);
  }
  if (/["'`]rcp\.[A-Za-z_]/.test(s)) errs.push(`${base}: يقرأ مفتاحاً من rcp — النطاقُ مملوكٌ لـConsumablesSheet.tsx وحدها (i18n-owned-guard)؛ الشاشةُ ترسم الإشعارَ ولا تقرأ نصَّه`);
  const dyn = [...s.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].filter((m) => resolveSpec(rel, m[1]) === NOTICE).length;
  const loaders = [...s.matchAll(LOADER)].filter((m) => resolveSpec(rel, m[2]) === NOTICE);
  if (loaders.length !== 1) errs.push(`${base}: ${loaders.length} مُحمِّلٌ لـConsumablesSheet بصيغة page(() => import(…).then((m) => ({ default: m.ConsumptionNotice })), ["rcp"]) — المطلوب واحد`);
  if (dyn !== loaders.length) errs.push(`${base}: ${dyn} نداءَ import() لـConsumablesSheet و${loaders.length} مُحمِّلاً بـpage(…, ["rcp"]) — نداءٌ خارجه يرسم بلا نطاقه`);
  const out = { errs, loader: null, comp: null, mounts: [], requests: [] };
  if (loaders.length !== 1) return out;
  const [, loader, , , exported, owned] = loaders[0];
  out.loader = loader;
  if (exported !== "ConsumptionNotice") errs.push(`${base}: المُحمِّلُ يأخذ m.${exported} — الشاشةُ ترسم الإشعارَ (ConsumptionNotice) لا الورقة`);
  if (!/["']rcp["']/.test(owned)) errs.push(`${base}: المُحمِّلُ بلا نطاقه ["rcp"] — الإشعارُ يُرسم بمفاتيحَ خامّة`);
  const binds = [...s.matchAll(new RegExp(`let\\s+(\\w+)\\s*=\\s*${loader}\\(\\)\\s*;`, "g"))];
  if (binds.length !== 1) { errs.push(`${base}: ${binds.length} ربطاً «let X = ${loader}();» — المطلوب واحد (وإعادةُ المحاولة تعيد ربطه)`); return out; }
  const comp = binds[0][1];
  out.comp = comp;
  // الوسومُ بالترتيب: فتحٌ وإغلاق LoadBoundary وSuspense، ورسمُ المكوّن.
  const tokens = [];
  for (const m of s.matchAll(new RegExp(`<\\/?(LoadBoundary|Suspense)\\b|<${comp}\\b`, "g"))) tokens.push({ at: m.index, tok: m[0] });
  const stack = { LoadBoundary: [], Suspense: [] };
  for (const { at, tok } of tokens) {
    const close = tok.startsWith("</");
    const name = tok.replace(/^<\/?/, "");
    if (name === "LoadBoundary" || name === "Suspense") { if (close) stack[name].pop(); else stack[name].push(at); continue; }
    const end = s.indexOf("/>", at);
    const props = s.slice(at, end < 0 ? at + 400 : end);
    const mode = /\bmode="(\w+)"/.exec(props)?.[1] ?? null;
    const lb = stack.LoadBoundary[stack.LoadBoundary.length - 1];
    const sp = stack.Suspense[stack.Suspense.length - 1];
    const line = s.slice(0, at).split("\n").length;
    out.mounts.push({ mode, line, targets: /\btargets=/.test(props), sentAt: /\bsentAt=\{/.test(props), cashBack: /\bcashBack=\{/.test(props), action: /\baction=\{/.test(props) });
    if (lb === undefined) errs.push(`${base}:${line}: <${comp}> خارج LoadBoundary — فشلُ القطعة يُسقط الشاشةَ كلَّها (حارسُ المسار العامّ)`);
    if (sp === undefined) errs.push(`${base}:${line}: <${comp}> خارج Suspense — القطعةُ الكسولة تعلّق أقربَ حدٍّ فوقها`);
    if (lb !== undefined && !new RegExp(`\\b${comp}\\s*=\\s*${loader}\\(\\)`).test(s.slice(lb, at))) errs.push(`${base}:${line}: «أعد المحاولة» لا تصنع قطعةً جديدة (${comp} = ${loader}()) — lazy() يخبّئ الرفضَ فالمحاولةُ لا تحاول شيئاً`);
    if (!/\binvoiceIds=\{\[/.test(props)) errs.push(`${base}:${line}: <${comp}> بلا invoiceIds={[…]}`);
    if (want.previewTargets && mode === "preview" && !/\btargets=/.test(props)) errs.push(`${base}:${line}: المعاينةُ بلا targets — المرتجعُ الجزئيّ يُقال كأنه الفاتورةُ كلُّها`);
    if (want.previewAction && mode === "preview" && !/\baction=\{/.test(props)) errs.push(`${base}:${line}: المعاينةُ بلا action — نافذةُ الحذف تقول «الترجيع يرجّع» عن حذف`);
    if (mode === "returned" && !/\bsentAt=\{/.test(props)) errs.push(`${base}:${line}: «رجّعنا» بلا sentAt — بلا لحظة الطلب لا يعرف أيَّ دفعةٍ بالدفتر دفعتُه، فلا يقول شيئاً`);
    if (mode === "returned" && !/\bcashBack=\{/.test(props)) errs.push(`${base}:${line}: «رجّعنا» بلا cashBack — «رجعت الفلوس» لا تُقال بلا علامة المال من الأمّ`);
  }
  // لحظةُ الطلب: كلُّ طلبِ ترجيعٍ يسبقه مباشرةً «… = performance.now();» — بعده تُسقط دفعتَه، وDate.now ساعةٌ أخرى.
  for (const r of want.requests ?? []) {
    const calls = [...s.matchAll(new RegExp(`\\bawait\\s+repo\\.${r}\\(`, "g"))];
    if (!calls.length) errs.push(`${base}: لا نداءَ «await repo.${r}(» — الحارسُ لا يجد طلبَ الترجيع الذي تُختم لحظتُه`);
    else out.requests.push(`${r}×${calls.length}`);
    for (const m of calls) {
      const before = s.slice(Math.max(0, m.index - 200), m.index);
      if (!/=\s*performance\.now\(\)\s*;\s*(?:(?:const|let)\s+\w+\s*=\s*)?$/.test(before)) {
        errs.push(`${base}:${s.slice(0, m.index).split("\n").length}: repo.${r}( بلا «sentAt = performance.now();» قبله مباشرةً — «رجّعنا» يختار دفعةَ هذا الفعل بها`);
      }
    }
  }
  if (out.mounts.length === 0) errs.push(`${base}: لا رسمَ لـ<${comp}> — الإشعارُ لا يظهر بهذه الشاشة`);
  const modes = [...new Set(out.mounts.map((m) => m.mode))].sort();
  const wantModes = [...want.modes].sort();
  if (out.mounts.length && modes.join() !== wantModes.join()) errs.push(`${base}: أوضاعُ الإشعار [${modes.join("، ")}] والمنتظَر [${wantModes.join("، ")}]`);
  if (want.sheet) {
    const at = s.search(/<ReturnSheetLazy\b/);
    const props = at < 0 ? "" : s.slice(at, s.indexOf("/>", at));
    if (!/\bconsumption=\{/.test(props)) errs.push(`${base}: نافذةُ التأكيد (ReturnSheetLazy) بلا consumption — لا معاينةَ لما يرجع للمخزن قبل الضغطة`);
    else if (want.sheet === "targets" && !/\btargets\b/.test(props)) errs.push(`${base}: المعاينةُ بلا أهداف المرتجع الجزئيّ (targets)`);
  }
  return out;
}

function selfCases() {
  const rel = "src/components/retail/Probe.tsx";
  const GOOD = [
    'import { Suspense, useState } from "react";',
    'import { page } from "@/lib/lazyPage";',
    'import { LoadBoundary } from "@/components/LoadBoundary";',
    'import { repo } from "@/lib/repo";',
    'const loadN = () => page(() => import("@/components/retail/ConsumablesSheet").then((m) => ({ default: m.ConsumptionNotice })), ["rcp"]);',
    "let NLazy = loadN();",
    "/* rcp.waste بتعليق لا يُقرأ */",
    "export function Probe({ id }) {",
    "  const [, setTick] = useState(0);",
    "  const [at, setAt] = useState(null);",
    "  const run = async () => { const sentAt = performance.now(); await repo.refundInvoice(id); setAt(sentAt); };",
    "  return (",
    '    <LoadBoundary scope="x" onRetry={() => { NLazy = loadN(); setTick((n) => n + 1); }}>',
    "      <Suspense fallback={null}>",
    '        <NLazy mode="returned" invoiceIds={[id]} sentAt={at} cashBack={false} />',
    "      </Suspense>",
    "    </LoadBoundary>",
    "  );",
    "}",
  ].join("\n");
  const want = { modes: ["returned"], requests: ["refundInvoice"] };
  // ومعاينةٌ بنافذة تأكيد: action مطلوب.
  const PREVIEW = GOOD.replace('mode="returned"', 'mode="preview"').replace(" sentAt={at} cashBack={false}", ' action={"delete"}');
  const wantPreview = { modes: ["preview"], previewAction: true };
  const add = (line) => GOOD.replace('import { page }', `${line}\nimport { page }`);
  const cases = [
    ["الصحيحُ (والتعليقُ بـrcp. لا يُعدّ) ⇒ يمرّ", GOOD, 0],
    ["استيرادٌ ثابتٌ بالاسم المستعار ⇒ يفشل", add('import { ConsumptionNotice } from "@/components/retail/ConsumablesSheet";'), 1],
    ["import type بمسارٍ نسبيّ ⇒ يفشل", add('import type { ConsumptionNoticeProps } from "./ConsumablesSheet";'), 1],
    ["export … from بمسارٍ أبعد ⇒ يفشل", add('export { ConsumptionNotice } from "../retail/ConsumablesSheet.tsx";'), 1],
    ["مفتاحُ rcp. يُقرأ ⇒ يفشل", GOOD.replace("const [, setTick]", 'const w = t("rcp.waste"); const [, setTick]'), 1],
    ["رسمٌ خارج LoadBoundary ⇒ يفشل", GOOD.replace(/ {4}<LoadBoundary[^\n]*\n/, "").replace("    </LoadBoundary>\n", ""), 1],
    ["رسمٌ بلا Suspense ⇒ يفشل", GOOD.replace("      <Suspense fallback={null}>\n", "").replace("      </Suspense>\n", ""), 1],
    ["مُحمِّلُ الورقة (m.default) ⇒ يفشل", GOOD.replace("m.ConsumptionNotice", "m.default"), 1],
    ["مُحمِّلٌ بلا ['rcp'] ⇒ يفشل", GOOD.replace('["rcp"]', "[]"), 1],
    ["«أعد المحاولة» لا تجدّد القطعة ⇒ يفشل", GOOD.replace("NLazy = loadN(); ", ""), 1],
    ["وضعٌ غيرُ المنتظَر ⇒ يفشل", GOOD.replace('mode="returned"', 'mode="sale"'), 1],
    ["import() خارج المُحمِّل ⇒ يفشل", GOOD.replace("let NLazy", 'const Raw = lazy(() => import("@/components/retail/ConsumablesSheet"));\nlet NLazy'), 1],
    ["لا رسمَ أصلاً ⇒ يفشل", GOOD.replace('        <NLazy mode="returned" invoiceIds={[id]} sentAt={at} cashBack={false} />\n', ""), 1],
    ["«رجّعنا» بلا sentAt ⇒ يفشل", GOOD.replace(" sentAt={at}", ""), 1],
    ["«رجّعنا» بلا cashBack ⇒ يفشل", GOOD.replace(" cashBack={false}", ""), 1],
    ["لحظةُ الطلب بعده ⇒ يفشل", GOOD.replace("const sentAt = performance.now(); await repo.refundInvoice(id);", "await repo.refundInvoice(id); const sentAt = performance.now();"), 1],
    ["لحظةُ الطلب بساعة Date ⇒ يفشل", GOOD.replace("performance.now()", "Date.now()"), 1],
    ["طلبُ الترجيع غائب ⇒ يفشل", GOOD.replace("await repo.refundInvoice(id); ", ""), 1],
    ["معاينةٌ بـaction ⇒ تمرّ", PREVIEW, 0, wantPreview],
    ["معاينةٌ بلا action ⇒ تفشل", PREVIEW.replace(' action={"delete"}', ""), 1, wantPreview],
  ];
  const bad = [];
  for (const [name, text, wantErr, w = want] of cases) {
    const got = checkText(rel, text, w).errs.length;
    if ((wantErr === 0) !== (got === 0)) bad.push(`${name} — خرج ${got} خطأً`);
  }
  return { bad, n: cases.length };
}

/* ── ٢) السلوك ────────────────────────────────────────────────────────────── */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); const s = typeof d === "string" ? d : (opt.defaultValue ?? k); return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); }`;
const icons = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "lucide-react": icons.map((k) => `export const ${k} = () => null;`).join("\n"),
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Badge = ({ children, tone, ...p }) => createElement("x-Badge", p, children);
    export const Skeleton = () => null;
    export const useToast = () => ({ success: (m) => globalThis.__T.toasts.push(["success", m]), error: (m) => globalThis.__T.toasts.push(["error", m]) });`,
  "@/components/Modal": `import { createElement } from "react";
    export const Modal = ({ open, onClose, title, children }) => (open ? createElement("x-Modal", { "data-modal": String(title ?? ""), onClose }, children) : null);`,
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => globalThis.__T.repo[k] });",
  "@/hooks/usePermissions": "export const usePermissions = () => ({ can: () => true, role: 'manager', baseRole: 'manager' });",
  "@/lib/managerOverride": "export const useOverride = () => ({ deviceLocked: false, active: false, restricted: false }); export const capLockedFrom = (_l, _a, can) => !can; export const ownerAccountFrom = () => true;",
  "@/lib/settings": "export const getInvoicesPaged = () => false; export const getDialCode = () => '964';",
  "@/lib/prefetchData": "export const RECENT_DAYS = 15;",
  "@/lib/staffNames": "export const staffNameMap = async () => new Map(); export const staffRoster = async () => [];",
  "./usePrintInvoice": "export const useInvoicePrinter = () => () => {};",
  "@/lib/errors": "export const describeDbError = (e) => String(e?.message ?? e);",
  "@/lib/workspaceClinic": "export const expectedServerClinic = async () => null;",
  "@/hooks/useWaAfterSave": "export const useWaAfterSave = () => async () => {};",
  "@/lib/phone": "export const waNumber = (p) => p;",
  // القطعةُ الكسولة: lazy() حقيقيّ — يُسجَّل كلُّ طلبٍ بنطاقه، والفشلُ يُصنع لنطاقٍ بعينه.
  "@/lib/lazyPage": `import { lazy } from "react";
    export const page = (load, owned = []) => lazy(() => { const ns = owned.join(","); globalThis.__T.loads.push(ns); return globalThis.__T.failNs.has(ns) ? Promise.reject(new Error("chunk_failed:" + ns)) : load(); });`,
  "@/components/retail/ConsumablesSheet": `import { createElement } from "react";
    const v = (x) => (x === undefined ? "absent" : String(x));
    export function ConsumptionNotice(p) { return createElement("x-notice", { "data-notice": p.mode, "data-ids": JSON.stringify(p.invoiceIds), "data-targets": p.targets === undefined ? "absent" : JSON.stringify(p.targets),
      "data-sentat": v(p.sentAt), "data-cashback": v(p.cashBack), "data-action": v(p.action) }); }
    export default function ConsumablesSheet() { return null; }`,
  // نافذةُ التأكيد كما تراها الفاتورةُ والمرتجع: بديلٌ يكتب ما وصله (والحقيقيّةُ تُرسم بنفسها بالقسم «أ»).
  "@/components/retail/ForgiveDialog": `import { createElement } from "react";
    export function ReturnSheet(p) { globalThis.__T.sheet = p; return createElement("x-sheet", { "data-sheet": p.mode, "data-cons": p.consumption == null ? "none" : JSON.stringify(p.consumption) }); }
    export function ForgiveSection() { return null; }`,
};
const OWN = /[\\/]src[\\/]components[\\/]retail[\\/](ForgiveDialog|InvoicesPanel|ReturnsPanel|DeliveryEditDialog)\.tsx$/;

/** الشاشاتُ الأربع بنصوصٍ معطاة (الأصل أو طفرةٌ منه) مع المُرسِم — نسخةُ React واحدة. */
export async function build(sources) {
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export { ReturnSheet } from "./src/components/retail/ForgiveDialog.tsx";',
        'export { InvoiceDetail } from "./src/components/retail/InvoicesPanel.tsx";',
        'export { ReturnsPanel } from "./src/components/retail/ReturnsPanel.tsx";',
        'export { DeliveryEditDialog } from "./src/components/retail/DeliveryEditDialog.tsx";',
        'export { mount } from "./scripts/react-mini-host.js";',
        'export * as React from "react";',
      ].join("\n"),
      resolveDir: ROOT, sourcefile: "reversal-notice-ui.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "reversal-ui",
      setup(b) {
        b.onLoad({ filter: OWN }, (a) => ({ contents: sources[`src/components/retail/${path.basename(a.path)}`], loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUB, a.path) ? { path: a.path, namespace: "rev-stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "rev-stub" }, (a) => ({ contents: STUB[a.path], loader: "jsx", resolveDir: ROOT }));
      },
    }],
  });
  const dir = mkdtempSync(path.join(tmpdir(), "reversal-notice-"));
  const file = path.join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  try { return await import(pathToFileURL(file).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ---- البيانات --------------------------------------------------------------- */
const invoice = (o) => ({ id: "inv-1", status: "paid", total: 150, subtotal: 150, discount: 0, amount_paid: 150, payment_method: "cash",
  payment_details: [{ method: "cash", amount: 150 }], customer_name: null, customer_phone: null, staff_id: null, notes: null,
  print_count: 0, item_count: 2, forgiven: 0, cost_total: 0, profit: 0, created_at: "2026-10-30T10:00:00.000Z", ...o });
const item = (o) => ({ invoice_id: "inv-1", barcode: null, unit_cost: 0, unit_label: null, stock_qty: null, pooled_qty: 0, service_id: null, product_id: null, ...o });
const SVC = item({ id: "it-s", name: "SVC-STERILIZE", product_id: null, service_id: "svc-1", qty: 3, unit_price: 30, line_total: 90 });
const PROD = item({ id: "it-p", name: "PROD-FOOD", product_id: "p1", qty: 2, unit_price: 30, line_total: 60, stock_qty: 2 });
const FEE = item({ id: "it-f", name: "FEE-LINE", product_id: null, service_id: null, qty: 1, unit_price: 5, line_total: 5 });
const P1 = { id: "p1", name: "PROD-FOOD", barcode: null, alt_codes: [], stock: 10, section_id: null, sell_price: 30, purchase_price: 20,
  has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null };

/* ساعةُ الجهاز بيد الفحص: performance.now() = الحقيقيّة + إزاحةٌ تزيد ثانيةً عند كلّ طلبِ ترجيع (stamp) — فلحظةٌ
 * أُخذت بعد الطلب تُرى بعده بلا لبس، وقبله ≤ لحظتِه. تُركَّب داخل الجولة وحدها، ومجدولُ React أخذ الحقيقيّةَ لحظةَ
 * تحميل الحزمة (قبل الجولة). */
const REAL_PERF = globalThis.performance;
let skew = 0;
const SKEWED = { now: () => REAL_PERF.now() + skew, timeOrigin: REAL_PERF.timeOrigin };
/** لحظةُ طلب الترجيع كما يراها الخادم: تُسجَّل ثم تقفز الساعة. */
const stamp = () => { const at = SKEWED.now(); skew += 1000; return at; };

/* ---- الجولةُ الواحدة على نسخةٍ من الشاشات ------------------------------------------ */
export async function runSuite(UI, verbose) {
  globalThis.performance = SKEWED;
  try { return await runChecks(UI, verbose); } finally { globalThis.performance = REAL_PERF; }
}
/* لكلّ شاشةٍ قطعتُها الكسولة بمتغيّرها: lazy() يحفظ أوّلَ نتيجة (نجاحاً أو رفضاً). فأوّلُ مشهدٍ لكلّ شاشة
 * «لا طلبَ للقطعة» (لم تُطلب بعد فالعدُّ يعني شيئاً)، ثمّ فشلُها (يُصنع قبل أن تنجح)، ثمّ الباقي. */
async function runChecks(UI, verbose) {
  const R = { pass: 0, fail: [] };
  const check = (name, cond, detail = "") => {
    if (cond) R.pass++; else R.fail.push(name);
    if (verbose) (cond ? console.log : console.error)(`   ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  };
  const section = (s) => { if (verbose) console.log(`▸ ${s}`); };
  const { React, mount, ReturnSheet, InvoiceDetail, ReturnsPanel, DeliveryEditDialog } = UI;
  const h = React.createElement;
  const reset = (repo = {}) => { globalThis.__T = { repo, toasts: [], loads: [], failNs: new Set(), sheet: null, saved: 0, closed: 0, confirmed: 0, edits: [], returns: [], reqAt: null }; };
  const nodes = (root) => { const out = []; const walk = (n) => { out.push(n); n.children.forEach(walk); }; if (root) walk(root); return out; };
  const textOf = (n) => (n.type === "#text" ? n.text : n.children.map(textOf).join(""));
  const inside = (root, attr, value) => nodes(root).find((n) => n.props && attr in n.props && (value === undefined || String(n.props[attr]) === String(value))) ?? null;
  const btn = (root, s) => nodes(root).find((n) => n.type === "button" && textOf(n).includes(s)) ?? null;
  // الجدولةُ بـsetImmediate (scheduler) وإعادةُ Suspense بالمهامّ الصغرى — فلا مؤقّتات (setTimeout على ويندوز ~١٥ مللي).
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  /** الإزالةُ ثمّ آثارُها: تنظيفُ useEffect يجري بعد الإزالة لا معها. */
  const end = async (ui) => { ui.unmount(); await flush(ui); };
  const propsOf = (n) => (n ? { mode: n.props["data-notice"], ids: JSON.parse(n.props["data-ids"]), targets: n.props["data-targets"],
    sentAt: n.props["data-sentat"], cashBack: n.props["data-cashback"], action: n.props["data-action"] } : null);
  const noticeOf = (ui) => propsOf(ui.find("data-notice"));
  /** sentAt كما مرّرته الأمّ: performance.now() بين الضغطة (t0) وطلبِ الترجيع نفسِه — لا بعده، ولا بساعةٍ أخرى. */
  const sentOk = (n, t0) => { const at = Number(n?.sentAt); return Number.isFinite(at) && at >= t0 && globalThis.__T.reqAt != null && at <= globalThis.__T.reqAt; };
  const when = (n, t0) => `sentAt=${n?.sentAt} t0=${t0} req=${globalThis.__T.reqAt}`;
  const rcpLoads = () => globalThis.__T.loads.filter((x) => x === "rcp").length;
  const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
  const tryCase = async (name, fn) => { try { await fn(); } catch (e) { check(`${name} — رمى`, false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
  const retryIn = async (ui) => { const r = btn(ui.find("data-load-failed"), "common.retry"); if (r) ui.click(r); await flush(ui); return !!r; };

  /* أ) نافذةُ التأكيد الحقيقيّة (ReturnSheet) */
  section("أ) نافذةُ التأكيد: المعاينةُ بسطر خدمةٍ وحده، وبأهدافها، ولا تحجب الزرّ");
  const sheetProps = (o) => ({ mode: "refund", invoice: invoice(), lines: [{ name: "SVC-STERILIZE", qty: 3 }], back: 150, dueBefore: 0, dueAfter: 0, consumed: 0,
    busy: false, onConfirm: () => { globalThis.__T.confirmed++; }, onClose: () => {}, ...o });
  await tryCase("أ", async () => {
    reset();
    let ui = mount(h(ReturnSheet, sheetProps({ consumption: null })));
    await flush(ui);
    check("بلا سطر خدمة (consumption=null): لا إشعارَ ولا طلبَ لقطعته", !ui.find("data-notice") && rcpLoads() === 0, `loads=${globalThis.__T.loads}`);
    await end(ui);
    // فشلُ القطعة: سطرٌ بحارسه، والتأكيدُ يعمل، و«أعد المحاولة» تصنع قطعةً جديدة.
    reset();
    globalThis.__T.failNs.add("rcp");
    ui = await quiet(async () => { const u = mount(h(ReturnSheet, sheetProps({ consumption: {} }))); await flush(u); return u; });
    check("القطعةُ تُطلب بنطاقها المملوك rcp", globalThis.__T.loads.join() === "rcp", `loads=${globalThis.__T.loads}`);
    check("فشلُ قطعة المستهلكات: سطرُ «أعد المحاولة» بمكانه داخل النافذة، ولا إشعار", !!inside(ui.find("data-modal"), "data-load-failed") && !ui.find("data-notice"));
    const okBtn = ui.find("data-return-sheet-ok");
    check("  وزرُّ التأكيد غيرُ مقفول ويؤكّد", !!okBtn && !okBtn.props.disabled && (() => { ui.click(okBtn); return globalThis.__T.confirmed === 1; })());
    globalThis.__T.failNs.clear();
    const retried = await retryIn(ui);
    check("  و«أعد المحاولة» تجيب الإشعار (قطعةٌ جديدة لا الرفضُ المخبَّأ)", retried && noticeOf(ui)?.mode === "preview" && !ui.find("data-load-failed"));
    await end(ui);
    reset();
    ui = mount(h(ReturnSheet, sheetProps({ consumption: {} })));
    await flush(ui);
    const n1 = noticeOf(ui);
    check("ترجيعٌ كامل: المعاينةُ داخل النافذة بوضع preview، للفاتورة نفسها، بلا أهداف (الكلُّ إلى صفر)",
      !!n1 && n1.mode === "preview" && n1.ids.length === 1 && n1.ids[0] === "inv-1" && n1.targets === "absent" && !!inside(ui.find("data-modal"), "data-notice"), JSON.stringify(n1));
    const acts = [n1?.action];
    await end(ui);
    reset();
    const tg = [{ item_id: "it-s", qty: 2 }];
    ui = mount(h(ReturnSheet, sheetProps({ mode: "return", consumption: { targets: tg } })));
    await flush(ui);
    check("مرتجعٌ جزئيّ: الأهدافُ تصل كما هي", noticeOf(ui)?.targets === JSON.stringify(tg), noticeOf(ui)?.targets);
    acts.push(noticeOf(ui)?.action);
    await end(ui);
    reset();
    ui = mount(h(ReturnSheet, sheetProps({ mode: "delete", consumption: {} })));
    await flush(ui);
    check("الحذف: المعاينةُ نفسُها بالنافذة", noticeOf(ui)?.mode === "preview");
    acts.push(noticeOf(ui)?.action);
    check("  وaction: الحذفُ «delete» (تقول «الحذف يرجّع للمخزن») والترجيعُ والمرتجعُ بلاه", JSON.stringify(acts) === JSON.stringify(["absent", "absent", "delete"]), JSON.stringify(acts));
    await end(ui);
  });

  /* ب) الفاتورة (InvoiceDetail): الترجيعُ والحذف */
  section("ب) الفاتورة: المعاينةُ قبل الترجيع والحذف، و«رجّعنا» بعدهما حتى تُغلق");
  const detail = async (inv, items) => {
    reset({
      listInvoiceItems: async () => (items instanceof Error ? Promise.reject(items) : items),
      refundInvoice: async (id) => { globalThis.__T.reqAt = stamp(); return { ...inv, id, status: "refunded" }; },
      deleteInvoice: async () => { globalThis.__T.reqAt = stamp(); },
    });
    let setOpenRef = null;
    const Host = () => {
      const [open, setOpen] = React.useState(inv);
      setOpenRef = setOpen;
      return h(InvoiceDetail, { invoice: open, onClose: () => { globalThis.__T.closed++; setOpen(null); }, onChanged: () => {}, setOpen });
    };
    const ui = mount(h(Host));
    await flush(ui);
    return { ui, setOpen: (x) => setOpenRef(x) };
  };
  const openSheet = async (ui, label) => { const b = btn(ui.container, label); if (!b) throw new Error(`no button ${label}`); ui.click(b); await flush(ui); return ui.find("data-sheet"); };
  const confirm = async (ui) => { globalThis.__T.sheet.onConfirm(); await flush(ui); };
  await tryCase("ب", async () => {
    let { ui, setOpen } = await detail(invoice(), [PROD, FEE]);
    let sh = await openSheet(ui, "Refund");
    check("بلا سطر خدمةٍ بخدمته (مادّةٌ وسطرُ أجرةٍ بلا service_id): نافذةُ الترجيع بلا consumption", sh?.props["data-cons"] === "none", sh?.props["data-cons"]);
    await confirm(ui);
    check("  وبعد الترجيع لا إشعارَ ولا طلبَ لقطعته", !ui.find("data-notice") && rcpLoads() === 0, `loads=${globalThis.__T.loads}`);
    await end(ui);

    // فشلُ القطعة بعد الترجيع: سطرٌ يُعاد، والفاتورةُ كما هي.
    ({ ui } = await detail(invoice(), [SVC]));
    await openSheet(ui, "Refund");
    globalThis.__T.failNs.add("rcp");
    await quiet(() => confirm(ui));
    check("فشلُ القطعة بعد الترجيع: سطرُ «أعد المحاولة» والفاتورةُ مرسومة (أزرارُ الطباعة)", !!ui.find("data-load-failed") && !!btn(ui.container, "Print A4") && !ui.find("data-notice"));
    globalThis.__T.failNs.clear();
    check("  و«أعد المحاولة» تجيب الإشعار", (await retryIn(ui)) && noticeOf(ui)?.mode === "returned");
    await end(ui);

    ({ ui, setOpen } = await detail(invoice(), [SVC, PROD]));
    sh = await openSheet(ui, "Refund");
    check("فاتورةٌ بسطر خدمة: نافذةُ الترجيع تأخذ consumption={} (الكلُّ إلى صفر)", sh?.props["data-sheet"] === "refund" && sh?.props["data-cons"] === "{}", sh?.props["data-cons"]);
    let t0 = performance.now();
    await confirm(ui);
    const n = noticeOf(ui);
    check("بعد الترجيع: «رجّعنا» بوضع returned لهذه الفاتورة، والفاتورةُ مفتوحة", n?.mode === "returned" && n?.ids[0] === "inv-1" && globalThis.__T.closed === 0, JSON.stringify(n));
    check("  ومعه sentAt: performance.now() قبل طلب الترجيع مباشرةً (بين الضغطة والطلب)", sentOk(n, t0), when(n, t0));
    check("  وcashBack=true: مدفوعةٌ رجع مالُها كلُّه للزبون", n?.cashBack === "true", n?.cashBack);
    await flush(ui);
    check("  ويبقى بعد إعادة الرسم", noticeOf(ui)?.mode === "returned");
    setOpen(invoice({ id: "inv-2" }));
    await flush(ui);
    check("  وفتحُ فاتورةٍ أخرى يُخفيه (لا يُرى تحت غيرها)", !ui.find("data-notice"));
    await end(ui);

    // فاتورةُ دين (ما دُفع منها شيء): الترجيعُ يمحو الدين ولا يُخرج نقداً — فلا «رجعت الفلوس».
    ({ ui } = await detail(invoice({ amount_paid: 0, payment_details: [] }), [SVC]));
    await openSheet(ui, "Refund");
    await confirm(ui);
    check("ترجيعُ فاتورة دين: cashBack=false", noticeOf(ui)?.mode === "returned" && noticeOf(ui)?.cashBack === "false", noticeOf(ui)?.cashBack);
    await end(ui);

    ({ ui } = await detail(invoice(), [SVC, PROD]));
    sh = await openSheet(ui, "Delete");
    check("الحذف بسطر خدمة: النافذةُ تأخذ consumption={}", sh?.props["data-sheet"] === "delete" && sh?.props["data-cons"] === "{}", sh?.props["data-cons"]);
    t0 = performance.now();
    await confirm(ui);
    const del = ui.find("data-invdeleted");
    check("بعد الحذف: النافذةُ باقيةٌ بسطر النجاح و«رجّعنا» (returned) — لا تُغلق", !!del && inside(del, "data-notice")?.props["data-notice"] === "returned" && globalThis.__T.closed === 0);
    const dn = propsOf(del && inside(del, "data-notice"));
    check("  ومعه sentAt قبل طلب الحذف مباشرةً", sentOk(dn, t0), when(dn, t0));
    check("  وcashBack=false: الحذفُ لا يردّ للزبون شيئاً من الدرج", dn?.cashBack === "false", dn?.cashBack);
    const doneBtn = del && btn(del, "common.done");
    if (doneBtn) ui.click(doneBtn);
    check("  و«تم» تُغلقها", globalThis.__T.closed === 1 && !ui.find("data-invdeleted"));
    await end(ui);

    ({ ui } = await detail(invoice(), [PROD]));
    await openSheet(ui, "Delete");
    await confirm(ui);
    check("حذفُ فاتورةٍ بلا خدمة يُغلق فوراً كما كان", globalThis.__T.closed === 1 && !ui.find("data-invdeleted"));
    await end(ui);

    ({ ui } = await detail(invoice({ status: "refunded" }), [SVC]));
    sh = await openSheet(ui, "Delete");
    check("حذفُ فاتورةٍ مرجَعة (موادُّها رجعت بترجيعها): لا معاينة", sh?.props["data-cons"] === "none", sh?.props["data-cons"]);
    await confirm(ui);
    check("  وتُغلق فوراً", globalThis.__T.closed === 1 && !ui.find("data-invdeleted"));
    await end(ui);

    ({ ui } = await quiet(() => detail(invoice(), new Error("net"))));
    sh = await openSheet(ui, "Delete");
    check("سطورٌ لم تصل: لا يُحكم «بلا خدمة» — النافذةُ تسأل الخادم (consumption={})", sh?.props["data-cons"] === "{}", sh?.props["data-cons"]);
    await end(ui);
  });

  /* ج) المرتجع (ReturnsPanel) */
  section("ج) المرتجع: الأهدافُ «الكمية بعد» لسطور الخدمة، و«رجّعنا» بعد الحفظ حتى مرتجعٍ آخر");
  const panel = async (items, inv = invoice()) => {
    reset({
      listInvoiceItems: async () => items,
      returnInvoiceItems: async (id, lines) => { globalThis.__T.reqAt = stamp(); globalThis.__T.returns.push({ id, lines }); },
    });
    const ui = mount(h(ReturnsPanel, { invoices: [inv], onChanged: () => {} }));
    await flush(ui);
    ui.click(ui.find("data-retinv", "inv-1"));
    await flush(ui);
    return ui;
  };
  const plus = (ui, id) => ui.click(inside(ui.find("data-retline", id), "data-retplus"));
  const toSheet = async (ui) => { ui.click(ui.find("data-retconfirm")); await flush(ui); return ui.find("data-sheet"); };
  /* التمريرُ لمكان الإشعار: عُقدُ المُرسِم كائناتٌ بلا scrollIntoView — فيُعار لها من النموذج مدّةَ المشهد وحده، ويُسجَّل
     على أيّ عقدةٍ نودي. */
  const watchScroll = () => {
    const calls = [];
    Object.defineProperty(Object.prototype, "scrollIntoView", { configurable: true, writable: true,
      value: function (o) { calls.push({ retcons: !!(this?.props && "data-retcons" in this.props), block: o?.block ?? null }); } });
    return { calls, stop: () => { delete Object.prototype.scrollIntoView; } };
  };
  await tryCase("ج", async () => {
    let ui = await panel([SVC, PROD]);
    plus(ui, "it-p");
    let sh = await toSheet(ui);
    check("مرتجعٌ يلمس المادّة وحدها: نافذةُ التأكيد بلا consumption (سطرُ الخدمة ما انلمس)", sh?.props["data-cons"] === "none", sh?.props["data-cons"]);
    let sc = watchScroll();
    try { await confirm(ui); } finally { sc.stop(); }
    check("  وبعد الحفظ لا إشعارَ ولا طلبَ لقطعته (ولا تمرير)", !ui.find("data-notice") && rcpLoads() === 0 && globalThis.__T.returns.length === 1 && sc.calls.length === 0, `loads=${globalThis.__T.loads} scroll=${JSON.stringify(sc.calls)}`);
    await end(ui);

    ui = await panel([SVC, PROD]);
    plus(ui, "it-s");
    sh = await toSheet(ui);
    check("سطرُ خدمة ٣ يرجع منه ١: الهدفُ ٢ (الكمية بعد لا الراجع)", sh?.props["data-sheet"] === "return" && sh?.props["data-cons"] === JSON.stringify({ targets: [{ item_id: "it-s", qty: 2 }] }), sh?.props["data-cons"]);
    const t0 = performance.now();
    sc = watchScroll();
    try { await confirm(ui); } finally { sc.stop(); }
    const n = noticeOf(ui);
    check("بعد الحفظ: «رجّعنا» بوضع returned للفاتورة", n?.mode === "returned" && n?.ids[0] === "inv-1" && globalThis.__T.returns[0]?.lines?.[0]?.item_id === "it-s", JSON.stringify(n));
    check("  ومعه sentAt قبل طلب المرتجع مباشرةً", sentOk(n, t0), when(n, t0));
    check("  وcashBack=true: مدفوعةٌ يخرج من درجها ٣٠ للزبون", n?.cashBack === "true", n?.cashBack);
    // بالهاتف عمودٌ واحد والصفحةُ نازلة لزرّ التأكيد: الإشعارُ (وزرُّه «سجّلها هدر» — مدخلُه الوحيد) أوّلُ ما يُرى بعد المرتجع.
    const order = nodes(ui.container);
    const nAt = order.findIndex((x) => x.props && "data-notice" in x.props);
    const sAt = order.findIndex((x) => x.props && "data-retsearch" in x.props);
    check("  والإشعارُ قبل البحث وقائمة الفواتير (أوّلُ العمود — بالهاتف أوّلُ ما يُرى، لا تحت خلاصةٍ فارغة)", nAt >= 0 && sAt >= 0 && nAt < sAt, `notice@${nAt} search@${sAt}`);
    check("  والشاشةُ تمرّر لمكانه مرّةً (scrollIntoView على غلافه)", sc.calls.length === 1 && sc.calls[0].retcons === true, JSON.stringify(sc.calls));
    ui.click(ui.find("data-retinv", "inv-1"));
    await flush(ui);
    check("  واختيارُ فاتورةٍ لمرتجعٍ جديد يُخفيه", !ui.find("data-notice"));
    sc = watchScroll();
    try { ui.click(ui.find("data-retback")); await flush(ui); } finally { sc.stop(); }
    check("  والرجوعُ منها للقائمة بلا مرتجع لا يعيده (ولا يمرّر الشاشة لإشعارٍ قديم)", !ui.find("data-notice") && sc.calls.length === 0, JSON.stringify(sc.calls));
    await end(ui);

    // مدفوعٌ منها ٥٠ من ١٥٠: إجماليُّها بعد المرتجع ١٢٠ فوق المدفوع ⇒ لا يخرج نقد (calc.back = 0) وإن دُفع شيء.
    ui = await panel([SVC, PROD], invoice({ amount_paid: 50, payment_details: [{ method: "cash", amount: 50 }] }));
    plus(ui, "it-s");
    await toSheet(ui);
    await confirm(ui);
    check("مرتجعٌ لا يُخرج نقداً (المدفوعُ دون الإجمالي الجديد): cashBack=false", noticeOf(ui)?.mode === "returned" && noticeOf(ui)?.cashBack === "false", noticeOf(ui)?.cashBack);
    await end(ui);

    ui = await panel([SVC, PROD]);
    ui.click(ui.find("data-retall"));
    sh = await toSheet(ui);
    check("«إرجاع الكل»: ترجيعٌ كامل (refund) وconsumption={} — الكلُّ إلى صفر", sh?.props["data-sheet"] === "refund" && sh?.props["data-cons"] === "{}", sh?.props["data-cons"]);
    await confirm(ui);
    check("  و«رجّعنا» بعده", noticeOf(ui)?.mode === "returned");
    await end(ui);

    ui = await panel([SVC, PROD]);
    inside(ui.find("data-retline", "it-s"), "data-retqty").props.onChange({ target: { value: "0.5" } });
    await flush(ui);
    sh = await toSheet(ui);
    check("نصفُ حالة: الهدفُ ٢٫٥ بالضبط", sh?.props["data-cons"] === JSON.stringify({ targets: [{ item_id: "it-s", qty: 2.5 }] }), sh?.props["data-cons"]);
    await end(ui);

    ui = await panel([{ ...SVC, service_id: null }, PROD]);
    plus(ui, "it-s");
    sh = await toSheet(ui);
    check("سطرٌ بلا مادّة وبلا خدمة (جهازٌ قديم): لا معاينة", sh?.props["data-cons"] === "none", sh?.props["data-cons"]);
    await end(ui);
  });

  /* د) تعديلُ الفاتورة/الطلب (DeliveryEditDialog) */
  section("د) التعديل: سطرُ خدمةٍ نقص أو انشال ⇒ «رجّعنا» بعد الحفظ حتى «تم»، والمضيفُ يُبلَّغ عند الإغلاق");
  const dialog = async ({ items = [{ ...SVC, invoice_id: "inv-d", qty: 2, line_total: 60 }, { ...PROD, invoice_id: "inv-d", qty: 1, stock_qty: 1, line_total: 30 }], order = null, host = "ledger" } = {}) => {
    const inv = invoice({ id: "inv-d", total: 90, subtotal: 90, amount_paid: 0, payment_details: [] });
    reset({
      listInvoiceItems: async () => items,
      listProducts: async () => [P1],
      listCompanySections: async () => [],
      editInvoiceLines: async (id, lines) => { globalThis.__T.reqAt = stamp(); globalThis.__T.edits.push({ id, lines }); return { ...inv, total: 30 }; },
      updateDeliveryOrder: async () => {},
    });
    const Host = () => {
      const [on, setOn] = React.useState(true);
      // «ledger» كدفتر الزبون (CustomerLedger): onSaved يُغلق النافذة. «count» يعدّ ولا يُغلق.
      const close = host === "ledger" ? () => setOn(false) : () => {};
      return on ? h(DeliveryEditDialog, { order, invoice: inv, courier: null, onClose: () => { globalThis.__T.closed++; close(); }, onSaved: () => { globalThis.__T.saved++; close(); } }) : null;
    };
    const ui = mount(h(Host));
    await flush(ui);
    return ui;
  };
  const rowOf = (ui, name) => ui.findAll("data-dline").find((n) => textOf(n).includes(name)) ?? null;
  const save = async (ui) => { const b = btn(ui.container, "حفظ التعديل"); if (!b) throw new Error("no save"); ui.click(b); await flush(ui); };
  const counts = () => `saved=${globalThis.__T.saved} closed=${globalThis.__T.closed}`;
  await tryCase("د", async () => {
    let ui = await dialog();
    ui.click(inside(rowOf(ui, "PROD-FOOD"), "data-dplus"));
    await save(ui);
    check("تعديلُ المادّة وحدها: يُحفظ ويُغلق فوراً كما كان، بلا «رجّعنا» ولا طلبَ لقطعته",
      globalThis.__T.saved === 1 && globalThis.__T.closed === 1 && !ui.find("data-dedit-done") && rcpLoads() === 0, `${counts()} loads=${globalThis.__T.loads}`);
    await end(ui);

    ui = await dialog();
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dminus"));
    const t0 = performance.now();
    await save(ui);
    let done = ui.find("data-dedit-done");
    const dn = inside(done, "data-notice");
    check("خدمة ٢ ← ١ ومضيفٌ يُغلق بـonSaved: النافذةُ باقيةٌ بسطر النجاح و«رجّعنا» (returned) للفاتورة",
      !!done && dn?.props["data-notice"] === "returned" && JSON.parse(dn?.props["data-ids"] ?? "[]")[0] === "inv-d");
    check("  ومعه sentAt قبل طلب التعديل مباشرةً", sentOk(propsOf(dn), t0), when(propsOf(dn), t0));
    check("  وcashBack=false: التعديلُ لا يردّ مالاً للزبون", propsOf(dn)?.cashBack === "false", propsOf(dn)?.cashBack);
    check("  والمضيفُ لم يُبلَّغ بعد (لا onSaved ولا onClose)", globalThis.__T.saved === 0 && globalThis.__T.closed === 0, counts());
    const sent = globalThis.__T.edits[0]?.lines.find((l) => l.name === "SVC-STERILIZE");
    check("  والتعديلُ أرسل سطرَ الخدمة بمعرّفه (الربطُ بالمعرّف) وكميته الجديدة", sent?.id === "it-s" && sent?.qty === 1, JSON.stringify(sent));
    if (done) ui.click(btn(done, "common.done"));
    await flush(ui);
    check("  و«تم»: onSaved مرّةً ثم onClose", globalThis.__T.saved === 1 && globalThis.__T.closed === 1 && !ui.find("data-dedit-done"), counts());
    await end(ui);

    ui = await dialog({ host: "count" });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dremove"));
    await save(ui);
    done = ui.find("data-dedit-done");
    check("شيلُ سطر الخدمة (مضيفٌ لا يُغلق بنفسه): النافذةُ باقيةٌ بـ«رجّعنا»", !!done && !!inside(done, "data-notice"));
    if (done) ui.click(btn(done, "common.done"));
    check("  و«تم» تبلّغ المضيفَ وتطلب الإغلاق", globalThis.__T.saved === 1 && globalThis.__T.closed === 1, counts());
    await end(ui);
    check("  ولا تبليغَ ثانٍ عند الإزالة بعدها", globalThis.__T.saved === 1, counts());

    ui = await dialog({ host: "count" });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dminus"));
    await save(ui);
    ui.find("data-modal")?.props.onClose?.();
    await flush(ui);
    check("إغلاقُ النافذة من خارجها (الخلفيةُ/Esc) بحال «رجّعنا» = «تم»: onSaved ثم onClose", globalThis.__T.saved === 1 && globalThis.__T.closed === 1, counts());
    await end(ui);

    ui = await dialog({ host: "count" });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dminus"));
    await save(ui);
    check("  (قبل الإزالة: لا تبليغ)", globalThis.__T.saved === 0, counts());
    await end(ui);
    check("مضيفٌ أزالها بغير «تم» (والحفظُ تمّ): يُبلَّغ مرّةً عند الإزالة", globalThis.__T.saved === 1, counts());

    // الزيادةُ تصرف حالةً أكثر بالقيم المجمَّدة (_consumption_relink) — ولا منعَ على رصيدٍ ما كفّى، فالسالبُ يُقال (0252):
    // النافذةُ تبقى بالإشعار كالنقص، والإشعارُ يقول صافيَ الدفعة (ما صرفه بلا رصيد، أو لا شيء).
    ui = await dialog();
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dplus"));
    const tUp = performance.now();
    await save(ui);
    done = ui.find("data-dedit-done");
    const up = propsOf(done && inside(done, "data-notice"));
    check("خدمةٌ زادت (٢ ← ٣): النافذةُ باقيةٌ بسطر النجاح والإشعار (returned) للفاتورة — الزيادةُ قد تنزل بالمادّة تحت الصفر، ولا تُغلق صامتة",
      !!done && up?.mode === "returned" && up?.ids[0] === "inv-d" && globalThis.__T.saved === 0 && globalThis.__T.closed === 0, `${counts()} ${JSON.stringify(up)}`);
    check("  ومعه sentAt قبل طلب التعديل مباشرةً، وcashBack=false", sentOk(up, tUp) && up?.cashBack === "false", when(up, tUp));
    const upSent = globalThis.__T.edits[0]?.lines.find((l) => l.name === "SVC-STERILIZE");
    check("  والتعديلُ أرسل سطرَ الخدمة بمعرّفه وكميته ٣", upSent?.id === "it-s" && upSent?.qty === 3, JSON.stringify(upSent));
    if (done) ui.click(btn(done, "common.done"));
    await flush(ui);
    check("  و«تم»: onSaved مرّةً ثم onClose", globalThis.__T.saved === 1 && globalThis.__T.closed === 1 && !ui.find("data-dedit-done"), counts());
    await end(ui);

    ui = await dialog({ items: [{ ...SVC, invoice_id: "inv-d", qty: 2, service_id: null }, { ...PROD, invoice_id: "inv-d", qty: 1, stock_qty: 1 }] });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dplus"));
    await save(ui);
    check("سطرٌ بلا خدمة زاد (ما يصرف موادّاً): يُغلق فوراً", globalThis.__T.saved === 1 && !ui.find("data-dedit-done"), counts());
    await end(ui);

    ui = await dialog({ items: [{ ...SVC, invoice_id: "inv-d", qty: 2, service_id: null }, { ...PROD, invoice_id: "inv-d", qty: 1, stock_qty: 1 }] });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dminus"));
    await save(ui);
    check("سطرٌ بلا خدمة نقص (ما صرف موادّاً): يُغلق فوراً", globalThis.__T.saved === 1 && !ui.find("data-dedit-done"), counts());
    await end(ui);

    ui = await dialog({ order: { id: "o1", invoice_id: "inv-d", status: "pending", delivery_fee: 0, fee_to_clinic: false, customer_name: null, customer_phone: null, courier_id: null }, host: "count" });
    ui.click(inside(rowOf(ui, "SVC-STERILIZE"), "data-dminus"));
    await save(ui);
    done = ui.find("data-dedit-done");
    check("طلبُ توصيل: نفسُ «رجّعنا»، وسطرُ النجاح نصُّ «يستلم السائق»", !!done && !!inside(done, "data-notice") && textOf(done).includes("يستلم السائق"), done ? textOf(done) : "");
    await end(ui);
  });

  /* هـ) القراءة: المعاينةُ وما يرجع للرفّ يُبنيان على سطور الفاتورة — فسطورٌ لم تصل (أو وصلت لاختيارٍ سابق)
     لا تُعرض كأنها الفاتورة، ومحرّرٌ ما وصلته سطورُه ولا موادُّه لا يُرسم فارغاً («لا نتائج» عن مادّةٍ بالرفّ). */
  section("هـ) القراءة: سطورٌ لم تصل لا تُعرض — لا سطورُ فاتورةٍ سابقة، ولا محرّرٌ فارغ");
  await tryCase("هـ", async () => {
    const two = [invoice({ id: "inv-a", customer_name: "A" }), invoice({ id: "inv-b", customer_name: "B" })];
    const A1 = { ...PROD, id: "a1", invoice_id: "inv-a" };
    const B1 = { ...PROD, id: "b1", invoice_id: "inv-b" };
    let ui = null;
    const lines = () => ui.findAll("data-retline").map((n) => n.props["data-retline"]);
    const pickAB = async () => {
      ui = mount(h(ReturnsPanel, { invoices: two, onChanged: () => {} }));
      await flush(ui);
      ui.click(ui.find("data-retinv", "inv-a")); await flush(ui);
      ui.click(ui.find("data-retback")); await flush(ui);
      ui.click(ui.find("data-retinv", "inv-b")); await flush(ui);
    };
    // ١) سطورُ B فشلت بعد سطور A
    let bFails = true;
    reset({ listInvoiceItems: async (id) => { if (id === "inv-a") return [A1]; if (bFails) throw new Error("net"); return [B1]; } });
    await quiet(pickAB);
    check("المرتجع: سطورُ B ما وصلت ⇒ لا سطرَ من الفاتورة السابقة تحت رقمها", !lines().includes("a1"), `[${lines()}]`);
    ui.click(ui.find("data-retall")); await flush(ui);
    const cb = ui.find("data-retconfirm");
    check("  والفشلُ بمكانه بإعادة، و«تأكيد الإرجاع» مقفول حتى بعد «إرجاع الكل»", !!ui.find("data-retitems-failed") && !!cb && !!cb.props.disabled,
      `failed=${!!ui.find("data-retitems-failed")} disabled=${cb?.props.disabled}`);
    bFails = false;
    const rb = ui.find("data-retitems-failed") && btn(ui.find("data-retitems-failed"), "Retry");
    if (rb) ui.click(rb);
    await flush(ui);
    check("  و«أعد المحاولة» تجيب سطورَ B نفسها", !!rb && !ui.find("data-retitems-failed") && lines().join() === "b1", `[${lines()}]`);
    await end(ui);
    // ٢) سطورُ A وصلت بعد اختيار B
    let releaseA = null;
    reset({ listInvoiceItems: (id) => (id === "inv-a" ? new Promise((r) => { releaseA = () => r([A1]); }) : Promise.resolve([B1])) });
    await pickAB();
    releaseA?.();
    await flush(ui);
    check("المرتجع: جوابُ اختيارٍ سابق وصل متأخّراً لا يكتب سطورَه تحت اللاحق", lines().join() === "b1", `[${lines()}]`);
    await end(ui);

    // ٣) التعديل: الجلبُ فشل
    const invD = invoice({ id: "inv-d", total: 30, subtotal: 30, amount_paid: 0, payment_details: [] });
    const lineD = { ...PROD, invoice_id: "inv-d", qty: 1, stock_qty: 1, line_total: 30 };
    const POOLED = { ...P1, id: "p2", name: "PROD-POOLED", section_id: "sec-1" };
    let loadFails = true;
    reset({
      listInvoiceItems: async () => { if (loadFails) throw new Error("net"); return [lineD]; },
      listProducts: async () => [P1, POOLED],
      listCompanySections: async () => [],
    });
    ui = await quiet(async () => { const u = mount(h(DeliveryEditDialog, { order: null, invoice: invD, courier: null, onClose: () => {}, onSaved: () => {} })); await flush(u); return u; });
    check("التعديل: الجلبُ فشل ⇒ الفشلُ بمكانه، بلا بحثِ موادّ ولا زرِّ حفظ ولا «أصناف» فارغة",
      !!ui.find("data-dedit-failed") && !ui.find("data-dsearch") && !btn(ui.container, "حفظ التعديل") && ui.findAll("data-dline").length === 0,
      `failed=${!!ui.find("data-dedit-failed")} search=${!!ui.find("data-dsearch")}`);
    loadFails = false;
    const rd = ui.find("data-dedit-failed") && btn(ui.find("data-dedit-failed"), "common.retry");
    if (rd) ui.click(rd);
    await flush(ui);
    check("  و«أعد المحاولة» تجيب المحرّرَ بسطوره", !!rd && !ui.find("data-dedit-failed") && ui.findAll("data-dline").length === 1 && !!ui.find("data-dsearch"));
    check("  وحوضُ الأقسام وصل ⇒ لا تحذير", !ui.find("data-dedit-poolsfailed"));
    await end(ui);
    // ٤) حوضُ الأقسام ما وصل
    reset({
      listInvoiceItems: async () => [lineD],
      listProducts: async () => [P1, POOLED],
      listCompanySections: async () => { throw new Error("net"); },
    });
    ui = mount(h(DeliveryEditDialog, { order: null, invoice: invD, courier: null, onClose: () => {}, onSaved: () => {} }));
    await flush(ui);
    check("التعديل: حوضُ الأقسام ما وصل ⇒ المحرّرُ مفتوح و«أرقام الرصيد ناقصة» مقولة (المتوفرُ بلا حوضه أقلُّ من الحقيقة)",
      !!ui.find("data-dsearch") && !!ui.find("data-dedit-poolsfailed") && !ui.find("data-dedit-failed"));
    await end(ui);
  });
  return R;
}

/* ── الطفرات: كلُّ واحدةٍ تُسقط فحصاً واحداً على الأقلّ ───────────────────────── */
const MUTANTS = [
  ["المعاينةُ بوضعٍ آخر", "ForgiveDialog.tsx", '<ConsNoticeLazy mode="preview"', '<ConsNoticeLazy mode="returned"'],
  ["المعاينةُ تُسقط الأهداف", "ForgiveDialog.tsx", " targets={consumption.targets}", ""],
  ["المعاينةُ تُرسم بلا سطر خدمة", "ForgiveDialog.tsx", "{consumption && (", "{(consumption ?? {}) && ("],
  ["«أعد المحاولة» بالنافذة لا تجدّد القطعة", "ForgiveDialog.tsx", "onRetry={() => { ConsNoticeLazy = loadConsNotice(); setLazyTick((n) => n + 1); }}>\n            <Suspense fallback={null}>\n              <ConsNoticeLazy mode=\"preview\"", "onRetry={() => { setLazyTick((n) => n + 1); }}>\n            <Suspense fallback={null}>\n              <ConsNoticeLazy mode=\"preview\""],
  ["الفاتورة: لا «رجّعنا» بعد الترجيع", "InvoicesPanel.tsx", '      if (consumes) setReversed({ kind: "refund", sentAt, cashBack });\n', ""],
  ["الفاتورة: المعاينةُ دائماً", "InvoicesPanel.tsx", "consumption={consumes && !refunded ? {} : null}", "consumption={{}}"],
  ["الفاتورة: الحذفُ يُغلق دائماً", "InvoicesPanel.tsx", 'if (consumes && !refunded) setReversed({ kind: "delete", sentAt, cashBack: false });\n      else onClose();', "onClose();"],
  ["الفاتورة: سطورٌ لم تصل = «بلا خدمة»", "InvoicesPanel.tsx", "const consumes = !itemsOk || items.some(", "const consumes = items.some("],
  ["الفاتورة: كلُّ سطرٍ بلا مادّة «خدمة»", "InvoicesPanel.tsx", "items.some((it) => it.product_id == null && !!it.service_id)", "items.some((it) => it.product_id == null)"],
  ["الفاتورة: «رجّعنا» يبقى تحت فاتورةٍ أخرى", "InvoicesPanel.tsx", "    setReversed(null); // ", "    // "],
  ["الفاتورة: «رجّعنا» بوضع البيعة", "InvoicesPanel.tsx", '<ConsNoticeLazy mode="returned" invoiceIds={[invoice.id]} sentAt=', '<ConsNoticeLazy mode="sale" invoiceIds={[invoice.id]} sentAt='],
  ["المرتجع: الهدفُ = الراجعُ لا الباقي", "ReturnsPanel.tsx", "qty: Math.max(0, Math.round((it.qty - (ret[it.id] ?? 0)) * 1000) / 1000)", "qty: ret[it.id] ?? 0"],
  ["المرتجع: الكاملُ بأهداف", "ReturnsPanel.tsx", "(calc.full ? {} : { targets: consTargets })", "{ targets: consTargets }"],
  ["المرتجع: لا «رجّعنا» بعد الحفظ", "ReturnsPanel.tsx", "      setReturned(consTargets.length > 0 ? { id: picked.id, sentAt, cashBack } : null);\n", ""],
  ["المرتجع: «رجّعنا» يبقى مع مرتجعٍ جديد", "ReturnsPanel.tsx", "    setPicked(inv);\n    setReturned(null);\n", "    setPicked(inv);\n"],
  ["المرتجع: سطرُ خدمةٍ ما انلمس يُعدّ", "ReturnsPanel.tsx", ".filter((it) => (ret[it.id] ?? 0) > 0 && it.product_id == null", ".filter((it) => it.product_id == null"],
  ["المرتجع: سطرٌ بلا خدمة يُعدّ", "ReturnsPanel.tsx", "&& it.product_id == null && !!it.service_id)", "&& it.product_id == null)"],
  ["التعديل: onSaved فوراً (مضيفٌ يُغلق بها يُسقط «رجّعنا»)", "DeliveryEditDialog.tsx", "if (consMoved) { savedPending.current = true; setDone({ msg: savedMsg, sentAt }); return; }", "if (consMoved) { onSaved(); setDone({ msg: savedMsg, sentAt }); return; }"],
  // ── w5a: الزيادةُ تصرف حالةً أكثر وقد تنزل بالمادّة تحت الصفر — تُقال كالنقص، لا تُغلق صامتة ──
  ["التعديل: الزيادةُ تُغلق فوراً", "DeliveryEditDialog.tsx", "(!!r.removed || r.qty !== r.src.qty)", "(!!r.removed || r.qty < r.src.qty)"],
  ["التعديل: النقصُ يُغلق فوراً", "DeliveryEditDialog.tsx", "(!!r.removed || r.qty !== r.src.qty)", "(!!r.removed || r.qty > r.src.qty)"],
  ["التعديل: الشيلُ يُغلق فوراً", "DeliveryEditDialog.tsx", "(!!r.removed || r.qty !== r.src.qty)", "(r.qty !== r.src.qty)"],
  ["التعديل: سطرٌ بلا خدمة يُعدّ", "DeliveryEditDialog.tsx", "r.src.product_id == null && !!r.src.service_id &&", "r.src.product_id == null &&"],
  ["التعديل: الإزالةُ بغير «تم» لا تبلّغ", "DeliveryEditDialog.tsx", "useEffect(() => () => { if (savedPending.current) { savedPending.current = false; onSavedRef.current(); } }, []);", ""],
  ["التعديل: «تم» لا تبلّغ", "DeliveryEditDialog.tsx", "    if (savedPending.current) { savedPending.current = false; onSaved(); }\n    onClose();", "    onClose();"],
  ["التعديل: إغلاقُ الخلفية بحال «رجّعنا» لا يبلّغ", "DeliveryEditDialog.tsx", "<Modal open onClose={finish} size=\"wide\" title={title}>", "<Modal open onClose={onClose} size=\"wide\" title={title}>"],
  ["المرتجع: الاختيارُ لا يمسح سطورَ السابق", "ReturnsPanel.tsx", "    setItems([]);\n    setItemsErr(null);\n", "    setItemsErr(null);\n"],
  ["المرتجع: جوابُ اختيارٍ سابق يكتب فوق اللاحق", "ReturnsPanel.tsx", ".then((r) => { if (pickSeq.current === seq) setItems(r); })", ".then((r) => { setItems(r); })"],
  ["المرتجع: فشلُ السطور يُبلع", "ReturnsPanel.tsx", ".catch((e) => { if (pickSeq.current === seq) setItemsErr(e ?? new Error(\"items\")); })", ".catch(() => {})"],
  ["التعديل: فشلُ الجلب محرّرٌ فارغ", "DeliveryEditDialog.tsx", ") : loadErr != null ? (", ") : (loadErr != null && false) ? ("],
  ["التعديل: «أعد المحاولة» لا تعيد الجلب", "DeliveryEditDialog.tsx", "}, [invoice.id, clinicId, loadTick]);", "}, [invoice.id, clinicId]);"],
  ["التعديل: فشلُ حوض الأقسام يُبلع", "DeliveryEditDialog.tsx", "setPoolsFailed(poolsLost);", "setPoolsFailed(false);"],
  // ── ui2: «رجّعنا» بدفعة هذا الفعل — لحظةُ الطلب قبله، والمالُ بعلامته، والحذفُ بفعله ──
  ["النافذة: الحذفُ بلا action", "ForgiveDialog.tsx", ' action={mode === "delete" ? "delete" : undefined}', ""],
  ["النافذة: action للترجيع لا للحذف", "ForgiveDialog.tsx", 'action={mode === "delete" ? "delete" : undefined}', 'action={mode === "refund" ? "delete" : undefined}'],
  ["الفاتورة: لحظةُ الترجيع بعد طلبه", "InvoicesPanel.tsx", "      const sentAt = performance.now();\n      const updated = await repo.refundInvoice(invoice.id);\n",
    "      const updated = await repo.refundInvoice(invoice.id);\n      const sentAt = performance.now();\n"],
  ["الفاتورة: لحظةُ الحذف بساعةٍ أخرى", "InvoicesPanel.tsx", "      const sentAt = performance.now();\n      await repo.deleteInvoice(invoice.id);\n", "      const sentAt = Date.now();\n      await repo.deleteInvoice(invoice.id);\n"],
  ["الفاتورة: «رجّعنا» بلا لحظته", "InvoicesPanel.tsx", " sentAt={reversed?.sentAt}", ""],
  ["الفاتورة: ترجيعُ الدين «ردّ مالاً»", "InvoicesPanel.tsx", "const cashBack = paidOf(invoice) > 0.005;", "const cashBack = true;"],
  ["الفاتورة: الحذفُ «ردّ مالاً»", "InvoicesPanel.tsx", "cashBack: false });", "cashBack: true });"],
  ["المرتجع: لحظةُ الطلب بعده", "ReturnsPanel.tsx", "      const sentAt = performance.now();\n      await repo.returnInvoiceItems(picked.id, lines, method, note.trim() || null);\n",
    "      await repo.returnInvoiceItems(picked.id, lines, method, note.trim() || null);\n      const sentAt = performance.now();\n"],
  ["المرتجع: cashBack من المدفوع لا ممّا يخرج", "ReturnsPanel.tsx", "const cashBack = calc.back > 0.005;", "const cashBack = paidOf(picked) > 0.005;"],
  ["المرتجع: «رجّعنا» بلا cashBack", "ReturnsPanel.tsx", " cashBack={returned.cashBack}", ""],
  ["التعديل: لحظةُ الطلب بعده", "DeliveryEditDialog.tsx", "      const sentAt = performance.now();\n      const inv = await repo.editInvoiceLines(invoice.id, lines, reason.trim() || null);\n",
    "      const inv = await repo.editInvoiceLines(invoice.id, lines, reason.trim() || null);\n      const sentAt = performance.now();\n"],
  ["التعديل: «رجعت الفلوس» بعد تعديل", "DeliveryEditDialog.tsx", "cashBack={false}", "cashBack={true}"],
  // ── w5a: «رجّعنا» بالمرتجع حيث العين — أوّلُ العمود الأيسر، والشاشةُ تمرّره لمكانه ──
  ["المرتجع: «رجّعنا» بلا تمرير", "ReturnsPanel.tsx", "el?.scrollIntoView?.({ block: \"center\", behavior: \"smooth\" });", ""],
  // طفرةُ نقلٍ (دالّة على النصّ): الإشعارُ يرجع لمكانه القديم تحت «خلاصة المرتجع» بالعمود الأيمن.
  ["المرتجع: «رجّعنا» تحت الخلاصة", "ReturnsPanel.tsx", (src) => {
    const head = "            {returned && (\n              <div ref={consRef} data-retcons>";
    const tail = "              </div>\n            )}\n";
    const a = src.indexOf(head);
    const b = a < 0 ? -1 : src.indexOf(tail, a);
    if (a < 0 || b < 0) return null;
    const block = src.slice(a, b + tail.length);
    const rest = src.slice(0, a) + src.slice(b + tail.length);
    const anchor = "        {confirming && picked && calc && calc.count > 0 && (";
    const at = rest.indexOf(anchor);
    return at < 0 ? null : rest.slice(0, at) + block + rest.slice(at);
  }],
];

/* ── التشغيل ──────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = Date.now();
  // متصفّحٌ بالحدّ الأدنى قبل تحميل الوحدات (utils وأخواتها تقرأ التخزين عند الطلب).
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  globalThis.window ??= { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };

  const self = selfCases();
  if (self.bad.length) {
    console.error(`✗ reversal-notice-guard: الحارسُ لا يُمسك ما وُضع ليمسكه:\n  • ${self.bad.join("\n  • ")}`);
    process.exit(1);
  }
  // بنهاية أسطرٍ واحدة (النسخةُ على ويندوز CRLF): نصوصُ الطفرات متعدّدةُ الأسطر تُطابَق كما كُتبت.
  // وREVERSAL_SRC_DIR جذرٌ آخر للشاشات الأربع (نسخةٌ قبل تغيير): الفحوصُ نفسُها عليها.
  const SRC_ROOT = process.env.REVERSAL_SRC_DIR || ROOT;
  if (process.env.REVERSAL_SRC_DIR) console.log(`   (الشاشاتُ الأربع من ${SRC_ROOT})`);
  const sources = Object.fromEntries(Object.keys(FILES).map((rel) => [rel, readFileSync(path.join(SRC_ROOT, rel), "utf8").replace(/\r\n/g, "\n")]));
  console.log(`▸ ١) النصّ: ${Object.keys(FILES).length} شاشاتٍ تحمّل إشعارَ المستهلكات كسولاً (والحارسُ جُرِّب على ${self.n} حالةً مصنوعة)`);
  let staticErrs = 0, mounts = 0;
  for (const [rel, want] of Object.entries(FILES)) {
    const r = checkText(rel, sources[rel], want);
    mounts += r.mounts.length;
    if (r.errs.length) { staticErrs += r.errs.length; for (const e of r.errs) console.error(`   ✗ ${e}`); continue; }
    const marks = (m) => `${m.sentAt ? "+sentAt" : ""}${m.cashBack ? "+cashBack" : ""}${m.action ? "+action" : ""}`;
    console.log(`   ✓ ${path.posix.basename(rel)}: ${r.loader} → ${r.comp}، ${r.mounts.length} رسمٍ [${r.mounts.map((m) => `${m.mode}:${m.line}${marks(m)}`).join("، ")}] داخل LoadBoundary+Suspense بإعادةٍ تجدّد القطعة؛ لا استيرادَ ثابتاً لـConsumablesSheet ولا مفتاحَ rcp.${want.sheet ? "؛ ونافذةُ التأكيد تأخذ consumption" : ""}${r.requests.length ? `؛ وperformance.now() قبل ${r.requests.join("، ")}` : ""}`);
  }
  if (mounts === 0) { console.error("   ✗ صفرُ رسمٍ بالشاشات الأربع — الحارسُ لم يفحص شيئاً"); staticErrs++; }

  const UI = await build(sources);
  const R = await runSuite(UI, true);
  const total = R.pass + R.fail.length;
  if (total === 0) { console.error("✗ reversal-notice-guard: صفرُ فحصٍ سلوكيّ"); process.exit(1); }

  if (process.argv.includes("--mutants")) {
    console.log(`▸ الطفرات (${MUTANTS.length})`);
    const survivors = [];
    for (const [name, file, from, to] of MUTANTS) {
      const rel = `src/components/retail/${file}`;
      const src = sources[rel];
      let next;
      if (typeof from === "function") {
        // طفرةُ نقل: دالّةٌ على النصّ كلِّه — لا تجد مرساتَها (null) أو لا تغيّر شيئاً ⇒ تُفشل كنصٍّ غائب.
        next = from(src);
        if (typeof next !== "string" || next === src) { survivors.push(`${name} — طفرةُ النقل لم تجد مرساتَها بـ${file}`); continue; }
      } else {
        const at = src.indexOf(from);
        if (at < 0 || src.indexOf(from, at + 1) >= 0) { survivors.push(`${name} — نصُّ الطفرة ${at < 0 ? "غيرُ موجود" : "مكرّر"} بـ${file}`); continue; }
        next = src.slice(0, at) + to + src.slice(at + from.length);
      }
      const mutated = { ...sources, [rel]: next };
      const st = checkText(rel, mutated[rel], FILES[rel]).errs.length;
      let failed = -1;
      // الطفرةُ تكسر الرسمَ عمداً: React يكتب كلَّ خطأٍ يلتقطه حارسٌ بالكونسول — الحكمُ بعدد الفحوص لا بالضجيج.
      const loud = console.error;
      console.error = () => {};
      // وطفرةٌ لا تنبني (أو جولةٌ رمت خارج حالاتها) لم يُفحص فيها شيء: «أمسكها» عنها خواء — تُعدّ ناجية.
      let unrun = null;
      try { const r = await runSuite(await build(mutated), false); failed = r.fail.length; } catch (e) { unrun = String(e?.message ?? e).split("\n")[0]; } finally { console.error = loud; }
      if (unrun !== null) { survivors.push(`${name} — لم تُفحص (لم تنبنِ أو رمت الجولة): ${unrun}`); console.log(`   ✗ ${name} — لم تُفحص`); continue; }
      const caught = st > 0 || failed > 0;
      console.log(`   ${caught ? "✓" : "✗"} ${name} — ${caught ? `أمسكه ${st > 0 ? `النصّ (${st})` : ""}${st > 0 && failed > 0 ? " و" : ""}${failed > 0 ? `السلوك (${failed})` : ""}` : "نجا"}`);
      if (!caught) survivors.push(name);
    }
    if (survivors.length) {
      console.error(`✗ reversal-notice-guard: طفراتٌ نجت:\n  • ${survivors.join("\n  • ")}`);
      process.exit(1);
    }
  }

  const ok = staticErrs === 0 && R.fail.length === 0;
  const tail = process.argv.includes("--mutants") ? `، و${MUTANTS.length} طفرةً أمسكتها الفحوص كلَّها` : "";
  console.log(`\n${ok ? "✓" : "✗"} reversal-notice-guard: ${Object.keys(FILES).length} شاشاتٍ و${mounts} رسماً نصّاً، و${R.pass}/${total} فحصاً سلوكياً${tail} (${((Date.now() - t0) / 1000).toFixed(1)} ث)`);
  if (!ok) { if (R.fail.length) console.error(`  فشل: ${R.fail.join(" | ")}`); process.exit(1); }
}
