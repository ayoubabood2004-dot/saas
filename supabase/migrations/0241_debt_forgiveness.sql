-- ============================================================================
-- ٠٢٤١ — «خصم على الدين»: الزبونُ يتفاوض، والعيادةُ تُسقط جزءاً من باقي فاتورةٍ واحدة —
--         وكلُّ شيءٍ محسوبٌ أمام المدير، وما فوق الربح يحتاج صاحبَ العيادة من حسابه
--
-- ── المقيس (الإنتاج، عدٌّ بلا أسماء ولا أرقام) ───────────────────────────────
-- ٣١٤ ديناً مفتوحاً بخمس عيادات. ٢٥٩ منها **متبقّيها أكبرُ من ربح فاتورتها** — أي أنّ
-- «خلّيها ونخلص» على أغلب الديون ليست خصماً من الربح بل بيعٌ بخسارة، والمديرُ لا يرى ذلك
-- حين يقرّر: لا شاشةَ تقول الربحَ ولا ما سدّده الزبونُ قبل. والطريقان اليوم كلاهما يكذب:
-- تعديلُ الفاتورة (يمحو أنّ البيعَ كان بسعره ويلوّث «خصم البائع»)، أو ترك الدين معلّقاً
-- للأبد (يتضخّم «الديون» بمالٍ لن يأتي). و١٥ فاتورةً منها فيها سطرُ منتجٍ كلفتُه صفر —
-- ربحُها المعروض أعلى من الحقيقيّ، فالواجهةُ تحذّر حين تراه.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- • الخصمُ **لفاتورةٍ واحدة** ومن متبقّيها وحده (amount ≤ due دائماً).
-- • **نموذجُ يوم البيع**: الخصمُ يُنزل invoices.total وinvoices.profit (كما يفعل المرتجعُ
--   منذ 0121)، فالتقاريرُ بأساس الاستحقاق تُصحّح يومَ البيع؛ ويُحفظ المبلغُ بعمودٍ مستقلّ
--   `invoices.forgiven` — **لا** بـdiscount: ذاك خصمُ البائع وقتَ البيع، وإحصاءاتُ البائع
--   تقرؤه، والخصمُ على الدين قرارُ المدير بعد البيع.
-- • **دفترٌ لا يُمحى** `invoice_forgiveness`: سطرٌ لكلّ خصم بسببه وملاحظته ومن أعطاه
--   (وهل كان بمفتاح المدير على جهازٍ مشترك)، ولقطةُ الفاتورة لحظتَه (الإجمالي، المدفوع،
--   المتبقّي، الربح قبل الخصم، الكلفة، النسبة). منه «خصومات الديون» بالفترة، مؤرَّخةً بيومها.
--   الثابتُ المفحوص: `invoices.forgiven = Σ amount` لسطوره غيرِ الملغاة.
-- • **سقفُ الربح** (فكرةُ المالك): مجموعُ الخصومات على فاتورةٍ لا يتجاوز
--   `forgive_profit_pct% × (profit + forgiven)` — ربحُ البيعة قبل أيّ خصمٍ على الدين (بعد خصم
--   البائع والمرتجع). داخل السقف: المدير (ومفتاحُ المدير على جهاز الاستقبال يكفي، كباقي
--   عمليات الصندوق). فوقه = «بيعٌ بخسارة»: صاحبُ العيادة **من حسابه هو** (auth_role_base()
--   مدير ولا رفعَ PIN حيّاً)، وملاحظةٌ مكتوبة (٨ أحرف فأكثر)، وإقرارٌ صريح — ويُختم above_cap.
--   والنسبةُ نفسُها لا يغيّرها إلا صاحبُ العيادة من حسابه: لو غيّرها مفتاحُ المدير لصار
--   السقفُ الذي وضعه المالكُ للمفتاح بيد المفتاح.
-- • مشغّلُ المنصّة داخلَ عيادة (0151) لا يخصم ولا يلغي: سطرُ مالٍ يسمّي شخصاً من كادرها.
-- • «تسوية»: نفسُ الدالّة تقبض أوّلاً (p_pay) بشكل ساق 0061 حرفاً `{method, amount, at}` ثم
--   تخصم الباقي — بقفلِ صفٍّ واحد ومعاملةٍ واحدة. فـreceipt_legs وreceiptsOf وinvoice_settlements
--   تعدّ الدفعةَ ولا تعدّ الخصم (ليس مالاً وصل). وبيعةٌ بلا سِيَق (المدفوعُ ضمنيّ) تُثبَّت ساقُها
--   الضمنية أوّلاً بتاريخ الفاتورة (درسُ 0113) — وإلا أسقطت الساقُ الجديدة الدفعةَ الأولى من التقارير.
-- • المرفوض: فاتورةٌ مُرجَعة؛ بلا اسمٍ ولا هاتف (كـ0113: دينٌ بلا مَدين)؛ ولها طلبُ توصيلٍ مفتوح —
--   بقاعدة دفتر الديون حرفاً (DebtsPanel): «يجهَّز/بالطريق»، أو «وصل» ولم يُحصَّل — المَدينُ
--   حينها السائقُ أو الشركة لا الزبون.
-- • تفاؤلٌ محروس: p_expect_due = المتبقّي الذي رآه المدير؛ إن تغيّر بأكثر من فلس (جهازٌ آخر سدّد
--   أو عدّل) يُرفض بـdue_changed — لا يُخصم من رقمٍ لم يره.
-- • الإلغاءُ ختمٌ لا حذف: يرفع الدينَ كما كان، والسطرُ يبقى مشطوباً بسببه ومن ألغاه.
--
-- ── المرتجعُ والتعديلُ يستهلكان الخصمَ قبل النقد ───────────────────────────
-- بعد خصمٍ يصير الإجمالي = (المجموع − خصم البائع) − الخصم على الدين. فإن نزل المجموعُ (مرتجعٌ
-- أو تعديل) لا يجوز أن يبقى الخصمُ أكبرَ من الدين الذي كان يُسقطه:
--   raw = max(0, subtotal − discount)؛  forgiven_new = min(forgiven, max(0, raw − paid))؛
--   total = raw − forgiven_new — وما نقص يُكتب سطراً kind='consumed' بالسالب.
-- فلا يخرج نقدٌ للزبون إلا حين raw < paid: الخصمُ يُستهلك أوّلاً. (٤٠+٣٠، دُفع ٣٠، خُصم ٢٠ ⇒
-- الإجمالي ٥٠ والمتبقّي ٢٠؛ يرجع سطرُ الـ٣٠ ⇒ raw ٤٠، الخصمُ ١٠، الإجمالي ٣٠، المتبقّي صفر، ولا نقد.)
-- والإرجاعُ الكامل يبقى كما هو (refunded) والخصمُ معه — التقاريرُ تُسقط المُرجَعة كلَّها.
-- وإلغاءُ خصمٍ استُهلك منه شيء يُرفض (forgiveness_consumed): إلغاؤه يرفع ديناً على بضاعةٍ رجعت.
--
-- ── ومعها ────────────────────────────────────────────────────────────────
-- • settle_invoice (0061 حرفاً) تقرأ الفاتورةَ `for update`: تسديدٌ وخصمٌ متزامنان كانا يقرآن
--   المتبقّيَ نفسَه فيتجاوز مجموعُهما الدين. وتعديلُ البنود (0110) كذلك — يكتب forgiven من قراءته.
--   وتصحيحُ التحصيل (0113) كذلك: يكتب المدفوعَ والسِّيَقَ من قراءته، فـ«تسويةٌ» بينهما كانت تُمحى ساقُها.
-- • إلغاءُ الخصم يُرفض بطلب توصيلٍ مفتوح (قاعدةُ الخصم نفسها): وصلُ السائق كُتب على ما بعد الخصم.
-- • التدقيق: سطرُ الاستهلاك (consumed) أثرُ مرتجعٍ أو تعديل ⇒ sale_edit، لا «خصم على الدين».
-- • سِيَقُ الدفع: الموظّفُ (غيرُ المدير، تحديثٌ مباشر) يغيّر **طريقةَ** ساقٍ قائمة وحدها
--   (setInvoicePaymentMethod)؛ المبلغُ والوقتُ والملاحظةُ وعددُ السِّيَق للمدير — كان بإمكانه نقلُ
--   مالٍ بين الجيوب أو تأريخُ دفعةٍ بيومٍ آخر بلا أثرٍ بالمبالغ. محفّزٌ invoker كـ0162.
-- • invoices.forgiven لا يُكتب مباشرةً أبداً (ولا من المدير): الدالّتان وحدهما — وإلا انكسر الثابت.
-- • invoice_settlements (0240) تجيب أيضاً الفاتورةَ التي خُصم عليها منذ p_since (سطرُ «خصم على الدين»
--   بقائمة الفواتير بوقته، كسطر التسديد).
-- • و«تسديد دفعة» لدين الزبون وحده: ساقُ تحصيل التوصيل (السائقُ أو الشركة) لا تُرى سطراً — بعلامةٍ
--   invoice_delivery_marks (١٠أ) يقرؤها الخادمُ والواجهةُ بالقاعدة نفسها. العرضُ وحده؛ المالُ كما هو.
-- • audit_kind: invoice_forgiveness ⇒ debt_forgive (والإلغاء debt_forgive_void)، والدفترُ بطبقة
--   المال بالكنس (سنة) — بالقوائم الثلاث (الكنس، معاينتُه، نبضُه) كما تتبع بعضها منذ 0226.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0240، **وقبل الواجهة** (الواجهةُ تنادي الدوالّ الجديدة).
-- تراجع: أعد settle_invoice (0061)، correct_invoice_receipt (0113)، edit_invoice_lines_unguarded (0110 باسمها)، return_invoice_items
--        (0121)، invoice_settlements (0240)، audit_kind (0233)، purge_audit_log/audit_log_preview/
--        system_health (0226) حرفاً؛ ثم drop المحفّزات الثلاثة والدوالّ الجديدة. الجدولُ والعمودان
--        يبقيان (لا يقرؤهما شيءٌ قديم) — وإسقاطُ forgiven بعد خصمٍ يُفقد أثرَه من الفاتورة.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) العمود: ما خُصم من دين هذه الفاتورة، صافياً ───────────────────────────
alter table invoices add column if not exists forgiven numeric not null default 0;
do $$ begin
  -- not valid: العمودُ جديدٌ بصفرٍ افتراضيّ، فلا صفَّ قائماً يخالف — ولا مسحَ لجدول الفواتير كلّه.
  alter table invoices add constraint invoices_forgiven_nonneg check (forgiven >= 0) not valid;
