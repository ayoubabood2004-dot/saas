-- ============================================================================
-- ٠٢٧٤ — الشراءُ بالعملتين ودفترُ الشركة بالعملتين (الدولار م٢، الخطوة ٥)
--
-- قراراتُ المالك (١٦/١١): «خيارات للدكتور بكيفه يشتري بالدينار أم الدولار»، و«المادّةُ الجديدة يختار بكل سطر»، و«الرصيدُ
-- السابق يختار مشتريها بالدولار أو بالدينار، ولمن يسدد همين يختار شنو راح يسدد دولار لو دينار». الخطّة: docs/usd-purchases-plan.md.
--
-- ── الفكرةُ الحاكمة (0264 §٦): الدفترُ بالدينار والدولارُ طبقةٌ فوقه ─────────────────────────────────────
-- فاتورةُ الشراء بالدولار تُسجَّل بالدينار أيضاً بسعر يومها: كلفةُ الوحدة `round(usd × rate, 2)` تدخل record_purchase/update_purchase
-- **كما هما** (المتوسّطُ، الرصيد، الكشف، الخصم — بلا مسّ جسميهما)، وبجانبها أعمدةٌ دولارية هي حقيقةُ الدَّين: currency، fx_rate،
-- total_usd، paid_usd، discount_usd. والمدفوعُ بالدينار حصّةُ الدولار بنسبة الفاتورة المخزّنة (_usd_share) — الإغلاقُ بالعملتين معاً.
-- ومادّةُ الدولار يُحفظ سعرُ شرائها بالدولار (منه كلفةُ usd_checkout)، وسعرُ بيعها بالدولار؛ والسطرُ الجديد يختار عملةَ بيعه.
--
-- ── البابان ───────────────────────────────────────────────────────────────────────────────────────────
-- أعمدةُ المال لفاتورة الدولار، وسطورُها، ودفعاتُها لا تُكتب إلا من دوالّ هذه الهجرة (`doctorvet.usd_purchase_door`، محلّيٌّ
-- للمعاملة): settle_purchase القديمة، وupdate_purchase بسطورٍ دينارية، وكتابةٌ مباشرة بسياسة purchase_payments — كلُّها تُرفض
-- بجملة. لا دينارَ يُكتب بلا دولاره. (بابٌ غيرُ باب الفواتير 0264 عمداً: فتحُ أحدهما لا يفتح الآخر.)
--
-- ── التسديد: الدَّينُ بعملته، والمسلَّمُ بعملته ────────────────────────────────────────────────────────
-- دينارٌ بدولار ⇒ ينقص `round(usd × rate)` ديناراً؛ دولارٌ بدولار ⇒ ينقص المبلغَ؛ دولارٌ بدينار ⇒ ينقص `round(iqd ÷ rate, 2)` دولاراً.
-- وما سُلّم وبأيّ عملةٍ وسعرٍ يُحفظ بالدفعة (pay_currency، handed، fx_rate). فرقُ الصرف خارج الأرباح والخسائر — المشترياتُ
-- خارجها عمداً (0256)؛ يُشتقّ إن طُلب: المسلَّمُ بالدينار ناقصَ حصّة الدفعة.
--
-- ── دفترُ الشركة ──────────────────────────────────────────────────────────────────────────────────────
-- company_entries.currency (null = دينار: الاسترجاعُ يمرّ بـjsonb_populate_record ولقطةٌ قبلها بلا العمود — درسُ 0259)، و`amount`
-- **بعملة الصفّ**. company_pool_due وcompany_pay تقرآن الدينارَ وحده (نصُّ 0224 وفوقه أسطرٌ معلَّمة)، وأخواتُهما بالدولار جديدة.
-- والإلغاءُ يعرف الدولار. الرصيدُ السابق واحدٌ لكلّ عملة.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0264 و0260 و0224، وقبل الواجهة. تراجع: أعد company_pool_due وcompany_pay
--   وcompany_entry_void حرفاً من 0224؛ drop الدوالّ الجديدة والمحفّزات الثلاثة؛ والأعمدةُ تبقى (فارغةٌ لكلّ فاتورة دينار).
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._usd_share(numeric,numeric,numeric,numeric,numeric)') is null
     or to_regprocedure('public._usd_ctx(uuid)') is null
     or to_regprocedure('public.company_pay(uuid,numeric,text,date,text)') is null
     or to_regprocedure('public.purchase_discount_ready()') is null then
    raise exception 'needs_0264' using hint = 'طبّق 0224 (دفتر الشركة) و0252 (حارس الانحراف) و0260 (خصم الشراء) و0264 (الدولار) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.company_pool_due(uuid,uuid)', '933f85df2ba6774d27499c5c1ff4583f', '-- +0274');
select public._drift_assert('public.company_pay(uuid,numeric,text,date,text)', '7caa4da7c11b0b0e56ec276bdcb45e66', '-- +0274');
select public._drift_assert('public.company_entry_void(uuid,text)', '38fbe4fe8178bb1bc2d9744747073932', '-- +0274');

-- ── ١) الأعمدة ──────────────────────────────────────────────────────────────────────────────────────────
alter table public.purchases add column if not exists currency text not null default 'IQD';
alter table public.purchases add column if not exists fx_rate numeric(14,4);
alter table public.purchases add column if not exists total_usd numeric(14,2);
alter table public.purchases add column if not exists paid_usd numeric(14,2);
alter table public.purchases add column if not exists discount_usd numeric(14,2);
alter table public.purchases drop constraint if exists purchases_usd_ok;
alter table public.purchases add constraint purchases_usd_ok check (
  (currency = 'IQD' and fx_rate is null and total_usd is null and paid_usd is null and discount_usd is null)
  or (currency = 'USD' and fx_rate >= 100 and fx_rate <= 100000 and total_usd >= 0
      and paid_usd >= 0 and paid_usd <= total_usd and coalesce(discount_usd, 0) >= 0));

