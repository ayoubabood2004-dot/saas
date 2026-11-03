-- ============================================================================
-- ٠٢٥٢ — مستهلكاتُ الخدمات: الخدمةُ تخصم موادَّها وتحسب كلفتَها بالخادم، وكلُّ عكسٍ يردّها بالضبط
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- • الخدمةُ سطرٌ بلا مادّة (product_id فارغ) وكلفتُه رقمٌ يرسله الجهاز (`cost` من 0120): الكفوفُ
--   والسرنجاتُ والمحاليلُ تنصرف كلَّ يوم ولا تنزل من الرصيد — الجردُ يسمّيها «عجزاً»، والربحُ يُحسب
--   كأنها مجانية. والخادمُ لا يعرف أيَّ خدمةٍ بيعت أصلاً: سطرُ الفاتورة بلا service_id، والسلّةُ
--   تُسقط serviceId قبل الإرسال.
-- • والرصيدُ ثلاثُ مراتب: ١٠ مل من مكعّبٍ ٢٠ لتراً = ٠٫٠٠٠٥ عبوة — تقريبُ كلِّ بيعةٍ وحدها يمحوها
--   أو يضاعفها، والعكسُ يردّ غيرَ ما أخذ.
-- • وكلُّ عكسٍ بطريقه: الترجيعُ والحذفُ (0066)، والمرتجعُ وتعديلُ البنود (0241)، والكتابةُ المباشرة
--   للمدير (0051) — ونسيانُ طريقٍ واحد يترك موادَّ مخصومةً لبيعةٍ لم تعد، أو مردودةً لبيعةٍ قائمة.
--
-- ── القرار (المالك، ٣١/١٠) ────────────────────────────────────────────────
-- • لكلّ خدمةٍ وصفة: كميةٌ لكلّ **مرّةٍ واحدة** من الخدمة، بوحدة المخزون أو بوحدتها الصغيرة (مل،
--   زوج، سرنجة). يكتبها المدير (أو من له manageSettings)، والمصوّرُ لا.
-- • الجهازُ يرسل service_id (وتعديلَ الحالة إن وُجد)، والخادمُ يقرّر الوصفةَ والكلفةَ والرصيد.
--   السطرُ «مخطَّط» إن كان لخدمته وصفة أو عليه تعديلٌ يختلف عنها؛ وغيرُه كما هو اليوم حرفاً (كلفةُ
--   الجهاز، بلا خصم، وservice_id يُحفظ) — فلا يتغيّر ربحُ خدمةٍ بلا مواد. وكلفةُ المخطَّط = الكلفةُ
--   الثابتة من الكتالوج + كلفةُ موادّه، تُحسب هنا لا بالجهاز.
-- • تعديلُ مستهلكات حالةٍ واحدة للطبيب أو المدير وحدهما (consumables_case_role).
-- • الرصيدُ لا يُمنع ولا يُحصر: ينزل سالباً، والعجزُ يُكتب على الحدث (shortfall) ويُقال بصوت.
--   منعُ بيعةٍ لعمليةٍ انسوت يدفع الكادرَ للبيع خارج النظام، والحصرُ يحسب كلفةَ ما بالدفتر وحده.
-- • ترجيعُ خدمةٍ انسوت عكسٌ تامّ: الموادُّ ترجع للمخزن، والشاشةُ تعرض سندَ هدرٍ (0254) يوافق عليه
--   المدير — لا خسارةَ تلقائية (refund_invoice بلا فحص دور، والخسارةُ تُكتب بموافقة: قرارُ ٢٦/٩).
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- * invoice_items.service_id — مرجعٌ ليّن: لمعرفة الخدمة ولربط سطور التعديل، بلا مفتاح ولا فهرس.
-- * clinic_service_recipe_items — الوصفة. product_id ليّن: يعيش المحذوفات والاسترجاعَ (نفسُ المعرّف)
--   ويُنقل عند الدمج.
-- * invoice_consumption — دفترُ أحداثٍ للإلحاق وحده (use/restore)، ولكلّ مدخلِ وصفةٍ بسطرٍ «مواصفةٌ»
--   بقيمٍ مجمَّدة (spec_id). كلُّ حركةٍ **إلى هدف**: الحيُّ = Σ أحداث المواصفة، والحركةُ = الهدفُ ناقصَ
--   الحيّ — فالتكرارُ لا يفعل شيئاً.
-- * invoice_consumption_skips — ما لم يُخصم (محذوفة، حوض، حقل، بلا وحدةٍ صغيرة، خدمةٌ مجهولة، جهازٌ
--   قديم، تعديلٌ صفّر الموادَّ override_none) ومَن كتبه. جدولٌ منفصل عمداً: لا مزامنةَ ولا ربطَ ولا فحصَ يحرّكه — فلا
--   يُخصم المتخطّى لاحقاً بقيمةٍ صفر. وقاعدةٌ نزلت عليها نسخةٌ أولى (قيدان بلا override_none) يُعاد قيداها.
-- * product_stock_carry — المرحَّل لكلّ مادّة: المقدارُ الدقيق (٩ مراتب) يصل الرصيدَ (٣) عبره،
--   والمكتوبُ = تقريبُ المجموع التراكميّ للأعلى عند النصف — فالإرجاعُ ثم الإعادةُ صفرٌ صافٍ.
--   والثابتُ لكلّ صفّ: Σ qty − Σ posted + ext_in − ext_out = carry (verify_consumption).
-- * _stock_post — الكاتبُ الوحيد لرصيد الاستهلاك والهدر: يقفل صفَّ المادّة **أوّلاً** (أو صفَّها
--   بالمحذوفات، ويتبع merged_into تحت القفل) ثم المرحَّل. ومادّةٌ غائبةٌ كلّياً لا يُكتب لها شيء.
-- * _invoice_lock_products — كلُّ طريقٍ يحرّك رصيدَ فاتورةٍ يقفل منتجاتِها بالمعرّف قبل أوّل كتابة،
--   بترتيب البيعة نفسه — ترتيبان متعاكسان على نفس الصفوف انسداد.
-- * البيعة (retail_checkout، نصُّ 0242 حرفاً وفوقه أسطرٌ معلَّمة): التخطيطُ بعد فحص الإعادة وكتلة
--   التأريخ وقبل أيّ كتابة — فكلُّ رفضٍ بلا أثر، والإعادةُ لا تخطّط ولا تقفل ولا ترفض. وكلفةُ المخطَّط
--   داخل cost_total لحظةَ إدراج الفاتورة، والاستهلاكُ بعد آخر سطر، داخل كتلة الخرق الفريد.
-- * أربعةُ محفّزات تزامن كلَّ سطرٍ مع هدفه: حذفُ سطر، تغيّرُ كميته، دخولُ الفاتورة «مرجَّعة» أو
--   خروجُها منها، ودمجُ مادّةٍ بأخرى (الوصفةُ والدفترُ والمتخطّى تنتقل، والمرحَّلُ يُطوى بالأصل). ومحفّزُ
--   الترجيع يقفل موادَّ الفاتورة بالمعرّف **ولو بلا دفتر**: refund_invoice يرجّعها بعده بترتيب السطور، وفاتورةُ
--   موادَّ بلا خدمة كانت الطريقَ الوحيد الذي يأخذ أوّلَ قفلٍ بغير ترتيب البيعة (انسدادٌ معها).
-- * التعديل (edit_invoice_lines_unguarded، نصُّ 0241 حرفاً وفوقه أسطرٌ معلَّمة) يحذف السطورَ ويعيدها
--   بمعرّفاتٍ جديدة — فيُربط كلُّ سطرِ خدمةٍ بسابقه بمعرّفه، بعد حلقة الإدراج كلِّها: سطرٌ لم يتغيّر
--   صافيه صفر، والمرفوعُ يستهلك الفرقَ بالقيم المجمَّدة. والربطُ نقلٌ لا بيعةٌ ثانية: عجزُه ما زاده التعديلُ وحده
--   (قيسَ: تعديلٌ بلا تغيير ورصيدٌ أنزلته فاتورةٌ أخرى كان يكتب عجزاً لم يقع). والكميةُ تُقرَّب لثلاث منازل عند
--   القراءة، وسطرُ المادّة يُخصم كالبيعة (0253) بلا «not enough stock».
-- * الوصفةُ: service_recipe_get / service_recipe_set / service_recipe_summary، وسطرُ تدقيقٍ **واحد**
--   على clinic_services لكلّ حفظ (لا audit_all على الجداول: الإدراجُ يحفظ `qty` وحده).
-- * القراءات: invoice_consumption_get (ولكلّ مواصفةٍ أحداثُها بدفعاتها moves/at_us، ولكلّ فاتورةٍ now_us، ولكلّ
--   مواصفةٍ ومادّةٍ سالبة by_weight)، report_consumables (والعجزُ مرّةً لكلّ فاتورةٍ ومادّة بآخر حالها — التعديلُ نقلٌ لا
--   يمسّه، والمرتجعُ يردّ آخرَ ما صُرف بلا رصيد — وby_owner لتعديلٍ كتبه صاحبُ العيادة)، وproduct_movements (نصُّ 0242
--   حرفاً وفوقه «مستهلكات» و«مستهلكات — إرجاع» بنافذةٍ يخدمها الفهرس). كلُّها ترمي عند أيّ فشل ولا ترجع نصفَ قائمة،
--   والأسماءُ فيها بترتيب البايت (collate "C") ثمّ المعرّف كالمرآة التجريبية.
-- * service_id بثلاث حالات: غائبٌ (جهازٌ قديم) واسمُه اسمُ خدمةٍ لها وصفة ⇒ old_device؛ null صريح ⇒ سطرٌ معروفٌ ليس
--   خدمة (بلا تخطٍّ)؛ معرّف ⇒ الخدمة. والتعديلُ لا يصنّف بالاسم أصلاً: يرث خدمةَ السطر بمعرّفه، وتخطّياتُه تاريخٌ بالربط.
-- * verify_consumption() وverify_consumption_wiring(): أدواتُ تشغيلٍ لا يناديها المسجَّل.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- القاعدةُ الحيّة لا تُقاس من هنا، فالهجرةُ تقيسها بنفسها: `_drift_assert` لكلّ دالّةٍ تُعاد كتابتُها
-- — جسمُها الحيُّ ببصمة مصدرها بالمستودع، أو بعلامتنا (إعادةُ هذه الهجرة)، وإلا رفضٌ قبل أيّ بناء
-- (درسُ 0241: نسخةٌ حيّةٌ غيرُ نسخة المستودع دُهست بصمت). والبصماتُ يفحصها
-- `scripts/redefine-fingerprint.mjs`، والعلاماتُ تفحصها verify_consumption_wiring() على القاعدة.
-- **والبصمةُ بصمةُ الشِفرة لا النصّ** (`_drift_code`: بلا تعليقٍ خارج النصوص، وبلا مسافات): أوّلُ تطبيقٍ على الإنتاج
-- (٣/١١) رُفض على ١٢ دالّةً شِفرتُها نصُّ المستودع حرفاً وتعليقاتُها وحدها غائبة — الهجراتُ القديمة طُبّقت بأدواتٍ تحذف
-- التعليق. فرقُ تعليقٍ لا يغيّر سلوكاً فلا يرفض؛ وفرقُ شِفرةٍ يرفض كما كان.
--
-- تُطبَّق بعد 0251 **وقبل الواجهة** (مظلمةً: لا وصفةَ بعد، والجهازُ القديم لا يرسل service_id).
-- وقبل 0253/0254/0255 (حارسُها و_invoice_lock_products و_stock_post منها). إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- أعِد تطبيق 0252–0255 بعد أي إعادةٍ لـ0066/0171/0184/0197/0203/0214/0216/0217/0241/0242.
--
-- تراجع:
--   • الواجهةُ وحدها: آمنٌ دائماً — القديمةُ لا ترسل service_id، والمحفّزاتُ تعكس ما خُصم سابقاً.
--   • ليّن: supabase/tests/rollback_0252_soft.sql — يعيد retail_checkout بنصّ 0242 حرفاً، ويُبقي
--     التعديلَ بربطه والمحفّزاتِ والجداول. ولا يُعاد التعديلُ لنصّ 0241 ما دام بالدفتر صفّ: تعديلٌ بلا
--     ربطٍ يردّ الموادَّ وكلفتُها باقيةٌ بـunit_cost المعاد إرساله.
--   • كامل، حين `select count(*) from invoice_consumption` = 0 وحده:
--       drop trigger if exists invoice_items_consumption_del on public.invoice_items;
--       drop trigger if exists invoice_items_consumption_qty on public.invoice_items;
--       drop trigger if exists invoices_consumption_status on public.invoices;
--       drop trigger if exists products_trash_consumption on public.products_trash;
--     ثم أعد retail_checkout (0242) وedit_invoice_lines_unguarded (0241) وproduct_movements (0242)
--     حرفاً بصلاحياتها هنا، ثم drop للدوالّ الجديدة والجداولِ الأربعة. وinvoice_items.service_id يبقى
--     (لا يقرؤه شيءٌ قديم).
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) حارسُ الانحراف — قبل أيّ بناء ───────────────────────────────────────
-- الشِفرةُ بلا تعليقاتها ولا مسافاتها — مرآتُها codeOf بـscripts/redefine-fingerprint.mjs حرفاً بحرف (والحزمةُ تطابقهما على
-- كلّ دالّةٍ بالقاعدة). التعليقُ `--` إلى آخر السطر و`/* … */` متداخلاً، **خارج** '…' و"…" (بتضعيف الحرف) و$وسم$…$وسم$ —
-- فـformat('-- +%s') شِفرةٌ. ما لا يُغلق: النصُّ يبقى إلى الآخر، والتعليقُ يُحذف إلى الآخر.
create or replace function public._drift_code(p_src text) returns text
language plpgsql immutable strict set search_path = public as $$
declare
  a text[] := regexp_split_to_array(p_src, '');
  n int := coalesce(array_length(a, 1), 0);
  o text[] := '{}';
  i int := 1; j int; d int; c text; tag text;
