-- ============================================================================
-- ٠٢٨٧ — الملاحظةُ الصوتية داخل الزيارة والطبلة والخطة العلاجية
--
-- طلبُ المالك (٢٢/١١): «الدكتور يسجّل بصمة صوتية داخل الملاحظات وتضلّ محفوظة بشكل احترافي». التصميمُ كاملاً
-- ومراجعاتُه: docs/voice-notes-plan.md (§B هذا الملفّ، §H فحصُه بالحزمة، §I استعلاماتُ التحقّق بعد اللصق).
--
-- • visit_voice_notes — صفٌّ لكلّ تسجيل، **بلا مفاتيح أجنبية**: العيادةُ والحيوانُ والزيارةُ مراجعُ رخوة (كـ0261/0263).
--   حذفُ الحيوان مفتوحٌ لكلّ الكادر اليوم، ومفتاحٌ أجنبيّ كان سيأخذ التسجيلاتِ معه — فالتسجيلُ يعيش بعد حيوانه
--   باسمه (pet_name)، ويجده المديرُ بـvoice_orphans().
--   القراءةُ لكادر العيادة بسياسة ملكيّةٍ وحدها (لا شيءَ يقرأ جدولَه — 0162)، والكتابةُ **لا منحَ لها ولا سياسة**:
--   ثلاثُ دوالّ definer تسأل العيادةَ والدورَ بنفسها (درسُ 0145) — voice_note_add / voice_note_void / voice_note_restore.
--   فلا محفّزَ تجميد، ومصيدةُ 0159/0162 لا تقع. والمصوّرُ مسيَّج (photographer_fence_table)، وapi_gate يردّه عن الدوالّ.
-- • الحذفُ طيٌّ («اختفى كأنه ما كان» = حُذف): الصفُّ والملفُّ باقيان، و`history` يحفظ كلَّ حذفٍ وإرجاع (مَن ومتى ولماذا).
--   يحذف صاحبُ التسجيل خلال ٢٤ ساعة والزيارةُ مفتوحة، والمديرُ بأيّ وقت. والمحذوفُ **يسمعه المديرُ وحده** (قرارُ
--   المالك ٢٢/١١)، ويرجعه المديرُ — أو صاحبُ الحذف خلال ٢٤ ساعة (تراجعٌ عن ضغطته).
-- • الملفّاتُ بدلوٍ خاصّ `voice-notes` بمسار <العيادة>/<الحيوان>/<التسجيل>.<m4a|webm|ogg> — لا medical-media (يقرؤه صاحبُ
--   الحيوان، ولا يقبل الصوت). سبعُ سياساتٍ على storage.objects بكتلةٍ محروسة **بلا جملِ هدم** (أدواتُ النشر تحبسها — 0236):
--   الرفعُ لمن يسجّل وبمجلّد عيادته، والقراءةُ لعيادته (والمحذوفُ للمدير)، ولا استبدالَ لملفّ، ولا حذفَ لملفٍّ يشير إليه صفّ
--   (اليتيمُ يحذفه رافعُه وحده). وسياجان مقيِّدان لا يتّكلان على أيّ سياسةٍ متساهلة أخرى على الجدول.
-- • voice_pilot — العياداتُ المسموحُ لها بالتسجيل (الصفُّ الصفريّ = كلُّ العيادات). قرارُ المالك: كلُّ العيادات مرّةً
--   واحدة — الصفُّ يُبذر **بأوّل تطبيقٍ وحده**، فإعادةُ هذه الهجرة لا تفتح ما أطفأه مفتاحُ الإيقاف:
--       delete from public.voice_pilot;   -- إيقافُ التسجيل بكلّ العيادات (السماعُ يبقى)
--       insert into public.voice_pilot (clinic_id) values ('00000000-0000-0000-0000-000000000000');   -- إرجاعُه
-- • المشغّلُ داخل عيادة زبون يسمع ولا يسجّل ولا يحذف ولا يرجع (voice_operator): كتابتُه أثرٌ عندها، وبالاتفاق لا أثرَ له (0151).
-- • **لا تُضِف هذا الجدولَ لحلقات قراءة المالك** (0249:208): صاحبُ الحيوان لا يصل التسجيلاتِ بالنسخة الأولى.
--
-- وaudit_kind: نصُّ 0271 حرفاً وفوقه سطرٌ معلَّم — التسجيلُ وحذفُه وإرجاعُه «ملف طبي» بسجلّ الحركات (بحارس الانجراف:
-- بصمةُ شِفرة 0271 بلا تعليقٍ ولا مسافات). إعادةُ هجرةٍ أقدم تعرّفها (0261، 0271…) تُرجع السطرَ «أخرى» — فتُعاد هذه بعدها.
--
-- تُطبَّق بعد 0285، ولا تعتمد على 0286. إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجعٌ ليّن مفحوصٌ بالحزمة:
-- supabase/tests/rollback_0287_soft.sql (يُطفئ التسجيلَ ويُبقي السماع). ولا تراجعَ هادمٌ على الإنتاج: البياناتُ طبيّة.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) الحارسُ قبل أيّ بناء: audit_kind تُعاد كتابتُها، فنسختُها بالقاعدة لازم نسخةُ 0271 ──────────────
-- (نصُّ 0271 حرفاً وفوقه سطرٌ معلَّمٌ بـ`-- +0287`؛ الحارسُ من 0252.) الرفضُ هنا قبل أيّ جدول، فلا نصفَ هجرة.
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
end $$;
select public._drift_assert('public.audit_kind(text,text,jsonb)', 'c3c2fc42e126499d5e724ae15f6fff5d', '-- +0287');

