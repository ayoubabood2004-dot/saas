-- ============================================================================
-- 0286 — الدولار: سعرُ التسديد يختاره الطبيب، وسعرُ اليوم يحدّده الكادر من أيّ شاشة
--
-- قرارُ المالك (٢١/١١) بعد نزول الفاتورة بمجموعين (0283): «لمن يجي يسدد بعد فترة الدكتور يشوف بيش جان الدولار بذاك اليوم
-- ويكدر من يمه يحدد اذا راح يبيع بنفس السعر او يغير لاي سعر — ومو شرط تثبيت سعر الدولار من الاعدادات، يكدر الدكتور
-- يغير سعر الدولار وين ما جان بالعيادة».
--
-- فدالّتان من 0264 تُعادان بنصّهما وأسطرٍ معلَّمة (حارسُ الانجراف قبل كلّ واحدة):
--  • `settle_invoice_usd`: التسديدُ بسعرٍ غير سعر اليوم كان للمدير وبسببٍ مكتوب (usd_rate_override) — يُشال الشرط. الحسابُ
--    كما هو حرفاً: الدرجُ يستلم بالسعر المختار، والحصّةُ بنسبة الفاتورة، والفرقُ ساقُ `fx` — وسعرُ يوم البيع باقٍ على الفاتورة
--    (`fx_rate`) والسعرُ المختار على التسديد (`usd_settlements.rate`). وبلا سعرٍ محدَّدٍ بالعيادة يمرّ أيضاً (يكتب سعرَه).
--  • `fx_rate_set`: سعرُ اليوم كان للمدير وحده (usd_rate_manager) — صار لكلّ الكادر، والمشغّلُ لا كما كان، والمصوّرُ يردّه
--    خطّافُ api_gate (0222). كلُّ سطرٍ بـ`clinic_fx_rates` يختم من حدّده ومتى، فالتاريخُ يُقرأ.
--
-- الحدودُ كما هي: سعرٌ بين ١٠٠ و١٠٠٬٠٠٠ لكلّ ١٠٠ دولار، والمبلغُ لا يتجاوز الباقي، وإلغاءُ التسديد للمدير وبسبب.
-- إضافيّةٌ: الواجهةُ القديمة تعمل عليها كما هي (تطلب سبباً لا يُشترط بعد). وتُعاد بلا أثرٍ ثانٍ.
-- تراجع: أعِد تعريفَي الدالّتين من 0264 (قسماهما ٧ و٩) كما هما.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
  if to_regprocedure('public.settle_invoice_usd(uuid,numeric,numeric,text,numeric,text,text)') is null then
    raise exception 'needs_0264' using hint = 'طبّق 0264 (الدولار) قبل هالهجرة';
  end if;
end $$;

-- ── ١) سعرُ اليوم: لكلّ الكادر ─────────────────────────────────────────────────────────────────────────
select public._drift_assert('public.fx_rate_set(numeric,text)', '896f846e64907aed708061807ab0d5d8', '-- +0286');

create or replace function public.fx_rate_set(p_per100 numeric, p_note text default null)
returns public.clinic_fx_rates language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_ctx record; v_rate numeric; v_row clinic_fx_rates;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'usd_operator' using hint = 'مشغّلُ المنصّة ما يحدّد سعرَ دولار العيادة — صاحبُها أو مديرُها.';
  end if;
-- -0286   if coalesce(auth_role(), '') <> 'manager' then
-- -0286     raise exception 'usd_rate_manager' using errcode = '42501', hint = 'سعرُ الدولار يحدّده المدير — افتح وضعَ المدير برمزه.';
-- -0286   end if;
  -- 0286: كلُّ الكادر يحدّد سعرَ اليوم من أيّ شاشة (قرارُ المالك ٢١/١١) — والسطرُ يختم من حدّده ومتى (set_by).   -- +0286
  v_rate := _usd_rate_of(p_per100);
  if v_rate is null or v_rate < 100 or v_rate > 100000 then
    raise exception 'usd_rate_bad' using hint = 'اكتب سعرَ ١٠٠ دولار بالدينار (مثلاً ١٤٦٠٠٠).';
  end if;
  insert into clinic_fx_rates (clinic_id, rate, note, set_by)
  values (v_clinic, v_rate, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.fx_rate_set(numeric, text) from public, anon;
grant execute on function public.fx_rate_set(numeric, text) to authenticated;

-- ── ٢) التسديدُ بسعرٍ يختاره الطبيب ──────────────────────────────────────────────────────────────────────
select public._drift_assert('public.settle_invoice_usd(uuid,numeric,numeric,text,numeric,text,text)', 'becb44579b374e073b68bb3ca57eafa7', '-- +0286');

