/* ============================================================================
 * flock-parity — `_flock_stats` بالقاعدة = `flockStats` بـsrc/lib/flockMath.ts، حقلاً بحقل (0265).
 *
 * السحابةُ تأخذ إحصاءَ الحقل من الخادم، والتجريبيُّ يحسبه بالمرآة: العمرُ (يومُ الوصول = ١)، والنافقُ الموزَّع
 * على أيامه، والإنذارُ بيومين متتاليين بالقاعة، والأسبوعُ الأوّل، والتحصينُ الجاي والمتأخّر، و«لا تبيع قبل»
 * (آخرُ يومٍ أُعطي + السحب + ١، والطبلةُ الموقوفة والمستبدَلة بيومها). اختلافُهما = تطبيقان يقولان للطبيب شيئين.
 *
 * gen: وجباتٌ ببذرةٍ ثابتة بعيادةٍ مستقلّة — **بنداءاتٍ حقيقية** (flock_case_open، flock_mortality_save، flock_vax_save،
 *      flock_treatment_save/mark، flock_visit_save، flock_case_close) فالقالبُ ما تصنعه القاعدةُ نفسُها، لا ما يسهّل الفحص.
 * check: يحزم flockMath.ts من مصدرها (esbuild) ويقارن، ثمّ يطفّر المرآةَ نصّاً (طفراتٌ معقولة) ويشترط أن تُمسك كلُّها.
 *
 *   node flock-parity.mjs gen <dir> ; psql -f <dir>/run.sql ; psql -tA -f <dir>/out.sql > <dir>/actual.txt
 *   node flock-parity.mjs check <dir>
 * ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, dir] = process.argv.slice(2);
if (!["gen", "check"].includes(mode) || !dir) { console.error("usage: flock-parity.mjs gen|check <dir>"); process.exit(2); }
const PCL = "a2650c00-0000-4000-8000-0000000000c1";
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const T = (n) => `(_flock_today() ${n < 0 ? "-" : "+"} ${Math.abs(n)})::text`;   // يومٌ نسبيّ لليوم
const caseId = (r) => `(select id from flock_cases where client_ref = ${q(r)})`;
const houseId = (r, pos) => `(select h.id from flock_houses h join flock_cases c on c.id = h.case_id where c.client_ref = ${q(r)} and h.position = ${pos})`;
const txId = (r) => `(select id from flock_treatments where client_ref = ${q(r)})`;

if (mode === "gen") gen(); else await check();

function gen() {
  fs.mkdirSync(dir, { recursive: true });
  let st = 20261110 >>> 0;   // بذرةٌ ثابتة (mulberry32)
  const R = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const chance = (p) => R() < p;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const sql = [
    `insert into auth.users(id) values (${q(PCL)}) on conflict do nothing;`,
    `select set_config('request.jwt.claim.sub', ${q(PCL)}, false);`,
  ];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const ref = `pz${i}`;
    const age = int(1, 64);                       // العمرُ اليوم
    const placedOff = -(age - 1);                 // الوصولُ نسبةً لليوم
    const nh = pick([0, 0, 0, 2, 3]);
    const houses = Array.from({ length: nh }, (_, k) => ({ label: `قاعة ${k + 1}`, placed_count: int(500, 20000) }));
    const placed = nh ? houses.reduce((s, h) => s + h.placed_count, 0) : int(800, 40000);
    const vax = [];
    for (let k = 0, n = int(0, 6); k < n; k++) vax.push({ vaccine: `لقاح ${k}`, disease: pick(["ND", "IBD", "IB", null]), route: pick(["water", "spray", "eye", "sc"]), age: int(1, age + 12), at_hatchery: chance(0.15) });
    sql.push(`select flock_case_open(jsonb_build_object('client_ref', ${q(ref)}, 'farm', jsonb_build_object('name', ${q(`حقل التطابق ${i}`)}, 'owner_phone', ${q(`0780${String(1000000 + i)}`)}),
      'case', jsonb_build_object('kind', ${q(pick(["broiler", "broiler", "layer", "breeder"]))}, 'placed_on', ${T(placedOff)}, 'placed_count', ${placed}),
      'houses', ${q(JSON.stringify(houses))}::jsonb, 'vax', ${q(JSON.stringify(vax))}::jsonb));`);

    // النافق: لكلّ قاعة (أو للوجبة) أيامٌ متتالية بفجوات وصفوفٍ بأيامٍ عدّة، بلا تداخل — وذروةٌ بآخر الأيام أحياناً.
    // نمطُ الذروة: لا ذروة، أو يومان متتاليان فوق العتبة (إنذار)، أو يومٌ واحد (لا إنذار — تُمسك طفرةَ «يومٍ واحد»).
    const mode = pick(["normal", "normal", "spike2", "spike1"]);
    const units = nh ? houses.map((h, k) => ({ pos: k, cap: h.placed_count, spikes: k > 0 || chance(0.6) })) : [{ pos: null, cap: placed, spikes: true }];
    for (const u of units) {
      let d = 0;                                  // يومٌ من الوصول (٠ = يومُ الوصول)
      let lost = 0;
      while (d <= age - 1) {
        const span = chance(0.8) ? 1 : int(2, 4);
        const end = Math.min(age - 1, d + span - 1);
        const days = end - d + 1;
        // الذروةُ بكلّ القاعات أو ببعضها: الأولى تُعفى أحياناً — فقاعتان تُنذران معاً، وقاعةٌ تُنذر وجارتُها لا.
        const late = u.spikes && ((mode === "spike2" && end >= age - 3) || (mode === "spike1" && end === age - 1));
        if (chance(late ? 1 : 0.6)) {
          const dead = late ? Math.ceil(u.cap * 0.004 * days) : int(0, Math.max(1, Math.floor(u.cap * 0.002)) * days);
          const culled = int(0, Math.max(0, Math.floor(u.cap * 0.0005)) * days);
          if (lost + dead + culled <= u.cap) {
            lost += dead + culled;
            sql.push(`select flock_mortality_save(jsonb_build_object('case_id', ${caseId(ref)}, ${u.pos == null ? "" : `'house_id', ${houseId(ref, u.pos)}, `}'on_date', ${T(placedOff + end)}, 'days', ${days}, 'dead', ${dead}, 'culled', ${culled}));`);
          }
        }
        d = end + 1 + (chance(0.15) ? int(1, 3) : 0);
      }
    }

    // التحصين: بعضُ المخطَّط منجَز، وبعضُه متروك، وبندٌ يُضاف منجَزاً خارج البرنامج.
    for (let k = 0; k < vax.length; k++) {
      if (vax[k].at_hatchery) continue;
      const r = R();
      const sel = `(select id from flock_vax where case_id = ${caseId(ref)} and vaccine = ${q(vax[k].vaccine)} limit 1)`;
      if (r < 0.35 && vax[k].age <= age) {
        sql.push(`select flock_vax_save(jsonb_build_object('id', ${sel}, 'vaccine', ${q(vax[k].vaccine)}, 'route', ${q(vax[k].route)}, 'planned_age', ${vax[k].age}, 'status', 'given', 'given_on', ${T(placedOff + vax[k].age - 1)}, 'given_by', 'farmer'));`);
      } else if (r < 0.5) {
        sql.push(`select flock_vax_save(jsonb_build_object('id', ${sel}, 'vaccine', ${q(vax[k].vaccine)}, 'route', ${q(vax[k].route)}, 'planned_age', ${vax[k].age}, 'status', 'skipped', 'skip_reason', 'سبب'));`);
      }
    }
    if (chance(0.2)) sql.push(`select flock_vax_save(jsonb_build_object('case_id', ${caseId(ref)}, 'vaccine', 'إضافي', 'status', 'given', 'given_on', ${T(-int(0, age - 1))}));`);

    // الطبلات: أدويةٌ وفيتامينات، سحبٌ معروف ومجهول، إيقافٌ (قبل البداية أحياناً)، ونسخةٌ بعد الإرسال.
    for (let k = 0, n = int(0, 3); k < n; k++) {
      const tref = `${ref}-t${k}`;
      const start = int(placedOff, 3);
      const lines = [];
      for (let j = 0, m = int(1, 3); j < m; j++) {
        const from = int(1, 3);
        lines.push({ day_from: from, day_to: from + int(0, 5), product_name: `مادّة ${j}`, kind: chance(0.7) ? "med" : pick(["vitamin", "electrolyte"]),
          withdrawal_meat_days: chance(0.15) ? null : int(0, 14), withdrawal_egg_days: chance(0.4) ? null : int(0, 10) });
      }
      sql.push(`select flock_treatment_save(jsonb_build_object('client_ref', ${q(tref)}, 'case_id', ${caseId(ref)}, 'start_on', ${T(start)}, 'lines', ${q(JSON.stringify(lines))}::jsonb));`);
      const r = R();
      if (r < 0.25 && start - 1 <= 0) {
        // يومُ الإيقاف بين (البداية − ١) واليوم — والإيقافُ قبل البداية = ما انعطى.
        const stop = int(start - 1, 0);
        sql.push(`select flock_treatment_mark(${txId(tref)}, 'stop', (_flock_today() + ${stop}));`);
      } else if (r < 0.5) {
        sql.push(`select flock_treatment_mark(${txId(tref)}, 'sent');`);
        const ns = Math.max(start, int(-2, 2));
        const nl = [{ day_from: 1, day_to: int(1, 4), product_name: "نسخةٌ ثانية", kind: "med", withdrawal_meat_days: int(0, 7) }];
        sql.push(`select flock_treatment_save(jsonb_build_object('client_ref', ${q(`${tref}-v2`)}, 'id', ${txId(tref)}, 'start_on', ${T(ns)}, 'lines', ${q(JSON.stringify(nl))}::jsonb));`);
      } else if (r < 0.6) {
        sql.push(`select flock_treatment_mark(${txId(tref)}, 'done');`);
      }
    }

    // الزيارات: آخرُها يقرّر الزيارة الجاية وحالَ الحقل.
    for (let k = 0, n = int(0, 3); k < n; k++) {
      const vd = -int(0, age - 1);
      // زيارةُ اليوم بوقتٍ مضى (لا ساعةَ مستقبلية بفجر غرينتش)، وغيرُها صباحَ يومها.
      const at = vd === 0 ? "(now() - interval '1 minute')::text" : `((_flock_today() + ${vd})::timestamp + time '0${k + 6}:00')::text`;
      sql.push(`select flock_visit_save(jsonb_build_object('client_ref', ${q(`${ref}-v${k}`)}, 'case_id', ${caseId(ref)}, 'at', ${at},
        'trend', ${q(pick(["better", "same", "worse", null]))}, 'next_visit_on', ${chance(0.7) ? T(vd + int(0, 6)) : "null"}));`);
    }
    if (chance(0.15) && age > 1) sql.push(`select flock_case_close(${caseId(ref)}, jsonb_build_object('reason', 'other', 'closed_on', ${T(-int(0, Math.min(age - 1, 5)))}));`);
  }
  fs.writeFileSync(path.join(dir, "run.sql"), sql.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "out.sql"), [
    `select set_config('request.jwt.claim.sub', ${q(PCL)}, false);`,
    `select jsonb_build_object('today', _flock_today(), 'bundles', (select jsonb_agg(flock_case_bundle(id) order by client_ref) from flock_cases where clinic_id = ${q(PCL)}))::text;`,
  ].join("\n") + "\n");
  console.log(`flock-parity gen: ${N} وجبة، ${sql.length} نداء`);
}

async function check() {
  const { build } = await import("esbuild");
  const src = fs.readFileSync(path.join(ROOT, "src/lib/flockMath.ts"), "utf8");
  const bundleOf = async (name, code) => {
    const out = path.join(dir, `${name}.mjs`);
    await build({ stdin: { contents: code, resolveDir: path.join(ROOT, "src/lib"), loader: "ts", sourcefile: "flockMath.ts" },
      bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
    return import(pathToFileURL(out).href);
  };
  let act;
  try {
    const lines = fs.readFileSync(path.join(dir, "actual.txt"), "utf8").trim().split("\n");
    act = JSON.parse(lines[lines.length - 1]);
  } catch (e) { console.log(`   ✗ القاعدةُ أرجعت جوابَ التطابق — لا JSON: ${String(e.message).slice(0, 80)}`); process.exit(1); }
  const bundles = act.bundles ?? [];
  const today = act.today;
  let fail = 0;
  const ok = (t) => console.log(`   ✓ ${t}`);
  const no = (t, d = []) => { fail = 1; console.log(`   ✗ ${t}`); for (const x of d.slice(0, 6)) console.log(`      ${x}`); };

  const same = (a, b, key) => {
    if (a == null || b == null) return a == null && b == null;
    if (typeof a === "number" || typeof b === "number") {
      const x = Number(a), y = Number(b);
      return x === y;
    }
    if (typeof a === "object") return Object.keys({ ...a, ...b }).every((k) => same(a[k], b[k], k));
    return a === b;
  };
  const diffs = (M) => {
    const out = [];
    for (const b of bundles) {
      const mine = M.flockStats(b, today);
      for (const k of Object.keys(b.stats)) if (!same(b.stats[k], mine[k], k)) out.push(`${b.case.client_ref ?? b.case.id}.${k}: القاعدة ${JSON.stringify(b.stats[k])} والمرآة ${JSON.stringify(mine[k])}`);
    }
    return out;
  };

  // تغطيةُ القالب: لا تطابقَ بلا الحالات التي يُفترض أن يمسكها.
  const has = (f) => bundles.some(f);
  const cover = {
    "صفٌّ بأيامٍ عدّة": has((b) => b.mortality.some((m) => m.days > 1)),
    "قاعاتٌ متعدّدة": has((b) => b.houses.length > 1),
    "إنذارُ نفوق": has((b) => b.stats.mortality_alert),
    "قاعتان تُنذران معاً": has((b) => b.stats.alert_houses.length > 1),
    "قاعةٌ تُنذر وجارتُها لا": has((b) => b.stats.alert_houses.length >= 1 && b.stats.alert_houses.length < b.houses.length),
    "طبلةٌ موقوفة": has((b) => b.treatments.some((t) => t.status === "stopped")),
    "نسخةٌ مستبدَلة": has((b) => b.treatments.some((t) => t.status === "replaced")),
    "سحبٌ غير معروف": has((b) => b.stats.withdrawal_unknown),
    "تحصينٌ متأخّر": has((b) => b.stats.vax_overdue > 0),
    "وجبةٌ مغلقة": has((b) => b.case.status === "closed"),
    "زيارةٌ متأخّرة": has((b) => b.stats.visit_overdue),
  };
  const missing = Object.entries(cover).filter(([, v]) => !v).map(([k]) => k);
  if (bundles.length >= 40 && !missing.length) ok(`القالب: ${bundles.length} وجبة تغطّي ${Object.keys(cover).length} حالةً حدّية`);
  else no(`القالبُ ناقص (${bundles.length} وجبة)`, missing);

  const M = await bundleOf("flock-mirror", src);
  const d0 = diffs(M);
  if (!d0.length) ok(`_flock_stats = flockStats على ${bundles.length} وجبة، حقلاً بحقل`);
  else no(`المرآةُ تخالف القاعدة (${d0.length} حقل)`, d0);

  // طفراتٌ معقولة — كلُّ واحدةٍ خطأٌ يمكن أن يُكتب فعلاً، ويجب أن يُمسك.
  const MUTANTS = [
    ["العمرُ من صفر (كتيّبات الشركات)", "diffDays(placedOn, on) + 1", "diffDays(placedOn, on)"],
    ["«لا تبيع قبل» بلا يوم الاحتياط", "addDays(last, l.withdrawal_meat_days + 1)", "addDays(last, l.withdrawal_meat_days)"],
    ["الطبلةُ الموقوفة كأنها كاملة", "t.stopped_on && t.stopped_on < planned ? t.stopped_on : planned", "planned"],
    ["الإنذارُ بيومٍ واحد", "if (prev?.pct != null && prev.pct >= FLOCK_ALERT_PCT) {", "if (true) {"],
    ["النافقُ كلُّه بيومه الأخير (بلا توزيع)", "const each = (m.dead + m.culled) / m.days;\n    for (let i = 0; i < m.days; i++) {", "const each = m.dead + m.culled;\n    for (let i = 0; i < 1; i++) {"],
    ["الحيُّ ببداية اليوم = المُدخَل دائماً", "const alive = placed - before;", "const alive = placed;"],
    ["التحصينُ «اليوم» متأخّر", "if (due < today) over++;", "if (due <= today) over++;"],
    ["الإنذارُ يسمّي أوّلَ قاعةٍ وحدها", ".map((h) => h.id);", ".map((h) => h.id).slice(0, 1);"],
  ];
  let mi = 0;
  for (const [name, from, to] of MUTANTS) {
    mi++;
    if (!src.includes(from)) { no(`الطفرة «${name}»: نصُّها غائب عن flockMath.ts — حدّث الطفرة`); continue; }
    const Mx = await bundleOf(`mut-${mi}`, src.replace(from, to));
    const d = diffs(Mx);
    if (d.length) ok(`  طفرة «${name}» تُمسك (${d.length} حقل)`);
    else no(`  طفرة «${name}» تمرّ — القالبُ أعمى عنها`);
  }
  process.exit(fail);
}
