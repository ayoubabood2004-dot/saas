-- ============================================================================
-- doctorVet — 0111: واتساب الرسمي (Cloud API) — الأساس فقط.
--
-- هذه الهجرة **لا تغيّر شيئاً على أي عيادة قائمة**. الطريقة الحالية (روابط
-- wa.me التي تفتح واتساب بالهاتف) تبقى كما هي حرفياً، مجانية وبلا خطر حظر،
-- وهي الافتراضي لكل عيادة. العيادة التي لا تربط رقماً لا تلاحظ شيئاً إطلاقاً.
--
-- ما تضيفه: القدرة على أن **ترتبط** عيادةٌ برقم واتساب رسمي، فتصير رسائل
-- زبائنها تصل داخل السستم بدل هاتف الموظفة. القرار «أي طريقة تعمل» ليس زراً
-- يُضغط، بل يُشتقّ من البيانات: للعيادة صفٌّ فعّال في wa_accounts ⇒ الطريقة
-- الرسمية متاحة لها؛ لا صفّ ⇒ wa.me كما اليوم.
--
-- ── لماذا لا نوسّع wa_messages (0023) ──────────────────────────────────────
-- لأن clinic_quota_usage() (0105) **يعدّ صفوفه** لفرض حصة الرسائل الشهرية،
-- وسياسته `for all` تعطي العيادة صلاحية الحذف — أي أن ضخّ أحداث الويبهوك فيه
-- يخلط عدّاد المحاسبة بسجلّ الوارد، ويجعل العيادة قادرةً على حذف رسائل
-- زبائنها. جداول جديدة، والكتابة فيها للخادم وحده.
--
-- ── قاعدة الأمان الحاكمة ──────────────────────────────────────────────────
-- الويبهوك يصل بلا هوية ولا JWT: لا auth_clinic() ولا auth.uid(). فنسبة أي
-- رسالة لعيادة تتمّ **حصراً** عبر phone_number_id الذي سجّلناه نحن مسبقاً في
-- wa_accounts. جسم الطلب لا يحدّد المستأجر أبداً — يُطابَق عليه فقط.
-- ولهذا: لا سياسة INSERT/UPDATE لأي دور مستخدم على هذه الجداول. الكتابة عبر
-- service_role وحده (يتجاوز RLS بامتيازه)، والعيادة تقرأ صفوفها فقط.
-- ============================================================================

-- ── ١) الأرقام المربوطة — صفٌّ لكل رقم عيادة ────────────────────────────────
create table if not exists wa_accounts (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references auth.users(id) on delete cascade,
  -- المعرّف الذي ترسله ميتا داخل كل حدث، وهو **مفتاح التوجيه الوحيد**.
  phone_number_id   text not null unique,
  waba_id           text,
  -- الرقم كما يظهر للزبون، واسم العرض المعتمد من ميتا (للعرض فقط).
  display_phone     text,
  display_name      text,
  status            text not null default 'active'
                    check (status in ('active', 'paused', 'revoked')),
  created_at        timestamptz not null default now()
);
create index if not exists wa_accounts_clinic_idx on wa_accounts(clinic_id);

-- ── ٢) سجلّ الرسائل الواردة والصادرة رسمياً ────────────────────────────────
create table if not exists wa_inbox (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references auth.users(id) on delete cascade,
  account_id     uuid references wa_accounts(id) on delete set null,
  -- معرّف ميتا للرسالة (wamid…). فريدٌ عمداً: ميتا تعيد إرسال الحدث نفسه عند
  -- أي تعثّر، والتفرّد هو ما يجعل التكرار غير مؤذٍ بلا منطق إضافي.
  wa_message_id  text unique,
  direction      text not null check (direction in ('in', 'out')),
  peer_phone     text,                 -- رقم الزبون (wa_id)
  peer_name      text,                 -- الاسم كما يعرضه واتساب
  msg_type       text,                 -- text | image | audio | document | …
  body           text,                 -- نصّ الرسالة إن كانت نصّية
  media_id       text,                 -- معرّف الوسيط (التنزيل مرحلة لاحقة)
  status         text,                 -- sent | delivered | read | failed
  err            text,
  wa_ts          timestamptz,          -- وقت ميتا للرسالة
  created_at     timestamptz not null default now()
);
create index if not exists wa_inbox_clinic_idx on wa_inbox(clinic_id, created_at desc);
create index if not exists wa_inbox_peer_idx   on wa_inbox(clinic_id, peer_phone);

