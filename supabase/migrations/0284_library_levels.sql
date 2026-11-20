-- ============================================================================
-- ٠٢٨٤ — مكتبةُ الصور بأربعة مستويات: شركة ← صنف ← وكالة ← قسم (طلبُ المالك ٢٠/١١)
--
-- المكتبةُ (0175) بنيت شركةً وصنفاً بنصّين حرّين. والمالكُ يبنيها الآن من جداول الموزّعين: «الشركة»
-- موزّعٌ (أوّلُها اليف هاوس)، وتحتها **الصنف** (قطط، كلاب…)، وتحته **الوكالة** (الماركة: INABA،
-- MOOCHIE…)، وتحتها **القسم** (طعام رطب، رمل…) — وعمودُ `section` القائم هو القسم نفسُه.
-- فعمودان جديدان نصّان حرّان كأخويهما — لا مفاتيحَ أجنبيّة ولا جداول، لنفس سبب 0175: التنظيمُ ملكُ
-- المشغّل ويُكتب من شاشته، والصفوفُ القديمة تبقى كما هي (صنفُها ووكالتُها فارغان ⇒ «بلا وكالة»).
--
-- لا سياسةَ جديدة: الكتابةُ للمشغّل والقراءةُ لكلّ داخلٍ كما هي (0175)، والمنحُ على الجدول تشمل
-- العمودين. والطولُ مقيَّد (١–٨٠) كي لا يصير الحقلُ مخزنَ نصٍّ بلا حدّ.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0282 (ولا تعتمد على ما بعد 0175).
-- ============================================================================

alter table public.image_library add column if not exists kind   text;
alter table public.image_library add column if not exists agency text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'image_library_kind_len' and conrelid = 'public.image_library'::regclass) then
    alter table public.image_library add constraint image_library_kind_len
      check (kind is null or char_length(btrim(kind)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'image_library_agency_len' and conrelid = 'public.image_library'::regclass) then
    alter table public.image_library add constraint image_library_agency_len
      check (agency is null or char_length(btrim(agency)) between 1 and 80);
  end if;
end $$;

comment on column public.image_library.kind   is 'الصنف (قطط، كلاب…) — المستوى الثاني تحت الشركة (0284).';
comment on column public.image_library.agency is 'الوكالة/الماركة — المستوى الثالث تحت الصنف (0284). القسمُ هو عمود section.';
