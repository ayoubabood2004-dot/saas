-- ============================================================================
-- ٠٢٣٢ — دليلُ الزبائن يُشتقّ بالخادم: كلُّ التاريخ، والحيوانات، ورقمٌ بأيّ صيغة
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- بحثُ الزبون بالبيع كان يُنزّل آخرَ ٣٠٠ فاتورة إلى المتصفّح ويجمعها هناك (`dedupeCustomers`)
-- بمفتاح النصّ الخام. فما قبل الـ٣٠٠ لا وجودَ له (٢٬٠٨٤ فاتورةً باسمٍ أو رقم بالإنتاج)،
-- وصاحبُ الحيوان الذي لم يشترِ بعد لا يطلع (١٬١٩٠ حيواناً برقم صاحبه)، والرقمُ بصيغتين
-- زبونان. والعلاجُ ليس نافذةً أوسع بالمتصفّح: هو سؤالُ الخادم بالمفتاح الواحد (0231).
--
-- ── customer_search ───────────────────────────────────────────────────────
-- ثلاثةُ مصادر للعيادة نفسِها (`clinic_id = auth_clinic()` **صراحةً** فوق RLS):
--   • الفواتير باسمٍ أو رقم — كلُّ التاريخ، مجمَّعةً أوّلاً بالزوج الخام (اسم، رقم)؛
--   • حيواناتُ العيادة (`shared_with_clinic` ليس false) — صاحبُها ورقمُه؛
-- ثم يُحسب لكلّ صفٍّ مفتاحُه (`cust_key` بمفتاح دولة العيادة من `clinic_prefs`، وافتراضُه 964)
-- فتصير الصفوفُ زبائن: الهاتفُ يغلب، والاسمُ وحده يجمع ما لا رقمَ له، ولا يُدمج عبر رقم.
--
-- النصُّ: فارغٌ = القائمة كلُّها؛ أرقامٌ = بالرقم الوطنيّ (٣ أرقامٍ فأكثر: مطابقٌ ثم يبدأ به ثم
-- يحويه)؛ وإلا بالاسم المطويّ (حرفان فأكثر: أيُّ اسمٍ بالمجموعة يبدأ به ثم يحويه، ثم اسمُ
-- حيوانٍ يحويه). وما دون ذلك لا يرجع شيئاً — والواجهةُ لا ترسله أصلاً (readCustomerQuery).
-- المطابقةُ بـ`starts_with`/`strpos` لا `like`: لا محارفَ خاصّة («%» و«_» بالأسماء) تحتاج هروباً.
--
-- الفلتر: `all` للبيع، و`nopets` لقسم «زبائن المبيعات» بالتقارير (اشترى مرّةً على الأقل
-- ولا حيوانَ له بالعيادة — حيّاً أو متوفّى). والترتيب: `match` (الأقربُ ثم الأحدث)،
-- `recent`، `purchases` (الأكثرُ تكراراً). و`total` قبل الصفحة — فلا تُصدَّق قائمةٌ ناقصة.
-- و`p_top` (حتى ٥): أكثرُ ما يشتريه كلُّ زبونٍ بالصفحة — مرّاتٍ وكميةً، **بلا مبلغ**.
--
-- **لا فلوسَ هنا** (قرارُ المالك: شاشاتُ المال — الديون ودفتر الزبون ومبيعات الحيوان —
-- تبقى كما هي، و`customer_invoices` لا تُمسّ). عددُ الشراء والإرجاع فقط.
--
-- قراءةٌ فقط، بصلاحية المُستدعي (RLS تبقى الحَكَم)، بمسارٍ مثبَّت، ممنوعةٌ عن anon. لا
-- تكتب سطراً بأيّ سجلّ — فالمشغّلُ داخلَ عيادةٍ (0151) يبحث كأنه من كادرها بلا أثر.
-- وليست بقائمة `api_gate` — موظّفُ التصوير لا يبحث بالزبائن.
-- الكلفةُ المقيسة لمثلها (تصميمٌ أوّليّ، أثقلُ عيادة): ~٨٠ms.
--
-- تراجع: drop function customer_search(text, text, text, int, int, int) — والواجهةُ القديمة
--        لا تناديها (تقرأ الفواتير مباشرة).
-- ============================================================================

set lock_timeout = '5s';

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
           (count(*) filter (where coalesce(i.status, 'paid') <> 'refunded'))::int as n_buy,
           (count(*) filter (where coalesce(i.status, 'paid') = 'refunded'))::int as n_ref,
           min(i.created_at) as f_at, max(i.created_at) as l_at
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
           (array_agg(btrim(g.nm) order by g.seen_at desc nulls last, btrim(g.nm) collate "C") filter (where g.nk is not null))[1] as dname,
           (array_agg(btrim(g.ph) order by g.seen_at desc nulls last, btrim(g.ph) collate "C") filter (where g.pk is not null))[1] as dphone,
           sum(g.n_buy)::int as n_buy, sum(g.n_ref)::int as n_ref,
           min(g.f_at) as f_at, max(g.l_at) as l_at, max(g.seen_at) as last_seen,
           coalesce(jsonb_agg(jsonb_build_object('id', g.pet_id, 'name', g.pet_name, 'species', g.species, 'deceased', g.dead)
                              order by g.dead, g.seen_at desc nulls last, g.pet_id::text collate "C")
                    filter (where g.kind = 'pet'), '[]'::jsonb) as pets_j,
           (count(*) filter (where g.kind = 'pet' and not g.dead))::int as n_alive,
           (count(*) filter (where g.kind = 'pet' and g.dead))::int as n_dead
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
     where v_filter = 'all' or (a.n_buy >= 1 and a.n_alive + a.n_dead = 0)
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

comment on function public.customer_search(text, text, text, int, int, int) is
  'دليلُ الزبائن المشتقّ (0232): الفواتير وحيواناتُ العيادة بمفتاح cust_key ودولة العيادة. قراءةٌ بلا مال، بصلاحية المُستدعي.';
