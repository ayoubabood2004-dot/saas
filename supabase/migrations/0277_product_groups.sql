-- ============================================================================
-- ٠٢٧٧ — المنتجاتُ المربوطة: قائمةٌ لها، وربطٌ وفكٌّ بضغطة، وسعرٌ واحدٌ للمجموعة بكتابةٍ ذرّية
--
-- طلبُ المالك (١٧/١١): «سويلي قائمة مال ربط المنتجات وبداخل هاي القائمة اشوف هاي المجموعة من المنتجات مربوطة … وخليني بسهولة
-- اكدر اختار منتجات اربطن وبسهولة افصل منتجات او منتج واحد … لمن اغير سعر واحد منهم برفع او خفض يصير للكل». وفاتورةُ الشراء:
-- «سوي ملاحظة اختيارية هل تريد ترفعه لكل المجموعة يوافق عليها الي ديشتري الفاتورة».
--
-- ── الربطُ قائمٌ منذ 0075، وما كان ينقصه ────────────────────────────────────────────────────────────────
-- `products.bulk_group` نصٌّ يجمع موادَّ أُضيفت معاً («إضافة عدة باركودات»)، ورفعُ الأسعار (0226) يعامل المجموعةَ وحدةً واحدة
-- (`nullif(btrim(bulk_group), '')`). لكن لا بابَ لربط موادَّ قائمة ولا لفكّ واحدةٍ إلا حذفُها (تعديلُ المجموعة كان «يشيل» بالحذف)،
-- وسعرُ المجموعة يُكتب عضواً عضواً من الجهاز — فشلٌ بالوسط يشقّها بسعرين، وتعديلُ سعر عضوٍ من نموذجه يشقّها بصمت.
--
-- ── أربعةُ أبواب، كلٌّ بمعاملةٍ واحدة وبقفل الصفوف بترتيب المعرّف ───────────────────────────────────────────
--   • `product_group_link(ids, group, sell, purchase, seen)`: مجموعةٌ جديدة (group فارغ، منتجان فأكثر) أو إضافةٌ لقائمة — وكلُّ
--     الأعضاء بعدها بسعر البيع (إلزاميّ) والشراء (فارغ = كلٌّ على سعره). عملةٌ واحدة (الدولارُ بأعمدته) ومخزنٌ واحد (الحقل لا يُخلط
--     بالعيادة). ومادّةٌ تُنقل من مجموعةٍ أخرى: إن بقي هناك عضوٌ واحد انفكّت (مجموعةٌ بعضوٍ واحد ليست ربطاً، وشارتُها كذبة).
--   • `product_group_unlink(group, ids)`: يفكّ ما اختير وحده؛ والباقي واحدٌ ⇒ تنفكّ كلُّها. المادّةُ تبقى بالمخزن وسعرِها — كان الفكُّ
--     الوحيد حذفاً («اختفى كأنه ما كان» بعينه).
--   • `product_group_set_price(group, sell, purchase, seen)`: السعرُ لكلّ الأعضاء أو لا شيء؛ والفارغُ لا يُمسّ.
--   • `product_group_follow(product, sell?, purchase?)`: بعد فاتورة شراءٍ غيّرت سعرَ مادّةٍ مربوطة وأقرّ المشتري «لكل المجموعة» —
--     ينسخ سعرَها الحاليّ (ما كتبته الفاتورةُ للتو) لأعضاء مجموعتها بعملتها.
-- `seen` = ما رآه الجهاز: {"<معرّف>": {"s": بيع, "p": شراء}} لكلّ عضوٍ بعد الكتابة — **المجموعةُ كما هي** (عضوٌ أُضيف أو فُكّ من
-- جهازٍ آخر ⇒ group_changed) **والأسعارُ كما هي** (رفعٌ أو تعديلٌ بعد الفتح ⇒ price_moved). لا يُكتب إلا ما رآه المدير (درسُ 0226).
--
-- ── ما لا يُمسّ ──────────────────────────────────────────────────────────────────────────────────────
-- سعرُ المفرد والكراتين (أسعارٌ مشتقّةٌ لكلّ مادّة بعددها)، والمتوسّط (`avg_cost` يكتبه الخادم من الشراء)، ورفعُ الأسعار وإرجاعُه
-- (تعديلٌ باليد يبقى عند الإرجاع، 0226). والسجلُّ: محفّزُ التدقيق على products (0018) يكتب كلَّ عضوٍ تغيّر بفاعله.
-- الصلاحيةُ صلاحيةُ الكتابة بالمخزن (products_write، 0051): المدير والطبيب؛ والمصوّرُ يرفضه الخطّاف قبلها (0222).
--
-- إضافيّةٌ (دوالُّ جديدة وحدها) وتُعاد بلا أثرٍ ثانٍ. تُطبَّق **قبل الواجهة** (الواجهةُ تسأل product_groups_ready فتُخفي الأبواب؛
-- والقديمةُ لا تناديها). تراجع: drop function للثماني (الأبوابُ الأربعة وproduct_groups_ready و_pgrp_gate و_pgrp_price_ok و_pgrp_seen_ok) — والروابطُ القائمة
-- تبقى بعمودها.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) البوّابةُ والتحقّق ───────────────────────────────────────────────────────────────────────────────
create or replace function public._pgrp_gate() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(auth_role(), '') not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using errcode = '42501', hint = 'ربط المنتجات وأسعار المجموعة للمدير والطبيب.';
  end if;
  return v_clinic;
