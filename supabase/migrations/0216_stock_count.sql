-- ============================================================================
-- ٠٢١٦ — الجردُ الدوريّ و«وين راحت الفلوس» (م٦، docs/inventory-vnext-plan.md)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- حين يلقى العادُّ ٧ والنظامُ يقول ١٠، كان التصحيحُ تعديلاً لرقم الرصيد وحده:
-- الثلاثةُ تختفي من قيمة المخزن **بصمت** — لا سبب، ولا من وافق، ولا أثرَ بالمال.
-- فالتلفُ والعجزُ والمنتهي خسائرُ حقيقية لا يراها أحد.
--
-- ── قرارُ المالك (٢٦/٩) ──────────────────────────────────────────────────
-- ١) لا فرقَ يمسّ الرصيد بلا **موافقة** المدير — العدُّ يُسجَّل «بانتظار الموافقة».
-- ٢) عند الموافقة تُسجَّل الخسارةُ **سحباً بيوم الموافقة** بسجلّ «المصروفات
--    والسحوبات»: بسببه (تالف/منتهٍ/عجز) وبموادّه بالضبط (الاسم × العدد).
-- ٣) طريقتُه `stock` («من المخزن») لا `cash`: فلوسُه طلعت يوم الشراء، فلا يُطرح
--    من الدرج ولا من مطابقة القاصة — وإلا قالت القاصةُ ناقصاً والدرجُ كامل.
-- ٤) «خطأ إدخال» و«لقينا زيادة» يصحّحان الرصيدَ بموافقة ولا يُسجَّلان سحباً.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- * `stock_counts`: سطرٌ لكلّ مادةٍ انعدّت — رصيدُ النظام لحظةَ العدّ، والمعدود،
--   والسبب، ومن عدّ ومن قرّر، والفرقُ المطبَّق، وسحبُه. تُقرأ للعيادة وتُكتب من
--   الدالّتين وحدهما (definer بفحص العيادة والدور بنفسيهما — درسُ 0145).
-- * `stock_count_submit(lines)`: أيُّ موظفٍ يعدّ. المطابقُ يُختم `matched` بلا
--   موافقة، والفرقُ `pending` **ولا يمسّ الرصيد**. عدٌّ جديدٌ لنفس المادة يُلغي
--   المعلَّقَ القديم (`void`) — الأحدثُ أصدق.
-- * `stock_count_decide(ids, approve)`: المديرُ وحده (`auth_role()` يعرف وضعَ المدير
--   بالرمز). الموافقةُ تطبّق **الفرقَ** لا الرقمَ المعدود: ما بيع بين العدّ والموافقة
--   لا يرجع للرفّ. وتكتب سحباً لكلّ سببِ خسارة بقيمة سعر الشراء.
-- * `expenses.method` يقبل `stock`، ومحفّزٌ يمنع إضافتَه أو حذفَه باليد: السحبُ
--   ظلُّ موافقةٍ على جرد، وحذفُه وحدَه يُخفي خسارةً والرصيدُ ما زال مصحَّحاً.
-- * `report_stock_losses(from, to)`: قيمةُ الفروق بأسبابها — تُجمع بالقاعدة (0149).
-- * `stock_count_state()`: آخرُ عدٍّ وآخرُ فرقٍ لكلّ مادة — لاختيار «عدّ اليوم».
-- * `clinic_prefs.count_daily_n`: كم مادةً تُقترح للعدّ كلَّ يوم (افتراضي ٥).
--
-- تراجع: drop function stock_count_submit(jsonb), stock_count_decide(uuid[], boolean),
--   report_stock_losses(timestamptz, timestamptz), stock_count_state();
--   drop trigger expenses_stock_guard on expenses; والجدولُ والأعمدةُ تبقى ولا تضرّ.
-- تُطبَّق بعد 0215. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

alter table public.clinic_prefs add column if not exists count_daily_n integer not null default 5
  check (count_daily_n between 1 and 50);
comment on column public.clinic_prefs.count_daily_n is 'كم مادةً تُقترح للعدّ كلَّ يوم (0216، افتراضي 5)';

