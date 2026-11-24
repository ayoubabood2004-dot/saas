-- ============================================================================
-- ٠٢٨٧ — المخزنُ لا يُحسب مرّتين ولا يتغيّر بلا أثر: ضغطةٌ مكرّرةٌ بعد جوابٍ ضائع تُرجع أوّلَها،
--        وكلُّ تغييرِ رصيدٍ يُكتب بدفترٍ دائم يسمّي مَن غيّره وبأيّ عملية
--
-- ── الجذر (تدقيقٌ بعشرة مدقّقين على الأجسام الحيّة، ٢٢/١١ — مقيسٌ على PGlite بنصوص 0217/0253/0276) ──
-- ١) **ثلاثُ كتاباتٍ للرصيد بلا مرجع محاولة**: حفظُ فاتورة الشراء (record_purchase/record_purchase_fx، 0276)،
--    و«أضف دفعة» (lot_add، 0217)، والمرتجعُ الجزئيّ على فاتورة (return_invoice_items، 0253). البيعةُ (0135)
--    والراجعُ (0136) والتلفُ (0254) والدينُ القديم (0273) كلُّها بمرجع؛ هذه الثلاث لا. فالخادمُ يُثبت والجوابُ
--    يضيع (نتُّ الموبايل)، والشاشةُ تقول «ما وصلنا للسيرفر — حاول من جديد» وتُبقي النموذجَ كما هو، والضغطةُ
--    الثانية تكتب ثانيةً: ٤٠ علبة ⇒ ٨٠ ودَينُ الشركة مضاعف، ودفعةٌ مرّتين، ومرتجعٌ يرجّع القطعةَ والنقدَ مرّتين.
--    مقيس: الرصيد ٧ ⇒ ٨ ⇒ ٩ والمدفوع ١٥٬٠٠٠ ⇒ ١٠٬٠٠٠ ⇒ ٥٬٠٠٠ لقطعةٍ واحدةٍ رجعت.
-- ٢) **«ليش رصيدها هيچي؟» بلا جوابٍ صادق**: لا شيءَ يسجّل لحظةَ الكتابة لماذا تغيّر الرصيد. حركاتُ المادّة
--    (product_movements، 0252) تخمّن السببَ بعد ذلك بمطابقة فاتورةٍ «أُنشئت خلال ٤ ثوانٍ» — فالمرتجعُ والترجيعُ
--    وتعديلُ الفاتورة وحذفُها والدمجُ والطيُّ والجردُ كلُّها «تعديل يدوي أو جرد»، والبيعةُ نفسُها تصير «تعديلاً»
--    حين يُحذف سطرُها لاحقاً. وسجلُّ التدقيق للمدير وحده (0018)، فالطبيبُ الذي يعدّ ويعدّل يقرأ «ماكو حركات»،
--    ويُكنس بعد سنة بلا رصيدٍ مُرحَّل.
--
-- ── ما تضيفه ───────────────────────────────────────────────────────────
-- أ) ثلاثةُ أبوابٍ «مرّةً واحدة» **تلفّ الدوالَّ الحيّة ولا تمسّ أجسامَها** (فلا حارسَ انجرافٍ ولا نصَّ يُنسخ):
--    purchase_record_once / lot_add_once / return_invoice_items_once. المرجعُ يُحجز بـrpc_refs (0136) **قبل
--    أيّ كتابة** بكتلةٍ بمعالج: نسخةٌ متزامنةٌ سبقتنا ⇒ خرقُ الفهرس الفريد ⇒ يتراجع ما كتبناه ونُرجع نتيجتَها.
--    والنتيجةُ تحمل **بصمةَ الطلب** (md5 للسطور والبيانات): إعادةٌ بنفس الطلب تُرجع الأوّلَ كما هو، وطلبٌ
--    تغيّر بعد محاولةٍ ثبتت يُرفض باسمه (`*_ref_changed`، والتلميحُ يقول أين يجده) — لا يُرجع الأوّلَ صامتاً
--    كأنّ التعديلَ انحفظ (ما وقع للبيعة: الإعادةُ بسلّةٍ عُدّلت ترجع الفاتورةَ الأولى ويُطبع غيرُها).
--    والدوالُّ القديمة باقيةٌ كما هي للواجهة المنشورة: القاعدةُ قبل الواجهة.
-- ب) دفترُ الرصيد `stock_ledger`: محفّزٌ **بعد** كلّ إدراجٍ وتعديلٍ وحذفٍ على products (والحوضِ على
--    company_sections) يكتب الفرقَ (قبل ← بعد) ومَن ولحظةَ المعاملة **ومَن كتبه**: اسمُ الدالّة الخارجية من
--    مكدّس النداء (`get diagnostics … = pg_context`) — retail_checkout، refund_invoice، stock_count_decide… —
--    و«direct» حين لا دالّةَ فوقه (نموذجُ المادّة يكتب الجدولَ مباشرةً). فلا دالّةَ قائمةٌ تُعاد كتابتُها لتُسمّى،
--    وكاتبٌ جديدٌ بعد اليوم يُسمّى بنفسه. والمحفّزُ لا يمنع الكتابةَ الأصلية أبداً (معالجٌ يبلع خطأه، كـaudit_change)
--    — والانحرافُ يقوله verify_stock_ledger (رصيدُ نقطة البدء + مجموعُ الفروق = الرصيدُ الآن) بدل أن يُخفى.
--    ونقطةُ بدءٍ (checkpoint) لكلّ مادّةٍ وحوضٍ قائم ساعةَ التطبيق: الدفترُ يُطابَق منها، والشاشةُ تقول من متى يبدأ.
--    ولا كنسَ: صفٌّ صغيرٌ لكلّ تغيير، والتاريخُ كلُّه يبقى.
--    والقراءةُ لمن يدير المخزن (المديرُ، أو staff_can('manageInventory') — الطبيبُ افتراضاً)، والمصوّرُ مسيَّج،
--    والكتابةُ من المحفّز وحده (لا سياسةَ كتابة، والمنحةُ الافتراضيةُ مسحوبة).
-- ج) stock_ledger_of(product, before, limit): الصفوفُ بنوعها محسوباً من الكاتب (بيع/إرجاع/ترجيع/تعديل فاتورة/
--    حذف فاتورة/شراء/تعديل شراء/دفعة/جرد/تلف/مستهلكات/دمج/استرجاع/حذف/طيّ/يدوي/حقل) ومرجعِ المستند من صفوف
--    التدقيق بنفس لحظة المعاملة (now() واحدٌ للمعاملة كلّها — مطابقةٌ تامّة لا نافذةُ ٤ ثوانٍ)، وصفحاتٌ بالمؤشّر.
--
-- ── المشغّل (0151) ────────────────────────────────────────────────────────
-- الفاعلُ auth.uid() كـaudit_change تماماً. والقارئ لا يسمّي إلا كادرَ العيادة وصاحبَها؛ غيرُهما يُقرأ «مدير العيادة»
-- بالاتفاق — فلا أثرَ يسمّي المشغّل عند العيادة.
--
-- تُطبَّق بعد 0286 (rpc_refs من 0136، وstaff_can من 0222 إن وُجدت)، **وقبل الواجهة** — والواجهةُ تعمل قبلها
-- (غيابُ الأبواب PGRST202 ⇒ الدوالُّ القديمة، وغيابُ الدفتر ⇒ الحركاتُ القديمة).
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ (جدولٌ وفهارسُ بـif not exists، ونقطةُ البدء لما ليس له صفّ، ودوالُّ ومحفّزان يُعادان).
-- تراجع (لا شيءَ قائمٌ يتغيّر بها):
--   drop trigger if exists products_stock_ledger on public.products;
--   drop trigger if exists company_sections_stock_ledger on public.company_sections;
--   drop table if exists public.stock_ledger;   -- أوّلاً: سياستُه تنادي stock_ledger_can_read فتمنع حذفَ الدالّة قبله
--   drop function if exists public.stock_ledger_of(uuid, bigint, int), public.verify_stock_ledger(),
--     public.stock_ledger_can_read(), public._stock_ledger_capture(), public._stock_ledger_chain(text), public._stock_ledger_source(text),
--     public._stock_ledger_kind(text, text, text, numeric),
--     public.purchase_record_once(text, jsonb, jsonb, boolean), public.lot_add_once(text, uuid, numeric, date, text),
--     public.return_invoice_items_once(text, uuid, jsonb, text, text);
-- ============================================================================

