-- ============================================================================
-- ٠٢٣٣ — تصنيفاتُ المتجر: العيادةُ تصنع تصنيفاتها وتضع بها ما تشاء (طلبُ المالك، ١٢/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- «تصنيفاتُ» المتجر اليوم هي الأصنافُ الخمسةُ الثابتة لعمود `products.category`
-- (دواء/غذاء/مستلزمات/مستهلكات/أخرى) — قائمةٌ لا تملكها العيادة، ولا تُرتَّب، ولا
-- تحمل مادّةً بصنفين. والمقيسُ بالإنتاج: ٨٤٪ من المعروض بلا صنفٍ أصلاً، فالشريطُ
-- يُبنى بالمتصفّح من الصفحات المحمَّلة وحدَها ويُخفي نفسَه — فقرّرت ت١٢ ألّا تصفّحَ
-- بالتصنيف. والمالكُ قال غيرَ ذلك (O1–O3):
--   • المادّةُ تكون بأكثر من تصنيف (كثيرٌ لكثير)؛
--   • الأصنافُ الخمسةُ تصير تصنيفاتِ البداية — حقيقيّةً بأعضائها — والعيادةُ تسمّي
--     وتخفي وتشيل وتضيف غيرَها؛ والشيلُ أرشفةٌ تُسترجَع لا محوٌ (درسُ 0145)؛
--   • المصوّرُ يفتح أيَّ تصنيفٍ ويؤشّر ويشيل أعضاءَه، والبنيةُ والترتيبُ للمدير والطبيب.
--
-- ── الشكل ────────────────────────────────────────────────────────────────
-- • ثلاثةُ جداول محجوبةٌ كلّياً (RLS بلا سياسة، والصلاحياتُ منزوعة): بابُ قراءةٍ
--   `store_categories_list()` لا يكتب أبداً، وبابُ كتابةٍ `store_categories_apply()` —
--   كلاهما definer يسأل العيادةَ والدورَ بنفسه. لأن المصوّرَ يكتب العضويةَ لا البنية،
--   والسياسةُ لا تفرّق بين «أضف مادّة» و«سمِّ تصنيفاً» على نفس الجدول.
-- • الكتابةُ عملياتٌ نسبيّة («بعد فلان») تحت قفلٍ استشاريٍّ للعيادة، بختم العيادة
--   (`clinic_switched` — درسُ 0153)، بمعاملةٍ واحدة. والموضعُ يحسبه الخادم كـ0229،
--   ومرآتُه `applyOps` بـsrc/lib/storeCatIndex.ts ويفحص تطابقَهما store-cats-parity.
-- • **العضويةُ بلا مفتاحٍ أجنبيّ للمنتج — عمداً.** `delete_product` وحارسُ 0146 والحذفُ
--   المباشر يُخرجون الصفَّ من `products`؛ مفتاحٌ بـcascade كان سيمحو عضويته معه، ثم
--   `restore_product` (0197) يعيد **نفسَ المعرّف** فيرجع المنتجُ بلا تصنيفاته — «اختفى كأنه
--   ما كان». بلا مفتاح: الصفُّ يبقى نائماً ويصحو مع الاسترجاع بلا سطرٍ بجسمه. والمتجرُ
--   يربط العضويةَ بالمنتجات بنفس العيادة دائماً، فالنائمُ لا يُرى.
-- • الدمجُ (`merge_products`، و`inventory_tidy_uncat` 0184) يكتب `products_trash.merged_into`
--   **قبل** أن يحذف التوأم؛ فمحفّزٌ AFTER DELETE على `products` يقرؤه وينسخ عضويةَ التوأم
--   للأصل (`on conflict do nothing`). وفكُّ الدمج لا يشيل شيئاً من الأصل: عضويةٌ زائدةٌ
--   ظاهرةٌ تُصلَح بضغطة، وعضويةٌ ضائعةٌ لا يعرف بها أحد.
-- • البذرةُ بالخادم وحده، مرّةً لكلّ عيادة بدفتر `store_categories_seeded`: هذه الهجرةُ
--   للمتاجر القائمة، ومحفّزُ إنشاء المتجر لمن يفتحه لاحقاً، وعمليةُ `init` الصريحة. لا
--   بذرةَ بقراءةٍ ولا بمرطِّبٍ بالمتصفّح (0153). والدفترُ يمنع إعادةَ ما شالته العيادة.
--   أعضاءُ البذرة مادّةُ الصنف (ظاهرةً أم لا، بلا منتجات الحقول)؛ وبلا صنفٍ يبقى تحت «الكل».
-- • التدقيقُ: التسميةُ والأيقونةُ والإخفاءُ والأرشفةُ تُكتب، والسحبُ لا؛ وشيلُ مادّةٍ من
--   تصنيفٍ يُكتب — هو حدثُ «اختفى» الذي يجب أن يُتتبَّع.
--
-- ⚠ الفهرسُ الفريد على `search_norm(name)`: أيُّ هجرةٍ تعيد تعريفَ `search_norm` لازم تكتب
--   `reindex index public.store_categories_name_uq` (db-guard: norm-reindex) — كـ0229.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0232.
-- تراجع: drop trigger store_cats_follow_merge on products; drop trigger store_cats_on_store_insert
--   on store_profiles; drop function store_categories_apply(uuid, jsonb), store_categories_list(),
--   store_cats_follow_merge(), store_cats_on_store_insert(), _store_cats_seed(uuid),
--   _store_cat_slot(uuid, uuid, boolean, uuid), _store_item_slot(uuid, uuid, uuid, boolean, uuid);
--   ثم أعد api_gate من 0228 وaudit_kind من 0227. الجداولُ تبقى (لا يقرؤها غيرُ هذه الدوالّ).
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الجداول ─────────────────────────────────────────────────────────────
create table if not exists public.store_categories (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  -- مفتاحٌ من قائمةٍ ثابتة يُرسم رمزاً بالواجهة (STORE_CAT_ICONS بـstoreLib.ts) — لا صورةَ ولا نصّ.
  icon        text not null default 'tag'
              check (icon in ('paw','dog','cat','bird','fish','rabbit','pill','syringe','food','bone','toy','bottle','bath','comb','bag','tag','star','gift','new','heart')),
  hidden      boolean not null default false,
  pos         bigint,
  archived_at timestamptz,
  -- من أيّ صنفٍ ثابتٍ بُذر (البذرةُ وحدها تكتبه) — لاقتراح «مواد صنفها كذا وما بهذا التصنيف».
  seed_key    text check (seed_key in ('medicine','food','accessories','consumables','other')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint store_categories_pos_ck check ((archived_at is null) = (pos is not null)),
  constraint store_categories_clinic_id_uq unique (clinic_id, id)
);

-- تصنيفٌ حيٌّ واحد لكلّ اسمٍ بالعيادة، بنفس تطبيع searchable() بالواجهة.
-- ⚠ إعادةُ تعريف search_norm ⇒ reindex index public.store_categories_name_uq (db-guard).
create unique index if not exists store_categories_name_uq
  on public.store_categories (clinic_id, search_norm(name)) where archived_at is null;
create unique index if not exists store_categories_seed_uq
  on public.store_categories (clinic_id, seed_key) where seed_key is not null;
create index if not exists store_categories_pos_ix
  on public.store_categories (clinic_id, pos) where archived_at is null;

create table if not exists public.store_category_items (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null,
  category_id uuid not null,
  -- بلا مفتاحٍ أجنبيّ للمنتج **عمداً** (0145/0146/0211): الصفُّ يبقى نائماً حين يُطوى المنتج،
  -- ويصحو مع restore_product بنفس المعرّف. القراءةُ تربطه بالمنتج بنفس العيادة دائماً.
  product_id  uuid not null,
  pos         bigint not null,
  added_at    timestamptz not null default now(),
  constraint store_category_items_uq unique (category_id, product_id),
  constraint store_category_items_cat_fk foreign key (clinic_id, category_id)
    references public.store_categories (clinic_id, id) on delete cascade
);
comment on column public.store_category_items.product_id is
  'بلا مفتاحٍ أجنبيّ عمداً (0233 مع 0145/0146/0211): المنتجُ المطويّ يترك عضويتَه نائمةً فتصحو مع restore_product بنفس المعرّف.';
-- يغطّي المفتاحَ (clinic_id, category_id) والقائمةَ المرتَّبة معاً.
create index if not exists store_category_items_order_ix
  on public.store_category_items (clinic_id, category_id, pos);
create index if not exists store_category_items_product_ix
  on public.store_category_items (clinic_id, product_id);

-- دفترُ البذرة: صفٌّ = هذه العيادةُ بُذرت مرّة، فلا تُبذر ثانيةً ولا يرجع ما شالته.
create table if not exists public.store_categories_seeded (
  clinic_id uuid primary key references auth.users(id) on delete cascade,
  seeded_at timestamptz not null default now()
);

alter table public.store_categories        enable row level security;
alter table public.store_category_items    enable row level security;
alter table public.store_categories_seeded enable row level security;
revoke all on table public.store_categories        from public, anon, authenticated;
revoke all on table public.store_category_items    from public, anon, authenticated;
revoke all on table public.store_categories_seeded from public, anon, authenticated;
comment on table public.store_categories is
  'RLS-DENY-ALL-BY-DESIGN — تصنيفاتُ المتجر (0233) تُقرأ وتُكتب من store_categories_list / store_categories_apply ودوالّ الواجهة العامة وحدها. سياسةٌ هنا تتخطّى فحصَ العيادة والدور والختم.';
comment on table public.store_category_items is
  'RLS-DENY-ALL-BY-DESIGN — عضويةُ تصنيفات المتجر (0233) تُقرأ وتُكتب من store_categories_list / store_categories_apply ودوالّ الواجهة العامة وحدها. سياسةٌ هنا تتخطّى فحصَ العيادة والدور والختم.';
comment on table public.store_categories_seeded is
  'RLS-DENY-ALL-BY-DESIGN — دفترُ بذرة تصنيفات المتجر (0233): تكتبه _store_cats_seed وحدها مرّةً لكلّ عيادة.';

-- ── ٢) الحارس: الاسمُ مطويُّ الفراغات وغيرُ فارغٍ بالتطبيع ───────────────────
-- invoker: الكتابةُ كلُّها من دوالّ المالك، والحارسُ يحرس الشكلَ لا الصلاحية.
-- والطيُّ بـ[ \t\r\n] صراحةً لا \s: مرآتُه بالواجهة حرفاً بحرف (normCatName).
create or replace function public.store_categories_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '[ \t\r\n]+', ' ', 'g'));
  if search_norm(new.name) = '' or char_length(new.name) > 40 then
    raise exception 'store_cat_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists store_categories_guard on public.store_categories;
