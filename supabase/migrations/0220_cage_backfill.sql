-- ============================================================================
-- ٠٢٢٠ — ترحيلُ تخطيط الأقفاص من النصّ إلى الصفوف، وقطعُ الباب القديم
--
-- ── ما تفعله ─────────────────────────────────────────────────────────────
-- ١) `backfill_cage_layout`: تقرأ `clinic_prefs.cage_layout` بشكليه (v1 مصفوفةٌ
--    قديمة، v2 كائنٌ بالهندسة) وتكتبه صفوفاً في `cage_rooms`/`cages`. المحلّلُ هنا
--    **مرآةُ `parseLayout`/`upgradeV1`** بـ`src/lib/cageLayout.ts` حقلاً حقلاً — فما
--    تراه العيادةُ اليوم هو ما بالصفوف غداً، لا قفصَ يتحرّك عن خانته.
--    وكلُّ فشلٍ = صفرُ صفوفٍ لتلك العيادة مع سطرٍ بالتقرير، **لا بذرة**.
--    عيادةٌ لها صفوفٌ لا تُمسّ أبداً: فتُعاد الدالّةُ بلا أثرٍ ثانٍ ولا تدهس تعديلاً.
-- ٢) إدراجُ القفص يربط ساكنَه تلقائياً (محفّز 0219)، و`backfill_admission_cages`
--    تمرّ مرّةً ثانيةً على الإقامات النشطة كشبكة أمان.
-- ٣) **القطع**: `save_cage_layout` صارت ترمي `cage_layout_moved` بجملةٍ عربية. حزمةٌ
--    قديمة بمتصفّحٍ لم يُحدَّث لا تكتب رسمتَها بعد اليوم — وهي بالضبط الكاتبُ الذي
--    قاس التدقيقُ أنه مسموم. والعمودُ القديم يبقى مجمّداً للقراءة (أرشيفٌ ومرجعُ تراجع).
-- ٤) حارسُ 0204 يشمل INSERT: «احذف الصفّ وأدخله من جديد» لم يعد باباً خلفياً.
--
-- المقيسُ بالإنتاج قبل الكتابة (٢٧/٩): ٧ تخطيطات (٦ v1 + ١ v2)، أطولُ رمزٍ ١٩ حرفاً
-- وأطولُ اسم غرفة ١٤، صفرُ توائم وصفرُ خلايا مزدوجة، ٢٣ إقامةً نشطة بقفص وصفرُ
-- ازدواج. تراجع: `supabase/tests/rollback_0220.sql` (يُجرَّب بآخر الحزمة).
-- تُطبَّق بعد 0219.
-- ============================================================================

-- ختمُ «رُحِّلت»: عيادةٌ رُحّلت ثم أفرغت أقفاصَها عمداً لا ترجع لها رسمتُها المجمَّدة إن
-- أُعيدت الهجرة (القاعدةُ: تُعاد بلا أثرٍ ثانٍ).
alter table public.clinic_prefs add column if not exists cage_layout_migrated_at timestamptz;

