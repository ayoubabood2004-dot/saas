-- ============================================================================
-- ٠٢٦٩ — الجرعةُ بيعٌ: سعرُ الجرعة وربطُها بالمخزن على دواء العيادة، وكلُّ جرعةٍ تُعطى بالطبلة تصير بيعاً معلَّقاً للزبون
--
-- طلبُ المالك (١٣/١١): «سعر أيّ دواء وعدد همين يكونن اختياريات، لكن لو خلّى واحد منهم يبدي يحسبله بالطبلة… قبل البيع يروح
-- يسجّل من وحده بيع لهذا الزبون هذا الدواء بهاي الطريقة وبهذا السعر». وقراراتُه: لكلّ جرعة؛ تنزل بالسلّة وحدها حين تُفتح بيعتُه؛
-- والرصيدُ من المادّة نفسِها بالمخزن (الدواءُ يُربط بمادّة).
--
-- ── التصميم ──────────────────────────────────────────────────────────────
-- • الدواء (clinic_drugs): dose_price (سعرُ الجرعة)، product_id + dose_qty + dose_unit (المادّةُ وكمّيّةُ الجرعة منها بالعلبة أو
--   بالوحدة الصغرى). كلُّها اختياريّة؛ واحدٌ منها يكفي: السعرُ وحده يُحسب بلا مخزن، والمادّةُ وحدها تُسعَّر من سعرها × الكمّية
--   (الغائبةُ = ١). والكتابةُ من بابها وحده (`clinic_drug_billing_set`، صلاحيةُ المخزون) — محفّزٌ يرفض غيرَه (درسُ 0162).
-- • الجرعةُ المعطاة (treatment_entries) ⇒ صفٌّ معلَّق بـdose_charges **بمحفّزٍ على الجدول** لا بنداءٍ من الشاشة: ستُّ شاشاتٍ تعطي
--   الجرعة (الطبلة، الزيارة، الجناح، الجولة، السجلّ، …) ومحفّزٌ واحد يرى كلَّها. والسعرُ والكمّيّةُ لقطةُ لحظة الإعطاء. وإلغاءُ
--   الإعطاء يُلغي المعلَّق (المفوتَرُ يبقى — الإرجاعُ من الفاتورة). وإعادةُ الإعطاء بعده معلَّقٌ جديد؛ وواحدٌ حيٌّ لكلّ جرعة (فهرسٌ فريد).
-- • **ما بيع بالكاشير لا يُحسب ثانيةً**: البيعُ يكتب جرعاتِه بالطبلة معطاةً (persistMedicalEntries، بلا زيارة) — فعمودُ `bill` يُختم
--   عند الإدراج: معلَّقةٌ (خطّة) أو معطاةٌ بزيارة ⇒ تُحسب، ومعطاةٌ بلا زيارةٍ ولا كلمة ⇒ لا (البيعُ القديمُ قبل هذه الواجهة كذلك —
--   نقصٌ في الحساب أهون من حسابٍ مرّتين). والواجهةُ الجديدة تقولها صراحةً (البيع false، سجلُّ الحيوان true).
-- • البيع: `dose_charges_pending` تُرجع معلَّقاتِ حيوانات الزبون (بمفتاحه cust_key كدليل الزبائن 0232، أو بحيواناتٍ مسمّاة)،
--   و`retail_checkout_doses` تقفلها وتبيع (retail_checkout نفسُها) وتختمها مفوتَرةً **بالمعاملة نفسِها** (كـstore_accept_order):
--   جرعةٌ فوتَرها جهازٌ آخر ⇒ dose_charge_gone قبل أيّ كتابة، وإعادةٌ بالمرجع نفسِه ترجع الفاتورةَ نفسَها.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. clinic_drugs_list نصُّ 0268 وفوقه أسطرٌ معلَّمة بـ`-- +0269` بحارس البصمة.
-- تراجع: أعد clinic_drugs_list من 0268 حرفاً، واحذف المحفّزين على treatment_entries — الجداولُ والأعمدةُ تبقى بلا قارئ.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.clinic_drug_families_seed(uuid)') is null
     or to_regprocedure('public.retail_checkout(jsonb,jsonb)') is null
     or to_regprocedure('public.cust_key(text,text,text)') is null then
    raise exception 'needs_0268' using hint = 'طبّق 0268 (التصنيفات الأساسية) وما قبلها قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.clinic_drugs_list()', '1e3966c320b52567d3265c5416923a52', '-- +0269');