end $$;
revoke all on function public._pgrp_gate() from public, anon, authenticated;

create or replace function public._pgrp_price_ok(p numeric) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p is not null and (p < 0 or p >= 10000000000) then
    raise exception 'bad_price' using errcode = 'P0001', hint = 'السعر لازم رقم صفر أو أكثر.';
  end if;
end $$;
revoke all on function public._pgrp_price_ok(numeric) from public, anon, authenticated;

-- ما رآه الجهاز: المجموعةُ بأعضائها نفسِهم، وكلُّ عضوٍ بسعرَيه بعملته. تُنادى بعد قفل الصفوف.
create or replace function public._pgrp_seen_ok(p_clinic uuid, p_ids uuid[], p_seen jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  if p_seen is null or jsonb_typeof(p_seen) <> 'object' then
    raise exception 'bad_seen' using errcode = 'P0001', hint = 'الشاشة ما أرسلت الأسعار اللي شافتها — حدّث الصفحة وأعد.';
  end if;
  if (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p_seen) k)
     is distinct from (select coalesce(array_agg(x::text order by x::text), '{}') from unnest(p_ids) x) then
    raise exception 'group_changed' using errcode = 'P0001',
      hint = 'المجموعة تغيّرت من جهاز ثاني (انضاف منتج أو انفصل) — ما انحفظ شي. حدّث القائمة وأعد.';
  end if;
  for r in select p.id,
                  case when p.price_currency = 'USD' then p.sell_price_usd else p.sell_price end s,
                  case when p.price_currency = 'USD' then p.purchase_price_usd else p.purchase_price end c
             from products p where p.clinic_id = p_clinic and p.id = any(p_ids) loop
    if jsonb_typeof(p_seen -> r.id::text) is distinct from 'object'
       or public.safe_num(p_seen -> r.id::text ->> 's') is distinct from r.s
       or public.safe_num(p_seen -> r.id::text ->> 'p') is distinct from r.c then
      raise exception 'price_moved' using errcode = 'P0001',
        hint = 'سعر منتج بالمجموعة تغيّر من جهاز ثاني (مثلاً رفع أسعار) من فتحت الشاشة — ما انحفظ شي. حدّث القائمة وشوف الأسعار.';
    end if;
  end loop;
end $$;
revoke all on function public._pgrp_seen_ok(uuid, uuid[], jsonb) from public, anon, authenticated;