begin
  while i <= n loop
    c := a[i];
    if c = '''' or c = '"' then
      j := i + 1;
      while j <= n loop
        if a[j] = c then
          if j < n and a[j + 1] = c then j := j + 2; continue; end if;
          exit;
        end if;
        j := j + 1;
      end loop;
      o := o || a[i:least(j, n)];
      i := j + 1;
    elsif c = '-' and i < n and a[i + 1] = '-' then
      while i <= n and a[i] <> E'\n' loop i := i + 1; end loop;
    elsif c = '/' and i < n and a[i + 1] = '*' then
      d := 1; j := i + 2;
      while j <= n and d > 0 loop
        if a[j] = '/' and j < n and a[j + 1] = '*' then d := d + 1; j := j + 2;
        elsif a[j] = '*' and j < n and a[j + 1] = '/' then d := d - 1; j := j + 2;
        else j := j + 1; end if;
      end loop;
      i := j;
    elsif c = '$' then
      tag := (regexp_match(array_to_string(a[i:least(i + 79, n)], ''), '^(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)'))[1];
      if tag is null then o := o || c; i := i + 1; continue; end if;
      j := strpos(array_to_string(a[i + length(tag):n], ''), tag);
      if j = 0 then o := o || a[i:n]; i := n + 1;
      else o := o || a[i:i + length(tag) + j - 2 + length(tag)]; i := i + length(tag) + j - 1 + length(tag);
      end if;
    else
      o := o || c; i := i + 1;
    end if;
  end loop;
  return regexp_replace(array_to_string(o, ''), '[ \t\n\r\f\v]', '', 'g');
end $$;
revoke all on function public._drift_code(text) from public, anon, authenticated;

create or replace function public._drift_assert(p_sig text, p_source_md5 text, p_marker text) returns void
language plpgsql set search_path = public as $$
declare v_oid oid := to_regprocedure(p_sig); v_src text; v_md5 text;
begin
  if v_oid is null then
    raise exception 'drift_missing' using hint = format('الدالة %s مو موجودة بالقاعدة — طبّق الهجرات بالترتيب', p_sig);
  end if;
  select prosrc into v_src from pg_proc where oid = v_oid;
  v_md5 := md5(public._drift_code(v_src));
  if v_md5 = p_source_md5 or position(p_marker in v_src) > 0 then return; end if;   -- the repo's source text, or already ours
  raise exception 'drift_body' using hint = format(
    'نسخة %s بالقاعدة غير اللي بالمستودع (البصمة %s) — لا تطبّق هالهجرة، بلّغ المطوّر حتى يقارن', p_sig, v_md5);
end $$;
revoke all on function public._drift_assert(text, text, text) from public, anon, authenticated;

-- البيعةُ والحركاتُ من 0242، والتعديلُ من 0241 — بصمةُ كلٍّ منها بلا مسافات.
-- ووجودُ التعديل نفسِه حارسٌ هنا (drift_missing): الإنتاجُ ظلّ ينادي جسمَ 0110 القديم لأن
-- edit_invoice_lines_unguarded لم يكن موجوداً (0241)، ولو أُنشئت هنا من الصفر ما ناداها أحد.
select public._drift_assert('public.retail_checkout(jsonb,jsonb)', 'a42ab7e636aec79c4182f8accb8d397e', '-- +0252');
select public._drift_assert('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', 'a62560983d277860b21fcf2294a8eac1', '-- +0252');
select public._drift_assert('public.product_movements(uuid,integer)', '07304f5a1c11830632c22aa88ec35ce4', '-- +0252');

-- ── ١) الجداول ───────────────────────────────────────────────────────────
-- الخدمةُ التي بيع بها السطر: لمعرفة وصفته، ولربط سطرِ التعديل بسابقه. ليّنٌ عمداً (لا مفتاح):
-- حذفُ خدمةٍ لا يمسّ فاتورةً قديمة، ولا فهرس — لا قراءةَ تبحث به.
alter table public.invoice_items add column if not exists service_id uuid;
comment on column public.invoice_items.service_id is
  'الخدمةُ التي بيع بها سطرُ الخدمة (0252) — مرجعٌ ليّن بلا مفتاح. فارغٌ لسطر المادّة وللجهاز القديم ولخدمةٍ لا يعرفها الخادم.';

create table if not exists public.clinic_service_recipe_items (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  service_id   uuid not null references public.clinic_services(id) on delete cascade,
  product_id   uuid not null,          -- ليّن: يعيش المحذوفات والاسترجاع (نفسُ المعرّف)، ويُنقل عند الدمج
  product_name text not null,          -- لقطةُ الاسم: تُعرض والمادّةُ بالمحذوفات
  qty          numeric(24,3) not null check (qty > 0 and qty <= 1000000),   -- لكلّ مرّةٍ واحدة من الخدمة
  unit         text not null default 'stock' check (unit in ('stock','sub')),
  position     int  not null default 0 check (position between 0 and 99),
  updated_at   timestamptz not null default now(),
  updated_by   uuid                    -- فارغٌ لمشغّل المنصّة (0151)
);
create index if not exists clinic_service_recipe_items_clinic_idx  on public.clinic_service_recipe_items (clinic_id);
create index if not exists clinic_service_recipe_items_service_idx on public.clinic_service_recipe_items (service_id, position);
create index if not exists clinic_service_recipe_items_product_idx on public.clinic_service_recipe_items (product_id);
-- بلا فريدٍ على (service_id, product_id) عمداً: نقلُ الدمج قد يترك سطرين لمادّةٍ واحدة (يُخصمان معاً)؛
-- والحفظُ يرفض التكرارَ بمدخله، والمحرّرُ يجمع السطرين عند الفتح.
comment on table public.clinic_service_recipe_items is
  'وصفةُ الخدمة (0252): ما تخصمه كلُّ مرّةٍ واحدة منها. تُقرأ للعيادة وتُكتب من service_recipe_set وحدها (definer).';

create table if not exists public.invoice_consumption (            -- للإلحاق وحده: المواصفاتُ وحركاتُها
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  invoice_id   uuid not null,          -- ليّن: التاريخُ يعيش حذفَ الفاتورة
  item_id      uuid not null,          -- ليّن: سطرُ المواصفة (التعديلُ يجدّد معرّفاتِ السطور)
  spec_id      uuid not null,          -- مدخلُ وصفةٍ (أو تعديلٍ) واحد بسطرٍ واحد، وكلُّ أحداثه تحمله
  from_item    uuid,                   -- الربط: السطرُ الذي نُقلت منه المواصفة
  service_id   uuid,
  product_id   uuid not null,          -- ليّن، ويُنقل عند الدمج: الصفُّ الذي كتب له _stock_post فعلاً
  product_name text not null,
  unit         text not null check (unit in ('stock','sub')),
  unit_label   text,
  per_qty      numeric(24,3) not null check (per_qty > 0),     -- لكلّ وحدةٍ من السطر، بـunit
  per_div      numeric(24,3) not null check (per_div > 0),     -- units_per_box للصغيرة، و1 للعلبة
  unit_cost    numeric(24,6) not null check (unit_cost >= 0),  -- stock_unit_cost لوحدة المخزون، مجمَّدة
  per_value    numeric(24,2) not null check (per_value >= 0),  -- مالُ وحدةٍ واحدة من السطر، مجمَّد
  line_qty     numeric(24,3) not null check (line_qty >= 0),   -- كميةُ السطر التي وصلها هذا الحدث (الهدف)
  qty          numeric(24,9) not null,                         -- بوحدة المخزون بالضبط: + صرف، − إرجاع
  posted       numeric(24,3) not null default 0,               -- ما كتبه الحدثُ بالرصيد (عبر المرحَّل)
  value        numeric(24,2) not null,                         -- المال، بإشارته
  shortfall    numeric(24,3) not null default 0 check (shortfall >= 0),
  kind         text not null check (kind in ('use','restore')),
  note         text check (note in ('in_trash','product_gone')),
  source       text not null check (source in ('recipe','override','relink')),
  created_at   timestamptz not null default now(),
  created_by   uuid,                                           -- فارغٌ لمشغّل المنصّة (0151)
  constraint invoice_consumption_shape check (
       (kind = 'use'     and qty >= 0 and value >= 0 and (qty > 0 or value > 0))
    or (kind = 'restore' and qty <= 0 and value <= 0 and (qty < 0 or value < 0) and shortfall = 0))
);
create index if not exists invoice_consumption_clinic_idx  on public.invoice_consumption (clinic_id, created_at);
create index if not exists invoice_consumption_item_idx    on public.invoice_consumption (item_id, spec_id);
create index if not exists invoice_consumption_invoice_idx on public.invoice_consumption (invoice_id);
create index if not exists invoice_consumption_product_idx on public.invoice_consumption (product_id, created_at);
comment on table public.invoice_consumption is
  'دفترُ مستهلكات الخدمات (0252): أحداثُ صرفٍ وإرجاع لكلّ مواصفة، للإلحاق وحده. تُقرأ للعيادة وتُكتب من دوالّ المالك وحدها.';

create table if not exists public.invoice_consumption_skips (      -- للإخبار: لا مزامنةَ ولا ربطَ ولا فحصَ يحرّكه
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  invoice_id   uuid not null,          -- ليّن
  item_id      uuid not null,          -- ليّن
  service_id   uuid,                   -- ما حمله السطر (فارغٌ للجهاز القديم)
  line_name    text not null,
  product_id   uuid,                   -- فارغٌ للملاحظات الثلاث على مستوى السطر
  product_name text,
  qty          numeric(24,3),          -- كما أُدخلت، لكلّ مرّةٍ واحدة
  unit         text check (unit in ('stock','sub')),
  line_qty     numeric(24,3) not null check (line_qty >= 0),
  -- override_none: الطبيبُ صفّر مستهلكاتِ الحالة ([]) وللخدمة وصفة — سطرٌ بلا مادّة يُكتب فيُرى بالتقرير
  -- (قرارُ المالك) بدل «ما انصرف شي» بلا أثر. مصدرُه 'override'، والربطُ ينسخه تاريخاً كغيره.
  note         text not null check (note in ('in_trash','product_gone','pooled','farm_stock','no_sub_unit',
                                             'service_missing','old_device','override_none')),
  source       text not null check (source in ('recipe','override','relink','none')),
  created_at   timestamptz not null default now(),
  constraint invoice_consumption_skips_shape check (
    (note in ('service_missing','old_device','override_none')) = (product_id is null and qty is null and unit is null))
);
-- مَن كتب التخطّي: override_none قرارُ شخص («منو صفّر موادَّ الحالة؟» بالتقرير كأيّ تعديل)، وكلُّ تخطٍّ آخر يُكتب
-- ببيعةٍ أو تعديلٍ لأحد. فارغٌ لمشغّل المنصّة (0151، كـinvoice_consumption.created_by)، ونسخةُ الربط تحمل كاتبَ أصلها.
-- وكلُّ موضع إدراجٍ يكتبه صراحةً (_consumption_apply، _consumption_relink، وتخطّياتُ سطور البيعة)؛ والافتراضيُّ القاعدةُ
-- نفسُها لا auth.uid() وحده: إدراجٌ يُكتب غداً وينساه لا يختم مشغّلَ المنصّة (لا أثرَ جديد، 0151). بلا تعبئة: الجدولُ من هنا.
alter table public.invoice_consumption_skips add column if not exists created_by uuid;
alter table public.invoice_consumption_skips
  alter column created_by set default (case when public.platform_acting_clinic() is null then auth.uid() end);
comment on column public.invoice_consumption_skips.created_by is
  'مَن كتب التخطّي (0252): البائعُ أو المعدِّل، ولـoverride_none مَن صفّر موادَّ الحالة — يسمّيه report_consumables، وصاحبُ العيادة (created_by = clinic_id) يُقال by_owner. نسخةُ الربط (relink) تحمل كاتبَ أصلها. فارغٌ لمشغّل المنصّة (0151).';
create index if not exists invoice_consumption_skips_clinic_idx  on public.invoice_consumption_skips (clinic_id, created_at);
create index if not exists invoice_consumption_skips_invoice_idx on public.invoice_consumption_skips (invoice_id);
create index if not exists invoice_consumption_skips_product_idx on public.invoice_consumption_skips (product_id);
comment on table public.invoice_consumption_skips is
  'ما لم يُخصم من مستهلكات خدمةٍ بيعت، ولماذا (0252). للإخبار وحده: الربطُ يعيد كتابتَه على السطر الجديد ولا يحرّكه شيء.';
-- قاعدةٌ نزلت عليها نسخةٌ أولى من هذه الهجرة (قبل override_none) لا يعيد `create table if not exists` قيدَيها: سطرُ
-- override_none يُرفض بها (23514) فتسقط بيعةُ كلّ حالةٍ صُفّرت موادُّها. القيدان يُعادان هنا إن خلا نصُّهما منه — وعلى قاعدةٍ
-- جديدة لا شيء (القيدان حاضران بنصّهما، والإضافةُ تُتخطّى).
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.invoice_consumption_skips'::regclass and c.contype = 'c'
              and c.conname in ('invoice_consumption_skips_note_check', 'invoice_consumption_skips_shape')
              and position('override_none' in pg_get_constraintdef(c.oid)) = 0 loop
    execute format('alter table public.invoice_consumption_skips drop constraint %I', r.conname);
  end loop;
  begin
    alter table public.invoice_consumption_skips add constraint invoice_consumption_skips_note_check
      check (note in ('in_trash','product_gone','pooled','farm_stock','no_sub_unit','service_missing','old_device','override_none'));
  exception when duplicate_object then null; end;
  begin
    alter table public.invoice_consumption_skips add constraint invoice_consumption_skips_shape
      check ((note in ('service_missing','old_device','override_none')) = (product_id is null and qty is null and unit is null));
  exception when duplicate_object then null; end;
end $$;

create table if not exists public.product_stock_carry (            -- جدولٌ جانبيّ: لا حمولةَ على products
  product_id uuid primary key,         -- ليّن: يعيش المحذوفات والاسترجاع
  clinic_id  uuid not null references auth.users(id) on delete cascade,
  carry      numeric(24,9) not null default 0 check (carry >= -0.0005 and carry < 0.0005),
  ext_in     numeric(24,9) not null default 0,   -- ما رحّله إليه كاتبٌ من خارج الدفتر بالضبط (سندُ الهدر)
  ext_out    numeric(24,3) not null default 0,   -- ما كتبه بالرصيد ترحيلٌ من خارج الدفتر (الهدر، وطيُّ الدمج)
  updated_at timestamptz not null default now()
);
create index if not exists product_stock_carry_clinic_idx on public.product_stock_carry (clinic_id);

-- الوصفةُ والدفترُ والمتخطّى: قراءةٌ للعيادة وحدها، والكتابةُ كلُّها من دوالّ المالك.
alter table public.clinic_service_recipe_items enable row level security;
drop policy if exists clinic_service_recipe_items_select on public.clinic_service_recipe_items;
create policy clinic_service_recipe_items_select on public.clinic_service_recipe_items
  for select using (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_service_recipe_items from anon;
revoke insert, update, delete, truncate on table public.clinic_service_recipe_items from authenticated;
grant select on table public.clinic_service_recipe_items to authenticated;
select public.photographer_fence_table('clinic_service_recipe_items');

alter table public.invoice_consumption enable row level security;
drop policy if exists invoice_consumption_select on public.invoice_consumption;
create policy invoice_consumption_select on public.invoice_consumption
  for select using (clinic_id = (select auth_clinic()));
revoke all on table public.invoice_consumption from anon;
revoke insert, update, delete, truncate on table public.invoice_consumption from authenticated;
grant select on table public.invoice_consumption to authenticated;
select public.photographer_fence_table('invoice_consumption');

alter table public.invoice_consumption_skips enable row level security;
drop policy if exists invoice_consumption_skips_select on public.invoice_consumption_skips;
create policy invoice_consumption_skips_select on public.invoice_consumption_skips
  for select using (clinic_id = (select auth_clinic()));
revoke all on table public.invoice_consumption_skips from anon;
revoke insert, update, delete, truncate on table public.invoice_consumption_skips from authenticated;
grant select on table public.invoice_consumption_skips to authenticated;
select public.photographer_fence_table('invoice_consumption_skips');

-- المرحَّلُ بلا سياسةٍ عمداً (قاعدةُ 0160): لا يقرؤه ولا يكتبه إلا _stock_post وverify_consumption.
alter table public.product_stock_carry enable row level security;
revoke all on table public.product_stock_carry from anon, authenticated;
comment on table public.product_stock_carry is
  'RLS-DENY-ALL-BY-DESIGN — المرحَّلُ لكلّ مادّة (0252): ما بين المقدار الدقيق (٩ مراتب) والرصيد (٣). يكتبه _stock_post وحده تحت قفل صفّ المادّة، ويفحصه verify_consumption. سياسةُ قراءةٍ هنا لا تنفع أحداً، وسياسةُ كتابةٍ تكسر الثابت.';
select public.photographer_fence_table('product_stock_carry');

-- ── ٢) الحسابُ الدقيق ─────────────────────────────────────────────────────
-- n/d بـs منازل، النصفُ بعيداً عن الصفر، بقسمةٍ صحيحة (div) — لا حاصلَ بستّ عشرةَ خانة.
-- مرآتُه roundDiv بـsrc/lib/consumption.ts. نقيّةٌ فتُمنح لقرّاء الصلاحية (invoker).
-- الضربُ بـ10^-s لا القسمةُ على 10^s: power(10::numeric, 9) دقّتُه ٧ منازل فتقرّب القسمةُ قبل الأوان،
-- فيضيع المنزلُ التاسع متى بلغ الناتجُ ١٠^٨ (مقيسٌ على PG 16: …333666670 والصحيح …333666667).
create or replace function public._cons_round_div(n numeric, d numeric, s int) returns numeric
language sql immutable set search_path = public as $$
  select round(sign(n) * sign(d) * div(abs(n) * power(10::numeric, s) * 2 + abs(d), 2 * abs(d))
               * power(10::numeric, -s), s)
$$;
revoke all on function public._cons_round_div(numeric, numeric, int) from public, anon;
grant execute on function public._cons_round_div(numeric, numeric, int) to authenticated;

-- لحظةُ حدثٍ بالميكروثانية منذ ١٩٧٠ — رقمٌ صحيحٌ بالضبط: extract يرجع numeric (PG ≥ 14) فلا عائمَ بأيّ خطوة،
-- والناتجُ تحت 2^53 فيصل JSON كما هو. كلُّ أحداث الفعل الواحد (بيعة، مرتجع، ترجيع، حذف، تعديل) تحمل now()
-- معاملتها، فرقمُها واحد: هو «دفعةُ» ذلك الفعل. مصدرٌ واحد لـat_us بالقراءة ولدفعات سند الهدر (0254) — الجهازُ
-- يقارن الاثنين بالتساوي، فتعبيرٌ ثانٍ أو عائمٌ بأيّ طرف يفتح الشطبَ المزدوج بصمت. والحقبةُ لا تتبع المنطقة
-- الزمنية، فهي immutable. نقيّةٌ فتُمنح كسابقتها (invoice_consumption_get بصلاحية المُنادي).
create or replace function public._cons_at_us(p_at timestamptz) returns bigint
language sql immutable set search_path = public as $$
  select (extract(epoch from p_at) * 1000000)::bigint
$$;
revoke all on function public._cons_at_us(timestamptz) from public, anon;
grant execute on function public._cons_at_us(timestamptz) to authenticated;

-- كلفةُ وحدة المخزون الواحدة — مصدرٌ واحد لكلّ تقييم (الوصفة، المعاينة، الملخّص، سندُ الهدر).
-- V0 = سعرُ الشراء (0255 يبدّلها للمتوسط). مرآتُها stockUnitCost. نقيّةٌ فتُمنح كسابقتها.
create or replace function public.stock_unit_cost(p public.products) returns numeric
language sql immutable set search_path = public as
$$ select greatest(coalesce(p.purchase_price, 0), 0)::numeric $$;
revoke all on function public.stock_unit_cost(public.products) from public, anon;
grant execute on function public.stock_unit_cost(public.products) to authenticated;

-- ── ٣) الكاتبُ الوحيد لرصيد الاستهلاك ─────────────────────────────────────
-- p_x مقدارٌ دقيق (٩ منازل): موجبٌ أخذ، سالبٌ ردّ. الترتيب: صفُّ المادّة أوّلاً (أو صفُّها بالمحذوفات،
-- ويُتبع merged_into تحت القفل — عكسٌ قرأ مواصفتَه قبل الدمج يكتب للأصل)، ثم المرحَّل بإدراجٍ لا يضيع
-- ثم قفل. والمكتوب = floor(المجموع·1000 + ½)/1000: يتبع المجموعَ التراكميَّ وحده، فالإرجاعُ يردّ بالضبط.
-- مادّةٌ غائبةٌ كلّياً ('gone'): لا رصيدَ يُكتب ولا مرحَّل. 'external' كاتبٌ من خارج الدفتر (موافقةُ
-- الهدر، 0254)، و'fold' طيُّ مرحَّل توأمٍ بالأصل عند الدمج — كلاهما يحفظ الثابتَ بـext_in/ext_out.
create or replace function public._stock_post(p_clinic uuid, p_product uuid, p_x numeric, p_mode text default 'ledger',
  out o_product uuid, out o_posted numeric, out o_place text, out o_before numeric)
language plpgsql security definer set search_path = public as $$
declare v_next uuid; v_hops int := 0; v_c numeric; v_total numeric;
begin
  if p_mode is null or p_mode not in ('ledger', 'external', 'fold') then
    raise exception 'stock_post_mode' using hint = 'طريقةُ ترحيلٍ غير معروفة — بلّغ الدعم';
  end if;
  -- المرحَّلُ ٩ منازل: مقدارٌ أدقُّ منه يُقرَّب بصمت عند الحفظ فينكسر الثابت — يُرفض بصوت.
  if p_x is null or p_x <> round(p_x, 9) then
    raise exception 'stock_post_scale' using hint = 'مقدارُ الخصم أدقّ من تسع منازل — بلّغ الدعم';
  end if;
  o_product := p_product;
  -- ١) الصفُّ الذي يحمل الرصيد، مقفولاً أوّلاً (نفسُ ترتيب قفل كلّ مُنادٍ)
  loop
    select stock into o_before from products where id = o_product and clinic_id = p_clinic for update;
    if found then o_place := 'live'; exit; end if;
    select merged_into, stock into v_next, o_before from products_trash
     where id = o_product and clinic_id = p_clinic for update;
    if not found then o_place := 'gone'; o_before := null; exit; end if;
    if v_next is null then o_place := 'trash'; exit; end if;
    o_product := v_next;                         -- دُمجت بعد قراءة المواصفة: إلى الأصل
    v_hops := v_hops + 1;
    if v_hops > 20 then raise exception 'stock_merge_loop' using hint = 'سلسلة دمج مكسورة بهالمادة — بلّغ الدعم'; end if;
  end loop;
  if o_place = 'gone' then o_posted := 0; return; end if;   -- لا مكانَ للكتابة: لا رصيد ولا مرحَّل
  -- ٢) المرحَّل: يُنشأ بلا تحديثٍ ضائع، ثم يُقفل
  insert into product_stock_carry (product_id, clinic_id) values (o_product, p_clinic) on conflict (product_id) do nothing;
  select carry into v_c from product_stock_carry where product_id = o_product and clinic_id = p_clinic for update;
  if not found then
    raise exception 'stock_carry_clinic' using hint = 'مرحَّلُ هالمادة باسم عيادةٍ ثانية — بلّغ الدعم';
  end if;
  v_total  := v_c + p_x;
  o_posted := round(floor(v_total * 1000 + 0.5) / 1000, 3);   -- النصفُ للأعلى: يتبع المجموعَ التراكميّ وحده
  if o_posted <> 0 then                                       -- لا سطرَ تدقيقٍ فارغ
    if o_place = 'live' then
      update products set stock = coalesce(stock, 0) - o_posted where id = o_product and clinic_id = p_clinic;
    else
      update products_trash t set stock = coalesce(t.stock, 0) - o_posted,
             "row" = jsonb_set(t."row", '{stock}', to_jsonb(coalesce((t."row"->>'stock')::numeric, 0) - o_posted))
       where t.id = o_product and t.clinic_id = p_clinic;
    end if;
  end if;
  update product_stock_carry
     set carry   = v_total - o_posted,
         ext_in  = ext_in  + (case when p_mode = 'external' then p_x else 0 end),
         ext_out = ext_out + (case when p_mode in ('external', 'fold') then o_posted else 0 end),
         updated_at = now()
   where product_id = o_product and clinic_id = p_clinic;
end $$;
revoke all on function public._stock_post(uuid, uuid, numeric, text) from public, anon, authenticated;

-- منتجاتُ الفاتورة كلُّها (سطورُ المواد، وما بدفترها، وما يُضاف) تُقفل بالمعرّف — قبل أوّل كتابةٍ على
-- رصيد، بترتيب البيعة نفسه. تناديها المحفّزاتُ والتعديلُ هنا، والمرتجعُ والحذفُ (0253).
create or replace function public._invoice_lock_products(p_clinic uuid, p_invoice uuid, p_extra uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from products
   where clinic_id = p_clinic
     and id in (select product_id from invoice_items where invoice_id = p_invoice and clinic_id = p_clinic and product_id is not null
                union select product_id from invoice_consumption where invoice_id = p_invoice and clinic_id = p_clinic
                union select unnest(p_extra))
   order by id for update;
end $$;
revoke all on function public._invoice_lock_products(uuid, uuid, uuid[]) from public, anon, authenticated;

-- ── ٤) التخطيطُ والصرفُ والمزامنةُ والربط ──────────────────────────────────
-- الخطّة: تُنادى مرّةً من البيعة بعد فحص الإعادة وكتلة التأريخ وقبل أيّ كتابة، فكلُّ رفضٍ بلا أثر.
-- ١) تصنيفُ السطور الموجبة بلا مادّة: service_id ليس معرّفاً ⇒ service_id_bad؛ خدمةٌ من العيادة ⇒
--    مرشَّح؛ غيرُها ⇒ تخطّي السطر service_missing (كلفةُ الجهاز تبقى، ولا service_id يُحفظ). والمفتاحُ
--    **غائبٌ** (جهازٌ قبل 0252 لا يعرفه) واسمُه اسمُ خدمةٍ لها وصفة ⇒ old_device؛ أمّا null الصريح (أو الفارغ)
--    فسطرٌ معروفٌ ليس خدمة — دواءٌ أو لقاحٌ أو أجرةُ توصيل — بلا تخطٍّ ولا وصفة: الشاشةُ ترسله كذلك، وتصنيفُه بالاسم
--    كان يعدّ دواءً اسمُه اسمُ خدمةٍ «جهازاً ما تحدّث» بالتقرير. الخادمُ لا يخصم بالاسم أبداً.
-- ٢) التعديلُ يُفحص (≤ ٤٠ مدخلاً سليماً بلا مادّةٍ مرّتين، وإلا consumables_bad)، ويسقط إن ساوى الوصفة؛
--    والسطرُ مخطَّطٌ إن بقيت وصفةٌ أو تعديل — وإلا كما هو اليوم (هوّة M12). والتعديلُ للطبيب أو المدير.
-- ٣) قفلُ كلّ مادّةٍ تمسّها السلّة (سطورُ المواد ومداخلُ المخطَّط) بجملةٍ واحدة بالمعرّف.
-- ٤) كلُّ مدخلٍ على صفّه المقفول: حيٌّ صالح ⇒ مواصفةٌ بقيمٍ مجمَّدة؛ حقل/حوض/صغيرةٌ بلا وحدة ⇒ تخطّي
--    المادّة؛ بالمحذوفات ⇒ in_trash؛ لا مكان: مدخلُ وصفة ⇒ product_gone، ومدخلُ تعديل ⇒ consumables_bad.
--    وتعديلٌ فارغ ([]) على خدمةٍ لها وصفة ⇒ تخطّي السطر override_none (بلا مادّة): «ما انصرف شي» يُرى بالتقرير.
create or replace function public._consumption_plan(p_clinic uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_uuid  constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_dec   constant text := '^[ \t\n\r\f\v]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t\n\r\f\v]*$';
  it      jsonb;
  v_n     bigint;
  v_raw   text;
  v_qty   numeric;
  v_name  text;
  v_sid   uuid;
  v_svc   clinic_services;
  v_ov    jsonb;
  v_ent   jsonb;
  v_e     jsonb;
  v_seen  uuid[];
  v_pid   uuid;
  v_q     numeric;
  v_u     text;
  v_rk    text[];
  v_ok    text[];
  v_src   text;
  v_cands jsonb := '[]'::jsonb;
  v_lines jsonb := '{}'::jsonb;
  v_lskip jsonb := '[]'::jsonb;
  v_lock  uuid[] := '{}';
  v_c     jsonb;
  v_p     products;
  v_tname text;
  v_d     numeric;
  v_k     numeric;
  v_w     numeric;
  v_sum   numeric;
  v_flat  numeric;
  v_specs jsonb;
  v_skips jsonb;
begin
  for it, v_n in select x.e, x.o from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as x(e, o) loop
    -- سطرُ مادّة: يُقفل مع غيره، ولا يُخطَّط (نفسُ شرط البيعة: nullif(product_id, ''))
    if nullif(it->>'product_id', '') is not null then
      v_raw := btrim(it->>'product_id');
      if v_raw ~* c_uuid then v_lock := v_lock || v_raw::uuid; end if;
      continue;
    end if;
    v_qty := round((it->>'qty')::numeric, 3);                 -- كما تحفظه البيعة (numeric(·,3))
    if v_qty is null or v_qty <= 0 then continue; end if;      -- السالبُ والصفرُ لا يستهلكان
    v_name := coalesce(it->>'name', 'Item');
    v_raw  := nullif(btrim(it->>'service_id'), '');
    if v_raw is null then
      -- بالاسم حين يغيب المفتاحُ وحده: null الصريحُ سطرٌ معروفٌ ليس خدمة (لا تخطّيَ ولا وصفة).
      if not (it ? 'service_id') and exists (select 1 from clinic_services s
                  where s.clinic_id = p_clinic and btrim(s.name) = btrim(v_name)
                    and exists (select 1 from clinic_service_recipe_items r
                                 where r.service_id = s.id and r.clinic_id = p_clinic)) then
        v_lskip := v_lskip || jsonb_build_array(jsonb_build_object('n', v_n, 'note', 'old_device', 'svc', null, 'name', v_name));
      end if;
      continue;
    end if;
    if v_raw !~* c_uuid then
      raise exception 'service_id_bad' using hint = 'سطر خدمة بمعرّف غلط — حدّث الصفحة وأعد البيعة';
    end if;
    v_sid := v_raw::uuid;
    select * into v_svc from clinic_services where id = v_sid and clinic_id = p_clinic;
    if not found then
      v_lskip := v_lskip || jsonb_build_array(jsonb_build_object('n', v_n, 'note', 'service_missing', 'svc', v_sid, 'name', v_name));
      continue;
    end if;

    -- ٢) التعديل: غائبٌ أو null = الوصفة كما هي؛ [] = لا شيء
    v_ov := it->'consumables';
    if v_ov is not null and jsonb_typeof(v_ov) = 'null' then v_ov := null; end if;
    v_ent := '[]'::jsonb;
    if v_ov is not null then
      if jsonb_typeof(v_ov) <> 'array' or jsonb_array_length(v_ov) > 40 then
        raise exception 'consumables_bad' using hint = format('مستهلكات سطر «%s» غلط — افتحها وصحّحها', v_name);
      end if;
      v_seen := '{}';
      for v_e in select x from jsonb_array_elements(v_ov) x loop
        v_raw := case when jsonb_typeof(v_e) = 'object' and jsonb_typeof(v_e->'product_id') = 'string'
                      then btrim(v_e->>'product_id') end;
        v_u := case when jsonb_typeof(v_e) <> 'object' then null
                    when jsonb_typeof(v_e->'unit') is null or jsonb_typeof(v_e->'unit') = 'null' or v_e->>'unit' = '' then 'stock'
                    when jsonb_typeof(v_e->'unit') = 'string' then v_e->>'unit' end;
        v_q := case when jsonb_typeof(v_e) = 'object' and jsonb_typeof(v_e->'qty') in ('number', 'string')
                         and (v_e->>'qty') ~ c_dec then (v_e->>'qty')::numeric end;
        if v_raw is null or v_raw !~* c_uuid or v_u is null or v_u not in ('stock', 'sub')
           or v_q is null or v_q <= 0 or v_q > 1000000 or v_q <> round(v_q, 3) then
          raise exception 'consumables_bad' using hint = format('مستهلكات سطر «%s» غلط — افتحها وصحّحها', v_name);
        end if;
        v_pid := v_raw::uuid;
        if v_pid = any(v_seen) then
          raise exception 'consumables_bad' using hint = format('مستهلكات سطر «%s» غلط — افتحها وصحّحها', v_name);
        end if;
        v_seen := v_seen || v_pid;
        v_ent := v_ent || jsonb_build_array(jsonb_build_object('p', v_pid, 'q', v_q, 'u', v_u, 'snap', null));
      end loop;
      -- يساوي الوصفةَ كمجموعةٍ بتكرار من (المادّة، الكمية، الوحدة) ⇒ يسقط
      select coalesce(array_agg(k order by k), '{}') into v_rk
        from (select format('%s|%s|%s', r.product_id, r.qty::numeric(24,3), r.unit) as k
                from clinic_service_recipe_items r where r.service_id = v_sid and r.clinic_id = p_clinic) s;
      select coalesce(array_agg(k order by k), '{}') into v_ok
        from (select format('%s|%s|%s', (x->>'p')::uuid, ((x->>'q')::numeric)::numeric(24,3), x->>'u') as k
                from jsonb_array_elements(v_ent) x) s;
      if v_rk = v_ok then v_ov := null; end if;
    end if;

    if v_ov is null then
      select coalesce(jsonb_agg(jsonb_build_object('p', r.product_id, 'q', r.qty, 'u', r.unit, 'snap', r.product_name)
                                order by r.position, r.id), '[]'::jsonb)
        into v_ent
        from clinic_service_recipe_items r where r.service_id = v_sid and r.clinic_id = p_clinic;
      if jsonb_array_length(v_ent) = 0 then
        -- غيرُ مخطَّط: service_id يُحفظ، وكلفةُ الجهاز تبقى، ولا شيءَ يُخصم
        v_lines := v_lines || jsonb_build_object(v_n::text, jsonb_build_object('svc', v_sid, 'planned', false, 'name', v_name));
        continue;
      end if;
      v_src := 'recipe';
    else
      if coalesce(auth_role(), '') not in ('manager', 'veterinarian') then
        raise exception 'consumables_case_role'
          using hint = 'تعديل مستهلكات الحالة للطبيب أو المدير — شيل التعديل أو خلّي الطبيب يكمّل البيعة';
      end if;
      v_src := 'override';
    end if;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('n', v_n, 'svc', v_sid, 'name', v_name, 'src', v_src,
                 'flat', round(coalesce(v_svc.cost, 0), 2), 'ent', v_ent));
    select v_lock || coalesce(array_agg((x->>'p')::uuid), '{}'::uuid[]) into v_lock from jsonb_array_elements(v_ent) x;
  end loop;

  -- ٣) القفلُ مرّةً واحدة بالمعرّف — نفسُ ترتيب المحفّزات والتعديل والمرتجع والحذف
  perform 1 from products where clinic_id = p_clinic and id = any(v_lock) order by id for update;

  -- ٤) كلُّ مدخلٍ على صفّه المقفول
  for v_c in select x from jsonb_array_elements(v_cands) x loop
    v_specs := '[]'::jsonb; v_skips := '[]'::jsonb; v_sum := 0;
    -- تعديلٌ فارغ والخدمةُ لها وصفة (تعديلٌ يساوي وصفةً فارغة سقط فوق): لا شيءَ يُخصم، ويُكتب سطرٌ بلا مادّة
    -- (override_none، مصدرُه 'override') — فالتقريرُ يعدّه تعديلاً موادُّه [] بدل أن يمرّ بلا أثر.
    if v_c->>'src' = 'override' and jsonb_array_length(v_c->'ent') = 0 then
      v_skips := jsonb_build_array(jsonb_build_object('p', null, 'n', null, 'q', null, 'u', null, 'note', 'override_none'));
    end if;
    for v_e in select x from jsonb_array_elements(v_c->'ent') x loop
      v_pid := (v_e->>'p')::uuid; v_q := (v_e->>'q')::numeric; v_u := v_e->>'u';
      select * into v_p from products where id = v_pid and clinic_id = p_clinic;
      if found then
        if v_p.farm_id is not null then
          v_skips := v_skips || jsonb_build_array(jsonb_build_object('p', v_pid, 'n', v_p.name, 'q', v_q, 'u', v_u, 'note', 'farm_stock'));
        elsif coalesce(v_p.pooled, false) then
          v_skips := v_skips || jsonb_build_array(jsonb_build_object('p', v_pid, 'n', v_p.name, 'q', v_q, 'u', v_u, 'note', 'pooled'));
        elsif v_u = 'sub' and not (coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0) then
          v_skips := v_skips || jsonb_build_array(jsonb_build_object('p', v_pid, 'n', v_p.name, 'q', v_q, 'u', v_u, 'note', 'no_sub_unit'));
        else
          v_d := case when v_u = 'sub' then v_p.units_per_box else 1 end;
          v_k := round(public.stock_unit_cost(v_p), 6);
          v_w := public._cons_round_div(v_q * v_k, v_d, 2);
          v_specs := v_specs || jsonb_build_array(jsonb_build_object(
            'spec', gen_random_uuid(), 'p', v_pid, 'n', v_p.name, 'u', v_u,
            'l', case when v_u = 'sub' then v_p.sub_unit_name end,
            'q', v_q, 'd', v_d, 'k', v_k, 'w', v_w, 'svc', v_c->'svc'));
          v_sum := v_sum + v_w;
        end if;
      else
        select t."row"->>'name' into v_tname from products_trash t where t.id = v_pid and t.clinic_id = p_clinic;
        if found then
          v_skips := v_skips || jsonb_build_array(jsonb_build_object('p', v_pid, 'n', coalesce(v_tname, v_e->>'snap', ''),
                       'q', v_q, 'u', v_u, 'note', 'in_trash'));
        elsif v_c->>'src' = 'recipe' then
          v_skips := v_skips || jsonb_build_array(jsonb_build_object('p', v_pid, 'n', coalesce(v_e->>'snap', ''),
                       'q', v_q, 'u', v_u, 'note', 'product_gone'));
        else
          -- مسودّةٌ من عيادةٍ أخرى أو معرّفٌ مصنوع — قبل أيّ كتابة، فلا 23502 ولا سطرَ بلا اسم
          raise exception 'consumables_bad'
            using hint = format('مستهلكات سطر «%s» بيها مادة مو من مخزن هالعيادة — افتحها وصحّحها', v_c->>'name');
        end if;
      end if;
    end loop;
    v_flat := (v_c->>'flat')::numeric;
    v_lines := v_lines || jsonb_build_object(v_c->>'n', jsonb_build_object(
      'svc', v_c->'svc', 'planned', true, 'src', v_c->>'src', 'name', v_c->>'name',
      'flat', v_flat, 'c', v_sum, 'uc', v_flat + v_sum, 'specs', v_specs, 'skips', v_skips));
  end loop;
  return jsonb_build_object('lines', v_lines, 'line_skips', v_lskip);
end $$;
revoke all on function public._consumption_plan(uuid, jsonb) from public, anon, authenticated;

-- سطرٌ مخطَّطٌ بعد إدراجه: تخطّياتُه (موادُّه كما أُدخلت، أو override_none بلا مادّة) بمصدر السطر، ثم كلُّ
-- مواصفةٍ إلى كمية السطر (بترتيب المادّة).
-- والسطرُ سطرُ هذه العيادة بهذه الفاتورة، وإلا رفض — دفترٌ على سطرٍ غريب لا يعكسه محفّز.
create or replace function public._consumption_apply(p_clinic uuid, p_invoice uuid, p_item uuid, p_qty numeric, p_line jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if not exists (select 1 from auth.users u where u.id = p_clinic) then return; end if;
  if not exists (select 1 from invoice_items ii
                  where ii.id = p_item and ii.invoice_id = p_invoice and ii.clinic_id = p_clinic) then
    raise exception 'consumption_line_missing' using hint = 'سطر الفاتورة ما انلگى لحظة خصم المستهلكات — أعد البيعة';
  end if;
  insert into invoice_consumption_skips (clinic_id, invoice_id, item_id, service_id, line_name, product_id, product_name,
                                         qty, unit, line_qty, note, source, created_by)
  select p_clinic, p_invoice, p_item, nullif(p_line->>'svc', '')::uuid, coalesce(p_line->>'name', 'Item'),
         (k->>'p')::uuid, k->>'n', (k->>'q')::numeric, k->>'u', greatest(coalesce(p_qty, 0), 0), k->>'note', p_line->>'src',
         case when platform_acting_clinic() is null then auth.uid() end
    from jsonb_array_elements(coalesce(p_line->'skips', '[]'::jsonb)) k;
  for s in select x from jsonb_array_elements(coalesce(p_line->'specs', '[]'::jsonb)) x
            order by (x->>'p')::uuid, (x->>'spec')::uuid loop
    perform public._consumption_move(p_clinic, p_invoice, p_item, s, p_qty, p_line->>'src', null);
  end loop;
end $$;
revoke all on function public._consumption_apply(uuid, uuid, uuid, numeric, jsonb) from public, anon, authenticated;

-- الحسابُ كلُّه هنا: مواصفةٌ واحدة إلى هدف (كمية السطر). الحيُّ = Σ أحداثها؛ T(Q) = Q·per_qty/per_div
-- بتسع منازل، V(Q) = round(Q·w, 2)؛ والحركةُ الفرق — فالتكرارُ لا شيء. والعجزُ لصرفٍ حيٍّ وحده:
-- max(0, المكتوب − max(الرصيد قبله، 0)). وعيادةٌ حُذف حسابُها: لا شيء.
-- والربطُ (mv، من _consumption_relink وحده) نقلُ وحداتٍ لا بيعةٌ ثانية: محفّزُ الحذف ردّ السطرَ القديم بالدفعة نفسِها قبله،
-- فعجزُه «كأنه بيعٌ الآن» كان يكتب ثانيةً عجزاً كُتب يومَ البيعة (تعديلٌ بلا تغيير ورصيدٌ سالب من فاتورةٍ أخرى ⇒ عجزٌ لم يقع)
-- ويغيّره الشراءُ بينهما. فعجزُ الربط ما زاده التعديلُ وحده لهذه الفاتورة والمادّة بهذه الدفعة: الزيادةُ على ما ردّته الدفعة
-- (لا أكثر)، ولا أكثرَ من عجز صرفِ الدفعة الجاري على رفّه — ناقصاً ما كتبه ربطٌ قبله بها. فمجموعُ عجز أحداث الفاتورة
-- لكلّ مادّة يعدّ كلَّ وحدةٍ صُرفت بلا رصيد مرّةً، والتقريرُ يقرأ الدفعةَ نقلاً (report_consumables).
create or replace function public._consumption_move(p_clinic uuid, p_invoice uuid, p_item uuid, p_spec jsonb,
  p_target numeric, p_source text, p_from uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_spec uuid    := (p_spec->>'spec')::uuid;
  v_q    numeric := (p_spec->>'q')::numeric;
  v_d    numeric := (p_spec->>'d')::numeric;
  v_w    numeric := (p_spec->>'w')::numeric;
  v_tq   numeric := greatest(coalesce(p_target, 0), 0);
  v_lq   numeric;
  v_lv   numeric;
  v_dq   numeric;
  v_dv   numeric;
  v_sf   numeric := 0;
  v_bu   numeric;          -- الدفعة (هذه الفاتورة والمادّة): ما صرفته قبل هذا الحدث، وعجزُه، وما ردّته
  v_bs   numeric;
  v_br   numeric;
  r      record;
begin
  if not exists (select 1 from auth.users u where u.id = p_clinic) then return; end if;
  select coalesce(sum(c.qty), 0), coalesce(sum(c.value), 0) into v_lq, v_lv
    from invoice_consumption c
   where c.clinic_id = p_clinic and c.item_id = p_item and c.spec_id = v_spec;
  v_dq := public._cons_round_div(v_tq * v_q, v_d, 9) - v_lq;
  v_dv := round(v_tq * v_w, 2) - v_lv;
  if v_dq = 0 and v_dv = 0 then return; end if;
  select * into r from public._stock_post(p_clinic, (p_spec->>'p')::uuid, v_dq, 'ledger');
  if r.o_place = 'live' and v_dq > 0 then
    v_sf := greatest(r.o_posted - greatest(coalesce(r.o_before, 0), 0), 0);
    if coalesce((p_spec->>'mv')::boolean, false) then
      select coalesce(sum(c.posted) filter (where c.kind = 'use'), 0), coalesce(sum(c.shortfall) filter (where c.kind = 'use'), 0),
             coalesce(-sum(c.posted) filter (where c.kind = 'restore'), 0)
        into v_bu, v_bs, v_br
        from invoice_consumption c
       where c.clinic_id = p_clinic and c.invoice_id = p_invoice and c.product_id = r.o_product and c.created_at = now();
      -- عجزُ صرف الدفعة الجاري: ما صرفته (مع هذا) فوق رفّها قبل أوّل صرفٍ بها؛ والزيادةُ: صرفُها ناقصَ ما ردّته.
      v_sf := greatest(least(greatest(v_bu + r.o_posted - greatest(coalesce(r.o_before, 0) + v_bu, 0), 0),
                             greatest(v_bu + r.o_posted - v_br, 0)) - v_bs, 0);
    end if;
  end if;
  insert into invoice_consumption (clinic_id, invoice_id, item_id, spec_id, from_item, service_id, product_id, product_name,
                                   unit, unit_label, per_qty, per_div, unit_cost, per_value, line_qty, qty, posted, value,
                                   shortfall, kind, note, source, created_by)
  values (p_clinic, p_invoice, p_item, v_spec, p_from, nullif(p_spec->>'svc', '')::uuid, r.o_product, coalesce(p_spec->>'n', ''),
          p_spec->>'u', p_spec->>'l', v_q, v_d, (p_spec->>'k')::numeric, v_w, v_tq, v_dq, r.o_posted, v_dv,
          v_sf,
          case when v_dq > 0 or (v_dq = 0 and v_dv > 0) then 'use' else 'restore' end,
          case r.o_place when 'trash' then 'in_trash' when 'gone' then 'product_gone' end,
          p_source,
          case when platform_acting_clinic() is null then auth.uid() end);
end $$;
revoke all on function public._consumption_move(uuid, uuid, uuid, jsonb, numeric, text, uuid) from public, anon, authenticated;

-- سطرٌ إلى هدف: كلُّ مواصفاته بقيمها المجمَّدة (أيُّ حدثٍ منها يحملها)، بترتيب (المادّة، المواصفة).
-- المتخطّى بجدوله — فلا مزامنةَ تخصم ما تُخطّي يوماً (هوّتا M5/B1).
create or replace function public._consumption_sync_item(p_clinic uuid, p_item uuid, p_target numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select s.* from (
      select distinct on (c.spec_id) c.spec_id, c.invoice_id, c.product_id, c.product_name, c.unit, c.unit_label,
             c.per_qty, c.per_div, c.unit_cost, c.per_value, c.service_id, c.source, c.from_item
        from invoice_consumption c
       where c.clinic_id = p_clinic and c.item_id = p_item
       order by c.spec_id, c.created_at, c.id) s
     order by s.product_id, s.spec_id
  loop
    perform public._consumption_move(p_clinic, r.invoice_id, p_item,
      jsonb_build_object('spec', r.spec_id, 'p', r.product_id, 'n', r.product_name, 'u', r.unit, 'l', r.unit_label,
                         'q', r.per_qty, 'd', r.per_div, 'k', r.unit_cost, 'w', r.per_value, 'svc', r.service_id),
      p_target, r.source, r.from_item);
  end loop;
end $$;
revoke all on function public._consumption_sync_item(uuid, uuid, numeric) from public, anon, authenticated;

-- التعديلُ أعاد السطرَ بمعرّفٍ جديد: كلُّ مواصفةٍ للقديم تُنسخ مواصفةً جديدة بقيمها المجمَّدة إلى الكمية
-- الجديدة (source = 'relink')، وتخطّياتُه تُكتب على الجديد تاريخاً لا حركة. القديمُ ردّه محفّزُ الحذف.
-- والنسخةُ نقلٌ (mv): عجزُها ما زاده التعديلُ وحده (_consumption_move) — لا عجزَ بيعةٍ جديدة على رفٍّ تغيّر بعدها.
create or replace function public._consumption_relink(p_clinic uuid, p_invoice uuid, p_from uuid, p_to uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from auth.users u where u.id = p_clinic) then return; end if;
  for r in
    select s.* from (
      select distinct on (c.spec_id) c.spec_id, c.product_id, c.product_name, c.unit, c.unit_label,
             c.per_qty, c.per_div, c.unit_cost, c.per_value, c.service_id
        from invoice_consumption c
       where c.clinic_id = p_clinic and c.invoice_id = p_invoice and c.item_id = p_from
       order by c.spec_id, c.created_at, c.id) s
     order by s.product_id, s.spec_id
  loop
    perform public._consumption_move(p_clinic, p_invoice, p_to,
      jsonb_build_object('spec', gen_random_uuid(), 'p', r.product_id, 'n', r.product_name, 'u', r.unit, 'l', r.unit_label,
                         'q', r.per_qty, 'd', r.per_div, 'k', r.unit_cost, 'w', r.per_value, 'svc', r.service_id, 'mv', true),
      p_qty, 'relink', p_from);
  end loop;
  insert into invoice_consumption_skips (clinic_id, invoice_id, item_id, service_id, line_name, product_id, product_name,
                                         qty, unit, line_qty, note, source, created_by)
  select p_clinic, p_invoice, p_to, k.service_id, k.line_name, k.product_id, k.product_name,
         k.qty, k.unit, greatest(coalesce(p_qty, 0), 0), k.note, 'relink', k.created_by
    from invoice_consumption_skips k
   where k.clinic_id = p_clinic and k.invoice_id = p_invoice and k.item_id = p_from;
end $$;
revoke all on function public._consumption_relink(uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;

-- ── ٥) المحفّزات: كلُّ كاتبٍ يلتقي هنا — دالّةً كان أو كتابةً مباشرة، اليومَ أو غداً ─────────
-- كلٌّ منها يخرج فوراً إن لم يكن لسطره (أو فاتورته) دفتر، ثم إن حُذف حسابُ العيادة (سابقةُ 0146:35)؛
-- ثم يقفل منتجاتِ الفاتورة بالمعرّف قبل أيّ كتابة. إلا محفّزَ الترجيع: يقفلها ولو بلا دفتر (أدناه).
create or replace function public.invoice_items_consumption_del()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invoice_consumption c where c.item_id = old.id and c.clinic_id = old.clinic_id) then return null; end if;
  if not exists (select 1 from auth.users u where u.id = old.clinic_id) then return null; end if;
  perform public._invoice_lock_products(old.clinic_id, old.invoice_id);
  perform public._consumption_sync_item(old.clinic_id, old.id, 0);
  return null;
end $$;
revoke all on function public.invoice_items_consumption_del() from public, anon, authenticated;
drop trigger if exists invoice_items_consumption_del on public.invoice_items;
create trigger invoice_items_consumption_del after delete on public.invoice_items
  for each row execute function public.invoice_items_consumption_del();

create or replace function public.invoice_items_consumption_qty()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from invoice_consumption c where c.item_id = new.id and c.clinic_id = new.clinic_id) then return null; end if;
  if not exists (select 1 from auth.users u where u.id = new.clinic_id) then return null; end if;
  perform public._invoice_lock_products(new.clinic_id, new.invoice_id);
  select i.status into v_status from invoices i where i.id = new.invoice_id and i.clinic_id = new.clinic_id;
  perform public._consumption_sync_item(new.clinic_id, new.id,
    case when v_status = 'refunded' then 0 else greatest(new.qty, 0) end);
  return null;
end $$;
revoke all on function public.invoice_items_consumption_qty() from public, anon, authenticated;
drop trigger if exists invoice_items_consumption_qty on public.invoice_items;
create trigger invoice_items_consumption_qty after update of qty on public.invoice_items
  for each row when (new.qty is distinct from old.qty) execute function public.invoice_items_consumption_qty();

-- الفاتورةُ تدخل «مرجَّعة» (الترجيع، المرتجعُ الكامل) أو تخرج منها (فكٌّ مباشر من المدير): كلُّ سطرٍ
-- بدفترٍ إلى صفر أو إلى كميته، بترتيب معرّفه. ومحفّزُ الترجيع يجري قبل حلقة موادّ refund_invoice.
-- والقفلُ قبل سؤال الدفتر: refund_invoice (0066) يرجّع موادَّ الفاتورة بعد هذا المحفّز **بترتيب سطورها**،
-- وفاتورةُ موادَّ بلا خدمة (لا دفترَ لها) كانت تخرج هنا بلا قفل — الطريقَ الوحيد الذي يأخذ أوّلَ قفلٍ بترتيب
-- السطور، وبيعةٌ بالموادّ نفسها تقفلها بالمعرّف (_consumption_plan) ⇒ انسداد (40P01) يُسقط إحداهما. فالمنتجاتُ
-- بالمعرّف أوّلاً لكلّ ترجيعٍ وفكّ، والحلقةُ بعدها تأخذ صفوفاً مقفولةً سلفاً.
create or replace function public.invoices_consumption_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from auth.users u where u.id = new.clinic_id) then return null; end if;
  perform public._invoice_lock_products(new.clinic_id, new.id);
  if not exists (select 1 from invoice_consumption c where c.invoice_id = new.id and c.clinic_id = new.clinic_id) then return null; end if;
  for r in
    select ii.id, ii.qty from invoice_items ii
     where ii.invoice_id = new.id and ii.clinic_id = new.clinic_id
       and exists (select 1 from invoice_consumption c where c.item_id = ii.id and c.clinic_id = new.clinic_id)
     order by ii.id
  loop
    perform public._consumption_sync_item(new.clinic_id, r.id,
      case when new.status = 'refunded' then 0 else greatest(r.qty, 0) end);
  end loop;
  return null;
end $$;
revoke all on function public.invoices_consumption_status() from public, anon, authenticated;
drop trigger if exists invoices_consumption_status on public.invoices;
create trigger invoices_consumption_status after update of status on public.invoices
  for each row when ((coalesce(old.status, '') = 'refunded') is distinct from (coalesce(new.status, '') = 'refunded'))
  execute function public.invoices_consumption_status();

-- الدمجُ (merge_products، inventory_tidy_uncat) يكتب merged_into بالمحذوفات **قبل** أن يتحرّك أيُّ رصيد
-- (0184): الوصفةُ (باسم الأصل) والدفترُ والمتخطّى تنتقل للأصل، ومرحَّلُ التوأم يُطوى فيه بـ'fold' ثم
-- يُحذف — والثابتُ يبقى بالضبط (ext_in/ext_out تُجمع). وتوأمٌ بلا مرحَّل لا طيَّ له.
create or replace function public.products_trash_consumption()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c product_stock_carry; v_keep text;
begin
  if new.merged_into = new.id then return null; end if;
  if not exists (select 1 from auth.users u where u.id = new.clinic_id) then return null; end if;
  select p.name into v_keep from products p where p.id = new.merged_into and p.clinic_id = new.clinic_id;
  update clinic_service_recipe_items
     set product_id = new.merged_into, product_name = coalesce(v_keep, product_name), updated_at = now()
   where product_id = new.id and clinic_id = new.clinic_id;
  update invoice_consumption set product_id = new.merged_into where product_id = new.id and clinic_id = new.clinic_id;
  update invoice_consumption_skips set product_id = new.merged_into where product_id = new.id and clinic_id = new.clinic_id;
  if exists (select 1 from product_stock_carry k where k.product_id = new.id and k.clinic_id = new.clinic_id) then
    -- المادّتان بالمعرّف قبل المرحَّل (inventory_tidy_uncat لا يقفل التوأم قبل السلّة)
    perform 1 from products where clinic_id = new.clinic_id and id in (new.id, new.merged_into) order by id for update;
    select * into v_c from product_stock_carry where product_id = new.id and clinic_id = new.clinic_id for update;
    if found then
      perform public._stock_post(new.clinic_id, new.merged_into, v_c.carry, 'fold');
      update product_stock_carry
         set ext_in = ext_in + v_c.ext_in, ext_out = ext_out + v_c.ext_out, updated_at = now()
       where product_id = new.merged_into and clinic_id = new.clinic_id;
      delete from product_stock_carry where product_id = new.id and clinic_id = new.clinic_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.products_trash_consumption() from public, anon, authenticated;
drop trigger if exists products_trash_consumption on public.products_trash;
create trigger products_trash_consumption after insert or update of merged_into on public.products_trash
  for each row when (new.merged_into is not null) execute function public.products_trash_consumption();

-- ── ٦) الوصفة ────────────────────────────────────────────────────────────
-- القراءة (invoker، RLS حارسُها): السطورُ بترتيبها ومشكلةُ كلٍّ منها الآن، وكلفتُها لمرّةٍ واحدة بسعر
-- اليوم (سطرٌ بمشكلةٍ لا يُخصم فكلفتُه صفر). والبصمةُ md5 لـ`product_id:qty:unit:position` بـ| بترتيب
-- (position, id) — يرسلها الحفظ فيرفض الخادمُ إن تغيّرت من جهازٍ آخر.
create or replace function public.service_recipe_get(p_service uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_svc clinic_services; v_fp text; v_lines jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_svc from clinic_services where id = p_service and clinic_id = v_clinic;
  if not found then
    raise exception 'recipe_service_missing' using hint = 'الخدمة ما وصلت للسحابة بعد — انتظر لحظة وأعد المحاولة';
  end if;
  select md5(coalesce(string_agg(format('%s:%s:%s:%s', r.product_id, r.qty, r.unit, r.position), '|'
                                 order by r.position, r.id), ''))
    into v_fp
    from clinic_service_recipe_items r where r.service_id = p_service and r.clinic_id = v_clinic;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'product_id', x.product_id, 'product_name', x.product_name, 'qty', x.qty, 'unit', x.unit,
           'position', x.position, 'problem', x.problem, 'stock', x.stock, 'unit_label', x.unit_label,
           'units_per_box', x.units_per_box, 'unit_cost', x.unit_cost, 'per_value', x.per_value)
           order by x.position, x.id), '[]'::jsonb)
    into v_lines
    from (
      select r.id, r.product_id, coalesce(p.name, t."row"->>'name', r.product_name) as product_name,
             r.qty, r.unit, r.position, pr.problem, p.stock,
             case when r.unit = 'sub' then p.sub_unit_name end as unit_label,
             p.units_per_box,
             case when p.id is null then 0 else public.stock_unit_cost(p) end as unit_cost,
             case when pr.problem is null
                  then public._cons_round_div(r.qty * public.stock_unit_cost(p),
                                              case when r.unit = 'sub' then p.units_per_box else 1 end, 2)
                  else 0 end as per_value
        from clinic_service_recipe_items r
        left join products p on p.id = r.product_id and p.clinic_id = v_clinic
        left join products_trash t on p.id is null and t.id = r.product_id and t.clinic_id = v_clinic
        cross join lateral (select case
                 when p.id is null then (case when t.id is not null then 'in_trash' else 'product_gone' end)
                 when p.farm_id is not null then 'farm_stock'
                 when coalesce(p.pooled, false) then 'pooled'
                 when r.unit = 'sub' and not (coalesce(p.has_sub_unit, false) and coalesce(p.units_per_box, 0) > 0) then 'no_sub_unit'
               end as problem) pr
       where r.service_id = p_service and r.clinic_id = v_clinic) x;
  return jsonb_build_object('fingerprint', v_fp, 'flat_cost', v_svc.cost, 'lines', v_lines);
end $$;
revoke all on function public.service_recipe_get(uuid) from public, anon;
grant execute on function public.service_recipe_get(uuid) to authenticated;

-- الحفظ (definer): المدير (ومفتاحُه الحيّ) أو من له manageSettings، والمصوّرُ أبداً. قفلُ الخدمة ثم مقارنةُ
-- البصمة ثم فحصُ كلّ سطرٍ بترتيب الواجهة (validateRecipeLines): الشكل ← التكرار ← المادّة ← الحوض ← الحقل
-- ← الصغيرةُ بلا وحدة ← T(1) = 0. ثم تُستبدل السطور، وتُصفَّر الكلفةُ اليدوية إن طُلب (يدقّقها محفّزُ
-- الجدول)، وسطرُ تدقيقٍ **واحد** «المستهلكات: كانت … صارت …» — وحفظٌ بلا تغيير لا يُكتب.
-- staff_can وis_photographer تُسألان بـexecute إن وُجدتا: تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي 42883.
create or replace function public.service_recipe_set(p_service uuid, p_lines jsonb, p_expect text, p_clear_flat_cost boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_dec    constant text := '^[ \t\n\r\f\v]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t\n\r\f\v]*$';
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_can    boolean := false;
  v_svc    clinic_services;
  v_fp     text;
  v_new_fp text;
  v_old    text;
  v_new    text;
  v_e      jsonb;
  v_i      int := 0;
  v_raw    text;
  v_u      text;
  v_q      numeric;
  v_seen   text[] := '{}';
  v_p      products;
  v_d      numeric;
  v_rows   jsonb := '[]'::jsonb;
  v_out    jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if coalesce(v_ph, false) then
    raise exception 'recipe_forbidden' using hint = 'وصفة الخدمة يعدّلها المدير — افتح وضع المدير';
  end if;
  if coalesce(auth_role(), '') <> 'manager' then
    if to_regprocedure('public.staff_can(text)') is not null then
      execute 'select public.staff_can($1)' into v_can using 'manageSettings';
    end if;
    if not coalesce(v_can, false) then
      raise exception 'recipe_forbidden' using hint = 'وصفة الخدمة يعدّلها المدير — افتح وضع المدير';
    end if;
  end if;

  select * into v_svc from clinic_services where id = p_service and clinic_id = v_clinic for update;
  if not found then
    raise exception 'recipe_service_missing' using hint = 'الخدمة ما وصلت للسحابة بعد — انتظر لحظة وأعد المحاولة';
  end if;
  select md5(coalesce(string_agg(format('%s:%s:%s:%s', r.product_id, r.qty, r.unit, r.position), '|'
                                 order by r.position, r.id), ''))
    into v_fp
    from clinic_service_recipe_items r where r.service_id = p_service and r.clinic_id = v_clinic;
  if p_expect is distinct from v_fp then
    raise exception 'recipe_moved' using hint = 'الوصفة تغيّرت من جهاز ثاني — سكّرها وافتحها من جديد';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'recipe_bad_line' using hint = 'الوصفة وصلت بشكلٍ غلط — سكّرها وافتحها من جديد';
  end if;
  if jsonb_array_length(p_lines) > 40 then
    raise exception 'recipe_too_many' using hint = 'الوصفة أكثر من ٤٠ مادة — شيل اللي ما تنصرف بكل مرّة';
  end if;
  for v_e in select x from jsonb_array_elements(p_lines) x loop
    v_i := v_i + 1;
    v_raw := case when jsonb_typeof(v_e) = 'object' and jsonb_typeof(v_e->'product_id') = 'string' then v_e->>'product_id' end;
    v_u := case when jsonb_typeof(v_e) <> 'object' then null
                when jsonb_typeof(v_e->'unit') is null or jsonb_typeof(v_e->'unit') = 'null' or v_e->>'unit' = '' then 'stock'
                when jsonb_typeof(v_e->'unit') = 'string' then v_e->>'unit' end;
    v_q := case when jsonb_typeof(v_e) = 'object' and jsonb_typeof(v_e->'qty') in ('number', 'string')
                     and (v_e->>'qty') ~ c_dec then (v_e->>'qty')::numeric end;
    if v_raw is null or v_raw = '' or v_u is null or v_u not in ('stock', 'sub')
       or v_q is null or v_q <= 0 or v_q > 1000000 or v_q <> round(v_q, 3) then
      raise exception 'recipe_bad_line'
        using hint = format('السطر %s بالوصفة غلط — الكمية لازم أكبر من صفر وبثلاث مراتب عشرية أقصى', v_i);
    end if;
    if lower(v_raw) = any(v_seen) then
      raise exception 'recipe_duplicate' using hint = format('المادة بالسطر %s مكرّرة بالوصفة — اجمعها بسطر واحد', v_i);
    end if;
    v_seen := v_seen || lower(v_raw);
    v_p := null;
    if v_raw ~* c_uuid then
      select * into v_p from products where id = v_raw::uuid and clinic_id = v_clinic;
    end if;
    if v_p.id is null then
      raise exception 'recipe_product_missing'
        using hint = format('المادة بالسطر %s مو موجودة بمخزن العيادة (يمكن انحذفت) — رجّعها من المحذوفات أو شيلها', v_i);
    end if;
    if coalesce(v_p.pooled, false) then
      raise exception 'recipe_pooled' using hint = format('«%s» رصيدها بمخزون القسم — ما تنخصم كمستهلك', v_p.name);
    end if;
    if v_p.farm_id is not null then
      raise exception 'recipe_farm' using hint = format('«%s» من مخزن الحقل — ما تنخصم كمستهلك للعيادة', v_p.name);
    end if;
    if v_u = 'sub' and not (coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0) then
      raise exception 'recipe_no_sub_unit'
        using hint = format('«%s» تنحسب بالعلبة بس — افتح المادة وفعّل «الوحدة الصغيرة» واكتب كم بالعبوة', v_p.name);
    end if;
    v_d := case when v_u = 'sub' then v_p.units_per_box else 1 end;
    if public._cons_round_div(v_q, v_d, 9) = 0 then
      raise exception 'recipe_too_small'
        using hint = format('كمية «%s» صغيرة لدرجة ما تنخصم من الرصيد — كبّرها أو غيّر الوحدة', v_p.name);
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('p', v_p.id, 'n', v_p.name, 'q', v_q, 'u', v_u, 'pos', v_i - 1));
  end loop;

  -- نصُّ الوصفة كما كانت (للتدقيق)، ثم الاستبدال
  select string_agg(format('%s ×%s %s', coalesce(p.name, r.product_name), trim_scale(r.qty),
                           case when r.unit = 'sub' then coalesce(p.sub_unit_name, '')
                                when coalesce(p.sold_by_weight, false) then 'كغم' else 'علبة' end),
                    '، ' order by r.position, r.id)
    into v_old
    from clinic_service_recipe_items r
    left join products p on p.id = r.product_id and p.clinic_id = v_clinic
   where r.service_id = p_service and r.clinic_id = v_clinic;
  delete from clinic_service_recipe_items where service_id = p_service and clinic_id = v_clinic;
  insert into clinic_service_recipe_items (clinic_id, service_id, product_id, product_name, qty, unit, position, updated_at, updated_by)
  select v_clinic, p_service, (x->>'p')::uuid, x->>'n', (x->>'q')::numeric, x->>'u', (x->>'pos')::int, now(),
         case when platform_acting_clinic() is null then auth.uid() end
    from jsonb_array_elements(v_rows) x;
  if coalesce(p_clear_flat_cost, false) then
    update clinic_services set cost = null where id = p_service and clinic_id = v_clinic and cost is not null;
  end if;

  select md5(coalesce(string_agg(format('%s:%s:%s:%s', r.product_id, r.qty, r.unit, r.position), '|'
                                 order by r.position, r.id), '')),
         string_agg(format('%s ×%s %s', coalesce(p.name, r.product_name), trim_scale(r.qty),
                           case when r.unit = 'sub' then coalesce(p.sub_unit_name, '')
                                when coalesce(p.sold_by_weight, false) then 'كغم' else 'علبة' end),
                    '، ' order by r.position, r.id)
    into v_new_fp, v_new
    from clinic_service_recipe_items r
    left join products p on p.id = r.product_id and p.clinic_id = v_clinic
   where r.service_id = p_service and r.clinic_id = v_clinic;
  -- سطرُ تدقيقٍ واحد (سابقةُ 0239): لا يمنع الحفظَ أبداً. والنصّان ≤ ١٤٠ حرفاً — activity_brief (0152)
  -- يُسقط من __changed ما زاد على ٣٠٠ حرف فلا يظهر بالسجلّ أصلاً.
  if v_new_fp is distinct from v_fp then
    begin
      insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
      values (v_clinic, auth.uid(), 'UPDATE', 'clinic_services', p_service::text,
              jsonb_build_object('name', v_svc.name,
                '__changed', jsonb_build_object('recipe', jsonb_build_array(
                  case when length(v_old) > 140 then left(v_old, 139) || '…' else v_old end,
                  case when length(v_new) > 140 then left(v_new, 139) || '…' else v_new end))));
    exception when others then
      null; -- التدقيقُ لا يمنع العمليةَ الأصلية أبداً (كـaudit_change)
    end;
  end if;

  v_out := public.service_recipe_get(p_service);
  return jsonb_build_object('lines', v_out->'lines', 'fingerprint', v_out->'fingerprint');
end $$;
revoke all on function public.service_recipe_set(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.service_recipe_set(uuid, jsonb, text, boolean) to authenticated;

-- لكلّ خدمةٍ لها وصفة بهذه العيادة: عددُ سطورها، وكلفتُها لمرّةٍ واحدة بسعر اليوم، وكم سطراً لا يُخصم الآن.
create or replace function public.service_recipe_summary()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select coalesce(jsonb_object_agg(s.service_id::text, jsonb_build_object('lines', s.n, 'cost', s.cost, 'broken', s.broken)), '{}'::jsonb)
    into v
    from (
      select x.service_id, count(*)::int as n,
             coalesce(sum(x.per_value) filter (where x.problem is null), 0) as cost,
             (count(*) filter (where x.problem is not null))::int as broken
        from (
          select r.service_id, pr.problem,
                 case when pr.problem is null
                      then public._cons_round_div(r.qty * public.stock_unit_cost(p),
                                                  case when r.unit = 'sub' then p.units_per_box else 1 end, 2) end as per_value
            from clinic_service_recipe_items r
            join clinic_services cs on cs.id = r.service_id and cs.clinic_id = v_clinic
            left join products p on p.id = r.product_id and p.clinic_id = v_clinic
            left join products_trash t on p.id is null and t.id = r.product_id and t.clinic_id = v_clinic
            cross join lateral (select case
                     when p.id is null then (case when t.id is not null then 'in_trash' else 'product_gone' end)
                     when p.farm_id is not null then 'farm_stock'
                     when coalesce(p.pooled, false) then 'pooled'
                     when r.unit = 'sub' and not (coalesce(p.has_sub_unit, false) and coalesce(p.units_per_box, 0) > 0) then 'no_sub_unit'
                   end as problem) pr
           where r.clinic_id = v_clinic) x
       group by x.service_id) s;
  return v;
end $$;
revoke all on function public.service_recipe_summary() from public, anon;
grant execute on function public.service_recipe_summary() to authenticated;

-- ── ٧) القراءات ──────────────────────────────────────────────────────────
-- لكلّ فاتورةٍ (≤ ٥٠): مواصفاتُ كلّ سطرٍ بحيّها، وما رجع منها للمخزن = T(أعلى كميةٍ وصلها السطر) ناقصَ
-- الحيّ (كلُّ حدثٍ يترك الحيَّ عند T(line_qty) بالضبط)، والعجز؛ وتخطّياتُها؛ وكلُّ مادّةٍ مسّتها (سطرَ
-- مادّةٍ أو مستهلكاً) ورصيدُها الآن تحت الصفر. فاتورةٌ حُذفت وبقي دفترُها تُقرأ كذلك.
-- وما فعله **فعلٌ واحد**: restored_qty تراكميّ (إرجاعٌ ثانٍ كان يُقال بمجموع الاثنين، وسندُ الهدر يُعبّأ بما
-- شُطب)، فلكلّ مواصفةٍ moves = كلُّ أحداثها بترتيب (created_at, id) → {at_us, qty} — بلا تصفيةٍ ولا سقف، من
-- نفس الصفوف التي يُجمع منها live_qty (Σ moves.qty = live_qty بتسع منازل؛ والواجهةُ تعدّ الفرقَ فشلَ قراءة).
-- at_us = _cons_at_us(created_at): أحداثُ المعاملة الواحدة رقمٌ واحد = دفعةُ الفعل. ولكلّ فاتورة now_us
-- (لحظةُ هذه القراءة بنفس التعبير)، وwaste: سطورُ سند الهدر المسجّلة منها — تملؤها 0254 (أعمدتُها هناك)،
-- وهنا [] دائماً فالشكلُ ثابتٌ من اليوم. ولكلّ مواصفةٍ ولكلّ مادّةٍ سالبة by_weight (products.sold_by_weight لحظةَ
-- القراءة): وحدةُ مخزون الموزون كيلو لا علبة، فالإشعارُ يقول «كغ» — وكلُّ حقلٍ قبله كما كان معنىً وترتيباً.
-- والأسماءُ تُرتَّب بالبايت (collate "C") ثمّ بالمعرّف، كالمرآة التجريبية: الترتيبُ الافتراضيّ يتبع لغةَ القاعدة (C بالحزمة،
-- ولغةُ الخادم بالإنتاج) فقائمةٌ واحدة كانت تُقرأ بترتيبين — وكذلك report_consumables وstock_count_decide (0254).
create or replace function public.invoice_consumption_get(p_invoice_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if coalesce(cardinality(p_invoice_ids), 0) > 50 then
    raise exception 'too_many' using hint = 'أكثر من ٥٠ فاتورة بطلبٍ واحد — قسّم الطلب';
  end if;
  with ids as (
    select distinct x as id from unnest(coalesce(p_invoice_ids, '{}'::uuid[])) x where x is not null
  ),
  known as (
    select ids.id from ids
     where exists (select 1 from invoices i where i.id = ids.id and i.clinic_id = v_clinic)
        or exists (select 1 from invoice_consumption c where c.invoice_id = ids.id and c.clinic_id = v_clinic)
        or exists (select 1 from invoice_consumption_skips k where k.invoice_id = ids.id and k.clinic_id = v_clinic)
  ),
  ev as (
    select c.* from invoice_consumption c join known on known.id = c.invoice_id where c.clinic_id = v_clinic
  ),
  sp as (
    select e.invoice_id, e.item_id, e.spec_id,
           (array_agg(e.product_id order by e.created_at desc, e.id desc))[1] as product_id,
           (array_agg(e.product_name order by e.created_at, e.id))[1] as product_name,
           (array_agg(e.unit order by e.created_at, e.id))[1] as unit,
           (array_agg(e.unit_label order by e.created_at, e.id))[1] as unit_label,
           (array_agg(e.per_qty order by e.created_at, e.id))[1] as per_qty,
           (array_agg(e.per_div order by e.created_at, e.id))[1] as per_div,
           (array_agg(e.source order by e.created_at, e.id))[1] as source,
           (array_agg(e.note order by e.created_at desc, e.id desc))[1] as note,
           sum(e.qty) as live_qty, sum(e.value) as live_value, sum(e.shortfall) as shortfall,
           max(e.line_qty) as peak_line, min(e.created_at) as first_at,
           jsonb_agg(jsonb_build_object('at_us', public._cons_at_us(e.created_at), 'qty', e.qty)
                     order by e.created_at, e.id) as moves
      from ev e group by e.invoice_id, e.item_id, e.spec_id
  ),
  -- by_weight: products.sold_by_weight لحظةَ القراءة للمادّة التي تُقرأ بها المواصفة (product_id: الدمجُ نقل مواصفاتِ
  -- التوأم لأصله) — حيّةً، وإلا صورةُ الأصل الحيّ إن كانت بالمحذوفات مدموجةً (merged_into)، وإلا صورتُها هي بالمحذوفات،
  -- وnull لمادّةٍ ذهبت كلّياً. الواجهةُ تقول به «كغ» لا «علبة» (وحدةُ مخزون الموزون الكيلو)؛ وصورةٌ أقدمُ من العمود (0124)
  -- بلا المفتاح: false، افتراضُه يومها. والانضمامُ بالمفتاح الأساسيّ (products.id، products_trash.id): لا يكرّر مواصفة.
  items as (
    select s.invoice_id, s.item_id,
           jsonb_agg(jsonb_build_object(
             'spec_id', s.spec_id, 'product_id', s.product_id, 'product_name', s.product_name, 'unit', s.unit,
             'unit_label', s.unit_label, 'per_qty', s.per_qty, 'per_div', s.per_div,
             'live_qty', s.live_qty, 'live_value', s.live_value,
             'restored_qty', greatest(public._cons_round_div(s.peak_line * s.per_qty, s.per_div, 9) - s.live_qty, 0),
             'shortfall', s.shortfall, 'note', s.note, 'source', s.source, 'moves', s.moves,
             'by_weight', (case when p.id is not null then p.sold_by_weight
                                when pk.id is not null then pk.sold_by_weight
                                when t.id is not null then coalesce((t."row"->>'sold_by_weight')::boolean, false) end))
             order by s.first_at, s.product_name collate "C", s.spec_id) as specs
      from sp s
      left join products p on p.id = s.product_id and p.clinic_id = v_clinic
      left join products_trash t on p.id is null and t.id = s.product_id and t.clinic_id = v_clinic
      left join products pk on t.merged_into is not null and pk.id = t.merged_into and pk.clinic_id = v_clinic
     group by s.invoice_id, s.item_id
  ),
  by_inv as (
    select i.invoice_id, jsonb_object_agg(i.item_id::text, i.specs) as items from items i group by i.invoice_id
  ),
  sk as (
    select k.invoice_id, jsonb_agg(jsonb_build_object(
             'item_id', k.item_id, 'note', k.note, 'product_id', k.product_id, 'product_name', k.product_name,
             'qty', k.qty, 'unit', k.unit, 'line_name', k.line_name, 'source', k.source)
             order by k.created_at, k.item_id, k.product_name collate "C") as skips
      from invoice_consumption_skips k join known on known.id = k.invoice_id
     where k.clinic_id = v_clinic
     group by k.invoice_id
  ),
  touched as (
    select ii.invoice_id, ii.product_id from invoice_items ii join known on known.id = ii.invoice_id
     where ii.clinic_id = v_clinic and ii.product_id is not null
    union
    select e.invoice_id, e.product_id from ev e
  ),
  neg as (
    select t.invoice_id, jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'stock', p.stock,
                                                      'by_weight', p.sold_by_weight)
                                   order by p.name collate "C", p.id) as negatives
      from touched t join products p on p.id = t.product_id and p.clinic_id = v_clinic
     where p.stock < 0
     group by t.invoice_id
  )
  select coalesce(jsonb_object_agg(k.id::text, jsonb_build_object(
           'items', coalesce(b.items, '{}'::jsonb),
           'skips', coalesce(sk.skips, '[]'::jsonb),
           'negatives', coalesce(ng.negatives, '[]'::jsonb),
           'now_us', public._cons_at_us(now()),
           'waste', '[]'::jsonb)), '{}'::jsonb)
    into v
    from known k
    left join by_inv b on b.invoice_id = k.id
    left join sk on sk.invoice_id = k.id
    left join neg ng on ng.invoice_id = k.id;
  return v;
end $$;
revoke all on function public.invoice_consumption_get(uuid[]) from public, anon;
grant execute on function public.invoice_consumption_get(uuid[]) to authenticated;

-- بطاقاتُ تقرير الجرد (§9): فواتيرُ غيرُ مرجَّعة بيومها (created_at) بمدّة ١–٤٠٠ يوم. لكلّ مادّة: ما
-- انصرف صافياً وقيمتُه وعجزُه (مرّةً لكلّ فاتورةٍ ومادّة بآخر حالها — أدناه) وبكم سطر؛ والتعديلاتُ على الوصفة (من ومتى
-- وبأيّ مواد، وby_owner لصاحب العيادة — وتعديلٌ صفّرها، override_none، يُعدّ مرّةً موادُّه []: صفُّه الأصليّ مصدرُه
-- 'override' ونسخةُ الربط 'relink')؛ وما بيع بلا خصم (جهازٌ قديم، خدمةٌ مجهولة). jsonb واحد: لا سقفَ ألف صفّ ولا قائمةَ ناقصة.
create or replace function public.report_consumables(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if p_from is null or p_to is null or p_to - p_from < interval '1 day' or p_to - p_from > interval '400 days' then
    raise exception 'range_bad' using hint = 'المدّة لازم بين يوم و٤٠٠ يوم — اختر المدّة من جديد';
  end if;
  with inv as (
    select i.id, i.created_at from invoices i
     where i.clinic_id = v_clinic and i.created_at >= p_from and i.created_at < p_to
       and i.status is distinct from 'refunded'
  ),
  ev as (
    select c.*, inv.created_at as sold_at from invoice_consumption c join inv on inv.id = c.invoice_id
     where c.clinic_id = v_clinic
  ),
  per_line as (select e.product_id, e.item_id, sum(e.qty) as q from ev e group by e.product_id, e.item_id),
  -- العجزُ مرّةً لكلّ (فاتورة، مادّة) بآخر حالها، لا مجموعُ أحداثها. القاعدة: كلُّ إرجاعٍ يردّ أوّلاً آخرَ ما صُرف بلا رصيد —
  -- مجموعٌ جارٍ لا ينزل تحت الصفر: العجزُ = آخرُه ناقصَ أدنى ما بلغه (والصفرُ أوّلُه)؛ صرفُ ٢ على ٠٫٥ ثمّ مرتجعُ ١ ⇒ ٠٫٥.
  -- والدفعةُ الواحدة (created_at) خطوتان بترتيب ما يجري فيها: (١) نقلُها — إرجاعُ مواصفاتٍ وُلدت قبلها (محفّزُ الحذف
  -- بالتعديل، المرتجع، الترجيع) وصرفُها **صافياً**: ما زاد صرفُها على ما ردّته يضيف عجزَ صرفها (لا أكثرَ من الزيادة)، وما
  -- نقص يردّ. فالتعديلُ — يردّ السطرَ ويعيده بالربط بنفس الدفعة — نقلٌ لا مرتجعٌ ثمّ بيعة: كان بلا تغييرٍ يكتب العجزَ ثانيةً
  -- ورصيدُ المادّة سالب (قيسَ: صرفُ ١ على ٠٫٥ ثمّ تعديلٌ ⇒ ١٫٠٠٠ لا ٠٫٥٠٠؛ ومادّةٌ أنزلتها فاتورةٌ أخرى ⇒ ٤ لا ٣)، ويمحوه
  -- إن غطّاه شراءٌ بعده (٢٫٠٠٠ ⇒ صفر). (٢) إرجاعُ مواصفاتٍ وُلدت فيها (بيعةٌ ومرتجعٌ بمعاملةٍ واحدة) بعد صرفها.
  -- والمعرّفاتُ العشوائية لا تقرّر العجز: الخطوةُ صافيةٌ لكلّ (فاتورة، مادّة) لا لكلّ مواصفة.
  sf_born as (select e.spec_id, min(e.created_at) as at from ev e group by e.spec_id),
  sf_step as (
    select e.invoice_id, e.product_id, e.created_at as at,
           (case when e.kind = 'restore' and b.at = e.created_at then 2 else 1 end) as g,
           sum(case when e.kind = 'use' then e.posted else 0 end) as u,
           sum(case when e.kind = 'use' then e.shortfall else 0 end) as f,
           sum(case when e.kind = 'restore' then e.posted else 0 end) as r
      from ev e join sf_born b on b.spec_id = e.spec_id
     group by e.invoice_id, e.product_id, e.created_at, 4
  ),
  sf_run as (
    select s.invoice_id, s.product_id, d.dx,
           sum(d.dx) over (partition by s.invoice_id, s.product_id order by s.at, s.g) as run
      from sf_step s
      cross join lateral (select (case when s.u + s.r >= 0 then least(s.f, s.u + s.r) else s.u + s.r end) as dx) d
  ),
  sf_prod as (
    select x.product_id, sum(x.short) as short
      from (select r.invoice_id, r.product_id, sum(r.dx) - least(min(r.run), 0) as short
              from sf_run r group by r.invoice_id, r.product_id) x
     group by x.product_id
  ),
  per_prod as (
    select e.product_id, sum(e.qty) as used, sum(e.value) as value,
           (array_agg(e.product_name order by e.created_at desc, e.id desc))[1] as snap
      from ev e group by e.product_id
  ),
  prods as (
    select pp.product_id, coalesce(p.name, pp.snap) as name, pp.used, pp.value, coalesce(f.short, 0.000) as short,
           (select count(*) from per_line l where l.product_id = pp.product_id and l.q > 0)::int as lines
      from per_prod pp
      left join sf_prod f on f.product_id = pp.product_id
      left join products p on p.id = pp.product_id and p.clinic_id = v_clinic
     where pp.used <> 0 or pp.value <> 0 or coalesce(f.short, 0) <> 0
  ),
  ov_rows as (
    select e.invoice_id, e.item_id, e.sold_at, e.service_id, e.product_name, e.created_by, e.created_at
      from ev e where e.source = 'override'
    union all
    select k.invoice_id, k.item_id, inv.created_at, k.service_id, k.product_name, k.created_by, k.created_at
      from invoice_consumption_skips k join inv on inv.id = k.invoice_id
     where k.clinic_id = v_clinic and k.source = 'override'
  ),
  ov as (
    select o.invoice_id, o.item_id, min(o.sold_at) as sold_at,
           (array_agg(o.service_id) filter (where o.service_id is not null))[1] as svc,
           coalesce(jsonb_agg(distinct o.product_name collate "C") filter (where o.product_name is not null), '[]'::jsonb) as products,
           (array_agg(o.created_by order by o.created_at) filter (where o.created_by is not null))[1] as by_user
      from ov_rows o group by o.invoice_id, o.item_id
  ),
  -- by_owner: كتبه صاحبُ العيادة — معرّفُه هو معرّفُ العيادة (auth_clinic() يرجع auth.uid() لمن لا عضويةَ له، 0151)
  -- ولا صفَّ كادرٍ له، فبطاقتُه تقول «صاحب العيادة» لا «موظف». والكادرُ false، ومشغّلُ المنصّة false وby_name فارغ:
  -- كاتبُه فارغٌ أصلاً (0151) — لا أثرَ جديد ولا إخفاءَ جديد.
  ovr as (
    select ov.invoice_id, ov.sold_at, ov.products,
           coalesce(cs.name, ii.name, '') as service_name,
           (select s.name from staff s where s.user_id = ov.by_user and s.clinic_id = v_clinic limit 1) as by_name,
           coalesce(ov.by_user = v_clinic, false) as by_owner
      from ov
      left join clinic_services cs on cs.id = ov.svc and cs.clinic_id = v_clinic
      left join invoice_items ii on ii.id = ov.item_id and ii.clinic_id = v_clinic
  ),
  lsk as (
    -- الربطُ يعيد كتابةَ التخطّي على السطر الجديد تاريخاً — يُعدّ مرّةً بأصله
    select k.invoice_id, inv.created_at as sold_at, k.line_name, k.note
      from invoice_consumption_skips k join inv on inv.id = k.invoice_id
     where k.clinic_id = v_clinic and k.note in ('old_device', 'service_missing') and k.source <> 'relink'
  )
  select jsonb_build_object(
           'products', coalesce((select jsonb_agg(jsonb_build_object('product_id', d.product_id, 'name', d.name,
                                   'used', d.used, 'value', d.value, 'short', d.short, 'lines', d.lines)
                                   order by d.value desc, d.name collate "C", d.product_id) from prods d), '[]'::jsonb),
           'short_products', (select count(*) from prods d where d.short > 0)::int,
           'overrides', jsonb_build_object(
              'count', (select count(*) from ovr)::int,
              'recent', coalesce((select jsonb_agg(jsonb_build_object('invoice_id', z.invoice_id, 'created_at', z.sold_at,
                                    'service_name', z.service_name, 'products', z.products, 'by_name', z.by_name,
                                    'by_owner', z.by_owner)
                                    order by z.sold_at desc, z.invoice_id)
                                  from (select * from ovr order by sold_at desc, invoice_id limit 200) z), '[]'::jsonb)),
           'unconsumed', jsonb_build_object(
              'old_device', (select count(*) from lsk where note = 'old_device')::int,
              'service_missing', (select count(*) from lsk where note = 'service_missing')::int,
              'recent', coalesce((select jsonb_agg(jsonb_build_object('invoice_id', z.invoice_id, 'created_at', z.sold_at,
                                    'line_name', z.line_name, 'note', z.note)
                                    order by z.sold_at desc, z.invoice_id)
                                  from (select * from lsk order by sold_at desc, invoice_id limit 200) z), '[]'::jsonb)))
    into v;
  return v;
end $$;
revoke all on function public.report_consumables(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_consumables(timestamptz, timestamptz) to authenticated;

-- ── ٨) إعادةُ التعريف — نصُّ المصدر حرفاً وفوقه أسطرٌ معلَّمة (`-- +0252` / `-- -0252 …`) ─────────
-- البيعة: نصُّ 0242 حرفاً. الخطّةُ بعد فحص الإعادة وكتلة التأريخ وقبل الحلقة الأولى — فالإعادةُ لا
-- تخطّط ولا تقفل ولا ترفض ولا تكتب تخطّياً، وكلُّ رفضٍ قبل أيّ كتابة. كلفةُ المخطَّط بالحلقة الأولى
-- (cost_total صحيحٌ لحظةَ إدراج الفاتورة — لا تحديثَ ثانٍ يكتب «تعديل» كاذباً)، والسطرُ يُدرج بها
-- وبـservice_id، والاستهلاكُ بعد آخر سطر (كلُّ سطور المواد خصمت قبله) داخل كتلة الخرق الفريد.
create or replace function public.retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  it         jsonb;
  v_qty      numeric(14,3);
  v_stockq   numeric(14,3);
  v_fp       numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_cost     numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_dtype    text    := nullif(p_meta->>'discount_type','');
  v_dinput   numeric(12,2) := coalesce(nullif(p_meta->>'discount_value','')::numeric, 0);
  v_discount numeric(14,2) := 0;
  v_total    numeric(14,2);
  v_final    numeric(14,2) := nullif(p_meta->>'final_total','')::numeric;
  v_paid     numeric(14,2);
  -- مرجعُ المحاولة: يولّده الجهاز مرّةً، ويثبت عبر كل إعادة.
  v_ref      text := nullif(btrim(p_meta->>'client_ref'), '');
  -- نوعُ البيع: تجزئة (الافتراض) أو جملة. غيرُ المعروف يسقط إلى تجزئة —
  -- عميلٌ قديم لا يرسل الحقل يبقى يعمل كما هو حرفاً بحرف.
  v_kind     text := case when lower(nullif(btrim(p_meta->>'sale_kind'), '')) = 'wholesale'
                          then 'wholesale' else 'retail' end;
  v_details  jsonb := case
                        when jsonb_typeof(p_meta->'payment_details') = 'array'
                             and jsonb_array_length(p_meta->'payment_details') > 0
                        then p_meta->'payment_details'
                        else null
                      end;
  -- 0242: لحظةُ بيعٍ سابقة (يرسلها الجهاز لفاتورةٍ نُسيت) وتوقيتُه لحساب «اليوم».
  -- غائبةٌ = بيعُ الآن، حرفاً كما كان.
  v_sale_raw text := nullif(btrim(p_meta->>'sale_at'), '');
  v_tz       text := coalesce(nullif(btrim(p_meta->>'sale_tz'), ''), 'Asia/Baghdad');
  v_at       timestamptz;
  v_today    date;
  v_day      date;
  -- 0252: خطّةُ المستهلكات (_consumption_plan)، وسطرُها، وكلفةُ السطر، ومعرّفاتُ السطور المدرجة. -- +0252
  v_plan     jsonb;                                                                  -- +0252
  v_pl       jsonb;                                                                  -- +0252
  v_n        int := 0;                                                               -- +0252
  v_uc       numeric;                                                                -- +0252
  v_item     uuid;                                                                   -- +0252
  v_ids      jsonb := '{}'::jsonb;                                                   -- +0252
  v_ap       record;                                                                 -- +0252
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  -- إعادةٌ لبيعةٍ سُجّلت سلفاً: تُرجَع كما هي، بلا فاتورةٍ ثانية ولا خصمٍ ثانٍ.
  -- **قبل** فحص التاريخ: بيعةٌ مؤرَّخةٌ ثبتت وضاع جوابُها لا تُرفض عند إعادتها.
  if v_ref is not null then
    select * into v_invoice from invoices
     where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_invoice; end if;
  end if;

  if v_sale_raw is not null then
    if platform_acting_clinic() is not null then
      raise exception 'backdate_operator_not_allowed'
        using hint = 'مشغّلُ المنصّة لا يسجّل فواتير بيومٍ سابق داخل عيادة — سطرُ مالٍ يسمّي شخصاً من كادرها.';
    end if;
    if coalesce(auth_role(), '') <> 'manager' then
      raise exception 'backdate_not_allowed'
        using hint = 'تسجيلُ فاتورةٍ بيومٍ سابق للمدير — افتح وضعَ المدير برمزه.';
    end if;
    begin
      v_at := v_sale_raw::timestamptz;
    exception when others then
      raise exception 'sale_at_invalid' using hint = 'تاريخُ المبيع مو مفهوم — اختاره من جديد.';
    end;
    -- توقيتٌ مجهول يسقط لبغداد — كتقارير 0149 (p_tz)، لا رفضٌ لبيعةٍ صحيحة بسبب جهاز.
    begin
      v_today := (now() at time zone v_tz)::date;
    exception when others then
      v_tz := 'Asia/Baghdad';
      v_today := (now() at time zone v_tz)::date;
    end;
    v_day := (v_at at time zone v_tz)::date;
    if v_at > now() or v_day >= v_today then
      raise exception 'sale_day_not_past'
        using hint = 'تاريخُ المبيع لازم يومٌ قبل اليوم — فاتورةُ اليوم تنسجّل بدون تاريخ.';
    end if;
    if v_day < v_today - 7 then
      raise exception 'backdate_window'
        using hint = 'أقدمُ يومٍ يُقبل قبل ٧ أيام — فاتورةٌ أقدم تحتاج قرارَ صاحب العيادة.';
    end if;
    -- سِيَقُ البيعة تُؤرَّخ بالفاتورة: ساقٌ بـ`at` «هسّة» كانت تنزل بمقبوضات اليوم.
    if v_details is not null then
      select jsonb_agg(case when jsonb_typeof(l) = 'object' then l - 'at' else l end)
        into v_details
        from jsonb_array_elements(v_details) l;
    end if;
  end if;

  -- 0252: خطّةُ المستهلكات — بعد فحص الإعادة وكتلة التأريخ وقبل أيّ كتابة: كلُّ رفضٍ فيها بلا أثر، -- +0252
  -- وتقفل كلَّ مادّةٍ تمسّها السلّة بالمعرّف. السطرُ المخطَّط كلفتُه من الخادم لا من الجهاز. -- +0252
  v_plan := _consumption_plan(v_clinic, p_items);                                     -- +0252

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    v_subtotal := v_subtotal + v_qty * (it->>'unit_price')::numeric;
-- -0252     v_cost     := v_cost     + v_qty * (it->>'unit_cost')::numeric;
    v_n  := v_n + 1;                                                                  -- +0252
    v_pl := v_plan->'lines'->(v_n::text);                                             -- +0252
    v_uc := case when coalesce((v_pl->>'planned')::boolean, false) then (v_pl->>'uc')::numeric   -- +0252
                 else (it->>'unit_cost')::numeric end;                                -- +0252
    v_cost     := v_cost     + v_qty * v_uc;                                          -- +0252
    v_count    := v_count    + v_qty;
  end loop;

  if v_final is not null then
    v_total    := greatest(0, v_final);
    v_discount := greatest(0, v_subtotal - v_total);
    v_dtype    := case when v_discount > 0 then 'fixed' else null end;
  elsif v_dtype = 'percent' then
    v_discount := round(v_subtotal * least(greatest(v_dinput, 0), 100) / 100.0, 2);
    v_total    := greatest(0, v_subtotal - v_discount);
  elsif v_dtype = 'fixed' then
    v_discount := least(greatest(v_dinput, 0), v_subtotal);
    v_total    := greatest(0, v_subtotal - v_discount);
  else
    v_discount := 0; v_dtype := null;
    v_total    := greatest(0, v_subtotal);
  end if;

  v_paid := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);

  -- كتلةٌ بمعالج: خرقُ الفهرس الفريد يعني أن نسخةً متزامنة سبقتنا، فيتراجع
  -- كل ما كتبناه (الفاتورة وبنودها وخصمُ المخزون) ونُرجع فاتورتها هي.
  begin
    insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit,
                          item_count, customer_name, customer_phone, pet_name, payment_method, payment_details,
                          staff_id, notes, status, client_ref, sale_kind, created_at, recorded_at)
    values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
            round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
            nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
            nullif(p_meta->>'staff_id','')::uuid, nullif(p_meta->>'notes',''), 'paid', v_ref, v_kind,
            coalesce(v_at, now()), case when v_at is not null then now() end)
    returning * into v_invoice;

    v_n := 0;                                                                         -- +0252
    for it in select * from jsonb_array_elements(p_items) loop
      v_qty    := (it->>'qty')::numeric;
      v_n  := v_n + 1;                                                                -- +0252
      v_pl := v_plan->'lines'->(v_n::text);                                           -- +0252
      v_uc := case when coalesce((v_pl->>'planned')::boolean, false) then (v_pl->>'uc')::numeric   -- +0252
                   else (it->>'unit_cost')::numeric end;                              -- +0252
      v_stockq := coalesce(nullif(it->>'stock_qty','')::numeric, v_qty);
      v_fp     := 0;
      if nullif(it->>'product_id','') is not null then
        if v_stockq > 0 then
          v_fp := deduct_stock_pooled((it->>'product_id')::uuid, v_stockq, v_clinic);
        elsif v_stockq < 0 then
          perform credit_stock((it->>'product_id')::uuid, -v_stockq, v_clinic);
        end if;
      end if;
      -- البندُ بتاريخ فاتورته (0133) — والمؤرَّخةُ بيومها لا بيوم إدخالها.
-- -0252       insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, created_at)
      insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, created_at, service_id)   -- +0252
      values (
        v_invoice.id, v_clinic,
        nullif(it->>'product_id','')::uuid,
        coalesce(it->>'name', 'Item'),
        it->>'barcode',
        v_qty,
        (it->>'unit_price')::numeric,
-- -0252         (it->>'unit_cost')::numeric,
        v_uc,                                                                         -- +0252
        v_qty * (it->>'unit_price')::numeric,
        v_stockq,
        v_fp,
        nullif(it->>'unit_label',''),
-- -0252         v_invoice.created_at
-- -0252       );
        v_invoice.created_at,                                                         -- +0252
        nullif(v_pl->>'svc','')::uuid                                                 -- +0252
      ) returning id into v_item;                                                     -- +0252
      v_ids := v_ids || jsonb_build_object(v_n::text, jsonb_build_object('i', v_item, 'q', v_qty));   -- +0252
    end loop;
    -- 0252: الاستهلاكُ بعد آخر سطر — كلُّ سطور المواد خصمت قبله — وبنفس الكتلة: خرقُ الإعادة -- +0252
    -- المتزامنة يتراجع عن الدفتر والتخطّي والمرحَّل والرصيد معاً. ثم تخطّياتُ السطور (source 'none'). -- +0252
    for v_ap in select l.key::int as n, l.value as pl                                 -- +0252
                  from jsonb_each(coalesce(v_plan->'lines', '{}'::jsonb)) l           -- +0252
                 where coalesce((l.value->>'planned')::boolean, false)                -- +0252
                 order by 1 loop                                                      -- +0252
      perform _consumption_apply(v_clinic, v_invoice.id, (v_ids->(v_ap.n::text)->>'i')::uuid,   -- +0252
                                 (v_ids->(v_ap.n::text)->>'q')::numeric, v_ap.pl);    -- +0252
    end loop;                                                                         -- +0252
    insert into invoice_consumption_skips (clinic_id, invoice_id, item_id, service_id, line_name, line_qty, note, source,   -- +0252
                                           created_by)                                -- +0252
    select v_clinic, v_invoice.id, (v_ids->(s->>'n')->>'i')::uuid, nullif(s->>'svc','')::uuid,   -- +0252
           coalesce(s->>'name', 'Item'), (v_ids->(s->>'n')->>'q')::numeric, s->>'note', 'none',   -- +0252
           (case when platform_acting_clinic() is null then auth.uid() end)           -- +0252
      from jsonb_array_elements(coalesce(v_plan->'line_skips', '[]'::jsonb)) s;       -- +0252
  exception when unique_violation then
    -- لا نبلع كل خرقٍ فريد: إن لم يكن مرجعُنا هو السبب، فالخطأ حقيقيّ ويُرفع.
    if v_ref is null then raise; end if;
    select * into v_invoice from invoices
     where clinic_id = v_clinic and client_ref = v_ref;
    if not found then raise; end if;
    return v_invoice;
  end;

  return v_invoice;
end $function$;
revoke all on function public.retail_checkout(jsonb, jsonb) from public, anon;
grant execute on function public.retail_checkout(jsonb, jsonb) to authenticated;

-- التعديل: نصُّ 0241 حرفاً. يحذف السطورَ ويعيدها بلا معرّفات، فيُربط كلُّ سطرِ خدمةٍ بسابقه بمعرّفه
-- (`id` يرسله DeliveryEditDialog اليوم): قفلُ المنتجات بعد قفل الفاتورة (ومعها موادُّ السطور الجديدة)،
-- ولقطةُ service_id قبل الحذف، ومعرّفٌ مكرّرٌ يُرفض، والربطُ **بعد** حلقة الإدراج كلِّها (المواد خصمت
-- قبله). محفّزُ الحذف ردّ القديم، والربطُ يصرف الجديد بالقيم المجمَّدة. داخليّةٌ بلا منح كما تركتها 0113.
-- واثنتان بالقياس (الحزمة، ٣١/١٠): الكميةُ تُقرَّب لثلاث منازل عند القراءة — كما يحفظها العمود — فلا يبقى
-- الدفترُ حيّاً على ١٫٠٠٠٤ والسطرُ ١٫٠٠٠ (live_vs_line) ولا يُدرج سطرُ ٠٫٠٠٠٤ صفراً فيسقط التعديلُ كلُّه بـ23514؛
-- وسطرُ المادّة يُخصم كالبيعة منذ 0253 (الحوضُ ما زاد على الرصيد الموجب، والرصيدُ الباقي ولو سالباً) بلا
-- «not enough stock» — فاتورةٌ أنزلت مادّةً تحت الصفر كانت لا تُحفظ حتى بلا تغيير، والسالبُ يُقال بقراءة
-- negatives لا برفض الحفظ (قرارُ المالك: لا منعَ ولا حصر).
create or replace function public.edit_invoice_lines_unguarded(p_invoice uuid, p_lines jsonb, p_note text default null)
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
  -- 0252: خدمةُ كلّ سطرٍ قبل الحذف، والسطرُ المدرج، والروابطُ (قديم ← جديد)، ومعرّفاتُ المصدر. -- +0252
  v_old_svc    jsonb;                                                                -- +0252
  v_new_item   uuid;                                                                 -- +0252
  v_relinks    jsonb := '[]'::jsonb;                                                 -- +0252
  v_seen       uuid[] := '{}';                                                       -- +0252
  v_rl         jsonb;                                                                -- +0252
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  -- 0241: قفلُ الصفّ — التعديلُ يكتب forgiven من قراءته، فلا يسبقه خصمٌ من جهازٍ آخر.
  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty invoice';
  end if;

  -- 0252: منتجاتُ الفاتورة (سطورُها ودفترُها) ومنتجاتُ السطور الجديدة تُقفل بالمعرّف قبل أوّل كتابةٍ -- +0252
  -- على رصيد — بترتيب البيعة، لا بترتيب السطور. -- +0252
  perform _invoice_lock_products(v_clinic, p_invoice,                                -- +0252
    (select coalesce(array_agg((e->>'product_id')::uuid), '{}'::uuid[])               -- +0252
       from jsonb_array_elements(p_lines) e where nullif(e->>'product_id','') is not null));   -- +0252

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

  -- 0252: خدمةُ كلّ سطرٍ قبل حذفه — السطرُ المعاد يرثها بمعرّفه، وإلا ضاع ما يربطه بوصفته. -- +0252
  select coalesce(jsonb_object_agg(id::text, service_id), '{}'::jsonb) into v_old_svc   -- +0252
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic and service_id is not null;   -- +0252
  delete from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ٢) إعادة الخصم: المعروف أولاً ثم مخزون القسم (نفس retail_checkout) ──
  for l in
    select
      nullif(e->>'product_id','')::uuid            as product_id,
      coalesce(e->>'name','')                      as name,
      nullif(e->>'barcode','')                     as barcode,
-- -0252       coalesce((e->>'qty')::numeric, 0)            as qty,
      round(coalesce((e->>'qty')::numeric, 0), 3)  as qty,                            -- +0252
      coalesce((e->>'unit_price')::numeric, 0)     as unit_price,
      coalesce((e->>'unit_cost')::numeric, 0)      as unit_cost,
      nullif(e->>'unit_label','')                  as unit_label,
-- -0252       coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in
      coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in,                  -- +0252
      case when e->>'id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (e->>'id')::uuid end as src_item   -- +0252
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
-- -0252         v_avail := round(coalesce(v_prod.stock, 0) + coalesce(v_pool, 0), 3);
-- -0252         if v_stock_qty > v_avail + 0.0005 then
-- -0252           raise exception 'not enough stock: %', l.name;
-- -0252         end if;
        -- 0252: كالبيعة منذ 0253 (deduct_stock_pooled) بلا رفض: الحوضُ يأخذ ما زاد على الرصيد الموجب، -- +0252
        -- والرصيدُ يعطي الباقي ولو صار سالباً — بكتابةٍ واحدة بعد الحوض، والعكسُ يردّ stock_qty − pooled_qty. -- +0252
        v_from_stock := least(v_stock_qty, greatest(coalesce(v_prod.stock, 0), 0));
-- -0252         if v_from_stock > 0 then
-- -0252           update products set stock = round(stock - v_from_stock, 3)
-- -0252             where id = l.product_id and clinic_id = v_clinic;
-- -0252         end if;
        if v_stock_qty - v_from_stock > 0 and v_prod.section_id is not null then
          v_from_pool := least(v_stock_qty - v_from_stock, greatest(coalesce(v_pool, 0), 0));
          if v_from_pool > 0 then
            update company_sections set pooled_stock = round(pooled_stock - v_from_pool, 3)
              where id = v_prod.section_id and clinic_id = v_clinic;
          end if;
        end if;
        if v_stock_qty - v_from_pool > 0 then                                          -- +0252
          update products set stock = round(coalesce(stock, 0) - (v_stock_qty - v_from_pool), 3)   -- +0252
            where id = l.product_id and clinic_id = v_clinic;                          -- +0252
        end if;                                                                        -- +0252
      end if;
    end if;

-- -0252     insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, service_id)   -- +0252
    values (v_clinic, p_invoice, l.product_id, l.name, l.barcode, l.qty, l.unit_price, l.unit_cost,
-- -0252             round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label);
            round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label,   -- +0252
            case when l.product_id is null then (v_old_svc->>(l.src_item::text))::uuid end)   -- +0252
    returning id into v_new_item;                                                    -- +0252
    -- 0252: سطرُ خدمةٍ بمعرّف سابقه يُربط به — ومعرّفٌ مرّتين يصرف موادَّه مرّتين، فيُرفض بصوت. -- +0252
    if l.product_id is null and l.src_item is not null then                          -- +0252
      if l.src_item = any(v_seen) then                                               -- +0252
        raise exception 'edit_line_twice'                                            -- +0252
          using hint = 'سطر الفاتورة مكرّر بالتعديل — سكّر النافذة وافتحها من جديد';   -- +0252
      end if;                                                                        -- +0252
      v_seen := v_seen || l.src_item;                                                -- +0252
      v_relinks := v_relinks || jsonb_build_array(jsonb_build_object('from', l.src_item, 'to', v_new_item, 'qty', l.qty));   -- +0252
    end if;                                                                          -- +0252

    v_subtotal := v_subtotal + round(l.qty * l.unit_price, 2);
    v_cost     := v_cost     + round(l.qty * l.unit_cost, 2);
    v_items    := v_items    + l.qty;
    v_new_count := coalesce(v_new_count, 0) + 1;
  end loop;

  if coalesce(v_new_count, 0) = 0 then raise exception 'empty invoice'; end if;

  -- 0252: الربطُ بعد حلقة الإدراج كلِّها (سطورُ المواد خصمت قبله): كلُّ مواصفةٍ للقديم تُنسخ بقيمها -- +0252
  -- المجمَّدة إلى كمية الجديد، وتخطّياتُه تُكتب عليه تاريخاً. محفّزُ الحذف ردّ القديم إلى صفر. -- +0252
  for v_rl in select x from jsonb_array_elements(v_relinks) x loop                     -- +0252
    perform _consumption_relink(v_clinic, p_invoice, (v_rl->>'from')::uuid, (v_rl->>'to')::uuid, (v_rl->>'qty')::numeric);   -- +0252
  end loop;                                                                          -- +0252

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
revoke all on function public.edit_invoice_lines_unguarded(uuid, jsonb, text) from public, anon, authenticated;

-- حركاتُ المادّة: نصُّ 0242 حرفاً وفوقه انضمامٌ جانبيّ على الدفتر — تغيّرُ رصيدٍ بلا سطرِ مادّةٍ بالفاتورة
-- وبجانبه حدثُ استهلاكٍ كتب بالرصيد خلال ٤ ثوانٍ: «مستهلكات» (أو «مستهلكات — إرجاع»)، ومرجعُه الفاتورة. والنافذةُ
-- مدىً على (product_id، created_at) يخدمه الفهرس (قيسَ: Index Cond بحدّي created_at لا Filter على ألفي حدث).
create or replace function public.product_movements(p_product uuid, p_limit int default 100)
returns table (
  at         timestamptz,
  kind       text,      -- open | purchase | purchase_edit | sale | return | consume | consume_return | adjust
  from_qty   numeric,
  to_qty     numeric,
  delta      numeric,
  ref_id     uuid,      -- معرّفُ الفاتورة التي فسّرت الحركة، وإلا فارغ
  actor_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    -- تغييراتُ الرصيد كما سجّلها المحفّز: كان ← صار، بلا حسابٍ من عندنا.
    select a.id, a.created_at, a.actor,
           (a.details->'__changed'->'stock'->>0)::numeric as f,
           (a.details->'__changed'->'stock'->>1)::numeric as t
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'UPDATE'
       and a.entity_id = p_product::text
       and a.details->'__changed' ? 'stock'
    union all
    -- الميلاد: الرصيدُ الذي وُلد به المنتج.
    select a.id, a.created_at, a.actor, null::numeric, (a.details->>'stock')::numeric
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'INSERT'
       and a.entity_id = p_product::text
  ),
  named as (
    select ev.id, ev.created_at, ev.actor, ev.f, ev.t,
           case
             when ev.f is null           then 'open'
             when pu.id  is not null     then 'purchase'
             when ped.id is not null     then 'purchase_edit'
             when inv.id is not null     then (case when coalesce(ev.t,0) >= coalesce(ev.f,0) then 'return' else 'sale' end)
             when cs.id is not null      then (case when coalesce(ev.t,0) >= coalesce(ev.f,0) then 'consume_return' else 'consume' end)   -- +0252
             else 'adjust'
           end as kind,
-- -0252           coalesce(pu.id, ped.id, inv.id) as ref_id
           coalesce(pu.id, ped.id, inv.id, cs.id) as ref_id                         -- +0252
      from ev
      -- **النافذةُ أربعُ ثوانٍ**: الحفظُ الواحد يكتب صفَّ الفاتورة وصفوفَ المنتجات بمعاملةٍ واحدة.
      left join lateral (
        select p.id from purchases p
         where p.clinic_id = auth_clinic()
           and abs(extract(epoch from (p.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi where pi.purchase_id = p.id and pi.product_id = p_product)
         order by abs(extract(epoch from (p.created_at - ev.created_at))) limit 1
      ) pu on true
      left join lateral (
        select (b.entity_id)::uuid as id from audit_log b
         where b.clinic_id = auth_clinic() and b.entity = 'purchases' and b.action = 'UPDATE'
           and abs(extract(epoch from (b.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi
                        where pi.purchase_id = (b.entity_id)::uuid and pi.product_id = p_product)
         order by abs(extract(epoch from (b.created_at - ev.created_at))) limit 1
      ) ped on true
      -- 0242: لحظةُ الإدخال لا يومُ البيع — المؤرَّخةُ يتغيّر رصيدُها حين تُدخل.
      left join lateral (
        select i.id from invoices i
         where i.clinic_id = auth_clinic()
           and abs(extract(epoch from (coalesce(i.recorded_at, i.created_at) - ev.created_at))) < 4
           and exists (select 1 from invoice_items ii where ii.invoice_id = i.id and ii.product_id = p_product)
         order by abs(extract(epoch from (coalesce(i.recorded_at, i.created_at) - ev.created_at))) limit 1
      ) inv on true
      -- 0252: مستهلكاتُ خدمةٍ كتبت بالرصيد (posted ≠ 0) خلال النافذة نفسها — بلحظة الحدث لا يوم البيع. -- +0252
      -- والنافذةُ مدىً على العمود المفهرَس (product_id، created_at) لا abs(extract(…)) < 4: تلك لا يخدمها فهرس، فكلُّ تغيّرِ -- +0252
      -- رصيدٍ يمسح كلَّ أحداث المادّة (تربيعيٌّ بحركات مادّةٍ تنصرف كلَّ يوم). وهي نفسُها بالضبط: |c − ev| < ٤ ثوانٍ ⟺ -- +0252
      -- ev − ٤ < c < ev + ٤ (الطرفان مفتوحان كما كانا، والفرقُ ميكروثانياتٌ صحيحة). -- +0252
      left join lateral (                                                            -- +0252
        select c.invoice_id as id from invoice_consumption c                         -- +0252
         where c.clinic_id = auth_clinic() and c.product_id = p_product and c.posted <> 0   -- +0252
           and c.created_at > ev.created_at - interval '4 seconds'                   -- +0252
           and c.created_at < ev.created_at + interval '4 seconds'                   -- +0252
         order by abs(extract(epoch from (c.created_at - ev.created_at))) limit 1    -- +0252
      ) cs on true                                                                   -- +0252
  )
  -- **وتُطوى الخطوةُ الوسطى** (عكسُ فاتورةٍ يكتب صفّين بنفس اللحظة).
  select n.created_at,
         min(n.kind),
         (array_agg(n.f order by n.id))[1],
         (array_agg(n.t order by n.id desc))[1],
         (array_agg(n.t order by n.id desc))[1] - coalesce((array_agg(n.f order by n.id))[1], 0),
         n.ref_id,
         coalesce(min(st.name), '')
    from named n
    left join lateral (
      select s.name from staff s where s.user_id = n.actor and s.clinic_id = auth_clinic() limit 1
    ) st on true
   group by n.created_at, n.ref_id
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.product_movements(uuid, int) from public, anon;
grant execute on function public.product_movements(uuid, int) to authenticated;

-- ── ٩) الفحص — أدواتُ تشغيلٍ (invoker، ولا تُمنح لأحد): بعد كلّ سيناريو بالحزمة، وبالإنتاج بعد النشر وأسبوعياً ──
-- verify_consumption() يجب أن ترجع صفراً:
--   spec_mismatch        أحداثُ مواصفةٍ واحدة تختلف بقيمها المجمَّدة.
--   live_vs_line         الحيُّ ≠ T(الهدف) أو ≠ V(الهدف) — الهدفُ صفرٌ لفاتورةٍ مرجَّعة أو سطرٍ غائب، وإلا max(qty, 0).
--   carry                Σ qty − Σ posted + ext_in − ext_out ≠ carry (بلا أحداث product_gone)، أو دفترٌ بلا مرحَّل.
--   product_gone         مادّةٌ لا مكانَ لها — للمراجعة.
--   line_below_materials سطرٌ حيٌّ كلفتُه أقلّ من كلفة موادّه بالدفتر (كتابةٌ مباشرة على unit_cost، هوّة M15).
-- والمتخطّى لا يُفحص: لا يتحرّك أبداً.
create or replace function public.verify_consumption()
returns table ("check" text, invoice_id uuid, item_id uuid, spec_id uuid, product_id uuid, detail text)
language sql stable security invoker set search_path = public as $$
  with spec as (
    select c.spec_id,
           (array_agg(c.clinic_id order by c.created_at, c.id))[1]  as clinic_id,
           (array_agg(c.invoice_id order by c.created_at, c.id))[1] as invoice_id,
           (array_agg(c.item_id order by c.created_at, c.id))[1]    as item_id,
           (array_agg(c.product_id order by c.created_at desc, c.id desc))[1] as product_id,
           (array_agg(c.per_qty order by c.created_at, c.id))[1]    as per_qty,
           (array_agg(c.per_div order by c.created_at, c.id))[1]    as per_div,
           (array_agg(c.per_value order by c.created_at, c.id))[1]  as per_value,
           count(distinct jsonb_build_array(c.clinic_id, c.invoice_id, c.item_id, c.product_name, c.unit, c.unit_label,
                                            c.per_qty, c.per_div, c.unit_cost, c.per_value, c.service_id, c.source,
                                            c.from_item)) as variants,
           sum(c.qty) as live_q, sum(c.value) as live_v,
           bool_or(c.note = 'product_gone') as gone
      from invoice_consumption c
     group by c.spec_id
  ),
  tgt as (
    select s.*, case when ii.id is null or i.id is null or i.status = 'refunded' then 0
                     else greatest(ii.qty, 0) end as target
      from spec s
      left join invoice_items ii on ii.id = s.item_id and ii.clinic_id = s.clinic_id
      left join invoices i on i.id = s.invoice_id and i.clinic_id = s.clinic_id
  ),
  led as (
    select c.product_id, c.clinic_id, sum(c.qty) as q, sum(c.posted) as p
      from invoice_consumption c
     where c.note is distinct from 'product_gone'
     group by c.product_id, c.clinic_id
  ),
  mat as (
    select s.item_id, s.clinic_id, sum(s.per_value) as c from spec s group by s.item_id, s.clinic_id
  )
  select 'spec_mismatch', s.invoice_id, s.item_id, s.spec_id, s.product_id,
         format('%s variants of the frozen fields', s.variants)
    from spec s where s.variants > 1
  union all
  select 'live_vs_line', t.invoice_id, t.item_id, t.spec_id, t.product_id,
         format('live %s / %s, target qty %s wants %s / %s', t.live_q, t.live_v, t.target,
                public._cons_round_div(t.target * t.per_qty, t.per_div, 9), round(t.target * t.per_value, 2))
    from tgt t
   where t.live_q <> public._cons_round_div(t.target * t.per_qty, t.per_div, 9)
      or t.live_v <> round(t.target * t.per_value, 2)
  union all
  select 'carry', null::uuid, null::uuid, null::uuid, coalesce(k.product_id, l.product_id),
         format('ledger %s − posted %s + ext_in %s − ext_out %s ≠ carry %s',
                coalesce(l.q, 0), coalesce(l.p, 0), coalesce(k.ext_in, 0), coalesce(k.ext_out, 0),
                coalesce(k.carry::text, 'missing'))
    from product_stock_carry k
    full join led l on l.product_id = k.product_id and l.clinic_id = k.clinic_id
   where k.product_id is null
      or coalesce(l.q, 0) - coalesce(l.p, 0) + k.ext_in - k.ext_out <> k.carry
  union all
  select 'product_gone', s.invoice_id, s.item_id, s.spec_id, s.product_id, 'the product exists nowhere in this clinic'
    from spec s where s.gone
  union all
  select 'line_below_materials', ii.invoice_id, ii.id, null::uuid, null::uuid,
         format('unit_cost %s < materials %s', ii.unit_cost, m.c)
    from mat m
    join invoice_items ii on ii.id = m.item_id and ii.clinic_id = m.clinic_id
    join invoices i on i.id = ii.invoice_id and i.clinic_id = ii.clinic_id
   where i.status is distinct from 'refunded' and ii.qty > 0 and ii.unit_cost < m.c
  order by 1, 2, 3, 4
$$;
revoke all on function public.verify_consumption() from public, anon, authenticated;

-- verify_consumption_wiring() يجب أن ترجع صفراً. تمسك إعادةَ تشغيل هجرةٍ قديمة على الإنتاج:
--   • آخرُ retail_checkout بلا _consumption_plan(/_consumption_apply(، والتعديلُ بلا _consumption_relink(/
--     _invoice_lock_products(، وغلافُه لا ينادي _unguarded، وproduct_movements لا تقرأ invoice_consumption؛
--   • دالّةٌ أعادت كتابتَها 0252 (أو 0253/0254 متى نزلت — نزلت = إحدى دوالّها تحمل علامتها، أو
--     stock_waste_submit موجودة) وجسمُها بلا علامتها؛ ومرتجعُ 0253 وحذفُها بلا القفل؛
--   • محفّزٌ من الأربعة (وproducts_waste_guard متى نزلت 0254) غائبٌ أو مطفأ؛
--   • invoice_consumption_get بلا علامة 0254 وقد وُجد stock_counts.source_invoice (سندُ الهدر يتذكّر فاتورتَه،
--     و0254 تعيد القارئ فتملأ waste) — قبل العمود الفحصُ نائم؛
--   • هذا الفحصُ بنصّ 0252 وقد نزلت 0255 (product_cost_reset موجودة): 0252 أُعيدت وحدها بعدها فأرجعت أجسامَ 0255
--     لنصّها، والنصُّ هنا لا يعرف مجموعتها — يقول نفسَه («lacks -- +0255») حتى تُعاد 0255 (الرجوعُ 0252 ثمّ 0253–0255).
create or replace function public.verify_consumption_wiring()
returns table (problem text)
language sql stable security invoker set search_path = public as $$
  with need(sig, txt) as (values
    ('public.retail_checkout(jsonb,jsonb)',                  '-- +0252'),
    ('public.retail_checkout(jsonb,jsonb)',                  '_consumption_plan('),
    ('public.retail_checkout(jsonb,jsonb)',                  '_consumption_apply('),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '-- +0252'),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '_consumption_relink('),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '_invoice_lock_products('),
    ('public.edit_invoice_lines(uuid,jsonb,text)',           'edit_invoice_lines_unguarded('),
    ('public.product_movements(uuid,integer)',               '-- +0252'),
    ('public.product_movements(uuid,integer)',               'invoice_consumption')
  ),
  grp(mig, sig) as (values
    ('0253', 'public.deduct_stock_pooled(uuid,numeric,uuid)'),
    ('0253', 'public.record_purchase(jsonb,jsonb)'),
    ('0253', 'public.update_purchase(uuid,jsonb,jsonb)'),
    ('0253', 'public.return_invoice_items(uuid,jsonb,text,text)'),
    ('0253', 'public.delete_invoice(uuid)'),
    ('0253', 'public.restore_product(uuid)'),
    ('0253', 'public.inventory_tidy_uncat()'),
    ('0253', 'public.pool_product(uuid,uuid)'),
    ('0253', 'public.restore_company(uuid)'),
    ('0253', 'public.restore_company_section(uuid)'),
    ('0254', 'public.stock_count_decide(uuid[],boolean)'),
    ('0254', 'public.stock_count_state()'),
    ('0254', 'public.products_trash_consumption()')
  ),
  src as (
    select g.mig, g.sig, (select p.prosrc from pg_proc p where p.oid = to_regprocedure(g.sig)) as body from grp g
  ),
  landed as (
    select distinct s.mig from src s where position('-- +' || s.mig in coalesce(s.body, '')) > 0
    union
    select '0254' where to_regprocedure('public.stock_waste_submit(jsonb,boolean,jsonb)') is not null
  ),
  trg(tg, tbl, mig) as (values
    ('invoice_items_consumption_del', 'invoice_items', '0252'),
    ('invoice_items_consumption_qty', 'invoice_items', '0252'),
    ('invoices_consumption_status',   'invoices',      '0252'),
    ('products_trash_consumption',    'products_trash', '0252'),
    ('products_waste_guard',          'products',      '0254')
  )
  select n.sig || case when to_regprocedure(n.sig) is null then ': missing' else ': lacks ' || n.txt end
    from need n
   where to_regprocedure(n.sig) is null
      or position(n.txt in (select p.prosrc from pg_proc p where p.oid = to_regprocedure(n.sig))) = 0
  union all
  select s.sig || case when s.body is null then ': missing' else ': lacks -- +' || s.mig end
    from src s
   where s.mig in (select mig from landed) and position('-- +' || s.mig in coalesce(s.body, '')) = 0
  union all
  select s.sig || ': lacks _invoice_lock_products('
    from src s
   where s.mig = '0253' and s.mig in (select mig from landed)
     and s.sig in ('public.return_invoice_items(uuid,jsonb,text,text)', 'public.delete_invoice(uuid)')
     and s.body is not null and position('_invoice_lock_products(' in s.body) = 0
  union all
  select format('trigger %s on %s: %s', t.tg, t.tbl, case when g.oid is null then 'missing' else 'disabled' end)
    from trg t
    left join pg_trigger g on g.tgname = t.tg and g.tgrelid = to_regclass('public.' || t.tbl) and not g.tgisinternal
   where (t.mig = '0252' or t.mig in (select mig from landed))
     and (g.oid is null or g.tgenabled not in ('O', 'A'))
  union all
  -- قارئُ هذه الهجرة تعيده 0254 فتملأ waste من أعمدتها (stock_counts.source_invoice): نزلت أعمدتُها والقارئُ
  -- بلا علامتها ⇒ إعادةُ 0252 وحدها بعد 0254 أرجعت waste [] لكلّ فاتورة، فسندُ الهدر يُعبّأ ثانيةً بما سُجّل.
  select 'public.invoice_consumption_get(uuid[]): lacks -- +0254'
   where exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass('public.stock_counts') and a.attname = 'source_invoice' and not a.attisdropped)
     and position('-- +0254' in coalesce((select p.prosrc from pg_proc p
                                           where p.oid = to_regprocedure('public.invoice_consumption_get(uuid[])')), '')) = 0
  union all
  -- وهذا الفحصُ نفسُه: 0255 تعيده بمجموعتها (أجسامُها السبعة ومحفّزُها). نزلت 0255 (product_cost_reset منها) والفحصُ الحيُّ
  -- بلا علامتها ⇒ إعادةُ 0252 وحدها بعدها: البيعةُ والتعديلُ وطيُّ الدمج وstock_unit_cost رجعت لنصّها، ونصُّ 0252 لا يعرف
  -- مجموعتها — فيقول نفسَه حتى تُعاد 0255 (لا «نظيف» بعد 0252 ثمّ 0254 وحدهما). العلامةُ تُبنى بـformat: حرفُها هنا يُسكته.
  select format('public.verify_consumption_wiring(): lacks -- +%s', '0255')
   where to_regprocedure('public.product_cost_reset(uuid,numeric)') is not null
     and position(format('-- +%s', '0255') in coalesce((select p.prosrc from pg_proc p
                                                         where p.oid = to_regprocedure('public.verify_consumption_wiring()')), '')) = 0
  order by 1
$$;
revoke all on function public.verify_consumption_wiring() from public, anon, authenticated;

reset lock_timeout;
