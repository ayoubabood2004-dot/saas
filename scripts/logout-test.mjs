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

/* ── لا نداءَ بلا رفعٍ حيّ (مراجعةٌ عدائية على ط٦) ─────────────────────────
 * حين صار النداءُ يخرج بهويّة المستخدم صار ينجح **كلَّ مرّة** — و`end_elevation`
 * تكتب «أُقفل وضعُ المدير» بسجلّ حركات العيادة مع كلّ خروج، ولو لم يكن رفعٌ أصلاً.
 * والأسوأ: خروجُ مشغّل المنصّة من عيادة زبونٍ يترك سطراً بسجلّها — وهو خطٌّ أحمر
 * (CLAUDE.md: لا أثرَ للدخول عندها). فالخروجُ ينهي الرفعَ **فقط** إن كان حيّاً بالجهاز:
 * بلا رفعٍ لا نداء، فلا سطرَ كاذب ولا أثر. ومعه رفعٌ ⇒ نداءٌ بهويّته وسطرٌ صادق. */
console.log("▸ لا نداءَ بلا رفعٍ حيّ — لا سطرَ كاذب بسجلّ العيادة ولا أثرَ للمشغّل");
if (mod && typeof mod.hasLiveElevation === "function") {
  const now = 1_000_000;
  const H = (entries) => mod.hasLiveElevation(entries, now);
  check("لا أعلامَ ⇒ لا رفع", H([]) === false);
  check("  علمٌ منتهٍ ⇒ لا رفع", H([["vp_override_until_c1", String(now - 1)]]) === false);
  check("  علمٌ حيّ ⇒ رفع", H([["vp_override_until_c1", String(now + 60_000)]]) === true);
  check("  حيٌّ بعيادةٍ ومنتهٍ بأخرى ⇒ رفع", H([["vp_override_until_a", "5"], ["vp_override_until_b", String(now + 1)]]) === true);
  check("  قيمةٌ غيرُ رقمية ⇒ لا رفع", H([["vp_override_until_c1", "nope"]]) === false);
  check("  ومفاتيحُ أخرى لا تُحسب", H([["vp_something_else", String(now + 60_000)]]) === false);
} else {
  check("hasLiveElevation موجودةٌ بـsrc/lib/logoutSequence.ts", false);
}
{
  const moSrc = readFileSync("src/lib/managerOverride.ts", "utf8").replace(/\r\n/g, "\n");
  const e = moSrc.slice(moSrc.indexOf("export function endElevationOnLogout"), moSrc.indexOf("\n}\n", moSrc.indexOf("export function endElevationOnLogout")));
  const liveIdx = e.indexOf("hasLiveElevation(");
  const rpcIdx = e.indexOf('client.rpc("end_elevation")');
  const clearIdx = e.indexOf('removeItem(k)');
  check("endElevationOnLogout تسأل «هل الرفعُ حيّ؟» قبل النداء", liveIdx > 0 && rpcIdx > liveIdx);
  check("  والنداءُ مشروطٌ بالجواب (لا يُطلق دائماً)", /live\s*&&\s*client\s*\?|client\s*&&\s*live\s*\?|if\s*\(\s*live/.test(e));
  check("  والسؤالُ قبل مسح الأعلام (وإلا كان الجوابُ «لا» دائماً)", liveIdx > 0 && clearIdx > liveIdx);
}

/* ── 0194: القاعدةُ صادقةٌ مهما كان العميل ─────────────────────────────────
 * الواجهةُ لا تنادي بلا رفع — لكنّ نسخةً قديمةً مفتوحةً بمتصفّح عيادةٍ بعد النشر
 * تنادي. فالقاعدةُ نفسُها لا تكتب إلا لرفعٍ أُقفل، ولا أثرَ للمشغّل. سلوكُها يُفحص
 * بحزمة run.sh (تحتاج PGBIN)، وهنا شروطُها بالنصّ حتى يمسكها كلُّ lint محلّي. */
console.log("▸ 0194 — end_elevation صادقة بالقاعدة (نصّاً؛ والسلوكُ بـrun.sh)");
{
  const MIG = "supabase/migrations/0194_end_elevation_honest.sql";
  const whole = existsSync(MIG) ? readFileSync(MIG, "utf8").replace(/\r\n/g, "\n") : "";
  // الجسمُ وحده: الترويسةُ تذكر «get diagnostics» شرحاً، فالبحثُ فيها يكذب بالترتيب.
  const m = whole.includes("create or replace function") ? whole.slice(whole.indexOf("create or replace function")) : whole;
  check("الهجرةُ موجودة", m.length > 0);
  check("  السطرُ لرفعٍ حُذف فعلاً (row_count)", /get diagnostics v_n = row_count;/.test(m) && /if v_n > 0 and/.test(m));
  check("  ولا أثرَ لمشغّل المنصّة داخلَ عيادة", /platform_acting_clinic\(\) is null/.test(m));
  check("  والرفعُ يُحذف قبل أيّ شرط (الأمانُ لا يتغيّر)",
    m.indexOf("delete from staff_elevations where user_id = auth.uid();") > 0
    && m.indexOf("delete from staff_elevations") < m.indexOf("get diagnostics"));
  check("  بصلاحية المُعرِّف وبمسارٍ مثبَّت", /security definer set search_path = public/.test(m));
  check("  وممنوعةٌ عن anon، مسموحةٌ للمسجَّل",
    /revoke all on function end_elevation\(\) from public, anon;/.test(m) && /grant execute on function end_elevation\(\) to authenticated;/.test(m));
  const suite = readFileSync("supabase/tests/run.sh", "utf8");
  check("  وتنزل بحزمة run.sh (هجرةٌ لا تنزل بالحزمة غيرُ مفحوصة)",
    suite.includes("$MIG/0194_end_elevation_honest.sql") && suite.includes("▸ 0194:"));
  /* والعدُّ لا يشارك النداءَ جملتَه: الجملةُ لا ترى ما كتبته هي (لقطةُ MVCC)، فعدٌّ بنفس
   * جملة النداء يرى صفراً دائماً — فحصٌ يفشل على الصحيح ويمرّ على الخاطئ. أمسكته مراجعةٌ
   * عدائية بصياغتي الأولى، فصار ممنوعاً بالنصّ. */
  const blk = suite.slice(suite.indexOf("▸ 0194:"), suite.indexOf("[ $fail -eq 0 ]", suite.indexOf("▸ 0194:")));
  // كلُّ نداءٍ لـchk بحدوده: سطرُه وما يتّصل به بـ«\» — لا ما يليه من أسطر $P.
  const lines = blk.split("\n");
  const chks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("chk ")) continue;
    let c = lines[i];
    while (c.trimEnd().endsWith("\\") && i + 1 < lines.length) c += "\n" + lines[++i];
    chks.push(c);
  }
  check("  وكلُّ عدٍّ بجملةٍ غيرِ جملة النداء (لا end_elevation() مع count( بفحصٍ واحد)",
    chks.length >= 5 && chks.every((c) => !(c.includes("end_elevation()") && c.includes("count("))),
    `${chks.filter((c) => c.includes("end_elevation()") && c.includes("count(")).length} فحصاً مخلوطاً`);
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
