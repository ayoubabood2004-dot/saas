-- ============================================================================
-- ٠١٩١ — حقولُ الدواجن: حقلٌ ⇒ قاعاتٌ ⇒ دفعةٌ ⇒ إدخالٌ يوميّ
--
-- ── المواصفة (بكلمة المالك، ١٧ أيلول) ────────────────────────────────────
-- «باقةٌ خاصّةٌ للحقل… يفتح حقلاً وداخله قاعات، كلُّ قاعةٍ لها تفاصيلُها…
--  بعدها يسوّي بداية دفعة… وتحت هذا الجملون معلوماتُ إدخالٍ يوميّ: كمّيةُ
--  العلف بالكيلو ونوعُه، والعلاجاتُ التي دخلت، والخدمات، وعددُ النفوق،
--  وملاحظاتُ الدكتور… ويكون عدنا مخزنٌ خاصٌّ للحقل… ولمّا يجي المسؤول يشوف
--  حركاتِ كلِّ يومٍ بالضبط وجرداً كاملاً بالأرقام الفعلية».
--
-- ── ثلاثةُ قراراتٍ حسمها المالك ─────────────────────────────────────────
-- ١) **قسمٌ داخل العيادة لا حسابٌ ثانٍ**: عيادةٌ عادية، وسكشنٌ يظهر باشتراك
--    الحقل. فـ`clinic_id` هنا — كعادته بهذا المستودع — **معرّفُ مساحةِ عمل**
--    لا «عيادة»، ونكسب المصادقةَ والعزلَ والمخزونَ كما هي.
-- ٢) **المخزنُ هو المخزنُ القائم**: `products` نفسُها، بعمودٍ يقول لأيّ حقلٍ
--    هذا الصنف (`farm_id`). جدولٌ واحدٌ وعرضان — ومخزنان منفصلان يعنيان
--    دفترَين لا يتّفقان، وجردٌ «بالأرقام الفعلية» لا يصحّ من دفترين.
-- ٣) **ما يدخل الحقلَ استهلاكٌ لا بيع**: «ما صار ربح على المنتج، استخدمه
--    للحقل مالته، يعني صارت صرفية». فلا فاتورةَ ولا هامش — تُقيَّد بسعر
--    الشراء كلفةً على الدفعة.
--
-- ── وثلاثةٌ حسمتها الدراسة، وأهمُّها الأوّل ──────────────────────────────
-- أ) **القاعةُ تحفظ والدفعةُ تملك.** المواصفةُ تضع العددَ والنوعَ والسلالةَ
--    على القاعة، وهي صفاتُ **الدفعة**: نفسُ الجملون يأخذ عشرين ألفاً هذه
--    الدورة وثمانيةَ عشرَ التالية. فلو عاشت على القاعة لطمس فتحُ الدفعةِ
--    الثانيةِ تاريخَ الأولى — ومات «المسؤولُ يشوف حركاتِ كلّ يومٍ بالضبط»،
--    وهو الغايةُ المعلَنة. فالقاعةُ تحمل الثابتَ الفيزيائيَّ و**افتراضاتٍ**
--    (`default_*`) تُنسخ وحدَها عند فتح دفعة، والدفعةُ تملك القيمَ الفعلية.
--    الدكتورُ يعبّئ مرّةً كما وصف، والتاريخُ يبقى.
-- ب) **العلفُ ليس عموداً بالإدخال اليوميّ.** لو كان `feed_kg` عموداً وكانت
--    له سطورُ استهلاكٍ أيضاً، صار للعلف رقمان ينحرفان. فالعلفُ سطرُ استهلاكٍ
--    (`poultry_use`) كالدواء: المنتجُ **هو** نوعُ العلف، والكمّيةُ كيلوات،
--    والشاشةُ تعرض مجموعَها «كمّيةَ اليوم». مصدرٌ واحد.
-- ج) **صرفياتُ الحقل لا تدخل أرباحَ العيادة.** لا صفَّ بـ`expenses`: لو كُتبت
--    هناك لظهرت بشاشة المال وشوّهت «صافي الربح» و«صافي الجيوب». كلفةُ الدفعة
--    تعيش هنا.
--
-- ── الحزمة ───────────────────────────────────────────────────────────────
-- تنزل بـ`supabase/tests/run.sh`، والعزلُ يُفحص بدور `authenticated` لا
-- superuser. إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0190.
-- ============================================================================

