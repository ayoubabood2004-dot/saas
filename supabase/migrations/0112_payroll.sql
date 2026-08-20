-- ============================================================================
-- doctorVet — 0112: رواتب الكادر (المرحلة الأولى).
--
-- إضافيّة بالكامل: لا تلمس صفّاً قائماً ولا تغيّر سلوك أي شاشة. العيادة التي
-- لا تفتح صفحة الرواتب لا يتغيّر عندها شيء إطلاقاً.
--
-- ── ثلاثة قرارات تفسّر كل ما تحت ────────────────────────────────────────────
--
-- (١) الأساس النقدي لا الاستحقاق. دراسة docs/payroll-study.html §١٢ اقترحت
--     الاعتراف بالكلفة عند الاعتماد (استحقاق). لكن ماليّة هذا السستم كلّها
--     نقدية: صافي النقد = المُحصّل نقداً − المسحوب نقداً، والتقارير تقرأ
--     المقبوض لا المستحق. وحقن الاستحقاق بنظامٍ نقديّ يحتاج حساب «رواتب
--     مستحقة غير مدفوعة» غير موجود، وبدونه ينكسر الصندوق. فالمرحَّل إلى
--     expenses هنا هو **ما خرج من الدرج فعلاً وحده**:
--        صرف سلفة        → مصروف بتصنيف payroll_loan
--        دفع صافي قسيمة  → مصروف بتصنيف payroll
--     وعلى عمر السلفة يتساوى المجموعان تماماً: السلفة ٣٠٠ + ثلاثة صوافٍ
--     ٥٠٠ = ١٬٨٠٠ = ثلاثة رواتب ٦٠٠. لا ازدواج ولا نقص — لأن القسط ينقص
--     الصافي المدفوع بنفس ما زادته السلفة يوم صرفها.
--
-- (٢) الخادم حارسٌ لا حاسب. حساب القسيمة يسكن src/lib/payroll.ts (دوال نقيّة
--     مفحوصة). إعادة كتابته بـplpgsql تعني منطقين ينحرفان بصمت. فالخادم هنا
--     يتحقّق من **الثوابت** لا يعيد الاشتقاق: الصافي = الإجمالي − القطوعات،
--     ولا صافي سالب، والقطوعات الخاضعة للسقف لا تتجاوزه، والبند التقديري بلا
--     سبب مرفوض، والدورة المعتمدة لا تُكتب. ثابتٌ يُفحص أدقّ من حسابٍ يُكرَّر.
--
-- (٣) الرؤية بالدور الأساسي لا المرفوع. كل ما بهذا الملف يقيس بـ
--     auth_role_base() لا auth_role(): رفع الصلاحية برمز المدير (0048) وُضع
--     لعمليات الواجهة اليومية على جهاز مشترك، ورواتب الكادر ليست منها. من
--     يعرف الرمز يبيع ويطبع، ولا يرى راتب زميله.
--
-- إضافيّة وقابلة لإعادة التشغيل. تُطبَّق بعد 0111.
-- ============================================================================

-- ── ٠) حارس الصلاحية ───────────────────────────────────────────────────────
-- مدير العيادة بدورها الأساسي. العيادات القديمة ذات الحساب الواحد يرجع لها
-- auth_role_base() قيمة 'manager' فيبقى المالك قادراً كما هو.
create or replace function payroll_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role_base() = 'manager';
$$;
revoke all on function payroll_is_admin() from public, anon;
grant execute on function payroll_is_admin() to authenticated;

-- صفّ الكادر العائد لحساب الداخل — به يرى الموظف قسيمته وحدها.
create or replace function payroll_my_staff_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from staff where clinic_id = auth_clinic() and user_id = auth.uid();
$$;
revoke all on function payroll_my_staff_ids() from public, anon;
grant execute on function payroll_my_staff_ids() to authenticated;

