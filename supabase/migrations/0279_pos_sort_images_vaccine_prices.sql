-- ============================================================================
-- ٠٢٧٩ — شاشةُ البيع: ترتيبُ المنتجات وصورُها للعيادة كلّها، ومبيعاتُ آخر ٣٠ يوماً؛ وأسعارُ التطعيمات
--
-- طلبُ المالك (١٧/١١) وقراراتُه بسؤال:
--   • «لمن نطب على المبيعات تطلعلنا المنتجات … تخصيص: يشوف أول حسب الاسم لو الأكثر مبيعاً لو الأقل مبيعاً، ولمن يختار يضل ثابت»
--     ⇒ **للعيادة كلّها** ويتغيّر من شاشة البيع نفسِها، والمبيعُ **آخر ٣٠ يوماً**.
--   • «صور المنتجات تطلع بالمبيعات … بشرط ما يهنج ولا يضيع منتجات» ⇒ زرُّ تشغيلٍ وإطفاء بشاشة البيع، ثابتٌ للعيادة كذلك.
--   • «بالاعدادات نكدر نضيف تطعيمات … نسوي تسعيرات للتطعيمات، الدكتور لمن يختار تطعيم بالمبيعات يكون سعره سابقاً» ⇒ سعرٌ لكلّ
--     تطعيم يُكتب مرّةً بالإعدادات، **يتعبّى بالبيع ويُغيَّر لتلك البيعة**.
--
-- ── ١) clinic_prefs: `pos_sort` (name | top | low) و`pos_images` ─────────────────────────────────────────────
-- إعدادا عرضٍ لا مال: سياسةُ clinic_prefs (كلُّ الكادر بالعيادة يحدّث، 0021) تكفي — من يقف على شاشة البيع يغيّرهما (قرارُ المالك).
-- الصورُ مفعّلةٌ افتراضاً (ما بلا صورةٍ يبقى كما هو)، والترتيبُ بالاسم كما كان.
--
-- ── ٢) `pos_product_sales(p_days)` — كم بِيع من كلّ مادّة بآخر N يوماً ─────────────────────────────────────────
-- بوحدة المخزن (`coalesce(stock_qty, qty)` — الكارتونُ بعلبه)، صافياً بعد الراجع، بلا المرجَّعة كلُّها (refunded)؛ للعيادة وحدها
-- (definer بشرط auth_clinic — شاشةُ البيع لكلّ الكادر، والجوابُ كمّياتٌ لا مال). مدّةٌ محدودة دائماً (درسُ 0149: لا قراءةَ لجداول
-- المال بلا مدّة) — بين يومٍ و٣٦٦. المادّةُ التي لم تُبع لا صفَّ لها: الواجهةُ تقرؤها صفراً (لم تُبع) لا «غائبة».
--
-- ── ٣) `clinic_vaccine_prices` — سعرُ كلّ تطعيمٍ باسمه ─────────────────────────────────────────────────────
-- التطعيماتُ أسماءٌ (المدمجةُ بالكتالوج والعيادةُ تضيف أسماءها — clinic_vaccines)، فالسعرُ صفٌّ بمفتاح الاسم (`lower(btrim(name))`).
-- قراءةٌ لكلّ الكادر، والكتابةُ من `vaccine_price_set` وحدها (definer تسأل المدير أو manageSettings بنفسها — الجدولُ بلا سياسة
-- كتابة). سعرٌ فارغ (null) يمسح السعر. والمصوّرُ مسيَّج (0222).
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة (الواجهةُ تقرأ الأعمدةَ إن وُجدت، وتُخفي الترتيبَ بالمبيعات والأسعارَ بلا دالّتيها).
-- تراجع: drop function pos_product_sales(int)؛ drop function vaccine_price_set(text, numeric)؛ drop table clinic_vaccine_prices؛
--   والعمودان يبقيان (لا يقرؤهما شيءٌ قديم).
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) إعدادا شاشة البيع ────────────────────────────────────────────────────────────────────────────────
alter table public.clinic_prefs add column if not exists pos_sort text not null default 'name';
alter table public.clinic_prefs add column if not exists pos_images boolean not null default true;
alter table public.clinic_prefs drop constraint if exists clinic_prefs_pos_sort_ok;
alter table public.clinic_prefs add constraint clinic_prefs_pos_sort_ok check (pos_sort in ('name', 'top', 'low'));

-- ── ٢) مبيعاتُ كلّ مادّة بآخر N يوماً ───────────────────────────────────────────────────────────────────────
create or replace function public.pos_product_sales(p_days int default 30)
returns table (product_id uuid, qty numeric)
language sql stable security definer set search_path = public as $$
  select it.product_id, sum(coalesce(it.stock_qty, it.qty))
    from invoice_items it
    join invoices i on i.id = it.invoice_id
   where i.clinic_id = auth_clinic()
     and it.product_id is not null
     and coalesce(i.status, 'paid') <> 'refunded'
     and i.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 366))
   group by it.product_id
$$;
revoke all on function public.pos_product_sales(int) from public, anon;
grant execute on function public.pos_product_sales(int) to authenticated;

-- ── ٣) أسعارُ التطعيمات ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.clinic_vaccine_prices (
  clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  name_key   text not null,
  name       text not null,
  price      numeric not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, name_key),
  constraint clinic_vaccine_prices_ok check (
    char_length(btrim(name)) between 1 and 120 and name_key = lower(btrim(name)) and price >= 0 and price < 10000000000)
);
alter table public.clinic_vaccine_prices enable row level security;
alter table public.clinic_vaccine_prices force row level security;
drop policy if exists clinic_vaccine_prices_read on public.clinic_vaccine_prices;
create policy clinic_vaccine_prices_read on public.clinic_vaccine_prices for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_vaccine_prices from anon;
revoke insert, update, delete on table public.clinic_vaccine_prices from authenticated;
grant select on table public.clinic_vaccine_prices to authenticated;
select public.photographer_fence_table('clinic_vaccine_prices');

-- السعرُ يكتبه المدير (ومفتاحُه الحيّ) أو من له manageSettings — بالعيادة نفسِها. null يمسحه.
create or replace function public.vaccine_price_set(p_name text, p_price numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_name text := btrim(coalesce(p_name, ''));
  v_price numeric := round(p_price, 2);
  v_can boolean := false;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(auth_role(), '') = 'manager' then
    v_can := true;
  elsif to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'manageSettings';
  end if;
  if not coalesce(v_can, false) then
    raise exception 'forbidden' using errcode = '42501', hint = 'أسعار التطعيمات يكتبها المدير أو من عنده صلاحية الإعدادات.';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'bad_name' using errcode = 'P0001', hint = 'اختر التطعيم.';
  end if;
  if v_price is null then
    delete from clinic_vaccine_prices where clinic_id = v_clinic and name_key = lower(v_name);
    return jsonb_build_object('name', v_name, 'price', null);
  end if;
  if v_price < 0 or v_price >= 10000000000 then
    raise exception 'bad_price' using errcode = 'P0001', hint = 'السعر لازم رقم صفر أو أكثر.';
  end if;
  insert into clinic_vaccine_prices (clinic_id, name_key, name, price, updated_at)
  values (v_clinic, lower(v_name), v_name, v_price, now())
  on conflict (clinic_id, name_key) do update set name = excluded.name, price = excluded.price, updated_at = now();
  return jsonb_build_object('name', v_name, 'price', v_price);
end $$;
revoke all on function public.vaccine_price_set(text, numeric) from public, anon;
grant execute on function public.vaccine_price_set(text, numeric) to authenticated;
