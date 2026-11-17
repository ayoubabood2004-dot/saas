-- ============================================================================
-- ٠٢٧٦ — أجورٌ إضافية بفاتورة الشراء (توصيل، نقل…) — على الشركة أو مدفوعةٌ لغيرها، وكلفةٌ أو مصروفٌ بقرار العيادة
--
-- طلبُ المالك (١٧/١١): «اريد خدمة جواهن اسمها اجور اضافية مثلا اجور توصيل … حتى الدكتور يعرف يسجل الاشياء بشكل صحيح انها فعلا
-- اكو اجور اضافية وتطلع بالحسابات والتقارير بشكل صحيح». وبسؤال: **الدكتور يختار بكلّ أجرة** «على الشركة» أو «دفعناها لغيرهم»،
-- و**كيف تُحسب خيارٌ بالإعدادات** بين اثنين: تُوزَّع على كلفة المواد، أو مصروفٌ بالأرباح والخسائر.
--
-- ── ثلاثةُ مواضع، كلٌّ بمعناه (كالخصم 0260 بالعكس) ─────────────────────────────────────────────────────
--   • **ما يُدان ويُدفع** (`purchases.total`): أجورُ «على الشركة» داخله — دفترُ الشركة (0224) وقائمتُها والتسديدُ و`amount_paid`
--     وحالةُ الفاتورة تقرأ total كما كانت، فتقول رقمَ الشركة حرفاً بلا سطرٍ فيها. وأجورُ «لغيرهم» (السائق) خارجه: لا دَينَ للشركة بها.
--     والمجموعُ قبل الخصم والأجور = total + discount − charges_company.
--   • **الكلفة**: «على الكلفة» (الافتراض) ⇒ الأجورُ كلُّها (الاثنتان) تُوزَّع على السطور بنسبة قيمتها — `_purchase_landed_cost(c,
--     أساس، مجموع)` = c × (الصافي + الأجور) ÷ المجموع بستّ منازل — فيدخل المتوسّطُ (0255) بما كلّفت الوحدةُ واصلةً، والربحُ يقولها
--     حين تُباع. «مصروف» ⇒ الكلفةُ كما 0260، والأرباحُ والخسائر تقرأ الأجورَ سطراً بشهر الفاتورة (`purchase_charges`).
--   • **الفاتورة**: `charges` قائمةُ الأجور كما كُتبت (اسمٌ، مبلغٌ بالدينار، ولمن، ودولارُها لفاتورة الدولار)، و`charges_company`
--     و`charges_other` مجموعاها بالدينار، و`charges_mode` كيف حُسبت — **مختومٌ على الفاتورة**: تبديلُ الإعداد لا يقلب ما سُجّل (كلفةٌ
--     دخلت المتوسّطَ وبيعت لا تُسترجع)، وتعديلُ الفاتورة يُبقي ختمَها؛ والتي تُضاف لها أجورٌ لأوّل مرّة تأخذ إعدادَ يومها.
--
-- ── الحدود ──────────────────────────────────────────────────────────────────────────────────────────
-- مبلغُ الأجرة موجبٌ واسمُها إلزاميّ (٦٠ حرفاً، عشرون أجرةً للفاتورة). وفاتورةٌ بلا قيمة (مجموعٌ ≤ صفر) لا تُوزَّع عليها أجورٌ «على
-- الكلفة» — تُرفض بجملة (charges_no_value) بدل أن تضيع الأجرةُ من الكلفة بصمت. وفاتورةُ الدولار أجورُها بالدولار، ودينارُ كلّ أجرةٍ
-- round(usd × rate, 2) بسعر الفاتورة (كسطورها). وجهازٌ ما تحدّث (بلا مفتاح charges) يُبقي أجورَ الفاتورة عند التعديل — إلا تبديلَ
-- عملة فاتورةٍ عليها أجور (charges_currency). والمشترياتُ نفسُها خارج الأرباح والخسائر كما كانت (0256) — الداخلُ أجورُ «مصروف» وحدها.
--
-- ── الحارسُ قبل أيّ تعريف ────────────────────────────────────────────────────────────────────────────
-- record_purchase وupdate_purchase نصُّ 0260 حرفاً، وrecord_purchase_fx وupdate_purchase_fx نصُّ 0274، وreport_pnl نصُّ 0275 — وفوق كلٍّ
-- أسطرٌ معلَّمة بـ`-- +0276` (والمستبدَلُ بـ`-- -0276 <الأصل>`)، وحارسُ الانجراف على بصمة شِفرة مصدره (`_drift_assert`).
-- `_purchase_unit_cost` (0260) لا تُمسّ: الجديدةُ `_purchase_landed_cost` تساويها حرفاً حين الأساسُ ≤ المجموع، وتسمح بما فوقه.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0275، **وقبل الواجهة** (الواجهةُ تسأل purchase_charges_state قبل أن تعرض الأجور؛ والقديمةُ
-- تعمل عليها: لا ترسل charges فلا أجور، وتعديلُها يُبقي المحفوظ). تراجع: أعد الدوالَّ الخمس حرفاً من 0260 و0274 و0275؛ والأعمدةُ تبقى —
-- وفاتورةٌ عليها أجورٌ قبل التراجع يبقى total فيها كما هو.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تبني عليه، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ تعريف ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.record_purchase_fx(jsonb,jsonb)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'purchase_payments' and column_name = 'fx') then
    raise exception 'needs_0275' using hint = 'طبّق 0274 ثمّ 0275 (الشراء بالدولار وفرقُ صرفه) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.record_purchase(jsonb,jsonb)', 'aa877a60c212481e43283d45b7366478', '-- +0276');
select public._drift_assert('public.update_purchase(uuid,jsonb,jsonb)', '53c24f5e89c2e14eb7485139e82b0147', '-- +0276');
select public._drift_assert('public.record_purchase_fx(jsonb,jsonb)', '254ba5eb2e91c6add3349799c79881c6', '-- +0276');
select public._drift_assert('public.update_purchase_fx(uuid,jsonb,jsonb)', 'a7e944367b557caed8a856dbdc9b445a', '-- +0276');
select public._drift_assert('public.report_pnl(timestamptz,timestamptz,text)', '6d70a61e3c0d49f6feeb6a5b9ac93f39', '-- +0276');

-- ── ١) الأعمدة ──────────────────────────────────────────────────────────────────────────────────────────
-- بلا NOT NULL على الفاتورة: صفٌّ قبل 0276 غائبُه null ويُقرأ صفراً (coalesce) — ولا لقطةَ قديمة تُسترجع فتفشل بقيدٍ جديد.
alter table public.purchases add column if not exists charges jsonb;
alter table public.purchases add column if not exists charges_company numeric(14,2);
alter table public.purchases add column if not exists charges_other numeric(14,2);
alter table public.purchases add column if not exists charges_mode text;
alter table public.purchases drop constraint if exists purchases_charges_ok;
alter table public.purchases add constraint purchases_charges_ok check (
  (charges is null or jsonb_typeof(charges) = 'array')
  and coalesce(charges_company, 0) >= 0 and coalesce(charges_other, 0) >= 0
  and (charges_mode is null or charges_mode in ('cost', 'expense')));
comment on column public.purchases.charges is
  'أجورٌ إضافية على الفاتورة (0276): [{label, amount (دينار), payee: company|other, usd?}]. ما على الشركة داخل total، وما لغيرها خارجه.';
comment on column public.purchases.charges_mode is
  'كيف حُسبت الأجور (0276) — مختومٌ من إعداد العيادة يومَ أُضيفت: cost تُوزَّع على كلفة السطور، expense سطرٌ بالأرباح والخسائر.';

alter table public.clinic_prefs add column if not exists purchase_charges_mode text not null default 'cost';
alter table public.clinic_prefs drop constraint if exists clinic_prefs_purchase_charges_mode_ok;
alter table public.clinic_prefs add constraint clinic_prefs_purchase_charges_mode_ok check (purchase_charges_mode in ('cost', 'expense'));

