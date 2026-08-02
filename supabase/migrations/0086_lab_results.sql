-- ============================================================================
-- doctorVet — 0086: نظام المختبر (سجل التحاليل والفحوصات).
--
-- كل نتيجة تحاليل على سجل الحيوان: رقمية (CBC/كيمياء — قيم مع نطاقها الطبيعي
-- المؤرشف لحظة التسجيل)، أو فحص سريع Snap (إيجابي/سلبي)، أو وصفية (خلايا/زراعة/
-- براز — نص + صورة). النطاق والوحدة ينحفظان مع كل قيمة (jsonb) حتى لا تُعاد
-- قراءة نتيجة قديمة بنطاقات مستقبلية — أجهزة المختبر تختلف والمراجع تتحدث.
-- معزولة بالعيادة عبر auth_clinic() مثل باقي الجداول. Additive & idempotent.
-- ============================================================================

create table if not exists lab_results (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references pets(id) on delete cascade,
  clinic_id    uuid not null references auth.users(id) default auth_clinic(),
  visit_id     uuid,                    -- الطبلة المرتبطة (اختياري، بلا FK صلب)
  panel_id     text not null,           -- 'cbc' | 'chem' | 'renal' | 'snap' | 'custom' | …
  panel_label  text not null,           -- تسمية الباقة لحظة التسجيل
  kind         text not null check (kind in ('numeric', 'snap', 'descriptive')),
  "values"     jsonb,                   -- [{id,label,abbr,value,unit,low,high,flag}] (reserved word — يُقتبس)
  snap_test_id text,                    -- 'parvo' | 'felv' | …
  snap_result  text check (snap_result in ('positive', 'negative')),
  notes        text,
  photo_url    text,                    -- صورة ورقة الجهاز / الشريحة (data URL مضغوطة)
  doctor       text,
  billed       boolean not null default false,  -- انضافت للفاتورة؟
  taken_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists lab_results_pet_idx on lab_results(pet_id, taken_at desc);
create index if not exists lab_results_clinic_idx on lab_results(clinic_id);

alter table lab_results enable row level security;
drop policy if exists lab_results_clinic_all on lab_results;
create policy lab_results_clinic_all on lab_results for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- المربي يشوف تحاليل حيواناته (قراءة فقط) — مثل سياسات القراءة على سجل الحيوان.
drop policy if exists lab_results_owner_read on lab_results;
create policy lab_results_owner_read on lab_results for select
  using (exists (select 1 from pets p where p.id = lab_results.pet_id and p.owner_id = auth.uid()));
