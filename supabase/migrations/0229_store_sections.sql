-- ============================================================================
-- ٠٢٢٩ — أقسامُ المتجر، ولوحةُ المصوّر، وصورٌ أوضح (طلبُ المالك، ٩/١٠)
--
-- ── الطلب ──────────────────────────────────────────────────────────────────
-- «نطوّر نظام الستور … أوّل شي نكدر ننشئ تصنيفات وندرج من ضمنها أي منتجات نحتاجها …
-- ونعطي صلاحيات أكثر لموظف التصوير … شنو المنتجات الي عليها صور وشنو الي ما عليها …
-- الصورة واضحة ويكدر يكبّرها … إدراج وترتيب ووضع وصف والتأكد من الأسعار». ثمّ «اوكي»
-- على الخطة بقراراتها السبعة (المستند: خطة تطوير عمل المصوّر والمتجر).
--
-- ── ما قيس قبل البناء (٩/١٠، الإنتاج) ───────────────────────────────────
-- • أكبرُ متجر: ١١٣ منشوراً، ٩٩ منها **بلا صورة**، وصفرُ وصفٍ بالمتجرين (٠ من ١٠٩٩).
-- • `category` فارغٌ على ٩٤٨ من ١٠٥٨ (٨٩٫٦٪) والقائمةُ مغلقةٌ بخمس قيم — ولهذا حكمت
--   ت١٢ (Storefront.tsx) بألّا يُبنى تصفّحٌ عليه. الأقسامُ هنا **جدولٌ جديد تملؤه
--   العيادةُ باليد**، والقسمُ لا يظهر للزبون إلا وفيه منشورٌ يُعرض — فلا وعدَ بترتيبٍ
--   لا تملكه الكتلوجات، وهذا هو القياسُ الجديد الذي طلبه الحكم.
-- • المصوّر: ٣٨ تحديثَ صورةٍ على ٣٤ منتجاً بيومين، ٢١ منها بقيت غيرَ منشورة، وصفرُ نشرٍ
--   أو وصف — الشغلُ يقف عند الصورة لأن ما بعدها بشاشةٍ ثانية.
-- • الصورةُ ٨٠٠ بكسل بجودة ٠٫٧٢ (معدّلُها ١١١ ك.ب): ضبابيةٌ عند التكبير.
--
-- ── القرار ──────────────────────────────────────────────────────────────────
-- • `store_sections`: اسمٌ وترتيبٌ وأرشفة (لا حذف — `restore_product` يعيد الصفَّ
--   بـjsonb_populate_record، وقسمٌ محذوفٌ كان سيُفشل الاسترجاعَ بمفتاحه). القسمُ المؤرشف
--   يختفي من الزبون ومنتجاتُه تنزل لـ«منتجات أخرى» وتبقى مربوطةً فيرجع كما كان.
-- • `products.store_section_id` / `store_sort`: القسمُ وترتيبُه اليدويّ. لا `section_id` —
--   الاسمُ محجوزٌ لصنف الشركة ذي الرصيد المجمَّع (0065)، والخلطُ بينهما يكسر الرصيد.
-- • `products.image_meta`: وصفُ الصورة (أبعاد، حجم، مصدر، مصغّر) — **يُصدَّق ما دام
--   `path` يطابق `image_path`**. فالدمجُ (0184) الذي يطوي الصورةَ من توأمٍ ووصفَها من آخر
--   لا يحتاج تعديلاً: وصفٌ لا يطابق مسارَه يُتجاهل، والمتجرُ يعرض الصورةَ كاملةً كما كان.
-- • كلُّ كتابةٍ من دالّةٍ definer تسأل العيادةَ والإذنَ بنفسها وتحصر النطاقَ بنطاق
--   photo_products (`p.clinic_id = v_clinic and p.farm_id is null`)، وتُضاف لقائمة البوّابة —
--   المنتجاتُ مسيَّجةٌ للمصوّر كتابةً وقراءةً (0222)، والجدولُ الجديدُ كذلك.
-- • النشرُ من `store_publish`: صورةٌ + سعرٌ موجب + غيرُ منتهٍ (قرارُ المالك ١: الصورةُ شرطٌ
--   **للنشر الجديد**؛ المنشورُ بلا صورة يبقى منشوراً ويظهر بتصفية «منشور بلا صورة»).
--   ويقول ما تخطّاه بكلّ سبب. `store_set_visible` (0186) يبقى كما هو للنسخ القديمة.
-- • «تحت الكلفة» علامةٌ يحسبها الخادم **لغير المصوّر**: تصحيحٌ لقرار ٤ بصوتٍ عالٍ — المصوّرُ
--   يكتب السعرَ (0228)، فعلامةٌ تنقلب مع كلّ سعرٍ يجرّبه تكشف الكلفةَ بعشرين محاولة. المديرُ
--   والطبيبُ يرون الكلفةَ أصلاً بالمخزون، فالعلامةُ لهم بلا كشفٍ جديد.
-- • الأخطاءُ بلا errcode 42501: `describeDbError` لا يعرض التلميحَ العربيّ إلا لـP0001،
--   و42501 يقول «جلستك انتهت» — وهي كذبةٌ عن رفضِ صلاحية.
-- • واجهةُ الزبون: `store_catalog2` (القسمُ والمصغّر وترتيبُ الأقسام)، والأقسامُ بأعدادها داخل
--   `store_front` (الحافةُ تجلبها مع أوّل رسم — الشريطُ يصل مع البذرة بلا رحلةٍ ثالثة).
--   `store_catalog` نفسُها لا تُمسّ: تغييرُ أعمدتها يحتاج drop، والنسخُ المخبوءة والحافةُ
--   (`api/store-og.ts`) تقرؤها — الجديدةُ بجانبها والواجهةُ ترجع للقديمة إن غابت.
--
-- تُطبَّق بعد 0228 و**قبل** الواجهة (واجهةٌ تسبقها تنادي دوالَّ غير موجودة). إضافيةٌ
-- وتُعاد بلا أثرٍ ثانٍ. التراجع: `supabase/tests/rollback_0229.sql` (الواجهةُ أوّلاً) — مفحوصٌ
-- بالحزمة تطبيقاً ثمّ تراجعاً ثمّ تطبيقاً. ترتيبُه ليس اختيارياً: store_front تقرأ store_sections
-- فتُعاد من 0183 **قبل** إسقاط الجدول (plpgsql لا يُسجَّل اعتمادُه — كانت كلُّ واجهات العيادات
-- ستسقط بلا خطأٍ وقتَ التراجع)، والمحفّزُ يُسقط قبل عموده (اعتمادُه يمنع drop column).
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الأقسام ─────────────────────────────────────────────────────────────
create table if not exists public.store_sections (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sort        integer not null default 0,
  archived_at timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists store_sections_clinic_idx on public.store_sections (clinic_id, sort);
comment on table public.store_sections is
  'أقسامُ المتجر (0229): تنشئها العيادةُ وتدرج فيها منتجاتها وترتّبها. تُؤرشف ولا تُحذف؛ والكتابةُ من دوالّ store_section_* وحدها.';

alter table public.store_sections enable row level security;
-- قراءةٌ للعيادة، ولا سياسةَ كتابة: الإنشاءُ والتسميةُ والأرشفةُ والترتيبُ من دوالَّ تسأل
-- الإذنَ والتوأمَ والسقفَ تحت قفلٍ واحد (درسُ 0227: التوائمُ بالقفل لا بفهرس تعبير).
drop policy if exists store_sections_select on public.store_sections;
create policy store_sections_select on public.store_sections
  for select using (clinic_id = (select auth_clinic()));
revoke all on table public.store_sections from anon;
revoke insert, update, delete, truncate on table public.store_sections from authenticated;
grant select on table public.store_sections to authenticated;
select public.photographer_fence_table('store_sections');

drop trigger if exists audit_all on public.store_sections;
create trigger audit_all after insert or update or delete on public.store_sections
  for each row execute function audit_change();

-- ── ٢) أعمدةُ المنتج ───────────────────────────────────────────────────────
alter table public.products add column if not exists store_section_id uuid;
alter table public.products add column if not exists store_sort integer;
alter table public.products add column if not exists image_meta jsonb;
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_store_section_fk') then
    alter table public.products add constraint products_store_section_fk
      foreign key (store_section_id) references public.store_sections(id) on delete set null;
  end if;
