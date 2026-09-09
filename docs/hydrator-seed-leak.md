# عطلٌ حيّ: ثلاثةُ مُرطِّباتٍ تكتب بأرضِ غيرها — وحارسُها أعمى

> وثيقةٌ مكتفيةٌ بنفسها. كلُّ ما تحتاجه هنا: لا تستكشف المستودعَ قبل قراءتها.
> المستودع: `C:\Users\MK\saas-fetch` — فرع `claude/fetch-fortress-work`.

---

## ١) العطل بجملة

ثلاثُ دوالِّ ترطيبٍ (`hydrate*`) فيها فرعٌ يقول: **«إن كان الجدولُ السحابيّ
فارغاً فارفعْ ما بهذا الجهاز»** — يكتب بلا أن يتيقّن أن العيادةَ التي بالمتصفّح
هي عيادةُ الخادم. وهذا **نفسُ عطل 0153 حرفياً** (موثَّقٌ بـ`CLAUDE.md` §٣:
ثلاثةَ عشرَ صفَّ إعداداتٍ هبطت بعيادةِ زبونٍ بعد ثانيتين من دخول المشغّل).

| # | الملفّ:السطر | الجدول | حجمُه اليوم |
|---|---|---|---|
| ١ | `src/lib/promotions.ts:52` | `clinic_promos` | ١ صفّ / عيادة واحدة |
| ٢ | `src/lib/locations.ts:93` | `clinic_areas` | ١٨٦ صفّاً / ١٧ عيادة |
| ٣ | `src/lib/vaccines.ts:104` | `clinic_vaccines` | ٣٦ صفّاً / ١٢ عيادة |

الثلاثةُ `registerHydrator(...)` — تعمل عند بدء الجلسة وعند تبديل العيادة.
والثلاثةُ `clinic_id` افتراضُه `auth_clinic()` — أي أن الصفَّ يهبط **بعيادة
الخادم** مهما ظنّ المتصفّح.

### الدليلُ من الإنتاج (سجلّ ٨ أيلول ٢٠٢٦)
ثلاثُ محاولاتٍ فاشلة، عيادةٌ تعيد المحاولة:
```
22:38:20  duplicate key value violates unique constraint "clinic_promos_pkey"
22:38:38  duplicate key value violates unique constraint "clinic_promos_pkey"
22:45:38  duplicate key value violates unique constraint "clinic_promos_pkey"
```
المعرّفُ يُولَّد بالجهاز، فتصادمُ المفتاح **منع الكتابة**. أي أن هذا الخطأ ليس
عطلاً منفصلاً — هو **محاولةُ كتابةٍ بعيادةٍ خاطئة ارتدّت بالصدفة**. و
`clinic_areas`/`clinic_vaccines` بلا هذي الحماية إن كانت المعرّفاتُ غيرَ مأخوذة.

ودفعةٌ مرصودة: ٨ صفوفِ `clinic_areas` هبطت بعيادةٍ واحدة **بفارقِ صفرِ ثانية**
(١ أيلول) — شكلُ `insert(rows)` واحد، أي بذرةٌ لا إدخالٌ بشريّ.

### لماذا لم يمسكه الحارس
`scripts/seed-guard.mjs` يقول «✓ لا كتابةَ عارية داخل مُرطِّب» — **اطمئنانٌ
كاذب**: قائمتُه أربعةُ ملفّاتٍ مكتوبةٌ بالنصّ بالسطر ١٨، وهذه الثلاثةُ ليست منها.

---

## ٢) الإصلاح — أربعُ خطوات

### خطوة ١: `seedOwnClinic` تُخبر هل نفّذت

`src/lib/clinicSync.ts` — التعريفُ الحاليّ:
```ts
export async function seedOwnClinic(run: () => PromiseLike<unknown>): Promise<void> {
  seedGate ??= askSeedGate();
  if (await seedGate) await run();
}
```
يصير:
```ts
/** يُرجع هل جرت البذرةُ فعلاً — فلا يتبنّى المُرطِّبُ صفوفاً لم تُحفظ. */
export async function seedOwnClinic(run: () => PromiseLike<unknown>): Promise<boolean> {
  seedGate ??= askSeedGate();
  if (!(await seedGate)) return false;
  await run();
  return true;
}
```
**متوافقٌ رجعياً**: المستدعون الحاليّون (`breeds.ts`، `meds.ts`، `settings.ts`)
يتجاهلون القيمةَ الراجعة فلا يتغيّر سلوكُهم.