-- ── ٣) سجلّ الأحداث الخام — للتشخيص وحده ───────────────────────────────────
-- نخزّن الظرف كما وصل **قبل** أي تفسير. سببه عملي: وثائق ميتا لم تكن متاحة
-- وقت البناء، فأول أسبوع تشغيل هو ما سيكشف الأشكال الحقيقية للحمولات. وبلا
-- الخام لا يمكن إصلاح ما لم نفهمه.
create table if not exists wa_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  received_at   timestamptz not null default now(),
  signature_ok  boolean not null default false,
  routed_clinic uuid,
  note          text,                  -- 'ok' | 'unknown_number' | 'bad_signature' | …
  payload       jsonb
);
create index if not exists wa_webhook_events_at_idx on wa_webhook_events(received_at desc);

-- ── ٤) RLS: قراءة فقط للعيادة، ولا كتابة لأي دور مستخدم ────────────────────
-- ملاحظة مقصودة: **بلا `force row level security`** خلافاً لعادة المشروع.
-- السبب أن الكاتب الوحيد هنا هو service_role عبر الويبهوك، و`force` تطبّق RLS
-- على مالك الجدول أيضاً؛ وبما أننا لا نمنح أي سياسة INSERT فإن أي التباس في
-- تجاوز الامتياز يعني ضياع كل رسالة بصمت. الأمان محفوظ بغياب سياسات الكتابة.
alter table wa_accounts       enable row level security;
alter table wa_inbox          enable row level security;
alter table wa_webhook_events enable row level security;

drop policy if exists wa_accounts_clinic_read on wa_accounts;
create policy wa_accounts_clinic_read on wa_accounts for select
  using (clinic_id = auth_clinic());

drop policy if exists wa_inbox_clinic_read on wa_inbox;
create policy wa_inbox_clinic_read on wa_inbox for select
  using (clinic_id = auth_clinic());

-- الأحداث الخام قد تحوي حمولات عيادات أخرى قبل توجيهها — للمشغّل وحده.
drop policy if exists wa_webhook_events_admin_read on wa_webhook_events;
create policy wa_webhook_events_admin_read on wa_webhook_events for select
  using (is_platform_admin());

-- ── ٥) ربط رقم بعيادة — للمشغّل وحده ───────────────────────────────────────
-- تُستدعى مرة واحدة لكل رقم. idempotent: إعادة الربط لنفس phone_number_id
-- تُحدّث الصفّ ولا تنشئ ثانياً — فرقمٌ واحد لا ينتمي لعيادتين أبداً.
create or replace function admin_wa_link_account(
  p_clinic uuid, p_phone_number_id text, p_waba_id text default null,
  p_display_phone text default null, p_display_name text default null
) returns wa_accounts
language plpgsql security definer set search_path = public as $$
declare v_row wa_accounts;
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_phone_number_id), '') = '' then raise exception 'phone_number_id required'; end if;

  insert into wa_accounts (clinic_id, phone_number_id, waba_id, display_phone, display_name)
  values (p_clinic, btrim(p_phone_number_id), nullif(btrim(p_waba_id), ''),
          nullif(btrim(p_display_phone), ''), nullif(btrim(p_display_name), ''))
  on conflict (phone_number_id) do update
    set clinic_id     = excluded.clinic_id,
        waba_id       = coalesce(excluded.waba_id, wa_accounts.waba_id),
        display_phone = coalesce(excluded.display_phone, wa_accounts.display_phone),
        display_name  = coalesce(excluded.display_name, wa_accounts.display_name),
        status        = 'active'
  returning * into v_row;
  return v_row;
end $$;

revoke all on function admin_wa_link_account(uuid, text, text, text, text) from public, anon;
grant execute on function admin_wa_link_account(uuid, text, text, text, text) to authenticated;

-- ── ٦) هل لهذه العيادة رقم رسمي فعّال؟ ─────────────────────────────────────
-- هذا هو المفتاح الذي يقرّر أي طريقة تعمل. false ⇒ wa.me كما اليوم بالضبط.
create or replace function wa_is_connected() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wa_accounts
                  where clinic_id = auth_clinic() and status = 'active');
$$;
revoke all on function wa_is_connected() from public, anon;
grant execute on function wa_is_connected() to authenticated;

-- VERIFY (كعيادة): يرجع false لكل عيادة لم تربط رقماً — أي الجميع اليوم.
--   select wa_is_connected();
-- VERIFY (كمشغّل): يرجع صفر صفوف قبل ربط أي رقم.
--   select clinic_id, phone_number_id, display_name, status from wa_accounts;