set lock_timeout = '5s';

-- ── أ) الأبوابُ «مرّةً واحدة» ─────────────────────────────────────────────

-- حفظُ فاتورة شراءٍ جديدة. `p_fx`: من باب العملتين (record_purchase_fx، 0274) أو الدينار (record_purchase).
create or replace function public.purchase_record_once(
  p_ref text, p_lines jsonb, p_meta jsonb default '{}'::jsonb, p_fx boolean default false)
returns purchases
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_ref, '')), '');
  v_fp     text := md5(coalesce(p_lines::text, '') || '|' || coalesce(p_meta::text, '') || '|' || coalesce(p_fx, false)::text);
  v_out    jsonb;
  v_p      purchases;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_ref is null or length(v_ref) > 120 then
    raise exception 'client_ref_required' using hint = 'محاولةُ الحفظ بلا مرجع — حدّث الصفحة وأعد الحفظ.';
  end if;
  -- إعادةٌ لمحاولةٍ ثبتت: نفسُ الطلب يُرجع فاتورتَه، وطلبٌ تغيّر يُرفض باسمه.
  select r.result into v_out from rpc_refs r
   where r.clinic_id = v_clinic and r.fn = 'record_purchase' and r.client_ref = v_ref;
  if v_out is null then
    begin
      -- حجزُ المرجع **قبل** أيّ رصيدٍ أو دَين: نسخةٌ متزامنةٌ تنتظره هنا ثمّ ترى نتيجتَه.
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'record_purchase', v_ref);
      if coalesce(p_fx, false) then
        v_p := record_purchase_fx(p_lines, p_meta);
      else
        v_p := record_purchase(p_lines, p_meta);
      end if;
      update rpc_refs set result = jsonb_build_object('id', v_p.id, 'fp', v_fp)
       where clinic_id = v_clinic and fn = 'record_purchase' and client_ref = v_ref;
      return v_p;
    exception when unique_violation then
      -- لا نبلع كلَّ خرقٍ فريد: إن لم يكن مرجعُنا (باركودٌ مكرّرٌ داخل الشراء مثلاً) فالخطأُ حقيقيّ ويُرفع.
      select r.result into v_out from rpc_refs r
       where r.clinic_id = v_clinic and r.fn = 'record_purchase' and r.client_ref = v_ref;
      if v_out is null then raise; end if;
    end;
  end if;
  if v_out->>'fp' is distinct from v_fp then
    raise exception 'purchase_ref_changed'
      using detail = coalesce(v_out->>'id', ''),
            hint = 'الفاتورة انحفظت بأوّل ضغطة قبل تعديلك — افتحها من «سجل المشتريات» وعدّلها من هناك.';
  end if;
  select * into v_p from purchases where id = (v_out->>'id')::uuid and clinic_id = v_clinic;
  if not found then raise exception 'purchase_ref_gone' using hint = 'الفاتورة الأولى ما عادت موجودة — حدّث الصفحة.'; end if;
  return v_p;
