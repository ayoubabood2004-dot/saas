/* ============================================================================
 * حارسُ «الهجرةُ تُعاد بلا أثرٍ ثانٍ» — القاعدة التي بـCLAUDE.md §٤.
 *
 * الحزمةُ تفحصها فعلاً: تُنزل الموجةَ مرّتين وتفشل إن اشتكت الثانية. لكنّها
 * تحتاج بوستغريس، فبقيت القاعدةُ بلا حارسٍ يعمل على جهاز التطوير — وبقي
 * الخرقُ مخبوءاً: 0161 تُنشئ أربعَ سياساتٍ بلا إسقاطها أوّلاً، فترفع
 * «policy already exists» بإعادة التنزيل. كُشفت بأوّل تشغيلٍ حقيقيّ للحزمة
 * (الدفعة ٨)، وكان بالإمكان كشفُها بثانيةٍ واحدة هنا.
 *
 * والفحصُ نصّيّ، فحدُّه معروف: يمسك الأنماطَ الأربعةَ الشائعة، ولا يفهم SQL.
 * وهذا يكفي — الحزمةُ هي الحكم، وهذا يسبقها بدقائق.
 *
 * ولماذا كُتب ملفّاً لا سطراً بـ`node -e`: أوّلُ صياغةٍ كانت أمراً بالصَّدفة،
 * فأُكل هروبُ `\s` مرّتين وصار النمطُ `existss+` — فرفع الحارسُ رايةً على
 * **كلّ** محفّزٍ بلا استثناء، وكادت تُصلَّح أحدَ عشرَ موضعاً سليماً. أداةُ قياسٍ
 * تكذب أسوأ من لا أداة.
 *
 *   node scripts/migration-idempotency.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

let bad = 0;
const flag = (file, what) => { bad++; console.error(`   ✗ ${file}: ${what}`); };

/** نصٌّ بلا تعليقاتِ سطرٍ ولا فراغاتٍ زائدة — للبحث عن الجملة كما تُكتب. */
const flatten = (s) => s
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .replace(/[ \t]+/g, " ");

for (const f of files) {
  const raw = readFileSync(`${DIR}/${f}`, "utf8");
  const s = flatten(raw);
  const lower = s.toLowerCase();

  // ١) سياسةٌ تُنشأ بلا إسقاطها أوّلاً (ولا `drop policy` على الجدول كلِّه).
  for (const m of lower.matchAll(/create policy ([a-z0-9_]+) on ([a-z0-9_.]+)/g)) {
    const [, name, table] = m;
    if (!lower.includes(`drop policy if exists ${name} on ${table}`)) {
      flag(f, `سياسة «${name}» على ${table} تُنشأ بلا إسقاطٍ أوّلاً`);
    }
  }

  // ٢) محفّزٌ يُنشأ بلا إسقاطه (أو بلا `create or replace trigger`).
  //    وSQL الديناميّ خارج المدى: `execute format('create trigger …')` يُكتب
  //    داخل كتلةٍ محروسةٍ بفحص وجودٍ على `pg_trigger` (0152)، وهو نمطٌ صحيحٌ
  //    لا يفهمه فحصٌ نصّيّ — فلا يُرفع عليه علَم كاذب.
  for (const line of lower.split("\n")) {
    if (line.includes("execute format(") || line.includes("execute '")) continue;
    for (const m of line.matchAll(/create trigger ([a-z0-9_]+)/g)) {
      const name = m[1];
      if (!lower.includes(`drop trigger if exists ${name}`)) {
        flag(f, `محفّز «${name}» يُنشأ بلا إسقاطٍ أوّلاً`);
      }
    }
  }

  // ٣) فهرسٌ بلا `if not exists`.
  for (const m of lower.matchAll(/create (?:unique )?index (?!if not exists|concurrently)([a-z0-9_]+)/g)) {
    flag(f, `فهرس «${m[1]}» بلا if not exists`);
  }

  // ٤) جدولٌ أو نوعٌ بلا `if not exists`.
  for (const m of lower.matchAll(/create table (?!if not exists)([a-z0-9_.]+)/g)) {
    flag(f, `جدول «${m[1]}» بلا if not exists`);
  }
}

/* ── واكتمالُ الموجة: هجرةٌ خارجَ `WAVE` هجرةٌ غير مفحوصة ──────────────────
 * القاعدةُ بـCLAUDE.md §٤ صريحة، لكنّ `WAVE` قائمةٌ **يدويّة** بأعلى `run.sh` —
 * فمن ينسى إضافةَ هجرته إليها يمرّ بـCI أخضرَ وتصل هجرتُه الإنتاجَ بلا أن
 * تُنزَّل ولا مرّة على قاعدةٍ نظيفة. والنسيانُ هنا صامتٌ تماماً، فيُحرَس.
 * والحدُّ الأدنى `0124` لأن الموجة تبدأ منه (وما قبله يحاكيه الأساس). */
const WAVE_FROM = 124;
/* استثناءٌ **معلَنٌ باسمه**، لا صمتٌ: هجرةُ بوّابة المالك (٦٥١ سطراً) تُنشئ
 * جداولَها وتعتمد جداولَ أخرى لا يعرفها الأساس، فضمُّها للموجة يحتاج توسيعَ
 * الأساس — وهي دفعةٌ مستقلّة لا ذيلٌ لدفعةِ الباركود. والغرضُ من الحارس أن
 * تُذكَر الفجوةُ بالاسم لا أن تختفي: **هذه الهجرةُ لم تُنزَّل قطّ على قاعدةٍ
 * نظيفة**، فأوّلُ عيادةٍ تُنشأ من الصفر هي أوّلُ من يجرّبها.
 * ولا يُضاف اسمٌ لهذه القائمة بلا سببٍ مكتوب. */
const WAVE_EXEMPT = new Map([
  ["0158_owner_portal.sql", "تحتاج توسيعَ الأساس (جداولُ البوّابة والحدُّ الزمنيّ) — دَينٌ معلَن"],
]);
const waveText = readFileSync("supabase/tests/run.sh", "utf8").match(/WAVE="([^"]+)"/)?.[1] ?? "";
const inWave = new Set(waveText.split(/\s+/).map((s) => s.split("/").pop()).filter(Boolean));
const missing = files.filter((f) => {
  const n = Number(f.slice(0, 4));
  return Number.isFinite(n) && n >= WAVE_FROM && !inWave.has(f) && !WAVE_EXEMPT.has(f);
});
for (const [f, why] of WAVE_EXEMPT) {
  if (inWave.has(f)) console.log(`   · ${f}: دخلت الموجةَ — احذف استثناءها`);
  else console.log(`   · ${f}: خارج الموجة باستثناءٍ معلَن — ${why}`);
}
if (missing.length) {
  for (const f of missing) console.error(`   ✗ ${f}: خارج WAVE — لن تُفحص أبداً`);
  console.error(`\n✗ migration-idempotency: ${missing.length} هجرةً خارج الموجة (CLAUDE.md §٤: هجرةٌ لا تنزل بالحزمة هجرةٌ غير مفحوصة).`);
  process.exit(1);
}

if (bad) {
  console.error(`\n✗ migration-idempotency: ${bad} موضعاً لا يُعاد تنزيلُه بلا أثرٍ ثانٍ (CLAUDE.md §٤).`);
  process.exit(1);
}
console.log(`✓ migration-idempotency: ${files.length} هجرةً، كلُّها تُعاد بلا أثرٍ ثانٍ، و${inWave.size} منها بالموجة بلا نقص.`);
