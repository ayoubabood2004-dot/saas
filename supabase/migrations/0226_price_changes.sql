-- ============================================================================
-- ٠٢٢٦ — رفعُ الأسعار بنسبة: حسابٌ واحدٌ صحيح، ومن لحظته، ويُرجَع بسعره الأصليّ
--
-- ── الطلب ────────────────────────────────────────────────────────────────
-- «العيادة تريد ترفع سعر منتجاتها بشكل كامل … بنسبة ٢٥٪ أو ٥٠٪ … منتجات بس أو
-- خدمات أو الاثنين أو منتجات معيّنة وتستثني منتجات … ومابي اغلاط بالارقام وما يكون
-- شي عشوائي … ويصير من تاريخ اليوم وما يأثّر على الأسعار السابقة» — ثمّ: «هل نكدر
-- نسوي اعادة للسعر الاصلي؟»
--
-- ── ما قيس قبل البناء (٧/١٠) ─────────────────────────────────────────────
-- ٣٢٢٩ منتجاً بـ١٣ عيادة (أكبرُها ١٠٥٧ — فوق سقف الألف صفّ لكلّ طلب)، و٩٧٨ خدمة.
-- كلُّ العيادات بالدينار. ٩٤٪ من الأسعار مضاعفاتُ ٢٥٠. ٣١ سعرَ مفردٍ مستقلّاً عن
-- العلبة. ١٨٦ مجموعةً (٧٧٧ منتجاً) بسعرٍ واحدٍ بالتصميم. والبيعُ لا يقرأ الكتالوج
-- (`retail_checkout` يأخذ سعرَ الجهاز) والفاتورةُ تحفظ سعرَها — فالماضي محفوظٌ
-- أصلاً، والخطرُ هو الجهازُ الذي ما زال يحمل السعرَ القديم (تعالجه الواجهة).
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- • الحسابُ بالفلوس الصحيحة ونقاطِ الأساس، وقسمةٌ صحيحةٌ بالسقف (`_price_step` +
--   `_price_raise`) — مرآةُ `src/lib/priceRaise.ts` حرفاً بحرف، ويُفحص التطابقُ
--   بالحزمة على الدالّة الأصلية لا نسخةٍ منها.
-- • المعاينةُ وثيقةٌ واحدة (jsonb) بلقطةٍ واحدة، ومعها بصمةُ ما سيُكتب. الحفظُ
--   يعيد الحسابَ تحت القفل ويقارن البصمة: تغيّرٌ بأيّ سعرٍ بينهما ⇒ «المعاينة
--   قديمة» ولا يُكتب شيء. والكتابةُ مقارنةٌ ثمّ تبديل (`col = القديم`) وعددُ
--   الصفوف يُطابَق — نقصُ صفٍّ واحد يُرجع الكلّ.
-- • البيعُ لا يُضحّى به: الصفوفُ تُقفل مسبقاً بترتيب المعرّف وبلا انتظار (NOWAIT
--   بمحاولاتٍ قصيرة)، فالرفعُ لا ينتظر وهو يمسك قفلاً ولا يدخل حلقةَ جمود مع
--   بيعة — يقول «مشغول» ويُعاد، والبيعةُ تمرّ.
-- • الإرجاعُ سطراً سطراً بالمقارنة نفسها (`col = الجديد`): سعرٌ عُدِّل بيدٍ بعد
--   الرفع لا يُداس. ورفعٌ لاحقٌ قائمٌ على نفس المادة يُرجَع أوّلاً (بالسطر لا
--   بحالة الدفعة). والمجموعةُ تُرجَع كلُّها أو لا شيء.
-- • سطرٌ واحد بسجلّ الحركات لكلّ رفعٍ ولكلّ إرجاع — لا ١٠٠٠ «تعديل منتج»: التدقيقُ
--   يتخطّى تعديلَ السعر وحده داخل معاملة الرفع نفسِها (البصمةُ: إعدادُ المعاملة +
--   صفُّ الرفع بمعرّف معاملتها). والسجلُّ الحقيقيّ دائمٌ بجدوليه هنا.
-- • لا يُلمس: سعرُ الشراء، كلفةُ الخدمة، العروض، الأجور، الفواتير، طلباتُ المتجر.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0225.
-- تراجع: drop الدوالّ الجديدة والجدولين والتسلسل، وأعد audit_change من 0152
-- وaudit_kind/purge_audit_log/audit_log_preview من 0210 (لا تمسّ سعراً قائماً).
-- ============================================================================

set lock_timeout = '5s';

create sequence if not exists price_change_seq;

create table if not exists price_changes (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  pct_bp        int not null check (pct_bp between 1 and 10000),
  round_mode    text not null check (round_mode in ('smart', 'fixed')),
  max_step      numeric not null check (max_step > 0 and max_step = round(max_step, 2)),
  currency      text not null,
  spec          jsonb not null,
  plan_hash     text not null,
  -- يسمّي السطرَ بسجلّ الحركات («+25%»).
  title         text not null,
  n_products    int not null default 0,
  n_sub         int not null default 0,
  n_services    int not null default 0,
  n_lines       int not null default 0,
  note          text check (note is null or char_length(note) <= 300),
  created_by    uuid default auth.uid(),
  -- اسمُ من رفع لحظتَها — فارغٌ لمشغّل المنصّة (بالاتفاق: لا أثرَ له عند العيادة).
  created_name  text,
  applied_at    timestamptz not null default now(),
  apply_txid    bigint not null default txid_current(),
  -- ترتيبُ الرفع تحت القفل (لا now(): بدايةُ المعاملة قد تسبق قفلَ رفعٍ آخر).
  apply_seq     bigint not null,
  client_ref    text check (client_ref is null or char_length(client_ref) between 8 and 64),
  status        text not null default 'applied' check (status in ('applied', 'partially_undone', 'undone')),
  undone_at     timestamptz,
  undone_by     uuid,
  undo_reason   text check (undo_reason is null or char_length(undo_reason) <= 300),
  undo_txid     bigint,
  -- عدّادُ الأجهزة: يزيد مع كلّ رفعٍ وكلّ إرجاع — الكاشيرُ يقارنه ليعرف أن الأسعار تغيّرت.
  event_seq     bigint not null,
  last_event_at timestamptz not null default now()
);
create index if not exists price_changes_clinic_idx on price_changes(clinic_id, event_seq desc);
create unique index if not exists price_changes_ref_idx on price_changes(clinic_id, client_ref) where client_ref is not null;

create table if not exists price_change_lines (
  id           uuid primary key default gen_random_uuid(),
  change_id    uuid not null references price_changes(id) on delete cascade,
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('product', 'service')),
  -- بلا مفتاحٍ أجنبيّ عمداً: الاسترجاعُ من السلّة يعيد المنتجَ بنفس المعرّف، والطيُّ يحذف التوأم.
  item_id      uuid not null,
  item_name    text not null,
  field        text not null,
  old_price    numeric not null check (old_price > 0 and old_price = round(old_price, 2)),
  new_price    numeric not null check (new_price > old_price and new_price = round(new_price, 2)),
  step         numeric not null check (step > 0),
  -- مجموعةُ «نفس السعر» لحظةَ الرفع — الإرجاعُ يأخذها كلَّها.
  grp          text,
  undo_outcome text check (undo_outcome in ('restored', 'kept_changed', 'kept_missing')),
  undone_at    timestamptz,
  constraint price_change_lines_field check (
    (kind = 'product' and field in ('sell_price', 'sub_unit_price')) or (kind = 'service' and field = 'price')),
  constraint price_change_lines_once unique (change_id, kind, item_id, field)
);
create index if not exists price_change_lines_item_idx on price_change_lines(clinic_id, item_id);

alter table price_changes enable row level security;
alter table price_change_lines enable row level security;
-- قراءةٌ للعيادة وحدها، ولا سياسةَ كتابة: كلُّ كتابةٍ من دالّةٍ تفحص الدورَ والعيادةَ بنفسها.
drop policy if exists price_changes_select on price_changes;
create policy price_changes_select on price_changes for select
  using (clinic_id = (select auth_clinic()));
drop policy if exists price_change_lines_select on price_change_lines;
create policy price_change_lines_select on price_change_lines for select
  using (clinic_id = (select auth_clinic()));

-- سطرٌ بسجلّ الحركات لكلّ رفعٍ وكلّ إرجاع (السطورُ نفسُها هي السجلّ — لا تُدقَّق).
drop trigger if exists audit_all on price_changes;
create trigger audit_all after insert or update or delete on price_changes
  for each row execute function audit_change();

select public.photographer_fence_table('price_changes');
select public.photographer_fence_table('price_change_lines');

-- ── الحساب (مرآةُ priceRaise.ts) ───────────────────────────────────────────
-- العملاتُ ذاتُ الكسور (مرآةُ `frac` بـcurrency.ts — والحزمةُ تقارن القائمتين).
create or replace function public._price_frac(p_currency text)
returns boolean
language sql
immutable
set search_path = public
as $$ select upper(coalesce(nullif(btrim(p_currency), ''), 'IQD')) in ('KWD', 'BHD', 'OMR', 'JOD', 'TND') $$;