**لماذا القيمةُ الراجعة مهمّة**: بلا معرفةِ «هل جرت؟» يبقى الفرعُ يكتب
`next = local` — فتُعرض بروموشناتُ عيادةٍ على شاشة عيادةٍ أخرى. الكتابةُ تُمنع
والعرضُ يتسرّب. لازم الاثنان.

---

### خطوة ٢: المواضع الثلاثة

لكلٍّ منها: أضف `seedOwnClinic` للاستيراد من `./clinicSync`، ثمّ:

#### ٢-أ · `src/lib/promotions.ts`
الاستيراد بالسطر ٧:
```ts
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";
```
← يصير:
```ts
import { sb, cloudWrite, registerHydrator, registerReset, seedOwnClinic } from "./clinicSync";
```

والسطرُ ٥٢ (داخل `hydratePromos`):
```ts
      if (local.length) { await client.from("clinic_promos").insert(local.map(ruleToRow)); next = local; }
```
← يصير:
```ts
      // بذرةٌ لا ترتفع إلا بأرض صاحبها (0153): والتبنّي بعد نجاحها، وإلا عُرضت
      // بروموشناتُ عيادةٍ على شاشة أخرى ولو مُنعت الكتابة.
      if (local.length && await seedOwnClinic(() => client.from("clinic_promos").insert(local.map(ruleToRow)))) next = local;
```

#### ٢-ب · `src/lib/locations.ts`
الاستيراد بالسطر ١٠ — أضف `seedOwnClinic` بنفس الطريقة.

والسطرُ ٩٣ (داخل `hydrateAreas`):
```ts
      if (rows.length) await client.from("clinic_areas").insert(rows);
```
← يصير:
```ts
      if (rows.length && !(await seedOwnClinic(() => client.from("clinic_areas").insert(rows)))) {
        // ما ارتفعت: لا تتبنَّ خريطةَ جهازٍ لعيادةٍ غيرِ عيادته.
        cache = null;
        return;
      }
```
> **انتبه**: هنا `map[g] = areas.slice()` تُملأ **قبل** الإدراج (الأسطر ٨٨–٩١)،
> فالرجوعُ المبكر ضروريٌّ كي لا يُكتب `map` الملوَّث بالكاش وبـlocalStorage
> بالسطرين ٩٥–٩٦. تأكّد أن `cache` من نوعٍ يقبل `null` (كما بـ`catch` أسفله).

#### ٢-ج · `src/lib/vaccines.ts`
الاستيراد بالسطر ٥ — أضف `seedOwnClinic`.

والسطرُ ١٠٤ (داخل `hydrateVaccines`):
```ts
      if (local.length) { await client.from("clinic_vaccines").insert(local); next = local; }
```
← يصير:
```ts
      if (local.length && await seedOwnClinic(() => client.from("clinic_vaccines").insert(local))) next = local;
```
> فرعُ `else if (local.length)` أسفلَه (دمجُ المحلّيّ مع السحابيّ) **لا يُمَسّ**:
> ذاك يقع حين يرجع الخادمُ صفوفاً — أي العيادةُ متّفقة — وغرضُه ألّا تسقط لقاحةٌ
> أُضيفت للتوّ.

---

### خطوة ٣: الحارسُ يمسح كلَّ مُرطِّب لا قائمةً مكتوبة

`scripts/seed-guard.mjs` السطر ١٨:
```js
const FILES = ["src/lib/breeds.ts", "src/lib/meds.ts", "src/lib/settings.ts", "src/lib/clinicSync.ts"];
```
← يصير مسحاً لكلّ `src/`:
```js
/* قائمةٌ مكتوبةٌ بالنصّ تُعمي الحارسَ عن ملفٍّ جديد — وقد أعمته فعلاً عن
 * ثلاثة (promotions/locations/vaccines) حتى ظهر العطلُ بسجلّ الإنتاج.
 * فالنطاقُ صار «كلُّ ملفٍّ فيه مُرطِّب»، يتّسع من نفسه. */
import path from "node:path";
const walk = (d) => fs.readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return fs.statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) ? [p.split(path.sep).join("/")] : []);
});
const FILES = walk("src").filter((f) => /registerHydrator|function hydrate/.test(fs.readFileSync(f, "utf8")));
```
> بقيّةُ الملفّ لا تتغيّر. والرسالةُ الأخيرة تطبع عددَ الملفّات الممسوحة — زِد
> `FILES.length` لها إن سهل، فيُرى النطاقُ ولا يُفترض.

