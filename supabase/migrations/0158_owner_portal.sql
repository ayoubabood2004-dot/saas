-- ============================================================================
-- ٠١٥٨ — بوّابةُ المالك: الرابطُ العام نفسه يفتح ملفَّ حيوانه
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- رابطُ المتجر `/s/<العيادة>` يعرض رفّاً لا يعرف من يقف أمامه. والمالكُ الذي
-- يفتحه هو نفسه صاحبُ الحيوان الراقد بالداخل، ولا سبيل له أن يسأل «شنو صار
-- بحيواني؟» إلا أن يتّصل بالعيادة فتُقطع على الكادر شغلته. والبوّابةُ الموجودة
-- (`/t/<رمز>` — 0098) تجيب عن لحظةٍ واحدة وتموت بعد ٤٨ ساعة، ولا تفتح ملفاً.
--
-- والحسابُ الكامل (بريد + كلمة مرور) طريقٌ لا يسلكه مراجعٌ عراقيّ: أربعُ خانات
-- ونسيانُ كلمةٍ وبريدٌ ما ينفتح. فالبوابةُ إن كلّفت خطوةً زائدة صارت بلا زوّار.
--
-- ── المفتاح الذي كان موجوداً ولم يُستعمل ─────────────────────────────────
-- العيادةُ تكتب رقمَ المراجع بيدها يوم التسجيل (`pets.owner_phone`)، وشاشةُ
-- السجلات تجمّع الملاك **بالرقم المطبَّع** لا بالحساب. فهويّةُ المالك مكتوبةٌ
-- بالقاعدة من زمان. يبقى أن يُثبت أنه يملك الرقم — لا أن يُنشئ حساباً.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- ولا مصادقةَ Supabase هنا إطلاقاً. البوّابةُ تمشي على نفس نمط 0095/0098
-- المُثبَت: دوالُّ مُعرِّفٍ عامّة، مفتاحُها رمزٌ مبهم، وحدُّ معدّلٍ بالـIP على
-- عدّاد الستور نفسه. وسببُ ذلك عمليّ لا جماليّ: مصادقةَ الهاتف بـSupabase
-- تشترط مزوّدَ رسائل، والمزوّدُ لم يُربط بعد — فلو عُلّقت البوّابةُ عليه لما
-- عملت ولا سطرٌ منها اليوم. أما هنا فكلُّ شيءٍ يعمل، ولا ينقص إلا **إيصالُ
-- الرمز**، وهو موضعٌ واحد يُبدَّل لاحقاً بلا مساسٍ ببقية البناء.
--
-- ── ما لا تُرجعه هذه الهجرة أبداً ────────────────────────────────────────
-- لا تشخيص، ولا نتيجةَ تحليل، ولا سعر، ولا رقمَ قفص، ولا اسمَ طبيب، ولا رصيدَ
-- مخزن. اللقاحاتُ والمواعيدُ والوزنُ وحالةُ الرقود وتقدّمُ جرعات اليوم فقط.
-- وأسماءُ الأدوية محجوبةٌ خلف `show_medical` تشعله العيادةُ بقرارها.
--
-- ── الحجب المقصود ────────────────────────────────────────────────────────
-- `portal_codes` و`portal_flags`: RLS مفعّلٌ **بلا سياسة** عمداً — لا يلمسهما
-- التطبيقُ إطلاقاً، ودوالُّ المُعرِّف وحدها. وعليهما تعليقُ
-- `RLS-DENY-ALL-BY-DESIGN` ليُعرَف القصدُ فلا «يُصلَّح» بسياسةٍ تكشف الرموز.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0151 — ولا تعتمد على 0155/0156،
-- فترتيبُها بينها حرّ.
-- ============================================================================

