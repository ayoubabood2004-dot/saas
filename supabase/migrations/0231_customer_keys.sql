-- ============================================================================
-- ٠٢٣١ — «نفسُ الزبون» تعريفٌ واحد بالطرفين، ورقمُه يُقرأ بمفتاح دولة العيادة
--
-- ── ما قيس (الإنتاج، ١١/١٠، عدٌّ بلا أسماء ولا أرقام) ─────────────────────
-- بحثُ الزبون بشاشة البيع (`searchCustomers`) يقرأ **آخرَ ٣٠٠ فاتورة** بالعيادة ويطابق
-- النصَّ الخامَ بـ`includes`، ويجمع بمفتاح `(الهاتف || الاسم).toLowerCase()`:
--   • ٢٬٠٨٤ من ٣٬٠٦١ فاتورةً تحمل اسماً أو رقماً **خارج النافذة** (ثلاث عيادات) —
--     زبونٌ اشترى قبل شهرين لا يطلع بالبحث، فيُكتب من جديد.
--   • ٣٥ زبوناً رقمُهم مكتوبٌ بصيغتين أو أكثر (١٩٢ فاتورة): «0770…» و«+964 770…»
--     زبونان بالقائمة، و«0770» لا يلقى «+964 770…» لأن النصَّ الخامَ لا يحويه.
--   • ٢٣ فاتورةً رقمُها «964» وحده (مفتاحُ الدولة بلا رقم) — كانت تُجمع زبوناً واحداً.
--   • ١٬١٩٠ حيواناً برقم صاحبه — وصاحبُ الحيوان الذي لم يشترِ بعد لا يطلع أبداً.
-- وتحت هذا تسعةُ تعريفاتٍ متنافرة لـ«نفس الزبون» (البحث، الديون، دفتر الزبون،
-- مبيعات الحيوان، منتقي الحيوان، المطالبة بالرقم…). **هذه الهجرة لا تغيّر أيّاً منها**
-- (قرارُ المالك: شاشاتُ المال تبقى كما هي الآن) — تضع التعريفَ الذي يقرأ به البحثُ وحده.
--
-- ── العقد (مرآتُه `src/lib/customerKey.ts`، ويحرسه `customer-key-parity`) ──────
--   cust_phone_nat(p, dial)  الرقمُ الوطنيّ: الأرقامُ الشرقية تُترجم، وكلُّ ما ليس رقماً
--                            يُشال، ثم «00» ثم مفتاحُ **دولة العيادة** ثم الأصفارُ البادئة.
--                            فـ«0770…» و«770…» و«+964 770…» و«00964 0770…» و«٠٧٧٠…» رقمٌ
--                            واحد بعيادةٍ عراقية — وبعيادةٍ سعودية «+966 5…» و«05…» كذلك.
--                            (`phone_key` من 0077 تثبّت 964 حرفاً؛ لا تُمسّ — المطالبةُ بالرقم
--                            تقرأ بها ولا علاقةَ لها بدولة العيادة.)
--   cust_phone_key(p, dial)  الوطنيّ إن كان ٨ أرقامٍ فأكثر، وإلا null: «+964» وحده ليس رقماً.
--   cust_norm(t)             مرآةُ `searchable()`: همزات/ة/ى/ئ/ؤ مطويّة، بلا تشكيل ولا تطويل،
--                            والأرقامُ الشرقية لاتينية، ومسافاتُ جافاسكربت (`\s`) كلُّها تُشال
--                            **بأسمائها** لا بـ`\s` بوستغريس — فذاك يتبع لغةَ القاعدة ولا يعرف
--                            المسافةَ غيرَ القاطعة (NBSP)، فيفترق الطرفان بصمت. والمحارفُ
--                            الخفية (اتجاه، عرضٌ صفريّ) تُشال كذلك: تدخل باللصق من واتساب.
--   cust_name_key(t)         الاسمُ بعد شيل أيّ رقمٍ طويل (٧ أرقامٍ فأكثر — هاتفٌ لُصق بخانة
--                            الاسم) ثم `cust_norm`؛ وnull إن كان أقلَّ من حرفين، أو بلا حرف،
--                            أو اسماً بديلاً («بدون»، «زبون»، «نقدي»، cash…).
--   cust_key(p, n, dial)     'p:'+الهاتف، وإلا 'n:'+الاسم، وإلا null (زبونٌ عابرٌ بلا هويّة).
--
-- **الهاتفُ يغلب**، والاسمُ لا يُدمج عبر رقمٍ أبداً: اسمٌ واحد على رقمين = زبونان.
-- دوالُّ صِرفة (immutable)، لا تقرأ جدولاً ولا تكتب، بمسارٍ مثبَّت، ممنوعةٌ عن anon.
--
-- تراجع: drop function cust_key(text,text,text), cust_name_key(text), cust_norm(text),
--        cust_phone_key(text,text), cust_phone_nat(text,text) — لا يقرأها شيءٌ غيرُ 0232.
-- ============================================================================