-- ── ١) الجداول — قبل دوالّ SQL التي تقرؤها (جسمُ دالّة SQL يُفحص لحظةَ إنشائها) ──────────────────────
-- voice_pilot: الإنشاءُ والبذرُ بكتلةٍ واحدة تحت «الجدولُ غائب» — أوّلُ تطبيقٍ يبذر الصفَّ الصفريّ، وكلُّ إعادةٍ تتخطّاها
-- فلا تُرجع ما أطفأه `delete from public.voice_pilot;`.
do $$
begin
  if to_regclass('public.voice_pilot') is null then
    create table if not exists public.voice_pilot (
      clinic_id uuid primary key,              -- '00000000-0000-0000-0000-000000000000' = كلُّ العيادات
      added_at  timestamptz not null default now()
    );
    insert into public.voice_pilot (clinic_id) values ('00000000-0000-0000-0000-000000000000');
  end if;
end $$;
alter table public.voice_pilot enable row level security;
revoke all on table public.voice_pilot from public, anon, authenticated;
comment on table public.voice_pilot is
  'RLS-DENY-ALL-BY-DESIGN — clinics allowed to record voice notes (0287); written by the owner in the SQL editor, read only by voice_can_record().';

create table if not exists public.visit_voice_notes (
  id          uuid primary key,                         -- يولّده الجهاز = مفتاحُ الإعادة
  clinic_id   uuid not null,                            -- رخو (كـ0261)
  pet_id      uuid not null,                            -- رخو: التسجيلُ يعيش بعد حذف حيوانه
  visit_id    uuid not null,                            -- رخو (0261/0263)
  kind        text not null check (kind in ('note','day','plan','closing')),
  day         date,
  path        text not null,
  mime        text not null check (mime in ('audio/mp4','audio/webm','audio/ogg')),
  codecs      text check (codecs is null or codecs ~ '^[a-z0-9.]{1,24}$'),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  bytes       integer not null check (bytes between 1 and 10485760),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null,                     -- وقتُ الجهاز، محصورٌ بنافذة الزيارة
  created_at  timestamptz not null default now(),       -- وقتُ وصوله الخادم
  created_by  uuid,
  doctor_name text check (char_length(doctor_name) <= 120),
  pet_name    text check (char_length(pet_name) <= 120),
  voided_at   timestamptz,
  voided_by   uuid,
  voided_name text check (char_length(voided_name) <= 120),
  void_reason text check (char_length(void_reason) <= 200),
  history     jsonb not null default '[]'::jsonb,       -- يُضاف ولا يُمسح {a,at,by,name,reason}؛ الدوالُّ وحدها تكتبه
  constraint visit_voice_notes_day check ((kind = 'day') = (day is not null)),
  constraint visit_voice_notes_void check ((voided_at is null) = (voided_by is null)
             and (voided_at is not null or (voided_name is null and void_reason is null))),
  constraint visit_voice_notes_history check (case when jsonb_typeof(history) = 'array'
             then jsonb_array_length(history) <= 100 else false end),
  constraint visit_voice_notes_path check (path = clinic_id::text || '/' || pet_id::text || '/' || id::text || '.' ||
             case mime when 'audio/mp4' then 'm4a' when 'audio/webm' then 'webm' else 'ogg' end),
  constraint visit_voice_notes_path_key unique (path)
);
create index if not exists visit_voice_notes_visit  on public.visit_voice_notes (visit_id, created_at);
create index if not exists visit_voice_notes_clinic on public.visit_voice_notes (clinic_id, created_at desc);
comment on table public.visit_voice_notes is
  'الملاحظاتُ الصوتية (0287): تُقرأ لكادر العيادة وتُكتب من voice_note_add/void/restore وحدها. لا مفاتيحَ أجنبية (تعيش بعد حذف الحيوان)، والحذفُ طيٌّ بـhistory. لا تُضف لحلقات قراءة المالك (0249).';

