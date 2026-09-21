-- ============================================================================
-- ٠٢٠١ — الفكُّ يردّ ما أخذه الطيُّ بالضبط: لا منتجَ غريبٌ ولا ملاحظةٌ عالقة
--
-- ── ما قيس بالمتصفّح ────────────────────────────────────────────────────
-- طيٌّ ثمّ فكٌّ، وقراءةُ كلِّ منتجٍ بعدَه: **منتجٌ لم يتحرّك بالطيّ أصلاً هبط
-- بصنفِ شركةٍ أخرى.** صفٌّ (علف-ج) كان دائماً بشركة الباقية وصنفِها، فصار بعد
-- الفكّ صنفُه للمطويّة وشركتُه للباقية — حالةٌ لا تصنعها الشاشةُ ولا تصلحها.
--
-- والسببُ سطرٌ واحدٌ بـ0197: لقطةُ الصنف المطويّ تسجّل منتجاتِ **الصنف الباقي**
-- (`where p.section_id = v_match`) وتُقرأ **بعد** أن نُقلت إليه منتجاتُ المطويّ
-- — فتحمل منتجاتِ الطرفين. والفكُّ يردُّ كلَّ ما بالقائمة، فيأخذ معه ما لم يكن
-- له. اللقطةُ لازم تُؤخذ **قبل** النقل، ولمن يتحرّك وحدَه.
--
-- وحافظاتُنا كلُّها كانت تمرّ خضراء: العدد، والرصيد، والحوض، والمال — لأنّ
-- **لا واحدةَ منها تسأل: أصنفُ هذا المنتج لشركته؟** الحافظةُ التي لم تُكتب.
--
-- وعيبان أصغرُ بنفس الموضع:
--   • صورةُ الصنف بسلّة الأصناف يكتبها المحفّزُ بـ`folded_into = null` و
--     `pooled_moved = 0` — فسجلّان عن نفس الحدث يتناقضان، ومن يسترجع الصنفَ
--     وحدَه يُضاعف الحوض (٢٫٢٥ ترجع بلا أن تُطرح من الباقي).
--   • والملاحظتان تتّحدان بالطيّ ولا تُفكّان: الشاشةُ تقول «الاسترجاع يفكّ
--     الدمج» وملاحظةُ المطويّة تبقى عالقةً بالباقية إلى الأبد.
--
-- تراجع: أعِد تنزيل 0197 ثمّ 0198 (تعريفاهما بلا هذه الإصلاحات).
-- تُطبَّق بعد 0200.
-- ============================================================================

-- ملاحظةُ الباقية **قبل** الاتّحاد — بلا حفظِها يستحيل فكُّه.
alter table companies_trash add column if not exists keep_note text;
comment on column companies_trash.keep_note is
  'ملاحظةُ الشركة الباقية قبل اتّحاد الملاحظتين (0201) — بها يردُّ الفكُّ ما كان، وبشرط أنها ما زالت حيث تركها الطيّ.';

create or replace function public.merge_companies(p_keep uuid, p_drop uuid)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_keep   companies;
  v_drop   companies;
  v_sec    company_sections;
  v_match  uuid;
  v_secs   jsonb := '[]'::jsonb;
  v_moved  numeric;
  v_pids   uuid[];