-- ── ٢) أدواتٌ داخلية ───────────────────────────────────────────────────────────────────────────────────
-- نصيبُ السطر من الخصم والأجور — نقيّةٌ بستّ منازل، ومرآتُها purchaseLandedCostU (src/lib/avgCost.ts) فلساً بفلس (cost-parity).
-- c كلفةُ الوحدة كما كُتبت، landed أساسُ الكلفة (الصافي + الأجور الموزَّعة)، gross المجموعُ قبل الخصم. أساسٌ يساوي المجموع أو غائب،
-- أو مجموعٌ ≤ صفر، أو بلا سعر ⇒ c كما هي؛ وإلا c × max(landed, 0) ÷ gross. ودون المجموع = _purchase_unit_cost حرفاً.
create or replace function public._purchase_landed_cost(c numeric, landed numeric, gross numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(c, 0) > 0 and coalesce(gross, 0) > 0 and coalesce(landed, gross) <> gross
              then public._cons_round_div(c * greatest(landed, 0), gross, 6)
              else c end
$$;
revoke all on function public._purchase_landed_cost(numeric, numeric, numeric) from public, anon, authenticated;

-- قائمةُ الأجور مطبَّعة: {list, company, other, company_usd, other_usd}. p_rate غائب ⇒ المبالغُ بالدينار (و`usd` يُهمل — يكتبه بابُ الدولار
-- وحده)؛ وإلا المبلغُ دولارٌ (usd، وإلا amount) ودينارُه round(usd × rate, 2). الاسمُ بلا فراغاتٍ زائدة، ولمن: company (الغائب) أو other.
create or replace function public._purchase_charges(p jsonb, p_rate numeric) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  x     jsonb;
  i     int := 0;
  v_out jsonb := '[]'::jsonb;
  v_lab text;
  v_pay text;
  v_amt numeric;
  v_usd numeric;
  v_c   numeric := 0;
  v_o   numeric := 0;
  v_cu  numeric := 0;
  v_ou  numeric := 0;
begin
  if p is not null and jsonb_typeof(p) <> 'null' then
    if jsonb_typeof(p) <> 'array' then
      raise exception 'bad_charges' using hint = 'الأجور الإضافية قائمة — حدّث الصفحة.';
    end if;
    if jsonb_array_length(p) > 20 then
      raise exception 'bad_charges' using hint = 'أكثر من ٢٠ أجرة بفاتورة وحدة.';
    end if;
    for x in select value from jsonb_array_elements(p) loop
      i := i + 1;
      if jsonb_typeof(x) <> 'object' then
        raise exception 'bad_charges' using hint = 'الأجور الإضافية قائمة — حدّث الصفحة.';
      end if;
      -- الفراغاتُ اللاتينيةُ الستّ وحدها (مرآتُها normCharges حرفاً — \s تختلف بين المحرّكَين بالفراغات اليونيكودية).
      v_lab := left(btrim(regexp_replace(coalesce(x->>'label', ''), '[ \t\n\r\f\v]+', ' ', 'g')), 60);
      if v_lab = '' then
        raise exception 'charge_label' using hint = format('اكتب شنو الأجرة بالسطر %s (مثلاً أجور توصيل).', i);
      end if;
      v_pay := coalesce(nullif(x->>'payee', ''), 'company');
      if v_pay not in ('company', 'other') then
        raise exception 'bad_charges' using hint = 'الأجرة على الشركة أو مدفوعة لغيرهم.';
      end if;
      if p_rate is null then
        v_usd := null;
        v_amt := round(public.safe_num(x->>'amount'), 2);
      else
        v_usd := round(coalesce(public.safe_num(x->>'usd'), public.safe_num(x->>'amount')), 2);
        v_amt := round(v_usd * p_rate, 2);
      end if;
      if v_amt is null or v_amt <= 0 or v_amt >= 1e12 or (p_rate is not null and coalesce(v_usd, 0) <= 0) then
        raise exception 'charge_amount' using hint = format('مبلغ الأجرة بالسطر %s لازم أكبر من صفر.', i);
      end if;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('label', v_lab, 'amount', v_amt, 'payee', v_pay, 'usd', v_usd)));
      if v_pay = 'company' then v_c := v_c + v_amt; v_cu := v_cu + coalesce(v_usd, 0);
      else v_o := v_o + v_amt; v_ou := v_ou + coalesce(v_usd, 0); end if;
    end loop;
  end if;
  return jsonb_build_object('list', v_out, 'company', v_c, 'other', v_o, 'company_usd', v_cu, 'other_usd', v_ou);
end $$;
revoke all on function public._purchase_charges(jsonb, numeric) from public, anon, authenticated;

-- إعدادُ العيادة: «على الكلفة» ما لم تختر «مصروف» (والغائبُ — بلا صفّ تفضيلات — على الكلفة).
create or replace function public._purchase_charges_mode(p_clinic uuid) returns text
language sql stable set search_path = public as $$
  select coalesce((select c.purchase_charges_mode from clinic_prefs c where c.clinic_id = p_clinic), 'cost')
$$;
revoke all on function public._purchase_charges_mode(uuid) from public, anon, authenticated;

-- ── ٣) التجميد: الأجورُ وختمُها لا تُكتب إلا من دوالّ الشراء، والإعدادُ من بابه ─────────────────────────────────
-- سياسةُ الفواتير (purchases_write، 0064) تفتح الكتابةَ المباشرة للمدير والطبيب، وسياسةُ التفضيلات لكلّ الكادر — فعمودٌ يقرؤه الربحُ
-- لا يُترك لها (درسُ 0162): محفّزٌ يحرس `authenticated` وحده (دوالُّ المالك تمرّ)، فهو invoker لا definer.
create or replace function public.purchases_charges_freeze() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       (tg_op = 'INSERT' and (new.charges is not null or coalesce(new.charges_company, 0) <> 0
                              or coalesce(new.charges_other, 0) <> 0 or new.charges_mode is not null))
    or (tg_op = 'UPDATE' and (new.charges, new.charges_company, new.charges_other, new.charges_mode)
                             is distinct from (old.charges, old.charges_company, old.charges_other, old.charges_mode))) then
    raise exception 'purchase_charges_door' using hint = 'الأجور الإضافية تنكتب من فاتورة الشراء — حدّث الصفحة.';
  end if;
  return new;
end $$;
revoke all on function public.purchases_charges_freeze() from public, anon;
drop trigger if exists purchases_charges_freeze on public.purchases;
create trigger purchases_charges_freeze before insert or update on public.purchases
  for each row execute function public.purchases_charges_freeze();

create or replace function public.clinic_prefs_charges_freeze() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       (tg_op = 'INSERT' and new.purchase_charges_mode <> 'cost')
    or (tg_op = 'UPDATE' and new.purchase_charges_mode is distinct from old.purchase_charges_mode)) then
    raise exception 'purchase_charges_mode_door' using hint = 'طريقة حساب أجور المشتريات تتغيّر من الإعدادات (للمدير).';
  end if;
  return new;
end $$;
revoke all on function public.clinic_prefs_charges_freeze() from public, anon;
drop trigger if exists clinic_prefs_charges_freeze on public.clinic_prefs;
create trigger clinic_prefs_charges_freeze before insert or update on public.clinic_prefs
  for each row execute function public.clinic_prefs_charges_freeze();

-- ── ٤) إعادةُ الكتابة — نصُّ المصدر حرفاً وفوقه أسطرٌ معلَّمة (redefine-fingerprint) ─────────────────────────

-- ── ٤أ) الاستلام — نصُّ 0260، وأجورُ الشركة داخل total والأجورُ الموزَّعة بكلفة كلّ سطر ──────────────────────
create or replace function public.record_purchase(p_lines jsonb, p_meta jsonb DEFAULT '{}'::jsonb)
 returns purchases
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_company  uuid := nullif(p_meta->>'company_id','')::uuid;
  v_purchase purchases;
  it         jsonb;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_status   text;
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
  -- 0211: الكشف — كيف لُقيت المادة، وكيف كانت، وكيف صارت.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
  -- 0255: فرقُ الكلفة حين يستلم السطرُ على رصيدٍ سالبٍ بمتوسّطٍ معروف (purchase_effects.cost_variance).   -- +0255
  v_var      numeric;                                                                 -- +0255
  -- 0260: المجموعُ قبل الخصم، والخصمُ مقصوصاً عليه، وكلفةُ الوحدة للمتوسّط بعد نصيبها منه.   -- +0260
  v_gross    numeric(14,2);   -- +0260
  v_disc     numeric(14,2) := 0;   -- +0260
  v_ucost    numeric;   -- +0260
  -- 0276: الأجورُ الإضافية مطبَّعةً (_purchase_charges)، وما على الشركة (يدخل total) وما دُفع لغيرها، وكيف تُحسب، وأساسُ الكلفة.   -- +0276
  v_ch       jsonb;   -- +0276
  v_cc       numeric(14,2) := 0;   -- +0276
  v_oc       numeric(14,2) := 0;   -- +0276
  v_mode     text;   -- +0276
  v_landed   numeric(14,2);   -- +0276
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;
  end loop;
  -- 0260: الخصمُ من رأس الفاتورة: ما يُدفع وما يُدان (total) صافٍ، والمجموعُ قبله يُحفظ بفرقهما (discount). سالبٌ أو غائبٌ صفر،   -- +0260
  -- وأكبرُ من المجموع يُقصّ عليه، ومجموعٌ ≤ صفر (سطرٌ بسعرٍ سالب — كان يُقبل) بلا خصم: القصُّ عليه كان يكتب خصماً سالباً   -- +0260
  -- فيرفضه القيدُ ويسقط شراءٌ كان يمرّ. والمدفوعُ والحالةُ أدناه على الصافي كما كانا على المجموع.   -- +0260
  v_gross := v_total;   -- +0260
  v_disc  := case when v_gross > 0 then least(greatest(coalesce(nullif(p_meta->>'discount','')::numeric, 0), 0), v_gross) else 0 end;   -- +0260
  v_total := v_gross - v_disc;   -- +0260
  -- 0276: الأجورُ الإضافية (توصيل، نقل…): ما على الشركة يدخل total — ما يُدان ويُدفع، فدفترُ الشركة وتسديدُها بلا تغيير — وما دُفع   -- +0276
  -- لغيرها (السائق) خارجه. وكيف تُحسب قرارُ العيادة يُختم على الفاتورة: «على الكلفة» تُوزَّع كلُّها على السطور بنسبة قيمتها (الخصمُ   -- +0276
  -- بالعكس، _purchase_landed_cost)، و«مصروف» تبقى كلفةُ السطور كما هي وتقرؤها الأرباحُ والخسائر بشهر الفاتورة. وفاتورةٌ بلا قيمة   -- +0276
  -- لا تُوزَّع عليها أجورٌ «على الكلفة» — تُرفض بجملة بدل أن تضيع الأجرةُ من الكلفة بصمت.   -- +0276
  v_ch := public._purchase_charges(p_meta->'charges', null);   -- +0276
  v_cc := (v_ch->>'company')::numeric;   -- +0276
  v_oc := (v_ch->>'other')::numeric;   -- +0276
  v_mode := case when v_cc + v_oc > 0 then public._purchase_charges_mode(v_clinic) end;   -- +0276
  if v_mode = 'cost' and v_gross <= 0 then   -- +0276
    raise exception 'charges_no_value' using hint = 'الفاتورة بلا قيمة — الأجور ما تنوزّع على كلفة موادها. اكتب أسعار الشراء أو شيل الأجور.';   -- +0276
  end if;   -- +0276
  v_total := v_total + v_cc;   -- +0276
  v_landed := v_gross - v_disc + case when v_mode = 'cost' then v_cc + v_oc else 0 end;   -- +0276

  v_paid   := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);
  v_status := case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end;

  insert into purchases (clinic_id, company_id, company_name, reference, total, item_count,
                         amount_paid, payment_method, status, supplier_name, supplier_phone,
-- -0260                          notes, purchased_at, staff_id)
-- -0276                          notes, purchased_at, staff_id, discount)   -- +0260
                         notes, purchased_at, staff_id, discount, charges, charges_company, charges_other, charges_mode)   -- +0276
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'supplier_name',''), nullif(p_meta->>'supplier_phone',''),
          nullif(p_meta->>'notes',''), coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, now()),