end $$;
revoke all on function public.purchase_record_once(text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.purchase_record_once(text, jsonb, jsonb, boolean) to authenticated;
comment on function public.purchase_record_once(text, jsonb, jsonb, boolean) is
  'حفظُ فاتورة شراءٍ مرّةً واحدة (0287): مرجعُ المحاولة بـrpc_refs قبل أيّ كتابة، والإعادةُ بنفس الطلب تُرجع الأولى، وبطلبٍ تغيّر purchase_ref_changed. يلفّ record_purchase / record_purchase_fx ولا يمسّ جسميهما.';

-- «أضف دفعة» (بضاعةٌ بلا فاتورة، 0217) مرّةً واحدة.
create or replace function public.lot_add_once(
  p_ref text, p_product uuid, p_qty numeric, p_expiry date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_ref, '')), '');
  v_fp     text := md5(coalesce(p_product::text, '') || '|' || coalesce(p_qty::text, '') || '|'
                       || coalesce(p_expiry::text, '') || '|' || coalesce(p_note, ''));
  v_out    jsonb;
  v_id     uuid;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_ref is null or length(v_ref) > 120 then
    raise exception 'client_ref_required' using hint = 'محاولةُ الحفظ بلا مرجع — حدّث الصفحة وأعد الحفظ.';
  end if;
  select r.result into v_out from rpc_refs r
   where r.clinic_id = v_clinic and r.fn = 'lot_add' and r.client_ref = v_ref;
  if v_out is null then
    begin
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'lot_add', v_ref);
      v_id := lot_add(p_product, p_qty, p_expiry, p_note);
      update rpc_refs set result = jsonb_build_object('id', v_id, 'fp', v_fp)
       where clinic_id = v_clinic and fn = 'lot_add' and client_ref = v_ref;
      return v_id;
    exception when unique_violation then
      select r.result into v_out from rpc_refs r
       where r.clinic_id = v_clinic and r.fn = 'lot_add' and r.client_ref = v_ref;
      if v_out is null then raise; end if;
    end;
  end if;
  if v_out->>'fp' is distinct from v_fp then
    raise exception 'lot_ref_changed' using hint = 'الدفعة انحفظت بأوّل ضغطة — شوفها بقائمة الدفعات قبل ما تضيف ثانية.';
  end if;
  return (v_out->>'id')::uuid;
