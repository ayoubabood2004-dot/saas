-- ============================================================================
-- 0294 — وحدةُ المادّة يغيّرها الخادمُ وحده ومعها كلُّ رقمٍ بوحدتها، والدمجُ لا يجمع وحدتين (G11–G14، ٢٨/١١)
--
-- ── الجذر (جولةُ الثغرات ٢٣/١١ — كلُّ بندٍ أكّده مُتحقّقان على الأجسام الحيّة) ───────────────────────────────
-- ثلاثةُ أعمدةٍ تقرّر بأيّ وحدةٍ كلُّ رقمٍ عن المادّة — sold_by_weight وhas_sub_unit وunits_per_box: الرصيدُ والمتوسّطُ والحدُّ
-- الأدنى والدفعاتُ، وstock_qty كلِّ سطرِ بيعٍ قديم (ما يردّه الترجيعُ والمرتجعُ والحذف)، وكميةُ ربط الجرعة والوصفة. وهي أعمدةٌ
-- عاديّة يكتبها النموذجُ مع كلّ حفظ، بلا مقارنةٍ بما فُتح ولا تحويلٍ ولا كلمة:
--   G11  «يُباع بالوزن» على كيسٍ رصيدُه ٣ ⇒ ٣ كيلو والرفُّ ٤٥؛ والمتوسّطُ ٦٠٬٠٠٠ «للكيلو» يكلّف نصفَ كيلو ٣٠٬٠٠٠؛ وترجيعُ بيعةِ كيسٍ
--        قديمة يردّ ١ كيلو. وتشغيلُ المفرد على مادّةٍ كانت تُعدّ بالحبّة: ١٢٠ حبّة صارت ١٢٠ علبة.
--   G12  «تعديل المجموعة كاملة» يكتب has_sub_unit=false وunits_per_box=null لكلّ عضو (قيمٌ ثابتةٌ بالحمولة المشتركة) — بصمت.
--   G13  إطفاءُ المفرد يُبطل ربطَ الجرعة «بالحبّة»: المحفّزُ (0269) لا يجد عدداً فلا يكتب معلَّقاً — الجرعةُ لا تُحسب ولا تُخصم.
--   G14  الدمجُ يجمع الرصيدين رقماً أيّاً كانت وحدتاهما (كيلو على علب) ويخلط كلفتيهما؛ و«رتّب المخزن» كذلك.
--
-- ── ما تفعله ────────────────────────────────────────────────────────────────
-- ١) محفّزٌ (نمطُ 0162: invoker يحرس `authenticated` وحده — دوالُّ المالك تمرّ) يرفض أيَّ تغييرٍ مباشرٍ لوحدة المادّة **الفعليّة**
--    (بالوزن، أو المفرد بعدده، أو بالعدد). القيمُ نفسُها تمرّ: النسخةُ القديمة من النموذج ترسلها مع كلّ حفظ.
-- ٢) `product_unit_change` البابُ الوحيد: بقفل المادّة، وبشرط ما رآه النموذج (الوحدةُ ثمّ الأسعار — price_moved كـ0226)، وبنسبةٍ
--    صريحة (الجديدُ = القديم × p_mul ÷ p_div: «كم كيلو بالكيس»، أو «الرصيدُ كان بالحبّة»). يحوّل بمعاملةٍ واحدة كلَّ ما يقرأ الوحدة:
--    الرصيدَ (ومرحَّلَه)، والمتوسّط، والدفعات، وstock_qty سطورِ البيع القديمة (المالُ والكميةُ المعروضة كما هما)، والجرعاتِ
--    المعلَّقة والمختومة، وربطَ «سعر الجرعة»، ووصفاتِ الخدمات — والمفردُ الذي يُطفأ يصير كسرَ علبة (حبّةٌ من عشر = ٠٫١ علبة) بدل
--    أن يبطل. ويكتب سطراً بـ`product_unit_changes` من عدّاد الأسعار نفسِه: كلُّ جهازٍ يسأله قبل كلّ بيعة فيعرف أنّ قائمتَه قديمة.
--    ويرفض بجملةٍ ما لا يُحوَّل بأمان: المجمَّعة، والمربوطة بمجموعة، وبسعرين، وبكراتين، وجردٌ ينتظر، ودفترُ مستهلكات، ومواد دينٍ
--    لم ترجع، وطلبُ متجرٍ ينتظر. والوثائقُ لا تُمسّ: فواتيرُ الشراء ومواد الدين تبقى بما كُتب عليها (حدٌّ تقوله الشاشةُ قبل الحفظ)،
--    وفاتورةُ الشراء القديمة لا تتعدّل بعده (٦).
-- ٣) merge_products (نصُّ 0259 حرفاً وفوقه أسطرٌ معلَّمة): وحدتان مختلفتان ⇒ merge_unit_mismatch يسمّي الوحدتين.
-- ٤) inventory_tidy_uncat (نصُّ 0259 + معلَّمة): يتخطّى التوأمَ بوحدةٍ غيرِ وحدة أصله (يبقى للدمج الذي يقول لماذا لا).
-- ٥) دفترُ الرصيد (نصّا 0290 + معلَّمة): الكاتبُ product_unit_change والنوعُ unit («تحويل الوحدة»).
-- ٦) فاتورةُ الشراء القديمة لا تتعدّل بعد التحويل: سطرُها (purchase_items.qty) وثيقةٌ بالوحدة القديمة، وupdate_purchase يعكسها ويعيد
--    بناءَ دفعتها منها كأنها بالجديدة — ٢ كيس تُعكس ٢ كيلو، ودفعتُها (٣٠ كيلو بعد التحويل) تنزل ٢٨ لدفعةٍ ثانية بتاريخٍ آخر ولو عُدّل
--    سطرٌ غيرُها. فالتحويلُ يعلّم سطورَ المادّة بـpurchase_item_unit_marks (جدولٌ جانبيّ: تحديثُ purchase_items نفسِه يكتب «شراء»
--    بسجلّ الحركات لكلّ سطر)، ومحفّزٌ يرفض حذفَ سطرٍ معلَّم أو تغييرَ كميته بجملةٍ تسمّي المادّة. والتسديدُ يمرّ (settle_purchase لا
--    يمسّ السطور)، وأداةُ المالك بلا جلسة تمرّ، والدمجُ والاسترجاعُ ينقلان السطرَ وعلامتُه معه (مفتاحُها معرّفُه).
-- ٧) فكُّ دمجٍ بعد تحويل الأصل يُرفض (restore_unit_changed): الاسترجاعُ يطرح رصيدَ التوأم المحفوظ بالوحدة القديمة من أصلٍ تحوّل،
--    ويرجّع للتوأم سطورَ بيعٍ صار مخصومُها بالجديدة. وطلبُ متجرٍ ينتظر بالمادّة يمنع التحويلَ بالنسبة: قبولُه يخصم كميتَه بالجديدة.
--
-- ── الحدود (معلنة) ───────────────────────────────────────────────────────────
-- • سلّةٌ مفتوحة بجهازٍ آخر لحظةَ التحويل: الواجهةُ تشيل منها سطرَ المادّة حين تصل القائمةُ الجديدة (وحدةُ السطر غيرُ وحدة الصفّ)
--   ويُقال باسمه — الخادمُ يقبل stock_qty الجهاز، فالدفاعُ هناك.
-- • عمليةٌ بطابور جهازٍ بلا نت (مرتجعٌ مثلاً) تُرفع بعد التحويل بكميتها القديمة.
-- • سباقُ ثوانٍ: ترجيعٌ أو حذفُ فاتورة يقرأ سطورَها قبل أن يقفل المادّة، أو بيعٌ حسب مخصومَه قبلها، ينتظر قفلَ التحويل ثمّ يكتب
--   بالقديمة. والتحويلُ فعلُ مديرٍ نادر؛ لا شيء بالخادم يكشفه بعدها.
-- • كلُّ سطرِ بيعٍ قديم يتحوّل مخصومُه يكتب سطرَ تدقيق («سطر بيعة»، من الأنواع المخفيّة بسجلّ الحركات).
--
-- تُطبَّق بعد 0290 (وكلِّ ما قبلها) **وقبل الواجهة**: الواجهةُ الجديدة تنادي product_unit_change، والقديمةُ يرفض المحفّزُ
-- تبديلَها المباشر بـ«حدّث الصفحة» — وهو بالضبط ما كان يُفسد الأرقام.
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ (الحارسُ يقبل علامتَنا). وأقسامُ الحزمة التي تعيد 0259 أو 0290 وحدها تُرجع أجسامَها لنصّها — أعِد 0294 بعدها.
-- تراجع: أعِد merge_products وinventory_tidy_uncat من 0259 و_stock_ledger_source/_kind من 0290 حرفاً بصلاحياتها هناك، ثمّ:
--   drop trigger if exists products_unit_guard on public.products; drop function if exists public.products_unit_guard();
--   drop function if exists public.product_unit_change(uuid, jsonb, jsonb, numeric, numeric);
--   drop trigger if exists purchase_items_unit_guard on public.purchase_items; drop function if exists public.purchase_items_unit_guard();
--   drop trigger if exists products_restore_unit_guard on public.products; drop function if exists public.products_restore_unit_guard();
--   (الجدولان product_unit_changes وpurchase_item_unit_marks يبقيان بلا كاتب، و_unit_key/_unit_text بلا قارئ.)
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regclass('public.dose_charges') is null
     or to_regclass('public.old_debt_items') is null
     or to_regclass('public.price_change_seq') is null
     or to_regprocedure('public.stock_count_preview(uuid[])') is null then
    raise exception 'needs_0290' using hint = 'طبّق 0290 وما قبلها قبل هالهجرة';
  end if;
