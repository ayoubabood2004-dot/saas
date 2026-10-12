-- ============================================================================
-- ٠٢٣٤ — المتجرُ يُتصفَّح بتصنيفات العيادة، والتصفيةُ بالخادم (طلبُ المالك، ١٢/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- شريطُ التصنيفات بصفحة الزائر كان يُبنى بالمتصفّح من الصفحات المحمَّلة وحدَها:
-- رقاقةٌ تُضغط فتُصفّي أربعاً وعشرين مادّةً وصلت، وما بعدها «نكمّل التشكيلة…» ولا شيء
-- يُحمَّل — قائمةٌ ناقصةٌ تُصدَّق. والكتلوجُ يرجع مئةً على الأكثر بالنداء، فالتصفيةُ
-- الصادقةُ لا تكون إلا بالخادم.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `store_front` تحمل `cats`: تصنيفاتُ العيادة الحيّةُ غيرُ المخفيّة التي فيها مادّةٌ
--   معروضةٌ واحدة على الأقل، بترتيب العيادة، مع عددها. الجسمُ نسخةُ 0183 حرفاً (مطابقٌ
--   للمنشور بالبصمة ١٢/١٠) + المفتاحُ الجديد — والواجهاتُ القديمة تتجاهله.
-- • `store_catalog_in(slug, cat, limit, offset)` دالّةٌ **جديدة**: أعضاءُ تصنيفٍ واحد
--   بترتيب العيادة، بنفس أعمدة store_catalog ونفس شرط العرض (`_store_listed`).
--   وتصنيفٌ غائبٌ أو مؤرشفٌ أو مخفيٌّ أو لعيادةٍ أخرى، أو متجرٌ مغلق ⇒ `cat_gone` —
--   **خطأٌ لا قائمةٌ فارغة ولا «الكل» بدلها**: الشاشةُ تقوله وترجع لـ«الكل».
-- • `store_catalog` **لم تُلمس**: «الكل» يبقى كما هو، والواجهاتُ القديمة تعمل عليه.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0233.
-- تراجع: drop function store_catalog_in(text, uuid, int, int); وأعد store_front من 0183.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) واجهةُ المتجر: بدنُ 0183 حرفاً + التصنيفات ─────────────────────────────
create or replace function public.store_front(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  sp store_profiles%rowtype;
  v_name text; v_logo text; v_phone text; v_fb text; v_ig text;
begin
  select * into sp from store_profiles where slug = lower(trim(p_slug)) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  -- اشتراكٌ منتهٍ: شاشةُ القبول محجوبةٌ عند العيادة، فاستقبالُ طلبٍ هنا وعدٌ
  -- لا يفي به أحد. «مغلق» أصدقُ من رفٍّ يبيع ولا أحدَ خلفه.
  if not store_clinic_active(sp.clinic_id) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  select coalesce(nullif(cp.clinic_name, ''), pr.full_name), cp.logo_url,
         pr.phone, nullif(cp.social_facebook, ''), nullif(cp.social_instagram, '')
    into v_name, v_logo, v_phone, v_fb, v_ig
  from profiles pr
  left join clinic_prefs cp on cp.clinic_id = pr.id
  where pr.id = sp.clinic_id;

  return jsonb_build_object(
    'ok', true,
    'name', coalesce(v_name, 'عيادة بيطرية'),
    'logo_url', v_logo,
    'phone', v_phone,
    'whatsapp', coalesce(nullif(sp.whatsapp, ''), v_phone),
    'facebook', v_fb,
    'instagram', v_ig,
    'bio', sp.bio,
    'delivery_fee', sp.delivery_fee,
    'min_order', sp.min_order,
    -- 0234: تصنيفاتُ العيادة بترتيبها — حيّةٌ، غيرُ مخفيّة، وفيها مادّةٌ معروضة.
    -- n = ما ترجعه store_catalog_in لهذا التصنيف بالضبط (نفسُ الربط ونفسُ الشرط).
    'cats', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'n', x.n) order by c.pos, c.id)
        from store_categories c
        cross join lateral (
          select count(*) as n
            from store_category_items m
            join products p on p.id = m.product_id and p.clinic_id = c.clinic_id
           where m.category_id = c.id and m.clinic_id = c.clinic_id
             and _store_listed(p.store_visible, p.sell_price, p.expiry_date)) x
       where c.clinic_id = sp.clinic_id and c.archived_at is null and not c.hidden and x.n > 0), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.store_front(text) from public;
grant execute on function public.store_front(text) to anon, authenticated;

-- ── ٢) أعضاءُ تصنيفٍ واحد — بترتيب العيادة ─────────────────────────────────
-- نفسُ الأعمدة ونفسُ تعبير التوفّر بـstore_catalog (0212)، والترتيبُ ترتيبُ العيادة
-- (pos ثم المعرّف) فصفحتا offset لا تتقاطعان ولا تُسقطان صفّاً. والحدُّ مئة كأختها.
create or replace function public.store_catalog_in(p_slug text, p_cat uuid, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean, image_path text, featured boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_clinic uuid;
begin
  select s.clinic_id into v_clinic from store_profiles s where s.slug = lower(trim(p_slug)) and s.enabled;
  if v_clinic is null or not store_clinic_active(v_clinic)
     or not exists (select 1 from store_categories c
                     where c.id = p_cat and c.clinic_id = v_clinic and c.archived_at is null and not c.hidden) then
    raise exception 'cat_gone' using errcode = 'P0002', hint = 'التصنيف ما عاد موجود';
  end if;
  return query
    -- أنواعٌ صريحة: `return query` يطابق نوعَ كلّ عمودٍ بنوع المُرجَع حرفاً.
    select p.id, p.name::text, p.category::text, p.subcategory::text, p.sell_price::numeric, p.store_desc::text,
           (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0),
           p.image_path::text,
           coalesce(p.store_featured, false)
      from store_category_items m
      join products p on p.id = m.product_id and p.clinic_id = v_clinic
      left join company_sections cs on cs.id = p.section_id
     where m.category_id = p_cat and m.clinic_id = v_clinic
       and _store_listed(p.store_visible, p.sell_price, p.expiry_date)
     order by m.pos, p.id
     limit least(greatest(coalesce(p_limit, 60), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.store_catalog_in(text, uuid, int, int) from public;
grant execute on function public.store_catalog_in(text, uuid, int, int) to anon, authenticated;

comment on function public.store_catalog_in(text, uuid, int, int) is
  'أعضاء تصنيف متجرٍ واحد بترتيب العيادة (0234) — نفس أعمدة store_catalog وشرطها (_store_listed). تصنيفٌ غائب/مؤرشف/مخفيّ/لعيادةٍ أخرى أو متجرٌ مغلق ⇒ cat_gone (خطأ، لا قائمة بديلة).';