end $$;
revoke all on function public.lot_add_once(text, uuid, numeric, date, text) from public, anon;
grant execute on function public.lot_add_once(text, uuid, numeric, date, text) to authenticated;
comment on function public.lot_add_once(text, uuid, numeric, date, text) is
  '«أضف دفعة» مرّةً واحدة (0287): يلفّ lot_add بمرجع محاولةٍ في rpc_refs — الإعادةُ بنفس الطلب تُرجع الدفعةَ الأولى ولا تزيد الرصيد.';

-- المرتجعُ على فاتورة مرّةً واحدة.
create or replace function public.return_invoice_items_once(
  p_ref text, p_invoice uuid, p_returns jsonb, p_method text default null, p_note text default null)
returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_ref, '')), '');
  v_fp     text := md5(coalesce(p_invoice::text, '') || '|' || coalesce(p_returns::text, '') || '|'
                       || coalesce(p_method, '') || '|' || coalesce(p_note, ''));
  v_out    jsonb;
  v_inv    invoices;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_ref is null or length(v_ref) > 120 then
    raise exception 'client_ref_required' using hint = 'محاولةُ الإرجاع بلا مرجع — حدّث الصفحة وأعد المحاولة.';
  end if;
  select r.result into v_out from rpc_refs r
   where r.clinic_id = v_clinic and r.fn = 'return_invoice_items' and r.client_ref = v_ref;
  if v_out is null then
    begin
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'return_invoice_items', v_ref);
      v_inv := return_invoice_items(p_invoice, p_returns, p_method, p_note);
      update rpc_refs set result = jsonb_build_object('id', v_inv.id, 'fp', v_fp)
       where clinic_id = v_clinic and fn = 'return_invoice_items' and client_ref = v_ref;
      return v_inv;
    exception when unique_violation then
      select r.result into v_out from rpc_refs r
       where r.clinic_id = v_clinic and r.fn = 'return_invoice_items' and r.client_ref = v_ref;
      if v_out is null then raise; end if;
    end;
  end if;
  if v_out->>'fp' is distinct from v_fp then
    raise exception 'return_ref_changed' using hint = 'المرتجع انحفظ بأوّل ضغطة — افتح الفاتورة من جديد وشوف شنو رجع قبل ما ترجّع ثانية.';
  end if;
  select * into v_inv from invoices where id = (v_out->>'id')::uuid and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  return v_inv;
end $$;
revoke all on function public.return_invoice_items_once(text, uuid, jsonb, text, text) from public, anon;
grant execute on function public.return_invoice_items_once(text, uuid, jsonb, text, text) to authenticated;
comment on function public.return_invoice_items_once(text, uuid, jsonb, text, text) is
  'المرتجعُ على فاتورة مرّةً واحدة (0287): يلفّ return_invoice_items بمرجع محاولةٍ في rpc_refs — الإعادةُ بعد جوابٍ ضائع لا ترجّع القطعةَ ولا النقدَ مرّتين.';