end $$;

-- الحرّاسُ كلُّها قبل أوّل تعريف: الرفضُ لا يترك نصفَ هجرة.
select public._drift_assert('public.merge_products(uuid,uuid)', 'f93e200c267e3df7f0784bc022eb4b29', '-- +0294');
select public._drift_assert('public.inventory_tidy_uncat()', 'b74f963fc9d779c50b7f74e7d2e3ebc7', '-- +0294');
select public._drift_assert('public._stock_ledger_source(text)', '5180ba5e4213c0c2965c8f7524e3a235', '-- +0294');
select public._drift_assert('public._stock_ledger_kind(text,text,text,numeric)', '37597bc79c6502d175598352d138ed74', '-- +0294');

-- ── ١) سجلُّ التحويل، وعدّادُ الأجهزة ─────────────────────────────────────────
create table if not exists public.product_unit_changes (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  -- بلا مفتاحٍ أجنبيّ (كـprice_change_lines): الحذفُ والاسترجاعُ بنفس المعرّف، والسجلُّ يعيش المادّة.
  product_id    uuid not null,
  product_name  text not null,
  from_unit     jsonb not null,
  to_unit       jsonb not null,
  factor_mul    numeric not null check (factor_mul > 0),
  factor_div    numeric not null check (factor_div > 0),
  stock_before  numeric,
  stock_after   numeric,
  -- من عدّاد الأسعار نفسِه (price_change_seq): الأجهزةُ تقرأ أكبرَ رقمٍ بالجدولين، وقائمةٌ قبلَه لا يُباع منها.
  event_seq     bigint not null,
  created_by    uuid default auth.uid(),
  -- فارغٌ لمشغّل المنصّة (بالاتفاق: لا أثرَ له عند العيادة)، كـprice_changes.
  created_name  text,
  created_at    timestamptz not null default now()
);
create index if not exists product_unit_changes_clinic_idx on public.product_unit_changes (clinic_id, event_seq desc);
create index if not exists product_unit_changes_product_idx on public.product_unit_changes (product_id);
comment on table public.product_unit_changes is
  'تحويلُ وحدة المادّة (0294): من أيّ وحدةٍ إلى أيّ وحدة وبأيّ نسبة ومن سوّاه — يُكتب من product_unit_change وحدها. ورقمُه من عدّاد الأسعار: الكاشيرُ يعرف به أن قائمتَه قديمة.';
alter table public.product_unit_changes enable row level security;
drop policy if exists product_unit_changes_select on public.product_unit_changes;
create policy product_unit_changes_select on public.product_unit_changes for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.product_unit_changes from public, anon, authenticated;
grant select on table public.product_unit_changes to authenticated;
-- السياجُ من 0222 (تراجعُها يحذف دالّتَه — فإعادةُ هذه بعده لا تفشل). verify_photographer_fence يمسك الغيابَ بالإنتاج.
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('product_unit_changes');
  end if;
end $$;

-- سطورُ فواتير الشراء المكتوبة بالوحدة القديمة (٦ بالرأس): تُعلَّم لحظةَ التحويل. جدولٌ جانبيّ لا عمودٌ على السطر — تحديثُ
-- purchase_items يكتب «شراء» بسجلّ الحركات لكلّ سطر. بلا سياسات ولا منح: لا يُقرأ من المتصفّح، ويقرؤه محفّزُ السطور (definer) وحده.
create table if not exists public.purchase_item_unit_marks (
  item_id    uuid primary key references public.purchase_items(id) on delete cascade,
  clinic_id  uuid not null references auth.users(id) on delete cascade,
  product_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists purchase_item_unit_marks_clinic_idx on public.purchase_item_unit_marks (clinic_id);
comment on table public.purchase_item_unit_marks is
  'سطرُ فاتورة شراءٍ كُتب قبل تحويل وحدة مادّته (0294): وثيقةٌ بالوحدة القديمة — تعديلُ فاتورته يعكسه بالجديدة، فيُرفض.';
alter table public.purchase_item_unit_marks enable row level security;
revoke all on table public.purchase_item_unit_marks from public, anon, authenticated;

-- ── ٢) الوحدةُ الفعليّة ونصُّها ─────────────────────────────────────────────
-- الفعليّة: بالوزن، أو بالمفرد بعددٍ موجب، أو بالعدد — صفٌّ قديمٌ بمفردٍ بلا عدد «بالعدد» (هكذا يبيعه كلُّ قارئ). وسائطُ لا صفّ:
-- «رتّب المخزن» يحمل التوأمَ بـrecord، ونداءٌ بصفٍّ مكتوبٍ لا يطابق record.
create or replace function public._unit_key(p_weight boolean, p_sub boolean, p_upb numeric)
returns text language sql immutable set search_path = public as $$
  select case when coalesce(p_weight, false) then 'w'
              when coalesce(p_sub, false) and coalesce(p_upb, 0) > 0 then 'n:' || round(p_upb, 3)::text
              else 'b' end
$$;
revoke all on function public._unit_key(boolean, boolean, numeric) from public, anon;
grant execute on function public._unit_key(boolean, boolean, numeric) to authenticated;

create or replace function public._unit_text(p_weight boolean, p_sub boolean, p_upb numeric, p_subname text)
returns text language sql immutable set search_path = public as $$
  select case when coalesce(p_weight, false) then 'بالكيلو'
              when coalesce(p_sub, false) and coalesce(p_upb, 0) > 0
                then 'بالعلبة (' || rtrim(rtrim(round(p_upb, 3)::text, '0'), '.') || ' ' || coalesce(nullif(btrim(p_subname), ''), 'وحدة') || ')'
              else 'بالعدد' end
$$;
revoke all on function public._unit_text(boolean, boolean, numeric, text) from public, anon;
grant execute on function public._unit_text(boolean, boolean, numeric, text) to authenticated;

