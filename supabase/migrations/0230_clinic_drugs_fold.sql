-- ============================================================================
-- ٠٢٣٠ — طيُّ القوائم القديمة في «أدويتي» بلا أن يضيع شيء (تتبع 0229)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- قبل 0229 كانت «قائمةُ الطبيب» نصفين بالقاعدة: مفضّلةُ كلّ طبيب (`drug_favorites`،
-- 0221) وأدويةُ العيادة المكتوبة (`clinic_meds`، 0021). المالكُ قرّر أن «أدويتي»
-- قائمةٌ واحدةٌ للعيادة كلّها (جوابُه ١، ٩/١٠): فما حفظه أيُّ طبيبٍ أو أضافته العيادةُ
-- يدخلها كما هو — لا تبدأ عيادةٌ عندها قائمةٌ بقائمةٍ فارغة.
--
-- ── الطيّ ────────────────────────────────────────────────────────────────
-- لكلّ عيادة: المفضّلةُ من كلّ الأطباء أوّلاً (بالمفتاح، أقدمُ كتابةٍ هي الاسم، بترتيب
-- أوّل حفظ)، ثم أدويةُ العيادة بترتيب إضافتها — عائلتُها صنفُها القديم مطويّاً (مرآتُه
-- `familyOfCatalogType` بـmedIndex.ts)، والمجهولُ «أخرى». تدخل «أدويتي» بآخرها.
-- **وما له صفٌّ أصلاً لا يُمسّ** — حتى المؤرشفُ والخارجُ من «أدويتي»: الإعادةُ لا ترجع
-- ما شالته العيادة (درسُ 0153: الكتابةُ الآلية لا تقرّر عن العيادة). والجدولان
-- القديمان لا يُكتب فيهما، و`treatment_entries.medication` لا يُعاد كتابتُه.
--
-- ── ما طُوي مرّةً لا يُطوى ثانية (`clinic_drugs_folded`) ──────────────────────
-- «له صفٌّ» كان يُسأل بالأسماء الحاليّة وحدها. فدواءٌ طُوي ثم سمّته العيادةُ من «أدويتي»
-- (Amoxil ⇒ Amoxil LA، أو تصحيحُ إملاءٍ لاسمٍ حرٍّ من تكرار العلاج) لا يبقى مفتاحُه
-- القديم بأيّ صفّ، فكانت الإعادةُ تُدرجه ثانيةً بآخر «أدويتي» بلا أن يطلبه أحد. الاسمُ
-- يتبدّل والقرارُ لا: كلُّ مفتاحٍ قديمٍ دخل (أو وُجد له صفٌّ لحظةَ الطيّ) يُسجَّل بجدولٍ
-- لا يراه إلا المالك، والإعادةُ تتخطّاه. وما منعه السقفُ لا يُسجَّل — يُطوى حين يتّسع.
--
-- invoker ومنزوعةٌ عن كلّ دور: تجري بهويّة صاحب الهجرة (يتجاوز RLS بالإنتاج —
-- مقيسٌ ١٠/١٠: postgres rolbypassrls). والنسخُ المفتوحةُ بالأجهزة تبقى تكتب بالجدولين
-- القديمين حتى تُحدَّث — فتُعاد الدالّةُ بعد إصدار (B9) لتلتقط ما كُتب بينهما: الجديدُ
-- يدخل، وما طُوي قبله لا يعود مهما صار اسمُه.
--
-- تُطبَّق بعد 0229. وتُعاد بلا أثرٍ ثانٍ (الثانيةُ تضيف صفراً).
-- تراجع: الصفوفُ المطويّة بلا فاعل بسجلّ التدقيق (entity clinic_drugs، actor null) —
--   delete from clinic_drugs where id in (…) بيد المالك؛ والجدولان القديمان سليمان؛
--   drop table clinic_drugs_folded.
-- ============================================================================

set lock_timeout = '5s';

-- سجلُّ المفاتيح المطويّة: لا يلمسه التطبيقُ أبداً — الدالّةُ أدناه وحدها، بهويّة المالك.
create table if not exists public.clinic_drugs_folded (
  clinic_id uuid not null references auth.users(id) on delete cascade,
  k         text not null,
  folded_at timestamptz not null default now(),
  primary key (clinic_id, k)
);
alter table public.clinic_drugs_folded enable row level security;
revoke all on table public.clinic_drugs_folded from public, anon, authenticated;
comment on table public.clinic_drugs_folded is
  'RLS-DENY-ALL-BY-DESIGN — مفاتيحُ (search_norm) ما طواه _clinic_drugs_fold من drug_favorites وclinic_meds في «أدويتي» (0230)، فلا تُعيده إعادةُ الطيّ بعد أن تسمّيه العيادةُ أو تؤرشفه. سياسةُ كتابةٍ هنا تعني أن أيَّ موظّفٍ يمحو القرارَ فيرجع ما شالته العيادة. الطيُّ وحده يلمسه.';