-- ── ب) دفترُ الرصيد ──────────────────────────────────────────────────────

create table if not exists public.stock_ledger (
  id          bigint generated always as identity primary key,
  clinic_id   uuid not null,
  -- مادّةٌ أو حوضُ صنف — واحدٌ منهما. بلا مفتاحٍ أجنبيّ: الصفُّ يبقى بعد حذف المادّة ودمجها (تاريخٌ لا يُمحى).
  product_id  uuid,
  section_id  uuid,
  at          timestamptz not null default now(),        -- لحظةُ المعاملة: نفسُها بكلّ صفوف التدقيق التي كتبتها
  op          text not null check (op in ('insert', 'update', 'delete', 'checkpoint')),
  delta       numeric not null,
  qty_before  numeric,
  qty_after   numeric,
  source      text not null,                              -- الدالّةُ الخارجية التي كتبت، أو direct / checkpoint
  chain       text,                                       -- مكدّسُ الدوالّ من الخارج للداخل (ماذا مرّ تحتها)
  actor       uuid,
  txid        bigint not null default txid_current(),
  constraint stock_ledger_one_target check ((product_id is null) <> (section_id is null))
);
create index if not exists stock_ledger_product_idx on public.stock_ledger (product_id, id desc) where product_id is not null;
create index if not exists stock_ledger_section_idx on public.stock_ledger (section_id, id desc) where section_id is not null;
create index if not exists stock_ledger_clinic_at_idx on public.stock_ledger (clinic_id, at desc);

comment on table public.stock_ledger is
  'دفترُ الرصيد (0287): صفٌّ لكلّ تغييرٍ بـproducts.stock وcompany_sections.pooled_stock — الفرقُ وقبله وبعده ومَن وأيُّ دالّةٍ كتبته (من مكدّس النداء). يكتبه المحفّزُ وحده، ولا يُكنس.';

-- مَن يقرأ الدفتر: من يدير المخزن (المديرُ، أو صلاحيةُ إدارة المخزون بالدور الأساس كما تحسبها staff_can).
-- staff_can بـexecute لا مباشرةً: سياسةٌ تنادي دالّةً تمنع حذفَها (تراجعُ 0222 — درسُ 0285).
create or replace function public.stock_ledger_can_read()
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  if auth.uid() is null or auth_clinic() is null then return false; end if;
  if coalesce(auth_role(), '') = 'manager' then return true; end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v using 'manageInventory';
    return coalesce(v, false);
  end if;
  return coalesce(auth_role(), '') = 'veterinarian';
end $$;
revoke all on function public.stock_ledger_can_read() from public, anon;
grant execute on function public.stock_ledger_can_read() to authenticated;

alter table public.stock_ledger enable row level security;
drop policy if exists stock_ledger_read on public.stock_ledger;
create policy stock_ledger_read on public.stock_ledger
  for select to authenticated
  using (clinic_id = (select auth_clinic()) and (select public.stock_ledger_can_read()));
-- المنحةُ الافتراضيةُ بسوبابيس تعطي الكتابةَ لكلّ جدولٍ جديد: تُسحب، فالكتابةُ من المحفّز وحده (درسُ 0136).
revoke insert, update, delete, truncate on public.stock_ledger from anon, authenticated;
revoke all on public.stock_ledger from anon;
grant select on public.stock_ledger to authenticated;
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('stock_ledger');
  end if;
end $$;

-- مكدّسُ النداء ⇒ أسماءُ الدوالّ من الخارج للداخل. سطرُ «PL/pgSQL function X(…) line N» وسطرُ «SQL function "X"»؛
-- والمحفّزُ نفسُه وكتلُ DO خارجه.
create or replace function public._stock_ledger_chain(p_ctx text)
returns text
language sql immutable set search_path = public as $$
  select nullif(left(string_agg(x.fn, '>' order by x.ord desc), 400), '')
    from (select r.ord, coalesce(r.m[1], r.m[2]) as fn
            from regexp_matches(coalesce(p_ctx, ''),
                   'function (?:public\.)?"?([A-Za-z0-9_]+)"?(?:\(| line)|SQL function "([A-Za-z0-9_]+)"', 'g')
                 with ordinality as r(m, ord)) x
   where x.fn not in ('_stock_ledger_capture', 'inline_code_block')