---

### خطوة ٤: فحصٌ يفشل قبل الإصلاح ويمرّ بعده

هذا **إلزاميّ** بهذا المشروع: «كلُّ فحصٍ لم يُشغَّل مرةً هو ادّعاءٌ لا فحص».

أضف إلى `scripts/seed-guard.mjs` (بعد الحلقة، قبل التقرير) فحصاً يتأكّد أن
الحارسَ نفسَه يرى ما يكفي:
```js
// نطاقٌ لا يُفترض: ملفّاتُ المُرطِّبات المعروفة لازم تكون كلُّها بالمسح.
const MUST = ["src/lib/breeds.ts", "src/lib/meds.ts", "src/lib/settings.ts",
              "src/lib/clinicSync.ts", "src/lib/promotions.ts",
              "src/lib/locations.ts", "src/lib/vaccines.ts"];
const missed = MUST.filter((f) => !FILES.includes(f));
if (missed.length) {
  console.error("   ✗ الحارسُ لا يمسح: " + missed.join("، "));
  bad += missed.length;
}
```

**وأثبت أنه يمسك**: قبل تطبيق الخطوة ٢، شغّل الحارسَ بعد الخطوة ٣ وحدها —
لازم يفشّل بثلاث كتاباتٍ عارية. سجّل الناتجَ برسالة الدفعة.

---

## ٣) البوّابة (لا تُوفَّى جزئياً)

```bash
cd C:/Users/MK/saas-fetch
npm run lint     # tsc + كلُّ الحرّاس
npm run build
```
لا تُسكِت حارساً — أصلِح. (`bash supabase/tests/run.sh` لا تلزم هنا: لا هجرة.)

**لا تحتاج هجرةَ قاعدة**: العطلُ كلُّه بالواجهة، والجداولُ سليمةٌ كما هي.

---

## ٤) خطوطٌ حمراء (من `CLAUDE.md` — غيرُ قابلةٍ للنقاش)

1. **لا دمجَ إلى `main`** — الدمجُ ينشر على عياداتٍ حيّة، بكلمة المالك وحدها.
   اعمل على `claude/fetch-fortress-work` وادفع إليه فقط.
2. **لا تحذف ولا تعدّل صفَّ بياناتٍ قائماً** — لا «تنظيف» لـ`clinic_areas` ولا
   غيرها. الإصلاحُ يمنع التسرّبَ القادم، ولا يلمس ما مضى.
3. **المستودع عام** — لا أسماءَ عيادات ولا معرّفاتِها بالشِفرة ولا الرسائل.
4. **رسالةُ الدفعة تشرح الجذر لا التغيير** (بالعربية، كبقيّة السجلّ).

---

## ٥) مصائدُ تقنية تُوفّر عليك وقتاً (مقيسةٌ بهذه الجلسة)

- **الملفّاتُ CRLF**: `src/**/*.ts` و`*.tsx` نهاياتُها `\r\n`، و`repo.ts`
  وبعضُ `scripts/*.mjs` نهاياتُها `\n`. أيُّ تعديلٍ بمرساةٍ نصّية لازم يطابق
  النهايةَ الصحيحة، وإلا فشلت المطابقةُ بصمت.
- **الشرطةُ العكسية تُبتلع** إن مرَّت عبر الصدفة (`bash -c`, heredoc):
  `\\d` تصل `\d` ثم تصير `d`. إن احتجت regex بنصٍّ مولَّد، ابنِ الشرطةَ
  بـ`String.fromCharCode(92)` أو تجنّب الـregex أصلاً.
- استعمل أدوات التحرير المباشرة (Edit/Write) لا سكربتاتِ استبدالٍ عبر الصدفة —
  أرخصُ وأأمن.

---

## ٦) معيارُ «تمّ»

- [ ] `seedOwnClinic` ترجع `boolean`، والمستدعون القدامى يعملون كما كانوا.
- [ ] المواضعُ الثلاثة ملفوفةٌ، ولا تتبنّى صفوفاً لم ترتفع.
- [ ] `seed-guard` يمسح ٧ ملفّاتٍ فأكثر (لا ٤)، ويفشل إن نقص أحدُها.
- [ ] الحارسُ **شُوهد فاشلاً** على الشِفرة قبل الإصلاح — والعددُ مذكورٌ بالرسالة.
- [ ] `npm run lint` و`npm run build` خضراوان.
- [ ] دفعةٌ واحدة على `claude/fetch-fortress-work`، بلا دمجٍ إلى `main`.
