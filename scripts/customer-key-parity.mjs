/* ============================================================================
 * مفتاحُ الزبون — **الطرفان من نفس الدالّة**، بالواجهة وبالقاعدة (0231).
 *
 * ── ما حصل ──────────────────────────────────────────────────────────────
 * بحثُ الزبون بالبيع كان يجمع بـ`(الهاتف || الاسم).toLowerCase()`: «0770…» و«+964 770…»
 * زبونان (٣٥ زبوناً بالإنتاج، ١٩٢ فاتورة)، و«964» وحده زبونٌ لثلاثٍ وعشرين فاتورة.
 * والعلاجُ مفتاحٌ واحد بطرفين: `customerKey.ts` ومرآتُه `cust_*` بالقاعدة. وطرفان
 * يفترقان بصمت أسوأ من طرفٍ واحد — البحثُ يقول «زبون جديد» عن زبونٍ موجود.
 *
 * ── ما يفحصه ────────────────────────────────────────────────────────────
 *  ١) قيمٌ ثابتة بالجافاسكربت: الصيغُ التي يجب أن تتطابق، وما يجب ألّا يتطابق — ومنها
 *     **مفتاحُ دولةٍ غيرُ العراق** (966، 971): المفتاحُ يتبع دولةَ العيادة لا 964 حرفاً.
 *  ٢) مرآةُ القاعدة: يولّد `customer-key.sql` لتشغّله الحزمةُ (run.sh) فتقارن ناتجَ
 *     `cust_phone_nat`/`cust_phone_key`/`cust_norm`/`cust_name_key`/`cust_key` بناتج
 *     الجافاسكربت صفّاً بصفّ.
 *
 * والدوالُّ تُحمَّل **من المصدر بـesbuild لا نسخةً منها** — سُنّةُ group-key-parity.
 *
 *   node scripts/customer-key-parity.mjs [outDir]
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

const built = await esbuild.build({
  entryPoints: ["src/lib/customerKey.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|.*\/i18n.*|@\/.*)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default {}; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "custkey-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const K = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/* ---- ١) القيم ----------------------------------------------------------- */
console.log("▸ ١) الهاتف بمفتاح دولة العيادة");
const IQ = "+964";
const sameIQ = ["+964 7701234567", "07701234567", "+964 07701234567", "00964 770 123 4567", "٠٧٧٠١٢٣٤٥٦٧", "۰۷۷۰۱۲۳۴۵۶۷",
  "7701234567", "0770-123-4567", "(0770) 123 4567", "0770\u{a0}123\u{a0}4567", "+964 770\u{200f}1234567"];
for (const p of sameIQ) check(`«${p}» بعيادةٍ عراقية = 7701234567`, K.custPhoneKey(p, IQ) === "7701234567", String(K.custPhoneKey(p, IQ)));
check("مفتاحُ الدولة وحده (+964) ليس رقماً", K.custPhoneKey("+964", IQ) === null && K.custPhoneKey("00964", IQ) === null && K.custPhoneKey("964", IQ) === null);
check("رقمٌ أرضيٌّ قصير (٥ أرقام) ليس هويّة", K.custPhoneKey("12345", IQ) === null && K.custPhoneNat("12345", IQ) === "12345");
check("مفتاحٌ فارغ أو بلا «+» = 964", K.custPhoneKey("07701234567", "") === "7701234567" && K.custPhoneKey("07701234567", null) === "7701234567" && K.custPhoneKey("07701234567", "964") === "7701234567");
const SA = "+966";
check("بعيادةٍ سعودية: «05…» = «+966 5…» = «00966 5…» = «5…»",
  ["0501234567", "+966 501234567", "00966 50 123 4567", "501234567"].every((p) => K.custPhoneKey(p, SA) === "501234567"));
check("  والمفتاحُ يتبع الدولة: «+966 5…» بعيادةٍ عراقية ليس «05…»", K.custPhoneKey("+966 501234567", IQ) !== K.custPhoneKey("0501234567", IQ));
check("  ورقمٌ عراقيّ بعيادةٍ سعودية يبقى بمفتاحه (لا يُشال 964)", K.custPhoneKey("+964 7701234567", SA) === "9647701234567");
check("بعيادةٍ إماراتية: «050 123 4567» = «+971 50 123 4567»", K.custPhoneKey("050 123 4567", "+971") === K.custPhoneKey("+971 50 123 4567", "+971") && K.custPhoneKey("050 123 4567", "+971") === "501234567");