-- -0260           nullif(p_meta->>'staff_id','')::uuid)
-- -0276           nullif(p_meta->>'staff_id','')::uuid, v_disc)   -- +0260
          nullif(p_meta->>'staff_id','')::uuid, v_disc, nullif(v_ch->'list', '[]'::jsonb), v_cc, v_oc, v_mode)   -- +0276
  returning * into v_purchase;

  -- 0255: موادُّ السطور كلُّها تُقفل مرّةً بالمعرّف قبل أوّل سطر — ترتيبُ البيعة والسند والجرد نفسُه، فشراءٌ [ب، أ]   -- +0255
  -- وبيعةٌ أو جردٌ [أ، ب] لا ينسدّان (كان السطرُ يقفل مادّتَه بترتيب الفاتورة). ما يحمل معرّفَه بمعرّفه، وما يُطابَق   -- +0255
  -- بالباركود أو بالاسم بالمطابقة نفسِها التي تجريها الحلقة (الباركودُ الموحَّد والرموزُ الإضافية، ثمّ الاسم) — كان يُقفل   -- +0255
  -- بسطره، فشراءٌ [باركود ب، معرّف أ] وبيعةٌ [أ، ب] ينسدّان (40P01). والحلقةُ تطابق ثانيةً كما كانت (السلوكُ نفسُه):   -- +0255
  -- مادّةٌ يولدها سطرٌ سابق، أو تُدرج بين الجملتين، تُقفل بسطرها كما كانت — ولا قفلَ يضيع.   -- +0255
  perform 1 from products                                                             -- +0255
   where clinic_id = v_clinic                                                         -- +0255
     and id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x   -- +0255
                 where x->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'   -- +0255
                union                                                                 -- +0255
                select coalesce(                                                      -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and inv_norm_code(x->>'barcode') <> ''   -- +0255
                             and ((inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '')   -- +0255
                                  or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a   -- +0255
                                              where inv_norm_code(a) = inv_norm_code(x->>'barcode')))   -- +0255
                           order by (inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '') desc,   -- +0255
                                    (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1),                                                  -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and length(inv_norm_name(x->>'name')) >= 2   -- +0255
                             and inv_norm_name(x->>'name') <> 'item' and inv_norm_name(p.name) = inv_norm_name(x->>'name')   -- +0255
                           order by (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1))                                                  -- +0255
                  from jsonb_array_elements(p_lines) x                                -- +0255
                 where nullif(x->>'product_id','') is null)                           -- +0255
   order by id for update;                                                            -- +0255

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    -- 0260: كلفةُ الوحدة للمتوسّط بعد نصيبها من الخصم (v_total هنا صافٍ)؛ والمكتوبُ (v_cost) يبقى للسطر ولآخر سعر شراء.   -- +0260
-- -0276     v_ucost := public._purchase_unit_cost(v_cost, v_total, v_gross);   -- +0260
    -- 0276: نصيبُ السطر من الخصم ومن الأجور الموزَّعة معاً — v_landed أساسُ الكلفة (v_total صار يحمل أجورَ الشركة).   -- +0276
    v_ucost := public._purchase_landed_cost(v_cost, v_landed, v_gross);   -- +0276
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;
    v_var  := null;                                                                   -- +0255

    -- المطابقة بالباركود **الموحَّد**: ٥٣٩١ و5391 قطعةٌ واحدة. والرموزُ
    -- الإضافية تُقرأ معه (0166) — المنتجُ له رمزٌ واحد بالنظام وعدّةُ رموزٍ
    -- بالواقع. وعند التعدد يغلب **الأساسيّ** ثم قطعةُ الشركة نفسها ثم
    -- المصنَّفة ثم الأقدم.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    -- مطابقةُ الاسم احتياطاً: القطعة المسجّلة بلا باركود تُشترى باسمها فتُرصَّد
    -- بمكانها **وتتعلّم** الباركود الممسوح — بدل توأمٍ أعمى بـ«بدون صنف».
    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      -- 0255: المادّةُ مقفولةٌ قبل صورتها — فالفرقُ والمتوسّطُ يُحسبان من الصفّ نفسِه الذي يحدّثه الـSET.   -- +0255
      perform 1 from products where id = v_pid and clinic_id = v_clinic for update;   -- +0255
      select * into v_before from products where id = v_pid and clinic_id = v_clinic;
      if found then v_bj := purchase_effect_snap(v_before); end if;
      if v_before.id is not null and v_before.farm_id is null then                    -- +0255
        v_var := public._avg_variance(coalesce(v_before.stock, 0),                    -- +0255
-- -0260                    public._avg_base(v_before.avg_cost, v_before.purchase_price), v_qty, v_cost);   -- +0255
                   public._avg_base(v_before.avg_cost, v_before.purchase_price), v_qty, v_ucost);   -- +0260
      end if;                                                                         -- +0255
      update products set
-- -0253         stock          = greatest(0, coalesce(stock, 0) + v_qty),
        -- 0253: عجزٌ أكبرُ من الشراء يبقى ظاهراً (−٠٫٠٤ + ٠٫٠٢ = −٠٫٠٢ لا صفر)، والموجبُ كما كان. -- +0253
        stock          = greatest(least(coalesce(stock, 0), 0), coalesce(stock, 0) + v_qty), -- +0253
        -- 0255: المتوسّطُ المتحرّك (مخزنُ الحقل خارجه) — والـSET يرى الصفَّ القديم: رصيدَه وأساسَ كلفته   -- +0255
        -- (_avg_base: متوسّطُه، وإلا سعرُ شرائه، والصفرُ مجهول) قبل هذا الاستلام.    -- +0255
        -- والمجهولُ (null) لا يُكتب فوق المخزَّن: سطرٌ مجّانيٌّ أو بلا كمية يرجع الأساسَ، والأساسُ لمتوسّطٍ صفرٍ صريح (تصحيحُ   -- +0255
        -- المدير) مجهول — فكان ٥ مجّاناً تمحو الصفرَ وتعيد الكلفةَ لسعر الشراء. القاعدةُ للمدفوع كما هي (صفرٌ ثمّ ٥ بـ٨٠٠ ⇒ ٨٠٠).   -- +0255
        avg_cost       = (case when farm_id is null                                   -- +0255
-- -0260                                then coalesce(public._avg_receive(coalesce(stock, 0), public._avg_base(avg_cost, purchase_price), v_qty, v_cost),   -- +0255
                               then coalesce(public._avg_receive(coalesce(stock, 0), public._avg_base(avg_cost, purchase_price), v_qty, v_ucost),   -- +0260
                                             avg_cost)                                -- +0255
                               else avg_cost end),                                    -- +0255
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ (`repo.ts`) منذ البداية. الحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        -- تعلُّم الباركود: القطعة بلا باركودٍ تكسبه من أول مسحة — ولا يُستبدل
        -- باركودٌ قائم أبداً.
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; end if;
      if v_pid is null then v_var := null; end if;                                    -- +0255
    end if;

    if v_pid is null then
      -- الصنف المختار للقطعة الجديدة — يُقبل فقط إن كان صنفاً حقيقياً بهذه
      -- العيادة ولهذه الشركة، وإلا سقط بصمتٍ إلى «بدون صنف».
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
-- -0255                             purchase_price, sell_price, stock, min_stock, expiry_date)
                            purchase_price, sell_price, stock, min_stock, expiry_date, avg_cost)   -- +0255
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
-- -0255               coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date,   -- +0255
              -- 0255: المادّةُ الجديدة تبدأ بكلفة سطرها (وبلا كلفةٍ: مجهولة — تتبع سعرَ الشراء)   -- +0255
-- -0260               (case when v_cost > 0 then v_cost end))                                 -- +0255
              (case when v_ucost > 0 then v_ucost end))   -- +0260
      returning * into v_after;
      v_pid := v_after.id;
    end if;

    -- 0214: تاريخُ هذه الوجبة مع سطرها — للأبد، مهما تبدّل تاريخُ المنتج بعدها.
    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price, expiry_date)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell, coalesce(nullif(it->>'expiry_date','')::date, nullif(it->>'batch_expiry','')::date));

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
-- -0255                                   outcome, matched_by, qty, before, after, changed)
                                  outcome, matched_by, qty, before, after, changed, cost_variance)   -- +0255
    values (v_clinic, v_purchase.id, 'record', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
-- -0255             v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)), v_var);   -- +0255
  end loop;

  return v_purchase;