-- السطر: كلفتُه بالدولار (بفاتورة الدولار)، وعملةُ بيعه وسعرُه بالدولار (لمادّة الدولار، بأيّ فاتورة).
alter table public.purchase_items add column if not exists purchase_price_usd numeric(14,2);
alter table public.purchase_items add column if not exists sell_price_usd numeric(14,2);
alter table public.purchase_items add column if not exists sell_currency text;
alter table public.purchase_items drop constraint if exists purchase_items_usd_ok;
alter table public.purchase_items add constraint purchase_items_usd_ok check (
  (sell_currency is null or sell_currency in ('IQD', 'USD'))
  and (purchase_price_usd is null or purchase_price_usd >= 0)
  and (sell_price_usd is null or sell_price_usd >= 0));

-- الدفعة: `amount` بالدينار كما كان (منه amount_paid)، و`usd` ما نقص من دين الدولار، وما سُلّم فعلاً بعملته وسعره.
alter table public.purchase_payments add column if not exists usd numeric(14,2);
alter table public.purchase_payments add column if not exists pay_currency text;
alter table public.purchase_payments add column if not exists handed numeric(14,2);
alter table public.purchase_payments add column if not exists fx_rate numeric(14,4);
alter table public.purchase_payments drop constraint if exists purchase_payments_fx_ok;
alter table public.purchase_payments add constraint purchase_payments_fx_ok check (
  (usd is null or usd >= 0)
  and (pay_currency is null or (pay_currency in ('IQD', 'USD') and handed > 0))
  and (fx_rate is null or (fx_rate >= 100 and fx_rate <= 100000)));

alter table public.company_entries add column if not exists currency text default 'IQD';
alter table public.company_entries add column if not exists pay_currency text;
alter table public.company_entries add column if not exists handed numeric(14,2);
alter table public.company_entries add column if not exists fx_rate numeric(14,4);
alter table public.company_entries drop constraint if exists company_entries_fx_ok;
alter table public.company_entries add constraint company_entries_fx_ok check (
  (currency is null or currency in ('IQD', 'USD'))
  and (pay_currency is null or (kind = 'payment' and pay_currency in ('IQD', 'USD') and handed > 0))
  and (fx_rate is null or (fx_rate >= 100 and fx_rate <= 100000)));

-- ── ٢) البابان ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._usd_purchase_door_open() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('doctorvet.usd_purchase_door', true), '') = 'on'
$$;
revoke all on function public._usd_purchase_door_open() from public, anon;
grant execute on function public._usd_purchase_door_open() to authenticated;

create or replace function public._usd_purchase_status(p_total_usd numeric, p_paid_usd numeric) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(p_paid_usd, 0) >= coalesce(p_total_usd, 0) then 'paid'
              when coalesce(p_paid_usd, 0) <= 0 then 'unpaid' else 'partial' end
$$;
revoke all on function public._usd_purchase_status(numeric, numeric) from public, anon;
grant execute on function public._usd_purchase_status(numeric, numeric) to authenticated;

-- رأسُ فاتورة الدولار: المالُ وحالتُه وعددُ سطورها. تغييرُ الشركة (الطيّ والدمج) والملاحظات يمرّ.
create or replace function public.purchases_usd_door() returns trigger
language plpgsql set search_path = public as $$
begin
  if public._usd_purchase_door_open() then return new; end if;
  if tg_op = 'INSERT' then
    if new.currency = 'USD' then
      raise exception 'usd_purchase_door' using hint = 'فاتورةُ شراءٍ بالدولار تنكتب من شاشة الشراء المحدَّثة — حدّث الصفحة.';
    end if;
    return new;
  end if;
  if (old.currency = 'USD' or new.currency = 'USD')
     and (new.total, new.amount_paid, new.discount, new.status, new.item_count, new.currency, new.fx_rate,
          new.total_usd, new.paid_usd, new.discount_usd)
         is distinct from
         (old.total, old.amount_paid, old.discount, old.status, old.item_count, old.currency, old.fx_rate,
          old.total_usd, old.paid_usd, old.discount_usd) then
    raise exception 'usd_purchase_door' using hint = 'فاتورةُ شراءٍ بالدولار: تتعدّل وتتسدّد من أبواب الدولار — حدّث الصفحة.';
  end if;
  return new;
end $$;
revoke all on function public.purchases_usd_door() from public, anon;
drop trigger if exists purchases_usd_door on public.purchases;
create trigger purchases_usd_door before insert or update on public.purchases
  for each row execute function public.purchases_usd_door();