-- سلّمُ الخطوات بالفلوس — كلُّ درجةٍ تقسم التي فوقها (لا انقلابَ بين سعرين).
create or replace function public._price_ladder(p_frac boolean)
returns numeric[]
language sql
immutable
set search_path = public
as $$ select case when p_frac then array[1, 5, 25, 50, 100, 500, 1000]::numeric[]
                  else array[100, 500, 2500, 5000, 25000, 50000, 100000]::numeric[] end $$;

-- الخطوة: «ثابت» = ما اختير. «ذكي» = أكبرُ درجةٍ ≤ السقف يضيف تقريبُها أقلَّ من ربع
-- الزيادة: (الجديد − الخام)·4 < الزيادة — بالفلوس ×١٠٠٠٠ صحيحاً.
create or replace function public._price_step(p_old numeric, p_bp int, p_round text, p_max numeric, p_frac boolean)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_unit numeric := case when p_frac then 1 else 100 end;
  v_old  numeric := round(p_old * 100);
  v_max  numeric := round(p_max * 100);
  v_raw  numeric := v_old * (10000 + p_bp);
  v_inc  numeric := v_old * p_bp;
  v_lad  numeric[] := _price_ladder(p_frac);
  l      numeric;
begin
  if p_round = 'fixed' then return round(greatest(v_max, v_unit) / 100, 2); end if;
  for i in reverse array_length(v_lad, 1) .. 1 loop
    l := v_lad[i];
    if l <= v_max and l >= v_unit
       and (div(v_raw + 10000 * l - 1, 10000 * l) * l * 10000 - v_raw) * 4 < v_inc then
      return round(l / 100, 2);
    end if;
  end loop;
  return round(v_unit / 100, 2);
end $$;

