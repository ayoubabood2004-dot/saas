-- ============================================================================
-- ٠٢٢٧ — تصنيفاتُ السحوبات: التصنيفُ صفٌّ لا نصّ، ولكلّ تصنيفٍ جدولُه (طلبُ المالك، ٨/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- «التصنيف» بالسحوبات خانةُ نصٍّ حرٍّ اختياريّة منذ 0052. والمقيسُ بالإنتاج (٧/١٠):
-- ٣٥٢ سحباً — ٢٧٥ بلا تصنيف، و٦٩ «مرتجع» يكتبها النظامُ نفسُه، وثمانيةٌ فقط كتبتها
-- يدٌ، بثلاث كتاباتٍ لتصنيفين اثنين: «قاصة» ٦ و«قاصه» ١، و«سحب» ١ (أُعيد قياسُه
-- ٨/١٠ — كانت هذه السطورُ تقول «ايجار/إيجار»، وهو مثالُ الحزمة لا الإنتاج). نصٌّ
-- حرٌّ لا يُجمع: كلُّ تاءٍ أو همزةٍ تشقّ المجموعَ جدولين، فالعيادةُ لا تعرف كم صرفت.
--
-- ── القرار ───────────────────────────────────────────────────────────────
-- المالك: كلُّ تصنيفٍ جدولٌ بسحوباته، واختيارُه إلزاميٌّ لكلّ سحبٍ يدويٍّ جديد، والقديمُ
-- بلا تصنيف يُرى بجدول «بدون تصنيف»، والنصوصُ الحرّةُ القائمةُ تصير تصنيفاتٍ وتُربط
-- صفوفُها — **بلا أن يتغيّر نصُّ سحبٍ واحد ولا يُحذف**.
-- • العضويةُ مصدرُها واحد: expenses.category_id. لا مطابقةَ نصٍّ وقتَ القراءة ولا
--   أسماءَ بديلة — وإلا صار للجدول حقيقتان، وأوّلُ تقريرٍ يقرأ إحداهما يُسقط الأخرى.
--   وما يكتبه النظامُ (مرتجع، payroll، payroll_loan، سحب مخزن) جداولُ تلقائيةٌ
--   بنصّها الثابت بالواجهة، خارجَ هذا الجدول، وأسماؤها محجوزة فيه.
-- • لا شيءَ جديدٌ يطلق على إدراج السحوبات: عمودٌ يقبل الفراغ وفهرسٌ ومفتاحٌ مركَّب
--   وربطٌ واحدٌ للقديم. والدوالُّ الخمسُ الكاتبة (الإرجاع، الجرد، القسيمة، السلفة،
--   السحبُ على الراتب) لا تُمسّ.
-- • «إلزاميّ» بالواجهة والمستودع لا بالقاعدة: قيدٌ هنا يُرجع كلَّ إرجاعٍ وموافقةِ
--   جردٍ وقسيمةٍ (لا تكتب تصنيفاً)، ويُسقط ما بطابور الصادر من نسخٍ قديمة إلى
--   المعطّلات. يُقاس بعد أسبوعين بتجميعٍ، وقيدُ الخادم قرارٌ لاحقٌ بكلمة المالك.
-- • التصنيفُ لا يُحذف بل يُؤرشف: لا سياسةَ حذفٍ ولا صلاحيتَه. والمفتاحُ المركَّب
--   (clinic_id, category_id) يمنع سحباً يشير لتصنيف عيادةٍ أخرى حتى من دالّةٍ
--   definer أو superuser — فحصُ المفتاح لا يمرّ من RLS أصلاً.
-- • التوائمُ تُرفض بمحفّزٍ تحت قفلٍ استشاريٍّ للعيادة، لا بفهرسٍ فريدٍ على
--   inv_norm_group (درسُ 0199/0202: فهرسُ التعبير يبيخ حين تُعاد كتابةُ الدالّة).
-- • تعديلُ التصنيف وأرشفتُه يُدقَّقان (audit_all) — ما حسم كلَّ «اختفى» قبلها
--   هو سجلُّ التدقيق. وcreated_by فارغٌ والمشغّلُ داخلٌ (0208).
--
-- ── الربطُ بلا أثر ───────────────────────────────────────────────────────
-- تحديثُ category_id على الصفوف القديمة يطلق محفّزَ التدقيق: سطرُ «مصروف» لكلّ صفٍّ
-- بيوم النشر باسم «النظام» يبقى سنة — الضجيجُ الذي رفضته 0223. فالربطُ داخل كتلةٍ
-- واحدة تطفئ audit_all على expenses ثم تعيده: جملةٌ واحدة، فأيُّ فشلٍ يُرجع الإطفاءَ
-- معه ولا يبقى التدقيقُ مطفأً أبداً؛ والإطفاءُ يأخذ قفلَ SHARE ROW EXCLUSIVE فالكتابةُ
-- المتزامنة تنتظر ولا تمرّ بلا تدقيق. ولا session_replication_role: يطفئ معه
-- محفّزاتِ المفاتيح وحارسَ المخزن. أمّا التصنيفاتُ التي تنشئها هذه الهجرة فتكتب
-- سطرَ إنشاءٍ صادقاً بلا فاعل («النظام»): يقول للعيادة من أين جاءت.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0226 و**قبل** الواجهة: واجهةٌ تسبقها
-- ترسل category_id لعمودٍ غير موجود (PGRST204) وطابورُها ينتهي بالمعطّلات.
-- تراجع: alter table expenses drop constraint expenses_category_fk; drop index
--   expenses_category_id_idx; alter table expenses drop column category_id;
--   drop table expense_categories; drop function _expense_reserved_keys();
--   وأعد audit_kind من 0226. نصُّ كلّ سحبٍ سليمٌ كما كان.
-- ============================================================================

set lock_timeout = '5s';

-- ── الأسماءُ المحجوزة: ما يكتبه النظامُ بنفسه، و«بدون تصنيف» ───────────────
-- مرآتُه بالواجهة RESERVED_RAW (src/lib/expenseCategoryRules.ts)، ويحرس تطابقَ
-- النصّين withdrawals-contract.mjs.
create or replace function public._expense_reserved_keys()
returns text[]
language sql
immutable
set search_path = public
as $$ select array[inv_norm_group('مرتجع'), inv_norm_group('سحب مخزن'), inv_norm_group('payroll'), inv_norm_group('payroll_loan'), inv_norm_group('بدون تصنيف')] $$;
revoke all on function public._expense_reserved_keys() from public, anon;
grant execute on function public._expense_reserved_keys() to authenticated;

-- ── الجدول ────────────────────────────────────────────────────────────────
create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  archived_at timestamptz,
  created_by  uuid,
  -- للتصنيفات المحوَّلة من النصّ: أوّلُ مرّةٍ كُتب فيها النصّ — فالترتيبُ ترتيبُ الاستعمال.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- هدفُ المفتاح المركَّب، وفهرسُه يبدأ بـclinic_id فيخدم السياسةَ ومفتاحَ العيادة.
  constraint expense_categories_clinic_id_key unique (clinic_id, id)
);
comment on table public.expense_categories is
  'تصنيفاتُ السحوبات (0227): لكلّ تصنيفٍ جدولُه بلوحة السحوبات. تُؤرشف ولا تُحذف؛ والتوائمُ والمحجوزُ يرفضها expense_categories_guard.';