-- ── ١) سياسة الرواتب — صفٌّ واحد لكل عيادة ────────────────────────────────
create table if not exists payroll_settings (
  clinic_id          uuid primary key default auth_clinic() references auth.users(id) on delete cascade,
  -- أساس أجر اليوم: الفرق بين ÷٣٠ و÷أيام العمل ١٥٪ على كل يوم غياب، فهو
  -- قرار العيادة لا افتراض السستم، ويُطبع على القسيمة.
  day_rate_basis     text not null default 'calendar_30'
                     check (day_rate_basis in ('calendar_30', 'working_days')),
  working_days       int  not null default 26 check (working_days between 1 and 31),
  -- أقصى ما يُقتطع من الأجر المستحقّ بشهر واحد؛ والزائد يُرحَّل. ٥٠ نقطة
  -- بداية لا حكم قانوني — تُثبَّت من محاسب (الدراسة §١٧).
  deduction_cap_pct  int  not null default 50 check (deduction_cap_pct between 0 and 100),
  round_to           int  not null default 250 check (round_to between 1 and 5000),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default auth.uid()
);

-- ── ٢) هيكل الأجر المؤرَّخ — الزيادة صفٌّ جديد لا تعديل ────────────────────
create table if not exists staff_comp (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  staff_id       uuid not null references staff(id) on delete cascade,
  effective_from date not null,
  base_amount    numeric not null check (base_amount >= 0),
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists staff_comp_lookup_idx on staff_comp(clinic_id, staff_id, effective_from desc);
-- أجرٌ واحد ساري لكل موظف بكل تاريخ — وإلا صار «أي الصفّين الصحيح؟» سؤالاً بلا جواب.
create unique index if not exists staff_comp_one_per_date on staff_comp(staff_id, effective_from);

-- ── ٣) البنود المتكرّرة (بدل نقل، استقطاع ثابت…) ──────────────────────────
create table if not exists staff_recurring (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete cascade,
  code       text not null,
  amount     numeric not null check (amount > 0),
  note       text,
  from_date  date not null default current_date,
  to_date    date,
  created_at timestamptz not null default now()
);
create index if not exists staff_recurring_lookup_idx on staff_recurring(clinic_id, staff_id);

-- ── ٤) الدورة — حالاتها هي مسار الموافقة ──────────────────────────────────
create table if not exists payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  period        date not null,                     -- أول يوم بالشهر
  status        text not null default 'draft'
                check (status in ('draft','calculated','approved','paid','closed')),
  -- لقطة السياسة السارية وقت الاعتماد. بدونها تتغيّر قسيمة السنة الماضية
  -- كلّما غيّرت العيادة سقفها اليوم — وهذا بالضبط ما يمنعه التجميد.
  policy        jsonb,
  calculated_at timestamptz, calculated_by uuid,
  approved_at   timestamptz, approved_by   uuid,
  paid_at       timestamptz,
  closed_at     timestamptz,
  note          text,
  created_at    timestamptz not null default now()
);
create unique index if not exists payroll_runs_one_per_period on payroll_runs(clinic_id, period);

-- ── ٥) القسيمة — مبالغها مخزّنة لا محسوبة عند العرض ───────────────────────
create table if not exists payslips (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  run_id      uuid not null references payroll_runs(id) on delete cascade,
  staff_id    uuid not null references staff(id) on delete cascade,
  -- الاسم لقطةً: حذف الموظف بعد سنة لا يجوز أن يمحو قسائمه من التاريخ.
  staff_name  text not null,
  branch_id   uuid,
  base_amount numeric not null default 0,
  gross       numeric not null default 0 check (gross >= 0),
  deductions  numeric not null default 0 check (deductions >= 0),
  deferred    numeric not null default 0 check (deferred >= 0),
  net         numeric not null default 0 check (net >= 0),
  paid_at     timestamptz,
  pay_method  text check (pay_method in ('cash','bank','wallet')),
  expense_id  uuid,                                -- سطر المصروف المُرحَّل
  created_at  timestamptz not null default now()
);
create unique index if not exists payslips_one_per_staff_run on payslips(run_id, staff_id);
create index if not exists payslips_clinic_idx on payslips(clinic_id, created_at desc);
create index if not exists payslips_staff_idx  on payslips(clinic_id, staff_id);