-- ── ٣) الوحدةُ لا تُكتب مباشرةً ────────────────────────────────────────────
-- كالمتوسّط (0255): ما يقرّر معنى الأرقام لا يكتبه المتصفّح بتحديثٍ عارٍ. ونسخةٌ قديمةٌ بالمتصفّح تُرفض بجملةٍ لا تُصدَّق «انحفظ».
-- (الرسالةُ ليست «sold_by_weight»: repo.updateProduct يعيد المحاولةَ بلا العمود حين يذكره الخطأ — ظنّاً أن القاعدة أقدم منه.)
create or replace function public.products_unit_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated'
     and public._unit_key(new.sold_by_weight, new.has_sub_unit, new.units_per_box)
         is distinct from public._unit_key(old.sold_by_weight, old.has_sub_unit, old.units_per_box) then
    raise exception 'unit_server_only' using errcode = 'P0001',
      hint = 'وحدة المادة (بالوزن، المفرد، عدد العلبة) تتغيّر من نموذج المادة بالنسخة الجديدة — تحوّل الرصيد والأسعار وياها. حدّث الصفحة وأعد. ما انحفظ شي.';
  end if;
  return new;
end $$;
revoke all on function public.products_unit_guard() from public, anon, authenticated;
-- بلا `update of <عمود>`: عمودٌ يُربط بمحفّز يمنع تغيير نوعه (درسُ 0282) — الشرطُ بالجسم.
drop trigger if exists products_unit_guard on public.products;
create trigger products_unit_guard before update on public.products
  for each row execute function public.products_unit_guard();

-- ٣ب) فاتورةُ الشراء القديمة (٦ بالرأس): update_purchase يعكس السطورَ القديمة ثمّ يحذفها كلَّها ويعيد إدراجها — فالرفضُ عند الحذف
--     يُرجع المعاملةَ كلَّها (العكسُ قبله معها). definer لأنه يقرأ جدولَ العلامات (بلا سياسات) مهما كان المنادي. وبلا `update of`
--     (درسُ 0282): الشرطُ بالجسم. والحارسُ لنداءات التطبيق وحدها (جلسةُ مستخدم: auth.uid()) — update_purchase نفسُه definer فلا يُعرف
--     بدوره؛ وأداةُ المالك بالـSQL Editor بلا جلسة (تنظيفُ عيادةٍ تجريبيّة) تمرّ، فلا عكسَ بالوحدة الجديدة يأتي منها.
create or replace function public.purchase_items_unit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.qty is not distinct from old.qty then return new; end if;
  if auth.uid() is not null and exists (select 1 from purchase_item_unit_marks m where m.item_id = old.id) then
    raise exception 'purchase_unit_changed' using errcode = 'P0001',
      hint = format('«%s» تحوّلت وحدتها بعد هالفاتورة، وسطرها مكتوب بالوحدة القديمة — تعديل الفاتورة كان راح يحسب كميتها بالوحدة الجديدة ويخرّب الرصيد والدفعات. ما انحفظ شي: الفاتورة تبقى مثل ما هي، والفرق يتصحّح بالجرد.',
                    chr(8296) || coalesce(old.name, '') || chr(8297));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.purchase_items_unit_guard() from public, anon, authenticated;
drop trigger if exists purchase_items_unit_guard on public.purchase_items;
create trigger purchase_items_unit_guard before update or delete on public.purchase_items
  for each row execute function public.purchase_items_unit_guard();

-- ٣ج) فكُّ الدمج بعد تحويل الأصل (٧ بالرأس): restore_product يُدرج الصفَّ بمعرّفه وسطرُ السلّة باقٍ لحظتها — فالمحفّزُ قبل الإدراج
--     يرى متى طُوي وفي أيّ أصل، ولا يُعاد تعريفُ الاسترجاع. والأصلُ المحذوفُ بعدها يُسأل أيضاً (سطورُه رجعت فارغةَ المادّة فتنتقل
--     للتوأم بمخصومها الجديد). definer: يقرأ السلّةَ والسجلَّ مهما كان المُدرِج.
create or replace function public.products_restore_unit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_t  record;
  v_kn text;
begin
  select t.merged_into, t.deleted_at into v_t from products_trash t where t.id = new.id;
  if not found or v_t.merged_into is null then return new; end if;
  select u.product_name into v_kn from product_unit_changes u
   where u.product_id = v_t.merged_into and u.created_at > v_t.deleted_at
   order by u.created_at desc limit 1;
  if found then
    raise exception 'restore_unit_changed' using errcode = 'P0001',
      hint = format('«%s» اندمجت بـ«%s» قبل ما تتحوّل وحدتها — فكّ الدمج هسه يرجّع رصيداً ومبيعاتٍ بالوحدة القديمة. ما انحفظ شي؛ إذا لازم ترجع: ضيفها مادة جديدة وصحّح الرصيدين بالجرد.',
                    chr(8296) || coalesce(new.name, '') || chr(8297), chr(8296) || coalesce(v_kn, '') || chr(8297));
  end if;
  return new;
end $$;
revoke all on function public.products_restore_unit_guard() from public, anon, authenticated;
drop trigger if exists products_restore_unit_guard on public.products;
create trigger products_restore_unit_guard before insert on public.products
  for each row execute function public.products_restore_unit_guard();