-- ── ٢) المساعدات ─────────────────────────────────────────────────────────────────────────
-- من يسجّل: كادرُ عيادةٍ مسموحٌ لها، بصلاحية «السجلات الطبية» (editMedical: الطبيبُ والمدير افتراضاً)، لا المشغّل.
-- و`is_clinic_staff()` لازمة: staff_can ترجع true لحساب صاحب حيوان (auth_role_base تسقط على «manager» بلا عضوية — 0151،
-- وstaff_can تقبل كلَّ مدير — 0222). وstaff_can تُسأل بـexecute: تراجعُ 0222 يحذفها (كـ0285)، وبلاها المديرُ والطبيب.
create or replace function public.voice_can_record() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  if auth.uid() is null or platform_acting_clinic() is not null or not is_clinic_staff() then return false; end if;
  if not exists (select 1 from public.voice_pilot p
                  where p.clinic_id = auth_clinic() or p.clinic_id = '00000000-0000-0000-0000-000000000000'::uuid) then
    return false;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v using 'editMedical';
    return coalesce(v, false);
  end if;
  return coalesce(auth_role() in ('manager','veterinarian'), false);
end $$;
revoke all on function public.voice_can_record() from public, anon;
grant execute on function public.voice_can_record() to authenticated;   -- سياساتُ الملفّات والواجهةُ تسألها

-- ملفٌّ لا يشير إليه صفّ (رفعٌ بالطريق أو يتيم) — وحده يُحذف.
create or replace function public.voice_object_free(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.visit_voice_notes v where v.path = p_name)
$$;
revoke all on function public.voice_object_free(text) from public, anon;
grant execute on function public.voice_object_free(text) to authenticated;

-- سماعُ الملف: بلا صفّ (يُرفع الآن أو يتيم) أو حيّ ⇒ نعم؛ محذوفٌ ⇒ المديرُ وحده (قرارُ المالك ٢٢/١١ — ولا صاحبُ الحذف).
create or replace function public.voice_object_readable(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select v.voided_at is null
                          or coalesce(auth_role(), '') = 'manager'
                     from public.visit_voice_notes v where v.path = p_name), true)
$$;
revoke all on function public.voice_object_readable(text) from public, anon;
grant execute on function public.voice_object_readable(text) to authenticated;

-- اسمُ الكاتب من الخادم (صفُّ كادره بالعيادة، وإلا اسمُ ملفّه) — لا يُقبل من الجهاز.
create or replace function public._voice_author() returns text
language sql stable security definer set search_path = public as $$
  select left(coalesce(
    (select nullif(btrim(s.name), '') from public.staff s where s.user_id = auth.uid() and s.clinic_id = auth_clinic() order by s.created_at limit 1),
    (select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = auth.uid())), 120)
$$;
revoke all on function public._voice_author() from public, anon, authenticated;