-- ── ٦) سطور القسيمة — هنا يسكن «سببها» ────────────────────────────────────
create table if not exists payslip_lines (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  payslip_id uuid not null references payslips(id) on delete cascade,
  code       text not null,
  kind       text not null check (kind in ('earning','deduction')),
  qty        numeric,
  rate       numeric,
  amount     numeric not null check (amount >= 0),
  deferred   numeric not null default 0 check (deferred >= 0),
  -- النصّ الحرّ **تحت** البند لا بدلاً عنه: البند يجيب على «شكد مجموع
  -- قطوعات التأخير هالسنة»، والنصّ يجيب على «ليش هذا بالذات».
  reason     text,
  ref_kind   text, ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists payslip_lines_slip_idx on payslip_lines(payslip_id);

-- ── ٧) السلف — ذمّة على الموظف لا مصروف رواتب ─────────────────────────────
create table if not exists staff_loans (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  staff_id     uuid not null references staff(id) on delete cascade,
  principal    numeric not null check (principal > 0),
  installment  numeric not null check (installment > 0),
  remaining    numeric not null check (remaining >= 0),
  reason       text,
  status       text not null default 'active'
               check (status in ('active','settled','written_off')),
  started_on   date not null default current_date,
  expense_id   uuid,                               -- سطر مصروف الصرف النقدي
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists staff_loans_lookup_idx on staff_loans(clinic_id, staff_id, status);

create table if not exists staff_loan_events (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  loan_id    uuid not null references staff_loans(id) on delete cascade,
  kind       text not null check (kind in ('disbursed','installment','written_off')),
  amount     numeric not null,
  payslip_id uuid,
  note       text,
  at         timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists staff_loan_events_loan_idx on staff_loan_events(loan_id, at desc);

-- ── ٨) RLS ────────────────────────────────────────────────────────────────
-- قراءةٌ للمدير بدوره الأساسي، وللموظف قسيمته وسطورها وسلفه وحدها.
-- **ولا سياسة كتابة لأي دور**: كل كتابة تمرّ من دالة SECURITY DEFINER أدناه،
-- لأن سقف الاستقطاع وقاعدة «لا اعتماد لراتب النفس» والتجميد بعد الاعتماد
-- ثلاثتها منطقٌ لا يُعبَّر عنه بسياسة صفوف.
alter table payroll_settings  enable row level security;
alter table staff_comp        enable row level security;
alter table staff_recurring   enable row level security;
alter table payroll_runs      enable row level security;
alter table payslips          enable row level security;
alter table payslip_lines     enable row level security;
alter table staff_loans       enable row level security;
alter table staff_loan_events enable row level security;

drop policy if exists payroll_settings_read on payroll_settings;
create policy payroll_settings_read on payroll_settings for select
  using (clinic_id = auth_clinic());          -- السياسة تُطبع على القسيمة فيراها الجميع

drop policy if exists staff_comp_read on staff_comp;
create policy staff_comp_read on staff_comp for select
  using (clinic_id = auth_clinic() and (payroll_is_admin() or staff_id in (select payroll_my_staff_ids())));

drop policy if exists staff_recurring_read on staff_recurring;
create policy staff_recurring_read on staff_recurring for select
  using (clinic_id = auth_clinic() and (payroll_is_admin() or staff_id in (select payroll_my_staff_ids())));

drop policy if exists payroll_runs_read on payroll_runs;
create policy payroll_runs_read on payroll_runs for select
  using (clinic_id = auth_clinic() and payroll_is_admin());

drop policy if exists payslips_read on payslips;
create policy payslips_read on payslips for select
  using (clinic_id = auth_clinic() and (payroll_is_admin() or staff_id in (select payroll_my_staff_ids())));

drop policy if exists payslip_lines_read on payslip_lines;
create policy payslip_lines_read on payslip_lines for select
  using (clinic_id = auth_clinic() and (payroll_is_admin()
         or exists (select 1 from payslips p where p.id = payslip_id
                    and p.staff_id in (select payroll_my_staff_ids()))));

drop policy if exists staff_loans_read on staff_loans;
create policy staff_loans_read on staff_loans for select
  using (clinic_id = auth_clinic() and (payroll_is_admin() or staff_id in (select payroll_my_staff_ids())));

drop policy if exists staff_loan_events_read on staff_loan_events;
create policy staff_loan_events_read on staff_loan_events for select
  using (clinic_id = auth_clinic() and (payroll_is_admin()
         or exists (select 1 from staff_loans l where l.id = loan_id
                    and l.staff_id in (select payroll_my_staff_ids()))));

-- ── ٩) السياسة: قراءة مضمونة وكتابة محروسة ────────────────────────────────
-- ترجع الافتراضات إن لم يُنشَأ صفّ بعد، فلا تحتاج الواجهة أن تعرف بالفرق.
create or replace function payroll_get_policy() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'dayRateBasis', day_rate_basis, 'workingDays', working_days,
       'deductionCapPct', deduction_cap_pct, 'roundTo', round_to)
     from payroll_settings where clinic_id = auth_clinic()),
    jsonb_build_object('dayRateBasis','calendar_30','workingDays',26,
                       'deductionCapPct',50,'roundTo',250));
