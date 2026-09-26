-- ============================================================================
-- ٠٢١٨ — قوالبُ الواتساب الخاصة بالعيادة (طلبُ المالك، ٢٦/٩)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- شاشةُ الحملات (ومنها يُرسَل كلُّ تذكير) فيها أربعةُ قوالبَ جاهزة ومربّعُ نصّ. ما
-- تكتبه العيادةُ بصياغتها — عرضٌ خاصّ، تذكيرٌ بأسلوبها، رسالةُ ما بعد العملية — يضيع
-- بعد الإرسال ويُكتب من جديد كلَّ مرّة.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- `wa_templates`: قوالبُ العيادة بعنوانٍ ونصّ، بلا حدٍّ عمليّ (سقفٌ ١٠٠ ضدّ العبث)،
-- **بالقاعدة لا بالجهاز**: يراها كلُّ جهازٍ بالعيادة، ولا تضيع بتبديل المتصفّح.
-- والنصُّ يحمل الرموزَ نفسَها ({{اسم_المالك}} …) فتُصاغ لكلّ زبون.
-- سياساتُها شرطُ ملكيّةٍ وحده (درسُ 0162: لا استعلامَ فرعيّاً على الجدول نفسه).
--
-- تراجع: drop table wa_templates. تُطبَّق بعد 0217. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

create table if not exists public.wa_templates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  title       text not null check (char_length(btrim(title)) between 1 and 60),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  sort        integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists wa_templates_clinic_idx on public.wa_templates (clinic_id, sort, created_at);

alter table public.wa_templates enable row level security;
drop policy if exists wa_templates_select on public.wa_templates;
create policy wa_templates_select on public.wa_templates
  for select using (clinic_id = (select auth_clinic()));
drop policy if exists wa_templates_insert on public.wa_templates;
create policy wa_templates_insert on public.wa_templates
  for insert with check (clinic_id = (select auth_clinic()));
drop policy if exists wa_templates_update on public.wa_templates;
create policy wa_templates_update on public.wa_templates
  for update using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
drop policy if exists wa_templates_delete on public.wa_templates;
create policy wa_templates_delete on public.wa_templates
  for delete using (clinic_id = (select auth_clinic()));
revoke all on table public.wa_templates from anon;
grant select, insert, update, delete on table public.wa_templates to authenticated;
comment on table public.wa_templates is
  'قوالبُ الواتساب الخاصة بالعيادة (0218): عنوانٌ ونصٌّ بالرموز نفسها، يراها كلُّ جهازٍ بالعيادة.';

-- سقفُ ١٠٠ قالبٍ للعيادة، والعيادةُ لا تُبدَّل بالتعديل، و«آخرُ تعديل» يُختم.
-- invoker: يحرس ما تقدر السياسةُ أن تكتبه أصلاً، ولا يشدّ أكثر منها.
create or replace function public.wa_templates_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from wa_templates where clinic_id = new.clinic_id) >= 100 then
      raise exception 'wa_templates_full' using hint = 'وصلتوا ١٠٠ قالب — احذفوا قالباً ما تستعملوه أوّلاً';
    end if;
  else
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'wa_templates_clinic_frozen' using hint = 'القالب يبقى بعيادته';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists wa_templates_guard on public.wa_templates;
create trigger wa_templates_guard before insert or update on public.wa_templates
  for each row execute function public.wa_templates_guard();