-- ── ١) إعدادُ البوّابة لكل عيادة ──────────────────────────────────────────
-- مطفأةٌ افتراضياً: عيادةٌ لم تقرّر لا يتغيّر عندها شيء. ومنفصلةٌ عن
-- `store_profiles.enabled` عمداً — عيادةٌ تريد ملفَّ المالك بلا رفِّ بيع
-- مشروعة، والعكس كذلك.
create table if not exists portal_settings (
  clinic_id    uuid primary key references auth.users(id) on delete cascade,
  enabled      boolean not null default false,
  -- أسماءُ الأدوية: مطفأةٌ حتى تقرّر العيادةُ إظهارها. التقدّمُ (٣ من ٥) يظهر
  -- بالحالتين — هو ما يطمئن المالك، والاسمُ تفصيلٌ سريريّ.
  show_medical boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table portal_settings enable row level security;
drop policy if exists portal_settings_clinic_all on portal_settings;
create policy portal_settings_clinic_all on portal_settings for all
  using      (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- ── ٢) الرموز المعلّقة ────────────────────────────────────────────────────
-- رمزٌ حيٌّ واحد لكل (عيادة، رقم): طلبٌ جديد يستبدل القديم فلا يتراكم طابور
-- رموزٍ صالحة. ولا يُخزَّن الرمزُ نصّاً — bcrypt، كما هاشُ رمز المدير.
create table if not exists portal_codes (
  clinic_id   uuid not null references auth.users(id) on delete cascade,
  phone_key   text not null,
  code_hash   text not null,
  attempts    int  not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (clinic_id, phone_key)
);

alter table portal_codes enable row level security;
comment on table portal_codes is
  'RLS-DENY-ALL-BY-DESIGN — هاشاتُ رموز دخول المُلّاك. سياسةُ قراءةٍ هنا تكشف '
  'نافذةَ تخمينٍ على رموزٍ حيّة، وسياسةُ كتابةٍ تسمح بزرع رمزٍ معروف. '
  'portal_request_code() و portal_verify_code() وحدهما تلمسانه.';

-- ── ٣) الجلسات ───────────────────────────────────────────────────────────
-- الرمزُ المُسلَّم للمتصفّح ١٢٨ بت عشوائية، ولا يُخزَّن: يُحفظ هاشُه (sha256).
-- فتسريبُ الجدول لا يمنح جلسةً واحدة. والعيادةُ ترى جلساتِها وتُبطلها.
create table if not exists portal_sessions (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  phone_key    text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists portal_sessions_clinic_idx
  on portal_sessions(clinic_id, created_at desc);

alter table portal_sessions enable row level security;
drop policy if exists portal_sessions_clinic_read on portal_sessions;
create policy portal_sessions_clinic_read on portal_sessions for select
  using (clinic_id = auth_clinic());
-- الإبطالُ تعديلٌ مسموح؛ الإنشاءُ لا — الجلسةُ تُولد من دالّة التحقّق وحدها.
drop policy if exists portal_sessions_clinic_revoke on portal_sessions;
create policy portal_sessions_clinic_revoke on portal_sessions for update
  using      (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- ── ٤) سجلُّ المحاولات ────────────────────────────────────────────────────
-- تراه العيادةُ فتعرف من دخل ومتى، ومنه تُمسك حالةَ «رقمٌ كُتب غلط»: دخولٌ
-- ناجح لرقمٍ ينكره صاحبُه. وهو للعيادة وحدها — لا يخرج للمالك.
create table if not exists portal_login_log (
  id         bigserial primary key,
  clinic_id  uuid not null references auth.users(id) on delete cascade,
  phone_key  text not null,
  outcome    text not null check (outcome in
               ('sent','verified','bad_code','expired','too_many','no_pets')),
  ip         text,
  at         timestamptz not null default now()
);
create index if not exists portal_login_log_clinic_idx
  on portal_login_log(clinic_id, at desc);

alter table portal_login_log enable row level security;
drop policy if exists portal_login_log_clinic_read on portal_login_log;
create policy portal_login_log_clinic_read on portal_login_log for select
  using (clinic_id = auth_clinic());

-- ── ٥) رايةُ التجربة — للمنصّة وحدها ─────────────────────────────────────
-- صفٌّ واحد. حين تُشعَل يرجع `portal_request_code` الرمزَ بجسم الرد ليُعرض على
-- الشاشة — فيُبنى التدفّقُ كاملاً ويُجرَّب قبل أن يوجد مزوّدُ رسائل.
--
-- وهي **بيد المنصّة لا العيادة** عمداً: لو ملكتها العيادةُ لأشعلتها ظنّاً أنها
-- «تسهيل»، فصار كلُّ من يعرف رقمَ مراجعٍ يفتح ملفَّه. صفٌّ واحد للمنصّة كلّها
-- يعني قراراً واحداً واعياً، ويعني أن إطفاءها يوم الإطلاق إطفاءٌ للجميع.
create table if not exists portal_flags (
  only_row  boolean primary key default true check (only_row),
  test_mode boolean not null default false
);
insert into portal_flags (only_row, test_mode) values (true, false)
  on conflict (only_row) do nothing;