$$;
revoke all on function payroll_get_policy() from public, anon;
grant execute on function payroll_get_policy() to authenticated;

create or replace function payroll_set_policy(
  p_basis text, p_working_days int, p_cap_pct int, p_round_to int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  insert into payroll_settings (clinic_id, day_rate_basis, working_days, deduction_cap_pct, round_to, updated_at, updated_by)
  values (auth_clinic(), coalesce(p_basis,'calendar_30'), coalesce(p_working_days,26),
          coalesce(p_cap_pct,50), coalesce(p_round_to,250), now(), auth.uid())
  on conflict (clinic_id) do update
    set day_rate_basis = excluded.day_rate_basis, working_days = excluded.working_days,
        deduction_cap_pct = excluded.deduction_cap_pct, round_to = excluded.round_to,
        updated_at = now(), updated_by = auth.uid();
  return payroll_get_policy();
end $$;
revoke all on function payroll_set_policy(text, int, int, int) from public, anon;
grant execute on function payroll_set_policy(text, int, int, int) to authenticated;

-- ── ١٠) هيكل الأجر ────────────────────────────────────────────────────────
create or replace function payroll_set_comp(
  p_staff uuid, p_from date, p_base numeric, p_note text default null)
returns staff_comp language plpgsql security definer set search_path = public as $$
declare v_row staff_comp;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from staff where id = p_staff and clinic_id = auth_clinic())
    then raise exception 'staff not in clinic'; end if;
  if p_base is null or p_base < 0 then raise exception 'bad amount'; end if;

  insert into staff_comp (clinic_id, staff_id, effective_from, base_amount, note)
  values (auth_clinic(), p_staff, coalesce(p_from, current_date), p_base, nullif(btrim(p_note),''))
  on conflict (staff_id, effective_from) do update
    set base_amount = excluded.base_amount, note = excluded.note, created_by = auth.uid()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function payroll_set_comp(uuid, date, numeric, text) from public, anon;
grant execute on function payroll_set_comp(uuid, date, numeric, text) to authenticated;

create or replace function payroll_delete_comp(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  delete from staff_comp where id = p_id and clinic_id = auth_clinic();
end $$;
revoke all on function payroll_delete_comp(uuid) from public, anon;
grant execute on function payroll_delete_comp(uuid) to authenticated;

create or replace function payroll_set_recurring(
  p_staff uuid, p_code text, p_amount numeric, p_note text default null)
returns staff_recurring language plpgsql security definer set search_path = public as $$
declare v_row staff_recurring;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from staff where id = p_staff and clinic_id = auth_clinic())
    then raise exception 'staff not in clinic'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  insert into staff_recurring (clinic_id, staff_id, code, amount, note)
  values (auth_clinic(), p_staff, p_code, p_amount, nullif(btrim(p_note),''))
  returning * into v_row;
  return v_row;
