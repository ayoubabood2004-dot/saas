-- ============================================================================
-- 0293 — اسمُ المادّة المدموجة لا يرجع توأماً (G22، ٢٦/١١)
--
-- ── الجذر ───────────────────────────────────────────────────────────────────
-- الدمجُ (merge_products 0259، و«رتّب المخزن» inventory_tidy_uncat) ينقل رموزَ التوأم ورصيدَه لأصله ثمّ يحذفه،
-- واسمُه يبقى بصورته في products_trash وحدها. فسطرُ شراءٍ بالاسم القديم بلا باركود يمرّ من فرع الاسم في
-- record_purchase/update_purchase (يطابق الأسماءَ الحيّة وحدها) فيُنشئ «Ivermectin» من جديد ويستلم البضاعةَ عليه،
-- والأصلُ «Ivomec» يقول «رصيده صفر» بعد ١٦ مسحة والـ١٢ على التوأم الجديد: الدمجُ ألغى نفسَه بصمت. ونموذجُ
-- «إضافة منتج» بالاسم كذلك. (مقيسٌ بتدقيق ٢٢/١١ على الأجسام الحيّة: لا عمودَ اسمٍ سابق ولا محفّزَ يقرأ الأسماء.)
--
-- ── الحارس ──────────────────────────────────────────────────────────────────
-- قبل إدراج مادّةٍ **بلا باركود** (لا مخزنَ حقل): اسمٌ يطابق مادّةً اندمجت بعيادتها وأصلُها حيّ ⇒ رفضٌ يسمّي الأصل.
-- المطابقةُ بـsearch_norm (0150، مرآةُ searchable — الطرفان من دالّةٍ واحدة)، ومرآتُها بالواجهة `trashByExactName`
-- (trashFind.ts) تقولها قبل الطلب بنموذج الإضافة وسطر الشراء (والسطرُ يُربط بأصله بضغطة).
-- لا يُعاد تعريفُ record_purchase ولا update_purchase (جسمان كبيران محروسان بالانجراف): محفّزٌ قبل الإدراج يرى كلَّ كاتب.
--
-- ويمرّ عمداً:
--   • الاسترجاعُ: restore_product يُدرج الصفَّ وصورتُه ما زالت بالسلّة (يحذفها بعده) — المعرّفُ نفسُه بالسلّة ⇒ ليس توأماً.
--   • مادّةٌ بباركود: رمزٌ لا يعرفه المخزنُ (فرعُ الرمز سبق ولم يطابق) قد يكون مادّةً ثانيةً فعلاً — الواجهةُ تشير ولا تمنع.
--   • مخزنُ الحقل (farm_id): مخزنٌ منفصل بأسمائه.
--   • مدموجةٌ أصلُها انحذف بعد الدمج، أو سلسلةٌ دائرية: لا أصلَ حيّاً يُسمّى — الإدراجُ كما كان.
--   • **مدموجةٌ أصلُها الحيّ بالاسم نفسِه** (مراجعةٌ عدائيّة قبل النشر): أغلبُ الدمج توأمان بنفس الاسم — نافذةُ الدمج تقترحهما
--     أوّلاً و«رتّب المخزن» يطوي بالاسم — فالاسمُ لم يضع (الأصلُ يحمله، وفرعُ الاسم بالشراء يلقاه). رفضُها كان يمنع «سرنجة 5 مل»
--     جديدةً لشركةٍ أخرى برسالة ««سرنجة 5 مل» اسمٌ سابق لـ«سرنجة 5 مل»» — والإضافةُ نفسُها تمرّ بلا تاريخ دمج.
--   • صفٌّ قائمٌ بمعرّفه: إعادةُ الطابور (upsert … ignoreDuplicates) تُدرج صفّاً حُفظ وضاع جوابُه — والمحفّزُ قبل الإدراج يجري قبل
--     حلّ التعارض، فرفضُه كان يرمي عمليةً تمّت إلى «المرفوضات» (كحارسَي الرمز والمستويات: الصفُّ لا يتعارض مع نفسه).
-- والرفضُ بـhint عربيّ (describeDbError يعرضه)، فالشراءُ يقف بجملةٍ تسمّي المادّتين لا بتوأمٍ صامت.
-- ============================================================================

create or replace function public.products_merged_name_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_t    record;
  v_id   uuid;
  v_hops int;
  v_keep text;
begin
  if new.farm_id is not null then return new; end if;
  if coalesce(inv_norm_code(new.barcode), '') <> '' then return new; end if;
  v_key := search_norm(new.name);
  if length(coalesce(v_key, '')) < 2 then return new; end if;
  -- الاسترجاع: صورةُ الصفّ نفسِه ما زالت بالسلّة لحظةَ إدراجه.
  if exists (select 1 from products_trash where id = new.id) then return new; end if;
  -- إعادةُ إدراجٍ لصفٍّ قائم (ON CONFLICT DO NOTHING): لا شيءَ يولد.
  if exists (select 1 from products where id = new.id) then return new; end if;

  for v_t in
    select t.merged_into
      from products_trash t
     where t.clinic_id = new.clinic_id
       and t.merged_into is not null
       and search_norm(t.row->>'name') = v_key
     order by t.deleted_at desc
  loop
    -- أصلُها: حيٌّ مباشرةً، أو اندمج بدوره — يُتبع عبر السلّة عشرين قفزة (كـ_stock_post).
    v_id := v_t.merged_into;
    v_hops := 0;
    while v_id is not null and v_hops < 20 loop
      select p.name into v_keep from products p where p.id = v_id and p.clinic_id = new.clinic_id;
      if found then
        -- أصلٌ حيٌّ بالاسم نفسِه: الاسمُ لم يضع — لا يُرفض بهذا الصفّ (ولا بغيره إن لم يكن اسماً سابقاً حقيقياً).
        exit when search_norm(v_keep) = v_key;
        -- والاسمان معزولان اتجاهياً (FSI…PDI): اسمٌ لاتينيٌّ بأقواس كان يُرسم مقلوباً داخل الجملة العربية.
        raise exception 'product_merged_name' using errcode = 'P0001',
          hint = format('«%s» اسمٌ سابق لـ«%s» (اندمجت بيها) — زيد عليها. وإذا هذي مادّة ثانية فعلاً، اكتبلها باركود أو اسم ثاني.',
                        chr(8296) || btrim(new.name) || chr(8297), chr(8296) || v_keep || chr(8297));
      end if;
      select t2.merged_into into v_id from products_trash t2 where t2.id = v_id and t2.clinic_id = new.clinic_id;
      v_hops := v_hops + 1;
    end loop;
  end loop;
  return new;
end $$;

revoke all on function public.products_merged_name_guard() from public, anon, authenticated;

drop trigger if exists products_merged_name_guard on public.products;
create trigger products_merged_name_guard
  before insert on public.products
  for each row execute function public.products_merged_name_guard();