-- ── ٤) التحويل ──────────────────────────────────────────────────────────────
-- p_seen: ما فُتح عليه النموذج {sold_by_weight, has_sub_unit, units_per_box, sell_price, purchase_price, sub_unit_price}.
-- p_to:   الوحدةُ الجديدة وأسعارُها كما كتبها الطبيب {sold_by_weight, has_sub_unit, units_per_box, sub_unit_name, sub_unit_price,
--         sell_price, purchase_price, min_stock}.
-- p_mul/p_div: الكميةُ بالوحدة الجديدة = القديمة × p_mul ÷ p_div (كسرٌ صريح لا عددٌ عشريّ: ١/١٠ و١/١٥ بلا تقريبٍ قبل الضرب).
--   • تبديلُ الوزن: أيُّ نسبةٍ موجبة («كيسٌ فيه ١٥ كيلو»: ١٥/١، وبالعكس ١/١٥).
--   • تشغيلُ المفرد: ١/١ (الرصيدُ كان علباً) أو ١/العدد (كان بالقطعة الصغيرة).
--   • إطفاؤه أو تغييرُ عدده: ١/١ — الرصيدُ علبٌ قبلها وبعدها.
create or replace function public.product_unit_change(p_id uuid, p_seen jsonb, p_to jsonb, p_mul numeric, p_div numeric)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := auth_role();
  v_ph      boolean := false;
  p         products;
  v_out     products;
  w0 boolean; n0 numeric;             -- الوحدةُ الآن: بالوزن؟ وعددُ المفرد (فارغ = بلا مفرد)
  v_n0e     numeric;                  -- عددُ المفرد الفعليّ (الوزنُ أوّلاً كـ_unit_key) — للنوع؛ وn0 الخامّ للربط «بالحبّة» كما يحسبه _dose_plan
  w1 boolean; s1 boolean; n1 numeric; -- والجديدة
  v_seen_n  numeric;
  v_kind    text;
  v_scale   boolean;                  -- النسبةُ غيرُ ١: الأرقامُ تُحوَّل
  v_pieces  boolean;                  -- تشغيلُ المفرد والرصيدُ كان بالقطعة الصغيرة
  v_sell numeric; v_buy numeric; v_sub numeric; v_min numeric; v_subname text;
  v_k       product_stock_carry;
  v_e       numeric;                  -- الرصيدُ الجديد بالضبط (مع المرحَّل)
  v_stock   numeric;
  v_c       numeric;
  v_name    text;
  v_seq     bigint;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- is_photographer من 0222 ويُسأل بـexecute: تراجعُ 0222 يحذفها، ونداءٌ ثابتٌ يرمي «لا توجد» بدل الجواب.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if coalesce(v_ph, false) or v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'unit_forbidden' using errcode = 'P0001', hint = 'تغيير وحدة المادة للمدير والطبيب.';
  end if;
  if p_id is null or jsonb_typeof(p_seen) is distinct from 'object' or jsonb_typeof(p_to) is distinct from 'object' then
    raise exception 'unit_bad_request' using errcode = 'P0001', hint = 'الطلب ناقص — حدّث الصفحة وأعد. ما انحفظ شي.';
  end if;
  select * into p from products where id = p_id and clinic_id = v_clinic for update;
  if not found then
    raise exception 'unit_product_gone' using errcode = 'P0001', hint = 'المادة ما عادت موجودة (انحذفت أو اندمجت) — حدّث القائمة.';
  end if;
  w0 := coalesce(p.sold_by_weight, false);
  n0 := case when coalesce(p.has_sub_unit, false) and coalesce(p.units_per_box, 0) > 0 then p.units_per_box end;
  -- صفٌّ قديمٌ بالوزن بقي عليه مفردٌ من قبل: وحدتُه الفعليّة «بالكيلو» (لا «إطفاءُ مفرد» حين يبقى بالوزن)، أمّا ربطُه «بالحبّة» فيحسبه
  -- _dose_plan بعدده — فيُحوَّل بعدده الخامّ.
  v_n0e := case when w0 then null else n0 end;

  -- ما رآه النموذج: الوحدةُ أوّلاً (النسبةُ نسبةٌ إليها)، ثمّ الأسعار (المقارنةُ ثمّ التبديل — نموذجٌ فُتح قبل رفع أسعارٍ أو شراء).
  v_seen_n := case when coalesce((p_seen->>'has_sub_unit')::boolean, false) and coalesce((p_seen->>'units_per_box')::numeric, 0) > 0
                   then (p_seen->>'units_per_box')::numeric end;
  if coalesce((p_seen->>'sold_by_weight')::boolean, false) is distinct from w0 or v_seen_n is distinct from n0 then
    raise exception 'unit_seen_changed' using errcode = 'P0001',
      hint = 'وحدة المادة تغيّرت من جهاز ثاني من فتحت النموذج — ما انحفظ شي. سكّر النموذج وافتحه من جديد.';
  end if;
  if (p_seen->>'sell_price')::numeric is distinct from p.sell_price
     or (p_seen->>'purchase_price')::numeric is distinct from p.purchase_price
     or (p_seen->>'sub_unit_price')::numeric is distinct from p.sub_unit_price then
    raise exception 'price_moved' using errcode = 'P0001',
      hint = 'سعر المادة تغيّر من جهاز ثاني (رفع أسعار أو فاتورة شراء) من فتحت النموذج — ما انحفظ شي. سكّر النموذج وافتحه من جديد.';
  end if;

  w1 := coalesce((p_to->>'sold_by_weight')::boolean, false);
  s1 := coalesce((p_to->>'has_sub_unit')::boolean, false);
  if w1 and s1 then
    raise exception 'unit_both' using errcode = 'P0001', hint = 'المادة إمّا بالوزن وإمّا بالمفرد — مو الاثنين.';
  end if;
  n1 := case when s1 then (p_to->>'units_per_box')::numeric end;
  if s1 and not coalesce(n1 > 0 and n1 <= 100000 and n1 = round(n1, 3), false) then
    raise exception 'unit_per_bad' using errcode = 'P0001', hint = 'عدد الوحدات بالعلبة لازم رقم أكبر من صفر.';
  end if;
  v_sell := (p_to->>'sell_price')::numeric;
  v_buy  := (p_to->>'purchase_price')::numeric;
  v_sub  := case when s1 then (p_to->>'sub_unit_price')::numeric end;
  v_min  := coalesce((p_to->>'min_stock')::numeric, p.min_stock);
  v_subname := case when s1 then coalesce(nullif(btrim(p_to->>'sub_unit_name'), ''), 'وحدة') end;
  -- `between`/المقارنةُ ترفض NaN أيضاً (NaN أكبرُ من كلّ رقمٍ بترتيب numeric)، والغائبُ لا يمرّ صامتاً.
  if not coalesce(v_sell >= 0 and v_sell < 10000000000 and v_buy >= 0 and v_buy < 10000000000
                  and (v_sub is null or (v_sub >= 0 and v_sub < 10000000000))
                  and v_min >= 0 and v_min <= 1000000000 and v_min = round(v_min), false) then
    raise exception 'unit_price_bad' using errcode = 'P0001', hint = 'الأسعار والحدّ الأدنى لازم أرقام صفر أو أكثر.';
  end if;

  v_kind := case when w0 <> w1 then 'weight'
                 when v_n0e is null and n1 is not null then 'sub_on'
                 when v_n0e is not null and n1 is null then 'sub_off'
                 when v_n0e <> n1 then 'per'
                 else 'none' end;
  if v_kind = 'none' then
    raise exception 'unit_no_change' using errcode = 'P0001', hint = 'الوحدة ما تغيّرت — احفظ النموذج عادي.';
  end if;
  if not coalesce(p_mul > 0 and p_mul <= 1000000 and p_div > 0 and p_div <= 1000000, false)
     or (v_kind = 'sub_on' and not (p_mul = 1 and (p_div = 1 or p_div = n1)))
     or (v_kind in ('sub_off', 'per') and not (p_mul = 1 and p_div = 1)) then
    raise exception 'unit_factor_bad' using errcode = 'P0001', hint = 'نسبة التحويل غير صحيحة — جاوب سؤال الوحدة بالنموذج من جديد.';
  end if;
  v_scale  := p_mul <> p_div;
  v_pieces := v_kind = 'sub_on' and v_scale;

  -- ما لا يُحوَّل بأمان يُقال قبل أيّ كتابة.
  if coalesce(p.price_currency, 'IQD') = 'USD' then
    raise exception 'unit_usd' using errcode = 'P0001', hint = 'المادة مسعّرة بالدولار وحده — ما تنباع بالوزن ولا بالمفرد.';
  end if;
  if p.farm_id is not null then
    raise exception 'unit_farm' using errcode = 'P0001', hint = 'مادة مخزن الحقل ما تتغيّر وحدتها من هنا.';
  end if;
  if w1 and (coalesce(cardinality(p.sub_codes), 0) > 0
             or coalesce(jsonb_array_length(case when jsonb_typeof(p.packs) = 'array' then p.packs end), 0) > 0) then
    raise exception 'unit_packs_weight' using errcode = 'P0001',
      hint = 'المادة بالوزن ما يصير الها كراتين ولا باركود مغلّف — احذفها من نموذج المادة واحفظ، وبعدين حوّلها للوزن.';
  end if;
  if not s1 and n0 is not null and coalesce(cardinality(p.sub_codes), 0) > 0 then
    raise exception 'unit_sub_codes' using errcode = 'P0001',
      hint = 'للمادة باركود مغلّف (للمفرد) — احذفه من نموذج المادة واحفظ، وبعدين اطفي المفرد.';
  end if;
  if v_scale then
    if coalesce(p.pooled, false) then
      raise exception 'unit_pooled' using errcode = 'P0001',
        hint = 'المادة «بدون كمية» — رصيدها بحوض القسم وياه غيرها، فما يتحوّل وحده. فكّ التجميع أوّلاً.';
    end if;
    if p.sell_price_usd is not null or p.sub_unit_price_usd is not null then
      raise exception 'unit_dual' using errcode = 'P0001',
        hint = 'المادة بسعرين (دينار ودولار) — امسح سعر الدولار من نموذجها واحفظ، حوّل الوحدة، وبعدين رجّعه بالوحدة الجديدة.';
    end if;
    if coalesce(jsonb_array_length(case when jsonb_typeof(p.packs) = 'array' then p.packs end), 0) > 0 then
      raise exception 'unit_packs' using errcode = 'P0001',
        hint = 'للمادة كراتين محسوبة بالوحدة القديمة — احذفها واحفظ، حوّل الوحدة، وبعدين رجّعها.';
    end if;
    if exists (select 1 from products g where g.clinic_id = v_clinic and g.id <> p.id
                and nullif(btrim(g.bulk_group), '') = nullif(btrim(p.bulk_group), '')) then
      raise exception 'unit_grouped' using errcode = 'P0001',
        hint = 'المادة مربوطة بمجموعة بسعر واحد — فكّها من «المربوطة» أوّلاً، بعدين حوّل وحدتها.';
    end if;
    if exists (select 1 from stock_counts c where c.product_id = p.id and c.clinic_id = v_clinic and c.status = 'pending') then
      raise exception 'unit_count_pending' using errcode = 'P0001',
        hint = 'على المادة جرد أو سند تلف ينتظر، مكتوب بالوحدة القديمة — خلّي المدير يبتّ بيه أوّلاً.';
    end if;
    -- دفترُ المستهلكات (0252) أحداثٌ للإلحاق وحده بوحدة المخزون — تحويلُها يكسر ثابتَ verify_consumption، وبقاؤها يجعل عكسَها
    -- بعد التحويل يردّ بالوحدة القديمة. فالمادّةُ المصروفةُ بخدمةٍ لا تُحوَّل.
    if exists (select 1 from invoice_consumption c where c.product_id = p.id and c.clinic_id = v_clinic) then
      raise exception 'unit_consumption' using errcode = 'P0001',
        hint = 'المادة انصرفت كمستهلكات خدمة، ودفترها بالوحدة القديمة — ما تتحوّل. اعمل مادة جديدة بالوحدة الثانية وحوّل الرصيد بالجرد.';
    end if;
    if exists (select 1 from old_debt_items d where d.product_id = p.id and d.clinic_id = v_clinic and d.returned_qty < d.qty) then
      raise exception 'unit_old_debt' using errcode = 'P0001',
        hint = 'على المادة مواد دين قديم ما رجعت، مكتوبة بالوحدة القديمة — رجّعها أو صفّها أوّلاً.';
    end if;
    -- طلبُ المتجر يُقبل لاحقاً بـstock_qty = كميته (store_accept_order) — كميةٌ اختارها الزبونُ بالوحدة القديمة تُخصم بالجديدة.
    if exists (select 1 from store_orders o
                where o.clinic_id = v_clinic and o.status = 'new'
                  and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) x
                               where x->>'product_id' = p.id::text)) then
      raise exception 'unit_store_pending' using errcode = 'P0001',
        hint = 'على المادة طلب من المتجر ينتظر، كميته بالوحدة القديمة — اقبله أو ارفضه أوّلاً، بعدين حوّل الوحدة.';
    end if;
  end if;
  -- أقفالُ الجرعات بلا انتظار (كالدمج 0288): بيعُ جرعاتٍ يقفلها ثمّ المادّة، وهذا بالعكس — فجرعةٌ تُباع الآن ترفض باسمها لا قفلاً متشابكاً.
  begin
    perform 1 from dose_charges d
     where d.product_id = p.id and d.clinic_id = v_clinic and d.status in ('pending', 'billed') for update nowait;
  exception when lock_not_available then
    raise exception 'unit_dose_busy' using errcode = 'P0001', hint = 'فيه بيع جرعة جاري على هالمادة — أعد بعد شوي.';
  end;

  -- ١) الدفعاتُ قبل الرصيد: مطابقتُها المؤجَّلة (0217) بآخر المعاملة ترى مجموعَها بالوحدة الجديدة لا تعيد توزيعه.
  if v_scale then
    update product_lots
       set qty = round(qty * p_mul / p_div, 3),
           received_qty = round(received_qty * p_mul / p_div, 3),
           unit_cost = case when unit_cost is null then null else round(unit_cost * p_div / p_mul, 6) end,
           updated_at = now()
     where product_id = p.id and clinic_id = v_clinic;
  end if;

  -- ٢) سطورُ البيع القديمة: stock_qty ما يردّه كلُّ عكس (الترجيع، المرتجع، الحذف، التعديل، إلغاءُ طلب التوصيل) — بالوحدة الجديدة،
  --    وما أُخذ من حوض القسم (pooled_qty) بوحدة الحوض كما هو. والمالُ والكميةُ المعروضة (qty، السعر) كما هما.
  if v_scale then
    update invoice_items
       set stock_qty = round((coalesce(stock_qty, qty) - coalesce(pooled_qty, 0)) * p_mul / p_div + coalesce(pooled_qty, 0), 3)
     where product_id = p.id and clinic_id = v_clinic;
    -- ٢ب) سطورُ فواتير الشراء وثيقةٌ لا تُحوَّل (الورقةُ تقول «٢ كيس») — تُعلَّم فلا يعكسها تعديلُ فاتورتها بالوحدة الجديدة (٦ بالرأس).
    insert into purchase_item_unit_marks (item_id, clinic_id, product_id)
    select pi.id, v_clinic, p.id from purchase_items pi where pi.product_id = p.id and pi.clinic_id = v_clinic
    on conflict (item_id) do nothing;
  end if;

  -- ٣) الجرعات المعلَّقة والمختومة (ترجيعُ فاتورتها يُرجعها معلَّقةً بمخصومها — 0288): المخصومُ بوحدة الرصيد الجديدة. والمفردُ الذي
  --    يُطفأ يصير كسرَ علبة، وتشغيلُه على رصيدٍ كان بالقطعة يجعل «الواحدةَ» مفرداً.
  --    والكميةُ الجديدة بثلاث منازل كما يخزّنها retail_checkout (qty numeric(14,3)) ويخصمها _dose_plan: ١/٣ بستٍّ (٠٫٣٣٣٣٣٣) كانت تُعرض
  --    وتُطبع ٥٬٠٠٠ وتُسجَّل ٠٫٣٣٣ × ١٥٬٠٠٠ = ٤٬٩٩٥. ولا تنزل تحت ٠٫٠٠١ (قيدُ «أكبر من صفر» — كالوصفة).
  update dose_charges d
     set stock_qty = case when v_scale then round(d.stock_qty * p_mul / p_div, 3)
                          when v_kind = 'per' and d.dose_unit = 'sub' then round(coalesce(d.dose_qty, 1) / n1, 3)
                          else d.stock_qty end,
         dose_qty  = case when d.dose_unit = 'sub' and not s1 and n0 is not null then greatest(round(coalesce(d.dose_qty, 1) / n0 * p_mul / p_div, 3), 0.001)
                          when d.dose_unit = 'box' and v_scale and not v_pieces then greatest(round(coalesce(d.dose_qty, 1) * p_mul / p_div, 3), 0.001)
                          else d.dose_qty end,
         dose_unit = case when v_pieces and d.dose_unit = 'box' then 'sub'
                          when d.dose_unit = 'sub' and not s1 and n0 is not null then 'box'
                          else d.dose_unit end
   where d.product_id = p.id and d.clinic_id = v_clinic and d.status in ('pending', 'billed');

  -- ٤) ربطُ «سعر الجرعة» (بابُه يحرس `authenticated` وحده، وهذه دالّةُ المالك): نفسُ الكمية الحقيقية بالوحدة الجديدة.
  update clinic_drugs c
     set dose_qty  = case when c.dose_unit = 'sub' and not s1 and n0 is not null then greatest(round(coalesce(c.dose_qty, 1) / n0 * p_mul / p_div, 3), 0.001)
                          when c.dose_unit = 'box' and v_scale and not v_pieces then greatest(round(coalesce(c.dose_qty, 1) * p_mul / p_div, 3), 0.001)
                          else c.dose_qty end,
         dose_unit = case when v_pieces and c.dose_unit = 'box' then 'sub'
                          when c.dose_unit = 'sub' and not s1 and n0 is not null then 'box'
                          else c.dose_unit end,
         updated_at = now()
   where c.product_id = p.id and c.clinic_id = v_clinic
     and ((c.dose_unit = 'sub' and not s1 and n0 is not null) or (c.dose_unit = 'box' and v_scale));

  -- ٥) وصفاتُ الخدمات: كذلك (والكميةُ لا تنزل تحت منزلتها الثالثة — قيدُ الجدول).
  update clinic_service_recipe_items r
     set qty  = case when r.unit = 'sub' and not s1 and n0 is not null then greatest(round(r.qty / n0 * p_mul / p_div, 3), 0.001)
                     when r.unit = 'stock' and v_scale and not v_pieces then greatest(round(r.qty * p_mul / p_div, 3), 0.001)
                     else r.qty end,
         unit = case when v_pieces and r.unit = 'stock' then 'sub'
                     when r.unit = 'sub' and not s1 and n0 is not null then 'stock'
                     else r.unit end,
         updated_at = now()
   where r.product_id = p.id and r.clinic_id = v_clinic
     and ((r.unit = 'sub' and not s1 and n0 is not null) or (r.unit = 'stock' and v_scale));

  -- ٦) الرصيدُ ومرحَّلُه (0252): الجديدُ بالضبط = (الرصيد + المرحَّل) × النسبة، والمرحَّلُ الجديد ما دون المنزلة الثالثة. ودفترُ
  --    المادّة فارغ (رُفض أعلاه) فثابتُ verify_consumption «ext_in − ext_out = المرحَّل» يُكتب بفرقه.
  v_e := coalesce(p.stock, 0) * p_mul / p_div;
  if v_scale then
    select * into v_k from product_stock_carry k where k.product_id = p.id and k.clinic_id = v_clinic for update;
    if found then v_e := (coalesce(p.stock, 0) + v_k.carry) * p_mul / p_div; end if;
  end if;
  v_stock := round(v_e, 3);
  v_c := round(v_e - v_stock, 9);
  if v_c >= 0.0005 then v_stock := v_stock + 0.001; v_c := round(v_e - v_stock, 9); end if;   -- النصفُ السالبُ التامّ: قيدُ «< ٠٫٠٠٠٥»
  if v_scale and v_k.product_id is not null then
    update product_stock_carry set carry = v_c, ext_in = ext_out + v_c, updated_at = now()
     where product_id = p.id and clinic_id = v_clinic;
  end if;

  -- ٧) المادّةُ نفسُها: الوحدةُ والأسعارُ كما كتبها الطبيب، والرصيدُ والمتوسّطُ محوَّلان (المتوسّطُ لا يكتبه غيرُ الخادم — 0255).
  update products
     set sold_by_weight     = w1,
         has_sub_unit       = s1,
         units_per_box      = n1,
         sub_unit_name      = v_subname,
         sub_unit_price     = case when s1 then round(v_sub, 2) end,
         sub_purchase_price = case when s1 then sub_purchase_price end,
         sell_price         = round(v_sell, 2),
         purchase_price     = round(v_buy, 2),
         min_stock          = v_min::int,
         stock              = v_stock,
         avg_cost           = case when v_scale and avg_cost is not null then round(avg_cost * p_div / p_mul, 6) else avg_cost end,
         expiry_ack_qty     = case when v_scale and expiry_ack_qty is not null then round(expiry_ack_qty * p_mul / p_div, 3) else expiry_ack_qty end
   where id = p.id and clinic_id = v_clinic
   returning * into v_out;

  -- ٨) السجلّ، ورقمُه من عدّاد الأسعار: كلُّ قائمةٍ جُلبت قبل هذه اللحظة قديمة (الكاشيرُ يسأل قبل كلّ بيعة).
  v_seq := nextval('price_change_seq');
  v_name := case when is_platform_admin() then null
                 else (select s.name from staff s where s.user_id = auth.uid() and s.clinic_id = v_clinic limit 1) end;
  insert into product_unit_changes (clinic_id, product_id, product_name, from_unit, to_unit, factor_mul, factor_div,
                                    stock_before, stock_after, event_seq, created_by, created_name)
  values (v_clinic, p.id, p.name,
          jsonb_build_object('sold_by_weight', w0, 'units_per_box', n0, 'sub_unit_name', p.sub_unit_name),
          jsonb_build_object('sold_by_weight', w1, 'units_per_box', n1, 'sub_unit_name', v_subname),
          p_mul, p_div, p.stock, v_stock, v_seq, auth.uid(), v_name);
  return v_out;
