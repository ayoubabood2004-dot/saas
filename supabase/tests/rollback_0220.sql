-- ============================================================================
-- تراجعُ 0220 — **لا يُنزَّل مع الهجرات**. يُشغَّل يدوياً (محرّر SQL بدور postgres) إن
-- لزم إرجاعُ الواجهة القديمة بعد القطع. ويُجرَّب بآخر `run.sh` كي لا يكون ورقاً.
--
-- ١) يكتب صفوفَ الأقفاص الحالية رسمةً v2 بعمود `cage_layout` ويرفع النسخة: الواجهةُ
--    القديمة تفتح على ترتيب اليوم لا على الرسمة المجمَّدة منذ القطع.
-- ٢) يعيد `save_cage_layout` بنصّ 0204 حرفاً (بشرط النسخة والعلم)، والحارسَ لصيغته
--    (UPDATE فقط).
-- الجداولُ الجديدة تُترك كما هي (خاملة) — لا حذفَ لبيانات.
-- ============================================================================

update public.clinic_prefs cp
   set cage_layout = jsonb_build_object(
         'v', 2,
         'rooms', coalesce((select jsonb_agg(
             jsonb_build_object('id', coalesce(r.legacy_id, r.id::text), 'name', r.name,
                                'x', r.x, 'z', r.z, 'w', r.w, 'd', r.d)
             || case when r.door_side is not null
                     then jsonb_build_object('door', jsonb_build_object('side', r.door_side, 'at', coalesce(r.door_at, 0)))
                     else '{}'::jsonb end
             order by r.x, r.z, r.created_at, r.id)
           from public.cage_rooms r where r.clinic_id = cp.clinic_id), '[]'::jsonb),
         'cages', coalesce((select jsonb_agg(
             jsonb_build_object('code', c.code, 'x', c.x, 'z', c.z)
             || case when c.color is not null then jsonb_build_object('color', c.color) else '{}'::jsonb end
             || case when c.facing <> 0 then jsonb_build_object('facing', c.facing) else '{}'::jsonb end
             || case when c.level <> 0 then jsonb_build_object('level', c.level) else '{}'::jsonb end
             order by c.z, c.x, c.level, c.created_at, c.id)
           from public.cages c where c.clinic_id = cp.clinic_id), '[]'::jsonb))::text,
       cage_layout_rev = cage_layout_rev + 1,
       updated_at = now()
 where exists (select 1 from public.cage_rooms r where r.clinic_id = cp.clinic_id);

create or replace function public.save_cage_layout(p_json text, p_base_rev integer)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_cur    integer;
  v_raw    text;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;

  select cage_layout_rev, cage_layout into v_cur, v_raw
    from clinic_prefs where clinic_id = v_clinic for update;

  if not found then
    insert into clinic_prefs (clinic_id, cage_layout, cage_layout_rev)
    values (v_clinic, p_json, 1);
    return jsonb_build_object('ok', true, 'rev', 1);
  end if;

  if v_cur <> coalesce(p_base_rev, -1)
     or (coalesce(p_base_rev, -1) = 0 and coalesce(v_raw, '') <> '') then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', v_cur, 'layout', v_raw);
  end if;

  perform set_config('vp.cage_layout_write', '1', true);
  update clinic_prefs
     set cage_layout = p_json, cage_layout_rev = v_cur + 1, updated_at = now()
   where clinic_id = v_clinic;
  perform set_config('vp.cage_layout_write', '', true);

  return jsonb_build_object('ok', true, 'rev', v_cur + 1);
end $function$;
revoke all on function public.save_cage_layout(text, integer) from public, anon;
grant execute on function public.save_cage_layout(text, integer) to authenticated;

create or replace function public.clinic_prefs_cage_layout_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if coalesce(current_setting('vp.cage_layout_write', true), '') = '1' then return new; end if;
  if new.cage_layout is distinct from old.cage_layout
     or new.cage_layout_rev is distinct from old.cage_layout_rev then
    raise exception 'cage_layout_direct_write'
      using hint = 'ترتيب الأقفاص ينحفظ من شاشة غرفة الأقفاص وحدها — حدّث الصفحة وجرّب من هناك.';
  end if;
  return new;
end $$;
drop trigger if exists clinic_prefs_cage_layout_guard on public.clinic_prefs;
create trigger clinic_prefs_cage_layout_guard
  before update of cage_layout, cage_layout_rev on public.clinic_prefs
  for each row execute function public.clinic_prefs_cage_layout_guard();
