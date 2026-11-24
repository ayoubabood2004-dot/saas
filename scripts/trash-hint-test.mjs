/* ============================================================================
 * «بالمحذوفات» (G21/G22، تدقيقُ المخزن ٢٢/١١) — المطابقةُ بسلوكها، والقطعةُ بسلوكها (react-mini)، والوصلُ بالنصّ، وطفرات.
 *
 * مادّةٌ محذوفة كان يقول عنها كلُّ باحثٍ «ما موجود» (الماسح «أضفها»، البحثُ «لا نتائج»، الشراءُ يصنعها جديدة) فتولد توأماً يُعدّ
 * مرّتين يومَ تُسترجع. الآن تُسأل المحذوفاتُ **بالمطابقة نفسِها** التي يطابق بها الباحثُ الحيّ (carriesCode، searchable).
 *
 *   node scripts/trash-hint-test.mjs
 * ========================================================================= */
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadUI } from "./react-mini.mjs";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got === undefined ? "" : ` — ${JSON.stringify(got)}`}`); } };
const src = (p) => readFileSync(p, "utf8");

const MATCH = resolve("src/lib/trashMatch.ts");
async function loadMatch(mutate) {
  const built = await esbuild.build({
    stdin: { contents: 'export * from "./src/lib/trashMatch.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    plugins: [{
      name: "m", setup(b) {
        b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export {};", loader: "js" }));
        if (mutate) b.onLoad({ filter: /trashMatch\.ts$/ }, (a) => (resolve(a.path) === MATCH ? { contents: mutate(src(MATCH)), loader: "ts" } : undefined));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "trash-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

/* ---- القالب: حيٌّ ومحذوفٌ ومطويّ وسلاسل ---- */
const P = (id, name, extra = {}) => ({ id, name, barcode: null, alt_codes: [], stock: 3, ...extra });
const T = (id, row, extra = {}) => ({ id, row, deleted_at: "2026-11-20T10:00:00Z", stock: row.stock ?? 0, sold_qty: 0, merged_into: null, ...extra });
const LIVE = [P("k1", "أموكسيسيلين ٥٠٠", { barcode: "6281001" }), P("k2", "رويال كانين")];
const TRASH = [
  // الأقدمُ حذفاً أوّلاً بالمصفوفة وبمعرّفٍ أصغر: الترتيبُ «الأحدثُ أوّلاً» من الدالّة لا من القالب ولا من كاسر التعادل (طفرةٌ بلا ترتيبٍ مرّت مرّتين).
  T("d0", P("d0", "إنروفلوكساسين قديم", { barcode: "6290002" }), { deleted_at: "2026-11-01T10:00:00Z" }),
  T("d1", P("d1", "إنروفلوكساسين", { barcode: "6290001", alt_codes: ["SHELF-7"] }), { stock: 4 }),
  T("m1", P("m1", "اموكسي ٥٠٠ (توأم)", { barcode: "6281999" }), { merged_into: "k1" }),
  T("m2", P("m2", "رويال", {}), { merged_into: "m3" }),               // سلسلة: m2 ⇐ m3 ⇐ k2 الحيّ
  T("m3", P("m3", "رويال كانين ٢", {}), { merged_into: "k2" }),
  T("m4", P("m4", "فيتامين مطويّ", {}), { merged_into: "d3" }),        // سلسلةٌ تنتهي بمحذوف
  T("d3", P("d3", "فيتامين أ", { barcode: "6293333" })),
  T("m5", P("m5", "يتيم", {}), { merged_into: "gone" }),              // أصلٌ غائب ⇒ لا شيء
  T("dup", P("dup", "أموكسيسيلين ٥٠٠", { barcode: "6281001" })),       // رمزُه ورمزُ حيٍّ واحد
];

async function scenario(M) {
  const out = {};
  const k = (h) => (h ? `${h.kind}:${h.t.id}${h.kind === "merged" ? `>${h.keeper.id}` : ""}` : "null");
  out.code = k(M.trashByCode(TRASH, LIVE, "6290001"));
  out.alt = k(M.trashByCode(TRASH, LIVE, "shelf-7"));
  out.invisible = k(M.trashByCode(TRASH, LIVE, "‎6290001‏ "));
  out.liveHas = k(M.trashByCode(TRASH, LIVE, "6281001"));
  out.mergedCode = k(M.trashByCode(TRASH, LIVE, "6281999"));
  out.chainDeleted = k(M.trashByCode(TRASH, LIVE, "6293333"));
  out.none = k(M.trashByCode(TRASH, LIVE, "000"));
  const q = (s, o) => { const r = M.trashByQuery(TRASH, LIVE, s, o); return `${r.hits.map(k).join(",")}|${r.more}`; };
  out.search = q("انروفلوكساسين");                    // همزةٌ بلا همزة، والأحدثُ حذفاً أوّلاً
  out.searchMax = q("انروفلوكساسين", { max: 1 });
  out.searchCode = q("6290002");
  out.merged = q("رويال");                             // m2 بسلسلته وm3 — كلٌّ بالاسم الذي بُحث به
  out.mergedOrphan = q("يتيم");
  out.vitamin = q("فيتامين");                          // m4 ⇒ d3 (يُسترجع آخرُ السلسلة) وd3 نفسُها مرّةً واحدة
  out.exact = q("انروفلوكساسين", { exact: true });
  out.exactLive = q("أموكسيسيلين ٥٠٠", { exact: true }); // اسمٌ تحمله حيّةٌ ليس «ما نلكاها»
  out.empty = q("   ");
  return out;
}
const EXPECT = {
  code: "deleted:d1", alt: "deleted:d1", invisible: "deleted:d1", liveHas: "null", mergedCode: "merged:m1>k1", chainDeleted: "deleted:d3",
  none: "null", search: "deleted:d1,deleted:d0|0", searchMax: "deleted:d1|1", searchCode: "deleted:d0|0",
  merged: "merged:m2>k2,merged:m3>k2|0", mergedOrphan: "|0", vitamin: "deleted:d3|0", exact: "deleted:d1|0", exactLive: "|0", empty: "|0",
};

console.log("▸ ١) المطابقة (trashMatch.ts) بسلوكها");
const M = await loadMatch();
const got = await scenario(M);
for (const [key, v] of Object.entries(EXPECT)) check(`${key}: ${v}`, got[key] === v, got[key]);

console.log("▸ ٢) طفراتٌ على المطابقة — كلٌّ تُمسك");
const MUTANTS = [
  ["الرمزُ بلا تطبيع (مقارنةٌ خامّة)", (s) => s.replace("if (!carriesCode(t.row, code)) continue;", "if (t.row.barcode !== code && !(t.row.alt_codes ?? []).includes(code)) continue;")],
  ["الحيُّ الذي يحمل الرمزَ لا يُستثنى", (s) => s.replace("if (!code || live.some((p) => carriesCode(p, code))) return null;", "if (!code) return null;")],
  ["المطويُّ لا يُتبع لأصله", (s) => s.replace("if (!cur.merged_into) return { kind: \"deleted\", t: cur };", "return { kind: \"deleted\", t: cur };")],
  ["الاسمُ بلا searchable (همزة)", (s) => s.replace("const qKey = searchable(query.trim());", "const qKey = query.trim();").replace("const rowKey = searchable(t.row?.name ?? \"\");", "const rowKey = t.row?.name ?? \"\";")],
  ["بلا ترتيب الأحدث أوّلاً", (s) => s.replace("String(b.deleted_at ?? \"\").localeCompare(String(a.deleted_at ?? \"\")) || ", "")],
  ["القصُّ صامت (more صفر)", (s) => s.replace("more: Math.max(0, hits.length - max)", "more: 0")],
  ["الدقيقُ يقبل جزءَ الاسم", (s) => s.replace("const byName = opts.exact ? rowKey === qKey : rowKey.includes(qKey);", "const byName = rowKey.includes(qKey);")],
];
for (const [name, mut] of MUTANTS) {
  let applied = true;
  const Mm = await loadMatch((s) => { const o = mut(s); if (o === s) applied = false; return o; });
  if (!applied) { check(`طفرة «${name}» تنطبق على النصّ`, false, "النصُّ تغيّر — حدّث الطفرة"); continue; }
  const g = await scenario(Mm).catch((e) => ({ crash: String(e) }));
  check(`طفرة «${name}» يمسكها الفحص`, Object.entries(EXPECT).some(([key, v]) => g[key] !== v));
}

console.log("▸ ٣) القطعة (TrashHint.tsx) بسلوكها");
const STUBS = {
  "@/lib/repo": `export const calls = { list: 0, restore: [] }; export const state = { trash: [], fail: false };
    export const repo = {
      listDeletedProducts: async () => { calls.list++; if (state.fail) throw new Error("net"); return state.trash; },
      restoreProduct: async (id) => { calls.restore.push(id); return { id, name: "مسترجعة" }; },
    };`,
  "@/lib/clinics": "export const getActiveClinicId = () => 'c1';",
  "@/lib/errors": "export const describeDbError = (e) => String(e && e.message || e);",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, loading, variant, size, ...p }) => createElement("x-button", p, children);
    export const toasts = []; export const useToast = () => ({ success: (m) => toasts.push(["ok", m]), error: (m) => toasts.push(["err", m]) });`,
};
const UI = await loadUI(`export { TrashSearchHint, TrashTwinWarn, trashForCode, say, invalidateTrash, loadTrash } from "./src/components/inventory/TrashHint.tsx";
  export * as repoStub from "@/lib/repo"; export { toasts } from "@/components/ui";`, STUBS);