end $$;
revoke all on function payroll_set_recurring(uuid, text, numeric, text) from public, anon;
grant execute on function payroll_set_recurring(uuid, text, numeric, text) to authenticated;

create or replace function payroll_delete_recurring(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  delete from staff_recurring where id = p_id and clinic_id = auth_clinic();
end $$;
revoke all on function payroll_delete_recurring(uuid) from public, anon;
grant execute on function payroll_delete_recurring(uuid) to authenticated;

-- ── ١١) فتح الدورة ────────────────────────────────────────────────────────
create or replace function payroll_open_run(p_period date)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare v_row payroll_runs; v_p date := date_trunc('month', coalesce(p_period, current_date))::date;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  insert into payroll_runs (clinic_id, period, policy)
  values (auth_clinic(), v_p, payroll_get_policy())
  on conflict (clinic_id, period) do update set period = excluded.period
  returning * into v_row;
  return v_row;
end $$;
revoke all on function payroll_open_run(date) from public, anon;
grant execute on function payroll_open_run(date) to authenticated;

-- ── ١٢) حفظ القسائم — الخادم حارس الثوابت ────────────────────────────────
-- p_slips: [{staff_id, staff_name, branch_id, base_amount, lines:[{code,kind,
--            qty,rate,amount,deferred,reason,ref_kind,ref_id}]}]
-- الإجمالي والقطوعات والصافي **تُحتسب هنا من السطور** لا تُقرأ من العميل:
-- رقمٌ يرسله المتصفّح ويُخزَّن بلا اشتقاق هو رقمٌ يُزوَّر بطلبٍ مصنوع بيد.
create or replace function payroll_save_slips(p_run uuid, p_slips jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run     payroll_runs;
  v_pol     jsonb;
  v_cap_pct int;
  v_round   int;
  v_slip    jsonb; v_line jsonb;
  v_sid     uuid; v_pid uuid;
  v_gross numeric; v_ded numeric; v_defer numeric; v_exempt numeric; v_capped numeric;
  v_cap   numeric; v_n int := 0;
  -- معفاةٌ من السقف: أجرٌ لم يُستحقّ (غياب/إجازة بلا راتب) أو مالٌ خرج فعلاً
  -- (سحب على الحساب). تقييدهما يعني الدفع مقابل ما لم يُعمَل، أو الدفع مرّتين.
  v_exempt_codes text[] := array['ABS','UNPAID','ADV'];
  v_reason_codes text[] := array['BONUS','RETRO','SHORT','DMG','PEN','OTHER'];
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;

  select * into v_run from payroll_runs where id = p_run and clinic_id = auth_clinic();
  if v_run.id is null then raise exception 'run not found'; end if;
  if v_run.status not in ('draft','calculated') then
    raise exception 'run is frozen (%)', v_run.status; end if;

  v_pol := coalesce(v_run.policy, payroll_get_policy());
  v_cap_pct := coalesce((v_pol->>'deductionCapPct')::int, 50);
  v_round   := greatest(1, coalesce((v_pol->>'roundTo')::int, 250));

  -- إعادة الحساب تمحو القديم: الدورة غير المعتمدة مسوّدة، والمسوّدة تُستبدل.
  delete from payslips where run_id = p_run and clinic_id = auth_clinic();

  for v_slip in select * from jsonb_array_elements(coalesce(p_slips, '[]'::jsonb)) loop
    v_sid := (v_slip->>'staff_id')::uuid;
    if not exists (select 1 from staff where id = v_sid and clinic_id = auth_clinic()) then
      raise exception 'staff not in clinic: %', v_sid; end if;

    v_gross := 0; v_ded := 0; v_defer := 0; v_exempt := 0; v_capped := 0;
    for v_line in select * from jsonb_array_elements(coalesce(v_slip->'lines', '[]'::jsonb)) loop
      if (v_line->>'amount')::numeric < 0 or coalesce((v_line->>'deferred')::numeric, 0) < 0 then
        raise exception 'negative line'; end if;
      if (v_line->>'code') = any (v_reason_codes)
         and coalesce(btrim(v_line->>'reason'), '') = '' then
        raise exception 'reason required for %', v_line->>'code'; end if;

      if (v_line->>'kind') = 'earning' then
        v_gross := v_gross + (v_line->>'amount')::numeric;
      else
        v_ded := v_ded + (v_line->>'amount')::numeric;
        v_defer := v_defer + coalesce((v_line->>'deferred')::numeric, 0);
        if (v_line->>'code') = any (v_exempt_codes)
          then v_exempt := v_exempt + (v_line->>'amount')::numeric;
          else v_capped := v_capped + (v_line->>'amount')::numeric; end if;
      end if;
    end loop;

    -- الثابت الأول: لا صافي سالب.
    if v_ded > v_gross then raise exception 'deductions exceed gross for %', v_sid; end if;
    -- الثابت الثاني: السقف. يُحتسب على ما استُحقّ فعلاً، ويُقرَّب مثل الواجهة
    -- تماماً، ثم يُسمح بديناري تسامح لفرق التقريب لا أكثر.
    v_cap := round((greatest(0, v_gross - v_exempt) * v_cap_pct / 100.0) / v_round) * v_round;
    if v_capped > v_cap + 1 then
      raise exception 'deduction cap exceeded for % (% > %)', v_sid, v_capped, v_cap; end if;

    insert into payslips (clinic_id, run_id, staff_id, staff_name, branch_id,
                          base_amount, gross, deductions, deferred, net)
    values (auth_clinic(), p_run, v_sid,
            coalesce(nullif(btrim(v_slip->>'staff_name'), ''), 'موظف'),
            nullif(v_slip->>'branch_id','')::uuid,
            coalesce((v_slip->>'base_amount')::numeric, 0),
            v_gross, v_ded, v_defer, v_gross - v_ded)
    returning id into v_pid;

    insert into payslip_lines (clinic_id, payslip_id, code, kind, qty, rate, amount, deferred, reason, ref_kind, ref_id)
    select auth_clinic(), v_pid, l->>'code', l->>'kind',
           nullif(l->>'qty','')::numeric, nullif(l->>'rate','')::numeric,
           (l->>'amount')::numeric, coalesce((l->>'deferred')::numeric, 0),
           nullif(btrim(l->>'reason'),''), nullif(l->>'ref_kind',''), nullif(l->>'ref_id','')::uuid
    from jsonb_array_elements(coalesce(v_slip->'lines','[]'::jsonb)) l;

    v_n := v_n + 1;
  end loop;

  update payroll_runs set status = 'calculated', calculated_at = now(), calculated_by = auth.uid(),
                          policy = v_pol
   where id = p_run;
  return jsonb_build_object('run', p_run, 'payslips', v_n);
end $$;
revoke all on function payroll_save_slips(uuid, jsonb) from public, anon;
grant execute on function payroll_save_slips(uuid, jsonb) to authenticated;

-- ── ١٣) الاعتماد — نقطة اللارجعة ──────────────────────────────────────────
-- هنا وحدها تُخصم أقساط السلف من أرصدتها: قبل الاعتماد القسيمة قابلة لإعادة
-- الحساب، وخصمُ رصيدٍ من مسوّدةٍ تُحسب عشر مرّات يفني السلفة بلا دفع.
create or replace function payroll_approve(p_run uuid)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run payroll_runs; v_l record;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_run from payroll_runs where id = p_run and clinic_id = auth_clinic();
  if v_run.id is null then raise exception 'run not found'; end if;
  if v_run.status <> 'calculated' then raise exception 'run must be calculated (is %)', v_run.status; end if;
  if not exists (select 1 from payslips where run_id = p_run) then raise exception 'run has no payslips'; end if;

  -- لا يعتمد أحدٌ راتب نفسه — **ما دام غيرُه يقدر**. الشرط الثاني مقصود: عيادة
  -- بمديرٍ واحد هو صاحبها وهو على كشف الرواتب ستقف للأبد بلا معتمِد لو منعناه
  -- منعاً مطلقاً. فحين يكون وحده يُسمح له، ويبقى الأثر: من اعتمد ومتى.
  if exists (select 1 from payslips p join staff s on s.id = p.staff_id
              where p.run_id = p_run and s.user_id = auth.uid())
     and exists (select 1 from memberships m
                  where m.clinic_id = auth_clinic() and m.status = 'active'
                    and m.role = 'manager' and m.user_id <> auth.uid()) then
    raise exception 'self approval not allowed';
  end if;

  -- خصم أقساط السلف من أرصدتها. سطر القسط يحمل معرّف سلفته (ref_id) دائماً؛
  -- وبدونه لا نخمّن «أي سلفة قصد» — التخمين هنا يطفئ ذمّةً خطأً بصمت.
  for v_l in
    select pl.amount, ps.id as payslip_id, pl.ref_id
      from payslip_lines pl join payslips ps on ps.id = pl.payslip_id
     where ps.run_id = p_run and pl.code = 'LOAN' and pl.amount > 0
  loop
    if v_l.ref_id is null then raise exception 'loan line without loan reference'; end if;
    update staff_loans
       set remaining = greatest(0, remaining - v_l.amount),
           status = case when remaining - v_l.amount <= 0 then 'settled' else status end
     where id = v_l.ref_id and clinic_id = auth_clinic() and status = 'active';
    if not found then raise exception 'loan % is not active', v_l.ref_id; end if;
    insert into staff_loan_events (clinic_id, loan_id, kind, amount, payslip_id)
    values (auth_clinic(), v_l.ref_id, 'installment', v_l.amount, v_l.payslip_id);
  end loop;

  update payroll_runs set status = 'approved', approved_at = now(), approved_by = auth.uid()
   where id = p_run returning * into v_run;
  return v_run;
