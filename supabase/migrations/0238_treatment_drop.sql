-- ============================================================================
-- ٠٢٣٨ — حذفُ دواءٍ من الخطة، والجرعةُ المعطاة لا تُحذف (قرارُ المالك D1/D2، ١٤/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- ١) الجرعةُ المعطاة تاريخٌ طبّيّ، ولا شيءَ بالقاعدة يحرسها: زرُّ السلّة بسجلّ الحيوان
--    يظهر على الجرعة المعطاة كما على المنتظرة (`TreatmentDoseRow`)، و`deleteTreatment`
--    يحذف بالمعرّف بلا سؤال — فجرعةٌ انعطت تختفي من الطبلة وكأنها ما كانت. وجرعةٌ
--    سُجّلت «انطت» بالغلط علاجُها «تراجع عن الإعطاء»، لا الحذف.
-- ٢) ولا طريقَ لإيقاف دواءٍ من منتصف الخطة: التعديلُ يغيّر الاسمَ والكمية فقط، فيبقى
--    الطبيبُ يضغط سلّةَ كلّ جرعةٍ بيومها — أو يترك الدواءَ «متأخّراً» بالأحمر.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • محفّزٌ قبل الحذف `treatment_entries_keep_given`: صفٌّ معطى (`administered_at`) لا يُحذف
--   بدور `authenticated` — من أيّ شاشةٍ أو نسخةٍ قديمة أو طلبٍ مباشر. invoker لا definer،
--   ويحرس `current_user = 'authenticated'` وحده فلا يشدّ أكثر من السياسة: حذفُ الحيوان
--   يمرّ لأن تتابعَ المفتاح الأجنبيّ يجري بهويّة مالك الجدول (RI يبدّل المستخدم)، وكذلك
--   دوالُّ المالك والخادم. وجملةُ حذفٍ تشمل صفّاً معطى تُرفض كلُّها (لا نصفُ حذف).
-- • `drop_treatment_drug(visit, medication, day, scope, ids)`: «من هذا اليوم بس» أو «من هذا
--   اليوم وطالع» بجملة حذفٍ **واحدة** شروطُها على الصفّ نفسه — فجرعةٌ انعطت من جهازٍ ثانٍ
--   بين فتح النافذة والضغط يُعاد فحصُها (EvalPlanQual) وتبقى ولو كان معرّفُها مُرسَلاً.
--   المعطاة والفائتةُ المحسومة («ما انطت») وما له نتيجةٌ يبقى؛ ويومٌ فات لا يُحذف بـ«بس»
--   (يُسجَّل من «الجرعات الي فاتت»)، و«وطالع» من يومٍ فات يبدأ من اليوم. invoker لأن سياسةَ
--   `treatment_entries_clinic_all` تسمح بالحذف أصلاً، وسياجُ المصوّر يغلقها عليه؛ وكلُّ
--   صفٍّ يُحذف يكتب سطرَ تدقيقه بالمحفّز القائم `audit_all`. ولا ملاحظةَ «أوقف X» تُكتب.
--   ومرآتُها `dropTargets` بـ`src/lib/treatmentDrop.ts` (نفسُ الشرط)، ويقارنهما
--   `treatment-drop-parity` بهذه الحزمة.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ؛ الواجهاتُ القديمة لا تنادي الدالّة، وحذفُها للمعطى يُرفض
-- برسالةٍ عربية (P0001 + hint) يعرضها describeDbError. تُطبَّق بعد 0237.
-- تراجع: drop function public.drop_treatment_drug(uuid, text, date, text, uuid[]);
--   drop trigger treatment_entries_keep_given on public.treatment_entries;
--   drop function public.treatment_entries_keep_given();
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) المعطى لا يُحذف ────────────────────────────────────────────────────
create or replace function public.treatment_entries_keep_given()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.administered_at is not null and current_user = 'authenticated' then
    raise exception 'dose_given_keep'
      using hint = 'هذي الجرعة معطاة — ما تنحذف. إذا انسجّلت بالغلط: «تراجع عن الإعطاء» أوّلاً.';
  end if;
  return old;
end $$;
drop trigger if exists treatment_entries_keep_given on public.treatment_entries;
create trigger treatment_entries_keep_given before delete on public.treatment_entries
  for each row execute function public.treatment_entries_keep_given();

-- ── ٢) حذفُ دواءٍ من يومٍ أو من يومٍ وطالع — جملةٌ واحدة ─────────────────────
create or replace function public.drop_treatment_drug(p_visit uuid, p_medication text, p_day date, p_scope text, p_ids uuid[])
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_today  date := (now() at time zone 'Asia/Baghdad')::date;
  v_from   date;
  v_status text;
  r        record;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_scope is null or p_scope not in ('day', 'rest') or p_day is null or coalesce(cardinality(p_ids), 0) > 500 then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  select v.status into v_status from clinic_visits v where v.id = p_visit and v.clinic_id = v_clinic;
  if not found then
    raise exception 'visit_gone' using errcode = 'P0002', hint = 'الزيارة ما عادت موجودة بعيادتك — حدّث الصفحة.';
  end if;
  if v_status = 'ended' then
    raise exception 'visit_ended' using hint = 'الزيارة مسكّرة — ما ينحذف منها شي.';
  end if;
  if p_scope = 'day' and p_day < v_today then
    raise exception 'drop_past_day' using hint = 'يوم فات: سجّل جرعاته أولاً من «الجرعات الي فاتت» — الحذف من اليوم وطالع بس.';
  end if;
  v_from := case when p_scope = 'day' then p_day else greatest(p_day, v_today) end;

  -- جملةٌ واحدة: الشروطُ على t نفسه، فصفٌّ انعطى بالأثناء يُعاد فحصُه (EvalPlanQual) ويُترك.
  with scope as (
    select s.id, s.day, s.administered_at
      from treatment_entries s
     where s.clinic_id = v_clinic and s.visit_id = p_visit and s.medication = p_medication
       and coalesce(s.task_type, 'drug') = 'drug'
       and (case when p_scope = 'day' then s.day = p_day else s.day >= p_day end)
  ), del as (
    delete from treatment_entries t
     where t.id = any (coalesce(p_ids, '{}'))
       and t.clinic_id = v_clinic and t.visit_id = p_visit and t.medication = p_medication
       and coalesce(t.task_type, 'drug') = 'drug'
       and t.administered_at is null
       and coalesce(t.missed_reason, '') <> 'past:not_given'
       and coalesce(t.result, '') = ''
       and (case when p_scope = 'day' then t.day = p_day else t.day >= v_from end)
    returning t.day
  )
  select (select count(*) from del) as n,
         (select min(day) from del) as d0,
         (select max(day) from del) as d1,
         (select count(*) from scope where administered_at is not null) as kg,
         (select count(*) from scope where administered_at is null and day < v_today) as kp
    into r;

  if r.n = 0 then
    raise exception 'drop_nothing' using hint = 'ما انحذف شي — الجرعات انعطت أو تغيّرت من جهاز ثاني. حدّث الصفحة.';
  end if;
  return jsonb_build_object('deleted', r.n, 'kept_given', r.kg, 'kept_past', r.kp, 'from', r.d0, 'to', r.d1);
end $$;
revoke all on function public.drop_treatment_drug(uuid, text, date, text, uuid[]) from public, anon;
grant execute on function public.drop_treatment_drug(uuid, text, date, text, uuid[]) to authenticated;
