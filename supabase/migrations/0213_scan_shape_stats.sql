-- ============================================================================
-- ٠٢١٣ — قياسٌ صامت لصيغ المسح (م٣، docs/inventory-vnext-plan.md)
--
-- م٣ تريد أن تعبّي مسحةُ الاستلام تاريخَ الانتهاء من DataMatrix بصيغة GS1.
-- وقبلها ثلاثةُ مجاهيل لا يحسمها إلا القياس: هل ماسحاتُ العيادات ثنائيّةُ الأبعاد؟
-- هل ترسل رأسَ AIM؟ هل يصل فاصلُ FNC1؟ ميزةٌ تُبنى على الحدس قد تُبنى لماسحٍ
-- لا يوجد. فهذا عدّادٌ **فقط**: `src/lib/gs1.ts` يصنّف، و`scanStats.ts` يعدّ
-- بالجهاز ويرفع مرّةً بالساعة. أسبوعٌ ثمّ تُعرض النتيجةُ على المالك.
--
-- ── ما يُحفظ ────────────────────────────────────────────────────────────
-- لكلّ عيادةٍ ويوم: أعدادٌ بالصيغة والشاشة (`sale:ean13` = ٤١٢)، وحتى عشرين
-- عيّنةً من مسحاتٍ بشكل GS1 كما وصلت (المحارفُ الخفيّة ظاهرة) — رموزُ منتجات،
-- لا بياناتِ زبائن.
--
-- ── ما لا يكون ──────────────────────────────────────────────────────────
-- لا يراه أحدٌ من العيادات: RLS مفعّل **بلا سياسة**، ولا صلاحيةَ جدولٍ لأحد —
-- يُقرأ بالاستعلام المباشر للقياس وحده. ولا أثرَ لدخول المشغّل (اتفاقُ 0151):
-- `is_platform_admin()` يُرجع بلا كتابة. ولا يُكتب بعيادةٍ غير عيادة المُستدعي:
-- العدُّ مختومٌ بعيادته بالجهاز، والدالّةُ ترفض إن اختلفت عن `auth_clinic()`.
-- والمدخلاتُ مقصوصة: مفاتيحُ بشكلٍ معروف، وأعدادٌ ≤ ١٠٬٠٠٠ بالدفعة، وأيامٌ قريبة.
--
-- تراجع: drop function note_scan_shapes; drop table scan_shape_stats;
-- تُطبَّق بعد 0212. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

create table if not exists scan_shape_stats (
  clinic_id  uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  counts     jsonb not null default '{}'::jsonb,
  samples    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (clinic_id, day)
);
alter table scan_shape_stats enable row level security;
revoke all on table scan_shape_stats from anon, authenticated;
comment on table scan_shape_stats is
  'قياسُ صيغ المسح (0213): أعدادٌ بالصيغة والشاشة لكلّ عيادةٍ ويوم، وعيّناتُ GS1 كما وصلت. بلا سياسة — لا تراه العيادات؛ يُقرأ للقياس وحده.';

create or replace function public.note_scan_shapes(p_day date, p_counts jsonb, p_samples text[] default '{}', p_clinic uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_clean   jsonb := '{}'::jsonb;
  v_samples text[];
  r         record;
  v_n       int;
begin
  -- لا هويّة، أو مشغّلُ المنصّة داخلٌ (لا أثرَ له بالعيادة — 0151)، أو عدُّ عيادةٍ
  -- أخرى وصل من جهازٍ مشترك: يُسقط بصمت. هذا قياسٌ، والرفضُ الصاخب لا يفيد أحداً.
  if v_clinic is null or is_platform_admin() then return; end if;
  if p_clinic is not null and p_clinic <> v_clinic then return; end if;
  if p_day is null or p_day < current_date - 30 or p_day > current_date + 1 then return; end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then return; end if;

  for r in select key, value from jsonb_each(p_counts) loop
    continue when r.key !~ '^(sale|purchase):[a-z0-9_]{2,16}$' or jsonb_typeof(r.value) <> 'number';
    v_n := least(greatest(floor((r.value #>> '{}')::numeric)::int, 0), 10000);
    continue when v_n = 0;
    v_clean := v_clean || jsonb_build_object(r.key, v_n);
  end loop;
  select coalesce(array_agg(left(x, 80)), '{}') into v_samples
    from (select x from unnest(coalesce(p_samples, '{}')) x where x is not null limit 5) q;
  if v_clean = '{}'::jsonb and cardinality(v_samples) = 0 then return; end if;

  insert into scan_shape_stats as s (clinic_id, day, counts, samples)
  values (v_clinic, p_day, v_clean, v_samples)
  on conflict (clinic_id, day) do update set
    counts = (select coalesce(jsonb_object_agg(k, coalesce((s.counts->>k)::int, 0) + coalesce((excluded.counts->>k)::int, 0)), '{}'::jsonb)
                from (select jsonb_object_keys(s.counts) k union select jsonb_object_keys(excluded.counts)) keys),
    samples = (s.samples || excluded.samples)[1:20],
    updated_at = now();
end $$;
revoke all on function public.note_scan_shapes(date, jsonb, text[], uuid) from public, anon;
grant execute on function public.note_scan_shapes(date, jsonb, text[], uuid) to authenticated;