-- سطورُ فاتورة الدولار ودفعاتُها: إدراجٌ وحذفٌ وتغييرُ مال. نقلُ المادّة (الدمج) والشركة يمرّ.
-- وحذفُ الفاتورة نفسِها يمرّ: سطورُها تُحذف بعدها (cascade) والفاتورةُ غائبة.
create or replace function public.purchase_lines_usd_door() returns trigger
language plpgsql set search_path = public as $$
declare v_pid uuid := case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end;
begin
  if public._usd_purchase_door_open() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- (شرطان متداخلان لا AND: حقولُ جدولٍ لا تُقرأ على صفّ الجدول الآخر.)
  if tg_op = 'UPDATE' then
    if tg_table_name = 'purchase_items' then
      if (new.purchase_id, new.qty, new.purchase_price, new.purchase_price_usd, new.sell_price_usd, new.sell_currency)
         is not distinct from
         (old.purchase_id, old.qty, old.purchase_price, old.purchase_price_usd, old.sell_price_usd, old.sell_currency) then
        return new;
      end if;
    elsif (to_jsonb(new) - 'company_id' - 'note' - 'method' - 'staff_id' - 'entry_id')
          = (to_jsonb(old) - 'company_id' - 'note' - 'method' - 'staff_id' - 'entry_id') then
      return new;
    end if;
  end if;
  if exists (select 1 from purchases where id = v_pid and currency = 'USD')
     or (tg_op = 'UPDATE' and exists (select 1 from purchases where id = old.purchase_id and currency = 'USD')) then
    raise exception 'usd_purchase_door' using hint = 'فاتورةُ شراءٍ بالدولار: سطورُها ودفعاتُها من أبواب الدولار — حدّث الصفحة.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.purchase_lines_usd_door() from public, anon;
drop trigger if exists purchase_items_usd_door on public.purchase_items;
create trigger purchase_items_usd_door before insert or update or delete on public.purchase_items
  for each row execute function public.purchase_lines_usd_door();
drop trigger if exists purchase_payments_usd_door on public.purchase_payments;
create trigger purchase_payments_usd_door before insert or update or delete on public.purchase_payments
  for each row execute function public.purchase_lines_usd_door();

-- ── ٣) دفترُ الشركة بالدينار: نصُّ 0224 وفوقه أسطرٌ معلَّمة (الدينارُ وحده) ─────────────────────────────
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
-- -0274    where e.company_id = p_company and e.clinic_id = p_clinic and e.voided_at is null;
   where e.company_id = p_company and e.clinic_id = p_clinic and e.voided_at is null   -- +0274
     and coalesce(e.currency, 'IQD') = 'IQD';   -- +0274
$$;
revoke all on function public.company_pool_due(uuid, uuid) from public, anon, authenticated;

-- رصيدُ الشركة السابق بالدولار: أختُ company_pool_due بالدولار — الدفعةُ تُطرح بما لم يذهب منها لفاتورة (pp.usd).
create or replace function public.company_pool_due_usd(p_company uuid, p_clinic uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case
           when e.direction = 'credit' then e.amount
           when e.kind = 'payment' then -(e.amount - coalesce((
             select sum(pp.usd) from purchase_payments pp
              where pp.entry_id = e.id and pp.clinic_id = p_clinic), 0))
           else -e.amount end), 0)
    from company_entries e
   where e.company_id = p_company and e.clinic_id = p_clinic and e.voided_at is null
     and e.currency = 'USD';
$$;
revoke all on function public.company_pool_due_usd(uuid, uuid) from public, anon, authenticated;

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
-- -0274     from purchases where company_id = p_company and clinic_id = v_clinic;
    from purchases where company_id = p_company and clinic_id = v_clinic and currency = 'IQD';   -- +0274
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
       and currency = 'IQD'   -- +0274
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
revoke all on function public.company_pay(uuid, numeric, text, date, text) from public, anon;
grant execute on function public.company_pay(uuid, numeric, text, date, text) to authenticated;

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

-- ── ٤) الشراء: تحضيرُ السطور، وسعرُ الفاتورة، وما بعد الاستلام ────────────────────────────────────────
-- سعرُ فاتورة الدولار: المكتوبُ بالشاشة (الشركةُ قد تكتب سعرَها) وإلا سعرُ العيادة الأخير، بأربع منازل.
create or replace function public._purchase_rate(p_meta jsonb, p_fallback numeric) returns numeric
language plpgsql immutable set search_path = public as $$
declare v numeric := round(coalesce(nullif(p_meta->>'fx_rate', '')::numeric, p_fallback), 4);
begin
  if v is null then raise exception 'usd_no_rate' using hint = 'اكتب سعر الدولار للفاتورة.'; end if;
  if v < 100 or v > 100000 then raise exception 'bad_rate' using hint = 'سعرُ الدولار لازم بين 100 و100000 دينار.'; end if;
  return v;
end $$;
revoke all on function public._purchase_rate(jsonb, numeric) from public, anon;
grant execute on function public._purchase_rate(jsonb, numeric) to authenticated;

-- كلُّ سطر: عملةُ بيعه (مادّةٌ قائمة بمعرّفها ⇒ عملتُها، وإلا ما اختاره السطر)، وكلفتُه بالدولار ودينارُها `round(usd × rate, 2)`
-- لفاتورة الدولار، وسعرُ بيعه بالدولار. ويُرسل لجسم الشراء بسعر بيعٍ صفر لما يُباع بالدولار — فلا يُكتب لمادّة الدولار سعرُ دينار.
create or replace function public._purchase_fx_prep(p_lines jsonb, p_cur text, p_rate numeric, p_clinic uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it    jsonb;
  i     bigint;
  v_out jsonb := '[]'::jsonb;
  v_sc  text;
  v_u   numeric;
  v_su  numeric;
  v_l   jsonb;
  v_pid uuid;
begin
  for it, i in select value, ordinality from jsonb_array_elements(p_lines) with ordinality loop
    v_pid := case when it->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (it->>'product_id')::uuid end;
    v_sc := null;
    if v_pid is not null then
      select price_currency into v_sc from products where id = v_pid and clinic_id = p_clinic;
    end if;
    v_sc := upper(coalesce(v_sc, nullif(it->>'sell_currency', ''), 'IQD'));
    if v_sc not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'عملةُ البيع دينار أو دولار.'; end if;
    v_su := round(coalesce(nullif(it->>'sell_price_usd', '')::numeric, 0), 2);
    if v_su < 0 then raise exception 'bad_price' using hint = format('سعرُ البيع بالسطر %s سالب.', i); end if;
    v_l := it;
    v_u := null;
    if p_cur = 'USD' then
      v_u := round(coalesce(nullif(it->>'purchase_price_usd', '')::numeric, 0), 2);
      if v_u < 0 then raise exception 'bad_price' using hint = format('سعرُ الشراء بالسطر %s سالب.', i); end if;
      v_l := v_l || jsonb_build_object('purchase_price', round(v_u * p_rate, 2));
    end if;
    if v_sc = 'USD' then v_l := v_l || jsonb_build_object('sell_price', 0); end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('line', v_l, 'sc', v_sc, 'u', v_u, 'su', v_su, 'n', i));
  end loop;
  return v_out;
