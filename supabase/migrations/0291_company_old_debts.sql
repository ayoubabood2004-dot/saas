-- ============================================================================
-- ٠٢٨٨ — دفترُ الشركة: ديونٌ قديمة كثيرة، كلٌّ بتاريخه، بضغطةٍ واحدة ومرجعِ إعادة
--
-- طلبُ المالك (٢٣/١١): «داخل الدفتر يكدر يضيف دين قديم… حتى لو نسوي ديون قديمة يعني على اكثر من تاريخ مو الا مجموع كل
-- الديون».
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- 0224 قيّدت الرصيدَ السابق بصفٍّ حيٍّ واحد لكلّ شركة (و0274 لكلّ عملة): «الثاني تكرارٌ أكثرَ منه حقيقة». فدفترٌ ورقيّ بعشر
-- فواتير قديمة بعشرة تواريخ يُكتب رقماً واحداً بتاريخٍ واحد — يضيع متى صار كلُّ دين، ولا يُطابَق كشفُ الشركة سطراً بسطر.
-- **والقيدُ نفسُه كان حارسَ الإعادة الوحيد**: ردٌّ ضائع بنتٍّ ضعيف ثمّ «حفظ» ثانيةً ⇒ `opening_exists` بدل دينٍ ثانٍ.
-- رفعُ القيد بلا مرجعِ إعادة = دَينٌ مضاعفٌ يُصدَّق (قانونُ «كلُّ عمليةِ مالٍ لها مرجعُ إعادة»).
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `company_entries.client_ref` — مرجعُ إعادةٍ من الجهاز لكلّ سطر (`<مرجع النافذة>:<رقم السطر>`)، فريدٌ مع العيادة حين يوجد.
-- • `company_openings_add(p_company, p_currency, p_rows, p_ref)` — definer، للمدير (company_entry_guard: الدورُ وقفلُ الشركة،
--   فإعادتان متزامنتان بالمرجع نفسِه تتسلسلان والثانيةُ ترى ما كتبته الأولى):
--     – ١..٥٠ سطراً `{amount, date, note}`، كلٌّ صفُّ «رصيد سابق» (opening/credit) بتاريخه وملاحظته، **بمعاملةٍ واحدة**:
--       سطرٌ مرفوض يُسقط الكلَّ وجملتُه تقول رقمَه («السطر ٣: …»).
--     – المرجعُ إلزاميّ (حروفٌ وأرقامٌ و-_، ≤ ٨٠): إعادتُه ترجع ما ثبت به **بلا كتابة** (`replayed: true`) — بشرط أنها
--       الطلبُ نفسُه: الشركةُ والعملةُ وعددُ السطور ومبلغُ كلّ سطرٍ وتاريخُه كما كُتب أوّلَ مرّة (قبل أيّ تعديلٍ بـ0281 —
--       `edits->0->before`). غيرُ ذلك ⇒ `ref_mismatch` لا «انسجّل» عن غيرها (درسُ 0264: نتيجةٌ مجهولة ثمّ تعديلٌ وإعادة).
--     – الدولارُ بشرط تفعيله كـ0274، والتاريخُ **إلزاميّ** لكلّ سطر (كلُّ دينٍ بتاريخه — بلا «اليوم» صامت) اليومَ أو قبله ومن ٢٠٠٠،
--       والملاحظةُ ≤ ٥٠٠.
-- • `company_openings_ready()` — تسأله الواجهةُ قبل أن تعرض «+ سطر»: قاعدةٌ قبلها ⇒ دينٌ واحد بالباب القديم كما كان.
-- • البابان القديمان (`company_opening_add` و`company_opening_add_fx`) **كما هما**: الواجهةُ الحاليّة تناديهما بلا مرجع، وقيدُ
--   «واحدٍ حيّ» حارسُ إعادتها — فلا يُرخى. وبعد دينين بالباب الجديد يرفض القديمُ الثالث (opening_exists)، ولا تناديه الواجهةُ
--   الجديدة بعد الهجرة.
--
-- لا يتغيّر شيءٌ آخر: الرصيدُ السابق مجموعُ الصفوف الحيّة (company_pool_due[_usd])، والتسديدُ يذهب له أوّلاً ثمّ للفواتير من
-- الأقدم، والإلغاءُ والتعديلُ (0281) يحكمان بالمجموع — دينٌ من ثلاثة يُلغى أو ينزل ما دام الباقي يغطّي ما انسدّ.
-- والطيُّ والحذفُ والاسترجاع (0224) تنقل الصفوفَ بكلّ أعمدتها (المرجعُ معها؛ واللقطاتُ القديمة بلا مرجع تُقرأ null).
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها (دالّةٌ غائبة 42883/PGRST202) تبقى على دينٍ واحد.
-- تراجع: drop function company_openings_add(uuid, text, jsonb, text), company_openings_ready(); drop index
--   company_entries_client_ref_uniq؛ والعمودُ يبقى (صفوفُ الديون صحيحةٌ بلا مرجع).
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تبني عليه ─────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.company_entry_guard(uuid,date,boolean)') is null
     or to_regprocedure('public.company_pool_due_usd(uuid,uuid)') is null
     or to_regprocedure('public._usd_ctx(uuid)') is null then
    raise exception 'needs_0274' using hint = 'طبّق 0274 (الشراء ودفتر الشركة بالعملتين) قبل هالهجرة';
  end if;