-- ── ١) الدواء: سعرُ الجرعة وربطُها بالمخزن ───────────────────────────────────
alter table public.clinic_drugs add column if not exists dose_price numeric;
alter table public.clinic_drugs add column if not exists dose_qty   numeric;
alter table public.clinic_drugs add column if not exists dose_unit  text;
alter table public.clinic_drugs add column if not exists product_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_drugs_dose_ck' and conrelid = 'public.clinic_drugs'::regclass) then
    alter table public.clinic_drugs add constraint clinic_drugs_dose_ck check (
      (dose_price is null or (dose_price >= 0 and dose_price <= 1000000000))
      and (dose_qty is null or (dose_qty > 0 and dose_qty <= 100000))
      and ((product_id is null and dose_qty is null and dose_unit is null)
           or (product_id is not null and dose_unit in ('box', 'sub'))));
  end if;
end $$;
comment on column public.clinic_drugs.dose_price is 'سعرُ الجرعة الواحدة (0269) — فارغ: من سعر المادّة المربوطة × الكمّية، أو لا حساب.';
comment on column public.clinic_drugs.product_id is 'المادّةُ بالمخزن التي تُخصم منها الجرعة (0269، مرجعٌ بلا مفتاحٍ أجنبيّ كـ0261).';

-- البابُ وحده يكتب الحساب: سياسةُ الجدول تمنح التحديثَ لكلّ الكادر (بابُ 0229 بصلاحية المنادي)، فالتجميدُ بمحفّز (درسُ 0162).
create or replace function public.clinic_drugs_billing_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.dose_price is not null or new.dose_qty is not null or new.dose_unit is not null or new.product_id is not null then
        raise exception 'dose_billing_door' using hint = 'سعر الجرعة وربطها بالمخزن يتحدّدون من الإعدادات بس';
      end if;
    elsif (new.dose_price, new.dose_qty, new.dose_unit, new.product_id)
          is distinct from (old.dose_price, old.dose_qty, old.dose_unit, old.product_id) then
      raise exception 'dose_billing_door' using hint = 'سعر الجرعة وربطها بالمخزن يتحدّدون من الإعدادات بس';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.clinic_drugs_billing_guard() from public, anon, authenticated;
drop trigger if exists clinic_drugs_billing_guard on public.clinic_drugs;
create trigger clinic_drugs_billing_guard before insert or update on public.clinic_drugs
  for each row execute function public.clinic_drugs_billing_guard();

-- ── ٢) حسابُ الجرعة: السعرُ وما يُخصم — مرآتُه dosePlan (src/lib/doseBilling.ts) ─────────────
-- السعرُ: المكتوبُ، وإلا سعرُ الوحدة × الكمّية (الغائبةُ ١) مقرَّباً لدينار — **الضربُ قبل القسمة** ((سعرُ العلبة × الكمّية) ÷ العدد):
-- قسمةٌ أوّلاً تقرّب عند منزلتها فيسقط نصفٌ تامّ (١ ÷ ٣ × ١٫٥ = ٠٫٤٩٩… لا ٠٫٥) ولا تتبعه مرآة. والمخصومُ بوحدة الرصيد (العلبة) بثلاث
-- منازل كما يخزّنه retail_checkout (v_stockq numeric(14,3)) وكما يرسله البيعُ للمفرد (lineStockQty) — لقطةٌ بتسعٍ كانت تُخصم بثلاث.
create or replace function public._dose_plan(p_price numeric, p_qty numeric, p_unit text, p_sell numeric, p_sub numeric, p_upb numeric,
                                             out price numeric, out stock_qty numeric)