end $fk$;
-- فهرسٌ كاملٌ لا جزئيّ: fk-no-index لا يقبل الجزئيّ (0191)، وحذفُ قسمٍ (بالعيادة كلّها) يمسح بالمفتاح.
create index if not exists products_store_section_idx on public.products (store_section_id);

-- مسارُ الصورة ومصغّرُها بمحارفَ آمنة فقط. الحرّاسُ قبلها تسأل البادئةَ وحدها (`<العيادة>/` أو
-- `library/`)، فمسارٌ فيه «'» أو «"» أو «<» كان يُقبل — ويُرسم بصفحة المتجر العامّة على نفس أصل
-- التطبيق. الرسمُ صار آمناً بنفسه (api/store-og.ts)، وهذا الطرفُ الثاني: لا يُخزَّن ما لا يُرسم.
-- قيدٌ لا فحصٌ بدالّة: كلُّ كاتبٍ يمرّ منه (set_product_image، store_set_image، الكتابةُ المباشرة).
-- مقيسٌ قبله (٩/١٠، الإنتاج): ٤٤ مساراً كلُّها `<uuid>/[A-Za-z0-9._-]+` — صفرُ مخالف.
do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_image_path_safe') then
    alter table public.products add constraint products_image_path_safe check (
      image_path is null or (image_path ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$' and image_path !~ '(^|/)\.\.?(/|$)'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_image_thumb_safe') then
    alter table public.products add constraint products_image_thumb_safe check (
      image_meta is null or image_meta->>'thumb' is null
      or ((image_meta->>'thumb') ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$' and (image_meta->>'thumb') !~ '(^|/)\.\.?(/|$)'));
  end if;
end $chk$;

-- القسمُ من عيادة المنتج نفسها: المفتاحُ لا يسأل العيادة، والمديرُ والطبيبُ يكتبان المنتجَ
-- مباشرةً (products_write) — فرقمُ قسمِ عيادةٍ أخرى كان سيمرّ. invoker: للمستخدم تكفي سياسةُ
-- القراءة (قسمُ غيره لا يُرى)، ولدوالّ المالك تكفي مقارنةُ العيادة. والاسترجاعُ من السلّة
-- (إدراجٌ بلقطةٍ قديمة) لا يُرفض بقسمٍ زال — يرجع المنتجُ بلا قسم.
create or replace function public.products_store_section_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.store_section_id is null then
    return new;
  end if;
  if exists (select 1 from store_sections s where s.id = new.store_section_id and s.clinic_id = new.clinic_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.store_section_id := null;
    new.store_sort := null;
    return new;
  end if;
  raise exception 'store_section_clinic' using hint = 'القسم مو من أقسام عيادتك — حدّث الصفحة.';
end $$;
drop trigger if exists products_store_section_guard on public.products;
create trigger products_store_section_guard before insert or update of store_section_id on public.products
  for each row execute function public.products_store_section_guard();
comment on column public.products.store_section_id is
  'قسمُ المتجر (0229) — غيرُ section_id (صنفُ الشركة ذو الرصيد المجمَّع). القسمُ المؤرشفُ يُعامَل كلا قسم عند الزبون.';
comment on column public.products.store_sort is
  'ترتيبُ المنتج اليدويّ داخل قسمه (0229)؛ الفارغُ بعد المرتَّب، بالاسم.';
comment on column public.products.image_meta is
  'وصفُ الصورة (0229): {v,path,thumb,w,h,bytes,src,edits}. يُصدَّق ما دام path = image_path، وإلا يُتجاهل.';

-- ── ٣) سجلُّ الحركات: الأقسامُ «متجر» لا «أخرى» (الجسمُ نسخةُ 0227 حرفاً + store_sections) ──
create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    -- 0229: ترتيبُ المتجر (القسمُ وترتيبُه) ضجيجٌ مخفيٌّ كالنقل — سهمُ «خلّيه الأول» يرقّم القسمَ كلَّه؛
    -- وما سواه من شغل المتجر (نشر، تمييز، وصف، صورة) «متجر» لا «تعديل منتج» يدفن تعديلَ المخزون.
    when p_action = 'UPDATE' and p_entity = 'products'
         and cardinality(c.ch) > 0 and c.ch <@ array['store_section_id','store_sort']::text[] then 'store_arrange'
    when p_action = 'UPDATE' and p_entity = 'products' and cardinality(c.ch) > 0
         and c.ch <@ array['store_section_id','store_sort','store_visible','store_featured','store_desc','image_path','image_meta']::text[] then 'store'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity = 'price_changes' then 'price_change'
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity in ('expenses','expense_categories') then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_sections') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- ── ٤) منتجاتُ اللوحة — الأعمدةُ الآمنة + القسمُ والترتيبُ والوصفُ والتوفّرُ ────────────
create or replace function public.photo_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_store  boolean;
  v_cost   boolean;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  v_store := staff_can('manageStore');
  if not (v_store or staff_can('manageProductPhotos')) then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على صور المنتجات.';
  end if;
  -- «تحت الكلفة» لمن يدير المتجر **ولا يكتب السعرَ تجريباً**: المصوّرُ يكتبه (0228)، فعلامةٌ
  -- تنقلب مع كلّ سعرٍ يجرّبه كانت تكشف الكلفةَ بعشرين محاولة. الكادرُ يرى الكلفةَ بالمخزون أصلاً.
  v_cost := v_store and not is_photographer();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'barcode', p.barcode, 'category', p.category,
             'subcategory', p.subcategory, 'company_id', p.company_id, 'company_name', c.name,
             'image_path', p.image_path, 'image_meta', p.image_meta,
             'store_visible', coalesce(p.store_visible, false),
             'store_featured', coalesce(p.store_featured, false), 'store_desc', p.store_desc,
             'store_section_id', p.store_section_id, 'store_sort', p.store_sort,
             -- الرموزُ الإضافية: مسحُ علبةٍ بباركود المصنع يفتح بطاقتها وإن دخلت برقم رفّ.
             'alt_codes', coalesce(to_jsonb(p.alt_codes), '[]'::jsonb),
             'sell_price', case when v_store then p.sell_price end,
             'stock', case when v_store then p.stock end,
             'pooled', case when v_store then coalesce(p.pooled, false) end,
             'expiry_date', case when v_store then p.expiry_date end,
             -- التوفّرُ **بتعبير store_catalog حرفاً**: المجمَّعُ رصيدُه بحوض صنفه، وحوضٌ فارغٌ
             -- كان يُرى «متوفّراً» باللوحة و«نافداً» عند الزبون.
             'available', case when v_store then (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) end,
             'below_cost', case when v_cost then (coalesce(p.purchase_price, 0) > 0 and coalesce(p.sell_price, 0) > 0
                                                  and p.sell_price < p.purchase_price) end)
           order by p.name)
      from products p
      left join companies c on c.id = p.company_id
      left join company_sections cs on cs.id = p.section_id
     where p.clinic_id = v_clinic and p.farm_id is null), '[]'::jsonb);