-- ── ١) السحبُ «من المخزن» ─────────────────────────────────────────────────
alter table public.expenses drop constraint if exists expenses_method_check;
alter table public.expenses add constraint expenses_method_check
  check (method in ('cash', 'card', 'bank', 'stock'));

create or replace function public.expenses_stock_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- يحرس طلبات التطبيق وحدها: دالّةُ الموافقة (definer) تكتب بهويّة مالكها فتمرّ.
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if (tg_op in ('INSERT', 'UPDATE') and new.method = 'stock')
     or (tg_op in ('UPDATE', 'DELETE') and old.method = 'stock') then
    raise exception 'stock_expense_locked'
      using hint = 'سحبُ المخزن يُكتب من موافقة الجرد وحدها — لا يُضاف ولا يُعدَّل ولا يُحذف باليد';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists expenses_stock_guard on public.expenses;
create trigger expenses_stock_guard before insert or update or delete on public.expenses
  for each row execute function public.expenses_stock_guard();

-- ── ٢) سطورُ الجرد ────────────────────────────────────────────────────────
create table if not exists public.stock_counts (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  -- المادةُ قد تُحذف (إلى سلّة المحذوفات) ويبقى سطرُ جردها باسمه — تاريخُ مالٍ لا يُمحى.
  product_id       uuid references public.products(id) on delete set null,
  product_name     text not null,
  system_qty       numeric not null,
  counted_qty      numeric not null check (counted_qty >= 0),
  unit_cost        numeric not null default 0 check (unit_cost >= 0),
  reason           text check (reason in ('damaged', 'expired', 'shortage', 'entry_error', 'found')),
  note             text check (char_length(note) <= 200),
  status           text not null default 'pending'
                   check (status in ('matched', 'pending', 'approved', 'rejected', 'void')),
  counted_by       uuid default auth.uid(),
  counted_by_name  text,
  counted_at       timestamptz not null default now(),
  decided_by       uuid,
  decided_by_name  text,
  decided_at       timestamptz,
  applied_delta    numeric,
  expense_id       uuid references public.expenses(id) on delete set null,
  -- الفرقُ بلا سببٍ لا يُسجَّل، والمطابقُ لا سببَ له.
  constraint stock_counts_reason_iff_diff check ((counted_qty = system_qty) = (reason is null))
);
create index if not exists stock_counts_clinic_status_idx on public.stock_counts (clinic_id, status, counted_at desc);
create index if not exists stock_counts_clinic_decided_idx on public.stock_counts (clinic_id, decided_at) where status = 'approved';
create index if not exists stock_counts_product_idx on public.stock_counts (product_id);
create index if not exists stock_counts_expense_idx on public.stock_counts (expense_id);
-- معلَّقٌ واحدٌ لكلّ مادة: عدّان متعارضان ينتظران معاً يربكان المدير.
create unique index if not exists stock_counts_one_pending on public.stock_counts (product_id) where status = 'pending';

alter table public.stock_counts enable row level security;
drop policy if exists stock_counts_select on public.stock_counts;
create policy stock_counts_select on public.stock_counts
  for select using (clinic_id = (select auth_clinic()));
revoke insert, update, delete, truncate on table public.stock_counts from anon, authenticated;
revoke all on table public.stock_counts from anon;
grant select on table public.stock_counts to authenticated;
comment on table public.stock_counts is
  'الجردُ الدوريّ (0216): سطرٌ لكلّ مادةٍ انعدّت. يُكتب من stock_count_submit/decide وحدهما؛ الفرقُ لا يمسّ الرصيد إلا بموافقة المدير.';

do $a$ begin
  if to_regprocedure('public.audit_change()') is not null then
    drop trigger if exists audit_all on public.stock_counts;
    create trigger audit_all after insert or update or delete on public.stock_counts
      for each row execute function audit_change();
  end if;
end $a$;