-- ── ٣) الكتّاب — كلُّها definer بمسار، و«clinic_id = v_clinic» بنصّها (فحصٌ ثابت بالحزمة — درسُ 0145) ──────────────
-- الإضافة: الصفُّ بعد الملفّ (الملفُّ بالدلو بحجمه وإلا رفض)، ومعرّفُ الجهاز مفتاحُ إعادة: ردٌّ ضائع ثمّ إعادةٌ = الصفُّ نفسُه.
-- الزيارةُ تُثبّت العيادةَ والحيوان (لا حالتُها: تسجيلٌ سُجّل والزيارةُ مفتوحة يُقبل بعد إغلاقها)، ووقتُ الجهاز يُحصر بنافذتها
-- ولا يُرفض (ساعةٌ منحرفة لا تُضيّع تسجيلاً).
create or replace function public.voice_note_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_id    uuid := nullif(p->>'id', '')::uuid;
  v_pet   uuid := nullif(p->>'pet_id', '')::uuid;
  v_visit uuid := nullif(p->>'visit_id', '')::uuid;
  v_kind  text := coalesce(nullif(p->>'kind', ''), 'note');
  v_mime  text := coalesce(p->>'mime', '');
  v_bytes int  := nullif(p->>'bytes', '')::int;
  v_sha   text := lower(coalesce(p->>'sha256', ''));
  v_codecs text := case when coalesce(p->>'codecs', '') ~ '^[a-z0-9.]{1,24}$' then p->>'codecs' end;   -- مشوَّه ⇒ null
  v_dur   int  := least(greatest(coalesce(nullif(p->>'duration_ms', '')::int, 0), 0), 600000);        -- محصور
  v_at    timestamptz := coalesce(nullif(p->>'recorded_at', '')::timestamptz, now());
  v_opened timestamptz; v_ended timestamptz; v_pet_name text;
  v_path text; v_size bigint; r public.visit_voice_notes;
begin
  if auth.uid() is null or v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'voice_operator' using errcode = '42501', hint = 'المشغّل يسمع الملاحظات الصوتية ولا يسجّل ولا يحذف بعيادة زبون.';
  end if;
  if not public.voice_can_record() then
    raise exception 'voice_forbidden' using errcode = '42501', hint = 'التسجيل الصوتي لمن عنده صلاحية السجلات الطبية (الطبيب والمدير).';
  end if;
  if v_id is null or v_pet is null or v_visit is null or v_bytes is null then
    raise exception 'voice_bad' using errcode = '22023', hint = 'بيانات التسجيل ناقصة.';
  end if;
  -- الزيارةُ تُثبّت العيادة (لا حالتُها)
  select v.opened_at, v.ended_at into v_opened, v_ended
    from public.clinic_visits v where v.id = v_visit and v.clinic_id = v_clinic and v.pet_id = v_pet;
  if not found then
    raise exception 'voice_visit' using errcode = 'P0001', hint = 'الزيارة مو موجودة بعيادتك لهذا الحيوان.';
  end if;
  select left(nullif(btrim(pt.name), ''), 120) into v_pet_name from public.pets pt where pt.id = v_pet and pt.clinic_id = v_clinic;
  -- وقتُ الجهاز داخل نافذة الزيارة — يُحصر ولا يُرفض
  v_at := greatest(v_opened - interval '10 minutes',
                   least(v_at, coalesce(v_ended, now()) + interval '10 minutes', now() + interval '10 minutes'));
  v_path := v_clinic::text || '/' || v_pet::text || '/' || v_id::text || '.'
            || case v_mime when 'audio/mp4' then 'm4a' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' else 'x' end;
  if coalesce(p->>'path', '') <> v_path then
    raise exception 'voice_path' using errcode = '22023', hint = 'مسار الملف مو لهذا التسجيل.';
  end if;
  -- الصفُّ ⇒ الملفّ (postgres يتجاوز RLS بالإنتاج — 0230؛ والحزمةُ تبني قالبَ storage بفحصها)
  if to_regclass('storage.objects') is not null then
    execute 'select coalesce((metadata->>''size'')::bigint, -1) from storage.objects where bucket_id = ''voice-notes'' and name = $1'
      into v_size using v_path;
    if v_size is null then
      raise exception 'voice_object_missing' using errcode = 'P0001', hint = 'الملف الصوتي ما وصل السيرفر بعد.';
    elsif v_size >= 0 and v_size <> v_bytes then
      raise exception 'voice_size' using errcode = 'P0001', hint = 'الملف وصل بحجمٍ غير حجمه — يُعاد رفعه.';
    end if;
  end if;
  insert into public.visit_voice_notes (id, clinic_id, pet_id, visit_id, kind, day, path, mime, codecs,
      duration_ms, bytes, sha256, recorded_at, created_by, doctor_name, pet_name)
  values (v_id, v_clinic, v_pet, v_visit, v_kind, case when v_kind = 'day' then nullif(p->>'day', '')::date end,
      v_path, v_mime, v_codecs, v_dur, v_bytes, v_sha, v_at, auth.uid(), public._voice_author(), v_pet_name)
  on conflict (id) do nothing
  returning * into r;
  if r.id is null then   -- إعادةٌ ضاع ردُّها
    select * into r from public.visit_voice_notes where id = v_id and clinic_id = v_clinic;
    if r.id is null or r.path <> v_path or r.sha256 <> v_sha then
      raise exception 'voice_id_taken' using errcode = '23505', hint = 'معرّف التسجيل مستعمل لملفٍّ ثاني.';
    end if;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.voice_note_add(jsonb) from public, anon;
