-- ============================================================================
-- ٠١٩٦ — مفتاحُ اسمِ الشركة واحدٌ بالطرفين، وطيُّ التوائم بلا فقدِ صفّ
--
-- ── الجذرُ، مقيساً ──────────────────────────────────────────────────────
-- «لما أضيف شركة بنفس الاسم يخلي كل شركة وحدها». المقيسُ بالإنتاج: ١٤٣ شركة،
-- **١٠٢ منها مكرّرة** بـ١٨ مجموعةً وستِّ عيادات؛ و٨٥٪ من كلِّ شركةٍ تُضاف
-- يومياً هي نسخةٌ من قائمة. «شركة تاج الخيل» وحدَها ١٥ صفّاً خُلقت بيومٍ واحد
-- بين ١٢:٣٧ و١٥:٠٢، كلُّ صفٍّ معه صنفٌ واحدٌ اسمُه «دراي فود» ومنتجٌ واحد.
--
-- والسببُ **تطبيعُ طرفٍ واحد** بالواجهة: المقارنةُ كانت
--   normKey(اسم الشركة المحفوظ)  ==  المكتوب.toLowerCase()
-- و`normKey` يمرّ من `searchable` الذي **يمسح المسافات كلَّها**. فـ«شركة تاج
-- الخيل» تُقارن بـ«شركهتاجالخيل» ولا تتطابقان أبداً — فكلُّ حفظةِ منتجٍ تصنع
-- الشركةَ والصنفَ من جديد بنفس الاسم حرفاً بحرف.
--
-- والقسمةُ بالبيانات تحسمه بلا تخمين: الأسماءُ التي **لا** يغيّرها التطبيع
-- (كلمةٌ واحدة نظيفة) ٢٤ اسماً بـ٢٤ صفّاً و**صفرُ** مجموعاتٍ مكرّرة؛ والتي
-- يغيّرها ٣٥ اسماً بـ١١٩ صفّاً فيها **١٨ مجموعةً و١٠٢ صفّ**. لا تقاطُع.
--
-- ── لماذا لا يكفي إصلاحُ الواجهة ────────────────────────────────────────
-- أُصلحت المقارنةُ بمواضعها الثلاثة، لكنّ المتصفّحَ وحدَه ليس حارساً: تبويبان
-- مفتوحان أو جهازان يحفظان معاً يقرآن نفسَ القائمة القديمة فيُدرجان توأمَين.
-- فالبحثُ والإدراجُ يصيران معاملةً واحدةً هنا.
--
-- ── ولماذا الطيُّ لا الحذف ──────────────────────────────────────────────
-- خمسةُ أعمدةٍ تشير إلى `companies`، وثلاثةٌ منها `on delete set null`
-- (`products.company_id`، `purchases.company_id`، `purchase_payments.company_id`)
-- واثنان `cascade` (`company_sections`، `company_charges`). فحذفُ توأمٍ اليوم
-- **يفصل ٨٧ منتجاً عن شركته ويمحو ٥٣ صنفاً ومطالباتِه بصمت**. `merge_companies`
-- تنقل كلَّ شيءٍ أوّلاً ثم تحذف — سُنّةُ `merge_products` (0144) و`0167`.
--
-- هذه الهجرة **إضافيةٌ محضة**: دوالُّ فقط، ولا محفّزَ ولا قيدَ ولا صفَّ يُمَسّ.
-- فالواجهةُ القديمة لا تتأثّر بها، وتُنزَّل قبل نشر الواجهة بأمان.
--
-- تراجع:
--   drop function if exists public.company_twins();
--   drop function if exists public.merge_companies(uuid, uuid);
--   drop function if exists public.merge_company_sections(uuid, uuid);
--   drop function if exists public.ensure_company_section(uuid, text);
--   drop function if exists public.ensure_company(text);
--   drop function if exists public.inv_norm_group(text);
-- ============================================================================