set lock_timeout = '5s';

-- الرقمُ الوطنيّ بمفتاح دولة العيادة. المفتاحُ أرقامُه وحدها («+964» ⇒ 964)، وفارغُه = 964.
create or replace function public.cust_phone_nat(p text, p_dial text default '964')
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
           case when d.digits like d.dial || '%' then substr(d.digits, length(d.dial) + 1) else d.digits end,
           '^0+', '')
    from (select regexp_replace(
                   regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'),
                   '^00', '') as digits,
                 coalesce(nullif(regexp_replace(translate(coalesce(p_dial, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), ''), '964') as dial) d
$$;

create or replace function public.cust_phone_key(p text, p_dial text default '964')
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case when length(k) >= 8 then k end from (select public.cust_phone_nat(p, p_dial) as k) s
$$;

-- مرآةُ searchable(): الأرقامُ أوّلاً (مدى التشكيل U+064B–U+0670 يضمّ الشرقيةَ — درسُ 0150)،
-- ثم الحروفُ الصغيرة، ثم شيلُ التشكيل والتطويل ومسافاتِ جافاسكربت والمحارفِ الخفية، ثم الطيّ.
create or replace function public.cust_norm(t text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select translate(
           regexp_replace(
             lower(translate(coalesce(t, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,')),
             '[\x064B-\x0670\x0640\t\n\v\f\r \x00A0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF\x200B-\x200F\x061C\x202A-\x202E\x2066-\x2069]',
             '', 'g'),
           'أإآٱةىئؤ', 'ااااهييو')
$$;

create or replace function public.cust_name_key(t text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
           when char_length(s.k) >= 2
            and s.k ~ '[a-z\x00C0-\x024F\x0621-\x064A\x066E-\x06D5]'
            and s.k not in ('بدون', 'بدوناسم', 'بلااسم', 'لايوجد', 'زبون', 'زبوننقدي', 'زبونعابر', 'عابر',
                            'نقدي', 'عميل', 'عميلنقدي', 'مراجع', 'walkin', 'walk-in', 'cash', 'customer', 'guest')
           then s.k
         end
    from (select public.cust_norm(regexp_replace(
                   translate(coalesce(t, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,'),
                   '\+?[0-9](?:[\t\n\v\f\r \x00A0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF-]*[0-9]){6,}',
                   '', 'g')) as k) s
$$;

create or replace function public.cust_key(p_phone text, p_name text, p_dial text default '964')
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce('p:' || public.cust_phone_key(p_phone, p_dial), 'n:' || public.cust_name_key(p_name))
$$;

revoke all on function public.cust_phone_nat(text, text) from public, anon;
revoke all on function public.cust_phone_key(text, text) from public, anon;
revoke all on function public.cust_norm(text) from public, anon;
revoke all on function public.cust_name_key(text) from public, anon;
revoke all on function public.cust_key(text, text, text) from public, anon;
grant execute on function public.cust_phone_nat(text, text) to authenticated;
grant execute on function public.cust_phone_key(text, text) to authenticated;
grant execute on function public.cust_norm(text) to authenticated;
grant execute on function public.cust_name_key(text) to authenticated;
grant execute on function public.cust_key(text, text, text) to authenticated;
