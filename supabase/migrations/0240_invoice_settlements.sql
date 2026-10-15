-- ============================================================================
-- ٠٢٤٠ — سطورُ «تسديد دفعة» بقائمة الفواتير: الفواتيرُ التي سُدِّد عليها منذ لحظة
--
-- ── المقيس ───────────────────────────────────────────────────────────────
-- 4d42f0b (١٣ تموز) جعل تسديدَ الدين يرفع فاتورتَه لأعلى القائمة («آخرُ نشاط» بالمتصفّح).
-- ثم جاء 0150 (invoices_paged، الافتراضيّ نعم): القائمةُ نافذةٌ يرتّبها الخادمُ بـcreated_at،
-- و`if (paged) return rows;` بالواجهة يتجاوز ترتيبَ المتصفّح — فاختفى الصعود. والأدهى أن
-- الدينَ عادةً **أقدمُ من النافذة** (١٥ يوماً)، فتسديدُ اليوم على فاتورة الشهر الماضي لا
-- يُرى بالقائمة أصلاً: لا الفاتورةُ فيها ولا أثرُ الدفعة.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- التسديدُ **سطرٌ بوقته** لا فاتورةٌ جديدة ولا رفعٌ للأصلية: settle_invoice (0061) تختم
-- كلَّ دفعةٍ بـ`at` داخل payment_details، والواجهةُ (src/lib/settlementFeed.ts) تعرض كلَّ
-- ساقٍ كهذه سطراً وسط الفواتير بوقتها، والأصليةُ بمكان إنشائها بدينها المتبقّي. لا كتابةَ
-- ولا تغييرَ بأي جدول — فالتقاريرُ (receipt_legs / receiptsOf) كما هي فلساً بفلس.
--
-- هذه الدالّة تجيب الفواتيرَ (المطابقةَ للبحث والحالة، بكلّ عمرها) التي فيها ساقٌ قد تكون
-- تسديداً بعد p_since. «قد تكون»: مجموعةٌ أوسع لا أضيق — الحكمُ الدقيق (ليست ساقَ تثبيتٍ
-- ولا فكّ، ومختومةٌ بعد الإنشاء) بالواجهة بـsettlementsOf، فالخادمُ لا يُسقط ما تعرضه.
-- قراءةٌ فقط بصلاحية المُستدعي (RLS + auth_clinic)، بلا سقفٍ صامت: الواجهةُ تقرؤها بـallPages.
-- ============================================================================

create or replace function invoice_settlements(p_q text default null, p_status text default 'all',
                                               p_since timestamptz default null)
returns setof invoices
language sql stable security invoker set search_path = public as $$
  select i.*
    from invoices i
   where i.clinic_id = auth_clinic()
     and invoice_matches(i, p_q, p_status)
     and exists (
       select 1
         -- CASE لا AND: بوستغريس لا يضمن ترتيبَ الشروط، وjsonb_array_elements على غير مصفوفةٍ يرمي.
         from jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array' then i.payment_details else '[]'::jsonb end) l
        where coalesce(safe_num(l->>'amount'), 0) > 0.01
          and coalesce(l->>'reversal_of', '') = ''
          and safe_ts(l->>'at') > i.created_at
          and (p_since is null or safe_ts(l->>'at') >= p_since))
   order by i.created_at desc, i.id desc
$$;
revoke all on function invoice_settlements(text, text, timestamptz) from public, anon;
grant execute on function invoice_settlements(text, text, timestamptz) to authenticated;