-- الصنفُ الإنكليزيّ القديم ⇒ عائلةُ «أدويتي». مرآتُه familyOfCatalogType (+ TYPE_ALIASES).
create or replace function public._clinic_drugs_family(p_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case btrim(coalesce(p_type, ''))
    when 'Antibiotics' then 'antibiotics'
    when 'NSAIDs & Analgesics' then 'analgesics'
    when 'Anesthetics & Sedatives' then 'anesthetics'
    when 'Antiparasitics' then 'antiparasitics'
    when 'Antifungals' then 'antifungals'
    when 'Corticosteroids' then 'steroids'
    when 'Gastrointestinal' then 'gi'
    when 'Cardiac & Diuretics' then 'cardiac'
    when 'Endocrine & Hormones' then 'endocrine'
    when 'Antihistamines & Dermatology' then 'derm'
    when 'Allergy & Dermatology' then 'derm'
    when 'Fluids & Electrolytes' then 'fluids'
    when 'Emergency & Antidotes' then 'emergency'
    when 'Vitamins & Supplements' then 'vitamins'
    else 'other' end
$$;
revoke all on function public._clinic_drugs_family(text) from public, anon, authenticated;

create or replace function public._clinic_drugs_fold(p_clinic uuid default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  c      uuid;
  r      record;
  v_max  bigint;
  v_live int;
  v_k    int;
  v_out  jsonb := '{}'::jsonb;
begin
  for c in
    select x.clinic_id
      from (select f.clinic_id from drug_favorites f
            union
            select m.clinic_id from clinic_meds m) x
     where x.clinic_id is not null and (p_clinic is null or x.clinic_id = p_clinic)
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || c::text, 0));
    select coalesce(max(d.pos), 0) into v_max from clinic_drugs d where d.clinic_id = c and d.in_mine;
    select count(*) into v_live from clinic_drugs d where d.clinic_id = c and d.archived_at is null;
    v_k := 0;
    for r in
      with src as (
        select search_norm(btrim(f.name)) as k, btrim(f.name) as nm, f.created_at as at, f.id::text as tie,
               0 as src, null::text as typ
          from drug_favorites f where f.clinic_id = c
        union all
        select search_norm(btrim(m.name)), btrim(m.name), m.created_at, m.id::text, 1, m.type
          from clinic_meds m where m.clinic_id = c
      ), firsts as (
        select distinct on (s.k) s.k, s.nm, s.src, s.at
          from src s
         where s.k <> '' and char_length(s.nm) <= 120
         order by s.k, s.src, s.at, s.tie
      ), fam as (
        select distinct on (s.k) s.k, _clinic_drugs_family(s.typ) as family
          from src s
         where s.src = 1 and s.k <> ''
         order by s.k, s.at, s.tie
      )
      select f.k, f.nm, coalesce(fm.family, 'other') as family
        from firsts f
        left join fam fm on fm.k = f.k
       -- ما طُوي مرّةً لا يُطوى ثانية — ولو تبدّل اسمُ صفّه أو أُرشف بعده.
       where not exists (select 1 from clinic_drugs_folded x where x.clinic_id = c and x.k = f.k)
       order by f.src, f.at, f.k
    loop
      -- له صفٌّ الآن (حتى المؤرشفُ والخارجُ من «أدويتي»): لا يُمسّ، ويُسجَّل — فإن تبدّل
      -- اسمُ ذلك الصفّ غداً لم يرجع هذا المفتاح.
      if exists (select 1 from clinic_drugs d where d.clinic_id = c and search_norm(d.name) = r.k) then
        insert into clinic_drugs_folded (clinic_id, k) values (c, r.k) on conflict do nothing;
        continue;
      end if;
      -- السقفُ لا يُكسر ولا يُسقط الهجرة: ما بعده يبقى بجدوله القديم ولا يُسجَّل — يُطوى حين يتّسع.
      continue when v_live >= 400;
      v_k := v_k + 1;
      v_live := v_live + 1;
      insert into clinic_drugs (clinic_id, name, family, in_mine, pos)
      values (c, r.nm, r.family, true, v_max + 1024 * v_k);
      insert into clinic_drugs_folded (clinic_id, k) values (c, r.k) on conflict do nothing;
    end loop;
    if v_k > 0 then
      v_out := v_out || jsonb_build_object(c::text, v_k);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public._clinic_drugs_fold(uuid) from public, anon, authenticated;
comment on function public._clinic_drugs_fold(uuid) is
  'طيّ drug_favorites وclinic_meds في «أدويتي» (0230): لكل عيادة، ما له صفٌّ (حتى المؤرشف) لا يُمسّ، وما طُوي مرّةً (clinic_drugs_folded) لا يعود ولو تبدّل اسمه — الإعادة تضيف صفراً. للمالك وحده.';

select public._clinic_drugs_fold(null);