exception when duplicate_object then null; end $$;

comment on column invoices.forgiven is
  'الخصمُ على الدين (0241): ما أسقطته العيادةُ من باقي هذه الفاتورة بعد البيع. total نزل به '
  '(نموذجُ يوم البيع). يساوي دائماً مجموعَ سطور invoice_forgiveness غيرِ الملغاة. يُكتب من الدوالّ وحدها.';

-- ── ٢) الرفعُ بمفتاح المدير حيٌّ الآن؟ (نفسُ شرط auth_role بـ0151 حرفاً) ───────────
-- الجدولُ بلا سياسة قراءة للمستخدم، فالسؤالُ من دالّةٍ مُعرِّفة: تقرأ صفَّ السائل وحده.
create or replace function public.pin_elevation_live()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff_elevations
                  where user_id = auth.uid() and until > now())
$$;
revoke all on function public.pin_elevation_live() from public, anon;
grant execute on function public.pin_elevation_live() to authenticated;

-- ── ٣) التجميد: forgiven لا يُكتب مباشرةً، وسِيَقُ الدفع لغير المدير طريقتُها وحدها ──
-- كلاهما invoker يحرس `current_user = 'authenticated'` وحده (كـ0162): دوالُّ المالك تمرّ.
create or replace function invoices_guard_forgiven()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if (tg_op = 'UPDATE' and new.forgiven is distinct from old.forgiven)
     or (tg_op = 'INSERT' and coalesce(new.forgiven, 0) <> 0) then
    raise exception 'invoice_forgiven_frozen'
      using hint = 'الخصمُ على الدين يُسجَّل من زرّ «خصم على الدين» بالفاتورة وحده — لا بتعديلٍ مباشر.';
  end if;
  return new;
end $$;

drop trigger if exists invoices_forgiven_guard on invoices;
create trigger invoices_forgiven_guard
  before insert or update on invoices
  for each row execute function invoices_guard_forgiven();

create or replace function invoices_guard_legs()
returns trigger language plpgsql set search_path = public as $$
declare
  o     jsonb;
  n     jsonb;
  i     int;
  v_bad boolean := false;
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.payment_details is not distinct from old.payment_details then return new; end if;
  if coalesce(auth_role(), '') = 'manager' then return new; end if;
  o := coalesce(old.payment_details, '[]'::jsonb);
  n := coalesce(new.payment_details, '[]'::jsonb);
  if jsonb_typeof(o) <> 'array' or jsonb_typeof(n) <> 'array' then
    v_bad := true;
  elsif jsonb_array_length(o) <> jsonb_array_length(n) then
    v_bad := true;
  else
    -- ساقاً ساقاً: لا يتغيّر فيها إلا method. (شروطٌ متداخلة لا OR: `-` على غير كائنٍ يرمي،
    -- وبوستغريس لا يضمن ترتيبَ الشروط.)
    for i in 0 .. jsonb_array_length(o) - 1 loop
      if (o -> i) is distinct from (n -> i) then
        if jsonb_typeof(o -> i) <> 'object' or jsonb_typeof(n -> i) <> 'object' then
          v_bad := true;
        elsif ((o -> i) - 'method') is distinct from ((n -> i) - 'method') then
          v_bad := true;
        end if;
      end if;
    end loop;
  end if;
  if v_bad then
    raise exception 'payment_legs_frozen'
      using hint = 'تقسيمُ الدفعة (المبالغ والأوقات وعددُ الدفعات) للمدير — تقدر تغيّر طريقةَ الدفع وحدها.';
  end if;
  return new;
end $$;

drop trigger if exists invoices_legs_guard on invoices;
create trigger invoices_legs_guard
  before update on invoices
  for each row execute function invoices_guard_legs();

-- ── ٤) الدفتر ───────────────────────────────────────────────────────────────
create table if not exists invoice_forgiveness (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  invoice_id   uuid not null references invoices(id) on delete cascade,
  -- forgive = خصمٌ أعطاه المدير (موجب)؛ consumed = ما استهلكه مرتجعٌ أو تعديلٌ بعده (سالب).
  kind         text not null check (kind in ('forgive', 'consumed')),
  amount       numeric not null,
  reason_code  text check (reason_code is null or reason_code in ('negotiation', 'loyal', 'hardship', 'dispute', 'other')),
  note         text check (note is null or char_length(note) <= 500),
  -- «تسوية»: ما قُبض بنفس النداء قبل الخصم (والساقُ نفسُها بـpayment_details).
  pay_amount   numeric not null default 0 check (pay_amount >= 0),
  pay_method   text,
  -- لقطةُ الفاتورة لحظةَ الخصم (بعد دفعة التسوية، قبل الخصم).
  total_before numeric,
  paid_before  numeric,
  due_before   numeric,
  profit_base  numeric,
  cost_total   numeric,
  pct          int check (pct is null or pct between 0 and 100),
  above_cap    boolean not null default false,
  via_pin      boolean not null default false,
  cust_key     text,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  voided_at    timestamptz,
  voided_by    uuid,
  void_reason  text check (void_reason is null or char_length(void_reason) <= 300),
  constraint invoice_forgiveness_sign check (
    (kind = 'forgive' and amount > 0 and reason_code is not null) or
    (kind = 'consumed' and amount < 0)),
  constraint invoice_forgiveness_void_kind check (voided_at is null or kind = 'forgive')
);

-- invoice_id أوّلاً (مفتاحُ الأب، وقراءةُ «خصومات هذه الفواتير»)، والعيادةُ بالزمن للتقرير.
create index if not exists invoice_forgiveness_invoice_idx on invoice_forgiveness(invoice_id, created_at);
create index if not exists invoice_forgiveness_clinic_idx  on invoice_forgiveness(clinic_id, created_at desc);

