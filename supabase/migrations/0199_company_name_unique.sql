-- ============================================================================
-- ٠١٩٩ — قفلٌ بالقاعدة: اسمُ الشركة لا يتكرّر، والفكُّ يبقى ممكناً
--
-- ── لماذا الآن لا قبل ───────────────────────────────────────────────────
-- 0196 أعطت `ensure_company` (بحثٌ وإدراجٌ بمعاملةٍ واحدة) وهي الدفاعُ الأوّل،
-- و0197/0198 جعلتا الطيَّ آمناً قابلاً للرجوع. لكنّ الدفاعَ الأوّل يُلتَفّ عليه
-- بإدراجٍ خامٍّ من PostgREST أو من لوحة Supabase أو من نسخةِ واجهةٍ قديمةٍ
-- مخبّأةٍ بجهاز — والمقيسُ أنّ ٨٥٪ من شركات اليوم الواحد كنّ توائم.
--
-- **والقفلُ ما كان يمكن أن ينزل قبل اليوم**: القاعدةُ كانت تحمل ١٨ مجموعةَ
-- توائمَ بستّ عيادات (٩٦ صفّاً زائداً). طُويت كلُّها بـ`merge_companies` صفّاً
-- صفّاً بحافظاتٍ تُقاس قبل وبعد (المنتجاتُ، والرصيدُ، والحوضُ، والمطالباتُ،
-- والدفعاتُ، والمطلوبُ للمورّدين) — ولا واحدةٌ انزاحت. ١٥٥ ⇒ ٥٩ شركة، وكلُّ
-- مطويّةٍ بسلّتها ودفترِ طيّها فتُفكّ بضغطة. والأصنافُ كذلك: ١٣ صنفَ «دراي فود»
-- بشركةٍ واحدة (٤٣ ⇒ ٣١ صنفاً بتلك العيادة).
--
-- ── ولماذا محفّزٌ لا فهرسٌ فريد ─────────────────────────────────────────
-- الفهرسُ الفريدُ أقوى وأنظف — وقد كُتب أوّلاً ثمّ سُحب، **لأنه يكسر الفكّ**:
-- `restore_company` تعيد المطويّةَ بنفس اسم الباقية (هذا معنى الفكّ)، فيرفضها
-- الفهرسُ 23505 وتصير الشركاتُ الستُّ والتسعون المطويّةُ اليوم **غيرَ قابلةٍ
-- للرجوع للأبد**. وقاعدةُ هذه الدفعة كلِّها أن لا شيءَ يُفقد بلا رجعة.
--
-- فالمحفّزُ يميّز ما لا يميّزه الفهرس: **من يكتب**. يحرس
-- `current_user = 'authenticated'` وحده — أي الكتابةَ المباشرة من المتصفّح —
-- فتمرّ دوالُّ المُعرِّف (الفكُّ والطيُّ والاسترجاع) لأنها تجري بصلاحية المالك.
-- نفسُ نمط 0162 حرفاً بحرف (تجميدُ الأعمدة بمحفّزٍ لا بسياسة)، ولذلك هو
-- invoker لا definer: قراءتُه تمرّ بسياسة الصفوف فلا يرى غيرَ عيادة الكاتب.
--
-- والرسالةُ بالعربية جاهزةٌ (`errors.companyTwin`) قبل أن يظهر الخطأ: القاعدةُ
-- تنزل قبل الواجهة، ورفضٌ بلا مفتاحِ رسالةٍ يعني «خطأ بقاعدة البيانات» بشاشةِ
-- عيادة. والرسالةُ هي نفسُها التي ترميها النسخةُ التجريبية — مرآةٌ لا نسختان.
--
-- تراجع: `drop trigger companies_no_twin_guard on companies;` ومثلُها للأصناف.
-- تُطبَّق بعد 0198، وبعد طيِّ التوائم القائمة.
-- ============================================================================

create or replace function public.companies_no_twin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- الكتابةُ المباشرة من المتصفّح وحدَها. دوالُّ المُعرِّف (طيٌّ، فكٌّ،
  -- استرجاعٌ من السلّة) تمرّ — وإلّا صار المطويُّ غيرَ قابلٍ للرجوع.
  if current_user <> 'authenticated' then return new; end if;
  if exists (
    select 1 from companies c
     where c.clinic_id is not distinct from new.clinic_id
       and c.id <> new.id
       and inv_norm_group(c.name) = inv_norm_group(new.name))
  then
    raise exception 'company_twin_name'
      using errcode = '23505',
            hint = 'أكو شركة بنفس الاسم بعيادتك — افتحها وأضف عليها بدل ما تسوّي وحدة ثانية.';
  end if;
  return new;
end $$;

drop trigger if exists companies_no_twin_guard on companies;
create trigger companies_no_twin_guard
  before insert or update of name, clinic_id on companies
  for each row execute function companies_no_twin();

comment on function public.companies_no_twin() is
  'شركةٌ واحدةٌ لكلّ اسمٍ مطبَّع بالعيادة (0199) — والمفتاحُ نفسُه بالمتصفّح (`groupKey`) وبـ`ensure_company`. يحرس الكتابةَ المباشرة وحدها فيبقى الفكُّ ممكناً.';

-- والصنفُ نفسُ الشيء، ونطاقُه **الشركةُ لا العيادة**: «دراي فود» تجوز بشركتين.
create or replace function public.company_sections_no_twin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if exists (
    select 1 from company_sections s
     where s.company_id is not distinct from new.company_id
       and s.id <> new.id
       and inv_norm_group(s.name) = inv_norm_group(new.name))
  then
    raise exception 'company_section_twin_name'
      using errcode = '23505',
            hint = 'أكو صنف بنفس الاسم بهاي الشركة — افتحه وأضف عليه.';
  end if;
  return new;
end $$;

drop trigger if exists company_sections_no_twin_guard on company_sections;
create trigger company_sections_no_twin_guard
  before insert or update of name, company_id on company_sections
  for each row execute function company_sections_no_twin();

comment on function public.company_sections_no_twin() is
  'صنفٌ واحدٌ لكلّ اسمٍ مطبَّع داخل الشركة (0199). النطاقُ الشركةُ لا العيادة.';