-- السعرُ الجديد: سقفُ (P·(10000+bp)) ÷ (10000·s)، ثمّ ×s — بخانتين بالضبط.
create or replace function public._price_raise(p_old numeric, p_bp int, p_step numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select (div(round(p_old * 100) * (10000 + p_bp) + 10000 * round(p_step * 100) - 1, 10000 * round(p_step * 100))
          * round(p_step * 100) / 100)::numeric(24, 2)
$$;

-- المفردُ × العدد كان ≥ العلبة؟ يبقى كذلك: وإلا رُفع المفردُ لأقلّ مضاعفٍ لخطوته يعيده.
-- (مرآةُ alignSub — العددُ بثلاث خانات ×١٠٠٠.) يُرجع null إن لم يلزم.
create or replace function public._price_align_sub(p_old_box numeric, p_new_box numeric, p_old_sub numeric,
                                                   p_new_sub numeric, p_step numeric, p_units numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  n  numeric := round(coalesce(p_units, 0) * 1000);
  b  numeric := round(p_old_box * 100);
  b2 numeric := round(p_new_box * 100);
  s  numeric := round(p_old_sub * 100);
  s2 numeric := round(p_new_sub * 100);
  st numeric := round(p_step * 100);
  t  numeric;
begin
  if n <= 0 then return null; end if;
  if s * n < b * 1000 then return null; end if;
  if s2 * n >= b2 * 1000 then return null; end if;
  t := div(b2 * 1000 + n - 1, n);
  return (div(t + st - 1, st) * st / 100)::numeric(24, 2);
end $$;

-- ── النطاق ───────────────────────────────────────────────────────────────
create or replace function public._price_jtext(p jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$ select case when jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0
                  then array(select x from jsonb_array_elements_text(p) x where x is not null) end $$;

create or replace function public._price_juuid(p jsonb)
returns uuid[]
language sql
immutable
set search_path = public
as $$ select case when jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0
                  then array(select x::uuid from jsonb_array_elements_text(p) x where x is not null) end $$;

-- منتجاتُ النطاق قبل فرز السعر، ومن دخل مباشرةً لا بمجموعته. المجموعةُ كلُّها أو لا
-- شيء: تدخل إن دخل منها واحد، وتخرج كلُّها إن استُثني منها واحد (الاستثناءُ يغلب).
-- (`not exists` لا `not in`: مجموعةٌ فارغة بقائمة الاستثناء كانت تُفرغ الخطّة كلَّها.)
create or replace function public._price_scope_products(p_clinic uuid, p_spec jsonb)
returns table (id uuid, is_direct boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce((p_spec->>'products')::boolean, false) as on_,
           _price_jtext(p_spec->'p_categories') as cats,
           _price_juuid(p_spec->'p_companies') as cos,
           _price_juuid(p_spec->'p_sections') as secs,
           _price_juuid(p_spec->'p_ids') as ids,
           coalesce(_price_juuid(p_spec->'p_exclude'), '{}') as ex
  ),
  base as (
    select p.id, p.category, p.company_id, p.section_id, nullif(btrim(p.bulk_group), '') as g
      from products p, s
     where s.on_ and p.clinic_id = p_clinic and p.farm_id is null
  ),
  direct as (
    select b.id, b.g from base b, s
     where (s.cats is null or b.category = any (s.cats))
       -- شركةٌ كاملة أو قسمٌ منها: اتّحادٌ لا تقاطع.
       and ((s.cos is null and s.secs is null)
            or (s.cos is not null and b.company_id = any (s.cos))
            or (s.secs is not null and b.section_id = any (s.secs)))
       and (s.ids is null or b.id = any (s.ids))
  ),
  exg as (select distinct b.g from base b, s where b.id = any (s.ex) and b.g is not null),
  ing as (select distinct d.g from direct d where d.g is not null)
  select b.id, exists (select 1 from direct d where d.id = b.id)
    from base b, s
   where not (b.id = any (s.ex))
     and not exists (select 1 from exg where exg.g = b.g)
     and (exists (select 1 from direct d where d.id = b.id) or exists (select 1 from ing where ing.g = b.g))
$$;

create or replace function public._price_scope_services(p_clinic uuid, p_spec jsonb)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce((p_spec->>'services')::boolean, false) as on_,
           _price_juuid(p_spec->'s_categories') as cats,
           _price_juuid(p_spec->'s_ids') as ids,
           coalesce(_price_juuid(p_spec->'s_exclude'), '{}') as ex
  )
  select c.id from clinic_services c, s
   where s.on_ and c.clinic_id = p_clinic
     and not (c.id = any (s.ex))
     and (s.cats is null or c.category_id = any (s.cats))
     and (s.ids is null or c.id = any (s.ids))
$$;

-- رفعٌ قائمٌ (لم يُرجَع) خلال ٣٠ يوماً على هذا الحقل — يُتخطّى إن طُلب.
-- «قائم» بكلّ موضع = سطرٌ بلا حسم **أو «زالت»**: مادةٌ حُذفت ثمّ استُرجعت تعود بسعر الرفع،
-- والإرجاعُ يعيد محاولتَها. عدُّ «زالت» محسوماً كان يُرجع الأقدمَ قبل اللاحق فيضيع الأصل،
-- ويرفعها مرّةً ثانيةً فوق رفعها (أمسكه تدقيقٌ عدائيّ).
create or replace function public._price_recent(p_clinic uuid)
returns table (kind text, item_id uuid, field text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.kind, l.item_id, l.field
    from price_change_lines l join price_changes c on c.id = l.change_id
   where l.clinic_id = p_clinic and c.clinic_id = p_clinic and (l.undo_outcome is null or l.undo_outcome = 'kept_missing')
     and c.applied_at > now() - interval '30 days'
$$;

-- الخطّةُ كاملةً ومعها ما يُتخطّى (`skipped`) ليُعدّ. سطرٌ لكلّ (مادة، حقل) بسعرٍ > صفر.
-- دالّةٌ واحدة للمعاينة والحفظ — حسابٌ واحد. والمفردُ يتبع علبتَه دائماً.
create or replace function public._price_plan_all(p_clinic uuid, p_spec jsonb, p_frac boolean)
returns table (kind text, item_id uuid, field text, item_name text, old_price numeric, new_price numeric,
               step numeric, grp text, via_group boolean, cost numeric, aligned boolean, recent boolean, skipped boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select (p_spec->>'pct_bp')::int as bp,
           coalesce(p_spec->>'round', 'smart') as rnd,
           (p_spec->>'max_step')::numeric as mx,
           coalesce((p_spec->>'skip_recent')::boolean, true) as skip_recent
  ),
  rec as (select * from _price_recent(p_clinic)),
  pr as (
    select p.id, p.name, p.sell_price, p.purchase_price, p.has_sub_unit, p.sub_unit_price, p.units_per_box,
           nullif(btrim(p.bulk_group), '') as g, not sc.is_direct as vg,
           _price_step(p.sell_price, s.bp, s.rnd, s.mx, p_frac) as st,
           exists (select 1 from rec where rec.kind = 'product' and rec.item_id = p.id and rec.field = 'sell_price') as rb,
           exists (select 1 from rec where rec.kind = 'product' and rec.item_id = p.id and rec.field = 'sub_unit_price') as rs
      from _price_scope_products(p_clinic, p_spec) sc
      join products p on p.id = sc.id and p.clinic_id = p_clinic
      cross join s
     where p.sell_price > 0
  ),
  -- «المرفوعُ حديثاً» يُحكم بالوحدة لا بالسطر: المادةُ بعلبتها ومفردها، والمجموعةُ كلُّها.
  -- بالسطر كان عضوٌ انضمّ للمجموعة بعد رفعها (أو كان صفراً يومها) يُرفع وحده فيشقّ الرفَّ
  -- بسعرين، ومفردٌ رُفع وحده يُتخطّى وعلبتُه ترتفع فيصير ×العدد أرخصَ منها (تدقيقٌ عدائيّ).
  pu as (
    select pr.*,
           bool_or(pr.rb or (coalesce(pr.has_sub_unit, false) and coalesce(pr.sub_unit_price, 0) > 0 and pr.rs))
             over (partition by coalesce('g:' || pr.g, 'p:' || pr.id::text)) as ur
      from pr
  ),
  bx as (
    select pu.*, _price_raise(pu.sell_price, s.bp, pu.st) as nb, (s.skip_recent and pu.ur) as bskip
      from pu, s
  ),
  sb as (
    select bx.*, _price_step(bx.sub_unit_price, s.bp, s.rnd, s.mx, p_frac) as sst
      from bx, s
     where bx.has_sub_unit and bx.sub_unit_price > 0
  ),
  sb2 as (select sb.*, _price_raise(sb.sub_unit_price, s.bp, sb.sst) as ns0 from sb, s),
  -- المقارنةُ بما ستصيره العلبةُ فعلاً: علبةٌ تُخطّيت باقيةٌ بسعرها.
  sb3 as (
    select sb2.*, _price_align_sub(sb2.sell_price, case when sb2.bskip then sb2.sell_price else sb2.nb end,
                                   sb2.sub_unit_price, sb2.ns0, sb2.sst, sb2.units_per_box) as al
      from sb2
  ),
  sv as (
    select c.id, c.name, c.price, c.cost, _price_step(c.price, s.bp, s.rnd, s.mx, p_frac) as st,
           exists (select 1 from rec where rec.kind = 'service' and rec.item_id = c.id and rec.field = 'price') as rc
      from _price_scope_services(p_clinic, p_spec) sc
      join clinic_services c on c.id = sc.id and c.clinic_id = p_clinic
      cross join s
     where c.price > 0
  )
  select 'product', bx.id, 'sell_price', bx.name, bx.sell_price::numeric(24, 2), bx.nb, bx.st, bx.g, bx.vg,
         nullif(bx.purchase_price, 0)::numeric, false, bx.rb, bx.bskip
    from bx
  union all
  select 'product', sb3.id, 'sub_unit_price', sb3.name, sb3.sub_unit_price::numeric(24, 2), coalesce(sb3.al, sb3.ns0),
         sb3.sst, sb3.g, sb3.vg,
         case when sb3.units_per_box > 0 and sb3.purchase_price > 0 then round(sb3.purchase_price / sb3.units_per_box, 2) end,
         sb3.al is not null, sb3.rs, sb3.bskip
    from sb3, s
  union all
  select 'service', sv.id, 'price', sv.name, sv.price::numeric(24, 2), _price_raise(sv.price, s.bp, sv.st), sv.st,
         null, false, nullif(sv.cost, 0)::numeric, false, sv.rc, (s.skip_recent and sv.rc)
    from sv, s
$$;

-- ما سيُكتب فعلاً (بلا المتخطّى).
create or replace function public._price_plan(p_clinic uuid, p_spec jsonb, p_frac boolean)
returns table (kind text, item_id uuid, field text, item_name text, old_price numeric, new_price numeric,
               step numeric, grp text, via_group boolean, cost numeric, aligned boolean, recent boolean)
language sql
stable
security definer
set search_path = public
as $$
  select kind, item_id, field, item_name, old_price, new_price, step, grp, via_group, cost, aligned, recent
    from _price_plan_all(p_clinic, p_spec, p_frac) where not skipped
$$;

-- نصُّ البصمة: ما يُكتب فعلاً بالترتيب الثابت (مرآةُ planHashText). الأعلامُ خارجها.
create or replace function public._price_hash_line(p_kind text, p_item uuid, p_field text, p_old numeric, p_new numeric)
returns text
language sql
immutable
set search_path = public
as $$ select p_kind || '|' || p_item::text || '|' || p_field || '|' || p_old::numeric(24, 2)::text || '|' || p_new::numeric(24, 2)::text $$;

-- ── الحارس والتحقّق ──────────────────────────────────────────────────────
create or replace function public._price_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'forbidden' using hint = 'رفعُ الأسعار وإرجاعُها للمدير.';
  end if;
  return v_clinic;
end $$;

create or replace function public._price_currency(p_clinic uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select upper(nullif(btrim(currency), '')) from clinic_prefs where clinic_id = p_clinic), 'IQD') $$;

create or replace function public._price_spec_check(p_spec jsonb, p_frac boolean)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_bp  int;
  v_mx  numeric;
  k     text;
begin
  if jsonb_typeof(p_spec) <> 'object' then raise exception 'bad_spec'; end if;
  begin v_bp := (p_spec->>'pct_bp')::int; exception when others then v_bp := null; end;
  if v_bp is null or v_bp < 1 or v_bp > 10000 then
    raise exception 'bad_pct' using hint = 'النسبةُ لازم بين ٠٫٠١٪ و١٠٠٪ وبمنزلتين على الأكثر.';
  end if;
  if coalesce(p_spec->>'round', 'smart') not in ('smart', 'fixed') then raise exception 'bad_round'; end if;
  begin v_mx := (p_spec->>'max_step')::numeric; exception when others then v_mx := null; end;
  if v_mx is null or not (round(v_mx * 100) = any (_price_ladder(p_frac))) or v_mx * 100 <> round(v_mx * 100) then
    raise exception 'bad_step' using hint = 'خطوةُ التقريب غيرُ معروفة لعملة العيادة.';
  end if;
  if not coalesce((p_spec->>'products')::boolean, false) and not coalesce((p_spec->>'services')::boolean, false) then
    raise exception 'empty_scope' using hint = 'اختر المنتجات أو الخدمات أو الاثنين.';
  end if;
  -- نطاقٌ واحدٌ لكلّ نوع: تقاطعٌ صامتٌ بين «شركة» و«موادّ معيّنة» أسقط ما اختاره المدير بيده.
  if (case when _price_jtext(p_spec->'p_categories') is not null then 1 else 0 end
      + case when _price_jtext(p_spec->'p_companies') is not null or _price_jtext(p_spec->'p_sections') is not null then 1 else 0 end
      + case when _price_jtext(p_spec->'p_ids') is not null then 1 else 0 end) > 1
     or (_price_jtext(p_spec->'s_categories') is not null and _price_jtext(p_spec->'s_ids') is not null) then
    raise exception 'mixed_scope' using hint = 'اختر طريقةً واحدة: الكلّ أو أصناف أو شركات أو موادّ معيّنة.';
  end if;
  foreach k in array array['p_categories', 'p_companies', 'p_sections', 'p_ids', 'p_exclude', 's_categories', 's_ids', 's_exclude'] loop
    if p_spec ? k and jsonb_typeof(p_spec->k) not in ('array', 'null') then raise exception 'bad_spec'; end if;
    if jsonb_typeof(p_spec->k) = 'array' and jsonb_array_length(p_spec->k) > 5000 then raise exception 'too_many'; end if;
  end loop;
end $$;

-- ── المعاينة ─────────────────────────────────────────────────────────────
-- وثيقةٌ واحدة بلقطةٍ واحدة (stable): السطورُ والبصمةُ من نداءٍ واحدٍ للخطّة.
create or replace function public.price_change_preview(p_spec jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := _price_guard();
  v_cur    text := _price_currency(v_clinic);
  v_frac   boolean := _price_frac(v_cur);
  v_bp     int;
  v_out    jsonb;
begin
  perform _price_spec_check(p_spec, v_frac);
  v_bp := (p_spec->>'pct_bp')::int;
  with pa as (select * from _price_plan_all(v_clinic, p_spec, v_frac)),
  ln as (
    select pa.*, array_remove(array[
             case when (pa.new_price - pa.old_price) * 20000 > pa.old_price * v_bp * 3 then 'jump' end,
             case when pa.recent then 'recent' end,
             case when pa.cost > 0 and pa.new_price < pa.cost then 'below_cost' end,
             case when pa.via_group then 'group' end,
             case when pa.aligned then 'sub_aligned' end], null) as fl
      from pa where not pa.skipped
  ),
  zp as (select count(*) as n from _price_scope_products(v_clinic, p_spec) sc join products p on p.id = sc.id and p.clinic_id = v_clinic where not (p.sell_price > 0)),
  zs as (select count(*) as n from _price_scope_services(v_clinic, p_spec) sc join clinic_services c on c.id = sc.id and c.clinic_id = v_clinic where not (c.price > 0))
  select jsonb_build_object(
    'plan_hash', md5(coalesce((select string_agg(_price_hash_line(kind, item_id, field, old_price, new_price), ';'
                                                 order by kind collate "C", item_id::text collate "C", field collate "C") from ln), '')),
    'currency', v_cur, 'frac', v_frac, 'pct_bp', v_bp,
    'round', coalesce(p_spec->>'round', 'smart'), 'max_step', (p_spec->>'max_step')::numeric,
    'counts', jsonb_build_object(
      'products',  (select count(*) from ln where field = 'sell_price'),
      'sub_units', (select count(*) from ln where field = 'sub_unit_price'),
      'services',  (select count(*) from ln where kind = 'service'),
      'lines',     (select count(*) from ln),
      'via_group', (select count(*) from ln where field = 'sell_price' and via_group),
      'recent_skipped', (select count(*) from pa where skipped)),
    'skipped', jsonb_build_object('zero_products', (select n from zp), 'zero_services', (select n from zs)),
    'missing', jsonb_build_object(
      'p_ids',     to_jsonb(coalesce(array(select x::text from unnest(_price_juuid(p_spec->'p_ids')) x
                     where not exists (select 1 from products p where p.id = x and p.clinic_id = v_clinic) order by 1), '{}')),
      'p_exclude', to_jsonb(coalesce(array(select x::text from unnest(_price_juuid(p_spec->'p_exclude')) x
                     where not exists (select 1 from products p where p.id = x and p.clinic_id = v_clinic) order by 1), '{}')),
      's_ids',     to_jsonb(coalesce(array(select x::text from unnest(_price_juuid(p_spec->'s_ids')) x
                     where not exists (select 1 from clinic_services c where c.id = x and c.clinic_id = v_clinic) order by 1), '{}')),
      's_exclude', to_jsonb(coalesce(array(select x::text from unnest(_price_juuid(p_spec->'s_exclude')) x
                     where not exists (select 1 from clinic_services c where c.id = x and c.clinic_id = v_clinic) order by 1), '{}'))),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('k', kind, 'id', item_id, 'f', field, 'n', item_name,
                                                           'o', old_price, 'w', new_price, 's', step, 'g', grp, 'fl', to_jsonb(fl))
                                        order by kind collate "C", item_id::text collate "C", field collate "C") from ln), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- ملخّصُ رفعٍ — ما يرجع من الحفظ والإرجاع ومن إعادةِ نداءٍ بنفس المرجع.
create or replace function public._price_summary(p_id uuid, p_clinic uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'pct_bp', c.pct_bp, 'applied_at', c.applied_at,
           'status', c.status, 'n_products', c.n_products, 'n_sub', c.n_sub, 'n_services', c.n_services,
           'n_lines', c.n_lines, 'event_seq', c.event_seq)
    from price_changes c where c.id = p_id and c.clinic_id = p_clinic
$$;

-- يقفل الصفوفَ مسبقاً بترتيب المعرّف **بلا انتظار**: قفلٌ مأخوذٌ يُفشل المحاولةَ فوراً
-- فتُترك كلُّ أقفالها (معاملةٌ فرعيّة) وتُعاد بعد ١٥٠ms. فالرفعُ لا ينتظر وهو يمسك
-- قفلاً، ولا يكون طرفَ جمودٍ مع بيعةٍ تقفل سطورَها بترتيب السلّة — البيعةُ تمرّ.
create or replace function public._price_lock_rows(p_clinic uuid, p_products uuid[], p_services uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_try int := 0;
begin
  loop
    begin
      perform 1 from products where clinic_id = p_clinic and id = any (coalesce(p_products, '{}')) order by id for update nowait;
      perform 1 from clinic_services where clinic_id = p_clinic and id = any (coalesce(p_services, '{}')) order by id for update nowait;
      return;
    exception when lock_not_available then
      v_try := v_try + 1;
      if v_try >= 10 then
        raise exception 'busy' using hint = 'المخزن مشغول ببيعٍ أو شراءٍ هسه — حاول بعد ثواني.';
      end if;
      perform pg_sleep(0.15);
    end;
  end loop;
end $$;

-- ── الحفظ ────────────────────────────────────────────────────────────────
create or replace function public.price_change_apply(p_spec jsonb, p_plan_hash text, p_note text default null, p_client_ref text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic uuid := _price_guard();
  v_cur    text := _price_currency(v_clinic);
  v_frac   boolean := _price_frac(v_cur);
  v_ref    text := nullif(btrim(p_client_ref), '');
  v_note   text := nullif(btrim(p_note), '');
  v_id     uuid := gen_random_uuid();
  v_seq    bigint;
  v_hash   text;
  v_n      int;
  v_exp    int;
  v_pids   uuid[];
  v_sids   uuid[];
  v_name   text;
  v_bp     int;
begin
  perform _price_spec_check(p_spec, v_frac);
  v_bp := (p_spec->>'pct_bp')::int;
  if v_ref is not null and char_length(v_ref) not between 8 and 64 then raise exception 'bad_ref'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'note_too_long'; end if;

  -- رفعٌ واحدٌ بالعيادة كلَّ لحظة: الثاني ينتظر الأوّلَ ثمّ يحسب على أسعاره.
  perform set_config('lock_timeout', '4s', true);
  perform pg_advisory_xact_lock(hashtextextended('price_change|' || v_clinic::text, 0));

  -- إعادةُ نداءٍ (جوابٌ ضاع بالشبكة): الرفعُ نفسُه يرجع، لا رفعٌ ثانٍ ولا «معاينة قديمة».
  if v_ref is not null and exists (select 1 from price_changes where clinic_id = v_clinic and client_ref = v_ref) then
    return (select _price_summary(c.id, v_clinic) || jsonb_build_object('replayed', true)
              from price_changes c where c.clinic_id = v_clinic and c.client_ref = v_ref);
  end if;

  select array_agg(distinct x.item_id) filter (where x.kind = 'product'),
         array_agg(distinct x.item_id) filter (where x.kind = 'service')
    into v_pids, v_sids
    from _price_plan(v_clinic, p_spec, v_frac) x;
  perform _price_lock_rows(v_clinic, v_pids, v_sids);

  v_seq := nextval('price_change_seq');
  v_name := case when is_platform_admin() then null
                 else (select s.name from staff s where s.user_id = auth.uid() and s.clinic_id = v_clinic limit 1) end;

  -- الخطّةُ والرأسُ والسطورُ والبصمةُ بجملةٍ واحدة = لقطةٌ واحدة. صفُّ الرأس يُدرج
  -- مرّةً بأرقامه النهائية (سطرٌ واحدٌ بسجلّ الحركات لا اثنان).
  with pl as materialized (select * from _price_plan(v_clinic, p_spec, v_frac)),
  h as (
    select md5(coalesce(string_agg(_price_hash_line(kind, item_id, field, old_price, new_price), ';'
                                   order by kind collate "C", item_id::text collate "C", field collate "C"), '')) as hash,
           count(*) filter (where field = 'sell_price') as np,
           count(*) filter (where field = 'sub_unit_price') as ns,
           count(*) filter (where kind = 'service') as nv,
           count(*) as nl
      from pl
  ),
  hdr as (
    insert into price_changes (id, clinic_id, pct_bp, round_mode, max_step, currency, spec, plan_hash, title,
                               n_products, n_sub, n_services, n_lines, note, created_name, apply_seq, event_seq,
                               applied_at, last_event_at, client_ref)
    select v_id, v_clinic, v_bp, coalesce(p_spec->>'round', 'smart'), (p_spec->>'max_step')::numeric, v_cur, p_spec, h.hash,
           '+' || trim(trailing '.' from trim(trailing '0' from to_char(v_bp / 100.0, 'FM99990.00'))) || '%',
           h.np, h.ns, h.nv, h.nl, v_note, v_name, v_seq, v_seq, clock_timestamp(), clock_timestamp(), v_ref
      from h
    returning id
  ),
  ins as (
    insert into price_change_lines (change_id, clinic_id, kind, item_id, item_name, field, old_price, new_price, step, grp)
    select (select id from hdr), v_clinic, pl.kind, pl.item_id, pl.item_name, pl.field, pl.old_price, pl.new_price, pl.step, pl.grp
      from pl
    returning 1
  )
  select h.hash, (select count(*) from ins) into v_hash, v_n from h;

  if v_hash is distinct from p_plan_hash then
    -- رفعٌ آخر سبقنا قبل قليل؟ يُسمّى باسمه — مديران بلّغهما المالكُ نفسَ النسبة لا
    -- يضاعفانها بضغطة «أعد» على رسالةٍ مبهمة.
    select format('رفع %s انطبق الساعة %s على %s سطر%s — راجع المعاينة الجديدة قبل ما تضغط مرّة ثانية.',
                  c.title, to_char(c.applied_at at time zone 'Asia/Baghdad', 'HH24:MI'), c.n_lines,
                  coalesce(' (' || c.created_name || ')', ''))
      into v_name
      from price_changes c
     where c.clinic_id = v_clinic and c.id <> v_id and c.applied_at > now() - interval '30 minutes'
     order by c.apply_seq desc limit 1;
    raise exception 'stale_preview' using
      hint = coalesce(v_name, 'الأسعار تغيّرت من آخر معاينة — راجع المعاينة الجديدة واضغط مرّة ثانية.');
  end if;
  if v_n = 0 then raise exception 'empty_plan' using hint = 'ماكو سعرٌ يرتفع بهذا الاختيار.'; end if;

  -- التدقيقُ يتخطّى تعديلَ السعر وحده داخل هذه المعاملة (صفُّ الرأس يحمل معرّفَها).
  perform set_config('dv.price_change', v_id::text, true);

  -- مقارنةٌ ثمّ تبديل، وعددُ الصفوف يُطابَق: سعرٌ تغيّر أو مادةٌ زالت ⇒ يُرجع الكلّ.
  update products p set sell_price = l.new_price
    from price_change_lines l
   where l.change_id = v_id and l.clinic_id = v_clinic and l.kind = 'product' and l.field = 'sell_price'
     and p.id = l.item_id and p.clinic_id = v_clinic and p.sell_price = l.old_price;
  get diagnostics v_n = row_count;
  select count(*) into v_exp from price_change_lines where change_id = v_id and kind = 'product' and field = 'sell_price';
  if v_n <> v_exp then raise exception 'stale_preview' using hint = 'سعرُ مادةٍ تغيّر أثناء الحفظ — ما تغيّر شيء، أعد المعاينة.'; end if;

  update products p set sub_unit_price = l.new_price
    from price_change_lines l
   where l.change_id = v_id and l.clinic_id = v_clinic and l.kind = 'product' and l.field = 'sub_unit_price'
     and p.id = l.item_id and p.clinic_id = v_clinic and p.sub_unit_price = l.old_price;
  get diagnostics v_n = row_count;
  select count(*) into v_exp from price_change_lines where change_id = v_id and kind = 'product' and field = 'sub_unit_price';
  if v_n <> v_exp then raise exception 'stale_preview' using hint = 'سعرُ مفردٍ تغيّر أثناء الحفظ — ما تغيّر شيء، أعد المعاينة.'; end if;

  update clinic_services c set price = l.new_price
    from price_change_lines l
   where l.change_id = v_id and l.clinic_id = v_clinic and l.kind = 'service'
     and c.id = l.item_id and c.clinic_id = v_clinic and c.price = l.old_price;
  get diagnostics v_n = row_count;
  select count(*) into v_exp from price_change_lines where change_id = v_id and kind = 'service';
  if v_n <> v_exp then raise exception 'stale_preview' using hint = 'سعرُ خدمةٍ تغيّر أثناء الحفظ — ما تغيّر شيء، أعد المعاينة.'; end if;
  -- إذنُ التخطّي ينتهي مع كتابات الرفع: ما بعدها بنفس المعاملة يُدقَّق كالعادة.
  perform set_config('dv.price_change', '', true);

  return _price_summary(v_id, v_clinic);
end $$;

-- ── التفصيل (والطباعة ومعاينةُ الإرجاع) — وثيقةٌ واحدة: رفعٌ قد يتجاوز الألف سطر ──
create or replace function public.price_change_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := _price_guard();
  v_c      price_changes;
begin
  select * into v_c from price_changes where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'no_change' using hint = 'الرفعُ غيرُ موجود بعيادتك.'; end if;
  return jsonb_build_object(
    'change', to_jsonb(v_c) - 'spec' - 'apply_txid' - 'undo_txid',
    'spec', v_c.spec,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'k', l.kind, 'item', l.item_id, 'f', l.field, 'n', l.item_name,
               'o', l.old_price, 'w', l.new_price, 'g', l.grp, 'outcome', l.undo_outcome, 'undone_at', l.undone_at,
               'cur', cur.v,
               'later', (select jsonb_build_object('id', c2.id, 'title', c2.title, 'applied_at', c2.applied_at)
                           from price_change_lines l2 join price_changes c2 on c2.id = l2.change_id
                          where l2.clinic_id = v_clinic and c2.clinic_id = v_clinic and c2.apply_seq > v_c.apply_seq
                            and (l2.undo_outcome is null or l2.undo_outcome = 'kept_missing')
                            and l2.kind = l.kind and l2.item_id = l.item_id and l2.field = l.field
                          order by c2.apply_seq limit 1))
             order by l.item_name, l.item_id, l.field)
        from price_change_lines l
        left join lateral (
          select case l.field
                   when 'sell_price'     then (select p.sell_price from products p where p.id = l.item_id and p.clinic_id = v_clinic)
                   when 'sub_unit_price' then (select p.sub_unit_price from products p where p.id = l.item_id and p.clinic_id = v_clinic)
                   else (select c.price from clinic_services c where c.id = l.item_id and c.clinic_id = v_clinic) end as v
        ) cur on true
       where l.change_id = p_id and l.clinic_id = v_clinic), '[]'::jsonb));