alter table invoice_forgiveness enable row level security;
-- قراءةٌ للعيادة وحدها، ولا سياسةَ كتابة ولا منحَ كتابة: كلُّ كتابةٍ من دالّةٍ تفحص الدورَ بنفسها.
drop policy if exists invoice_forgiveness_select on invoice_forgiveness;
create policy invoice_forgiveness_select on invoice_forgiveness for select
  using (clinic_id = (select auth_clinic()));
revoke all on invoice_forgiveness from anon, authenticated;
grant select on invoice_forgiveness to authenticated;

drop trigger if exists audit_all on invoice_forgiveness;
create trigger audit_all after insert or update on invoice_forgiveness
  for each row execute function audit_change();

select public.photographer_fence_table('invoice_forgiveness');

comment on table invoice_forgiveness is
  'الخصمُ على الدين (0241): سطرٌ لكلّ خصمٍ على باقي فاتورة (forgive، موجب) ولكلّ ما استهلكه مرتجعٌ '
  'أو تعديلٌ بعده (consumed، سالب)، بلقطة الفاتورة لحظتَه. الإلغاءُ ختمٌ لا حذف. الكتابةُ من الدوالّ وحدها.';

-- ── ٥) النسبة: أقصى ما يُخصم من ربح الفاتورة بلا صاحب العيادة ─────────────────
alter table clinic_prefs add column if not exists forgive_profit_pct int not null default 100;
do $$ begin
  alter table clinic_prefs add constraint clinic_prefs_forgive_pct_range check (forgive_profit_pct between 0 and 100);
exception when duplicate_object then null; end $$;

create or replace function clinic_prefs_guard_forgive_pct()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if (tg_op = 'UPDATE' and new.forgive_profit_pct is distinct from old.forgive_profit_pct)
     or (tg_op = 'INSERT' and new.forgive_profit_pct is distinct from 100) then
    -- والمشغّلُ داخلَ العيادة (0151) مديرٌ بـauth_role_base() بلا صفِّ مفتاح — فيُسأل عنه
    -- صراحةً كما بالخصم نفسه: السقفُ قرارُ صاحب العيادة لا من يزورها.
    if platform_acting_clinic() is not null
       or coalesce(auth_role_base(), '') <> 'manager' or pin_elevation_live() then
      raise exception 'forgive_pct_owner_only'
        using hint = 'نسبةُ الخصم المسموح من الربح يحدّدها صاحبُ العيادة من حسابه — مفتاحُ المدير لا يكفي.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists clinic_prefs_forgive_pct_guard on clinic_prefs;
create trigger clinic_prefs_forgive_pct_guard
  before insert or update on clinic_prefs
  for each row execute function clinic_prefs_guard_forgive_pct();

-- ── ٦) الخصم (والتسوية) ────────────────────────────────────────────────────
create or replace function public.forgive_invoice_debt(
  p_invoice      uuid,
  p_amount       numeric,
  p_reason       text,
  p_note         text    default null,
  p_expect_due   numeric default null,
  p_pay          numeric default 0,
  p_method       text    default 'cash',
  p_confirm_loss boolean default false)
returns invoices
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_role    text := coalesce(auth_role(), '');
  v_base    text := coalesce(auth_role_base(), '');
  v_pin     boolean := pin_elevation_live();
  v_inv     invoices;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note    text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_pay     numeric := round(coalesce(p_pay, 0), 2);
  v_method  text := coalesce(nullif(p_method, ''), 'cash');
  v_due     numeric;
  v_details jsonb;
  v_total_b numeric;
  v_paid_b  numeric;
  v_pct     int;
  v_dial    text;
  v_basepr  numeric;
  v_allowed numeric;
  v_loss    numeric;
  v_above   boolean := false;