-- ── الحارس: الاسمُ، التوأم، السقف، والأعمدةُ المجمَّدة ──────────────────────
-- invoker: يحرس ما تقدر السياسةُ أن تكتبه أصلاً ولا يشدّ أكثر منها؛ والهجرةُ ودوالُّ
-- المالك تمرّ (current_user ليس authenticated). والقفلُ الاستشاريّ يسلسل فحصَ التوأم
-- والسقفَ للعيادة الواحدة: جهازان يضيفان «إيجار» بنفس اللحظة لا يصنعان توأمين.
create or replace function public.expense_categories_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_authn boolean := current_user = 'authenticated';
  v_key   text;
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  v_key := inv_norm_group(new.name);

  if tg_op = 'INSERT' then
    new.created_by := case when platform_acting_clinic() is null then auth.uid() end;
    new.updated_at := now();
    if v_authn then
      new.archived_at := null;
      new.created_at := now();
    end if;
  else
    new.updated_at := now();
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.archived_at is null and new.archived_at is not null then
      new.archived_at := now();
    elsif old.archived_at is not null and new.archived_at is not null then
      new.archived_at := old.archived_at;
    end if;
  end if;

  if not v_authn then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'expense_category_clinic_frozen' using hint = 'التصنيف يبقى بعيادته';
    end if;
  end if;
  if v_key = '' or char_length(new.name) > 40 then
    raise exception 'expense_category_bad_name' using hint = 'اسم التصنيف لازم بين حرف و٤٠ حرفاً';
  end if;
  -- أرشفةٌ أو استرجاعٌ أو تعديلٌ لا يغيّر مفتاحَ الاسم: لا توأمَ جديداً ولا سقف.
  if tg_op = 'UPDATE' then
    if v_key = inv_norm_group(old.name) then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('expcat:' || new.clinic_id::text, 0));
  if v_key = any (_expense_reserved_keys()) then
    raise exception 'expense_category_reserved'
      using hint = 'هذا اسمٌ يكتبه النظام بنفسه (مرتجع، رواتب، سلف، سحب مخزن، بدون تصنيف) — اختر اسماً ثانياً';
  end if;
  if exists (select 1 from expense_categories c
              where c.clinic_id = new.clinic_id and c.id <> new.id and inv_norm_group(c.name) = v_key) then
    raise exception 'expense_category_twin'
      using hint = 'أكو تصنيف بنفس الاسم (يمكن مؤرشف) — استعمله أو رجّعه من المؤرشفة';
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from expense_categories c where c.clinic_id = new.clinic_id) >= 60 then
      raise exception 'expense_categories_full' using hint = 'وصلتوا ٦٠ تصنيفاً — أرشفوا ما لا تستعملونه';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expense_categories_guard on public.expense_categories;
