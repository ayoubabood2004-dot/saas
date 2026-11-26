/* ============================================================================
 * فحصُ «الاسمُ المدموج لا يرجع توأماً، والدمجُ والاسترجاعُ يقولان ما يحدث» (0293، G22/G23، ٢٦/١١).
 *
 * فوق «ما موجود يسأل المحذوفات» (trashMatch/TrashHint، G21/G22 بلا هجرة) بقي: الخادمُ يصنع التوأمَ إن حُفظ رغم التحذير، والدمجُ خلف
 * window.confirm يقول «ما ينرجع»، والاسترجاعُ يعدّ المادّةَ مرّتين بجانب توأمها أو قبل أصلها المحذوف، وزرُّ الأصل بالتلميح يفتح التعديلَ
 * بوضع المدير المقفول. يثبت هنا:
 *   ١) liveTwinsOf بسلوكه: الرمزُ والاسمُ بمطابقة الحيّة نفسِها، والصفُّ ليس توأمَ نفسِه، وأصلُ المدموجة مستثنى.
 *   ٢) isoName يعزل الاسمَ (FSI…PDI) ولا يغيّره.
 *   ٣) التوصيل: الاسترجاعُ يسأل قبل النداء (التوأم والأصلُ المحذوف)، والدمجُ بخطوةٍ ثانية بلا window.confirm، وأزرارُ التلميح مقفولةٌ بالقفل،
 *      والكتلوجُ المبدئيّ يتخطّى الاسمَ السابق، والتجريبيُّ يرفض كالخادم (بشرطيه: الاسمُ نفسُه والصفُّ القائم).
 *   ٤) الهجرةُ: الحارسُ definer بمسار بحث، وبإعفاءاته الثلاثة، ومعزولُ الاسمين بالتلميح — والحزمةُ تفحصه بسلوكه (run.sh، قسم 0293).
 *
 *   node scripts/merge-guard-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  entryPoints: ["src/lib/trashMatch.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
  plugins: [stubs], alias: { "@/lib/utils": "./src/lib/utils.ts" }, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

const del = (id, row, extra = {}) => ({ id, row: { id, name: "", barcode: null, alt_codes: [], ...row }, sold_qty: 0, stock: 0, deleted_at: "2026-11-20T10:00:00Z", merged_into: null, ...extra });
const live = (id, p) => ({ id, name: "", barcode: null, alt_codes: [], stock: 0, ...p });

console.log("▸ ١) التوأمُ الحيّ قبل الاسترجاع (liveTwinsOf)");
{
  const d = del("D", { name: "نوبيفاك رابيز", barcode: "8713184 06350 3", alt_codes: ["R-77"] });
  const byCode = live("Q", { name: "Nobivac Rabies", barcode: "8713184063503", stock: 20 });
  const byAlt = live("V", { name: "y", alt_codes: ["r-77"] });
  const byName = live("N", { name: "نوبيفاك  رابيز" });
  const other = live("O", { name: "شي ثاني", barcode: "123" });
  const ids = M.liveTwinsOf(d, [byCode, byAlt, byName, other]).map((p) => p.id).sort().join();
  check("برمزها مطبَّعاً، وبرمزها الإضافيّ، وباسمِها مطويّاً — والغريبُ لا", ids === "N,Q,V", ids);
  check("الصفُّ نفسُه (بمعرّفه) ليس توأمَ نفسِه", M.liveTwinsOf(d, [live("D", { name: "نوبيفاك رابيز" })]).length === 0);
  check("وأصلُ المدموجة (يحمل رموزَها) مستثنى — فكُّ الدمج يأخذ رصيدَها منه", M.liveTwinsOf(d, [byCode, byAlt], "Q").map((p) => p.id).join() === "V");
  check("اسمٌ من حرفٍ واحد لا يجعل كلَّ مادّةٍ توأماً", M.liveTwinsOf(del("s", { name: "ا" }), [live("x", { name: "ا" })]).length === 0);
}

console.log("▸ ٢) isoName");
{
  const v = M.isoName("Frontline (Dog)");
  check("يعزل الاسمَ بـFSI…PDI ولا يغيّره", v === "⁨Frontline (Dog)⁩");
  check("والفارغُ عزلٌ فارغ لا «undefined»", M.isoName(null) === "⁨⁩");
}

console.log("▸ ٣) التوصيل");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
{
  const inv = readFileSync("src/pages/Inventory.tsx", "utf8");
  const tab = inv.slice(inv.indexOf("function TrashTab("));
  const restore = tab.slice(tab.indexOf("const restore = async"), tab.indexOf("if (failed)"));
  const iAsk = restore.indexOf("liveTwinsOf(d, products, keeper?.id ?? null)");
  const iCall = restore.indexOf("repo.restoreProduct");
  check("الاسترجاع: التوأمُ الحيّ يُسأل قبل النداء، وأصلُ المدموجة مستثنى", iAsk > 0 && iAsk < iCall);
  check("  والأصلُ المحذوف (سلسلةٌ تنتهي بمحذوف غير الصفّ نفسِه) يُسأل قبله", /const gone = d\.merged_into && hit\?\.kind === "deleted" && hit\.t\.id !== d\.id \? hit\.t : null;/.test(restore)
    && restore.indexOf("const gone =") < iCall);
  check("  و«رجّعها رغم ذلك» تمرّ (sure)، و«لا ترجّعها» تغلق السؤال", /restore\(d, true\)/.test(tab) && /setTwinAsk\(null\); \}\}>\{t\("pkg\.restoreTwinNo"\)/.test(tab));
  check("  وبحثُ التبويب بالمطابقة نفسِها (searchable وcarriesCode) — ورموزُ المدموجة معه", /searchable\(d\.row\?\.name \?\? ""\)\.includes\(qKey\) \|\| carriesCode\(d\.row, query\)/.test(tab));
  check("  والتبويبُ يأخذ القائمةَ الحيّة (التوأمُ يُقاس عليها)", /<TrashTab onChanged=\{load\} products=\{products\} \/>/.test(inv));
  const md = inv.slice(inv.indexOf("function MergeDialog("), inv.indexOf("function MergeDialog(") + 6000);
  check("الدمج: لا window.confirm بالنافذة (G23 — النمطُ الممنوع بعد حادثة الحذف)", !/window\.confirm\(/.test(strip(md)));
  check("  ضغطةُ الصفّ تختار ولا تدمج؛ «ادمجهما» وحدها تنادي", /onClick=\{\(\) => \{ playTap\(\); setPick\(p\); \}\}/.test(md) && /data-mergeyes onClick=\{\(\) => void merge\(pick\)\}/.test(md));
  check("  والسؤالُ بالاسمين والمجموع وما لا يرجع بالفكّ", /pkg\.mergeAskTitle/.test(md) && /sum: formatQty\(Number\(drop\.stock \?\? 0\) \+ Number\(pick\.stock \?\? 0\)\)/.test(md) && /pkg\.mergeAskUndo/.test(md));
  check("تلميحُ البحث: «رجّعها» وزرُّ الأصل مقفولان بوضع المدير (0154)", /canRestore=\{!locked && \(invRole === "manager" \|\| invRole === "veterinarian"\)\}/.test(inv)
    && /onPick=\{locked \? undefined : \(p\) => \{ playTap\(\); setQ\(""\); setEditing\(p\); \}\}/.test(inv));
}
{
  const sc = readFileSync("src/components/inventory/StarterCatalog.tsx", "utf8");
  check("الكتلوجُ المبدئيّ يتخطّى الاسمَ السابق (أصلٌ حيٌّ باسمٍ آخر) بطيّ الخادم", /hit\?\.kind === "merged" && searchable\(hit\.keeper\.name\) !== searchable\(d\.row\?\.name \?\? ""\)/.test(sc)
    && /!aliasKeys\.has\(searchable\(pr\.name\)\)/.test(sc));
}
{
  const demo = readFileSync("src/lib/repoDemo.ts", "utf8");
  const fn = demo.slice(demo.indexOf("function throwIfMergedName("), demo.indexOf("function throwIfCodeTaken("));
  check("التجريبيّ يرفض كالخادم: بلا باركود، والاسترجاعُ والصفُّ القائم ومخزنُ الحقل يمرّون", /if \(p\.farm_id \|\| matchCode\(p\.barcode\)\) return;/.test(fn)
    && /trash\.some\(\(t\) => t\.id === p\.id\)/.test(fn) && /\(db\.products \?\? \[\]\)\.some\(\(x\) => x\.id === p\.id\)/.test(fn));
  check("  والأصلُ بالاسم نفسِه ليس اسماً سابقاً", /if \(keep && searchable\(keep\.name\) === key\) break;/.test(fn));
  check("  وينادَى قبل كلّ إدراج (الإضافة وسطرُ الشراء الجديد)", (demo.match(/throwIfMergedName\(db, (np|p)\);/g) ?? []).length === 2);
}
{
  const mig = readFileSync("supabase/migrations/0293_merged_name_guard.sql", "utf8");
  const body = mig.slice(mig.indexOf("create or replace function public.products_merged_name_guard()"));
  check("الهجرة: definer بمسار بحث، والتنفيذُ مسحوبٌ من الأدوار، والمحفّزُ قبل الإدراج", /security definer\s*\nset search_path = public/.test(body)
    && /revoke all on function public\.products_merged_name_guard\(\) from public, anon, authenticated;/.test(mig)
    && /before insert on public\.products/.test(mig));
  check("  بإعفاءاته: الاسترجاع (المعرّفُ بالسلّة)، والصفُّ القائم (إعادةُ الطابور)، والأصلُ بالاسم نفسِه", /from products_trash where id = new\.id\) then return new;/.test(body)
    && /from products where id = new\.id\) then return new;/.test(body) && /exit when search_norm\(v_keep\) = v_key;/.test(body));
  check("  والتلميحُ يعزل الاسمين (FSI…PDI)", /chr\(8296\) \|\| v_keep \|\| chr\(8297\)/.test(body));
  const runsh = readFileSync("supabase/tests/run.sh", "utf8");
  check("  والحزمةُ تنزلها بالموجة وتفحصها بقسمها", /\$MIG\/0293_merged_name_guard\.sql"/.test(runsh) && /echo "▸ 0293: /.test(runsh));
}

console.log(`\n${fails ? "✗" : "✓"} merge-guard: ${passes} ناجح، ${fails} فاشل`);
process.exit(fails ? 1 : 0);
