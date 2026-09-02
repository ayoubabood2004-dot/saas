-- ============================================================================
-- ٠١٤٢ — البند اليدوي يصير صفّاً بالقاعدة، ويُتراجَع عنه، والتسليم يُفكّ
--
-- ثلاث شكاوى من العيادة، وجذرُها واحد:
--
--   ١) «ما يصير عندي غير قطعٍ واحد» — البند اليدوي كان يعيش بذاكرة المتصفّح
--      وحدها. يُضاف، ثم «احسب» يحفظه ويمسح الذاكرة. وإعادةُ الحساب تبدأ بـ
--      delete from payslips، فتبني القسيمة من (الراتب + الثوابت + السلف +
--      ذاكرةٍ صارت فارغة) — والقطعُ الأول يُمحى. فليس السقفُ واحداً باليوم،
--      بل واحدٌ لكل إعادة حساب: آخرُ ما أُدخل يبقى وما قبله يزول بصمت.
--
--   ٢) «دُست تسليم غلطاً وما أكدر أرجع» — payroll_pay_slip يكتب مصروفاً
--      ويختم paid_at، وما كان له نقيض. فغلطةُ ضغطةٍ تصير قيداً أبدياً.
--
--   ٣) «أريد أتراجع عن قطعٍ بعد يومين، كلَّه أو بعضَه» — ما كان ثمّة صفٌّ
--      ثابتٌ يُشار إليه أصلاً، فلا شيء يُتراجع عنه.
--
-- والعلاج واحد: البند اليدوي يصير صفّاً دائماً بجدولٍ مفتاحُه (الموظف، الشهر).
-- فإعادةُ الحساب تصير **قابلةً للتكرار**: تقرأ الصفوف وتبني منها، فتُعطي نفس
-- النتيجة مهما تكرّرت، وتتراكم القطوعات بدل أن يمحو أحدُها الآخر.
--
-- والتراجعُ لا يُحذف بل يُقيَّد: reversed_amount ينمو، والمبلغُ النافذ هو
-- (amount − reversed_amount). فيبقى بالسجل أن قطعاً وقع ثم رُدّ — وهذا
-- بالضبط ما يحتاجه موظفٌ يسأل «ليش انقطع مني؟» بعد ثلاثة أشهر.
-- ==========================================================================*/

-- ── ١) الجدول ─────────────────────────────────────────────────────────────
create table if not exists payroll_adjustments (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete cascade,
  period     date not null,                       -- أول يوم بالشهر
  code       text not null,
  -- أحدهما يُملأ: البنود المحسوبة بالأيام (غياب/إجازة بلا راتب) تأخذ qty،
  -- والبقية تأخذ amount. والحساب يبقى بيد payroll.ts كما هو.
  amount     numeric not null default 0 check (amount >= 0),
  qty        numeric check (qty is null or qty > 0),
  reason     text,
  -- ما رُدّ من هذا البند. لا يتجاوز الأصل، ولا ينقص أبداً (سجلٌّ لا حساب).
  reversed_amount numeric not null default 0 check (reversed_amount >= 0),
  reversed_qty    numeric not null default 0 check (reversed_qty >= 0),
  reversed_at     timestamptz,
  reversed_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint payroll_adjustments_not_over_reversed
    check (reversed_amount <= amount and (qty is null or reversed_qty <= qty))
);
create index if not exists payroll_adjustments_lookup_idx
  on payroll_adjustments(clinic_id, period, staff_id);
-- ومفتاحُ الموظف يحتاج فهرسَه وحده: الفهرسُ أعلاه صدرُه clinic_id، فلا يخدم
-- حذفَ موظفٍ (on delete cascade) الذي يبحث بـstaff_id مجرَّداً.
create index if not exists payroll_adjustments_staff_idx
  on payroll_adjustments(staff_id);

alter table payroll_adjustments enable row level security;