create trigger store_categories_guard before insert or update on public.store_categories
  for each row execute function public.store_categories_guard();

-- ── ٣) شرطُ «معروضٌ بالمتجر» بموضعٍ واحد ──────────────────────────────────
-- نفسُ شرط store_catalog (0188/0212) حرفاً: ظاهرٌ، وسعرُه فوق الصفر، وغيرُ منتهٍ ببغداد.
-- تستعمله عدّاتُ store_front وstore_catalog_in (0234) وstore_categories_list؛ والحزمةُ
-- تربطه بشرط store_catalog المضمَّن (كلُّ معرّفٍ هنا موجودٌ هناك).
create or replace function public._store_listed(p_visible boolean, p_price numeric, p_expiry date)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_visible, false)
     and coalesce(p_price, 0) > 0
     and (p_expiry is null or p_expiry >= (now() at time zone 'Asia/Baghdad')::date)
$$;
revoke all on function public._store_listed(boolean, numeric, date) from public;
grant execute on function public._store_listed(boolean, numeric, date) to anon, authenticated;

-- ── ٤) البذرة: الأصنافُ الخمسةُ تصير تصنيفاتِ العيادة، مرّةً واحدة ──────────────
-- p_clinic = null ⇒ كلُّ عيادةٍ لها متجر. الأسماءُ نصوصُ storeLib (LOOKS) التي يراها الزبونُ
-- اليوم، والترتيبُ: المعروضُ أكثرَ أوّلاً، ثم الأكثرُ مادّةً، ثم ترتيبُ الأصناف. والأعضاءُ
-- كلُّ مادّةٍ بالصنف (ظاهرةً أم لا) بلا منتجات الحقول، بترتيب الاسم. اسمٌ له توأمٌ حيٌّ يُتخطّى.
-- لا تُنادى من الواجهة: منزوعةٌ عن كلّ دور، وأبوابُها الهجرةُ والمحفّزُ وinit.
create or replace function public._store_cats_seed(p_clinic uuid default null)
returns int
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_clinic uuid;
  v_done   int := 0;
