-- ============================================================================
-- ٠١٦٠ — الكتالوجُ المشترك يعطي ولا يكشف
--
-- ٠١٠٣ بنى الكتالوجَ على مبدأٍ صحيح: مشاركةٌ صريحة، ومُخرَجٌ مجهولُ الهوية،
-- وأسعارٌ وسائط. والقياسُ على الإنتاج كشف ثلاثَ فجواتٍ بالتطبيق لا بالمبدأ.
--
-- ── ١) «الوسيط» على مصدرٍ واحد هو المصدرُ نفسه ──────────────────────────────
-- ١٧٥٥ باركوداً بالكتالوج، **١٢٩٤ منها (٧٣٫٧٪) عند مساهمٍ واحد**. ووسيطُ قيمةٍ
-- واحدة هو القيمة: أي أنّ `catalog_lookup` كانت ترجّع **سعرَ شراء عيادةٍ بعينها**
-- — وهو ما يسمّيه رأسُ 0103 نفسه «سرّ تجاري (كلفة المجهّز)». والمساهمون ثلاثةٌ
-- فقط، فنسبةُ الرقم إلى صاحبه سهلة. والدالّةُ ممنوحةٌ لكلِّ `authenticated`،
-- والتسجيلُ مفتوحٌ بتجربةٍ مجانية.
--   الآن: الاسمُ يخرج دائماً (وهو المنفعةُ الأكبر)، والأسعارُ تُحجب حتى يبلغ
--   المساهمون ثلاثة. `contributors` يخرج كما هو فيعرف القارئ لماذا لا سعر.
--
-- ── ٢) رقمُ الرفّ ليس باركودَ مصنع ─────────────────────────────────────────
-- الكتالوجُ بُني على أنّ الباركود رمزٌ علنيٌّ مطبوعٌ على العلبة. لكن ٣٣٩ رمزاً
-- منه أرقامُ رفوفٍ داخلية (أقصرُ من ١٢ خانة) — ترقيمُ مخزنٍ خاصّ بالعيادة، لا
-- شيءَ علنيّ فيه. وأسوأ: أرقامُ الرفوف **تتصادم** بين العيادات (رمزٌ واحد =
-- «بخاخ التهابات فم» عند واحدة و«قطرة فيبرونيل» عند أخرى)، فيقترح الكتالوجُ
-- اسمَ منتجٍ لا علاقة له بما بيد الطبيب.
--   الآن: باركودات المصنع وحدها (١٢–١٤ رقماً). يخسر الكتالوجُ ١٩٪ من حجمه
--   ويكسب أنّ الباقي صحيحٌ ولا يكشف ترقيمَ أحد.
--
-- ── ٣) مفتاحُ المشاركة قرارٌ تجاريّ بيد المدير ─────────────────────────────
-- `clinic_prefs` سياستُها `ALL` بفحص العيادة بلا فحصِ دور، فأيُّ موظّفٍ يقدر
-- يفتح مشاركةَ كلفةِ عيادته. الآن `catalog_share` وحده يحتاج مديراً؛ وبقيةُ
-- التفضيلات تبقى لكلِّ الكادر كما كانت — لا صلاحيةَ تُسحب من أحد.
--
-- ── الأثر ────────────────────────────────────────────────────────────────
-- ولا صفَّ منتجٍ يُقرأ أو يُكتب أو يُحذف، ولا باركودَ عيادةٍ يُمَسّ. تضييقُ
-- عرضٍ ومنحٍ فقط. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0159.
-- ============================================================================

-- ── ١) المصدر: باركودات المصنع وحدها ──────────────────────────────────────
create or replace view shared_catalog_source as
  select p.barcode, p.name, p.sell_price, p.purchase_price, p.clinic_id
  from products p
  join clinic_prefs cp on cp.clinic_id = p.clinic_id
  where cp.catalog_share = true
    and p.barcode is not null and p.barcode <> ''
    and p.name is not null and btrim(p.name) <> ''
    -- باركودُ مصنعٍ فقط: EAN-13/UPC-A/EAN-14. ما دونها ترقيمُ رفٍّ داخليّ
    -- يخصّ العيادةَ وحدها، ويتصادم بين العيادات فيقترح منتجاً غير المقصود.
    and p.barcode ~ '^[0-9]{12,14}$';
