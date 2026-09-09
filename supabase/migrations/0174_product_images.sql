-- ============================================================================
-- ٠١٧٤ — صورة المنتج: ملفٌّ في المخزن ومسارٌ نصيٌّ في القاعدة
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- المتجر العام يعرض رمزَ فئةٍ مكان الصورة، وهو السبب الأول لهجره (القياس في
-- docs/store-plan.md: متجرٌ واحد مفعّل و١٣ منتجاً ظاهراً وطلبٌ واحد بالتاريخ).
--
-- ── القرار المعماري — درسٌ مدفوع الثمن ───────────────────────────────────
-- **الصورة لا تدخل جداول القاعدة أبداً.** شعار العيادة خُزّن base64 داخل
-- `clinic_prefs` فتضخّمت صفوف سجلّ التدقيق حتى ١٠٥ كيلوبايت للصف الواحد
-- (نُظّف يدوياً في ٩ أيلول). هنا القاعدة تحمل `image_path` نصاً قصيراً،
-- والبايتات في bucket تخديمه عبر CDN — ولا يمرّ منها شيءٌ على المدقِّق.
--
-- المسار: `<clinic_id>/<product_id>.webp` — العيادة مجلّدها الأول، وسياسة
-- الكتابة تشترط تطابقَ المجلد مع `auth_clinic()` فلا ترفع عيادةٌ فوق ملفات
-- غيرها. القراءة عامة (bucket public): كتلوج المتجر للزبائن بلا توقيع.
--
-- ── لماذا drop قبل create لدالّة الكتلوج ─────────────────────────────────
-- إضافة عمودٍ إلى `returns table` تغييرُ توقيعٍ يرفضه
-- `create or replace` بـ«cannot change return type». والإسقاط آمن هنا:
-- المستهلك الوحيد واجهة المتجر، وهي تتعامل مع غياب العمود قبل نزولها.
-- وتُسقَط النسخة القديمة وحيدة الوسيط (0095) إن بقيت — بقاؤها مع ذات الاسم
-- يجعل نداءً باسم وسيطٍ واحد ملتبساً بين توقيعين.
--
-- ── الحزمة ───────────────────────────────────────────────────────────────
-- مخطط الفحص بلا schema storage، فكلُّ ما يمسّه ملفوفٌ بحارس وجود — الهجرة
-- تُعاد بلا أثرٍ ثانٍ على الحزمة والإنتاج كليهما.
-- تُطبَّق بعد 0173.
-- ============================================================================

-- ── ١) العمود ─────────────────────────────────────────────────────────────
alter table products add column if not exists image_path text;

comment on column products.image_path is
  'مسار صورة المنتج داخل bucket «product-images» (لا بايتات هنا أبداً — 0174). فارغ = بلا صورة، والواجهة تعرض رمز الفئة.';

-- ── ٢) الـbucket وسياساته (تُتخطّى على حزمة الفحص بلا storage) ────────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true)
    on conflict (id) do update set public = true;
  end if;

  if to_regclass('storage.objects') is not null then
    -- الكتابة: العيادة داخل مجلدها وحده. القراءة عامة بحكم public فلا سياسة لها.
    drop policy if exists product_images_insert on storage.objects;
    create policy product_images_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'product-images'
                  and (storage.foldername(name))[1] = auth_clinic()::text);

    drop policy if exists product_images_update on storage.objects;
    create policy product_images_update on storage.objects
      for update to authenticated
      using (bucket_id = 'product-images'
             and (storage.foldername(name))[1] = auth_clinic()::text)
      with check (bucket_id = 'product-images'
                  and (storage.foldername(name))[1] = auth_clinic()::text);

    drop policy if exists product_images_delete on storage.objects;
    create policy product_images_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'product-images'
             and (storage.foldername(name))[1] = auth_clinic()::text);
  end if;
end $$;

-- ── ٣) كتلوج المتجر يرجع المسار ──────────────────────────────────────────
drop function if exists public.store_catalog(text);
drop function if exists public.store_catalog(text, int, int);

create or replace function public.store_catalog(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean, image_path text)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_ip text;
  v_hits int;
begin
  -- حاجز القراءة الجماعية كما في 0096 حرفياً — لا يُعاد اختراعه ولا يُرخى.
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip <> '' then
    insert into store_read_hits as h (ip, bucket, hits)
    values (v_ip, date_trunc('minute', now()), 1)
    on conflict (ip, bucket) do update set hits = h.hits + 1
    returning h.hits into v_hits;
    if v_hits > 300 then return; end if;
    if random() < 0.01 then
      delete from store_read_hits where store_read_hits.bucket < now() - interval '15 minutes';
    end if;
  end if;

  return query
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.image_path
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  where sp.slug = lower(trim(p_slug)) and sp.enabled
  order by p.category nulls last, p.name
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.store_catalog(text, int, int) from public, anon;
grant execute on function public.store_catalog(text, int, int) to anon, authenticated;
