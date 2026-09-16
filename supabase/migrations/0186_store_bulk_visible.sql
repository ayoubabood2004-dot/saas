-- ============================================================================
-- ٠١٨٦ — النشرُ الجماعيّ: نداءٌ واحد بدل أربعين، ومنتجٌ بلا سعرٍ لا يُنشَر
--
-- الجذر (مقيسٌ على الإنتاج، لا مقدَّر): شاشةُ المتجر تنشر **منتجاً واحداً**
-- بكلّ ضغطة، ثمّ تعيد تحميلَ الصفحة كاملةً — `listStoreOrders` و`listProducts`
-- و`getStoreProfile`. وحمولةُ منتجاتِ أكبر عيادةٍ حيّة **٦٩١ ك.ب JSON**
-- (٩٩٠ صفّاً)، وثانيةٍ ٦٥٤ ك.ب (٩٦٢)، وثالثةٍ ٤٧٤ ك.ب (٧٣٠).
--
-- فنشرُ رفٍّ من أربعين منتجاً اليوم = **٤٠ كتابة + ١٢٠ طلبَ قراءة + ~٢٧ ميغا
-- تنزيلاً**. وبين الضغطات `if (busyId) return` تُسقِط أيَّ ضغطةٍ ثانيةٍ
-- **بصمت**: الدكتور يضغط، ما يصير شيء، يضغط ثانيةً، ما يصير شيء — فيترك.
--
-- والقرينةُ الحاسمة: الثلاثُ اللاتي يصنعن ١١٩٢ من ١١٩٤ فاتورةً أسبوعياً
-- عندهنّ ٩٩٠ و٩٦٢ و٧٣٠ منتجاً و**صفرُ منتجٍ معروض** — وكلُّهنّ على باقةٍ
-- مدفوعةٍ فعّالة. فليست الباقةُ حاجزاً ولا الصلاحية ولا الصور: **الحاجزُ
-- أنّ نشرَ تشكيلةٍ عملٌ لا يُطاق بهذه الشاشة.**
--
-- ── ومنتجٌ بلا سعرٍ لا يُنشَر ─────────────────────────────────────────────
-- `store_place_order` تسعّر من القاعدة (وهو الصحيح)، ولا شرطَ `sell_price > 0`
-- بالكتلوج. فمنتجٌ بصفرٍ يخرج للزبون ويُقبل طلبُه **مجّاناً**. اليومَ الضررُ
-- محدودٌ لأن النشرَ يدويٌّ صنفاً صنفاً — والنشرُ الجماعيُّ هو بالضبط ما
-- يضاعفه: عيادةٌ حيّةٌ عندها **٢٢ من ٣٨ منتجاً بسعرٍ صفر**، وضغطةُ «انشر
-- الكل» كانت ستُخرجها كلَّها. فالقيدُ يولد مع الميزة لا بعدها.
--
-- والمتخطَّى **يُقال بالعدد** لا يُطوى بصمت: «قائمةٌ ناقصة أخطرُ من خطأ ظاهر».
--
-- ── الصلاحية: نسخةٌ من السياسة الحيّة، لا قائمةٌ من عندي ──────────────────
-- `products_write` بالإنتاج: `manager` أو `veterinarian`. فالجماعيُّ ينسخها
-- حرفياً — أوسعُ منها يفتح النشرَ لموظّف الاستقبال بلا قرار، وأضيقُ يقفل بابَ
-- من يفتحه اليوم. (درسُ 0183: قائمةُ أدوارٍ من الرأس كانت ستقفل طبيبَين حيَّين.)
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0185.
-- ============================================================================

create or replace function public.store_set_visible(p_ids uuid[], p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := auth_role();
  v_n       int;
  v_changed int := 0;
  v_skipped int := 0;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  -- نفسُ قائمة `products_write` حرفياً — لا أوسع ولا أضيق.
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'not_authorized' using hint = 'ما عندك صلاحية تنشر منتجات بالمتجر.';
  end if;
  if p_on is null then
    raise exception 'bad_input' using hint = 'لازم تحدّد: نشر أو إخفاء.';
  end if;

  v_n := coalesce(array_length(p_ids, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'changed', 0, 'skipped_no_price', 0);
  end if;
  -- سقفٌ للدفعة: نداءٌ بعشرة آلاف معرّفٍ يقفل جدولَ المنتجات على العيادة كلِّها.
  if v_n > 500 then
    raise exception 'too_many' using hint = 'انشر ٥٠٠ منتجٍ بالمرّة كحدٍّ أقصى.';
  end if;

  if p_on then
    -- المتخطَّى يُحصى **قبل** التحديث والصفوفُ على حالها.
    select count(*) into v_skipped
      from products
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(sell_price, 0) <= 0 and not coalesce(store_visible, false);

    update products set store_visible = true
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(sell_price, 0) > 0 and not coalesce(store_visible, false);
    get diagnostics v_changed = row_count;
  else
    update products set store_visible = false
     where id = any(p_ids) and clinic_id = v_clinic
       and coalesce(store_visible, false);
    get diagnostics v_changed = row_count;
  end if;

  -- `changed` عددُ ما **تبدّل فعلاً** لا عددُ ما أُرسل: شرطُ الحالة بالتحديث
  -- يجعل إعادةَ النداء ترجع صفراً بدل أن تدّعي عملاً لم يقع.
  return jsonb_build_object('ok', true, 'changed', v_changed, 'skipped_no_price', v_skipped);
end $$;

revoke all on function public.store_set_visible(uuid[], boolean) from public, anon;
grant execute on function public.store_set_visible(uuid[], boolean) to authenticated;

comment on function public.store_set_visible(uuid[], boolean) is
  'نشرٌ/إخفاءٌ جماعيّ بنداءٍ واحد. كان الرفُّ يُنشَر صنفاً صنفاً مع إعادةِ '
  'تحميلٍ كاملة (٦٩١ ك.ب لأكبر عيادة) — ٤٠ منتجاً = ~٢٧ ميغا وضغطاتٌ تُبلَع. '
  'ومنتجٌ بسعرٍ ≤ ٠ لا يُنشَر ويُحصى بـskipped_no_price: الكتلوج بلا شرط سعرٍ '
  'وstore_place_order تسعّر من القاعدة، فالصفرُ يُباع مجّاناً. الصلاحيةُ نسخةٌ '
  'من سياسة products_write (manager أو veterinarian).';

-- ============================================================================
-- VERIFY: select store_set_visible(array(select id from products limit 3), true);
--   ⇒ {"ok":true,"changed":N,"skipped_no_price":M}
-- وبعيادةٍ أخرى ⇒ changed = 0 (القصُّ بالـclinic_id داخل الدالّة).
-- ============================================================================
