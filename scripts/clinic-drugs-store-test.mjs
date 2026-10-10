/* ============================================================================
 * متجرُ «أدويتي» (`src/lib/clinicDrugs.ts`) — يُقاد بخادمٍ مزيّف قواعدُه قواعدُ المرآة
 * الحقيقية (`applyOps` — مرآةُ clinic_drugs_apply)، ويُسأل: متى ناديت، وبأيّ ختم، وشنو
 * أرسلت، وشنو صار بالشاشة حين رُفضت. على سُنّة `cage-rows-test`.
 *
 *  (a) قراءةٌ فاشلة ⇒ حالُ `error` وتبقى الصفوفُ الأخيرة — لا `[]` كاذبة.
 *  (b) نقلٌ متفائلٌ رفضه الخادم ⇒ يرجع لـ`base`، ويرمي، ويُقرأ مرّةً واحدة.
 *  (c) الختمُ من الخادم؛ وclinic_switched ⇒ قراءةٌ ولا كتابةَ ثانية.
 *  (d) ختمٌ غيرُ العيادة النشطة ⇒ `switched` بصفرِ صفوف.
 *  (e) تغييرُ جهازٍ آخر يظهر حين تُستبدل اللقطة.
 *  (f) القراءةُ لا تنادي الكتابةَ أبداً.
 *  (g) القراءةُ عند الرجوع للتبويب كلَّ ١٥ث على الأكثر.
 *  (h) ما يأتي أثناء طلبٍ بالطريق يُطوى بطلبٍ واحدٍ بعده.
 *  (i) «أضف» طواه الخادمُ على صفٍّ قائم ⇒ ما ينتظر يُرسل بمعرّف الخادم.
 *
 *   node scripts/clinic-drugs-store-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

globalThis.__clinic = "C1";
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      react: "export const useSyncExternalStore = () => undefined; export const useEffect = () => {};",
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' }; export default i;",
      "./repo": "export const repo = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__srv[k](...a) });",
      "./clinics": "export const getActiveClinicId = () => globalThis.__clinic;",
      "./clinicSync": "export const registerReset = (fn) => { globalThis.__reset = fn; }; export const sb = () => null;",
    };
    const names = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
    b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path], loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: { contents: `export * from "./src/lib/clinicDrugs.ts"; export { applyOps, DrugOpError, mineOrder } from "./src/lib/medIndex.ts";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"], plugins: [stubs],
});
const dir = mkdtempSync(join(tmpdir(), "cd-store-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const S = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- الخادمُ المزيّف: صفوفٌ بختم عيادة، وقواعدُ applyOps ------------------- */
const NOW = "2026-10-10T00:00:00.000Z";
const R = (id, name, pos = null, extra = {}) => ({ id, name, family: "other", in_mine: pos != null, pos, archived_at: null, created_at: NOW, updated_at: NOW, ...extra });
const srv = { clinic: "C1", rows: [], calls: [], failList: null, failApply: null, hold: null };
const clone = (x) => JSON.parse(JSON.stringify(x));
globalThis.__srv = {
  async listClinicDrugs() {
    srv.calls.push({ m: "list" });
    if (srv.failList) throw srv.failList;
    return { clinic: srv.clinic, rows: clone(srv.rows) };
  },
  async applyClinicDrugs(clinic, ops) {
    srv.calls.push({ m: "apply", clinic, ops: clone(ops) });
    if (srv.hold) await srv.hold;
    if (srv.failApply) throw srv.failApply;
    if (clinic !== srv.clinic) throw new S.DrugOpError("clinic_switched");
    srv.rows = S.applyOps(srv.rows, ops, NOW);
    return { clinic: srv.clinic, rows: clone(srv.rows) };
  },
  async listMedicineStock() { return []; },
  async recentMedNames() { return []; },
};
const calls = (m) => srv.calls.filter((c) => c.m === m);
const fresh = async (rows, clinic = "C1") => {
  globalThis.__reset();
  srv.rows = clone(rows); srv.clinic = clinic; srv.calls = []; srv.failList = null; srv.failApply = null; srv.hold = null;
  globalThis.__clinic = "C1";
  await S.loadClinicDrugs(true);
  await settle();
};
const view = () => S.mineOrder(S.getDrugsState().view).map((r) => r.name).join(",");
const swallow = (p) => p.then(() => "ok", (e) => e?.message ?? String(e));

console.log("▸ (a) قراءةٌ فاشلة");
{
  await fresh([R("a", "A", 1024)]);
  srv.failList = new Error("boom");
  await S.loadClinicDrugs(true);
  check("الحالُ error والصفوفُ الأخيرة باقية (لا [])", S.getDrugsState().status === "error" && view() === "A");
  globalThis.__reset();
  await S.loadClinicDrugs(true);
  check("  وأوّلُ قراءةٍ فاشلة ⇒ error لا ready فارغة", S.getDrugsState().status === "error" && S.getDrugsState().view.length === 0);
}

