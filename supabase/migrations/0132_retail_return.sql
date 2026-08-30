-- ============================================================================
-- doctorVet — 0132: الإرجاع الخالص — بضاعةٌ ترجع، وفلوسٌ تُسجَّل سحباً
--
-- ── الحالة من الميدان ─────────────────────────────────────────────────────
-- زبون يجي يرجّع وحسب: لا يشتري شيئاً بالمقابل. الكاشير يدگّ الباركود فينزل
-- السطر بالسالب، فيصير مجموع السلة سالباً — و0122 تمنع الحفظ هنا وتحوّله
-- لتبويب «المرتجع». لكن ذاك التبويب يرجّع **أصنافاً من فاتورةٍ معروفة**، ولا
-- يخدم زبوناً يرجّع بلا أن نعرف فاتورته أو تكون قد مضت.
--
-- ── لماذا لا نُنشئ فاتورة ─────────────────────────────────────────────────
-- الإغراء أن نكتبها فاتورةً بمجموعٍ صفر وأسطرٍ سالبة، فتُحفظ التفاصيل. لكن
-- الإرجاع ليس بيعة: فاتورةٌ كهذه تزيد عدّاد الفواتير بواحد، وتزرع بيعةً
-- صفريّة في كل تقريرٍ يعدّ الفواتير أو يحسب متوسّط الفاتورة. الحقيقتان
-- الوحيدتان هنا: بضاعةٌ رجعت للرفّ، وفلوسٌ خرجت من الصندوق. فنكتبهما هما.
--
-- ── لماذا سحبٌ لكل صنفٍ لا سحبٌ واحد ──────────────────────────────────────
-- سحبٌ واحد بمبلغٍ مجمّع يجيب «كم خرج»، ولا يجيب «ما الذي رجع». وصفٌّ لكل
-- صنفٍ يجعل التقرير يجاوب السؤال الذي يهمّ فعلاً: أي منتجٍ يرجع أكثر، وبكم.
-- والكلفة صفوفٌ قليلة — الإرجاع حدثٌ نادر بطبعه.
--
-- ── لماذا لا نُدخلها في سِيَق الدفع كالمرتجع المربوط ──────────────────────
-- المرتجع المربوط بفاتورة (0121) يكتب ساقاً سالبة **داخل فاتورته الأصلية**،
-- وهو الأصحّ هناك لأن الفاتورة موجودة. وهنا لا فاتورة، فلا موضع للساق. ولو
-- اخترعنا لها فاتورةً لتحملها لعُدنا للمشكلة الأولى. والصندوق يطرح المصاريف
-- النقدية أصلاً (`cash - cashOut`)، فالسحب يصل للنتيجة نفسها بلا اختراع.
--
-- ولا ازدواج: هذا المسار لا يكتب فاتورةً ولا ساقاً، فالمبلغ يُطرح مرّةً
-- واحدة عبر المصروف. والمسار المربوط لا يكتب مصروفاً، فيُطرح مرّةً واحدة
-- عبر ساقه. لكلٍّ قناةٌ واحدة لا تتقاطع.
--
-- الذرّيّة تهمّ: المخزون والمال إمّا يقعان معاً أو لا يقع أيّهما. دالّةٌ
-- واحدة تضمنها — وبلاها قد ترجع البضاعة ويبقى المال بالصندوق، أو العكس.
--
-- إضافيّة وقابلة لإعادة التشغيل.
-- ============================================================================

create or replace function retail_return(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  it       jsonb;
  v_qty    numeric(14,3);
  v_stockq numeric(14,3);
  v_price  numeric(14,2);
  v_amount numeric(14,2);
  v_name   text;
  v_method text;
  v_who    text := nullif(btrim(p_meta->>'customer_name'), '');
  v_note   text := nullif(btrim(p_meta->>'note'), '');
  v_total  numeric(14,2) := 0;
  v_lines  int := 0;
begin
  if v_clinic is null then raise exception 'no clinic'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  -- طريقة الخروج تتبع ما دفع به الزبون أصلاً. «حوالة» بشاشة البيع اسمها
  -- «bank» بسجل المصروفات — نفس الشيء باسمين، فنترجم بدل أن نكسر القيد.
  v_method := case lower(coalesce(p_meta->>'method', 'cash'))
                when 'card'     then 'card'
                when 'transfer' then 'bank'
                when 'bank'     then 'bank'
                else 'cash'
              end;

  for it in select * from jsonb_array_elements(p_items) loop
    -- الكمية تُقرأ **موجبة** مهما جاءت: السلة ترسلها سالبة إشارةً على الردّ،
    -- والدالّة تعرف أنها إرجاعٌ من اسمها. abs يمنع أن تنقلب النيّة بإشارة.
    v_qty := abs(coalesce(nullif(it->>'qty','')::numeric, 0));
    if v_qty = 0 then continue; end if;

    v_stockq := abs(coalesce(nullif(it->>'stock_qty','')::numeric, v_qty));
    v_price  := abs(coalesce(nullif(it->>'unit_price','')::numeric, 0));
    v_name   := coalesce(nullif(btrim(it->>'name'), ''), 'صنف');
    v_amount := round(v_qty * v_price, 2);

    -- البضاعة أولاً: لو فشلت العملية بعدها تراجعت هي أيضاً (معاملةٌ واحدة).
    if nullif(it->>'product_id','') is not null then
      perform credit_stock((it->>'product_id')::uuid, v_stockq, v_clinic);
    end if;

    -- والمال: صفٌّ لكل صنف. القيد يمنع المبلغ ≤ 0، والإرجاع بسعر صفر
    -- (هديّة أو خدمة) يرجّع البضاعة بلا سحب — وهذا صحيح لا استثناء.
    if v_amount > 0 then
      insert into expenses (clinic_id, amount, description, category, method, spent_at)
      values (
        v_clinic,
        v_amount,
        'راجع: ' || v_name
          || case when v_qty <> 1 then ' × ' || trim(trailing '.' from trim(trailing '0' from v_qty::text)) else '' end
          || case when v_who  is not null then ' — ' || v_who  else '' end
          || case when v_note is not null then ' (' || v_note || ')' else '' end,
        'مرتجع',
        v_method,
        now()
      );
      v_total := v_total + v_amount;
    end if;

    v_lines := v_lines + 1;
  end loop;

  if v_lines = 0 then raise exception 'no items'; end if;

  return jsonb_build_object('total', v_total, 'lines', v_lines, 'method', v_method);
end $$;

-- دالّةُ مالٍ: تُنزع عن العموم والزائر، وتُمنح للمسجَّل وحده — نفس ما فعلته
-- 0051 بـretail_checkout وأخواتها.
revoke all on function retail_return(jsonb, jsonb) from public, anon;
grant execute on function retail_return(jsonb, jsonb) to authenticated;

-- فهرسٌ للتصنيف: تقارير المرتجع تسأل «كل ما تصنيفه مرتجع بهذه المدّة»،
-- والفهرس القائم على (clinic_id, spent_at) يخدم المدّة لا التصنيف.
create index if not exists expenses_clinic_category_idx on expenses (clinic_id, category, spent_at desc);
