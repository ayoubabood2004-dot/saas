-- ============================================================================
-- ٠١٤٣ — فكّ الاعتماد: الدورة ترجع مسوّدةً كما كانت، بلا ذمّةٍ تضيع
--
-- «أضغط اعتماد فتصير معتمدة وما أكدر أعدّل — أريد أتراجع».
--
-- والاعتماد ليس ختماً على ورقة: هو يسوّي **ثلاثة** أشياء معاً —
--   ١) يخصم أقساط السلف والسحوبات من أرصدتها (staff_loans.remaining)،
--   ٢) ويطفئ ما بلغ الصفر منها (status = 'settled')،
--   ٣) ويكتب لكل خصمٍ حدثاً بالسجل (staff_loan_events kind='installment')،
-- ثم يقلب حالة الدورة.
--
-- فمن يفكّ الاعتماد بقلب الحالة وحدها يترك القسط مخصوماً وصاحبَه مديناً بما
-- سدّده. ولهذا يمشي الفكُّ على **الأحداث** لا على السطور: الحدثُ هو ما جرى
-- فعلاً، والسطرُ نيّةٌ قد تكون تغيّرت. نرجّع كلَّ حدثٍ لرصيده ثم نمحوه، فيعود
-- الرصيد إلى ما كان بالضبط.
--
-- والقسيمةُ المدفوعة تمنع الفكّ. الفلوس خرجت من الدرج وبيد الموظف ورقةٌ
-- مطبوعة؛ فليُفَكّ التسليم أوّلاً (0142) ثم يُفَكّ الاعتماد — خطوتان مقصودتان
-- لا خطوةٌ واحدة تمحو كلَّ شيء بضغطة.
-- ==========================================================================*/

create or replace function payroll_unapprove_run(p_run uuid)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run payroll_runs; v_e record; v_paid int;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_run from payroll_runs where id = p_run and clinic_id = auth_clinic();
  if v_run.id is null then raise exception 'run not found'; end if;
  if v_run.status = 'closed' then raise exception 'run is closed'; end if;

  -- الصرفُ يُفحص **قبل** الحالة عن قصد: صرفُ آخر قسيمةٍ يقلب الدورة إلى
  -- «مدفوعة»، فلو قدّمنا فحصَ الحالة لقال الخطأ «ليست معتمدة» — وهي جملةٌ
  -- صحيحةٌ لا تدلّ على شيء. المستعمل يحتاج أن يُقال له ما يفعل: فكّ التسليم.
  select count(*) into v_paid from payslips
   where run_id = p_run and clinic_id = auth_clinic() and paid_at is not null;
  if v_paid > 0 then
    raise exception 'run has % paid payslip(s) — undo the payment first', v_paid; end if;

  if v_run.status <> 'approved' then
    raise exception 'run is not approved (is %)', v_run.status; end if;

  -- إرجاعُ ما خُصم، حدثاً حدثاً. القفلُ على صفّ السلفة يمنع أن يمرّ اعتمادٌ
  -- آخر بالأثناء فيبني على رصيدٍ نحن بصدد تغييره.
  for v_e in
    select e.id, e.loan_id, e.amount
      from staff_loan_events e
      join payslips ps on ps.id = e.payslip_id
     where ps.run_id = p_run and e.clinic_id = auth_clinic() and e.kind = 'installment'
     for update of e
  loop
    -- المشطوبة لا تُحيا: شطبُها قرارٌ لاحقٌ مستقلّ عن هذي الدورة، وإحياؤها
    -- بفكّ اعتمادٍ يعيد ذمّةً أُسقطت عمداً.
    update staff_loans
       set remaining = remaining + v_e.amount,
           status = case when status = 'settled' then 'active' else status end
     where id = v_e.loan_id and clinic_id = auth_clinic() and status <> 'written_off';
    delete from staff_loan_events where id = v_e.id;
  end loop;

  -- «محسوبة» لا «مسوّدة»: القسائم ما زالت موجودةً وقابلةً لإعادة الحساب،
  -- وبهذا يفكّ 0142 تجميدَ بنود الشهر فيصير التعديل ممكناً من جديد.
  update payroll_runs
     set status = 'calculated', approved_at = null, approved_by = null
   where id = p_run returning * into v_run;
  return v_run;
end $$;
revoke all on function payroll_unapprove_run(uuid) from public, anon;
grant execute on function payroll_unapprove_run(uuid) to authenticated;
