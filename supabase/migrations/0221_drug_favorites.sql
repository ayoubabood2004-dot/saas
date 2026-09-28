-- ============================================================================
-- ٠٢٢١ — أدويةُ الطبيب المفضّلة (طلبُ المالك، ٢٨/٩)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- لكلّ طبيبٍ أدويةٌ يكتبها بكلّ خطة علاج. منتقي الأدوية فيه بابُ «أدويتي»، لكنه
-- **آخرُ عشرةٍ استُعملت على هذا الجهاز** (`vp_recent_drugs`): دواءٌ مفضّلٌ يسقط منه
-- بعد عشرة أدويةٍ أخرى، ويغيب كلّه بجهازٍ ثانٍ أو متصفّحٍ نُظّف. المفضّلةُ قرارُ
-- الطبيب لا أثرُ استعماله — فتُحفظ بالقاعدة وتبقى حتى يشيلها هو.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- `drug_favorites`: صفٌّ لكلّ دواءٍ مفضّل، **للطبيب داخل عيادته** (user_id + clinic_id):
-- طبيبٌ بعيادتين له قائمتان، وزميلُه لا يرى قائمته ولا يمسّها. الاسمُ نصٌّ كما يكتبه
-- المنتقي (خطةُ العلاج تحفظ الدواءَ نصّاً)، وواحدٌ لكلّ اسمٍ بلا اعتبار الحالة.
-- سياساتُها شرطُ ملكيّةٍ وحده (درسُ 0162)، وسقفُ ١٥٠ ضدّ العبث.
--
-- تراجع: drop table drug_favorites. تُطبَّق بعد 0220. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

create table if not exists public.drug_favorites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now()
);
create unique index if not exists drug_favorites_uq
  on public.drug_favorites (user_id, clinic_id, lower(btrim(name)));
-- فهرسٌ لكلّ مفتاحٍ أجنبيّ (db-guard): user_id يغطّيه الفريدُ بأوّل عموده.
create index if not exists drug_favorites_clinic_idx on public.drug_favorites (clinic_id);

alter table public.drug_favorites enable row level security;
drop policy if exists drug_favorites_select on public.drug_favorites;
create policy drug_favorites_select on public.drug_favorites
  for select using (user_id = (select auth.uid()) and clinic_id = (select auth_clinic()));
drop policy if exists drug_favorites_insert on public.drug_favorites;
create policy drug_favorites_insert on public.drug_favorites
  for insert with check (user_id = (select auth.uid()) and clinic_id = (select auth_clinic()));
drop policy if exists drug_favorites_delete on public.drug_favorites;
create policy drug_favorites_delete on public.drug_favorites
  for delete using (user_id = (select auth.uid()) and clinic_id = (select auth_clinic()));
-- لا تحديث: المفضّلةُ تُضاف أو تُشال، فلا عمودَ يُنقل لطبيبٍ أو عيادةٍ أخرى.
revoke all on table public.drug_favorites from anon;
grant select, insert, delete on table public.drug_favorites to authenticated;
comment on table public.drug_favorites is
  'أدوية الطبيب المفضّلة (0221): للطبيب داخل عيادته، تبقى حتى يشيلها — لا آخر عشرة بالجهاز.';

-- سقفُ ١٥٠ للطبيب بعيادته. invoker: يحرس ما تقدر السياسةُ أن تكتبه أصلاً.
create or replace function public.drug_favorites_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  if (select count(*) from drug_favorites where user_id = new.user_id and clinic_id = new.clinic_id) >= 150 then
    raise exception 'drug_favorites_full' using hint = 'وصلت ١٥٠ دواء بالمفضّلة — شيل دواء ما تستعمله أوّلاً.';
  end if;
  return new;
end $$;
drop trigger if exists drug_favorites_guard on public.drug_favorites;
create trigger drug_favorites_guard before insert on public.drug_favorites
  for each row execute function public.drug_favorites_guard();