grant execute on function public.voice_note_add(jsonb) to authenticated;

-- الحذف (طيّ): صاحبُ التسجيل خلال ٢٤ ساعة من وصوله والزيارةُ مفتوحة، والمديرُ بأيّ وقت. المحذوفُ يُرجع كما هو.
create or replace function public.voice_note_void(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
  v_open   boolean;
  v_name   text;
  r public.visit_voice_notes;
begin
  if auth.uid() is null or v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'voice_operator' using errcode = '42501', hint = 'المشغّل يسمع الملاحظات الصوتية ولا يسجّل ولا يحذف بعيادة زبون.';
  end if;
  select * into r from public.visit_voice_notes where id = p_id and clinic_id = v_clinic for update;
  if not found then
    raise exception 'voice_gone' using errcode = 'P0002', hint = 'الملاحظة الصوتية مو موجودة بعيادتك.';
  end if;
  if r.voided_at is not null then return to_jsonb(r); end if;
  select (v.status = 'open') into v_open from public.clinic_visits v where v.id = r.visit_id and v.clinic_id = v_clinic;
  if not (coalesce(auth_role(), '') = 'manager'
          or (r.created_by = auth.uid() and r.created_at > now() - interval '24 hours' and coalesce(v_open, false))) then
    raise exception 'voice_void_forbidden' using errcode = '42501',
      hint = 'حذف تسجيل غيرك للمدير — وتسجيلك تحذفه خلال ٢٤ ساعة والزيارة مفتوحة';
  end if;
  v_name := public._voice_author();
  update public.visit_voice_notes
     set voided_at = now(), voided_by = auth.uid(), voided_name = v_name, void_reason = v_reason,
         history = history || jsonb_build_array(jsonb_build_object('a', 'void', 'at', now(), 'by', auth.uid(), 'name', v_name, 'reason', v_reason))
   where id = p_id and clinic_id = v_clinic
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.voice_note_void(uuid, text) from public, anon;
grant execute on function public.voice_note_void(uuid, text) to authenticated;

-- الإرجاع بنفس المعرّف: المديرُ، أو صاحبُ الحذف خلال ٢٤ ساعة من حذفه (قرارُ المالك). الحيُّ يُرجع كما هو.
create or replace function public.voice_note_restore(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_name   text;
  r public.visit_voice_notes;
begin
  if auth.uid() is null or v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'voice_operator' using errcode = '42501', hint = 'المشغّل يسمع الملاحظات الصوتية ولا يسجّل ولا يحذف بعيادة زبون.';
  end if;
  select * into r from public.visit_voice_notes where id = p_id and clinic_id = v_clinic for update;
  if not found then
    raise exception 'voice_gone' using errcode = 'P0002', hint = 'الملاحظة الصوتية مو موجودة بعيادتك.';
  end if;
  if r.voided_at is null then return to_jsonb(r); end if;
  if not (coalesce(auth_role(), '') = 'manager'
          or (r.voided_by = auth.uid() and r.voided_at > now() - interval '24 hours')) then
    raise exception 'voice_restore_forbidden' using errcode = '42501',
      hint = 'رجوع التسجيل المحذوف للمدير — ومن حذفه يرجّعه خلال ٢٤ ساعة';
  end if;
  v_name := public._voice_author();
  update public.visit_voice_notes
     set voided_at = null, voided_by = null, voided_name = null, void_reason = null,
         history = history || jsonb_build_array(jsonb_build_object('a', 'restore', 'at', now(), 'by', auth.uid(), 'name', v_name))
   where id = p_id and clinic_id = v_clinic
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.voice_note_restore(uuid) from public, anon;
grant execute on function public.voice_note_restore(uuid) to authenticated;

-- تسجيلاتُ حيواناتٍ انحذفت (أرشيفٌ للمدير، سماعٌ فقط) — invoker: RLS تحكم الجدولين. الواجهةُ تقلّبها بـ.range() وتقف عند صفحةٍ فارغة.
create or replace function public.voice_orphans() returns setof public.visit_voice_notes
language sql stable set search_path = public as $$
  select v.* from public.visit_voice_notes v
   where v.clinic_id = auth_clinic()
     and not exists (select 1 from public.pets p where p.id = v.pet_id)
   order by v.created_at desc, v.id
$$;
revoke all on function public.voice_orphans() from public, anon;
grant execute on function public.voice_orphans() to authenticated;

-- سؤالُ «نزلت الهجرة؟» بالمفتاح العامّ: 42501 = موجودة، PGRST202 = غائبة.
create or replace function public.voice_notes_ready() returns boolean
language sql stable set search_path = public as $$ select true $$;
revoke all on function public.voice_notes_ready() from public, anon;
grant execute on function public.voice_notes_ready() to authenticated;

-- ── ٤) القراءة: العيادةُ وحدها (شرطُ ملكيّةٍ وحده — السياسةُ لا تقرأ جدولَها) ────────────────────────────
alter table public.visit_voice_notes enable row level security;
drop policy if exists visit_voice_notes_select on public.visit_voice_notes;
create policy visit_voice_notes_select on public.visit_voice_notes for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.visit_voice_notes from public, anon, authenticated;
grant select on table public.visit_voice_notes to authenticated;
do $$ begin                                   -- تحت وجود دالّته: تراجعُ 0222 يحذفها (كـ0285)
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('visit_voice_notes');
  end if;
end $$;

-- ── ٥) التدقيق (كـ0261): الإدراجُ والحذفُ بالصفّ كاملاً، والحذفُ/الإرجاعُ حين يتغيّر voided_at فعلاً ──────────────
-- قائمةُ الإبقاء (0271) تحمل pet_id وpet_name وkind وrecorded_at وdoctor_name — فسجلُّ الحركات يسمّي الحيوانَ والطبيب.
drop trigger if exists audit_all on public.visit_voice_notes;
create trigger audit_all after insert or delete on public.visit_voice_notes
  for each row execute function audit_change();
