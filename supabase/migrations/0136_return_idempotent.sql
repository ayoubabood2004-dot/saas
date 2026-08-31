-- ============================================================================
-- doctorVet — 0136: والمرتجع كذلك — مرجعُ عميلٍ عامّ لنداءات القاعدة
--
-- ── نفس خطر 0135، بمكانٍ آخر ──────────────────────────────────────────────
-- صلّحنا البيعة، وبقي أخوها. `retail_return` تصرف فلوساً وتردّ بضاعة:
--     * تُضيف كميّة كل صنفٍ راجع للمخزن (`credit_stock`)
--     * وتسجّل سطراً بالسحوبات لكل صنف
-- وليس فيها ما يميّز «هذي نفس عمليّة الإرجاع» عن «إرجاعٌ ثانٍ مثله». فلو
-- انقطع النت بعد أن أتمّ الخادم عمله وقبل أن يعود الجواب، وأعاد الكاشير:
-- **المخزون يُزاد مرّتين، والسحوبات تُسجَّل مرّتين**. أي أن الخزنة تُنقَص
-- ضِعف ما رجع فعلاً، والمخزن يمتلئ ببضاعةٍ لا وجود لها.
--
-- وهذا الخطر قائمٌ اليوم بلا أي طابور. والطابور يعيد المحاولة بطبعه، فلا
-- يجوز أن يشمل المرتجع قبل هذا.
--
-- ── لماذا لا نفعل ما فعلناه بالفاتورة ─────────────────────────────────────
-- بـ0135 وضعنا `client_ref` على `invoices` نفسها: البيعة صفٌّ واحد، فمفتاحها
-- يسكن فيه. أمّا الإرجاع فيولّد **عدّة** أسطر بالسحوبات — سطرٌ لكل صنف — فلا
-- صفَّ واحداً نختمه. ولو ختمنا كل الأسطر بنفس المرجع لما استطاع فهرسٌ فريد
-- أن يميّز «السطر الثاني من نفس الإرجاع» عن «إرجاعٌ مكرَّر».
--
-- فالمفتاح يحتاج بيتاً خاصّاً: جدولٌ صغير يسجّل **محاولةَ النداء** لا نتيجته.
--
-- ── ولماذا جدولٌ عامّ لا جدولٌ للمرتجع ────────────────────────────────────
-- المشكلة ليست بالمرتجع بل بكل نداءٍ يكتب أكثر من صفّ. `rpc_refs` يخدم أي
-- دالّةٍ قادمة بنفس السطرين، وكلفتُه نفسُ كلفة جدولٍ مخصوص. والمفتاح ثلاثيّ
-- (عيادة، دالّة، مرجع) فلا يتصادم مرجعُ بيعةٍ بمرجع إرجاع.
--
-- ونحفظ `result`: الإعادة تُرجع **نفس** الأرقام التي رآها الكاشير أول مرّة،
-- فلا تختلف شاشتان على مبلغٍ واحد.
--
-- ── الترتيب مقصود: نحجز المرجع قبل أن نعمل ────────────────────────────────
-- الإدراج بـ`rpc_refs` يسبق أي كتابة. فلو كانت نسخةٌ متزامنة سبقتنا، أوقفَنا
-- الفهرس الفريد **قبل** أن نردّ قطعةً واحدة للمخزن — لا بعد أن نتمّ كل العمل
-- ثم نرميه. وبوستغريس يُنيم إدراجَنا حتى تحسم النسخةُ الأولى أمرها:
--     * أتمّت ونجحت  → يُرفَع الخرق، فنقرأ نتيجتها ونُرجعها
--     * تعثّرت وتراجعت → يمرّ إدراجُنا، فنعمل نحن
-- وبما أن الكتلة معاملةٌ فرعية، فما كتبناه قبل الخرق يتراجع كاملاً.
--
-- ── والمرجع اختياريّ ──────────────────────────────────────────────────────
-- نداءٌ بلا `client_ref` يسلك الطريق القديم حرفاً بحرف، فالنسخ القديمة من
-- التطبيق تبقى تعمل بلا تغيير.
--
-- ── والجدول لا ينتفخ ──────────────────────────────────────────────────────
-- صفُّ المرجع لا فائدة له بعد ساعات: ما من إعادةٍ تصل بعد أسبوع. `purge_rpc_refs`
-- تكنسه، وتُجدَّل مع كنس التدقيق. (وهذا نفسه درسُ audit_log: لا نترك جدولاً
-- يكبر بلا سقف ثم نكتشفه وهو نصفُ القاعدة.)
--
-- تراجع:
--   (أعد تعريف retail_return من 0132)
--   drop function if exists purge_rpc_refs(int);
--   drop table if exists rpc_refs;
-- ============================================================================

create table if not exists rpc_refs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  fn          text not null,
  client_ref  text not null,
  result      jsonb,
  created_at  timestamptz not null default now()
);

-- المفتاح الحاسم. ويقود بـclinic_id فيخدم مفتاحَ العيادة الأجنبيّ كذلك.
create unique index if not exists rpc_refs_key_idx
  on rpc_refs (clinic_id, fn, client_ref);

-- للكنس الدوريّ.
create index if not exists rpc_refs_created_idx on rpc_refs (created_at);

alter table rpc_refs enable row level security;