end $$;
revoke all on function payroll_approve(uuid) from public, anon;
grant execute on function payroll_approve(uuid) to authenticated;

-- ── ١٤) الدفع — الترحيل الوحيد لسجل المصروفات ─────────────────────────────
create or replace function payroll_pay_slip(p_slip uuid, p_method text)
returns payslips language plpgsql security definer set search_path = public as $$
declare v_s payslips; v_run payroll_runs; v_exp uuid; v_m text := coalesce(p_method, 'cash');
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select * into v_s from payslips where id = p_slip and clinic_id = auth_clinic();
  if v_s.id is null then raise exception 'payslip not found'; end if;
  if v_s.paid_at is not null then return v_s; end if;   -- idempotent: لا دفع مرّتين
  select * into v_run from payroll_runs where id = v_s.run_id;
  if v_run.status not in ('approved','paid') then
    raise exception 'run not approved (is %)', v_run.status; end if;
  if v_m not in ('cash','bank','wallet') then raise exception 'bad method'; end if;

  -- الترحيل بالصافي المدفوع: هو ما خرج من الدرج فعلاً. أنظر شرح القرار (١).
  if v_s.net > 0 then
    insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
    values (auth_clinic(), v_s.net,
            'راتب ' || v_s.staff_name || ' — ' || to_char(v_run.period, 'YYYY-MM'),
            'payroll', case when v_m = 'cash' then 'cash' else 'bank' end, auth.uid(), now())
    returning id into v_exp;
  end if;

  update payslips set paid_at = now(), pay_method = v_m, expense_id = v_exp
   where id = p_slip returning * into v_s;

  -- انتقال الدورة إلى «مدفوعة» حين لا تبقى قسيمة بلا دفع.
  if not exists (select 1 from payslips where run_id = v_s.run_id and paid_at is null) then
    update payroll_runs set status = 'paid', paid_at = now() where id = v_s.run_id;
  end if;
  return v_s;
