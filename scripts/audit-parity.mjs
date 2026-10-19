/* ============================================================================
 * فحصُ التطابق: report_inventory_audit بالقاعدة (0245) مقابل inventoryAudit
 * (src/lib/inventoryAudit.ts عبر audit-fixture.mjs) — صفّاً بصفّ وحقلاً بحقل.
 *
 *   node scripts/audit-parity.mjs <dir>
 * ينتظر بالمجلّد: expected.json (من القالب) وout.json ({نداء: json_agg}).
 * المفتاحُ (النوع، المادة): المادةُ لا تتكرّر بنوعٍ واحد — فكلُّ صفٍّ زائدٍ أو ناقص يُرى.
 * ==========================================================================*/
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
const raw = fs.readFileSync(path.join(dir, "out.json"), "utf8").trim();
const got = raw ? JSON.parse(raw) : {};

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) <= 1e-6 * Math.max(1, Math.abs(Number(b))));
const key = (r) => `${r.kind}|${r.product_id}`;

let rows = 0, capped = 0;
const seen = new Set();
for (const [id, e] of Object.entries(expected.calls)) {
  const s = got[id];
  if (!Array.isArray(s)) { check(`${id}: القاعدةُ أجابت`, false, JSON.stringify(s).slice(0, 200)); continue; }
  const sm = new Map(s.map((r) => [key(r), r]));
  const em = new Map(e.rows.map((r) => [key(r), r]));
  const bad = [];
  if (sm.size !== s.length) bad.push(`القاعدةُ كرّرت (نوع، مادة): ${s.length - sm.size}`);
  for (const [k, r] of em) if (!sm.has(k)) bad.push(`ناقصٌ بالقاعدة: ${r.kind}/${r.why ?? "∅"} «${r.product_name}»`);
  for (const [k, r] of sm) if (!em.has(k)) bad.push(`زائدٌ بالقاعدة: ${r.kind}/${r.why ?? "∅"} «${r.product_name}»`);
  for (const [k, er] of em) {
    const sr = sm.get(k);
    if (!sr) continue;
    rows++;
    if (er.days === 36500) capped++;
    seen.add(er.kind + "/" + (er.why ?? "∅"));
    const pairs = [
      ["why", sr.why ?? null, er.why ?? null], ["grp", sr.grp ?? null, er.grp ?? null],
      ["product_name", sr.product_name, er.product_name], ["code", sr.code ?? null, er.code ?? null],
      ["days", sr.days == null ? null : Number(sr.days), er.days ?? null],
      ["company_id", sr.company_id ?? null, er.company_id ?? null], ["company_name", sr.company_name ?? null, er.company_name ?? null],
    ];
    for (const [f, a, b] of pairs) if (a !== b) { bad.push(`${er.kind} «${er.product_name}» ${f}: SQL ${JSON.stringify(a)} ≠ مرآة ${JSON.stringify(b)}`); break; }
    for (const f of ["stock", "value", "qty"]) {
      if (!near(sr[f], er[f])) { bad.push(`${er.kind} «${er.product_name}» ${f}: SQL ${sr[f]} ≠ مرآة ${er[f]}`); break; }
    }
  }
  check(`${id} (${e.from.slice(0, 10)} → ${e.to.slice(0, 10)}): ${e.rows.length} ملاحظةً تطابق المرآة صفّاً بصفّ`, bad.length === 0, bad.slice(0, 6).join(" · "));
}

/* القالبُ يقيس شيئاً: كلُّ نوعٍ وكلُّ سببٍ فرعيّ ظهر مرّةً على الأقل. */
const must = [
  "no_code/∅", "hand_code/short", "hand_code/length", "hand_code/check", "hand_code/pattern", "hand_code/internal", "hand_code/ean8_prefix",
  "dup_twin/shelf", "dup_twin/factory", "dup_twin/other", "dup_name/∅", "impossible/value", "impossible/units",
  "never_sold/∅", "stopped/∅", "slow/∅", "zero_sold/∅", "no_company/∅", "no_company/hint", "prefix_split/∅",
];
const missing = must.filter((m) => !seen.has(m));
check(`القالبُ يغطّي كلَّ نوعٍ وسبب (${must.length}) — ${rows} صفّاً قورن`, missing.length === 0 && rows >= 400, `غائب: ${missing.join("، ")} · صفوف ${rows}`);

