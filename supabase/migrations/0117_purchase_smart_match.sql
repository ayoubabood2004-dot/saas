-- ============================================================================
-- doctorVet — 0117: فاتورة الشراء تُصيب مكان القطعة، ودالّةُ ترتيبٍ تُرجع الضائع.
--
-- ── العيب الذي يسدّه هذا الملف ──────────────────────────────────────────────
-- الطبيب يرتّب مخزونه: شركة ← أصنافٌ داخلها ← باركوداتٌ بكل صنف. ثم يشتري
-- فاتورةً فيجد المواد هبطت بطاقةَ «بدون صنف» — رغم أن القطعة نفسها موجودة
-- ومصنّفة. ثلاثةُ ثقوبٍ كانت تسرّبها:
--
--   ١) الباركود يُقارن حرفياً: ماسحٌ يكتب 5391 وقاعدةٌ خُزّن فيها ٥٣٩١
--      (أرقاماً عربية) لا يلتقيان — فتُخلق نسخةٌ توأم.
--   ٢) قطعةٌ قديمة سُجّلت بلا باركود: مسحُ باركودها الحقيقي لا يجد شيئاً
--      فيولد توأماً بدل أن **يتعلّم** الباركود على القطعة القائمة.
--   ٣) القطعة الجديدة فعلاً لا تُسأل عن صنفها فتهبط دائماً بلا صنف.
--
-- والتاريخ الذي تلوّث فعلاً تُصلحه inventory_tidy_uncat(): تدمج كل توأمٍ
-- «بدون صنف» بأصله المصنَّف — تجمع العدد، وتعيد توجيه سطور الشراء والبيع
-- والباركودات المولَّدة إليه، ثم تحذف التوأم. قابلة لإعادة التشغيل بأمان.
-- ============================================================================

-- ── ٠) موحِّدا المقارنة ─────────────────────────────────────────────────────
-- باركود: الفراغات تسقط والأرقام العربية-الهندية (٠-٩) تُغرَّب.
create or replace function inv_norm_code(v text) returns text
language sql immutable as $$
  select translate(regexp_replace(coalesce(v,''), '\s', '', 'g'),
                   '٠١٢٣٤٥٦٧٨٩', '0123456789');
$$;

-- اسم: حروفٌ موحّدة (أ إ آ ← ا، ة ← ه، ى ← ي)، فراغاتٌ مطوية، وأحرفٌ صغيرة.
create or replace function inv_norm_name(v text) returns text
language sql immutable as $$
  select lower(regexp_replace(
           translate(coalesce(v,''), 'أإآةى٠١٢٣٤٥٦٧٨٩', 'اااهي0123456789'),
           '\s+', ' ', 'g'));
$$;

-- ── ١) record_purchase v3 ───────────────────────────────────────────────────
create or replace function record_purchase(p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_company  uuid := nullif(p_meta->>'company_id','')::uuid;
  v_purchase purchases;
  it         jsonb;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_status   text;
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;
  end loop;

  v_paid   := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);
  v_status := case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end;

  insert into purchases (clinic_id, company_id, company_name, reference, total, item_count,
                         amount_paid, payment_method, status, supplier_name, supplier_phone,
                         notes, purchased_at, staff_id)
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'supplier_name',''), nullif(p_meta->>'supplier_phone',''),
          nullif(p_meta->>'notes',''), coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, now()),
          nullif(p_meta->>'staff_id','')::uuid)
  returning * into v_purchase;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');

    -- المطابقة بالباركود **الموحَّد**: ٥٣٩١ و5391 قطعةٌ واحدة. وعند التعدد
    -- تُفضَّل قطعةُ الشركة نفسها ثم المصنَّفة ثم الأقدم.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> ''
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    -- مطابقةُ الاسم احتياطاً: القطعة المسجّلة بلا باركود تُشترى باسمها فتُرصَّد
    -- بمكانها **وتتعلّم** الباركود الممسوح — بدل توأمٍ أعمى بـ«بدون صنف».
    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is not null then
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        -- تعلُّم الباركود: القطعة بلا باركودٍ تكسبه من أول مسحة — ولا يُستبدل
        -- باركودٌ قائم أبداً.
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic;
      if not found then v_pid := null; end if;
    end if;

    if v_pid is null then
      -- الصنف المختار للقطعة الجديدة — يُقبل فقط إن كان صنفاً حقيقياً بهذه
      -- العيادة ولهذه الشركة، وإلا سقط بصمتٍ إلى «بدون صنف».
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
      returning id into v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);
  end loop;

  return v_purchase;
end $$;

grant execute on function record_purchase(jsonb, jsonb) to authenticated;

-- ── ٢) الترتيب: كل توأمٍ «بدون صنف» يرجع لأصله ─────────────────────────────
-- لكل قطعةٍ بلا صنف: يُبحث عن أصلٍ **مصنَّفٍ** بنفس الباركود الموحَّد، وإلا
-- بنفس الاسم الموحَّد داخل الشركة نفسها. وُجد؟ يُجمع العدد على الأصل، ويكسب
-- الأصلُ الباركودَ إن كان بلا باركود، وتُعاد سطورُ الشراء والبيع والباركودات
-- المولَّدة إليه، ثم يُحذف التوأم. ما لا أصلَ له يبقى كما هو — لا حذف أعمى.
create or replace function inventory_tidy_uncat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  dup      record;
  v_target uuid;
  v_merged int := 0;
  v_kept   int := 0;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;

  for dup in
    select * from products
     where clinic_id = v_clinic and section_id is null
     order by created_at
  loop
    v_target := null;

    -- الأصل بالباركود أولاً — أقوى هوية للقطعة.
    if coalesce(dup.barcode,'') <> '' then
      select id into v_target from products
       where clinic_id = v_clinic and id <> dup.id and section_id is not null
         and coalesce(barcode,'') <> ''
         and inv_norm_code(barcode) = inv_norm_code(dup.barcode)
       order by created_at limit 1;
    end if;

    -- وإلا بالاسم داخل الشركة نفسها — خارجها الاسمُ المتشابه قد يكون قطعةً أخرى.
    if v_target is null and length(inv_norm_name(dup.name)) >= 2 then
      select id into v_target from products
       where clinic_id = v_clinic and id <> dup.id and section_id is not null
         and company_id is not distinct from dup.company_id
         and inv_norm_name(name) = inv_norm_name(dup.name)
       order by created_at limit 1;
    end if;

    if v_target is null then
      v_kept := v_kept + 1;
      continue;
    end if;

    update products set
      stock       = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
      barcode     = coalesce(nullif(barcode,''), dup.barcode),
      expiry_date = coalesce(expiry_date, dup.expiry_date)
    where id = v_target and clinic_id = v_clinic;

    -- التاريخ يتبع الأصل: قيود set null كانت ستقطع نسب السطور عند الحذف.
    update purchase_items      set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update invoice_items       set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update generated_barcodes  set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;

    delete from products where id = dup.id and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;

  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $$;

revoke all on function inventory_tidy_uncat() from public, anon;
grant execute on function inventory_tidy_uncat() to authenticated;

-- ============================================================================
-- VERIFY:
--   select inventory_tidy_uncat();   -- {"merged": n, "kept": m}
--   ثم أعد فتح الشركة: بطاقة «بدون صنف» تحمل الجديد حقاً فقط.
-- ============================================================================
