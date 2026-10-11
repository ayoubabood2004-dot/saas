/* ============================================================================
 * فحصُ التطابق: customer_search بالقاعدة (0232) مقابل buildCustomerDirectory
 * (customer-fixture.mjs) — صفّاً بصفّ وحقلاً بحقل وبنفس الترتيب.
 *
 *   node scripts/customer-parity.mjs <dir>
 * ينتظر بالمجلّد: expected.json (من القالب) وout.json ({id: ناتج json_agg}).
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
const t = (iso) => (iso == null ? null : Date.parse(iso));
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0005;

/** أوّلُ فرقٍ بين صفّ القاعدة وصفّ المرآة — أو "" إن تطابقا. */
function diffRow(s, e) {
  const pairs = [
    ["key", s.key, e.key], ["name", s.name, e.name], ["phone", s.phone, e.phone],
    ["purchases", Number(s.purchases), e.purchases], ["refunds", Number(s.refunds), e.refunds],
    ["first_at", t(s.first_at), t(e.firstAt)], ["last_at", t(s.last_at), t(e.lastAt)],
    ["pets_alive", Number(s.pets_alive), e.petsAlive], ["pets_deceased", Number(s.pets_deceased), e.petsDeceased],
    ["matched", s.matched, e.matched],
  ];
  for (const [k, a, b] of pairs) if (a !== b) return `${k}: SQL ${JSON.stringify(a)} ≠ مرآة ${JSON.stringify(b)}`;
  const sp = (s.pets ?? []).map((p) => [p.id, p.name, p.species, !!p.deceased]);
  const ep = (e.pets ?? []).map((p) => [p.id, p.name, p.species, !!p.deceased]);
  if (JSON.stringify(sp) !== JSON.stringify(ep)) return `pets: SQL ${JSON.stringify(sp)} ≠ مرآة ${JSON.stringify(ep)}`;
  if ((s.top == null) !== (e.top == null)) return `top: SQL ${JSON.stringify(s.top)} ≠ مرآة ${JSON.stringify(e.top)}`;
  if (s.top != null) {
    const ok = s.top.length === e.top.length && s.top.every((x, i) => x.name === e.top[i].name && Number(x.times) === e.top[i].times && near(x.qty, e.top[i].qty));
    if (!ok) return `top: SQL ${JSON.stringify(s.top)} ≠ مرآة ${JSON.stringify(e.top)}`;
  }
  return "";
}

const ids = Object.keys(expected).sort();
check(`القاعدةُ أجابت كلَّ النداءات (${ids.length})`, ids.every((id) => id in got), `ناقص: ${ids.filter((id) => !(id in got)).slice(0, 5).join("، ")}`);

let rowsCompared = 0, nonEmpty = 0, bad = [];
for (const id of ids) {
  const e = expected[id];
  const s = got[id];
  if (s === undefined) continue;
  if (e.error) {
    const ok = s && !Array.isArray(s) && typeof s.error === "string" && s.error.includes(e.error);
    if (!ok) bad.push(`${id} (${e.q ?? "∅"}/${e.sort}/${e.filter}): المرآة ترفض «${e.error}» والقاعدة ${JSON.stringify(s).slice(0, 80)}`);
    continue;
  }
  if (!Array.isArray(s)) { bad.push(`${id}: القاعدة رمت ${JSON.stringify(s).slice(0, 120)}`); continue; }
  if (s.length !== e.rows.length) { bad.push(`${id} (${e.q ?? "∅"}/${e.sort}/${e.filter}/+${e.offset}): ${s.length} صفّاً ≠ مرآة ${e.rows.length}`); continue; }
  if (s.length) nonEmpty++;
  const tot = s.length ? Number(s[0].total) : null;
  if (tot !== e.total) { bad.push(`${id}: total SQL ${tot} ≠ مرآة ${e.total}`); continue; }
  for (let i = 0; i < s.length; i++) {
    rowsCompared++;
    const d = diffRow(s[i], e.rows[i]);
    if (d) { bad.push(`${id} (${e.q ?? "∅"}/${e.sort}/${e.filter}/+${e.offset}) صفّ ${i + 1}: ${d}`); break; }
  }
}
check(`كلُّ نداءٍ يطابق المرآة صفّاً بصفّ وبالترتيب (${rowsCompared} صفّاً بـ${nonEmpty} نداءً غيرِ فارغ)`, bad.length === 0, bad.slice(0, 6).join(" · "));
check("  والقالبُ يقيس شيئاً (مئاتُ الصفوف لا عشرات)", rowsCompared >= 300 && nonEmpty >= 60, `${rowsCompared}/${nonEmpty}`);