alter table portal_flags enable row level security;
comment on table portal_flags is
  'RLS-DENY-ALL-BY-DESIGN — رايةُ وضع التجربة (إظهارُ الرمز على الشاشة). '
  'سياسةُ كتابةٍ هنا تعني أن يشعلها غيرُ المنصّة فتسقط حمايةُ البوّابة كلُّها. '
  'portal_set_test_mode() تكتبها بشرط is_platform_admin()، والدوالُّ تقرأها.';

create or replace function public.portal_set_test_mode(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  update portal_flags set test_mode = coalesce(p_on, false) where only_row;
  return coalesce(p_on, false);
end;
$$;
revoke all on function public.portal_set_test_mode(boolean) from public, anon;
grant execute on function public.portal_set_test_mode(boolean) to authenticated;

-- ============================================================================
-- أدواتٌ داخلية
-- ============================================================================

-- حدُّ المعدّل: نفس عدّاد الستور (0096). غيابُ ترويسة الوكيل (تشغيلٌ محليّ)
-- يعطّله بأمان بدل أن يقفل الباب.
create or replace function public.portal_rate_ok()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_hits int;
begin
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip = '' then return true; end if;
  insert into store_read_hits as h (ip, bucket, hits)
  values (v_ip, date_trunc('minute', now()), 1)
  on conflict (ip, bucket) do update set hits = h.hits + 1
  returning h.hits into v_hits;
  if random() < 0.01 then
    delete from store_read_hits where store_read_hits.bucket < now() - interval '15 minutes';
  end if;
  return v_hits <= 300;
end;
$$;
revoke all on function public.portal_rate_ok() from public, anon, authenticated;

-- «اليوم» بتوقيت العيادة لا بتوقيت الخادم. قاعدةُ Supabase تعمل بـUTC، فـ
-- `current_date` يبقى على أمسِ بغداد من التاسعة مساءً حتى منتصف الليل — ثلاثُ
-- ساعاتٍ كلَّ ليلة كانت البوّابةُ ستعرض فيها جرعاتِ اليوم الفائت وتقول للمالك
-- إن جرعةَ الليلة لم تُعطَ بعد. والواجهةُ تكتب `day` بيوم الجهاز المحلّي
-- (`localISO`)، فالمقارنةُ لازم تكون بيومٍ محلّيٍّ مثله.
create or replace function public.portal_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone 'Asia/Baghdad')::date;
$$;
revoke all on function public.portal_today() from public, anon, authenticated;

create or replace function public.portal_client_ip()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
$$;
revoke all on function public.portal_client_ip() from public, anon, authenticated;