$$;
revoke all on function public._stock_ledger_chain(text) from public, anon, authenticated;

-- الكاتبُ: **أوّلُ اسمٍ معروف** بالمكدّس من الخارج — لا الخارجيُّ أيّاً كان: نداءٌ يمرّ من دالّةٍ لافّة (غلافٌ جديد،
-- أو مساعدُ فحص) كان يُسمّى باسمها فيصير البيعُ «عملية بالنظام» (أمسكه فحصُ الحزمة بمساعدٍ لافّ). وما لا يُعرف فيه
-- شيء: الخارجيُّ، وإلا direct (كتابةٌ مباشرة على الجدول).
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
        'refund_invoice', 'delete_invoice', 'edit_invoice_lines', 'edit_invoice_lines_unguarded'])
      order by u.ord limit 1),
    nullif(split_part(coalesce(p_chain, ''), '>', 1), ''),
    'direct')
$$;
revoke all on function public._stock_ledger_source(text) from public, anon, authenticated;

create or replace function public._stock_ledger_capture()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ctx     text;
  v_chain   text;
  v_before  numeric;
  v_after   numeric;
  v_clinic  uuid;
  v_product uuid;
  v_section uuid;
begin
  -- الفحوصُ الرخيصة **قبل** المعالج: قراءةُ old/new لا ترمي، وتعديلٌ لا يمسّ الرصيد (سعرٌ، اسمٌ، رفعُ أسعارٍ على مئات
  -- المواد) يرجع بلا نقطةِ حفظ — المعالجُ يفتح نقطةً لكلّ صفٍّ يدخله، فلا يدخله إلا تغييرُ رصيدٍ حقيقيّ.
  if tg_table_name = 'products' then
    if tg_op = 'INSERT' then
      v_after := new.stock; v_clinic := new.clinic_id; v_product := new.id;
    elsif tg_op = 'UPDATE' then
      if new.stock is not distinct from old.stock then return null; end if;
      v_before := old.stock; v_after := new.stock; v_clinic := new.clinic_id; v_product := new.id;
    else
      v_before := old.stock; v_clinic := old.clinic_id; v_product := old.id;
    end if;
  else
    if tg_op = 'INSERT' then
      v_after := new.pooled_stock; v_clinic := new.clinic_id; v_section := new.id;
    elsif tg_op = 'UPDATE' then
      if new.pooled_stock is not distinct from old.pooled_stock then return null; end if;
      v_before := old.pooled_stock; v_after := new.pooled_stock; v_clinic := new.clinic_id; v_section := new.id;
    else
      v_before := old.pooled_stock; v_clinic := old.clinic_id; v_section := old.id;
    end if;
  end if;
  -- لا فرقَ ولا صفّ: مادّةٌ تولد بصفر أو تُحذف بصفر ليست حركةَ رصيد.
  if coalesce(v_after, 0) = coalesce(v_before, 0) then return null; end if;
  begin
    get diagnostics v_ctx = pg_context;
    v_chain := public._stock_ledger_chain(v_ctx);
    insert into public.stock_ledger (clinic_id, product_id, section_id, op, delta, qty_before, qty_after, source, chain, actor)
    values (v_clinic, v_product, v_section, lower(tg_op), coalesce(v_after, 0) - coalesce(v_before, 0), v_before, v_after,
            public._stock_ledger_source(v_chain), v_chain, auth.uid());
  exception
    /* قفلٌ متشابكٌ أو تسلسلٌ فاشل ليسا «خطأ الدفتر» بل خطأُ المعاملة: يُرفعان فتفشل الكتابةُ كلُّها وتُعاد — بلعُهما كان يُثبت
     * تغييرَ الرصيد بلا صفّه (إعادةُ تطبيق 0287 على قاعدةٍ حيّة تقفل الدفترَ قبل products، والكاتبُ يقفلهما بالعكس — مراجعة ٢٢/١١). */
    when deadlock_detected or serialization_failure then raise;
    when others then null; -- الدفترُ لا يمنع كتابةَ الرصيد نفسَها أبداً — والانحرافُ يقوله verify_stock_ledger
  end;
  return null;