-- ── ٣) العدّ ──────────────────────────────────────────────────────────────
create or replace function public.stock_count_submit(p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_uid     uuid := auth.uid();
  v_name    text;
  l         jsonb;
  v_pid     uuid;
  v_p       record;
  v_counted numeric;
  v_diff    numeric;
  v_reason  text;
  v_note    text;
  n_match   int := 0;
  n_pending int := 0;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'count_empty' using hint = 'ماكو سطور بالعدّ';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'count_too_many' using hint = 'أكثر من ٢٠٠ مادة بمرّة — قسّم العدّ';
  end if;
  v_name := coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid));

  for l in select value from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (l->>'product_id')::uuid;
      v_counted := (l->>'counted')::numeric;
    exception when others then
      raise exception 'count_bad_line' using hint = 'سطرٌ بالعدّ ناقص أو رقمه غلط';
    end;
    if v_counted is null or v_counted < 0 then
      raise exception 'count_bad_qty' using hint = 'العدد لازم يكون صفر أو أكثر';
    end if;

    select id, name, stock, purchase_price, pooled into v_p
      -- مخزنُ الحقل (0191) خارج: له جردُه بصفحته، ولا يختلط بمال العيادة.
      from products where id = v_pid and clinic_id = v_clinic and farm_id is null
      for update;
    if not found then
      raise exception 'count_product_missing' using hint = 'مادةٌ بالعدّ ما موجودة بمخزن العيادة — حدّث الصفحة';
    end if;
    if coalesce(v_p.pooled, false) then
      raise exception 'count_pooled'
        using hint = format('«%s» رصيدها بمخزون القسم — تنعدّ من «تعديل / جرد» القسم', v_p.name);
    end if;

    v_diff := v_counted - coalesce(v_p.stock, 0);
    v_reason := nullif(btrim(coalesce(l->>'reason', '')), '');
    v_note := left(nullif(btrim(coalesce(l->>'note', '')), ''), 200);
    if v_diff = 0 then
      v_reason := null;
    elsif v_diff < 0 and (v_reason is null or v_reason not in ('damaged', 'expired', 'shortage', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» ناقصة — اختر السبب: تالف، منتهي، عجز، أو خطأ إدخال', v_p.name);
    elsif v_diff > 0 and (v_reason is null or v_reason not in ('found', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» زايدة — اختر السبب: لقينا زيادة، أو خطأ إدخال', v_p.name);
    end if;

    -- الأحدثُ أصدق: معلَّقٌ قديمٌ لنفس المادة يُلغى قبل تسجيل الجديد.
    update stock_counts set status = 'void', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
     where clinic_id = v_clinic and product_id = v_pid and status = 'pending';

    insert into stock_counts (clinic_id, product_id, product_name, system_qty, counted_qty, unit_cost,
                              reason, note, status, counted_by, counted_by_name)
    values (v_clinic, v_pid, v_p.name, coalesce(v_p.stock, 0), v_counted,
            greatest(coalesce(v_p.purchase_price, 0), 0), v_reason, v_note,
            (case when v_diff = 0 then 'matched' else 'pending' end), v_uid, v_name);
    if v_diff = 0 then n_match := n_match + 1; else n_pending := n_pending + 1; end if;
  end loop;

  return jsonb_build_object('matched', n_match, 'pending', n_pending);
end $$;
revoke all on function public.stock_count_submit(jsonb) from public, anon;
grant execute on function public.stock_count_submit(jsonb) to authenticated;

-- ── ٤) الموافقة ───────────────────────────────────────────────────────────
create or replace function public.stock_count_decide(p_ids uuid[], p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_uid    uuid := auth.uid();
  v_name   text;
  r        record;
  v_old    numeric;
  v_new    numeric;
  v_done   uuid[] := '{}';
  n_ok     int := 0;
  n_rej    int := 0;
  n_void   int := 0;
  v_reason text;
  v_label  text;
  v_amt    numeric;
  v_items  text;
  v_exp    uuid;
  v_out    jsonb := '[]'::jsonb;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if auth_role() is distinct from 'manager' then
    -- P0001 (الافتراضي) لا 42501: الواجهةُ تعرض الـhint العربيّ لرفضٍ مقصودٍ وحده.
    raise exception 'count_needs_manager'
      using hint = 'الموافقة على فرق الجرد للمدير وحده — افتح وضع المدير';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or p_approve is null then
    raise exception 'count_nothing' using hint = 'ما اخترت ولا سطر';
  end if;
  v_name := coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid));

  for r in select * from stock_counts
            where id = any(p_ids) and clinic_id = v_clinic and status = 'pending'
            order by counted_at, id
            for update
  loop
    if not p_approve then
      update stock_counts set status = 'rejected', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_rej := n_rej + 1;
      continue;
    end if;

    select stock into v_old from products where id = r.product_id and clinic_id = v_clinic for update;
    if not found then
      update stock_counts set status = 'void', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_void := n_void + 1;
      continue;
    end if;
    -- **الفرقُ لا الرقم**: ما بيع بين العدّ والموافقة يبقى مبيعاً.
    v_new := greatest(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 0);
    update products set stock = v_new where id = r.product_id and clinic_id = v_clinic;
    update stock_counts
       set status = 'approved', applied_delta = v_new - coalesce(v_old, 0),
           decided_by = v_uid, decided_by_name = v_name, decided_at = now()
     where id = r.id;
    v_done := v_done || r.id;
    n_ok := n_ok + 1;
  end loop;

  -- سحبٌ لكلّ سببِ خسارة، بموادّه بالضبط وبسعر الشراء. خطأُ الإدخال والزيادةُ لا سحبَ لهما.
  for v_reason in
    select distinct c.reason from stock_counts c
     where c.id = any(v_done) and c.reason in ('damaged', 'expired', 'shortage')
     order by 1
  loop
    v_label := (case v_reason when 'damaged' then 'تالف' when 'expired' then 'منتهي' else 'عجز' end);
    select sum(-c.applied_delta * c.unit_cost),
           string_agg(format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)), '، ' order by c.product_name)
      into v_amt, v_items
      from stock_counts c
     where c.id = any(v_done) and c.reason = v_reason and c.applied_delta < 0 and c.unit_cost > 0;
    v_amt := round(coalesce(v_amt, 0), 2);
    continue when v_amt <= 0;
    insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
    values (v_clinic, v_amt, left(format('سحب مخزن — %s: %s', v_label, v_items), 1000),
            'سحب مخزن', 'stock', v_uid, now())
    returning id into v_exp;
    update stock_counts set expense_id = v_exp
     where id = any(v_done) and reason = v_reason and applied_delta < 0 and unit_cost > 0;
    v_out := v_out || jsonb_build_object('reason', v_reason, 'amount', v_amt, 'expense_id', v_exp);
  end loop;

  return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out);
