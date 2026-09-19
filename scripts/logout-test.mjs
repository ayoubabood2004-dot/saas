/* ============================================================================
 * فحصُ تسلسل الخروج — ط٦ من docs/pos-freshness-plan.md
 *
 * الشكوى بالسجلّ: ٣× `permission denied for function end_elevation` يومياً. القياس
 * (سجلّ الطلبات، ١٨ أيلول): الطلبُ الفاشل خرج بهويّة `anon` — بلا رمز المستخدم —
 * ونفسُ الدالّة لنفس المستخدم بعد دقائق خرجت `authenticated` ونجحت (204).
 * والصلاحياتُ سليمة (لـauthenticated وحده، عمداً). فالخللُ **الترتيب** لا المنح:
 * الخروجُ كان يطلق الإنهاءَ بلا انتظار ثم يمسح الجلسة، فيسبق المسحُ قراءةَ الرمز.
 *
 * العميلُ المزيّف هنا يحاكي آليةَ supabase-js الحقيقية: قراءةُ الرمز قبل الإرسال
 * و`signOut` يمرّان من **قفلٍ واحد** بالترتيب، و`then` البنّاء هو ما يطلق الإرسال.
 * والفحصُ الأوّل يُثبت أن المحاكاةَ تُعيد عطلَ الإنتاج بالترتيب القديم — وإلا
 * لكان الفحصُ الثاني يمرّ على محاكاةٍ لا تشبه الواقع.
 *
 *   node scripts/logout-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, existsSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** عميلٌ على هيئة supabase-js: قفلٌ واحدٌ FIFO تمرّ منه قراءةُ الرمز والخروج. */
function fakeClient({ hang = false, reject = false } = {}) {
  let session = { role: "authenticated" };
  let lock = Promise.resolve();
  const withLock = (fn) => (lock = lock.then(fn));
  const sent = [];
  return {
    sent,
    get session() { return session; },
    rpc(name) {
      return {
        // `then` البنّاء = fetchWithAuth: يقرأ الرمزَ من خلف القفل ثم يُرسل.
        then(res, rej) {
          return withLock(async () => session?.role ?? "anon")
            .then((role) => {
              sent.push({ name, role });
              if (hang) return new Promise(() => {});
              if (reject) return Promise.reject(new Error("network"));
              return sleep(5).then(() => ({ error: role === "anon" ? { code: "42501" } : null }));
            })
            .then(res, rej);
        },
      };
    },
    auth: { signOut: () => withLock(async () => { session = null; }) },
  };
}

console.log("▸ المحاكاةُ تُعيد عطلَ الإنتاج بالترتيب القديم");
{
  const c = fakeClient();
  // الترتيبُ القديم حرفياً: إطلاقٌ بلا انتظار، ثم مسحُ الجلسة بنفس النبضة.
  void Promise.resolve(c.rpc("end_elevation")).then(() => undefined, () => undefined);
  await c.auth.signOut();
  await sleep(30);
  check("الترتيبُ القديم يُرسل end_elevation بهويّة anon (كما بسجلّ الإنتاج)", c.sent[0]?.role === "anon", JSON.stringify(c.sent));
}

console.log("▸ الترتيبُ الجديد: الإنهاءُ بهويّة المستخدم، ثم الخروج");
const path = "src/lib/logoutSequence.ts";
const mod = existsSync(path)
  ? await import("data:text/javascript;base64," + Buffer.from((await esbuild.build({ entryPoints: [path], bundle: true, format: "esm", write: false, platform: "neutral" })).outputFiles[0].text).toString("base64"))
  : null;
check("وحدةُ التسلسل موجودة (src/lib/logoutSequence.ts)", !!mod);
if (mod) {
  const c = fakeClient();
  await mod.endElevationThenSignOut({ endElevation: () => c.rpc("end_elevation"), signOutLocal: () => c.auth.signOut() });
  check("  end_elevation خرج بهويّة authenticated", c.sent[0]?.role === "authenticated", JSON.stringify(c.sent));
  check("  والجلسةُ مُسحت بعده", c.session === null);

  const h = fakeClient({ hang: true });
  const t0 = Date.now();
  await mod.endElevationThenSignOut({ endElevation: () => h.rpc("end_elevation"), signOutLocal: () => h.auth.signOut(), waitMs: 200 });
  const took = Date.now() - t0;
  check("  نتٌ ميّت لا يحبس أحداً بالخروج (يخرج بعد السقف)", h.session === null && took < 1000, `${took}ms`);
  check("  وحتى حينها خرج الطلبُ بهويّته قبل المسح", h.sent[0]?.role === "authenticated");

  const r = fakeClient({ reject: true });
  await mod.endElevationThenSignOut({ endElevation: () => r.rpc("end_elevation"), signOutLocal: () => r.auth.signOut() });
  check("  فشلُ الإنهاء لا يوقف الخروج", r.session === null);

  let signedOut = false;
  await mod.endElevationThenSignOut({ endElevation: () => undefined, signOutLocal: async () => { signedOut = true; } });
  check("  بلا عميلٍ سحابيّ (تجريبي) يخرج مباشرة", signedOut);

  let thrown = false;
  await mod.endElevationThenSignOut({ endElevation: () => { throw new Error("x"); }, signOutLocal: async () => { thrown = true; } });
  check("  ورميٌ متزامنٌ من الإنهاء لا يمنع الخروج", thrown);
}

console.log("▸ الشاشاتُ تستعمل التسلسل ولا تعود للترتيب القديم");
const auth = readFileSync("src/contexts/AuthContext.tsx", "utf8").replace(/\r\n/g, "\n");
const signOutBody = auth.slice(auth.indexOf("const signOut = () => {"), auth.indexOf("const leaveClinic"));
check("الخروجُ يمرّ بـendElevationThenSignOut", /endElevationThenSignOut\(/.test(signOutBody));
check("  ولا يمسح الجلسةَ خارجه — مسحٌ واحدٌ، وداخل signOutLocal",
  (signOutBody.match(/\.auth\.signOut\(/g) ?? []).length === 1 && /signOutLocal:\s*\(\)\s*=>[^\n]*\.auth\.signOut\(/.test(signOutBody));
const mo = readFileSync("src/lib/managerOverride.ts", "utf8").replace(/\r\n/g, "\n");
const eol = mo.slice(mo.indexOf("export function endElevationOnLogout"), mo.indexOf("\n}\n", mo.indexOf("export function endElevationOnLogout")));
check("endElevationOnLogout تُرجع نداءَ الإنهاء ليُنتظر (لا void)", /\):\s*PromiseLike<unknown>\s*\|\s*undefined/.test(eol) && !/void Promise\.resolve\(client\.rpc\("end_elevation"\)\)/.test(eol));

console.log(`\n${fails ? "✗" : "✓"} logout-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
