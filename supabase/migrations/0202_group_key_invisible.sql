-- ============================================================================
-- ٠٢٠٢ — محرفٌ لا يُرى كان يصنع شركةً ثانية
--
-- ── ما قيس بالمتصفّح ────────────────────────────────────────────────────
-- أربعُ محاولاتٍ لإضافة «رويال كانين» وهي موجودة، وكلُّها **نجحت**:
--   • «رويال كانين‏» بعلامة اتجاهٍ بالنهاية (U+200F)
--   • «رويال​كانين» بفاصلٍ صفريّ العرض بالنص (U+200B)
--   • «‎رويال كانين» بعلامةٍ بالبداية (U+200E)
--   • واسمٌ محارفُه غير مرئيةٍ كلُّها ⇒ صفٌّ يبدو **بلا اسم** على الشاشة
--
-- وهذا بعينه العطبُ الموثَّق بالباركود («صفٌّ باركودُه يبدو 8989 وأوّلُ محرفٍ
-- فيه علامةُ اتجاه»)، بحقلٍ ثانٍ: `normalizeCode` تمسح هذه المحارف منذ 0164،
-- و`inv_norm_group`/`groupKey` **لا**. فالباركودُ محميّ واسمُ الشركة مكشوف.
-- وتدخل هذه المحارفُ باللصق من واتساب وإكسل، وهي مصدرُ أسماء الشركات فعلاً.
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- المجموعةُ نفسُها بالطرفين (`INVISIBLE` بـ`utils.ts` ومداها هنا)، تُمسح
-- **قبل** كلّ شيءٍ آخر. والاسمُ المحفوظ يُنظَّف كذلك: صفٌّ اسمُه محارفُ اتجاهٍ
-- يبدو فارغاً بالقائمة ولا يُبحث عنه ولا يُطبع.
--
-- و`ensure_company` ترفض بـ`bad_name` حين يصير المفتاحُ فارغاً — فحصٌ قائمٌ
-- منذ 0196، يصير الآن يمسك «اسماً» كلُّه غيرُ مرئيّ.
--
-- **ويُفحص التطابقُ كما فُحص بـ0164**: `group-key-parity` يحسب المتوقَّع
-- بدالّة الواجهة نفسِها (لا نسخةٍ منها) ويقارنه بناتج القاعدة، وقائمةُ قيمه
-- تحمل هذه المحارف الآن.
--
-- تراجع: أعِد تنزيل 0196 (تعريفُها هناك بلا المسح).
-- تُطبَّق بعد 0201.
-- ============================================================================

create or replace function public.inv_norm_group(v text)
returns text
language sql
immutable parallel safe strict
set search_path to 'public'
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(v, '')),
                         'أإآٱةىئؤ٠١٢٣٤٥٦٧٨٩',
                         'ااااهييو0123456789'),
               -- المحارفُ غير المرئية **أوّلاً**: ZWSP/ZWNJ/ZWJ/LRM/RLM،
               -- وعلامةُ العربية، والجيوب، والعوازل، وBOM.
               '[​-‏؜‪-‮⁦-⁩﻿]', '', 'g'),
             '[ً-ْٰـ]', '', 'g'),
           '\s+', '', 'g');
$$;

comment on function public.inv_norm_group(text) is
  'مفتاحُ مقارنةِ أسماء الشركات والأصناف (0196، ووسّعها 0202 بالمحارف غير المرئية) — مرآةُ `groupKey` بالمتصفّح، يحرس تطابقَهما `group-key-parity.mjs`.';

-- والاسمُ المحفوظ يُنظَّف كذلك — لا صفَّ يبدو بلا اسم.
create or replace function public.ensure_company(p_name text)
returns companies
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_clinic uuid := auth_clinic();
  v_name   text := btrim(regexp_replace(
                     regexp_replace(coalesce(p_name, ''),
                       '[​-‏؜‪-‮⁦-⁩﻿]', '', 'g'),
                     '\s+', ' ', 'g'));
  v_key    text := inv_norm_group(v_name);
  v_row    companies;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_key = '' then
    raise exception 'bad_name' using hint = 'اسمُ الشركة فارغ.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic::text || '|' || v_key, 0));

  select * into v_row from companies
   where clinic_id = v_clinic and inv_norm_group(name) = v_key
   order by created_at limit 1;
  if found then return v_row; end if;

  -- الاسمُ يُحفظ **كما كُتب** لا مطبَّعاً: المفتاحُ للمقارنة والاسمُ للعرض —
  -- بعد مسحِ ما لا يُرى وحدَه، فصفٌّ اسمُه علاماتُ اتجاهٍ يبدو بلا اسم.
  insert into companies (clinic_id, name) values (v_clinic, v_name) returning * into v_row;
  return v_row;
end $$;

revoke all on function public.ensure_company(text) from public, anon;
grant execute on function public.ensure_company(text) to authenticated;

create or replace function public.ensure_company_section(p_company uuid, p_name text)
returns company_sections
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_clinic uuid := auth_clinic();
  v_name   text := btrim(regexp_replace(
                     regexp_replace(coalesce(p_name, ''),
                       '[​-‏؜‪-‮⁦-⁩﻿]', '', 'g'),
                     '\s+', ' ', 'g'));
  v_key    text := inv_norm_group(v_name);
  v_row    company_sections;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_key = '' then
    raise exception 'bad_name' using hint = 'اسمُ الصنف فارغ.';
  end if;
  -- الشركةُ لازم تكون بعيادة الجلسة: صنفٌ يهبط بشركةِ عيادةٍ أخرى تسريبٌ صامت.
  if not exists (select 1 from companies where id = p_company and clinic_id = v_clinic) then
    raise exception 'no_company' using hint = 'الشركةُ غيرُ موجودة بهذه العيادة.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company::text || '|' || v_key, 0));

  select * into v_row from company_sections
   where company_id = p_company and inv_norm_group(name) = v_key
   order by created_at limit 1;
  if found then return v_row; end if;

  insert into company_sections (clinic_id, company_id, name)
  values (v_clinic, p_company, v_name) returning * into v_row;
  return v_row;
end $$;

revoke all on function public.ensure_company_section(uuid, text) from public, anon;
grant execute on function public.ensure_company_section(uuid, text) to authenticated;
