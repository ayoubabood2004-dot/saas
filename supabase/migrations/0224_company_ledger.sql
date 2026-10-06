-- ============================================================================
-- ٠٢٢٤ — دفترُ كلِّ شركة: رصيدٌ قبل النظام، وتسديدٌ على الحساب، وإلغاءٌ لا محو
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- دفترُ المورّدين (0076) يعرف ديناً واحداً: فاتورةُ شراءٍ ناقصَ ما سُدِّد منها.
-- والعيادةُ تعرف دَيناً قبله: «علينا لهاي الشركة تسع ملايين من قبل ما نشتغل
-- بالسستم». لا مكانَ له اليوم إلا مطالبةً يدويّة (0155) تُطوى كاملةً أو لا —
-- فتسديدُ ثلاثةِ ملايين منها لا يُقيَّد. ثم التسديدُ نفسُه: الشركةُ تستلم مبلغاً
-- «على الحساب» لا على فاتورة، والشاشةُ كانت توزّعه من المتصفّح فاتورةً فاتورة
-- (نداءٌ لكلّ واحدة) — انقطاعُ الشبكة بالنصف يترك نصفَ تسديد.
--
-- المقيسُ على الإنتاج قبل البناء (٦/١٠): ٦٤ شركة، ٢٠٥ فاتورة، ١٨ منها عليها
-- دين (١٢٬٧٠٣٬٧٧١)، و١٢ دفعةً مسجّلة فقط. و١٧٨ فاتورةً دفعُها عند الشراء غيرُ
-- مسجَّلٍ كدفعة (مجموعُه ٦٥٬٢٠٠٬٤٠٣) — **لا يُرحَّل**: يُشتقّ بالعرض
-- (`amount_paid` ناقصَ الدفعات المسجّلة)، فلا ١٧٨ سطراً تهبط بسجلّ حركات العيادات.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- • صفوفُ `company_entries` ثلاثةُ أنواع: `opening` (رصيدٌ قبل النظام، علينا)،
--   `payment` (تسديدٌ على الحساب، لنا)، `adjust` (تسويةٌ بالاتّجاهين: خصمٌ من
--   الشركة أو فرقٌ علينا). والقراءةُ للعيادة، **والكتابةُ من الدوالّ وحدها**.
-- • التسديدُ على الحساب صفٌّ واحد بمبلغه كاملاً، **يُوزَّع بالقاعدة بمعاملةٍ
--   واحدة**: الرصيدُ السابق أوّلاً (هو الأقدم بتعريفه)، ثم الفواتير من الأقدم.
--   ما ذهب لفاتورةٍ يُكتب دفعتَها بـ`purchase_payments` حاملاً `entry_id` —
--   فكلُّ شاشةٍ قديمة تقرأ `amount_paid` تبقى صادقة، والدفترُ يعرض السطرَ مرّةً
--   واحدة بتوزيعه.
-- • لا تسديدَ أكثرَ من الدين (بلا رصيدٍ دائنٍ بهذه المرحلة) — رفضٌ بالرقم.
-- • الإلغاءُ ختمٌ لا حذف: الصفُّ يبقى بسببه ومن ألغاه. وإلغاءُ تسديدٍ يردّ ما
--   وزّعه على الفواتير (ويحفظ صورةَ الدفعات بالصفّ). ورصيدٌ سابقٌ سُدِّد منه شيءٌ
--   لا يُلغى قبل إلغاء تسديده — وإلا صار التسديدُ معلّقاً بلا دين.
-- • الطيُّ والحذفُ والاسترجاع: محفّزان على `companies` بلا لمسِ دوالّها —
--   قبل الحذف: طيٌّ ⇒ الصفوفُ تنتقل حيّةً للباقية ومعرّفاتُها بالسلّة؛ حذفٌ
--   صريح ⇒ الصفوفُ كاملةً بالسلّة (cascade يمحوها). وبعد الإدراج (الاسترجاعُ
--   يُدرج بنفس المعرّف): تُعاد.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0223.
-- تراجع: drop الدوالّ والمحفّزين ثم الجدول والعمودين (لا تمسّ صفّاً قديماً).
-- ============================================================================