drop trigger if exists audit_void on public.visit_voice_notes;
create trigger audit_void after update of voided_at on public.visit_voice_notes
  for each row when (old.voided_at is distinct from new.voided_at) execute function audit_change();

-- ── ٦) سجلُّ الحركات: الملاحظةُ الصوتية «ملف طبي» لا «أخرى» ────────────────────────────────────────
-- نصُّ 0271 حرفاً وفوقه سطرٌ معلَّم (مرآتُه activityKinds.ts، وحالاتُه activity-cases.json تُفحص على الطرفين).
create or replace function public.audit_kind(p_entity text, p_action text, p_details jsonb) returns text
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
      -- 0242: بيعةٌ بيومٍ سابق تُسمّى باسمها — لحظةُ الإدخال بسطر التدقيق، ويومُ البيع بالفاتورة.
      when p_action = 'INSERT' and p_details->>'sale_kind' = 'opening' then 'debt_old'   -- +0271
      when p_action = 'DELETE' and p_details->>'sale_kind' = 'opening' then 'debt_old_delete'   -- +0271
      when p_action = 'INSERT' and nullif(p_details->>'recorded_at', '') is not null then 'sale_backdated'
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_entity = 'invoice_forgiveness' then case
      when p_action = 'UPDATE' then 'debt_forgive_void'
      -- الاستهلاكُ أثرُ مرتجعٍ أو تعديلٍ (وقد يكتبه الاستقبال) — ليس خصماً أعطاه أحد.
      when coalesce(p_details->>'kind', '') = 'consumed' then 'sale_edit'
      else 'debt_forgive' end
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
    when p_entity = 'pet_prescriptions' then 'medical'   -- +0261
    when p_entity = 'visit_voice_notes' then 'medical'   -- +0287
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_categories','store_category_items') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;
revoke all on function public.audit_kind(text, text, jsonb) from public, anon;
grant execute on function public.audit_kind(text, text, jsonb) to authenticated, service_role;

