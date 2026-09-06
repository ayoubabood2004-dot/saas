-- ============================================================================
-- ٠١٦٧ — رمزٌ واحد لمنتجٍ واحد داخل العيادة: حارسٌ بالقاعدة لا بالواجهة (G4)
--        ومعه عطلٌ قائمٌ كشفته المراجعة، وثقبٌ بحارس الاستعادة.
--
-- ── ما كان موجوداً وما ينقص ─────────────────────────────────────────────
-- الفهرسُ `products_clinic_barcode_idx` (0007) فريدٌ على **الخام**، فيمنع
-- تكرارَ الرمز حرفاً بحرف ويرجع 23505. والذي لا يمنعه ثلاثة:
--   ١. تصادمُ **التطبيع**: `٥٣٩١` مقابل `5391`، و«‏8989» بعلامةِ اتجاهٍ مقابل
--      `8989`، و`ABC` مقابل `abc`، ومسافةٌ لاصقة من لصق إكسل.
--   ٢. تصادمٌ مع **`alt_codes`** منتجٍ آخر — لا فهرسَ ولا قيدَ يراه إطلاقاً.
--   ٣. ورسالةٌ مفهومة: 23505 يعطي اسمَ فهرسٍ لاتينيّ، لا جملةً تقول لمن الرمز.
-- والواجهةُ تفحص عند الإدخال (`findByCode`)، لكن أيَّ مسارٍ خلفيّ — محرّرُ SQL،
-- محرّرُ الجداول بلوحة Supabase، استيرادُ CSV، `pg_restore` — يمرّ من فوقها.
-- فالحارسُ ينزل حيث لا يُتجاوَز.
--
-- ── المقيس قبل الكتابة (والقياسُ هو ما أجاز هذا) ────────────────────────
-- ٢٥٤٩ منتجاً بالإنتاج. توائمُ التطبيع بالأساسيّ: **صفر**. وباركودُ منتجٍ
-- يساوي رمزاً إضافياً لمنتجٍ آخر — وهي **المجموعةُ الوحيدة** التي يرفضها
-- الحارسُ جديداً على بياناتٍ قائمة: **صفر** أيضاً. فلا صفَّ قائمٌ يُمنع.
--
-- ── إعفاءٌ بلا مساومة: القيمةُ التي لم تتغيّر ───────────────────────────
-- `update ... of barcode` يُطلق المحفّز إذا **ذُكر العمود بقائمة SET**، ولو
-- كتب القيمةَ نفسها. وهذا شائعٌ بالشِفرة: تعلُّمُ الباركود بالشراء
-- (`barcode = coalesce(nullif(barcode,''), …)`) يذكره بكلّ سطرٍ لمنتجٍ قائم،
-- وفكُّ الدمج بـ0165 يذكره بفرعِ `else barcode`. فحارسٌ بلا هذا الإعفاء يرفض
-- كتابةً لا تكتب شيئاً — ويُسقط **فاتورةَ شراءٍ كاملة** بسبب تصادمٍ قديمٍ لم
-- يصنعه صاحبُ الفاتورة. الإعفاءُ هو ما يجعل الحارسَ حارسَ تغييرٍ لا حارسَ وجود.
--
-- ── ولماذا لا محفّزَ على `alt_codes` ─────────────────────────────────────
-- الكشفُ متناظر (يفحص الأساسيَّ والإضافيَّ معاً)، أما **المنعُ فعلى الأساسيّ
-- وحده**. لأن `merge_products` يضمّ رمزَ المطويّ إلى `alt_codes` الباقي
-- **قبل** أن يُحذف المطويّ — فلحظةً يحمل الرمزَ صفّان. وحارسُ تفرّدٍ على
-- `alt_codes` يرفض كلَّ دمج، والدمجُ هو **أداةُ العلاج الوحيدة** للتوائم
-- القائمة (CLAUDE.md §٣). فحارسٌ يقتل العلاج أسوأ من الداء.
--
-- ── عطلٌ قائمٌ بالإنتاج كشفته المراجعة (ليس من الخطة) ───────────────────
-- `inventory_tidy_uncat` («رتّب المخزن») تورّث باركودَ التوأم إلى الأصل ثم
-- تحذف التوأم **بعد أربعة أسطر** — فيحمل الرمزَ صفّان لحظةَ الكتابة، ويرفضه
-- الفهرسُ الفريد بـ23505. أي أن المسارَ المطابِقَ **بالاسم** يفشل اليوم كلياً،
-- ولا أحد يعرف: أساسُ الحزمة (`harness.sql`) يعرّف `products` **بلا** الفهرس
-- الفريد، وفحصُ الحزمة يؤكّد أن الكتابة **تنجح**. فحصٌ يفحص عالَماً غير عالَم
-- الإنتاج (CLAUDE.md: القالبُ يُقاس على ما تُنتجه القاعدة فعلاً).
-- والعلاجُ ترتيب: تُنقل سطورُ التوأم ثم يُحذف ثم يُورَّث رمزُه. والنقلُ قبل
-- الحذف لازم — المفاتيحُ الأجنبية `on delete set null`، فحذفٌ سابقٌ يُفرّغ
-- `product_id` فلا يبقى ما يُنقل.
--
-- ── وثقبٌ بحارس الاستعادة (0165) ────────────────────────────────────────
-- حارسُ الباركود هناك يفحص `barcode` المنتجات وحده ولا يقرأ `alt_codes`. فمنتجٌ
-- رمزُه انتقل إلى **الرموز الإضافية** لغيره ثم استُعيد: يُدرَج بالرمز فيصير
-- توأماً — واليومَ بصمت، وبعد هذا المحفّز **تستحيل استعادتُه أصلاً**. فيُوسَّع
-- الحارسُ ليقرأ الطرفين، فيُسقط الرمزَ ويُعيد المنتج (وهذا عقدُ 0145).
--
-- ولا صفَّ بياناتٍ يُمَسّ، ولا رمزَ يُكتب أو يُحذف. تُطبَّق بعد 0166.
-- التراجع: `drop trigger products_no_twin_code on products;` ثم أعِد نصَّ
-- الدالّتين من 0146 و0165.
-- ============================================================================

