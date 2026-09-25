-- ============================================================================
-- ٠٢١١ — الشراءُ يقول ماذا فعل (م٢، docs/purchase-transparency-plan.md ٢·١)
--
-- ── الجذر ───────────────────────────────────────────────────────────────
-- `record_purchase`/`update_purchase` تلمسان المخزنَ بأربع طرقٍ لا يراها أحد:
-- تطابق بالاسم حين لا يطابق الباركود، وتكتب فوق سعر البيع وتاريخ الانتهاء
-- **لكلّ الرفّ**، وتسند المادّةَ لشركة الفاتورة، وتعلّمها باركوداً. وترجع رأسَ
-- الفاتورة وحدَه — فالمتصفّحُ يحزر ما صار من لقطته هو، والنافذةُ تنطوي بصمت.
-- ماكو عقدٌ يحمل الخبر؛ هذا الجذرُ الذي يُبقي بنودَ الخطة الصامتةَ صامتة.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- ١) `purchase_effects`: صفٌّ لكلّ سطرٍ نُفِّذ — كيف لُقيت المادّة (`matched_by`:
--    id/barcode/alt_code/name) أو خُلقت، وصورتاها قبل وبعد، و`changed` = ما
--    تبدّل **عدا الرصيد** (الرصيدُ هو المطلوب؛ الباقي هو المفاجأة).
--    بعمر الفاتورة (`on delete cascade`) وخارج `audit_log` عمداً: ذاك يُكنس
--    ويُصنَّف «مخزون» فينطمر فيه.
--    `product_id` **بلا مفتاحٍ أجنبيّ** كـ`products_trash`: `restore_product` يعيد
--    المنتجَ بنفس المعرّف، و`set null` كان سيقطع الكشفَ عن مادّته للأبد عند
--    أوّل طيٍّ أو حذف.
-- ٢) `update_purchase` تكتب `op='update'` **وتُبقي** صفوفَ `record`: القصّةُ تُقرأ
--    كاملة. و«كان» فيها صورةُ المادّة قبل التعديل كلِّه (لا بعد عكس السطور
--    القديمة — ذاك سالبٌ وسطيٌّ لم يوجد)، و«صار» بعد الحصرة. ومادّةٌ شيلت من
--    الفاتورة سطرٌ بـ`outcome='removed'` وكميةٍ سالبة — نقصُ رصيدٍ يُقال.
--
-- ── الدالّتان: إضافةٌ محضة ───────────────────────────────────────────────
-- النصُّ منسوخٌ من 0205 حرفاً (والمنشورُ مطابقٌ له منطقاً — مقيسٌ من `prosrc`
-- ٢٥/٩، الفرقُ تعليقاتٌ مشالة). المضاف: `v_how` بكلّ فرعِ مطابقة، والصورةُ قبل،
-- و`returning * into v_after`، و`insert into purchase_effects` بعد كلّ سطر.
-- **ولا `exception when others then null`**: كشفٌ يبلع خطأه يرجّعنا للصمت —
-- فإن فشل الكشفُ فشل الشراءُ كلُّه ويُعاد، وهذا أهون من شراءٍ لا يُعرف أثرُه.
-- ويمنع `db-guard` (effect-blind) أيَّ تعريفٍ لاحقٍ يلمس المنتجات بلا الكشف.
--
-- تراجع: أعِد تنزيل 0205 (الجدولُ يبقى ولا يضرّ).
-- تُطبَّق بعد 0210. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

create table if not exists purchase_effects (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  purchase_id  uuid not null references purchases(id) on delete cascade,
  op           text not null check (op in ('record','update')),
  line_no      int  not null,
  product_id   uuid,                                   -- بلا مفتاح: انظر الرأس
  product_name text not null,
  barcode_in   text,
  outcome      text not null check (outcome in ('created','matched','removed')),
  matched_by   text check (matched_by in ('id','barcode','alt_code','name')),
  qty          numeric not null default 0,
  before       jsonb,
  after        jsonb,
  changed      text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists purchase_effects_clinic_idx   on purchase_effects(clinic_id, created_at desc);
create index if not exists purchase_effects_purchase_idx on purchase_effects(purchase_id, created_at, line_no);
create index if not exists purchase_effects_product_idx  on purchase_effects(product_id);
alter table purchase_effects enable row level security;
drop policy if exists purchase_effects_read on purchase_effects;
create policy purchase_effects_read on purchase_effects for select
  using (clinic_id = (select auth_clinic()));
comment on table purchase_effects is
  'ما فعلته كلُّ فاتورةِ شراءٍ بالمخزن، سطراً سطراً (0211): كيف لُقيت المادّة، وصورتاها قبل وبعد، وما تبدّل عدا الرصيد. تُقرأ بالعيادة، ولا تُكتب إلا من record_purchase/update_purchase.';

-- الصورة: الحقولُ التي تلمسها الدالّتان، والاسمُ للعرض. صفٌّ غائب ⇒ null
-- (متغيّرُ صفٍّ بـplpgsql لا يصير NULL نفسُه بل صفّاً فارغَ الحقول).
create or replace function purchase_effect_snap(p products) returns jsonb
language sql immutable set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'name', p.name, 'barcode', p.barcode, 'stock', p.stock,
    'purchase_price', p.purchase_price, 'sell_price', p.sell_price,
    'min_stock', p.min_stock, 'expiry_date', p.expiry_date, 'category', p.category,
    'company_id', p.company_id, 'section_id', p.section_id, 'pooled', p.pooled) end