end $$;
revoke all on function public._purchase_fx_prep(jsonb, text, numeric, uuid) from public, anon, authenticated;

-- بعد جسم الشراء: كلُّ سطرٍ بمادّته من الكشف (purchase_effects بسطره ولحظة المعاملة). مادّةٌ جديدة اختار سطرُها الدولار تصير مادّةَ
-- دولار بسعرَيها؛ ومادّةُ دولارٍ قائمة يُكتب سعرُ بيعها المكتوب، وسعرُ شرائها بالدولار من فاتورة الدولار. ثمّ تُختم السطور.
create or replace function public._purchase_fx_after(p_purchase uuid, p_op text, p_prep jsonb, p_cur text, p_rate numeric, p_clinic uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  x    jsonb;
  e    record;
  v_c  text;
  v_su numeric;
  v_u  numeric;
begin
  for x in select value from jsonb_array_elements(p_prep) loop
    select pe.product_id, pe.outcome into e from purchase_effects pe
     where pe.clinic_id = p_clinic and pe.purchase_id = p_purchase and pe.op = p_op
       and pe.line_no = (x->>'n')::int and pe.outcome <> 'removed' and pe.created_at = now()
     limit 1;
    continue when e.product_id is null;
    v_su := nullif((x->>'su')::numeric, 0);
    v_u  := case when p_cur = 'USD' then nullif((x->>'u')::numeric, 0) end;
    if e.outcome = 'created' and x->>'sc' = 'USD' then
      update products set price_currency = 'USD', sell_price_usd = v_su, purchase_price_usd = v_u
       where id = e.product_id and clinic_id = p_clinic and price_currency = 'IQD';
    else
      update products set sell_price_usd = coalesce(v_su, sell_price_usd),
                          purchase_price_usd = coalesce(v_u, purchase_price_usd)
       where id = e.product_id and clinic_id = p_clinic and price_currency = 'USD'
         and (v_su is not null or v_u is not null);
    end if;
    select price_currency into v_c from products where id = e.product_id and clinic_id = p_clinic;
    update purchase_items set sell_currency = v_c,
                              sell_price_usd = case when v_c = 'USD' then v_su end
     where purchase_id = p_purchase and clinic_id = p_clinic and product_id = e.product_id
       and (sell_currency, sell_price_usd) is distinct from (v_c, case when v_c = 'USD' then v_su end);
  end loop;
  -- كلفةُ السطر بالدولار من دينارها: round(usd × rate, 2) وسعرٌ ≥ ١٠٠ ⇒ القسمةُ تُرجع الدولارَ نفسَه بالسنت (الخطأ < ٠٫٠٠٠٠٥$).
  update purchase_items set purchase_price_usd = case when p_cur = 'USD' then round(purchase_price / p_rate, 2) end
   where purchase_id = p_purchase and clinic_id = p_clinic
     and purchase_price_usd is distinct from (case when p_cur = 'USD' then round(purchase_price / p_rate, 2) end);
end $$;
revoke all on function public._purchase_fx_after(uuid, text, jsonb, text, numeric, uuid) from public, anon, authenticated;

-- ── ٥) record_purchase_fx: فاتورةُ شراءٍ بأيّ عملة ───────────────────────────────────────────────────────
-- meta: currency ('IQD' | 'USD')، fx_rate، discount_usd، amount_paid_usd (غائبٌ = مدفوعةٌ كاملة كـrecord_purchase)، وباقي مفاتيح
-- record_purchase كما هي. السطر: purchase_price_usd (فاتورة الدولار)، sell_currency (للجديدة)، sell_price_usd (لمادّة الدولار).
-- فاتورةُ الدينار بلا سطرٍ يُباع بالدولار = record_purchase حرفاً.
create or replace function public.record_purchase_fx(p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid := auth_clinic();
  v_role      text := auth_role();
  v_meta      jsonb := coalesce(p_meta, '{}'::jsonb);
  v_cur       text := upper(coalesce(nullif(coalesce(p_meta, '{}'::jsonb)->>'currency', ''), 'IQD'));
  v_ctx       record;
  v_rate      numeric;
  v_prep      jsonb;
  v_lines     jsonb;
  v_gross_usd numeric;
  v_disc_usd  numeric;
  v_total_usd numeric;
  v_paid_usd  numeric;
  v_p         purchases;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'عملةُ الفاتورة دينار أو دولار.'; end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty purchase';
  end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if v_cur = 'USD' then
    if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.'; end if;
    v_rate := _purchase_rate(v_meta, v_ctx.rate);
  end if;

  v_prep := _purchase_fx_prep(p_lines, v_cur, v_rate, v_clinic);
  select jsonb_agg(x->'line' order by (x->>'n')::int) into v_lines from jsonb_array_elements(v_prep) x;
  v_meta := v_meta - 'currency' - 'fx_rate' - 'discount_usd' - 'amount_paid_usd';

  if v_cur = 'IQD' then
    v_p := record_purchase(v_lines, v_meta);
  else
    -- المجموعُ والخصمُ والصافي بالدولار كما يحسبها record_purchase بالدينار (الكميةُ بثلاث منازل، والمبالغُ بمنزلتين).
    select round(coalesce(sum(round(coalesce(nullif(x->'line'->>'qty', '')::numeric, 0), 3) * (x->>'u')::numeric), 0), 2)
      into v_gross_usd from jsonb_array_elements(v_prep) x;
    v_disc_usd := case when v_gross_usd > 0
                       then least(greatest(round(coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0), 2), 0), v_gross_usd)
                       else 0 end;
    v_total_usd := v_gross_usd - v_disc_usd;
    v_paid_usd := least(greatest(round(coalesce(nullif(p_meta->>'amount_paid_usd', '')::numeric, v_total_usd), 2), 0), v_total_usd);
    -- الخصمُ الكامل يأخذ الدينارَ كلَّه (يقصّه الجسمُ على مجموعه)، وغيرُه بسعر الفاتورة. والمدفوعُ يُكتب بعده بحصّته.
    v_p := record_purchase(v_lines, v_meta || jsonb_build_object(
             'discount', case when v_disc_usd >= v_gross_usd and v_gross_usd > 0 then 999999999999 else round(v_disc_usd * v_rate, 2) end,
             'amount_paid', 0));
    perform set_config('doctorvet.usd_purchase_door', 'on', true);
    update purchases set
      currency = 'USD', fx_rate = v_rate, total_usd = v_total_usd, discount_usd = v_disc_usd, paid_usd = v_paid_usd,
      amount_paid = _usd_share(v_paid_usd, v_total_usd, total, v_total_usd, total),
      status = _usd_purchase_status(v_total_usd, v_paid_usd)
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
  end if;

  perform _purchase_fx_after(v_p.id, 'record', v_prep, v_cur, v_rate, v_clinic);
  perform set_config('doctorvet.usd_purchase_door', 'off', true);
  return v_p;