end $$;
revoke all on function public.product_unit_change(uuid, jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function public.product_unit_change(uuid, jsonb, jsonb, numeric, numeric) to authenticated;
comment on function public.product_unit_change(uuid, jsonb, jsonb, numeric, numeric) is
  'تحويلُ وحدة المادّة (0294) — البابُ الوحيد: بشرط ما رآه النموذج، ويحوّل الرصيدَ والمتوسّطَ والدفعاتِ وstock_qty سطور البيع والجرعاتِ وربطَها والوصفاتِ بالنسبة p_mul/p_div بمعاملةٍ واحدة، ويكتب سطرَ product_unit_changes من عدّاد الأسعار.';

-- ── ٥) الدمجُ لا يجمع وحدتين — نصُّ 0259 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────────────────
create or replace function public.merge_products(p_keep uuid, p_drop uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_keep products;
  v_drop products;
  v_codes text[];
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
  v_sub   text[]; -- +0259
  v_packs jsonb; -- +0259
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;
  if p_keep is null or p_drop is null then raise exception 'both products are required'; end if;
  if p_keep = p_drop then raise exception 'cannot merge a product into itself'; end if;

  select * into v_keep from products where id = p_keep and clinic_id = v_clinic for update;
  if v_keep.id is null then raise exception 'product to keep not found'; end if;
  select * into v_drop from products where id = p_drop and clinic_id = v_clinic for update;
  if v_drop.id is null then raise exception 'product to drop not found'; end if;
  if v_keep.pooled or v_drop.pooled then
    raise exception 'pooled products cannot be merged'; end if;
  -- 0259: ما لا يُحمل يُقال قبل أيّ كتابة: باركودُ مغلّف التوأم قطعةٌ من علبته — يُحمل لأصلٍ قطعتُه بنفس العدد وحده (لا رمزٌ -- +0259
  -- يبيع قطعةً بغير حجمها)؛ والكراتينُ لا تحملها مادةٌ بالوزن (قيدُ products_packaging_ok). -- +0259
  if coalesce(cardinality(v_drop.sub_codes), 0) > 0 -- +0259
     and not (coalesce(v_keep.has_sub_unit, false) and coalesce(v_keep.units_per_box, 0) > 0 -- +0259
              and v_keep.units_per_box = v_drop.units_per_box) then -- +0259
    raise exception 'merge_sub_codes' using errcode = 'P0001', -- +0259
      hint = 'للمادة المطويّة باركودُ مغلّف، والأصلُ بلا وحدةٍ صغرى بنفس العدد — اضبط الوحدةَ الصغرى بالأصل أوّلاً ثمّ ادمج.'; -- +0259
  end if; -- +0259
  if coalesce(jsonb_array_length(case when jsonb_typeof(v_drop.packs) = 'array' then v_drop.packs end), 0) > 0 -- +0259
     and coalesce(v_keep.sold_by_weight, false) then -- +0259
    raise exception 'merge_packs_unit' using errcode = 'P0001', -- +0259
      hint = 'للمادة المطويّة كراتين والأصلُ يُباع بالوزن — الكراتينُ لا تُحمل لمادةٍ بالوزن.'; -- +0259
  end if; -- +0259
  -- 0294: وحدتان مختلفتان لا تُجمعان — رصيدٌ «بالكيلو» على «بالعدد» (أو علبةُ ١٠ على علبة ٢٠) رقمٌ بلا معنى، والمتوسّطُ يخلط كلفتيهما. -- +0294
  -- وتوأمٌ بلا مفرد مع أصلٍ بمفرد لا يُعرف أكان يعدّ علباً أم حبّات: يُوحَّد بنموذجه أوّلاً (تغييرُ الوحدة يسأل ويحوّل الرصيد). -- +0294
  if public._unit_key(v_drop.sold_by_weight, v_drop.has_sub_unit, v_drop.units_per_box) -- +0294
     is distinct from public._unit_key(v_keep.sold_by_weight, v_keep.has_sub_unit, v_keep.units_per_box) then -- +0294
    raise exception 'merge_unit_mismatch' using errcode = 'P0001', -- +0294
      hint = format('«%s» %s و«%s» %s — وحدتان مختلفتان، فالرصيدان ما ينجمعون. وحّد الوحدة من نموذج إحداهما (تغيير الوحدة يحوّل رصيدها)، وبعدين ادمج.', -- +0294
                    chr(8296) || v_drop.name || chr(8297), public._unit_text(v_drop.sold_by_weight, v_drop.has_sub_unit, v_drop.units_per_box, v_drop.sub_unit_name), -- +0294
                    chr(8296) || v_keep.name || chr(8297), public._unit_text(v_keep.sold_by_weight, v_keep.has_sub_unit, v_keep.units_per_box, v_keep.sub_unit_name)); -- +0294
  end if; -- +0294

  -- الصورة أوّلاً — بسطورها كما هي الآن، قبل أن تنتقل للأصل.
  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = p_drop;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = p_drop and qty > 0;
  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
  values (v_drop.id, v_drop.clinic_id, to_jsonb(v_drop), v_inv, v_pur, v_bar, v_sold, coalesce(v_drop.stock, 0), null, auth.uid(), p_keep, nullif(v_keep.barcode, ''))
  on conflict (id) do update
    set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
        purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
        sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
        deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;

  v_codes := coalesce(v_keep.alt_codes, '{}');
  if v_drop.barcode is not null and v_drop.barcode <> ''
     and v_drop.barcode is distinct from v_keep.barcode
     and not (v_codes @> array[v_drop.barcode]) then
    v_codes := v_codes || v_drop.barcode;
  end if;
  if v_drop.alt_codes is not null then
    select array_agg(distinct x) into v_codes
      from unnest(v_codes || v_drop.alt_codes) as x
     where x is not null and x <> '' and x is distinct from v_keep.barcode;
  end if;
  -- 0259: رموزُ المغلّف والكراتين تتبع الأصلَ كالإضافيّة — رمزٌ يضيع بالطيّ يصير «ما ينعرف» على علبةٍ بالرفّ. -- +0259
  -- والتوأمُ حيٌّ حتى آخر الدالّة وهذه رموزُه: يُعلَن لحارس المستويات فلا يُعدّ تصادماً معه وحده (محلّيٌّ للمعاملة). -- +0259
  v_sub := public._pkg_codes_union(v_keep.sub_codes, v_drop.sub_codes); -- +0259
  v_packs := public._pkg_packs_union(v_keep.packs, v_drop.packs); -- +0259
  if jsonb_array_length(v_packs) > 4 then -- +0259
    raise exception 'merge_packs_overflow' using errcode = 'P0001', -- +0259
      hint = 'المادتان معاً أكثرُ من أربعة كراتين — احذف كارتوناً من إحداهما ثمّ ادمج.'; -- +0259
  end if; -- +0259
  perform set_config('doctorvet.codes_from', p_drop::text, true); -- +0259

  update invoice_items      set product_id = p_keep where product_id = p_drop;
  update purchase_items     set product_id = p_keep where product_id = p_drop;
  update generated_barcodes set product_id = p_keep where product_id = p_drop;

    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
  update products
     set stock     = coalesce(stock, 0) + coalesce(v_drop.stock, 0),
         alt_codes = coalesce(v_codes, '{}'),
         sub_codes = v_sub, -- +0259
         packs = v_packs, -- +0259
         unit_name = coalesce(nullif(btrim(unit_name), ''), nullif(btrim(v_drop.unit_name), '')), -- +0259
         sub_purchase_price = coalesce(sub_purchase_price, case when coalesce(has_sub_unit, false) and units_per_box is not distinct from v_drop.units_per_box then v_drop.sub_purchase_price end), -- +0259
         image_path = coalesce(nullif(image_path, ''), nullif(v_drop.image_path, '')),
         store_desc = coalesce(nullif(store_desc, ''), nullif(v_drop.store_desc, '')),
         min_stock = greatest(coalesce(min_stock, 0), coalesce(v_drop.min_stock, 0)),
         expiry_date = case when expiry_date is null then v_drop.expiry_date
                            when v_drop.expiry_date is null then expiry_date
                            else greatest(expiry_date, v_drop.expiry_date) end
   where id = p_keep
   returning * into v_keep;

  delete from products where id = p_drop;
  perform set_config('doctorvet.codes_from', '', true); -- +0259
  return v_keep;
end  $function$;
revoke all on function public.merge_products(uuid, uuid) from public, anon;
grant execute on function public.merge_products(uuid, uuid) to authenticated;

-- ── ٦) «رتّب المخزن» يتخطّى التوأمَ بوحدةٍ أخرى — نصُّ 0259 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────
create or replace function public.inventory_tidy_uncat()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_clinic uuid := auth_clinic(); v_role text := auth_role(); dup record; v_target uuid; v_merged int := 0; v_kept int := 0;
        v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
        v_tgt_barcode text; v_codes text[];
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
    -- 0253: الأصلُ والتوأمُ يُقفلان بالمعرّف (ترتيبُ البيع 0252 ومحفّزِ الطيّ) قبل قراءة ما يُطوى، والتوأمُ يُقرأ -- +0253
    -- من جديد: اللفّةُ قرأته من لقطتها بلا قفل، فبيعةٌ له تُثبَّت بينهما كانت تضيع (الأصلُ يأخذ رصيدَ ما قبلها -- +0253
    -- وسلّةُ المحذوفات تحفظه، فالفكُّ يرجعه كما كان). وتوأمٌ اختفى (طواه أو حذفه غيرُنا) يُتخطّى — لقطتُه كانت -- +0253
    -- تُطوى ثانيةً فيرجع رصيدُ المحذوف للأصل؛ وأصلٌ اختفى يُبقي توأمَه. وشرطُ اللفّة (بلا صنف) يُعاد على ما قُفل: -- +0253
    -- توأمٌ صنّفته شاشةٌ أخرى أو طوته لحوضٍ قبل دوره صار مادّةً بصنفها — طيُّه كان يحذفها ويضمّها لأصلٍ بصنفٍ آخر. -- +0253
    perform 1 from products where clinic_id = v_clinic and id in (dup.id, v_target) order by id for update; -- +0253
    select * into dup from products where id = dup.id and clinic_id = v_clinic; -- +0253
    if not found then continue; end if; -- +0253
    if dup.section_id is not null then v_kept := v_kept + 1; continue; end if; -- +0253
    -- 0259: توأمٌ له تعبئة (كراتين أو باركودُ مغلّف) لا يُطوى هنا: هذا الطيُّ لا يحملها فكان يمحو رموزَها — -- +0259
    -- يبقى للطيّ اليدويّ (merge_products) الذي يحملها أو يقول لماذا لا. -- +0259
    if coalesce(cardinality(dup.sub_codes), 0) > 0 -- +0259
       or coalesce(jsonb_array_length(case when jsonb_typeof(dup.packs) = 'array' then dup.packs end), 0) > 0 then -- +0259
      v_kept := v_kept + 1; continue; -- +0259
    end if; -- +0259
    if not exists (select 1 from products where id = v_target and clinic_id = v_clinic) then v_kept := v_kept + 1; continue; end if; -- +0253
    -- 0294: وتوأمٌ بوحدةٍ غيرِ وحدة أصله (كيلو وعدد، أو علبتان بعددين) لا يُطوى هنا — الطيُّ يجمع الرصيدين رقماً؛ يبقى للدمج -- +0294
    -- اليدويّ الذي يقول لماذا لا. -- +0294
    if public._unit_key(dup.sold_by_weight, dup.has_sub_unit, dup.units_per_box) is distinct from -- +0294
       (select public._unit_key(t.sold_by_weight, t.has_sub_unit, t.units_per_box) from products t where t.id = v_target and t.clinic_id = v_clinic) then -- +0294
      v_kept := v_kept + 1; continue; -- +0294
    end if; -- +0294
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

    /* ── الوراثةُ تُحسب **قبل** الحذف والصفُّ حيّ، وتُكتب بعده ──────────────
     * الحسابُ قبل الحذف لأن `dup` لقطةٌ بيدنا، والكتابةُ بعده لأن كتابةَ
     * الباركود والصفّان حيّان تخرق الفهرسَ الفريد (23505) فتُلغي العمليةَ
     * كلَّها — وهذا سببُ ترتيب 0167 الأصليّ، نُبقيه.
     *
     * ونفسُ منطق `merge_products` (0144) حرفاً بحرف: الأساسيُّ والإضافية
     * تلحق بالأصل، بلا فارغٍ ولا مكرَّرٍ ولا ما يساوي باركودَ الهدف. */
    select nullif(barcode, '') into v_tgt_barcode from products where id = v_target and clinic_id = v_clinic;
    select coalesce(alt_codes, '{}') into v_codes from products where id = v_target and clinic_id = v_clinic;
    if coalesce(dup.barcode, '') <> ''
       and inv_norm_code(dup.barcode) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''))
       and not exists (select 1 from unnest(v_codes) c where inv_norm_code(c) = inv_norm_code(dup.barcode)) then
      v_codes := v_codes || dup.barcode;
    end if;
    if dup.alt_codes is not null and dup.alt_codes <> '{}' then
      select coalesce(array_agg(distinct c), '{}') into v_codes
        from unnest(v_codes || dup.alt_codes) as c
       where c is not null and c <> ''
         and inv_norm_code(c) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''));
    end if;
    /* ولا يُسرق رمزٌ صار لمنتجٍ ثالث — نظيرُ فحص `attach_product_code`.
     * (الهدفُ والتوأمُ مستثنيان: الأوّل مالكٌ، والثاني على وشك الحذف.) */
    if v_codes is not null and v_codes <> '{}' then
      select coalesce(array_agg(c), '{}') into v_codes
        from unnest(v_codes) as c
       where not exists (
         select 1 from products o
          where o.clinic_id = v_clinic and o.id <> v_target and o.id <> dup.id
            and (inv_norm_code(o.barcode) = inv_norm_code(c)
                 or exists (select 1 from unnest(coalesce(o.alt_codes,'{}')) x where inv_norm_code(x) = inv_norm_code(c))));
    end if;

    delete from products where id = dup.id and clinic_id = v_clinic;
    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
