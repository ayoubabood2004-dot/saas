-- ============================================================================
-- doctorVet — 0092: طلبات التطوير من الدكاترة (صندوق أفكار المنصة).
--
-- المساعد الذكي داخل السستم صار يعرف يجاوب على أسئلة الاستخدام. بس لما الدكتور
-- يسأل عن شيء مو موجود، الجواب الصحيح مو «ما أعرف» — الجواب: «هاي الميزة مو
-- موجودة، أرفعلك طلب بخصوصها». هالجدول هو صندوق تلك الطلبات.
--
-- الدكتور يكتب الطلب من عيادته (معزول بـ auth_clinic() مثل باقي الجداول)،
-- ومشغّل المنصة (is_platform_admin من 0054) يقرأ كل الطلبات عبر كل العيادات
-- ويحدّث حالتها — فيصير تطوير السستم مبني على شنو الدكاترة فعلاً يريدون.
--
-- Additive & idempotent. Apply AFTER 0091.
-- ============================================================================

create table if not exists feature_requests (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) default auth_clinic(),
  clinic_name  text,                               -- لقطة وقت الإرسال حتى يقرأها الأدمن بلا join
  requested_by text,                               -- اسم الدكتور الي طلب
  body         text not null,                      -- نص الطلب كما كتبه
  question     text,                               -- السؤال الأصلي الي ما گدر المساعد يجاوبه (إن وجد)
  source       text not null default 'assistant',  -- 'assistant' | 'manual'
  status       text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  admin_note   text,                               -- رد المشغّل (يظهر للعيادة)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- شاشة الأدمن: الأحدث أول. وشاشة العيادة: طلباتها هي.
create index if not exists feature_requests_created_idx on feature_requests(created_at desc);
create index if not exists feature_requests_clinic_idx on feature_requests(clinic_id, created_at desc);

alter table feature_requests enable row level security;

-- العيادة: ترفع طلباتها وتشوفها (حتى يعرف الدكتور حالة طلبه).
drop policy if exists feature_requests_clinic_insert on feature_requests;
create policy feature_requests_clinic_insert on feature_requests for insert
  with check (clinic_id = auth_clinic());

drop policy if exists feature_requests_clinic_read on feature_requests;
create policy feature_requests_clinic_read on feature_requests for select
  using (clinic_id = auth_clinic() or is_platform_admin());

-- مشغّل المنصة فقط يغيّر الحالة ويكتب الرد.
drop policy if exists feature_requests_admin_update on feature_requests;
create policy feature_requests_admin_update on feature_requests for update
  using (is_platform_admin())
  with check (is_platform_admin());