end $$;
revoke all on function payroll_pay_slip(uuid, text) from public, anon;
grant execute on function payroll_pay_slip(uuid, text) to authenticated;

create or replace function payroll_close_run(p_run uuid)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run payroll_runs;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  update payroll_runs set status = 'closed', closed_at = now()
   where id = p_run and clinic_id = auth_clinic() and status = 'paid'
   returning * into v_run;
  if v_run.id is null then raise exception 'run must be paid first'; end if;
  return v_run;
end $$;
revoke all on function payroll_close_run(uuid) from public, anon;
grant execute on function payroll_close_run(uuid) to authenticated;

-- ── ١٥) السلف ─────────────────────────────────────────────────────────────
-- الصرف يُنقص الصندوق (مصروف بتصنيف payroll_loan) ولا يُحتسب كلفة رواتب.
create or replace function payroll_disburse_loan(
  p_staff uuid, p_principal numeric, p_installment numeric,
  p_reason text default null, p_method text default 'cash')
returns staff_loans language plpgsql security definer set search_path = public as $$
declare v_l staff_loans; v_exp uuid; v_name text;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  select name into v_name from staff where id = p_staff and clinic_id = auth_clinic();
  if v_name is null then raise exception 'staff not in clinic'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'bad principal'; end if;
  if p_installment is null or p_installment <= 0 then raise exception 'bad installment'; end if;
  if p_installment > p_principal then raise exception 'installment above principal'; end if;

  insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
  values (auth_clinic(), p_principal, 'سلفة ' || v_name, 'payroll_loan',
          case when coalesce(p_method,'cash') = 'cash' then 'cash' else 'bank' end, auth.uid(), now())
  returning id into v_exp;

  insert into staff_loans (clinic_id, staff_id, principal, installment, remaining, reason, expense_id)
  values (auth_clinic(), p_staff, p_principal, p_installment, p_principal, nullif(btrim(p_reason),''), v_exp)
  returning * into v_l;

  insert into staff_loan_events (clinic_id, loan_id, kind, amount)
  values (auth_clinic(), v_l.id, 'disbursed', p_principal);
  return v_l;