end $$;

-- ── الإرجاع ──────────────────────────────────────────────────────────────
-- `p_items` فارغ = كلُّ ما بقي من الرفع. وإلا هذه الموادُّ مع مجموعاتها كاملة.
create or replace function public.price_change_undo(p_id uuid, p_items uuid[] default null, p_reason text default null, p_client_ref text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic uuid := _price_guard();
  v_ref    text := nullif(btrim(p_client_ref), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_c      price_changes;
  v_cand   uuid[];
  v_lines  uuid[];
  v_blocked int := 0;
  v_block  record;
  v_now    timestamptz;
  v_status text;
  v_out    jsonb;
  v_r      int := 0;
  v_n      int;
begin
  if v_reason is null then raise exception 'reason_required' using hint = 'اكتب سببَ الإرجاع.'; end if;
  if char_length(v_reason) > 300 then raise exception 'reason_too_long'; end if;
  if v_ref is not null and char_length(v_ref) not between 8 and 64 then raise exception 'bad_ref'; end if;

  perform set_config('lock_timeout', '4s', true);
  perform pg_advisory_xact_lock(hashtextextended('price_change|' || v_clinic::text, 0));

  if v_ref is not null then
    select result into v_out from rpc_refs where clinic_id = v_clinic and fn = 'price_change_undo' and client_ref = v_ref;
    if v_out is not null then return v_out || jsonb_build_object('replayed', true); end if;
  end if;

  select * into v_c from price_changes where id = p_id and clinic_id = v_clinic for update;
  if not found then raise exception 'no_change' using hint = 'الرفعُ غيرُ موجود بعيادتك.'; end if;

  -- السطورُ المعلّقة (ومنها «مادة زالت» — تُعاد محاولتُها لو رجعت المادة)، مع المجموعة كاملة.
  select array_agg(l.id) into v_cand
    from price_change_lines l
   where l.change_id = p_id and l.clinic_id = v_clinic
     and (l.undo_outcome is null or l.undo_outcome = 'kept_missing')
     and (p_items is null
          or l.item_id = any (p_items)
          or (l.grp is not null and exists (select 1 from price_change_lines l2
                                             where l2.change_id = p_id and l2.clinic_id = v_clinic
                                               and l2.grp = l.grp and l2.item_id = any (p_items))));
  if v_cand is null then
    raise exception 'nothing_to_undo' using hint = 'ما بقي شي من هذا الرفع يرجع.';
  end if;

  -- رفعٌ لاحقٌ قائمٌ على نفس المادة والحقل: سطرُه يبقى معلّقاً (لا يُحسم «تغيّر») حتى
  -- يُرجَع اللاحقُ أوّلاً — وإلا ضاع الأصلُ (1000→1300→1700: إرجاعُ الأوّل يحسمه، ثمّ
  -- إرجاعُ الثاني يعيده 1300 لا 1000). والمجموعةُ تُحجز كلُّها إن حُجز منها واحد.
  with direct as (
    select l.id, l.grp from price_change_lines l
     where l.id = any (v_cand)
       and exists (select 1 from price_change_lines l2 join price_changes c2 on c2.id = l2.change_id
                    where l2.clinic_id = v_clinic and c2.clinic_id = v_clinic and c2.apply_seq > v_c.apply_seq
                      and (l2.undo_outcome is null or l2.undo_outcome = 'kept_missing')
                      and l2.kind = l.kind and l2.item_id = l.item_id and l2.field = l.field)
  )
  select array_agg(l.id) filter (where not (l.id in (select id from direct) or (l.grp is not null and l.grp in (select grp from direct where grp is not null)))),
         count(*) filter (where l.id in (select id from direct) or (l.grp is not null and l.grp in (select grp from direct where grp is not null)))
    into v_lines, v_blocked
    from price_change_lines l where l.id = any (v_cand);

  if v_lines is null then
    select c2.title, c2.applied_at into v_block
      from price_change_lines l2 join price_changes c2 on c2.id = l2.change_id
     where l2.clinic_id = v_clinic and c2.clinic_id = v_clinic and c2.apply_seq > v_c.apply_seq
       and (l2.undo_outcome is null or l2.undo_outcome = 'kept_missing')
       and exists (select 1 from price_change_lines l where l.id = any (v_cand)
                    and l.kind = l2.kind and l.item_id = l2.item_id and l.field = l2.field)
     order by c2.apply_seq
     limit 1;
    raise exception 'later_batch' using hint = format('رفعٌ لاحق (%s بتاريخ %s) غيّر نفسَ المواد — أرجعه أوّلاً.',
      v_block.title, to_char(v_block.applied_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD'));
  end if;

  -- الصفوفُ تُقفل مسبقاً كما بالحفظ (بلا انتظار، بترتيب المعرّف): إرجاعٌ يقفل سطراً سطراً
  -- وهو ينتظر كان طرفَ جمودٍ مع بيعةٍ تقفل بترتيب سلّتها — وقد تكون البيعةُ هي الضحيّة.
  perform _price_lock_rows(v_clinic,
    (select array_agg(distinct l.item_id) from price_change_lines l where l.id = any (v_lines) and l.kind = 'product'),
    (select array_agg(distinct l.item_id) from price_change_lines l where l.id = any (v_lines) and l.kind = 'service'));

  if v_ref is not null then
    insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'price_change_undo', v_ref);
  end if;

  v_now := clock_timestamp();
  -- الحالةُ بعد الإرجاع: يبقى «جزئياً» ما بقي سطرٌ معلّق — خارج هذا الإرجاع، أو داخله
  -- ومادتُه زالت (ستُحسم «زالت» وتُعاد محاولتُها). الصفوفُ مقفولة فالوجودُ ثابت.
  v_status := case when exists (
                select 1 from price_change_lines l
                 where l.change_id = p_id and l.clinic_id = v_clinic
                   and (l.undo_outcome is null or l.undo_outcome = 'kept_missing')
                   and (not (l.id = any (v_lines))
                        or (l.kind = 'product' and not exists (select 1 from products p where p.id = l.item_id and p.clinic_id = v_clinic))
                        or (l.kind = 'service' and not exists (select 1 from clinic_services c where c.id = l.item_id and c.clinic_id = v_clinic))))
                   then 'partially_undone' else 'undone' end;
  -- الرأسُ مرّةً واحدة بحالته النهائية (سطرٌ واحد بسجلّ الحركات)، ومعه معرّفُ المعاملة
  -- قبل أيّ سعر — به يعرف التدقيقُ أن ما يلي جزءٌ من هذا الإرجاع.
  update price_changes set
    status = v_status, undone_at = v_now, undone_by = auth.uid(), undo_reason = v_reason,
    undo_txid = txid_current(), event_seq = nextval('price_change_seq'), last_event_at = v_now
   where id = p_id and clinic_id = v_clinic;
  perform set_config('dv.price_change', p_id::text, true);

  -- مقارنةٌ ثمّ تبديل: يرجع ما زال بسعر الرفع وحده؛ ما عُدِّل بعده بيدٍ يبقى.
  with r as (
    update products p set sell_price = l.old_price
      from price_change_lines l
     where l.id = any (v_lines) and l.kind = 'product' and l.field = 'sell_price'
       and p.id = l.item_id and p.clinic_id = v_clinic and p.sell_price = l.new_price
    returning l.id
  )
  update price_change_lines set undo_outcome = 'restored', undone_at = v_now where id in (select id from r);
  get diagnostics v_n = row_count; v_r := v_r + v_n;

  with r as (
    update products p set sub_unit_price = l.old_price
      from price_change_lines l
     where l.id = any (v_lines) and l.kind = 'product' and l.field = 'sub_unit_price'
       and p.id = l.item_id and p.clinic_id = v_clinic and p.sub_unit_price = l.new_price
    returning l.id
  )
  update price_change_lines set undo_outcome = 'restored', undone_at = v_now where id in (select id from r);
  get diagnostics v_n = row_count; v_r := v_r + v_n;

  with r as (
    update clinic_services c set price = l.old_price
      from price_change_lines l
     where l.id = any (v_lines) and l.kind = 'service'
       and c.id = l.item_id and c.clinic_id = v_clinic and c.price = l.new_price
    returning l.id
  )
  update price_change_lines set undo_outcome = 'restored', undone_at = v_now where id in (select id from r);
  get diagnostics v_n = row_count; v_r := v_r + v_n;

  update price_change_lines l set
    undo_outcome = case
      when l.kind = 'product' and exists (select 1 from products p where p.id = l.item_id and p.clinic_id = v_clinic) then 'kept_changed'
      when l.kind = 'service' and exists (select 1 from clinic_services c where c.id = l.item_id and c.clinic_id = v_clinic) then 'kept_changed'
      else 'kept_missing' end,
    undone_at = v_now
   where l.id = any (v_lines) and l.clinic_id = v_clinic and (l.undo_outcome is null or l.undo_outcome = 'kept_missing');
  -- إذنُ التخطّي ينتهي هنا: كتابةٌ لاحقة بنفس المعاملة (مثلاً طفرتان بطلب graphql واحد)
  -- تُدقَّق كالعادة.
  perform set_config('dv.price_change', '', true);

  v_out := _price_summary(p_id, v_clinic) || jsonb_build_object(
    'restored', v_r, 'blocked', v_blocked,
    'kept_changed', (select count(*) from price_change_lines where id = any (v_lines) and undo_outcome = 'kept_changed'),
    'kept_missing', (select count(*) from price_change_lines where id = any (v_lines) and undo_outcome = 'kept_missing'));
  if v_ref is not null then
    update rpc_refs set result = v_out where clinic_id = v_clinic and fn = 'price_change_undo' and client_ref = v_ref;
  end if;
  return v_out;
end $$;

-- ── «رجّعه للأصل» لسطرٍ عُدِّل بيدٍ بعد الرفع ─────────────────────────────
-- الإرجاعُ العاديّ لا يدوس تعديلاً لاحقاً؛ هذا بابُه الصريح: سطرٌ واحد، بالسعر الذي
-- يراه المدير الآن (مقارنةٌ ثمّ تبديل)، وبسبب. ويُدقَّق كتعديلٍ يدويّ عاديّ.
create or replace function public.price_change_force(p_line uuid, p_expected numeric, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic uuid := _price_guard();
  v_reason text := nullif(btrim(p_reason), '');
  v_l      price_change_lines;
  v_seq    bigint;
  v_ids    uuid[];
  v_items  uuid[];
  v_n      int;
  v_status text;
begin
  if v_reason is null then raise exception 'reason_required' using hint = 'اكتب سببَ الإرجاع.'; end if;
  perform set_config('lock_timeout', '4s', true);
  perform pg_advisory_xact_lock(hashtextextended('price_change|' || v_clinic::text, 0));
  select l.* into v_l from price_change_lines l where l.id = p_line and l.clinic_id = v_clinic for update;
  if not found then raise exception 'no_line' using hint = 'السطرُ غيرُ موجود بعيادتك.'; end if;
  -- للسطر الذي حسمه الإرجاعُ «عُدِّل بعد الرفع» وحده: السطرُ المعلّق يُرجَع بالإرجاع العاديّ
  -- (مع مجموعته كاملة).
  if v_l.undo_outcome is distinct from 'kept_changed' then
    raise exception 'not_kept' using hint = 'هذا السطر يرجع بزرّ «رجّع» العادي.';
  end if;
  -- والمجموعةُ تُفرض كلُّها: محرّرُ المجموعة يكتب أعضاءها بسعرٍ واحد، فيبقون كلُّهم «تعديل
  -- بيد» بنفس السعر — وفرضُ عضوٍ واحد كان يشقّ الرفَّ بسعرين (أمسكه الفحصُ الحيّ). يدخل
  -- العضوُ الذي سعرُه الآن هو ما رآه المستخدم؛ ومن انشقّ قبلُ بسعرٍ آخر يبقى بزرّه.
  select array_agg(l.id order by l.id), array_agg(l.item_id order by l.id) into v_ids, v_items
    from price_change_lines l
   where l.change_id = v_l.change_id and l.clinic_id = v_clinic
     and l.undo_outcome = 'kept_changed' and l.kind = v_l.kind and l.field = v_l.field
     and (l.id = v_l.id
          or (v_l.grp is not null and l.grp = v_l.grp and l.kind = 'product'
              and exists (select 1 from products p where p.id = l.item_id and p.clinic_id = v_clinic
                             and case l.field when 'sell_price' then p.sell_price else p.sub_unit_price end = p_expected)));
  select c.apply_seq into v_seq from price_changes c where c.id = v_l.change_id and c.clinic_id = v_clinic;
  if exists (select 1 from price_change_lines l2 join price_changes c2 on c2.id = l2.change_id
              where l2.clinic_id = v_clinic and c2.clinic_id = v_clinic and c2.apply_seq > v_seq
                and (l2.undo_outcome is null or l2.undo_outcome = 'kept_missing')
                and l2.kind = v_l.kind and l2.item_id = any (v_items) and l2.field = v_l.field) then
    raise exception 'later_batch' using hint = 'رفعٌ لاحق غيّر نفسَ المادة — أرجعه أوّلاً.';
  end if;
  perform _price_lock_rows(v_clinic, case when v_l.kind = 'product' then v_items end, case when v_l.kind = 'service' then v_items end);
  if v_l.field = 'sell_price' then
    update products p set sell_price = l.old_price from price_change_lines l
     where l.id = any (v_ids) and p.id = l.item_id and p.clinic_id = v_clinic and p.sell_price = p_expected;
  elsif v_l.field = 'sub_unit_price' then
    update products p set sub_unit_price = l.old_price from price_change_lines l
     where l.id = any (v_ids) and p.id = l.item_id and p.clinic_id = v_clinic and p.sub_unit_price = p_expected;
  else
    update clinic_services s set price = v_l.old_price where s.id = v_l.item_id and s.clinic_id = v_clinic and s.price = p_expected;
  end if;
  get diagnostics v_n = row_count;
  -- كلُّ عضوٍ أو لا أحد: سعرٌ تحرّك بين القراءة والكتابة يُرجع المعاملةَ كلَّها.
  if v_n <> cardinality(v_ids) then
    raise exception 'price_moved' using hint = 'السعرُ الحاليّ تغيّر من آخر ما شفته (أو المادة زالت) — حدّث الصفحة.';
  end if;
  update price_change_lines set undo_outcome = 'restored', undone_at = clock_timestamp() where id = any (v_ids);
  v_status := case when exists (select 1 from price_change_lines l where l.change_id = v_l.change_id
                                     and (l.undo_outcome is null or l.undo_outcome = 'kept_missing'))
                   then 'partially_undone' else 'undone' end;
  update price_changes set status = v_status, undone_at = clock_timestamp(), undone_by = auth.uid(), undo_reason = v_reason,
         event_seq = nextval('price_change_seq'), last_event_at = clock_timestamp()
   where id = v_l.change_id and clinic_id = v_clinic;
  return _price_summary(v_l.change_id, v_clinic) || jsonb_build_object('restored', cardinality(v_ids));
end $$;

-- ── السعرُ قبل الرفع — لمرتجع الكاشير ──────────────────────────────────────
-- مرتجعٌ بلا فاتورة كان يُسعَّر بسعر اليوم: بعد رفع ٥٠٪ يُردّ للزبون أكثرُ مما دفع
-- (`retail_return` تثق بسعر الجهاز وتكتبه مصروفاً نقداً). هنا لكلّ منتجٍ رُفع برفعٍ
-- قائمٍ خلال ١٢٠ يوماً: سعرُه قبل **آخر** رفعٍ قائم وتاريخُه، وسعرُ ذلك الرفع. لا أقدمُ
-- السلسلة: 1000→1300 (أيلول) ثمّ 1300→1700 (تشرين) — من اشترى بينهما دفع 1300، و«قبل»
-- الأقدم كان يردّ له 1000؛ وتعديلٌ بيدٍ بين رفعين (1000→1300، يدويّ 2000، 2000→2500)
-- كان يقترح 1000 ما بيع به أحدٌ منذ التعديل (تدقيقٌ عدائيّ). والكاشيرُ لا يقترحه أصلاً إن
-- كان سعرُ اليوم غيرَ «بعد» هذا الرفع (عُدِّل بيدٍ بعده). وثيقةٌ واحدة (لا قائمةٌ تُقصّ
-- عند الألف). لكلّ كادر العيادة (الكاشيرُ يحتاجه).
create or replace function public.price_raise_prior()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with last as (
    select distinct on (l.item_id) l.item_id, l.old_price, l.new_price, c.applied_at
      from price_change_lines l join price_changes c on c.id = l.change_id
     where l.clinic_id = auth_clinic() and c.clinic_id = auth_clinic()
       and l.kind = 'product' and l.field = 'sell_price' and (l.undo_outcome is null or l.undo_outcome = 'kept_missing')
       and c.applied_at > now() - interval '120 days'
     order by l.item_id, c.apply_seq desc
  )
  select coalesce(jsonb_object_agg(item_id, jsonb_build_object('o', old_price, 'at', applied_at, 'w', new_price)), '{}'::jsonb) from last
$$;

revoke all on function public._price_frac(text) from public, anon, authenticated;
revoke all on function public._price_ladder(boolean) from public, anon, authenticated;
revoke all on function public._price_step(numeric, int, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public._price_raise(numeric, int, numeric) from public, anon, authenticated;
revoke all on function public._price_align_sub(numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public._price_jtext(jsonb) from public, anon, authenticated;
revoke all on function public._price_juuid(jsonb) from public, anon, authenticated;
revoke all on function public._price_scope_products(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._price_scope_services(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._price_recent(uuid) from public, anon, authenticated;
revoke all on function public._price_plan_all(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._price_plan(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._price_hash_line(text, uuid, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public._price_guard() from public, anon, authenticated;
revoke all on function public._price_currency(uuid) from public, anon, authenticated;
revoke all on function public._price_spec_check(jsonb, boolean) from public, anon, authenticated;
revoke all on function public._price_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public._price_lock_rows(uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.price_change_preview(jsonb) from public, anon;
revoke all on function public.price_change_apply(jsonb, text, text, text) from public, anon;
revoke all on function public.price_change_detail(uuid) from public, anon;
revoke all on function public.price_change_undo(uuid, uuid[], text, text) from public, anon;
revoke all on function public.price_change_force(uuid, numeric, text) from public, anon;
revoke all on function public.price_raise_prior() from public, anon;
grant execute on function public.price_change_preview(jsonb) to authenticated;
grant execute on function public.price_change_apply(jsonb, text, text, text) to authenticated;
grant execute on function public.price_change_detail(uuid) to authenticated;
grant execute on function public.price_change_undo(uuid, uuid[], text, text) to authenticated;
grant execute on function public.price_change_force(uuid, numeric, text) to authenticated;
grant execute on function public.price_raise_prior() to authenticated;

-- ── التدقيق: سطرٌ للرفع لا ألف ───────────────────────────────────────────
-- هل هذه المعاملةُ رفعٌ (أو إرجاعٌ) حيّ؟ الإعدادُ وحده لا يكفي: صفُّ الرأس لازم يحمل
-- معرّفَ هذه المعاملة بالذات.
create or replace function public._price_change_live()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v text := nullif(current_setting('dv.price_change', true), '');
begin
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (select 1 from price_changes c
                  where c.id = v::uuid and txid_current() in (c.apply_txid, coalesce(c.undo_txid, -1)));
end $$;
revoke all on function public._price_change_live() from public, anon, authenticated;

-- نسخةُ 0152 حرفاً (والمنشورُ مطابقٌ لها منطقاً — مقيسٌ ٧/١٠) إلا فرعَ التخطّي: تعديلٌ
-- لم يغيّر غيرَ أعمدة السعر، على المنتجات أو الخدمات، داخل رفعٍ حيّ.
create or replace function audit_change() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_raw jsonb; v_old_raw jsonb; v_new jsonb; v_old jsonb; v_src jsonb; v_out jsonb; v_chg jsonb;
  keep constant text[] := array[
    'name','pet_name','pet_id','kind','outcome','status','medication','amount',
    'administered_at','vaccine','doctor_name','doctor','weight_kg','total',
    'customer_name','stock','qty','line_total','title','text','owner_name',
    'reminder_type','label','staff_id',
    -- 0152: ما يسمّي أحداثَ الجداول الجديدة — قليلٌ عمداً: سطرُ التعديل يبقى
    -- أصغرَ من اللقطة بأربع مرّات (فحصُ 0139)، والفرقُ `__changed` يحمل الباقي.
    'test','test_name','reason','category','company_name','courier_name',
    'event','ref','format','role','species'
  ];
begin
  begin
    v_new_raw := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
    v_old_raw := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
    if v_new_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_new from jsonb_each(v_new_raw) as e(key, value);
    end if;
    if v_old_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_old from jsonb_each(v_old_raw) as e(key, value);
    end if;
    v_src := coalesce(v_new, v_old);
    if TG_OP = 'DELETE' then
      v_out := v_old;
    else
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_out
        from jsonb_each(v_src) as e(key, value)
       where e.key = any (keep) and e.value <> 'null'::jsonb;
    end if;
    if TG_OP = 'UPDATE' then
      select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k)) into v_chg
        from jsonb_object_keys(v_new_raw) as k
       where (v_new_raw -> k) is distinct from (v_old_raw -> k);
      if v_chg is not null then v_out := v_out || jsonb_build_object('__changed', v_chg); end if;
      -- 0226: رفعُ الأسعار يكتب سطرَه الواحد بـprice_changes — لا ألفَ «تعديل منتج».
      if v_chg is not null and TG_TABLE_NAME in ('products', 'clinic_services')
         and not exists (select 1 from jsonb_object_keys(v_chg) k where k not in ('sell_price', 'sub_unit_price', 'price'))
         and public._price_change_live() then
        return NEW;
      end if;
    end if;
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (coalesce(nullif(v_src->>'clinic_id','')::uuid, auth_clinic()), auth.uid(), TG_OP, TG_TABLE_NAME, (v_src->>'id'), v_out);
  exception when others then
    null; -- التدقيق لا يجوز أن يمنع العملية الأصلية أبداً
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $function$;
revoke execute on function public.audit_change() from anon, authenticated;

-- نسخةُ 0210 حرفاً إلا فرع price_changes (مرآتُه بـactivityKinds.ts).
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
    when p_entity = 'expenses' then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- سطرُ الرفع يقوم مقامَ ألفِ سطرٍ كانت تبقى سنةً بطبقة المال — فيبقى سنةً مثلَها.
-- (نسخةُ 0210 حرفاً إلا 'price_changes' بالقائمتين.)
create or replace function public.purge_audit_log(
  p_days       int default 90,
  p_days_money int default 365
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n_noise bigint;
  n_money bigint;
  money_entities constant text[] := array[
    'invoices', 'invoice_items',
    'purchases', 'purchase_items', 'purchase_payments',
    'expenses', 'products',
    'delivery_orders', 'store_orders',
    'price_changes'
  ];
begin
  if p_days is null or p_days < 7 then
    raise exception 'purge_audit_log: مدّة الاحتفاظ لازم ٧ أيام فأكثر (وصلت %)', p_days;
  end if;
  if p_days_money is null or p_days_money < p_days then
    raise exception 'purge_audit_log: مدّة المال (%) لازم ما تقلّ عن مدّة الباقي (%)', p_days_money, p_days;
  end if;

  delete from public.audit_log
  where (entity is null or entity <> all (money_entities))
    -- coalesce لازم: كيانٌ فارغ يجعل الشرطَ NULL فيسقط الصفُّ من الكنس للأبد — فخُّ 0129 نفسُه.
    and not coalesce(entity = 'client' and details->>'event' = 'sale.expired', false)
    and created_at < now() - make_interval(days => p_days);
  get diagnostics n_noise = row_count;

  delete from public.audit_log
  where (entity = any (money_entities) or (entity = 'client' and details->>'event' = 'sale.expired'))
    and created_at < now() - make_interval(days => p_days_money);
  get diagnostics n_money = row_count;

  return n_noise + n_money;
end $$;
revoke all on function public.purge_audit_log(int, int) from public, anon, authenticated;

create or replace function public.audit_log_preview(
  p_days int default 90, p_days_money int default 365
)
returns table (
  tier text, would_delete bigint, would_keep bigint, oldest timestamptz, newest timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select created_at,
           entity = any (array['invoices','invoice_items','purchases','purchase_items',
                               'purchase_payments','expenses','products',
                               'delivery_orders','store_orders','price_changes'])
           or coalesce(entity = 'client' and details->>'event' = 'sale.expired', false) as is_money
    from public.audit_log
  )
  select
    case when is_money then 'مال ومخزون' else 'حركة يومية' end,
    count(*) filter (where created_at <  now() - make_interval(days => case when is_money then p_days_money else p_days end)),
    count(*) filter (where created_at >= now() - make_interval(days => case when is_money then p_days_money else p_days end)),
    min(created_at), max(created_at)
  from e group by is_money order by 1;
$$;
revoke all on function public.audit_log_preview(int, int) from public, anon, authenticated;

-- ── نبضُ الكنس يقيس كلَّ صفٍّ بنافذته هو ──────────────────────────────────
-- نسخةُ 0137 حرفاً (لا تعريفَ بعدها) إلا قائمةَ المال: `purge_audit_log` تبقي أثرَ الرفع
-- (ومنذ 0210 «باع منتهياً») سنةً، و`audit_purge_lag` كان يقيسه بنافذة ٩٠ يوماً — فمن
-- اليوم الثامن والتسعين بعد أوّل رفعٍ يصرخ «الكنسُ متوقّف» والكنسُ شغّال (تدقيقٌ عدائيّ).
-- المقياسُ بُني ألّا يخدعه طبقُ المال؛ فالقائمتان تتبعان بعضهما.
create or replace function system_health(p_db_cap_mb int default 500)
returns table (
  metric  text,      -- معرّفٌ ثابت، تترجمه الواجهة
  value   numeric,   -- المستهلَك
  ceiling numeric,   -- السقف
  unit    text,      -- bytes | count | seconds | days
  pct     numeric    -- النسبة، مقرّبة لخانةٍ واحدة
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_cap_bytes numeric := p_db_cap_mb::numeric * 1024 * 1024;
  v_maxconn   numeric := coalesce(nullif(current_setting('max_connections', true), '')::numeric, 60);
  v_raw       text;
  v_timeout_s numeric;
begin
  if not is_platform_admin() then
    raise exception 'not allowed';
  end if;

  -- مهلةُ دور التطبيق لا مهلةُ جلستنا: سوبابيس يضبطها على الدور، والذي يهمّنا
  -- هو ما يقتل استعلامَ العيادة لا استعلامَنا نحن. وتُخزَّن نصّاً بوحدةٍ
  -- متغيّرة ('2min'، '120s'، '120000ms'، أو رقمٌ عارٍ يعني ملي ثانية) —
  -- فنفكّها صراحةً بدل قسمةٍ ذكيّة تُخطئ بحالةٍ واحدة بصمت.
  select split_part(s, '=', 2) into v_raw
  from pg_db_role_setting r, unnest(r.setconfig) s
  where r.setrole = 'authenticated'::regrole and s like 'statement_timeout=%'
  limit 1;

  v_timeout_s := case
    when v_raw is null      then 120                                        -- ما ضُبطت: افتراضُ سوبابيس
    when v_raw ~ 'ms$'      then (regexp_replace(v_raw, '\D', '', 'g'))::numeric / 1000
    when v_raw ~ 'min$'     then (regexp_replace(v_raw, '\D', '', 'g'))::numeric * 60
    when v_raw ~ 's$'       then (regexp_replace(v_raw, '\D', '', 'g'))::numeric
    when v_raw ~ '^\d+$'    then v_raw::numeric / 1000                      -- بلا وحدة = ملي ثانية
    else 120 end;

  return query
  with m(metric, value, ceiling, unit) as (
    -- ١) حجم القاعدة بالباقة. بلوغُه يوقف الكتابة على كل العيادات معاً.
    select 'db_size', pg_database_size(current_database())::numeric, v_cap_bytes, 'bytes'
    -- ٢) الاتصالات. بلوغُها يرفض اتصالاً جديداً — أي «التطبيق ما يفتح».
    union all
    select 'connections', (select count(*)::numeric from pg_stat_activity), v_maxconn, 'count'
    -- ٣) أطولُ استعلامٍ شغّال الآن مقابل المهلة. اقترابُه يعني تقريراً على
    --    وشك أن يُقتل بمنتصفه.
    union all
    select 'longest_query',
           coalesce((select max(extract(epoch from (now() - query_start)))::numeric
                     from pg_stat_activity
                     where state = 'active' and query_start is not null
                       and pid <> pg_backend_pid()), 0),
           v_timeout_s, 'seconds'
    -- ٤) سجلّ التدقيق: أسرعُ الجداول نمواً، ونصفُ القاعدة يوم قِيس أوّلَ مرّة.
    union all
    select 'audit_log_size',
           coalesce(pg_total_relation_size(to_regclass('public.audit_log'))::numeric, 0),
           v_cap_bytes, 'bytes'
    -- ٥) **تأخُّرُ الكنس** — نبضُ الجدولة، وأهمُّ رقمٍ هنا.
    --
    --    ولا نقيس «عمرَ أقدم صفّ»: الاحتفاظ مُتدرّج (٩٠ يوماً للحركة اليومية،
    --    و٣٦٥ لأثر المال — هجرة 0129)، فأقدمُ صفٍّ يقترب من السنة **بالتصميم**
    --    ويبقى هناك. مقياسٌ كهذا يصرخ كل يوم بعد السنة الأولى، فيُطفأ ويُهمَل،
    --    فلا يُسمَع يوم يصير الصراخ حقيقياً.
    --
    --    فنقيس بدلَه: كم يوماً **تجاوز** أقدمُ صفٍّ نافذتَه هو. الكنس يوميّ،
    --    فالصحيح صفرٌ أو قريبٌ منه مهما كبر عمرُ النظام؛ والرقم لا يتحرّك إلا
    --    إذا توقّفت الجدولة فعلاً. سبعةُ أيامٍ سقفاً = أسبوعٌ بلا كنس.
    union all
    select 'audit_purge_lag',
           coalesce((select max(greatest(0,
                       extract(epoch from (now() - created_at)) / 86400
                       - case when (entity is not null and entity = any (array[
                           'invoices','invoice_items','purchases','purchase_items',
                           'purchase_payments','expenses','products','delivery_orders','store_orders',
                           'price_changes']))
                           or coalesce(entity = 'client' and details->>'event' = 'sale.expired', false)
                         then 365 else 90 end))::numeric
                     from audit_log), 0),
           7, 'days'
    -- ٦) ونفسُه لمراجع النداءات (0136): نافذتها سبعة أيام.
    union all
    select 'rpc_refs_purge_lag',
           coalesce((select max(greatest(0,
                       extract(epoch from (now() - created_at)) / 86400 - 7))::numeric
                     from rpc_refs), 0),
           7, 'days'
    -- ٧) بئرُ الأرقام التسلسلية للحيوانات (0126): ٩٠ ألفاً بخمس خانات
    --    و٩٠٠ ألف بستّ. نضوبُها لا يُفشل شيئاً (الدالّة تنتقل لصيغة 'P…')
    --    لكنه يغيّر شكلَ الأرقام، فيُرى قبل أن يُفاجئ.
    union all
    select 'pet_serials', (select count(*)::numeric from pets), 990000, 'count'
  )
  select m.metric, m.value, m.ceiling, m.unit,
         round(case when m.ceiling > 0 then m.value * 100 / m.ceiling else 0 end, 1)
  from m
  order by 5 desc;   -- الأقربُ للسقف أوّلاً
end $function$;

comment on table price_changes is
  'رفعُ الأسعار بنسبة (0226): رأسٌ لكلّ رفع بنسبته ونطاقه وبصمته ومن رفعه، وحالةُ إرجاعه. الكتابةُ من الدوالّ وحدها.';
comment on table price_change_lines is
  'سطرٌ لكلّ (مادة، حقل سعر) رُفع: القديمُ والجديدُ والخطوة، ونتيجةُ الإرجاع. هو مصدرُ «رجّع السعر الأصلي» — لا سجلُّ التدقيق المكنوس.';