language sql immutable set search_path = public as $$
  select coalesce(p_price,
           case when p_unit = 'sub' and coalesce(p_upb, 0) > 0
                  then round(coalesce(p_sub * coalesce(p_qty, 1), p_sell * coalesce(p_qty, 1) / p_upb))
                when p_unit = 'box' then round(coalesce(p_sell, 0) * coalesce(p_qty, 1)) end),
         case when p_unit = 'sub' and coalesce(p_upb, 0) > 0 then round(coalesce(p_qty, 1) / p_upb, 3)
              when p_unit = 'box' then round(coalesce(p_qty, 1), 3) end
$$;
revoke all on function public._dose_plan(numeric, numeric, text, numeric, numeric, numeric) from public, anon;
grant execute on function public._dose_plan(numeric, numeric, text, numeric, numeric, numeric) to authenticated;

create or replace function public.clinic_drug_billing_set(p_clinic uuid, p_id uuid, p_price numeric, p_product uuid, p_qty numeric, p_unit text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  d        clinic_drugs;
  p        products;
  v_unit   text;
  v_qty    numeric := p_qty;
  v_can    boolean;
  v_ph     boolean;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة على هذا الجهاز — حدّث الصفحة. ما انحفظ شي.';
  end if;
  -- staff_can وis_photographer من 0222 ويُسألان بـexecute (كـreport_pnl، 0256): تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي «لا توجد»
  -- بدل الجواب. وبلا staff_can لا قالبَ أذونات بالقاعدة — فالمديرُ وحده، كما كان قبل 0222.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'manageInventory';
  else
    v_can := coalesce(auth_role(), '') = 'manager';
  end if;
  if coalesce(v_ph, false) or not coalesce(v_can, false) then
    raise exception 'dose_billing_denied' using hint = 'سعر الجرعة وربطها بالمخزن لمن عنده صلاحية المخزون';
  end if;
  select * into d from clinic_drugs c where c.id = p_id and c.clinic_id = v_clinic for update;
  if not found or d.archived_at is not null then
    raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
  end if;
  if p_price is not null and (p_price < 0 or p_price > 1000000000) then
    raise exception 'dose_price_bad' using hint = 'سعر الجرعة لازم يكون صفر أو أكثر';
  end if;
  if p_product is null then
    v_qty := null;
  else
    select * into p from products x where x.id = p_product and x.clinic_id = v_clinic;
    if not found then
      raise exception 'dose_product_gone' using hint = 'المادة ما عادت موجودة بالمخزن — اختارها من جديد';
    end if;
    if coalesce(p.price_currency, 'IQD') = 'USD' then
      raise exception 'dose_product_usd' using hint = 'مادة مسعّرة بالدولار ما تنربط بجرعة — الجرعة تنحسب بالدينار';
    end if;
    v_unit := coalesce(nullif(btrim(p_unit), ''), 'box');
    if v_unit not in ('box', 'sub') or (v_unit = 'sub' and not (coalesce(p.has_sub_unit, false) and coalesce(p.units_per_box, 0) > 0)) then
      raise exception 'dose_unit_bad' using hint = 'هالمادة ما بيها وحدة صغرى — اختار الوحدة الأساسية';
    end if;
    if v_qty is not null and (v_qty <= 0 or v_qty > 100000) then
      raise exception 'dose_qty_bad' using hint = 'كمية الجرعة لازم تكون أكثر من صفر';
    end if;
  end if;
  update clinic_drugs c set dose_price = p_price, dose_qty = v_qty, dose_unit = v_unit, product_id = p_product, updated_at = now()
   where c.id = d.id;
  return clinic_drugs_list();
end $$;
revoke all on function public.clinic_drug_billing_set(uuid, uuid, numeric, uuid, numeric, text) from public, anon;
grant execute on function public.clinic_drug_billing_set(uuid, uuid, numeric, uuid, numeric, text) to authenticated;

-- ── ٣) المعلَّق: صفٌّ لكلّ جرعةٍ معطاة، قراءةٌ فقط والكتابةُ من الدوالّ ───────────────
create table if not exists public.dose_charges (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic(),
  entry_id   uuid not null,
  pet_id     uuid not null,
  drug_id    uuid,
  product_id uuid,
  name       text not null,
  price      numeric not null check (price >= 0),
  stock_qty  numeric check (stock_qty is null or stock_qty >= 0),   -- صفرٌ لجرعةٍ دون ٠٫٠٠٠٥ علبة (كبيع المفرد) — لا يمنع تسجيلَ الجرعة
  dose_qty   numeric,
  dose_unit  text,
  given_at   timestamptz not null,
  status     text not null default 'pending' check (status in ('pending', 'billed', 'void')),
  invoice_id uuid,
  billed_at  timestamptz,
  voided_at  timestamptz,
  created_at timestamptz not null default now(),
  check ((product_id is null) = (stock_qty is null)),
  check ((status = 'billed') = (invoice_id is not null))
);
comment on table public.dose_charges is
  'جرعةٌ معطاةٌ بالطبلة لدواءٍ له سعرٌ أو مادّة (0269): معلَّقةٌ حتى تُباع لزبونها، أو تُلغى بإلغاء الإعطاء.';