end $function$;
revoke all on function public.record_purchase(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase(jsonb, jsonb) to authenticated;

-- ── ٤ب) التعديل — نصُّ 0260، والقديمُ بما استلمه (خصمُه وأجورُه كما حُفظا) والجديدُ بأجوره ─────────────────────
create or replace function public.update_purchase(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_purchase purchases;
  v_company  uuid;
  it         jsonb;
  old_it     record;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
  -- كلُّ منتجٍ لمسته هذه الفاتورة — قديمِها وجديدِها. الحصرةُ النهائية عليه
  -- وحدَه: لا نمرّ على مخزن العيادة كلِّه، ولا نصحّح سالباً صنعه غيرُنا.
  v_touched  uuid[] := '{}';
  -- 0211: الكشف. `v_orig` صورةُ كلِّ منتجٍ **قبل التعديل** (قبل عكس السطور القديمة)
  -- فيقول الكشفُ «كان ٥ صار ٥» لا «كان −٤٥ صار ٥». و`v_oldq` كمياتُ السطور القديمة،
  -- و`v_seen` ما رجع بالسطور الجديدة — والباقي من `v_orig` مادّةٌ **شيلت** من الفاتورة.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
  v_orig     jsonb := '{}';
  v_oldq     jsonb := '{}';
  v_seen     uuid[] := '{}';
  v_k        text;
  -- 0255: متوسّطُ كلّ مادّةٍ لمستها الفاتورة: لقطتُها عند أوّل لمس (s0 الرصيد، a0 أساسُ الكلفة)، وقيمتا   -- +0255
  -- سطورها القديمة والجديدة (vo، vn؛ الصفريُّ بـa0)، وآخرُ كلفةٍ موجبة (cl) — يُحسب مرّةً بعد الحلقة.   -- +0255
  v_avg      jsonb := '{}';                                                           -- +0255
  v_ap       products;                                                                -- +0255
  v_a0       numeric;                                                                 -- +0255
  v_ak       text;                                                                    -- +0255
  v_made     boolean;                                                                 -- +0255
  v_was      numeric;                                                                 -- +0255
  v_now      numeric;                                                                 -- +0255
  -- 0260: المجموعُ الجديد قبل الخصم (v_gross)، والخصم (v_disc)، وكلفةُ الوحدة للمتوسّط بعد نصيبها (v_ucost)، وسطرُ الجمع المسبق.   -- +0260
  v_gross    numeric(14,2) := 0;   -- +0260
  v_disc     numeric(14,2) := 0;   -- +0260
  v_ucost    numeric;   -- +0260
  v_q2       numeric(14,3);   -- +0260
  v_c2       numeric(12,2);   -- +0260
  -- 0276: الأجورُ الجديدة (أو المحفوظةُ لجهازٍ ما تحدّث)، وأساسُ كلفة السطور الجديدة، وأساسُ استلام القديمة ومجموعُها كما حُفظا.   -- +0276
  v_ch       jsonb;   -- +0276
  v_cc       numeric(14,2) := 0;   -- +0276
  v_oc       numeric(14,2) := 0;   -- +0276
  v_mode     text;   -- +0276
  v_landed   numeric(14,2);   -- +0276
  v_ogross   numeric(14,2);   -- +0276
  v_olanded  numeric(14,2);   -- +0276
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  select * into v_purchase from purchases
   where id = p_purchase and clinic_id = v_clinic
   for update;
  if not found then raise exception 'purchase not found'; end if;
  v_company := v_purchase.company_id;
  -- 0260: المجموعُ الجديد قبل الخصم — قبل الحلقة وبتقريبها نفسِه (numeric(14,3) × numeric(12,2) يُجمع بمنزلتين سطراً سطراً)، لأن   -- +0260
  -- نسبةَ الخصم تلزم كلَّ سطرٍ داخلها. ومفتاحٌ غائب (جهازٌ ما تحدّث) يُبقي خصمَ الفاتورة كما حُفظ، مقصوصاً على مجموعها الجديد.   -- +0260
  for it in select * from jsonb_array_elements(p_lines) loop   -- +0260
    v_q2 := coalesce(nullif(it->>'qty','')::numeric, 0);   -- +0260
    v_c2 := coalesce(nullif(it->>'purchase_price','')::numeric, 0);   -- +0260
    v_gross := v_gross + v_q2 * v_c2;   -- +0260
  end loop;   -- +0260
  v_disc := case when v_gross > 0   -- +0260
                 then least(greatest(case when p_meta ? 'discount' then coalesce(nullif(p_meta->>'discount','')::numeric, 0)   -- +0260
                                          else coalesce(v_purchase.discount, 0) end, 0), v_gross)   -- +0260
                 else 0 end;   -- +0260
  -- 0276: الأجور: مفتاحٌ غائب (جهازٌ ما تحدّث) يُبقيها كما حُفظت. وطريقةُ حسابها مختومةٌ على الفاتورة — تعديلُها لا يقلبها لو تبدّل   -- +0276
  -- إعدادُ العيادة بعدها — وفاتورةٌ تُضاف لها أجورٌ لأوّل مرّة تأخذ إعدادَ اليوم.   -- +0276
  v_ch := public._purchase_charges(case when p_meta ? 'charges' then p_meta->'charges' else v_purchase.charges end, null);   -- +0276
  v_cc := (v_ch->>'company')::numeric;   -- +0276
  v_oc := (v_ch->>'other')::numeric;   -- +0276
  v_mode := case when v_cc + v_oc > 0 then coalesce(v_purchase.charges_mode, public._purchase_charges_mode(v_clinic)) end;   -- +0276
  if v_mode = 'cost' and v_gross <= 0 then   -- +0276
    raise exception 'charges_no_value' using hint = 'الفاتورة بلا قيمة — الأجور ما تنوزّع على كلفة موادها. اكتب أسعار الشراء أو شيل الأجور.';   -- +0276
  end if;   -- +0276
  v_landed := v_gross - v_disc + case when v_mode = 'cost' then v_cc + v_oc else 0 end;   -- +0276
  -- والسطورُ القديمة بما استلمها: مجموعُها قبل الخصم total + discount ناقصَ أجور الشركة (داخل total)، وأساسُها صافيها (total ناقصَ   -- +0276
  -- أجور الشركة) زائدَ الأجور كلِّها إن وُزّعت. فاتورةٌ قبل 0276 بلا أجور: total وtotal + discount كما كان 0260 حرفاً.   -- +0276
  v_ogross := v_purchase.total + coalesce(v_purchase.discount, 0) - coalesce(v_purchase.charges_company, 0);   -- +0276
  v_olanded := v_purchase.total - coalesce(v_purchase.charges_company, 0)   -- +0276
              + case when v_purchase.charges_mode = 'cost' then coalesce(v_purchase.charges_company, 0) + coalesce(v_purchase.charges_other, 0) else 0 end;   -- +0276
  -- 0255: موادُّ الفاتورة — سطورُها القديمة والجديدةُ كلُّها — تُقفل مرّةً بالمعرّف قبل أوّل عكس (ترتيبُ البيعة والسند   -- +0255
  -- والجرد نفسُه؛ كان العكسُ ثمّ السطرُ الجديد يقفلان بترتيب الفاتورة): ما يحمل معرّفَه بمعرّفه، وما يُطابَق بالباركود   -- +0255
  -- أو بالاسم بمطابقة الحلقة نفسِها (كانت تُقفل بسطرها: [باركود ب، معرّف أ] مع بيعة [أ، ب] انسداد). والحلقةُ تطابق ثانيةً   -- +0255
  -- كما كانت؛ ومادّةٌ يولدها سطرٌ سابق أو تُدرج بين الجملتين تُقفل بسطرها كما كانت.   -- +0255
  perform 1 from products                                                             -- +0255
   where clinic_id = v_clinic                                                         -- +0255
     and id in (select pi.product_id from purchase_items pi                           -- +0255
                 where pi.purchase_id = p_purchase and pi.clinic_id = v_clinic and pi.product_id is not null   -- +0255
                union                                                                 -- +0255
                select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x   -- +0255
                 where x->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'   -- +0255
                union                                                                 -- +0255
                select coalesce(                                                      -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and inv_norm_code(x->>'barcode') <> ''   -- +0255
                             and ((inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '')   -- +0255
                                  or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a   -- +0255
                                              where inv_norm_code(a) = inv_norm_code(x->>'barcode')))   -- +0255
                           order by (inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '') desc,   -- +0255
                                    (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1),                                                  -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and length(inv_norm_name(x->>'name')) >= 2   -- +0255
                             and inv_norm_name(x->>'name') <> 'item' and inv_norm_name(p.name) = inv_norm_name(x->>'name')   -- +0255
                           order by (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1))                                                  -- +0255
                  from jsonb_array_elements(p_lines) x                                -- +0255
                 where nullif(x->>'product_id','') is null)                           -- +0255
   order by id for update;                                                            -- +0255

  -- ── ١) اعكس أثر السطور القديمة — **بلا حصر** ──
  -- الحصرُ هنا كان يخترع بضاعةً (انظر الرأس). السالبُ الوسطيُّ مقصود، وتُغلقه
  -- الحصرةُ النهائية بعد بناء السطور الجديدة.
  -- 0253: ولا حصرةَ نهائية بعد اليوم (انظر ٢·٥) — الرصيدُ النهائيُّ يبقى كما هو ولو سالباً. -- +0253
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
    -- 0255: أوّلُ لمسٍ للمادّة: تُقفل قبل صورتها (العكسُ تحتها يقفلها أصلاً — لا ترتيبَ جديد)، وتُحفظ   -- +0255
    -- s0 وa0 وقيمةُ سطورها القديمة كلِّها بكلفة كلٍّ منها (والصفريُّ بـa0). الحقلُ والغائبةُ: تُتخطّى.   -- +0255
    if not (v_avg ? old_it.product_id::text) then                                     -- +0255
      select * into v_ap from products where id = old_it.product_id and clinic_id = v_clinic for update;   -- +0255
      if v_ap.id is not null and v_ap.farm_id is null then                            -- +0255
        v_a0 := public._avg_base(v_ap.avg_cost, v_ap.purchase_price);                 -- +0255
        v_avg := v_avg || jsonb_build_object(old_it.product_id::text, jsonb_build_object(   -- +0255
                   's0', coalesce(v_ap.stock, 0), 'a0', v_a0, 'vn', 0, 'cl', null,    -- +0255
-- -0260                    'vo', (select coalesce(sum(coalesce(pi.qty, 0) * (case when pi.purchase_price > 0 then pi.purchase_price else v_a0 end)), 0)   -- +0255
                   -- 0260: السطورُ القديمة بكلفة استلامها: نصيبُها من خصم الفاتورة كما حُفظ (total صافٍ، والمجموعُ total + discount)،   -- +0260
                   -- والصفرُ (سطرٌ مجّانيّ، أو خصمٌ أكل السطرَ كلَّه) بالأساس كما استلمه _avg_receive — فالعكسُ ما أدخله الاستلامُ بالضبط.   -- +0260
                   'vo', (select coalesce(sum(coalesce(pi.qty, 0) * (case when u.c > 0 then u.c else v_a0 end)), 0)   -- +0260
-- -0260                             from purchase_items pi                                    -- +0255
                            from purchase_items pi   -- +0260
-- -0276                             cross join lateral (select public._purchase_unit_cost(pi.purchase_price, v_purchase.total,   -- +0260
-- -0276                                                        v_purchase.total + coalesce(v_purchase.discount, 0)) as c) u   -- +0260
                            cross join lateral (select public._purchase_landed_cost(pi.purchase_price, v_olanded, v_ogross) as c) u   -- +0276
                           where pi.purchase_id = p_purchase and pi.clinic_id = v_clinic and pi.product_id = old_it.product_id)));   -- +0255
      else                                                                            -- +0255
        v_avg := v_avg || jsonb_build_object(old_it.product_id::text, jsonb_build_object('skip', true));   -- +0255
      end if;                                                                         -- +0255
    end if;                                                                           -- +0255
    if not (v_orig ? old_it.product_id::text) then
      select * into v_before from products where id = old_it.product_id and clinic_id = v_clinic;
      if found then v_orig := v_orig || jsonb_build_object(old_it.product_id::text, purchase_effect_snap(v_before)); end if;
    end if;
    v_oldq := v_oldq || jsonb_build_object(old_it.product_id::text,
                coalesce((v_oldq->>old_it.product_id::text)::numeric, 0) + coalesce(old_it.qty, 0));
    update products
       set stock = coalesce(stock, 0) - coalesce(old_it.qty, 0)
     where id = old_it.product_id and clinic_id = v_clinic;
    v_touched := v_touched || old_it.product_id;
  end loop;
  delete from purchase_items where purchase_id = p_purchase and clinic_id = v_clinic;

  -- ── ٢) نزّل السطور الجديدة — نفس مطابقة record_purchase حرفياً ──
  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