-- العيادةُ خلف الرابط. ترجع null إن لم يكن للرابط عيادةٌ أو كانت البوّابةُ مطفأة.
create or replace function public.portal_clinic_of(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.clinic_id
  from store_profiles sp
  join portal_settings ps on ps.clinic_id = sp.clinic_id and ps.enabled
  where sp.slug = lower(trim(p_slug));
$$;
revoke all on function public.portal_clinic_of(text) from public, anon, authenticated;

-- الجلسةُ خلف الرمز — الحيّةُ غيرُ المُبطَلة وحدها.
create or replace function public.portal_session_of(p_token text)
returns portal_sessions
language sql
stable
security definer
-- `extensions` بالمسار مقصود: pgcrypto عند Supabase يسكن مخطّط `extensions`
-- لا `public`، و`set search_path = public` وحدها تُسقط `digest` و`crypt`
-- و`gen_salt` بخطأ «الدالّة غير موجودة». وذِكرُ المخطّطين معاً يعمل بالحالتين:
-- عند Supabase تُلقى بـ`extensions`، وبعنقود الفحص المحليّ حيث تُركَّب pgcrypto
-- بـ`public` تُلقى هناك — والمخطّطُ الغائب من المسار يُتجاهل بلا خطأ. أما
-- التأهيلُ الصريح `extensions.digest` فيكسر الفحص المحليّ.
set search_path = public, extensions
as $$
  select s.* from portal_sessions s
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now();
$$;
revoke all on function public.portal_session_of(text) from public, anon, authenticated;

-- ============================================================================
-- الدوالُّ العامّة
-- ============================================================================

-- ── طلبُ رمز ─────────────────────────────────────────────────────────────
-- ترجع `ok:true` **دائماً** حين يكون الرابطُ صحيحاً — سواء كان الرقمُ مسجّلاً
-- عند العيادة أو لا. وهذا مقصود: ردٌّ يفرّق بينهما يحوّل الصفحةَ إلى أداةٍ
-- تكشف من هو زبونُ العيادة ومن ليس، بلا أن يملك السائلُ شيئاً.
create or replace function public.portal_request_code(p_slug text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions   -- pgcrypto: انظر الشرح عند portal_session_of
volatile
as $$
declare
  v_clinic uuid;
  v_key    text;
  v_pets   int;
  v_recent int;
  v_code   text;
  v_test   boolean;
begin
  if not portal_rate_ok() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_clinic := portal_clinic_of(p_slug);
  if v_clinic is null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  v_key := phone_key(p_phone);
  if v_key is null or length(v_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;

  -- سقفٌ لكل رقم: خمسةُ طلباتٍ بالساعة. يمنع إغراقَ مراجعٍ برسائل من طرفٍ
  -- يعرف رقمه، ويمنع حرقَ حصّة الرسائل. ويُحسب قبل أيّ عمل.
  select count(*) into v_recent from portal_login_log
   where clinic_id = v_clinic and phone_key = v_key
     and outcome = 'sent' and at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', true, 'throttled', true);
  end if;

  select count(*) into v_pets from pets p
   where p.clinic_id = v_clinic
     and phone_key(p.owner_phone) = v_key
     and coalesce(p.deceased, false) = false;

  if v_pets = 0 then
    -- لا رمزَ ولا صفَّ رمز — والردُّ نفسُه. السجلُّ وحده يعرف، وهو للعيادة.
    insert into portal_login_log (clinic_id, phone_key, outcome, ip)
    values (v_clinic, v_key, 'no_pets', portal_client_ip());
    return jsonb_build_object('ok', true);
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into portal_codes (clinic_id, phone_key, code_hash, attempts, expires_at)
  values (v_clinic, v_key, crypt(v_code, gen_salt('bf')), 0, now() + interval '10 minutes')
  on conflict (clinic_id, phone_key) do update
    set code_hash = excluded.code_hash,
        attempts = 0,
        expires_at = excluded.expires_at,
        created_at = now();

  insert into portal_login_log (clinic_id, phone_key, outcome, ip)
  values (v_clinic, v_key, 'sent', portal_client_ip());

  select test_mode into v_test from portal_flags where only_row;

  -- الإيصالُ الحقيقي يُركَّب هنا لاحقاً (wa-send). واليومَ: وضعُ التجربة وحده
  -- يُخرج الرمز، ومطفأً لا يخرج شيء — فالبوّابةُ آمنةٌ بالإنتاج قبل المزوّد.
  if coalesce(v_test, false) then
    return jsonb_build_object('ok', true, 'test_code', v_code);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.portal_request_code(text, text) from public;
grant execute on function public.portal_request_code(text, text) to anon, authenticated;

-- ── التحقّقُ من الرمز ────────────────────────────────────────────────────
-- «غيرُ موجود» و«غلط» يرجعان الردَّ نفسه: التفريقُ بينهما يقول للمخمِّن إن
-- الرقمَ مسجَّل. وخمسُ محاولاتٍ ثم يُحرق الرمز — التخمينُ الأعمى على ستّ خانات
-- يحتاج مئاتِ الألوف، والسقفُ يقطعه من أوّله.
create or replace function public.portal_verify_code(p_slug text, p_phone text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions   -- pgcrypto: انظر الشرح عند portal_session_of
volatile
as $$
declare
  v_clinic uuid;
  v_key    text;
  c        portal_codes%rowtype;
  v_token  text;
  v_exp    timestamptz;
begin
  if not portal_rate_ok() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_clinic := portal_clinic_of(p_slug);
  if v_clinic is null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  v_key := phone_key(p_phone);
  if v_key is null or length(v_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  select * into c from portal_codes
   where clinic_id = v_clinic and phone_key = v_key;

  if not found or c.expires_at <= now() then
    delete from portal_codes where clinic_id = v_clinic and phone_key = v_key;
    insert into portal_login_log (clinic_id, phone_key, outcome, ip)
    values (v_clinic, v_key, 'expired', portal_client_ip());
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  if c.attempts >= 5 then
    delete from portal_codes where clinic_id = v_clinic and phone_key = v_key;
    insert into portal_login_log (clinic_id, phone_key, outcome, ip)
    values (v_clinic, v_key, 'too_many', portal_client_ip());
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if c.code_hash <> crypt(coalesce(p_code, ''), c.code_hash) then
    update portal_codes set attempts = attempts + 1
     where clinic_id = v_clinic and phone_key = v_key;
    insert into portal_login_log (clinic_id, phone_key, outcome, ip)
    values (v_clinic, v_key, 'bad_code', portal_client_ip());
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  -- نجح: الرمزُ يُستهلك فوراً فلا يُعاد استعماله.
  delete from portal_codes where clinic_id = v_clinic and phone_key = v_key;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_exp   := now() + interval '60 days';

  insert into portal_sessions (clinic_id, phone_key, token_hash, expires_at, last_seen_at)
  values (v_clinic, v_key, encode(digest(v_token, 'sha256'), 'hex'), v_exp, now());

  insert into portal_login_log (clinic_id, phone_key, outcome, ip)
  values (v_clinic, v_key, 'verified', portal_client_ip());

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_exp);
end;
$$;
revoke all on function public.portal_verify_code(text, text, text) from public;
grant execute on function public.portal_verify_code(text, text, text) to anon, authenticated;

-- ── الصفحةُ الأولى: هويّةُ العيادة + حيواناتُ صاحب الرقم ─────────────────
-- ومحصورةٌ بعيادةِ الرابط وحدها: المالكُ فتح رابطَ عيادةٍ بعينها، فيتوقّع
-- ملفَّه عندها — لا كشفَ حسابٍ بكلّ عيادةٍ زارها بعمره.
create or replace function public.portal_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  s        portal_sessions%rowtype;
  v_name   text; v_logo text; v_phone text; v_wa text; v_slug text;
  v_show   boolean;
  v_pets   jsonb;
begin
  if not portal_rate_ok() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  s := portal_session_of(p_token);
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select coalesce(nullif(cp.clinic_name, ''), pr.full_name), cp.logo_url, pr.phone
    into v_name, v_logo, v_phone
  from profiles pr left join clinic_prefs cp on cp.clinic_id = pr.id
  where pr.id = s.clinic_id;

  select sp.slug, coalesce(nullif(sp.whatsapp, ''), v_phone)
    into v_slug, v_wa
  from store_profiles sp where sp.clinic_id = s.clinic_id;

  select coalesce(ps.show_medical, false) into v_show
  from portal_settings ps where ps.clinic_id = s.clinic_id;

  select coalesce(jsonb_agg(x.row order by x.name), '[]'::jsonb) into v_pets
  from (
    select p.name,
           jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'species', p.species::text,
             'breed', p.breed,
             'sex', p.sex::text,
             'dob', p.dob,
             'photo_url', p.photo_url,
             'weight_kg', p.current_weight_kg,
             -- حالةُ الرقود: أهمُّ سطرٍ يبحث عنه المالك.
             'admission', (
               select jsonb_build_object('kind', a.kind::text, 'since', a.admitted_on)
               from admissions a
               where a.pet_id = p.id and a.status = 'active'
               order by a.admitted_on desc limit 1
             ),
             -- المرحلةُ الحيّة إن كانت هناك رحلةٌ مفتوحة وغيرُ صامتة (0098).
             -- النوعُ يخرج مع المرحلة لأن تسميتها تُقرأ من كتلوك الرحلات بالواجهة
             -- (`journeyStageDef(kind, stage)`) — والمرحلةُ وحدها لا تكفي لأن
             -- المعرّفات تتكرّر بين الأنواع بتسمياتٍ مختلفة.
             'journey', (
               select jsonb_build_object('kind', j.kind, 'stage', j.stage)
               from journeys j
               where j.pet_id = p.id and j.status = 'active' and not j.silent
               limit 1
             ),
             'next_vaccine', (
               select jsonb_build_object('name', v.name, 'due_date', v.due_date)
               from vaccinations v
               where v.pet_id = p.id and v.due_date is not null
                 and v.administered_at is null
               order by v.due_date limit 1
             ),
             'today', (
               select jsonb_build_object(
                        'total', count(*),
                        'given', count(*) filter (where te.administered_at is not null))
               from treatment_entries te
               where te.pet_id = p.id and te.day = portal_today()
             )
           ) as row
    from pets p
    where p.clinic_id = s.clinic_id
      and phone_key(p.owner_phone) = s.phone_key
      and coalesce(p.deceased, false) = false
  ) x;

  return jsonb_build_object(
    'ok', true,
    'clinic', jsonb_build_object(
      -- فارغٌ لا اسمَ افتراضيّ: الكلمةُ البديلة تخصّ لغةَ الواجهة، والقاعدةُ
      -- لا تعرف بأي لغةٍ يقرأ صاحبُ الشاشة.
      'name', coalesce(v_name, ''),
      'logo_url', v_logo,
      'phone', v_phone,
      'whatsapp', v_wa,
      'slug', v_slug),
    'show_medical', coalesce(v_show, false),
    'pets', v_pets
  );
end;
$$;
revoke all on function public.portal_me(text) from public;
grant execute on function public.portal_me(text) to anon, authenticated;

-- ── ملفُّ حيوانٍ واحد ────────────────────────────────────────────────────
create or replace function public.portal_pet(p_token text, p_pet uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  s      portal_sessions%rowtype;
  p      pets%rowtype;
  v_show boolean;
begin
  if not portal_rate_ok() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  s := portal_session_of(p_token);
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  -- الملكيةُ تُفحص بالشرطين معاً: عيادةُ الجلسة **و** رقمُها. حيوانٌ نُقل
  -- لمالكٍ آخر أو لعيادةٍ أخرى يخرج من يد هذه الجلسة باللحظة نفسها.
  select * into p from pets
   where id = p_pet
     and clinic_id = s.clinic_id
     and phone_key(owner_phone) = s.phone_key
     and coalesce(deceased, false) = false;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(ps.show_medical, false) into v_show
  from portal_settings ps where ps.clinic_id = s.clinic_id;
  v_show := coalesce(v_show, false);

  return jsonb_build_object(
    'ok', true,
    'pet', jsonb_build_object(
      'id', p.id, 'name', p.name, 'species', p.species::text, 'breed', p.breed,
      'sex', p.sex::text, 'dob', p.dob, 'color', p.color, 'photo_url', p.photo_url,
      'weight_kg', p.current_weight_kg, 'serial', p.serial),

    'admission', (
      select jsonb_build_object('kind', a.kind::text, 'since', a.admitted_on, 'reason', a.reason)
      from admissions a
      where a.pet_id = p.id and a.status = 'active'
      order by a.admitted_on desc limit 1),

    'journey', (
      select jsonb_build_object('kind', j.kind, 'stage', j.stage)
      from journeys j
      where j.pet_id = p.id and j.status = 'active' and not j.silent limit 1),

    -- جرعاتُ اليوم: الاسمُ خلف الراية، والوقتُ وحالةُ الإعطاء دائماً.
    'today', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', te.id,
               'label', case when v_show then te.medication else null end,
               'time', te.time,
               'given', te.administered_at is not null) order by te.time), '[]'::jsonb)
      from treatment_entries te
      where te.pet_id = p.id and te.day = portal_today()),

    'vaccines', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', v.id, 'name', v.name, 'due_date', v.due_date,
               'administered_at', v.administered_at,
               'dose_number', v.dose_number, 'doses_total', v.doses_total)
             order by coalesce(v.administered_at, v.due_date) desc), '[]'::jsonb)
      from vaccinations v where v.pet_id = p.id),

    'weights', (
      select coalesce(jsonb_agg(w.row order by w.measured_at), '[]'::jsonb)
      from (
        select wl.measured_at,
               jsonb_build_object('kg', wl.weight_kg, 'at', wl.measured_at) as row
        from weight_logs wl where wl.pet_id = p.id
        order by wl.measured_at desc limit 12
      ) w),

    'appointments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ap.id, 'at', ap.scheduled_at, 'status', ap.status::text)
             order by ap.scheduled_at), '[]'::jsonb)
      from appointments ap
      where ap.pet_id = p.id
        and ap.scheduled_at > now() - interval '1 day'
        and ap.status not in ('cancelled', 'no_show'))
  );
end;
$$;
revoke all on function public.portal_pet(text, uuid) from public;
grant execute on function public.portal_pet(text, uuid) to anon, authenticated;

-- ── الخروج ───────────────────────────────────────────────────────────────
create or replace function public.portal_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions   -- pgcrypto: انظر الشرح عند portal_session_of
volatile
as $$
begin
  update portal_sessions
     set revoked_at = now()
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.portal_logout(text) from public;
grant execute on function public.portal_logout(text) to anon, authenticated;

-- ── كنسُ ما انتهى ────────────────────────────────────────────────────────
-- الرموزُ المنتهية والجلساتُ الميتة لا تفيد أحداً، وسجلُّ المحاولات يكفيه
-- تسعون يوماً. تُنادى من جدولة الكنس مع بقية الجداول.
create or replace function public.portal_purge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; k int;
begin
  delete from portal_codes where expires_at < now() - interval '1 day';
  get diagnostics k = row_count; n := n + k;
  delete from portal_sessions where expires_at < now() - interval '30 days';
  get diagnostics k = row_count; n := n + k;
  delete from portal_login_log where at < now() - interval '90 days';
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;
revoke all on function public.portal_purge() from public, anon, authenticated;
