-- ============================================================================
-- 0098 · رحلة الحيوان داخل العيادة — التتبّع العام للمالك
--
-- المفهوم من متتبّع دومينوز وتطبيق EASE بالمستشفيات: خط زمني بمراحل ثابتة،
-- يفتحه المالك برابط عام برمز بلا تسجيل دخول، والتواصل باتجاه واحد (الطبيب
-- يرسل، المالك يرد بإيموجي فقط).
--
-- قواعد أمنية مبنية هنا لا بالواجهة:
--   · الرمز ٤٩ بت عشوائية، والرابط يموت بعد ٤٨ ساعة من إغلاق الرحلة.
--   · صفحة التتبّع لا تعيد أي معلومة طبية: اسم الحيوان، اسم العيادة، المراحل،
--     ورسائل الطمأنة التي ضغطها الكادر صراحةً — لا تشخيص ولا نتائج ولا أسعار.
--   · سجل الأحداث لا يُعدَّل (لا سياسة UPDATE) — التسلسل هو الحقيقة.
--   · قراءة عامة عبر RPC واحدة بحد معدل بالـIP (نفس عدّاد الستور 0096).
-- ============================================================================

-- 1) الرحلات — رحلة نشطة واحدة لكل حيوان (يفرضها فهرس جزئي).
create table if not exists journeys (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  pet_id       uuid not null references pets(id) on delete cascade,
  kind         text not null check (kind in ('checkup','surgery','grooming','labs','boarding')),
  stage        text not null default 'arrived',
  status       text not null default 'active' check (status in ('active','closed')),
  token        text not null unique,
  started_at   timestamptz not null default now(),
  closed_at    timestamptz,
  last_seen_at timestamptz,
  silent       boolean not null default false,
  created_by   uuid,
  constraint journey_token_len check (char_length(token) between 8 and 24)
);

create unique index if not exists journeys_one_active_idx
  on journeys(pet_id) where status = 'active';
create index if not exists journeys_clinic_idx on journeys(clinic_id, started_at desc);

-- 2) الأحداث — سجل ملحق فقط.
create table if not exists journey_events (
  id              uuid primary key default gen_random_uuid(),
  journey_id      uuid not null references journeys(id) on delete cascade,
  clinic_id       uuid not null,
  kind            text not null check (kind in ('stage','message','photo')),
  stage           text,
  body            text check (char_length(body) <= 500),
  photo           text check (char_length(photo) <= 200000), -- صورة مضغوطة صغيرة
  reaction        text check (reaction in ('❤️','🙏','😍','😢')),
  created_by_name text,
  created_at      timestamptz not null default now()
);

create index if not exists journey_events_journey_idx on journey_events(journey_id, created_at);

-- 3) RLS — كادر العيادة فقط. الأحداث بلا UPDATE (الرد بالإيموجي يمر حصراً
--    عبر الدالة العامة أدناه بصلاحية المالك المعرَّف بالرمز).
alter table journeys enable row level security;
alter table journey_events enable row level security;

drop policy if exists journeys_rw on journeys;
create policy journeys_rw on journeys
  using (clinic_id = auth_clinic()) with check (clinic_id = auth_clinic());

drop policy if exists journey_events_read on journey_events;
create policy journey_events_read on journey_events
  for select using (clinic_id = auth_clinic());
drop policy if exists journey_events_insert on journey_events;
create policy journey_events_insert on journey_events
  for insert with check (clinic_id = auth_clinic());

-- 4) صفحة التتبّع العامة — قراءة واحدة بكل ما تحتاجه الصفحة.
--    تسجّل «شوهد» على الرحلة (فيعرف الطبيب أن المالك اطمأن بلا ما يتصل).
create or replace function public.track_journey(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_ip text;
  v_hits int;
  j journeys%rowtype;
  v_pet text; v_clinic text; v_phone text;
  v_events jsonb;
begin
  -- حد المعدل: نفس عدّاد قراءات الستور (0096) — سقف عالٍ لأن شبكات الموبايل
  -- العراقية خلف CGNAT، والهدف قطع السحب الآلي لا معاقبة أهل بيت يتابعون قطتهم.
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip <> '' then
    insert into store_read_hits as h (ip, bucket, hits)
    values (v_ip, date_trunc('minute', now()), 1)
    on conflict (ip, bucket) do update set hits = h.hits + 1
    returning h.hits into v_hits;
    if v_hits > 300 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  end if;

  select * into j from journeys
   where token = upper(trim(p_token))
     and (status = 'active' or closed_at > now() - interval '48 hours');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select p.name into v_pet from pets p where p.id = j.pet_id;
  select coalesce(nullif(cp.clinic_name, ''), pr.full_name), pr.phone
    into v_clinic, v_phone
  from profiles pr left join clinic_prefs cp on cp.clinic_id = pr.id
  where pr.id = j.clinic_id;

  -- الإغلاق الصامت يخفي الرحلة تماماً كأنها انتهت — الهاتف هو القناة.
  if j.silent then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  update journeys set last_seen_at = now() where id = j.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'stage', e.stage, 'body', e.body,
           'photo', e.photo, 'reaction', e.reaction, 'created_at', e.created_at
         ) order by e.created_at), '[]'::jsonb)
    into v_events
  from journey_events e where e.journey_id = j.id;

  return jsonb_build_object(
    'ok', true,
    'pet_name', coalesce(v_pet, 'حبيبك'),
    'clinic_name', coalesce(v_clinic, 'العيادة'),
    'clinic_phone', v_phone,
    'kind', j.kind, 'stage', j.stage, 'status', j.status,
    'started_at', j.started_at, 'events', v_events
  );
end;
$$;

revoke all on function public.track_journey(text) from public;
grant execute on function public.track_journey(text) to anon, authenticated;

-- 5) رد المالك بإيموجي — الكتابة الوحيدة المتاحة له، على حدث موجود فقط،
--    ومن قائمة مغلقة. آخر رد يغلب.
create or replace function public.react_journey(p_token text, p_event uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_journey uuid;
begin
  if p_emoji not in ('❤️','🙏','😍','😢') then
    return jsonb_build_object('ok', false, 'error', 'bad_emoji');
  end if;
  select id into v_journey from journeys
   where token = upper(trim(p_token)) and silent = false
     and (status = 'active' or closed_at > now() - interval '48 hours');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  update journey_events set reaction = p_emoji
   where id = p_event and journey_id = v_journey and kind in ('message','photo');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.react_journey(text, uuid, text) from public;
grant execute on function public.react_journey(text, uuid, text) to anon, authenticated;