-- -0276     v_ucost := public._purchase_unit_cost(v_cost, v_gross - v_disc, v_gross);   -- 0260: نصيبُ السطر من الخصم الجديد   -- +0260
    v_ucost := public._purchase_landed_cost(v_cost, v_landed, v_gross);   -- 0276: نصيبُ السطر من الخصم والأجور الموزَّعة   -- +0276
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;
    v_made  := false;                                                                 -- +0255
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;

    -- الأساسيُّ أو أحدُ الإضافية، والأساسيُّ يغلب (0166) — كما بـrecord_purchase.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      -- 0255: مادّةٌ لم تلمسها السطورُ القديمة: أوّلُ لمسها هنا — تُقفل وتُصوَّر قبل سطرها.   -- +0255
      if not (v_avg ? v_pid::text) then                                               -- +0255
        select * into v_ap from products where id = v_pid and clinic_id = v_clinic for update;   -- +0255
        if v_ap.id is not null then                                                   -- +0255
          v_avg := v_avg || jsonb_build_object(v_pid::text, (case when v_ap.farm_id is not null then jsonb_build_object('skip', true)   -- +0255
                     else jsonb_build_object('s0', coalesce(v_ap.stock, 0), 'a0', public._avg_base(v_ap.avg_cost, v_ap.purchase_price),   -- +0255
                                             'vo', 0, 'vn', 0, 'cl', null) end));     -- +0255
        end if;                                                                       -- +0255
      end if;                                                                         -- +0255
      -- «كان» = صورتُه قبل التعديل كلِّه لأوّل سطرٍ يلمسه؛ وسطرٌ ثانٍ لنفس المادّة
      -- يرى ما تركه الأوّل (الحقيقةُ بالتسلسل).
      if v_orig ? v_pid::text and not (v_pid = any (v_seen)) then
        v_bj := v_orig->(v_pid::text);
      else
        select * into v_before from products where id = v_pid and clinic_id = v_clinic;
        if found then v_bj := purchase_effect_snap(v_before); end if;
      end if;
      update products set
        stock          = coalesce(stock, 0) + v_qty,   -- بلا حصر؛ الحصرةُ بالنهاية
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً، فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ منذ البداية. والحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; else v_touched := v_touched || v_pid; end if;
    end if;

    if v_pid is null then
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
      returning * into v_after;
      v_pid := v_after.id;
      v_touched := v_touched || v_pid;
      -- 0255: مادّةٌ وُلدت بهذا التعديل: سطرُها أوّلُ لمسها — رصيدُها وكلفتُه أساسٌ لما بعده (كاستلامٍ على لا شيء).   -- +0255
      v_avg := v_avg || jsonb_build_object(v_pid::text, jsonb_build_object(           -- +0255
-- -0260                  's0', coalesce(v_after.stock, 0), 'a0', (case when v_cost > 0 then v_cost end),   -- +0255
                 's0', coalesce(v_after.stock, 0), 'a0', (case when v_ucost > 0 then v_ucost end),   -- +0260
-- -0260                  'vo', 0, 'vn', 0, 'cl', (case when v_cost > 0 then v_cost end)));    -- +0255
                 'vo', 0, 'vn', 0, 'cl', (case when v_ucost > 0 then v_ucost end)));   -- +0260
      v_made := true;                                                                 -- +0255
    end if;

    -- 0214: تاريخُ **هذه الوجبة** يُحفظ مع سطرها. وبالتعديل يرسل المتصفّحُ تاريخَها
    -- المحفوظ بـ`batch_expiry` — يُحفظ للسطر ولا يلمس تاريخَ المنتج (وجبةٌ أحدث قد
    -- تكون غيّرته بعدها، وإعادةُ حفظ فاتورةٍ قديمة كانت سترجعه للقديم).
    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price, expiry_date)
    values (p_purchase, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell, coalesce(nullif(it->>'expiry_date','')::date, nullif(it->>'batch_expiry','')::date));

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
    v_seen := v_seen || v_pid;
    -- 0255: قيمةُ السطر بكلفته (والصفريُّ بـa0) وآخرُ كلفةٍ موجبة — إلا سطراً وَلّد مادّتَه (قيمتُه بأساسها).   -- +0255
    if not v_made and (v_avg ? v_pid::text) and not coalesce(((v_avg -> v_pid::text) ->> 'skip')::boolean, false) then   -- +0255
      v_avg := jsonb_set(v_avg, array[v_pid::text], (v_avg -> v_pid::text) || jsonb_build_object(   -- +0255
                 'vn', ((v_avg -> v_pid::text) ->> 'vn')::numeric                     -- +0255
-- -0260                        + v_qty * coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'a0')::numeric, 0),   -- +0255
                       + v_qty * coalesce((case when v_ucost > 0 then v_ucost end), ((v_avg -> v_pid::text) ->> 'a0')::numeric, 0),   -- +0260
-- -0260                  'cl', coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'cl')::numeric)));   -- +0255
                 'cl', coalesce((case when v_ucost > 0 then v_ucost end), ((v_avg -> v_pid::text) ->> 'cl')::numeric)));   -- +0260
    end if;                                                                           -- +0255
  end loop;

  -- ── ٢·٤) 0255: المتوسّطُ مرّةً لكلّ مادّة بعد إعادة التطبيق كلِّها، بالرصيد النهائيّ s1:   -- +0255
  -- _avg_adjust(s0, a0, vo, vn, s1, cl). الرصيدُ الحاضر وحده يُعاد تقييمُه، والفواتيرُ الصادرة بكلفتها،   -- +0255
  -- وما لم يتغيّر لا يُكتب (لا سطرَ تدقيقٍ فارغ). المادّةُ مقفولةٌ من أوّل لمس.      -- +0255
  -- والمجهولُ (null) لا يُكتب فوق المخزَّن — كالاستلام: أساسُ متوسّطٍ صفرٍ صريح مجهول، فسطورٌ مجّانيةٌ (أو رصيدٌ ≤ ٠)   -- +0255
  -- كانت تمحو الصفرَ وتعيد الكلفةَ لسعر الشراء؛ وكلفةٌ موجبة بالسطور تبقى تُكتب (coalesce(c_last, a0)) كما كانت.   -- +0255
  for v_ak in select k from jsonb_object_keys(v_avg) k loop                           -- +0255
    continue when coalesce(((v_avg -> v_ak) ->> 'skip')::boolean, false);             -- +0255
    select p.avg_cost,                                                                -- +0255
           coalesce(public._avg_adjust(((v_avg -> v_ak) ->> 's0')::numeric, ((v_avg -> v_ak) ->> 'a0')::numeric,   -- +0255
                                       ((v_avg -> v_ak) ->> 'vo')::numeric, ((v_avg -> v_ak) ->> 'vn')::numeric,   -- +0255
                                       coalesce(p.stock, 0), ((v_avg -> v_ak) ->> 'cl')::numeric),   -- +0255
                    p.avg_cost)                                                       -- +0255
      into v_was, v_now                                                               -- +0255
      from products p where p.id = v_ak::uuid and p.clinic_id = v_clinic;             -- +0255
    if found and v_now is distinct from v_was then                                    -- +0255
      update products set avg_cost = v_now where id = v_ak::uuid and clinic_id = v_clinic;   -- +0255
    end if;                                                                           -- +0255
  end loop;                                                                           -- +0255
  -- 0255: «صار» بالكشف يقول المتوسّطَ النهائيّ (صورةُ السطر داخل الحلقة سبقته).      -- +0255
  update purchase_effects e set after = e.after || jsonb_build_object('avg_cost', p.avg_cost)   -- +0255
    from products p                                                                   -- +0255
   where e.purchase_id = p_purchase and e.clinic_id = v_clinic and e.op = 'update'    -- +0255
     and e.created_at = now() and p.id = e.product_id and p.clinic_id = v_clinic and e.after is not null;   -- +0255
  -- ── ٢·٥) 0253: لا حصرة. قطعُ فاتورةٍ تحت ما صُرف منها يترك الرصيدَ سالباً ويُقال: اشترى ١ -- +0253
  -- وصُرف ٠٫٨ ثمّ عُدّلت إلى ٠٫٥ ⇒ −٠٫٣. الحصرةُ كانت تمحو العجزَ فيبدو المصروفُ كأنه لم يُصرف. -- +0253