begin
  if v_clinic is null or auth.uid() is null then
    raise exception 'not_allowed' using hint = 'سجّل الدخول أوّلاً.';
  end if;
  if platform_acting_clinic() is not null then
    raise exception 'operator_not_allowed'
      using hint = 'مشغّلُ المنصّة لا يخصم من ديون العيادة — الخصمُ سطرُ مالٍ يسمّي شخصاً من كادرها.';
  end if;
  if v_role <> 'manager' then
    raise exception 'not_allowed' using hint = 'الخصمُ على الدين للمدير — أو افتح وضعَ المدير برمزه.';
  end if;

  -- قفلُ الصفّ: تسديدٌ أو خصمٌ أو تعديلٌ من جهازٍ آخر ينتظر حتى ننتهي.
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then
    raise exception 'invoice_not_found' using hint = 'الفاتورةُ غيرُ موجودة بعيادتك.';
  end if;
  if v_inv.status = 'refunded' then
    raise exception 'invoice_refunded' using hint = 'الفاتورةُ مُرجَعة — لا دينَ عليها يُخصم.';
  end if;
  if coalesce(nullif(btrim(v_inv.customer_name), ''), nullif(btrim(v_inv.customer_phone), '')) is null then
    raise exception 'customer_required'
      using hint = 'الخصمُ على دين زبونٍ معروف — اكتب اسمَه أو رقمَه بالفاتورة أوّلاً.';
  end if;
  -- قاعدةُ دفتر الديون حرفاً (DebtsPanel): يجهَّز/بالطريق، أو وصل ولم يُحصَّل ⇒ المَدينُ ليس الزبون.
  if exists (select 1 from delivery_orders d
              where d.invoice_id = v_inv.id and d.clinic_id = v_clinic
                and (d.status in ('preparing', 'out')
                     or (d.status = 'delivered' and d.collected_at is null))) then
    raise exception 'invoice_has_open_delivery'
      using hint = 'لهذه الفاتورة طلبُ توصيلٍ مفتوح — المبلغُ بذمّة السائق أو الشركة لا الزبون. حصّله من «التوصيل» أوّلاً.';
  end if;

  v_due := greatest(round(coalesce(v_inv.total, 0) - coalesce(v_inv.amount_paid, v_inv.total, 0), 2), 0);
  if p_expect_due is not null and abs(round(p_expect_due, 2) - v_due) > 0.005 then
    raise exception 'due_changed'
      using hint = format('تغيّر المتبقّي على هذه الفاتورة (صار %s) — جهازٌ آخر سدّد أو عدّل. افتحها من جديد.',
                          rtrim(to_char(v_due, 'FM999,999,999,990.99'), '.'));
  end if;

  if v_reason is null or v_reason not in ('negotiation', 'loyal', 'hardship', 'dispute', 'other') then
    raise exception 'reason_required'
      using hint = 'اختر سببَ الخصم: اتفاق تسوية، زبون دائم، ظرف الزبون، خلاف على المبلغ، أو غير ذلك.';
  end if;
  if v_reason = 'other' and v_note is null then
    raise exception 'note_required' using hint = '«غير ذلك» يحتاج ملاحظةً تشرح السبب.';
  end if;
  if v_amt <= 0 or v_pay < 0 then
    raise exception 'amount_invalid' using hint = 'مبلغُ الخصم لازم يكون أكبر من صفر.';
  end if;

  -- «تسوية»: الدفعةُ أوّلاً، بشكل ساق 0061 حرفاً، ومقصوصةً على المتبقّي.
  v_pay := least(v_pay, v_due);
  if v_pay > 0 then
    v_details := case when jsonb_typeof(v_inv.payment_details) = 'array' then v_inv.payment_details else '[]'::jsonb end;
    -- بيعةٌ بلا سِيَق: المدفوعُ ضمنيٌّ تشتقّه التقارير — نثبّته صراحةً بتاريخ الفاتورة قبل أن
    -- تُسقطه الساقُ الجديدة (درسُ 0113). وما فيه سِيَقٌ لا يُمسّ.
    if jsonb_array_length(v_details) = 0 and coalesce(v_inv.amount_paid, 0) > 0.005 then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_inv.amount_paid,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || jsonb_build_object(
      'method', v_method,
      'amount', v_pay,
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    update invoices
       set amount_paid     = coalesce(v_inv.amount_paid, 0) + v_pay,
           payment_details = v_details,
           payment_method  = (select e->>'method' from jsonb_array_elements(v_details) e
                              order by (e->>'amount')::numeric desc limit 1)
     where id = v_inv.id and clinic_id = v_clinic
     returning * into v_inv;
    v_due := greatest(round(coalesce(v_inv.total, 0) - coalesce(v_inv.amount_paid, 0), 2), 0);
  end if;

  if v_amt > v_due + 0.005 then
    raise exception 'above_due'
      using hint = format('الخصمُ أكبر من المتبقّي على الفاتورة (%s).', rtrim(to_char(v_due, 'FM999,999,999,990.99'), '.'));
  end if;
  v_amt := least(v_amt, v_due);

  -- السقف: النسبةُ من ربح البيعة قبل أيّ خصمٍ على الدين، ناقصَ ما خُصم قبل.
  select cp.forgive_profit_pct, cp.dial_code into v_pct, v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
  v_pct     := coalesce(v_pct, 100);
  v_basepr  := coalesce(v_inv.profit, 0) + coalesce(v_inv.forgiven, 0);
  v_allowed := greatest(0, least(v_due, round(v_pct * v_basepr / 100.0, 2) - coalesce(v_inv.forgiven, 0)));
  if v_amt > v_allowed + 0.005 then
    v_loss := greatest(0, round(v_amt - coalesce(v_inv.profit, 0), 2));
    if v_pin or v_base <> 'manager' then
      raise exception 'above_profit_needs_owner'
        using hint = case when v_pin
          then format('الخصمُ أكبر من المسموح من ربح الفاتورة (%s) — يحتاج صاحبَ العيادة من حسابه هو بلا مفتاح المدير؛ ومفتاحُ المدير مفتوحٌ على حسابك الآن (على جهازٍ ما). أقفله أو انتظر انتهاءه ثم أعد المحاولة.',
                      rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.'))
          else format('الخصمُ أكبر من المسموح من ربح الفاتورة (%s) — يحتاج صاحبَ العيادة من حسابه.',
                      rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.')) end;
    end if;
    if v_note is null or char_length(v_note) < 8 then
      raise exception 'note_required'
        using hint = 'الخصمُ فوق المسموح من الربح يحتاج ملاحظةً مكتوبة تشرح السبب (٨ أحرف فأكثر).';
    end if;
    if not coalesce(p_confirm_loss, false) then
      raise exception 'confirm_loss_required'
        using hint = case when v_loss > 0
          then format('هذا الخصمُ بيعٌ بخسارة %s — أكّد أنّك تفهم هذا قبل الحفظ.', rtrim(to_char(v_loss, 'FM999,999,999,990.99'), '.'))
          else format('هذا الخصمُ فوق المسموح من الربح (%s) — أكّد قبل الحفظ.', rtrim(to_char(v_allowed, 'FM999,999,999,990.99'), '.')) end;
    end if;
    v_above := true;
  end if;

  v_total_b := v_inv.total;
  v_paid_b  := coalesce(v_inv.amount_paid, v_inv.total);

  update invoices
     set forgiven = round(coalesce(forgiven, 0) + v_amt, 2),
         total    = round(total - v_amt, 2),
         profit   = round(coalesce(profit, 0) - v_amt, 2)
   where id = v_inv.id and clinic_id = v_clinic
   returning * into v_inv;

  insert into invoice_forgiveness (
    clinic_id, invoice_id, kind, amount, reason_code, note, pay_amount, pay_method,
    total_before, paid_before, due_before, profit_base, cost_total, pct, above_cap, via_pin, cust_key)
  values (
    v_clinic, v_inv.id, 'forgive', v_amt, v_reason, v_note, v_pay, case when v_pay > 0 then v_method end,
    v_total_b, v_paid_b, v_due, v_basepr, v_inv.cost_total, v_pct, v_above, v_pin,
    cust_key(v_inv.customer_phone, v_inv.customer_name, v_dial));  -- نفسُ نداء 0232 حرفاً: المفتاحان يتّفقان

  return v_inv;
end $$;
revoke all on function public.forgive_invoice_debt(uuid, numeric, text, text, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.forgive_invoice_debt(uuid, numeric, text, text, numeric, numeric, text, boolean) to authenticated;

-- ── ٧) الإلغاء: الدينُ يرجع كما كان، والسطرُ يبقى مشطوباً ─────────────────────
create or replace function public.void_invoice_forgiveness(p_entry uuid, p_reason text)
returns invoices
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
  v_inv_id uuid;
  v_row    invoice_forgiveness;
  v_inv    invoices;
begin
  if v_clinic is null or auth.uid() is null then
    raise exception 'not_allowed' using hint = 'سجّل الدخول أوّلاً.';
  end if;
  if platform_acting_clinic() is not null then
    raise exception 'operator_not_allowed'
      using hint = 'مشغّلُ المنصّة لا يلغي خصوماتِ العيادة — الإلغاءُ سطرُ مالٍ يسمّي شخصاً من كادرها.';
  end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'not_allowed' using hint = 'إلغاءُ الخصم للمدير — أو افتح وضعَ المدير برمزه.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'reason_required' using hint = 'اكتب سببَ إلغاء الخصم.';
  end if;

  select f.invoice_id into v_inv_id from invoice_forgiveness f where f.id = p_entry and f.clinic_id = v_clinic;
  if not found then
    raise exception 'entry_not_found' using hint = 'سطرُ الخصم غيرُ موجود بعيادتك.';
  end if;
  -- الفاتورةُ أوّلاً ثم السطر — نفسُ ترتيب أقفال الخصم والمرتجع، فلا يتعانق قفلان.
  select * into v_inv from invoices where id = v_inv_id and clinic_id = v_clinic for update;
  if not found then
    raise exception 'invoice_not_found' using hint = 'الفاتورةُ غيرُ موجودة بعيادتك.';
  end if;
  select * into v_row from invoice_forgiveness where id = p_entry and clinic_id = v_clinic for update;
  if not found then
    raise exception 'entry_not_found' using hint = 'سطرُ الخصم غيرُ موجود بعيادتك.';
  end if;
  if v_row.kind <> 'forgive' then
    raise exception 'entry_not_voidable'
      using hint = 'هذا السطرُ استهلاكٌ تبع مرتجعاً أو تعديلاً — لا يُلغى وحده.';
  end if;
  if v_row.voided_at is not null then
    raise exception 'already_voided' using hint = 'هذا الخصمُ مُلغى من قبل.';
  end if;
  if v_inv.status = 'refunded' then
    raise exception 'invoice_refunded' using hint = 'الفاتورةُ مُرجَعة — لا دينَ يرجع عليها.';
  end if;
  -- نفسُ قاعدة الخصم حرفاً: طلبُ توصيلٍ مفتوح ⇒ المَدينُ السائقُ أو الشركة، ووصلُه (cod_amount)
  -- كُتب على الإجمالي بعد الخصم. رفعُ الإجمالي الآن يجعل الدفترَ يطالبهم بما لم يُطلب منهم جمعُه.
  if exists (select 1 from delivery_orders d
              where d.invoice_id = v_inv.id and d.clinic_id = v_clinic
                and (d.status in ('preparing', 'out')
                     or (d.status = 'delivered' and d.collected_at is null))) then
    raise exception 'invoice_has_open_delivery'
      using hint = 'لهذه الفاتورة طلبُ توصيلٍ مفتوح — إلغاءُ الخصم يرفع مبلغاً لم يُطلب من السائق جمعُه. حصّل الطلبَ من «التوصيل» أوّلاً.';
  end if;
  if coalesce(v_inv.forgiven, 0) + 0.005 < v_row.amount then
    raise exception 'forgiveness_consumed'
      using hint = 'استُهلك جزءٌ من هذا الخصم بمرتجعٍ أو تعديلٍ بعده — إلغاؤه يرفع ديناً على بضاعةٍ رجعت.';
  end if;

  update invoices
     set forgiven = greatest(0, round(coalesce(forgiven, 0) - v_row.amount, 2)),
         total    = round(total + v_row.amount, 2),
         profit   = round(coalesce(profit, 0) + v_row.amount, 2)
   where id = v_inv.id and clinic_id = v_clinic
   returning * into v_inv;

  update invoice_forgiveness
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_entry and clinic_id = v_clinic;

  return v_inv;
end $$;
revoke all on function public.void_invoice_forgiveness(uuid, text) from public, anon;
grant execute on function public.void_invoice_forgiveness(uuid, text) to authenticated;

-- ── ٨) الاستهلاك: سطرٌ سالب حين ينقص الخصمُ بمرتجعٍ أو تعديل ──────────────────
-- داخليّة: تُنادى من return_invoice_items وedit_invoice_lines_unguarded (المالك) وحدهما.
create or replace function public.invoice_forgiveness_consume(
  p_clinic uuid, p_invoice uuid, p_amount numeric, p_note text,
  p_total_before numeric, p_paid_before numeric)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_inv  invoices;
  v_dial text;
begin
  if coalesce(p_amount, 0) <= 0 then return; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = p_clinic;
  select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = p_clinic;
  insert into invoice_forgiveness (
    clinic_id, invoice_id, kind, amount, note, total_before, paid_before, due_before, cost_total, via_pin, cust_key)
  values (
    p_clinic, p_invoice, 'consumed', -round(p_amount, 2), p_note, p_total_before, p_paid_before,
    greatest(0, round(coalesce(p_total_before, 0) - coalesce(p_paid_before, 0), 2)),
    v_inv.cost_total, pin_elevation_live(), cust_key(v_inv.customer_phone, v_inv.customer_name, v_dial));
end $$;
revoke all on function public.invoice_forgiveness_consume(uuid, uuid, numeric, text, numeric, numeric) from public, anon, authenticated;

-- ── ٩) القراءة ─────────────────────────────────────────────────────────────
-- سطورُ فواتيرَ بعينها (الملغاةُ معها، مشطوبةً بالواجهة). بصلاحية المُستدعي: RLS + auth_clinic.
create or replace function public.list_invoice_forgiveness(p_invoice_ids uuid[])
returns setof invoice_forgiveness
language sql
stable
security invoker
set search_path = public
as $$
  select f.*
    from invoice_forgiveness f
   where f.clinic_id = auth_clinic()
     and f.invoice_id = any (coalesce(p_invoice_ids, '{}'::uuid[]))
   order by f.created_at, f.id
$$;
revoke all on function public.list_invoice_forgiveness(uuid[]) from public, anon;
grant execute on function public.list_invoice_forgiveness(uuid[]) to authenticated;

-- «خصومات الديون» بالفترة: سطورُ الدفتر بيومها مع زبون الفاتورة — والواجهةُ تجمع (بالمعتمِد
-- والسبب). مدّةٌ لازمة: بلاها خطأٌ لا قائمةٌ فارغة.
create or replace function public.report_forgiveness(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, invoice_id uuid, kind text, amount numeric, reason_code text, note text,
  pay_amount numeric, pay_method text, total_before numeric, paid_before numeric, due_before numeric,
  profit_base numeric, cost_total numeric, pct int, above_cap boolean, via_pin boolean, cust_key text,
  created_at timestamptz, created_by uuid, created_by_name text,
  voided_at timestamptz, voided_by uuid, void_reason text,
  customer_name text, customer_phone text, invoice_total numeric, invoice_status text, invoice_created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'range_required' using hint = 'تقريرُ خصومات الديون يحتاج مدّةً (من — إلى).';
  end if;
  return query
  select f.id, f.invoice_id, f.kind, f.amount::numeric, f.reason_code, f.note,
         f.pay_amount::numeric, f.pay_method, f.total_before::numeric, f.paid_before::numeric, f.due_before::numeric,
         f.profit_base::numeric, f.cost_total::numeric, f.pct, f.above_cap, f.via_pin, f.cust_key,
         f.created_at, f.created_by,
         (select s.name::text from staff s
           where s.user_id = f.created_by and s.clinic_id = f.clinic_id
           order by s.created_at limit 1),
         f.voided_at, f.voided_by, f.void_reason,
         i.customer_name::text, i.customer_phone::text, i.total::numeric, i.status::text, i.created_at
    from invoice_forgiveness f
    join invoices i on i.id = f.invoice_id
   where f.clinic_id = auth_clinic()
     and f.created_at >= p_from and f.created_at <= p_to
   order by f.created_at, f.id;
end $$;
revoke all on function public.report_forgiveness(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_forgiveness(timestamptz, timestamptz) to authenticated;

-- ── ١٠أ) علامةُ التوصيل: أيُّ ساقٍ تحصيلُ توصيلٍ لا تسديدُ زبون ─────────────────────
-- «تسديد دفعة» بقائمة الفواتير لدين **الزبون** وحده. وصلُ السائق وتحصيلُ الشركة يدخلان payment_details
-- بنفس شكل ساق 0061 — فكانا يُرسمان «تسديداً» عن مالٍ لم يجئ به الزبون.
-- المقيس (الإنتاج، ٩٠ يوماً): ٩٥٦ ساقاً لفواتيرَ بطلب توصيل، كلُّها قبل collected_at أو بعده بـ٤٫٢ ثانية
-- على الأكثر (السائقُ يختم collected_at بساعة الجهاز قبل أن تختم settle_invoice ساقَها بالخادم؛ والشركةُ
-- بـcourier_settle حيث الاثنان now())، وصفرٌ بعده بأكثر من ساعة. فالقاعدةُ (قرارُ المالك):
--   ساقٌ = تحصيلُ توصيل ⇔ لفاتورتها طلبٌ status <> 'returned'
--                         و(collected_at is null أو at <= collected_at + 10 دقائق).
-- وما بعدها سطرُ تسديد (الزبونُ دفع الباقي بالعيادة)، والمُرجَعُ لا يُخفي ساقاً أبداً.
-- العرضُ وحده: «المتبقّي بعده» والوصولاتُ والتقاريرُ والديونُ والخصمُ لا تتغيّر.
-- طلبٌ واحدٌ لكلّ فاتورة (delivery_orders_invoice_uniq، 0180) — فالعلامةُ صفٌّ واحدٌ أو لا شيء، والحكمُ دقيق.
-- بصلاحية المُستدعي (RLS + auth_clinic)، ومرآتُها isDeliveryCollection (settlementFeed.ts) بنفس المهلة.
-- و`id` (معرّفُ الطلب) لأن الواجهةَ تقرؤها بـallPages — المؤشّرُ يتقدّم بـid، فلا سقفَ ألفٍ صامت.
create or replace function public.invoice_delivery_marks(p_invoice_ids uuid[])
returns table (id uuid, invoice_id uuid, collected_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id, d.invoice_id, d.collected_at
    from delivery_orders d
   where d.clinic_id = auth_clinic()
     and d.invoice_id = any (coalesce(p_invoice_ids, '{}'::uuid[]))
     and d.status <> 'returned'
   order by d.id
$$;
revoke all on function public.invoice_delivery_marks(uuid[]) from public, anon;
grant execute on function public.invoice_delivery_marks(uuid[]) to authenticated;

-- ── ١٠) invoice_settlements (0240) + الفاتورةُ التي خُصم عليها منذ p_since ────────
-- نسخةُ 0240 حرفاً إلا: الفرعَ الثاني (خصمٌ حيٌّ غيرُ ملغى منذ اللحظة يُرى سطراً بوقته)، وساقَ تحصيل
-- التوصيل (١٠أ) لا تجيب فاتورتَها — بنفس القاعدة والمهلة.
create or replace function invoice_settlements(p_q text default null, p_status text default 'all',
                                               p_since timestamptz default null)
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.*
    from invoices i
   where i.clinic_id = auth_clinic()
     and invoice_matches(i, p_q, p_status)
     and (exists (
       select 1
         -- CASE لا AND: بوستغريس لا يضمن ترتيبَ الشروط، وjsonb_array_elements على غير مصفوفةٍ يرمي.
         from jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array' then i.payment_details else '[]'::jsonb end) l
        where coalesce(safe_num(l->>'amount'), 0) > 0.01
          and coalesce(l->>'reversal_of', '') = ''
          and safe_ts(l->>'at') > i.created_at
          and (p_since is null or safe_ts(l->>'at') >= p_since)
          -- تحصيلُ توصيل (١٠أ) ليس تسديدَ زبون.
          and not exists (
            select 1
              from delivery_orders d
             where d.invoice_id = i.id and d.clinic_id = i.clinic_id
               and d.status <> 'returned'
               and (d.collected_at is null or safe_ts(l->>'at') <= d.collected_at + interval '10 minutes')))
       or exists (
       select 1
         from invoice_forgiveness f
        where f.invoice_id = i.id and f.clinic_id = i.clinic_id
          and f.kind = 'forgive' and f.voided_at is null
          and (p_since is null or f.created_at >= p_since)))
   order by i.created_at desc, i.id desc
$$;
revoke all on function invoice_settlements(text, text, timestamptz) from public, anon;
grant execute on function invoice_settlements(text, text, timestamptz) to authenticated;

-- ── ١١) settle_invoice — نسخةُ 0061 حرفاً إلا `for update` على قراءة الفاتورة ────────
create or replace function settle_invoice(p_invoice uuid, p_amount numeric, p_method text default 'cash')
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_inv     invoices;
  v_add     numeric(14,2);
  v_details jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- 0241: قفلُ الصفّ — تسديدٌ وخصمٌ متزامنان كانا يقرآن المتبقّيَ نفسَه.
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;

  v_add := least(greatest(coalesce(p_amount, 0), 0), v_inv.total - v_inv.amount_paid);
  if v_add > 0 then
    v_details := coalesce(v_inv.payment_details, '[]'::jsonb)
                 || jsonb_build_object(
                      'method', coalesce(nullif(p_method, ''), 'cash'),
                      'amount', v_add,
                      -- The collection timestamp: this is what dates the settlement on
                      -- its own day in the money reports.
                      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                    );
    update invoices
      set amount_paid     = v_inv.amount_paid + v_add,
          payment_details = v_details,
          -- Keep payment_method as the dominant (largest) leg — matches the demo adapter.
          payment_method  = (select e->>'method' from jsonb_array_elements(v_details) e
                             order by (e->>'amount')::numeric desc limit 1)
    where id = p_invoice and clinic_id = v_clinic
    returning * into v_inv;
  end if;

  return v_inv;
end $$;
revoke all on function settle_invoice(uuid, numeric, text) from public, anon;
grant execute on function settle_invoice(uuid, numeric, text) to authenticated;

-- ── ١١ب) correct_invoice_receipt — نسخةُ 0113 حرفاً إلا `for update` على قراءة الفاتورة ─────
-- رابعُ كاتبٍ للمدفوع والسِّيَق يحسب من قراءته (amount_paid − المقطوع، والسِّيَقُ القديمة + السالبة).
create or replace function correct_invoice_receipt(
  p_invoice uuid, p_amount numeric, p_reason text, p_method text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_inv     invoices;
  v_cut     numeric(14,2);
  v_method  text;
  v_details jsonb;
  v_pos     numeric(14,2);
  v_who     text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- عملية مالية عادية كالمصروفات ⇒ auth_role() لا auth_role_base(): رفع
  -- الصلاحية برمز المدير مقصودٌ أن يغطّي تصحيحات الصندوق على جهاز مشترك.
  if auth_role() <> 'manager' then raise exception 'not allowed'; end if;

  -- 0241: قفلُ الصفّ — التصحيحُ يكتب المدفوعَ والسِّيَقَ من قراءته، فتسديدٌ أو «تسوية» من جهازٍ
  -- آخر بين القراءة والكتابة كانت ساقُه تُمحى ومالُه يرجع ديناً.
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;

  -- السبب **مستحبٌّ لا إلزامي**. جرّبنا إلزامه فكانت النتيجة أن يُكتب حرفٌ
  -- عشوائيّ لتجاوز الحقل — وسببٌ مزيّف أسوأ من لا سبب: يبدو أثراً وهو ليس
  -- أثراً. والأثر الحقيقي محفوظ بلا سبب أصلاً: مَن، ومتى، وكم، وأي جيب.
  -- فيُكتَب حين يُكتَب، ويُترك حين يُترك.

  -- الباقي يصير ديناً، والدين يحتاج صاحباً. بيعةٌ بلا زبون لا يُلاحَق دينها،
  -- فالتصحيح عليها يخلق مطلوباً بلا مَدين — ونرفضه بدل أن ننتجه.
  v_who := coalesce(nullif(btrim(v_inv.customer_name), ''), nullif(btrim(v_inv.customer_phone), ''));
  if v_who is null then raise exception 'customer required'; end if;

  -- لا يُعكَس أكثر مما سُجّل واصلاً.
  v_cut := round(coalesce(p_amount, 0)::numeric, 2);
  if v_cut <= 0 then raise exception 'bad amount'; end if;
  if v_cut > v_inv.amount_paid then raise exception 'above collected'; end if;

  v_method := coalesce(
    nullif(btrim(p_method), ''),
    (select e->>'method' from jsonb_array_elements(coalesce(v_inv.payment_details, '[]'::jsonb)) e
      where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
    v_inv.payment_method, 'cash');

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);

  -- البيعة النقدية البسيطة تُخزَّن **بلا سجلّ سِيَق**: التقارير تشتقّ منها
  -- ساقاً ضمنية بكامل المدفوع ما دامت المصفوفة فارغة. ولو أضفنا السالب فوق
  -- الفراغ لسقطت تلك الضمنية — فيبقى بالسجلّ سالبٌ وحده، ويقرأ الصندوق
  -- مبلغاً سالباً. فنُثبّت الأصل صراحةً أولاً، ثم نعكس عليه.
  select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
    from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
  if v_pos < v_inv.amount_paid then
    v_details := v_details || jsonb_build_object(
      'method', coalesce(v_inv.payment_method, v_method),
      'amount', v_inv.amount_paid - v_pos,
      'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  v_details := v_details
    || (jsonb_build_object(
         'method', v_method,
         -- الإشارة السالبة هي ما يميّز التصحيح: لا حاجة لعَلَمٍ إضافي.
         'amount', -v_cut,
         'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       -- السبب يُضاف مفتاحاً حين يوجد وحده: مفتاحٌ فارغ يُعرَض شرطةً خاوية
       -- بكل تقرير يقرأه.
       || case when length(coalesce(btrim(p_reason), '')) > 0
               then jsonb_build_object('note', btrim(p_reason))
               else '{}'::jsonb end);

  update invoices
     set amount_paid     = greatest(0, v_inv.amount_paid - v_cut),
         payment_details = v_details,
         -- الطريقة المعروضة تبقى الغالبة من السطور **الموجبة** وحدها.
         payment_method  = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                      where (e->>'amount')::numeric > 0
                                      order by (e->>'amount')::numeric desc limit 1),
                                    v_inv.payment_method)
   where id = p_invoice and clinic_id = v_clinic
   returning * into v_inv;

  return v_inv;
end $$;

revoke all on function correct_invoice_receipt(uuid, numeric, text, text) from public, anon;
grant execute on function correct_invoice_receipt(uuid, numeric, text, text) to authenticated;

-- ── ١٢أ) غلافُ 0113 — الإنتاجُ لم يأخذه (مقيسٌ ١٦/١٠ ببصمة الجسم بلا تعليقات ولا مسافات) ──
-- correct_invoice_receipt بالإنتاج = 0113 حرفاً، أمّا edit_invoice_lines فما زال جسمَ 0110 كاملاً ولا
-- edit_invoice_lines_unguarded أصلاً: كتلةُ الإعادة والغلاف بـ0113 لم تجرِ هناك. فلو أنشأنا _unguarded وحدها
-- بقي الإنتاجُ ينادي جسمَ 0110 القديم — كلُّ تعديل بنودٍ يُرجع الدينَ المخصوم (total = subtotal − discount).
-- فكتلةُ 0113 هنا **حرفاً** قبل إعادة التعريف: حيث جرت (الحزمة) لا تفعل شيئاً، وحيث لم تجرِ تُعيد التسمية
-- وتنشئ الغلاف (المديرُ وحده، والمفتاحُ يكفي) — وهو حارسُ 0113 الذي ظُنّ نازلاً.
do $$
begin
  if to_regprocedure('edit_invoice_lines_unguarded(uuid, jsonb, text)') is null
     and to_regprocedure('edit_invoice_lines(uuid, jsonb, text)') is not null then
    execute 'alter function edit_invoice_lines(uuid, jsonb, text) rename to edit_invoice_lines_unguarded';
    execute 'revoke all on function edit_invoice_lines_unguarded(uuid, jsonb, text) from public, anon, authenticated';
  end if;

  if to_regprocedure('edit_invoice_lines_unguarded(uuid, jsonb, text)') is not null then
    execute $fn$
      create or replace function edit_invoice_lines(p_invoice uuid, p_lines jsonb, p_note text default null)
      returns invoices language plpgsql security definer set search_path = public as $body$
      begin
        if auth_clinic() is null then raise exception 'not authenticated'; end if;
        -- الحارس الغائب سابقاً: تعديل بنود فاتورة يغيّر الإيراد والمخزون معاً.
        if auth_role() <> 'manager' then raise exception 'not allowed'; end if;
        return edit_invoice_lines_unguarded(p_invoice, p_lines, p_note);
      end $body$;
    $fn$;
    execute 'revoke all on function edit_invoice_lines(uuid, jsonb, text) from public, anon';
    execute 'grant execute on function edit_invoice_lines(uuid, jsonb, text) to authenticated';
  end if;