begin
  for v_clinic in
    select x.c
      from (select p_clinic as c where p_clinic is not null
            union
            select sp.clinic_id from store_profiles sp where p_clinic is null) x
     where x.c is not null
       and not exists (select 1 from store_categories_seeded s where s.clinic_id = x.c)
  loop
    perform pg_advisory_xact_lock(hashtextextended('store_cats:' || v_clinic::text, 0));
    continue when exists (select 1 from store_categories_seeded s where s.clinic_id = v_clinic);

    insert into store_categories (clinic_id, name, icon, pos, seed_key)
    select v_clinic, r.name, r.icon, 1024 * r.rk, r.seed_key
      from (select k.seed_key, k.name, k.icon,
                   row_number() over (order by k.n_listed desc, k.n_total desc, k.ord) as rk
              from (select d.seed_key, d.name, d.icon, d.ord,
                           (select count(*) from products p
                             where p.clinic_id = v_clinic and p.farm_id is null and p.category = d.seed_key
                               and _store_listed(p.store_visible, p.sell_price, p.expiry_date)) as n_listed,
                           (select count(*) from products p
                             where p.clinic_id = v_clinic and p.farm_id is null and p.category = d.seed_key) as n_total
                      from (values ('medicine', 'أدوية', 'pill', 1),
                                   ('food', 'أغذية', 'food', 2),
                                   ('accessories', 'مستلزمات', 'toy', 3),
                                   ('consumables', 'مستهلكات', 'bottle', 4),
                                   ('other', 'منوعات', 'bag', 5)) as d(seed_key, name, icon, ord)
                     where not exists (select 1 from store_categories c
                                        where c.clinic_id = v_clinic and c.archived_at is null
                                          and search_norm(c.name) = search_norm(d.name))) k) r
    on conflict do nothing;

    insert into store_category_items (clinic_id, category_id, product_id, pos)
    select v_clinic, c.id, p.id, 1024 * row_number() over (partition by c.id order by p.name, p.id)
      from store_categories c
      join products p on p.clinic_id = v_clinic and p.farm_id is null and p.category = c.seed_key
     where c.clinic_id = v_clinic and c.seed_key is not null and c.archived_at is null
    on conflict (category_id, product_id) do nothing;

    insert into store_categories_seeded (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;
revoke all on function public._store_cats_seed(uuid) from public, anon, authenticated;

-- ── ٥) الموضع — مرآتُه slot() بـstoreCatIndex.ts ─────────────────────────────
-- «بعد»: غائبٌ = آخرُ القائمة، null = أوّلُها، معرّفٌ = منتصفُ الفجوة بعده؛ وفجوةٌ أقلُّ من ٢
-- ترقّم القائمةَ كلَّها ×١٠٢٤ بترتيبها (pos ثم المعرّف) ثم يُعاد الحساب مرّةً — كـ0229.
create or replace function public._store_cat_slot(p_clinic uuid, p_self uuid, p_has boolean, p_after uuid)
returns bigint
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_apos bigint;
  v_next bigint;
  v_try  int;
