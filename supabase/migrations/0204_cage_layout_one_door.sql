-- ============================================================================
-- ٠٢٠٤ — تخطيطُ الأقفاص بابُه واحد: `save_cage_layout` وحدَها
--
-- ── ما قيس بقراءة الشِفرة القديمة ───────────────────────────────────────
-- 0195 أعطت حفظاً بشرط النسخة، والواجهةُ الجديدة لا تكتب التخطيطَ إلا منها.
-- **لكنّ العمودَ نفسَه بقي مفتوحاً**، والنسخةُ القديمة من `settings.ts` كانت
-- تكتبه مباشرةً بطريقين:
--   • `patchPrefs({ cage_layout: … })` عند كلّ تعديل — `upsert` بلا فحصِ نسخة.
--   • و**أخطرُهما**: عند الترطيب، `boolPatch.cage_layout = local.cage_layout`
--     يضع تخطيطَ الجهاز بطابور «المعلّقات»، فيُرفع فوق السحابة بلا سؤال.
--
-- وطابورُ المعلّقات يعيش بـ`localStorage`. فجهازُ عيادةٍ عدّل أقفاصَه **قبل**
-- التحديث يحمل تخطيطاً قديماً بطابوره، وأوّلُ ترطيبٍ **بعد** التحديث يرفعه
-- فوق ترتيبِ العيادة الصحيح — العطبُ نفسُه، بعد إصلاحه. (نُزع بالواجهة، لكنّ
-- الواجهةَ لا تصل جهازاً بنسخةٍ مخبّأةٍ قديمة — وهذا ما يصله هذا المحفّز.)
--
-- ── القاعدةُ الحاكمة ────────────────────────────────────────────────────
-- **الحمايةُ على العمود الذي يُفقد، لا على أحد طرقه** — درسُ 0146 و0197 حرفياً.
-- ولذلك محفّزٌ لا سياسة: السياسةُ التي تقرأ جدولَها تُسقط كلَّ تحديثٍ عليه
-- (42P17، درس 0159/0162)، والتجميدُ الانتقائيُّ لعمودٍ واحدٍ عملُ محفّز.
--
-- ويحرس `current_user = 'authenticated'` وحدَه — أي الكتابةَ المباشرة من
-- المتصفّح. وهو invoker لا definer: لا يشدّ أكثر من السياسة (درس 0162).
--
-- ── وفخٌّ وقعتُ فيه هنا، فيُكتب ─────────────────────────────────────────
-- أوّلُ صياغةٍ افترضت أنّ `save_cage_layout` **بصلاحية المُعرِّف** فتمرّ. وهي
-- **بصلاحية المُستدعي** — تجري كـ`authenticated` — فكان المحفّزُ سيرفضها هي
-- نفسَها، أي يقفل الباب الوحيد. وفحصُ الحزمة مرّ أخضرَ لأنه يجري بـsuperuser
-- فلا يدخل الفرعَ أصلاً: **فحصٌ يقيس لا شيء** (CLAUDE.md: ما لا يُفحص
-- بـauthenticated لا يُعرف). فصار يُفحص بـ`_rls_try` بدورٍ حقيقيّ.
--
-- والإذنُ يُمنح بعَلَمٍ **محصورٍ بالمعاملة** تضعه الدالّةُ قبل كتابتها وحدَها،
-- لا بترقية صلاحيتها — فتبقى سياسةُ الصفوف تحرس كتابتَها كما كانت.
--
-- تراجع: `drop trigger clinic_prefs_cage_layout_guard on clinic_prefs;`
-- تُطبَّق بعد 0203.
-- ============================================================================

create or replace function public.clinic_prefs_cage_layout_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  -- الإذنُ الوحيد: كتابةٌ من داخل `save_cage_layout` بنفس المعاملة.
  if coalesce(current_setting('vp.cage_layout_write', true), '') = '1' then return new; end if;
  if new.cage_layout is distinct from old.cage_layout
     or new.cage_layout_rev is distinct from old.cage_layout_rev then
    raise exception 'cage_layout_direct_write'
      using hint = 'ترتيب الأقفاص ينحفظ من شاشة غرفة الأقفاص وحدها — حدّث الصفحة وجرّب من هناك.';
  end if;
  return new;
end $$;

drop trigger if exists clinic_prefs_cage_layout_guard on clinic_prefs;
create trigger clinic_prefs_cage_layout_guard
  before update of cage_layout, cage_layout_rev on clinic_prefs
  for each row execute function clinic_prefs_cage_layout_guard();

comment on function public.clinic_prefs_cage_layout_guard() is
  'بابٌ واحدٌ لتخطيط الأقفاص (0204): `save_cage_layout` بفحص النسخة. ويمنع الكتابةَ المباشرة من المتصفّح — ومنها طابورُ المعلّقات بنسخةٍ مخبّأةٍ قديمة، وهو الطريقُ الذي كان يدوس ترتيبَ العيادة.';

-- ملاحظةٌ للقارئ: `INSERT` غيرُ محروس عمداً — صفُّ التفضيلات الأوّل يُنشأ
-- بـ`upsert` من الواجهة، و`save_cage_layout` تُنشئه كذلك حين لا يكون. وأوّلُ
-- كتابةٍ لا تدوس شيئاً؛ المحروسُ هو **التغيير** فوق قائم.

-- والدالّةُ ترفع العَلَمَ حول كتابتها وحدَها. الباقي كما هو بـ0195 حرفاً بحرف.
create or replace function public.save_cage_layout(p_json text, p_base_rev integer)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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
    insert into clinic_prefs (clinic_id, cage_layout, cage_layout_rev)
    values (v_clinic, p_json, 1);
    return jsonb_build_object('ok', true, 'rev', 1);
  end if;

  if v_cur <> coalesce(p_base_rev, -1)
     or (coalesce(p_base_rev, -1) = 0 and coalesce(v_raw, '') <> '') then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', v_cur, 'layout', v_raw);
  end if;

  -- العَلَمُ محلّيٌّ بالمعاملة (`true`)، فيسقط بانتهائها ولا يتسرّب لكتابةٍ أخرى.
  perform set_config('vp.cage_layout_write', '1', true);
  update clinic_prefs
     set cage_layout = p_json, cage_layout_rev = v_cur + 1, updated_at = now()
   where clinic_id = v_clinic;
  perform set_config('vp.cage_layout_write', '', true);

  return jsonb_build_object('ok', true, 'rev', v_cur + 1);
end $function$;

revoke all on function public.save_cage_layout(text, integer) from public, anon;
grant execute on function public.save_cage_layout(text, integer) to authenticated;