create unique index if not exists dose_charges_entry_live on public.dose_charges (entry_id) where status <> 'void';
create index if not exists dose_charges_pending on public.dose_charges (clinic_id, pet_id) where status = 'pending';
create index if not exists dose_charges_invoice on public.dose_charges (invoice_id) where invoice_id is not null;

alter table public.dose_charges enable row level security;
drop policy if exists dose_charges_select on public.dose_charges;
create policy dose_charges_select on public.dose_charges for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.dose_charges from public, anon, authenticated;
grant select on table public.dose_charges to authenticated;
-- السياجُ من 0222 (تراجعُها يحذف دالّتَه — فإعادةُ هذه بعده لا تفشل). verify_photographer_fence يمسك الغيابَ بالإنتاج.
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('dose_charges');
  end if;
end $$;

-- ── ٤) الطبلة: ختمُ «تُحسب؟» عند الإدراج، والمعلَّقُ عند الإعطاء ───────────────────
alter table public.treatment_entries add column if not exists bill boolean;
comment on column public.treatment_entries.bill is
  'هل تُحسب الجرعةُ بيعاً حين تُعطى (0269)؟ تُختم عند الإدراج: البيعُ يكتب false (بِيعت أصلاً)، والغائبُ = معلَّقةٌ أو بزيارة.';

-- والختمُ قرارُ الإدراج: الكادرُ لا يقلبه بعده (سياسةُ الطبلة تمنح التحديثَ للكلّ — التجميدُ بمحفّز، درسُ 0162): false يُطفئ حسابَ
-- جرعة، وtrue على جرعةٍ بِيعت ثمّ إلغاءٌ وإعادة يحسبها مرّتين.
create or replace function public.treatment_entries_bill_stamp()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.bill is null then
      new.bill := (new.administered_at is null or new.visit_id is not null);
    end if;
  elsif current_user = 'authenticated' and new.bill is distinct from old.bill then
    raise exception 'dose_bill_frozen' using hint = 'حساب الجرعة يتحدّد لمّا تنكتب — ما يتغيّر بعدها';
  end if;
  return new;
end $$;
revoke all on function public.treatment_entries_bill_stamp() from public, anon, authenticated;
drop trigger if exists treatment_entries_bill_stamp on public.treatment_entries;
create trigger treatment_entries_bill_stamp before insert or update on public.treatment_entries
  for each row execute function public.treatment_entries_bill_stamp();

-- يكتب بجدولٍ قراءةٌ فقط ⇒ definer، وعيادتُه عيادةُ الصفّ الذي مرّ من سياسة الطبلة (لا عيادةَ يختارها المنادي).
create or replace function public.treatment_entries_dose_charge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d      record;
  v_use  boolean;
  v_plan record;