end $$;
revoke all on function public.record_purchase_fx(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase_fx(jsonb, jsonb) to authenticated;

-- ── ٦) update_purchase_fx: تعديلُ فاتورةٍ بأيّ عملة ──────────────────────────────────────────────────────
-- السطورُ الجديدة بسعر الفاتورة المحفوظ (أو المكتوب)، وupdate_purchase يعكس القديمَ ويبني الجديدَ كما هو. والعملةُ تتبدّل ما دام
-- لا دفعةَ مسجّلة عليها (الدفعةُ كُتبت بعملة دَينها). والمدفوعُ بالدولار يبقى (مقصوصاً على الجديد) ودينارُه حصّتُه.
create or replace function public.update_purchase_fx(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid := auth_clinic();
  v_role      text := auth_role();
  v_meta      jsonb := coalesce(p_meta, '{}'::jsonb);
  v_old       purchases;
  v_cur       text;
  v_ctx       record;
  v_rate      numeric;
  v_prep      jsonb;
  v_lines     jsonb;
  v_gross_usd numeric;
  v_disc_usd  numeric;
  v_total_usd numeric;
  v_paid_usd  numeric;
  v_p         purchases;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty purchase';
  end if;
  select * into v_old from purchases where id = p_purchase and clinic_id = v_clinic for update;
  if not found then raise exception 'purchase not found'; end if;
  v_cur := upper(coalesce(nullif(v_meta->>'currency', ''), v_old.currency));
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'عملةُ الفاتورة دينار أو دولار.'; end if;
  if v_cur <> v_old.currency and exists (select 1 from purchase_payments where purchase_id = p_purchase and clinic_id = v_clinic) then
    raise exception 'currency_has_payments' using hint = 'على الفاتورة دفعاتٌ مسجّلة بعملتها — ألغِها أوّلاً قبل تغيير العملة.';
  end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if v_cur = 'USD' then
    if v_old.currency <> 'USD' and not v_ctx.enabled then
      raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.';
    end if;
    v_rate := _purchase_rate(v_meta, coalesce(v_old.fx_rate, v_ctx.rate));
  end if;

  v_prep := _purchase_fx_prep(p_lines, v_cur, v_rate, v_clinic);
  select jsonb_agg(x->'line' order by (x->>'n')::int) into v_lines from jsonb_array_elements(v_prep) x;
  v_meta := v_meta - 'currency' - 'fx_rate' - 'discount_usd' - 'amount_paid_usd';
  -- update_purchase يمحو سطورَ فاتورة الدولار ويبنيها ويكتب رأسَها: البابُ مفتوحٌ للمعاملة كلّها.
  perform set_config('doctorvet.usd_purchase_door', 'on', true);

  if v_cur = 'IQD' then
    v_p := update_purchase(p_purchase, v_lines, v_meta);
    if v_old.currency = 'USD' then
      update purchases set currency = 'IQD', fx_rate = null, total_usd = null, paid_usd = null, discount_usd = null
       where id = p_purchase and clinic_id = v_clinic
      returning * into v_p;
    end if;
  else
    select round(coalesce(sum(round(coalesce(nullif(x->'line'->>'qty', '')::numeric, 0), 3) * (x->>'u')::numeric), 0), 2)
      into v_gross_usd from jsonb_array_elements(v_prep) x;
    v_disc_usd := case when v_gross_usd > 0
                       then least(greatest(round(case when p_meta ? 'discount_usd' then coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0)
                                                      else coalesce(v_old.discount_usd, 0) end, 2), 0), v_gross_usd)
                       else 0 end;
    v_total_usd := v_gross_usd - v_disc_usd;
    v_paid_usd := least(greatest(round(coalesce(
                    nullif(p_meta->>'amount_paid_usd', '')::numeric,
                    case when v_old.currency = 'USD' then v_old.paid_usd
                         when coalesce(v_old.amount_paid, v_old.total) >= v_old.total then v_total_usd
                         else coalesce(v_old.amount_paid, 0) / v_rate end), 2), 0), v_total_usd);
    v_p := update_purchase(p_purchase, v_lines, v_meta || jsonb_build_object(
             'discount', case when v_disc_usd >= v_gross_usd and v_gross_usd > 0 then 999999999999 else round(v_disc_usd * v_rate, 2) end,
             'amount_paid', 0));
    update purchases set
      currency = 'USD', fx_rate = v_rate, total_usd = v_total_usd, discount_usd = v_disc_usd, paid_usd = v_paid_usd,
      amount_paid = _usd_share(v_paid_usd, v_total_usd, total, v_total_usd, total),
      status = _usd_purchase_status(v_total_usd, v_paid_usd)
     where id = p_purchase and clinic_id = v_clinic
    returning * into v_p;
  end if;

  perform _purchase_fx_after(p_purchase, 'update', v_prep, v_cur, v_rate, v_clinic);
  perform set_config('doctorvet.usd_purchase_door', 'off', true);
  return v_p;