end $$;

-- ── ١٢) تعديلُ البنود — جسمُ 0110 (اسمُه منذ 0113 edit_invoice_lines_unguarded) حرفاً ────
-- إلا: `for update` على الفاتورة، وقاعدةُ استهلاك الخصم (forgiven) قبل الحساب.
-- الغلافُ edit_invoice_lines (0113: المديرُ وحده) من الكتلة أعلاه؛ وهذه بلا منحٍ لأحد كما تركتها 0113.
create or replace function edit_invoice_lines_unguarded(p_invoice uuid, p_lines jsonb, p_note text default null)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  v_old_total numeric(12,2);
  v_old_count int;
  v_new_count int;
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_paid     numeric(12,2);
  v_discount numeric(12,2);
  v_total    numeric(12,2);
  v_stamp    text;
  r          record;
  l          record;
  v_stock_qty numeric(12,3);
  v_from_stock numeric(12,3);
  v_from_pool  numeric(12,3);
  v_avail      numeric(12,3);
  v_prod       products;
  v_pool       numeric(12,3);
  v_forg_old   numeric;
  v_forg_new   numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  -- 0241: قفلُ الصفّ — التعديلُ يكتب forgiven من قراءته، فلا يسبقه خصمٌ من جهازٍ آخر.
  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty invoice';
  end if;

  v_old_total := coalesce(v_invoice.total, 0);
  select count(*) into v_old_count from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ١) العكس الكامل: نفس تقسيم refund_invoice بالضبط ────────────────────
  for r in
    select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
      from invoice_items ii
      left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
     where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
  loop
    if r.product_id is not null then
      if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
        update company_sections set pooled_stock = pooled_stock + r.pooled_qty
          where id = r.section_id and clinic_id = v_clinic;
        update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
          where id = r.product_id and clinic_id = v_clinic;
      else
        update products set stock = stock + coalesce(r.stock_qty, r.qty)
          where id = r.product_id and clinic_id = v_clinic;
      end if;
    end if;
  end loop;

  delete from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ٢) إعادة الخصم: المعروف أولاً ثم مخزون القسم (نفس retail_checkout) ──
  for l in
    select
      nullif(e->>'product_id','')::uuid            as product_id,
      coalesce(e->>'name','')                      as name,
      nullif(e->>'barcode','')                     as barcode,
      coalesce((e->>'qty')::numeric, 0)            as qty,
      coalesce((e->>'unit_price')::numeric, 0)     as unit_price,
      coalesce((e->>'unit_cost')::numeric, 0)      as unit_cost,
      nullif(e->>'unit_label','')                  as unit_label,
      coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in
    from jsonb_array_elements(p_lines) as e
  loop
    if l.qty <= 0 then continue; end if;
    -- كمية المخزون المسحوبة: تُمرَّر صراحةً لبيع الأجزاء، وإلا فهي الكمية نفسها.
    v_stock_qty := round(coalesce(l.stock_qty_in, l.qty), 3);
    v_from_pool := 0;
    v_from_stock := 0;

    if l.product_id is not null then
      select * into v_prod from products where id = l.product_id and clinic_id = v_clinic;
      if found then
        v_pool := 0;
        if v_prod.section_id is not null then
          select coalesce(pooled_stock, 0) into v_pool from company_sections
            where id = v_prod.section_id and clinic_id = v_clinic;
        end if;
        v_avail := round(coalesce(v_prod.stock, 0) + coalesce(v_pool, 0), 3);
        if v_stock_qty > v_avail + 0.0005 then
          raise exception 'not enough stock: %', l.name;
        end if;
        v_from_stock := least(v_stock_qty, greatest(coalesce(v_prod.stock, 0), 0));
        if v_from_stock > 0 then
          update products set stock = round(stock - v_from_stock, 3)
            where id = l.product_id and clinic_id = v_clinic;
        end if;
        if v_stock_qty - v_from_stock > 0 and v_prod.section_id is not null then
          v_from_pool := least(v_stock_qty - v_from_stock, greatest(coalesce(v_pool, 0), 0));
          if v_from_pool > 0 then
            update company_sections set pooled_stock = round(pooled_stock - v_from_pool, 3)
              where id = v_prod.section_id and clinic_id = v_clinic;
          end if;
        end if;
      end if;
    end if;

    insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    values (v_clinic, p_invoice, l.product_id, l.name, l.barcode, l.qty, l.unit_price, l.unit_cost,
            round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label);

    v_subtotal := v_subtotal + round(l.qty * l.unit_price, 2);
    v_cost     := v_cost     + round(l.qty * l.unit_cost, 2);
    v_items    := v_items    + l.qty;
    v_new_count := coalesce(v_new_count, 0) + 1;
  end loop;

  if coalesce(v_new_count, 0) = 0 then raise exception 'empty invoice'; end if;

  -- ─── ٣) إعادة الحساب: المدفوع لا يُمَس، وأجرة التوصيل سطرٌ محسوب أصلاً ───
  v_discount := greatest(coalesce(v_invoice.discount, 0), 0);
  v_total    := greatest(round(v_subtotal - v_discount, 2), 0);
  v_paid     := coalesce(v_invoice.amount_paid, 0);
  -- 0241: الخصمُ على الدين لا يبقى أكبرَ من الدين الذي كان يُسقطه — ما نقص يُستهلك.
  v_forg_old := coalesce(v_invoice.forgiven, 0);
  v_forg_new := least(v_forg_old, greatest(0, v_total - v_paid));
  v_total    := round(v_total - v_forg_new, 2);

  -- ختم سبب التعديل داخل الفاتورة: يبقى ملازماً لها ويظهر بطباعتها. سجل
  -- الحركات يلتقط الفعل نفسه آلياً عبر محفّزات 0018/0044.
  v_stamp := 'تعديل ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || v_old_count || '→' || v_new_count || ' سطر · '
          || to_char(v_old_total, 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  if v_forg_new < v_forg_old then
    perform invoice_forgiveness_consume(v_clinic, p_invoice, v_forg_old - v_forg_new, 'تعديل', v_old_total, v_paid);
  end if;

  update invoices set
    subtotal   = v_subtotal,
    total      = v_total,
    forgiven   = v_forg_new,
    cost_total = v_cost,
    profit     = round(v_total - v_cost, 2),
    item_count = v_items,
    notes      = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_invoice;

  -- مستحقّ السواق يتبع الإجمالي الجديد فوراً — لا يجمع مبلغاً قديماً أبداً.
  update delivery_orders
     set cod_amount = greatest(round(v_total - v_paid, 2), 0)
   where invoice_id = p_invoice and clinic_id = v_clinic
     and status in ('preparing', 'out');

  return v_invoice;
end $$;
revoke all on function edit_invoice_lines_unguarded(uuid, jsonb, text) from public, anon, authenticated;

-- ── ١٣) المرتجعُ الجزئيّ — نسخةُ 0121 حرفاً إلا قاعدةَ استهلاك الخصم ────────────────
create or replace function return_invoice_items(
  p_invoice uuid, p_returns jsonb, p_method text default null, p_note text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_inv      invoices;
  v_method   text;
  v_details  jsonb;
  v_pos      numeric(14,2);
  v_back     numeric(14,2);
  v_paid     numeric(14,2);
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_count    int := 0;
  v_total    numeric(12,2);
  v_stamp    text;
  v_full     boolean := true;
  r          record;
  it         invoice_items;
  v_ret      numeric(12,3);
  v_per      numeric(14,6);
  v_ret_stock numeric(12,3);
  v_ret_pool  numeric(12,3);
  v_section  uuid;
  v_forg_old numeric;
  v_forg_new numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_returns is null or jsonb_typeof(p_returns) <> 'array' or jsonb_array_length(p_returns) = 0 then
    raise exception 'nothing to return';
  end if;

  -- هل هذا إرجاعٌ كامل؟ كل سطرٍ بالفاتورة مطلوبٌ إرجاع كامل كميته.
  for it in select * from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    select coalesce((e->>'qty')::numeric, 0) into v_ret
      from jsonb_array_elements(p_returns) e where e->>'item_id' = it.id::text limit 1;
    if coalesce(v_ret, 0) + 0.0005 < it.qty then v_full := false; end if;
  end loop;

  if v_full then
    -- إرجاع كامل ⇒ نفس دلالات refund_invoice: استرجاع مخزون كل الأسطر
    -- وقلب الحالة، والأسطر تبقى كما طُبعت للزبون.
    for r in
      select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
        from invoice_items ii
        left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
       where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
    loop
      if r.product_id is not null then
        if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
          update company_sections set pooled_stock = pooled_stock + r.pooled_qty
            where id = r.section_id and clinic_id = v_clinic;
          update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
            where id = r.product_id and clinic_id = v_clinic;
        else
          update products set stock = stock + coalesce(r.stock_qty, r.qty)
            where id = r.product_id and clinic_id = v_clinic;
        end if;
      end if;
    end loop;
    update invoices set status = 'refunded', refunded_at = now()
      where id = p_invoice and clinic_id = v_clinic
      returning * into v_inv;
    return v_inv;
  end if;

  -- ── إرجاع جزئي: سطراً سطراً ────────────────────────────────────────────
  for r in
    select
      nullif(e->>'item_id','')::uuid       as item_id,
      coalesce((e->>'qty')::numeric, 0)    as ret_qty
    from jsonb_array_elements(p_returns) e
  loop
    if r.item_id is null or r.ret_qty <= 0 then continue; end if;
    select * into it from invoice_items
      where id = r.item_id and invoice_id = p_invoice and clinic_id = v_clinic for update;
    if not found then raise exception 'item not found'; end if;
    v_ret := least(round(r.ret_qty, 3), it.qty);

    -- المخزون: بنفس نسب البيع — المسحوب لكل وحدة، وحصة القسم نسبية.
    if it.product_id is not null then
      v_per := case when it.qty > 0 and it.stock_qty is not null then it.stock_qty / it.qty else 1 end;
      v_ret_stock := round(v_ret * v_per, 3);
      v_ret_pool  := round(coalesce(it.pooled_qty, 0) * v_ret / it.qty, 3);
      if v_ret_pool > 0 then
        select p.section_id into v_section from products p
          where p.id = it.product_id and p.clinic_id = v_clinic;
        if v_section is not null then
          update company_sections set pooled_stock = pooled_stock + v_ret_pool
            where id = v_section and clinic_id = v_clinic;
        else
          v_ret_pool := 0; -- المنتج فقد قسمه — الكل لرصيده
        end if;
      end if;
      update products set stock = round(stock + (v_ret_stock - v_ret_pool), 3)
        where id = it.product_id and clinic_id = v_clinic;
    end if;

    if v_ret + 0.0005 >= it.qty then
      delete from invoice_items where id = it.id and clinic_id = v_clinic;
    else
      update invoice_items set
        qty        = round(it.qty - v_ret, 3),
        line_total = round((it.qty - v_ret) * it.unit_price, 2),
        stock_qty  = case when it.stock_qty is null then null else round(it.stock_qty - v_ret_stock, 3) end,
        pooled_qty = case when it.pooled_qty is null then null else round(it.pooled_qty - v_ret_pool, 3) end
      where id = it.id and clinic_id = v_clinic;
    end if;
  end loop;

  -- إعادة الحساب من الأسطر الباقية — الخصم الثابت يبقى كما هو.
  select coalesce(sum(line_total), 0), coalesce(sum(round(qty * unit_cost, 2)), 0),
         coalesce(sum(qty), 0), count(*)
    into v_subtotal, v_cost, v_items, v_count
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;
  if v_count = 0 then raise exception 'nothing left'; end if; -- الكامل عولج فوق

  v_total := greatest(round(v_subtotal - greatest(coalesce(v_inv.discount, 0), 0), 2), 0);
  v_paid  := coalesce(v_inv.amount_paid, v_inv.total);
  -- 0241: الخصمُ على الدين يُستهلك قبل أيّ نقد — لا يخرج نقدٌ إلا حين ينزل المجموعُ تحت المدفوع.
  v_forg_old := coalesce(v_inv.forgiven, 0);
  v_forg_new := least(v_forg_old, greatest(0, v_total - v_paid));
  v_total    := round(v_total - v_forg_new, 2);
  -- النقد الخارج فعلاً: ما دفعه فوق الإجمالي الجديد. بيعة آجلة ⇒ الدين ينقص وحده.
  v_back  := greatest(round(v_paid - v_total, 2), 0);

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_back > 0 then
    v_method := coalesce(
      nullif(btrim(p_method), ''),
      (select e->>'method' from jsonb_array_elements(v_details) e
        where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
      v_inv.payment_method, 'cash');
    -- تثبيت الساق الضمنية قبل السالب — نفس درس 0113 حرفياً.
    select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
      from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
    if v_pos < v_paid then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_paid - v_pos,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || (jsonb_build_object(
        'method', v_method, 'amount', -v_back,
        'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      || jsonb_build_object('note', left('مرتجع' || case when coalesce(btrim(p_note), '') <> '' then ': ' || btrim(p_note) else '' end, 120)));
  end if;

  v_stamp := 'مرتجع ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || to_char(coalesce(v_inv.total, 0), 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when v_back > 0 then ' · أُعيد نقداً ' || to_char(v_back, 'FM999,999,990.99') else '' end
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  if v_forg_new < v_forg_old then
    perform invoice_forgiveness_consume(v_clinic, p_invoice, v_forg_old - v_forg_new, 'مرتجع', v_inv.total, v_paid);
  end if;

  update invoices set
    subtotal        = v_subtotal,
    total           = v_total,
    forgiven        = v_forg_new,
    cost_total      = v_cost,
    profit          = round(v_total - v_cost, 2),
    item_count      = v_items,
    amount_paid     = greatest(round(v_paid - v_back, 2), 0),
    payment_details = v_details,
    payment_method  = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                 where (e->>'amount')::numeric > 0
                                 order by (e->>'amount')::numeric desc limit 1),
                               v_inv.payment_method),
    notes           = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_inv;

  return v_inv;
end $$;
revoke all on function return_invoice_items(uuid, jsonb, text, text) from public, anon;
grant execute on function return_invoice_items(uuid, jsonb, text, text) to authenticated;

-- ── ١٤) التدقيق: نوعُ السطر (نسخةُ 0233 حرفاً إلا فرعَ invoice_forgiveness؛ مرآتُه activityKinds.ts) ──
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
    when p_entity = 'invoice_forgiveness' then case
      when p_action = 'UPDATE' then 'debt_forgive_void'
      -- الاستهلاكُ أثرُ مرتجعٍ أو تعديلٍ (وقد يكتبه الاستقبال) — ليس خصماً أعطاه أحد.
      when coalesce(p_details->>'kind', '') = 'consumed' then 'sale_edit'
      else 'debt_forgive' end
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

-- ── ١٥) الكنس: الدفترُ بطبقة المال (سنة) — نسخُ 0226 حرفاً إلا 'invoice_forgiveness' بالقوائم الثلاث ──
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
    'price_changes', 'invoice_forgiveness'
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
                               'delivery_orders','store_orders','price_changes',
                               'invoice_forgiveness'])
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
                           'price_changes','invoice_forgiveness']))
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