-- ── ١) الحارس ────────────────────────────────────────────────────────────
create or replace function public.products_no_twin_code()
returns trigger
language plpgsql
-- invoker لا definer: الحارسُ لا يحتاج صلاحيةً زائدة، ويقرأ ما يراه المُستدعي.
-- ومسارٌ مثبَّت لأنه ينادي inv_norm_code.
set search_path to 'public'
as $function$
declare
  v_code  text;
  v_owner text;
begin
  v_code := inv_norm_code(new.barcode);
  if v_code = '' then return new; end if;

  -- القيمةُ لم تتغيّر: لا تفحص. (انظر شرحَ الإعفاء بترويسة الهجرة.)
  if tg_op = 'UPDATE' and new.barcode is not distinct from old.barcode then
    return new;
  end if;

  -- الكشفُ متناظر: أساسيُّ غيرِه أو إضافيُّه. والصفُّ نفسُه مستثنى.
  select coalesce(nullif(btrim(o.name), ''), o.barcode) into v_owner
  from products o
  where o.clinic_id = new.clinic_id
    and o.id is distinct from new.id
    and ( inv_norm_code(o.barcode) = v_code
          or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) a
                      where inv_norm_code(a) = v_code) )
  order by o.created_at
  limit 1;

  if v_owner is not null then
    -- الرسالةُ تُبنى بالوصل لا بـ`%`: بوستغريس يستبدل `%` بنصّ RAISE وحده،
    -- ولا يمسّها داخل `using hint` — فتصل العيادةَ علامةٌ حرفية بلا معنى.
    raise exception 'barcode_taken'
      using errcode = 'P0001',
            hint = 'هذا الباركود مستعمل عند «' || v_owner
                   || '». افتح المخزون وادمج المنتجَين أو غيّر رمزَ أحدهما.';
  end if;

  return new;
end;
$function$;

