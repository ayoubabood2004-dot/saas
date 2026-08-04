-- ============================================================================
-- doctorVet — 0087: الجسر الشبكي للمختبر (LAN bridge).
--
-- المشكلة الواقعية: جهاز التحاليل (CBC/كيمياء) بغرفة، والحاسوب الي يشتغل عليه
-- السستم بغرفة ثانية. نريد نتائج الجهاز توصل للسستم تلقائياً عبر الشبكة (LAN
-- أو الإنترنت) بلا ما الطبيب يكتب أي شيء.
--
-- المعمارية:
--   • برنامج «مُستقبِل» صغير (tools/lab-bridge) يشتغل على أي حاسوب قرب الجهاز،
--     يستمع للجهاز (تسلسلي / TCP)، ويرسل كل رسالة خام للسحابة.
--   • lab_device_links: كل جهاز/مُستقبِل مربوط = صف فيه رمز سري (token) هو
--     شهادة المُستقبِل. العيادة تولّد الرمز وتلغيه (RLS على auth_clinic()).
--   • lab_device_inbox: كل رسالة واردة من الجهاز تنحط هنا «جديدة» لين الطبيب
--     يفتح المختبر ويستقبلها على الحيوان الصحيح، أو يتجاهلها.
--   • ingest_device_message(token, raw): دالة SECURITY DEFINER ممنوحة لـ anon —
--     المُستقبِل ما عندة جلسة دخول، فقط الـ anon key + الرمز. الرمز هو الهوية:
--     الدالة تلگي العيادة من الرمز وتحط الرسالة بصندوقها. بلا رمز صالح = رفض.
--
-- Additive & idempotent. القراءة/التفسير يصير داخل السستم بنفس محرك labLink.
-- ============================================================================

-- ---- أجهزة/مُستقبِلات المختبر المربوطة ----
create table if not exists lab_device_links (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) default auth_clinic(),
  name         text not null,               -- «جهاز CBC — غرفة المختبر»
  -- الرمز السري: هوية المُستقبِل. يُولَّد على الخادم (لا يُرسله العميل).
  token        text not null unique
                 default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  revoked      boolean not null default false,
  last_seen_at timestamptz,                 -- آخر رسالة وصلت من هذا الجهاز
  created_at   timestamptz not null default now()
);

create index if not exists lab_device_links_clinic_idx on lab_device_links(clinic_id);
create unique index if not exists lab_device_links_token_idx on lab_device_links(token);

alter table lab_device_links enable row level security;
drop policy if exists lab_device_links_clinic_all on lab_device_links;
create policy lab_device_links_clinic_all on lab_device_links for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- ---- صندوق الوارد: رسائل الأجهزة الخام قبل ما الطبيب يستقبلها ----
create table if not exists lab_device_inbox (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id),
  link_id      uuid references lab_device_links(id) on delete set null,
  device_name  text,                        -- لقطة اسم الجهاز لحظة الاستلام
  raw          text not null,               -- رسالة الجهاز الخام (HL7/ASTM/نص)
  status       text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  received_at  timestamptz not null default now(),
  handled_at   timestamptz
);

create index if not exists lab_device_inbox_clinic_idx on lab_device_inbox(clinic_id, status, received_at desc);

alter table lab_device_inbox enable row level security;
drop policy if exists lab_device_inbox_clinic_all on lab_device_inbox;
create policy lab_device_inbox_clinic_all on lab_device_inbox for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- ---- الاستقبال السحابي الآمن: المُستقبِل يرسل هنا بالرمز فقط ----
-- SECURITY DEFINER: تتجاوز RLS لتحط الصف بعيادة الرمز. الرمز = الشهادة الوحيدة.
create or replace function public.ingest_device_message(p_token text, p_raw text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link   lab_device_links%rowtype;
  v_inbox  uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid device token' using errcode = '28000';
  end if;
  -- حد أعلى لحجم الرسالة — حماية من الإساءة (رسالة تحاليل ما تتجاوز هذا).
  if p_raw is null or length(p_raw) = 0 then
    raise exception 'empty payload' using errcode = '22023';
  end if;
  if length(p_raw) > 200000 then
    raise exception 'payload too large' using errcode = '22023';
  end if;

  select * into v_link from lab_device_links where token = p_token and not revoked;
  if not found then
    raise exception 'invalid device token' using errcode = '28000';
  end if;

  insert into lab_device_inbox (clinic_id, link_id, device_name, raw, status)
  values (v_link.clinic_id, v_link.id, v_link.name, p_raw, 'new')
  returning id into v_inbox;

  update lab_device_links set last_seen_at = now() where id = v_link.id;

  return v_inbox;
end;
$$;

revoke all on function public.ingest_device_message(text, text) from public;
grant execute on function public.ingest_device_message(text, text) to anon, authenticated;