end $$;
revoke all on function public.photo_products() from public, anon;
grant execute on function public.photo_products() to authenticated;

-- ── ٥) الأقسام: قراءةٌ، حفظٌ، أرشفةٌ، ترتيب ───────────────────────────────────
create or replace function public.store_sections_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort', s.sort,
                                        'archived_at', s.archived_at, 'created_at', s.created_at)
                     order by s.archived_at nulls first, s.sort, s.name, s.id)
      from store_sections s where s.clinic_id = v_clinic), '[]'::jsonb);
end $$;
revoke all on function public.store_sections_list() from public, anon;
grant execute on function public.store_sections_list() to authenticated;

-- إنشاءٌ (p_id فارغ) أو تسمية. التوأمُ بـsearch_norm (مرآةُ searchable: «اكل قطط» = «أكل قطط»)
-- على **كلّ** الأقسام ومنها المؤرشف — فالمؤرشفُ يُسترجع ولا يُنشأ ثانيه.
create or replace function public.store_section_save(p_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_key    text;
  v_row    store_sections;
  v_twin   store_sections;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  v_key := search_norm(v_name);
  if v_key = '' or char_length(v_name) > 40 then
    raise exception 'section_bad_name' using hint = 'اسم القسم لازم بين حرف و٤٠ حرفاً.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('storesec:' || v_clinic::text, 0));
  select * into v_twin from store_sections s
   where s.clinic_id = v_clinic and s.id is distinct from p_id and search_norm(s.name) = v_key
   order by s.archived_at nulls first limit 1;
  if found then
    if v_twin.archived_at is not null then
      raise exception 'section_twin_archived' using hint = 'أكو قسم مؤرشف بنفس الاسم — رجّعه من «المؤرشفة» بدل ما تسوي ثاني.';
    end if;
    raise exception 'section_twin' using hint = 'أكو قسم بنفس الاسم — استعمله.';
  end if;
  if p_id is null then
    if (select count(*) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null) >= 60 then
      raise exception 'sections_full' using hint = 'وصلتوا ٦٠ قسماً — أرشفوا قسماً ما تستعملونه.';
    end if;
    insert into store_sections (clinic_id, name, sort, created_by)
    values (v_clinic, v_name,
            coalesce((select max(s.sort) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null), 0) + 1,
            case when platform_acting_clinic() is null then auth.uid() end)
    returning * into v_row;
  else
    select * into v_row from store_sections s where s.id = p_id and s.clinic_id = v_clinic for update;
    if not found then
      raise exception 'section_not_found' using hint = 'القسم ما موجود — حدّث الصفحة.';
    end if;
    if v_row.name is distinct from v_name then
      update store_sections set name = v_name, updated_at = now() where id = p_id and clinic_id = v_clinic
      returning * into v_row;
    end if;
  end if;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'sort', v_row.sort,
                            'archived_at', v_row.archived_at, 'created_at', v_row.created_at);
end $$;
revoke all on function public.store_section_save(uuid, text) from public, anon;
grant execute on function public.store_section_save(uuid, text) to authenticated;

-- أرشفةٌ واسترجاع. المؤرشفُ يختفي من الزبون ومنتجاتُه تبقى مربوطةً به — فالاسترجاعُ يعيده
-- كما كان. والاسترجاعُ يُفحص كالإنشاء (توأمٌ فعّال، والسقف) ويرجع آخرَ القائمة.
create or replace function public.store_section_archive(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_row    store_sections;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  if p_archived is null then
    raise exception 'bad_input' using hint = 'لازم تحدّد: أرشفة أو استرجاع.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('storesec:' || v_clinic::text, 0));
  select * into v_row from store_sections s where s.id = p_id and s.clinic_id = v_clinic for update;
  if not found then
    raise exception 'section_not_found' using hint = 'القسم ما موجود — حدّث الصفحة.';
  end if;
  if p_archived then
    if v_row.archived_at is null then
      update store_sections set archived_at = now(), updated_at = now() where id = p_id;
    end if;
    return;
  end if;
  if v_row.archived_at is null then
    return;
  end if;
  if exists (select 1 from store_sections s where s.clinic_id = v_clinic and s.id <> p_id
              and s.archived_at is null and search_norm(s.name) = search_norm(v_row.name)) then
    raise exception 'section_twin' using hint = 'أكو قسم فعّال بنفس الاسم — سمّ واحداً منهم باسم ثاني أوّلاً.';
  end if;
  if (select count(*) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null) >= 60 then
    raise exception 'sections_full' using hint = 'وصلتوا ٦٠ قسماً — أرشفوا قسماً ما تستعملونه.';
  end if;
  update store_sections
     set archived_at = null, updated_at = now(),
         sort = coalesce((select max(s.sort) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null), 0) + 1
   where id = p_id;
end $$;
revoke all on function public.store_section_archive(uuid, boolean) from public, anon;
grant execute on function public.store_section_archive(uuid, boolean) to authenticated;

-- ترتيبُ الأقسام: القائمةُ الكاملةُ للفعّالة بترتيبها الجديد. قائمةٌ لا تطابق ما بالخادم
-- (جهازٌ ثانٍ أضاف أو أرشف) تُرفض بدل أن ترتّب نصفاً وتترك الباقي على ترتيبٍ قديم.
create or replace function public.store_sections_reorder(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_n      int := coalesce(array_length(p_ids, 1), 0);
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('storesec:' || v_clinic::text, 0));
  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_ids) x)
     or v_n <> (select count(*) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null)
     or v_n <> (select count(*) from store_sections s where s.clinic_id = v_clinic and s.archived_at is null and s.id = any(p_ids)) then
    raise exception 'sections_stale' using hint = 'قائمة الأقسام تغيّرت من جهاز ثاني — حدّث الصفحة وأعد الترتيب.';
  end if;
  update store_sections s set sort = o.ord, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.clinic_id = v_clinic and s.sort is distinct from o.ord::int;