begin
  if tg_op = 'UPDATE' and old.administered_at is not null and new.administered_at is null then
    update dose_charges c set status = 'void', voided_at = now()
     where c.entry_id = new.id and c.clinic_id = new.clinic_id and c.status = 'pending';
    return null;
  end if;
  -- bill فارغٌ على صفٍّ قبل 0269 وحده (الإدراجُ يُختم دائماً): لا يُحسب — لا يُعرف أهو خطّةٌ أم جرعةٌ بِيعت بالكاشير لتُعطى لاحقاً
  -- (البيعُ القديم كان يكتب المؤجَّلةَ معلَّقةً بلا زيارة كخطّة الطبيب تماماً). حسابٌ ناقصٌ لخططٍ سبقت النشر أهونُ من بيعٍ مرّتين.
  if new.administered_at is null or not coalesce(new.bill, false) then return null; end if;
  if tg_op = 'UPDATE' and old.administered_at is not null then return null; end if;   -- إعادةُ ختمِ معطاة: لا شيء
  if exists (select 1 from dose_charges c where c.entry_id = new.id and c.status <> 'void') then return null; end if;

  select dr.id, dr.name, dr.dose_price, dr.dose_qty, dr.dose_unit, dr.product_id,
         p.id as pid, p.sell_price, p.sub_unit_price, p.units_per_box, coalesce(p.price_currency, 'IQD') as cur
    into d
    from clinic_drugs dr
    left join products p on p.id = dr.product_id and p.clinic_id = dr.clinic_id
   where dr.clinic_id = new.clinic_id and dr.archived_at is null
     and search_norm(dr.name) = search_norm(new.medication)
     and (dr.dose_price is not null or dr.product_id is not null)
   limit 1;
  if not found then return null; end if;

  -- المادّةُ تُستعمل إن بقيت بالعيادة بالدينار وبوحدةٍ قائمة؛ وإلا فالسعرُ المكتوبُ وحده (بلا مخزن)، أو لا حساب.
  v_use := d.pid is not null and d.cur <> 'USD' and (d.dose_unit = 'box' or (d.dose_unit = 'sub' and coalesce(d.units_per_box, 0) > 0));
  if v_use then
    select * into v_plan from _dose_plan(d.dose_price, d.dose_qty, d.dose_unit, d.sell_price, d.sub_unit_price, d.units_per_box);
  else
    select d.dose_price as price, null::numeric as stock_qty into v_plan;
  end if;
  if v_plan.price is null then return null; end if;

  insert into dose_charges (clinic_id, entry_id, pet_id, drug_id, product_id, name, price, stock_qty, dose_qty, dose_unit, given_at)
  values (new.clinic_id, new.id, new.pet_id, d.id, case when v_use then d.pid end, d.name, v_plan.price,
          case when v_use then v_plan.stock_qty end, case when v_use then coalesce(d.dose_qty, 1) end,
          case when v_use then d.dose_unit end, new.administered_at)
  on conflict (entry_id) where status <> 'void' do nothing;
  return null;
end $$;
revoke all on function public.treatment_entries_dose_charge() from public, anon, authenticated;
drop trigger if exists treatment_entries_dose_charge on public.treatment_entries;
create trigger treatment_entries_dose_charge after insert or update of administered_at on public.treatment_entries
  for each row execute function public.treatment_entries_dose_charge();