end $$;
revoke all on function public.update_purchase_fx(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_purchase_fx(uuid, jsonb, jsonb) to authenticated;

-- ── ٧) تسديدُ فاتورةٍ واحدة: الدَّينُ بعملته والمسلَّمُ بعملته ────────────────────────────────────────────
-- p_handed ما سُلّم بعملة p_pay_currency، وp_rate سعرُه (لازمٌ حين تختلف العملتان). p_expect_due ما رآه المستخدم باقياً بعملة الدَّين:
-- تغيّر ⇒ رفض (جهازٌ ثانٍ سدّد، أو ردٌّ ضائع وإعادة). والزائدُ دون سنتٍ واحد (أو ما يقابله بالدينار) إغلاقٌ لا رفض: «سدّد الباقي»
-- بعملةٍ ثانية لا يطلع مساوياً بالضبط.
create or replace function public.purchase_pay_fx(p_purchase uuid, p_handed numeric, p_pay_currency text, p_rate numeric,
                                                   p_method text default 'cash', p_note text default null, p_expect_due numeric default null)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := auth_role();
  v_pay     text := upper(coalesce(nullif(p_pay_currency, ''), 'IQD'));
  v_handed  numeric := round(coalesce(p_handed, 0), 2);
  v_rate    numeric := round(p_rate, 4);
  v_p       purchases;
  v_due     numeric;
  v_due_usd numeric;
  v_red     numeric;
  v_share   numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if v_pay not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'التسديد دينار أو دولار.'; end if;
  if v_handed <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer') then raise exception 'bad_method'; end if;
  select * into v_p from purchases where id = p_purchase and clinic_id = v_clinic for update;
  if not found then raise exception 'purchase not found'; end if;
  if v_p.currency <> v_pay and (v_rate is null or v_rate < 100 or v_rate > 100000) then
    raise exception 'bad_rate' using hint = 'اكتب سعر الدولار (بين 100 و100000 دينار).';
  end if;

  if v_p.currency = 'IQD' then
    v_due := greatest(0, v_p.total - coalesce(v_p.amount_paid, v_p.total));
    if p_expect_due is not null and abs(p_expect_due - v_due) > 0.005 then
      raise exception 'due_changed' using hint = 'تغيّر الباقي على الفاتورة — راجعه وأعد.';
    end if;
    v_red := case when v_pay = 'IQD' then v_handed else round(v_handed * v_rate, 0) end;
    if v_red > v_due then
      if v_pay = 'USD' and v_red - v_due <= ceil(v_rate * 0.01) then v_red := v_due;
      else raise exception 'over_pay' using hint = format('المبلغُ أكبر من الباقي (%s د.ع).', to_char(v_due, 'FM999G999G999G990D99'));
      end if;
    end if;
    if v_red <= 0 then raise exception 'nothing to settle'; end if;
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, method, note, staff_id, pay_currency, handed, fx_rate)
    values (v_clinic, v_p.id, v_p.company_id, v_red, nullif(p_method, ''), nullif(btrim(p_note), ''), auth.uid(),
            v_pay, v_handed, case when v_pay = 'USD' then v_rate end);
    update purchases set
      amount_paid = coalesce(amount_paid, total) + v_red,
      status = case when coalesce(amount_paid, total) + v_red >= total then 'paid'
                    when coalesce(amount_paid, total) + v_red <= 0 then 'unpaid' else 'partial' end
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
  else
    v_due_usd := greatest(0, v_p.total_usd - v_p.paid_usd);
    v_due := greatest(0, v_p.total - v_p.amount_paid);
    if p_expect_due is not null and abs(p_expect_due - v_due_usd) > 0.005 then
      raise exception 'due_changed' using hint = 'تغيّر الباقي على الفاتورة — راجعه وأعد.';
    end if;
    v_red := case when v_pay = 'USD' then v_handed else round(v_handed / v_rate, 2) end;
    if v_red > v_due_usd then
      if v_red - v_due_usd <= 0.01 then v_red := v_due_usd;
      else raise exception 'over_pay' using hint = format('المبلغُ أكبر من الباقي ($%s).', to_char(v_due_usd, 'FM999G999G990D00'));
      end if;
    end if;
    if v_red <= 0 then raise exception 'nothing to settle'; end if;
    v_share := _usd_share(v_red, v_due_usd, v_due, v_p.total_usd, v_p.total);
    perform set_config('doctorvet.usd_purchase_door', 'on', true);
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, staff_id, pay_currency, handed, fx_rate)
    values (v_clinic, v_p.id, v_p.company_id, v_share, v_red, nullif(p_method, ''), nullif(btrim(p_note), ''), auth.uid(),
            v_pay, v_handed, case when v_pay = 'IQD' then v_rate end);
    update purchases set
      amount_paid = amount_paid + v_share,
      paid_usd = paid_usd + v_red,
      status = _usd_purchase_status(total_usd, paid_usd + v_red)
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
    perform set_config('doctorvet.usd_purchase_door', 'off', true);
  end if;
  return v_p;
