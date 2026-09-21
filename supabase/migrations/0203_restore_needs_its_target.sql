-- ============================================================================
-- ٠٢٠٣ — لا استرجاعَ يقول «رجع كلُّ شيء» وهو رجع فارغاً
--
-- ── ما قيس بالمتصفّح ────────────────────────────────────────────────────
-- اطوِ «اليف هاوس» بتوأمها، ثمّ احذفِ **الباقية** نفسَها، ثمّ استرجعِ المطويّة:
-- ترجع الشركةُ **فارغة** — لا منتجٌ ولا فاتورةٌ ولا دَينٌ ولا دفعة — والشاشةُ
-- تقول «رجعت بكل شي كان إلها».
--
-- والسببُ صحيحٌ بذاته: كلُّ تحديثٍ بفرع الطيّ مشروطٌ بـ`company_id =
-- merged_into` («بشرط أنها ما زالت حيث تركها الطيّ»، 0197) — وهو الشرطُ الذي
-- يمنع خطفَ صفٍّ نُقل يدوياً بعده. لكنّ الباقيةَ حين تُحذف يصير
-- `company_id = null` (رِجلُ `set null`)، فلا شرطَ يتحقّق، فلا شيءَ يعود.
-- المنطقُ سليم، **والخبرُ كاذب**.
--
-- و«الكتابةُ تُسمَع» بـCLAUDE.md تقول: صفرُ صفوفٍ بلا خطأ نجاحٌ كاذب. فالسكوتُ
-- هنا أسوأُ من الرفض: العيادةُ تظنّ أنها استرجعت، فلا تعيد المحاولة بالترتيب
-- الصحيح، ويبقى تاريخُها بسلّةِ الباقية لا يعرف أحدٌ أنه هناك.
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- رفضٌ يقول الترتيب — نظيرةُ `no_company` بـ`restore_company_section` حرفاً
-- بحرف («شركةُ هذا الصنف محذوفة — استرجعها أوّلاً»). والترتيبُ الصحيح يعمل:
-- استرجعِ الباقيةَ أوّلاً فترجع صفوفُها من لقطتها، ثمّ المطويّةَ فتأخذ حصّتَها.
--
-- تراجع: أعِد تنزيل 0201 (تعريفُها هناك بلا هذا الفحص).
-- تُطبَّق بعد 0202.
-- ============================================================================

create or replace function public.restore_company(p_id uuid)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_t      companies_trash;
  v_row    companies;
  v_sec    jsonb;
  v_moved  numeric;
  v_sid    uuid;
  v_union  text;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'الاسترجاعُ للمدير والطبيب.';
  end if;
  select * into v_t from companies_trash where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'not_in_trash' using hint = 'ما لكينا صورةً لهذه الشركة.'; end if;
  if exists (select 1 from companies where id = p_id) then
    raise exception 'already_there' using hint = 'الشركةُ موجودةٌ أصلاً.';
  end if;
  -- **الوجهةُ لازم تكون قائمة**: بلا هذا يمرّ الاسترجاعُ فارغاً ويقول «تمّ».
  if v_t.merged_into is not null
     and not exists (select 1 from companies where id = v_t.merged_into and clinic_id = v_clinic) then
    raise exception 'no_merge_target'
      using hint = 'الشركةُ الي انطوت بيها محذوفة — استرجعها أوّلاً من المحذوفات، وبعدين هذي.';
  end if;

  insert into companies select * from jsonb_populate_record(null::companies, v_t.row);
  select * into v_row from companies where id = p_id;

  if v_t.merged_into is not null then
    update products set company_id = p_id
     where id = any (v_t.product_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchases set company_id = p_id, company_name = coalesce(v_t.row->>'name', company_name)
     where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchase_payments set company_id = p_id
     where id = any (v_t.payment_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update company_charges set company_id = p_id
     where id = any (v_t.charge_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update products_trash set row = jsonb_set(row, '{company_id}', to_jsonb(p_id::text))
     where clinic_id = v_clinic and (row->>'company_id')::uuid = v_t.merged_into
       and (row->>'id')::uuid = any (v_t.product_ids);

    v_union := nullif(btrim(case
        when btrim(coalesce(v_t.keep_note, '')) = btrim(coalesce(v_t.row->>'note', ''))
          then coalesce(v_t.keep_note, v_t.row->>'note')
        else concat_ws(E'\n', nullif(btrim(v_t.keep_note), ''), nullif(btrim(v_t.row->>'note'), ''))
      end), '');
    update companies set note = v_t.keep_note
     where id = v_t.merged_into and clinic_id = v_clinic
       and note is not distinct from v_union;
  else
    update products          set company_id = p_id where id = any (v_t.product_ids)  and clinic_id = v_clinic and company_id is null;
    update purchases         set company_id = p_id where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id is null;
    update purchase_payments set company_id = p_id where id = any (v_t.payment_ids)  and clinic_id = v_clinic and company_id is null;
    insert into company_charges
    select (jsonb_populate_record(null::company_charges, c || jsonb_build_object('company_id', p_id::text))).*
      from jsonb_array_elements(coalesce(v_t.charges, '[]'::jsonb)) c
     where (c->>'clinic_id')::uuid = v_clinic
    on conflict (id) do nothing;
  end if;

  for v_sec in select * from jsonb_array_elements(coalesce(v_t.sections, '[]'::jsonb)) loop
    v_moved := coalesce((v_sec->>'pooled_moved')::numeric, 0);
    v_sid   := (v_sec->>'id')::uuid;
    if (v_sec->>'folded_into') is not null then
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      if v_moved <> 0 then
        update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_moved), 3)
         where id = (v_sec->>'folded_into')::uuid and clinic_id = v_clinic;
        update company_sections set pooled_stock = v_moved
         where id = v_sid and clinic_id = v_clinic;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id = (v_sec->>'folded_into')::uuid
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      delete from company_sections_trash
       where id = v_sid and clinic_id = v_clinic
         and exists (select 1 from company_sections where id = v_sid);
    elsif v_t.merged_into is not null then
      update company_sections set company_id = p_id
       where id = v_sid and clinic_id = v_clinic and company_id = v_t.merged_into;
    else
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id is null
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      delete from company_sections_trash where id = v_sid and clinic_id = v_clinic;
    end if;
  end loop;

  delete from company_merges where from_id = p_id and clinic_id = v_clinic;
  delete from companies_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.restore_company(uuid) to authenticated;