$$;

-- ما تبدّل عدا الرصيد (و`pooled` صفةٌ داخلية لا خبر). مادّةٌ خُلقت: لا «قبل» ⇒ لا شيء.
create or replace function purchase_effect_changed(b jsonb, a jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(array[
    'purchase_price','sell_price','min_stock','expiry_date','category','company_id','barcode']) k
  where b is not null and a is not null and (b->k) is distinct from (a->k)
$$;

create or replace function public.update_purchase(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_purchase purchases;
  v_company  uuid;
  it         jsonb;
  old_it     record;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
  -- كلُّ منتجٍ لمسته هذه الفاتورة — قديمِها وجديدِها. الحصرةُ النهائية عليه
  -- وحدَه: لا نمرّ على مخزن العيادة كلِّه، ولا نصحّح سالباً صنعه غيرُنا.
  v_touched  uuid[] := '{}';
  -- 0211: الكشف. `v_orig` صورةُ كلِّ منتجٍ **قبل التعديل** (قبل عكس السطور القديمة)
  -- فيقول الكشفُ «كان ٥ صار ٥» لا «كان −٤٥ صار ٥». و`v_oldq` كمياتُ السطور القديمة،
  -- و`v_seen` ما رجع بالسطور الجديدة — والباقي من `v_orig` مادّةٌ **شيلت** من الفاتورة.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
  v_orig     jsonb := '{}';
  v_oldq     jsonb := '{}';
  v_seen     uuid[] := '{}';
  v_k        text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  select * into v_purchase from purchases
   where id = p_purchase and clinic_id = v_clinic
   for update;
  if not found then raise exception 'purchase not found'; end if;
  v_company := v_purchase.company_id;

  -- ── ١) اعكس أثر السطور القديمة — **بلا حصر** ──
  -- الحصرُ هنا كان يخترع بضاعةً (انظر الرأس). السالبُ الوسطيُّ مقصود، وتُغلقه
  -- الحصرةُ النهائية بعد بناء السطور الجديدة.
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
    if not (v_orig ? old_it.product_id::text) then
      select * into v_before from products where id = old_it.product_id and clinic_id = v_clinic;
      if found then v_orig := v_orig || jsonb_build_object(old_it.product_id::text, purchase_effect_snap(v_before)); end if;
    end if;
    v_oldq := v_oldq || jsonb_build_object(old_it.product_id::text,
                coalesce((v_oldq->>old_it.product_id::text)::numeric, 0) + coalesce(old_it.qty, 0));
    update products
       set stock = coalesce(stock, 0) - coalesce(old_it.qty, 0)
     where id = old_it.product_id and clinic_id = v_clinic;
    v_touched := v_touched || old_it.product_id;
  end loop;
  delete from purchase_items where purchase_id = p_purchase and clinic_id = v_clinic;

  -- ── ٢) نزّل السطور الجديدة — نفس مطابقة record_purchase حرفياً ──
  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;

    -- الأساسيُّ أو أحدُ الإضافية، والأساسيُّ يغلب (0166) — كما بـrecord_purchase.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      -- «كان» = صورتُه قبل التعديل كلِّه لأوّل سطرٍ يلمسه؛ وسطرٌ ثانٍ لنفس المادّة
      -- يرى ما تركه الأوّل (الحقيقةُ بالتسلسل).
      if v_orig ? v_pid::text and not (v_pid = any (v_seen)) then
        v_bj := v_orig->(v_pid::text);
      else
        select * into v_before from products where id = v_pid and clinic_id = v_clinic;
        if found then v_bj := purchase_effect_snap(v_before); end if;
      end if;
      update products set
        stock          = coalesce(stock, 0) + v_qty,   -- بلا حصر؛ الحصرةُ بالنهاية
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً، فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ منذ البداية. والحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; else v_touched := v_touched || v_pid; end if;
    end if;

    if v_pid is null then
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
      returning * into v_after;
      v_pid := v_after.id;
      v_touched := v_touched || v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (p_purchase, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
    v_seen := v_seen || v_pid;
  end loop;

  -- ── ٢·٥) الحصرةُ الوحيدة: على ما لمسته الفاتورةُ وحدَه ──
  -- بضاعةٌ سُحبت من الفاتورة ولم تعد تغطّي ما بيع ⇒ الرصيدُ صفرٌ لا سالب.
  update products set stock = 0
   where clinic_id = v_clinic and id = any (v_touched) and coalesce(stock, 0) < 0;

  -- 0211: «صار» يُقال بعد الحصرة لا قبلها — سالبٌ وسطيٌّ لم يوجد خارج المعاملة.
  update purchase_effects e set after = purchase_effect_snap(p)
    from products p
   where e.purchase_id = p_purchase and e.clinic_id = v_clinic and e.op = 'update'
     and e.created_at = now() and p.id = e.product_id and p.clinic_id = v_clinic
     and coalesce((e.after->>'stock')::numeric, 0) < 0;

  -- 0211: مادّةٌ كانت بالفاتورة وشيلت منها — رصيدُها نقص، ويُقال.
  for v_k in select k from jsonb_object_keys(v_orig) k where not (k::uuid = any (v_seen)) loop
    v_line := v_line + 1;
    select * into v_after from products where id = v_k::uuid and clinic_id = v_clinic;
    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_k::uuid,
            coalesce(v_after.name, v_orig->v_k->>'name', 'Item'), null,
            'removed', null, -coalesce((v_oldq->>v_k)::numeric, 0),
            v_orig->v_k, purchase_effect_snap(v_after), '{}');
  end loop;

  -- ── ٣) رأس الفاتورة: إجمالي جديد، والمدفوع الحقيقي يبقى مقصوصاً عليه ──
  v_total := round(v_total, 2);
  v_paid  := least(coalesce(nullif(p_meta->>'amount_paid','')::numeric,
                            coalesce(v_purchase.amount_paid, v_purchase.total)),
                   v_total);
  v_paid  := greatest(v_paid, 0);

  update purchases set
    total          = v_total,
    item_count     = round(v_count)::int,
    amount_paid    = v_paid,
    status         = case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end,
    reference      = coalesce(nullif(p_meta->>'reference',''), reference),
    payment_method = coalesce(nullif(p_meta->>'payment_method',''), payment_method),
    supplier_name  = case when p_meta ? 'supplier_name'  then nullif(p_meta->>'supplier_name','')  else supplier_name  end,
    supplier_phone = case when p_meta ? 'supplier_phone' then nullif(p_meta->>'supplier_phone','') else supplier_phone end,
    notes          = case when p_meta ? 'notes'          then nullif(p_meta->>'notes','')          else notes          end,
    purchased_at   = coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, purchased_at)
  where id = p_purchase and clinic_id = v_clinic
  returning * into v_purchase;

  return v_purchase;
