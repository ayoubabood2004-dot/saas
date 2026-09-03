-- ============================================================================
-- ٠١٥٠ — تبويباتُ المبيعات تقرأ صفحةً وتبحث بالخادم (المرحلة ٢ من خطة التقارير)
--
-- ── المقيس ───────────────────────────────────────────────────────────────
-- تبويباتُ الفواتير والمرتجع والديون والتوصيل كانت تجيب **كلَّ** فواتير العيادة
-- مرّةً واحدة وتبحث فيها بالمتصفّح — آخرُ نداءٍ «أعمى» بقي بعد 0149. أكبرُ عيادة
-- ~١٬٥٠٠ فاتورة اليوم فلا تُحسّ، وهي التي تصير ٤٥ ميغابايت بعد سنتين.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- «الأخيرُ يُعرض والقديمُ يُبحث»: ٥٠ فاتورةً بالمرّة بمؤشّرٍ (تاريخ + معرّف) لا برقم
-- صفحة — فاتورةٌ تدخل أثناء التصفّح لا تزيح القائمة ولا تكرّر ولا تُقفَز — والبحثُ
-- بالاسم أو الهاتف أو رقم الفاتورة أو البائع يمرّ على **كل التاريخ** بالخادم.
-- الديونُ المفتوحة لها دالّتها (بالفهرس الجزئي من 0149) مهما كان عمرها.
--
-- ── التطبيع كما بالواجهة ─────────────────────────────────────────────────
-- `search_norm` مرآةُ `searchable()`: همزات/ة/ى/ؤ مطوية، بلا تشكيل ولا مسافات،
-- والأرقامُ الشرقية لاتينية. الطرفان يمرّان منها — تطبيعُ طرفٍ واحد يفشل بصمت.
-- لا تغييرَ على أي جدول بيانات؛ دوالُّ قراءةٍ فقط، بصلاحية المُستدعي.
-- ============================================================================

-- خيارُ العيادة: القائمة بصفحات (افتراضياً نعم؛ يُطفأ أسبوعَ المراقبة عند الحاجة).
alter table public.clinic_prefs add column if not exists invoices_paged boolean not null default true;

-- مرآةُ searchable() = normalizeAr(normalizeDigits()): **الأرقامُ أوّلاً** ثم التشكيل —
-- لأن مدى التشكيل (U+064B–U+0670) يضمّ الأرقامَ الشرقية (U+0660–U+0669)؛ عكسُ الترتيب
-- يمحو «٧٧٠٩٩» كلَّه فيصير البحثُ فارغاً ويطابق كلَّ فاتورة (أمسكه فحصُ التطابق).
-- ثم نفسُ طيّ الهمزات والتاء والياء والمسافات. يفحصها report-fixture/parity
-- بدالّة الواجهة الأصلية لا بتقريب.
create or replace function search_norm(t text) returns text
language sql immutable set search_path = public as $$
  select translate(
           lower(regexp_replace(
             translate(coalesce(t, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,'),
             '[ً-ٰـ\s]', '', 'g')),
           'أإآٱةىئؤ', 'ااااهييو')
$$;

/** هل تطابق الفاتورةُ نصَّ البحث وفلترَ الحالة؟ (اسم، هاتف، رقم فاتورة، بائع) */
create or replace function invoice_matches(i invoices, p_q text, p_status text)
returns boolean
language sql stable security invoker set search_path = public as $$
  select (coalesce(p_status, 'all') = 'all' or coalesce(i.status, 'paid') = p_status)
     and (
       coalesce(search_norm(p_q), '') = ''
       or search_norm(i.customer_name) like '%' || search_norm(p_q) || '%'
       or (coalesce(phone_digits(p_q), '') <> '' and coalesce(phone_digits(i.customer_phone), '') like '%' || phone_digits(p_q) || '%')
       -- رقمُ الفاتورة كما تعرضه الواجهة: INV- + آخر ستّة أحرف من المعرّف
       or (coalesce(regexp_replace(btrim(p_q), '^(?:inv|INV|Inv)-?', ''), '') <> ''
           and upper(right(replace(i.id::text, '-', ''), 6)) like '%' || upper(regexp_replace(btrim(p_q), '^(?:inv|INV|Inv)-?', '')) || '%')
       or exists (select 1 from staff s where s.id = i.staff_id and search_norm(s.name) like '%' || search_norm(p_q) || '%')
     )
$$;

/** صفحةٌ من الفواتير: الأحدث فالأقدم، بمؤشّرٍ (created_at, id) لا برقم صفحة.
 *  p_since يحدّ النافذة من الأسفل: الواجهةُ تعرض آخرَ ١٥ يوماً و«المزيد» ينزل
 *  ١٥ يوماً أخرى [since, before)، وداخلَ النافذة المزدحمة يكمل المؤشّرُ نفسه. */
create or replace function search_invoices(p_q text default null, p_status text default 'all',
                                           p_before timestamptz default null, p_before_id uuid default null,
                                           p_limit int default 50, p_since timestamptz default null)
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.*
    from invoices i
   where i.clinic_id = auth_clinic()
     and invoice_matches(i, p_q, p_status)
     and (p_since is null or i.created_at >= p_since)
     and (p_before is null
          or (i.created_at, i.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
   order by i.created_at desc, i.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function search_invoices(text, text, timestamptz, uuid, int, timestamptz) from public, anon;
grant execute on function search_invoices(text, text, timestamptz, uuid, int, timestamptz) to authenticated;

/** كم فاتورةً تطابق — يُعرض «معروض ٥٠ من ١٬٥٠٨» فلا تُصدَّق قائمةٌ ناقصة. */
create or replace function count_invoices_matching(p_q text default null, p_status text default 'all')
returns bigint
language sql stable security invoker set search_path = public as $$
  select count(*) from invoices i where i.clinic_id = auth_clinic() and invoice_matches(i, p_q, p_status)
$$;
revoke all on function count_invoices_matching(text, text) from public, anon;
grant execute on function count_invoices_matching(text, text) to authenticated;

/** الديونُ المفتوحة كلُّها مهما كان عمرها — الدينُ لا يتقيّد بمدّة. */
create or replace function open_debts()
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.* from invoices i
   where i.clinic_id = auth_clinic()
     and coalesce(i.status, 'paid') <> 'refunded'
     and coalesce(i.amount_paid, i.total) < i.total - 0.01
   order by i.created_at desc
$$;
revoke all on function open_debts() from public, anon;
grant execute on function open_debts() to authenticated;