-- ── ١) الحقل ─────────────────────────────────────────────────────────────
create table if not exists poultry_farms (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  name         text not null,
  owner_name   text,
  owner_phone  text,
  governorate  text,
  area         text,
  note         text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists poultry_farms_clinic_idx on poultry_farms(clinic_id, created_at desc);

-- ── ٢) القاعة (الجملون) ──────────────────────────────────────────────────
-- `capacity` طاقةٌ فيزيائية، و`default_*` ما يُنسخ للدفعة الجديدة (قرار «أ»).
create table if not exists poultry_houses (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  farm_id       uuid not null references poultry_farms(id) on delete cascade,
  label         text not null,
  capacity      integer check (capacity is null or capacity > 0),
  default_kind  text check (default_kind is null or default_kind in ('broiler','layer')),
  default_breed text,
  default_count integer check (default_count is null or default_count > 0),
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists poultry_houses_farm_idx   on poultry_houses(farm_id, label);
create index if not exists poultry_houses_clinic_idx on poultry_houses(clinic_id);

-- ── ٣) الدفعة ────────────────────────────────────────────────────────────
-- `placed_on` تاريخُ وضع الدجاج — ومنه وحدَه يُحسب عمرُ الدفعة («شوكت بلّشوا»).
create table if not exists poultry_cycles (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  farm_id        uuid not null references poultry_farms(id) on delete cascade,
  house_id       uuid not null references poultry_houses(id) on delete cascade,
  kind           text not null check (kind in ('broiler','layer')),
  breed          text,
  placed_on      date not null,
  placed_count   integer not null check (placed_count > 0),
  chick_unit_cost numeric check (chick_unit_cost is null or chick_unit_cost >= 0),
  status         text not null default 'active' check (status in ('active','closed')),
  closed_on      date,
  sold_count     integer check (sold_count is null or sold_count >= 0),
  sold_weight_kg numeric check (sold_weight_kg is null or sold_weight_kg >= 0),
  sale_total     numeric check (sale_total is null or sale_total >= 0),
  note           text,
  created_at     timestamptz not null default now(),
  -- دفعةٌ مغلقةٌ لازم تاريخُ إغلاق، والعكس: المفتوحةُ بلا تاريخ.
  constraint poultry_cycles_closed_chk check ((status = 'closed') = (closed_on is not null))
);
create index if not exists poultry_cycles_house_idx  on poultry_cycles(house_id, placed_on desc);
create index if not exists poultry_cycles_farm_idx   on poultry_cycles(farm_id, status, placed_on desc);
create index if not exists poultry_cycles_clinic_idx on poultry_cycles(clinic_id);

-- **قاعةٌ واحدةٌ = دفعةٌ نشطةٌ واحدة.** دفعتان نشطتان بنفس الجملون تعنيان أنّ
-- كلَّ رقمٍ يوميٍّ بعدهما لا يُعرف لأيّهما — والفهرسُ الفريدُ الجزئيّ يمنعها
-- بالقاعدة لا بالواجهة.
create unique index if not exists poultry_cycles_one_active_per_house
  on poultry_cycles(house_id) where status = 'active';

-- ── ٤) الإدخالُ اليوميّ ──────────────────────────────────────────────────
-- لا `feed_kg` هنا (قرار «ب»): العلفُ سطرُ استهلاك.
create table if not exists poultry_daily (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  cycle_id        uuid not null references poultry_cycles(id) on delete cascade,
  on_date         date not null,
  dead            integer not null default 0 check (dead >= 0),
  culled          integer not null default 0 check (culled >= 0),
  water_l         numeric check (water_l is null or water_l >= 0),
  sample_weight_g numeric check (sample_weight_g is null or sample_weight_g >= 0),
  sample_size     integer check (sample_size is null or sample_size > 0),
  temp_c          numeric,
  humidity_pct    numeric check (humidity_pct is null or (humidity_pct >= 0 and humidity_pct <= 100)),
  note            text,
  entered_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- يومٌ واحدٌ لا يُدخَل مرّتين: التكرارُ يضاعف النفوقَ والعلفَ ويُسقط كلَّ مؤشّر.
create unique index if not exists poultry_daily_one_per_day on poultry_daily(cycle_id, on_date);
create index if not exists poultry_daily_clinic_idx on poultry_daily(clinic_id);

-- ── ٥) الاستهلاك — ما خرج من مخزن الحقل لهذه الدفعة ─────────────────────
-- بسعر الشراء لا البيع (قرار المالك ٣): لا ربحَ على ما استعمله الحقلُ لنفسه.
create table if not exists poultry_use (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  cycle_id   uuid not null references poultry_cycles(id) on delete cascade,
  on_date    date not null,
  kind       text not null check (kind in ('feed','med','service','other')),
  product_id uuid references products(id) on delete set null,
  name       text not null,
  qty        numeric not null check (qty > 0),
  unit       text,
  unit_cost  numeric not null default 0 check (unit_cost >= 0),
  line_cost  numeric not null default 0 check (line_cost >= 0),
  note       text,
  entered_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists poultry_use_cycle_idx   on poultry_use(cycle_id, on_date);
create index if not exists poultry_use_product_idx on poultry_use(product_id);
create index if not exists poultry_use_clinic_idx  on poultry_use(clinic_id, on_date desc);

-- ── ٦) المخزنُ الخاصّ بالحقل — نفسُ الجدول، عرضان ───────────────────────
-- `farm_id` فارغٌ ⇒ مخزنُ العيادة (كلُّ ما هو قائمٌ اليوم يبقى كما هو).
alter table products add column if not exists farm_id uuid references poultry_farms(id) on delete set null;
-- فهرسٌ كاملٌ لا جزئيّ: الشرطُ الجزئيّ لا يغطّي مسحَ الأبناء عند حذف الحقل
-- (fk-no-index بـdb-guard) — وهو بالضبط ما يجعل حذفَ حقلٍ يمسح جدولَ المنتجات.
create index if not exists products_farm_idx on products(farm_id);
comment on column products.farm_id is
  'حقلُ الدواجن الذي يملك هذا الصنف (0191). فارغٌ = مخزنُ العيادة — وهو الافتراضُ وكلُّ ما سبق.';