end $$;
revoke all on function public.purchase_pay_fx(uuid, numeric, text, numeric, text, text, numeric) from public, anon;
grant execute on function public.purchase_pay_fx(uuid, numeric, text, numeric, text, text, numeric) to authenticated;

-- ── ٨) دفترُ الشركة بالعملتين: رصيدٌ سابق، تسوية، تسديدٌ على الحساب ────────────────────────────────────────
-- الرصيدُ السابق واحدٌ لكلّ عملة؛ والمبلغُ بعملة الصفّ.
create or replace function public.company_opening_add_fx(p_company uuid, p_currency text, p_amount numeric, p_date date, p_note text default null)
returns company_entries
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_cur    text := upper(coalesce(nullif(p_currency, ''), 'IQD'));
  v_amt    numeric := round(coalesce(p_amount, 0), 2);
  v_row    company_entries;
begin
  v_clinic := company_entry_guard(p_company, p_date, true);
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'العملة دينار أو دولار.'; end if;
  if v_cur = 'USD' and not (select c.enabled from _usd_ctx(v_clinic) c) then
    raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.';
  end if;
  if v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if exists (select 1 from company_entries where company_id = p_company and clinic_id = v_clinic
              and kind = 'opening' and voided_at is null and coalesce(currency, 'IQD') = v_cur) then
    raise exception 'opening_exists' using hint = 'لهاي الشركة رصيدٌ سابق بهاي العملة — ألغِه أوّلاً إن كان غلطاً.';
  end if;
  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, note, currency)
  values (v_clinic, p_company, 'opening', 'credit', v_amt,
          coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date), nullif(btrim(p_note), ''), v_cur)
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.company_opening_add_fx(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.company_opening_add_fx(uuid, text, numeric, date, text) to authenticated;

create or replace function public.company_adjust_fx(p_company uuid, p_currency text, p_direction text, p_amount numeric, p_date date, p_note text)
returns company_entries
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_cur    text := upper(coalesce(nullif(p_currency, ''), 'IQD'));
  v_amt    numeric := round(coalesce(p_amount, 0), 2);
  v_row    company_entries;
begin
  v_clinic := company_entry_guard(p_company, p_date, true);
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'العملة دينار أو دولار.'; end if;
  if v_cur = 'USD' and not (select c.enabled from _usd_ctx(v_clinic) c) then
    raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.';
  end if;
  if v_amt <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_direction not in ('credit', 'debit') then raise exception 'bad_direction'; end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'note_required' using hint = 'اكتب سببَ التسوية.';
  end if;
  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, note, currency)
  values (v_clinic, p_company, 'adjust', p_direction, v_amt,
          coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date), btrim(p_note), v_cur)
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.company_adjust_fx(uuid, text, text, numeric, date, text) from public, anon;
grant execute on function public.company_adjust_fx(uuid, text, text, numeric, date, text) to authenticated;

