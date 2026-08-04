-- ============================================================================
-- doctorVet — 0090: قائمة مشاكل المريض (Problem-Oriented Medical Record).
--
-- التشخيص عندنا كان يعيش جوّا الزيارة: تفتح زيارة، تشخّص، تسكّر. فالمرض المزمن
-- ما إله مكان دائم — تلاقيه بزيارة قبل ستة أشهر، ولازم تنبش السجل حتى تعرف
-- إن هالقطة عندها قصور كلوي.
--
-- القائمة هنا مستقلة عن الزيارة: مشكلة تُفتح مرة، وتضل مفتوحة عبر كل الزيارات
-- لحد ما تنحل. وتُقرأ لحظة الوصف — مشكلة كلوية نشطة توقف الـNSAID تلقائياً،
-- بلا ما يتذكّرها الطبيب. راجع src/lib/problems.ts و checkSafety بـ vetFormulary.ts
--
-- معزولة بالعيادة عبر auth_clinic() مثل باقي الجداول. Additive & idempotent.
-- ============================================================================

create table if not exists pet_problems (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references pets(id) on delete cascade,
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  title       text not null,                    -- اسم المشكلة كما يكتبها الطبيب
  /* تصنيف يقرأه محرك الأمان — 'renal' | 'hepatic' | 'cardiac' | 'endocrine' |
     'gi' | 'derm' | 'neuro' | 'repro' | 'other'. نص مفتوح عمداً حتى تصنيف
     جديد ما يحتاج migration. */
  category    text not null default 'other',
  status      text not null default 'active' check (status in ('active', 'resolved')),
  /* المزمن يبقى status='active' — الحل مو نفس الشيء كالسيطرة عليه. */
  chronic     boolean not null default false,
  severity    text check (severity in ('mild', 'moderate', 'severe')),
  onset_date  date,
  notes       text,
  opened_by   text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- استعلام الشاشة: مشاكل هالحيوان، النشطة أول.
create index if not exists pet_problems_pet_idx on pet_problems(pet_id, status, created_at desc);
create index if not exists pet_problems_clinic_idx on pet_problems(clinic_id);

alter table pet_problems enable row level security;

drop policy if exists pet_problems_clinic_all on pet_problems;
create policy pet_problems_clinic_all on pet_problems for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- المربي يشوف مشاكل حيوانه (قراءة فقط) — مثل سياسات القراءة على سجل الحيوان.
drop policy if exists pet_problems_owner_read on pet_problems;
create policy pet_problems_owner_read on pet_problems for select
  using (exists (select 1 from pets p where p.id = pet_problems.pet_id and p.owner_id = auth.uid()));