end $function$;
comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'تعديلُ فاتورةِ شراء (0205: عكسٌ بلا حصرٍ ثمّ حصرةٌ واحدة)، وتكتب منذ 0211 كشفَ ما فعلته بـpurchase_effects (op=update) — «كان» قبل التعديل كلِّه، و«صار» بعد الحصرة، والمشالُ من الفاتورة سطرُ removed.';

create or replace function public.record_purchase(p_lines jsonb, p_meta jsonb DEFAULT '{}'::jsonb)
 returns purchases
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- 0211: الكشف — كيف لُقيت المادة، وكيف كانت، وكيف صارت.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
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
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;

    -- المطابقة بالباركود **الموحَّد**: ٥٣٩١ و5391 قطعةٌ واحدة. والرموزُ
    -- الإضافية تُقرأ معه (0166) — المنتجُ له رمزٌ واحد بالنظام وعدّةُ رموزٍ
    -- بالواقع. وعند التعدد يغلب **الأساسيّ** ثم قطعةُ الشركة نفسها ثم
    -- المصنَّفة ثم الأقدم.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    -- مطابقةُ الاسم احتياطاً: القطعة المسجّلة بلا باركود تُشترى باسمها فتُرصَّد
    -- بمكانها **وتتعلّم** الباركود الممسوح — بدل توأمٍ أعمى بـ«بدون صنف».
    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      select * into v_before from products where id = v_pid and clinic_id = v_clinic;
      if found then v_bj := purchase_effect_snap(v_before); end if;
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ (`repo.ts`) منذ البداية. الحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        -- تعلُّم الباركود: القطعة بلا باركودٍ تكسبه من أول مسحة — ولا يُستبدل
        -- باركودٌ قائم أبداً.
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; end if;
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
      returning * into v_after;
      v_pid := v_after.id;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, v_purchase.id, 'record', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
  end loop;

  return v_purchase;
end $function$;
comment on function public.record_purchase(jsonb, jsonb) is
  'تسجيلُ فاتورةِ شراء (0166، و0205 pooled)، وتكتب منذ 0211 كشفَ ما فعلته بكلّ سطرٍ بـpurchase_effects (op=record).';