-- ── ٥) البيع: معلَّقاتُ الزبون، والبيعُ يختمها بمعاملته ──────────────────────────
create or replace function public.dose_charges_pending(p_phone text, p_name text, p_pets uuid[] default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_dial   text;
  v_key    text;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
  v_key := cust_key(p_phone, p_name, v_dial);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'pet_id', c.pet_id, 'pet_name', pt.name, 'name', c.name, 'price', c.price,
             'product_id', pr.id, 'stock_qty', case when pr.id is not null then c.stock_qty end,
             'dose_qty', case when pr.id is not null then c.dose_qty end, 'dose_unit', case when pr.id is not null then c.dose_unit end,
             'given_at', c.given_at)
           order by c.given_at, c.id)
      from dose_charges c
      join pets pt on pt.id = c.pet_id
      -- المادّةُ «الفعّالة»: باقيةٌ بالعيادة وبالدينار، وإلا تُباع الجرعةُ بسعرها بلا مخزن (مادّةٌ حُذفت أو دُمجت أو صارت بالدولار كانت
      -- ترفض البيعةَ بمفتاحها الأجنبيّ أو usd_product_in_iqd — والجرعةُ معلَّقةٌ للأبد). والبيعةُ تقيسها بالشرط نفسِه (v_eff).
      left join products pr on pr.id = c.product_id and pr.clinic_id = c.clinic_id and coalesce(pr.price_currency, 'IQD') <> 'USD'
     where c.clinic_id = v_clinic and c.status = 'pending'
       and (c.pet_id = any(coalesce(p_pets, '{}'::uuid[]))
            or (v_key is not null and cust_key(pt.owner_phone, pt.owner_name, v_dial) = v_key))), '[]'::jsonb);
end $$;
revoke all on function public.dose_charges_pending(text, text, uuid[]) from public, anon;
grant execute on function public.dose_charges_pending(text, text, uuid[]) to authenticated;

create or replace function public.retail_checkout_doses(p_items jsonb, p_meta jsonb, p_charges uuid[])
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(p_meta->>'client_ref'), '');
  v_prev   uuid;
  v_inv    invoices;
  v_want   uuid[];
  v_lines  uuid[];
  c        record;
  e        jsonb;
  v_eff    uuid;
  v_seen   integer := 0;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_charges is null or cardinality(p_charges) = 0 then
    return retail_checkout(p_items, p_meta);
  end if;
  if v_ref is null then
    raise exception 'dose_charge_ref' using hint = 'بيعة الجرعات تحتاج مرجع — حدّث الصفحة وعيد البيع';
  end if;
  -- السطورُ تحمل الجرعاتِ نفسَها مرّةً لكلٍّ: لا جرعةَ تُختم بلا سطرٍ يبيعها، ولا سطرَ جرعةٍ بلا ختم.
  select array_agg(x order by x) into v_want from unnest(p_charges) x;
  select array_agg((l->>'dose_charge')::uuid order by (l->>'dose_charge')::uuid) into v_lines
    from jsonb_array_elements(p_items) l where nullif(l->>'dose_charge', '') is not null;
  if v_lines is distinct from v_want or (select count(distinct x) from unnest(p_charges) x) <> cardinality(p_charges) then
    raise exception 'dose_charge_lines' using hint = 'سطور الجرعات بالسلّة ما تطابق — حدّث الصفحة وعيد البيع';
  end if;
  -- القفلُ أوّلاً ثمّ الفاتورةُ بالمرجع: إعادةٌ متزامنة تنتظر قفلَ الأولى فتجد فاتورتَها — قراءتُها قبل القفل كانت تقول «انحسبت
  -- من جهازٍ ثانٍ» عن جرعةٍ ختمتها المحاولةُ نفسُها.
  perform 1 from dose_charges dc where dc.id = any(p_charges) order by dc.id for update;
  select i.id into v_prev from invoices i where i.clinic_id = v_clinic and i.client_ref = v_ref;
  for c in select * from dose_charges dc where dc.id = any(p_charges) order by dc.id loop
    v_seen := v_seen + 1;
    if c.clinic_id <> v_clinic then
      raise exception 'dose_charge_gone' using hint = 'جرعة من هالبيعة انحسبت أو انلغت من جهاز ثاني — شلناها، عيد البيع';
    end if;
    -- مرجعٌ ثبتت فاتورتُه: الإعادةُ ترجعها كما هي — فكلُّ جرعةٍ فيها مختومةٌ بها، وجرعةٌ معلَّقةٌ نزلت بعد المحاولة الأولى ليست فيها
    -- (كانت تُختم «مفوتَرة» على فاتورةٍ لم تحسبها). وبلا فاتورة: المعلَّقُ وحده يُباع.
    if v_prev is not null and not (c.status = 'billed' and c.invoice_id = v_prev) then
      raise exception 'dose_charge_late' using hint = 'البيعة السابقة انسجلت بدون هالجرعات — شلناها (تنزل ببيعة جاية)، اضغط «إتمام» مرة ثانية';
    end if;
    if v_prev is null and c.status <> 'pending' then
      raise exception 'dose_charge_gone' using hint = 'جرعة من هالبيعة انحسبت أو انلغت من جهاز ثاني — شلناها، عيد البيع';
    end if;
    -- السطرُ بشكل بيع الشاشة نفسِه لتكلّفه _product_line_cost صحيحاً: الكميةُ كمّيةُ الجرعة بوحدتها (علبٌ أو وحداتٌ صغرى) والمخصومُ
    -- بالعلبة — «١ ومخصومٌ ٢» كان يُرفض pack_changed، و«١ ومخصومٌ ٠٫٢» يُكلَّف وحدةً صغرى واحدة عن اثنتين. وبلا مادّةٍ فعّالة: ١.
    v_eff := (select pr.id from products pr where pr.id = c.product_id and pr.clinic_id = c.clinic_id and coalesce(pr.price_currency, 'IQD') <> 'USD');
    select l into e from jsonb_array_elements(p_items) l where l->>'dose_charge' = c.id::text;
    if nullif(e->>'product_id', '')::uuid is distinct from v_eff
       or coalesce((e->>'qty')::numeric, 0) <> case when v_eff is not null then coalesce(c.dose_qty, 1) else 1 end
       or (v_eff is not null and coalesce((e->>'stock_qty')::numeric, -1) <> c.stock_qty) then
      raise exception 'dose_charge_lines' using hint = 'سطور الجرعات بالسلّة ما تطابق — حدّث الصفحة وعيد البيع';
    end if;
  end loop;
  if v_seen <> cardinality(p_charges) then
    raise exception 'dose_charge_gone' using hint = 'جرعة من هالبيعة انحسبت أو انلغت من جهاز ثاني — شلناها، عيد البيع';
  end if;
  v_inv := retail_checkout(p_items, p_meta);
  update dose_charges dc set status = 'billed', invoice_id = v_inv.id, billed_at = now()
   where dc.id = any(p_charges) and dc.status = 'pending';
  return v_inv;
