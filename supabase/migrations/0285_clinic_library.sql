-- ============================================================================
-- ٠٢٨٥ — مكتبةُ صورٍ خاصّة لكلّ عيادة، بجانب المكتبة العامّة (قرارُ المالك ٢١/١١)
--
-- بحرفه: «كل عيادة الها مكتبتها الخاصة وايضا المكتبة العامة الي اني اتحكم بيها والكل يشوفها، والمكتبة
-- العامة محد يتحكم بيها بس اني»، والصلاحيةُ داخل العيادة «صلاحية صور المنتجات» (manageProductPhotos:
-- افتراضياً المديرُ والطبيبُ وموظّفُ التصوير، والمديرُ يعطيها ويسحبها).
--
-- فعمودٌ واحد على الجدول نفسِه لا جدولٌ ثانٍ: `clinic_id` فارغٌ = المكتبةُ العامّة (كلُّ صفٍّ قائم، وكلُّ
-- إدراجٍ من لوحة المشغّل القائمة — لا تكتب العمود)، ومعرّفٌ = مكتبةُ تلك العيادة. فالمنتقي والمستويات
-- الأربعة (0284) والاستيرادُ يعملون على الصنفين بشِفرةٍ واحدة.
--
-- السياسات:
--   • القراءة: العامّةُ للكلّ، والخاصّةُ لعيادتها وحدها (`auth_clinic()`) — كانت `using (true)`.
--   • العامّةُ تُكتب للمشغّل وحده كما كانت (0175) **وبشرط أن تبقى عامّة**: سياسةُ المشغّل لا تكتب صفّاً بعيادة.
--   • الخاصّةُ تُكتب لعيادتها بصلاحية صور المنتجات، ومسارُ ملفّها داخل مجلّد العيادة بالمخزن
--     (`<clinic>/…` — سياسةُ 0174 على الملفّ نفسِه)، و`with check` يمنع نقلَ صفٍّ لعيادةٍ أخرى أو للعامّة.
--     والمشغّلُ داخلَ عيادة زبون يعمل كمديرها (0151) — يكتب بمكتبتها كما تكتب هي.
--   • الحذفُ يحذف الصفَّ وحده — الملفُّ يبقى (O4، وسياسةُ 0236 بالمخزن)، فمنتجاتٌ أخذت الصورةَ تبقى بها.
--
-- موظّفُ التصوير (0222): المكتبةُ من «إعدادات القراءة» (`_photographer_read_ok`) فكتابتُها مسيَّجةٌ عنه
-- دائماً. والمالكُ اختار صلاحيةَ الصور وهي له افتراضياً — فسياجُ الكتابة هنا كسياج واجهة المتجر
-- (`store_profiles`): يمرّ المصوّرُ بإذنه، وعلى مكتبة العيادة وحدها. يُسقَط ويُعاد بالاسم نفسِه
-- (`verify_photographer_fence` تقيس الاسم)، والقراءةُ بلا سياجٍ كما كانت.
--
-- والصلاحيةُ تُسأل من دالّةٍ وسيطة (`library_can_write`) لا من `staff_can` مباشرةً: سياسةٌ تنادي دالّةً تمنع حذفَها،
-- وتراجعُ 0222 يحذف `staff_can` (أمسكته الحزمة: «policy … depends on function staff_can»). الوسيطةُ تسألها بـexecute
-- (كـreport_pnl، 0256)، وبلاها — بعد التراجع — المديرُ وحده.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0284 (ولا تعتمد عليها).
-- ============================================================================

alter table public.image_library add column if not exists clinic_id uuid;

-- هل يكتب المنادي مكتبةَ عيادته؟ صلاحيةُ صور المنتجات (0222) بالدور الأساس كما تحسبها staff_can.
create or replace function public.library_can_write()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v using 'manageProductPhotos';
    return coalesce(v, false);
  end if;
  return coalesce(auth_role() = 'manager', false);
end $$;
revoke all on function public.library_can_write() from public, anon;
grant execute on function public.library_can_write() to authenticated;