/* رصيدٌ خياليّ بمبيعٍ ضئيل يبلغ سقفَ الكفاية (٣٦٥٠٠) بالطرفين — كان يتجاوز int فيُسقط النداءَ كلَّه. */
check(`سقفُ الكفاية (مئةُ سنة) يُبلغ ويطابق — ${capped} صفّاً`, capped >= 4, `${capped}`);

/* السلوكُ لا التطابقُ وحده — على ناتج القاعدة نفسِه (والمرآةُ تطابقه أعلاه). نافذةُ كلّ مادة = أقلُّ
 * المدّة وعمرِها (الإنشاء أو أوّلُ بيعٍ أقدم)، و«بطيئة» بعمر ≥ ٣٠، و«لا بيعَ بالمدّة» بالمستحيل بعمر ≥ ٧. */
const w90 = Array.isArray(got.w90) ? got.w90 : [];
const asof = Array.isArray(got.asof) ? got.asof : [];
const kinds = (list, name) => list.filter((r) => r.product_name === name).map((r) => `${r.kind}/${r.why ?? "∅"}${r.days == null ? "" : `@${r.days}`}`).sort().join(",");
const idleOf = (list, name) => kinds(list, name).split(",").filter((k) => /^(impossible|never_sold|stopped|slow)\//.test(k)).join(",");
check("عمرُ ١٥ يوماً تبيع واحدةً يومياً برصيد ٤٠ ليست «بطيئة» (بالتسعين كانت «تكفي ٢٤٠»)",
  idleOf(w90, "جديدة تنباع يومياً") === "", kinds(w90, "جديدة تنباع يومياً"));
check("  وعمرُ ٤٥ يوماً فوق شرط الثلاثين: النافذةُ ٤٥ لا ٩٠ — تكفي ١٠٠ لا ٢٠٠ فليست بطيئة",
  idleOf(w90, "عمر خمسة وأربعين") === "", kinds(w90, "عمر خمسة وأربعين"));
check("  وعمرُ ٢٠ تكفي بنافذتها ٤٠٠: شرطُ الثلاثين وحده يمنع «بطيئة»",
  idleOf(w90, "عمر عشرين بطيئة لولا العمر") === "", kinds(w90, "عمر عشرين بطيئة لولا العمر"));
check("  وصفٌّ أحدثُ من بيعه (دمج): العمرُ من أوّل بيع (٦٠) — بطيئة تكفي ٣٠٠",
  idleOf(w90, "باقية بعد دمج") === "slow/∅@300", kinds(w90, "باقية بعد دمج"));
check("  وبنافذةٍ تنتهي قبل الآن (asof): العمرُ عند p_to، فعمرُ ٢٥ ليس بطيئاً بعد",
  idleOf(asof, "عمر خمسة وأربعين") === "", kinds(asof, "عمر خمسة وأربعين"));
check("وصلت قبل ٣ أيام بقيمةٍ كبيرة وبلا بيع: لا «مستحيلة» ولا «ما انباعت»",
  idleOf(w90, "وصلت قبل ثلاث") === "", kinds(w90, "وصلت قبل ثلاث"));
check("  وبعمر ٧ بالضبط تصير مستحيلة، والحقيبةُ (عمرُها ١٠ بلا بيع) كحقيبة ابن الهيثم باقية",
  idleOf(w90, "وصلت قبل سبع بالضبط") === "impossible/value" && idleOf(w90, "حقيبة نقل") === "impossible/value",
  `${kinds(w90, "وصلت قبل سبع بالضبط")} · ${kinds(w90, "حقيبة نقل")}`);
check("  والويسكاس (عمرُها ١٩ وبيعت) مستحيلةٌ بفرع المعدّل لا بفرع «بلا بيع»",
  idleOf(w90, "مغلفات ويسكاس").startsWith("impossible/units@"), kinds(w90, "مغلفات ويسكاس"));

/* المدّةُ خارج ٧..٤٠٠ ترمي بالطرفين. */
const r6 = got.range6;
check("مدّةُ ٦ أيام تُرفض بالقاعدة كما بالمرآة", !!expected.rangeError && r6 && !Array.isArray(r6) && String(r6.error ?? "").includes("bad range"),
  `مرآة: ${expected.rangeError} · قاعدة: ${JSON.stringify(r6).slice(0, 120)}`);

if (fails) { console.error(`audit-parity: ${fails} فشل، ${passes} نجح`); process.exit(1); }
console.log(`audit-parity: ${passes} فحصاً عبرت`);