begin
  for v_try in 1..2 loop
    if not p_has then
      return (select coalesce(max(c.pos), 0) + 1024 from store_categories c
               where c.clinic_id = p_clinic and c.archived_at is null and c.id is distinct from p_self);
    elsif p_after is null then
      return (select coalesce(min(c.pos), 1024) - 1024 from store_categories c
               where c.clinic_id = p_clinic and c.archived_at is null and c.id is distinct from p_self);
    end if;
    select c.pos into v_apos from store_categories c
     where c.id = p_after and c.clinic_id = p_clinic and c.archived_at is null;
    if not found or p_after = p_self then
      raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
    end if;
    select min(c.pos) into v_next from store_categories c
     where c.clinic_id = p_clinic and c.archived_at is null and c.id is distinct from p_self and c.pos > v_apos;
    if v_next is null then return v_apos + 1024; end if;
    if v_next - v_apos >= 2 then return floor((v_apos + v_next)::numeric / 2)::bigint; end if;
    exit when v_try = 2;
    update store_categories c set pos = s.rn * 1024
      from (select x.id, row_number() over (order by x.pos, x.id) as rn
              from store_categories x where x.clinic_id = p_clinic and x.archived_at is null) s
     where c.id = s.id and c.clinic_id = p_clinic and c.pos is distinct from s.rn * 1024;
  end loop;
  raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
end $$;
revoke all on function public._store_cat_slot(uuid, uuid, boolean, uuid) from public, anon, authenticated;

-- نفسُه لموادّ تصنيفٍ واحد (المعرّفُ معرّفُ المنتج). كلُّ صفوف التصنيف تُحسب — النائمةُ
-- كذلك، فترجع بمكانها النسبيّ إن صحت.
create or replace function public._store_item_slot(p_clinic uuid, p_cat uuid, p_self uuid, p_has boolean, p_after uuid)
returns bigint
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_apos bigint;
  v_next bigint;
  v_try  int;
begin
  for v_try in 1..2 loop
    if not p_has then
      return (select coalesce(max(m.pos), 0) + 1024 from store_category_items m
               where m.clinic_id = p_clinic and m.category_id = p_cat and m.product_id is distinct from p_self);
    elsif p_after is null then
      return (select coalesce(min(m.pos), 1024) - 1024 from store_category_items m
               where m.clinic_id = p_clinic and m.category_id = p_cat and m.product_id is distinct from p_self);
    end if;
    select m.pos into v_apos from store_category_items m
     where m.clinic_id = p_clinic and m.category_id = p_cat and m.product_id = p_after;
    if not found or p_after = p_self then
      raise exception 'store_item_gone' using hint = 'مادة ما عادت موجودة أو تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
    end if;
    select min(m.pos) into v_next from store_category_items m
     where m.clinic_id = p_clinic and m.category_id = p_cat and m.product_id is distinct from p_self and m.pos > v_apos;
    if v_next is null then return v_apos + 1024; end if;
    if v_next - v_apos >= 2 then return floor((v_apos + v_next)::numeric / 2)::bigint; end if;
    exit when v_try = 2;
    update store_category_items m set pos = s.rn * 1024
      from (select x.id, row_number() over (order by x.pos, x.product_id) as rn
              from store_category_items x where x.clinic_id = p_clinic and x.category_id = p_cat) s
     where m.id = s.id and m.clinic_id = p_clinic and m.pos is distinct from s.rn * 1024;
  end loop;
  raise exception 'store_item_gone' using hint = 'مادة ما عادت موجودة أو تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
end $$;
revoke all on function public._store_item_slot(uuid, uuid, uuid, boolean, uuid) from public, anon, authenticated;

-- ── ٦) القراءة: لا تكتب أبداً ──────────────────────────────────────────────
-- الختمُ (`clinic`) هو ما ترسله كلُّ كتابةٍ بعدها. و`can_edit` مرآةُ فحص الكتابة: المديرُ
-- (والمرفوعُ بالـPIN ومشغّلُ المنصّة) والطبيبُ — والمصوّرُ لا ولو رُفع (دورُه الأساس).
-- n = الأعضاءُ الموجودون، وn_listed = منهم ما يراه الزبون. والأعضاءُ بترتيب العيادة.
create or replace function public.store_categories_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_edit   boolean;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if not staff_can('manageStore') then
    raise exception 'not_authorized' using errcode = '42501', hint = 'إدارة المتجر مو من صلاحيتك — اطلبها من مدير العيادة.';
  end if;
  v_edit := auth_role() in ('manager', 'veterinarian') and not is_photographer();
  return jsonb_build_object(
    'clinic', v_clinic,
    'seeded', exists (select 1 from store_categories_seeded s where s.clinic_id = v_clinic),
    'can_edit', v_edit,
    'cats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'icon', c.icon, 'hidden', c.hidden, 'pos', c.pos,
               'archived_at', c.archived_at, 'seed_key', c.seed_key,
               'n', coalesce(x.n, 0), 'n_listed', coalesce(x.n_listed, 0))
             order by (c.archived_at is not null), c.pos, c.archived_at desc, c.id)
        from store_categories c
        left join lateral (
          select count(*) as n,
                 count(*) filter (where _store_listed(p.store_visible, p.sell_price, p.expiry_date)) as n_listed
            from store_category_items m
            join products p on p.id = m.product_id and p.clinic_id = v_clinic and p.farm_id is null
           where m.category_id = c.id and m.clinic_id = v_clinic) x on true
       where c.clinic_id = v_clinic), '[]'::jsonb),
    'members', coalesce((
      select jsonb_object_agg(g.category_id, g.ids)
        from (select m.category_id, jsonb_agg(m.product_id order by m.pos, m.product_id) as ids
                from store_category_items m
                join products p on p.id = m.product_id and p.clinic_id = v_clinic and p.farm_id is null
               where m.clinic_id = v_clinic
               group by m.category_id) g), '{}'::jsonb));