end $$;
revoke all on function public._stock_ledger_capture() from public, anon, authenticated;

drop trigger if exists products_stock_ledger on public.products;
create trigger products_stock_ledger after insert or update or delete on public.products
  for each row execute function public._stock_ledger_capture();
drop trigger if exists company_sections_stock_ledger on public.company_sections;
create trigger company_sections_stock_ledger after insert or update or delete on public.company_sections
  for each row execute function public._stock_ledger_capture();

-- نقطةُ البدء: رصيدُ كلّ مادّةٍ وحوضٍ ساعةَ التطبيق، لما ليس له صفٌّ بعد (فالإعادةُ لا تضيف شيئاً).
insert into public.stock_ledger (clinic_id, product_id, op, delta, qty_before, qty_after, source)
select p.clinic_id, p.id, 'checkpoint', 0, p.stock, p.stock, 'checkpoint'
  from public.products p
 where not exists (select 1 from public.stock_ledger l where l.product_id = p.id);
insert into public.stock_ledger (clinic_id, section_id, op, delta, qty_before, qty_after, source)
select s.clinic_id, s.id, 'checkpoint', 0, s.pooled_stock, s.pooled_stock, 'checkpoint'
  from public.company_sections s
 where coalesce(s.pooled_stock, 0) <> 0
   and not exists (select 1 from public.stock_ledger l where l.section_id = s.id);

-- نوعُ الحركة من كاتبها — الدالّةُ الخارجيةُ تقول العملية، والمكدّسُ تحتها يقول المستهلكات (0252) داخل البيعة.
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