end $$;
revoke all on function public.store_sections_reorder(uuid[]) from public, anon;
grant execute on function public.store_sections_reorder(uuid[]) to authenticated;

-- ── ٦) المنتجاتُ بالأقسام ────────────────────────────────────────────────────
-- إدراجٌ أو نقلٌ أو إخراج (p_section فارغ). المنقولُ يدخل **آخرَ** القسم بترتيب القائمة،
-- وما هو بالقسم أصلاً لا يُلمس (لا ترتيبَ يضيع ولا سطرَ تدقيقٍ فارغ).
create or replace function public.store_assign_section(p_products uuid[], p_section uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_n       int := coalesce(array_length(p_products, 1), 0);
  v_max     int;
  v_changed int;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'changed', 0);
  end if;
  if v_n > 2000 then
    raise exception 'too_many' using hint = 'انقل ٢٠٠٠ منتجٍ بالمرّة كحدٍّ أقصى.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('storesec:' || v_clinic::text, 0));
  if p_section is not null and not exists (
       select 1 from store_sections s where s.id = p_section and s.clinic_id = v_clinic and s.archived_at is null) then
    raise exception 'section_not_found' using hint = 'القسم ما موجود أو مؤرشف — حدّث الصفحة.';
  end if;
  if not exists (select 1 from products p where p.id = any(p_products) and p.clinic_id = v_clinic and p.farm_id is null) then
    raise exception 'product_not_found' using hint = 'المنتج ما موجود بعيادتك — حدّث القائمة.';
  end if;
  v_max := coalesce((select max(p.store_sort) from products p
                      where p.clinic_id = v_clinic and p.farm_id is null and p.store_section_id = p_section), 0);
  update products p
     set store_section_id = p_section,
         store_sort = case when p_section is null then null else v_max + o.ord::int end
    from unnest(p_products) with ordinality as o(id, ord)
   where p.id = o.id and p.clinic_id = v_clinic and p.farm_id is null
     and p.store_section_id is distinct from p_section;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('ok', true, 'changed', v_changed);
end $$;
revoke all on function public.store_assign_section(uuid[], uuid) from public, anon;
grant execute on function public.store_assign_section(uuid[], uuid) to authenticated;