const { mount, React, TrashSearchHint, TrashTwinWarn, trashForCode, invalidateTrash, repoStub } = UI;
const h = React.createElement;
repoStub.state.trash = TRASH;
{
  const ev = { restored: [], picked: [] };
  const ui = mount(h(TrashSearchHint, { query: "انروفلوكساسين", products: LIVE, canRestore: true, onRestored: (p) => ev.restored.push(p.id), onPick: (p) => ev.picked.push(p.id) }));
  await ui.settle();
  const rows = ui.findAll("data-trashhit");
  check("«لا نتائج» عن محذوفتين: صفّان «محذوفة» بزرّ «رجّعها» (الأحدثُ أوّلاً)", rows.length === 2 && rows.every((r) => r.props["data-trashhit"] === "deleted") && ui.findAll("data-trashrestore").length === 2, rows.length);
  ui.click(ui.findAll("data-trashrestore")[0]);
  await ui.settle();
  check("  «رجّعها» يسترجع الأحدثَ بمعرّفه ويقول للصفحة (تحدّث قائمتَها)", JSON.stringify(repoStub.calls.restore) === JSON.stringify(["d1"]) && JSON.stringify(ev.restored) === JSON.stringify(["d1"]), { calls: repoStub.calls.restore, ev });
  ui.unmount();
}
{
  const ui = mount(h(TrashSearchHint, { query: "انروفلوكساسين", products: LIVE, canRestore: false, onRestored: () => {} }));
  await ui.settle();
  check("بلا صلاحية الاسترجاع (الاستقبال): لا زرّ، وجملةُ «يرجّعها المدير أو الطبيب»", !ui.find("data-trashrestore") && ui.text().includes("trsh.askManager"), ui.text());
  ui.unmount();
}
{
  const picked = [];
  const ui = mount(h(TrashSearchHint, { query: "رويال", products: LIVE, canRestore: true, onRestored: () => {}, onPick: (p) => picked.push(p.id) }));
  await ui.settle();
  check("مطويّةٌ بدمج: «اندمجت بـ«الأصل»» بلا «رجّعها»، وزرُّ الأصل يختاره", ui.findAll("data-trashhit").every((r) => r.props["data-trashhit"] === "merged") && !ui.find("data-trashrestore") && !!ui.find("data-trashpick"));
  ui.click(ui.find("data-trashpick"));
  check("  والضغطةُ تختار الأصلَ الحيّ (k2)", JSON.stringify(picked) === JSON.stringify(["k2"]), picked);
  ui.unmount();
}
{
  invalidateTrash();
  repoStub.state.fail = true;
  const ui = mount(h(TrashSearchHint, { query: "انروفلوكساسين", products: LIVE, canRestore: true, onRestored: () => {} }));
  await ui.settle();
  check("فشلُ قراءة المحذوفات: لا شيءَ يُرسم (الرسالةُ الأصليّة فوقه تبقى — لا «ماكو محذوفات»)", ui.findAll("data-trashhit").length === 0 && !ui.find("data-trashsearch"));
  ui.unmount();
  repoStub.state.fail = false;
  invalidateTrash();
}
{
  const ui = mount(h(TrashTwinWarn, { code: "6290001", name: "", products: LIVE, canRestore: true, onRestored: () => {} }));
  await ui.settle();
  check("مادّةٌ «جديدة» برمز محذوفة: تحذيرُ «رجّعها بدل ما تضيفها جديدة»", !!ui.find("data-trashtwin") && ui.text().includes("trsh.twinDeleted"), ui.text());
  ui.unmount();
  const ui2 = mount(h(TrashTwinWarn, { code: "", name: "انروفلوكساسي", products: LIVE, canRestore: true, onRestored: () => {} }));
  await ui2.settle();
  check("  وجزءُ الاسم لا يحذّر (الدقيقُ كلُّه)", !ui2.find("data-trashtwin"));
  ui2.unmount();
  const ui3 = mount(h(TrashTwinWarn, { code: "6281001", name: "أموكسيسيلين ٥٠٠", products: LIVE, canRestore: true, onRestored: () => {} }));
  await ui3.settle();
  check("  ورمزٌ واسمٌ تحملهما حيّة لا يحذّران (حارسُ التوائم الحيّ يقولها)", !ui3.find("data-trashtwin"));
  ui3.unmount();
}
{
  invalidateTrash();
  const n0 = repoStub.calls.list;
  await trashForCode("6290001", LIVE); await trashForCode("x", LIVE);
  const n1 = repoStub.calls.list;
  await trashForCode("6290001", LIVE.slice(0, 1));
  check("الخبيئة: المسحاتُ بالدقيقة نفسِها قراءةٌ واحدة، وتغيّرُ عدد الحيّة (حذفٌ/دمجٌ/استرجاع) يقرأ من جديد",
    n1 - n0 === 1 && repoStub.calls.list - n1 === 1, { n0, n1, n2: repoStub.calls.list });
}