set lock_timeout = '5s';

create table if not exists company_entries (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  company_id    uuid not null references companies(id) on delete cascade,
  kind          text not null check (kind in ('opening', 'payment', 'adjust')),
  -- credit = يزيد ما علينا للشركة، debit = ينقصه.
  direction     text not null check (direction in ('credit', 'debit')),
  amount        numeric not null check (amount > 0),
  -- يومُ بغداد لا يومُ الخادم (درس 0154).
  entry_date    date not null default (now() at time zone 'Asia/Baghdad')::date,
  method        text check (method is null or method in ('cash', 'card', 'transfer')),
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid,
  void_reason   text check (void_reason is null or char_length(void_reason) <= 300),
  -- صورةُ دفعات الفواتير التي ردّها إلغاءُ تسديد — بها يُعرف ما كان.
  void_detail   jsonb,
  constraint company_entries_kind_dir check (
    (kind = 'opening' and direction = 'credit') or
    (kind = 'payment' and direction = 'debit') or
    kind = 'adjust')
);

create index if not exists company_entries_company_idx on company_entries(company_id, entry_date);
create index if not exists company_entries_clinic_idx  on company_entries(clinic_id, entry_date desc);

alter table company_entries enable row level security;

-- قراءةٌ للعيادة وحدها، ولا سياسةَ كتابة: كلُّ كتابةٍ من دالّةٍ تفحص الدورَ بنفسها.
drop policy if exists company_entries_select on company_entries;
create policy company_entries_select on company_entries for select
  using (clinic_id = (select auth_clinic()));

drop trigger if exists audit_all on company_entries;
create trigger audit_all after insert or update or delete on company_entries
  for each row execute function audit_change();

select public.photographer_fence_table('company_entries');

-- دفعةُ فاتورةٍ جاءت من تسديدٍ على الحساب تحمل صفَّه.
alter table purchase_payments add column if not exists entry_id uuid references company_entries(id) on delete set null;
create index if not exists purchase_payments_entry_idx on purchase_payments(entry_id);

-- السلّةُ تحمل صفوفَ الدفتر: معرّفاتُها بالطيّ، وصفوفُها كاملةً بالحذف الصريح.
alter table companies_trash add column if not exists entry_ids uuid[] not null default '{}';
alter table companies_trash add column if not exists entries jsonb not null default '[]'::jsonb;

-- ── أدواتٌ داخلية ─────────────────────────────────────────────────────────
-- الرصيدُ السابق القائم (ما لم يُسدَّد من رصيدٍ قبل النظام وتسوياته):
-- دائنُ الصفوف الحيّة ناقصَ مدينها، والتسديدُ يُحسب منه ما **لم** يذهب لفاتورة.
create or replace function public.company_pool_due(p_company uuid, p_clinic uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case
           when e.direction = 'credit' then e.amount
           when e.kind = 'payment' then -(e.amount - coalesce((
             select sum(pp.amount) from purchase_payments pp
              where pp.entry_id = e.id and pp.clinic_id = p_clinic), 0))
           else -e.amount end), 0)
    from company_entries e
   where e.company_id = p_company and e.clinic_id = p_clinic and e.voided_at is null;
$$;
revoke all on function public.company_pool_due(uuid, uuid) from public, anon, authenticated;

