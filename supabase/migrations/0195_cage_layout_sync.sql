-- ============================================================================
-- ٠١٩٥ — تخطيطُ الأقفاص يصير حقيقةً واحدةً بالسحابة، وحفظاً لا يدوس غيرَه
--
-- ── ما كان يحصل، مقيساً ─────────────────────────────────────────────────
-- عيادةٌ ترتّب غرفَها على حاسبة، وتفتح النظامَ على حاسبةٍ ثانية فتجد كلَّ
-- الأقفاص بغرفةٍ وحدةٍ بترتيبٍ عشوائيّ — **ثم تُكتب تلك الفوضى فوق ترتيب
-- الأولى**. السببُ بالواجهة (الهندسةُ كانت بـlocalStorage بلا اسم عيادة،
-- والجهازُ الجديد يبذر ثم «يتبنّى» ثم يرفع)، لكنّ القاعدةَ كانت شريكةً
-- بصمتٍ من وجهين:
--
--   ١) العمودُ `cage_layout` لا يحمل إلا قائمةً مسطّحة — أسماءَ الغرف ورموزَ
--      أقفاصها. فحتى لو وصل الجهازُ الثاني، لا هندسةَ يرسمها فيخترعها.
--   ٢) الحفظُ `upsert` بلا شرط: آخرُ من يكتب يفوز، ولو كان يكتب بذرةً فوق
--      عملِ شهر. **لا ميزةَ هنا — هذه خسارةُ بياناتٍ صامتة.**
--
-- البصمةُ بالإنتاج: سبعُ عياداتٍ لها تخطيط، أربعٌ فيها غرفةُ «غير مصنّفة»
-- المولَّدة، وواحدةٌ فيها **ثلاثٌ** بهذا الاسم — ثلاثةُ أجهزةٍ داست ثلاثَ مرّات.
--
-- ── ما تفعله هذه الهجرة ────────────────────────────────────────────────
--   • `cage_layout_rev`: رقمُ نسخةٍ يزيد بكلِّ حفظ.
--   • `save_cage_layout(p_json, p_base_rev)`: تكتب **فقط** إن كانت النسخةُ
--     التي بُني عليها التعديلُ هي الحاليّةَ بالقاعدة. وإلا لا تكتب شيئاً
--     وترجع نسخةَ السحابة كاملةً — فالواجهةُ تسأل صاحبَها أيَّهما يريد بدل
--     أن تختار عنه. وشرطُ `p_base_rev = 0` يعني «أوّلُ كتابةٍ على فراغ»:
--     تُقبل فقط إن كان العمودُ فارغاً فعلاً — فبذرةٌ لا تدوس تخطيطاً قائماً.
--   • `cage_layout_history(p_limit)`: النسخُ السابقة من `audit_log` (الذي
--     يصوّر `__changed` لكلّ تحديث) — فما دِيس **يُرجَع** لا يُبكى عليه.
--
-- ── الصلاحية ────────────────────────────────────────────────────────────
-- `security invoker` عمداً: سياسةُ `clinic_prefs` تسمح للعيادة بالكتابة على
-- صفّها أصلاً، فلا حاجةَ لتجاوزها — ودرسُ 0145 يقول إنّ `definer` تُكتب حين
-- **لا** تسمح السياسة، لا كعادة. و`cage_layout_history` تقرأ `audit_log`
-- وسياستُه قراءةٌ لعيادة الصفّ، فتكفي صلاحيةُ المُستدعي أيضاً.
--
-- تراجع:
--   drop function if exists public.cage_layout_history(integer);
--   drop function if exists public.save_cage_layout(text, integer);
--   alter table clinic_prefs drop column if exists cage_layout_rev;
-- ============================================================================

alter table clinic_prefs add column if not exists cage_layout_rev integer not null default 0;

