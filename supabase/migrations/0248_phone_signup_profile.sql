-- ============================================================================
-- 0248 — صاحبُ الحيوان يسجّل برقم هاتفه (٢٥/١٠، F3)
--
-- محفّزُ إنشاء الحساب (0005) يكتب صفَّ `profiles` من بيانات الحساب، و`email`
-- و`full_name` فيه `not null` منذ 0001. والدخولُ برقم الهاتف (بوّابةُ أصحاب
-- الحيوانات، وهي بوّابتُهم الافتراضية) يُنشئ مستخدماً **بلا بريد**، واسمُه
-- اختياريّ بالنموذج:
--   • `email = new.email` ⇒ null ⇒ يرفض القيد؛
--   • `full_name = coalesce(meta, split_part(null, '@', 1))` ⇒ null ⇒ يرفض القيد.
-- فيرجع Supabase لصاحب الحيوان «Database error saving new user» خاماً، ولا حساب.
-- لم يظهر بالإنتاج لأن مزوّدَ الرسائل غيرُ مفعّل بعد («قيد التفعيل») — يظهر
-- لحظةَ تفعيله، لكلّ مالكٍ جديد.
--
-- التصليح: لا نرخي القيدين (شِفرةٌ كثيرةٌ تقرأ البريدَ والاسمَ نصّاً)، بل يملؤهما
-- المحفّزُ بما يعرف: البريدُ فارغٌ لا null، والاسمُ: المكتوب ← اسمُ البريد ←
-- الهاتف ← «doctorVet». و`phone` يأخذ رقمَ الدخول حين لا رقمَ بالبيانات —
-- بوّابةُ المالك تطابق حيواناته برقمه (0077).
--
-- والاسمُ الفارغ ('') كان يُحفظ فارغاً لأن coalesce لا يتخطّاه؛ صار يُتخطّى.
-- غيرُ ذلك لم يتغيّر: الدورُ والأدوار والمدينة كما كتبتها 0005 حرفاً بحرف.
-- ============================================================================

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := coalesce(new.raw_user_meta_data->>'role', 'owner');
  acct text := case when meta_role = 'owner' then 'owner' else 'clinic' end;
  meta_phone text := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
begin
  insert into public.profiles (id, full_name, email, role, phone, city, roles)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      meta_phone,
      nullif(new.phone, ''),
      'doctorVet'
    ),
    coalesce(new.email, ''),
    coalesce(meta_role::user_role, 'owner'),
    coalesce(meta_phone, nullif(new.phone, '')),
    nullif(new.raw_user_meta_data->>'city',''),
    array[acct]
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- كما بـ0039 حرفاً بحرف (والمحفّزُ دالّةُ trigger — لا تُنادى عبر الواجهة أصلاً).
revoke execute on function public.handle_new_user() from anon, authenticated;