create trigger expense_categories_guard before insert or update on public.expense_categories
  for each row execute function public.expense_categories_guard();

-- ── السياسات: شرطُ ملكيّةٍ وحده (درسُ 0162: لا استعلامَ على الجدول نفسه) ─────
alter table public.expense_categories enable row level security;
drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories
  for select using (clinic_id = (select auth_clinic()));
drop policy if exists expense_categories_insert on public.expense_categories;
create policy expense_categories_insert on public.expense_categories
  for insert with check (clinic_id = (select auth_clinic()) and (select auth_role()) = 'manager');
drop policy if exists expense_categories_update on public.expense_categories;
create policy expense_categories_update on public.expense_categories
  for update using (clinic_id = (select auth_clinic()) and (select auth_role()) = 'manager')
  with check (clinic_id = (select auth_clinic()) and (select auth_role()) = 'manager');
-- لا سياسةَ حذف: الأرشفةُ هي الحذف، وسحوباتُ التصنيف تبقى بجدوله.
revoke all on table public.expense_categories from anon;
revoke delete, truncate on table public.expense_categories from authenticated;
grant select, insert, update on table public.expense_categories to authenticated;
select public.photographer_fence_table('expense_categories');

-- ── التدقيق: إضافةُ التصنيف وتسميتُه وأرشفتُه تُرى بمركز الحركات ─────────────
drop trigger if exists audit_all on public.expense_categories;
create trigger audit_all after insert or update or delete on public.expense_categories
  for each row execute function audit_change();

-- نسخةُ 0226 حرفاً إلا سطرَ المصروفات: expense_categories نوعُه 'expense' كالسحوبات
-- (مرآتُه بـactivityKinds.ts، والحالاتُ بـactivity-cases.json تفحص الاثنين).
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
    when p_entity in ('store_orders','store_profiles') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- ── النصوصُ الحرّة تصير تصنيفات ──────────────────────────────────────────