-- ── ٧) العزل ─────────────────────────────────────────────────────────────
-- شرطُ ملكيّةٍ وحدَه، ولا استعلامَ فرعيٍّ على الجدول المحميّ (درس 0159/0162:
-- سياسةٌ تقرأ جدولَها يرفضها بوستغريس بـ42P17 لكلّ طلبٍ بدور authenticated).
do $iso$
declare t text;
begin
  foreach t in array array['poultry_farms','poultry_houses','poultry_cycles','poultry_daily','poultry_use'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_rw', t);
    execute format(
      'create policy %I on %I for all to authenticated using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()))',
      t || '_rw', t);
  end loop;
end $iso$;

-- ── ٨) مجاميعُ الدفعة — القاعدةُ تجمع والمتصفّحُ يعرض (0149) ────────────
-- `security invoker`: تقرأ بعين المستدعي فتمرّ من RLS نفسِها — لا تُرى دفعةٌ
-- لعيادةٍ أخرى ولو نودي بمعرّفها.
-- حذفٌ قبل الإنشاء، بمعاملةٍ واحدة. 0193 توسّع هذه الدالّة بعمودَي فترة
-- السحب، و`create or replace` **لا تمرّ** على دالّةٍ تغيّر عمودُ خرجِها
-- (cannot change return type) — فإعادةُ تنزيل هذا الملفّ بعد 0193 كانت تُفشل
-- الموجةَ كلَّها. والترتيبُ يصحّحها: الموجةُ تنتهي بـ0193 فتعود موسَّعة.
begin;
drop function if exists poultry_cycle_stats(uuid);

