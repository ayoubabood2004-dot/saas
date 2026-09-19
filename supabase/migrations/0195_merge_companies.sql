-- ============================================================================
-- ٠١٩٥ — طيُّ الشركات المكرَّرة باسمٍ واحد: دفترُ المورّد يرجع دفتراً واحداً
--
-- ── الحاجة ───────────────────────────────────────────────────────────────
-- مفتاحُ مطابقةِ اسم الشركة بالواجهة كان يُقارَن بطرفٍ خامّ، فكلُّ حفظٍ يُنشئ شركةً
-- جديدة بنفس الاسم (أُصلح بالواجهة). والمتراكمُ مقيسٌ بالإنتاج: ١٦ اسماً مكرَّراً،
-- ٦٩ نسخةً زائدة بأربع عيادات، عليها ٩٨٨ منتجاً و٥٦ صنفاً — فدفترُ المورّد الواحد
-- مقسومٌ على نسخٍ، ودَينُه مفرَّقٌ بينها، و«رتّب المخزن» لا يطوي توأمَ منتجٍ لأن
-- شركتيهما «مختلفتان».
--
-- ── ماذا تفعل ────────────────────────────────────────────────────────────
--   • الأصنافُ المتشابهةُ بالاسم تُطوى بصنف الشركة الباقية، **وحوضُها يُجمع** —
--     `pooled_stock` وحداتٌ حقيقية تُباع، فلا تُهمل ولا تُكتب فوقها.
--   • وما لا نظيرَ له من الأصناف يُنقل كما هو.
--   • وكلُّ ما يشير إلى المطويّة (منتجات، فواتيرُ شراء، تسديداتٌ، أعباء) يشير إلى
--     الباقية، **وصورُ المحذوفات تُصحَّح معها**: صفٌّ بسلّة المحذوفات يحمل بصورته
--     `company_id` لشركةٍ ستُحذف لا يُستعاد أبداً (مفتاحٌ أجنبيّ مكسور) — وهذا ضررٌ
--     صامتٌ لا يُكتشف إلا يوم يُحتاج الاسترجاع.
--   • ثم تُحذف المطويّةُ (فارغةً بعدها)، ويُكتب سطرٌ بسجلّ العيادة بما انتقل.
--
-- ── لماذا `security definer` مع فحصٍ بيدها (CLAUDE.md §٣) ────────────────
-- تكتب بجداولَ سياساتُها تسمح للكادر بالقراءة والكتابة ضمن عيادته؛ والدالّةُ تفحص
-- **بنفسها**: عيادةُ المُستدعي (`auth_clinic()`) ودورُه (مدير/طبيب)، وكلُّ صفٍّ تلمسه
-- مشروطٌ بـ`clinic_id = v_clinic`. لا تعمل عبر العيادات بحال.
--
-- إضافيّةٌ ويُعاد تنفيذُها بلا أثرٍ ثانٍ. تراجع: `drop function merge_companies(uuid, uuid[]);`
-- (الطيُّ نفسُه لا يُتراجع آلياً — ولهذا يُقال للعيادة ما الذي سينتقل قبل أن تضغط،
--  والسطرُ بسجلّ الحركات يحمل المعرّفاتِ والأعداد.)
-- ============================================================================

create or replace function merge_companies(p_keep uuid, p_drop uuid[])
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_drop   uuid[];
  v_sec    record;
  v_target uuid;
  v_prod int := 0; v_secm int := 0; v_secj int := 0;
  v_pur int := 0; v_pay int := 0; v_chg int := 0; v_trash int := 0; v_gone int := 0;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;
  if p_keep is null then raise exception 'company to keep is required'; end if;
  perform 1 from companies where id = p_keep and clinic_id = v_clinic;
  if not found then raise exception 'company to keep not found'; end if;

  -- المطويّاتُ من عيادة المُستدعي وحدها، والباقيةُ ليست منها.
  select coalesce(array_agg(id), '{}') into v_drop
    from companies where id = any(coalesce(p_drop, '{}')) and clinic_id = v_clinic and id <> p_keep;
  if coalesce(array_length(v_drop, 1), 0) = 0 then raise exception 'no companies to merge'; end if;

  -- ١) الأصناف: المتشابهُ بالاسم يُطوى وحوضُه يُجمع، وغيرُه يُنقل كما هو.
  for v_sec in
    select s.id, s.name, coalesce(s.pooled_stock, 0) as pool
      from company_sections s
     where s.company_id = any(v_drop) and s.clinic_id = v_clinic
     order by s.created_at
  loop
    select t.id into v_target
      from company_sections t
     where t.company_id = p_keep and t.clinic_id = v_clinic
       and regexp_replace(inv_norm_name(t.name), '\s+', '', 'g')
         = regexp_replace(inv_norm_name(v_sec.name), '\s+', '', 'g')
     order by t.created_at
     limit 1;
    if v_target is null then
      update company_sections set company_id = p_keep where id = v_sec.id;
      v_secm := v_secm + 1;
    else
      update products set section_id = v_target where section_id = v_sec.id and clinic_id = v_clinic;
      update company_sections set pooled_stock = coalesce(pooled_stock, 0) + v_sec.pool where id = v_target;
      update products_trash set row = jsonb_set(row, '{section_id}', to_jsonb(v_target::text))
       where clinic_id = v_clinic and row->>'section_id' = v_sec.id::text;
      delete from company_sections where id = v_sec.id;
      v_secj := v_secj + 1;
    end if;
    v_target := null;
  end loop;

  -- ٢) كلُّ إشارةٍ إلى المطويّة تصير إلى الباقية.
  update products set company_id = p_keep where company_id = any(v_drop) and clinic_id = v_clinic;
  get diagnostics v_prod = row_count;
  update purchases set company_id = p_keep where company_id = any(v_drop) and clinic_id = v_clinic;
  get diagnostics v_pur = row_count;
  update purchase_payments set company_id = p_keep where company_id = any(v_drop) and clinic_id = v_clinic;
  get diagnostics v_pay = row_count;
  update company_charges set company_id = p_keep where company_id = any(v_drop) and clinic_id = v_clinic;
  get diagnostics v_chg = row_count;

  -- ٣) وصورُ المحذوفات: صفٌّ يشير لشركةٍ ستُحذف لا يُستعاد أبداً.
  update products_trash set row = jsonb_set(row, '{company_id}', to_jsonb(p_keep::text))
   where clinic_id = v_clinic and nullif(row->>'company_id', '') is not null
     and (row->>'company_id')::uuid = any(v_drop);
  get diagnostics v_trash = row_count;

  delete from companies where id = any(v_drop) and clinic_id = v_clinic;
  get diagnostics v_gone = row_count;

  -- سطرٌ بسجلّ العيادة بما انتقل — الطيُّ لا يُتراجع آلياً، فليبقَ أثرُه مقروءاً.
  begin
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (v_clinic, auth.uid(), 'UPDATE', 'company', p_keep,
            jsonb_build_object('event', 'company.merge', 'dropped', to_jsonb(v_drop),
                               'products', v_prod, 'sections_moved', v_secm, 'sections_merged', v_secj,
                               'purchases', v_pur, 'payments', v_pay, 'charges', v_chg, 'trash', v_trash));
  exception when others then null;
  end;

  return jsonb_build_object('companies', v_gone, 'products', v_prod, 'sections_moved', v_secm,
                            'sections_merged', v_secj, 'purchases', v_pur, 'payments', v_pay,
                            'charges', v_chg, 'trash', v_trash);
end $$;

revoke all on function merge_companies(uuid, uuid[]) from public, anon;
grant execute on function merge_companies(uuid, uuid[]) to authenticated;