/* المشيُ على الصفحات: المجموعُ = القائمةُ كاملة، بلا فجوةٍ ولا تكرار. */
const walks = {};
for (const id of ids) { const e = expected[id]; if (e.tag?.startsWith("walk:")) (walks[e.tag] ??= []).push(id); }
for (const [tag, list] of Object.entries(walks)) {
  const keys = list.sort((a, b) => expected[a].offset - expected[b].offset).flatMap((id) => (Array.isArray(got[id]) ? got[id].map((r) => r.key) : []));
  const total = list.map((id) => got[id]).find((r) => Array.isArray(r) && r.length)?.[0]?.total;
  check(`${tag}: الصفحاتُ تغطّي القائمة كلَّها بلا تكرار (${keys.length})`,
    new Set(keys).size === keys.length && (total === undefined ? keys.length === 0 : keys.length === Number(total)),
    `مفاتيح ${keys.length}، فريدة ${new Set(keys).size}، total ${total}`);
}

/* حالاتٌ مسمّاة — يقرؤها الإنسان ولا تُخفيها المرآة. */
const find = (pred) => ids.find((id) => pred(expected[id]));
const rowsOf = (id) => (Array.isArray(got[id]) ? got[id] : []);
{
  const id = find((e) => e.clinic.endsWith("c1") && e.q === "07701234567" && e.sort === "match" && e.filter === "all" && e.top === 0);
  const r = rowsOf(id)[0];
  check("أربعُ صيغٍ لرقمٍ واحد = زبونٌ واحد (p:7701234567) بحيوانيه وحدهما",
    r?.key === "p:7701234567" && Number(r?.purchases) === 9 && (r?.pets ?? []).map((p) => p.name).sort().join(",") === "لونا,ماكس",
    JSON.stringify(r).slice(0, 160));
}
{
  const id = find((e) => e.clinic.endsWith("c3") && e.q === "05");
  check("بعيادةٍ سعودية «05» قصير (مفتاحُ الدولة يُشال قبل العدّ)", rowsOf(id).length === 0);
  const id2 = find((e) => e.clinic.endsWith("c3") && e.q === "0501");
  const r = rowsOf(id2)[0];
  check("  و«0501» يلقى «سعود» بصيغه الثلاث زبوناً واحداً", r?.key === "p:501234567" && Number(r?.purchases) === 3, JSON.stringify(r).slice(0, 120));
  const id3 = find((e) => e.clinic.endsWith("c3") && e.q === "7701234567");
  check("  والعراقيُّ بعيادةٍ سعودية زبونان (+964 لا يُشال هناك)", rowsOf(id3).map((x) => x.key).sort().join(",") === "p:7701234567,p:9647701234567",
    rowsOf(id3).map((x) => x.key).join(","));
}
{
  const id = find((e) => e.clinic.endsWith("c1") && e.q === null && e.sort === "purchases" && e.filter === "nopets" && e.top === 3);
  const rs = rowsOf(id);
  check("«زبائن المبيعات»: لا صاحبَ حيوانٍ ولا من لم يشترِ", rs.length > 0 && rs.every((x) => Number(x.pets_alive) + Number(x.pets_deceased) === 0 && Number(x.purchases) >= 1));
  check("  والأكثرُ تكراراً أوّلاً، ومع كلٍّ أكثرُ ما يشتريه بلا مبلغ",
    rs.every((x, i) => i === 0 || Number(rs[i - 1].purchases) >= Number(x.purchases)) && rs.some((x) => (x.top ?? []).length > 0)
      && rs.every((x) => (x.top ?? []).every((it) => !("total" in it) && !("revenue" in it) && !("price" in it))));
}
{
  const id = find((e) => e.clinic.endsWith("c2") && e.q === "07701234567");
  const r = rowsOf(id)[0];
  check("العيادةُ الثانية ترى زبونَها وحيوانَه وحدهما (لا فواتيرَ ولا حيواناتِ الأولى)",
    r?.key === "p:7701234567" && Number(r?.purchases) === 1 && (r?.pets ?? []).map((p) => p.name).join(",") === "غريب", JSON.stringify(r).slice(0, 160));
}

console.log(fails
  ? `\n✗ customer-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ customer-parity: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