console.log("▸ ٢) الاسم");
const sameName = [
  ["أحمد علي", "احمد علي"], ["إسراء", "اسراء"], ["فاطمة", "فاطمه"], ["مصطفى", "مصطفي"], ["عائشة", "عايشه"],
  ["مؤمن", "مومن"], ["محمّد", "محمد"], ["مـــحمد", "محمد"], ["أبو علي", "ابو علي"], ["John SMITH", "john smith"],
  ["  سارة  ", "سارة"], ["سارة\u{a0}محمد", "سارة محمد"], ["سارة\u{200f}محمد", "سارة محمد"],
  ["علي هيثم8906139001180", "علي هيثم"], ["علي 0770 123 4567", "علي"], ["علي ٠٧٧٠١٢٣٤٥٦٧", "علي"],
];
for (const [a, b] of sameName) check(`«${a}» = «${b}»`, K.custNameKey(a) !== null && K.custNameKey(a) === K.custNameKey(b), `${K.custNameKey(a)} ≠ ${K.custNameKey(b)}`);
for (const p of ["—", "بدون", "بدون اسم", "زبون نقدي", "زبون", "نقدي", "Cash", "WALK-IN", "Walk in", "guest", "7", "12345678", "123456", "ع", "", null, "٫٬"]) {
  check(`«${p}» ليس اسماً`, K.custNameKey(p) === null, String(K.custNameKey(p)));
}
check("«زبون أول» و«زبون ثاني» اسمان (لا يُطويان بديلاً)", K.custNameKey("زبون أول") === "زبوناول" && K.custNameKey("زبون ثاني") === "زبونثاني");
check("والكرديّ اسم", K.custNameKey("ڕێبوار") === "ڕێبوار" && K.custNameKey("هەڵۆ") !== null);

console.log("▸ ٣) المفتاح");
check("الهاتفُ يغلب: نفسُ الرقم بصيغتين واسمين = زبونٌ واحد", K.custKey("+964 7701234567", "علي", IQ) === K.custKey("07701234567", "أبو حسن", IQ) && K.custKey("07701234567", "x", IQ) === "p:7701234567");
check("مفتاحُ الدولة وحده يرجع للاسم: «+964» + «زبون أول» = n:زبوناول", K.custKey("+964", "زبون أول", IQ) === "n:زبوناول");
check("  و«+964» + «زبون ثاني» زبونٌ آخر (لا p:964 يجمعهما)", K.custKey("+964", "زبون ثاني", IQ) === "n:زبونثاني");
check("بلا رقمٍ ولا اسم = عابرٌ بلا هويّة", K.custKey("", "—", IQ) === null && K.custKey(null, null) === null);
check("ورقمٌ قصير لا يصنع هويّة — يرجع للاسم", K.custKey("12345", "سارة", IQ) === "n:ساره");

console.log("▸ ٤) قراءةُ نصّ البحث");
const rq = (q, d = IQ) => JSON.stringify(K.readCustomerQuery(q, d));
check("فارغ = القائمة", rq("") === '{"mode":"list"}' && rq("   ") === '{"mode":"list"}');
check("«0770» و«770» و«+964 770» بحثٌ واحد بالرقم", [rq("0770"), rq("770"), rq("+964 770"), rq("٠٧٧٠")].every((x) => x === '{"mode":"phone","key":"770"}'));
check("«07» أقصر من ٣ أرقام", rq("07") === '{"mode":"short"}' && rq("+964") === '{"mode":"short"}');
check("«ع» حرفٌ واحد = اكتب أكثر، و«عل» بالاسم", rq("ع") === '{"mode":"short"}' && rq("عل") === '{"mode":"name","key":"عل"}');
check("وبعيادةٍ سعودية «05» قصير و«050» بالرقم 50", rq("05", SA) === '{"mode":"short"}' && rq("0501", SA) === '{"mode":"phone","key":"501"}');

console.log("▸ ٤ب) ما يُكتب بالفاتورة، و«عن طريق» أيِّ حيوان");
{
  const has = typeof K.checkoutPhone === "function";
  check("الوحدةُ تصدّر checkoutPhone (رقمُ الزبون كما يُكتب بالبيعة)", has);
  if (has) {
    check("مفتاحُ الدولة وحده («+964»، «964»، «00964»، «+964 0») لا يُكتب رقماً",
      ["+964", "964", "00964", "+964 0", " +964 "].every((p) => K.checkoutPhone(p, null, IQ) === null), ["+964", "964"].map((p) => String(K.checkoutPhone(p, null, IQ))).join("|"));
    check("  ويُؤخذ بدلَه رقمٌ فُصل من خانة الاسم إن وُجد", K.checkoutPhone("+964", "07701234567", IQ) === "07701234567");
    check("  ورقمٌ حقيقيّ يُكتب كما كُتب (لا تُعاد صياغتُه) — حتى القصيرُ الأرضيّ",
      K.checkoutPhone(" 0770 123 4567 ", null, IQ) === "0770 123 4567" && K.checkoutPhone("+964 7701234567", "0780", IQ) === "+964 7701234567" && K.checkoutPhone("12345", null, IQ) === "12345");
    check("  وبمفتاح دولة العيادة: «+966» وحده بعيادةٍ سعودية ليس رقماً، وبعيادةٍ عراقية رقمٌ يُترك كما هو",
      K.checkoutPhone("+966", null, SA) === null && K.checkoutPhone("+966", null, IQ) === "+966");
    check("  وفارغٌ = فارغ", K.checkoutPhone("", null, IQ) === null && K.checkoutPhone(null, undefined, IQ) === null);
  }
  const hasVia = typeof K.viaPetOf === "function";
  check("الوحدةُ تصدّر viaPetOf («عن طريق لونا»)", hasVia);
  if (hasVia) {
    const hit = { matched: "pet", pets: [{ name: "Max" }, { name: "لونا" }, { name: null }] };
    check("زبونٌ طلع باسم حيوانه: يُسمّى الحيوانُ الذي طابق (بالطيّ نفسِه)", K.viaPetOf(hit, "لون", IQ) === "لونا" && K.viaPetOf(hit, "max", IQ) === "Max");
    check("  وطلع بالاسم أو الرقم ⇒ لا «عن طريق»", K.viaPetOf({ ...hit, matched: "name" }, "لون", IQ) === null && K.viaPetOf({ ...hit, matched: "phone" }, "0770", IQ) === null);
    check("  ونصٌّ قصيرٌ أو رقميّ ⇒ لا شيء (لا تخمين)", K.viaPetOf(hit, "ل", IQ) === null && K.viaPetOf(hit, "0770", IQ) === null);
  }
}