console.log("▸ (b) نقلٌ متفائلٌ رفضه الخادم");
{
  await fresh([R("a", "A", 1024), R("b", "B", 2048)]);
  srv.failApply = Object.assign(new Error("drug_row_gone"), { code: "P0001", hint: "x" });
  const p = swallow(S.applyDrugOps([{ op: "move", id: "b", after: null }]));
  check("الشاشةُ أوّلاً: B فوق A قبل جواب الخادم", view() === "B,A");
  const lists = calls("list").length;
  const got = await p;
  await settle();
  check("الرفضُ يُرمى للمستدعي", got === "drug_row_gone", got);
  check("  والشاشةُ رجعت لما أكّده الخادم", view() === "A,B");
  check("  وقُرئت القائمةُ مرّةً واحدة", calls("list").length === lists + 1, `${calls("list").length - lists}`);
}

console.log("▸ (c) الختمُ من الخادم، وclinic_switched لا يُكرَّر");
{
  await fresh([R("a", "A", 1024)]);
  await S.applyDrugOps([{ op: "put", id: "n1", name: "N", family: "gi", mine: true }]);
  check("الكتابةُ ترسل ختمَ الخادم", calls("apply")[0]?.clinic === "C1");
  srv.clinic = "C2";   // تبدّلت الجلسةُ بالخادم والمتصفّحُ ما زال على C1
  const got = await swallow(S.applyDrugOps([{ op: "unmine", id: "a" }]));
  await settle();
  check("clinic_switched يُرمى", got === "clinic_switched", got);
  check("  ولا كتابةَ ثانية، والقراءةُ تقول switched", calls("apply").length === 2 && S.getDrugsState().status === "switched");
}

console.log("▸ (d) ختمٌ غيرُ العيادة النشطة");
{
  await fresh([R("a", "A", 1024)], "C9");
  check("switched بصفرِ صفوف", S.getDrugsState().status === "switched" && S.getDrugsState().view.length === 0);
  const got = await swallow(S.applyDrugOps([{ op: "unmine", id: "a" }]));
  check("  ولا كتابة", got !== "ok" && calls("apply").length === 0);
}

console.log("▸ (e) تغييرُ جهازٍ آخر");
{
  await fresh([R("a", "A", 1024)]);
  srv.rows.push(R("z", "Z", 2048));
  await S.loadClinicDrugs(true);
  check("يظهر حين تُستبدل اللقطة", view() === "A,Z");
}

console.log("▸ (f) القراءةُ لا تكتب");
{
  await fresh([R("a", "A", 1024)]);
  await S.loadClinicDrugs(true); await S.loadClinicDrugs(); S.refreshIfStale(); await settle();
  check("صفرُ نداءِ كتابة بعد قراءاتٍ متعدّدة", calls("apply").length === 0);
}

console.log("▸ (g) الرجوعُ للتبويب");
{
  await fresh([R("a", "A", 1024)]);
  const base = calls("list").length;
  const T = 9e12;
  S.onDrugsVisible(T); await settle();
  S.onDrugsVisible(T + 5_000); await settle();
  S.onDrugsVisible(T + 16_000); await settle();
  check("قراءتان لا ثلاث (كلَّ ١٥ث على الأكثر)", calls("list").length - base === 2, `${calls("list").length - base}`);
}

console.log("▸ (h) طلبٌ واحدٌ بالطريق");
{
  await fresh([R("a", "A", 1024), R("b", "B", 2048), R("c", "C", 3072)]);
  let release;
  srv.hold = new Promise((r) => { release = r; });
  const p1 = S.applyDrugOps([{ op: "move", id: "c", after: null }]);
  await tick();
  const p2 = S.applyDrugOps([{ op: "move", id: "b", after: null }]);
  const p3 = S.applyDrugOps([{ op: "unmine", id: "a" }]);
  const p4 = S.applyDrugOps([{ op: "move", id: "c", after: "b" }]);
  check("الشاشةُ تطبّقها كلَّها فوراً", view() === "B,C");
  check("  وطلبٌ واحدٌ بالطريق", calls("apply").length === 1);
  srv.hold = null; release();
  await Promise.all([p1, p2, p3, p4]);
  await settle();
  check("ثم طلبٌ واحدٌ يحمل الثلاثة", calls("apply").length === 2 && calls("apply")[1].ops.length === 3);
  check("  والخادمُ والشاشةُ متّفقان", view() === "B,C" && S.mineOrder(srv.rows).map((r) => r.name).join(",") === "B,C");
}

console.log("▸ (i) معرّفُ المتصفّح ⇒ معرّفُ الخادم");
{
  await fresh([R("a", "A", 1024)]);
  srv.rows.push(R("srv-melox", "Meloxicam"));   // جهازٌ آخر أضافه بعد لقطتنا
  let release;
  srv.hold = new Promise((r) => { release = r; });
  const p1 = S.applyDrugOps([{ op: "put", id: "tmp-1", name: "meloxicam", family: "analgesics", mine: true }]);
  await tick();
  const p2 = S.applyDrugOps([{ op: "move", id: "tmp-1", after: null }]);
  srv.hold = null; release();
  const got = await Promise.all([swallow(p1), swallow(p2)]);
  await settle();
  const second = calls("apply")[1]?.ops?.[0];
  check("النقلُ المنتظَر أُرسل بمعرّف الخادم", second?.id === "srv-melox", JSON.stringify(second));
  check("  وقُبل، والشاشةُ على الصفّ القائم بأوّل القائمة", got.join() === "ok,ok" && view() === "Meloxicam,A" && !S.getDrugsState().view.some((r) => r.id === "tmp-1"), `${got} ${view()}`);
}

console.log(fails ? `\n✗ clinic-drugs-store-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ clinic-drugs-store-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