create or replace function public.settle_invoice_usd(
  p_invoice uuid, p_usd numeric, p_per100 numeric, p_method text default 'cash',
  p_expect_due_usd numeric default null, p_note text default null, p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ctx    record;
  v_inv    invoices;
  v_set    usd_settlements;
  v_rate   numeric;
  v_usd    numeric := round(coalesce(p_usd, 0), 2);
  v_due    numeric;
  v_dueiqd numeric;
  v_recv   numeric;
  v_share  numeric;
  v_fx     numeric;
  v_method text := coalesce(nullif(p_method, ''), 'cash');
  v_ref    text := nullif(btrim(coalesce(p_client_ref, '')), '');
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_id     uuid := gen_random_uuid();
  v_legs   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if v_ref is not null then
    select * into v_set from usd_settlements where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      select * into v_inv from invoices where id = v_set.invoice_id;
      return jsonb_build_object('invoice', to_jsonb(v_inv), 'settlement', to_jsonb(v_set));
    end if;
  end if;
  if v_method not in ('cash', 'card', 'transfer') then raise exception 'usd_method' using hint = 'طريقةُ الدفع: نقد أو بطاقة أو تحويل.'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.currency <> 'USD' then raise exception 'usd_not_usd' using hint = 'هاي فاتورة دينار — تسديدُها العادي.'; end if;
  if coalesce(v_inv.status, 'paid') = 'refunded' then raise exception 'invoice refunded'; end if;
  v_due := v_inv.total_usd - v_inv.paid_usd;
  if p_expect_due_usd is not null and abs(round(p_expect_due_usd, 2) - v_due) > 0.004 then
    raise exception 'usd_due_changed' using hint = 'باقي الفاتورة تغيّر من جهازٍ ثاني (صار ' || v_due || '$) — راجع المبلغ.';
  end if;
  if v_usd <= 0 then raise exception 'usd_amount' using hint = 'اكتب مبلغَ التسديد بالدولار.'; end if;
  if v_usd > v_due then
    raise exception 'usd_over' using hint = 'المبلغ أكبر من باقي الفاتورة (' || v_due || '$).';
  end if;
  v_rate := _usd_rate_of(p_per100);
  if v_rate is null or v_rate < 100 or v_rate > 100000 then
    raise exception 'usd_rate_bad' using hint = 'اكتب سعرَ ١٠٠ دولار بالدينار (مثلاً ١٤٦٠٠٠).';
  end if;
-- -0286   if v_ctx.rate_id is null or v_rate <> v_ctx.rate then
-- -0286     if coalesce(auth_role(), '') <> 'manager' or v_note is null then
-- -0286       raise exception 'usd_rate_override' using errcode = '42501',
-- -0286         hint = 'التسديدُ بسعرٍ غير سعر اليوم يحتاج المدير وسبباً مكتوباً.';
-- -0286     end if;
-- -0286   end if;
  -- 0286: السعرُ يختاره من يسدّد (سعرُ يوم البيع، أو اليوم، أو أيُّ سعر) بلا مديرٍ ولا سبب — قرارُ المالك ٢١/١١؛   -- +0286
  -- والسعرُ يُختم على التسديد (usd_settlements.rate) فيُقرأ بعدها، والملاحظةُ اختياريّة.   -- +0286
  v_recv := _usd_iqd(v_usd, v_rate, v_ctx.step);
  -- تسديدٌ جزئيّ يطلع صفراً بالخطوة بلا معنى فيُرفض؛ أمّا الإغلاقُ فيمرّ ولو بصفر (باقٍ أصغرُ من نصف خطوة): بلاه تبقى
  -- الفاتورةُ مفتوحةً أبداً بسنتاتٍ لا تُدفع. حصّتُه باقي الدينار وفرقُه سالبُها.
  if v_recv <= 0 and v_usd < v_due then raise exception 'usd_too_small' using hint = 'المبلغ أصغر من أصغر دفعة بالدينار.'; end if;
  v_dueiqd := v_inv.total - coalesce(v_inv.amount_paid, 0);
  v_share := _usd_share(v_usd, v_due, v_dueiqd, v_inv.total_usd, v_inv.total);
  v_fx := v_recv - v_share;

  insert into usd_settlements (id, clinic_id, invoice_id, usd, rate, rate_note, received, share, fx, method, by_user, client_ref)
  values (v_id, v_clinic, v_inv.id, v_usd, v_rate, v_note, v_recv, v_share, v_fx, v_method,
          case when platform_acting_clinic() is null then auth.uid() end, v_ref)   -- المشغّلُ لا أثرَ له (0151)
  returning * into v_set;

  v_legs := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_share <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_method, 'amount', v_share, 'at', v_at,
                                           'usd', v_usd, 'rate', v_rate, 'settlement_id', v_id);
  end if;
  if v_fx <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_method, 'amount', v_fx, 'at', v_at, 'kind', 'fx', 'settlement_id', v_id);
  end if;
  perform set_config('doctorvet.usd_door', 'on', true);
  update invoices
     set amount_paid = coalesce(amount_paid, 0) + v_share,
         paid_usd = paid_usd + v_usd,
         payment_details = v_legs,
         payment_method = (select e->>'method' from jsonb_array_elements(v_legs) e
                            where coalesce(e->>'kind', '') <> 'fx'
                            order by (e->>'amount')::numeric desc limit 1)
   where id = v_inv.id
   returning * into v_inv;
  perform set_config('doctorvet.usd_door', 'off', true);
  return jsonb_build_object('invoice', to_jsonb(v_inv), 'settlement', to_jsonb(v_set));
end $$;
revoke all on function public.settle_invoice_usd(uuid, numeric, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.settle_invoice_usd(uuid, numeric, numeric, text, numeric, text, text) to authenticated;