-- -0253     update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
    -- 0253: رصيدُ التوأم كلُّه ولو سالباً. الحصرتان كانتا تمحوان عجزَه، ثمّ يطرحه الفكُّ (0197) فيزيد -- +0253
    -- الأصلُ بما لم يكن: ٣ + (−١) كان ٣ وفكُّه ٤، وهو ٢ وفكُّه ٣. -- +0253
    update products set stock = coalesce(stock,0) + coalesce(dup.stock,0), -- +0253
      barcode = coalesce(nullif(barcode,''), dup.barcode),
      alt_codes = coalesce(v_codes, '{}'),
      expiry_date = coalesce(expiry_date, dup.expiry_date),
      image_path = coalesce(nullif(image_path, ''), nullif(dup.image_path, '')),
      store_desc = coalesce(nullif(store_desc, ''), nullif(dup.store_desc, ''))
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end  $function$;
revoke all on function public.inventory_tidy_uncat() from public, anon;
grant execute on function public.inventory_tidy_uncat() to authenticated;

-- ── ٧) دفترُ الرصيد يسمّي التحويل — نصّا 0290 حرفاً وفوقهما أسطرٌ معلَّمة ─────────────────────────────
create or replace function public._stock_ledger_source(p_chain text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(
    (select u.n from unnest(string_to_array(coalesce(p_chain, ''), '>')) with ordinality as u(n, ord)
      where u.n = any (array[
        'stock_count_decide', 'stock_count_submit', 'stock_count_submit_seen', 'stock_waste_submit',
        'merge_products', 'inventory_tidy_uncat', 'restore_product', 'delete_product',
        'pool_product', 'restore_company', 'restore_company_section', 'merge_companies', 'merge_company_sections',
        'poultry_consume', 'poultry_unconsume',
        'purchase_record_once', 'record_purchase', 'record_purchase_fx', 'update_purchase', 'update_purchase_fx',
        'lot_add_once', 'lot_add',
        'retail_checkout', 'retail_checkout_fx', 'retail_checkout_doses', 'mixed_checkout', 'usd_checkout', 'pos_checkout', 'store_accept_order',
        'return_invoice_items_once', 'return_invoice_items', 'retail_return', 'credit_stock', 'old_debt_return',
        'return_expired',   -- 0289: الراجعُ الإكسباير — باسمه ولو نوديت من غلاف -- +0290
        'product_unit_change',   -- 0294: تحويلُ وحدة المادّة — رصيدُها بالوحدة الجديدة -- +0294
        'refund_invoice', 'delete_invoice', 'edit_invoice_lines', 'edit_invoice_lines_unguarded'])
      order by u.ord limit 1),
    nullif(split_part(coalesce(p_chain, ''), '>', 1), ''),
    'direct')
$$;
revoke all on function public._stock_ledger_source(text) from public, anon, authenticated;

create or replace function public._stock_ledger_kind(p_op text, p_source text, p_chain text, p_delta numeric)
returns text
language sql immutable set search_path = public as $$
  -- الترتيبُ قرار: عملياتُ المادّة نفسِها (جرد، دمج، حذف، طيّ، شراء) قبل فحص المستهلكات — دمجٌ يطوي مرحَّلَ
  -- المستهلكات (products_trash_consumption ⇒ _stock_post) يبقى «دمجاً» لا «مستهلكات».
  select case
    when p_op = 'checkpoint' then 'checkpoint'
    when p_source = 'direct' then (case when p_op = 'insert' then 'open' when p_op = 'delete' then 'delete' else 'manual' end)
    when p_source in ('stock_count_decide', 'stock_count_submit', 'stock_count_submit_seen') then 'count'
    when p_source = 'stock_waste_submit' then 'waste'
    when p_source in ('merge_products', 'inventory_tidy_uncat') then 'merge'
    when p_source = 'restore_product' then 'restore'
    when p_source = 'delete_product' then 'delete'
    when p_source in ('pool_product', 'restore_company', 'restore_company_section', 'merge_companies', 'merge_company_sections') then 'pool'
    when p_source in ('poultry_consume', 'poultry_unconsume') then 'farm'
    when p_source in ('record_purchase', 'record_purchase_fx', 'purchase_record_once') then 'purchase'
    when p_source in ('update_purchase', 'update_purchase_fx') then 'purchase_edit'
    when p_source in ('lot_add', 'lot_add_once') then 'lot'
    -- 0289: الراجعُ الإكسباير رجع للرفّ — «إرجاع» (كان «other» فقالت الشاشةُ «عملية بالنظام»). قبل فحص المستهلكات: -- +0290
    -- عمليةُ المادّة نفسِها كالجرد والشراء. -- +0290
    when p_source = 'return_expired' then 'return' -- +0290
    -- 0294: تحويلُ الوحدة — الفرقُ ليس بضاعةً دخلت أو خرجت، الرقمُ نفسُه بوحدةٍ أخرى. -- +0294
    when p_source = 'product_unit_change' then 'unit' -- +0294
    when coalesce(p_chain, '') ~ '(_stock_post|consumption)' then (case when p_delta > 0 then 'consume_return' else 'consume' end)
    when p_source in ('retail_checkout', 'retail_checkout_fx', 'retail_checkout_doses', 'mixed_checkout', 'usd_checkout',
                      'pos_checkout', 'store_accept_order') then (case when p_delta > 0 then 'return' else 'sale' end)
    when p_source in ('return_invoice_items', 'return_invoice_items_once', 'retail_return', 'credit_stock', 'old_debt_return') then 'return'
    when p_source = 'refund_invoice' then 'refund'
    when p_source = 'delete_invoice' then 'invoice_delete'
    when p_source in ('edit_invoice_lines', 'edit_invoice_lines_unguarded') then 'invoice_edit'
    else 'other'
  end
$$;
revoke all on function public._stock_ledger_kind(text, text, text, numeric) from public, anon;
grant execute on function public._stock_ledger_kind(text, text, text, numeric) to authenticated;

reset lock_timeout;