-- ── ج) القراءة ────────────────────────────────────────────────────────────
-- صفوفُ مادّةٍ واحدة، الأحدثُ أوّلاً، بمؤشّر (p_before = أصغرُ معرّفٍ رُئي). definer بفحصه هو: الاسمُ من staff
-- ومرجعُ المستند من صفوف التدقيق بنفس لحظة المعاملة — والسجلُّ للمدير وحده، والدفترُ لمن يدير المخزن.
create or replace function public.stock_ledger_of(p_product uuid, p_before bigint default null, p_limit int default 100)
returns table (
  id         bigint,
  at         timestamptz,
  kind       text,
  source     text,
  delta      numeric,
  qty_before numeric,
  qty_after  numeric,
  actor_name text,
  actor_kind text,     -- staff | owner | manager (كادرٌ لا يُعرف — المشغّلُ بالاتفاق) | system (بلا فاعل)
  ref_kind   text,     -- invoice | purchase | count | null
  ref_id     uuid
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
begin
  if v_clinic is null or not public.stock_ledger_can_read() then
    raise exception 'stock_ledger_forbidden' using errcode = '42501',
      hint = 'حركاتُ المادّة لمن يدير المخزن — اطلبها من مدير العيادة.';
  end if;
  return query
  select l.id, l.at,
         case when public._stock_ledger_kind(l.op, l.source, l.chain, l.delta) = 'count'
                   and exists (select 1 from stock_counts c
                                where c.clinic_id = v_clinic and c.product_id = l.product_id
                                  and c.decided_at = l.at and c.source = 'waste')
              then 'waste'
              else public._stock_ledger_kind(l.op, l.source, l.chain, l.delta) end,
         l.source, l.delta, l.qty_before, l.qty_after,
         coalesce(st.name, ''),
         case when l.actor is null then 'system'
              when st.name is not null then 'staff'
              when l.actor = v_clinic then 'owner'
              else 'manager' end,
         doc.kind, doc.id
    from stock_ledger l
    left join lateral (select s.name from staff s
                        where s.user_id = l.actor and s.clinic_id = v_clinic limit 1) st on true
    left join lateral (
      select d.kind, d.id from (
        select case b.entity when 'invoices' then 'invoice' when 'purchases' then 'purchase' else 'count' end as kind,
               case when b.entity_id ~ '^[0-9a-fA-F-]{36}$' then b.entity_id::uuid end as id,
               case b.entity when 'invoices' then 1 when 'purchases' then 2 else 3 end as pri, b.id as aid
          from audit_log b
         where b.clinic_id = v_clinic and b.created_at = l.at
           and b.entity in ('invoices', 'purchases', 'stock_counts')
           and l.op <> 'checkpoint'
      ) d where d.id is not null order by d.pri, d.aid limit 1
    ) doc on true
   where l.clinic_id = v_clinic and l.product_id = p_product
     and (p_before is null or l.id < p_before)
   order by l.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke all on function public.stock_ledger_of(uuid, bigint, int) from public, anon;
grant execute on function public.stock_ledger_of(uuid, bigint, int) to authenticated;
comment on function public.stock_ledger_of(uuid, bigint, int) is
  'حركاتُ مادّةٍ من دفتر الرصيد (0287): النوعُ من الدالّة التي كتبت (لا تخمين)، والمرجعُ من صفوف التدقيق بنفس لحظة المعاملة، وصفحاتٌ بالمعرّف. لمن يدير المخزن.';

-- الدفترُ يطابق الرصيد؟ نقطةُ البدء + مجموعُ الفروق بعدها = الرصيدُ الآن، لكلّ مادّةٍ وحوضٍ بعيادة المنادي.
-- أيُّ صفٍّ هنا = كتابةٌ مرّت بلا محفّز (معطَّلٍ أو بلع خطأه) — يُقال ولا يُخفى.
create or replace function public.verify_stock_ledger()
returns table (product_id uuid, section_id uuid, ledger_qty numeric, live_qty numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null or not public.stock_ledger_can_read() then
    raise exception 'stock_ledger_forbidden' using errcode = '42501';
  end if;
  -- مرورٌ واحد: نقطةُ البدء تعطي أساسَها (رصيدُها، وفرقُها صفر)، وكلُّ صفٍّ أوّلَ شرعيّ غيرُها يبدأ من صفر (إدراجٌ بعد التطبيق،
  -- أو تغييرٌ من صفر) — فأساسُه صفر، وصفٌّ أوّلُ قبله رصيدٌ = رصيدٌ ظهر بلا دفتر (كان يُطوى بالأساس فلا يُرى — مراجعة ٢٢/١١).
  return query
  with t as (
    select l.product_id, l.section_id, l.delta,
           case when row_number() over (partition by l.product_id, l.section_id order by l.id) = 1 and l.op = 'checkpoint'
                then coalesce(l.qty_after, 0) else 0 end as base
      from stock_ledger l
     where l.clinic_id = v_clinic
  ), agg as (
    select t.product_id, t.section_id, sum(t.base) + sum(t.delta) as q
      from t group by t.product_id, t.section_id
  ), live as (
    select a.product_id, a.section_id, a.q,
           case when a.product_id is not null then p.stock else cs.pooled_stock end as cur
      from agg a
      left join products p on p.id = a.product_id
      left join company_sections cs on cs.id = a.section_id
  )
  select live.product_id, live.section_id, live.q, live.cur
    from live
   where live.q is distinct from coalesce(live.cur, 0)
  union all
  -- وما له رصيدٌ ولا صفَّ له أصلاً (وُلد أو تغيّر والمحفّزُ معطَّلٌ أو بلع خطأه) — كان خارجَ المقارنة كلِّها.
  select p.id, null::uuid, 0::numeric, p.stock
    from products p
   where p.clinic_id = v_clinic and coalesce(p.stock, 0) <> 0
     and not exists (select 1 from stock_ledger l where l.product_id = p.id)
  union all
  select null::uuid, cs.id, 0::numeric, cs.pooled_stock
    from company_sections cs
   where cs.clinic_id = v_clinic and coalesce(cs.pooled_stock, 0) <> 0
     and not exists (select 1 from stock_ledger l where l.section_id = cs.id);
end $$;
revoke all on function public.verify_stock_ledger() from public, anon;
grant execute on function public.verify_stock_ledger() to authenticated;
comment on function public.verify_stock_ledger() is
  'تطابقُ دفتر الرصيد (0287): ما يرجع صفٌّ إلا لمادّةٍ أو حوضٍ رصيدُه غيرُ (نقطة البدء + مجموع الفروق) — كتابةٌ مرّت بلا المحفّز.';