-- ── ١) مفتاحُ المقارنة — مرآةُ `groupKey` بـsrc/lib/utils.ts ──────────────
-- `inv_norm_name` **لا تُلمس**: يعتمد عليها `record_purchase` ودلالتُها تُبقي
-- المسافات. هذه دالّةٌ ثانيةٌ بغرضٍ ثانٍ، لا تعديلٌ لتلك.
create or replace function public.inv_norm_group(v text) returns text
language sql immutable strict parallel safe
set search_path to 'public'
as $$
  -- **الترتيبُ لا يُعكس**: الأرقامُ الشرقية U+0660–U+0669 تقع داخل مدى التشكيل
  -- U+064B–U+0670، فمسحُ التشكيل قبل ترجمتها يمحو «٧٧٠٩٩» كلَّه (درسُ 0150).
  select regexp_replace(
           regexp_replace(
             -- `translate` يقابل حرفاً بحرفٍ **بالموضع**: أربعةُ أشكالِ ألفٍ ⇒ ا،
             -- ثم **ة ⇒ ه** (لا ا)، ثم ى وئ ⇒ ي، ثم ؤ ⇒ و. كتبتُها أوّلَ مرّةٍ
             -- بخمسِ ألفاتٍ متتاليةٍ فصارت ة ⇒ ا: «شركة» تُطبَّع «شركا» بينما
             -- الواجهةُ تُطبّعها «شركه» — **تطبيعٌ يفترق عن مرآته**، أي نفسُ
             -- صنفِ العطب الذي جئنا نصلحه. أمسكه فحصُ الحزمة بأول تشغيل.
             translate(lower(coalesce(v, '')),
                       'أإآٱةىئؤ٠١٢٣٤٥٦٧٨٩',
                       'ااااهييو0123456789'),
             '[ً-ْٰـ]', '', 'g'),
           '\s+', '', 'g');
$$;

revoke all on function public.inv_norm_group(text) from public, anon;
grant execute on function public.inv_norm_group(text) to authenticated;

comment on function public.inv_norm_group(text) is
  'مفتاحُ مقارنةِ اسمِ شركةٍ أو صنف (0196) — مرآةُ groupKey بالواجهة، يحرسها group-key-parity.';

-- ── ٢) ابحث ثم أنشئ، ذرّيّاً ──────────────────────────────────────────────
-- `security invoker` عمداً: سياسةُ `companies` تسمح للعيادة بالكتابة بأرضها،
-- فلا حاجةَ لتجاوزها. (درسُ 0145 يخصّ جدولاً سياستُه قراءةٌ فقط — ليس هذا.)
create or replace function public.ensure_company(p_name text)
returns companies
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_clinic uuid := auth_clinic();
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_key    text := inv_norm_group(v_name);
  v_row    companies;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_key = '' then
    raise exception 'bad_name' using hint = 'اسمُ الشركة فارغ.';
  end if;

  -- قفلٌ استشاريٌّ بالمعاملة على (العيادة + المفتاح): تبويبان يضغطان «حفظ»
  -- بنفس اللحظة يتسلسلان هنا بدل أن يقرأ كلٌّ منهما «ماكو» فيُدرجا توأمَين.
  perform pg_advisory_xact_lock(hashtextextended(v_clinic::text || '|' || v_key, 0));

  select * into v_row from companies
   where clinic_id = v_clinic and inv_norm_group(name) = v_key
   order by created_at limit 1;
  if found then return v_row; end if;

  -- الاسمُ يُحفظ **كما كُتب** لا مطبَّعاً: المفتاحُ للمقارنة والاسمُ للعرض.
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
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
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