create function poultry_cycle_stats(p_cycle uuid)
returns table (
  placed_count int, dead int, culled int, alive int,
  feed_kg numeric, feed_cost numeric, med_cost numeric, other_cost numeric, chick_cost numeric,
  days int, last_entry date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.placed_count,
    coalesce(d.dead, 0),
    coalesce(d.culled, 0),
    c.placed_count - coalesce(d.dead, 0) - coalesce(d.culled, 0),
    coalesce(u.feed_kg, 0),
    coalesce(u.feed_cost, 0),
    coalesce(u.med_cost, 0),
    coalesce(u.other_cost, 0),
    round(coalesce(c.chick_unit_cost, 0) * c.placed_count, 2),
    -- عمرُ الدفعة بالأيام من تاريخ وضع الدجاج، ويتوقّف عند الإغلاق.
    greatest(0, (coalesce(c.closed_on, current_date) - c.placed_on))::int,
    d.last_entry
  from poultry_cycles c
  left join lateral (
    select sum(x.dead)::int dead, sum(x.culled)::int culled, max(x.on_date) last_entry
      from poultry_daily x where x.cycle_id = c.id
  ) d on true
  left join lateral (
    select sum(y.qty) filter (where y.kind = 'feed')        feed_kg,
           sum(y.line_cost) filter (where y.kind = 'feed')  feed_cost,
           sum(y.line_cost) filter (where y.kind = 'med')   med_cost,
           sum(y.line_cost) filter (where y.kind not in ('feed','med')) other_cost
      from poultry_use y where y.cycle_id = c.id
  ) u on true
  where c.id = p_cycle;
$$;

revoke all on function poultry_cycle_stats(uuid) from public, anon;
grant execute on function poultry_cycle_stats(uuid) to authenticated;

comment on function poultry_cycle_stats(uuid) is
  'مجاميعُ دفعةٍ واحدة (0191): الحيُّ والنفوقُ والعلفُ والكلف. invoker — تمرّ من RLS.';

commit;

-- ============================================================================
-- الماسحُ لا يصل مخزنَ الحقل.
--
-- `products` جدولٌ واحدٌ بعرضَين منذ هذه الهجرة: `farm_id is null` مخزنُ
-- العيادة، ومملوءٌ مخزنُ حقل. الواجهةُ فصلت العرضَين، لكن **الماسحَ يمرّ من
-- الخادم** (`product_by_code`) لا من القائمة — فباركودُ كيسِ علفٍ يُمسح بكاشير
-- العيادة كان يرجع المنتجَ فيُباع: بسعرٍ لم يُوضع للبيع أصلاً (صفر)، ويخصم من
-- رصيدِ دفعةٍ جارية فيكذب «كلفة الدفعة» على صاحب الحقل.
--
-- والنسخةُ هنا نسخةُ 0173 حرفاً بحرف، زِيد عليها `p.farm_id is null` **بكلّ**
-- استعلامٍ يلمس `products` — ومنها استعلامُ اختيار الصيغة: لو بقي بلا شرطٍ
-- لاختار صيغةً لا يملكها إلا صفُّ حقلٍ، فيرجع الاستعلامُ الأخير فارغاً ويقول
-- الكاشيرُ «غير موجود» عن مادةٍ **موجودةٍ بمخزن العيادة** بصيغةٍ أخرى.
-- ============================================================================
create or replace function public.product_by_code(p_code text)
returns setof products
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_norm text;
  v_vars text[];
  v_pick text;
  v_n    integer;
begin
  if p_code is null or p_code = '' then return; end if;
  v_norm := inv_norm_code(p_code);

  -- (أ) الحرفيّ — ترتيبُ 0165 حرفاً بحرف: خامٌّ للأساسيّ، ثم مطبَّعٌ له، ثم الأقدم.
  return query
    select p.* from products p
     where p.farm_id is null
       and (p.barcode = p_code
        or p.alt_codes @> array[p_code]
        or inv_norm_code(p.barcode) = v_norm
        or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                    where inv_norm_code(a) = v_norm))
     order by coalesce(p.barcode = p_code, false) desc,
              (inv_norm_code(p.barcode) = v_norm) desc,
              p.created_at asc
     limit 2;

  get diagnostics v_n = row_count;
  if v_n > 0 then return; end if;

  -- (ب) خاب الحرفيّ: صيغُ الماسح. والرمزُ المطبَّع مستثنىً — جُرِّب للتوّ.
  v_vars := array_remove(inv_code_variants(p_code), v_norm);
  if array_length(v_vars, 1) is null then return; end if;

  select t.v into v_pick
    from unnest(v_vars) with ordinality as t(v, ord)
   where exists (
     select 1 from products p
      where p.farm_id is null
        and (inv_norm_code(p.barcode) = t.v
         or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                     where inv_norm_code(a) = t.v)))
   order by t.ord
   limit 1;
  if v_pick is null then return; end if;

  return query
    select p.* from products p
     where p.farm_id is null
       and (inv_norm_code(p.barcode) = v_pick
        or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                    where inv_norm_code(a) = v_pick))
     order by (inv_norm_code(p.barcode) = v_pick) desc,
              p.created_at asc
     limit 2;
end
$function$;

comment on function public.product_by_code(text) is
  'استدعاءُ منتجٍ برمزه — حتميُّ الترتيب (خامٌّ ثم مطبَّعٌ ثم الأقدم). وعند خيبةِ '
  'الحرفيّ وحدها تُجرَّب صيغُ الماسح، **صيغةً صيغةً بترتيبها** كما تفعل '
  'rescueScan بالواجهة (0173) — لا اتحاداً عليها يبيع غيرَ ما تبيعه الشاشة. '
  'limit 2 عمداً: الصفُّ الثاني إشارةُ التباسٍ تعرضها الواجهة، لا نتيجةٌ تُباع. '
  'ومخزنُ الحقل خارجُها كلِّها (0191): كاشيرُ العيادة لا يبيع علفاً.';

revoke all on function public.product_by_code(text) from public, anon;
grant execute on function public.product_by_code(text) to authenticated, service_role;