create or replace function public.company_entry_guard(p_company uuid, p_date date, p_manager boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if p_manager and v_role <> 'manager' then
    raise exception 'forbidden' using hint = 'الرصيدُ السابق والتسويةُ والإلغاءُ للمدير.';
  end if;
  if not p_manager and v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'التسديدُ للمدير والطبيب.';
  end if;
  if p_date is not null and (p_date > (now() at time zone 'Asia/Baghdad')::date or p_date < date '2000-01-01') then
    raise exception 'bad_date' using hint = 'التاريخُ لازم يكون اليوم أو قبله.';
  end if;
  -- قفلُ صفّ الشركة يُسلسل كتاباتِ دفترها: تسديدان متزامنان لا يوزّعان نفسَ الدين.
  perform 1 from companies where id = p_company and clinic_id = v_clinic for update;
  if not found then raise exception 'no_company' using hint = 'الشركةُ غيرُ موجودة بعيادتك.'; end if;
  return v_clinic;
end $$;
revoke all on function public.company_entry_guard(uuid, date, boolean) from public, anon, authenticated;

-- ── الرصيدُ السابق ───────────────────────────────────────────────────────
create or replace function public.company_opening_add(p_company uuid, p_amount numeric, p_date date, p_note text default null)
returns company_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_amt    numeric := round(coalesce(p_amount, 0), 2);
  v_row    company_entries;
begin
  v_clinic := company_entry_guard(p_company, p_date, true);
  if v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  -- رصيدٌ سابقٌ واحدٌ حيّ لكلّ شركة — الثاني تكرارٌ أكثرَ منه حقيقة. (شركتان
  -- طُويتا قد تحملان اثنين، وهذا صحيح: دفتران ورقيّان صارا واحداً.)
  if exists (select 1 from company_entries where company_id = p_company and clinic_id = v_clinic
              and kind = 'opening' and voided_at is null) then
    raise exception 'opening_exists' using hint = 'لهاي الشركة رصيدٌ سابق — ألغِه أوّلاً إن كان غلطاً.';
  end if;
  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, note)
  values (v_clinic, p_company, 'opening', 'credit', v_amt,
          coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date), nullif(btrim(p_note), ''))
  returning * into v_row;
  return v_row;
end $$;

-- ── التسوية ──────────────────────────────────────────────────────────────
create or replace function public.company_adjust(p_company uuid, p_direction text, p_amount numeric, p_date date, p_note text)
returns company_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_amt    numeric := round(coalesce(p_amount, 0), 2);
  v_row    company_entries;
begin
  v_clinic := company_entry_guard(p_company, p_date, true);
  if v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_direction not in ('credit', 'debit') then raise exception 'bad_direction'; end if;
  -- التسويةُ بلا سببٍ مكتوب رقمٌ لا يُفهم بعد شهر.
  if nullif(btrim(p_note), '') is null then
    raise exception 'note_required' using hint = 'اكتب سببَ التسوية.';
  end if;
  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, note)
  values (v_clinic, p_company, 'adjust', p_direction, v_amt,
          coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date), btrim(p_note))
  returning * into v_row;
  return v_row;
end $$;

-- ── التسديدُ على الحساب ──────────────────────────────────────────────────
create or replace function public.company_pay(p_company uuid, p_amount numeric, p_method text, p_date date, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_day     date := coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date);
  v_at      timestamptz;
  v_pool    numeric;
  v_inv     numeric;
  v_left    numeric;
  v_part    numeric;
  v_paid    numeric;
  v_entry   company_entries;
  v_p       purchases;
  v_n       int := 0;
  v_pool_part numeric;
