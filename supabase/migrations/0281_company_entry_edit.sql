-- ============================================================================
-- ٠٢٨١ — تعديلُ الرصيد السابق والتسوية بدفتر الشركة: بسببٍ إلزاميّ، وسجلُّ ما كان يبقى على الصفّ
--
-- طلبُ المالك (١٧/١١): «بالنسبة للديون السابقة بدفتر ديون الشركات خليلي خاصية التعديل على الديون مع كتابة الأسباب
-- بشكل متطوّر»، وجوابُه بسؤال: **المدير بس**.
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- صفُّ الدفتر (0224) لا يُكتب إلا بإضافةٍ أو إلغاء: رصيدٌ سابقٌ انكتب ٩٬٠٠٠٬٠٠٠ والصحيحُ ٩٬٥٠٠٬٠٠٠ لا يُصحَّح إلا بإلغائه
-- وكتابةِ غيره — وإلغاؤه يُرفض ما دام انسدّ منه شيء (`has_payments`: ألغِ التسديد أوّلاً). فتصحيحُ رقمٍ واحد صار ثلاثَ
-- عملياتٍ تلمس تسديداتٍ صحيحة، أو تسويةً «مبلغ علينا ٥٠٠٬٠٠٠» تبقى بالدفتر كأنها مالٌ جديد وهي غلطُ كتابة.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `company_entry_edit(p_entry, p_amount, p_date, p_note, p_reason, p_seen)` — definer، للمدير (`company_entry_guard`):
--   يغيّر مبلغَ الرصيد السابق أو التسوية وتاريخَها وملاحظتَها **بمعاملةٍ واحدة تحت قفل الشركة** (كلُّ كاتبٍ بدفترها يمرّ منه).
--     – **الرصيدُ السابق والتسويةُ وحدهما**: التسديدُ موزَّعٌ على فواتيرَ بدفعاتٍ تحمل معرّفَه — تعديلُه إلغاءٌ وإعادة
--       (`not_editable`)، والعملةُ والنوعُ والاتّجاهُ لا تتغيّر (تغييرُها حركةٌ أخرى، لا تصحيحُ رقم).
--     – **السببُ إلزاميّ** (≤ ٣٠٠ كالإلغاء)، والملغاةُ لا تُعدَّل (`already_void`)، وما لم يتغيّر شيءٌ فيه لا يُكتب (`no_change`).
--     – **ما رآه المدير شرطُ الكتابة** (`p_seen` = المبلغُ والتاريخُ والملاحظةُ كما فُتحت النافذة): جهازٌ ثانٍ عدّلها أو ألغاها
--       بعد الفتح ⇒ `entry_changed` لا دوسٌ صامت.
--     – **لا ينزل تحت ما انسدّ منه**: رصيدٌ دائنٌ يُنقَص يُسأل رصيدُ الشركة السابق بعملته (`company_pool_due[_usd]`) كما
--       يسأله الإلغاء — نزولٌ يجعله سالباً ⇒ `has_payments` والحدُّ الأدنى بالرقم بجملة الرفض (ما نزّله منه تسديدٌ على الحساب
--       أو تسويةٌ مدينة — «خصمٌ من الشركة» يُحسب على الرصيد السابق كالتسديد). والتسويةُ المدينة (خصمٌ من
--       الشركة) لا حدَّ لها إلا الصفر — كإضافتها.
--     – التاريخُ بحارس الإضافة نفسِه (اليومَ أو قبله، ومن ٢٠٠٠)، والتسويةُ لا تصير بلا سبب (`note_required` كإضافتها).
-- • `company_entries.edits` (jsonb، **بلا NOT NULL** — الاسترجاعُ يقرأ لقطاتٍ قديمة بـjsonb_populate_record، درسُ 0259):
--   مصفوفةٌ تُضاف ولا تُمسح: `{at, by, reason, before:{amount,date,note}, after:{…}}` لكلّ تعديل — «كان كذا وصار كذا ولماذا
--   ومتى» يراه كلُّ من يرى الدفتر، وسطرُ التدقيق (`audit_all`، 0224) يكتب «كان ← صار» معه. سقفٌ ٥٠ تعديلاً للصفّ.
-- • لا مسَّ لفاتورةٍ ولا دفعة: الرصيدُ السابق مجموعُ الصفوف الحيّة لحظةَ القراءة، فتعديلُ مبلغه يغيّر الرصيدَ وحده؛
--   وتسديدٌ سبق وذهب كلُّه للفواتير (لأن السابقَ كان أصغر) يبقى كما وُزّع.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها (دالّةٌ غائبة 42883/PGRST202) تُخفي زرَّ التعديل.
-- تراجع: drop function company_entry_edit(uuid, numeric, date, text, text, jsonb); (العمودُ يبقى — فارغٌ لكلّ صفٍّ لم يُعدَّل).
-- ============================================================================

set lock_timeout = '5s';

alter table company_entries add column if not exists edits jsonb;

create or replace function public.company_entry_edit(p_entry uuid, p_amount numeric, p_date date, p_note text,
                                                     p_reason text, p_seen jsonb)