-- ── ٣) الطيّ — النقلُ قبل الحذف، دائماً ──────────────────────────────────
create or replace function public.merge_company_sections(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_clinic uuid := auth_clinic();
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then return; end if;
  if not exists (select 1 from company_sections where id = p_keep and clinic_id = v_clinic)
     or not exists (select 1 from company_sections where id = p_drop and clinic_id = v_clinic) then
    raise exception 'bad_section' using hint = 'الصنفان لازم يكونان بعيادتك.';
  end if;
  update products set section_id = p_keep where section_id = p_drop;
  delete from company_sections where id = p_drop;
end $$;

revoke all on function public.merge_company_sections(uuid, uuid) from public, anon;
grant execute on function public.merge_company_sections(uuid, uuid) to authenticated;

create or replace function public.merge_companies(p_keep uuid, p_drop uuid)
returns companies
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_clinic uuid := auth_clinic();
  v_keep   companies;
  v_drop   companies;
  v_sec    company_sections;
  v_match  uuid;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'bad_merge' using hint = 'اختر شركتين مختلفتين.';
  end if;

  select * into v_keep from companies where id = p_keep and clinic_id = v_clinic for update;
  if not found then raise exception 'no_keep' using hint = 'الشركةُ الباقيةُ غيرُ موجودة بعيادتك.'; end if;
  select * into v_drop from companies where id = p_drop and clinic_id = v_clinic for update;
  if not found then raise exception 'no_drop' using hint = 'الشركةُ المطويّةُ غيرُ موجودة بعيادتك.'; end if;

  -- **كلُّ عمودٍ يشير إلى الشركة يُنقل قبل الحذف.** الترتيبُ ليس تجميلاً:
  -- ثلاثةٌ منها `set null` واثنان `cascade`، فحذفٌ قبل النقل يفقد صامتاً.
  update products          set company_id = p_keep where company_id = p_drop;
  update purchases         set company_id = p_keep, company_name = v_keep.name where company_id = p_drop;
  update purchase_payments set company_id = p_keep where company_id = p_drop;
  update company_charges   set company_id = p_keep where company_id = p_drop;

  -- الأصناف: ما يقابله اسمٌ بالباقي يُطوى فيه (فلا يولد توأمٌ بالباقي)،
  -- وما لا يقابله ينتقل كما هو.
  for v_sec in select * from company_sections where company_id = p_drop loop
    select id into v_match from company_sections
     where company_id = p_keep and inv_norm_group(name) = inv_norm_group(v_sec.name)
     order by created_at limit 1;
    if v_match is not null then
      update products set section_id = v_match where section_id = v_sec.id;
      delete from company_sections where id = v_sec.id;
    else
      update company_sections set company_id = p_keep where id = v_sec.id;
    end if;
  end loop;

  -- ملاحظةُ المطويّة لا تُرمى إن كان الباقي بلا ملاحظة — نصٌّ كتبته العيادة.
  update companies
     set note = coalesce(nullif(btrim(v_keep.note), ''), v_drop.note)
   where id = p_keep
  returning * into v_keep;

  delete from companies where id = p_drop;   -- بعد أن لم يبقَ ما يشير إليها
  return v_keep;
end $$;

revoke all on function public.merge_companies(uuid, uuid) from public, anon;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;

comment on function public.merge_companies(uuid, uuid) is
  'طيُّ شركةٍ توأمٍ بأختها (0196): ينقل المنتجات والفواتير والدفعات والمطالبات والأصناف ثم يحذف — لا يفقد صفّاً.';

-- ── ٤) تقريرُ ما يُطوى — الشاشةُ تقول ماذا سينتقل قبل أن تضغط ────────────
create or replace function public.company_twins()
returns table (
  norm text, keep_id uuid, keep_name text, rows integer,
  ids uuid[], products integer, purchases integer,
  sections integer, charges integer, payments integer)
language sql
security invoker
set search_path to 'public'
as $$
  with mine as (
    select id, name, created_at, inv_norm_group(name) k
      from companies where clinic_id = auth_clinic()
  ), g as (
    select k, count(*)::int n, array_agg(id order by created_at) ids,
           (array_agg(id order by created_at))[1] keep_id,
           (array_agg(name order by created_at))[1] keep_name
      from mine group by k having count(*) > 1
  )
  select g.k, g.keep_id, g.keep_name, g.n, g.ids,
         (select count(*)::int from products p where p.company_id = any (g.ids)),
         (select count(*)::int from purchases p where p.company_id = any (g.ids)),
         (select count(*)::int from company_sections s where s.company_id = any (g.ids)),
         (select count(*)::int from company_charges c where c.company_id = any (g.ids)),
         (select count(*)::int from purchase_payments y where y.company_id = any (g.ids))
    from g order by g.n desc, g.k;
$$;

revoke all on function public.company_twins() from public, anon;
grant execute on function public.company_twins() to authenticated;
