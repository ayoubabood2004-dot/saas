-- ============================================================================
-- 0162 — سياسةٌ تقرأ جدولَها تُسقط كلَّ تحديث: invoices وprofiles وclinic_prefs
--
-- الجذرُ نفسُه الذي أمسكته 0159 بالتوصيل: `with check` فيه استعلامٌ فرعيّ على
-- الجدول المحميّ. بوستغريس يرفضها عند **إعادة كتابة** الاستعلام
-- (42P17 infinite recursion detected in policy) — لكلّ تحديثٍ بدور
-- `authenticated`، مهما كان الفرعُ الأوّل `auth_role() = 'manager'` صحيحاً.
-- ثلاثُ سياساتٍ بقيت على النمط، ومقيسٌ أثرُها بسجلّ الخادم (٥ أيلول ٢٠٢٦):
--   invoices.invoices_update         (0051) → PATCH /invoices 500
--   clinic_prefs.clinic_prefs_update (0161) → POST /clinic_prefs 500 خمسَ مرّاتٍ
--                                             بعيادتين منذ لحظة تطبيقها: حفظُ
--                                             الإعدادات كلُّه كان يفشل بصمت
--   profiles.profiles_self_update    (0049) → تعديلُ الملفّ الشخصيّ
-- لم تمسكها الحزمةُ لأنها تجري كـsuperuser (يتجاوز RLS)؛ فحوصُ هذه الهجرة
-- تمرّ من `_rls_try` بدور `authenticated` كما بالإنتاج (انظر run.sh).
--
-- الإصلاح كما في 0159: القاعدةُ («أعمدةٌ مجمّدة لغير المدير») تنتقل إلى محفّزٍ
-- قبل التحديث يقارن OLD بـNEW بلا استعلام، ويرفض بـhint عربيّ يصل الشاشة
-- (`describeDbError` يقرأ hint مع P0001). والسياسةُ ترجع لشرط الملكيّة وحده.
--
-- والمحفّزُ **لا يشدّ أكثر من السياسة التي يحلّ محلّها**: السياسةُ كانت تُطبَّق
-- على التحديث المباشر بدور `authenticated` فقط، ودوالُّ SECURITY DEFINER
-- (settle_invoice، refund_invoice، courier_settle…) تتجاوزها لأنها تجري بهويّة
-- مالكها. فالمحفّز يحرس حين `current_user = 'authenticated'` وحده — داخل دالّةٍ
-- مالكة يكون current_user مالكَها فيمرّ كما كان. ولهذا المحفّزُ نفسُه بصلاحية
-- المُستدعي عمداً: لو كان definer لصار current_user مالكَه دائماً وبطل الشرط.
--
-- ومعها: `set_override_pin` و`elevate_with_pin` تناديان crypt/gen_salt بـ
-- `search_path = public` وحده، والامتدادُ pgcrypto بمخطّط `extensions` →
-- «function gen_salt(unknown) does not exist» (مقيس: rpc/set_override_pin
-- ترجع 404). يُضاف المخطّطُ للمسار كما فعلت 0158 لدوالّ البوّابة.
--
-- والحارس: db-guard يمنع من الآن أيَّ سياسةٍ تذكر جدولَها (policy-self-ref)،
-- وفحصٌ بالحزمة يعدّ السياسات الذاتية بالقاعدة ويطلب صفراً.
--
-- تراجع: أعد سياسات 0049/0051/0161 كما كانت — وستُسقط التحديثاتِ من جديد.
-- ============================================================================

-- ── ١) الفواتير: مبالغُها وحالتُها للمدير وحده ─────────────────────────────
create or replace function invoices_guard_money()
returns trigger language plpgsql set search_path = public as $$
begin
  -- الحراسةُ للتحديث المباشر وحده (كما كانت السياسة): دوالُّ المالك تمرّ.
  if current_user <> 'authenticated' then return new; end if;
  if coalesce(auth_role(), '') = 'manager' then return new; end if;
  if new.total       is distinct from old.total
  or new.subtotal    is distinct from old.subtotal
  or new.discount    is distinct from old.discount
  or new.amount_paid is distinct from old.amount_paid
  or new.cost_total  is distinct from old.cost_total
  or new.profit      is distinct from old.profit
  or new.item_count  is distinct from old.item_count
  or new.status      is distinct from old.status then
    raise exception 'invoice_money_frozen'
      using hint = 'مبالغُ الفاتورة وحالتُها للمدير وحده — التسديد من «تحصيل» والإرجاع من «المرتجع».';
  end if;
  return new;
