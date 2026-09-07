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

if (bad) {
  console.error(`\n✗ migration-idempotency: ${bad} موضعاً لا يُعاد تنزيلُه بلا أثرٍ ثانٍ (CLAUDE.md §٤).`);
  process.exit(1);
}
console.log(`✓ migration-idempotency: ${files.length} هجرةً، كلُّها تُعاد بلا أثرٍ ثانٍ.`);