-- قراءةٌ للمدير، وللموظف بنودُه وحدها. ولا سياسةَ كتابة: كل كتابةٍ تمرّ من
-- دالّة أدناه، لأن «الدورة مجمّدة» شرطٌ لا يُعبَّر عنه بسياسة صفوف.
drop policy if exists payroll_adjustments_read on payroll_adjustments;
-- النداءات ملفوفةٌ بـ(select …) قصداً: النداءُ العاري يُعاد تقييمه لكل صفّ،
-- والملفوفُ مرّةً واحدة للاستعلام كلّه (initplan).
create policy payroll_adjustments_read on payroll_adjustments for select
  using (clinic_id = (select auth_clinic())
         and ((select payroll_is_admin()) or staff_id in (select payroll_my_staff_ids())));

-- ── ٢) هل شهرُ هذا البند مجمَّد؟ ───────────────────────────────────────────
-- بعد الاعتماد تصير القسيمة وثيقة: قسائمُ مطبوعةٌ بيد الموظفين، وأقساطُ سلفٍ
-- خُصمت من أرصدتها. فتعديلُ الشهر المعتمَد ممنوع — والردُّ يذهب للشهر الجاي.
create or replace function payroll_period_frozen(p_period date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from payroll_runs
     where clinic_id = auth_clinic()
       and period = date_trunc('month', p_period)::date
       and status in ('approved','paid','closed'));
$$;
revoke all on function payroll_period_frozen(date) from public, anon;
grant execute on function payroll_period_frozen(date) to authenticated;

-- ── ٣) إضافة بند ──────────────────────────────────────────────────────────
create or replace function payroll_add_adjustment(
  p_staff uuid, p_period date, p_code text,
  p_amount numeric default 0, p_qty numeric default null, p_reason text default null)
returns payroll_adjustments language plpgsql security definer set search_path = public as $$
declare v_row payroll_adjustments; v_p date := date_trunc('month', p_period)::date;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from staff where id = p_staff and clinic_id = auth_clinic())
    then raise exception 'staff not in clinic'; end if;
  if payroll_period_frozen(v_p) then raise exception 'period is frozen'; end if;
  -- بندٌ بلا مقدار لا معنى له: يمرّ صامتاً بالقسيمة فيبدو أنه طُبّق.
  if coalesce(p_qty, 0) <= 0 and coalesce(p_amount, 0) <= 0 then
    raise exception 'bad amount'; end if;

  insert into payroll_adjustments (clinic_id, staff_id, period, code, amount, qty, reason)
  values (auth_clinic(), p_staff, v_p, p_code,
          coalesce(p_amount, 0), p_qty, nullif(btrim(p_reason), ''))
  returning * into v_row;
  return v_row;
end $$;
revoke all on function payroll_add_adjustment(uuid, date, text, numeric, numeric, text) from public, anon;
grant execute on function payroll_add_adjustment(uuid, date, text, numeric, numeric, text) to authenticated;

-- ── ٤) حذف بند — قبل الاعتماد وحده ────────────────────────────────────────
-- ما دامت الدورة مسوّدة فالبندُ خطأٌ إملائيّ يُمحى. بعد الاعتماد يُردّ ولا يُمحى.
create or replace function payroll_delete_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_row payroll_adjustments;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_row from payroll_adjustments where id = p_id and clinic_id = auth_clinic();
  if v_row.id is null then raise exception 'adjustment not found'; end if;
  if payroll_period_frozen(v_row.period) then raise exception 'period is frozen'; end if;
  delete from payroll_adjustments where id = p_id and clinic_id = auth_clinic();
end $$;
revoke all on function payroll_delete_adjustment(uuid) from public, anon;
grant execute on function payroll_delete_adjustment(uuid) to authenticated;