revoke all on shared_catalog_source from public, anon, authenticated;

-- ── ٢) حدُّ المساهمين قبل إظهار سعر ───────────────────────────────────────
-- ثلاثةٌ: أقلُّ عددٍ يجعل الوسيطَ وسيطاً لا قيمةً منسوبة.
create or replace function catalog_min_contributors() returns int
language sql immutable set search_path = public as $$ select 3 $$;
revoke all on function catalog_min_contributors() from public, anon;
grant execute on function catalog_min_contributors() to authenticated;

create or replace function catalog_lookup(p_barcode text)
returns table (
  barcode text, name text,
  sell_price numeric, purchase_price numeric,
  contributors int, name_variants int
)
language sql
security definer
set search_path = public
stable
as $$
  select s.barcode,
         mode() within group (order by s.name) as name,
         -- الاسمُ يخرج دائماً، والسعرُ لا يخرج إلا بعددٍ يخفي صاحبَه.
         case when count(distinct s.clinic_id) >= catalog_min_contributors()
              then round(percentile_cont(0.5) within group (order by s.sell_price)::numeric, 2) end,
         case when count(distinct s.clinic_id) >= catalog_min_contributors()
              then round(percentile_cont(0.5) within group (order by s.purchase_price)::numeric, 2) end,
         count(distinct s.clinic_id)::int,
         count(distinct s.name)::int
  from shared_catalog_source s
  where s.barcode = btrim(p_barcode)
  group by s.barcode;
$$;
revoke all on function catalog_lookup(text) from public, anon;
grant execute on function catalog_lookup(text) to authenticated;

create or replace function catalog_search(p_q text, p_limit int default 25)
returns table (
  barcode text, name text,
  sell_price numeric, purchase_price numeric,
  contributors int
)
language sql
security definer
set search_path = public
stable
as $$
  with hits as (
    select distinct s.barcode
    from shared_catalog_source s
    where btrim(coalesce(p_q, '')) <> ''
      and s.name ilike '%' || btrim(p_q) || '%'
  )
  select s.barcode,
         mode() within group (order by s.name) as name,
         case when count(distinct s.clinic_id) >= catalog_min_contributors()
              then round(percentile_cont(0.5) within group (order by s.sell_price)::numeric, 2) end,
         case when count(distinct s.clinic_id) >= catalog_min_contributors()
              then round(percentile_cont(0.5) within group (order by s.purchase_price)::numeric, 2) end,
         count(distinct s.clinic_id)::int
  from shared_catalog_source s
  join hits h on h.barcode = s.barcode
  group by s.barcode
  order by count(distinct s.clinic_id) desc, 2
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
revoke all on function catalog_search(text, int) from public, anon;
grant execute on function catalog_search(text, int) to authenticated;

-- ── ٣) مفتاحُ المشاركة للمدير وحده ────────────────────────────────────────
-- تُفكَّك سياسةُ `ALL` إلى أربعٍ بنفس المدى تماماً، ويُضاف الشرطُ على التعديل
-- وحده: مَن ليس مديراً يعدّل ما شاء من التفضيلات **إلا** `catalog_share` —
-- يبقى كما هو. نمطُ `profiles_self_update` نفسُه (0049) وقد أثبت نفسه.
drop policy if exists clinic_prefs_clinic_all on clinic_prefs;

create policy clinic_prefs_select on clinic_prefs
  for select using (clinic_id = (select auth_clinic()));

create policy clinic_prefs_insert on clinic_prefs
  for insert with check (clinic_id = (select auth_clinic()));

create policy clinic_prefs_delete on clinic_prefs
  for delete using (clinic_id = (select auth_clinic()));

create policy clinic_prefs_update on clinic_prefs
  for update
  using (clinic_id = (select auth_clinic()))
  with check (
    clinic_id = (select auth_clinic())
    and (
      (select auth_role()) = 'manager'
      or catalog_share is not distinct from
         (select cp.catalog_share from clinic_prefs cp where cp.clinic_id = (select auth_clinic()))
    )
  );

comment on column clinic_prefs.catalog_share is
  'مشاركةُ أسعار هذه العيادة بالكتالوج المشترك. يبدّله المديرُ وحده (0160) — قرارٌ تجاريّ لا تفضيلُ واجهة.';