end $$;
revoke all on function public.retail_checkout_doses(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.retail_checkout_doses(jsonb, jsonb, uuid[]) to authenticated;

-- ── ٦) القائمةُ تقول حسابَ الدواء ───────────────────────────────────────────
create or replace function public.clinic_drugs_list()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  return jsonb_build_object(
    'clinic', v_clinic,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'name', d.name, 'family', d.family, 'in_mine', d.in_mine, 'pos', d.pos,
               'dose_price', d.dose_price, 'dose_qty', d.dose_qty, 'dose_unit', d.dose_unit, 'product_id', d.product_id,   -- +0269
               'archived_at', d.archived_at, 'created_at', d.created_at, 'updated_at', d.updated_at)
             order by d.in_mine desc, d.pos, d.created_at, d.id)
        from clinic_drugs d
       where d.clinic_id = v_clinic), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
-- -0268                'id', g.id, 'name', g.name, 'pos', g.pos, 'archived_at', g.archived_at,
               'id', g.id, 'name', g.name, 'family', g.family, 'pos', g.pos, 'archived_at', g.archived_at,   -- +0268
               'created_at', g.created_at, 'updated_at', g.updated_at)
             order by (g.archived_at is not null), g.pos, g.archived_at desc, g.id)
        from clinic_drug_groups g
       where g.clinic_id = v_clinic), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', i.group_id, 'drug_id', i.drug_id, 'pos', i.pos)
             order by i.group_id, i.pos, i.drug_id)
        from clinic_drug_group_items i
       where i.clinic_id = v_clinic), '[]'::jsonb));
end $$;
revoke all on function public.clinic_drugs_list() from public, anon;
grant execute on function public.clinic_drugs_list() to authenticated;

reset lock_timeout;