begin
  v_clinic := company_entry_guard(p_company, p_date, false);
  if v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer') then raise exception 'bad_method'; end if;

  v_pool := greatest(0, company_pool_due(p_company, v_clinic));
  select coalesce(sum(greatest(0, total - coalesce(amount_paid, total))), 0) into v_inv
    from purchases where company_id = p_company and clinic_id = v_clinic;
  if v_amt > v_pool + v_inv then
    raise exception 'over_pay' using hint = format('المبلغُ أكبر من دين الشركة (%s).', to_char(v_pool + v_inv, 'FM999G999G999G990D99'));
  end if;

  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, method, note)
  values (v_clinic, p_company, 'payment', 'debit', v_amt, v_day, p_method, nullif(btrim(p_note), ''))
  returning * into v_entry;

  -- لحظةُ دفعة الفاتورة: الآن إن كان اليومَ، وإلا ظهرُ ذلك اليوم ببغداد.
  v_at := case when v_day = (now() at time zone 'Asia/Baghdad')::date then now()
               else (v_day + time '12:00') at time zone 'Asia/Baghdad' end;

  v_pool_part := least(v_pool, v_amt);
  v_left := v_amt - v_pool_part;
  for v_p in
    select * from purchases
     where company_id = p_company and clinic_id = v_clinic
       and total - coalesce(amount_paid, total) > 0
     order by purchased_at, created_at, id
     for update
  loop
    exit when v_left <= 0;
    v_paid := coalesce(v_p.amount_paid, v_p.total);
    v_part := least(v_left, v_p.total - v_paid);
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, method, note, paid_at, staff_id, entry_id)
    values (v_clinic, v_p.id, p_company, v_part, p_method, nullif(btrim(p_note), ''), v_at, auth.uid(), v_entry.id);
    update purchases set
      amount_paid = v_paid + v_part,
      status = case when v_paid + v_part >= total then 'paid' when v_paid + v_part <= 0 then 'unpaid' else 'partial' end
     where id = v_p.id and clinic_id = v_clinic;
    v_left := v_left - v_part;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('entry', to_jsonb(v_entry), 'to_opening', v_pool_part,
                            'to_invoices', v_amt - v_pool_part, 'invoices', v_n);
end $$;

-- ── الإلغاء ───────────────────────────────────────────────────────────────
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
  if v_e.voided_at is not null then raise exception 'already_void' using hint = 'الحركةُ ملغاةٌ أصلاً.'; end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using hint = 'اكتب سببَ الإلغاء.';
  end if;

  -- دَينٌ سُدِّد منه شيءٌ لا يُلغى قبل تسديده: وإلا بقي تسديدٌ بلا دين.
  if v_e.direction = 'credit' and company_pool_due(v_e.company_id, v_clinic) - v_e.amount < -0.005 then
    raise exception 'has_payments' using hint = 'انسدّ من هذا الرصيد — ألغِ التسديد أوّلاً.';
  end if;

  if v_e.kind = 'payment' then
    for v_pp in
      select pp.* from purchase_payments pp
       where pp.entry_id = v_e.id and pp.clinic_id = v_clinic
       order by pp.paid_at desc
    loop
      v_detail := v_detail || jsonb_build_object('purchase_id', v_pp.purchase_id, 'amount', v_pp.amount, 'paid_at', v_pp.paid_at);
      select coalesce(amount_paid, total) into v_paid from purchases
       where id = v_pp.purchase_id and clinic_id = v_clinic for update;
      if found then
        update purchases set
          amount_paid = greatest(0, v_paid - v_pp.amount),
          status = case when greatest(0, v_paid - v_pp.amount) >= total then 'paid'
                        when greatest(0, v_paid - v_pp.amount) <= 0 then 'unpaid' else 'partial' end
         where id = v_pp.purchase_id and clinic_id = v_clinic;
      end if;
      delete from purchase_payments where id = v_pp.id and clinic_id = v_clinic;
    end loop;
  end if;

  update company_entries set
    voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason),
    void_detail = case when v_e.kind = 'payment' then v_detail else null end
   where id = v_e.id and clinic_id = v_clinic
  returning * into v_e;
  return v_e;
end $$;