end $$;
revoke all on function public.stock_count_decide(uuid[], boolean) from public, anon;
grant execute on function public.stock_count_decide(uuid[], boolean) to authenticated;

-- ── ٥) القراءات ──────────────────────────────────────────────────────────
-- قيمةُ الفروق المعتمدة بأسبابها بمدّة (بيوم الموافقة — يومِ السحب). الموجبُ خسارة،
-- والسالبُ زيادة. تُجمع هنا لا بالمتصفّح (0149: المجاميعُ من الخادم).
create or replace function public.report_stock_losses(p_from timestamptz, p_to timestamptz)
returns table (reason text, lines int, qty numeric, value numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select c.reason, count(*)::int, sum(-c.applied_delta), round(sum(-c.applied_delta * c.unit_cost), 2)
    from stock_counts c
   where c.clinic_id = (select auth_clinic())
     and c.status = 'approved'
     and c.applied_delta <> 0
     and c.decided_at >= p_from and c.decided_at < p_to
   group by c.reason
$$;
revoke all on function public.report_stock_losses(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_stock_losses(timestamptz, timestamptz) to authenticated;

-- آخرُ عدٍّ وآخرُ فرقٍ لكلّ مادة — «الأقدمُ عدّاً» و«المشكوك» باختيار عدّ اليوم.
create or replace function public.stock_count_state()
returns table (product_id uuid, last_counted_at timestamptz, last_diff_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.product_id, max(c.counted_at),
         max(c.counted_at) filter (where c.counted_qty <> c.system_qty and c.status in ('pending', 'approved'))
    from stock_counts c
   where c.clinic_id = (select auth_clinic())
     and c.product_id is not null
     and c.status <> 'void'
   group by c.product_id
$$;
revoke all on function public.stock_count_state() from public, anon;
grant execute on function public.stock_count_state() to authenticated;