begin
  -- definer يتجاوز سياسةَ الصفوف، فالفحصُ صريحٌ بنفسها (درس 0145) —
  -- و**كلُّ `where` أدناه مقيَّدةٌ بـ`clinic_id` نصّاً** لأن الشرطَ الضمنيّ سقط.
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'طيُّ الشركات للمدير والطبيب.';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'bad_merge' using hint = 'اختر شركتين مختلفتين.';
  end if;

  select * into v_keep from companies where id = p_keep and clinic_id = v_clinic for update;
  if not found then raise exception 'no_keep' using hint = 'الشركةُ الباقيةُ غيرُ موجودة بعيادتك.'; end if;
  select * into v_drop from companies where id = p_drop and clinic_id = v_clinic for update;
  if not found then raise exception 'no_drop' using hint = 'الشركةُ المطويّةُ غيرُ موجودة بعيادتك.'; end if;

  -- اللقطةُ **قبل** أيّ تعديلٍ يمحو الحالةَ القديمة، ومعها ملاحظةُ الباقية
  -- قبل الاتّحاد.
  insert into companies_trash (id, clinic_id, row, merged_into, product_ids, purchase_ids, payment_ids, charge_ids, sections, keep_note)
  select p_drop, v_clinic, to_jsonb(v_drop), p_keep,
         coalesce((select array_agg(id) from products          where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from purchases         where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from purchase_payments where company_id = p_drop and clinic_id = v_clinic), '{}'),
         coalesce((select array_agg(id) from company_charges   where company_id = p_drop and clinic_id = v_clinic), '{}'),
         '[]'::jsonb, v_keep.note
  on conflict (id) do nothing;

  insert into company_merges (from_id, to_id, clinic_id, from_name)
  values (p_drop, p_keep, v_clinic, v_drop.name)
  on conflict (from_id) do nothing;

  update products          set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;
  update purchases         set company_id = p_keep, company_name = v_keep.name
                         where company_id = p_drop and clinic_id = v_clinic;
  update purchase_payments set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;
  update company_charges   set company_id = p_keep where company_id = p_drop and clinic_id = v_clinic;

  update products_trash
     set row = jsonb_set(row, '{company_id}', to_jsonb(p_keep::text))
   where clinic_id = v_clinic and (row->>'company_id')::uuid = p_drop;

  for v_sec in select * from company_sections where company_id = p_drop and clinic_id = v_clinic loop
    select id into v_match from company_sections
     where company_id = p_keep and clinic_id = v_clinic
       and inv_norm_group(name) = inv_norm_group(v_sec.name)
     order by created_at limit 1;

    -- **قبل النقل**: منتجاتُ هذا الصنف وحدَه. قراءتُها بعده تحمل منتجاتِ
    -- الباقي كذلك، فيردُّها الفكُّ إلى صنفٍ لم تكن فيه قطّ.
    v_pids := coalesce((select array_agg(p.id) from products p
                         where p.section_id = v_sec.id and p.clinic_id = v_clinic), '{}');

    if v_match is not null then
      v_moved := round(coalesce(v_sec.pooled_stock, 0), 3);
      update company_sections set pooled_stock = round(coalesce(pooled_stock, 0) + v_moved, 3)
       where id = v_match and clinic_id = v_clinic;
      update products set section_id = v_match where section_id = v_sec.id and clinic_id = v_clinic;
      update products_trash set row = jsonb_set(row, '{section_id}', to_jsonb(v_match::text))
       where clinic_id = v_clinic and (row->>'section_id')::uuid = v_sec.id;
      v_secs := v_secs || jsonb_build_object(
        'id', v_sec.id, 'name', v_sec.name, 'pooled_moved', v_moved, 'folded_into', v_match,
        'product_ids', v_pids);
      delete from company_sections where id = v_sec.id and clinic_id = v_clinic;
      -- والمحفّزُ صوّره بـ«حذفٌ صريح» (لا يعرف الطيّ): يُصحَّح بعد الحذف
      -- فلا يتناقض سجلّان عن حدثٍ واحد، ويصحّ استرجاعُ الصنف وحدَه.
      update company_sections_trash
         set folded_into = v_match, pooled_moved = v_moved, product_ids = v_pids
       where id = v_sec.id and clinic_id = v_clinic;
    else
      update company_sections set company_id = p_keep where id = v_sec.id and clinic_id = v_clinic;
      v_secs := v_secs || jsonb_build_object(
        'id', v_sec.id, 'name', v_sec.name, 'pooled_moved', 0, 'folded_into', null, 'product_ids', '{}'::uuid[]);
    end if;
  end loop;

  update companies_trash set sections = v_secs where id = p_drop;

  -- **الملاحظةُ اتّحادٌ لا `coalesce`**: حقلٌ تكتبه العيادة — لو حمل الطرفان
  -- نصّاً ضاع أحدُهما. وشرطُ التساوي يمنع تكديسَ نفس النصّ عند طيٍّ متكرّر.
  update companies
     set note = nullif(btrim(case
           when btrim(coalesce(v_keep.note, '')) = btrim(coalesce(v_drop.note, ''))
             then coalesce(v_keep.note, v_drop.note)
           else concat_ws(E'\n', nullif(btrim(v_keep.note), ''), nullif(btrim(v_drop.note), ''))
         end), '')
   where id = p_keep and clinic_id = v_clinic
  returning * into v_keep;

  delete from companies where id = p_drop and clinic_id = v_clinic;
  return v_keep;
end $$;

revoke all on function public.merge_companies(uuid, uuid) from public, anon;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;

-- ── والفكُّ يردّ الملاحظة كذلك ────────────────────────────────────────────
-- **بشرط أنها ما زالت حيث تركها الطيّ**: لو كتبت العيادةُ ملاحظةً جديدةً بعده
-- فهي ملكُها، ولا يدهسها الفكّ. نفسُ شرط بقيّة الحقول بهذه الدالّة.
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

    -- فكُّ اتّحاد الملاحظتين: يُعاد حسابُ ما أنتجه الطيُّ بنفس تعبيره، ولا
    -- يُكتب إلا إن كانت الملاحظةُ ما زالت هي بالحرف.
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
      -- القائمةُ الآن **منتجاتُ المطويّ وحدَه** (أُخذت قبل النقل)، فلا يُسحب
      -- معها منتجُ الباقي.
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