returns company_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_e      company_entries;
  v_amt    numeric := round(p_amount, 2);
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_s_amt  numeric;
  v_pool   numeric;
  v_floor  numeric;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  select * into v_e from company_entries where id = p_entry and clinic_id = v_clinic;
  if not found then raise exception 'no_entry' using hint = 'الحركةُ غيرُ موجودة بعيادتك.'; end if;
  -- الدورُ والتاريخُ وقفلُ الشركة (كلُّ كاتبٍ بدفترها يأخذه أوّلاً)؛ ثمّ الصفُّ من جديد تحت القفل.
  perform company_entry_guard(v_e.company_id, p_date, true);
  select * into v_e from company_entries where id = p_entry and clinic_id = v_clinic for update;

  if v_e.voided_at is not null then raise exception 'already_void' using hint = 'الحركةُ ملغاة — ما تتعدّل.'; end if;
  if v_e.kind not in ('opening', 'adjust') then
    raise exception 'not_editable' using hint = 'التسديدُ ما يتعدّل — ألغِه وسجّله من جديد.';
  end if;
  if v_reason is null then raise exception 'reason_required' using hint = 'اكتب سببَ التعديل.'; end if;
  if char_length(v_reason) > 300 then raise exception 'reason_too_long' using hint = 'السببُ طويل — ٣٠٠ حرف على الأكثر.'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_date is null then raise exception 'bad_date' using hint = 'التاريخُ لازم يكون اليوم أو قبله.'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long' using hint = 'الملاحظةُ طويلة — ٥٠٠ حرف على الأكثر.'; end if;
  if v_e.kind = 'adjust' and v_note is null then raise exception 'note_required' using hint = 'اكتب سببَ التسوية.'; end if;

  -- ما رآه المدير لحظةَ فتح النافذة: المبلغُ والتاريخُ والملاحظة كما هي الآن، وإلا كتب فوق ما لم يره.
  begin
    v_s_amt := round((p_seen->>'amount')::numeric, 2);
  exception when others then
    raise exception 'bad_seen' using hint = 'حدّث الصفحة وجرّب مرّة ثانية.';
  end;
  if p_seen is null or v_s_amt is distinct from round(v_e.amount, 2)
     or (p_seen->>'date') is distinct from v_e.entry_date::text
     or nullif(btrim(coalesce(p_seen->>'note', '')), '') is distinct from nullif(btrim(coalesce(v_e.note, '')), '') then
    raise exception 'entry_changed' using hint = 'الحركةُ تغيّرت من جهازٍ ثانٍ بعد ما فتحتها — راجعها وعدّل من جديد.';
  end if;

  if v_amt = round(v_e.amount, 2) and p_date = v_e.entry_date
     and v_note is not distinct from nullif(btrim(coalesce(v_e.note, '')), '') then
    raise exception 'no_change' using hint = 'ما تغيّر شي — غيّر المبلغ أو التاريخ أو الملاحظة.';
  end if;
  if jsonb_array_length(coalesce(v_e.edits, '[]'::jsonb)) >= 50 then
    raise exception 'too_many_edits' using hint = 'هاي الحركة تعدّلت ٥٠ مرّة — ألغِها وسجّلها من جديد.';
  end if;

  -- دَينٌ سُدِّد منه شيءٌ لا ينزل تحت ما سُدِّد (حارسُ الإلغاء نفسُه، بالفرق لا بالمبلغ كلّه).
  if v_e.direction = 'credit' and v_amt < v_e.amount then
    v_pool := case when coalesce(v_e.currency, 'IQD') = 'USD' then company_pool_due_usd(v_e.company_id, v_clinic)
                   else company_pool_due(v_e.company_id, v_clinic) end;
    if v_pool - (v_e.amount - v_amt) < -0.005 then
      v_floor := round(v_e.amount - greatest(v_pool, 0), 2);
      raise exception 'has_payments'
        using hint = 'نزل من هذا الرصيد بتسديدٍ أو خصم '
                     || case when v_floor = trunc(v_floor) then to_char(v_floor, 'FM999,999,999,990')
                             else to_char(v_floor, 'FM999,999,999,990.00') end
                     || ' — ما يصير أقلّ منه. ألغِ التسديد أو الخصم أوّلاً إن كان أقلّ فعلاً.';
    end if;
  end if;

  update company_entries set
    amount = v_amt,
    entry_date = p_date,
    note = v_note,
    edits = coalesce(edits, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(), 'by', auth.uid(), 'reason', v_reason,
      'before', jsonb_build_object('amount', v_e.amount, 'date', v_e.entry_date, 'note', v_e.note),
      'after',  jsonb_build_object('amount', v_amt, 'date', p_date, 'note', v_note)))
   where id = v_e.id and clinic_id = v_clinic
  returning * into v_e;
  return v_e;
end $$;
revoke all on function public.company_entry_edit(uuid, numeric, date, text, text, jsonb) from public, anon;
grant execute on function public.company_entry_edit(uuid, numeric, date, text, text, jsonb) to authenticated;