-- -0253   -- ── ٢·٥) الحصرةُ الوحيدة: على ما لمسته الفاتورةُ وحدَه ──
-- -0253   -- بضاعةٌ سُحبت من الفاتورة ولم تعد تغطّي ما بيع ⇒ الرصيدُ صفرٌ لا سالب.
-- -0253   update products set stock = 0
-- -0253    where clinic_id = v_clinic and id = any (v_touched) and coalesce(stock, 0) < 0;

  -- 0211: «صار» يُقال بعد الحصرة لا قبلها — سالبٌ وسطيٌّ لم يوجد خارج المعاملة.
  -- 0253: والتصحيحُ باقٍ بلا حصرة: «صار» سالبٌ يُكتب بالرصيد النهائيّ — وسطيٌّ لسطرين لنفس المادّة -- +0253
  -- يصير النهائيّ، والنهائيُّ السالبُ يبقى كما هو فيقول الإيصالُ «كان ٠٫٢ صار −٠٫٣». -- +0253
  update purchase_effects e set after = purchase_effect_snap(p)
    from products p
   where e.purchase_id = p_purchase and e.clinic_id = v_clinic and e.op = 'update'
     and e.created_at = now() and p.id = e.product_id and p.clinic_id = v_clinic
     and coalesce((e.after->>'stock')::numeric, 0) < 0;

  -- 0211: مادّةٌ كانت بالفاتورة وشيلت منها — رصيدُها نقص، ويُقال.
  for v_k in select k from jsonb_object_keys(v_orig) k where not (k::uuid = any (v_seen)) loop
    v_line := v_line + 1;
    select * into v_after from products where id = v_k::uuid and clinic_id = v_clinic;
    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_k::uuid,
            coalesce(v_after.name, v_orig->v_k->>'name', 'Item'), null,
            'removed', null, -coalesce((v_oldq->>v_k)::numeric, 0),
            v_orig->v_k, purchase_effect_snap(v_after), '{}');
  end loop;

  -- ── ٣) رأس الفاتورة: إجمالي جديد، والمدفوع الحقيقي يبقى مقصوصاً عليه ──
  v_total := round(v_total, 2);
  v_total := v_total - v_disc;        -- 0260: صافٍ — والمدفوعُ والحالةُ عليه كما كانا على المجموع   -- +0260
  v_total := v_total + v_cc;          -- 0276: وأجورُ الشركة داخله (ما يُدان ويُدفع)   -- +0276
  v_paid  := least(coalesce(nullif(p_meta->>'amount_paid','')::numeric,
                            coalesce(v_purchase.amount_paid, v_purchase.total)),
                   v_total);
  v_paid  := greatest(v_paid, 0);

  update purchases set
    total          = v_total,
    discount       = v_disc,   -- +0260
    charges        = nullif(v_ch->'list', '[]'::jsonb),   -- +0276
    charges_company = v_cc,   -- +0276
    charges_other  = v_oc,   -- +0276
    charges_mode   = v_mode,   -- +0276
    item_count     = round(v_count)::int,
    amount_paid    = v_paid,
    status         = case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end,
    reference      = coalesce(nullif(p_meta->>'reference',''), reference),
    payment_method = coalesce(nullif(p_meta->>'payment_method',''), payment_method),
    supplier_name  = case when p_meta ? 'supplier_name'  then nullif(p_meta->>'supplier_name','')  else supplier_name  end,
    supplier_phone = case when p_meta ? 'supplier_phone' then nullif(p_meta->>'supplier_phone','') else supplier_phone end,
    notes          = case when p_meta ? 'notes'          then nullif(p_meta->>'notes','')          else notes          end,
    purchased_at   = coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, purchased_at)
  where id = p_purchase and clinic_id = v_clinic
  returning * into v_purchase;

  return v_purchase;
end $function$;
revoke all on function public.update_purchase(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_purchase(uuid, jsonb, jsonb) to authenticated;
comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'تعديلُ فاتورةِ شراء: يعكس السطورَ القديمة بلا حصرٍ ثمّ يبني الجديدة (0205)، ومنذ 0253 بلا حصرةٍ أخيرة. ويكتب منذ 0211 كشفَ ما فعله بـpurchase_effects (op=update). ومنذ 0255 يعيد تقييمَ الرصيد الحاضر بالمتوسّط، والفواتيرُ الصادرة تبقى بكلفتها. ومنذ 0260 خصمُ الشركة، ومنذ 0276 الأجورُ الإضافية: القديمُ بما استلمه والجديدُ بنسبته، وجهازٌ بلا مفتاح discount أو charges يُبقي المحفوظ.';

-- ── ٤ج) فاتورةُ الشراء بأيّ عملة — نصُّ 0274، وأجورُ فاتورة الدولار بالدولار ────────────────────────────────────
create or replace function public.record_purchase_fx(p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid := auth_clinic();
  v_role      text := auth_role();
  v_meta      jsonb := coalesce(p_meta, '{}'::jsonb);
  v_cur       text := upper(coalesce(nullif(coalesce(p_meta, '{}'::jsonb)->>'currency', ''), 'IQD'));
  v_ctx       record;
  v_rate      numeric;
  v_prep      jsonb;
  v_lines     jsonb;
  v_gross_usd numeric;
  v_disc_usd  numeric;
  v_total_usd numeric;
  v_paid_usd  numeric;
  v_ch        jsonb;   -- 0276: الأجورُ بالدولار ودينارُها بسعر الفاتورة   -- +0276
  v_p         purchases;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'عملةُ الفاتورة دينار أو دولار.'; end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty purchase';
  end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if v_cur = 'USD' then
    if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.'; end if;
    v_rate := _purchase_rate(v_meta, v_ctx.rate);
  end if;

  v_prep := _purchase_fx_prep(p_lines, v_cur, v_rate, v_clinic);
  select jsonb_agg(x->'line' order by (x->>'n')::int) into v_lines from jsonb_array_elements(v_prep) x;
  v_meta := v_meta - 'currency' - 'fx_rate' - 'discount_usd' - 'amount_paid_usd';

  if v_cur = 'IQD' then
    v_p := record_purchase(v_lines, v_meta);
  else
    -- المجموعُ والخصمُ والصافي بالدولار كما يحسبها record_purchase بالدينار (الكميةُ بثلاث منازل، والمبالغُ بمنزلتين).
    select round(coalesce(sum(round(coalesce(nullif(x->'line'->>'qty', '')::numeric, 0), 3) * (x->>'u')::numeric), 0), 2)
      into v_gross_usd from jsonb_array_elements(v_prep) x;
    v_disc_usd := case when v_gross_usd > 0
                       then least(greatest(round(coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0), 2), 0), v_gross_usd)
                       else 0 end;
    v_total_usd := v_gross_usd - v_disc_usd;
    -- 0276: الأجورُ بعملة الفاتورة: دولارُ ما على الشركة يدخل total_usd، ودينارُ كلّ أجرةٍ round(usd × rate, 2) لجسم الشراء.   -- +0276
    v_ch := public._purchase_charges(p_meta->'charges', v_rate);   -- +0276
    v_total_usd := v_total_usd + (v_ch->>'company_usd')::numeric;   -- +0276
    v_paid_usd := least(greatest(round(coalesce(nullif(p_meta->>'amount_paid_usd', '')::numeric, v_total_usd), 2), 0), v_total_usd);
    -- الخصمُ الكامل يأخذ الدينارَ كلَّه (يقصّه الجسمُ على مجموعه)، وغيرُه بسعر الفاتورة. والمدفوعُ يُكتب بعده بحصّته.
    v_p := record_purchase(v_lines, v_meta || jsonb_build_object(
             'discount', case when v_disc_usd >= v_gross_usd and v_gross_usd > 0 then 999999999999 else round(v_disc_usd * v_rate, 2) end,
-- -0276              'amount_paid', 0));
             'amount_paid', 0, 'charges', v_ch->'list'));   -- +0276
    perform set_config('doctorvet.usd_purchase_door', 'on', true);
    update purchases set
      currency = 'USD', fx_rate = v_rate, total_usd = v_total_usd, discount_usd = v_disc_usd, paid_usd = v_paid_usd,
      charges = nullif(v_ch->'list', '[]'::jsonb),   -- 0276: القائمةُ بدولارها (جسمُ الشراء حفظها بالدينار وحده)   -- +0276
      amount_paid = _usd_share(v_paid_usd, v_total_usd, total, v_total_usd, total),
      status = _usd_purchase_status(v_total_usd, v_paid_usd)
     where id = v_p.id and clinic_id = v_clinic
    returning * into v_p;
  end if;

  perform _purchase_fx_after(v_p.id, 'record', v_prep, v_cur, v_rate, v_clinic);
  perform set_config('doctorvet.usd_purchase_door', 'off', true);
  return v_p;
