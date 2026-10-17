-- ============================================================================
-- ٠٢٤٣ — موظّفُ التصوير يرى باركوداتِ المنتج ولا يرى سعرَه
--
-- ── قرارُ المالك (١٧/١٠) ─────────────────────────────────────────────────
-- «ما اريد المصور يشوف سعر الشراء والبيع — بس اريد لما يدخل على منتج، وهو مثلاً ما يعرف صورته
-- واسمه مستغرب منه، يكون واضح عنده الباركود على الأقل، يكدر يروح يشوف الباركودات ويكعد يقارن.»
--
-- ── لماذا ───────────────────────────────────────────────────────────────
-- • الباركود: هو ما يربط العلبةَ بيد المصوّر بصفّها. photo_products (0228) تعطيه الأساسيَّ وحده، والمنتجُ
--   بالواقع له عدّةُ رموز (CLAUDE.md: رقمُ الرفّ وباركودُ المصنع) — فالرموزُ الإضافية تصل له كالأساسيّ.
-- • السعر: 0228 أعطت سعرَ البيع لكلّ من يملك manageStore، وقالبُ المصوّر يحمله — فكان يراه (مقيسٌ على
--   الإنتاج قراءةً ١٧/١٠: photo_products تعطي sell_price لـv_store، وقالبُ المصوّر فيه manageStore) ويعدّله
--   من المتجر. القرارُ الآن: لا سعرَ للمصوّر — لا قراءةً ولا كتابة (تعديلُ سعرٍ لا يُرى لا معنى له، و
--   store_set_price تطلب السعرَ الذي رآه شرطاً). وسعرُ الشراء لم يصله قطّ (لا يُذكر بالدالّة).
--
-- ── المقيس ───────────────────────────────────────────────────────────────
-- ٨ منتجاتٍ من ٣٤٣٢ برموزٍ إضافية، و٢٧١ بلا باركود؛ مصوّران بعيادةٍ واحدة.
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- • لا تمسّ المديرَ والطبيبَ ومن مُنح manageStore من الكادر: سعرُ البيع لهم كما كان.
-- • لا تمسّ api_gate (أخطرُ دالّةٍ بالنظام — خطأٌ فيها يُسقط كلَّ طلب): store_set_price تبقى بقائمة المصوّر
--   وترفضه هي بنفسها برسالة.
-- • لا تمسّ الرصيدَ والمجمَّعَ والانتهاء (لوحةُ الجاهزية) — القرارُ عن السعر.
-- • والمتجرُ العامّ يعرض أسعارَ المعروض لكلّ زائر أصلاً — هذا قرارٌ عن شاشة الإدارة، لا عن سرّية السعر.
--
-- تُطبَّق بعد 0242 (وقبل الواجهة: الواجهةُ تخفي السعرَ عن المصوّر وتقرأ alt_codes). إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- تراجع: أعد photo_products وstore_set_price من 0228 حرفاً.
-- ============================================================================

create or replace function public.photo_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_store  boolean;
  v_price  boolean;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  -- الإذنُ من staff_can وحدها (المديرُ نعم، وقالبُ الطبيب يشمل الإذنين): إطفاءُ المدير
  -- لإذنِ طبيبٍ يُحترم بالخادم لا بالواجهة وحدها.
  v_store := staff_can('manageStore');
  if not (v_store or staff_can('manageProductPhotos')) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على صور المنتجات.';
  end if;
  -- 0243 (قرارُ المالك): سعرُ البيع لمن يدير المتجر **عدا** موظّف التصوير — وإن حمل قالبُه manageStore.
  v_price := v_store and not is_photographer();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'barcode', p.barcode,
             -- 0243: الرموزُ الإضافية مع الأساسيّ — بنفس حساسيته، ولكلّ من يرى الأساسيّ.
             'alt_codes', coalesce(to_jsonb(p.alt_codes), '[]'::jsonb),
             'category', p.category,
             'subcategory', p.subcategory, 'company_id', p.company_id, 'company_name', c.name,
             'image_path', p.image_path, 'store_visible', coalesce(p.store_visible, false),
             'store_featured', coalesce(p.store_featured, false), 'store_desc', p.store_desc,
             'sell_price', case when v_price then p.sell_price end,
             -- الرصيدُ لمن يدير المتجر (المصوّرُ منهم بقالبه) — لوحةُ الجاهزية.
             'stock', case when v_store then p.stock end,
             -- 0228: المجمَّعُ (رصيدُه بحوض قسمه) والانتهاءُ.
             'pooled', case when v_store then coalesce(p.pooled, false) end,
             'expiry_date', case when v_store then p.expiry_date end)
           order by p.name)
      from products p left join companies c on c.id = p.company_id
     where p.clinic_id = v_clinic and p.farm_id is null), '[]'::jsonb);
end $$;
revoke all on function public.photo_products() from public, anon;
grant execute on function public.photo_products() to authenticated;

-- ── السعرُ من المتجر: نصُّ 0228 حرفاً إلا المصوّر ───────────────────────────────
create or replace function public.store_set_price(p_product uuid, p_price numeric, p_expected numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_now    numeric;
  v_new    numeric;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  if not _store_manager_ok() then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على المتجر.';
  end if;
  -- سعرُ البيع للمدير والطبيب وحدهما (products_write، 0051). 0228 وسّعته للمصوّر، و0243 أرجعته بقرار المالك:
  -- المصوّرُ لا يرى السعرَ فلا يكتبه. والفحصُ على الدور الأساس (is_photographer) — مفتاحُ المدير لا يُفتح له.
  if not (auth_role() in ('manager', 'veterinarian')) or is_photographer() then
    raise exception 'not_authorized' using errcode = '42501', hint = 'تعديل السعر للمدير والطبيب.';
  end if;
  -- صفرٌ ليس سعرَ متجر (store_catalog يخفيه) — وهو ما يكتبه حقلٌ مُسح ثم تُرك. وNaN بالـnumeric
  -- أكبرُ من كلّ رقم، فالسقفُ يمسكه.
  if p_price is null or p_price <= 0 or p_price > 1000000000000 then
    raise exception 'bad_price' using hint = 'السعر لازم أكبر من صفر.';
  end if;
  v_new := round(p_price, 2);
  -- نطاقُ photo_products نفسُه: منتجاتُ العيادة بلا منتجات الحقول. والقفلُ ثم المقارنة:
  -- رفعُ أسعارٍ أو جهازٌ آخر غيّر السعرَ بعد فتح القائمة ⇒ لا يُكتب فوقه بصمت.
  select p.sell_price into v_now from products p
   where p.id = p_product and p.clinic_id = v_clinic and p.farm_id is null
   for update;
  if not found then
    raise exception 'product_not_found' using hint = 'المنتج مو موجود بعيادتك — حدّث القائمة.';
  end if;
  if v_now is distinct from p_expected then
    raise exception 'price_moved'
      using hint = 'السعر تغيّر من جهاز ثاني أو برفع أسعار — حدّث القائمة وشوف السعر الجديد قبل لا تعدّله.';
  end if;
  if v_now is not distinct from v_new then
    return v_new;
  end if;
  update products set sell_price = v_new where id = p_product and clinic_id = v_clinic;
  return v_new;
end $$;
revoke all on function public.store_set_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.store_set_price(uuid, numeric, numeric) to authenticated;

comment on function public.store_set_price(uuid, numeric, numeric) is
  'سعرُ البيع من المتجر (0228) للمدير والطبيب — لا للمصوّر منذ 0243 بقرار المالك (لا يرى السعر). يكتب بشرط أنّ السعرَ ما زال ما رآه (price_moved).';