-- التسديدُ على الحساب بعملة الدَّين: الدينارُ يمرّ من company_pay نفسِها (والمسلَّمُ بالدولار يُختم على صفّها)، والدولارُ أختُها:
-- السابقُ بالدولار أوّلاً ثمّ فواتيرُ الدولار من الأقدم، وكلُّ جزءٍ بحصّته الدينارية بنسبة فاتورته (0224 و0264 حرفاً).
create or replace function public.company_pay_fx(p_company uuid, p_currency text, p_handed numeric, p_pay_currency text, p_rate numeric,
                                                  p_method text, p_date date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid;
  v_cur       text := upper(coalesce(nullif(p_currency, ''), 'IQD'));
  v_pay       text := upper(coalesce(nullif(p_pay_currency, ''), 'IQD'));
  v_handed    numeric := round(coalesce(p_handed, 0), 2);
  v_rate      numeric := round(p_rate, 4);
  v_day       date := coalesce(p_date, (now() at time zone 'Asia/Baghdad')::date);
  v_at        timestamptz;
  v_pool      numeric;
  v_inv       numeric;
  v_red       numeric;
  v_res       jsonb;
  v_entry     company_entries;
  v_p         purchases;
  v_left      numeric;
  v_part      numeric;
  v_share     numeric;
  v_n         int := 0;
  v_pool_part numeric;
begin
  v_clinic := company_entry_guard(p_company, p_date, false);
  if v_cur not in ('IQD', 'USD') or v_pay not in ('IQD', 'USD') then
    raise exception 'bad_currency' using hint = 'العملة دينار أو دولار.';
  end if;
  if v_handed <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer') then raise exception 'bad_method'; end if;
  if v_cur <> v_pay and (v_rate is null or v_rate < 100 or v_rate > 100000) then
    raise exception 'bad_rate' using hint = 'اكتب سعر الدولار (بين 100 و100000 دينار).';
  end if;

  if v_cur = 'IQD' then
    v_red := case when v_pay = 'IQD' then v_handed else round(v_handed * v_rate, 0) end;
    if v_pay = 'USD' then
      v_pool := greatest(0, company_pool_due(p_company, v_clinic));
      select coalesce(sum(greatest(0, total - coalesce(amount_paid, total))), 0) into v_inv
        from purchases where company_id = p_company and clinic_id = v_clinic and currency = 'IQD';
      if v_red > v_pool + v_inv and v_red - (v_pool + v_inv) <= ceil(v_rate * 0.01) then v_red := v_pool + v_inv; end if;
    end if;
    v_res := company_pay(p_company, v_red, p_method, p_date, p_note);
    update company_entries set pay_currency = v_pay, handed = v_handed, fx_rate = case when v_pay = 'USD' then v_rate end
     where id = (v_res->'entry'->>'id')::uuid and clinic_id = v_clinic
    returning * into v_entry;
    return v_res || jsonb_build_object('entry', to_jsonb(v_entry));
  end if;

  v_pool := greatest(0, company_pool_due_usd(p_company, v_clinic));
  select coalesce(sum(greatest(0, total_usd - paid_usd)), 0) into v_inv
    from purchases where company_id = p_company and clinic_id = v_clinic and currency = 'USD';
  v_red := case when v_pay = 'USD' then v_handed else round(v_handed / v_rate, 2) end;
  if v_red > v_pool + v_inv then
    if v_red - (v_pool + v_inv) <= 0.01 then v_red := v_pool + v_inv;
    else raise exception 'over_pay' using hint = format('المبلغُ أكبر من دين الشركة بالدولار ($%s).', to_char(v_pool + v_inv, 'FM999G999G990D00'));
    end if;
  end if;
  if v_red <= 0 then raise exception 'bad_amount' using hint = 'المبلغُ لازم أكبر من صفر.'; end if;

  insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, method, note, currency, pay_currency, handed, fx_rate)
  values (v_clinic, p_company, 'payment', 'debit', v_red, v_day, p_method, nullif(btrim(p_note), ''), 'USD',
          v_pay, v_handed, case when v_pay = 'IQD' then v_rate end)
  returning * into v_entry;

  v_at := case when v_day = (now() at time zone 'Asia/Baghdad')::date then now()
               else (v_day + time '12:00') at time zone 'Asia/Baghdad' end;
  v_pool_part := least(v_pool, v_red);
  v_left := v_red - v_pool_part;
  perform set_config('doctorvet.usd_purchase_door', 'on', true);
  for v_p in
    select * from purchases
     where company_id = p_company and clinic_id = v_clinic and currency = 'USD' and total_usd - paid_usd > 0
     order by purchased_at, created_at, id
     for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_p.total_usd - v_p.paid_usd);
    v_share := _usd_share(v_part, v_p.total_usd - v_p.paid_usd, v_p.total - v_p.amount_paid, v_p.total_usd, v_p.total);
    insert into purchase_payments (clinic_id, purchase_id, company_id, amount, usd, method, note, paid_at, staff_id, entry_id)
    values (v_clinic, v_p.id, p_company, v_share, v_part, p_method, nullif(btrim(p_note), ''), v_at, auth.uid(), v_entry.id);
    update purchases set
      amount_paid = amount_paid + v_share,
      paid_usd = paid_usd + v_part,
      status = _usd_purchase_status(total_usd, paid_usd + v_part)
     where id = v_p.id and clinic_id = v_clinic;
    v_left := v_left - v_part;
    v_n := v_n + 1;
  end loop;
  perform set_config('doctorvet.usd_purchase_door', 'off', true);

  return jsonb_build_object('entry', to_jsonb(v_entry), 'to_opening', v_pool_part,
                            'to_invoices', v_red - v_pool_part, 'invoices', v_n);
end $$;
revoke all on function public.company_pay_fx(uuid, text, numeric, text, numeric, text, date, text) from public, anon;
grant execute on function public.company_pay_fx(uuid, text, numeric, text, numeric, text, date, text) to authenticated;

-- ── ٩) سؤالُ الواجهة: هل أجسامُ الدفتر الحيّة تعرف العملتين؟ ───────────────────────────────────────────
-- الأعمدةُ وحدها لا تكفي (درسُ 0260): إعادةُ 0224 وحدها بعد هالهجرة تُرجع company_pool_due لنصّها فيجمع رصيداً سابقاً بالدولار على
-- الدينار بصمت. فالواجهةُ تسأل الأجسامَ الثلاثة نفسَها (علامتُنا بنصّها، تُبنى بـformat) وتُخفي الدولارَ بالشراء إن لم تعرفه.
create or replace function public.purchase_usd_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select count(*) = 3 from pg_proc p
   where p.oid in (to_regprocedure('public.company_pool_due(uuid,uuid)'), to_regprocedure('public.company_pay(uuid,numeric,text,date,text)'),
                   to_regprocedure('public.company_entry_void(uuid,text)'))
     and position(format('-- +%s', '0274') in p.prosrc) > 0
$$;
revoke all on function public.purchase_usd_ready() from public, anon;
grant execute on function public.purchase_usd_ready() to authenticated;

reset lock_timeout;
