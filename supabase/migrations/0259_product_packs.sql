-- ============================================================================
-- ٠٢٥٩ — التعبئةُ متعدّدةُ المستويات، المرحلةُ الأولى: البنيةُ والحرّاس (docs/packaging-plan.md)
--
-- المادةُ تصل بكارتونٍ وعلبٍ ومغلّفات، لكلٍّ باركودُه وسعراه، والنظامُ يعرف باركوداً رئيسياً ورموزاً إضافية **بمعنى الوحدة
-- نفسها** ووحدةً فرعيةً بلا باركود — فيُدخَل الكارتونُ توأماً، أو يُضاف رمزاً إضافياً للعلبة فيُباع بسعرها وينقص علبةً. بصمت.
--
-- قراراتُ المالك (٤/١١): حتى ثلاثة مستويات؛ لكلّ مستوى باركودٌ وسعرُ شراءٍ وسعرُ بيع، والفارغُ يُحسب من الوحدة الوسطى
-- (العلبة) وهي وحدةُ الرصيد كما اليوم؛ وأكثرُ من كارتونٍ لنفس المادة؛ والمتجرُ يبقى يبيع بالقطعة.
--
-- ── المستوياتُ أعمدةٌ على المادة لا جدول ────────────────────────────────────
-- الحذفُ والاسترجاعُ (0145/0146) يصوّران الصفَّ كاملاً (`to_jsonb` ثم `jsonb_populate_record`)، والخبيئاتُ والتجريبيُّ والطابور
-- كذلك — فعمودٌ جديد يتبع المادةَ بلا سطر. و**الأعمدةُ بلا NOT NULL عمداً**: لقطةٌ بسلّة المحذوفات قبل هذه الهجرة لا تحمل
-- مفاتيحَها، و`jsonb_populate_record` يكتبها null لا افتراضيّاً — فـNOT NULL كان يُفشل استرجاعَ كلِّ ما حُذف قبل اليوم. والاسترجاعُ
-- يكتبها فارغةً (`_pkg_snapshot_free`)، فالـnull لا يبقى إلا بكتابةٍ صريحة — وهو والفارغُ سواء: «لا مستوى».
--   unit_name           اسمُ الوحدة الوسطى («علبة»، «قنينة») — null ⇒ «علبة» بالعرض.
--   sub_codes           باركوداتُ الوحدة الصغرى (المغلّف) — الوحدةُ الفرعية القائمة (has_sub_unit…) بباركود.
--   sub_purchase_price  سعرُ شراء المغلّف — null ⇒ purchase_price ÷ units_per_box.
--   packs               الكراتين: [{id, name, codes[], per (علبٌ بالكارتون، صحيح ≥ ٢), purchase_price|null, sell_price|null}]
--                       حتى أربعة. السعرُ الفارغ = العلبة × per.
--
-- ── الحرّاس ─────────────────────────────────────────────────────────────────
-- • شكلُ التعبئة بقيدٍ (`products_packaging_ok`): لا يُتجاوز من أيّ طريق (محرّرُ الجداول، استيراد). ولا كارتونَ على المجمَّعة بالحوض
--   ولا المبيعة بالوزن (رصيدُهما بغير شكل)، ولا باركودَ مغلّفٍ بلا وحدةٍ صغرى.
-- • **رمزٌ واحد لمستوىً واحد** (`products_level_codes_guard`، محفّزٌ جديد بجانب 0167 لا بدله — 0167 لا يُمسّ):
--     - داخل المادة: رمزٌ مكتوبٌ لخانتين (علبةٌ وكارتون) يُباع بسعر إحداهما بصمت ⇒ يُرفض (code_level_twin).
--     - بين الموادّ: رمزُ مغلّفٍ أو كارتونٍ **جديد** لا يساوي أيَّ رمزٍ لمادةٍ أخرى بأيّ مستوى؛ ورمزُ علبةٍ جديد (أساسيٌّ أو إضافيّ) لا يساوي
--       مغلّفَ أو كارتونَ مادةٍ أخرى (والعلبةُ مقابلَ العلبة يحرسها 0167 كما هو، بإعفاء الإضافيّ للطيّ) ⇒ barcode_taken بالمالك ومستواه.
--       فالثابتُ: رمزٌ بمستوى المغلّف أو الكارتون لا يوجد بأيّ خانةٍ أخرى بالعيادة.
--     - **ما لم يتغيّر لا يُفحص** (إعفاءُ 0167 نفسُه): وإلا سقطت فاتورةُ شراءٍ تذكر الباركودَ بلا تغيير.
--     - الطيُّ يحمل رموزَ التوأم للأصل والتوأمُ حيّ لحظةً: `merge_products` تُعلن التوأمَ بإعدادٍ محلّيٍّ للمعاملة
--       (`doctorvet.codes_from`) فلا يُعدّ تصادماً معه وحده. (لا يضبطه عميل: `set_config` غيرُ معروضٍ بـPostgREST.)
--     - invoker كـ0167: يقرأ ما يراه الكاتب. وسباقُ كاتبَين بنفس الرمز بنفس اللحظة لا يُمسك (كـ0167 للإضافيّ) — بلا فهرسٍ فريد على مصفوفة.
-- • الطيُّ (`merge_products`) يحمل الكراتينَ ورموزَ المغلّفات (كارتونٌ بنفس العدد يأخذ رموزَ أخيه، وغيرُه يُلحق)، ويرفض بصوتٍ ما لا يُحمل
--   (مغلّفٌ بلا وحدةٍ صغرى بنفس العدد بالأصل، أو كراتينُ لمادةٍ بالوزن، أو أكثرُ من أربعة)؛ والفكُّ (`restore_product`) يشيلها من الأصل؛
--   والاسترجاعُ **لا يفشل أبداً** بسبب رمزٍ أُخذ: يرجع بلاه (كنهج 0165 للإضافية).
-- • «رتّب المخزن» (`inventory_tidy_uncat`) لا يطوي توأماً له تعبئة: طيُّه هناك لا يحملها — يبقى للطيّ اليدويّ الذي يحملها.
--
-- والبيعُ والشراءُ والجردُ لا يُمسّ هنا (المراحلُ ٢–٣): رمزُ الكارتون **لا تعرفه** شاشةُ البيع بعد (product_by_code كما هي) — تقول
-- «ما ينعرف» كاليوم، لا تبيعه علبة.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- كلُّ دالّةٍ تُعاد كتابتُها بحارس انجرافٍ على بصمة شِفرتها (`_drift_assert`، 0252) — نصُّ مصدرها حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0259`
-- (scripts/redefine-fingerprint.mjs). والحرّاسُ كلُّها قبل أوّل تعريف، فالرفضُ لا يترك نصفَ هجرة ما دامت تُطبَّق طلباً واحداً
-- (SQL Editor، أو apply_migration)؛ وباليد: `psql -1 -v ON_ERROR_STOP=1`.
--
-- تُطبَّق بعد 0252–0258 **وقبل الواجهة**. إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ (والحارسُ يقبل علامتَه). تراجع:
--   drop trigger if exists products_level_codes_guard on public.products;
--   alter table public.products drop constraint if exists products_packaging_ok;
--   ثمّ أعد **تعريفَ الدالّة وحده** حرفاً من مصدره: merge_products من 0184، وrestore_product وinventory_tidy_uncat من 0253؛
--   والصلاحياتُ كما هنا. والأعمدةُ تبقى (لا يقرؤها شيءٌ قديم، ولقطاتُ السلّة تحملها).
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه من 0252، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ تعريف ─────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252–0258 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
end $$;
select public._drift_assert('public.merge_products(uuid,uuid)', 'c560ec9d7361406f301de67cb536ccd9', '-- +0259');
select public._drift_assert('public.restore_product(uuid)', 'fabdaf77e92ebcc4225d327f410833a8', '-- +0259');
select public._drift_assert('public.inventory_tidy_uncat()', 'c777e22d3c8a54b6161e14a4a2e402bd', '-- +0259');

-- ── ١) الأعمدةُ وشكلُها ───────────────────────────────────────────────────────
alter table public.products add column if not exists unit_name text;
alter table public.products add column if not exists sub_codes text[] default '{}';
alter table public.products add column if not exists sub_purchase_price numeric;
alter table public.products add column if not exists packs jsonb default '[]'::jsonb;

-- رموزُ مستوى: حتى خمسة، كلٌّ نصٌّ من ١ إلى ٦٤.
create or replace function public._pkg_codes_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(cardinality(p), 0) <= 5
     and not exists (select 1 from unnest(coalesce(p, '{}')) c where c is null or char_length(c) not between 1 and 64)
$$;
-- القيدُ يناديها بصلاحية الكاتب: سحبُها من authenticated كان يُفشل كلَّ حفظ (درسُ 0258). صِرفةٌ بلا قراءة.
revoke all on function public._pkg_codes_ok(text[]) from public, anon;
grant execute on function public._pkg_codes_ok(text[]) to authenticated;

-- سعرٌ اختياريّ: غائبٌ أو null أو رقمٌ ≥ ٠.
create or replace function public._pkg_price_ok(v jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case when v is null or jsonb_typeof(v) = 'null' then true
              when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric >= 0
              else false end
$$;
revoke all on function public._pkg_price_ok(jsonb) from public, anon;
grant execute on function public._pkg_price_ok(jsonb) to authenticated;

-- الكراتين: مصفوفةٌ حتى أربعة، كلٌّ {id, name, codes, per, purchase_price, sell_price} بقيمٍ معروفة ومعرّفاتٍ لا تتكرّر.
-- (CASE لا AND: بوستغريس لا يَعِد بترتيب AND، و`::numeric` على نصٍّ يرمي بدل أن يرجع false.)
create or replace function public._pkg_packs_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when p is null or jsonb_typeof(p) = 'null' then true
    when jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 4 then false
    else coalesce((select bool_and(case
           when jsonb_typeof(e) <> 'object' then false
           when jsonb_typeof(e->'id') is distinct from 'string' or char_length(e->>'id') not between 1 and 64 then false
           when jsonb_typeof(e->'name') is distinct from 'string' or char_length(btrim(e->>'name')) not between 1 and 20 then false
           when jsonb_typeof(e->'per') is distinct from 'number' then false
           when (e->>'per')::numeric <> trunc((e->>'per')::numeric) or (e->>'per')::numeric not between 2 and 100000 then false
           when e->'codes' is not null and jsonb_typeof(e->'codes') <> 'null' and (jsonb_typeof(e->'codes') <> 'array'
                or jsonb_array_length(e->'codes') > 5
                or exists (select 1 from jsonb_array_elements(e->'codes') c
                            where jsonb_typeof(c) <> 'string' or char_length(c #>> '{}') not between 1 and 64)) then false
           when not public._pkg_price_ok(e->'purchase_price') or not public._pkg_price_ok(e->'sell_price') then false
           else true end)
         from jsonb_array_elements(p) e), true)
     and (select count(distinct e->>'id') = count(*) from jsonb_array_elements(p) e)
  end
$$;
revoke all on function public._pkg_packs_ok(jsonb) from public, anon;
grant execute on function public._pkg_packs_ok(jsonb) to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_packaging_ok' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_packaging_ok check (
      public._pkg_packs_ok(packs)
      and public._pkg_codes_ok(sub_codes)
      and (sub_purchase_price is null or sub_purchase_price >= 0)
      and (unit_name is null or char_length(btrim(unit_name)) between 1 and 20)
      and (coalesce(jsonb_array_length(case when jsonb_typeof(packs) = 'array' then packs end), 0) = 0
           or not (coalesce(pooled, false) or coalesce(sold_by_weight, false)))
      and (coalesce(cardinality(sub_codes), 0) = 0 or (coalesce(has_sub_unit, false) and coalesce(units_per_box, 0) > 0))
    );
  end if;
end $$;

-- ── ٢) رموزُ المادة بمستوياتها ───────────────────────────────────────────────
-- كلُّ رمزٍ مطبَّعاً (inv_norm_code — مرآةُ matchCode بالواجهة) بمستواه وخانته: «box» للعلبة (الأساسيّ والإضافيّ)، «sub» للمغلّف،
-- و«pack:<id>» لكلّ كارتون. الخانةُ تفرّق كارتونين، والمستوى يكفي للمقارنة، والاسمُ للرسالة.
create or replace function public.product_level_codes(p public.products)
returns table (norm text, raw text, level text, slot text, label text)
language sql immutable set search_path = public as $$
  select inv_norm_code(c), c, 'box', 'box', coalesce(nullif(btrim(p.unit_name), ''), 'علبة')
    from unnest(array_remove(array[p.barcode], null) || coalesce(p.alt_codes, '{}')) c
   where inv_norm_code(c) <> ''
  union all
  select inv_norm_code(c), c, 'sub', 'sub', coalesce(nullif(btrim(p.sub_unit_name), ''), 'مغلّف')
    from unnest(coalesce(p.sub_codes, '{}')) c
   where inv_norm_code(c) <> ''
  union all
  select inv_norm_code(c), c, 'pack', 'pack:' || (e->>'id'), coalesce(nullif(btrim(e->>'name'), ''), 'كارتون')
    from jsonb_array_elements(case when jsonb_typeof(p.packs) = 'array' then p.packs else '[]'::jsonb end) e,
         jsonb_array_elements_text(case when jsonb_typeof(e->'codes') = 'array' then e->'codes' else '[]'::jsonb end) c
   where inv_norm_code(c) <> ''
$$;
revoke all on function public.product_level_codes(public.products) from public, anon;
grant execute on function public.product_level_codes(public.products) to authenticated;   -- المحفّزُ invoker يناديها

-- ── ٣) الحارس: رمزٌ واحد لمستوىً واحد ────────────────────────────────────────
create or replace function public.products_level_codes_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_skip  text := nullif(current_setting('doctorvet.codes_from', true), '');
  r       record;
  v_code  text;
  v_owner text;
  v_label text;
begin
  -- ما لم يتغيّر لا يُفحص (إعفاءُ 0167): فاتورةُ شراءٍ تذكر الباركودَ بلا تغيير لا تسقط بتصادمٍ قديم.
  if tg_op = 'UPDATE' and new.barcode is not distinct from old.barcode and new.alt_codes is not distinct from old.alt_codes
     and new.sub_codes is not distinct from old.sub_codes and new.packs is not distinct from old.packs then
    return new;
  end if;

  -- (أ) داخل المادة: رمزٌ مكتوبٌ لخانتين.
  select min(c.raw) into v_code
    from public.product_level_codes(new) c
   group by c.norm having count(distinct c.slot) > 1
   limit 1;
  if v_code is not null then
    raise exception 'code_level_twin'
      using errcode = 'P0001',
            hint = 'الرمز «' || v_code || '» مكتوب لمستويين بنفس المادة — كلُّ رمزٍ لمستوىً واحد (العلبة أو المغلّف أو الكارتون).';
  end if;

  -- (ب) بين الموادّ: كلُّ رمزٍ **جديد** بخانته (ما كان بخانته قبلُ لا يُعاد فحصُه).
  for r in
    select n.norm, n.level from public.product_level_codes(new) n
     where tg_op = 'INSERT'
        or not exists (select 1 from public.product_level_codes(old) o where o.norm = n.norm and o.slot = n.slot)
  loop
    if r.level = 'box' then
      -- العلبةُ مقابلَ مغلّفِ غيرها أو كارتونه وحدهما (والعلبةُ مقابلَ العلبة لـ0167). والمرشّحُ على الصفّ قبل فكّ رموزه.
      select coalesce(nullif(btrim(o.name), ''), o.barcode), oc.label into v_owner, v_label
        from products o cross join lateral public.product_level_codes(o) oc
       where o.clinic_id = new.clinic_id and o.id is distinct from new.id
         and (v_skip is null or o.id::text <> v_skip)
         and (coalesce(cardinality(o.sub_codes), 0) > 0
              or coalesce(jsonb_array_length(case when jsonb_typeof(o.packs) = 'array' then o.packs end), 0) > 0)
         and oc.level <> 'box' and oc.norm = r.norm
       order by o.created_at
       limit 1;
    else
      select coalesce(nullif(btrim(o.name), ''), o.barcode), oc.label into v_owner, v_label
        from products o cross join lateral public.product_level_codes(o) oc
       where o.clinic_id = new.clinic_id and o.id is distinct from new.id
         and (v_skip is null or o.id::text <> v_skip)
         and oc.norm = r.norm
       order by o.created_at
       limit 1;
    end if;
    if v_owner is not null then
      raise exception 'barcode_taken'
        using errcode = 'P0001',
              hint = 'هذا الباركود مستعمل عند «' || v_owner || '» (' || v_label || '). افتح المخزون وادمج المنتجَين أو غيّر رمزَ أحدهما.';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.products_level_codes_guard() from public, anon, authenticated;
drop trigger if exists products_level_codes_guard on public.products;
create trigger products_level_codes_guard
  before insert or update of barcode, alt_codes, sub_codes, packs on public.products
  for each row execute function public.products_level_codes_guard();

-- ── ٤) أدواتُ الطيّ والفكّ والاسترجاع (لا تُنادى إلا من الدوالّ أدناه) ─────────────
-- اتحادُ رموزٍ مطبَّعاً، بترتيب الأوّل ثمّ الجديد من الثاني.
create or replace function public._pkg_codes_union(a text[], b text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(x.c order by x.o), '{}')
    from (select distinct on (inv_norm_code(t.c)) t.c, t.o
            from unnest(coalesce(a, '{}') || coalesce(b, '{}')) with ordinality t(c, o)
           where t.c is not null and inv_norm_code(t.c) <> ''
           order by inv_norm_code(t.c), t.o) x
$$;
revoke all on function public._pkg_codes_union(text[], text[]) from public, anon, authenticated;

-- رموزٌ ناقصَ ما بمصفوفة jsonb (مطبَّعاً)، بترتيبها.
create or replace function public._pkg_codes_minus(a text[], rm jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(t.c order by t.o), '{}')
    from unnest(coalesce(a, '{}')) with ordinality t(c, o)
   where not exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(rm) = 'array' then rm else '[]'::jsonb end) r
                      where inv_norm_code(r) = inv_norm_code(t.c))
$$;
revoke all on function public._pkg_codes_minus(text[], jsonb) from public, anon, authenticated;

-- كراتينُ الأصل + كراتينُ التوأم: كارتونٌ بنفس العدد يضمّ رموزَ أخيه (وأسعارُ الأصل تغلب، وفارغُها يأخذ أخاه)، وغيرُه يُلحق
-- بمعرّفه (أو بمعرّفٍ جديد إن صادف معرّفاً بالأصل). volatile: المعرّفُ الجديد عشوائيّ.
create or replace function public._pkg_packs_union(a jsonb, b jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v jsonb := case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end; e jsonb; i int;
begin
  for e in select x from jsonb_array_elements(case when jsonb_typeof(b) = 'array' then b else '[]'::jsonb end) x loop
    select k.o - 1 into i from jsonb_array_elements(v) with ordinality k(x, o)
     where (k.x->>'per')::numeric = (e->>'per')::numeric order by k.o limit 1;
    if i is not null then
      v := jsonb_set(v, array[i::text], (v->i) || jsonb_build_object(
             'codes', to_jsonb(public._pkg_codes_union(
                        array(select jsonb_array_elements_text(case when jsonb_typeof(v->i->'codes') = 'array' then v->i->'codes' else '[]'::jsonb end)),
                        array(select jsonb_array_elements_text(case when jsonb_typeof(e->'codes') = 'array' then e->'codes' else '[]'::jsonb end)))),
             'purchase_price', coalesce(nullif(v->i->'purchase_price', 'null'::jsonb), e->'purchase_price', 'null'::jsonb),
             'sell_price', coalesce(nullif(v->i->'sell_price', 'null'::jsonb), e->'sell_price', 'null'::jsonb)));
    elsif exists (select 1 from jsonb_array_elements(v) x where x->>'id' = e->>'id') then
      v := v || jsonb_build_array(e || jsonb_build_object('id', gen_random_uuid()::text));
    else
      v := v || jsonb_build_array(e);
    end if;
  end loop;
  return v;
end $$;
revoke all on function public._pkg_packs_union(jsonb, jsonb) from public, anon, authenticated;

-- كراتينُ ناقصَ كراتينِ لقطة: ما بمعرّفه وعدده فيها يُشال (أُلحق بالطيّ)، وما بقي تُشال منه رموزُها (ضُمّت إليه بالطيّ).
create or replace function public._pkg_packs_minus(a jsonb, rm jsonb) returns jsonb
language sql immutable set search_path = public as $$
  with r as (select x from jsonb_array_elements(case when jsonb_typeof(rm) = 'array' then rm else '[]'::jsonb end) x),
       rc as (select coalesce(jsonb_agg(c), '[]'::jsonb) as codes
                from r, jsonb_array_elements_text(case when jsonb_typeof(r.x->'codes') = 'array' then r.x->'codes' else '[]'::jsonb end) c)
  select coalesce(jsonb_agg(
           k.x || jsonb_build_object('codes', to_jsonb(public._pkg_codes_minus(
             array(select jsonb_array_elements_text(case when jsonb_typeof(k.x->'codes') = 'array' then k.x->'codes' else '[]'::jsonb end)),
             (select codes from rc))))
           order by k.o), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) with ordinality k(x, o)
   where not exists (select 1 from r where r.x->>'id' = k.x->>'id' and (r.x->>'per')::numeric = (k.x->>'per')::numeric)
$$;
revoke all on function public._pkg_packs_minus(jsonb, jsonb) from public, anon, authenticated;

-- لقطةُ استرجاعٍ بلا رموزٍ صارت لغيرها بمستوىً آخر: الأساسيُّ والإضافيّةُ إن صارت مغلّفاً أو كارتوناً لمادةٍ أخرى (العلبةُ مقابلَ
-- العلبة تشيلها restore_product نفسُها كما كانت)، ورموزُ المغلّف والكراتين إن صارت لأحدٍ بأيّ مستوى. المادةُ ترجع بلاها أفضلَ من
-- ألّا ترجع أبداً (نهجُ 0165). ولقطةٌ قبل هذه الهجرة (بلا المفاتيح) ترجع بمستوياتٍ فارغة لا null.
create or replace function public._pkg_snapshot_free(p_row jsonb, p_clinic uuid, p_self uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare v jsonb := p_row; e jsonb; keep jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v->'sub_codes') is distinct from 'array' then v := jsonb_set(v, '{sub_codes}', '[]'::jsonb); end if;
  if jsonb_typeof(v->'packs') is distinct from 'array' then v := jsonb_set(v, '{packs}', '[]'::jsonb); end if;
  if coalesce(v->>'barcode', '') <> '' and exists (
       select 1 from products o cross join lateral public.product_level_codes(o) oc
        where o.clinic_id = p_clinic and o.id <> p_self and oc.level <> 'box' and oc.norm = inv_norm_code(v->>'barcode')) then
    v := v - 'barcode';
  end if;
  if jsonb_typeof(v->'alt_codes') = 'array' then
    v := jsonb_set(v, '{alt_codes}', coalesce((
      select jsonb_agg(a order by n) from jsonb_array_elements_text(v->'alt_codes') with ordinality t(a, n)
       where not exists (select 1 from products o cross join lateral public.product_level_codes(o) oc
                          where o.clinic_id = p_clinic and o.id <> p_self and oc.level <> 'box' and oc.norm = inv_norm_code(t.a))), '[]'::jsonb));
  end if;
  v := jsonb_set(v, '{sub_codes}', coalesce((
    select jsonb_agg(a order by n) from jsonb_array_elements_text(v->'sub_codes') with ordinality t(a, n)
     where not exists (select 1 from products o cross join lateral public.product_level_codes(o) oc
                        where o.clinic_id = p_clinic and o.id <> p_self and oc.norm = inv_norm_code(t.a))), '[]'::jsonb));
  for e in select x from jsonb_array_elements(v->'packs') x loop
    keep := keep || jsonb_build_array(e || jsonb_build_object('codes', coalesce((
      select jsonb_agg(a order by n)
        from jsonb_array_elements_text(case when jsonb_typeof(e->'codes') = 'array' then e->'codes' else '[]'::jsonb end) with ordinality t(a, n)
       where not exists (select 1 from products o cross join lateral public.product_level_codes(o) oc
                          where o.clinic_id = p_clinic and o.id <> p_self and oc.norm = inv_norm_code(t.a))), '[]'::jsonb)));
  end loop;
  return jsonb_set(v, '{packs}', keep);
end $$;
revoke all on function public._pkg_snapshot_free(jsonb, uuid, uuid) from public, anon, authenticated;

-- ── ٥) إعادةُ الكتابة — نصُّ المصدر حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────────────

-- ── ٥أ) الطيّ — نصُّ 0184 حرفاً، ويحمل المغلّفَ والكراتين ────────────────────────────
create or replace function public.merge_products(p_keep uuid, p_drop uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_keep products;
  v_drop products;
  v_codes text[];
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
  v_sub   text[]; -- +0259
  v_packs jsonb; -- +0259
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;
  if p_keep is null or p_drop is null then raise exception 'both products are required'; end if;
  if p_keep = p_drop then raise exception 'cannot merge a product into itself'; end if;

  select * into v_keep from products where id = p_keep and clinic_id = v_clinic for update;
  if v_keep.id is null then raise exception 'product to keep not found'; end if;
  select * into v_drop from products where id = p_drop and clinic_id = v_clinic for update;
  if v_drop.id is null then raise exception 'product to drop not found'; end if;
  if v_keep.pooled or v_drop.pooled then
    raise exception 'pooled products cannot be merged'; end if;
  -- 0259: ما لا يُحمل يُقال قبل أيّ كتابة: باركودُ مغلّف التوأم قطعةٌ من علبته — يُحمل لأصلٍ قطعتُه بنفس العدد وحده (لا رمزٌ -- +0259
  -- يبيع قطعةً بغير حجمها)؛ والكراتينُ لا تحملها مادةٌ بالوزن (قيدُ products_packaging_ok). -- +0259
  if coalesce(cardinality(v_drop.sub_codes), 0) > 0 -- +0259
     and not (coalesce(v_keep.has_sub_unit, false) and coalesce(v_keep.units_per_box, 0) > 0 -- +0259
              and v_keep.units_per_box = v_drop.units_per_box) then -- +0259
    raise exception 'merge_sub_codes' using errcode = 'P0001', -- +0259
      hint = 'للمادة المطويّة باركودُ مغلّف، والأصلُ بلا وحدةٍ صغرى بنفس العدد — اضبط الوحدةَ الصغرى بالأصل أوّلاً ثمّ ادمج.'; -- +0259
  end if; -- +0259
  if coalesce(jsonb_array_length(case when jsonb_typeof(v_drop.packs) = 'array' then v_drop.packs end), 0) > 0 -- +0259
     and coalesce(v_keep.sold_by_weight, false) then -- +0259
    raise exception 'merge_packs_unit' using errcode = 'P0001', -- +0259
      hint = 'للمادة المطويّة كراتين والأصلُ يُباع بالوزن — الكراتينُ لا تُحمل لمادةٍ بالوزن.'; -- +0259
  end if; -- +0259

  -- الصورة أوّلاً — بسطورها كما هي الآن، قبل أن تنتقل للأصل.
  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = p_drop;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = p_drop and qty > 0;
  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
  values (v_drop.id, v_drop.clinic_id, to_jsonb(v_drop), v_inv, v_pur, v_bar, v_sold, coalesce(v_drop.stock, 0), null, auth.uid(), p_keep, nullif(v_keep.barcode, ''))
  on conflict (id) do update
    set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
        purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
        sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
        deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;

  v_codes := coalesce(v_keep.alt_codes, '{}');
  if v_drop.barcode is not null and v_drop.barcode <> ''
     and v_drop.barcode is distinct from v_keep.barcode
     and not (v_codes @> array[v_drop.barcode]) then
    v_codes := v_codes || v_drop.barcode;
  end if;
  if v_drop.alt_codes is not null then
    select array_agg(distinct x) into v_codes
      from unnest(v_codes || v_drop.alt_codes) as x
     where x is not null and x <> '' and x is distinct from v_keep.barcode;
  end if;
  -- 0259: رموزُ المغلّف والكراتين تتبع الأصلَ كالإضافيّة — رمزٌ يضيع بالطيّ يصير «ما ينعرف» على علبةٍ بالرفّ. -- +0259
  -- والتوأمُ حيٌّ حتى آخر الدالّة وهذه رموزُه: يُعلَن لحارس المستويات فلا يُعدّ تصادماً معه وحده (محلّيٌّ للمعاملة). -- +0259
  v_sub := public._pkg_codes_union(v_keep.sub_codes, v_drop.sub_codes); -- +0259
  v_packs := public._pkg_packs_union(v_keep.packs, v_drop.packs); -- +0259
  if jsonb_array_length(v_packs) > 4 then -- +0259
    raise exception 'merge_packs_overflow' using errcode = 'P0001', -- +0259
      hint = 'المادتان معاً أكثرُ من أربعة كراتين — احذف كارتوناً من إحداهما ثمّ ادمج.'; -- +0259
  end if; -- +0259
  perform set_config('doctorvet.codes_from', p_drop::text, true); -- +0259

  update invoice_items      set product_id = p_keep where product_id = p_drop;
  update purchase_items     set product_id = p_keep where product_id = p_drop;
  update generated_barcodes set product_id = p_keep where product_id = p_drop;

    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
  update products
     set stock     = coalesce(stock, 0) + coalesce(v_drop.stock, 0),
         alt_codes = coalesce(v_codes, '{}'),
         sub_codes = v_sub, -- +0259
         packs = v_packs, -- +0259
         unit_name = coalesce(nullif(btrim(unit_name), ''), nullif(btrim(v_drop.unit_name), '')), -- +0259
         sub_purchase_price = coalesce(sub_purchase_price, case when coalesce(has_sub_unit, false) and units_per_box is not distinct from v_drop.units_per_box then v_drop.sub_purchase_price end), -- +0259
         image_path = coalesce(nullif(image_path, ''), nullif(v_drop.image_path, '')),
         store_desc = coalesce(nullif(store_desc, ''), nullif(v_drop.store_desc, '')),
         min_stock = greatest(coalesce(min_stock, 0), coalesce(v_drop.min_stock, 0)),
         expiry_date = case when expiry_date is null then v_drop.expiry_date
                            when v_drop.expiry_date is null then expiry_date
                            else greatest(expiry_date, v_drop.expiry_date) end
   where id = p_keep
   returning * into v_keep;

  delete from products where id = p_drop;
  perform set_config('doctorvet.codes_from', '', true); -- +0259
  return v_keep;
end  $function$;
revoke all on function public.merge_products(uuid, uuid) from public, anon;
grant execute on function public.merge_products(uuid, uuid) to authenticated;

-- ── ٥ب) الاسترجاعُ والفكّ — نصُّ 0253 حرفاً، والمستوياتُ تُفكّ وتُحرَّر ─────────────────────
create or replace function public.restore_product(p_id uuid)
returns public.products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_t      products_trash;
  v_p      products;
  v_keep   products;
  v_code   text;
  c        text;
  v_alts   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  select * into v_t from products_trash where id = p_id and clinic_id = v_clinic for update;
  if v_t.id is null then raise exception 'not in trash'; end if;
  if exists (select 1 from products where id = p_id) then raise exception 'product already exists'; end if;
  v_code := v_t.row->>'barcode';

  if v_t.merged_into is not null then
    select * into v_keep from products where id = v_t.merged_into and clinic_id = v_clinic for update;
    if v_keep.id is not null then
      update products
-- -0253          set stock = greatest(0, coalesce(stock, 0) - coalesce(v_t.stock, 0)),
         -- 0253: بلا أرضيّة. الأصلُ ٢ والتوأمُ ٣ وبيع ٦ ⇒ −١؛ والفكُّ: الأصلُ −٤ والتوأمُ ٣ -- +0253
         -- (المجموعُ −١ كما كان — الأرضيّةُ كانت تجعله ٣). -- +0253
         set stock = coalesce(stock, 0) - coalesce(v_t.stock, 0), -- +0253
             alt_codes = array_remove(coalesce(alt_codes, '{}'), v_code),
             barcode = case when v_t.keep_barcode is null and v_code is not null and barcode = v_code then null else barcode end
       where id = v_keep.id;
      for c in select jsonb_array_elements_text(coalesce(v_t.row->'alt_codes', '[]'::jsonb)) loop
        update products set alt_codes = array_remove(coalesce(alt_codes, '{}'), c) where id = v_keep.id;
      end loop;
      -- 0259: والفكُّ يشيل من الأصل رموزَ المغلّف والكراتين التي حملها الطيّ — وإلا بقي الرمزُ عند الأصل ورجع المطويُّ بلاه. -- +0259
      update products set sub_codes = public._pkg_codes_minus(sub_codes, v_t.row->'sub_codes'), -- +0259
                          packs = public._pkg_packs_minus(packs, v_t.row->'packs') -- +0259
       where id = v_keep.id; -- +0259
    end if;
  end if;

  if jsonb_typeof(v_t.row->'alt_codes') = 'array' then
    select coalesce(jsonb_agg(a.code), '[]'::jsonb) into v_alts
      from jsonb_array_elements_text(v_t.row->'alt_codes') as a(code)
     where not exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and o.id <> p_id
          and (inv_norm_code(o.barcode) = inv_norm_code(a.code)
               or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                           where inv_norm_code(x) = inv_norm_code(a.code))));
    v_t.row := jsonb_set(v_t.row, '{alt_codes}', v_alts);
  end if;

  -- الحارسُ يقرأ الطرفين (0167): رمزٌ صار **إضافياً** لغيره يمنع الإدراج مثلما
  -- يمنعه أساسيُّ غيره. وبلا هذا يرفض المحفّزُ الإدراجَ فتستحيل الاستعادةُ رأساً.
  if v_code is not null and exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and ( inv_norm_code(o.barcode) = inv_norm_code(v_code)
                or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                            where inv_norm_code(x) = inv_norm_code(v_code)) )) then
    v_t.row := v_t.row - 'barcode';
  end if;

  /* **لقطةٌ أيتمَها طيٌّ أو حذف** (0197): الصورةُ قد تحمل شركةً أو صنفاً لم
     يعد موجوداً — دمجُ شركاتٍ، أو حذفُ صنفٍ، أو حذفٌ من نسخةٍ قديمة. والإدراجُ
     عندها يخرق المفتاحَ الأجنبيّ (23503) فتصير الاستعادةُ **مستحيلةً للأبد**
     والعيادةُ ترى المنتجَ بتبويب المحذوفات وتضغط «استرجاع» فيرجع خطأٌ خام.
     `merge_companies` تعيد توجيهَ اللقطة بنفسها؛ وهذا شبكةُ الأمان الأخيرة
     لكلّ طريقٍ آخر — المنتجُ يرجع بلا شركةٍ أفضلَ من ألّا يرجع أبداً. */
  if (v_t.row->>'company_id') is not null
     and not exists (select 1 from companies where id = (v_t.row->>'company_id')::uuid
                                             and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{company_id}', 'null'::jsonb);
  end if;
  if (v_t.row->>'section_id') is not null
     and not exists (select 1 from company_sections where id = (v_t.row->>'section_id')::uuid
                                                    and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{section_id}', 'null'::jsonb);
  end if;

  -- 0259: رموزُ اللقطة التي صارت لغيرها بمستوىً آخر تُشال قبل الإدراج (حارسُ المستويات كان يرفضه فيستحيل الاسترجاع)، -- +0259
  -- ولقطةٌ قبل 0259 ترجع بمستوياتٍ فارغة لا null. -- +0259
  v_t.row := public._pkg_snapshot_free(v_t.row, v_t.clinic_id, p_id); -- +0259
  insert into products select * from jsonb_populate_record(null::products, v_t.row) returning * into v_p;
  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and (product_id is null or product_id = v_t.merged_into);
  delete from products_trash where id = p_id;
  return v_p;
end  $function$;
revoke all on function public.restore_product(uuid) from public, anon;
grant execute on function public.restore_product(uuid) to authenticated;

-- ── ٥ج) «رتّب المخزن» — نصُّ 0253 حرفاً، ولا يطوي ما له تعبئة ─────────────────────────
create or replace function public.inventory_tidy_uncat()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_clinic uuid := auth_clinic(); v_role text := auth_role(); dup record; v_target uuid; v_merged int := 0; v_kept int := 0;
        v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
        v_tgt_barcode text; v_codes text[];
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  for dup in select * from products where clinic_id = v_clinic and section_id is null order by created_at loop
    v_target := null;
    if coalesce(dup.barcode,'') <> '' then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and coalesce(barcode,'') <> '' and inv_norm_code(barcode) = inv_norm_code(dup.barcode) order by created_at limit 1;
    end if;
    if v_target is null and length(inv_norm_name(dup.name)) >= 2 then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and company_id is not distinct from dup.company_id and inv_norm_name(name) = inv_norm_name(dup.name) order by created_at limit 1;
    end if;
    if v_target is null then v_kept := v_kept + 1; continue; end if;
    -- 0253: الأصلُ والتوأمُ يُقفلان بالمعرّف (ترتيبُ البيع 0252 ومحفّزِ الطيّ) قبل قراءة ما يُطوى، والتوأمُ يُقرأ -- +0253
    -- من جديد: اللفّةُ قرأته من لقطتها بلا قفل، فبيعةٌ له تُثبَّت بينهما كانت تضيع (الأصلُ يأخذ رصيدَ ما قبلها -- +0253
    -- وسلّةُ المحذوفات تحفظه، فالفكُّ يرجعه كما كان). وتوأمٌ اختفى (طواه أو حذفه غيرُنا) يُتخطّى — لقطتُه كانت -- +0253
    -- تُطوى ثانيةً فيرجع رصيدُ المحذوف للأصل؛ وأصلٌ اختفى يُبقي توأمَه. وشرطُ اللفّة (بلا صنف) يُعاد على ما قُفل: -- +0253
    -- توأمٌ صنّفته شاشةٌ أخرى أو طوته لحوضٍ قبل دوره صار مادّةً بصنفها — طيُّه كان يحذفها ويضمّها لأصلٍ بصنفٍ آخر. -- +0253
    perform 1 from products where clinic_id = v_clinic and id in (dup.id, v_target) order by id for update; -- +0253
    select * into dup from products where id = dup.id and clinic_id = v_clinic; -- +0253
    if not found then continue; end if; -- +0253
    if dup.section_id is not null then v_kept := v_kept + 1; continue; end if; -- +0253
    -- 0259: توأمٌ له تعبئة (كراتين أو باركودُ مغلّف) لا يُطوى هنا: هذا الطيُّ لا يحملها فكان يمحو رموزَها — -- +0259
    -- يبقى للطيّ اليدويّ (merge_products) الذي يحملها أو يقول لماذا لا. -- +0259
    if coalesce(cardinality(dup.sub_codes), 0) > 0 -- +0259
       or coalesce(jsonb_array_length(case when jsonb_typeof(dup.packs) = 'array' then dup.packs end), 0) > 0 then -- +0259
      v_kept := v_kept + 1; continue; -- +0259
    end if; -- +0259
    if not exists (select 1 from products where id = v_target and clinic_id = v_clinic) then v_kept := v_kept + 1; continue; end if; -- +0253
    select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = dup.id;
    select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = dup.id and qty > 0;
    insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
    values (dup.id, v_clinic, to_jsonb(dup), v_inv, v_pur, v_bar, v_sold, coalesce(dup.stock, 0), null, auth.uid(), v_target,
            (select nullif(barcode, '') from products where id = v_target))
    on conflict (id) do update
      set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids, purchase_item_ids = excluded.purchase_item_ids,
          barcode_ids = excluded.barcode_ids, sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
          deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;
    -- النقلُ أوّلاً: المفاتيحُ الأجنبية `on delete set null`، فحذفُ التوأم قبل
    -- النقل يُفرّغ product_id فتضيع الروابط ولا يبقى ما يُنقَل.
    update purchase_items     set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update invoice_items      set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update generated_barcodes set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;

    /* ── الوراثةُ تُحسب **قبل** الحذف والصفُّ حيّ، وتُكتب بعده ──────────────
     * الحسابُ قبل الحذف لأن `dup` لقطةٌ بيدنا، والكتابةُ بعده لأن كتابةَ
     * الباركود والصفّان حيّان تخرق الفهرسَ الفريد (23505) فتُلغي العمليةَ
     * كلَّها — وهذا سببُ ترتيب 0167 الأصليّ، نُبقيه.
     *
     * ونفسُ منطق `merge_products` (0144) حرفاً بحرف: الأساسيُّ والإضافية
     * تلحق بالأصل، بلا فارغٍ ولا مكرَّرٍ ولا ما يساوي باركودَ الهدف. */
    select nullif(barcode, '') into v_tgt_barcode from products where id = v_target and clinic_id = v_clinic;
    select coalesce(alt_codes, '{}') into v_codes from products where id = v_target and clinic_id = v_clinic;
    if coalesce(dup.barcode, '') <> ''
       and inv_norm_code(dup.barcode) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''))
       and not exists (select 1 from unnest(v_codes) c where inv_norm_code(c) = inv_norm_code(dup.barcode)) then
      v_codes := v_codes || dup.barcode;
    end if;
    if dup.alt_codes is not null and dup.alt_codes <> '{}' then
      select coalesce(array_agg(distinct c), '{}') into v_codes
        from unnest(v_codes || dup.alt_codes) as c
       where c is not null and c <> ''
         and inv_norm_code(c) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''));
    end if;
    /* ولا يُسرق رمزٌ صار لمنتجٍ ثالث — نظيرُ فحص `attach_product_code`.
     * (الهدفُ والتوأمُ مستثنيان: الأوّل مالكٌ، والثاني على وشك الحذف.) */
    if v_codes is not null and v_codes <> '{}' then
      select coalesce(array_agg(c), '{}') into v_codes
        from unnest(v_codes) as c
       where not exists (
         select 1 from products o
          where o.clinic_id = v_clinic and o.id <> v_target and o.id <> dup.id
            and (inv_norm_code(o.barcode) = inv_norm_code(c)
                 or exists (select 1 from unnest(coalesce(o.alt_codes,'{}')) x where inv_norm_code(x) = inv_norm_code(c))));
    end if;

    delete from products where id = dup.id and clinic_id = v_clinic;
    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
-- -0253     update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
    -- 0253: رصيدُ التوأم كلُّه ولو سالباً. الحصرتان كانتا تمحوان عجزَه، ثمّ يطرحه الفكُّ (0197) فيزيد -- +0253
    -- الأصلُ بما لم يكن: ٣ + (−١) كان ٣ وفكُّه ٤، وهو ٢ وفكُّه ٣. -- +0253
    update products set stock = coalesce(stock,0) + coalesce(dup.stock,0), -- +0253
      barcode = coalesce(nullif(barcode,''), dup.barcode),
      alt_codes = coalesce(v_codes, '{}'),
      expiry_date = coalesce(expiry_date, dup.expiry_date),
      image_path = coalesce(nullif(image_path, ''), nullif(dup.image_path, '')),
      store_desc = coalesce(nullif(store_desc, ''), nullif(dup.store_desc, ''))
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end  $function$;
revoke all on function public.inventory_tidy_uncat() from public, anon;
grant execute on function public.inventory_tidy_uncat() to authenticated;
