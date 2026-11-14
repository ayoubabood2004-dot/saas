-- ============================================================================
-- ٠٢٧٠ — ملفُّ الزبون: معلوماتٌ يدوية لزبونٍ بلا حيوان، ويُبحث عنه بلا شراء، وفواتيرُه بمفتاحه
--
-- طلبُ المالك (١٤/١١): «لمّا نكتب الرقم والاسم يصير سجلّ حالة كامل لهذا الزبون — بيه معلوماته، بلا حيوان، أكدر أفوت عليه،
-- أضيف له حيواناً بعدين وأسوّي له مبيعات». وقراراتُه: الملفُّ تلقائيٌّ لكلّ من كُتب اسمُه أو رقمُه، وزرُّ «زبون جديد» لمن ما
-- اشترى بعد، والمعلوماتُ عنوانٌ أو منطقة وملاحظات. الخطّة: docs/customer-file-plan.md (م١).
--
-- ── الهويّة: cust_key (0231) لا صفٌّ ─────────────────────────────────────────
-- الزبونُ مشتقٌّ من الفواتير والحيوانات بمفتاحه (`customer_search`، 0232)، والملفُّ يُفتح لأيّ مفتاح. `customer_profiles` صفٌّ لمن
-- له معلوماتٌ يدوية أو زبونٌ سُجّل قبل أن يشتري: الخادمُ يحسب المفتاحَ بنفسه عند الإدراج (بدولة العيادة كما يحسبه البحث)، وتعديلٌ
-- يغيّر الهويّةَ يُرفض بجملة — تغييرُ الرقم = زبونٌ ثانٍ وفواتيرُه القديمة تبقى بالأوّل (الدمجُ خارج م١). والقراءةُ والإدراجُ والتعديل
-- لكادر العيادة (كالحيوانات)، ولا حذف.
--
-- ── customer_search: مصدرٌ ثالث ──────────────────────────────────────────────
-- نصُّ 0232 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0270` (وحارسُ الانجراف قبل التعريف): صفوفُ الملفّات مصدرٌ ثالث (زبونٌ يدويّ يُبحث عنه
-- بلا شراء، واسمُه ورقمُه كما كتبتهما العيادة يغلبان)، و«زبائن المبيعات بلا حيوان» يعدّ صاحبَ الملفّ كمن اشترى، وعدُّ الشراء
-- وتاريخاه يستثنيان `sale_kind = 'opening'` (الدينُ القديم، م٢ — لا قيمةَ بها قبلها فلا أثر).
--
-- ── customer_key_invoices: فواتيرُ المفتاح كلُّها ─────────────────────────────
-- `customer_invoices` (0149) يطابق أرقامَ الهاتف الخامّة، فـ«0770…» و«+964 770…» عنده زبونان — ولا يُمسّ بقرارٍ سابق (0232).
-- والملفُّ يسأل بالمفتاح نفسِه الذي يجمع به البحث: الأزواجُ المتمايزة (اسم، رقم) أوّلاً ثمّ مفتاحُ كلّ زوج (كلفةُ 0232 المقيسة).
-- قراءةٌ بصلاحية المُستدعي (RLS الحَكَم)، بمسارٍ مثبَّت، ممنوعةٌ عن anon.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: drop function customer_key_invoices(text)؛ أعد customer_search من 0232 حرفاً؛
--        drop table customer_profiles (المعلوماتُ اليدوية وحدها تضيع — الفواتيرُ والحيوانات لا تُمسّ).
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.cust_key(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0231 (مفتاح الزبون) و0252 (حارس الانحراف) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.customer_search(text,text,text,integer,integer,integer)', '741abdfedd4eec534c1c90d932ac3484', '-- +0270');

-- ── ١) الملفّات ──────────────────────────────────────────────────────────────
create table if not exists public.customer_profiles (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  cust_key    text not null,
  name        text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  constraint customer_profiles_len check (
    char_length(coalesce(name, '')) <= 80 and char_length(coalesce(phone, '')) <= 40
    and char_length(coalesce(address, '')) <= 200 and char_length(coalesce(notes, '')) <= 2000)
);
create unique index if not exists customer_profiles_key on public.customer_profiles (clinic_id, cust_key);
comment on table public.customer_profiles is
  'ملفُّ الزبون (0270): معلوماتٌ يدوية (عنوان، ملاحظات) أو زبونٌ سُجّل قبل أن يشتري. الهويّةُ cust_key يحسبها الخادم ويجمّدها.';

-- الخادمُ يحسب المفتاح ويجمّده، ويختم الأوقات (لا الجهاز): شرطُ «كما فُتحت» يقارن بـupdated_at.
create or replace function public.customer_profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dial text;
  v_key  text;
begin
  new.name    := nullif(btrim(regexp_replace(coalesce(new.name, ''), E'[ \t\r\n]+', ' ', 'g')), '');
  new.phone   := nullif(btrim(coalesce(new.phone, '')), '');
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.notes   := nullif(btrim(coalesce(new.notes, '')), '');
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = new.clinic_id;
  v_key := cust_key(new.phone, new.name, v_dial);
  if v_key is null then
    raise exception 'customer_no_identity' using errcode = 'P0001', hint = 'اكتب اسم الزبون أو رقمه.';
  end if;
  if tg_op = 'INSERT' then
    new.cust_key := v_key;
    new.created_at := now();
    if current_user = 'authenticated' then
      new.created_by := auth.uid();
    end if;
  else
    if new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id then
      raise exception 'customer_frozen' using errcode = 'P0001', hint = 'هويّة الملفّ وعيادته ما تتغيّر.';
    end if;
    if v_key is distinct from cust_key(old.phone, old.name, v_dial) then
      raise exception 'customer_key_frozen' using errcode = 'P0001',
        hint = 'الرقم (أو الاسم إذا ماكو رقم) هويّة الزبون — تغييره يسوّي زبون ثاني وفواتيره تبقى بالأوّل.';
    end if;
    new.cust_key := old.cust_key;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.customer_profiles_guard() from public, anon, authenticated;
drop trigger if exists customer_profiles_guard on public.customer_profiles;
create trigger customer_profiles_guard before insert or update on public.customer_profiles
  for each row execute function public.customer_profiles_guard();

alter table public.customer_profiles enable row level security;
drop policy if exists customer_profiles_read on public.customer_profiles;
create policy customer_profiles_read on public.customer_profiles for select to authenticated
  using (clinic_id = (select auth_clinic()));
drop policy if exists customer_profiles_add on public.customer_profiles;
create policy customer_profiles_add on public.customer_profiles for insert to authenticated
  with check (clinic_id = (select auth_clinic()));
drop policy if exists customer_profiles_edit on public.customer_profiles;
create policy customer_profiles_edit on public.customer_profiles for update to authenticated
  using (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));
revoke all on table public.customer_profiles from anon;
grant select, insert, update on table public.customer_profiles to authenticated;
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('customer_profiles');
  end if;
end $$;

-- ── ٢) دليلُ الزبائن: الملفّاتُ مصدرٌ ثالث، والدينُ القديم ليس شراءً ─────────────
create or replace function public.customer_search(
  p_q      text default null,
  p_sort   text default 'match',
  p_filter text default 'all',
  p_limit  int  default 8,
  p_offset int  default 0,
  p_top    int  default 0)
returns table (
  key text, name text, phone text, purchases int, refunds int,
  first_at timestamptz, last_at timestamptz,
  pets jsonb, pets_alive int, pets_deceased int,
  matched text, top jsonb, total bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_clinic uuid := auth_clinic();
  v_dial   text;
  v_q      text := left(btrim(coalesce(p_q, '')), 80);
  v_sort   text := coalesce(p_sort, 'match');
  v_filter text := coalesce(p_filter, 'all');
  v_mode   text;
  v_pq     text := '';
  v_nq     text := '';
  v_limit  int  := least(greatest(coalesce(p_limit, 8), 1), 100);
  v_offset int  := least(greatest(coalesce(p_offset, 0), 0), 10000);
  v_top    int  := least(greatest(coalesce(p_top, 0), 0), 5);
begin
  if v_clinic is null then
    raise exception 'no_clinic' using errcode = 'P0001', hint = 'ما عرفنا عيادتك — سجّل دخول من جديد.';
  end if;
  if v_sort not in ('match', 'recent', 'purchases') or v_filter not in ('all', 'nopets') then
    raise exception 'bad_argument' using errcode = '22023', hint = 'ترتيبٌ أو فلترٌ غير معروف.';
  end if;
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;

  -- مرآةُ readCustomerQuery: أرقامٌ وعلاماتُ هاتف (ومسافاتُ جافاسكربت بأسمائها) = بالرقم.
  if v_q = '' then
    v_mode := 'list';
  elsif v_q ~ '^[0-9\t\n\v\f\r \x00A0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000\xFEFF\x0660-\x0669\x06F0-\x06F9+()-]+$' then
    v_pq := cust_phone_nat(v_q, v_dial);
    v_mode := case when length(v_pq) >= 3 then 'phone' else 'short' end;
  else
    v_nq := cust_norm(v_q);
    v_mode := case when char_length(v_nq) >= 2 then 'name' else 'short' end;
  end if;
  if v_mode = 'short' then
    return;
  end if;

  return query
  with inv as materialized (
    select i.customer_name as nm, i.customer_phone as ph,
-- -0270            (count(*) filter (where coalesce(i.status, 'paid') <> 'refunded'))::int as n_buy,
           (count(*) filter (where coalesce(i.status, 'paid') <> 'refunded' and i.sale_kind <> 'opening'))::int as n_buy,   -- +0270
           (count(*) filter (where coalesce(i.status, 'paid') = 'refunded'))::int as n_ref,
-- -0270            min(i.created_at) as f_at, max(i.created_at) as l_at
           min(i.created_at) filter (where i.sale_kind <> 'opening') as f_at,   -- +0270
           max(i.created_at) filter (where i.sale_kind <> 'opening') as l_at   -- +0270
      from invoices i
     where i.clinic_id = v_clinic
       and (coalesce(btrim(i.customer_name), '') <> '' or coalesce(btrim(i.customer_phone), '') <> '')
     group by i.customer_name, i.customer_phone
  ),
  src as materialized (
    select 'inv'::text as kind, v.nm, v.ph, v.n_buy, v.n_ref, v.f_at, v.l_at, v.l_at as seen_at,
           null::uuid as pet_id, null::text as pet_name, null::text as species, false as dead,
           cust_phone_key(v.ph, v_dial) as pk, cust_name_key(v.nm) as nk
      from inv v
    union all
    select 'pet', p.owner_name, p.owner_phone, 0, 0, null::timestamptz, null::timestamptz, p.created_at,
           p.id, p.name, p.species::text, coalesce(p.deceased, false),
           cust_phone_key(p.owner_phone, v_dial), cust_name_key(p.owner_name)
      from pets p
     where p.clinic_id = v_clinic
       and p.shared_with_clinic is not false
    union all   -- +0270
    select 'cust', cp.name, cp.phone, 0, 0, null::timestamptz, null::timestamptz, cp.created_at,   -- +0270
           null::uuid, null::text, null::text, false,   -- +0270
           cust_phone_key(cp.phone, v_dial), cust_name_key(cp.name)   -- +0270
      from customer_profiles cp   -- +0270
     where cp.clinic_id = v_clinic   -- +0270
  ),
  grp as (
    select s.*, coalesce('p:' || s.pk, 'n:' || s.nk) as gkey from src s
  ),
  ranked as (
    select g.gkey,
           case v_mode
             when 'list' then 9
             when 'phone' then
               case when g.pk = v_pq then 0
                    when starts_with(g.pk, v_pq) then 1
                    when strpos(g.pk, v_pq) > 0 then 2 end
             else
               case when starts_with(g.nk, v_nq) then 3
                    when strpos(g.nk, v_nq) > 0 then 4
                    when g.kind = 'pet' and strpos(cust_norm(g.pet_name), v_nq) > 0 then 5 end
           end as rk
      from grp g
     where g.gkey is not null
  ),
  hit as (
    select r.gkey, min(r.rk) as rk from ranked r group by r.gkey having min(r.rk) is not null
  ),
  agg as (
    select g.gkey, h.rk,
-- -0270            (array_agg(btrim(g.nm) order by g.seen_at desc nulls last, btrim(g.nm) collate "C") filter (where g.nk is not null))[1] as dname,
           (array_agg(btrim(g.nm) order by (g.kind = 'cust') desc, g.seen_at desc nulls last, btrim(g.nm) collate "C") filter (where g.nk is not null))[1] as dname,   -- +0270
-- -0270            (array_agg(btrim(g.ph) order by g.seen_at desc nulls last, btrim(g.ph) collate "C") filter (where g.pk is not null))[1] as dphone,
           (array_agg(btrim(g.ph) order by (g.kind = 'cust') desc, g.seen_at desc nulls last, btrim(g.ph) collate "C") filter (where g.pk is not null))[1] as dphone,   -- +0270
           sum(g.n_buy)::int as n_buy, sum(g.n_ref)::int as n_ref,
           min(g.f_at) as f_at, max(g.l_at) as l_at, max(g.seen_at) as last_seen,
           coalesce(jsonb_agg(jsonb_build_object('id', g.pet_id, 'name', g.pet_name, 'species', g.species, 'deceased', g.dead)
                              order by g.dead, g.seen_at desc nulls last, g.pet_id::text collate "C")
                    filter (where g.kind = 'pet'), '[]'::jsonb) as pets_j,
           (count(*) filter (where g.kind = 'pet' and not g.dead))::int as n_alive,
-- -0270            (count(*) filter (where g.kind = 'pet' and g.dead))::int as n_dead
           (count(*) filter (where g.kind = 'pet' and g.dead))::int as n_dead,   -- +0270
           bool_or(g.kind = 'cust') as has_prof   -- +0270
      from grp g
      join hit h on h.gkey = g.gkey
     group by g.gkey, h.rk
  ),
  filt as (
    select a.*, count(*) over () as n_total,
           row_number() over (order by
             case when v_sort = 'purchases' then a.n_buy end desc nulls last,
             case when v_sort = 'match' and v_mode <> 'list' then a.rk end asc nulls last,
             a.last_seen desc nulls last,
             a.gkey collate "C") as rn
      from agg a
-- -0270      where v_filter = 'all' or (a.n_buy >= 1 and a.n_alive + a.n_dead = 0)
     where v_filter = 'all' or ((a.n_buy >= 1 or a.has_prof) and a.n_alive + a.n_dead = 0)   -- +0270
  ),
  page as materialized (
    select f.* from filt f where f.rn > v_offset and f.rn <= v_offset + v_limit
  ),
  -- أكثرُ ما يشتريه زبائنُ الصفحة وحدهم (لا العيادة كلّها): مفتاحُ كلّ فاتورةٍ مرّةً واحدة.
  pinv as materialized (
    select i.id, i.created_at, cust_key(i.customer_phone, i.customer_name, v_dial) as gk
      from invoices i
     where v_top > 0
       and i.clinic_id = v_clinic
       and coalesce(i.status, 'paid') <> 'refunded'
       and (coalesce(btrim(i.customer_name), '') <> '' or coalesce(btrim(i.customer_phone), '') <> '')
  ),
  lines as (
    select pi.gk, coalesce('id:' || ii.product_id::text, 'nm:' || cust_norm(ii.name)) as ik,
           ii.qty, ii.invoice_id, pi.created_at, ii.name as iname, ii.id::text as line_id
      from pinv pi
      join invoice_items ii on ii.invoice_id = pi.id
     where pi.gk in (select pg.gkey from page pg)
  ),
  items as (
    select l.gk, l.ik, sum(l.qty) as qty,
           (count(distinct l.invoice_id) filter (where l.qty > 0))::int as times,
           max(l.created_at) as l_at,
           (array_agg(l.iname order by l.created_at desc, l.line_id collate "C"))[1] as iname
      from lines l
     group by l.gk, l.ik
    having count(distinct l.invoice_id) filter (where l.qty > 0) > 0 and sum(l.qty) > 0
  ),
  topped as (
    select it.*, row_number() over (partition by it.gk order by it.times desc, it.qty desc, it.l_at desc, it.ik collate "C") as tr
      from items it
  )
  select pg.gkey, pg.dname, pg.dphone, pg.n_buy, pg.n_ref, pg.f_at, pg.l_at,
         pg.pets_j, pg.n_alive, pg.n_dead,
         case when pg.rk <= 2 then 'phone' when pg.rk <= 4 then 'name' when pg.rk = 5 then 'pet' end,
         case when v_top > 0 then
           coalesce((select jsonb_agg(jsonb_build_object('name', t.iname, 'times', t.times, 'qty', t.qty) order by t.tr)
                       from topped t where t.gk = pg.gkey and t.tr <= v_top), '[]'::jsonb)
         end,
         pg.n_total
    from page pg
   order by pg.rn;
end $$;

revoke all on function public.customer_search(text, text, text, int, int, int) from public, anon;
grant execute on function public.customer_search(text, text, text, int, int, int) to authenticated;

-- ── ٣) فواتيرُ المفتاح ─────────────────────────────────────────────────────
create or replace function public.customer_key_invoices(p_key text)
returns setof invoices
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_dial   text;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using errcode = 'P0001', hint = 'ما عرفنا عيادتك — سجّل دخول من جديد.';
  end if;
  if coalesce(btrim(p_key), '') = '' then
    return;
  end if;
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
  return query
  with pairs as materialized (
    select distinct i.customer_name as nm, i.customer_phone as ph
      from invoices i
     where i.clinic_id = v_clinic
       and (coalesce(btrim(i.customer_name), '') <> '' or coalesce(btrim(i.customer_phone), '') <> '')
  ),
  hit as materialized (
    select p.nm, p.ph from pairs p where cust_key(p.ph, p.nm, v_dial) = p_key
  )
  select i.*
    from invoices i
    join hit h on i.customer_name is not distinct from h.nm and i.customer_phone is not distinct from h.ph
   where i.clinic_id = v_clinic
   order by i.created_at desc, i.id;
end $$;
revoke all on function public.customer_key_invoices(text) from public, anon;
grant execute on function public.customer_key_invoices(text) to authenticated;
comment on function public.customer_key_invoices(text) is
  'فواتيرُ الزبون بمفتاحه (0270): الأزواجُ (اسم، رقم) التي يجمعها customer_search تحت المفتاح نفسِه، كلُّ التاريخ، الأحدثُ أوّلاً.';

reset lock_timeout;