end $$;

drop trigger if exists invoices_before_update_guard on invoices;
create trigger invoices_before_update_guard
  before update on invoices
  for each row execute function invoices_guard_money();

drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices
  for update
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

-- ── ٢) الإعدادات: مشاركةُ الكتالوج قرارُ المدير وحده ─────────────────────
-- تحرس الإدراجَ أيضاً: صفٌّ جديد بـcatalog_share=true من موظّفٍ كان التفافاً
-- على تجميد التحديث (سياسةُ الإدراج بلا فحصِ دور).
create or replace function clinic_prefs_guard_share()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if coalesce(auth_role(), '') = 'manager' then return new; end if;
  if (tg_op = 'UPDATE' and new.catalog_share is distinct from old.catalog_share)
     or (tg_op = 'INSERT' and coalesce(new.catalog_share, false)) then
    raise exception 'catalog_share_frozen'
      using hint = 'مشاركةُ الكتالوج مع العيادات قرارُ المدير وحده.';
  end if;
  return new;
end $$;

drop trigger if exists clinic_prefs_before_write_guard on clinic_prefs;
create trigger clinic_prefs_before_write_guard
  before insert or update on clinic_prefs
  for each row execute function clinic_prefs_guard_share();

drop policy if exists clinic_prefs_update on clinic_prefs;
create policy clinic_prefs_update on clinic_prefs
  for update
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

-- ── ٣) الملفّ الشخصيّ: الهويّةُ لا تُعدَّل من الملفّ ──────────────────────
-- سياساتُ profiles كلُّها ذاتية (id = auth.uid())، فكلُّ تحديثٍ مباشر تحديثُ
-- صاحبه لنفسه — والدورُ والعيادةُ والبريدُ ليست له.
create or replace function profiles_guard_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.role      is distinct from old.role
  or new.roles     is distinct from old.roles
  or new.clinic_id is distinct from old.clinic_id
  or new.email     is distinct from old.email then
    raise exception 'profile_identity_frozen'
      using hint = 'الدورُ والعيادةُ والبريدُ لا تُعدَّل من الملفّ الشخصيّ.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_before_update_guard on profiles;
create trigger profiles_before_update_guard
  before update on profiles
  for each row execute function profiles_guard_identity();

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── ٤) الرمزُ السرّي يرى pgcrypto ─────────────────────────────────────────
-- `alter function … set search_path` يبقي الجسمَ كما هو؛ والحزمةُ المحليّة قد
-- لا تحمل الدالّتين (هجرتُهما خارج الموجة) فيُتحقّق من وجودهما أوّلاً.
do $$
begin
  if to_regprocedure('public.set_override_pin(text)') is not null then
    execute 'alter function public.set_override_pin(text) set search_path = public, extensions';
  end if;
  if to_regprocedure('public.elevate_with_pin(text)') is not null then
    execute 'alter function public.elevate_with_pin(text) set search_path = public, extensions';
  end if;
end $$;

-- ── ٥) لا سياسةَ تذكر جدولَها — يُطلب صفراً بالحزمة وبفحص الإنتاج ─────────
create or replace function public.verify_no_self_ref_policies()
returns table (tablename name, policyname name)
language sql stable security definer set search_path = public as $$
  select p.tablename, p.policyname
    from pg_policies p
   where p.schemaname = 'public'
     and (coalesce(p.qual, '')       ~ ('FROM ' || p.tablename || '\M')
       or coalesce(p.with_check, '') ~ ('FROM ' || p.tablename || '\M'));
$$;
revoke all on function public.verify_no_self_ref_policies() from public, anon, authenticated;