revoke all on function public.company_opening_add(uuid, numeric, date, text) from public, anon;
revoke all on function public.company_adjust(uuid, text, numeric, date, text) from public, anon;
revoke all on function public.company_pay(uuid, numeric, text, date, text) from public, anon;
revoke all on function public.company_entry_void(uuid, text) from public, anon;
grant execute on function public.company_opening_add(uuid, numeric, date, text) to authenticated;
grant execute on function public.company_adjust(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.company_pay(uuid, numeric, text, date, text) to authenticated;
grant execute on function public.company_entry_void(uuid, text) to authenticated;

-- ── الدفترُ يتبع شركتَه: الطيّ، والحذف، والاسترجاع ─────────────────────────
-- اسمُ المحفّز بعد `companies_trash_guard` أبجدياً: يجري بعده فيجد صورةَ السلّة.
create or replace function public.company_entries_follow_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_into uuid;
begin
  select merged_into into v_into from companies_trash where id = old.id and clinic_id = old.clinic_id;
  if not found then return old; end if;  -- حذفُ الحساب نفسه: لا سلّة
  if v_into is not null then
    update companies_trash
       set entry_ids = coalesce((select array_agg(id) from company_entries
                                  where company_id = old.id and clinic_id = old.clinic_id), '{}')
     where id = old.id and clinic_id = old.clinic_id;
    update company_entries set company_id = v_into where company_id = old.id and clinic_id = old.clinic_id;
  else
    -- ومع كلّ صفٍّ دفعاتُ فواتيره (`pp_ids`): التتالي يمحو الصفَّ فيُفرغ
    -- `entry_id` بها، وبلا ربطها ثانيةً يُحسب التسديدُ كلُّه على الرصيد السابق.
    update companies_trash
       set entries = coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('pp_ids',
                                 coalesce((select jsonb_agg(pp.id) from purchase_payments pp
                                            where pp.entry_id = e.id and pp.clinic_id = old.clinic_id), '[]'::jsonb)))
                                 from company_entries e
                                where e.company_id = old.id and e.clinic_id = old.clinic_id), '[]'::jsonb)
     where id = old.id and clinic_id = old.clinic_id;
  end if;
  return old;
end $$;
revoke all on function public.company_entries_follow_delete() from public, anon, authenticated;

drop trigger if exists companies_trash_guard_entries on companies;
create trigger companies_trash_guard_entries
  before delete on companies
  for each row execute function company_entries_follow_delete();

create or replace function public.company_entries_follow_restore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t companies_trash;
begin
  select * into v_t from companies_trash where id = new.id and clinic_id = new.clinic_id;
  if not found then return new; end if;
  if v_t.merged_into is not null then
    -- بشرط أنها ما زالت حيث تركها الطيّ (نفسُ شرط بقيّة الاسترجاع).
    update company_entries set company_id = new.id
     where id = any (v_t.entry_ids) and clinic_id = new.clinic_id and company_id = v_t.merged_into;
  else
    insert into company_entries
    select (jsonb_populate_record(null::company_entries, e || jsonb_build_object('company_id', new.id::text))).*
      from jsonb_array_elements(coalesce(v_t.entries, '[]'::jsonb)) e
     where (e->>'clinic_id')::uuid = new.clinic_id
    on conflict (id) do nothing;
    update purchase_payments pp set entry_id = (e->>'id')::uuid
      from jsonb_array_elements(coalesce(v_t.entries, '[]'::jsonb)) e
     where pp.clinic_id = new.clinic_id and pp.entry_id is null
       and pp.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(e->'pp_ids', '[]'::jsonb)) x);
  end if;
  return new;
end $$;
revoke all on function public.company_entries_follow_restore() from public, anon, authenticated;

drop trigger if exists companies_restore_entries on companies;
create trigger companies_restore_entries
  after insert on companies
  for each row execute function company_entries_follow_restore();

comment on table company_entries is
  'دفترُ الشركة خارجَ الفواتير (0224): رصيدٌ قبل النظام، تسديدٌ على الحساب (يُوزَّع بالقاعدة)، وتسوية. الكتابةُ من الدوالّ وحدها، والإلغاءُ ختمٌ لا حذف.';