end $$;
revoke all on function public.record_purchase_fx(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase_fx(jsonb, jsonb) to authenticated;

create or replace function public.update_purchase_fx(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic    uuid := auth_clinic();
  v_role      text := auth_role();
  v_meta      jsonb := coalesce(p_meta, '{}'::jsonb);
  v_old       purchases;
  v_cur       text;
  v_ctx       record;
  v_rate      numeric;
  v_prep      jsonb;
  v_lines     jsonb;
  v_gross_usd numeric;
  v_disc_usd  numeric;
  v_total_usd numeric;
  v_paid_usd  numeric;
  v_ch        jsonb;   -- 0276   -- +0276
  v_p         purchases;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty purchase';
  end if;
  select * into v_old from purchases where id = p_purchase and clinic_id = v_clinic for update;
  if not found then raise exception 'purchase not found'; end if;
  v_cur := upper(coalesce(nullif(v_meta->>'currency', ''), v_old.currency));
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'عملةُ الفاتورة دينار أو دولار.'; end if;
  if v_cur <> v_old.currency and exists (select 1 from purchase_payments where purchase_id = p_purchase and clinic_id = v_clinic) then
    raise exception 'currency_has_payments' using hint = 'على الفاتورة دفعاتٌ مسجّلة بعملتها — ألغِها أوّلاً قبل تغيير العملة.';
  end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if v_cur = 'USD' then
    if v_old.currency <> 'USD' and not v_ctx.enabled then
      raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.';
    end if;
    v_rate := _purchase_rate(v_meta, coalesce(v_old.fx_rate, v_ctx.rate));
  end if;

  v_prep := _purchase_fx_prep(p_lines, v_cur, v_rate, v_clinic);
  select jsonb_agg(x->'line' order by (x->>'n')::int) into v_lines from jsonb_array_elements(v_prep) x;
  -- 0276: جهازٌ ما تحدّث (بلا مفتاح charges) يُبقي الأجورَ كما حُفظت — إلا حين تتبدّل العملة: أجرةٌ محفوظةٌ بعملةٍ لا تُقرأ بالأخرى.   -- +0276
  if not (v_meta ? 'charges') and v_cur <> v_old.currency and jsonb_array_length(coalesce(v_old.charges, '[]'::jsonb)) > 0 then   -- +0276
    raise exception 'charges_currency' using hint = 'على الفاتورة أجور إضافية بعملتها — حدّث الصفحة قبل تغيير العملة.';   -- +0276
  end if;   -- +0276
  v_meta := v_meta - 'currency' - 'fx_rate' - 'discount_usd' - 'amount_paid_usd';
  -- update_purchase يمحو سطورَ فاتورة الدولار ويبنيها ويكتب رأسَها: البابُ مفتوحٌ للمعاملة كلّها.
  perform set_config('doctorvet.usd_purchase_door', 'on', true);

  if v_cur = 'IQD' then
    v_p := update_purchase(p_purchase, v_lines, v_meta);
    if v_old.currency = 'USD' then
      update purchases set currency = 'IQD', fx_rate = null, total_usd = null, paid_usd = null, discount_usd = null
       where id = p_purchase and clinic_id = v_clinic
      returning * into v_p;
    end if;
  else
    select round(coalesce(sum(round(coalesce(nullif(x->'line'->>'qty', '')::numeric, 0), 3) * (x->>'u')::numeric), 0), 2)
      into v_gross_usd from jsonb_array_elements(v_prep) x;
    v_disc_usd := case when v_gross_usd > 0
                       then least(greatest(round(case when p_meta ? 'discount_usd' then coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0)
                                                      else coalesce(v_old.discount_usd, 0) end, 2), 0), v_gross_usd)
                       else 0 end;
    v_total_usd := v_gross_usd - v_disc_usd;
    v_ch := public._purchase_charges(case when p_meta ? 'charges' then p_meta->'charges' else v_old.charges end, v_rate);   -- +0276
    v_total_usd := v_total_usd + (v_ch->>'company_usd')::numeric;   -- +0276
    v_paid_usd := least(greatest(round(coalesce(
                    nullif(p_meta->>'amount_paid_usd', '')::numeric,
                    case when v_old.currency = 'USD' then v_old.paid_usd
                         when coalesce(v_old.amount_paid, v_old.total) >= v_old.total then v_total_usd
                         else coalesce(v_old.amount_paid, 0) / v_rate end), 2), 0), v_total_usd);
    v_p := update_purchase(p_purchase, v_lines, v_meta || jsonb_build_object(
             'discount', case when v_disc_usd >= v_gross_usd and v_gross_usd > 0 then 999999999999 else round(v_disc_usd * v_rate, 2) end,
-- -0276              'amount_paid', 0));
             'amount_paid', 0, 'charges', v_ch->'list'));   -- +0276
    update purchases set
      currency = 'USD', fx_rate = v_rate, total_usd = v_total_usd, discount_usd = v_disc_usd, paid_usd = v_paid_usd,
      charges = nullif(v_ch->'list', '[]'::jsonb),   -- +0276
      amount_paid = _usd_share(v_paid_usd, v_total_usd, total, v_total_usd, total),
      status = _usd_purchase_status(v_total_usd, v_paid_usd)
     where id = p_purchase and clinic_id = v_clinic
    returning * into v_p;
  end if;

  perform _purchase_fx_after(p_purchase, 'update', v_prep, v_cur, v_rate, v_clinic);
  perform set_config('doctorvet.usd_purchase_door', 'off', true);
  return v_p;