drop trigger if exists products_no_twin_code on products;
create trigger products_no_twin_code
  before insert or update of barcode on products
  for each row execute function public.products_no_twin_code();

comment on function public.products_no_twin_code() is
  'رمزٌ واحد لمنتجٍ واحد داخل العيادة (مطبَّعاً). كشفٌ متناظر (barcode و '
  'alt_codes) ومنعٌ على barcode وحده — لأن حارسَ تفرّدٍ على alt_codes يقتل '
  'merge_products، وهو أداةُ علاج التوائم. ويُعفى ما لم يتغيّر: وإلا سقطت '
  'فواتيرُ شراءٍ بسبب تصادمٍ قديم لم يصنعه صاحبُها.';

-- ── ٢) «رتّب المخزن»: يُحذف التوأم قبل أن يُورَّث رمزُه ──────────────────
create or replace function public.inventory_tidy_uncat()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_clinic uuid := auth_clinic(); v_role text := auth_role(); dup record; v_target uuid; v_merged int := 0; v_kept int := 0;
        v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
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
    -- ثم يُحذف التوأم، **ثم** يُورَّث رمزُه: كتابةُ الرمز والصفّان حيّان تخرق
    -- الفهرسَ الفريد (23505) فتُلغي «رتّب المخزن» كلَّها — عطلٌ قائمٌ بالإنتاج
    -- حتى هذه الهجرة، تخفيه الحزمةُ لأن أساسَها بلا الفهرس.
    delete from products where id = dup.id and clinic_id = v_clinic;
    update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
      barcode = coalesce(nullif(barcode,''), dup.barcode), expiry_date = coalesce(expiry_date, dup.expiry_date)
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $function$;

-- ── ٣) الاستعادة: حارسُ الباركود يقرأ الرموزَ الإضافية أيضاً ────────────
create or replace function public.restore_product(p_id uuid)
returns products
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
         set stock = greatest(0, coalesce(stock, 0) - coalesce(v_t.stock, 0)),
             alt_codes = array_remove(coalesce(alt_codes, '{}'), v_code),
             barcode = case when v_t.keep_barcode is null and v_code is not null and barcode = v_code then null else barcode end
       where id = v_keep.id;
      for c in select jsonb_array_elements_text(coalesce(v_t.row->'alt_codes', '[]'::jsonb)) loop
        update products set alt_codes = array_remove(coalesce(alt_codes, '{}'), c) where id = v_keep.id;
      end loop;
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

  insert into products select * from jsonb_populate_record(null::products, v_t.row) returning * into v_p;
  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and (product_id is null or product_id = v_t.merged_into);
  delete from products_trash where id = p_id;
  return v_p;
end $function$;

-- ── ٤) G11: مصيرُ attach_product_code يُعلَن بالقاعدة ────────────────────
-- لا مستدعيَ لها من الواجهة منذ أيلول ٢٠٢٦: نافذةُ «اربط الباركود بمنتج قائم»
-- أُلغيت **بقرار المالك** بعد أن ربطت باركودين أجنبيين بمنتجٍ غلط بضغطةٍ واحدة.
-- تبقى الدالّةُ لأن منطقَ فحص الملكية فيها يخدم الاستعادةَ والدمج، ولأن أداةَ
-- إدارةٍ لاحقة قد تحتاجها. **لا تُعِد نافذةَ ربطٍ بلا كلمة المالك.**
-- ومؤكَّدٌ على الإنتاج: `anon` لا ينفّذها، والمسجَّلُ ينفّذها، وهي invoker
-- فسياساتُ الصفوف تحكمها.
comment on function public.attach_product_code(uuid, text) is
  'ربطُ رمزٍ بمنتجٍ قائم. بلا مستدعٍ من الواجهة منذ أيلول ٢٠٢٦ — أُلغيت نافذةُ '
  'الربط بقرار المالك بعد ربطٍ خاطئ حقيقيّ. تبقى لمنطق فحص الملكية ولأداةِ '
  'إدارةٍ لاحقة. لا تُعِد نافذةَ ربطٍ بلا كلمته.';
