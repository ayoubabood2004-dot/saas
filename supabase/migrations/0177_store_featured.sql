-- ============================================================================
-- ٠١٧٧ — «مختارات المتجر»: صفٌّ مميّز يقرّره صاحب العيادة
--
-- المرحلة ٣ من خطة المتجر (docs/store-plan.md): الستورات التي يريدها المالك
-- تفتح على «مختارات» قبل الكتلوج. علمٌ على المنتج لا جدولَ عرضٍ جديد —
-- والعيادة تعلّمه من تبويب التشكيلة بنجمة.
--
-- `store_catalog` تُسقَط ثم تُنشأ (تغييرُ returns يرفضه create or replace —
-- نفس ما وُثّق في 0174)، والفرزُ يقدّم المميَّز داخل فئته ولا يعيد ترتيب
-- الفئات: صفُّ المختارات يصنعه المتصفح من العلم، والشبكة تبقى بترتيبها
-- المألوف فلا يقفز منتجٌ من مكانه لمن اعتاد الصفحة.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0176.
-- ============================================================================

alter table products add column if not exists store_featured boolean not null default false;

comment on column products.store_featured is
  'مختارات المتجر (0177): يظهر بصفّ «مختارات» أعلى كتلوج الستور. بلا أثرٍ على البيع الداخلي.';

drop function if exists public.store_catalog(text, int, int);

create or replace function public.store_catalog(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean, image_path text, featured boolean)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_ip text;
  v_hits int;
begin
  -- حاجز 0096 حرفياً.
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
         p.image_path,
         coalesce(p.store_featured, false)
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