-- مرآةُ `str()`: `String(v ?? "").trim()` — النصُّ والرقمُ كما يُكتبان، والباقي فارغ.
create or replace function public._cage_bf_str(v jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then ''
    when jsonb_typeof(v) in ('string', 'number', 'boolean')
      then regexp_replace(v #>> '{}', '^[[:space:]' || chr(160) || chr(65279) || ']+|[[:space:]' || chr(160) || chr(65279) || ']+$', '', 'g')
    else '' end
$$;

-- مرآةُ `int(v, dflt)`: `Math.round(Number(v))`، وما ليس رقماً ⇒ الافتراضي.
create or replace function public._cage_bf_int(v jsonb, dflt integer)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare s text; n numeric;
begin
  if v is null then return dflt; end if;
  case jsonb_typeof(v)
    when 'number' then n := (v #>> '{}')::numeric;
    when 'null' then n := 0;
    when 'boolean' then n := case when (v #>> '{}') = 'true' then 1 else 0 end;
    when 'string' then
      s := public._cage_bf_str(v);
      if s = '' then n := 0;
      elsif s ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then n := s::numeric;
      else return dflt;
      end if;
    else return dflt;
  end case;
  return floor(n + 0.5)::integer;   -- Math.round: النصفُ يُقرَّب للأعلى
exception when others then
  return dflt;
end $$;

create or replace function public.backfill_cage_layout(p_clinic uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pref   record;
  j      jsonb;
  rep    jsonb := '[]'::jsonb;
  seen   text[];
  e      jsonb;
  ce     jsonb;
  codes  text[];
  v_id   text;
  v_name text;
  v_code text;
  v_side text;
  v_x    integer;
  v_w    integer;
  v_d    integer;
  i      integer;
  v_room uuid;
  v_fac  integer;
  v_orph uuid;
  v_rooms uuid[];
begin
  for pref in
    select cp.clinic_id, cp.cage_layout raw
      from clinic_prefs cp
     where coalesce(cp.cage_layout, '') <> ''
       and cp.clinic_id is not null
       and cp.cage_layout_migrated_at is null
       and (p_clinic is null or cp.clinic_id = p_clinic)
       and not exists (select 1 from cage_rooms r where r.clinic_id = cp.clinic_id)
       and not exists (select 1 from cages c where c.clinic_id = cp.clinic_id)
     order by cp.clinic_id
  loop
    begin
      j := pref.raw::jsonb;
    exception when others then
      rep := rep || jsonb_build_object('clinic', pref.clinic_id, 'skipped', 'bad_json');
      continue;
    end;

    begin
      seen := '{}';
      v_rooms := '{}';
      if jsonb_typeof(j) = 'array' then
        -- ── v1: مرآةُ parseLayout ثم upgradeV1 ──
        v_x := 0;
        for e in select value from jsonb_array_elements(j) loop
          continue when jsonb_typeof(e) <> 'object';
          v_id := public._cage_bf_str(e->'id');
          v_name := public._cage_bf_str(e->'name');
          continue when v_id = '' or v_name = '';
          codes := '{}';
          if jsonb_typeof(e->'cages') = 'array' then
            for ce in select value from jsonb_array_elements(e->'cages') loop
              v_code := public._cage_bf_str(ce);
              continue when v_code = '' or lower(v_code) = any(seen);
              seen := seen || lower(v_code);
              codes := codes || v_code;
            end loop;
          end if;
          v_w := greatest(1, least(6, coalesce(array_length(codes, 1), 1)));
          v_d := greatest(1, ceil(coalesce(array_length(codes, 1), 1)::numeric / v_w)::integer);
          insert into cage_rooms (clinic_id, legacy_id, name, x, z, w, d)
          values (pref.clinic_id, v_id, v_name, v_x, 0, v_w, v_d)
          returning id into v_room;
          for i in 1 .. coalesce(array_length(codes, 1), 0) loop
            insert into cages (clinic_id, room_id, code, x, z)
            values (pref.clinic_id, v_room, codes[i], v_x + ((i - 1) % v_w), (i - 1) / v_w);
          end loop;
          v_x := v_x + v_w + 1;
        end loop;

      elsif jsonb_typeof(j) = 'object' then
        -- ── v2: مرآةُ parseRoom/parseCage — والرفُّ الأوّلُ الحاوي يملك القفص (roomAt) ──
        if jsonb_typeof(j->'rooms') = 'array' then
          for e in select value from jsonb_array_elements(j->'rooms') loop
            continue when jsonb_typeof(e) <> 'object';
            v_id := public._cage_bf_str(e->'id');
            v_name := public._cage_bf_str(e->'name');
            continue when v_id = '' or v_name = '';
            v_side := public._cage_bf_str(e#>'{door,side}');
            insert into cage_rooms (clinic_id, legacy_id, name, x, z, w, d, door_side, door_at)
            values (pref.clinic_id, v_id, v_name,
                    public._cage_bf_int(e->'x', 0), public._cage_bf_int(e->'z', 0),
                    greatest(1, public._cage_bf_int(e->'w', 1)), greatest(1, public._cage_bf_int(e->'d', 1)),
                    case when v_side in ('front','back','left','right') then v_side end,
                    case when v_side in ('front','back','left','right')
                         then greatest(0, public._cage_bf_int(e#>'{door,at}', 0)) end)
            returning id into v_room;
            v_rooms := v_rooms || v_room;
          end loop;
        end if;
        if jsonb_typeof(j->'cages') = 'array' then
          for ce in select value from jsonb_array_elements(j->'cages') loop
            continue when jsonb_typeof(ce) <> 'object';
            v_code := public._cage_bf_str(ce->'code');
            continue when v_code = '' or lower(v_code) = any(seen);
            seen := seen || lower(v_code);
            v_x := public._cage_bf_int(ce->'x', 0);
            i := public._cage_bf_int(ce->'z', 0);
            -- الغرفةُ الحاوية بترتيب الإدراج (= ترتيب المصفوفة، كـ`roomAt`).
            select r.id into v_room
              from unnest(v_rooms) with ordinality u(id, ord)
              join cage_rooms r on r.id = u.id
             where v_x >= r.x and v_x < r.x + r.w and i >= r.z and i < r.z + r.d
             order by u.ord
             limit 1;
            if v_room is null then
              -- قفصٌ خارج كلّ غرفة (المقيس: صفر) — غرفةٌ واحدةٌ تحويه لا اختراعُ مواقع.
              if v_orph is null then
                insert into cage_rooms (clinic_id, name, x, z, w, d)
                values (pref.clinic_id, 'غير مصنّفة', v_x, i, 1, 1)
                returning id into v_orph;
              end if;
              update cage_rooms
                 set x = least(x, v_x), z = least(z, i),
                     w = greatest(x + w, v_x + 1) - least(x, v_x),
                     d = greatest(z + d, i + 1) - least(z, i)
               where id = v_orph;
              v_room := v_orph;
            end if;
            v_fac := public._cage_bf_int(ce->'facing', 0);
            insert into cages (clinic_id, room_id, code, x, z, color, facing, level)
            values (pref.clinic_id, v_room, v_code, v_x, i,
                    nullif(public._cage_bf_str(ce->'color'), ''),
                    case when v_fac in (1, 2, 3) then v_fac else 0 end,
                    case when public._cage_bf_int(ce->'level', 0) = 1 then 1 else 0 end);
            v_room := null;
          end loop;
        end if;
        v_orph := null;
        -- `rev` المضمَّن يُتجاهل: لا نسخةَ بالنظام الجديد أصلاً.
      end if;

      update clinic_prefs set cage_layout_migrated_at = now() where clinic_id = pref.clinic_id;
      rep := rep || jsonb_build_object('clinic', pref.clinic_id,
        'rooms', (select count(*) from cage_rooms where clinic_id = pref.clinic_id),
        'cages', (select count(*) from cages where clinic_id = pref.clinic_id));
    exception when others then
      -- عيادةٌ واحدة خربة لا تُجهض الجميع؛ وما كُتب لها قبل الخطأ يرتدّ مع كتلتها.
      rep := rep || jsonb_build_object('clinic', pref.clinic_id, 'skipped', sqlerrm);
      v_orph := null;
    end;
  end loop;
  return rep;
end $$;

-- شبكةُ أمان: إقامةٌ نشطة برمزٍ يطابق قفصاً وبلا معرّف ⇒ تُربط، والأقدمُ يجلس إن
-- تزاحم اثنان على قفص (المقيس: صفرُ ازدواج). محصّنةٌ ضدّ الفهرس فتُعاد بعد قيامه.
create or replace function public.backfill_admission_cages(p_clinic uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('vp.cage_mirror', '1', true);
  with cand as (
    select a.id adm, c.id cage,
           row_number() over (partition by c.id order by a.admitted_on, a.created_at, a.id) rn
      from admissions a
      join cages c on c.clinic_id = a.clinic_id
                  and lower(btrim(c.code)) = lower(btrim(coalesce(a.cage, '')))
     where a.status = 'active' and a.cage_id is null and a.clinic_id is not null
       and (p_clinic is null or a.clinic_id = p_clinic)
       and not exists (select 1 from admissions o where o.cage_id = c.id and o.status = 'active')
  )
  update admissions a set cage_id = cand.cage
    from cand where cand.adm = a.id and cand.rn = 1;
  get diagnostics n = row_count;
  perform set_config('vp.cage_mirror', '', true);
  return jsonb_build_object('linked', n,
    'active_orphans', (select count(*) from admissions
                        where status = 'active' and cage_id is null and coalesce(btrim(cage), '') <> ''
                          and (p_clinic is null or clinic_id = p_clinic)));
end $$;

revoke all on function public._cage_bf_str(jsonb) from public, anon, authenticated;
revoke all on function public._cage_bf_int(jsonb, integer) from public, anon, authenticated;
revoke all on function public.backfill_cage_layout(uuid) from public, anon, authenticated;
revoke all on function public.backfill_admission_cages(uuid) from public, anon, authenticated;
grant execute on function public.backfill_cage_layout(uuid) to service_role;
grant execute on function public.backfill_admission_cages(uuid) to service_role;

-- ── الترحيل نفسُه (تقريرُه يظهر بمخرج التطبيق ويُقارن بالقياس أعلاه) ──
select public.backfill_cage_layout(null);
select public.backfill_admission_cages(null);

-- **لا قطعَ فوق ترحيلٍ ناقص**: عيادةٌ رسمتُها فيها غرفٌ وفشل ترحيلُها بصمت (تقريرُ
-- الدالّة لا يظهر بمخرج `apply_migration`) كانت ستفتح غداً على «ما مرسوم شي» وكلُّ
-- راقديها يتامى. فالهجرةُ كلُّها ترتدّ هنا — ولا يُقطع الحفظُ القديم.
do $$
declare
  n integer := 0;
  r record;
  j jsonb;
begin
  for r in select cp.clinic_id, cp.cage_layout from clinic_prefs cp
            where coalesce(cp.cage_layout, '') <> '' and cp.cage_layout_migrated_at is null
              and not exists (select 1 from cage_rooms x where x.clinic_id = cp.clinic_id)
  loop
    begin j := r.cage_layout::jsonb; exception when others then continue; end;   -- خردة: لا شيء يُفقد
    if (jsonb_typeof(j) = 'array' and jsonb_array_length(j) > 0)
       or (jsonb_typeof(j) = 'object' and (jsonb_array_length(coalesce(j->'rooms', '[]')) > 0
                                          or jsonb_array_length(coalesce(j->'cages', '[]')) > 0)) then
      n := n + 1;
      raise warning 'cage backfill left clinic % without rows', r.clinic_id;
    end if;
  end loop;
  if n > 0 then
    raise exception 'cage_backfill_incomplete: % clinic(s) have a layout but no rows — cutover aborted', n;
  end if;
end $$;

-- ── القطع ─────────────────────────────────────────────────────────────────
-- ترمي لا ترجع `{ok:false}`: الحزمةُ القديمة كانت ستقرأ ذلك «تعارضاً» وتعرض زرَّ
-- «احفظ نسختي فوقها» الذي يفشل للأبد. وتبقى ممنوحةً: النزعُ يعطي 42501 بلا جملة.
create or replace function public.save_cage_layout(p_json text, p_base_rev integer)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'cage_layout_moved'
    using hint = 'انتقل ترتيب الأقفاص لنظام جديد — حدّث الصفحة (Ctrl+F5) ويرجع الحفظ يشتغل. ترتيبك المحفوظ ما انمسّ.';
end $$;
revoke all on function public.save_cage_layout(text, integer) from public, anon;
grant execute on function public.save_cage_layout(text, integer) to authenticated;

-- حارسُ 0204 يشمل الإدراج: صفُّ تفضيلاتٍ جديدٌ لا يولد بتخطيط.
create or replace function public.clinic_prefs_cage_layout_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.cage_layout, '') <> '' or coalesce(new.cage_layout_rev, 0) <> 0 then
      raise exception 'cage_layout_direct_write'
        using hint = 'ترتيب الأقفاص صار بجداوله الخاصة — حدّث الصفحة.';
    end if;
    return new;
  end if;
  if new.cage_layout is distinct from old.cage_layout
     or new.cage_layout_rev is distinct from old.cage_layout_rev then
    raise exception 'cage_layout_direct_write'
      using hint = 'ترتيب الأقفاص صار بجداوله الخاصة — حدّث الصفحة.';
  end if;
  return new;
end $$;
drop trigger if exists clinic_prefs_cage_layout_guard on public.clinic_prefs;
create trigger clinic_prefs_cage_layout_guard
  before insert or update of cage_layout, cage_layout_rev on public.clinic_prefs
  for each row execute function public.clinic_prefs_cage_layout_guard();

comment on function public.save_cage_layout(text, integer) is
  'مقطوعة (0220): الترتيب صار صفوفاً (cage_rooms/cages) ويُكتب بـcage_layout_apply. ترمي cage_layout_moved.';
comment on column public.clinic_prefs.cage_layout is
  'مجمَّد منذ 0220 — أرشيفُ التخطيط القديم ومرجعُ التراجع. الحقيقة في cage_rooms/cages.';