-- ── ٧) الملفّات: دلوٌ خاصّ وسبعُ سياسات ─────────────────────────────────────────────────────────────
-- محروسةٌ بوجود storage (الحزمةُ تبني قالبَه بفحصها)، وبلا جمل هدم (أدواتُ النشر تحبسها — 0236): كلُّ سياسةٍ تُنشأ
-- إن غابت باسمها. تغييرُ شرطِ سياسةٍ قائمة يحتاج هجرةً تُسقطها صراحةً.
--   • القراءة: مجلّدُ عيادة القارئ، والمحذوفُ للمدير (voice_object_readable).
--   • الرفع: مجلّدُ العيادة بمسار <عيادة>/<حيوان>/<تسجيل>.<امتداد> ولمن يسجّل (voice_can_record).
--   • الحذف: اليتيمُ (لا صفَّ يشير إليه) ولرافعه وحده؛ وسياجٌ مقيِّد يُبقي كلَّ ملفٍّ يشير إليه صفّ — أبداً.
--   • لا استبدالَ لملفٍّ صوتيّ (سياجٌ مقيِّد على التحديث).
--   • وسياجا القراءة والرفع المقيِّدان: العزلُ لا يتّكل على أيّ سياسةٍ متساهلةٍ أخرى على storage.objects.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice-notes', 'voice-notes', false, 10485760, array['audio/mp4','audio/webm','audio/ogg'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
  end if;
  if to_regclass('storage.objects') is null then return; end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_read') then
    create policy voice_notes_read on storage.objects for select to authenticated
      using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
             and public.voice_object_readable(name));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_insert') then
    create policy voice_notes_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(m4a|webm|ogg)$'
                  and (select public.voice_can_record()));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_delete') then
    create policy voice_notes_delete on storage.objects for delete to authenticated   -- اليتيمُ لرافعه وحده
      using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth_clinic())::text
             and owner_id = (select auth.uid())::text and public.voice_object_free(name));
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_keep') then
    create policy voice_notes_keep on storage.objects as restrictive for delete to authenticated
      using (case when bucket_id = 'voice-notes' then public.voice_object_free(name) else true end);
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_no_overwrite') then
    create policy voice_notes_no_overwrite on storage.objects as restrictive for update to authenticated
      using (bucket_id <> 'voice-notes') with check (bucket_id <> 'voice-notes');
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_fence_read') then
    create policy voice_notes_fence_read on storage.objects as restrictive for select to authenticated
      using (case when bucket_id = 'voice-notes'
                  then (storage.foldername(name))[1] = (select auth_clinic())::text and public.voice_object_readable(name)
                  else true end);
  end if;
  if not exists (select 1 from pg_policies f where f.schemaname = 'storage' and f.tablename = 'objects' and f.policyname = 'voice_notes_fence_insert') then
    create policy voice_notes_fence_insert on storage.objects as restrictive for insert to authenticated
      with check (case when bucket_id = 'voice-notes'
                       then (storage.foldername(name))[1] = (select auth_clinic())::text
                            and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(m4a|webm|ogg)$'
                            and (select public.voice_can_record())
                       else true end);
  end if;
end $$;
