/* ============================================================================
 * مفتاحُ العيادة المحلّيّ وصاحبُ العيادة (١٣/١٠) — workspaceClinic.ts وAuthContext.
 *
 * المقيس: المالكون التسعة بلا profiles.clinic_id فمفتاحُهم "default"؛ والمشغّلُ (وهو مالكٌ
 * أيضاً) يخرج من عيادة زبون فيبقى مفتاحُها عنده. فكانت «أدويتي» والتصنيفات تقول «تبدّلت
 * العيادة» لكلّ صاحب عيادة، و«الرحلة» تُرسل "default" معرّفاً فتُرفض (صفرُ رحلةٍ بالإنتاج).
 *
 *   (a) clinicKeyAction: المالكُ المؤكَّد يُمسح مفتاحُه الباقي، والبحثُ الفاشل لا يمسح شيئاً
 *   (b) expectedServerClinic: "default" = حسابُ الجلسة، وغيرُه كما هو
 *   (c) الرحلةُ كلُّها: دخولٌ لعيادة زبون ثم خروج ⇒ عيادتُه بلا «تبدّلت»
 *   (d) دبابيس: لا مقارنةَ ولا إدراجَ بالمفتاح الخامّ حيث يُقصد معرّفُ الخادم
 *
 *   node scripts/owner-key-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* مفتاحٌ بذاكرة، وجلسةُ Supabase يتحكّم بها الفحص (globalThis.__uid / __sessFail). */
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      "./clinics": `
        export const getActiveClinicId = () => globalThis.__key ?? "default";
        export const setActiveClinicId = (id) => { globalThis.__key = id; };
        export const clearActiveClinic = () => { globalThis.__key = undefined; };
      `,
      "./supabase": `export const supabase = { auth: { getSession: async () => {
        if (globalThis.__sessFail) throw new Error("offline");
        return { data: { session: globalThis.__uid ? { user: { id: globalThis.__uid } } : null } };
      } } };`,
    };
    const names = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
    b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path], loader: "js" }));
  },
};
let W;
try {
  const built = await esbuild.build({
    stdin: { contents: `export * from "./src/lib/workspaceClinic.ts"; export * as K from "./clinics";`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", plugins: [stubs],
  });
  const dir = mkdtempSync(join(tmpdir(), "owner-key-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  W = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
} catch (e) {
  console.error(`✗ owner-key-test: ما انبنت الوحدة — ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
}

console.log("▸ (a) clinicKeyAction — ماذا يفعل AuthContext بالمفتاح");
{
  const A = (o) => W.clinicKeyAction({ active: "clinic", staffClinic: null, profileClinic: null, ownConfirmed: false, ...o });
  check("حسابُ مربّي (owner) ⇒ يُمسح", W.clinicKeyAction({ active: "owner", staffClinic: null, profileClinic: null, ownConfirmed: false }) === "clear");
  check("موظّفٌ (أو مشغّلٌ داخلٌ عيادةَ زبون) ⇒ عيادتُه", JSON.stringify(A({ staffClinic: "X" })) === '{"set":"X"}');
  check("ملفٌّ فيه عيادة ⇒ هي", JSON.stringify(A({ profileClinic: "P" })) === '{"set":"P"}');
  check("مالكٌ أكّد الخادمُ أنه بعيادته ⇒ يُمسح المفتاحُ الباقي (يرجع default)", A({ ownConfirmed: true }) === "clear");
  check("بحثُ العضوية فشل (لا تأكيد) ⇒ لا يُلمس — مفتاحُ موظّفٍ بشبكةٍ متعثّرة يبقى", A({}) === "keep");
  check("لا دورَ بعد ⇒ لا يُلمس", W.clinicKeyAction({ active: null, staffClinic: "X", profileClinic: null, ownConfirmed: true }) === "keep");
}

console.log("▸ (b) expectedServerClinic — المفتاحُ بلغة الخادم");
{
  globalThis.__key = undefined; globalThis.__uid = "O"; globalThis.__sessFail = false;
  check("default + جلسةُ O ⇒ O", (await W.expectedServerClinic()) === "O");
  globalThis.__key = "X";
  check("مفتاحُ عيادة X ⇒ X (الجلسةُ لا تُسأل)", (await W.expectedServerClinic()) === "X");
  globalThis.__key = undefined; globalThis.__uid = undefined;
  check("default بلا جلسة ⇒ default (يبقى switched، لا يُخمَّن)", (await W.expectedServerClinic()) === "default");
  globalThis.__sessFail = true; globalThis.__uid = "O";
  check("الجلسةُ رمت ⇒ default (لا يُكسر شيء)", (await W.expectedServerClinic()) === "default");
  globalThis.__sessFail = false;
}

console.log("▸ (c) المشغّلُ يدخل عيادةَ زبون ثم يخرج — كما جرى بالإنتاج ١٢/١٠");
{
  /* الخادمُ: auth_clinic = عيادةُ الزبون أثناء الجلسة، وعيادتُه بعدها. والشاشةُ ready إن ساوى
   * ختمُ الخادم expectedServerClinic. */
  const apply = (act) => { if (act === "clear") W.K.clearActiveClinic(); else if (act !== "keep") W.K.setActiveClinicId(act.set); };
  const screen = async (server) => ((await W.expectedServerClinic()) === server ? "ready" : "switched");
  globalThis.__key = undefined; globalThis.__uid = "O";
  apply(W.clinicKeyAction({ active: "clinic", staffClinic: null, profileClinic: null, ownConfirmed: true }));
  check("بعيادته قبل الدخول ⇒ ready", (await screen("O")) === "ready");
  apply(W.clinicKeyAction({ active: "clinic", staffClinic: "B", profileClinic: null, ownConfirmed: false }));
  check("داخلُ عيادة الزبون B (my_workspace: is_staff) ⇒ ready على B", (await screen("B")) === "ready" && W.K.getActiveClinicId() === "B");
  /* الخروج: my_workspace يقول عيادتَه (is_staff=false). كان المفتاحُ يبقى B. */
  const before = W.K.getActiveClinicId();
  apply(W.clinicKeyAction({ active: "clinic", staffClinic: null, profileClinic: null, ownConfirmed: true }));
  check("بعد الخروج ⇒ المفتاحُ رجع default (كان يبقى B)", before === "B" && W.K.getActiveClinicId() === "default");
  check("  والشاشةُ ready على عيادته — لا «تبدّلت العيادة»", (await screen("O")) === "ready");
  /* ولو فشل بحثُ العضوية بالإقلاع التالي: لا يُمسح شيءٌ على ظنّ. */
  globalThis.__key = "B";
  apply(W.clinicKeyAction({ active: "clinic", staffClinic: null, profileClinic: null, ownConfirmed: false }));
  check("إقلاعٌ بشبكةٍ متعثّرة (لا تأكيد) ⇒ المفتاحُ لا يُلمس والشاشةُ switched لا ready كاذبة", W.K.getActiveClinicId() === "B" && (await screen("O")) === "switched");
}

console.log("▸ (d) دبابيس — معرّفُ الخادم حيث يُقصد، لا المفتاحُ الخامّ");
{
  const auth = readFileSync("src/contexts/AuthContext.tsx", "utf8");
  check("AuthContext يقرّر المفتاحَ بـclinicKeyAction وبتأكيد الخادم", /clinicKeyAction\(\{[^}]*ownConfirmed: !!raw\?\.own_clinic/.test(auth));
  const lm = auth.slice(auth.indexOf("async function loadMembership"), auth.indexOf("const DEMO_OWNER"));
  check("  وجدولُ العضوية (لا يرى جلسةَ المشغّل) لا يؤكّد «عيادتي»", (lm.match(/own: true/g) || []).length === 1 && /is_staff\) return \{ staff: null, own: true \}/.test(lm), `${(lm.match(/own: true/g) || []).length}`);
  for (const f of ["src/lib/storeCats.ts", "src/lib/clinicDrugs.ts"]) {
    const s = readFileSync(f, "utf8");
    check(`${f}: ختمُ الخادم يُقارَن بـexpectedServerClinic لا بالمفتاح الخامّ`, /snap\.clinic !== want/.test(s) && !/snap\.clinic !== \(getActiveClinicId/.test(s));
  }
  const repo = readFileSync("src/lib/repo.ts", "utf8");
  const j = repo.slice(repo.indexOf("async createJourney"), repo.indexOf("async addJourneyNote") + 600);
  check("repo: الرحلةُ تكتب clinic_id بمعرّف الخادم (كانت default ⇒ رفض uuid)", !/getActiveClinicId\(\)/.test(j) && (j.match(/expectedServerClinic\(\)/g) || []).length === 3);
}

console.log(fails ? `\n✗ owner-key-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ owner-key-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
