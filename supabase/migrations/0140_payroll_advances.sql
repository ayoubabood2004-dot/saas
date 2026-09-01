-- ============================================================================
-- doctorVet — 0140: السحب على حساب الشهر — يُصرف الآن ويُقطع كاملاً بالقسيمة
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- الكتالوج يعرف بنداً اسمه ADV «سحب على حساب الشهر» منذ 0112، ولا مسارٌ
-- بالنظام ينتجه: الموظف يأخذ فلوساً من الدرج بمنتصف الشهر فلا تُسجَّل، ثم
-- تُقطع بيدٍ من راتبه بندَ «استقطاع آخر» — فلا يعرف الصندوق أن فلوساً خرجت،
-- ولا تعرف القسيمة من أين جاء القطع.
--
-- ── التصميم: السحب سلفةٌ قسطُها كلُّها ───────────────────────────────────
-- آليّةُ السلف موجودةٌ ومفحوصة: صرفٌ يُسجَّل مصروفاً لحظتَه (الدرج صحيح)،
-- وسطرٌ بالقسيمة يحمل مرجعَ صفّه، وتسويةٌ عند الاعتماد وحده. فالسحب يركب
-- عليها بعمودٍ واحد: `kind` = 'advance'، والقسطُ يساوي الأصل فيُقطع كاملاً
-- بأقرب قسيمة. والفرقُ الوحيد بالسطر: رمزُه ADV لا LOAN — فهو معفىً من سقف
-- الاستقطاع (فلوسٌ خرجت فعلاً؛ تقييدُها يعني دفعَها مرّتين)، ويُعرض بعموده.
--
-- ── لماذا دالّةٌ جديدة لا وسيطٌ سادس ─────────────────────────────────────
-- `create or replace` بقائمةِ وسائطٍ مختلفة لا يبدّل الدالّة بل يضيف نسخةً
-- ثانية، فيقف PostgREST بين مرشّحَين ويرفض النداءَ القائم. فنترك
-- payroll_disburse_loan كما هي، ونضيف payroll_disburse_advance بتوقيعها.
--
-- ── تصنيفُ المصروف: رواتب لا سلف ─────────────────────────────────────────
-- السلفة ذمّةٌ تُسترجع على أشهر، فهي «payroll_loan». أما السحب فهو راتبُ هذا
-- الشهر دُفع مبكّراً (الدراسة §٥٧٩: «دفعةٌ مقدّمة من راتبٍ مستحقّ»)، فيدخل
-- «payroll» — وبهذا يبقى مجموعُ «payroll» بالشهر = ما دُفع رواتباً فعلاً:
-- الصوافي + السحوبات. ولو شُطب سحبٌ فهو كلفةُ رواتبٍ فعلاً، لا ذمّةً ضائعة.
--
-- ── الاعتماد يسوّي الاثنين ───────────────────────────────────────────────
-- حلقةُ التسوية كانت تقرأ LOAN وحده؛ الآن تقرأ LOAN وADV بنفس المنطق ومعه
-- ثلاثة حرّاس لم تكن: الصفُّ لنفس الموظف، ونوعُه يطابق رمزَ السطر، والمبلغُ
-- لا يتجاوز الباقي. فلا يُطفئ سطرٌ ذمّةَ غيره، ولا يُقطع دينارٌ مرّتين.
--
-- ── ما لا يتغيّر ─────────────────────────────────────────────────────────
-- payroll_save_slips كما هي: ADV بقائمة المعفى من السقف منذ 0112. ولا صفَّ
-- قائمٍ يُمَسّ: العمودُ الجديد يأخذ 'loan' افتراضاً فكلُّ السلف القائمة سلف.
-- والهجرة تُعاد بلا أثرٍ ثانٍ.
--
-- تراجع: drop function payroll_disburse_advance(uuid,numeric,text,text);
--        أعد تعريف payroll_approve من 0112؛ العمود kind يبقى بلا ضرر.
-- ============================================================================

alter table staff_loans add column if not exists kind text not null default 'loan';

do $$ begin
  alter table staff_loans add constraint staff_loans_kind_chk check (kind in ('loan','advance'));
exception when duplicate_object then null; end $$;

-- ── صرفُ سحبٍ على حساب الشهر ─────────────────────────────────────────────
create or replace function payroll_disburse_advance(
  p_staff uuid, p_amount numeric, p_reason text default null, p_method text default 'cash')