console.log("▸ ٤) الوصل بالنصّ");
const sb = src("src/components/retail/SaleBuilder.tsx");
const inv = src("src/pages/Inventory.tsx");
const pur = src("src/components/inventory/Purchases.tsx");
const noStatic = (s) => !/^import [^\n]*TrashHint/m.test(s);
check("لا استيرادَ ثابتاً للقطعة بشاشة البيع والمخزون والشراء (import() ونطاقُها trsh)",
  noStatic(sb) && noStatic(inv) && noStatic(pur) && /ensureOwned\("trsh"\)/.test(sb) && /\["trsh"\]\)/.test(inv) && /\["trsh"\]\)/.test(pur));
check("الماسحُ: المحذوفاتُ تُسأل بمهلة **قبل** «مو موجود — أضفها»، وتُقال بدلها",
  /const th = await withTimeout\(loadTrashMod\(\)\.then\(async \(m\) => \(\{ m, hit: await m\.trashForCode\(code, products\) \}\)\), 2500\)[\s\S]{0,200}?if \(th\?\.hit\) \{ toast\.error\(th\.m\.say\.scan\(th\.hit, normalizeCode\(code\)\)\); return; \}\s*toast\.error\(t\("retail\.scanUnknown"/.test(sb));
check("  وبحثُ البيع بلا نتائج يرسم «بالمحذوفات» تحت «لا نتائج» (والمطويّةُ تبيع أصلَها من sellOrExplain)",
  /\{ql && \(TrashSearchLazy \?\?= loadTrashSearch\(\)\) && \(/.test(sb) && /onPick=\{\(p\) => \{ setQuery\(""\); void sellOrExplain\(p, takeMult\(\)\); \}\}/.test(sb));
check("المخزون: «لا نتائج» بالبحث يرسمها، ونموذجُ **الإضافة** وحده يحذّر (التعديلُ مادّةٌ قائمة)",
  /\(TrashSearchLazy \?\?= loadTrashSearch\(\)\) && \(/.test(inv) && /\{!product && \(f\.barcode\.trim\(\) \|\| f\.name\.trim\(\)\) && \(TrashTwinLazy \?\?= loadTrashTwin\(\)\)/.test(inv));
check("الشراء: التحذيرُ لسطرٍ «جديد» يطابق محذوفةً وحده (لا شريطَ فارغاً تحت كلّ سطر)، والمطويّةُ تحوّل السطرَ تعبئةً لأصلها",
  /const trashHit = !matched && filled && !sugg\.length && trash/.test(pur) && /if \(trashHit && \(TrashTwinLazy \?\?= loadTrashTwin\(\)\)\) \{/.test(pur)
  && /onPick=\{\(p\) => \{ playTap\(\); setLines\(\(ls\) => ls\.map\(\(x\) => \(x\.key === l\.key \? \{ \.\.\.lineFromProduct\(p, x\.barcode\.trim\(\)\)/.test(pur));

console.log(`${fail ? "✗" : "✓"} trash-hint-test: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