end $$;

-- ── ١) مرجعُ الإعادة على الصفّ ───────────────────────────────────────────────────────────────────────────
alter table public.company_entries add column if not exists client_ref text;
alter table public.company_entries drop constraint if exists company_entries_client_ref_ok;
alter table public.company_entries add constraint company_entries_client_ref_ok
  check (client_ref is null or char_length(client_ref) between 3 and 100);
create unique index if not exists company_entries_client_ref_uniq
  on public.company_entries (clinic_id, client_ref) where client_ref is not null;

-- ── ٢) ديونٌ قديمة كثيرة بطلبٍ واحد ──────────────────────────────────────────────────────────────────────
create or replace function public.company_openings_add(p_company uuid, p_currency text, p_rows jsonb, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_cur    text := upper(coalesce(nullif(btrim(p_currency), ''), 'IQD'));
  v_ref    text := btrim(coalesce(p_ref, ''));
  v_today  date := (now() at time zone 'Asia/Baghdad')::date;
  v_n      int;
  v_i      int;
  v_r      jsonb;
  v_amt    numeric;
  v_date   date;
  v_note   text;
  v_out    jsonb := '[]'::jsonb;
  v_row    company_entries;
  v_old    record;
begin
  -- الدورُ (المدير) وقفلُ صفّ الشركة أوّلاً — كلُّ كاتبٍ بدفترها يأخذه، فإعادتان متزامنتان بالمرجع نفسِه تتسلسلان.
  v_clinic := company_entry_guard(p_company, null, true);
  if v_ref !~ '^[A-Za-z0-9_-]{3,80}$' then
    raise exception 'bad_ref' using hint = 'حدّث الصفحة وجرّب مرّة ثانية.';
  end if;
  if v_cur not in ('IQD', 'USD') then raise exception 'bad_currency' using hint = 'العملة دينار أو دولار.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'bad_rows' using hint = 'اكتب دين واحد على الأقل.';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n < 1 or v_n > 50 then
    raise exception 'bad_rows' using hint = 'من دين واحد لخمسين دين بالمرّة.';
  end if;

  -- الإعادة: ما ثبت بهذا المرجع يرجع كما هو — إن كان الطلبَ نفسَه (كما كُتب أوّلَ مرّة، قبل أيّ تعديل). المراجعُ الخمسون الممكنة
  -- بالاسم (يمرّ من الفهرس الفريد بلا مقارنةٍ نصّية تتبع الترتيب اللغويّ)، وسطرٌ بالطلب لا يُقرأ ⇒ ليس الطلبَ نفسَه.
  begin
    select count(*) as n,
           bool_and(e.company_id = p_company) as same_co,
           bool_and(coalesce(e.currency, 'IQD') = v_cur) as same_cur,
           bool_and(
             split_part(e.client_ref, ':', 2)::int <= v_n
             and round(coalesce((e.edits->0->'before'->>'amount')::numeric, e.amount), 2)
                 = round((p_rows->(split_part(e.client_ref, ':', 2)::int - 1)->>'amount')::numeric, 2)
             and coalesce((e.edits->0->'before'->>'date')::date, e.entry_date)
                 = nullif(btrim(coalesce(p_rows->(split_part(e.client_ref, ':', 2)::int - 1)->>'date', '')), '')::date
           ) as same_rows,
           jsonb_agg(to_jsonb(e) order by char_length(e.client_ref), e.client_ref) as rows
      into v_old
      from company_entries e
     where e.clinic_id = v_clinic
       and e.client_ref = any (array(select v_ref || ':' || g from generate_series(1, 50) g));
  exception when others then
    raise exception 'ref_mismatch' using hint = 'هالديون انسجّلت قبل بشكلٍ ثاني — حدّث الدفتر وشوفها قبل ما تضيف.';
  end;
  if v_old.n > 0 then
    if v_old.n <> v_n or not v_old.same_co or not v_old.same_cur or not coalesce(v_old.same_rows, false) then
      raise exception 'ref_mismatch' using hint = 'هالديون انسجّلت قبل بشكلٍ ثاني — حدّث الدفتر وشوفها قبل ما تضيف.';
    end if;
    return jsonb_build_object('entries', v_old.rows, 'replayed', true);
  end if;

  if v_cur = 'USD' and not (select c.enabled from _usd_ctx(v_clinic) c) then
    raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بعيادتك — فعّله من الإعدادات.';
  end if;

  for v_i in 1 .. v_n loop
    v_r := p_rows->(v_i - 1);
    if jsonb_typeof(v_r) is distinct from 'object' then
      raise exception 'bad_rows' using hint = format('السطر %s: مو مقروء.', v_i);
    end if;
    begin
      v_amt := round((v_r->>'amount')::numeric, 2);
      v_date := nullif(btrim(coalesce(v_r->>'date', '')), '')::date;
    exception when others then
      raise exception 'bad_rows' using hint = format('السطر %s: المبلغ أو التاريخ مو مقروء.', v_i);
    end;
    if v_amt is null or v_amt <= 0 then
      raise exception 'bad_amount' using hint = format('السطر %s: المبلغُ لازم أكبر من صفر.', v_i);
    end if;
    -- كلُّ دينٍ بتاريخه — هو لبُّ الطلب؛ وسطرٌ بلا تاريخ من الجهاز عطلٌ لا «اليوم» صامت.
    if v_date is null then
      raise exception 'bad_date' using hint = format('السطر %s: اكتب تاريخ الدين.', v_i);
    end if;
    if v_date > v_today or v_date < date '2000-01-01' then
      raise exception 'bad_date' using hint = format('السطر %s: التاريخُ لازم يكون اليوم أو قبله.', v_i);
    end if;
    v_note := nullif(btrim(coalesce(v_r->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'note_too_long' using hint = format('السطر %s: الملاحظةُ طويلة — ٥٠٠ حرف على الأكثر.', v_i);
    end if;
    insert into company_entries (clinic_id, company_id, kind, direction, amount, entry_date, note, currency, client_ref)
    values (v_clinic, p_company, 'opening', 'credit', v_amt, v_date, v_note, v_cur, v_ref || ':' || v_i)
    returning * into v_row;
    v_out := v_out || jsonb_build_array(to_jsonb(v_row));
  end loop;

  return jsonb_build_object('entries', v_out, 'replayed', false);
end $$;
revoke all on function public.company_openings_add(uuid, text, jsonb, text) from public, anon;
grant execute on function public.company_openings_add(uuid, text, jsonb, text) to authenticated;

-- ── ٣) سؤالُ القدرة ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.company_openings_ready()
returns boolean
language sql
stable
set search_path = public
as $$
  select to_regprocedure('public.company_openings_add(uuid,text,jsonb,text)') is not null
$$;
revoke all on function public.company_openings_ready() from public, anon;
grant execute on function public.company_openings_ready() to authenticated;

comment on column public.company_entries.client_ref is
  'مرجعُ إعادةٍ من الجهاز (0291): `<مرجع النافذة>:<رقم السطر>` — إعادةُ الطلب ترجع ما ثبت به بلا دينٍ ثانٍ.';

-- التحقّق بعد اللصق: select company_openings_ready();  ⇒ true