returns staff_loans language plpgsql security definer set search_path = public as $$
declare v_l staff_loans; v_exp uuid; v_name text;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select name into v_name from staff where id = p_staff and clinic_id = auth_clinic();
  if v_name is null then raise exception 'staff not in clinic'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;

  -- الفلوس خرجت من الدرج الآن ⇒ مصروفٌ لحظتَه، بتصنيف الرواتب (راتبٌ دُفع مبكّراً).
  insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
  values (auth_clinic(), p_amount,
          'سحب على حساب راتب ' || v_name || ' — ' || to_char(current_date, 'YYYY-MM'),
          'payroll', case when coalesce(p_method,'cash') = 'cash' then 'cash' else 'bank' end,
          auth.uid(), now())
  returning id into v_exp;

  -- القسط = الأصل: يُقطع كاملاً بأقرب قسيمة، وما لم يسعه الراتب يبقى «باقياً» للشهر الجاي.
  insert into staff_loans (clinic_id, staff_id, principal, installment, remaining, reason, expense_id, kind)
  values (auth_clinic(), p_staff, p_amount, p_amount, p_amount, nullif(btrim(p_reason),''), v_exp, 'advance')
  returning * into v_l;

  insert into staff_loan_events (clinic_id, loan_id, kind, amount)
  values (auth_clinic(), v_l.id, 'disbursed', p_amount);
  return v_l;
end $$;
revoke all on function payroll_disburse_advance(uuid, numeric, text, text) from public, anon;
grant execute on function payroll_disburse_advance(uuid, numeric, text, text) to authenticated;

-- ── الاعتماد: يسوّي أقساطَ السلف والسحوبات معاً ───────────────────────────
-- نسخةُ 0112 حرفياً عدا حلقةَ التسوية.
create or replace function payroll_approve(p_run uuid)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run payroll_runs; v_l record; v_loan staff_loans;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_run from payroll_runs where id = p_run and clinic_id = auth_clinic();
  if v_run.id is null then raise exception 'run not found'; end if;
  if v_run.status <> 'calculated' then raise exception 'run must be calculated (is %)', v_run.status; end if;
  if not exists (select 1 from payslips where run_id = p_run) then raise exception 'run has no payslips'; end if;

  -- لا يعتمد أحدٌ راتب نفسه — ما دام غيرُه يقدر (شرح القرار في 0112).
  if exists (select 1 from payslips p join staff s on s.id = p.staff_id
              where p.run_id = p_run and s.user_id = auth.uid())
     and exists (select 1 from memberships m
                  where m.clinic_id = auth_clinic() and m.status = 'active'
                    and m.role = 'manager' and m.user_id <> auth.uid()) then
    raise exception 'self approval not allowed';
  end if;

  -- خصمُ الأقساط والسحوبات من أرصدتها. السطر يحمل معرّفَ صفّه دائماً؛ وبدونه
  -- لا نخمّن — التخمين هنا يطفئ ذمّةً خطأً بصمت. والحرّاس الثلاثة تمنع أن
  -- يُطفئ سطرٌ ذمّةَ موظفٍ آخر، أو من نوعٍ آخر، أو أكثرَ ممّا بقي منها.
  for v_l in
    select pl.amount, pl.code, pl.ref_id, ps.id as payslip_id, ps.staff_id
      from payslip_lines pl join payslips ps on ps.id = pl.payslip_id
     where ps.run_id = p_run and pl.code in ('LOAN','ADV') and pl.amount > 0
  loop
    if v_l.ref_id is null then raise exception 'loan line without loan reference'; end if;
    select * into v_loan from staff_loans
     where id = v_l.ref_id and clinic_id = auth_clinic() and status = 'active' for update;
    if v_loan.id is null then raise exception 'loan % is not active', v_l.ref_id; end if;
    if v_loan.staff_id <> v_l.staff_id then
      raise exception 'loan % belongs to another employee', v_l.ref_id; end if;
    -- الأقواس لازمة: plpgsql يقطع شرطَ IF عند أوّل THEN غير مقوَّس — ومنه THEN الـCASE.
    if v_loan.kind <> (case v_l.code when 'LOAN' then 'loan' else 'advance' end) then
      raise exception 'line % does not match loan kind %', v_l.code, v_loan.kind; end if;
    if v_l.amount > v_loan.remaining then
      raise exception 'line collects more than remaining on %', v_l.ref_id; end if;

    update staff_loans
       set remaining = remaining - v_l.amount,
           status = case when remaining - v_l.amount <= 0 then 'settled' else status end
     where id = v_loan.id;
    insert into staff_loan_events (clinic_id, loan_id, kind, amount, payslip_id)
    values (auth_clinic(), v_loan.id, 'installment', v_l.amount, v_l.payslip_id);
  end loop;

  update payroll_runs set status = 'approved', approved_at = now(), approved_by = auth.uid()
   where id = p_run returning * into v_run;
  return v_run;
end $$;
revoke all on function payroll_approve(uuid) from public, anon;
grant execute on function payroll_approve(uuid) to authenticated;