-- صفٌّ قائمٌ بتخطيطٍ محفوظ يبدأ بنسخة ١ لا ٠: النسخةُ ٠ معناها «ما كُتب شيءٌ
-- بعد»، وهي وحدَها التي تقبل كتابةَ بذرة. صفٌّ بتخطيطٍ حقيقيٍّ ونسخةٍ صفر كان
-- سيُدهس بأوّل جهازٍ جديد — وهذا بالضبط ما نصلحه.
update clinic_prefs set cage_layout_rev = 1
 where cage_layout is not null and cage_layout <> '' and cage_layout_rev = 0;

create or replace function public.save_cage_layout(p_json text, p_base_rev integer)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_cur    integer;
  v_raw    text;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;

  select cage_layout_rev, cage_layout into v_cur, v_raw
    from clinic_prefs where clinic_id = v_clinic for update;

  if not found then
    -- لا صفَّ إعداداتٍ بعد: يُنشأ بالتخطيط ونسخةٍ أولى.
    insert into clinic_prefs (clinic_id, cage_layout, cage_layout_rev)
    values (v_clinic, p_json, 1);
    return jsonb_build_object('ok', true, 'rev', 1);
  end if;

  -- **الشرطُ كلُّه بسطرين**: من بنى على نسخةٍ قديمة لا يكتب، ومن يكتب أوّلَ
  -- مرّةٍ (rev 0) لا يكتب إلا على فراغٍ حقيقيّ.
  if v_cur <> coalesce(p_base_rev, -1)
     or (coalesce(p_base_rev, -1) = 0 and coalesce(v_raw, '') <> '') then
    return jsonb_build_object(
      'ok', false, 'conflict', true,
      'rev', v_cur, 'layout', v_raw);
  end if;

  update clinic_prefs
     set cage_layout = p_json,
         cage_layout_rev = v_cur + 1,
         updated_at = now()
   where clinic_id = v_clinic;

  return jsonb_build_object('ok', true, 'rev', v_cur + 1);
end $$;

revoke all on function public.save_cage_layout(text, integer) from public, anon;
grant execute on function public.save_cage_layout(text, integer) to authenticated;

comment on function public.save_cage_layout(text, integer) is
  'حفظُ تخطيط الأقفاص بشرط النسخة (0195): لا يكتب على تخطيطٍ تغيّر من جهازٍ آخر — يرجّعه ليختار صاحبُه.';

-- ── سجلُّ الترتيب: ما دِيس يُرجَع ─────────────────────────────────────────
-- `audit_log.details->'__changed'->'cage_layout'` = **[كان, صار]** — بهذا
-- الترتيب بالضبط، من `jsonb_build_array(v_old -> k, v_new -> k)` بـ0139.
-- فالمفهرسُ **صفر** هو التخطيطُ كما كان **قبل** تلك الكتابة، وهو ما يُسترجَع.
-- (قرأتُها أوّلَ مرّةٍ مقلوبةً فكان «الاسترجاع» يعيد ما دَهس لا ما دِيس —
-- أمسكه فحصُ الحزمة على صفٍّ مزروعٍ بشكل المُدقِّق الحقيقيّ.)
create or replace function public.cage_layout_history(p_limit integer default 40)
returns table (at timestamptz, actor uuid, layout text)
language sql
security invoker
set search_path = public
as $$
  select a.created_at,
         a.actor,
         (a.details->'__changed'->'cage_layout'->>0) as layout
    from audit_log a
   where a.clinic_id = auth_clinic()
     and a.entity = 'clinic_prefs'
     and a.details->'__changed' ? 'cage_layout'
     and nullif(a.details->'__changed'->'cage_layout'->>0, '') is not null
   order by a.id desc
   limit greatest(1, least(200, coalesce(p_limit, 40)));
$$;

revoke all on function public.cage_layout_history(integer) from public, anon;
grant execute on function public.cage_layout_history(integer) to authenticated;

comment on function public.cage_layout_history(integer) is
  'نسخُ تخطيط الأقفاص السابقة من سجلّ التدقيق (0195) — لاسترجاع ترتيبٍ دِيس.';