end $$;
revoke all on function public.store_categories_list() from public, anon;
grant execute on function public.store_categories_list() to authenticated;

-- ── ٧) الكتابة: بابٌ واحد، بالترتيب، بمعاملةٍ واحدة ──────────────────────────
-- p_ops: [{op, ...}] — البنيةُ (للمدير والطبيب بإذن المتجر):
--   init                         البذرةُ إن لم تُبذر العيادة (وإلا لا شيء)
--   create {id, name, icon?, after?}  معرّفٌ موجودٌ بالعيادة = لا شيء (إعادةٌ آمنة)
--   edit {id, name?, icon?}   hide {id, hidden}   archive {id}   restore {id} (لآخر القائمة)
--   move {id, after}          move_item {cat, id, after}
-- والعضويةُ (لكلّ من له إذن المتجر — المصوّرُ منهم):
--   add {cat, ids[], after?}  الموجودُ يُتجاهل، والجديدُ بالترتيب المرسَل (أو كتلةً بعد عضو)
--   remove {cat, ids[]}       بلا أثرٍ ثانٍ
-- أيُّ رفضٍ بمنتصف الدفعة يُلغيها كلَّها. وترجع لقطةَ store_categories_list().
create or replace function public.store_categories_apply(p_clinic uuid, p_ops jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_uuid   constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_icons  constant text[] := array['paw','dog','cat','bird','fish','rabbit','pill','syringe','food','bone','toy','bottle','bath','comb','bag','tag','star','gift','new','heart'];
  v_clinic uuid := auth_clinic();
  v_edit   boolean;
  o        jsonb;
  v_op     text;
  v_id     uuid;
  v_cat    uuid;
  v_after  uuid;
  v_has    boolean;
  v_name   text;
  v_icon   text;
  v_pos    bigint;
  v_twin   text;
  v_ids    uuid[];
  v_pid    uuid;
  v_n      int;
  v_new    int;
  v_total  int;
  v_owner  uuid;
  v_bad    boolean;
  r        record;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة — حدّث الصفحة. ما انحفظ شي.';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  select coalesce(sum(case when jsonb_typeof(e.value -> 'ids') = 'array' then jsonb_array_length(e.value -> 'ids') else 0 end), 0)
    into v_total from jsonb_array_elements(p_ops) as e(value);
  if v_total > 2000 then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  if not staff_can('manageStore') then
    raise exception 'not_authorized' using errcode = '42501', hint = 'إدارة المتجر مو من صلاحيتك — اطلبها من مدير العيادة.';
  end if;
  v_edit := auth_role() in ('manager', 'veterinarian') and not is_photographer();

  -- جهازان بنفس العيادة يتسلسلان: الموضعُ يُحسب على آخر ما كُتب لا على لقطةٍ قديمة.
  perform pg_advisory_xact_lock(hashtextextended('store_cats:' || v_clinic::text, 0));

  for o in select e.value from jsonb_array_elements(p_ops) with ordinality as e(value, i) order by e.i loop
    if jsonb_typeof(o) <> 'object' then
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
    v_op := case when jsonb_typeof(o -> 'op') = 'string' then o ->> 'op' end;
    if v_op is null or not (v_op = any (array['init','create','edit','hide','archive','restore','move','move_item','add','remove'])) then
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
    if v_op <> 'add' and v_op <> 'remove' and not v_edit then
      raise exception 'not_authorized' using errcode = '42501', hint = 'تسمية وترتيب التصنيفات للمدير والطبيب';
    end if;

    -- (أ) قراءةُ الحقول — شكلٌ خاطئ ⇒ bad_ops قبل أيّ فحصٍ آخر (مرآتُها parseOp)
    v_id := null; v_cat := null; v_after := null; v_has := false; v_ids := null;
    if v_op in ('create','edit','hide','archive','restore','move','move_item') then
      v_id := case when jsonb_typeof(o -> 'id') = 'string' and (o ->> 'id') ~ c_uuid then (o ->> 'id')::uuid end;
      if v_id is null then raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.'; end if;
    end if;
    if v_op in ('move_item','add','remove') then
      v_cat := case when jsonb_typeof(o -> 'cat') = 'string' and (o ->> 'cat') ~ c_uuid then (o ->> 'cat')::uuid end;
      if v_cat is null then raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.'; end if;
    end if;
    if v_op in ('add','remove') then
      if coalesce(jsonb_typeof(o -> 'ids'), '') <> 'array' then
        raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
      end if;
      -- التحويلُ داخل case: عنصرٌ ليس معرّفاً لا يصل `::uuid` فلا يرمي 22P02 بدل bad_ops.
      select bool_or(not (jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') ~ c_uuid)),
             array_agg(case when jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') ~ c_uuid
                            then (x.value #>> '{}')::uuid end order by x.i)
        into v_bad, v_ids
        from jsonb_array_elements(o -> 'ids') with ordinality as x(value, i);
      if coalesce(v_bad, false) then
        raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
      end if;
      v_ids := coalesce(v_ids, '{}'::uuid[]);
    end if;
    if v_op in ('create','move','move_item','add') and (o ? 'after') then
      v_has := true;
      if jsonb_typeof(o -> 'after') = 'null' then
        v_after := null;
      elsif jsonb_typeof(o -> 'after') = 'string' and (o ->> 'after') ~ c_uuid then
        v_after := (o ->> 'after')::uuid;
      else
        raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
      end if;
    end if;
    if v_op in ('move','move_item') and not v_has then
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
    if v_op = 'hide' and coalesce(jsonb_typeof(o -> 'hidden'), '') <> 'boolean' then
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;

    -- (ب) العملية
    if v_op = 'init' then
      perform _store_cats_seed(v_clinic);

    elsif v_op = 'create' then
      -- أوّلُ تصنيفٍ لعيادةٍ لم تُبذر: البذرةُ أوّلاً، فلا تُبذر بعده فوقه.
      if not exists (select 1 from store_categories_seeded s where s.clinic_id = v_clinic) then
        perform _store_cats_seed(v_clinic);
      end if;
      select c.clinic_id into v_owner from store_categories c where c.id = v_id;
      if found then
        if v_owner = v_clinic then continue; end if;   -- جوابٌ ضاع وأُعيد الطلب: لا شيء
        raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
      end if;
      v_name := btrim(regexp_replace(case when jsonb_typeof(o -> 'name') = 'string' then o ->> 'name' else '' end, '[ \t\r\n]+', ' ', 'g'));
      if search_norm(v_name) = '' or char_length(v_name) > 40 then
        raise exception 'store_cat_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
      end if;
      v_icon := case when jsonb_typeof(o -> 'icon') = 'string' then o ->> 'icon' else 'tag' end;
      if not (v_icon = any (c_icons)) then
        raise exception 'store_cat_bad_icon' using hint = 'الأيقونة مو من القائمة — حدّث الصفحة.';
      end if;
      if (select count(*) from store_categories c where c.clinic_id = v_clinic and c.archived_at is null) >= 40 then
        raise exception 'store_cat_full' using hint = 'وصلت ٤٠ تصنيفاً — شيل تصنيف ما تستعمله أوّلاً.';
      end if;
      select c.name into v_twin from store_categories c
       where c.clinic_id = v_clinic and c.archived_at is null and search_norm(c.name) = search_norm(v_name)
       order by c.pos, c.id limit 1;
      if found then
        raise exception 'store_cat_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
      end if;
      v_pos := _store_cat_slot(v_clinic, null, v_has, v_after);
      insert into store_categories (id, clinic_id, name, icon, pos) values (v_id, v_clinic, v_name, v_icon, v_pos);

    elsif v_op = 'edit' then
      select c.name, c.icon into r from store_categories c
       where c.id = v_id and c.clinic_id = v_clinic and c.archived_at is null for update;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_name := case when jsonb_typeof(o -> 'name') = 'string'
                     then btrim(regexp_replace(o ->> 'name', '[ \t\r\n]+', ' ', 'g')) else r.name end;
      v_icon := case when jsonb_typeof(o -> 'icon') = 'string' then o ->> 'icon' else r.icon end;
      if v_name is distinct from r.name then
        if search_norm(v_name) = '' or char_length(v_name) > 40 then
          raise exception 'store_cat_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
        end if;
        select c.name into v_twin from store_categories c
         where c.clinic_id = v_clinic and c.archived_at is null and c.id <> v_id and search_norm(c.name) = search_norm(v_name)
         order by c.pos, c.id limit 1;
        if found then
          raise exception 'store_cat_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
        end if;
      end if;
      if not (v_icon = any (c_icons)) then
        raise exception 'store_cat_bad_icon' using hint = 'الأيقونة مو من القائمة — حدّث الصفحة.';
      end if;
      if (v_name, v_icon) is distinct from (r.name, r.icon) then
        update store_categories set name = v_name, icon = v_icon where id = v_id and clinic_id = v_clinic;
      end if;

    elsif v_op = 'hide' then
      perform 1 from store_categories c where c.id = v_id and c.clinic_id = v_clinic and c.archived_at is null for update;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      update store_categories set hidden = (o ->> 'hidden')::boolean
       where id = v_id and clinic_id = v_clinic and hidden is distinct from (o ->> 'hidden')::boolean;

    elsif v_op = 'archive' then
      select c.archived_at into r from store_categories c where c.id = v_id and c.clinic_id = v_clinic for update;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      -- الأعضاءُ لا يُلمسون: الاسترجاعُ يعيدهم كما كانوا.
      if r.archived_at is null then
        update store_categories set archived_at = now(), pos = null where id = v_id and clinic_id = v_clinic;
      end if;

    elsif v_op = 'restore' then
      select c.name, c.archived_at into r from store_categories c where c.id = v_id and c.clinic_id = v_clinic for update;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      if r.archived_at is not null then
        if (select count(*) from store_categories c where c.clinic_id = v_clinic and c.archived_at is null) >= 40 then
          raise exception 'store_cat_full' using hint = 'وصلت ٤٠ تصنيفاً — شيل تصنيف ما تستعمله أوّلاً.';
        end if;
        select c.name into v_twin from store_categories c
         where c.clinic_id = v_clinic and c.archived_at is null and c.id <> v_id and search_norm(c.name) = search_norm(r.name)
         order by c.pos, c.id limit 1;
        if found then
          raise exception 'store_cat_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
        end if;
        v_pos := _store_cat_slot(v_clinic, v_id, false, null);
        update store_categories set archived_at = null, pos = v_pos where id = v_id and clinic_id = v_clinic;
      end if;

    elsif v_op = 'move' then
      perform 1 from store_categories c where c.id = v_id and c.clinic_id = v_clinic and c.archived_at is null for update;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_pos := _store_cat_slot(v_clinic, v_id, true, v_after);
      update store_categories set pos = v_pos where id = v_id and clinic_id = v_clinic;

    elsif v_op = 'move_item' then
      perform 1 from store_categories c where c.id = v_cat and c.clinic_id = v_clinic and c.archived_at is null;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      perform 1 from store_category_items m where m.clinic_id = v_clinic and m.category_id = v_cat and m.product_id = v_id;
      if not found then
        raise exception 'store_item_gone' using hint = 'مادة ما عادت موجودة أو تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_pos := _store_item_slot(v_clinic, v_cat, v_id, true, v_after);
      update store_category_items set pos = v_pos where clinic_id = v_clinic and category_id = v_cat and product_id = v_id;

    elsif v_op = 'add' then
      perform 1 from store_categories c where c.id = v_cat and c.clinic_id = v_clinic and c.archived_at is null;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      -- كلُّ معرّفٍ منتجٌ لهذه العيادة خارج الحقول — وإلا الدفعةُ كلُّها تُرفض (لا نصفَ قائمة).
      if exists (select 1 from unnest(v_ids) as x(pid)
                  where not exists (select 1 from products p
                                     where p.id = x.pid and p.clinic_id = v_clinic and p.farm_id is null)) then
        raise exception 'store_item_gone' using hint = 'مادة ما عادت موجودة أو تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
      end if;
      select count(*) into v_n from store_category_items m where m.clinic_id = v_clinic and m.category_id = v_cat;
      select count(distinct x.pid) into v_new from unnest(v_ids) as x(pid)
       where not exists (select 1 from store_category_items m
                          where m.clinic_id = v_clinic and m.category_id = v_cat and m.product_id = x.pid);
      if v_n + v_new > 2000 then
        raise exception 'store_cat_members_full' using hint = 'التصنيف وصل ٢٠٠٠ مادة — قسّمه لتصنيفين.';
      end if;
      foreach v_pid in array v_ids loop
        continue when exists (select 1 from store_category_items m
                               where m.clinic_id = v_clinic and m.category_id = v_cat and m.product_id = v_pid);
        v_pos := _store_item_slot(v_clinic, v_cat, null, v_has, v_after);
        insert into store_category_items (clinic_id, category_id, product_id, pos) values (v_clinic, v_cat, v_pid, v_pos);
        -- «بعد عضو»: كتلةٌ بالترتيب المرسَل — الثاني بعد الأوّل لا قبله.
        if v_has then v_after := v_pid; end if;
      end loop;

    elsif v_op = 'remove' then
      perform 1 from store_categories c where c.id = v_cat and c.clinic_id = v_clinic and c.archived_at is null;
      if not found then
        raise exception 'store_cat_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      delete from store_category_items m
       where m.clinic_id = v_clinic and m.category_id = v_cat and m.product_id = any (v_ids);
    end if;
  end loop;

  return store_categories_list();
end $$;
revoke all on function public.store_categories_apply(uuid, jsonb) from public, anon;
grant execute on function public.store_categories_apply(uuid, jsonb) to authenticated;

-- ── ٨) الدمجُ يحمل العضوية ─────────────────────────────────────────────────
-- merge_products وinventory_tidy_uncat يكتبان products_trash.merged_into **قبل** حذف التوأم،
-- فهنا (بعد الحذف) نعرف الأصل وننسخ له عضويةَ التوأم بموضعها. وعضويةُ التوأم نفسُه تبقى
-- نائمةً فيصحو بها إن استُرجع. حذفٌ عاديّ (merged_into فارغ) لا يفعل شيئاً.
create or replace function public.store_cats_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep uuid;
begin
  select t.merged_into into v_keep from products_trash t where t.id = old.id and t.clinic_id = old.clinic_id;
  if v_keep is not null
     and exists (select 1 from products p where p.id = v_keep and p.clinic_id = old.clinic_id) then
    insert into store_category_items (clinic_id, category_id, product_id, pos)
    select i.clinic_id, i.category_id, v_keep, i.pos
      from store_category_items i
     where i.product_id = old.id and i.clinic_id = old.clinic_id
    on conflict (category_id, product_id) do nothing;
  end if;
  return old;
end $$;
revoke all on function public.store_cats_follow_merge() from public, anon, authenticated;
drop trigger if exists store_cats_follow_merge on public.products;
create trigger store_cats_follow_merge after delete on public.products
  for each row execute function public.store_cats_follow_merge();

-- ── ٩) متجرٌ يُفتح لاحقاً يُبذر لحظتَه ────────────────────────────────────────
create or replace function public.store_cats_on_store_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _store_cats_seed(new.clinic_id);
  return new;
end $$;
revoke all on function public.store_cats_on_store_insert() from public, anon, authenticated;
drop trigger if exists store_cats_on_store_insert on public.store_profiles;
create trigger store_cats_on_store_insert after insert on public.store_profiles
  for each row execute function public.store_cats_on_store_insert();

-- ── ١٠) التدقيق ──────────────────────────────────────────────────────────
-- المحتوى وحده: نقلُ الموضع لا يكتب سطراً. وشيلُ مادّةٍ من تصنيف يُكتب سطراً لكلّ مادّة.
drop trigger if exists audit_all on public.store_categories;
create trigger audit_all after insert or update of name, icon, hidden, archived_at on public.store_categories
  for each row execute function audit_change();
drop trigger if exists audit_all on public.store_category_items;
create trigger audit_all after delete on public.store_category_items
  for each row execute function audit_change();

-- نسخةُ 0227 حرفاً إلا سطرَ المتجر: store_categories وstore_category_items نوعُهما 'store'
-- (مرآتُه بـactivityKinds.ts، والحالاتُ بـactivity-cases.json تفحص الاثنين).
create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity = 'price_changes' then 'price_change'
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity in ('expenses','expense_categories') then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_categories','store_category_items') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- ── ١١) البوّابة: البابان بقائمة المصوّر (الجسمُ نسخةُ 0228 حرفاً + سطرهما) ──────────
-- كلٌّ منهما يسأل manageStore بنفسه، والبنيةُ ترفض المصوّرَ بالخادم (can_edit).
create or replace function public.api_gate()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_path  text;
  v_fn    text;
  v_block boolean := false;
begin
  -- الجداولُ يحرسها السياج؛ البوّابةُ للدوالّ وحدها. هذا الفحصُ لا يرمي، فهو خارج كتلة
  -- الاستثناء — فلا معاملةَ فرعيةً لكلّ طلب GET عاديّ.
  v_path := coalesce(current_setting('request.path', true), '');
  if position('/rpc/' in v_path) = 0 then return; end if;
  -- المقطعُ الأخير كاملاً (لا بادئة)؛ وما لا يُقرأ يمضي لسؤال «مصوّر؟» — فيُرفض له وحده.
  v_fn := substring(v_path from '/rpc/([^/?]+)/?$');
  if v_fn = any(array[
    -- الإقلاع والجلسة (لا elevate_with_pin ولا has_override_pin: الرفعُ ليس للمصوّر)
    'my_workspace','presence_beat','get_or_init_subscription','end_elevation','log_client_event',
    'platform_context','leave_clinic','accept_invite','add_my_role','staff_can','is_photographer',
    -- الصور
    'photo_products','set_product_image','image_library_usage','image_path_in_use',
    -- المتجر (كلُّ واحدةٍ تسأل manageStore بنفسها)
    'store_set_visible','store_set_featured','store_set_desc','store_slug_available','store_front',
    'store_set_price',
    -- تصنيفاتُ المتجر (0233): القراءةُ والعضوية — والبنيةُ ترفضه بنفسها
    'store_categories_list','store_categories_apply'
  ]) then
    return;
  end if;
  begin
    v_block := public.is_photographer();
  exception when others then
    return;   -- البوّابةُ لا تُسقط طلبَ أحدٍ بخطئها هي
  end;
  if v_block then
    raise exception 'photographer_forbidden'
      using errcode = '42501', hint = 'هذي العملية مو من صلاحية موظف التصوير.';
  end if;
end $$;
revoke all on function public.api_gate() from public;
grant execute on function public.api_gate() to anon, authenticated, service_role;

comment on function public.store_categories_apply(uuid, jsonb) is
  'الكتابة الوحيدة لتصنيفات المتجر (0233): عمليات نسبيّة بمعاملة واحدة تحت قفل العيادة، والموضع يحسبه الخادم. البنية للمدير والطبيب والعضوية لكلّ من له manageStore. مرآتها applyOps بـstoreCatIndex.ts.';
comment on function public.store_categories_list() is
  'قراءة تصنيفات المتجر وأعضائها (0233) — لا تكتب أبداً، ولا تبذر.';

-- ── ١٢) المتاجرُ القائمة تُبذر الآن (وإعادةُ الهجرة لا تضيف شيئاً — الدفتر) ───────────
select public._store_cats_seed(null);
