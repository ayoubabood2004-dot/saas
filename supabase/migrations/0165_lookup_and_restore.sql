-- ============================================================================
-- ٠١٦٥ — الاستدعاءُ حتميّ، والاستعادةُ لا تسرق رمزَ غيرها (G5 + G3)
--
-- ─────────────────────────── G5: `product_by_code` ──────────────────────────
--
-- ── عطلان لا واحد ────────────────────────────────────────────────────────
-- (١) **بلا ترتيب.** `limit 2` بلا `order by` يعني أن صفَّين متطابقين يرجعان
--     بترتيبٍ يقرّره المخطِّط — فنفسُ المسحة تبيع منتجاً اليوم وآخرَ غداً،
--     والعميلُ يأخذ `rows[0]`. وهذا يكسر الثابتَ الخامس بالعقد: نفسُ الرمز
--     يرجع نفسَ المنتج دائماً.
--
-- (٢) **وأكبرُ منه، ولم تذكره الخطة**: المطابقةُ هنا على الرمز **الخام**
--     (`barcode = p_code`) بلا `inv_norm_code`. فرمزٌ مخزونٌ بعلامةِ اتجاهٍ
--     خفية — الحالةُ التي أصلحتها 0164 بالطرف الآخر — **لا تلقاه هذه الدالّة
--     أبداً**. أي أن الطرفَ الخادميَّ للاستدعاء بقي على الجهل الذي رُفع عن
--     مسار الشراء. فتُصلَح معها، وإلا كانت 0164 نصفَ إصلاح.
--
-- ── الترتيب المُعلَن ─────────────────────────────────────────────────────
--   ١. تطابقٌ خامّ للأساسيّ (ما مُسح = ما خُزّن حرفياً)
--   ٢. ثم تطابقٌ مطبَّعٌ للأساسيّ (الأساسيُّ يغلب الإضافيّ)
--   ٣. ثم الأقدم إنشاءً — قاعدةٌ ثابتة لا مزاجَ مخطِّط
-- و`coalesce(... , false)` لازمة: `barcode = p_code` تكون NULL حين لا باركود،
-- و`desc` ببوستغريس يضع NULL **أوّلاً** — فكان صفٌّ بلا باركود يتصدّر تطابقاً
-- حقيقياً. مصيدةٌ صامتة تماماً.
--
-- ─────────────────────────── G3: `restore_product` ─────────────────────────
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- الاستعادةُ تُسقط `barcode` إن صار محجوزاً، ولا تمسّ `alt_codes` إطلاقاً.
-- فمنتجٌ حُذف ورمزُه الإضافيّ انتقل لغيره (بدمجٍ أو إدخالٍ جديد) ثم استُعيد:
-- الرمزُ يصير عند منتجَين، والمسحُ يبيع أحدهما **عشوائياً** — ومع ترتيب G5
-- أعلاه يبيع الأقدمَ دائماً، وهو غالباً الخطأ.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- لا نُعيد رمزاً صار لغيره، **ولا ننتزعه من مالكه الجديد** (الخط الأحمر ١:
-- هذا منعُ سرقةٍ لا حذف). والترشيحُ يجري **بعد** فكِّ الدمج لا قبله: فكُّ
-- الدمج يحرّر رموزَ المطويّ من الباقي، فلو رشّحنا قبله لأسقطنا رموزَ المنتج
-- عن نفسه.
--
-- ── ولا تغييرَ بتوقيع الدالّة ────────────────────────────────────────────
-- الخطةُ تقترح ناتجاً jsonb يسمّي المُسقَط. لكنّ الواجهةَ المنشورة تقرأ الصفَّ
-- (`p.name`، `p.barcode`)، وتبديلُ نوع الناتج يوجب `drop function` فيكسر كلَّ
-- عميلٍ منشور بين الهجرة والنشر — والقاعدةُ تسبق الواجهة دائماً (CLAUDE.md §٥).
-- والمعلومةُ لا تضيع: الواجهةُ تملك صفَّ السلّة أصلاً، فما نقص من `alt_codes`
-- الراجعة عمّا بالسلّة **هو** المُسقَط — تقارنهما وتقوله بلا عقدٍ جديد.
--
-- ولا صفَّ بياناتٍ يُمَسّ، ولا رمزَ يُحذف من مالكه. تُطبَّق بعد 0164.
-- ============================================================================

-- ── G5 ───────────────────────────────────────────────────────────────────
create or replace function public.product_by_code(p_code text)
returns setof products
language sql
stable
set search_path to 'public'
as $function$
  select * from products
   where p_code is not null and p_code <> ''
     and (
       -- الخامُّ أوّلاً: يستعمل الفهرسَ الفريد وفهرسَ GIN حين يكفي
       barcode = p_code
       or alt_codes @> array[p_code]
       -- ثم المطبَّع: يلقى ما تخفيه علامةُ اتجاهٍ أو حالةُ حرفٍ أو رقمٌ شرقيّ
       or inv_norm_code(barcode) = inv_norm_code(p_code)
       or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                   where inv_norm_code(a) = inv_norm_code(p_code))
     )
   order by coalesce(barcode = p_code, false) desc,
            (inv_norm_code(barcode) = inv_norm_code(p_code)) desc,
            created_at asc
   limit 2;
$function$;

comment on function public.product_by_code(text) is
  'استدعاءُ منتجٍ برمزه — حتميُّ الترتيب (خامٌّ ثم مطبَّعٌ ثم الأقدم) ومطبَّعُ '
  'المطابقة مثل inv_norm_code. limit 2 عمداً: الصفُّ الثاني إشارةُ التباسٍ '
  'تعرضها الواجهة، لا نتيجةٌ تُباع.';

-- ── G3 ───────────────────────────────────────────────────────────────────
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

  -- فكُّ الدمج أوّلاً: يحرّر رموزَ المطويّ من الباقي، فيصحّ الترشيحُ بعده.
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

  -- الرموزُ الإضافية: يُعاد ما بقي حرّاً، ويُترك ما صار لغيره **عند صاحبه**.
  -- المقارنةُ مطبَّعة: رمزٌ يفرق بعلامةٍ خفية أو بحالة حرفٍ هو الرمزُ نفسُه.
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

  -- والباركودُ الأساسيّ كذلك — والمقارنةُ مطبَّعةٌ الآن لا خامّة.
  if v_code is not null and exists (
       select 1 from products
        where clinic_id = v_t.clinic_id
          and inv_norm_code(barcode) = inv_norm_code(v_code)) then
    v_t.row := v_t.row - 'barcode';
  end if;

  insert into products select * from jsonb_populate_record(null::products, v_t.row) returning * into v_p;
  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and (product_id is null or product_id = v_t.merged_into);
  delete from products_trash where id = p_id;
  return v_p;
end $function$;

comment on function public.restore_product(uuid) is
  'استعادةُ منتجٍ من السلّة. لا تنتزع رمزاً صار لمنتجٍ آخر: الباركودُ يُسقَط '
  'والرموزُ الإضافيةُ تُرشَّح (مطبَّعةً)، وما نقص عمّا بصفّ السلّة هو المُسقَط '
  'تقوله الواجهة. الترشيحُ بعد فكِّ الدمج لا قبله.';
