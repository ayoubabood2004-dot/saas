-- ============================================================================
-- ٠١٩٤ — «أُقفل وضعُ المدير» صادقة: لا سطرَ بلا رفعٍ أُقفل، ولا أثرَ للمشغّل
--
-- ── الحاجة ───────────────────────────────────────────────────────────────
-- `end_elevation()` (0048) تكتب سطراً «override.lock» بسجلّ حركات العيادة **كلَّ**
-- نداء — كان هناك رفعٌ يُقفل أو لم يكن. والخروجُ ينادي الدالّة ليُنهي أيَّ رفعٍ حيّ.
-- فحين صار نداءُ الخروج يصل بهويّة المستخدم (خطة الطزاجة، ط٦ — كان يصل مجهولاً
-- ويُرفض 42501) صار كلُّ خروجٍ يكتب «أُقفل وضعُ المدير» ولو لم يُفتح وضعُ المدير
-- يوماً: سجلٌّ يكذب على صاحب العيادة.
--
-- والأسوأ: مشغّلُ المنصّة يدخل عيادةَ زبونٍ بهويّته (0151)، و`auth_clinic()` حينها
-- هي العيادةُ المدخولة — فخروجُه يترك سطراً بسجلّها. والاتفاقُ مع العيادات صريح:
-- **لا أثرَ للدخول عندها** (CLAUDE.md §٣)، وسجلُّ الجلسات `platform_session_log`
-- للمشغّل وحده.
--
-- ── الإصلاح ──────────────────────────────────────────────────────────────
--   • السطرُ يُكتب إن **حُذف صفُّ رفعٍ فعلاً** (`get diagnostics row_count`). بلا
--     رفعٍ لا شيءَ أُقفل، فلا سطر. (قفلٌ يدويّ بعد رفعٍ حقيقيّ يبقى يُكتب كما كان.)
--   • ولا سطرَ حين يكون النداءُ من مشغّلٍ داخلَ عيادة (`platform_acting_clinic()`
--     غيرُ فارغة). الرفعُ نفسُه يُحذف في الحالين — الأمانُ لا يتغيّر، الأثرُ وحده.
--
-- الواجهةُ صارت لا تنادي الدالّةَ عند الخروج إلا مع رفعٍ حيّ بالجهاز (hasLiveElevation)
-- — وهذه الهجرةُ تجعل القاعدةَ صادقةً **مهما كان العميل**: نسخةٌ قديمةٌ مفتوحةٌ بمتصفّح
-- عيادةٍ لم تحدّث الصفحةَ بعد النشر لا تعود تكتب سطراً كاذباً.
--
-- إضافيّةٌ ويُعاد تنفيذُها بلا أثرٍ ثانٍ (create or replace + منحٌ صريح).
-- تراجع: أعد تعريف end_elevation من 0048 حرفياً.
-- ============================================================================

create or replace function end_elevation() returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_n integer;
begin
  if auth.uid() is null then return; end if;
  delete from staff_elevations where user_id = auth.uid();
  get diagnostics v_n = row_count;
  -- لا رفعَ أُقفل ⇒ لا سطر. ومشغّلُ المنصّة داخلَ عيادة ⇒ لا أثر (بالاتفاق معها).
  if v_n > 0 and platform_acting_clinic() is null then
    begin
      insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
      values (auth_clinic(), auth.uid(), 'CLIENT', 'client', null, jsonb_build_object('event', 'override.lock'));
    exception when others then null;
    end;
  end if;
end $$;

revoke all on function end_elevation() from public, anon;
grant execute on function end_elevation() to authenticated;
