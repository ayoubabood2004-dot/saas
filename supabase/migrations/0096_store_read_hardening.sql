-- ============================================================================
-- 0096 · تحصين قراءات الستور العام
--
-- المشكلة: store_catalog كانت ترجع حتى ٥٠٠ منتج بطلب واحد، متاحة للمجهولين،
-- بلا صفحات وبلا أي حد للمعدل. حدود التدفق موجودة على «إنشاء الطلب» فقط —
-- فأي حلقة على الرابط تسحب الكاتلوج كاملاً مراراً على حساب الـegress.
--
-- الإصلاح:
--   1. صفحات: p_limit (سقف ١٠٠، افتراضي ٦٠) + p_offset. النداء القديم
--      بوسيطة واحدة يبقى شغالاً عبر القيم الافتراضية — لا كسر للعملاء المنشورين.
--   2. حد معدل لطيف بالـIP: ٣٠٠ طلب كاتلوج بالدقيقة لكل IP. السقف عالٍ عمداً —
--      شبكات الموبايل العراقية خلف CGNAT فآلاف الزبائن الشرعيين يتشاركون IP
--      واحداً؛ الهدف قطع السحب الآلي المستمر، لا معاقبة زبائن حقيقيين.
--      عند التجاوز نرجع نتيجة فارغة (تدهور هادئ) بدل خطأ.
-- ============================================================================

-- عدّاد القراءة: صف لكل (IP، دقيقة). محدود الحجم ذاتياً بالتنظيف الاحتمالي أدناه.
create table if not exists store_read_hits (
  ip     text not null,
  bucket timestamptz not null,
  hits   int not null default 1,
  primary key (ip, bucket)
);
alter table store_read_hits enable row level security;
-- بلا سياسات: لا أحد يصل مباشرة — الدالة security definer تكتب بصفة المالك.

-- نسقط النسخة القديمة أولاً: إبقاؤها مع نسخة بقيم افتراضية يخلق التباساً
-- بالتحميل الزائد (نداء بوسيطة واحدة يطابق الاثنتين) فيفشل كل نداء.
drop function if exists public.store_catalog(text);

create or replace function public.store_catalog(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_ip text;
  v_hits int;
begin
  -- حد المعدل — يعتمد على ترويسة الوكيل العكسي؛ غيابها (تشغيل محلي) يعطّله بأمان.
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip <> '' then
    insert into store_read_hits as h (ip, bucket, hits)
    values (v_ip, date_trunc('minute', now()), 1)
    on conflict (ip, bucket) do update set hits = h.hits + 1
    returning h.hits into v_hits;
    if v_hits > 300 then return; end if;
    -- تنظيف احتمالي (~١٪ من الطلبات) يبقي الجدول بحدود دقائق قليلة من الصفوف.
    if random() < 0.01 then
      delete from store_read_hits where store_read_hits.bucket < now() - interval '15 minutes';
    end if;
  end if;

  return query
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  where sp.slug = lower(trim(p_slug)) and sp.enabled
  order by p.category nulls last, p.name
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.store_catalog(text, int, int) from public;
grant execute on function public.store_catalog(text, int, int) to anon, authenticated;
