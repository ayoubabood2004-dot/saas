-- ============================================================================
-- ٠٢٣٥ — رابطُ المتجر وتشغيلُه للمدير وحده، بالخادم (O5، ١٢/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- سياسةُ `store_profiles` (0095) شرطُ عيادةٍ وحده `for all`: أيُّ موظّفٍ بالعيادة —
-- الاستقبالُ كذلك — يقدر يبدّل رابطَ المتجر (فيموت كلُّ رابطٍ وُزّع على الزبائن)،
-- أو يطفئه، أو يحذف صفَّه كلَّه، ولا شيء يمنعه غيرُ إخفاء الزرّ بالواجهة. والمالكُ
-- وافق: الرابطُ والتشغيلُ للمدير.
--
-- ── الشكل ────────────────────────────────────────────────────────────────
-- محفّزٌ لا سياسة (درسُ 0159/0162: تجميدُ الأعمدة بمحفّز يقارن OLD بـNEW)، invoker،
-- يحرس دورَ `authenticated` وحده فدوالُّ المالك تمرّ:
--   • إدراجُ صفٍّ جديد (فتحُ المتجر) ⇒ للمدير. و**الحفظُ upsert** (repo.saveStoreProfile):
--     الإدراجُ يُحاول أوّلاً لكلّ حفظ، فصفٌّ موجودٌ يُمرَّر هنا والحكمُ لفرع التحديث.
--   • تحديثُ الرابط أو التشغيل ⇒ للمدير؛ وما سواهما (النبذة، الأجرة، الحدّ، الواتساب)
--     ⇒ لمن له إذن المتجر (staff_can — استثناءُ المدير يُحترم).
--   • الحذف ⇒ للمدير.
-- و«المدير» = auth_role(): صاحبُ العيادة، والمرفوعُ بالـPIN، ومشغّلُ المنصّة (0151) — عمداً.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0234.
-- تراجع: drop trigger store_profiles_owner_lock on store_profiles; drop function store_profiles_owner_lock();
-- ============================================================================

set lock_timeout = '5s';

create or replace function public.store_profiles_owner_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- upsert: الصفُّ موجود ⇒ التعارضُ يحوّله تحديثاً، والحكمُ هناك.
    if exists (select 1 from store_profiles s where s.clinic_id = new.clinic_id) then
      return new;
    end if;
    if auth_role() <> 'manager' then
      raise exception 'store_owner_only' using errcode = '42501', hint = 'فتح المتجر لمدير العيادة';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.slug, new.enabled) is distinct from (old.slug, old.enabled) and auth_role() <> 'manager' then
      raise exception 'store_owner_only' using errcode = '42501', hint = 'تغيير رابط المتجر وتشغيله للمدير';
    end if;
    -- كلُّ عمودٍ آخر (واليومَ وغداً) بإذن المتجر — لا قائمةَ أعمدةٍ تنسى عموداً جديداً.
    if (to_jsonb(new) - array['slug', 'enabled', 'updated_at']) is distinct from (to_jsonb(old) - array['slug', 'enabled', 'updated_at'])
       and not staff_can('manageStore') then
      raise exception 'not_authorized' using errcode = '42501', hint = 'إدارة المتجر مو من صلاحيتك — اطلبها من مدير العيادة.';
    end if;
    return new;
  end if;

  -- DELETE
  if auth_role() <> 'manager' then
    raise exception 'store_owner_only' using errcode = '42501', hint = 'حذف المتجر لمدير العيادة';
  end if;
  return old;
end $$;
revoke all on function public.store_profiles_owner_lock() from public, anon, authenticated;

drop trigger if exists store_profiles_owner_lock on public.store_profiles;
create trigger store_profiles_owner_lock before insert or update or delete on public.store_profiles
  for each row execute function public.store_profiles_owner_lock();