end $$;
revoke all on function payroll_disburse_loan(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function payroll_disburse_loan(uuid, numeric, numeric, text, text) to authenticated;

create or replace function payroll_write_off_loan(p_loan uuid, p_note text)
returns staff_loans language plpgsql security definer set search_path = public as $$
declare v_l staff_loans;
begin
  if not payroll_is_admin() then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_note),'') = '' then raise exception 'reason required'; end if;
  update staff_loans set status = 'written_off'
   where id = p_loan and clinic_id = auth_clinic() and status = 'active'
   returning * into v_l;
  if v_l.id is null then raise exception 'loan not active'; end if;
  insert into staff_loan_events (clinic_id, loan_id, kind, amount, note)
  values (auth_clinic(), v_l.id, 'written_off', v_l.remaining, btrim(p_note));
  return v_l;
end $$;
revoke all on function payroll_write_off_loan(uuid, text) from public, anon;
grant execute on function payroll_write_off_loan(uuid, text) to authenticated;

-- ── ١٦) سجل الحركات ───────────────────────────────────────────────────────
-- نفس الوصل الدفاعي المستعمل بكل جدول ماليّ (0044): المشغِّل يبتلع أخطاءه
-- فلا يعطّل كتابةً أبداً، ويقرأ clinic_id من الصفّ فيصير التحديد تلقائياً.
do $$
declare t text;
begin
  foreach t in array array['staff_comp','payroll_runs','payslips','staff_loans','payroll_settings'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists audit_all on %I', t);
      execute format('create trigger audit_all after insert or update or delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- VERIFY (كمدير عيادة):
--   select payroll_get_policy();                       -- الافتراضات
--   select * from payroll_runs order by period desc;   -- صفر صفوف قبل أول دورة
--   select * from staff_loans where status = 'active'; -- الذمم القائمة
-- VERIFY (كموظف غير مدير): الاستعلامان الأول والثاني يرجعان صفر صفوف، وقسيمته
--   وحدها تظهر من payslips.
-- ============================================================================
