-- ============================================================================
-- ٠١٨٧ — «انشر أكثرَ ما تبيع»: رفُّ البداية استعلامٌ لا اجتهاد
--
-- ت٢ فتحت البابَ (نشرٌ جماعيٌّ بنداءٍ واحد). ويبقى السؤالُ الذي يقف عنده
-- الدكتورُ بعد أن يُفتح: **أيَّ أربعين من تسعِمئة؟** والاجتهادُ أمام تسعِمئة
-- صنفٍ هو نفسُه حاجزُ الشاشة الذي أزلناه، بشكلٍ آخر.
--
-- والمقيسُ يقول إنّ الجواب موجودٌ بالبيانات: حصّةُ أعلى ٤٠ منتجاً من إيراد
-- تسعين يوماً عند الثلاثِ الكبار = **٩٠٫٤٪ و٤٣٫٣٪ و٣٥٫٦٪**. ومن الأربعين:
-- ٤٠/٤٠ مسعَّرة، و٣٣–٣٩ رصيدُها موجب، و٣٤–٤٠ لها باركود، و**صفرٌ منشور**.
-- أي أنّ «رفَّ البداية» مجموعةٌ معرَّفةٌ باستعلامٍ واحد.
--
-- ── ثلاثةُ تعريفاتٍ تُنسَخ ولا تُخترَع ───────────────────────────────────
-- ١) **ما الذي يُعدّ بيعاً**: نفسُ `report_top_products` حرفياً — يُستثنى
--    المرتجَع (`status <> 'refunded'`)، والتاريخُ تاريخُ **الفاتورة**
--    (`i.created_at`) لا تاريخُ السطر، والكميّاتُ تُجمَع **بإشارتها** فالسطرُ
--    الراجع (كميةٌ سالبة، 0122) يخصم. تعريفٌ ثانٍ للبيع يعني رقمين للشيء
--    الواحد بشاشتين.
-- ٢) **ما الذي يُعدّ متوفّراً**: نفسُ `store_catalog` حرفياً —
--    `stock > 0 or pooled_stock > 0`. ولولا المجمَّع لسقط من الاقتراح منتجٌ
--    يعرضه المتجرُ نفسُه «متوفّراً».
-- ٣) **ما الذي يُعدّ صالحاً للنشر**: نفسُ شرط 0186 — `sell_price > 0`.
--
-- ── والصلاحيةُ صلاحيةُ المُستدعي ────────────────────────────────────────
-- `invoker` لا `definer`، تماماً كـ`report_top_products`: القراءةُ لمبيعات
-- عيادتك، وسياسةُ `invoice_items_select` مقصورةٌ على العيادة **بلا شرطِ دور**
-- فلا نقصَ صامتاً على أحد. وdefiner هنا يعني حملَ صلاحيةٍ بلا حاجةٍ لها.
--
-- > **وحدٌّ صريح: لا نشرَ تلقائيَّ بلا ضغطة.** هذه الدالّةُ **تقترح** ولا
-- > تكتب حرفاً. النشرُ يُعلن سعراً ووعداً بالعلن وهو قرارُ العيادة لا
-- > المنصّة — ودرسُ 0153 أنّ كتابةً «صحيحةً بالنيّة» تهبط بعيادةٍ لا تقصدها.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0186.
-- ============================================================================

create or replace function public.store_suggest_products(p_limit int default 40, p_days int default 90)
returns table (
  id uuid, name text, category text, sell_price numeric,
  available boolean, barcode text, image_path text,
  qty_sold numeric, revenue numeric
)
language sql
stable
set search_path = public
as $$
  with sold as (
    -- تعريفُ البيع: نسخةٌ من `report_top_products` — المرتجَعُ يُستثنى،
    -- والتاريخُ تاريخُ الفاتورة، والكميّاتُ بإشارتها فالراجعُ يخصم.
    select it.product_id,
           sum(it.qty)                   as qty,
           round(sum(it.line_total), 2)  as rev
    from invoice_items it
    join invoices i on i.id = it.invoice_id
    where i.clinic_id = auth_clinic()
      and coalesce(i.status, 'paid') <> 'refunded'
      and i.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 90))))
      and it.product_id is not null
    group by 1
  )
  select p.id, p.name, p.category::text, p.sell_price,
         -- تعريفُ التوفّر: نسخةٌ من `store_catalog` — المجمَّعُ يُحسب.
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.barcode, p.image_path,
         s.qty, s.rev
  from sold s
  join products p on p.id = s.product_id and p.clinic_id = auth_clinic()
  left join company_sections cs on cs.id = p.section_id
  where coalesce(p.sell_price, 0) > 0              -- شرطُ 0186 نفسُه
    and (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0)
    and not coalesce(p.store_visible, false)       -- المنشورُ ليس اقتراحاً
    and s.rev > 0                                  -- صافيه سالبٌ ⇒ مرتجعاتُه أكثر
  order by s.rev desc, p.name, p.id                -- `p.id` آخِراً: ترتيبٌ حاسم (0182)
  limit greatest(1, least(200, coalesce(p_limit, 40)));
$$;

revoke all on function public.store_suggest_products(int, int) from public, anon;
grant execute on function public.store_suggest_products(int, int) to authenticated;

comment on function public.store_suggest_products(int, int) is
  'يقترح رفَّ البداية: الأعلى إيراداً بتسعين يوماً، ممّا هو مسعَّرٌ ومتوفّرٌ '
  'وغيرُ منشور. **تقترح ولا تكتب** — النشرُ ضغطةُ العيادة عبر store_set_visible. '
  'تعريفُ البيع منسوخٌ من report_top_products وتعريفُ التوفّر من store_catalog: '
  'تعريفٌ ثانٍ يعني رقمين للشيء الواحد بشاشتين. invoker لا definer — نفسُ '
  'report_top_products، وسياسةُ invoice_items_select مقصورةٌ على العيادة بلا شرطِ دور.';

-- ============================================================================
-- VERIFY: select name, revenue, available from store_suggest_products(40);
--   ⇒ الأعلى إيراداً أوّلاً، بلا منشورٍ وبلا بلا-سعر.
-- ============================================================================