-- ترتيبُ قسمٍ (أو «بلا قسم» حين p_section فارغ): القائمةُ ترتيبُ ما فيها، وما بالقسم خارجها
-- ينزل بعدها بالاسم. قائمةٌ فيها منتجٌ خرج من القسم (جهازٌ ثانٍ نقله) تُرفض كلُّها.
-- ولا يُكتب إلا ما تغيّر رقمُه. و«بلا قسم» = بلا قسمٍ **أصلاً**: منتجاتُ قسمٍ مؤرشف تُعرض تحت
-- «منتجات أخرى» لكنّ ترتيبَها ترتيبُ قسمها — ترقيمُها هنا كان يمحوه فيرجع القسمُ مخلوطاً.
create or replace function public.store_reorder_products(p_section uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_n       int := coalesce(array_length(p_ids, 1), 0);
  v_changed int := 0;
  v_more    int := 0;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  if v_n > 2000 then
    raise exception 'too_many' using hint = 'رتّب ٢٠٠٠ منتجٍ بالمرّة كحدٍّ أقصى.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('storesec:' || v_clinic::text, 0));
  if p_section is not null and not exists (
       select 1 from store_sections s where s.id = p_section and s.clinic_id = v_clinic and s.archived_at is null) then
    raise exception 'section_not_found' using hint = 'القسم ما موجود أو مؤرشف — حدّث الصفحة.';
  end if;
  if v_n <> (select count(distinct x) from unnest(p_ids) x)
     or v_n <> (select count(*) from products p
                 where p.id = any(p_ids) and p.clinic_id = v_clinic and p.farm_id is null
                   and p.store_section_id is not distinct from p_section) then
    raise exception 'order_stale' using hint = 'محتوى القسم تغيّر من جهاز ثاني — حدّث الصفحة وأعد الترتيب.';
  end if;
  update products p set store_sort = o.ord::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id and p.clinic_id = v_clinic and p.farm_id is null and p.store_sort is distinct from o.ord::int;
  get diagnostics v_changed = row_count;
  update products p set store_sort = null
   where p.clinic_id = v_clinic and p.farm_id is null and p.store_sort is not null and not (p.id = any(p_ids))
     and p.store_section_id is not distinct from p_section;
  get diagnostics v_more = row_count;
  return jsonb_build_object('ok', true, 'changed', v_changed + v_more);
end $$;
revoke all on function public.store_reorder_products(uuid, uuid[]) from public, anon;
grant execute on function public.store_reorder_products(uuid, uuid[]) to authenticated;

-- ── ٧) النشرُ بشروطه ──────────────────────────────────────────────────────────
-- مرآتُه `readiness` بـsrc/lib/storeBoard.ts: صورةٌ + سعرٌ موجب + غيرُ منتهٍ (اليومُ ببغداد،
-- كـstore_catalog منذ 0212). المتخطّى يُعدّ مرّةً بأوّل سببٍ ناقص: صورة، ثمّ سعر، ثمّ انتهاء.
-- والإخفاءُ بلا شرط. المنشورُ أصلاً لا يُلمس ولا يُعدّ.
create or replace function public.store_publish(p_ids uuid[], p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid := auth_clinic();
  v_n        int := coalesce(array_length(p_ids, 1), 0);
  v_today    date := (now() at time zone 'Asia/Baghdad')::date;
  v_changed  int := 0;
  v_photo    int := 0;
  v_price    int := 0;
  v_expired  int := 0;
  v_ids      uuid[];
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تنشر منتجات بالمتجر.';
  end if;
  if p_on is null then
    raise exception 'bad_input' using hint = 'لازم تحدّد: نشر أو إخفاء.';
  end if;
  if v_n > 2000 then
    raise exception 'too_many' using hint = 'انشر ٢٠٠٠ منتجٍ بالمرّة كحدٍّ أقصى.';
  end if;
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'changed', 0, 'ids', '[]'::jsonb,
                              'skipped_no_photo', 0, 'skipped_no_price', 0, 'skipped_expired', 0);
  end if;

  -- `ids` = ما تغيّر فعلاً: اللوحةُ ترقّعه وحده بدل أن تخمّن الجاهزيةَ من صفوفٍ قد تكون قديمة.
  if not p_on then
    with u as (
      update products p set store_visible = false
       where p.id = any(p_ids) and p.clinic_id = v_clinic and p.farm_id is null and coalesce(p.store_visible, false)
      returning p.id)
    select coalesce(array_agg(u.id), '{}') into v_ids from u;
    return jsonb_build_object('ok', true, 'changed', cardinality(v_ids), 'ids', to_jsonb(v_ids),
                              'skipped_no_photo', 0, 'skipped_no_price', 0, 'skipped_expired', 0);
  end if;

  select count(*) filter (where nullif(btrim(coalesce(p.image_path, '')), '') is null),
         count(*) filter (where nullif(btrim(coalesce(p.image_path, '')), '') is not null and coalesce(p.sell_price, 0) <= 0),
         count(*) filter (where nullif(btrim(coalesce(p.image_path, '')), '') is not null and coalesce(p.sell_price, 0) > 0
                            and p.expiry_date is not null and p.expiry_date < v_today)
    into v_photo, v_price, v_expired
    from products p
   where p.id = any(p_ids) and p.clinic_id = v_clinic and p.farm_id is null and not coalesce(p.store_visible, false);

  with u as (
    update products p set store_visible = true
     where p.id = any(p_ids) and p.clinic_id = v_clinic and p.farm_id is null and not coalesce(p.store_visible, false)
       and nullif(btrim(coalesce(p.image_path, '')), '') is not null
       and coalesce(p.sell_price, 0) > 0
       and (p.expiry_date is null or p.expiry_date >= v_today)
    returning p.id)
  select coalesce(array_agg(u.id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'changed', cardinality(v_ids), 'ids', to_jsonb(v_ids),
                            'skipped_no_photo', v_photo, 'skipped_no_price', v_price, 'skipped_expired', v_expired);
end $$;
revoke all on function public.store_publish(uuid[], boolean) from public, anon;
grant execute on function public.store_publish(uuid[], boolean) to authenticated;

-- ── ٨) الصورةُ مع وصفها بنداءٍ واحد ──────────────────────────────────────────
-- نفسُ حرّاس set_product_image (الإذن، ومسارُ العيادة أو المكتبة) + وصفٌ يصف **هذه** الصورة:
-- path يطابق، والمصغّرُ بجانبها بمجلّد العيادة باسمها، والأرقامُ أرقام، والحجمُ صغير.
-- وصورةٌ بلا وصف (المكتبة، أو الإزالة) تمسح الوصفَ القديم — وصفٌ يتيمٌ يكذب.
create or replace function public.store_set_image(p_product uuid, p_path text, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_path   text := nullif(btrim(coalesce(p_path, '')), '');
  v_meta   jsonb := case when p_meta is null or jsonb_typeof(p_meta) = 'null' then null else p_meta end;
  v_thumb  text;
  n        int;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not (staff_can('manageProductPhotos') or staff_can('manageStore')) then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تغيّر صور المنتجات.';
  end if;
  -- البادئةُ ثمّ المحارف (قيدُ products_image_path_safe يمسكها أيضاً، وهنا لتلميحٍ عربيّ لا 23514).
  if v_path is not null and (not (v_path like v_clinic::text || '/%' or v_path like 'library/%')
                             or v_path !~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$' or v_path ~ '(^|/)\.\.?(/|$)') then
    raise exception 'bad_image_path' using hint = 'مسار الصورة مو من ملفات العيادة.';
  end if;
  if v_path is null then
    v_meta := null;
  end if;
  if v_meta is not null then
    v_thumb := nullif(v_meta->>'thumb', '');
    if jsonb_typeof(v_meta) <> 'object' or octet_length(v_meta::text) > 1024
       or v_meta->>'path' is distinct from v_path
       or (v_thumb is not null and v_thumb <> regexp_replace(v_path, '\.[A-Za-z0-9]+$', '') || '.thumb.jpg')
       or (v_thumb is not null and v_thumb not like v_clinic::text || '/%')
       or jsonb_typeof(v_meta->'w') is distinct from 'number' or jsonb_typeof(v_meta->'h') is distinct from 'number'
       or jsonb_typeof(v_meta->'bytes') is distinct from 'number'
       or coalesce(v_meta->>'src', '') not in ('camera', 'album', 'library') then
      raise exception 'bad_image_meta' using hint = 'وصف الصورة مو مطابق لها — صوّرها من جديد.';
    end if;
  end if;
  update products p set image_path = v_path, image_meta = v_meta
   where p.id = p_product and p.clinic_id = v_clinic and p.farm_id is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'product_not_found' using hint = 'المنتج ما موجود — يمكن انحذف. حدّث الصفحة.';
  end if;
end $$;
revoke all on function public.store_set_image(uuid, text, jsonb) from public, anon;
grant execute on function public.store_set_image(uuid, text, jsonb) to authenticated;

-- ── ٩) مراجعةُ الأسعار: آخرُ تغييرٍ على كلّ سعرٍ منشور، ومن غيّره ──────────────────
-- المصدران معاً: تعديلُ اليد من سجلّ التدقيق (`__changed.sell_price` = [القديم، الجديد])،
-- والرفعُ بنسبة من سطوره (التدقيقُ يتخطّى سعرَ الرفع داخل معاملته — 0226). تسعون يوماً.
-- والاسمُ من الكادر؛ مشغّلُ المنصّة بلا اسم (بالاتفاق: لا أثرَ له عند العيادة). والمصوّرُ لا يرى
-- أسماءَ زملائه: سياجُه يحجب عنه الكادرَ وسجلَّ التدقيق (0222)، فاسمُ «من غيّر» هنا كان ثغرةً
-- فيه. يرى اسمَه هو وحده.
create or replace function public.store_price_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_photo  boolean := is_photographer();
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  return coalesce((
    with vis as (
      select p.id from products p
       where p.clinic_id = v_clinic and p.farm_id is null and coalesce(p.store_visible, false)
    ), edits as (
      select al.entity_id::uuid as product_id, al.created_at as changed_at,
             case when jsonb_typeof(al.details->'__changed'->'sell_price'->0) = 'number'
                  then (al.details->'__changed'->'sell_price'->>0)::numeric end as old_price,
             case when jsonb_typeof(al.details->'__changed'->'sell_price'->1) = 'number'
                  then (al.details->'__changed'->'sell_price'->>1)::numeric end as new_price,
             al.actor, 'edit'::text as via
        from audit_log al
       where al.clinic_id = v_clinic and al.entity = 'products' and al.action = 'UPDATE'
         and al.created_at > now() - interval '90 days'
         and (al.details->'__changed') ? 'sell_price'
         and al.entity_id in (select v.id::text from vis v)
    ), raises as (
      select l.item_id as product_id, pc.applied_at as changed_at, l.old_price, l.new_price,
             pc.created_by as actor, 'raise'::text as via
        from price_change_lines l join price_changes pc on pc.id = l.change_id
       where l.clinic_id = v_clinic and l.kind = 'product' and l.field = 'sell_price' and l.undone_at is null
         and pc.applied_at > now() - interval '90 days'
         and l.item_id in (select v.id from vis v)
    ), last as (
      select distinct on (u.product_id) u.*
        from (select * from edits union all select * from raises) u
       order by u.product_id, u.changed_at desc
    )
    select jsonb_agg(jsonb_build_object(
             'product_id', last.product_id, 'changed_at', last.changed_at,
             'old_price', last.old_price, 'new_price', last.new_price, 'via', last.via,
             'by_name', case when not v_photo or last.actor = auth.uid()
                             then (select s.name from staff s where s.user_id = last.actor and s.clinic_id = v_clinic limit 1) end))
      from last), '[]'::jsonb);
end $$;
revoke all on function public.store_price_review() from public, anon;
grant execute on function public.store_price_review() to authenticated;

-- ── ١٠) واجهةُ الزبون: الكتلوجُ بأقسامه، والأقسامُ بأعدادها ──────────────────────
-- نفسُ شروط store_catalog حرفاً (منشور، سعرٌ موجب، غيرُ منتهٍ ببغداد، المتجرُ مفعّل) ونفسُ
-- `available`. الترتيبُ: المميّزُ، ثمّ الأقسامُ بترتيب العيادة، ثمّ ترتيبُها اليدويّ، ثمّ الاسم،
-- و**المعرّفُ آخراً** (0182: صفحاتٌ ثابتة — لا يتكرّر منتجٌ ولا يغيب بين صفحتين).
-- والقسمُ المؤرشفُ كلا قسم: منتجاتُه تنزل لآخر المتجر تحت «منتجات أخرى».
create or replace function public.store_catalog2(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean,
               image_path text, featured boolean, section_id uuid, thumb_path text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.image_path,
         coalesce(p.store_featured, false),
         ss.id,
         case when p.image_meta->>'path' = p.image_path then nullif(p.image_meta->>'thumb', '') end
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  left join store_sections ss on ss.id = p.store_section_id and ss.clinic_id = p.clinic_id and ss.archived_at is null
  where sp.slug = lower(trim(p_slug)) and sp.enabled
    and coalesce(p.sell_price, 0) > 0
    and (p.expiry_date is null or p.expiry_date >= (now() at time zone 'Asia/Baghdad')::date)
  order by coalesce(p.store_featured, false) desc, ss.sort nulls last, ss.id nulls last, p.store_sort nulls last, p.name, p.id
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.store_catalog2(text, int, int) from public, anon;
grant execute on function public.store_catalog2(text, int, int) to anon, authenticated;

-- الأقسامُ للزبون **داخل store_front** (لا دالّةٌ ثالثة): الحافةُ تجلبها أصلاً مع أوّل رسم، فالشريطُ
-- يصل مع البذرة بلا رحلة؛ ونفسُ التوقيع (jsonb) فلا drop ولا منحٌ جديد. البدنُ نسخةُ 0183 حرفاً +
-- مفتاحُ `sections`: القسمُ الفعّالُ الذي فيه منشورٌ يُعرض — **بشروط store_catalog2 حرفاً**
-- (منشور، سعرٌ موجب، غيرُ منتهٍ ببغداد) — بعدده، فمجموعُ الأعداد + «منتجات أخرى» = الكتلوج كلُّه.
create or replace function public.store_front(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  sp store_profiles%rowtype;
  v_name text; v_logo text; v_phone text; v_fb text; v_ig text;
  v_sections jsonb;
  v_others   int;
begin
  select * into sp from store_profiles where slug = lower(trim(p_slug)) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  -- اشتراكٌ منتهٍ: شاشةُ القبول محجوبةٌ عند العيادة، فاستقبالُ طلبٍ هنا وعدٌ
  -- لا يفي به أحد. «مغلق» أصدقُ من رفٍّ يبيع ولا أحدَ خلفه.
  if not store_clinic_active(sp.clinic_id) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  select coalesce(nullif(cp.clinic_name, ''), pr.full_name), cp.logo_url,
         pr.phone, nullif(cp.social_facebook, ''), nullif(cp.social_instagram, '')
    into v_name, v_logo, v_phone, v_fb, v_ig
  from profiles pr
  left join clinic_prefs cp on cp.clinic_id = pr.id
  where pr.id = sp.clinic_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'n', x.n) order by x.sort, x.name, x.id), '[]'::jsonb)
    into v_sections
    from (select ss.id, ss.name, ss.sort, count(*)::int as n
            from store_sections ss
            join products p on p.store_section_id = ss.id and p.clinic_id = sp.clinic_id and p.store_visible
           where ss.clinic_id = sp.clinic_id and ss.archived_at is null
             and coalesce(p.sell_price, 0) > 0
             and (p.expiry_date is null or p.expiry_date >= (now() at time zone 'Asia/Baghdad')::date)
           group by ss.id, ss.name, ss.sort) x;
  -- «منتجات أخرى» بعددها من الخادم: الواجهةُ كانت تعرف وجودَها من الصفحات المحمَّلة، والكتلوجُ
  -- يضعها آخراً — فشريحتُها لا تظهر إلا بعد تحميل كلّ شيء. نفسُ الشروط، والقسمُ المؤرشفُ كلا قسم.
  select count(*)::int into v_others
    from products p
    left join store_sections ss on ss.id = p.store_section_id and ss.clinic_id = p.clinic_id and ss.archived_at is null
   where p.clinic_id = sp.clinic_id and p.store_visible and ss.id is null
     and coalesce(p.sell_price, 0) > 0
     and (p.expiry_date is null or p.expiry_date >= (now() at time zone 'Asia/Baghdad')::date);

  return jsonb_build_object(
    'ok', true,
    'name', coalesce(v_name, 'عيادة بيطرية'),
    'logo_url', v_logo,
    'phone', v_phone,
    'whatsapp', coalesce(nullif(sp.whatsapp, ''), v_phone),
    'facebook', v_fb,
    'instagram', v_ig,
    'bio', sp.bio,
    'delivery_fee', sp.delivery_fee,
    'min_order', sp.min_order,
    'sections', v_sections,
    'others', v_others
  );