comment on column public.image_library.clinic_id is
  'فارغ = المكتبةُ العامّة (يكتبها المشغّل وحده)، ومعرّفٌ = مكتبةُ تلك العيادة الخاصّة (0285).';

-- العيادةُ تقرأ مكتبتها بكلّ فتحٍ للمنتقي — فهرسٌ جزئيٌّ للصفوف الخاصّة وحدها (العامّةُ كلُّها null).
create index if not exists image_library_clinic_idx on public.image_library (clinic_id) where clinic_id is not null;

-- ── القراءة ────────────────────────────────────────────────────────────────
drop policy if exists image_library_read on public.image_library;
create policy image_library_read on public.image_library
  for select to authenticated
  using (clinic_id is null or clinic_id = (select auth_clinic()));

-- ── العامّة: للمشغّل وحده، وتبقى عامّة ──────────────────────────────────────
drop policy if exists image_library_insert on public.image_library;
create policy image_library_insert on public.image_library
  for insert to authenticated
  with check (clinic_id is null and (select is_platform_admin()));

drop policy if exists image_library_update on public.image_library;
create policy image_library_update on public.image_library
  for update to authenticated
  using (clinic_id is null and (select is_platform_admin()))
  with check (clinic_id is null and (select is_platform_admin()));

drop policy if exists image_library_delete on public.image_library;
create policy image_library_delete on public.image_library
  for delete to authenticated
  using (clinic_id is null and (select is_platform_admin()));

-- ── الخاصّة: لعيادتها بصلاحية صور المنتجات، وملفُّها بمجلّدها ───────────────
drop policy if exists image_library_clinic_insert on public.image_library;
create policy image_library_clinic_insert on public.image_library
  for insert to authenticated
  with check (clinic_id = (select auth_clinic())
              and split_part(path, '/', 1) = clinic_id::text
              and (select public.library_can_write()));

drop policy if exists image_library_clinic_update on public.image_library;
create policy image_library_clinic_update on public.image_library
  for update to authenticated
  using (clinic_id = (select auth_clinic()) and (select public.library_can_write()))
  with check (clinic_id = (select auth_clinic())
              and split_part(path, '/', 1) = clinic_id::text
              and (select public.library_can_write()));

drop policy if exists image_library_clinic_delete on public.image_library;
create policy image_library_clinic_delete on public.image_library
  for delete to authenticated
  using (clinic_id = (select auth_clinic()) and (select public.library_can_write()));

-- ── سياجُ المصوّر على الكتابة: يمرّ بإذنه على مكتبة العيادة وحدها ──────────────
-- تحت وجود دالّته (كـ0269): تراجعُ 0222 يحذف السياجَ ودالّتَه، فإعادةُ هذه بعده لا تفشل ولا تُرجع سياجاً بلا دالّة.
do $$
declare
  c text := 'not (select public.is_photographer()) or (clinic_id is not null and (select public.library_can_write()))';
begin
  if to_regprocedure('public.is_photographer()') is null then return; end if;
  drop policy if exists photographer_fence_ins on public.image_library;
  execute format('create policy photographer_fence_ins on public.image_library as restrictive for insert to authenticated with check (%s)', c);
  drop policy if exists photographer_fence_upd on public.image_library;
  execute format('create policy photographer_fence_upd on public.image_library as restrictive for update to authenticated using (%s) with check (%s)', c, c);
  drop policy if exists photographer_fence_del on public.image_library;
  execute format('create policy photographer_fence_del on public.image_library as restrictive for delete to authenticated using (%s)', c);
end $$;

comment on table public.image_library is
  'مكتبة صور المنتجات (0175): clinic_id فارغ = العامّة (يكتبها المشغّل، يقرؤها الكلّ)، ومعرّف = مكتبةُ العيادة الخاصّة (0285: تكتبها بصلاحية صور المنتجات، تقرؤها وحدها). path يُنسخ إلى products.image_path عند الاختيار.';