-- قراءةٌ داخل العيادة (لتشخيصٍ عند الحاجة)، ولا كتابةَ من العميل إطلاقاً:
-- الجدول سبّاكةٌ داخلية، تكتبه الدوالّ وحدها (SECURITY DEFINER تتجاوز RLS
-- بصفتها مالكةَ الجدول). ونداءُ الهويّة ملفوفٌ بـselect كي يُحسب مرّةً لكل
-- استعلام لا مرّةً لكل صفّ — قاعدةُ 0128.
drop policy if exists rpc_refs_select on rpc_refs;
create policy rpc_refs_select on rpc_refs for select
  using (clinic_id = (select auth_clinic()));

-- وقفلٌ ثانٍ فوق الأوّل: سوبابيس يمنح `anon`/`authenticated` كلَّ الصلاحيات
-- على أي جدولٍ جديد بـpublic تلقائياً (`alter default privileges`)، فالذي
-- يمنع الكتابة هنا هو RLS وحده. نسحب المنحة كذلك، فلا يبقى القفل واحداً.
--
-- (وهذه فجوةٌ ما شافها المخطّطُ المحلّي: عنقودُ الفحص بلا تلك المنحة
--  الافتراضية، فمرّ الفحص أخضرَ والإنتاج يقول غيرَه. صُحّح بعد النزول.)
revoke insert, update, delete on rpc_refs from anon, authenticated;
revoke all on rpc_refs from anon;

-- ولا نُشغّل مُدقِّق التغييرات عليه: سبّاكةٌ لا سجلّ عيادة، وتدقيقُها يضاعف
-- حجم audit_log بلا فائدة لأحد.

-- ── الكنس ──────────────────────────────────────────────────────────────────
create or replace function purge_rpc_refs(p_days int default 7)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n bigint;
begin
  delete from rpc_refs where created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end $function$;

revoke all on function purge_rpc_refs(int) from public, anon, authenticated;

-- ── والمرتجع يصير قابلاً للإعادة ──────────────────────────────────────────
create or replace function retail_return(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  it jsonb; v_qty numeric(14,3); v_stockq numeric(14,3);
  v_price numeric(14,2); v_amount numeric(14,2); v_name text; v_method text;
  v_who  text := nullif(btrim(p_meta->>'customer_name'), '');
  v_note text := nullif(btrim(p_meta->>'note'), '');
  v_total numeric(14,2) := 0; v_lines int := 0;
  -- مرجعُ المحاولة: يولّده الجهاز مرّةً، ويثبت عبر كل إعادة.
  v_ref  text := nullif(btrim(p_meta->>'client_ref'), '');
  v_out  jsonb;
begin
  if v_clinic is null then raise exception 'no clinic'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  -- إعادةٌ لإرجاعٍ سُجّل سلفاً: تُرجَع نتيجتُه كما هي، بلا مخزونٍ يُزاد ثانيةً
  -- ولا سحبٍ يُسجَّل ثانية.
  if v_ref is not null then
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    if v_out is not null then return v_out; end if;
  end if;

  v_method := case lower(coalesce(p_meta->>'method','cash'))
                when 'card' then 'card'
                when 'transfer' then 'bank'
                when 'bank' then 'bank'
                else 'cash' end;

  -- كتلةٌ بمعالج: خرقُ الفهرس الفريد يعني أن نسخةً متزامنة سبقتنا، فيتراجع
  -- كل ما كتبناه (المخزون والسحوبات) ونُرجع نتيجتها هي.
  begin
    -- حجزُ المرجع أوّلاً — قبل أن نمسّ مخزوناً أو خزنة.
    if v_ref is not null then
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'retail_return', v_ref);
    end if;

    for it in select * from jsonb_array_elements(p_items) loop
      v_qty := abs(coalesce(nullif(it->>'qty','')::numeric, 0));
      if v_qty = 0 then continue; end if;
      v_stockq := abs(coalesce(nullif(it->>'stock_qty','')::numeric, v_qty));
      v_price  := abs(coalesce(nullif(it->>'unit_price','')::numeric, 0));
      v_name   := coalesce(nullif(btrim(it->>'name'), ''), 'صنف');
      v_amount := round(v_qty * v_price, 2);

      if nullif(it->>'product_id','') is not null then
        perform credit_stock((it->>'product_id')::uuid, v_stockq, v_clinic);
      end if;

      if v_amount > 0 then
        insert into expenses (clinic_id, amount, description, category, method, spent_at)
        values (v_clinic, v_amount,
          'راجع: ' || v_name
            || case when v_qty <> 1 then ' × ' || trim(trailing '.' from trim(trailing '0' from v_qty::text)) else '' end
            || case when v_who  is not null then ' — ' || v_who  else '' end
            || case when v_note is not null then ' (' || v_note || ')' else '' end,
          'مرتجع', v_method, now());
        v_total := v_total + v_amount;
      end if;
      v_lines := v_lines + 1;
    end loop;

    if v_lines = 0 then raise exception 'no items'; end if;
    v_out := jsonb_build_object('total', v_total, 'lines', v_lines, 'method', v_method);

    if v_ref is not null then
      update rpc_refs set result = v_out
       where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    end if;
  exception when unique_violation then
    -- لا نبلع كل خرقٍ فريد: إن لم يكن مرجعُنا هو السبب، فالخطأ حقيقيّ ويُرفع.
    if v_ref is null then raise; end if;
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    if v_out is null then raise; end if;
    return v_out;
  end;

  return v_out;
end $function$;

revoke all on function retail_return(jsonb, jsonb) from public, anon;
grant execute on function retail_return(jsonb, jsonb) to authenticated;