end;
$$;
revoke all on function public.store_front(text) from public;
grant execute on function public.store_front(text) to anon, authenticated;

-- ── ١٠ب) منتجاتٌ بعينها للزبون: سطورُ السلّة لا تُشال بحكم غياب ─────────────────────────
-- الواجهةُ تصفّح بـoffset فوق ترتيبٍ يغيّره الكادرُ طولَ اليوم (نقلٌ بين الأقسام، «خلّيه الأول»):
-- صفٌّ ينزاح بين صفحتين لا يصل أبداً، فكانت السلّةُ تشيل منتجاً معروضاً بـ«ما عادت متوفّرة».
-- قائمةٌ ناقصةٌ أخطرُ من خطأٍ ظاهر — فالغائبُ يُسأل عنه بمعرّفه قبل أيّ حكم. نفسُ أعمدة
-- store_catalog2 وشروطها حرفاً، وسقفُ ٢٠٠ معرّف.
create or replace function public.store_catalog_ids(p_slug text, p_ids uuid[])
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean,
               image_path text, featured boolean, section_id uuid, thumb_path text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.image_path,
         coalesce(p.store_featured, false),
         ss.id,
         case when p.image_meta->>'path' = p.image_path then nullif(p.image_meta->>'thumb', '') end
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  left join store_sections ss on ss.id = p.store_section_id and ss.clinic_id = p.clinic_id and ss.archived_at is null
  where sp.slug = lower(trim(p_slug)) and sp.enabled
    and p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and coalesce(p.sell_price, 0) > 0
    and (p.expiry_date is null or p.expiry_date >= (now() at time zone 'Asia/Baghdad')::date)
  order by p.id;
