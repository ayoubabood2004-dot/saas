-- ============================================================================
-- 0103 — الكتالوج المشترك (باركود ← اسم + أسعار مرجعية)
--
-- الممل الحقيقي بتأسيس عيادة جديدة هو إدخال مئة منتج يدوياً. والباركود نفسه
-- موجود عند عيادات ثانية بنفس الرمز — فبدل ما تكتبه كل عيادة من الصفر، تمسحه
-- ويجيها الاسم والأسعار المرجعية جاهزة.
--
-- ── الخصوصية: القاعدة هنا مشاركة صريحة، لا افتراضية ──────────────────────────
-- سعر الشراء سرّ تجاري (كلفة المجهّز)، فمشاركته قرار العيادة وحدها:
--   • catalog_share افتراضه FALSE — العيادة الي ما تلمسه لا تُساهم بشيء أبداً
--   • الاستفادة **لا** تتطلب المساهمة: عيادة مطفية المفتاح تقرأ الكتالوج عادي.
--     (لو ربطناهما لصار المفتاح ابتزازاً لا اختياراً)
--   • المُخرَج مجهول الهوية دائماً: لا clinic_id ولا اسم عيادة يخرج أبداً،
--     والأسعار وسائط (median) لا قيماً منسوبة
--   • contributors يرجع مع كل نتيجة حتى يعرف القارئ كم مصدراً وراء الرقم:
--     سعر من عيادة واحدة ليس «سعر السوق»، وإخفاء العدد يوهم بثقة ليست موجودة
--
-- الدوال SECURITY DEFINER لأنها تقرأ عبر العيادات (وRLS يمنع ذلك بحق) — لكنها
-- لا تعيد صفوفاً خاماً أبداً، بل تجميعاً فقط.
-- ============================================================================

-- مفتاح المساهمة — مطفأ افتراضياً.
alter table clinic_prefs add column if not exists catalog_share boolean not null default false;

-- البحث بالباركود عبر العيادات المساهِمة: بدون هذا يصير مسحاً كاملاً لجدول
-- المنتجات عند كل مسحة باركود بعيادة جديدة.
create index if not exists products_barcode_shared_idx
  on products(barcode) where barcode is not null;

-- الأصل الذي تُبنى منه كل النتائج: صفوف العيادات المساهِمة فقط.
create or replace view shared_catalog_source as
  select p.barcode, p.name, p.sell_price, p.purchase_price, p.clinic_id
  from products p
  join clinic_prefs cp on cp.clinic_id = p.clinic_id
  where cp.catalog_share = true
    and p.barcode is not null and p.barcode <> ''
    and p.name is not null and btrim(p.name) <> '';
revoke all on shared_catalog_source from public, anon, authenticated;

/** باركود واحد → أشيع اسم + وسيط السعرين + عدد المساهمين. */
create or replace function catalog_lookup(p_barcode text)
returns table (
  barcode text, name text,
  sell_price numeric, purchase_price numeric,
  contributors int, name_variants int
)
language sql
security definer
set search_path = public
stable
as $$
  select s.barcode,
         mode() within group (order by s.name)                                    as name,
         round(percentile_cont(0.5) within group (order by s.sell_price)::numeric, 2),
         round(percentile_cont(0.5) within group (order by s.purchase_price)::numeric, 2),
         count(distinct s.clinic_id)::int,
         count(distinct s.name)::int
  from shared_catalog_source s
  where s.barcode = btrim(p_barcode)
  group by s.barcode;
$$;
revoke all on function catalog_lookup(text) from public, anon;
grant execute on function catalog_lookup(text) to authenticated;

/** بحث بالاسم — للاستيراد بالجملة لمّا ما يكون الباركود بالإيد. */
create or replace function catalog_search(p_q text, p_limit int default 25)
returns table (
  barcode text, name text,
  sell_price numeric, purchase_price numeric,
  contributors int
)
language sql
security definer
set search_path = public
stable
as $$
  -- خطوتان بقصد: أولاً نلقي **الباركودات** التي طابق أحد أسمائها البحث، وبعدين
  -- نجمّع على كل صفوفها. الترشيح قبل التجميع كان يسقط الصفوف ذات التسمية
  -- المختلفة (نفس المنتج بالعربي مقابل الإنجليزي)، فيطلع «مساهم واحد» وسعر
  -- منحاز لصفٍّ واحد بينما المنتج عند عدة عيادات فعلاً.
  with hits as (
    select distinct s.barcode
    from shared_catalog_source s
    where btrim(coalesce(p_q, '')) <> ''
      and s.name ilike '%' || btrim(p_q) || '%'
  )
  select s.barcode,
         mode() within group (order by s.name)                                    as name,
         round(percentile_cont(0.5) within group (order by s.sell_price)::numeric, 2),
         round(percentile_cont(0.5) within group (order by s.purchase_price)::numeric, 2),
         count(distinct s.clinic_id)::int
  from shared_catalog_source s
  join hits h on h.barcode = s.barcode
  group by s.barcode
  -- الأكثر انتشاراً أولاً: الرمز الي عند خمس عيادات أوثق من الي عند واحدة.
  order by count(distinct s.clinic_id) desc, 2
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
revoke all on function catalog_search(text, int) from public, anon;
grant execute on function catalog_search(text, int) to authenticated;

/** حجم الكتالوج — تعرضه الإعدادات حتى تشوف العيادة قيمة المشاركة بالأرقام. */
create or replace function catalog_stats()
returns table (barcodes int, clinics int)
language sql
security definer
set search_path = public
stable
as $$
  select count(distinct s.barcode)::int, count(distinct s.clinic_id)::int
  from shared_catalog_source s;
$$;
revoke all on function catalog_stats() from public, anon;
grant execute on function catalog_stats() to authenticated;