-- ── ٥) التراجع — كلّه أو بعضُه ────────────────────────────────────────────
-- p_amount فارغاً ⇒ ردٌّ كامل لما تبقّى. وإلا ردٌّ جزئيّ بمقداره.
-- ولا يُحذف الأصل: يبقى ظاهراً بمبلغه، ومعه ما رُدّ منه — فيقرأ الموظف القصّة
-- كاملةً بقسيمته بدل أن يجد رقماً تغيّر بلا تفسير.
create or replace function payroll_reverse_adjustment(
  p_id uuid, p_amount numeric default null, p_qty numeric default null,
  p_reason text default null)
returns payroll_adjustments language plpgsql security definer set search_path = public as $$
declare
  v_row payroll_adjustments;
  v_left_amt numeric; v_left_qty numeric;
  v_amt numeric; v_qty numeric;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_row from payroll_adjustments where id = p_id and clinic_id = auth_clinic();
  if v_row.id is null then raise exception 'adjustment not found'; end if;
  if payroll_period_frozen(v_row.period) then raise exception 'period is frozen'; end if;

  v_left_amt := v_row.amount - v_row.reversed_amount;
  v_left_qty := coalesce(v_row.qty, 0) - v_row.reversed_qty;
  if v_left_amt <= 0 and v_left_qty <= 0 then raise exception 'already reversed'; end if;

  -- بندُ الأيام يُردّ بالأيام، وغيرُه بالمبلغ. وردٌّ بلا مقدارٍ يعني «كلّه».
  if v_row.qty is not null then
    v_qty := least(coalesce(p_qty, v_left_qty), v_left_qty);
    if v_qty <= 0 then raise exception 'bad amount'; end if;
    v_amt := 0;
  else
    v_amt := least(coalesce(p_amount, v_left_amt), v_left_amt);
    if v_amt <= 0 then raise exception 'bad amount'; end if;
    v_qty := 0;
  end if;

  update payroll_adjustments
     set reversed_amount = reversed_amount + v_amt,
         reversed_qty    = reversed_qty + v_qty,
         reversed_at     = now(),
         reversed_reason = coalesce(nullif(btrim(p_reason), ''), reversed_reason)
   where id = p_id
   returning * into v_row;
  return v_row;
end $$;
revoke all on function payroll_reverse_adjustment(uuid, numeric, numeric, text) from public, anon;
grant execute on function payroll_reverse_adjustment(uuid, numeric, numeric, text) to authenticated;

-- ── ٦) فكّ التسليم ────────────────────────────────────────────────────────
-- الدفع يخرج فلوساً من الدرج ويكتب مصروفاً. ففكُّه لازم يمحو ذاك المصروف
-- بالضبط — لا مصروفاً يشبهه — ولهذا نمسك expense_id المخزون بالقسيمة.
-- والدورةُ المقفلة لا تُفَكّ: القفل إعلانُ ختامٍ محاسبيّ لا ضغطةُ زر.
create or replace function payroll_unpay_slip(p_slip uuid)
returns payslips language plpgsql security definer set search_path = public as $$
declare v_s payslips; v_run payroll_runs;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_s from payslips where id = p_slip and clinic_id = auth_clinic();
  if v_s.id is null then raise exception 'payslip not found'; end if;
  if v_s.paid_at is null then return v_s; end if;         -- نقيضٌ متعادل: فكُّ ما لم يُدفع لا شيء

  select * into v_run from payroll_runs where id = v_s.run_id;
  if v_run.status = 'closed' then raise exception 'run is closed'; end if;

  if v_s.expense_id is not null then
    delete from expenses where id = v_s.expense_id and clinic_id = auth_clinic();
  end if;

  update payslips set paid_at = null, pay_method = null, expense_id = null
   where id = p_slip returning * into v_s;

  -- الدورة رجعت ناقصةَ دفعٍ ⇒ ترجع «معتمدة».
  update payroll_runs set status = 'approved', paid_at = null
   where id = v_s.run_id and status = 'paid';
  return v_s;
end $$;
revoke all on function payroll_unpay_slip(uuid) from public, anon;
grant execute on function payroll_unpay_slip(uuid) to authenticated;