-- ── ٢) الربط: مجموعةٌ جديدة، أو إضافةٌ لقائمة — والكلُّ بسعرٍ واحد ──────────────────────────────────────────
create or replace function public.product_group_link(p_ids uuid[], p_group text, p_sell numeric, p_purchase numeric, p_seen jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := public._pgrp_gate();
  v_key text := nullif(btrim(p_group), '');
  v_new boolean := nullif(btrim(p_group), '') is null;
  v_sell numeric := round(p_sell, 2);
  v_buy numeric := round(p_purchase, 2);
  v_ids uuid[];
  v_all uuid[];
  v_old text[];
  v_cur text[];
  v_farms int;
  v_added int;
  v_dis int := 0;
  g text;
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'nothing_to_link' using errcode = 'P0001', hint = 'اختر منتج واحد على الأقل.';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'too_many' using errcode = 'P0001', hint = 'أكثر من ٢٠٠ منتج بربطة وحدة — قسّمها.';
  end if;
  if v_sell is null then
    raise exception 'price_required' using errcode = 'P0001', hint = 'اكتب سعر البيع الموحّد للمجموعة.';
  end if;
  perform public._pgrp_price_ok(v_sell);
  perform public._pgrp_price_ok(v_buy);
  -- المجموعاتُ القديمة لما يُنقل (تُقرأ قبل القفل وتُعدّ بعده) — ثمّ قفلٌ واحدٌ بترتيب المعرّف لكلّ صفٍّ يُمسّ.
  select coalesce(array_agg(distinct nullif(btrim(bulk_group), '')), '{}') into v_old
    from products where clinic_id = v_clinic and id = any(v_ids) and nullif(btrim(bulk_group), '') is not null
     and nullif(btrim(bulk_group), '') is distinct from v_key;
  perform 1 from products
   where clinic_id = v_clinic
     and (id = any(v_ids) or nullif(btrim(bulk_group), '') = v_key or nullif(btrim(bulk_group), '') = any(v_old))
   order by id for update;
  -- ومجموعةٌ قديمة تبدّلت بين القراءة والقفل (جهازٌ آخر نقل المادّة) تُقفل الآن وتُعدّ كغيرها.
  select coalesce(array_agg(distinct nullif(btrim(bulk_group), '')), '{}') into v_old
    from products where clinic_id = v_clinic and id = any(v_ids) and nullif(btrim(bulk_group), '') is not null
     and nullif(btrim(bulk_group), '') is distinct from v_key;
  perform 1 from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = any(v_old) order by id for update;
  if (select count(*) from products where clinic_id = v_clinic and id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'product_missing' using errcode = 'P0001',
      hint = 'منتج من اللي اخترتهم ما عاد موجود (انحذف أو اندمج) — حدّث القائمة.';
  end if;
  if v_new then
    v_all := v_ids;
  else
    if not exists (select 1 from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key) then
      raise exception 'group_missing' using errcode = 'P0001',
        hint = 'المجموعة ما عادت موجودة (انفكّت من جهاز ثاني) — حدّث القائمة.';
    end if;
    select coalesce(array_agg(id order by id), '{}') into v_all from products
     where clinic_id = v_clinic and (id = any(v_ids) or nullif(btrim(bulk_group), '') = v_key);
  end if;
  if cardinality(v_all) < 2 then
    raise exception 'group_needs_two' using errcode = 'P0001', hint = 'الربط يحتاج منتجين على الأقل.';
  end if;
  select array_agg(distinct price_currency), count(distinct coalesce(farm_id::text, '-'))
    into v_cur, v_farms from products where clinic_id = v_clinic and id = any(v_all);
  if cardinality(v_cur) > 1 then
    raise exception 'group_mixed' using errcode = 'P0001',
      hint = 'منتجات بالدولار ومنتجات بالدينار — سعر واحد ما يصير. اربط كل عملة وحدها.';
  end if;
  if v_farms > 1 then
    raise exception 'group_farm' using errcode = 'P0001', hint = 'مواد مخزن الحقل ما تنربط بمواد العيادة.';
  end if;
  perform public._pgrp_seen_ok(v_clinic, v_all, p_seen);
  if v_new then v_key := 'grp_' || replace(gen_random_uuid()::text, '-', ''); end if;
  select count(*) into v_added from products
   where clinic_id = v_clinic and id = any(v_ids) and nullif(btrim(bulk_group), '') is distinct from v_key;
  if v_cur[1] = 'USD' then
    update products set bulk_group = v_key, sell_price_usd = v_sell, purchase_price_usd = coalesce(v_buy, purchase_price_usd)
     where clinic_id = v_clinic and id = any(v_all)
       and (bulk_group is distinct from v_key or sell_price_usd is distinct from v_sell
            or (v_buy is not null and purchase_price_usd is distinct from v_buy));
  else
    update products set bulk_group = v_key, sell_price = v_sell, purchase_price = coalesce(v_buy, purchase_price)
     where clinic_id = v_clinic and id = any(v_all)
       and (bulk_group is distinct from v_key or sell_price is distinct from v_sell
            or (v_buy is not null and purchase_price is distinct from v_buy));
  end if;
  -- ما بقي بمجموعته القديمة عضواً واحداً: ليست ربطاً بعدها.
  foreach g in array v_old loop
    if (select count(*) from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = g) = 1 then
      update products set bulk_group = null where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = g;
      v_dis := v_dis + 1;
    end if;
  end loop;
  return jsonb_build_object('group', v_key, 'n', cardinality(v_all), 'added', v_added, 'dissolved', v_dis, 'currency', v_cur[1]);
end $$;
revoke all on function public.product_group_link(uuid[], text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.product_group_link(uuid[], text, numeric, numeric, jsonb) to authenticated;

-- ── ٣) الفكّ: ما اختير وحده، والمادّةُ تبقى بمخزنها وسعرها ────────────────────────────────────────────────
create or replace function public.product_group_unlink(p_group text, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := public._pgrp_gate();
  v_key text := nullif(btrim(p_group), '');
  v_ids uuid[];
  v_left int;
  v_dis boolean := false;
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if v_key is null or cardinality(v_ids) = 0 then
    raise exception 'nothing_to_unlink' using errcode = 'P0001', hint = 'اختر المنتج اللي تريد تفصله.';
  end if;
  perform 1 from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key order by id for update;
  if (select count(*) from products where clinic_id = v_clinic and id = any(v_ids) and nullif(btrim(bulk_group), '') = v_key)
     <> cardinality(v_ids) then
    raise exception 'group_changed' using errcode = 'P0001',
      hint = 'المجموعة تغيّرت من جهاز ثاني (المنتج انفصل أو انحذف) — حدّث القائمة.';
  end if;
  update products set bulk_group = null where clinic_id = v_clinic and id = any(v_ids);
  select count(*) into v_left from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key;
  if v_left = 1 then
    update products set bulk_group = null where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key;
    v_left := 0;
    v_dis := true;
  end if;
  return jsonb_build_object('group', v_key, 'unlinked', cardinality(v_ids), 'left', v_left, 'dissolved', v_dis or v_left = 0);
end $$;
revoke all on function public.product_group_unlink(text, uuid[]) from public, anon;
grant execute on function public.product_group_unlink(text, uuid[]) to authenticated;

-- ── ٤) سعرُ المجموعة: لكلّ الأعضاء أو لا شيء ──────────────────────────────────────────────────────────
create or replace function public.product_group_set_price(p_group text, p_sell numeric, p_purchase numeric, p_seen jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := public._pgrp_gate();
  v_key text := nullif(btrim(p_group), '');
  v_sell numeric := round(p_sell, 2);
  v_buy numeric := round(p_purchase, 2);
  v_ids uuid[];
  v_cur text[];
  v_n int;
begin
  if v_key is null then
    raise exception 'group_missing' using errcode = 'P0001', hint = 'المجموعة ما عادت موجودة — حدّث القائمة.';
  end if;
  if v_sell is null and v_buy is null then
    raise exception 'nothing_to_set' using errcode = 'P0001', hint = 'ما تغيّر سعر.';
  end if;
  perform public._pgrp_price_ok(v_sell);
  perform public._pgrp_price_ok(v_buy);
  perform 1 from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key order by id for update;
  select coalesce(array_agg(id order by id), '{}'), array_agg(distinct price_currency) into v_ids, v_cur
    from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key;
  if cardinality(v_ids) < 2 then
    raise exception 'group_missing' using errcode = 'P0001',
      hint = 'المجموعة ما عادت موجودة (انفكّت أو انحذفت منتجاتها) — حدّث القائمة.';
  end if;
  if cardinality(v_cur) > 1 then
    raise exception 'group_mixed' using errcode = 'P0001',
      hint = 'بالمجموعة منتجات بالدولار ومنتجات بالدينار — سعر واحد ما يصير. افصل اللي عملته غير.';
  end if;
  perform public._pgrp_seen_ok(v_clinic, v_ids, p_seen);
  if v_cur[1] = 'USD' then
    update products set sell_price_usd = coalesce(v_sell, sell_price_usd), purchase_price_usd = coalesce(v_buy, purchase_price_usd)
     where clinic_id = v_clinic and id = any(v_ids)
       and ((v_sell is not null and sell_price_usd is distinct from v_sell) or (v_buy is not null and purchase_price_usd is distinct from v_buy));
  else
    update products set sell_price = coalesce(v_sell, sell_price), purchase_price = coalesce(v_buy, purchase_price)
     where clinic_id = v_clinic and id = any(v_ids)
       and ((v_sell is not null and sell_price is distinct from v_sell) or (v_buy is not null and purchase_price is distinct from v_buy));
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('group', v_key, 'n', cardinality(v_ids), 'changed', v_n, 'currency', v_cur[1]);
end $$;
revoke all on function public.product_group_set_price(text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.product_group_set_price(text, numeric, numeric, jsonb) to authenticated;

-- ── ٥) بعد فاتورة الشراء: سعرُ المادّة كما كتبته الفاتورة ← لأعضاء مجموعتها (بإقرار المشتري) ──────────────────────
create or replace function public.product_group_follow(p_product uuid, p_sell boolean, p_purchase boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := public._pgrp_gate();
  v products;
  v_key text;
  v_n int;
  v_total int;
  v_skip int;
begin
  if not coalesce(p_sell, false) and not coalesce(p_purchase, false) then
    raise exception 'nothing_to_set' using errcode = 'P0001', hint = 'ما تغيّر سعر.';
  end if;
  select * into v from products where clinic_id = v_clinic and id = p_product;
  if v.id is null then
    raise exception 'product_missing' using errcode = 'P0001', hint = 'المادّة ما عادت موجودة — حدّث القائمة.';
  end if;
  v_key := nullif(btrim(v.bulk_group), '');
  if v_key is null then
    return jsonb_build_object('group', null, 'n', 0, 'updated', 0, 'skipped', 0);
  end if;
  perform 1 from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key order by id for update;
  select * into v from products where clinic_id = v_clinic and id = p_product;   -- بعد القفل: السعرُ الذي سيُنسخ
  if nullif(btrim(v.bulk_group), '') is distinct from v_key then
    raise exception 'group_changed' using errcode = 'P0001', hint = 'المادّة انفصلت عن مجموعتها من جهاز ثاني — حدّث القائمة.';
  end if;
  if v.price_currency = 'USD' then
    update products m set sell_price_usd = case when p_sell then v.sell_price_usd else m.sell_price_usd end,
                          purchase_price_usd = case when p_purchase then v.purchase_price_usd else m.purchase_price_usd end
     where m.clinic_id = v_clinic and nullif(btrim(m.bulk_group), '') = v_key and m.id <> v.id and m.price_currency = 'USD'
       and ((p_sell and m.sell_price_usd is distinct from v.sell_price_usd)
            or (p_purchase and m.purchase_price_usd is distinct from v.purchase_price_usd));
  else
    update products m set sell_price = case when p_sell then v.sell_price else m.sell_price end,
                          purchase_price = case when p_purchase then v.purchase_price else m.purchase_price end
     where m.clinic_id = v_clinic and nullif(btrim(m.bulk_group), '') = v_key and m.id <> v.id and m.price_currency = 'IQD'
       and ((p_sell and m.sell_price is distinct from v.sell_price)
            or (p_purchase and m.purchase_price is distinct from v.purchase_price));
  end if;
  get diagnostics v_n = row_count;
  select count(*), count(*) filter (where price_currency is distinct from v.price_currency) into v_total, v_skip
    from products where clinic_id = v_clinic and nullif(btrim(bulk_group), '') = v_key;
  return jsonb_build_object('group', v_key, 'n', v_total, 'updated', v_n, 'skipped', v_skip);
end $$;
revoke all on function public.product_group_follow(uuid, boolean, boolean) from public, anon;
grant execute on function public.product_group_follow(uuid, boolean, boolean) to authenticated;

-- ── ٦) سؤالُ الواجهة: الأبوابُ الأربعة موجودة ─────────────────────────────────────────────────────────
create or replace function public.product_groups_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select to_regprocedure('public.product_group_link(uuid[],text,numeric,numeric,jsonb)') is not null
     and to_regprocedure('public.product_group_unlink(text,uuid[])') is not null
     and to_regprocedure('public.product_group_set_price(text,numeric,numeric,jsonb)') is not null
     and to_regprocedure('public.product_group_follow(uuid,boolean,boolean)') is not null
$$;
revoke all on function public.product_groups_ready() from public, anon;
grant execute on function public.product_groups_ready() to authenticated;
