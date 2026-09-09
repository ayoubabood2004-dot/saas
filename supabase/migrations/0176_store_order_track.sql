-- ============================================================================
-- ٠١٧٦ — الطلب لا يمشي إلا للأمام، والزبون يشوف وين وصل
--
-- الفجوتان ٢ و٣ من دراسة المتجر (docs/store-plan.md):
--
-- ١) «الزبون أعمى بعد الطلب»: يستلم SO-XXXXXX ولا مسارَ استعلامٍ عنه —
--    أخطر فجوة ثقة. `store_order_track` تجيب الحالة برقم الطلب **والهاتف
--    معاً**: الرقم وحده قصير (٦ خانات) فيُعَدّ تخميناً، والهاتف سرٌّ يعرفه
--    صاحب الطلب وحده. وحاجز القراءة الجماعية نفسه من 0096 — لا يُرخى
--    لمسار استعلامٍ مفتوح للعموم.
--
-- ٢) «لا حارس انتقال حالة»: سياسة RLS تسمح للعيادة بأي تحديث، فنظرياً
--    «مقبول» يرجع «جديد» — وطلبٌ قُبل وانفوتر ورجع «جديد» يُقبل مرةً ثانية
--    عند موظفٍ ثانٍ. المحفّز يفرض اتجاهاً واحداً: من `new` حصراً إلى
--    قرارٍ نهائي، والختمُ الزمنيّ من الخادم لا من المتصفح. محفّزٌ لا سياسة
--    (درس 0159/0162: سياسةٌ تقرأ جدولَها تسقط)، ويرفض بـP0001+hint عربي
--    يصل الشاشة عبر describeDbError.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0175.
-- ============================================================================

-- ── ١) حارس الانتقال ──────────────────────────────────────────────────────
create or replace function store_orders_guard_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'new' or new.status not in ('accepted', 'rejected', 'cancelled') then
      raise exception 'store_order_status_locked'
        using hint = 'قرار الطلب نهائي: طلبٌ ' ||
          case old.status when 'accepted' then 'مقبولٌ وانفوتر' when 'rejected' then 'مرفوض' else 'ملغى' end ||
          ' ما يرجع «جديد» ولا يتقرّر مرتين. إذا صار خطأ، عالجه بمرتجعٍ من شاشة المبيعات.';
    end if;
    -- الختم من الخادم: توقيت المتصفح يتقدّم ويتأخّر، وقرار المال يؤرَّخ بساعةٍ واحدة.
    new.decided_at := now();
  end if;
  return new;
end $$;

drop trigger if exists store_orders_before_update_status on store_orders;
create trigger store_orders_before_update_status
  before update on store_orders
  for each row execute function store_orders_guard_status();

-- ── ٢) تتبّع الزبون ───────────────────────────────────────────────────────
create or replace function public.store_order_track(p_slug text, p_order_no text, p_phone text)
returns table (order_no text, status text, total numeric, created_at timestamptz, decided_at timestamptz)
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_ip text;
  v_hits int;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  -- نفس حاجز 0096 حرفياً: مسارٌ عامٌّ بلا جلسة لازم يتحمّل الإغراق.
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if v_ip <> '' then
    insert into store_read_hits as h (ip, bucket, hits)
    values (v_ip, date_trunc('minute', now()), 1)
    on conflict (ip, bucket) do update set hits = h.hits + 1
    returning h.hits into v_hits;
    if v_hits > 300 then return; end if;
  end if;

  if length(v_digits) < 8 or length(trim(coalesce(p_order_no, ''))) < 4 then return; end if;

  return query
  select o.order_no, o.status, o.total, o.created_at, o.decided_at
  from store_orders o
  join store_profiles sp on sp.clinic_id = o.clinic_id
  where sp.slug = lower(trim(p_slug))
    and upper(trim(o.order_no)) = upper(trim(p_order_no))
    -- المطابقة على آخر عشر خانات: الزبون يكتب 0770… مرةً و+964770… مرةً،
    -- والرقم العراقيّ ذاته بذيله — بادئة الدولة لا تُسقط طلبَه عن التتبّع.
    and right(regexp_replace(o.customer_phone, '\D', '', 'g'), 10) = right(v_digits, 10)
  limit 1;
end;
$$;

revoke all on function public.store_order_track(text, text, text) from public, anon;
grant execute on function public.store_order_track(text, text, text) to anon, authenticated;