$$;
revoke all on function public.store_catalog_ids(text, uuid[]) from public, anon;
grant execute on function public.store_catalog_ids(text, uuid[]) to anon, authenticated;
comment on function public.store_catalog_ids(text, uuid[]) is
  'منتجاتُ المتجر بمعرّفاتها (0229) — بشروط store_catalog2 حرفاً؛ تسألها السلّةُ قبل أن تشيل سطراً لم تصله الصفحات.';

-- ── ١٠ج) رفضُ الإذن بلغة الإذن: setters المتجر بـP0001 لا 42501 ──────────────────────────
-- `describeDbError` يعرض التلميحَ العربيّ لـP0001 وحده، و42501 عنده «جلستك انتهت — سجّل من
-- جديد»: مصوّرٌ سحب المديرُ إذنَه وهو على اللوحة كان يُقال له إن جلسته انتهت. الأجسامُ نسخةُ
-- 0222/0228 حرفاً إلا errcode — ونطاقُ photo_products (`farm_id is null`) للتمييز والوصف كالباقي.
create or replace function public.store_set_featured(p_product uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic(); n int;
begin
  if v_clinic is null then raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.'; end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  update products set store_featured = coalesce(p_on, false) where id = p_product and clinic_id = v_clinic and farm_id is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'product_not_found' using hint = 'المنتج ما موجود — حدّث الصفحة.'; end if;
end $$;
revoke all on function public.store_set_featured(uuid, boolean) from public, anon;
grant execute on function public.store_set_featured(uuid, boolean) to authenticated;

create or replace function public.store_set_desc(p_product uuid, p_desc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic(); n int;
begin
  if v_clinic is null then raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.'; end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  if char_length(coalesce(p_desc, '')) > 2000 then
    raise exception 'desc_too_long' using hint = 'الوصف أطول من ٢٠٠٠ حرف.';
  end if;
  update products set store_desc = nullif(btrim(coalesce(p_desc, '')), '') where id = p_product and clinic_id = v_clinic and farm_id is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'product_not_found' using hint = 'المنتج ما موجود — حدّث الصفحة.'; end if;
end $$;
revoke all on function public.store_set_desc(uuid, text) from public, anon;
grant execute on function public.store_set_desc(uuid, text) to authenticated;

create or replace function public.store_set_price(p_product uuid, p_price numeric, p_expected numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_now    numeric;
  v_new    numeric;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية على المتجر.';
  end if;
  -- سعرُ البيع لم يكتبه قبلها إلا المديرُ والطبيب (products_write، 0051)؛ والقرارُ وسّعه للمصوّر
  -- وحده — لا لاستقبالٍ أو عنايةٍ منحهما المديرُ إذنَ المتجر (تدقيقٌ عدائيّ: كان يمرّ لهما).
  if not (auth_role() in ('manager', 'veterinarian') or is_photographer()) then
    raise exception 'not_authorized' using hint = 'تعديل السعر للمدير والطبيب وموظف التصوير.';
  end if;
  -- صفرٌ ليس سعرَ متجر (store_catalog يخفيه) — وهو ما يكتبه حقلٌ مُسح ثم تُرك. وNaN بالـnumeric
  -- أكبرُ من كلّ رقم، فالسقفُ يمسكه.
  if p_price is null or p_price <= 0 or p_price > 1000000000000 then
    raise exception 'bad_price' using hint = 'السعر لازم أكبر من صفر.';
  end if;
  v_new := round(p_price, 2);
  -- نطاقُ photo_products نفسُه: منتجاتُ العيادة بلا منتجات الحقول. والقفلُ ثم المقارنة:
  -- رفعُ أسعارٍ أو جهازٌ آخر غيّر السعرَ بعد فتح القائمة ⇒ لا يُكتب فوقه بصمت.
  select p.sell_price into v_now from products p
   where p.id = p_product and p.clinic_id = v_clinic and p.farm_id is null
   for update;
  if not found then
    raise exception 'product_not_found' using hint = 'المنتج مو موجود بعيادتك — حدّث القائمة.';
  end if;
  if v_now is distinct from p_expected then
    raise exception 'price_moved'
      using hint = 'السعر تغيّر من جهاز ثاني أو برفع أسعار — حدّث القائمة وشوف السعر الجديد قبل لا تعدّله.';
  end if;
  if v_now is not distinct from v_new then
    return v_new;
  end if;
  update products set sell_price = v_new where id = p_product and clinic_id = v_clinic;
  return v_new;
end $$;
revoke all on function public.store_set_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.store_set_price(uuid, numeric, numeric) to authenticated;

-- ── ١٠د) ملفُّ صورةٍ يشير إليه توأمٌ بسلّة المحذوفات ليس يتيماً ────────────────────────────
-- الدمجُ (0184) يورّث صورةَ المطويّ للأصل، والمطويُّ يُحفظ بلقطته في products_trash ويرجع منها
-- **بنفس المسار** (فكُّ الدمج أو restore_product). واللوحةُ تدعو لإعادة تصوير الصور القديمة —
-- فإعادةُ تصوير الأصل كانت تحذف ملفاً ما زال المطويُّ يشير إليه، ويرجع بصورةٍ مكسورة. السؤالُ
-- صار يشمل السلّة: ما يُسترجع لا يُحذف ملفُّه.
create or replace function public.image_path_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from products where image_path = p_path and clinic_id = auth_clinic())
      or exists (select 1 from products_trash t where t.clinic_id = auth_clinic() and t.row->>'image_path' = p_path)
$$;
revoke all on function public.image_path_in_use(text) from public, anon;
grant execute on function public.image_path_in_use(text) to authenticated;

-- ── ١٠هـ) الواتساب ورابطُ المتجر وتشغيلُه للمدير وحده (قرارُ المالك ٥) ──────────────────────
-- السياسةُ (0095) شرطُ عيادةٍ وحده، وسياجُ المصوّر (0222) يفتح الكتابةَ لمن بيده manageStore —
-- والمصوّرُ بيده منذ 0228. فكان المصوّرُ (أو استقبالٌ منحه المديرُ المتجر) يكتب رقمَه بـ«واتساب
-- استلام الطلبات» فيذهب كلُّ زبونٍ إليه، أو يغيّر الرابطَ فينكسر كلُّ رابطٍ مشترَك. التجميدُ بمحفّزٍ
-- لا بسياسة (درسُ 0159/0162: سياسةٌ تقرأ جدولَها تُسقط كلَّ تحديث)، invoker ويحرس
-- `authenticated` وحده فلا يشدّ على دوالّ المالك. والإدراجُ: upsert يطلق «قبل الإدراج» حتى
-- والصفُّ موجود — فإن وُجد مضى لمحفّز التحديث بقيمه القديمة، وإلا فإنشاءُ المتجر للمدير.
create or replace function public.store_profiles_manager_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if coalesce(auth_role(), '') = 'manager' then return new; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from store_profiles sp where sp.clinic_id = new.clinic_id) then return new; end if;
    raise exception 'store_profile_manager_only'
      using hint = 'رقم الواتساب ورابط المتجر وتشغيله للمدير وحده.';
  end if;
  if new.whatsapp is distinct from old.whatsapp
     or new.slug is distinct from old.slug
     or new.enabled is distinct from old.enabled then
    raise exception 'store_profile_manager_only'
      using hint = 'رقم الواتساب ورابط المتجر وتشغيله للمدير وحده.';
  end if;
  return new;