-- تقرأ السحوبات وتكتب التصنيفات وحدها — وبعد محفّز التدقيق أعلاه، فكلُّ تصنيفٍ ينشأ
-- يكتب سطرَ إنشاءٍ صادقاً. الكتابةُ الأكثرُ استعمالاً تفوز (ثم الأقدم، ثم الأبجديّ)،
-- ونفسُ التطبيع على الطرفين فلا توأمَ يُصنع، والإعادةُ لا تُدرج شيئاً.
with legacy as (
  select clinic_id, btrim(regexp_replace(category, '\s+', ' ', 'g')) as raw, inv_norm_group(category) as k,
         count(*) as n, min(created_at) as first_at
    from public.expenses
   where method <> 'stock' and nullif(btrim(category), '') is not null
   group by 1, 2, 3
), pick as (
  select distinct on (clinic_id, k) * from legacy
   where k <> '' and k <> all (_expense_reserved_keys()) and char_length(raw) <= 40
   order by clinic_id, k, n desc, first_at, raw
)
insert into public.expense_categories (clinic_id, name, created_at)
select p.clinic_id, p.raw, p.first_at from pick p
 where not exists (select 1 from public.expense_categories c
                    where c.clinic_id = p.clinic_id and inv_norm_group(c.name) = p.k);

-- ── العمود ───────────────────────────────────────────────────────────────
alter table public.expenses add column if not exists category_id uuid;
comment on column public.expenses.category_id is
  'تصنيفُ السحب (0227) — مصدرُ العضوية الوحيد بلوحة السحوبات. يقبل الفراغ عمداً: دوالُّ النظام تكتب نصَّها الثابت بلا معرّف، و«إلزاميّ» للسحب اليدويّ بالواجهة. ربطُ القديم جرى بلا سطرِ تدقيق ونصُّه لم يُمسّ.';

-- ── ربطُ القديم: جملةٌ واحدة، النصُّ لا يُمسّ، ولا سطرَ تدقيق ────────────────
do $link$
declare
  v_on boolean;
begin
  if exists (select 1 from public.expenses e
              where e.category_id is null and e.method <> 'stock' and nullif(btrim(e.category), '') is not null
                and inv_norm_group(e.category) <> '' and inv_norm_group(e.category) <> all (_expense_reserved_keys())
                and exists (select 1 from public.expense_categories c
                             where c.clinic_id = e.clinic_id and inv_norm_group(c.name) = inv_norm_group(e.category))) then
    select (tgenabled = 'O') into v_on from pg_trigger
     where tgrelid = 'public.expenses'::regclass and tgname = 'audit_all' and not tgisinternal;
    if coalesce(v_on, false) then
      alter table public.expenses disable trigger audit_all;
    end if;
    update public.expenses e
       set category_id = (select c.id from public.expense_categories c
                           where c.clinic_id = e.clinic_id and inv_norm_group(c.name) = inv_norm_group(e.category)
                           order by c.created_at, c.id limit 1)
     where e.category_id is null and e.method <> 'stock' and nullif(btrim(e.category), '') is not null
       and inv_norm_group(e.category) <> '' and inv_norm_group(e.category) <> all (_expense_reserved_keys())
       and exists (select 1 from public.expense_categories c
                    where c.clinic_id = e.clinic_id and inv_norm_group(c.name) = inv_norm_group(e.category));
    if coalesce(v_on, false) then
      alter table public.expenses enable trigger audit_all;
    end if;
  end if;
end $link$;

-- ── المفتاحُ المركَّب (بعد الربط، فيفحص الربطَ نفسَه) ─────────────────────────
-- NO ACTION وMATCH SIMPLE: الفراغُ يمرّ، وسحبٌ يشير لتصنيف عيادةٍ أخرى يُرفض من أيّ كاتب.
do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'expenses_category_fk' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_category_fk
      foreign key (clinic_id, category_id) references public.expense_categories (clinic_id, id);
  end if;
end $fk$;

create index if not exists expenses_category_id_idx on public.expenses (category_id);
