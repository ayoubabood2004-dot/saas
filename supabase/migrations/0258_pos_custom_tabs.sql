-- ============================================================================
-- ٠٢٥٨ — خاناتُ الطبيب بشاشة البيع: خانةٌ يصنعها لنفسه، يضع فيها المنتجاتِ والخدماتِ التي يبيعها كثيراً
--
-- طلبُ المالك (٤/١١): بجانب «المنتجات · الخدمات · الأدوية» خانةٌ خاصّةٌ بالطبيب، يختار ما فيها ويصمّمها: كلُّ بطاقةٍ
-- مربّعةٌ أو مستطيلة بقراره، وحجمُ البطاقات، وصورةُ المنتج إن كانت له صورة. قرارا المالك: **لكلّ طبيبٍ خاناتُه** (لا
-- يراها غيرُه)، وتُحفظ **بالخادم** فتتبعه لأيّ جهاز؛ وفيها **منتجاتٌ وخدمات**.
--
-- • الصفُّ لصاحبه وحده: السياسةُ `clinic_id = auth_clinic() and user_id = auth.uid()` للأوامر كلّها — لا مديرَ ولا PIN
--   يرى خاناتِ غيره (تفضيلٌ شخصيّ لا مالُ عيادة). والمصوّرُ مسيَّجٌ كباقي الجداول (photographer_fence_table).
-- • العناصرُ jsonb مرتّبةٌ كما رتّبها: {"k": "p"|"s", "id": "<معرّف المنتج أو الخدمة>", "shape": "sq"|"wide"}. لا مفتاحَ
--   أجنبيّ: منتجٌ طُوي بتوأمه أو حُذف يبقى عنصراً بلا صاحب — الشاشةُ تقوله بالمحرّر ولا تبيع منه، ولا يختفي العنصرُ
--   بصمت ولا يُمنع الحذفُ بسببه. والشكلُ يحرسه `_pos_tab_items_ok` بالقيد نفسه (لا شكلَ غريباً يصل الشاشة).
-- • `updated_at` يختمه محفّزٌ عند كلّ تعديل، والواجهةُ تكتب بشرطه (كما فُتح) — تعديلٌ من جهازٍ ثانٍ لا يُداس بصمت.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. لا يقرؤها شيءٌ قديم. تراجع:
--   drop table if exists public.pos_custom_tabs;
--   drop function if exists public.pos_custom_tabs_touch();
--   drop function if exists public._pos_tab_items_ok(jsonb);
-- ============================================================================

-- شكلُ العناصر: مصفوفةٌ (١٢٠ عنصراً على الأكثر) كلُّ عنصرٍ فيها {k, id, shape} بقيمٍ معروفة.
create or replace function public._pos_tab_items_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 120
     and coalesce((select bool_and(
           jsonb_typeof(e) = 'object'
           and e->>'k' in ('p', 's')
           and jsonb_typeof(e->'id') = 'string' and char_length(e->>'id') between 1 and 64
           and coalesce(e->>'shape', 'sq') in ('sq', 'wide'))
         from jsonb_array_elements(p) e), true)
$$;
-- القيدُ يناديها بصلاحية من يكتب: سحبُها من authenticated كان يُفشل كلَّ حفظ (42501). دالّةٌ صِرفةٌ بلا قراءة.
revoke all on function public._pos_tab_items_ok(jsonb) from public, anon;
grant execute on function public._pos_tab_items_ok(jsonb) to authenticated;

create table if not exists public.pos_custom_tabs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  user_id     uuid not null default auth.uid(),
  name        text not null,
  tile_size   text not null default 'md',
  show_images boolean not null default true,
  items       jsonb not null default '[]'::jsonb,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pos_custom_tabs_name check (char_length(btrim(name)) between 1 and 40),
  constraint pos_custom_tabs_size check (tile_size in ('sm', 'md', 'lg')),
  constraint pos_custom_tabs_items check (public._pos_tab_items_ok(items))
);
create index if not exists pos_custom_tabs_owner on public.pos_custom_tabs (clinic_id, user_id, sort);

-- updated_at يختمه الخادم (لا الجهاز): شرطُ الكتابة «كما فُتحت» يقارن به.
create or replace function public.pos_custom_tabs_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- الصفُّ لا ينتقل لغير صاحبه ولا لعيادةٍ أخرى بتعديل.
  new.clinic_id := old.clinic_id;
  new.user_id := old.user_id;
  return new;
end $$;
revoke all on function public.pos_custom_tabs_touch() from public, anon, authenticated;
drop trigger if exists pos_custom_tabs_touch on public.pos_custom_tabs;
create trigger pos_custom_tabs_touch before update on public.pos_custom_tabs
  for each row execute function public.pos_custom_tabs_touch();

alter table public.pos_custom_tabs enable row level security;
drop policy if exists pos_custom_tabs_own on public.pos_custom_tabs;
create policy pos_custom_tabs_own on public.pos_custom_tabs for all to authenticated
  using (clinic_id = (select auth_clinic()) and user_id = (select auth.uid()))
  with check (clinic_id = (select auth_clinic()) and user_id = (select auth.uid()));
revoke all on table public.pos_custom_tabs from anon;
grant select, insert, update, delete on table public.pos_custom_tabs to authenticated;
select public.photographer_fence_table('pos_custom_tabs');