end $$;
drop trigger if exists store_profiles_manager_guard on public.store_profiles;
create trigger store_profiles_manager_guard before insert or update on public.store_profiles
  for each row execute function public.store_profiles_manager_guard();

-- ── ١١) البوّابة: الأبوابُ الجديدةُ بقائمة المصوّر (الجسمُ نسخةُ 0228 حرفاً + سطرها) ──────
create or replace function public.api_gate()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_path  text;
  v_fn    text;
  v_block boolean := false;
begin
  -- الجداولُ يحرسها السياج؛ البوّابةُ للدوالّ وحدها. هذا الفحصُ لا يرمي، فهو خارج كتلة
  -- الاستثناء — فلا معاملةَ فرعيةً لكلّ طلب GET عاديّ.
  v_path := coalesce(current_setting('request.path', true), '');
  if position('/rpc/' in v_path) = 0 then return; end if;
  -- المقطعُ الأخير كاملاً (لا بادئة)؛ وما لا يُقرأ يمضي لسؤال «مصوّر؟» — فيُرفض له وحده.
  v_fn := substring(v_path from '/rpc/([^/?]+)/?$');
  if v_fn = any(array[
    -- الإقلاع والجلسة (لا elevate_with_pin ولا has_override_pin: الرفعُ ليس للمصوّر)
    'my_workspace','presence_beat','get_or_init_subscription','end_elevation','log_client_event',
    'platform_context','leave_clinic','accept_invite','add_my_role','staff_can','is_photographer',
    -- الصور
    'photo_products','set_product_image','image_library_usage','image_path_in_use',
    -- المتجر (كلُّ واحدةٍ تسأل manageStore بنفسها)
    'store_set_visible','store_set_featured','store_set_desc','store_slug_available','store_front',
    'store_set_price',
    -- 0229: الأقسامُ والترتيبُ والنشرُ بشروطه والصورةُ بوصفها ومراجعةُ الأسعار — وواجهةُ الزبون
    'store_sections_list','store_section_save','store_section_archive','store_sections_reorder',
    'store_assign_section','store_reorder_products','store_publish','store_set_image','store_price_review',
    'store_catalog2','store_catalog_ids'
  ]) then
    return;
  end if;
  begin
    v_block := public.is_photographer();
  exception when others then
    return;   -- البوّابةُ لا تُسقط طلبَ أحدٍ بخطئها هي
  end;
  if v_block then
    raise exception 'photographer_forbidden'
      using errcode = '42501', hint = 'هذي العملية مو من صلاحية موظف التصوير.';
  end if;
end $$;
revoke all on function public.api_gate() from public;
grant execute on function public.api_gate() to anon, authenticated, service_role;

comment on function public.store_publish(uuid[], boolean) is
  'النشرُ بشروطه (0229): صورة + سعر موجب + غير منتهٍ؛ يقول ما تخطّاه بكلّ سبب. الإخفاءُ بلا شرط.';
comment on function public.store_catalog2(text, int, int) is
  'كتلوجُ الزبون بأقسامه (0229): شروطُ store_catalog حرفاً + القسمُ الفعّال ومصغّرُ الصورة، بترتيب العيادة.';