/* ---- ٥) مرآةُ القاعدة --------------------------------------------------- */
const PHONES = [
  ...sameIQ.map((p) => [p, IQ]),
  ["+964", IQ], ["964", IQ], ["00964", IQ], ["964964 7701234567", IQ], ["12345", IQ], ["", IQ], [null, IQ],
  ["07701234567", ""], ["07701234567", null], ["07701234567", "964"], ["٩٦٤٧٧٠١٢٣٤٥٦٧", "+٩٦٤"], ["9640770", IQ],
  ["0", IQ], ["0000", IQ], ["abc", IQ], ["+966 501234567", IQ],
  ["+966 501234567", SA], ["0501234567", SA], ["00966 50 123 4567", SA], ["501234567", SA], ["+964 7701234567", SA],
  ["+971 50 123 4567", "+971"], ["050 123 4567", "+971"], ["+1 (555) 123-4567", "+1"],
];
const NAMES = [...new Set([
  ...sameName.flat(), "—", "بدون", "بدون اسم", "زبون نقدي", "زبون", "نقدي", "Cash", "WALK-IN", "Walk in", "guest", "Customer",
  "زبون أول", "زبون ثاني", "سارة\tمحمد", "50% off", "a_b", "ڕێبوار", "ئاسۆ", "هەڵۆ", "7", "12345678", "123456", "ع", "عل",
  "Ali123", "٫٬", "josé", "علي—حسن", "+964 Ali", "",
])];
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const rows = [];
for (let i = 0; i < Math.max(PHONES.length, NAMES.length); i++) {
  const [p, d] = PHONES[i % PHONES.length];
  const n = NAMES[i % NAMES.length];
  rows.push({ p, d, n, nat: K.custPhoneNat(p, d), pkey: K.custPhoneKey(p, d), norm: K.custNorm(n), nkey: K.custNameKey(n), ckey: K.custKey(p, n, d) });
}
rows.push({ p: null, d: null, n: null, nat: K.custPhoneNat(null, null), pkey: K.custPhoneKey(null, null), norm: K.custNorm(null), nkey: K.custNameKey(null), ckey: K.custKey(null, null, null) });
check(`قالبُ القاعدة ليس صغيراً (${rows.length} صفّاً)`, rows.length >= 40);
check("  وفيه مفتاحُ دولةٍ غيرُ 964 يغيّر الناتج فعلاً (وإلا فالفحصُ لا يقيس الدولة)",
  rows.some((r) => r.d && K.dialDigits(r.d) !== "964" && K.custPhoneKey(r.p, "964") !== r.pkey));

const outDir = process.argv[2];
if (outDir) {
  const values = rows.map((r, i) => `  (${i + 1}, ${lit(r.p)}, ${lit(r.d)}, ${lit(r.n)}, ${lit(r.nat)}, ${lit(r.pkey)}, ${lit(r.norm)}, ${lit(r.nkey)}, ${lit(r.ckey)})`).join(",\n");
  const sql = `-- مولَّد من scripts/customer-key-parity.mjs — لا يُحرَّر بيد.\n`
    + `drop table if exists _cust_key_fixture;\n`
    + `create table _cust_key_fixture (id int, phone text, dial text, name text, nat text, pkey text, norm text, nkey text, ckey text);\n`
    + `insert into _cust_key_fixture values\n${values};\n`;
  writeFileSync(join(outDir, "customer-key.sql"), sql);
  console.log(`   ✓ كُتب customer-key.sql بـ${rows.length} صفّاً`);
}

console.log(fails
  ? `\n✗ customer-key-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ customer-key-parity: ${passes} نجحت، 0 فشلت (${rows.length} صفّاً لمرآة القاعدة)`);
process.exit(fails ? 1 : 0);