end $$;
revoke all on function public.update_purchase_fx(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_purchase_fx(uuid, jsonb, jsonb) to authenticated;

-- ── ٤د) الأرباحُ والخسائر: «أجور المشتريات» مصروفاً بشهر الفاتورة (نصُّ 0275) ───────────────────────────────────
create or replace function public.report_pnl(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
-- +0264
declare
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_can    boolean := false;
  v_tz     text;
  v_out    jsonb;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- كلاهما من 0222 ويُسألان بـexecute (كـservice_recipe_set، 0252): تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي «لا توجد»
  -- بدل الجواب. وبلا staff_can لا قالبَ أذونات بالقاعدة — فالمديرُ وحده، كما كان قبل 0222.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'viewProfits';
  else
    v_can := coalesce(auth_role(), '') = 'manager';
  end if;
  if coalesce(v_ph, false) or not coalesce(v_can, false) then
    raise exception 'pnl_forbidden' using errcode = '42501',
      hint = 'تقرير الأرباح والخسائر لمن يشوف الأرباح — اطلبه من المدير';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'pnl_range' using hint = 'اختر مدّة صحيحة — البداية قبل النهاية';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'pnl_range_long' using hint = 'المدّة أطول من سنة وشهر — قسّمها لفترتين';
  end if;
  -- اسمُ التوقيت المعتمد كما يكتبه pg_timezone_names (بلا حساسية حروف)، وإلا بغداد — كـpnlTz بالمرآة.
  select z.name into v_tz from pg_timezone_names z where lower(z.name) = lower(btrim(coalesce(p_tz, ''))) limit 1;
  v_tz := coalesce(v_tz, 'Asia/Baghdad');

  with inv as (
    select i.id, coalesce(i.total, 0) as total, coalesce(i.profit, 0) as profit, coalesce(i.cost_total, 0) as cost_total,
           to_char(i.created_at at time zone v_tz, 'YYYY-MM') as m
      from invoices i
     where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded'
       and i.created_at >= p_from and i.created_at <= p_to
       and i.sale_kind <> 'opening'   -- +0271
  ),
  inv_m as (
    select m, count(*)::int as n, sum(total) as revenue, sum(cost_total) as cogs, sum(profit) as gross
      from inv group by m
  ),
  prod_m as (
    select v.m, sum(round(coalesce(ii.qty, 0) * coalesce(ii.unit_cost, 0), 2)) as c
      from inv v
      join invoice_items ii on ii.invoice_id = v.id and ii.clinic_id = v_clinic
     where ii.product_id is not null
     group by v.m
  ),
  mat_m as (
    select v.m, sum(c.value) as c
      from inv v
      join invoice_consumption c on c.invoice_id = v.id and c.clinic_id = v_clinic
     group by v.m
  ),
  fx_m as (   -- +0264 فرقُ الصرف: سِيَقُ kind='fx' بشهر يومها (لا بشهر الفاتورة) — على فواتير الدولار وحدها
    select to_char(coalesce(safe_ts(l->>'at'), i.created_at) at time zone v_tz, 'YYYY-MM') as m,
           round(sum(safe_num(l->>'amount')), 2) as fx
      from invoices i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array'
                                                   then i.payment_details else '[]'::jsonb end) l
     where i.clinic_id = v_clinic and i.currency = 'USD' and coalesce(i.status, 'paid') <> 'refunded'
       and l->>'kind' = 'fx'
       and coalesce(safe_ts(l->>'at'), i.created_at) >= p_from and coalesce(safe_ts(l->>'at'), i.created_at) <= p_to
     group by 1
  ),
  pfx_m as (   -- فرقُ صرف المشتريات: دفعاتُ دين الدولار بشهر تسديدها (حصّتُها بدينار يوم الشراء ناقصَ ما كلّفت يومَ التسديد)   -- +0275
    select to_char(pp.paid_at at time zone v_tz, 'YYYY-MM') as m, round(sum(pp.fx), 2) as pfx   -- +0275
      from purchase_payments pp   -- +0275
     where pp.clinic_id = v_clinic and pp.fx is not null and pp.paid_at >= p_from and pp.paid_at <= p_to   -- +0275
     group by 1   -- +0275
  ),   -- +0275
  pch_m as (   -- أجورُ المشتريات «مصروفاً» (قرارُ العيادة مختومٌ على الفاتورة): ما على الشركة وما دُفع لغيرها بشهر الفاتورة   -- +0276
    select to_char(p.purchased_at at time zone v_tz, 'YYYY-MM') as m,   -- +0276
           round(sum(coalesce(p.charges_company, 0) + coalesce(p.charges_other, 0)), 2) as pch   -- +0276
      from purchases p   -- +0276
     where p.clinic_id = v_clinic and p.charges_mode = 'expense' and p.purchased_at >= p_from and p.purchased_at <= p_to   -- +0276
     group by 1   -- +0276
  ),   -- +0276
  ex as (
    select to_char(e.spent_at at time zone v_tz, 'YYYY-MM') as m,
           case when e.category_id is not null then 'cat'
                when e.method = 'stock' then 'stock'
                when inv_norm_group(e.category) = inv_norm_group('مرتجع') then 'returns'
                when inv_norm_group(e.category) = inv_norm_group('payroll') then 'payroll'
                when inv_norm_group(e.category) = inv_norm_group('payroll_loan') then 'payroll_loan'
                when inv_norm_group(e.category) = inv_norm_group('سحب مخزن') then 'stock'
                else 'none' end as b,
           e.category_id as cid, e.amount
      from expenses e
     where e.clinic_id = v_clinic and e.spent_at >= p_from and e.spent_at <= p_to
  ),
  ex_m as (   -- كلُّ جدولٍ بشهره مقرَّبٌ لفلس
    select m, b, cid, round(sum(amount), 2) as a from ex group by m, b, cid
  ),
  months as (
-- -0275     select m from inv_m union select m from ex_m union select m from fx_m
-- -0276     select m from inv_m union select m from ex_m union select m from fx_m union select m from pfx_m   -- +0275
    select m from inv_m union select m from ex_m union select m from fx_m union select m from pfx_m union select m from pch_m   -- +0276
  ),
  cat_ord as (   -- ترتيبُ groupWithdrawals: بإنشاء التصنيف ثمّ بمعرّفه، والمجهولُ بعدها
    select x.cid, c.name, c.created_at
      from (select distinct cid from ex_m where b = 'cat') x
      left join expense_categories c on c.id = x.cid and c.clinic_id = v_clinic
  ),
  rows as (
    select ms.m,
           coalesce(i.n, 0) as n, coalesce(i.revenue, 0) as revenue, coalesce(i.cogs, 0) as cogs,
           coalesce(i.gross, 0) as gross, coalesce(p.c, 0) as cp, coalesce(t.c, 0) as cm, coalesce(f.fx, 0) as fx,
           coalesce(pf.pfx, 0) as pfx,   -- +0275
           coalesce(pc.pch, 0) as pch,   -- +0276
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'stock'), 0)        as stock,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'returns'), 0)      as returns,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll'), 0)      as payroll,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll_loan'), 0) as loan,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'none'), 0)         as none,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m), 0)                          as ex_total
      from months ms
      left join inv_m  i on i.m = ms.m
      left join prod_m p on p.m = ms.m
      left join mat_m  t on t.m = ms.m
      left join fx_m   f on f.m = ms.m
      left join pfx_m pf on pf.m = ms.m   -- +0275
      left join pch_m pc on pc.m = ms.m   -- +0276
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', r.m, 'invoices', r.n, 'revenue', r.revenue, 'cogs', r.cogs,
               'cogs_products', r.cp, 'cogs_materials', r.cm, 'cogs_other', r.cogs - r.cp - r.cm,
               'gross', r.gross, 'adjust', r.gross - (r.revenue - r.cogs),
               'stock_loss', r.stock, 'returns', r.returns, 'payroll', r.payroll, 'payroll_loan', r.loan,
               'uncategorized', r.none,
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', x.a)
                                   order by o.created_at nulls last, o.cid)
                    from ex_m x join cat_ord o on o.cid = x.cid
                   where x.m = r.m and x.b = 'cat'), '[]'::jsonb),
-- -0275                'fx', r.fx, 'expenses', r.ex_total, 'net', r.gross + r.fx - r.ex_total)
-- -0276                'fx', r.fx, 'fx_purchases', r.pfx, 'expenses', r.ex_total, 'net', r.gross + r.fx + r.pfx - r.ex_total)   -- +0275
               'fx', r.fx, 'fx_purchases', r.pfx, 'expenses', r.ex_total, 'purchase_charges', r.pch,   -- +0276
               'net', r.gross + r.fx + r.pfx - r.ex_total - r.pch)   -- +0276
             order by r.m)
        from rows r), '[]'::jsonb),
    'total', (
      select jsonb_build_object(
               'invoices', coalesce(sum(r.n), 0), 'revenue', coalesce(sum(r.revenue), 0), 'cogs', coalesce(sum(r.cogs), 0),
               'cogs_products', coalesce(sum(r.cp), 0), 'cogs_materials', coalesce(sum(r.cm), 0),
               'cogs_other', coalesce(sum(r.cogs - r.cp - r.cm), 0),
               'gross', coalesce(sum(r.gross), 0), 'adjust', coalesce(sum(r.gross - (r.revenue - r.cogs)), 0),
               'stock_loss', coalesce(sum(r.stock), 0), 'returns', coalesce(sum(r.returns), 0),
               'payroll', coalesce(sum(r.payroll), 0), 'payroll_loan', coalesce(sum(r.loan), 0),
               'uncategorized', coalesce(sum(r.none), 0),
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', s.a)
                                   order by o.created_at nulls last, o.cid)
                    from (select cid, sum(a) as a from ex_m where b = 'cat' group by cid) s
                    join cat_ord o on o.cid = s.cid), '[]'::jsonb),
-- -0275                'fx', coalesce(sum(r.fx), 0), 'expenses', coalesce(sum(r.ex_total), 0),
-- -0276                'fx', coalesce(sum(r.fx), 0), 'fx_purchases', coalesce(sum(r.pfx), 0), 'expenses', coalesce(sum(r.ex_total), 0),   -- +0275
               'fx', coalesce(sum(r.fx), 0), 'fx_purchases', coalesce(sum(r.pfx), 0), 'expenses', coalesce(sum(r.ex_total), 0),   -- +0276
               'purchase_charges', coalesce(sum(r.pch), 0),   -- +0276
-- -0275                'net', coalesce(sum(r.gross + r.fx - r.ex_total), 0))
-- -0276                'net', coalesce(sum(r.gross + r.fx + r.pfx - r.ex_total), 0))   -- +0275
               'net', coalesce(sum(r.gross + r.fx + r.pfx - r.ex_total - r.pch), 0))   -- +0276
        from rows r))
    into v_out;
  return v_out;
end $$;
revoke all on function public.report_pnl(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_pnl(timestamptz, timestamptz, text) to authenticated;

-- ── ٥) الواجهة: هل الأجسامُ الحيّة تعرف الأجور؟ وما إعدادُ العيادة؟ ومن يغيّره ────────────────────────────────
-- السؤالُ عن نصّ الأجسام الخمسة لا عن العمود — إعادةُ 0260 أو 0274 أو 0275 وحدها تُبقي الأعمدةَ وتُرجع جسماً بلا أجور، فأجرةٌ تُرسَل
-- تُبلع بصمت. فالواجهةُ تُخفي الأجورَ ما لم تكن الخمسةُ بعلامتنا.
create or replace function public.purchase_charges_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select count(*) = 5 from pg_proc p
   where p.oid in (to_regprocedure('public.record_purchase(jsonb,jsonb)'), to_regprocedure('public.update_purchase(uuid,jsonb,jsonb)'),
                   to_regprocedure('public.record_purchase_fx(jsonb,jsonb)'), to_regprocedure('public.update_purchase_fx(uuid,jsonb,jsonb)'),
                   to_regprocedure('public.report_pnl(timestamptz,timestamptz,text)'))
     and position(format('-- +%s', '0276') in p.prosrc) > 0
$$;
revoke all on function public.purchase_charges_ready() from public, anon;
grant execute on function public.purchase_charges_ready() to authenticated;

-- ما تحتاجه فاتورةُ الشراء والإعدادات بنداءٍ واحد: هل تُعرض الأجور، وكيف تُحسب بهذه العيادة (لتقوله الفاتورةُ قبل الحفظ).
create or replace function public.purchase_charges_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('ready', public.purchase_charges_ready(), 'mode', public._purchase_charges_mode(v_clinic));
end $$;
revoke all on function public.purchase_charges_state() from public, anon;
grant execute on function public.purchase_charges_state() to authenticated;

-- الإعدادُ للمدير (ودخولُ المشغّل مديرٌ بالاتفاق، 0151): يُكتب لما يُضاف من أجورٍ بعده — ما سُجّل مختومٌ على فاتورته.
create or replace function public.purchase_charges_mode_set(p_mode text) returns text
language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'forbidden' using errcode = '42501', hint = 'طريقة حساب أجور المشتريات يغيّرها المدير.';
  end if;
  if p_mode is null or p_mode not in ('cost', 'expense') then
    raise exception 'bad_mode' using hint = 'على الكلفة أو مصروف.';
  end if;
  insert into clinic_prefs (clinic_id, purchase_charges_mode) values (v_clinic, p_mode)
  on conflict (clinic_id) do update set purchase_charges_mode = excluded.purchase_charges_mode;
  return p_mode;
end $$;
revoke all on function public.purchase_charges_mode_set(text) from public, anon;
grant execute on function public.purchase_charges_mode_set(text) to authenticated;

reset lock_timeout;
