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
-- • `company_entry_void` يقرأ الصفَّ **من جديد تحت القفل** (نصُّ 0274 وسطرٌ معلَّم): كان يقرؤه قبل قفل الشركة ولا يعيده — آمنٌ ما دام
--   المبلغُ لا يتغيّر، وكاذبٌ منذ التعديل: رصيدٌ ٥٠٠ عليه تسديدٌ ٣٠٠، مديرٌ يرفعه لـ١٠٠٠ وآخرُ يلغيه بالثانية نفسِها — الإلغاءُ ينتظر القفلَ
--   ثمّ يحكم بالـ٥٠٠ القديمة (٧٠٠ − ٥٠٠ ≥ ٠) فيمرّ، ويبقى تسديدٌ ٣٠٠ بلا دَين (مراجعةٌ عدائيّة). حارسُ الانجراف على بصمة جسم 0274.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها (دالّةٌ غائبة 42883/PGRST202) تُخفي زرَّ التعديل.
-- تراجع: drop function company_entry_edit(uuid, numeric, date, text, text, jsonb); وcompany_entry_void بنصّ 0274 حرفاً
--   (العمودُ يبقى — فارغٌ لكلّ صفٍّ لم يُعدَّل).
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تبني عليه، والحارسُ لما يُعاد — قبل أيّ تعريف ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.company_pool_due_usd(uuid,uuid)') is null then
    raise exception 'needs_0274' using hint = 'طبّق 0274 (الشراء ودفتر الشركة بالعملتين) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.company_entry_void(uuid,text)', '348a579ec2788dfba10ebff86600abf1', '-- +0281');

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

-- ── الإلغاءُ يحكم بالصفّ كما هو تحت القفل (نصُّ 0274 وسطرٌ معلَّم) ─────────────────────────────────────────
create or replace function public.company_entry_void(p_entry uuid, p_reason text)
returns company_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_e      company_entries;
  v_pp     record;
  v_detail jsonb := '[]'::jsonb;
  v_paid   numeric;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  select * into v_e from company_entries where id = p_entry and clinic_id = v_clinic;
  if not found then raise exception 'no_entry' using hint = 'الحركةُ غيرُ موجودة بعيادتك.'; end if;
  perform company_entry_guard(v_e.company_id, null, true);
  select * into v_e from company_entries where id = p_entry and clinic_id = v_clinic for update;   -- +0281
  if v_e.voided_at is not null then raise exception 'already_void' using hint = 'الحركةُ ملغاةٌ أصلاً.'; end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using hint = 'اكتب سببَ الإلغاء.';
  end if;

  -- دَينٌ سُدِّد منه شيءٌ لا يُلغى قبل تسديده: وإلا بقي تسديدٌ بلا دين.
-- -0274   if v_e.direction = 'credit' and company_pool_due(v_e.company_id, v_clinic) - v_e.amount < -0.005 then
  if v_e.direction = 'credit'   -- +0274
     and (case when coalesce(v_e.currency, 'IQD') = 'USD' then company_pool_due_usd(v_e.company_id, v_clinic)   -- +0274
               else company_pool_due(v_e.company_id, v_clinic) end) - v_e.amount < -0.005 then   -- +0274
    raise exception 'has_payments' using hint = 'انسدّ من هذا الرصيد — ألغِ التسديد أوّلاً.';
  end if;

  if v_e.kind = 'payment' then
    perform set_config('doctorvet.usd_purchase_door', 'on', true);   -- +0274
    for v_pp in
      select pp.* from purchase_payments pp
       where pp.entry_id = v_e.id and pp.clinic_id = v_clinic
       order by pp.paid_at desc
    loop
-- -0274       v_detail := v_detail || jsonb_build_object('purchase_id', v_pp.purchase_id, 'amount', v_pp.amount, 'paid_at', v_pp.paid_at);
      v_detail := v_detail || jsonb_build_object('purchase_id', v_pp.purchase_id, 'amount', v_pp.amount, 'paid_at', v_pp.paid_at,   -- +0274
                                                 'usd', v_pp.usd);   -- +0274
      select coalesce(amount_paid, total) into v_paid from purchases
       where id = v_pp.purchase_id and clinic_id = v_clinic for update;
      if found then
        update purchases set
          amount_paid = greatest(0, v_paid - v_pp.amount),
          paid_usd = case when currency = 'USD' then greatest(0, coalesce(paid_usd, 0) - coalesce(v_pp.usd, 0)) end,   -- +0274
-- -0274           status = case when greatest(0, v_paid - v_pp.amount) >= total then 'paid'
          status = case when currency = 'USD' then _usd_purchase_status(total_usd, greatest(0, coalesce(paid_usd, 0) - coalesce(v_pp.usd, 0)))   -- +0274
                        when greatest(0, v_paid - v_pp.amount) >= total then 'paid'   -- +0274
                        when greatest(0, v_paid - v_pp.amount) <= 0 then 'unpaid' else 'partial' end
         where id = v_pp.purchase_id and clinic_id = v_clinic;
      end if;
      delete from purchase_payments where id = v_pp.id and clinic_id = v_clinic;
    end loop;
    perform set_config('doctorvet.usd_purchase_door', 'off', true);   -- +0274
  end if;

  update company_entries set
    voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason),
    void_detail = case when v_e.kind = 'payment' then v_detail else null end
   where id = v_e.id and clinic_id = v_clinic
  returning * into v_e;
  return v_e;
end $$;
revoke all on function public.company_entry_void(uuid, text) from public, anon;
grant execute on function public.company_entry_void(uuid, text) to authenticated;
