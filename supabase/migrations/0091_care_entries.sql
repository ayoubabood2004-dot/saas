-- ============================================================================
-- doctorVet — 0091: جدول العلاج الزمني (سوائل + مراقبة + داخل/خارج).
--
-- treatment_entries تغطي الجرعات فقط. باقي ورقة العلاج بالمستشفى — معدّل
-- السوائل، العلامات الحيوية المجدولة، والداخل/الخارج — ما كان إله مكان، فكان
-- ينكتب على ورقة بجنب القفص وينضيع.
--
-- جدول واحد بمميّز kind بدل أربع جداول: الشبكة تنقرأ باستعلام واحد، وإضافة نوع
-- جديد (وزن يومي، نسبة أكل) ما تحتاج migration. راجع src/lib/careSheet.ts
--
-- معزول بالعيادة عبر auth_clinic(). Additive & idempotent.
-- ============================================================================

create table if not exists care_entries (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references pets(id) on delete cascade,
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  visit_id    uuid,                            -- الطبلة المرتبطة (بلا FK صلب)
  day         date not null default current_date,
  "time"      text not null default '',        -- 'HH:MM' — فاضي = بلا وقت محدد
  kind        text not null check (kind in ('fluid', 'vital', 'intake', 'output')),
  label       text not null,                   -- 'رينغر لاكتات' | 'الحرارة' | 'بول'
  value       numeric,                         -- المعدّل أو القراءة أو الحجم
  unit        text not null default '',        -- 'مل/ساعة' | '°م' | 'مل'
  notes       text,
  recorded_by text,
  created_at  timestamptz not null default now()
);

-- استعلام الشبكة: كل قيود هالحيوان بهذا اليوم، مرتّبة بالوقت.
create index if not exists care_entries_pet_day_idx on care_entries(pet_id, day desc, "time");
create index if not exists care_entries_clinic_idx on care_entries(clinic_id);

alter table care_entries enable row level security;

drop policy if exists care_entries_clinic_all on care_entries;
create policy care_entries_clinic_all on care_entries for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

drop policy if exists care_entries_owner_read on care_entries;
create policy care_entries_owner_read on care_entries for select
  using (exists (select 1 from pets p where p.id = care_entries.pet_id and p.owner_id = auth.uid()));
